/**
 * Classification Wrapper
 *
 * Routes to V1 or V2 classifier based on feature flag.
 * Handles shadow comparison when V2 is in shadow mode.
 */

import { classifyV2, ClassifyResult } from './classifyV2';
import { runShadowIfEnabled, V1Result } from './shadowCompare';
import { FF_CLASSIFY_V2, FF_CLASSIFY_V2_SHADOW } from '../../env';

export interface ClassifyInput {
  text: string;
  // V1 result passed in when running shadow mode
  v1Result?: V1Result;
}

export interface ClassifyOutput {
  type: 'todo' | 'habit' | 'log';
  subtype?: 'journal' | 'idea' | 'general';
  mode: 'auto' | 'chips' | 'default';
  confidence: number;
  showChips: boolean;
  chipOptions?: Array<{ kind: string; label: string }>;
  reason?: string;
  classifier: 'v1' | 'v2';
}

/**
 * Map V2 result to unified output format
 */
function mapV2ToOutput(result: ClassifyResult): ClassifyOutput {
  return {
    type: result.type,
    subtype: result.subtype,
    mode: result.mode,
    confidence: result.confidence,
    showChips: result.mode === 'chips',
    chipOptions: result.chipOptions,
    reason: result.reason,
    classifier: 'v2',
  };
}

/**
 * Map V1 result to unified output format
 */
function mapV1ToOutput(result: V1Result): ClassifyOutput {
  const type = result.type === 'unsorted' ? 'log' : result.type;
  const mode = result.mode === 'ask' ? 'chips' : result.mode === 'keep' ? 'default' : 'auto';

  return {
    type: type as 'todo' | 'habit' | 'log',
    subtype: result.subtype as any,
    mode,
    confidence: result.confidence,
    showChips: result.mode === 'ask',
    classifier: 'v1',
  };
}

/**
 * Classify text using V1 or V2 based on feature flag
 *
 * @param input - Text to classify and optional V1 result for shadow mode
 * @returns Unified classification output
 */
export function classifyWithFlag(input: ClassifyInput): ClassifyOutput {
  const { text, v1Result } = input;

  // If V2 is fully enabled, use it
  if (FF_CLASSIFY_V2) {
    const v2Result = classifyV2(text);
    return mapV2ToOutput(v2Result);
  }

  // If shadow mode is enabled and we have V1 result, run comparison
  if (FF_CLASSIFY_V2_SHADOW && v1Result) {
    runShadowIfEnabled(text, v1Result, true);
  }

  // Return V1 result (or default if not provided)
  if (v1Result) {
    return mapV1ToOutput(v1Result);
  }

  // Fallback: run V2 anyway if no V1 result
  // This shouldn't happen in production but provides safety
  const v2Result = classifyV2(text);
  return mapV2ToOutput(v2Result);
}

/**
 * Check if V2 classifier is enabled
 */
export function isV2Enabled(): boolean {
  return FF_CLASSIFY_V2;
}

/**
 * Check if shadow mode is enabled
 */
export function isShadowEnabled(): boolean {
  return !FF_CLASSIFY_V2 && FF_CLASSIFY_V2_SHADOW;
}
