/**
 * Meta-Intent Detection for Space Chat
 *
 * Detects explicit user commands like "save this", "summarize this chat",
 * and extracts any inline content or type specifications.
 *
 * Meta-intents are high-priority user commands that should be handled
 * before regular conversation flow - they indicate the user wants to
 * perform a specific action rather than continue chatting.
 *
 * @example
 * ```ts
 * // Detect save requests
 * detectSaveThisIntent("save this");
 * // → { isSaveRequest: true, explicitType: 'auto', rawMatch: 'save this' }
 *
 * detectSaveThisIntent("make this a todo");
 * // → { isSaveRequest: true, explicitType: 'todo', rawMatch: 'make this a todo' }
 *
 * // Detect summary requests
 * detectSummaryIntent("summarize this chat");
 * // → true
 *
 * // Extract inline content
 * extractInlineContent("save this: call dentist tomorrow");
 * // → "call dentist tomorrow"
 * ```
 */

import { SaveableType } from './saveableTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * The type of entity when user explicitly specifies.
 * 'auto' means user didn't specify - let the system decide.
 */
export type ExplicitSaveType = 'todo' | 'habit' | 'note' | 'auto';

/**
 * Result when a "save this" intent is detected.
 */
export interface SaveThisIntent {
  /** Always true for this type */
  isSaveRequest: true;

  /**
   * The type of entity to create.
   * 'auto' if user didn't specify (e.g., just "save this").
   * 'todo', 'habit', or 'note' if user explicitly asked.
   */
  explicitType: ExplicitSaveType;

  /** The matched text that triggered the detection */
  rawMatch: string;
}

// ============================================================================
// Save This Patterns
// ============================================================================

/**
 * Patterns that detect explicit "save this" requests from users.
 *
 * These patterns capture various ways users might ask to save
 * the previous assistant message or conversation content.
 */
export const SAVE_THIS_PATTERNS: RegExp[] = [
  // Direct commands
  /^save\s+(this|that|it)$/i,
  /^save\s+(this|that|it)\s*[.!]?$/i,

  // Polite requests
  /^(can you\s+)?save\s+(this|that)(\s+for me)?[.!?]?$/i,
  /^(please\s+)?save\s+(this|that)(\s+please)?[.!?]?$/i,

  // Remember/don't forget
  /^remember\s+(this|that)[.!]?$/i,
  /^(don't|do not)\s+let\s+me\s+forget\s+(this|that)[.!]?$/i,
  /^let\s+me\s+not\s+forget\s+(this|that)[.!]?$/i,

  // Keep
  /^keep\s+(this|that)[.!]?$/i,
  /^keep\s+(this|that)\s+saved[.!]?$/i,

  // Note
  /^note\s+(this|that)(\s+down)?[.!]?$/i,
  /^(take\s+)?note\s+of\s+(this|that)[.!]?$/i,

  // "I want to" variants
  /^i\s+want\s+to\s+(save|remember|keep)\s+(this|that)[.!]?$/i,
  /^i('d| would)\s+like\s+to\s+(save|remember|keep)\s+(this|that)[.!]?$/i,

  // Type-specific: "make this a todo"
  /^make\s+(this|that)\s+a\s+(todo|task|habit|note|log)[.!]?$/i,

  // Type-specific: "add this as a todo"
  /^(add|create)\s+(this|that)\s+as\s+a\s+(todo|task|habit|note|log)[.!]?$/i,

  // Type-specific: "turn this into a todo"
  /^turn\s+(this|that)\s+into\s+a\s+(todo|task|habit|note|log)[.!]?$/i,

  // Type-specific: "save this as a todo"
  /^save\s+(this|that)\s+as\s+a\s+(todo|task|habit|note|log)[.!]?$/i,
];

/**
 * Patterns that match type-specific save requests and capture the type.
 * These are used to extract what type of entity the user wants to create.
 */
export const TYPE_SPECIFIC_PATTERNS: Array<{ pattern: RegExp; typeIndex: number }> = [
  // "make this a todo" - type is in capture group 2
  { pattern: /^make\s+(this|that)\s+a\s+(todo|task|habit|note|log)/i, typeIndex: 2 },

  // "add this as a todo" - type is in capture group 3
  { pattern: /^(add|create)\s+(this|that)\s+as\s+a\s+(todo|task|habit|note|log)/i, typeIndex: 3 },

  // "turn this into a todo" - type is in capture group 2
  { pattern: /^turn\s+(this|that)\s+into\s+a\s+(todo|task|habit|note|log)/i, typeIndex: 2 },

  // "save this as a todo" - type is in capture group 2
  { pattern: /^save\s+(this|that)\s+as\s+a\s+(todo|task|habit|note|log)/i, typeIndex: 2 },
];

// ============================================================================
// Summary Request Patterns
// ============================================================================

/**
 * Patterns that detect requests for conversation summary.
 */
export const SUMMARY_REQUEST_PATTERNS: RegExp[] = [
  // Direct summary requests
  /^(give\s+me\s+)?a?\s*summary(\s+of\s+(this|our)\s+(chat|conversation))?[.!?]?$/i,
  /^summar(ize|ise)(\s+(this|our))?(\s+(chat|conversation))?[.!?]?$/i,

  // Recap
  /^recap(\s+(this|our)\s+(chat|conversation))?[.!?]?$/i,
  /^(give\s+me\s+)?a?\s*recap[.!?]?$/i,

  // What have we discussed
  /^what\s+(have\s+)?we\s+(talked|discussed|covered)(\s+about)?[.!?]?$/i,
  /^what\s+did\s+we\s+(talk|discuss|cover)(\s+about)?[.!?]?$/i,

  // Catch me up
  /^catch\s+me\s+up[.!?]?$/i,

  // TL;DR
  /^what('s|\s+is)\s+the\s+tl;?dr[.!?]?$/i,
  /^tl;?dr[.!?]?$/i,

  // Informal
  /^what\s+was\s+(this|that|our)\s+(chat|conversation)\s+about[.!?]?$/i,
  /^remind\s+me\s+what\s+we\s+(talked|discussed)\s+about[.!?]?$/i,
];

// ============================================================================
// Inline Content Pattern
// ============================================================================

/**
 * Pattern to extract inline content from save requests.
 * Matches: "save this: [content]", "remember this: [content]", etc.
 */
export const INLINE_CONTENT_PATTERN = /^(?:save|remember|note|keep)\s+(?:this|that):\s*(.+)$/i;

/**
 * Alternative patterns for inline content extraction.
 */
export const INLINE_CONTENT_PATTERNS: RegExp[] = [
  // "save this: call dentist"
  /^(?:save|remember|note|keep)\s+(?:this|that):\s*(.+)$/i,

  // "save: call dentist"
  /^(?:save|remember|note):\s*(.+)$/i,

  // "note down: call dentist"
  /^note\s+down:\s*(.+)$/i,

  // "add to my notes: call dentist"
  /^add\s+to\s+my\s+(?:notes|todos|list):\s*(.+)$/i,
];

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect if a message is an explicit "save this" request.
 *
 * @param text - The user's message to analyze
 * @returns SaveThisIntent if save request detected, null otherwise
 *
 * @example
 * ```ts
 * detectSaveThisIntent("save this");
 * // → { isSaveRequest: true, explicitType: 'auto', rawMatch: 'save this' }
 *
 * detectSaveThisIntent("make this a habit");
 * // → { isSaveRequest: true, explicitType: 'habit', rawMatch: 'make this a habit' }
 *
 * detectSaveThisIntent("how's the weather?");
 * // → null
 * ```
 */
export function detectSaveThisIntent(text: string): SaveThisIntent | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalizedText = text.trim();

  // First, check type-specific patterns to extract explicit type
  for (const { pattern, typeIndex } of TYPE_SPECIFIC_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      const rawType = match[typeIndex]?.toLowerCase();
      const explicitType = normalizeExplicitType(rawType);

      return {
        isSaveRequest: true,
        explicitType,
        rawMatch: match[0],
      };
    }
  }

  // Then check general save patterns
  for (const pattern of SAVE_THIS_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      return {
        isSaveRequest: true,
        explicitType: 'auto',
        rawMatch: match[0],
      };
    }
  }

  return null;
}

