/**
 * The week spread: which of their open todos go on which day of the week
 * being planned, and when each of the rest comes back.
 *
 * One model call (weekSpread in the models table, at low effort). It is given
 * what the read was given (renderRead) and what they answered in the review:
 * their priorities, their intention, the hours they have free on each kind of
 * day, their busy days, the days each habit is on, and what is already on a
 * day. The model chooses which todo goes where. Code works out each day's
 * room before, and checks every id, day and number after: nothing they placed
 * themselves is moved, no day is over its room, and everything that is not on
 * a day has a day it comes back on (checkSpread).
 *
 * A day they gave a todo themselves is theirs, and the spread plans around
 * it. A todo already on a day is spread again only when that day is released
 * (workers/shared/weekBoard.js released): it was Gremly's own placement the
 * last time this week was planned, or they said to rearrange, or they freed
 * that one. It is then one of the todos to spread like any other: on a day
 * when the model places it, and waiting in Later, with a day to come back,
 * when the model leaves it out. Nothing of that is saved until they finish
 * the board.
 *
 *   gatherRead (reads)  →  spreadFrame, renderSpread (pure)  →  the model  →  checkSpread (pure)
 *
 * It is the same split as the plan pick and placePlan: the model picks, code
 * fits. The prompt is semantic rules only. Nothing here reads the person's
 * words: code handles ids, dates and numbers, and the meaning is the model's.
 */

import { weekdayName } from '../context/db';
import { jsonCall, modelFor } from '../context/llm';
import { noDashes } from '../brief/writer';
import { habitAllowance, renderRead, theirDays, todosToList } from './read';
import { EASE_MODES } from '../../shared/habitWeek.js';
import { DAY_KINDS, dayKind, isDay, minutesOf, spanDays } from '../../shared/week.js';
import {
  backDays,
  busyFor,
  hoursFor,
  released,
  reliefBasis,
  returnsCap,
  spreadBasis,
  spreadReturns,
  todoSpot,
} from '../../shared/weekBoard.js';
import { normDay } from '../../shared/changes/check.js';

export const WEEK_SPREAD_VERSION = 'week-spread-2026-10-07a';

/** A day's note to them is this long at most. */
const NOTE_MAX = 120;
/** What they said during the review reaches the spread up to this many lines. */
const SAID_MAX = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asList = (v) => (Array.isArray(v) ? v : []);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const KIND_WORDS = { normal_day: 'a normal day', busy_day: 'a busy day', weekend_day: 'a day off' };

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
}

// ── What the spread is made from ────────────────────────────────────────────

/**
 * Their own moves on the board, as the app sent them: none of it is saved
 * until they finish, so it rides with the request. Anything that is not an id
 * with a real day is left out. habit_ease is what they chose for a habit over
 * the days being planned: pause, lighter, or usual (which ends what is saved).
 * @returns {{placed: Map<string, string>, later: Map<string, string>, habit_days: Map<string, string[]>, habit_ease: Map<string, string>}}
 */
export function readBoard(board) {
  const b = board && typeof board === 'object' ? board : {};
  const placed = new Map();
  for (const p of asList(b.placed).slice(0, 400)) {
    if (UUID.test(p?.id) && isDay(p.day)) placed.set(p.id, p.day);
  }
  const later = new Map();
  for (const p of asList(b.later).slice(0, 400)) {
    if (UUID.test(p?.id) && isDay(p.back_on) && !placed.has(p.id)) later.set(p.id, p.back_on);
  }
  const habitDays = new Map();
  for (const h of asList(b.habit_days).slice(0, 80)) {
    if (UUID.test(h?.id)) habitDays.set(h.id, [...new Set(asList(h.days).filter(isDay))].sort());
  }
  const habitEase = new Map();
  for (const h of asList(b.habit_ease).slice(0, 80)) {
    if (UUID.test(h?.id) && EASE_MODES.includes(h.mode)) habitEase.set(h.id, h.mode);
  }
  return { placed, later, habit_days: habitDays, habit_ease: habitEase };
}

