/**
 * useNowQuickAdd - Hook for quick-adding items to Today's Focus via MindDrop pipeline
 *
 * Thin wrapper around useMindDropSubmit that passes `source: 'today'` to
 * automatically set due_day/start_date to today for todos/habits.
 *
 * Supports optimistic UI flow with onStart/onComplete/onError callbacks.
 */

import { useCallback, useRef } from 'react';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import type { SubmitResult } from '../../hooks/useMindDropSubmit';
import { getDateService } from '../date';

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
  /** Override due_day (e.g. tomorrow's YYYY-MM-DD for "Plan tomorrow" mode) */
  targetDate?: string | null;
}

export interface UseNowQuickAddResult {
  /** Submit text through MindDrop pipeline with Today scoping (fire-and-forget) */
  onQuickAdd: (text: string) => void;
}

/**
 * Map useMindDropSubmit result to NowQuickAddCompleteResult
 */
function mapSubmitResult(
  result: SubmitResult,
  targetDate?: string | null,
): NowQuickAddCompleteResult {
  const today = getDateService().today();
  const effectiveDate = targetDate || today;

  if (!result.success || !result.bucket) {
    return {
      kind: 'unknown',
      dropId: result.dropId,
    };
  }

  switch (result.bucket) {
    case 'todo':
      return {
        kind: 'todo',
        todoId: result.entityId,
        dropId: result.dropId,
        dueDay: effectiveDate,
        isToday: effectiveDate === today,
      };
    case 'habit':
      return {
        kind: 'habit',
        habitId: result.entityId,
        dropId: result.dropId,
        isToday: effectiveDate === today,
      };
    case 'log':
      return {
        kind: 'note',
        noteId: result.entityId,
        dropId: result.dropId,
      };
    default:
      return {
        kind: 'unknown',
        dropId: result.dropId,
      };
  }
}

/**
 * Hook for quick-adding items from the Now/Today screen.
 *
 * Uses the unified MindDrop pipeline with `source: 'today'` which:
 * - Todos: Sets due_day and due_date to today automatically
 * - Habits: Sets start_date to today automatically
 * - Notes/Logs: No date fields, just captured
 *
 * @param options - Callbacks for optimistic UI (onStart, onComplete, onError)
 * @returns Object with onQuickAdd function
 */
export function useNowQuickAdd(options?: NowQuickAddOptions): UseNowQuickAddResult {
  const { submit } = useMindDropSubmit();

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

      // Run pipeline with source: 'today' for auto due_day/start_date
      // dueDayOverride routes items to targetDate when in "Plan tomorrow" mode
      submit(trimmed, {
        source: 'today',
        spaceId: null,
        dueDayOverride: options?.targetDate ?? null,
      })
        .then((result) => {
          if (result.success) {
            console.log('[NowQuickAdd] Pipeline complete', {
              dropId: result.dropId,
              entityId: result.entityId,
              bucket: result.bucket,
            });
            options?.onComplete?.(mapSubmitResult(result, options?.targetDate));
          } else {
            console.error('[NowQuickAdd] Pipeline failed:', result.error);
            options?.onError?.(result.error ?? new Error('Unknown error'));
          }
        })
        .catch((err) => {
          console.error('[NowQuickAdd] Unexpected error:', err);
          options?.onError?.(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          isProcessingRef.current = false;
        });
    },
    [submit, options],
  );

  return { onQuickAdd };
}
