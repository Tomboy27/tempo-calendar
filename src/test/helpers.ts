import type { Task, TaskPriority, TaskStatus, TaskFrequency, SchedulingProfile, TaskDependency, ScheduleWindow } from '../lib/types';
import type { CalendarEvent } from '../lib/google';

let counter = 0;
const nextId = (prefix = 't') => `${prefix}-${++counter}-${Date.now()}`;

/**
 * Reset the counter. Call in beforeEach to keep test IDs stable.
 */
export function resetIdCounter() {
  counter = 0;
}

interface MakeTaskOptions {
  id?: string;
  title?: string;
  duration_minutes?: number;
  priority?: TaskPriority;
  status?: TaskStatus;
  auto_schedule?: boolean;
  is_locked?: boolean;
  is_scheduled?: boolean;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  is_busy_block?: boolean;
  due_date?: string | null;
  deadline?: string | null;
  preferred_days?: number[] | null;
  preferred_time_windows?: string[] | null;
  blocked_days?: number[] | null;
  blocked_times?: string[] | null;
  scheduling_hours_override?: string | null;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  scheduling_cutoff_weeks?: number;
  scheduling_profile_id?: string | null;
  frequency?: TaskFrequency;
  color?: string;
}

const TASK_DEFAULTS: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
  title: 'Untitled',
  description: null,
  duration_minutes: 30,
  due_date: null,
  due_time: null,
  deadline: null,
  priority: 'NORMAL',
  frequency: 'once',
  preferred_days: null,
  preferred_time_windows: null,
  is_busy_block: false,
  can_split: false,
  ignore_if_cannot_schedule: false,
  is_habit: false,
  is_recurring: false,
  can_balance_across_days: false,
  min_chunk_duration: null,
  max_chunks: null,
  scheduling_cutoff_weeks: 8,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  blocked_days: null,
  blocked_times: null,
  scheduling_hours_override: null,
  tags: null,
  color: '#3b82f6',
  notes: null,
  skip_days: null,
  streak_count: 0,
  completion_history: null,
  google_event_id: null,
  google_calendar_id: null,
  is_scheduled: false,
  scheduled_start: null,
  scheduled_end: null,
  auto_schedule: true,
  is_locked: false,
  completed_at: null,
  status: 'active',
  list_id: null,
  scheduling_profile_id: null,
  sync_to_calendar: true,
  last_scheduled_at: null,
  last_missed_at: null,
};

export function makeTask(opts: MakeTaskOptions = {}): Task {
  const now = new Date().toISOString();
  return {
    id: opts.id ?? nextId('task'),
    created_at: now,
    updated_at: now,
    ...TASK_DEFAULTS,
    ...opts,
  } as Task;
}

interface MakeEventOptions {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  source?: 'google' | 'task';
  calendar?: string;
}

/**
 * Build a CalendarEvent with ISO strings.
 * By default creates a 1-hour event starting at the given date.
 */
export function makeEvent(opts: MakeEventOptions & { start?: Date; durationMinutes?: number } = {}): CalendarEvent {
  const start = opts.start ?? new Date('2026-03-09T09:00:00Z');
  const durationMs = (opts.durationMinutes ?? 60) * 60_000;
  const end = new Date(start.getTime() + durationMs);
  return {
    id: opts.id ?? nextId('evt'),
    title: opts.title ?? 'Event',
    description: '',
    startTime: opts.startTime ?? start.toISOString(),
    endTime: opts.endTime ?? end.toISOString(),
    calendar: opts.calendar ?? 'primary',
    source: opts.source ?? 'google',
  };
}

interface MakeWindowOptions {
  day: number; // 1=Mon..7=Sun
  start?: string;
  end?: string;
}

export function makeProfile(
  windows: MakeWindowOptions[] = [],
  overrides: Partial<SchedulingProfile> = {}
): SchedulingProfile {
  return {
    id: overrides.id ?? nextId('profile'),
    name: overrides.name ?? 'Test profile',
    color: overrides.color ?? '#3b82f6',
    timezone: overrides.timezone ?? 'UTC',
    is_default: overrides.is_default ?? false,
    windows: windows.map((w) => ({
      day: w.day,
      start: w.start ?? '09:00',
      end: w.end ?? '17:00',
    })) as ScheduleWindow[],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeDependency(taskId: string, dependsOnTaskId: string): TaskDependency {
  return {
    id: nextId('dep'),
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
    created_at: new Date().toISOString(),
  };
}

/**
 * Fixed test date: Monday, March 9, 2026 at 09:00:00 UTC.
 * Use this as "now" for deterministic time-based tests.
 */
export const TEST_NOW = new Date('2026-03-09T09:00:00Z');
export const TEST_TODAY_ISO = '2026-03-09';

/**
 * Build an ISO string for a date at a specific hour/minute on a given day.
 */
export function isoAt(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}
