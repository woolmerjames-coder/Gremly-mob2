/**
 * Questions about the people in someone's life (data fabric stage 4c).
 *
 * Gremly's records of people fill in over time: someone is known by who they
 * are before their name comes up, or by their name before anyone says who they
 * are, and two records may turn out to be one person. When the records cannot
 * settle it, Gremly may ask, by the same rules as every question
 * (workers/shared/questionRules.js): never at the moment of dropping, only in
 * the brief and the wrap up, at most one about people open at a time, never
 * about anything private, and a no is never asked again.
 *
 * Code finds who may be asked about, by ids and counts: a merge the reader
 * proposed, someone who keeps coming up with no who, someone known only by
 * who they are with no name. The model chooses the one worth asking about, if
 * any, and writes the question and the answers to tap. Code checks the ref and
 * writes the question.
 *
 * The answer arrives through the correction path (context/corrections.js). A
 * model reads it, and code applies only what it says: a merge on a yes, the
 * merge declined on a no, and who someone is or their name, in the person's
 * own words, which are theirs from then on.
 */

import { db, addDays, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { CARE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { loadPeople, mergePeople } from './people';
import { invalidateChatCache } from './cache';
import { personToday } from './filing';
import { OPEN_PERSON_QUESTIONS, PERSON_QUESTION_MIN_FACTS } from '../../shared/questionRules.js';

export const PERSON_QUESTIONS_VERSION = 'person-questions-2026-10-07d';
export const PERSON_ANSWER_VERSION = 'person-answer-2026-10-07a';

/** Candidates shown to the writer at most, and facts shown for each person. */
const MOST_CANDIDATES = 12;
const FACTS_EACH = 6;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The key a question's no is remembered by: built from ids alone. */
export function personNoKey(c) {
  if (c.type === 'same') return `person:same:${c.kept.id}:${c.merged.id}`;
  return `person:${c.type}:${c.person.id}`;
}

/**
 * Who may be asked about, from the records alone. Pure: counts and ids, never
 * the person's words. Facts that are private or about health are never shown,
 * and never counted, and nor is who someone is when it was read from one: a
 * question never names it.
 * @param p.people live people records [{ id, name, relationship, hidden_at, who_private }]
 * @param p.factsOf Map person id -> facts tied to them [{ statement, private, health, ... }]
 * @param p.merges proposed merges [{ id, kept_id, merged_id, status }]
 * @param p.noKeys keys of questions answered or turned away before
 */
export function personCandidates({ people, factsOf, merges = [], noKeys = new Set() }) {
  // who someone is, read from something private, is never shown
  const shown = (p) => (p.who_private ? { ...p, relationship: null } : p);
  const live = new Map((people || []).filter((p) => !p.hidden_at).map((p) => [p.id, shown(p)]));
  const known = (p) => !!(p.name || p.relationship);
  const open = (id) => (factsOf.get(id) || []).filter((f) => !f.private && !f.health);
  const out = [];
  for (const m of merges) {
    if (m.status !== 'proposed') continue;
    const kept = live.get(m.kept_id);
    const merged = live.get(m.merged_id);
    if (!kept || !merged || !known(kept) || !known(merged)) continue;
    const c = { type: 'same', merge_id: m.id, kept, merged, why: m.reason || null };
    c.facts = { kept: open(kept.id), merged: open(merged.id) };
    c.weight = c.facts.kept.length + c.facts.merged.length;
    if (c.weight < PERSON_QUESTION_MIN_FACTS || noKeys.has(personNoKey(c))) continue;
    out.push(c);
  }
  for (const p of live.values()) {
    // Gremly knows who they are, from something private: nothing to ask
    if (p.who_private) continue;
    const facts = open(p.id);
    if (facts.length < PERSON_QUESTION_MIN_FACTS) continue;
    const type = p.name && !p.relationship ? 'who' : !p.name && p.relationship ? 'name' : null;
    if (!type) continue;
    const c = { type, person: p, facts, weight: facts.length };
    if (noKeys.has(personNoKey(c))) continue;
    out.push(c);
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, MOST_CANDIDATES);
}

const name = (p) => (p?.name ? p.name : '(no name known)');
const who = (p) => (p?.relationship ? `${p.relationship}, as they said` : 'who they are not known');
const factLines = (facts) =>
  facts
    .slice(0, FACTS_EACH)
    .map((f) => `  - ${f.about_date ? `${f.about_date}: ` : ''}${trim(f.statement, 200)}`)
    .join('\n');

const ASK_RULES = `A QUESTION ABOUT SOMEONE IN THEIR LIFE
- Gremly keeps a record of each person in the person's life, which fills in over time. Some records are not yet complete: Gremly does not know who someone is to them, or the name of someone it knows only by who they are, or it thinks two records may be one person.
- You are given the records that could be asked about, each with what Gremly holds about that person. Choose at most one: the one whose answer would most help Gremly understand their life. Choose none when no question is worth their time.
- Write one short, warm question to them, as you. Ask it plainly, without presuming the answer, and without saying why Gremly is unsure or how its records work.
- Name the people as the records do. Never mention or hint at anything private or about health, and never someone who is not part of their life.
- Give up to four short answers they could tap, a few words each, each one a whole answer to the question, covering what they would most likely say. When the question takes as given something the records do not state, one of them says it is not so, in words that answer the question. When only their own words can answer it, give none.
- Beneath the answers they can always type their own or skip, so never give an answer that only says they would say something else, would type it, or would rather not answer.`;

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    ask: { type: 'boolean' },
    candidate_ref: { type: 'string', nullable: true },
    question: { type: 'string', nullable: true },
    choices: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
  },
  required: ['ask', 'candidate_ref', 'question', 'choices', 'why'],
};

