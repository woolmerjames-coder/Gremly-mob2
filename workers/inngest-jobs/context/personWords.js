/**
 * The words about a person (data fabric stage 6): the one line Gremly keeps
 * about someone in their life, written from what the weekly pass noted of
 * them and held to the facts the note rests on.
 *
 * The weekly pass notes, for Gremly's own reference, each person the week's
 * facts and journal entries speak of (weekly.js, NOTES ON PEOPLE). After it,
 * the words writer turns each note into the line kept with that person
 * (life_people.words): who they are to the person, as the records say it, and
 * what is going on with them, by its own particulars. The line is seen at a
 * glance wherever the person is listed, so it is never given anything private
 * or about health, and it goes through the shared check (workers/shared/check)
 * against the facts the note cites. Someone the week did not speak of keeps
 * the line they have, and so does someone whose new line the check left out.
 *
 * The life pack reads the line (workers/shared/lifePack.js), so chat, today's
 * thread and the brief know it. A correction reaches it through passage_refs
 * (correctionPassages.js). Behind PERSON_WORDS (wrangler.toml) until life_people
 * has its words fields (supabase/migrations/20261016090000_data_fabric_stage6_person_words.sql).
 *
 * The model writes the line; code finds the people, gives it their records and
 * keeps what the check lets stand. It never writes a sentence itself.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, personIdentity, weekdayName } from './db';
import { jsonCall, modelFor, effortFor } from './llm';
import { LIFE_MAP_RULES, lifeMapSection, loadLifeMapLines } from './lifeMap';
import { invalidateChatCache } from './cache';
import { whenTrue } from '../../shared/factTiming.js';
import { SENTENCE_SCHEMA, STATED_RULES } from '../../shared/check/stated.js';
import { runCheck, checkRunRow, problemWords } from '../../shared/check/run.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { personWordsOn } from '../../shared/lifePack.js';
import { personToday } from './filing';
import { whoSaid } from '../../shared/whoSaid.js';

export const PERSON_WORDS_VERSION = 'person-words-2026-10-18b';
export const PERSON_WORDS_MOMENT =
  'kept with them, seen at a glance on any day until it is next written';

// whether the line about a person is written and read, one switch for both workers
export { personWordsOn };

const RULES = `THE LINE
- You write the line shown under the name of someone in the person's life on Gremly's screens. Their name is shown above it: do not repeat it.
- Write one short sentence about who they are in the person's life and what the two of them share, as the records show it over time, by its own particulars rather than in general. Who they are to the person comes only from what the records say.
- Write to the person, as you.
- Speak of the someone and of life with them, never of todos, habits, lists or records as such: say what a thing is about, not that it was on a list.
- Gremly's note on them from the week is its own reading, given to help you see what matters, and never evidence. What the week brought belongs in the line only when it says something lasting about them. Rest what you say on the records given, and say nothing they do not hold. When they are too thin to say anything true and particular, return empty text.
- Speak of each thing as its record holds it: something done as done, something meant as something meant, never as under way now.
- The line stays on the screen until it is next written, which may be weeks from now. Say nothing that stops being true as days pass: no dates, no one particular day, nothing about how soon or how long ago, and nothing about today, this week or soon.
- Never describe anyone's feelings for them, never judge how anyone is doing, and never give advice.
- The line is seen at a glance and others may see it. Nothing private or about health is given to you, and the line never speaks of any of it, in any words.`;

/** The writer's rules, for one person's line. */
export function personWordsPrompt(person, { lifeMap = false } = {}) {
  return {
    fixed: `You write the line Gremly keeps about someone in a person's life, for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${RULES}
${lifeMap ? `\n${LIFE_MAP_RULES}\n` : ''}
${PRIVATE_RULES}

${WRITING_RULES}

${STATED_RULES}`,
    varying: personBlock(person),
  };
}

/** The same rules, for the one line again, as the check and a correction send it back. */
export function personWordsRewritePrompt(person) {
  return {
    fixed: `${personWordsPrompt(person).fixed}

ONCE AGAIN
You are given the line you wrote, what was wrong with it, and only the records it rests on. Write it again for the same someone, so that it says only what those records hold, with its refs and what it states. Cite only the records given here. When nothing true can be said from them, return empty text.`,
    varying: personBlock(person),
  };
}

// how many more facts about each person the line is given, beyond the note's
const TIES_EACH = 10;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * The writer's input and the records the check holds the line to: the
 * someone, and the facts the note cites that are neither private nor about
 * health. Pure.
 * @returns {{ text, records: Map, ids: Map, facts: number }}
 */
