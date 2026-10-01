/**
 * The reader: turns what a person did and said into dated facts in the ledger.
 *
 * It reads records in time order (new items, journals, completed todos, chat
 * messages, calendar entries, milestones, answers to Gremly's questions) and
 * asks a small model what they tell us about the person's life. Every fact it
 * writes cites one record it was shown. When a record changes what an earlier
 * fact means (a plan happened, moved or fell through), the fact is updated with
 * that record as the reason. When records disagree and the model cannot tell
 * which is right, it raises a question for the person instead of guessing.
 *
 * Code checks only that cited records and facts exist. All judgement is the model's.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, userTimezone, localDate, localDateTime, relativeDay, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';

export const READER_PROMPT_VERSION = 'reader-2026-09-30';

const MAX_RECORDS_PER_CALL = 60;
const MAX_CHARS_PER_CALL = 30000;
const MAX_OPEN_FACTS = 200;

const READER_SCHEMA = {
  type: 'object',
  properties: {
    new_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          subject: { type: 'string' },
          kind: { type: 'string' },
          about_date: { type: 'string', nullable: true },
          about_date_end: { type: 'string', nullable: true },
          date_confidence: { type: 'string', enum: ['exact', 'approximate', 'unknown'] },
          state: { type: 'string', enum: ['current', 'planned', 'happened', 'unconfirmed'] },
          source_ref: { type: 'string' },
          quote: { type: 'string' },
          private: { type: 'boolean' },
        },
        required: ['statement', 'subject', 'kind', 'date_confidence', 'state', 'source_ref', 'quote', 'private'],
      },
    },
    fact_updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact_ref: { type: 'string' },
          new_state: { type: 'string', enum: ['current', 'happened', 'changed', 'superseded', 'unconfirmed'] },
          reason: { type: 'string' },
          source_ref: { type: 'string' },
          replacement_statement: { type: 'string', nullable: true },
          replacement_about_date: { type: 'string', nullable: true },
          replacement_about_date_end: { type: 'string', nullable: true },
          replacement_state: { type: 'string', nullable: true, enum: ['current', 'planned', 'happened'] },
        },
        required: ['fact_ref', 'new_state', 'reason', 'source_ref'],
      },
    },
    confirmations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact_ref: { type: 'string' },
          source_ref: { type: 'string' },
        },
        required: ['fact_ref', 'source_ref'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          fact_ref: { type: 'string', nullable: true },
          source_ref: { type: 'string', nullable: true },
          proposed_change: { type: 'string', nullable: true },
        },
        required: ['question'],
      },
    },
  },
  required: ['new_facts', 'fact_updates', 'confirmations', 'questions'],
};

function readerSystemPrompt(today, person) {
  return `You keep a ledger of facts about one person's life for Gremly, a companion app. You are shown records the person made in the app, in the order they happened, and the facts the ledger already holds. Decide what the new records tell you.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

WHAT BELONGS IN THE LEDGER
- Facts a thoughtful friend would want to remember to understand what is going on in this person's life: plans and trips, commitments and deadlines, events that happened, people who matter and what is happening with them, ongoing situations, goals, routines they keep, and things they say they want or prefer.
- Not every record produces a fact. Routine chores, passing remarks and app housekeeping usually do not. Be selective; a short, accurate ledger is worth more than a long one.
- Write each statement in plain words, about the person, in the third person, as true as of the record's date. Keep it to one sentence.
- A statement says what the record shows. Whether a later record confirmed it is carried by the state, not written into the statement.
- Records that say the same thing produce one fact, not one per record.

EVIDENCE
- Every new fact cites exactly one record by its ref, and quotes the person's own words from that record (or its title).
- Lines marked as Gremly's are context to help you read the person's reply. They are never evidence: nothing Gremly said becomes a fact unless the person's own words state it.
- Resolve relative dates against the date of the record they appear in, not today's date. If a date cannot be pinned down, leave it empty and mark the confidence as unknown.

KEEPING THE LEDGER TRUE
- A plan is planned until a later record shows what happened. When a record shows a planned thing happened, moved, changed or fell through, update that fact and cite the record. If the details changed, give the replacement.
- When a record restates an existing fact, confirm it instead of adding a duplicate.
- When a record shows the same trip, event, milestone or plan as a fact the ledger holds, but at a different date or with a different outcome, the fact is no longer reliable as written. If the record makes clear it is the same thing, update the fact (changed, with the replacement). If it might be a separate occurrence, mark the fact unconfirmed and ask the person.
- When records disagree and you cannot tell which is right, ask the person one short, friendly question instead of choosing. Ask only when the answer bears on their life now or on something still ahead, measured against today's date. Differences about things long past are recorded as they are, without a question.
- Never mark a fact as happened just because its date has passed. Without a record, a passed plan stays as it is; it is simply no longer ahead.

${PRIVATE_RULES}
- Mark each new fact private or not by that meaning.

${WRITING_RULES}

Return only the structured result.`;
}

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Load every record for a user in [since, until), oldest first. */
export async function loadRecords(env, userId, sinceIso, untilIso) {
  const d = db(env);
  const w = (col) => `&${col}=gt.${encodeURIComponent(sinceIso)}&${col}=lte.${encodeURIComponent(untilIso)}`;
  const [created, completed, notes, habits, milestones, chats, calendar, overrides, answers] = await Promise.all([
    d.select(`todos?owner_id=eq.${userId}${w('created_at')}&select=id,title,body,notes,due_day,due_date,target_date,created_at,status&order=created_at.asc&limit=5000`),
    d.select(`todos?owner_id=eq.${userId}${w('completed_at')}&select=id,title,completed_at&order=completed_at.asc&limit=5000`),
    d.select(`notes?owner_id=eq.${userId}&external_source=is.null${w('created_at')}&select=id,title,body,subtype,journal_subtype,date,target_date,end_date,mood,created_at&order=created_at.asc&limit=5000`),
    d.select(`habits?owner_id=eq.${userId}${w('created_at')}&select=id,name,title,frequency,why_string,created_at&order=created_at.asc&limit=1000`),
    d.select(`space_milestones?owner_id=eq.${userId}${w('created_at')}&select=id,title,name,date,note,completed,completed_at,created_at&order=created_at.asc&limit=1000`),
    d.select(`scope_chat_messages?user_id=eq.${userId}&role=eq.user${w('created_at')}&select=id,chat_id,content,created_at&order=created_at.asc&limit=5000`),
    d.select(`synced_calendar_events?owner_id=eq.${userId}&archived=eq.false${w('created_at')}&select=id,title,location,start_at,end_at,is_all_day,created_at&order=created_at.asc&limit=5000`),
    d.select(`user_profile_overrides?user_id=eq.${userId}${w('created_at')}&select=id,action,fact_text,created_at&order=created_at.asc&limit=500`),
    d.select(`gremly_questions?user_id=eq.${userId}&status=eq.answered${w('answered_at')}&select=id,question,answer,answered_at&order=answered_at.asc&limit=500`),
  ]);
  return { created, completed, notes, habits, milestones, chats, calendar, overrides, answers };
}

