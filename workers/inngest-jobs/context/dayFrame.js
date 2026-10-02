/**
 * The day's frame: travel and set times the day has to be planned around.
 *
 * A trip that starts today, a flight, a time to leave for the airport: these
 * live in the ledger (what the person said) and on the calendar, never as
 * todos. A small model reads today's calendar and the facts about today and
 * says which of them are travel, which have a set time, and what the day's
 * travel is called; code checks every ref and every time before any of it is
 * used. The frame goes into the DCO (dco.day_frame), built with it each
 * morning and read again after a ledger read changes a fact about today
 * (brief/frameRefresh.js).
 *
 * What reads it: the day card's chip, the planner (nothing planned after
 * setting off; set times are busy), the brief and the morning notification.
 * brief/dayRecord.js and lib/brief/dayRecord.ts turn it into the day record.
 *
 * Prompt policy: semantic rules only, no examples, no word lists.
 */

import { jsonCall, modelFor } from './llm';
import { addDays, weekdayName } from './db';

export const DAY_FRAME_VERSION = 'day-frame-2026-10-02a';

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** "13:05" as minutes from midnight, or null. */
export function minutesOf(value) {
  const m = HHMM.exec(String(value || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** A short label for a chip: a few words, never a sentence. */
function chipLabel(text) {
  const s = trim(text, 40).replace(/[.!?]+$/, '');
  return s && s.split(' ').length <= 6 ? s : null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    travel: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          refs: { type: 'array', items: { type: 'string' } },
          label: { type: 'string' },
          departs: { type: 'string', nullable: true },
        },
        required: ['refs', 'label', 'departs'],
      },
    },
    away: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          refs: { type: 'array', items: { type: 'string' } },
          label: { type: 'string' },
          through: { type: 'string', nullable: true },
        },
        required: ['refs', 'label', 'through'],
      },
    },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          title: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string', nullable: true },
          travel: { type: 'boolean' },
        },
        required: ['ref', 'title', 'start', 'end', 'travel'],
      },
    },
    travel_calendar_refs: { type: 'array', items: { type: 'string' } },
  },
  required: ['travel', 'away', 'blocks', 'travel_calendar_refs'],
};

const SYSTEM = `Gremly plans a person's day around what is fixed in it. From today's calendar and the facts Gremly holds about today, pick out the travel and the set times the day has to be planned around. Code checks every ref and time you give.

- travel: at most one entry, for travel that happens today: setting off on a trip, coming home from one, or a journey of its own. Cite the facts or calendar entries it rests on. label is a few words naming the travel itself, written to be read with the word "today" after it on a small chip; never a sentence, never about anything private. departs is the time they set off, as HH:MM on a 24-hour clock, only when a fact or the calendar states it: the time they leave home when that is stated, otherwise the departure time of the journey itself. Leave departs empty when no time is stated, and leave travel empty when nothing says they travel today.
- away: at most one entry, for a trip that started before today and is still going on today, when there is no travel today. label names the trip in a few words; through is its last day as YYYY-MM-DD, when a fact states it.
- blocks: things at a set time today that the day has to be planned around and that are not timed calendar entries, each stated in a fact about today. Cite one fact each. title is a few words for a row on a timeline; start, and end when one is stated, are HH:MM on a 24-hour clock. travel is true when the block is part of the day's travel. Never invent a time, never turn a loose part of the day into a time, and leave out anything the facts say has moved, fallen through or already happened.
- travel_calendar_refs: the timed calendar entries today that are themselves travel.
- A fact about another day, or a plan that is only being considered, is not part of today.`;

/**
 * Read the frame for one day.
 * @param {object} p
 * @param {string} p.today YYYY-MM-DD
 * @param {{id:string,title:string,start:number,end:number}[]} p.meetings today's timed entries, cancelled ones left out
 * @param {{id:string,statement:string,about_date:string,about_date_end?:string|null,state:string,private?:boolean,observed_at?:string}[]} p.facts facts whose dates cover today
 */
export async function readDayFrame(env, { today, meetings = [], facts = [] }) {
  const usable = facts.filter((f) => !f.private && coversToday(f, today));
  if (!usable.length && !meetings.length) return emptyFrame(today, null);
  const frame = await readFrameFrom(env, today, meetings, usable);
  // what it was read from, so a later change to a fact about today is noticed
  frame.input_fact_ids = usable.map((f) => f.id);
  return frame;
}

