/**
 * Questions about the people in someone's life, and about what Gremly is not
 * sure of yet (data fabric stage 4c; asked as a set since 8 Oct).
 *
 * Gremly's records of people fill in over time: someone is known by who they
 * are before their name comes up, or by their name before anyone says who they
 * are, and two records may turn out to be one person. Apart from its facts,
 * Gremly also keeps what it thinks about their life but no record states
 * (context/unsure.js): who someone is to them, or anything else that matters.
 * When the records cannot settle it, Gremly asks, by the same rules as every
 * question (workers/shared/questionRules.js): never at the moment of
 * dropping, never about anything private, and a no is never asked again.
 *
 * These are asked as one set of up to five a week (QUESTION_SET_MOST), the
 * people who matter most to them first, so the picture fills in within weeks
 * rather than months. A set waits while any of it has not been put to them;
 * one put to them and left unanswered is closed when the next set is due, and
 * never asked again.
 *
 * Code finds what may be asked about, by ids and counts: a merge the reader
 * proposed, someone who keeps coming up with no who, someone known only by
 * who they are with no name, someone who matters most to them, and what
 * Gremly is not sure of. The model chooses which are worth asking and writes
 * each question and the answers to tap; where Gremly thinks something, the
 * first answer offers it, so the person mostly confirms or corrects. Code
 * checks the refs and writes the set.
 *
 * The answer arrives through the correction path (context/corrections.js). A
 * question about someone is read here, and code applies only what it says: a
 * merge on a yes, the merge declined on a no, and who someone is or their
 * name, in the person's own words, which are theirs from then on. A question
 * about anything else Gremly is not sure of is read like any answer, so a yes
 * becomes a fact in their words. Either way what Gremly thought is confirmed
 * or closed as they said.
 */

