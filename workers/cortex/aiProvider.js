// ============================================================================
// aiProvider.js — Multi-provider AI abstraction with automatic fallback
//
// Exports:
//   aiGenerate(config)     — non-streaming call with fallback
//   aiStream(config)       — streaming call with fallback
//   aiClassify(config)     — non-streaming + JSON parse + validation + fallback
//   getProviders(tier, env) — preset provider configs by tier
// ============================================================================

import { geminiGenerate, geminiStream, parseGeminiChunk } from './geminiClient.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const TIMEOUT = {
  streaming: 6000, // 6s to first byte for streaming calls
  nonStreaming: 8000, // 8s total for non-streaming calls
};

const RETRY_DELAY_MS = 2500; // delay before same-provider retry in background mode

// ── Model registry ──
// gpt-4.1-nano is removed from the OpenAI API on 2026-10-23 (announced
// 2026-04-22). gemini-3.1-flash-lite-preview was shut down on 2026-05-25.
// Every tier below can be overridden with a Worker var (wrangler.toml [vars])
// so a model swap never needs a code change. Defaults are models that are
// live and use the same request shape as before.
export const RETIRED_MODEL_REPLACEMENTS = {
  'gpt-4.1-nano': 'gpt-4.1-mini',
  'gpt-4.1-nano-2025-04-14': 'gpt-4.1-mini',
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
};

/**
 * Map a retired model id to its live replacement. Used for model names that
 * arrive from app builds already in users' hands.
 */
export function resolveModel(model, env) {
  if (!model || typeof model !== 'string') return 'gpt-4.1-mini';
  if (model.startsWith('gpt-4.1-nano'))
    return env?.NANO_MODEL || RETIRED_MODEL_REPLACEMENTS[model] || 'gpt-4.1-mini';
  return RETIRED_MODEL_REPLACEMENTS[model] || model;
}

// Newer Claude models reject sampling parameters ("temperature is deprecated
// for this model") and think by default, which adds seconds to a realtime call.
function isNextGenClaude(model) {
  return (
    /^claude-(opus|sonnet|fable|mythos)-5/.test(model || '') ||
    /^claude-opus-4-[7-9]/.test(model || '')
  );
}

// Lowest thinking setting per model (checked against the API on 2026-09-28):
// Sonnet 5.5 accepts only `between_tools`; Sonnet 5, Opus 5 and Opus 4.8
// accept `disabled`; Opus 5.5 and Fable 5.1 accept neither, so the field is
// left out. callAnthropic also retries once without temperature/thinking if
// the API still rejects them, so an unknown model falls back to its defaults
// instead of failing every call.
function minimalThinkingParam(model) {
  const m = model || '';
  if (/^claude-sonnet-5-5/.test(m)) return { type: 'between_tools' };
  if (/^claude-(sonnet|opus)-5(-\d{8})?$/.test(m) || /^claude-opus-4-8/.test(m)) {
    return { type: 'disabled' };
  }
  return null;
}

const CIRCUIT_CONFIG = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  cooldownMs: 60_000,
  kvPrefix: 'circuit:',
};

// ── Observability ──

function logFallback(details) {
  console.log(
    '[AI_FALLBACK]',
    JSON.stringify({
      event: 'ai_fallback_triggered',
      endpoint: details.endpoint,
      mode: details.mode,
      primary_provider: details.primaryProvider,
      primary_model: details.primaryModel,
      fallback_provider: details.fallbackProvider,
      fallback_model: details.fallbackModel,
      reason: details.reason,
      was_retry: details.wasRetry || false,
      primary_latency_ms: details.primaryLatency || null,
      primary_status: details.primaryStatus || null,
      primary_error: (details.primaryError || '').substring(0, 200),
      validation_reason: details.validationReason || null,
      timestamp: new Date().toISOString(),
    }),
  );
}