/** The writer's request, and the refs it may answer with. Pure. */
export function personQuestionRequest({ candidates, person, today }) {
  const refs = new Map();
  const lines = candidates.map((c, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, c);
    if (c.type === 'same')
      return `${ref} | whether two records are one person
  record A: ${name(c.kept)} | ${who(c.kept)}
${factLines(c.facts.kept)}
  record B: ${name(c.merged)} | ${who(c.merged)}
${factLines(c.facts.merged)}`;
    if (c.type === 'who')
      return `${ref} | who this person is to them
  ${name(c.person)} | ${who(c.person)}
${factLines(c.facts)}`;
    return `${ref} | the name of someone known only by who they are
  ${name(c.person)} | ${who(c.person)}
${factLines(c.facts)}`;
  });
  return {
    system: {
      fixed: `You choose and write Gremly's questions about the people in someone's life, for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${ASK_RULES}

${WRITING_RULES}`,
      varying: personBlock(person),
    },
    user: `TODAY: ${today}.

RECORDS THAT COULD BE ASKED ABOUT (ref | what is not known, then each record: name | who they are, and what Gremly holds about them):
${lines.join('\n\n')}`,
    refs,
  };
}

/** The answers to tap: up to four, short, each once. Pure. */
export function cleanChoices(choices) {
  const out = [];
  for (const c of choices || []) {
    const s = trim(c, 40);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 4);
}

/** The question row for a candidate. Pure. */
export function personQuestionRow({ userId, c, question, choices, runId, holdUntil = null }) {
  return {
    user_id: userId,
    kind: 'person',
    question: trim(question, 300),
    choices,
    status: 'open',
    record_table: c.type === 'same' ? 'person_merges' : 'life_people',
    record_id: c.type === 'same' ? c.merge_id : c.person.id,
    proposed_change:
      c.type === 'same'
        ? { type: 'same', merge_id: c.merge_id, kept_id: c.kept.id, merged_id: c.merged.id }
        : { type: c.type, person_id: c.person.id },
    no_key: personNoKey(c),
    hold_until: holdUntil,
    run_id: runId,
    prompt_version: PERSON_QUESTIONS_VERSION,
  };
}

/**
 * Whether an open question about someone still has something to ask. Pure.
 * Its merge must still be proposed between two live records, or its person
 * live, not hidden, and still without what it asks.
 * @param q an open person question, with its proposed_change
 * @param people Map id -> { id, name, relationship, merged_into, hidden_at }
 * @param merges Map id -> { id, status }
 */
export function personQuestionLive(q, people, merges) {
  const change = q.proposed_change || {};
  const live = (id) => {
    const p = people.get(id);
    return !!p && !p.merged_into && !p.hidden_at;
  };
  if (change.type === 'same')
    return (
      merges.get(change.merge_id)?.status === 'proposed' &&
      live(change.kept_id) &&
      live(change.merged_id)
    );
  if (!live(change.person_id)) return false;
  const p = people.get(change.person_id);
  if (change.type === 'who') return !p.relationship;
  if (change.type === 'name') return !p.name;
  return false;
}

