/**
 * Canonical mapper for Mind Drop → todo/habit/log creation.
 * Standardizes how Mind Drop text becomes different entity types with consistent
 * field mapping AND AI-powered tag extraction.
 *
 * Title + tags are enriched here with AI assistance:
 * - Title: Prefers AI-generated compact title over raw text
 * - Tags: Extracted via AI with deterministic fallback, then filtered per-type
 *
 * Tag extraction strategy (COMPLETE PIPELINE - STAGE A ONLY):
 * 1. Use provided aiTags if available (from background prefill)
 * 2. Otherwise, call getEffectiveTags for AI extraction with fallback
 * 3. Apply domain-specific filters:
 *    - Todos: filterMindDropTodoTags (removes "book" for appointment bookings)
 *    - Habits: filterHabitTags (max 2 single-word tags)
 *    - Logs: mergeLogTags (preserves emotions + journal marker)
 * 4. Apply theme tags (applyThemeTags) - adds context tags like #work, #exercise, #health
 * 5. Apply quality filter (applyTagQualityFilter) - removes junk/stop words
 * 6. Final normalization (filterAndNormalizeTags) - dedupes and formats
 *
 * NOTE: Stage B (backgroundPrefill) NEVER modifies tags - all tag logic is here in Stage A.
 */

import { filterAndNormalizeTags } from '../tags/normalize';
import { TAG_STOP_WORDS } from '../tags/constants';
import { getEffectiveTags } from '../tags/getEffectiveTags';
import { applyThemeTags } from '../tags/themes';
import { applyTagQualityFilter } from '../tags/quality';
import { type LogSubtype } from '../cortex/classifyLogSubtype';
import { getEffectiveLogSubtype } from '../logs/getEffectiveLogSubtype';
import { normalizeTodoTitle } from './normalizeTodoTitle';

// Import domain-specific tag filters from overlay
import {
  filterMindDropTodoTags,
  sanitizeSuggestedTags,
} from '../../components/overlay/overlayV2.mapping';

export type CanonicalKind = 'todo' | 'habit' | 'log';

export interface BuildCanonicalInput {
  kind: CanonicalKind;
  rawText: string; // Full Mind Drop sentence
  aiTitle?: string; // Optional AI-generated title from Phase 2A background prefill
  aiTags?: string[]; // Optional system tags (e.g., *journal marker) - user tags owned by UnifiedOverlayV2
  existing?: Record<string, any>; // Optional existing entity for edits
}

export interface CanonicalPayload {
  // Common fields across all types
  title: string;
  tags: string[];
  tags_meta: {
    sticky: string[];
    tombstones: string[];
  };
  canonicalType: 'todo' | 'habit' | 'log';
  labels: string[];

  // Type-specific fields
  // todo: name, body/details
  // habit: name, notes
  // log: body, subtype
  name?: string; // For todo & habit
  body?: string; // For log & todo
  notes?: string; // For habit
  details?: string; // Alternative to body for todos
  subtype?: LogSubtype | null; // For logs: journal | list | reference | idea | plain
}

/**
 * Determine the effective title for a Mind Drop entity.
 * Phase 2: Prefer AI-generated title over raw text.
 *
 * @param rawText - Full Mind Drop sentence
 * @param aiTitle - Optional AI-generated title from background prefill
 * @returns AI title if available, otherwise raw text
 */
function compactTitle(rawText: string, aiTitle?: string): string {
  // Phase 2: Prefer AI-generated title from background prefill
  // If no AI title, fall back to raw text
  return (aiTitle ?? rawText).trim();
}

/**
 * Filter habit tags to meet strict requirements:
 * - Keep only single-word tags (no spaces)
 * - Prioritize tags earlier in the list (AI confidence ordering)
 * - Maximum 2 tags to keep habits focused
 * - Filter out generic/placeholder tags
 * - Filter out stop words (every, morning, daily, etc.)
 */
