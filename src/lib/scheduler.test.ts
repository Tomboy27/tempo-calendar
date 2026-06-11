import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pickBestSlot,
  getAutoSchedulableTasks,
  getLockedTasksAsBusySlots,
  detectMissedTasks,
  detectDependencyCycles,
  topologicalSort,
  getBlockingDependencies,
  findSlotsForDate,
  findSlotsForTask,
  scheduleTask,
  scheduleMultipleTasks,
  recalculateSchedule,
  type SchedulerConfig,
} from './scheduler';
import type { SchedulingSlot, Task } from './types';
import {
  makeTask,
  makeEvent,
  makeProfile,
  makeDependency,
  resetIdCounter,
  TEST_NOW,
  isoAt,
} from '../test/helpers';

const DEFAULT_CONFIG: SchedulerConfig = {
  defaultStartHour: 9,
  defaultEndHour: 17,
  minGapMinutes: 15,
  includeWeekends: false,
  defaultHorizonWeeks: 8,
};

beforeEach(() => {
  resetIdCounter();
  // Freeze "now" to a Monday at 09:00 UTC so time-dependent tests
  // (findSlotsForTask, recalculateSchedule) are deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-09T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pickBestSlot', () => {
  const slot = (hour: number, minute = 0): SchedulingSlot => ({
    start: new Date(`2026-03-09T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`),
    end: new Date(`2026-03-09T${String(hour).padStart(2, '0')}:${String(minute + 30).padStart(2, '0')}:00Z`),
    durationMinutes: 30,
  });

  it('returns null for empty slots', () => {
    expect(pickBestSlot([], makeTask())).toBeNull();
  });

  it('returns the first slot for ASAP priority regardless of position', () => {
    const asap = makeTask({ priority: 'ASAP' });
    const slots = [slot(14), slot(10), slot(11)];
    const result = pickBestSlot(slots, asap);
    expect(result).toBe(slots[0]);
  });

  it('returns the first slot for NORMAL priority', () => {
    const task = makeTask({ priority: 'NORMAL' });
    const slots = [slot(10), slot(11), slot(12)];
    const result = pickBestSlot(slots, task);
    expect(result).toBe(slots[0]);
  });

  it('prefers slots within preferred_time_windows when set', () => {
    const task = makeTask({
      preferred_time_windows: [JSON.stringify({ start: '14:00', end: '16:00' })],
    });
    const slots = [slot(9), slot(10), slot(14, 30), slot(15)];
    const result = pickBestSlot(slots, task);
    expect(result).toBe(slots[2]); // 14:30 falls in 14:00-16:00
  });

  it('falls back to first slot if no slot matches preferred windows', () => {
    const task = makeTask({
      preferred_time_windows: [JSON.stringify({ start: '20:00', end: '22:00' })],
    });
    const slots = [slot(9), slot(10)];
    const result = pickBestSlot(slots, task);
    expect(result).toBe(slots[0]);
  });

  it('ignores invalid JSON in preferred_time_windows', () => {
    const task = makeTask({ preferred_time_windows: ['not-valid-json'] });
    const slots = [slot(9), slot(10)];
    expect(pickBestSlot(slots, task)).toBe(slots[0]);
  });
});

describe('getAutoSchedulableTasks', () => {
  it('returns only active, auto_schedule=true, non-busy-block tasks', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'active', auto_schedule: true, is_busy_block: false }),
      makeTask({ id: 'b', status: 'completed', auto_schedule: true }),
      makeTask({ id: 'c', status: 'active', auto_schedule: false }),
      makeTask({ id: 'd', status: 'active', auto_schedule: true, is_busy_block: true }),
    ];
    const result = getAutoSchedulableTasks(tasks);
    expect(result.map((t) => t.id)).toEqual(['a']);
  });
});

describe('getLockedTasksAsBusySlots', () => {
  it('converts locked+scheduled tasks into CalendarEvents', () => {
    const tasks = [
      makeTask({ id: 'l1', is_locked: true, is_scheduled: true, scheduled_start: isoAt(2026, 3, 9, 9), scheduled_end: isoAt(2026, 3, 9, 10) }),
      makeTask({ id: 'l2', is_locked: true, is_scheduled: false }),
      makeTask({ id: 'l3', is_locked: false, is_scheduled: true, scheduled_start: isoAt(2026, 3, 9, 11), scheduled_end: isoAt(2026, 3, 9, 12) }),
    ];
    const busy = getLockedTasksAsBusySlots(tasks);
    expect(busy).toHaveLength(1);
    expect(busy[0].id).toBe('locked-l1');
    expect(busy[0].startTime).toBe(isoAt(2026, 3, 9, 9));
    expect(busy[0].source).toBe('task');
  });
});

