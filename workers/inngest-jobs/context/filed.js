/**
 * What is filed in a World or a Chapter (data fabric stage 4b), read for the
 * writers of its words (context/words.js) and of a Chapter's memory
 * (context/memory.js): the items filed there, the facts the reader took from
 * them, and the people those facts are about.
 *
 * Code reads rows by ids and dates and marks what is private. It never reads
 * the person's words to decide anything. An item is private here when any
 * fact the reader took from it, in any state and however old, is private or
 * about health: items carry no mark of their own yet.
 *
 * An item the reader has not read carries no mark, so whether it is private
 * is not known. Each item says whether it has been read (read): it has, when
 * it last changed before the reader's cursor, and after the person's last
 * Forget Everything unless facts were taken from it since. Forget Everything
 * leaves a marker for this (FORGOTTEN_KIND), as reading starts again from
 * then and what came before is never read back in.
 */

import { db } from './db';
import { FORGOTTEN_KIND } from '../../shared/forgotten.js';

/** The table each kind of filed item lives in. */
export const ITEM_TABLE = Object.freeze({ note: 'notes', todo: 'todos', habit: 'habits' });

/**
 * The reasons the app records when it clears an item from their list without
 * it being marked done: the Sweep and the tidy ups. Anything else archived was
 * deleted, converted or moved, and is never read as theirs.
 */
export const CLEARED_REASONS = Object.freeze({
  todo: Object.freeze(['swept', 'mini_sweep', 'weekly_cleanup']),
  note: Object.freeze(['swept']),
  habit: Object.freeze(['swept']),
});

/** The fact states a writer is given: what holds now, what is planned, what happened. */
export const FILED_FACT_STATES = Object.freeze(['current', 'planned', 'unconfirmed', 'happened']);

const UUID = /^[0-9a-f-]{36}$/i;
const day = (v) => {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** One item as the writers see it. */
export function itemOf(type, r) {
  const title = type === 'note' ? r.title : r.name || r.title;
  const body = type === 'note' ? r.body : type === 'todo' ? r.body || r.notes : r.notes;
  return {
    type,
    id: r.id,
    title: title || null,
    body: body || null,
    subtype: r.subtype || null,
    // a note keeps the day it is about; anything else, the day it was made
    date: (type === 'note' && day(r.date || r.target_date)) || day(r.created_at),
    created_at: r.created_at || null,
    // when it last changed, for whether the reader has read it as it is
    changed_at: r.updated_at || r.created_at || null,
    done: type === 'todo' ? day(r.completed_at) : null,
    // cleared from their list without being marked done, when such items are read
    cleared: r.archived === true,
  };
}

const COLUMNS = {
  note: 'id,title,body,subtype,date,target_date,created_at,updated_at,archived',
  todo: 'id,name,title,body,notes,created_at,updated_at,completed_at,archived',
  habit: 'id,name,title,notes,subtype,created_at,updated_at,archived',
};

/** Rows a page of a select holds at most (the API's own ceiling). */
const PAGE = 1000;

/** Every row of a select, a page at a time: the API stops at a page without saying so. */
async function selectAll(d, path) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = (await d.select(`${path}&limit=${PAGE}&offset=${offset}`)) || [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * The items with these links, read by type and id. Archived ones are left out,
 * except, when cleared is asked for, those cleared from their list
 * (CLEARED_REASONS), each marked cleared.
 */
export async function readItems(d, userId, links, { cleared = false } = {}) {
  const byType = new Map();
  for (const l of links || []) {
    if (!ITEM_TABLE[l.drop_type] || !UUID.test(String(l.drop_id))) continue;
    if (!byType.has(l.drop_type)) byType.set(l.drop_type, new Set());
    byType.get(l.drop_type).add(l.drop_id);
  }
  const out = [];
  for (const [type, ids] of byType) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 100) {
      const rows = await d.select(
        `${ITEM_TABLE[type]}?owner_id=eq.${userId}&id=in.(${list.slice(i, i + 100).join(',')})&${cleared ? `or=(archived.is.false,archived_reason.in.(${CLEARED_REASONS[type].join(',')}))` : 'archived=is.false'}&select=${COLUMNS[type]}`,
      );
      for (const r of rows || []) out.push(itemOf(type, r));
    }
  }
  return out;
}

