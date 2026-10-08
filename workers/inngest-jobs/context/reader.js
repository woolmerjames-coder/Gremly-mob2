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
import {
  db,
  userTimezone,
  localDate,
  localDateTime,
  relativeDay,
  personIdentity,
  weekdayName,
} from './db';
import { jsonCall, modelFor } from './llm';
import { minutesIn } from '../../shared/calendar.js';
import { personDay, personNow } from '../../shared/day.js';
import {
  stateWords,
  FACT_TIMINGS,
  TIMING_RULES,
  validTiming,
  dayOn,
} from '../../shared/factTiming.js';
import { FACT_KINDS, KIND_RULES, validKind } from '../../shared/factKinds.js';
import {
  FACT_PEOPLE_SCHEMA,
  SAME_PEOPLE_SCHEMA,
  PEOPLE_RULES,
  loadPeople,
  peopleLines,
  planPeople,
  writePeople,
  checkPlan,
} from './people';
import {
  answerRecord,
  calendarRecord,
  changeRecord,
  chatRecord,
  completedRecord,
  deletedRecord,
  habitRecord,
  milestoneRecord,
  noteRecord,
  overrideRecord,
  reviewRecord,
  splitRecord,
  todoRecord,
} from './records';

export const READER_PROMPT_VERSION = 'reader-2026-10-13c';

const MAX_RECORDS_PER_CALL = 60;
const MAX_CHARS_PER_CALL = 30000;
const MAX_OPEN_FACTS = 200;

export const READER_SCHEMA = {
  type: 'object',
  properties: {
    new_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          subject: { type: 'string' },
          kind: { type: 'string', enum: FACT_KINDS },
          timing: { type: 'string', enum: FACT_TIMINGS },
          about_date: { type: 'string', nullable: true },
          about_date_end: { type: 'string', nullable: true },
          date_confidence: { type: 'string', enum: ['exact', 'approximate', 'unknown'] },
          state: { type: 'string', enum: ['current', 'planned', 'happened', 'unconfirmed'] },
          source_ref: { type: 'string' },
          quote: { type: 'string' },
          private: { type: 'boolean' },
          health: { type: 'boolean' },
          about_item: { type: 'boolean' },
          people: FACT_PEOPLE_SCHEMA,
        },
        required: [
          'statement',
          'subject',
          'kind',
          'timing',
          'health',
          'people',
          'date_confidence',
          'state',
          'source_ref',
          'quote',
          'private',
          'about_item',
        ],
      },
    },
    fact_updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact_ref: { type: 'string' },
          new_state: {
            type: 'string',
            enum: ['current', 'happened', 'changed', 'superseded', 'unconfirmed'],
          },
          reason: { type: 'string' },
          source_ref: { type: 'string' },
          replacement_statement: { type: 'string', nullable: true },
          replacement_about_date: { type: 'string', nullable: true },
          replacement_about_date_end: { type: 'string', nullable: true },
          replacement_state: {
            type: 'string',
            nullable: true,
            enum: ['current', 'planned', 'happened'],
          },
          replacement_about_item: { type: 'boolean', nullable: true },
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
          about_item: { type: 'boolean', nullable: true },
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
          choices: { type: 'array', items: { type: 'string' } },
          fact_ref: { type: 'string', nullable: true },
          source_ref: { type: 'string', nullable: true },
          proposed_change: { type: 'string', nullable: true },
        },
        required: ['question'],
      },
    },
    same_people: SAME_PEOPLE_SCHEMA,
    calendar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          cancelled: { type: 'boolean' },
        },
        required: ['ref', 'cancelled'],
      },
    },
  },
  required: ['new_facts', 'fact_updates', 'confirmations', 'questions', 'calendar', 'same_people'],
};

