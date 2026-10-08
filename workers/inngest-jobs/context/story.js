/**
 * The story: once a month the synthesis model reads the whole fact ledger and
 * writes the person's story so far. Milestones, how things have shifted for
 * them, moments to be proud of, patterns (what they love, avoid, do often or
 * rarely) and the people who matter.
 *
 * The model writes the words and decides what matters. Code only checks that
 * every item rests on facts it was shown, and stores it with those facts.
 *
 * Each item's body goes through the shared check (data fabric stage 6): it
 * names the facts it rests on and lists what it states, and is held to those
 * facts as they stand. One that does not hold goes back once to the story's
 * writer, alone, with only its own facts, and one still wrong is left out.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, userTimezone, localDate, relativeDay, personIdentity } from './db';
import { whenTrue } from '../../shared/factTiming.js';
import { anthropicSchemaInPromptParams, modelFor, jsonCall } from './llm';
import { recentCorrections } from './corrections';
import { invalidateChatCache } from './cache';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { STATED_RULES, SENTENCE_SCHEMA } from '../../shared/check/stated.js';
import { runCheck, checkRunRow } from '../../shared/check/run.js';

export const STORY_PROMPT_VERSION = 'story-2026-10-16a';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const REFS = { type: 'array', items: { type: 'string' } };
// what an item's body states, as every writer under the check lists it
const STATED = SENTENCE_SCHEMA.properties.stated;

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    story_so_far: { type: 'string' },
    story_for_them: { type: 'string' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          start_date: { type: 'string', nullable: true },
          end_date: { type: 'string', nullable: true },
          body: { type: 'string' },
          chapter_ref: { type: 'string', nullable: true },
          private: { type: 'boolean' },
          fact_refs: REFS,
          stated: STATED,
        },
        required: [
          'title',
          'start_date',
          'end_date',
          'body',
          'chapter_ref',
          'private',
          'fact_refs',
          'stated',
        ],
      },
    },
    shifts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          start_date: { type: 'string', nullable: true },
          end_date: { type: 'string', nullable: true },
          body: { type: 'string' },
          private: { type: 'boolean' },
          fact_refs: REFS,
          stated: STATED,
        },
        required: ['title', 'start_date', 'end_date', 'body', 'private', 'fact_refs', 'stated'],
      },
    },
    proud_moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string', nullable: true },
          body: { type: 'string' },
          private: { type: 'boolean' },
          fact_refs: REFS,
          stated: STATED,
        },
        required: ['title', 'date', 'body', 'private', 'fact_refs', 'stated'],
      },
    },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['loves', 'avoids', 'often', 'rarely', 'rhythm'] },
          title: { type: 'string' },
          body: { type: 'string' },
          private: { type: 'boolean' },
          fact_refs: REFS,
          stated: STATED,
        },
        required: ['kind', 'title', 'body', 'private', 'fact_refs', 'stated'],
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: 'string', nullable: true },
          body: { type: 'string' },
          private: { type: 'boolean' },
          fact_refs: REFS,
          stated: STATED,
        },
        required: ['name', 'relationship', 'body', 'private', 'fact_refs', 'stated'],
      },
    },
  },
  required: [
    'story_so_far',
    'story_for_them',
    'milestones',
    'shifts',
    'proud_moments',
    'patterns',
    'people',
  ],
};

// The fixed part comes first so Anthropic can cache it across people; today's
// date and who the person is follow it.
function storySystemPrompt(today, person) {
  return {
    fixed: storySystemPromptFixed(),
    varying: `TODAY'S DATE: ${today}\n\n${personBlock(person)}`,
  };
}

function storySystemPromptFixed() {
  return `You write the story of one person's life so far for Gremly, a warm companion app. Gremly uses it to remember what has happened to them, to notice how they have grown and changed, to remind them of what they have done when things are hard, and to know what they love. It is read by Gremly in conversations with them, and parts of it may be shown to them.

${CARE_RULES}

${WRITING_RULES}

DATES
- Write dates as dates (a month and year is often enough), never as today, recently, this week or last month. This is read for weeks after it is written.

WHAT YOU ARE GIVEN
- The fact ledger: everything Gremly has learned from their own records, each fact with its date and state, oldest first. Corrections the person made are listed separately and always win.
- Their Chapters: stretches of life the app has already recognised.
- Gremly's own note on each week, written when it read the week, and how they used the app month by month. A week's note is Gremly's reading, never a fact on its own: an item rests on the facts.
- The story as it stood last time, if there is one.

WHAT TO WRITE
- story_so_far: a few short paragraphs telling their story across the time Gremly has known them: where they were, what happened, what changed, and where things stand now. This one is for Gremly to read.
- story_for_them: the same story told to them, in the second person, in two or three short paragraphs. It opens their story screen in the app, which they visit on purpose, so it can be warm and personal. Private items appear only in their own terms.
- milestones: the events and turning points that shape their story, the kind of thing they would put in an album or tell a friend about. Each with its dates and a few sentences on what happened, in their words where possible. Link the matching Chapter when there is one.
- shifts: how their attitude, feelings, priorities or relationships around something have changed over time. Each one sets what they said or did at one time beside what they said or did later, with both dates, in their own words. Describe the change; never judge it, explain it or diagnose it.
- proud_moments: things they did, finished, kept to or got through, as they described them, that would be good to be reminded of on a hard day. Never frame one against something they did not do.
- patterns: what they love, what they avoid, what they do often or rarely, and the rhythms of their life, each resting on several facts across time. Their app use counts only as how they used Gremly, never as how their life went.
- people: the people who matter in their life, how they are related, and what has happened with them. Give the relationship only as their records state it, and leave it empty when they do not say.

EVIDENCE
- Every item cites the facts it rests on by ref. A pattern needs facts from at least two different times. Nothing Gremly said is evidence, and a corrected fact is never used.
- Leave a section short rather than stretch the evidence. Plans that never showed as happening are not milestones.
- Each item's body is held to the facts it cites. Its fact_refs are its refs, and its stated list is what its body states, by the rules that follow. Only fact refs count; a Chapter is linked, never cited.

${STATED_RULES}
- In the story, a month said without its day is listed as YYYY-MM and a year said alone as YYYY. A day that comes round every year is listed as its date in the year the body speaks of.

${PRIVATE_RULES}
- Mark each item private or not by that meaning. An item that cites a fact marked private is stored as private, so keep a private detail out of an item that is not private in itself, and give the detail an item of its own where it matters. A person, a pattern or a milestone that is open in itself stays open. Write private items only in the person's own terms.

CONTINUITY
- Keep the story steady from month to month. Carry over items from last time that still hold, revise them when the facts have moved on, and drop only what the facts no longer support.`;
}

const STORY_PARTS = {
  title: 'its title, a few words',
  body: 'its body, a few sentences on what happened, in their words where possible',
};

/**
 * What the story's writer is told when one item's title or body goes back to
 * it alone, as a correction sends it (correctionPassages.js): the story's own
 * rules, the one part it writes, and the shared check's form.
 */
