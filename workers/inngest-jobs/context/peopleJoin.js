/**
 * One person, one record (James, 18 Oct: "it makes no sense to have multiple
 * Daves unless they are clearly different").
 *
 * When the reader cannot tell whether a mention is someone Gremly knows, it
 * makes a second record and proposes that the two are one (people.js). Until
 * now only the person's yes joined them. Now, as with who someone is, what the
 * records make plain is known and only what is unclear is asked: the model
 * reads both records of each proposed pair, with their facts, and says whether
 * they are plainly one person, plainly two, or unclear. Code joins the plain
 * ones (mergePeople, which keeps what it moved, so undoMerge puts them back)
 * and marks the join as Gremly's; the rest stay proposed and the week's set of
 * questions asks about them. Code never compares names: the model judges.
 */

import { db, personIdentity } from './db';
import { jsonCall, modelFor, effortFor } from './llm';
import { personBlock } from '../careRules';
import { mergePeople } from './people';

export const PEOPLE_JOIN_VERSION = 'people-join-2026-10-18a';

/** Facts shown for each record of a pair, the latest first. */
const FACTS_EACH = 12;

const JOIN_RULES = `ONE PERSON OR TWO
- Gremly keeps one record for each person in someone's life. Where it could not tell whether someone mentioned was a person it already knew, it made a second record and kept both. You are given such pairs: for each record, the names it is known by, who they are to the person where that is known and whose word that is, and the facts tied to it.
- Say same when the records speak of one human being. Two records under the same name are one person unless something in them sets them apart. Records under different names, or where one has no name, are one person only when a record states it, giving that name and that tie, or both names, to the one person; anything less, however likely, is unclear.
- Say different when the records show two people: different ties to the person, separate parts of their life with nothing that joins them, or both spoken of at once as two.
- Otherwise say unclear, and Gremly will ask the person.
- Give why in one short sentence about the records.`;

const JOIN_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          verdict: { type: 'string', enum: ['same', 'different', 'unclear'] },
          why: { type: 'string' },
        },
        required: ['ref', 'verdict', 'why'],
      },
    },
  },
  required: ['pairs'],
};

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const whoLine = (p) =>
  p.relationship
    ? `${trim(p.relationship, 60)}, ${p.relationship_by === 'person' ? 'in their own words' : p.relationship_by === 'understood' ? 'as Gremly understood it from the records' : 'as they said it'}`
    : 'who they are to the person is not known';

/** The model's request for these pairs, and the refs it may answer with. Pure. */
export function joinRequest({ pairs, person }) {
  const refs = new Map();
  const record = (label, p) =>
    `  record ${label}: ${p.names?.length ? p.names.map((n) => trim(n, 40)).join(', ') : '(no name)'} | ${whoLine(p)}
${(p.facts || []).map((f) => `    - ${f.about_date ? `${String(f.about_date).slice(0, 10)}: ` : ''}${f.private ? '[private] ' : ''}${trim(f.statement, 200)}`).join('\n') || '    (no facts)'}`;
  const blocks = pairs.map((pair, i) => {
    const ref = `j${i + 1}`;
    refs.set(ref, pair);
    return `${ref}\n${record('A', pair.kept)}\n${record('B', pair.merged)}`;
  });
  return {
    system: {
      fixed: `You keep Gremly's records of the people in someone's life, for Gremly, a companion app.\n\n${JOIN_RULES}`,
      varying: personBlock(person),
    },
    user: `PAIRS (ref, then each record: names | who they are to the person, then its facts):\n${blocks.join('\n\n')}`,
    refs,
  };
}

/**
 * The order to join in: a pair whose record would be kept by another join
 * goes first, so a record is never joined into one already joined away. Pure.
 */
export function joinOrder(pairs) {
  const keptBy = new Set(pairs.map((p) => p.merge.kept_id));
  const first = pairs.filter((p) => keptBy.has(p.merge.merged_id) === false);
  const rest = pairs.filter((p) => !first.includes(p));
  return [...first, ...rest];
}

async function recordOf(d, userId, id) {
  const [p] =
    (await d.select(
      `life_people?id=eq.${id}&user_id=eq.${userId}&select=id,name,relationship,relationship_by,merged_into,hidden_at`,
    )) || [];
  if (!p) return null;
  const [names, ties] = await Promise.all([
    d.select(`life_person_names?person_id=eq.${id}&user_id=eq.${userId}&select=name`),
    d.select(`life_fact_people?person_id=eq.${id}&user_id=eq.${userId}&select=fact_id`),
  ]);
  const factIds = [...new Set((ties || []).map((t) => t.fact_id))].slice(0, 200);
  const facts = factIds.length
    ? await d.select(
        `life_facts?id=in.(${factIds.join(',')})&user_id=eq.${userId}&superseded_by=is.null&select=statement,about_date,private,health,observed_at&order=observed_at.desc&limit=${FACTS_EACH}`,
      )
    : [];
  return {
    ...p,
    names: [...new Set([p.name, ...(names || []).map((n) => n.name)].filter(Boolean))],
    facts: (facts || []).map((f) => ({ ...f, private: f.private || f.health })),
  };
}