function readerSystemPrompt(today, person) {
  return `You keep a ledger of facts about one person's life for Gremly, a companion app. You are shown records the person made in the app, in the order they happened, and the facts the ledger already holds. Decide what the new records tell you.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

WHAT BELONGS IN THE LEDGER
- Facts a thoughtful friend would want to remember to understand what is going on in this person's life: plans and trips, commitments and deadlines, events that happened, people who matter and what is happening with them, ongoing situations, goals, routines they keep, and things they say they want or prefer.
- The day an occasion in their life falls on, and whose occasion it is, belongs in the ledger whenever the person gives it, however much in passing, and above all when they put Gremly right about it. A plan made around an occasion never stands in for the occasion's own day: each is a fact of its own.
- Not every record produces a fact. Routine chores, passing remarks and app housekeeping usually do not. Be selective; a short, accurate ledger is worth more than a long one.
- Write each statement in plain words, about the person, in the third person, as true as of the record's date. Keep it to one sentence.
- A statement says what the record shows. Whether a later record confirmed it is carried by the state, not written into the statement.
- Records that say the same thing produce one fact, not one per record.

${KIND_RULES}

${TIMING_RULES}

${PEOPLE_RULES}

EVIDENCE
- Every new fact cites exactly one record by its ref, and quotes the person's own words from that record (or its title).
- Lines marked as Gremly's are context to help you read the person's reply. They are never evidence: nothing Gremly said becomes a fact unless the person's own words state it.
- Resolve relative dates against the day of the record they appear in, not today's date. A record made after midnight but before their day ended belongs to the day before the clock's date, as its line says: it speaks from that day, so what it says happened this evening or night happened on that day, its relative days count from it, and a time of day it names for later is after they have slept, on the clock's date. If a date cannot be pinned down, leave it empty and mark the confidence as unknown.

RECORDS THAT CHANGED OR WENT
- A record marked as changed was made before and has changed since. It is shown as it stands now, with what changed and the ledger facts already taken from it. Add a fact only for what it now says that the ledger does not hold. When what it now says adds to or alters one of those facts, update that fact instead of adding a second one. When the change adds nothing, return nothing for it.
- A record marked as deleted cannot be shown; the ledger facts taken from it are listed. Deleting can be tidying, so the deletion alone changes none of those facts, not even to unconfirmed: change one only when the ledger or the other records show it no longer holds.
- A record marked as read before was read under older rules and is shown again, with the ledger facts already taken from it. The ledger already holds what came after it, so leave every fact as it is: add a fact only for what the record says that those facts and the rest of the ledger miss, and return nothing for a record whose facts already say all it holds. A listed fact that was put right, changed or replaced already stands for what the record said: the ledger keeps the later version, so add nothing for it.
- A record split into parts is one record. Read the parts together.

ITEMS
- Todos, habits, calendar entries and events are items the person keeps. A fact is about an item when it states the item itself: what it is, its day, whether it is done. Mark it so on a new fact, on a replacement, and on a confirmation from that item's own record. A fact that comes from something said in the record, or that the item only points to, is not about the item.
- A fact about an item takes its date, and whether it is done, archived or cancelled, from the item, so a move or a done mark needs no update to the fact. An item put away before it was done says nothing certain about the plan: judge from the reason it was put away and the other records whether the plan still holds, update the fact when it does not, and mark it unconfirmed when you cannot tell.
- The ledger shows which facts are about an item and how that item stands now.

CALENDAR
- For each calendar entry among the records, judge whether it has been cancelled and will not happen, from the entry and what the other records show. List in calendar each entry you judge cancelled, and each entry marked cancelled earlier that the records now show is going ahead. Leave every other entry out.

KEEPING THE LEDGER TRUE
- A plan is planned until a later record shows what happened. When a record shows a planned thing happened, moved, changed or fell through, update that fact and cite the record. If the details changed, give the replacement.
- When a record restates an existing fact, confirm it instead of adding a duplicate.
- When a record shows the same trip, event, milestone or plan as a fact the ledger holds, but at a different date or with a different outcome, the fact is no longer reliable as written. If the record makes clear it is the same thing, update the fact (changed, with the replacement). If it might be a separate occurrence, mark the fact unconfirmed and ask the person.
- When records disagree and you cannot tell which is right, ask the person one short, friendly question instead of choosing. Ask only when the answer bears on their life now or on something still ahead, measured against today's date. Differences about things long past are recorded as they are, without a question.
- With each question, give two to four short answers the person could tap, each a few words, covering what they would most likely say. They can always answer in their own words instead.
- Never mark a fact as happened just because its date has passed. Without a record, a passed plan stays as it is; it is simply no longer ahead.

${PRIVATE_RULES}
- Mark each new fact private or not by that meaning. Keep a private detail in a fact of its own, so the rest of what the record says stays open.
- Every fact from a record the person marked private is private.

${WRITING_RULES}

Return only the structured result.`;
}

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const READ_TABLES = ['notes', 'todos', 'habits', 'synced_calendar_events', 'weekly_reviews'];
const ROW_SELECT = {
  notes:
    'id,title,body,subtype,journal_subtype,date,target_date,end_date,event_time,mood,views,list_items,reminders_json,origin,external_source,archived,archived_reason,created_at',
  todos:
    'id,title,body,notes,due_day,due_date,scheduled_date,target_date,status,completed_at,archived,archived_reason,resurface_at,sweep_reschedule_count,views,list_items,reminders_json,origin,created_at',
  habits:
    'id,name,title,frequency,why_string,notes,start_date,end_date,reminders_json,origin,archived,archived_reason,created_at',
  synced_calendar_events:
    'id,title,location,start_at,end_at,is_all_day,archived,cancelled_at,created_at',
  weekly_reviews: 'id,week_start,status,answers,read,created_at,updated_at',
};
// Gremly's own saves of a chat (Save from chat) are his reading of it, not the
// person's words: the chat itself is read
const NOT_GREMLYS = 'or=(origin.is.null,origin.neq.chat_save)';

/**
 * Whether a row first saved in this read, though made before it, is one the
 * reader reads as new: the same rules as the reads of what was made in the
 * window (Gremly's own saves of a chat, imported notes and calendar entries
 * no longer on the calendar are not).
 */
export function lateReadable(table, row) {
  if (!row) return false;
  if (table === 'synced_calendar_events') return row.archived !== true;
  if (table === 'notes' && row.external_source) return false;
  if (['todos', 'notes', 'habits'].includes(table)) return row.origin !== 'chat_save';
  return false;
}

async function rowsByIds(d, table, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    out.push(
      ...(await d.select(`${table}?id=in.(${chunk.join(',')})&select=${ROW_SELECT[table]}`)),
    );
  }
  return out;
}

/**
 * The changes in (since, until] to items made before the read began, from the
 * change log: one entry an item, with every field that changed and its first
 * and last dates. Items made after the read began are read as new, as they
 * stand, so their changes are left out here.
 */
export function gatherChanges(logRows) {
  const byRow = new Map();
  for (const c of logRows) {
    const key = `${c.table_name}:${c.row_id}`;
    const cur = byRow.get(key) || {
      table: c.table_name,
      row_id: c.row_id,
      at: c.at,
      op: c.op,
      fields: new Set(),
      dates: {},
    };
    cur.at = c.at > cur.at ? c.at : cur.at;
    if (c.op === 'delete') cur.op = 'delete';
    else if (cur.op !== 'delete' && c.op === 'insert') cur.op = 'insert';
    for (const f of c.fields || []) cur.fields.add(f);
    for (const [f, pair] of Object.entries(c.dates || {})) {
      if (!Array.isArray(pair)) continue;
      cur.dates[f] = cur.dates[f] ? [cur.dates[f][0], pair[1]] : pair;
    }
    byRow.set(key, cur);
  }
  return [...byRow.values()];
}