import { db, addDays, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { CARE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { loadPeople, mergePeople } from './people';
import { invalidateChatCache } from './cache';
import { personToday } from './filing';
import {
  QUESTION_SET_MOST,
  PERSON_QUESTION_MIN_FACTS,
  ASKED_WAIT_DAYS,
} from '../../shared/questionRules.js';

export const PERSON_QUESTIONS_VERSION = 'question-set-2026-10-18d';
export const PERSON_ANSWER_VERSION = 'person-answer-2026-10-18b';

/** Candidates shown to the writer at most, and facts shown for each. */
const MOST_CANDIDATES = 15;
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
  if (c.type === 'unsure') return `unsure:${c.entry.id}`;
  return `person:${c.type}:${c.person.id}`;
}

const SURE_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * What may be asked about, from the records alone. Pure: counts and ids,
 * never the person's words. Facts that are private or about health are never
 * shown, and never counted, and nor is who someone is when it was read from
 * one: a question never names it. What Gremly is not sure of is asked about
 * only while everything it rests on can still be shown.
 * @param p.people live people records [{ id, name, relationship, hidden_at, who_private, matters_rank }]
 * @param p.factsOf Map person id -> facts tied to them [{ statement, private, health, ... }]
 * @param p.merges proposed merges [{ id, kept_id, merged_id, status }]
 * @param p.noKeys keys of questions answered or turned away before
 * @param p.guesses open entries of what Gremly is not sure of
 *   [{ id, person_id, kind, thinks, sure, rests_on }]
 * @param p.restFacts Map fact id -> the facts those entries rest on, as they stand
 */
export function askCandidates({
  people,
  factsOf,
  merges = [],
  noKeys = new Set(),
  guesses = [],
  restFacts = new Map(),
}) {
  // who someone is, read from something private, is never shown
  const shown = (p) => (p.who_private ? { ...p, relationship: null } : p);
  const live = new Map((people || []).filter((p) => !p.hidden_at).map((p) => [p.id, shown(p)]));
  const known = (p) => !!(p.name || p.relationship);
  const open = (id) => (factsOf.get(id) || []).filter((f) => !f.private && !f.health);
  // what an entry rests on that still stands: none of it private or about
  // health, and at least one fact of it not put right since
  const restsOf = (g) => {
    const refs = (Array.isArray(g.rests_on) ? g.rests_on : []).filter((r) => r?.table === 'life_facts');
    const facts = refs.map((r) => restFacts.get(r.id)).filter(Boolean);
    if (!facts.length || facts.some((f) => f.private || f.health)) return null;
    return facts;
  };
  // a guess Gremly is not fairly sure of is never offered to them as an answer
  const offered = (g) => g?.sure === 'medium' || g?.sure === 'high';
  const rankOf = (p) => (p && p.matters_rank != null ? Number(p.matters_rank) : null);
  const whoGuess = new Map();
  for (const g of guesses || [])
    if (g.kind === 'who' && g.person_id && offered(g) && restsOf(g)) whoGuess.set(g.person_id, g);
  const out = [];
  for (const m of merges) {
    if (m.status !== 'proposed') continue;
    const kept = live.get(m.kept_id);
    const merged = live.get(m.merged_id);
    if (!kept || !merged || !known(kept) || !known(merged)) continue;
    const c = { type: 'same', merge_id: m.id, kept, merged, why: m.reason || null };
    c.facts = { kept: open(kept.id), merged: open(merged.id) };
    c.weight = c.facts.kept.length + c.facts.merged.length;
    c.rank = [rankOf(kept), rankOf(merged)].filter((r) => r != null).sort((a, b) => a - b)[0] ?? null;
    if (c.weight < PERSON_QUESTION_MIN_FACTS || noKeys.has(personNoKey(c))) continue;
    out.push(c);
  }
  for (const p of live.values()) {
    // Gremly knows who they are, from something private: nothing to ask
    if (p.who_private) continue;
    const facts = open(p.id);
    const type = p.name && !p.relationship ? 'who' : !p.name && p.relationship ? 'name' : null;
    if (!type) continue;
    const guess = type === 'who' ? whoGuess.get(p.id) || null : null;
    // someone who matters most to them, or whom Gremly has a guess about, is
    // asked about however often they come up; anyone else once they keep coming up
    if (facts.length < PERSON_QUESTION_MIN_FACTS && rankOf(p) == null && !guess) continue;
    if (!facts.length && !guess) continue;
    const c = { type, person: p, facts, weight: facts.length, rank: rankOf(p) };
    if (guess) c.guess = { id: guess.id, thinks: guess.thinks, sure: guess.sure };
    if (noKeys.has(personNoKey(c))) continue;
    out.push(c);
  }
  for (const g of guesses || []) {
    if (g.kind !== 'life' || !offered(g)) continue;
    const about = g.person_id ? live.get(g.person_id) : null;
    if (g.person_id && !about) continue;
    const facts = restsOf(g);
    if (!facts) continue;
    const c = { type: 'unsure', entry: g, person: about, facts, weight: facts.length, rank: rankOf(about) };
    if (noKeys.has(personNoKey(c))) continue;
    out.push(c);
  }
  // the people who matter most first, then what Gremly is surest of, then who comes up most
  const sure = (c) => SURE_ORDER[c.guess?.sure || c.entry?.sure] ?? 3;
  const sorted = out.sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || sure(a) - sure(b) || b.weight - a.weight,
  );
  // someone two records may be is asked about through that, never alone as
  // well, and through one pair a set: its answer settles who they are
  const merging = new Set(sorted.filter((c) => c.type === 'same').flatMap((c) => [c.kept.id, c.merged.id]));
  const asked = new Set();
  const kept = [];
  for (const c of sorted) {
    if ((c.type === 'who' || c.type === 'name') && merging.has(c.person.id)) continue;
    if (c.type === 'same') {
      if (asked.has(c.kept.id) || asked.has(c.merged.id)) continue;
      asked.add(c.kept.id);
      asked.add(c.merged.id);
    }
    kept.push(c);
  }
  return kept.slice(0, MOST_CANDIDATES);
}

