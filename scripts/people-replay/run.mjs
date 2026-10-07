/**
 * The people replay (workers/inngest-jobs/context/people.js and the reader's
 * people judgment): one made up person's records, read one at a time by the
 * model and prompt that ship, with the people records built up between reads
 * by the same code that writes them. Checked by ids, and by who someone is
 * never holding the person's name or a word standing for them.
 *
 *   scripts/people-replay/run.sh [--repeat n]
 *
 * The records hold a Sam at lunch, a Sam H, "my brother", "my brother Sam", a
 * Sam at work, a nickname and the full name, a sister whose surname changes on
 * marriage, her husband, and a misspelt name. It passes when the two Sams are
 * never one record, the brother is Sam only once the person has said so, who
 * someone is comes only from a record that states it and never refers to the
 * person, and nothing is ever merged. Every name and record is made up.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readerRequest,
  readerToday,
  READER_SCHEMA,
  READER_PROMPT_VERSION,
} from '../../workers/inngest-jobs/context/reader.js';
import { planPeople, PEOPLE_PROMPT_VERSION } from '../../workers/inngest-jobs/context/people.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const TZ = 'America/Los_Angeles';
const PERSON = { first_name: 'Alex', pronouns: null, identity: {} };

const journal = (at, words) => ({ table: 'notes', id: `n-${at}`, at, text: `Wrote a journal entry. ${words}` });
const said = (at, words) => ({ table: 'scope_chat_messages', id: `m-${at}`, at, text: `Said in chat: "${words}"` });

// key: how the checks name a record. states: who someone is is stated in it.
const RECORDS = [
  { key: 'lunch-sam', states: false, r: journal('2026-09-20T20:00:00Z', 'Lunch with Sam today. He thinks the agency is going to lose the Brightwater account.') },
  { key: 'sam-h', states: false, r: said('2026-09-21T17:00:00Z', 'Sam H sent the signed contract back this afternoon, finally.') },
  { key: 'brother', states: true, r: journal('2026-09-22T05:00:00Z', 'Called my brother last night. He is thinking about moving to Leeds for the new job.') },
  { key: 'brother-sam', states: true, r: journal('2026-09-25T04:00:00Z', 'My brother Sam is definitely moving to Leeds next month. I am helping him pack on Saturday.') },
  { key: 'work-sam', states: true, r: said('2026-09-26T16:00:00Z', 'Sam at work says the reorg is happening next week, which is a lot.') },
  { key: 'lizzie', states: false, r: journal('2026-09-27T05:00:00Z', 'Lizzie came round for dinner and stayed far too late. So good to see her.') },
  { key: 'elizabeth', states: false, r: said('2026-09-29T18:00:00Z', 'Going to the theatre with Elizabeth on Friday, can you remind me to book the tickets?') },
  { key: 'sister', states: true, r: journal('2026-10-01T04:00:00Z', 'My sister Ana Silva is getting married in June!') },
  { key: 'ana-costa', states: false, r: journal('2026-10-04T04:00:00Z', 'Ana Costa sent out the wedding invitations today.') },
  { key: 'sister-husband', states: true, r: journal('2026-10-05T05:00:00Z', 'My sister and her husband Tom are staying with us this weekend to plan the wedding.') },
  { key: 'priya', states: true, r: said('2026-10-05T17:00:00Z', 'Priya from yoga lent me a mat, I need to give it back on Thursday.') },
  { key: 'pryia', states: false, r: said('2026-10-07T17:00:00Z', 'Pryia says the Thursday class is moving to six.') },
];

let ids = 0;

/** One run: every record read in turn, the people store built up as code writes it. */
async function runOnce() {
  const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY };
  const store = { people: new Map(), ties: [], merges: [], facts: new Map() };
  const timeline = [];
  const started = Date.now();
  try {
    for (const rec of RECORDS) {
      const at = new Date(Date.parse(rec.r.at) + 3600e3);
      const today = readerToday(TZ, at, 3);
      const known = [...store.people.values()].map((p) => ({ ...p, names: [...p.names] }));
      const openFacts = [...store.facts.values()].map((f) => ({ id: f.id, statement: f.statement, state: 'current', about_date: null }));
      const { system, user, recRef, personRef } = readerRequest({ today, person: PERSON, chunk: [rec.r], openFacts, people: known, tz: TZ, dayEndHour: 3 });
      const { output } = await jsonCall(env, {
        primary: modelFor(env, 'reader'),
        fallback: modelFor(env, 'readerFallback'),
        system,
        user,
        schema: READER_SCHEMA,
        maxTokens: 8000,
        effort: 'low',
        thinking: 'low',
      });
      const facts = (output.new_facts || [])
        .filter((f) => recRef.has(f.source_ref))
        .map((f) => {
          const id = `fact-${++ids}`;
          store.facts.set(id, { id, statement: f.statement, record: rec.key });
          return { factId: id, people: f.people || [] };
        });
      const plan = planPeople({ known: personRef, facts, same: output.same_people, userId: 'alex', runId: rec.key, newId: () => `person-${++ids}` });
      // as writePeople would leave the database
      for (const c of plan.creates) store.people.set(c.id, { ...c, names: [], created_at: rec.r.at });
      for (const [id, patch] of plan.updates) {
        const p = store.people.get(id);
        if (!p) continue;
        if (patch.name && p.name_by === 'gremly') p.name = patch.name;
        if (patch.relationship && p.relationship_by === 'gremly') Object.assign(p, { relationship: patch.relationship, relationship_fact_id: patch.relationship_fact_id });
      }
      for (const n of plan.names) {
        const p = store.people.get(n.person_id);
        if (p && !p.names.includes(n.name)) p.names.push(n.name);
      }
      store.ties.push(...plan.ties);
      store.merges.push(...plan.merges.map((m) => ({ ...m, at: rec.key })));
      timeline.push({
        after: rec.key,
        people: [...store.people.values()].map((p) => ({ id: p.id, name: p.name, names: [...p.names], relationship: p.relationship })),
      });
    }
  } catch (err) {
    return { ms: Date.now() - started, error: String(err?.message || err), store, timeline };
  }
  return { ms: Date.now() - started, store, timeline };
}

