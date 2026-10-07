/**
 * Relief for their over-full days: when a day of the week being planned
 * already holds more of their own todos than it has room for, Gremly suggests
 * which of them could leave it, and where to.
 *
 * They put those todos on those days themselves, so nothing here moves
 * anything. The suggestions go on a card for each day, in the review, and a
 * todo moves only when they take the suggestion.
 *
 * One model call for all the over-full days (weekRelief in the models table,
 * at low effort), made beside the spread and from the same frame. Which todo
 * can leave a day is a judgement about what the todos are, so it is the
 * model's. Code works out which days are over and by how much before, and
 * checks every id, day and number after (checkRelief): only their own todos
 * on an over-full day are moved, never one with a time of day, never past a
 * hard date, and never onto a day without room for it.
 *
 *   spreadFrame (pure)  →  renderRelief (pure)  →  the model  →  checkRelief (pure)
 *
 * The prompt is semantic rules only. Nothing here reads the person's words.
 */

import { jsonCall, modelFor } from '../context/llm';
import { noDashes } from '../brief/writer';
import { isDay, minutesOf } from '../../shared/week.js';
import { returnsCap, spreadReturns } from '../../shared/weekBoard.js';
import { normDay } from '../../shared/changes/check.js';
import { dayLine, renderBoard } from './spread';

/** Bump when the prompt or what the model is given changes. */
export const WEEK_RELIEF_VERSION = 'week-relief-2026-10-07b';

/** A line about a day, in Gremly's words, is cut to this. */
const NOTE_MAX = 140;

const asList = (v) => (Array.isArray(v) ? v : []);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The over-full days of a frame: each with how far over it is and their own
 * todos on it that could move. A todo with a time of day is an appointment
 * and stays; it is not offered.
 * @returns {{day: string, over: number, movable: string[]}[]}
 */
export function overfullDays(g, frame) {
  const byId = new Map((g.todos || []).map((t) => [t.id, t]));
  // only a day that holds todos of theirs: habits alone leave nothing to move
  return frame.room
    .filter((x) => x.over > 0 && x.fixed > 0)
    .map((x) => ({
      day: x.day,
      over: x.over,
      movable: [...frame.fixed]
        .filter(([id, d]) => d === x.day && !byId.get(id)?.timed)
        .map(([id]) => id),
    }));
}

/**
 * The model's input: the week as it stands (renderBoard), then the over-full
 * days, each with how far over it is and the todos on it that could move.
 * @returns {{text: string, refs: object, days: {day: string, over: number, movable: string[]}[]}}
 *   days leaves out a todo the read's list does not reach, which the model
 *   cannot name
 */
export function renderRelief(g, frame) {
  const { r, refOf, L } = renderBoard(g, frame, 'each put there by them');
  const byId = new Map((g.todos || []).map((t) => [t.id, t]));
  const days = overfullDays(g, frame).map((d) => ({
    ...d,
    movable: d.movable.filter((id) => refOf.has(id)),
  }));
  L.push(
    '',
    'THE OVER-FULL DAYS (each with the todos of theirs on it that could move, id and minutes):',
  );
  for (const d of days) {
    L.push(
      `${dayLine(d.day)}, over by ${plural(d.over, 'minute', 'minutes')}: ${
        d.movable.map((id) => `${refOf.get(id)} (${minutesOf(byId.get(id))})`).join(', ') ||
        '(nothing on it can move)'
      }`,
    );
  }
  L.push(
    frame.returns.length
      ? `A todo that goes to later can come back on any day from ${frame.returns[0]} to ${frame.returns[frame.returns.length - 1]}.`
      : 'There is no day left for a todo to come back on, so suggest only moves to another of the days being planned.',
  );
  return { text: L.join('\n'), refs: r.refs, days };
}

export function reliefSystem(person) {
  const who = person?.first_name
    ? `Their first name is ${person.first_name}.`
    : 'Their name is not known.';
  return {
    fixed: `You are Gremly, planning one person's week with them. Some days of the week being planned already hold more of their own todos than the day has room for. They put those todos on those days themselves, so nothing moves unless they agree. For each over-full day, suggest which of the todos on it could leave it, and where each could go. They will see your suggestions for a day on a card and can take them, change them or leave the day as it is.

How to choose:
Each day's room is worked out for you, in minutes, and so is how far over each over-full day is. Count a todo with no length as thirty minutes.
Keep on a day what belongs to that day: what is for something happening on it, what gets them ready for something that begins soon after it, what has a hard date on it, and what they said matters most this week while the day can hold it. Suggest moving what would lose the least by being done on another day. Never move what gets them ready for something to the day that thing begins, or past it.
Move a todo to another of the days being planned that has room for it, on or before any hard date it has, and close to the day it was on when nothing calls for another. Suggest later, with the day it comes back to them, only for what can wait beyond these days, or when no day being planned has room.
Suggest as much as brings the day inside its room, and no more. When a day cannot be brought inside its room without moving what belongs on it, suggest what you can and leave the rest.
Suggest moves only for the todos listed under an over-full day, and one move at most for each. Everything else stays where it is.
A day can carry one short line to them about why these are the ones to move, in plain words. Leave it empty when there is nothing worth saying.

Rules:
Use only facts in the data. Never speak of the data or of what you were given: write as someone who knows them.
Some of what you know is about their health, body or mind. Let it shape your suggestions: their energy, appointments, rest and how much to ask of them. Write about it only as discreetly as they would want on a screen someone else might glance at. In your own words never name a condition, a treatment or therapy of any kind, a medication, a medical test or a medical speciality, even when one of their own items names it. Read each line once more as a stranger glancing at the screen would: that stranger should not be able to tell what this person's health involves. Where something to do with their health is why a day is full or needs to be light, speak of the day and what it can hold, never of the reason.
Write to them as you, warmly and briefly, in plain words. No dashes used as punctuation.
Use ids exactly as given, and only where an id is asked for: never write an id in your words.`,
    varying: who,
  };
}

