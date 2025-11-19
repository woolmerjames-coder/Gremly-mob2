/**
 * Helper to normalize todo titles from Mind Drop text.
 *
 * Ensures clean separation between body (full Mind Drop text) and title (short summary).
 * Preserves important temporal qualifiers in titles.
 */

// Temporal tokens that should be preserved in titles
const TEMPORAL_TOKENS = [
  'today',
  'tomorrow',
  'tonight',
  'this week',
  'next week',
  'this month',
  'next month',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'jan',
  'january',
  'feb',
  'february',
  'mar',
  'march',
  'apr',
  'april',
  'may',
  'jun',
  'june',
  'jul',
  'july',
  'aug',
  'august',
  'sep',
  'september',
  'oct',
  'october',
  'nov',
  'november',
  'dec',
  'december',
];

const MAX_TITLE_CHARS = 60;
const MAX_TITLE_WORDS = 8;
const FALLBACK_TITLE_WORDS = 7;

/**
 * Extract temporal tokens from text (case-insensitive)
 */
function extractTemporalTokens(text: string): string[] {
  const lowerText = text.toLowerCase();
  return TEMPORAL_TOKENS.filter((token) => {
    // Use word boundary regex to avoid false matches (e.g., "friday" in "befriday")
    const regex = new RegExp(`\\b${token}\\b`, 'i');
    return regex.test(lowerText);
  });
}

/**
 * Check if AI title is acceptable (not too long, not identical to body, shorter than body)
 *
 * Simplified validation rules:
 * - Accept aiTitle iff:
 *   - aiTitle is non-empty after trim, and
 *   - aiTitle !== body (strict string comparison), and
 *   - aiTitle.length <= 80, and
 *   - aiTitle.length < body.length (prefer shorter than full sentence)
 *
 * We do NOT require temporal hints to accept a title.
 * We do NOT reject a good aiTitle based on undefined_due status.
 */
function isAiTitleAcceptable(aiTitle: string, body: string): boolean {
  const trimmedAiTitle = aiTitle.trim();
  const trimmedBody = body.trim();

  // Reject if AI title is empty
  if (!trimmedAiTitle) {
    return false;
  }

  // Reject if AI title is identical to the full body
  if (trimmedAiTitle === trimmedBody) {
    return false;
  }

  // Reject if AI title is too long (max 80 chars)
  if (trimmedAiTitle.length > 80) {
    return false;
  }

  // Reject if AI title is not shorter than the body (should be a summary)
  if (trimmedAiTitle.length >= trimmedBody.length) {
    return false;
  }

  return true;
}

/**
 * Create a fallback title from the body text (first N words)
 * Tries to preserve temporal tokens if possible
 */
function createFallbackTitle(body: string, maxWords: number = FALLBACK_TITLE_WORDS): string {
  const words = body.trim().split(/\s+/);

  // Check if body contains temporal tokens
  const bodyTemporalTokens = extractTemporalTokens(body);

  // If body has temporal tokens, try to include them in the title
  if (bodyTemporalTokens.length > 0) {
    // Find the index of the first temporal token in the words array
    let temporalWordIndex = -1;
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[.,!?;:]$/g, '');
      if (bodyTemporalTokens.some((token) => token === word || word.includes(token))) {
        temporalWordIndex = i;
        break;
      }
    }

    // If we found a temporal token within reasonable range, extend to include it
    if (temporalWordIndex >= 0 && temporalWordIndex < maxWords + 3) {
      const extendedWords = words.slice(0, Math.max(maxWords, temporalWordIndex + 1));
      const title = extendedWords.join(' ');

      // If we're still within character limit, use it
      if (title.length <= MAX_TITLE_CHARS) {
        if (words.length > extendedWords.length && !/[.!?]$/.test(title)) {
          return title + '...';
        }
        return title;
      }
    }
  }

  // Standard fallback: first N words
  const truncatedWords = words.slice(0, maxWords);
  const title = truncatedWords.join(' ');

  // If we truncated and the title doesn't end with punctuation, add ellipsis
  if (words.length > maxWords && !/[.!?]$/.test(title)) {
    return title + '...';
  }

  return title;
}

/**
 * Normalize a todo title based on the body text and optional AI-generated title.
 *
 * Rules:
 * 1. If aiTitle is provided and acceptable (short, preserves temporal hints), use it
 * 2. Otherwise, create a fallback title from the first 6-8 words of body
 * 3. Never return the full body as the title
 *
 * @param body - The full Mind Drop text (required)
 * @param aiTitle - Optional AI-generated title from BackgroundPrefill
 * @returns A short, clean title for the todo
 */
export function normalizeTodoTitle(body: string, aiTitle?: string | null): string {
  const trimmedBody = body.trim();

  // Safety: if body is empty, return a default
  if (!trimmedBody) {
    return 'New task';
  }

  // If AI title is provided and passes validation, use it
  if (aiTitle && typeof aiTitle === 'string') {
    const trimmedAiTitle = aiTitle.trim();
    if (trimmedAiTitle && isAiTitleAcceptable(trimmedAiTitle, trimmedBody)) {
      return trimmedAiTitle;
    }
  }

  // Fallback: create title from first N words of body
  return createFallbackTitle(trimmedBody);
}

/**
 * Validate and normalize todo title during BackgroundPrefill.
 * Only returns the AI title if it's acceptable; otherwise returns null
 * to signal that the caller should use the existing title.
 *
 * @param body - The full Mind Drop text
 * @param aiTitle - AI-generated title candidate
 * @returns Object with validated title and rejection reason (if applicable)
 */
export function validateAiTitleForTodo(
  body: string,
  aiTitle: string | null | undefined,
): { title: string | null; reason?: string } {
  if (!aiTitle || typeof aiTitle !== 'string') {
    return { title: null, reason: 'empty or invalid type' };
  }

  const trimmedAiTitle = aiTitle.trim();
  const trimmedBody = body.trim();

  if (!trimmedAiTitle) {
    return { title: null, reason: 'empty after trim' };
  }

  // Reject if AI title is identical to the full body
  if (trimmedAiTitle === trimmedBody) {
    return { title: null, reason: 'identical to body' };
  }

  // Reject if AI title is too long (max 80 chars)
  if (trimmedAiTitle.length > 80) {
    return { title: null, reason: 'longer than 80 chars' };
  }

  // Reject if AI title is not shorter than the body (should be a summary)
  if (trimmedAiTitle.length >= trimmedBody.length) {
    return { title: null, reason: 'longer than or equal to body' };
  }

  // AI title passed all validation checks
  return { title: trimmedAiTitle };
}
