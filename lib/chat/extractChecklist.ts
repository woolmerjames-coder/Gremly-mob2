/**
 * extractChecklist.ts - Helper functions for parsing bullet points from note content
 * Used to convert plain notes to interactive checklists
 */

// Regex patterns for bullet detection
const BULLET_CHARS = '•\\-\\*·◦▪▸';
const BULLET_LINE_REGEX = new RegExp(`^[\\s]*([${BULLET_CHARS}])\\s+(.+)$`);
const HAS_BULLETS_REGEX = new RegExp(`^[\\s]*[${BULLET_CHARS}]\\s+.+$`, 'm');

export interface ExtractedChecklist {
  /** Text before the first bullet (trimmed, null if empty) */
  preamble: string | null;
  /** Array of bullet text with bullet characters stripped */
  items: string[];
  /** Text after the last bullet (trimmed, null if empty) */
  postamble: string | null;
  /** True if any bullets were found */
  hasBullets: boolean;
}

/**
 * Quick boolean check if content contains any bullet points
 * Use this for conditionally showing "Make checklist" button
 */
export function contentHasBullets(content: string | null | undefined): boolean {
  if (!content) return false;
  return HAS_BULLETS_REGEX.test(content);
}

/**
 * Parse content to extract preamble, bullet items, and postamble
 *
 * @example
 * const result = extractChecklistFromContent(`
 * Here are ways to stay consistent:
 *
 * - Start with just 5 minutes
 * - Pick the same time daily
 * - Track your streak
 *
 * Remember, consistency beats intensity!
 * `);
 *
 * // Returns:
 * // {
 * //   preamble: "Here are ways to stay consistent:",
 * //   items: ["Start with just 5 minutes", "Pick the same time daily", "Track your streak"],
 * //   postamble: "Remember, consistency beats intensity!",
 * //   hasBullets: true
 * // }
 */
export function extractChecklistFromContent(
  content: string | null | undefined,
): ExtractedChecklist {
  if (!content) {
    return {
      preamble: null,
      items: [],
      postamble: null,
      hasBullets: false,
    };
  }

  const lines = content.split('\n');
  const preambleLines: string[] = [];
  const bulletItems: string[] = [];
  const postambleLines: string[] = [];

  let foundFirstBullet = false;
  let lastBulletIndex = -1;

  // First pass: find all bullet items and track the last bullet index
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(BULLET_LINE_REGEX);
    if (match) {
      lastBulletIndex = i;
    }
  }

  // Second pass: categorize lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(BULLET_LINE_REGEX);

    if (match) {
      foundFirstBullet = true;
      bulletItems.push(match[2].trim());
    } else if (!foundFirstBullet) {
      // Before first bullet = preamble
      preambleLines.push(line);
    } else if (i > lastBulletIndex) {
      // After last bullet = postamble
      postambleLines.push(line);
    }
    // Lines between bullets that aren't bullets themselves are ignored
    // (this handles empty lines between bullets)
  }

  // Trim and clean up preamble/postamble
  const preamble = preambleLines.join('\n').trim() || null;
  const postamble = postambleLines.join('\n').trim() || null;

  return {
    preamble,
    items: bulletItems,
    postamble,
    hasBullets: bulletItems.length > 0,
  };
}

/**
 * Convert extracted checklist to the format expected by EntityChatNote
 * Generates unique IDs for each checklist item
 */
import { getDateService } from '../date/DateService';

export function toChecklistItems(
  items: string[],
): Array<{ id: string; label: string; completed: boolean }> {
  const timestamp = getDateService().now().getTime();
  return items.map((label, index) => ({
    id: `item_${timestamp}_${index}`,
    label,
    completed: false,
  }));
}

/**
 * Full conversion helper: extract checklist and convert to note update format
 * Returns null if no bullets found
 */
export function convertContentToChecklist(content: string | null | undefined): {
  is_checklist: true;
  checklist_items: Array<{ id: string; label: string; completed: boolean }>;
  preamble: string | undefined;
  postamble: string | undefined;
} | null {
  const extracted = extractChecklistFromContent(content);

  if (!extracted.hasBullets) {
    return null;
  }

  return {
    is_checklist: true,
    checklist_items: toChecklistItems(extracted.items),
    preamble: extracted.preamble ?? undefined,
    postamble: extracted.postamble ?? undefined,
  };
}
