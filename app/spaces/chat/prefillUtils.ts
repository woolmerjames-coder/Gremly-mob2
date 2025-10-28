/**
 * Phase 10.10: Overlay Prefill Utilities
 * Helper functions to extract smart titles and structured data from user messages
 */

import { parseDue } from '../../../lib/cortex/entities/datetime';

export interface HabitPrefill {
  name: string;
  cadence?: string;
}

export interface TodoPrefill {
  title: string;
  dueDate?: string;
}

/**
 * Generate a smart title from user text
 * Strips common prefixes and cleans up the text
 */
export function smartTitle(userText: string): string {
  const trimmed = userText.trim();

  // Strip common note/reminder prefixes
  const withoutPrefixes = trimmed
    .replace(/^(remember|note|don't forget|remind me|keep in mind|write down|jot down)[:;\s]*/i, '')
    .trim();

  return withoutPrefixes || trimmed;
}

/**
 * Extract a todo title from user text
 * Converts to imperative form
 */
export function extractTodoTitle(userText: string): TodoPrefill {
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

  const title = withoutTo || imperative || withoutCommands || trimmed;

  const parsedDue = parseDue(userText);
  const dueDate = parsedDue.confidence >= 0.9 ? parsedDue.iso : undefined;

  return { title, dueDate };
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