export function storyRewritePrompt(person, field) {
  return {
    fixed: `${storySystemPromptFixed()}

ONE PART OF ONE ITEM AGAIN
You are given one part of one story item you wrote: ${STORY_PARTS[field] || 'one part of it'}. You are given what was wrong with it and only the records it rests on, as they now stand: the person may just have put one of them right. Write that part again so that it says only what those records hold, keeping what it said that they still hold, with its refs and what it states. Cite only the records given here. When nothing true is left to say, return empty text.`,
    varying: personBlock(person),
  };
}

/** Everything the story pass reads. */
export async function gatherStory(env, userId) {
  const d = db(env);
  const [facts, corrections, chapters, weeks, usage, current] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,happened,changed,unconfirmed)&select=id,statement,subject,timing,about_date,about_date_end,state,observed_at,private&order=observed_at.asc&limit=800`,
    ),
    recentCorrections(env, userId, 3650),
    d.select(
      `chapters?owner_id=eq.${userId}&select=id,title,chapter_type,phase,start_date,end_date,summary,card_subtitle&order=start_date.asc.nullslast&limit=60`,
    ),
    // Gremly's note on each week, from the weekly pass (data fabric stage 5),
    // in place of the summaries' weekly themes, which were never written
    d.select(
      `synthesis_runs?user_id=eq.${userId}&kind=in.(weekly,catch_up,first_look)&status=eq.applied&select=period_end,week_note:output->>week_note&order=period_end.asc,created_at.asc&limit=120`,
    ),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'month', p_periods: 13 }),
    d.select(
      `story_items?user_id=eq.${userId}&state=eq.current&select=kind,pattern_kind,title,period_start,period_end&order=kind.asc&limit=200`,
    ),
  ]);
  return { facts, corrections, chapters, weeks, usage, current };
}

/** A fact as the story's writer is shown it, and as the check reads it. Pure. */
function storyFactLine(ref, f) {
  // a standing fact holds with no date, a yearly one comes every year (stage 4d)
  return `${ref} | recorded ${String(f.observed_at).slice(0, 10)} | ${f.state}${f.private ? ' [private]' : ''} | ${whenTrue(f)} | ${trim(f.statement, 220)}`;
}

export function renderStory(g, today) {
  const refs = new Map();
  const add = (prefix, obj) => {
    const ref = `${prefix}${[...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    refs.set(ref, obj);
    return ref;
  };
  const factLines = g.facts.map((f) => {
    const ref = add('f', {
      type: 'fact',
      id: f.id,
      statement: f.statement,
      about_date: f.about_date,
      observed_at: f.observed_at,
      private: !!f.private,
      state: f.state,
    });
    return storyFactLine(ref, f);
  });
  const chapterLines = g.chapters.map((c) => {
    const ref = add('c', { type: 'chapter', id: c.id });
    return `${ref} | ${trim(c.title, 80)} | ${c.chapter_type} | ${c.phase} | ${c.start_date || '?'} to ${c.end_date || (c.phase === 'closed' ? '?' : 'now')} | ${trim(c.summary || c.card_subtitle, 240)}`;
  });
  // one note a week: a week passed over again keeps its latest note
  const notes = new Map();
  for (const w of g.weeks || [])
    if (w?.period_end && String(w.week_note || '').trim()) notes.set(w.period_end, w.week_note);
  const weekLines = [...notes].map(([end, note]) => `week ending ${end}: ${trim(note, 400)}`);
  const usageLines = (g.usage?.periods || []).map(
    (p) =>
      `${String(p.period_start).slice(0, 7)}: ${p.active_days} active days, ${p.drops} drops, ${p.todos_done} done, ${p.habit_checkins} habit check-ins, ${p.journals} journals, ${p.chat_messages} chat messages`,
  );
  const cur = g.usage?.current;
  const currentLines = g.current.map(
    (s) =>
      `- ${s.kind}${s.pattern_kind ? ` (${s.pattern_kind})` : ''}: ${trim(s.title, 120)}${s.period_start ? ` (${s.period_start}${s.period_end ? ` to ${s.period_end}` : ''})` : ''}`,
  );

  const text = [
    `TODAY: ${today}.`,
    '',
    `FACT LEDGER, OLDEST FIRST (ref | recorded | state | date | statement):\n${factLines.join('\n') || '(none)'}`,
    '',
    `CORRECTIONS THE PERSON MADE (always win): ${g.corrections.map((c) => `${String(c.corrected_at).slice(0, 10)}: "${trim(c.statement, 160)}" is wrong; they said "${trim(c.correction_text, 200)}"`).join('; ') || 'none'}`,
    '',
    `CHAPTERS (ref | title | kind | phase | dates | summary):\n${chapterLines.join('\n') || '(none)'}`,
    '',
    `GREMLY'S NOTE ON EACH WEEK, OLDEST FIRST:\n${weekLines.join('\n') || '(none yet)'}`,
    '',
    `APP USE BY MONTH, NEWEST FIRST:\n${usageLines.join('\n') || '(none)'}${cur ? `\nGremly's age: ${cur.gremly_age ?? 'unknown'}; days fed in total: ${cur.fed_days_total ?? 0}.` : ''}`,
    '',
    `THE STORY LAST TIME:\n${currentLines.join('\n') || '(none yet)'}`,
  ].join('\n');
  return { text, refs };
}

