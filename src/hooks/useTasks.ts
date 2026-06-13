import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, TaskList, SchedulingProfile } from '../lib/types';
import type { CalendarEvent } from '../lib/google';
import {
  fetchTasks, fetchUnscheduledTasks,
  createTask as createTaskApi, updateTask as updateTaskApi,
  deleteTask as deleteTaskApi, updateTaskSchedule, unscheduleTask as unscheduleTaskApi,
  markTaskComplete,
  fetchTaskLists, fetchSchedulingProfiles,
  unlinkTasksFromGoogleEvents,
} from '../lib/tasks';
import { scheduleMultipleTasks, pickBestSlot, findSlotsForTask } from '../lib/scheduler';
import { batchReschedule, detectConflicts, type RescheduleResult } from '../lib/rescheduler';
import type { TaskInput, TaskUpdate } from '../lib/tasks';
import type { SchedulingSlot } from '../lib/types';
import type { SchedulerConfig } from '../lib/scheduler';
import {
  syncTaskToGoogle, updateTaskInGoogle, removeTaskFromGoogle,
} from '../lib/sync';
import { supabase } from '../lib/supabase';

interface UseTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  syncErrors: string[];
  taskLists: TaskList[];
  schedulingProfiles: SchedulingProfile[];
  create: (input: TaskInput) => Promise<Task>;
  update: (id: string, updates: TaskUpdate) => Promise<Task>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  scheduleAll: (googleEvents: CalendarEvent[], config?: SchedulerConfig) => Promise<number>;
  scheduleOne: (task: Task, googleEvents: CalendarEvent[], config?: SchedulerConfig) => Promise<SchedulingSlot | null>;
  findSlots: (task: Task, googleEvents: CalendarEvent[], config?: SchedulerConfig) => Promise<SchedulingSlot[]>;
  unschedule: (id: string) => Promise<void>;
  clearSyncErrors: () => void;
  detectConflicts: (googleEvents: CalendarEvent[]) => { task: Task; event: CalendarEvent; overlapMinutes: number }[];
  reschedule: (googleEvents: CalendarEvent[], config?: SchedulerConfig) => Promise<RescheduleResult[]>;
  complete: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  /**
   * Clear `google_event_id` on any task whose value appears in the
   * input list. Used by two-way sync to unlink tasks whose Google
   * events were deleted externally. Returns the count + titles of
   * the tasks that were updated so the caller can show a toast.
   */
  unlinkFromGoogleEvents: (googleEventIds: string[]) => Promise<{ count: number; titles: string[] }>;
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [schedulingProfiles, setSchedulingProfiles] = useState<SchedulingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function load() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTasks([]);
        setTaskLists([]);
        setSchedulingProfiles([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const [data, lists, profiles] = await Promise.all([
          fetchTasks(),
          fetchTaskLists(),
          fetchSchedulingProfiles(),
        ]);
        if (!cancelled) {
          setTasks(data);
          setTaskLists(lists);
          setSchedulingProfiles(profiles);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load tasks'); setIsLoading(false); }
      }
    }
    load();

    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, lists, profiles] = await Promise.all([
        fetchTasks(),
        fetchTaskLists(),
        fetchSchedulingProfiles(),
      ]);
      if (mountedRef.current) {
        setTasks(data);
        setTaskLists(lists);
        setSchedulingProfiles(profiles);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) { setError(err instanceof Error ? err.message : 'Failed to load tasks'); setIsLoading(false); }
    }
  }, []);

  const recordSyncError = (msg: string) => {
    console.error('[useTasks] Sync error:', msg);
    setSyncErrors((prev) => [...prev, msg]);
  };

  const create = useCallback(async (input: TaskInput): Promise<Task> => {
    setError(null);
    const task = await createTaskApi(input);
    if (mountedRef.current) setTasks((prev) => [task, ...prev]);
    // Only sync to Google if the task was explicitly scheduled
    if (task.is_scheduled && task.scheduled_start && task.scheduled_end) {
      try {
        const result = await syncTaskToGoogle(task, task.scheduled_start, task.scheduled_end);
        if (result.success && result.googleEventId) {
          const updated = await updateTaskApi(task.id, { google_event_id: result.googleEventId });
          if (mountedRef.current) setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        } else if (result.error) recordSyncError(`"${task.title}": ${result.error}`);
      } catch (err) { recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google sync failed'}`); }
    }
    return task;
  }, []);

  const update = useCallback(async (id: string, updates: TaskUpdate): Promise<Task> => {
    setError(null);
    const task = await updateTaskApi(id, updates);
    if (mountedRef.current) setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    // Only sync to Google if the task is scheduled and has explicit times
    // Skip sync for unscheduled tasks. They should not create placeholder Google events.
    if (task.is_scheduled && task.scheduled_start && task.scheduled_end) {
      try {
        const result = await updateTaskInGoogle(task, task.scheduled_start, task.scheduled_end);
        if (!result.success && result.error) recordSyncError(`"${task.title}": ${result.error}`);
      } catch (err) { recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google sync failed'}`); }
    }
    // If task was unscheduled and had a Google event, remove it
    if (!task.is_scheduled && task.google_event_id) {
      try {
        const result = await removeTaskFromGoogle(task);
        if (result.success) {
          const cleared = await updateTaskApi(id, { google_event_id: null });
          if (mountedRef.current) setTasks((prev) => prev.map((t) => (t.id === id ? cleared : t)));
        }
      } catch (err) { recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google delete failed'}`); }
    }
    return task;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    setError(null);
    const task = tasks.find((t) => t.id === id);
    if (task) {
      try {
        const syncResult = await removeTaskFromGoogle(task);
        if (!syncResult.success && syncResult.error) recordSyncError(`"${task.title}": ${syncResult.error}`);
      } catch (err) { recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google delete failed'}`); }
    }
    await deleteTaskApi(id);
    if (mountedRef.current) setTasks((prev) => prev.filter((t) => t.id !== id));
  }, [tasks]);

  const scheduleOne = useCallback(async (
    task: Task, googleEvents: CalendarEvent[], config?: SchedulerConfig
  ): Promise<SchedulingSlot | null> => {
    const busySlots = googleEvents.filter((e) => e.source === 'google');
    const slot = pickBestSlot(findSlotsForTask(task, busySlots, config), task);
    if (slot) {
      const startISO = slot.start.toISOString(); const endISO = slot.end.toISOString();
      let googleEventId = task.google_event_id;
      if (googleEventId) {
        const syncResult = await updateTaskInGoogle(task, startISO, endISO);
        if (!syncResult.success) recordSyncError(`"${task.title}": ${syncResult.error || 'Google sync failed'}`);
      } else {
        const syncResult = await syncTaskToGoogle(task, startISO, endISO);
        googleEventId = syncResult.googleEventId ?? null;
        if (!syncResult.success) recordSyncError(`"${task.title}": ${syncResult.error || 'Google sync failed'}`);
      }
      if (googleEventId) await updateTaskSchedule(task.id, startISO, endISO, googleEventId ?? undefined);
      const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
    }
    return slot;
  }, []);

  const scheduleAll = useCallback(async (
    googleEvents: CalendarEvent[], config?: SchedulerConfig
  ): Promise<number> => {
    setIsLoading(true); setError(null);
    try {
      const unscheduled = await fetchUnscheduledTasks();
      const busySlots = googleEvents.filter((e) => e.source === 'google');
      const output = scheduleMultipleTasks(unscheduled, busySlots, config);
      let scheduledCount = 0;

      // Process scheduled tasks
      for (const { taskId, slot } of output.scheduled) {
        const task = unscheduled.find(t => t.id === taskId);
        if (!task) continue;
        try {
          const startISO = slot.start.toISOString();
          const endISO = slot.end.toISOString();
          let googleEventId = task.google_event_id;
          if (googleEventId) { await updateTaskInGoogle(task, startISO, endISO); }
          else {
            const sr = await syncTaskToGoogle(task, startISO, endISO);
            googleEventId = sr.googleEventId ?? null;
            if (!sr.success) recordSyncError(`"${task.title}": ${sr.error || 'Google sync failed'}`);
          }
          if (googleEventId) await updateTaskSchedule(task.id, startISO, endISO, googleEventId);
          scheduledCount++;
        } catch (err) { recordSyncError(`"${task?.title || taskId}": ${err instanceof Error ? err.message : 'Schedule save failed'}`); }
      }

      // Report dependency errors
      for (const err of output.dependencyErrors) {
        recordSyncError(`Dependency error for "${err.taskId}": ${err.message}`);
      }

      const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
      return scheduledCount;
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to schedule tasks');
      return 0;
    } finally { if (mountedRef.current) setIsLoading(false); }
  }, []);

  const findSlots = useCallback(async (
    task: Task, googleEvents: CalendarEvent[], config?: SchedulerConfig
  ): Promise<SchedulingSlot[]> => {
    return findSlotsForTask(task, googleEvents.filter((e) => e.source === 'google'), config);
  }, []);

  const unschedule = useCallback(async (id: string): Promise<void> => {
    const task = tasks.find((t) => t.id === id);
    if (task && task.google_event_id) {
      try { const sr = await removeTaskFromGoogle(task); if (!sr.success && sr.error) recordSyncError(`"${task.title}": ${sr.error}`); } catch (err) { recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google delete failed'}`); }
    }
    await unscheduleTaskApi(id);
    const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
  }, [tasks]);

  const getConflicts = useCallback((googleEvents: CalendarEvent[]) => {
    return detectConflicts(tasks.filter((t) => t.is_scheduled), googleEvents);
  }, [tasks]);

  const reschedule = useCallback(async (
    googleEvents: CalendarEvent[], config?: SchedulerConfig
  ): Promise<RescheduleResult[]> => {
    setIsLoading(true); setError(null);
    try {
      const scheduled = tasks.filter((t) => t.is_scheduled);
      const results = batchReschedule(scheduled, googleEvents, config);
      for (const result of results) {
        if (!result.success || !result.newStart || !result.newEnd) continue;
        try {
          const task = scheduled.find((t) => t.id === result.taskId);
          if (!task) continue;
          const newStart = result.newStart;
          const newEnd = result.newEnd;
          let googleEventId: string | null = task.google_event_id ?? null;
          if (googleEventId) {
            await updateTaskInGoogle({ ...task, scheduled_start: newStart, scheduled_end: newEnd }, newStart, newEnd);
          } else {
            const sr = await syncTaskToGoogle({ ...task, scheduled_start: newStart, scheduled_end: newEnd }, newStart, newEnd);
            googleEventId = sr.googleEventId ?? null;
            if (!sr.success) recordSyncError(`"${result.taskTitle}": ${sr.error || 'Google sync failed'}`);
          }
          await updateTaskSchedule(result.taskId, newStart, newEnd, googleEventId ?? undefined);
        } catch (err) { recordSyncError(`"${result.taskTitle}": ${err instanceof Error ? err.message : 'Reschedule failed'}`); }
      }
      const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
      return results;
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to reschedule');
      return [];
    } finally { if (mountedRef.current) setIsLoading(false); }
  }, [tasks]);

  const complete = useCallback(async (id: string): Promise<void> => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setError(null);
    try {
      // Remove from Google Calendar if synced
      if (task.google_event_id) {
        try {
          const sr = await removeTaskFromGoogle(task);
          if (!sr.success && sr.error) recordSyncError(`"${task.title}": ${sr.error}`);
        } catch (err) {
          recordSyncError(`"${task.title}": ${err instanceof Error ? err.message : 'Google delete failed'}`);
        }
      }
      await markTaskComplete(id);
      const data = await fetchTasks();
      if (mountedRef.current) setTasks(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to complete task');
    }
  }, [tasks]);

  const reopen = useCallback(async (id: string): Promise<void> => {
    setError(null);
    try {
      await updateTaskApi(id, { status: 'active', completed_at: null, is_scheduled: false, scheduled_start: null, scheduled_end: null, google_event_id: null });
      const data = await fetchTasks();
      if (mountedRef.current) setTasks(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to reopen task');
    }
  }, []);

  const unlinkFromGoogleEvents = useCallback(async (googleEventIds: string[]): Promise<{ count: number; titles: string[] }> => {
    if (googleEventIds.length === 0) return { count: 0, titles: [] };
    try {
      const rows = await unlinkTasksFromGoogleEvents(googleEventIds);
      if (mountedRef.current && rows.length > 0) {
        const ids = new Set(rows.map((r) => r.id));
        setTasks((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, google_event_id: null } : t)));
      }
      return { count: rows.length, titles: rows.map((r) => r.title) };
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to unlink tasks from Google');
      return { count: 0, titles: [] };
    }
  }, []);

  const clearSyncErrors = useCallback(() => setSyncErrors([]), []);

  return {
    tasks, isLoading, error, syncErrors,
    taskLists, schedulingProfiles,
    create, update, remove, refresh,
    scheduleAll, scheduleOne, findSlots, unschedule,
    clearSyncErrors, detectConflicts: getConflicts, reschedule,
    complete, reopen,
    unlinkFromGoogleEvents,
  };
}