function logCircuitTransition(details) {
  console.log(
    '[CIRCUIT_BREAKER]',
    JSON.stringify({
      event: 'circuit_state_change',
      provider: details.provider,
      from: details.fromState,
      to: details.toState,
      consecutive_failures: details.consecutiveFailures,
      trigger: details.trigger,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Circuit Breaker ──

async function getCircuitState(provider, env) {
  if (!env?.CORTEX_KV) return 'closed'; // no KV = no circuit breaker = always try primary

  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    if (!raw) return 'closed';

    const state = JSON.parse(raw);

    if (state.state === 'open') {
      // Check if cooldown has expired → transition to half_open
      const elapsed = Date.now() - (state.openedAt || 0);
      if (elapsed >= CIRCUIT_CONFIG.cooldownMs) {
        const newState = { ...state, state: 'half_open' };
        await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
        logCircuitTransition({
          provider,
          fromState: 'open',
          toState: 'half_open',
          consecutiveFailures: state.consecutiveFailures,
          trigger: 'cooldown_expired',
        });
        return 'half_open';
      }
      return 'open';
    }

    return state.state || 'closed';
  } catch {
    return 'closed'; // KV error = fail open (try primary)
  }
}

async function recordSuccess(provider, env) {
  if (!env?.CORTEX_KV) return;

  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    const prev = raw ? JSON.parse(raw) : null;

    if (prev && (prev.state === 'half_open' || prev.consecutiveFailures > 0)) {
      const fromState = prev.state || 'closed';
      const newState = {
        state: 'closed',
        consecutiveFailures: 0,
        lastFailureTime: null,
        openedAt: null,
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });

      if (fromState === 'half_open') {
        logCircuitTransition({
          provider,
          fromState: 'half_open',
          toState: 'closed',
          consecutiveFailures: 0,
          trigger: 'probe_success',
        });
      }
    }
  } catch {
    // KV error — ignore, don't break the happy path
  }
}

async function recordFailure(provider, reason, env) {
  if (!env?.CORTEX_KV) return;

  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    const prev = raw
      ? JSON.parse(raw)
      : { state: 'closed', consecutiveFailures: 0, lastFailureTime: null, openedAt: null };
    const now = Date.now();

    // If half_open and the probe failed, go back to open
    if (prev.state === 'half_open') {
      const newState = {
        state: 'open',
        consecutiveFailures: prev.consecutiveFailures + 1,
        lastFailureTime: now,
        openedAt: now,
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
      logCircuitTransition({
        provider,
        fromState: 'half_open',
        toState: 'open',
        consecutiveFailures: newState.consecutiveFailures,
        trigger: 'probe_failure',
      });
      return;
    }

    // Reset counter if last failure was outside the window
    const failures =
      prev.lastFailureTime && now - prev.lastFailureTime < CIRCUIT_CONFIG.failureWindowMs
        ? prev.consecutiveFailures + 1
        : 1;

    if (failures >= CIRCUIT_CONFIG.failureThreshold) {
      // Trip the breaker
      const newState = {
        state: 'open',
        consecutiveFailures: failures,
        lastFailureTime: now,
        openedAt: now,
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
      logCircuitTransition({
        provider,
        fromState: prev.state || 'closed',
        toState: 'open',
        consecutiveFailures: failures,
        trigger: 'failure_threshold',
      });
    } else {
      const newState = {
        ...prev,
        state: 'closed',
        consecutiveFailures: failures,
        lastFailureTime: now,
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
    }
  } catch {
    // KV error — ignore
  }
}

// ── Provider Adapters — Non-Streaming ──

// OpenAI reasoning families (GPT-5, GPT-5.x, GPT-6, o-series) reject
// `temperature` and `max_tokens`, and think by default. For classification we
// send the lowest reasoning setting each family accepts. Older models
// (GPT-4.1, GPT-4o) keep temperature. `max_completion_tokens` works for both.
export function isOpenAIReasoningModel(model) {
  return /^(gpt-5|gpt-6|o\d)/.test(model || '');
}

export function openAIMinimalEffort(model) {
  const m = model || '';
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(m)) return 'minimal';
  if (/^(gpt-5\.\d|gpt-6)/.test(m)) return 'none';
  return null;
}

async function callOpenAI(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_completion_tokens: config.maxOutputTokens ?? 500,
  };
  if (isOpenAIReasoningModel(config.model)) {
    const effort = config.reasoningEffort ?? openAIMinimalEffort(config.model);
    if (effort) body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature ?? 0.1;
  }

  // OpenAI JSON mode
  if (config.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  // OpenAI tools
  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return { type: 'function', function: tool.function };
      }
      return tool;
    });
    body.tool_choice = 'auto';
  }

  let res;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        content: '',
        functionCalls: [],
        usage: {},
        error: 'timeout',
        status: null,
      };
    }
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: err.message,
      status: null,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: errText,
      status: res.status,
    };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  const functionCalls = (choice?.message?.tool_calls || []).map((tc) => ({
    name: tc.function?.name,
    args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
    id: tc.id,
  }));

  return {
    ok: true,
    content,
    functionCalls,
    usage: data.usage || {},
  };
}

async function callGeminiNonStream(systemPrompt, messages, config) {
  // geminiGenerate already returns { ok, content, functionCalls, parts, usage, error, status }
  const result = await geminiGenerate(
    systemPrompt,
    messages,
    {
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.maxOutputTokens ?? 500,
      thinkingLevel: config.thinkingLevel || 'low',
      tools: config.geminiTools || undefined, // Gemini-native tool format
      model: config.model,
      responseMimeType:
        config.responseFormat === 'json' && !config.geminiTools ? 'application/json' : undefined,
    },
    config.apiKey,
  );

  // Gemini models differ in which thinking levels they accept (3.8 Flash
  // rejects "minimal"). Retry once at "low" rather than failing over.
  if (
    !result.ok &&
    result.status === 400 &&
    !config._thinkingRetry &&
    /thinking level/i.test(String(result.error || ''))
  ) {
    return callGeminiNonStream(systemPrompt, messages, {
      ...config,
      thinkingLevel: 'low',
      _thinkingRetry: true,
    });
  }

  return {
    ok: result.ok,
    content: result.content || '',
    functionCalls: result.functionCalls || [],
    usage: result.usage || {},
    error: result.error,
    status: result.status,
    groundingMetadata: result.groundingMetadata,
    parts: result.parts, // preserve for follow-up tool calls
  };
}

