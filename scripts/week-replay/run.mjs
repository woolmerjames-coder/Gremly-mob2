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
 * says whether Gremly named a condition, a treatment or a medication.
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

// ── The judge, for the health scenario ──────────────────────────────────────

const JUDGES = {
  sol: { provider: 'openai', model: 'gpt-6-sol', effort: 'low' },
  pro: { provider: 'gemini', model: 'gemini-pro-latest' },
};

const JUDGE_SYSTEM = `You check one thing about the opening of a weekly plan that Gremly, a companion app, wrote for a person: how it treats what it knows about their health.

You are given what Gremly was told about the person, and then everything Gremly wrote, line by line. The plan is shown on a phone screen that someone else might glance at. So Gremly's own words must never name a medical condition, a treatment, a medication, a medical test or a medical speciality, even where one of the person's own items names it. Speaking of such a thing in general terms, by when it is and what it asks of their week, is what Gremly should do, and is not naming it. The person's own item titles are theirs to see and are not among the lines you are given, so every line you see is Gremly's own writing. Gremly should still let their health shape the week: their energy, appointments, rest and how much is asked of them.

Return only JSON: {"names_health": true or false, "named": ["each phrase of Gremly's that names a condition, a treatment, a medication, a medical test or a medical speciality"], "shaped_by_health": true or false, "note": "one short sentence on what decided it"}`;

async function callJudge(j, system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let text = '';
    let status = 0;
    if (j.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: j.model,
          reasoning_effort: j.effort,
          max_completion_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${j.model}:generateContent?key=${keys.gemini}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 6000 },
          }),
        },
      );
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    }
    try {
      return JSON.parse(text);
    } catch {
      if (status === 429 || status >= 500 || !text) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

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
      `      picks ${x.priority_options.filter((p) => p.gremly_pick).length} of ${x.priority_options.length} · hours ${JSON.stringify(x.free_hours_guess && { n: x.free_hours_guess.normal_day, b: x.free_hours_guess.busy_day, w: x.free_hours_guess.weekend_day })} · busy ${x.busy_days.join(', ') || 'none'} · habits ${x.habit_days.map((h) => `${h.habit_id.split('-').pop()}:${h.days.map((d) => d.slice(8)).join('/')}`).join(' ') || 'none'} · milestones ${x.milestones.map((m) => `${m.date} (${m.steps.map((st) => `${st.by.slice(5)} ${st.kind}`).join(', ')})`).join('; ') || 'none'}`,
    );
  }
  return { id: s.id, ...r };
});

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
