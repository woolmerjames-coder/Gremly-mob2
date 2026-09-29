// Provider adapters for the model audit. Each call returns
// { ok, content, usage: { input, cachedInput, cacheWrite, output, reasoning }, ms, attempts, error, status }
// Request shapes mirror what the Worker sends (see workers/cortex/aiProvider.js).

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function isOpenAIReasoningModel(model) {
  return /^(gpt-5|gpt-6|o\d)/.test(model);
}

// Lowest reasoning setting each OpenAI family accepts (confirmed against the
// API before the audit runs; see probe.mjs).
export function openAIMinimalEffort(model) {
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(model)) return 'minimal';
  if (/^(gpt-5\.\d|gpt-6)/.test(model)) return 'none';
  return null;
}

async function withRetry(fn, { tries = 8 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.ok) return { ...last, attempts: i + 1 };
    const retryable = last.status === 429 || last.status === 529 || (last.status >= 500 && last.status < 600) || last.status === null;
    if (!retryable) return { ...last, attempts: i + 1 };
    await new Promise((r) => setTimeout(r, 1200 * 2 ** i + Math.random() * 400));
  }
  return { ...last, attempts: tries };
}

export async function callOpenAI({ model, system, user, maxTokens = 700, key, json = true, effort, extra = {} }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    ...extra,
  };
  if (isOpenAIReasoningModel(model)) {
    const e = effort ?? openAIMinimalEffort(model);
    if (e) body.reasoning_effort = e;
  } else {
    body.temperature = 0;
  }
  if (json) body.response_format = { type: 'json_object' };
  return withRetry(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ms = Date.now() - t0;
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, status: res.status, ms, error: JSON.stringify(data).slice(0, 300) };
      const u = data.usage || {};
      return {
        ok: true,
        status: res.status,
        ms,
        content: data.choices?.[0]?.message?.content || '',
        usage: {
          input: u.prompt_tokens || 0,
          cachedInput: u.prompt_tokens_details?.cached_tokens || 0,
          cacheWrite: u.prompt_tokens_details?.cache_write_tokens || 0,
          output: u.completion_tokens || 0,
          reasoning: u.completion_tokens_details?.reasoning_tokens || 0,
        },
      };
    } catch (err) {
      return { ok: false, status: null, ms: Date.now() - t0, error: String(err) };
    }
  });
}

export async function callAnthropic({ model, system, user, maxTokens = 700, key, cache = true, thinking }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system: cache ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system,
    messages: [{ role: 'user', content: user }],
  };
  if (thinking) body.thinking = thinking;
  if (!/^claude-(opus|sonnet|fable|mythos)-5/.test(model)) body.temperature = 0;
  return withRetry(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ms = Date.now() - t0;
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, status: res.status, ms, error: JSON.stringify(data).slice(0, 300) };
      const u = data.usage || {};
      return {
        ok: true,
        status: res.status,
        ms,
        content: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
        usage: {
          input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
          cachedInput: u.cache_read_input_tokens || 0,
          cacheWrite: u.cache_creation_input_tokens || 0,
          output: u.output_tokens || 0,
          reasoning: u.output_tokens_details?.thinking_tokens || 0,
        },
      };
    } catch (err) {
      return { ok: false, status: null, ms: Date.now() - t0, error: String(err) };
    }
  });
}

export async function callGemini({ model, system, user, maxTokens = 700, key, json = true, thinking }) {
  const generationConfig = { temperature: 0, maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  if (thinking) generationConfig.thinkingConfig = thinking;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig,
  };
  return withRetry(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ms = Date.now() - t0;
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, status: res.status, ms, error: JSON.stringify(data).slice(0, 300) };
      const u = data.usageMetadata || {};
      const parts = data.candidates?.[0]?.content?.parts || [];
      return {
        ok: true,
        status: res.status,
        ms,
        content: parts.filter((p) => !p.thought).map((p) => p.text || '').join(''),
        usage: {
          input: u.promptTokenCount || 0,
          cachedInput: u.cachedContentTokenCount || 0,
          cacheWrite: 0,
          output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
          reasoning: u.thoughtsTokenCount || 0,
        },
      };
    } catch (err) {
      return { ok: false, status: null, ms: Date.now() - t0, error: String(err) };
    }
  });
}
