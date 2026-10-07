/**
 * Tests for streakUtils — shared streak computation utilities.
 *
 * Covers:
 * - computeCurrentStreak (consecutive days backward from today with grace period)
 * - computeBestStreak (longest consecutive run in sorted dates)
 * - computeHabitStreak (daily/weekly/monthly cadence dispatch)
 */

import { computeCurrentStreak, computeBestStreak, computeHabitStreak } from '../streakUtils';
import type { HabitAdaptationRow } from '../../store/useGremlyStore';

/** A pause of the habit from one day to another */
const pause = (first: string, last: string): HabitAdaptationRow => ({
  id: `pause-${first}`,
  owner_id: 'user-1',
  habit_id: 'habit-1',
  mode: 'pause',
  period_start: first,
  period_end: last,
  created_at: `${first}T08:00:00Z`,
  updated_at: `${first}T08:00:00Z`,
});

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

    it('buckets weeks Thursday to Wednesday for a Wednesday person', () => {
      // Today is Monday 12/15, in their week of Thu 12/11 to Wed 12/17
      // This week: 12/11 and 12/12 (2, met)
      // Last week (12/4 to 12/10): 12/8 and 12/10 (2, met)
      // Week before (11/27 to 12/3): 12/1 only (1, miss) → stop
      const dates = ['2025-12-11', '2025-12-12', '2025-12-08', '2025-12-10', '2025-12-01'];
      expect(computeHabitStreak(dates, 'weekly', 2, [], 3)).toEqual({ count: 2, unit: 'week' });
      // A Sunday person buckets the same days Monday to Sunday:
      // this week (12/15 on) has none yet, last week (12/8 to 12/14) has 4,
      // and the week before (12/1 to 12/7) has 1 → stop
      expect(computeHabitStreak(dates, 'weekly', 2)).toEqual({ count: 1, unit: 'week' });
    });

    it('passes over a week with one paused day in it', () => {
      // This week: met. Last week (12/8 to 12/14): nothing logged, and
      // Wednesday 12/10 was paused. Week before: met.
      const dates = ['2025-12-15', '2025-12-01'];
      const paused = [pause('2025-12-10', '2025-12-10')];
      expect(computeHabitStreak(dates, 'weekly', 1, paused)).toEqual({ count: 2, unit: 'week' });
      // without the pause the missed week ends the streak
      expect(computeHabitStreak(dates, 'weekly', 1)).toEqual({ count: 1, unit: 'week' });
      // a lighter version is not a pause
      const lighter = [{ ...paused[0], mode: 'floor' as const }];
      expect(computeHabitStreak(dates, 'weekly', 1, lighter)).toEqual({ count: 1, unit: 'week' });
    });

    it('passes over every week a pause reaches into', () => {
      // Paused Fri 12/5 to Tue 12/9: a day or more of each of the two weeks
      // before this one. The week of 11/24 was met, and the one before it missed.
      const dates = ['2025-12-15', '2025-11-25'];
      const paused = [pause('2025-12-05', '2025-12-09')];
      expect(computeHabitStreak(dates, 'weekly', 1, paused)).toEqual({ count: 2, unit: 'week' });
    });

    it('counts a paused week that was met anyway', () => {
      // Last week (12/8 to 12/14) was paused all through and logged anyway
      const dates = ['2025-12-15', '2025-12-09', '2025-12-01'];
      const paused = [pause('2025-12-08', '2025-12-14')];
      expect(computeHabitStreak(dates, 'weekly', 1, paused)).toEqual({ count: 3, unit: 'week' });
    });

    it('still never breaks on the current week, paused or not', () => {
      // Nothing yet this week, which has a paused day; last week met
      const dates = ['2025-12-08'];
      const paused = [pause('2025-12-16', '2025-12-16')];
      expect(computeHabitStreak(dates, 'weekly', 1, paused)).toEqual({ count: 1, unit: 'week' });
    });

    it('treats a target under 1 as 1, so the walk back ends', () => {
      // This week and last week have a completion, the week before has none
      const dates = ['2025-12-15', '2025-12-08'];
      expect(computeHabitStreak(dates, 'weekly', 0)).toEqual({ count: 2, unit: 'week' });
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