/** The ledger facts taken from each record, by "table:id". Facts set aside are left out. */
export async function factsFrom(d, userId, refs, { all = false } = {}) {
  const out = new Map();
  for (let i = 0; i < refs.length; i += 60) {
    const chunk = refs.slice(i, i + 60);
    const ids = [...new Set(chunk.map((r) => r.id))];
    // the catch up sees every fact a record ever gave, the corrected and the
    // replaced too, so nothing the person put right comes back
    const rows = await d.select(
      `life_fact_sources?user_id=eq.${userId}&source_id=in.(${ids.join(',')})&select=fact_id,source_table,source_id,life_facts!inner(state)${all ? '' : '&life_facts.state=not.in.(superseded,corrected)'}&limit=2000`,
    );
    for (const r of rows) {
      const key = `${r.source_table}:${r.source_id}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(r.fact_id);
    }
  }
  return out;
}

/**
 * Load every record for a user in (since, until], oldest first: what was made
 * in it, and what changed in it to things made before runSince (the start of
 * this read, so a row made earlier in the same read is not read twice).
 */
export async function loadRecords(
  env,
  userId,
  sinceIso,
  untilIso,
  { runSince = sinceIso, late: readLate = true } = {},
) {
  const d = db(env);
  const w = (col) =>
    `&${col}=gt.${encodeURIComponent(sinceIso)}&${col}=lte.${encodeURIComponent(untilIso)}`;
  const [created, completed, notes, habits, milestones, chats, calendar, overrides, answers, log] =
    await Promise.all([
      d.select(
        `todos?owner_id=eq.${userId}&${NOT_GREMLYS}${w('created_at')}&select=${ROW_SELECT.todos}&order=created_at.asc&limit=5000`,
      ),
      d.select(
        `todos?owner_id=eq.${userId}${w('completed_at')}&select=id,title,completed_at,views&order=completed_at.asc&limit=5000`,
      ),
      d.select(
        `notes?owner_id=eq.${userId}&external_source=is.null&${NOT_GREMLYS}${w('created_at')}&select=${ROW_SELECT.notes}&order=created_at.asc&limit=5000`,
      ),
      d.select(
        `habits?owner_id=eq.${userId}&${NOT_GREMLYS}${w('created_at')}&select=${ROW_SELECT.habits}&order=created_at.asc&limit=1000`,
      ),
      d.select(
        `space_milestones?owner_id=eq.${userId}${w('created_at')}&select=id,title,name,date,note,completed,completed_at,created_at&order=created_at.asc&limit=1000`,
      ),
      d.select(
        // Taps on the morning brief's buttons are not things they said
        `scope_chat_messages?user_id=eq.${userId}&role=eq.user&or=(metadata_json.is.null,metadata_json->>type.is.null,metadata_json->>type.neq.brief-reply)${w('created_at')}&select=id,chat_id,content,created_at&order=created_at.asc&limit=5000`,
      ),
      d.select(
        `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false${w('created_at')}&select=${ROW_SELECT.synced_calendar_events}&order=created_at.asc&limit=5000`,
      ),
      d.select(
        `user_profile_overrides?user_id=eq.${userId}${w('created_at')}&select=id,action,fact_text,created_at&order=created_at.asc&limit=500`,
      ),
      d.select(
        `gremly_questions?user_id=eq.${userId}&status=eq.answered${w('answered_at')}&select=id,question,answer,answered_at&order=answered_at.asc&limit=500`,
      ),
      d.select(
        `item_changes?owner_id=eq.${userId}&by=in.(person,calendar)&table_name=in.(${READ_TABLES.join(',')})${w('at')}&select=table_name,row_id,op,fields,dates,at&order=at.asc&limit=5000`,
      ),
    ]);

  // what changed, as it stands now
  const changes = gatherChanges(log);
  const deleted = changes.filter((c) => c.op === 'delete' && c.table !== 'weekly_reviews');
  const updated = changes.filter((c) => c.op !== 'delete');
  const current = new Map();
  for (const table of READ_TABLES) {
    const ids = updated.filter((c) => c.table === table).map((c) => c.row_id);
    if (!ids.length) continue;
    for (const r of await rowsByIds(d, table, ids)) current.set(`${table}:${r.id}`, r);
  }
  const changed = [];
  const reviews = [];
  const late = { todos: [], notes: [], habits: [], synced_calendar_events: [] };
  for (const c of updated) {
    const row = current.get(`${c.table}:${c.row_id}`);
    if (!row) continue;
    if (c.table === 'weekly_reviews') {
      if (['started', 'done'].includes(row.status)) reviews.push({ row, at: c.at });
      continue;
    }
    // made in this read: read as new, as it stands
    if (row.created_at > runSince) continue;
    // made before this read but first saved now (a save made offline reaches
    // the server late, with the time it was made): no read has seen it, so it
    // is read as new, as it stands, under the same rules as anything made now
    if (c.op === 'insert') {
      if (readLate && lateReadable(c.table, row)) late[c.table].push(row);
      continue;
    }
    changed.push({ change: c, row });
  }
  const oldestFirst = (list) =>
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  // a late save an earlier read already read (it synced while that read ran) is not read again
  const lateIds = Object.values(late).flatMap((l) => l.map((r) => String(r.id)));
  if (lateIds.length) {
    const read = await d
      .select(
        `ledger_reads?user_id=eq.${userId}&source_id=in.(${lateIds.join(',')})&select=source_table,source_id&limit=1000`,
      )
      .catch((err) => {
        console.warn(
          `[ALERT][Reader] could not check late saves against the marks for ${userId}: ${err?.message || err}`,
        );
        return [];
      });
    const seenRead = new Set(read.map((m) => `${m.source_table}:${m.source_id}`));
    for (const t of Object.keys(late))
      late[t] = late[t].filter((r) => !seenRead.has(`${t}:${r.id}`));
  }

  // the facts already taken from each changed or deleted record
  const refs = [
    ...changed.map((x) => ({ id: x.change.row_id })),
    ...deleted.map((c) => ({ id: c.row_id })),
  ];
  const facts = refs.length ? await factsFrom(d, userId, refs) : new Map();
  for (const x of changed) x.factIds = facts.get(`${x.change.table}:${x.change.row_id}`) || [];
  for (const c of deleted) c.factIds = facts.get(`${c.table}:${c.row_id}`) || [];

  // titles for the items a weekly review names
  const reviewIds = new Set();
  for (const { row } of reviews) {
    const a = row.answers || {};
    for (const p of a.priorities || []) for (const id of p.item_ids || []) reviewIds.add(id);
    for (const k of a.dates_out || []) {
      const [type, id] = String(k).split(':');
      if (type !== 'when' && id) reviewIds.add(id);
    }
  }
  const titles = new Map();
  if (reviewIds.size) {
    const ids = [...reviewIds].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    for (const table of ['todos', 'habits', 'notes']) {
      if (!ids.length) break;
      const rows = await d.select(
        `${table}?id=in.(${ids.join(',')})&select=id,${table === 'habits' ? 'name' : 'title'}`,
      );
      for (const r of rows) titles.set(r.id, r.title || r.name);
    }
  }

  if (Object.values(late).some((l) => l.length))
    console.log(
      `[Reader] ${userId}: read late as new ${Object.entries(late)
        .filter(([, l]) => l.length)
        .map(([t, l]) => `${l.length} ${t}`)
        .join(', ')}`,
    );
  return {
    created: oldestFirst([...created, ...late.todos]),
    completed,
    notes: oldestFirst([...notes, ...late.notes]),
    habits: oldestFirst([...habits, ...late.habits]),
    milestones,
    chats,
    calendar: oldestFirst([...calendar, ...late.synced_calendar_events]),
    overrides,
    answers,
    changed,
    deleted,
    reviews,
    titles,
  };
}

/**
 * The last thing Gremly said before an instant, from one chat's rows in time
 * order. A row with no words is not a line: the brief's last row can be one,
 * carrying only its buttons or the week's facts (brief/index.js), and what
 * Gremly said is then the line before it.
 */
export function lineBefore(list, at) {
  let last = null;
  for (const a of list) {
    if (a.created_at >= at) break;
    if (a.content && a.content.trim()) last = a;
  }
  return last;
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
    const last = lineBefore(out.get(m.chat_id) || [], m.created_at);
    if (last) prior.set(m.id, last.content);
  }
  return prior;
}

/** Turn raw rows into dated, labelled records, each a whole record or one of its parts. */
export async function buildRecordList(env, tz, rows, { priorLines = priorGremlyLines } = {}) {
  const items = [];
  const push = (rec) => {
    if (rec) items.push(...splitRecord(rec));
  };
  for (const t of rows.created || []) push(todoRecord(t));
  for (const t of rows.completed || []) push(completedRecord(t));
  for (const n of rows.notes || []) push(noteRecord(n));
  for (const h of rows.habits || []) push(habitRecord(h));
  for (const m of rows.milestones || []) push(milestoneRecord(m));
  for (const c of rows.calendar || []) {
    const rec = calendarRecord(c, tz);
    if (c.cancelled_at) rec.text += ' (marked cancelled earlier)';
    push(rec);
  }
  for (const o of rows.overrides || []) push(overrideRecord(o));
  for (const a of rows.answers || []) push(answerRecord(a));
  for (const x of rows.changed || []) {
    const rec = changeRecord(x.change, x.row, tz);
    if (!rec) continue;
    if (x.change.table === 'synced_calendar_events' && x.row?.cancelled_at)
      rec.text += ' (marked cancelled earlier)';
    push({ ...rec, factIds: x.factIds || [] });
  }
  for (const c of rows.deleted || []) {
    // nothing left to read when no fact rests on it (or code already set those aside)
    if (c.factIds?.length) push({ ...deletedRecord(c), factIds: c.factIds });
  }
  for (const r of rows.reviews || []) push(reviewRecord(r.row, rows.titles, r.at));
  const prior = await priorLines(env, rows.chats || []);
  for (const m of rows.chats || []) push(chatRecord(m, prior.get(m.id)));
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.part || 0) - (b.part || 0)));
  return items;
}

export function chunkRecords(items) {
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    if (
      cur.length &&
      (cur.length >= MAX_RECORDS_PER_CALL || chars + it.text.length > MAX_CHARS_PER_CALL)
    ) {
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

const FACT_SELECT =
  'id,statement,subject,kind,timing,health,about_date,about_date_end,state,observed_at,private,correction_text,item_table,item_done,item_archived,item_cancelled,item_gone';

/**
 * The facts worth showing alongside a chunk: still open, or recently
 * confirmed, and every fact taken from a record in it that changed or went.
 * Each with its item's dates and how the item stands now (life_facts_now).
 */
export async function loadOpenFacts(env, userId, aroundIso, extraIds = []) {
  const d = db(env);
  const lo = new Date(Date.parse(aroundIso) - 120 * 864e5).toISOString().slice(0, 10);
  const [dated, recent, extra] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&about_date=gte.${lo}&select=${FACT_SELECT}&order=about_date.asc&limit=${MAX_OPEN_FACTS}`,
    ),
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=${FACT_SELECT}&order=last_confirmed_at.desc&limit=${MAX_OPEN_FACTS}`,
    ),
    extraIds.length
      ? d.select(
          `life_facts_now?user_id=eq.${userId}&id=in.(${extraIds.join(',')})&select=${FACT_SELECT}`,
        )
      : [],
  ]);
  const byId = new Map();
  // the facts of a changed or deleted record first, so none is left out
  for (const f of [...extra, ...dated, ...recent]) if (!byId.has(f.id)) byId.set(f.id, f);
  const keep = [...byId.values()];
  return keep.slice(0, Math.max(MAX_OPEN_FACTS, extra.length));
}

// A day, or the day of a date with a time (the model sometimes adds the time)
export function validDate(s) {
  const day =
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s) ? s.slice(0, 10) : null;
  return day && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
}

// The records that are items the person keeps, with dates and a state of their
// own that life_facts_now reads (supabase/migrations/20261007150000_data_fabric_stage1.sql)
const ITEM_TABLES = new Set([
  'todos',
  'habits',
  'notes',
  'synced_calendar_events',
  'space_milestones',
]);
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
/** Each chunk writes under its own run id; the first record names it, its part too. */
export function chunkRunId(baseRunId, chunk) {
  const first = chunk[0];
  return `${baseRunId}:${first.at}:${first.id}${first.part ? `#${first.part}` : ''}`;
}

export async function rollbackRun(d, userId, runId) {
  const rid = encodeURIComponent(runId);
  const changes = await d.select(
    `life_fact_changes?user_id=eq.${userId}&run_id=eq.${rid}&select=id,fact_id,from_state&order=id.desc`,
  );
  for (const c of changes) {
    await d.update(`life_facts?id=eq.${c.fact_id}&user_id=eq.${userId}`, {
      state: c.from_state,
      superseded_by: null,
      state_reason: null,
    });
  }
  if (changes.length) await d.remove(`life_fact_changes?user_id=eq.${userId}&run_id=eq.${rid}`);
  await d.remove(`life_fact_sources?user_id=eq.${userId}&run_id=eq.${rid}`);
  await d.remove(`gremly_questions?user_id=eq.${userId}&run_id=eq.${rid}&status=eq.open`);
  // What the run set on people made before it: who they are, from its facts,
  // and a first name it gave someone known only by who they are. The run reads
  // the same records again, so it sets them again.
  const runFacts = await d.select(`life_facts?user_id=eq.${userId}&run_id=eq.${rid}&select=id`);
  if (runFacts.length)
    await d.update(
      `life_people?user_id=eq.${userId}&run_id=neq.${rid}&name=not.is.null&relationship_by=eq.gremly&relationship_fact_id=in.(${runFacts.map((f) => f.id).join(',')})`,
      { relationship: null, relationship_fact_id: null },
    );
  const runNames = await d.select(
    `life_person_names?user_id=eq.${userId}&run_id=eq.${rid}&select=person_id,name`,
  );
  for (const n of runNames)
    await d.update(
      `life_people?id=eq.${n.person_id}&user_id=eq.${userId}&run_id=neq.${rid}&name_by=eq.gremly&relationship=not.is.null&name=eq.${encodeURIComponent(n.name)}`,
      { name: null },
    );
  await d.remove(`life_facts?user_id=eq.${userId}&run_id=eq.${rid}`);
  await d.remove(`person_merges?user_id=eq.${userId}&run_id=eq.${rid}&status=eq.proposed`);
  await d.remove(`life_person_names?user_id=eq.${userId}&run_id=eq.${rid}`);
  await d.remove(`life_people?user_id=eq.${userId}&run_id=eq.${rid}`);
}

/**
 * Their day when the reader runs: after midnight it is still yesterday until
 * their day ends (workers/shared/day.js).
 */
export function readerToday(tz, at, dayEndHour) {
  return personDay(localDate(tz, at), minutesIn(tz, at), dayEndHour);
}

/**
 * What the reader is given for one chunk: its instructions, the ledger and the
 * new records, with the refs each line carries. Pure, for readChunk and the
 * replay (scripts/reader-replay).
 */
const ITEM_WORDS = {
  todos: 'a todo',
  notes: 'an event',
  synced_calendar_events: 'a calendar entry',
  space_milestones: 'a milestone',
  habits: 'a habit',
};

/** How a fact stands, for the ledger list: its state, a passed date, its item now. */
function factStanding(f, today) {
  const item = f.item_table
    ? ` | about ${ITEM_WORDS[f.item_table] || 'an item'}${f.item_gone ? ', which is gone' : ''}${f.item_done ? ', done' : ''}${f.item_cancelled ? ', cancelled' : ''}${f.item_archived ? ', archived' : ''}`
    : '';
  const fixed =
    f.state === 'corrected'
      ? `, put right by them${f.correction_text ? `: "${trim(f.correction_text, 200)}"` : ''}`
      : '';
  return `${stateWords(f, today)}${fixed}${f.private ? ' [private]' : ''}${item}`;
}

export function readerRequest({
  today,
  person,
  chunk,
  openFacts,
  people = [],
  tz,
  dayEndHour = 0,
}) {
  const { lines: peopleRows, ref: personRef } = peopleLines(people);
  const factRef = new Map();
  const refOfFact = new Map();
  const factLines = openFacts.map((f, i) => {
    const ref = `f${i + 1}`;
    factRef.set(ref, f);
    refOfFact.set(f.id, ref);
    const on = dayOn(f, today);
    const when =
      f.timing === 'standing'
        ? 'standing, no date'
        : f.timing === 'yearly' && on
          ? `every year on ${String(f.about_date).slice(5, 10)}, next ${on} (${relativeDay(on, today)})`
          : f.about_date
            ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''} (${relativeDay(f.about_date, today)})`
            : 'no date';
    return `${ref} | ${factStanding(f, today)} | ${when} | ${f.statement}`;
  });
  const recRef = new Map();
  const recordLines = chunk.map((r, i) => {
    const ref = `r${i + 1}`;
    recRef.set(ref, r);
    const clock = localDateTime(tz, r.at);
    // after midnight and before their day ended, the record is the day before's
    const day = readerToday(tz, new Date(r.at), dayEndHour);
    const late =
      day !== clock.slice(0, 10)
        ? `, after midnight, so still ${weekdayName(day)} ${day} for them`
        : '';
    const mark =
      r.kind === 'changed'
        ? '[changed] '
        : r.kind === 'deleted'
          ? '[deleted] '
          : r.kind === 'read_before'
            ? '[read before] '
            : '';
    const from = (r.factIds || []).map((id) => refOfFact.get(id)).filter(Boolean);
    const facts = r.kind
      ? ` | ledger facts from it: ${from.length ? from.join(', ') : 'none'}`
      : '';
    return `${ref} | ${clock}${late} (${relativeDay(day, today)}) | ${mark}${r.text}${facts}`;
  });

  const user = `PEOPLE GREMLY KNOWS (ref | name | other names | who they are):
${peopleRows.length ? peopleRows.join('\n') : '(none yet)'}

FACTS THE LEDGER ALREADY HOLDS (ref | state | date | statement):
${factLines.length ? factLines.join('\n') : '(none yet)'}

RECORDS, OLDEST FIRST (ref | when it happened | record):
${recordLines.join('\n')}`;
  return { system: readerSystemPrompt(today, person), user, recRef, factRef, personRef };
}

