/**
 * The week board's rules, shared by the worker that spreads a week
 * (workers/inngest-jobs/week/spread.js) and the app's board (lib/week/board).
 * Pure: no clock and no I/O. Like week.js, everything here is decided by
 * dates, ids and numbers alone, never by anyone's words.
 *
 * A review plans some days (first to last, none before today). Against them
 * every open todo is in one of four spots:
 *
 * - fixed: its saved day is one of the days being planned. It stays there.
 * - own: its saved day is today or later and outside those days (today's own
 *   plan when next week is brought forward, or a day in a week further out).
 *   It is not on the board at all.
 * - later: no day of its own to come, and a day ahead it comes back on.
 * - free: no day, or a day that has gone by, and no day to come back on.
 *   These are the ones a review places or puts off.
 *
 * Every Later has a back day. The days one can come back on are the days
 * after the ones being planned, up to LATER_MAX_DAYS from today, and no day
 * takes more than its share of returns (returnsCap).
 *
 * A day they gave a todo themselves is theirs: Gremly plans around it and
 * never moves it. A fixed todo is given back to Gremly to place only when its
 * day is released (released): it is where Gremly's own last spread of this
 * week put it, or they said to rearrange, or they freed that one.
 */

import { DAY_KINDS, LATER_MAX_DAYS, addDays, isDay, normHours, weekdayOf } from './week.js';

/** Free hours for each kind of day when they have set none and Gremly has guessed none. */
export const FALLBACK_HOURS = { normal_day: 2, busy_day: 1, weekend_day: 4 };

/** A day takes at least this many returns before it counts as full. */
export const RETURNS_A_DAY_MIN = 3;

/**
 * From this many of their own todos on the days being planned, the board asks
 * once what to do with them: keep their days, keep some, or rearrange it all.
 * With fewer they are kept without asking.
 */
export const KEEP_ASK_FROM = 6;

const asList = (v) => (Array.isArray(v) ? v : []);

/**
 * The free hours a week is planned with, for each kind of day: what they set
 * in the review, else Gremly's guess in the read, else FALLBACK_HOURS.
 * @param {{hours?: object}|null} answers the review's answers
 * @param {{free_hours_guess?: object}|null} read the weekly read
 * @returns {{normal_day: number, busy_day: number, weekend_day: number}}
 */
export function hoursFor(answers, read) {
  const out = {};
  for (const k of DAY_KINDS) {
    out[k] =
      normHours(answers?.hours?.[k]) ?? normHours(read?.free_hours_guess?.[k]) ?? FALLBACK_HOURS[k];
  }
  return out;
}

/**
 * The busy days a week is planned with, among the days being planned: the
 * ones they settled in the review, else the ones Gremly read as heavy.
 * @param {string[]} days the days being planned
 */
export function busyFor(answers, read, days) {
  const list = Array.isArray(answers?.busy_days) ? answers.busy_days : asList(read?.busy_days);
  return [...new Set(list.filter((d) => isDay(d) && days.includes(d)))].sort();
}

/**
 * Whether the day a todo is on is where Gremly's last spread of this week put
 * it, and it has not moved since. What that spread placed is kept on the week
 * when its board is saved (answers.planned.gremly, todo id to day). Anything
 * else on a day is theirs.
 * @param {{id?: string, due_day?: string|null}} t
 * @param {{planned?: {gremly?: object}}|null} answers the review's answers
 */
export function gremlyPut(t, answers) {
  const put = answers?.planned?.gremly;
  return !!t && isDay(t.due_day) && !!put && typeof put === 'object' && put[t.id] === t.due_day;
}

/**
 * Whether a todo's own day, on the days being planned, is Gremly's to plan
 * again. Their own days are theirs, so this is true only when the day was
 * Gremly's to begin with (gremlyPut), when they said to rearrange it all
 * (keep 'none'), or when they freed that todo (keep 'some', freed). A todo
 * with a time of day is an appointment, and nothing frees it: not their
 * saying rearrange, and not Gremly having put it on that day before they
 * gave it its time.
 * @param {{id?: string, due_day?: string|null, timed?: boolean}} t
 * @param {{keep?: string, freed?: string[], planned?: object}|null} answers
 */
