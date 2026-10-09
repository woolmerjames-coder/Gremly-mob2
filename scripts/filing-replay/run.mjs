/**
 * The filing replay (workers/inngest-jobs/context/filing.js, data fabric
 * stage 4a): a made up person's sixty drops (person.mjs), filed by the prompt
 * and model that ship, several times over, and scored against the gold set
 * two blind labellers and an adjudicator made (data/gold.json).
 *
 *   scripts/filing-replay/run.sh [--repeat n]
 *
 * The bar James set on 7 Oct: Chapter filings right 95 times in 100 and World
 * filings 85 in 100. A filing into a Chapter is right when it is the gold
 * Chapter. A filing into a World is right when it is the gold World or one
 * the gold set calls equally fair; a drop gold files nowhere is wrong in any
 * World. A drop filed less far than gold (the World where gold has a
 * Chapter, or nowhere) is a miss, not a wrong filing.
 *
 * It also sweeps the confidence cuts over the same answers and says which
 * cuts meet the bar with the most right filings less wrong ones, the higher
 * cut winning a tie: FILING_CUT is set from that. OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the
 * environment; CONTEXT_MODEL_FILING=provider:model tries another model.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideFiling,
  filingRequest,
  FILING_CUT,
  FILING_PROMPT_VERSION,
  FILING_SCHEMA,
} from '../../workers/inngest-jobs/context/filing.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { CHAPTERS, CONTEXTS, DROPS, PLACED, TODAY, WORLDS } from './person.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const AT_ONCE = 6;
const BAR = { chapter: 0.95, world: 0.85 };

const gold = new Map(
  JSON.parse(readFileSync(join(HERE, 'data', 'gold.json'), 'utf8')).labels.map((g) => [g.id, g]),
);

// usage rows land on a replay address, one bucket per call
const REPLAY_SUPABASE_URL = 'https://filing-replay.invalid';
const bucket = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(REPLAY_SUPABASE_URL)) {
    try {
      const body = JSON.parse(init.body);
      bucket.getStore()?.push(...(Array.isArray(body) ? body : [body]));
    } catch {
      // nothing to keep
    }
    return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
};
installAiUsageLogging();

const env = {
  SUPABASE_URL: REPLAY_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_'))),
};

// the life context is shown as live requests show theirs
const graph = { worlds: WORLDS, chapters: CHAPTERS, contexts: CONTEXTS };
const placed = { worlds: new Map(PLACED.worlds), chapters: new Map(PLACED.chapters) };

async function fileOne(drop, r) {
  const { system, user, refs } = filingRequest({ drop, graph, placed, today: TODAY });
  const usage = [];
  const started = Date.now();
  try {
    const { output, model } = await bucket.run(usage, () =>
      aiContext.run({ env, worker: 'replay', job: 'filing-replay', userId: 'replay', runId: `filing-${drop.id}-${r}` }, () =>
        jsonCall(env, {
          primary: modelFor(env, 'filing'),
          fallback: modelFor(env, 'filingFallback'),
          system,
          user,
          schema: FILING_SCHEMA,
          maxTokens: 1500,
          effort: 'low',
          thinking: 'low',
        }),
      ),
    );
    await new Promise((res) => setTimeout(res, 300));
    return { id: drop.id, run: r, output, refs, model, ms: Date.now() - started, cents: usage.reduce((s, u) => s + (Number(u?.cost_usd) || 0), 0) * 100 };
  } catch (err) {
    return { id: drop.id, run: r, error: String(err?.message || err).slice(0, 300), refs, ms: Date.now() - started, cents: 0 };
  }
}

async function inTurn(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

console.log(`${FILING_PROMPT_VERSION}: ${DROPS.length} drops, ${repeat} runs, cut chapter ${FILING_CUT.chapter} world ${FILING_CUT.world}`);
const jobs = [];
for (let r = 0; r < repeat; r++) for (const drop of DROPS) jobs.push({ drop, r });
const answers = await inTurn(jobs, ({ drop, r }) => fileOne(drop, r));

/** Score every answer at one pair of cuts. */
function score(cut) {
  const s = { chapterRight: 0, chapterWrong: 0, worldRight: 0, worldWrong: 0, missedChapter: 0, wrongs: [] };
  for (const a of answers) {
    if (a.error) continue;
    const g = gold.get(a.id);
    const f = decideFiling(a.output, a.refs, { cut });
    if (f.chapter) {
      if (f.chapter.title === g.chapter) s.chapterRight++;
      else {
        s.chapterWrong++;
        s.wrongs.push({ id: a.id, run: a.run, chapter: f.chapter.title, gold: g.chapter });
      }
    } else if (g.chapter) s.missedChapter++;
    if (f.world) {
      const fair = [g.world, ...(g.also_fair || [])].filter(Boolean);
      if (fair.includes(f.world.name)) s.worldRight++;
      else {
        s.worldWrong++;
        s.wrongs.push({ id: a.id, run: a.run, world: f.world.name, gold: g.world });
      }
    }
  }
  const rate = (r, w) => (r + w ? r / (r + w) : 1);
  return { ...s, chapterRate: rate(s.chapterRight, s.chapterWrong), worldRate: rate(s.worldRight, s.worldWrong) };
}

