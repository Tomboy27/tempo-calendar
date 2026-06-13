import { useMemo } from 'react';
import type { Task } from '../lib/types';
import {
  computeCompletionRate,
  computeCurrentStreak,
  computeLongestStreak,
  computeStreakHistory,
  computeDailyCounts,
  computeAverageDailyCompletion,
  computeTimePerCategory,
  computeTimePerPriority,
  computeBestHoursHeatmap,
  computeTotalMinutes,
  type DayCell,
  type DailyCount,
  type CategorySlice,
  type PrioritySlice,
  type HeatmapCell,
} from '../lib/analytics';

export interface UseAnalyticsReturn {
  completion: {
    total: number;
    completed: number;
    missed: number;
    rate: number;
  };
  currentStreak: number;
  longestStreak: number;
  streakHistory: DayCell[];          // last 30 days
  dailyCounts: DailyCount[];          // last 14 days
  averageDailyCompletion: number;     // last 14 days
  timePerCategory: CategorySlice[];   // all-time
  timePerPriority: PrioritySlice[];   // all-time
  heatmap: HeatmapCell[];             // 7x24, all-time
  totalMinutes: {
    scheduled: number;
    completed: number;
    missed: number;
    active: number;
  };
}

/**
 * Memoized analytics over a list of tasks. Recomputes each metric only
 * when the tasks array reference changes. Heavy metric (heatmap) is
 * gated by an all-time view by default; if you need windowed versions,
 * pass a pre-filtered subset.
 */
export function useAnalytics(tasks: Task[]): UseAnalyticsReturn {
  const completion = useMemo(() => computeCompletionRate(tasks), [tasks]);
  const currentStreak = useMemo(() => computeCurrentStreak(tasks), [tasks]);
  const longestStreak = useMemo(() => computeLongestStreak(tasks), [tasks]);
  const streakHistory = useMemo(() => computeStreakHistory(tasks, 30), [tasks]);
  const dailyCounts = useMemo(() => computeDailyCounts(tasks, 14), [tasks]);
  const averageDailyCompletion = useMemo(
    () => computeAverageDailyCompletion(tasks, 14),
    [tasks],
  );
  const timePerCategory = useMemo(() => computeTimePerCategory(tasks), [tasks]);
  const timePerPriority = useMemo(() => computeTimePerPriority(tasks), [tasks]);
  const heatmap = useMemo(() => computeBestHoursHeatmap(tasks), [tasks]);
  const totalMinutes = useMemo(() => computeTotalMinutes(tasks), [tasks]);

  return {
    completion,
    currentStreak,
    longestStreak,
    streakHistory,
    dailyCounts,
    averageDailyCompletion,
    timePerCategory,
    timePerPriority,
    heatmap,
    totalMinutes,
  };
}
