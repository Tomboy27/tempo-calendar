/**
 * Shared types and helpers for the TempoCalendar siblings.
 *
 * Lives in its own file (not in TempoCalendar.tsx) so the orchestrator
 * exports only a component and `react-refresh/only-export-components` is
 * happy. Sub-views import `HOUR_HEIGHT` / `getEventsForDay` / etc. from
 * here, the orchestrator re-exports the public types for backward compat
 * with `App.tsx` and `CalendarEvent.tsx`.
 */

import { startOfDay, endOfDay, isSameDay } from 'date-fns';

// ============================================================
// Public types
// ============================================================

export type CalendarEventVariant =
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'destructive'
  | 'success'
  | 'muted';

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarEventType {
  id: string;
  title: string;
  start: Date;
  end: Date;
  variant?: CalendarEventVariant;
  allDay?: boolean;
  data?: {
    description?: string;
    source?: 'google' | 'task';
    color?: string;
    is_locked?: boolean;
    is_missed?: boolean;
    is_flexible?: boolean;
    is_completed?: boolean;
    is_skipped?: boolean;
    is_busy_block?: boolean;
    is_recurring?: boolean;
  };
}

/**
 * Shared ref type the WeekView writes its day-column width to so the
 * orchestrator's drag handler can convert horizontal pixel deltas into
 * day offsets. Using a ref (not state) avoids re-renders on resize.
 */
export type DayColumnWidthRef = { current: number };

/**
 * Live target of an in-progress drag — used by the WeekView to render
 * the translucent ghost rectangle at the day/time the event will land on.
 */
export interface DragGhostTarget {
  eventId: string;
  newStart: Date;
  newEnd: Date;
  title: string;
  variant?: CalendarEventVariant;
}

// ============================================================
// Shared helpers
// ============================================================

/** Pixels per hour — generous and readable; keep in sync with `lib/drag.ts`. */
export const HOUR_HEIGHT = 56;

export function getEventsForDay(events: CalendarEventType[], day: Date): CalendarEventType[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events.filter((ev) => {
    if (ev.allDay) {
      return isSameDay(ev.start, day) || isSameDay(ev.end, day) || (ev.start <= dayEnd && ev.end >= dayStart);
    }
    return ev.start < dayEnd && ev.end > dayStart;
  });
}

export function getAllDayEvents(events: CalendarEventType[]): CalendarEventType[] {
  return events.filter((e) => e.allDay);
}

interface PositionedEvent extends CalendarEventType {
  top: number;
  height: number;
  column: number;
  totalColumns: number;
  isStart: boolean;
  isEnd: boolean;
}

/**
 * Position events on a day, handling overlap with side-by-side columns.
 * Pure function — easy to unit-test if needed.
 *
 * Assumes `day` is already `startOfDay` (callers in DayView/WeekView pass
 * `startOfDay(...)`); the visibleStart then sets the hour, with minutes/
 * seconds/ms explicitly zeroed for safety.
 */
export function positionEvents(
  events: CalendarEventType[],
  day: Date,
  startHour: number,
): PositionedEvent[] {
  const dayStart = startOfDay(day);
  const visibleStart = new Date(dayStart);
  visibleStart.setHours(startHour, 0, 0, 0);
  const dayEnd = endOfDay(day);

  // Clip events to visible window
  const clipped = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const start = e.start < visibleStart ? visibleStart : e.start;
      const end = e.end > dayEnd ? dayEnd : e.end;
      return { ...e, start, end };
    })
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const positioned: PositionedEvent[] = [];
  const columns: { end: Date }[][] = [[]];

  for (const ev of clipped) {
    // Find first column where this event fits (no overlap)
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const last = columns[i][columns[i].length - 1];
      if (!last || last.end <= ev.start) {
        columns[i].push({ end: ev.end });
        const minutesFromTop = Math.max(0, (ev.start.getTime() - visibleStart.getTime()) / 60_000);
        const minutes = Math.max(15, (ev.end.getTime() - ev.start.getTime()) / 60_000);
        positioned.push({
          ...ev,
          top: (minutesFromTop / 60) * HOUR_HEIGHT,
          height: (minutes / 60) * HOUR_HEIGHT,
          column: i,
          totalColumns: 0, // filled in below
          isStart: true,
          isEnd: true,
        });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const newCol = [{ end: ev.end }];
      columns.push(newCol);
      const minutesFromTop = Math.max(0, (ev.start.getTime() - visibleStart.getTime()) / 60_000);
      const minutes = Math.max(15, (ev.end.getTime() - ev.start.getTime()) / 60_000);
      positioned.push({
        ...ev,
        top: (minutesFromTop / 60) * HOUR_HEIGHT,
        height: (minutes / 60) * HOUR_HEIGHT,
        column: columns.length - 1,
        totalColumns: 0,
        isStart: true,
        isEnd: true,
      });
    }
  }

  // Determine totalColumns for clusters of overlapping events.
  // For simplicity, use total columns overall — good enough for daily layouts.
  const total = columns.length;
  return positioned.map((p) => ({ ...p, totalColumns: total }));
}
