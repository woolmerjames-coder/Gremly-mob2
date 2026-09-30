// ============================================================================
// minddropRelate.js: is a Mind Drop about something the user already has?
//
// After a drop is classified, one call looks at it next to everything the user
// already has and answers: new, or the same thing again, a change to one item,
// something to add to one item, a todo now done, a habit they did, or an item
// no longer needed. The app shows one quiet line on the drop's card and asks in
// the question popup; nothing changes until the user taps (docs: the Mind Drop
// "drops about things you already have" canvas, September 2026).
//
// The same principles as the chat's matcher (entityMatch.js): the model sees
// the whole list and decides by meaning. No code reads the drop, and the prompt
// has no examples and no lists of words. A wrong match is worse than none, so
// anything unsure is new, and so is any failure: the drop is then filed exactly
// as it would have been without this step.
// ============================================================================

import { helperFetch } from './helperClient.js';

// A question costs a tap; only a confident match earns one.
export const RELATE_CONFIDENCE_FLOOR = 75;
export const RELATE_ITEMS_MAX = 600;
// Habit check-ins the list shows, so a day already logged is not asked again.
export const RELATE_LOG_WINDOW_DAYS = 14;
const RELATE_TIMEOUT_MS = 6000;

const RELATIONS = new Set(['new', 'same', 'edit', 'add', 'complete', 'logged', 'remove']);
// What a drop may change on each kind of item.
const EDIT_FIELDS = {
  todo: ['due_day', 'due_time', 'name'],
  note: ['due_day', 'due_time', 'name'],
  habit: ['name', 'frequency'],
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (day) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
const clockTime = (v) => (v ? String(v).slice(0, 5) : null);

// ── Items ───────────────────────────────────────────────────────────────────

/** The user's live items: open todos, habits (with lately logged days) and notes. */
export async function fetchDropItems(env, userId, todayIso) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
  const get = async (path) => {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  };
  const since = addDays(todayIso, -RELATE_LOG_WINDOW_DAYS);
  const [todos, habits, notes, logs] = await Promise.all([
    get(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=not.is.true&select=id,name,title,due_day,due_time,space_id,updated_at&order=updated_at.desc&limit=300`,
    ),
    get(
      `habits?owner_id=eq.${userId}&archived_at=is.null&select=id,name,title,subtype,frequency,space_id,updated_at&order=updated_at.desc&limit=100`,
    ),
    get(
      `notes?owner_id=eq.${userId}&archived=not.is.true&select=id,title,space_id,subtype,target_date,event_time,views,updated_at&order=updated_at.desc&limit=300`,
    ),
    get(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${since}&select=habit_id,occurred_day&order=occurred_day.desc&limit=1000`,
    ),
  ]);
  const logged = new Map();
  for (const l of logs || []) {
    if (!l?.habit_id || !l?.occurred_day) continue;
    if (!logged.has(l.habit_id)) logged.set(l.habit_id, new Set());
    logged.get(l.habit_id).add(String(l.occurred_day).slice(0, 10));
  }
  return shapeItems({ todos, habits, notes, logged });
}

/** Rows from the three tables into the list the model sees. Pure (the replay uses it). */
export function shapeItems({ todos = [], habits = [], notes = [], logged = new Map() }) {
  const items = [];
  for (const t of todos)
    items.push({
      id: t.id,
      type: 'todo',
      title: t.name || t.title || '',
      due_day: t.due_day || null,
      due_time: clockTime(t.due_time),
      space_id: t.space_id || null,
    });
  for (const h of habits)
    items.push({
      id: h.id,
      type: 'habit',
      title: h.name || h.title || '',
      habit_kind: h.subtype === 'break_habit' ? 'break' : 'build',
      frequency: h.frequency || null,
      logged_days: [...(logged.get(h.id) || [])].sort().reverse(),
      space_id: h.space_id || null,
    });
  for (const n of notes) {
    // journal entries are feelings, never something a drop changes or repeats
    if (n.subtype === 'journal') continue;
    // a drop still waiting on this step is not a candidate for the next one
    if (n.views?.relation?.status === 'pending') continue;
    const day = n.target_date || n.views?.target_date || null;
    items.push({
      id: n.id,
      type: 'note',
      title: n.title || '',
      due_day: day,
      due_time: clockTime(n.event_time || n.views?.event_time),
      target_date: day,
      space_id: n.space_id || null,
    });
  }
  return items.filter((i) => i.title);
}

