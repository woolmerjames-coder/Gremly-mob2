/**
 * lib/lists/appendItemToList.ts
 *
 * Phase 3 Lists: Smart list update - "add X to Y list"
 * Finds existing list by title/tags and appends new item(s).
 */

import type { IRepo, CreateRecordInput } from '../repo/IRepo';
import type { Note, ListItem } from '../types';
import { parseTextToListItems, addListItem } from './helpers';
import { randomUUID } from 'crypto';

export interface AppendItemToListOptions {
  listTitle?: string; // e.g., "shopping list", "groceries"
  listTags?: string[]; // e.g., ["shopping", "groceries"]
  itemText: string; // Single item: "milk" or multiple: "milk, bread, eggs"
  createIfMissing?: boolean; // If true, create new list if not found
  defaultSubtype?: 'reference' | 'idea'; // Subtype for newly created lists
}

/**
 * Search for an existing list Note by title or tags.
 *
 * Matching logic:
 * 1. Exact title match (case-insensitive)
 * 2. Title contains search term
 * 3. Has matching tag
 *
 * @param repo - Repository interface
 * @param listTitle - Optional title to search for
 * @param listTags - Optional tags to search for
 * @returns Found note or null
 */
async function findExistingList(
  repo: IRepo,
  listTitle?: string,
  listTags?: string[],
): Promise<Note | null> {
  // Get all non-archived notes with lists
  const allRecords = await repo.getAll();
  const listNotes = allRecords.filter(
    (r) => r.type === 'note' && r.has_list && !r.archived,
  ) as Note[];

  if (listNotes.length === 0) {
    return null;
  }

  // Try exact title match first (case-insensitive)
  if (listTitle) {
    const lowerSearch = listTitle.toLowerCase();
    const exactMatch = listNotes.find((n) => n.title?.toLowerCase() === lowerSearch);
    if (exactMatch) return exactMatch;

    // Try partial title match
    const partialMatch = listNotes.find((n) => n.title?.toLowerCase().includes(lowerSearch));
    if (partialMatch) return partialMatch;
  }

  // Try tag match
  if (listTags && listTags.length > 0) {
    const tagMatch = listNotes.find((n) => listTags.some((tag) => n.tags?.includes(tag)));
    if (tagMatch) return tagMatch;
  }

  return null;
}

/**
 * Parse item text into one or more ListItem objects.
 * Handles both single items and comma-separated lists.
 *
 * @param itemText - "milk" or "milk, bread, eggs"
 * @returns Array of ListItem objects
 */
function parseItemText(itemText: string): ListItem[] {
  // Check if text contains commas - if so, split into multiple items
  if (itemText.includes(',')) {
    const parts = itemText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.map((text) => ({
      id: randomUUID(),
      text,
      checked: false,
    }));
  }

  // Single item
  return [
    {
      id: randomUUID(),
      text: itemText.trim(),
      checked: false,
    },
  ];
}

/**
 * Append item(s) to an existing list, or create a new list if not found.
 *
 * Use cases:
 * - "Add milk to my shopping list" → finds shopping list, appends "milk"
 * - "Add yoga to my morning routine" → finds habit/todo, appends item
 * - "Remember to buy bread and eggs" → creates or updates grocery list
 *
 * @param repo - Repository interface
 * @param options - Configuration for list search and item addition
 * @returns Updated or created note
 * @throws Error if list not found and createIfMissing=false
 *
 * @example
 * ```ts
 * // Append to existing list
 * const note = await appendItemToList(repo, {
 *   listTitle: 'shopping list',
 *   itemText: 'milk, bread, eggs',
 *   createIfMissing: true,
 * });
 * ```
 */
export async function appendItemToList(
  repo: IRepo,
  options: AppendItemToListOptions,
): Promise<Note> {
  const {
    listTitle,
    listTags,
    itemText,
    createIfMissing = true,
    defaultSubtype = 'reference',
  } = options;

  // Find existing list
  const existingList = await findExistingList(repo, listTitle, listTags);

  // Parse new item(s)
  const newItems = parseItemText(itemText);

  if (existingList) {
    // Append to existing list
    console.log('[appendItemToList] Appending to existing list', {
      noteId: existingList.id,
      title: existingList.title,
      newItems: newItems.length,
    });

    let updatedListItems = existingList.list_items || [];
    for (const item of newItems) {
      updatedListItems = addListItem(updatedListItems, item.text);
    }

    const updatedNote = (await repo.update({
      id: existingList.id,
      patch: {
        list_items: updatedListItems,
        has_list: true,
      },
    })) as Note;

    return updatedNote;
  }

  // List not found
  if (!createIfMissing) {
    throw new Error(
      `List not found: "${listTitle || listTags?.join(', ')}" and createIfMissing=false`,
    );
  }

  // Create new list
  console.log('[appendItemToList] Creating new list', {
    title: listTitle,
    tags: listTags,
    items: newItems.length,
  });

  const noteInput: CreateRecordInput = {
    type: 'note',
    title: listTitle || 'New List',
    subtype: defaultSubtype,
    canonicalType: 'log',
    labels: ['log'],
    tags: listTags || [],
    has_list: true,
    list_items: newItems,
  };

  const createdNote = (await repo.create(noteInput)) as Note;
  return createdNote;
}