/**
 * Everything the spread works from, settled by dates and numbers: the days,
 * the hours and busy days, each habit's days, where every open todo already
 * is, and so the room each day has left for what Gremly places.
 *
 * A habit's days are the ones they chose on the board, else the ones saved
 * for these days, else the ones Gremly suggested in the read. A suggestion
 * is never on more days than they aim for, and only on a day with room for
 * the habit beside what is theirs, so no day is over its room because of
 * something Gremly suggested.
 *
 * @param {object} g what gatherRead read
 * @param {{read?: object, answers?: object}|null} row the week's review
 * @param {object} [board] their own moves on the board (readBoard)
 */
export function spreadFrame(g, row, board) {
  const today = g.today;
  const days = spanDays(g.first, g.last).filter((d) => d >= today);
  const first = days[0] || g.first;
  const span = { today, first, last: g.last };
  const a = row?.answers && typeof row.answers === 'object' ? row.answers : {};
  const read = row?.read && typeof row.read === 'object' ? row.read : {};
  const mine = readBoard(board);
  const hours = hoursFor(a, read);
  const busy = busyFor(a, read, days);

  // where every open todo already is
  const priorityIds = new Set(
    asList(a.priorities)
      .flatMap((p) => asList(p?.item_ids))
      .filter((id) => typeof id === 'string'),
  );
  const fixed = new Map();
  const later = new Map();
  const free = [];
  // released from a day of the week: the day each is on now
  const home = new Map();
  // The model can only place a todo it is given, and the read lists so many.
  // One it is not given is not released: it stays fixed where it is.
  const given = new Set(todosToList(g.todos || [], today).map((t) => t.id));
  for (const t of g.todos || []) {
    if (mine.placed.has(t.id) && days.includes(mine.placed.get(t.id))) {
      fixed.set(t.id, mine.placed.get(t.id));
      continue;
    }
    if (mine.later.has(t.id)) {
      later.set(t.id, mine.later.get(t.id));
      continue;
    }
    const s = todoSpot(t, span);
    if (s.spot === 'fixed' && released(t, a) && given.has(t.id)) {
      // Gremly's to place again, like any other todo to spread
      home.set(t.id, s.day);
      free.push(t);
    } else if (s.spot === 'fixed') fixed.set(t.id, s.day);
    else if (s.spot === 'later' && !priorityIds.has(t.id)) later.set(t.id, s.back_on);
    // free, or put off and one of the things they said matter most this week
    else if (s.spot !== 'own') free.push(t);
  }

  // each day's minutes, and what the todos already on it take
  const byId = new Map((g.todos || []).map((t) => [t.id, t]));
  const on = new Map(
    days.map((day) => {
      const kind = dayKind(day, { daysOff: g.days_off, busyDays: busy });
      return [day, { kind, minutes: Math.round(hours[kind] * 60), habits: 0, fixed: 0 }];
    }),
  );
  for (const [id, d] of fixed) on.get(d).fixed += minutesOf(byId.get(id));

  // the habits: the days that are theirs first, then Gremly's suggestions
  const suggested = new Map(asList(read.habit_days).map((h) => [h?.habit_id, asList(h?.days)]));
  const habits = [];
  const unset = [];
  const openOn = new Map();
  for (const habit of g.habits || []) {
    // What they chose for it on the board stands over what is saved, as it
    // does on the board: paused there, it is paused on every one of the days;
    // set to anything else there, a pause saved for these days no longer holds.
    const chosen = mine.habit_ease.get(habit.id);
    const h = !chosen
      ? habit
      : {
          ...habit,
          paused: chosen === 'pause' ? [{ first: days[0], last: days[days.length - 1] }] : [],
        };
    // none for a habit paused over every one of the days (weekBoard.js habitOpenDays)
    const allow = habitAllowance(h, days);
    if (!allow) continue;
    // a day inside a pause is no day of its, whoever chose it and whenever
    const open = (d) =>
      days.includes(d) && !asList(h.paused).some((p) => p.first <= d && d <= p.last);
    const one = { id: h.id, title: h.title, minutes: minutesOf(h), days: [], allow };
    habits.push(one);
    openOn.set(h.id, open);
    const saved = asList(h.planned).filter(open);
    if (mine.habit_days.has(h.id)) {
      one.days = mine.habit_days.get(h.id).filter(open);
    } else if (saved.length) one.days = [...new Set(saved)].sort();
    else {
      unset.push(one);
      continue;
    }
    for (const d of one.days) on.get(d).habits += one.minutes;
  }
  for (const one of unset) {
    const picked = [];
    for (const d of new Set(asList(suggested.get(one.id)))) {
      if (picked.length >= one.allow) break;
      const x = on.get(d);
      if (!x || !openOn.get(one.id)(d) || x.minutes - x.fixed - x.habits < one.minutes) continue;
      x.habits += one.minutes;
      picked.push(d);
    }
    one.days = picked.sort();
  }

  const room = days.map((day) => {
    const x = on.get(day);
    return {
      day,
      kind: x.kind,
      minutes: x.minutes,
      habits: x.habits,
      fixed: x.fixed,
      left: Math.max(0, x.minutes - x.habits - x.fixed),
      // more of their own on it than it has room for, by this much
      over: Math.max(0, x.habits + x.fixed - x.minutes),
    };
  });

  return {
    today,
    days,
    hours,
    busy,
    habits,
    fixed,
    later,
    free,
    home,
    room,
    returns: backDays(today, g.last),
    priorities: asList(a.priorities).filter((p) => p && typeof p.text === 'string'),
    priorityIds,
    intention: typeof a.intention === 'string' ? a.intention.trim() : '',
    said: [
      ...(typeof a.challenge?.note === 'string' && a.challenge.note.trim()
        ? [a.challenge.note.trim()]
        : []),
      ...asList(a.said)
        .map((s) => (typeof s?.text === 'string' ? s.text.trim() : ''))
        .filter(Boolean),
    ].slice(-SAID_MAX),
    decided: asList(a.needs_you).filter((n) => n && typeof n.title === 'string' && n.decision),
    // the answers this was made for (workers/shared/weekBoard.js)
    basis: spreadBasis(a, read, days, today),
    relief_basis: reliefBasis(a, read, days, today),
  };
}

