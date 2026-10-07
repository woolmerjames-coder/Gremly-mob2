/**
 * AI usage logging, shared by both Workers (cortex and inngest-jobs).
 *
 * Every call a Worker makes to Anthropic, OpenAI or Google is recorded as one
 * row in public.ai_usage: which job made it, for which user, on which model, how
 * many tokens went in and out, and what it cost at list price. Tavily searches
 * from chat are recorded too, as calls with no tokens and no price. Nothing
 * about the content of a call is stored.
 *
 * It works by wrapping fetch once per isolate. The job and user come from an
 * AsyncLocalStorage context set at the top of the Worker's fetch handler, so no
 * call site has to change. A call made outside that context is still logged,
 * without a job or user.
 *
 * In cortex one request makes several calls, so each call can carry a step
 * (withAiStep): the row's job is then route/step, such as
 * general_chat/triage_mode or general_chat/reply. Every call one request makes
 * shares its run_id, so a chat message's calls add up to its cost. A streamed
 * call also records how long its first chunk took (meta.first_chunk_ms), which
 * is the time to first words. A call can also carry a note of what it decided
 * (withAiNote), which lands in its row's meta, so a decision such as triage's
 * can be read beside the call that made it.
 *
 * Logging never blocks or breaks the call it records: the response is cloned,
 * read after the caller has it, and every failure here is swallowed.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export const aiContext = new AsyncLocalStorage();

// List prices in USD per million tokens, as published on 30 Sep 2026 and
// checked again on 2 Oct 2026.
// [model id prefix, input, cached input, cache write, output]
// Longest matching prefix wins. Gemini 3.6, 3.7 and 3.8 Flash have a
// promotional price until 31 Dec 2026 and the standard price from 1 Jan 2027.
const PRICE_TABLE = [
  ['claude-sonnet-5-5', 2, 0.2, 2.5, 10],
  ['claude-sonnet-5', 2, 0.2, 2.5, 10],
  ['claude-sonnet-4-6', 3, 0.3, 3.75, 15],
  ['claude-sonnet-4-5', 3, 0.3, 3.75, 15],
  ['claude-haiku-4-5', 1, 0.1, 1.25, 5],
  ['gpt-6-luna', 0.1, 0.01, 0, 0.5],
  ['gpt-4.1-mini', 0.4, 0.1, 0, 1.6],
  ['gpt-4.1-nano', 0.1, 0.025, 0, 0.4],
  ['gpt-4.1', 2, 0.5, 0, 8],
  ['gpt-4o-mini', 0.15, 0.075, 0, 0.6],
  ['gemini-3-flash-preview', 0.5, 0.05, 0, 3],
  ['gemini-3.5-flash', 1.5, 0.15, 0, 9],
  ['gemini-3.1-flash-lite', 0.25, 0.025, 0, 1.5],
  ['gemini-3.5-flash-lite', 0.3, 0.03, 0, 2.5],
  ['gemini-2.5-flash', 0.3, 0.03, 0, 2.5],
  ['gemini-2.0-flash', 0.1, 0.025, 0, 0.4],
];
const PROMO_FLASH = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
const PROMO_END = Date.parse('2027-01-01T00:00:00Z');

export function priceFor(model, at = Date.now()) {
  if (!model) return null;
  const m = String(model)
    .toLowerCase()
    .replace(/^models\//, '');
  for (const p of PROMO_FLASH) {
    if (m.startsWith(p)) return at < PROMO_END ? [0.75, 0.075, 0, 3.75] : [1.5, 0.15, 0, 7.5];
  }
  let best = null;
  for (const row of PRICE_TABLE) {
    if (m.startsWith(row[0]) && (!best || row[0].length > best[0].length)) best = row;
  }
  return best ? best.slice(1) : null;
}

function providerFor(url) {
  // Batch calls are logged per result, with batch pricing, where results are read.
  if (url.includes('/messages/batches')) return null;
  if (url.includes('api.anthropic.com')) return 'anthropic';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('generativelanguage.googleapis.com')) return 'google';
  if (url.includes('api.tavily.com')) return 'tavily';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The row's job: the route, then the step when the call has one. */
export function jobName(store) {
  if (!store) return null;
  if (store.step) return `${store.job || 'unknown'}/${store.step}`;
  return store.job || null;
}

/** Add the route, user or run to the current request's usage context. */
export function setAiUsage(fields) {
  const store = aiContext.getStore();
  if (store && fields) Object.assign(store, fields);
}

/**
 * Run fn with a step name on the calls it makes, so a request that makes
 * several calls logs each one under route/step. With keep, a step that is
 * already set wins: a helper job that goes out through the Gemini client keeps
 * the helper job's name.
 */
export function withAiStep(step, fn, { keep = false } = {}) {
  const store = aiContext.getStore();
  if (!store || !step || (keep && store.step)) return fn();
  return aiContext.run({ ...store, step }, fn);
}

