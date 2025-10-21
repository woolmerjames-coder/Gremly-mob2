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
    function normalize(d: any) {
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
      data: { id: norm.id, content: norm.content, model: norm.model, usage: norm.usage },
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

export const CortexClient = { callChat, callComplete };
