/**
 * What a correction rewrites (data fabric stage 6, its second and third steps).
 *
 * The first step (corrections.js) works out what the person put right and
 * changes the facts and people. This module then finds, in passage_refs, every
 * stored sentence that rests on what changed, and sends each back to its own
 * writer's one sentence path with the records it rests on as they now stand:
 *
 *   daily   a line of the day, rewritten with the daily picture's own rules for
 *           that line (daily.js rewriteSystemPrompt) and checked
 *   words   the words under a World or Chapter, written again by the words
 *           writer from what is filed, as it now stands (words.js); words the
 *           writer no longer keeps, under a Chapter that has ended, and the
 *           line about a person (personWords.js), go through its one
 *           sentence path
 *   memory  a Chapter's memory, written again by the memory writer (memory.js)
 *   story   a story item's title or body, rewritten with the story's rules
 *           (story.js storyRewritePrompt) and checked
 *   weekly  Gremly's notes on a World or Chapter and a Life Map thread, rewritten with
 *           the weekly pass's rules (weekly.js weeklyNoteRewritePrompt) and checked
 *
 * A sentence resting on a fact that was corrected, changed or happened, or on
 * someone in such a fact, is asked about again; one that still holds against
 * its records stands as it is, one that does not is written again once, and
 * one still wrong is cleared: blank is better than wrong. A fact newly kept
 * private takes only what is seen at a glance: a glanceable sentence resting
 * on it is cleared, and nothing else was wrong. A line they said is not so
 * (corrections.js names it), and a line resting on a fact they said is wrong,
 * is written again first with what they said, and what comes back is checked:
 * the words question asks only who, when and how many.
 *
 * Code finds the sentences and puts back what the writers return. It never
 * writes a sentence itself.
 */

import { db, weekdayName } from './db';
import { jsonCall, modelFor } from './llm';
import { runCheck, problemWords } from '../../shared/check/run.js';
import { SENTENCE_SCHEMA } from '../../shared/check/stated.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { whoSaid } from '../../shared/whoSaid.js';
import { rewriteSystemPrompt as dailyRewritePrompt } from './daily';
import { writeWords, wordsRewritePrompt } from './words';
import { personWordsRewritePrompt } from './personWords';
import { writeMemory, memoryRewritePrompt } from './memory';
import { storyRewritePrompt } from './story';
import { weeklyNoteRewritePrompt } from './weekly';

/** The lines of the day seen at a glance (daily.js daySentences), by the field that holds them. */
const DAY_GLANCE = /^(brief_headline|brief\.day_shape|lead_story\.(what|why_today)|today_focus\.\d+|brief\.reach\.why)$/;

/** The daily picture's key for a line, from the field that holds it (daily.js). */
export function dailyKey(field) {
  const f = String(field || '');
  if (f === 'brief_headline') return 'headline';
  if (f === 'brief.day_shape') return 'day_shape';
  if (f === 'lead_story.what') return 'lead_what';
  if (f === 'lead_story.why_today') return 'lead_why_today';
  if (f === 'brief.reach.why') return 'reach_why';
  if (f === 'brief.return.note') return 'return_note';
  let m = /^today_focus\.(\d+)$/.exec(f);
  if (m) return `today_focus_${m[1]}`;
  m = /^also_matters\.(\d+)$/.exec(f);
  if (m) return `also_matters_${m[1]}`;
  m = /^brief\.claims\.(\d+)\.why$/.exec(f);
  if (m) return `claims_${m[1]}_why`;
  return f;
}

/** Whether a stored sentence is seen at a glance. */
export function glanceable(row) {
  if (row.writer === 'daily') return DAY_GLANCE.test(row.field);
  // the words under a World or Chapter are read at a glance on its card
  if (row.writer === 'words') return true;
  return false;
}

const uniq = (list) => [...new Set((list || []).filter(Boolean))];

/**
 * The stored sentences resting on what changed, from passage_refs. A sentence
 * resting only on a fact newly kept private is kept only when it is seen at a
 * glance. Each comes back with why: 'changed' or 'private'.
 */
