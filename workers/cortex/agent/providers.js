// ============================================================================
// providers.js: one model call with tools, the same way for Gemini and for
// OpenAI, so the agent's loop (run.js) never sees a provider's own shapes.
//
// The loop keeps the conversation as turns:
//   { role: 'user', text }
//   { role: 'assistant', text, calls: [{ id, nativeId, name, args }], raw, provider }
//     (provider: 'google', 'openai' for chat completions, 'openai-responses')
//   { role: 'tool', results: [{ id, nativeId, name, text }] }
// raw is the provider's own reply, sent back unchanged on the next step: for
// Gemini that keeps each function call's thought signature, which Gemini 3
// requires to carry on a multi-step call.
//
// Every call goes through fetch, so ai_usage logs it (workers/shared/aiUsage.js).
// ============================================================================

import { GEMINI_API_BASE } from '../geminiClient.js';
import { isOpenAIReasoningModel } from '../aiProvider.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
// OpenAI's reasoning models take function tools only on the Responses API
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function providerOf(model) {
  if (/^gemini/i.test(model || '')) return 'google';
  if (/^claude/i.test(model || '')) return 'anthropic';
  return 'openai';
}

// ── Gemini ──────────────────────────────────────────────────────────────────

export function geminiContents(turns) {
  const out = [];
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', parts: [{ text: t.text }] });
    } else if (t.role === 'assistant') {
      const parts =
        t.provider === 'google' && Array.isArray(t.raw)
          ? t.raw
          : [
              ...(t.text ? [{ text: t.text }] : []),
              ...(t.calls || []).map((c) => ({
                functionCall: { name: c.name, args: c.args || {} },
              })),
            ];
      if (parts.length) out.push({ role: 'model', parts });
    } else if (t.role === 'tool') {
      out.push({
        role: 'user',
        parts: t.results.map((r) => ({
          functionResponse: {
            name: r.name,
            ...(r.nativeId ? { id: r.nativeId } : {}),
            response: { result: r.text },
          },
        })),
      });
    }
  }
  return out;
}

export function readGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  const calls = parts
    .filter((p) => p.functionCall?.name)
    .map((p, i) => ({
      id: p.functionCall.id || `g${i + 1}`,
      nativeId: p.functionCall.id || null,
      name: p.functionCall.name,
      args: p.functionCall.args || {},
    }));
  return { text, calls, raw: parts, finish: json?.candidates?.[0]?.finishReason || null };
}

async function callGemini({ model, system, turns, tools, final, key, thinking, maxOutputTokens }) {
  const body = {
    contents: geminiContents(turns),
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: thinking } },
  };
  if (tools.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: final ? 'NONE' : 'AUTO' } };
  }
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (await res.text().catch(() => '')).slice(0, 300),
    };
  }
  return { ok: true, provider: 'google', ...readGemini(await res.json()) };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

export function openaiMessages(system, turns) {
  const out = [{ role: 'system', content: system }];
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.text });
    } else if (t.role === 'assistant') {
      if (t.provider === 'openai' && t.raw) {
        out.push(t.raw);
      } else {
        out.push({
          role: 'assistant',
          content: t.text || null,
          ...(t.calls?.length
            ? {
                tool_calls: t.calls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: JSON.stringify(c.args || {}) },
                })),
              }
            : {}),
        });
      }
    } else if (t.role === 'tool') {
      for (const r of t.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.text });
    }
  }
  return out;
}

export function readOpenAI(json) {
  const msg = json?.choices?.[0]?.message || {};
  const calls = (msg.tool_calls || [])
    .filter((c) => c?.function?.name)
    .map((c) => {
      let args = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {
        args = {};
      }
      return { id: c.id, nativeId: c.id, name: c.function.name, args };
    });
  const raw = {
    role: 'assistant',
    content: msg.content ?? null,
    ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
  };
  return { text: msg.content || '', calls, raw, finish: json?.choices?.[0]?.finish_reason || null };
}

