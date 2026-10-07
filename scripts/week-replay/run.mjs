/**
 * The week replay: runs the weekly read over made up people with the real
 * model, before any change to its prompt or model is deployed.
 *
 *   scripts/week-replay/run.sh                        every scenario, once
 *   scripts/week-replay/run.sh --repeat 3             each three times
 *   scripts/week-replay/run.sh --only light-five,health-world --show
 *   scripts/week-replay/run.sh --effort low           another effort, to compare
 *   scripts/week-replay/run.sh --model flash          the fallback model on its own
 *   scripts/week-replay/run.sh --judge sol|pro|none   who grades the health scenario
 *   scripts/week-replay/run.sh --input heavy-backlog  print what the model is given, call nothing
 *
 * The checks look at structure, ids, dates and numbers (checks.mjs). The
 * health scenario is also read by a judge model from another family, which
 * says whether Gremly named a condition, a treatment or a medication, and so
 * is the challenge of a person whose week turns on one particular thing,
 * which should not be the length of their list.
 *
 * Keys come from .audit-keys.local (scripts/chat-audit/keys.mjs). Output goes
 * to scripts/week-replay/out/<time>/results.json (gitignored).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { checkRun, wordsOf } from './checks.mjs';
import { JUDGES, JUDGE_CHALLENGE, JUDGE_SYSTEM, callJudge } from './judge.mjs';
import {
  renderRead,
  runWeekRead,
  WEEK_READ_VERSION,
} from '../../workers/inngest-jobs/week/read.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = {
  luna: 'openai:gpt-6-luna',
  flash: 'google:gemini-3.8-flash',
  sonnet: 'anthropic:claude-sonnet-5-5',
};
const model = MODELS[flag('--model') || 'luna'];
if (!model) throw new Error(`no model ${flag('--model')}`);
const effort = flag('--effort') || 'medium';
const repeat = Math.max(1, Number(flag('--repeat')) || 1);
const only = flag('--only');
const judgeKey = flag('--judge') || 'pro';

let scenarios = [...SCENARIOS];
if (only) scenarios = scenarios.filter((s) => only.split(',').includes(s.id));

if (flag('--input')) {
  const s = SCENARIOS.find((x) => x.id === flag('--input'));
  if (!s) throw new Error(`no scenario ${flag('--input')}`);
  console.log(renderRead(s.g).text);
  process.exit(0);
}

// ── The judge, for the health scenario (judge.mjs) ──────────────────────────

async function judgeHealth(s, out) {
  const j = JUDGES[judgeKey];
  if (!j) return [];
  const lines = wordsOf(out.read).map((w) => `${w.where}: ${w.text}`);
  const user = `WHAT GREMLY WAS TOLD\n${out.input}\n\nWHAT GREMLY WROTE\n${lines.join('\n')}`;
  const v = await callJudge(j, JUDGE_SYSTEM, user);
  if (!v) return [{ level: 'fail', name: `The judge (${j.model}) answered`, ok: false, detail: '' }];
  return [
    {
      level: 'fail',
      name: `Names nothing medical (judge ${j.model})`,
      ok: v.names_health === false,
      detail: `${(v.named || []).join('; ')}${v.note ? ` · ${v.note}` : ''}`,
    },
    {
      level: 'fail',
      name: `Health shapes the week (judge ${j.model})`,
      ok: v.shaped_by_health === true,
      detail: v.note || '',
    },
  ];
}

/** For a person whose week turns on one particular thing: is that the challenge, or the list as a whole? */
async function judgeChallenge(s, out) {
  const j = JUDGES[judgeKey];
  if (!j) return [];
  const c = out.read.challenge;
  const user = `WHAT GREMLY WAS TOLD\n${out.input}\n\nTHE CHALLENGE GREMLY WROTE\nHeadline: ${c.headline}\nWhy: ${c.why}`;
  const v = await callJudge(j, JUDGE_CHALLENGE, user);
  if (!v) return [{ level: 'fail', name: `The judge (${j.model}) answered`, ok: false, detail: '' }];
  return [
    {
      level: 'fail',
      name: `The challenge is something particular, not the whole list (judge ${j.model})`,
      ok: v.about_the_whole_list === false,
      detail: `${c.headline}${v.note ? ` · ${v.note}` : ''}`,
    },
  ];
}

// ── The runs ────────────────────────────────────────────────────────────────

