// lib/cortex/CortexClient.ts
// Typed client for Supabase Edge Function cortex-proxy
// NO OpenAI keys in client code
import { env, getEnv } from '../env';
import EventSource from 'react-native-sse';
import { getDateService } from '../date/DateService';
import type { EntityChatRequest, EntityChatResponse, HabitBuilderRequest, HabitBuilderStreamingCallbacks } from '../types';

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
  onSearching?: (query: string) => void;
  onFetching?: (isFetching: boolean, fetchingUrl: string | null) => void;
}

/**
 * Rich completion result for Space Chat streaming.
 * Includes save_suggestion from Cortex when available.
 */
export interface SpaceChatStreamingResult {
  content: string;
  save_suggestion?: any | null;
  saveable?: any | null;
  promotion?: any | null;
  latency_ms?: number;
  sources?: Array<{ title: string; url: string }>;
  search_query?: string;
  fetchedUrl?: { url: string; title: string } | null;
}

/**
 * Enhanced streaming callbacks for Space Chat with save_suggestion support.
 * Use this interface when you need access to save_suggestion in onComplete.
 */
export interface SpaceChatStreamingCallbacks {
  onChunk: (text: string, fullTextSoFar: string) => void;
  onComplete: (result: SpaceChatStreamingResult) => void;
  onError: (error: string, partialText: string) => void;
  onSearching?: (query: string) => void;
  onFetching?: (isFetching: boolean, fetchingUrl: string | null) => void;
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
  extracted_days?: number[] | null; // Array of day numbers (0=Sunday, 1=Monday, ... 6=Saturday) for specific days like "Tuesdays and Thursdays"
  people?: string[];
  mood?: string[] | null; // AI-extracted moods for journal entries
  latency_ms?: number;
  // Event-specific fields
  target_date?: string | null; // Event date in YYYY-MM-DD format
  end_date?: string | null; // End date for multi-day events
  event_time?: string | null; // Event time in HH:mm format
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
 * Supports two callback signatures:
 * - StreamingCallbacks: Simple interface where onComplete receives just the text
 * - SpaceChatStreamingCallbacks: Enhanced interface where onComplete receives rich result with save_suggestion
 *
 * @param messages - The conversation messages
 * @param opts - Options including spaceId, chatId, userId, and optional system prompt override
 * @param callbacks - Callbacks for streaming events (onChunk, onComplete, onError)
 * @returns Object with close() method to cancel the stream
 */
export function callSpaceChatStreaming(
  messages: ChatMessage[],
  opts: { spaceId: string; chatId: string; userId?: string; systemPrompt?: string },
  callbacks: StreamingCallbacks | SpaceChatStreamingCallbacks,
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
      userId: opts.userId,
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        callbacks.onError(data.error, fullText);
        es.close();
        return;
      }
      if (data.searching && data.query) {
        callbacks.onSearching?.(data.query);
        return;
      }
      if (data.fetching !== undefined) {
        callbacks.onFetching?.(data.fetching, data.fetchingUrl || null);
        return;
      }
      if (data.delta) {
        fullText += data.delta;
        callbacks.onChunk(data.delta, fullText);
      }
      if (data.done) {
        const finalContent = data.full_content || fullText;
        // Check if callback expects rich result (SpaceChatStreamingCallbacks)
        // by testing if onComplete accepts an object with 'content' property
        // For backwards compatibility, we call with rich object - simple callbacks
        // that expect string will receive [object Object] if they destructure wrong,
        // but the actual consumer (ChatThreadScreen) will be updated to use the rich result.
        const richResult: SpaceChatStreamingResult = {
          content: finalContent,
          save_suggestion: data.save_suggestion ?? null,
          saveable: data.saveable ?? null,
          promotion: data.promotion ?? null,
          latency_ms: data.latency_ms,
          sources: data.sources,
          search_query: data.search_query,
          fetchedUrl: data.fetchedUrl ?? null,
        };
        log('SPACE_CHAT_STREAM_DONE', {
          contentLength: finalContent.length,
          hasSaveSuggestion: data.save_suggestion != null,
          hasSaveable: !!data.saveable,
        });
        // Call with both: pass string as first arg for backwards compat
        // and attach rich result. Consumer can choose which to use.
        (callbacks.onComplete as any)(finalContent, richResult);
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
        currentDate: getDateService().getCurrentDate(),
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
 * Result type for transcription requests
 */
export type TranscribeResult =
  | { ok: true; text: string; duration?: number; language?: string }
  | { ok: false; error: string };

/**
 * Call the Cortex proxy for audio transcription via OpenAI Whisper.
 * Sends base64-encoded audio to the proxy for transcription.
 *
 * @param audioBase64 - Base64-encoded audio data
 * @param format - Audio format (default: 'm4a')
 * @returns Transcription result with text, optional duration and language
 */
export async function callTranscribe(
  audioBase64: string,
  format: string = 'm4a',
): Promise<TranscribeResult> {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    log('CONFIG_MISSING', 'Missing EXPO_PUBLIC_CORTEX_URL');
    return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  }

  if (isAiDisabled()) {
    if (!warnedAiDisabled) {
      console.warn('[CORTEX] Disabled via EXPO_PUBLIC_DISABLE_AI; skipping transcription.');
      warnedAiDisabled = true;
    }
    return { ok: false, error: '[cortex] disabled via EXPO_PUBLIC_DISABLE_AI' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();

  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  try {
    log('POST', baseUrl, { type: 'transcribe', format, audioLength: audioBase64.length });

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'transcribe',
        audio: audioBase64,
        format,
      }),
    });

