// lib/cortex/diag.ts
// Dev-only Cortex proxy diagnostics
import { callComplete } from './CortexClient';
import { env } from '../env';

export async function runCortexProxyDiag() {
  const started = Date.now();
  console.log('[CORTEX] DIAG start', {
    url: env.cortexUrl,
    model: env.cortex.model,
    timeoutMs: env.cortex.timeoutMs,
  });

  try {
    const data = await callComplete('Say hi', { maxTokens: 8 });
    console.log('[CORTEX] DIAG ok', {
      ms: Date.now() - started,
      id: data?.id ?? 'no-id',
    });
    return { ok: true, data };
  } catch (e: any) {
    console.log('[CORTEX] DIAG fail', {
      ms: Date.now() - started,
      error: e?.message || String(e),
    });
    return { ok: false, error: e?.message || String(e) };
  }
}
