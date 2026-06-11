import { useMemo, useCallback, type CSSProperties } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View, type Event } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: {},
});

// Drag-and-drop temporarily disabled — react-big-calendar's DnD addon has
// CJS/ESM interop issues with Vite production builds. Will be re-added
// with a custom implementation in a later phase.

export interface CalendarEventType {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  data?: Record<string, unknown>;
}

interface BigCalendarProps {
  events: CalendarEventType[];
  defaultView?: View;
  onSelectEvent?: (event: CalendarEventType) => void;
  onSelectSlot?: (slotInfo: { start: Date; end: Date }) => void;
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date) => void;
  className?: string;
  height?: number | string;
}

export function BigCalendar({
  events,
  defaultView = Views.WEEK,
  onSelectEvent,
  onSelectSlot,
  className = '',
  height = '100%',
}: BigCalendarProps) {
  const { formats, views } = useMemo(
    () => ({
      formats: {
        dateFormat: 'd',
        dayFormat: 'EEE d',
        weekdayFormat: 'EEE',
        monthHeaderFormat: 'MMMM yyyy',
        dayHeaderFormat: 'EEEE, MMM d',
        dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
          `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
        agendaDateFormat: 'MMM d',
        agendaTimeFormat: 'h:mm a',
        agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
          `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`,
        eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
          `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`,
        timeGutterFormat: 'h a',
      },
      views: [Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA],
    }),
    []
  );

  const handleSelectSlot = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      onSelectSlot?.({ start, end });
    },
    [onSelectSlot]
  );

  const handleSelectEvent = useCallback(
    (event: Event) => {
      onSelectEvent?.(event as unknown as CalendarEventType);
    },
    [onSelectEvent]
  );

  const eventPropGetter = useCallback(
    (event: Event) => {
      const calEvent = event as unknown as CalendarEventType;
      const source = calEvent.data?.source;
      const isLocked = calEvent.data?.is_locked;
      const isMissed = calEvent.data?.is_missed;
      const isFlexible = calEvent.data?.is_flexible;
      const isCompleted = calEvent.data?.is_completed;
      const color = calEvent.data?.color as string | undefined;

      const classes: string[] = [];
      if (source === 'task') {
        classes.push('event-task');
        if (isCompleted) classes.push('event-completed');
        if (isLocked && !isCompleted) classes.push('event-locked');
        if (isMissed && !isCompleted) classes.push('event-missed');
        if (isFlexible && !isCompleted) classes.push('event-flexible');
      } else {
        classes.push('event-google');
      }
      const eventClass = classes.join(' ');

      const style: CSSProperties = {};
      if (source === 'task' && color && !isCompleted) {
        style.backgroundColor = color + '22';
        style.borderLeftColor = color;
        style.color = color;
      }

      return { className: eventClass, style };
    },
    []
  );

  return (
    <div className={`big-calendar-wrapper ${className}`}>
      <Calendar
        localizer={localizer}
        events={events as unknown as Event[]}
        startAccessor={(e: Event) => (e as unknown as CalendarEventType).start}
        endAccessor={(e: Event) => (e as unknown as CalendarEventType).end}
        style={{ height }}
        defaultView={defaultView as View}
        views={views}
        formats={formats}
        scrollToTime={new Date(1970, 1, 1, 6)}
        eventPropGetter={eventPropGetter}
        onSelectEvent={handleSelectEvent}
        onSelectSlot={handleSelectSlot}
        selectable
        defaultDate={new Date()}
        min={new Date(1970, 1, 1, 6, 0, 0)}
        max={new Date(1970, 1, 1, 22, 0, 0)}
        step={30}
        timeslots={2}
      />
    </div>
  );
}