const name = (p) => (p?.name ? p.name : '(no name known)');
const who = (p) => (p?.relationship ? `${p.relationship}, as they said` : 'who they are not known');
const matters = (p) => (p?.matters_rank != null ? ' | one of the people who matter most to them' : '');
const factLines = (facts) =>
  facts
    .slice(0, FACTS_EACH)
    .map((f) => `  - ${f.about_date ? `${f.about_date}: ` : ''}${trim(f.statement, 200)}`)
    .join('\n');
const thinksLine = (g) =>
  g ? `\n  Gremly thinks, but is not sure: ${trim(g.thinks, 240)} (how sure: ${g.sure})` : '';

const ASK_RULES = `QUESTIONS ABOUT THEIR LIFE, ASKED AS ONE SET
- Gremly keeps a record of each person in the person's life, which fills in over time, and apart from its facts it keeps what it thinks about their life but no record states. You are given what could be asked about: records not yet complete, where Gremly does not know who someone is to them, or the name of someone it knows only by who they are, or thinks two records may be one person; and what Gremly thinks but is not sure of, each with what it rests on and how sure Gremly is.
- Choose up to five, those whose answers would most help Gremly understand their life, starting with the people who matter most to them, and give them in the order they are best asked. Choose fewer when fewer are worth their time, and none when none is. Never two that ask the same thing.
- For each, write one short, warm question to them, as you, that they can answer on its own. Ask it plainly, without saying why Gremly is unsure or how its records work. Where two records may be one person, ask it the way the person would think of it, naming them once: when one record says who they are to the person, whether the one the other record names is that, so that a yes makes them one. Never mention records, or that there may be two of them.
- What Gremly thinks is never said as known. Ask so they can say whether it is so, without presuming it. When Gremly thinks it knows who someone is, ask who they are, and offer what it thinks as the first answer.
- Name the people as the records do. Never mention or hint at anything private or about health, and never someone who is not part of their life.
- Give up to four answers they could tap, each a few words as a person would tap it, never a sentence, and each a whole answer to the question, covering what they would most likely say. Where Gremly thinks something, the first says it is so, in the words they would use. When the question could take as given something the records do not state, one of them says it is not so, in words that answer the question. When only their own words can answer it, give none.
- Beneath the answers they can always type their own or skip, so never give an answer that only says they would say something else, would type it, or would rather not answer.`;

const SET_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate_ref: { type: 'string' },
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
        },
        required: ['candidate_ref', 'question', 'choices'],
      },
    },
    why: { type: 'string' },
  },
  required: ['questions', 'why'],
};

/** The writer's request, and the refs it may answer with. Pure. */
export function questionSetRequest({ candidates, person, today }) {
  const refs = new Map();
  const lines = candidates.map((c, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, c);
    if (c.type === 'same')
      return `${ref} | whether two records are one person
  record A: ${name(c.kept)} | ${who(c.kept)}${matters(c.kept)}
${factLines(c.facts.kept)}
  record B: ${name(c.merged)} | ${who(c.merged)}${matters(c.merged)}
${factLines(c.facts.merged)}`;
    if (c.type === 'who')
      return `${ref} | who this person is to them
  ${name(c.person)} | ${who(c.person)}${matters(c.person)}${thinksLine(c.guess)}
${factLines(c.facts)}`;
    if (c.type === 'name')
      return `${ref} | the name of someone known only by who they are
  ${name(c.person)} | ${who(c.person)}${matters(c.person)}
${factLines(c.facts)}`;
    return `${ref} | something Gremly thinks about their life but is not sure of
  about: ${c.person ? `${name(c.person)} | ${who(c.person)}${matters(c.person)}` : 'them'}${thinksLine(c.entry)}
  it rests on:
${factLines(c.facts)}`;
  });
  return {
    system: {
      fixed: `You choose and write Gremly's questions about the people in someone's life and about what Gremly is not sure of, for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${ASK_RULES}

${WRITING_RULES}`,
      varying: personBlock(person),
    },
    user: `TODAY: ${today}.

WHAT COULD BE ASKED ABOUT (ref | what is not known, then what Gremly holds: each record as name | who they are, what Gremly thinks where it thinks something, and the facts):
${lines.join('\n\n')}`,
    refs,
  };
}

