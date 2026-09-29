// Run the triage jobs for one model over a turn set.
// Usage: node run-turns.mjs <modelKey> <dev|test> <tag> [concurrency] [two-call|one-call] [maxCalls]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DATA, RESULTS } from './paths.mjs';
import { MODELS } from './models.mjs';
import { callModel, pool, setBudget, budgetUsed } from './call.mjs';
import { keys, geminiKeyIsTestProject } from './keys.mjs';
import { VALID, FALLBACK, SETTINGS, parseJson, classifierInputFor, messageCountFor, MODE_SYSTEM_PROMPT, buildSignalsSystemPrompt, buildOneCallSystemPrompt } from './triage-jobs.mjs';
import { applyTriageV2 } from './prompts/variants.mjs';

const [modelKey, set, tag, concArg, variantArg, maxArg, promptArg] = process.argv.slice(2);
const promptVariant = promptArg || 'v1';
if (!MODELS[modelKey] || !['dev', 'test', 'smoke'].includes(set) || !tag) {
  console.error('Usage: node run-turns.mjs <modelKey> <dev|test> <tag> [concurrency] [two-call|one-call] [maxCalls]');
  console.error('models:', Object.keys(MODELS).join(', '));
  process.exit(1);
}
const concurrency = Number(concArg || 4);
const variant = variantArg || 'two-call';
setBudget(Number(maxArg || 5000));
if (MODELS[modelKey].provider === 'gemini' && !geminiKeyIsTestProject) console.warn('warning: using the app Gemini key, not the test project key');
if (MODELS[modelKey].provider === 'openai' && !keys.openai) throw new Error('no OPENAI_API_KEY');

const turns = JSON.parse(readFileSync(`${DATA}turns_${set}.json`, 'utf8'));
const t0 = Date.now();
let done = 0;

function pick(obj, field) {
  const v = obj && typeof obj[field] === 'string' ? obj[field] : null;
  return VALID[field].includes(v) ? { value: v, fallback: false } : { value: FALLBACK[field], fallback: true };
}

async function runTurn(turn) {
  const input = classifierInputFor(turn);
  const mc = messageCountFor(turn);
  const row = { id: turn.id, variant, calls: [] };
  if (variant === 'two-call') {
    const [m, s] = await Promise.all([
      callModel(modelKey, { system: MODE_SYSTEM_PROMPT, user: input, ...SETTINGS.triage_mode }),
      callModel(modelKey, { system: buildSignalsSystemPrompt([], '', mc), user: input, ...SETTINGS.triage_signals }),
    ]);
    const mj = m.ok ? parseJson(m.content) : null;
    const sj = s.ok ? parseJson(s.content) : null;
    const mode = pick(mj, 'mode');
    const search = pick(sj, 'search'), personal = pick(sj, 'personal'), depth = pick(sj, 'depth');
    Object.assign(row, { mode: mode.value, search: search.value, personal: personal.value, depth: depth.value,
      fallback: { mode: mode.fallback, signals: search.fallback && personal.fallback && depth.fallback, search: search.fallback, personal: personal.fallback, depth: depth.fallback },
      turn_ms: Math.max(m.ms || 0, s.ms || 0),
      calls: [{ job: 'triage_mode', ...strip(m) }, { job: 'triage_signals', ...strip(s) }] });
  } else {
    let sys = buildOneCallSystemPrompt([], '', mc);
    if (promptVariant === 'v2') sys = applyTriageV2(sys);
    const r = await callModel(modelKey, { system: sys, user: input, ...SETTINGS.triage_one_call });
    const j = r.ok ? parseJson(r.content) : null;
    const mode = pick(j, 'mode'), search = pick(j, 'search'), personal = pick(j, 'personal'), depth = pick(j, 'depth');
    Object.assign(row, { mode: mode.value, search: search.value, personal: personal.value, depth: depth.value,
      fallback: { mode: mode.fallback, signals: !j, search: search.fallback, personal: personal.fallback, depth: depth.fallback },
      turn_ms: r.ms || 0, calls: [{ job: 'triage_one_call', ...strip(r) }] });
  }
  return row;
}
function strip(r) {
  return { ok: r.ok, status: r.status, ms: r.ms, attempts: r.attempts, usage: r.usage || null, cost: r.cost || 0, finish: r.finish || null, content: (r.content || '').slice(0, 200), error: r.error || null };
}

const rows = await pool(turns, concurrency, runTurn, () => {
  done++;
  if (done % 50 === 0) console.error(`${done}/${turns.length} ${Math.round((Date.now() - t0) / 1000)}s`);
});
mkdirSync(RESULTS, { recursive: true });
const out = { modelKey, model: MODELS[modelKey].model, set, tag, variant, promptVariant, concurrency, ran_at: new Date().toISOString(), wall_s: Math.round((Date.now() - t0) / 1000), calls: budgetUsed(), rows };
writeFileSync(`${RESULTS}turns_${set}_${tag}.json`, JSON.stringify(out));
const failed = rows.filter((r) => r.calls.some((c) => !c.ok)).length;
const fb = rows.filter((r) => r.fallback.mode || r.fallback.search || r.fallback.depth || r.fallback.personal).length;
const cost = rows.reduce((s, r) => s + r.calls.reduce((a, c) => a + c.cost, 0), 0);
const ms = rows.map((r) => r.turn_ms).sort((a, b) => a - b);
console.log(`${modelKey} ${variant} ${promptVariant} ${set}: ${rows.length} turns, ${budgetUsed()} calls, failed calls on ${failed} turns, fallback on ${fb} turns, p50 ${ms[Math.floor(ms.length / 2)]}ms p90 ${ms[Math.floor(ms.length * 0.9)]}ms, $${cost.toFixed(4)} total, ${Math.round((Date.now() - t0) / 1000)}s`);
