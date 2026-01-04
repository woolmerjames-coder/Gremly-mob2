// lib/cortex/CortexClient.ts
// Typed client for Supabase Edge Function cortex-proxy
// NO OpenAI keys in client code
import { env, getEnv } from '../env';
import EventSource from 'react-native-sse';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const toMs = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : 12000);

const log = (...a: any[]) => {
  if (__DEV__) console.log('[CORTEX]', ...a);
};
export type CortexClientResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export interface StreamingEvent {
  delta?: string;
  done: boolean;
  full_content?: string;
  error?: string;
}

export interface StreamingCallbacks {
  onChunk: (text: string, fullTextSoFar: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string, partialText: string) => void;
}

export interface Phase2StreamingCallbacks {
  onField: (field: string, value: any) => void;
  onComplete: (result: Phase2EnrichmentResult) => void;
  onError: (error: string) => void;
}

export interface Phase2EnrichmentResult {
  smart_title?: string;
  confirmation_message?: string;
  tags?: string[];
  time_estimate_minutes?: number | null;
  time_window?: 'morning' | 'day' | 'evening' | null;
  extracted_date?: string | null;
  extracted_start_date?: string | null;
  extracted_frequency?: string | null;
  people?: string[];
  latency_ms?: number;
}

const mask = (value: string) => (value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '(missing)');