function filterHabitTags(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];

  const GENERIC_HABIT_TAGS = new Set([
    'doing',
    'habit',
    'routine',
    'task',
    'activity',
    'action',
    'daily',
    'practice',
  ]);

  const seen = new Set<string>();
  const singleWordTags: string[] = [];

  for (const tag of tags) {
    const normalized = tag
      .trim()
      .toLowerCase()
      .replace(/^[#@*]/, '');

    // Skip if already seen (dedupe)
    if (seen.has(normalized)) continue;

    // Remove tags with spaces (multi-word phrases)
    if (normalized.includes(' ')) continue;
    // Remove empty tags
    if (!normalized) continue;
    // Remove generic tags
    if (GENERIC_HABIT_TAGS.has(normalized)) continue;
    // Remove stop words (every, morning, daily, etc.)
    if (TAG_STOP_WORDS.has(normalized)) continue;

    seen.add(normalized);
    singleWordTags.push(normalized);
  }

  // Keep max 2 tags (prioritize earlier tags = higher AI confidence)
  return singleWordTags.slice(0, 2).map((tag) => `#${tag}`);
}

/**
 * Common emotion tags that should be prioritized for journal/log entries.
 */
const EMOTION_TAGS = new Set([
  'anxious',
  'anxiety',
  'overwhelmed',
  'stressed',
  'stress',
  'sad',
  'sadness',
  'angry',
  'anger',
  'excited',
  'excitement',
  'nervous',
  'calm',
  'peaceful',
  'grateful',
  'gratitude',
  'tired',
  'exhausted',
]);

/**
 * Check if a tag represents an emotion.
 */
function isEmotionTag(tag: string): boolean {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/^[#@*]/, '');
  return EMOTION_TAGS.has(normalized);
}

/**
 * Merge AI tags into existing log/journal tags, prioritizing emotion tags.
 *
 * For Mind Drop → log conversions, we want to:
 * 1. Always preserve *journal marker
 * 2. Keep all emotion tags (anxious, overwhelmed, stressed, etc.)
 * 3. Add 1-2 context tags from AI suggestions (meeting, walk, etc.)
 * 4. Keep the tag list short but meaningful
 * 5. Filter out junk/stop words (after, during, etc.)
 */
function mergeLogTags(existingTags: string[], aiTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addTag = (tag: string) => {
    const normalized = tag
      .trim()
      .toLowerCase()
      .replace(/^[*#@]/, '');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(`#${normalized}`);
  };

  // 1. Always preserve journal marker
  const hasJournalMarker = existingTags.some(
    (t) => t.toLowerCase() === 'journal' || t.toLowerCase() === '*journal',
  );
  if (hasJournalMarker) {
    result.push('*journal');
    seen.add('journal');
  }

  // 2. Keep all emotion tags from existing tags
  existingTags.forEach((tag) => {
    const cleaned = tag.replace(/^[*#@]/, '').trim();
    if (isEmotionTag(cleaned)) {
      addTag(cleaned);
    }
  });

  // 3. Add emotion tags from AI suggestions
  aiTags.forEach((tag) => {
    if (isEmotionTag(tag)) {
      addTag(tag);
    }
  });

  // 4. Add 1-2 context tags from AI suggestions (non-emotion tags)
  // Filter through quality filter to remove junk words
  const contextTags = aiTags.filter((tag) => !isEmotionTag(tag));
  const qualityFiltered = filterAndNormalizeTags(contextTags);
  qualityFiltered.slice(0, 2).forEach((tag) => {
    const cleaned = tag.replace(/^[*#@]/, '').trim();
    addTag(cleaned);
  });

  return result;
}

/**
 * Build tags for Mind Drop items using AI extraction with deterministic fallback.
 * Applies complete tag enrichment pipeline in Stage A:
 * 1. Extract tags (AI with fallback via getEffectiveTags)
 * 2. Apply domain-specific filtering (todos/habits/logs have different rules)
 * 3. Add theme tags (#work, #exercise, #health, etc.)
 * 4. Apply quality filter (remove junk/stop words)
 * 5. Final normalization (dedupe, format)
 *
 * @param rawText - Full Mind Drop sentence
 * @param aiTags - Optional pre-extracted tags (from background prefill)
 * @param kind - Entity type (affects filtering rules)
 * @param existingTags - For logs: existing tags to merge with AI tags
 * @returns Promise resolving to filtered, normalized tag array
 */
async function buildCleanedTags(
  rawText: string,
  aiTags: string[] | undefined,
  kind: CanonicalKind,
  existingTags?: string[],
): Promise<string[]> {
  try {
    // Step 1: Get AI tags (use provided or extract)
    let extractedTags: string[];
    if (aiTags && aiTags.length > 0) {
      // Use provided AI tags (from background prefill)
      extractedTags = aiTags;
    } else {
      // Extract tags using AI with deterministic fallback
      extractedTags = await getEffectiveTags(rawText);
    }

    // Step 2: Apply domain-specific filtering
    let domainFiltered: string[];
    switch (kind) {
      case 'todo': {
        // For todos: add # prefix and filter "book" heuristic
        const withPrefix = extractedTags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
        domainFiltered = filterMindDropTodoTags(rawText, withPrefix);
        break;
      }

      case 'habit': {
        // For habits: max 2 single-word tags
        domainFiltered = filterHabitTags(extractedTags);
        break;
      }

      case 'log': {
        // For logs: preserve *journal marker + merge emotions with context tags
        const existing = existingTags ?? [];

        // Check if this should have *journal marker (only if explicitly provided in existing tags)
        const hasJournalMarker = existing.some((t) => t === '*journal' || t === 'journal');

        if (hasJournalMarker) {
          // Preserve *journal marker and merge with AI tags
          domainFiltered = mergeLogTags(existing, extractedTags);
        } else {
          // For non-journal logs, just normalize and filter the extracted tags
          const withPrefix = extractedTags.map((tag) =>
            tag.startsWith('#') || tag.startsWith('*') ? tag : `#${tag}`,
          );
          domainFiltered = withPrefix;
        }
        break;
      }

      default:
        domainFiltered = extractedTags;
    }

    // Step 3: Normalize before theme enrichment
    const normalized = filterAndNormalizeTags(domainFiltered);

    // Step 4: Add theme tags (#work, #exercise, #health, etc.)
    const withThemes = applyThemeTags(rawText, normalized);

    // Step 5: Apply quality filter (removes junk/stop words)
    const qualityFiltered = applyTagQualityFilter(withThemes);

    // Step 6: Final normalization (dedupe, format)
    return filterAndNormalizeTags(qualityFiltered);
  } catch (error) {
    // AI failure should never block - return empty tags
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[buildCanonicalFromMindDrop] tag extraction failed', error);
    }
    return [];
  }
}

/**
 * Build canonical payload for Mind Drop → entity creation WITH AI-powered tag extraction.
 * Standardizes labels and type-specific fields with intelligent title compaction and tag generation.
 *
 * Field mapping by kind:
 * - log: title = aiTitle ?? rawText, body = rawText, tags = AI-extracted + emotion-filtered, canonicalType = "log", labels = ["log"], subtype = classified
 * - todo: title = aiTitle ?? rawText, name = title, body/details = rawText, tags = AI-extracted + "book" filtered, canonicalType = "todo", labels = ["todo"]
 * - habit: title = aiTitle ?? rawText, name = title, notes = rawText, tags = AI-extracted (max 2 single-word), canonicalType = "habit", labels = ["habit"]
 *
 * Title compaction uses AI-generated titles when available.
 * Tag generation uses AI extraction with deterministic fallback, never blocks on AI failure.
 *
 * NEW: For logs, automatically classifies subtype using AI classification:
 * - "journal": Personal reflections, feelings, daily experiences
 * - "list": Items to check off or remember
 * - "reference": Information to remember later
 * - "idea": Creative thoughts or brainstorming
 * - null (plain): Default/unclassified
 *
 * Uses getEffectiveLogSubtype() which attempts AI classification first,
 * with automatic fallback to deterministic patterns on error.
 *
 * @param input - Configuration for canonical mapping
 * @returns Promise resolving to normalized payload ready for SupabaseRepo.create
 */
export async function buildCanonicalFromMindDrop(
  input: BuildCanonicalInput,
): Promise<CanonicalPayload> {
  const { kind, rawText, aiTitle, aiTags, existing } = input;

  const trimmedRawText = rawText.trim();

  // Extract tags using AI with domain-specific filtering
  const existingTagsForLogs = existing?.tags ?? [];
  const tags = await buildCleanedTags(trimmedRawText, aiTags, kind, existingTagsForLogs);

  // Type-specific field mapping
  switch (kind) {
    case 'log': {
      // For logs: Use AI title if available, otherwise raw text
      const title = compactTitle(trimmedRawText, aiTitle);
      // Classify log subtype using AI with deterministic fallback
      const subtype = await getEffectiveLogSubtype(trimmedRawText);

      return {
        title,
        tags,
        tags_meta: existing?.tags_meta ?? {
          sticky: [],
          tombstones: [],
        },
        canonicalType: kind,
        labels: [kind],
        body: trimmedRawText, // Full raw text goes in body
        subtype: subtype === 'plain' ? null : subtype, // null for plain, otherwise set subtype
      };
    }

    case 'todo': {
      // For todos: Use normalizeTodoTitle for proper title extraction (first line, temporal preservation)
      const title = normalizeTodoTitle(trimmedRawText, aiTitle);

      return {
        title,
        tags,
        tags_meta: existing?.tags_meta ?? {
          sticky: [],
          tombstones: [],
        },
        canonicalType: kind,
        labels: [kind],
        name: title, // Use normalized title in name field
        body: trimmedRawText, // Full raw text in body/details
        details: trimmedRawText, // Alternative field name
      };
    }

    case 'habit': {
      // For habits: Extract first line for name, use AI title if available
      let title: string;
      if (aiTitle) {
        title = aiTitle.trim();
      } else {
        // Extract first line for habit name (like todos)
        const firstLine = trimmedRawText.split('\n')[0].trim();
        title = firstLine || trimmedRawText;
      }

      return {
        title,
        tags,
        tags_meta: existing?.tags_meta ?? {
          sticky: [],
          tombstones: [],
        },
        canonicalType: kind,
        labels: [kind],
        name: title, // Use compact title in name field
        notes: trimmedRawText, // Full raw text in notes field
      };
    }
  }
}