/**
 * Run fn with a note for the rows of the calls it makes: what the call
 * decided, merged into the row's meta. The note may be a promise the caller
 * settles once it has read the answer; the row waits for it a short while,
 * after the call has finished, so the call itself never waits. Only a call
 * that succeeded carries the note.
 */
export function withAiNote(note, fn) {
  const store = aiContext.getStore();
  if (!store || !note) return fn();
  return aiContext.run({ ...store, note }, fn);
}

const NOTE_WAIT_MS = 5000;

async function settleNote(note) {
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve(note),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), NOTE_WAIT_MS);
      }),
    ]);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function emptyUsage() {
  return { input: 0, cached: 0, cacheWrite: 0, output: 0, thinking: 0, model: null };
}

// Fold one parsed provider payload into the running totals. Streamed calls send
// several payloads; the last cumulative figure wins.
function absorb(provider, obj, u) {
  if (!obj || typeof obj !== 'object') return;
  if (provider === 'anthropic') {
    const msg = obj.message || obj;
    if (msg.model) u.model = msg.model;
    const usage = msg.usage || obj.usage;
    if (usage) {
      if (usage.input_tokens != null) u.input = usage.input_tokens;
      if (usage.cache_read_input_tokens != null) u.cached = usage.cache_read_input_tokens;
      if (usage.cache_creation_input_tokens != null)
        u.cacheWrite = usage.cache_creation_input_tokens;
      if (usage.output_tokens != null) u.output = usage.output_tokens;
    }
    return;
  }
  if (provider === 'openai') {
    const r = obj.response || obj;
    if (r.model) u.model = r.model;
    const usage = r.usage;
    if (!usage) return;
    if (usage.prompt_tokens != null) {
      const cached = usage.prompt_tokens_details?.cached_tokens || 0;
      u.cached = cached;
      u.input = usage.prompt_tokens - cached;
      u.output = usage.completion_tokens || 0;
      u.thinking = usage.completion_tokens_details?.reasoning_tokens || 0;
    } else if (usage.input_tokens != null) {
      const cached = usage.input_tokens_details?.cached_tokens || 0;
      u.cached = cached;
      u.input = usage.input_tokens - cached;
      u.output = usage.output_tokens || 0;
      u.thinking = usage.output_tokens_details?.reasoning_tokens || 0;
    }
    return;
  }
  if (provider === 'google') {
    if (obj.modelVersion) u.model = obj.modelVersion;
    const usage = obj.usageMetadata;
    if (!usage) return;
    const cached = usage.cachedContentTokenCount || 0;
    u.cached = cached;
    u.input = (usage.promptTokenCount || 0) - cached;
    u.thinking = usage.thoughtsTokenCount || 0;
    // Gemini bills thinking as output; OpenAI and Anthropic already include it.
    u.output = (usage.candidatesTokenCount || 0) + u.thinking;
  }
}

function parseBody(provider, text, u) {
  const t = text.trim();
  if (!t) return;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) parsed.forEach((p) => absorb(provider, p, u));
      else absorb(provider, parsed, u);
      return;
    } catch {
      // fall through to the event stream reader
    }
  }
  for (const line of t.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('data:')) continue;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      absorb(provider, JSON.parse(payload), u);
    } catch {
      // ignore partial lines
    }
  }
}