/**
 * The people who could be asked about, unless a question about someone is
 * open. An open one with nothing left to ask (its record merged, hidden or
 * gone, or what it asks filled in since) is closed as expired first, unless
 * this is a dry run.
 */
export async function loadPersonCandidates(env, userId, { expireStale = false } = {}) {
  const d = db(env);
  const [opened, asked, people, merges] = await Promise.all([
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=eq.person&status=in.(open,asked)&select=id,proposed_change`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=eq.person&status=in.(answered,dismissed,expired)&no_key=not.is.null&select=no_key`,
    ),
    loadPeople(d, userId),
    d.select(
      `person_merges?user_id=eq.${userId}&status=eq.proposed&select=id,kept_id,merged_id,status,reason`,
    ),
  ]);
  const open = await liveOpen(d, userId, opened || [], { expireStale });
  if (open.length >= OPEN_PERSON_QUESTIONS) return { open: open.length, candidates: [] };
  const ids = people.map((p) => p.id);
  const ties = [];
  for (let i = 0; i < ids.length; i += 100)
    ties.push(
      ...((await d.select(
        `life_fact_people?user_id=eq.${userId}&person_id=in.(${ids.slice(i, i + 100).join(',')})&select=fact_id,person_id`,
      )) || []),
    );
  const factIds = [...new Set(ties.map((t) => t.fact_id))];
  const facts = new Map();
  for (let i = 0; i < factIds.length; i += 100)
    for (const f of (await d.select(
      `life_facts_now?user_id=eq.${userId}&id=in.(${factIds.slice(i, i + 100).join(',')})&state=in.(current,planned,unconfirmed,happened)&select=id,statement,about_date,state,private,health,last_confirmed_at`,
    )) || [])
      facts.set(f.id, f);
  const factsOf = new Map();
  for (const t of ties) {
    const f = facts.get(t.fact_id);
    if (f) factsOf.set(t.person_id, [...(factsOf.get(t.person_id) || []), f]);
  }
  for (const list of factsOf.values())
    list.sort((a, b) => String(b.last_confirmed_at).localeCompare(String(a.last_confirmed_at)));
  // who someone is, when Gremly read it from something private or about health
  const whoFacts = [...new Set(people.map((p) => p.relationship_fact_id).filter(Boolean))];
  const privateWho = new Set();
  for (let i = 0; i < whoFacts.length; i += 100)
    for (const f of (await d.select(
      `life_facts?user_id=eq.${userId}&id=in.(${whoFacts.slice(i, i + 100).join(',')})&select=id,private,health`,
    )) || [])
      if (f.private || f.health) privateWho.add(f.id);
  return {
    open: 0,
    expired: (opened || []).length - open.length,
    candidates: personCandidates({
      people: people.map((p) =>
        privateWho.has(p.relationship_fact_id) ? { ...p, who_private: true } : p,
      ),
      factsOf,
      merges: merges || [],
      noKeys: new Set((asked || []).map((q) => q.no_key)),
    }),
  };
}

/** The open questions about someone that still have something to ask; the rest expire. */
async function liveOpen(d, userId, opened, { expireStale }) {
  if (!opened.length) return [];
  const changes = opened.map((q) => q.proposed_change || {});
  const personIds = [
    ...new Set(changes.flatMap((c) => [c.person_id, c.kept_id, c.merged_id]).filter(Boolean)),
  ];
  const mergeIds = [...new Set(changes.map((c) => c.merge_id).filter(Boolean))];
  const [people, merges] = await Promise.all([
    personIds.length
      ? d.select(
          `life_people?user_id=eq.${userId}&id=in.(${personIds.join(',')})&select=id,name,relationship,merged_into,hidden_at`,
        )
      : [],
    mergeIds.length
      ? d.select(
          `person_merges?user_id=eq.${userId}&id=in.(${mergeIds.join(',')})&select=id,status`,
        )
      : [],
  ]);
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const mergeById = new Map((merges || []).map((m) => [m.id, m]));
  const live = [];
  for (const q of opened) {
    if (personQuestionLive(q, byId, mergeById)) {
      live.push(q);
      continue;
    }
    // closed without their answer, so it is no no: it may be asked again
    if (expireStale)
      await d.update(`gremly_questions?id=eq.${q.id}&user_id=eq.${userId}&status=in.(open,asked)`, {
        status: 'expired',
        no_key: null,
      });
  }
  return live;
}