export async function storyRequestParams(env, userId) {
  const tz = await userTimezone(env, userId);
  const today = localDate(tz);
  const [g, person] = await Promise.all([gatherStory(env, userId), personIdentity(env, userId)]);
  const { text, refs } = renderStory(g, today);
  const m = modelFor(env, 'weekly');
  // the schema rides in the prompt: with what each item states, it is too
  // large for Anthropic's strict grammar (data fabric stage 6, as the weekly
  // pass found in stage 5). storyRows and checkStory hold the reply to its shape.
  const params = anthropicSchemaInPromptParams({
    model: m.model,
    system: storySystemPrompt(today, person),
    user: text,
    schema: STORY_SCHEMA,
    maxTokens: 32000,
  });
  const refsSnapshot = [...refs.entries()].map(([k, v]) => [
    k,
    {
      type: v.type,
      id: v.id,
      about_date: v.about_date || null,
      private: !!v.private,
      state: v.state || null,
    },
  ]);
  return {
    params,
    refsSnapshot,
    today,
    tz,
    inputChars: text.length,
    counts: { facts: g.facts.length, chapters: g.chapters.length },
  };
}

/** Turn the model's story into rows, keeping only items that rest on real facts. */
export function storyRows(userId, output, refsSnapshot, { runId, model, today }) {
  const refs = new Map(refsSnapshot);
  const factIds = (list) => [
    ...new Set(
      (list || [])
        .map((r) => refs.get(r))
        .filter((f) => f && f.type === 'fact')
        .map((f) => f.id),
    ),
  ];
  const chapterId = (r) => (r && refs.get(r)?.type === 'chapter' ? refs.get(r).id : null);
  const notFuture = (s) => (validDate(s) && s <= today ? s : null);
  const rows = [];
  const dropped = [];
  const push = (row, refsList, minFacts = 1, { lived = false } = {}) => {
    const ids = factIds(refsList);
    // Milestones and proud moments are things that took place: at least one cited
    // fact must say it happened or is so now. A plan alone is not one.
    if (
      lived &&
      !(refsList || []).some((r) => ['happened', 'current'].includes(refs.get(r)?.state))
    ) {
      dropped.push({
        kind: row.kind,
        title: row.title,
        facts: ids.length,
        reason: ids.length ? 'only plans cited' : 'no facts',
      });
      return;
    }
    // An item that rests on a private fact is private, whatever the model said.
    if ((refsList || []).some((r) => refs.get(r)?.private)) row.private = true;
    if (ids.length < minFacts || !row.title || !row.body || String(row.body).trim().length < 20) {
      dropped.push({ kind: row.kind, title: row.title, facts: ids.length });
      return;
    }
    // Every row carries the same keys: PostgREST bulk inserts require it.
    rows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      kind: row.kind,
      pattern_kind: row.pattern_kind ?? null,
      title: trim(row.title, 160),
      body: trim(row.body, 1500),
      period_start: row.period_start ?? null,
      period_end: row.period_end ?? null,
      private: !!row.private,
      fact_ids: ids,
      chapter_id: row.chapter_id ?? null,
      state: 'current',
      run_id: runId,
      model: model ?? null,
    });
  };
  for (const m of output.milestones || []) {
    push(
      {
        kind: 'milestone',
        title: m.title,
        body: m.body,
        period_start: notFuture(m.start_date),
        period_end: validDate(m.end_date),
        private: !!m.private,
        chapter_id: chapterId(m.chapter_ref),
      },
      m.fact_refs,
      1,
      { lived: true },
    );
  }
  for (const s of output.shifts || []) {
    push(
      {
        kind: 'shift',
        title: s.title,
        body: s.body,
        period_start: notFuture(s.start_date),
        period_end: notFuture(s.end_date),
        private: !!s.private,
      },
      s.fact_refs,
      2,
    );
  }
  for (const p of output.proud_moments || []) {
    push(
      {
        kind: 'proud',
        title: p.title,
        body: p.body,
        period_start: notFuture(p.date),
        private: !!p.private,
      },
      p.fact_refs,
      1,
      { lived: true },
    );
  }
  for (const p of output.patterns || []) {
    push(
      {
        kind: 'pattern',
        pattern_kind: ['loves', 'avoids', 'often', 'rarely', 'rhythm'].includes(p.kind)
          ? p.kind
          : null,
        title: p.title,
        body: p.body,
        private: !!p.private,
      },
      p.fact_refs,
      2,
    );
  }
  for (const p of output.people || []) {
    push(
      {
        kind: 'person',
        title: `${trim(p.name, 60)}${p.relationship ? `, ${trim(p.relationship, 60)}` : ''}`,
        body: p.body,
        private: !!p.private,
      },
      p.fact_refs,
    );
  }
  return { rows, dropped };
}

