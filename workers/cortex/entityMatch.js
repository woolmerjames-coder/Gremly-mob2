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
//
// Anchor: a chat opened about one item ("Talk it through" on a drop) carries
// that item with every turn. It is a soft anchor, not a lock: the item is
// always a candidate, marked as the one the chat was opened about, and the
// reply knows the user chose it, but which item a message means is still the
// model's judgement over the whole list, so the chat can move on.
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
// How many exchanges after a card the same item is not shown again without a change.
export const RECENT_CARD_TURNS = 3;

// ── Item fetch ──────────────────────────────────────────────────────────────

/** HH:MM from a Postgres time value such as 14:00:00. */
const clockTime = (v) => (v ? String(v).slice(0, 5) : null);
/** The day a note is for: the column, or the copy MindDrop keeps in views. */
export const noteDay = (n) => n?.target_date || n?.views?.target_date || null;
const ENTITY_TYPES = new Set(['todo', 'habit', 'note']);

// Where each kind lives, what makes one live, and the columns the matcher needs.
const TABLES = {
  todo: {
    table: 'todos',
    live: 'completed_at=is.null&archived=not.is.true',
    select: 'id,name,title,due_day,due_time,space_id,updated_at',
  },
  habit: {
    table: 'habits',
    live: 'archived_at=is.null',
    select: 'id,name,title,frequency,cadence,target_per_period,period_unit,space_id,updated_at',
  },
  note: {
    table: 'notes',
    live: 'archived=not.is.true',
    select: 'id,title,space_id,subtype,target_date,event_time,views,updated_at',
  },
};

/** One item as the matcher and the card see it, from its row. */
function toItem(row, type, loggedDays = []) {
  if (type === 'todo')
    return {
      id: row.id,
      type: 'todo',
      title: row.name || row.title || '',
      due_day: row.due_day || null,
      due_time: clockTime(row.due_time),
      space_id: row.space_id || null,
    };
  if (type === 'habit')
    return {
      id: row.id,
      type: 'habit',
      title: row.name || row.title || '',
      frequency: row.frequency || null,
      cadence: row.cadence || null,
      target_per_period: row.target_per_period ?? null,
      period_unit: row.period_unit || null,
      logged_days: [...new Set(loggedDays)].sort().reverse(),
      space_id: row.space_id || null,
    };
  return {
    id: row.id,
    type: 'note',
    title: row.title || '',
    subtype: row.subtype || null,
    // a note with a day and time (an appointment, an event) edits like a todo
    due_day: noteDay(row),
    due_time: clockTime(row.event_time || row.views?.event_time),
    target_date: noteDay(row),
    space_id: row.space_id || null,
  };
}

/**
 * The item a chat was opened about, as the app sends it with every turn of
 * that chat: {id, type, title}, or null when the value is not one.
 */
export function anchorFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
  if (!/^[0-9a-f-]{8,64}$/i.test(id) || !ENTITY_TYPES.has(raw.type) || !title) return null;
  return { id, type: raw.type, title };
}

const serviceHeaders = (env) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
});

/**
 * The anchored item looked up on its own, for when the list fetch did not
 * reach it (the list is bounded, most recently touched first). Null when it is
 * no longer a live item of theirs (done, archived or deleted); undefined when
 * the lookup failed, so nothing is claimed either way.
 */
async function fetchAnchorItem(env, userId, anchor, todayIso) {
  const t = TABLES[anchor.type];
  if (!t) return null;
  const headers = serviceHeaders(env);
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${t.table}?id=eq.${encodeURIComponent(anchor.id)}&owner_id=eq.${userId}&${t.live}&select=${t.select}&limit=1`,
      { headers },
    );
    if (!res.ok) return undefined;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    let logged = [];
    if (anchor.type === 'habit' && todayIso) {
      const logs = await fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&habit_id=eq.${encodeURIComponent(anchor.id)}&occurred_day=gte.${addDays(todayIso, -LOG_WINDOW_DAYS)}&select=occurred_day&order=occurred_day.desc&limit=100`,
        { headers },
      );
      const days = logs.ok ? await logs.json() : [];
      logged = (Array.isArray(days) ? days : [])
        .filter((l) => l?.occurred_day)
        .map((l) => String(l.occurred_day).slice(0, 10));
    }
    const item = toItem(row, anchor.type, logged);
    return item.title ? item : null;
  } catch {
    return undefined;
  }
}

