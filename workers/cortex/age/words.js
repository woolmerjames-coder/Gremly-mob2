// ============================================================================
// What got me here: one line Gremly writes when he grows an age, about the
// three fed days that got him there. Built the way the wrap up's words are
// (wrap/words.js): the reads and the prompt are pure where they can be, the
// model call goes through helperFetch so it is logged, and nothing here
// throws to the caller. The app appends the fixed close, so the model never
// writes it. Spec: the celebrations build plan.
// ============================================================================

import {
  CARE_RULES,
  PRIVATE_RULES,
  WRITING_RULES,
  personBlock,
} from '../../inngest-jobs/careRules.js';
import { db, personIdentity } from '../../shared/db.js';
import { localStartIso } from '../../shared/calendar.js';
import { dayEndHourOf } from '../../shared/day.js';
import { helperFetch } from '../helperClient.js';

export const AGE_WORDS_VERSION = 'age-2026-10-07c';

/** The most words the line may carry. */
export const MAX_WORDS = 20;
/** The fed days one age is made of. */
export const FED_DAYS = 3;
/** The most items a day lends the prompt. */
const PER_DAY = 12;

const DASHES = /[–—]|--/;

const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

const trim = (s, n) => {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

/** The last three fed days, newest first, as YYYY-MM-DD. */
export async function readFedDays(env, userId, n = FED_DAYS) {
  const rows = await db(env).select(
    `daily_ritual_progress?owner_id=eq.${userId}&is_fed=eq.true&select=ritual_day&order=ritual_day.desc&limit=${n}`,
  );
  return (rows || [])
    .map((r) => String(r.ritual_day || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

/**
 * What one fed day held, as the app holds it: what they dropped (titles,
 * never journal entries), the todos they finished and the habits they
 * logged. The day runs from their day end to the next, the way the brief
 * and Sweep count it.
 */
export async function readDayFacts(env, userId, tz, dayEndHour, day) {
  const d = db(env);
  const from = encodeURIComponent(localStartIso(tz, day, dayEndHour));
  const to = encodeURIComponent(localStartIso(tz, addDays(day, 1), dayEndHour));
  const [notes, todos, logged, habits] = await Promise.all([
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&external_source=is.null&subtype=neq.journal&created_at=gte.${from}&created_at=lt.${to}&select=title,subtype&order=created_at.asc&limit=${PER_DAY}`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=gte.${from}&completed_at=lt.${to}&select=name,title&order=completed_at.asc&limit=${PER_DAY}`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=eq.${day}&select=habit_id&limit=${PER_DAY}`,
    ),
    d.select(`habits?owner_id=eq.${userId}&select=id,name,title&limit=200`),
  ]);
  const habitName = new Map((habits || []).map((h) => [h.id, h.title || h.name]));
  return {
    day,
    dropped: (notes || []).map((n) => trim(n.title, 80)).filter(Boolean),
    done: (todos || []).map((t) => trim(t.title || t.name, 80)).filter(Boolean),
    habits: Array.from(
      new Set((logged || []).map((p) => habitName.get(p.habit_id)).filter(Boolean)),
    ).map((h) => trim(h, 60)),
  };
}

const list = (xs) => (xs || []).filter(Boolean).join('; ');

/** The three days, one block per day, oldest first. Pure, for tests. */
export function ageFacts(days) {
  const L = [];
  const ordered = [...days].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const f of ordered) {
    const lines = [];
    if (f.done.length) lines.push(`Todos they finished: ${list(f.done)}.`);
    if (f.habits.length) lines.push(`Habits they logged: ${list(f.habits)}.`);
    if (f.dropped.length) lines.push(`What they dropped into Gremly: ${list(f.dropped)}.`);
    if (!lines.length) lines.push('Nothing is recorded for this day beyond feeding Gremly.');
    L.push(`${f.day}\n${lines.join('\n')}`);
  }
  return L;
}

const VOICE = `VOICE
Warm and brief, as a friend who was there for those days. Speak to them, in the second person, about what they did; this is their record, not Gremly's feelings. Plain text with no headings, lists, quotation marks or emoji. Only what is below is known: never invent an item, a day, a person or a fact.`;

/** Everything the call is told. Pure, for tests. */
export function agePrompt({ person, days, age }) {
  const system = [
    'You are Gremly, a warm, shame-free companion who lives in the person’s app and grows an age every three days they feed him by clearing their head into him.',
    CARE_RULES,
    VOICE,
    PRIVATE_RULES,
    'This line is shown on a full screen the moment he grows, which others nearby might see, so it is a glanceable line: leave out anything the PRIVATE rules call private, even a habit or an item the person named themselves, and choose other things from the days instead. When nothing else can be named, write the one sentence about the three days of clearing their head.',
    WRITING_RULES,
    personBlock(person),
  ].join('\n\n');
  const user = `THE THREE DAYS THAT FED HIM, AS THE APP HOLDS THEM
${ageFacts(days).join('\n\n')}

YOUR WORDS NOW
Gremly has just grown to age ${age} because of those three days. Under the label "What got me here", write one sentence to them, always as you to them and never with their name, in the past tense, of at most ${MAX_WORDS} words, that names two or three specific things they did across those days, in plain words, as they would say them, choosing what mattered most to them when the days show it. It is a record of what they did, so it carries no count of drops, no score, and no word of praise; it says nothing about how Gremly feels; and it does not say what comes next. When the days hold too little to name anything, write one sentence about the three days of clearing their head, in the same voice. The app adds its own closing words after yours, so write only the one sentence.`;
  return { system, user };
}

/** The model's text as one clean sentence, or null when it will not do. Pure, for tests. */
export function readAgeWords(text) {
  let t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  // the first line, without quotation marks the model may wrap it in
  t = t.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  // only ever one sentence; a second one is dropped
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m) t = m[1];
  if (!/[.!?]$/.test(t)) t = t + '.';
  if (DASHES.test(t)) t = t.replace(/\s*(?:–|—|--)\s*/g, ', ');
  // the close is the app's
  t = t.replace(/\s*I’m made of that\.?$/i, '').replace(/\s*I'm made of that\.?$/i, '');
  if (!/[.!?]$/.test(t)) t = t + '.';
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > MAX_WORDS + 4) return null;
  return t;
}

/**
 * The line for the card, or null when there is none (no fed days, a model
 * error, or words that will not do). Never throws.
 * @param {{env: object, userId: string, tz: string, body: {age?: number}, deps?: object}} input
 */
export async function writeAgeWords({ env, userId, tz, body = {}, deps = {} }) {
  const age = Number.isFinite(Number(body.age)) ? Number(body.age) : null;
  const fedDays = deps.fedDays || (await readFedDays(env, userId));
  if (!fedDays.length) return null;
  const dayEndHour = deps.dayEndHour ?? (await dayEndHourOf(env, userId));
  const zone = tz || 'UTC';
  const [person, days] = await Promise.all([
    deps.person || personIdentity(env, userId),
    deps.days ||
      Promise.all(fedDays.map((day) => readDayFacts(env, userId, zone, dayEndHour, day))),
  ]);
  const p = agePrompt({ person, days, age });
  const fetcher = deps.helperFetch || helperFetch;
  const res = await fetcher('age_words', {
    messages: [
      { role: 'system', content: p.system },
      { role: 'user', content: p.user },
    ],
    max_tokens: 120,
    temperature: 0.7,
  });
  if (!res || !res.ok) return null;
  const data = await res.json();
  const line = readAgeWords(data.choices?.[0]?.message?.content || '');
  if (!line) return null;
  return { line, days: fedDays };
}
