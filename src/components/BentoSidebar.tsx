import { useEffect, useState, useRef, useMemo } from 'react';
import { format, parseISO, isToday, isTomorrow, differenceInDays, differenceInMinutes, isPast } from 'date-fns';
import { Plus, Clock, AlertTriangle, Zap, Calendar, CheckCircle2, TrendingUp, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Task } from '../lib/types';

interface BentoSidebarProps {
  tasks: Task[];
  conflictCount: number;
  isLoading?: boolean;
  onQuickAdd: (title: string) => void;
  onAddTask: () => void;
  onSelectTask: (task: Task) => void;
  onViewAllTasks: () => void;
  onScheduleAll: () => void;
  isScheduling?: boolean;
}

// ============================================================
// NumberTicker — smooth animated counter
// ============================================================

function NumberTicker({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;
    const duration = 480;
    const startTime = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={cn('tabular-nums', className)}>{display}</span>;
}

// ============================================================
// BentoCard — surface for a stat
// ============================================================

interface BentoCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'warning' | 'destructive' | 'success';
  className?: string;
}

function BentoCard({ children, variant = 'default', className }: BentoCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-3 transition-all',
        variant === 'default' && 'bg-card border-border',
        variant === 'primary' && 'bg-primary/5 border-primary/20',
        variant === 'warning' && 'bg-warning/5 border-warning/20',
        variant === 'destructive' && 'bg-destructive/5 border-destructive/20',
        variant === 'success' && 'bg-success/5 border-success/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// QuickAdd — inline task creation
// ============================================================

function QuickAdd({ onSubmit, onAdvanced }: { onSubmit: (title: string) => void; onAdvanced: () => void }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'group relative flex items-center gap-2 rounded-xl border bg-card transition-all',
        focused ? 'border-primary/40 shadow-sm' : 'border-border hover:border-muted-foreground/30',
      )}
    >
      <div className="pl-3 text-muted-foreground">
        <Plus className={cn('w-4 h-4 transition-transform', focused && 'rotate-90 text-primary')} />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="What needs doing?"
        className="flex-1 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {value.trim() && (
        <button
          type="submit"
          className="mr-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors animate-scale-in"
        >
          Add
        </button>
      )}
      <button
        type="button"
        onClick={onAdvanced}
        className="mr-1.5 p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="More options"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}

// ============================================================
// UpNext — current/next thing happening
// ============================================================

function UpNext({ task }: { task: Task | null }) {
  if (!task) {
    return (
      <div className="text-xs text-muted-foreground leading-relaxed">
        Nothing on the calendar. Use this space to focus.
      </div>
    );
  }

  const start = task.scheduled_start ? parseISO(task.scheduled_start) : null;
  const minutesUntil = start ? differenceInMinutes(start, new Date()) : null;
  const isLive = start && task.scheduled_end && new Date() >= start && new Date() <= parseISO(task.scheduled_end);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {isLive ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Now
          </>
        ) : (
          <>
            <Clock className="w-3 h-3" />
            {minutesUntil !== null && minutesUntil > 0
              ? `In ${minutesUntil < 60 ? `${minutesUntil}m` : `${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`}`
              : 'Today'}
          </>
        )}
      </div>
      <div className="text-sm font-semibold text-foreground leading-snug">{task.title}</div>
      {start && (
        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
          {format(start, 'h:mm a')}
          {task.scheduled_end && ` - ${format(parseISO(task.scheduled_end), 'h:mm a')}`}
          {' '}
          <span className="text-foreground/60">·</span>
          {' '}
          {task.duration_minutes}m
        </div>
      )}
    </div>
  );
}

// ============================================================
// TaskPreview — small task row for the sidebar
// ============================================================

const PRIORITY_DOTS: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/40',
  LOW: 'bg-muted-foreground/20',
};

function TaskPreview({ task, onClick }: { task: Task; onClick: () => void }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  let dueLabel: string | null = null;
  let dueClass = 'text-muted-foreground';
  if (due) {
    if (isToday(due)) {
      dueLabel = 'Today';
      dueClass = 'text-destructive font-semibold';
    } else if (isTomorrow(due)) {
      dueLabel = 'Tomorrow';
      dueClass = 'text-warning font-medium';
    } else if (isPast(due)) {
      dueLabel = 'Overdue';
      dueClass = 'text-overdue font-semibold';
    } else {
      const days = differenceInDays(due, new Date());
      if (days <= 7) {
        dueLabel = format(due, 'EEE');
        dueClass = 'text-muted-foreground';
      } else {
        dueLabel = format(due, 'MMM d');
        dueClass = 'text-muted-foreground';
      }
    }
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-1.5 px-1 -mx-1 rounded-md hover:bg-accent/40 transition-colors text-left group"
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[task.priority] || 'bg-muted-foreground/20')}
        style={task.color ? { backgroundColor: task.color } : undefined}
      />
      <span className="flex-1 min-w-0 text-sm text-foreground truncate font-medium">{task.title}</span>
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{task.duration_minutes}m</span>
      {dueLabel && (
        <span className={cn('text-[10px] shrink-0 tabular-nums', dueClass)}>{dueLabel}</span>
      )}
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ============================================================
// Main BentoSidebar
// ============================================================

