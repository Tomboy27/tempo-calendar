import {
  parseISO,
  addDays,
  addMinutes,
  subMinutes,
  differenceInMinutes,
  isBefore,
  isAfter,
  format,
  getDay,
  startOfDay,
} from 'date-fns';
import type { Task, SchedulingSlot, TaskDependency, SchedulingProfile, ScheduleWindow, SchedulingOutput } from './types';
import type { CalendarEvent } from './google';

export interface SchedulerConfig {
  /** Default working hours start (24h) */
  defaultStartHour: number;
  /** Default working hours end (24h) */
  defaultEndHour: number;
  /** Minimum gap between events in minutes */
  minGapMinutes: number;
  /** Consider weekends as available? */
  includeWeekends: boolean;
  /** Default scheduling horizon in weeks */
  defaultHorizonWeeks: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  defaultStartHour: 9,
  defaultEndHour: 17,
  minGapMinutes: 15,
  includeWeekends: false,
  defaultHorizonWeeks: 8,
};

// ============================================================
// Working Hours Resolution
// ============================================================

/**
 * Get working hours for a given day, respecting:
 * 1. Scheduling profile windows (if task has a profile)
 * 2. Task-level scheduling_hours_override
 * 3. Task-level preferred_time_windows
 * 4. Global config defaults
 */
function getWorkingHours(
  date: Date,
  task: Task,
  config: SchedulerConfig,
  profiles?: SchedulingProfile[]
): { startHour: number; endHour: number } {
  // 1. Check scheduling profile
  if (task.scheduling_profile_id && profiles) {
    const profile = profiles.find(p => p.id === task.scheduling_profile_id);
    if (profile && profile.windows) {
      const dayOfWeek = getDay(date); // 0=Sun, 6=Sat
      const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // convert to 1=Mon..7=Sun
      const window = profile.windows.find((w: ScheduleWindow) => w.day === isoDay);
      if (window) {
        return {
          startHour: parseInt(window.start.split(':')[0], 10),
          endHour: parseInt(window.end.split(':')[0], 10),
        };
      }
    }
  }

  // 2. Check task-level scheduling_hours_override
  if (task.scheduling_hours_override) {
    try {
      const override = JSON.parse(task.scheduling_hours_override);
      const dayOfWeek = getDay(date);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const hours = isWeekend ? override.weekend : override.weekday;
      if (hours && hours.length >= 2) {
        return {
          startHour: parseInt(hours[0], 10),
          endHour: parseInt(hours[1], 10),
        };
      }
    } catch { /* ignore invalid JSON */ }
  }

  // 3. Check preferred_time_windows
  if (task.preferred_time_windows && task.preferred_time_windows.length > 0) {
    try {
      const window = JSON.parse(task.preferred_time_windows[0]);
      return {
        startHour: parseInt(window.start.split(':')[0], 10),
        endHour: parseInt(window.end.split(':')[0], 10),
      };
    } catch { /* ignore */ }
  }

  // 4. Global config
  return {
    startHour: config.defaultStartHour,
    endHour: config.defaultEndHour,
  };
}

// ============================================================
// Overlap Detection
// ============================================================

/**
 * Check if a given time range overlaps with any busy events.
 * Uses strict interval overlap: start < eventEnd && end > eventStart.
 * Back-to-back events (start === eventEnd) are NOT overlapping.
 */
function isOverlapping(
  start: Date,
  end: Date,
  busySlots: CalendarEvent[]
): boolean {
  return busySlots.some((event) => {
    const eventStart = parseISO(event.startTime);
    const eventEnd = parseISO(event.endTime);
    return start < eventEnd && end > eventStart;
  });
}

// ============================================================
// Blocking Rules
// ============================================================

/**
 * Check if a given date/time is blocked by task-level blocking rules.
 */
function isInBlockedTime(date: Date, task: Task): boolean {
  const dayOfWeek = getDay(date);
  const taskDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

  if (task.blocked_days?.includes(taskDayOfWeek)) return true;

  if (task.preferred_days && task.preferred_days.length > 0) {
    if (!task.preferred_days.includes(taskDayOfWeek)) return true;
  }

  if (task.blocked_times && task.blocked_times.length > 0) {
    const timeStr = format(date, 'HH:mm');
    for (const bt of task.blocked_times) {
      try {
        const block = JSON.parse(bt);
        if (timeStr >= block.start && timeStr < block.end) return true;
      } catch { /* ignore */ }
    }
  }

  return false;
}

/**
 * Check if the date falls within preferred_time_windows for the task.
 */
