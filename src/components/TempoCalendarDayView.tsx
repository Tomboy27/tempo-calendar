import { useEffect, useMemo, useRef, useState } from 'react';
import {
  format,
  isToday,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  differenceInMinutes,
} from 'date-fns';
import { DraggableEvent } from './CalendarEvent';
import { cn } from '../lib/utils';
import { CalendarDays } from 'lucide-react';
import {
  HOUR_HEIGHT,
  getEventsForDay,
  getAllDayEvents,
  positionEvents,
  type CalendarEventType,
} from './TempoCalendarHelpers';

interface DayViewProps {
  date: Date;
  events: CalendarEventType[];
  startHour: number;
  endHour: number;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  /** Resize ghost — translucent preview of the new size during resize. */
  resizeGhost?: import('./TempoCalendarHelpers').DragGhostTarget | null;
  /** Start a resize operation on a task event. */
  onResizeStart?: (eventId: string, direction: 'top' | 'bottom', clientY: number) => void;
}

/**
 * Single-day grid: hour gutter on the left, all-day strip on top, the
 * time grid on the right with half-hour lines, a "now" line when the
 * displayed day is today, and positioned events.
 *
 * Sibling of TempoCalendar (the orchestrator). Receives only what it needs.
 */
export function TempoCalendarDayView({
  date,
  events,
  startHour,
  endHour,
  onSelectEvent,
  onSelectSlot,
  resizeGhost,
  onResizeStart,
}: DayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const dayEvents = useMemo(() => getEventsForDay(events, date), [events, date]);
  const allDayEvents = useMemo(() => getAllDayEvents(dayEvents), [dayEvents]);
  const timedEvents = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents]);
  const positioned = useMemo(
    () => positionEvents(timedEvents, date, startHour),
    [timedEvents, date, startHour],
  );

  // Scroll to current time on mount and tick every minute
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

    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [date, startHour]);

  // Now line (computed inline — cheap, no need to memoize)
  const nowOffset = isToday(date)
    ? (() => {
        const now = new Date();
        const minutesFromTop = (now.getHours() - startHour) * 60 + now.getMinutes();
        if (minutesFromTop < 0 || minutesFromTop > (endHour - startHour) * 60) return null;
        return (minutesFromTop / 60) * HOUR_HEIGHT;
      })()
    : null;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
    const hour = Math.min(endHour - 1, Math.max(startHour, Math.floor(y / HOUR_HEIGHT) + startHour));
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

      {/* Scrollable time grid — always visible so users can click slots */}
      <div ref={containerRef} className="flex-1 overflow-y-auto tempo-scrollbar relative">
        {/* Subtle empty-state overlay when no events */}
        {events.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-card/60 backdrop-blur-[1px] pointer-events-none" role="status">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <CalendarDays className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Nothing scheduled today</p>
            <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
              Click any time slot to add a task.
            </p>
          </div>
        )}
        <div
          className="relative grid grid-cols-[64px_1fr]"
          style={{ height: (endHour - startHour) * HOUR_HEIGHT }}
        >
          {/* Hour gutter */}
          <div className="border-r border-border bg-card">
            {hours.map((h) => (
              <div key={h} data-hour={h} className="relative h-14 border-b border-border/40">
                <span className="absolute top-0 right-3 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-card px-1 tabular-nums">
                  {format(setHours(date, h), 'h a')}
                </span>
              </div>
            ))}
          </div>

          {/* Event grid */}
          <div className="relative" onClick={handleGridClick}>
            {/* Hour lines */}
            {hours.map((h) => (
              <div key={h} data-hour={h} className="h-14 border-b border-border/40" />
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
              <div className="absolute left-0 right-0 z-[5] pointer-events-none" style={{ top: nowOffset }}>
                <div className="flex items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary -ml-0.5" />
                  <div className="flex-1 h-[0.5px] bg-primary/40" />
                </div>
              </div>
            )}

            {/* Events */}
            {positioned.map((ev) => {
              const width =
                ev.totalColumns > 0
                  ? `calc((100% - 8px) / ${ev.totalColumns})`
                  : 'calc(100% - 8px)';
              const left =
                ev.totalColumns > 0
                  ? `calc(4px + (100% - 8px) * ${ev.column} / ${ev.totalColumns})`
                  : '4px';
              return (
                <DraggableEvent
                  key={ev.id}
                  event={ev}
                  onClick={(e) => onSelectEvent?.(e)}
                  draggable={ev.data?.source === 'task' && !ev.data?.is_locked}
                  isLocked={ev.data?.is_locked}
                  onResizeStart={ev.data?.source === 'task' && !ev.data?.is_locked ? (dir, y) => onResizeStart?.(ev.id, dir, y) : undefined}
                  positionStyle={{
                    top: ev.top,
                    height: Math.max(24, ev.height - 2),
                    left,
                    width,
                  }}
                />
              );
            })}

            {/* Resize ghost — translucent preview of new size */}
            {resizeGhost &&
              (() => {
                const visibleStart = setMilliseconds(
                  setSeconds(setMinutes(setHours(date, startHour), 0), 0),
                  0,
                );
                const minutesFromTop = differenceInMinutes(resizeGhost.newStart, visibleStart);
                const durationMin = differenceInMinutes(resizeGhost.newEnd, resizeGhost.newStart);
                const top = Math.max(0, (minutesFromTop / 60) * HOUR_HEIGHT);
                const visibleMaxTop = (endHour - startHour) * HOUR_HEIGHT;
                const height = Math.max(24, Math.min(visibleMaxTop - top, (durationMin / 60) * HOUR_HEIGHT));
                const left = '4px';
                const width = 'calc(100% - 8px)';
                const variantClass =
                  resizeGhost.variant === 'warning'
                    ? 'bg-warning/20 border-warning text-foreground'
                    : resizeGhost.variant === 'destructive'
                    ? 'bg-destructive/20 border-destructive text-foreground'
                    : resizeGhost.variant === 'success'
                    ? 'bg-success/20 border-success text-foreground'
                    : resizeGhost.variant === 'secondary'
                    ? 'bg-event-task/30 border-event-task-border text-foreground'
                    : resizeGhost.variant === 'muted'
                    ? 'bg-muted border-muted-foreground/30 text-foreground'
                    : 'bg-primary/20 border-primary text-foreground';
                return (
                  <div
                    className={cn(
                      'absolute z-30 rounded-md border-2 border-dashed pointer-events-none flex flex-col px-1.5 py-1 overflow-hidden',
                      variantClass,
                      'backdrop-blur-[1px] shadow-lg',
                    )}
                    style={{ top, height, left, width }}
                    aria-hidden
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-semibold truncate text-[10px]">{resizeGhost.title}</span>
                    </div>
                    <div className="text-[9px] opacity-75 num">
                      {format(resizeGhost.newStart, 'h:mma')} - {format(resizeGhost.newEnd, 'h:mma')}
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>
    </div>
  );
}
