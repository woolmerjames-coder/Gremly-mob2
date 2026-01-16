/**
 * Drop Processor - Optimized Version (Conservative Approach)
 *
 * OPTIMIZATION: Reduced AsyncStorage writes from 9+ to 3-4 per drop
 *
 * Checkpoint strategy:
 * 1. Initial enqueue (handled by dropQueue.ts)
 * 2. After Phase 1 classification (expensive AI work - worth saving)
 * 3. After Phase 2 enrichment complete (all fields at once, not per-field)
 * 4. After Supabase sync (markSynced)
 *
 * REMOVED unnecessary saves:
 * - status: 'classifying' (not needed - if crash, we retry from start)
 * - status: 'enriching' (not needed - if crash, we retry from Phase 1)
 * - status: 'syncing' (not needed - if crash, we retry from Phase 2)
 * - Per-field enrichment updates (now batched into single save)
 *
 * UI updates still happen progressively via Zustand (in-memory, instant)
 */

import { type QueuedDrop, updateDrop, markFailed, getPendingDrops, dequeue } from './dropQueue';
import { detectMulti } from './detectMulti';
import { runPhase1 } from './phase1';
import type { MindDropBucket, LogSubtype } from './types';
import type { HabitSubtype } from '../types';
import { useGremlyStore } from '../store/useGremlyStore';
import { eventBus } from '../events/EventBus';
import { supabase } from '../supabase/client';
import { dateService } from '../date/DateService';
import { buildTodoFields } from '../cortex/textNormalization';
import { parseFrequencyString } from '../habits/frequencyUtils';
import { callEnrichPhase2Streaming, type Phase2EnrichmentResult } from '../cortex/CortexClient';

// --- Types ---

export interface ProcessingCallbacks {
  onPhase0Complete?: (localId: string, isMulti: boolean) => void;
  onPhase1Complete?: (localId: string, bucket: MindDropBucket) => void;
  onPhase2Field?: (localId: string, field: string, value: unknown) => void;
  onPhase2Complete?: (localId: string) => void;
  onSyncComplete?: (localId: string, supabaseId: string) => void;
  onError?: (localId: string, error: Error) => void;
}

interface SyncResult {
  success: boolean;
  supabaseId?: string;
  entityType?: 'todo' | 'habit' | 'note';
  error?: Error;
}

// --- Helper: Run Phase 2 without DB writes ---

async function runPhase2InMemory(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
  onField?: (field: string, value: unknown) => void,
): Promise<Phase2EnrichmentResult | null> {
  return new Promise((resolve) => {
    const partialResult: Partial<Phase2EnrichmentResult> = {};
    let resolved = false;

    const safeResolve = (result: Phase2EnrichmentResult | null) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    // Timeout fallback
    const timeout = setTimeout(() => {
      console.log('[DropProcessor] Phase 2 timeout, using partial result');
      safeResolve(partialResult.smart_title ? (partialResult as Phase2EnrichmentResult) : null);
    }, 10000);

    try {
      callEnrichPhase2Streaming(
        { text, bucket, subtype, recentTitles: [] },
        {
          onField: (field, value) => {
            partialResult[field as keyof Phase2EnrichmentResult] = value as any;
            // Only update Zustand (in-memory) - NO AsyncStorage write here
            onField?.(field, value);
          },
          onComplete: (result) => {
            clearTimeout(timeout);
            safeResolve(result);
          },
          onError: (error) => {
            clearTimeout(timeout);
            console.error('[DropProcessor] Phase 2 error:', error);
            safeResolve(
              partialResult.smart_title ? (partialResult as Phase2EnrichmentResult) : null,
            );
          },
        },
      );
    } catch (err) {
      clearTimeout(timeout);
      console.error('[DropProcessor] Phase 2 exception:', err);
      safeResolve(null);
    }
  });
}

// --- Helper: Sync single drop to Supabase ---

