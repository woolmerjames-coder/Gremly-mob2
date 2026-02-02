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
import { shouldRunPhase1_5, runPhase1_5 } from '../ai/phase1_5';
import type { MindDropBucket, LogSubtype } from './types';
import { calculateBuffers } from '../planning';
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
  energy_type: 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick' | null;
  // Date Intelligence fields
  target_date: string | null;
  scheduled_date: string | null;
  event_time: string | null;
  date_type_ambiguous: boolean;
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

// --- Helper: Extract temporal info from text for Phase 1.5 ---

const TEMPORAL_PATTERN =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|tonight|next\s+week|this\s+week|next\s+month|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|\d{1,2}(st|nd|rd|th)?)\b/i;

function extractTemporal(text: string): string | null {
  const match = text.match(TEMPORAL_PATTERN);
  return match ? match[0] : null;
}

// --- Helper: Run Phase 1.5 in background (non-blocking) ---

/**
 * Runs Phase 1.5 clarification question generation in the background.
 * Does NOT block Phase 2 - fires and forgets.
 * When complete, updates Zustand with question/options for the popup.
 */
async function runPhase1_5InBackground(
  localId: string,
  text: string,
  ambiguityType: string,
  bucket: MindDropBucket,
  userSpaces: string[] = [],
): Promise<void> {
  const startTime = Date.now();
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  console.log('[DropProcessor] Phase 1.5 starting in background', {
    localId,
    text: text?.substring(0, 30),
    ambiguityType,
    bucket,
  });

  if (!cortexUrl || !anonKey) {
    console.log('[DropProcessor] Phase 1.5 skipped - missing cortex URL or anon key');
    return;
  }

  try {
    const detectedTemporal = extractTemporal(text);
    const currentDate = dateService.today();

    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        type: 'clarify-ambiguity',
        text,
        ambiguityType,
        detectedTemporal,
        currentDate,
        targetBucket: bucket,
        userSpaces,
      }),
    });

    if (!res.ok) {
      console.log('[DropProcessor] Phase 1.5 API error', { status: res.status });
      return;
    }

    const phase1_5Result = await res.json();
    const latencyMs = Date.now() - startTime;

    console.log('[DropProcessor] Phase 1.5 complete', {
      localId,
      success: phase1_5Result.success,
      reason: phase1_5Result.reason,
      question: phase1_5Result.clarification_question?.substring(0, 30),
      options_count: phase1_5Result.options?.length,
      latency_ms: latencyMs,
    });

    if (phase1_5Result.success && phase1_5Result.options?.length >= 2) {
      // Map options from worker format to client format
      // Worker returns: { id, label, bucket, subtype, space_suggestion }
      // Client expects: { id, label, action: { bucket, subtype, target_date, scheduled_date } }
      const clarificationOptions = phase1_5Result.options.map(
        (opt: {
          id: string;
          label: string;
          bucket: string;
          subtype: string | null;
          space_suggestion: string | null;
        }) => ({
          id: opt.id,
          label: opt.label,
          action: {
            bucket: opt.bucket || bucket,
            subtype: opt.subtype || null,
            target_date: false,
            scheduled_date: false,
          },
          space_suggestion: opt.space_suggestion || null,
        }),
      );

      // Try to update pending drop first
      const pendingDrop = useGremlyStore.getState().pendingDrops.get(localId);

      if (pendingDrop) {
        // Pending drop still exists - update it directly
        useGremlyStore.getState().updatePendingDropEnrichment(localId, {
          clarification_question: phase1_5Result.clarification_question,
          clarification_options: clarificationOptions,
        });

        console.log('[DropProcessor] Phase 1.5 pushed options to pending drop', {
          localId,
          optionLabels: phase1_5Result.options.map((o: { label: string }) => o.label),
        });
      } else {
        // Pending drop already synced - update the entity by drop_id
        console.log('[DropProcessor] Phase 1.5: pending drop already synced, updating entity', {
          localId,
        });

        const updated = await useGremlyStore.getState().updateEntityClarificationByDropId(localId, {
          question: phase1_5Result.clarification_question,
          options: clarificationOptions,
        });

        if (updated) {
          console.log('[DropProcessor] Phase 1.5 pushed options to synced entity', {
            localId,
            optionLabels: phase1_5Result.options.map((o: { label: string }) => o.label),
          });
        } else {
          console.warn('[DropProcessor] Phase 1.5 could not find entity to update', { localId });
        }
      }
    }
  } catch (error) {
    console.log('[DropProcessor] Phase 1.5 background error', {
      localId,
      error: String(error),
    });
    // Silent failure — user can still tap card, will see loading state
  }
}

