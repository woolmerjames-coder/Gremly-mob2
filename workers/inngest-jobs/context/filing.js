/**
 * Filing (data fabric stage 4a): where one drop goes among a person's Worlds
 * and Chapters, by one set of rules for every drop. Cortex files each new drop
 * as it is saved (the assign-worlds route) and the backfill files what someone
 * already has (dropAssignmentBackfill.ts); both run this.
 *
 * The rule: a Chapter only when Gremly is sure, otherwise the World, where a
 * wrong guess costs little, otherwise nowhere. The AI reads the drop and the
 * person's Worlds and Chapters and says where it belongs and how sure it is.
 * Code applies the bar (FILING_CUT, set on the filing replay so that Chapter
 * filings are right 95 times in 100 and World filings 85 in 100), checks every
 * ref, and writes.
 *
 * It never moves something the person placed: a drop they filed themselves is
 * left as it is and no call is made. Nor does it put a drop back in a World
 * or a Chapter they took it out of (drop_link_removals, takenOutOf), nor in a
 * Chapter of a World they took it out of: those are left out of what it is
 * shown. It never makes a World or a Chapter, and
 * never asks anything. It can say that a drop fits nothing and looks like the
 * start of something, which the reply carries (stage 4b reads it). The items
 * a person placed in each World and Chapter themselves are shown to it as a
 * sense of what they keep there, never as rules.
 *
 * Life contexts are filed as before until the old Worlds fields stop
 * (shared/worldsFields.js), since the old screens still read them.
 */

import { db, localDate, userTimezone } from '../../shared/db.js';
import { oldWorldsFieldsStopped } from '../../shared/worldsFields.js';
import { jsonCall, modelFor } from './llm.js';

export const FILING_PROMPT_VERSION = 'filing-2026-10-07c';

/**
 * The confidence each filing needs. The filing replay (scripts/filing-replay)
 * holds the bar James set on 7 Oct: Chapter filings right 95 times in 100,
 * World filings 85 in 100. Over its sixty drops, three runs each, no Chapter
 * filing was wrong at any cut tried, and the right ones came with a
 * confidence of 0.76 and up; the Chapter cut of 0.8 keeps a margin, at the
 * cost of a drop the guide itself leaves unclear going to its World instead.
 * World filings met the bar at every World cut from 0.3 to 0.8. In shadow on
 * real drops, World filings that read right came with a confidence between
 * 0.6 and 0.8, which a higher cut would leave nowhere, and only a handful
 * below 0.6, of mixed worth. So the World cut is 0.6.
 */
export const FILING_CUT = Object.freeze({ chapter: 0.8, world: 0.6 });

/** A life context link needs this relevance, as before stage 4a. */
export const CONTEXT_CUT = 0.3;

/** At most this many of the items a person placed are shown for each World or Chapter. */
const PLACED_SHOWN = 5;

const TEXT_MAX = 2000;

export const FILING_SCHEMA = {
  type: 'object',
  properties: {
    world_ref: { type: 'string', nullable: true },
    world_confidence: { type: 'number' },
    chapter_ref: { type: 'string', nullable: true },
    chapter_confidence: { type: 'number' },
    starts_something: { type: 'boolean' },
    contexts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, relevance: { type: 'number' } },
        required: ['ref', 'relevance'],
      },
    },
    reason: { type: 'string' },
  },
  required: [
    'world_ref',
    'world_confidence',
    'chapter_ref',
    'chapter_confidence',
    'starts_something',
    'contexts',
    'reason',
  ],
};

