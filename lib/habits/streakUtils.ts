/**
 * Shared streak computation utilities for habits.
 *
 * Used by HabitsScreen, NowWeekPopup, and HabitDetailScreen to compute
 * the true current streak from the full completion history.
 */

import { dateService } from '../date/DateService';

/** Pad YYYY-MM-DD from a Date in local timezone */
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Count consecutive completed days backward from today.
 * If today isn't completed, starts from yesterday (grace period).
 *
 * @param completedDates — array of 'YYYY-MM-DD' strings (any order)
 * @returns current streak count
 */
export function computeCurrentStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const dateSet = new Set(completedDates);
  let streak = 0;
  let cursor = dateService.today();

  // If today isn't completed, start from yesterday
  if (!dateSet.has(cursor)) {
    cursor = dateService.yesterday();
  }

  while (dateSet.has(cursor)) {
    streak++;
    const d = new Date(cursor + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    cursor = toLocalISO(d);
  }

  return streak;
}

/**
 * Find the longest consecutive run in a list of ISO date strings.
 *
 * @param completedDates — array of 'YYYY-MM-DD' strings (any order)
 * @returns best streak count
 */
export function computeBestStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const sorted = [...completedDates].sort();
  let best = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      run++;
      if (run > best) best = run;
    } else if (diffDays > 1) {
      run = 1;
    }
    // diffDays === 0 means duplicate, skip
  }

  return best;
}

/**
 * Compute the current streak for a habit given its full progress history.
 * For daily habits: counts consecutive days.
 * For weekly habits: counts consecutive weeks where completions >= target.
 *
 * @param completedDates — array of 'YYYY-MM-DD' strings (any order)
 * @param cadence — 'daily' | 'weekly' | 'monthly'
 * @param targetPerPeriod — target completions per period
 * @returns { count, unit } — e.g. { count: 36, unit: 'day' } or { count: 4, unit: 'week' }
 */
export function computeHabitStreak(
  completedDates: string[],
  cadence: string = 'daily',
  targetPerPeriod: number = 1,
): { count: number; unit: 'day' | 'week' } {
  if (completedDates.length === 0) return { count: 0, unit: 'day' };

  if (cadence === 'daily' || cadence === 'monthly') {
    return { count: computeCurrentStreak(completedDates), unit: 'day' };
  }

  if (cadence === 'weekly') {
    // Count consecutive weeks where completions >= target
    const sorted = [...completedDates].sort();
    const today = dateService.today();
    let streak = 0;

    // Get Monday of a given date
    const getWeekStart = (d: Date): Date => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
    };

    const weekStart = getWeekStart(new Date(today + 'T00:00:00'));

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekStartStr = toLocalISO(weekStart);
      const weekEndStr = toLocalISO(weekEnd);

      const completionsThisWeek = sorted.filter((d) => d >= weekStartStr && d <= weekEndStr).length;

      if (completionsThisWeek >= targetPerPeriod) {
        streak++;
        weekStart.setDate(weekStart.getDate() - 7);
      } else if (weekEndStr >= today) {
        // Current week still in progress — skip without breaking streak
        weekStart.setDate(weekStart.getDate() - 7);
      } else {
        break;
      }
    }

    return { count: streak, unit: 'week' };
  }

  // Unknown cadence fallback
  return { count: computeCurrentStreak(completedDates), unit: 'day' };
}
