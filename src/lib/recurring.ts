import { addDays, parseISO, format, getDay, startOfWeek, startOfDay } from 'date-fns';
import type { Task } from './types';
import type { CalendarEventType } from '../components/TempoCalendarHelpers';

/**
 * Generate calendar event instances for a repeating task.
 *
 * The first (base) occurrence is derived from `scheduled_start` / `scheduled_end`.
 * Subsequent occurrences are generated forward in time up to either `toDate`
 * or `recurrence_end` (whichever is earlier).
 *
 * For **daily** tasks: one occurrence per day (or every selected weekday).
 * For **weekly** tasks: one occurrence per week on each selected weekday.
 *
 * Returns an empty array for non-repeating tasks or tasks without a base
 * scheduled time.
 */
export function generateRecurringOccurrences(
  task: Task,
  fromDate: Date,
  toDate: Date,
): CalendarEventType[] {
  if (task.frequency === 'once') return [];
  if (!task.scheduled_start || !task.scheduled_end) return [];

  const baseStart = parseISO(task.scheduled_start);
  const baseEnd = parseISO(task.scheduled_end);
  const durationMs = baseEnd.getTime() - baseStart.getTime();

  // Recurrence bound: the earliest of the explicit recurrence_end, the
  // task's due_date (legacy fallback), and the caller's toDate.
  // recurrence_end is treated as inclusive (end-of-day) so an occurrence
  // at 09:00 on the recurrence end day is still generated.
  const recurrenceEnd = task.recurrence_end
    ? parseISO(task.recurrence_end)
    : task.due_date
      ? parseISO(task.due_date)
      : null;
  const horizon = recurrenceEnd
    ? new Date(Math.min(recurrenceEnd.getTime() + 24 * 60 * 60 * 1000, toDate.getTime()))
    : toDate;

  const preferredDays = new Set(task.preferred_days ?? []);
  // Default behavior: daily tasks with no preferred days show on ALL days;
  // weekly tasks with no preferred days show only on the base day-of-week.
  const baseDayOfWeek = getDay(baseStart); // 0=Sun … 6=Sat
  const defaultIsoDay = baseDayOfWeek === 0 ? 7 : baseDayOfWeek; // 1=Mon … 7=Sun
  const effectiveDays = preferredDays.size > 0
    ? preferredDays
    : task.frequency === 'daily'
      ? new Set([1, 2, 3, 4, 5, 6, 7])
      : new Set([defaultIsoDay]);

  // Convert effectiveDays to an array sorted by day-of-week
  const sortedDays = Array.from(effectiveDays).sort((a, b) => a - b);

  const occurrences: CalendarEventType[] = [];

  // Preserve the time-of-day from the base occurrence so generated
  // occurrences start at the same clock time, not at midnight.
  const timeOfDayMs = baseStart.getTime() - startOfDay(baseStart).getTime();

  // Start from the beginning of the week containing the base start.
  const weekStart = startOfWeek(startOfDay(baseStart), { weekStartsOn: 1 });
  let weekCursor = new Date(weekStart);

  // Fast-forward to the week containing fromDate (or the base date if fromDate is earlier)
  const MAX_FAST_FORWARD_WEEKS = 156; // 3 years
  let fastForwardWeeks = 0;
  while (weekCursor < fromDate && fastForwardWeeks < MAX_FAST_FORWARD_WEEKS) {
    weekCursor = addDays(weekCursor, 7);
    fastForwardWeeks++;
  }

  const now = new Date();
  // Safety cap: never generate more than 365 occurrences.
  const MAX_OCCURRENCES = 365;
  let count = 0;

  while (weekCursor <= horizon && count < MAX_OCCURRENCES) {
    // For each day in the selected set, check if that day-of-week falls within this week
    for (const isoDay of sortedDays) {
      // isoDay is 1-7 (Mon-Sun). Compute the offset from week start (Mon = 0).
      const dayOffset = isoDay - 1; // 0=Mon, 6=Sun
      const candidate = new Date(weekCursor.getTime() + dayOffset * 24 * 60 * 60 * 1000 + timeOfDayMs);

      // Only include if it's within the requested range and after the base start
      if (candidate >= fromDate && candidate <= horizon && candidate >= baseStart) {
        if (count >= MAX_OCCURRENCES) break;
        const occDateKey = format(candidate, 'yyyy-MM-dd');

        // Check occurrence overrides for this date
        const override = task.occurrence_overrides?.[occDateKey];
        if (override?.status === 'skipped') {
          // Skip this occurrence entirely
          count++;
          continue;
        }

        const occStart = override?.scheduled_start
          ? parseISO(override.scheduled_start)
          : new Date(candidate);
        const occEnd = override?.scheduled_end
          ? parseISO(override.scheduled_end)
          : new Date(occStart.getTime() + durationMs);

        // Determine status: override status wins, then base task status
        const occurrenceStatus = override?.status || task.status;
        const isMissed = occurrenceStatus === 'missed' || (occurrenceStatus === 'active' && occEnd < now);
        const isCompleted = occurrenceStatus === 'completed';
        const isSkipped = occurrenceStatus === 'skipped';
        const isLocked = task.is_locked === true;
        const isBusyBlock = task.is_busy_block === true;
        const isRecurring = true;

        const variant: CalendarEventType['variant'] = isSkipped
          ? 'muted'
          : isCompleted
            ? 'muted'
            : isMissed
              ? 'destructive'
              : isLocked
                ? 'success'
                : isBusyBlock
                  ? 'primary'
                  : isRecurring
                    ? 'warning'
                    : 'secondary';

        occurrences.push({
          id: `task-${task.id}-occ-${occDateKey}`,
          title: task.title,
          start: occStart,
          end: occEnd,
          variant,
          data: {
            description: task.description || '',
            source: 'task',
            color: task.color,
            is_locked: isLocked,
            is_missed: isMissed,
            is_completed: isCompleted,
            is_skipped: isSkipped,
            is_busy_block: isBusyBlock,
            is_recurring: isRecurring,
          },
        });
        count++;
      }
    }

    if (count >= MAX_OCCURRENCES) break;
    weekCursor = addDays(weekCursor, 7);
  }

  return occurrences;
}