const RULES = `FILING
Gremly keeps each thing a person drops in the part of their life it belongs to, so they find it there later. Decide where this one drop goes.

WHAT THEY HAVE
- A World is a lasting part of the person's life.
- A Chapter is something with a shape inside one World: it has a beginning, and it may have dates and an end. A Chapter that is over is marked closed.
- Under a World or a Chapter are the things the person placed there themselves, when there are any. They show what the person keeps there. Read them as a sense of the place, never as rules.

WHERE IT GOES
- Choose at most one Chapter and at most one World.
- A Chapter takes the drop only when the drop is part of that Chapter itself: it belongs to what the Chapter is, gets ready for it, or comes out of it. Sharing a place, a person or a subject with a Chapter is not enough.
- A closed Chapter takes a drop only when the drop looks back on what happened in it.
- A Chapter whose dates are far from the drop's date takes it only when the drop is plainly about that Chapter. A drop whose date falls within a Chapter's dates is not part of it for that reason alone.
- When you choose a Chapter, world_ref is the Chapter's own World.
- Otherwise the drop goes to the World whose part of life it is about. When it touches more than one, choose the one it is mostly for.
- A note on how a day or a stretch of time went, touching several parts of life, goes to a World only when one part of life is plainly what it is about.
- When the part of life the drop is about is not among the Worlds, choose none, even when it shares a word, a place or a person with one of them. Never choose the nearest one just to place it somewhere.

HOW SURE
- world_confidence and chapter_confidence: how sure you are, from 0 to 1, that the person would agree the drop belongs there. Give 0 for one you did not choose.

THE START OF SOMETHING
- starts_something is true only when no Chapter fits the drop and the drop looks like the beginning of something with a shape of its own that the person may want to follow as a Chapter. Otherwise it is false.

LIFE CONTEXTS
- When life contexts are listed: each is a part of life that shapes how the person spends time. List each one the drop happened within, with how sure you are from 0 to 1. Listing none is fine. When none are listed, give an empty list.

REASON
- reason: one short sentence on where the drop went and why, for Gremly's own records.`;

export function filingSystemPrompt() {
  return RULES;
}

const oneLine = (s, n) => {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const PHASE_WORDS = {
  suggested: 'suggested by Gremly, not yet taken up',
  upcoming: 'ahead',
  active: 'under way',
  closed: 'closed',
};

function datesOf(c) {
  if (c.start_date && c.end_date) return `${c.start_date} to ${c.end_date}`;
  if (c.start_date) return `from ${c.start_date}`;
  if (c.end_date) return `until ${c.end_date}`;
  return 'no dates';
}

const placedLine = (titles) =>
  titles?.length ? `\n    placed there by them: ${titles.map((t) => `"${oneLine(t, 80)}"`).join('; ')}` : '';

/**
 * The request for one drop. refs maps each short ref the model is shown to the
 * World, Chapter or life context it stands for, so a ref it was never given is
 * caught.
 *
 * @param drop { text, title, entity_type, date, tags, people }
 * @param graph { worlds, chapters, contexts }
 * @param placed { worlds: Map id -> titles, chapters: Map id -> titles }
 */
export function filingRequest({ drop, graph, placed = {}, today }) {
  const refs = new Map();
  const worldRef = new Map();
  const worldLines = (graph.worlds || []).map((w, i) => {
    const ref = `w${i + 1}`;
    refs.set(ref, { type: 'world', id: w.id, name: w.name });
    worldRef.set(w.id, ref);
    return `${ref} | ${oneLine(w.name, 80)} | ${oneLine(w.description, 240) || '(no words yet)'}${placedLine(placed.worlds?.get(w.id))}`;
  });
  const chapterLines = (graph.chapters || []).map((c, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, {
      type: 'chapter',
      id: c.id,
      title: c.title,
      world_id: c.primary_world_id || null,
    });
    const world = worldRef.get(c.primary_world_id) || 'a World not listed';
    return `${ref} | ${oneLine(c.title, 80)} | in ${world} | ${datesOf(c)} | ${PHASE_WORDS[c.phase] || c.phase || 'open'} | ${oneLine(c.description, 240) || '(no words yet)'}${placedLine(placed.chapters?.get(c.id))}`;
  });
  const contextLines = (graph.contexts || []).map((x, i) => {
    const ref = `x${i + 1}`;
    refs.set(ref, { type: 'context', id: x.id, name: x.name });
    return `${ref} | ${oneLine(x.name, 80)} | ${oneLine(x.description, 200) || x.kind || ''}`;
  });

  const about = [
    drop.title ? `title: ${oneLine(drop.title, 200)}` : null,
    `words: ${String(drop.text || '').slice(0, TEXT_MAX)}`,
    drop.tags?.length ? `tags: ${drop.tags.slice(0, 10).join(', ')}` : null,
    drop.people?.length ? `people named: ${drop.people.slice(0, 10).join(', ')}` : null,
  ].filter(Boolean);

  const user = [
    `TODAY: ${today}`,
    '',
    `THE DROP (a ${drop.entity_type || 'drop'}, dated ${drop.date || today})`,
    ...about,
    '',
    `WORLDS (ref | name | what it is)\n${worldLines.join('\n') || '(none)'}`,
    '',
    `CHAPTERS (ref | title | its World | dates | where it is | what it is)\n${chapterLines.join('\n') || '(none)'}`,
    '',
    `LIFE CONTEXTS (ref | name | what it is)\n${contextLines.join('\n') || '(none listed)'}`,
  ].join('\n');

  return { system: filingSystemPrompt(), user, refs };
}

