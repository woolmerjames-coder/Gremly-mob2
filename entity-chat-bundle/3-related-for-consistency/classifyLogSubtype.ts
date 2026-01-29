/**
 * Log Subtype Classifier
 *
 * Classifies log entries into specific subtypes using AI classification with deterministic fallback.
 *
 * Subtypes:
 * - "journal": Personal reflections, feelings, or daily experiences
 * - "idea": Creative thoughts or brainstorming
 * - "general": Default for all other logs (lists, references, reminders, etc.)
 *
 * Note: 'list' is detected as an attribute (has_list flag), not a log subtype.
 */

import { callClassify } from './CortexClient';

// Re-export from core types for consistency
export type { LogSubtype } from '../types';
import type { LogSubtype } from '../types';

/**
 * AI classification prompt for log subtype detection.
 */
const CLASSIFICATION_PROMPT = `You are a classifier that analyzes text to determine what type of log entry it is.

Analyze the following text and respond with ONLY ONE WORD from this list:
- journal (personal reflections, feelings, daily experiences, "I feel...", "Today was...")
- idea (creative thoughts, brainstorming, "what if...", proposals, concepts)
- general (anything else: lists, references, reminders, notes to remember)

Respond with exactly one word: journal, idea, or general.`;

/**
 * Classify log subtype using AI with deterministic fallback.
 *
 * Attempts AI classification first. If AI fails or is disabled, falls back to
 * pattern-matching logic for reliability.
 */
export async function classifyLogSubtype(text: string): Promise<LogSubtype> {
  if (!text || text.trim().length === 0) {
    return 'general';
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
      const validSubtypes: LogSubtype[] = ['journal', 'idea', 'general'];
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
 * 1. Journal (emotional/reflective language)
 * 2. Idea (creative/speculative language)
 * 3. General (default - lists, references, reminders, etc.)
 *
 * Note: List detection is handled separately via heuristics that set has_list flag.
 */
export function classifyLogSubtypeSync(text: string): LogSubtype {
  if (!text || text.trim().length === 0) {
    return 'general';
  }

  const lowerText = text.toLowerCase();
  const firstChunk = lowerText.slice(0, 300); // Analyze first 300 chars

  // PRIORITY 1: Journal detection - emotional/reflective language
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

  // PRIORITY 2: Idea detection - creative/speculative language
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

  // PRIORITY 3: Default to general for everything else
  // (lists, references, reminders, etc. - list detection is done separately)
  return 'general';
}
