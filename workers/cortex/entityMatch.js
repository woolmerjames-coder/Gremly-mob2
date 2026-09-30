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
// The model sees every live item the user has (a few hundred lines at most,
// most recently touched first) together with the last few exchanges, and
// answers one of: this item, none of these, or ask. No code reads the message:
// an item described in other words is on the list like any other, and which
// one is meant is the model's judgement. A wrong match is worse than no match,
// so anything below the confidence floor becomes a question, never a change.
// Nothing here changes data; the app applies a change only after the user taps.
//
// Follow ups: the app sends the item from the last card it showed (recent), and
// that item is always a candidate, so "move it to Friday" can resolve "it".
// ============================================================================

import { helperFetch } from './helperClient.js';
import { models } from './models.js';

// The matcher sees every live item the fetch returns; this only bounds the prompt.
export const MATCH_ITEMS_MAX = 700;
export const CONFIDENCE_FLOOR = 70;
// A card that only shows an item (no change proposed) must earn its place: the
// chat is a conversation first, so a mere mention gets no card.
export const VIEW_FLOOR = 80;
// A bound on how many of the items the message is about reach the reply.
const RELATED_MAX = 4;

// ── Item fetch ──────────────────────────────────────────────────────────────

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
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=not.is.true&select=id,name,title,due_day,due_time,space_id,updated_at&order=updated_at.desc&limit=300`,
    ),
    get(
      `habits?owner_id=eq.${userId}&archived_at=is.null&select=id,name,title,frequency,space_id,updated_at&order=updated_at.desc&limit=100`,
    ),
    // a note's day can live in the column or, for MindDrop captures, in views
    get(
      `notes?owner_id=eq.${userId}&archived=not.is.true&select=id,title,space_id,subtype,target_date,event_time,views,updated_at&order=updated_at.desc&limit=300`,
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
      subtype: n.subtype || null,
      // a note with a day and time (an appointment, an event) edits like a todo
      due_day: noteDay(n),
      due_time: clockTime(n.event_time || n.views?.event_time),
      target_date: noteDay(n),
      space_id: n.space_id || null,
    });
  return items.filter((i) => i.title);
}

/**
 * The items the matcher sees for one turn: all of them, most recently touched
 * first, with the item on the last card the app showed (shown) in front. Nothing
 * here reads the message: which item, if any, the message means is the model's
 * call, and an item described in other words is on the list like any other.
 * Each item gets a short key the model can copy without error.
 */
export function candidatesFor(message, items, recent, limit = MATCH_ITEMS_MAX) {
  const live = (items || []).filter(
    (i) => i && i.title && !(i.type === 'note' && i.subtype === 'journal'),
  );
  let list = live;
  if (recent && recent.id && ENTITY_TYPES.has(recent.type)) {
    const fresh = live.find((i) => i.id === recent.id);
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
    if (shown.title) list = [shown, ...live.filter((c) => c.id !== shown.id)];
  }
  return withKeys(list.slice(0, limit));
}

/** A short id per item for the model to copy; lengthened only on a clash. */
function withKeys(list) {
  const used = new Set();
  return list.map((c) => {
    let n = 8;
    let key = String(c.id).slice(0, n);
    while (used.has(key) && n < String(c.id).length) key = String(c.id).slice(0, ++n);
    used.add(key);
    return { ...c, key };
  });
}

// ── The matcher call ────────────────────────────────────────────────────────

export const ENTITY_MATCH_SYSTEM_PROMPT = `You decide whether a chat message in a personal productivity app is about something the user already has, and what they want done with it.

You are given today's date, the message, the last few exchanges when there are any, and the user's items: their todos and notes, some with a day and time, and their habits with how often they repeat. The list is everything they have, so most of it has nothing to do with the message. An item marked as shown on the card in the last reply is the one the app has just shown them. A short follow up takes its meaning from the exchanges before it: a pronoun or a bare yes means the item those exchanges were about unless the message plainly names something else, and a yes to an offer Gremly made is an edit with the change that offer named.

This is a conversation first. Two different things can follow from your answer, so tell them apart: a card in the reply, which interrupts the conversation and is only for an explicit ask; and a quiet offer later, which is for things said in passing.