/** Longest answer to tap, in characters: one longer is left off, never cut. */
const CHOICE_MOST = 40;

/** The answers to tap: up to four, short, each once. Pure. */
export function cleanChoices(choices) {
  const out = [];
  for (const c of choices || []) {
    const s = trim(c, 200);
    if (!s || s.length > CHOICE_MOST) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 4);
}

/**
 * The question row for a candidate, one of a set. Pure. Every row of a set
 * has the same fields, as one insert needs.
 */
export function questionSetRow({ userId, c, question, choices, runId, setId }) {
  const base = {
    user_id: userId,
    question: trim(question, 300),
    choices,
    status: 'open',
    no_key: personNoKey(c),
    hold_until: null,
    set_id: setId,
    weight: 'helps',
    run_id: runId,
    prompt_version: PERSON_QUESTIONS_VERSION,
  };
  if (c.type === 'unsure')
    return {
      ...base,
      kind: 'unsure',
      record_table: 'life_unsure',
      record_id: c.entry.id,
      proposed_change: {
        type: 'unsure',
        unsure_id: c.entry.id,
        ...(c.entry.person_id ? { person_id: c.entry.person_id } : {}),
      },
      // read with the answer first, whatever their age (corrections.js)
      rests_on: (c.entry.rests_on || []).filter((r) => r?.table === 'life_facts'),
    };
  return {
    ...base,
    kind: 'person',
    record_table: c.type === 'same' ? 'person_merges' : 'life_people',
    record_id: c.type === 'same' ? c.merge_id : c.person.id,
    proposed_change:
      c.type === 'same'
        ? { type: 'same', merge_id: c.merge_id, kept_id: c.kept.id, merged_id: c.merged.id }
        : { type: c.type, person_id: c.person.id, ...(c.guess ? { unsure_id: c.guess.id } : {}) },
    rests_on: [],
  };
}

/**
 * Whether an open question about someone still has something to ask. Pure.
 * Its merge must still be proposed between two live records, or its person
 * live, not hidden, and still without what it asks; one about something Gremly
 * is not sure of, that it is still open.
 * @param q an open question, with its proposed_change
 * @param people Map id -> { id, name, relationship, merged_into, hidden_at }
 * @param merges Map id -> { id, status }
 * @param unsure Map id -> { id, status }, what Gremly is not sure of
 */