const confidence = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * Where the drop goes, from the model's answer: the bar, the refs and the
 * Chapter's own World are code's. Pure.
 * @returns {{ world, chapter, contexts, starts_something, confidence, problems }}
 */
export function decideFiling(output, refs, { cut = FILING_CUT, contextCut = CONTEXT_CUT } = {}) {
  const problems = [];
  const pick = (ref, type) => {
    if (ref == null || ref === '') return null;
    const r = refs.get(String(ref));
    if (!r || r.type !== type) {
      problems.push(`${type} ref ${ref} was never given`);
      return null;
    }
    return r;
  };
  const world = pick(output?.world_ref, 'world');
  const chapter = pick(output?.chapter_ref, 'chapter');
  const wc = confidence(output?.world_confidence);
  const cc = confidence(output?.chapter_confidence);

  let filedWorld = null;
  let filedChapter = null;
  if (chapter && cc >= cut.chapter) {
    filedChapter = chapter;
    // a Chapter's World is its own, whatever World was named beside it
    const own = [...refs.values()].find((r) => r.type === 'world' && r.id === chapter.world_id);
    filedWorld = own || null;
  } else if (world && wc >= cut.world) {
    filedWorld = world;
  }

  const seen = new Set();
  const contexts = [];
  for (const x of Array.isArray(output?.contexts) ? output.contexts : []) {
    const r = pick(x?.ref, 'context');
    if (!r || seen.has(r.id)) continue;
    const rel = confidence(x?.relevance);
    if (rel < contextCut) continue;
    seen.add(r.id);
    contexts.push({ id: r.id, name: r.name, relevance: rel });
  }

  return {
    world: filedWorld ? { id: filedWorld.id, name: filedWorld.name } : null,
    chapter: filedChapter ? { id: filedChapter.id, title: filedChapter.title } : null,
    contexts,
    starts_something: output?.starts_something === true && !filedChapter,
    confidence: { world: filedChapter ? Math.max(wc, cc) : wc, chapter: cc },
    // what the AI named, whether or not it cleared the bar, for the logs and the replays
    choice: { world: world?.name || null, chapter: chapter?.title || null },
    problems,
  };
}

// ── reads ────────────────────────────────────────────────────────────────

/**
 * The person's Worlds, Chapters and, until the old fields stop, life contexts.
 * Suggested rows and the old World phases are filed into until then too, as
 * before stage 4a, since the old screens still show them.
 */
export async function loadGraph(env, userId) {
  const d = db(env);
  const stopped = oldWorldsFieldsStopped(env);
  const worldPhases = stopped ? 'active' : 'candidate,active,evolving';
  const chapterPhases = stopped ? 'upcoming,active,closed' : 'suggested,upcoming,active,closed';
  const [worlds, chapters, contexts] = await Promise.all([
    d.select(
      `worlds?owner_id=eq.${userId}&phase=in.(${worldPhases})&select=id,name,description&order=created_at.asc`,
    ),
    d.select(
      `chapters?owner_id=eq.${userId}&phase=in.(${chapterPhases})&select=id,title,description,primary_world_id,phase,start_date,end_date&order=created_at.asc`,
    ),
    stopped
      ? Promise.resolve([])
      : d.select(
          `life_contexts?owner_id=eq.${userId}&active=is.true&select=id,name,kind,description&order=created_at.asc`,
        ),
  ]);
  return { worlds: worlds || [], chapters: chapters || [], contexts: contexts || [] };
}

const ITEM_TABLE = { todo: 'todos', note: 'notes', habit: 'habits' };

