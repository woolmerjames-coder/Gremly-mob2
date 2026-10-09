// lib/cortex/CortexClient.ts
// Typed client for Supabase Edge Function cortex-proxy
// NO OpenAI keys in client code
import { env, getEnv } from '../env';
import EventSource from 'react-native-sse';
import { getDateService, nowTimestamp } from '../date/DateService';
import { weeklyDayNow } from '../week/weeklyDayNow';
import { eventBus } from '../events/EventBus';
import { getSessionToken, getSessionTokenSync } from './getSessionToken';
import type { HabitBuilderRequest, HabitBuilderStreamingCallbacks } from '../types';
import type { Change } from '../changes/model';
import type { WeekReviewRow, WeekSpread } from '../repo/weekReviewRepo';
import type { ReviewKind } from '../week/model';

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
  onSearching?: (query: string, isLoadingHint?: boolean) => void;
  onFetching?: (isFetching: boolean, fetchingUrl: string | null) => void;
}

/**
 * Rich completion result for Space Chat streaming.
 * Includes save_suggestion from Cortex when available.
 */
export interface SpaceChatStreamingResult {
  content: string;
  save_suggestion?: any | null;
  entity_card?: import('../types').EntityCard | null;
  /** The Worker's clock for this turn: triage, card, time before the reply, reply */
  timing?: { triage_ms: number; card_ms: number; pre_ms: number; reply_ms: number } | null;
  saveable?: any | null;
  promotion?: any | null;
  latency_ms?: number;
  sources?: Array<{ title: string; url: string }>;
  search_query?: string;
  fetchedUrl?: { url: string; title: string } | null;
  /** Whether the Save items pill and a late card may follow this turn (general chat) */
  extraction?: 'running' | 'skipped';
  /**
   * Ask Gremly: the agent answered (a lookup or a change), with its card in the
   * change model's shape and the chat's task list; nothing changes until they tap
   */
  agent?: {
    card: Change[];
    tasks: AgentTask[];
    /** The button to their week goes under the reply; done when this week's review is */
    offer?: { kind: 'week'; done: boolean };
    prompt_version?: string;
  } | null;
  /**
   * Something in the reply worth keeping, with where it belongs (Worlds
   * rebuild, stage 2; cortex context/keep.js), for an app build with Worlds
   */
  keep?: import('../worlds/keep').KeepOffer | null;
}

/**
 * Enhanced streaming callbacks for Space Chat with save_suggestion support.
 * Use this interface when you need access to save_suggestion in onComplete.
 */