/**
 * The facts taken from these items, and the facts tied to the World itself,
 * with the people each is about.
 */
export async function readFacts(d, userId, items, { worldId = null, limit = 60 } = {}) {
  const lists = [];
  const byTable = new Map();
  for (const it of items) {
    const t = ITEM_TABLE[it.type];
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t).push(it.id);
  }
  const select = `select=id,statement,subject,about_date,about_date_end,state,observed_at,last_confirmed_at,private,health,item_table,item_id&state=in.(${FILED_FACT_STATES.join(',')})`;
  for (const [table, ids] of byTable) {
    for (let i = 0; i < ids.length; i += 100) {
      lists.push(
        d.select(
          `life_facts_now?user_id=eq.${userId}&item_table=eq.${table}&item_id=in.(${ids.slice(i, i + 100).join(',')})&${select}&order=last_confirmed_at.desc&limit=200`,
        ),
      );
    }
  }
  if (worldId)
    lists.push(
      d.select(
        `life_facts_now?user_id=eq.${userId}&world_id=eq.${worldId}&${select}&order=last_confirmed_at.desc&limit=100`,
      ),
    );
  const seen = new Set();
  const facts = [];
  for (const rows of await Promise.all(lists))
    for (const f of rows || []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      facts.push(f);
    }
  facts.sort((a, b) => String(b.last_confirmed_at).localeCompare(String(a.last_confirmed_at)));
  return facts.slice(0, limit);
}

/** The people each fact is about, as the people records hold them. */
export async function readFactPeople(d, userId, facts) {
  const ids = facts.map((f) => f.id);
  const byFact = new Map();
  if (!ids.length) return byFact;
  const ties = [];
  for (let i = 0; i < ids.length; i += 100)
    ties.push(
      ...((await d.select(
        `life_fact_people?user_id=eq.${userId}&fact_id=in.(${ids.slice(i, i + 100).join(',')})&select=fact_id,person_id`,
      )) || []),
    );
  const personIds = [...new Set(ties.map((t) => t.person_id))];
  if (!personIds.length) return byFact;
  const [people, names] = await Promise.all([
    d.select(
      `life_people?user_id=eq.${userId}&id=in.(${personIds.join(',')})&merged_into=is.null&select=id,name,relationship`,
    ),
    d.select(
      `life_person_names?user_id=eq.${userId}&person_id=in.(${personIds.join(',')})&select=person_id,name`,
    ),
  ]);
  const namesOf = new Map();
  for (const n of names || [])
    namesOf.set(n.person_id, [...(namesOf.get(n.person_id) || []), n.name]);
  const byId = new Map((people || []).map((p) => [p.id, { ...p, names: namesOf.get(p.id) || [] }]));
  for (const t of ties) {
    const p = byId.get(t.person_id);
    if (p) byFact.set(t.fact_id, [...(byFact.get(t.fact_id) || []), p]);
  }
  return byFact;
}

const markKey = (table, id) => `${table}:${id}`;

/**
 * What the reader took from these items: which any fact marks private or
 * about health (every fact, in every state, from every place it was taken,
 * not only the facts a writer is given), and which it took any fact from.
 * @returns {{ marks: Map<'table:id', {private, health}>, sourced: Set<'table:id'> }}
 */
export async function readItemSources(d, userId, items) {
  const byTable = new Map();
  for (const it of items || []) {
    const t = ITEM_TABLE[it.type];
    if (!t || !UUID.test(String(it.id))) continue;
    if (!byTable.has(t)) byTable.set(t, new Set());
    byTable.get(t).add(it.id);
  }
  const sources = [];
  for (const [table, set] of byTable) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i += 100)
      sources.push(
        ...(await selectAll(
          d,
          `life_fact_sources?user_id=eq.${userId}&source_table=eq.${table}&source_id=in.(${ids.slice(i, i + 100).join(',')})&select=fact_id,source_table,source_id&order=id.asc`,
        )),
      );
  }
  const sourced = new Set(sources.map((x) => markKey(x.source_table, x.source_id)));
  const factIds = [...new Set(sources.map((s) => s.fact_id))];
  const flagged = new Map();
  for (let i = 0; i < factIds.length; i += 100)
    for (const f of (await d.select(
      `life_facts?user_id=eq.${userId}&id=in.(${factIds.slice(i, i + 100).join(',')})&or=(private.is.true,health.is.true)&select=id,private,health`,
    )) || [])
      flagged.set(f.id, f);
  const marks = new Map();
  for (const s of sources) {
    const f = flagged.get(s.fact_id);
    if (!f) continue;
    const k = markKey(s.source_table, s.source_id);
    const was = marks.get(k) || { private: false, health: false };
    marks.set(k, { private: was.private || !!f.private, health: was.health || !!f.health });
  }
  return { marks, sourced };
}

