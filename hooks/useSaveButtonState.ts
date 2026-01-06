/**
 * useSaveButtonState - Manages Save button visibility and state per message
 *
 * Only one Save button can be visible at a time. Tracks dismissed messages
 * to prevent re-showing buttons the user has already dismissed.
 *
 * The button has three statuses:
 * - 'ready': Initial state, shows "Save this" button
 * - 'saving': In progress, shows "Saving..." with spinner
 * - 'saved': Complete, shows "Saved as [Type] ✓" with Edit/X buttons
 *
 * @example
 * ```tsx
 * const {
 *   activeButton,
 *   showSaveButton,
 *   dismissSaveButton,
 *   setSaving,
 *   setSaved,
 *   getButtonStateForMessage,
 * } = useSaveButtonState();
 *
 * // Flow 1: Detection completes → show button (status: 'ready')
 * useEffect(() => {
 *   if (detectionResult && detectionResult.shouldSave) {
 *     showSaveButton(messageId, detectionResult);
 *   }
 * }, [detectionResult]);
 *
 * // Flow 2: User taps Save → saving → saved
 * const handleSave = async () => {
 *   setSaving();
 *   const result = await instantSave();
 *   setSaved(result.id, result.type); // Shows confirmation state
 * };
 *
 * // Flow 3: User taps X in confirmed state → dismiss
 * const handleDismiss = () => {
 *   dismissSaveButton(); // Won't show again for this message
 * };
 *
 * // Render based on status
 * const buttonState = getButtonStateForMessage(messageId);
 * if (buttonState?.isVisible) {
 *   return <SaveButton state={buttonState.status} {...buttonState} />;
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import type { SaveableResult } from '../lib/chat/saveableTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Save button status for the three-state flow */
export type SaveButtonStatus = 'ready' | 'saving' | 'saved';

/** Type of the saved item */
export type SavedItemType = 'habit' | 'todo' | 'log';

export interface SaveButtonState {
  /** The message this button is associated with */
  messageId: string;
  /** Whether the button is currently visible */
  isVisible: boolean;
  /** Current status: ready, saving, or saved */
  status: SaveButtonStatus;
  /** Whether a save operation is in progress (derived from status === 'saving') */
  isSaving: boolean;
  /** The saveable detection result */
  result: SaveableResult;
  /** ID of the saved item (only set when status === 'saved') */
  savedItemId?: string;
  /** Type of the saved item (only set when status === 'saved') */
  savedItemType?: SavedItemType;
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
  /** Set status to 'saving' (shows loading state) */
  setSaving: () => void;
  /** Set status to 'saved' with item details (shows confirmation state) */
  setSaved: (savedItemId: string, savedItemType: SavedItemType) => void;
  /** @deprecated Use setSaving() instead */
  startSaving: () => void;
  /** @deprecated Use setSaved() or dismissSaveButton() instead */
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
   * Initializes with status: 'ready'.
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
        status: 'ready',
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
   * @deprecated Use setSaving() instead
   */
  const startSaving = useCallback((): void => {
    setActiveButton((current) => {
      if (current) {
        return { ...current, status: 'saving', isSaving: true };
      }
      return current;
    });
  }, []);

  /**
   * Finish saving operation - hides the button.
   * Called after successful save.
   * @deprecated Use setSaved() or dismissSaveButton() instead
   */
  const finishSaving = useCallback((): void => {
    setActiveButton(null);
  }, []);

  /**
   * Set status to 'saving' - shows loading state with spinner.
   */
  const setSaving = useCallback((): void => {
    setActiveButton((current) => {
      if (current) {
        return { ...current, status: 'saving', isSaving: true };
      }
      return current;
    });
  }, []);

  /**
   * Set status to 'saved' - shows confirmation state with Edit/X buttons.
   * @param savedItemId - The ID of the newly saved item
   * @param savedItemType - The type of the saved item ('habit' | 'todo' | 'log')
   */
  const setSaved = useCallback((savedItemId: string, savedItemType: SavedItemType): void => {
    setActiveButton((current) => {
      if (current) {
        return {
          ...current,
          status: 'saved',
          isSaving: false,
          savedItemId,
          savedItemType,
        };
      }
      return current;
    });
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
    setSaving,
    setSaved,
    startSaving,
    finishSaving,
    isButtonVisibleForMessage,
    getButtonStateForMessage,
  };
}

export default useSaveButtonState;
