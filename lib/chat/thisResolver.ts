/**
 * "This" Reference Resolution for Space Chat
 *
 * When a user says "save this", we need to figure out what "this" refers to.
 * This module resolves that reference by analyzing the conversation context.
 *
 * Resolution priority:
 * 1. Inline content (user said "save this: call dentist")
 * 2. Last assistant message with actionable content
 * 3. User's previous message (before "save this")
 * 4. Fallback to conversation segment summary
 *
 * @example
 * ```ts
 * const messages = [
 *   { role: 'user', content: 'How can I focus better?' },
 *   { role: 'assistant', content: "I'd suggest the Pomodoro technique..." },
 *   { role: 'user', content: 'save this' },
 * ];
 *
 * const resolution = resolveThisReference(messages, 'save this');
 * // → {
 * //     content: "I'd suggest the Pomodoro technique...",
 * //     source: 'assistant_plan',
 * //     confidence: 0.85
 * //   }
 * ```
 */

import { extractInlineContent } from './metaIntents';

// ============================================================================
// Types
// ============================================================================

/**
 * The result of resolving what "this" refers to.
 */
export interface ThisResolution {
  /**
   * The content that "this" refers to.
   */
  content: string;

  /**
   * Where the content came from.
   *
   * - 'inline': User provided content directly (e.g., "save this: call dentist")
   * - 'assistant_plan': The last assistant message with actionable content
   * - 'user_previous': The user's message before "save this"
   * - 'conversation_segment': A summary of recent conversation turns
   */
  source: 'inline' | 'assistant_plan' | 'user_previous' | 'conversation_segment';

  /**
   * Confidence score from 0 to 1.
   * Higher values indicate more certainty about what user meant.
   */
  confidence: number;
}

/**
 * Simplified message type for resolution logic.
 */
export interface ChatMessageForResolution {
  /** Message role */
  role: 'user' | 'assistant' | 'system';

  /** Message content */
  content: string;

  /** Optional message ID */
  id?: string;
}

// ============================================================================
// Actionable Content Detection
// ============================================================================

/**
 * Patterns that indicate actionable content.
 */
const ACTIONABLE_PATTERNS: RegExp[] = [
  // Numbered lists
  /^\s*\d+\.\s+\w/m,

  // Bulleted lists
  /^\s*[-•*]\s+\w/m,

  // Suggestion words
  /\b(suggest|recommend|try|consider|advise)\b/i,

  // Planning words
  /\b(plan|schedule|routine|habit|steps?|strategy)\b/i,

  // Time references
  /\b(tomorrow|next\s+week|every\s+day|daily|weekly|monthly|tonight|today)\b/i,

  // Action verbs with objects
  /\b(start|begin|create|set\s+up|call|email|buy|make|do|finish|complete)\b/i,

  // "Here's how" type phrases
  /\b(here'?s?\s+(how|a|the|what)|you\s+(can|could|should|might))\b/i,

  // Instructions
  /\b(first|second|third|then|next|finally|step\s+\d)\b/i,
];

/**
 * Check if text contains actionable content worth saving.
 *
 * Actionable content includes:
 * - Lists (numbered or bulleted)
 * - Suggestions or recommendations
 * - Plans, schedules, or routines
 * - Time-bound actions
 * - Step-by-step instructions
 *
 * @param text - Text to analyze
 * @returns True if text contains actionable content
 *
 * @example
 * ```ts
 * containsActionablePlan("I'd suggest trying the Pomodoro technique");
 * // → true
 *
 * containsActionablePlan("That sounds frustrating");
 * // → false
 * ```
 */
export function containsActionablePlan(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Minimum length check - very short messages are unlikely to be actionable
  if (text.trim().length < 20) {
    return false;
  }

  // Check against actionable patterns
  return ACTIONABLE_PATTERNS.some((pattern) => pattern.test(text));
}

// ============================================================================
// Conversation Summary
// ============================================================================

/**
 * Maximum length for conversation segment summary.
 */
const MAX_SUMMARY_LENGTH = 500;

/**
 * Summarize the last N turns of conversation.
 *
 * Takes the most recent user+assistant exchanges and concatenates them
 * into a readable summary, truncating if necessary.
 *
 * @param messages - Array of chat messages
 * @param n - Number of turns (exchanges) to include
 * @returns Summarized conversation text
 *
 * @example
 * ```ts
 * const messages = [
 *   { role: 'user', content: 'How can I focus?' },
 *   { role: 'assistant', content: 'Try the Pomodoro technique.' },
 *   { role: 'user', content: 'save this' },
 * ];
 *
 * summarizeLastNTurns(messages, 2);
 * // → "User: How can I focus?\nAssistant: Try the Pomodoro technique."
 * ```
 */
export function summarizeLastNTurns(messages: ChatMessageForResolution[], n: number): string {
  if (!messages || messages.length === 0 || n <= 0) {
    return '';
  }

  // Filter to user and assistant messages only
  const conversationMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  // Get the last N*2 messages (N turns = N user + N assistant roughly)
  const recentMessages = conversationMessages.slice(-(n * 2));

  // Build summary
  const parts: string[] = [];
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    const content = msg.content.trim();

    if (content) {
      parts.push(`${role}: ${content}`);
    }
  }

  let summary = parts.join('\n');

  // Truncate if too long
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH - 3) + '...';
  }

  return summary;
}

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolve what "this" refers to when user says "save this".
 *
 * Resolution priority:
 * 1. Inline content in the current message
 * 2. Last assistant message with actionable content
 * 3. User's previous message
 * 4. Conversation segment summary
 *
 * @param messages - Array of conversation messages (including current)
 * @param currentUserMessage - The "save this" message from the user
 * @returns ThisResolution with content, source, and confidence
 *
 * @example
 * ```ts
 * // Priority 1: Inline content
 * resolveThisReference([], "save this: call dentist tomorrow");
 * // → { content: "call dentist tomorrow", source: 'inline', confidence: 0.95 }
 *
 * // Priority 2: Last assistant message
 * const messages = [
 *   { role: 'assistant', content: "I'd suggest trying meditation every morning." },
 * ];
 * resolveThisReference(messages, "save this");
 * // → { content: "I'd suggest...", source: 'assistant_plan', confidence: 0.85 }
 * ```
 */
