/**
 * Mind Drop Decision Engine - Phase 4 Unified Classifier
 *
 * Centralized logic for deciding whether to:
 * - Auto-create entities (confident classifications)
 * - Show chips for user clarification (ambiguous classifications)
 * - Auto-open overlay (never for Mind Drop creates, only for user taps)
 *
 * MASTER CLASSIFIER SPEC:
 * - bucket ∈ ["todo","habit","log-journal","log-idea","log-general","unsorted"]
 * - type ∈ ["todo","habit","log","ignore"]
 * - subtype ∈ ["journal","idea","general",null] for logs
 *
 * AUTO-CREATE THRESHOLDS:
 * - Todo/Habit: confidence >= 70% (0.7)
 * - Log: confidence >= 60% (0.6)
 * - Unsorted: never auto-create (type='ignore')
 *
 * CHIPS SHOWN WHEN:
 * - Confidence below thresholds
 * - Worker bucket conflicts with strong rules
 * - Meaningful text but classified as unsorted
 */

import type { CanonicalIntentResult } from '../cortex/intents/canonicalIntent';

export interface MindDropDecision {
  /** Whether to auto-create the entity immediately */
  autoCreate: boolean;

  /** Whether to show category chips for user selection */
  showChips: boolean;

  /** Whether to auto-open overlay (always false for Mind Drop) */
  overlayAutoOpen: boolean;

  /** Entity type to create (if autoCreate=true) */
  entityType: 'todo' | 'habit' | 'log' | 'ignore';

  /** Log subtype (if entityType='log') */
  logSubtype: 'journal' | 'idea' | 'general' | null;

  /** Probable kind for chip emphasis */
  probableKind: 'todo' | 'habit' | 'log' | 'none';

  /** Reason for the decision (for telemetry) */
  reason: string;

  /** Raw bucket from worker */
  bucket: string;

  /** Confidence score 0-1 */
  confidence: number;
}

interface DecisionInput {
  /** Canonical intent result from worker-first classifier */
  canonicalIntent: CanonicalIntentResult;

  /** Raw user text (for gibberish detection) */
  text: string;

  /** Confidence threshold overrides (optional) */
  thresholds?: {
    todo?: number;
    habit?: number;
    log?: number;
  };
}

/**
 * Detect if text is true gibberish (no meaningful letters)
 */
function isGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // Count letter characters
  const letters = trimmed.match(/[a-zA-Z]/g);
  const letterCount = letters?.length ?? 0;

  // If less than 2 letters, it's gibberish
  if (letterCount < 2) return true;

  // If more than 80% non-alphanumeric (< 20% alphanumeric), it's gibberish
  const alphanumeric = trimmed.match(/[a-zA-Z0-9]/g);
  const alphanumericCount = alphanumeric?.length ?? 0;
  const ratio = alphanumericCount / trimmed.length;

  return ratio <= 0.2; // Changed from < to <= to catch exactly 20%
}

/**
 * Make Mind Drop decision based on unified classifier output
 *
 * Phase 4 implementation:
 * - Bucket is source of truth
 * - Confidence thresholds determine auto-create vs chips
 * - Overlay never auto-opens from Mind Drop
 *
 * @param input - Decision inputs (canonical intent, text, thresholds)
 * @returns MindDropDecision with all flags and metadata
 */
