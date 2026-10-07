/**
 * The memory writer (data fabric stage 4b): a Chapter that has ended, written
 * as a memory to the person as "you". What happened and what it meant, never
 * a tally of what was left undone.
 *
 * It is the one writer of a Chapter's memory (epigraph). It is given the
 * Chapter, what is filed in it, the facts the reader took from those items,
 * the facts dated within its span, journal entries from its span and the
 * people they are about. The memory is read in places the person opens on
 * purpose (their story, the Chapter's own page), so something private may
 * shape it, in their own words, and it is checked as a line that is not seen
 * at a glance.
 *
 * The Worlds build calls it at the moment a person closes a Chapter, through a
 * signed in cortex route (type chapter-memory, forwarded to
 * /api/chapter-memory). Until then the weekly pipe writes one for each closed
 * Chapter that has none from this writer. When the person wrote the memory
 * themselves, theirs stays and Gremly's goes into epigraph_offered beside it.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, weekdayName, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { invalidateChatCache } from './cache';
import { ITEM_TABLE, readFactPeople, readItemMarks, markItems, itemOf, loadFiled } from './filed';
import { personToday } from './filing';
import { renderWords } from './words';
import {
  SENTENCE_SCHEMA,
  STATED_RULES,
  runCheck,
  checkRunRow,
  problemWords,
} from '../../shared/check/index.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';

export const MEMORY_VERSION = 'memory-2026-10-07i';

/** What a memory records as its writer. */
export const MEMORY_SOURCE = 'memory';

/** When the memory is read, for the check (at most 80 characters). */
export const MEMORY_MOMENT =
  'kept as the memory of a Chapter that has ended, read at any time after';

const RULES = `THE MEMORY
- A Chapter of the person's life has ended. A Chapter is something in their life that had a shape of its own. You write its memory, which they will come back to in their story.
- Write two to four short sentences, to the person, as you, looking back on it, as a memory they would want to keep. Every sentence speaks to them as you, never of them by name or in the third person.
- Choose the few moments that mattered most to them in it, and tell those well. Never list everything that happened in it.
- Tell only what belongs to this Chapter. Their journal from its days may be about other parts of their life, and those parts stay out.
- Tell each thing as its record holds it: something they meant to do was not done unless a record says so, and a habit they set out to keep was not kept unless a record says so.
- Speak of their life, never of their records, notes, todos or lists, and never of the Chapter itself. Their own words may be echoed, without saying where they wrote them.
- All of it is past: tell it as a memory, without setting it against today.
- Tell what happened in it and what it meant to them, as they would want to remember it. What it meant comes from their own words in the records; when the records do not say, tell what happened and leave its meaning to them.
- Name the people who were part of it when the records say who they are.
- Never a tally. Say nothing about what was left undone, how much was or was not done, or how it fell short of a plan.
- Never describe their feelings for them beyond their own words, never judge it, and never give advice.
- Something private or about health may shape the memory, in their own words and never framed as a problem. Your own words never name a condition, a treatment or a medication.
- Its title is shown above your words. Do not repeat it.
- Rest what you say on the records given, and say nothing they do not hold. When they are too thin to say anything true and particular, return empty text.`;

export function memorySystemPrompt(person) {
  return {
    fixed: `You write the memory of a Chapter of someone's life for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${RULES}

${PRIVATE_RULES}

${WRITING_RULES}

${STATED_RULES}`,
    varying: personBlock(person),
  };
}

