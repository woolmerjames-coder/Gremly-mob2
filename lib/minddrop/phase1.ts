/**
 * Phase 1 Classification
 *
 * Runs heuristic classification immediately, then confirms/corrects with AI.
 * Uses a 4-second timeout to ensure fast UX.
 *
 * v2.1 (2026-01-02): Added habitSubtype for build/break habit detection
 * v2.2 (2026-01-08): Moved Phase1Result to types.ts, added multi-entity support
 */

import type { MindDropBucket, LogSubtype, Phase1Result } from './types';
import type { HabitSubtype } from '../types';
import { heuristicClassify } from './heuristicClassify';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { env, getEnv } from '../env';

// --- Types ---

// Phase1Result is now defined in ./types.ts
export type { Phase1Result };

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
 * @returns Phase1Result with bucket, subtype, habitSubtype, confidence, and source
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
      habitSubtypeHint: heuristic.habitSubtypeHint,
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
      habitSubtype:
        heuristic.bucket === 'habit' ? (heuristic.habitSubtypeHint ?? 'start_habit') : null,
      confidence: heuristic.confidence,
      source: 'heuristic',
      is_multi: false,
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
            habitSubtypeHint: heuristic.habitSubtypeHint,
          },
        }),
      });

      if (!res.ok) {
        console.log('[Phase1] API returned non-ok status', { status: res.status });
        return null;
      }

      const json = await res.json();
      // Don't validate bucket here - multi-entity responses won't have top-level bucket
      // Validation happens after the multi-entity check below
      return json;
    } catch (err) {
      console.log('[Phase1] API error', { error: String(err) });
      return null;
    }
  })();

  // 3. Race API call against timeout
  const apiResult = await Promise.race([apiPromise, timeoutPromise]);

  console.log('[Phase1:DEBUG] Raw API response:', JSON.stringify(apiResult, null, 2));

  // 4. If API failed or timed out, return heuristic fallback
  if (!apiResult) {
    console.log('[Phase1] Using heuristic fallback (timeout or error)');
    return {
      bucket: heuristic.bucket,
      subtype: heuristic.bucket === 'log' ? (heuristic.subtypeHint ?? 'general') : null,
      habitSubtype:
        heuristic.bucket === 'habit' ? (heuristic.habitSubtypeHint ?? 'start_habit') : null,
      confidence: heuristic.confidence,
      source: 'heuristic-fallback',
      is_multi: false,
    };
  }

  // 5. API succeeded - check for multi-entity response FIRST (no bucket at top level)
  if (apiResult.is_multi === true && Array.isArray(apiResult.items) && apiResult.items.length > 1) {
    console.log('[Phase1:Multi] Detected', {
      item_count: apiResult.items.length,
      summary: apiResult.summary_title,
    });
    return {
      is_multi: true,
      items: apiResult.items,
      summary_title: apiResult.summary_title || '',
      confidence: apiResult.confidence ?? 0.7,
      source: apiResult.source || 'api',
      // For backward compatibility, use first item's classification as primary
      bucket: apiResult.items[0]?.bucket || 'log',
      subtype: apiResult.items[0]?.subtype || null,
      habitSubtype: apiResult.items[0]?.habitSubtype || null,
    };
  }

  // 6. THEN check for missing bucket (single-item validation)
  if (!apiResult.bucket) {
    console.log('[Phase1] API response missing bucket', { json: apiResult });
    return {
      bucket: heuristic.bucket,
      subtype: heuristic.bucket === 'log' ? (heuristic.subtypeHint ?? 'general') : null,
      habitSubtype:
        heuristic.bucket === 'habit' ? (heuristic.habitSubtypeHint ?? 'start_habit') : null,
      confidence: heuristic.confidence,
      source: 'heuristic-fallback',
      is_multi: false,
    };
  }

  // 7. Single-entity response - compare buckets
  const apiBucket = apiResult.bucket as MindDropBucket;
  const apiSubtype = apiResult.subtype as LogSubtype | null;
  const apiHabitSubtype = apiResult.habitSubtype as HabitSubtype | null;
  const apiConfidence = typeof apiResult.confidence === 'number' ? apiResult.confidence : 0.7;

  const sameAsBucket = heuristic.bucket === apiBucket;

  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1] API result', {
      apiBucket,
      apiSubtype,
      apiHabitSubtype,
      apiConfidence,
      heuristicBucket: heuristic.bucket,
      heuristicHabitSubtype: heuristic.habitSubtypeHint,
      agreed: sameAsBucket,
      latency_ms: apiResult.latency_ms,
    });
  }

  // 6. Determine final result
  const finalBucket = apiBucket;
  const finalSubtype = finalBucket === 'log' ? (apiSubtype ?? 'general') : null;

  // For habits: use API habitSubtype if provided, fall back to heuristic, then default
  let finalHabitSubtype: HabitSubtype | null = null;
  if (finalBucket === 'habit') {
    finalHabitSubtype = apiHabitSubtype ?? heuristic.habitSubtypeHint ?? 'start_habit';
  }

  const source = sameAsBucket ? 'heuristic-confirmed' : 'api';

  console.log('[Phase1] Final classification', {
    bucket: finalBucket,
    subtype: finalSubtype,
    habitSubtype: finalHabitSubtype,
    confidence: apiConfidence,
    source,
    smart_title: apiResult.smart_title || null,
    confirmation_message: apiResult.confirmation_message || null,
    // Ambiguity detection (triggers Phase 1.5 in background)
    is_ambiguous: apiResult.is_ambiguous || false,
    ambiguity_reason: apiResult.ambiguity_reason || null,
    // Legacy clarification fields (may be populated by Phase 1.5 later)
    needs_clarification: apiResult.needs_clarification || false,
    clarification_type: apiResult.clarification_type || null,
    clarification_question: apiResult.clarification_question || null,
    clarification_options: apiResult.clarification_options || null,
  });

  return {
    bucket: finalBucket,
    subtype: finalSubtype,
    habitSubtype: finalHabitSubtype,
    confidence: apiConfidence,
    source,
    is_multi: false,
    // Early enrichment fields (enables typewriter to start after Phase 1)
    smart_title: apiResult.smart_title || null,
    confirmation_message: apiResult.confirmation_message || null,
    // Ambiguity detection (triggers Phase 1.5 in background)
    is_ambiguous: apiResult.is_ambiguous || false,
    ambiguity_reason: apiResult.ambiguity_reason || null,
    // Clarification fields (populated by Phase 1.5 asynchronously)
    needs_clarification: apiResult.needs_clarification || false,
    clarification_type: apiResult.clarification_type || null,
    clarification_question: apiResult.clarification_question || null,
    clarification_options: apiResult.clarification_options || null,
  };
}