    log('STATUS', response.status);

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      log('ERROR_RESPONSE', response.status, txt);
      return { ok: false, error: `[cortex] ${response.status} ${txt || 'Unknown error'}` };
    }

    const data = await response.json();

    if (data.error) {
      log('ERROR', data.error);
      return { ok: false, error: data.error };
    }

    log('OK', 'transcribe', {
      textLength: data.text?.length || 0,
      duration: data.duration,
      language: data.language,
    });

    return {
      ok: true,
      text: data.text || '',
      duration: data.duration,
      language: data.language,
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

  const ds = getDateService();
  const currentDate = ds.getCurrentDate();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

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
    lineEndingCharacter: '\n',
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

      // Handle completion - either explicit done flag or a response with smart_title (non-streaming fallback)
      if (data.done || (data.smart_title && !data.field)) {
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
          extracted_days: data.extracted_days || finalResult.extracted_days,
          people: data.people || finalResult.people,
          // Event-specific fields
          target_date: data.target_date || finalResult.target_date,
          end_date: data.end_date || finalResult.end_date,
          event_time: data.event_time || finalResult.event_time,
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

// ─────────────────────────────────────────────────────────────────────────────
// Space Chat Save - Classification for instant save
// ─────────────────────────────────────────────────────────────────────────────

export interface SpaceChatSaveResponse {
  type: 'habit' | 'todo' | 'log';
  subtype: 'start_habit' | 'break_habit' | 'general' | 'idea' | 'journal' | null;
  confidence: number;
  title: string;
  tags: string[];
  frequency: string | null;
  timeEstimateMinutes: number | null;
  hasList: boolean;
  latency_ms?: number;
  error?: string;
}

/**
 * Call the Cortex proxy for Space Chat Save classification.
 * Determines the best type (habit/todo/log) and extracts metadata for instant save.
 *
 * @param params - The user message, assistant message, and space name
 * @returns Classification result with type, subtype, title, and metadata
 */
export async function callSpaceChatSave(params: {
  userMessage: string;
  assistantMessage: string;
  spaceName: string;
}): Promise<SpaceChatSaveResponse> {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    console.warn('[CortexClient] callSpaceChatSave: Missing CORTEX_URL, using defaults');
    return getDefaultSaveResponse();
  }

  if (isAiDisabled()) {
    console.warn('[CortexClient] callSpaceChatSave: AI disabled, using defaults');
    return getDefaultSaveResponse();
  }

  const supabaseAnonKey = readSupabaseAnonKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  const timeoutMs = toMs(env.cortex.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    log('POST', baseUrl, { type: 'space-chat-save', spaceName: params.spaceName });

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'space-chat-save',
        userMessage: params.userMessage,
        assistantMessage: params.assistantMessage,
        spaceName: params.spaceName,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[CortexClient] callSpaceChatSave error response:', res.status, txt);
      return getDefaultSaveResponse();
    }

    const data = await res.json();
    log('SPACE_CHAT_SAVE_RESPONSE', data);

    if (data.error) {
      console.warn('[CortexClient] callSpaceChatSave error in response:', data.error);
      return getDefaultSaveResponse();
    }

    return {
      type: data.type || 'log',
      subtype: data.subtype || 'general',
      confidence: data.confidence ?? 0.5,
      title: data.title || 'Saved from chat',
      tags: Array.isArray(data.tags) ? data.tags : [],
      frequency: data.frequency || null,
      timeEstimateMinutes: data.timeEstimateMinutes ?? data.time_estimate_minutes ?? null,
      hasList: data.hasList ?? data.has_list ?? false,
      latency_ms: data.latency_ms,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn('[CortexClient] callSpaceChatSave timeout');
    } else {
      console.warn('[CortexClient] callSpaceChatSave exception:', e?.message || e);
    }
    return getDefaultSaveResponse();
  } finally {
    clearTimeout(timeout);
  }
}

