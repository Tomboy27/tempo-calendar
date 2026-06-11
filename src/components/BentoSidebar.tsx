import { useEffect, useState, useRef, useMemo } from 'react';
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  differenceInDays,
  differenceInMinutes,
  isPast,
  addDays,
  startOfDay,
  endOfDay,
  isWithinInterval,
  subDays,
} from 'date-fns';
import {
  Plus,
  Clock,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Flame,
  ArrowUpRight,
  Sun,
} from 'lucide-react';
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
// NowCard — live "what's happening this hour" with progress
// ============================================================

function NowCard({ current, upNext, onSelect }: { current: Task | null; upNext: Task | null; onSelect: (t: Task) => void }) {
  // Track now in state so the progress bar and countdown re-render every 30s.
  // Reading Date.now() directly in the render body is impure and trips the
  // react-hooks/purity lint rule.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (current) {
    const start = parseISO(current.scheduled_start!);
    const end = parseISO(current.scheduled_end!);
    const total = end.getTime() - start.getTime();
    const elapsed = Math.max(0, Math.min(total, now - start.getTime()));
    const progressPct = total > 0 ? (elapsed / total) * 100 : 0;
    const minutesLeft = Math.max(0, differenceInMinutes(end, new Date(now)));

    return (
      <button
        type="button"
        onClick={() => onSelect(current)}
        className="relative overflow-hidden rounded-xl border p-3 transition-all text-left w-full bg-primary/5 border-primary/20 hover:border-primary/40 cursor-pointer"
        aria-label={`Current task: ${current.title}, ${minutesLeft} minutes left`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Now
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
            {minutesLeft > 0 ? `${minutesLeft}m left` : 'Wrapping up'}
          </span>
        </div>
        <div className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {current.title}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
        </div>
        {/* Progress bar with ARIA semantics */}
        <div
          className="mt-2 h-1 rounded-full bg-primary/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Time elapsed in current task"
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </button>
    );
  }

  // Fallback: show up next
  if (upNext) {
    const start = upNext.scheduled_start ? parseISO(upNext.scheduled_start) : null;
    const minutesUntil = start ? differenceInMinutes(start, new Date(now)) : null;

    return (
      <button
        type="button"
        onClick={() => onSelect(upNext)}
        className="relative overflow-hidden rounded-xl border p-3 transition-all text-left w-full bg-card border-border hover:border-muted-foreground/40 cursor-pointer"
        aria-label={`Up next: ${upNext.title}`}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          <Clock className="w-3 h-3" />
          {minutesUntil !== null && minutesUntil > 0
            ? `Up next · in ${minutesUntil < 60 ? `${minutesUntil}m` : `${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`}`
            : 'Up next'}
        </div>
        <div className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {upNext.title}
        </div>
        {start && (
          <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {format(start, 'h:mm a')}
            {upNext.scheduled_end && ` – ${format(parseISO(upNext.scheduled_end), 'h:mm a')}`}
          </div>
        )}
      </button>
    );
  }

  return (
    <BentoCard variant="default">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        <Sun className="w-3 h-3" />
        Free hour
      </div>
      <div className="text-sm font-medium text-foreground leading-snug">
        Nothing on the calendar.
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
        Use this space to focus, or plan tomorrow below.
      </div>
    </BentoCard>
  );
}

// ============================================================
// StreakCard — consecutive completion days
// ============================================================

/**
 * Compute the user's current streak: the number of consecutive days,
 * counting backwards from today, where at least one task was completed.
 * If today has no completions yet, the streak from yesterday is still
 * considered "alive" (you haven't broken it until tomorrow).
 */
function computeCurrentStreak(tasks: Task[]): number {
  const dates = new Set<string>();
  for (const t of tasks) {
    if (t.completion_history) {
      for (const d of t.completion_history) {
        // Accept either ISO datetime or YYYY-MM-DD
        dates.add(d.length >= 10 ? d.slice(0, 10) : d);
      }
    }
    if (t.completed_at) {
      dates.add(t.completed_at.slice(0, 10));
    }
  }
  if (dates.size === 0) return 0;

  let cursor = new Date();
  // If today isn't in the set, start from yesterday (streak still alive)
  if (!dates.has(format(cursor, 'yyyy-MM-dd'))) {
    cursor = subDays(cursor, 1);
  }
  let streak = 0;
  while (dates.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

function StreakCard({ streak }: { streak: number }) {
  const isAlive = streak > 0;
  return (
    <BentoCard variant={isAlive ? 'success' : 'default'} className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isAlive ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
        )}
      >
        <Flame className={cn('h-4 w-4', isAlive && 'fill-warning/30')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-foreground tabular-nums leading-none">
            <NumberTicker value={streak} />
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {streak === 1 ? 'day' : 'days'}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isAlive ? 'Current streak' : 'No streak yet'}
        </div>
      </div>
    </BentoCard>
  );
}

// ============================================================
// TomorrowPreview — next day's schedule
// ============================================================

const PRIORITY_DOTS: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/40',
  LOW: 'bg-muted-foreground/20',
};

