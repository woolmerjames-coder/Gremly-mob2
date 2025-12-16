// lib/today/hooks/useHabitMetadata.ts

import { useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import type { Habit } from '../../types';

export interface HabitMetadata {
  type: 'streak' | 'days_since' | 'rolling_progress';
  icon: 'Flame' | 'RotateCcw' | 'RefreshCw' | 'Calendar';
  label: string;
  value: number;
  target?: number;
  periodLabel?: string; // "past 7d" or "past 30d"
  frequencyLabel: string; // "Daily", "3x/week", "2x/month"
}

/** Minimal habit shape needed for metadata computation */
export interface HabitForMetadata {
  id: string;
  cadence?: 'daily' | 'weekly' | 'monthly' | string; // Also handles 'day', 'week', 'month'
  target_per_period?: number;
  frequency?: string; // Human-readable like "3 times a week"
}

/** Habit progress row shape */
export interface HabitProgressRow {
  habit_id: string;
  occurred_day: string;
  count?: number;
}

/**
 * Pure function to compute habit metadata from habit and progress data.
 * Can be used outside of React hooks.
 */
export function computeHabitMetadata(
  habit: HabitForMetadata,
  habitProgress: HabitProgressRow[],
): HabitMetadata {
  const cadence = habit.cadence ?? 'daily';
  const targetPerPeriod = habit.target_per_period ?? 1;
  const today = new Date();

  // Compute frequency label - parse from frequency string first, then cadence
  const getFrequencyLabel = (): string => {
    // Primary: parse human-readable frequency string like "3 times a week"
    if (habit.frequency) {
      const freq = habit.frequency.toLowerCase();

      // Check for "X times a week" pattern
      const weekMatch = freq.match(/(\d+)\s*(?:times?\s*(?:a|per)\s*)?week/i);
      if (weekMatch) {
        const count = parseInt(weekMatch[1], 10);
        return `${count}x/week`;
      }

      // Check for "X times a month" pattern
      const monthMatch = freq.match(/(\d+)\s*(?:times?\s*(?:a|per)\s*)?month/i);
      if (monthMatch) {
        const count = parseInt(monthMatch[1], 10);
        return `${count}x/month`;
      }

      // Check for "daily" or "every day"
      if (freq === 'daily' || freq.includes('every day')) {
        return 'Daily';
      }
    }

    // Secondary: use cadence field (handle 'day'/'daily', 'week'/'weekly', 'month'/'monthly')
    const normalizedCadence = cadence.toLowerCase();
    if (normalizedCadence === 'daily' || normalizedCadence === 'day') {
      return 'Daily';
    }
    if (normalizedCadence === 'weekly' || normalizedCadence === 'week') {
      return `${targetPerPeriod}x/week`;
    }
    if (normalizedCadence === 'monthly' || normalizedCadence === 'month') {
      return `${targetPerPeriod}x/month`;
    }

    return 'Daily';
  };

  const frequencyLabel = getFrequencyLabel();

  // Get completions in rolling window
  const getCompletionsInWindow = (days: number): string[] => {
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - days + 1);
    const windowStartStr = windowStart.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    return habitProgress
      .filter(
        (p) =>
          p.habit_id === habit.id && p.occurred_day >= windowStartStr && p.occurred_day <= todayStr,
      )
      .map((p) => p.occurred_day);
  };

  // Calculate streak (consecutive days ending today or yesterday)
  const calculateStreak = (): number => {
    const todayStr = today.toISOString().split('T')[0];
    const completionDays = new Set(
      habitProgress.filter((p) => p.habit_id === habit.id).map((p) => p.occurred_day),
    );

    let streak = 0;
    const checkDate = new Date(today);

    // Start from today, go backwards
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const checkStr = checkDate.toISOString().split('T')[0];
      if (completionDays.has(checkStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (streak === 0 && checkStr === todayStr) {
        // Today not done yet, check yesterday
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

  // Calculate days since last completion
  const getDaysSince = (): number => {
    const completions = habitProgress
      .filter((p) => p.habit_id === habit.id)
      .map((p) => p.occurred_day)
      .sort()
      .reverse();

    if (completions.length === 0) return -1; // Never completed

    const lastCompletion = new Date(completions[0]);
    const diffTime = today.getTime() - lastCompletion.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  switch (cadence) {
    case 'daily': {
      const streak = calculateStreak();
      if (streak >= 2) {
        return {
          type: 'streak',
          icon: 'Flame',
          label: `${streak}`,
          value: streak,
          frequencyLabel,
        };
      } else {
        const daysSince = getDaysSince();
        return {
          type: 'days_since',
          icon: 'RotateCcw',
          label: daysSince < 0 ? 'New Habit' : daysSince === 0 ? 'Today' : `${daysSince}d ago`,
          value: daysSince,
          frequencyLabel,
        };
      }
    }

    case 'weekly': {
      const completions = getCompletionsInWindow(7);
      const uniqueDays = new Set(completions).size;
      return {
        type: 'rolling_progress',
        icon: 'RefreshCw',
        label: `${uniqueDays}/${targetPerPeriod}`,
        value: uniqueDays,
        target: targetPerPeriod,
        periodLabel: 'past 7d',
        frequencyLabel,
      };
    }

    case 'monthly': {
      const completions = getCompletionsInWindow(30);
      const uniqueDays = new Set(completions).size;
      return {
        type: 'rolling_progress',
        icon: 'Calendar',
        label: `${uniqueDays}/${targetPerPeriod}`,
        value: uniqueDays,
        target: targetPerPeriod,
        periodLabel: 'past 30d',
        frequencyLabel,
      };
    }

    default:
      // Default to daily with "New Habit" label
      return {
        type: 'days_since',
        icon: 'RotateCcw',
        label: 'New Habit',
        value: 0,
        frequencyLabel: 'Daily',
      };
  }
}

/**
 * React hook to compute display metadata for a habit based on its cadence and completion history.
 * Uses rolling windows (never calendar-bound).
 */
export function useHabitMetadata(habit: Habit): HabitMetadata {
  const habitProgress = useGremlyStore((s) => s.habitProgress);

  return useMemo(() => {
    return computeHabitMetadata(habit, habitProgress);
  }, [habit, habitProgress]);
}
