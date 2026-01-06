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
  /** Currently active save button state (the most recently activated) */
  activeButton: SaveButtonState | null;
  /** All message save states (for persisting across scrolls) */
  messageSaveStates: Record<string, SaveButtonState>;
  /** Show save button for a message (replaces any existing as active) */
  showSaveButton: (messageId: string, result: SaveableResult) => void;
  /** Hide save button for a specific message */
  hideSaveButton: (messageId: string) => void;
  /** Dismiss the current save button (adds to dismissed set) */
  dismissSaveButton: () => void;
  /** Set status to 'saving' for current active message */
  setSaving: () => void;
  /** Set status to 'saving' for a specific message */
  setMessageSaving: (messageId: string) => void;
  /** Set status to 'saved' with item details (shows confirmation state) */
  setSaved: (savedItemId: string, savedItemType: SavedItemType) => void;
  /** Set status to 'saved' for a specific message */
  setMessageSaved: (messageId: string, savedItemType: SavedItemType, savedItemId: string) => void;
  /** @deprecated Use setSaving() instead */
  startSaving: () => void;
  /** @deprecated Use setSaved() or dismissSaveButton() instead */
  finishSaving: () => void;
  /** Check if button is visible for a specific message */
  isButtonVisibleForMessage: (messageId: string) => boolean;
  /** Get button state for a specific message (checks both active and persisted states) */
  getButtonStateForMessage: (messageId: string) => SaveButtonState | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSaveButtonState(): UseSaveButtonStateReturn {
  // Currently active save button (the most recently shown/interacted with)
  const [activeButton, setActiveButton] = useState<SaveButtonState | null>(null);

  // Track all message save states (persists across scrolls)
  const [messageSaveStates, setMessageSaveStates] = useState<Record<string, SaveButtonState>>({});

  // Track messages the user has dismissed in this session
  const [recentlyDismissed, setRecentlyDismissed] = useState<Set<string>>(() => new Set());

  /**
   * Show save button for a message.
   * Replaces any previously shown button as active.
   * Does nothing if user already dismissed this message's button.
   * Initializes with status: 'ready'.
   */
  const showSaveButton = useCallback(
    (messageId: string, result: SaveableResult): void => {
      console.log('[useSaveButtonState] showSaveButton called:', {
        messageId,
        isDismissed: recentlyDismissed.has(messageId),
        result: { isSaveable: result.isSaveable, suggestedType: result.suggestedType },
      });

      // Don't show if user already dismissed this one
      if (recentlyDismissed.has(messageId)) {
        console.log('[useSaveButtonState] Skipping - message was dismissed:', messageId);
        return;
      }

      const newState: SaveButtonState = {
        messageId,
        isVisible: true,
        status: 'ready',
        isSaving: false,
        result,
      };

      console.log('[useSaveButtonState] Setting active button and persisting state:', messageId);
      setActiveButton(newState);
      // Also persist to message states map
      setMessageSaveStates((prev) => ({
        ...prev,
        [messageId]: newState,
      }));
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

    // Remove from persisted states
    setMessageSaveStates((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
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
        // Remove from persisted states
        setMessageSaveStates((prev) => {
          const next = { ...prev };
          delete next[current.messageId];
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
        const newState = { ...current, status: 'saving' as const, isSaving: true };
        // Also update persisted state
        setMessageSaveStates((prev) => ({
          ...prev,
          [current.messageId]: newState,
        }));
        return newState;
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
   * Set status to 'saving' for the current active message.
   */
  const setSaving = useCallback((): void => {
    setActiveButton((current) => {
      if (current) {
        const newState = { ...current, status: 'saving' as const, isSaving: true };
        // Also update persisted state
        setMessageSaveStates((prev) => ({
          ...prev,
          [current.messageId]: newState,
        }));
        return newState;
      }
      return current;
    });
  }, []);

  /**
   * Set status to 'saving' for a specific message.
   */
  const setMessageSaving = useCallback((messageId: string): void => {
    setMessageSaveStates((prev) => {
      const existing = prev[messageId];
      if (existing) {
        return {
          ...prev,
          [messageId]: { ...existing, status: 'saving' as const, isSaving: true },
        };
      }
      return prev;
    });
    // Also update active button if it matches
    setActiveButton((current) => {
      if (current?.messageId === messageId) {
        return { ...current, status: 'saving' as const, isSaving: true };
      }
      return current;
    });
  }, []);

  /**
   * Set status to 'saved' for the current active message.
   * @param savedItemId - The ID of the newly saved item
   * @param savedItemType - The type of the saved item ('habit' | 'todo' | 'log')
   */
  const setSaved = useCallback((savedItemId: string, savedItemType: SavedItemType): void => {
    setActiveButton((current) => {
      if (current) {
        const newState = {
          ...current,
          status: 'saved' as const,
          isSaving: false,
          savedItemId,
          savedItemType,
        };
        // Also update persisted state
        setMessageSaveStates((prev) => ({
          ...prev,
          [current.messageId]: newState,
        }));
        return newState;
      }
      return current;
    });
  }, []);

  /**
   * Set status to 'saved' for a specific message.
   * @param messageId - The message ID to update
   * @param savedItemType - The type of the saved item ('habit' | 'todo' | 'log')
   * @param savedItemId - The ID of the newly saved item
   */
  const setMessageSaved = useCallback(
    (messageId: string, savedItemType: SavedItemType, savedItemId: string): void => {
      setMessageSaveStates((prev) => {
        const existing = prev[messageId];
        if (existing) {
          return {
            ...prev,
            [messageId]: {
              ...existing,
              status: 'saved' as const,
              isSaving: false,
              savedItemId,
              savedItemType,
            },
          };
        }
        return prev;
      });
      // Also update active button if it matches
      setActiveButton((current) => {
        if (current?.messageId === messageId) {
          return {
            ...current,
            status: 'saved' as const,
            isSaving: false,
            savedItemId,
            savedItemType,
          };
        }
        return current;
      });
    },
    [],
  );

  /**
   * Check if a save button is visible for a specific message.
   * Checks both active button and persisted states.
   */
  const isButtonVisibleForMessage = useCallback(
    (messageId: string): boolean => {
      // Check persisted states first (handles saved items)
      const persistedState = messageSaveStates[messageId];
      if (persistedState?.isVisible) {
        return true;
      }
      // Fall back to active button check
      return (
        activeButton !== null && activeButton.messageId === messageId && activeButton.isVisible
      );
    },
    [activeButton, messageSaveStates],
  );

  /**
   * Get the button state for a specific message.
   * Returns persisted state if available, otherwise checks active button.
   */
  const getButtonStateForMessage = useCallback(
    (messageId: string): SaveButtonState | null => {
      // Check persisted states first (handles saved items that may have scrolled away)
      const persistedState = messageSaveStates[messageId];
      if (persistedState) {
        return persistedState;
      }
      // Fall back to active button
      if (activeButton?.messageId === messageId) {
        return activeButton;
      }
      return null;
    },
    [activeButton, messageSaveStates],
  );

  return {
    activeButton,
    messageSaveStates,
    showSaveButton,
    hideSaveButton,
    dismissSaveButton,
    setSaving,
    setMessageSaving,
    setSaved,
    setMessageSaved,
    startSaving,
    finishSaving,
    isButtonVisibleForMessage,
    getButtonStateForMessage,
  };
}

export default useSaveButtonState;
