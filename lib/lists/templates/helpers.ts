/**
 * lib/lists/templates/helpers.ts
 *
 * Phase 4: List Templates - Pure helper functions
 *
 * Provides utilities for:
 * - Building templates from existing lists
 * - Applying templates to entities (replace or merge modes)
 * - ID generation and deduplication
 */

import { safeRandomId } from '../../utils/safeRandomId';
import type { ListItem, ListTemplate } from '../types';

/**
 * Build a template object from an existing list.
 * Returns a shape ready for repo.createListTemplate().
 *
 * @param opts - Template metadata and source items
 * @returns Template object (without id, owner_id, timestamps)
 *
 * @example
 * const template = buildTemplateFromList({
 *   name: 'Grocery List',
 *   items: existingNote.list_items,
 *   scope: 'any',
 *   sourceEntityType: 'note',
 *   sourceEntityId: existingNote.id,
 * });
 * await repo.createListTemplate(template);
 */
export function buildTemplateFromList(opts: {
  name: string;
  items: ListItem[];
  scope: 'any' | 'todo' | 'habit' | 'note';
  sourceEntityType?: 'todo' | 'note' | 'habit';
  sourceEntityId?: string;
}): Omit<ListTemplate, 'id' | 'owner_id' | 'created_at' | 'updated_at'> {
  return {
    name: opts.name,
    scope: opts.scope,
    items: opts.items,
    source_entity_type: opts.sourceEntityType ?? null,
    source_entity_id: opts.sourceEntityId ?? null,
  };
}

/**
 * Apply a template to an entity's list_items.
 *
 * Modes:
 * - **replace**: Discard current items entirely, return only template items
 * - **merge**: Keep current items, append template items that don't already exist (dedupe by text)
 *
 * Template items are applied with:
 * - Fresh UUIDs (do NOT reuse template item IDs)
 * - checked = false (reset completion state)
 *
 * @param currentItems - Existing list items on the entity (can be null/undefined)
 * @param templateItems - Items from the template
 * @param mode - 'replace' or 'merge'
 * @returns New list items array
 *
 * @example
 * // Replace mode: Start fresh with template
 * const newItems = applyTemplateToList(
 *   note.list_items,
 *   template.items,
 *   'replace'
 * );
 *
 * @example
 * // Merge mode: Keep existing + add new from template
 * const mergedItems = applyTemplateToList(
 *   todo.list_items,
 *   template.items,
 *   'merge'
 * );
 */
export function applyTemplateToList(
  currentItems: ListItem[] | null | undefined,
  templateItems: ListItem[],
  mode: 'replace' | 'merge',
): ListItem[] {
  if (mode === 'replace') {
    // Replace mode: Discard current items, return only template items with fresh IDs
    return templateItems.map((item) => ({
      id: safeRandomId(),
      text: item.text,
      checked: false, // Reset completion state
    }));
  }

  // Merge mode: Keep current items + append new template items (dedupe by text)
  const current = currentItems ?? [];

  // Build set of existing item texts (case-insensitive for better deduplication)
  const existingTexts = new Set(current.map((item) => item.text.toLowerCase().trim()));

  // Filter template items to only those not already present
  const newItems = templateItems
    .filter((item) => !existingTexts.has(item.text.toLowerCase().trim()))
    .map((item) => ({
      id: safeRandomId(),
      text: item.text,
      checked: false, // Reset completion state
    }));

  // Return current items + new items from template
  return [...current, ...newItems];
}
