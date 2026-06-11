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

async function callOpenAI(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxOutputTokens ?? 500,
  };

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
    },
    config.apiKey,
  );

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
    system: systemPrompt,
    messages: mappedMessages,
  };

  if (config.temperature !== undefined) {
    body.temperature = config.temperature;
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

// ── Exported Functions ──

async function _attemptFallbackNonStream(config, t0, reason) {
  const fallbackResult = await callProviderNonStream(
    config.fallback.provider,
    config.systemPrompt,
    config.messages,
    config.fallback,
    null, // no timeout on fallback
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

    const fallbackResult = await callProviderNonStream(
      config.fallback.provider,
      config.systemPrompt,
      config.messages,
      config.fallback,
      null,
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

  if (config.mode === 'realtime') {
    const controller = new AbortController();
    signal = controller.signal;
    timeout = setTimeout(() => controller.abort(), TIMEOUT.nonStreaming);
  }

  const primaryResult = await callProviderNonStream(
    config.primary.provider,
    config.systemPrompt,
    config.messages,
    config.primary,
    signal,
  );

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
  switch (tier) {
    case 'nano':
      return {
        primary: {
          provider: 'openai',
          model: 'gpt-4.1-nano',
          apiKey: env.OPENAI_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: 'gemini-3-flash-preview',
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: 'minimal',
        },
      };
    case 'mini':
      return {
        primary: {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          apiKey: env.OPENAI_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: 'gemini-3-flash-preview',
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: 'none',
        },
      };
    case 'chat':
      return {
        primary: {
          provider: 'gemini',
          model: 'gemini-3-flash-preview',
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: 'low',
        },
        fallback: {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          apiKey: env.OPENAI_API_KEY,
        },
      };
    case 'haiku':
      return {
        primary: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          apiKey: env.ANTHROPIC_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: 'gemini-3.1-flash-lite-preview',
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: 'low',
        },
      };
    case 'sonnet':
      return {
        primary: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          apiKey: env.ANTHROPIC_API_KEY,
        },
        fallback: {
          provider: 'gemini',
          model: 'gemini-3-flash-preview',
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: 'medium',
        },
      };
    default:
      throw new Error(`[aiProvider] Unknown tier: ${tier}`);
  }
}
