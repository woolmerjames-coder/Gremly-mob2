/**
 * Master Classifier Specification
 *
 * Central source of truth for Mind Drop intent classification.
 * Defines categories, thresholds, and pure heuristic functions for classifying user input.
 *
 * This module is:
 * - Pure (no I/O, no network calls, no database access)
 * - Fully testable in isolation
 * - The canonical reference for classification behavior
 *
 * Phase 0: Establishes the spec and golden tests without changing existing behavior.
 * Future phases will migrate existing classifiers to use this spec.
 */

/**
 * Master categories for Mind Drop classification
 *
 * - todo: Actionable task with completion state
 * - habit: Recurring behavior to track or change
 * - log_journal: Personal reflection/emotion/experience
 * - log_idea: Creative thought/brainstorm/what-if
 * - log_general: Reference info/notes/facts (default for meaningful content)
 * - unsorted: Gibberish/meta-comment/unclear (rare, reserved for true non-content)
 */
export type MasterCategory =
  | 'todo'
  | 'habit'
  | 'log_journal'
  | 'log_idea'
  | 'log_general'
  | 'unsorted';

/**
 * Classification confidence thresholds
 */
export const MASTER_CLASSIFIER_THRESHOLDS = {
  // If any signal for a category (heuristic or AI) is >= this, we pick it
  MIN_CATEGORY_CONFIDENCE: 0.4,

  // Below this, but with real words → log_general (not unsorted)
  LOW_CONFIDENCE_FALLBACK: 0.4,

  // Only for true gibberish/meta to allow "unsorted"
  ALLOW_UNSORTED_MAX: 0.03, // target, not used programmatically yet
};

/**
 * Check if text looks like a todo (actionable task)
 *
 * Patterns:
 * - Imperative verbs: call, email, buy, send, schedule, book, plan, pack, submit, pay, remember, cancel, etc.
 * - Time-bound/appointment patterns: at 3pm, by April 15, on Saturday at 7, dates, "tomorrow", "next week"
 * - Action-oriented language suggesting a task to complete
 */
