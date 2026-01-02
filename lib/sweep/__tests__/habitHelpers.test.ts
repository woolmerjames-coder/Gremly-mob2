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
});
