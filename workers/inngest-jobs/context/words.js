/**
 * The words writer (data fabric stage 4b): the line of words under each World
 * and the one or two under each open Chapter, written to the person as "you".
 *
 * It is the one writer of those words (card_subtitle). It is given the World
 * or Chapter, what is filed in it, the facts the reader took from those items
 * and the people they are about (context/filed.js). Gremly's own notes on it
 * (summary) are not given: Gremly's text is not evidence, and the line is seen
 * at a glance.
 *
 * Every line goes through the check (workers/shared/check) as a line seen at a
 * glance: it must rest on something it names, and never on anything private or
 * about health. A line that fails goes back once; one that fails again is left
 * out, and the field is left blank. The words stay until they are next
 * written, so they say nothing that stops being true as days pass.
 *
 * When the person wrote the words themselves, theirs stay, and Gremly's line
 * goes into card_subtitle_offered beside them, for the screen to offer.
 *
 * It runs after the weekly pass (the weekly pipe), when the app says something
 * changed (the same day route), and on a return day (the morning job).
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, weekdayName, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { invalidateChatCache } from './cache';
import { loadFiled } from './filed';
import { personToday } from './filing';
import { stateWords } from '../../shared/factTiming.js';
import {
  SENTENCE_SCHEMA,
  STATED_RULES,
  runCheck,
  checkRunRow,
  problemWords,
} from '../../shared/check/index.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { OPEN_CHAPTER_PHASES } from '../../shared/upNext.js';
import { oldWorldsFieldsStopped } from '../../shared/worldsFields.js';

export const WORDS_WRITER_VERSION = 'words-2026-10-07h';

/** What a person's words fields record as their writer. */
export const WORDS_SOURCE = 'words';

/** When the words are read, for the check (at most 80 characters): any day until next written. */
export const WORDS_MOMENT = 'kept under its World or Chapter, read on any day until next written';

const RULES = `THE WORDS
- You write the words shown under one World or one Chapter on Gremly's screens. A World is a part of the person's life. A Chapter is something within it that has a shape of its own, and it may have dates.
- For a World, write one short sentence about what that part of their life is for them over time; a single plan or event in it belongs to its own Chapter. For a Chapter, write one or two short sentences about what it is for them.
- Keep them short enough to take in at a glance: name the one or two things that matter most in it, by their own particulars, rather than listing what is filed or speaking in general.
- Speak of their life, never of the World or Chapter itself, its records or their lists.
- Write to the person, as you, never of them by name or in the third person.
- Say what this part of their life holds for them, from what is filed in it: what it is about for them, what they keep up, look after or are working towards, and who is in it with them when the records say so.
- Speak of each thing as its record holds it: something done as done, something they mean to do as something they mean to do, never as under way now, and a habit as something they set out to keep, never as kept unless a record says so.
- The words stay on the screen until they are next written, which may be weeks from now. Say nothing that stops being true as days pass: no dates, no one particular day, nothing about how soon or how long ago, no counts of what is done or still to do, and nothing about today, this week or soon. A day something happens on every week stays true. The screen shows dates and progress itself.
- Its name or title is shown above your words. Do not repeat it.
- Rest what you say on the records given, and say nothing they do not hold. When they are too thin to say anything true and particular, return empty text.
- Never describe their feelings for them, never judge how they are doing, and never give advice.
- A record marked private is about something private or about health. It may help you understand them, and is never cited and never named or hinted at, because these words are seen at a glance.`;

export function wordsSystemPrompt(person) {
  return {
    fixed: `You write the words under a World or a Chapter for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${RULES}

${PRIVATE_RULES}

${WRITING_RULES}

${STATED_RULES}`,
    varying: personBlock(person),
  };
}

export function wordsRewritePrompt(person) {
  return {
    fixed: `${wordsSystemPrompt(person).fixed}

ONCE AGAIN
You are given the words you wrote, what was wrong with them, and only the records they rest on. Write them again for the same World or Chapter, so that they say only what those records hold, with their refs and what they state. Cite only the records given here. When nothing true can be said from them, return empty text.`,
    varying: personBlock(person),
  };
}

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// every item is the person's own, which the check is told with each one
const KIND_WORDS = {
  note: 'a note of theirs',
  todo: 'a todo of theirs',
  habit: 'a habit of theirs',
};
const NOTE_KIND = { journal: 'a journal entry of theirs', event: 'an event of theirs' };