// The story's lists, each with the kind its items are stored as
const STORY_LISTS = [
  ['milestones', 'milestone'],
  ['shifts', 'shift'],
  ['proud_moments', 'proud'],
  ['patterns', 'pattern'],
  ['people', 'person'],
];

/** When a story item is read: in their story, on any day until the next story. */
export const STORY_MOMENT = 'kept in their story, read on any day until the story is next written';

/**
 * The facts the story's writer was shown, as the check reads them: each by
 * the ref it was shown under, read again from the same view as it stands now,
 * in the line the writer saw. A fact gone from the ledger since is not among them.
 */
export async function storyRecords(env, userId, refsSnapshot) {
  const d = db(env);
  const byId = new Map();
  const facts = (refsSnapshot || []).filter(([, v]) => v?.type === 'fact' && v.id);
  for (let i = 0; i < facts.length; i += 100) {
    const ids = facts.slice(i, i + 100).map(([, v]) => v.id);
    const rows =
      (await d.select(
        `life_facts_now?user_id=eq.${userId}&id=in.(${ids.join(',')})&select=id,statement,about_date,about_date_end,timing,state,private,health,observed_at`,
      )) || [];
    for (const f of rows) byId.set(f.id, f);
  }
  const records = new Map();
  for (const [ref, v] of facts) {
    const f = byId.get(v.id);
    if (!f) continue;
    const day = f.about_date ? String(f.about_date).slice(0, 10) : null;
    const end = f.about_date_end ? String(f.about_date_end).slice(0, 10) : null;
    records.set(ref, {
      ref,
      label: storyFactLine(ref, f),
      dates: [day, end].filter(Boolean),
      ...(day && end && end !== day ? { spans: [[day, end]] } : {}),
      private: !!f.private,
      health: !!f.health,
    });
  }
  return records;
}

