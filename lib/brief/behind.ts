/**
 * Behind this week (decided 1 Oct, gap 2 of the context handoff).
 *
 * Weekly-target habits only. A habit is behind when what is done so far this
 * week is under its target pro rata for the days gone:
 *
 *   done < floor(target × days gone ÷ 7)
 *
 * Weeks start on Monday and today counts as gone, so Wednesday is day 3: on a
 * Wednesday 0 of 3 is behind (floor(9/7) = 1) and 0 of 2 is not (floor(6/7) = 0).
 * Daily habits never count as behind, and nor do habits being broken.
 *
 * One rule feeds the day card, the Behind tags and the plan's candidate pool.
 */

import type { Habit } from '../types';

/** 1 on Monday through 7 on Sunday, for a YYYY-MM-DD and its week's Monday. */
export function dayOfWeekNumber(today: string, weekStartMonday: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(
    +weekStartMonday.slice(0, 4),
    +weekStartMonday.slice(5, 7) - 1,
    +weekStartMonday.slice(8, 10),
  );
  return Math.min(7, Math.max(1, Math.round((a - b) / 864e5) + 1));
}

/** The habit's weekly target, or null when it is not a weekly-target habit. */
export function weeklyTarget(
  habit: Pick<Habit, 'cadence' | 'target_per_period' | 'days_active' | 'subtype'>,
): number | null {
  if ((habit.subtype as string | undefined) === 'break_habit') return null;
  if ((habit.cadence ?? 'daily') !== 'weekly') return null;
  const target =
    habit.target_per_period ?? (habit.days_active?.length ? habit.days_active.length : 1);
  return target > 0 ? target : null;
}

/** How many should be done by now for the week to stay on pace. */
export function paceFloor(target: number, daysGone: number): number {
  return Math.floor((target * daysGone) / 7);
}

export function isBehindThisWeek(
  habit: Pick<Habit, 'cadence' | 'target_per_period' | 'days_active' | 'subtype' | 'archived'>,
  doneThisWeek: number,
  daysGone: number,
): boolean {
  if (habit.archived) return false;
  const target = weeklyTarget(habit);
  if (target === null) return false;
  return doneThisWeek < paceFloor(target, daysGone);
}

/** The habits behind this week, in the order given. */
export function habitsBehindThisWeek<H extends Habit>(
  habits: H[],
  doneThisWeek: Map<string, number>,
  daysGone: number,
): H[] {
  return habits.filter((h) => isBehindThisWeek(h, doneThisWeek.get(h.id) ?? 0, daysGone));
}