const text = (description) => ({ type: 'string', description });
const list = (items, description) => ({ type: 'array', description, items });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties) });
const A_DAY = 'YYYY-MM-DD';

export const RELIEF_SCHEMA = obj({
  days: list(
    obj({
      day: text(`an over-full day, as ${A_DAY}`),
      moves: list(
        obj({
          todo_id: text('the id of a todo on this day that could move'),
          to_day: text(
            `the day being planned it could move to, as ${A_DAY}; empty when it goes to later`,
          ),
          back_on: text(
            `when it goes to later, the day it comes back to them, as ${A_DAY}; empty otherwise`,
          ),
        }),
        'the moves you suggest for this day',
      ),
      note: text(
        'one short line to them about why these, or empty; nothing in it says what their health involves',
      ),
    }),
    'every over-full day, in order',
  ),
});

/** Gremly's own words, on one line, without dashes, cut to a length. */
function said(v, max) {
  if (typeof v !== 'string') return '';
  const s = noDashes(v.replace(/\s+/g, ' ').trim());
  return s.length > max ? s.slice(0, max).trim() : s;
}

/**
 * The model's suggestions, put right by dates, ids and numbers alone:
 *
 * - a day that is not over-full, an id it was not given, a todo that is not
 *   one of theirs on that day (or has a time of day) and a todo named twice
 *   are dropped
 * - a move to a day is kept when that day is being planned, is not the day
 *   itself or another over-full day, is on or before the todo's hard date,
 *   and has room for it beside what is on it and what is already suggested
 *   for it
 * - a move that names no day is a move to later, and so is one whose day to
 *   move to cannot be read while its day to come back can; one where neither
 *   can be read is dropped
 * - a move to later is kept unless the todo has a hard date on the days being
 *   planned; its day to come back is the one asked for when that can be the
 *   day, otherwise the nearest that can (spreadReturns), and never after its
 *   hard date when an earlier day is open
 * - a hard date that had gone by before the days being planned holds a todo
 *   to nothing
 * - a day whose suggestions lost a move loses its line, which was written for
 *   the moves as the model made them
 *
 * A day the model said nothing for still comes back, with no moves: it is
 * over, and the card says so. Each day keeps how many moves the model
 * offered for it (asked), so the card can tell a day Gremly would leave as it
 * is from one whose suggestions did not hold up.
 *
 * @returns {{days: {day: string, over: number, asked: number, moves: {id: string,
 *   to: string|null, back_on: string|null}[], still: number, note: string}[],
 *   dropped: {what: string, why: string}[], counts: object}} still is how far
 *   over the day would be with every move taken
 */