function isInPreferredTimeWindow(date: Date, task: Task): boolean {
  if (!task.preferred_time_windows || task.preferred_time_windows.length === 0) return true;

  const timeStr = format(date, 'HH:mm');
  for (const tw of task.preferred_time_windows) {
    try {
      const window = JSON.parse(tw);
      if (timeStr >= window.start && timeStr < window.end) return true;
    } catch { /* ignore */ }
  }

  return false;
}

// ============================================================
// Slot Finding
// ============================================================

/**
 * Find available time slots for a given task on a specific date,
 * considering busy events, buffers, and scheduling hours.
 */
export function findSlotsForDate(
  date: Date,
  task: Task,
  busySlots: CalendarEvent[],
  config: SchedulerConfig = DEFAULT_CONFIG,
  profiles?: SchedulingProfile[]
): SchedulingSlot[] {
  if (isInBlockedTime(date, task)) return [];

  if (!config.includeWeekends) {
    const dayOfWeek = getDay(date);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const taskDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      if (!task.preferred_days?.includes(taskDay)) return [];
    }
  }

  const { startHour, endHour } = getWorkingHours(date, task, config, profiles);
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  const slots: SchedulingSlot[] = [];
  let cursor = new Date(dayStart);

  const dayBusySlots = busySlots.filter((event) => {
    const eventStart = parseISO(event.startTime);
    return format(eventStart, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
  }).sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

  while (cursor < dayEnd) {
    const slotEnd = addMinutes(cursor, task.duration_minutes);
    if (slotEnd > dayEnd) break;

    if (!isInPreferredTimeWindow(cursor, task)) {
      cursor = addMinutes(cursor, config.minGapMinutes);
      continue;
    }

    if (!isOverlapping(cursor, slotEnd, dayBusySlots)) {
      const bufferedStart = subMinutes(cursor, task.buffer_before_minutes);
      const bufferedEnd = addMinutes(slotEnd, task.buffer_after_minutes);

      // Ensure buffer doesn't go outside working hours
      const bufferInBounds = bufferedStart >= dayStart && bufferedEnd <= addMinutes(dayEnd, 1);
      if (!isOverlapping(bufferedStart, bufferedEnd, dayBusySlots) && bufferInBounds) {
        slots.push({
          start: new Date(cursor),
          end: new Date(slotEnd),
          durationMinutes: task.duration_minutes,
        });
      }
    }

    cursor = addMinutes(cursor, config.minGapMinutes);
  }

  return slots;
}

/**
 * Find all available slots across multiple days up to the scheduling horizon.
 */
export function findSlotsForTask(
  task: Task,
  busySlots: CalendarEvent[],
  config: SchedulerConfig = DEFAULT_CONFIG,
  profiles?: SchedulingProfile[]
): SchedulingSlot[] {
  const allSlots: SchedulingSlot[] = [];
  const maxDays = Math.min(task.scheduling_cutoff_weeks, config.defaultHorizonWeeks) * 7;
  const startDate = startOfDay(new Date());

  const deadline = task.deadline ? parseISO(task.deadline) : null;
  const dueDate = task.due_date ? parseISO(task.due_date) : null;

  const deadlineDays = deadline
    ? Math.floor(differenceInMinutes(deadline, startDate) / (24 * 60))
    : Infinity;
  const dueDays = dueDate && !deadline
    ? Math.floor(differenceInMinutes(dueDate, startDate) / (24 * 60))
    : Infinity;
  const upperDays = Math.min(maxDays, deadlineDays, dueDays);
  const upperBound = addDays(startDate, upperDays);

  let currentDate = new Date(startDate);

  while (currentDate <= upperBound) {
    const dateSlots = findSlotsForDate(currentDate, task, busySlots, config, profiles);
    allSlots.push(...dateSlots);
    currentDate = addDays(currentDate, 1);
  }

  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return allSlots;
}

/**
 * Pick the best slot from available slots based on task preferences.
 */
export function pickBestSlot(slots: SchedulingSlot[], task: Task): SchedulingSlot | null {
  if (slots.length === 0) return null;

  if (task.priority === 'ASAP') return slots[0];

  if (task.preferred_time_windows && task.preferred_time_windows.length > 0) {
    for (const tw of task.preferred_time_windows) {
      try {
        const window = JSON.parse(tw);
        const windowStartMinutes = parseInt(window.start.split(':')[0]) * 60 +
          parseInt(window.start.split(':')[1] || '0', 10);
        const windowEndMinutes = parseInt(window.end.split(':')[0]) * 60 +
          parseInt(window.end.split(':')[1] || '0', 10);

        const preferredSlot = slots.find((slot) => {
          const slotMinutes = slot.start.getHours() * 60 + slot.start.getMinutes();
          return slotMinutes >= windowStartMinutes && slotMinutes < windowEndMinutes;
        });

        if (preferredSlot) return preferredSlot;
      } catch { /* ignore */ }
    }
  }

  return slots[0];
}

