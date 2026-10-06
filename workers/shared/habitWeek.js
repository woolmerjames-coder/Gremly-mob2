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
 *
 * A habit's week is their own: the seven days that end on their weekly day
 * (weekAround). Every count toward a weekly target is made in it, by the
 * rules here (dayOfWeek, weeklyTarget, behindInWeek), so the app and the
 * workers never count a different week.
 *
 * A habit can be paused for a stretch of days, or given a lighter version for
 * one (the habit_adaptations table: mode pause or floor, period_start to
 * period_end, floor_note). Paused, it is left alone: not on for those days,
 * never asked about, never behind. A lighter version changes nothing about
 * when it is on or what counts; it is what Gremly and the check in speak of.
 * The rules for both are here too (easeOf, easeOn, pausedOn, easePlan).
 */

import {
  addDays,
  dayKind,
  daysBetween,
  isDay,
  minutesOf,
  spanDays,
  summaryWeekOf,
} from './week.js';
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
export function checkInOpen(habit, { today, planned, doneToday, eases }) {
  const h = habitShape(habit);
  if (!h.id || h.archived || h.breaking || h.cadence === 'daily') return false;
  if (h.start_date && h.start_date > today) return false;
  if (h.end_date && h.end_date < today) return false;
  if (h.quiet_until && h.quiet_until >= today) return false;
  if (pausedOn(eases, h.id, today)) return false;
  if (doneToday.has(h.id)) return false;
  return planned.has(h.id);
}

/**
 * The habit a morning checks in on: one a morning, the longest of those
 * planned for today, then by name. Null when there is none.
 * @param {{today: string, habits: object[], plans: object[], doneToday: Iterable<string>, eases?: object[]}} p
 *   eases: their habit_adaptations rows; a habit paused today is not asked about
 * @returns {{id: string, title: string, minutes: number}|null}
 */
export function habitToCheckIn({ today, habits, plans, doneToday, eases }) {
  const planned = plannedOn(plans, today);
  const done = new Set(doneToday || []);
  const open = (habits || [])
    .filter((h) => checkInOpen(h, { today, planned, doneToday: done, eases }))
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

/** How far into their week a day is: 1 on its first day, 7 on their weekly day. */
export function dayOfWeek(today, weeklyDay) {
  return daysBetween(weekAround(today, weeklyDay).first, today) + 1;
}

/**
 * The weekly target of a habit they are building, or null when it has none:
 * a daily or monthly habit, or one they are breaking.
 */
export function weeklyTarget(habit) {
  if (!habit || habit.subtype === 'break_habit') return null;
  if ((habit.cadence || 'daily') !== 'weekly') return null;
  const t =
    habit.target_per_period ??
    (Array.isArray(habit.days_active) && habit.days_active.length ? habit.days_active.length : 1);
  return t > 0 ? t : null;
}

/** How many should be done by a day of the week for the week to stay on pace. */
export function paceFloor(target, daysGone) {
  return Math.floor((target * daysGone) / 7);
}

/**
 * Whether a weekly habit is behind in their week on a day: what is done so far
 * is under its target pro rata for the days gone, today counted as gone. So
 * with three days gone 0 of 3 is behind (floor(9/7) = 1) and 0 of 2 is not. A
 * day it was paused on does not count as gone, and it is never behind on a
 * day it is paused.
 * @param {object} p
 * @param {object} p.habit the habit's row
 * @param {number} p.done how many are done in their week so far
 * @param {string} p.today
 * @param {number} p.weeklyDay
 * @param {object[]} [p.eases] their habit_adaptations rows
 */
export function behindInWeek({ habit, done, today, weeklyDay, eases }) {
  if (!habit || habit.archived) return false;
  const target = weeklyTarget(habit);
  if (target === null) return false;
  if (pausedOn(eases, habit.id, today)) return false;
  const gone = unpaused(eases, habit.id, spanDays(weekAround(today, weeklyDay).first, today));
  return done < paceFloor(target, gone.length);
}

// ── A pause, or a lighter version ───────────────────────────────────────────

/** The longest a pause or a lighter version made in the app runs, counted from today. */
export const EASE_MAX_DAYS = 28;
/** A lighter version is said in a few words */
export const EASE_NOTE_MAX = 200;
/** What a habit can be given for a stretch: usual takes either of the others away. */
export const EASE_MODES = ['pause', 'lighter', 'usual'];

/**
 * A lighter version's few words, tidied the way they are kept. Tidying it
 * twice gives the same words, so a note read back compares equal to itself.
 */
export function easeNote(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, EASE_NOTE_MAX).trim() : '';
}
const NOTE = easeNote;

