import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths, subWeeks, subMonths, subDays, startOfDay, endOfDay, isSameDay, isSameMonth, isToday, differenceInMinutes, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export type CalendarEventVariant = 'primary' | 'secondary' | 'warning' | 'destructive' | 'success' | 'muted';
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
  };
}

interface TempoCalendarProps {
  events: CalendarEventType[];
  defaultView?: CalendarView;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  className?: string;
  startHour?: number;
  endHour?: number;
  height?: number | string;
}

// ============================================================
// Helpers
// ============================================================

const HOUR_HEIGHT = 56; // px per hour — generous, readable

function getEventsForDay(events: CalendarEventType[], day: Date): CalendarEventType[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events.filter((ev) => {
    if (ev.allDay) {
      return isSameDay(ev.start, day) || isSameDay(ev.end, day) || (ev.start <= dayEnd && ev.end >= dayStart);
    }
    return ev.start < dayEnd && ev.end > dayStart;
  });
}

function getAllDayEvents(events: CalendarEventType[]): CalendarEventType[] {
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
 */
function positionEvents(events: CalendarEventType[], day: Date, startHour: number): PositionedEvent[] {
  const dayStart = startOfDay(day);
  const visibleStart = setMilliseconds(setSeconds(setMinutes(setHours(dayStart, startHour), 0), 0), 0);
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
        const minutesFromTop = Math.max(0, differenceInMinutes(ev.start, visibleStart));
        const minutes = Math.max(15, differenceInMinutes(ev.end, ev.start));
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
      const minutesFromTop = Math.max(0, differenceInMinutes(ev.start, visibleStart));
      const minutes = Math.max(15, differenceInMinutes(ev.end, ev.start));
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

  // Determine totalColumns for clusters of overlapping events
  // For simplicity, use total columns overall — good enough for daily layouts
  const total = columns.length;
  return positioned.map((p) => ({ ...p, totalColumns: total }));
}

// ============================================================
// Sub-views
// ============================================================

interface DayViewProps {
  date: Date;
  events: CalendarEventType[];
  startHour: number;
  endHour: number;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
}

function DayView({ date, events, startHour, endHour, onSelectEvent, onSelectSlot }: DayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dayEvents = useMemo(() => getEventsForDay(events, date), [events, date]);
  const allDayEvents = useMemo(() => getAllDayEvents(dayEvents), [dayEvents]);
  const timedEvents = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents]);
  const positioned = useMemo(() => positionEvents(timedEvents, date, startHour), [timedEvents, date, startHour]);

  // Scroll to current time on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const now = new Date();
    if (!isToday(date)) {
      containerRef.current.scrollTop = 0;
      return;
    }
    const minutesFromTop = Math.max(0, (now.getHours() - startHour) * 60 + now.getMinutes());
    const target = (minutesFromTop / 60) * HOUR_HEIGHT - 80;
    containerRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [date, startHour]);

  // Now line
  const nowOffset = useMemo(() => {
    if (!isToday(date)) return null;
    const now = new Date();
    const minutesFromTop = (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromTop < 0 || minutesFromTop > (endHour - startHour) * 60) return null;
    return (minutesFromTop / 60) * HOUR_HEIGHT;
  }, [date, startHour, endHour]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
    const hour = Math.floor(y / HOUR_HEIGHT) + startHour;
    const minute = Math.round((y % HOUR_HEIGHT) / HOUR_HEIGHT * 60 / 15) * 15;
    const start = setMilliseconds(setSeconds(setMinutes(setHours(date, hour), minute), 0), 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    onSelectSlot({ start, end });
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* All-day row */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-border bg-muted/20 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">All day</span>
          <div className="flex gap-1.5">
            {allDayEvents.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onSelectEvent?.(ev)}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent hover:bg-accent/70 text-foreground transition-colors truncate max-w-[200px]"
              >
                {ev.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto tempo-scrollbar">
        <div className="relative grid grid-cols-[64px_1fr]" style={{ height: (endHour - startHour) * HOUR_HEIGHT }}>
          {/* Hour gutter */}
          <div className="border-r border-border bg-card">
            {hours.map((h) => (
              <div key={h} className="relative h-14 border-b border-border/40">
                <span className="absolute top-0 right-3 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-card px-1 tabular-nums">
                  {format(setHours(d, h), 'h a')}
                </span>
              </div>
            ))}
          </div>

          {/* Event grid */}
          <div className="relative" onClick={handleGridClick}>
            {/* Hour lines */}
            {hours.map((h) => (
              <div key={h} className="h-14 border-b border-border/40" />
            ))}

            {/* Half-hour lines (subtle) */}
            {hours.slice(0, -1).map((h) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 h-px bg-border/30 pointer-events-none"
                style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {/* Now line */}
            {nowOffset !== null && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowOffset }}>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-primary -ml-1 shadow-[0_0_0_4px_oklch(1_0_0)]" />
                  <div className="flex-1 h-px bg-primary/60" />
                </div>
              </div>
            )}

            {/* Events */}
            {positioned.map((ev) => {
              const width = positioned.length > 0 && ev.totalColumns > 0
                ? `calc((100% - 8px) / ${ev.totalColumns})`
                : 'calc(100% - 8px)';
              const left = ev.totalColumns > 0
                ? `calc(4px + (100% - 8px) * ${ev.column} / ${ev.totalColumns})`
                : '4px';
              return (
                <button
                  key={ev.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent?.(ev);
                  }}
                  className={cn(
                    'absolute z-10 text-left px-2 py-1 rounded-md overflow-hidden transition-all duration-150',
                    'hover:scale-[1.01] hover:z-30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'border-l-2 text-[11px] leading-tight',
                    ev.variant === 'primary' && 'bg-primary/12 border-primary text-foreground',
                    ev.variant === 'secondary' && 'bg-event-task/40 border-event-task-border text-foreground',
                    ev.variant === 'warning' && 'bg-warning/15 border-warning text-foreground',
                    ev.variant === 'destructive' && 'bg-destructive/15 border-destructive text-foreground',
                    ev.variant === 'success' && 'bg-success/15 border-success text-foreground',
                    ev.variant === 'muted' && 'bg-muted border-muted-foreground/30 text-foreground',
                    (!ev.variant || ev.variant === 'primary') && 'bg-primary/12 border-primary text-foreground',
                  )}
                  style={{
                    top: ev.top,
                    height: Math.max(24, ev.height - 2),
                    left,
                    width,
                  }}
                >
                  <div className="font-semibold truncate text-[12px]">{ev.title}</div>
                  {ev.height > 40 && (
                    <div className="text-muted-foreground text-[10px] mt-0.5 tabular-nums">
                      {format(ev.start, 'h:mm a')} - {format(ev.end, 'h:mm a')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface WeekViewProps {
  date: Date;
  events: CalendarEventType[];
  startHour: number;
  endHour: number;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
}

function WeekView({ date, events, startHour, endHour, onSelectEvent, onSelectSlot }: WeekViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  // Pre-position events per day
  const dayPositions = useMemo(() => {
    return days.map((d) => positionEvents(getEventsForDay(events, d).filter((e) => !e.allDay), d, startHour));
  }, [days, events, startHour]);

  const allDayPerDay = useMemo(() => days.map((d) => getAllDayEvents(getEventsForDay(events, d))), [days, events]);
  const hasAllDay = allDayPerDay.some((d) => d.length > 0);

  // Scroll to current time on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const now = new Date();
    const isCurrentWeek = days.some((d) => isSameDay(d, now));
    if (!isCurrentWeek) {
      containerRef.current.scrollTop = 0;
      return;
    }
    const minutesFromTop = Math.max(0, (now.getHours() - startHour) * 60 + now.getMinutes());
    const target = (minutesFromTop / 60) * HOUR_HEIGHT - 80;
    containerRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [days, startHour]);

  // Now line position (% of week view)
  const nowOffset = useMemo(() => {
    const now = new Date();
    if (!days.some((d) => isSameDay(d, now))) return null;
    const minutesFromTop = (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromTop < 0 || minutesFromTop > (endHour - startHour) * 60) return null;
    return (minutesFromTop / 60) * HOUR_HEIGHT;
  }, [days, startHour, endHour]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if (!onSelectSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
    const hour = Math.floor(y / HOUR_HEIGHT) + startHour;
    const minute = Math.round((y % HOUR_HEIGHT) / HOUR_HEIGHT * 60 / 15) * 15;
    const start = setMilliseconds(setSeconds(setMinutes(setHours(day, hour), minute), 0), 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    onSelectSlot({ start, end });
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Day header row */}
      <div className={cn('grid border-b border-border bg-card/50', 'grid-cols-[64px_repeat(7,1fr)]')}>
        <div className="border-r border-border" />
        {days.map((d) => {
          const t = isToday(d);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'flex flex-col items-center py-3 border-r border-border/40 last:border-r-0 transition-colors',
                t && 'bg-primary/5',
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {format(d, 'EEE')}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-base font-semibold tabular-nums w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                  t ? 'bg-primary text-primary-foreground' : 'text-foreground',
                )}
              >
                {format(d, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div className="grid border-b border-border bg-muted/10 grid-cols-[64px_repeat(7,1fr)]">
          <div className="border-r border-border" />
          {days.map((d, i) => (
            <div key={d.toISOString()} className="border-r border-border/40 last:border-r-0 p-1.5 space-y-1 min-h-[40px]">
              {allDayPerDay[i].slice(0, 3).map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => onSelectEvent?.(ev)}
                  className="w-full text-left px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent hover:bg-accent/70 text-foreground truncate transition-colors"
                >
                  {ev.title}
                </button>
              ))}
              {allDayPerDay[i].length > 3 && (
                <span className="text-[10px] text-muted-foreground px-1.5">+{allDayPerDay[i].length - 3} more</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto tempo-scrollbar">
        <div className="relative grid grid-cols-[64px_repeat(7,1fr)]" style={{ height: (endHour - startHour) * HOUR_HEIGHT }}>
          {/* Hour gutter */}
          <div className="border-r border-border">
            {hours.map((h) => (
              <div key={h} className="relative h-14 border-b border-border/40">
                <span className="absolute top-0 right-3 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-card px-1 tabular-nums">
                  {format(setHours(d, h), 'h a')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, dayIdx) => {
            const t = isToday(d);
            const positioned = dayPositions[dayIdx];
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'relative border-r border-border/40 last:border-r-0',
                  t && 'bg-primary/[0.025]',
                )}
                onClick={(e) => handleGridClick(e, d)}
              >
                {hours.map((h) => (
                  <div key={h} className="h-14 border-b border-border/30" />
                ))}
                {hours.slice(0, -1).map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 h-px bg-border/20 pointer-events-none"
                    style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {positioned.map((ev) => {
                  const width = ev.totalColumns > 0
                    ? `calc((100% - 6px) / ${ev.totalColumns})`
                    : 'calc(100% - 6px)';
                  const left = ev.totalColumns > 0
                    ? `calc(3px + (100% - 6px) * ${ev.column} / ${ev.totalColumns})`
                    : '3px';
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent?.(ev);
                      }}
                      className={cn(
                        'absolute z-10 text-left px-1.5 py-1 rounded-md overflow-hidden transition-all duration-150',
                        'hover:scale-[1.015] hover:z-30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'border-l-2 text-[10px] leading-tight',
                        ev.variant === 'primary' && 'bg-primary/15 border-primary text-foreground',
                        ev.variant === 'secondary' && 'bg-event-task/40 border-event-task-border text-foreground',
                        ev.variant === 'warning' && 'bg-warning/15 border-warning text-foreground',
                        ev.variant === 'destructive' && 'bg-destructive/15 border-destructive text-foreground',
                        ev.variant === 'success' && 'bg-success/15 border-success text-foreground',
                        ev.variant === 'muted' && 'bg-muted border-muted-foreground/30 text-foreground',
                        (!ev.variant || ev.variant === 'primary') && 'bg-primary/15 border-primary text-foreground',
                      )}
                      style={{
                        top: ev.top,
                        height: Math.max(22, ev.height - 2),
                        left,
                        width,
                      }}
                    >
                      <div className="font-semibold truncate text-[10px]">{ev.title}</div>
                      {ev.height > 36 && (
                        <div className="text-muted-foreground text-[9px] mt-0.5 tabular-nums truncate">
                          {format(ev.start, 'h:mma')} {format(ev.end, 'h:mma')}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Now line (spans full week width) */}
          {nowOffset !== null && (
            <div
              className="absolute left-16 right-0 z-20 pointer-events-none flex items-center"
              style={{ top: nowOffset }}
            >
              <div className="w-2 h-2 rounded-full bg-primary -ml-1 shadow-[0_0_0_4px_oklch(1_0_0)]" />
              <div className="flex-1 h-px bg-primary/60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MonthViewProps {
  date: Date;
  events: CalendarEventType[];
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  onSelectDay?: (day: Date) => void;
}

function MonthView({ date, events, onSelectEvent, onSelectDay }: MonthViewProps) {
  const monthStart = useMemo(() => startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1), { weekStartsOn: 1 }), [date]);
  const monthEnd = useMemo(() => endOfWeek(new Date(date.getFullYear(), date.getMonth() + 1, 0), { weekStartsOn: 1 }), [date]);
  const days = useMemo(() => {
    const arr: Date[] = [];
    let cur = monthStart;
    while (cur <= monthEnd) {
      arr.push(cur);
      cur = addDays(cur, 1);
    }
    return arr;
  }, [monthStart, monthEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventType[]>();
    for (const d of days) {
      map.set(d.toDateString(), getEventsForDay(events, d));
    }
    return map;
  }, [days, events]);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Day name header */}
      <div className="grid grid-cols-7 border-b border-border bg-card/50">
        {dayNames.map((n) => (
          <div key={n} className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {n}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const dayEvents = eventsByDay.get(d.toDateString()) || [];
          const inMonth = isSameMonth(d, date);
          const t = isToday(d);
          const visible = dayEvents.slice(0, 3);
          const more = dayEvents.length - visible.length;

          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay?.(d)}
              className={cn(
                'flex flex-col items-stretch p-1.5 border-r border-b border-border/40 last:border-r-0 text-left transition-colors hover:bg-accent/30 min-h-0 group',
                !inMonth && 'bg-muted/30 text-muted-foreground',
                t && 'bg-primary/[0.04]',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full transition-colors',
                    t ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {format(d, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[9px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              <div className="space-y-0.5 overflow-hidden flex-1">
                {visible.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent?.(ev);
                    }}
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] font-medium rounded truncate cursor-pointer transition-colors border-l-2',
                      ev.variant === 'primary' && 'bg-primary/15 border-primary text-foreground',
                      ev.variant === 'secondary' && 'bg-event-task/40 border-event-task-border text-foreground',
                      ev.variant === 'warning' && 'bg-warning/15 border-warning text-foreground',
                      ev.variant === 'destructive' && 'bg-destructive/15 border-destructive text-foreground',
                      ev.variant === 'success' && 'bg-success/15 border-success text-foreground',
                      ev.variant === 'muted' && 'bg-muted border-muted-foreground/30 text-foreground',
                      (!ev.variant || ev.variant === 'primary') && 'bg-primary/15 border-primary text-foreground',
                    )}
                  >
                    {ev.title}
                  </div>
                ))}
                {more > 0 && (
                  <div className="text-[10px] font-medium text-muted-foreground px-1.5">
                    +{more} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function TempoCalendar({
  events,
  defaultView = 'week',
  onSelectEvent,
  onSelectSlot,
  className,
  startHour = 6,
  endHour = 22,
}: TempoCalendarProps) {
  const [view, setView] = useState<CalendarView>(defaultView);
  const [date, setDate] = useState<Date>(new Date());

  const today = useMemo(() => new Date(), []);

  const handlePrev = useCallback(() => {
    if (view === 'day') setDate((d) => subDays(d, 1));
    else if (view === 'week') setDate((d) => subWeeks(d, 1));
    else setDate((d) => subMonths(d, 1));
  }, [view]);

  const handleNext = useCallback(() => {
    if (view === 'day') setDate((d) => addDays(d, 1));
    else if (view === 'week') setDate((d) => addWeeks(d, 1));
    else setDate((d) => addMonths(d, 1));
  }, [view]);

  const handleToday = useCallback(() => setDate(new Date()), []);

  const handleMonthDayClick = useCallback((day: Date) => {
    setDate(day);
    setView('day');
  }, []);

  const title = useMemo(() => {
    if (view === 'day') return format(date, 'EEEE, MMMM d');
    if (view === 'week') {
      const ws = startOfWeek(date, { weekStartsOn: 1 });
      const we = endOfWeek(date, { weekStartsOn: 1 });
      if (ws.getMonth() === we.getMonth()) {
        return `${format(ws, 'MMMM d')} - ${format(we, 'd, yyyy')}`;
      }
      return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
    }
    return format(date, 'MMMM yyyy');
  }, [view, date]);

  return (
    <div className={cn('flex flex-col h-full gap-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={handleToday}
          className={cn(
            'h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors',
            isSameDay(date, today)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-foreground hover:bg-accent',
          )}
        >
          Today
        </button>

        <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={handlePrev}
            className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border-l border-border"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h2 className="text-base font-semibold text-foreground ml-1 tracking-tight">
          {title}
        </h2>

        <div className="flex-1" />

        <div className="flex items-center bg-card border border-border rounded-lg p-0.5">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'h-8 px-3.5 text-xs font-medium rounded-md transition-colors capitalize',
                view === v
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* View */}
      <div className="flex-1 min-h-0 animate-fade-in">
        {view === 'day' && (
          <DayView
            date={date}
            events={events}
            startHour={startHour}
            endHour={endHour}
            onSelectEvent={onSelectEvent}
            onSelectSlot={onSelectSlot}
          />
        )}
        {view === 'week' && (
          <WeekView
            date={date}
            events={events}
            startHour={startHour}
            endHour={endHour}
            onSelectEvent={onSelectEvent}
            onSelectSlot={onSelectSlot}
          />
        )}
        {view === 'month' && (
          <MonthView
            date={date}
            events={events}
            onSelectEvent={onSelectEvent}
            onSelectDay={handleMonthDayClick}
          />
        )}
      </div>
    </div>
  );
}
