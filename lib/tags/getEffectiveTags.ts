/**
 * Unified Tag Extraction Pipeline
 *
 * Primary entry point for tag extraction across the app.
 * Attempts AI extraction first, then merges with deterministic name detection.
 *
 * Usage:
 * ```ts
 * const tags = await getEffectiveTags(text);
 * ```
 */

import { extractTagsAI } from './extractTagsAI';
import { extractTagsV2, tagsToArray } from './extractTagsV2';

/**
 * Extract tags using AI + deterministic hybrid approach.
 *
 * Strategy:
 * 1. Always run V2 extraction for name detection (@mentions)
 * 2. Try AI extraction for additional topic tags
 * 3. Merge: V2 names (@mentions) + AI topic tags (filtered against names)
 * 4. If AI fails, fall back to V2 entirely
 *
 * @param text - The text to extract tags from
 * @returns Promise resolving to array of tags (may be empty)
 */
export async function getEffectiveTags(text: string): Promise<string[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Always run V2 for name detection (this gives us @mentions)
  const v2Result = extractTagsV2(text, { maxKeywords: 4 });
  const v2Mentions = v2Result.mentions.map((m) => `@${m}`);
  const v2MentionNames = new Set(v2Result.mentions.map((m) => m.toLowerCase()));

  // Try AI extraction for topic/keyword tags
  try {
    const aiTags = await extractTagsAI(text);

    if (aiTags.length > 0) {
      // Filter AI tags:
      // - Remove any that match names we already detected (avoid "john" when we have "@john")
      // - Keep only topic tags
      const filteredAiTags = aiTags.filter((tag) => {
        const normalized = tag.toLowerCase().replace(/^[#@]/, '');
        return !v2MentionNames.has(normalized);
      });

      // Merge: @mentions first, then AI topic tags
      const merged = [...v2Mentions, ...filteredAiTags];
      return [...new Set(merged)]; // Deduplicate
    }
  } catch (error) {
    // AI failed, will use V2 entirely
  }

  // Fall back to deterministic v2 extraction entirely
  const fallbackTags = tagsToArray(v2Result);
  return fallbackTags;
}
