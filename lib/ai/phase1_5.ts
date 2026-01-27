/**
 * Phase 1.5: Ambiguity Detection
 *
 * Runs after Phase 1 classification to detect if an input is ambiguous
 * and needs user clarification before proceeding.
 *
 * Triggers when:
 * - Short input (≤5 words) + classified as log + has temporal info
 * - Pattern matches "noun + date" without clear action verb
 * - Could legitimately be multiple bucket types
 */

import { env } from '../env';
import { dateService } from '../date/DateService';

// ============================================================================
// Patterns for detecting ambiguity triggers
// ============================================================================

const TEMPORAL_PATTERN =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|tonight|next\s+week|this\s+week|next\s+month|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|\d{1,2}(st|nd|rd|th)?)\b/i;

const ACTION_VERB_PATTERN =
  /\b(call|book|buy|get|make|send|pay|submit|cancel|schedule|pick\s*up|remind|text|email|finish|complete|do|start|stop|quit)\b/i;

const FREQUENCY_PATTERN =
  /\b(every\s+(day|morning|evening|night|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|twice\s+a\s+(day|week)|(\d+)x?\s*(per|a)\s*(day|week))\b/i;

const EMOTIONAL_PATTERN =
  /\b(feeling|felt|anxious|stressed|overwhelmed|grateful|happy|sad|frustrated|worried|excited|nervous|calm|angry|tired|exhausted)\b/i;

// ============================================================================
// Types
// ============================================================================

export interface Phase1_5Result {
  is_ambiguous: boolean;
  reason?: string;
  question?: string;
  options?: Array<{
    id: string;
    label: string;
    action: {
      bucket: 'todo' | 'habit' | 'log';
      subtype?: string | null;
      target_date: boolean;
      scheduled_date: boolean;
      habit_subtype?: string | null;
    };
  }>;
  confirmation_message?: string;
  latency_ms?: number;
}

export interface ShouldRunResult {
  shouldRun: boolean;
  detectedTemporal: string | null;
}

// ============================================================================
// Trigger Logic
// ============================================================================

/**
 * Determines if Phase 1.5 ambiguity check should run.
 * Returns the detected temporal pattern if it should run, null otherwise.
 */
export function shouldRunPhase1_5(
  text: string,
  phase1Bucket: string,
  _phase1Subtype: string | null,
  phase1Confidence: number,
): ShouldRunResult {
  const trimmedText = text.trim();
  const wordCount = trimmedText.split(/\s+/).length;

  // Extract temporal match if present
  const temporalMatch = trimmedText.match(TEMPORAL_PATTERN);
  const detectedTemporal = temporalMatch ? temporalMatch[0] : null;

  // Check patterns
  const hasTemporalInfo = !!detectedTemporal;
  const hasActionVerb = ACTION_VERB_PATTERN.test(trimmedText);
  const hasFrequency = FREQUENCY_PATTERN.test(trimmedText);
  const hasEmotionalContent = EMOTIONAL_PATTERN.test(trimmedText);
  const isShort = wordCount <= 5;
  const classifiedAsLog = phase1Bucket === 'log';

  // Decision logic

  // Don't run if:
  // 1. Clear action verb present (unless also has date and is short)
  // 2. Explicit frequency (clearly a habit)
  // 3. Emotional content (clearly a journal)
  // 4. Phase 1 was very confident AND has action verb

  if (hasFrequency) {
    // Explicit frequency = clear habit intent
    return { shouldRun: false, detectedTemporal: null };
  }

  if (hasEmotionalContent) {
    // Emotional content = clear journal intent
    return { shouldRun: false, detectedTemporal: null };
  }

  if (hasActionVerb && phase1Confidence >= 0.8) {
    // Clear action + high confidence = trust Phase 1
    return { shouldRun: false, detectedTemporal: null };
  }

  // DO run if:
  // 1. Has temporal info + classified as log + short + no action verb
  // 2. Very short input (<=3 words) + classified as log
  // 3. Has temporal info + no action verb + classified as log

  if (hasTemporalInfo && classifiedAsLog && !hasActionVerb) {
    // Pattern: "dentist Tuesday", "gym Monday", "mom birthday March 5"
    return { shouldRun: true, detectedTemporal };
  }

  if (isShort && classifiedAsLog && !hasActionVerb && wordCount <= 3) {
    // Very short ambiguous input: "standing desk", "new laptop"
    return { shouldRun: true, detectedTemporal };
  }

  if (hasTemporalInfo && isShort && !hasActionVerb) {
    // Short + date + no clear action
    return { shouldRun: true, detectedTemporal };
  }

  return { shouldRun: false, detectedTemporal: null };
}

// ============================================================================
// API Call
// ============================================================================

/**
 * Calls the Phase 1.5 ambiguity detection endpoint
 */
export async function runPhase1_5(
  text: string,
  bucket: string,
  subtype: string | null,
  detectedTemporal: string | null,
): Promise<Phase1_5Result> {
  const currentDate = dateService.today();
  const apiUrl = env.cortexUrl;

  if (!apiUrl) {
    console.log('[Phase1.5] No cortex URL configured');
    return { is_ambiguous: false, reason: 'no_api_url' };
  }

  const t0 = Date.now();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clarify-ambiguity',
        text,
        bucket,
        subtype,
        detectedTemporal,
        currentDate,
      }),
    });

    const latency = Date.now() - t0;

    if (!response.ok) {
      console.log('[Phase1.5] HTTP error', { status: response.status, latency_ms: latency });
      return { is_ambiguous: false, reason: 'http_error', latency_ms: latency };
    }

    const result = (await response.json()) as Phase1_5Result;
    console.log('[Phase1.5] Result', {
      is_ambiguous: result.is_ambiguous,
      question: result.question?.substring(0, 30),
      options_count: result.options?.length ?? 0,
      latency_ms: latency,
    });

    return { ...result, latency_ms: latency };
  } catch (error) {
    const latency = Date.now() - t0;
    console.log('[Phase1.5] Request error', { error: String(error), latency_ms: latency });
    return { is_ambiguous: false, reason: 'request_error', latency_ms: latency };
  }
}

// ============================================================================
// Combined Check Function
// ============================================================================

/**
 * Convenience function that combines the trigger check and API call.
 * Returns the Phase 1.5 result if ambiguity was detected, null otherwise.
 */
export async function checkAmbiguity(
  text: string,
  phase1Bucket: string,
  phase1Subtype: string | null,
  phase1Confidence: number,
): Promise<Phase1_5Result | null> {
  const { shouldRun, detectedTemporal } = shouldRunPhase1_5(
    text,
    phase1Bucket,
    phase1Subtype,
    phase1Confidence,
  );

  if (!shouldRun) {
    console.log('[Phase1.5] Skipping - trigger conditions not met');
    return null;
  }

  console.log('[Phase1.5] Running ambiguity check', {
    text: text.substring(0, 30),
    detectedTemporal,
    phase1Bucket,
  });

  const result = await runPhase1_5(text, phase1Bucket, phase1Subtype, detectedTemporal);

  if (!result.is_ambiguous) {
    console.log('[Phase1.5] Not ambiguous:', result.reason);
    return null;
  }

  return result;
}
