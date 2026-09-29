// Baseline: run the CURRENT v2 chain through the real Worker code, the way
// the app calls it (dropPhases.ts handleQueued / handleMultiDetected /
// handleClassified):
//   - detect-multi in parallel with classify-phase1-v2 (only when the text
//     might be multi, same heuristic as the app)
//   - if multi: classify-phase1-v2 per segment, in parallel
//   - if ambiguous: clarify-ambiguity
// Every model call the Worker makes is intercepted to record tokens, cost
// and which model answered.
// Usage: node run-v2.mjs <dev|holdout> <tag> <nanoModel> [concurrency]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { MODELS, callCost } from './models.mjs';
import { loadGold, scoreRows } from './score.mjs';

const [split, tag = 'run1', nanoModel = 'gpt-4.1-nano', conc = '3'] = process.argv.slice(2);
import { DATA, RESULTS, ROOT, url } from './paths.mjs';
import { keys } from './keys.mjs';
import { join, basename, resolve } from 'node:path';
const items = JSON.parse(readFileSync(`${DATA}${split}.json`, 'utf8')).slice(0, Number(process.env.LIMIT || 1e9));
const gold = loadGold();

// ---- intercept provider calls for usage accounting ----
const als = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
const PRICE_BY_MODEL = Object.fromEntries(Object.values(MODELS).map((m) => [m.model, m]));
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : url.url;
  const res = await realFetch(url, init);
  const store = als.getStore();
  if (store && /api\.openai\.com|generativelanguage|api\.anthropic\.com/.test(u)) {
    try {
      const body = init.body ? JSON.parse(init.body) : {};
      const data = await res.clone().json();
      let model = body.model || (u.match(/models\/([^:]+):/) || [])[1] || 'unknown';
      let usage = { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 };
      if (u.includes('openai')) {
        const x = data.usage || {};
        usage = { input: x.prompt_tokens || 0, cachedInput: x.prompt_tokens_details?.cached_tokens || 0, cacheWrite: 0, output: x.completion_tokens || 0, reasoning: x.completion_tokens_details?.reasoning_tokens || 0 };
      } else if (u.includes('generativelanguage')) {
        const x = data.usageMetadata || {};
        usage = { input: x.promptTokenCount || 0, cachedInput: x.cachedContentTokenCount || 0, cacheWrite: 0, output: (x.candidatesTokenCount || 0) + (x.thoughtsTokenCount || 0), reasoning: x.thoughtsTokenCount || 0 };
      } else {
        const x = data.usage || {};
        usage = { input: (x.input_tokens || 0) + (x.cache_read_input_tokens || 0) + (x.cache_creation_input_tokens || 0), cachedInput: x.cache_read_input_tokens || 0, cacheWrite: x.cache_creation_input_tokens || 0, output: x.output_tokens || 0, reasoning: 0 };
      }
      const spec = PRICE_BY_MODEL[model];
      store.calls.push({ model, ok: res.ok, status: res.status, usage, cost: spec ? callCost(spec, usage) : null });
    } catch {
      store.calls.push({ model: 'unparsed', ok: res.ok, status: res.status, usage: null, cost: null });
    }
  }
  return res;
};

// WORKER_DIR: folder holding the cortex-index.js to test (default: the Worker
// source in this repo). For today's production code, export the committed
// version into a folder first (see README).
const WORKER_PATH = process.env.WORKER_DIR ? resolve(process.env.WORKER_DIR) : join(ROOT, 'workers', 'cortex');
const WORKER_DIR = basename(WORKER_PATH);
const { default: worker } = await import(url(join(WORKER_PATH, 'cortex-index.js')));
const env = {
  OPENAI_API_KEY: keys.openai,
  GEMINI_API_KEY: keys.gemini,
  GOOGLE_API_KEY: keys.gemini,
  ANTHROPIC_API_KEY: keys.anthropic,
  NANO_MODEL: nanoModel,
  CONTEXT_CACHE: { get: async () => null, put: async () => {} },
};
const ctx = { waitUntil() {} };

// Same heuristic the app uses before calling detect-multi (dropPhases.ts)
function mightBeMulti(text) {
  const l = text.toLowerCase();
  return [',', '.', ';', ' and ', ' also ', ' then ', ' plus ', ' as well', ' but ', '+', ' & ', '\n', ' / ', ' — ', ' – ', ' - '].some((s) => l.includes(s));
}