// --- Helper: Run Phase 1.5a (title + confirmation message) ---

async function runPhase1_5a(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
): Promise<{ smart_title: string | null; confirmation_message: string | null } | null> {
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[DropProcessor] Missing cortex URL or anon key for Phase 1.5a');
    return null;
  }

  try {
    const t0 = Date.now();
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        type: 'enrich-phase1-5a',
        text,
        bucket,
        subtype,
      }),
    });

    if (!res.ok) {
      console.log('[DropProcessor] Phase 1.5a API returned non-ok status', { status: res.status });
      return null;
    }

    const json = await res.json();
    console.log('[DropProcessor] Phase 1.5a complete', {
      latency_ms: Date.now() - t0,
      has_title: !!json.smart_title,
      has_message: !!json.confirmation_message,
    });

    return {
      smart_title: json.smart_title || null,
      confirmation_message: json.confirmation_message || null,
    };
  } catch (err) {
    console.log('[DropProcessor] Phase 1.5a error', { error: String(err) });
    return null;
  }
}

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
      // Get date context for Phase 2 using DateService (timezone-safe)
      const currentDate = dateService.today(); // YYYY-MM-DD in local timezone
      const now = new Date();
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      console.log('[DropProcessor] Phase 2 calling with date context:', {
        currentDate,
        dayOfWeek,
        timezone,
      });

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
          currentDate,
          dayOfWeek,
          timezone,
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

      // Validate energy_type
      const validEnergyTypes = [
        'deep_focus',
        'administrative',
        'physical',
        'social',
        'quick',
      ] as const;
      const rawEnergyType = json.energy_type;
      const energy_type = validEnergyTypes.includes(rawEnergyType)
        ? (rawEnergyType as 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick')
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
        energy_type,
        // Date Intelligence fields
        target_date: json.target_date ?? null,
        scheduled_date: json.scheduled_date ?? null,
        event_time: json.event_time ?? null,
        date_type_ambiguous: json.date_type_ambiguous ?? false,
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
  const {
    localId,
    text,
    spaceId,
    source,
    bucket,
    subtype,
    habitSubtype,
    smartTitle,
    confirmationMessage,
  } = drop;

  const userId = useGremlyStore.getState().userId;
  if (!userId) {
    return { success: false, error: new Error('Not authenticated') };
  }

  if (!bucket) {
    return { success: false, error: new Error('No bucket classification') };
  }

  const now = new Date().toISOString();
  const today = dateService.today();

  // Debug: Log the full drop object to see what clarification fields are present
  console.log('[DropProcessor] Drop object before payload build:', {
    localId: drop.localId,
    // Log ALL possible clarification field names (both camelCase and snake_case)
    needsClarification: drop.needsClarification,
    needs_clarification: (drop as any).needs_clarification,
    clarificationType: drop.clarificationType,
    clarification_type: (drop as any).clarification_type,
    clarificationQuestion: drop.clarificationQuestion,
    clarification_question: (drop as any).clarification_question,
    clarificationOptions: drop.clarificationOptions?.length ?? 'undefined',
    clarification_options: (drop as any).clarification_options?.length ?? 'undefined',
    // Also check if it's nested somewhere
    dropKeys: Object.keys(drop),
  });

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

      // Calculate buffers based on energy type
      const buffers = calculateBuffers(
        enrichment?.energy_type ?? null,
        smartTitle || text,
        enrichment?.time_estimate_minutes ?? 30,
      );

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
        energy_type: enrichment?.energy_type || 'administrative',
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        due_day: dueDay,
        due_date: dueDay,
        due_time: parsedFields.dueTime || null,
        // Phase 2: Clarification fields (direct columns)
        needs_clarification: drop.needsClarification || false,
        clarification_type: drop.clarificationType || null,
        clarification_question: drop.clarificationQuestion || null,
        clarification_options: drop.clarificationOptions || null,
        clarification_resolved: false,
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: confirmationMessage,
          people: enrichment?.people?.length ? enrichment.people : undefined,
          // Date Intelligence fields (stored in views JSONB)
          target_date: enrichment?.target_date || null,
          scheduled_date: enrichment?.scheduled_date || null,
          date_type_ambiguous: enrichment?.date_type_ambiguous || false,
          // Phase 2: Clarification fields (also in views for redundancy)
          needs_clarification: drop.needsClarification || false,
          clarification_type: drop.clarificationType || null,
          clarification_question: drop.clarificationQuestion || null,
          clarification_options: drop.clarificationOptions || null,
          clarification_resolved: false,
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

      // Calculate buffers based on energy type
      const buffers = calculateBuffers(
        enrichment?.energy_type ?? null,
        smartTitle || text,
        enrichment?.time_estimate_minutes ?? 30,
      );

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
        energy_type: enrichment?.energy_type || 'administrative',
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        tags: enrichment?.tags || [],
        // Phase 2: Clarification fields (direct columns)
        needs_clarification: drop.needsClarification || false,
        clarification_type: drop.clarificationType || null,
        clarification_question: drop.clarificationQuestion || null,
        clarification_options: drop.clarificationOptions || null,
        clarification_resolved: false,
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: confirmationMessage,
          people: enrichment?.people?.length ? enrichment.people : undefined,
          // Phase 2: Clarification fields (also in views for redundancy)
          needs_clarification: drop.needsClarification || false,
          clarification_type: drop.clarificationType || null,
          clarification_question: drop.clarificationQuestion || null,
          clarification_options: drop.clarificationOptions || null,
          clarification_resolved: false,
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
        // Phase 2: Clarification fields (direct columns)
        needs_clarification: drop.needsClarification || false,
        clarification_type: drop.clarificationType || null,
        clarification_question: drop.clarificationQuestion || null,
        clarification_options: drop.clarificationOptions || null,
        clarification_resolved: false,
        views: {
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: confirmationMessage,
          people: enrichment?.people?.length ? enrichment.people : undefined,
          // Date Intelligence fields (stored in views JSONB)
          target_date: enrichment?.target_date || null,
          scheduled_date: enrichment?.scheduled_date || null,
          event_time: enrichment?.event_time || null,
          date_type_ambiguous: enrichment?.date_type_ambiguous || false,
          // Phase 2: Clarification fields (also in views for redundancy)
          needs_clarification: drop.needsClarification || false,
          clarification_type: drop.clarificationType || null,
          clarification_question: drop.clarificationQuestion || null,
          clarification_options: drop.clarificationOptions || null,
          clarification_resolved: false,
        },
        created_at: now,
        updated_at: now,
      };
    }

    console.log('[DropProcessor] Syncing to Supabase', { localId, table, entityType });

    // Debug: Log clarification fields being sent to Supabase
    console.log('[DropProcessor] Entity payload clarification fields:', {
      needs_clarification: (payload as any).needs_clarification,
      clarification_type: (payload as any).clarification_type,
      clarification_question: (payload as any).clarification_question,
      clarification_options_count: (payload as any).clarification_options?.length ?? 0,
    });

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
        dominantSubtype: (multiResult.dominant_subtype || null) as
          | 'journal'
          | 'idea'
          | 'general'
          | null,
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
          const segmentStartTime = Date.now();
          console.log('[DropProcessor:MultiPhase1] Starting segment', {
            localId,
            index,
            text: seg.text.substring(0, 30),
          });

          let phase1;
          try {
            phase1 = await runPhase1(seg.text, { hasAttachments: false });
          } catch (err) {
            console.error('[DropProcessor:MultiPhase1] Segment Phase1 failed', {
              localId,
              index,
              error: String(err),
              elapsed: Date.now() - segmentStartTime,
            });
            // Return a fallback instead of throwing
            phase1 = {
              bucket: (seg.likely_bucket || 'log') as 'todo' | 'habit' | 'log',
              subtype: (seg.likely_subtype || null) as 'journal' | 'idea' | 'general' | null,
              habitSubtype: null,
              smart_title: null,
              confirmation_message: null,
            };
          }

          console.log('[DropProcessor:MultiPhase1] Segment complete', {
            localId,
            index,
            bucket: phase1.bucket,
            smartTitle: phase1.smart_title?.substring(0, 20),
            elapsed: Date.now() - segmentStartTime,
          });

          // Update this segment in Zustand as Phase 1 confirms it
          // Use atomic updateMultiSegment to avoid race conditions with parallel updates
          try {
            useGremlyStore.getState().updateMultiSegment(localId, index, {
              bucket: phase1.bucket,
              subtype: phase1.subtype,
              confirmed: true, // Now confirmed by Phase 1
              smartTitle: phase1.smart_title ?? null,
              confirmationMessage: phase1.confirmation_message ?? null,
            });
            console.log('[DropProcessor:MultiPhase1] Zustand updated for segment', {
              localId,
              index,
              confirmed: true,
            });
          } catch (storeErr) {
            console.error('[DropProcessor:MultiPhase1] Zustand update failed', {
              localId,
              index,
              error: String(storeErr),
            });
          }

          return {
            text: seg.text,
            bucket: phase1.bucket,
            subtype: phase1.subtype,
            habitSubtype: phase1.habitSubtype,
            // Include Phase 1's smart_title and confirmation_message
            smart_title: phase1.smart_title ?? null,
            confirmation_message: phase1.confirmation_message ?? null,
          };
        }),
      );

      console.log('[DropProcessor] Phase 1 segments complete', {
        localId,
        elapsed: Date.now() - startTime,
        segmentTitles: classifiedSegments.map((s) => ({
          text: s.text.substring(0, 20),
          smart_title: s.smart_title,
          confirmation_message: s.confirmation_message?.substring(0, 30),
        })),
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

    console.log('[DropProcessor] Phase 1 complete', {
      localId,
      bucket: phase1Result.bucket,
      is_ambiguous: phase1Result.is_ambiguous,
      ambiguity_reason: phase1Result.ambiguity_reason,
      latency_ms: Date.now() - startTime,
    });

    // =========================================
    // UPDATE UI IMMEDIATELY with Phase 1 data
    // Card can now render with clarify badge if is_ambiguous
    // =========================================

    // Update Zustand for immediate UI feedback (in-memory, instant)
    useGremlyStore.getState().updatePendingDropClassification(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
    });

    // Push early enrichment AND ambiguity fields to Zustand
    // This allows:
    // 1. Clarify badge to appear immediately if is_ambiguous
    // Title and confirmation message now come from Phase 1.5a
    const earlyEnrichment: Record<string, unknown> = {};
    // NEW: Push ambiguity state for immediate UI feedback (clarify badge)
    if (phase1Result.is_ambiguous) {
      earlyEnrichment.needs_clarification = true;
      earlyEnrichment.ambiguity_reason = phase1Result.ambiguity_reason;
      earlyEnrichment.clarification_resolved = false;
      // Options will be populated by Phase 1.5 in background
      earlyEnrichment.clarification_question = null;
      earlyEnrichment.clarification_options = null;
    }
    if (Object.keys(earlyEnrichment).length > 0) {
      useGremlyStore.getState().updatePendingDropEnrichment(localId, earlyEnrichment);
    }

    callbacks?.onPhase1Complete?.(localId, phase1Result.bucket);

    // =========================================
    // PHASE 1.5: Clarification Question Generation
    // Runs in BACKGROUND if is_ambiguous - does NOT block Phase 2
    // =========================================

    // Fire and forget - Phase 1.5 runs in background, Phase 2 starts immediately
    if (phase1Result.is_ambiguous && phase1Result.ambiguity_type) {
      const spaceNames = Array.from(useGremlyStore.getState().spaces.values()).map((s) => s.name);
      runPhase1_5InBackground(
        localId,
        text,
        phase1Result.ambiguity_type,
        phase1Result.bucket,
        spaceNames,
      );
    }

    // CHECKPOINT 1: Save classification results (ambiguity fields saved, options come later)
    // This is the first save - protects expensive Phase 1 AI work
    await updateDrop(localId, {
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
      habitSubtype: phase1Result.habitSubtype,
      confidence: phase1Result.confidence,
      // Title and confirmation now come from Phase 1.5a (after this checkpoint)
      // Ambiguity detection (Phase 1.5 populates question/options in background)
      needs_clarification: phase1Result.is_ambiguous || false,
      ambiguity_reason: phase1Result.ambiguity_reason || null,
      // Options will be populated by Phase 1.5 asynchronously
      clarification_type: null,
      clarification_question: null,
      clarification_options: null,
      status: 'classified', // Clear checkpoint status
    });

    console.log('[DropQueue] Updated drop with classification', {
      localId,
      bucket: phase1Result.bucket,
      is_ambiguous: phase1Result.is_ambiguous,
      ambiguity_reason: phase1Result.ambiguity_reason,
    });

    // =========================================
    // PHASE 1.5a: Title + Confirmation Message
    // Runs for non-ambiguous items BEFORE Phase 2
    // =========================================

    let phase15aResult = null;

    if (!phase1Result.is_ambiguous) {
      phase15aResult = await runPhase1_5a(text, phase1Result.bucket, phase1Result.subtype);
      console.log('[DropProcessor] Phase 1.5a timing', {
        localId,
        elapsed: Date.now() - startTime,
      });

      // Update Zustand with title + confirmation for immediate typewriter animation
      // CRITICAL: Set minddrop_stage to 'streaming' to trigger card reveal
      if (phase15aResult) {
        useGremlyStore.getState().updatePendingDropEnrichment(localId, {
          smartTitle: phase15aResult.smart_title || undefined,
          confirmationMessage: phase15aResult.confirmation_message || undefined,
          minddrop_stage: 'streaming', // Triggers card reveal animation
        });

        // CRITICAL: Yield to the event loop so React can render the 'streaming' state
        // before Phase 2 starts. Without this, React batches all updates and only
        // renders once after Phase 2 completes, missing the typewriter animation.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // =========================================
    // PHASE 2: Enrichment (non-streaming)
    // SKIP for ambiguous items - Phase 2 will run after clarification
    // =========================================

    let enrichmentResult = null;

    if (phase1Result.is_ambiguous) {
      console.log(
        '[DropProcessor] Skipping Phase 2 for ambiguous item - will run after clarification',
        {
          localId,
          ambiguity_reason: phase1Result.ambiguity_reason,
        },
      );
      // Don't run Phase 2 yet - it will run after user clarifies
      // The card will show without metadata chips until then
    } else {
      enrichmentResult = await runPhase2(text, phase1Result.bucket, phase1Result.subtype);
      console.log('[DropProcessor] Phase 2 timing', { localId, elapsed: Date.now() - startTime });
    }

    // Update Zustand with ALL metadata fields (time estimate, tags, frequency, people, etc.)
    // CRITICAL: Set status to 'enriched' so UI knows ALL chip data is ready
    // This triggers the unified chip animation in Row3Chips
    if (enrichmentResult) {
      console.log('🟠 [DropProcessor] Phase 2 complete - updating Zustand', {
        localId,
        time_estimate: enrichmentResult.time_estimate_minutes,
        people: enrichmentResult.people,
        tags: enrichmentResult.tags,
        target_date: enrichmentResult.target_date,
      });
      useGremlyStore.getState().updatePendingDropEnrichment(localId, {
        status: 'enriched', // CRITICAL: Mark as fully enriched for chip animation
        tags: enrichmentResult.tags,
        timeEstimateMinutes: enrichmentResult.time_estimate_minutes,
        timeWindow: enrichmentResult.time_window,
        extractedDate: enrichmentResult.extracted_date, // For deadline chip
        extractedFrequency: enrichmentResult.extracted_frequency,
        extractedDays: enrichmentResult.extracted_days,
        people: enrichmentResult.people, // Include people for chip rendering
        mood: enrichmentResult.mood, // Include mood for journal chip rendering
        // Date Intelligence fields (snake_case to match PendingDrop interface)
        target_date: enrichmentResult.target_date,
        scheduled_date: enrichmentResult.scheduled_date,
        event_time: enrichmentResult.event_time,
        date_type_ambiguous: enrichmentResult.date_type_ambiguous,
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
        // Date Intelligence fields
        targetDate: enrichmentResult.target_date,
        scheduledDate: enrichmentResult.scheduled_date,
        eventTime: enrichmentResult.event_time,
        dateTypeAmbiguous: enrichmentResult.date_type_ambiguous,
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
        // Include Phase 1.5a smart title and confirmation message (NOT Phase 1)
        smartTitle: phase15aResult?.smart_title ?? undefined,
        confirmationMessage: phase15aResult?.confirmation_message ?? undefined,
        // Include ambiguity detection from Phase 1
        // Note: question/options may still be loading from Phase 1.5 background task
        needsClarification: phase1Result.is_ambiguous || false,
        ambiguityReason: phase1Result.ambiguity_reason || null,
        // Get latest clarification data from Zustand (Phase 1.5 may have updated it)
        clarificationQuestion:
          useGremlyStore.getState().pendingDrops.get(localId)?.clarification_question || null,
        clarificationOptions:
          useGremlyStore.getState().pendingDrops.get(localId)?.clarification_options || null,
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
