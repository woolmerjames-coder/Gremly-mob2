/**
 * Model calls for the context pipeline.
 *
 * One schema format is written once (lower-case JSON types, `nullable` for
 * optional values) and converted for each provider:
 *  - Google: responseSchema as is.
 *  - OpenAI: strict json_schema (every property required, nulls via type unions).
 *  - Anthropic: output_config.format json_schema, same strict shape as OpenAI.
 *
 * Each call returns parsed JSON or throws. Usage is logged by ../../shared/aiUsage.js.
 */

export const MODELS = {
  reader: { provider: 'openai', model: 'gpt-6-luna' },
  readerFallback: { provider: 'google', model: 'gemini-3.8-flash' },
  daily: { provider: 'google', model: 'gemini-3.8-flash' },
  dailyFallback: { provider: 'openai', model: 'gpt-6-luna' },
  rewrite: { provider: 'google', model: 'gemini-3.8-flash' },
  rewriteFallback: { provider: 'openai', model: 'gpt-6-luna' },
  weekly: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  // Daily brief in Chat: the brief sounds like chat Gremly; the plan picker is a cheap, careful pick
  brief: { provider: 'google', model: 'gemini-3.8-flash' },
  briefFallback: { provider: 'openai', model: 'gpt-6-luna' },
  planPick: { provider: 'openai', model: 'gpt-6-luna' },
  planPickFallback: { provider: 'google', model: 'gemini-3.8-flash' },
  // the day turn in today's thread: chosen on the replay suite (scripts/day-replay)
  dayTurn: { provider: 'openai', model: 'gpt-6-luna' },
  dayTurnFallback: { provider: 'google', model: 'gemini-3.8-flash' },
  // the weekly read (week/read.js): Luna at medium effort, chosen on the week replay (scripts/week-replay)
  weekRead: { provider: 'openai', model: 'gpt-6-luna' },
  weekReadFallback: { provider: 'google', model: 'gemini-3.8-flash' },
};

export function modelFor(env, job) {
  const base = MODELS[job];
  const override = env[`CONTEXT_MODEL_${job.toUpperCase()}`];
  if (!override) return base;
  const [provider, model] = override.includes(':')
    ? override.split(':')
    : [base.provider, override];
  return { provider, model };
}

// ── schema conversion ───────────────────────────────────────────────────────

function toOpenAI(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const { nullable, ...rest } = schema;
  let out = { ...rest };
  if (out.type === 'object') {
    const props = {};
    for (const [k, v] of Object.entries(out.properties || {})) props[k] = toOpenAI(v);
    out = {
      type: 'object',
      properties: props,
      required: Object.keys(props),
      additionalProperties: false,
    };
    if (rest.description) out.description = rest.description;
  } else if (out.type === 'array') {
    out = { ...out, items: toOpenAI(out.items) };
    delete out.minItems;
    delete out.maxItems;
  }
  delete out.format;
  if (nullable) {
    if (out.enum) out = { anyOf: [out, { type: 'null' }] };
    else out.type = [out.type, 'null'];
  }
  return out;
}

// Both OpenAI strict mode and Anthropic structured outputs want every object
// closed, every property listed as required, and nulls as type unions.
const toStrictSchema = toOpenAI;

// ── system prompts ──────────────────────────────────────────────────────────

/**
 * A system prompt is either a string or { fixed, varying }: the part that is
 * the same for everyone, then the part about this person or this day. Anthropic
 * caches the fixed part (cache reads cost a tenth of normal input), so it has
 * to come first and must not change between people. Other providers get the
 * two parts joined; OpenAI and Gemini cache a repeated start on their own.
 */
export function systemText(system) {
  if (typeof system === 'string') return system;
  return [system?.fixed, system?.varying].filter(Boolean).join('\n\n');
}

export function anthropicSystem(system) {
  if (typeof system === 'string' || !system?.fixed) return systemText(system);
  const blocks = [{ type: 'text', text: system.fixed, cache_control: { type: 'ephemeral' } }];
  if (system.varying) blocks.push({ type: 'text', text: system.varying });
  return blocks;
}

