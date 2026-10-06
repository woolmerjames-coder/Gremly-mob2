/**
 * A habit on a day of their week: which habit a morning checks in on, and the
 * day one can move to. Shared by the worker that writes the morning brief
 * (workers/inngest-jobs/brief) and the app (lib/week/habitWeek, the brief's
 * check in and the wrap up's habits card). Pure: no clock and no I/O. Like
 * week.js, everything here is decided by dates, ids and numbers alone, never
 * by anyone's words.
 *
 * A habit's days are its habit_plans rows. A check in is about one still
 * planned for today: a habit they are building, on days they chose (weekly or
 * monthly; a daily habit is on every day, so there is nothing to ask), not
 * done today, and not quieted. Skip this week quiets a habit until the week
 * ends: the last quiet day is kept on the habit (views.checkins_quiet_until).
 *
 * The day one can move to is a day left in their week that the habit runs on
 * and is not already planned on: the one with the most room, when the habit
 * fits in it. Room is the board's (lib/week/board): the free hours its kind of
 * day has, less the todos due on it and the habits planned on it.
 */

import { addDays, dayKind, isDay, minutesOf, spanDays, summaryWeekOf } from './week.js';
import { habitOpenDays } from './weekBoard.js';

/** Where the last quiet day is kept in a habit's views. */
export const QUIET_FIELD = 'checkins_quiet_until';

const dayOf = (v) => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return isDay(s) ? s : null;
};

/**
 * A habit as these rules read it. quiet_until is read from the habit's views,
 * or from a column of that name when the row was selected that way.
 */
export function habitShape(h) {
  const cadence = ['weekly', 'monthly'].includes(h?.cadence) ? h.cadence : 'daily';
  return {
    id: h?.id,
    title: h?.name || h?.title || 'Habit',
    cadence,
    days_active: Array.isArray(h?.days_active)
      ? h.days_active.filter((d) => Number.isInteger(d))
      : [],
    breaking: h?.subtype === 'break_habit',
    archived: h?.archived === true,
    start_date: dayOf(h?.start_date),
    end_date: dayOf(h?.end_date),
    minutes: minutesOf(h),
    quiet_until: dayOf(h?.quiet_until ?? h?.views?.[QUIET_FIELD]),
  };
}

/** The habits with a day still planned on a date, by id. */
export function plannedOn(plans, day) {
  const out = new Set();
  for (const p of plans || []) {
    if (dayOf(p?.planned_date) !== day) continue;
    // a plan with no status is one just made; kept, missed and rescheduled are settled
    if (p.status && p.status !== 'planned') continue;
    out.add(p.habit_id);
  }
  return out;
}

/**
 * Whether a check in can ask about a habit today.
 * @param {object} habit the habit's row
 * @param {{today: string, planned: Set<string>, doneToday: Set<string>}} on
 */
export function checkInOpen(habit, { today, planned, doneToday }) {
  const h = habitShape(habit);
  if (!h.id || h.archived || h.breaking || h.cadence === 'daily') return false;
  if (h.start_date && h.start_date > today) return false;
  if (h.end_date && h.end_date < today) return false;
  if (h.quiet_until && h.quiet_until >= today) return false;
  if (doneToday.has(h.id)) return false;
  return planned.has(h.id);
}

/**
 * The habit a morning checks in on: one a morning, the longest of those
 * planned for today, then by name. Null when there is none.
 * @param {{today: string, habits: object[], plans: object[], doneToday: Iterable<string>}} p
 * @returns {{id: string, title: string, minutes: number}|null}
 */
export function habitToCheckIn({ today, habits, plans, doneToday }) {
  const planned = plannedOn(plans, today);
  const done = new Set(doneToday || []);
  const open = (habits || [])
    .filter((h) => checkInOpen(h, { today, planned, doneToday: done }))
    .map(habitShape)
    .sort(
      (a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    );
  return open.length ? { id: open[0].id, title: open[0].title, minutes: open[0].minutes } : null;
}

/** The week a day is in: the seven days that end on their weekly day. */
export function weekAround(today, weeklyDay) {
  const w = summaryWeekOf(today, weeklyDay);
  return { first: w.start, last: w.end };
}

/** The days left in their week after a day: none on the weekly day, which ends it. */
export function daysLeft(today, weeklyDay) {
  const { last } = weekAround(today, weeklyDay);
  return today < last ? spanDays(addDays(today, 1), last) : [];
}

/**
 * The room left on each of some days, in minutes.
 * @param {object} p
 * @param {string[]} p.days
 * @param {{normal_day: number, busy_day: number, weekend_day: number}} p.hours the
 *   free hours the week is planned with (weekBoard.js hoursFor)
 * @param {number[]} p.daysOff
 * @param {string[]} p.busyDays
 * @param {object[]} p.todos open todos, each with its due_day
 * @param {object[]} p.habits
 * @param {object[]} p.plans habit_plans rows
 * @returns {Map<string, number>}
 */
export function roomLeft({ days, hours, daysOff, busyDays, todos, habits, plans }) {
  const minutes = new Map((habits || []).map((h) => [h.id, minutesOf(h)]));
  const out = new Map();
  for (const day of days || []) {
    const kind = dayKind(day, { daysOff, busyDays });
    let left = Math.round((hours?.[kind] ?? 0) * 60);
    for (const t of todos || []) {
      if (t.archived || t.completed_at) continue;
      if (dayOf(t.due_day) === day) left -= minutesOf(t);
    }
    for (const id of plannedOn(plans, day)) if (minutes.has(id)) left -= minutes.get(id);
    out.set(day, left);
  }
  return out;
}

/**
 * The day a habit planned for today can move to, or null when no day left in
 * their week can take it. With two days the same, the sooner.
 * @param {object} p
 * @param {object} p.habit the habit's row
 * @param {string[]} p.days the days left in their week (daysLeft)
 * @param {object[]} p.plans habit_plans rows
 * @param {Map<string, number>} p.room the room left on each of those days (roomLeft)
 */
export function moveDayFor({ habit, days, plans, room }) {
  const h = habitShape(habit);
  const taken = new Set(
    (plans || []).filter((p) => p.habit_id === h.id).map((p) => dayOf(p.planned_date)),
  );
  let best = null;
  for (const day of habitOpenDays(h, days || [])) {
    if (taken.has(day)) continue;
    const left = room.get(day);
    if (!Number.isFinite(left) || left < h.minutes) continue;
    if (best === null || left > room.get(best)) best = day;
  }
  return best;
}

/**
 * The days several habits planned for today can move to, each given its day
 * in turn with the room the ones before it took counted as gone, so two
 * habits are never both sent to a day that only one of them fits in. A habit
 * with nowhere to go is left out.
 * @param {object} p
 * @param {object[]} p.habits the habits' rows, in the order they are shown
 * @param {string[]} p.days the days left in their week (daysLeft)
 * @param {object[]} p.plans habit_plans rows
 * @param {Map<string, number>} p.room the room left on each of those days (roomLeft)
 * @returns {Map<string, string>} habit id to day
 */
export function moveDaysFor({ habits, days, plans, room }) {
  const left = new Map(room);
  const out = new Map();
  for (const habit of habits || []) {
    const day = moveDayFor({ habit, days, plans, room: left });
    if (!day) continue;
    out.set(habit.id, day);
    left.set(day, left.get(day) - habitShape(habit).minutes);
  }
  return out;
}
