/**
 * dropSync.ts — Supabase sync for Mind Drop pipeline
 *
 * Extracted from dropProcessor.ts. Handles writing classified + enriched drops
 * to Supabase as todos, habits, or notes.
 *
 * Used by: dropPhases.ts (handleEnriched phase)
 */

import type { QueuedDrop } from './dropQueue';
import { useGremlyStore } from '../store/useGremlyStore';
import { supabase } from '../supabase/client';
import { dateService, nowTimestamp } from '../date/DateService';
import { parseFrequencyString } from '../habits/frequencyUtils';
import { calculateBuffers } from '../planning';
import { eventBus } from '../events/EventBus';

/** Phase 2 enrichment result (metadata fields only) */
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
  priority_kind: 'action' | 'blocker' | 'waiting' | 'decision' | 'momentum' | null;
  target_date: string | null;
  scheduled_date: string | null;
  event_time: string | null;
  date_type_ambiguous: boolean;
  end_date: string | null;
  smart_title: string | null;
  dateConfidence: 'verified' | 'llm_only' | 'chrono_override' | null;
}

export interface SyncResult {
  success: boolean;
  supabaseId?: string;
  entityType?: 'todo' | 'habit' | 'note';
  error?: Error;
}

// --- Helper: Sync single drop to Supabase ---

