/**
 * What is filed in a World or a Chapter (data fabric stage 4b), read for the
 * writers of its words (context/words.js) and of a Chapter's memory
 * (context/memory.js): the items filed there, the facts the reader took from
 * them, and the people those facts are about.
 *
 * Code reads rows by ids and dates and marks what is private. It never reads
 * the person's words to decide anything. An item is private here when a fact
 * the reader took from it is private or about health: items carry no mark of
 * their own yet.
 */

import { db } from './db';

/** The table each kind of filed item lives in. */
export const ITEM_TABLE = Object.freeze({ note: 'notes', todo: 'todos', habit: 'habits' });

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
    done: type === 'todo' ? day(r.completed_at) : null,
  };
}

const COLUMNS = {
  note: 'id,title,body,subtype,date,target_date,created_at',
  todo: 'id,name,title,body,notes,created_at,completed_at',
  habit: 'id,name,title,notes,subtype,created_at',
};

/** The items with these links, read by type and id; archived ones are left out. */
export async function readItems(d, userId, links) {
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
        `${ITEM_TABLE[type]}?owner_id=eq.${userId}&id=in.(${list.slice(i, i + 100).join(',')})&archived=is.false&select=${COLUMNS[type]}`,
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

/**
 * Mark each item private or about health from the facts taken from it. Pure.
 * @returns items with private and health set
 */
export function markItems(items, facts) {
  const flags = new Map();
  for (const f of facts) {
    if (!f.item_id) continue;
    const k = `${f.item_table}:${f.item_id}`;
    const was = flags.get(k) || { private: false, health: false };
    flags.set(k, { private: was.private || !!f.private, health: was.health || !!f.health });
  }
  return items.map((it) => ({
    ...it,
    ...(flags.get(`${ITEM_TABLE[it.type]}:${it.id}`) || { private: false, health: false }),
  }));
}

/**
 * Everything filed in one World or Chapter, newest first.
 * @param target { table: 'worlds' | 'chapters', id }
 * @returns { items, facts, peopleOf }
 */
export async function loadFiled(env, userId, target, { items: most = 40 } = {}) {
  const d = db(env);
  const [linkTable, key] =
    target.table === 'worlds'
      ? ['drop_world_links', 'world_id']
      : ['drop_chapter_links', 'chapter_id'];
  const links = await d.select(
    `${linkTable}?owner_id=eq.${userId}&${key}=eq.${target.id}&select=drop_id,drop_type,assigned_by,created_at&order=created_at.desc&limit=400`,
  );
  const read = await readItems(d, userId, links || []);
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
  const facts = await readFacts(d, userId, items, {
    worldId: target.table === 'worlds' ? target.id : null,
  });
  const peopleOf = await readFactPeople(d, userId, facts);
  return { items: markItems(items, facts), facts, peopleOf };
}
