/**
 * List item extraction utility for Make Actionable feature
 * Extracts bullet points, numbered lists, and checkboxes from markdown text
 */

import { nanoid } from 'nanoid/non-secure';
import type { ListItem, ExtractedListItem } from './types';

/**
 * Generate a stable, URL-safe ID for list items
 * Used for React keys, future reordering, and sync scenarios
 */
function generateItemId(): string {
  return nanoid(10);
}

/**
 * Patterns that indicate an item is advice/info rather than an actionable task
 */
const NON_ACTIONABLE_PATTERNS = [
  /^(note:|tip:|remember:|avoid|don't|never|always|try to|consider)/i,
  /^(this is|that is|these are|it's|they are)/i,
  /\?$/, // Questions aren't tasks
];

/**
 * Strip markdown formatting from text
 */
function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1') // *italic*
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/_(.+?)_/g, '$1') // _italic_
    .replace(/`(.+?)`/g, '$1') // `code`
    .trim();
}

/**
 * Determine if an item text represents an actionable task
 */
function isItemActionable(text: string): boolean {
  return !NON_ACTIONABLE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract bullet points, numbered items, and checkboxes from markdown text
 *
 * Matches:
 * - Bullet points: "- ", "• ", "* "
 * - Numbered lists: "1. ", "2. ", etc.
 * - Checkbox items: "- [ ] ", "- [x] "
 *
 * @param body - The markdown text to parse
 * @returns Array of extracted list items with IDs and actionability flags
 */
export function extractListItems(body: string): ExtractedListItem[] {
  if (!body || typeof body !== 'string') return [];

  const lines = body.split('\n');
  const items: ExtractedListItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let text: string | null = null;
    let checked = false;

    // Check for checkbox pattern first: "- [ ] " or "- [x] " or "- [X] "
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      checked = checkboxMatch[1].toLowerCase() === 'x';
      text = checkboxMatch[2];
    }

    // Check for bullet pattern: "- ", "• ", "* "
    if (!text) {
      const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/);
      if (bulletMatch) {
        text = bulletMatch[1];
      }
    }

    // Check for numbered list: "1. ", "2. ", etc.
    if (!text) {
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        text = numberedMatch[1];
      }
    }

    // If we found a list item, process it
    if (text) {
      const cleanText = stripMarkdownFormatting(text);

      // Skip empty items after stripping
      if (cleanText.length === 0) continue;

      items.push({
        id: generateItemId(),
        text: cleanText,
        checked,
        isActionable: isItemActionable(cleanText),
      });
    }
  }

  return items;
}

/**
 * Check if a note body has enough list items to show "Make Actionable" button
 * Requires at least 2 items to be worth converting
 *
 * @param body - The markdown text to check
 * @returns true if 2+ list items found
 */
export function hasActionableList(body: string): boolean {
  const items = extractListItems(body);
  return items.length >= 2;
}

/**
 * Convert ExtractedListItem array to ListItem array (strips isActionable flag)
 * Used when saving to database
 */
export function toListItems(extracted: ExtractedListItem[]): ListItem[] {
  return extracted.map(({ id, text, checked }) => ({ id, text, checked }));
}
