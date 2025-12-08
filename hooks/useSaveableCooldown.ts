/**
 * useSaveableCooldown Hook
 *
 * Manages cooldown state for the Save button as React state.
 * Prevents showing Save prompts too frequently to avoid annoying users.
 *
 * @example
 * ```tsx
 * function ChatThread() {
 *   const {
 *     currentTurn,
 *     isInCooldown,
 *     cooldownReason,
 *     incrementTurn,
 *     markSaveShown,
 *     markSaveDismissed,
 *     markSaveTapped,
 *   } = useSaveableCooldown();
 *
 *   const handleAssistantResponse = async (response) => {
 *     // 1. Add assistant message to chat
 *     addMessage({ role: 'assistant', content: response });
 *
 *     // 2. Increment turn counter
 *     incrementTurn();
 *
 *     // 3. Check if we can show Save button
 *     if (hasSaveableContent(response) && !isInCooldown) {
 *       showSaveButton();
 *       markSaveShown();
 *     } else if (cooldownReason) {
 *       console.log('[Save] Suppressed:', cooldownReason);
 *     }
 *   };
 *
 *   const handleSaveDismissed = () => {
 *     hideSaveButton();
 *     markSaveDismissed(); // Triggers longer cooldown
 *   };
 *
 *   const handleSaveTapped = () => {
 *     saveContent();
 *     markSaveTapped(); // No extra cooldown (positive engagement)
 *   };
 * }
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import {
  CooldownState,
  createEmptyCooldownState,
  isInCooldown as checkIsInCooldown,
  getCooldownReason,
  recordSaveShown,
  recordSaveDismissed,
  recordSaveTapped,
} from '../lib/chat/saveableCooldown';

/**
 * Debug info returned by the hook for logging/troubleshooting.
 */
export interface CooldownDebugInfo {
  /** Whether Save button is currently suppressed */
  inCooldown: boolean;
  /** Human-readable reason if in cooldown, null otherwise */
  reason: string | null;
  /** Current conversation turn number */
  turn: number;
}

/**
 * Hook return type for useSaveableCooldown.
 */
export interface UseSaveableCooldownReturn {
  /** Current conversation turn number (increments after each assistant response) */
  currentTurn: number;
  /** Whether Save button should be suppressed (computed from cooldown state) */
  isInCooldown: boolean;
  /** Human-readable reason if in cooldown, null if okay to show Save */
  cooldownReason: string | null;
  /** Raw cooldown state for passing to other hooks */
  cooldownState: CooldownState;
  /** Increment turn counter - call after each assistant message */
  incrementTurn: () => void;
  /** Record that Save button was shown - starts cooldown */
  markSaveShown: () => void;
  /** Record that user dismissed Save without tapping - longer cooldown */
  markSaveDismissed: () => void;
  /** Record that user tapped Save - no extra cooldown (positive engagement) */
  markSaveTapped: () => void;
  /** Get debug info for logging */
  getCooldownDebugInfo: () => CooldownDebugInfo;
}

/**
 * Hook for managing Save button cooldown state.
 *
 * Flow:
 * 1. User sends message
 * 2. Assistant responds
 * 3. Call incrementTurn()
 * 4. Check isInCooldown before showing Save
 * 5. If Save shown, call markSaveShown()
 * 6. If user dismisses, call markSaveDismissed()
 * 7. If user taps, call markSaveTapped()
 *
 * @returns Cooldown state and control functions
 */
export function useSaveableCooldown(): UseSaveableCooldownReturn {
  // Cooldown tracking state
  const [cooldownState, setCooldownState] = useState<CooldownState>(createEmptyCooldownState);

  // Turn counter - increments after each assistant response
  const [currentTurn, setCurrentTurn] = useState(0);

  /**
   * Increment turn counter.
   * Call this after each assistant message is added to the chat.
   */
  const incrementTurn = useCallback(() => {
    setCurrentTurn((prev) => prev + 1);
  }, []);

  /**
   * Record that Save button was shown.
   * Starts a cooldown period before showing again.
   */
  const markSaveShown = useCallback(() => {
    setCooldownState((prev) => recordSaveShown(prev, currentTurn));
  }, [currentTurn]);

  /**
   * Record that user dismissed Save without tapping.
   * Triggers a longer cooldown (user wasn't interested).
   */
  const markSaveDismissed = useCallback(() => {
    setCooldownState((prev) => recordSaveDismissed(prev, currentTurn));
  }, [currentTurn]);

  /**
   * Record that user tapped Save (positive engagement).
   * Tracked for analytics but doesn't trigger extra cooldown.
   */
  const markSaveTapped = useCallback(() => {
    setCooldownState((prev) => recordSaveTapped(prev, currentTurn));
  }, [currentTurn]);

  // Computed: whether we're currently in cooldown
  const isInCooldown = useMemo(
    () => checkIsInCooldown(cooldownState, currentTurn),
    [cooldownState, currentTurn],
  );

  // Computed: reason for cooldown (null if not in cooldown)
  const cooldownReason = useMemo(
    () => getCooldownReason(cooldownState, currentTurn),
    [cooldownState, currentTurn],
  );

  /**
   * Get debug info for logging/troubleshooting.
   */
  const getCooldownDebugInfo = useCallback((): CooldownDebugInfo => {
    return {
      inCooldown: checkIsInCooldown(cooldownState, currentTurn),
      reason: getCooldownReason(cooldownState, currentTurn),
      turn: currentTurn,
    };
  }, [cooldownState, currentTurn]);

  return {
    currentTurn,
    isInCooldown,
    cooldownReason,
    cooldownState,
    incrementTurn,
    markSaveShown,
    markSaveDismissed,
    markSaveTapped,
    getCooldownDebugInfo,
  };
}

export default useSaveableCooldown;
