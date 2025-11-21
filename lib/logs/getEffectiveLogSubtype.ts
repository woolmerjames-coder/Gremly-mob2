/**
 * Get Effective Log Subtype
 *
 * Production-ready wrapper for AI-powered log subtype classification.
 * Always attempts AI classification first, with automatic fallback to deterministic patterns.
 *
 * This is the primary entry point for subtype classification in async contexts.
 * Use this instead of calling classifyLogSubtype directly.
 *
 * @param text - The log body text to classify
 * @returns Promise resolving to one of: 'journal' | 'list' | 'reference' | 'idea' | 'plain'
 */

import { classifyLogSubtype, type LogSubtype } from '../cortex/classifyLogSubtype';

export async function getEffectiveLogSubtype(text: string): Promise<LogSubtype> {
  // AI classification with built-in fallback to deterministic patterns
  // The classifyLogSubtype function already handles:
  // 1. AI attempt with 3s timeout
  // 2. Response validation (only accepts valid LogSubtype values)
  // 3. Automatic fallback to classifyLogSubtypeSync on any error
  // 4. Empty text handling

  const subtype = await classifyLogSubtype(text);

  return subtype;
}
