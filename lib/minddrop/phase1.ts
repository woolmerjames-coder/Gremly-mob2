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
import { getSessionToken } from '../cortex/getSessionToken';
import { dateService, getDateService } from '../date/DateService';
import { mapWorkerOptions, normalizeAmbiguityType } from './clarification';

// --- Types ---

// Phase1Result is now defined in ./types.ts
export type { Phase1Result };

export interface ClassifyContext {
  hasAttachments?: boolean;
  spaceId?: string | null;
  hasUserSelectedDate?: boolean;
}

// --- Helpers ---

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
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
  const sessionToken = await getSessionToken();

  if (!cortexUrl) {
    console.log('[Phase1] Missing cortex URL, using fallback');
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

  // Create API call promise
  const apiPromise = (async () => {
    try {
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken && { Authorization: `Bearer ${sessionToken}` }),
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

  const apiResult = await apiPromise;

  if (FEATURE_FLAGS.HEURISTIC_LOGGING_ENABLED) {
    console.log('[Phase1:DEBUG] Raw API response:', JSON.stringify(apiResult, null, 2));
  }

  // If API call failed (network error or non-ok status), return fallback.
  // Timeouts are handled by dropPhases.ts withTimeout(15000).
  if (!apiResult) {
    console.log('[Phase1] API call failed');
    return {
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      confidence: 0.5,
      source: 'heuristic-fallback',
      is_multi: false,
      reminder_intent: false,
      classificationDegraded: true,
      classificationSource: 'api-error',
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

// ─────────────────────────────────────────────────────────────────────────────
// classify-v3: single-call classifier
// ─────────────────────────────────────────────────────────────────────────────

/** detect-multi compatible shape, so handleQueued can use v3 for both. */
export interface ClassifyV3Multi {
  is_multi: boolean;
  segments?: Array<{
    text: string;
    bucket: MindDropBucket;
    subtype: LogSubtype | null;
    habitSubtype: HabitSubtype | null;
    likely_bucket?: string;
    likely_subtype?: string | null;
    /** a piece the classifier could not settle, with its own question (piece_questions) */
    is_ambiguous?: boolean;
    ambiguity_type?: string | null;
    clarification_question?: string | null;
    clarification_options?: ReturnType<typeof mapWorkerOptions>;
  }>;
  summary?: string;
  dominant_bucket?: string;
  dominant_subtype?: string | null;
  /** v3.8: clear splits are saved as their pieces, unsure ones as one item that asks */
  split?: 'clear' | 'unsure' | null;
  /**
   * The classifier's own call, whatever CLASSIFY_SPLIT_AUTO made of it (null
   * when it gave none, or from a Worker before the final check), for the
   * split telemetry
   */
  split_said?: 'clear' | 'unsure' | null;
  /** v3.8: the drop's kind kept as one item (null when the classifier gave none) */
  as_one?: {
    bucket: MindDropBucket;
    subtype: LogSubtype | null;
    habitSubtype: HabitSubtype | null;
  } | null;
}

function readKind(raw: unknown): {
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  habitSubtype: HabitSubtype | null;
} | null {
  const k = raw as Record<string, any> | null;
  if (!k || typeof k !== 'object' || !['todo', 'habit', 'log'].includes(k.bucket)) return null;
  const bucket = k.bucket as MindDropBucket;
  return {
    bucket,
    subtype: (bucket === 'log' ? (k.subtype ?? 'general') : null) as LogSubtype | null,
    habitSubtype: (bucket === 'habit'
      ? (k.habitSubtype ?? 'start_habit')
      : null) as HabitSubtype | null,
  };
}

export interface ClassifyV3Result {
  phase1: Phase1Result;
  multi: ClassifyV3Multi;
  latencyMs: number | null;
}

/**
 * Run the single-call classify-v3 endpoint. One request returns the
 * classification, the multi split and, when ambiguous, the clarifying
 * question and options.
 *
 * Returns null on ANY failure (disabled, non-OK, bad shape, network) so the
 * caller can fall back to the v2 path (detect-multi + classify-phase1-v2).
 * Timeouts are applied by the caller (dropPhases.ts).
 */
export async function runClassifyV3(
  text: string,
  context: ClassifyContext = {},
  timeoutMs?: number,
): Promise<ClassifyV3Result | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl || !text?.trim()) return null;

  // Abort the request itself on timeout so a slow call does not keep running
  // in the background after the pipeline has moved on to the v2 fallback.
  const controller =
    timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const abortTimer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const sessionToken = await getSessionToken();
    const ds = getDateService();
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: ds.getTimezone(),
    }).format(ds.dayNow());

    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken && { Authorization: `Bearer ${sessionToken}` }),
      },
      body: JSON.stringify({
        type: 'classify-v3',
        text,
        hasUserSelectedDate: context.hasUserSelectedDate === true,
        currentDate: dateService.today(),
        dayOfWeek,
        timezone: ds.getTimezone(),
        // Mind Drop rethink stage 4: a piece of a split may ask its own question,
        // and the question writer runs after the sort (clarify-ambiguity), so it
        // never holds up the kind
        piece_questions: true,
        write_question: false,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      console.log('[ClassifyV3] non-OK, falling back to v2', { status: res.status });
      return null;
    }

    const json = await res.json();
    const validBuckets = ['todo', 'habit', 'log'];
    if (!json || !validBuckets.includes(json.bucket)) {
      console.log('[ClassifyV3] bad shape, falling back to v2');
      return null;
    }

    const bucket = json.bucket as MindDropBucket;
    const isAmbiguous = json.is_ambiguous === true;
    const options = isAmbiguous ? mapWorkerOptions(json.clarification_options, 'log') : null;

    const phase1: Phase1Result = {
      bucket,
      subtype: (bucket === 'log' ? (json.subtype ?? 'general') : null) as LogSubtype | null,
      habitSubtype: (bucket === 'habit'
        ? (json.habitSubtype ?? 'start_habit')
        : null) as HabitSubtype | null,
      confidence: typeof json.confidence === 'number' ? json.confidence : 0.8,
      source: 'api',
      engine: 'v3',
      is_multi: false,
      classificationDegraded: false,
      classificationSource: json.was_fallback ? 'v3-fallback-model' : 'v3',
      is_ambiguous: isAmbiguous,
      ambiguity_type: isAmbiguous ? normalizeAmbiguityType(json.ambiguity_type) : null,
      ambiguity_reason: json.ambiguity_reason ?? null,
      plausible_interpretations: json.plausible_interpretations ?? null,
      needs_clarification: isAmbiguous,
      clarification_question:
        isAmbiguous && typeof json.clarification_question === 'string'
          ? json.clarification_question
          : null,
      clarification_options: options,
      reminder_intent: json.reminder_intent === true,
    };

    const segments = Array.isArray(json.segments) ? json.segments : [];
    const multi: ClassifyV3Multi =
      json.is_multi === true && segments.length > 1
        ? {
            is_multi: true,
            segments: segments.map((seg: any) => {
              const pieceAsks = seg.is_ambiguous === true;
              return {
                text: String(seg.text || ''),
                bucket: (validBuckets.includes(seg.bucket) ? seg.bucket : 'log') as MindDropBucket,
                subtype: seg.subtype ?? null,
                habitSubtype: seg.habitSubtype ?? null,
                likely_bucket: seg.likely_bucket ?? seg.bucket,
                likely_subtype: seg.likely_subtype ?? seg.subtype ?? null,
                is_ambiguous: pieceAsks,
                ambiguity_type: pieceAsks ? normalizeAmbiguityType(seg.ambiguity_type) : null,
                clarification_question:
                  pieceAsks && typeof seg.clarification_question === 'string'
                    ? seg.clarification_question
                    : null,
                clarification_options: pieceAsks
                  ? mapWorkerOptions(seg.clarification_options, 'log')
                  : null,
              };
            }),
            summary: json.summary || text.substring(0, 60),
            dominant_bucket: json.dominant_bucket || 'log',
            dominant_subtype: json.dominant_subtype ?? null,
            // The classifier decides; a missing split asks (unsure), and a
            // missing kind as one stays missing (saved as a note, logged by the caller)
            split: json.split === 'clear' ? 'clear' : 'unsure',
            split_said:
              json.split_said === 'clear' || json.split_said === 'unsure' ? json.split_said : null,
            as_one: readKind(json.as_one),
          }
        : { is_multi: false };

    console.log('[ClassifyV3] result', {
      bucket: phase1.bucket,
      subtype: phase1.subtype,
      is_ambiguous: isAmbiguous,
      ambiguity_type: phase1.ambiguity_type,
      is_multi: multi.is_multi,
      split: multi.split ?? null,
      model: json.model,
      latency_ms: json.latency_ms,
    });

    return {
      phase1,
      multi,
      latencyMs: typeof json.latency_ms === 'number' ? json.latency_ms : null,
    };
  } catch (err) {
    console.log('[ClassifyV3] request failed, falling back to v2', { error: String(err) });
    return null;
  } finally {
    if (abortTimer) clearTimeout(abortTimer);
  }
}