/** The Gremly line right before each user chat message, as context only. */
async function priorGremlyLines(env, chatRows) {
  if (!chatRows.length) return new Map();
  const d = db(env);
  const chatIds = [...new Set(chatRows.map((r) => r.chat_id))];
  const minAt = chatRows[0].created_at;
  const maxAt = chatRows[chatRows.length - 1].created_at;
  const out = new Map();
  for (let i = 0; i < chatIds.length; i += 40) {
    const ids = chatIds.slice(i, i + 40).join(',');
    const rows = await d.select(
      `scope_chat_messages?chat_id=in.(${ids})&role=eq.assistant&created_at=gte.${encodeURIComponent(new Date(Date.parse(minAt) - 864e5).toISOString())}&created_at=lte.${encodeURIComponent(maxAt)}&select=chat_id,content,created_at&order=created_at.asc&limit=5000`,
    );
    for (const r of rows) {
      if (!out.has(r.chat_id)) out.set(r.chat_id, []);
      out.get(r.chat_id).push(r);
    }
  }
  const prior = new Map();
  for (const m of chatRows) {
    const list = out.get(m.chat_id) || [];
    let last = null;
    for (const a of list) {
      if (a.created_at < m.created_at) last = a;
      else break;
    }
    if (last) prior.set(m.id, last.content);
  }
  return prior;
}

