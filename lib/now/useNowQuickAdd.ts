/**
 * useNowQuickAdd - Hook for quick-adding items to Today's Focus via MindDrop pipeline
 *
 * Wraps the MindDrop classification pipeline for use from the Now screen quick-add modal.
 * Creates an unsorted note, runs Stage A classification, and applies Today scoping.
 *
 * Supports optimistic UI flow with onStart/onComplete/onError callbacks.
 */

import { useCallback, useRef } from 'react';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { saveToUnsortedTray } from '../../app/screens/CatchAllNotepad';
import { runMindDropStageAClassification } from '../minddrop/pipelineStages';
import { runMindDropStageBPrefill } from '../minddrop/pipelineStages';
import { parseDue } from '../nlp/datetime/parseDue';
import { useGremlyStore } from '../store/useGremlyStore';
import { selectItemById } from '../store/selectors';
import type { CortexContext } from '../cortex/cortexDecide';

/**
 * Generate a valid UUID drop ID for MindDrop pipeline.
 * Uses crypto.randomUUID if available, falls back to RFC4122-ish generation.
 * This matches the pattern in CatchAllNotepad.tsx createDropId().
 */
function generateDropId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    void error;
  }

  // RFC4122-ish fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    if (c === 'x') return r.toString(16);
    return ((r & 0x3) | 0x8).toString(16);
  });
}

// Get today's date in YYYY-MM-DD format (local timezone)
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Result object passed to onComplete callback */
export interface NowQuickAddCompleteResult {
  kind: 'todo' | 'habit' | 'log' | 'note' | 'unknown';
  todoId?: string;
  habitId?: string;
  noteId?: string;
  dropId?: string;
  dueDay?: string | null;
  isToday?: boolean;
}

/** Options for useNowQuickAdd hook */
export interface NowQuickAddOptions {
  /** Called immediately when user submits (for optimistic UI) */
  onStart?: (draftTitle: string) => void;
  /** Called when pipeline finishes successfully */
  onComplete?: (result: NowQuickAddCompleteResult) => void;
  /** Called when pipeline fails */
  onError?: (error: Error) => void;
}

export interface UseNowQuickAddResult {
  /** Submit text through MindDrop pipeline with Today scoping (fire-and-forget) */
  onQuickAdd: (text: string) => void;
}

