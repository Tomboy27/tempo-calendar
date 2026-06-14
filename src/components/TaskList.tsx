import { useState, useMemo } from 'react';
import { AlertTriangle, Plus, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import type { Task, Subtask } from '../lib/types';
import { TaskRow, CompletedTaskRow } from './TaskRow';
import { TaskFilters } from './TaskFilters';
import { TaskListToolbar } from './TaskListToolbar';

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
  /** Subtask map for the current task list. Keys are task IDs. */
  subtasksByTaskId?: Map<string, Subtask[]>;
}

const NO_LIST_KEY = '__none__';

const PRIORITY_RANK: Record<string, number> = { ASAP: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

/**
 * TaskList — task sidebar with sort/filter, schedule, complete, and reopen.
 *
 * The orchestrator owns the cross-row state (active list filter, completed
 * section visibility, in-flight completion tracking) and the derived
 * data (counts, sorted active/completed slices, overcommitment ratio).
 * Sibling files own the per-row, per-filter, and per-toolbar rendering:
 *   - TaskListToolbar  — top toolbar strip (counts, schedule-all, add)
 *   - TaskFilters      — list-filter chip row
 *   - TaskRow          — active task row (checkbox, priority, content, menu)
 *   - CompletedTaskRow — completed task row (read-only summary, Reopen menu)
 */
export function TaskList({
  tasks,
  isLoading,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onScheduleAll,
  onUnschedule,
  onCompleteTask,
  onReopenTask,
  taskLists = [],
  onBackToCalendar,
  subtasksByTaskId,
}: TaskListProps) {
  // Extract unique lists from tasks
  const listCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'active') {
        const key = t.list_id || NO_LIST_KEY;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const [activeListId, setActiveListId] = useState<string | null>(null);

  const totalActiveCount = useMemo(
    () => tasks.filter((t) => t.status !== 'completed').length,
    [tasks],
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== 'completed' &&
          (activeListId === null ||
            t.list_id === activeListId ||
            (activeListId === NO_LIST_KEY && !t.list_id)),
      ),
    [tasks, activeListId],
  );

  const hasLists = taskLists.length > 0 || listCounts.size > 1;

  const completedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'completed')
        .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [tasks],
  );

  const unscheduled = useMemo(
    () =>
      activeTasks
        .filter((t) => !t.is_scheduled)
        .sort((a, b) => {
          const byPriority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
          if (byPriority !== 0) return byPriority;
          return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
        }),
    [activeTasks],
  );

  const scheduled = useMemo(
    () =>
      activeTasks
        .filter((t) => t.is_scheduled)
        .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || '')),
    [activeTasks],
  );

  const overdueCount = useMemo(
    () =>
      activeTasks.filter(
        (t) =>
          t.is_scheduled &&
          t.scheduled_end &&
          new Date(t.scheduled_end) < new Date() &&
          t.status === 'active',
      ).length,
    [activeTasks],
  );

  // Overcommitment calculation
  const overcommitment = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekTasks = activeTasks.filter(
      (t) =>
        t.is_scheduled &&
        t.scheduled_start &&
        t.scheduled_end &&
        new Date(t.scheduled_start) >= now &&
        new Date(t.scheduled_start) <= weekEnd,
    );
    const scheduledMinutes = weekTasks.reduce((sum, t) => sum + t.duration_minutes, 0);
    const availableMinutes = 8 * 60 * 5; // 8 hours, 5 days
    const ratio = scheduledMinutes / availableMinutes;
    return { scheduledMinutes, ratio, isOvercommitted: ratio > 0.85 };
  }, [activeTasks]);

  const [showCompleted, setShowCompleted] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const handleComplete = async (id: string) => {
    setCompletingIds((prev) => new Set(prev).add(id));
    try {
      await onCompleteTask(id);
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TaskListToolbar
        unscheduledCount={unscheduled.length}
        overdueCount={overdueCount}
        completedCount={completedTasks.length}
        showCompleted={showCompleted}
        onToggleCompleted={() => setShowCompleted(!showCompleted)}
        onScheduleAll={onScheduleAll}
        onAddTask={onAddTask}
        onBackToCalendar={onBackToCalendar}
      />

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
        <TaskFilters
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          taskLists={taskLists}
          listCounts={listCounts}
          totalActiveCount={totalActiveCount}
        />
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
                subtasks={subtasksByTaskId?.get(task.id)}
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
                subtasks={subtasksByTaskId?.get(task.id)}
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