/** A short id per item for the model to copy; lengthened only on a clash. */
export function withKeys(items, limit = RELATE_ITEMS_MAX) {
  const used = new Set();
  return (items || []).slice(0, limit).map((c) => {
    let n = 8;
    let key = String(c.id).slice(0, n);
    while (used.has(key) && n < String(c.id).length) key = String(c.id).slice(0, ++n);
    used.add(key);
    return { ...c, key };
  });
}

// ── The call ────────────────────────────────────────────────────────────────

export const MINDDROP_RELATE_PROMPT = `You decide whether a drop, something a user has just captured in the quick capture box of a personal productivity app, is about one of the things they already have, and what should happen to that thing.

You are given today's date, the drop, and the user's items: their open todos and their notes, some with a day and time, and their habits with how often they repeat and the days they logged lately. The list is everything they have, so most of it has nothing to do with the drop. Read the whole list before deciding; an item near the end counts as much as one near the top.

Most drops are new: a new task, plan, thought or note, even when it shares a subject, a person or a word with an item. A drop relates to an item only when it would change that one item, finish it, log a day on it, add to it or remove it, or when it is that same item captured again. The app asks the user before anything happens, and a needless question costs them a tap, so relate a drop only when one reading plainly fits.

Decide, in this order:
- considered: the ids of every item the drop could be about, up to five, found by reading the whole list; empty when none could be.
- relation, one of:
  "same" when the drop is the same thing as one item, so keeping both would make one of them redundant: the same task in other words, the same appointment or event, or the same habit. Something they would still need to do or keep once the item was done is not the same, and neither is the next step in the same piece of work.
  "edit" when the drop says that how one item is set has to change: its day, its time, its name, or how often a habit repeats. The drop has to say the item itself has moved, been renamed or repeats differently; doing or planning the thing on some day does not set that item's day, and a plan, a hope or a feeling about an item is not a change to it.
  "add" when the drop is a detail about the very thing one note or one todo is, that belongs inside it, and is not a task or an item in its own right. How something went, or how they felt about it, is their own entry and never a detail to add.
  "complete" when the drop reports that one todo on the list has already been done.
  "logged" when the drop reports that they have already done what one of their habits tracks.
  Complete and logged need the drop to say it has happened. A drop that only names the thing, plans it or reminds them of it is not a report that it happened.
  "remove" when the drop says one item is no longer happening or no longer needed.
  "new" in every other case.
- entity_id: the id of that item, or null when the relation is new.
- change: null unless one of these applies. For edit, the single field and its new value: due_day (YYYY-MM-DD), due_time (HH:MM, 24 hour), name (the new title) or frequency (plain words, habits only); when a new day also comes with a new time, give the day and add time (HH:MM, 24 hour). For logged, field logged with the day they did it as YYYY-MM-DD, today unless they name another day. For add, field body_add with the words to add, in their words. For same, field extra with only what the drop says that the item does not already say, in their words and as a short phrase that reads on its own, or null when it adds nothing.
- confidence: 0 to 100, how sure you are of both the item and the relation.
- ask: true only when the drop plainly relates to one of their items in one of these ways and two or more items fit about equally; then list their ids in candidates.

A due_day is the one calendar day the drop's words point to, counted from today's date. Words point to one day when they name a day or a date, count days or weeks from today, or give a deadline as the end of a period, which is its last day. A day of the month with no month named is the next such day after today. Words point to no single day when they give a month, a season, a vague time, or a different week without saying which day in it; then the change is null.

A wrong match is worse than no match: when in doubt, the relation is new. Never invent an id. Never resolve a date the drop does not give.

Return ONLY JSON: {"considered":["..."],"relation":"new"|"same"|"edit"|"add"|"complete"|"logged"|"remove","entity_id":"..."|null,"change":{"field":"...","value":"...","time":"..."|null}|null,"confidence":0-100,"ask":true|false,"candidates":["..."]}`;