/**
 * The writer's input, the refs it may cite and the records the check holds
 * the words to. Pure.
 * @param p { kind: 'world' | 'chapter', target, world, items, facts, peopleOf, today }
 *   target is the World or Chapter row; world is a Chapter's World, when it has one
 */
export function renderWords({
  kind,
  target,
  world = null,
  items,
  facts,
  peopleOf,
  today,
  ended = false,
}) {
  const refs = new Map();
  const records = new Map();
  const counts = new Map();
  const add = (prefix, obj, fields, label) => {
    const n = (counts.get(prefix) || 0) + 1;
    counts.set(prefix, n);
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    records.set(ref, { exact: [], ...fields, label: `${ref} | ${label}` });
    return ref;
  };
  const L = [`TODAY: ${weekdayName(today)} ${today}.`, ''];

  if (kind === 'world') {
    const name = target.display_name || target.name;
    add('w', { type: 'world', id: target.id }, {}, `the World ${trim(name, 80)}`);
    L.push(`YOU ARE WRITING FOR THE WORLD (w1): ${trim(name, 80)}`);
  } else {
    const dates =
      target.start_date || target.end_date
        ? `${target.start_date || 'no start set'} to ${target.end_date || 'no end set'}`
        : 'no dates';
    const span = [target.start_date, target.end_date || target.start_date].filter(Boolean);
    add(
      'k',
      { type: 'chapter', id: target.id },
      { spans: span.length ? [[span[0], span[1] || span[0]]] : [], exact: ['date'] },
      `the Chapter ${trim(target.title, 80)} | ${dates}`,
    );
    const inWorld = world ? ` | in the World ${trim(world.display_name || world.name, 60)}` : '';
    L.push(
      ended
        ? `THE CHAPTER THAT HAS ENDED (k1): ${trim(target.title, 80)} | ${dates}${inWorld}`
        : `YOU ARE WRITING FOR THE CHAPTER (k1): ${trim(target.title, 80)} | ${target.phase === 'upcoming' ? 'set for later' : 'under way'} | ${dates}${inWorld}`,
    );
  }

  // the people the facts are about, once each
  const personRef = new Map();
  const tiedTo = new Map();
  for (const f of facts)
    for (const p of peopleOf.get(f.id) || []) tiedTo.set(p.id, [...(tiedTo.get(p.id) || []), f]);
  const peopleLines = [];
  for (const f of facts)
    for (const p of peopleOf.get(f.id) || []) {
      if (personRef.has(p.id)) continue;
      const others = (p.names || []).filter(
        (n) => n.toLowerCase() !== (p.name || '').toLowerCase(),
      );
      // someone known here only from private facts is private too
      const isPrivate = tiedTo.get(p.id).every((x) => x.private || x.health);
      const ref = add(
        'p',
        { type: 'person', id: p.id },
        { names: [p.name, ...others].filter(Boolean), exact: ['person'], private: isPrivate },
        `${isPrivate ? '[private] ' : ''}${p.name || '(no name given yet)'}${others.length ? `, also called ${others.join(', ')}` : ''}${p.relationship ? `, ${p.relationship}, as they said` : ''}`,
      );
      personRef.set(p.id, ref);
      peopleLines.push(records.get(ref).label);
    }
  const about = (f) => {
    const ps = (peopleOf.get(f.id) || []).map((p) => personRef.get(p.id)).filter(Boolean);
    return ps.length ? ` | about ${ps.join(', ')}` : '';
  };

  L.push(
    '',
    ended
      ? 'WHAT IS FILED IN IT, AND THEIR JOURNAL FROM ITS DAYS, newest first (ref | what | its day | title and words):'
      : 'WHAT IS FILED IN IT, newest first (ref | what | its day | title and words):',
  );
  // what the check reads with each item: where it is filed, which its line
  // does not say, as the section it sits under does for the writer
  const name = kind === 'world' ? target.display_name || target.name : target.title;
  const where = ended
    ? `filed in the Chapter ${trim(name, 80)}, or written during its days`
    : `filed in the ${kind === 'world' ? 'World' : 'Chapter'} ${trim(name, 80)}`;
  const itemLines = items.map((it) => {
    const what =
      it.type === 'note'
        ? NOTE_KIND[it.subtype] || KIND_WORDS.note
        : KIND_WORDS[it.type] || 'an item of theirs';
    const done = it.done ? `, done ${it.done}` : '';
    const ref = add(
      'i',
      { type: it.type, id: it.id },
      { dates: [it.date, it.done].filter(Boolean), private: !!it.private, health: !!it.health },
      `${it.private || it.health ? '[private] ' : ''}${what}${done} | ${it.date || 'no day'} | ${trim(it.title, 100)}${it.body && it.body !== it.title ? `: ${trim(it.body, 300)}` : ''}`,
    );
    const line = records.get(ref).label;
    records.get(ref).label = `${line} | ${where}`;
    return line;
  });
  L.push(itemLines.join('\n') || '(nothing filed yet)');

  L.push('', 'WHAT GREMLY HOLDS FROM THOSE ITEMS (ref | state | when | what | about):');
  const factLines = facts.map((f) => {
    const when = f.about_date
      ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''}`
      : 'no date';
    const names = [
      ...new Set((peopleOf.get(f.id) || []).flatMap((p) => [p.name, ...(p.names || [])])),
    ].filter(Boolean);
    return records.get(
      add(
        'f',
        { type: 'fact', id: f.id },
        {
          spans: f.about_date ? [[f.about_date, f.about_date_end || f.about_date]] : [],
          names,
          private: !!f.private,
          health: !!f.health,
        },
        `${f.private || f.health ? '[private] ' : ''}${stateWords(f, today)} | ${when} | ${trim(f.statement, 220)}${about(f)}`,
      ),
    ).label;
  });
  L.push(factLines.join('\n') || '(none)');

  L.push('', 'PEOPLE IN THOSE RECORDS (ref | name | who they are):');
  L.push(peopleLines.join('\n') || '(none)');
  return { text: L.join('\n'), refs, records };
}

/** The open Worlds and Chapters a person's words are written for, or the ones named. */
export async function wordsTargets(env, userId, named = null) {
  const d = db(env);
  const worldPhases = oldWorldsFieldsStopped(env) ? 'active' : 'active,evolving';
  const [worlds, chapters] = await Promise.all([
    d.select(
      `worlds?owner_id=eq.${userId}&phase=in.(${worldPhases})&select=id,name,display_name,phase,card_subtitle,card_subtitle_source&order=created_at.asc`,
    ),
    d.select(
      `chapters?owner_id=eq.${userId}&phase=in.(${OPEN_CHAPTER_PHASES.join(',')})&closed_at=is.null&select=id,title,phase,start_date,end_date,primary_world_id,card_subtitle,card_subtitle_source&order=created_at.asc`,
    ),
  ]);
  const want = named?.length ? new Set(named.map((t) => `${t.table}:${t.id}`)) : null;
  const keep = (table, r) => !want || want.has(`${table}:${r.id}`);
  const worldById = new Map((worlds || []).map((w) => [w.id, w]));
  return [
    ...(worlds || [])
      .filter((w) => keep('worlds', w))
      .map((w) => ({ table: 'worlds', kind: 'world', row: w })),
    ...(chapters || [])
      .filter((c) => keep('chapters', c))
      .map((c) => ({
        table: 'chapters',
        kind: 'chapter',
        row: c,
        world: worldById.get(c.primary_world_id) || null,
      })),
  ];
}

/**
 * Write the words for one World or Chapter, through the check. Writes nothing.
 * @returns { outcome, text, refs, model, check, input_chars, skipped }
 */
export async function writeLine(env, { userId, person, target, today, filed = null }) {
  const got = filed || (await loadFiled(env, userId, { table: target.table, id: target.row.id }));
  // nothing filed and nothing held: nothing true can be said, and no call is made
  if (!got.items.length && !got.facts.length)
    return { outcome: 'empty', text: null, refs: [], ids: [], skipped: 'nothing filed' };
  const { text, refs, records } = renderWords({
    kind: target.kind,
    target: target.row,
    world: target.world || null,
    items: got.items,
    facts: got.facts,
    peopleOf: got.peopleOf,
    today,
  });
  const [primary, fallback] = [modelFor(env, 'words'), modelFor(env, 'wordsFallback')];
  const { output, model } = await jsonCall(env, {
    primary,
    fallback,
    system: wordsSystemPrompt(person),
    user: text,
    schema: SENTENCE_SCHEMA,
    maxTokens: 2000,
    thinking: 'low',
    effort: 'low',
  });
  const [wrote, other] = model === fallback.model ? [fallback, primary] : [primary, fallback];
  const check = await runCheck({
    items: [{ key: 'words', sentence: output, glanceable: true }],
    records,
    today,
    moment: WORDS_MOMENT,
    person,
    ask: async (req) =>
      (
        await jsonCall(env, {
          primary: modelFor(env, 'check'),
          fallback: modelFor(env, 'checkFallback'),
          ...req,
          maxTokens: 600,
          effort: 'low',
          thinking: 'low',
        })
      ).output,
    rewrite: async ({ sentence, records: own, problems }) =>
      (
        await jsonCall(env, {
          primary: wrote,
          fallback: other,
          system: wordsRewritePrompt(person),
          user: `TODAY: ${weekdayName(today)} ${today}.\n\nRECORDS:\n${own.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
          schema: SENTENCE_SCHEMA,
          maxTokens: 1500,
          thinking: 'low',
          effort: 'low',
        })
      ).output,
  });
  const r = check.results.get('words');
  const said = r?.sentence?.text ? trim(r.sentence.text, 300) : null;
  return {
    outcome: r?.outcome || 'empty',
    text: said,
    refs: said ? r.refs : [],
    ids: said ? r.refs.map((x) => refs.get(x)).filter((x) => x?.id) : [],
    model,
    check: { counts: check.counts, details: check.details },
    problems: check.details.map((x) => problemWords(x)),
    input_chars: text.length,
  };
}

