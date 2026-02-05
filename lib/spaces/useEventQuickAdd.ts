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
import { getDateService } from '../date';
import { env, getEnv } from '../env';

// --- Helpers to read env vars (same pattern as dropProcessor.ts) ---
const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

/** Phase 2 enrichment result for events */
interface EventEnrichmentResult {
  smart_title?: string | null;
  target_date?: string | null;
  end_date?: string | null;
  event_time?: string | null;
  tags?: string[];
  extracted_date?: string | null;
}

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

      // Run the async flow
      (async () => {
        try {
          const cortexUrl = readCortexUrl();
          const anonKey = readSupabaseAnonKey();

          if (!cortexUrl || !anonKey) {
            throw new Error('Missing cortex URL or anon key');
          }

          // Get date context for Phase 2
          const ds = getDateService();
          const currentDate = ds.getCurrentDate(); // YYYY-MM-DD
          const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

          console.log('[EventQuickAdd] Running Phase 1.5a + Phase 2 in parallel');

          // Run Phase 1.5a (smart title + confirmation) and Phase 2 (date extraction) in parallel
          const [phase15aResult, phase2Result] = await Promise.all([
            // Phase 1.5a: Get smart title + confirmation message
            (async () => {
              try {
                const res = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${anonKey}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase1-5a',
                    text: trimmed,
                    bucket: 'log',
                    subtype: 'event',
                  }),
                });
                if (!res.ok) {
                  console.warn('[EventQuickAdd] Phase 1.5a returned non-ok status:', res.status);
                  return null;
                }
                const json = await res.json();
                console.log('[EventQuickAdd] Phase 1.5a result:', {
                  smart_title: json.smart_title,
                  confirmation_message: json.confirmation_message?.substring(0, 50),
                });
                return {
                  smart_title: json.smart_title || null,
                  confirmation_message: json.confirmation_message || null,
                };
              } catch (err) {
                console.warn('[EventQuickAdd] Phase 1.5a failed:', err);
                return null;
              }
            })(),

            // Phase 2: Get date/time extraction
            (async () => {
              try {
                const res = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${anonKey}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase2',
                    text: trimmed,
                    bucket: 'log',
                    subtype: 'event',
                    currentDate,
                    dayOfWeek,
                    timezone,
                  }),
                });
                if (!res.ok) {
                  console.warn('[EventQuickAdd] Phase 2 returned non-ok status:', res.status);
                  return null;
                }
                const json: EventEnrichmentResult = await res.json();
                console.log('[EventQuickAdd] Phase 2 result:', {
                  target_date: json.target_date,
                  end_date: json.end_date,
                  event_time: json.event_time,
                  tags: json.tags,
                });
                return json;
              } catch (err) {
                console.warn('[EventQuickAdd] Phase 2 failed:', err);
                return null;
              }
            })(),
          ]);

          // Use Phase 1.5a for title/message, Phase 2 for dates
          const smartTitle = phase15aResult?.smart_title || trimmed.substring(0, 60);
          const confirmationMessage = phase15aResult?.confirmation_message || null;

          // Create the event note with enriched data
          const note = await createNote({
            title: smartTitle,
            body: trimmed, // Store original text as body
            subtype: 'event',
            space_id: spaceId,
            is_goal: false,
            target_date: phase2Result?.target_date || phase2Result?.extracted_date || null,
            end_date: phase2Result?.end_date || null,
            event_time: phase2Result?.event_time || null,
            tags: phase2Result?.tags || [],
            origin: 'space_chat',
            views: {
              confirmation_message: confirmationMessage,
            },
          });

          console.log('[EventQuickAdd] Event note created:', note.id);
          onComplete?.(note.id);
        } catch (err) {
          console.error('[EventQuickAdd] Enrichment failed:', err);

          // Fallback: Create event with just the raw text as title
          try {
            const note = await createNote({
              title: trimmed.substring(0, 60),
              body: trimmed,
              subtype: 'event',
              space_id: spaceId,
              is_goal: false,
              origin: 'space_chat',
            });

            console.log('[EventQuickAdd] Fallback event created:', note.id);
            onComplete?.(note.id);
          } catch (fallbackErr) {
            console.error('[EventQuickAdd] Fallback creation failed:', fallbackErr);
            onError?.(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
          }
        } finally {
          isProcessingRef.current = false;
        }
      })();
    },
    [createNote, spaceId, onStart, onComplete, onError],
  );

  return { onQuickAdd };
}