describe('detectMissedTasks', () => {
  it('detects scheduled tasks whose end is in the past', () => {
    const past = new Date(TEST_NOW.getTime() - 60 * 60_000).toISOString();
    const future = new Date(TEST_NOW.getTime() + 60 * 60_000).toISOString();
    const tasks = [
      makeTask({ id: 'missed', status: 'active', is_scheduled: true, scheduled_start: past, scheduled_end: past }),
      makeTask({ id: 'upcoming', status: 'active', is_scheduled: true, scheduled_start: future, scheduled_end: future }),
      makeTask({ id: 'done', status: 'completed', is_scheduled: true, scheduled_start: past, scheduled_end: past }),
    ];
    const result = detectMissedTasks(tasks);
    expect(result.map((t) => t.id)).toEqual(['missed']);
  });
});

describe('detectDependencyCycles', () => {
  it('returns empty array for tasks with no cycles', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    const c = makeTask({ id: 'c' });
    const deps = [makeDependency('b', 'a'), makeDependency('c', 'b')];
    expect(detectDependencyCycles([a, b, c], deps)).toEqual([]);
  });

  it('detects a direct self-cycle', () => {
    const a = makeTask({ id: 'a' });
    const deps = [makeDependency('a', 'a')];
    const errors = detectDependencyCycles([a], deps);
    expect(errors).toHaveLength(1);
    expect(errors[0].taskId).toBe('a');
    expect(errors[0].cyclePath[0]).toBe('a');
  });

  it('detects a transitive cycle (a -> b -> c -> a)', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    const c = makeTask({ id: 'c' });
    const deps = [
      makeDependency('a', 'b'),
      makeDependency('b', 'c'),
      makeDependency('c', 'a'),
    ];
    const errors = detectDependencyCycles([a, b, c], deps);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].cyclePath).toContain('a');
    expect(errors[0].cyclePath).toContain('b');
    expect(errors[0].cyclePath).toContain('c');
  });

  it('ignores dependencies that reference unknown task ids', () => {
    const a = makeTask({ id: 'a' });
    const deps = [makeDependency('a', 'unknown')];
    expect(detectDependencyCycles([a], deps)).toEqual([]);
  });
});

