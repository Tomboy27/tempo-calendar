import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateRecurringOccurrences } from './recurring';
import type { Task } from './types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 't1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    title: 'Test Task',
    description: null,
    duration_minutes: 60,
    due_date: null,
    due_time: null,
    deadline: null,
    recurrence_end: null,
    priority: 'NORMAL',
    frequency: 'once',
    preferred_days: null,
    preferred_time_windows: null,
    is_busy_block: false,
    can_split: false,
    ignore_if_cannot_schedule: false,
    is_habit: false,
    is_recurring: false,
    can_balance_across_days: false,
    min_chunk_duration: null,
    max_chunks: null,
    scheduling_cutoff_weeks: 8,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    blocked_days: null,
    blocked_times: null,
    scheduling_hours_override: null,
    tags: null,
    color: '#2563EB',
    notes: null,
    skip_days: null,
    streak_count: 0,
    completion_history: null,
    google_event_id: null,
    google_calendar_id: null,
    is_scheduled: true,
    scheduled_start: '2026-01-05T09:00:00Z',
    scheduled_end: '2026-01-05T10:00:00Z',
    auto_schedule: true,
    is_locked: false,
    completed_at: null,
    status: 'active',
    list_id: null,
    scheduling_profile_id: null,
    sync_to_calendar: false,
    last_scheduled_at: null,
    last_missed_at: null,
    ...partial,
  } as Task;
}

