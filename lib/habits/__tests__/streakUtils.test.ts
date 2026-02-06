/**
 * Tests for streakUtils — shared streak computation utilities.
 *
 * Covers:
 * - computeCurrentStreak (consecutive days backward from today with grace period)
 * - computeBestStreak (longest consecutive run in sorted dates)
 * - computeHabitStreak (daily/weekly/monthly cadence dispatch)
 */

import { computeCurrentStreak, computeBestStreak, computeHabitStreak } from '../streakUtils';

// dateService.today() / yesterday() rely on `new Date()` internally,
// so we control them with jest fake timers.
beforeEach(() => {
  jest.useFakeTimers();
  // Pin "today" to 2025-12-15 (Monday)
  jest.setSystemTime(new Date('2025-12-15T12:00:00'));
});

afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeCurrentStreak
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeCurrentStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeCurrentStreak([])).toBe(0);
  });

  it('returns 1 when only today is completed', () => {
    expect(computeCurrentStreak(['2025-12-15'])).toBe(1);
  });

  it('returns 1 when only yesterday is completed (grace period)', () => {
    expect(computeCurrentStreak(['2025-12-14'])).toBe(1);
  });

  it('counts consecutive days backward from today', () => {
    expect(computeCurrentStreak(['2025-12-15', '2025-12-14', '2025-12-13'])).toBe(3);
  });

  it('counts consecutive days backward from yesterday when today is not completed', () => {
    // today (12-15) missing, so grace period starts from yesterday (12-14)
    expect(computeCurrentStreak(['2025-12-14', '2025-12-13', '2025-12-12'])).toBe(3);
  });

  it('stops counting at a gap', () => {
    // 12-15, 12-14, gap on 12-13, then 12-12
    expect(computeCurrentStreak(['2025-12-15', '2025-12-14', '2025-12-12'])).toBe(2);
  });

  it('handles unordered input', () => {
    expect(computeCurrentStreak(['2025-12-13', '2025-12-15', '2025-12-14'])).toBe(3);
  });

  it('handles duplicate dates', () => {
    expect(computeCurrentStreak(['2025-12-15', '2025-12-15', '2025-12-14'])).toBe(2);
  });

  it('returns 0 when no dates are near today', () => {
    expect(computeCurrentStreak(['2025-12-01', '2025-12-02'])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeBestStreak
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeBestStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeBestStreak([])).toBe(0);
  });

  it('returns 1 for a single date', () => {
    expect(computeBestStreak(['2025-12-10'])).toBe(1);
  });

  it('returns length of single consecutive run', () => {
    expect(computeBestStreak(['2025-12-10', '2025-12-11', '2025-12-12'])).toBe(3);
  });

  it('returns the longest of multiple runs', () => {
    // run 1: 10,11 (2 days), run 2: 14,15,16,17 (4 days)
    expect(
      computeBestStreak([
        '2025-12-10',
        '2025-12-11',
        '2025-12-14',
        '2025-12-15',
        '2025-12-16',
        '2025-12-17',
      ]),
    ).toBe(4);
  });

  it('handles unordered input', () => {
    expect(computeBestStreak(['2025-12-12', '2025-12-10', '2025-12-11'])).toBe(3);
  });

  it('ignores duplicate dates (no double-counting)', () => {
    expect(computeBestStreak(['2025-12-10', '2025-12-10', '2025-12-11'])).toBe(2);
  });

  it('all consecutive dates', () => {
    expect(
      computeBestStreak(['2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04', '2025-12-05']),
    ).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeHabitStreak
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeHabitStreak', () => {
  it('returns { count: 0, unit: "day" } for empty dates', () => {
    expect(computeHabitStreak([])).toEqual({ count: 0, unit: 'day' });
  });

  describe('daily cadence', () => {
    it('delegates to computeCurrentStreak', () => {
      const dates = ['2025-12-15', '2025-12-14', '2025-12-13'];
      const result = computeHabitStreak(dates, 'daily', 1);
      expect(result).toEqual({ count: 3, unit: 'day' });
    });
  });

  describe('monthly cadence', () => {
    it('falls back to daily streak (same as daily)', () => {
      const dates = ['2025-12-15', '2025-12-14'];
      const result = computeHabitStreak(dates, 'monthly', 1);
      expect(result).toEqual({ count: 2, unit: 'day' });
    });
  });

  describe('weekly cadence', () => {
    it('counts consecutive weeks meeting target', () => {
      // Pin to Monday 2025-12-15
      // This week (12/15-12/21): 1 completion (12/15) with target 1 → met
      // Last week (12/8-12/14): 3 completions with target 1 → met
      // Week before (12/1-12/7): 2 completions with target 1 → met
      const dates = [
        '2025-12-15', // this week
        '2025-12-10',
        '2025-12-11',
        '2025-12-12', // last week (3)
        '2025-12-01',
        '2025-12-03', // week before (2)
      ];
      const result = computeHabitStreak(dates, 'weekly', 1);
      expect(result).toEqual({ count: 3, unit: 'week' });
    });

    it('skips current week if target not yet met (grace period)', () => {
      // Today is Monday 12/15, no completions yet this week
      // But last week and week before met the target
      const dates = [
        '2025-12-08', // last week (Mon)
        '2025-12-01', // week before (Mon)
      ];
      const result = computeHabitStreak(dates, 'weekly', 1);
      expect(result).toEqual({ count: 2, unit: 'week' });
    });

    it('returns 0 when no weeks meet target', () => {
      // Only a date far in the past
      const dates = ['2025-11-01'];
      const result = computeHabitStreak(dates, 'weekly', 5);
      expect(result).toEqual({ count: 0, unit: 'week' });
    });

    it('stops at first week that misses target', () => {
      // This week: 1 completion (target 1, met)
      // Last week: 0 completions (miss) → stop
      // Week before: 1 completion (doesn't matter)
      const dates = ['2025-12-15', '2025-12-01'];
      const result = computeHabitStreak(dates, 'weekly', 1);
      expect(result).toEqual({ count: 1, unit: 'week' });
    });
  });

  describe('unknown cadence', () => {
    it('falls back to daily streak', () => {
      const dates = ['2025-12-15', '2025-12-14'];
      const result = computeHabitStreak(dates, 'biweekly' as any, 1);
      expect(result).toEqual({ count: 2, unit: 'day' });
    });
  });
});
