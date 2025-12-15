/**
 * useTodayInteractions - Shared interaction logic for Today and NOW screens
 * Handles item taps, completions, and undo with optimistic UI
 *
 * Completion Flow (2-second undo window):
 * 1. User taps checkbox → UI shows completed state immediately (optimistic)
 * 2. For 2 seconds, user can undo (callback provided to caller)
 * 3. If undo tapped → revert UI, do NOT persist to Supabase
 * 4. If no undo → persist to Supabase, emit ItemCompleted event
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { eventBus } from '../events';
import { emitChatEvent } from '../../app/lib/chat/events';
import type { AppRecord } from '../types';

/** Undo window duration in milliseconds */
const UNDO_WINDOW_MS = 2000;

/**
 * Represents a pending completion that hasn't been persisted yet.
 * During the undo window, the item shows as complete in the UI,
 * but no server call has been made.
 */
type PendingCompletion = {
  id: string;
  type: 'habit' | 'todo';
  label: string;
  timeoutId: NodeJS.Timeout;
  /** Extra metadata for the item */
  meta?: {
    overdue?: boolean;
    streakCount?: number;
  };
};

/**
 * Public info about the most recent pending completion.
 * Used by consumers to show undo UI.
 */
export type PendingCompletionInfo = {
  id: string;
  type: 'habit' | 'todo';
  label: string;
  /** Whether this completion has been persisted to the server */
  persisted: boolean;
};

interface UseTodayInteractionsOptions {
  onReload?: () => Promise<void>;
  celebrationEnabled?: boolean;
  onCelebration?: () => void;
  /** Callback when an item is permanently completed (after undo window expires) */
  onItemPermanentlyCompleted?: (id: string, type: 'habit' | 'todo') => void;
  /** Whether to show celebration toasts on completion (default: true) */
  showCelebrationToast?: boolean;
}

