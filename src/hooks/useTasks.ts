import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, SchedulingOutput } from '../lib/types';
import type { CalendarEvent } from '../lib/google';
import {
  fetchTasks, fetchUnscheduledTasks,
  createTask as createTaskApi, updateTask as updateTaskApi,
  deleteTask as deleteTaskApi, updateTaskSchedule, unscheduleTask as unscheduleTaskApi,
} from '../lib/tasks';
import { scheduleMultipleTasks, pickBestSlot, findSlotsForTask } from '../lib/scheduler';
import { batchReschedule, detectConflicts, type RescheduleResult } from '../lib/rescheduler';
import type { TaskInput, TaskUpdate } from '../lib/tasks';
import type { SchedulingSlot } from '../lib/types';
import type { SchedulerConfig } from '../lib/scheduler';
import {
  syncTaskToGoogle, updateTaskInGoogle, removeTaskFromGoogle,
} from '../lib/sync';

interface UseTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  syncErrors: string[];
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
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchTasks();
        if (!cancelled) { setTasks(data); setIsLoading(false); }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || 'Failed to load tasks'); setIsLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTasks();
      if (mountedRef.current) { setTasks(data); setIsLoading(false); }
    } catch (err: any) {
      if (mountedRef.current) { setError(err?.message || 'Failed to load tasks'); setIsLoading(false); }
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
      } catch (err: any) { recordSyncError(`"${task.title}": ${err?.message || 'Google sync failed'}`); }
    }
    return task;
  }, []);

  const update = useCallback(async (id: string, updates: TaskUpdate): Promise<Task> => {
    setError(null);
    const task = await updateTaskApi(id, updates);
    if (mountedRef.current) setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    // Only sync to Google if the task is scheduled and has explicit times
    // Skip sync for unscheduled tasks — they should not create placeholder Google events
    if (task.is_scheduled && task.scheduled_start && task.scheduled_end) {
      try {
        const result = await updateTaskInGoogle(task, task.scheduled_start, task.scheduled_end);
        if (!result.success && result.error) recordSyncError(`"${task.title}": ${result.error}`);
      } catch (err: any) { recordSyncError(`"${task.title}": ${err?.message || 'Google sync failed'}`); }
    }
    // If task was unscheduled and had a Google event, remove it
    if (!task.is_scheduled && task.google_event_id) {
      try {
        const result = await removeTaskFromGoogle(task);
        if (result.success) {
          const cleared = await updateTaskApi(id, { google_event_id: null });
          if (mountedRef.current) setTasks((prev) => prev.map((t) => (t.id === id ? cleared : t)));
        }
      } catch (err: any) { recordSyncError(`"${task.title}": ${err?.message || 'Google delete failed'}`); }
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
      } catch (err: any) { recordSyncError(`"${task.title}": ${err?.message || 'Google delete failed'}`); }
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
        } catch (err: any) { recordSyncError(`"${task?.title || taskId}": ${err?.message || 'Schedule save failed'}`); }
      }

      // Report dependency errors
      for (const err of output.dependencyErrors) {
        recordSyncError(`Dependency error for "${err.taskId}": ${err.message}`);
      }

      const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
      return scheduledCount;
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Failed to schedule tasks');
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
      try { const sr = await removeTaskFromGoogle(task); if (!sr.success && sr.error) recordSyncError(`"${task.title}": ${sr.error}`); } catch (err: any) { recordSyncError(`"${task.title}": ${err?.message || 'Google delete failed'}`); }
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
        } catch (err: any) { recordSyncError(`"${result.taskTitle}": ${err?.message || 'Reschedule failed'}`); }
      }
      const data = await fetchTasks(); if (mountedRef.current) setTasks(data);
      return results;
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Failed to reschedule');
      return [];
    } finally { if (mountedRef.current) setIsLoading(false); }
  }, [tasks]);

  const clearSyncErrors = useCallback(() => setSyncErrors([]), []);

  return {
    tasks, isLoading, error, syncErrors,
    create, update, remove, refresh,
    scheduleAll, scheduleOne, findSlots, unschedule,
    clearSyncErrors, detectConflicts: getConflicts, reschedule,
  };
}