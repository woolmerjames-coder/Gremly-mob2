/**
 * AI-Powered Tag Extraction
 *
 * Extracts meaningful tags using AI classification with strong filtering.
 * Falls back to deterministic extraction on any error.
 *
 * Rules:
 * - ONLY extracts: proper names, specific topics, concrete objects, activities
 * - EXCLUDES: verbs (think, feel), adjectives, filler words
 * - 3-6 tags max
 * - Validates and filters all responses
 */

import { callClassify } from '../cortex/CortexClient';

/**
 * Validate and normalize a single tag string.
 * Returns normalized tag or null if invalid.
 */
function validateTag(tag: string): string | null {
  if (typeof tag !== 'string') return null;

  // Lowercase and trim
  let normalized = tag.toLowerCase().trim();

  // Strip punctuation except hyphens
  normalized = normalized.replace(/[^\w\s-]/g, '');

  // Replace multiple spaces/hyphens with single hyphen
  normalized = normalized.replace(/[\s-]+/g, '-');

  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  // Must be at least 3 characters (unless it's a proper noun abbreviation)
  if (normalized.length < 3) return null;

  // Only allow alphanumeric and single hyphens
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) return null;

  return normalized;
}

/**
 * Extract tags using AI classification.
 *
 * @param text - The text to extract tags from
 * @returns Promise resolving to array of validated tags (empty on error)
 */
export async function extractTagsAI(text: string): Promise<string[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const result = await callClassify({
      text: text.slice(0, 500), // Limit to 500 chars
      timeoutMs: 3000, // 3 second timeout
    });

    if (!result.ok) {
      // AI failed - return empty to trigger fallback
      return [];
    }

    // Try to parse tags from the classification response
    // The AI might return tags in the category field or as a JSON string
    let tagsData: any = null;

    // First, try to parse category as JSON array
    try {
      tagsData = JSON.parse(result.classification.category);
    } catch {
      // If category isn't JSON, check if tags field exists
      if (result.classification.tags && Array.isArray(result.classification.tags)) {
        tagsData = result.classification.tags;
      } else {
        // Try parsing the entire category as a comma-separated list
        const categoryText = result.classification.category.trim();
        if (categoryText.startsWith('[') && categoryText.endsWith(']')) {
          try {
            tagsData = JSON.parse(categoryText);
          } catch {
            return [];
          }
        } else {
          return [];
        }
      }
    }

    // Validate it's an array
    if (!Array.isArray(tagsData)) {
      return [];
    }

    // Validate and normalize each tag
    const validTags = tagsData.map(validateTag).filter((tag): tag is string => tag !== null);

    // Deduplicate
    const uniqueTags = Array.from(new Set(validTags));

    // Enforce max 6 tags
    const limitedTags = uniqueTags.slice(0, 6);

    return limitedTags;
  } catch (error) {
    // Any error → return empty array to trigger fallback
    console.log('[extractTagsAI] Error, will use fallback:', error);
    return [];
  }
}