// ── What the model reads ────────────────────────────────────────────────────

export const dayLine = (day) => `${weekdayName(day)} ${day}`;

/**
 * The week as it stands, for a model that plans it: what the read was given,
 * then their answers, the habits on their days, each day's room worked out,
 * and what is already on a day. The spread and the suggestions for over-full
 * days (relief.js) both start from it.
 * @param {string} [onADay] what is said of the todos already on a day
 * @returns {{r: object, refOf: Map<string, string>, refs: (ids: string[]) => string, L: string[]}}
 */
export function renderBoard(g, frame, onADay = 'they stay where they are') {
  // a day counts as one they chose while it is fixed: not once they have freed it
  const chosen = theirDays(g);
  const r = renderRead(g, { theirs: new Set([...chosen].filter((id) => frame.fixed.has(id))) });
  const refOf = new Map([...r.refs.todos].map(([ref, id]) => [id, ref]));
  const habitRef = new Map([...r.refs.habits].map(([ref, h]) => [h.id, ref]));
  const refs = (ids) =>
    ids
      .map((id) => refOf.get(id))
      .filter(Boolean)
      .join(', ');

  const L = [r.text, '', 'THEIR ANSWERS IN THE REVIEW:'];
  if (frame.priorities.length) {
    L.push(
      `What matters most to them this week, in their order: ${frame.priorities
        .map((p, i) => {
          const ids = refs(asList(p.item_ids));
          return `${i + 1}. "${trim(p.text, 120)}"${ids ? ` (todos ${ids})` : ''}`;
        })
        .join('; ')}.`,
    );
  } else L.push('They picked nothing as mattering most this week.');
  L.push(
    frame.intention
      ? `Their intention for the week: "${trim(frame.intention, 200)}"`
      : 'They set no intention.',
  );
  L.push(
    `Free hours for their own things: ${DAY_KINDS.map((k) => `${frame.hours[k]} on ${KIND_WORDS[k]}`).join(', ')}.`,
    frame.busy.length
      ? `Their busy days: ${frame.busy.map(dayLine).join('; ')}.`
      : 'They marked no day as busy.',
  );
  if (frame.said.length) {
    L.push(
      `What they said to Gremly along the way: ${frame.said.map((s) => `"${trim(s, 240)}"`).join('; ')}`,
    );
  }
  if (frame.decided.length) {
    L.push(
      `What they decided about things that were stuck: ${frame.decided
        .map((n) => `"${trim(n.title, 80)}": ${trim(n.decision, 160)}`)
        .join('; ')}`,
    );
  }

  L.push('', 'HABITS, ALREADY ON THEIR DAYS (id | name | length | days):');
  const onDays = frame.habits.filter((h) => h.days.length);
  if (!onDays.length) L.push('(none planned)');
  for (const h of onDays) {
    L.push(
      `${habitRef.get(h.id) || 'habit'} | ${trim(h.title, 70)} | ${plural(h.minutes, 'minute', 'minutes')} | ${h.days.join(', ')}`,
    );
  }

  L.push(
    '',
    "EACH DAY'S ROOM (worked out exactly, in minutes; use these rather than adding up yourself):",
  );
  for (const x of frame.room) {
    L.push(
      `${dayLine(x.day)}, ${KIND_WORDS[x.kind]}: ${x.minutes} free, ${x.habits} taken by habits, ${x.fixed} by todos already on it, so ${
        x.over
          ? `it is over by ${plural(x.over, 'minute', 'minutes')}`
          : `${plural(x.left, 'minute', 'minutes')} of room`
      }.`,
    );
  }

  L.push('', `TODOS ALREADY ON A DAY (${onADay}):`);
  const byDay = frame.days
    .map((day) => {
      const ids = [...frame.fixed].filter(([, d]) => d === day).map(([id]) => id);
      return ids.length ? `${day}: ${refs(ids) || plural(ids.length, 'todo', 'todos')}` : '';
    })
    .filter(Boolean);
  L.push(byDay.length ? byDay.join('; ') : '(none)');
  return { r, refOf, refs, L };
}

