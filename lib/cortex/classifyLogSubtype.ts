/**
 * Log Subtype Classifier
 *
 * Classifies log entries into specific subtypes using AI classification with deterministic fallback.
 *
 * Subtypes:
 * - "journal": Personal reflections, feelings, or daily experiences
 * - "list": Items to check off or remember
 * - "reference": Information to remember later
 * - "idea": Creative thoughts or brainstorming
 * - "plain": Default/unknown (fallback)
 */

import { callClassify } from './CortexClient';

export type LogSubtype = 'journal' | 'list' | 'reference' | 'idea' | 'plain';

/**
 * AI classification prompt for log subtype detection.
 */
const CLASSIFICATION_PROMPT = `You are a classifier that analyzes text to determine what type of log entry it is.

Analyze the following text and respond with ONLY ONE WORD from this list:
- journal (personal reflections, feelings, daily experiences, "I feel...", "Today was...")
- list (items to check off, shopping lists, todos, bullet points, numbered items)
- reference (information to save, passwords, links, contact info, facts to remember)
- idea (creative thoughts, brainstorming, "what if...", proposals, concepts)
- plain (anything else that doesn't fit above categories)

Respond with exactly one word: journal, list, reference, idea, or plain.`;

/**
 * Classify log subtype using AI with deterministic fallback.
 *
 * Attempts AI classification first. If AI fails or is disabled, falls back to
 * pattern-matching logic for reliability.
 */
export async function classifyLogSubtype(text: string): Promise<LogSubtype> {
  if (!text || text.trim().length === 0) {
    return 'plain';
  }

  // Try AI classification first
  try {
    const result = await callClassify({
      messages: [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: text.slice(0, 500) }, // Limit to first 500 chars
      ],
      timeoutMs: 3000, // Fast 3s timeout
    });

    if (result.ok) {
      // Parse the category from AI response
      const category = result.classification.category.toLowerCase().trim();

      // Validate it's one of our known subtypes
      const validSubtypes: LogSubtype[] = ['journal', 'list', 'reference', 'idea', 'plain'];
      if (validSubtypes.includes(category as LogSubtype)) {
        return category as LogSubtype;
      }
    }
  } catch (error) {
    // AI failed, fall through to deterministic logic
    console.log('[classifyLogSubtype] AI classification failed, using fallback:', error);
  }

  // FALLBACK: Deterministic pattern matching
  return classifyLogSubtypeSync(text);
}

/**
 * Synchronous/deterministic classifier using pattern matching.
 * Used as fallback when AI is unavailable or as standalone classifier.
 *
 * Priority order:
 * 1. List (highest priority - structural pattern)
 * 2. Journal (emotional/reflective language)
 * 3. Idea (creative/speculative language)
 * 4. Reference (information storage)
 * 5. Plain (default)
 */
export function classifyLogSubtypeSync(text: string): LogSubtype {
  if (!text || text.trim().length === 0) {
    return 'plain';
  }

  const lowerText = text.toLowerCase();
  const firstChunk = lowerText.slice(0, 300); // Analyze first 300 chars

  // PRIORITY 1: List detection - structural patterns take precedence
  // Multiple lines with bullets/numbers/checkboxes indicate a list
  const lines = text.split(/\r?\n/);
  const listPatterns = /^\s*([-*•]|\d+\.|\[([ xX])\])\s+/;
  const listLikeLines = lines.filter((line) => listPatterns.test(line));

  if (listLikeLines.length >= 2) {
    return 'list';
  }

  // Check for single-line list indicators
  const singleLineListPatterns = [
    /\b(groceries|shopping list|to buy|items to|things to pack)\b/,
    /\b(checklist|todo list|task list)\b/,
  ];
  const isSingleLineList = singleLineListPatterns.some((pattern) => pattern.test(firstChunk));
  if (isSingleLineList) {
    return 'list';
  }

  // PRIORITY 2: Journal detection - emotional/reflective language
  const journalPatterns = [
    /\b(i feel|i'm feeling|feeling|felt|today\b|tonight\b|this morning\b|this evening\b)/,
    /\b(i am|i was|i've been|i have been|i realized|i noticed)/,
    /\b(grateful|thankful|anxious|worried|excited|happy|sad|angry|frustrated)/,
    /\b(reflecting|reflection|my thoughts|my mood|my emotions?)/,
    /\b(had a|it was a|been a)\s+(great|good|bad|rough|tough|hard|amazing|terrible) (day|time|week)/,
  ];

  const journalMatches = journalPatterns.filter((pattern) => pattern.test(firstChunk)).length;
  if (journalMatches >= 1) {
    // At least 1 strong journal indicator
    return 'journal';
  }

  // PRIORITY 3: Idea detection - creative/speculative language
  const ideaPatterns = [
    /\b(idea\b|what if|maybe we could|could we|we should|brainstorm)/,
    /\b(think about|consider|imagine|concept|proposal|suggestion)/,
    /\b(potential|opportunity|innovation|innovative|creative)/,
    /\b(thought:|thoughts:|thinking:)/,
  ];

  const ideaMatches = ideaPatterns.filter((pattern) => pattern.test(firstChunk)).length;
  if (ideaMatches >= 1) {
    return 'idea';
  }

  // PRIORITY 4: Reference detection - information storage
  const referencePatterns = [
    /\b(remember|note:|mentioned|said that|told me|reference)/,
    /\b(password|code|pin|link|url|website|email|phone|address)/,
    /\b(info|information|details|data|facts|instructions)/,
    /\b(the\s+\w+\s+is)\b/, // "the password is", "the code is"
  ];

  const referenceMatches = referencePatterns.filter((pattern) => pattern.test(firstChunk)).length;
  if (referenceMatches >= 1) {
    return 'reference';
  }

  // PRIORITY 5: Default to plain if no clear category
  return 'plain';
}