export async function restingPassages(d, userId, { changedIds = [], privateIds = [], personIds = [] }) {
  const changed = uniq(changedIds);
  const priv = uniq(privateIds);
  const people = uniq(personIds);
  if (!changed.length && !priv.length && !people.length) return [];
  const ors = [];
  const facts = uniq([...changed, ...priv]);
  if (facts.length) ors.push(`fact_ids.ov.{${facts.join(',')}}`);
  if (people.length) ors.push(`person_ids.ov.{${people.join(',')}}`);
  const rows =
    (await d.select(
      `passage_refs?user_id=eq.${userId}&or=(${ors.join(',')})&select=id,surface,row_table,row_id,field,fact_ids,person_ids,items,writer&limit=500`,
    )) || [];
  const changedSet = new Set(changed);
  const peopleSet = new Set(people);
  const out = [];
  for (const r of rows) {
    const why =
      (r.fact_ids || []).some((id) => changedSet.has(id)) || (r.person_ids || []).some((id) => peopleSet.has(id))
        ? 'changed'
        : 'private';
    if (why === 'private' && !glanceable(r)) continue;
    out.push({ ...r, why });
  }
  return out;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) return false;
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return true;
}

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * The records a stored sentence rests on, as they now stand, in the shape the
 * check reads (shared/check/stated.js), with refs r1, r2 and so on, and what
 * the person just said as a record of its own. Pure.
 */
export function restingRecords({ facts = [], people = [], items = [], said, added = [] }) {
  const records = new Map();
  const ids = new Map();
  // each label carries its ref, as the writer and the words question read it
  const add = (record, id) => {
    const ref = `r${records.size + 1}`;
    records.set(ref, { ref, ...record, label: `${ref} | ${record.label}` });
    if (id) ids.set(ref, id);
    return ref;
  };
  for (const f of facts) {
    const day = f.about_date ? String(f.about_date).slice(0, 10) : null;
    const end = f.about_date_end ? String(f.about_date_end).slice(0, 10) : null;
    const state =
      f.state === 'corrected'
        ? `put right by them; they said it is wrong: "${trim(f.correction_text, 300)}"`
        : f.state === 'changed'
          ? 'changed since; it no longer holds as said'
          : f.state === 'set_aside'
            ? 'set aside by them; they asked Gremly to stop holding it, so nothing may rest on it'
            : f.state;
    add(
      {
        label: `fact (${state}${day ? `; the day it is about ${day}${end && end !== day ? ` to ${end}` : ''}` : ''}): ${trim(f.statement, 300)}`,
        dates: [day, end].filter(Boolean),
        ...(day && end && end !== day ? { spans: [[day, end]] } : {}),
        private: !!f.private,
        health: !!f.health,
      },
      { type: 'fact', id: f.id },
    );
  }
  for (const f of added)
    add(
      {
        label: `fact, from what they just said: ${trim(f.statement, 300)}`,
        dates: [f.about_date].filter(Boolean),
      },
      f.id ? { type: 'fact', id: f.id } : null,
    );
  for (const p of people)
    add(
      {
        label: `person: ${p.name || 'unnamed'}${p.relationship ? `, their ${whoSaid(p)}` : ', who they are to them is not recorded'}`,
        names: [p.name].filter(Boolean),
        exact: ['person'],
      },
      { type: 'person', id: p.id },
    );
  for (const it of items)
    add({ label: `${it.kind}${['gremly_questions', 'story_items'].includes(it.table) ? '' : ' of theirs'}: ${trim(it.title, 200)}` }, { type: 'item', table: it.table, id: it.id });
  add({ label: `what they have just told Gremly: "${trim(said, 600)}"` }, null);
  return { records, ids };
}