async function callAnthropic(systemPrompt, messages, config, signal) {
  const mappedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    model: config.model,
    max_tokens: config.maxOutputTokens ?? 500,
    // cacheSystem: mark the (static) system prompt cacheable. Cuts cost and
    // time to first token for prompts over the model's cache minimum.
    system: config.cacheSystem
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt,
    messages: mappedMessages,
  };

  const nextGen = isNextGenClaude(config.model);
  if (config.temperature !== undefined && !nextGen) {
    body.temperature = config.temperature;
  }
  if (config.minimalThinking) {
    const thinking = minimalThinkingParam(config.model);
    if (thinking) body.thinking = thinking;
  }

  // Anthropic tools
  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        };
      }
      return tool;
    });
  }

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        content: '',
        functionCalls: [],
        usage: {},
        error: 'timeout',
        status: null,
      };
    }
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: err.message,
      status: null,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    // A model that rejects temperature or the thinking setting: retry once
    // without them rather than failing the call.
    if (
      res.status === 400 &&
      !config._paramRetry &&
      (body.temperature !== undefined || body.thinking) &&
      /temperature|thinking/i.test(errText)
    ) {
      console.warn('[callAnthropic] retrying without temperature/thinking', {
        model: config.model,
        error: errText.substring(0, 160),
      });
      return callAnthropic(
        systemPrompt,
        messages,
        { ...config, temperature: undefined, minimalThinking: false, _paramRetry: true },
        signal,
      );
    }
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: errText,
      status: res.status,
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: 'bad_json',
      status: res.status,
    };
  }
  let content = '';
  const functionCalls = [];

  for (const block of data.content || []) {
    if (block.type === 'text') {
      content += block.text;
    }
    if (block.type === 'tool_use') {
      functionCalls.push({
        name: block.name,
        args: block.input,
        id: block.id,
      });
    }
  }

  // For JSON calls only: strip code fences and preamble/postamble text.
  // Gated on responseFormat==='json' so prose responses containing braces are
  // never mutated. (stop_reason warning below stays unconditional.)
  if (config.responseFormat === 'json') {
    const fenceMatch = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
    if (fenceMatch) {
      content = fenceMatch[1].trim();
    } else {
      // Strip preamble before the opening { and postamble after the closing }.
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart > 0 || (jsonEnd !== -1 && jsonEnd < content.length - 1)) {
        content = jsonStart !== -1 ? content.slice(jsonStart, jsonEnd + 1) : content;
      }
    }
  }

  // Warn on truncation so callers know JSON may be incomplete
  if (data.stop_reason === 'max_tokens') {
    console.warn('[callAnthropic] stop_reason=max_tokens: response truncated', {
      model: data.model,
      content_len: content.length,
      content_head: content.slice(0, 300),
      content_tail: content.slice(-200),
    });
  }

  return {
    ok: true,
    content,
    functionCalls,
    usage: data.usage || {},
    stop_reason: data.stop_reason ?? null,
  };
}

// ── Provider Adapters — Streaming ──

async function callOpenAIStream(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxOutputTokens ?? 800,
    stream: true,
  };

  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return { type: 'function', function: tool.function };
      }
      return tool;
    });
    body.tool_choice = 'auto';
  }

  let res;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, body: null, status: null, error: 'timeout' };
    }
    return { ok: false, body: null, status: null, error: err.message };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return { ok: false, body: null, status: res.status, error: errText };
  }

  return { ok: true, body: res.body, status: res.status };
}

async function callGeminiStreamAdapter(systemPrompt, messages, config) {
  const result = await geminiStream(
    systemPrompt,
    messages,
    {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 800,
      thinkingLevel: config.thinkingLevel || 'low',
      tools: config.geminiTools || undefined,
      model: config.model,
    },
    config.apiKey,
  );

  // geminiStream returns the raw Response on success, or { ok: false, status, error }
  if (result.ok === false) {
    return { ok: false, body: null, status: result.status, error: result.error };
  }

  // It returned the raw Response object
  return { ok: true, body: result.body, status: result.status || 200 };
}

async function callAnthropicStream(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    max_tokens: config.maxOutputTokens ?? 800,
    stream: true,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (config.temperature !== undefined) {
    body.temperature = config.temperature;
  }

  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        };
      }
      return tool;
    });
  }

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, body: null, status: null, error: 'timeout' };
    }
    return { ok: false, body: null, status: null, error: err.message };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return { ok: false, body: null, status: res.status, error: errText };
  }

  return { ok: true, body: res.body, status: res.status };
}

// ── Chunk Parsers ──

