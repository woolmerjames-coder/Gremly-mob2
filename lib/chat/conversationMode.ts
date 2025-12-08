/**
 * Conversation Mode Detection for Space Chat
 *
 * Detects whether the user is in a reflective/venting state vs an operational/planning state.
 * This helps Gremly respond appropriately - listening first when users are venting,
 * and offering structure when they're ready to plan.
 *
 * @example
 * ```ts
 * // Reflective mode - user is venting, Gremly should listen
 * detectConversationMode("I'm feeling so overwhelmed lately")
 * // → 'reflective'
 *
 * // Operational mode - user wants to take action, Gremly can offer structure
 * detectConversationMode("I want to start a daily exercise routine")
 * // → 'operational'
 *
 * // Neutral mode - unclear intent, Gremly stays conversational
 * detectConversationMode("I've been thinking about my schedule")
 * // → 'neutral'
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * The detected mode of conversation.
 *
 * - 'operational': User is ready to plan, create, or take action
 * - 'reflective': User is processing emotions, venting, or exploring thoughts
 * - 'neutral': Mixed signals or unclear intent - stay conversational
 */
export type ConversationMode = 'operational' | 'reflective' | 'neutral';

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

/**
 * Patterns that indicate action-oriented, planning language.
 * When matched, suggests user is in operational mode and ready for structure.
 */
export const OPERATIONAL_INTENT_PATTERNS: RegExp[] = [
  // Action words
  /\b(want to|wanna|need to|have to|going to|gonna|will|plan to|should|must)\b/i,

  // Help requests
  /\b(help me|can you help|start|begin|create|set up|make a|make my)\b/i,

  // Scheduling/routine language
  /\b(every day|every week|daily|weekly|monthly|routine|habit|schedule)\b/i,

  // Deadlines and time constraints
  /\b(by|before|due|deadline|tomorrow|next week|this weekend|tonight|today)\b/i,

  // Save/track intent
  /\b(save|remember|note|log|track|record|remind me|add|write down)\b/i,

  // Goal-oriented
  /\b(goal|target|achieve|accomplish|finish|complete|done with)\b/i,

  // List/task creation
  /\b(list of|todo|to-do|checklist|things to do|tasks)\b/i,

  // Question-based planning
  /\b(how do i|how can i|what should i|when should i)\b/i,
];

/**
 * Patterns that indicate emotional, exploratory, or venting state.
 * When matched, suggests user needs to be heard before being offered solutions.
 */
export const REFLECTIVE_PATTERNS: RegExp[] = [
  // Emotional state expressions
  /\b(i feel|i'm feeling|feeling|felt|i've felt)\b/i,

  // Stress and overwhelm
  /\b(stressed|anxious|overwhelmed|tired|exhausted|frustrated|confused|lost|stuck)\b/i,

  // More emotions
  /\b(sad|angry|annoyed|worried|scared|nervous|upset|bummed|down|low)\b/i,

  // Exploratory thinking
  /\b(thinking about|wondering|not sure|don't know|idk|maybe|perhaps)\b/i,

  // Uncertainty expressions
  /\b(what if|i guess|i suppose|might|could be|i think maybe)\b/i,

  // Venting interjections
  /\b(ugh|oof|man|honestly|seriously|literally|tbh|ngl)\b/i,

  // Frustration expressions
  /\b(hate|can't stand|so tired of|sick of|fed up|over it)\b/i,

  // Past/ongoing reflection
  /\b(was thinking|been feeling|been thinking|lately i've|recently i've)\b/i,

  // Processing/struggling
  /\b(struggling|having trouble|hard time|difficult|tough|rough)\b/i,

  // Self-doubt
  /\b(i can't|i'm not|i don't think i|never going to|won't be able)\b/i,

  // Just venting markers
  /\b(just need to vent|just venting|hear me out|let me rant)\b/i,
];

// ============================================================================
// DETECTION FUNCTION
// ============================================================================

/**
 * Detects the conversation mode based on the user's message.
 *
 * Logic:
 * - If reflective AND NOT operational → 'reflective' (pure venting/processing)
 * - If reflective AND operational → 'neutral' (mixed signals, stay flexible)
 * - If operational only → 'operational' (ready for action)
 * - Otherwise → 'neutral' (unclear, stay conversational)
 *
 * @param text - The user's message to analyze
 * @returns The detected conversation mode
 *
 * @example
 * ```ts
 * detectConversationMode("I'm so stressed about work")
 * // → 'reflective'
 *
 * detectConversationMode("I need to create a morning routine")
 * // → 'operational'
 *
 * detectConversationMode("I've been stressed, I think I need a routine")
 * // → 'neutral' (mixed - both venting AND wanting action)
 *
 * detectConversationMode("Hey, how's it going?")
 * // → 'neutral' (no strong signals either way)
 * ```
 */
export function detectConversationMode(text: string): ConversationMode {
  if (!text || typeof text !== 'string') {
    return 'neutral';
  }

  const normalizedText = text.toLowerCase().trim();

  // Check for operational patterns
  const hasOperationalIntent = OPERATIONAL_INTENT_PATTERNS.some((pattern) =>
    pattern.test(normalizedText),
  );

  // Check for reflective patterns
  const hasReflectiveSignals = REFLECTIVE_PATTERNS.some((pattern) => pattern.test(normalizedText));

  // Determine mode based on pattern matches
  if (hasReflectiveSignals && !hasOperationalIntent) {
    // Pure reflective - user is venting/processing, not asking for action
    return 'reflective';
  }

  if (hasReflectiveSignals && hasOperationalIntent) {
    // Mixed signals - user might be venting but also wants help
    // Stay neutral/flexible to not miss either need
    return 'neutral';
  }

  if (hasOperationalIntent && !hasReflectiveSignals) {
    // Pure operational - user is ready to take action
    return 'operational';
  }

  // No strong signals either way
  return 'neutral';
}

/**
 * Helper to check if text contains strong emotional content.
 * Useful for adjusting response tone even in operational mode.
 *
 * @param text - The user's message
 * @returns True if emotional content detected
 */
export function hasEmotionalContent(text: string): boolean {
  if (!text) return false;

  const emotionalPatterns = [
    /\b(stressed|anxious|overwhelmed|frustrated|sad|angry|worried|scared|tired)\b/i,
    /\b(i feel|i'm feeling|feeling)\b/i,
    /\b(ugh|oof|hate|can't stand)\b/i,
  ];

  return emotionalPatterns.some((pattern) => pattern.test(text));
}

/**
 * Helper to check if text contains explicit action requests.
 * Useful for detecting when to offer structure even in reflective conversations.
 *
 * @param text - The user's message
 * @returns True if explicit action request detected
 */
export function hasExplicitActionRequest(text: string): boolean {
  if (!text) return false;

  const actionPatterns = [
    /\b(help me|can you help|please help)\b/i,
    /\b(create|make|set up|start|add|save)\b/i,
    /\b(want to|need to|have to)\s+(create|make|start|do|track)\b/i,
  ];

  return actionPatterns.some((pattern) => pattern.test(text));
}