/** Turn raw rows into dated, labelled records with short refs. */
export async function buildRecordList(env, tz, rows) {
  const items = [];
  const push = (table, id, at, text) => items.push({ table, id, at, text });
  for (const t of rows.created) {
    const due = t.due_day || t.target_date || (t.due_date ? t.due_date.slice(0, 10) : null);
    const extra = trim([t.body, t.notes].filter(Boolean).join(' '), 400);
    push('todos', t.id, t.created_at, `Added a todo: "${trim(t.title, 200)}"${due ? ` (due ${due})` : ''}${extra ? `. Details: ${extra}` : ''}`);
  }
  for (const t of rows.completed) {
    push('todos', t.id, t.completed_at, `Completed the todo: "${trim(t.title, 200)}"`);
  }
  for (const n of rows.notes) {
    const kind = n.subtype === 'journal' ? 'Wrote a journal entry' : n.subtype === 'event' ? 'Added an event' : n.subtype === 'idea' ? 'Noted an idea' : 'Wrote a note';
    const when = n.subtype === 'event' && (n.target_date || n.date) ? ` (on ${n.target_date || n.date}${n.end_date ? ` to ${n.end_date}` : ''})` : '';
    const mood = Array.isArray(n.mood) && n.mood.length ? ` Mood: ${n.mood.join(', ')}.` : '';
    const body = trim(n.body, n.subtype === 'journal' ? 1500 : 600);
    push('notes', n.id, n.created_at, `${kind}${when}: "${trim(n.title, 160)}"${body ? `. ${body}` : ''}${mood}`);
  }
  for (const h of rows.habits) {
    push('habits', h.id, h.created_at, `Started tracking a habit: "${trim(h.name || h.title, 160)}"${h.frequency ? ` (${h.frequency})` : ''}${h.why_string ? `. Why: ${trim(h.why_string, 200)}` : ''}`);
  }
  for (const m of rows.milestones) {
    push('space_milestones', m.id, m.created_at, `Set a milestone: "${trim(m.title || m.name, 160)}"${m.date ? ` dated ${m.date}` : ''}${m.completed ? ' (marked done)' : ''}${m.note ? `. ${trim(m.note, 200)}` : ''}`);
  }
  for (const c of rows.calendar) {
    const start = c.is_all_day ? c.start_at?.slice(0, 10) : localDateTime(tz, c.start_at);
    const end = c.is_all_day ? c.end_at?.slice(0, 10) : localDateTime(tz, c.end_at);
    push('synced_calendar_events', c.id, c.created_at, `Calendar entry: "${trim(c.title, 160)}" from ${start} to ${end}${c.location ? ` at ${trim(c.location, 80)}` : ''}`);
  }
  for (const o of rows.overrides) {
    push('user_profile_overrides', o.id, o.created_at, `Told Gremly about themselves (${o.action}): "${trim(o.fact_text, 300)}"`);
  }
  for (const a of rows.answers) {
    push('gremly_questions', a.id, a.answered_at, `Answered Gremly's question "${trim(a.question, 200)}" with: "${trim(a.answer, 300)}"`);
  }
  const prior = await priorGremlyLines(env, rows.chats);
  for (const m of rows.chats) {
    const g = prior.get(m.id);
    push('scope_chat_messages', m.id, m.created_at, `${g ? `[Gremly had said, context only: "${trim(g, 240)}"] ` : ''}Said in chat: "${trim(m.content, 700)}"`);
  }
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return items;
}

