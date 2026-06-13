import { useEffect, useRef, useState, useMemo } from 'react';
import {
  TrendingUp,
  Flame,
  Trophy,
  Target,
  Calendar as CalIcon,
  Clock,
  Tag,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowLeft,
  Hourglass,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import type { Task } from '../lib/types';
import type { DayCell, HeatmapCell, CategorySlice, PrioritySlice, DailyCount } from '../lib/analytics';
import { useAnalytics } from '../hooks/useAnalytics';

// ============================================================
// Animated number ticker (matches BentoSidebar's pattern)
// ============================================================

function NumberTicker({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;
    const duration = 520;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn('tabular-nums', className)}>{display}{suffix}</span>;
}

// ============================================================
// KpiCard — top-row stat with icon, label, value, optional subtext
// ============================================================

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  subtext?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  hint?: string;
}

function KpiCard({ icon: Icon, label, value, subtext, variant = 'default', hint }: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 transition-all',
        variant === 'default' && 'bg-card border-border',
        variant === 'primary' && 'bg-primary/5 border-primary/20',
        variant === 'success' && 'bg-success/5 border-success/20',
        variant === 'warning' && 'bg-warning/5 border-warning/20',
        variant === 'destructive' && 'bg-destructive/5 border-destructive/20',
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={cn(
          'w-3 h-3',
          variant === 'primary' && 'text-primary',
          variant === 'success' && 'text-success',
          variant === 'warning' && 'text-warning',
          variant === 'destructive' && 'text-destructive',
        )} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-foreground leading-none tabular-nums">
        {value}
      </div>
      {subtext && (
        <div className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{subtext}</div>
      )}
      {hint && (
        <div className="absolute top-2 right-2 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          {hint}
        </div>
      )}
    </div>
  );
}

// ============================================================
// StreakStrip — 30-day GitHub-style activity strip
// ============================================================

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function colorForCount(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-muted/40';
  const ratio = count / max;
  if (ratio < 0.25) return 'bg-primary/25';
  if (ratio < 0.5) return 'bg-primary/45';
  if (ratio < 0.75) return 'bg-primary/70';
  return 'bg-primary';
}

function StreakStrip({ history }: { history: DayCell[] }) {
  const max = Math.max(1, ...history.map((c) => c.count));
  // Show weekday labels along the top
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Last {history.length} days</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <div className="flex gap-0.5">
            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
              <div
                key={i}
                className={cn('w-2.5 h-2.5 rounded-sm', r === 0 ? 'bg-muted/40' : colorForCount(r * max, max))}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${history.length}, minmax(0, 1fr))` }}
        role="list"
        aria-label="Daily completion streak"
      >
        {history.map((cell) => (
          <div
            key={cell.date}
            role="listitem"
            title={`${format(parseISO(cell.date), 'EEE, MMM d')}: ${cell.count} task${cell.count === 1 ? '' : 's'} · ${cell.minutes}m${cell.isToday ? ' (today)' : ''}`}
            className={cn(
              'aspect-square rounded-sm transition-transform hover:scale-110',
              colorForCount(cell.count, max),
              cell.isToday && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-card',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Sparkline — 14-day line chart in pure SVG
// ============================================================

function Sparkline({ data, height = 64 }: { data: DailyCount[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 100; // viewBox units; stretches with container
  const padX = 1;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padY + innerH * (1 - d.count / max);
    return { x, y, count: d.count, date: d.date };
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const fillPath = `${path} L ${padX + (data.length - 1) * stepX} ${padY + innerH} L ${padX} ${padY + innerH} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Daily completions over the last 14 days"
      >
        <defs>
          <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#sparkline-fill)" className="text-primary" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" className="text-primary" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.count > 0 ? 1.1 : 0.6}
            className={p.count > 0 ? 'fill-primary' : 'fill-muted-foreground/40'}
          />
        ))}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{format(parseISO(data[0]?.date || new Date().toISOString()), 'MMM d')}</span>
        <span>Today · {data[data.length - 1]?.count ?? 0}</span>
        <span>{format(parseISO(data[data.length - 1]?.date || new Date().toISOString()), 'MMM d')}</span>
      </div>
    </div>
  );
}

// ============================================================
// TimePerCategory — horizontal bars per tag
// ============================================================

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

const PRIORITY_LABEL: Record<string, string> = {
  ASAP: 'ASAP',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};
const PRIORITY_COLOR: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-primary/70',
  LOW: 'bg-muted-foreground/40',
};