/** The title of each item, by type and id: the few the person placed themselves. */
async function titlesOf(d, links) {
  const byType = new Map();
  for (const l of links) {
    if (!ITEM_TABLE[l.drop_type]) continue;
    if (!byType.has(l.drop_type)) byType.set(l.drop_type, new Set());
    byType.get(l.drop_type).add(l.drop_id);
  }
  const titles = new Map();
  for (const [type, ids] of byType) {
    const cols = type === 'note' ? 'id,title,body' : 'id,title';
    const rows = await d.select(`${ITEM_TABLE[type]}?id=in.(${[...ids].join(',')})&select=${cols}`);
    for (const r of rows || []) titles.set(r.id, r.title || oneLine(r.body, 80) || null);
  }
  return titles;
}

/**
 * The items the person placed in each World and Chapter themselves, newest
 * first, a few each, by title: what filing is shown as their own sense of each.
 */
export async function loadPlaced(env, userId) {
  const d = db(env);
  const [w, c] = await Promise.all([
    d.select(
      `drop_world_links?owner_id=eq.${userId}&assigned_by=eq.user&select=drop_id,drop_type,world_id,created_at&order=created_at.desc&limit=60`,
    ),
    d.select(
      `drop_chapter_links?owner_id=eq.${userId}&assigned_by=eq.user&select=drop_id,drop_type,chapter_id,created_at&order=created_at.desc&limit=60`,
    ),
  ]);
  const links = [...(w || []), ...(c || [])];
  if (!links.length) return { worlds: new Map(), chapters: new Map() };
  const titles = await titlesOf(d, links);
  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows || []) {
      const t = titles.get(r.drop_id);
      if (!t) continue;
      const list = m.get(r[key]) || [];
      if (list.length < PLACED_SHOWN) list.push(t);
      m.set(r[key], list);
    }
    return m;
  };
  return { worlds: group(w, 'world_id'), chapters: group(c, 'chapter_id') };
}

/** Where the person put this drop themselves, if anywhere: only their own rows are read. */
async function placedByPerson(d, userId, drop) {
  const f = `owner_id=eq.${userId}&drop_id=eq.${drop.id}&drop_type=eq.${drop.entity_type}&assigned_by=eq.user`;
  const [w, c] = await Promise.all([
    d.select(`drop_world_links?${f}&select=world_id,world:worlds(id,name)`),
    d.select(`drop_chapter_links?${f}&select=chapter_id,chapter:chapters(id,title)`),
  ]);
  if (!(w || []).length && !(c || []).length) return null;
  const one = (row, key) => (Array.isArray(row?.[key]) ? row[key][0] : row?.[key]) || null;
  const world = one(w?.[0], 'world');
  const chapter = one(c?.[0], 'chapter');
  return {
    world: world ? { id: world.id, name: world.name } : null,
    chapter: chapter ? { id: chapter.id, title: chapter.title } : null,
  };
}

/**
 * The Worlds and Chapters the person took this drop out of themselves
 * (drop_link_removals, written by the app). Never throws: when it cannot be
 * read, none are known, as before the table.
 */
export async function takenOutOf(d, userId, drop) {
  const none = { worlds: new Set(), chapters: new Set() };
  try {
    const rows = await d.select(
      `drop_link_removals?owner_id=eq.${userId}&drop_id=eq.${drop.id}&drop_type=eq.${drop.entity_type}&select=place_type,place_id`,
    );
    for (const r of rows || []) {
      if (r.place_type === 'world') none.worlds.add(r.place_id);
      else if (r.place_type === 'chapter') none.chapters.add(r.place_id);
    }
  } catch (err) {
    console.warn(`[filing] what was taken out could not be read: ${err.message}`);
  }
  return none;
}

/**
 * The graph without the places a drop was taken out of: those Worlds, those
 * Chapters, and the Chapters of those Worlds. Pure.
 */
export function withoutTakenOut(graph, out) {
  if (!out || (!out.worlds.size && !out.chapters.size)) return graph;
  return {
    ...graph,
    worlds: graph.worlds.filter((w) => !out.worlds.has(w.id)),
    chapters: graph.chapters.filter(
      (c) => !out.chapters.has(c.id) && !out.worlds.has(c.primary_world_id),
    ),
  };
}

// ── the one run ──────────────────────────────────────────────────────────