function modelFromRequest(provider, url, reqBody) {
  if (provider === 'tavily') {
    const m = url.match(/api\.tavily\.com\/([a-z_-]+)/i);
    return `tavily-${m ? m[1] : 'call'}`;
  }
  if (provider === 'google') {
    const m = url.match(/models\/([^:/?]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  if (typeof reqBody === 'string') {
    try {
      const b = JSON.parse(reqBody);
      if (b && typeof b.model === 'string') return b.model;
    } catch {
      // not JSON
    }
  }
  return null;
}

export function costUsd(u, at = Date.now(), batch = false) {
  const p = priceFor(u.model, at);
  if (!p) return null;
  const [pin, pcached, pwrite, pout] = p;
  const raw = (u.input * pin + u.cached * pcached + u.cacheWrite * pwrite + u.output * pout) / 1e6;
  return Math.round((batch ? raw / 2 : raw) * 1e6) / 1e6;
}

/** Usage row for one Anthropic batch result message, at batch (half) price. */
export function batchUsageRow(message, extra = {}) {
  const u = emptyUsage();
  absorb('anthropic', message, u);
  return {
    worker: extra.worker || 'inngest-jobs',
    job: extra.job || null,
    user_id: extra.userId || null,
    provider: 'anthropic',
    model: u.model,
    input_tokens: u.input,
    cached_input_tokens: u.cached,
    cache_write_tokens: u.cacheWrite,
    output_tokens: u.output,
    thinking_tokens: 0,
    cost_usd: costUsd(u, Date.now(), true),
    latency_ms: null,
    status: 200,
    ok: true,
    batch: true,
    run_id: extra.runId || null,
  };
}

/**
 * Write one usage row. Exported so the Batch API path can record batch results,
 * which arrive outside the wrapped fetch.
 */
export async function writeUsageRow(env, row, rawFetch = globalThis.__aiUsageRawFetch || fetch) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_KEY) return;
  await rawFetch(`${env.SUPABASE_URL}/rest/v1/ai_usage`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

/**
 * Read a cloned body to the end, noting when the first bytes arrived. For a
 * streamed reply that is when the first words reached the Worker.
 */
export async function readTimed(clone, started) {
  if (!clone.body || typeof clone.body.getReader !== 'function') {
    return { text: await clone.text(), firstChunkMs: null };
  }
  const reader = clone.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let firstChunkMs = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) {
      if (firstChunkMs === null) firstChunkMs = Date.now() - started;
      text += decoder.decode(value, { stream: true });
    }
  }
  text += decoder.decode();
  return { text, firstChunkMs };
}

async function record({
  provider,
  url,
  reqBody,
  clone,
  started,
  status,
  streamed,
  store,
  rawFetch,
}) {
  const { text, firstChunkMs } = await readTimed(clone, started);
  const u = emptyUsage();
  if (provider !== 'tavily') parseBody(provider, text, u);
  if (!u.model) u.model = modelFromRequest(provider, url, reqBody);
  const latency = Date.now() - started;
  const ok = status >= 200 && status < 300;
  const note = ok && store.note ? await settleNote(store.note) : null;
  const meta = {
    ...(streamed && firstChunkMs !== null ? { first_chunk_ms: firstChunkMs } : {}),
    ...(note || {}),
  };
  await writeUsageRow(
    store.env,
    {
      worker: store.worker || null,
      job: jobName(store),
      user_id: UUID.test(String(store.userId || '')) ? store.userId : null,
      provider,
      model: u.model,
      input_tokens: u.input,
      cached_input_tokens: u.cached,
      cache_write_tokens: u.cacheWrite,
      output_tokens: u.output,
      thinking_tokens: u.thinking,
      cost_usd: costUsd(u),
      latency_ms: latency,
      status,
      ok,
      batch: false,
      run_id: store.runId || null,
      meta: Object.keys(meta).length ? meta : null,
    },
    rawFetch,
  );
}

/**
 * A call that threw or was cut off by its timeout never answered, but it still
 * happened: it is logged as failed, with no tokens and no price, so failures
 * show beside the calls that worked.
 */
async function recordFailure({ provider, url, reqBody, started, store, rawFetch, err }) {
  const name = err?.name || '';
  await writeUsageRow(
    store.env,
    {
      worker: store.worker || null,
      job: jobName(store),
      user_id: UUID.test(String(store.userId || '')) ? store.userId : null,
      provider,
      model: modelFromRequest(provider, url, reqBody),
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      thinking_tokens: 0,
      cost_usd: null,
      latency_ms: Date.now() - started,
      status: 0,
      ok: false,
      batch: false,
      run_id: store.runId || null,
      meta: {
        failed: name === 'AbortError' || name === 'TimeoutError' ? 'timed out' : 'threw',
        error: String(err?.message || err).slice(0, 200),
      },
    },
    rawFetch,
  );
}

let installed = false;

export function installAiUsageLogging() {
  if (installed) return;
  installed = true;
  const rawFetch = globalThis.fetch.bind(globalThis);
  globalThis.__aiUsageRawFetch = rawFetch;
  globalThis.fetch = async function fetchWithUsage(input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : input?.url || String(input);
    } catch {
      url = '';
    }
    const provider = providerFor(url);
    if (!provider) return rawFetch(input, init);
    const started = Date.now();
    let res;
    try {
      res = await rawFetch(input, init);
    } catch (err) {
      try {
        const store = aiContext.getStore() || globalThis.__aiUsageFallbackStore;
        if (store?.env?.SUPABASE_URL) {
          const reqBody = typeof init?.body === 'string' ? init.body : null;
          const work = recordFailure({
            provider,
            url,
            reqBody,
            started,
            store,
            rawFetch,
            err,
          }).catch(() => {});
          if (store.ctx && typeof store.ctx.waitUntil === 'function') store.ctx.waitUntil(work);
        }
      } catch {
        // logging must never affect the call
      }
      throw err;
    }
    try {
      const store = aiContext.getStore() || globalThis.__aiUsageFallbackStore;
      if (store?.env?.SUPABASE_URL) {
        const reqBody = typeof init?.body === 'string' ? init.body : null;
        const streamed =
          /event-stream/i.test(res.headers?.get?.('content-type') || '') ||
          /alt=sse|streamGenerateContent/.test(url);
        const clone = res.clone();
        const work = record({
          provider,
          url,
          reqBody,
          clone,
          started,
          status: res.status,
          streamed,
          store,
          rawFetch,
        }).catch(() => {});
        if (store.ctx && typeof store.ctx.waitUntil === 'function') store.ctx.waitUntil(work);
      }
    } catch {
      // logging must never affect the call
    }
    return res;
  };
}
