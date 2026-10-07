/**
 * Shared streak computation utilities for habits.
 *
 * Used by HabitsScreen, NowWeekPopup, and HabitDetailScreen to compute
 * the true current streak from the full completion history.
 */

import { dateService } from '../date/DateService';
import type { HabitAdaptationRow } from '../store/useGremlyStore';
import { easeOf, weekAround, type Ease } from '../week/habitWeek';
import { addDays } from '../week/model';

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
 * Days fully covered by a 'pause' adaptation are skipped transparently
 * (they don't count as a hit OR break the streak).
 *
 * @param completedDates — array of 'YYYY-MM-DD' strings (any order)
 * @param adaptations — optional list of habit_adaptations for this habit
 * @returns current streak count
 */
export function computeCurrentStreak(
  completedDates: string[],
  adaptations: HabitAdaptationRow[] = [],
): number {
  if (completedDates.length === 0) return 0;

  const dateSet = new Set(completedDates);
  let streak = 0;
  let cursor = dateService.today();

  /** True if the given YYYY-MM-DD falls inside any pause window */
  const isPaused = (day: string): boolean =>
    adaptations.some((a) => a.mode === 'pause' && a.period_start <= day && a.period_end >= day);

  // If today isn't completed (and isn't paused), start from yesterday
  if (!dateSet.has(cursor) && !isPaused(cursor)) {
    cursor = dateService.yesterday();
  }

  while (dateSet.has(cursor) || isPaused(cursor)) {
    if (dateSet.has(cursor)) {
      // A day the user actually completed counts, even if a pause also covers it.
      streak++;
    }
    // else: paused-but-not-completed day, skipped transparently (no count, no break)
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
 * A week is the person's own: the seven days that end on their weekly day.
 *
 * Pause adaptations are handled transparently:
 * - Daily: paused days are skipped without breaking the streak.
 * - Weekly: a week with any paused day in it is skipped without breaking,
 *   unless the target was met in it anyway, when it counts as usual.
 *
 * @param completedDates — array of 'YYYY-MM-DD' strings (any order)
 * @param cadence — 'daily' | 'weekly' | 'monthly'
 * @param targetPerPeriod — target completions per period
 * @param adaptations — optional list of habit_adaptations for this habit
 * @param weeklyDay their weekly day, 0 Sunday to 6 Saturday (Sunday when left out)
 * @returns { count, unit } — e.g. { count: 36, unit: 'day' } or { count: 4, unit: 'week' }
 */
export function computeHabitStreak(
  completedDates: string[],
  cadence: string = 'daily',
  targetPerPeriod: number = 1,
  adaptations: HabitAdaptationRow[] = [],
  weeklyDay: number = 0,
): { count: number; unit: 'day' | 'week' } {
  if (completedDates.length === 0) return { count: 0, unit: 'day' };

  if (cadence === 'daily' || cadence === 'monthly') {
    return { count: computeCurrentStreak(completedDates, adaptations), unit: 'day' };
  }

  if (cadence === 'weekly') {
    // Count consecutive weeks where completions >= target
    const sorted = [...completedDates].sort();
    const today = dateService.today();
    let streak = 0;

    // A target under 1 is met by every week, and the walk back would never
    // end: a week needs at least one completion to count
    const target = Math.max(1, targetPerPeriod);

    const pauses = adaptations.map(easeOf).filter((e): e is Ease => e?.mode === 'pause');

    /** True if any day in [start, end] (inclusive) is covered by a pause */
    const isWeekPaused = (startStr: string, endStr: string): boolean =>
      pauses.some((p) => p.first <= endStr && p.last >= startStr);

    // Their current week: the seven days that end on their weekly day
    let { first: weekStartStr, last: weekEndStr } = weekAround(today, weeklyDay);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const completionsThisWeek = sorted.filter((d) => d >= weekStartStr && d <= weekEndStr).length;

      if (completionsThisWeek >= target) {
        // Met, paused or not: a habit logged through a pause still counts
        streak++;
      } else if (weekEndStr >= today) {
        // Current week still in progress — skip without breaking streak
      } else if (isWeekPaused(weekStartStr, weekEndStr)) {
        // A week with a paused day in it: skip transparently (no hit, no break)
      } else {
        break;
      }

      weekStartStr = addDays(weekStartStr, -7);
      weekEndStr = addDays(weekEndStr, -7);
    }

    return { count: streak, unit: 'week' };
  }

  // Unknown cadence fallback
  return { count: computeCurrentStreak(completedDates, adaptations), unit: 'day' };
}