/**
 * The spread's input: the week as it stands (renderBoard), then the todos
 * already put off and the todos to spread, each by the short id the read's
 * list gives it.
 * @returns {{text: string, refs: object, listed: string[]}} listed is the ids
 *   of the todos to spread that the model is given (the read lists up to a
 *   limit; the rest are given their days by code)
 */
export function renderSpread(g, frame) {
  const { r, refOf, refs, L } = renderBoard(g, frame);

  const kept = [...frame.later].filter(([id]) => refOf.has(id));
  if (kept.length) {
    L.push(
      '',
      `TODOS ALREADY PUT OFF (each keeps the day it comes back on): ${kept
        .map(([id, back]) => `${refOf.get(id)} back ${back}`)
        .join('; ')}`,
    );
  }

  // in the order of the list above, so each is found where it is looked for
  const place = new Map([...r.refs.todos.values()].map((id, i) => [id, i]));
  const listed = frame.free
    .filter((t) => refOf.has(t.id))
    .sort((a, b) => place.get(a.id) - place.get(b.id));
  L.push('', 'TODOS TO SPREAD (each goes on one day, or to later with the day it comes back):');
  L.push(listed.length ? listed.map((t) => refOf.get(t.id)).join(', ') : '(none)');
  const moved = listed.filter((t) => frame.home.has(t.id));
  if (moved.length) {
    L.push(
      `Of these, ${refs(moved.map((t) => t.id))} ${moved.length === 1 ? 'is' : 'are'} on a day now. ${moved.length === 1 ? 'That day is' : 'Those days are'} no longer fixed: place each afresh, where it fits best this time.`,
    );
  }
  L.push(
    frame.returns.length
      ? `A todo that goes to later can come back on any day from ${frame.returns[0]} to ${frame.returns[frame.returns.length - 1]}.`
      : 'There is no day left for a todo to come back on, so place what fits and leave the rest out.',
  );

  return { text: L.join('\n'), refs: r.refs, listed: listed.map((t) => t.id) };
}

