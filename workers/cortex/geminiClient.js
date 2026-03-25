// ============================================================================
// geminiClient.js — Native Gemini API client for Cortex Proxy Worker
// ============================================================================

export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── Thinking level mapping ──────────────────────────────────────────────────

const THINKING_LEVEL_MAP = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  none: 'none',
  minimal: 'minimal',
};

function resolveThinkingLevel(level) {
  if (!level) return 'low';
  const mapped = THINKING_LEVEL_MAP[level.toLowerCase()];
  return mapped || 'low';
}

// ── Internal helpers ────────────────────────────────────────────────────────

export function convertMessages(messages) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

function convertTools(tools) {
  if (!tools || tools.length === 0) return undefined;

  const result = [];
  const functionDeclarations = [];

  for (const tool of tools) {
    if (tool.googleSearch !== undefined) {
      result.push({ googleSearch: tool.googleSearch });
    } else if (tool.googleMaps !== undefined) {
      result.push({ googleMaps: tool.googleMaps });
    } else if (tool.function) {
      functionDeclarations.push({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      });
    }
  }

  if (functionDeclarations.length > 0) {
    result.push({ functionDeclarations });
  }

  return result.length > 0 ? result : undefined;
}

function buildRequestBody(systemPrompt, contents, config) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      thinkingConfig: { thinkingLevel: resolveThinkingLevel(config.thinkingLevel) },
    },
  };
  const nativeTools = convertTools(config.tools);
  if (nativeTools) body.tools = nativeTools;
  return body;
}

// ── Exported functions ──────────────────────────────────────────────────────

/**
 * Non-streaming call to Gemini's native generateContent endpoint.
 * @param {string} systemPrompt - System instruction text
 * @param {Array<{role: string, content: string}>} messages - Conversation history (OpenAI format)
 * @param {{temperature?: number, maxOutputTokens?: number, thinkingLevel?: string, tools?: Array, model?: string}} config
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{ok: boolean, content: string, functionCalls: Array, parts: Array, usage: object, error?: string, status?: number}>}
 */
export async function geminiGenerate(systemPrompt, messages, config, apiKey) {
  const model = config.model || GEMINI_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent`;
  const contents = config.nativeContents || convertMessages(messages);
  const body = buildRequestBody(systemPrompt, contents, config);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, content: '', functionCalls: [], parts: [], usage: {}, error: err.message };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return {
      ok: false,
      content: '',
      functionCalls: [],
      parts: [],
      usage: {},
      error: errText,
      status: res.status,
    };
  }

  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];

  let content = '';
  const functionCalls = [];
  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
        id: part.functionCall.id,
        thoughtSignature: part.thoughtSignature,
      });
    }
  }

  const groundingMetadata = json.candidates?.[0]?.groundingMetadata || null;

  return {
    ok: true,
    content,
    functionCalls,
    parts,
    usage: json.usageMetadata || {},
    groundingMetadata,
  };
}

/**
 * Streaming call to Gemini's native streamGenerateContent endpoint.
 * Returns the raw Response on success so the caller can read the SSE stream.
 * @param {string} systemPrompt - System instruction text
 * @param {Array<{role: string, content: string}>} messages - Conversation history (OpenAI format)
 * @param {{temperature?: number, maxOutputTokens?: number, thinkingLevel?: string, tools?: Array, model?: string}} config
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Response|{ok: false, status: number, error: string}>}
 */
export async function geminiStream(systemPrompt, messages, config, apiKey) {
  const model = config.model || GEMINI_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
  const contents = config.nativeContents || convertMessages(messages);
  const body = buildRequestBody(systemPrompt, contents, config);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return { ok: false, status: res.status, error: errText };
  }

  return res;
}

/**
 * Parse a single SSE data line from a Gemini streaming response.
 * @param {string} jsonStr - Raw JSON string after stripping "data: " prefix
 * @returns {{text: string|null, functionCalls: Array|null, thoughtSignature: string|null, done: boolean}}
 */
export function parseGeminiChunk(jsonStr) {
  const empty = {
    text: null,
    functionCalls: null,
    thoughtSignature: null,
    groundingMetadata: null,
    done: false,
  };

  if (!jsonStr || jsonStr === '[DONE]') {
    return {
      text: null,
      functionCalls: null,
      thoughtSignature: null,
      groundingMetadata: null,
      done: true,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return empty;
  }

  const parts = parsed.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return empty;

  let text = null;
  let functionCalls = null;
  let thoughtSignature = null;

  for (const part of parts) {
    if (part.text) {
      text = (text || '') + part.text;
    }
    if (part.functionCall) {
      if (!functionCalls) functionCalls = [];
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
        id: part.functionCall.id,
        thoughtSignature: part.thoughtSignature,
      });
    }
    if (part.thoughtSignature) {
      thoughtSignature = part.thoughtSignature;
    }
  }

  const groundingMetadata = parsed.candidates?.[0]?.groundingMetadata || null;

  return { text, functionCalls, thoughtSignature, groundingMetadata, done: false };
}

/**
 * Build the contents array for a tool-call follow-up request.
 * Preserves thoughtSignature on model response parts for correct multi-turn tool use.
 * @param {Array} originalContents - Contents array from the original request (native format)
 * @param {Array} modelResponseParts - Raw parts array from the model's function-call response
 * @param {Array<{name: string, id: string, response: object}>} functionResults - Tool execution results
 * @returns {Array} Native contents array for the follow-up request
 */
export function buildFollowUpContents(originalContents, modelResponseParts, functionResults) {
  return [
    ...originalContents,
    { role: 'model', parts: modelResponseParts },
    {
      role: 'user',
      parts: functionResults.map((fr) => ({
        functionResponse: { name: fr.name, response: fr.response, id: fr.id },
      })),
    },
  ];
}
