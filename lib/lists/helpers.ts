/**
 * lib/lists/helpers.ts
 *
 * Core helpers for parsing text into ListItem[] and managing list mutations.
 * Phase 7 Lists: Shared utilities for todos, notes, and habits.
 */

import { genId } from '../types';
import type { ListItem } from './types';

/**
 * Regular expressions for detecting list patterns
 */
const LIST_PATTERNS = {
  // Matches: "- item", "* item", "• item"
  bullet: /^\s*[-*•]\s+(.+)$/,
  // Matches: "1. item", "2) item", "3: item"
  numbered: /^\s*\d+[.):]\s+(.+)$/,
  // Matches: "[ ] item" or "[x] item" (checkbox style)
  checkbox: /^\s*\[([x\s])\]\s+(.+)$/i,
};

/**
 * Parse text body into structured ListItem array.
 *
 * Handles multiple list formats:
 * - Bullet lists: "- item", "* item", "• item"
 * - Numbered lists: "1. item", "2) item"
 * - Checkbox lists: "[ ] item", "[x] item"
 *
 * @param body - Raw text containing list items
 * @returns Array of ListItem objects with unique IDs
 *
 * @example
 * ```ts
 * parseTextToListItems(`
 *   - First item
 *   - Second item
 *   * Third item
 * `)
 * // Returns:
 * // [
 * //   { id: "abc123", text: "First item", checked: false },
 * //   { id: "def456", text: "Second item", checked: false },
 * //   { id: "ghi789", text: "Third item", checked: false }
 * // ]
 * ```
 */
export function parseTextToListItems(body: string): ListItem[] {
  if (!body || typeof body !== 'string') {
    return [];
  }

  const lines = body.split('\n');
  const items: ListItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // Skip empty lines

    // Try checkbox pattern first (preserves checked state)
    const checkboxMatch = trimmed.match(LIST_PATTERNS.checkbox);
    if (checkboxMatch) {
      const [, checkmark, text] = checkboxMatch;
      items.push({
        id: genId('list-item'),
        text: text.trim(),
        checked: checkmark.toLowerCase() === 'x',
      });
      continue;
    }

    // Try bullet pattern
    const bulletMatch = trimmed.match(LIST_PATTERNS.bullet);
    if (bulletMatch) {
      items.push({
        id: genId('list-item'),
        text: bulletMatch[1].trim(),
        checked: false,
      });
      continue;
    }

    // Try numbered pattern
    const numberedMatch = trimmed.match(LIST_PATTERNS.numbered);
    if (numberedMatch) {
      items.push({
        id: genId('list-item'),
        text: numberedMatch[1].trim(),
        checked: false,
      });
      continue;
    }
  }

  return items;
}

/**
 * Toggle the checked state of a list item by ID.
 *
 * @param items - Current list items
 * @param id - ID of item to toggle
 * @returns New array with toggled item (immutable)
 *
 * @example
 * ```ts
 * const items = [{ id: '1', text: 'Task', checked: false }];
 * const updated = toggleListItemChecked(items, '1');
 * // updated[0].checked === true
 * ```
 */
export function toggleListItemChecked(items: ListItem[], id: string): ListItem[] {
  return items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item));
}

/**
 * Add a new list item to the end of the list.
 *
 * @param items - Current list items
 * @param text - Text for new item
 * @returns New array with added item (immutable)
 *
 * @example
 * ```ts
 * const items = [{ id: '1', text: 'First', checked: false }];
 * const updated = addListItem(items, 'Second');
 * // updated.length === 2
 * ```
 */
export function addListItem(items: ListItem[], text: string): ListItem[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return items; // Don't add empty items
  }

  return [
    ...items,
    {
      id: genId('list-item'),
      text: trimmedText,
      checked: false,
    },
  ];
}

/**
 * Remove a list item by ID.
 *
 * @param items - Current list items
 * @param id - ID of item to remove
 * @returns New array without removed item (immutable)
 *
 * @example
 * ```ts
 * const items = [
 *   { id: '1', text: 'Keep', checked: false },
 *   { id: '2', text: 'Remove', checked: false }
 * ];
 * const updated = removeListItem(items, '2');
 * // updated.length === 1
 * ```
 */
export function removeListItem(items: ListItem[], id: string): ListItem[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Update the text of a list item by ID.
 *
 * @param items - Current list items
 * @param id - ID of item to update
 * @param newText - New text content
 * @returns New array with updated item (immutable)
 */
export function updateListItemText(items: ListItem[], id: string, newText: string): ListItem[] {
  return items.map((item) => (item.id === id ? { ...item, text: newText.trim() } : item));
}

/**
 * Reorder a list item by moving it to a new index.
 *
 * @param items - Current list items
 * @param fromIndex - Current index of item
 * @param toIndex - Desired index
 * @returns New array with reordered items (immutable)
 */
export function reorderListItem(items: ListItem[], fromIndex: number, toIndex: number): ListItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Detect if text body has list-like structure.
 *
 * Returns true if body contains 2+ lines matching list patterns.
 * Used by classification logic to auto-detect lists.
 *
 * @param body - Text to analyze
 * @returns true if body appears to be a list
 *
 * @example
 * ```ts
 * hasListLikeStructure('- Item 1\n- Item 2\nSome text')  // true
 * hasListLikeStructure('Just plain text')                 // false
 * hasListLikeStructure('- Only one item')                 // false (needs 2+)
 * ```
 */
export function hasListLikeStructure(body: string): boolean {
  if (!body || typeof body !== 'string') {
    return false;
  }

  const lines = body.split('\n');
  let listLinesCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line matches any list pattern
    if (
      LIST_PATTERNS.bullet.test(trimmed) ||
      LIST_PATTERNS.numbered.test(trimmed) ||
      LIST_PATTERNS.checkbox.test(trimmed)
    ) {
      listLinesCount++;
      if (listLinesCount >= 2) {
        return true; // Early exit when threshold met
      }
    }
  }

  return false;
}

/**
 * Convert ListItem[] back to markdown-style text.
 * Useful for display or export.
 *
 * @param items - List items to convert
 * @param format - Output format ('bullet', 'numbered', 'checkbox')
 * @returns Formatted text representation
 *
 * @example
 * ```ts
 * const items = [
 *   { id: '1', text: 'First', checked: false },
 *   { id: '2', text: 'Second', checked: true }
 * ];
 * listItemsToText(items, 'checkbox')
 * // Returns: "[ ] First\n[x] Second"
 * ```
 */
export function listItemsToText(
  items: ListItem[],
  format: 'bullet' | 'numbered' | 'checkbox' = 'bullet',
): string {
  if (!items || items.length === 0) {
    return '';
  }

  return items
    .map((item, index) => {
      switch (format) {
        case 'checkbox':
          return `[${item.checked ? 'x' : ' '}] ${item.text}`;
        case 'numbered':
          return `${index + 1}. ${item.text}`;
        case 'bullet':
        default:
          return `- ${item.text}`;
      }
    })
    .join('\n');
}

/**
 * Get list statistics (total items, completed count, etc.)
 *
 * @param items - List items to analyze
 * @returns Statistics object
 */
export function getListStats(items: ListItem[]): {
  total: number;
  completed: number;
  remaining: number;
  completionPercentage: number;
} {
  const total = items.length;
  const completed = items.filter((item) => item.checked).length;
  const remaining = total - completed;
  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    remaining,
    completionPercentage,
  };
}