const shipped = score(FILING_CUT);
const sweep = [];
for (let c = 50; c <= 95; c += 5)
  for (let w = 30; w <= 90; w += 5) {
    const cut = { chapter: c / 100, world: w / 100 };
    const s = score(cut);
    const wrong = s.chapterWrong + s.worldWrong;
    sweep.push({ cut, ...s, meets: s.chapterRate >= BAR.chapter && s.worldRate >= BAR.world, filedRight: s.chapterRight + s.worldRight, net: s.chapterRight + s.worldRight - wrong });
  }
// Among the cuts that meet the bar: the most right filings less wrong ones,
// since blank is better than wrong; then the higher cut, the safer of equals
const meeting = sweep
  .filter((x) => x.meets)
  .sort((a, b) => b.net - a.net || b.cut.chapter - a.cut.chapter || b.cut.world - a.cut.world);
const best = meeting[0] || null;

// each drop, run by run, for a person to read
const byDrop = DROPS.map((d) => {
  const g = gold.get(d.id);
  const runs = answers
    .filter((a) => a.id === d.id)
    .sort((a, b) => a.run - b.run)
    .map((a) => {
      if (a.error) return { error: a.error };
      const f = decideFiling(a.output, a.refs);
      const ref = (x) => (x ? a.refs.get(x)?.name || a.refs.get(x)?.title || x : null);
      return {
        chose: { chapter: ref(a.output.chapter_ref), chapter_confidence: a.output.chapter_confidence, world: ref(a.output.world_ref), world_confidence: a.output.world_confidence, starts_something: a.output.starts_something },
        filed: { chapter: f.chapter?.title || null, world: f.world?.name || null },
        problems: f.problems,
      };
    });
  return { id: d.id, text: d.text, gold: { chapter: g.chapter, world: g.world, also_fair: g.also_fair || [], starts_something: g.starts_something }, runs };
});

const ok = answers.filter((a) => !a.error);
// the life context is not judged by the gold set: how often it is given, and to which drops
const contextGiven = new Map();
for (const a of ok)
  for (const x of decideFiling(a.output, a.refs).contexts) contextGiven.set(a.id, (contextGiven.get(a.id) || 0) + 1);
const starts = ok.filter((a) => a.output.starts_something === gold.get(a.id).starts_something).length;
const refProblems = ok.reduce((n, a) => n + decideFiling(a.output, a.refs).problems.length, 0);
const steady = byDrop.filter((d) => new Set(d.runs.map((r) => JSON.stringify(r.filed || r.error))).size === 1).length;
const cents = ok.reduce((s, a) => s + a.cents, 0) / Math.max(1, ok.length);
const ms = ok.map((a) => a.ms).sort((a, b) => a - b);

for (const d of byDrop) {
  // nothing wrong on any run: a Chapter only if it is gold's, a World only if it is fair
  const fair = [d.gold.world, ...d.gold.also_fair].filter(Boolean);
  const right = d.runs.every(
    (r) =>
      r.filed &&
      (!r.filed.chapter || r.filed.chapter === d.gold.chapter) &&
      (!r.filed.world || fair.includes(r.filed.world)),
  );
  const line = d.runs.map((r) => (r.error ? 'error' : `${r.filed.chapter || r.filed.world || 'nowhere'} (${(r.chose.chapter ? r.chose.chapter_confidence : r.chose.world_confidence)?.toFixed?.(2)})`)).join(' · ');
  console.log(`${right ? ' ' : '~'} ${d.id} gold ${d.gold.chapter || d.gold.world || 'nowhere'} | ${line}`);
}
const checks = [
  { name: 'every call answers', ok: answers.every((a) => !a.error), detail: `${answers.filter((a) => a.error).length} errors` },
  { name: 'no ref it was never given', ok: refProblems === 0, detail: `${refProblems}` },
  { name: `Chapter filings right ${BAR.chapter * 100} in 100 at the shipped cut`, ok: shipped.chapterRate >= BAR.chapter, detail: `${shipped.chapterRight} right, ${shipped.chapterWrong} wrong, ${shipped.missedChapter} misses` },
  { name: `World filings right ${BAR.world * 100} in 100 at the shipped cut`, ok: shipped.worldRate >= BAR.world, detail: `${shipped.worldRight} right, ${shipped.worldWrong} wrong` },
];
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.detail}`);
console.log(`start of something agrees with gold ${starts} of ${ok.length}; ${steady} of ${DROPS.length} drops filed the same on every run`);
console.log(`about ${cents.toFixed(4)} cents a drop, ${ms[Math.floor(ms.length / 2)] || 0} ms typical`);
console.log(`the life context was given to ${contextGiven.size} drops: ${[...contextGiven.entries()].map(([id, n]) => `${id}${n < repeat ? ` (${n} of ${repeat})` : ''}`).join(', ') || 'none'}`);
console.log(best ? `best cuts meeting the bar: chapter ${best.cut.chapter} world ${best.cut.world} (${best.filedRight} right filings, ${best.chapterWrong + best.worldWrong} wrong, ${best.chapterRight} into Chapters)` : 'no cuts meet the bar');
for (const w of shipped.wrongs) console.log(`  wrong at the shipped cut: ${JSON.stringify(w)}`);
console.log(`\n${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`);

const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'results.json'),
  JSON.stringify({ version: FILING_PROMPT_VERSION, cut: FILING_CUT, checks, shipped, best, sweep: sweep.filter((x) => x.meets).slice(0, 40), byDrop, contextGiven: Object.fromEntries(contextGiven), cents, ms }, null, 1),
);
console.log(`Results: ${join(dir, 'results.json')}`);