export function useNowQuickAdd(options?: NowQuickAddOptions): UseNowQuickAddResult {
  const { decideWithContext } = useCortex();
  const { user } = useAuth();
  // Direct store mutations
  const createNote = useGremlyStore((s) => s.createNote);
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  // Synchronous lookup helper
  const getItemById = useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );
  // Use ref to track in-flight submissions to prevent double-submits
  const isProcessingRef = useRef(false);

  const onQuickAdd = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      // Prevent double submits
      if (isProcessingRef.current) {
        console.warn('[NowQuickAdd] Already processing, ignoring duplicate submit');
        return;
      }

      isProcessingRef.current = true;

      // Notify caller that processing has started (for optimistic UI)
      console.log('[NowQuickAdd] Quick add submitted:', trimmed);
      options?.onStart?.(trimmed);

      // Run pipeline in background (fire-and-forget from caller's perspective)
      (async () => {
        try {
          const dropId = generateDropId();
          const userId = user?.id ?? 'anonymous';
          const todayDate = getTodayDateString();

          console.log('[NowQuickAdd] Starting pipeline', { dropId, textLength: trimmed.length });

          // Step 1: Create unsorted note (same as MindDrop)
          const unsortedNoteId = await saveToUnsortedTray(createNote, trimmed, {
            dropId,
            whyString: 'Quick Add from Today screen',
          });

          if (!unsortedNoteId) {
            console.error('[NowQuickAdd] Failed to create unsorted note');
            options?.onError?.(new Error('Failed to save note'));
            return;
          }

          console.log('[NowQuickAdd] Created unsorted note', { id: unsortedNoteId, dropId });

          // Step 2: Run Cortex classification
          const ctx: CortexContext = {
            userId,
            activeSpaceId: null,
            uiSurface: 'overlay',
            lane: 'catchall',
          };

          // Parse any due date from the text
          const parsed = parseDue(trimmed);
          const parsedIso =
            parsed && parsed.confidence !== undefined && parsed.confidence >= 0.7
              ? parsed.iso
              : null;

          const decision = await decideWithContext({ text: trimmed }, ctx);

          console.log('[NowQuickAdd] Cortex decision', {
            mode: decision.mode,
            confidence: decision.confidence,
            actions: decision.actions?.map((a) => a.type),
          });

          // Step 3: Run Stage A classification (creates todo/habit/note)
          // Create adapter for pipeline stages that expect repo interface
          const pipelineAdapter = {
            getById: getItemById,
            create: async (input: { type: string; data: any }) => {
              if (input.type === 'todo') return createTodo(input.data);
              if (input.type === 'habit') return createHabit(input.data);
              if (input.type === 'note') return createNote(input.data);
              throw new Error(`Unknown type: ${input.type}`);
            },
            update: async (params: { id: string; patch: any }) => {
              const existing = getItemById(params.id);
              if (!existing) throw new Error(`Item not found: ${params.id}`);
              if (existing.type === 'todo') return updateTodo(params.id, params.patch);
              if (existing.type === 'habit') return updateHabit(params.id, params.patch);
              if (existing.type === 'note') return updateNote(params.id, params.patch);
              throw new Error(`Unknown type: ${existing.type}`);
            },
            remove: async (id: string) => {
              const existing = getItemById(id);
              if (!existing) return;
              if (existing.type === 'note') return deleteNote(id);
              // Pipeline rarely deletes todos/habits during classification
            },
            notes: {
              create: createNote,
              list: async () => [] as any[],
              update: async (id: string, patch: any) => updateNote(id, patch),
              remove: async (id: string) => deleteNote(id),
            },
            todos: {
              create: createTodo,
              list: async () => [] as any[],
              update: async (id: string, patch: any) => updateTodo(id, patch),
            },
            habits: {
              create: createHabit,
              list: async () => [] as any[],
              update: async (id: string, patch: any) => updateHabit(id, patch),
            },
          };
          const stageAResult = await runMindDropStageAClassification({
            repo: pipelineAdapter as any,
            text: trimmed,
            cleanedText: trimmed,
            decision,
            dropId,
            sourceMessageId: null,
            parsedDue: parsedIso,
            unsortedNoteId,
          });

          console.log('[NowQuickAdd] Stage A complete', {
            todos: stageAResult.entities.todos.length,
            habits: stageAResult.entities.habits.length,
            notes: stageAResult.entities.notes.length,
          });

          // Step 4: Apply Today scoping for todos without explicit due date
          let finalTodoDueDay: string | null = null;
          let finalTodoId: string | undefined;

          for (const todoId of stageAResult.entities.todos) {
            try {
              const todo = getItemById(todoId);
              if (todo && todo.type === 'todo') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const existingDueDay = (todo as any).due_day;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const existingDueDate = (todo as any).due_date;
                const hasDueDate = !!existingDueDate || !!existingDueDay;

                if (!hasDueDate) {
                  console.log('[NowQuickAdd] Setting todo due_day to today', { todoId, todayDate });
                  await updateTodo(todoId, {
                    due_day: todayDate,
                    due_date: todayDate,
                    undefined_due: false,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                  finalTodoDueDay = todayDate;
                } else {
                  finalTodoDueDay = existingDueDay ?? null;
                }
                finalTodoId = todoId;
              }
            } catch (err) {
              console.warn('[NowQuickAdd] Failed to update todo due date', { todoId, err });
            }
          }

          // Step 5: Apply Today scoping for habits without start date
          let finalHabitId: string | undefined;

          for (const habitId of stageAResult.entities.habits) {
            try {
              const habit = getItemById(habitId);
              if (habit && habit.type === 'habit') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasStartDate = !!(habit as any).start_date;
                if (!hasStartDate) {
                  console.log('[NowQuickAdd] Setting habit start_date to today', {
                    habitId,
                    todayDate,
                  });
                  await updateHabit(habitId, {
                    start_date: todayDate,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                }
                finalHabitId = habitId;
              }
            } catch (err) {
              console.warn('[NowQuickAdd] Failed to update habit start date', { habitId, err });
            }
          }

          // Step 6: Kick off Stage B prefill in background (non-blocking)
          const allEntityIds = {
            todos: stageAResult.entities.todos,
            habits: stageAResult.entities.habits,
            notes: stageAResult.entities.notes,
          };

          if (
            allEntityIds.todos.length > 0 ||
            allEntityIds.habits.length > 0 ||
            allEntityIds.notes.length > 0
          ) {
            // Fire and forget - don't await
            runMindDropStageBPrefill({
              repo: pipelineAdapter as any,
              entityIds: allEntityIds,
              rawText: trimmed,
            }).catch((err) => {
              console.warn('[NowQuickAdd] Stage B prefill failed', err);
            });
          }

          console.log('[NowQuickAdd] Pipeline complete', { dropId });

          // Build result object for onComplete callback
          const result: NowQuickAddCompleteResult = {
            kind: 'unknown',
            dropId,
          };

          if (stageAResult.entities.todos.length > 0 && finalTodoId) {
            result.kind = 'todo';
            result.todoId = finalTodoId;
            result.dueDay = finalTodoDueDay;
            result.isToday = finalTodoDueDay === todayDate;
          } else if (stageAResult.entities.habits.length > 0 && finalHabitId) {
            result.kind = 'habit';
            result.habitId = finalHabitId;
            result.isToday = true; // Habits with start_date=today appear on Today
          } else if (stageAResult.entities.notes.length > 0) {
            // Check if it's a log or note based on subtype
            const noteId = stageAResult.entities.notes[0];
            result.noteId = noteId;
            // For now, treat all notes from quick-add as 'note' kind
            // Could check subtype === 'log' if needed
            result.kind = 'note';
          }

          options?.onComplete?.(result);
        } catch (err) {
          console.error('[NowQuickAdd] Pipeline failed', err);
          const error = err instanceof Error ? err : new Error(String(err));
          options?.onError?.(error);
        } finally {
          isProcessingRef.current = false;
        }
      })();
    },
    [
      createNote,
      createTodo,
      createHabit,
      updateTodo,
      updateHabit,
      updateNote,
      deleteNote,
      getItemById,
      decideWithContext,
      user,
      options,
    ],
  );

  return {
    onQuickAdd,
  };
}
