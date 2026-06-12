/**
 * Pure drag-and-drop math for the calendar.
 *
 * Extracted from TempoCalendar so the time/day-conversion logic can be
 * unit-tested without React or dnd-kit. The TempoCalendar component calls
 * `computeEventDrop` from its `onDragEnd` handler; consumers render the
 * returned `newStart` / `newEnd` (or do nothing if `null` is returned).
 *
 * Snapping rules (mirrors the UX spec):
 *   - Vertical delta → minutes, rounded to 15-minute slots (1 HOUR_HEIGHT = 60 min)
 *   - Horizontal delta → whole-day offsets, rounded (only in the week view)
 *   - If both axes round to zero, the drag is a no-op (returns `null`)
 */

export interface DropInput {
  /** The dragged event's original start time. */
  start: Date;
  /** The dragged event's original end time. */
  end: Date;
  /** Horizontal drag distance in pixels (positive = right, negative = left). */
  deltaX: number;
  /** Vertical drag distance in pixels (positive = down, negative = up). */
  deltaY: number;
  /** Pixels per hour — keep in sync with `HOUR_HEIGHT` in TempoCalendar. */
  hourHeight: number;
  /** Width of a single day column in pixels (only used in week view). */
  dayColumnWidth: number;
  /** Active view — horizontal snapping is only honored in the week view. */
  view: 'day' | 'week' | 'month';
}

export interface DropResult {
  newStart: Date;
  newEnd: Date;
}

/**
 * Compute where an event should land after a drag.
 *
 * Returns `null` when the drag is a no-op (both axes round to zero) so the
 * caller can skip the `onEventDrop` call entirely.
 *
 * The original duration is preserved: `newEnd - newStart === end - start`.
 */
export function computeEventDrop(input: DropInput): DropResult | null {
  const { start, end, deltaX, deltaY, hourHeight, dayColumnWidth, view } = input;

  // Vertical: 1 px = (60 / hourHeight) min, rounded to 15-min slots
  const minutes = Math.round((deltaY / hourHeight) * 60 / 15) * 15;

  // Horizontal: only in week view, and only if a positive day-column width was reported
  const dayOffset =
    view === 'week' && dayColumnWidth > 0
      ? Math.round(deltaX / dayColumnWidth)
      : 0;

  if (minutes === 0 && dayOffset === 0) return null;

  const durationMs = end.getTime() - start.getTime();
  const totalMinutes = minutes + dayOffset * 24 * 60;
  const newStart = new Date(start.getTime() + totalMinutes * 60_000);
  const newEnd = new Date(newStart.getTime() + durationMs);
  return { newStart, newEnd };
}
