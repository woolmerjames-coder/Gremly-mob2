/**
 * useEventQuickAdd - Hook for quick-adding Key Date events to a Space
 *
 * Skips Phase 0/1 classification entirely since we know it's an event.
 * Goes directly to Phase 2 enrichment to extract:
 * - smart_title (cleaned up event name)
 * - target_date (event date)
 * - end_date (if multi-day)
 * - event_time (if time mentioned)
 * - tags
 *
 * Then creates the note with subtype: 'event' and is_goal: false.
 */

import { useCallback, useRef } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { callEnrichPhase2Streaming, Phase2EnrichmentResult } from '../cortex/CortexClient';

/** Options for useEventQuickAdd hook */
export interface EventQuickAddOptions {
  /** The space ID to attach the event to */
  spaceId: string;
  /** Called immediately when user submits (for optimistic UI) */
  onStart?: (draftTitle: string) => void;
  /** Called when event is created successfully */
  onComplete?: (noteId: string) => void;
  /** Called when creation fails */
  onError?: (error: Error) => void;
}

export interface UseEventQuickAddResult {
  /** Submit text for event creation (fire-and-forget) */
  onQuickAdd: (text: string) => void;
}

/**
 * Hook for quick-adding Key Date events from a Space screen.
 *
 * Skips classification, runs Phase 2 enrichment with bucket='log' and subtype='event',
 * then creates the note directly.
 */
export function useEventQuickAdd(options: EventQuickAddOptions): UseEventQuickAddResult {
  const { spaceId, onStart, onComplete, onError } = options;
  const createNote = useGremlyStore((s) => s.createNote);

  const isProcessingRef = useRef(false);

  const onQuickAdd = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      // Prevent double submits
      if (isProcessingRef.current) {
        console.warn('[EventQuickAdd] Already processing, ignoring duplicate submit');
        return;
      }

      isProcessingRef.current = true;

      // Notify caller that processing has started (for optimistic UI)
      console.log('[EventQuickAdd] Quick add submitted:', { text: trimmed, spaceId });
      onStart?.(trimmed);

      // Collect enrichment fields as they arrive
      const enrichedFields: Partial<Phase2EnrichmentResult> = {};

      // Run Phase 2 enrichment with event parameters
      const controller = callEnrichPhase2Streaming(
        {
          text: trimmed,
          bucket: 'log',
          subtype: 'event',
        },
        {
          onField: (field, value) => {
            console.log('[EventQuickAdd] Enrichment field:', field, value);
            enrichedFields[field as keyof Phase2EnrichmentResult] = value;
          },
          onComplete: async (result) => {
            console.log('[EventQuickAdd] Enrichment complete:', result);

            try {
              // Create the event note with enriched data
              // Use target_date for event date, end_date for multi-day events
              const note = await createNote({
                title: result.smart_title || trimmed.substring(0, 60),
                body: null,
                subtype: 'event',
                space_id: spaceId,
                is_goal: false,
                target_date: result.target_date || result.extracted_date || null,
                end_date: result.end_date || null,
                event_time: result.event_time || null,
                tags: result.tags || [],
                origin: 'space_chat',
              });

              console.log('[EventQuickAdd] Event created:', note.id);
              onComplete?.(note.id);
            } catch (err) {
              console.error('[EventQuickAdd] Failed to create event:', err);
              onError?.(err instanceof Error ? err : new Error(String(err)));
            } finally {
              isProcessingRef.current = false;
            }
          },
          onError: (error) => {
            console.error('[EventQuickAdd] Enrichment failed:', error);

            // Fallback: Create event with just the raw text as title
            createNote({
              title: trimmed.substring(0, 60),
              body: trimmed.length > 60 ? trimmed : null,
              subtype: 'event',
              space_id: spaceId,
              is_goal: false,
              origin: 'space_chat',
            })
              .then((note) => {
                console.log('[EventQuickAdd] Fallback event created:', note.id);
                onComplete?.(note.id);
              })
              .catch((err) => {
                console.error('[EventQuickAdd] Fallback creation failed:', err);
                onError?.(err instanceof Error ? err : new Error(String(err)));
              })
              .finally(() => {
                isProcessingRef.current = false;
              });
          },
        },
      );
    },
    [createNote, spaceId, onStart, onComplete, onError],
  );

  return { onQuickAdd };
}
