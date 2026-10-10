/**
 * The stage 9 gate (Mind Drop rethink): filing at the save no longer has the
 * details' tags, people and date. This files about a hundred recent real drops
 * of the people who have Worlds both ways, with the prompt, model and bar that
 * ship (the assign-worlds call as the Worker makes it), twice each, and lists
 * every drop whose World or Chapter changes between the two.
 *
 *   scripts/filing-replay/gate.sh            (resumable; run until it says done)
 *   scripts/filing-replay/gate.sh --report
 *
 * The drops and each person's Worlds, Chapters and placed items come from
 * out/real/ (gitignored), read from the database with read only queries. Each
 * drop is filed with its own day as today, against the Worlds and Chapters as
 * they are now. "with" sends the item's tags, people and date as the details
 * gave them; "without" sends the drop's words, title and kind only, as the
 * app now does. OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideFiling,
  filingRequest,
  FILING_PROMPT_VERSION,
  FILING_SCHEMA,
} from '../../workers/inngest-jobs/context/filing.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = join(HERE, 'out', 'real');
const OUT = join(HERE, 'out', 'gate.jsonl');
const args = process.argv.slice(2);
const AT_ONCE = 8;
const BUDGET_MS = 150000;
const RUNS = 2;

const { tz, graph: graphs, placed: placedRows } = JSON.parse(readFileSync(join(REAL, 'graph.json'), 'utf8'));
const drops = JSON.parse(readFileSync(join(REAL, 'drops.json'), 'utf8')).map((d, i) => ({ ...d, i }));

const dayIn = (iso, zone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const placedFor = (o) => {
  const worlds = new Map();
  const chapters = new Map();
  for (const p of placedRows.filter((x) => x.o === o)) {
    const m = p.k === 'w' ? worlds : chapters;
    const list = m.get(p.pid) || [];
    if (list.length < 5) list.push(p.title);
    m.set(p.pid, list);
  }
  return { worlds, chapters };
};

function requestFor(d, arm) {
  const g = graphs[d.o];
  const today = dayIn(d.at, tz[d.o] || 'UTC');
  const drop = {
    id: `d${d.i}`,
    entity_type: d.t,
    text: d.text,
    title: d.title,
    ...(arm === 'with'
      ? { date: d.date || null, tags: d.tags || [], people: Array.isArray(d.people) ? d.people : [] }
      : { date: null, tags: [], people: [] }),
  };
  return filingRequest({ drop, graph: { ...g, contexts: [] }, placed: placedFor(d.o), today });
}

const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
};

async function fileOne({ d, arm, run }) {
  const { system, user, refs } = requestFor(d, arm);
  try {
    const { output, model } = await jsonCall(env, {
      primary: modelFor(env, 'filing'),
      fallback: modelFor(env, 'filingFallback'),
      system,
      user,
      schema: FILING_SCHEMA,
      maxTokens: 1500,
      effort: 'low',
      thinking: 'low',
    });
    const f = decideFiling(output, refs);
    return { i: d.i, arm, run, ok: true, model, world: f.world?.name || null, chapter: f.chapter?.title || null, choice: f.choice };
  } catch (err) {
    return { i: d.i, arm, run, ok: false, error: String(err?.message || err).slice(0, 200) };
  }
}

function done() {
  if (!existsSync(OUT)) return new Map();
  const m = new Map();
  for (const l of readFileSync(OUT, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(l);
    if (o.ok) m.set(`${o.i}:${o.arm}:${o.run}`, o);
  }
  return m;
}

if (args.includes('--report')) {
  const got = done();
  const place = (o) => (o ? o.chapter || o.world || 'nowhere' : '?');
  const rows = drops.map((d) => {
    const g = (arm, run) => got.get(`${d.i}:${arm}:${run}`);
    return { d, w: [g('with', 0), g('with', 1)], wo: [g('without', 0), g('without', 1)] };
  });
  const complete = rows.filter((r) => [...r.w, ...r.wo].every(Boolean));
  const same = (a, b) => place(a) === place(b);
  const noiseWith = complete.filter((r) => !same(r.w[0], r.w[1])).length;
  const noiseWithout = complete.filter((r) => !same(r.wo[0], r.wo[1])).length;
  const steadyBoth = complete.filter((r) => same(r.w[0], r.w[1]) && same(r.wo[0], r.wo[1]));
  const moved = steadyBoth.filter((r) => !same(r.w[0], r.wo[0]));
  const anyDiff = complete.filter((r) => !same(r.w[0], r.wo[0]) || !same(r.w[1], r.wo[1]));
  const filed = (arr) => arr.filter((o) => o && (o.world || o.chapter)).length;
  const summary = {
    prompt: FILING_PROMPT_VERSION,
    drops: drops.length,
    complete: complete.length,
    filed_with: filed(complete.flatMap((r) => r.w)),
    filed_without: filed(complete.flatMap((r) => r.wo)),
    calls_per_arm: complete.length * RUNS,
    run_to_run_changes_with: noiseWith,
    run_to_run_changes_without: noiseWithout,
    steady_both_ways: steadyBoth.length,
    moved_when_steady: moved.length,
    any_difference: anyDiff.length,
  };
  console.log(JSON.stringify(summary, null, 1));
  const lines = anyDiff.map((r) => ({
    i: r.d.i,
    o: r.d.o,
    t: r.d.t,
    title: r.d.title,
    with: r.w.map(place),
    without: r.wo.map(place),
    steady: same(r.w[0], r.w[1]) && same(r.wo[0], r.wo[1]),
  }));
  writeFileSync(join(HERE, 'out', 'gate-report.json'), JSON.stringify({ summary, lines }, null, 1));
  console.log(`differences: ${lines.length} (written to out/gate-report.json)`);
  process.exit(0);
}

const have = done();
const jobs = [];
for (let run = 0; run < RUNS; run++)
  for (const d of drops) for (const arm of ['with', 'without']) if (!have.has(`${d.i}:${arm}:${run}`)) jobs.push({ d, arm, run });
console.log(`${FILING_PROMPT_VERSION}: ${jobs.length} calls left`);
const started = Date.now();
let next = 0;
let n = 0;
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (next < jobs.length && Date.now() - started < BUDGET_MS) {
      const job = jobs[next++];
      const r = await fileOne(job);
      appendFileSync(OUT, JSON.stringify(r) + '\n');
      n++;
    }
  }),
);
console.log(`${n} calls this time; ${jobs.length - n} left${jobs.length - n ? '' : ' (done)'}`);