/**
 * Read one chunk of records against the ledger and write the result.
 * Returns counts. Throws on model or database failure so Inngest retries.
 */
export async function readChunk(env, userId, tz, chunk, baseRunId, { reread = false } = {}) {
  const d = db(env);
  // their day, and the hour it ends, for what each record's dates count from
  const { today, dayEndHour } = await personNow(env, userId, tz);
  // Each chunk writes under its own run id. If Inngest retries the step, the
  // rows a failed attempt left behind are removed first, so a retry never
  // duplicates facts or questions.
  // the first record names the chunk, its part too, so two chunks never share a run id
  const runId = chunkRunId(baseRunId, chunk);
  await rollbackRun(d, userId, runId);
  const fromRecords = [...new Set(chunk.flatMap((r) => r.factIds || []))];
  const [openFacts, person, people] = await Promise.all([
    loadOpenFacts(env, userId, chunk[0].at, fromRecords),
    personIdentity(env, userId),
    loadPeople(d, userId),
  ]);
  const { system, user, recRef, factRef, personRef } = readerRequest({
    today,
    person,
    chunk,
    openFacts,
    people,
    tz,
    dayEndHour,
  });

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system,
    user,
    schema: READER_SCHEMA,
    maxTokens: 8000,
    effort: 'low',
    thinking: 'low',
  });

  const counts = {
    records: chunk.length,
    facts_added: 0,
    facts_updated: 0,
    confirmed: 0,
    questions: 0,
    rejected: 0,
  };
  const nowIso = new Date().toISOString();

  // New facts. A statement identical to one already held, or to another in this
  // batch, for the same date is the same fact: it is not stored twice.
  const sameKey = (statement, date) =>
    `${String(statement || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()}|${date || ''}`;
  const seen = new Set(openFacts.map((f) => sameKey(f.statement, f.about_date)));
  const newRows = [];
  // the people each new fact is about, as the model gave them
  const factPeople = [];
  // the whole record each new fact comes from, for the check on who someone is
  const recordOf = new Map();
  // where each fact comes from: the record, and whether the fact is about the item itself
  const sourceRows = [];
  const sourceOf = (factId, src, quote, about) => ({
    fact_id: factId,
    user_id: userId,
    source_table: src.table,
    source_id: src.id,
    // only an item can be what a fact is about; a chat or an answer is said in
    role: about && ITEM_TABLES.has(src.table) ? 'about' : 'said_in',
    quote: quote ? trim(quote, 300) : null,
    seen_at: src.at,
    run_id: runId,
  });
  for (const f of output.new_facts || []) {
    const src = recRef.get(f.source_ref);
    if (!src || !f.statement) {
      counts.rejected++;
      continue;
    }
    const key = sameKey(trim(f.statement, 400), validDate(f.about_date));
    if (seen.has(key)) {
      counts.duplicates = (counts.duplicates || 0) + 1;
      continue;
    }
    seen.add(key);
    const id = crypto.randomUUID();
    recordOf.set(id, src.text || null);
    sourceRows.push(sourceOf(id, src, f.quote, f.about_item === true));
    factPeople.push({ factId: id, people: f.people || [] });
    newRows.push({
      id,
      user_id: userId,
      statement: trim(f.statement, 400),
      subject: f.subject ? trim(f.subject, 80) : null,
      kind: validKind(f.kind),
      timing: validTiming(f.timing),
      health: f.health === true,
      // every reader reads a standing fact as having no date, and a yearly
      // one on its next day (shared/factTiming.js)
      about_date: validDate(f.about_date),
      about_date_end: validDate(f.about_date_end),
      date_confidence: ['exact', 'approximate', 'unknown'].includes(f.date_confidence)
        ? f.date_confidence
        : 'unknown',
      state: ['current', 'planned', 'happened', 'unconfirmed'].includes(f.state)
        ? f.state
        : 'current',
      said_by: SAID_BY[src.table] || 'app_record',
      source_table: src.table,
      source_id: src.id,
      source_quote: f.quote ? trim(f.quote, 300) : null,
      // a record the person marked private makes only private facts
      private: !!f.private || src.private === true,
      observed_at: src.at,
      last_confirmed_at: src.at,
      run_id: runId,
      model,
      prompt_version: READER_PROMPT_VERSION,
    });
  }
  if (newRows.length) {
    await d.insertQuiet('life_facts', newRows);
    counts.facts_added = newRows.length;
  }
  // The people each new fact is about, and any two known people that may be
  // one, with who each is and their name checked against the person's own
  // words, the whole record each comes from, before they are written (data
  // fabric stage 4c)
  const quoteOf = new Map(newRows.map((r) => [r.id, r.source_quote]));
  const planned = planPeople({
    known: personRef,
    facts: factPeople,
    same: output.same_people,
    userId,
    runId,
    refs: [...recRef.keys(), ...factRef.keys()],
  });
  // An old record read again knows less than the ledger does now: the catch
  // up adds people and ties, fills a name nobody has given yet, and changes
  // no one's relationship (what it would have changed is counted)
  if (reread) {
    for (const [id, patch] of planned.updates) {
      if (!('relationship' in patch)) continue;
      counts.held_people = (counts.held_people || 0) + 1;
      delete patch.relationship;
      delete patch.relationship_fact_id;
      if (!Object.keys(patch).length) planned.updates.delete(id);
    }
  }
  const peoplePlan = await checkPlan(env, planned, {
    person,
    wordsOf: (id) => recordOf.get(id) || quoteOf.get(id) || null,
  });
  Object.assign(counts, await writePeople(d, userId, peoplePlan));

  // A catch up reads old records against a ledger that already holds what
  // came after them (context/reread.js): it adds what was missed and changes
  // no fact, so what it would change is counted and left, never applied.
  if (reread) {
    const held = {
      held_updates: (output.fact_updates || []).length,
      held_questions: (output.questions || []).length,
      held_calendar: (output.calendar || []).length,
    };
    for (const [k, n] of Object.entries(held)) if (n) counts[k] = n;
    if (held.held_updates || held.held_questions || held.held_calendar)
      console.log(`[Reader] ${userId}: the catch up left ${JSON.stringify(held)}`);
  }

  // Updates to existing facts
  for (const u of reread ? [] : output.fact_updates || []) {
    const fact = factRef.get(u.fact_ref);
    const src = recRef.get(u.source_ref);
    if (!fact || !src || !UPDATE_STATES.has(u.new_state) || u.new_state === fact.state) {
      counts.rejected++;
      continue;
    }
    let replacementId = null;
    if (u.replacement_statement) {
      const repId = crypto.randomUUID();
      const [rep] = await d.insert('life_facts', [
        {
          id: repId,
          user_id: userId,
          statement: trim(u.replacement_statement, 400),
          subject: fact.subject,
          // its kind and health flag are judged by the kind pass, as any fact's
          kind: null,
          health: null,
          about_date: validDate(u.replacement_about_date),
          about_date_end: validDate(u.replacement_about_date_end),
          date_confidence: validDate(u.replacement_about_date) ? 'exact' : 'unknown',
          private: !!fact.private || src.private === true,
          state: ['current', 'planned', 'happened'].includes(u.replacement_state)
            ? u.replacement_state
            : 'current',
          said_by: SAID_BY[src.table] || 'app_record',
          source_table: src.table,
          source_id: src.id,
          observed_at: src.at,
          last_confirmed_at: src.at,
          run_id: runId,
          model,
          prompt_version: READER_PROMPT_VERSION,
        },
      ]);
      replacementId = rep?.id || null;
      if (replacementId) {
        sourceRows.push(sourceOf(replacementId, src, null, u.replacement_about_item === true));
        // the replacement is about the same people as the fact it replaces
        const ties = await d.select(
          `life_fact_people?fact_id=eq.${fact.id}&user_id=eq.${userId}&select=person_id`,
        );
        if (ties.length)
          await d.insertIgnore(
            'life_fact_people',
            ties.map((t) => ({
              fact_id: replacementId,
              person_id: t.person_id,
              user_id: userId,
              run_id: runId,
            })),
            'fact_id,person_id',
          );
      }
    }
    // A fact with a replacement is no longer the true version, whatever the
    // model called it: it changed, and points at the fact that replaces it.
    const newState =
      replacementId && !['changed', 'superseded'].includes(u.new_state) ? 'changed' : u.new_state;
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

  // Confirmations. A fact is confirmed as of its latest record: an older
  // record (one read again, or a change to an old item) never moves it back.
  for (const c of output.confirmations || []) {
    const fact = factRef.get(c.fact_ref);
    const src = recRef.get(c.source_ref);
    if (!fact || !src) continue;
    await d.update(
      `life_facts?id=eq.${fact.id}&user_id=eq.${userId}&or=(last_confirmed_at.is.null,last_confirmed_at.lt.${encodeURIComponent(`"${src.at}"`)})`,
      { last_confirmed_at: src.at, updated_at: nowIso },
    );
    sourceRows.push(sourceOf(fact.id, src, null, c.about_item === true));
    counts.confirmed++;
  }

  // Questions, one open question per fact at a time
  for (const q of reread ? [] : output.questions || []) {
    if (!q.question) continue;
    const fact = q.fact_ref ? factRef.get(q.fact_ref) : null;
    const src = q.source_ref ? recRef.get(q.source_ref) : null;
    if (fact) {
      const existing = await d.select(
        `gremly_questions?user_id=eq.${userId}&about_fact_id=eq.${fact.id}&status=in.(open,asked)&select=id&limit=1`,
      );
      if (existing.length) continue;
    }
    await d.insertQuiet('gremly_questions', [
      {
        user_id: userId,
        question: trim(q.question, 300),
        choices: (q.choices || [])
          .map((c) => trim(c, 40))
          .filter(Boolean)
          .slice(0, 4),
        status: 'open',
        about_fact_id: fact?.id || null,
        record_table: src?.table || null,
        record_id: src?.id || null,
        proposed_change: q.proposed_change ? { text: trim(q.proposed_change, 300) } : null,
        run_id: runId,
        prompt_version: READER_PROMPT_VERSION,
      },
    ]);
    counts.questions++;
  }

  if (sourceRows.length) {
    await d.insertIgnore('life_fact_sources', sourceRows, 'fact_id,source_table,source_id');
    counts.sources = sourceRows.length;
    // A record the fact was already said in, now judged to be the item the fact
    // is about: the role moves from said in to about, never back
    for (const r of sourceRows.filter((x) => x.role === 'about')) {
      const marked = await d.update(
        `life_fact_sources?fact_id=eq.${r.fact_id}&source_table=eq.${r.source_table}&source_id=eq.${r.source_id}&role=eq.said_in`,
        { role: 'about', seen_at: r.seen_at },
      );
      if (Array.isArray(marked) && marked.length)
        counts.about_marked = (counts.about_marked || 0) + 1;
    }
  }

  // Calendar entries the reader judged cancelled, or on again: code stamps the entry
  for (const c of reread ? [] : output.calendar || []) {
    const src = recRef.get(c.ref);
    if (!src || src.table !== 'synced_calendar_events') {
      counts.rejected++;
      continue;
    }
    // on again only clears a stamp that is there
    await d.update(
      `synced_calendar_events?id=eq.${src.id}&owner_id=eq.${userId}${c.cancelled ? '' : '&cancelled_at=not.is.null'}`,
      { cancelled_at: c.cancelled ? nowIso : null, cancelled_run: runId },
    );
    counts[c.cancelled ? 'cancelled' : 'uncancelled'] =
      (counts[c.cancelled ? 'cancelled' : 'uncancelled'] || 0) + 1;
  }

  // Which rules read each record, so a better rule can reach what was read
  // under an older one (context/reread.js)
  counts.marked = await markRead(d, userId, chunk);

  return counts;
}

