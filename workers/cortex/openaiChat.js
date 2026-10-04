// ============================================================================
// openaiChat.js: a chat reply from an OpenAI model, in Gemini's shapes.
//
// The chat surfaces were written against Gemini: they read Gemini's stream,
// build Gemini contents for a web search follow up, and log Gemini usage.
// geminiStream and geminiGenerate hand an OpenAI model's call to this file,
// which sends it to OpenAI's Responses API and gives back those same shapes,
// so a surface moves to an OpenAI writer with a config change (CHAT_MODEL_ASK
// for Ask Gremly) and none of its reading code changes.
//
// Nothing is stored at OpenAI (store: false). How much the model thinks comes
// from config.effort. Temperature is not sent, as in the writer test that chose
// the model (scripts/writer-test). Gemini's own search and maps tools have no
// OpenAI form here and are left out; function tools such as web_search carry over.
//
// Every call goes through fetch, so ai_usage logs it (workers/shared/aiUsage.js).
// ============================================================================

import { withAiStep } from '../shared/aiUsage.js';

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** Which API a chat model is served by. */
export function chatProvider(model) {
  if (/^gemini/i.test(model || '')) return 'google';
  if (/^claude/i.test(model || '')) return 'anthropic';
  return 'openai';
}

function textOf(parts) {
  return parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
}

/**
 * Gemini contents to Responses input. A function call or result that came
 * without an id is paired with the other by order.
 */
export function responsesInputFrom(contents) {
  const out = [];
  const unanswered = [];
  let made = 0;
  for (const c of contents || []) {
    const parts = Array.isArray(c.parts) ? c.parts : [];
    const text = textOf(parts);
    if (c.role === 'model') {
      if (text) out.push({ role: 'assistant', content: text });
      for (const p of parts) {
        if (!p.functionCall) continue;
        let id = p.functionCall.id;
        if (!id) {
          id = `call_${made++}`;
          unanswered.push(id);
        }
        out.push({
          type: 'function_call',
          call_id: id,
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args || {}),
        });
      }
    } else {
      if (text) out.push({ role: 'user', content: text });
      for (const p of parts) {
        if (!p.functionResponse) continue;
        out.push({
          type: 'function_call_output',
          call_id: p.functionResponse.id || unanswered.shift() || `call_${made++}`,
          output: JSON.stringify(p.functionResponse.response ?? {}),
        });
      }
    }
  }
  return out;
}

function responsesTools(tools) {
  return (tools || [])
    .filter((t) => t && t.function)
    .map((t) => ({
      type: 'function',
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
      strict: false,
    }));
}

/** The Responses request for one chat call. */
export function responsesBody(systemPrompt, contents, config, stream) {
  const effort = config.effort || 'none';
  const body = {
    model: config.model,
    input: responsesInputFrom(contents),
    reasoning: { effort },
    store: false,
  };
  if (systemPrompt) body.instructions = systemPrompt;
  // thinking counts against the cap, so a model that thinks gets room above
  // the cap the surface meant for the reply itself
  if (config.maxOutputTokens)
    body.max_output_tokens = config.maxOutputTokens + (effort === 'none' ? 0 : 2000);
  // one person's turns share a cache key, so the rules at the top of the
  // instructions are read from OpenAI's cache rather than paid for again
  if (config.cacheKey) body.prompt_cache_key = config.cacheKey;
  const tools = responsesTools(config.tools);
  if (tools.length) body.tools = tools;
  if (config.responseMimeType === 'application/json')
    body.text = { format: { type: 'json_object' } };
  if (stream) body.stream = true;
  return body;
}

/** OpenAI usage as Gemini's usageMetadata. */
export function geminiUsageFrom(u) {
  if (!u) return null;
  const thinking = u.output_tokens_details?.reasoning_tokens || 0;
  return {
    promptTokenCount: u.input_tokens || 0,
    cachedContentTokenCount: u.input_tokens_details?.cached_tokens || 0,
    candidatesTokenCount: Math.max((u.output_tokens || 0) - thinking, 0),
    thoughtsTokenCount: thinking,
  };
}