describe('topologicalSort', () => {
  it('sorts tasks so dependencies come first', () => {
    const a = makeTask({ id: 'a', title: 'A' });
    const b = makeTask({ id: 'b', title: 'B' });
    const c = makeTask({ id: 'c', title: 'C' });
    // c depends on b, b depends on a
    const deps = [makeDependency('c', 'b'), makeDependency('b', 'a')];
    const sorted = topologicalSort([c, a, b], deps);
    const ids = sorted.map((t) => t.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('handles tasks with no dependencies', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    const sorted = topologicalSort([a, b], []);
    expect(sorted).toHaveLength(2);
  });
});

describe('getBlockingDependencies', () => {
  it('returns task IDs this task depends on', () => {
    const deps = [makeDependency('a', 'b'), makeDependency('a', 'c'), makeDependency('b', 'c')];
    expect(getBlockingDependencies('a', deps)).toEqual(['b', 'c']);
    expect(getBlockingDependencies('b', deps)).toEqual(['c']);
  });
});

describe('findSlotsForDate', () => {
  it('returns slots within working hours when day is free', () => {
    const task = makeTask({ duration_minutes: 60 });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.start.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(s.end.getUTCHours()).toBeLessThanOrEqual(17);
      expect(s.durationMinutes).toBe(60);
    }
  });

  it('returns no slots when day is fully blocked by busy events', () => {
    const task = makeTask({ duration_minutes: 60 });
    const busy = [
      makeEvent({ start: new Date('2026-03-09T08:00:00Z'), durationMinutes: 600 }),
    ];
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, busy, DEFAULT_CONFIG);
    expect(slots).toEqual([]);
  });

  it('excludes slots that overlap a busy event', () => {
    const task = makeTask({ duration_minutes: 60 });
    const busy = [
      makeEvent({ start: new Date('2026-03-09T12:00:00Z'), durationMinutes: 60 }),
    ];
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, busy, DEFAULT_CONFIG);
    for (const s of slots) {
      const startMs = s.start.getTime();
      const endMs = s.end.getTime();
      const eventStart = new Date('2026-03-09T12:00:00Z').getTime();
      const eventEnd = new Date('2026-03-09T13:00:00Z').getTime();
      // The slot must not overlap the 12:00-13:00 busy event
      const overlaps = startMs < eventEnd && endMs > eventStart;
      expect(overlaps).toBe(false);
    }
  });

  it('respects buffer_before and buffer_after minutes', () => {
    const task = makeTask({
      duration_minutes: 30,
      buffer_before_minutes: 15,
      buffer_after_minutes: 15,
    });
    const busy = [
      makeEvent({ start: new Date('2026-03-09T10:00:00Z'), durationMinutes: 30 }),
    ];
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, busy, DEFAULT_CONFIG);
    // 09:30 slot has buffer 09:15-10:00 which collides with the busy event at 10:00.
    // The expected earliest safe slot is 09:30 if the buffer pushes to 10:00 boundary.
    // Verify the slot's full window (including buffers) doesn't overlap.
    for (const s of slots) {
      const bufferStart = s.start.getTime() - 15 * 60_000;
      const bufferEnd = s.end.getTime() + 15 * 60_000;
      const eventStart = new Date('2026-03-09T10:00:00Z').getTime();
      const eventEnd = new Date('2026-03-09T10:30:00Z').getTime();
      const overlap = bufferStart < eventEnd && bufferEnd > eventStart;
      expect(overlap).toBe(false);
    }
  });

  it('returns no slots when blocked_days includes the day', () => {
    const task = makeTask({
      duration_minutes: 30,
      blocked_days: [1], // Monday
    });
    // 2026-03-09 is a Monday
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    expect(slots).toEqual([]);
  });

  it('returns no slots on weekends when includeWeekends=false and no preferred_days', () => {
    const task = makeTask({ duration_minutes: 30 });
    // 2026-03-14 is a Saturday
    const slots = findSlotsForDate(new Date('2026-03-14T00:00:00Z'), task, [], DEFAULT_CONFIG);
    expect(slots).toEqual([]);
  });

  it('returns slots on weekends when includeWeekends=true', () => {
    const task = makeTask({ duration_minutes: 30 });
    const cfg = { ...DEFAULT_CONFIG, includeWeekends: true };
    const slots = findSlotsForDate(new Date('2026-03-14T00:00:00Z'), task, [], cfg);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('only returns slots in preferred_time_windows when set', () => {
    const task = makeTask({
      duration_minutes: 30,
      preferred_time_windows: [JSON.stringify({ start: '14:00', end: '16:00' })],
    });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    for (const s of slots) {
      const hour = s.start.getUTCHours();
      const min = s.start.getUTCMinutes();
      const minutes = hour * 60 + min;
      expect(minutes).toBeGreaterThanOrEqual(14 * 60);
      expect(minutes).toBeLessThan(16 * 60);
    }
  });

  it('returns no slots for preferred_days that exclude the day', () => {
    const task = makeTask({
      duration_minutes: 30,
      preferred_days: [3], // Wednesday only
    });
    // 2026-03-09 is a Monday
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    expect(slots).toEqual([]);
  });

  it('uses scheduling_hours_override when set', () => {
    const task = makeTask({
      duration_minutes: 30,
      scheduling_hours_override: JSON.stringify({ weekday: ['13:00', '15:00'], weekend: ['10:00', '12:00'] }),
    });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    for (const s of slots) {
      const hour = s.start.getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(13);
      expect(hour).toBeLessThan(15);
    }
  });

  it('uses scheduling profile windows when set', () => {
    const task = makeTask({
      duration_minutes: 30,
      scheduling_profile_id: 'p1',
    });
    const profile = makeProfile([{ day: 1, start: '10:00', end: '12:00' }], { id: 'p1' });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG, [profile]);
    for (const s of slots) {
      const hour = s.start.getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThan(12);
    }
  });

  it('falls back to defaults if profile exists but has no window for the day', () => {
    const task = makeTask({
      duration_minutes: 30,
      scheduling_profile_id: 'p1',
    });
    const profile = makeProfile([{ day: 2, start: '10:00', end: '12:00' }], { id: 'p1' });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG, [profile]);
    // Falls back to default 9-17
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start.getUTCHours()).toBeGreaterThanOrEqual(9);
  });

  it('excludes slots that fall within blocked_times', () => {
    const task = makeTask({
      duration_minutes: 30,
      blocked_times: [JSON.stringify({ start: '10:00', end: '11:00' })],
    });
    const slots = findSlotsForDate(new Date('2026-03-09T00:00:00Z'), task, [], DEFAULT_CONFIG);
    for (const s of slots) {
      const hhmm = `${String(s.start.getUTCHours()).padStart(2, '0')}:${String(s.start.getUTCMinutes()).padStart(2, '0')}`;
      // The slot start must not be inside the 10:00-11:00 block
      expect(hhmm < '10:00' || hhmm >= '11:00').toBe(true);
    }
  });
});

