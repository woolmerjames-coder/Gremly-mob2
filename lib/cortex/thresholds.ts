/**
 * Cortex Decision Thresholds
 *
 * Defines confidence thresholds for automatic execution vs. user confirmation.
 *
 * - AUTO (≥0.8): High confidence, execute immediately
 * - ASK (0.5-0.8): Medium confidence, show suggestions for user to confirm
 * - KEEP (<0.5): Low confidence, treat as Catch-All/suggestions only
 */

/**
 * Confidence threshold for automatic execution
 * Actions with confidence >= 0.8 will be executed without user confirmation
 */
export const AUTO_THRESHOLD = 0.8;

/**
 * Confidence threshold for asking user confirmation
 * Actions with confidence >= 0.5 but < 0.8 will be presented as suggestions
 */
export const ASK_THRESHOLD = 0.5;

/**
 * Decision mode based on confidence level
 * - 'auto': Execute immediately (high confidence)
 * - 'ask': Show suggestions for user confirmation (medium confidence)
 * - 'keep': Treat as Catch-All/suggestions (low confidence)
 */
export type DecisionMode = 'auto' | 'ask' | 'keep';

/**
 * Determine decision mode based on confidence score
 *
 * @param confidence - Optional confidence score (0-1 range)
 * @returns Decision mode: 'auto' (≥0.8), 'ask' (0.5-0.8), or 'keep' (<0.5)
 *
 * @example
 * decideMode(0.9)  // returns 'auto'
 * decideMode(0.65) // returns 'ask'
 * decideMode(0.3)  // returns 'keep'
 * decideMode()     // returns 'keep' (no confidence)
 */
export function decideMode(confidence?: number): DecisionMode {
  // No confidence provided or invalid → treat as Catch-All
  if (confidence === undefined || confidence === null || isNaN(confidence)) {
    return 'keep';
  }

  // High confidence → automatic execution
  if (confidence >= AUTO_THRESHOLD) {
    return 'auto';
  }

  // Medium confidence → ask user
  if (confidence >= ASK_THRESHOLD) {
    return 'ask';
  }

  // Low confidence → keep as suggestions/Catch-All
  return 'keep';
}