/**
 * Normalize user's type specification to our ExplicitSaveType.
 *
 * @param rawType - The type extracted from user message
 * @returns Normalized ExplicitSaveType
 */
function normalizeExplicitType(rawType: string | undefined): ExplicitSaveType {
  if (!rawType) return 'auto';

  const normalized = rawType.toLowerCase().trim();

  switch (normalized) {
    case 'todo':
    case 'task':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'note':
    case 'log':
      return 'note';
    default:
      return 'auto';
  }
}

/**
 * Detect if a message is a request for conversation summary.
 *
 * @param text - The user's message to analyze
 * @returns True if summary request detected
 *
 * @example
 * ```ts
 * detectSummaryIntent("summarize this chat");
 * // → true
 *
 * detectSummaryIntent("what have we talked about?");
 * // → true
 *
 * detectSummaryIntent("save this");
 * // → false
 * ```
 */
export function detectSummaryIntent(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalizedText = text.trim();

  return SUMMARY_REQUEST_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

/**
 * Extract inline content from a save request.
 *
 * Some users include the content directly in their save request:
 * "save this: call dentist tomorrow at 3pm"
 *
 * @param text - The user's message to analyze
 * @returns The extracted content, or null if no inline content
 *
 * @example
 * ```ts
 * extractInlineContent("save this: call dentist tomorrow");
 * // → "call dentist tomorrow"
 *
 * extractInlineContent("remember this: pick up groceries");
 * // → "pick up groceries"
 *
 * extractInlineContent("save this");
 * // → null (no inline content)
 * ```
 */
export function extractInlineContent(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalizedText = text.trim();

  for (const pattern of INLINE_CONTENT_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      const content = match[1].trim();
      // Only return if there's actual content
      if (content.length > 0) {
        return content;
      }
    }
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick check if text might be a meta-intent (save or summary request).
 *
 * Use this for early filtering before running full detection.
 *
 * @param text - The user's message
 * @returns True if text might be a meta-intent
 */
export function mightBeMetaIntent(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalizedText = text.toLowerCase().trim();

  // Quick keyword checks
  const metaKeywords = [
    'save',
    'remember',
    'keep',
    'note',
    'summary',
    'summarize',
    'summarise',
    'recap',
    'tl;dr',
    'tldr',
    'catch me up',
  ];

  return metaKeywords.some((keyword) => normalizedText.includes(keyword));
}

/**
 * Convert ExplicitSaveType to SaveableType for the detection system.
 *
 * @param explicitType - The user's explicit type choice
 * @returns The corresponding SaveableType, or null for 'auto'
 */
export function explicitTypeToSaveableType(explicitType: ExplicitSaveType): SaveableType | null {
  switch (explicitType) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'note':
      return 'log-general';
    case 'auto':
      return null; // Let detection system decide
    default:
      return null;
  }
}
