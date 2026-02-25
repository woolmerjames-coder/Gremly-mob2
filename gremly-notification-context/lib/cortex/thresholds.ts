/**
 * Cortex Decision Thresholds - Single Source of Truth
 *
 * All numeric thresholds for Mind Drop classification live here.
 * Import from this file - do not hardcode threshold values elsewhere.
 *
 * Threshold Categories:
 * - AUTO-CREATE: When to create entities without user confirmation
 * - CHIPS: When to show disambiguation chips vs auto-create
 * - AI: When to call AI, when to trust AI results
 * - DEFAULTS: Fallback values when confidence is unknown
 * - SPECIAL: Edge case handling
 */

// ============ AUTO-CREATE THRESHOLDS ============
// When confidence >= threshold, create entity without chips

/**
 * Auto-create todo without chips
 * Actions with confidence >= 0.85 will create todos immediately
 */
export const AUTO_TODO = 0.85;

/**
 * Auto-create habit without chips (slightly higher bar)
 * Habits require higher confidence due to recurring nature
 */
export const AUTO_HABIT = 0.9;

/**
 * Auto-create log (lower bar - safe default)
 * Logs are the safest fallback, so lower threshold is acceptable
 */
export const AUTO_LOG = 0.7;

/**
 * Auto-create list when list pattern is strong
 * Lists with clear structure (checkboxes, bullets) can auto-create
 */
export const AUTO_LIST = 0.7;

// ============ CHIP THRESHOLDS ============
// When to show chips vs default to log-general

/**
 * Minimum confidence to show chips (floor)
 * Below this, default to log-general without chips
 */
export const CHIPS_FLOOR = 0.55;

/**
 * Maximum confidence for chips (ceiling - above this, auto-create)
 * Above this threshold, auto-create without showing chips
 */
export const CHIPS_CEILING = 0.85;

// ============ AI THRESHOLDS ============
// When to call AI, when to trust AI results

/**
 * Trigger AI call when heuristic confidence below this
 * If rule-based detection is uncertain, consult AI
 */
export const AI_TRIGGER = 0.7;

/**
 * Trust AI result over heuristic when AI confidence >= this
 * High AI confidence overrides rule-based classification
 */
export const AI_TRUST = 0.8;

/**
 * Ignore AI result when confidence < this (too uncertain)
 * AI results below this threshold are not reliable
 */
export const AI_IGNORE = 0.4;

// ============ DEFAULT CONFIDENCE VALUES ============
// Fallback values when confidence is unknown

/**
 * Default confidence for log-general fallback
 * Used when no classification matches but input should be preserved
 */
export const DEFAULT_LOG_GENERAL = 0.5;

/**
 * Default confidence when engine makes classification but provides no score
 * Assumes engine is reasonably confident if it returned a result
 */
export const DEFAULT_ENGINE_CONFIDENCE = 0.85;

// ============ SPECIAL CASE THRESHOLDS ============

/**
 * High confidence for questions - suppress chips
 * Questions with high confidence should not show action chips
 */
export const QUESTION_SUPPRESS_CHIPS = 0.9;

/**
 * Idea heuristic trigger threshold
 * When idea patterns are detected with this confidence, apply idea heuristic
 */
export const IDEA_HEURISTIC_TRIGGER = 0.5;

// ============ LEGACY EXPORTS (for backwards compatibility) ============
// These map to the new names for existing code that imports them

/**
 * Confidence threshold for automatic execution
 * @deprecated Use AUTO_TODO instead for todos, AUTO_HABIT for habits
 */
export const AUTO_THRESHOLD = AUTO_TODO;

/**
 * Confidence threshold for asking user confirmation
 * Actions with confidence >= 0.5 but < AUTO_THRESHOLD will be presented as suggestions
 */
export const ASK_THRESHOLD = 0.5;

// ============ THRESHOLDS OBJECT ============
// Unified export for easy inspection and type-safe access

/**
 * All thresholds organized by category
 * Use this for programmatic access or debugging
 */
