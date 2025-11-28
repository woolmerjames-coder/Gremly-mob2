/**
 * useNowQuickAdd - Hook for quick-adding items to Today's Focus via MindDrop pipeline
 *
 * Wraps the MindDrop classification pipeline for use from the Now screen quick-add modal.
 * Creates an unsorted note, runs Stage A classification, and applies Today scoping.
 */

import { useCallback, useState } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { saveToUnsortedTray } from '../../app/screens/CatchAllNotepad';
import { runMindDropStageAClassification } from '../minddrop/pipelineStages';
import { runMindDropStageBPrefill } from '../minddrop/pipelineStages';
import { parseDue } from '../nlp/datetime/parseDue';
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

export interface UseNowQuickAddResult {
  /** Submit text through MindDrop pipeline with Today scoping */
  onQuickAdd: (text: string) => Promise<{ success: boolean; error?: string }>;
  /** Whether a submission is currently in progress */
  isSubmitting: boolean;
}

export function useNowQuickAdd(options?: {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}): UseNowQuickAddResult {
  const repo = useRepo();
  const { decideWithContext } = useCortex();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onQuickAdd = useCallback(
    async (text: string): Promise<{ success: boolean; error?: string }> => {
      const trimmed = text.trim();
      if (!trimmed) {
        return { success: false, error: 'Empty text' };
      }

      if (isSubmitting) {
        return { success: false, error: 'Already submitting' };
      }

      setIsSubmitting(true);

      try {
        const dropId = generateDropId();
        const userId = user?.id ?? 'anonymous';

        console.log('[NowQuickAdd] Starting pipeline', { dropId, textLength: trimmed.length });

        // Step 1: Create unsorted note (same as MindDrop)
        const unsortedNoteId = await saveToUnsortedTray(repo, trimmed, {
          dropId,
          whyString: 'Quick Add from Today screen',
        });

        if (!unsortedNoteId) {
          console.error('[NowQuickAdd] Failed to create unsorted note');
          options?.onError?.('Failed to save note');
          return { success: false, error: 'Failed to save note' };
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
          parsed && parsed.confidence !== undefined && parsed.confidence >= 0.7 ? parsed.iso : null;

        const decision = await decideWithContext({ text: trimmed }, ctx);

        console.log('[NowQuickAdd] Cortex decision', {
          mode: decision.mode,
          confidence: decision.confidence,
          actions: decision.actions?.map((a) => a.type),
        });

        // Step 3: Run Stage A classification (creates todo/habit/note)
        const stageAResult = await runMindDropStageAClassification({
          repo,
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
        const todayDate = getTodayDateString();

        for (const todoId of stageAResult.entities.todos) {
          try {
            const todo = await repo.getById(todoId);
            if (todo && todo.type === 'todo') {
              // If no due date was set (either by user input or AI), set to today
              const hasDueDate = !!(todo as any).due_date || !!(todo as any).due_day;
              if (!hasDueDate) {
                console.log('[NowQuickAdd] Setting todo due_day to today', { todoId, todayDate });
                await repo.update({
                  id: todoId,
                  patch: {
                    due_day: todayDate,
                    due_date: todayDate,
                    undefined_due: false,
                  } as any,
                });
              }
            }
          } catch (err) {
            console.warn('[NowQuickAdd] Failed to update todo due date', { todoId, err });
          }
        }

        // Step 5: Apply Today scoping for habits without start date
        for (const habitId of stageAResult.entities.habits) {
          try {
            const habit = await repo.getById(habitId);
            if (habit && habit.type === 'habit') {
              const hasStartDate = !!(habit as any).start_date;
              if (!hasStartDate) {
                console.log('[NowQuickAdd] Setting habit start_date to today', {
                  habitId,
                  todayDate,
                });
                await repo.update({
                  id: habitId,
                  patch: {
                    start_date: todayDate,
                  } as any,
                });
              }
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
            repo,
            entityIds: allEntityIds,
            rawText: trimmed,
          }).catch((err) => {
            console.warn('[NowQuickAdd] Stage B prefill failed', err);
          });
        }

        console.log('[NowQuickAdd] Pipeline complete', { dropId });
        options?.onSuccess?.();
        return { success: true };
      } catch (err) {
        console.error('[NowQuickAdd] Pipeline failed', err);
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        options?.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsSubmitting(false);
      }
    },
    [repo, decideWithContext, user, isSubmitting, options],
  );

  return {
    onQuickAdd,
    isSubmitting,
  };
}