/**
 * Every item's body through the check (workers/shared/check), against the
 * facts it cites. Returns the story as it stands after: a body that held
 * stays, one written again replaces it and rests on what it now cites, and one
 * still wrong takes its item out. Never throws for one item.
 * @param p.ask the words question, as the worker asks it
 * @param p.rewrite ({ key, sentence, records, problems }) => sentence or null
 * @returns {{ output, counts, details, left_out: [{ list, title }] }}
 */
export async function checkStory({ output, records, today, person, ask, rewrite }) {
  const items = [];
  for (const [list] of STORY_LISTS)
    (output?.[list] || []).forEach((it, i) => {
      if (!it || !String(it.body || '').trim()) return;
      items.push({
        key: `${list}.${i}`,
        sentence: { text: it.body, refs: Array.isArray(it.fact_refs) ? it.fact_refs : [], stated: Array.isArray(it.stated) ? it.stated : [] },
        // the story is read where the person opens it on purpose
        glanceable: false,
      });
    });
  const check = await runCheck({ items, records, today, moment: STORY_MOMENT, person, ask, rewrite });
  const out = { ...output };
  const leftOut = [];
  for (const [list] of STORY_LISTS)
    out[list] = (output?.[list] || [])
      .map((it, i) => {
        const r = check.results.get(`${list}.${i}`);
        if (!r || r.outcome === 'pass' || r.outcome === 'empty') return it;
        if (r.outcome === 'rewritten' && r.sentence?.text)
          return { ...it, body: r.sentence.text, fact_refs: r.refs, stated: r.sentence.stated || [] };
        leftOut.push({ list, title: it.title });
        return null;
      })
      .filter(Boolean);
  return { output: out, counts: check.counts, details: check.details, left_out: leftOut };
}

