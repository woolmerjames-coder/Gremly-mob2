// ============================================================================
// itemDetail.js: everything one item holds, for a chat about that item.
//
// A chat opened about a todo, habit or note (the item chat, Talk it through)
// carries the item as its anchor. The matcher knows the item by its title and
// day; the reply also needs what it holds: a note's text, a todo's notes and
// list, a habit's check-ins and smallest version, what has changed on it, and
// what earlier chats about it covered. This reads that from the item's row and
// puts it into words. Nothing here judges what the user said.
//
// It also suggests what to talk about when a chat about a note opens: the
// helper model reads the note and offers a few starters drawn from it, kept
// until the note changes.
// ============================================================================

import { addDays, dayInWords, daysBetween, noteDay } from './entityMatch.js';
import { helperFetch } from './helperClient.js';

// what a reply is given at most from each kind of text
const TEXT_MAX = 1500;
const NOTES_MAX = 600;
const LIST_MAX = 15;
const HISTORY_MAX = 5;
const SUMMARY_MAX = 500;
// habit check-ins read for the item in full (the matcher reads two weeks)
const DETAIL_LOG_DAYS = 28;

const DETAIL = {
  todo: {
    table: 'todos',
    select:
      'id,name,title,body,notes,tags,list_items,subtype,due_day,due_time,time_estimate_minutes,time_window,commitment_note,sweep_reschedule_count,created_at,views,chat_summary,space_id',
  },
  habit: {
    table: 'habits',
    select:
      'id,name,title,frequency,notes,tags,subtype,replacement_text,floor_note,commitment_note,time_window,time_estimate_minutes,created_at,last_completed_at,views,chat_summary,space_id',
  },
  note: {
    table: 'notes',
    select:
      'id,title,body,tags,list_items,subtype,mood,target_date,event_time,end_time,location,created_at,views,chat_summary,space_id',
  },
};

const clip = (s, max) => (s.length > max ? `${s.slice(0, max).trimEnd()}...` : s);
const textOf = (v, max) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? clip(s, max) : null;
};
const clockTime = (v) => (v ? String(v).slice(0, 5) : null);

