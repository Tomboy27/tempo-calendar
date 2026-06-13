import { supabase } from './supabase';
import type {
  Task, TaskPriority, TaskFrequency, TaskStatus,
  TaskList, TaskListInput,
  SchedulingProfile, SchedulingProfileInput,
  TaskDependency,
} from './types';

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

// ============================================================
// Task CRUD
// ============================================================

export interface TaskInput {
  title: string;
  description?: string;
  duration_minutes: number;
  due_date?: string;
  due_time?: string;
  deadline?: string;
  priority?: TaskPriority;
  frequency?: TaskFrequency;
  preferred_days?: number[];
  preferred_time_windows?: string[];
  is_busy_block?: boolean;
  can_split?: boolean;
  ignore_if_cannot_schedule?: boolean;
  is_habit?: boolean;
  is_recurring?: boolean;
  can_balance_across_days?: boolean;
  min_chunk_duration?: number;
  max_chunks?: number;
  scheduling_cutoff_weeks?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  blocked_days?: number[];
  blocked_times?: string[];
  scheduling_hours_override?: string;
  tags?: string[];
  color?: string;
  notes?: string;
  skip_days?: number[];
  // New fields
  auto_schedule?: boolean;
  is_locked?: boolean;
  list_id?: string | null;
  scheduling_profile_id?: string | null;
  sync_to_calendar?: boolean;
}

export type TaskUpdate = Omit<Partial<TaskInput>, 'google_event_id'> & {
  is_scheduled?: boolean;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  google_event_id?: string | null;
  completion_history?: string[] | null;
  // New fields
  completed_at?: string | null;
  status?: TaskStatus;
  last_scheduled_at?: string | null;
  last_missed_at?: string | null;
};

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Task[];
}

export async function fetchUnscheduledTasks(): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .select('*')
    .eq('is_scheduled', false)
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Task[];
}

export async function fetchAutoScheduledTasks(): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .select('*')
    .eq('status', 'active')
    .eq('auto_schedule', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateTaskSchedule(
  id: string,
  scheduledStart: string,
  scheduledEnd: string,
  googleEventId?: string | undefined
): Promise<Task> {
  const updates: TaskUpdate = {
    is_scheduled: true,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    last_scheduled_at: new Date().toISOString(),
  };

  if (googleEventId) {
    updates.google_event_id = googleEventId;
  }

  return updateTask(id, updates);
}

export async function markTaskComplete(id: string): Promise<Task> {
  return updateTask(id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    is_scheduled: false,
    scheduled_start: null,
    scheduled_end: null,
    completion_history: [],
  });
}

export async function markTaskMissed(id: string): Promise<Task> {
  return updateTask(id, {
    status: 'missed',
    last_missed_at: new Date().toISOString(),
  });
}

export async function unscheduleTask(id: string): Promise<Task> {
  return updateTask(id, {
    is_scheduled: false,
    scheduled_start: null,
    scheduled_end: null,
  });
}

export async function toggleTaskLock(id: string, isLocked: boolean): Promise<Task> {
  return updateTask(id, { is_locked: isLocked });
}

/**
 * Find tasks whose `google_event_id` matches one of the given IDs and
 * clear the link. Used by the two-way sync in `useGoogleCalendar` to
 * unlink tasks whose Google Calendar events were deleted externally.
 *
 * The task itself is NOT deleted and remains scheduled in our DB — we
 * only break the link to the now-gone Google event. Returns the
 * affected rows (id + title) so the caller can show a toast.
 */
export async function unlinkTasksFromGoogleEvents(
  googleEventIds: string[]
): Promise<{ id: string; title: string }[]> {
  if (googleEventIds.length === 0) return [];
  const { data, error } = await requireSupabase()
    .from('tasks')
    .update({ google_event_id: null })
    .in('google_event_id', googleEventIds)
    .select('id, title');
  if (error) throw error;
  return (data || []) as { id: string; title: string }[];
}

// ============================================================
// Task Lists CRUD
// ============================================================

export async function fetchTaskLists(): Promise<TaskList[]> {
  const { data, error } = await requireSupabase()
    .from('task_lists')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []) as TaskList[];
}

export async function createTaskList(input: TaskListInput): Promise<TaskList> {
  const { data, error } = await requireSupabase()
    .from('task_lists')
    .insert([{ name: input.name, color: input.color, sort_order: input.sort_order ?? 0 }])
    .select()
    .single();

  if (error) throw error;
  return data as TaskList;
}

export async function updateTaskList(id: string, updates: Partial<TaskListInput>): Promise<TaskList> {
  const { data, error } = await requireSupabase()
    .from('task_lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as TaskList;
}

export async function deleteTaskList(id: string): Promise<void> {
  // Tasks with this list_id will have list_id set to NULL via FK ON DELETE SET NULL
  const { error } = await requireSupabase()
    .from('task_lists')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// Scheduling Profiles CRUD
// ============================================================

export async function fetchSchedulingProfiles(): Promise<SchedulingProfile[]> {
  const { data, error } = await requireSupabase()
    .from('scheduling_profiles')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []) as SchedulingProfile[];
}

export async function createSchedulingProfile(input: SchedulingProfileInput): Promise<SchedulingProfile> {
  const { data, error } = await requireSupabase()
    .from('scheduling_profiles')
    .insert([{
      name: input.name,
      color: input.color,
      timezone: input.timezone,
      is_default: input.is_default ?? false,
      windows: input.windows,
    }])
    .select()
    .single();

  if (error) throw error;
  return data as SchedulingProfile;
}

export async function updateSchedulingProfile(
  id: string,
  updates: Partial<SchedulingProfileInput>
): Promise<SchedulingProfile> {
  const { data, error } = await requireSupabase()
    .from('scheduling_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as SchedulingProfile;
}

export async function deleteSchedulingProfile(id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('scheduling_profiles')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// Task Dependencies CRUD
// ============================================================

export async function fetchTaskDependencies(taskId: string): Promise<TaskDependency[]> {
  const { data, error } = await requireSupabase()
    .from('task_dependencies')
    .select('*')
    .eq('task_id', taskId);

  if (error) throw error;
  return (data || []) as TaskDependency[];
}

export async function fetchAllTaskDependencies(): Promise<TaskDependency[]> {
  const { data, error } = await requireSupabase()
    .from('task_dependencies')
    .select('*');

  if (error) throw error;
  return (data || []) as TaskDependency[];
}

export async function addDependency(taskId: string, dependsOnId: string): Promise<TaskDependency> {
  if (taskId === dependsOnId) {
    throw new Error('A task cannot depend on itself');
  }

  const { data, error } = await requireSupabase()
    .from('task_dependencies')
    .insert([{ task_id: taskId, depends_on_task_id: dependsOnId }])
    .select()
    .single();

  if (error) throw error;
  return data as TaskDependency;
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('task_dependencies')
    .delete()
    .eq('task_id', taskId)
    .eq('depends_on_task_id', dependsOnId);

  if (error) throw error;
}