function TomorrowPreview({
  tasks,
  onSelect,
  onAddTask,
}: {
  tasks: Task[];
  onSelect: (t: Task) => void;
  onAddTask: () => void;
}) {
  const tomorrow = useMemo(() => addDays(new Date(), 1), []);
  const tomorrowLabel = format(tomorrow, 'EEEE');
  const tomorrowShort = format(tomorrow, 'MMM d');

  if (tasks.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ArrowUpRight className="w-3 h-3" />
            Tomorrow
            <span className="text-foreground/40 font-normal normal-case tracking-normal">
              · {tomorrowShort}
            </span>
          </div>
        </div>
        <button
          onClick={onAddTask}
          className="w-full rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <div className="font-medium text-foreground mb-0.5">Tomorrow is wide open.</div>
          <div className="leading-relaxed">Plan something to make {tomorrowLabel} count.</div>
        </button>
      </div>
    );
  }

  const visible = tasks.slice(0, 3);
  const more = tasks.length - visible.length;

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ArrowUpRight className="w-3 h-3" />
          Tomorrow
          <span className="text-foreground/40 font-normal normal-case tracking-normal">
            · {tomorrowLabel} {tomorrowShort}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>
      <div className="space-y-0.5">
        {visible.map((t) => {
          const start = t.scheduled_start ? parseISO(t.scheduled_start) : null;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full flex items-center gap-2 py-1.5 px-1 -mx-1 rounded-md hover:bg-accent/40 transition-colors text-left group"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  PRIORITY_DOTS[t.priority] || 'bg-muted-foreground/20',
                )}
                style={t.color ? { backgroundColor: t.color } : undefined}
              />
              {start && (
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-12">
                  {format(start, 'h:mma')}
                </span>
              )}
              <span className="flex-1 min-w-0 text-sm text-foreground truncate font-medium">
                {t.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {t.duration_minutes}m
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
        {more > 0 && (
          <div className="text-[10px] text-muted-foreground px-1 pt-0.5">
            +{more} more
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TaskPreview — small task row for the sidebar
// ============================================================

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
  const today = useMemo(
    () =>
      activeTasks.filter(
        (t) => t.is_scheduled && t.scheduled_start && isToday(parseISO(t.scheduled_start)),
      ),
    [activeTasks],
  );
  const overdue = useMemo(
    () =>
      activeTasks.filter(
        (t) => t.is_scheduled && t.scheduled_end && isPast(parseISO(t.scheduled_end)),
      ),
    [activeTasks],
  );

  // Current task (happening right now) — start <= now <= end
  const currentTask = useMemo(() => {
    const now = new Date();
    return (
      scheduled.find(
        (t) =>
          t.scheduled_start &&
          t.scheduled_end &&
          parseISO(t.scheduled_start) <= now &&
          now <= parseISO(t.scheduled_end),
      ) || null
    );
  }, [scheduled]);

  // Up next — first scheduled task that hasn't ended yet (and isn't the current one)
  const upNext = useMemo(() => {
    const now = new Date();
    return (
      scheduled
        .filter(
          (t) =>
            t.scheduled_end &&
            parseISO(t.scheduled_end) > now &&
            t.id !== currentTask?.id,
        )
        .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''))[0] || null
    );
  }, [scheduled, currentTask]);

  // Tomorrow's scheduled tasks
  const tomorrowTasks = useMemo(() => {
    const tStart = startOfDay(addDays(new Date(), 1));
    const tEnd = endOfDay(addDays(new Date(), 1));
    return scheduled
      .filter(
        (t) =>
          t.scheduled_start &&
          isWithinInterval(parseISO(t.scheduled_start), { start: tStart, end: tEnd }),
      )
      .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''));
  }, [scheduled]);

  // Current completion streak
  const currentStreak = useMemo(() => computeCurrentStreak(tasks), [tasks]);

  // Top 4 unscheduled (priority + due date)
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

      {/* Now / Up next — featured live card */}
      <div className="px-4 py-3 border-b border-border">
        <NowCard current={currentTask} upNext={upNext} onSelect={onSelectTask} />
      </div>

      {/* Bento grid of stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
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

        {/* Streak — sits just below the stats, spans full width */}
        <div className="mt-2">
          <StreakCard streak={currentStreak} />
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

      {/* Tomorrow preview */}
      <TomorrowPreview tasks={tomorrowTasks} onSelect={onSelectTask} onAddTask={onAddTask} />

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
