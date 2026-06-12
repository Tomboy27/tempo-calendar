import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Clock, Calendar, MoreHorizontal, Trash2, ExternalLink, XCircle, AlertTriangle, Check, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import type { Task } from '../lib/types';
import { format, parseISO, isToday, isTomorrow, differenceInDays } from 'date-fns';

interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onScheduleAll: () => Promise<void>;
  onUnschedule: (id: string) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onReopenTask: (id: string) => Promise<void>;
  taskLists?: { id: string; name: string; color: string }[];
  /** Switch the workspace back to the calendar view (LeftRail owns nav,
   *  but this in-context affordance makes returning from tasks easier). */
  onBackToCalendar?: () => void;
}

const PRIORITY_DOTS: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/40',
  LOW: 'bg-muted-foreground/20',
};

const PRIORITY_LABELS: Record<string, string> = {
  ASAP: 'ASAP',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

function getUrgencyBadge(task: Task): { label: string; className: string } | null {
  if (!task.due_date) return null;
  const due = parseISO(task.due_date);
  if (isToday(due)) return { label: 'Due today', className: 'bg-destructive/10 text-destructive' };
  if (isTomorrow(due)) return { label: 'Tomorrow', className: 'bg-warning/10 text-warning' };
  const days = differenceInDays(due, new Date());
  if (days <= 3 && days >= 0) return { label: `${days}d left`, className: 'bg-warning/10 text-warning' };
  if (days < 0) return { label: 'Overdue', className: 'bg-overdue/10 text-overdue' };
  return null;
}

export function TaskList({
  tasks, isLoading, onAddTask, onEditTask, onDeleteTask, onScheduleAll, onUnschedule,
  onCompleteTask, onReopenTask, taskLists = [], onBackToCalendar,
}: TaskListProps) {
  const priorityRank: Record<string, number> = { ASAP: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

  // Extract unique lists from tasks
  const listCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'active') {
        const key = t.list_id || '__none__';
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const [activeListId, setActiveListId] = useState<string | null>(null);

  const activeTasks = useMemo(() => 
    tasks.filter((t) => t.status !== 'completed' && (activeListId === null || t.list_id === activeListId || (activeListId === '__none__' && !t.list_id))),
  [tasks, activeListId]);

  const hasLists = taskLists.length > 0 || listCounts.size > 1;
  const completedTasks = tasks
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  const unscheduled = activeTasks
    .filter((t) => !t.is_scheduled)
    .sort((a, b) => {
      const byPriority = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (byPriority !== 0) return byPriority;
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    });

  const scheduled = activeTasks
    .filter((t) => t.is_scheduled)
    .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''));

  const overdueCount = activeTasks.filter(t =>
    t.is_scheduled && t.scheduled_end && new Date(t.scheduled_end) < new Date() && t.status === 'active'
  ).length;

  // Overcommitment calculation
  const overcommitment = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekTasks = activeTasks.filter(t =>
      t.is_scheduled && t.scheduled_start && t.scheduled_end &&
      new Date(t.scheduled_start) >= now && new Date(t.scheduled_start) <= weekEnd
    );
    const scheduledMinutes = weekTasks.reduce((sum, t) => sum + t.duration_minutes, 0);
    const availableMinutes = 8 * 60 * 5; // 8 hours, 5 days
    const ratio = scheduledMinutes / availableMinutes;
    return { scheduledMinutes, availableMinutes, ratio, isOvercommitted: ratio > 0.85 };
  }, [activeTasks]);

  const [showCompleted, setShowCompleted] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const handleComplete = async (id: string) => {
    setCompletingIds(prev => new Set(prev).add(id));
    try {
      await onCompleteTask(id);
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBackToCalendar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToCalendar}
              className="h-8 w-8 -ml-1.5 shrink-0"
              title="Back to calendar"
              aria-label="Back to calendar"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          {unscheduled.length > 0 && (
            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-md">
              {unscheduled.length}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-xs font-medium bg-overdue/10 text-overdue px-2 py-0.5 rounded-md flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {overdueCount}
            </span>
          )}
          {completedTasks.length > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              aria-expanded={showCompleted}
              className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-md hover:bg-accent transition-colors"
            >
              {completedTasks.length} done
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unscheduled.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onScheduleAll} className="h-8 px-3 text-xs">
              Schedule all
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onAddTask} className="h-8 w-8" title="Add task">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Overcommitment warning */}
      {overcommitment.isOvercommitted && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/5 border-b border-warning/20">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="text-xs text-warning font-medium">
            {Math.round(overcommitment.ratio * 100)}% of this week is filled
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {Math.round(overcommitment.scheduledMinutes / 60)}h scheduled
          </span>
        </div>
      )}

      {/* List filter */}
      {hasLists && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveListId(null)}
            className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activeListId === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            All {activeListId === null && tasks.filter((t) => t.status !== 'completed').length}
          </button>
          {taskLists.map((list) => {
            const count = listCounts.get(list.id) || 0;
            if (count === 0) return null;
            return (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  activeListId === list.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color }} />
                {list.name} {count}
              </button>
            );
          })}
          {(listCounts.get('__none__') || 0) > 0 && (
            <button
              onClick={() => setActiveListId('__none__')}
              className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeListId === '__none__'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              No list {listCounts.get('__none__')}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No tasks yet</p>
            <p className="text-sm text-muted-foreground mb-5 max-w-[200px] leading-relaxed">
              Add something you want to get done. We'll find the right time for it.
            </p>
            <Button size="sm" onClick={onAddTask} className="h-9 gap-2 px-4">
              <Plus className="w-4 h-4" />
              New task
            </Button>
          </div>
        )}

        {unscheduled.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              Unscheduled
            </div>
            {unscheduled.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onUnschedule={onUnschedule}
                onComplete={handleComplete}
                isCompleting={completingIds.has(task.id)}
              />
            ))}
          </div>
        )}

        {scheduled.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              Scheduled
            </div>
            {scheduled.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onUnschedule={onUnschedule}
                onComplete={handleComplete}
                isScheduled
                isCompleting={completingIds.has(task.id)}
              />
            ))}
          </div>
        )}

        {showCompleted && completedTasks.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              Completed
            </div>
            {completedTasks.map((task) => (
              <CompletedTaskRow
                key={task.id}
                task={task}
                onReopen={onReopenTask}
                onDelete={onDeleteTask}
              />
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
  onComplete: (id: string) => Promise<void>;
  isScheduled?: boolean;
  isCompleting?: boolean;
}

function TaskRow({ task, onEdit, onDelete, onUnschedule, onComplete, isScheduled, isCompleting }: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
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
    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors group">
      {/* Completion checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete(task.id);
        }}
        disabled={isCompleting}
        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          isCompleting
            ? 'border-primary bg-primary/20'
            : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/10'
        }`}
        aria-label="Complete task"
      >
        {isCompleting ? (
          <div className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <Check className="w-3 h-3 text-primary opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>

      {/* Priority indicator */}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority] || 'bg-muted-foreground/20'}`} />

      {/* Content */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onEdit(task)}
      >
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${isOverdue ? 'text-overdue' : 'text-foreground'}`}>
            {task.title}
          </span>
          {task.is_locked && (
            <span className="text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded-md shrink-0">locked</span>
          )}
          {task.is_habit && (
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">habit</span>
          )}
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.duration_minutes}m
          </span>
          {task.due_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {format(parseISO(task.due_date), 'MMM d')}
            </span>
          )}
          {(() => {
            const urgency = getUrgencyBadge(task);
            return urgency ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${urgency.className}`}>
                {urgency.label}
              </span>
            ) : null;
          })()}
          {isScheduled && task.scheduled_start && (
            <span className="text-xs text-success flex items-center gap-1">
              {format(parseISO(task.scheduled_start), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
      </button>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({
              top: rect.bottom + 4,
              right: window.innerWidth - rect.right,
            });
            setConfirmDelete(false);
            setMenuOpen(!menuOpen);
          }}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors sm:opacity-60 sm:group-hover:opacity-100"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div
            className="fixed w-44 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-slide-down"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {confirmDelete ? (
              <div className="p-3">
                <p className="mb-3 text-sm leading-snug text-foreground">Delete this task?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(task.id);
                      setConfirmDelete(false);
                      setMenuOpen(false);
                    }}
                    className="flex-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Unschedule
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface CompletedTaskRowProps {
  task: Task;
  onReopen: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
}

function CompletedTaskRow({ task, onReopen, onDelete }: CompletedTaskRowProps) {
  const [reopening, setReopening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
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

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors group">
      {/* Completed checkmark */}
      <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
        <Check className="w-3 h-3 text-primary-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate text-muted-foreground line-through">
            {task.title}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.duration_minutes}m
          </span>
          {task.completed_at && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(task.completed_at), 'MMM d')}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({
              top: rect.bottom + 4,
              right: window.innerWidth - rect.right,
            });
            setConfirmDelete(false);
            setMenuOpen(!menuOpen);
          }}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors sm:opacity-60 sm:group-hover:opacity-100"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div
            className="fixed w-44 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-slide-down"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {confirmDelete ? (
              <div className="p-3">
                <p className="mb-3 text-sm leading-snug text-foreground">Delete this task?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(task.id);
                      setConfirmDelete(false);
                      setMenuOpen(false);
                    }}
                    className="flex-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setReopening(true);
                    await onReopen(task.id);
                    setReopening(false);
                    setMenuOpen(false);
                  }}
                  disabled={reopening}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reopen
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
