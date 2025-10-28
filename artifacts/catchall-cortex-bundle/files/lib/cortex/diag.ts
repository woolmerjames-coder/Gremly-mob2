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
    const result = await callComplete('Say hi', { maxTokens: 8 });

    if (result.ok) {
      const data: any = result.data;
      console.log('[CORTEX] DIAG ok', {
        ms: Date.now() - started,
        id: data?.id ?? 'no-id',
      });
      return { ok: true, data };
    }

    console.log('[CORTEX] DIAG fail', {
      ms: Date.now() - started,
      error: result.error,
    });
    return { ok: false, error: result.error };
  } catch (e: any) {
    const error = e?.message || String(e);
    console.log('[CORTEX] DIAG fail', {
      ms: Date.now() - started,
      error,
    });
    return { ok: false, error };
  }
}
