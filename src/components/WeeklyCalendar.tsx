import { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import type { CalendarEvent } from '../lib/google';

interface WeeklyCalendarProps {
  events: CalendarEvent[];
  isLoading?: boolean;
}

export function WeeklyCalendar({ events, isLoading }: WeeklyCalendarProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const dayEvents = events.filter((e) => {
        const eventDate = parseISO(e.startTime);
        return isSameDay(eventDate, date);
      }).sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

      return { date, events: dayEvents };
    });
  }, [events, weekStart]);

  const today = new Date();

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-3">
        <div className="flex items-center justify-center py-8">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold text-foreground">This week</span>
      </div>
      <div className="divide-y divide-border/50">
        {days.map(({ date, events: dayEvents }) => {
          const isToday = isSameDay(date, today);
          return (
            <div key={date.toISOString()} className={`px-3 py-1.5 ${isToday ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(date, 'EEE')}
                </span>
                <span className={`text-[10px] ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                  {format(date, 'd')}
                </span>
              </div>
              {dayEvents.length > 0 ? (
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div key={e.id} className="text-[9px] text-muted-foreground truncate">
                      <span className="text-foreground/70">{format(parseISO(e.startTime), 'h:mm a')}</span>
                      {' '}{e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              ) : (
                <div className="text-[9px] text-muted-foreground/50">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}