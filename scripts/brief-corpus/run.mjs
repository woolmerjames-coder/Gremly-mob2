/**
 * Runs the brief writer over the corpus and writes a review page.
 *
 *   scripts/brief-corpus/run.sh                 every made-up day, both models
 *   scripts/brief-corpus/run.sh --real          also real/*.json (gitignored)
 *   scripts/brief-corpus/run.sh --only noon-open --models gemini
 *
 * Keys come from .audit-keys.local (see scripts/chat-audit/keys.mjs).
 * Output goes to scripts/brief-corpus/out/<time>/ (gitignored).
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { buildSnapshot } from './build.mjs';
import { checkBrief } from './checks.mjs';
import { renderReview } from './review.mjs';
import { writeBrief, BRIEF_PROMPT_VERSION } from '../../workers/inngest-jobs/brief/writer.js';
import { questionButtons } from '../../workers/inngest-jobs/brief/offer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = {
  gemini: 'google:gemini-3.8-flash',
  openai: 'openai:gpt-6-luna',
};
const models = (flag('--models') || 'gemini,openai').split(',').filter((m) => MODELS[m]);
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
  const { g, offer } = buildSnapshot(s);
  const env = {
    GEMINI_API_KEY: keys.gemini,
    OPENAI_API_KEY: keys.openai,
    CONTEXT_MODEL_BRIEF: MODELS[modelKey],
    CONTEXT_MODEL_BRIEFFALLBACK: modelKey === 'gemini' ? MODELS.openai : MODELS.gemini,
  };
  const started = Date.now();
  try {
    const out = await writeBrief(env, g, offer);
    const choices =
      g.question && !g.ret
        ? (g.question.choices || []).length
          ? g.question.choices
          : out.questionChoices.slice(0, 4)
        : [];
    return {
      model: modelKey,
      modelUsed: out.model,
      ms: Date.now() - started,
      out,
      questionButtons: g.question && !g.ret ? questionButtons(choices) : [],
      checks: checkBrief(g, offer, out),
    };
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
console.log(`Writing ${jobs.length} briefs (${scenarios.length} days × ${models.join(', ')})…`);
const done = await pool(jobs, 4, async ({ s, m }) => {
  const r = await runOne(s, m);
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok).length : 1;
  console.log(`${r.error ? 'ERROR' : fails ? 'FAIL ' : 'ok   '} ${s.id} · ${m}${r.error ? ` · ${r.error.slice(0, 160)}` : ''}`);
  return { id: s.id, ...r };
});

const results = scenarios.map((s) => {
  const { g, offer } = buildSnapshot(s);
  return {
    scenario: s,
    offer,
    snapshot: {
      today: g.today,
      now: g.now,
      part: g.part,
      meetings: g.meetings,
      allDay: g.allDay,
      todosDue: g.todosDue,
      habitsForToday: g.habitsForToday,
      overdue: g.overdue,
      unsorted: g.unsorted,
      candidates: g.candidates,
      free: g.free,
    },
    runs: done.filter((d) => d.id === s.id),
  };
});

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', stamp);
mkdirSync(outDir, { recursive: true });
const meta = { stamp, promptVersion: BRIEF_PROMPT_VERSION, models: models.map((m) => MODELS[m]) };
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ meta, results }, null, 2));
const page = renderReview(meta, results);
writeFileSync(join(outDir, 'page.html'), page);
writeFileSync(
  join(outDir, 'review.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${page}</body></html>`,
);
const failing = done.filter((d) => d.error || d.checks.some((c) => c.level === 'fail' && !c.ok));
console.log(`\n${done.length - failing.length} of ${done.length} briefs pass every rule.`);
console.log(`Review: ${join(outDir, 'review.html')}`);
