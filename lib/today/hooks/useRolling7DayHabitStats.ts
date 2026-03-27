/**
 * useRolling7DayHabitStats - Rolling 7-day window stats for habits
 *
 * Uses rolling 7 days ending today (not calendar M-S).
 * Computes metadata, status, and daily completion data for each habit.
 */

import { useMemo } from 'react';
import { useGremlyStore, type HabitProgressRow } from '../../store/useGremlyStore';
import { getDateService } from '../../date';
import type { Habit } from '../../types';

export interface Rolling7DayHabitStats {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';

  // Display metadata
  metadataLabel: string; // "2/3 past 7d", "🔥 12", "2d ago"
  metadataIcon?: 'Flame' | 'Clock' | 'RefreshCw' | 'Calendar';

  // Status
  status: 'on_track' | 'needs_attention' | 'done_for_period';

  // Rolling 7 days
  days: Array<{
    date: string;
    dayLabel: string;
    isToday: boolean;
    isCompleted: boolean;
    isFuture: boolean;
  }>;

  // For sorting
  sortPriority: number; // Lower = higher in list
}

/**
 * Calculate consecutive day streak ending today or yesterday
 */
function calculateStreak(habitId: string, progress: HabitProgressRow[], todayStr: string): number {
  const completionDays = new Set(
    progress.filter((p) => p.habit_id === habitId).map((p) => p.occurred_day),
  );

  let streak = 0;
  const ds = getDateService();
  let checkStr = todayStr;

  // If not done today, start checking from yesterday
  if (!completionDays.has(todayStr)) {
    checkStr = ds.addDays(todayStr, -1);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (completionDays.has(checkStr)) {
      streak++;
      checkStr = ds.addDays(checkStr, -1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate days since last completion
 */
function calculateDaysSince(
  habitId: string,
  progress: HabitProgressRow[],
  todayStr: string,
): number {
  const completions = progress
    .filter((p) => p.habit_id === habitId)
    .map((p) => p.occurred_day)
    .sort()
    .reverse();

  if (completions.length === 0) return -1;

  // Use DateService.daysBetween for timezone-safe calculation
  return getDateService().daysBetween(completions[0], todayStr);
}

export function useRolling7DayHabitStats(habits: Habit[]): Rolling7DayHabitStats[] {
  const habitProgress = useGremlyStore((s) => s.habitProgress);

  return useMemo(() => {
    const ds = getDateService();
    const todayStr = ds.getCurrentDate();

    // Build rolling 7 days (today is rightmost)
    const rolling7Days: Array<{
      date: string;
      dayLabel: string;
      isToday: boolean;
      isFuture: boolean;
    }> = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = ds.addDays(todayStr, -i);
      const d = ds.fromDateString(dateStr) ?? getDateService().now();
      const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      rolling7Days.push({
        date: dateStr,
        dayLabel: dayNames[d.getDay()],
        isToday: i === 0,
        isFuture: false, // All 7 days are past or today
      });
    }

    return habits
      .filter((h) => !h.archived)
      .map((habit) => {
        const cadence = (habit.cadence ?? 'daily') as 'daily' | 'weekly' | 'monthly';
        const target = habit.target_per_period ?? 1;

        // Get completions for this habit in rolling window
        const completionSet = new Set(
          habitProgress.filter((p) => p.habit_id === habit.id).map((p) => p.occurred_day),
        );

        console.log(
          '[DEBUG] habit:',
          habit.name,
          'completionSet:',
          Array.from(completionSet),
          'rolling7Days:',
          rolling7Days.map((d) => d.date),
        );

        // Build days array
        const days = rolling7Days.map((day) => ({
          ...day,
          isCompleted: completionSet.has(day.date),
        }));

        const completionsIn7Days = days.filter((d) => d.isCompleted).length;

        // Compute metadata and status based on cadence
        let metadataLabel: string;
        let metadataIcon: 'Flame' | 'Clock' | 'RefreshCw' | 'Calendar' | undefined;
        let status: 'on_track' | 'needs_attention' | 'done_for_period';
        let sortPriority: number;

        if (cadence === 'daily') {
          // Calculate streak
          const streak = calculateStreak(habit.id, habitProgress, todayStr);
          const daysSince = calculateDaysSince(habit.id, habitProgress, todayStr);

          if (streak >= 2) {
            metadataLabel = `${streak}`;
            metadataIcon = 'Flame';
          } else {
            metadataLabel =
              daysSince === 0 ? 'Today' : daysSince < 0 ? 'Never' : `${daysSince}d ago`;
            metadataIcon = 'Clock';
          }

          // Daily: on track if done today or streak active
          const doneToday = completionSet.has(todayStr);
          if (doneToday) {
            status = 'done_for_period';
            sortPriority = 30;
          } else if (streak >= 1) {
            status = 'on_track';
            sortPriority = 20;
          } else {
            status = 'needs_attention';
            sortPriority = 10;
          }
        } else {
          // Weekly/Monthly: rolling progress
          const periodLabel = cadence === 'weekly' ? 'past 7d' : 'past 30d';

          // For monthly, need to check 30-day window separately
          let completionsInPeriod = completionsIn7Days;
          if (cadence === 'monthly') {
            const windowStartStr = ds.addDays(todayStr, -29);
            // Count unique days in 30-day window
            const daysInWindow = new Set(
              habitProgress
                .filter(
                  (p) =>
                    p.habit_id === habit.id &&
                    p.occurred_day >= windowStartStr &&
                    p.occurred_day <= todayStr,
                )
                .map((p) => p.occurred_day),
            );
            completionsInPeriod = daysInWindow.size;
          }

          metadataLabel = `${completionsInPeriod}/${target} ${periodLabel}`;
          metadataIcon = cadence === 'weekly' ? 'RefreshCw' : 'Calendar';

          if (completionsInPeriod >= target) {
            status = 'done_for_period';
            sortPriority = 30;
          } else if (completionsInPeriod >= target * 0.5) {
            // On pace if at least 50% there
            status = 'on_track';
            sortPriority = 20;
          } else {
            status = 'needs_attention';
            sortPriority = 10;
          }
        }

        return {
          id: habit.id,
          name: habit.name,
          cadence,
          metadataLabel,
          metadataIcon,
          status,
          days,
          sortPriority,
        };
      })
      .sort((a, b) => a.sortPriority - b.sortPriority);
  }, [habits, habitProgress]);
}
