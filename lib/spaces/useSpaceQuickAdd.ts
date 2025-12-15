/**
 * useSpaceQuickAdd - Hook for quick-adding items to a Space via MindDrop pipeline
 *
 * Thin wrapper around useMindDropSubmit that passes `source: 'space'` with
 * the target spaceId to attach new entities to the specified space.
 *
 * Unlike useNowQuickAdd:
 * - Does NOT automatically set due_day to today
 * - Sets space_id and origin: 'space_chat' on all created entities
 *
 * Supports optimistic UI flow with onStart/onComplete/onError callbacks.
 */

import { useCallback, useRef } from 'react';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import type { SubmitResult } from '../../hooks/useMindDropSubmit';

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

/**
 * Map useMindDropSubmit result to SpaceQuickAddCompleteResult
 */
function mapSubmitResult(result: SubmitResult, spaceId: string): SpaceQuickAddCompleteResult {
  if (!result.success || !result.bucket) {
    return {
      kind: 'unknown',
      dropId: result.dropId,
      spaceId,
    };
  }

  switch (result.bucket) {
    case 'todo':
      return {
        kind: 'todo',
        todoId: result.entityId,
        dropId: result.dropId,
        spaceId,
      };
    case 'habit':
      return {
        kind: 'habit',
        habitId: result.entityId,
        dropId: result.dropId,
        spaceId,
      };
    case 'log':
      return {
        kind: 'note',
        noteId: result.entityId,
        dropId: result.dropId,
        spaceId,
      };
    default:
      return {
        kind: 'unknown',
        dropId: result.dropId,
        spaceId,
      };
  }
}

/**
 * Hook for quick-adding items from a Space screen.
 *
 * Uses the unified MindDrop pipeline with `source: 'space'` which:
 * - All entities: Sets space_id to the provided spaceId
 * - All entities: Sets origin to 'space_chat'
 * - No automatic date fields (unlike 'today' source)
 *
 * @param options - Config object with spaceId and callbacks for optimistic UI
 * @returns Object with onQuickAdd function
 */
export function useSpaceQuickAdd(options: SpaceQuickAddOptions): UseSpaceQuickAddResult {
  const { spaceId, onStart, onComplete, onError } = options;
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
        console.warn('[SpaceQuickAdd] Already processing, ignoring duplicate submit');
        return;
      }

      isProcessingRef.current = true;

      // Notify caller that processing has started (for optimistic UI)
      console.log('[SpaceQuickAdd] Quick add submitted:', { text: trimmed, spaceId });
      onStart?.(trimmed);

      // Run pipeline with source: 'space' for space attachment
      // Fire-and-forget from caller's perspective
      submit(trimmed, {
        source: 'space',
        spaceId,
      })
        .then((result) => {
          if (result.success) {
            console.log('[SpaceQuickAdd] Pipeline complete', {
              dropId: result.dropId,
              entityId: result.entityId,
              bucket: result.bucket,
              spaceId,
            });
            onComplete?.(mapSubmitResult(result, spaceId));
          } else {
            console.error('[SpaceQuickAdd] Pipeline failed:', result.error);
            onError?.(result.error ?? new Error('Unknown error'));
          }
        })
        .catch((err) => {
          console.error('[SpaceQuickAdd] Unexpected error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          isProcessingRef.current = false;
        });
    },
    [submit, spaceId, onStart, onComplete, onError],
  );

  return { onQuickAdd };
}
