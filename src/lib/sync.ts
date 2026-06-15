import type { Task } from './types';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getAccessToken,
} from './google';

export interface SyncResult {
  success: boolean;
  googleEventId?: string;
  error?: string;
}

const RECURRENCE_DAY_MAP: Record<number, string> = {
  1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU',
};

/**
 * Build a Google Calendar RRULE from the task's recurrence settings.
 *
 * Supports daily and weekly frequencies. Respects the task's
 * `recurrence_end` (preferred) or `due_date` (fallback) as the UNTIL
 * boundary, capped at a reasonable maximum of 2 years to prevent
 * accidentally creating infinite series.
 */
function buildRecurrence(task: Task): string[] | undefined {
  if (task.frequency === 'once') return undefined;
  if (!task.preferred_days || task.preferred_days.length === 0) return undefined;

  const days = task.preferred_days.slice().sort()
    .map((d) => RECURRENCE_DAY_MAP[d]).filter(Boolean);
  if (days.length === 0) return undefined;

  // Determine frequency: daily tasks use FREQ=DAILY; weekly uses FREQ=WEEKLY
  const freq = task.frequency === 'daily' ? 'DAILY' : 'WEEKLY';

  // Build the RRULE parts
  const parts: string[] = [`RRULE:FREQ=${freq}`];
  // BYDAY is valid for both DAILY and WEEKLY in Google Calendar.
  // DAILY + BYDAY means "every day, but only on these days".
  // WEEKLY + BYDAY means "every week on these days".
  parts[0] += `;BYDAY=${days.join(',')}`;

  // UNTIL: use recurrence_end (preferred), then due_date (fallback).
  // If neither is set, cap at 2 years from the scheduled start.
  let untilDate: Date;
  if (task.recurrence_end) {
    untilDate = new Date(task.recurrence_end + 'T23:59:59Z');
  } else if (task.due_date) {
    untilDate = new Date(task.due_date + 'T23:59:59Z');
  } else {
    untilDate = new Date();
    untilDate.setFullYear(untilDate.getFullYear() + 2);
  }
  // Cap at 2 years from now to prevent absurd series
  const maxUntil = new Date();
  maxUntil.setFullYear(maxUntil.getFullYear() + 2);
  if (untilDate > maxUntil) {
    untilDate = maxUntil;
  }

  const untilStr = untilDate.toISOString().replace(/[-:]|\.\d{3}/g, '');
  parts[0] += `;UNTIL=${untilStr}`;

  return parts;
}

function buildEventPayload(task: Task, startISO: string, endISO: string) {
  return {
    summary: task.title,
    description: task.description || task.notes || undefined,
    start: { dateTime: startISO, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endISO, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    colorId: '9', // Blue/Indigo for tasks
    ...(buildRecurrence(task) ? { recurrence: buildRecurrence(task)! } : {}),
  };
}

/**
 * Return the target Google Calendar ID for a task.
 * Uses the task's own `google_calendar_id` if set, otherwise falls back
 * to 'primary'.
 */
function getTargetCalendarId(task: Task): string {
  return task.google_calendar_id || 'primary';
}

export async function syncTaskToGoogle(
  task: Task, scheduledStart: string, scheduledEnd: string
): Promise<SyncResult> {
  // Creating Google event for task
  if (!getAccessToken()) {
    return { success: false, error: 'Not connected to Google Calendar' };
  }
  const calendarId = getTargetCalendarId(task);
  try {
    const ev = await createCalendarEvent(buildEventPayload(task, scheduledStart, scheduledEnd), calendarId);
    // Google event created successfully
    return { success: true, googleEventId: ev.id };
  } catch (err: unknown) {
    // Failed to create Google event — error surfaced via return value
    const message = err instanceof Error ? err.message : 'Failed to create Google event';
    return { success: false, error: message };
  }
}

export async function updateTaskInGoogle(
  task: Task, scheduledStart: string, scheduledEnd: string
): Promise<SyncResult> {
  // Updating Google event for task
  if (!getAccessToken()) {
    return { success: false, error: 'Not connected to Google Calendar' };
  }
  const calendarId = getTargetCalendarId(task);
  if (!task.google_event_id) {
    return syncTaskToGoogle(task, scheduledStart, scheduledEnd);
  }
  try {
    await updateCalendarEvent(task.google_event_id, buildEventPayload(task, scheduledStart, scheduledEnd), calendarId);
    // Google event updated successfully
    return { success: true, googleEventId: task.google_event_id };
  } catch (err: unknown) {
    // Failed to update Google event — error surfaced via return value
    const message = err instanceof Error ? err.message : 'Failed to update Google event';
    return { success: false, error: message };
  }
}

export async function removeTaskFromGoogle(task: Task): Promise<SyncResult> {
  // Removing Google event for task
  if (!getAccessToken()) {
    return { success: false, error: 'Not connected to Google Calendar' };
  }
  if (!task.google_event_id) return { success: true };
  const calendarId = getTargetCalendarId(task);
  try {
    await deleteCalendarEvent(task.google_event_id, calendarId);
    // Google event deleted successfully
    return { success: true };
  } catch (err: unknown) {
    // Failed to delete Google event — error surfaced via return value
    const message = err instanceof Error ? err.message : 'Failed to delete Google event';
    return { success: false, error: message };
  }
}

export function isRecurringTask(task: Task): boolean {
  return task.frequency !== 'once' && (task.preferred_days?.length ?? 0) > 0;
}