export function useTodayInteractions(options: UseTodayInteractionsOptions = {}) {
  const repo = useRepo();
  const overlayController = useUnifiedOverlayController();

  // Optimistic completion state (items that appear completed in UI)
  const [completedHabitIds, setCompletedHabitIds] = useState<Set<string>>(new Set());
  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set());
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());

  // Pending completions (not yet persisted, within undo window)
  // Using ref + state trigger to avoid stale closure issues with timeouts
  const pendingCompletionsRef = useRef<Map<string, PendingCompletion>>(new Map());
  const [pendingUpdateTrigger, setPendingUpdateTrigger] = useState(0);

  // Track the most recent pending completion for undo UI
  const [lastPendingInfo, setLastPendingInfo] = useState<PendingCompletionInfo | null>(null);

  // On unmount: just clear the undo timeouts (completions are already persisted)
  useEffect(() => {
    return () => {
      pendingCompletionsRef.current.forEach((pending) => {
        clearTimeout(pending.timeoutId);
      });
      pendingCompletionsRef.current.clear();
    };
  }, []);

  // Listen for entity:deleted events and optimistically remove items from the list
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'entity:deleted',
      (event: { id: string; type?: string; spaceId?: string | null }) => {
        console.log('[useTodayInteractions] entity:deleted event:', event.id);
        setDeletedItemIds((prev) => new Set(prev).add(event.id));
      },
    );

    return unsubscribe;
  }, []);

  /**
   * Check if an item is already completed or pending completion.
   * Used to prevent double-taps.
   */
  const isItemCompletedOrPending = useCallback(
    (id: string, type: 'habit' | 'todo'): boolean => {
      // Check if already in optimistic completed state
      if (type === 'habit' && completedHabitIds.has(id)) return true;
      if (type === 'todo' && completedTodoIds.has(id)) return true;
      // Check if pending completion
      if (pendingCompletionsRef.current.has(id)) return true;
      return false;
    },
    [completedHabitIds, completedTodoIds],
  );

  /**
   * Mark an item as optimistically deleted (removed from UI immediately)
   * Called when user confirms delete in the overlay
   */
  const markItemDeleted = useCallback((id: string) => {
    setDeletedItemIds((prev) => new Set(prev).add(id));
    console.log('[useTodayInteractions] Marked item as deleted:', id);
  }, []);

  /**
   * Clear the deleted items set (called after reload completes)
   */
  const clearDeletedItems = useCallback(() => {
    setDeletedItemIds(new Set());
  }, []);

  /**
   * Open overlay to view/edit an entity
   * Fetches full record from DB to ensure all fields (like due_day) are available
   */
  const openEntityOverlay = useCallback(
    async (item: { id: string; type: string } & Partial<AppRecord>) => {
      try {
        // Fetch the full record to ensure all fields (due_day, etc.) are available
        const fullRecord = await repo.getById(item.id);

        if (fullRecord && fullRecord.type === item.type) {
          overlayController.openEdit({ record: fullRecord as AppRecord });
        } else {
          console.warn(
            '[useTodayInteractions] openEntityOverlay: record not found or type mismatch',
            { id: item.id, type: item.type },
          );
          // Fallback to passed item if fetch fails
          const record = {
            ...item,
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
          } as AppRecord;
          overlayController.openEdit({ record });
        }
      } catch (error) {
        console.error('[useTodayInteractions] openEntityOverlay: failed to fetch record', error);
        // Fallback to passed item if fetch fails
        const record = {
          ...item,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        } as AppRecord;
        overlayController.openEdit({ record });
      }
    },
    [overlayController, repo],
  );

  /**
   * Shared helper to handle completion with undo window.
   * Works for both habits and todos.
   *
   * NEW FLOW (persist-first):
   * 1. Immediately persist to Supabase (don't wait for undo window)
   * 2. Show optimistic UI
   * 3. If user undoes within window, call undoCompletion to revert
   *
   * This ensures completions are never lost due to app reload/crash.
   */
  const completeItemWithUndo = useCallback(
    async (
      id: string,
      type: 'habit' | 'todo',
      label: string,
      meta?: { overdue?: boolean; streakCount?: number },
    ): Promise<() => void> => {
      // Ignore if already completed or pending
      if (isItemCompletedOrPending(id, type)) {
        console.log('[useTodayInteractions] Ignoring tap - already completed or pending:', id);
        return () => {};
      }

      console.log('[useTodayInteractions] Starting completion (persist-first):', {
        id,
        type,
        label,
      });

      // 1. Optimistic UI update
      if (type === 'habit') {
        setCompletedHabitIds((prev) => new Set(prev).add(id));
      } else {
        setCompletedTodoIds((prev) => new Set(prev).add(id));
      }

      // 2. Celebration callback
      if (options.celebrationEnabled && options.onCelebration) {
        options.onCelebration();
      }

      // 3. PERSIST IMMEDIATELY (don't wait for undo window)
      const nowIso = new Date().toISOString();
      try {
        console.log('[useTodayInteractions] Persisting completion immediately:', {
          id,
          type,
          nowIso,
        });

        if (type === 'habit') {
          await repo.completeHabit(id, nowIso);
          emitChatEvent({
            type: 'habit_checkin',
            payload: {
              habitId: id,
              skipCelebration: options.showCelebrationToast === false,
            },
          });
          eventBus.emit('TodayCompleteHabit', {
            habitId: id,
            streakAfter: (meta?.streakCount || 0) + 1,
          });
        } else {
          await repo.completeTodo(id, nowIso);
          emitChatEvent({
            type: 'todo_completed',
            payload: {
              todoId: id,
              skipCelebration: options.showCelebrationToast === false,
            },
          });
          eventBus.emit('TodayCompleteTodo', { todoId: id, overdue: meta?.overdue || false });
        }

        console.log('[useTodayInteractions] Completion persisted successfully:', id);
        eventBus.emit('ItemCompleted', { id, type });
      } catch (err) {
        console.error('[useTodayInteractions] Failed to persist completion:', err);
        // Revert optimistic UI on error
        if (type === 'habit') {
          setCompletedHabitIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        return () => {};
      }

      // 4. Set up undo window - if user undoes, we call undoCompletion to revert
      const timeoutId = setTimeout(() => {
        // Undo window expired - remove from pending map
        pendingCompletionsRef.current.delete(id);
        setPendingUpdateTrigger((t) => t + 1);

        console.log('[useTodayInteractions] Undo window expired, completion is final:', id);

        // Update last pending info to mark as persisted (undo no longer possible)
        setLastPendingInfo((prev) =>
          prev && prev.id === id ? { ...prev, persisted: true } : prev,
        );

        // Notify caller that item is permanently completed
        options.onItemPermanentlyCompleted?.(id, type);

        // Reload data if callback provided
        if (options.onReload) {
          void options.onReload();
        }
      }, UNDO_WINDOW_MS);

      // Store pending completion
      const pending: PendingCompletion = { id, type, label, timeoutId, meta };
      pendingCompletionsRef.current.set(id, pending);
      setPendingUpdateTrigger((t) => t + 1);

      // Update last pending info for UI
      setLastPendingInfo({ id, type, label, persisted: false });

      // 5. Return undo function - since we persisted immediately, undo must revert in DB
      return () => {
        const pendingItem = pendingCompletionsRef.current.get(id);
        if (!pendingItem) {
          console.log('[useTodayInteractions] Undo called but item not pending:', id);
          return;
        }

        console.log('[useTodayInteractions] Undoing completion (reverting in DB):', { id, type });

        // Clear the timeout (no need to mark as final)
        clearTimeout(pendingItem.timeoutId);

        // Remove from pending map
        pendingCompletionsRef.current.delete(id);
        setPendingUpdateTrigger((t) => t + 1);

        // Revert in database (since we already persisted)
        void repo
          .undoCompletion(id)
          .then(() => {
            console.log('[useTodayInteractions] Undo persisted to DB:', id);
          })
          .catch((err) => {
            console.error('[useTodayInteractions] Failed to undo in DB:', err);
          });

        // Revert optimistic UI
        if (type === 'habit') {
          setCompletedHabitIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }

        // Clear last pending info if it was this item
        setLastPendingInfo((prev) => (prev && prev.id === id ? null : prev));

        eventBus.emit('TodayUndoCompletion', { entityType: type });
      };
    },
    [repo, options, isItemCompletedOrPending],
  );

  /**
   * Toggle todo completion with optimistic UI and undo window.
   * Returns an undo function that can be called within 2 seconds to revert.
   */
  const toggleTodoComplete = useCallback(
    async (todo: {
      id: string;
      title?: string;
      name?: string;
      overdue?: boolean;
    }): Promise<() => void> => {
      const label = todo.title || todo.name || 'To-do';
      return completeItemWithUndo(todo.id, 'todo', label, { overdue: todo.overdue });
    },
    [completeItemWithUndo],
  );

  /**
   * Toggle habit completion with optimistic UI and undo window.
   * Returns an undo function that can be called within 2 seconds to revert.
   */
  const toggleHabitComplete = useCallback(
    async (habit: { id: string; name: string; streakCount?: number }): Promise<() => void> => {
      return completeItemWithUndo(habit.id, 'habit', habit.name, {
        streakCount: habit.streakCount,
      });
    },
    [completeItemWithUndo],
  );

  /**
   * Undo the last pending completion (if still within undo window).
   * For backward compatibility with existing UI patterns.
   */
  const undoLastCompletion = useCallback(async () => {
    if (!lastPendingInfo) {
      return;
    }

    const { id, type, persisted } = lastPendingInfo;

    // Check if still pending (not yet persisted)
    const pendingItem = pendingCompletionsRef.current.get(id);
    if (pendingItem) {
      // Clear timeout and revert UI
      clearTimeout(pendingItem.timeoutId);
      pendingCompletionsRef.current.delete(id);
      setPendingUpdateTrigger((t) => t + 1);

      if (type === 'habit') {
        setCompletedHabitIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setCompletedTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }

      setLastPendingInfo(null);
      eventBus.emit('TodayUndoCompletion', { entityType: type });
      return;
    }

    // If already persisted, need to undo from server
    if (persisted) {
      try {
        await repo.undoCompletion(id);

        if (type === 'habit') {
          setCompletedHabitIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }

        setLastPendingInfo(null);
        eventBus.emit('TodayUndoCompletion', { entityType: type });

        if (options.onReload) {
          await options.onReload();
        }
      } catch (err) {
        console.error('Failed to undo completion:', err);
        Alert.alert('Undo failed', 'Please try again in a moment.');
      }
    }
  }, [repo, lastPendingInfo, options]);

  /**
   * Undo a specific completion by id and type.
   * Used for undoing from the completed items popup.
   */
  const undoCompletionById = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      try {
        // Check if still pending
        const pendingItem = pendingCompletionsRef.current.get(id);
        if (pendingItem) {
          clearTimeout(pendingItem.timeoutId);
          pendingCompletionsRef.current.delete(id);
          setPendingUpdateTrigger((t) => t + 1);
        }

        // Always try to undo from server (item may have been persisted)
        await repo.undoCompletion(id);

        // Update local state
        if (type === 'habit') {
          setCompletedHabitIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }

        // Clear last pending if it was this item
        setLastPendingInfo((prev) => (prev && prev.id === id ? null : prev));

        // Reload data
        if (options.onReload) {
          await options.onReload();
        }

        eventBus.emit('TodayUndoCompletion', { entityType: type });
      } catch (err) {
        console.error('Failed to undo completion:', err);
        Alert.alert('Undo failed', 'Please try again in a moment.');
      }
    },
    [repo, options],
  );

  /**
   * Check if an item is currently pending completion (within undo window).
   */
  const isItemPending = useCallback(
    (id: string): boolean => {
      // Force re-evaluation when pending map changes
      void pendingUpdateTrigger;
      return pendingCompletionsRef.current.has(id);
    },
    [pendingUpdateTrigger],
  );

  /**
   * Get the undo function for a specific pending item.
   * Returns null if item is not pending.
   */
  const getUndoForItem = useCallback((id: string): (() => void) | null => {
    const pendingItem = pendingCompletionsRef.current.get(id);
    if (!pendingItem) return null;

    return () => {
      clearTimeout(pendingItem.timeoutId);
      pendingCompletionsRef.current.delete(id);
      setPendingUpdateTrigger((t) => t + 1);

      if (pendingItem.type === 'habit') {
        setCompletedHabitIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setCompletedTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }

      setLastPendingInfo((prev) => (prev && prev.id === id ? null : prev));
      eventBus.emit('TodayUndoCompletion', { entityType: pendingItem.type });
    };
  }, []);

  return {
    // Actions
    openEntityOverlay,
    toggleTodoComplete,
    toggleHabitComplete,
    undoLastCompletion,
    undoCompletionById,
    markItemDeleted,
    clearDeletedItems,

    // State
    completedHabitIds,
    completedTodoIds,
    deletedItemIds,

    // Pending completion state (for undo UI)
    lastPendingInfo,
    isItemPending,
    getUndoForItem,
  };
}