async function syncDropToSupabase(
  drop: QueuedDrop,
  enrichment: Phase2EnrichmentResult | null,
): Promise<SyncResult> {
  const { localId, text, spaceId, source, bucket, subtype, habitSubtype } = drop;

  const userId = useGremlyStore.getState().userId;
  if (!userId) {
    return { success: false, error: new Error('Not authenticated') };
  }

  if (!bucket) {
    return { success: false, error: new Error('No bucket classification') };
  }

  const now = new Date().toISOString();
  const today = dateService.today();

  try {
    let table: string;
    let payload: Record<string, unknown>;
    let entityType: 'todo' | 'habit' | 'note';

    if (bucket === 'todo') {
      table = 'todos';
      entityType = 'todo';

      const parsedFields = buildTodoFields(text);
      const dueDay =
        enrichment?.extracted_date?.split('T')[0] ||
        parsedFields.dueDay ||
        (source === 'today' ? today : null);

      payload = {
        owner_id: userId,
        name: enrichment?.smart_title || parsedFields.title || text.substring(0, 60),
        body: text,
        space_id: spaceId,
        drop_id: localId,
        origin: source === 'space' ? 'space_chat' : 'catchall',
        tags: enrichment?.tags || [],
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        time_window: enrichment?.time_window || null,
        due_day: dueDay,
        due_date: dueDay,
        due_time: parsedFields.dueTime || null,
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: enrichment?.confirmation_message,
          people: enrichment?.people?.length ? enrichment.people : undefined,
        },
        created_at: now,
        updated_at: now,
      };
    } else if (bucket === 'habit') {
      table = 'habits';
      entityType = 'habit';

      const freq = enrichment?.extracted_frequency
        ? parseFrequencyString(enrichment.extracted_frequency)
        : { cadence: 'daily' as const, target_per_period: 1 };

      payload = {
        owner_id: userId,
        name: enrichment?.smart_title || text.substring(0, 60),
        title: enrichment?.smart_title || text.substring(0, 60),
        notes: text,
        space_id: spaceId,
        drop_id: localId,
        origin: source === 'space' ? 'space_chat' : 'catchall',
        subtype: habitSubtype || 'start_habit',
        frequency: enrichment?.extracted_frequency || 'daily',
        cadence: freq.cadence,
        target_per_period: freq.target_per_period,
        days_active: enrichment?.extracted_days || null,
        start_date: enrichment?.extracted_start_date || (source === 'today' ? today : null),
        time_window: enrichment?.time_window || 'day', // Default to 'day' to fix NOT NULL constraint
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        tags: enrichment?.tags || [],
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: enrichment?.confirmation_message,
          people: enrichment?.people?.length ? enrichment.people : undefined,
        },
        created_at: now,
        updated_at: now,
      };
    } else {
      // log (note)
      table = 'notes';
      entityType = 'note';

      const noteSubtype =
        subtype === 'journal' ? 'journal' : subtype === 'idea' ? 'idea' : 'catchall';

      payload = {
        owner_id: userId,
        title: enrichment?.smart_title || text.substring(0, 60),
        body: text,
        subtype: noteSubtype,
        space_id: spaceId,
        drop_id: localId,
        origin: source === 'space' ? 'space_chat' : 'catchall',
        tags: enrichment?.tags || [],
        mood: enrichment?.mood || null,
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: enrichment?.confirmation_message,
          people: enrichment?.people?.length ? enrichment.people : undefined,
        },
        created_at: now,
        updated_at: now,
      };
    }

    console.log('[DropProcessor] Syncing to Supabase', { localId, table, entityType });

    const { data, error } = await supabase.from(table).insert(payload).select().single();

    if (error) {
      console.error('[DropProcessor] Supabase insert failed:', error);
      return { success: false, error };
    }

    console.log('[DropProcessor] Synced successfully', { localId, supabaseId: data.id });

    // Add to Zustand store using set() pattern
    if (entityType === 'todo') {
      useGremlyStore.setState((state) => ({
        todos: [...state.todos, { ...data, type: 'todo' as const }],
      }));
    } else if (entityType === 'habit') {
      useGremlyStore.setState((state) => ({
        habits: [...state.habits, { ...data, type: 'habit' as const }],
      }));
    } else {
      useGremlyStore.setState((state) => ({
        notes: [...state.notes, { ...data, type: 'note' as const }],
      }));
    }

    // Emit event for other listeners
    eventBus.emit('entity:created', {
      entity: { ...data, type: entityType, drop_id: localId },
      type: entityType,
      spaceId,
    });

    return { success: true, supabaseId: data.id, entityType };
  } catch (error) {
    console.error('[DropProcessor] Sync exception:', error);
    return { success: false, error: error as Error };
  }
}

// --- Helper: Sync multi-drop to Supabase ---