Decide:
- refers: true when the message is about one specific item on the list, whether it names the item, points at it, or describes the same thing in different words. Sharing a word or a topic with an item is not referring to it, describing something new is not referring to an existing item, and when their words cover an area of work, a project or several items at once, no single item is meant: refers is false and the items concerned go in about.
- entity_id: the id of that item, or null.
- intent: "edit" when the message is a request or an instruction about the item: to move it, reschedule it, rename it, give it another time or another frequency, add something to a note, or a statement, in whatever words, that the item as it is set has to change, even without saying what to. "complete" when their words say the item is done, whether they announce it as news or ask for it to be marked. "view" only when they ask for the item itself: to see it, open it, read it back, or be told what it says or when it is. Asking for help, options, ideas or information about the subject an item is about is not a request to see the item; that is mention, or none. "mention" when they are telling you about the item rather than asking for anything: what they plan to do, when they now expect to do it, what has happened with it, or details about it. A plan or an intention is news, not an instruction, even when it names a day. Details about a note's subject that come up in passing are also mention, with change null: the app offers to add them to the note afterwards, and a note's title does not change because its subject grew. "none" when the message only shares a topic with it.
- change: for edit and mention, the single field their words give a new value for, else null. Fields: due_day (YYYY-MM-DD), due_time (HH:MM, 24 hour), name (the new title), frequency (plain words; habits only), body_add (text to add to a note, in their words, only when they ask for it to be added). A due_day is the one calendar day their words point to, counted from today's date. Words point to one day when they name a day or a date, count days or weeks from today, give a deadline as the end of a period (its last day; whether a week ends on Friday or Sunday follows from what the item is), or give a short span of two or three days (its first day). A day of the month with no month named is the next such day after today. Words point to no single day when they give a month, a season, a vague time, or a different week or month without saying which day in it; then the value is null and the card asks which day. A day mentioned for some other reason, such as being busy on it, is not the new value. Null when they want a change but have not said what to, or the change is unclear.
- about: the ids of the items the message is about, whether or not refers is true: the item they are discussing, or the very piece of work they are talking about. Empty when it is about none of them. An item that is only on the same subject, one that merely shares a word with the message, or a note that records a past day does not belong here; a reply that name-drops such an item feels like being watched, so leave them out.
- confidence: 0 to 100, how sure you are that entity_id is the item they mean.
- ask: true only when they are asking for something to happen to one item (an edit, a completion, or to see it) and two or more items fit about equally; then list those ids in candidates. A loose description still refers to one of their items when any fit it: pick the one that fits best when one clearly does, ask when several fit, and answer refers false only when none of their items could be the one they mean. Never ask about a topic they are merely talking about.

A wrong match is worse than no match: when in doubt, refers false or ask true. Never invent an id. Never resolve a date the user did not give.