export function released(t, answers) {
  if (!t || !isDay(t.due_day)) return false;
  if (t.timed) return false;
  if (gremlyPut(t, answers)) return true;
  if (answers?.keep === 'none') return true;
  return answers?.keep === 'some' && asList(answers.freed).includes(t.id);
}

/**
 * What the suggestions for their over-full days were made from, as one line:
 * the day they were made on, the days being planned, the free hours, the busy
 * days, the todos their priorities cover, what they said of their own days
 * (keep them, or which they freed, or rearrange it all), their intention,
 * what they told Gremly about his read of the week, what they decided about
 * the things that were stuck, and how many times a change to their items was
 * saved during the review (answers.touched, which the app counts up).
 * Suggestions whose line is no longer the review's were made for other
 * answers, or for items that have since changed.
 *
 * Only what was settled on a card is here. What they type to Gremly along
 * the way reaches the next spread that is made, and does not ask for one.
 * @param {string[]} days the days being planned
 * @param {string} today
 */
export function reliefBasis(answers, read, days, today) {
  return JSON.stringify(basisParts(answers, read, days, today));
}

const words = (v) => (typeof v === 'string' ? v.trim() : '');

function basisParts(answers, read, days, today) {
  const hours = hoursFor(answers, read);
  const picked = asList(answers?.priorities)
    .flatMap((p) => asList(p?.item_ids))
    .filter((id) => typeof id === 'string');
  const freed =
    answers?.keep === 'some'
      ? [...new Set(asList(answers.freed).filter((id) => typeof id === 'string'))].sort()
      : [];
  // keeping some and freeing none is keeping them all
  const keep = answers?.keep === 'none' ? 'none' : freed.length ? 'some' : 'all';
  const decided = asList(answers?.needs_you)
    .filter((n) => n && typeof n.title === 'string' && n.decision)
    .map((n) => [n.title, String(n.decision)]);
  return [
    isDay(today) ? today : null,
    days[0] || null,
    days[days.length - 1] || null,
    DAY_KINDS.map((k) => hours[k]),
    busyFor(answers, read, days),
    [...new Set(picked)].sort(),
    keep,
    freed,
    words(answers?.intention),
    words(answers?.challenge?.note),
    decided,
    Number.isInteger(answers?.touched) ? answers.touched : 0,
  ];
}

/**
 * What a spread was made from, as one line: everything the suggestions for
 * their over-full days were made from (reliefBasis), and the over-full days
 * they have since changed, by taking a suggestion or by hand. A spread whose
 * line is no longer the review's was made for other answers, and is made
 * again, around what they moved. Where else they move things on the board is
 * not part of it: their own moves stand over any spread.
 * @param {string[]} days the days being planned
 * @param {string} today
 */
export function spreadBasis(answers, read, days, today) {
  const relieved =
    answers?.relieved && typeof answers.relieved === 'object' ? answers.relieved : {};
  const changed = Object.keys(relieved)
    .filter((d) => relieved[d] === 'moved' || relieved[d] === 'changed')
    .sort();
  return JSON.stringify([...basisParts(answers, read, days, today), changed]);
}

/**
 * Where a todo is, against the days being planned.
 * @param {{due_day?: string|null, back_on?: string|null}} t days as YYYY-MM-DD
 * @param {{today: string, first: string, last: string}} span
 * @returns {{spot: 'fixed'|'own'|'later'|'free', day?: string, back_on?: string}}
 */
export function todoSpot(t, { today, first, last }) {
  const day = isDay(t?.due_day) ? t.due_day : null;
  const back = isDay(t?.back_on) ? t.back_on : null;
  if (day && day >= today) {
    return day >= first && day <= last ? { spot: 'fixed', day } : { spot: 'own', day };
  }
  if (back && back > today) return { spot: 'later', back_on: back };
  return { spot: 'free' };
}

/**
 * The days a Later can come back on: after the days being planned, and no
 * further than LATER_MAX_DAYS from today.
 * @returns {string[]} in order; empty when the days being planned reach that far
 */