// ── The prompt ──────────────────────────────────────────────────────────────

// Started from the spread prompt tested on 5 October 2026 (the plan's Tested
// prompts). What code now does is taken out of it: the habits are placed on
// the days already chosen, and each day's room is worked out, so the model is
// given the room and places only todos. The health and part week rules are the
// read's.
export function spreadSystem(person) {
  const who = person?.first_name
    ? `Their first name is ${person.first_name}.`
    : 'Their name is not known.';
  return {
    fixed: `You are Gremly, planning one person's week with them. They have answered the weekly review: what matters most to them this week, their intention, the hours they have free on each kind of day, and the days they said are busy. Now spread their open todos across the days being planned.

How to spread:
Each day's room is worked out for you, in minutes: the hours they gave for that kind of day, less the habits planned on it and the todos already on it. The minutes you place on a day must fit inside its room, leaving a little to spare. Count a todo with no length as thirty minutes.
Put what matters most to them first, on days that give it room and before any hard dates. Put a todo with a hard date on the days being planned on that date or before it.
Fill what room is left with quick todos that have hung the longest.
Everything that does not fit waits for later, where every todo has a day it comes back to them. Name one there, with its day, only when the day matters: it should be back before something with a date, or when there is likely to be room for it. The rest need nothing from you: each is given a day to come back on, spread through the coming weeks, so leave them out.
A todo in the list to spread goes on one day at most. Nothing else is placed: the todos already on a day stay where they are, the ones already put off keep their day, and the habits are on the days chosen for them.
Let what they said along the way, and what you know of their week, shape which day a todo goes on.
A day can carry a short note to them when something about that day shaped what you put on it, in a few plain words. Leave the note empty otherwise.

Rules:
Use only facts in the data. Never speak of the data or of what you were given: write as someone who knows them.
Some of what you know is about their health, body or mind. Let it shape the week: their energy, appointments, rest and how much to ask of them. Plan health todos like any others. Write about it only as discreetly as they would want on a screen someone else might glance at. In your own words never name a condition, a treatment or therapy of any kind, a medication, a medical test or a medical speciality, even when one of their own items names it. Read each note once more as a stranger glancing at the screen would: that stranger should not be able to tell what this person's health involves.
The days being planned may be the rest of this week rather than a whole week. Plan only those days, and judge how much fits by how many are left.
Write a note to them as you, warmly and briefly, in plain words. No dashes used as punctuation.
Use ids exactly as given, and only where an id is asked for: never write an id in a note.`,
    varying: who,
  };
}

const text = (description) => ({ type: 'string', description });
const list = (items, description) => ({ type: 'array', items, description });
// every field is asked for: Gemini leaves out what its schema does not require
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties) });
const A_DAY = 'YYYY-MM-DD';

export const SPREAD_SCHEMA = obj({
  days: list(
    obj({
      day: text(`one of the days being planned, as ${A_DAY}`),
      todo_ids: list(
        text('the id of a todo to spread'),
        'the todos you place on this day, what matters most first',
      ),
      note: text('a few plain words to them about what shaped this day, or empty'),
    }),
    'every day being planned, in order',
  ),
  later: list(
    obj({
      todo_id: text('the id of a todo to spread that is on no day'),
      back_on: text(`the day it comes back to them, as ${A_DAY}`),
    }),
    'the todos on no day whose day to come back matters; empty when none does',
  ),
});

