import {
  format,
  parseISO,
  subDays,
  startOfDay,
  isToday as fnsIsToday,
  differenceInCalendarDays,
  getISODay,
} from 'date-fns';
import type { Task, TaskPriority } from './types';

// ============================================================
// Helpers
// ============================================================

/** Format a Date (or ISO string) as `YYYY-MM-DD` in local time. */
function toDateKey(input: string | Date): string {
  const d = typeof input === 'string' ? parseISO(input) : input;
  return format(d, 'yyyy-MM-dd');
}

/** All completion dates for a task, deduped, sorted ascending. */
function completionDates(task: Task): string[] {
  const dates = new Set<string>();
  if (task.completion_history) {
    for (const d of task.completion_history) {
      // Accept either ISO datetime or YYYY-MM-DD
      const key = d.length >= 10 ? d.slice(0, 10) : d;
      dates.add(key);
    }
  }
  if (task.completed_at) {
    dates.add(task.completed_at.slice(0, 10));
  }
  return Array.from(dates).sort();
}

/** All completion timestamps (Date objects) for a task, deduped, sorted ascending. */
function completionTimestamps(task: Task): Date[] {
  const out: Date[] = [];
  if (task.completion_history) {
    for (const d of task.completion_history) {
      out.push(parseISO(d));
    }
  }
  if (task.completed_at) {
    out.push(parseISO(task.completed_at));
  }
  // Dedup by minute
  const seen = new Set<number>();
  return out
    .filter((d) => {
      const key = Math.floor(d.getTime() / 60_000);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.getTime() - b.getTime());
}

// ============================================================
// Completion rate
// ============================================================

/**
 * % of tasks completed within a window. Tasks that were created before the
 * window are still counted (we look at `status`), but the window is used to
 * decide *which* completions count toward the numerator.
 *
 * For simplicity we use the lifetime status: if `status === 'completed'`,
 * the task counts. The window parameter is currently advisory (returned in
 * the result for display).
 */
export function computeCompletionRate(tasks: Task[]): {
  total: number;
  completed: number;
  missed: number;
  rate: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const missed = tasks.filter((t) => t.status === 'missed').length;
  return {
    total,
    completed,
    missed,
    rate: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

// ============================================================
// Streak
// ============================================================

/**
 * Current streak: consecutive days, counting backwards from today (or
 * yesterday if today has no completions yet), where at least one task
 * was completed. A "grace" day at the start (today) keeps the streak
 * alive until the end of the day.
 */
export function computeCurrentStreak(tasks: Task[]): number {
  const dates = new Set<string>();
  for (const t of tasks) {
    for (const d of completionDates(t)) dates.add(d);
  }
  if (dates.size === 0) return 0;

  let cursor = new Date();
  if (!dates.has(toDateKey(cursor))) {
    cursor = subDays(cursor, 1);
  }
  let streak = 0;
  while (dates.has(toDateKey(cursor))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

/**
 * Longest streak ever observed across the task history. Looks at all
 * completion dates and finds the maximum run of consecutive days.
 */
export function computeLongestStreak(tasks: Task[]): number {
  const dates = new Set<string>();
  for (const t of tasks) {
    for (const d of completionDates(t)) dates.add(d);
  }
  if (dates.size === 0) return 0;

  const sorted = Array.from(dates).sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseISO(sorted[i - 1]);
    const cur = parseISO(sorted[i]);
    if (differenceInCalendarDays(cur, prev) === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

// ============================================================
// Streak history (last N days)
// ============================================================

export interface DayCell {
  date: string;       // YYYY-MM-DD
  count: number;      // tasks completed on this day
  minutes: number;    // total scheduled minutes of completed tasks that day
  isToday: boolean;
  isFuture: boolean;
}

/**
 * A grid of the last `days` days (inclusive of today), with completion
 * count + minutes per day. Useful for a GitHub-style contribution strip.
 */
export function computeStreakHistory(tasks: Task[], days = 30): DayCell[] {
  const today = startOfDay(new Date());
  const todayKey = toDateKey(today);

  // Aggregate by date
  const byDate = new Map<string, { count: number; minutes: number }>();
  for (const t of tasks) {
    for (const ts of completionTimestamps(t)) {
      const key = toDateKey(ts);
      const cur = byDate.get(key) ?? { count: 0, minutes: 0 };
      cur.count += 1;
      cur.minutes += t.duration_minutes || 0;
      byDate.set(key, cur);
    }
  }

  const out: DayCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(today, i);
    const key = toDateKey(d);
    const entry = byDate.get(key);
    out.push({
      date: key,
      count: entry?.count ?? 0,
      minutes: entry?.minutes ?? 0,
      isToday: key === todayKey,
      isFuture: false,
    });
  }
  return out;
}

// ============================================================
// Daily counts (for sparkline)
// ============================================================

export interface DailyCount {
  date: string;
  count: number;
  minutes: number;
}

/** Same as `computeStreakHistory` but returns just date/count/minutes. */
export function computeDailyCounts(tasks: Task[], days = 14): DailyCount[] {
  return computeStreakHistory(tasks, days).map((c) => ({
    date: c.date,
    count: c.count,
    minutes: c.minutes,
  }));
}

/** Average tasks completed per day across the last `days` days. */
export function computeAverageDailyCompletion(tasks: Task[], days = 14): number {
  const cells = computeStreakHistory(tasks, days);
  const total = cells.reduce((s, c) => s + c.count, 0);
  return total / days;
}

// ============================================================
// Time per category (by tag)
// ============================================================

export interface CategorySlice {
  tag: string;
  minutes: number;
  count: number;
  share: number;  // 0-1
}

/**
 * Group completion time by tag. A task with multiple tags contributes
 * its full duration to *each* tag (so totals can exceed 100% if a task
 * is multi-tagged). The `share` is normalized to the max bucket so the
 * longest tag gets 1.0 and others scale accordingly.
 */
export function computeTimePerCategory(tasks: Task[]): CategorySlice[] {
  const completed = tasks.filter((t) => t.status === 'completed');
  const map = new Map<string, { minutes: number; count: number }>();

  for (const t of completed) {
    const tags = t.tags && t.tags.length > 0 ? t.tags : ['Untagged'];
    for (const tag of tags) {
      const cur = map.get(tag) ?? { minutes: 0, count: 0 };
      cur.minutes += t.duration_minutes || 0;
      cur.count += 1;
      map.set(tag, cur);
    }
  }

  const slices: CategorySlice[] = Array.from(map.entries()).map(([tag, v]) => ({
    tag,
    minutes: v.minutes,
    count: v.count,
    share: 0, // filled below
  }));
  if (slices.length === 0) return [];
  const max = Math.max(...slices.map((s) => s.minutes));
  for (const s of slices) s.share = max > 0 ? s.minutes / max : 0;
  // Sort by minutes desc
  slices.sort((a, b) => b.minutes - a.minutes);
  return slices;
}

// ============================================================
// Time per priority
// ============================================================

export interface PrioritySlice {
  priority: TaskPriority;
  minutes: number;
  count: number;
  share: number;
}

export function computeTimePerPriority(tasks: Task[]): PrioritySlice[] {
  const completed = tasks.filter((t) => t.status === 'completed');
  const order: TaskPriority[] = ['ASAP', 'HIGH', 'NORMAL', 'LOW'];
  const map = new Map<TaskPriority, { minutes: number; count: number }>();
  for (const p of order) map.set(p, { minutes: 0, count: 0 });

  for (const t of completed) {
    const cur = map.get(t.priority) ?? { minutes: 0, count: 0 };
    cur.minutes += t.duration_minutes || 0;
    cur.count += 1;
    map.set(t.priority, cur);
  }

  const slices: PrioritySlice[] = order.map((p) => {
    const v = map.get(p)!;
    return { priority: p, minutes: v.minutes, count: v.count, share: 0 };
  });
  const max = Math.max(...slices.map((s) => s.minutes));
  for (const s of slices) s.share = max > 0 ? s.minutes / max : 0;
  return slices;
}

// ============================================================
// Best hours heatmap
// ============================================================

/** Rows = day of week (Mon=0..Sun=6), Cols = hour of day (0..23). */
export type HeatmapCell = {
  day: number;       // 0..6 (Mon..Sun)
  hour: number;      // 0..23
  count: number;     // tasks completed in this slot
  minutes: number;   // total minutes of those tasks
  intensity: number; // 0..1, normalized to the max cell in the grid
};

/**
 * Build a 7x24 heatmap of completions by (day-of-week, hour-of-day) over
 * the lifetime of the task history. Each completion timestamp contributes
 * to exactly one cell.
 */
export function computeBestHoursHeatmap(tasks: Task[]): HeatmapCell[] {
  // Use a 2D array [day][hour]
  const grid: { count: number; minutes: number }[][] = Array.from(
    { length: 7 },
    () => Array.from({ length: 24 }, () => ({ count: 0, minutes: 0 })),
  );

  for (const t of tasks) {
    for (const ts of completionTimestamps(t)) {
      // ISO day: 1=Mon..7=Sun. Convert to 0=Mon..6=Sun.
      const day = (getISODay(ts) + 6) % 7;
      const hour = ts.getHours();
      grid[day][hour].count += 1;
      grid[day][hour].minutes += t.duration_minutes || 0;
    }
  }

  // Flatten
  const flat: HeatmapCell[] = [];
  let max = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      max = Math.max(max, grid[d][h].count);
    }
  }
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h];
      flat.push({
        day: d,
        hour: h,
        count: v.count,
        minutes: v.minutes,
        intensity: max > 0 ? v.count / max : 0,
      });
    }
  }
  return flat;
}

// ============================================================
// Total minutes (sanity / KPI)
// ============================================================

export function computeTotalMinutes(tasks: Task[]): {
  scheduled: number;
  completed: number;
  missed: number;
  active: number;
} {
  return {
    scheduled: tasks.filter((t) => t.is_scheduled).reduce((s, t) => s + (t.duration_minutes || 0), 0),
    completed: tasks.filter((t) => t.status === 'completed').reduce((s, t) => s + (t.duration_minutes || 0), 0),
    missed: tasks.filter((t) => t.status === 'missed').reduce((s, t) => s + (t.duration_minutes || 0), 0),
    active: tasks.filter((t) => t.status === 'active').reduce((s, t) => s + (t.duration_minutes || 0), 0),
  };
}

// ============================================================
// Convenience: re-export `isToday` for callers
// ============================================================

export { fnsIsToday as isToday };
