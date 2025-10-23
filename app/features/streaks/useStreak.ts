/**
 * Phase 10.9: useStreak Hook
 *
 * React hook for fetching and tracking user activity streaks.
 */

import { useState, useEffect } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { getEnv } from '../../../lib/env';
import { getCurrentStreak, type StreakResult } from './streakService';
import { format, startOfDay, subDays } from 'date-fns';

export function useStreak() {
  const repo = useRepo();
  const { userId } = useAuth();
  const [streak, setStreak] = useState<StreakResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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

    fetchStreak();
  }, [userId]);

  async function fetchStreak() {
    try {
      setLoading(true);
      setError(null);

      const lookbackDays = parseInt(getEnv('EXPO_PUBLIC_STREAK_LOOKBACK_DAYS') || '30', 10);

      // Fetch activity dates from repository
      const activityDates = await fetchActivityDates(lookbackDays);

      // Calculate streak
      const result = getCurrentStreak(activityDates);
      setStreak(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch streak'));
      console.error('[useStreak] Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchActivityDates(sinceDays: number): Promise<string[]> {
    const dates = new Set<string>();
    const sinceDate = format(subDays(startOfDay(new Date()), sinceDays), 'yyyy-MM-dd');

    try {
      // Fetch completed todos
      const todos = await repo.listByType('todo');
      todos.forEach((todo) => {
        if (todo.type === 'todo') {
          const todoAny = todo as any;
          if (todoAny.completed_at) {
            const completedDate = format(startOfDay(new Date(todoAny.completed_at)), 'yyyy-MM-dd');
            if (completedDate >= sinceDate) {
              dates.add(completedDate);
            }
          }
        }
      });

      // Fetch habits with checkins
      const habits = await repo.listByType('habit');
      habits.forEach((habit) => {
        if (habit.type === 'habit') {
          const habitAny = habit as any;
          if (habitAny.checkins && Array.isArray(habitAny.checkins)) {
            habitAny.checkins.forEach((checkin: any) => {
              if (checkin.date) {
                const checkinDate =
                  typeof checkin.date === 'string'
                    ? checkin.date
                    : format(startOfDay(new Date(checkin.date)), 'yyyy-MM-dd');

                if (checkinDate >= sinceDate) {
                  dates.add(checkinDate);
                }
              }
            });
          }
        }
      });
    } catch (err) {
      console.error('[useStreak] Error fetching activity:', err);
    }

    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }

  return {
    streak,
    loading,
    error,
    refetch: fetchStreak,
  };
}