// ── What comes back, checked ────────────────────────────────────────────────

/** Gremly's own words, on one line, without dashes, cut to a length. */
function said(v, max) {
  if (typeof v !== 'string') return '';
  const s = noDashes(v.replace(/\s+/g, ' ').trim());
  return s.length > max ? s.slice(0, max).trim() : s;
}

/**
 * The model's spread, put right by dates, ids and numbers alone:
 *
 * - an id it was not given, a todo that was not its to spread, a day that is
 *   not being planned and a todo named twice are dropped (a day stands over a
 *   later for the same todo)
 * - a todo with a hard date on the days being planned is on a day no later
 *   than that date, even when the model put it off or left it out: the
 *   latest such day with room for it, and the date itself when none has
 * - a day over its room gives up what was placed on it last, what matters
 *   most to them after the rest; each goes to the next day with room for it,
 *   and to later when there is none. One with a hard date on the days being
 *   planned never leaves the day of its date. On an earlier day it is the
 *   last to be given up, and then goes to a day up to its date with room,
 *   after that day or before it; when none has room it stays where it was,
 *   over the room
 * - every todo to spread that ends on no day gets a day it comes back on: the
 *   one asked for when it can come back then and the day has room, otherwise
 *   the nearest that does (spreadReturns), and never after a hard date still
 *   ahead when an earlier day is open. The model names only the ones whose
 *   day matters; the rest are spread by the same rule, the oldest first
 * - a day code changed loses its note, which was written for the day as the
 *   model left it
 *
 * @param {object} output what the model returned
 * @param {object} g what gatherRead read
 * @param {object} frame spreadFrame
 * @param {{refs: {todos: Map<string, string>}}} r renderSpread
 * @returns {{place: {id: string, day: string}[], later: {id: string, back_on: string}[],
 *   notes: {day: string, note: string}[], dropped: {what: string, why: string}[],
 *   counts: object}}
 */
