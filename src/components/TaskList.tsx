import { useState } from 'react';
import { Plus, Clock, Calendar, Zap, MoreHorizontal, Trash2, ExternalLink, XCircle } from 'lucide-react';
import { Card, CardHeader, CardContent } from './ui/card';
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

const PRIORITY_STYLES: Record<string, string> = {
  ASAP: 'bg-destructive/10 text-destructive',
  HIGH: 'bg-orange-100 text-orange-700',
  NORMAL: 'bg-secondary text-secondary-foreground',
  LOW: 'bg-muted text-muted-foreground',
};

export function TaskList({
  tasks, isLoading, onAddTask, onEditTask, onDeleteTask, onScheduleAll, onUnschedule,
}: TaskListProps) {
  const [scheduling, setScheduling] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const unscheduled = tasks.filter((t) => !t.is_scheduled);
  const scheduled = tasks.filter((t) => t.is_scheduled);

  const handleScheduleAll = async () => {
    setScheduling(true);
    await onScheduleAll();
    setScheduling(false);
  };

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:border-primary transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <h3 className="text-foreground">Tasks</h3>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{unscheduled.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {unscheduled.length > 0 && (
            <Button
              size="sm"
              onClick={handleScheduleAll}
              disabled={scheduling}
            >
              {scheduling ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scheduling...</>
              ) : (
                <><Zap className="w-3.5 h-3.5" /> Schedule All</>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddTask}
          >
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 pb-0">
      <div className="divide-y divide-border">
        {unscheduled.length === 0 && scheduled.length === 0 && (
          <div className="text-center py-16 text-muted-foreground px-6">
            <p className="font-medium">No Tasks</p>
            <button onClick={onAddTask} className="mt-3 text-primary hover:text-primary/80 underline underline-offset-2">
              Add Your First Task
            </button>
          </div>
        )}

        {unscheduled.map((task) => (
          <TaskRow key={task.id} task={task} menuOpen={menuOpen} onMenuToggle={setMenuOpen} onEdit={onEditTask} onDelete={onDeleteTask} onUnschedule={onUnschedule} />
        ))}
      </div>

        {scheduled.length > 0 && (
          <>
            <div className="px-6 py-3 bg-muted border-t border-border border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Scheduled ({scheduled.length})</span>
            </div>
          <div className="divide-y divide-border">
            {scheduled.map((task) => (
              <TaskRow key={task.id} task={task} menuOpen={menuOpen} onMenuToggle={setMenuOpen} onEdit={onEditTask} onDelete={onDeleteTask} onUnschedule={onUnschedule} isScheduled />
            ))}
          </div>
        </>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin mr-2" />
          Loading
        </div>
      )}
      </CardContent>
    </Card>
  );
}

interface TaskRowProps {
  task: Task;
  menuOpen: string | null;
  onMenuToggle: (id: string | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onUnschedule: (id: string) => Promise<void>;
  isScheduled?: boolean;
}

function TaskRow({ task, menuOpen, onMenuToggle, onEdit, onDelete, onUnschedule, isScheduled }: TaskRowProps) {
  const [unscheduling, setUnscheduling] = useState(false);

  return (
    <div className="flex items-start gap-4 px-6 py-3 hover:bg-accent transition-colors group">
      <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ backgroundColor: task.color || '#D97706' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_STYLES[task.priority] || 'bg-muted text-muted-foreground'}`}>
            {task.priority}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />{task.duration_minutes}m
          </span>
          {task.due_date && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />{format(parseISO(task.due_date), 'MMM d')}
            </span>
          )}
          {isScheduled && task.scheduled_start && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Calendar className="w-3 h-3" />{format(parseISO(task.scheduled_start), 'MMM d, h:mm a')}
            </span>
          )}
          {task.is_habit && <span className="text-xs text-muted-foreground">Habit</span>}
          {task.is_locked && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">
              &#128274; Locked
            </span>
          )}
          {!task.auto_schedule && task.status === 'active' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
              Manual
            </span>
          )}
          {task.deadline && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-600">
              Due {format(parseISO(task.deadline), 'MMM d')}
            </span>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <button
          onClick={() => onMenuToggle(menuOpen === task.id ? null : task.id)}
          className="p-1 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen === task.id && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-popover rounded-md shadow-lg border border-border z-30 overflow-hidden">
            <button onClick={() => { onEdit(task); onMenuToggle(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Edit
            </button>
            {isScheduled && (
              <button onClick={async () => { setUnscheduling(true); await onUnschedule(task.id); setUnscheduling(false); onMenuToggle(null); }} disabled={unscheduling} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Unschedule
              </button>
            )}
            <button onClick={() => { onDelete(task.id); onMenuToggle(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}