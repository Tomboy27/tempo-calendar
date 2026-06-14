import { Plus, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

interface TaskListToolbarProps {
  /** Number of unscheduled active tasks (shown as primary badge; gates "Schedule all"). */
  unscheduledCount: number;
  /** Number of overdue tasks (shown as overdue badge; hidden when 0). */
  overdueCount: number;
  /** Number of completed tasks (shown as toggle button; hidden when 0). */
  completedCount: number;
  /** Whether the completed section is currently expanded. */
  showCompleted: boolean;
  /** Toggle the completed section. */
  onToggleCompleted: () => void;
  /** Schedule all unscheduled tasks. */
  onScheduleAll: () => Promise<void>;
  /** Add a new task. */
  onAddTask: () => void;
  /** Optional back-arrow to return to the calendar view. */
  onBackToCalendar?: () => void;
}

/**
 * Toolbar strip at the top of the TaskList sidebar.
 *
 * Pure presentational: receives counts + handlers as props, renders the
 * back arrow (optional), heading, count badges, the "Schedule all"
 * button (only when there are unscheduled tasks), and the "+" add
 * button. The completed-section toggle is a local-state setter that
 * lives in the orchestrator.
 */
export function TaskListToolbar({
  unscheduledCount,
  overdueCount,
  completedCount,
  showCompleted,
  onToggleCompleted,
  onScheduleAll,
  onAddTask,
  onBackToCalendar,
}: TaskListToolbarProps) {
  return (
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
        {unscheduledCount > 0 && (
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-md">
            {unscheduledCount}
          </span>
        )}
        {overdueCount > 0 && (
          <span className="text-xs font-medium bg-overdue/10 text-overdue px-2 py-0.5 rounded-md flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {overdueCount}
          </span>
        )}
        {completedCount > 0 && (
          <button
            onClick={onToggleCompleted}
            aria-expanded={showCompleted}
            className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-md hover:bg-accent transition-colors"
          >
            {completedCount} done
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {unscheduledCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onScheduleAll} className="h-8 px-3 text-xs">
            Schedule all
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onAddTask} className="h-8 w-8" title="Add task">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
