import { useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { Lock, GripVertical, Repeat } from 'lucide-react';
import { cn } from '../lib/utils';
import type { CalendarEventType } from './TempoCalendar';

interface DraggableEventProps {
  event: CalendarEventType;
  isLocked?: boolean;
  onClick: (event: CalendarEventType) => void;
  /** Disable drag (e.g., for google events we don't own) */
  draggable?: boolean;
  /** Small variant for week view */
  small?: boolean;
  /** Absolute positioning within the parent grid */
  positionStyle?: React.CSSProperties;
  /** Start resizing from top or bottom edge */
  onResizeStart?: (direction: 'top' | 'bottom', clientY: number) => void;
}

/**
 * Wraps a positioned event block with @dnd-kit drag support.
 * Clicking opens the event; dragging moves it on the calendar grid.
 *
 * Visual hierarchy:
 *   - Locked tasks: strong border + lock icon
 *   - Busy blocks: stronger background + bold title
 *   - Recurring tasks: repeat icon + warning border
 *   - Google events: muted + subtle dot indicator
 *   - Completed tasks: strikethrough + reduced opacity
 *   - Missed tasks: destructive border + reduced opacity
 */
export function DraggableEvent({
  event,
  isLocked,
  onClick,
  draggable = true,
  small,
  positionStyle,
  onResizeStart,
}: DraggableEventProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    disabled: !draggable || isLocked,
    data: { event },
  });

  // Track whether a drag just occurred to prevent the click event that
  // fires immediately after a drag ends from opening the task dialog.
  const dragJustFinished = useRef(false);
  const dragTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging) return;
    return () => {
      dragJustFinished.current = true;
      if (dragTimer.current) window.clearTimeout(dragTimer.current);
      dragTimer.current = window.setTimeout(() => {
        dragJustFinished.current = false;
      }, 120);
    };
  }, [isDragging]);

  const isCompleted = event.data?.is_completed;
  const isGoogle = event.data?.source === 'google';
  const isRecurring = event.data?.is_recurring;
  const isBusyBlock = event.data?.is_busy_block;

  const style: React.CSSProperties = {
    ...positionStyle,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : isCompleted ? 0.65 : 1,
    zIndex: isDragging ? 50 : 10,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(event);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        if (dragJustFinished.current) {
          dragJustFinished.current = false;
          return;
        }
        if (!isDragging) onClick(event);
      }}
      onKeyDown={handleKeyDown}
      data-event-id={event.id}
      role="button"
      tabIndex={0}
      aria-label={`${event.title} ${format(event.start, 'h:mma')} - ${format(event.end, 'h:mma')}`}
      className={cn(
        'absolute text-left px-1.5 py-1 rounded-md overflow-hidden transition-shadow duration-150',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'border-l-[2.5px] leading-tight group/event',
        !isDragging && 'hover:scale-[1.015]',
        small ? 'text-[10px]' : 'text-[11px]',
        isCompleted && 'line-through decoration-foreground/30',
        event.variant === 'primary' && 'bg-primary/12 border-primary text-foreground',
        event.variant === 'secondary' && 'bg-event-task/35 border-event-task-border text-foreground',
        event.variant === 'warning' && 'bg-warning/12 border-warning text-foreground',
        event.variant === 'destructive' && 'bg-destructive/12 border-destructive text-foreground',
        event.variant === 'success' && 'bg-success/12 border-success text-foreground',
        event.variant === 'muted' && 'bg-muted/60 border-muted-foreground/20 text-foreground',
        (!event.variant || event.variant === 'primary') && 'bg-primary/12 border-primary text-foreground',
        isDragging && 'cursor-grabbing shadow-xl ring-2 ring-primary/40',
        !isDragging && draggable && !isLocked && 'cursor-grab',
        isBusyBlock && 'bg-primary/20 border-primary font-semibold',
      )}
    >
      <div className="flex items-center gap-1">
        {isLocked && <Lock className="w-2.5 h-2.5 shrink-0 opacity-60" />}
        {isRecurring && <Repeat className="w-2.5 h-2.5 shrink-0 opacity-60" />}
        {isGoogle && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" title="Google Calendar" />}
        <span className={cn('font-semibold truncate', small ? 'text-[10px]' : 'text-[12px]', isCompleted && 'line-through')}>
          {event.title}
        </span>
        {draggable && !isLocked && !small && (
          <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover/event:opacity-50 ml-auto" />
        )}
      </div>
      {!small && event.end.getTime() - event.start.getTime() > 30 * 60 * 1000 && (
        <div className={cn('text-muted-foreground text-[10px] mt-0.5 num', isCompleted && 'line-through')}>
          {format(event.start, 'h:mma')} – {format(event.end, 'h:mma')}
        </div>
      )}

      {/* Resize handles — always visible on task events, not hover-only */}
      {draggable && !isLocked && onResizeStart && (
        <>
          {/* Top handle */}
          <div
            className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-30 opacity-40 hover:opacity-80 transition-opacity"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResizeStart('top', e.clientY);
            }}
            title="Drag to resize top"
          >
            <div className="h-full bg-foreground/30 rounded-full" />
          </div>
          {/* Bottom handle */}
          <div
            className="absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-30 opacity-40 hover:opacity-80 transition-opacity"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResizeStart('bottom', e.clientY);
            }}
            title="Drag to resize bottom"
          >
            <div className="h-full bg-foreground/30 rounded-full" />
          </div>
        </>
      )}
    </div>
  );
}