export function chunkRecords(items) {
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= MAX_RECORDS_PER_CALL || chars + it.text.length > MAX_CHARS_PER_CALL)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += it.text.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** The facts worth showing alongside a chunk: still open, or recently confirmed. */
export async function loadOpenFacts(env, userId, aroundIso) {
  const d = db(env);
  const lo = new Date(Date.parse(aroundIso) - 120 * 864e5).toISOString().slice(0, 10);
  const [dated, recent] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&about_date=gte.${lo}&select=id,statement,subject,about_date,about_date_end,state,observed_at,private&order=about_date.asc&limit=${MAX_OPEN_FACTS}`),
    d.select(`life_facts?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=id,statement,subject,about_date,about_date_end,state,observed_at,private&order=last_confirmed_at.desc&limit=${MAX_OPEN_FACTS}`),
  ]);
  const byId = new Map();
  for (const f of [...dated, ...recent]) if (!byId.has(f.id)) byId.set(f.id, f);
  return [...byId.values()].slice(0, MAX_OPEN_FACTS);
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null;
}

const UPDATE_STATES = new Set(['current', 'happened', 'changed', 'superseded', 'unconfirmed']);

const SAID_BY = {
  scope_chat_messages: 'user',
  notes: 'user',
  user_profile_overrides: 'user',
  gremly_questions: 'user',
  todos: 'app_record',
  habits: 'app_record',
  space_milestones: 'app_record',
  synced_calendar_events: 'calendar',
};

/**
 * Undo whatever an earlier attempt of this chunk wrote: restore the states it
 * changed, then remove the facts and open questions it added.
 */
async function rollbackRun(d, userId, runId) {
  const rid = encodeURIComponent(runId);
  const changes = await d.select(`life_fact_changes?user_id=eq.${userId}&run_id=eq.${rid}&select=id,fact_id,from_state&order=id.desc`);
  for (const c of changes) {
    await d.update(`life_facts?id=eq.${c.fact_id}&user_id=eq.${userId}`, { state: c.from_state, superseded_by: null, state_reason: null });
  }
  if (changes.length) await d.remove(`life_fact_changes?user_id=eq.${userId}&run_id=eq.${rid}`);
  await d.remove(`gremly_questions?user_id=eq.${userId}&run_id=eq.${rid}&status=eq.open`);
  await d.remove(`life_facts?user_id=eq.${userId}&run_id=eq.${rid}`);
}

/**
 * Read one chunk of records against the ledger and write the result.
 * Returns counts. Throws on model or database failure so Inngest retries.
 */
export async function readChunk(env, userId, tz, chunk, baseRunId) {
  const d = db(env);
  const today = localDate(tz);
  // Each chunk writes under its own run id. If Inngest retries the step, the
  // rows a failed attempt left behind are removed first, so a retry never
  // duplicates facts or questions.
  const runId = `${baseRunId}:${chunk[0].at}`;
  await rollbackRun(d, userId, runId);
  const [openFacts, person] = await Promise.all([loadOpenFacts(env, userId, chunk[0].at), personIdentity(env, userId)]);

  const recRef = new Map();
  const recordLines = chunk.map((r, i) => {
    const ref = `r${i + 1}`;
    recRef.set(ref, r);
    const day = localDateTime(tz, r.at);
    return `${ref} | ${day} (${relativeDay(day.slice(0, 10), today)}) | ${r.text}`;
  });
  const factRef = new Map();
  const factLines = openFacts.map((f, i) => {
    const ref = `f${i + 1}`;
    factRef.set(ref, f);
    const when = f.about_date ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''} (${relativeDay(f.about_date, today)})` : 'no date';
    return `${ref} | ${f.state}${f.private ? ' [private]' : ''} | ${when} | ${f.statement}`;
  });

  const user = `FACTS THE LEDGER ALREADY HOLDS (ref | state | date | statement):
${factLines.length ? factLines.join('\n') : '(none yet)'}

NEW RECORDS, OLDEST FIRST (ref | when it happened | record):
${recordLines.join('\n')}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system: readerSystemPrompt(today, person),
    user,
    schema: READER_SCHEMA,
    maxTokens: 8000,
    effort: 'low',
    thinking: 'low',
  });

  const counts = { records: chunk.length, facts_added: 0, facts_updated: 0, confirmed: 0, questions: 0, rejected: 0 };
  const nowIso = new Date().toISOString();

  // New facts
  const newRows = [];
  for (const f of output.new_facts || []) {
    const src = recRef.get(f.source_ref);
    if (!src || !f.statement) {
      counts.rejected++;
      continue;
    }
    newRows.push({
      user_id: userId,
      statement: trim(f.statement, 400),
      subject: f.subject ? trim(f.subject, 80) : null,
      kind: f.kind ? trim(f.kind, 40) : null,
      about_date: validDate(f.about_date),
      about_date_end: validDate(f.about_date_end),
      date_confidence: ['exact', 'approximate', 'unknown'].includes(f.date_confidence) ? f.date_confidence : 'unknown',
      state: ['current', 'planned', 'happened', 'unconfirmed'].includes(f.state) ? f.state : 'current',
      said_by: SAID_BY[src.table] || 'app_record',
      source_table: src.table,
      source_id: src.id,
      source_quote: f.quote ? trim(f.quote, 300) : null,
      private: !!f.private,
      observed_at: src.at,
      last_confirmed_at: src.at,
      run_id: runId,
      model,
    });
  }
  if (newRows.length) {
    await d.insertQuiet('life_facts', newRows);
    counts.facts_added = newRows.length;
  }

  // Updates to existing facts
  for (const u of output.fact_updates || []) {
    const fact = factRef.get(u.fact_ref);
    const src = recRef.get(u.source_ref);
    if (!fact || !src || !UPDATE_STATES.has(u.new_state) || u.new_state === fact.state) {
      counts.rejected++;
      continue;
    }
    let replacementId = null;
    if (u.replacement_statement) {
      const [rep] = await d.insert('life_facts', [
        {
          user_id: userId,
          statement: trim(u.replacement_statement, 400),
          subject: fact.subject,
          about_date: validDate(u.replacement_about_date),
          about_date_end: validDate(u.replacement_about_date_end),
          date_confidence: validDate(u.replacement_about_date) ? 'exact' : 'unknown',
          private: !!fact.private,
          state: ['current', 'planned', 'happened'].includes(u.replacement_state) ? u.replacement_state : 'current',
          said_by: SAID_BY[src.table] || 'app_record',
          source_table: src.table,
          source_id: src.id,
          observed_at: src.at,
          last_confirmed_at: src.at,
          run_id: runId,
          model,
        },
      ]);
      replacementId = rep?.id || null;
    }
    // A fact with a replacement is no longer the true version, whatever the
    // model called it: it changed, and points at the fact that replaces it.
    const newState = replacementId && !['changed', 'superseded'].includes(u.new_state) ? 'changed' : u.new_state;
    await d.update(`life_facts?id=eq.${fact.id}&user_id=eq.${userId}`, {
      state: newState,
      state_reason: trim(u.reason, 400),
      superseded_by: replacementId,
      last_confirmed_at: src.at,
      updated_at: nowIso,
    });
    await d.insertQuiet('life_fact_changes', [
      {
        fact_id: fact.id,
        user_id: userId,
        from_state: fact.state,
        to_state: newState,
        reason: trim(u.reason, 400),
        source_table: src.table,
        source_id: src.id,
        run_id: runId,
      },
    ]);
    counts.facts_updated++;
  }

  // Confirmations
  for (const c of output.confirmations || []) {
    const fact = factRef.get(c.fact_ref);
    const src = recRef.get(c.source_ref);
    if (!fact || !src) continue;
    await d.update(`life_facts?id=eq.${fact.id}&user_id=eq.${userId}`, { last_confirmed_at: src.at, updated_at: nowIso });
    counts.confirmed++;
  }

  // Questions, one open question per fact at a time
  for (const q of output.questions || []) {
    if (!q.question) continue;
    const fact = q.fact_ref ? factRef.get(q.fact_ref) : null;
    const src = q.source_ref ? recRef.get(q.source_ref) : null;
    if (fact) {
      const existing = await d.select(`gremly_questions?user_id=eq.${userId}&about_fact_id=eq.${fact.id}&status=in.(open,asked)&select=id&limit=1`);
      if (existing.length) continue;
    }
    await d.insertQuiet('gremly_questions', [
      {
        user_id: userId,
        question: trim(q.question, 300),
        status: 'open',
        about_fact_id: fact?.id || null,
        record_table: src?.table || null,
        record_id: src?.id || null,
        proposed_change: q.proposed_change ? { text: trim(q.proposed_change, 300) } : null,
        run_id: runId,
      },
    ]);
    counts.questions++;
  }

  return counts;
}

/**
 * Split the records in (since, until] into chunk windows. Only the window
 * boundaries are returned, so the plan stays small enough to pass between
 * Inngest steps; each window is reloaded when it is read.
 */
export async function planWindows(env, userId, sinceIso, untilIso) {
  const tz = await userTimezone(env, userId);
  const rows = await loadRecords(env, userId, sinceIso, untilIso);
  const items = await buildRecordList(env, tz, rows);
  const chunks = chunkRecords(items);
  const windows = [];
  let from = sinceIso;
  for (const c of chunks) {
    const to = c[c.length - 1].at;
    windows.push({ from, to, n: c.length });
    from = to;
  }
  return { tz, windows, total: items.length };
}

/** Read one window of records (from, to] and write the results. */
export async function readWindow(env, userId, tz, fromIso, toIso, runId) {
  const rows = await loadRecords(env, userId, fromIso, toIso);
  const items = await buildRecordList(env, tz, rows);
  const totals = { records: 0, facts_added: 0, facts_updated: 0, confirmed: 0, questions: 0, rejected: 0 };
  for (const chunk of chunkRecords(items)) {
    const c = await readChunk(env, userId, tz, chunk, runId);
    for (const k of Object.keys(totals)) totals[k] += c[k] || 0;
  }
  return totals;
}

export async function readCursor(env, userId) {
  const rows = await db(env).select(`ledger_cursor?user_id=eq.${userId}&select=read_through,backfilled_at`);
  return rows?.[0] || null;
}

export async function advanceCursor(env, userId, throughIso, { backfilled = false } = {}) {
  const d = db(env);
  // The cursor only moves forward: two runs for one person never undo each other.
  const cur = await readCursor(env, userId);
  if (cur?.read_through && cur.read_through >= throughIso && !backfilled) return;
  const row = { user_id: userId, read_through: cur?.read_through && cur.read_through > throughIso ? cur.read_through : throughIso, updated_at: new Date().toISOString() };
  if (backfilled) row.backfilled_at = new Date().toISOString();
  await d.upsert('ledger_cursor', [row], 'user_id');
}
