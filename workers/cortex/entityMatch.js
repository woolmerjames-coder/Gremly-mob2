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
// ============================================================================

import { helperFetch } from './helperClient.js';
import { models } from './models.js';

export const CANDIDATE_LIMIT = 6;
export const CONFIDENCE_FLOOR = 70;

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
    get(
      `notes?owner_id=eq.${userId}&archived=not.is.true&select=id,title,space_id,target_date,updated_at&order=updated_at.desc&limit=60`,
    ),
  ]);
  const items = [];
  for (const t of todos)
    items.push({
      id: t.id,
      type: 'todo',
      title: t.name || t.title || '',
      due_day: t.due_day || null,
      due_time: t.due_time || null,
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
      target_date: n.target_date || null,
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

// ── The matcher call ────────────────────────────────────────────────────────

export const ENTITY_MATCH_SYSTEM_PROMPT = `You decide whether a chat message in a personal productivity app refers to one of the user's existing items, and what the user wants done with it.

You are given today's date, the message, the previous exchange when there is one, and a short list of candidate items the user already has (todos with due days and times, habits with a frequency, notes). The candidates were chosen by wording; most messages refer to none of them.

Decide:
- refers: true only when the message clearly names or points at one specific existing item. A message that merely shares words with an item does not refer to it. A message that describes something new does not refer to an existing item.
- entity_id: the id of that item, or null.
- intent: "edit" when the user wants the item changed (moved, renamed, its time or frequency altered, its details updated), "view" when they want to see or talk about it without changing it, "complete" when they say it is done, "none" otherwise.
- change: for an edit, the single field to change and the new value. Fields: due_day (YYYY-MM-DD, resolved from today's date), due_time (HH:MM, 24 hour), name (the new title), frequency (plain words), body (new note text). Null when there is nothing to change or the change is unclear.
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
          : c.target_date
            ? `dated ${c.target_date}`
            : 'note';
    lines.push(`- id ${c.id} [${c.type}] ${c.title} (${detail})`);
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

const FIELDS = {
  todo: ['due_day', 'due_time', 'name'],
  habit: ['name', 'frequency'],
  note: ['name', 'body'],
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
    if (!value) return { kind: 'view', entity };
    if (answer.change.field === 'due_day' && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return { kind: 'view', entity };
    if (answer.change.field === 'due_time' && !/^\d{2}:\d{2}$/.test(value))
      return { kind: 'view', entity };
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
  if (intent === 'view' || intent === 'edit') return { kind: 'view', entity };
  return null;
}

/**
 * The explicit path: run for a chat turn. Returns a card or null. Never throws.
 * @param {{env: object, userId: string, message: string, previousExchange?: object, todayStr: string, items?: Array}} p
 */
export async function matchEntity({ env, userId, message, previousExchange, todayStr, items }) {
  try {
    if (!models().flags.entityCards) return null;
    const all = items || (await fetchEntities(env, userId));
    const candidates = rankCandidates(message, all);
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
    if (card)
      console.log('[EntityMatch]', {
        kind: card.kind,
        type: card.entity?.type,
        confidence: card.confidence ?? null,
      });
    return card;
  } catch (err) {
    console.error('[EntityMatch] failed', String(err).slice(0, 200));
    return null;
  }
}

/** The line added to the reply prompt when a card is being shown. */
export function entityCardPromptSection(card) {
  if (!card) return '';
  if (card.kind === 'edit') {
    const what =
      card.change.field === 'completed'
        ? 'mark it done'
        : `change its ${card.change.field.replace('_', ' ')} to ${card.change.to}`;
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" with a proposed change: ${what}. Nothing has been changed yet; the user decides with one tap on the card. Ask in one short, warm line whether that is the one, and stop. Do not describe the card, do not list its details, and never say you have changed, moved or updated anything.`;
  }
  if (card.kind === 'view') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}". Refer to it naturally; do not repeat its details, and do not claim to have changed anything.`;
  }
  if (card.kind === 'choose') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user ${card.candidates.length} of their items that might be the one they mean, so they can pick. Ask in one short line which one they mean, without naming them, and stop. Do not claim to have changed anything.`;
  }
  return '';
}