export function memoryRewritePrompt(person) {
  return {
    fixed: `${memorySystemPrompt(person).fixed}

ONCE AGAIN
You are given the memory you wrote, what was wrong with it, and only the records it rests on. Write it again, so that it says only what those records hold, with its refs and what it states. Cite only the records given here. When nothing true can be said from them, return empty text.`,
    varying: personBlock(person),
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Everything a Chapter's memory is written from: what is filed in it, and
 * from its span the facts dated within it and their journal entries.
 */
export async function loadMemoryRecords(env, userId, chapter) {
  const d = db(env);
  const filed = await loadFiled(env, userId, { table: 'chapters', id: chapter.id }, { items: 60 });
  const start = chapter.start_date ? String(chapter.start_date).slice(0, 10) : null;
  const end = chapter.end_date
    ? String(chapter.end_date).slice(0, 10)
    : chapter.closed_at
      ? String(chapter.closed_at).slice(0, 10)
      : null;
  if (!start || !end || end < start) return filed;
  const [spanFacts, journals] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(happened,current,changed)&about_date=gte.${start}&about_date=lte.${end}&select=id,statement,subject,about_date,about_date_end,state,observed_at,last_confirmed_at,private,health,item_table,item_id&order=about_date.asc&limit=40`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.journal&archived=is.false&created_at=gte.${start}T00:00:00Z&created_at=lte.${end}T23:59:59Z&select=id,title,body,subtype,date,target_date,created_at&order=created_at.asc&limit=20`,
    ),
  ]);
  const haveFact = new Set(filed.facts.map((f) => f.id));
  const extraFacts = (spanFacts || []).filter((f) => !haveFact.has(f.id));
  const haveItem = new Set(filed.items.map((i) => `${i.type}:${i.id}`));
  const extraItems = (journals || [])
    .map((r) => itemOf('note', r))
    .filter((i) => !haveItem.has(`note:${i.id}`));
  const facts = [...filed.facts, ...extraFacts];
  const [morePeople, marks] = await Promise.all([
    readFactPeople(d, userId, extraFacts),
    readItemMarks(d, userId, extraItems),
  ]);
  const peopleOf = new Map([...filed.peopleOf, ...morePeople]);
  // a journal entry is private when any fact from it is
  const items = [...filed.items, ...markItems(extraItems, facts, marks)];
  return { items, facts, peopleOf };
}

/**
 * The memory of one Chapter, through the check, from records already read.
 * Writes nothing; the replay calls it as the worker does.
 * @param p { person, chapter, world, got: { items, facts, peopleOf }, today }
 * @returns { outcome, text, ids, model, check, problems, input_chars }
 */