/** The day an instant falls on where the user is. */
function localDay(instant, timezone) {
  if (!instant) return null;
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** The last few changes kept on the item (lib/chat/changeHistory.ts writes them). */
function historyOf(views, timezone) {
  const log = Array.isArray(views?.change_log) ? views.change_log : [];
  return log
    .filter((e) => e && typeof e.field === 'string')
    .slice(-HISTORY_MAX)
    .map((e) => ({
      field: e.field,
      from: e.from ?? null,
      to: e.to ?? null,
      was: typeof e.was === 'string' ? e.was : null,
      now: typeof e.now === 'string' ? e.now : null,
      day: localDay(e.at, timezone),
    }));
}

/**
 * One item in full, from its row. Pure, so the scenario runner builds the same
 * thing from its spec items. opts: loggedDays (a habit's check-ins), spaceName,
 * timezone.
 */
export function toDetail(row, type, opts = {}) {
  if (!row || !DETAIL[type]) return null;
  const tz = opts.timezone || 'UTC';
  const list = (Array.isArray(row.list_items) ? row.list_items : [])
    .filter((i) => i && typeof i.text === 'string' && i.text.trim())
    .slice(0, LIST_MAX)
    .map((i) => ({ text: clip(i.text.trim(), 160), done: !!(i.checked ?? i.done) }));
  const tags = (Array.isArray(row.tags) ? row.tags : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, 8);
  const base = {
    id: row.id,
    type,
    title: String(row.name || row.title || '').trim(),
    subtype: row.subtype || null,
    space: opts.spaceName || null,
    created_day: localDay(row.created_at, tz),
    body: textOf(row.body, TEXT_MAX),
    notes: textOf(row.notes, NOTES_MAX),
    list,
    tags,
    history: historyOf(row.views, tz),
    summary: textOf(row.chat_summary, SUMMARY_MAX),
    time_window: ['morning', 'evening', 'day'].includes(row.time_window) ? row.time_window : null,
    estimate: Number(row.time_estimate_minutes) > 0 ? Number(row.time_estimate_minutes) : null,
  };
  if (type === 'todo') {
    return {
      ...base,
      due_day: row.due_day || null,
      due_time: clockTime(row.due_time),
      // their own words on why it matters, written with a Lock In before it was removed
      matters: textOf(row.commitment_note, NOTES_MAX),
      put_off: Number(row.sweep_reschedule_count) > 0 ? Number(row.sweep_reschedule_count) : 0,
    };
  }
  if (type === 'habit') {
    return {
      ...base,
      frequency: row.frequency || null,
      replacement: textOf(row.replacement_text, NOTES_MAX),
      floor: textOf(row.floor_note, NOTES_MAX),
      matters: textOf(row.commitment_note, NOTES_MAX),
      logged_days: [...new Set(opts.loggedDays || [])].sort().reverse(),
      last_done_day: localDay(row.last_completed_at, tz),
    };
  }
  return {
    ...base,
    due_day: noteDay(row),
    due_time: clockTime(row.event_time || row.views?.event_time),
    location: textOf(row.location, 160),
    mood: (Array.isArray(row.mood) ? row.mood : []).filter((m) => typeof m === 'string' && m),
  };
}

/** Minutes as a reply would say them. */
function minutesInWords(n) {
  if (n < 60) return `${n} minutes`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minutes` : ''}`;
}

/** Text of theirs, on one line, quoted. */
const quoted = (s) => `"${String(s).replace(/\s*\n+\s*/g, ' / ')}"`;

/** One kept change in words, with the day it was made. */
function changeInWords(h, todayIso) {
  const when = h.day ? ` (${dayInWords(h.day, todayIso)})` : '';
  if (h.field === 'due_day')
    return `moved ${h.from ? `from ${dayInWords(h.from, todayIso)} ` : ''}to ${dayInWords(h.to, todayIso)}${when}`;
  if (h.field === 'due_time') return `time changed to ${h.now || h.to}${when}`;
  if (h.field === 'name') return `renamed to "${h.to}"${when}`;
  if (h.field === 'frequency') return `now repeats ${h.to}${when}`;
  if (h.field === 'body_add') return `added to it${when}`;
  if (h.field === 'body') return `its text rewritten${when}`;
  return `${h.field} changed${when}`;
}

const NOTE_KINDS = {
  event: 'an event',
  journal: 'a journal entry',
  idea: 'an idea',
  reference: 'something kept for reference',
  list: 'a list',
};

/**
 * What the item holds beyond its title and day, as lines for the reply.
 * Empty when there is nothing more than the matcher already says.
 */
export function itemDetailText(d, todayIso) {
  if (!d) return '';
  const lines = [];
  if (d.type === 'note' && NOTE_KINDS[d.subtype]) lines.push(`- it is ${NOTE_KINDS[d.subtype]}`);
  if (d.type === 'habit' && d.subtype === 'break_habit')
    lines.push('- it is a habit they are trying to stop');
  if (d.space) lines.push(`- it sits in their space "${d.space}"`);
  if (d.created_day && todayIso) {
    const age = daysBetween(d.created_day, todayIso);
    lines.push(
      `- added ${dayInWords(d.created_day, todayIso)}${age > 1 ? `, ${age} days ago` : ''}`,
    );
  }
  if (d.body) lines.push(`- what it says: ${quoted(d.body)}`);
  if (d.notes) lines.push(`- its notes: ${quoted(d.notes)}`);
  if (d.list?.length)
    lines.push(`- its list: ${d.list.map((i) => `${i.text}${i.done ? ' (ticked)' : ''}`).join('; ')}`);
  if (d.location) lines.push(`- where: ${d.location}`);
  if (d.mood?.length) lines.push(`- how they felt: ${d.mood.join(', ')}`);
  if (d.tags?.length) lines.push(`- tagged ${d.tags.join(', ')}`);
  if (d.estimate) lines.push(`- takes about ${minutesInWords(d.estimate)}`);
  if (d.time_window)
    lines.push(`- best done ${d.time_window === 'day' ? 'during the day' : `in the ${d.time_window}`}`);
  if (d.matters) lines.push(`- why it matters to them, in their words: ${quoted(d.matters)}`);
  if (d.put_off) lines.push(`- put off in Sweep ${d.put_off === 1 ? 'once' : `${d.put_off} times`}`);
  if (d.type === 'habit') {
    if (d.replacement) lines.push(`- what they do instead: ${quoted(d.replacement)}`);
    if (d.floor) lines.push(`- the smallest version that still counts: ${quoted(d.floor)}`);
    if (todayIso) {
      const since = addDays(todayIso, -(DETAIL_LOG_DAYS - 1));
      const recent = (d.logged_days || []).filter((x) => x >= since && x <= todayIso);
      lines.push(
        recent.length
          ? `- checked in ${recent.length} time${recent.length === 1 ? '' : 's'} in the last four weeks, last ${dayInWords(recent[0], todayIso)}`
          : `- no check-ins in the last four weeks${d.last_done_day ? `; last done ${dayInWords(d.last_done_day, todayIso)}` : ''}`,
      );
    }
  }
  if (d.history?.length)
    lines.push(`- changes made to it: ${d.history.map((h) => changeInWords(h, todayIso)).join('; ')}`);
  if (d.summary) lines.push(`- what earlier chats about it covered: ${d.summary}`);
  if (!lines.length) return '';
  return `What else it holds, as it is now:\n${lines.join('\n')}`;
}

const serviceHeaders = (env) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
});

