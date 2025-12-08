/**
 * useSaveButtonState - Manages Save button visibility and state per message
 *
 * Only one Save button can be visible at a time. Tracks dismissed messages
 * to prevent re-showing buttons the user has already dismissed.
 *
 * @example
 * ```tsx
 * const {
 *   activeButton,
 *   showSaveButton,
 *   dismissSaveButton,
 *   startSaving,
 *   finishSaving,
 *   getButtonStateForMessage,
 * } = useSaveButtonState();
 *
 * // Flow 1: Detection completes → show button
 * useEffect(() => {
 *   if (detectionResult && detectionResult.shouldSave) {
 *     showSaveButton(messageId, detectionResult);
 *   }
 * }, [detectionResult]);
 *
 * // Flow 2: User taps Save → saving → success
 * const handleSave = async () => {
 *   startSaving();
 *   await openSaveOverlay();
 *   finishSaving(); // Button disappears
 * };
 *
 * // Flow 3: User taps X → dismiss
 * const handleDismiss = () => {
 *   dismissSaveButton(); // Won't show again for this message
 * };
 *
 * // Render
 * const buttonState = getButtonStateForMessage(messageId);
 * if (buttonState?.isVisible) {
 *   return <SaveButton {...buttonState} />;
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import type { SaveableResult } from '../lib/chat/saveableTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveButtonState {
  /** The message this button is associated with */
  messageId: string;
  /** Whether the button is currently visible */
  isVisible: boolean;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** The saveable detection result */
  result: SaveableResult;
}

export interface UseSaveButtonStateReturn {
  /** Currently active save button state (only one at a time) */
  activeButton: SaveButtonState | null;
  /** Show save button for a message (replaces any existing) */
  showSaveButton: (messageId: string, result: SaveableResult) => void;
  /** Hide save button for a specific message */
  hideSaveButton: (messageId: string) => void;
  /** Dismiss the current save button (adds to dismissed set) */
  dismissSaveButton: () => void;
  /** Start saving operation (sets isSaving: true) */
  startSaving: () => void;
  /** Finish saving operation (hides button) */
  finishSaving: () => void;
  /** Check if button is visible for a specific message */
  isButtonVisibleForMessage: (messageId: string) => boolean;
  /** Get button state for a specific message */
  getButtonStateForMessage: (messageId: string) => SaveButtonState | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSaveButtonState(): UseSaveButtonStateReturn {
  // Only one save button visible at a time
  const [activeButton, setActiveButton] = useState<SaveButtonState | null>(null);

  // Track messages the user has dismissed in this session
  const [recentlyDismissed, setRecentlyDismissed] = useState<Set<string>>(() => new Set());

  /**
   * Show save button for a message.
   * Replaces any previously shown button (only one at a time).
   * Does nothing if user already dismissed this message's button.
   */
  const showSaveButton = useCallback(
    (messageId: string, result: SaveableResult): void => {
      // Don't show if user already dismissed this one
      if (recentlyDismissed.has(messageId)) {
        return;
      }

      setActiveButton({
        messageId,
        isVisible: true,
        isSaving: false,
        result,
      });
    },
    [recentlyDismissed],
  );

  /**
   * Hide save button for a specific message.
   * Also adds to dismissed set to prevent re-showing.
   */
  const hideSaveButton = useCallback((messageId: string): void => {
    setActiveButton((current) => {
      if (current?.messageId === messageId) {
        return null;
      }
      return current;
    });

    setRecentlyDismissed((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);

  /**
   * Dismiss the currently active save button.
   * Adds to dismissed set so it won't reappear.
   */
  const dismissSaveButton = useCallback((): void => {
    setActiveButton((current) => {
      if (current) {
        // Add to dismissed set
        setRecentlyDismissed((prev) => {
          const next = new Set(prev);
          next.add(current.messageId);
          return next;
        });
      }
      return null;
    });
  }, []);

  /**
   * Start saving operation - shows loading state on button.
   */
  const startSaving = useCallback((): void => {
    setActiveButton((current) => {
      if (current) {
        return { ...current, isSaving: true };
      }
      return current;
    });
  }, []);

  /**
   * Finish saving operation - hides the button.
   * Called after successful save.
   */
  const finishSaving = useCallback((): void => {
    setActiveButton(null);
  }, []);

  /**
   * Check if a save button is visible for a specific message.
   */
  const isButtonVisibleForMessage = useCallback(
    (messageId: string): boolean => {
      return (
        activeButton !== null && activeButton.messageId === messageId && activeButton.isVisible
      );
    },
    [activeButton],
  );

  /**
   * Get the button state for a specific message.
   * Returns null if no button is active for this message.
   */
  const getButtonStateForMessage = useCallback(
    (messageId: string): SaveButtonState | null => {
      if (activeButton?.messageId === messageId) {
        return activeButton;
      }
      return null;
    },
    [activeButton],
  );

  return {
    activeButton,
    showSaveButton,
    hideSaveButton,
    dismissSaveButton,
    startSaving,
    finishSaving,
    isButtonVisibleForMessage,
    getButtonStateForMessage,
  };
}

export default useSaveButtonState;
