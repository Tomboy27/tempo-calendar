export type TaskPriority = 'ASAP' | 'HIGH' | 'NORMAL' | 'LOW';
export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'custom';
export type TaskStatus = 'active' | 'completed' | 'missed' | 'skipped';

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;

  // Basic
  title: string;
  description: string | null;
  duration_minutes: number;

  // Due/deadline
  due_date: string | null;
  due_time: string | null;
  deadline: string | null;

  // Priority
  priority: TaskPriority;

  // Frequency
  frequency: TaskFrequency;
  preferred_days: number[] | null; // 1=Mon..7=Sun

  // Time preferences
  preferred_time_windows: string[] | null; // ['{"start":"09:00","end":"12:00"}']

  // Behavior
  is_busy_block: boolean;
  can_split: boolean;
  ignore_if_cannot_schedule: boolean;
  is_habit: boolean;
  is_recurring: boolean;
  can_balance_across_days: boolean;

  // Chunking
  min_chunk_duration: number | null;
  max_chunks: number | null;

  // Scheduling
  scheduling_cutoff_weeks: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;

  // Blocked times
  blocked_days: number[] | null;
  blocked_times: string[] | null;

  // Hours override
  scheduling_hours_override: string | null;

  // Appearance
  tags: string[] | null;
  color: string;
  notes: string | null;

  // Skip days
  skip_days: number[] | null;

  // Habit tracking
  streak_count: number;
  completion_history: string[] | null;

  // Google sync
  google_event_id: string | null;
  google_calendar_id: string | null;

  // Scheduling status
  is_scheduled: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;

  // === New fields (Phase 1) ===

  // Auto-scheduling: scheduler ignores tasks where auto_schedule = false
  auto_schedule: boolean;

  // Lock toggle: locked tasks are fixed busy blocks, never moved
  is_locked: boolean;

  // Completion tracking
  completed_at: string | null;

  // Task status
  status: TaskStatus;

  // Foreign keys
  list_id: string | null;
  scheduling_profile_id: string | null;

  // Whether to sync scheduled task back to external calendar
  sync_to_calendar: boolean;

  // Tracking timestamps
  last_scheduled_at: string | null;
  last_missed_at: string | null;
}

export interface TimeWindow {
  start: string; // "09:00"
  end: string;   // "12:00"
}

export interface SchedulingSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface SchedulingResult {
  taskId: string;
  scheduled: boolean;
  slots: SchedulingSlot[];
  conflicts: string[];
}

// ============================================================
// Task Lists
// ============================================================

export interface TaskList {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskListInput {
  name: string;
  color?: string;
  sort_order?: number;
}

// ============================================================
// Scheduling Profiles
// ============================================================

export interface ScheduleWindow {
  day: number; // 1=Mon..7=Sun (ISO weekday)
  start: string; // "09:00"
  end: string; // "17:00"
}

export interface SchedulingProfile {
  id: string;
  name: string;
  color: string;
  timezone: string;
  is_default: boolean;
  windows: ScheduleWindow[];
  created_at: string;
  updated_at: string;
}

export interface SchedulingProfileInput {
  name: string;
  color?: string;
  timezone?: string;
  is_default?: boolean;
  windows: ScheduleWindow[];
}

// ============================================================
// Task Dependencies
// ============================================================

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

// ============================================================
// Subtasks
// ============================================================

/**
 * A single sub-step of a task. Subtasks are checkable (boolean
 * `completed` field), ordered (`sort_order`), and cascade-deleted with
 * their parent task.
 */
export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubtaskInput {
  task_id: string;
  title: string;
  sort_order?: number;
}

export type SubtaskUpdate = {
  title?: string;
  completed?: boolean;
  sort_order?: number;
};

// ============================================================
// Calendar Provider Abstraction
// ============================================================

export type CalendarProviderId = 'google' | 'outlook' | 'icloud';

export interface CalendarAccount {
  id: string;
  provider: CalendarProviderId;
  email: string;
  is_active: boolean;
}

export interface CalendarProviderInterface {
  readonly id: CalendarProviderId;
  readonly label: string;
  loadApi(): Promise<void>;
  connect(): Promise<string>;
  disconnect(): void;
  isConnected(): boolean;
  fetchEvents(timeMin?: string, timeMax?: string): Promise<Record<string, unknown>[]>;
  createEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateEvent(eventId: string, event: Record<string, unknown>): Promise<Record<string, unknown>>;
  deleteEvent(eventId: string): Promise<void>;
}

// ============================================================
// Structured Scheduling Output (Phase 2)
// ============================================================

export interface SchedulingOutput {
  scheduled: Array<{ taskId: string; slot: SchedulingSlot }>;
  unscheduled: Array<{ taskId: string; reason: string }>;
  conflicts: Array<{ taskId: string; eventId: string; overlapMinutes: number }>;
  dependencyErrors: Array<{ taskId: string; message: string; cyclePath?: string[] }>;
  missedRecalculated: Array<{ taskId: string; oldStart: string | null; newSlot: SchedulingSlot }>;
  lockedSkipped: string[]; // task IDs
}