/**
 * A habit_adaptations row as these rules read it, or null when it is neither
 * a pause nor a lighter version (the table also takes a mode that changes
 * nothing). The table calls a lighter version floor.
 * @returns {{id: string|null, habit_id: string, mode: 'pause'|'lighter', first: string, last: string, note: string}|null}
 */
export function easeOf(row) {
  const mode = row?.mode === 'pause' ? 'pause' : row?.mode === 'floor' ? 'lighter' : null;
  const first = dayOf(row?.period_start);
  const last = dayOf(row?.period_end);
  if (!mode || !row.habit_id || !first || !last || last < first) return null;
  return {
    id: row.id ?? null,
    habit_id: row.habit_id,
    mode,
    first,
    last,
    note: mode === 'lighter' ? NOTE(row.floor_note) : '',
  };
}

/** A pause or lighter version (as easeOf gives it) as a row, for the rules that read rows. */
export function rowOfEase(e) {
  return {
    id: e.id ?? null,
    habit_id: e.habit_id,
    mode: e.mode === 'pause' ? 'pause' : 'floor',
    period_start: e.first,
    period_end: e.last,
    floor_note: e.note || null,
  };
}

/** The pause or lighter version a habit is under on a day, or null. */
export function easeOn(rows, habitId, day) {
  for (const r of rows || []) {
    if (r?.habit_id !== habitId) continue;
    const e = easeOf(r);
    if (e && e.first <= day && day <= e.last) return e;
  }
  return null;
}

/** Whether a habit is paused on a day. */
export function pausedOn(rows, habitId, day) {
  return easeOn(rows, habitId, day)?.mode === 'pause';
}

/** Of some days, the ones a habit is not paused on. */
export function unpaused(rows, habitId, days) {
  const spans = pauseSpans(rows, habitId);
  if (!spans.length) return days;
  return days.filter((d) => !spans.some((s) => s.first <= d && d <= s.last));
}

/** The stretches a habit is paused for, as {first, last}, for the board's rules (weekBoard.js habitOpenDays). */
export function pauseSpans(rows, habitId) {
  const out = [];
  for (const r of rows || []) {
    if (r?.habit_id !== habitId) continue;
    const e = easeOf(r);
    if (e?.mode === 'pause') out.push({ first: e.first, last: e.last });
  }
  return out;
}

/**
 * The one pause or lighter version that holds a habit over every one of some
 * days, or null: what the week's board shows as on for the days it plans.
 */
export function easeOver(rows, habitId, days) {
  if (!days?.length) return null;
  const first = easeOn(rows, habitId, days[0]);
  if (!first) return null;
  return days.every((d) => first.first <= d && d <= first.last) ? first : null;
}

/** Every pause and lighter version still to run on a day or after it, soonest first. */
export function easesFrom(rows, day) {
  return (rows || [])
    .map(easeOf)
    .filter((e) => e && e.last >= day)
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}

/**
 * What it takes to give a habit a pause, a lighter version or its usual self
 * over a stretch of days. No two stretches of one habit may overlap, so what
 * is already there gives way: a row inside the stretch goes, one that reaches
 * into it is shortened, and one that runs across it is cut in two.
 *
 * A pause, or a lighter version with the same words, joins what is already
 * there of its own kind: rows of that kind that overlap the stretch or touch
 * it become one row with it, so one unbroken pause is always one row. And
 * when a row of that kind already holds every one of the days there is
 * nothing to do.
 *
 * The steps are safe in this order and no other: every remove, then every
 * shorten, then every add. Taking it back is the reverse: take away what was
 * added, give the shortened rows their days back, put back what was removed.
 *
 * @param {object[]} rows the habit's habit_adaptations rows as they stand, of any mode
 * @param {{mode: 'pause'|'lighter'|'usual', first: string, last: string, note?: string}} to
 * @returns {{remove: object[], shorten: {row: object, period_start: string, period_end: string}[], add: {mode: string, period_start: string, period_end: string, floor_note: string|null, source_ref: string|null}[], same: boolean}}
 *   same: it already is that way, and nothing needs doing
 */