export async function syncDropToSupabase(
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

  const now = nowTimestamp();
  const today = dateService.today();
  // When caller provides dueDayOverride (e.g. "Plan tomorrow" mode), use that
  // instead of today's date for source === 'today' items.
  const effectiveDueDay = drop.dueDayOverride || today;

  const hasAIDates = !!(
    enrichment?.target_date ||
    enrichment?.scheduled_date ||
    enrichment?.extracted_date ||
    enrichment?.extracted_start_date ||
    enrichment?.end_date
  );

  try {
    let table: string;
    let payload: Record<string, unknown>;
    let entityType: 'todo' | 'habit' | 'note';

    if (bucket === 'todo') {
      table = 'todos';
      entityType = 'todo';

      const dueDay =
        enrichment?.target_date ||
        enrichment?.scheduled_date ||
        enrichment?.extracted_date?.split('T')[0] ||
        (source === 'today' ? effectiveDueDay : null);

      // Calculate buffers based on energy type
      const buffers = calculateBuffers(
        enrichment?.energy_type ?? null,
        smartTitle || text,
        enrichment?.time_estimate_minutes ?? 30,
      );

      payload = {
        owner_id: userId,
        name: smartTitle || text.substring(0, 60),
        body: text,
        space_id: spaceId,
        drop_id: localId,
        origin: source === 'space' ? 'space_chat' : 'catchall',
        tags: enrichment?.tags || [],
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        time_window: enrichment?.time_window || null,
        energy_type: enrichment?.energy_type || 'administrative',
        priority_kind: enrichment?.priority_kind ?? null,
        priority_kind_source: enrichment?.priority_kind ? 'classifier' : null,
        priority_kind_updated_at: enrichment?.priority_kind ? nowTimestamp() : null,
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        due_day: dueDay,
        due_date: dueDay,
        due_time: enrichment?.event_time || null,
        // Date Intelligence — top-level columns (not just views)
        target_date: enrichment?.target_date || null,
        scheduled_date: enrichment?.scheduled_date || null,
        // Date verification metadata
        captured_at: hasAIDates ? nowTimestamp() : null,
        date_confidence: hasAIDates ? enrichment?.dateConfidence || null : null,
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
          ai_degraded: drop.classificationDegraded || false,
          classification_source: drop.classificationSource || 'unknown',
        },
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
        start_date:
          enrichment?.extracted_start_date || (source === 'today' ? effectiveDueDay : null),
        time_window: enrichment?.time_window || 'day', // Default to 'day' to fix NOT NULL constraint
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        energy_type: enrichment?.energy_type || 'administrative',
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        tags: enrichment?.tags || [],
        // Date verification metadata
        captured_at: hasAIDates ? nowTimestamp() : null,
        date_confidence: hasAIDates ? enrichment?.dateConfidence || null : null,
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
          ai_degraded: drop.classificationDegraded || false,
          classification_source: drop.classificationSource || 'unknown',
        },
        updated_at: now,
      };
    } else {
      // log (note)
      table = 'notes';
      entityType = 'note';

      const noteSubtype =
        subtype === 'event'
          ? 'event'
          : subtype === 'journal'
            ? 'journal'
            : subtype === 'idea'
              ? 'idea'
              : 'catchall';

      payload = {
        owner_id: userId,
        title:
          noteSubtype === 'event' && enrichment?.smart_title
            ? enrichment.smart_title
            : smartTitle || text.substring(0, 60),
        body: text,
        subtype: noteSubtype,
        space_id: spaceId,
        drop_id: localId,
        origin: source === 'space' ? 'space_chat' : 'catchall',
        tags: enrichment?.tags || [],
        mood: enrichment?.mood || null,
        // Event fields (top-level columns)
        target_date: enrichment?.target_date || null,
        end_date: enrichment?.end_date || null,
        event_time: enrichment?.event_time || null,
        is_goal: false,
        // Date verification metadata
        captured_at: hasAIDates ? nowTimestamp() : null,
        date_confidence: hasAIDates ? enrichment?.dateConfidence || null : null,
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
          // Keep date intelligence in views as well for backwards compatibility
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
          ai_degraded: drop.classificationDegraded || false,
          classification_source: drop.classificationSource || 'unknown',
        },
        updated_at: now,
      };
    }

    if (drop.classificationDegraded) {
      console.warn('[DropSync] Syncing degraded classification', {
        localId,
        bucket,
        source: drop.classificationSource,
      });
    }

    console.log('[DropSync] Syncing to Supabase', { localId, table, entityType });

    const { data, error } = await supabase.from(table).insert(payload).select().single();

    if (error) {
      // Handle crash-recovery: row already exists from a prior attempt that
      // succeeded on Supabase but the app was killed before local dequeue.
      if (error.code === '23505') {
        console.warn('[DropSync] Duplicate drop detected, fetching existing row', { localId });
        const { data: existing } = await supabase
          .from(table)
          .select('id')
          .eq('owner_id', payload.owner_id as string)
          .eq('drop_id', payload.drop_id as string)
          .single();
        if (existing) {
          return { success: true, supabaseId: existing.id, entityType };
        }
      }
      console.error('[DropSync] Supabase insert failed:', error);
      return { success: false, error };
    }

    console.log('[DropSync] Synced successfully', { localId, supabaseId: data.id });

    // Add to Zustand store using set() pattern
    if (entityType === 'todo') {
      useGremlyStore.setState((state) => ({
        todos: [
          ...state.todos,
          { ...data, type: 'todo' as const, reminders: data.reminders_json ?? [] },
        ],
      }));
    } else if (entityType === 'habit') {
      useGremlyStore.setState((state) => ({
        habits: [
          ...state.habits,
          { ...data, type: 'habit' as const, reminders: data.reminders_json ?? [] },
        ],
      }));
    } else {
      useGremlyStore.setState((state) => ({
        notes: [
          ...state.notes,
          { ...data, type: 'note' as const, reminders: data.reminders_json ?? [] },
        ],
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
    console.error('[DropSync] Sync exception:', error);
    return { success: false, error: error as Error };
  }
}

// --- Helper: Sync multi-drop to Supabase ---

export async function syncMultiDropToSupabase(drop: QueuedDrop): Promise<SyncResult> {
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

  const now = nowTimestamp();

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
      updated_at: now,
    };

    const { data, error } = await supabase.from('notes').insert(payload).select().single();

    if (error) {
      // Handle crash-recovery: row already exists from a prior attempt that
      // succeeded on Supabase but the app was killed before local dequeue.
      if (error.code === '23505') {
        console.warn('[DropSync] Duplicate multi-drop detected, fetching existing row', {
          localId,
        });
        const { data: existing } = await supabase
          .from('notes')
          .select('id')
          .eq('owner_id', payload.owner_id as string)
          .eq('drop_id', payload.drop_id as string)
          .single();
        if (existing) {
          return { success: true, supabaseId: existing.id, entityType: 'note' };
        }
      }
      console.error('[DropSync] Multi-drop sync failed:', error);
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