function TimePerCategory({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) {
    return <EmptyHint icon={Tag} text="No completed tasks with tags yet." />;
  }
  const total = slices.reduce((s, x) => s + x.minutes, 0);
  return (
    <div className="space-y-2.5">
      {slices.slice(0, 8).map((s) => (
        <div key={s.tag} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate">{s.tag}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-muted-foreground tabular-nums">
              <span className="text-[10px]">{s.count} task{s.count === 1 ? '' : 's'}</span>
              <span className="font-semibold text-foreground">{formatMinutes(s.minutes)}</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(4, s.share * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {total > 0 && (
        <div className="pt-1 text-[10px] text-muted-foreground text-right">
          {formatMinutes(total)} completed across {slices.length} {slices.length === 1 ? 'tag' : 'tags'}
        </div>
      )}
    </div>
  );
}

function TimePerPriority({ slices }: { slices: PrioritySlice[] }) {
  const completed = slices.filter((s) => s.minutes > 0);
  if (completed.length === 0) {
    return <EmptyHint icon={Sparkles} text="No completed tasks yet." />;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {slices.map((s) => (
        <div
          key={s.priority}
          className={cn(
            'flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 p-2.5',
            s.minutes === 0 && 'opacity-50',
          )}
        >
          <div className={cn('w-1 h-7 rounded-full', PRIORITY_COLOR[s.priority])} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {PRIORITY_LABEL[s.priority]}
            </div>
            <div className="text-sm font-semibold text-foreground tabular-nums">
              {formatMinutes(s.minutes)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {s.count} task{s.count === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// BestHoursHeatmap — 7x24 grid (Mon-Sun x 0-23)
// ============================================================

function BestHoursHeatmap({ cells }: { cells: HeatmapCell[] }) {
  // Group by day
  const byDay = useMemo(() => {
    const out: HeatmapCell[][] = Array.from({ length: 7 }, () => []);
    for (const c of cells) out[c.day].push(c);
    return out;
  }, [cells]);

  const [hover, setHover] = useState<{ day: number; hour: number; count: number; minutes: number } | null>(null);

  // Find peak
  const peak = useMemo(() => {
    let best = cells[0];
    for (const c of cells) if (c.count > (best?.count ?? 0)) best = c;
    return best;
  }, [cells]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Mon → Sun · 24h</span>
        {peak && peak.count > 0 && (
          <span className="text-foreground/70 normal-case tracking-normal">
            Peak: <strong className="text-foreground">{DAY_LABELS[peak.day]} {peak.hour}:00</strong> · {peak.count} task{peak.count === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {byDay.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1.5">
            <div className="w-9 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              {DAY_LABELS[dayIdx]}
            </div>
            <div className="flex-1 grid grid-cols-24 gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {row.map((cell) => {
                const isPeak = peak && cell.day === peak.day && cell.hour === peak.hour && cell.count > 0;
                return (
                  <div
                    key={cell.hour}
                    onMouseEnter={() => setHover({ day: cell.day, hour: cell.hour, count: cell.count, minutes: cell.minutes })}
                    onMouseLeave={() => setHover(null)}
                    title={`${DAY_LABELS[cell.day]} ${cell.hour}:00 — ${cell.count} task${cell.count === 1 ? '' : 's'}, ${cell.minutes}m`}
                    className={cn(
                      'aspect-square rounded-sm transition-transform hover:scale-125 cursor-default',
                      cell.count === 0 ? 'bg-muted/30' : 'bg-primary',
                      isPeak && 'ring-2 ring-warning/60',
                    )}
                    style={cell.count > 0 ? { opacity: 0.18 + 0.82 * cell.intensity } : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {/* Hour axis */}
      <div className="flex items-center pl-[42px]">
        <div className="flex-1 grid gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className={cn(
                'text-[9px] text-muted-foreground text-center tabular-nums',
                h % 6 !== 0 && 'opacity-0',
              )}
            >
              {h}
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <div className="rounded-md bg-popover border border-border px-2.5 py-1.5 text-[11px] text-foreground shadow-sm inline-flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">{DAY_LABELS[hover.day]} {String(hover.hour).padStart(2, '0')}:00 – {String(hover.hour + 1).padStart(2, '0')}:00</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">{hover.count} task{hover.count === 1 ? '' : 's'} · {formatMinutes(hover.minutes)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// EmptyHint
// ============================================================

function EmptyHint({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
      <Icon className="w-3.5 h-3.5" />
      {text}
    </div>
  );
}

// ============================================================
// Section — wrapper with title + content
// ============================================================

function Section({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

// ============================================================
// Main AnalyticsPanel
// ============================================================

export function AnalyticsPanel({
  tasks,
  onClose,
}: {
  tasks: Task[];
  onClose: () => void;
}) {
  const analytics = useAnalytics(tasks);

  const isEmpty = tasks.length === 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto tempo-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to calendar"
            title="Back to calendar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <h1 className="text-base font-semibold text-foreground truncate">Productivity Insights</h1>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              How the last few weeks of work actually shook out.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close insights"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 lg:px-6 py-6 max-w-[1100px] w-full mx-auto space-y-5">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">No data yet</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-[420px] mx-auto">
              Add some tasks and complete them over the next few days. Your streaks, time-per-tag,
              and best-hours heatmap will fill in here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={Target}
                label="Completion"
                value={<NumberTicker value={analytics.completion.rate} suffix="%" />}
                subtext={`${analytics.completion.completed} of ${analytics.completion.total} done${analytics.completion.missed > 0 ? ` · ${analytics.completion.missed} missed` : ''}`}
                variant={analytics.completion.rate >= 70 ? 'success' : analytics.completion.rate >= 40 ? 'default' : 'warning'}
                hint="lifetime"
              />
              <KpiCard
                icon={Flame}
                label="Current streak"
                value={<NumberTicker value={analytics.currentStreak} suffix=" days" />}
                subtext={analytics.currentStreak > 0
                  ? `Keep going — next milestone at ${nextMilestone(analytics.currentStreak)}`
                  : 'Complete a task today to start one.'}
                variant={analytics.currentStreak > 0 ? 'success' : 'default'}
              />
              <KpiCard
                icon={Trophy}
                label="Longest streak"
                value={<NumberTicker value={analytics.longestStreak} suffix=" days" />}
                subtext={analytics.longestStreak === 0
                  ? 'No streaks yet — the record awaits.'
                  : analytics.currentStreak === analytics.longestStreak
                    ? 'You\'re at your record.'
                    : `${analytics.longestStreak - analytics.currentStreak} day${analytics.longestStreak - analytics.currentStreak === 1 ? '' : 's'} to beat it.`}
                variant="primary"
              />
              <KpiCard
                icon={CheckCircle2}
                label="Avg / day"
                value={<NumberTicker value={Math.round(analytics.averageDailyCompletion * 10) / 10} />}
                subtext={`Across the last 14 days`}
                variant="default"
                hint="14d"
              />
            </div>

            {/* Streak strip + sparkline (side by side) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Section
                icon={Flame}
                title="Daily streak"
                subtitle="Each square is a day. Brighter = more done."
                className="lg:col-span-2"
              >
                <StreakStrip history={analytics.streakHistory} />
              </Section>

              <Section
                icon={TrendingUp}
                title="Last 14 days"
                subtitle="Tasks completed per day."
                right={
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-semibold text-foreground tabular-nums leading-none">
                      {analytics.dailyCounts.reduce((s, d) => s + d.count, 0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">total</div>
                  </div>
                }
              >
                <Sparkline data={analytics.dailyCounts} />
              </Section>
            </div>

            {/* Best hours heatmap */}
            <Section
              icon={Clock}
              title="Best hours"
              subtitle="When you actually complete things, by day-of-week and hour-of-day. The brightest cell is your peak slot."
            >
              <BestHoursHeatmap cells={analytics.heatmap} />
            </Section>

            {/* Time per category + priority */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Section
                icon={Tag}
                title="Time per tag"
                subtitle="Where your completed hours actually went."
                right={
                  analytics.timePerCategory.length > 0 && (
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
                      {analytics.timePerCategory.length} {analytics.timePerCategory.length === 1 ? 'tag' : 'tags'}
                    </div>
                  )
                }
              >
                <TimePerCategory slices={analytics.timePerCategory} />
              </Section>

              <Section
                icon={Sparkles}
                title="Time per priority"
                subtitle="How you split effort across urgency levels."
              >
                <TimePerPriority slices={analytics.timePerPriority} />
              </Section>
            </div>

            {/* Lifetime totals footer card */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={CalIcon}
                label="Scheduled"
                value={<NumberTicker value={Math.round(analytics.totalMinutes.scheduled / 60)} suffix="h" />}
                subtext={`${analytics.totalMinutes.scheduled.toLocaleString()} minutes planned`}
                variant="default"
              />
              <KpiCard
                icon={CheckCircle2}
                label="Completed"
                value={<NumberTicker value={Math.round(analytics.totalMinutes.completed / 60)} suffix="h" />}
                subtext={`${analytics.totalMinutes.completed.toLocaleString()} minutes shipped`}
                variant="success"
              />
              <KpiCard
                icon={AlertTriangle}
                label="Missed"
                value={<NumberTicker value={Math.round(analytics.totalMinutes.missed / 60)} suffix="h" />}
                subtext={analytics.totalMinutes.missed === 0 ? 'Nothing missed yet.' : `${analytics.totalMinutes.missed.toLocaleString()} minutes unstarted`}
                variant={analytics.totalMinutes.missed > 0 ? 'destructive' : 'default'}
              />
              <KpiCard
                icon={Hourglass}
                label="Active backlog"
                value={<NumberTicker value={Math.round(analytics.totalMinutes.active / 60)} suffix="h" />}
                subtext={`${tasks.filter((t) => t.status === 'active').length} active tasks in the pipeline`}
                variant="primary"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// nextMilestone — helper for the streak "keep going" message
// ============================================================

function nextMilestone(streak: number): string {
  if (streak < 3) return '3 days';
  if (streak < 7) return '1 week';
  if (streak < 14) return '2 weeks';
  if (streak < 30) return '1 month';
  if (streak < 100) return '100 days';
  return '365 days';
}
