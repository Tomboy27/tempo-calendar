import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectConflicts,
  findRescheduleSlot,
  batchReschedule,
  timeRangesOverlap,
  type RescheduleResult,
} from './rescheduler';
import type { Task } from './types';
import { makeTask, makeEvent, resetIdCounter } from '../test/helpers';

beforeEach(() => {
  resetIdCounter();
});

const DEFAULT_CONFIG = {
  defaultStartHour: 9,
  defaultEndHour: 17,
  minGapMinutes: 15,
  includeWeekends: false,
  defaultHorizonWeeks: 8,
};

describe('timeRangesOverlap', () => {
  it('detects overlap when ranges intersect', () => {
    const a = new Date('2026-03-09T10:00:00Z');
    const b = new Date('2026-03-09T11:00:00Z');
    const c = new Date('2026-03-09T10:30:00Z');
    const d = new Date('2026-03-09T11:30:00Z');
    expect(timeRangesOverlap(a, b, c, d)).toBe(true);
  });

  it('returns false for back-to-back ranges (touching endpoints)', () => {
    const a = new Date('2026-03-09T10:00:00Z');
    const b = new Date('2026-03-09T11:00:00Z');
    expect(timeRangesOverlap(a, b, b, new Date('2026-03-09T12:00:00Z'))).toBe(false);
  });

  it('returns false for disjoint ranges', () => {
    const a = new Date('2026-03-09T10:00:00Z');
    const b = new Date('2026-03-09T11:00:00Z');
    const c = new Date('2026-03-09T13:00:00Z');
    const d = new Date('2026-03-09T14:00:00Z');
    expect(timeRangesOverlap(a, b, c, d)).toBe(false);
  });

  it('handles full containment', () => {
    const a = new Date('2026-03-09T10:00:00Z');
    const b = new Date('2026-03-09T12:00:00Z');
    const c = new Date('2026-03-09T10:30:00Z');
    const d = new Date('2026-03-09T11:00:00Z');
    expect(timeRangesOverlap(a, b, c, d)).toBe(true);
  });
});

describe('detectConflicts', () => {
  it('returns empty array when no scheduled tasks', () => {
    const events = [makeEvent({ start: new Date('2026-03-09T10:00:00Z') })];
    expect(detectConflicts([], events)).toEqual([]);
  });

  it('detects a conflict between a scheduled task and a Google event', () => {
    const task = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    const conflicts = detectConflicts([task], events);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].task.id).toBe('t1');
    expect(conflicts[0].overlapMinutes).toBe(30);
  });

  it('skips busy_block tasks (they are not movable)', () => {
    const task = makeTask({
      id: 'bb',
      is_busy_block: true,
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    expect(detectConflicts([task], events)).toEqual([]);
  });

  it('ignores non-google events', () => {
    const task = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'task',
      }),
    ];
    expect(detectConflicts([task], events)).toEqual([]);
  });

  it('skips tasks that are missing scheduled_start or scheduled_end', () => {
    const task = makeTask({
      id: 'partial',
      is_scheduled: true,
      scheduled_start: null,
      scheduled_end: null,
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    expect(detectConflicts([task], events)).toEqual([]);
  });

  it('returns zero overlap when ranges only touch at endpoints', () => {
    const task = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T11:00:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    expect(detectConflicts([task], events)).toEqual([]);
  });

  it('reports multiple conflicts for a single task against multiple events', () => {
    const task = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T13:00:00Z',
    });
    const events = [
      makeEvent({
        id: 'e1',
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
      makeEvent({
        id: 'e2',
        start: new Date('2026-03-09T12:00:00Z'),
        durationMinutes: 60,
        source: 'google',
      }),
    ];
    const conflicts = detectConflicts([task], events);
    expect(conflicts).toHaveLength(2);
  });
});

describe('findRescheduleSlot', () => {
  it('returns a slot that does not overlap the given busy events', () => {
    const task = makeTask({
      id: 't1',
      duration_minutes: 30,
    });
    const busy = [
      makeEvent({
        start: new Date('2026-03-09T09:00:00Z'),
        durationMinutes: 60,
        source: 'google',
      }),
    ];
    const slot = findRescheduleSlot(task, busy);
    expect(slot).not.toBeNull();
    // Slot must not overlap the busy event
    if (slot) {
      const eventStart = new Date('2026-03-09T09:00:00Z').getTime();
      const eventEnd = new Date('2026-03-09T10:00:00Z').getTime();
      const overlaps = slot.start.getTime() < eventEnd && slot.end.getTime() > eventStart;
      expect(overlaps).toBe(false);
    }
  });

  it('returns null when no alternative slot is available', () => {
    const task = makeTask({ duration_minutes: 30 });
    const busy = [
      makeEvent({ start: new Date('2026-03-09T08:00:00Z'), durationMinutes: 600, source: 'google' }),
    ];
    expect(findRescheduleSlot(task, busy)).toBeNull();
  });
});