/**
 * Ask the model which question is worth asking, and check what it gives: a
 * ref it was given, a question, and two to four answers. Writes nothing; the
 * replay calls it as the worker does.
 * @returns {{ c, question, choices, model, why } | { skipped, model, why }}
 */
export async function askPersonQuestion(env, { candidates, person, today }) {
  const { system, user, refs } = personQuestionRequest({ candidates, person, today });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'personQuestion'),
    fallback: modelFor(env, 'personQuestionFallback'),
    system,
    user,
    schema: ASK_SCHEMA,
    maxTokens: 2000,
    effort: 'low',
    thinking: 'low',
  });
  const why = trim(output?.why, 300);
  if (!output?.ask) return { skipped: 'none worth asking', model, why };
  const c = refs.get(output.candidate_ref);
  const question = trim(output.question, 300);
  const choices = cleanChoices(output.choices);
  // a question with no answers to tap is answered by typing
  if (!c || !question)
    return { skipped: !c ? 'a ref it was never given' : 'no question', model, why };
  return { c, question, choices, model, why };
}

/**
 * Write one question about someone in their life, when one is worth asking and
 * none is open. In a dry run nothing is written and the question is returned.
 * @param opts.holdUntil not asked before this day, for one raised right after
 *   an answer, so two are never asked back to back
 */
export async function writePersonQuestion(
  env,
  userId,
  { dryRun = false, holdUntil = null, runId = null } = {},
) {
  const { open, candidates } = await loadPersonCandidates(env, userId, { expireStale: !dryRun });
  if (open) return { written: false, skipped: 'one is open' };
  if (!candidates.length) return { written: false, skipped: 'no one to ask about' };
  const [person, today] = await Promise.all([
    personIdentity(env, userId),
    personToday(env, userId),
  ]);
  const asked = await askPersonQuestion(env, { candidates, person, today });
  const out = { candidates: candidates.length, model: asked.model, why: asked.why };
  if (asked.skipped) return { ...out, written: false, skipped: asked.skipped };
  const { c, question, choices } = asked;
  const row = personQuestionRow({
    userId,
    c,
    question,
    choices,
    runId: runId || `person-question-${userId.slice(0, 8)}-${today}`,
    holdUntil,
  });
  if (dryRun) return { ...out, written: false, dry_run: true, row };
  // the database holds one open at a time as well, so a race writes one
  await db(env).insertQuiet('gremly_questions', [row]);
  return { ...out, written: true, type: c.type, question };
}

// ── The answer ──────────────────────────────────────────────────────────────

const ANSWER_RULES = `THEIR ANSWER ABOUT SOMEONE IN THEIR LIFE
- Gremly asked the person a question about someone in their life, and they answered, by tapping an answer or in their own words.
- answers is true when their words tell Gremly what was asked, in whole or in part, or that the question is wrong or not one they want to be asked. It is false when they only ask something back, or speak of something else.
- same: for a question whether two records are one person, yes when their words say it is one person, no when their words say they are different people, and unsure otherwise. Null for any other question.
- who: who the person asked about is to them, only as their words state it, in words that name only that relationship from their side, never naming them. Null when their words do not say.
- name: the name of the person asked about, only as their words give it. Null when their words do not give one.
- Never infer anything their words do not say.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: { type: 'boolean' },
    same: { type: 'string', enum: ['yes', 'no', 'unsure'], nullable: true },
    who: { type: 'string', nullable: true },
    name: { type: 'string', nullable: true },
  },
  required: ['answers', 'same', 'who', 'name'],
};

/** The answer reader's request. Pure. */
export function personAnswerRequest({ question, said, people, person }) {
  const change = question.proposed_change || {};
  const lines =
    change.type === 'same'
      ? [
          `record A: ${name(people.get(change.kept_id))} | ${who(people.get(change.kept_id))}`,
          `record B: ${name(people.get(change.merged_id))} | ${who(people.get(change.merged_id))}`,
        ]
      : [`${name(people.get(change.person_id))} | ${who(people.get(change.person_id))}`];
  return {
    system: {
      fixed: `You read a person's answer to Gremly's question about someone in their life.\n\n${ANSWER_RULES}`,
      varying: personBlock(person),
    },
    user: `GREMLY ASKED: "${trim(question.question, 300)}"
WHAT IT ASKED ABOUT: ${
      change.type === 'same'
        ? 'whether two records are one person'
        : change.type === 'who'
          ? 'who this person is to them'
          : 'the name of someone known only by who they are'
    }