/** Fetch the user's live items with the fields the matcher and the card need. */
export async function fetchEntities(env, userId, todayIso = null) {
  const headers = serviceHeaders(env);
  const get = async (path) => {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  };
  const since = todayIso ? addDays(todayIso, -LOG_WINDOW_DAYS) : null;
  const [todos, habits, notes, logs] = await Promise.all([
    get(
      `todos?owner_id=eq.${userId}&${TABLES.todo.live}&select=${TABLES.todo.select}&order=updated_at.desc&limit=300`,
    ),
    get(
      `habits?owner_id=eq.${userId}&${TABLES.habit.live}&select=${TABLES.habit.select}&order=updated_at.desc&limit=100`,
    ),
    // a note's day can live in the column or, for MindDrop captures, in views
    get(
      `notes?owner_id=eq.${userId}&${TABLES.note.live}&select=${TABLES.note.select}&order=updated_at.desc&limit=300`,
    ),
    // the last two weeks of habit check-ins, so a check-in said in chat is not
    // counted twice and the reply can speak to how a habit is going
    since
      ? get(
          `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${since}&select=habit_id,occurred_day&order=occurred_day.desc&limit=1000`,
        )
      : Promise.resolve([]),
  ]);
  const loggedByHabit = new Map();
  for (const l of logs || []) {
    if (!l?.habit_id || !l?.occurred_day) continue;
    if (!loggedByHabit.has(l.habit_id)) loggedByHabit.set(l.habit_id, []);
    loggedByHabit.get(l.habit_id).push(String(l.occurred_day).slice(0, 10));
  }
  const items = [];
  for (const t of todos) items.push(toItem(t, 'todo'));
  for (const h of habits) items.push(toItem(h, 'habit', loggedByHabit.get(h.id) || []));
  for (const n of notes) items.push(toItem(n, 'note'));
  return items.filter((i) => i.title);
}

/**
 * The items the matcher sees for one turn: all of them, most recently touched
 * first, with the item on the last card the app showed (shown) in front and the
 * item the chat was opened about (anchored) next. Journal entries are left out,
 * except the one a chat was opened about. Nothing here reads the message: which
 * item, if any, the message means is the model's call, and an item described in
 * other words is on the list like any other. Each item gets a short key the
 * model can copy without error.
 */