/**
 * The item a chat is about, in full, read fresh each turn; null when it is not
 * a live item of theirs or the read fails (the reply then has the title only).
 */
export async function fetchItemDetail(env, userId, anchor, { todayIso, timezone } = {}) {
  const t = anchor && DETAIL[anchor.type];
  if (!t || !userId) return null;
  const headers = serviceHeaders(env);
  const get = async (path) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`detail read ${res.status}`);
    return res.json();
  };
  try {
    const rows = await get(
      `${t.table}?id=eq.${encodeURIComponent(anchor.id)}&owner_id=eq.${userId}&select=${t.select}&limit=1`,
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    const [space, logs] = await Promise.all([
      row.space_id
        ? get(`spaces?id=eq.${encodeURIComponent(row.space_id)}&select=name&limit=1`).catch(() => [])
        : Promise.resolve([]),
      anchor.type === 'habit' && todayIso
        ? get(
            `habit_progress?owner_id=eq.${userId}&habit_id=eq.${encodeURIComponent(anchor.id)}&occurred_day=gte.${addDays(todayIso, -(DETAIL_LOG_DAYS - 1))}&select=occurred_day&order=occurred_day.desc&limit=100`,
          ).catch(() => [])
        : Promise.resolve([]),
    ]);
    return toDetail(row, anchor.type, {
      spaceName: Array.isArray(space) ? space[0]?.name || null : null,
      loggedDays: (Array.isArray(logs) ? logs : [])
        .filter((l) => l?.occurred_day)
        .map((l) => String(l.occurred_day).slice(0, 10)),
      timezone,
    });
  } catch (err) {
    console.warn('[ItemDetail] read failed', String(err).slice(0, 120));
    return null;
  }
}

// ── Topics for a chat about a note ──────────────────────────────────────────

export const TOPICS_MAX = 4;
const TOPICS_TTL_SECONDS = 60 * 60 * 24 * 90;