describe('findSlotsForTask', () => {
  it('returns slots within horizon and respects due_date', () => {
    const task = makeTask({
      duration_minutes: 60,
      due_date: '2026-03-11', // Wednesday
    });
    const slots = findSlotsForTask(task, []);
    // Should have slots on Mon, Tue, Wed (due day)
    const days = new Set(slots.map((s) => s.start.toISOString().split('T')[0]));
    expect(days.size).toBeGreaterThan(0);
    // No slots beyond due_date
    for (const s of slots) {
      expect(s.start.toISOString() <= '2026-03-11T23:59:59Z').toBe(true);
    }
  });

  it('respects deadline as a hard limit', () => {
    // 16:59 deadline: the 17:00 slot (end of working hours) would START at the
    // deadline boundary and must be excluded.
    const task = makeTask({
      duration_minutes: 60,
      deadline: '2026-03-10T16:59:00Z',
    });
    const slots = findSlotsForTask(task, []);
    for (const s of slots) {
      expect(s.start.getTime()).toBeLessThan(new Date('2026-03-10T16:59:00Z').getTime());
    }
  });

  it('returns empty array when there is no working time before due date', () => {
    const task = makeTask({
      duration_minutes: 60,
      due_date: '2026-03-09', // Today
    });
    const slots = findSlotsForTask(task, [
      makeEvent({ start: new Date('2026-03-09T08:00:00Z'), durationMinutes: 600 }),
    ]);
    expect(slots).toEqual([]);
  });

  it('respects scheduling_cutoff_weeks', () => {
    const task = makeTask({
      duration_minutes: 60,
      scheduling_cutoff_weeks: 1,
    });
    const slots = findSlotsForTask(task, []);
    const lastSlot = slots[slots.length - 1];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 7);
    expect(lastSlot.start.getTime()).toBeLessThan(cutoff.getTime() + 24 * 60 * 60_000);
  });
});

describe('scheduleTask', () => {
  it('returns a slot for a task with no conflicts', () => {
    const task = makeTask({ duration_minutes: 30 });
    const slot = scheduleTask(task, []);
    expect(slot).not.toBeNull();
  });

  it('returns null when no slots are available within the due date', () => {
    // due_date pinned to today (frozen via vi.setSystemTime) so findSlotsForTask
    // does not look at future days.
    const task = makeTask({ duration_minutes: 30, due_date: '2026-03-09' });
    const busy = [makeEvent({ start: new Date('2026-03-09T08:00:00Z'), durationMinutes: 600 })];
    const slot = scheduleTask(task, busy);
    expect(slot).toBeNull();
  });
});

