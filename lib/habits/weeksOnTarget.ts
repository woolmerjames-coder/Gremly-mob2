/**
 * A habit's weeks on its detail screen: the row of seven days it shows, and
 * how many of its weeks met their target. A week is the person's own: the
 * seven days that end on their weekly day (lib/week/habitWeek). Pure.
 */
import { unpaused, weekAround } from '../week/habitWeek';
import { addDays, spanDays } from '../week/model';

/** The most weeks the count of weeks on target looks back over */
const WEEKS_BACK = 52;

/**
 * The seven days of the week the detail screen shows: their current week,
 * moved by whole weeks (0 for this week, -1 for the one before).
 */
export function weekRowDays(today: string, weeklyDay: number, weekOffset = 0): string[] {
  const week = weekAround(today, weeklyDay);
  return spanDays(addDays(week.first, 7 * weekOffset), addDays(week.last, 7 * weekOffset));
}

/**
 * How many of a habit's weeks met its weekly target. It walks back from
 * their current week through every week that began at or after the moment
 * the habit started, a year of them at most. A week it was paused in for any
 * day is passed over, unless they met the target in it anyway: a pause is
 * never a week missed.
 */
export function countWeeksOnTarget(p: {
  completedDates: string[];
  targetPerWeek: number;
  /** When the habit started */
  start: Date;
  today: string;
  weeklyDay: number;
  /** The habit's own pauses (habit_adaptations rows) */
  eases?: { habit_id: string }[];
  habitId?: string;
}): { weeksHit: number; totalWeeks: number } {
  let weeksHit = 0;
  let totalWeeks = 0;
  let looked = 0;
  let { first, last } = weekAround(p.today, p.weeklyDay);
  // a week begins at midnight on its first day
  while (new Date(`${first}T00:00:00`) >= p.start && looked < WEEKS_BACK) {
    looked++;
    const done = p.completedDates.filter((d) => d >= first && d <= last).length;
    const met = done >= p.targetPerWeek;
    const days = spanDays(first, last);
    const paused = !!p.habitId && unpaused(p.eases ?? [], p.habitId, days).length < days.length;
    if (met) weeksHit++;
    if (met || !paused) totalWeeks++;
    first = addDays(first, -7);
    last = addDays(last, -7);
  }
  return { weeksHit, totalWeeks };
}
