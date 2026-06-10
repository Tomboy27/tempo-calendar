import type { Task, SchedulingSlot } from './types';
import type { CalendarEvent } from './google';
import { parseISO, differenceInMinutes } from 'date-fns';
import { findSlotsForTask, pickBestSlot } from './scheduler';
import type { SchedulerConfig } from './scheduler';

export interface RescheduleResult {
  taskId: string;
  taskTitle: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string | null;
  newEnd: string | null;
  reason: string;
  success: boolean;
}

/**
 * Detect conflicts between scheduled tasks and Google Calendar events.
 * Returns an array of conflicts with both the task and event info.
 */
export function detectConflicts(
  scheduledTasks: Task[],
  googleEvents: CalendarEvent[]
): Array<{ task: Task; event: CalendarEvent; overlapMinutes: number }> {
  const conflicts: Array<{ task: Task; event: CalendarEvent; overlapMinutes: number }> = [];

  for (const task of scheduledTasks) {
    if (!task.scheduled_start || !task.scheduled_end) continue;
    if (task.is_busy_block) continue; // Busy blocks are not movable

    const taskStart = parseISO(task.scheduled_start);
    const taskEnd = parseISO(task.scheduled_end);

    for (const event of googleEvents) {
      if (event.source !== 'google') continue;

      const eventStart = parseISO(event.startTime);
      const eventEnd = parseISO(event.endTime);

      // Check for overlap
      const overlapStart = taskStart > eventStart ? taskStart : eventStart;
      const overlapEnd = taskEnd < eventEnd ? taskEnd : eventEnd;

      if (overlapStart < overlapEnd) {
        const overlapMinutes = differenceInMinutes(overlapEnd, overlapStart);
        if (overlapMinutes > 0) {
          conflicts.push({ task, event, overlapMinutes });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Reschedule a single task that conflicts with a Google Calendar event.
 * Returns the new slot if found, or null if no slot available.
 */
export function findRescheduleSlot(
  task: Task,
  busySlots: CalendarEvent[],
  _excludeTaskId?: string,
  config: SchedulerConfig = { defaultStartHour: 9, defaultEndHour: 17, minGapMinutes: 15, includeWeekends: false, defaultHorizonWeeks: 8 }
): SchedulingSlot | null {
  // Get available slots considering the busy calendar
  const slots = findSlotsForTask(task, busySlots, config);
  return pickBestSlot(slots, task);
}

/**
 * Batch reschedule: move all conflicting tasks to new slots.
 * Returns a list of reschedule results.
 *
 * Priority order:
 *   1. Find all conflicts
 *   2. Sort tasks by priority (ASAP > HIGH > NORMAL > LOW)
 *   3. Try to reschedule each task; if a rescheduled task overlaps another,
 *      chain the displacement
 */
export function batchReschedule(
  scheduledTasks: Task[],
  googleEvents: CalendarEvent[],
  config: SchedulerConfig = { defaultStartHour: 9, defaultEndHour: 17, minGapMinutes: 15, includeWeekends: false, defaultHorizonWeeks: 8 }
): RescheduleResult[] {
  const results: RescheduleResult[] = [];
  const priorityOrder: Record<string, number> = { ASAP: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

  // Build a working copy of busy slots (starts with Google events)
  let currentBusy = [...googleEvents];

  // Sort tasks: highest priority first
  const movableTasks = scheduledTasks
    .filter((t) => !t.is_busy_block && t.scheduled_start && t.scheduled_end)
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      return pa - pb;
    });

  for (const task of movableTasks) {
    // Check if current slot still conflicts
    const conflicts = detectConflicts([task], currentBusy);
    if (conflicts.length === 0) continue; // No conflict, skip

    // Try to find a new slot
    const newSlot = findRescheduleSlot(task, currentBusy, task.id, config);

    if (newSlot) {
      results.push({
        taskId: task.id,
        taskTitle: task.title,
        oldStart: task.scheduled_start,
        oldEnd: task.scheduled_end,
        newStart: newSlot.start.toISOString(),
        newEnd: newSlot.end.toISOString(),
        reason: `Conflicts with "${conflicts[0].event.title}" (${conflicts[0].overlapMinutes}min overlap)`,
        success: true,
      });

      // Add the new slot as a busy block for subsequent tasks
      currentBusy.push({
        id: `rescheduled-${task.id}`,
        title: task.title,
        description: task.description || '',
        source: 'task',
        calendar: 'scheduled',
        startTime: newSlot.start.toISOString(),
        endTime: newSlot.end.toISOString(),
        color: task.color,
      });
    } else {
      results.push({
        taskId: task.id,
        taskTitle: task.title,
        oldStart: task.scheduled_start,
        oldEnd: task.scheduled_end,
        newStart: null,
        newEnd: null,
        reason: `Cannot find alternative slot for "${task.title}" after conflict with "${conflicts[0].event.title}"`,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Detect if two time ranges overlap.
 */
export function timeRangesOverlap(
  start1: Date, end1: Date,
  start2: Date, end2: Date
): boolean {
  return start1 < end2 && start2 < end1;
}