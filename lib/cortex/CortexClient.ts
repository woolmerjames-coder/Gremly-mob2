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

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

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
  const baseUrl = readCortexUrl();

  if (!baseUrl) {
    const message = '[cortex] Missing EXPO_PUBLIC_CORTEX_URL';
    log('CONFIG_MISSING', message);
    return { ok: false, error: message };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), toMs(env.cortex.timeoutMs));
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
      timeoutMs: env.cortex.timeoutMs,
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

    const json = await res.json();

    if (!json?.ok) {
      log('PROXY_ERROR', json?.error);
      return { ok: false, error: `[cortex] proxy_error ${json?.error || 'unknown'}` };
    }

    log('OK', json?.data?.id ?? 'no-id');
    return { ok: true, data: json.data };
  } catch (e: any) {
    const message = e?.name === 'AbortError' ? '[cortex] request aborted' : e?.message || String(e);
    log('EXCEPTION', message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
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