// how each kind of item a sentence rests on is read: who owns it, its words, what it is
const ITEM_READ = {
  notes: ['owner_id', 'title', 'a note'],
  todos: ['owner_id', 'title', 'a todo'],
  habits: ['owner_id', 'title', 'a habit'],
  synced_calendar_events: ['owner_id', 'title', 'a calendar entry'],
  gremly_questions: ['user_id', 'question', 'a question Gremly asked'],
  story_items: ['user_id', 'title', 'an item of their story'],
};

/** Read what the sentences rest on, as it now stands. */
async function readResting(d, userId, rows) {
  const factIds = uniq(rows.flatMap((r) => r.fact_ids || []));
  const personIds = uniq(rows.flatMap((r) => r.person_ids || []));
  const items = rows.flatMap((r) => (Array.isArray(r.items) ? r.items : []));
  const byTable = new Map();
  for (const it of items) if (it?.table && it?.id) byTable.set(it.table, uniq([...(byTable.get(it.table) || []), it.id]));
  const [facts, people, ...itemRows] = await Promise.all([
    factIds.length
      ? d.select(
          `life_facts?user_id=eq.${userId}&id=in.(${factIds.join(',')})&select=id,statement,about_date,about_date_end,state,private,health,correction_text`,
        )
      : [],
    personIds.length
      ? d.select(`life_people?user_id=eq.${userId}&id=in.(${personIds.join(',')})&select=id,name,relationship,relationship_by`)
      : [],
    ...[...byTable.entries()].map(([table, ids]) => {
      const how = ITEM_READ[table];
      if (!how) {
        console.warn(`[ALERT][Corrections] a sentence rests on ${table}, which a correction cannot read: left out of its records`);
        return [];
      }
      const [owner, words, kind] = how;
      return d
        .select(`${table}?${owner}=eq.${userId}&id=in.(${ids.join(',')})&select=id,${words}`)
        .then((list) => (list || []).map((x) => ({ id: x.id, title: x[words], table, kind })))
        .catch((err) => {
          console.warn(`[ALERT][Corrections] the ${table} a sentence rests on could not be read for ${userId}: ${String(err?.message || err).slice(0, 160)}`);
          return [];
        });
    }),
  ]);
  return {
    facts: new Map((facts || []).map((f) => [f.id, f])),
    people: new Map((people || []).map((p) => [p.id, p])),
    items: new Map(itemRows.flat().map((x) => [`${x.table}:${x.id}`, x])),
  };
}

/** Where a sentence lives, and its words now. */
async function readSentence(d, userId, row, cache) {
  const key = `${row.row_table}:${row.row_id}`;
  if (!cache.has(key)) {
    let value = null;
    if (row.row_table === 'user_daily_state')
      value = (await d.select(`user_daily_state?id=eq.${row.row_id}&user_id=eq.${userId}&select=id,dco`))?.[0] || null;
    else if (row.row_table === 'user_life_map')
      value = (await d.select(`user_life_map?id=eq.${row.row_id}&user_id=eq.${userId}&select=id,life_map`))?.[0] || null;
    else if (row.row_table === 'story_items')
      value = (await d.select(`story_items?id=eq.${row.row_id}&user_id=eq.${userId}&select=id,kind,title,body,state,private`))?.[0] || null;
    else if (row.row_table === 'chapters')
      value =
        (await d.select(`chapters?id=eq.${row.row_id}&owner_id=eq.${userId}&select=id,title,summary,summary_source,card_subtitle,card_subtitle_source,epigraph,epigraph_source`))?.[0] || null;
    else if (row.row_table === 'worlds')
      value =
        (await d.select(`worlds?id=eq.${row.row_id}&owner_id=eq.${userId}&select=id,name,display_name,summary,summary_source,card_subtitle,card_subtitle_source`))?.[0] || null;
    else if (row.row_table === 'life_people')
      value = (await d.select(`life_people?id=eq.${row.row_id}&user_id=eq.${userId}&select=id,name,words`))?.[0] || null;
    cache.set(key, value);
  }
  const value = cache.get(key);
  if (!value) return { value: null, text: null };
  if (row.row_table === 'user_daily_state') return { value, text: getPath(value.dco || {}, row.field) };
  if (row.row_table === 'user_life_map') return { value, text: getPath(value.life_map || {}, row.field) };
  return { value, text: value[row.field] ?? null };
}

