// lib/today/hooks/useHabitMetadata.ts

import { useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import type { Habit } from '../../types';

export interface HabitMetadata {
  type: 'streak' | 'days_since' | 'rolling_progress';
  icon: 'Flame' | 'Clock' | 'RefreshCw' | 'Calendar';
  label: string;
  value: number;
  target?: number;
  periodLabel?: string; // "past 7d" or "past 30d"
}

/**
 * Compute display metadata for a habit based on its cadence and completion history.
 * Uses rolling windows (never calendar-bound).
 */
export function useHabitMetadata(habit: Habit): HabitMetadata {
  const habitProgress = useGremlyStore((s) => s.habitProgress);

  return useMemo(() => {
    const cadence = habit.cadence ?? 'daily';
    const targetPerPeriod = habit.target_per_period ?? 1;
    const today = new Date();

    // Get completions in rolling window
    const getCompletionsInWindow = (days: number): string[] => {
      const windowStart = new Date(today);
      windowStart.setDate(today.getDate() - days + 1);
      const windowStartStr = windowStart.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      return habitProgress
        .filter(
          (p) =>
            p.habit_id === habit.id &&
            p.occurred_day >= windowStartStr &&
            p.occurred_day <= todayStr,
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
          };
        } else {
          const daysSince = getDaysSince();
          return {
            type: 'days_since',
            icon: 'Clock',
            label: daysSince < 0 ? 'New' : daysSince === 0 ? 'Today' : `${daysSince}d ago`,
            value: daysSince,
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
        };
      }

      default:
        return {
          type: 'days_since',
          icon: 'Clock',
          label: 'N/A',
          value: 0,
        };
    }
  }, [habit, habitProgress]);
}