/**
 * Keep the words: the field itself, or the offered field beside words the
 * person wrote. Words that were left out leave the field blank: blank is
 * better than wrong. What they rest on is recorded (passage_refs).
 * @returns {{ field: string|null, changed: boolean }}
 */
export async function keepLine(env, { userId, target, result, at = new Date().toISOString() }) {
  const d = db(env);
  const row = target.row;
  const theirs = row.card_subtitle_source === 'user';
  const field = theirs ? 'card_subtitle_offered' : 'card_subtitle';
  const text = result.text || null;
  // Gremly offers nothing that is already what they wrote
  const offerSame = theirs && text && text.trim() === String(row.card_subtitle || '').trim();
  const patch = theirs
    ? { card_subtitle_offered: offerSame ? null : text, card_subtitle_offered_at: at }
    : {
        card_subtitle: text,
        card_subtitle_source: WORDS_SOURCE,
        card_subtitle_updated_at: at,
      };
  // a person who writes their own words while this runs keeps them
  const guard = theirs ? '' : '&or=(card_subtitle_source.is.null,card_subtitle_source.neq.user)';
  const saved = await d.update(
    `${target.table}?id=eq.${row.id}&owner_id=eq.${userId}${guard}`,
    patch,
  );
  if (!saved?.length) return { field: null, changed: false };
  await d.remove(
    `passage_refs?user_id=eq.${userId}&row_table=eq.${target.table}&row_id=eq.${row.id}&field=eq.${field}`,
  );
  if (text && !offerSame) {
    await recordPassages(d, [
      passageRow({
        userId,
        surface: target.kind,
        table: target.table,
        id: row.id,
        field,
        factIds: result.ids.filter((x) => x.type === 'fact').map((x) => x.id),
        personIds: result.ids.filter((x) => x.type === 'person').map((x) => x.id),
        items: result.ids
          .filter((x) => ['note', 'todo', 'habit'].includes(x.type))
          .map((x) => ({ table: `${x.type}s`, id: x.id })),
        writer: WORDS_SOURCE,
        model: result.model || null,
        promptVersion: WORDS_WRITER_VERSION,
        at,
      }),
    ]);
  }
  return { field, changed: true };
}