export function isTodoLike(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Imperative verb patterns at start
  const imperativeVerbs = [
    'call',
    'email',
    'text',
    'message',
    'contact',
    'buy',
    'get',
    'pick up',
    'purchase',
    'order',
    'send',
    'submit',
    'deliver',
    'ship',
    'schedule',
    'book',
    'reserve',
    'plan',
    'pack',
    'prepare',
    'organize',
    'pay',
    'invoice',
    'charge',
    'remember',
    'remind',
    "don't forget",
    'cancel',
    'reschedule',
    'postpone',
    'finish',
    'complete',
    'wrap up',
    'review',
    'check',
    'verify',
    'confirm',
    'update',
    'fix',
    'repair',
    'meet',
    'meeting',
    'catch up',
    'ask',
    'tell',
    'notify',
    'inform',
    'return',
    'exchange',
    'refund',
    'renew',
    'extend',
    'restart',
  ];

  const startsWithImperative = imperativeVerbs.some((verb) => {
    // Match verb at start or after common prefixes
    const patterns = [
      new RegExp(`^${verb}\\b`, 'i'),
      new RegExp(`^(to\\s+)?${verb}\\b`, 'i'),
      new RegExp(`^(need to\\s+)?${verb}\\b`, 'i'),
      new RegExp(`^(have to\\s+)?${verb}\\b`, 'i'),
      new RegExp(`^(must\\s+)?${verb}\\b`, 'i'),
    ];
    return patterns.some((pattern) => pattern.test(lower));
  });

  // Time-bound patterns (appointments, deadlines, dates)
  // IMPORTANT: Use \b for word boundaries to avoid false positives
  const timeBoundPatterns = [
    /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i, // "at 3pm", "at 2:30pm" - but not "closes at 5pm"
    /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bby\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(tomorrow|today|tonight)\b/i,
    /\bnext\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bthis\s+(week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\d{1,2}\/\d{1,2}/, // dates like "3/15" or "12/25"
    /\d{1,2}-\d{1,2}/, // dates like "3-15"
    /\b(appointment|meeting|call|party|event)\b.*\bat\s+\d/i, // "meeting at 2"
    /\bbirthday\b.*\b(at|on)\b/i, // "birthday party on Saturday"
  ];

  // Exclude passive/informational time mentions (not actionable)
  const passiveTimePatterns = [
    /\b(closes|opens|lands|arrives|starts|ends)\b.*\bat\s+\d/i, // "closes at 5pm", "lands at 3:45"
  ];

  const hasPassiveTime = passiveTimePatterns.some((pattern) => pattern.test(text));
  if (hasPassiveTime) return false; // Not a todo if it's just stating a fact

  const hasTimebound = timeBoundPatterns.some((pattern) => pattern.test(text));

  return startsWithImperative || hasTimebound;
}

/**
 * Check if text looks like a habit (recurring behavior to track or change)
 *
 * Patterns:
 * - Recurrence words: daily, every, each, per week, 3x/week, Mondays, etc.
 * - Behavior change: quit, stop, start, maintain, keep doing
 * - Tracking language: "track X daily", "log X every Y"
 */
export function isHabitLike(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Recurrence patterns
  const recurrencePatterns = [
    /\bevery\s+(day|morning|night|week|month)/i,
    /\bdaily\b/i,
    /\beach\s+(day|morning|night|week)/i,
    /\bper\s+(day|week|month)/i,
    /\d+x?\s*(per|\/)\s*(day|week|month)/i, // "3x per week", "2/week"
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i, // "Mondays", "Monday Wednesday Friday"
    /\bweekly\b/i,
    /\bmonthly\b/i,
  ];

  const hasRecurrence = recurrencePatterns.some((pattern) => pattern.test(text));

  // Behavior change patterns
  const behaviorChangePatterns = [
    /\bquit\s+(smoking|drinking|caffeine|sugar)/i,
    /\bstop\s+(eating|drinking|doing)/i,
    /\bstart\s+(running|meditating|journaling|reading)/i,
    /\bmaintain\b/i,
    /\bkeep\s+(doing|going|up)/i,
    /\bno\s+(phone|screen|social media|alcohol)/i,
  ];

  const hasBehaviorChange = behaviorChangePatterns.some((pattern) => pattern.test(text));

  // Tracking patterns
  const trackingPatterns = [
    /\btrack\s+\w+\s+(daily|weekly|every)/i,
    /\blog\s+\w+\s+(daily|weekly|every)/i,
    /\brecord\s+\w+\s+(daily|weekly|every)/i,
  ];

  const hasTracking = trackingPatterns.some((pattern) => pattern.test(text));

  // Routine patterns
  const routinePatterns = [
    /\broutine\b/i,
    /\b(morning|evening|bedtime)\s+(routine|ritual)/i,
    /\bbefore\s+(bed|sleep|breakfast)/i,
    /\bafter\s+(work|gym|dinner)/i,
  ];

  const hasRoutine = routinePatterns.some((pattern) => pattern.test(text));

  return hasRecurrence || hasBehaviorChange || hasTracking || hasRoutine;
}

/**
 * Check if text looks like a journal entry (personal reflection/emotion/experience)
 *
 * Patterns:
 * - First-person emotions: I feel, I'm feeling, I'm so, I need to process, etc.
 * - Emotional language: overwhelmed, anxious, grateful, proud, stuck, frustrated
 * - Reflective language: thinking about, processing, can't stop
 */
export function looksLikeJournal(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // First-person emotional expressions
  const emotionalPatterns = [
    /\bi\s+feel(ing)?\s+(so\s+)?(overwhelmed|anxious|grateful|proud|stuck|frustrated|happy|sad|angry|excited|nervous|calm|peaceful|tired|exhausted)/i,
    /\bi'm\s+(so\s+)?(overwhelmed|anxious|grateful|proud|stuck|frustrated|happy|sad|angry|excited|nervous|calm|peaceful|tired|exhausted)/i,
    /\bi\s+need\s+to\s+process/i,
    /\bfeeling\s+(overwhelmed|anxious|grateful|proud|stuck|frustrated|happy|sad|angry|excited|nervous|calm|peaceful|tired|exhausted)/i,
  ];

  const hasEmotionalPattern = emotionalPatterns.some((pattern) => pattern.test(text));

  // Reflective patterns
  const reflectivePatterns = [
    /\bcan't\s+stop\s+thinking\s+about/i,
    /\bthinking\s+about/i,
    /\b(today|tonight|this\s+(morning|afternoon|evening))\s+was\s+(exhausting|amazing|overwhelming|difficult|good|bad|hard)/i,
    /\b(had|experienced)\s+a\s+(panic\s+attack|breakdown|moment)/i,
    /\breally\s+proud\s+of/i,
    /\bbest\s+(day|week|moment)/i,
    /\bworst\s+(day|week|moment)/i,
  ];

  const hasReflectivePattern = reflectivePatterns.some((pattern) => pattern.test(text));

  return hasEmotionalPattern || hasReflectivePattern;
}

/**
 * Check if text looks like an idea (creative thought/brainstorm/what-if)
 *
 * Patterns:
 * - Explicit: "App idea:", "Feature idea:", "Business idea:"
 * - Speculative: "What if we", "We could", "Maybe we should", "Imagine if", "Could we…"
 * - Creative/exploratory language
 */
export function looksLikeIdea(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Explicit idea markers
  const explicitPatterns = [
    /\b(app|feature|business|product|design|startup|project)\s+idea:/i,
    /\bidea:/i,
  ];

  const hasExplicitMarker = explicitPatterns.some((pattern) => pattern.test(text));

  // Speculative/exploratory patterns
  const speculativePatterns = [
    /\bwhat\s+if\s+(we|I|you|users|they)/i, // "What if we...", "What if users..."
    /\b(we|I)\s+could\s+(try|build|add|make|create)/i,
    /\bmaybe\s+(we|I)\s+should/i,
    /\bimagine\s+if/i,
    /\bcould\s+(we|I|build|add|try)/i, // "Could build...", "Could we..."
    /\bpotential\s+(solution|approach|feature)/i,
    /\bconcept:/i,
    /\b(explore|exploring)\s+a\s+(version|approach|way)/i,
  ];

  const hasSpeculativePattern = speculativePatterns.some((pattern) => pattern.test(text));

  return hasExplicitMarker || hasSpeculativePattern;
}

/**
 * Check if text contains real words (not gibberish)
 *
 * Returns false for:
 * - Very short numeric-only / symbol-only ("123", "xxxx", "@@@@@", "...")
 * - Random keyboard mash (asdfghjkl, repeated nonsense)
 * - Empty or whitespace-only
 *
 * Returns true for anything with normal words/spaces
 */
export function hasRealWords(text: string): boolean {
  const trimmed = text.trim();

  // Empty or whitespace-only
  if (!trimmed) return false;

  // Very short (1-2 chars) is likely gibberish
  if (trimmed.length <= 2) return false;

  // Pure numbers
  if (/^\d+$/.test(trimmed)) return false;

  // Pure symbols/punctuation
  if (/^[^\w\s]+$/.test(trimmed)) return false;

  // Repeated single character (xxx, @@@, ...)
  if (/^(.)\1+$/.test(trimmed)) return false;

  // Keyboard mash detection: repeating patterns like "asdf", "qwerty", etc.
  const keyboardPatterns = [
    /asdf/i,
    /qwer/i,
    /zxcv/i,
    /hjkl/i,
    /^[a-z]{8,}$/i, // long string of only lowercase letters (likely mash)
  ];

  const looksLikeMash = keyboardPatterns.some((pattern) => pattern.test(trimmed));
  if (looksLikeMash && trimmed.length < 15) return false; // short mash is gibberish

  // Repeated words (test test test)
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length >= 3 && words.every((w) => w === words[0])) return false;

  // If we made it here, assume it has real words
  return true;
}

/**
 * Get preferred master category from text only (no AI, pure heuristics)
 *
 * Decision flow:
 * 1. Empty or gibberish → unsorted
 * 2. Todo-like patterns → todo
 * 3. Habit-like patterns → habit
 * 4. Journal-like patterns → log_journal
 * 5. Idea-like patterns → log_idea
 * 6. Default: log_general (heavy bias to capture meaningful content)
 *
 * This function is pure and fully testable in isolation.
 */
export function getPreferredMasterCategoryFromTextOnly(text: string): MasterCategory {
  const trimmed = text.trim();

  // Guard: empty or gibberish
  if (!trimmed) return 'unsorted';
  if (!hasRealWords(trimmed)) return 'unsorted';

  // Priority order (most specific to least specific)
  if (isTodoLike(trimmed)) return 'todo';
  if (isHabitLike(trimmed)) return 'habit';
  if (looksLikeJournal(trimmed)) return 'log_journal';
  if (looksLikeIdea(trimmed)) return 'log_idea';

  // Heavy bias to log_general instead of unsorted for anything meaningful
  return 'log_general';
}
