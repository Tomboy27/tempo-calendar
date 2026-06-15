import { useEffect, useMemo, useRef, useState } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  isToday,
  isSameDay,
  differenceInMinutes,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
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
  type DayColumnWidthRef,
  type DragGhostTarget,
} from './TempoCalendarHelpers';

interface WeekViewProps {
  date: Date;
  events: CalendarEventType[];
  startHour: number;
  endHour: number;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  /** Ref the parent reads to compute horizontal drag → day offset. */
  dayColumnWidthRef: DayColumnWidthRef;
  /**
   * Live target of the in-progress drag, used to render a translucent
   * ghost rectangle at the day/time the event will land on. `null` when no
   * drag is active or when the drag is sub-threshold.
   */
  dragGhost?: DragGhostTarget | null;
  /** Resize ghost — translucent preview of the new size during resize. */
  resizeGhost?: DragGhostTarget | null;
  /** Start a resize operation on a task event. */
  onResizeStart?: (eventId: string, direction: 'top' | 'bottom', clientY: number) => void;
}

/**
 * Seven-day grid: day-header row, optional all-day strip, and a scrollable
 * time grid with one column per weekday. Renders the drag-ghost preview at
 * the day/time the active drag will land on, clamped to the visible week.
 */
export function TempoCalendarWeekView({
  date,
  events,
  startHour,
  endHour,
  onSelectEvent,
  onSelectSlot,
  dayColumnWidthRef,
  dragGhost,
  resizeGhost,
  onResizeStart,
}: WeekViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Measure the day-column width on mount + on resize so the parent drag
  // handler can convert horizontal pixel deltas into day offsets.
  useEffect(() => {
    if (!gridRef.current) return;
    const update = () => {
      const total = gridRef.current?.clientWidth ?? 0;
      // Grid is `64px_repeat(7,1fr)`; subtract the 64px gutter for accuracy.
      dayColumnWidthRef.current = total > 0 ? Math.max(1, (total - 64) / 7) : 0;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(gridRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [dayColumnWidthRef, weekStart]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  // Pre-position events per day
  const dayPositions = useMemo(() => {
    return days.map((d) =>
      positionEvents(getEventsForDay(events, d).filter((e) => !e.allDay), d, startHour),
    );
  }, [days, events, startHour]);

  const allDayPerDay = useMemo(
    () => days.map((d) => getAllDayEvents(getEventsForDay(events, d))),
    [days, events],
  );
  const hasAllDay = allDayPerDay.some((d) => d.length > 0);

  // Scroll to current time on mount and tick every minute
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

    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [days, startHour]);

  // Now line position (computed inline — cheap, no need to memoize)
  const nowOffset = (() => {
    const now = new Date();
    if (!days.some((d) => isSameDay(d, now))) return null;
    const minutesFromTop = (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromTop < 0 || minutesFromTop > (endHour - startHour) * 60) return null;
    return (minutesFromTop / 60) * HOUR_HEIGHT;
  })();

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if (!onSelectSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
    const hour = Math.min(endHour - 1, Math.max(startHour, Math.floor(y / HOUR_HEIGHT) + startHour));
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
            <div
              key={d.toISOString()}
              className="border-r border-border/40 last:border-r-0 p-1.5 space-y-1 min-h-[40px]"
            >
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
                <span className="text-[10px] text-muted-foreground px-1.5">
                  +{allDayPerDay[i].length - 3} more
                </span>
              )}
            </div>
          ))}
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
            <p className="text-sm font-medium text-foreground mb-1">Nothing scheduled this week</p>
            <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
              Click any time slot to add a task.
            </p>
          </div>
        )}
        <div
          ref={gridRef}
          className="relative grid grid-cols-[64px_repeat(7,1fr)]"
          style={{ height: (endHour - startHour) * HOUR_HEIGHT }}
        >
          {/* Hour gutter */}
          <div className="border-r border-border">
            {hours.map((h) => (
              <div key={h} data-hour={h} className="relative h-14 border-b border-border/40">
                <span className="absolute top-0 right-3 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-card px-1 tabular-nums">
                  {format(setHours(date, h), 'h a')}
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
                  <div key={h} data-hour={h} className="h-14 border-b border-border/30" />
                ))}
                {hours.slice(0, -1).map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 h-px bg-border/20 pointer-events-none"
                    style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {positioned.map((ev) => {
                  const width =
                    ev.totalColumns > 0
                      ? `calc((100% - 6px) / ${ev.totalColumns})`
                      : 'calc(100% - 6px)';
                  const left =
                    ev.totalColumns > 0
                      ? `calc(3px + (100% - 6px) * ${ev.column} / ${ev.totalColumns})`
                      : '3px';
                  return (
                    <DraggableEvent
                      key={ev.id}
                      event={ev}
                      onClick={(e) => onSelectEvent?.(e)}
                      draggable={ev.data?.source === 'task' && !ev.data?.is_locked}
                      isLocked={ev.data?.is_locked}
                      small
                      onResizeStart={ev.data?.source === 'task' && !ev.data?.is_locked ? (dir, y) => onResizeStart?.(ev.id, dir, y) : undefined}
                      positionStyle={{
                        top: ev.top,
                        height: Math.max(22, ev.height - 2),
                        left,
                        width,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Drag ghost — translucent preview at the target day/time */}
          {dragGhost &&
            (() => {
              const weekStartMidnight = startOfDay(weekStart);
              const ghostStartMidnight = startOfDay(dragGhost.newStart);
              const rawDayIdx = Math.round(
                (ghostStartMidnight.getTime() - weekStartMidnight.getTime()) / (24 * 60 * 60_000),
              );
              // Clamp to visible week (0..6) so the ghost stays on-screen
              // even if the user drags past the edge.
              const dayIdx = Math.max(0, Math.min(6, rawDayIdx));
              const dayDate = addDays(weekStart, dayIdx);
              const visibleStart = setMilliseconds(
                setSeconds(setMinutes(setHours(dayDate, startHour), 0), 0),
                0,
              );
              const minutesFromTop = differenceInMinutes(dragGhost.newStart, visibleStart);
              const durationMin = differenceInMinutes(dragGhost.newEnd, dragGhost.newStart);
              // Top is clamped to the visible window; the ghost extends out
              // of the top/bottom as needed so the user sees "this won't fit".
              const top = Math.max(0, (minutesFromTop / 60) * HOUR_HEIGHT);
              const visibleMaxTop = (endHour - startHour) * HOUR_HEIGHT;
              const height = Math.max(
                22,
                Math.min(visibleMaxTop - top, (durationMin / 60) * HOUR_HEIGHT),
              );
              // Position the ghost inside the target day column, just like DraggableEvent.
              const left = `calc(64px + 3px + (100% - 64px - 6px) * ${dayIdx} / 7)`;
              const width = `calc((100% - 64px - 6px) / 7)`;
              const variantClass =
                dragGhost.variant === 'warning'
                  ? 'bg-warning/20 border-warning text-foreground'
                  : dragGhost.variant === 'destructive'
                  ? 'bg-destructive/20 border-destructive text-foreground'
                  : dragGhost.variant === 'success'
                  ? 'bg-success/20 border-success text-foreground'
                  : dragGhost.variant === 'secondary'
                  ? 'bg-event-task/30 border-event-task-border text-foreground'
                  : dragGhost.variant === 'muted'
                  ? 'bg-muted border-muted-foreground/30 text-foreground'
                  : 'bg-primary/20 border-primary text-foreground';
              // Highlight the target column header
              const targetDay = days[dayIdx];
              const isOffWeek = rawDayIdx !== dayIdx;
              return (
                <>
                  {/* Column header highlight */}
                  <div
                    className="pointer-events-none absolute z-10 transition-colors"
                    style={{
                      // Header is `64px_repeat(7,1fr)`, height matches header
                      left: `calc(64px + (100% - 64px) * ${dayIdx} / 7)`,
                      width: `calc((100% - 64px) / 7)`,
                      top: -48,
                      height: 48,
                      background: 'oklch(var(--primary) / 0.08)',
                      borderTop: '2px solid oklch(var(--primary))',
                    }}
                    aria-hidden
                  >
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Drop on {format(targetDay, 'EEE d')}
                    </div>
                  </div>
                  {/* Ghost rectangle */}
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
                      <span className="font-semibold truncate text-[10px]">{dragGhost.title}</span>
                    </div>
                    <div className="text-[9px] opacity-75 num">
                      {format(dragGhost.newStart, 'h:mma')} - {format(dragGhost.newEnd, 'h:mma')}
                    </div>
                  </div>
                  {/* Edge indicator: ghost is clamped (drag went past visible week) */}
                  {isOffWeek && (
                    <div
                      className="absolute z-30 top-1 right-2 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-semibold pointer-events-none"
                      aria-hidden
                    >
                      {rawDayIdx < 0 ? '<- past week' : 'past week ->'}
                    </div>
                  )}
                </>
              );
            })()}

          {/* Resize ghost — translucent preview of new size */}
          {resizeGhost &&
            (() => {
              const weekStartMidnight = startOfDay(weekStart);
              const ghostStartMidnight = startOfDay(resizeGhost.newStart);
              const dayIdx = Math.round(
                (ghostStartMidnight.getTime() - weekStartMidnight.getTime()) / (24 * 60 * 60_000),
              );
              if (dayIdx < 0 || dayIdx > 6) return null;
              const dayDate = addDays(weekStart, dayIdx);
              const visibleStart = setMilliseconds(
                setSeconds(setMinutes(setHours(dayDate, startHour), 0), 0),
                0,
              );
              const minutesFromTop = differenceInMinutes(resizeGhost.newStart, visibleStart);
              const durationMin = differenceInMinutes(resizeGhost.newEnd, resizeGhost.newStart);
              const top = Math.max(0, (minutesFromTop / 60) * HOUR_HEIGHT);
              const visibleMaxTop = (endHour - startHour) * HOUR_HEIGHT;
              const height = Math.max(22, Math.min(visibleMaxTop - top, (durationMin / 60) * HOUR_HEIGHT));
              const left = `calc(64px + 3px + (100% - 64px - 6px) * ${dayIdx} / 7)`;
              const width = `calc((100% - 64px - 6px) / 7)`;
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

          {/* Now line (spans full week width) */}
          {nowOffset !== null && (
            <div
              className="absolute left-16 right-0 z-[5] pointer-events-none flex items-center"
              style={{ top: nowOffset }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary -ml-0.5" />
              <div className="flex-1 h-[0.5px] bg-primary/40" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

