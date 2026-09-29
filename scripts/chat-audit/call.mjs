// One call, shaped the way the Worker would send it to that provider.
//
// Today the helper jobs are direct OpenAI requests with a small max_tokens and
// temperature 0.1 (see workers/cortex/triage.js and cortex-index.js). Reasoning
// models and Gemini spend output tokens on thinking, so they get a larger cap
// with the lowest thinking setting; the worker's own helpers (openAIMinimalEffort
// in aiProvider.js) pick the same settings.
import { keys } from './keys.mjs';
import { MODELS, callCost } from './models.mjs';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

let budget = { max: Infinity, used: 0 };
export function setBudget(maxCalls) {
  budget = { max: maxCalls, used: 0 };
}
export function budgetUsed() {
  return budget.used;
}

async function withRetry(fn, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.ok) return { ...last, attempts: i + 1 };
    const retryable = last.status === 429 || last.status === 529 || (last.status >= 500 && last.status < 600) || last.status === null;
    if (!retryable) return { ...last, attempts: i + 1 };
    await new Promise((r) => setTimeout(r, 1500 * 2 ** i + Math.random() * 500));
  }
  return { ...last, attempts: tries };
}

/**
 * @param {string} modelKey key in MODELS
 * @param {{system: string, user: string, maxTokens: number, temperature?: number, json?: boolean}} req
 *   maxTokens is what the Worker uses today for this job (a hard cap for non reasoning models).
 */
export async function callModel(modelKey, { system, user, maxTokens, temperature = 0.1, json = false }) {
  const spec = MODELS[modelKey];
  if (!spec) throw new Error(`unknown model key ${modelKey}`);
  if (budget.used >= budget.max) return { ok: false, status: 'budget', error: 'request budget spent', ms: 0 };
  budget.used++;
  const thinks = spec.reasoning || spec.provider === 'gemini';
  const cap = thinks ? Math.max(maxTokens * 4, 1024) : maxTokens;
  const t0 = Date.now();
  if (spec.provider === 'openai') {
    const body = { model: spec.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (spec.reasoning) {
      body.max_completion_tokens = cap;
      if (spec.effort) body.reasoning_effort = spec.effort;
    } else {
      body.max_tokens = cap;
      body.temperature = temperature;
    }
    if (json) body.response_format = { type: 'json_object' };
    return withRetry(async () => {
      const t = Date.now();
      try {
        const res = await fetch(OPENAI_URL, { method: 'POST', headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => null);
        const ms = Date.now() - t;
        if (!res.ok) return { ok: false, status: res.status, ms, error: JSON.stringify(data).slice(0, 300) };
        const u = data.usage || {};
        const usage = { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, reasoning: u.completion_tokens_details?.reasoning_tokens || 0 };
        return { ok: true, status: res.status, ms, content: data.choices?.[0]?.message?.content || '', finish: data.choices?.[0]?.finish_reason, usage, cost: callCost(spec, usage) };
      } catch (err) {
        return { ok: false, status: null, ms: Date.now() - t, error: String(err) };
      }
    });
  }
  if (spec.provider === 'gemini') {
    const generationConfig = { temperature, maxOutputTokens: cap };
    if (spec.thinking) generationConfig.thinkingConfig = spec.thinking;
    if (json) generationConfig.responseMimeType = 'application/json';
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig };
    return withRetry(async () => {
      const t = Date.now();
      try {
        const res = await fetch(`${GEMINI_BASE}/${spec.model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': keys.gemini, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => null);
        const ms = Date.now() - t;
        if (!res.ok) return { ok: false, status: res.status, ms, error: JSON.stringify(data).slice(0, 300) };
        const u = data.usageMetadata || {};
        const parts = data.candidates?.[0]?.content?.parts || [];
        const usage = { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), reasoning: u.thoughtsTokenCount || 0 };
        return { ok: true, status: res.status, ms, content: parts.filter((p) => !p.thought).map((p) => p.text || '').join(''), finish: data.candidates?.[0]?.finishReason, usage, cost: callCost(spec, usage) };
      } catch (err) {
        return { ok: false, status: null, ms: Date.now() - t, error: String(err) };
      }
    });
  }
  throw new Error(`no adapter for provider ${spec.provider}`);
}

/** Run fn over items with at most n in flight. */
export async function pool(items, n, fn, onDone) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (onDone) onDone(i, out[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