function functionCallPart(item) {
  let args = {};
  try {
    args = JSON.parse(item.arguments || '{}');
  } catch {
    args = {};
  }
  return { functionCall: { name: item.name, args, id: item.call_id } };
}

/**
 * An OpenAI Responses event stream as a Gemini SSE stream: each text delta
 * becomes a chunk with one text part, each finished function call a chunk with
 * one functionCall part (its call_id as the id), and the final usage a chunk
 * with usageMetadata.
 * @param {ReadableStream<Uint8Array>} body
 * @param {(line: string, data: object) => void} [log] defaults to console.log
 */
export function geminiShapedStream(body, log = (line, data) => console.log(line, data)) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';
  const emit = (controller, obj) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
  const handle = (controller, line) => {
    const s = line.trim();
    if (!s.startsWith('data:')) return;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let ev;
    try {
      ev = JSON.parse(payload);
    } catch {
      return;
    }
    if (ev.type === 'response.output_text.delta' && ev.delta) {
      emit(controller, {
        candidates: [{ content: { role: 'model', parts: [{ text: ev.delta }] } }],
      });
    } else if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call') {
      emit(controller, {
        candidates: [{ content: { role: 'model', parts: [functionCallPart(ev.item)] } }],
      });
    } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
      const usage = geminiUsageFrom(ev.response?.usage);
      if (usage) emit(controller, { usageMetadata: usage, modelVersion: ev.response?.model });
      if (ev.type === 'response.incomplete')
        log('[OpenAIChat] reply cut short', { reason: ev.response?.incomplete_details?.reason });
    } else if (ev.type === 'response.failed' || ev.type === 'error') {
      log('[OpenAIChat] stream failed', {
        error: String(ev.response?.error?.message || ev.message || ev.error?.message || '').slice(
          0,
          300,
        ),
      });
    }
  };
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) handle(controller, line);
      },
      flush(controller) {
        buf += dec.decode();
        for (const line of buf.split(/\r?\n/)) handle(controller, line);
      },
    }),
  );
}

async function post(body, apiKey) {
  // Logged to ai_usage as <route>/reply, unless a helper job already named it.
  return withAiStep(
    'reply',
    () =>
      fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { keep: true },
  );
}

/**
 * Streaming chat call, answered as a Gemini SSE Response.
 * @returns {Promise<Response|{ok: false, status: number, error: string}>}
 */
export async function openaiStream(systemPrompt, contents, config, apiKey) {
  if (!apiKey) return { ok: false, status: 0, error: 'no OpenAI key' };
  let res;
  try {
    res = await post(responsesBody(systemPrompt, contents, config, true), apiKey);
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return { ok: false, status: res.status, error: errText };
  }
  if (!res.body) return { ok: false, status: res.status, error: 'no stream' };
  return new Response(geminiShapedStream(res.body), {
    status: res.status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * Non streaming chat call, answered in geminiGenerate's shape.
 */
export async function openaiGenerate(systemPrompt, contents, config, apiKey) {
  const failed = (error, status) => ({
    ok: false,
    content: '',
    functionCalls: [],
    parts: [],
    usage: {},
    error,
    ...(status ? { status } : {}),
  });
  if (!apiKey) return failed('no OpenAI key');
  let res;
  try {
    res = await post(responsesBody(systemPrompt, contents, config, false), apiKey);
  } catch (err) {
    return failed(err.message);
  }
  if (!res.ok) return failed(await res.text().catch(() => 'unknown error'), res.status);
  const json = await res.json();
  const items = Array.isArray(json?.output) ? json.output : [];
  const content = items
    .filter((i) => i.type === 'message')
    .flatMap((i) => (Array.isArray(i.content) ? i.content : []))
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  const callParts = items.filter((i) => i.type === 'function_call' && i.name).map(functionCallPart);
  const parts = [...(content ? [{ text: content }] : []), ...callParts];
  return {
    ok: true,
    content,
    functionCalls: callParts.map((p) => ({ ...p.functionCall, thoughtSignature: undefined })),
    parts,
    usage: geminiUsageFrom(json?.usage) || {},
    groundingMetadata: null,
  };
}
