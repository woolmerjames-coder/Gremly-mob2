// lib/cortex/CortexClient.ts
// Typed client for Supabase Edge Function cortex-proxy
// NO OpenAI keys in client code
import { env, getEnv } from '../env';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const toMs = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : 12000);

const log = (...a: any[]) => {
  if (__DEV__) console.log('[CORTEX]', ...a);
};
export type CortexClientResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

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

/**
 * Unified Mind Drop Classifier - Worker Response Types
 *
 * The Cloudflare Worker returns a unified classification schema with bucket/type/subtype.
 * This follows the "master classifier spec" where:
 * - bucket is the ground truth category
 * - type is derived from bucket (todo/habit/log/ignore)
 * - subtype is derived from log buckets (journal/idea/general)
 * - confidence is 0-100 (not 0-1)
 * - unsorted is rare, used only for true junk/gibberish
 * - log-general is the default for meaningful content that doesn't fit elsewhere
 *
 * Worker response shape:
 * {
 *   id: "chatcmpl-...",
 *   classification: {
 *     bucket: "todo" | "habit" | "log-journal" | "log-idea" | "log-general" | "unsorted",
 *     type: "todo" | "habit" | "log" | "ignore",
 *     subtype: "journal" | "idea" | "general" | null,
 *     category: string,      // freeform label (for display/debug only, NOT source of truth)
 *     tags: string[],
 *     spaceName: string | null,
 *     confidence: number,    // 0-100 scale
 *     title: string          // AI-generated title (always non-empty, trimmed)
 *   },
 *   aiTitle: string,          // same as classification.title (for backward compat)
 *   aiTagsDebug: string[]     // debug copy of tags
 * }
 */

export type MindDropBucket =
  | 'todo'
  | 'habit'
  | 'log-journal'
  | 'log-idea'
  | 'log-general'
  | 'unsorted';

export type MindDropType = 'todo' | 'habit' | 'log' | 'ignore';

export type MindDropSubtype = 'journal' | 'idea' | 'general' | null;

export interface MindDropClassification {
  bucket: MindDropBucket;
  type: MindDropType;
  subtype: MindDropSubtype;
  category: string; // Freeform label for display/debug only
  tags: string[];
  spaceName: string | null;
  confidence: number; // 0-100 scale
  title: string; // Always non-empty, trimmed
}

export interface MindDropClassifierResponse {
  id: string;
  classification: MindDropClassification;
  aiTitle: string;
  aiTagsDebug: string[];
}