export function checkSpread(output, g, frame, r) {
  const dropped = [];
  const drop = (what, why) => dropped.push({ what, why });
  const o = output && typeof output === 'object' ? output : {};
  const byId = new Map((g.todos || []).map((t) => [t.id, t]));
  const mine = new Set(frame.free.map((t) => t.id));
  const idOf = (ref) => r.refs.todos.get(String(ref ?? '').trim());
  const mins = (id) => minutesOf(byId.get(id));
  // what the model placed, in its own order
  const dayOf = new Map();
  const order = new Map(frame.days.map((d) => [d, []]));
  const hardDate = (id) => {
    const d = byId.get(id)?.deadline;
    return isDay(d) ? d : null;
  };
  // A hard date on one of the days being planned holds its todo to the days up
  // to it. One that has gone by holds it to nothing, and one further out only
  // says when it should be back (want, below).
  const dueIn = (id) => {
    const d = hardDate(id);
    return d && order.has(d) ? d : null;
  };
  const left = new Map(frame.room.map((x) => [x.day, x.left]));
  const taken = (day) => order.get(day).reduce((n, id) => n + mins(id), 0);
  const notes = [];
  for (const entry of asList(o.days)) {
    const day = normDay(entry?.day);
    if (!day || !order.has(day)) {
      if (asList(entry?.todo_ids).length) drop('day', 'not_being_planned');
      continue;
    }
    const note = said(entry?.note, NOTE_MAX);
    if (note && !notes.some((n) => n.day === day)) notes.push({ day, note });
    for (const ref of asList(entry?.todo_ids)) {
      const id = idOf(ref);
      if (!id) drop('todo', 'unknown_id');
      else if (!mine.has(id)) drop('todo', 'not_to_spread');
      else if (dayOf.has(id)) drop('todo', 'twice');
      else {
        dayOf.set(id, day);
        order.get(day).push(id);
      }
    }
  }

  // the days code changes below: what the model wrote about one no longer holds
  const changed = new Set();

  // A hard date on the days being planned: on that date at the latest, whether
  // the model placed it after, put it off or left it out. It goes on the
  // latest day up to its date that has room for it, ahead of what the model
  // put there, and on the date itself when none has.
  let late = 0;
  for (const t of frame.free) {
    const by = dueIn(t.id);
    if (!by) continue;
    const day = dayOf.get(t.id);
    if (day && day <= by) continue;
    if (day) {
      const list = order.get(day);
      list.splice(list.indexOf(t.id), 1);
      changed.add(day);
    }
    const fits = frame.days.filter((d) => d <= by && taken(d) + mins(t.id) <= left.get(d));
    const to = fits.length ? fits[fits.length - 1] : by;
    order.get(to).unshift(t.id);
    dayOf.set(t.id, to);
    changed.add(to);
    late += 1;
  }

  // each day inside its room
  const used = new Map();
  const spilled = [];
  for (const day of frame.days) {
    const list = order.get(day);
    let total = taken(day);
    // a todo on the day of its hard date has no later day to go to
    const bound = (id) => {
      const by = dueIn(id);
      return !!by && by <= day;
    };
    while (total > left.get(day)) {
      const movable = list.filter((id) => !bound(id));
      if (!movable.length) break;
      // What is held to a date still ahead has the fewest days to go to, so it
      // is the last to leave; of the rest, what matters most leaves last.
      const loose = movable.filter((id) => !dueIn(id));
      const plain = loose.filter((id) => !frame.priorityIds.has(id));
      const from = plain.length ? plain : loose.length ? loose : movable;
      const out = from[from.length - 1];
      list.splice(list.indexOf(out), 1);
      dayOf.delete(out);
      total -= mins(out);
      spilled.push({ id: out, from: day });
      changed.add(day);
    }
    used.set(day, total);
  }
  // Where each one given up goes. The ones held to a date first, so the room
  // up to their dates is theirs before anything else is moved into it.
  let toLater = 0;
  let heldOver = 0;
  const fitsOn = (id, d) => used.get(d) + mins(id) <= left.get(d);
  const put = (id, day) => {
    dayOf.set(id, day);
    order.get(day).push(id);
    used.set(day, used.get(day) + mins(id));
    changed.add(day);
  };
  for (const s of [...spilled.filter((x) => dueIn(x.id)), ...spilled.filter((x) => !dueIn(x.id))]) {
    const by = dueIn(s.id);
    const next = frame.days.find((d) => d > s.from && (!by || d <= by) && fitsOn(s.id, d));
    if (next) put(s.id, next);
    else if (!by) toLater += 1;
    else {
      // nothing after it up to its date: the nearest day before with room, or where it was
      const before = frame.days.filter((d) => d < s.from && fitsOn(s.id, d));
      if (!before.length) heldOver += 1;
      put(s.id, before.length ? before[before.length - 1] : s.from);
    }
  }

  // Everything else comes back on a day. One that is already put off keeps
  // the day it has, so it is not written again; a hard date ahead is not passed.
  const returns = frame.returns;
  const load = new Map();
  for (const back of frame.later.values()) load.set(back, (load.get(back) || 0) + 1);
  const wanted = [];
  const askedDay = new Map();
  let kept = 0;
  const want = (id, asked) => {
    const t = byId.get(id);
    const waiting = isDay(t?.back_on) && t.back_on > frame.today ? t.back_on : null;
    // Put off already and on no day: it keeps the day it has, and nothing is
    // written. One released from a day is written, to take it off that day.
    if (waiting && !frame.home.has(id)) {
      load.set(waiting, (load.get(waiting) || 0) + 1);
      kept += 1;
      return;
    }
    const d = hardDate(id);
    const by = d && d > frame.today ? d : null;
    let day = asked || waiting;
    if (by && (!day || day > by)) {
      const before = returns.filter((x) => x <= by);
      day = before.length ? before[before.length - 1] : returns[0] || null;
    }
    wanted.push({ id, back_on: day, by });
  };
  const seen = new Set();
  for (const l of asList(o.later)) {
    const id = idOf(l?.todo_id);
    if (!id) drop('later', 'unknown_id');
    else if (!mine.has(id)) drop('later', 'not_to_spread');
    else if (seen.has(id)) drop('later', 'twice');
    else if (!dayOf.has(id)) {
      seen.add(id);
      const back = normDay(l?.back_on) || null;
      if (back) askedDay.set(id, back);
      want(id, back);
    }
  }
  // What the model left out, and what a full day gave up with nowhere to go:
  // the oldest first, so what has waited longest comes back soonest.
  let leftOut = 0;
  const oldestFirst = [...frame.free].sort(
    (x, y) =>
      (x.created || '').localeCompare(y.created || '') || String(x.id).localeCompare(String(y.id)),
  );
  for (const t of oldestFirst) {
    if (dayOf.has(t.id) || seen.has(t.id)) continue;
    if (!spilled.some((s) => s.id === t.id)) leftOut += 1;
    want(t.id, null);
  }
  const back = spreadReturns(wanted, {
    days: returns,
    load,
    cap: returnsCap(wanted.length + kept + frame.later.size, returns.length),
  });
  // a day the model asked for that could not be the day
  let redated = 0;
  for (const [id, day] of askedDay) if (back.has(id) && back.get(id) !== day) redated += 1;

  const place = [];
  for (const day of frame.days) for (const id of order.get(day)) place.push({ id, day });
  return {
    place,
    later: wanted.filter((w) => back.has(w.id)).map((w) => ({ id: w.id, back_on: back.get(w.id) })),
    // a note was written for the day as the model left it
    notes: notes.filter((n) => !changed.has(n.day)),
    dropped,
    counts: {
      to_spread: frame.free.length,
      placed: place.length,
      later: back.size,
      // what code had to put right, for the replay to judge the model by
      dropped: dropped.length,
      late,
      spilled: spilled.length,
      spilled_to_later: toLater,
      // held to a date with no room up to it: left where it was, over the room
      held_over: heldOver,
      left_out: leftOut,
      redated,
      kept_later: kept,
    },
  };
}

