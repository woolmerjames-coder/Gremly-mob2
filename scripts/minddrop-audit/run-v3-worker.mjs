// Parity check: run drops through the REAL Worker route (type: classify-v3)
// with the given Worker vars, exactly as the app would call it, and score it.
// Confirms the production code path (aiProvider request shapes, timeouts,
// fallback, normaliser) matches the audit harness.
// Usage: node run-v3-worker.mjs <split> <tag> KEY=VALUE ...   (Worker vars)
// Sends piece_questions as the Mind Drop rethink's app builds do (PIECE_QUESTIONS=false
// to send it as builds already out do), and records the split, the drop as one and
// any piece's question (stage 3, 9 Oct 2026).
import { readFileSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { MODELS, callCost } from './models.mjs';
import { loadGold, labelOf, scoreRows } from './score.mjs';

const [split, tag, ...vars] = process.argv.slice(2);
import { DATA, RESULTS, WORKER, url } from './paths.mjs';
import { keys } from './keys.mjs';
const items = JSON.parse(readFileSync(`${DATA}${split}.json`, 'utf8')).slice(0, Number(process.env.LIMIT || 1e9));
const gold = loadGold();
const als = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
const BY_ID = Object.fromEntries(Object.values(MODELS).map((m) => [m.model, m]));
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : url.url;
  const res = await realFetch(url, init);
  const store = als.getStore();
  if (store && /api\.openai\.com|generativelanguage|api\.anthropic\.com/.test(u)) {
    try {
      const body = init.body ? JSON.parse(init.body) : {};
      const data = await res.clone().json();
      const model = body.model || (u.match(/models\/([^:]+):/) || [])[1];
      let usage;
      if (u.includes('openai')) { const x = data.usage || {}; usage = { input: x.prompt_tokens || 0, cachedInput: x.prompt_tokens_details?.cached_tokens || 0, cacheWrite: 0, output: x.completion_tokens || 0 }; }
      else if (u.includes('generativelanguage')) { const x = data.usageMetadata || {}; usage = { input: x.promptTokenCount || 0, cachedInput: x.cachedContentTokenCount || 0, cacheWrite: 0, output: (x.candidatesTokenCount || 0) + (x.thoughtsTokenCount || 0) }; }
      else { const x = data.usage || {}; usage = { input: (x.input_tokens || 0) + (x.cache_read_input_tokens || 0) + (x.cache_creation_input_tokens || 0), cachedInput: x.cache_read_input_tokens || 0, cacheWrite: x.cache_creation_input_tokens || 0, output: x.output_tokens || 0 }; }
      // Match dated or aliased ids to the price table.
      const spec = BY_ID[model] || Object.values(MODELS).find((m) => model && model.startsWith(m.model));
      store.calls.push({ model, status: res.status, ok: res.ok, usage, cost: spec ? callCost(spec, usage) : null, sent: { effort: body.reasoning_effort, thinking: body.generationConfig?.thinkingConfig, mime: body.generationConfig?.responseMimeType, max: body.max_completion_tokens || body.generationConfig?.maxOutputTokens } });
    } catch { store.calls.push({ model: 'unparsed', status: res.status }); }
  }
  return res;
};
const { default: worker } = await import(url(`${WORKER}cortex-index.js`));
const env = { OPENAI_API_KEY: keys.openai, GEMINI_API_KEY: keys.gemini, GOOGLE_API_KEY: keys.gemini, ANTHROPIC_API_KEY: keys.anthropic, CLASSIFY_V3_ENABLED: 'true', CONTEXT_CACHE: { get: async () => null, put: async () => {} } };
for (const v of vars) { const i = v.indexOf('='); env[v.slice(0, i)] = v.slice(i + 1); }

const rows = [];
let i = 0;
async function w() {
  while (i < items.length) {
    const it = items[i++];
    const store = { calls: [] };
    await als.run(store, async () => {
      const t0 = Date.now();
      const req = new Request('https://worker.local/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' }, body: JSON.stringify({ type: 'classify-v3', text: it.raw, currentDate: '2026-09-29', dayOfWeek: 'Tuesday', ...(process.env.PIECE_QUESTIONS === 'false' ? {} : { piece_questions: true }) }) });
      const res = await worker.fetch(req, env, { waitUntil() {} });
      const json = await res.json().catch(() => null);
      const ms = Date.now() - t0;
      const ok = res.status === 200 && json && json.bucket;
      const lab = (o) => (o.bucket === 'habit' ? `habit/${o.habitSubtype || 'start_habit'}` : o.bucket === 'todo' ? 'todo' : `log/${o.subtype || 'general'}`);
      rows.push({ id: it.id, raw: it.raw, label: ok ? labelOf(json) : 'FAIL', options: json?.clarification_options ? json.clarification_options.map((o) => ({ label: lab(o), text: o.label })) : null, segments: json?.is_multi && json.segments ? json.segments.map((x) => ({ text: x.text, label: x.is_ambiguous ? 'ambiguous' : lab(x), ...(x.is_ambiguous ? { ambiguity_type: x.ambiguity_type, question: x.clarification_question } : {}) })) : null, split: json?.split ?? null, as_one: json?.as_one ? lab(json.as_one) : null, prompt_version: json?.prompt_version ?? null, gate: json?.gate || null, ms: ok ? ms : null, status: res.status, provider: json?.provider, model: json?.model, wasFallback: json?.was_fallback, question: json?.clarification_question || null, labels: json?.clarification_options?.map((o) => o.label) || null, ambiguity_type: json?.ambiguity_type || null, clar_source: json?.clarification_source || null, calls: store.calls, cost: store.calls.reduce((a, c) => a + (c.cost || 0), 0) });
    });
  }
}
await Promise.all(Array.from({ length: Number(process.env.CONC || 3) }, w));
rows.sort((a, b) => a.id.localeCompare(b.id));
let s = {}; try { s = scoreRows(rows, gold); } catch { s = { note: 'scored separately' }; }
const summary = { engine: 'v3-worker', split, tag, vars, ...s, fallbacks: rows.filter((r) => r.wasFallback).length, cost_total: +rows.reduce((a, r) => a + r.cost, 0).toFixed(4), sent: rows[0]?.calls?.[0]?.sent };
writeFileSync(`${RESULTS}v3w_${tag}_${split}.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