/** A World or Chapter by its name, as a writer is told where a sentence is kept. */
function placeName(row, value) {
  const name = row.row_table === 'worlds' ? value?.display_name || value?.name : value?.title;
  return `${row.row_table === 'worlds' ? 'World' : 'Chapter'}${name ? ` "${trim(name, 80)}"` : ''}`;
}

/** The writer's one sentence path for a stored sentence: its system prompt and what it is told. */
function sentencePath(row, { person, today, value }) {
  if (row.writer === 'daily') {
    const key = dailyKey(row.field);
    return { key, system: dailyRewritePrompt(person, key), head: `FIELD: ${key}\nTODAY: ${weekdayName(today)} ${today}.` };
  }
  if (row.writer === 'story')
    return {
      key: `story.${row.field}`,
      system: storyRewritePrompt(person, row.field),
      head: `THE STORY ITEM: ${value?.kind || 'an item'}, its ${row.field}\nTODAY: ${weekdayName(today)} ${today}.`,
    };
  if (row.writer === 'weekly')
    return {
      key: `weekly.${row.field}`,
      system: weeklyNoteRewritePrompt(person),
      head: `WHERE IT IS KEPT: ${row.row_table === 'user_life_map' ? 'a thread of their Life Map' : `Gremly's notes on the ${placeName(row, value)}`}\nTODAY: ${weekdayName(today)} ${today}.`,
    };
  if (row.writer === 'memory')
    return {
      key: `memory.${row.field}`,
      system: memoryRewritePrompt(person),
      head: `THE MEMORY OF THE ${placeName(row, value)}\nTODAY: ${weekdayName(today)} ${today}.`,
    };
  if (row.writer === 'words' && row.row_table === 'life_people')
    return {
      key: `words.${row.field}`,
      system: personWordsRewritePrompt(person),
      head: `THE LINE ABOUT ${value?.name ? `"${trim(value.name, 60)}"` : 'SOMEONE IN THEIR LIFE'}\nTODAY: ${weekdayName(today)} ${today}.`,
    };
  if (row.writer === 'words')
    return {
      key: `words.${row.field}`,
      system: wordsRewritePrompt(person),
      head: `THE WORDS UNDER THE ${placeName(row, value)}\nTODAY: ${weekdayName(today)} ${today}.`,
    };
  return null;
}

const askWords = (env) => async (req) =>
  (
    await jsonCall(env, {
      primary: modelFor(env, 'check'),
      fallback: modelFor(env, 'checkFallback'),
      ...req,
      maxTokens: 900,
      effort: 'low',
      thinking: 'low',
    })
  ).output;

/**
 * Send each stored sentence resting on what changed back to its own writer,
 * and keep what stands. Never throws for one sentence: a sentence that cannot
 * be written again is cleared, and said.
 * @returns {{ asked, kept, rewritten, cleared, words, memories, details }}
 */