/**
 * Write the words for a person's open Worlds and Chapters, or only the ones
 * named, and keep them. One that fails does not stop the rest; it is reported.
 * @param opts.targets [{ table, id }] or null for all
 * @param opts.reason weekly | changed | return | first_worlds | by_hand
 * @param opts.dryRun write nothing (the shadow runner)
 */
export async function writeWords(
  env,
  userId,
  { targets = null, reason = 'by_hand', dryRun = false } = {},
) {
  const [list, person, today] = await Promise.all([
    wordsTargets(env, userId, targets),
    personIdentity(env, userId),
    personToday(env, userId),
  ]);
  const out = [];
  const counts = { checked: 0, sent_back: 0, left_out: 0 };
  const details = [];
  for (const t of list) {
    try {
      const result = await writeLine(env, { userId, person, target: t, today });
      const kept = dryRun
        ? { field: null, changed: false }
        : await keepLine(env, { userId, target: t, result });
      if (result.check) {
        counts.checked += result.check.counts.checked;
        counts.sent_back += result.check.counts.sent_back;
        counts.left_out += result.check.counts.left_out;
        details.push(...result.check.details.map((x) => ({ ...x, key: `${t.table}.${t.row.id}` })));
      }
      out.push({
        table: t.table,
        id: t.row.id,
        outcome: result.outcome,
        skipped: result.skipped || null,
        model: result.model || null,
        field: kept.field,
        text: dryRun ? result.text : undefined,
        was: dryRun ? t.row.card_subtitle || null : undefined,
        problems: dryRun ? result.problems : undefined,
      });
    } catch (err) {
      console.warn(
        `[ALERT][Words] the words for ${t.table} ${t.row.id} could not be written: ${err.message}`,
      );
      out.push({ table: t.table, id: t.row.id, error: String(err.message).slice(0, 200) });
    }
  }
  if (!dryRun) {
    const d = db(env);
    if (counts.checked || counts.left_out)
      await d
        .insertQuiet('check_runs', [
          checkRunRow({
            userId,
            job: 'words',
            day: today,
            counts,
            details,
            model: modelFor(env, 'words').model,
          }),
        ])
        .catch((err) => console.warn(`[Words] could not log the check: ${err.message}`));
    if (out.some((x) => x.field)) await invalidateChatCache(env, userId);
  }
  return {
    user_id: userId,
    reason,
    today,
    written: out.filter((x) => x.outcome === 'pass' || x.outcome === 'rewritten').length,
    left_out: out.filter((x) => x.outcome === 'left_out').length,
    empty: out.filter((x) => x.outcome === 'empty').length,
    failed: out.filter((x) => x.error).length,
    lines: out,
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/words-fresh { user_id, table, id } (admin key checked upstream;
 * cortex sends it for the signed in person when they rename, move, merge,
 * close or reopen something, or change its dates). Asks for fresh words for
 * that World or Chapter; chat's cache is cleared by cortex straight away.
 */
export async function handleWordsFreshApi(request, env, corsResponse, { send }) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId =
      typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : null;
    const table = ['worlds', 'chapters'].includes(body.table) ? body.table : null;
    const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null;
    if (!userId || !table || !id)
      return corsResponse({ error: 'user_id, table and id are required' }, 400);
    const [row] =
      (await db(env).select(`${table}?id=eq.${id}&owner_id=eq.${userId}&select=id`)) || [];
    if (!row) return corsResponse({ error: 'not found' }, 404);
    // one ask a minute for the same thing: a rename and a date change together are one
    const minute = new Date().toISOString().slice(0, 16);
    await send(env, [
      {
        id: `words-changed-${table}-${id}-${minute}`,
        name: 'app/words.write',
        data: { user_id: userId, targets: [{ table, id }], reason: 'changed' },
      },
    ]);
    return corsResponse({ ok: true });
  } catch (e) {
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
