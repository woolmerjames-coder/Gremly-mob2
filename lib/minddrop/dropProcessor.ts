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
import { useGremlyStore } from '../store/useGremlyStore';
import { eventBus } from '../events/EventBus';
import { supabase } from '../supabase/client';
import { dateService } from '../date/DateService';
import { buildTodoFields } from '../cortex/textNormalization';
import { parseFrequencyString } from '../habits/frequencyUtils';
import { env, getEnv } from '../env';

// --- Types ---

/** Phase 2 enrichment result (metadata fields only, no smart_title/confirmation_message) */
export interface Phase2MetadataResult {
  tags: string[];
  time_estimate_minutes: number | null;
  time_window: 'morning' | 'day' | 'evening' | null;
  extracted_date: string | null;
  extracted_start_date: string | null;
  extracted_frequency: string | null;
  extracted_days: number[] | null;
  people: string[];
  mood: string[] | null;
}

export interface ProcessingCallbacks {
  onPhase0Complete?: (localId: string, isMulti: boolean) => void;
  onPhase1Complete?: (localId: string, bucket: MindDropBucket) => void;
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

// --- Constants ---

const PHASE2_TIMEOUT_MS = 8000;

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

// --- Helper: Run Phase 2 (non-streaming) ---

async function runPhase2(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
): Promise<Phase2MetadataResult | null> {
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[DropProcessor] Missing cortex URL or anon key for Phase 2');
    return null;
  }

  // Create timeout promise
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), PHASE2_TIMEOUT_MS);
  });

  // Create API call promise
  const apiPromise = (async (): Promise<Phase2MetadataResult | null> => {
    try {
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          type: 'enrich-phase2',
          text,
          bucket,
          subtype,
        }),
      });

      if (!res.ok) {
        console.log('[DropProcessor] Phase 2 API returned non-ok status', { status: res.status });
        return null;
      }

      const json = await res.json();
      
      // Validate response has expected fields
      if (!json || typeof json !== 'object') {
        console.log('[DropProcessor] Phase 2 API returned invalid JSON');
        return null;
      }

      // Validate and cast time_window to valid values
      const validTimeWindows = ['morning', 'day', 'evening'] as const;
      const rawTimeWindow = json.time_window;
      const time_window = validTimeWindows.includes(rawTimeWindow) 
        ? (rawTimeWindow as 'morning' | 'day' | 'evening') 
        : null;

      return {
        tags: Array.isArray(json.tags) ? json.tags : [],
        time_estimate_minutes: json.time_estimate_minutes ?? null,
        time_window,
        extracted_date: json.extracted_date ?? null,
        extracted_start_date: json.extracted_start_date ?? null,
        extracted_frequency: json.extracted_frequency ?? null,
        extracted_days: json.extracted_days ?? null,
        people: Array.isArray(json.people) ? json.people : [],
        mood: json.mood ?? null,
      };
    } catch (err) {
      console.log('[DropProcessor] Phase 2 API error', { error: String(err) });
      return null;
    }
  })();

  // Race API call against timeout
  const result = await Promise.race([apiPromise, timeoutPromise]);
  
  if (!result) {
    console.log('[DropProcessor] Phase 2 timeout or error');
  }
  
  return result;
}

// --- Helper: Sync single drop to Supabase ---