export function candidatesFor(message, items, recent, limit = MATCH_ITEMS_MAX, anchor = null) {
  const live = (items || []).filter(
    (i) => i && i.title && !(i.type === 'note' && i.subtype === 'journal'),
  );
  let list = live;
  if (recent && recent.id && ENTITY_TYPES.has(recent.type)) {
    const fresh = live.find((i) => i.id === recent.id);
    // the item on the last card: shown, or declined when the user said it was
    // not the one (then the model is told so and must not pick it again)
    const flag = recent.status === 'declined' ? { declined: true } : { shown: true };
    const shown = fresh
      ? { ...fresh, ...flag }
      : {
          id: String(recent.id),
          type: recent.type,
          title: String(recent.title || '').slice(0, 120),
          due_day: recent.due_day || null,
          due_time: recent.due_time || null,
          frequency: recent.frequency || null,
          space_id: recent.space_id || null,
          ...flag,
        };
    if (shown.title) list = [shown, ...live.filter((c) => c.id !== shown.id)];
  }
  if (anchor && anchor.id && anchor.title && !anchor.gone && ENTITY_TYPES.has(anchor.type)) {
    const same = list.find((c) => c.id === anchor.id);
    const pinned = { ...anchor, ...(same || {}), anchored: true };
    const rest = list.filter((c) => c.id !== anchor.id);
    const lead = rest[0] && (rest[0].shown || rest[0].declined) ? [rest[0]] : [];
    list = [...lead, pinned, ...rest.slice(lead.length)];
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

You are given today's date, the message, the last few exchanges when there are any, and the user's items: their todos and notes, some with a day and time, and their habits with how often they repeat. The list is everything they have, so most of it has nothing to do with the message. Read the whole list before deciding; an item near the end counts as much as one near the top. An item marked as shown on the card in the last reply is the one the app has just shown them; one marked as not the one they meant was on the last card and they turned it down, so it is never the answer. When the message only turns that card down, what they want is still what they asked for in the exchange before it: find the other items that fit that request among everything they have, and ask which of them they mean (ask true, with their ids in candidates), or take the one that plainly fits. A short follow up takes its meaning from the exchanges before it: a pronoun or a bare yes means the item those exchanges were about unless the message plainly names something else, and a yes to an offer Gremly made is an edit with the change that offer named. An item marked as the one this chat was opened about is the one the user chose to talk about when the chat began: a pronoun, a bare reference or a message with no subject of its own means that item, unless the exchanges since have moved on to something else or the message plainly names another item or something new. Otherwise it is judged like every other item: it goes in about only when the message is about it, and anything else they bring up is found on the list as usual.

This is a conversation first. Two different things can follow from your answer, so tell them apart: a card in the reply, which interrupts the conversation and is only for an explicit ask; and a quiet offer later, which is for things said in passing.

Decide, in this order:
- considered: first, the ids of every item that could be the one the message is about, up to five, found by reading the whole list; empty when none could be.
- refers: true when the message is about one specific item on the list, whether it names the item, points at it, or describes the same thing in different words. What they call it is their word for it, not a filter: when what they describe matches an item of another kind, a todo they call a note or a note they call a reminder, that item is the one they mean, and refers is true. Sharing a word or a topic with an item is not referring to it, describing something new is not referring to an existing item, and when their words cover an area of work, a project or several items at once, no single item is meant: refers is false and the items concerned go in about.
- entity_id: the id of that item, or null.
- intent: "edit" when the message is a request or an instruction about the item: to move it, reschedule it, rename it, give it another time or another frequency, add something to a note or to a todo, or a statement, in whatever words, that the item as it is set has to change, even without saying what to. "complete" when their words say a todo is done, whether they announce it as news or ask for it to be marked. "logged" when they say they did a habit: change is field logged with the day they did it as YYYY-MM-DD, today unless they name another day, or a list of those days when they say they did it on more than one, whether or not those days are already logged. "view" only when they ask for the item itself: to see it, open it, read it back, or be told what it says or when it is. Asking for help, options, ideas or information about the subject an item is about is not a request to see the item; that is mention, or none. "mention" when they are telling you about the item rather than asking for anything: what they plan to do, when they now expect to do it, what has happened with it, or details about it. A plan or an intention is news, not an instruction, even when it names a day. Details about a note's subject that come up in passing are also mention, with change null: the app offers to add them to the note afterwards, and a note's title does not change because its subject grew. "none" when the message only shares a topic with it.
- change: for edit and mention, the single field their words give a new value for, else null. Fields: due_day (YYYY-MM-DD), due_time (HH:MM, 24 hour), name (the new title), frequency (plain words; habits only), logged (YYYY-MM-DD, or a list of them; habits only, the days they did it), body_add (text to add to a note or to a todo's notes, in their words, only when they ask for it to be added). A due_day is the one calendar day their words point to, counted from today's date. Words point to one day when they name a day or a date, count days or weeks from today, give a deadline as the end of a period (its last day; whether a week ends on Friday or Sunday follows from what the item is), or give a short span of two or three days (its first day). A day of the month with no month named is the next such day after today. Words point to no single day when they give a month, a season, a vague time, or a different week or month without saying which day in it; then the value is null and the card asks which day. A deadline is met by any day up to it: when the item already has a day from today up to the deadline their words give, the value is the day it already has, because nothing needs to move. A day mentioned for some other reason, such as being busy on it, is not the new value. Null when they want a change but have not said what to, or the change is unclear.
- about: the ids of the items the message is about, whether or not refers is true: the item they are discussing, or the very piece of work they are talking about. Empty when it is about none of them. An item that is only on the same subject, one that merely shares a word with the message, or a note that records a past day does not belong here; a reply that name-drops such an item feels like being watched, so leave them out.
- confidence: 0 to 100, how sure you are that entity_id is the item they mean.
- ask: true only when they are asking for something to happen to one item (an edit, a completion, or to see it) and two or more items fit about equally; then list those ids in candidates. A loose description still refers to one of their items when any fit it: pick the one that fits best when one clearly does, ask when several fit, and answer refers false only when none of their items could be the one they mean. Never ask about a topic they are merely talking about.

A wrong match is worse than no match: when in doubt, refers false or ask true. Never invent an id. Never resolve a date the user did not give.

Return ONLY JSON: {"considered":["..."],"refers":true|false,"entity_id":"..."|null,"intent":"edit"|"mention"|"view"|"complete"|"none","change":{"field":"...","value":"..."|["..."]}|null,"about":["..."],"confidence":0-100,"ask":true|false,"candidates":["..."]}`;

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
          ? `${c.frequency || 'no frequency set'}${
              c.logged_days?.length
                ? `; logged ${c.logged_days.slice(0, 7).join(', ')}`
                : '; nothing logged lately'
            }`
          : c.due_day
            ? `dated ${c.due_day}${c.due_time ? ` at ${c.due_time}` : ''}`
            : 'note, no day set';
    const tags = [];
    if (c.anchored) tags.push('this chat was opened about this item');
    if (c.shown) tags.push('shown on the card in the last reply');
    else if (c.declined)
      tags.push('on the last card; the user said this was not the one they meant');
    const tag = tags.length ? ` [${tags.join('; ')}]` : '';
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
  todo: ['due_day', 'due_time', 'name', 'body_add'],
  habit: ['name', 'frequency', 'logged'],
  note: ['name', 'due_day', 'due_time', 'body_add'],
};

/**
 * Turn the model's answer into a card the app can show, or null.
 * Pure, so it is unit tested; matchEntity below does the fetching. Items are
 * looked up by the short key the model was shown or by their full id.
 */
export function decideCard(answer, candidates, opts = {}) {
  if (!answer || typeof answer !== 'object') return null;
  const byId = itemIndex(candidates);
  const confidence = Number(answer.confidence) || 0;
  // an item the user has just said was not the one is never offered again
  const usable = (id) => byId.has(id) && !byId.get(id).declined;
  const knownIds = (list) =>
    Array.isArray(list) ? [...new Set(list.filter(usable).map((id) => byId.get(id).id))] : [];
  const choice = (ids) => ({
    kind: 'choose',
    candidates: ids.slice(0, 3).map((id) => byId.get(id)),
  });
  const confirm = (id) => ({ kind: 'view', entity: byId.get(id), intent: 'confirm' });
  // the model asks only when they want something to happen to one of these:
  // two or more still open are the choice, one left (the other turned down) is
  // shown to confirm, and none named falls back to the ones it considered
  if (answer.ask) {
    const named = knownIds(answer.candidates);
    const askIds = named.length ? named : knownIds(answer.considered);
    if (askIds.length >= 2) return choice(askIds);
    if (askIds.length === 1) return confirm(askIds[0]);
  }
  const askIds = knownIds(answer.candidates);
  const decided = decideReferred();
  if (decided) return decided;
  // They have just turned a card down, so what they asked for still stands and
  // the item they meant is one of the others the model considered: those are the
  // choice, a single one is shown to confirm, and none means nothing else fits.
  if (opts.afterDecline) {
    const others = knownIds(answer.considered);
    if (others.length >= 2) return choice(others);
    if (others.length === 1) return confirm(others[0]);
  }
  return null;

  function decideReferred() {
    if (!answer.refers || !usable(answer.entity_id)) return null;
    const entity = byId.get(answer.entity_id);
    const intent = answer.intent;
    if (confidence < CONFIDENCE_FLOOR) {
      // Not sure enough to propose a change. The model's own alternatives (the
      // ones it named, else the ones it considered while reading the list) are the
      // choice; otherwise the one item it named is shown and Gremly asks whether
      // that is the one. Never a list padded with unrelated items.
      const others = (askIds.length >= 2 ? askIds : knownIds(answer.considered)).filter(
        (id) => id !== entity.id,
      );
      if (others.length >= 1) {
        const ids = [entity.id, ...others].slice(0, 3);
        return { kind: 'choose', candidates: ids.map((id) => byId.get(id)) };
      }
      if (intent === 'edit' || intent === 'complete')
        return { kind: 'view', entity, intent: 'confirm' };
      return null;
    }
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
    if (intent === 'logged' && entity.type === 'habit') {
      const raw = answer.change?.value;
      const days = [
        ...new Set(
          (Array.isArray(raw) ? raw : [raw])
            .map((d) => String(d ?? '').trim())
            .filter((d) => ISO_DAY.test(d)),
        ),
      ].sort();
      if (days.length === 0) return { kind: 'mention', entity, change: null, confidence };
      // days already counted are left out; all of them counted: no card, the reply says so
      const open = days.filter((d) => !(entity.logged_days || []).includes(d));
      if (open.length === 0)
        return {
          kind: 'mention',
          entity,
          change: null,
          confidence,
          loggedAlready: days[days.length - 1],
        };
      // a check-in never interrupts: the card sits under a normal reply. The
      // latest day is `to`, so an app that knows only one day still logs that one.
      return {
        kind: 'edit',
        entity,
        change: {
          field: 'logged',
          from: null,
          to: open[open.length - 1],
          ...(open.length > 1 ? { days: open } : {}),
        },
        confidence,
        inPassing: true,
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

// how far back habit check-ins are read
const LOG_WINDOW_DAYS = 14;

/** YYYY-MM-DD plus n days. */
export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Monday that starts the week holding this day. */
export function weekStartOf(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * How a habit is going, in words for the reply: what was logged this week
 * against its target, or over the last seven days for a daily one.
 */
export function habitProgressWords(h, todayIso) {
  if (!todayIso) return '';
  const logged = (h.logged_days || []).filter((d) => d <= todayIso);
  // cadence says how the target is counted (his data keeps period_unit as
  // "day" even for a weekly target, so cadence is what decides)
  const daily = h.cadence === 'daily' || (!h.cadence && /daily/i.test(h.frequency || ''));
  if (daily) {
    const from = addDays(todayIso, -6);
    const n = logged.filter((d) => d >= from).length;
    return `logged ${n} of the last 7 days${n ? `, last ${dayInWords(logged[0], todayIso)}` : ''}`;
  }
  const start = weekStartOf(todayIso);
  const week = logged.filter((d) => d >= start);
  const target = h.cadence === 'weekly' || !h.cadence ? h.target_per_period : null;
  const days = week.map((d) => dayInOneWord(d, todayIso)).join(', ');
  const base = week.length
    ? `logged this week: ${days}${target ? ` (${week.length} of ${target})` : ''}`
    : `nothing logged this week${target ? ` (target ${target})` : ''}`;
  const last = !week.length && logged[0] ? `, last ${dayInWords(logged[0], todayIso)}` : '';
  return base + last;
}

/** Days from a to b, both YYYY-MM-DD; positive when b is later. */
export function daysBetween(a, b) {
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
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const weekdayOf = (day) => {
  const [y, m, dd] = day.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
};

/**
 * A day as the reply should say it: its weekday and date in words, led by
 * today, tomorrow or yesterday when it is one of those, so the reply never has
 * to work out a weekday from a date. The year shows only when it is not this one.
 */
export function dayInWords(day, todayIso) {
  if (!day) return '';
  if (!ISO_DAY.test(day)) return day;
  const [y, m, dd] = day.split('-').map(Number);
  const known = todayIso && ISO_DAY.test(todayIso);
  const sameYear = !known || todayIso.slice(0, 4) === day.slice(0, 4);
  const date = `${weekdayOf(day)} ${dd} ${MONTH_NAMES[m - 1]}${sameYear ? '' : ` ${y}`}`;
  if (!known) return date;
  const d = daysBetween(todayIso, day);
  if (d === 0) return `today, ${date}`;
  if (d === 1) return `tomorrow, ${date}`;
  if (d === -1) return `yesterday, ${date}`;
  return date;
}

/** A day in one word, for lists of days: today, yesterday, tomorrow or its weekday. */
function dayInOneWord(day, todayIso) {
  if (!ISO_DAY.test(day || '')) return day || '';
  const d = todayIso && ISO_DAY.test(todayIso) ? daysBetween(todayIso, day) : null;
  if (d === 0) return 'today';
  if (d === -1) return 'yesterday';
  if (d === 1) return 'tomorrow';
  return weekdayOf(day);
}

function itemLine(c, todayIso) {
  let when = '';
  if (c.type === 'habit') {
    const progress = habitProgressWords(c, todayIso);
    when = `${c.frequency ? `, ${c.frequency}` : ''}${progress ? `, ${progress}` : ''}`;
  } else if (c.due_day && c.type === 'note') {
    when = `, ${dayInWords(c.due_day, todayIso)}${c.due_time ? ` at ${c.due_time}` : ''}`;
  } else if (c.due_day) {
    const overdue = todayIso && c.due_day < todayIso;
    when = `, ${overdue ? 'was due' : 'due'} ${dayInWords(c.due_day, todayIso)}${c.due_time ? ` at ${c.due_time}` : ''}${overdue ? ' (overdue)' : ''}`;
  } else when = c.type === 'todo' ? ', no day set' : '';
  return `- ${c.type} "${c.title}"${when}`;
}

/**
 * The reply's knowledge of the user's own items for this turn: the ones the
 * matcher says the message is about, the ones that need attention anyway, and
 * whether a card goes with this reply. Gremly may speak about the items and
 * offer the natural next step; the card and the pill are where a change is
 * confirmed, so the reply never claims one, and when no card goes with the
 * reply it is told so, because then nothing can change from this turn.
 * In a feelings turn only the item they themselves brought up is passed on.
 * Present every turn the matcher ran, so the rules hold when the list is empty.
 */
export function theirItemsPromptSection(match, todayIso, opts = {}) {
  // when a card has taken the reply over, the card is the whole turn
  if (opts.mode === 'entity_card') return '';
  if (!match) return '';
  const strict = NO_ATTENTION_MODES.has(opts.mode);
  const related = (match.related || [])
    .filter((c) => c && c.title && (!strict || c.referred || c.shown))
    .slice(0, RELATED_MAX);
  const relatedIds = new Set(related.map((c) => c.id));
  const attention = strict ? [] : (match.attention || []).filter((c) => !relatedIds.has(c.id));
  const anchor = opts.anchor && opts.anchor.title && !opts.anchor.gone ? opts.anchor : null;
  const parts = [
    '=== WHAT THEY HAVE ON ===',
    "Their own items, as they stand right now. You know these exist. When one bears on what they said, say so plainly and in passing, in your own words: that it is already on their list, when it is, that it is overdue. You may offer the natural next step for the item they are talking about (moving it, marking it done) as a plain question in your own words; the app handles the confirmation, so never mention a card, a button or tapping, never say you will do anything to it yourself, never say a change has been made, and never offer to change several at once: one item per offer. Never offer to move something else to make room. Never offer to change an item to what it already is; when what they say matches how it is set, say that it already is. Never say something is on their list unless it is listed here and is the very thing they mean: an item that only shares a word or a subject with what they said is a different thing. If they ask for something to be done to an item you cannot see here, ask which one they mean. An item named anywhere else in what you know about them, such as their life map, earlier chats or upcoming dates, is history: it may since have been done, archived or renamed, so never say it is on their list and never offer to change it unless it is listed here. Never read the list out, never mention more than one or two, and leave them alone when the conversation is elsewhere. An overdue item is not on any particular day, so never present it as part of a day's plan. A habit line shows what has been logged; when they say they did a habit on a day that is already logged, say it is already counted, and you may speak to how the habit is going from what is logged.",
  ];
  if (anchor) {
    parts.push(
      `This chat was opened about their ${anchor.type} "${String(anchor.title).slice(0, 120)}". They know it is on their list, so never tell them it is; it counts as one of the items you know exist even when it is not listed below.`,
    );
  }
  parts.push('What they are talking about:');
  if (related.length)
    parts.push(
      ...related.map(
        (c) =>
          `${itemLine(c, todayIso)}${
            anchor && c.id === anchor.id ? ' (the item this chat was opened about)' : ''
          }`,
      ),
    );
  else parts.push('- none of their items, as far as the app can tell');
  if (attention.length) {
    parts.push('Overdue or coming up this week:');
    parts.push(...attention.map((c) => itemLine(c, todayIso)));
  }
  if (!opts.card) {
    parts.push(
      'No card goes with this reply. For this turn, the items listed above are the only ones of theirs you know exist, whatever they call them; anything else they name, the app has not found among their current todos, notes and habits. So nothing changes from this reply, and you never say a change was made, that something is done or off their list, that you will do it, or that you will add or save anything; the app offers new things for saving on its own. When they ask for something to be done to an item: if it is listed above, ask in plain words what should change or whether they want it changed; if it is not, say you cannot see it on their list right now and ask which one they mean, or whether it is new. When they tell you something is finished and it is not listed above, hear the news, but do not say it is marked done. An offer for an item listed above is fine; the change happens on a later turn, through the app, once they say yes. So never tell them you cannot change their items: changes happen through the app once they say yes.',
    );
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
 *   anchor: the item the chat was opened about, as it is now (from the list,
 *           else looked up on its own), flagged gone when it is no longer
 *           theirs; null when the chat has no anchor
 * @param {{env: object, userId: string, message: string, previousExchange?: object, exchanges?: Array, todayStr: string, todayIso?: string, items?: Array, recent?: object|null, anchor?: object|null}} p
 *   exchanges: the last few {userMsg, assistantMsg} pairs, oldest first
 *   recent: the item on the last card the app showed in this chat, if any
 *   anchor: the item this chat was opened about ({id, type, title}), if any
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
  anchor,
}) {
  try {
    if (!models().flags.entityCards) return null;
    const all = items ? [...items] : await fetchEntities(env, userId, todayIso || null);
    // the item this chat was opened about, as it is now: from the list, else
    // looked up on its own (then it joins the list the extraction reuses)
    let anchorItem = null;
    if (anchor && anchor.id) {
      const listed = all.find((i) => i && i.id === anchor.id);
      const found = listed || (items ? null : await fetchAnchorItem(env, userId, anchor, todayIso));
      if (found && !listed) all.push(found);
      anchorItem =
        found === null
          ? { ...anchor, gone: true }
          : found
            ? { ...found }
            : // the lookup failed: known only as the app sent it
              { ...anchor };
    }
    const candidates = candidatesFor(message, all, recent || null, MATCH_ITEMS_MAX, anchorItem);
    const result = {
      all,
      card: null,
      mention: null,
      related: [],
      attention: attentionItems(all, todayIso || null),
      anchor: anchorItem,
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
    // the message right after they turned a card down
    const afterDecline = recent?.status === 'declined' && (recent.turns_ago ?? 0) === 0;
    let decision = decideCard(answer, candidates, { afterDecline });
    // A card that proposes no change never repeats for the item on the last
    // card while that card is still in view: only a new change earns a new one.
    if (
      decision?.kind === 'view' &&
      recent?.id &&
      decision.entity?.id === recent.id &&
      recent.status !== 'declined' &&
      (recent.turns_ago ?? 1) <= RECENT_CARD_TURNS
    ) {
      decision = { kind: 'mention', entity: decision.entity, change: null, confidence: 100 };
    }
    if (decision?.kind === 'mention') result.mention = decision;
    else if (decision) result.card = decision;
    result.related = aboutItems(answer, candidates, decision?.kind === 'choose' ? null : decision);
    result.answer = answer;
    console.log('[EntityMatch]', {
      items: candidates.length,
      recent: !!recent,
      anchored: anchorItem ? (anchorItem.gone ? 'gone' : true) : false,
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

export const LATE_CARD_CHECK_PROMPT = `You check one change the app is about to offer a user of a personal productivity app after a turn of their conversation with Gremly, their companion. The change was proposed by a reader of the whole conversation, and it is offered only when the user asked for it or decided it.

You are given today's date, the last few exchanges, the user's latest message, their item as it is set now, and the proposed change. The answer is yes only when the user's own words, in the latest message or the exchanges before it, decide or ask for this change to this item, or say yes to Gremly offering it. A new day or time needs them to give that day or time. Done needs them to say it is done. A check-in needs them to say they did it on each of those days. A new name or frequency needs them to say it. An addition to the item's text needs the text to be something they told about its subject that is worth keeping with it, in their words; their questions, how they feel, how busy they are, and anything only Gremly said are not additions. A problem with the item that they have not resolved is not a change. When in doubt, the answer is no.

Return ONLY JSON: {"offer":true|false}`;

/**
 * The last word on a late card: one small call, only when the extraction has
 * found a change to offer, with the conversation in view. A change nobody
 * asked for is worse than no offer, so a failed check offers nothing.
 */
export async function offerLateCard({ card, message, exchanges, todayStr, todayIso }) {
  if (!card || card.kind !== 'edit' || !card.entity || !card.change) return false;
  try {
    const lines = [`Today is ${todayStr}.`];
    const recent = (Array.isArray(exchanges) ? exchanges : [])
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
    lines.push(`\nLATEST MESSAGE:\n${String(message || '').slice(0, 600)}`);
    lines.push(`\nTHEIR ITEM: ${cardItem(card.entity, todayIso || null)}`);
    lines.push(`PROPOSED CHANGE: ${changeInWords(card, todayIso || null)}`);
    const res = await helperFetch('entity_match', {
      messages: [
        { role: 'system', content: LATE_CARD_CHECK_PROMPT },
        { role: 'user', content: lines.join('\n') },
      ],
      max_tokens: 50,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!res.ok) return false;
    const json = await res.json();
    const answer = parseJson(json.choices?.[0]?.message?.content || '');
    return answer?.offer === true;
  } catch (err) {
    console.error('[EntityMatch] late card check failed', String(err).slice(0, 200));
    return false;
  }
}

const SAME_THING_PROMPT = `You check proposed new items against what a user already has in a personal productivity app, so nothing they already track is saved twice.

You are given the user's existing items (todos, habits and notes, with ids) and a list of proposed new items. For each proposed item decide whether it is the same thing as one existing item or new. Two things are the same when doing, keeping or noting one would make the other redundant: the same task in other words, the same appointment or event, or a detail of a subject one of the notes already covers. Sharing a subject with a listed item does not make something that item: if they would still need to do or keep the proposed thing after the listed item was done, it is new. When in doubt, it is new.

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
    // The check has the last word on each item it answers for: the extractor
    // marks what it is unsure of, and here that is judged against the whole list.
    for (const r of results) {
      const e = news[Number(r?.index)];
      if (!e) continue;
      const hit = r?.same_as
        ? byKey.get(String(r.same_as)) || live.find((c) => c.id === r.same_as)
        : null;
      if (hit) e.same_as = hit.key;
      else delete e.same_as;
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
    (card.kind === 'view' && (card.intent === 'edit' || card.intent === 'confirm'));
  if (!takesOver) return triage;
  return {
    ...triage,
    mode: 'entity_card',
    modeBeforeCard: triage.mode,
    depth: 'brief',
    search: 'none',
  };
}

function changeInWords(card, todayIso = null) {
  const f = card.change.field;
  const day = card.entity?.due_day || card.entity?.target_date || null;
  if (f === 'completed') return 'mark it done';
  if (f === 'due_day') return `move it to ${dayInWords(card.change.to, todayIso)}`;
  if (f === 'due_time')
    return `change its time to ${card.change.to}${day ? ` on ${dayInWords(day, todayIso)}` : ''}`;
  if (f === 'name') return `rename it to ${card.change.to}`;
  if (f === 'frequency') return `change its frequency to ${card.change.to}`;
  if (f === 'body_add') return `add to it: ${card.change.to}`;
  if (f === 'logged') {
    const days = card.change.days?.length ? card.change.days : [card.change.to];
    return `log it for ${wordsList(days.map((d) => dayInWords(d, todayIso)))}`;
  }
  return `update it to ${card.change.to}`;
}

/** Several things in one phrase: a, b and c. */
function wordsList(parts) {
  if (parts.length < 2) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Their item as the card shows it: its kind and title, with how it is set now, in words. */
function cardItem(e, todayIso = null) {
  const named = `their ${e.type} "${e.title}"`;
  if (e.type === 'habit') return e.frequency ? `${named} (${e.frequency})` : named;
  const day = e.due_day || e.target_date || null;
  const at = e.due_time ? ` at ${e.due_time}` : '';
  if (day) return `${named} (${e.type === 'todo' ? 'due ' : ''}${dayInWords(day, todayIso)}${at})`;
  return e.type === 'todo' ? `${named} (no day set)` : named;
}

// What a tapped card may have changed, as the app sends it.
const APPLIED_FIELDS = new Set([...Object.values(FIELDS).flat(), 'completed', 'body']);

/** The change the user said yes to, from what the app sent, or null (older apps send none). */
function appliedChangeOf(recent) {
  const c = recent?.card?.kind === 'edit' ? recent.card.change : null;
  if (!c || !APPLIED_FIELDS.has(c.field)) return null;
  const to = c.to == null ? '' : String(c.to).slice(0, 300);
  if (!to && c.field !== 'completed') return null;
  if (c.field === 'due_day' && !ISO_DAY.test(to)) return null;
  const days = Array.isArray(c.days) ? c.days.filter((d) => ISO_DAY.test(String(d))) : [];
  return {
    field: c.field,
    from: c.from == null ? null : String(c.from).slice(0, 300),
    to,
    ...(days.length ? { days } : {}),
  };
}

/**
 * What became of the last card in this chat, so a follow up such as "did you
 * change it?" gets a truthful answer. The app sends the item with its status.
 */
export function recentCardPromptSection(recent, todayIso = null) {
  if (!recent || !recent.id || !recent.title || !ENTITY_TYPES.has(recent.type)) return '';
  const item = `their ${recent.type} "${String(recent.title).slice(0, 120)}"`;
  if (recent.status === 'applied') {
    const done =
      'If they ask about that change, answer that yes, it was made, and say what the item is now, without mentioning the card or tapping. Never offer to make it again, and do not tell them to tap or confirm anything.';
    const change = appliedChangeOf(recent);
    if (change) {
      // the item as the card showed it (before), and the change they said yes to
      const card = { entity: recent, change };
      return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${cardItem(recent, todayIso)}, proposing to ${changeInWords(card, todayIso)}. They tapped Yes, so that change has been made: what this says about the item is how it was before; wherever else this prompt shows the item, it shows it as it is now, after the change. ${done}`;
    }
    // older apps send the closing line the app showed, written when they tapped
    const what = recent.summary ? ` The app told them then: ${String(recent.summary).slice(0, 160)}` : '';
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item}; they tapped Yes, so that change has been made.${what} Wherever else this prompt shows the item, it shows it as it is now, after the change. ${done}`;
  }
  if (recent.status === 'undone') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item}; they confirmed a change and then undid it, so the item is as it was.`;
  }
  if (recent.status === 'declined') {
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} and they said it was not the one they meant. Do not offer that item again; ask which one they mean, or help them say it another way.`;
  }
  if (recent.status === 'pending') {
    // what the card was for, when the app says (older apps send only the status)
    const kind = recent.card?.kind;
    if (kind === 'view' && recent.card.already) {
      return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} because it was already set the way they asked. Nothing needed to change and nothing is waiting on them; if they ask whether it changed, say it was already that way.`;
    }
    if (kind === 'view' && recent.card.intent === 'confirm') {
      return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} to check it was the one they meant, and they have not said. Nothing about it has changed.`;
    }
    if (kind === 'view' && recent.card.intent === 'edit') {
      return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} because they wanted to change it without saying what to. Nothing about it has changed; it changes once they say what should change and confirm it.`;
    }
    if (kind === 'view') {
      return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} so they could see it. It proposed no change, so nothing is waiting on them and nothing about it has changed.`;
    }
    return `\n\n=== LAST CARD ===\nEarlier in this chat the app showed the user a card for ${item} and they have not tapped it. Nothing about it has changed; if they ask, it is waiting on their tap.`;
  }
  return '';
}

/**
 * What the reply knows about the item this chat was opened about. The user
 * chose it, so they know it exists: the reply talks it through with them and
 * never tells them it is on their list. The chat may move on, and then the
 * reply follows them. When a card has taken the turn over, only that they know
 * it exists is said, so the card's short reply stays short.
 */
export function anchorPromptSection(anchor, todayIso, opts = {}) {
  if (!anchor || !anchor.id || !anchor.title || !ENTITY_TYPES.has(anchor.type)) return '';
  const title = String(anchor.title).slice(0, 120);
  const kind =
    anchor.type === 'note' && anchor.subtype === 'journal' ? 'journal entry' : anchor.type;
  const head = '\n\n=== WHAT THIS CHAT IS ABOUT ===\n';
  if (anchor.gone) {
    return `${head}The user opened this chat to talk about their ${kind} "${title}", which is no longer among their current items: it may have been finished, archived or deleted. Talk about it if they want to; if they ask for something to be done to it, say you cannot see it on their list now.`;
  }
  const known = `The user opened this chat from their ${kind} "${title}" to talk it through, so they know it exists and is on their list: never tell them it is on their list or already tracked, never offer to add or save it, and never ask whether it is new.`;
  if (opts.mode === 'entity_card') return `${head}${known}`;
  const detail = opts.detailText ? `\n${opts.detailText}\n${workFromIt(anchor.type)}` : '';
  return `${head}${known} Until the conversation moves on, what they say is about this item: talk it through with them and help with whatever they need about it. When they move on to something else, follow them and leave this item alone.\n${itemLine(anchor, todayIso)}${detail}`;
}

/**
 * How the reply uses what the item holds: it builds on it, and now and then
 * offers something it leaves open. What they settle can be added to a note or
 * a todo (the Save items pill offers that after the reply); a habit holds no
 * text to add to.
 */
function workFromIt(type) {
  const add =
    type === 'habit'
      ? ''
      : ' What they settle about it can be added to it: the app offers that after your reply, so never say you have added it or will.';
  return `Work from what it already holds: build on it rather than asking them for what is already there, and never read it back to them in full. Now and then, when the moment suits it, suggest something it leaves open that they could talk through.${add}`;
}

/**
 * Everything the reply is told about the user's items for one turn, in order:
 * the card under the reply, what became of the last card, the item the chat
 * was opened about (with what it holds, itemDetail.js, when the caller read
 * it), and what they have on. The Worker's chat paths and the
 * scenario runner all build it here, so the runner reads what production reads.
 */
export function turnItemSections({
  match,
  card,
  recent,
  anchor = null,
  mode,
  todayIso,
  detailText = '',
}) {
  let out = '';
  if (card) out += entityCardPromptSection(card, { anchorId: anchor?.id || null, todayIso });
  out += recentCardPromptSection(recent, todayIso);
  out += anchorPromptSection(anchor, todayIso, { mode, detailText });
  out += theirItemsPromptSection(match, todayIso, { mode, card, anchor });
  return out;
}

/** The section added to the reply prompt when a card is being shown. */
export function entityCardPromptSection(card, opts = {}) {
  if (!card) return '';
  const todayIso = opts.todayIso || null;
  const item = card.entity ? cardItem(card.entity, todayIso) : '';
  const change = card.change ? changeInWords(card, todayIso) : '';
  const never =
    "Nothing has been changed; the user decides with one tap on the card. Never say you have changed, moved, updated or saved anything, never say you will set anything up, and never mention a card, a button or tapping. Do not repeat the item's details, do not give advice, and do not use a list or numbered steps.";
  if (card.kind === 'edit' && card.inPassing) {
    // the item a chat was opened about is one they know they have
    const say =
      opts.anchorId && card.entity.id === opts.anchorId
        ? `offer to ${change} if they want`
        : `let them know that item is already on their list and you can ${change} if they want`;
    return `\n\n=== ENTITY CARD ===\nBecause of what they just said, the app is showing a card under your reply for ${item}, proposing to ${change}. Nothing has changed; they decide with one tap. Reply to what they said the way you normally would, and in one clause, in your own words, ${say}. Never mention a card, a button or tapping, never say you will do anything to it yourself, and never say it is done or updated.`;
  }
  if (card.kind === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for ${item} proposing to ${change}. ${never} Reply with one short, warm line asking whether that is the one, and stop.`;
  }
  if (card.kind === 'view' && card.intent === 'edit') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for ${item}. They want to change it but have not said what to. ${never} Reply with one short line asking what should change, such as its day, its time or its name, and stop.`;
  }
  if (card.kind === 'view' && card.intent === 'confirm') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for ${item}, which may be the one they mean. ${never} Reply with one short line asking whether that is the one, and stop.`;
  }
  if (card.kind === 'view' && card.already) {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for ${item} under your reply. It is already set the way they asked, so nothing needs to change; say that in one short line.`;
  }
  if (card.kind === 'view') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user a card for ${item} under your reply. Refer to it naturally; do not repeat its details, and do not claim to have changed anything.`;
  }
  if (card.kind === 'choose') {
    return `\n\n=== ENTITY CARD ===\nThe app is showing the user ${card.candidates.length} of their items that might be the one they mean, so they can pick with a tap. ${never} Reply with one short line asking which one they mean, without naming them, and stop.`;
  }
  return '';
}