Return ONLY JSON: {"refers":true|false,"entity_id":"..."|null,"intent":"edit"|"mention"|"view"|"complete"|"none","change":{"field":"...","value":"..."}|null,"about":["..."],"confidence":0-100,"ask":true|false,"candidates":["..."]}`;

// how many exchanges before the message the matcher reads
export const MATCH_EXCHANGES = 3;

export function buildEntityMatchInput({
  todayStr,
  message,
  previousExchange,
  exchanges,
  candidates,
}) {
  const lines = [`Today is ${todayStr}.`];
  const recent = (Array.isArray(exchanges) && exchanges.length ? exchanges : [previousExchange])
    .filter((x) => x && x.userMsg && x.assistantMsg)
    .slice(-MATCH_EXCHANGES);
  if (recent.length) {
    lines.push('\nLAST EXCHANGES, oldest first:');
    for (const x of recent) {
      lines.push(
        `User: ${String(x.userMsg).slice(0, 300)}\nGremly: ${String(x.assistantMsg).slice(0, 300)}`,
      );
    }
  }
  lines.push(`\nMESSAGE:\n${String(message).slice(0, 600)}`);
  lines.push('\nTHEIR ITEMS (everything they have):');
  for (const c of candidates) {
    const detail =
      c.type === 'todo'
        ? `${c.due_day ? `due ${c.due_day}` : 'no due day'}${c.due_time ? ` at ${c.due_time}` : ''}`
        : c.type === 'habit'
          ? c.frequency || 'no frequency set'
          : c.due_day
            ? `dated ${c.due_day}${c.due_time ? ` at ${c.due_time}` : ''}`
            : 'note, no day set';
    const tag = c.shown ? ' [shown on the card in the last reply]' : '';
    lines.push(`- id ${c.key || c.id} [${c.type}] ${c.title} (${detail})${tag}`);
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

// What a card in the conversation may change. Adding to a note's text is a card
// only when they ask for it; said in passing it is an offer in the Save items pill.
const FIELDS = {
  todo: ['due_day', 'due_time', 'name'],
  habit: ['name', 'frequency'],
  note: ['name', 'due_day', 'due_time', 'body_add'],
};

/**
 * Turn the model's answer into a card the app can show, or null.
 * Pure, so it is unit tested; matchEntity below does the fetching. Items are
 * looked up by the short key the model was shown or by their full id.
 */
export function decideCard(answer, candidates) {
  if (!answer || typeof answer !== 'object') return null;
  const byId = itemIndex(candidates);
  const confidence = Number(answer.confidence) || 0;
  const askIds = Array.isArray(answer.candidates)
    ? [...new Set(answer.candidates.filter((id) => byId.has(id)).map((id) => byId.get(id).id))]
    : [];
  // the model asks only when they want something to happen to one of these
  if (answer.ask && askIds.length >= 2) {
    return {
      kind: 'choose',
      candidates: askIds.slice(0, 3).map((id) => byId.get(id)),
    };
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
    // already that way: nothing to change, Gremly says so
    if (String(from ?? '') === value)
      return { kind: 'view', entity, intent: 'view', already: true };
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
  // a card that only shows an item interrupts the chat, so the model has to be
  // sure they asked to see it, not merely talked about it
  if (intent === 'view' && confidence >= VIEW_FLOOR)
    return { kind: 'view', entity, intent: 'view' };
  if (intent === 'mention') {
    // no card: the reply hears about the item, and any change the words carry
    // becomes an offer in the Save items pill
    const f = answer.change?.field;
    const value = String(answer.change?.value ?? '').trim();
    // details said in passing go to the pill, which can hold the text; a card cannot
    const usable =
      f &&
      f !== 'body_add' &&
      value &&
      FIELDS[entity.type]?.includes(f) &&
      (f !== 'due_day' || /^\d{4}-\d{2}-\d{2}$/.test(value)) &&
      (f !== 'due_time' || /^\d{2}:\d{2}$/.test(value));
    const from = usable ? (entity[f === 'name' ? 'title' : f] ?? null) : null;
    if (usable && String(from ?? '') !== value) {
      // a concrete change said in passing: the card is the offer, under a
      // reply that carries on the conversation (inPassing keeps triage as is)
      return {
        kind: 'edit',
        entity,
        change: { field: f, from, to: value },
        confidence,
        inPassing: true,
      };
    }
    return { kind: 'mention', entity, change: null, confidence };
  }
  return null;
}

/** Items by their short key and by their full id. */
function itemIndex(candidates) {
  const m = new Map();
  for (const c of candidates || []) {
    if (!c || !c.id) continue;
    m.set(String(c.id), c);
    if (c.key) m.set(String(c.key), c);
  }
  return m;
}

/**
 * The items the model says the message is about, for the reply: the ids in
 * about, plus the item it refers to, in that order, without repeats.
 */
export function aboutItems(answer, candidates, decision) {
  const byId = itemIndex(candidates);
  const out = [];
  const seen = new Set();
  const push = (c, extra) => {
    if (!c || seen.has(c.id)) return;
    seen.add(c.id);
    out.push({ ...c, ...extra });
  };
  const referred = decision?.entity;
  if (referred) push(byId.get(String(referred.id)) || referred, { referred: true });
  for (const id of Array.isArray(answer?.about) ? answer.about : []) {
    if (out.length >= RELATED_MAX) break;
    push(byId.get(String(id)), {});
  }
  return out.slice(0, RELATED_MAX);
}

const ATTENTION_UPCOMING_MAX = 6;
const ATTENTION_OVERDUE_MAX = 3;
const ATTENTION_DAYS = 7;
// overdue by more than this is a backlog for the sweep, not something the chat raises
const ATTENTION_OVERDUE_WINDOW = 30;
// modes where what is due has no place unless the user named it
const NO_ATTENTION_MODES = new Set([
  'emotional',
  'venting',
  'celebration',
  'chit_chat',
  'playful',
  'app_help',
]);

/** Days from a to b, both YYYY-MM-DD; positive when b is later. */
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * What needs their attention regardless of wording: what is due within the
 * week (soonest first), then todos that slipped in the last month, most recent
 * first. An older backlog is the sweep's business, not the chat's.
 */
export function attentionItems(items, todayIso) {
  if (!todayIso) return [];
  const upcoming = [];
  const overdue = [];
  for (const it of items || []) {
    if (!it?.title || !it.due_day || it.type === 'habit') continue;
    const d = daysBetween(todayIso, it.due_day);
    if (it.type === 'todo' && d < 0 && -d <= ATTENTION_OVERDUE_WINDOW)
      overdue.push({ ...it, overdue: true, days: d });
    else if (d >= 0 && d < ATTENTION_DAYS) upcoming.push({ ...it, overdue: false, days: d });
  }
  upcoming.sort((a, b) => a.days - b.days);
  overdue.sort((a, b) => b.days - a.days);
  return [...upcoming.slice(0, ATTENTION_UPCOMING_MAX), ...overdue.slice(0, ATTENTION_OVERDUE_MAX)];
}

/** Today as YYYY-MM-DD in the user's time zone. */
export function todayIsoIn(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timeZone || 'UTC',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** A day as the reply should say it: today, tomorrow, a weekday this week, else the date. */
export function dayInWords(day, todayIso) {
  if (!day) return '';
  if (!todayIso || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const d = daysBetween(todayIso, day);
  if (d === 0) return `today (${day})`;
  if (d === 1) return `tomorrow (${day})`;
  if (d === -1) return `yesterday (${day})`;
  if (d > 1 && d < 7) {
    const [y, m, dd] = day.split('-').map(Number);
    return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} (${day})`;
  }
  return day;
}