function getDefaultSaveResponse(): SpaceChatSaveResponse {
  return {
    type: 'log',
    subtype: 'general',
    confidence: 0.5,
    title: 'Saved from chat',
    tags: [],
    frequency: null,
    timeEstimateMinutes: null,
    hasList: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY CHAT - Chat within entity overlays and sweep cards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call the Cortex proxy for Entity Chat (non-streaming).
 * Used for quick single-turn responses in overlay/sweep chat.
 *
 * @param request - The entity chat request payload
 * @returns The entity chat response with content, saveable detection, and promotion
 */
export async function callEntityChat(request: EntityChatRequest): Promise<EntityChatResponse> {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    log('CONFIG_MISSING', 'Missing CORTEX_URL for entity chat');
    return {
      content: "I'm having trouble connecting right now. Please try again.",
      latency_ms: 0,
    };
  }

  if (isAiDisabled()) {
    return {
      content: 'AI features are currently disabled.',
      latency_ms: 0,
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();
  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  const timeoutMs = toMs(env.cortex.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    log('ENTITY_CHAT', 'Calling entity chat', {
      entityType: request.entity.type,
      entityId: request.entity.id,
      messageCount: request.messages.length,
      preset: request.preset,
    });

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...request,
        type: 'entity-chat',
        stream: false,
      }),
      signal: controller.signal,
    });

    const latency_ms = Date.now() - startTime;

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      log('ENTITY_CHAT_ERROR', res.status, errorText);
      return {
        content: "Something went wrong. Let's try that again.",
        latency_ms,
      };
    }

    const data = await res.json();
    log('ENTITY_CHAT_RESPONSE', {
      contentLength: data.content?.length || 0,
      hasSaveable: !!data.saveable,
      hasPromotion: !!data.promotion,
      hasSaveSuggestion: data.save_suggestion != null,
    });

    return {
      content: data.content || '',
      saveable: data.saveable,
      promotion: data.promotion,
      save_suggestion: data.save_suggestion ?? null,
      latency_ms: data.latency_ms ?? latency_ms,
    };
  } catch (e: any) {
    const latency_ms = Date.now() - startTime;
    if (e?.name === 'AbortError') {
      log('ENTITY_CHAT_TIMEOUT', 'Request timed out');
      return {
        content: 'Request timed out. Please try again.',
        latency_ms,
      };
    }
    log('ENTITY_CHAT_EXCEPTION', e?.message || e);
    return {
      content: "I'm having trouble right now. Please try again.",
      latency_ms,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Entity chat streaming callbacks
 */
export interface EntityChatStreamingCallbacks {
  onDelta: (delta: string) => void;
  onComplete: (response: EntityChatResponse) => void;
  onError: (error: Error) => void;
  onSearching?: (query: string) => void;
  onFetching?: (isFetching: boolean, fetchingUrl: string | null) => void;
}

/**
 * Call the Cortex proxy for Entity Chat with streaming support using EventSource (SSE).
 * Returns an object with a close() method to cancel the request.
 *
 * @param request - The entity chat request payload
 * @param callbacks - Callbacks for streaming events (onDelta, onComplete, onError)
 * @returns Object with close() method to cancel the stream
 */
export function callEntityChatStreaming(
  request: EntityChatRequest,
  callbacks: EntityChatStreamingCallbacks,
): { close: () => void } {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    callbacks.onError(new Error('Missing CORTEX_URL'));
    return { close: () => {} };
  }

  if (isAiDisabled()) {
    callbacks.onError(new Error('AI disabled'));
    return { close: () => {} };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();
  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  let fullContent = '';
  const startTime = Date.now();

  log('ENTITY_CHAT_STREAM', 'Starting streaming entity chat', {
    entityType: request.entity.type,
    entityId: request.entity.id,
    messageCount: request.messages.length,
    preset: request.preset,
  });

  const es = new EventSource(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...request,
      type: 'entity-chat',
      stream: true,
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);

      // Handle error in stream
      if (data.error) {
        callbacks.onError(new Error(data.error));
        es.close();
        return;
      }

      // Handle searching event
      if (data.searching && data.query) {
        callbacks.onSearching?.(data.query);
        return;
      }

      // Handle fetching event
      if (data.fetching !== undefined) {
        callbacks.onFetching?.(data.fetching, data.fetchingUrl || null);
        return;
      }

      // Handle delta (partial content)
      if (data.delta) {
        fullContent += data.delta;
        callbacks.onDelta(data.delta);
      }

      // Handle completion
      if (data.done) {
        const latency_ms = data.latency_ms ?? Date.now() - startTime;
        log('ENTITY_CHAT_STREAM_DONE', {
          contentLength: (data.full_content || fullContent).length,
          hasSaveable: !!data.saveable,
          hasPromotion: !!data.promotion,
          hasSaveSuggestion: data.save_suggestion != null,
        });
        callbacks.onComplete({
          content: data.full_content || fullContent,
          saveable: data.saveable,
          promotion: data.promotion,
          save_suggestion: data.save_suggestion ?? null,
          latency_ms,
          sources: data.sources,
          images: data.images,
          search_query: data.search_query,
          fetchedUrl: data.fetchedUrl,
        });
        es.close();
      }
    } catch (parseError) {
      // Ignore parse errors for individual chunks
      log('ENTITY_CHAT_STREAM_PARSE_ERROR', parseError);
    }
  });

  es.addEventListener('error', (event: any) => {
    const errorMessage = event.message || 'Stream error';
    log('ENTITY_CHAT_STREAM_ERROR', errorMessage);
    callbacks.onError(new Error(errorMessage));
    es.close();
  });

  return { close: () => es.close() };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT BUILDER CHAT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call the Cortex proxy for Habit Builder Chat with streaming support using EventSource (SSE).
 * Returns an object with a close() method to cancel the request.
 *
 * @param request - The habit builder request payload
 * @param callbacks - Callbacks for streaming events (onDelta, onComplete, onError)
 * @returns Object with close() method to cancel the stream
 */