export function BentoSidebar({
  tasks,
  conflictCount,
  isLoading,
  onQuickAdd,
  onAddTask,
  onSelectTask,
  onViewAllTasks,
  onScheduleAll,
  isScheduling,
}: BentoSidebarProps) {
  // Stats
  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks]);
  const unscheduled = useMemo(() => activeTasks.filter((t) => !t.is_scheduled), [activeTasks]);
  const scheduled = useMemo(() => activeTasks.filter((t) => t.is_scheduled), [activeTasks]);
  const today = useMemo(() => activeTasks.filter((t) => t.is_scheduled && t.scheduled_start && isToday(parseISO(t.scheduled_start))), [activeTasks]);
  const overdue = useMemo(() => activeTasks.filter((t) => t.is_scheduled && t.scheduled_end && isPast(parseISO(t.scheduled_end))), [activeTasks]);

  // Up next
  const upNext = useMemo(() => {
    const now = new Date();
    const upcoming = scheduled
      .filter((t) => t.scheduled_end && parseISO(t.scheduled_end) > now)
      .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''));
    return upcoming[0] || null;
  }, [scheduled]);

  // Top 3 unscheduled (priority + due date)
  const topUnscheduled = useMemo(() => {
    const rank: Record<string, number> = { ASAP: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return [...unscheduled]
      .sort((a, b) => {
        const pr = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
        if (pr !== 0) return pr;
        return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
      })
      .slice(0, 4);
  }, [unscheduled]);

  const completionRate = useMemo(() => {
    const total = tasks.length;
    if (total === 0) return 0;
    const done = tasks.filter((t) => t.status === 'completed').length;
    return Math.round((done / total) * 100);
  }, [tasks]);

  const totalMinutesScheduledToday = useMemo(() => {
    return today.reduce((sum, t) => sum + t.duration_minutes, 0);
  }, [today]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Quick add */}
      <div className="px-4 py-3 border-b border-border">
        <QuickAdd onSubmit={onQuickAdd} onAdvanced={onAddTask} />
      </div>

      {/* Bento grid of stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
          <BentoCard variant="primary" className="col-span-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary mb-1.5">
              <Zap className="w-3 h-3" />
              Up next
            </div>
            <UpNext task={upNext} />
          </BentoCard>

          <BentoCard variant={conflictCount > 0 ? 'warning' : 'default'}>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              <AlertTriangle className={cn('w-3 h-3', conflictCount > 0 && 'text-warning')} />
              Conflicts
            </div>
            <div className={cn('text-2xl font-semibold leading-none', conflictCount > 0 ? 'text-warning' : 'text-foreground')}>
              <NumberTicker value={conflictCount} />
            </div>
          </BentoCard>

          <BentoCard variant="default">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              <TrendingUp className="w-3 h-3" />
              Done
            </div>
            <div className="text-2xl font-semibold leading-none text-foreground">
              <NumberTicker value={completionRate} />
              <span className="text-sm text-muted-foreground font-normal">%</span>
            </div>
          </BentoCard>

          <BentoCard variant={overdue.length > 0 ? 'destructive' : 'default'}>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              <Clock className={cn('w-3 h-3', overdue.length > 0 && 'text-destructive')} />
              Overdue
            </div>
            <div className={cn('text-2xl font-semibold leading-none', overdue.length > 0 ? 'text-destructive' : 'text-foreground')}>
              <NumberTicker value={overdue.length} />
            </div>
          </BentoCard>

          <BentoCard variant="default">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              <Calendar className="w-3 h-3" />
              Today
            </div>
            <div className="text-2xl font-semibold leading-none text-foreground">
              <NumberTicker value={Math.round(totalMinutesScheduledToday / 60)} />
              <span className="text-sm text-muted-foreground font-normal">h</span>
            </div>
          </BentoCard>
        </div>
      </div>

      {/* Today section */}
      {today.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="w-3 h-3" />
              Today
              <span className="text-foreground/40 font-normal normal-case tracking-normal">
                · {today.length}
              </span>
            </div>
          </div>
          <div className="space-y-0.5">
            {today.slice(0, 4).map((t) => (
              <TaskPreview key={t.id} task={t} onClick={() => onSelectTask(t)} />
            ))}
            {today.length > 4 && (
              <button
                onClick={onViewAllTasks}
                className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 px-1 -mx-1"
              >
                +{today.length - 4} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unscheduled section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            Inbox
            <span className="text-foreground/40 font-normal normal-case tracking-normal">
              · {unscheduled.length}
            </span>
          </div>
          {unscheduled.length > 0 && (
            <button
              onClick={onScheduleAll}
              disabled={isScheduling}
              className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {isScheduling ? (
                <>
                  <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Planning
                </>
              ) : (
                <>Schedule all</>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 tempo-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : topUnscheduled.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">Inbox zero</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Add a task above and we'll find time.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {topUnscheduled.map((t) => (
                <TaskPreview key={t.id} task={t} onClick={() => onSelectTask(t)} />
              ))}
              {unscheduled.length > topUnscheduled.length && (
                <button
                  onClick={onViewAllTasks}
                  className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1.5 px-1 -mx-1 mt-1"
                >
                  View all {unscheduled.length} tasks →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
