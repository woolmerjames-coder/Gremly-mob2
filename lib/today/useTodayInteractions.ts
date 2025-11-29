/**
 * useTodayInteractions - Shared interaction logic for Today and NOW screens
 * Handles item taps, completions, and undo with optimistic UI
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { eventBus } from '../events';
import { emitChatEvent } from '../../app/lib/chat/events';
import type { AppRecord } from '../types';

const UNDO_TIMEOUT_MS = 3000; // 3 seconds to undo

type UndoState = {
  id: string;
  type: 'habit' | 'todo';
  label: string;
  persisted: boolean;
};

interface UseTodayInteractionsOptions {
  onReload?: () => Promise<void>;
  celebrationEnabled?: boolean;
  onCelebration?: () => void;
}

export function useTodayInteractions(options: UseTodayInteractionsOptions = {}) {
  const repo = useRepo();
  const overlayController = useUnifiedOverlayController();

  const [completedHabitIds, setCompletedHabitIds] = useState<Set<string>>(new Set());
  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set());
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // Listen for ItemDeleted events and optimistically remove items from the list
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'ItemDeleted',
      (event: { id: string; type: 'habit' | 'todo' | 'note' }) => {
        console.log('[useTodayInteractions] ItemDeleted event:', event.id);
        setDeletedItemIds((prev) => new Set(prev).add(event.id));
      },
    );

    return unsubscribe;
  }, []);

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
   * Toggle todo completion with optimistic UI and undo
   */
  const toggleTodoComplete = useCallback(
    async (todo: { id: string; title?: string; name?: string; overdue?: boolean }) => {
      const label = todo.title || todo.name || 'To-do';
      const isOverdue = todo.overdue || false;

      console.log('[useTodayInteractions] toggleTodoComplete called:', { id: todo.id, label });

      // Optimistic UI
      setCompletedTodoIds((prev) => new Set(prev).add(todo.id));
      setUndoState({ id: todo.id, type: 'todo', label, persisted: false });

      if (options.celebrationEnabled && options.onCelebration) {
        options.onCelebration();
      }

      // Clear any existing timer
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }

      // Start undo timer - persist after 3s
      undoTimerRef.current = setTimeout(async () => {
        try {
          const nowIso = new Date().toISOString();
          console.log('[useTodayInteractions] Persisting todo completion:', {
            id: todo.id,
            nowIso,
          });

          await repo.completeTodo(todo.id, nowIso);

          console.log('[useTodayInteractions] Todo completion persisted successfully:', todo.id);

          // Phase 10.9: Emit celebration event for todo completion
          emitChatEvent({
            type: 'todo_completed',
            payload: { todoId: todo.id },
          });

          // Emit analytics
          eventBus.emit('TodayCompleteTodo', {
            todoId: todo.id,
            overdue: isOverdue,
          });

          setUndoState((prev) =>
            prev && prev.id === todo.id ? { ...prev, persisted: true } : prev,
          );

          // Reload data if callback provided
          if (options.onReload) {
            await options.onReload();
          }
        } catch (err) {
          console.error('[useTodayInteractions] Failed to complete todo:', err);
          // Revert optimistic UI on error
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(todo.id);
            return next;
            return next;
          });
          setUndoState((prev) => (prev && prev.id === todo.id ? null : prev));
        } finally {
          undoTimerRef.current = null;
        }
      }, UNDO_TIMEOUT_MS);
    },
    [repo, options],
  );

  /**
   * Toggle habit completion with optimistic UI and undo
   */
  const toggleHabitComplete = useCallback(
    async (habit: { id: string; name: string; streakCount?: number }) => {
      const label = habit.name;

      console.log('[useTodayInteractions] toggleHabitComplete called:', { id: habit.id, label });

      // Optimistic UI
      setCompletedHabitIds((prev) => new Set(prev).add(habit.id));
      setUndoState({ id: habit.id, type: 'habit', label, persisted: false });

      if (options.celebrationEnabled && options.onCelebration) {
        options.onCelebration();
      }

      // Clear any existing timer
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }

      // Start undo timer - persist after 3s
      undoTimerRef.current = setTimeout(async () => {
        try {
          const nowIso = new Date().toISOString();
          console.log('[useTodayInteractions] Persisting habit completion:', {
            id: habit.id,
            nowIso,
          });

          await repo.completeHabit(habit.id, nowIso);

          console.log('[useTodayInteractions] Habit completion persisted successfully:', habit.id);

          // Phase 10.9: Emit celebration event for habit check-in
          emitChatEvent({
            type: 'habit_checkin',
            payload: { habitId: habit.id },
          });

          // Emit analytics
          eventBus.emit('TodayCompleteHabit', {
            habitId: habit.id,
            streakAfter: (habit.streakCount || 0) + 1,
          });

          setUndoState((prev) =>
            prev && prev.id === habit.id ? { ...prev, persisted: true } : prev,
          );

          // Reload data if callback provided
          if (options.onReload) {
            await options.onReload();
          }
        } catch (err) {
          console.error('[useTodayInteractions] Failed to complete habit:', err);
          // Revert optimistic UI on error
          setCompletedHabitIds((prev) => {
            const next = new Set(prev);
            next.delete(habit.id);
            return next;
          });
          setUndoState((prev) => (prev && prev.id === habit.id ? null : prev));
        } finally {
          undoTimerRef.current = null;
        }
      }, UNDO_TIMEOUT_MS);
    },
    [repo, options],
  );

  /**
   * Undo the last completion
   */
  const undoLastCompletion = useCallback(async () => {
    if (!undoState) {
      return;
    }

    const { id, type, persisted } = undoState;

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    try {
      if (persisted) {
        await repo.undoCompletion(id);
        if (options.onReload) {
          await options.onReload();
        }
      }

      if (type === 'habit') {
        setCompletedHabitIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setCompletedTodoIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }

      setUndoState(null);

      eventBus.emit('TodayUndoCompletion', { entityType: type });
    } catch (err) {
      console.error('Failed to undo completion:', err);
      Alert.alert('Undo failed', 'Please try again in a moment.');
    }
  }, [repo, undoState, options]);

  /**
   * Undo a specific completion by id and type
   * Used for undoing from the completed items popup
   */
  const undoCompletionById = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      try {
        // If this is the current undo state item, clear the timer
        if (undoState && undoState.id === id) {
          if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
          }
          setUndoState(null);
        }

        // Always try to undo from the server (item may have been persisted)
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
    [repo, undoState, options],
  );

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
    undoState,
  };
}
