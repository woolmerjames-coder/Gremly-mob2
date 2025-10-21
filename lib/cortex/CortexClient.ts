// lib/cortex/CortexClient.ts
// Typed client for Supabase Edge Function cortex-proxy
// NO OpenAI keys in client code
import { env } from '../env';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const toMs = (n?: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : 12000);

const log = (...a: any[]) => {
  if (__DEV__) console.log('[CORTEX]', ...a);
};

async function postJSON(body: any) {
  if (!env.cortexUrl) throw new Error('[cortex] Missing EXPO_PUBLIC_CORTEX_URL');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), toMs(env.cortex.timeoutMs));

  try {
    log('POST', env.cortexUrl, {
      type: body?.type,
      model: body?.model,
      timeoutMs: env.cortex.timeoutMs,
    });

    const res = await fetch(env.cortexUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    log('STATUS', res.status);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`[cortex] ${res.status} ${txt}`);
    }

    const json = await res.json();

    if (!json?.ok) {
      log('PROXY_ERROR', json?.error);
      throw new Error(`[cortex] proxy_error ${json?.error || 'unknown'}`);
    }

    log('OK', json?.data?.id ?? 'no-id');
    return json.data;
  } catch (e: any) {
    log('EXCEPTION', e?.message || e);
    throw e;
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
