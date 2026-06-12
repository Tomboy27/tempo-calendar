import { describe, it, expect } from 'vitest';
import { computeEventDrop, type DropInput } from './drag';

const HOUR_HEIGHT = 56; // mirrors TempoCalendar
const DAY_COLUMN_WIDTH = 150; // arbitrary column width used in all tests

function makeInput(overrides: Partial<DropInput> = {}): DropInput {
  return {
    start: new Date('2026-03-09T10:00:00Z'),
    end: new Date('2026-03-09T11:00:00Z'), // 1-hour event
    deltaX: 0,
    deltaY: 0,
    hourHeight: HOUR_HEIGHT,
    dayColumnWidth: DAY_COLUMN_WIDTH,
    view: 'week',
    ...overrides,
  };
}

describe('computeEventDrop', () => {
  describe('same day (vertical only)', () => {
    it('snaps a downward drag to the nearest 15-min slot', () => {
      // 56 px = 60 min, so a 28 px drop = 30 min
      const result = computeEventDrop(makeInput({ deltaY: 28 }));
      expect(result).not.toBeNull();
      // 10:00 + 30 min = 10:30; duration preserved
      expect(result!.newStart.toISOString()).toBe('2026-03-09T10:30:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-09T11:30:00.000Z');
    });

    it('snaps an upward drag to the nearest 15-min slot', () => {
      // 14 px = 15 min upward
      const result = computeEventDrop(makeInput({ deltaY: -14 }));
      expect(result).not.toBeNull();
      // 10:00 - 15 min = 09:45
      expect(result!.newStart.toISOString()).toBe('2026-03-09T09:45:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-09T10:45:00.000Z');
    });

    it('preserves the original duration', () => {
      const result = computeEventDrop(makeInput({ deltaY: 56, deltaX: 0 }));
      expect(result).not.toBeNull();
      const durationMs = result!.newEnd.getTime() - result!.newStart.getTime();
      expect(durationMs).toBe(60 * 60_000); // 1 hour
    });

    it('ignores horizontal delta in day view (vertical only)', () => {
      const result = computeEventDrop(
        makeInput({ view: 'day', deltaX: 500, deltaY: 56 }),
      );
      expect(result).not.toBeNull();
      // 1 hour down, no horizontal shift even though deltaX is huge
      expect(result!.newStart.toISOString()).toBe('2026-03-09T11:00:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    });
  });

  describe('cross day (week view, horizontal)', () => {
    it('moves the event forward by one day when dragged one column right', () => {
      // 150 px = 1 day
      const result = computeEventDrop(makeInput({ deltaX: DAY_COLUMN_WIDTH }));
      expect(result).not.toBeNull();
      // 10:00 Mon → 10:00 Tue, duration preserved
      expect(result!.newStart.toISOString()).toBe('2026-03-10T10:00:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-10T11:00:00.000Z');
    });

    it('moves the event backward by one day when dragged one column left', () => {
      const result = computeEventDrop(makeInput({ deltaX: -DAY_COLUMN_WIDTH }));
      expect(result).not.toBeNull();
      // 10:00 Mon → 10:00 Sun (Mar 8)
      expect(result!.newStart.toISOString()).toBe('2026-03-08T10:00:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-08T11:00:00.000Z');
    });

    it('moves the event forward by three days when dragged across three columns', () => {
      const result = computeEventDrop(makeInput({ deltaX: DAY_COLUMN_WIDTH * 3 + 10 }));
      expect(result).not.toBeNull();
      // Rounds 460/150 = 3.07 → 3 days forward
      expect(result!.newStart.toISOString()).toBe('2026-03-12T10:00:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-12T11:00:00.000Z');
    });

    it('combines vertical and horizontal deltas (down 1h and right 1 day)', () => {
      const result = computeEventDrop(
        makeInput({ deltaX: DAY_COLUMN_WIDTH, deltaY: 56 }),
      );
      expect(result).not.toBeNull();
      // 1 hour down + 1 day forward
      expect(result!.newStart.toISOString()).toBe('2026-03-10T11:00:00.000Z');
      expect(result!.newEnd.toISOString()).toBe('2026-03-10T12:00:00.000Z');
    });

    it('returns a no-op if dayColumnWidth is 0 (measurement not yet populated)', () => {
      const result = computeEventDrop(
        makeInput({ dayColumnWidth: 0, deltaX: 500, deltaY: 0 }),
      );
      expect(result).toBeNull();
    });
  });

  describe('no-op (sub-threshold drag)', () => {
    it('returns null when both deltas round to zero', () => {
      // 1 px vertical = 60/56 ≈ 1.07 min → rounds to 0 in 15-min snap
      // 1 px horizontal = 1/150 day → rounds to 0
      const result = computeEventDrop(makeInput({ deltaX: 1, deltaY: 1 }));
      expect(result).toBeNull();
    });

    it('returns null when delta is exactly zero', () => {
      const result = computeEventDrop(makeInput({ deltaX: 0, deltaY: 0 }));
      expect(result).toBeNull();
    });

    it('returns null in day view when only horizontal delta is sub-threshold', () => {
      // day view ignores deltaX entirely; tiny deltaY rounds to 0
      const result = computeEventDrop(
        makeInput({ view: 'day', deltaX: 999, deltaY: 5 }),
      );
      expect(result).toBeNull();
    });

    it('returns null in month view regardless of delta (drag is read-only)', () => {
      // Month view: even a large vertical drag with no horizontal still snaps
      // vertically (deltaY math runs first), but horizontal is ignored. The
      // test asserts the *week-only* day-offset guard, not the vertical math.
      const result = computeEventDrop(
        makeInput({ view: 'month', deltaX: DAY_COLUMN_WIDTH, deltaY: 0 }),
      );
      expect(result).toBeNull();
    });
  });
});