export function easePlan(rows, { mode, first, last, note }) {
  const remove = [];
  const shorten = [];
  const add = [];
  const dbMode = mode === 'pause' ? 'pause' : mode === 'lighter' ? 'floor' : null;
  const text = mode === 'lighter' ? NOTE(note) || null : null;
  const live = (rows || []).filter((r) => dayOf(r?.period_start) && dayOf(r?.period_end));
  const sameKind = (r) => !!dbMode && r.mode === dbMode && (NOTE(r.floor_note) || null) === text;
  if (dbMode) {
    if (
      live.some((r) => sameKind(r) && dayOf(r.period_start) <= first && dayOf(r.period_end) >= last)
    )
      return { remove, shorten, add, same: true };
  }
  // the stretch, widened over every row of its own kind it overlaps or touches
  let lo = first;
  let hi = last;
  const joined = new Set();
  for (let grew = !!dbMode; grew; ) {
    grew = false;
    for (const r of live) {
      if (joined.has(r) || !sameKind(r)) continue;
      const a = dayOf(r.period_start);
      const b = dayOf(r.period_end);
      if (a > addDays(hi, 1) || b < addDays(lo, -1)) continue;
      joined.add(r);
      if (a < lo) lo = a;
      if (b > hi) hi = b;
      grew = true;
    }
  }
  const over = live.filter(
    (r) => !joined.has(r) && dayOf(r.period_start) <= last && dayOf(r.period_end) >= first,
  );
  if (!dbMode && !over.length) return { remove, shorten, add, same: true };
  remove.push(...joined);
  for (const r of over) {
    const a = dayOf(r.period_start);
    const b = dayOf(r.period_end);
    if (a >= first && b <= last) {
      remove.push(r);
      continue;
    }
    if (a < first) {
      shorten.push({ row: r, period_start: a, period_end: addDays(first, -1) });
      // it ran across the stretch: what is left of it after the stretch is a row of its own
      if (b > last) {
        add.push({
          mode: r.mode,
          period_start: addDays(last, 1),
          period_end: b,
          floor_note: r.floor_note ?? null,
          source_ref: r.source_ref ?? null,
        });
      }
      continue;
    }
    shorten.push({ row: r, period_start: addDays(last, 1), period_end: b });
  }
  if (dbMode) {
    add.push({
      mode: dbMode,
      period_start: lo,
      period_end: hi,
      floor_note: text,
      source_ref: null,
    });
  }
  return { remove, shorten, add, same: false };
}

/**
 * A person's rows as they would stand once a habit is given a pause, a lighter
 * version or its usual self over a stretch: easePlan carried out on a copy,
 * for what shows a choice before it is saved (the week's board). A row that
 * would be new has no id yet.
 * @param {object[]} rows their habit_adaptations rows, of any habit
 * @param {string} habitId
 * @param {{mode: 'pause'|'lighter'|'usual', first: string, last: string, note?: string}} to
 */
export function easeApplied(rows, habitId, to) {
  const all = rows || [];
  const plan = easePlan(
    all.filter((r) => r?.habit_id === habitId),
    to,
  );
  if (plan.same) return all;
  const gone = new Set(plan.remove);
  const cut = new Map(plan.shorten.map((s) => [s.row, s]));
  const out = [];
  for (const r of all) {
    if (gone.has(r)) continue;
    const c = cut.get(r);
    out.push(c ? { ...r, period_start: c.period_start, period_end: c.period_end } : r);
  }
  for (const a of plan.add) out.push({ id: null, habit_id: habitId, ...a });
  return out;
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
  const load = loadOn({ days, todos, habits, plans });
  const out = new Map();
  for (const day of days || []) {
    const kind = dayKind(day, { daysOff, busyDays });
    out.set(day, Math.round((hours?.[kind] ?? 0) * 60) - load.get(day));
  }
  return out;
}

/**
 * How full each of some days already is, in minutes: the open todos due on
 * it and the habits planned on it. A todo with no length counts as the
 * board's default.
 * @param {object} p
 * @param {string[]} p.days
 * @param {object[]} p.todos open todos, each with its due_day
 * @param {object[]} p.habits
 * @param {object[]} p.plans habit_plans rows
 * @returns {Map<string, number>}
 */
export function loadOn({ days, todos, habits, plans }) {
  const minutes = new Map((habits || []).map((h) => [h.id, minutesOf(h)]));
  const out = new Map();
  for (const day of days || []) {
    let load = 0;
    for (const t of todos || []) {
      if (t.archived || t.completed_at) continue;
      if (dayOf(t.due_day) === day) load += minutesOf(t);
    }
    for (const id of plannedOn(plans, day)) if (minutes.has(id)) load += minutes.get(id);
    out.set(day, load);
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
export function moveDayFor({ habit, days, plans, room, eases }) {
  const h = habitShape(habit);
  const taken = new Set(
    (plans || []).filter((p) => p.habit_id === h.id).map((p) => dayOf(p.planned_date)),
  );
  let best = null;
  // never onto a day it is paused on
  for (const day of unpaused(eases, h.id, habitOpenDays(h, days || []))) {
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
 * @param {object[]} [p.eases] their habit_adaptations rows: a paused day is never one to move to
 * @returns {Map<string, string>} habit id to day
 */
export function moveDaysFor({ habits, days, plans, room, eases }) {
  const left = new Map(room);
  const out = new Map();
  for (const habit of habits || []) {
    const day = moveDayFor({ habit, days, plans, room: left, eases });
    if (!day) continue;
    out.set(habit.id, day);
    left.set(day, left.get(day) - habitShape(habit).minutes);
  }
  return out;
}
