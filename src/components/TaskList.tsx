import { useState, useRef, useEffect } from 'react';
import { Plus, Clock, Calendar, MoreHorizontal, Trash2, ExternalLink, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import type { Task } from '../lib/types';
import { format, parseISO } from 'date-fns';

interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onScheduleAll: () => Promise<void>;
  onUnschedule: (id: string) => Promise<void>;
}

const PRIORITY_DOTS: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/40',
  LOW: 'bg-muted-foreground/20',
};

export function TaskList({
  tasks, isLoading, onAddTask, onEditTask, onDeleteTask, onScheduleAll, onUnschedule,
}: TaskListProps) {
  const unscheduled = tasks.filter((t) => !t.is_scheduled);
  const scheduled = tasks.filter((t) => t.is_scheduled);
  const overdueCount = tasks.filter(t =>
    t.is_scheduled && t.scheduled_end && new Date(t.scheduled_end) < new Date() && t.status === 'active'
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-foreground">Tasks</h2>
          {unscheduled.length > 0 && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {unscheduled.length}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] font-medium bg-overdue/10 text-overdue px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              {overdueCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unscheduled.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onScheduleAll} className="h-6 px-2 text-[11px]">
              Schedule all
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onAddTask} className="h-6 w-6" title="Add task">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-medium text-foreground mb-1">No tasks yet</p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Create a task to get started with auto-scheduling.
            </p>
            <Button size="sm" onClick={onAddTask} className="h-7 gap-1.5">
              <Plus className="w-3 h-3" />
              New task
            </Button>
          </div>
        )}

        {unscheduled.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
              Unscheduled
            </div>
            {unscheduled.map((task) => (
              <TaskRow key={task.id} task={task} onEdit={onEditTask} onDelete={onDeleteTask} onUnschedule={onUnschedule} />
            ))}
          </div>
        )}

        {scheduled.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
              Scheduled
            </div>
            {scheduled.map((task) => (
              <TaskRow key={task.id} task={task} onEdit={onEditTask} onDelete={onDeleteTask} onUnschedule={onUnschedule} isScheduled />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onUnschedule: (id: string) => Promise<void>;
  isScheduled?: boolean;
}

function TaskRow({ task, onEdit, onDelete, onUnschedule, isScheduled }: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  const isOverdue = task.is_scheduled && task.scheduled_end && new Date(task.scheduled_end) < new Date() && task.status === 'active';

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors group cursor-pointer border-b border-border/50"
      onClick={() => onEdit(task)}
    >
      {/* Priority indicator */}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority] || 'bg-muted-foreground/20'}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium truncate ${isOverdue ? 'text-overdue' : 'text-foreground'}`}>
            {task.title}
          </span>
          {task.is_locked && (
            <span className="text-[9px] font-medium text-success bg-success/10 px-1 py-px rounded shrink-0">locked</span>
          )}
          {task.is_habit && (
            <span className="text-[9px] font-medium text-muted-foreground bg-muted px-1 py-px rounded shrink-0">habit</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {task.duration_minutes}m
          </span>
          {task.due_date && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              {format(parseISO(task.due_date), 'MMM d')}
            </span>
          )}
          {isScheduled && task.scheduled_start && (
            <span className="text-[10px] text-success flex items-center gap-0.5">
              {format(parseISO(task.scheduled_start), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="More actions"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-md shadow-md z-30 py-0.5 animate-slide-down">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(task); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Edit
            </button>
            {isScheduled && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setUnscheduling(true);
                  await onUnschedule(task.id);
                  setUnscheduling(false);
                  setMenuOpen(false);
                }}
                disabled={unscheduling}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" />
                Unschedule
              </button>
            )}
            <div className="border-t border-border my-0.5" />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}