describe('generateRecurringOccurrences', () => {
  it('returns empty for non-repeating tasks', () => {
    const task = makeTask({ frequency: 'once' });
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    expect(generateRecurringOccurrences(task, from, to)).toEqual([]);
  });

  it('skips occurrences with skipped override', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1, 2, 3, 4, 5],
      occurrence_overrides: {
        '2026-01-07': { status: 'skipped', scheduled_start: '2026-01-07T09:00:00Z', scheduled_end: '2026-01-07T10:00:00Z' },
      },
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-12');
    const occs = generateRecurringOccurrences(task, from, to);
    // Jan 5, 6, 8, 9 = 4 occurrences (Jan 7 skipped)
    expect(occs.length).toBe(4);
    const days = occs.map((o) => o.start.toISOString().slice(0, 10));
    expect(days).not.toContain('2026-01-07');
  });

  it('marks completed occurrences with completed override', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1, 2, 3, 4, 5],
      occurrence_overrides: {
        '2026-01-06': { status: 'completed', scheduled_start: '2026-01-06T09:00:00Z', scheduled_end: '2026-01-06T10:00:00Z' },
      },
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-10');
    const occs = generateRecurringOccurrences(task, from, to);
    const jan6 = occs.find((o) => o.start.toISOString().slice(0, 10) === '2026-01-06');
    expect(jan6).toBeDefined();
    expect(jan6!.variant).toBe('muted');
    expect(jan6!.data?.is_completed).toBe(true);
  });

  it('applies moved occurrence overrides', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1, 2, 3, 4, 5],
      occurrence_overrides: {
        '2026-01-06': { scheduled_start: '2026-01-06T14:00:00Z', scheduled_end: '2026-01-06T15:00:00Z' },
      },
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-10');
    const occs = generateRecurringOccurrences(task, from, to);
    const jan6 = occs.find((o) => o.start.toISOString().slice(0, 10) === '2026-01-06');
    expect(jan6).toBeDefined();
    expect(jan6!.start.toISOString()).toBe('2026-01-06T14:00:00.000Z');
    expect(jan6!.end.toISOString()).toBe('2026-01-06T15:00:00.000Z');
  });

  it('applies override status over base task status', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1],
      status: 'completed',
      occurrence_overrides: {
        '2026-01-05': { status: 'active', scheduled_start: '2026-01-05T09:00:00Z', scheduled_end: '2026-01-05T10:00:00Z' },
      },
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-12');
    const occs = generateRecurringOccurrences(task, from, to);
    const jan5 = occs.find((o) => o.start.toISOString().slice(0, 10) === '2026-01-05');
    expect(jan5).toBeDefined();
    // The occurrence is active (via override) but the end time (Jan 5 10:00) is
    // before the mocked "now" (June 15 08:00), so it shows as missed
    expect(jan5!.variant).toBe('destructive');
    expect(jan5!.data?.is_completed).toBe(false);
    expect(jan5!.data?.is_missed).toBe(true);
  });

  it('returns empty for repeating tasks without scheduled_start', () => {
    const task = makeTask({ frequency: 'daily', scheduled_start: null, scheduled_end: null });
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    expect(generateRecurringOccurrences(task, from, to)).toEqual([]);
  });

  it('generates daily occurrences for a daily task', () => {
    const task = makeTask({ frequency: 'daily', preferred_days: [1, 2, 3, 4, 5] });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-12');
    const occs = generateRecurringOccurrences(task, from, to);
    // Monday Jan 5 to Friday Jan 9 = 5 occurrences
    expect(occs.length).toBe(5);
    expect(occs[0].start.toISOString()).toBe('2026-01-05T09:00:00.000Z');
    expect(occs[4].start.toISOString()).toBe('2026-01-09T09:00:00.000Z');
  });

  it('generates weekly occurrences for each selected weekday', () => {
    const task = makeTask({
      frequency: 'weekly',
      preferred_days: [1, 3, 5], // Mon, Wed, Fri
      scheduled_start: '2026-01-05T14:00:00Z', // Monday
      scheduled_end: '2026-01-05T15:00:00Z',
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-19');
    const occs = generateRecurringOccurrences(task, from, to);
    // Week 1: Mon Jan 5, Wed Jan 7, Fri Jan 9
    // Week 2: Mon Jan 12, Wed Jan 14, Fri Jan 16
    // = 6 occurrences
    expect(occs.length).toBe(6);
    const days = occs.map((o) => o.start.toISOString().slice(0, 10));
    expect(days).toEqual([
      '2026-01-05', '2026-01-07', '2026-01-09',
      '2026-01-12', '2026-01-14', '2026-01-16',
    ]);
  });

  it('respects recurrence_end as a hard boundary', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1, 2, 3, 4, 5, 6, 7],
      recurrence_end: '2026-01-08',
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-31');
    const occs = generateRecurringOccurrences(task, from, to);
    // Jan 5, 6, 7, 8 = 4 occurrences
    expect(occs.length).toBe(4);
    expect(occs[occs.length - 1].start.toISOString().slice(0, 10)).toBe('2026-01-08');
  });

  it('respects the fromDate boundary (does not generate before fromDate)', () => {
    const task = makeTask({
      frequency: 'weekly',
      preferred_days: [1],
      scheduled_start: '2026-01-05T09:00:00Z',
      scheduled_end: '2026-01-05T10:00:00Z',
    });
    const from = new Date('2026-01-12');
    const to = new Date('2026-01-26');
    const occs = generateRecurringOccurrences(task, from, to);
    // Only Jan 12 and Jan 19
    expect(occs.length).toBe(2);
    expect(occs[0].start.toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  it('caps at MAX_OCCURRENCES (365)', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1, 2, 3, 4, 5, 6, 7],
    });
    const from = new Date('2026-01-01');
    const to = new Date('2027-12-31');
    const occs = generateRecurringOccurrences(task, from, to);
    expect(occs.length).toBe(365);
  });

  it('assigns correct variant for active tasks', () => {
    const task = makeTask({ frequency: 'daily', preferred_days: [1] });
    const from = new Date('2026-06-15');
    const to = new Date('2026-06-22');
    const occs = generateRecurringOccurrences(task, from, to);
    expect(occs.length).toBeGreaterThan(0);
    const first = occs[0];
    expect(first.variant).toBe('warning');
    expect(first.data?.is_recurring).toBe(true);
  });

  it('assigns correct variant for missed tasks', () => {
    const task = makeTask({
      frequency: 'daily',
      preferred_days: [1],
      status: 'missed',
    });
    const from = new Date('2026-06-15');
    const to = new Date('2026-06-22');
    const occs = generateRecurringOccurrences(task, from, to);
    expect(occs.length).toBeGreaterThan(0);
    const first = occs[0];
    expect(first.variant).toBe('destructive');
    expect(first.data?.is_missed).toBe(true);
  });

  it('preserves the time-of-day from the base occurrence', () => {
    const task = makeTask({
      frequency: 'weekly',
      preferred_days: [1],
      scheduled_start: '2026-01-05T14:30:00Z', // Monday 14:30
      scheduled_end: '2026-01-05T15:30:00Z',
    });
    const from = new Date('2026-01-05');
    const to = new Date('2026-01-19');
    const occs = generateRecurringOccurrences(task, from, to);
    expect(occs.length).toBeGreaterThan(0);
    // All occurrences should start at 14:30 UTC
    for (const occ of occs) {
      expect(occ.start.toISOString()).toMatch(/T14:30:00\.\d{3}Z$/);
      expect(occ.end.toISOString()).toMatch(/T15:30:00\.\d{3}Z$/);
    }
  });
});