let warnedMissingAnon = false;
let warnedAiDisabled = false;
let inFlight = false; // Single-flight dedupe

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const isAiDisabled = (): boolean => {
  const raw =
    safeGetEnv?.('EXPO_PUBLIC_DISABLE_AI') ??
    process.env.EXPO_PUBLIC_DISABLE_AI ??
    process.env.REACT_NATIVE_DISABLE_AI ??
    '';
  const normalized = raw.toString().toLowerCase();
  return normalized === 'on' || normalized === 'true';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;

  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

async function postJSON<T>(body: any, options?: { raw?: boolean }): Promise<CortexClientResult<T>> {
  // Single-flight dedupe: reject if already in-flight
  if (inFlight) {
    log('BUSY', 'Request already in-flight');
    return { ok: false, error: 'busy' };
  }

  if (isAiDisabled()) {
    if (!warnedAiDisabled) {
      console.warn('[CORTEX] Disabled via EXPO_PUBLIC_DISABLE_AI; skipping request.');
      warnedAiDisabled = true;
    }
    return { ok: false, error: '[cortex] disabled via EXPO_PUBLIC_DISABLE_AI' };
  }

  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    const message = '[cortex] Missing EXPO_PUBLIC_CORTEX_URL';
    log('CONFIG_MISSING', message);
    return { ok: false, error: message };
  }

  // Mark as in-flight
  inFlight = true;

  // AbortController with hard timeout
  const timeoutMs = toMs(env.cortex.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    log('TIMEOUT', `Aborting after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();

  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  } else if (!warnedMissingAnon) {
    console.warn(
      '[CORTEX] Warning: EXPO_PUBLIC_SUPABASE_ANON_KEY is missing; proceeding without Authorization header.',
    );
    warnedMissingAnon = true;
  }

  log('AUTH_HEADER', mask(supabaseAnonKey));

  try {
    log('POST', baseUrl, {
      type: body?.type,
      model: body?.model,
      timeoutMs,
    });

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    log('STATUS', res.status);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      log('ERROR_RESPONSE', res.status, txt);
      const message = `[cortex] ${res.status} ${txt || 'Unknown error'}`;
      return { ok: false, error: message, status: res.status };
    }

    // Parse response text with fallback to passthrough
    const text = await res.text();
    log('RAW_RESPONSE_LENGTH', text.length);

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
      log('FULL_RESPONSE_DATA', JSON.stringify(data));
      log('PARSED_RESPONSE', {
        hasChoices: Array.isArray(data?.choices),
        choicesCount: data?.choices?.length || 0,
        hasId: !!data?.id,
        hasContent: !!data?.content,
        dataKeys: Object.keys(data || {}),
      });
    } catch {
      log('JSON_PARSE_FAILED', 'Using passthrough');
      data = { passthrough: text };
    }

    if (options?.raw) {
      log('RAW_MODE', 'Returning un-normalized payload');
      return { ok: true, data };
    }

    // Normalize multiple response shapes
    function normalize(
      d: any,
    ):
      | { ok: true; id: string; content: string; model?: any; usage?: any }
      | { ok: false; error: string } {
      if (!d || typeof d !== 'object') return { ok: false, error: 'empty_response' };

      // Shape D: wrapped error
      if (d.error) {
        return { ok: false, error: String(d.error || d.detail || 'proxy_error') };
      }

      // Shape A: Supabase-style { id, content, model?, usage? }
      if (d.content && d.id) {
        return {
          ok: true,
          id: String(d.id),
          content: String(d.content),
          model: d.model,
          usage: d.usage,
        };
      }

      // Shape B/C: OpenAI chat or legacy completion
      const msg = d?.choices?.[0]?.message?.content ?? d?.choices?.[0]?.text;
      if (msg) {
        return {
          ok: true,
          id: String(d.id || 'cmpl-' + Math.random().toString(36).slice(2)),
          content: String(msg),
          model: d.model,
          usage: d.usage,
        };
      }

      // Shape E: passthrough text
      if (d.passthrough) {
        return {
          ok: true,
          id: 'cmpl-' + Math.random().toString(36).slice(2),
          content: String(d.passthrough),
          model: undefined,
          usage: undefined,
        };
      }

      return { ok: false, error: 'unrecognized_response' };
    }

    const norm = normalize(data);
    if (!norm.ok) {
      console.warn('[CORTEX] proxy normalize fail', { status: res.status, data });
      return { ok: false, error: norm.error };
    }

    log('OK', norm.id, {
      contentLength: norm.content?.length || 0,
      hasModel: !!norm.model,
      hasUsage: !!norm.usage,
    });
    if (__DEV__)
      console.log('[CORTEX][Client] content preview', String(norm.content || '').slice(0, 200));
    return {
      ok: true,
      data: {
        id: norm.id,
        content: norm.content,
        model: norm.model,
        usage: norm.usage,
      } as T,
    };
  } catch (e: any) {
    // Handle timeout specifically
    if (e?.name === 'AbortError') {
      log('ABORTED', 'Request timed out');
      return { ok: false, error: 'timeout' };
    }
    const message = e?.message || String(e);
    log('EXCEPTION', message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
    inFlight = false; // Release lock
  }
}

export async function callChat(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    spaceId?: string | null;
    chatId?: string | null;
    lane?: string;
  },
) {
  const defaultModel = opts?.model ?? safeGetEnv?.('EXPO_PUBLIC_CORTEX_MODEL') ?? env.cortex.model;

  return postJSON(
    {
      type: 'chat',
      model: defaultModel,
      messages,
      temperature: 0,
      max_tokens: opts?.maxTokens ?? 400,
      response_format: { type: 'json_object' },
      spaceId: opts?.spaceId ?? undefined,
      space_id: opts?.spaceId ?? undefined, // duplicate for worker/backward compat
      chatId: opts?.chatId ?? undefined,
      lane: opts?.lane ?? undefined,
    },
    { raw: true },
  );
}

/**
 * Call the Cortex proxy for Space Chat conversations.
 * Uses GPT-5.1 via the space_chat lane with conversational settings.
 *
 * @param messages - The conversation messages
 * @param opts - Options including spaceId, chatId, and optional system prompt override
 * @returns The AI response
 */
export async function callSpaceChat(
  messages: ChatMessage[],
  opts: {
    spaceId: string;
    chatId: string;
    systemPrompt?: string;
  },
) {
  // Build messages array with system prompt if provided
  const allMessages: ChatMessage[] = opts.systemPrompt
    ? [{ role: 'system', content: opts.systemPrompt }, ...messages]
    : messages;

  return postJSON(
    {
      type: 'chat',
      model: 'gpt-4o', // GPT-4o for conversational Space Chat
      messages: allMessages,
      temperature: 0.7,
      max_completion_tokens: 400,
      lane: 'space_chat', // Critical: tells worker to use GPT-4o
      spaceId: opts.spaceId,
      space_id: opts.spaceId,
      chatId: opts.chatId,
    },
    { raw: true },
  );
}

/**
 * Call the Cortex proxy for Space Chat with streaming support using EventSource (SSE).
 * Returns an object with a close() method to cancel the request.
 *
 * @param messages - The conversation messages
 * @param opts - Options including spaceId, chatId, and optional system prompt override
 * @param callbacks - Callbacks for streaming events (onChunk, onComplete, onError)
 * @returns Object with close() method to cancel the stream
 */
export function callSpaceChatStreaming(
  messages: ChatMessage[],
  opts: { spaceId: string; chatId: string; systemPrompt?: string },
  callbacks: StreamingCallbacks,
): { close: () => void } {
  const baseUrl = readCortexUrl();
  if (!baseUrl) {
    callbacks.onError('Missing CORTEX_URL', '');
    return { close: () => {} };
  }
  if (isAiDisabled()) {
    callbacks.onError('AI disabled', '');
    return { close: () => {} };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();
  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  const allMessages: ChatMessage[] = opts.systemPrompt
    ? [{ role: 'system', content: opts.systemPrompt }, ...messages]
    : messages;

  let fullText = '';

  const es = new EventSource(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'chat',
      model: 'gpt-4o',
      messages: allMessages,
      temperature: 0.7,
      max_completion_tokens: 400,
      lane: 'space_chat',
      stream: true,
      spaceId: opts.spaceId,
      chatId: opts.chatId,
    }),
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        callbacks.onError(data.error, fullText);
        es.close();
        return;
      }
      if (data.delta) {
        fullText += data.delta;
        callbacks.onChunk(data.delta, fullText);
      }
      if (data.done) {
        callbacks.onComplete(data.full_content || fullText);
        es.close();
      }
    } catch {
      // Ignore parse errors
    }
  });

  es.addEventListener('error', (event: any) => {
    callbacks.onError(event.message || 'Stream error', fullText);
    es.close();
  });

  return { close: () => es.close() };
}

export async function callComplete(
  prompt: string,
  opts?: { model?: string; temperature?: number; maxTokens?: number },
) {
  return postJSON({
    type: 'complete',
    model: opts?.model ?? env.cortex.model,
    prompt,
    temperature: opts?.temperature ?? 0.2,
    max_tokens: opts?.maxTokens ?? 400,
  });
}

export type ClassificationResult = {
  category: string;
  tags: string[];
  spaceName: string | null;
  confidence: number;
  title: string | null;
};

export type CallClassifyResult =
  | {
      ok: true;
      id: string;
      classification: ClassificationResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function callClassify(opts: {
  text?: string;
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string;
  timeoutMs?: number;
}): Promise<CallClassifyResult> {
  // Single-flight dedupe: reject if already in-flight
  if (inFlight) {
    log('BUSY', 'Request already in-flight');
    return { ok: false, error: 'busy' };
  }

  if (isAiDisabled()) {
    if (!warnedAiDisabled) {
      console.warn('[CORTEX] Disabled via EXPO_PUBLIC_DISABLE_AI; skipping request.');
      warnedAiDisabled = true;
    }
    return { ok: false, error: '[cortex] disabled via EXPO_PUBLIC_DISABLE_AI' };
  }

  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    const message = '[cortex] Missing EXPO_PUBLIC_CORTEX_URL';
    log('CONFIG_MISSING', message);
    return { ok: false, error: message };
  }

  // Mark as in-flight
  inFlight = true;

  // AbortController with hard timeout
  const timeoutMs = toMs(opts.timeoutMs ?? env.cortex.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    log('TIMEOUT', `Aborting after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();

  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  } else if (!warnedMissingAnon) {
    console.warn(
      '[CORTEX] Warning: EXPO_PUBLIC_SUPABASE_ANON_KEY is missing; proceeding without Authorization header.',
    );
    warnedMissingAnon = true;
  }

  log('AUTH_HEADER', mask(supabaseAnonKey));

  const requestBody = {
    type: 'classify',
    model: opts.model ?? env.cortex.model,
    timeoutMs,
    text: opts.text,
    messages: opts.messages,
  };

  try {
    log('POST', baseUrl, {
      type: requestBody.type,
      model: requestBody.model,
      timeoutMs,
    });

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    log('STATUS', res.status);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const message = `[cortex] ${res.status} ${txt || 'Unknown error'}`;
      return { ok: false, error: message };
    }

    // Parse response text
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: 'invalid_json_response' };
    }

    // Handle error response
    if (data.error) {
      return { ok: false, error: String(data.error || data.detail || 'proxy_error') };
    }

    // Unwrap nested data structure if present
    // Some response formats wrap the classification in { data: { ... }, status: 200 }
    const responseData = data.data && typeof data.data === 'object' ? data.data : data;

    // Primary format: Cloudflare Worker response
    // { id: "cmpl-...", classification: { category, tags, spaceName, confidence, title } }
    // Also handles wrapped format: { data: { id, classification, aiTitle, aiTagsDebug }, status: 200 }
    // Note: classification may have 'bucket' instead of 'category' - accept either
    if (responseData.id && responseData.classification) {
      const classification = responseData.classification;

      // Extract category from either 'category' or 'bucket' field
      const category =
        typeof classification.category === 'string'
          ? classification.category
          : typeof classification.bucket === 'string'
            ? classification.bucket
            : null;

      // Validate classification structure (category can come from either field)
      if (
        typeof classification === 'object' &&
        category !== null &&
        Array.isArray(classification.tags) &&
        (classification.spaceName === null ||
          classification.spaceName === undefined ||
          typeof classification.spaceName === 'string') &&
        typeof classification.confidence === 'number'
      ) {
        // Parse title field: prefer aiTitle from response, fallback to classification.title
        const title =
          typeof responseData.aiTitle === 'string' && responseData.aiTitle.trim().length > 0
            ? responseData.aiTitle.trim()
            : typeof classification.title === 'string' && classification.title.trim().length > 0
              ? classification.title.trim()
              : null;

        // Merge tags from aiTagsDebug if available
        const tags = Array.isArray(responseData.aiTagsDebug)
          ? responseData.aiTagsDebug
          : classification.tags;

        log('OK', responseData.id);
        return {
          ok: true,
          id: String(responseData.id),
          classification: {
            category,
            tags,
            spaceName: classification.spaceName ?? null,
            confidence: classification.confidence,
            title,
          },
        };
      }
    }

    // Fallback format: OpenAI-shaped response with JSON in message.content
    // { choices: [{ message: { content: "{\"category\":...}" } }] }
    const messageContent = data?.choices?.[0]?.message?.content;
    if (messageContent) {
      try {
        const parsed = JSON.parse(messageContent);

        // Extract category from either 'category' or 'bucket' field
        const category =
          typeof parsed.category === 'string'
            ? parsed.category
            : typeof parsed.bucket === 'string'
              ? parsed.bucket
              : null;

        if (
          typeof parsed === 'object' &&
          category !== null &&
          Array.isArray(parsed.tags) &&
          (parsed.spaceName === null ||
            parsed.spaceName === undefined ||
            typeof parsed.spaceName === 'string') &&
          typeof parsed.confidence === 'number'
        ) {
          // Parse title field: use if non-empty string, otherwise null
          const title =
            typeof parsed.title === 'string' && parsed.title.trim().length > 0
              ? parsed.title.trim()
              : null;

          const id = String(data.id || 'classify-' + Math.random().toString(36).slice(2));
          log('OK', id, '(fallback format)');
          return {
            ok: true,
            id,
            classification: {
              category,
              tags: parsed.tags,
              spaceName: parsed.spaceName ?? null,
              confidence: parsed.confidence,
              title,
            },
          };
        }
      } catch {
        // Failed to parse message.content as JSON, fall through to error
      }
    }

    // Unrecognized response format
    console.warn('[CORTEX] classify unrecognized response format', { status: res.status, data });
    return { ok: false, error: 'unrecognized_response' };
  } catch (e: any) {
    // Handle timeout specifically
    if (e?.name === 'AbortError') {
      log('ABORTED', 'Request timed out');
      return { ok: false, error: 'timeout' };
    }
    const message = e?.message || String(e);
    log('EXCEPTION', message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
    inFlight = false; // Release lock
  }
}