async function syncDropToSupabase(
  drop: QueuedDrop,
  enrichment: Phase2MetadataResult | null,
): Promise<SyncResult> {
  const { localId, text, spaceId, source, bucket, subtype, habitSubtype, smartTitle, confirmationMessage } = drop;

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
        name: smartTitle || parsedFields.title || text.substring(0, 60),
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
          confirmation_message: confirmationMessage,
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
        name: smartTitle || text.substring(0, 60),
        title: smartTitle || text.substring(0, 60),
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
          confirmation_message: confirmationMessage,
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
        title: smartTitle || text.substring(0, 60),
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
          confirmation_message: confirmationMessage,
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

      // Build initial segments with Phase 0 data (likelyBucket before Phase 1 confirmation)
      const initialSegments = multiResult.segments.map((seg) => ({
        text: seg.text,
        bucket: (seg.likely_bucket || 'log') as 'todo' | 'habit' | 'log',
        subtype: (seg.likely_subtype || null) as 'journal' | 'idea' | 'general' | null,
        likelyBucket: seg.likely_bucket,
        likelySubtype: seg.likely_subtype,
        confirmed: false, // Not yet confirmed by Phase 1
      }));

      // IMMEDIATELY update Zustand with ALL multi-card info so UI shows multi-shape right away
      // This happens at ~700ms when Phase 0 returns
      useGremlyStore.getState().updatePendingDropEnrichment(localId, {
        isMulti: true,
        multiSegments: initialSegments,
        multiSummary: multiResult.summary || text.substring(0, 60),
        dominantBucket: (multiResult.dominant_bucket || 'log') as 'todo' | 'habit' | 'log',
        dominantSubtype: (multiResult.dominant_subtype || null) as 'journal' | 'idea' | 'general' | null,
        status: 'classifying', // Still classifying segments
      });

      console.log('[DropProcessor] Multi-drop Zustand update complete', {
        localId,
        elapsed: Date.now() - startTime,
        segmentCount: initialSegments.length,
      });

      // Fire callback IMMEDIATELY so UI knows this is multi (~700ms)
      callbacks?.onPhase0Complete?.(localId, true);

      console.log('[DropProcessor] Phase 0 complete callback fired (multi)', {
        localId,
        elapsed: Date.now() - startTime,
      });

      // THEN run Phase 1 on each segment for accurate classification (async, ~2s more)
      const classifiedSegments = await Promise.all(
        multiResult.segments.map(async (seg, index) => {
          const phase1 = await runPhase1(seg.text, { hasAttachments: false });
          
          // Update this segment in Zustand as Phase 1 confirms it
          const currentDrop = useGremlyStore.getState().pendingDrops.get(localId);
          if (currentDrop?.multiSegments) {
            const updatedSegments = [...currentDrop.multiSegments];
            updatedSegments[index] = {
              ...updatedSegments[index],
              bucket: phase1.bucket,
              subtype: phase1.subtype,
              confirmed: true, // Now confirmed by Phase 1
            };
            useGremlyStore.getState().updatePendingDropEnrichment(localId, {
              multiSegments: updatedSegments,
            });
          }
          
          return {
            text: seg.text,
            bucket: phase1.bucket,
            subtype: phase1.subtype,
            habitSubtype: phase1.habitSubtype,
          };
        }),
      );

      console.log('[DropProcessor] Phase 1 segments complete', {
        localId,
        elapsed: Date.now() - startTime,
      });

      // Update status to enriching now that Phase 1 is done
      useGremlyStore.getState().updatePendingDropEnrichment(localId, {
        status: 'enriching',
      });

      // CHECKPOINT 1 (for multi): Save multi-detection results before sync
      await updateDrop(localId, {
        isMulti: true,
        multiSegments: classifiedSegments,
        multiSummary: multiResult.summary,
        dominantBucket: multiResult.dominant_bucket as MindDropBucket,
        dominantSubtype: multiResult.dominant_subtype as LogSubtype | null,
        status: 'classified', // Clear checkpoint status
      });

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

    // CHECKPOINT 1: Save classification results (and early enrichment fields if present)
    // This is the first save - protects expensive Phase 1 AI work
    await updateDrop(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
      habitSubtype: phase1Result.habitSubtype,
      confidence: phase1Result.confidence,
      // Phase 1 now returns early enrichment fields for faster typewriter animation
      ...(phase1Result.smart_title && { smartTitle: phase1Result.smart_title }),
      ...(phase1Result.confirmation_message && { confirmationMessage: phase1Result.confirmation_message }),
      status: 'classified', // Clear checkpoint status
    });

    // Update Zustand for immediate UI feedback (in-memory, instant)
    useGremlyStore.getState().updatePendingDropClassification(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
    });

    // If Phase 1 returned early enrichment fields, push them to Zustand immediately
    // This allows typewriter animation to start after Phase 1 (~1.5s) instead of Phase 2 (~4s)
    if (phase1Result.smart_title || phase1Result.confirmation_message) {
      const earlyEnrichment: Record<string, string | null> = {};
      if (phase1Result.smart_title) {
        earlyEnrichment.smartTitle = phase1Result.smart_title;
      }
      if (phase1Result.confirmation_message) {
        earlyEnrichment.confirmationMessage = phase1Result.confirmation_message;
      }
      useGremlyStore.getState().updatePendingDropEnrichment(localId, earlyEnrichment);
    }

    callbacks?.onPhase1Complete?.(localId, phase1Result.bucket);

    // =========================================
    // PHASE 2: Enrichment (non-streaming)
    // Simple JSON request/response for metadata fields
    // smart_title and confirmation_message already came from Phase 1
    // =========================================

    const enrichmentResult = await runPhase2(
      text,
      phase1Result.bucket,
      phase1Result.subtype,
    );

    console.log('[DropProcessor] Phase 2 timing', { localId, elapsed: Date.now() - startTime });

    // Update Zustand with metadata fields (time estimate, tags, frequency, etc.)
    if (enrichmentResult) {
      useGremlyStore.getState().updatePendingDropEnrichment(localId, {
        tags: enrichmentResult.tags,
        timeEstimateMinutes: enrichmentResult.time_estimate_minutes,
        timeWindow: enrichmentResult.time_window,
        extractedFrequency: enrichmentResult.extracted_frequency,
        extractedDays: enrichmentResult.extracted_days,
      });
    }

    // CHECKPOINT 2: Save ALL enrichment results in ONE write
    // Note: smart_title and confirmation_message already saved with Phase 1
    if (enrichmentResult) {
      await updateDrop(localId, {
        tags: enrichmentResult.tags,
        timeEstimateMinutes: enrichmentResult.time_estimate_minutes,
        timeWindow: enrichmentResult.time_window,
        extractedDate: enrichmentResult.extracted_date,
        extractedStartDate: enrichmentResult.extracted_start_date,
        extractedFrequency: enrichmentResult.extracted_frequency,
        extractedDays: enrichmentResult.extracted_days,
        people: enrichmentResult.people,
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
        // Include Phase 1 smart title and confirmation message
        smartTitle: phase1Result.smart_title ?? undefined,
        confirmationMessage: phase1Result.confirmation_message ?? undefined,
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
