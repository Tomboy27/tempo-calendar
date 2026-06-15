import { useMemo } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
} from 'date-fns';
import { cn } from '../lib/utils';
import { CalendarDays } from 'lucide-react';
import {
  getEventsForDay,
  type CalendarEventType,
} from './TempoCalendarHelpers';

interface MonthViewProps {
  date: Date;
  events: CalendarEventType[];
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectDay?: (day: Date) => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Six-row month grid (Mon-Sun columns). Clicking a day jumps the calendar
 * to that day in single-day view; clicking an event pill opens it.
 */
export function TempoCalendarMonthView({
  date,
  events,
  onSelectEvent,
  onSelectDay,
}: MonthViewProps) {
  const monthStart = useMemo(
    () => startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1), { weekStartsOn: 1 }),
    [date],
  );
  const monthEnd = useMemo(
    () => endOfWeek(new Date(date.getFullYear(), date.getMonth() + 1, 0), { weekStartsOn: 1 }),
    [date],
  );
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

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Day name header */}
      <div className="grid grid-cols-7 border-b border-border bg-card/50">
        {DAY_NAMES.map((n) => (
          <div
            key={n}
            className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {n}
          </div>
        ))}
      </div>

      {/* Day grid — always visible so users can click days */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 relative">
        {/* Subtle empty-state overlay when no events */}
        {events.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-card/60 backdrop-blur-[1px] pointer-events-none" role="status">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <CalendarDays className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Nothing scheduled this month</p>
            <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
              Click a day to add a task.
            </p>
          </div>
        )}
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