/**
 * Call the Cortex proxy for Phase 2 enrichment (smart titles, confirmation messages, etc.)
 * This runs AFTER entity creation to generate AI-enhanced metadata.
 *
 * @param params - Enrichment parameters
 * @returns Enrichment result with smart_title, confirmation_message, tags, etc.
 */
export async function callEnrichPhase2(params: {
  text: string;
  bucket: 'todo' | 'habit' | 'log';
  subtype?: string | null;
  recentTitles?: string[];
}): Promise<{
  ok: boolean;
  error?: string;
  smart_title?: string;
  confirmation_message?: string;
  tags?: string[];
  time_estimate_minutes?: number | null;
  extracted_date?: string | null;
  extracted_frequency?: string | null;
  people?: string[];
}> {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  }

  if (isAiDisabled()) {
    return { ok: false, error: '[cortex] disabled via EXPO_PUBLIC_DISABLE_AI' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();

  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  try {
    log('POST', baseUrl, { type: 'enrich-phase2', bucket: params.bucket });

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'enrich-phase2',
        text: params.text,
        bucket: params.bucket,
        subtype: params.subtype || null,
        recentTitles: params.recentTitles || [],
        currentDate: new Date().toISOString().split('T')[0],
      }),
    });

    const data = await response.json();

    if (data.error) {
      log('ERROR', data.error);
      return { ok: false, error: data.error };
    }

    log('OK', 'enrich-phase2', {
      hasSmartTitle: !!data.smart_title,
      hasConfirmation: !!data.confirmation_message,
      tagsCount: data.tags?.length || 0,
    });

    return {
      ok: true,
      smart_title: data.smart_title,
      confirmation_message: data.confirmation_message,
      tags: data.tags,
      time_estimate_minutes: data.time_estimate_minutes,
      extracted_date: data.extracted_date,
      extracted_frequency: data.extracted_frequency,
      people: data.people,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('EXCEPTION', message);
    return { ok: false, error: message };
  }
}

