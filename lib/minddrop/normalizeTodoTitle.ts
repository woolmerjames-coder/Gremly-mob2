/**
 * Helper to normalize todo titles from Mind Drop text.
 *
 * Ensures clean separation between body (full Mind Drop text) and title (short summary).
 */

/**
 * Strip reminder-style prefixes from Mind Drop input text before using as a title.
 *
 * @example
 * stripReminderPrefix("Remind me to call dentist tomorrow") // → "Call dentist tomorrow"
 * stripReminderPrefix("Don't forget to submit expenses")    // → "Submit expenses"
 * stripReminderPrefix("I need to remember to pick up prescription") // → "Pick up prescription"
 * stripReminderPrefix("Buy milk")                           // → "Buy milk" (no prefix, unchanged)
 */
export function stripReminderPrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // Order matters — longer/more specific patterns first
  const prefixes = [
    /^remind me to\b/i,
    /^remind me that\b/i,
    /^remind me about\b/i,
    /^remind me\b/i,
    /^don'?t let me forget to\b/i,
    /^don'?t let me forget\b/i,
    /^don'?t forget to\b/i,
    /^don'?t forget about\b/i,
    /^don'?t forget\b/i,
    /^i need to remember to\b/i,
    /^i need to remember\b/i,
    /^remember to\b/i,
    /^make sure i\b/i,
    /^i should\b/i,
    /^i need to\b/i,
    /^i have to\b/i,
    /^i gotta\b/i,
    /^gotta\b/i,
    /^need to\b/i,
  ];

  for (const prefix of prefixes) {
    if (prefix.test(trimmed)) {
      const stripped = trimmed.replace(prefix, '').trim();
      // If stripping leaves nothing, return original
      if (!stripped) return trimmed;
      // Capitalize first letter
      return stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
  }

  return trimmed;
}

const MAX_TITLE_CHARS = 60;
const MAX_TITLE_WORDS = 8;
const FALLBACK_TITLE_WORDS = 7;

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
 * For multi-line text, only uses the first line
 */
function createFallbackTitle(body: string, maxWords: number = FALLBACK_TITLE_WORDS): string {
  // For multi-line text, only use the first line for the title
  const firstLine = body.trim().split('\n')[0].trim();
  const words = firstLine.split(/\s+/);

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