export type CallClassifyResult =
  | {
      ok: true;
      id: string;
      classification: MindDropClassification;
      aiTitle: string;
      aiTagsDebug: string[];
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

    // Primary format: Cloudflare Worker unified classification response
    // { id: "chatcmpl-...", classification: { bucket, type, subtype, category, tags, ... }, aiTitle, aiTagsDebug }
    if (data.id && data.classification) {
      const classification = data.classification;

      // Validate new unified classification structure
      if (
        typeof classification === 'object' &&
        typeof classification.bucket === 'string' &&
        typeof classification.type === 'string' &&
        Array.isArray(classification.tags) &&
        typeof classification.confidence === 'number'
      ) {
        // Extract all fields from unified response
        const bucket = classification.bucket as MindDropBucket;
        const type = classification.type as MindDropType;
        const subtype = (classification.subtype || null) as MindDropSubtype;
        const category = String(classification.category || bucket); // Fallback to bucket if missing
        const tags = classification.tags;
        const spaceName = classification.spaceName ?? null;
        const confidence = classification.confidence; // Already 0-100 from worker
        const title =
          typeof classification.title === 'string' && classification.title.trim().length > 0
            ? classification.title.trim()
            : 'Untitled';

        // Extract top-level aiTitle and aiTagsDebug (for backward compat)
        const aiTitle = typeof data.aiTitle === 'string' ? data.aiTitle : title;
        const aiTagsDebug = Array.isArray(data.aiTagsDebug) ? data.aiTagsDebug : tags;

        log('OK', data.id, `bucket=${bucket}, type=${type}, conf=${confidence}`);
        return {
          ok: true,
          id: String(data.id),
          classification: {
            bucket,
            type,
            subtype,
            category,
            tags,
            spaceName,
            confidence,
            title,
          },
          aiTitle,
          aiTagsDebug,
        };
      }

      // Defensive fallback: Worker sent classification but missing required fields
      // Default to safe log-general classification
      console.warn('[CORTEX] Worker classification missing required fields, using fallback', {
        classification,
      });
      return {
        ok: true,
        id: String(data.id),
        classification: {
          bucket: 'log-general' as MindDropBucket,
          type: 'log' as MindDropType,
          subtype: 'general' as MindDropSubtype,
          category: String(classification.category || 'log'),
          tags: Array.isArray(classification.tags) ? classification.tags : [],
          spaceName: classification.spaceName ?? null,
          confidence:
            typeof classification.confidence === 'number' ? classification.confidence : 50,
          title:
            typeof classification.title === 'string' && classification.title.trim().length > 0
              ? classification.title.trim()
              : 'Untitled note',
        },
        aiTitle: typeof data.aiTitle === 'string' ? data.aiTitle : 'Untitled note',
        aiTagsDebug: Array.isArray(data.aiTagsDebug) ? data.aiTagsDebug : [],
      };
    }

    // Fallback format: Legacy OpenAI-shaped response (should not happen with new worker)
    // Try to parse bucket/type/subtype from message.content JSON if present
    const messageContent = data?.choices?.[0]?.message?.content;
    if (messageContent) {
      try {
        const parsed = JSON.parse(messageContent);

        // Check if it has the new unified format
        if (typeof parsed === 'object' && typeof parsed.bucket === 'string') {
          const bucket = parsed.bucket as MindDropBucket;
          const type = parsed.type as MindDropType;
          const subtype = (parsed.subtype || null) as MindDropSubtype;
          const category = String(parsed.category || bucket);
          const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          const spaceName = parsed.spaceName ?? null;
          const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 50;
          const title =
            typeof parsed.title === 'string' && parsed.title.trim().length > 0
              ? parsed.title.trim()
              : 'Untitled';

          const id = String(data.id || 'classify-' + Math.random().toString(36).slice(2));
          log('OK', id, '(fallback OpenAI format with unified schema)');
          return {
            ok: true,
            id,
            classification: {
              bucket,
              type,
              subtype,
              category,
              tags,
              spaceName,
              confidence,
              title,
            },
            aiTitle: title,
            aiTagsDebug: tags,
          };
        }

        // Legacy format fallback: map old "category" to new bucket/type/subtype
        if (typeof parsed === 'object' && typeof parsed.category === 'string') {
          const legacyCategory = parsed.category.toLowerCase();
          let bucket: MindDropBucket;
          let type: MindDropType;
          let subtype: MindDropSubtype;

          // Map legacy category to unified bucket/type/subtype
          if (legacyCategory === 'todo' || legacyCategory === 'task') {
            bucket = 'todo';
            type = 'todo';
            subtype = null;
          } else if (legacyCategory === 'habit') {
            bucket = 'habit';
            type = 'habit';
            subtype = null;
          } else if (legacyCategory === 'ignore' || legacyCategory === 'none') {
            bucket = 'unsorted';
            type = 'ignore';
            subtype = null;
          } else {
            // Default to log-general for any other category
            bucket = 'log-general';
            type = 'log';
            subtype = 'general';
          }

          const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          const spaceName = parsed.spaceName ?? null;
          const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 50;
          const title =
            typeof parsed.title === 'string' && parsed.title.trim().length > 0
              ? parsed.title.trim()
              : 'Untitled';

          const id = String(data.id || 'classify-' + Math.random().toString(36).slice(2));
          log('OK', id, '(legacy format, mapped to unified schema)');
          return {
            ok: true,
            id,
            classification: {
              bucket,
              type,
              subtype,
              category: parsed.category,
              tags,
              spaceName,
              confidence,
              title,
            },
            aiTitle: title,
            aiTagsDebug: tags,
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

export const CortexClient = { callChat, callComplete, callClassify };