/**
 * Make a week's spread: one call, then the checks.
 * @param {object} env
 * @param {object} g what gatherRead read
 * @param {{read?: object, answers?: object}} row the week's review
 * @param {{board?: object, effort?: string}} [p] their own moves on the board;
 *   effort is low unless given (the replay can ask for another to compare)
 */
export async function runWeekSpread(env, g, row, { board, effort = 'low' } = {}) {
  const frame = spreadFrame(g, row, board);
  const r = renderSpread(g, frame);
  let checked;
  let model = null;
  if (!r.listed.length) {
    // nothing for the model to choose between: code gives the rest their days
    checked = checkSpread({ days: [], later: [] }, g, frame, r);
  } else {
    const res = await jsonCall(env, {
      primary: modelFor(env, 'weekSpread'),
      fallback: modelFor(env, 'weekSpreadFallback'),
      system: spreadSystem(g.person),
      user: r.text,
      schema: SPREAD_SCHEMA,
      maxTokens: 8000,
      effort,
      thinking: effort,
    });
    model = res.model;
    checked = checkSpread(res.output, g, frame, r);
  }
  return { ...checked, frame, model, input: r.text, prompt_version: WEEK_SPREAD_VERSION, effort };
}

/** The spread as the week's row keeps it: where Gremly put things, and what it was made from. */
export function storedSpread(g, out, at = new Date()) {
  return {
    version: out.prompt_version,
    made_at: at.toISOString(),
    made_on: g.today,
    model: out.model,
    effort: out.effort,
    first: out.frame.days[0] || g.first,
    last: g.last,
    // the answers it was made for: when the review's are no longer these, it is made again
    basis: out.frame.basis,
    place: out.place,
    later: out.later,
    habit_days: out.frame.habits.map((h) => ({ id: h.id, days: h.days })),
    notes: out.notes,
    counts: out.counts,
  };
}