export function personQuestionLive(q, people, merges, unsure = new Map()) {
  const change = q.proposed_change || {};
  const live = (id) => {
    const p = people.get(id);
    return !!p && !p.merged_into && !p.hidden_at;
  };
  if (change.type === 'unsure')
    return (
      unsure.get(change.unsure_id)?.status === 'open' &&
      (!change.person_id || live(change.person_id))
    );
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
 * The open questions of the last set, sorted: still live and waiting to be
 * put to them, put to them a while ago and left (a skip, closed when the next
 * set is due and never asked again), and those with nothing left to ask
 * (their record merged, hidden or gone, or what they ask filled in since),
 * which expire and may be asked again. Pure.
 */
export function sortOpen(opened, live, today) {
  const leftBefore = addDays(today, -ASKED_WAIT_DAYS);
  const out = { waiting: [], skipped: [], expired: [] };
  for (const q of opened || []) {
    if (!live(q)) out.expired.push(q);
    else if (q.asked_at && String(q.asked_at).slice(0, 10) < leftBefore) out.skipped.push(q);
    else out.waiting.push(q);
  }
  return out;
}

/**
 * What could be asked about, unless a set is still waiting. The last set is
 * closed first: a question with nothing left to ask expires, one put to them
 * and left is closed as a skip, never to be asked again; unless this is a dry
 * run, which writes nothing.
 * @param opts.guesses, opts.ranks what Gremly is not sure of and who matters
 *   most, given in place of reading them (a shadow run gives the pass's own)
 */
export async function loadAskCandidates(
  env,
  userId,
  { closeOld = false, guesses = null, ranks = null, today = null } = {},
) {
  const d = db(env);
  const [opened, asked, people, merges, guessRows, rankRows, day] = await Promise.all([
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=in.(person,unsure)&status=in.(open,asked)&select=id,kind,proposed_change,asked_at,created_at,no_key`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=in.(person,unsure)&status=in.(answered,dismissed,expired)&no_key=not.is.null&select=no_key`,
    ),
    loadPeople(d, userId),
    d.select(
      `person_merges?user_id=eq.${userId}&status=eq.proposed&select=id,kept_id,merged_id,status,reason`,
    ),
    guesses
      ? guesses
      : d.select(
          `life_unsure?user_id=eq.${userId}&status=eq.open&select=id,person_id,kind,thinks,sure,rests_on,status&limit=200`,
        ),
    ranks
      ? ranks
      : d.select(`life_people?user_id=eq.${userId}&matters_rank=not.is.null&select=id,matters_rank`),
    today || personToday(env, userId),
  ]);
  const unsureById = new Map((guessRows || []).map((g) => [g.id, { status: 'open', ...g }]));
  const open = await liveOpen(d, userId, opened || [], {
    unsure: unsureById,
    today: day,
    close: closeOld,
  });
  if (open.waiting.length) return { waiting: open.waiting.length, ...open.closed, candidates: [] };
  const rank = new Map((rankRows || []).map((r) => [r.id, r.matters_rank]));
  const ids = people.map((p) => p.id);
  const ties = [];
  for (let i = 0; i < ids.length; i += 100)
    ties.push(
      ...((await d.select(
        `life_fact_people?user_id=eq.${userId}&person_id=in.(${ids.slice(i, i + 100).join(',')})&select=fact_id,person_id`,
      )) || []),
    );
  const restIds = [
    ...new Set(
      (guessRows || []).flatMap((g) =>
        (g.rests_on || []).filter((r) => r?.table === 'life_facts').map((r) => r.id),
      ),
    ),
  ];
  const factIds = [...new Set(ties.map((t) => t.fact_id))];
  const facts = new Map();
  for (let i = 0; i < factIds.length; i += 100)
    for (const f of (await d.select(
      `life_facts_now?user_id=eq.${userId}&id=in.(${factIds.slice(i, i + 100).join(',')})&state=in.(current,planned,unconfirmed,happened)&select=id,statement,about_date,state,private,health,last_confirmed_at`,
    )) || [])
      facts.set(f.id, f);
  // what a guess rests on, in any state but put right: a plan that changed
  // since is still what pointed to it
  const restFacts = new Map();
  for (let i = 0; i < restIds.length; i += 100)
    for (const f of (await d.select(
      `life_facts_now?user_id=eq.${userId}&id=in.(${restIds.slice(i, i + 100).join(',')})&state=neq.corrected&select=id,statement,about_date,state,private,health,last_confirmed_at`,
    )) || [])
      restFacts.set(f.id, f);
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
    waiting: 0,
    ...open.closed,
    candidates: askCandidates({
      people: people.map((p) => ({
        ...p,
        ...(privateWho.has(p.relationship_fact_id) ? { who_private: true } : {}),
        matters_rank: rank.get(p.id) ?? null,
      })),
      factsOf,
      merges: merges || [],
      noKeys: new Set([
        ...(asked || []).map((q) => q.no_key),
        // what is open, or about to close as a skip, is not asked twice
        ...open.skipped.map((q) => q.no_key).filter(Boolean),
      ]),
      guesses: guessRows || [],
      restFacts,
    }),
  };
}