async function callOpenAI({ model, system, turns, tools, final, key, thinking, maxOutputTokens }) {
  const body = {
    model,
    messages: openaiMessages(system, turns),
    max_completion_tokens: maxOutputTokens,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: t }));
    body.tool_choice = final ? 'none' : 'auto';
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (await res.text().catch(() => '')).slice(0, 300),
    };
  }
  return { ok: true, provider: 'openai', ...readOpenAI(await res.json()) };
}

// ── OpenAI reasoning models: the Responses API ──────────────────────────────
// Nothing is stored at OpenAI (store: false), so every output item of a step,
// its reasoning included, goes back in the next step's input as it came.

export function responsesInput(turns) {
  const out = [];
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.text });
    } else if (t.role === 'assistant') {
      if (t.provider === 'openai-responses' && Array.isArray(t.raw)) {
        out.push(...t.raw);
      } else {
        if (t.text) out.push({ role: 'assistant', content: t.text });
        for (const c of t.calls || []) {
          out.push({
            type: 'function_call',
            call_id: c.id,
            name: c.name,
            arguments: JSON.stringify(c.args || {}),
          });
        }
      }
    } else if (t.role === 'tool') {
      for (const r of t.results)
        out.push({ type: 'function_call_output', call_id: r.id, output: r.text });
    }
  }
  return out;
}

export function readResponses(json) {
  const items = Array.isArray(json?.output) ? json.output : [];
  const text = items
    .filter((i) => i.type === 'message')
    .flatMap((i) => (Array.isArray(i.content) ? i.content : []))
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  const calls = items
    .filter((i) => i.type === 'function_call' && i.name)
    .map((i) => {
      let args = {};
      try {
        args = JSON.parse(i.arguments || '{}');
      } catch {
        args = {};
      }
      return { id: i.call_id, nativeId: i.call_id, name: i.name, args };
    });
  return { text, calls, raw: items, finish: json?.status || null };
}

async function callResponses({
  model,
  system,
  turns,
  tools,
  final,
  key,
  thinking,
  maxOutputTokens,
  cacheKey,
}) {
  const body = {
    model,
    instructions: system,
    input: responsesInput(turns),
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: thinking },
    store: false,
    include: ['reasoning.encrypted_content'],
  };
  // one person's turns on one surface share a cache key, so each message
  // reuses the cached rules rather than paying for them again (prompt.js
  // keeps what changes between messages at the end)
  if (cacheKey) body.prompt_cache_key = cacheKey;
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }));
    body.tool_choice = final ? 'none' : 'auto';
  }
  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (await res.text().catch(() => '')).slice(0, 300),
    };
  }
  return { ok: true, provider: 'openai-responses', ...readResponses(await res.json()) };
}

// ── One call ────────────────────────────────────────────────────────────────

/**
 * One step of the loop.
 * @param {{model: string, system: string, turns: object[], tools: object[], final?: boolean,
 *   keys: {google?: string, openai?: string}, thinking?: string, maxOutputTokens?: number}} p
 * @returns {Promise<{ok: true, provider: string, text: string, calls: object[], raw: any, finish: string|null}
 *   | {ok: false, status?: number, error: string}>}
 */
export async function callModel(p) {
  const provider = providerOf(p.model);
  const args = {
    ...p,
    final: !!p.final,
    thinking: p.thinking || 'low',
    maxOutputTokens: p.maxOutputTokens || 4096,
  };
  try {
    if (provider === 'google') {
      if (!p.keys?.google) return { ok: false, error: 'no Google key' };
      return await callGemini({ ...args, key: p.keys.google });
    }
    if (provider === 'openai') {
      if (!p.keys?.openai) return { ok: false, error: 'no OpenAI key' };
      if (isOpenAIReasoningModel(p.model))
        return await callResponses({ ...args, key: p.keys.openai });
      return await callOpenAI({ ...args, key: p.keys.openai });
    }
    return { ok: false, error: `the agent has no ${provider} client yet` };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 300) };
  }
}