/** Follow a record that was joined away to the one it now lives in. */
async function finalId(d, userId, id) {
  let at = id;
  for (let i = 0; i < 5; i += 1) {
    const [p] = (await d.select(`life_people?id=eq.${at}&user_id=eq.${userId}&select=id,merged_into`)) || [];
    if (!p?.merged_into) return p ? at : null;
    at = p.merged_into;
  }
  return at;
}

/**
 * Settle this person's proposed joins: join those the records make plainly
 * one person, and leave the rest to be asked. In a dry run nothing is written
 * and the verdicts are returned.
 */
export async function settleProposedJoins(env, userId, { dryRun = false } = {}) {
  const d = db(env);
  const proposed =
    (await d.select(
      // one they decided on the people page and put back with Undo is theirs to decide (personTaps.js)
      `person_merges?user_id=eq.${userId}&status=eq.proposed&decided_at=is.null&select=id,kept_id,merged_id,reason&limit=40`,
    )) || [];
  if (!proposed.length) return { pairs: 0, joined: 0 };
  // a pair they once kept apart, or a join they undid, is never joined again by Gremly
  const apart = new Set(
    ((await d.select(`person_merges?user_id=eq.${userId}&status=in.(declined,undone)&select=kept_id,merged_id`)) || []).flatMap(
      (m) => [`${m.kept_id}:${m.merged_id}`, `${m.merged_id}:${m.kept_id}`],
    ),
  );
  const pairs = [];
  for (const merge of proposed) {
    if (apart.has(`${merge.kept_id}:${merge.merged_id}`)) continue;
    const [kept, merged] = await Promise.all([recordOf(d, userId, merge.kept_id), recordOf(d, userId, merge.merged_id)]);
    if (!kept || !merged) continue;
    pairs.push({ merge, kept, merged });
  }
  if (!pairs.length) return { pairs: 0, joined: 0 };
  const person = await personIdentity(env, userId);
  const { system, user, refs } = joinRequest({ pairs, person });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system,
    user,
    schema: JOIN_SCHEMA,
    maxTokens: 4000,
    ...effortFor(env, 'people_join', { effort: 'medium', thinking: 'medium' }),
  });
  const verdicts = [];
  const plain = [];
  for (const v of output?.pairs || []) {
    const pair = refs.get(v?.ref);
    if (!pair || verdicts.some((x) => x.merge_id === pair.merge.id)) continue;
    const verdict = ['same', 'different', 'unclear'].includes(v.verdict) ? v.verdict : 'unclear';
    verdicts.push({ merge_id: pair.merge.id, verdict, why: trim(v.why, 300) });
    if (verdict === 'same') plain.push({ ...pair, why: trim(v.why, 300) });
  }
  if (dryRun) return { pairs: pairs.length, joined: 0, model, verdicts, dry_run: true };
  let joined = 0;
  const results = [];
  for (const pair of joinOrder(plain)) {
    // a record joined away earlier lives on in the one it joined
    const keptId = await finalId(d, userId, pair.merge.kept_id);
    const mergedId = await finalId(d, userId, pair.merge.merged_id);
    if (!keptId || !mergedId || keptId === mergedId) {
      results.push({ merge_id: pair.merge.id, joined: false, reason: 'already one record' });
      continue;
    }
    if (keptId !== pair.merge.kept_id || mergedId !== pair.merge.merged_id)
      await d.update(`person_merges?id=eq.${pair.merge.id}&user_id=eq.${userId}`, { kept_id: keptId, merged_id: mergedId });
    const r = await mergePeople(d, userId, pair.merge.id);
    if (r.merged) {
      joined += 1;
      // the join is Gremly's understanding, never the person's yes; undoMerge reads moved as before
      const [m] = await d.select(`person_merges?id=eq.${pair.merge.id}&user_id=eq.${userId}&select=moved`);
      await d.update(`person_merges?id=eq.${pair.merge.id}&user_id=eq.${userId}`, {
        moved: { ...(m?.moved || {}), by: 'understood', why: pair.why, version: PEOPLE_JOIN_VERSION },
      });
    }
    results.push({ merge_id: pair.merge.id, ...r });
  }
  return { pairs: pairs.length, joined, model, verdicts, results };
}