// ── single calls ────────────────────────────────────────────────────────────

function parseJsonText(text, label) {
  const t = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch (err) {
    throw new Error(
      `${label}: reply was not valid JSON (${err.message}); starts ${t.slice(0, 120)}`,
    );
  }
}

async function callOpenAI(env, { model, system, user, schema, maxTokens, effort }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemText(system) },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    reasoning_effort: effort || 'low',
    response_format: schema
      ? {
          type: 'json_schema',
          json_schema: { name: 'output', strict: true, schema: toOpenAI(schema) },
        }
      : { type: 'json_object' },
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${model} ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length')
    throw new Error(`OpenAI ${model}: reply cut off at ${maxTokens} tokens`);
  return parseJsonText(choice?.message?.content, `OpenAI ${model}`);
}

async function callGoogle(env, { model, system, user, schema, maxTokens, thinking }) {
  const generationConfig = {
    maxOutputTokens: maxTokens,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingLevel: thinking || 'low' },
  };
  if (schema) generationConfig.responseSchema = schema;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText(system) }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const cand = data.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS')
    throw new Error(`Gemini ${model}: reply cut off at ${maxTokens} tokens`);
  const out = (cand?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');
  return parseJsonText(out, `Gemini ${model}`);
}

/**
 * Claude Sonnet 5.5 rejects forced tool use and sampling parameters, so the
 * structured reply comes from output_config.format (a strict JSON schema).
 * Thinking stays at the model default (adaptive); max_tokens covers thinking
 * and the reply together.
 */
export function anthropicJsonParams({ model, system, user, schema, maxTokens, effort = 'medium' }) {
  return {
    model,
    max_tokens: maxTokens,
    system: anthropicSystem(system),
    messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema: toStrictSchema(schema) } },
  };
}

export function anthropicJsonResult(message) {
  if (message?.stop_reason === 'max_tokens')
    throw new Error('Anthropic reply cut off at max_tokens');
  if (message?.stop_reason === 'refusal') throw new Error('Anthropic declined the request');
  const text = (message?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) throw new Error('Anthropic reply had no text block');
  return parseJsonText(text, 'Anthropic');
}

async function callAnthropic(env, { model, system, user, schema, maxTokens, effort }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify(anthropicJsonParams({ model, system, user, schema, maxTokens, effort })),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${model} ${res.status}: ${text.slice(0, 300)}`);
  return anthropicJsonResult(JSON.parse(text));
}

/** One structured call; tries the fallback model once if the first fails. */
export async function jsonCall(
  env,
  { primary, fallback, system, user, schema, maxTokens = 4000, thinking, effort },
) {
  const attempt = (m) => {
    const args = { model: m.model, system, user, schema, maxTokens, thinking, effort };
    if (m.provider === 'openai') return callOpenAI(env, args);
    if (m.provider === 'google') return callGoogle(env, args);
    if (m.provider === 'anthropic') return callAnthropic(env, args);
    throw new Error(`Unknown provider ${m.provider}`);
  };
  try {
    return { output: await attempt(primary), model: primary.model };
  } catch (err) {
    if (!fallback) throw err;
    console.warn(`[context] ${primary.model} failed, trying ${fallback.model}: ${err.message}`);
    return {
      output: await attempt(fallback),
      model: fallback.model,
      fellBackFrom: String(err.message).slice(0, 200),
    };
  }
}

// ── Anthropic Message Batches ───────────────────────────────────────────────

function anthropicHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

export async function createBatch(env, requests) {
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify({ requests }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Batch create ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function getBatch(env, id) {
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, {
    headers: anthropicHeaders(env),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Batch get ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function getBatchResults(env, id) {
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}/results`, {
    headers: anthropicHeaders(env),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Batch results ${res.status}: ${text.slice(0, 300)}`);
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