/** Sort the last set's open questions, and close what is done with unless this is a dry run. */
async function liveOpen(d, userId, opened, { unsure, today, close }) {
  const closed = { expired: 0, skipped: 0 };
  if (!opened.length) return { waiting: [], skipped: [], closed };
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
  const sorted = sortOpen(opened, (q) => personQuestionLive(q, byId, mergeById, unsure), today);
  closed.expired = sorted.expired.length;
  closed.skipped = sorted.skipped.length;
  if (close) {
    for (const q of sorted.expired)
      // closed without their answer, so it is no no: it may be asked again
      await d.update(`gremly_questions?id=eq.${q.id}&user_id=eq.${userId}&status=in.(open,asked)`, {
        status: 'expired',
        no_key: null,
      });
    for (const q of sorted.skipped)
      // put to them and left: a skip, kept by its no key and never asked again
      await d.update(`gremly_questions?id=eq.${q.id}&user_id=eq.${userId}&status=in.(open,asked)`, {
        status: 'dismissed',
      });
  }
  return { waiting: sorted.waiting, skipped: sorted.skipped, closed };
}

/**
 * Ask the model which questions are worth asking, up to a set, and check what
 * it gives: refs it was given, each once, and a question for each. Writes
 * nothing; the replay calls it as the worker does.
 * @returns {{ asked: [{ c, question, choices }], model, why, problems } | { skipped, model, why, problems }}
 */
export async function askQuestionSet(env, { candidates, person, today }) {
  const { system, user, refs } = questionSetRequest({ candidates, person, today });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'personQuestion'),
    fallback: modelFor(env, 'personQuestionFallback'),
    system,
    user,
    schema: SET_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  const why = trim(output?.why, 300);
  const asked = [];
  const problems = [];
  for (const q of Array.isArray(output?.questions) ? output.questions : []) {
    const c = refs.get(q?.candidate_ref);
    const question = trim(q?.question, 300);
    if (!c) problems.push('a ref it was never given');
    else if (!question) problems.push('no question');
    else if (asked.some((a) => a.c === c)) problems.push('the same one twice');
    else if (asked.length >= QUESTION_SET_MOST) problems.push('more than a set');
    // a question with no answers to tap is answered by typing
    else asked.push({ c, question, choices: cleanChoices(q.choices) });
  }
  if (!asked.length) return { skipped: problems[0] || 'none worth asking', model, why, problems };
  return { asked, model, why, problems };
}

/**
 * Write this week's set of questions about the people in their life and what
 * Gremly is not sure of, when any is worth asking and no set is waiting. In a
 * dry run nothing is written or closed, and the set is returned.
 * @param opts.guesses, opts.ranks given in place of reading them (shadow runs)
 */
export async function writeQuestionSet(
  env,
  userId,
  { dryRun = false, runId = null, guesses = null, ranks = null } = {},
) {
  const today = await personToday(env, userId);
  const loaded = await loadAskCandidates(env, userId, {
    closeOld: !dryRun,
    guesses,
    ranks,
    today,
  });
  const closed = { expired: loaded.expired, skipped: loaded.skipped };
  if (loaded.waiting) return { written: false, skipped: 'a set is waiting', waiting: loaded.waiting, closed };
  const { candidates } = loaded;
  if (!candidates.length) return { written: false, skipped: 'nothing to ask about', closed };
  const person = await personIdentity(env, userId);
  const asked = await askQuestionSet(env, { candidates, person, today });
  const out = {
    candidates: candidates.length,
    model: asked.model,
    why: asked.why,
    closed,
    ...(asked.problems.length ? { problems: asked.problems } : {}),
  };
  if (asked.skipped) return { ...out, written: false, skipped: asked.skipped };
  const setId = crypto.randomUUID();
  const rows = asked.asked.map(({ c, question, choices }) =>
    questionSetRow({
      userId,
      c,
      question,
      choices,
      runId: runId || `question-set-${userId.slice(0, 8)}-${today}`,
      setId,
    }),
  );
  if (dryRun) return { ...out, written: false, dry_run: true, rows };
  // the database holds one open question for each record as well
  await db(env).insertQuiet('gremly_questions', rows);
  return {
    ...out,
    written: true,
    count: rows.length,
    set_id: setId,
    types: asked.asked.map((a) => a.c.type),
  };
}

// ── The answer ──────────────────────────────────────────────────────────────