/** The check as the story asks it: the words question, and its writer's one part again. */
export function storyCheckCalls(env, person, today) {
  const ask = async (req) =>
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
  const rewrite = async ({ key, sentence, records, problems }) => {
    const kind = (STORY_LISTS.find(([list]) => list === String(key).split('.')[0]) || [])[1] || 'an item';
    return (
      await jsonCall(env, {
        primary: modelFor(env, 'rewrite'),
        fallback: modelFor(env, 'rewriteFallback'),
        system: storyRewritePrompt(person, 'body'),
        user: `THE STORY ITEM: ${kind}, its body\nTODAY: ${today}.\n\nRECORDS:\n${records.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
        schema: SENTENCE_SCHEMA,
        maxTokens: 1500,
        thinking: 'low',
        effort: 'low',
      })
    ).output;
  };
  return { ask, rewrite };
}

/**
 * Apply a story. In shadow nothing is written outside synthesis_runs.
 * Live: the new items replace the current ones (kept as superseded), and a
 * compact copy goes into the Life Map JSON, which chat already reads.
 */
export async function applyStory(
  env,
  userId,
  output,
  refsSnapshot,
  { shadow, runId, model, today, calls = null },
) {
  const d = db(env);
  // every item's body through the check before anything is kept
  const person = await personIdentity(env, userId);
  const records = await storyRecords(env, userId, refsSnapshot);
  const checked = await checkStory({
    output,
    records,
    today,
    person,
    ...(calls || storyCheckCalls(env, person, today)),
  });
  const { rows, dropped } = storyRows(userId, checked.output, refsSnapshot, { runId, model, today });
  const applied = {
    items: rows.length,
    dropped: [...dropped, ...checked.left_out.map((x) => ({ kind: x.list, title: x.title, reason: 'the check left it out' }))],
    by_kind: rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {}),
    check: checked.counts,
  };
  if (!shadow && (checked.counts.checked || checked.counts.left_out))
    await d
      .insertQuiet('check_runs', [
        checkRunRow({ userId, job: 'story', day: today, counts: checked.counts, details: checked.details, model: model ?? null }),
      ])
      .catch((err) => console.warn(`[Story] could not log the check: ${err.message}`));
  if (shadow) return { applied, rows, check: checked };
  if (!rows.length) return { applied: { ...applied, skipped: 'no items with evidence' } };

  const nowIso = new Date().toISOString();
  // New items first, then the old ones step aside, so a failure never leaves
  // the person with no story.
  // a retry starts clean: the items a failed attempt of this run wrote go first
  await d.remove(`story_items?user_id=eq.${userId}&run_id=eq.${runId}`);
  await d.insertQuiet('story_items', rows);
  await d.update(
    `story_items?user_id=eq.${userId}&state=eq.current&or=(run_id.is.null,run_id.neq.${runId})`,
    { state: 'superseded', updated_at: nowIso },
  );
  // What each item was written from (workers/shared/passageRefs.js)
  applied.passages = await recordPassages(
    d,
    rows.flatMap((r) =>
      ['title', 'body'].map((field) =>
        passageRow({
          userId,
          surface: 'story',
          table: 'story_items',
          id: r.id,
          field,
          factIds: r.fact_ids,
          writer: 'story',
          model: r.model,
          promptVersion: STORY_PROMPT_VERSION,
          at: nowIso,
        }),
      ),
    ),
  );

  // Compact copy for the Life Map: what chat and the app already read. With no
  // Life Map row yet (a first run), the weekly synthesis that makes the row
  // copies this story in afterwards (copyStoryIntoLifeMap).
  const [lm] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`);
  if (lm) {
    const story = compactStory(rows, output, nowIso);
    await d.update(`user_life_map?id=eq.${lm.id}`, {
      life_map: { ...(lm.life_map || {}), story },
      updated_at: nowIso,
    });
  }
  await invalidateChatCache(env, userId);
  return { applied };
}

/**
 * The compact story the Life Map carries, which chat and the Your Story header
 * read: the two passages the story wrote and its items, sorted by kind. It
 * copies what the story wrote; it writes no sentence of its own.
 */
export function compactStory(items, output, writtenAt) {
  const pick = (kind) =>
    (items || [])
      .filter((r) => r.kind === kind)
      .map((r) => ({
        title: r.title,
        body: r.body,
        from: r.period_start || null,
        to: r.period_end || null,
        private: r.private,
        ...(r.pattern_kind ? { kind: r.pattern_kind } : {}),
      }));
  return {
    written_at: writtenAt,
    source: 'monthly_story',
    story_so_far: trim(output?.story_so_far, 4000),
    story_for_them: trim(output?.story_for_them, 3000),
    milestones: pick('milestone'),
    shifts: pick('shift'),
    proud_moments: pick('proud'),
    patterns: pick('pattern'),
    people: pick('person'),
  };
}

/**
 * A new person's first story runs before their first weekly synthesis makes
 * the Life Map row, so the story had nowhere to go and their story screen and
 * chat had none until the next month. Once the row exists, the story already
 * written is copied in: the two passages from the latest applied story run and
 * the current items. No model call. Nothing changes when the row already has a
 * story or there is no story yet.
 */
export async function copyStoryIntoLifeMap(env, userId) {
  const d = db(env);
  const [lm] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`);
  if (!lm) return { copied: false, reason: 'no life map' };
  if (lm.life_map?.story) return { copied: false, reason: 'already there' };
  const [run] =
    (await d.select(
      `synthesis_runs?user_id=eq.${userId}&kind=eq.monthly&status=eq.applied&select=id,output,applied_at&order=applied_at.desc&limit=1`,
    )) || [];
  const items = await loadStory(env, userId, { limit: 200 });
  if (!run?.output && !items.length) return { copied: false, reason: 'no story yet' };
  const nowIso = new Date().toISOString();
  const story = compactStory(items, run?.output || {}, run?.applied_at || nowIso);
  await d.update(`user_life_map?id=eq.${lm.id}`, {
    life_map: { ...(lm.life_map || {}), story },
    updated_at: nowIso,
  });
  await invalidateChatCache(env, userId);
  return { copied: true, run_id: run?.id || null, items: items.length };
}

/** Current story items for other prompts. Private items are labelled. */
export async function loadStory(env, userId, { includePrivate = true, limit = 80 } = {}) {
  const rows = await db(env).select(
    `story_items?user_id=eq.${userId}&state=eq.current${includePrivate ? '' : '&private=eq.false'}&select=id,kind,pattern_kind,title,body,period_start,period_end,private&order=kind.asc,period_start.asc.nullslast&limit=${limit}`,
  );
  return rows || [];
}

export function storyLines(items, today, { bodies = true } = {}) {
  return items.map((s) => {
    const when = s.period_start
      ? ` (${s.period_start}${s.period_end && s.period_end !== s.period_start ? ` to ${s.period_end}` : ''}, ${relativeDay(s.period_start, today)})`
      : '';
    return `- ${s.kind}${s.pattern_kind ? `/${s.pattern_kind}` : ''}${s.private ? ' [private]' : ''}: ${trim(s.title, 120)}${when}${bodies ? `. ${trim(s.body, 280)}` : ''}`;
  });
}

/** Rebuild the compact story copy in the Life Map from the current items. */
export async function refreshLifeMapStory(env, userId) {
  const d = db(env);
  const [lm] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`);
  if (!lm?.life_map?.story) return;
  const items = await loadStory(env, userId, { limit: 200 });
  const pick = (kind) =>
    items
      .filter((r) => r.kind === kind)
      .map((r) => ({
        title: r.title,
        body: r.body,
        from: r.period_start || null,
        to: r.period_end || null,
        private: r.private,
        ...(r.pattern_kind ? { kind: r.pattern_kind } : {}),
      }));
  const story = {
    ...lm.life_map.story,
    milestones: pick('milestone'),
    shifts: pick('shift'),
    proud_moments: pick('proud'),
    patterns: pick('pattern'),
    people: pick('person'),
    updated_at: new Date().toISOString(),
  };
  await d.update(`user_life_map?id=eq.${lm.id}`, {
    life_map: { ...lm.life_map, story },
    updated_at: new Date().toISOString(),
  });
}
