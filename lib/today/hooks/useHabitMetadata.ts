// lib/today/hooks/useHabitMetadata.ts

import { useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import type { Habit } from '../../types';
import {
  getFrequencyLabel as getHabitFrequencyLabel,
  normalizeCadence,
} from '../../sweep/habitHelpers';

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
  name?: string; // For debugging
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
 * Infer cadence from frequency string when cadence field is not set.
 * E.g., "5 times a week" → 'weekly', "2 times a month" → 'monthly'
 */
function inferCadenceFromFrequency(frequency?: string): 'daily' | 'weekly' | 'monthly' {
  if (!frequency) return 'daily';
  const freq = frequency.toLowerCase();

  // Check for weekly patterns
  if (freq.includes('week') || freq.match(/\d+x\/week/i)) {
    return 'weekly';
  }

  // Check for monthly patterns
  if (freq.includes('month') || freq.match(/\d+x\/month/i)) {
    return 'monthly';
  }

  // Default to daily
  return 'daily';
}

/**
 * Extract target count from frequency string.
 * E.g., "5 times a week" → 5, "2x/month" → 2
 */
function extractTargetFromFrequency(frequency?: string): number | null {
  if (!frequency) return null;

  // Match patterns like "5 times a week", "3x/week", "2 times per month"
  const match = frequency.match(/(\d+)\s*(?:times?\s*(?:a|per)\s*)?(?:week|month|x\/)/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Pure function to compute habit metadata from habit and progress data.
 * Can be used outside of React hooks.
 */
export function computeHabitMetadata(
  habit: HabitForMetadata,
  habitProgress: HabitProgressRow[],
): HabitMetadata {
  // ALWAYS infer cadence from frequency string first (most accurate source)
  // Fall back to habit.cadence only if frequency doesn't indicate weekly/monthly
  const inferredFromFreq = inferCadenceFromFrequency(habit.frequency);
  const cadence = inferredFromFreq !== 'daily' ? inferredFromFreq : normalizeCadence(habit.cadence);

  // ALWAYS infer target from frequency string first
  // Fall back to habit.target_per_period only if frequency doesn't have a number
  const inferredTarget = extractTargetFromFrequency(habit.frequency);
  const targetPerPeriod = inferredTarget ?? habit.target_per_period ?? 1;
  const today = new Date();

  // Use centralized frequency label from habitHelpers
  const frequencyLabel = getHabitFrequencyLabel(habit as Habit);

  // Helper to format date as local YYYY-MM-DD
  const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get completions in rolling window
  const getCompletionsInWindow = (days: number): string[] => {
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - days + 1);
    const windowStartStr = toLocalDateString(windowStart);
    const todayStr = toLocalDateString(today);

    return habitProgress
      .filter(
        (p) =>
          p.habit_id === habit.id && p.occurred_day >= windowStartStr && p.occurred_day <= todayStr,
      )
      .map((p) => p.occurred_day);
  };

  // Calculate streak (consecutive days ending today or yesterday)
  const calculateStreak = (): number => {
    const todayStr = toLocalDateString(today);
    const completionDays = new Set(
      habitProgress.filter((p) => p.habit_id === habit.id).map((p) => p.occurred_day),
    );

    let streak = 0;
    const checkDate = new Date(today);

    // Start from today, go backwards
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const checkStr = toLocalDateString(checkDate);
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

    // Parse the date as local date (YYYY-MM-DD)
    const lastCompletionStr = completions[0];
    const todayStr = toLocalDateString(today);

    // If completed today, return 0
    if (lastCompletionStr === todayStr) return 0;

    // Calculate day difference by parsing as local dates
    const [y1, m1, d1] = lastCompletionStr.split('-').map(Number);
    const lastDate = new Date(y1, m1 - 1, d1); // month is 0-indexed
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const diffTime = todayDate.getTime() - lastDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Normalize cadence to handle both 'day'/'daily', 'week'/'weekly', 'month'/'monthly'
  const normalizedCadence = (() => {
    const c = cadence.toLowerCase();
    if (c === 'day' || c === 'daily') return 'daily';
    if (c === 'week' || c === 'weekly') return 'weekly';
    if (c === 'month' || c === 'monthly') return 'monthly';
    return 'daily'; // Default to daily for unknown cadence
  })();

  switch (normalizedCadence) {
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
  const habitProgress = useGremlyStore((s) => s.habitProgress) ?? [];

  return useMemo(() => {
    return computeHabitMetadata(habit, habitProgress);
  }, [habit, habitProgress]);
}
