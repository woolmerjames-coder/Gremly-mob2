/**
 * dropPipeline.ts — Queue runner for the drop pipeline state machine
 *
 * Replaces the monolithic processDrop from dropProcessor.ts.
 * Processes drops by advancing each one phase at a time.
 * Multiple drops process concurrently. One hung drop never blocks another.
 *
 * Two trigger modes:
 * - Event-driven: triggerProcessing() called when a new drop is enqueued
 * - Tick fallback: sweeps every 2s for retries, multi_awaiting checks, crash recovery
 */

import {
  type QueuedDrop,
  type DropPhase,
  getQueue,
  saveDrop,
  dequeue,
  migrateDropPhases,
} from './dropQueue';
import { getPhaseHandler } from './dropPhases';
import { useGremlyStore } from '../store/useGremlyStore';
import type { PendingDrop } from '../store/useGremlyStore';
import { runPhase1 } from './phase1';
import { supabase } from '../supabase/client';
import { nowTimestamp, getDateService } from '../date/DateService';
import { eventBus } from '../events/EventBus';
import { networkStatus } from '../network/NetworkStatus';
import { scheduleItemReminder, scheduleQuickReminder } from '../notifications/itemReminderService';
import { hasNotificationPermission } from '../../src/utils/notifications';
import { dateService } from '../date/DateService';
import type { ItemReminder } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 2000; // fallback sweep interval
const MAX_CONCURRENT = 3; // max drops processing simultaneously
const MAX_RETRIES_PER_PHASE = 3; // retries before moving to 'failed'
const RETRY_DELAYS = [0, 3000, 8000]; // delays: instant, 3s, 8s

// ──────────────────────────────────────────────────────────────────────────────
// Runner State
// ──────────────────────────────────────────────────────────────────────────────

let isRunning = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const processing = new Set<string>();
let lastQueueEmpty = false;
let lastEnqueueTime = 0;

// ──────────────────────────────────────────────────────────────────────────────
// Phase → UI State Mapping
// ──────────────────────────────────────────────────────────────────────────────

function phaseToUIStatus(phase: DropPhase): PendingDrop['status'] {
  switch (phase) {
    case 'queued':
      return 'classifying';
    case 'classified':
      return 'classified';
    case 'titled':
      return 'enriching';
    case 'enriched':
      return 'enriched';
    case 'syncing':
      return 'syncing';
    case 'complete':
      return 'synced';
    case 'failed':
      return 'failed';
    case 'multi_detected':
      return 'classifying';
    case 'multi_awaiting':
      return 'enriching';
    default:
      return 'pending';
  }
}

