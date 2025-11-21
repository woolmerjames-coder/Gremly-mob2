/**
 * Shared utilities for Mind Drop item creation.
 * Consolidates tag cleaning, title/name/notes mapping logic used across
 * todos, habits, and logs/notes created via Mind Drop auto-create.
 */

import { filterAndNormalizeTags } from '../tags/normalize';
import { getEffectiveTags } from '../tags/getEffectiveTags';

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
 * Uses new AI-first tag extraction pipeline:
 * 1. Use AI tags if present (from Cortex engineTags or classification.tags)
 * 2. Otherwise, call getEffectiveTags which tries AI then falls back to deterministic
 * 3. Apply filterAndNormalizeTags to strip junk words and normalize format
 *
 * @param source - The Mind Drop source with raw text and optional AI tags
 * @returns Promise resolving to cleaned, normalized tag array
 */
export async function buildMindDropTags(source: MindDropSource): Promise<string[]> {
  // Use AI tags if available
  const aiTags = source.aiTags ?? [];

  if (aiTags.length > 0) {
    // AI tags are already passed through filterAndNormalizeTags in the caller
    // But we apply it here too for safety/consistency when called standalone
    return filterAndNormalizeTags(aiTags);
  }

  // Extract tags using AI-first approach with deterministic fallback
  const extractedTags = await getEffectiveTags(source.rawText);

  // Filter and normalize the extracted tags
  return filterAndNormalizeTags(extractedTags);
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
 * @returns Promise resolving to object with title, name, body, notes, and cleaned tags
 */
export async function buildMindDropDerivedFields(
  kind: MindDropItemKind,
  source: MindDropSource,
): Promise<MindDropDerivedFields> {
  const tags = await buildMindDropTags(source);
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
