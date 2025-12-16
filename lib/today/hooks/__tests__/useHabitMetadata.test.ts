/**
 * Tests for useHabitMetadata hook and computeHabitMetadata function
 *
 * These tests cover the habit metadata computation logic including:
 * - Cadence inference from frequency strings
 * - Target extraction from frequency strings
 * - Streak calculation for daily habits
 * - Rolling progress for weekly/monthly habits
 * - Days-since calculation for habits without streaks
 */

import { computeHabitMetadata, HabitForMetadata, HabitProgressRow } from '../useHabitMetadata';

describe('computeHabitMetadata', () => {
  // Helper to create a date string in YYYY-MM-DD format using LOCAL time
  const dateStr = (daysAgo: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    // Use local date formatting to match the implementation
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  describe('cadence inference from frequency string', () => {
    it('should infer weekly cadence from "5 times a week"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '5 times a week',
        cadence: 'day', // DB might have wrong cadence
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('5x/week');
      expect(result.type).toBe('rolling_progress');
    });

    it('should infer weekly cadence from "3x/week"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3x/week',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('3x/week');
      expect(result.type).toBe('rolling_progress');
    });

    it('should infer monthly cadence from "2 times a month"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '2 times a month',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('2x/month');
      expect(result.type).toBe('rolling_progress');
    });

    it('should use daily for "every day" frequency', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'every day',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('Daily');
    });

    it('should use daily for "daily" frequency', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('Daily');
    });

    it('should prioritize frequency string over cadence field', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '5 times a week', // Says weekly
        cadence: 'day', // DB says daily (wrong)
        target_per_period: 1, // Wrong target
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.type).toBe('rolling_progress');
      expect(result.target).toBe(5); // Inferred from frequency, not target_per_period
    });
  });

  describe('target extraction from frequency string', () => {
    it('should extract 5 from "5 times a week"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '5 times a week',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.target).toBe(5);
    });

    it('should extract 3 from "3x/week"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3x/week',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.target).toBe(3);
    });

    it('should extract 2 from "2 times per month"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '2 times per month',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.target).toBe(2);
    });

    it('should fall back to target_per_period when frequency has no number', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'weekly',
        cadence: 'weekly',
        target_per_period: 4,
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.target).toBe(4);
    });
  });

  describe('daily habits - streak calculation', () => {
    it('should show streak of 3 for 3 consecutive days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) }, // Today
        { habit_id: '1', occurred_day: dateStr(1) }, // Yesterday
        { habit_id: '1', occurred_day: dateStr(2) }, // 2 days ago
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('streak');
      expect(result.icon).toBe('Flame');
      expect(result.value).toBe(3);
      expect(result.label).toBe('3');
    });

    it('should show streak of 2 for yesterday and today', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) }, // Today
        { habit_id: '1', occurred_day: dateStr(1) }, // Yesterday
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('streak');
      expect(result.value).toBe(2);
    });

    it('should show days_since when streak is 1 (only today)', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) }, // Today only
      ];
      const result = computeHabitMetadata(habit, progress);
      // Streak is only 1, which is < 2, so shows days_since
      expect(result.type).toBe('days_since');
      expect(result.label).toBe('Today');
    });

    it('should show "New Habit" when no completions', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.type).toBe('days_since');
      expect(result.label).toBe('New Habit');
    });

    it('should show "1d ago" when last completion was yesterday', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(1) }, // Yesterday only
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('days_since');
      expect(result.label).toBe('1d ago');
    });

    it('should show "3d ago" when last completion was 3 days ago', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(3) }, // 3 days ago
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('days_since');
      expect(result.label).toBe('3d ago');
    });

    it('should start streak from yesterday if today not done', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        // Today not done
        { habit_id: '1', occurred_day: dateStr(1) }, // Yesterday
        { habit_id: '1', occurred_day: dateStr(2) }, // 2 days ago
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('streak');
      expect(result.value).toBe(2);
    });
  });

  describe('weekly habits - rolling progress', () => {
    it('should show 3/5 for 3 completions in past 7 days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '5 times a week',
      };
      // All within 7-day window (today + 6 days back)
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) }, // Today
        { habit_id: '1', occurred_day: dateStr(1) }, // Yesterday
        { habit_id: '1', occurred_day: dateStr(3) }, // 3 days ago
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('rolling_progress');
      expect(result.label).toBe('3/5');
      expect(result.value).toBe(3);
      expect(result.target).toBe(5);
      expect(result.periodLabel).toBe('past 7d');
    });

    it('should show 0/3 when no completions in past 7 days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3 times a week',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(10) }, // Too old (outside 7-day window)
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('rolling_progress');
      expect(result.label).toBe('0/3');
      expect(result.value).toBe(0);
    });

    it('should count unique days only (not duplicate entries)', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3 times a week',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) },
        { habit_id: '1', occurred_day: dateStr(0) }, // Duplicate same day
        { habit_id: '1', occurred_day: dateStr(1) },
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.value).toBe(2); // Only 2 unique days
    });

    it('should exclude completions older than 7 days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3 times a week',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) }, // In range
        { habit_id: '1', occurred_day: dateStr(6) }, // Still in range (7 days = today + 6 back)
        { habit_id: '1', occurred_day: dateStr(7) }, // Outside 7-day window
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.value).toBe(2); // Only 2 in the window
    });
  });

  describe('monthly habits - rolling progress', () => {
    it('should show 1/2 for 1 completion in past 30 days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '2 times a month',
      };
      const progress: HabitProgressRow[] = [{ habit_id: '1', occurred_day: dateStr(5) }];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('rolling_progress');
      expect(result.label).toBe('1/2');
      expect(result.periodLabel).toBe('past 30d');
    });

    it('should exclude completions older than 30 days', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '2 times a month',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(5) }, // In range
        { habit_id: '1', occurred_day: dateStr(35) }, // Too old
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.value).toBe(1);
    });
  });

  describe('filtering by habit_id', () => {
    it('should only count progress for the matching habit in weekly', () => {
      const habit: HabitForMetadata = {
        id: 'habit-1',
        frequency: '3 times a week',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: 'habit-1', occurred_day: dateStr(0) },
        { habit_id: 'habit-1', occurred_day: dateStr(1) },
        { habit_id: 'habit-2', occurred_day: dateStr(0) }, // Different habit
        { habit_id: 'habit-2', occurred_day: dateStr(1) },
        { habit_id: 'habit-2', occurred_day: dateStr(2) },
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.value).toBe(2); // Only habit-1's completions
    });

    it('should only count progress for the matching habit in daily streak', () => {
      const habit: HabitForMetadata = {
        id: 'habit-1',
        frequency: 'daily',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: 'habit-1', occurred_day: dateStr(0) },
        { habit_id: 'habit-1', occurred_day: dateStr(1) },
        { habit_id: 'habit-2', occurred_day: dateStr(0) }, // Different habit
        { habit_id: 'habit-2', occurred_day: dateStr(1) },
        { habit_id: 'habit-2', occurred_day: dateStr(2) },
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('streak');
      expect(result.value).toBe(2); // Only habit-1's streak
    });
  });

  describe('cadence normalization', () => {
    it('should handle cadence "day" same as "daily" for streak', () => {
      const habit: HabitForMetadata = {
        id: '1',
        cadence: 'day',
      };
      const progress: HabitProgressRow[] = [
        { habit_id: '1', occurred_day: dateStr(0) },
        { habit_id: '1', occurred_day: dateStr(1) },
      ];
      const result = computeHabitMetadata(habit, progress);
      expect(result.type).toBe('streak');
      expect(result.value).toBe(2);
    });

    it('should handle cadence "week" same as "weekly"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        cadence: 'week',
        target_per_period: 3,
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.type).toBe('rolling_progress');
      expect(result.periodLabel).toBe('past 7d');
    });

    it('should handle cadence "month" same as "monthly"', () => {
      const habit: HabitForMetadata = {
        id: '1',
        cadence: 'month',
        target_per_period: 2,
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.type).toBe('rolling_progress');
      expect(result.periodLabel).toBe('past 30d');
    });
  });

  describe('frequency label generation', () => {
    it('should generate "Daily" for daily habits', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'daily',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('Daily');
    });

    it('should generate "3x/week" for weekly habits', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '3 times a week',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('3x/week');
    });

    it('should generate "2x/month" for monthly habits', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: '2 times a month',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('2x/month');
    });

    it('should handle "every night" as daily', () => {
      const habit: HabitForMetadata = {
        id: '1',
        frequency: 'every night',
      };
      const result = computeHabitMetadata(habit, []);
      expect(result.frequencyLabel).toBe('Daily');
    });
  });
});