export interface SpaceChatStreamingCallbacks {
  onChunk: (text: string, fullTextSoFar: string) => void;
  onComplete: (result: SpaceChatStreamingResult) => void;
  onError: (error: string, partialText: string) => void;
  onSearching?: (query: string, isLoadingHint?: boolean) => void;
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
  priority_kind?: 'action' | 'blocker' | 'waiting' | 'decision' | 'momentum' | null;
  latency_ms?: number;
  // Date intelligence fields
  target_date?: string | null; // Deadline date in YYYY-MM-DD format
  scheduled_date?: string | null; // When user will do it, YYYY-MM-DD format
  end_date?: string | null; // End date for multi-day events
  event_time?: string | null; // Explicit time in HH:mm format
  date_type_ambiguous?: boolean; // True when date could be deadline or scheduled
}

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
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

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
      if (res.status === 403) {
        try {
          const body = await res.clone().json();
          if (body?.error === 'read_only') {
            eventBus.emit('cortex:read_only', {});
            return { ok: false, error: 'read_only', status: 403 };
          }
        } catch {
          /* fall through to generic error */
        }
      }
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
  opts: {
    spaceId: string;
    chatId: string;
    userId?: string;
    systemPrompt?: string;
    recentEntity?: import('../types').RecentEntity | null;
  },
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
  const sessionToken = getSessionTokenSync();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
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
      // the item on the last entity card in this chat, so "move it" can mean it
      recentEntity: opts.recentEntity ?? null,
      userId: opts.userId,
      currentTime: nowTimestamp(),
      timezone: getDateService().getTimezone(),
      // their weekly day, so a habit's count this week is made in their own week
      weekly_day: weeklyDayNow(),
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error === 'read_only') {
        eventBus.emit('cortex:read_only', {});
        es.close();
        return;
      }
      if (data.error) {
        callbacks.onError(data.error, fullText);
        es.close();
        return;
      }
      if (data.searching && data.query) {
        callbacks.onSearching?.(data.query, data.isLoadingHint || false);
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
          entity_card: data.entity_card ?? null,
          timing: data.timing ?? null,
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

/**
 * Stream a general chat (no space context) via Cortex.
 */
export function callGeneralChatStreaming(
  messages: ChatMessage[],
  opts: {
    chatId: string;
    userId?: string;
    systemPrompt?: string;
    recentEntity?: import('../types').RecentEntity | null;
    /** The item this chat was opened about, if any (Talk it through) */
    anchorEntity?: import('../types').ChatAnchor | null;
    /** This turn's id, written back with its extraction so the app knows when it has landed */
    turnId?: string;
    /** 'brief' in today's thread (Daily brief in Chat), so a correction there is marked as made on the brief */
    chatSurface?: 'brief' | 'chat';
    /** Today's thread: the brief's question this message replies to, so the reply takes the answer in */
    briefQuestion?: string | null;
    /** The agent's task list kept on this chat, so asks carry across messages */
    agentTasks?: AgentTask[];
    /**
     * Their week, from an app build that can show the weekly review: with it
     * Gremly knows where the review stands and can put the button to it under
     * a reply (the agent's offer_week). The review itself is never under way here.
     */
    week?: WeekTurnContext | null;
  },
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
  const sessionToken = getSessionTokenSync();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
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
      lane: 'general_chat',
      stream: true,
      chatId: opts.chatId,
      // the item on the last entity card in this chat, so "move it" can mean it
      recentEntity: opts.recentEntity ?? null,
      // the item the chat was opened about, so every turn knows what it is about
      anchorEntity: opts.anchorEntity ?? null,
      turnId: opts.turnId ?? null,
      chatSurface: opts.chatSurface ?? 'chat',
      briefQuestion: opts.briefQuestion ?? null,
      // this build draws the agent's card, so lookups and changes can go to it
      agentCard: true,
      // and changes to Worlds and Chapters, for someone who has the Worlds tab
      // every build from the Worlds rebuild can show and change Worlds and Chapters (stage 4)
      worldsCard: true,
      agentTasks: opts.agentTasks ?? [],
      ...(opts.week ? { week: opts.week } : {}),
      userId: opts.userId,
      currentTime: nowTimestamp(),
      timezone: getDateService().getTimezone(),
      // their weekly day, so a habit's count this week is made in their own week
      weekly_day: weeklyDayNow(),
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error === 'read_only') {
        eventBus.emit('cortex:read_only', {});
        es.close();
        return;
      }
      if (data.error) {
        callbacks.onError(data.error, fullText);
        es.close();
        return;
      }
      if (data.searching && data.query) {
        callbacks.onSearching?.(data.query, data.isLoadingHint || false);
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
        const richResult: SpaceChatStreamingResult = {
          content: finalContent,
          save_suggestion: data.save_suggestion ?? null,
          entity_card: data.entity_card ?? null,
          timing: data.timing ?? null,
          saveable: data.saveable ?? null,
          promotion: data.promotion ?? null,
          latency_ms: data.latency_ms,
          sources: data.sources,
          search_query: data.search_query,
          fetchedUrl: data.fetchedUrl ?? null,
          extraction: data.extraction,
          agent: data.agent ?? null,
          keep: data.keep ?? null,
        };
        log('GENERAL_CHAT_STREAM_DONE', { contentLength: finalContent.length });
        (callbacks.onComplete as any)(finalContent, richResult);
        es.close();
      }
    } catch {
      /* Ignore parse errors */
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
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

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
 * Call the Cortex proxy for Phase 1.5a enrichment (smart title + confirmation message).
 * Lighter/faster than Phase 2 — used in parallel for title quality.
 */
export async function callEnrichPhase15a(params: {
  text: string;
  bucket: 'todo' | 'habit' | 'log';
  subtype?: string | null;
}): Promise<{ ok: boolean; smart_title?: string; confirmation_message?: string }> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false };
  if (isAiDisabled()) return { ok: false };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'enrich-phase1-5a',
        text: params.text,
        bucket: params.bucket,
        subtype: params.subtype || null,
        recentReactions: [],
      }),
    });
    const data = await response.json();
    if (data.error) return { ok: false };
    return {
      ok: true,
      smart_title: data.smart_title,
      confirmation_message: data.confirmation_message,
    };
  } catch {
    return { ok: false };
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
  const sessionToken = await getSessionToken();

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
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
        currentDate: getDateService().today(),
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
  const sessionToken = await getSessionToken();

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
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

  const sessionToken = getSessionTokenSync();

  const ds = getDateService();
  const currentDate = ds.today();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dayOfWeek = ds.getDayOfWeek();

  console.log('[CortexClient:SSE] Opening EventSource to', baseUrl);

  const es = new EventSource(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken && {
        Authorization: `Bearer ${sessionToken}`,
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
          priority_kind: data.priority_kind ?? finalResult.priority_kind,
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

  const sessionToken = await getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
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
// CHAT FULL SUMMARY - Generate comprehensive summary from all chat messages
// ═══════════════════════════════════════════════════════════════════════════════

export async function callChatFullSummary(chatId: string): Promise<{ summary: string | null }> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { summary: null };
  if (isAiDisabled()) return { summary: null };

  const sessionToken = await getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'chat-full-summary',
        chatId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
      signal: controller.signal,
    });

    if (!res.ok) return { summary: null };
    const data = await res.json();
    return { summary: data.summary || null };
  } catch {
    return { summary: null };
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM TOPICS - What to talk about when a chat about a note opens
// ═══════════════════════════════════════════════════════════════════════════════

export type ItemTopic = { label: string; message: string };

/**
 * Up to four starters drawn from one of their notes (the Worker reads the note
 * and keeps the answer until it changes). An empty list on any failure, so
 * the chat shows its usual starters.
 */
export async function fetchItemTopics(itemId: string, timeoutMs = 8000): Promise<ItemTopic[]> {
  const baseUrl = readCortexUrl();
  if (!baseUrl || isAiDisabled()) return [];
  const sessionToken = await getSessionToken();
  if (!sessionToken) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ type: 'item-topics', itemId, itemType: 'note' }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const topics: unknown[] = Array.isArray(data?.topics) ? data.topics : [];
    return topics.filter(
      (t): t is ItemTopic =>
        !!t &&
        typeof (t as ItemTopic).label === 'string' &&
        typeof (t as ItemTopic).message === 'string' &&
        !!(t as ItemTopic).label.trim() &&
        !!(t as ItemTopic).message.trim(),
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
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
  const sessionToken = getSessionTokenSync();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  let fullContent = '';
  const startTime = getDateService().now().getTime();

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
      currentMode: request.currentMode ?? null,
      turnNumber: request.turnNumber ?? 0,
    }),
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (event: any) => {
    try {
      const data = JSON.parse(event.data);

      // Handle read_only access denial
      if (data.error === 'read_only') {
        eventBus.emit('cortex:read_only', {});
        es.close();
        return;
      }

      // Handle error
      if (data.error) {
        callbacks.onError(new Error(data.error));
        es.close();
        return;
      }

      // Handle searching event — mirror entity chat pattern
      if (data.searching && data.query) {
        callbacks.onSearching?.(data.query, data.isLoadingHint || false);
        return;
      }

      // Handle delta
      if (data.delta) {
        fullContent += data.delta;
        callbacks.onDelta(data.delta);
      }

      // Handle completion
      if (data.done) {
        const latency_ms = data.latency_ms ?? getDateService().now().getTime() - startTime;
        log('HABIT_BUILDER_STREAM_DONE', {
          contentLength: (data.full_content || fullContent).length,
          requiredCount: data.resolved_fields?.required_count,
          nextField: data.resolved_fields?.next_field,
        });
        callbacks.onComplete({
          content: data.full_content || fullContent,
          resolved_fields: data.resolved_fields || {
            name: null,
            habit_type: null,
            cadence: null,
            target: null,
            start_date: null,
            time_window: null,
            space_name: null,
            notes: null,
            end_date: null,
            time_estimate_minutes: null,
            is_confirmation: false,
            next_field: null,
            required_count: 0,
            suggested_chips: null,
            readiness: 'exploring',
            conversation_value: 'low',
            trigger: null,
            replacement_behavior: null,
            environment_change: null,
            boundary_rule: null,
            current_frequency: null,
            event_name: null,
            is_restart: false,
            restart_context: null,
            check_in_after: null,
            builder_mode: null,
            steering_chips: null,
            edit_field: null,
            edit_value: null,
          },
          latency_ms,
          sources: data.sources,
        });
        es.close();
      }
    } catch (parseError) {
      // Ignore parse errors for individual chunks
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

/**
 * Gremly's line on Chat's fresh home. What waits in the app (the unread brief,
 * things to decide tonight) is sent so the line can mention it in passing.
 */
export async function callGeneralGreeting(
  userId: string,
  waiting: {
    briefUnread?: boolean;
    toDecide?: number;
    /** Gremly's questions, only while Answer some Gremly questions shows */
    questions?: { count: number; needs: number } | null;
  } = {},
): Promise<string | null> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionToken = await getSessionToken();
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'general-greeting',
        userId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        brief_unread: waiting.briefUnread === true,
        to_decide: waiting.toDecide ?? 0,
        questions_waiting: waiting.questions ?? undefined,
      }),
    });
    if (!res.ok) {
      if (res.status === 403) {
        try {
          const body = await res.clone().json();
          if (body?.error === 'read_only') {
            eventBus.emit('cortex:read_only', {});
          }
        } catch {
          /* fall through */
        }
      }
      return null;
    }
    const data = await res.json();
    return data.greeting || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gremly's words in the evening wrap up (agent plan step 10)