const ANSWER_RULES = `THEIR ANSWER ABOUT SOMEONE IN THEIR LIFE
- Gremly asked the person a question about someone in their life, and they answered, by tapping an answer or in their own words.
- answers is true when their words tell Gremly what was asked, in whole or in part, or that the question is wrong or not one they want to be asked. It is false when they only ask something back, say they do not follow the question, or speak of something else.
- same: for a question whether two records are one person, yes when their words say it is one person, no when their words say they are different people, and unsure otherwise. Null for any other question.
- who: who the person asked about is to them, only as their words state it, in words that name only that relationship from their side, never naming them. Null when their words do not say.
- name: the name of the person asked about, only as their words give it. Null when their words do not give one.
- guess: only when the request shows what Gremly thought and offered: yes when their words say it is so, no when they say it is not, and unsure when they do not say. Null when it shows nothing Gremly thought.
- Never infer anything their words do not say.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: { type: 'boolean' },
    same: { type: 'string', enum: ['yes', 'no', 'unsure'], nullable: true },
    who: { type: 'string', nullable: true },
    name: { type: 'string', nullable: true },
    guess: { type: 'string', enum: ['yes', 'no', 'unsure'], nullable: true },
  },
  required: ['answers', 'same', 'who', 'name', 'guess'],
};

/**
 * The answer reader's request. Pure.
 * @param thought what Gremly thought and offered as the first answer, when it did
 */
export function personAnswerRequest({ question, said, people, person, thought = null }) {
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
${thought ? `WHAT GREMLY THOUGHT, AND OFFERED AS AN ANSWER: ${trim(thought, 240)}\n` : ''}THEIR ANSWER: "${trim(said, 600)}"`,
  };
}

/**
 * What the read answer does, as writes. Pure: the merge to make or decline,
 * and who someone is or their name, set as the person's own.
 */
export function personAnswerPlan(question, output) {
  const change = question.proposed_change || {};
  const plan = { answers: output?.answers !== false, merge: null, decline: null, person: null, guess: null };
  if (!plan.answers) return plan;
  // what Gremly thought is confirmed only when they say it is so; any other
  // answer closes it, as a no or as theirs to keep
  if (change.unsure_id)
    plan.guess = { id: change.unsure_id, status: output?.guess === 'yes' ? 'confirmed' : 'said_no' };
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
export async function readPersonAnswer(env, { question, said, people, person, thought = null }) {
  return jsonCall(env, {
    primary: modelFor(env, 'personQuestion'),
    fallback: modelFor(env, 'personQuestionFallback'),
    ...personAnswerRequest({ question, said, people, person, thought }),
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
  const [people, person, thought] = await Promise.all([
    ids.length
      ? d.select(
          `life_people?user_id=eq.${userId}&id=in.(${ids.join(',')})&select=id,name,name_by,relationship,relationship_by,merged_into`,
        )
      : [],
    personIdentity(env, userId),
    change.unsure_id
      ? d.select(`life_unsure?id=eq.${change.unsure_id}&user_id=eq.${userId}&select=id,thinks`)
      : [],
  ]);
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const { output, model } = await readPersonAnswer(env, {
    question,
    said,
    people: byId,
    person,
    thought: thought?.[0]?.thinks || null,
  });
  const plan = personAnswerPlan(question, output);
  const result = { answers: plan.answers, model, version: PERSON_ANSWER_VERSION };
  const nowIso = new Date().toISOString();
  if (plan.guess) result.guess = await settleGuess(d, userId, plan.guess, nowIso);
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

/**
 * What Gremly thought, settled as the person said: confirmed or said no. Only
 * an open entry is settled, so a second answer changes nothing.
 */
export async function settleGuess(d, userId, { id, status }, nowIso) {
  const rows = await d.update(`life_unsure?id=eq.${id}&user_id=eq.${userId}&status=eq.open`, {
    status,
    decided_at: nowIso,
    updated_at: nowIso,
  });
  return Array.isArray(rows) && rows.length ? status : null;
}
