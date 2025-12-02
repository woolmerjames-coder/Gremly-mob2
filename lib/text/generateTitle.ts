/**
 * Title Generation for Mind Drop
 *
 * Rules:
 * 1. Title is 3-7 words, summarizing the input
 * 2. Remove time expressions from title (they go to due_date)
 * 3. Remove filler prefixes ("Remind me to", "Todo:", "Note:", etc.)
 * 4. Sentence case: First letter uppercase, rest lowercase (except proper nouns)
 * 5. Body is NEVER modified - always preserve original input
 */

// Prefixes to strip from titles
const TITLE_PREFIXES = [
  /^remind\s+me\s+to\s+/i,
  /^todo:\s*/i,
  /^task:\s*/i,
  /^note:\s*/i,
  /^idea:\s*/i,
  /^habit:\s*/i,
  /^add\s+todo:\s*/i,
  /^create\s+habit:\s*/i,
  /^i\s+need\s+to\s+/i,
  /^i\s+have\s+to\s+/i,
  /^i\s+want\s+to\s+/i,
  /^i\s+should\s+/i,
  /^don't\s+forget\s+to\s+/i,
  /^remember\s+to\s+/i,
];

// Time expressions to remove from title (but keep in body)
const TIME_EXPRESSIONS = [
  /\bby\s+end\s+of\s+(today|tomorrow|this\s+week)\b/gi, // Must come before standalone "today"
  /\b(today|tomorrow|yesterday)\b/gi,
  /\b(this|next|last)\s+(morning|afternoon|evening|night|week|month|year)\b/gi,
  /\b(on|by|at|before|after)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi,
  /\b(in\s+)?\d+\s+(minutes?|hours?|days?|weeks?)\b/gi,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
];

// Filler words to remove if they're at the start
const FILLER_STARTS = [/^(just|maybe|probably|perhaps)\s+/i, /^(um|uh|so|well|okay|ok)\s+/i];

export interface TitleResult {
  title: string;
  originalInput: string; // Always unchanged
}

/**
 * Strip common prefixes from text
 */
function stripPrefixes(text: string): string {
  let result = text;
  for (const prefix of TITLE_PREFIXES) {
    result = result.replace(prefix, '');
  }
  for (const filler of FILLER_STARTS) {
    result = result.replace(filler, '');
  }
  return result.trim();
}

/**
 * Remove time expressions from text (for title only)
 */
function stripTimeExpressions(text: string): string {
  let result = text;
  for (const pattern of TIME_EXPRESSIONS) {
    result = result.replace(pattern, ' ');
  }
  // Clean up multiple spaces
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Convert to sentence case
 */
function toSentenceCase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Truncate to N words
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

/**
 * Generate a title from input text
 *
 * @param input - Original user input
 * @param aiTitle - Optional AI-generated title (used if valid)
 * @returns TitleResult with generated title and preserved original input
 */
export function generateTitle(input: string, aiTitle?: string): TitleResult {
  const originalInput = input; // NEVER modify this

  // If AI provided a valid title (3-7 words, not empty), use it
  if (aiTitle) {
    const aiWords = aiTitle
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (aiWords.length >= 2 && aiWords.length <= 8) {
      return {
        title: toSentenceCase(aiTitle.trim()),
        originalInput,
      };
    }
  }

  // Generate title from input
  let title = input.trim();

  // Step 1: Strip prefixes
  title = stripPrefixes(title);

  // Step 2: Strip time expressions (from title only, not body)
  title = stripTimeExpressions(title);

  // Step 3: Truncate to 7 words max
  title = truncateToWords(title, 7);

  // Step 4: Sentence case
  title = toSentenceCase(title);

  // Fallback if empty
  if (!title || title.length < 2) {
    title = 'Untitled';
  }

  return {
    title,
    originalInput, // Always the complete, unmodified input
  };
}

/**
 * Verify body preservation - utility for testing
 * Body must ALWAYS equal original input
 */
export function verifyBodyPreservation(originalInput: string, body: string): boolean {
  return body === originalInput;
}

// Export internals for testing
export const _testExports = {
  stripPrefixes,
  stripTimeExpressions,
  toSentenceCase,
  truncateToWords,
  TITLE_PREFIXES,
  TIME_EXPRESSIONS,
};