/** An empty answer, with why. */
function skipped(reason, extra = {}) {
  return {
    skipped: true,
    skipped_reason: reason,
    by: null,
    world: null,
    chapter: null,
    contexts: [],
    starts_something: false,
    reason: null,
    counts: { world_links: 0, chapter_links: 0, context_links: 0 },
    ...extra,
  };
}

/**
 * File one drop: read what the person has, ask, apply the bar, write. Never
 * throws: a step that fails comes back as skipped with its reason, and is
 * logged.
 *
 * @param drop { id, entity_type, text, title, date, tags, people }
 * @param opts.graph, opts.placed  already loaded (the backfill loads them once)
 */
export async function fileDrop(env, { userId, drop, today = null, graph = null, placed = null }) {
  const d = db(env);
  let person;
  try {
    person = await placedByPerson(d, userId, drop);
  } catch (err) {
    console.warn(`[filing] reading the person's own filing failed: ${err.message}`);
    return skipped('read_failed');
  }
  if (person) {
    // theirs stands: nothing is asked and nothing is written
    return {
      ...skipped(null),
      skipped: false,
      skipped_reason: null,
      by: 'person',
      world: person.world,
      chapter: person.chapter,
    };
  }

  let g = graph;
  let p = placed;
  try {
    if (!g) g = await loadGraph(env, userId);
    if (!p) p = await loadPlaced(env, userId);
  } catch (err) {
    console.warn(`[filing] reading the graph failed: ${err.message}`);
    return skipped('graph_load_failed');
  }
  // never back in a place they took it out of
  g = withoutTakenOut(g, await takenOutOf(d, userId, drop));
  if (!g.worlds.length && !g.chapters.length && !g.contexts.length) return skipped('empty_graph');

  const day = today || localDate(await userTimezone(env, userId).catch(() => 'UTC'));
  const { system, user, refs } = filingRequest({ drop, graph: g, placed: p, today: day });
  let output;
  let model;
  try {
    ({ output, model } = await jsonCall(env, {
      primary: modelFor(env, 'filing'),
      fallback: modelFor(env, 'filingFallback'),
      system,
      user,
      schema: FILING_SCHEMA,
      maxTokens: 1500,
      effort: 'low',
      thinking: 'low',
    }));
  } catch (err) {
    console.warn(`[filing] no model could be asked: ${err.message}`);
    return skipped('model_failed');
  }

  const decided = decideFiling(output, refs);
  if (decided.problems.length) console.warn(`[filing] ${decided.problems.join('; ')}`);
  const reason = typeof output?.reason === 'string' ? output.reason.slice(0, 500) : null;
  const { counts, error } = await writeFiling(env, { userId, drop, decided, reason });
  // the reply says only what was written: a filing that could not be written is no filing
  if (error) return skipped('write_failed', { counts, model });

  return {
    skipped: false,
    skipped_reason: null,
    by: decided.world || decided.chapter ? 'gremly' : null,
    world: decided.world,
    chapter: decided.chapter,
    contexts: decided.contexts,
    starts_something: decided.starts_something,
    confidence: decided.confidence,
    choice: decided.choice,
    reason,
    model,
    prompt_version: FILING_PROMPT_VERSION,
    counts,
  };
}

/**
 * Write one drop's filing. Gremly's own earlier filing of the drop is replaced,
 * so a drop is in one World and at most one Chapter; what the person placed is
 * never touched (fileDrop does not reach here for a drop they placed, and only
 * the person's own rows are ever written or cleared). The new filing is
 * written before the old is cleared, so a write that fails leaves the old one
 * standing. Returns the counts written, and the error when a write failed.
 */