/** The user turn: today, the drop, then every item with its key. */
export function buildRelateInput({ todayIso, text, candidates }) {
  const lines = [
    `Today is ${weekdayOf(todayIso)} ${todayIso}.`,
    `\nDROP:\n${String(text).slice(0, 600)}`,
  ];
  lines.push('\nTHEIR ITEMS (everything they have):');
  for (const c of candidates) {
    const detail =
      c.type === 'todo'
        ? `${c.due_day ? `due ${c.due_day}` : 'no due day'}${c.due_time ? ` at ${c.due_time}` : ''}`
        : c.type === 'habit'
          ? `${c.habit_kind === 'break' ? 'a habit to cut out, ' : ''}${c.frequency || 'no frequency set'}${
              c.logged_days?.length
                ? `; logged ${c.logged_days.slice(0, 7).join(', ')}`
                : '; nothing logged lately'
            }`
          : c.due_day
            ? `dated ${c.due_day}${c.due_time ? ` at ${c.due_time}` : ''}`
            : 'note, no day set';
    lines.push(`- id ${c.key} [${c.type}] ${String(c.title).slice(0, 120)} (${detail})`);
  }
  return lines.join('\n');
}

export function parseJson(raw) {
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/** The fields the app needs to show an item on the card. */
function publicEntity(c) {
  const e = { id: c.id, type: c.type, title: c.title, space_id: c.space_id || null };
  if (c.type === 'habit') {
    e.frequency = c.frequency || null;
    e.logged_days = (c.logged_days || []).slice(0, 7);
    e.habit_kind = c.habit_kind || 'build';
  } else {
    e.due_day = c.due_day || null;
    e.due_time = c.due_time || null;
    if (c.type === 'note') e.target_date = c.target_date || null;
  }
  return e;
}

/**
 * The change a relation proposes for one item, checked against that item, or
 * null when there is nothing to ask (an invalid value, a value it already has,
 * a day already logged). Also used when the user picks from several.
 */
export function changeFor(intent, entity, change, todayIso) {
  const field = change?.field;
  const raw = change?.value;
  const value = typeof raw === 'string' ? raw.trim() : raw == null ? null : String(raw);
  if (intent === 'edit') {
    if (!EDIT_FIELDS[entity.type]?.includes(field) || !value) return null;
    if (field === 'due_day' && !DAY.test(value)) return null;
    if (field === 'due_time' && !TIME.test(value)) return null;
    const from =
      field === 'name'
        ? entity.title
        : field === 'frequency'
          ? entity.frequency || null
          : entity[field] || null;
    // a new day can bring a new time with it: both change together
    const time =
      field === 'due_day' && typeof change?.time === 'string' && TIME.test(change.time.trim())
        ? change.time.trim()
        : null;
    const newTime = time && time !== (entity.due_time || null) ? time : null;
    if (from && String(from).toLowerCase() === value.toLowerCase() && !newTime) return null;
    const out = { field, from: from ?? null, to: field === 'name' ? value.slice(0, 120) : value };
    if (newTime) {
      out.time_from = entity.due_time || null;
      out.time_to = newTime;
    }
    return out;
  }
  if (intent === 'add') {
    if (entity.type === 'habit' || !value) return null;
    return { field: 'body_add', from: null, to: value.slice(0, 500) };
  }
  if (intent === 'complete') {
    return entity.type === 'todo' ? { field: 'completed', from: null, to: 'done' } : null;
  }
  if (intent === 'logged') {
    // a slip on a habit to cut out is not a check-in: ask nothing
    if (entity.type !== 'habit' || entity.habit_kind === 'break') return null;
    const day = value && DAY.test(value) ? value : todayIso;
    if (day > todayIso || day < addDays(todayIso, -(RELATE_LOG_WINDOW_DAYS - 1))) return null;
    if ((entity.logged_days || []).includes(day)) return null;
    return { field: 'logged', from: null, to: day };
  }
  return null;
}

/**
 * Turn the model's answer into what the app shows, or null (file the drop as
 * usual). Pure, so it is unit tested; relateDrop below does the calling.
 *   { kind: 'same', intent, entity, extra }
 *   { kind: 'edit', intent, entity, change }      edit, add, complete, logged
 *   { kind: 'remove', intent, entity }
 *   { kind: 'choose', intent, candidates, value } two or more fit equally
 * Every card carries `others`: the other items the model considered, for "Not
 * that one".
 */
export function decideRelation(answer, candidates, todayIso) {
  if (!answer || typeof answer !== 'object') return null;
  const intent = String(answer.relation || '').toLowerCase();
  if (!RELATIONS.has(intent) || intent === 'new') return null;
  const byKey = new Map();
  for (const c of candidates || []) {
    byKey.set(String(c.key), c);
    byKey.set(String(c.id), c);
  }
  const known = (list) => [
    ...new Map(
      (Array.isArray(list) ? list : [])
        .map((k) => byKey.get(String(k)))
        .filter(Boolean)
        .map((c) => [c.id, c]),
    ).values(),
  ];
  const confidence = Number(answer.confidence) || 0;
  const value =
    answer.change && typeof answer.change === 'object' ? (answer.change.value ?? null) : null;

  // Two or more fit about equally: the user picks, then sees that item's card.
  if (answer.ask === true) {
    const options = known(answer.candidates).filter((c) =>
      fits(intent, c, answer.change, todayIso),
    );
    if (options.length >= 2) {
      return {
        kind: 'choose',
        intent,
        candidates: options.slice(0, 3).map(publicEntity),
        change: answer.change && typeof answer.change === 'object' ? answer.change : null,
        value,
        confidence,
      };
    }
  }

  const entity = byKey.get(String(answer.entity_id));
  if (!entity || confidence < RELATE_CONFIDENCE_FLOOR) return null;
  const others = known(answer.considered)
    .filter((c) => c.id !== entity.id)
    .slice(0, 3)
    .map(publicEntity);
  const base = { intent, entity: publicEntity(entity), others, confidence };

  if (intent === 'same') {
    const extra =
      answer.change && typeof answer.change.value === 'string' && answer.change.value.trim()
        ? answer.change.value.trim().slice(0, 500)
        : null;
    return { kind: 'same', ...base, extra };
  }
  if (intent === 'remove') return { kind: 'remove', ...base };
  const change = changeFor(intent, entity, answer.change, todayIso);
  return change ? { kind: 'edit', ...base, change } : null;
}

/** Whether an item could take this relation at all (used to trim a choice). */
function fits(intent, c, change, todayIso) {
  if (intent === 'same' || intent === 'remove') return true;
  // a change is only offered when it can be made to that item
  return !!changeFor(intent, c, change, todayIso);
}

/**
 * Is this drop about something the user has? Never throws; any failure, a slow
 * answer or an unsure one returns relation null, and the drop files as usual.
 * @param {{env: object, userId?: string, text: string, todayIso: string, items?: Array}} p
 */
export async function relateDrop({ env, userId, text, todayIso, items }) {
  const started = Date.now();
  try {
    const all = items || (await fetchDropItems(env, userId, todayIso));
    const candidates = withKeys(all, RELATE_ITEMS_MAX);
    if (!candidates.length || !String(text || '').trim()) return { relation: null, answer: null };
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), RELATE_TIMEOUT_MS) : null;
    let res;
    try {
      res = await helperFetch(
        'entity_match',
        {
          messages: [
            { role: 'system', content: MINDDROP_RELATE_PROMPT },
            { role: 'user', content: buildRelateInput({ todayIso, text, candidates }) },
          ],
          max_tokens: 300,
          temperature: 0,
          response_format: { type: 'json_object' },
        },
        controller ? { signal: controller.signal } : {},
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res?.ok) return { relation: null, answer: null };
    const json = await res.json();
    const answer = parseJson(json.choices?.[0]?.message?.content || '');
    const relation = decideRelation(answer, candidates, todayIso);
    console.log('[MindDropRelate]', {
      items: candidates.length,
      relation: answer?.relation || null,
      kind: relation?.kind || 'none',
      field: relation?.change?.field || null,
      confidence: answer?.confidence ?? null,
      ms: Date.now() - started,
      usage: json.usage || null,
    });
    return { relation, answer, usage: json.usage || null };
  } catch (err) {
    console.warn('[MindDropRelate] failed', String(err).slice(0, 200));
    return { relation: null, answer: null };
  }
}