// ─────────────────────────────────────────────────────────────────────────────

export type WrapMoment =
  | 'open'
  | 'journal_ask'
  | 'journal_reply'
  | 'sorted'
  | 'habits'
  | 'close'
  | 'night'
  | 'questions';

/** What the wrap up tells Gremly for one moment (workers/cortex/wrap/words.js factsFrom). */
export interface WrapWordsRequest {
  moment: WrapMoment;
  day: string;
  weekday: string;
  part: 'early' | 'evening' | 'late';
  clock: string;
  day_end?: string;
  tomorrow_word: string;
  recap: {
    counts: { todos: number; habits: number; meetings: number; drops: number };
    done: { title: string; kind: 'todo' | 'habit' }[];
    missed: { id: string; title: string }[];
    planned?: { done: number; total: number } | null;
  };
  meetings: string[];
  travel?: string;
  cards: number;
  /** What is waiting in the cards, by title */
  card_titles?: string[];
  /** Whether the close offers to plan tomorrow (no plan for it in the thread yet) */
  can_plan?: boolean;
  tonight?: {
    decisions?: { title: string; outcome: string }[];
    logged?: string[];
    held?: string[];
    not_held?: string[];
    journal?: 'written' | 'mood' | 'skipped' | null;
    path?: 'cards' | 'skip' | 'clear' | null;
    /** A habit logged tonight with a run of days, as it stands now */
    streak?: { title: string; days: number } | null;
    /** Sorting the cards just fed Gremly */
    fed_by_cards?: boolean;
  };
  /** Gremly himself: his age, his stage and its nature, and whether he is fed today */
  gremly?: { age: number; tier: string; nature?: string; fed_today: boolean } | null;
  /** What Gremly has said in tonight's wrap up so far, in order */
  said?: string[];
  next?: {
    meetings: string[];
    /** Todos moved to tomorrow in the cards tonight */
    lined: string[];
    /** The first of the todos planned for tomorrow, by title */
    todos?: string[];
    /** How many todos are planned for tomorrow */
    todo_count?: number;
  };
  entry?: string;
  questions?: {
    id: string;
    question: string;
    about?: { kind: string; title: string; when?: string };
  }[];
}