describe('scheduleMultipleTasks', () => {
  it('schedules multiple tasks in order, respecting busy slots', () => {
    const t1 = makeTask({ id: 'a', title: 'A', duration_minutes: 30, priority: 'HIGH' });
    const t2 = makeTask({ id: 'b', title: 'B', duration_minutes: 30, priority: 'NORMAL' });
    const out = scheduleMultipleTasks([t1, t2], []);
    expect(out.scheduled.map((s) => s.taskId)).toEqual(['a', 'b']);
  });

  it('skips tasks that have unsatisfied dependencies', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    const deps = [makeDependency('b', 'a')];
    const out = scheduleMultipleTasks([a, b], [], undefined, deps);
    expect(out.scheduled.map((s) => s.taskId)).toContain('a');
    const bResult = out.unscheduled.find((u) => u.taskId === 'b');
    expect(bResult?.reason).toMatch(/dependency/i);
  });

  it('records dependency errors and excludes cycle-involved tasks from scheduling', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    const deps = [makeDependency('a', 'b'), makeDependency('b', 'a')];
    const out = scheduleMultipleTasks([a, b], [], undefined, deps);
    // DFS reports the cycle once on first encounter. The first node in the
    // cycle path is excluded; the other may still be scheduled.
    expect(out.dependencyErrors.length).toBeGreaterThanOrEqual(1);
    expect(out.dependencyErrors[0].message).toMatch(/cycle/i);
    // The first cycle node (a) must be excluded.
    expect(out.scheduled.find((s) => s.taskId === 'a')).toBeUndefined();
  });

  it('treats locked+scheduled tasks as busy blocks', () => {
    const locked = makeTask({
      id: 'l',
      is_locked: true,
      is_scheduled: true,
      scheduled_start: isoAt(2026, 3, 9, 12),
      scheduled_end: isoAt(2026, 3, 9, 13),
      auto_schedule: true,
    });
    const movable = makeTask({ id: 'm', duration_minutes: 60 });
    const out = scheduleMultipleTasks([locked, movable], []);
    expect(out.lockedSkipped).toContain('l');
    expect(out.scheduled.some((s) => s.taskId === 'm')).toBe(true);
    const mSlot = out.scheduled.find((s) => s.taskId === 'm')!;
    // The movable task's slot should not overlap 12-13.
    const start = mSlot.slot.start;
    const end = mSlot.slot.end;
    const lockedStart = new Date(isoAt(2026, 3, 9, 12));
    const lockedEnd = new Date(isoAt(2026, 3, 9, 13));
    const overlaps = start < lockedEnd && end > lockedStart;
    expect(overlaps).toBe(false);
  });

  it('returns unscheduled entry when no slot fits within the due date', () => {
    // 8h task pinned to today; the only working day is fully blocked.
    const task = makeTask({ duration_minutes: 480, priority: 'NORMAL', due_date: '2026-03-09' });
    const busy = [makeEvent({ start: new Date('2026-03-09T08:00:00Z'), durationMinutes: 600 })];
    const out = scheduleMultipleTasks([task], busy);
    expect(out.scheduled).toEqual([]);
    expect(out.unscheduled).toHaveLength(1);
    expect(out.unscheduled[0].reason).toMatch(/no available time slot/i);
  });
});

describe('recalculateSchedule', () => {
  it('clears and reschedules flexible (non-locked) tasks', () => {
    const t = makeTask({
      id: 'flex',
      is_scheduled: true,
      is_locked: false,
      scheduled_start: isoAt(2026, 3, 9, 9),
      scheduled_end: isoAt(2026, 3, 9, 10),
    });
    const out = recalculateSchedule([t], []);
    expect(out.scheduled.some((s) => s.taskId === 'flex')).toBe(true);
  });

  it('does NOT touch locked tasks', () => {
    const locked = makeTask({
      id: 'l',
      is_locked: true,
      is_scheduled: true,
      scheduled_start: isoAt(2026, 3, 9, 9),
      scheduled_end: isoAt(2026, 3, 9, 10),
    });
    const out = recalculateSchedule([locked], []);
    // The locked task should not be re-scheduled (it stays in its slot)
    expect(out.scheduled.find((s) => s.taskId === 'l')).toBeUndefined();
    // Mutated in place: still scheduled at original time
    expect(locked.scheduled_start).toBe(isoAt(2026, 3, 9, 9));
  });

  it('recalculates missed tasks', () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    const t = makeTask({
      id: 'missed',
      is_scheduled: true,
      scheduled_start: past,
      scheduled_end: past,
    });
    const out = recalculateSchedule([t], []);
    expect(out.scheduled.some((s) => s.taskId === 'missed')).toBe(true);
  });

  it('excludes busy_block tasks from recalculation entirely', () => {
    const busyBlock = makeTask({
      id: 'bb',
      is_busy_block: true,
      is_scheduled: true,
      is_locked: true,
      scheduled_start: isoAt(2026, 3, 9, 12),
      scheduled_end: isoAt(2026, 3, 9, 13),
    });
    const out = recalculateSchedule([busyBlock], []);
    // Busy block should not be in scheduled or unscheduled output
    expect(out.scheduled.find((s) => s.taskId === 'bb')).toBeUndefined();
    expect(out.unscheduled.find((u) => u.taskId === 'bb')).toBeUndefined();
    // Original schedule preserved
    expect(busyBlock.scheduled_start).toBe(isoAt(2026, 3, 9, 12));
  });
});
