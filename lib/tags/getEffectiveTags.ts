/**
 * Unified Tag Extraction Pipeline
 *
 * Primary entry point for tag extraction across the app.
 * Attempts AI extraction first, falls back to deterministic patterns.
 *
 * Usage:
 * ```ts
 * const tags = await getEffectiveTags(text);
 * ```
 */

import { extractTagsAI } from './extractTagsAI';
import { extractMeaningfulTags } from './extractTags';

/**
 * Extract tags using AI-first approach with deterministic fallback.
 *
 * Strategy:
 * 1. Try AI extraction (3s timeout)
 * 2. If AI returns tags, use them
 * 3. Otherwise, use deterministic fallback
 *
 * @param text - The text to extract tags from
 * @returns Promise resolving to array of tags (may be empty)
 */
export async function getEffectiveTags(text: string): Promise<string[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Try AI extraction first
  try {
    const aiTags = await extractTagsAI(text);

    if (aiTags.length > 0) {
      return aiTags;
    }
  } catch (error) {
    // AI failed, will fall back to deterministic
  }

  // Fall back to deterministic extraction (v3 with @person/@place support)
  const fallbackTags = extractMeaningfulTags(text);

  return fallbackTags;
}
