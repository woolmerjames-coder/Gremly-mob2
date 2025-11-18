/**
 * Canonical mapper for Mind Drop → todo/habit/log creation.
 * Standardizes how Mind Drop text becomes different entity types with consistent
 * field mapping WITHOUT title/tag generation.
 *
 * IMPORTANT: Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
 * This function maps raw text to entity fields but does NOT:
 * - Compact titles (title = rawText as-is)
 * - Generate or clean tags (tags = empty or passed through)
 * - Call AI/Cortex for enrichment
 *
 * All title compaction and tag generation happens in UnifiedOverlayV2 on first edit.
 */

import { filterAndNormalizeTags } from '../tags/normalize';
import { buildFallbackTags } from '../../cortex/openAiEngine';

export type CanonicalKind = 'todo' | 'habit' | 'log';

export interface BuildCanonicalInput {
  kind: CanonicalKind;
  rawText: string; // Full Mind Drop sentence
  aiTitle?: string; // DEPRECATED: No longer used - titles owned by UnifiedOverlayV2
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
  // log: body
  name?: string; // For todo & habit
  body?: string; // For log & todo
  notes?: string; // For habit
  details?: string; // Alternative to body for todos
}

/**
 * DEPRECATED: Title compaction moved to UnifiedOverlayV2.
 * This function now just returns rawText as-is.
 *
 * @param rawText - Full Mind Drop sentence
 * @param aiTitle - IGNORED (kept for backwards compatibility)
 * @returns Raw text unchanged
 */
function compactTitle(rawText: string, aiTitle?: string): string {
  // Title compaction is now owned by UnifiedOverlayV2
  // Return raw text as-is - no AI enrichment at creation time
  return rawText.trim();
}

/**
 * Build system tags (e.g., *journal marker) without user tag enrichment.
 * User tags are owned by UnifiedOverlayV2.
 *
 * Special case for logs: preserve *journal marker if present in AI tags.
 * All other tag generation happens in UnifiedOverlayV2 on first edit.
 *
 * @param rawText - Full Mind Drop sentence (UNUSED - kept for backwards compatibility)
 * @param aiTags - Optional system tags (e.g., *journal)
 * @param kind - Entity type (affects default tags)
 * @returns System tags only (empty for todo/habit, *journal for narrative logs)
 */
function buildCleanedTags(
  rawText: string,
  aiTags: string[] | undefined,
  kind: CanonicalKind,
): string[] {
  // For logs with *journal marker, preserve it as a system tag
  if (kind === 'log' && aiTags && aiTags.some((t) => t === '*journal' || t === 'journal')) {
    return ['*journal'];
  }

  // For all other cases, return empty - tags owned by UnifiedOverlayV2
  return [];
}

/**
 * Build canonical payload for Mind Drop → entity creation WITHOUT title/tag enrichment.
 * Standardizes labels and type-specific fields, but title = rawText and tags = [] (or system tags only).
 *
 * Field mapping by kind:
 * - log: title = rawText, body = rawText, tags = ['*journal'] if narrative, canonicalType = "log", labels = ["log"]
 * - todo: title = rawText, name = rawText, body/details = rawText, tags = [], canonicalType = "todo", labels = ["todo"]
 * - habit: title = rawText, name = rawText, notes = rawText, tags = [], canonicalType = "habit", labels = ["habit"]
 *
 * Title compaction (e.g., "Book doctor" from "Book doctor appointment tomorrow") happens in UnifiedOverlayV2 on first edit.
 * Tag generation (e.g., #appointment, #doctor, #tomorrow) happens in UnifiedOverlayV2 on first edit.
 *
 * @param input - Configuration for canonical mapping
 * @returns Normalized payload ready for SupabaseRepo.create (no AI enrichment)
 */
export function buildCanonicalFromMindDrop(input: BuildCanonicalInput): CanonicalPayload {
  const { kind, rawText, aiTags, existing } = input;

  const trimmedRawText = rawText.trim();
  // Title is raw text - compaction happens in UnifiedOverlayV2
  const title = compactTitle(trimmedRawText);
  // Tags are empty or system tags only - generation happens in UnifiedOverlayV2
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
        name: title, // Raw text in name field (UnifiedOverlayV2 will compact)
        body: trimmedRawText, // Full raw text in body/details
        details: trimmedRawText, // Alternative field name
      };

    case 'habit':
      return {
        ...common,
        name: title, // Raw text in name field (UnifiedOverlayV2 will compact)
        notes: trimmedRawText, // Full raw text in notes field
      };
  }
}