function itemLine(c, todayIso) {
  let when = '';
  if (c.type === 'habit') when = c.frequency ? `, ${c.frequency}` : '';
  else if (c.due_day && c.type === 'note') {
    when = `, ${dayInWords(c.due_day, todayIso)}${c.due_time ? ` ${c.due_time}` : ''}`;
  } else if (c.due_day) {
    const overdue = todayIso && c.due_day < todayIso;
    when = `, ${overdue ? 'was due' : 'due'} ${dayInWords(c.due_day, todayIso)}${c.due_time ? ` ${c.due_time}` : ''}${overdue ? ' (overdue)' : ''}`;
  } else when = c.type === 'todo' ? ', no day set' : '';
  return `- ${c.type} "${c.title}"${when}`;
}

/**
 * The reply's knowledge of the user's own items for this turn: the ones the
 * matcher says the message is about, and the ones that need attention anyway.
 * Gremly may speak about them and offer the natural next step; the card and
 * the pill are where a change is confirmed, so the reply never claims one.
 * In a feelings turn only the item they themselves brought up is passed on.
 */
export function theirItemsPromptSection(match, todayIso, opts = {}) {
  const strict = NO_ATTENTION_MODES.has(opts.mode);
  const related = (match?.related || [])
    .filter((c) => c && c.title && (!strict || c.referred || c.shown))
    .slice(0, RELATED_MAX);
  const relatedIds = new Set(related.map((c) => c.id));
  const attention = strict ? [] : (match?.attention || []).filter((c) => !relatedIds.has(c.id));
  if (related.length === 0 && attention.length === 0) return '';
  const parts = [
    '=== WHAT THEY HAVE ON ===',
    "Their own items, as they stand right now. You know these exist. When one bears on what they said, say so plainly and in passing, in your own words: that it is already on their list, when it is, that it is overdue. You may offer the natural next step for one of them (moving it, marking it done); the app then shows a card and they confirm with a tap, so never say a change has been made, and never offer to change several at once: one item per offer. Never read the list out, never mention more than one or two, and leave them alone when the conversation is elsewhere. An overdue item is not on any particular day, so never present it as part of a day's plan.",
  ];
  if (related.length) {
    parts.push('What they are talking about:');
    parts.push(...related.map((c) => itemLine(c, todayIso)));
  }
  if (attention.length) {
    parts.push('Overdue or coming up this week:');
    parts.push(...attention.map((c) => itemLine(c, todayIso)));
  }
  return `\n\n${parts.join('\n')}`;
}