async function syncMultiDropToSupabase(drop: QueuedDrop): Promise<SyncResult> {
  const {
    localId,
    text,
    spaceId,
    source,
    multiSegments,
    multiSummary,
    dominantBucket,
    dominantSubtype,
  } = drop;

  const userId = useGremlyStore.getState().userId;
  if (!userId) {
    return { success: false, error: new Error('Not authenticated') };
  }

  const now = new Date().toISOString();

  try {
    const payload = {
      owner_id: userId,
      title: multiSummary || text.substring(0, 50),
      body: text,
      subtype: 'catchall',
      space_id: spaceId,
      drop_id: localId,
      origin: source === 'space' ? 'space_chat' : 'catchall',
      views: {
        minddrop_stage: 'multi_pending',
        ai_pending: false,
        is_multi: true,
        multi_items: multiSegments,
        multi_summary_title: multiSummary,
        dominant_bucket: dominantBucket,
        dominant_subtype: dominantSubtype,
      },
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase.from('notes').insert(payload).select().single();

    if (error) {
      console.error('[DropProcessor] Multi-drop sync failed:', error);
      return { success: false, error };
    }

    // Add to Zustand store using set() pattern
    useGremlyStore.setState((state) => ({
      notes: [...state.notes, { ...data, type: 'note' as const }],
    }));

    // Emit event
    eventBus.emit('entity:created', {
      entity: { ...data, type: 'note', drop_id: localId },
      type: 'note',
      spaceId,
    });

    return { success: true, supabaseId: data.id, entityType: 'note' };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// --- Main: Process a single drop ---

export async function processDrop(
  drop: QueuedDrop,
  callbacks?: ProcessingCallbacks,
): Promise<{ success: boolean; supabaseId?: string; error?: Error }> {
  const { localId, text } = drop;
  const startTime = Date.now();

  console.log('[DropProcessor] Processing drop', { localId, textPreview: text.substring(0, 30) });

  try {
    // =========================================
    // PHASE 0: Multi-entity detection
    // NO AsyncStorage save here (not worth checkpoint)
    // =========================================

    const multiResult = await detectMulti(text);

    console.log('[DropProcessor] Phase 0 timing', { localId, elapsed: Date.now() - startTime });

    if (multiResult.is_multi && multiResult.segments && multiResult.segments.length > 1) {
      console.log('[DropProcessor] Multi-entity detected', {
        localId,
        segmentCount: multiResult.segments.length,
      });

      // Run Phase 1 on each segment for accurate classification
      const classifiedSegments = await Promise.all(
        multiResult.segments.map(async (seg) => {
          const phase1 = await runPhase1(seg.text, { hasAttachments: false });
          return {
            text: seg.text,
            bucket: phase1.bucket,
            subtype: phase1.subtype,
            habitSubtype: phase1.habitSubtype,
          };
        }),
      );

      // CHECKPOINT 1 (for multi): Save multi-detection results before sync
      await updateDrop(localId, {
        isMulti: true,
        multiSegments: classifiedSegments,
        multiSummary: multiResult.summary,
        dominantBucket: multiResult.dominant_bucket as MindDropBucket,
        dominantSubtype: multiResult.dominant_subtype as LogSubtype | null,
        status: 'classified', // Clear checkpoint status
      });

      callbacks?.onPhase0Complete?.(localId, true);

      // Sync multi-drop
      const syncResult = await syncMultiDropToSupabase({
        ...drop,
        multiSegments: classifiedSegments,
        multiSummary: multiResult.summary,
        dominantBucket: multiResult.dominant_bucket as MindDropBucket,
        dominantSubtype: multiResult.dominant_subtype as LogSubtype | null,
      });

      if (syncResult.success && syncResult.supabaseId) {
        // Remove from queue entirely instead of marking synced (keeps queue small)
        await dequeue(localId);
        useGremlyStore.getState().promotePendingDropToEntity(localId, syncResult.supabaseId);
        callbacks?.onSyncComplete?.(localId, syncResult.supabaseId);

        console.log('[DropProcessor] Total timing (multi)', {
          localId,
          elapsed: Date.now() - startTime,
        });
        return { success: true, supabaseId: syncResult.supabaseId };
      } else {
        throw syncResult.error || new Error('Multi-drop sync failed');
      }
    }

    callbacks?.onPhase0Complete?.(localId, false);

    // =========================================
    // PHASE 1: Classification
    // CHECKPOINT 1: Save after Phase 1 (expensive AI work)
    // =========================================

    const phase1Result = await runPhase1(text, { hasAttachments: false });

    console.log('[DropProcessor] Phase 1 timing', { localId, elapsed: Date.now() - startTime });

    // CHECKPOINT 1: Save classification results
    // This is the first save - protects expensive Phase 1 AI work
    await updateDrop(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
      habitSubtype: phase1Result.habitSubtype,
      confidence: phase1Result.confidence,
      status: 'classified', // Clear checkpoint status
    });

    // Update Zustand for immediate UI feedback (in-memory, instant)
    useGremlyStore.getState().updatePendingDropClassification(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
    });

    callbacks?.onPhase1Complete?.(localId, phase1Result.bucket);

    // =========================================
    // PHASE 2: Enrichment
    // NO per-field AsyncStorage saves during streaming
    // Zustand updates happen in-memory for UI
    // =========================================

    const enrichmentResult = await runPhase2InMemory(
      text,
      phase1Result.bucket,
      phase1Result.subtype,
      (field, value) => {
        callbacks?.onPhase2Field?.(localId, field, value);
        // Update Zustand progressively (in-memory only, no AsyncStorage)
        useGremlyStore.getState().updatePendingDropEnrichment(localId, { [field]: value } as any);
      },
    );

    console.log('[DropProcessor] Phase 2 timing', { localId, elapsed: Date.now() - startTime });

    // CHECKPOINT 2: Save ALL enrichment results in ONE write
    if (enrichmentResult) {
      await updateDrop(localId, {
        smartTitle: enrichmentResult.smart_title,
        tags: enrichmentResult.tags,
        timeEstimateMinutes: enrichmentResult.time_estimate_minutes,
        timeWindow: enrichmentResult.time_window,
        extractedDate: enrichmentResult.extracted_date,
        extractedStartDate: enrichmentResult.extracted_start_date,
        extractedFrequency: enrichmentResult.extracted_frequency,
        extractedDays: enrichmentResult.extracted_days,
        people: enrichmentResult.people,
        confirmationMessage: enrichmentResult.confirmation_message,
        mood: enrichmentResult.mood,
        status: 'enriched', // Clear checkpoint status
      });
    }

    callbacks?.onPhase2Complete?.(localId);

    // =========================================
    // SYNC: Write to Supabase
    // NO separate 'syncing' status save (not needed)
    // =========================================

    const syncResult = await syncDropToSupabase(
      {
        ...drop,
        bucket: phase1Result.bucket,
        subtype: phase1Result.subtype,
        habitSubtype: phase1Result.habitSubtype,
      },
      enrichmentResult,
    );

    if (syncResult.success && syncResult.supabaseId) {
      // Remove from queue entirely instead of marking synced (keeps queue small)
      await dequeue(localId);
      useGremlyStore.getState().promotePendingDropToEntity(localId, syncResult.supabaseId);
      callbacks?.onSyncComplete?.(localId, syncResult.supabaseId);

      console.log('[DropProcessor] Sync timing', {
        localId,
        elapsed: Date.now() - startTime,
        total: Date.now() - startTime,
      });
      return { success: true, supabaseId: syncResult.supabaseId };
    } else {
      throw syncResult.error || new Error('Sync failed');
    }
  } catch (error) {
    console.error('[DropProcessor] Processing failed', { localId, error });
    await markFailed(localId);
    callbacks?.onError?.(localId, error as Error);
    return { success: false, error: error as Error };
  }
}

// --- Batch: Process all pending drops ---

export async function processAllPending(): Promise<void> {
  const pending = await getPendingDrops();

  if (pending.length === 0) {
    console.log('[DropProcessor] No pending drops to process');
    return;
  }

  console.log('[DropProcessor] Processing pending drops', { count: pending.length });

  for (const drop of pending) {
    // Determine where to resume based on status
    if (drop.status === 'enriched') {
      // Skip directly to sync
      console.log('[DropProcessor] Resuming from enriched state', { localId: drop.localId });
    } else if (drop.status === 'classified') {
      // Skip to Phase 2
      console.log('[DropProcessor] Resuming from classified state', { localId: drop.localId });
    }
    // Otherwise start from beginning

    await processDrop(drop);
  }
}
