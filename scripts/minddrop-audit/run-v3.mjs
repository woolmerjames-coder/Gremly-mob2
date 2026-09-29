// Run the single-call classify-v3 prompt (the exact prompt and normaliser the
// Worker uses) against one candidate model on the dev or holdout split.
// Usage: node run-v3.mjs <modelKey> <dev|holdout> <tag> [concurrency]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { MODELS, callCost } from './models.mjs';
import { callOpenAI, callAnthropic, callGemini } from './providers.mjs';
import { loadGold, labelOf, scoreRows } from './score.mjs';
// PROMPT=v3.1 (etc.) runs a frozen prompt snapshot from prompts/; default is
// the live worker file.
import { DATA, RESULTS, PROMPTS, WORKER, url } from './paths.mjs';
import { keys } from './keys.mjs';
const promptModule = url(process.env.PROMPT ? `${PROMPTS}${process.env.PROMPT}.js` : `${WORKER}classifyV3.js`);
const { buildClassifyV3Prompt, formatDropMessage, normalizeClassifyV3, parseModelJson, PROMPT_VERSION } = await import(promptModule);

const [modelKey, split, tag = 'run1', conc = '4'] = process.argv.slice(2);
const spec = MODELS[modelKey];
if (!spec) throw new Error(`unknown model ${modelKey}`);
const items = JSON.parse(readFileSync(`${DATA}${split}.json`, 'utf8')).slice(0, Number(process.env.LIMIT || 1e9));
const gold = loadGold();
const system = buildClassifyV3Prompt();
const ctx = { currentDate: '2026-09-29', dayOfWeek: 'Tuesday' };

async function classify(text) {
  const user = formatDropMessage(text, ctx);
  const args = { model: spec.model, system, user, maxTokens: spec.maxTokens || 900 };
  if (spec.provider === 'openai') return callOpenAI({ ...args, key: keys.openai, effort: spec.effort });
  if (spec.provider === 'gemini') return callGemini({ ...args, key: keys.gemini, thinking: spec.thinking });
  return callAnthropic({ ...args, key: keys.anthropic, thinking: spec.thinking });
}

// FILL=1 re-runs only the rows that failed for transport reasons (rate
// limits, timeouts) in an existing results file, keeping every other row.
const OUT = `${RESULTS}v3_${modelKey}_${split}_${tag}.json`;
const rows = [];
let todo = items;
if (process.env.FILL) {
  const prev = JSON.parse(readFileSync(OUT, 'utf8')).rows;
  const redo = new Set(prev.filter((r) => r.error && r.error !== 'bad_output').map((r) => r.id));
  rows.push(...prev.filter((r) => !redo.has(r.id)));
  todo = items.filter((it) => redo.has(it.id));
  console.error(`filling ${todo.length} rows`);
}
let i = 0;
async function worker() {
  while (i < todo.length) {
    const it = todo[i++];
    const r = await classify(it.raw);
    const parsed = r.ok ? parseModelJson(r.content) : null;
    const norm = parsed ? normalizeClassifyV3(parsed, it.raw) : null;
    rows.push({
      id: it.id,
      raw: it.raw,
      label: labelOf(norm),
      ms: r.ok ? r.ms : null,
      attempts: r.attempts,
      usage: r.usage || null,
      cost: r.usage ? callCost(spec, r.usage) : 0,
      error: r.ok ? (norm ? null : 'bad_output') : r.error,
      question: norm?.clarification_question || null,
      labels: norm?.clarification_options?.map((o) => o.label) || null,
      ambiguity_type: norm?.ambiguity_type || null,
      clar_source: norm?.clarification_source || null,
      habit_subtypes: norm?.clarification_options?.map((o) => o.habitSubtype).filter(Boolean) || null,
      segments: norm?.segments?.map((s) => `${s.bucket}${s.subtype ? '/' + s.subtype : ''}${s.habitSubtype ? '/' + s.habitSubtype : ''}: ${s.text}`) || null,
      raw_out: r.ok ? r.content.slice(0, 1500) : null,
    });
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Number(conc) }, worker));
rows.sort((a, b) => a.id.localeCompare(b.id));
const s = scoreRows(rows, gold);
const u = rows.filter((r) => r.usage);
const avg = (f) => Math.round(u.reduce((a, r) => a + f(r.usage), 0) / Math.max(1, u.length));
const summary = {
  model: modelKey,
  split,
  tag,
  prompt_version: PROMPT_VERSION,
  ...s,
  cost_total: +rows.reduce((a, r) => a + r.cost, 0).toFixed(4),
  cost_per_1000: +((rows.reduce((a, r) => a + r.cost, 0) / rows.length) * 1000).toFixed(3),
  avg_input: avg((x) => x.input),
  avg_cached: avg((x) => x.cachedInput),
  avg_output: avg((x) => x.output),
  avg_reasoning: avg((x) => x.reasoning),
  retries: rows.reduce((a, r) => a + Math.max(0, (r.attempts || 1) - 1), 0),
  wall_s: Math.round((Date.now() - t0) / 1000),
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