/** Which of these items any fact the reader took from them marks private or about health. */
export async function readItemMarks(d, userId, items) {
  return (await readItemSources(d, userId, items)).marks;
}

/** How far the reader has read for a person, and when they last asked Gremly to forget. */
export async function readReading(d, userId) {
  const [cursor, forgot] = await Promise.all([
    d.select(`ledger_cursor?user_id=eq.${userId}&select=read_through`),
    d.select(
      `events?owner_id=eq.${userId}&kind=eq.${FORGOTTEN_KIND}&select=created_at&order=created_at.desc&limit=1`,
    ),
  ]);
  return {
    readThrough: cursor?.[0]?.read_through || null,
    forgotAt: forgot?.[0]?.created_at || null,
  };
}

/**
 * Whether the reader has read an item as it is now. Pure. It has when it last
 * changed at or before the reader's cursor, and, when the person has asked
 * Gremly to forget, after that unless facts were taken from it since (what
 * came before a Forget is never read back in).
 */
export function itemRead(it, { readThrough, forgotAt, sourced }) {
  const at = it.changed_at ? Date.parse(it.changed_at) : NaN;
  if (!readThrough || Number.isNaN(at) || at > Date.parse(readThrough)) return false;
  if (forgotAt && at <= Date.parse(forgotAt) && !sourced.has(markKey(ITEM_TABLE[it.type], it.id)))
    return false;
  return true;
}

/**
 * Mark each item private or about health from the facts taken from it, and
 * from the marks read for it (readItemMarks). Pure.
 * @returns items with private and health set
 */
export function markItems(items, facts, marks = null) {
  const flags = new Map(marks || []);
  for (const f of facts) {
    if (!f.item_id) continue;
    const k = markKey(f.item_table, f.item_id);
    const was = flags.get(k) || { private: false, health: false };
    flags.set(k, { private: was.private || !!f.private, health: was.health || !!f.health });
  }
  return items.map((it) => {
    const m = flags.get(markKey(ITEM_TABLE[it.type], it.id));
    return { ...it, private: !!m?.private, health: !!m?.health };
  });
}

/**
 * Everything filed in one World or Chapter, newest first.
 * @param target { table: 'worlds' | 'chapters', id }
 * @param opts.cleared also what was cleared from their list without being
 *   marked done (the words writer, so its line rests on what fills a World)
 * @returns { items, facts, peopleOf }
 */
export async function loadFiled(env, userId, target, { items: most = 40, cleared = false } = {}) {
  const d = db(env);
  const [linkTable, key] =
    target.table === 'worlds'
      ? ['drop_world_links', 'world_id']
      : ['drop_chapter_links', 'chapter_id'];
  const links = await d.select(
    `${linkTable}?owner_id=eq.${userId}&${key}=eq.${target.id}&select=drop_id,drop_type,assigned_by,created_at&order=created_at.desc&limit=400`,
  );
  const read = await readItems(d, userId, links || [], { cleared });
  read.sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
  const placed = new Set(
    (links || []).filter((l) => l.assigned_by === 'user').map((l) => `${l.drop_type}:${l.drop_id}`),
  );
  const items = read
    .slice(0, most)
    .map((it) => ({ ...it, placed: placed.has(`${it.type}:${it.id}`) }));
  const [facts, { marks, sourced }, reading] = await Promise.all([
    readFacts(d, userId, items, { worldId: target.table === 'worlds' ? target.id : null }),
    readItemSources(d, userId, items),
    readReading(d, userId),
  ]);
  const peopleOf = await readFactPeople(d, userId, facts);
  return {
    items: markItems(items, facts, marks).map((it) => ({
      ...it,
      read: itemRead(it, { ...reading, sourced }),
    })),
    facts,
    peopleOf,
  };
}