export function renderPersonWords({ someone, note, facts, today, lifeMap = [] }) {
  const records = new Map();
  const ids = new Map();
  const add = (prefix, record, id) => {
    const ref = `${prefix}${[...records.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    records.set(ref, { ref, exact: [], ...record, label: `${ref} | ${record.label}` });
    ids.set(ref, id);
    return ref;
  };
  add(
    'p',
    {
      label: `the someone: ${trim(someone.name, 60) || '(no name given yet)'}${someone.relationship ? `, their ${whoSaid({ ...someone, relationship: trim(someone.relationship, 60) })}` : ', who they are to them is not recorded'}`,
      names: [someone.name].filter(Boolean),
      exact: ['person'],
    },
    { type: 'person', id: someone.id },
  );
  for (const f of facts) {
    const day = f.about_date ? String(f.about_date).slice(0, 10) : null;
    const end = f.about_date_end ? String(f.about_date_end).slice(0, 10) : null;
    add(
      'f',
      {
        label: `fact (${f.state}; ${whenTrue(f)}; recorded ${String(f.observed_at || '').slice(0, 10)}): ${trim(f.statement, 300)}`,
        dates: [day, end].filter(Boolean),
        ...(day && end && end !== day ? { spans: [[day, end]] } : {}),
      },
      { type: 'fact', id: f.id },
    );
  }
  const text = `TODAY: ${weekdayName(today)} ${today}.

GREMLY'S NOTE ON THEM FROM THE WEEK, ITS OWN READING AND NEVER EVIDENCE:
${trim(note, 800)}

RECORDS:
${[...records.values()].map((r) => r.label).join('\n')}${lifeMap.length ? `\n\n${lifeMapSection(lifeMap)}` : ''}`;
  return { text, records, ids, facts: facts.length };
}

/**
 * The people the latest weekly pass noted, each with its note and the facts
 * the note cites, as they stand now. Someone merged away or hidden is not
 * among them.
 */
export async function notedPeople(env, userId, { run = null } = {}) {
  const d = db(env);
  const [last] = run
    ? [run]
    : (await d.select(
        `synthesis_runs?user_id=eq.${userId}&kind=eq.weekly&status=eq.applied&select=id,people_notes:output->people_notes,refs:input_stats->refs&order=created_at.desc&limit=1`,
      )) || [];
  const notes = Array.isArray(last?.people_notes) ? last.people_notes : [];
  if (!notes.length) return { run: last?.id || null, people: [] };
  const refs = new Map(Array.isArray(last.refs) ? last.refs : []);
  const wanted = [];
  for (const n of notes) {
    const p = refs.get(n?.person_ref);
    if (p?.type !== 'person' || !p.id || !String(n.note || '').trim()) continue;
    const factIds = (Array.isArray(n.refs) ? n.refs : [])
      .map((r) => refs.get(r))
      .filter((x) => x?.type === 'fact' && x.id)
      .map((x) => x.id);
    wanted.push({ personId: p.id, note: n.note, factIds: [...new Set(factIds)] });
  }
  if (!wanted.length) return { run: last.id, people: [] };
  const personIds = [...new Set(wanted.map((w) => w.personId))];
  // what else the ledger holds about each of them, newest first, so the line
  // can say who they are over time and not only what the week brought
  const ties =
    (await d.select(
      `life_fact_people?user_id=eq.${userId}&person_id=in.(${personIds.join(',')})&select=person_id,fact_id&order=created_at.desc&limit=${personIds.length * TIES_EACH * 3}`,
    )) || [];
  const tiedTo = new Map();
  for (const t of ties) {
    const list = tiedTo.get(t.person_id) || [];
    if (list.length < TIES_EACH * 3 && !list.includes(t.fact_id)) list.push(t.fact_id);
    tiedTo.set(t.person_id, list);
  }
  const factIds = [...new Set([...wanted.flatMap((w) => w.factIds), ...[...tiedTo.values()].flat()])];
  const [people, facts] = await Promise.all([
    d.select(
      `life_people?user_id=eq.${userId}&id=in.(${personIds.join(',')})&merged_into=is.null&hidden_at=is.null&select=id,name,relationship,relationship_by,words`,
    ),
    factIds.length
      ? d.select(
          `life_facts_now?user_id=eq.${userId}&id=in.(${factIds.join(',')})&select=id,statement,about_date,about_date_end,timing,state,private,health,observed_at`,
        )
      : [],
  ]);
  const byPerson = new Map((people || []).map((p) => [p.id, p]));
  const byFact = new Map((facts || []).map((f) => [f.id, f]));
  return {
    run: last.id,
    people: wanted
      .filter((w) => byPerson.has(w.personId))
      .map((w) => {
        // a fact put right, changed, private or about health since is not given
        const open = (id) => {
          const f = byFact.get(id);
          return f && !f.private && !f.health && ['current', 'planned', 'happened', 'unconfirmed'].includes(f.state) ? f : null;
        };
        const cited = w.factIds.map(open).filter(Boolean);
        const seen = new Set(cited.map((f) => f.id));
        const more = (tiedTo.get(w.personId) || [])
          .filter((id) => !seen.has(id))
          .map(open)
          .filter(Boolean)
          .slice(0, TIES_EACH);
        return { someone: byPerson.get(w.personId), note: w.note, facts: [...cited, ...more] };
      }),
  };
}

/** One person's line, through the check. Writes nothing. */
export async function personLine(env, { person, someone, note, facts, today, lifeMap = [] }) {
  if (!facts.length) return { outcome: 'empty', text: null, ids: [], skipped: 'nothing open to rest on' };
  const { text, records, ids } = renderPersonWords({ someone, note, facts, today, lifeMap });
  const [primary, fallback] = [modelFor(env, 'words'), modelFor(env, 'wordsFallback')];
  const { output, model } = await jsonCall(env, {
    primary,
    fallback,
    system: personWordsPrompt(person, { lifeMap: lifeMap.length > 0 }),
    user: text,
    schema: SENTENCE_SCHEMA,
    maxTokens: 2000,
    ...effortFor(env, 'person_words'),
  });
  const [wrote, other] = model === fallback.model ? [fallback, primary] : [primary, fallback];
  const check = await runCheck({
    items: [{ key: 'words', sentence: output, glanceable: true }],
    records,
    today,
    moment: PERSON_WORDS_MOMENT,
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
          system: personWordsRewritePrompt(person),
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
    ids: said ? r.refs.map((x) => ids.get(x)).filter(Boolean) : [],
    model,
    check: { counts: check.counts, details: check.details },
    problems: check.details.map((x) => problemWords(x)),
  };
}

/**
 * Write the line about each person the latest weekly pass noted, and keep it.
 * One that fails does not stop the rest; it is said.
 * @param opts.dryRun write nothing (the shadow runner)
 */
export async function writePersonWords(env, userId, { dryRun = false, run = null } = {}) {
  if (!personWordsOn(env)) return { skipped: 'PERSON_WORDS is off' };
  const [noted, person, today, lifeMap] = await Promise.all([
    notedPeople(env, userId, { run }),
    personIdentity(env, userId),
    personToday(env, userId),
    loadLifeMapLines(env, db(env), userId, 'person_words'),
  ]);
  const d = db(env);
  const lines = [];
  const counts = { checked: 0, sent_back: 0, left_out: 0 };
  const details = [];
  for (const p of noted.people) {
    try {
      const result = await personLine(env, { person, today, lifeMap, ...p });
      if (result.check) {
        counts.checked += result.check.counts.checked;
        counts.sent_back += result.check.counts.sent_back;
        counts.left_out += result.check.counts.left_out;
        details.push(...result.check.details.map((x) => ({ ...x, key: `life_people.${p.someone.id}` })));
      }
      // a line the check let stand replaces the one they had; otherwise theirs stays
      const kept = !dryRun && result.text ? await keepPersonLine(d, { userId, someone: p.someone, result }) : false;
      lines.push({
        id: p.someone.id,
        outcome: result.outcome,
        skipped: result.skipped || null,
        kept,
        ...(dryRun ? { text: result.text, was: p.someone.words ?? null, problems: result.problems || [] } : {}),
      });
    } catch (err) {
      console.warn(`[ALERT][PersonWords] the line about ${p.someone.id} could not be written for ${userId}: ${String(err?.message || err).slice(0, 200)}`);
      lines.push({ id: p.someone.id, error: String(err?.message || err).slice(0, 200) });
    }
  }
  if (!dryRun) {
    if (counts.checked || counts.left_out)
      await d
        .insertQuiet('check_runs', [
          checkRunRow({ userId, job: 'person_words', day: today, counts, details, model: modelFor(env, 'words').model }),
        ])
        .catch((err) => console.warn(`[PersonWords] could not log the check: ${err.message}`));
    if (lines.some((x) => x.kept)) await invalidateChatCache(env, userId);
  }
  return {
    run: noted.run,
    noted: noted.people.length,
    written: lines.filter((x) => x.outcome === 'pass' || x.outcome === 'rewritten').length,
    left_out: lines.filter((x) => x.outcome === 'left_out').length,
    empty: lines.filter((x) => x.outcome === 'empty').length,
    failed: lines.filter((x) => x.error).length,
    lines,
  };
}

/** Keep one person's line, and what it rests on (passage_refs). */
export async function keepPersonLine(d, { userId, someone, result, at = new Date().toISOString() }) {
  const saved = await d.update(`life_people?id=eq.${someone.id}&user_id=eq.${userId}`, {
    words: result.text,
    words_updated_at: at,
  });
  if (!saved?.length) return false;
  await d.remove(`passage_refs?user_id=eq.${userId}&row_table=eq.life_people&row_id=eq.${someone.id}&field=eq.words`);
  await recordPassages(d, [
    passageRow({
      userId,
      surface: 'person',
      table: 'life_people',
      id: someone.id,
      field: 'words',
      factIds: result.ids.filter((x) => x.type === 'fact').map((x) => x.id),
      personIds: [someone.id],
      writer: 'words',
      model: result.model || null,
      promptVersion: PERSON_WORDS_VERSION,
      at,
    }),
  ]);
  return true;
}
