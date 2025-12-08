/**
 * Phase 10.10: Overlay Prefill Utilities
 * Helper functions to extract smart titles and structured data from user messages
 */

export interface HabitPrefill {
  name: string;
  cadence?: string;
}

/**
 * Maximum length for a title before truncation
 */
const MAX_TITLE_LENGTH = 50;

/**
 * Generate a smart title from text content
 * Handles lists, long content, and common prefixes
 */
export function smartTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Untitled';

  // Get first line only (for multi-line content)
  const firstLine = trimmed.split('\n')[0].trim();

  // Strip common note/reminder prefixes
  let cleaned = firstLine
    .replace(/^(remember|note|don't forget|remind me|keep in mind|write down|jot down)[:;\s]*/i, '')
    .trim();

  // Handle numbered list items: "1) Coava Coffee..." → "Coava Coffee..."
  // Also handles "1.", "1:", "1 -", etc.
  cleaned = cleaned.replace(/^\d+[.):-]\s*/, '').trim();

  // Handle bullet points
  cleaned = cleaned.replace(/^[-•*]\s*/, '').trim();

  // If it's still too long, truncate at word boundary
  if (cleaned.length > MAX_TITLE_LENGTH) {
    // Find the last space before the limit
    const truncateAt = cleaned.lastIndexOf(' ', MAX_TITLE_LENGTH);
    if (truncateAt > 20) {
      // Only truncate at word if we have reasonable content
      cleaned = cleaned.slice(0, truncateAt) + '…';
    } else {
      // Hard truncate if no good word boundary
      cleaned = cleaned.slice(0, MAX_TITLE_LENGTH - 1) + '…';
    }
  }

  return cleaned || firstLine || 'Untitled';
}

/**
 * Extract a todo title from user text
 * Converts to imperative form
 */
export function extractTodoTitle(userText: string): string {
  const trimmed = userText.trim();

  // Remove command verbs at start
  const withoutCommands = trimmed
    .replace(/^(set|add|create|remember|save|send|log)\s+(a\s+)?(todo|task)?[:;\s]*/i, '')
    .trim();

  // Convert "I need to X" to "X"
  const imperative = withoutCommands
    .replace(/^(i need to|i have to|i should|i must|i want to|i'd like to)\s+/i, '')
    .trim();

  // Remove leading "to" if present (e.g., "to call John" → "call John")
  const withoutTo = imperative.replace(/^to\s+/i, '').trim();

  return withoutTo || imperative || withoutCommands || trimmed;
}

/**
 * Parse habit information from user text
 * Extracts name and cadence if present
 */
export function parseHabit(userText: string): HabitPrefill {
  const trimmed = userText.trim();

  // Remove command verbs at start
  const withoutCommands = trimmed
    .replace(/^(set|add|create|save|log)\s+(a\s+)?(habit|routine)?[:;\s]*/i, '')
    .trim();

  // Remove "start/begin/want to" prefixes
  const withoutPrefixes = withoutCommands
    .replace(/^(start|begin|want to|would like to|i want to|i'd like to)\s+/i, '')
    .trim();

  // Remove leading "to" if present (e.g., "to run" → "run")
  const withoutTo = withoutPrefixes.replace(/^to\s+/i, '').trim();

  // Extract cadence patterns
  const cadenceMatch = withoutTo.match(
    /every\s+(day|morning|night|evening|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|monthly/i,
  );

  let name = withoutTo || withoutPrefixes || withoutCommands || trimmed;
  let cadence: string | undefined;

  if (cadenceMatch) {
    cadence = cadenceMatch[0];
    // Remove cadence from name
    name = withoutTo.replace(cadenceMatch[0], '').trim();
  }

  return { name, cadence };
}