async function runOne(s) {
  const [provider] = model.split(':');
  const env = {
    GEMINI_API_KEY: keys.gemini,
    OPENAI_API_KEY: keys.openai,
    ANTHROPIC_API_KEY: keys.anthropic,
    CONTEXT_MODEL_WEEKREAD: model,
    // no other model steps in: each run is judged on its own model
    CONTEXT_MODEL_WEEKREADFALLBACK: model,
  };
  const started = Date.now();
  try {
    const out = await runWeekRead(env, s.g, { effort });
    const ms = Date.now() - started;
    const checks = checkRun(s, out);
    if (s.judge && judgeKey !== 'none') checks.push(...(await judgeHealth(s, out)));
    if (s.specific && judgeKey !== 'none') checks.push(...(await judgeChallenge(s, out)));
    return { provider, ms, out, checks };
  } catch (err) {
    return { provider, ms: Date.now() - started, error: String(err?.message || err) };
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

const jobs = scenarios.flatMap((s) => Array.from({ length: repeat }, () => s));
console.log(
  `Running ${jobs.length} weekly reads (${scenarios.length} people × ${repeat}) on ${model} at ${effort} effort, prompt ${WEEK_READ_VERSION}…`,
);
const done = await pool(jobs, 4, async (s) => {
  const r = await runOne(s);
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok) : [];
  const warns = r.checks ? r.checks.filter((c) => c.level === 'warn' && !c.ok) : [];
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${r.ms}ms${
      r.error
        ? ` · ${r.error.slice(0, 200)}`
        : fails.length
          ? ` · ${fails.map((f) => `${f.name}${f.detail ? ` [${f.detail.slice(0, 160)}]` : ''}`).join('; ')}`
          : ''
    }${warns.length ? ` · warn: ${warns.map((w) => `${w.name}${w.detail ? ` [${w.detail.slice(0, 100)}]` : ''}`).join('; ')}` : ''}`,
  );
  if (args.includes('--show') && r.out) {
    for (const w of wordsOf(r.out.read)) console.log(`      ${w.where}: ${w.text}`);
    const x = r.out.read;
    console.log(
      `      milestones for: ${x.milestones.map((m) => `${m.about.type} "${m.about.title}"`).join('; ') || 'none'}\n      picks ${x.priority_options.filter((p) => p.gremly_pick).length} of ${x.priority_options.length} · hours ${JSON.stringify(x.free_hours_guess && { n: x.free_hours_guess.normal_day, b: x.free_hours_guess.busy_day, w: x.free_hours_guess.weekend_day })} · busy ${x.busy_days.join(', ') || 'none'} · habits ${x.habit_days.map((h) => `${h.habit_id.split('-').pop()}:${h.days.map((d) => d.slice(8)).join('/')}`).join(' ') || 'none'} · milestones ${x.milestones.map((m) => `${m.date} (${m.steps.map((st) => `${st.by.slice(5)} ${st.kind}`).join(', ')})`).join('; ') || 'none'}`,
    );
  }
  return { id: s.id, ...r };
});

// each rule that was broken, with how many of the runs it was looked at in broke it
const tally = new Map();
for (const d of done) {
  for (const c of d.checks || []) {
    if (c.level !== 'fail') continue;
    const t = tally.get(c.name) || { broken: 0, of: 0 };
    t.of += 1;
    if (!c.ok) t.broken += 1;
    tally.set(c.name, t);
  }
}
const broken = [...tally].filter(([, t]) => t.broken);
if (broken.length) {
  console.log('\nBroken rules (runs that broke it, of the runs it was looked at in):');
  for (const [name, t] of broken) console.log(`  ${t.broken} of ${t.of} · ${name}`);
}

const pass = done.filter((d) => !d.error && d.checks.every((c) => c.level !== 'fail' || c.ok)).length;
const ms = done.map((d) => d.ms).sort((a, b) => a - b);
console.log(
  `\n${pass} of ${done.length} pass every rule · ${ms[Math.floor(ms.length / 2)] ?? 0}ms typical · ${ms[ms.length - 1] ?? 0}ms slowest`,
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify(
    {
      meta: { stamp, promptVersion: WEEK_READ_VERSION, model, effort, repeat },
      results: scenarios.map((s) => ({
        id: s.id,
        about: s.about,
        runs: done
          .filter((d) => d.id === s.id)
          .map(({ out, ...r }) => ({
            ...r,
            read: out?.read,
            dropped: out?.dropped,
            figures: out?.figures,
          })),
      })),
    },
    null,
    2,
  ),
);
console.log(`Results: ${join(outDir, 'results.json')}`);
// a run that did not pass says so to whatever started it
if (pass < done.length) process.exitCode = 1;