async function post(body) {
  const t0 = Date.now();
  const req = new Request('https://worker.local/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' }, body: JSON.stringify(body) });
  const res = await worker.fetch(req, env, ctx);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: Date.now() - t0 };
}

function labelFromPhase1(p) {
  if (!p || !p.bucket) return 'FAIL';
  if (p.is_ambiguous) return 'ambiguous';
  if (p.bucket === 'todo') return 'todo';
  if (p.bucket === 'habit') return `habit/${p.habitSubtype || 'start_habit'}`;
  return `log/${p.subtype || 'general'}`;
}

async function runDrop(text) {
  const store = { calls: [] };
  return als.run(store, async () => {
    const t0 = Date.now();
    const [dm, p1] = await Promise.all([
      mightBeMulti(text) ? post({ type: 'detect-multi', text }) : Promise.resolve(null),
      post({ type: 'classify-phase1-v2', text, hasAttachments: false, hasUserSelectedDate: false }),
    ]);
    let label = labelFromPhase1(p1.json);
    let degraded = ['preparse-fallback', 'phase1-fallback', 'phase1-error-fallback'].includes(p1.json?.source);
    const classifyMs = Date.now() - t0;
    let extraMs = 0;
    let segments = null;
    let ambiguityType = null;
    if (dm?.json?.is_multi && Array.isArray(dm.json.segments) && dm.json.segments.length > 1) {
      label = 'multi';
      const t1 = Date.now();
      const segs = await Promise.all(dm.json.segments.map((s) => post({ type: 'classify-phase1-v2', text: s.text, hasAttachments: false })));
      extraMs = Date.now() - t1;
      segments = segs.map((s, i) => `${labelFromPhase1(s.json)}: ${dm.json.segments[i].text}`);
    } else if (p1.json?.is_ambiguous) {
      const t1 = Date.now();
      const c = await post({ type: 'clarify-ambiguity', text, ambiguityType: p1.json.ambiguity_type, ambiguityReason: p1.json.ambiguity_reason });
      ambiguityType = c.json?.ambiguity_type || p1.json.ambiguity_type || null;
      extraMs = Date.now() - t1;
      segments = [`Q: ${c.json?.clarification_question} | ${(c.json?.options || []).map((o) => o.label).join(' / ')}`];
    }
    return {
      label,
      degraded,
      source: p1.json?.source,
      heuristic_reason: p1.json?.heuristic_reason,
      classify_ms: classifyMs,
      ms: classifyMs + extraMs,
      calls: store.calls,
      segments,
      ambiguity_type: ambiguityType,
    };
  });
}

const rows = [];
let i = 0;
async function w() {
  while (i < items.length) {
    const it = items[i++];
    try {
      const r = await runDrop(it.raw);
      const cost = r.calls.reduce((a, c) => a + (c.cost || 0), 0);
      rows.push({ id: it.id, raw: it.raw, ...r, cost, ncalls: r.calls.length, failed_calls: r.calls.filter((c) => !c.ok).length });
    } catch (err) {
      rows.push({ id: it.id, raw: it.raw, label: 'FAIL', ms: null, error: String(err), calls: [], cost: 0 });
    }
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Number(conc) }, w));
rows.sort((a, b) => a.id.localeCompare(b.id));
let s = {}; try { s = scoreRows(rows, gold); } catch { s = { note: "scored separately" }; }
const modelsUsed = {};
for (const r of rows) for (const c of r.calls || []) modelsUsed[c.model] = (modelsUsed[c.model] || 0) + 1;
const summary = {
  engine: "v2",
  worker_dir: WORKER_DIR,
  nano_model: nanoModel,
  split,
  tag,
  ...s,
  degraded: rows.filter((r) => r.degraded).length,
  avg_calls_per_drop: +(rows.reduce((a, r) => a + (r.ncalls || 0), 0) / rows.length).toFixed(2),
  failed_calls: rows.reduce((a, r) => a + (r.failed_calls || 0), 0),
  cost_total: +rows.reduce((a, r) => a + r.cost, 0).toFixed(4),
  cost_per_1000: +((rows.reduce((a, r) => a + r.cost, 0) / rows.length) * 1000).toFixed(3),
  models_used: modelsUsed,
  wall_s: Math.round((Date.now() - t0) / 1000),
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(`${RESULTS}v2_${WORKER_DIR}_${nanoModel}_${split}_${tag}.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