/** The people a record's facts are tied to. */
const peopleOf = (store, key) => {
  const factIds = new Set([...store.facts.values()].filter((f) => f.record === key).map((f) => f.id));
  return new Set(store.ties.filter((t) => factIds.has(t.fact_id)).map((t) => t.person_id));
};
const recordOfFact = (store, factId) => store.facts.get(factId)?.record;
const lower = (s) => String(s || '').toLowerCase();

function check(run) {
  const { store, timeline } = run;
  if (run.error) return [{ name: 'the run finished', ok: false, detail: run.error }];
  const brotherSam = peopleOf(store, 'brother-sam');
  const workSam = peopleOf(store, 'work-sam');
  const both = [...brotherSam].filter((id) => workSam.has(id));
  const afterBrother = timeline.find((t) => t.after === 'brother')?.people || [];
  const tooSoon = afterBrother.filter((p) => /brother/i.test(p.relationship || '') && p.names.some((n) => lower(n).startsWith('sam')));
  const afterBrotherSam = timeline.find((t) => t.after === 'brother-sam')?.people || [];
  const brotherNamed = afterBrotherSam.some((p) => /brother/i.test(p.relationship || '') && p.names.some((n) => lower(n).startsWith('sam')));
  const statedIn = new Set(RECORDS.filter((r) => r.states).map((r) => r.key));
  const unstated = [...store.people.values()].filter((p) => p.relationship && !statedIn.has(recordOfFact(store, p.relationship_fact_id)));
  const tiedSomewhere = RECORDS.filter((r) => peopleOf(store, r.key).size > 0).length;
  // the person's name, or a word standing for the person, in who someone is to them
  const toPerson = new Set([lower(PERSON.first_name), 'your', 'my']);
  const ownName = [...store.people.values()].filter((p) => lower(p.relationship).split(/[^a-z]+/).some((w) => toPerson.has(w)));
  return [
    { name: 'the brother Sam and the Sam at work are never one record', ok: brotherSam.size > 0 && workSam.size > 0 && both.length === 0, detail: `${brotherSam.size} / ${workSam.size} people, ${both.length} shared` },
    { name: 'the brother is Sam only once the person has said so', ok: tooSoon.length === 0 && brotherNamed, detail: `${tooSoon.length} too soon, named after: ${brotherNamed}` },
    { name: 'who someone is comes only from a record that states it', ok: unstated.length === 0, detail: unstated.map((p) => `${p.name || '?'} as ${p.relationship} from ${recordOfFact(store, p.relationship_fact_id)}`).join('; ') || 'all stated' },
    { name: 'who someone is never refers to the person', ok: ownName.length === 0, detail: ownName.map((p) => p.relationship).join('; ') || 'none' },
    { name: 'nothing is merged, only proposed', ok: store.merges.every((m) => m.status === 'proposed'), detail: `${store.merges.length} proposed` },
    { name: 'most records tie their facts to someone', ok: tiedSomewhere >= RECORDS.length - 2, detail: `${tiedSomewhere} of ${RECORDS.length}` },
  ];
}

console.log(`${READER_PROMPT_VERSION}, ${PEOPLE_PROMPT_VERSION}: ${RECORDS.length} records, ${repeat} runs`);
const runs = await Promise.all(Array.from({ length: repeat }, runOnce));
let passed = 0;
runs.forEach((run, i) => {
  const checks = check(run);
  const ok = checks.every((c) => c.ok);
  if (ok) passed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  run ${i + 1} · ${run.ms}ms`);
  for (const c of checks) console.log(`      ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  for (const p of run.store.people.values())
    console.log(`      person | ${p.name || '(no name)'}${p.names.length > 1 ? ` (also ${p.names.filter((n) => n !== p.name).join(', ')})` : ''}${p.relationship ? ` | ${p.relationship}` : ''}`);
  for (const m of run.store.merges)
    console.log(`      proposed | ${run.store.people.get(m.kept_id)?.name || '?'} and ${run.store.people.get(m.merged_id)?.name || '?'}: ${m.reason}`);
});
console.log(`\n${passed} of ${runs.length} runs pass every check`);
const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'results.json'),
  JSON.stringify(
    runs.map((r) => ({ ...r, checks: check(r), store: { people: [...r.store.people.values()], ties: r.store.ties, merges: r.store.merges, facts: [...r.store.facts.values()] } })),
    null,
    2,
  ),
);
console.log(`Results: ${join(dir, 'results.json')}`);
