/**
 * Drop Processor - Orchestrates background processing of Mind Drops
 *
 * Processes drops from the queue through Phase 0 → 1 → 2 → Supabase sync
 * Updates Zustand store progressively for instant UI feedback
 */

import { type QueuedDrop, updateDrop, markSynced, markFailed, getPendingDrops } from './dropQueue';
import { detectMulti } from './detectMulti';
import { runPhase1 } from './phase1';
import type { MindDropBucket, LogSubtype } from './types';
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
            partialResult[field as keyof Phase2EnrichmentResult] = value as never;
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
        time_window: enrichment?.time_window || 'day',
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
        time_window: enrichment?.time_window || 'day',
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

    // Emit event for store and other listeners to pick up
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

    // Emit event for store and other listeners
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

  console.log('[DropProcessor] Processing drop', { localId, textPreview: text.substring(0, 30) });

  try {
    // --- Phase 0: Multi-entity detection ---
    await updateDrop(localId, { status: 'classifying' });

    const multiResult = await detectMulti(text);

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

      await updateDrop(localId, {
        isMulti: true,
        multiSegments: classifiedSegments,
        multiSummary: multiResult.summary,
        dominantBucket: multiResult.dominant_bucket as MindDropBucket,
        dominantSubtype: multiResult.dominant_subtype as LogSubtype | null,
        status: 'syncing',
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
        await markSynced(localId, syncResult.supabaseId, 'note');
        useGremlyStore.getState().promotePendingDropToEntity(localId, syncResult.supabaseId);
        callbacks?.onSyncComplete?.(localId, syncResult.supabaseId);
        return { success: true, supabaseId: syncResult.supabaseId };
      } else {
        throw syncResult.error || new Error('Multi-drop sync failed');
      }
    }

    callbacks?.onPhase0Complete?.(localId, false);

    // --- Phase 1: Classification ---
    const phase1Result = await runPhase1(text, { hasAttachments: false });

    await updateDrop(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
      habitSubtype: phase1Result.habitSubtype,
      confidence: phase1Result.confidence,
      status: 'enriching',
    });

    // Update Zustand for immediate UI feedback
    useGremlyStore.getState().updatePendingDropClassification(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
    });

    callbacks?.onPhase1Complete?.(localId, phase1Result.bucket);

    // --- Phase 2: Enrichment ---
    const enrichmentResult = await runPhase2InMemory(
      text,
      phase1Result.bucket,
      phase1Result.subtype,
      (field, value) => {
        callbacks?.onPhase2Field?.(localId, field, value);
        useGremlyStore
          .getState()
          .updatePendingDropEnrichment(localId, { [field]: value } as Partial<
            import('../store/useGremlyStore').PendingDrop
          >);
      },
    );

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
      });
    }

    callbacks?.onPhase2Complete?.(localId);

    // --- Sync to Supabase ---
    await updateDrop(localId, { status: 'syncing' });

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
      await markSynced(localId, syncResult.supabaseId, syncResult.entityType!);
      useGremlyStore.getState().promotePendingDropToEntity(localId, syncResult.supabaseId);
      callbacks?.onSyncComplete?.(localId, syncResult.supabaseId);
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
    await processDrop(drop);
  }
}
