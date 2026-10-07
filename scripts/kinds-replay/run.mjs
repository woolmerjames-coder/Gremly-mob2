/**
 * The kinds replay (workers/inngest-jobs/context/kinds.js): a made up person's
 * facts, sorted by the model and prompt that ship, several times over.
 *
 *   scripts/kinds-replay/run.sh [--repeat n]
 *
 * It passes when every fact gets a kind from the list each time, the same fact
 * gets the same kind at least 9 times in 10 on average, the facts whose kind
 * is plain get it, and the facts that plainly do or do not concern health are
 * flagged that way. Every name and fact is made up. OPENAI_API_KEY and
 * GEMINI_TEST_API_KEY come from the environment.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeKinds, KINDS_PROMPT_VERSION } from '../../workers/inngest-jobs/context/kinds.js';
import { validKind } from '../../workers/shared/factKinds.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 5));

// kind: the plain answer, or null where more than one is fair.
// health: true or false where it is plain, null where it is not.
const FACTS = [
  ['Alex has a dentist appointment on Thursday.', 'event', true],
  ['Alex is flying to Porto on 1 November for Ana\'s birthday.', 'event', false],
  ["Alex had dinner with Jo's parents and it went better than Alex feared.", 'event', false],
  ['Alex has a work trip to Berlin next month.', 'event', false],
  ['Alex has to hand in the billing proposal by Friday.', 'event', false],
  ['Alex ran a half marathon in two hours and five minutes on Sunday.', 'event', null],
  ['Alex goes to the climbing gym every Tuesday evening.', 'routine', null],
  ['Alex walks the dog before work each morning.', 'routine', false],
  ['Alex calls their mum every Sunday.', 'routine', false],
  ['Alex wants to run a half marathon in under two hours by spring.', 'goal', null],
  ['Alex is saving for a deposit on a flat.', 'goal', false],
  ['Alex is working towards a promotion to lead engineer.', 'goal', false],
  ['Alex prefers to work from cafes in the morning.', 'preference', false],
  ['Alex does not enjoy big parties.', 'preference', false],
  ['Alex wants a quiet birthday this year.', null, false],
  ["Jo is Alex's partner.", 'relationship', false],
  ["Priya is Alex's closest friend at work.", 'relationship', false],
  ['Alex and Sam have not spoken since their argument in August.', 'relationship', false],
  ["Ana is Alex's younger sister.", 'relationship', false],
  ["Alex's team is in the middle of a reorganisation.", 'situation', false],
  ['Alex is between flats and staying with Jo for now.', 'situation', false],
  ['The billing service Alex works on has had no owner since Sam left.', 'situation', false],
  ['Alex is recovering from a sprained ankle.', 'situation', true],
  ['Alex sees themself as someone who keeps their promises.', 'self', false],
  ['Alex is vegetarian.', null, false],
  ['Alex grew up in Leeds.', 'self', false],
  ['Alex started seeing a counsellor about panic on trains.', null, true],
  ['Alex takes medication for migraines each morning.', 'routine', true],
  ["Alex's dad is in hospital after a fall.", null, true],
  ['Alex finished the garden bed and planted bulbs on Saturday.', 'event', false],
].map(([statement, kind, health], i) => ({ id: `fact-${i + 1}`, statement, kind, health }));

async function runOnce() {
  const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY };
  const started = Date.now();
  try {
    const { judged, model } = await judgeKinds(env, FACTS);
    return { model, ms: Date.now() - started, judged: new Map(judged.map((j) => [j.id, j])) };
  } catch (err) {
    return { ms: Date.now() - started, error: String(err?.message || err), judged: new Map() };
  }
}

console.log(`${KINDS_PROMPT_VERSION}: ${FACTS.length} facts, ${repeat} runs`);
const runs = await Promise.all(Array.from({ length: repeat }, runOnce));

const rows = FACTS.map((f) => {
  const answers = runs.map((r) => r.judged.get(f.id));
  const kinds = answers.map((a) => (a ? validKind(a.kind) : null));
  const counts = new Map();
  for (const k of kinds) if (k) counts.set(k, (counts.get(k) || 0) + 1);
  const [modal, top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const healthRight = f.health == null ? null : answers.filter((a) => a && a.health === f.health).length;
  return {
    statement: f.statement,
    expected: f.kind,
    modal,
    agreement: top / repeat,
    missing: kinds.filter((k) => !k).length,
    kindRight: f.kind ? kinds.filter((k) => k === f.kind).length : null,
    healthExpected: f.health,
    healthRight,
    kinds,
  };
});

const meanAgreement = rows.reduce((s, r) => s + r.agreement, 0) / rows.length;
const plain = rows.filter((r) => r.expected);
const plainRight = plain.reduce((s, r) => s + r.kindRight, 0) / (plain.length * repeat);
const healthRows = rows.filter((r) => r.healthExpected != null);
const healthRight = healthRows.reduce((s, r) => s + r.healthRight, 0) / (healthRows.length * repeat);
const missing = rows.reduce((s, r) => s + r.missing, 0);
const errors = runs.filter((r) => r.error);

for (const r of rows) {
  const mark = r.agreement < 0.9 || (r.expected && r.kindRight < repeat) ? '~' : ' ';
  console.log(
    `${mark} ${r.kinds.map((k) => (k || '-').padEnd(12)).join('')} ${r.expected ? `(${r.expected}) ` : ''}${r.statement}`,
  );
}
const checks = [
  { name: 'every fact gets a kind from the list on every run', ok: missing === 0 && !errors.length, detail: `${missing} missing, ${errors.length} errors` },
  { name: 'the same fact gets the same kind 9 times in 10 on average', ok: meanAgreement >= 0.9, detail: meanAgreement.toFixed(3) },
  { name: 'facts whose kind is plain get it 9 times in 10', ok: plainRight >= 0.9, detail: plainRight.toFixed(3) },
  { name: 'plain health flags are right 9 times in 10', ok: healthRight >= 0.9, detail: healthRight.toFixed(3) },
];
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.detail}`);
for (const e of errors) console.log(`error: ${e.error}`);
console.log(`\n${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`);

const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify({ version: KINDS_PROMPT_VERSION, checks, rows, runs: runs.map((r) => ({ model: r.model, ms: r.ms, error: r.error })) }, null, 2));
console.log(`Results: ${join(dir, 'results.json')}`);
