/**
 * Phase 1 Classification (v3.0 - Unified Flow)
 *
 * Calls the classify-phase1-v2 endpoint which handles:
 * 1. Pre-phase semantic parsing (extracts structural facts)
 * 2. Heuristic mapping (deterministic bucket assignment for clear cases)
 * 3. Conditional Phase 1 AI (only when heuristics can't decide)
 *
 * The worker returns either a fast-path heuristic result or a full AI classification.
 * This client code just handles the timeout and fallback logic.
 *
 * v2.1 (2026-01-02): Added habitSubtype for build/break habit detection
 * v2.2 (2026-01-08): Moved Phase1Result to types.ts, added multi-entity support
 * v3.0 (2026-02-01): Migrated to classify-phase1-v2 with preparse+heuristic flow
 */

import type { MindDropBucket, LogSubtype, Phase1Result } from './types';
import type { HabitSubtype } from '../types';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { env, getEnv } from '../env';

// --- Types ---

// Phase1Result is now defined in ./types.ts
export type { Phase1Result };

export interface ClassifyContext {
  hasAttachments?: boolean;
  spaceId?: string | null;
  hasUserSelectedDate?: boolean;
}

// --- Helpers ---

const PHASE1_TIMEOUT_MS = 8000;

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
 * Run Phase 1 classification via the unified classify-phase1-v2 endpoint.
 *
 * The worker handles:
 * 1. Pre-phase semantic parsing (gpt-4o-mini, ~200-300ms)
 * 2. Heuristic mapping (deterministic rules for clear cases)
 * 3. Full Phase 1 AI (only when heuristics return needsPhase1: true)
 *
 * This function just handles timeout and fallback logic.
 *
 * @param text - The text to classify
 * @param context - Additional context (hasAttachments, spaceId)
 * @returns Phase1Result with bucket, subtype, habitSubtype, confidence, and source
 */

// Dev-only: inline degraded simulation state (avoids __tests__ import that breaks Metro)
let _degradedCallsRemaining = 0;
export function simulateDegradedClassification(count: number = 1): void {
  if (__DEV__) _degradedCallsRemaining = count;
}

export async function runPhase1(
  text: string,
  context: ClassifyContext = {},
): Promise<Phase1Result> {
  const { hasAttachments = false, hasUserSelectedDate = false } = context;

  // Dev-only: simulate degraded classification for testing hardening
  if (__DEV__ && _degradedCallsRemaining > 0) {
    _degradedCallsRemaining--;
    console.log(
      `[TestHardening] Simulating degraded classification (${_degradedCallsRemaining} remaining)`,
    );
    return {
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      confidence: 0.5,
      source: 'heuristic-fallback',
      is_multi: false,
      reminder_intent: false,
      classificationDegraded: true,
      classificationSource: 'test-simulation',
    };
  }

  // Get cortex URL and auth
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[Phase1] Missing cortex URL or anon key, using fallback');
    return {
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      confidence: 0.5,
      source: 'heuristic-fallback',
      is_multi: false,
      reminder_intent: false,
      classificationDegraded: true,
      classificationSource: 'client-fallback',
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
          type: 'classify-phase1-v2',
          text,
          hasAttachments,
          hasUserSelectedDate,
        }),
      });

      if (!res.ok) {
        console.log('[Phase1] API returned non-ok status', { status: res.status });
        return null;
      }

      const json = await res.json();
      return json;
    } catch (err) {
      console.log('[Phase1] API error', { error: String(err) });
      return null;
    }
  })();

  // Race API call against timeout
  const apiResult = await Promise.race([apiPromise, timeoutPromise]);

  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1:DEBUG] Raw API response:', JSON.stringify(apiResult, null, 2));
  }

  // If API failed or timed out, return fallback
  if (!apiResult) {
    console.log('[Phase1] Using fallback (timeout or error)');
    return {
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      confidence: 0.5,
      source: 'heuristic-fallback',
      is_multi: false,
      reminder_intent: false,
      classificationDegraded: true,
      classificationSource: 'client-fallback',
    };
  }

  // Log timing information from the response
  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1] Timing', {
      preparse_latency_ms: apiResult.preparse_latency_ms,
      phase1_latency_ms: apiResult.phase1_latency_ms,
      total_latency_ms: apiResult.latency_ms,
      source: apiResult.source,
      heuristic_reason: apiResult.heuristic_reason,
    });
  }

  const DEGRADED_SOURCES = [
    'preparse-fallback',
    'phase1-fallback',
    'phase1-error-fallback',
    'heuristic-fallback',
  ];

  // Check for multi-entity response
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
      reminder_intent: apiResult.reminder_intent === true,
      classificationDegraded: DEGRADED_SOURCES.includes(apiResult.source),
      classificationSource: apiResult.source || 'unknown',
    };
  }

  // Validate bucket exists for single-item response
  if (!apiResult.bucket) {
    console.log('[Phase1] API response missing bucket', { json: apiResult });
    return {
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      confidence: 0.5,
      source: 'heuristic-fallback',
      is_multi: false,
      reminder_intent: false,
      classificationDegraded: true,
      classificationSource: 'client-fallback',
    };
  }

  // Single-entity response
  const finalBucket = apiResult.bucket as MindDropBucket;
  const finalSubtype = (
    finalBucket === 'log' ? (apiResult.subtype ?? 'general') : null
  ) as LogSubtype | null;
  const finalHabitSubtype = (
    finalBucket === 'habit' ? (apiResult.habitSubtype ?? 'start_habit') : null
  ) as HabitSubtype | null;
  const confidence = typeof apiResult.confidence === 'number' ? apiResult.confidence : 0.7;
  const isDegraded = DEGRADED_SOURCES.includes(apiResult.source);

  if (isDegraded) {
    console.warn('[Phase1] Classification degraded — will retry', {
      source: apiResult.source,
      bucket: finalBucket,
    });
  }

  console.log('[Phase1] Final classification', {
    bucket: finalBucket,
    subtype: finalSubtype,
    habitSubtype: finalHabitSubtype,
    confidence,
    source: apiResult.source,
    heuristic_reason: apiResult.heuristic_reason,
    is_ambiguous: apiResult.is_ambiguous || false,
    ambiguity_type: apiResult.ambiguity_type || null,
  });

  return {
    bucket: finalBucket,
    subtype: finalSubtype,
    habitSubtype: finalHabitSubtype,
    confidence,
    source: apiResult.source || 'api',
    is_multi: false,
    classificationDegraded: isDegraded,
    classificationSource: apiResult.source || 'unknown',
    // Ambiguity detection (triggers Phase 1.5 in background)
    is_ambiguous: apiResult.is_ambiguous || false,
    ambiguity_reason: apiResult.ambiguity_reason || null,
    ambiguity_type: apiResult.ambiguity_type || null,
    plausible_interpretations: apiResult.plausible_interpretations || null,
    // Clarification fields (populated by Phase 1.5 asynchronously)
    needs_clarification: apiResult.needs_clarification || false,
    clarification_type: apiResult.clarification_type || null,
    clarification_question: apiResult.clarification_question || null,
    clarification_options: apiResult.clarification_options || null,
    reminder_intent: apiResult.reminder_intent === true,
  };
}
