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

async function postJSON<T>(body: any): Promise<CortexClientResult<T>> {
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
      const message = `[cortex] ${res.status} ${txt || 'Unknown error'}`;
      return { ok: false, error: message, status: res.status };
    }

    // Parse response text with fallback to passthrough
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { passthrough: text };
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

    log('OK', norm.id);
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
  opts?: { model?: string; temperature?: number; maxTokens?: number },
) {
  return postJSON({
    type: 'chat',
    model: opts?.model ?? env.cortex.model,
    messages,
    temperature: opts?.temperature ?? 0.2,
    max_tokens: opts?.maxTokens ?? 400,
  });
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

    // Primary format: Cloudflare Worker response
    // { id: "cmpl-...", classification: { category, tags, spaceName, confidence } }
    if (data.id && data.classification) {
      const classification = data.classification;

      // Validate classification structure
      if (
        typeof classification === 'object' &&
        typeof classification.category === 'string' &&
        Array.isArray(classification.tags) &&
        (classification.spaceName === null || typeof classification.spaceName === 'string') &&
        typeof classification.confidence === 'number'
      ) {
        log('OK', data.id);
        return {
          ok: true,
          id: String(data.id),
          classification: {
            category: classification.category,
            tags: classification.tags,
            spaceName: classification.spaceName,
            confidence: classification.confidence,
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
        if (
          typeof parsed === 'object' &&
          typeof parsed.category === 'string' &&
          Array.isArray(parsed.tags) &&
          (parsed.spaceName === null || typeof parsed.spaceName === 'string') &&
          typeof parsed.confidence === 'number'
        ) {
          const id = String(data.id || 'classify-' + Math.random().toString(36).slice(2));
          log('OK', id, '(fallback format)');
          return {
            ok: true,
            id,
            classification: {
              category: parsed.category,
              tags: parsed.tags,
              spaceName: parsed.spaceName,
              confidence: parsed.confidence,
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

export const CortexClient = { callChat, callComplete, callClassify };