export function callHabitBuilderStreaming(
  request: HabitBuilderRequest,
  callbacks: HabitBuilderStreamingCallbacks,
): { close: () => void } {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    callbacks.onError(new Error('Missing CORTEX_URL'));
    return { close: () => {} };
  }

  if (isAiDisabled()) {
    callbacks.onError(new Error('AI disabled'));
    return { close: () => {} };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();
  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  let fullContent = '';
  const startTime = Date.now();

  log('HABIT_BUILDER_STREAM', 'Starting streaming habit builder chat', {
    messageCount: request.messages.length,
    hasPrefill: !!request.context.prefill,
  });

  const es = new EventSource(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...request,
      type: 'habit-builder',
      stream: true,
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);

      // Handle error in stream
      if (data.error) {
        callbacks.onError(new Error(data.error));
        es.close();
        return;
      }

      // Handle delta (partial content)
      if (data.delta) {
        fullContent += data.delta;
        callbacks.onDelta(data.delta);
      }

      // Handle completion
      if (data.done) {
        const latency_ms = data.latency_ms ?? Date.now() - startTime;
        log('HABIT_BUILDER_STREAM_DONE', {
          contentLength: (data.full_content || fullContent).length,
          requiredCount: data.resolved_fields?.required_count,
          nextField: data.resolved_fields?.next_field,
        });
        callbacks.onComplete({
          content: data.full_content || fullContent,
          resolved_fields: data.resolved_fields || {
            name: null, habit_type: null, cadence: null, target: null,
            start_date: null, time_window: null, days: null, space_name: null,
            notes: null, end_date: null, time_estimate_minutes: null,
            is_confirmation: false, next_field: null, required_count: 0,
          },
          latency_ms,
        });
        es.close();
      }
    } catch (parseError) {
      log('HABIT_BUILDER_STREAM_PARSE_ERROR', parseError);
    }
  });

  es.addEventListener('error', (event: any) => {
    const errorMessage = event.message || 'Stream error';
    log('HABIT_BUILDER_STREAM_ERROR', errorMessage);
    callbacks.onError(new Error(errorMessage));
    es.close();
  });

  return { close: () => es.close() };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOURNAL ANALYZE
