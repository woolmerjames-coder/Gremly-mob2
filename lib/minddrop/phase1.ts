/**
 * Phase 1 Classification
 *
 * Runs heuristic classification immediately, then confirms/corrects with AI.
 * Uses a 2-second timeout to ensure fast UX.
 */

import type { MindDropBucket, LogSubtype } from './types';
import { heuristicClassify } from './heuristicClassify';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { env, getEnv } from '../env';

// --- Types ---

export interface Phase1Result {
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  confidence: number;
  source: 'heuristic' | 'api' | 'heuristic-confirmed' | 'heuristic-fallback';
}

export interface ClassifyContext {
  hasAttachments?: boolean;
  spaceId?: string | null;
}

// --- Helpers ---

const PHASE1_TIMEOUT_MS = 4000;

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

// --- Main Function ---

/**
 * Run Phase 1 classification: heuristic first, then API confirmation.
 *
 * @param text - The text to classify
 * @param context - Additional context (hasAttachments, spaceId)
 * @returns Phase1Result with bucket, subtype, confidence, and source
 */
export async function runPhase1(
  text: string,
  context: ClassifyContext = {},
): Promise<Phase1Result> {
  const { hasAttachments = false } = context;

  // 1. Run heuristic immediately
  const heuristic = heuristicClassify(text, { hasAttachments });

  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1] Heuristic result', {
      bucket: heuristic.bucket,
      confidence: heuristic.confidence,
      hasAttachments,
    });
  }

  // 2. Call cortex-proxy with timeout
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[Phase1] Missing cortex URL or anon key, using heuristic');
    return {
      bucket: heuristic.bucket,
      subtype: heuristic.bucket === 'log' ? (heuristic.subtypeHint ?? 'general') : null,
      confidence: heuristic.confidence,
      source: 'heuristic',
    };
  }

  // Create timeout promise
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), PHASE1_TIMEOUT_MS);
  });

  // Create API call promise
  const apiPromise = (async () => {
    try {
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          type: 'classify-phase1',
          text,
          hasAttachments,
          heuristicHint: {
            bucket: heuristic.bucket,
            confidence: heuristic.confidence,
            subtypeHint: heuristic.subtypeHint,
          },
        }),
      });

      if (!res.ok) {
        console.log('[Phase1] API returned non-ok status', { status: res.status });
        return null;
      }

      const json = await res.json();
      if (!json.ok && !json.bucket) {
        console.log('[Phase1] API response missing bucket', { json });
        return null;
      }

      return json;
    } catch (err) {
      console.log('[Phase1] API error', { error: String(err) });
      return null;
    }
  })();

  // 3. Race API call against timeout
  const apiResult = await Promise.race([apiPromise, timeoutPromise]);

  // 4. If API failed or timed out, return heuristic fallback
  if (!apiResult) {
    console.log('[Phase1] Using heuristic fallback (timeout or error)');
    return {
      bucket: heuristic.bucket,
      subtype: heuristic.bucket === 'log' ? (heuristic.subtypeHint ?? 'general') : null,
      confidence: heuristic.confidence,
      source: 'heuristic-fallback',
    };
  }

  // 5. API succeeded - compare buckets
  const apiBucket = apiResult.bucket as MindDropBucket;
  const apiSubtype = apiResult.subtype as LogSubtype | null;
  const apiConfidence = typeof apiResult.confidence === 'number' ? apiResult.confidence : 0.7;

  const sameAsBucket = heuristic.bucket === apiBucket;

  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1] API result', {
      apiBucket,
      apiSubtype,
      apiConfidence,
      heuristicBucket: heuristic.bucket,
      agreed: sameAsBucket,
      latency_ms: apiResult.latency_ms,
    });
  }

  // 6. Determine final result
  const finalBucket = apiBucket;
  const finalSubtype = finalBucket === 'log' ? (apiSubtype ?? 'general') : null;
  const source = sameAsBucket ? 'heuristic-confirmed' : 'api';

  console.log('[Phase1] Final classification', {
    bucket: finalBucket,
    subtype: finalSubtype,
    confidence: apiConfidence,
    source,
  });

  return {
    bucket: finalBucket,
    subtype: finalSubtype,
    confidence: apiConfidence,
    source,
  };
}