function parseOpenAIChunk(line) {
  if (!line || line === '[DONE]') {
    return { text: null, functionCalls: null, done: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { text: null, functionCalls: null, done: false };
  }

  const delta = parsed.choices?.[0]?.delta;
  if (!delta) return { text: null, functionCalls: null, done: false };

  const text = delta.content || null;
  let functionCalls = null;

  if (delta.tool_calls) {
    functionCalls = delta.tool_calls.map((tc) => ({
      name: tc.function?.name,
      args: tc.function?.arguments,
      id: tc.id,
      index: tc.index,
    }));
  }

  const done = parsed.choices?.[0]?.finish_reason != null;

  return { text, functionCalls, done };
}

function parseAnthropicChunk(line) {
  if (!line) return { text: null, functionCalls: null, done: false };

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { text: null, functionCalls: null, done: false };
  }

  if (parsed.type === 'message_stop') {
    return { text: null, functionCalls: null, done: true };
  }

  if (parsed.type === 'content_block_delta') {
    if (parsed.delta?.type === 'text_delta') {
      return { text: parsed.delta.text, functionCalls: null, done: false };
    }
    if (parsed.delta?.type === 'input_json_delta') {
      return {
        text: null,
        functionCalls: [{ partialJson: parsed.delta.partial_json }],
        done: false,
      };
    }
  }

  return { text: null, functionCalls: null, done: false };
}

function parseGeminiChunkNormalized(jsonStr) {
  const result = parseGeminiChunk(jsonStr);
  return {
    text: result.text,
    functionCalls: result.functionCalls,
    done: result.done,
  };
}

function getChunkParser(provider) {
  switch (provider) {
    case 'openai':
      return parseOpenAIChunk;
    case 'gemini':
      return parseGeminiChunkNormalized;
    case 'anthropic':
      return parseAnthropicChunk;
    default:
      return parseOpenAIChunk;
  }
}

// ── Internal Router Functions ──

async function callProviderNonStream(provider, systemPrompt, messages, config, signal) {
  switch (provider) {
    case 'openai':
      return callOpenAI(systemPrompt, messages, config, signal);
    case 'gemini':
      return callGeminiNonStream(systemPrompt, messages, config);
    case 'anthropic':
      return callAnthropic(systemPrompt, messages, config, signal);
    default:
      return {
        ok: false,
        content: '',
        functionCalls: [],
        usage: {},
        error: `Unknown provider: ${provider}`,
      };
  }
}

async function callProviderStream(provider, systemPrompt, messages, config, signal) {
  switch (provider) {
    case 'openai':
      return callOpenAIStream(systemPrompt, messages, config, signal);
    case 'gemini':
      return callGeminiStreamAdapter(systemPrompt, messages, config);
    case 'anthropic':
      return callAnthropicStream(systemPrompt, messages, config, signal);
    default:
      return { ok: false, body: null, status: null, error: `Unknown provider: ${provider}` };
  }
}

function classifyError(result) {
  if (result.error === 'timeout') return 'timeout';
  if (result.status === 429) return 'http_429';
  if (result.status === 500) return 'http_500';
  if (result.status === 503) return 'http_503';
  if (result.status) return 'http_other';
  return 'network';
}

// Hard cap for a fallback call in realtime mode. The fallback used to run
// with no timeout at all, so a slow fallback provider could hold a user
// facing request open indefinitely.
const FALLBACK_REALTIME_TIMEOUT_MS = 8000;