describe('batchReschedule', () => {
  it('returns no results when no conflicts exist', () => {
    const task = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({ start: new Date('2026-03-09T13:00:00Z'), durationMinutes: 60, source: 'google' }),
    ];
    expect(batchReschedule([task], events)).toEqual([]);
  });

  it('reschedules a single conflicting task and returns success=true', () => {
    const task = makeTask({
      id: 't1',
      title: 'My task',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        id: 'conflict',
        title: 'Meeting',
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    const results = batchReschedule([task], events);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].newStart).not.toBeNull();
    expect(results[0].newEnd).not.toBeNull();
    expect(results[0].reason).toMatch(/Meeting/);
  });

  it('returns success=false when no alternative slot exists', () => {
    const task = makeTask({
      id: 't1',
      title: 'Long task',
      duration_minutes: 480, // 8 hours, fills the whole day
      is_scheduled: true,
      scheduled_start: '2026-03-09T09:00:00Z',
      scheduled_end: '2026-03-09T17:00:00Z',
    });
    const events = [
      makeEvent({
        title: 'Blocker',
        start: new Date('2026-03-09T10:00:00Z'),
        durationMinutes: 60,
        source: 'google',
      }),
    ];
    const results = batchReschedule([task], events);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].newStart).toBeNull();
  });

  it('chains displacement: rescheduled task becomes a new busy block for the next task', () => {
    const t1 = makeTask({
      id: 't1',
      title: 'T1',
      duration_minutes: 60,
      priority: 'ASAP',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const t2 = makeTask({
      id: 't2',
      title: 'T2',
      duration_minutes: 60,
      priority: 'HIGH',
      is_scheduled: true,
      scheduled_start: '2026-03-09T09:00:00Z',
      scheduled_end: '2026-03-09T10:00:00Z',
    });
    // Both tasks conflict with the meeting
    const events = [
      makeEvent({
        id: 'meeting',
        title: 'Team meeting',
        start: new Date('2026-03-09T10:00:00Z'),
        durationMinutes: 120,
        source: 'google',
      }),
    ];
    const results = batchReschedule([t1, t2], events);
    expect(results).toHaveLength(2);
    // The rescheduled slots should not overlap each other
    const r1 = results.find((r) => r.taskId === 't1')!;
    const r2 = results.find((r) => r.taskId === 't2')!;
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (r1.newStart && r1.newEnd && r2.newStart && r2.newEnd) {
      const r1Start = new Date(r1.newStart).getTime();
      const r1End = new Date(r1.newEnd).getTime();
      const r2Start = new Date(r2.newStart).getTime();
      const r2End = new Date(r2.newEnd).getTime();
      // r1 is processed first (ASAP); r2 should not overlap r1
      const overlap = r2Start < r1End && r2End > r1Start;
      expect(overlap).toBe(false);
    }
  });

  it('skips busy_block tasks', () => {
    const task = makeTask({
      id: 'bb',
      is_busy_block: true,
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    expect(batchReschedule([task], events)).toEqual([]);
  });

  it('skips tasks missing scheduled_start or scheduled_end', () => {
    const t1 = makeTask({
      id: 't1',
      is_scheduled: true,
      scheduled_start: null,
      scheduled_end: null,
    });
    const t2 = makeTask({
      id: 't2',
      is_scheduled: false,
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    expect(batchReschedule([t1, t2], events)).toEqual([]);
  });

  it('processes tasks in priority order (ASAP first, then HIGH, NORMAL, LOW)', () => {
    // We can only observe the order indirectly: results array order
    // matches input order after sort, so provide tasks unsorted and check sort.
    const low = makeTask({
      id: 'low',
      priority: 'LOW',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const asap = makeTask({
      id: 'asap',
      priority: 'ASAP',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const normal = makeTask({
      id: 'normal',
      priority: 'NORMAL',
      is_scheduled: true,
      scheduled_start: '2026-03-09T10:00:00Z',
      scheduled_end: '2026-03-09T11:00:00Z',
    });
    const events = [
      makeEvent({
        start: new Date('2026-03-09T10:30:00Z'),
        durationMinutes: 30,
        source: 'google',
      }),
    ];
    const results: RescheduleResult[] = batchReschedule([low, asap, normal], events);
    expect(results.map((r) => r.taskId)).toEqual(['asap', 'normal', 'low']);
  });
});
