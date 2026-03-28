/**
 * Shadow Comparison Logger
 *
 * Runs V2 classifier in parallel with V1 and logs differences.
 * Used during gradual rollout to validate V2 accuracy.
 */

import { classifyV2, ClassifyResult } from './classifyV2';
import { getDateService } from '../../date/DateService';

export interface V1Result {
  type: 'todo' | 'habit' | 'log' | 'unsorted';
  subtype?: string;
  confidence: number;
  mode: 'auto' | 'ask' | 'keep';
}

export interface ComparisonResult {
  input: string;
  v1: V1Result;
  v2: ClassifyResult;
  agreement: boolean;
  typeMatch: boolean;
  modeMatch: boolean;
  timestamp: number;
}

/**
 * Compare V1 and V2 classification results
 */
export function compareClassifications(input: string, v1Result: V1Result): ComparisonResult {
  const v2Result = classifyV2(input);

  // Normalize V1 type (unsorted → log)
  const v1Type = v1Result.type === 'unsorted' ? 'log' : v1Result.type;

  // Normalize V1 mode
  const v1Mode = v1Result.mode === 'keep' ? 'default' : v1Result.mode;
  const v2Mode = v2Result.mode === 'chips' ? 'ask' : v2Result.mode;

  const typeMatch = v1Type === v2Result.type;
  const modeMatch = v1Mode === v2Mode;
  const agreement = typeMatch && modeMatch;

  return {
    input: input.slice(0, 100), // Truncate for logging
    v1: v1Result,
    v2: v2Result,
    agreement,
    typeMatch,
    modeMatch,
    timestamp: getDateService().now().getTime(),
  };
}

/**
 * Log comparison result (sends to telemetry)
 */
export function logShadowComparison(comparison: ComparisonResult): void {
  // Only log disagreements to reduce noise
  if (comparison.agreement) return;

  console.log('[ClassifyV2:Shadow]', {
    input: comparison.input,
    v1Type: comparison.v1.type,
    v1Mode: comparison.v1.mode,
    v2Type: comparison.v2.type,
    v2Mode: comparison.v2.mode,
    v2Layer: comparison.v2.layer,
    v2Reason: comparison.v2.reason,
    typeMatch: comparison.typeMatch,
    modeMatch: comparison.modeMatch,
  });

  // TODO: Send to telemetry service
  // logTelemetry('classify_v2_shadow', comparison);
}

/**
 * Run shadow comparison if enabled
 */
export function runShadowIfEnabled(
  input: string,
  v1Result: V1Result,
  shadowEnabled: boolean,
): void {
  if (!shadowEnabled) return;

  try {
    const comparison = compareClassifications(input, v1Result);
    logShadowComparison(comparison);
  } catch (error) {
    // Don't let shadow logging break production
    console.error('[ClassifyV2:Shadow] Error:', error);
  }
}
