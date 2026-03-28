/**
 * Phase 10.9: useStreak Hook
 *
 * React hook for fetching and tracking user activity streaks.
 */

import { useState, useEffect, useMemo } from 'react';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useAuth } from '../../../providers/AuthProvider';
import { getEnv } from '../../../lib/env';
import { getCurrentStreak, type StreakResult } from './streakService';
import { getDateService } from '../../../lib/date';

export function useStreak() {
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const { userId } = useAuth();
  const [streak, setStreak] = useState<StreakResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Compute activity dates from store data
  const activityDates = useMemo(() => {
    const lookbackDays = parseInt(getEnv('EXPO_PUBLIC_STREAK_LOOKBACK_DAYS') || '30', 10);
    const dates = new Set<string>();
    const sinceDate = getDateService().daysAgo(lookbackDays);

    // Get dates from completed todos
    todos.forEach((todo) => {
      if (todo.completed_at) {
        const completedDate = getDateService().toLocalDate(new Date(todo.completed_at));
        if (completedDate >= sinceDate) {
          dates.add(completedDate);
        }
      }
    });

    // Get dates from habit checkins
    habits.forEach((habit) => {
      const habitAny = habit as any;
      if (habitAny.checkins && Array.isArray(habitAny.checkins)) {
        habitAny.checkins.forEach((checkin: any) => {
          if (checkin.date) {
            const checkinDate =
              typeof checkin.date === 'string'
                ? checkin.date
                : getDateService().toLocalDate(new Date(checkin.date));

            if (checkinDate >= sinceDate) {
              dates.add(checkinDate);
            }
          }
        });
      }
    });

    return Array.from(dates).sort();
  }, [todos, habits]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const streaksEnabled = getEnv('EXPO_PUBLIC_STREAKS') === 'on';
    if (!streaksEnabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Calculate streak from memoized activity dates
      const result = getCurrentStreak(activityDates);
      setStreak(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch streak'));
      console.error('[useStreak] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, activityDates]);

  return {
    streak,
    loading,
    error,
    refetch: () => {
      // With Zustand, data is always fresh - this is a no-op but kept for API compatibility
    },
  };
}