export async function memoryLine(env, { person, chapter, world = null, got, today }) {
  if (!got.items.length && !got.facts.length)
    return {
      outcome: 'empty',
      text: null,
      ids: [],
      model: null,
      check: null,
      problems: [],
      input_chars: 0,
    };
  // the same records and refs the words writer reads, with the Chapter ended
  const {
    text: input,
    refs,
    records,
  } = renderWords({
    kind: 'chapter',
    target: chapter,
    world: world || null,
    items: [...got.items].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    facts: got.facts,
    peopleOf: got.peopleOf,
    today,
    ended: true,
  });
  const [primary, fallback] = [modelFor(env, 'memory'), modelFor(env, 'memoryFallback')];
  const { output, model } = await jsonCall(env, {
    primary,
    fallback,
    system: memorySystemPrompt(person),
    user: input,
    schema: SENTENCE_SCHEMA,
    maxTokens: 4000,
    thinking: 'low',
    effort: 'medium',
  });
  const [wrote, other] = model === fallback.model ? [fallback, primary] : [primary, fallback];
  const check = await runCheck({
    items: [{ key: 'memory', sentence: output, glanceable: false }],
    records,
    today,
    moment: MEMORY_MOMENT,
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
          system: memoryRewritePrompt(person),
          user: `TODAY: ${weekdayName(today)} ${today}.\n\nRECORDS:\n${own.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
          schema: SENTENCE_SCHEMA,
          maxTokens: 3000,
          thinking: 'low',
          effort: 'medium',
        })
      ).output,
  });
  const r = check.results.get('memory');
  const said = r?.sentence?.text ? String(r.sentence.text).trim().slice(0, 900) : null;
  return {
    outcome: r?.outcome || 'empty',
    text: said,
    ids: said ? r.refs.map((x) => refs.get(x)).filter((x) => x?.id) : [],
    model,
    check: { counts: check.counts, details: check.details },
    problems: check.details.map((x) => problemWords(x)),
    input_chars: input.length,
  };
}

/**
 * Write the memory of one Chapter, through the check, and keep it unless asked
 * not to. Throws when the Chapter is not theirs or a model cannot be reached.
 * @returns { outcome, memory, field, model, problems }
 */
export async function writeMemory(env, userId, chapterId, { dryRun = false } = {}) {
  if (!UUID.test(String(chapterId || ''))) throw new Error('a chapter id is required');
  const d = db(env);
  const [chapter] =
    (await d.select(
      `chapters?id=eq.${chapterId}&owner_id=eq.${userId}&select=id,title,phase,start_date,end_date,closed_at,primary_world_id,epigraph,epigraph_source`,
    )) || [];
  if (!chapter) throw new Error('no such chapter for this person');
  // a memory is of a Chapter that has ended
  if (chapter.phase !== 'closed') throw new Error('the chapter has not ended');
  const [world] = chapter.primary_world_id
    ? (await d.select(
        `worlds?id=eq.${chapter.primary_world_id}&owner_id=eq.${userId}&select=id,name,display_name`,
      )) || []
    : [];
  const [person, today, got] = await Promise.all([
    personIdentity(env, userId),
    personToday(env, userId),
    loadMemoryRecords(env, userId, chapter),
  ]);
  const result = await memoryLine(env, { person, chapter, world: world || null, got, today });
  if (dryRun) return { ...result, memory: result.text, field: null, was: chapter.epigraph || null };

  const at = new Date().toISOString();
  const theirs = chapter.epigraph_source === 'user';
  const field = theirs ? 'epigraph_offered' : 'epigraph';
  const offerSame = theirs && result.text && result.text === String(chapter.epigraph || '').trim();
  const patch = theirs
    ? { epigraph_offered: offerSame ? null : result.text, epigraph_offered_at: at }
    : { epigraph: result.text, epigraph_source: MEMORY_SOURCE, epigraph_updated_at: at };
  // a person who writes their own memory while this runs keeps it
  const guard = theirs ? '' : '&or=(epigraph_source.is.null,epigraph_source.neq.user)';
  const saved = await d.update(`chapters?id=eq.${chapter.id}&owner_id=eq.${userId}${guard}`, patch);
  if (saved?.length) {
    await d.remove(
      `passage_refs?user_id=eq.${userId}&row_table=eq.chapters&row_id=eq.${chapter.id}&field=eq.${field}`,
    );
    if (result.text && !offerSame)
      await recordPassages(d, [
        passageRow({
          userId,
          surface: 'chapter',
          table: 'chapters',
          id: chapter.id,
          field,
          factIds: result.ids.filter((x) => x.type === 'fact').map((x) => x.id),
          personIds: result.ids.filter((x) => x.type === 'person').map((x) => x.id),
          items: result.ids
            .filter((x) => ITEM_TABLE[x.type])
            .map((x) => ({ table: ITEM_TABLE[x.type], id: x.id })),
          writer: MEMORY_SOURCE,
          model: result.model,
          promptVersion: MEMORY_VERSION,
          at,
        }),
      ]);
    if (result.check)
      await d
        .insertQuiet('check_runs', [
          checkRunRow({
            userId,
            job: 'memory',
            day: today,
            counts: result.check.counts,
            details: result.check.details,
            model: result.model,
          }),
        ])
        .catch((err) => console.warn(`[Memory] could not log the check: ${err.message}`));
    await invalidateChatCache(env, userId);
  }
  return {
    outcome: result.outcome,
    memory: saved?.length ? result.text : null,
    field: saved?.length ? field : null,
    model: result.model,
    problems: result.problems,
  };
}

/** Closed Chapters with no memory from this writer, that the person did not write themselves. */
export async function chaptersWantingMemory(env, userId) {
  const rows = await db(env).select(
    `chapters?owner_id=eq.${userId}&phase=eq.closed&or=(epigraph_source.is.null,epigraph_source.not.in.(memory,user))&select=id&order=closed_at.desc.nullslast&limit=40`,
  );
  return (rows || []).map((r) => r.id);
}

/**
 * POST /api/chapter-memory { user_id, chapter_id } (admin key checked upstream;
 * cortex sends it for the signed in person). Writes and keeps the memory of a
 * closed Chapter and says what it is, only while the pipeline is live for
 * them; otherwise it writes nothing and says why (409).
 * @param deps.mode the pipeline mode for a person (context/functions.js contextMode)
 */
export async function handleChapterMemoryApi(request, env, corsResponse, { mode = null } = {}) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId =
      typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : null;
    if (!userId || !UUID.test(String(body.chapter_id || '')))
      return corsResponse({ error: 'user_id and chapter_id are required' }, 400);
    if (!mode || mode(env, userId) !== 'on')
      return corsResponse({ error: 'the pipeline is not live for them' }, 409);
    const r = await writeMemory(env, userId, body.chapter_id);
    return corsResponse({
      ok: true,
      outcome: r.outcome,
      memory: r.memory,
      field: r.field,
    });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    const status = msg.startsWith('no such chapter')
      ? 404
      : msg.startsWith('the chapter has not ended')
        ? 409
        : 500;
    return corsResponse({ error: msg }, status);
  }
}
