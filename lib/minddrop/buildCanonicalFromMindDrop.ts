/**
 * Canonical mapper for Mind Drop → todo/habit/log creation.
 * Standardizes how Mind Drop text becomes different entity types with consistent
 * title generation, tag cleaning, and field mapping.
 */

import { filterAndNormalizeTags } from '../tags/normalize';
import { buildFallbackTags } from '../../cortex/openAiEngine';

export type CanonicalKind = 'todo' | 'habit' | 'log';

export interface BuildCanonicalInput {
  kind: CanonicalKind;
  rawText: string; // Full Mind Drop sentence
  aiTitle?: string; // Optional AI-suggested condensed title
  aiTags?: string[]; // Optional AI-suggested tags
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
  // log: body
  name?: string; // For todo & habit
  body?: string; // For log & todo
  notes?: string; // For habit
  details?: string; // Alternative to body for todos
}

/**
 * Compact/summarize raw text to a short title.
 * Uses AI title if available, otherwise takes first 60 chars.
 *
 * @param rawText - Full Mind Drop sentence
 * @param aiTitle - Optional AI-suggested title
 * @returns Compact title string
 */
function compactTitle(rawText: string, aiTitle?: string): string {
  if (aiTitle?.trim()) {
    return aiTitle.trim();
  }

  // Fallback: use first line or first 60 chars
  const firstLine = rawText.split('\n')[0].trim();
  if (firstLine.length <= 60) {
    return firstLine;
  }

  return firstLine.slice(0, 57) + '...';
}

/**
 * Build cleaned tags from AI tags or raw text.
 * Single source of truth for tag cleaning:
 * 1. Use aiTags if present
 * 2. Otherwise, generate from rawText via buildFallbackTags
 * 3. Apply filterAndNormalizeTags to:
 *    - Lowercase and dedupe
 *    - Strip leading # and @
 *    - Remove junk words (every, day, minutes, tomorrow, back, very, really, just, but, etc.)
 *
 * Special case for logs: preserve *journal marker if present in AI tags.
 *
 * @param rawText - Full Mind Drop sentence
 * @param aiTags - Optional AI-suggested tags
 * @param kind - Entity type (affects fallback tag generation)
 * @returns Cleaned tag array
 */
function buildCleanedTags(
  rawText: string,
  aiTags: string[] | undefined,
  kind: CanonicalKind,
): string[] {
  if (aiTags && aiTags.length > 0) {
    // AI tags already provided - clean them
    return filterAndNormalizeTags(aiTags);
  }

  // Fallback: generate tags from raw text
  // buildFallbackTags already calls filterAndNormalizeTags internally
  // Map 'log' to 'note' for buildFallbackTags
  const fallbackKind = kind === 'log' ? 'note' : kind;
  return buildFallbackTags(rawText, fallbackKind);
}

/**
 * Build canonical payload for Mind Drop → entity creation.
 * Standardizes title, tags, labels, and type-specific fields.
 *
 * Field mapping by kind:
 * - log: title = aiTitle || compact(rawText), body = rawText, canonicalType = "log", labels = ["log"]
 * - todo: title = aiTitle || compact(rawText), name = title, body/details = rawText, canonicalType = "todo", labels = ["todo"]
 * - habit: title = aiTitle || compact(rawText), name = title, notes = rawText, canonicalType = "habit", labels = ["habit"]
 *
 * @param input - Configuration for canonical mapping
 * @returns Normalized payload ready for SupabaseRepo.create
 */
export function buildCanonicalFromMindDrop(input: BuildCanonicalInput): CanonicalPayload {
  const { kind, rawText, aiTitle, aiTags, existing } = input;

  const trimmedRawText = rawText.trim();
  const title = compactTitle(trimmedRawText, aiTitle);
  const tags = buildCleanedTags(trimmedRawText, aiTags, kind);

  // Build common fields
  const common = {
    title,
    tags,
    tags_meta: existing?.tags_meta ?? {
      sticky: [],
      tombstones: [],
    },
    canonicalType: kind,
    labels: [kind], // Each type gets its own label
  };

  // Type-specific field mapping
  switch (kind) {
    case 'log':
      return {
        ...common,
        body: trimmedRawText, // Full raw text goes in body
      };

    case 'todo':
      return {
        ...common,
        name: title, // Short title in name field
        body: trimmedRawText, // Full raw text in body/details
        details: trimmedRawText, // Alternative field name
      };

    case 'habit':
      return {
        ...common,
        name: title, // Short title in name field
        notes: trimmedRawText, // Full raw text in notes field
      };
  }
}
