/**
 * Runs the day turn over the replay suite with real models, to choose the
 * model and to check every change before the worker is deployed.
 *
 *   scripts/day-replay/run.sh                       every scenario, every model
 *   scripts/day-replay/run.sh --only airport-and-call --models openai,claude
 *   scripts/day-replay/run.sh --real                also real/*.json (gitignored)
 *
 * Keys come from .audit-keys.local (scripts/chat-audit/keys.mjs). Output goes
 * to scripts/day-replay/out/<time>/results.json (gitignored).
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { checkTurn } from './checks.mjs';
import { bodyFor } from './body.mjs';
import {
  readTurnRequest,
  runDayTurn,
  DAY_TURN_PROMPT_VERSION,
} from '../../workers/inngest-jobs/brief/dayTurn.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = {
  openai: 'openai:gpt-6-luna',
  claude: 'anthropic:claude-sonnet-5-5',
  gemini: 'google:gemini-3.8-flash',
};
const models = (flag('--models') || 'openai,claude,gemini').split(',').filter((m) => MODELS[m]);
const only = flag('--only');

let scenarios = [...SCENARIOS];
if (args.includes('--real')) {
  const dir = join(HERE, 'real');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const list = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const s of Array.isArray(list) ? list : [list]) scenarios.push({ ...s, real: true });
    }
  }
}
if (only) scenarios = scenarios.filter((s) => only.split(',').includes(s.id));

async function runOne(s, modelKey) {
  const env = {
    GEMINI_API_KEY: keys.gemini,
    OPENAI_API_KEY: keys.openai,
    ANTHROPIC_API_KEY: keys.anthropic,
    CONTEXT_MODEL_DAYTURN: MODELS[modelKey],
    // no fallback to another model: each run is judged on its own model
    CONTEXT_MODEL_DAYTURNFALLBACK: MODELS[modelKey],
  };
  const started = Date.now();
  try {
    const req = readTurnRequest(bodyFor(s));
    // when their day ends; --old-clock leaves it out, as before 5 October
    if (!args.includes('--old-clock')) req.dayEndHour = s.dayEnd ?? 3;
    const out = await runDayTurn(env, req, { first_name: 'Alex', pronouns: null, identity: {} });
    return { model: modelKey, modelUsed: out.model, ms: Date.now() - started, out, checks: checkTurn(s, out) };
  } catch (err) {
    return { model: modelKey, ms: Date.now() - started, error: String(err?.message || err) };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const jobs = scenarios.flatMap((s) => models.map((m) => ({ s, m })));
console.log(`Running ${jobs.length} day turns (${scenarios.length} messages × ${models.join(', ')})…`);
const done = await pool(jobs, 4, async ({ s, m }) => {
  const r = await runOne(s, m);
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok) : [];
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${m} · ${r.ms}ms${
      r.error ? ` · ${r.error.slice(0, 160)}` : fails.length ? ` · ${fails.map((f) => f.name).join('; ')}` : ''
    }`,
  );
  return { id: s.id, ...r };
});

console.log('\nBy model (passes every rule · median time):');
for (const m of models) {
  const runs = done.filter((d) => d.model === m);
  const pass = runs.filter((d) => !d.error && d.checks.every((c) => c.level !== 'fail' || c.ok)).length;
  const ms = runs.map((d) => d.ms).sort((a, b) => a - b);
  console.log(`  ${m.padEnd(8)} ${pass} of ${runs.length} · ${ms[Math.floor(ms.length / 2)] ?? 0}ms`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify(
    {
      meta: { stamp, promptVersion: DAY_TURN_PROMPT_VERSION, models: models.map((m) => MODELS[m]) },
      results: scenarios.map((s) => ({
        scenario: s,
        runs: done.filter((d) => d.id === s.id).map(({ out, ...r }) => ({ ...r, out: out && { ...out, input: undefined } })),
      })),
    },
    null,
    2,
  ),
);
console.log(`Results: ${join(outDir, 'results.json')}`);