export const ITEM_TOPICS_PROMPT = `You suggest what someone could talk through next about one of their own notes, in a chat with Gremly, the companion in their app. You are given the note as it is now.

Read it and suggest up to four things to talk about that would take it further: something it leaves open, a decision it is circling, a next step it points to, or a part worth going deeper on. Each one must come from what this note actually says, and never state anything about them that the note does not.

Each suggestion has a label, two to five words in sentence case, shown on a button, and a message: the words they send when they tap it, written as them speaking to Gremly in the first person, one short sentence that says which part of the note it is about. Use plain everyday words and no dashes as punctuation.

When the note says too little to suggest anything of its own, return an empty list.

Return only JSON: {"topics":[{"label":"...","message":"..."}]}`;

/** The note as the topics call reads it; also what decides whether its topics still hold. */
export function topicsSource(d) {
  if (!d || d.type !== 'note') return '';
  const parts = [];
  if (d.title) parts.push(`Title: ${d.title}`);
  if (NOTE_KINDS[d.subtype]) parts.push(`It is ${NOTE_KINDS[d.subtype]}.`);
  if (d.body) parts.push(`What it says: ${d.body}`);
  if (d.list?.length)
    parts.push(`Its list:\n${d.list.map((i) => `- ${i.text}${i.done ? ' (ticked)' : ''}`).join('\n')}`);
  return parts.join('\n');
}

/** Whether a note holds anything beyond its title to suggest from. */
export function hasContent(d) {
  return !!(d && (d.body || d.list?.length));
}

/** The model's answer as starters the app can show, or none. */
export function topicsFrom(answer) {
  const raw = Array.isArray(answer?.topics) ? answer.topics : [];
  const out = [];
  for (const t of raw) {
    const label = typeof t?.label === 'string' ? t.label.trim() : '';
    const message = typeof t?.message === 'string' ? t.message.trim() : '';
    if (!label || !message || label.length > 40 || message.length > 220) continue;
    out.push({ label, message });
    if (out.length >= TOPICS_MAX) break;
  }
  return out;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * type 'item-topics': up to four starters drawn from one of their notes, kept
 * (in CONTEXT_CACHE) until the note changes. { ok, topics: [{label, message}] };
 * an empty list means the app shows the usual starters.
 */
export async function handleItemTopics(body, env, userId) {
  const empty = { ok: true, topics: [] };
  const id = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
  if (!userId || body?.itemType !== 'note' || !/^[0-9a-f-]{8,64}$/i.test(id)) return empty;
  const detail = await fetchItemDetail(env, userId, { id, type: 'note' }, {});
  if (!hasContent(detail)) return empty;
  const source = topicsSource(detail);
  const key = `item-topics:v1:${userId}:${id}:${(await sha256(source)).slice(0, 24)}`;
  try {
    const cached = env.CONTEXT_CACHE ? await env.CONTEXT_CACHE.get(key, 'json') : null;
    if (Array.isArray(cached?.topics)) return { ok: true, topics: cached.topics, cached: true };
  } catch {
    // a cache miss is only a fresh call
  }
  try {
    const res = await helperFetch('item_topics', {
      messages: [
        { role: 'system', content: ITEM_TOPICS_PROMPT },
        { role: 'user', content: source },
      ],
      max_tokens: 400,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    if (!res.ok) return empty;
    const json = await res.json();
    let answer = null;
    try {
      answer = JSON.parse(json.choices?.[0]?.message?.content || '');
    } catch {
      answer = null;
    }
    const topics = topicsFrom(answer);
    if (env.CONTEXT_CACHE && answer) {
      await env.CONTEXT_CACHE.put(key, JSON.stringify({ topics }), {
        expirationTtl: TOPICS_TTL_SECONDS,
      }).catch(() => {});
    }
    return { ok: true, topics };
  } catch (err) {
    console.warn('[ItemTopics] failed', String(err).slice(0, 120));
    return empty;
  }
}
