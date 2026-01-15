/**
 * habitHelpers.test.ts
 *
 * Tests for Sweep habit display helper functions.
 * Covers frequency parsing, streak calculation, and habit grouping.
 */

import {
  normalizeCadence,
  parseHabitFrequency,
  getTodayDateString,
  getHabitStreak,
  getWeeklyProgress,
  getMonthlyProgress,
  isHabitCompletedToday,
  getFrequencyLabel,
  groupHabitsForSweep,
  type HabitCadence,
  type HabitWithMeta,
} from '../habitHelpers';
import type { Habit } from '../../types';
import type { HabitProgressRow } from '../../store/useGremlyStore';

// ─────────────────────────────────────────────────────────────────────────────
// normalizeCadence
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeCadence', () => {
  it('normalizes daily variations', () => {
    expect(normalizeCadence('daily')).toBe('daily');
    expect(normalizeCadence('day')).toBe('daily');
    expect(normalizeCadence('DAILY')).toBe('daily');
  });

  it('normalizes weekly variations', () => {
    expect(normalizeCadence('weekly')).toBe('weekly');
    expect(normalizeCadence('week')).toBe('weekly');
    expect(normalizeCadence('WEEKLY')).toBe('weekly');
  });

  it('normalizes monthly variations', () => {
    expect(normalizeCadence('monthly')).toBe('monthly');
    expect(normalizeCadence('month')).toBe('monthly');
    expect(normalizeCadence('MONTHLY')).toBe('monthly');
  });

  it('defaults to daily for null/undefined', () => {
    expect(normalizeCadence(null)).toBe('daily');
    expect(normalizeCadence(undefined)).toBe('daily');
    expect(normalizeCadence('')).toBe('daily');
  });

  it('defaults to daily for unknown values', () => {
    expect(normalizeCadence('yearly')).toBe('daily');
    expect(normalizeCadence('random')).toBe('daily');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHabitFrequency
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHabitFrequency', () => {
  describe('Nx/week patterns', () => {
    it('parses "3x/week"', () => {
      const result = parseHabitFrequency('3x/week');
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(3);
      expect(result.frequency).toBe('3x/week');
    });

    it('parses "2x per week"', () => {
      const result = parseHabitFrequency('2x per week');
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(2);
    });

    it('parses "5 x week"', () => {
      const result = parseHabitFrequency('5 x week');
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(5);
    });
  });

  describe('Nx/month patterns', () => {
    it('parses "2x/month"', () => {
      const result = parseHabitFrequency('2x/month');
      expect(result.cadence).toBe('monthly');
      expect(result.target_per_period).toBe(2);
      expect(result.frequency).toBe('2x/month');
    });

    it('parses "4 per month"', () => {
      const result = parseHabitFrequency('4 per month');
      expect(result.cadence).toBe('monthly');
      expect(result.target_per_period).toBe(4);
    });
  });

  describe('explicit cadence values', () => {
    it('parses "daily"', () => {
      const result = parseHabitFrequency('daily');
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
      expect(result.frequency).toBe('daily');
    });

    it('parses "weekly"', () => {
      const result = parseHabitFrequency('weekly');
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(1);
      expect(result.frequency).toBe('weekly');
    });

    it('parses "monthly"', () => {
      const result = parseHabitFrequency('monthly');
      expect(result.cadence).toBe('monthly');
      expect(result.target_per_period).toBe(1);
      expect(result.frequency).toBe('monthly');
    });

    it('parses "every day"', () => {
      const result = parseHabitFrequency('every day');
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });
  });

  describe('with frequencyValue parameter', () => {
    it('uses frequencyValue for daily habits', () => {
      const result = parseHabitFrequency('daily', 2);
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(2);
      expect(result.frequency).toBe('2x daily');
    });

    it('uses frequencyValue for weekly habits', () => {
      const result = parseHabitFrequency('weekly', 3);
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(3);
      expect(result.frequency).toBe('3x/week');
    });
  });

  describe('custom frequency', () => {
    it('handles "custom" with frequencyValue', () => {
      const result = parseHabitFrequency('custom', 4);
      expect(result.cadence).toBe('weekly');
      expect(result.target_per_period).toBe(4);
      expect(result.frequency).toBe('4x/week');
    });

    it('handles "custom" without frequencyValue', () => {
      const result = parseHabitFrequency('custom');
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
      expect(result.frequency).toBe('custom');
    });
  });

  describe('defaults', () => {
    it('defaults to daily for null', () => {
      const result = parseHabitFrequency(null);
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });

    it('defaults to daily for undefined', () => {
      const result = parseHabitFrequency(undefined);
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTodayDateString
// ─────────────────────────────────────────────────────────────────────────────

describe('getTodayDateString', () => {
  it('returns date in YYYY-MM-DD format', () => {
    const result = getTodayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns consistent format with leading zeros', () => {
    // Mock date to ensure we test leading zeros
    const mockDate = new Date('2024-01-05T12:00:00');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

    const result = getTodayDateString();
    expect(result).toBe('2024-01-05');

    jest.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHabitStreak
// ─────────────────────────────────────────────────────────────────────────────

describe('getHabitStreak', () => {
  const today = getTodayDateString();

  function getDateDaysAgo(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  it('returns 0 for no completions', () => {
    const streak = getHabitStreak('habit-1', []);
    expect(streak).toBe(0);
  });

  it('returns 1 for completed today only', () => {
    const progress: HabitProgressRow[] = [
      {
        id: '1',
        habit_id: 'habit-1',
        owner_id: 'user-1',
        occurred_day: today,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
    ];
    const streak = getHabitStreak('habit-1', progress);
    expect(streak).toBe(1);
  });

  it('returns streak for consecutive days', () => {
    const progress: HabitProgressRow[] = [
      {
        id: '1',
        habit_id: 'habit-1',
        owner_id: 'user-1',
        occurred_day: today,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
      {
        id: '2',
        habit_id: 'habit-1',
        owner_id: 'user-1',
        occurred_day: getDateDaysAgo(1),
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
      {
        id: '3',
        habit_id: 'habit-1',
        owner_id: 'user-1',
        occurred_day: getDateDaysAgo(2),
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
    ];
    const streak = getHabitStreak('habit-1', progress);
    expect(streak).toBe(3);
  });

  it('only counts own habit completions', () => {
    const progress: HabitProgressRow[] = [
      {
        id: '1',
        habit_id: 'habit-1',
        owner_id: 'user-1',
        occurred_day: today,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
      {
        id: '2',
        habit_id: 'habit-2', // Different habit
        owner_id: 'user-1',
        occurred_day: getDateDaysAgo(1),
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
    ];
    const streak = getHabitStreak('habit-1', progress);
    expect(streak).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHabitFrequencyLabel (uses centralized frequencyUtils)
// ─────────────────────────────────────────────────────────────────────────────

describe('getFrequencyLabel', () => {
  it('delegates to frequencyUtils for canonical fields', () => {
    const habit = {
      cadence: 'weekly',
      target_per_period: 3,
    } as Partial<Habit>;

    const label = getFrequencyLabel(habit as Habit);
    expect(label).toBe('3x/week');
  });

  it('returns "Daily" for daily habits', () => {
    const habit = {
      cadence: 'daily',
      target_per_period: 1,
    } as Partial<Habit>;

    const label = getFrequencyLabel(habit as Habit);
    expect(label).toBe('Daily');
  });

  it('handles missing canonical fields (defaults to daily)', () => {
    const habit = {} as Partial<Habit>;

    const label = getFrequencyLabel(habit as Habit);
    expect(label).toBe('Daily');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: groupHabitsForSweep
// ─────────────────────────────────────────────────────────────────────────────

describe('groupHabitsForSweep', () => {
  // Helper to create weekly progress entries within the current week
  const createWeeklyProgress = (
    habitId: string,
    count: number,
    includeToday: boolean = false,
  ): HabitProgressRow[] => {
    const today = getTodayDateString(); // Use local date from dateService
    const progress: HabitProgressRow[] = [];

    // Get current day of week (0=Sun, 6=Sat)
    const todayDate = new Date(today + 'T12:00:00'); // Parse as local noon
    const dayOfWeek = todayDate.getDay();
    // Days since Monday (Mon=0, Tue=1, ..., Sun=6)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    for (let i = 0; i < count; i++) {
      // If includeToday is false, start from yesterday
      let daysAgo = includeToday ? i : i + 1;

      // Clamp to stay within current week (don't go before Monday)
      if (daysAgo > daysSinceMonday) {
        daysAgo = daysSinceMonday;
      }

      // Calculate date using local date math
      const date = new Date(today + 'T12:00:00');
      date.setDate(date.getDate() - daysAgo);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      progress.push({
        id: `progress-${i}`,
        habit_id: habitId,
        owner_id: 'user-1',
        occurred_day: dateStr,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      });
    }

    return progress;
  };

  // Helper to create monthly progress entries within the current month
  const createMonthlyProgress = (
    habitId: string,
    count: number,
    includeToday: boolean = false,
  ): HabitProgressRow[] => {
    const today = getTodayDateString(); // Use local date from dateService
    const progress: HabitProgressRow[] = [];

    // Get day of month
    const todayDate = new Date(today + 'T12:00:00'); // Parse as local noon
    const dayOfMonth = todayDate.getDate();
    // Days since start of month (1st = 0 days since, 2nd = 1 day since, etc.)
    const daysSinceMonthStart = dayOfMonth - 1;

    for (let i = 0; i < count; i++) {
      // If includeToday is false, start from yesterday
      let daysAgo = includeToday ? i : i + 1;

      // Clamp to stay within current month
      if (daysAgo > daysSinceMonthStart) {
        daysAgo = daysSinceMonthStart;
      }

      // Calculate date using local date math
      const date = new Date(today + 'T12:00:00');
      date.setDate(date.getDate() - daysAgo);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      progress.push({
        id: `progress-${i}`,
        habit_id: habitId,
        owner_id: 'user-1',
        occurred_day: dateStr,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      });
    }

    return progress;
  };

  it('groups habits by their cadence', () => {
    const habits: Partial<Habit>[] = [
      { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
      { id: '2', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      { id: '3', name: 'Monthly Habit', cadence: 'monthly', target_per_period: 2 },
    ];

    const progress: HabitProgressRow[] = [];

    const result = groupHabitsForSweep(habits as Habit[], progress);

    expect(result.daily.length).toBe(1);
    expect(result.weekly.length).toBe(1);
    expect(result.monthly.length).toBe(1);
    expect(result.daily[0].habit.name).toBe('Daily Habit');
    expect(result.weekly[0].habit.name).toBe('Weekly Habit');
    expect(result.monthly[0].habit.name).toBe('Monthly Habit');
  });

  it('moves completed habits to completed group', () => {
    const today = getTodayDateString();
    const habits: Partial<Habit>[] = [
      { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
    ];

    const progress: HabitProgressRow[] = [
      {
        id: '1',
        habit_id: '1',
        owner_id: 'user-1',
        occurred_day: today,
        occurred_at: new Date().toISOString(),
        count: 1,
        occurrence_index: null,
      },
    ];

    const result = groupHabitsForSweep(habits as Habit[], progress);

    // Completed daily habit should be in completed group
    expect(result.completed.length).toBe(1);
    expect(result.daily.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isAheadOfTarget Tests (sweep-refinements-1.13 branch)
  // ─────────────────────────────────────────────────────────────────────────

  describe('isAheadOfTarget field', () => {
    it('sets isAheadOfTarget=true for weekly habit at target', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      ];
      // 3 completions this week but NOT today
      const progress = createWeeklyProgress('1', 3, false);

      const result = groupHabitsForSweep(habits as Habit[], progress);
      // Should still be in weekly section (not completed because not done today)
      expect(result.weekly.length).toBe(1);
      expect(result.weekly[0].isAheadOfTarget).toBe(true);
    });

    it('sets isAheadOfTarget=true for weekly habit over target', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      ];
      // 4 completions this week (over target)
      const progress = createWeeklyProgress('1', 4, false);

      const result = groupHabitsForSweep(habits as Habit[], progress);
      expect(result.weekly.length).toBe(1);
      expect(result.weekly[0].isAheadOfTarget).toBe(true);
    });

    it('sets isAheadOfTarget=false for weekly habit under target', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      ];
      // 2 completions this week (under target)
      const progress = createWeeklyProgress('1', 2, false);

      const result = groupHabitsForSweep(habits as Habit[], progress);
      expect(result.weekly.length).toBe(1);
      expect(result.weekly[0].isAheadOfTarget).toBe(false);
    });

    it('sets isAheadOfTarget=false for daily habits (always)', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
      ];
      const progress: HabitProgressRow[] = [];

      const result = groupHabitsForSweep(habits as Habit[], progress);
      expect(result.daily.length).toBe(1);
      expect(result.daily[0].isAheadOfTarget).toBe(false);
    });

    it('sets isAheadOfTarget=false for completed daily habits', () => {
      const today = getTodayDateString();
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
      ];
      const progress: HabitProgressRow[] = [
        {
          id: '1',
          habit_id: '1',
          owner_id: 'user-1',
          occurred_day: today,
          occurred_at: new Date().toISOString(),
          count: 1,
          occurrence_index: null,
        },
      ];

      const result = groupHabitsForSweep(habits as Habit[], progress);
      expect(result.completed.length).toBe(1);
      expect(result.completed[0].isAheadOfTarget).toBe(false);
    });

    it('sets isAheadOfTarget=true for monthly habit at target', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Monthly Habit', cadence: 'monthly', target_per_period: 2 },
      ];
      // 2 completions this month (at target)
      const progress = createMonthlyProgress('1', 2, false);

      const result = groupHabitsForSweep(habits as Habit[], progress);
      expect(result.monthly.length).toBe(1);
      expect(result.monthly[0].isAheadOfTarget).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Completed TODAY vs Completed for Period (sweep-refinements-1.13 branch)
  // ─────────────────────────────────────────────────────────────────────────

  describe('grouping by completed TODAY (not completed for period)', () => {
    it('keeps ahead weekly habits visible (not in completed) if not done today', () => {
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      ];
      // 3 completions but NOT today - habit is "ahead" but still visible
      const progress = createWeeklyProgress('1', 3, false);

      const result = groupHabitsForSweep(habits as Habit[], progress);

      expect(result.weekly.length).toBe(1); // Still in weekly section
      expect(result.completed.length).toBe(0); // NOT in completed
      expect(result.weekly[0].isAheadOfTarget).toBe(true);
      expect(result.weekly[0].isCompletedForPeriod).toBe(true);
      expect(result.weekly[0].isCompletedToday).toBe(false);
    });

    it('moves weekly habit to completed if done today (even if under target)', () => {
      const today = getTodayDateString();
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Weekly Habit', cadence: 'weekly', target_per_period: 3 },
      ];
      // Only 1 completion and it's today
      const progress: HabitProgressRow[] = [
        {
          id: '1',
          habit_id: '1',
          owner_id: 'user-1',
          occurred_day: today,
          occurred_at: new Date().toISOString(),
          count: 1,
          occurrence_index: null,
        },
      ];

      const result = groupHabitsForSweep(habits as Habit[], progress);

      expect(result.completed.length).toBe(1); // In completed because done today
      expect(result.weekly.length).toBe(0);
      expect(result.completed[0].isCompletedToday).toBe(true);
      expect(result.completed[0].isAheadOfTarget).toBe(false); // Not at target yet
    });

    it('moves habit to completed only if completed TODAY', () => {
      const today = getTodayDateString();
      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
      ];
      const progress: HabitProgressRow[] = [
        {
          id: '1',
          habit_id: '1',
          owner_id: 'user-1',
          occurred_day: today, // Completed TODAY
          occurred_at: new Date().toISOString(),
          count: 1,
          occurrence_index: null,
        },
      ];

      const result = groupHabitsForSweep(habits as Habit[], progress);

      expect(result.completed.length).toBe(1);
      expect(result.daily.length).toBe(0);
    });

    it('keeps daily habit visible if completed yesterday (not today)', () => {
      // Calculate yesterday using local date
      const today = getTodayDateString();
      const todayDate = new Date(today + 'T12:00:00'); // Parse as local noon
      todayDate.setDate(todayDate.getDate() - 1);
      const year = todayDate.getFullYear();
      const month = String(todayDate.getMonth() + 1).padStart(2, '0');
      const day = String(todayDate.getDate()).padStart(2, '0');
      const yesterdayStr = `${year}-${month}-${day}`;

      const habits: Partial<Habit>[] = [
        { id: '1', name: 'Daily Habit', cadence: 'daily', target_per_period: 1 },
      ];
      const progress: HabitProgressRow[] = [
        {
          id: '1',
          habit_id: '1',
          owner_id: 'user-1',
          occurred_day: yesterdayStr, // Completed YESTERDAY (local time)
          occurred_at: new Date().toISOString(),
          count: 1,
          occurrence_index: null,
        },
      ];

      const result = groupHabitsForSweep(habits as Habit[], progress);

      expect(result.daily.length).toBe(1); // Still visible in daily
      expect(result.completed.length).toBe(0); // NOT in completed
      expect(result.daily[0].isCompletedToday).toBe(false);
    });
  });
});
