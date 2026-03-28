// lib/cortex/diag.ts
// Dev-only Cortex proxy diagnostics
import { callComplete } from './CortexClient';
import { env } from '../env';
import { getDateService } from '../date/DateService';

export async function runCortexProxyDiag() {
  const started = getDateService().now().getTime();
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
        ms: getDateService().now().getTime() - started,
        id: data?.id ?? 'no-id',
      });
      return { ok: true, data };
    }

    console.log('[CORTEX] DIAG fail', {
      ms: getDateService().now().getTime() - started,
      error: result.error,
    });
    return { ok: false, error: result.error };
  } catch (e: any) {
    const error = e?.message || String(e);
    console.log('[CORTEX] DIAG fail', {
      ms: getDateService().now().getTime() - started,
      error,
    });
    return { ok: false, error };
  }
}
