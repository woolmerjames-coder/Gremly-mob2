/**
 * Saveable Cooldown Manager for Space Chat
 *
 * Manages cooldown state for the "Save" button that appears when Gremly
 * detects something worth saving (a todo, habit, note, etc.).
 *
 * Philosophy:
 * - We don't want to annoy users by showing Save prompts too frequently
 * - After showing a Save button, wait a few turns before showing again
 * - If user dismisses without saving, back off even more (they weren't interested)
 * - If user taps Save, no extra cooldown needed (they engaged positively)
 *
 * @example
 * ```ts
 * let cooldown = createEmptyCooldownState();
 *
 * // Check before showing Save button
 * if (!isInCooldown(cooldown, currentTurn)) {
 *   showSaveButton();
 *   cooldown = recordSaveShown(cooldown, currentTurn);
 * }
 *
 * // User dismissed the Save button
 * cooldown = recordSaveDismissed(cooldown, currentTurn);
 *
 * // User tapped Save
 * cooldown = recordSaveTapped(cooldown, currentTurn);
 * ```
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Don't show Save button for N messages after it was shown */
export const COOLDOWN_AFTER_SHOWN = 2;

/** Don't show Save button for N messages after user dismissed without saving */
export const COOLDOWN_AFTER_DISMISSED = 3;

/** No extra cooldown after user tapped Save (positive engagement) */
export const COOLDOWN_AFTER_TAPPED = 0;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tracks cooldown state for the Save button.
 * All fields are optional - undefined means no event recorded yet.
 */
export interface CooldownState {
  /** Turn number when Save button was last shown */
  lastSaveShownAtTurn?: number;
  /** Turn number when user dismissed Save without tapping */
  lastSaveDismissedAtTurn?: number;
  /** Turn number when user tapped Save (for analytics, doesn't trigger cooldown) */
  lastSaveTappedAtTurn?: number;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates an empty cooldown state with no active cooldowns.
 *
 * @returns Fresh CooldownState with no recorded events
 */
export function createEmptyCooldownState(): CooldownState {
  return {};
}

// ============================================================================
// COOLDOWN CHECK FUNCTIONS
// ============================================================================

/**
 * Checks if we're currently in a cooldown period and shouldn't show Save.
 *
 * UPDATED: Cooldown only applies after dismissal, not after successful saves.
 * If user tapped Save (positive engagement), we allow detection on next turn.
 *
 * @param state - Current cooldown state
 * @param currentTurn - The current conversation turn number
 * @returns True if in cooldown (don't show Save), false if okay to show
 *
 * @example
 * ```ts
 * if (!isInCooldown(cooldown, turnCount)) {
 *   // Safe to show Save button
 * }
 * ```
 */
export function isInCooldown(state: CooldownState, currentTurn: number): boolean {
  // If user tapped Save on the most recent shown button, no cooldown
  // (positive engagement means they want to save things)
  if (
    state.lastSaveTappedAtTurn !== undefined &&
    state.lastSaveShownAtTurn !== undefined &&
    state.lastSaveTappedAtTurn >= state.lastSaveShownAtTurn
  ) {
    return false;
  }

  // Check cooldown from dismissal only (user didn't want to save)
  if (state.lastSaveDismissedAtTurn !== undefined) {
    const turnsSinceDismissed = currentTurn - state.lastSaveDismissedAtTurn;
    if (turnsSinceDismissed < COOLDOWN_AFTER_DISMISSED) {
      return true;
    }
  }

  // Note: We no longer cooldown just because Save was shown - only after dismissal

  return false;
}

/**
 * Gets a human-readable reason for the current cooldown (for debugging).
 *
 * @param state - Current cooldown state
 * @param currentTurn - The current conversation turn number
 * @returns Reason string if in cooldown, null if not in cooldown
 *
 * @example
 * ```ts
 * const reason = getCooldownReason(cooldown, turn);
 * if (reason) {
 *   console.log('[SaveButton] Suppressed:', reason);
 * }
 * ```
 */
export function getCooldownReason(state: CooldownState, currentTurn: number): string | null {
  // Check shown cooldown
  if (state.lastSaveShownAtTurn !== undefined) {
    const turnsSinceShown = currentTurn - state.lastSaveShownAtTurn;
    if (turnsSinceShown < COOLDOWN_AFTER_SHOWN) {
      return `Save shown ${turnsSinceShown} turn${turnsSinceShown === 1 ? '' : 's'} ago (need ${COOLDOWN_AFTER_SHOWN})`;
    }
  }

  // Check dismissed cooldown
  if (state.lastSaveDismissedAtTurn !== undefined) {
    const turnsSinceDismissed = currentTurn - state.lastSaveDismissedAtTurn;
    if (turnsSinceDismissed < COOLDOWN_AFTER_DISMISSED) {
      return `User dismissed ${turnsSinceDismissed} turn${turnsSinceDismissed === 1 ? '' : 's'} ago (need ${COOLDOWN_AFTER_DISMISSED})`;
    }
  }

  return null;
}

// ============================================================================
// STATE UPDATE FUNCTIONS (Pure - return new objects)
// ============================================================================

/**
 * Records that the Save button was shown to the user.
 * Starts a cooldown period before showing again.
 *
 * @param state - Current cooldown state
 * @param turn - The turn number when Save was shown
 * @returns New state with updated lastSaveShownAtTurn
 */
export function recordSaveShown(state: CooldownState, turn: number): CooldownState {
  return {
    ...state,
    lastSaveShownAtTurn: turn,
  };
}

/**
 * Records that the user dismissed the Save button without tapping.
 * Triggers a longer cooldown (user wasn't interested).
 *
 * @param state - Current cooldown state
 * @param turn - The turn number when user dismissed
 * @returns New state with updated lastSaveDismissedAtTurn
 */
export function recordSaveDismissed(state: CooldownState, turn: number): CooldownState {
  return {
    ...state,
    lastSaveDismissedAtTurn: turn,
  };
}

/**
 * Records that the user tapped the Save button (positive engagement).
 * Tracked for analytics but doesn't trigger additional cooldown.
 *
 * @param state - Current cooldown state
 * @param turn - The turn number when user tapped Save
 * @returns New state with updated lastSaveTappedAtTurn
 */
export function recordSaveTapped(state: CooldownState, turn: number): CooldownState {
  return {
    ...state,
    lastSaveTappedAtTurn: turn,
  };
}

/**
 * Resets all cooldown state (useful for testing or starting fresh).
 *
 * @returns Fresh empty cooldown state
 */
export function resetCooldownState(): CooldownState {
  return createEmptyCooldownState();
}