export async function rewritePassages(env, { userId, person, today, said, added = [], rows, nowIso }) {
  const d = db(env);
  const out = { asked: 0, kept: 0, rewritten: 0, cleared: 0, words: 0, memories: 0, details: [] };
  if (!rows.length) return out;

  // the words under a World or Chapter and a Chapter's memory are one sentence
  // each, written again whole by their own writers from what is filed now
  // a line they named goes through its writer's one sentence path below, told
  // what they said; the rest are written again whole from what is filed now
  const wordsTargets = uniq(
    rows.filter((r) => r.writer === 'words' && !r.pointed).map((r) => `${r.row_table}:${r.row_id}`),
  ).map((k) => ({ table: k.split(':')[0], id: k.split(':')[1] }));
  // the words the writer keeps (open Worlds and Chapters); any it does not
  // keep go through its one sentence path below
  const wroteWords = new Set();
  if (wordsTargets.length) {
    try {
      const w = await writeWords(env, userId, { targets: wordsTargets, reason: 'correction' });
      out.words = (w.lines || []).length;
      for (const x of w.lines || []) {
        wroteWords.add(`${x.table}:${x.id}`);
        out.details.push({ table: x.table, id: x.id, field: x.field || 'words', writer: 'words', outcome: x.error ? 'failed' : x.outcome });
      }
    } catch (err) {
      // nothing is written past the writer when it fails: it is said, not hidden
      for (const t of wordsTargets) wroteWords.add(`${t.table}:${t.id}`);
      console.warn(`[ALERT][Corrections] the words could not be written again for ${userId}: ${String(err?.message || err).slice(0, 160)}`);
    }
  }
  const memoryChapters = uniq(rows.filter((r) => r.writer === 'memory' && !r.pointed).map((r) => r.row_id));
  for (const id of memoryChapters) {
    try {
      await writeMemory(env, userId, id);
      out.memories++;
    } catch (err) {
      console.warn(`[ALERT][Corrections] the memory of Chapter ${id} could not be written again for ${userId}: ${String(err?.message || err).slice(0, 160)}`);
    }
  }

  // every other sentence goes back to its writer's one sentence path
  const own = rows.filter(
    (r) =>
      ['daily', 'story', 'weekly'].includes(r.writer) ||
      (r.writer === 'words' && (r.pointed || !wroteWords.has(`${r.row_table}:${r.row_id}`))) ||
      (r.writer === 'memory' && r.pointed),
  );
  if (!own.length) return out;
  const resting = await readResting(d, userId, own);
  const cache = new Map();
  const changes = [];
  for (const row of own) {
    const { value, text } = await readSentence(d, userId, row, cache);
    if (typeof text !== 'string' || !text.trim()) continue;
    const path = sentencePath(row, { person, today, value });
    if (!path) continue;
    const { records, ids } = restingRecords({
      facts: (row.fact_ids || []).map((id) => resting.facts.get(id)).filter(Boolean),
      people: (row.person_ids || []).map((id) => resting.people.get(id)).filter(Boolean),
      items: (Array.isArray(row.items) ? row.items : []).map((it) => resting.items.get(`${it.table}:${it.id}`)).filter(Boolean),
      said,
      added,
    });
    const refs = [...ids.keys()];
    const [primary, fallback] =
      row.writer === 'daily'
        ? [modelFor(env, 'daily'), modelFor(env, 'dailyFallback')]
        : [modelFor(env, 'rewrite'), modelFor(env, 'rewriteFallback')];
    out.asked++;
    const rewrite = async ({ sentence, records: rs, problems }) =>
      (
        await jsonCall(env, {
          primary,
          fallback,
          system: path.system,
          user: `${path.head}\n\nRECORDS:\n${rs.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
          schema: SENTENCE_SCHEMA,
          maxTokens: 1500,
          thinking: 'low',
          effort: 'low',
        })
      ).output;
    const asked = {
      records,
      today,
      moment: row.writer === 'daily' ? 'written before the day begins, for the whole day' : 'kept until it is next written',
      person,
      ask: askWords(env),
      rewrite,
    };
    let check = null;
    // a line they named, or one resting on a fact they said is wrong, was
    // written from what is not so: it goes to its writer first, with what they
    // said and its records as they stand, and what comes back is checked. The
    // words question alone asks only who, when and how many, and would let
    // stand a line that speaks of what never was.
    const fromWrong = (row.fact_ids || []).some((id) => resting.facts.get(id)?.state === 'corrected');
    const writeFirst = row.pointed || fromWrong;
    let same = false;
    try {
      if (writeFirst) {
        const first = await rewrite({
          sentence: { text },
          records: [...records.values()],
          problems: [`what they have just told Gremly about it: "${trim(said, 400)}"`],
        });
        // the same words back, from a line they did not name: it still holds
        same = !row.pointed && String(first?.text || '').trim() === text.trim();
        if (first && String(first.text || '').trim())
          check = await runCheck({ items: [{ key: path.key, sentence: first, glanceable: glanceable(row) }], ...asked });
        else check = { results: new Map([[path.key, { outcome: 'left_out' }]]), details: [] };
      } else {
        check = await runCheck({
          // a stored sentence comes with no list of what it states
          items: [{ key: path.key, sentence: { text, refs, stated: [] }, glanceable: glanceable(row), listed: false }],
          ...asked,
        });
      }
    } catch (err) {
      check = null;
      console.warn(`[ALERT][Corrections] ${row.row_table} ${row.field} could not be asked about for ${userId}: ${String(err?.message || err).slice(0, 160)}`);
    }
    const r = check?.results.get(path.key);
    // a line written again first that passes is its rewrite, unless it came back as it was
    const outcome = r?.outcome === 'pass' && writeFirst && !same ? 'rewritten' : r?.outcome || 'left_out';
    if (outcome === 'pass') {
      out.kept++;
      out.details.push({ table: row.row_table, id: row.row_id, field: row.field, writer: row.writer, outcome: 'kept' });
      continue;
    }
    const next = outcome === 'rewritten' && r.sentence?.text ? trim(r.sentence.text, 4000) : null;
    if (next) out.rewritten++;
    else out.cleared++;
    out.details.push({
      table: row.row_table,
      id: row.row_id,
      field: row.field,
      writer: row.writer,
      outcome: next ? 'rewritten' : 'cleared',
      // which steps found it wrong, each try; the words stay in problems, never kept
      steps: check
        ? check.details.flatMap((x) => [...(x.first || []), ...(x.second || [])].map((p) => p.step))
        : ['unasked'],
      problems: check ? check.details.map((x) => problemWords(x)) : ['it could not be asked about'],
    });
    changes.push({ row, value, text: next, cited: next ? r.refs.map((x) => ids.get(x)).filter(Boolean) : [] });
  }
  await keepChanges(d, userId, changes, nowIso);
  return out;
}

function compactArrays(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p) cur = cur?.[k];
    if (Array.isArray(cur)) {
      const kept = cur.filter((x) => x != null);
      cur.length = 0;
      cur.push(...kept);
    }
  }
}

/**
 * Take corrected facts out of the structured parts of a DCO: date anchors,
 * the coming-up list, brief claims and the reach. Keeps the copies of the
 * focus and lead story in daily_focus in step with the top-level fields.
 */
function scrubDco(dco, corrected, retiredTitles = []) {
  const ids = new Set(corrected.map((f) => f.id));
  const statements = new Set([...corrected.map((f) => f.statement), ...retiredTitles]);
  if (Array.isArray(dco.named_anchors)) {
    dco.named_anchors = dco.named_anchors.filter((a) => !ids.has(a?.fact_id) && !statements.has(a?.title) && !statements.has(a?.label));
  }
  // the day frame: a corrected fact no longer sets travel or a set time
  const frame = dco.day_frame;
  if (frame && typeof frame === 'object') {
    const cites = (x) => (x?.fact_ids || []).some((id) => ids.has(id));
    if (Array.isArray(frame.blocks)) frame.blocks = frame.blocks.filter((b) => !ids.has(b?.fact_id));
    if (cites(frame.travel)) frame.travel = null;
    if (cites(frame.away)) frame.away = null;
  }
  if (Array.isArray(dco.active_today?.upcoming_in_7d)) {
    dco.active_today.upcoming_in_7d = dco.active_today.upcoming_in_7d.filter((u) => !statements.has(u?.title));
  }
  if (dco.brief) {
    if (Array.isArray(dco.brief.claims)) {
      dco.brief.claims = dco.brief.claims.filter((c) => c && !(c.type === 'fact' && ids.has(c.id)) && c.why !== null);
    }
    const r = dco.brief.reach;
    if (r && ((r.type === 'fact' && ids.has(r.id)) || (r.facts || []).some((f) => ids.has(f.id)) || r.why === null)) dco.brief.reach = null;
    if (dco.brief.return && dco.brief.return.note === null) dco.brief.return = null;
  }
  if (dco.lead_story && dco.lead_story.what == null) dco.lead_story = null;
  if (dco.lead_story && dco.lead_story.detail != null && dco.lead_story.what !== dco.lead_story.detail && dco.pipeline === 'dco-v4') {
    dco.lead_story.detail = dco.lead_story.what;
  }
  if (dco.daily_focus) {
    dco.daily_focus.today_focus = dco.today_focus || [];
    dco.daily_focus.lead_story = dco.lead_story || null;
  }
}

// the lines of a day held one to a field, which a tidy may take out
const SINGLE_LINES = ['brief_headline', 'brief.day_shape', 'lead_story.what', 'lead_story.why_today', 'brief.reach.why', 'brief.return.note'];
// where a claim stood before a tidy; a symbol, so it is never stored
const WAS = Symbol('was');

/**
 * Tidy a day after lines in it were cleared, or what they rest on was put
 * right: its lists close up over cleared lines, a claim, the reach or the
 * return whose words were cleared goes, a lead with nothing to say goes, and
 * anything resting on a fact in scrubbed, or on a retired date anchor, is
 * taken out. Changes dco in place. Returns where each line moved, field to
 * its field now or null where it went, so what each rests on can follow it
 * (moveDayRefs).
 */
export function tidyDay(dco, scrubbed = [], retired = []) {
  const moves = new Map();
  if (!dco || typeof dco !== 'object') return moves;
  const lists = {};
  for (const key of ['today_focus', 'also_matters'])
    if (Array.isArray(dco[key])) lists[key] = dco[key].map((x, i) => (x != null ? i : null));
  const claims = Array.isArray(dco.brief?.claims) ? dco.brief.claims : null;
  const claimsWere = claims ? claims.length : 0;
  if (claims) claims.forEach((c, i) => c && typeof c === 'object' && (c[WAS] = i));
  const singles = SINGLE_LINES.filter((f) => typeof getPath(dco, f) === 'string');
  compactArrays(dco, [['today_focus'], ['also_matters'], ['brief', 'claims']]);
  scrubDco(dco, scrubbed, retired);
  for (const [key, was] of Object.entries(lists)) {
    const kept = was.filter((i) => i != null);
    was.forEach((_, i) => {
      const j = kept.indexOf(i);
      if (j !== i) moves.set(`${key}.${i}`, j >= 0 ? `${key}.${j}` : null);
    });
  }
  if (claims) {
    const now = Array.isArray(dco.brief?.claims) ? dco.brief.claims : [];
    const at = new Map(now.map((c, j) => [c?.[WAS], j]));
    for (let i = 0; i < claimsWere; i++) {
      const j = at.has(i) ? at.get(i) : -1;
      if (j !== i) moves.set(`brief.claims.${i}.why`, j >= 0 ? `brief.claims.${j}.why` : null);
    }
    for (const c of claims) if (c && typeof c === 'object') delete c[WAS];
  }
  for (const f of singles) if (typeof getPath(dco, f) !== 'string') moves.set(f, null);
  return moves;
}

/** Move what each line of a day rests on to where the line now is, and drop it where the line went. */
export async function moveDayRefs(d, userId, rowId, moves) {
  if (!moves?.size) return;
  const at = (f) => `passage_refs?user_id=eq.${userId}&row_table=eq.user_daily_state&row_id=eq.${rowId}&field=eq.${encodeURIComponent(f)}`;
  for (const [from, to] of moves) if (to == null) await d.remove(at(from));
  // lowest first, so each lands where a line has already left
  const index = (f) => Number((/\.(\d+)/.exec(f) || [])[1] || 0);
  for (const [from, to] of [...moves].filter(([, t]) => t != null).sort((a, b) => index(a[0]) - index(b[0])))
    await d.update(at(from), { field: to });
}

/** Put back what the writers returned, and what each sentence now rests on. */
async function keepChanges(d, userId, changes, nowIso) {
  const byRow = new Map();
  for (const c of changes) {
    const k = `${c.row.row_table}:${c.row.row_id}`;
    byRow.set(k, [...(byRow.get(k) || []), c]);
  }
  for (const list of byRow.values()) {
    const { row, value } = list[0];
    if (row.row_table === 'user_daily_state') {
      const dco = JSON.parse(JSON.stringify(value.dco || {}));
      for (const c of list) {
        setPath(dco, c.row.field, c.text);
        // the headline is kept twice in the day (corrections.js loadPassages)
        if (c.row.field === 'brief_headline' && dco.brief && dco.brief.headline === getPath(value.dco || {}, 'brief_headline'))
          dco.brief.headline = c.text;
      }
      // the day closes up over what was cleared, and what rests on each line follows it
      const moves = tidyDay(dco);
      await d.update(`user_daily_state?id=eq.${row.row_id}&user_id=eq.${userId}`, { dco, updated_at: nowIso });
      await moveDayRefs(d, userId, row.row_id, moves);
      for (const c of list) c.field = moves.has(c.row.field) ? moves.get(c.row.field) : c.row.field;
    } else if (row.row_table === 'user_life_map') {
      const lm = JSON.parse(JSON.stringify(value.life_map || {}));
      for (const c of list) setPath(lm, c.row.field, c.text);
      lm.updated_at = nowIso;
      await d.update(`user_life_map?id=eq.${row.row_id}&user_id=eq.${userId}`, { life_map: lm, updated_at: nowIso });
    } else if (row.row_table === 'story_items') {
      const patch = { updated_at: nowIso };
      let retire = false;
      for (const c of list) {
        if (c.text) {
          patch[c.row.field] = c.text;
          // the item rests on the facts its body now cites
          if (c.row.field === 'body') patch.fact_ids = c.cited.filter((x) => x.type === 'fact').map((x) => x.id);
        } else retire = true;
      }
      // an item with its title or body cleared has nothing true left to show
      if (retire) Object.assign(patch, { state: 'corrected' });
      await d.update(`story_items?id=eq.${row.row_id}&user_id=eq.${userId}`, patch);
    } else if (row.row_table === 'life_people') {
      // the line about a person has one writer and no words of theirs
      for (const c of list)
        await d.update(`life_people?id=eq.${row.row_id}&user_id=eq.${userId}`, { words: c.text, words_updated_at: nowIso });
    } else if (row.row_table === 'chapters' || row.row_table === 'worlds') {
      // what they wrote themselves is never written over, even when it
      // became theirs while this ran
      for (const c of list) {
        const f = c.row.field;
        await d.update(`${row.row_table}?id=eq.${row.row_id}&owner_id=eq.${userId}&or=(${f}_source.is.null,${f}_source.neq.user)`, {
          [f]: c.text,
          [`${f}_updated_at`]: nowIso,
          updated_at: nowIso,
        });
      }
    }
    // what each sentence rests on now: a cleared one rests on nothing
    for (const c of list) {
      // where the line is now, after its day closed up; gone when it went
      const field = c.field === undefined ? c.row.field : c.field;
      if (field == null) continue;
      await d.remove(
        `passage_refs?user_id=eq.${userId}&row_table=eq.${c.row.row_table}&row_id=eq.${c.row.row_id}&field=eq.${encodeURIComponent(field)}`,
      );
      if (c.text)
        await recordPassages(d, [
          passageRow({
            userId,
            surface: c.row.surface,
            table: c.row.row_table,
            id: c.row.row_id,
            field,
            factIds: c.cited.filter((x) => x.type === 'fact').map((x) => x.id),
            personIds: c.cited.filter((x) => x.type === 'person').map((x) => x.id),
            items: c.cited.filter((x) => x.type === 'item').map((x) => ({ table: x.table, id: x.id })),
            writer: c.row.writer,
            promptVersion: 'correction',
            at: nowIso,
          }),
        ]);
    }
  }
}