export function decideMindDropAction(input: DecisionInput): MindDropDecision {
  const { canonicalIntent, text, thresholds } = input;
  const { bucket, type, confidence, logSubtype, suppressChips, probableKind } = canonicalIntent;

  // Default thresholds (can be overridden)
  const todoThreshold = thresholds?.todo ?? 0.7;
  const habitThreshold = thresholds?.habit ?? 0.7;
  const logThreshold = thresholds?.log ?? 0.6;

  // Base decision structure
  const decision: MindDropDecision = {
    autoCreate: false,
    showChips: false,
    overlayAutoOpen: false, // Phase 2E: Never auto-open overlay from Mind Drop
    entityType: 'ignore',
    logSubtype: null,
    probableKind: probableKind ?? 'none',
    reason: '',
    bucket: bucket ?? 'unsorted',
    confidence,
  };

  // ============================================================
  // STEP 1: Handle unsorted (gibberish/junk)
  // ============================================================

  if (bucket === 'unsorted' || type === 'ignore') {
    const isReallyGibberish = isGibberish(text);

    if (isReallyGibberish) {
      // True gibberish: no chips, no create, just ignore
      decision.autoCreate = false;
      decision.showChips = false;
      decision.entityType = 'ignore';
      decision.reason = 'gibberish_no_letters';
      return decision;
    }

    // Meaningful text but classified as unsorted: show chips with log default
    decision.autoCreate = false;
    decision.showChips = true;
    decision.entityType = 'log';
    decision.logSubtype = 'general';
    decision.probableKind = 'log';
    decision.reason = 'unsorted_but_meaningful';
    return decision;
  }

  // ============================================================
  // STEP 2: Handle todos
  // ============================================================

  if (bucket === 'todo') {
    if (confidence >= todoThreshold && suppressChips) {
      // High confidence todo: auto-create, no chips, no overlay
      decision.autoCreate = true;
      decision.showChips = false;
      decision.entityType = 'todo';
      decision.reason = `confident_todo_${Math.round(confidence * 100)}`;
      return decision;
    }

    // Medium/low confidence: show chips
    decision.autoCreate = false;
    decision.showChips = true;
    decision.entityType = 'todo';
    decision.probableKind = 'todo';
    decision.reason = `ambiguous_todo_${Math.round(confidence * 100)}`;
    return decision;
  }

  // ============================================================
  // STEP 3: Handle habits
  // ============================================================

  if (bucket === 'habit') {
    if (confidence >= habitThreshold && suppressChips) {
      // High confidence habit: auto-create, no chips, no overlay
      decision.autoCreate = true;
      decision.showChips = false;
      decision.entityType = 'habit';
      decision.reason = `confident_habit_${Math.round(confidence * 100)}`;
      return decision;
    }

    // Medium/low confidence: show chips
    decision.autoCreate = false;
    decision.showChips = true;
    decision.entityType = 'habit';
    decision.probableKind = 'habit';
    decision.reason = `ambiguous_habit_${Math.round(confidence * 100)}`;
    return decision;
  }

  // ============================================================
  // STEP 4: Handle logs
  // ============================================================

  if (bucket === 'log-journal' || bucket === 'log-idea' || bucket === 'log-general') {
    // Map bucket to subtype
    let subtype: 'journal' | 'idea' | 'general' = 'general';
    if (bucket === 'log-journal') {
      subtype = 'journal';
    } else if (bucket === 'log-idea') {
      subtype = 'idea';
    }

    if (confidence >= logThreshold) {
      // High confidence log: auto-create, no chips, no overlay
      decision.autoCreate = true;
      decision.showChips = false;
      decision.entityType = 'log';
      decision.logSubtype = subtype;
      decision.probableKind = 'log';
      decision.reason = `confident_log_${subtype}_${Math.round(confidence * 100)}`;
      return decision;
    }

    // Medium/low confidence: show chips
    decision.autoCreate = false;
    decision.showChips = true;
    decision.entityType = 'log';
    decision.logSubtype = subtype;
    decision.probableKind = 'log';
    decision.reason = `ambiguous_log_${subtype}_${Math.round(confidence * 100)}`;
    return decision;
  }

  // ============================================================
  // FALLBACK: Unknown bucket, show chips with log default
  // ============================================================

  decision.autoCreate = false;
  decision.showChips = true;
  decision.entityType = 'log';
  decision.logSubtype = 'general';
  decision.probableKind = 'log';
  decision.reason = `unknown_bucket_${bucket}`;
  return decision;
}

/**
 * Get ordered chip options based on probable kind
 *
 * Emphasizes the most likely category first for better UX
 */
export function getChipOptions(probableKind: 'todo' | 'habit' | 'log' | 'none'): Array<{
  kind: 'todo' | 'log' | 'habit';
  label: string;
  emphasized: boolean;
}> {
  const baseChips = [
    { kind: 'todo' as const, label: 'Add to To-Do List', emphasized: false },
    { kind: 'log' as const, label: 'Just Save It', emphasized: false },
    { kind: 'habit' as const, label: 'Start a Habit', emphasized: false },
  ];

  // Reorder based on probable kind
  if (probableKind === 'todo') {
    baseChips[0].emphasized = true;
    return baseChips;
  } else if (probableKind === 'habit') {
    const reordered = [baseChips[2], baseChips[0], baseChips[1]];
    reordered[0].emphasized = true;
    return reordered;
  } else if (probableKind === 'log') {
    const reordered = [baseChips[1], baseChips[0], baseChips[2]];
    reordered[0].emphasized = true;
    return reordered;
  }

  // Default order for 'none'
  return baseChips;
}