export function resolveThisReference(
  messages: ChatMessageForResolution[],
  currentUserMessage: string,
): ThisResolution {
  // Priority 1: Check for inline content
  const inlineContent = extractInlineContent(currentUserMessage);
  if (inlineContent) {
    return {
      content: inlineContent,
      source: 'inline',
      confidence: 0.95,
    };
  }

  // Get conversation messages (excluding system)
  const conversationMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  // Priority 2: Last assistant message with actionable content
  const lastAssistantMessage = findLastMessageByRole(conversationMessages, 'assistant');
  if (lastAssistantMessage && containsActionablePlan(lastAssistantMessage.content)) {
    return {
      content: lastAssistantMessage.content,
      source: 'assistant_plan',
      confidence: 0.85,
    };
  }

  // Priority 3: User's previous message (before "save this")
  // Find the user message before the current one
  const previousUserMessage = findPreviousUserMessage(conversationMessages, currentUserMessage);
  if (previousUserMessage && previousUserMessage.content.trim().length > 0) {
    return {
      content: previousUserMessage.content,
      source: 'user_previous',
      confidence: 0.7,
    };
  }

  // If there was an assistant message (even without actionable content), use it
  if (lastAssistantMessage && lastAssistantMessage.content.trim().length > 0) {
    return {
      content: lastAssistantMessage.content,
      source: 'assistant_plan',
      confidence: 0.6, // Lower confidence since not actionable
    };
  }

  // Priority 4: Fallback to conversation segment
  const summary = summarizeLastNTurns(conversationMessages, 3);
  if (summary) {
    return {
      content: summary,
      source: 'conversation_segment',
      confidence: 0.5,
    };
  }

  // Last resort: return empty with very low confidence
  return {
    content: '',
    source: 'conversation_segment',
    confidence: 0.1,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the last message with a specific role.
 *
 * @param messages - Array of messages
 * @param role - Role to search for
 * @returns The last message with that role, or null
 */
function findLastMessageByRole(
  messages: ChatMessageForResolution[],
  role: 'user' | 'assistant',
): ChatMessageForResolution | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) {
      return messages[i];
    }
  }
  return null;
}

/**
 * Find the user's previous message (before the current "save this" message).
 *
 * @param messages - Array of messages
 * @param currentMessage - The current message to exclude
 * @returns The previous user message, or null
 */
function findPreviousUserMessage(
  messages: ChatMessageForResolution[],
  currentMessage: string,
): ChatMessageForResolution | null {
  const normalizedCurrent = currentMessage.trim().toLowerCase();

  // Find user messages, excluding the current one
  const userMessages = messages.filter(
    (m) => m.role === 'user' && m.content.trim().toLowerCase() !== normalizedCurrent,
  );

  // Return the last one
  return userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
}

/**
 * Get a confidence description for debugging.
 *
 * @param confidence - Confidence score
 * @returns Human-readable confidence level
 */
export function describeConfidence(confidence: number): string {
  if (confidence >= 0.9) return 'very high';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  if (confidence >= 0.4) return 'low';
  return 'very low';
}

/**
 * Get a source description for debugging.
 *
 * @param source - Resolution source
 * @returns Human-readable source description
 */
export function describeSource(source: ThisResolution['source']): string {
  switch (source) {
    case 'inline':
      return 'user provided content directly';
    case 'assistant_plan':
      return "Gremly's last suggestion";
    case 'user_previous':
      return "user's previous message";
    case 'conversation_segment':
      return 'recent conversation';
    default:
      return 'unknown';
  }
}
