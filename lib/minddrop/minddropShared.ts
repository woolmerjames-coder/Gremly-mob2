/**
 * Shared utilities for Mind Drop item creation.
 * Consolidates tag cleaning, title/name/notes mapping logic used across
 * todos, habits, and logs/notes created via Mind Drop auto-create.
 */

import { filterAndNormalizeTags } from '../tags/normalize';
import { buildFallbackTags } from '../../cortex/openAiEngine';

export type MindDropItemKind = 'log' | 'todo' | 'habit';

export interface MindDropSource {
  rawText: string; // full sentence from the Mind Drop input
  aiTags?: string[]; // tags returned by Cortex / Overlay prefill
}

export interface MindDropDerivedFields {
  // We won't always use all of these, but it keeps mapping in one place.
  title?: string;
  name?: string;
  body?: string | null;
  notes?: string | null;
  tags: string[];
}

/**
 * Build cleaned tags for Mind Drop items using the same logic across all types.
 * Reuses the existing tag-filtering pipeline:
 * 1. Use AI tags if present (from Cortex engineTags or classification.tags)
 * 2. Otherwise, fallback to locally generated tags
 * 3. Apply filterAndNormalizeTags to strip junk words and normalize format
 *
 * @param source - The Mind Drop source with raw text and optional AI tags
 * @param kind - The type of item being created (for fallback tag generation)
 * @returns Cleaned, normalized tag array
 */
export function buildMindDropTags(source: MindDropSource, kind: MindDropItemKind): string[] {
  // Use AI tags if available, otherwise generate fallback tags
  const aiTags = source.aiTags ?? [];

  if (aiTags.length > 0) {
    // AI tags are already passed through filterAndNormalizeTags in the caller
    // (see CatchAllNotepad.tsx line 2260: combinedTags = filterAndNormalizeTags(...))
    // But we apply it here too for safety/consistency when called standalone
    return filterAndNormalizeTags(aiTags);
  }

  // Fallback: generate tags heuristically
  // buildFallbackTags already calls filterAndNormalizeTags internally
  // Note: 'log' kind maps to 'note' for buildFallbackTags
  const fallbackKind = kind === 'log' ? 'note' : kind;
  return buildFallbackTags(source.rawText, fallbackKind);
}

/**
 * Build derived fields (title, name, body, notes, tags) for a Mind Drop item.
 * Maps the raw user input to the correct fields based on item kind.
 *
 * Field mapping per kind:
 * - log/note: Full sentence in both title and body
 * - todo: Short label in title/name, null body/notes
 * - habit: Short label in title/name, full sentence in notes
 *
 * @param kind - The type of item being created
 * @param source - The Mind Drop source with raw text and optional AI tags
 * @returns Object with title, name, body, notes, and cleaned tags
 */
export function buildMindDropDerivedFields(
  kind: MindDropItemKind,
  source: MindDropSource,
): MindDropDerivedFields {
  const tags = buildMindDropTags(source, kind);
  const sentence = source.rawText.trim();

  switch (kind) {
    case 'log':
      // Log / unsorted note: keep the full sentence as both title and body
      return {
        title: sentence,
        body: sentence,
        tags,
      };

    case 'todo':
      // To-Do: short label, optional body/notes (we keep it null for now)
      return {
        title: sentence,
        name: sentence,
        body: null,
        notes: null,
        tags,
      };

    case 'habit':
      // Habit: label + full sentence in notes
      return {
        title: sentence,
        name: sentence,
        notes: sentence,
        body: undefined, // habits don't have a body field
        tags,
      };
  }
}
