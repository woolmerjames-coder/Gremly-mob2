// ============================================================================
// entityMatch.js: does this message refer to something the user already has?
//
// The shared matcher behind the entity card in chat (docs: the Entity Card in
// Chat mockup, September 2026). Two callers use it:
//   explicit: a chat turn where the user names a todo, habit or note and wants
//             to see or change it (run before the reply, in parallel with triage)
//   implicit: the background extraction, which asks the same question of the
//             whole conversation (see the edits block in chatPrompts.js)
//
// A small model cannot see everything a user has, so a cheap lookup picks the
// few nearest candidates by wording, and only those go to the model, which
// answers one of: this item, none of these, or ask. A wrong match is worse than
// no match, so anything below the confidence floor becomes a question, never a
// change. Nothing here changes data; the app applies a change only after the
// user taps.
//
// Follow ups: the app sends the item from the last card it showed (recent), and
// that item is always a candidate, so "move it to Friday" can resolve "it".
// ============================================================================

import { helperFetch } from './helperClient.js';
import { models } from './models.js';

export const CANDIDATE_LIMIT = 6;
export const CONFIDENCE_FLOOR = 70;
// A card that only shows an item (no change proposed) must earn its place: the
// chat is a conversation first, so a mere mention gets no card.
export const VIEW_FLOOR = 80;

// ── Candidate lookup ────────────────────────────────────────────────────────

const STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'and',
  'with',
  'my',
  'me',
  'i',
  'is',
  'it',
  'that',
  'this',
  'can',
  'you',
  'please',
  'move',
  'change',
  'rename',
  'update',
  'set',
  'push',
  'shift',
  'make',
  'put',
  'from',
  'into',
  'about',
  'thing',
  'one',
  'be',
  'do',
  'was',
  'got',
  'get',
  'have',
  'has',
  'up',
  'so',
  'just',
  'want',
  'need',
  'like',
  'delete',
  'remove',
  'mark',
  'done',
  'today',
  'tomorrow',
  'tonight',
  'now',
  'later',
  'next',
  'last',
  'week',
  'day',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'morning',
  'afternoon',
  'evening',
  'am',
  'pm',
  'habit',
  'todo',
  'task',
  'note',
  'reminder',
]);
export const toks = (s) =>
  (
    String(s || '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/[a-z0-9]+/g) || []
  ).filter((t) => t.length > 1 && !STOP.has(t));
const stem = (t) => t.replace(/(ing|ed|es|s)$/, '');
/** HH:MM from a Postgres time value such as 14:00:00. */
const clockTime = (v) => (v ? String(v).slice(0, 5) : null);
/** The day a note is for: the column, or the copy MindDrop keeps in views. */
export const noteDay = (n) => n?.target_date || n?.views?.target_date || null;
const ENTITY_TYPES = new Set(['todo', 'habit', 'note']);

/** Fetch the user's live items with the fields the matcher and the card need. */
export async function fetchEntities(env, userId) {
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
  const [todos, habits, notes] = await Promise.all([
    get(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=not.is.true&select=id,name,title,due_day,due_time,space_id,updated_at&order=updated_at.desc&limit=80`,
    ),
    get(
      `habits?owner_id=eq.${userId}&archived_at=is.null&select=id,name,title,frequency,space_id,updated_at&order=updated_at.desc&limit=40`,
    ),
    // a note's day can live in the column or, for MindDrop captures, in views
    get(
      `notes?owner_id=eq.${userId}&archived=not.is.true&select=id,title,space_id,target_date,event_time,views,updated_at&order=updated_at.desc&limit=60`,
    ),
  ]);
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
      frequency: h.frequency || null,
      space_id: h.space_id || null,
    });
  for (const n of notes)
    items.push({
      id: n.id,
      type: 'note',
      title: n.title || '',
      // a note with a day and time (an appointment, an event) edits like a todo
      due_day: noteDay(n),
      due_time: clockTime(n.event_time || n.views?.event_time),
      target_date: noteDay(n),
      space_id: n.space_id || null,
    });
  return items.filter((i) => i.title);
}

/** Rank items by wording overlap with the message; returns the top few with a score. */
export function rankCandidates(message, items, limit = CANDIDATE_LIMIT) {
  const m = new Set(toks(message).map(stem));
  if (m.size === 0) return [];
  const scored = [];
  for (const it of items) {
    const t = toks(it.title).map(stem);
    if (t.length === 0) continue;
    let hit = 0;
    for (const w of new Set(t)) if (m.has(w)) hit++;
    if (hit === 0) continue;
    // share of the title's words that appear in the message, with a small bonus for each hit
    const score = hit / new Set(t).size + hit * 0.1;
    scored.push({ ...it, score: Math.round(score * 100) / 100 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * The candidates for one turn: the wording ranking, plus the item from the last
 * card the app showed (when it sent one), marked so the model knows the user
 * has just been looking at it. That item always makes the list, so a short
 * follow up like "move it to Friday" has something for "it" to mean.
 */
export function candidatesFor(message, items, recent, limit = CANDIDATE_LIMIT) {
  const ranked = rankCandidates(message, items, limit);
  if (!recent || !recent.id || !ENTITY_TYPES.has(recent.type)) return ranked;
  const fresh = items.find((i) => i.id === recent.id);
  const shown = fresh
    ? { ...fresh, shown: true }
    : {
        id: String(recent.id),
        type: recent.type,
        title: String(recent.title || '').slice(0, 120),
        due_day: recent.due_day || null,
        due_time: recent.due_time || null,
        frequency: recent.frequency || null,
        space_id: recent.space_id || null,
        shown: true,
      };
  if (!shown.title) return ranked;
  return [shown, ...ranked.filter((c) => c.id !== shown.id)].slice(0, limit + 1);
}

// ── The matcher call ────────────────────────────────────────────────────────

export const ENTITY_MATCH_SYSTEM_PROMPT = `You decide whether a chat message in a personal productivity app refers to one of the user's existing items, and what the user wants done with it.

You are given today's date, the message, the previous exchange when there is one, and a short list of candidate items the user already has (todos and notes, some with a day and time; habits with a frequency). The candidates were chosen by wording; most messages refer to none of them. A candidate marked as shown on the card in the last reply is the item the app has just shown the user: in a short follow up, words like it, that, this one, or the appointment mean that item unless the message clearly names something else.

This is a conversation first. A card interrupts it, so the bar is high: the user has to be asking for something to happen to a specific item they already have, or asking to see it. Talking about the same topic, sharing plans or details, thinking out loud, or asking about their day are conversation, and get refers false.

Decide:
- refers: true only when the message clearly names or points at one specific existing item. A message that merely shares words with an item does not refer to it. A message that describes something new does not refer to an existing item.
- entity_id: the id of that item, or null.
- intent: "edit" when the user asks for, or states, a change to when the item is (its day or time), what it is called, or how often it repeats, including when they say it needs to move but have not said where to; "complete" when they say it is done; "view" only when they ask to see the item or ask what or when it is; "none" for everything else, including details they share about the topic, which are not an edit.
- change: for an edit, the single field to change and the new value. Fields: due_day (YYYY-MM-DD, resolved from today's date; todos and notes), due_time (HH:MM, 24 hour; todos and notes), name (the new title), frequency (plain words; habits). Null when the user wants a change but has not said what to, or the change is unclear; intent stays edit.
- confidence: 0 to 100, how sure you are that entity_id is the item the user means.
- ask: true when two or more candidates fit about equally, or when the user's wording is too vague to pick one. Then list their ids in candidates.

A wrong match is worse than no match: when in doubt, refers false or ask true. Never invent an item or an id that is not in the list. Never resolve a date the user did not give.

Return ONLY JSON: {"refers":true|false,"entity_id":"..."|null,"intent":"edit"|"view"|"complete"|"none","change":{"field":"...","value":"..."}|null,"confidence":0-100,"ask":true|false,"candidates":["..."]}`;

export function buildEntityMatchInput({ todayStr, message, previousExchange, candidates }) {
  const lines = [`Today is ${todayStr}.`];
  if (previousExchange?.userMsg && previousExchange?.assistantMsg) {
    lines.push(
      `\nLAST EXCHANGE:\nUser: ${String(previousExchange.userMsg).slice(0, 300)}\nGremly: ${String(previousExchange.assistantMsg).slice(0, 300)}`,
    );
  }
  lines.push(`\nMESSAGE:\n${String(message).slice(0, 600)}`);
  lines.push('\nCANDIDATES:');
  for (const c of candidates) {
    const detail =
      c.type === 'todo'
        ? `${c.due_day ? `due ${c.due_day}` : 'no due day'}${c.due_time ? ` at ${c.due_time}` : ''}`
        : c.type === 'habit'
          ? c.frequency || 'no frequency set'
          : c.due_day
            ? `dated ${c.due_day}${c.due_time ? ` at ${c.due_time}` : ''}`
            : 'note, no day set';
    lines.push(
      `- id ${c.id} [${c.type}] ${c.title} (${detail})${c.shown ? ' [shown on the card in the last reply]' : ''}`,
    );
  }
  return lines.join('\n');
}

function parseJson(raw) {
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

// What a card in the conversation may change. A note's text is not on the list:
// adding to a note is an offer in the Save items pill, not an interruption.
const FIELDS = {
  todo: ['due_day', 'due_time', 'name'],
  habit: ['name', 'frequency'],
  note: ['name', 'due_day', 'due_time'],
};

/**
 * Turn the model's answer into a card the app can show, or null.
 * Pure, so it is unit tested; matchEntity below does the fetching.
 */
export function decideCard(answer, candidates) {
  if (!answer || typeof answer !== 'object') return null;
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const confidence = Number(answer.confidence) || 0;
  const askIds = Array.isArray(answer.candidates)
    ? answer.candidates.filter((id) => byId.has(id))
    : [];
  if (answer.ask && askIds.length >= 2) {
    return { kind: 'choose', candidates: askIds.slice(0, 3).map((id) => byId.get(id)) };
  }
  if (!answer.refers || !byId.has(answer.entity_id)) return null;
  const entity = byId.get(answer.entity_id);
  if (confidence < CONFIDENCE_FLOOR) {
    // Not sure enough to propose anything: ask, with the runner up when there is one
    const others = candidates.filter((c) => c.id !== entity.id).slice(0, 2);
    return { kind: 'choose', candidates: [entity, ...others] };
  }
  const intent = answer.intent;
  if (intent === 'edit' && answer.change && FIELDS[entity.type]?.includes(answer.change.field)) {
    const value = String(answer.change.value ?? '').trim();
    // the user wants a change but the new value is missing or unusable: show the
    // item and let Gremly ask what should change
    if (!value) return { kind: 'view', entity, intent: 'edit' };
    if (answer.change.field === 'due_day' && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return { kind: 'view', entity, intent: 'edit' };
    if (answer.change.field === 'due_time' && !/^\d{2}:\d{2}$/.test(value))
      return { kind: 'view', entity, intent: 'edit' };
    const from = entity[answer.change.field === 'name' ? 'title' : answer.change.field] ?? null;
    return {
      kind: 'edit',
      entity,
      change: { field: answer.change.field, from, to: value },
      confidence,
    };
  }
  if (intent === 'complete' && entity.type === 'todo') {
    return {
      kind: 'edit',
      entity,
      change: { field: 'completed', from: null, to: 'done' },
      confidence,
    };
  }
  if (intent === 'edit') return { kind: 'view', entity, intent: 'edit' };
  if (intent === 'view' && confidence >= VIEW_FLOOR)
    return { kind: 'view', entity, intent: 'view' };
  return null;
}

/**
 * The explicit path: run for a chat turn. Returns a card or null. Never throws.
 * @param {{env: object, userId: string, message: string, previousExchange?: object, todayStr: string, items?: Array, recent?: object|null}} p
 *   recent: the item on the last card the app showed in this chat, if any
 */
export async function matchEntity({
  env,
  userId,
  message,
  previousExchange,
  todayStr,
  items,
  recent,
}) {
  try {
    if (!models().flags.entityCards) return null;
    const all = items || (await fetchEntities(env, userId));
    const candidates = candidatesFor(message, all, recent || null);
    if (candidates.length === 0) return null;
    const res = await helperFetch('entity_match', {
      messages: [
        { role: 'system', content: ENTITY_MATCH_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildEntityMatchInput({ todayStr, message, previousExchange, candidates }),
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const answer = parseJson(json.choices?.[0]?.message?.content || '');
    const card = decideCard(answer, candidates);
    console.log('[EntityMatch]', {
      candidates: candidates.length,
      recent: !!recent,
      kind: card?.kind || 'none',
      type: card?.entity?.type || null,
      intent: card?.intent || null,
      confidence: card?.confidence ?? null,
    });
    return card;
  } catch (err) {
    console.error('[EntityMatch] failed', String(err).slice(0, 200));
    return null;
  }
}

/**
 * The reply when a card is showing is one line above the card, in Gremly's
 * voice; the card carries the details and the action. This swaps the triage
 * mode for the entity card mode (gremlyPersona.js) so the reply template
 * cannot turn into a plan or a list, and switches search off. A view card
 * where the user only mentioned the item leaves triage alone.
 */
export function applyEntityCardToTriage(triage, card) {
  if (!card || !triage) return triage;
  const takesOver =
    card.kind === 'edit' ||
    card.kind === 'choose' ||
    (card.kind === 'view' && card.intent === 'edit');
  if (!takesOver) return triage;
  return {
    ...triage,
    mode: 'entity_card',
    modeBeforeCard: triage.mode,
    depth: 'brief',
    search: 'none',
  };
}

function changeInWords(card) {
  const f = card.change.field;
  if (f === 'completed') return 'mark it done';
  if (f === 'due_day') return `move it to ${card.change.to}`;
  if (f === 'due_time') return `change its time to ${card.change.to}`;
  if (f === 'name') return `rename it to ${card.change.to}`;
  if (f === 'frequency') return `change its frequency to ${card.change.to}`;
  return `update it to ${card.change.to}`;
}

/**
 * What became of the last card in this chat, so a follow up such as "did you
 * change it?" gets a truthful answer. The app sends the item with its status.
 */
export function recentCardPromptSection(recent) {
  if (!recent || !recent.id || !recent.title || !ENTITY_TYPES.has(recent.type)) return '';
  const item = `their ${recent.type} "${String(recent.title).slice(0, 120)}"`;
  if (recent.status === 'applied') {
    const what = recent.summary ? ` ${String(recent.summary).slice(0, 160)}` : '';
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} and they confirmed the change.${what} That change is done; if they ask, say so plainly.`;
  }
  if (recent.status === 'undone') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item}; they confirmed a change and then undid it, so the item is as it was.`;
  }
  if (recent.status === 'pending') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} and they have not acted on it. Nothing about it has changed.`;
  }
  return '';
}

/** The section added to the reply prompt when a card is being shown. */
export function entityCardPromptSection(card) {
  if (!card) return '';
  const never =
    'Nothing has been changed; the user decides with one tap on the card. Never say you have changed, moved, updated or saved anything. Do not describe the card or repeat its details, do not give advice, and do not use a list or numbered steps.';
  if (card.kind === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" proposing to ${changeInWords(card)}. ${never} Reply with one short, warm line asking whether that is the one, and stop.`;
  }
  if (card.kind === 'view' && card.intent === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}". They want to change it but have not said what to. ${never} Reply with one short line asking what should change, such as its day, its time or its name, and stop.`;
  }
  if (card.kind === 'view') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" under your reply. Refer to it naturally; do not repeat its details, and do not claim to have changed anything.`;
  }
  if (card.kind === 'choose') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user ${card.candidates.length} of their items that might be the one they mean, so they can pick with a tap. ${never} Reply with one short line asking which one they mean, without naming them, and stop.`;
  }
  return '';
}