function phaseToUIStage(phase: DropPhase): PendingDrop['minddrop_stage'] {
  switch (phase) {
    case 'queued':
      return 'classifying';
    case 'classified':
      return 'classifying';
    case 'titled':
      return 'streaming'; // triggers card reveal animation
    case 'enriched':
      return 'enriched';
    case 'syncing':
      return 'enriched';
    case 'complete':
      return 'enriched';
    case 'failed':
      return 'enrichment_failed';
    case 'multi_detected':
      return 'classifying';
    case 'multi_awaiting':
      return 'enriching';
    default:
      return 'pending';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// syncDropToZustand — Push pipeline state to UI
// ──────────────────────────────────────────────────────────────────────────────

function syncDropToZustand(drop: QueuedDrop): void {
  const phase = drop.phase || 'queued';
  const uiStatus = phaseToUIStatus(phase);
  const uiStage = phaseToUIStage(phase);

  // Check if this pending drop exists in Zustand
  const exists = useGremlyStore.getState().pendingDrops.has(drop.localId);
  if (!exists) {
    // Drop was already promoted or removed — skip Zustand update
    console.warn(
      '[Pipeline] syncDropToZustand: pending drop missing from store — card may appear stuck',
      {
        localId: drop.localId,
        phase: drop.phase || 'unknown',
      },
    );
    return;
  }

  useGremlyStore.getState().updatePendingDropEnrichment(drop.localId, {
    status: uiStatus,
    minddrop_stage: uiStage,
    bucket: drop.bucket,
    subtype: drop.subtype,
    smartTitle: drop.smartTitle,
    confirmationMessage: drop.confirmationMessage ?? undefined,
    tags: drop.tags,
    timeEstimateMinutes: drop.timeEstimateMinutes,
    timeWindow: drop.timeWindow,
    extractedDate: drop.extractedDate,
    extractedFrequency: drop.extractedFrequency,
    extractedDays: drop.extractedDays,
    people: drop.people,
    mood: drop.mood,
    target_date: drop.targetDate,
    scheduled_date: drop.scheduledDate,
    event_time: drop.eventTime,
    date_type_ambiguous: drop.dateTypeAmbiguous,
    needs_clarification: drop.needsClarification,
    ambiguity_reason: drop.ambiguityReason,
    plausible_interpretations: drop.plausibleInterpretations as any,
    isMulti: drop.isMulti,
    multiSegments: drop.multiSegments,
    multiSummary: drop.multiSummary,
    dominantBucket: drop.dominantBucket as any,
    dominantSubtype: drop.dominantSubtype as any,
    _retryable: phase === 'failed',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// handleComplete — Terminal handler
// ──────────────────────────────────────────────────────────────────────────────

async function handleComplete(drop: QueuedDrop): Promise<void> {
  // 1. Promote pending drop to entity in Zustand
  if (drop.supabaseId) {
    useGremlyStore.getState().promotePendingDropToEntity(drop.localId, drop.supabaseId);
  }

  // 2. Remove from AsyncStorage queue
  await dequeue(drop.localId);

  // 3. Increment drop count for gauge / ritual progress
  try {
    const { didAgeUp, newAge } = await useGremlyStore.getState().incrementDropCount();
    if (didAgeUp) {
      console.log('[Pipeline] Gremly aged up to', newAge);
    }
  } catch (err) {
    console.warn('[Pipeline] Failed to increment drop count', { error: String(err) });
  }

  // 4. Schedule auto-reminder if Phase 2b detected one (fire-and-forget)
  // Note: entity:created event is already emitted by syncDropToSupabase with full data
  if (drop.autoReminder && drop.supabaseId && drop.entityType) {
    void scheduleAutoReminderForDrop(drop);
  }

  console.log('[Pipeline] Drop complete', {
    localId: drop.localId,
    supabaseId: drop.supabaseId,
    entityType: drop.entityType,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-Reminder Scheduling (fire and forget)
// ──────────────────────────────────────────────────────────────────────────────

async function scheduleAutoReminderForDrop(drop: QueuedDrop): Promise<void> {
  try {
    const entityType = drop.entityType!;
    const entityId = drop.supabaseId!;

    // Skip external calendar events
    if (entityType === 'note') {
      const note = useGremlyStore.getState().notes.find((n) => n.id === entityId);
      if (note?.external_source != null) return;
    }

    const itemTitle = drop.smartTitle || drop.text.substring(0, 60);
    const reminderEntityType: 'todo' | 'habit' = entityType === 'habit' ? 'habit' : 'todo';
    const frequency = drop.reminderFrequency === 'daily' ? ('daily' as const) : ('once' as const);
    const hasDate = !!drop.reminderDate;

    const reminderToSave: ItemReminder = hasDate
      ? {
          id: `auto-${getDateService().now().getTime()}`,
          time: drop.reminderTime || '09:00',
          frequency,
          date: frequency === 'once' ? drop.reminderDate! : undefined,
        }
      : {
          id: `auto-quick-${getDateService().now().getTime()}`,
          time: new Date(getDateService().now().getTime() + 2 * 60 * 60 * 1000)
            .toTimeString()
            .slice(0, 5),
          frequency: 'once' as const,
          date: dateService.today(),
        };

    // Persist to Supabase
    const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
    await supabase
      .from(table)
      .update({ reminders_json: [reminderToSave], updated_at: nowTimestamp() })
      .eq('id', entityId);

    // Update Zustand
    const storeKey = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
    useGremlyStore.setState((state) => ({
      [storeKey]: (state[storeKey] as any[]).map((item: any) =>
        item.id === entityId ? { ...item, reminders: [reminderToSave] } : item,
      ),
    }));

    console.log('[Pipeline] Auto-reminder saved', {
      entityId,
      date: reminderToSave.date,
      time: reminderToSave.time,
    });

    // Schedule OS notification (best-effort)
    const schedulePromise = hasDate
      ? scheduleItemReminder(entityId, itemTitle, reminderEntityType, reminderToSave)
      : scheduleQuickReminder(entityId, itemTitle, reminderEntityType, 2 * 60 * 60);

    const notificationId = await schedulePromise;
    if (notificationId) {
      const updatedReminder = { ...reminderToSave, notificationId };
      await supabase
        .from(table)
        .update({ reminders_json: [updatedReminder], updated_at: nowTimestamp() })
        .eq('id', entityId);

      useGremlyStore.setState((state) => ({
        [storeKey]: (state[storeKey] as any[]).map((item: any) =>
          item.id === entityId ? { ...item, reminders: [updatedReminder] } : item,
        ),
      }));

      // Prompt for permission if needed
      const hasPerm = await hasNotificationPermission();
      if (!hasPerm) {
        eventBus.emit('notification:permission_prompt', { context: 'reminder' });
      }
    }
  } catch (err) {
    console.warn('[Pipeline] Auto-reminder failed', { error: String(err) });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// processOne — Advance one drop by one phase
// ──────────────────────────────────────────────────────────────────────────────

async function processOne(drop: QueuedDrop): Promise<void> {
  const phase = drop.phase || 'queued';
  processing.add(drop.localId);

  try {
    const handler = getPhaseHandler(phase);
    if (!handler) {
      // Terminal phase or unknown — nothing to do
      return;
    }

    // Mark attempt
    drop.lastAttemptAt = getDateService().now().toISOString();

    const updated = await handler(drop);

    if (updated.phase !== phase) {
      // Phase advanced — persist + update UI
      updated.retryCount = 0;
      updated.lastError = null;
      await saveDrop(updated.localId, updated);
      syncDropToZustand(updated);

      console.log('[Pipeline] Phase advanced', {
        localId: updated.localId,
        from: phase,
        to: updated.phase,
      });

      // Terminal handler
      if (updated.phase === 'complete') {
        await handleComplete(updated);
      }

      // Immediately process next phase of same drop — no tick delay.
      // Each phase still has its own timeout and error boundary via the
      // recursive processOne call. The tick interval is now only a fallback
      // sweep for retries, crash recovery, and multi_awaiting checks.
      if (updated.phase !== 'complete' && updated.phase !== 'failed') {
        await processOne(updated);
      }
    } else {
      // Phase didn't change (e.g. multi_awaiting with children still processing)
      // Just persist the lastAttemptAt update
      await saveDrop(updated.localId, updated);
    }
  } catch (error) {
    // Phase handler threw — increment retry
    const retryCount = (drop.retryCount || 0) + 1;
    const errorMsg = String(error).substring(0, 200);

    console.warn('[Pipeline] Phase failed', {
      localId: drop.localId,
      phase,
      retryCount,
      error: errorMsg,
    });

    if (retryCount >= MAX_RETRIES_PER_PHASE) {
      // Max retries — move to failed
      const failedDrop: QueuedDrop = {
        ...drop,
        phase: 'failed',
        status: 'failed',
        failedAtPhase: phase,
        retryCount,
        lastError: errorMsg,
      };
      await saveDrop(failedDrop.localId, failedDrop);
      syncDropToZustand(failedDrop);

      console.error('[Pipeline] Drop failed permanently', {
        localId: drop.localId,
        phase,
        retryCount,
        error: errorMsg,
      });
    } else {
      // Save retry state — will be picked up on next tick after delay
      const retryDrop: QueuedDrop = {
        ...drop,
        retryCount,
        lastError: errorMsg,
        lastAttemptAt: getDateService().now().toISOString(),
      };
      await saveDrop(retryDrop.localId, retryDrop);
      // Update Zustand to keep UI in sync (same phase, but shows error info)
      syncDropToZustand(retryDrop);
    }
  } finally {
    processing.delete(drop.localId);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// isReadyForProcessing — Retry delay check
// ──────────────────────────────────────────────────────────────────────────────

function isReadyForProcessing(drop: QueuedDrop): boolean {
  // Don't attempt if offline — drops stay at their current phase
  // and will be processed when connectivity returns
  if (!networkStatus.isConnected) return false;

  const phase = drop.phase || 'queued';

  // Terminal phases — skip
  if (phase === 'complete' || phase === 'failed') return false;

  // Already being processed — skip
  if (processing.has(drop.localId)) return false;

  // First attempt or retryCount is 0 — ready immediately
  if (!drop.retryCount || drop.retryCount === 0) return true;

  // Check retry delay
  if (drop.retryCount >= MAX_RETRIES_PER_PHASE) return false;

  const delay = RETRY_DELAYS[Math.min(drop.retryCount, RETRY_DELAYS.length - 1)];
  const lastAttempt = drop.lastAttemptAt ? Date.parse(drop.lastAttemptAt) : 0;
  return getDateService().now().getTime() - lastAttempt >= delay;
}

// ──────────────────────────────────────────────────────────────────────────────
// tick — Process all actionable drops
// ──────────────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    // Skip AsyncStorage read if queue was empty last time and no new drops enqueued
    if (lastQueueEmpty && getDateService().now().getTime() - lastEnqueueTime > TICK_INTERVAL_MS) {
      return;
    }

    const drops = await getQueue();

    if (drops.length === 0) {
      lastQueueEmpty = true;
      return;
    }
    lastQueueEmpty = false;

    const actionable = drops.filter((d) => isReadyForProcessing(d));

    if (actionable.length === 0) return;

    // Process up to MAX_CONCURRENT
    const slotsAvailable = MAX_CONCURRENT - processing.size;
    if (slotsAvailable <= 0) return;

    const batch = actionable.slice(0, slotsAvailable);

    await Promise.all(batch.map((drop) => processOne(drop)));
  } catch (err) {
    console.warn('[Pipeline] Tick error', { error: String(err) });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Queue Runner — Start / Stop / Trigger
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Start the queue runner. Safe to call multiple times — only starts once.
 * Runs migration on first start to add phase fields to existing drops.
 */
export async function startQueueRunner(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  // Migrate existing drops (one-time, idempotent)
  await migrateDropPhases();

  // Initial sweep
  await tick();

  // Start tick interval for retries, multi_awaiting, crash recovery
  tickTimer = setInterval(() => {
    if (isRunning) {
      void tick();
    }
  }, TICK_INTERVAL_MS);

  console.log('[Pipeline] Queue runner started');
}

/**
 * Stop the queue runner. Called when app goes to background.
 */
export function stopQueueRunner(): void {
  isRunning = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  console.log('[Pipeline] Queue runner stopped');
}

/**
 * Event-driven trigger — called immediately when a new drop is enqueued.
 * Runs a tick without waiting for the interval.
 * Safe to call even if the runner isn't started (no-op).
 */
export async function triggerProcessing(): Promise<void> {
  if (!isRunning) return;
  lastQueueEmpty = false; // Force next tick to read queue
  lastEnqueueTime = getDateService().now().getTime();
  await tick();
}

// ──────────────────────────────────────────────────────────────────────────────
// retryDrop — User taps retry on a failed card
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reset a failed drop to its failedAtPhase so it can be reprocessed.
 * Called when the user taps the retry button on a failed card.
 */
export async function retryDrop(localId: string): Promise<void> {
  const queue = await getQueue();
  const drop = queue.find((d) => d.localId === localId);

  if (!drop || drop.phase !== 'failed') {
    console.warn('[Pipeline] retryDrop: drop not found or not failed', { localId });
    return;
  }

  const resumePhase = drop.failedAtPhase || 'queued';

  const retriedDrop: QueuedDrop = {
    ...drop,
    phase: resumePhase,
    retryCount: 0,
    lastError: null,
    lastAttemptAt: undefined,
  };

  await saveDrop(retriedDrop.localId, retriedDrop);
  syncDropToZustand(retriedDrop);

  console.log('[Pipeline] Drop retried', { localId, resumePhase });

  // Trigger immediate processing
  void triggerProcessing();
}

// ──────────────────────────────────────────────────────────────────────────────
// reclassifyDegradedEntities — Background reclassification
// ──────────────────────────────────────────────────────────────────────────────

export async function reclassifyDegradedEntities(): Promise<void> {
  const store = useGremlyStore.getState();
  const userId = store.userId;
  if (!userId) return;

  if (!networkStatus.isConnected) {
    console.log('[Reclassify] Offline, skipping');
    return;
  }

  // Find degraded entities across all entity types
  const degradedTodos = store.todos.filter((t) => (t.views as any)?.ai_degraded === true);
  const degradedHabits = store.habits.filter((h) => (h.views as any)?.ai_degraded === true);
  const degradedNotes = store.notes.filter((n) => (n.views as any)?.ai_degraded === true);

  const totalDegraded = degradedTodos.length + degradedHabits.length + degradedNotes.length;

  if (totalDegraded === 0) {
    return;
  }

  console.log('[Reclassify] Found degraded entities', {
    todos: degradedTodos.length,
    habits: degradedHabits.length,
    notes: degradedNotes.length,
  });

  const allDegraded = [
    ...degradedTodos.map((e) => ({ ...e, entityType: 'todo' as const, table: 'todos' as const })),
    ...degradedHabits.map((e) => ({
      ...e,
      entityType: 'habit' as const,
      table: 'habits' as const,
    })),
    ...degradedNotes.map((e) => ({ ...e, entityType: 'note' as const, table: 'notes' as const })),
  ];

  let reclassified = 0;

  for (const entity of allDegraded) {
    try {
      const originalText =
        (entity as any).body || (entity as any).notes || (entity as any).name || '';
      if (!originalText.trim()) continue;

      const result = await runPhase1(originalText, { hasAttachments: false });

      if (result.classificationDegraded) {
        console.log('[Reclassify] Still degraded, skipping entity', { id: entity.id });
        continue;
      }

      const currentBucket = entity.entityType;
      const newBucket = result.bucket === 'log' ? 'note' : result.bucket;

      if (currentBucket === newBucket) {
        console.log('[Reclassify] Same bucket, clearing degraded flag', {
          id: entity.id,
          bucket: currentBucket,
        });

        await supabase
          .from(entity.table)
          .update({
            views: {
              ...(entity.views as any),
              ai_degraded: false,
              classification_source: result.source,
            },
            updated_at: nowTimestamp(),
          })
          .eq('id', entity.id);

        const storeKey = entity.table;
        useGremlyStore.setState((state) => ({
          [storeKey]: (state[storeKey] as any[]).map((item: any) =>
            item.id === entity.id
              ? {
                  ...item,
                  views: {
                    ...item.views,
                    ai_degraded: false,
                    classification_source: result.source,
                  },
                }
              : item,
          ),
        }));

        reclassified++;
      } else {
        // Bucket changed — clear the flag and record what it should be.
        // Moving entities between tables is complex; log for now.
        console.warn('[Reclassify] Bucket would change — clearing flag but not moving entity', {
          id: entity.id,
          currentBucket,
          newBucket,
          newSubtype: result.subtype,
        });

        await supabase
          .from(entity.table)
          .update({
            views: {
              ...(entity.views as any),
              ai_degraded: false,
              reclassified_bucket: newBucket,
              reclassified_subtype: result.subtype,
              classification_source: result.source,
            },
            updated_at: nowTimestamp(),
          })
          .eq('id', entity.id);

        const storeKey = entity.table;
        useGremlyStore.setState((state) => ({
          [storeKey]: (state[storeKey] as any[]).map((item: any) =>
            item.id === entity.id
              ? {
                  ...item,
                  views: {
                    ...item.views,
                    ai_degraded: false,
                    reclassified_bucket: newBucket,
                    reclassified_subtype: result.subtype,
                    classification_source: result.source,
                  },
                }
              : item,
          ),
        }));

        reclassified++;
      }

      // Small delay between entities to avoid API spam
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn('[Reclassify] Failed for entity', {
        id: entity.id,
        error: String(err),
      });
    }
  }

  if (reclassified > 0) {
    console.log('[Reclassify] Complete', { reclassified, total: totalDegraded });
  }
}