async function readFrameFrom(env, today, meetings, usable) {
  const refs = new Map();
  const calLines = meetings.map((m, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, { type: 'calendar', id: m.id, title: m.title, start: m.start, end: m.end });
    return `${ref} | ${hhmm(m.start)} to ${hhmm(m.end)} | ${trim(m.title, 140)}`;
  });
  const factLines = usable.map((f, i) => {
    const ref = `f${i + 1}`;
    refs.set(ref, { type: 'fact', id: f.id, statement: f.statement });
    const when =
      f.about_date_end && f.about_date_end !== f.about_date
        ? `${f.about_date} to ${f.about_date_end}`
        : f.about_date;
    return `${ref} | ${f.state} | ${when} | ${trim(f.statement, 220)}`;
  });
  const user = `TODAY: ${weekdayName(today)} ${today}.

TODAY'S TIMED CALENDAR ENTRIES (ref | when | title):
${calLines.join('\n') || '(none)'}

FACTS ABOUT TODAY (ref | state | dates | statement):
${factLines.join('\n') || '(none)'}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system: SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 2000,
    effort: 'low',
    thinking: 'low',
  });
  return validateFrame(output, refs, today, model);
}

export function emptyFrame(today, model) {
  return {
    date: today,
    travel: null,
    away: null,
    blocks: [],
    travel_calendar_ids: [],
    fact_ids: [],
    input_fact_ids: [],
    model,
    version: DAY_FRAME_VERSION,
    built_at: new Date().toISOString(),
  };
}

/**
 * Keep only what the inputs support: refs that exist, times that parse, a
 * block cited to a fact, a label short enough for a chip.
 */
export function validateFrame(output, refs, today, model = null) {
  const frame = emptyFrame(today, model);
  const cited = new Set();
  const known = (list) =>
    (list || [])
      .map((r) => refs.get(r))
      .filter((r) => r && (r.type === 'fact' || r.type === 'calendar'));

  const travelEntries = [
    ...new Map(
      (output?.travel_calendar_refs || [])
        .map((r) => refs.get(r))
        .filter((r) => r?.type === 'calendar')
        .map((r) => [r.id, r]),
    ).values(),
  ].sort((a, b) => a.start - b.start);
  frame.travel_calendar_ids = travelEntries.map((r) => r.id);

  for (const b of output?.blocks || []) {
    const r = refs.get(b?.ref);
    const start = minutesOf(b?.start);
    if (!r || r.type !== 'fact' || start === null) continue;
    let end = minutesOf(b?.end);
    if (end !== null && end <= start) end = null;
    const title = trim(b.title, 60);
    if (!title) continue;
    if (frame.blocks.some((x) => x.fact_id === r.id && x.start === start)) continue;
    frame.blocks.push({
      id: `fact:${r.id}:${start}`,
      title,
      start,
      end,
      travel: b.travel === true,
      fact_id: r.id,
    });
    cited.add(r.id);
  }
  frame.blocks.sort((a, b) => a.start - b.start);

  const t = (output?.travel || [])[0];
  const tRefs = known(t?.refs);
  const tLabel = chipLabel(t?.label);
  if (t && tRefs.length && tLabel) {
    let departs = minutesOf(t.departs);
    // a set-off time the model did not give, from a travel block or entry
    if (departs === null) {
      departs = frame.blocks.find((b) => b.travel)?.start ?? travelEntries[0]?.start ?? null;
    }
    frame.travel = {
      label: tLabel,
      departs,
      fact_ids: tRefs.filter((r) => r.type === 'fact').map((r) => r.id),
      calendar_ids: tRefs.filter((r) => r.type === 'calendar').map((r) => r.id),
    };
    for (const r of tRefs) if (r.type === 'fact') cited.add(r.id);
  }

  const a = (output?.away || [])[0];
  const aRefs = known(a?.refs).filter((r) => r.type === 'fact');
  const aLabel = chipLabel(a?.label);
  if (!frame.travel && a && aRefs.length && aLabel) {
    const through =
      /^\d{4}-\d{2}-\d{2}$/.test(a.through || '') &&
      a.through >= today &&
      a.through <= addDays(today, 60)
        ? a.through
        : null;
    frame.away = { label: aLabel, through, fact_ids: aRefs.map((r) => r.id) };
    for (const r of aRefs) cited.add(r.id);
  }

  frame.fact_ids = [...cited];
  return frame;
}

/** A fact whose dates cover today (a trip from yesterday to tomorrow counts). */
export function coversToday(f, today) {
  if (!f?.about_date) return false;
  const end =
    f.about_date_end && f.about_date_end >= f.about_date ? f.about_date_end : f.about_date;
  return f.about_date <= today && end >= today;
}