/**
 * The name a record is marked under: its table, and what it is when one item
 * gives more than one record (a todo made, and the same todo done).
 */
export function markTable(r) {
  return r.mark ? `${r.table}:${r.mark}` : r.table;
}

/**
 * Mark each record in a chunk as read under this reader's rules
 * (ledger_reads). A record that is gone is not marked. Never stops a read: a
 * mark that cannot be written is said loudly, and the record is read again
 * by the next catch up.
 */
export async function markRead(d, userId, chunk) {
  const seen = new Set();
  const rows = [];
  for (const r of chunk) {
    // a change or a deletion is not the record that made the item: only what
    // the person made, did and said is marked (the catch up reads those)
    if (r.kind === 'deleted' || r.kind === 'changed' || !r.table || !r.id) continue;
    const key = `${markTable(r)}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      user_id: userId,
      source_table: markTable(r),
      source_id: String(r.id),
      reader_version: READER_PROMPT_VERSION,
      read_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return 0;
  try {
    await d.upsert('ledger_reads', rows, 'user_id,source_table,source_id');
    return rows.length;
  } catch (err) {
    console.warn(
      `[ALERT][Reader] could not mark ${rows.length} records read for ${userId}: ${err?.message || err}`,
    );
    return 0;
  }
}

/**
 * Split the records in (since, until] into chunk windows. Only the window
 * boundaries are returned, so the plan stays small enough to pass between
 * Inngest steps; each window is reloaded when it is read.
 */
export async function planWindows(env, userId, sinceIso, untilIso) {
  const tz = await userTimezone(env, userId);
  const rows = await loadRecords(env, userId, sinceIso, untilIso, { runSince: sinceIso });
  const items = await buildRecordList(env, tz, rows);
  const chunks = chunkRecords(items);
  const windows = [];
  let from = sinceIso;
  for (const c of chunks) {
    const to = c[c.length - 1].at;
    // a record split in parts keeps its parts in one window
    if (windows.length && to === windows[windows.length - 1].to) {
      windows[windows.length - 1].n += c.length;
      continue;
    }
    windows.push({ from, to, n: c.length });
    from = to;
  }
  return { tz, windows, total: items.length };
}

/**
 * The facts that rested only on a note or journal entry the person deleted
 * are set aside, with the reason "source deleted". A fact that rests on other
 * records too is left for the reader, beside the deletion. A deleted todo or
 * habit sets nothing aside: tidying away is not forgetting (James's call of
 * 6 Oct), so the reader sees it and decides.
 */
export async function retireDeleted(env, userId, deleted, runId) {
  const d = db(env);
  const notes = (deleted || []).filter((c) => c.table === 'notes' && c.factIds?.length);
  if (!notes.length) return { retired: 0 };
  const factIds = [...new Set(notes.flatMap((c) => c.factIds))];
  const sources = await d.select(
    `life_fact_sources?user_id=eq.${userId}&fact_id=in.(${factIds.join(',')})&select=fact_id,source_table,source_id`,
  );
  const gone = new Set(notes.map((c) => `notes:${c.row_id}`));
  const lone = factIds.filter((id) =>
    sources
      .filter((s) => s.fact_id === id)
      .every((s) => gone.has(`${s.source_table}:${s.source_id}`)),
  );
  if (!lone.length) return { retired: 0 };
  const facts = await d.select(
    `life_facts?user_id=eq.${userId}&id=in.(${lone.join(',')})&state=not.in.(superseded,corrected)&select=id,state,source_table,source_id`,
  );
  const reason = 'source deleted';
  for (const f of facts) {
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, {
      state: 'superseded',
      state_reason: reason,
      updated_at: new Date().toISOString(),
    });
    const from = notes.find((c) => c.factIds.includes(f.id));
    await d.insertQuiet('life_fact_changes', [
      {
        fact_id: f.id,
        user_id: userId,
        from_state: f.state,
        to_state: 'superseded',
        reason,
        source_table: 'notes',
        source_id: from?.row_id || f.source_id,
        run_id: runId,
      },
    ]);
  }
  for (const c of notes) c.factIds = c.factIds.filter((id) => !facts.some((f) => f.id === id));
  return { retired: facts.length };
}

/** Read one window of records (from, to] and write the results. */
export async function readWindow(
  env,
  userId,
  tz,
  fromIso,
  toIso,
  runId,
  { runSince = fromIso } = {},
) {
  const rows = await loadRecords(env, userId, fromIso, toIso, { runSince });
  const totals = {
    records: 0,
    facts_added: 0,
    facts_updated: 0,
    confirmed: 0,
    questions: 0,
    rejected: 0,
  };
  // what rested only on a deleted note goes first, by code; the rest is the reader's
  const { retired } = await retireDeleted(env, userId, rows.deleted, `${runId}:deleted:${toIso}`);
  if (retired) totals.retired = retired;
  const items = await buildRecordList(env, tz, rows);
  const chunks = chunkRecords(items);
  // A retry of this window starts clean: what any of its chunks wrote before
  // goes first, so no chunk reads people a later chunk had made.
  const d = db(env);
  for (const chunk of chunks) await rollbackRun(d, userId, chunkRunId(runId, chunk));
  for (const chunk of chunks) {
    const c = await readChunk(env, userId, tz, chunk, runId);
    for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + (c[k] || 0);
  }
  return totals;
}

export async function readCursor(env, userId) {
  const rows = await db(env).select(
    `ledger_cursor?user_id=eq.${userId}&select=read_through,backfilled_at`,
  );
  return rows?.[0] || null;
}

export async function advanceCursor(env, userId, throughIso, { backfilled = false } = {}) {
  const d = db(env);
  // The cursor only moves forward: two runs for one person never undo each other.
  const cur = await readCursor(env, userId);
  if (cur?.read_through && cur.read_through >= throughIso && !backfilled) return;
  const row = {
    user_id: userId,
    read_through:
      cur?.read_through && cur.read_through > throughIso ? cur.read_through : throughIso,
    updated_at: new Date().toISOString(),
  };
  if (backfilled) row.backfilled_at = new Date().toISOString();
  await d.upsert('ledger_cursor', [row], 'user_id');
}
