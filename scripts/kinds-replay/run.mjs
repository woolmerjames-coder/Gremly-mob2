/**
 * The kinds replay (workers/inngest-jobs/context/kinds.js): a made up person's
 * facts, sorted by the model and prompt that ship, several times over.
 *
 *   scripts/kinds-replay/run.sh [--repeat n]
 *
 * It passes when every fact gets a kind from the list each time, the same fact
 * gets the same kind at least 9 times in 10 on average, the facts whose kind
 * is plain get it, and the facts that plainly do or do not concern health are
 * flagged that way, and the facts whose timing is plain get it (stage 4d),
 * whatever date the ledger holds. Every name and fact is made up. OPENAI_API_KEY and
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
// timing: when it is true, where it is plain (stage 4d), null where it is not;
// then the date the ledger holds, when it holds one.
const FACTS = [
  ['Alex has a dentist appointment on Thursday.', 'event', true, 'day', '2026-10-15'],
  ["Alex is flying to Porto on 1 November for Ana's birthday.", 'event', false, null],
  ["Alex had dinner with Jo's parents and it went better than Alex feared.", 'event', false, null],
  ['Alex has a work trip to Berlin next month.', 'event', false, null],
  ['Alex has to hand in the billing proposal by Friday.', 'event', false, 'day'],
  ['Alex ran a half marathon in two hours and five minutes on Sunday.', 'event', null, 'day'],
  ['Alex goes to the climbing gym every Tuesday evening.', 'routine', null, 'standing'],
  ['Alex walks the dog before work each morning.', 'routine', false, 'standing', '2026-09-14'],
  ['Alex calls their mum every Sunday.', 'routine', false, 'standing'],
  ['Alex wants to run a half marathon in under two hours by spring.', 'goal', null, null],
  ['Alex is saving for a deposit on a flat.', 'goal', false, null],
  ['Alex is working towards a promotion to lead engineer.', 'goal', false, null],
  ['Alex prefers to work from cafes in the morning.', 'preference', false, 'standing'],
  ['Alex does not enjoy big parties.', 'preference', false, 'standing'],
  ['Alex wants a quiet birthday this year.', null, false, null],
  ["Jo is Alex's partner.", 'relationship', false, 'standing', '2026-08-02'],
  ["Priya is Alex's closest friend at work.", 'relationship', false, 'standing'],
  ['Alex and Sam have not spoken since their argument in August.', 'relationship', false, null],
  ["Ana is Alex's younger sister.", 'relationship', false, 'standing'],
  ["Alex's team is in the middle of a reorganisation.", 'situation', false, null],
  ['Alex is between flats and staying with Jo for now.', 'situation', false, null],
  ['The billing service Alex works on has had no owner since Sam left.', 'situation', false, null],
  ['Alex is recovering from a sprained ankle.', 'situation', true, null],
  ['Alex sees themself as someone who keeps their promises.', 'self', false, 'standing'],
  ['Alex is vegetarian.', null, false, 'standing', '2026-09-30'],
  ['Alex grew up in Leeds.', 'self', false, 'standing'],
  ['Alex started seeing a counsellor about panic on trains.', null, true, null],
  ['Alex takes medication for migraines each morning.', 'routine', true, null],
  ["Alex's dad is in hospital after a fall.", null, true, null],
  [
    'Alex finished the garden bed and planted bulbs on Saturday.',
    'event',
    false,
    'day',
    '2026-10-10',
  ],
  // days that come round every year, one as the ledger dated it the day it was said
  ["Ana's birthday is on 1 November.", null, false, 'yearly', '2025-11-01'],
  ["Alex and Jo's anniversary is on 14 February.", null, false, 'yearly', '2026-02-14'],
  // the ledger dated it the day it was said: a wrong day never comes round again
  ["Alex and Jo's wedding anniversary is on 9 June.", null, false, 'day', '2026-09-20'],
  ["Alex's mum turns 60 on 3 March.", null, false, null, '2027-03-03'],
].map(([statement, kind, health, timing, about_date], i) => ({
  id: `fact-${i + 1}`,
  statement,
  kind,
  health,
  timing,
  about_date: about_date || null,
}));

async function runOnce() {
  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  };
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
  const healthRight =
    f.health == null ? null : answers.filter((a) => a && a.health === f.health).length;
  const timings = answers.map((a) => a?.timing || null);
  const timingRight = f.timing == null ? null : timings.filter((t) => t === f.timing).length;
  return {
    statement: f.statement,
    expected: f.kind,
    modal,
    agreement: top / repeat,
    missing: kinds.filter((k) => !k).length,
    kindRight: f.kind ? kinds.filter((k) => k === f.kind).length : null,
    healthExpected: f.health,
    healthRight,
    timingExpected: f.timing,
    timingRight,
    timings,
    kinds,
  };
});

const meanAgreement = rows.reduce((s, r) => s + r.agreement, 0) / rows.length;
const plain = rows.filter((r) => r.expected);
const plainRight = plain.reduce((s, r) => s + r.kindRight, 0) / (plain.length * repeat);
const healthRows = rows.filter((r) => r.healthExpected != null);
const healthRight =
  healthRows.reduce((s, r) => s + r.healthRight, 0) / (healthRows.length * repeat);
const timingRows = rows.filter((r) => r.timingExpected != null);
const timingRight =
  timingRows.reduce((s, r) => s + r.timingRight, 0) / (timingRows.length * repeat);
const missing = rows.reduce((s, r) => s + r.missing, 0);
const errors = runs.filter((r) => r.error);

for (const r of rows) {
  const mark =
    r.agreement < 0.9 ||
    (r.expected && r.kindRight < repeat) ||
    (r.timingExpected && r.timingRight < repeat)
      ? '~'
      : ' ';
  console.log(
    `${mark} ${r.kinds.map((k) => (k || '-').padEnd(12)).join('')} ${r.timings.map((t) => (t || '-').padEnd(9)).join('')} ${r.expected ? `(${r.expected}) ` : ''}${r.timingExpected ? `(${r.timingExpected}) ` : ''}${r.statement}`,
  );
}
const checks = [
  {
    name: 'every fact gets a kind from the list on every run',
    ok: missing === 0 && !errors.length,
    detail: `${missing} missing, ${errors.length} errors`,
  },
  {
    name: 'the same fact gets the same kind 9 times in 10 on average',
    ok: meanAgreement >= 0.9,
    detail: meanAgreement.toFixed(3),
  },
  {
    name: 'facts whose kind is plain get it 9 times in 10',
    ok: plainRight >= 0.9,
    detail: plainRight.toFixed(3),
  },
  {
    name: 'plain health flags are right 9 times in 10',
    ok: healthRight >= 0.9,
    detail: healthRight.toFixed(3),
  },
  {
    name: 'plain timings are right 9 times in 10',
    ok: timingRight >= 0.9,
    detail: timingRight.toFixed(3),
  },
];
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.detail}`);
for (const e of errors) console.log(`error: ${e.error}`);
console.log(`\n${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`);

const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'results.json'),
  JSON.stringify(
    {
      version: KINDS_PROMPT_VERSION,
      checks,
      rows,
      runs: runs.map((r) => ({ model: r.model, ms: r.ms, error: r.error })),
    },
    null,
    2,
  ),
);
console.log(`Results: ${join(dir, 'results.json')}`);