${lines.join('\n')}
THEIR ANSWER: "${trim(said, 600)}"`,
  };
}

/**
 * What the read answer does, as writes. Pure: the merge to make or decline,
 * and who someone is or their name, set as the person's own.
 */
export function personAnswerPlan(question, output) {
  const change = question.proposed_change || {};
  const plan = { answers: output?.answers !== false, merge: null, decline: null, person: null };
  if (!plan.answers) return plan;
  if (change.type === 'same') {
    if (output.same === 'yes') plan.merge = change.merge_id;
    if (output.same === 'no') plan.decline = change.merge_id;
    return plan;
  }
  // only what was asked is filled in
  const said =
    change.type === 'who'
      ? trim(output.who, 60)
      : change.type === 'name'
        ? trim(output.name, 80)
        : '';
  if (!said) return plan;
  plan.person = {
    id: change.person_id,
    ...(change.type === 'who' ? { relationship: said } : { name: said }),
  };
  return plan;
}

/** Read the person's answer with the model. Writes nothing; the replay calls it too. */
export async function readPersonAnswer(env, { question, said, people, person }) {
  return jsonCall(env, {
    primary: modelFor(env, 'personQuestion'),
    fallback: modelFor(env, 'personQuestionFallback'),
    ...personAnswerRequest({ question, said, people, person }),
    schema: ANSWER_SCHEMA,
    maxTokens: 800,
    effort: 'low',
    thinking: 'low',
  });
}

/**
 * Read and apply the person's answer to a question about someone. Returns
 * whether it answered the question, and what changed. The caller closes the
 * question and the correction.
 */
export async function answerPersonQuestion(env, { userId, question, said }) {
  const d = db(env);
  const change = question.proposed_change || {};
  const ids = [change.kept_id, change.merged_id, change.person_id].filter(Boolean);
  const [people, person] = await Promise.all([
    ids.length
      ? d.select(
          `life_people?user_id=eq.${userId}&id=in.(${ids.join(',')})&select=id,name,name_by,relationship,relationship_by,merged_into`,
        )
      : [],
    personIdentity(env, userId),
  ]);
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const { output, model } = await readPersonAnswer(env, { question, said, people: byId, person });
  const plan = personAnswerPlan(question, output);
  const result = { answers: plan.answers, model, version: PERSON_ANSWER_VERSION };
  const nowIso = new Date().toISOString();
  if (plan.merge) result.merge = await mergePeople(d, userId, plan.merge);
  if (plan.decline) {
    const rows = await d.update(
      `person_merges?id=eq.${plan.decline}&user_id=eq.${userId}&status=eq.proposed`,
      { status: 'declined', decided_at: nowIso },
    );
    result.declined = Array.isArray(rows) && rows.length > 0;
  }
  if (plan.person) {
    const p = byId.get(plan.person.id);
    if (!p || p.merged_into) {
      // the record was merged or removed since it was asked: nothing to fill in
      result.gone = plan.person.id;
      console.warn(
        `[ALERT][People] an answer about ${plan.person.id} came after the record was ${p ? 'merged' : 'removed'}: nothing filled in`,
      );
    } else {
      const patch = { updated_at: nowIso };
      // their own words, theirs from now on; what they wrote before stays
      if (plan.person.relationship)
        Object.assign(patch, {
          relationship: plan.person.relationship,
          relationship_by: 'person',
          relationship_fact_id: null,
        });
      if (plan.person.name) Object.assign(patch, { name: plan.person.name, name_by: 'person' });
      const guard = plan.person.relationship ? '&relationship_by=eq.gremly' : '&name_by=eq.gremly';
      const rows = await d.update(`life_people?id=eq.${p.id}&user_id=eq.${userId}${guard}`, patch);
      if (Array.isArray(rows) && rows.length) {
        if (plan.person.name)
          await d.insertIgnore(
            'life_person_names',
            [{ person_id: p.id, user_id: userId, name: plan.person.name, by: 'person' }],
            'person_id,name',
          );
        result.person = plan.person;
      } else result.theirs_already = plan.person.id;
    }
  }
  if (result.merge?.merged || result.declined || result.person)
    await invalidateChatCache(env, userId);
  return result;
}

/** The day after the person's today, for a question raised right after an answer. */
export async function tomorrowFor(env, userId) {
  return addDays(await personToday(env, userId), 1);
}
