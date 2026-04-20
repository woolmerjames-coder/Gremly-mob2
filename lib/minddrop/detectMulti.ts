/**
 * Detect Multi - Phase 0 of Mind Drop pipeline
 *
 * Detects if the input contains multiple distinct items before classification.
 * Used to short-circuit multi-entity drops.
 */

import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';

// ============================================================================
// Types
// ============================================================================

export interface DetectMultiResult {
  is_multi: boolean;
  segments?: Array<{ text: string; likely_bucket: string; likely_subtype?: string }>;
  summary?: string;
  confidence?: number;
  dominant_bucket?: string; // Most common bucket type across segments
  dominant_subtype?: string; // Subtype hint for log bucket (journal, idea, general)
}

// ============================================================================
// Environment Helpers
// ============================================================================

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

// ============================================================================
// Main Function
// ============================================================================

/**
 * Phase 0: Detect if the input contains multiple distinct items.
 * Runs BEFORE Phase 1 to short-circuit multi-entity drops.
 *
 * @param text - The input text to analyze
 * @returns DetectMultiResult with is_multi flag and optional segments
 */
export async function detectMulti(text: string): Promise<DetectMultiResult> {
  const cortexUrl = readCortexUrl();
  const sessionToken = await getSessionToken();

  if (!cortexUrl) {
    console.log('[DetectMulti] Missing cortex URL, skipping');
    return { is_multi: false };
  }

  try {
    const response = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken && { Authorization: `Bearer ${sessionToken}` }),
      },
      body: JSON.stringify({
        type: 'detect-multi',
        text,
      }),
    });

    if (!response.ok) {
      console.warn('[DetectMulti] Request failed:', response.status);
      return { is_multi: false };
    }

    const result = await response.json();
    console.log('[DetectMulti] Result:', {
      is_multi: result.is_multi,
      segmentCount: result.segments?.length,
      summary: result.summary,
      segments: result.segments,
      dominant_bucket: result.dominant_bucket,
      dominant_subtype: result.dominant_subtype,
    });
    return result;
  } catch (err) {
    console.warn('[DetectMulti] Error:', err);
    return { is_multi: false };
  }
}

export default detectMulti;