/**
 * Streaming version of callEnrichPhase2 - fields arrive as they're generated.
 * Returns a close() function to cancel the stream.
 *
 * @param params - Enrichment parameters
 * @param callbacks - Callbacks for field updates, completion, and errors
 * @returns Object with close() method to cancel the stream
 */
export function callEnrichPhase2Streaming(
  params: {
    text: string;
    bucket: 'todo' | 'habit' | 'log';
    subtype?: string | null;
    recentTitles?: string[];
  },
  callbacks: Phase2StreamingCallbacks,
): { close: () => void } {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    callbacks.onError('Missing CORTEX_URL');
    return { close: () => {} };
  }

  if (isAiDisabled()) {
    callbacks.onError('AI disabled');
    return { close: () => {} };
  }

  const supabaseAnonKey = readSupabaseAnonKey();

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  console.log('[CortexClient:SSE] Opening EventSource to', baseUrl);

  const es = new EventSource(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(supabaseAnonKey && {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      }),
    },
    body: JSON.stringify({
      type: 'enrich-phase2',
      stream: true,
      text: params.text,
      bucket: params.bucket,
      subtype: params.subtype || null,
      recentTitles: params.recentTitles || [],
      currentDate,
      timezone,
      dayOfWeek,
    }),
    pollingInterval: 0,
  });

  const finalResult: Phase2EnrichmentResult = {};
  let isClosed = false;

  es.addEventListener('open', () => {
    console.log('[CortexClient:SSE] Connection opened');
  });

  es.addEventListener('message', (event: any) => {
    if (isClosed) return;
    console.log('[CortexClient:SSE] Received message:', event.data);
    try {
      const data = JSON.parse(event.data);

      if (data.error) {
        isClosed = true;
        callbacks.onError(data.error);
        es.close();
        return;
      }

      // Handle individual field updates
      if (data.field && !data.done) {
        finalResult[data.field as keyof Phase2EnrichmentResult] = data.value;
        callbacks.onField(data.field, data.value);
      }

      // Handle completion
      if (data.done) {
        isClosed = true;
        // Merge any final fields
        const completeResult: Phase2EnrichmentResult = {
          ...finalResult,
          smart_title: data.smart_title || finalResult.smart_title,
          confirmation_message: data.confirmation_message || finalResult.confirmation_message,
          tags: data.tags || finalResult.tags,
          time_estimate_minutes: data.time_estimate_minutes ?? finalResult.time_estimate_minutes,
          extracted_date: data.extracted_date || finalResult.extracted_date,
          extracted_start_date: data.extracted_start_date || finalResult.extracted_start_date,
          extracted_frequency: data.extracted_frequency || finalResult.extracted_frequency,
          people: data.people || finalResult.people,
          latency_ms: data.latency_ms,
        };
        console.log('[CortexClient:SSE] Completed, closing');
        callbacks.onComplete(completeResult);
        es.close();
      }
    } catch (e) {
      console.error('[CortexClient:SSE] Parse error:', e);
    }
  });

  es.addEventListener('error', (event: any) => {
    if (isClosed) return;
    isClosed = true;
    console.error('[CortexClient:SSE] Error event:', event);
    callbacks.onError(event.message || 'SSE connection error');
    es.close();
  });

  return {
    close: () => {
      isClosed = true;
      es.close();
    },
  };
}

export const CortexClient = {
  callChat,
  callComplete,
  callClassify,
  callSpaceChat,
  callSpaceChatStreaming,
  callEnrichPhase2,
  callEnrichPhase2Streaming,
};
