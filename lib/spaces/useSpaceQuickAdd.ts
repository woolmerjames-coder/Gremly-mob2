/**
 * useSpaceQuickAdd - Hook for quick-adding items to a Space via MindDrop pipeline
 *
 * Similar to useNowQuickAdd but:
 * - Attaches new entities to the specified space
 * - Does NOT automatically set due_day to today (lets AI/heuristics decide)
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
 */
function generateDropId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    void error;
  }

  // RFC4122-ish fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    if (c === 'x') return r.toString(16);
    return ((r & 0x3) | 0x8).toString(16);
  });
}

/** Result object passed to onComplete callback */
export interface SpaceQuickAddCompleteResult {
  kind: 'todo' | 'habit' | 'log' | 'note' | 'unknown';
  todoId?: string;
  habitId?: string;
  noteId?: string;
  dropId?: string;
  spaceId: string;
}

/** Options for useSpaceQuickAdd hook */
export interface SpaceQuickAddOptions {
  /** The space ID to attach new items to */
  spaceId: string;
  /** Called immediately when user submits (for optimistic UI) */
  onStart?: (draftTitle: string) => void;
  /** Called when pipeline finishes successfully */
  onComplete?: (result: SpaceQuickAddCompleteResult) => void;
  /** Called when pipeline fails */
  onError?: (error: Error) => void;
}

export interface UseSpaceQuickAddResult {
  /** Submit text through MindDrop pipeline with Space attachment (fire-and-forget) */
  onQuickAdd: (text: string) => void;
}

export function useSpaceQuickAdd(options: SpaceQuickAddOptions): UseSpaceQuickAddResult {
  const { spaceId, onStart, onComplete, onError } = options;
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
  const isProcessingRef = useRef(false);

  const onQuickAdd = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      if (isProcessingRef.current) {
        console.warn('[SpaceQuickAdd] Already processing, ignoring duplicate submit');
        return;
      }

      isProcessingRef.current = true;

      console.log('[SpaceQuickAdd] Quick add submitted:', { text: trimmed, spaceId });
      onStart?.(trimmed);

      // Run pipeline in background (fire-and-forget)
      (async () => {
        try {
          const dropId = generateDropId();
          const userId = user?.id ?? 'anonymous';

          console.log('[SpaceQuickAdd] Starting pipeline', {
            dropId,
            spaceId,
            textLength: trimmed.length,
          });

          // Step 1: Create unsorted note with space attachment
          const unsortedNoteId = await saveToUnsortedTray(createNote, trimmed, {
            dropId,
            whyString: `Quick Add from Space: ${spaceId}`,
            spaceId, // Attach to space from the start
          });

          if (!unsortedNoteId) {
            console.error('[SpaceQuickAdd] Failed to create unsorted note');
            onError?.(new Error('Failed to save note'));
            return;
          }

          console.log('[SpaceQuickAdd] Created unsorted note', { id: unsortedNoteId, dropId });

          // Step 2: Run Cortex classification with space context
          const ctx: CortexContext = {
            userId,
            activeSpaceId: spaceId, // Pass the space ID to Cortex
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

          console.log('[SpaceQuickAdd] Cortex decision', {
            mode: decision.mode,
            confidence: decision.confidence,
            actions: decision.actions?.map((a) => a.type),
          });

          // Step 3: Run Stage A classification
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
              throw new Error(`Unknown type: ${(existing as any).type}`);
            },
            remove: async (id: string) => {
              const existing = getItemById(id);
              if (!existing) return;
              if (existing.type === 'note') return deleteNote(id);
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
            spaceId, // Pass spaceId to Stage A
          });

          console.log('[SpaceQuickAdd] Stage A complete', {
            todos: stageAResult.entities.todos.length,
            habits: stageAResult.entities.habits.length,
            notes: stageAResult.entities.notes.length,
          });

          // Step 4: Ensure all created entities have space_id set
          // (Stage A should handle this via spaceId param, but double-check)
          const allEntityIds = [
            ...stageAResult.entities.todos,
            ...stageAResult.entities.habits,
            ...stageAResult.entities.notes,
          ];

          for (const entityId of allEntityIds) {
            try {
              const entity = getItemById(entityId);
              if (entity && !(entity as any).space_id) {
                console.log('[SpaceQuickAdd] Setting space_id for entity', { entityId, spaceId });
                if (entity.type === 'todo') {
                  await updateTodo(entityId, { space_id: spaceId } as any);
                } else if (entity.type === 'habit') {
                  await updateHabit(entityId, { space_id: spaceId } as any);
                } else if (entity.type === 'note') {
                  await updateNote(entityId, { space_id: spaceId } as any);
                }
              }
            } catch (err) {
              console.warn('[SpaceQuickAdd] Failed to update entity space_id', { entityId, err });
            }
          }

          // Step 5: Kick off Stage B prefill in background (non-blocking)
          const entityIds = {
            todos: stageAResult.entities.todos,
            habits: stageAResult.entities.habits,
            notes: stageAResult.entities.notes,
          };

          if (
            entityIds.todos.length > 0 ||
            entityIds.habits.length > 0 ||
            entityIds.notes.length > 0
          ) {
            runMindDropStageBPrefill({
              repo: pipelineAdapter as any,
              entityIds,
              rawText: trimmed,
            }).catch((err) => {
              console.warn('[SpaceQuickAdd] Stage B prefill failed', err);
            });
          }

          console.log('[SpaceQuickAdd] Pipeline complete', { dropId, spaceId });

          // Build result object
          const result: SpaceQuickAddCompleteResult = {
            kind: 'unknown',
            dropId,
            spaceId,
          };

          if (stageAResult.entities.todos.length > 0) {
            result.kind = 'todo';
            result.todoId = stageAResult.entities.todos[0];
          } else if (stageAResult.entities.habits.length > 0) {
            result.kind = 'habit';
            result.habitId = stageAResult.entities.habits[0];
          } else if (stageAResult.entities.notes.length > 0) {
            result.kind = 'note';
            result.noteId = stageAResult.entities.notes[0];
          }

          onComplete?.(result);
        } catch (err) {
          console.error('[SpaceQuickAdd] Pipeline failed', err);
          const error = err instanceof Error ? err : new Error(String(err));
          onError?.(error);
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
      spaceId,
      onStart,
      onComplete,
      onError,
    ],
  );

  return {
    onQuickAdd,
  };
}