async function callWithDeadline(provider, systemPrompt, messages, providerConfig, mode, timeoutMs) {
  if (mode !== 'realtime') {
    return callProviderNonStream(provider, systemPrompt, messages, providerConfig, null);
  }
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        ok: false,
        content: '',
        functionCalls: [],
        usage: {},
        error: 'timeout',
        status: null,
      });
    }, timeoutMs || FALLBACK_REALTIME_TIMEOUT_MS);
  });
  const call = callProviderNonStream(
    provider,
    systemPrompt,
    messages,
    providerConfig,
    controller.signal,
  );
  // If the deadline wins, a late rejection from the aborted call must not
  // surface as an unhandled rejection.
  call.catch(() => {});
  try {
    return await Promise.race([call, deadline]);
  } catch (err) {
    return {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: String(err?.message || err),
      status: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Exported Functions ──

async function _attemptFallbackNonStream(config, t0, reason) {
  const fallbackResult = await callWithDeadline(
    config.fallback.provider,
    config.systemPrompt,
    config.messages,
    config.fallback,
    config.mode,
    config.fallbackTimeoutMs,
  );

  const result = {
    ...fallbackResult,
    provider: config.fallback.provider,
    model: config.fallback.model,
    wasFallback: true,
    fallbackReason: reason || 'unknown',
    latency_ms: Date.now() - t0,
  };

  if (!fallbackResult.ok) {
    if (config.mode === 'background') {
      throw new Error(
        `[aiProvider] Both providers failed for ${config.endpoint}: primary=${config.primary.provider}, fallback=${config.fallback.provider}`,
      );
    }
    return result;
  }

  // Validate fallback result too
  if (config.validate) {
    const validation = config.validate(fallbackResult.content);
    if (!validation.valid) {
      if (config.mode === 'background') {
        throw new Error(`[aiProvider] Both providers failed validation for ${config.endpoint}`);
      }
      return result; // caller will handle { ok: true } but invalid content via its own defaults
    }
  }

  return result;
}

function failedResult(err) {
  return {
    ok: false,
    content: '',
    functionCalls: [],
    usage: {},
    error: String(err?.message || err),
    status: null,
  };
}

// Resolves with the first tagged result that passes `isGood`; when none do,
// with the fallback's result (or the only one there is). Inputs never reject.
function firstGood(tagged, isGood) {
  return new Promise((resolve) => {
    const done = [];
    for (const p of tagged) {
      p.then((t) => {
        if (isGood(t.r)) return resolve(t);
        done.push(t);
        if (done.length === tagged.length) {
          resolve(done.find((d) => d.who === 'fallback') || done[0]);
        }
      });
    }
  });
}

async function hedgedRace(config, primaryCall, deadline, t0) {
  const isGood = (r) => !!r && r.ok && (!config.validate || config.validate(r.content).valid);
  const primary = Promise.race([primaryCall, deadline])
    .catch(failedResult)
    .then((r) => ({ who: 'primary', r }));

  let hedgeTimer;
  const hedge = new Promise((resolve) => {
    hedgeTimer = setTimeout(() => resolve({ who: 'hedge' }), config.hedgeAfterMs);
  });
  const first = await Promise.race([primary, hedge]);
  clearTimeout(hedgeTimer);

  if (first.who === 'primary') {
    if (isGood(first.r)) {
      await recordSuccess(config.primary.provider, config.env);
      return {
        ...first.r,
        provider: config.primary.provider,
        model: config.primary.model,
        wasFallback: false,
        fallbackReason: null,
        latency_ms: Date.now() - t0,
      };
    }
    // Primary failed before the hedge point: ordinary fallback.
    const reason = first.r.ok ? 'validation' : classifyError(first.r);
    await recordFailure(config.primary.provider, reason, config.env);
    return _attemptFallbackNonStream(config, t0, reason);
  }

  // Primary is slow: race it against the fallback.
  const fallback = callWithDeadline(
    config.fallback.provider,
    config.systemPrompt,
    config.messages,
    config.fallback,
    config.mode,
    config.fallbackTimeoutMs,
  )
    .catch(failedResult)
    .then((r) => ({ who: 'fallback', r }));
  const winner = await firstGood([primary, fallback], isGood);
  const fromPrimary = winner.who === 'primary';
  if (fromPrimary) await recordSuccess(config.primary.provider, config.env);
  logFallback({
    endpoint: config.endpoint,
    mode: config.mode,
    primaryProvider: config.primary.provider,
    primaryModel: config.primary.model,
    fallbackProvider: config.fallback.provider,
    fallbackModel: config.fallback.model,
    reason: fromPrimary ? 'hedge_primary_won' : 'hedge_fallback_won',
    primaryLatency: Date.now() - t0,
  });
  return {
    ...winner.r,
    provider: fromPrimary ? config.primary.provider : config.fallback.provider,
    model: fromPrimary ? config.primary.model : config.fallback.model,
    wasFallback: !fromPrimary,
    fallbackReason: fromPrimary ? null : 'hedge',
    latency_ms: Date.now() - t0,
  };
}

export async function aiGenerate(config) {
  const t0 = Date.now();

  // --- Circuit breaker check ---
  const circuitState = await getCircuitState(config.primary.provider, config.env);

  if (circuitState === 'open') {
    logFallback({
      endpoint: config.endpoint,
      mode: config.mode,
      primaryProvider: config.primary.provider,
      primaryModel: config.primary.model,
      fallbackProvider: config.fallback.provider,
      fallbackModel: config.fallback.model,
      reason: 'circuit_open',
    });

    const fallbackResult = await callWithDeadline(
      config.fallback.provider,
      config.systemPrompt,
      config.messages,
      config.fallback,
      config.mode,
      config.fallbackTimeoutMs,
    );

    if (fallbackResult.ok && config.validate) {
      config.validate(fallbackResult.content);
      // Validation result is not used to gate circuit_open fallback — return regardless
    }

    return {
      ...fallbackResult,
      provider: config.fallback.provider,
      model: config.fallback.model,
      wasFallback: true,
      fallbackReason: 'circuit_open',
      latency_ms: Date.now() - t0,
    };
  }

  // --- Attempt primary ---
  let signal = null;
  let timeout = null;
  let deadline = null;

  if (config.mode === 'realtime') {
    const controller = new AbortController();
    signal = controller.signal;
    // The race also covers adapters that ignore the abort signal (Gemini).
    deadline = new Promise((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({
          ok: false,
          content: '',
          functionCalls: [],
          usage: {},
          error: 'timeout',
          status: null,
        });
      }, config.primaryTimeoutMs || TIMEOUT.nonStreaming);
    });
  }

  const primaryCall = callProviderNonStream(
    config.primary.provider,
    config.systemPrompt,
    config.messages,
    config.primary,
    signal,
  );
  primaryCall.catch(() => {}); // late rejection after the deadline wins

  // --- Hedged request (opt in, realtime only) ---
  // When the primary has not answered within hedgeAfterMs, the fallback is
  // started as well and whichever returns a valid answer first is used. This
  // cuts the slow tail without waiting for the full primary timeout.
  if (
    deadline &&
    config.hedgeAfterMs > 0 &&
    config.hedgeAfterMs < (config.primaryTimeoutMs || TIMEOUT.nonStreaming)
  ) {
    try {
      return await hedgedRace(config, primaryCall, deadline, t0);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  let primaryResult;
  try {
    primaryResult = deadline ? await Promise.race([primaryCall, deadline]) : await primaryCall;
  } catch (err) {
    primaryResult = {
      ok: false,
      content: '',
      functionCalls: [],
      usage: {},
      error: String(err?.message || err),
      status: null,
    };
  }

  if (timeout) clearTimeout(timeout);

  // --- Primary succeeded ---
  if (primaryResult.ok) {
    // Validate if validator provided
    if (config.validate) {
      const validation = config.validate(primaryResult.content);
      if (!validation.valid) {
        // Validation failed — treat as failure, try fallback
        await recordFailure(config.primary.provider, 'validation', config.env);

        logFallback({
          endpoint: config.endpoint,
          mode: config.mode,
          primaryProvider: config.primary.provider,
          primaryModel: config.primary.model,
          fallbackProvider: config.fallback.provider,
          fallbackModel: config.fallback.model,
          reason: 'validation',
          validationReason: validation.reason,
          primaryLatency: Date.now() - t0,
        });

        return await _attemptFallbackNonStream(config, t0, 'validation');
      }
    }

    await recordSuccess(config.primary.provider, config.env);
    return {
      ...primaryResult,
      provider: config.primary.provider,
      model: config.primary.model,
      wasFallback: false,
      fallbackReason: null,
      latency_ms: Date.now() - t0,
    };
  }

  // --- Primary failed ---
  const reason = classifyError(primaryResult);
  await recordFailure(config.primary.provider, reason, config.env);

  logFallback({
    endpoint: config.endpoint,
    mode: config.mode,
    primaryProvider: config.primary.provider,
    primaryModel: config.primary.model,
    fallbackProvider: config.fallback.provider,
    fallbackModel: config.fallback.model,
    reason,
    primaryLatency: Date.now() - t0,
    primaryStatus: primaryResult.status,
    primaryError: primaryResult.error,
  });

  // --- Background mode: retry primary once before cross-provider fallback ---
  if (config.mode === 'background') {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

    const retryResult = await callProviderNonStream(
      config.primary.provider,
      config.systemPrompt,
      config.messages,
      config.primary,
      null,
    );

    if (retryResult.ok) {
      if (config.validate) {
        const validation = config.validate(retryResult.content);
        if (!validation.valid) {
          // Retry also failed validation — proceed to cross-provider fallback
          return await _attemptFallbackNonStream(config, t0, 'validation');
        }
      }
      await recordSuccess(config.primary.provider, config.env);
      return {
        ...retryResult,
        provider: config.primary.provider,
        model: config.primary.model,
        wasFallback: false,
        fallbackReason: null,
        latency_ms: Date.now() - t0,
      };
    }
  }

  // --- Cross-provider fallback ---
  return await _attemptFallbackNonStream(config, t0, reason);
}

export async function aiStream(config) {
  const t0 = Date.now();

  // --- Circuit breaker check ---
  const circuitState = await getCircuitState(config.primary.provider, config.env);

  if (circuitState === 'open') {
    logFallback({
      endpoint: config.endpoint,
      mode: config.mode,
      primaryProvider: config.primary.provider,
      primaryModel: config.primary.model,
      fallbackProvider: config.fallback.provider,
      fallbackModel: config.fallback.model,
      reason: 'circuit_open',
    });

    const fallbackRes = await callProviderStream(
      config.fallback.provider,
      config.systemPrompt,
      config.messages,
      config.fallback,
      null,
    );

    if (!fallbackRes.ok || !fallbackRes.body) {
      return {
        ok: false,
        body: null,
        provider: config.fallback.provider,
        model: config.fallback.model,
        wasFallback: true,
        fallbackReason: 'circuit_open',
        parseChunk: null,
        latency_ms: Date.now() - t0,
      };
    }

    return {
      ok: true,
      body: fallbackRes.body,
      provider: config.fallback.provider,
      model: config.fallback.model,
      wasFallback: true,
      fallbackReason: 'circuit_open',
      parseChunk: getChunkParser(config.fallback.provider),
      latency_ms: Date.now() - t0,
    };
  }

  // --- Attempt primary with timeout ---
  let signal = null;
  let timeoutHandle = null;

  if (config.mode === 'realtime') {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT.streaming);
  }

  const primaryRes = await callProviderStream(
    config.primary.provider,
    config.systemPrompt,
    config.messages,
    config.primary,
    signal,
  );

  if (timeoutHandle) clearTimeout(timeoutHandle);

  // --- Primary succeeded ---
  if (primaryRes.ok && primaryRes.body) {
    await recordSuccess(config.primary.provider, config.env);
    return {
      ok: true,
      body: primaryRes.body,
      provider: config.primary.provider,
      model: config.primary.model,
      wasFallback: false,
      fallbackReason: null,
      parseChunk: getChunkParser(config.primary.provider),
      latency_ms: Date.now() - t0,
    };
  }

  // --- Primary failed ---
  const reason = classifyError(primaryRes);
  await recordFailure(config.primary.provider, reason, config.env);

  logFallback({
    endpoint: config.endpoint,
    mode: config.mode,
    primaryProvider: config.primary.provider,
    primaryModel: config.primary.model,
    fallbackProvider: config.fallback.provider,
    fallbackModel: config.fallback.model,
    reason,
    primaryLatency: Date.now() - t0,
    primaryStatus: primaryRes.status,
    primaryError: primaryRes.error,
  });

  // --- Fallback (no timeout) ---
  const fallbackRes = await callProviderStream(
    config.fallback.provider,
    config.systemPrompt,
    config.messages,
    config.fallback,
    null,
  );

  if (!fallbackRes.ok || !fallbackRes.body) {
    return {
      ok: false,
      body: null,
      provider: config.fallback.provider,
      model: config.fallback.model,
      wasFallback: true,
      fallbackReason: reason,
      parseChunk: null,
      latency_ms: Date.now() - t0,
    };
  }

  return {
    ok: true,
    body: fallbackRes.body,
    provider: config.fallback.provider,
    model: config.fallback.model,
    wasFallback: true,
    fallbackReason: reason,
    parseChunk: getChunkParser(config.fallback.provider),
    latency_ms: Date.now() - t0,
  };
}

export async function aiClassify(config) {
  // Wrap the validate function to work at the content level
  const originalValidate = config.validate;

  const wrappedConfig = {
    ...config,
    validate: (content) => {
      // Step 1: Try JSON parse
      let parsed;
      try {
        let clean = (content || '').trim();
        if (clean.startsWith('```')) {
          clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        }
        parsed = JSON.parse(clean);
      } catch {
        return { valid: false, reason: 'json_parse_failed' };
      }

      // Step 2: Run custom validator if provided
      if (originalValidate) {
        const customResult = originalValidate(parsed);
        if (!customResult.valid) {
          return customResult;
        }
      }

      return { valid: true, parsed };
    },
  };

  const result = await aiGenerate(wrappedConfig);

  // Extract the parsed JSON from the validation result
  let parsed = null;
  if (result.ok && result.content) {
    try {
      let clean = result.content.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      parsed = JSON.parse(clean);

      // Run validation on the final (possibly fallback) result
      if (originalValidate) {
        const validation = originalValidate(parsed);
        if (!validation.valid) {
          parsed = null;
        }
      }
    } catch {
      parsed = null;
    }
  }

  return {
    ...result,
    parsed,
  };
}

export function getProviders(tier, env) {
  const googleKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  const geminiFlash = env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
  const nanoModel = env.NANO_MODEL || 'gpt-4.1-mini'; // was gpt-4.1-nano (retired 2026-10-23)
  const miniModel = env.MINI_MODEL || 'gpt-4.1-mini';
  switch (tier) {
    case 'nano':
      return {
        primary: {
          provider: 'openai',
          model: nanoModel,
          apiKey: env.OPENAI_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: geminiFlash,
          apiKey: googleKey,
          thinkingLevel: 'minimal',
        },
      };
    case 'mini':
      return {
        primary: {
          provider: 'openai',
          model: miniModel,
          apiKey: env.OPENAI_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: geminiFlash,
          apiKey: googleKey,
          thinkingLevel: 'none',
        },
      };
    case 'chat':
      return {
        primary: {
          provider: 'gemini',
          model: geminiFlash,
          apiKey: googleKey,
          thinkingLevel: 'low',
        },
        fallback: {
          provider: 'openai',
          model: miniModel,
          apiKey: env.OPENAI_API_KEY,
        },
      };
    case 'haiku':
      return {
        primary: {
          provider: 'anthropic',
          model: env.HAIKU_MODEL || 'claude-haiku-4-5-20251001',
          apiKey: env.ANTHROPIC_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          // was gemini-3.1-flash-lite-preview (shut down 2026-05-25)
          model: env.GEMINI_FLASH_LITE_MODEL || 'gemini-3.1-flash-lite',
          apiKey: googleKey,
          thinkingLevel: 'low',
        },
      };
    case 'sonnet':
      return {
        primary: {
          provider: 'anthropic',
          model: env.SONNET_MODEL || 'claude-sonnet-4-6',
          apiKey: env.ANTHROPIC_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: geminiFlash,
          apiKey: googleKey,
          thinkingLevel: 'medium',
        },
      };
    case 'classify': {
      // Single-call Mind Drop classifier (classify-v3). The model is chosen by
      // the model audit (docs/2026-09-29-minddrop-model-audit.md) and set with
      // Worker vars, so switching needs no code change:
      //   CLASSIFY_PROVIDER         openai | gemini | anthropic
      //   CLASSIFY_MODEL            model id
      //   CLASSIFY_REASONING_EFFORT OpenAI reasoning models (none, minimal, low ...)
      //   CLASSIFY_THINKING_LEVEL   Gemini (minimal, low ...)
      //   CLASSIFY_MAX_OUTPUT_TOKENS output budget; thinking tokens count
      //                             towards it on Gemini and OpenAI reasoning models
      //   CLASSIFY_FALLBACK_PROVIDER / CLASSIFY_FALLBACK_MODEL
      // Until a model is picked the default is GPT-4.1 mini (cheap, known
      // request shape).
      const keyFor = (p) =>
        p === 'anthropic' ? env.ANTHROPIC_API_KEY : p === 'gemini' ? googleKey : env.OPENAI_API_KEY;
      const classifyProvider = env.CLASSIFY_PROVIDER || 'openai';
      const classifyDefaultModel = {
        anthropic: env.HAIKU_MODEL || 'claude-haiku-4-5-20251001',
        openai: miniModel,
        gemini: env.GEMINI_FLASH_LITE_MODEL || 'gemini-3.1-flash-lite',
      };
      const fallbackProvider = env.CLASSIFY_FALLBACK_PROVIDER || 'openai';
      const fallbackModel =
        env.CLASSIFY_FALLBACK_MODEL || classifyDefaultModel[fallbackProvider] || miniModel;
      const maxOut = Number(env.CLASSIFY_MAX_OUTPUT_TOKENS) || 1500;
      const common = {
        cacheSystem: true,
        responseFormat: 'json',
        maxOutputTokens: maxOut,
        temperature: 0,
      };
      return {
        primary: {
          provider: classifyProvider,
          model: env.CLASSIFY_MODEL || classifyDefaultModel[classifyProvider] || miniModel,
          apiKey: keyFor(classifyProvider),
          ...common,
          minimalThinking: true,
          ...(env.CLASSIFY_REASONING_EFFORT
            ? { reasoningEffort: env.CLASSIFY_REASONING_EFFORT }
            : {}),
          thinkingLevel: env.CLASSIFY_THINKING_LEVEL || 'minimal',
        },
        fallback: {
          provider: fallbackProvider,
          model: fallbackModel,
          apiKey: keyFor(fallbackProvider),
          ...common,
          minimalThinking: true,
          thinkingLevel: 'minimal',
        },
      };
    }
    case 'clarify_writer': {
      // Writes the words of a clarifying question once the classifier has
      // decided a question is needed and which kind. The audit found Claude
      // Sonnet 5.5 writes the best questions (docs/2026-09-29-minddrop-model-audit.md);
      // it only runs for the few drops that need a question. Falls back to
      // the Mini tier model. CLARIFY_WRITER_PROVIDER / CLARIFY_WRITER_MODEL.
      const provider =
        env.CLARIFY_WRITER_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai');
      const model =
        env.CLARIFY_WRITER_MODEL ||
        (provider === 'anthropic'
          ? env.SONNET_MODEL || 'claude-sonnet-5-5'
          : provider === 'gemini'
            ? 'gemini-3.8-flash'
            : miniModel);
      const key =
        provider === 'anthropic'
          ? env.ANTHROPIC_API_KEY
          : provider === 'gemini'
            ? googleKey
            : env.OPENAI_API_KEY;
      return {
        primary: {
          provider,
          model,
          apiKey: key,
          responseFormat: 'json',
          maxOutputTokens: 600,
          temperature: 0,
          minimalThinking: true,
          cacheSystem: true,
        },
        fallback: {
          provider: 'openai',
          model: miniModel,
          apiKey: env.OPENAI_API_KEY,
          responseFormat: 'json',
          maxOutputTokens: 400,
          temperature: 0,
        },
      };
    }
    case 'second_opinion': {
      // Only used when SECOND_OPINION_MODEL is set: when the classifier wants
      // to ask, this model decides whether a question is really needed.
      const provider = env.SECOND_OPINION_PROVIDER || 'gemini';
      const key =
        provider === 'anthropic'
          ? env.ANTHROPIC_API_KEY
          : provider === 'gemini'
            ? googleKey
            : env.OPENAI_API_KEY;
      return {
        primary: {
          provider,
          model: env.SECOND_OPINION_MODEL,
          apiKey: key,
          responseFormat: 'json',
          maxOutputTokens: Number(env.CLASSIFY_MAX_OUTPUT_TOKENS) || 1500,
          temperature: 0,
          minimalThinking: true,
          thinkingLevel: env.SECOND_OPINION_THINKING_LEVEL || 'low',
          cacheSystem: true,
        },
        fallback: {
          provider: 'openai',
          model: miniModel,
          apiKey: env.OPENAI_API_KEY,
          responseFormat: 'json',
          maxOutputTokens: 700,
          temperature: 0,
        },
      };
    }
    default:
      throw new Error(`[aiProvider] Unknown tier: ${tier}`);
  }
}