export function backDays(today, last) {
  if (!isDay(today) || !isDay(last)) return [];
  const until = addDays(today, LATER_MAX_DAYS);
  const days = [];
  let d = addDays(last > today ? last : today, 1);
  while (d <= until && days.length < LATER_MAX_DAYS) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

/**
 * The most returns one day takes: an even share and one more, and never
 * fewer than RETURNS_A_DAY_MIN, so a short list is not scattered for nothing.
 * @param {number} total how many todos are coming back in all
 * @param {number} days how many days they can come back on
 */
export function returnsCap(total, days) {
  if (!(days > 0)) return RETURNS_A_DAY_MIN;
  return Math.max(RETURNS_A_DAY_MIN, Math.ceil(Math.max(0, total) / days) + 1);
}

/**
 * Give each todo a day to come back on. One that asks for a day it can come
 * back on gets it while that day has room. Otherwise it gets the nearest day
 * with room to the one it asked for, a later day before an earlier one; one
 * that asked for none gets the day with the fewest returns, the earliest of
 * those. When every day is full, the fewest again, so nothing is left without
 * a day.
 *
 * One with a hard date ahead (by) comes back on that date or before it
 * whenever a day that early is open to come back on: among those days only,
 * and over a full day rather than past its date.
 * @param {{id: string, back_on?: string|null, by?: string|null}[]} list in the order they are given days
 * @param {{days: string[], load?: Map<string, number>|[string, number][], cap: number}} p
 *   days they can come back on (backDays); load is how many returns each day
 *   already has
 * @returns {Map<string, string>} id to back day; empty when there are no days
 */
export function spreadReturns(list, { days, load, cap }) {
  const out = new Map();
  if (!Array.isArray(days) || !days.length) return out;
  const count = new Map(load || []);
  const n = (d) => count.get(d) || 0;
  const take = (id, d) => {
    out.set(id, d);
    count.set(d, n(d) + 1);
  };
  const fewest = (open) => open.reduce((best, d) => (n(d) < n(best) ? d : best), open[0]);
  // the days one can come back on: up to its hard date, when any are that early
  const openTo = (x) => {
    if (!isDay(x.by)) return days;
    const before = days.filter((d) => d <= x.by);
    return before.length ? before : days;
  };

  const rest = [];
  for (const x of list || []) {
    if (!x?.id || out.has(x.id)) continue;
    if (openTo(x).includes(x.back_on) && n(x.back_on) < cap) take(x.id, x.back_on);
    else rest.push(x);
  }
  for (const x of rest) {
    const open = openTo(x);
    let pick = null;
    if (isDay(x.back_on)) {
      // where the day asked for falls among the days it can come back on
      let at = open.indexOf(x.back_on);
      if (at < 0) {
        at = open.findIndex((d) => d > x.back_on);
        if (at < 0) at = open.length - 1;
      }
      for (let step = 0; step < open.length && !pick; step++) {
        for (const i of step ? [at + step, at - step] : [at]) {
          if (i >= 0 && i < open.length && n(open[i]) < cap) {
            pick = open[i];
            break;
          }
        }
      }
    }
    take(x.id, pick || fewest(open));
  }
  return out;
}

/**
 * The days among those planned that a habit runs on at all: inside its start
 * and end, and for a daily habit kept to set weekdays, only those.
 * @param {{cadence?: string, days_active?: number[], start_date?: string|null, end_date?: string|null}} h
 * @param {string[]} days
 */
export function habitOpenDays(h, days) {
  const live = days.filter(
    (d) => (!h.start_date || h.start_date <= d) && (!h.end_date || h.end_date >= d),
  );
  if (h.cadence !== 'daily' || !h.days_active?.length) return live;
  return live.filter((d) => h.days_active.includes(weekdayOf(d)));
}

/**
 * How many of the days being planned a habit can be put on: never more than
 * they aim for, and none for a habit they are breaking.
 * @param {{cadence?: string, target?: number|null, breaking?: boolean}} h
 */
export function habitAllowance(h, days) {
  if (!h || h.breaking) return 0;
  const open = habitOpenDays(h, days).length;
  return h.cadence === 'daily' ? open : Math.min(h.target || 1, open);
}
