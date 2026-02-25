/**
 * Space Pattern Extraction for Mind Drop
 *
 * Extracts explicit space assignment patterns from user input text.
 * Used to route drops to specific spaces based on user intent.
 *
 * Supported patterns:
 * - "add to Fitness: run 3 miles" → spaceName: "Fitness"
 * - "add this to Work: finish report" → spaceName: "Work"
 * - "for Health: drink water" → spaceName: "Health"
 * - "Fitness: do pushups" (prefix with colon) → spaceName: "Fitness"
 * - "call mom @Family" → spaceName: "Family"
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Space {
  id: string;
  name: string;
}

export type SpacePatternType = 'add_to' | 'for' | 'prefix_colon' | 'at_mention' | null;

export interface SpacePatternResult {
  /** Extracted space name (normalized to title case), or null if no pattern found */
  spaceName: string | null;
  /** Text with the space pattern removed */
  cleanedText: string;
  /** Whether a space pattern was detected */
  hasSpacePattern: boolean;
  /** Type of pattern that was matched */
  patternType: SpacePatternType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common prefixes that look like space patterns but are not.
 * These are filtered out for the "prefix colon" pattern.
 */
const FALSE_POSITIVE_PREFIXES = [
  'note',
  'todo',
  'task',
  'reminder',
  'fyi',
  'important',
  'urgent',
  'idea',
  'habit',
  'log',
  'journal',
  'question',
  'thought',
  'update',
  'status',
  're',
  'ref',
  'subject',
  'title',
  'name',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a space name to title case.
 * "fitness" → "Fitness", "my work" → "My Work"
 */
function toTitleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Remove optional "Space" suffix from a space name.
 * "Fitness Space" → "Fitness", "Work space" → "Work"
 */
function removeSpaceSuffix(name: string): string {
  return name.replace(/\s+space$/i, '').trim();
}

/**
 * Check if a prefix is a false positive (common label, not a space name).
 */
function isFalsePositivePrefix(prefix: string): boolean {
  const normalized = prefix.toLowerCase().trim();
  return FALSE_POSITIVE_PREFIXES.includes(normalized);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract explicit space assignment pattern from user input.
 *
 * @param text - Raw user input text
 * @returns SpacePatternResult with extracted space name and cleaned text
 *
 * @example
 * extractSpacePattern("add to Fitness: run 3 miles")
 * // → { spaceName: "Fitness", cleanedText: "run 3 miles", hasSpacePattern: true, patternType: 'add_to' }
 *
 * @example
 * extractSpacePattern("call mom @Family")
 * // → { spaceName: "Family", cleanedText: "call mom", hasSpacePattern: true, patternType: 'at_mention' }
 *
 * @example
 * extractSpacePattern("buy groceries")
 * // → { spaceName: null, cleanedText: "buy groceries", hasSpacePattern: false, patternType: null }
 */
export function extractSpacePattern(text: string): SpacePatternResult {
  const trimmedText = text.trim();

  // ─── Pattern 1: "add to X:" or "add this to X:" ───
  // Matches: "add to Fitness: run", "add this to Work Space: finish report"
  const addToMatch = trimmedText.match(/^add\s+(?:this\s+)?to\s+([^:]+?)(?:\s+space)?:\s*(.+)$/i);
  if (addToMatch) {
    const spaceName = toTitleCase(removeSpaceSuffix(addToMatch[1]));
    const cleanedText = addToMatch[2].trim();
    return {
      spaceName,
      cleanedText,
      hasSpacePattern: true,
      patternType: 'add_to',
    };
  }

  // ─── Pattern 2: "for X:" ───
  // Matches: "for Health: drink water", "for Work Space: meeting notes"
  const forMatch = trimmedText.match(/^for\s+([^:]+?)(?:\s+space)?:\s*(.+)$/i);
  if (forMatch) {
    const spaceName = toTitleCase(removeSpaceSuffix(forMatch[1]));
    const cleanedText = forMatch[2].trim();
    return {
      spaceName,
      cleanedText,
      hasSpacePattern: true,
      patternType: 'for',
    };
  }

  // ─── Pattern 3: "X: text" (prefix with colon) ───
  // Matches: "Fitness: do pushups", "Work: finish report"
  // Excludes: "Note: something", "Todo: buy milk"
  const prefixColonMatch = trimmedText.match(/^([A-Za-z][A-Za-z0-9\s]{0,30}):\s*(.+)$/);
  if (prefixColonMatch) {
    const potentialSpace = prefixColonMatch[1].trim();
    const cleanedText = prefixColonMatch[2].trim();

    // Filter out false positives
    if (!isFalsePositivePrefix(potentialSpace)) {
      const spaceName = toTitleCase(removeSpaceSuffix(potentialSpace));
      return {
        spaceName,
        cleanedText,
        hasSpacePattern: true,
        patternType: 'prefix_colon',
      };
    }
  }

  // ─── Pattern 4: "@SpaceName" at end or middle ───
  // Matches: "call mom @Family", "meeting @Work tomorrow"
  const atMentionMatch = trimmedText.match(/@([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/);
  if (atMentionMatch) {
    const spaceName = toTitleCase(atMentionMatch[1]);
    // Remove the @mention from the text
    const cleanedText = trimmedText
      .replace(/@[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?/, '')
      .trim();
    return {
      spaceName,
      cleanedText,
      hasSpacePattern: true,
      patternType: 'at_mention',
    };
  }

  // ─── No pattern found ───
  return {
    spaceName: null,
    cleanedText: trimmedText,
    hasSpacePattern: false,
    patternType: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Space Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a space by name using fuzzy matching.
 *
 * Matching priority:
 * 1. Exact match (case-insensitive)
 * 2. Starts-with match (case-insensitive)
 * 3. Contains match (case-insensitive)
 *
 * Returns null if no match found or if the match is ambiguous
 * (multiple spaces match at the same priority level).
 *
 * @param spaceName - The space name to search for
 * @param spaces - Array of available spaces
 * @returns Matched space or null if not found/ambiguous
 *
 * @example
 * const spaces = [{ id: '1', name: 'Fitness' }, { id: '2', name: 'Work' }];
 * findSpaceByName('fitness', spaces) // → { id: '1', name: 'Fitness' }
 * findSpaceByName('fit', spaces) // → { id: '1', name: 'Fitness' } (starts-with)
 * findSpaceByName('xyz', spaces) // → null (no match)
 */
export function findSpaceByName(spaceName: string, spaces: Space[]): Space | null {
  if (!spaceName || !spaces || spaces.length === 0) {
    return null;
  }

  const normalizedSearch = spaceName.toLowerCase().trim();

  // Priority 1: Exact match
  const exactMatches = spaces.filter((s) => s.name.toLowerCase() === normalizedSearch);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    // Ambiguous - multiple exact matches (shouldn't happen with unique names)
    return null;
  }

  // Priority 2: Starts-with match
  const startsWithMatches = spaces.filter((s) => s.name.toLowerCase().startsWith(normalizedSearch));
  if (startsWithMatches.length === 1) {
    return startsWithMatches[0];
  }
  if (startsWithMatches.length > 1) {
    // Ambiguous - multiple starts-with matches
    return null;
  }

  // Priority 3: Contains match
  const containsMatches = spaces.filter((s) => s.name.toLowerCase().includes(normalizedSearch));
  if (containsMatches.length === 1) {
    return containsMatches[0];
  }
  // Ambiguous or no match
  return null;
}

/**
 * Extract space pattern and resolve to actual space.
 * Combines extractSpacePattern with findSpaceByName for convenience.
 *
 * @param text - Raw user input text
 * @param spaces - Array of available spaces
 * @returns Object with resolved space (if found) and cleaned text
 */
export function extractAndResolveSpace(
  text: string,
  spaces: Space[],
): {
  space: Space | null;
  cleanedText: string;
  hasSpacePattern: boolean;
  patternType: SpacePatternType;
} {
  const result = extractSpacePattern(text);

  if (!result.hasSpacePattern || !result.spaceName) {
    return {
      space: null,
      cleanedText: result.cleanedText,
      hasSpacePattern: false,
      patternType: null,
    };
  }

  const space = findSpaceByName(result.spaceName, spaces);

  return {
    space,
    cleanedText: result.cleanedText,
    hasSpacePattern: result.hasSpacePattern,
    patternType: result.patternType,
  };
}
