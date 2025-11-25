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

  /**
   * Open overlay to view/edit an entity
   */
  const openEntityOverlay = useCallback(
    (item: { id: string; type: string } & Partial<AppRecord>) => {
      // Convert item to AppRecord format - spread item first, then override only what's needed
      const record = {
        ...item,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString(),
      } as AppRecord;

      overlayController.openEdit({ record });
    },
    [overlayController],
  );

  /**
   * Toggle todo completion with optimistic UI and undo
   */
  const toggleTodoComplete = useCallback(
    async (todo: { id: string; title?: string; name?: string; overdue?: boolean }) => {
      const label = todo.title || todo.name || 'To-do';
      const isOverdue = todo.overdue || false;

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
          await repo.completeTodo(todo.id, new Date().toISOString());

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
          console.error('Failed to complete todo:', err);
          // Revert optimistic UI on error
          setCompletedTodoIds((prev) => {
            const next = new Set(prev);
            next.delete(todo.id);
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
          await repo.completeHabit(habit.id, new Date().toISOString());

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
          console.error('Failed to complete habit:', err);
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

  return {
    // Actions
    openEntityOverlay,
    toggleTodoComplete,
    toggleHabitComplete,
    undoLastCompletion,

    // State
    completedHabitIds,
    completedTodoIds,
    undoState,
  };
}