// ═══════════════════════════════════════════════════════════════════════════════

export interface JournalAnalyzeEntry {
  date: string; // YYYY-MM-DD
  body: string;
  mood?: string[] | null;
}

export interface JournalAnalysisTheme {
  label: string;
  description: string;
  count: number;
}

export interface JournalAnalysisPattern {
  label: string;
  description: string;
  sentiment: 'positive' | 'neutral' | 'watch';
}

export interface JournalAnalysisHabits {
  frequency: string;
  preferred_time: 'morning' | 'evening' | 'varies' | 'unknown';
  avg_length: 'short' | 'medium' | 'long';
  observation: string;
}

export interface JournalAnalysisSuggestion {
  text: string;
  type: 'reflect' | 'try' | 'continue';
}

export interface JournalAnalysisResult {
  themes: JournalAnalysisTheme[];
  patterns: JournalAnalysisPattern[];
  journaling_habits: JournalAnalysisHabits;
  suggestion: JournalAnalysisSuggestion;
}

export interface JournalAnalyzeResponse {
  analysis: JournalAnalysisResult;
  entry_count: number;
  latency_ms: number;
}

/**
 * Call the Cortex proxy for Journal Analysis.
 * Sends journal entries and returns structured themes, patterns, and suggestions.
 */
export async function callJournalAnalyze(
  entries: JournalAnalyzeEntry[],
  timezone: string = 'UTC',
): Promise<CortexClientResult<JournalAnalyzeResponse>> {
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    log('CONFIG_MISSING', 'Missing CORTEX_URL for journal analyze');
    return { ok: false, error: 'Missing CORTEX_URL' };
  }

  if (isAiDisabled()) {
    return { ok: false, error: 'AI features are currently disabled' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const supabaseAnonKey = readSupabaseAnonKey();
  if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
    headers.apikey = supabaseAnonKey;
  }

  // Use a longer timeout since this processes many entries
  const timeoutMs = 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    log('JOURNAL_ANALYZE', 'Calling journal analyze', { entryCount: entries.length });

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'journal-analyze',
        entries: entries.map((e) => ({
          date: e.date,
          body: (e.body || '').slice(0, 500), // Cap per-entry length
          mood: e.mood || null,
        })),
        timezone,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      log('JOURNAL_ANALYZE_ERROR', res.status, errorText);
      return { ok: false, error: `Server error: ${res.status}`, status: res.status };
    }

    const data = await res.json();

    if (data.error) {
      log('JOURNAL_ANALYZE_FAIL', data.error);
      return { ok: false, error: data.error };
    }

    log('JOURNAL_ANALYZE_OK', {
      entryCount: data.entry_count,
      themes: data.analysis?.themes?.length,
      latency_ms: data.latency_ms,
    });

    return { ok: true, data };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      log('JOURNAL_ANALYZE_TIMEOUT', 'Request timed out');
      return { ok: false, error: 'Request timed out' };
    }
    log('JOURNAL_ANALYZE_EXCEPTION', e?.message || e);
    return { ok: false, error: e?.message || 'Unknown error' };
  } finally {
    clearTimeout(timeout);
  }
}

export const CortexClient = {
  callChat,
  callComplete,
  callClassify,
  callSpaceChat,
  callSpaceChatStreaming,
  callSpaceChatSave,
  callEnrichPhase2,
  callEnrichPhase2Streaming,
  callTranscribe,
  callEntityChat,
  callEntityChatStreaming,
  callHabitBuilderStreaming,
  callJournalAnalyze,
};