export function checkRelief(output, g, frame, r) {
  const dropped = [];
  const drop = (what, why) => dropped.push({ what, why });
  const o = output && typeof output === 'object' ? output : {};
  const byId = new Map((g.todos || []).map((t) => [t.id, t]));
  const mins = (id) => minutesOf(byId.get(id));
  const idOf = (ref) => r.refs.todos.get(String(ref ?? '').trim());
  const first = frame.days[0];
  const last = frame.days[frame.days.length - 1];
  const hardDate = (id) => {
    const d = byId.get(id)?.deadline;
    return isDay(d) && d >= first ? d : null;
  };
  const over = new Map(r.days.map((d) => [d.day, d]));
  // what each day that is not over has left, less what is suggested for it
  const left = new Map(frame.room.filter((x) => !x.over).map((x) => [x.day, x.left]));

  const taken = new Set();
  const asked = new Map();
  const toLater = [];
  const out = new Map(r.days.map((d) => [d.day, { moves: [], note: '', lost: false, asked: 0 }]));
  for (const entry of asList(o.days)) {
    const day = normDay(entry?.day);
    const from = day ? over.get(day) : null;
    if (!from) {
      if (asList(entry?.moves).length) drop('day', 'not_over_full');
      continue;
    }
    const mine = out.get(day);
    if (!mine.note) mine.note = said(entry?.note, NOTE_MAX);
    for (const m of asList(entry?.moves)) {
      mine.asked += 1;
      const id = idOf(m?.todo_id);
      const lose = (why) => {
        drop('move', why);
        mine.lost = true;
      };
      if (!id) lose('unknown_id');
      else if (!from.movable.includes(id)) lose('not_theirs_on_that_day');
      else if (taken.has(id)) lose('twice');
      else {
        const to = normDay(m?.to_day);
        const back = normDay(m?.back_on) || null;
        const by = hardDate(id);
        // a day to move to that cannot be read, and no day to come back either
        if (!to && !back && String(m?.to_day ?? '').trim()) lose('not_a_day');
        else if (to) {
          if (!frame.days.includes(to) || to === day) lose('not_a_day_to_move_to');
          else if (!left.has(to)) lose('to_an_over_full_day');
          else if (by && to > by) lose('after_its_hard_date');
          else if (left.get(to) < mins(id)) lose('no_room');
          else {
            taken.add(id);
            left.set(to, left.get(to) - mins(id));
            mine.moves.push({ id, to, back_on: null });
          }
        } else if (by && by <= last) lose('has_a_hard_date_this_week');
        else {
          taken.add(id);
          // a hard date ahead is not passed
          const wanted =
            by && (!back || back > by)
              ? [...frame.returns].reverse().find((d) => d <= by) || frame.returns[0] || null
              : back;
          asked.set(id, wanted);
          toLater.push({ id, day });
        }
      }
    }
  }

  // each one that goes to later gets a day it comes back on
  const load = new Map();
  for (const b of frame.later.values()) load.set(b, (load.get(b) || 0) + 1);
  const back = spreadReturns(
    toLater.map((x) => ({ id: x.id, back_on: asked.get(x.id), by: hardDate(x.id) })),
    {
      days: frame.returns,
      load,
      cap: returnsCap(toLater.length + frame.later.size, frame.returns.length),
    },
  );
  for (const x of toLater) {
    const mine = out.get(x.day);
    if (back.has(x.id)) mine.moves.push({ id: x.id, to: null, back_on: back.get(x.id) });
    else {
      drop('move', 'no_day_to_come_back_on');
      mine.lost = true;
    }
  }

  const days = r.days.map((d) => {
    const mine = out.get(d.day);
    const moved = mine.moves.reduce((n, m) => n + mins(m.id), 0);
    return {
      day: d.day,
      over: d.over,
      asked: mine.asked,
      moves: mine.moves,
      still: Math.max(0, d.over - moved),
      note: mine.lost ? '' : mine.note,
    };
  });
  return {
    days,
    dropped,
    counts: {
      over_full: days.length,
      moves: days.reduce((n, d) => n + d.moves.length, 0),
      to_later: back.size,
      still_over: days.filter((d) => d.still > 0).length,
      dropped: dropped.length,
    },
  };
}

/**
 * Suggest moves for their over-full days.
 * @param {object} frame spreadFrame, as the spread beside it was made from
 * @returns {Promise<object>} checkRelief, with the model, the input and the
 *   prompt version; no model is called when no day is over-full or nothing on
 *   one can move
 */
export async function runWeekRelief(env, g, frame, { effort = 'low' } = {}) {
  const r = renderRelief(g, frame);
  let checked;
  let model = null;
  if (!r.days.some((d) => d.movable.length)) {
    checked = checkRelief({ days: [] }, g, frame, r);
  } else {
    const res = await jsonCall(env, {
      primary: modelFor(env, 'weekRelief'),
      fallback: modelFor(env, 'weekReliefFallback'),
      system: reliefSystem(g.person),
      user: r.text,
      schema: RELIEF_SCHEMA,
      maxTokens: 4000,
      effort,
      thinking: effort,
    });
    model = res.model;
    checked = checkRelief(res.output, g, frame, r);
  }
  return { ...checked, model, input: r.text, prompt_version: WEEK_RELIEF_VERSION, effort };
}

/**
 * The suggestions as they are kept, inside the week's spread (storedSpread).
 * @param {object|null} out runWeekRelief, or null when the call failed: the
 *   over-full days are still named, with no moves, so the card can say a day
 *   is over and that no moves could be worked out
 */
export function storedRelief(g, frame, out) {
  const base = {
    version: out?.prompt_version || WEEK_RELIEF_VERSION,
    // the answers it was made for: an answer to one of its cards does not change it
    basis: frame.relief_basis,
  };
  if (!out) {
    return {
      ...base,
      failed: true,
      days: overfullDays(g, frame).map((d) => ({
        day: d.day,
        over: d.over,
        asked: 0,
        moves: [],
        still: d.over,
        note: '',
      })),
    };
  }
  return { ...base, model: out.model, days: out.days, counts: out.counts };
}