/** Kept for callers that only have a list of items the message is about. */
export function relatedItemsPromptSection(related, todayIso) {
  return theirItemsPromptSection({ related, attention: [] }, todayIso);
}

/**
 * The one item lookup for a chat turn. Never throws. Returns null only when
 * entity cards are off or the fetch failed, else:
 *   all: the user's live todos, habits and notes (the extraction reuses this)
 *   related: the items the matcher says the message is about (the referred
 *            item first, flagged referred), for the reply
 *   attention: what is overdue or due this week, whatever the wording
 *   card: an edit, view or choose card for the reply, or null. An edit card
 *         with inPassing set came from something said in passing and sits
 *         under a normal reply.
 *   mention: the item the message was about in passing, or null
 * @param {{env: object, userId: string, message: string, previousExchange?: object, exchanges?: Array, todayStr: string, todayIso?: string, items?: Array, recent?: object|null}} p
 *   exchanges: the last few {userMsg, assistantMsg} pairs, oldest first
 *   recent: the item on the last card the app showed in this chat, if any
 */
export async function matchEntity({
  env,
  userId,
  message,
  previousExchange,
  exchanges,
  todayStr,
  todayIso,
  items,
  recent,
}) {
  try {
    if (!models().flags.entityCards) return null;
    const all = items || (await fetchEntities(env, userId));
    const candidates = candidatesFor(message, all, recent || null, MATCH_ITEMS_MAX);
    const result = {
      all,
      card: null,
      mention: null,
      related: [],
      attention: attentionItems(all, todayIso || null),
    };
    if (candidates.length === 0 || !String(message || '').trim()) return result;
    const res = await helperFetch('entity_match', {
      messages: [
        { role: 'system', content: ENTITY_MATCH_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildEntityMatchInput({
            todayStr,
            message,
            previousExchange,
            exchanges,
            candidates,
          }),
        },
      ],
      max_tokens: 300,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!res.ok) return result;
    const json = await res.json();
    const answer = parseJson(json.choices?.[0]?.message?.content || '');
    const decision = decideCard(answer, candidates);
    if (decision?.kind === 'mention') result.mention = decision;
    else if (decision) result.card = decision;
    result.related = aboutItems(answer, candidates, decision?.kind === 'choose' ? null : decision);
    result.answer = answer;
    console.log('[EntityMatch]', {
      items: candidates.length,
      recent: !!recent,
      kind: decision?.kind || 'none',
      type: decision?.entity?.type || null,
      intent: decision?.intent || null,
      change: decision?.change?.field || null,
      confidence: decision?.confidence ?? null,
      about: result.related.length,
    });
    return result;
  } catch (err) {
    console.error('[EntityMatch] failed', String(err).slice(0, 200));
    return null;
  }
}

const SAME_THING_PROMPT = `You check proposed new items against what a user already has in a personal productivity app, so nothing they already track is saved twice.

You are given the user's existing items (todos, habits and notes, with ids) and a list of proposed new items. For each proposed item decide whether it is the same thing as one existing item or new. Two things are the same when doing, keeping or noting one would make the other redundant: the same task in other words, the same appointment or event, or a detail of a subject one of the notes already covers. Sharing a subject with a listed item does not make something that item. When in doubt, it is new.

Return ONLY JSON: {"results":[{"index":0,"same_as":"<existing id>"|null}]} with one entry per proposed item, in order.`;

/**
 * A second, independent judgement on the extractor's new items: which of them
 * are an existing item in other words. Sets same_as on those; leaves the rest
 * alone. Never throws; on any failure the list comes back unchanged.
 */
export async function checkNewAgainstTracked(extractions, items) {
  const news = (extractions || []).filter((e) => e && e.type !== 'edit' && e.title);
  const live = candidatesFor('', items || [], null);
  if (news.length === 0 || live.length === 0) return extractions || [];
  try {
    const lines = live.map((c) => `- id ${c.key} [${c.type}] ${c.title}`);
    const proposed = news.map(
      (e, i) => `${i}. [${e.type}] ${e.title}${e.body ? `: ${String(e.body).slice(0, 160)}` : ''}`,
    );
    const res = await helperFetch('entity_match', {
      messages: [
        { role: 'system', content: SAME_THING_PROMPT },
        {
          role: 'user',
          content: `EXISTING ITEMS:\n${lines.join('\n')}\n\nPROPOSED NEW ITEMS:\n${proposed.join('\n')}`,
        },
      ],
      max_tokens: 300,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!res.ok) return extractions;
    const json = await res.json();
    const answer = parseJson(json.choices?.[0]?.message?.content || '');
    const byKey = new Map(live.map((c) => [c.key, c]));
    const results = Array.isArray(answer?.results) ? answer.results : [];
    for (const r of results) {
      const e = news[Number(r?.index)];
      const hit = r?.same_as
        ? byKey.get(String(r.same_as)) || live.find((c) => c.id === r.same_as)
        : null;
      if (e && hit && !e.same_as) e.same_as = hit.key;
    }
    return extractions;
  } catch (err) {
    console.error('[EntityMatch] same-thing check failed', String(err).slice(0, 200));
    return extractions;
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
    (card.kind === 'edit' && !card.inPassing) ||
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
  if (f === 'body_add') return `add to it: ${card.change.to}`;
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
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item}; they tapped Yes and the change was made.${what} It is done: if they ask, say so plainly, and do not tell them to tap or confirm anything.`;
  }
  if (recent.status === 'undone') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item}; they confirmed a change and then undid it, so the item is as it was.`;
  }
  if (recent.status === 'pending') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} and they have not tapped it. Nothing about it has changed; if they ask, it is waiting on their tap.`;
  }
  return '';
}

/** The section added to the reply prompt when a card is being shown. */
export function entityCardPromptSection(card) {
  if (!card) return '';
  const never =
    'Nothing has been changed; the user decides with one tap on the card. Never say you have changed, moved, updated or saved anything. Do not describe the card or repeat its details, do not give advice, and do not use a list or numbered steps.';
  if (card.kind === 'edit' && card.inPassing) {
    return `\n\n=== ENTITY CARD ===\nBecause of what they just said, the app is showing a card under your reply for their ${card.entity.type} "${card.entity.title}", proposing to ${changeInWords(card)}. Nothing has changed; they decide with one tap. Reply to what they said the way you normally would, and in one clause, in your own words, let them know that item is already on their list and the card will move it if they want. Do not describe the card, and never say it is done or updated.`;
  }
  if (card.kind === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" proposing to ${changeInWords(card)}. ${never} Reply with one short, warm line asking whether that is the one, and stop.`;
  }
  if (card.kind === 'view' && card.intent === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}". They want to change it but have not said what to. ${never} Reply with one short line asking what should change, such as its day, its time or its name, and stop.`;
  }
  if (card.kind === 'view' && card.already) {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" under your reply. It is already set the way they asked, so nothing needs to change; say that in one short line.`;
  }
  if (card.kind === 'view') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for their ${card.entity.type} "${card.entity.title}" under your reply. Refer to it naturally; do not repeat its details, and do not claim to have changed anything.`;
  }
  if (card.kind === 'choose') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user ${card.candidates.length} of their items that might be the one they mean, so they can pick with a tap. ${never} Reply with one short line asking which one they mean, without naming them, and stop.`;
  }
  return '';
}
