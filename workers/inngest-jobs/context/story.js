/**
 * The story: once a month the synthesis model reads the whole fact ledger and
 * writes the person's story so far. Milestones, how things have shifted for
 * them, moments to be proud of, patterns (what they love, avoid, do often or
 * rarely) and the people who matter.
 *
 * The model writes the words and decides what matters. Code only checks that
 * every item rests on facts it was shown, and stores it with those facts.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, userTimezone, localDate, relativeDay, personIdentity } from './db';
import { anthropicJsonParams, modelFor } from './llm';
import { recentCorrections } from './corrections';

export const STORY_PROMPT_VERSION = 'story-2026-10-01';

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const REFS = { type: 'array', items: { type: 'string' } };

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    story_so_far: { type: 'string' },
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
        },
        required: ['title', 'start_date', 'end_date', 'body', 'chapter_ref', 'private', 'fact_refs'],
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
        },
        required: ['title', 'start_date', 'end_date', 'body', 'private', 'fact_refs'],
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
        },
        required: ['title', 'date', 'body', 'private', 'fact_refs'],
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
        },
        required: ['kind', 'title', 'body', 'private', 'fact_refs'],
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: 'string' },
          body: { type: 'string' },
          private: { type: 'boolean' },
          fact_refs: REFS,
        },
        required: ['name', 'relationship', 'body', 'private', 'fact_refs'],
      },
    },
  },
  required: ['story_so_far', 'milestones', 'shifts', 'proud_moments', 'patterns', 'people'],
};

function storySystemPrompt(today, person) {
  return `You write the story of one person's life so far for Gremly, a warm companion app. Gremly uses it to remember what has happened to them, to notice how they have grown and changed, to remind them of what they have done when things are hard, and to know what they love. It is read by Gremly in conversations with them, and parts of it may be shown to them.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

${WRITING_RULES}

DATES
- Write dates as dates (a month and year is often enough), never as today, recently, this week or last month. This is read for weeks after it is written.

WHAT YOU ARE GIVEN
- The fact ledger: everything Gremly has learned from their own records, each fact with its date and state, oldest first. Corrections the person made are listed separately and always win.
- Their Chapters: stretches of life the app has already recognised.
- The themes of each week Gremly summarised, and how they used the app month by month.
- The story as it stood last time, if there is one.

WHAT TO WRITE
- story_so_far: a few short paragraphs telling their story across the time Gremly has known them: where they were, what happened, what changed, and where things stand now.
- milestones: the events and turning points that shape their story, the kind of thing they would put in an album or tell a friend about. Each with its dates and a few sentences on what happened, in their words where possible. Link the matching Chapter when there is one.
- shifts: how their attitude, feelings, priorities or relationships around something have changed over time. Each one sets what they said or did at one time beside what they said or did later, with both dates, in their own words. Describe the change; never judge it, explain it or diagnose it.
- proud_moments: things they did, finished, kept to or got through, as they described them, that would be good to be reminded of on a hard day. Never frame one against something they did not do.
- patterns: what they love, what they avoid, what they do often or rarely, and the rhythms of their life, each resting on several facts across time. Their app use counts only as how they used Gremly, never as how their life went.
- people: the people who matter in their life, how they are related, and what has happened with them.

EVIDENCE
- Every item cites the facts it rests on by ref. A pattern needs facts from at least two different times. Nothing Gremly said is evidence, and a corrected fact is never used.
- Leave a section short rather than stretch the evidence. Plans that never showed as happening are not milestones.

${PRIVATE_RULES}
- Mark each item private or not by that meaning; an item that rests on a fact marked private is private. Write private items only in the person's own terms.

CONTINUITY
- Keep the story steady from month to month. Carry over items from last time that still hold, revise them when the facts have moved on, and drop only what the facts no longer support.`;
}

/** Everything the story pass reads. */
export async function gatherStory(env, userId) {
  const d = db(env);
  const [facts, corrections, chapters, weeks, usage, current] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&state=in.(current,planned,happened,changed,unconfirmed)&select=id,statement,subject,about_date,about_date_end,state,observed_at,private&order=observed_at.asc&limit=800`),
    recentCorrections(env, userId, 3650),
    d.select(`chapters?owner_id=eq.${userId}&select=id,title,chapter_type,phase,start_date,end_date,summary,card_subtitle&order=start_date.asc.nullslast&limit=60`),
    d.select(`weekly_summaries?user_id=eq.${userId}&select=week_start_date,key_themes&order=week_start_date.asc&limit=80`),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'month', p_periods: 13 }),
    d.select(`story_items?user_id=eq.${userId}&state=eq.current&select=kind,pattern_kind,title,period_start,period_end&order=kind.asc&limit=200`),
  ]);
  return { facts, corrections, chapters, weeks, usage, current };
}

export function renderStory(g, today) {
  const refs = new Map();
  const add = (prefix, obj) => {
    const ref = `${prefix}${[...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    refs.set(ref, obj);
    return ref;
  };
  const factLines = g.facts.map((f) => {
    const ref = add('f', { type: 'fact', id: f.id, statement: f.statement, about_date: f.about_date, observed_at: f.observed_at, private: !!f.private });
    const when = f.about_date ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''}` : 'no date';
    return `${ref} | recorded ${String(f.observed_at).slice(0, 10)} | ${f.state}${f.private ? ' [private]' : ''} | ${when} | ${trim(f.statement, 220)}`;
  });
  const chapterLines = g.chapters.map((c) => {
    const ref = add('c', { type: 'chapter', id: c.id });
    return `${ref} | ${trim(c.title, 80)} | ${c.chapter_type} | ${c.phase} | ${c.start_date || '?'} to ${c.end_date || (c.phase === 'closed' ? '?' : 'now')} | ${trim(c.summary || c.card_subtitle, 240)}`;
  });
  const weekLines = g.weeks
    .filter((w) => Array.isArray(w.key_themes) && w.key_themes.length)
    .map((w) => `${w.week_start_date}: ${w.key_themes.map((t) => trim(t, 60)).join('; ')}`);
  const usageLines = (g.usage?.periods || []).map(
    (p) => `${String(p.period_start).slice(0, 7)}: ${p.active_days} active days, ${p.drops} drops, ${p.todos_done} done, ${p.habit_checkins} habit check-ins, ${p.journals} journals, ${p.chat_messages} chat messages`,
  );
  const cur = g.usage?.current;
  const currentLines = g.current.map((s) => `- ${s.kind}${s.pattern_kind ? ` (${s.pattern_kind})` : ''}: ${trim(s.title, 120)}${s.period_start ? ` (${s.period_start}${s.period_end ? ` to ${s.period_end}` : ''})` : ''}`);

  const text = [
    `TODAY: ${today}.`,
    '',
    `FACT LEDGER, OLDEST FIRST (ref | recorded | state | date | statement):\n${factLines.join('\n') || '(none)'}`,
    '',
    `CORRECTIONS THE PERSON MADE (always win): ${g.corrections.map((c) => `${String(c.corrected_at).slice(0, 10)}: "${trim(c.statement, 160)}" is wrong; they said "${trim(c.correction_text, 200)}"`).join('; ') || 'none'}`,
    '',
    `CHAPTERS (ref | title | kind | phase | dates | summary):\n${chapterLines.join('\n') || '(none)'}`,
    '',
    `WEEKLY THEMES, OLDEST FIRST:\n${weekLines.join('\n') || '(none)'}`,
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
  const params = anthropicJsonParams({
    model: m.model,
    system: storySystemPrompt(today, person),
    user: text,
    schema: STORY_SCHEMA,
    maxTokens: 32000,
  });
  const refsSnapshot = [...refs.entries()].map(([k, v]) => [k, { type: v.type, id: v.id, about_date: v.about_date || null, private: !!v.private }]);
  return { params, refsSnapshot, today, tz, inputChars: text.length, counts: { facts: g.facts.length, chapters: g.chapters.length } };
}

/** Turn the model's story into rows, keeping only items that rest on real facts. */
export function storyRows(userId, output, refsSnapshot, { runId, model, today }) {
  const refs = new Map(refsSnapshot);
  const factIds = (list) => [...new Set((list || []).map((r) => refs.get(r)).filter((f) => f && f.type === 'fact').map((f) => f.id))];
  const chapterId = (r) => (r && refs.get(r)?.type === 'chapter' ? refs.get(r).id : null);
  const notFuture = (s) => (validDate(s) && s <= today ? s : null);
  const rows = [];
  const dropped = [];
  const push = (row, refsList, minFacts = 1) => {
    const ids = factIds(refsList);
    // An item that rests on a private fact is private, whatever the model said.
    if ((refsList || []).some((r) => refs.get(r)?.private)) row.private = true;
    if (ids.length < minFacts || !row.title || !row.body || String(row.body).trim().length < 20) {
      dropped.push({ kind: row.kind, title: row.title, facts: ids.length });
      return;
    }
    // Every row carries the same keys: PostgREST bulk inserts require it.
    rows.push({
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
    push({ kind: 'milestone', title: m.title, body: m.body, period_start: notFuture(m.start_date), period_end: validDate(m.end_date), private: !!m.private, chapter_id: chapterId(m.chapter_ref) }, m.fact_refs);
  }
  for (const s of output.shifts || []) {
    push({ kind: 'shift', title: s.title, body: s.body, period_start: notFuture(s.start_date), period_end: notFuture(s.end_date), private: !!s.private }, s.fact_refs, 2);
  }
  for (const p of output.proud_moments || []) {
    push({ kind: 'proud', title: p.title, body: p.body, period_start: notFuture(p.date), private: !!p.private }, p.fact_refs);
  }
  for (const p of output.patterns || []) {
    push({ kind: 'pattern', pattern_kind: ['loves', 'avoids', 'often', 'rarely', 'rhythm'].includes(p.kind) ? p.kind : null, title: p.title, body: p.body, private: !!p.private }, p.fact_refs, 2);
  }
  for (const p of output.people || []) {
    push({ kind: 'person', title: `${trim(p.name, 60)}${p.relationship ? `, ${trim(p.relationship, 60)}` : ''}`, body: p.body, private: !!p.private }, p.fact_refs);
  }
  return { rows, dropped };
}

/**
 * Apply a story. In shadow nothing is written outside synthesis_runs.
 * Live: the new items replace the current ones (kept as superseded), and a
 * compact copy goes into the Life Map JSON, which chat already reads.
 */
export async function applyStory(env, userId, output, refsSnapshot, { shadow, runId, model, today }) {
  const d = db(env);
  const { rows, dropped } = storyRows(userId, output, refsSnapshot, { runId, model, today });
  const applied = { items: rows.length, dropped, by_kind: rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {}) };
  if (shadow) return { applied, rows };
  if (!rows.length) return { applied: { ...applied, skipped: 'no items with evidence' } };

  const nowIso = new Date().toISOString();
  // New items first, then the old ones step aside, so a failure never leaves
  // the person with no story.
  await d.insertQuiet('story_items', rows);
  await d.update(`story_items?user_id=eq.${userId}&state=eq.current&or=(run_id.is.null,run_id.neq.${runId})`, { state: 'superseded', updated_at: nowIso });

  // Compact copy for the Life Map: what chat and the app already read.
  const [lm] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`);
  if (lm) {
    const pick = (kind) => rows.filter((r) => r.kind === kind).map((r) => ({
      title: r.title, body: r.body, from: r.period_start || null, to: r.period_end || null, private: r.private, ...(r.pattern_kind ? { kind: r.pattern_kind } : {}),
    }));
    const story = {
      written_at: nowIso,
      source: 'monthly_story',
      story_so_far: trim(output.story_so_far, 4000),
      milestones: pick('milestone'),
      shifts: pick('shift'),
      proud_moments: pick('proud'),
      patterns: pick('pattern'),
      people: pick('person'),
    };
    await d.update(`user_life_map?id=eq.${lm.id}`, { life_map: { ...(lm.life_map || {}), story }, updated_at: nowIso });
  }
  return { applied };
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
    const when = s.period_start ? ` (${s.period_start}${s.period_end && s.period_end !== s.period_start ? ` to ${s.period_end}` : ''}, ${relativeDay(s.period_start, today)})` : '';
    return `- ${s.kind}${s.pattern_kind ? `/${s.pattern_kind}` : ''}${s.private ? ' [private]' : ''}: ${trim(s.title, 120)}${when}${bodies ? `. ${trim(s.body, 280)}` : ''}`;
  });
}

/** Rebuild the compact story copy in the Life Map from the current items. */
export async function refreshLifeMapStory(env, userId) {
  const d = db(env);
  const [lm] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`);
  if (!lm?.life_map?.story) return;
  const items = await loadStory(env, userId, { limit: 200 });
  const pick = (kind) => items.filter((r) => r.kind === kind).map((r) => ({
    title: r.title, body: r.body, from: r.period_start || null, to: r.period_end || null, private: r.private, ...(r.pattern_kind ? { kind: r.pattern_kind } : {}),
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
  await d.update(`user_life_map?id=eq.${lm.id}`, { life_map: { ...lm.life_map, story }, updated_at: new Date().toISOString() });
}