export const THRESHOLDS = {
  auto: {
    todo: AUTO_TODO,
    habit: AUTO_HABIT,
    log: AUTO_LOG,
    list: AUTO_LIST,
  },
  chips: {
    floor: CHIPS_FLOOR,
    ceiling: CHIPS_CEILING,
  },
  ai: {
    trigger: AI_TRIGGER,
    trust: AI_TRUST,
    ignore: AI_IGNORE,
  },
  defaults: {
    logGeneral: DEFAULT_LOG_GENERAL,
    engineConfidence: DEFAULT_ENGINE_CONFIDENCE,
  },
  special: {
    questionSuppressChips: QUESTION_SUPPRESS_CHIPS,
    ideaHeuristicTrigger: IDEA_HEURISTIC_TRIGGER,
  },
} as const;

/**
 * Type for top-level threshold categories
 */
export type ThresholdCategory = keyof typeof THRESHOLDS;

/**
 * Type for accessing nested threshold values
 */
export type ThresholdKey<T extends ThresholdCategory> = keyof (typeof THRESHOLDS)[T];

// ============ DECISION MODE ============

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
 * Uses AUTO_TODO for auto threshold and ASK_THRESHOLD for ask threshold.
 *
 * @param confidence - Optional confidence score (0-1 range)
 * @returns Decision mode: 'auto' (≥0.85), 'ask' (0.5-0.85), or 'keep' (<0.5)
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
  if (confidence >= AUTO_TODO) {
    return 'auto';
  }

  // Medium confidence → ask user
  if (confidence >= ASK_THRESHOLD) {
    return 'ask';
  }

  // Low confidence → keep as suggestions/Catch-All
  return 'keep';
}

/**
 * Determine decision mode for a specific entity type
 *
 * Uses type-specific thresholds for more accurate decisions.
 *
 * @param confidence - Confidence score (0-1 range)
 * @param entityType - Type of entity being classified
 * @returns Decision mode based on type-specific thresholds
 *
 * @example
 * decideModeForType(0.87, 'todo')  // returns 'auto' (>= 0.85)
 * decideModeForType(0.87, 'habit') // returns 'ask' (< 0.90)
 * decideModeForType(0.72, 'log')   // returns 'auto' (>= 0.70)
 */
export function decideModeForType(
  confidence: number | undefined,
  entityType: 'todo' | 'habit' | 'log' | 'list',
): DecisionMode {
  if (confidence === undefined || confidence === null || isNaN(confidence)) {
    return 'keep';
  }

  const autoThreshold = THRESHOLDS.auto[entityType];

  if (confidence >= autoThreshold) {
    return 'auto';
  }

  if (confidence >= ASK_THRESHOLD) {
    return 'ask';
  }

  return 'keep';
}

/**
 * Check if confidence is in the "chips band" (should show disambiguation)
 *
 * @param confidence - Confidence score (0-1 range)
 * @returns true if chips should be shown
 */
export function isInChipsBand(confidence: number | undefined): boolean {
  if (confidence === undefined || confidence === null || isNaN(confidence)) {
    return false;
  }

  return confidence >= CHIPS_FLOOR && confidence < CHIPS_CEILING;
}

/**
 * Check if AI classification should be trusted
 *
 * @param aiConfidence - AI confidence score (0-1 range)
 * @returns true if AI result should be used over heuristics
 */
export function shouldTrustAI(aiConfidence: number | undefined): boolean {
  if (aiConfidence === undefined || aiConfidence === null || isNaN(aiConfidence)) {
    return false;
  }

  return aiConfidence >= AI_TRUST;
}

/**
 * Check if AI classification should be ignored (too uncertain)
 *
 * @param aiConfidence - AI confidence score (0-1 range)
 * @returns true if AI result is too uncertain to use
 */
export function shouldIgnoreAI(aiConfidence: number | undefined): boolean {
  if (aiConfidence === undefined || aiConfidence === null || isNaN(aiConfidence)) {
    return true; // No confidence = ignore
  }

  return aiConfidence < AI_IGNORE;
}