export type WrapWordsResponse =
  | { line: string }
  | { journal: boolean; reply: string; moods?: string[] }
  | { ask: { id: string; question: string; choices: string[] }[]; intro?: string };

/** How long the wrap up waits for Gremly's words before it says its own. */
const WRAP_WORDS_TIMEOUT_MS = 8000;

/**
 * Gremly's words for one moment of the evening wrap up. Null when there are
 * none in time (no connection, an error, or slower than the wrap up waits):
 * the wrap up then says its fixed sentence.
 */
export async function callWrapWords(req: WrapWordsRequest): Promise<WrapWordsResponse | null> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRAP_WORDS_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionToken = await getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        type: 'wrap-words',
        timezone: getDateService().getTimezone(),
        ...req,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.line === 'string' && data.line.trim()) return { line: data.line.trim() };
    if (typeof data?.journal === 'boolean') {
      const moods = Array.isArray(data.moods)
        ? data.moods.filter((m: unknown): m is string => typeof m === 'string')
        : [];
      return { journal: data.journal, reply: String(data.reply ?? '').trim(), moods };
    }
    if (Array.isArray(data?.ask)) {
      const intro = typeof data.intro === 'string' ? data.intro.trim() : '';
      return intro ? { ask: data.ask, intro } : { ask: data.ask };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Habit Insight (on-demand, per-habit weekly insight line)
// Direct fetch — does NOT use the inFlight global lock so it never blocks
// interactive cortex calls.
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitInsightProxyResult {
  ok: boolean;
  line: string | null;
  kind: string | null;
  evidence?: { facts_used: string[]; confidence: number };
  model?: string;
  latency_ms?: number;
  source?: string;
}

export async function callHabitInsight(
  facts: unknown,
  crossSignal: unknown,
  week: string,
): Promise<HabitInsightProxyResult> {
  const fallback: HabitInsightProxyResult = { ok: true, line: null, kind: null };
  try {
    const supabaseUrl =
      safeGetEnv?.('EXPO_PUBLIC_SUPABASE_URL') ??
      (typeof env.supabaseUrl === 'string' ? env.supabaseUrl : null) ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      '';
    const baseUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/cortex-proxy` : '';
    if (!baseUrl || isAiDisabled()) return fallback;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionToken = await getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'habit-insight', facts, crossSignal, week }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return fallback;
      const data = await res.json();
      return {
        ok: true,
        line: typeof data.line === 'string' ? data.line : null,
        kind: typeof data.kind === 'string' ? data.kind : null,
        evidence: data.evidence ?? undefined,
        model: data.model ?? undefined,
        latency_ms: data.latency_ms ?? undefined,
        source: data.source ?? undefined,
      };
    } catch {
      clearTimeout(timeout);
      return fallback;
    }
  } catch {
    return fallback;
  }
}

export const CortexClient = {
  callChat,
  callComplete,
  callClassify,
  callSpaceChat,
  callSpaceChatStreaming,
  callGeneralChatStreaming,
  callGeneralGreeting,
  callSpaceChatSave,
  callEnrichPhase2,
  callEnrichPhase2Streaming,
  callTranscribe,
  callHabitBuilderStreaming,
  callHabitInsight,
};

/**
 * "Not right?" and answers to Gremly's questions. The cortex worker forwards it
 * to the context pipeline, which applies it everywhere. Separate from postJSON
 * so a chat request in flight never blocks it.
 */
export async function callNotRight(input: {
  surface: 'not_right' | 'question' | 'brief';
  said?: string;
  targetText?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  kind?: 'wrong' | 'changed' | 'done' | 'private' | null;
  /** Some of them on a tidy up: the facts they ticked, by id */
  pick?: string[];
}): Promise<CortexClientResult<{ ok?: boolean; correction_id?: string }>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: 'not-right',
        surface: input.surface,
        said: input.said || undefined,
        target_text: input.targetText || undefined,
        target_kind: input.targetKind || undefined,
        target_id: input.targetId || undefined,
        kind: input.kind || undefined,
        pick: input.pick?.length ? input.pick : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Something about a World or a Chapter changed on this phone: renamed, moved,
 * merged, closed or reopened, or its dates changed. Cortex clears chat's cache
 * so the next message knows, and asks the pipeline for fresh words for it
 * (data fabric stage 4b). Nothing waits on the reply.
 */
export async function callWorldsChanged(input: {
  table: 'worlds' | 'chapters';
  id: string;
}): Promise<CortexClientResult<{ ok?: boolean }>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'worlds-changed', table: input.table, id: input.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Chapters Gremly offered in a chat that the person said no to (Worlds
 * rebuild, stage 2): set the card aside, left the row unticked, or undid the
 * start. Cortex keeps each in the same list as the brief's own suggestions,
 * so neither offers it again. Nothing waits on the reply.
 */
export async function callChapterSaidNo(
  chapters: {
    title: string;
    world_id: string | null;
    start_date: string | null;
    end_date: string | null;
    items: { type: string; id: string }[];
  }[],
): Promise<CortexClientResult<{ kept?: number }>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'chapter-said-no', chapters }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Gremly's guesses for a Chapter started by hand from one line (Worlds
 * rebuild, stage 3): its name, World or a new one, the days the line gives, a
 * Gremly to wear and which of their things belong. Nothing is made; the
 * sheet shows each to change. guessed is false when there was none in time.
 */
export async function callChapterGuess(input: { line: string; today: string }): Promise<
  CortexClientResult<{
    guessed: boolean;
    title?: string;
    world_id?: string | null;
    new_world?: { name: string; gremly: string } | null;
    start_date?: string | null;
    end_date?: string | null;
    gremly?: string | null;
    items?: { type: string; id: string }[];
  }>
> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'chapter-guess', line: input.line, today: input.today }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * A Chapter's memory, written as the person closes it (data fabric stage
 * 4b). The memory is kept on the Chapter; the reply says what it is, or
 * memory is null when nothing true could be written.
 */
export async function callChapterMemory(chapterId: string): Promise<
  CortexClientResult<{
    ok?: boolean;
    outcome?: string;
    memory?: string | null;
    field?: string | null;
  }>
> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'chapter-memory', id: chapterId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    if (data?.ok !== true)
      return { ok: false, error: 'cortex did not write a memory', status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Forget Everything (What Gremly knows), after the person said yes: Gremly
 * forgets what he learned about them (workers/cortex/context/forget.js). The
 * reply says how much of each kind was forgotten.
 */
export async function callForgetMe(): Promise<
  CortexClientResult<{ ok?: boolean; forgotten?: Record<string, number> }>
> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'forget-me' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    // Only the forget handler answers ok: a cortex without it falls through to
    // chat and answers 200, which must not read as forgotten
    if (data?.ok !== true) return { ok: false, error: 'cortex did not forget', status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Daily brief in Chat: ask for today's brief to be written now. Used on the
 * first open when the morning job has not written one, and once a day for a
 * fresh brief when the lines were written for an earlier part of the day.
 * The brief lands in today's thread; the reply only says what happened.
 */
export async function callDailyBrief(reason: 'first_open' | 'rewrite'): Promise<
  CortexClientResult<{
    ok?: boolean;
    skipped?: string;
    thread_id?: string;
    brief_id?: string;
    part?: string;
    offer_kind?: string;
  }>
> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'daily-brief', reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Daily brief in Chat: the plan picker. 'pick' chooses which of today's
 * candidates go in a plan (each with a time-of-day window and a reason) and
 * words Gremly's line before the card; 'edit' reads a change typed while a
 * plan is open. The app places everything itself (lib/plan/slotFitter.ts).
 */
export interface PlanPickRequest {
  mode: 'pick' | 'edit';
  /** Minutes from local midnight */
  now: number;
  gap_from: number;
  pool: {
    id: string;
    kind: 'todo' | 'habit' | 'reach';
    title: string;
    minutes: number | null;
    why: string;
    window: [number, number] | null;
    /** Kept for today in Sweep just now: always in the plan */
    kept?: boolean;
  }[];
  meetings: { title: string; start: number; end: number }[];
  /** Set times the day is planned around (lib/brief/dayRecord.ts) */
  fixed?: { title: string; start: number; end: number | null; travel: boolean }[];
  /** Today's travel, and when they set off */
  travel?: { label: string | null; departs: number | null } | null;
  /** Nothing is planned after this (minutes from local midnight) */
  plan_end?: number;
  live_plan?: { id: string; start: number; end: number }[];
  text?: string;
  /** The day being planned (YYYY-MM-DD); tomorrow plans without today's context */
  for_day?: string;
  /** Their answer when Gremly asked what has to happen or comes first */
  asked?: string;
}

export interface PlanPickResponse {
  intro?: string | null;
  picks?: {
    id: string;
    window: [number, number];
    minutes: number;
    estimated: boolean;
    reason: string | null;
  }[];
  isPlanChange?: boolean;
  ops?: { op: 'remove' | 'add' | 'move'; id: string; window: [number, number] | null }[];
}

export async function callPlanPick(
  req: PlanPickRequest,
): Promise<CortexClientResult<PlanPickResponse>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'plan-pick', ...req }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** One change on the day turn's card (workers/inngest-jobs/brief/dayTurn.js). */
export interface DayChange {
  /** c1, c2, … within its card */
  cid: string;
  kind:
    | 'create_todo'
    | 'retime'
    | 'move_day'
    | 'rename'
    | 'complete'
    | 'cancel'
    | 'skip_habit'
    | 'add_block'
    | 'remove_block'
    | 'plan_add'
    | 'plan_remove'
    | 'plan_move';
  /** The card's words, written by the worker from the change */
  label: string;
  /** The item or set time it changes */
  id?: string;
  item?: 'todo' | 'habit';
  title: string;
  /** Minutes from local midnight */
  start?: number | null;
  end?: number | null;
  day?: string;
  minutes?: number | null;
  travel?: boolean;
  /** rename: the title before */
  was?: string;
}

export interface DayTurnRequest {
  text: string;
  question: string | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  date: string;
  /** Minutes from local midnight */
  now: number;
  items: {
    id: string;
    kind: 'todo' | 'habit';
    title: string;
    due_day: string | null;
    due_time: string | null;
    minutes: number | null;
    note: string;
    /** A step of a milestone set up in their weekly review: the goal it is towards */
    towards?: string | null;
    /** A habit they are breaking: never given a place in the plan */
    breaking?: boolean;
  }[];
  /** The intention of the week this day is in, in their words */
  intention?: string | null;
  meetings: { title: string; start: number; end: number }[];
  record: {
    travel: { label: string | null; departs: number | null } | null;
    blocks: { id: string; title: string; start: number; end: number | null; travel: boolean }[];
    plan_end: number;
  };
  plan: {
    status: 'proposal' | 'locked';
    items: { id: string; kind: string; title: string; start: number; end: number }[];
  } | null;
}

export interface DayTurnResponse {
  about_day: boolean;
  checklist?: { ask: string; status: 'proposed' | 'needs_answer' | 'not_possible' | 'noted' }[];
  changes?: DayChange[];
  reply?: string | null;
  model?: string;
  prompt_version?: string;
}

/** A message typed in today's thread, read against the day (the day turn). */
export async function callDayTurn(
  req: DayTurnRequest,
): Promise<CortexClientResult<DayTurnResponse>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'day-turn', ...req }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** One ask on the agent's task list in today's thread (workers/cortex/agent/tasks.js). */
export interface AgentTask {
  ask: string;
  status: 'open' | 'proposed' | 'needs_answer' | 'done' | 'not_possible' | 'dropped';
}

/**
 * Tonight's wrap up, sent with a message typed while it is under way, so
 * Gremly knows where it is (workers/cortex/agent/brief.js readWrap).
 */
export interface WrapTurnContext {
  step: string;
  /** Tonight's cards: the item's id and kind, what they decided, and what it was before when it moved */
  decisions: { id?: string; type?: string; title: string; outcome: string; was?: string }[];
  /** The question this message answers, when it answers one */
  answering?: {
    question: string;
    item: { id: string; kind: string; title: string; when?: string } | null;
  } | null;
}

/**
 * The person's week, sent with a message in today's thread by an app build
 * that knows it (workers/cortex/agent/brief.js readWeek). With it Gremly is
 * told one line about their week and gets the week's tools and changes: an
 * app that sends it must be able to draw the week's button (offer) and to
 * hold the review on its step (hold) when the answer says so.
 */
export interface WeekTurnContext {
  /** Their weekly day, 0 Sunday to 6 Saturday */
  weekly_day: number;
  /** The days of the week that count as days off */
  days_off: number[];
  /** The review for the week they are in, as its row has it, or null when there is none */
  review: {
    week_start: string;
    span_start: string;
    status: 'ready' | 'started' | 'done' | 'skipped';
    kind: 'weekly' | 'extra' | 'brought_forward';
  } | null;
  /** The one extra review of the week has been used */
  extra_used: boolean;
  /** Hours free on each kind of day, in half hours, once the week has them */
  hours?: { normal_day?: number; busy_day?: number; weekend_day?: number } | null;
  /** The week's busy days, YYYY-MM-DD */
  busy_days?: string[];
  /** The week's intention and the note that holds it */
  intention?: { id: string | null; text: string } | null;
  /**
   * What matters most this week as it stands, each in its own words. Sending
   * it says this build can keep a new one (the change model's priority), so
   * Gremly may offer to add one; a build that leaves it out is never offered it.
   */
  priorities?: string[];
  /** The review, while one is under way in the thread */
  under_way?: {
    /** Where it is (workers/shared/week.js WEEK_STEPS) */
    step: string;
    /** The days being planned, first and last */
    first: string;
    last: string;
    /** The first day of the week they belong to: before first when the review started part way through */
    week_start?: string;
    /** What Gremly's read opened with */
    challenge?: { headline: string; why?: string } | null;
    /** Gremly's picks for what matters most, each with the todos it covers */
    picks?: { text: string; item_ids: string[] }[];
    /**
     * Everything settled so far, in the app's words: what kind of thing
     * (priority, hours, busy_days, intention, milestone, needs_you,
     * habit_days, day, later), the item it is about when it is one, how it is
     * now and what it was before
     */
    settled?: {
      kind: string;
      id?: string;
      item_ids?: string[];
      type?: 'todo' | 'habit' | 'note';
      title: string;
      outcome: string;
      was?: string;
    }[];
    /** The board as the review has it, none of it saved until they finish */
    habit_days?: { id: string; days: string[] }[];
    placed?: { id: string; day: string }[];
    later?: { id: string; back_on: string }[];
    /** The needs you card they opened to talk through, when the message is about it */
    about?: {
      title: string;
      item_ids: string[];
      stuck_because?: string;
      question?: string;
    } | null;
    /** The question Gremly's last reply left the review waiting on (the answer's hold.question) */
    hold?: string | null;
  } | null;
  /**
   * The habits paused or on a lighter version from today on, empty when none
   * are. Sending the list at all tells the worker this build can apply a
   * change to one (the change model's ease), so only then is Gremly able to
   * offer it.
   */
  eased?: {
    habit_id: string;
    title: string;
    mode: 'pause' | 'lighter';
    first: string;
    last: string;
    note: string;
  }[];
}

export interface BriefTurnRequest extends DayTurnRequest {
  /** Where they are, for their calendar and their day */
  timezone: string;
  /** The agent's task list so far in today's thread */
  tasks: AgentTask[];
  /** Today's thread, so a correction said in it is filed against it */
  chat_id: string;
  /** Tonight's wrap up, when the message is typed while it is under way */
  wrap?: WrapTurnContext;
  /** Their week, from an app build that can show the weekly review */
  week?: WeekTurnContext;
}

/**
 * One question put to cortex and answered as server-sent events, asked once.
 *
 * Left alone, the stream library posts its request again every five seconds
 * after a stream ends, which sends the same message a second time. Here it is
 * told never to (pollingInterval 0). A stream that ends without its answer
 * then says nothing more, so the worker pings while it works and silence is
 * how a lost line shows: the call fails after quietMs with nothing heard, and
 * when its whole time (timeoutMs) is up.
 *
 * read is handed each event and settles the call by giving its result;
 * undefined leaves the call waiting.
 */
function askOnce<T>(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
  opts: {
    timeoutMs: number;
    quietMs: number;
    read: (data: Record<string, unknown>) => CortexClientResult<T> | undefined;
  },
): Promise<CortexClientResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let quiet: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      // asked once: a stream that ends is never posted again
      pollingInterval: 0,
      lineEndingCharacter: '\n',
    });
    const finish = (r: CortexClientResult<T>) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (quiet) clearTimeout(quiet);
      es.close();
      resolve(r);
    };
    // a stream that ends without its answer says nothing more: the silence is how it shows
    const listen = () => {
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(
        () => finish({ ok: false, error: 'the connection went quiet' }),
        opts.quietMs,
      );
    };
    timer = setTimeout(() => finish({ ok: false, error: 'timed out' }), opts.timeoutMs);
    listen();
    es.addEventListener('message', (event: { data?: string | null }) => {
      if (settled) return;
      listen();
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(event.data ?? '');
      } catch {
        return;
      }
      if (!data) return;
      if (data.error === 'read_only') {
        eventBus.emit('cortex:read_only', {});
        finish({ ok: false, error: 'read_only' });
        return;
      }
      const result = opts.read(data);
      if (result) finish(result);
    });
    es.addEventListener('error', (event) =>
      finish({
        ok: false,
        error: String((event as { message?: string } | null)?.message || 'stream error'),
      }),
    );
  });
}

/**
 * The weekly review's read, for a review opened today
 * (workers/inngest-jobs/week). The week's row comes back with the read it
 * holds when that serves a review started today; otherwise one is made there
 * and then, which takes most of a minute, so this is called behind the
 * review's loading screen. The answer comes as server-sent events, with a ping
 * every few seconds while the read is made, so the phone keeps waiting. A read
 * that was being made when the call failed may still have been finished and
 * kept on the week's row (the worker carries on for a short while after the
 * phone stops listening): read the row again (getWeekReview) before asking a
 * second time.
 */
export interface WeekReadResponse {
  /** A read was made for this call; false when the week already held one that serves */
  made: boolean;
  /**
   * What a review opened today is: by the date rules, or the review already
   * under way in this week when there is one (workers/shared/week.js reviewWith)
   */
  on: {
    kind: ReviewKind;
    promoted: boolean;
    fresh: boolean;
    /** A review started on an earlier day, carried on with the read it began with */
    resumed?: boolean;
    week_start: string;
    span_start: string;
    span_end: string;
  };
  /** The week's row, with its read */
  review: WeekReviewRow;
}

/**
 * @param req date is the person's day in the app (DateService today)
 * @param opts timeoutMs is how long to wait for a read being made (two minutes
 *   unless given); quietMs is how long the line may stay silent before the
 *   call counts as lost (pings come every eight seconds)
 */
export async function callWeekRead(
  /** first: the first day the review plans from, when it is opened in the evening and that is tomorrow */
  req: { date: string; first?: string | null },
  opts: { timeoutMs?: number; quietMs?: number } = {},
): Promise<CortexClientResult<WeekReadResponse>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  if (isAiDisabled()) return { ok: false, error: 'AI disabled' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  return askOnce<WeekReadResponse>(
    baseUrl,
    token,
    { type: 'week-read', date: req.date, first: req.first ?? null },
    {
      timeoutMs: opts.timeoutMs ?? 120000,
      quietMs: opts.quietMs ?? 30000,
      read: (data) => {
        // pings only keep the connection open while the read is made
        if (!data.done) return undefined;
        if (data.error) return { ok: false, error: String(data.error) };
        const answer = { ...data };
        delete answer.done;
        const got = answer as unknown as WeekReadResponse;
        return got.review?.read
          ? { ok: true, data: got }
          : { ok: false, error: 'no read came back' };
      },
    },
  );
}

/**
 * The spread for the review under way (cortex week-spread, inngest-jobs
 * week/spread.js): which of their todos Gremly puts on which day, made from
 * the answers the week's row holds now. It takes about twenty seconds and is
 * kept on the row, so when the call fails the row may still have it.
 */
export interface WeekSpreadResponse {
  on: WeekReadResponse['on'];
  spread: WeekSpread;
}

/**
 * @param req date is the person's day in the app; board is their own moves on
 *   the board, which are not saved until they finish and which a spread never
 *   moves
 */
export async function callWeekSpread(
  req: {
    date: string;
    /** The first day being planned as the app has it: tomorrow for a review opened in the evening */
    first?: string | null;
    board?: {
      placed: { id: string; day: string }[];
      later: { id: string; back_on: string }[];
      habit_days: { id: string; days: string[] }[];
      /** a habit paused, on a lighter version or set back to usual on the board, not saved yet */
      habit_ease?: { id: string; mode: 'pause' | 'lighter' | 'usual' }[];
    } | null;
  },
  opts: { timeoutMs?: number; quietMs?: number } = {},
): Promise<CortexClientResult<WeekSpreadResponse>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  if (isAiDisabled()) return { ok: false, error: 'AI disabled' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  return askOnce<WeekSpreadResponse>(
    baseUrl,
    token,
    { type: 'week-spread', date: req.date, first: req.first ?? null, board: req.board ?? null },
    {
      timeoutMs: opts.timeoutMs ?? 90000,
      quietMs: opts.quietMs ?? 30000,
      read: (data) => {
        // pings only keep the connection open while the spread is made
        if (!data.done) return undefined;
        if (data.error) return { ok: false, error: String(data.error) };
        const answer = { ...data };
        delete answer.done;
        const got = answer as unknown as WeekSpreadResponse;
        return Array.isArray(got.spread?.place)
          ? { ok: true, data: got }
          : { ok: false, error: 'no spread came back' };
      },
    },
  );
}

/**
 * What answered a message in today's thread: the agent (agent plan step 7),
 * or the day turn when the agent is switched off or could not finish.
 */
export type BriefTurnResponse =
  | {
      engine: 'agent';
      reply: string;
      /** The card, in the change model's shape: nothing changes until they tap */
      card: Change[];
      tasks: AgentTask[];
      /** The weekly review stays on its step until they answer the question Gremly asked */
      hold?: { question: string };
      /** The button to their week goes under the reply; done when this week's review is */
      offer?: { kind: 'week'; done: boolean };
      model?: string;
      prompt_version?: string;
    }
  | ({ engine: 'day_turn'; agent_error?: string } & DayTurnResponse);

/**
 * A message typed in today's thread (workers/cortex/agent/brief.js). Status
 * lines come through onStatus while Gremly works; the answer resolves once.
 * The message is sent once (askOnce): when the stream ends without its answer
 * the call fails, and it is never posted again behind the person's back.
 */
export async function callBriefTurn(
  req: BriefTurnRequest,
  opts: { onStatus?: (line: string) => void; timeoutMs?: number; quietMs?: number } = {},
): Promise<CortexClientResult<BriefTurnResponse>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  if (isAiDisabled()) return { ok: false, error: 'AI disabled' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  return askOnce<BriefTurnResponse>(
    baseUrl,
    token,
    { type: 'brief-turn', ...req },
    {
      // the agent's budget plus the day turn behind it, with room to spare
      timeoutMs: opts.timeoutMs ?? 30000,
      // the worker pings every five seconds while the turn runs
      quietMs: opts.quietMs ?? 15000,
      read: (data) => {
        if (typeof data.status === 'string') {
          opts.onStatus?.(data.status);
          return undefined;
        }
        if (!data.done) return undefined;
        if (data.error) return { ok: false, error: String(data.error) };
        const answer = { ...data };
        delete answer.done;
        return { ok: true, data: answer as unknown as BriefTurnResponse };
      },
    },
  );
}

/**
 * Notification Lab (testers): a real send through the real sender to this
 * person's own phones, marked as a test. The server checks the tester flag.
 */
export async function callNotificationTest(
  moment: string,
  words?: { title?: string; body: string },
): Promise<CortexClientResult<{ ok?: boolean; dedupe_key?: string }>> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return { ok: false, error: '[cortex] Missing EXPO_PUBLIC_CORTEX_URL' };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'not signed in' };
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'notification-test', moment, words: words ?? null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error)
      return { ok: false, error: String(data?.error || res.status), status: res.status };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