// ============================================================
// Dependency-Aware Ordering
// ============================================================

/**
 * Detect dependency cycles using DFS. Returns the cycle path if found.
 */
export function detectDependencyCycles(
  tasks: Task[],
  dependencies: TaskDependency[]
): Array<{ taskId: string; cyclePath: string[] }> {
  const errors: Array<{ taskId: string; cyclePath: string[] }> = [];
  const taskIds = new Set(tasks.map(t => t.id));
  const depMap = new Map<string, string[]>();

  for (const dep of dependencies) {
    if (!taskIds.has(dep.task_id) || !taskIds.has(dep.depends_on_task_id)) continue;
    const existing = depMap.get(dep.task_id) || [];
    existing.push(dep.depends_on_task_id);
    depMap.set(dep.task_id, existing);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart);
      cycle.push(node);
      errors.push({ taskId: node, cyclePath: cycle });
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of (depMap.get(node) || [])) {
      dfs(neighbor, path);
    }

    path.pop();
    inStack.delete(node);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }

  return errors;
}

/**
 * Sort tasks respecting dependency order (topological sort).
 * Tasks with no dependencies come first.
 */
export function topologicalSort(
  tasks: Task[],
  dependencies: TaskDependency[]
): Task[] {
  const taskIds = new Set(tasks.map(t => t.id));
  const depMap = new Map<string, Set<string>>();

  for (const task of tasks) {
    depMap.set(task.id, new Set());
  }

  for (const dep of dependencies) {
    if (taskIds.has(dep.task_id) && taskIds.has(dep.depends_on_task_id)) {
      depMap.get(dep.task_id)!.add(dep.depends_on_task_id);
    }
  }

  const sorted: Task[] = [];
  const visited = new Set<string>();

  function visit(node: string) {
    if (visited.has(node)) return;
    visited.add(node);
    for (const dep of (depMap.get(node) || [])) {
      visit(dep);
    }
    sorted.push(tasks.find(t => t.id === node)!);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return sorted;
}

/**
 * Get all dependencies that must be completed before a task can start.
 */
export function getBlockingDependencies(
  taskId: string,
  dependencies: TaskDependency[]
): string[] {
  return dependencies
    .filter(d => d.task_id === taskId)
    .map(d => d.depends_on_task_id);
}

// ============================================================
// Task Filtering
// ============================================================

/**
 * Filter tasks that are eligible for auto-scheduling.
 */
export function getAutoSchedulableTasks(tasks: Task[]): Task[] {
  return tasks.filter(t =>
    t.status === 'active' &&
    t.auto_schedule === true &&
    !t.is_busy_block
  );
}

/**
 * Get locked tasks as busy intervals (fixed blocks).
 */
export function getLockedTasksAsBusySlots(tasks: Task[]): CalendarEvent[] {
  return tasks
    .filter(t => t.is_locked && t.is_scheduled && t.scheduled_start && t.scheduled_end)
    .map(t => ({
      id: `locked-${t.id}`,
      title: t.title,
      description: t.description || '',
      source: 'task' as const,
      calendar: 'locked',
      startTime: t.scheduled_start!,
      endTime: t.scheduled_end!,
      color: t.color,
    }));
}

/**
 * Detect tasks that are missed (scheduled end is in the past and not completed).
 */
export function detectMissedTasks(tasks: Task[]): Task[] {
  const now = new Date();
  return tasks.filter(t =>
    t.status === 'active' &&
    t.is_scheduled &&
    t.scheduled_end &&
    isAfter(now, parseISO(t.scheduled_end))
  );
}

// ============================================================
// Main Scheduling Functions
// ============================================================

/**
 * Schedule a single task, finding the best available slot.
 */
export function scheduleTask(
  task: Task,
  busySlots: CalendarEvent[],
  config: SchedulerConfig = DEFAULT_CONFIG,
  profiles?: SchedulingProfile[]
): SchedulingSlot | null {
  const slots = findSlotsForTask(task, busySlots, config, profiles);
  if (slots.length === 0) return null;
  return pickBestSlot(slots, task);
}

/**
 * Priority ordering constant.
 */
export const PRIORITY_ORDER: Record<string, number> = {
  ASAP: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/**
 * Sort tasks by: dependency order first, then priority, then deadline, then created date.
 */
export function sortTasksForScheduling(
  tasks: Task[],
  dependencies: TaskDependency[]
): Task[] {
  // First get dependency order
  const depOrdered = topologicalSort(tasks, dependencies);

  // Then sort within same dependency level by priority → deadline → created_at
  return depOrdered;
}

/**
 * Schedule multiple tasks with full dependency awareness.
 * Returns structured SchedulingOutput.
 */
export function scheduleMultipleTasks(
  tasks: Task[],
  busySlots: CalendarEvent[],
  config: SchedulerConfig = DEFAULT_CONFIG,
  dependencies: TaskDependency[] = [],
  profiles?: SchedulingProfile[]
): SchedulingOutput {
  const output: SchedulingOutput = {
    scheduled: [],
    unscheduled: [],
    conflicts: [],
    dependencyErrors: [],
    missedRecalculated: [],
    lockedSkipped: [],
  };

  // 1. Detect dependency cycles
  const cycles = detectDependencyCycles(tasks, dependencies);
  if (cycles.length > 0) {
    output.dependencyErrors = cycles.map(c => ({
      taskId: c.taskId,
      message: `Dependency cycle detected`,
      cyclePath: c.cyclePath,
    }));
    // Remove tasks involved in cycles from scheduling
    const cycleTaskIds = new Set(cycles.map(c => c.taskId));
    tasks = tasks.filter(t => !cycleTaskIds.has(t.id));
  }

  // 2. Add locked tasks as busy slots
  const lockedBusy = getLockedTasksAsBusySlots(tasks);
  const allBusy = [...busySlots, ...lockedBusy];

  // 3. Sort by dependency order, then priority
  const sortedTasks = sortTasksForScheduling(tasks, dependencies);

  // 4. Filter to auto-schedulable tasks
  const schedulable = getAutoSchedulableTasks(sortedTasks);

  // 5. Schedule each task in order
  let accumulatedBusy = [...allBusy];

  for (const task of schedulable) {
    // Skip locked tasks that are already scheduled
    if (task.is_locked && task.is_scheduled) {
      output.lockedSkipped.push(task.id);
      continue;
    }

    // Check if all dependencies are satisfied (scheduled)
    const blocking = getBlockingDependencies(task.id, dependencies);
    const unsatisfiedDeps = blocking.filter(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && !depTask.is_scheduled;
    });

    if (unsatisfiedDeps.length > 0) {
      output.unscheduled.push({
        taskId: task.id,
        reason: `Blocked by ${unsatisfiedDeps.length} unsatisfied dependency`,
      });
      continue;
    }

    const slot = scheduleTask(task, accumulatedBusy, config, profiles);

    if (slot) {
      output.scheduled.push({ taskId: task.id, slot });

      // Add to accumulated busy for subsequent tasks
      accumulatedBusy.push({
        id: `scheduled-${task.id}`,
        title: task.title,
        description: task.description || '',
        source: 'task',
        calendar: 'scheduled',
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        color: task.color,
      });
    } else {
      output.unscheduled.push({
        taskId: task.id,
        reason: 'No available time slot found',
      });
    }
  }

  return output;
}

/**
 * Recalculate schedule for missed, unscheduled, or flexible tasks.
 * Preserves locked blocks. Never moves external events.
 */
export function recalculateSchedule(
  tasks: Task[],
  busySlots: CalendarEvent[],
  config: SchedulerConfig = DEFAULT_CONFIG,
  dependencies: TaskDependency[] = [],
  profiles?: SchedulingProfile[]
): SchedulingOutput {
  // Find tasks that need recalculation:
  // - Missed tasks
  // - Unscheduled active tasks with auto_schedule=true
  // - Flexible scheduled tasks (not locked) — these can be moved
  const now = new Date();
  const needsRecalc = tasks.filter(t =>
    t.status === 'active' &&
    t.auto_schedule &&
    !t.is_busy_block && (
      // Missed tasks
      (t.is_scheduled && t.scheduled_end && isAfter(now, parseISO(t.scheduled_end))) ||
      // Unscheduled tasks
      (!t.is_scheduled) ||
      // Flexible scheduled tasks (not locked)
      (t.is_scheduled && !t.is_locked)
    )
  );

  // Clear scheduling for flexible tasks (but not locked ones)
  for (const task of needsRecalc) {
    if (task.is_scheduled && !task.is_locked) {
      task.is_scheduled = false;
      task.scheduled_start = null;
      task.scheduled_end = null;
    }
  }

  return scheduleMultipleTasks(needsRecalc, busySlots, config, dependencies, profiles);
}