/**
 * @deprecated This hook is no longer used.
 *
 * Saveable detection now uses a client-side heuristic in useSpaceChatEnhanced.ts
 * instead of making API calls after every message.
 *
 * The new flow:
 * 1. Assistant message > 120 chars AND not reflective mode → show Save button
 * 2. User taps "Save this" → call spaceChatSave API to classify and create item
 *
 * This file is kept for reference but should not be imported.
 *
 * ---
 *
 * (Original documentation below)
 *
 * React hook for managing saveable detection state.
 *
 * This hook wraps the saveable detection system in React state management,
 * handling pending detections, caching results, and coordinating with
 * conversation mode and cooldown state.
 *
 * @example
 * ```tsx
 * function ChatScreen() {
 *   const {
 *     runDetection,
 *     getResultForMessage,
 *     clearResult,
 *     isDetecting,
 *   } = useSaveableDetection();
 *
 *   const { currentTurn, isInCooldown, cooldownState } = useSaveableCooldown();
 *
 *   // When assistant sends a message
 *   const handleAssistantMessage = async (
 *     assistantMessage: string,
 *     userMessage: string,
 *     messageId: string
 *   ) => {
 *     const mode = detectConversationMode(userMessage);
 *
 *     const result = await runDetection(
 *       { assistantMessage, userMessage },
 *       messageId,
 *       mode,
 *       cooldownState,
 *       currentTurn
 *     );
 *
 *     if (result?.isSaveable) {
 *       // Show save button for this message
 *     }
 *   };
 *
 *   // When rendering a message
 *   const renderMessage = (messageId: string) => {
 *     const result = getResultForMessage(messageId);
 *     const showSave = result?.isSaveable && !isInCooldown;
 *
 *     return (
 *       <MessageBubble>
 *         {showSave && (
 *           <SaveButton
 *             onSave={() => handleSave(result)}
 *             onDismiss={() => clearResult(messageId)}
 *           />
 *         )}
 *       </MessageBubble>
 *     );
 *   };
 * }
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { SaveableResult, SaveableDetectionInput } from '../lib/chat/saveableTypes';
import { detectSaveable } from '../lib/chat/saveableDetector';
import { ConversationMode } from '../lib/chat/conversationMode';
import { CooldownState, isInCooldown } from '../lib/chat/saveableCooldown';

// ============================================================================
// Types
// ============================================================================

/**
 * Return type for the useSaveableDetection hook.
 */
export interface UseSaveableDetectionReturn {
  /**
   * Map of messageId -> SaveableResult for cached results.
   * Converted to object for easier debugging and React DevTools inspection.
   */
  saveableResults: Record<string, SaveableResult>;

  /**
   * Array of messageIds currently being analyzed.
   */
  pendingDetection: string[];

  /**
   * Error message if detection failed, null otherwise.
   */
  error: string | null;

  /**
   * Run saveable detection for an assistant message.
   * Respects conversation mode and cooldown state.
   */
  runDetection: (
    input: SaveableDetectionInput,
    messageId: string,
    mode: ConversationMode,
    cooldownState: CooldownState,
    currentTurn: number,
  ) => Promise<SaveableResult | null>;

  /**
   * Get the cached result for a specific message.
   */
  getResultForMessage: (messageId: string) => SaveableResult | null;

  /**
   * Clear the result for a specific message (e.g., when dismissed or saved).
   */
  clearResult: (messageId: string) => void;

  /**
   * Clear all cached results (e.g., when starting a new conversation).
   */
  clearAllResults: () => void;

  /**
   * True if any detection is currently in progress.
   */
  isDetecting: boolean;
}

// ============================================================================
// Logging
// ============================================================================

const log = (...args: any[]) => {
  if (__DEV__) {
    console.log('[useSaveableDetection]', ...args);
  }
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing saveable detection state.
 *
 * Handles caching of detection results, pending state tracking,
 * and integration with conversation mode and cooldown systems.
 *
 * @returns Object with detection state and control functions
 */
export function useSaveableDetection(): UseSaveableDetectionReturn {
  // State
  const [saveableResults, setSaveableResults] = useState<Record<string, SaveableResult>>({});
  const [pendingDetection, setPendingDetection] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs for tracking pending without causing re-renders
  const pendingSetRef = useRef<Set<string>>(new Set());

  /**
   * Run saveable detection for an assistant message.
   */
  const runDetection = useCallback(
    async (
      input: SaveableDetectionInput,
      messageId: string,
      mode: ConversationMode,
      cooldownState: CooldownState,
      currentTurn: number,
    ): Promise<SaveableResult | null> => {
      log('RUN_DETECTION_CALLED', { mode, currentTurn, cooldownState, messageId });

      // Skip if in reflective mode (user is venting)
      if (mode === 'reflective') {
        log('SKIP', 'Reflective mode - not detecting');
        return null;
      }

      // DISABLED: Cooldown logic removed - AI detection is the quality filter
      // If something is detected as saveable, we should always show the save button
      // if (isInCooldown(cooldownState, currentTurn)) {
      //   log('SKIP', 'In cooldown - not detecting');
      //   return null;
      // }

      // Skip if already detecting this message
      if (pendingSetRef.current.has(messageId)) {
        log('SKIP', 'Already detecting:', messageId);
        return null;
      }

      // Mark as pending
      pendingSetRef.current.add(messageId);
      setPendingDetection(Array.from(pendingSetRef.current));
      setError(null);

      log('START', messageId);

      try {
        const result = await detectSaveable(input);

        // Store result
        setSaveableResults((prev) => ({
          ...prev,
          [messageId]: result,
        }));

        log('COMPLETE', messageId, {
          isSaveable: result.isSaveable,
          type: result.suggestedType,
          confidence: result.confidence,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Detection failed';
        log('ERROR', messageId, errorMessage);
        setError(errorMessage);
        return null;
      } finally {
        // Remove from pending
        pendingSetRef.current.delete(messageId);
        setPendingDetection(Array.from(pendingSetRef.current));
      }
    },
    [],
  );

  /**
   * Get the cached result for a specific message.
   */
  const getResultForMessage = useCallback(
    (messageId: string): SaveableResult | null => {
      return saveableResults[messageId] ?? null;
    },
    [saveableResults],
  );

  /**
   * Clear the result for a specific message.
   */
  const clearResult = useCallback((messageId: string): void => {
    log('CLEAR', messageId);
    setSaveableResults((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  /**
   * Clear all cached results.
   */
  const clearAllResults = useCallback((): void => {
    log('CLEAR_ALL');
    setSaveableResults({});
    setError(null);
  }, []);

  // Computed
  const isDetecting = pendingDetection.length > 0;

  return {
    saveableResults,
    pendingDetection,
    error,
    runDetection,
    getResultForMessage,
    clearResult,
    clearAllResults,
    isDetecting,
  };
}

export default useSaveableDetection;