export async function writeFiling(env, { userId, drop, decided, reason }) {
  const d = db(env);
  const counts = { world_links: 0, chapter_links: 0, context_links: 0 };
  const mine = `owner_id=eq.${userId}&drop_id=eq.${drop.id}&drop_type=eq.${drop.entity_type}&assigned_by=eq.classifier`;
  const row = (extra, relevance) => ({
    drop_id: drop.id,
    drop_type: drop.entity_type,
    owner_id: userId,
    relevance_score: Number(relevance.toFixed(3)),
    assigned_by: 'classifier',
    reason,
    ...extra,
  });
  try {
    if (decided.world) {
      await d.upsert(
        'drop_world_links',
        [row({ world_id: decided.world.id }, decided.confidence.world)],
        'drop_id,drop_type,world_id',
      );
      counts.world_links = 1;
    }
    if (decided.chapter) {
      await d.upsert(
        'drop_chapter_links',
        [row({ chapter_id: decided.chapter.id }, decided.confidence.chapter)],
        'drop_id,drop_type,chapter_id',
      );
      counts.chapter_links = 1;
    }
    await d.remove(
      `drop_world_links?${mine}${decided.world ? `&world_id=neq.${decided.world.id}` : ''}`,
    );
    await d.remove(
      `drop_chapter_links?${mine}${decided.chapter ? `&chapter_id=neq.${decided.chapter.id}` : ''}`,
    );
    if (decided.contexts.length && !oldWorldsFieldsStopped(env)) {
      await d.upsert(
        'drop_context_links',
        decided.contexts.map((x) => row({ context_id: x.id }, x.relevance)),
        'drop_id,drop_type,context_id',
      );
      counts.context_links = decided.contexts.length;
    }
    return { counts, error: null };
  } catch (err) {
    console.warn(`[filing] writing the filing failed: ${err.message}`);
    return { counts, error: String(err.message || err).slice(0, 300) };
  }
}

/**
 * The reply the app keeps: where the drop went, by name, and whether it looks
 * like the start of something. The counts stay for older app builds.
 */
export function filingReply(f) {
  return {
    world_links: f.counts?.world_links ?? 0,
    chapter_links: f.counts?.chapter_links ?? 0,
    context_links: f.counts?.context_links ?? 0,
    reason: f.reason ?? null,
    skipped: !!f.skipped,
    ...(f.skipped_reason ? { skipped_reason: f.skipped_reason } : {}),
    filed: {
      by: f.by,
      world: f.world,
      chapter: f.chapter,
      starts_something: !!f.starts_something,
    },
  };
}

/** The person's day, for filing outside a request (the backfill). */
export async function personToday(env, userId) {
  const tz = await userTimezone(env, userId).catch(() => 'UTC');
  return localDate(tz);
}

/**
 * The drops to file for one person, oldest first, made before a time: every
 * drop with refile, otherwise only those filed nowhere yet. Calendar notes
 * and archived items are left out, as before.
 */
export async function listDropsToFile(env, userId, { before, refile = false }) {
  const d = db(env);
  const cutoff = encodeURIComponent(before);
  const [notes, todos, habits] = await Promise.all([
    d.select(
      `notes?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&external_source=is.null&select=id,body,title,date,created_at,tags`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&select=id,body,notes,name,title,created_at,tags`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&select=id,notes,title,name,created_at,tags`,
    ),
  ]);
  const all = [
    ...(notes || []).map((r) => dropFromRow('note', r)),
    ...(todos || []).map((r) => dropFromRow('todo', r)),
    ...(habits || []).map((r) => dropFromRow('habit', r)),
  ]
    .filter((x) => x.text.trim())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (refile) return all;
  const filed = new Set();
  for (const [table, key] of [
    ['drop_world_links', 'world_id'],
    ['drop_chapter_links', 'chapter_id'],
  ]) {
    for (let offset = 0; ; offset += 1000) {
      // pages in the order of the whole key, so none is skipped between pages
      const rows = await d.select(
        `${table}?owner_id=eq.${userId}&select=drop_id,drop_type&order=drop_id.asc,drop_type.asc,${key}.asc&limit=1000&offset=${offset}`,
      );
      for (const r of rows || []) filed.add(`${r.drop_type}:${r.drop_id}`);
      if (!rows || rows.length < 1000) break;
    }
  }
  return all.filter((x) => !filed.has(`${x.entity_type}:${x.id}`));
}

/** A drop as filing reads it, from its saved row (the backfill). */
export function dropFromRow(type, r) {
  const text = type === 'note' ? r.body : type === 'todo' ? r.body ?? r.notes : r.notes;
  const title = type === 'habit' ? r.title ?? r.name : r.title ?? r.name;
  const date = String((type === 'note' && r.date) || r.created_at || '').slice(0, 10) || null;
  return {
    id: r.id,
    entity_type: type,
    text: String(text || title || '').slice(0, TEXT_MAX),
    title: title || null,
    date,
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string') : [],
    people: [],
  };
}
