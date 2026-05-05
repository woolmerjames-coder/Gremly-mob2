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
  loadQueueIntoZustand,
} from './dropQueue';
import { getPhaseHandler } from './dropPhases';
import { useGremlyStore } from '../store/useGremlyStore';
import { runPhase1 } from './phase1';
import { supabase } from '../supabase/client';
import { nowTimestamp, getDateService } from '../date/DateService';
import { eventBus } from '../events/EventBus';
import { networkStatus } from '../network/NetworkStatus';
import { scheduleItemReminder, scheduleQuickReminder } from '../notifications/itemReminderService';
import { hasNotificationPermission } from '../../src/utils/notifications';
import { dateService } from '../date/DateService';
import type { ItemReminder } from '../types';
import { env } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';

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
// handleComplete — Terminal handler
// ──────────────────────────────────────────────────────────────────────────────

async function handleComplete(drop: QueuedDrop): Promise<void> {
  // Queue item is removed by dequeue() below, which updates queueItems in Zustand.
  // The real entity was already added to todos/habits/notes by syncDropToSupabase.

  // Remove from AsyncStorage queue (also updates queueItems via syncQueueToZustand)
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

  // Assign drop to worlds/chapters/life contexts (fire-and-forget)
  void assignDropToGraph(drop);

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
// Worlds/Chapters/Life Context Assignment (fire and forget)
// ──────────────────────────────────────────────────────────────────────────────

async function assignDropToGraph(drop: QueuedDrop): Promise<void> {
  // Guard: must have a saved entity id and a supported entity type
  if (!drop.supabaseId || !drop.entityType) return;
  if (!['todo', 'habit', 'note'].includes(drop.entityType)) return;

  // Guard: skip external calendar notes
  if (drop.entityType === 'note') {
    const note = useGremlyStore.getState().notes.find((n) => n.id === drop.supabaseId);
    if (note?.external_source != null) return;
  }

  const cortexUrl = typeof env.cortexUrl === 'string' ? env.cortexUrl : '';
  if (!cortexUrl) return;

  const sessionToken = await getSessionToken();
  if (!sessionToken) return;

  const payload: Record<string, unknown> = {
    type: 'assign-worlds',
    entity_id: drop.supabaseId,
    entity_type: drop.entityType,
    text: drop.text,
  };
  if (drop.smartTitle) payload.smart_title = drop.smartTitle;
  if (drop.bucket) payload.bucket = drop.bucket;
  if (drop.subtype) payload.subtype = drop.subtype;
  if (Array.isArray(drop.tags) && drop.tags.length > 0) payload.tags = drop.tags;
  if (Array.isArray(drop.people) && drop.people.length > 0) payload.people = drop.people;
  if (drop.extractedDate) payload.extracted_date = drop.extractedDate;

  try {
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = (await res.text().catch(() => '')).substring(0, 200);
      console.warn('[AssignDropToGraph] non-OK', {
        localId: drop.localId,
        status: res.status,
        body: errText,
      });
      return;
    }

    try {
      const data = await res.json();
      console.log('[AssignDropToGraph] OK', {
        localId: drop.localId,
        world_links: data.world_links,
        chapter_links: data.chapter_links,
        context_links: data.context_links,
        skipped: data.skipped,
        reason: data.reason,
      });
    } catch {
      console.log('[AssignDropToGraph] OK (unparsed)', { localId: drop.localId });
    }
  } catch (err) {
    console.warn('[AssignDropToGraph] error', { localId: drop.localId, error: String(err) });
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
  await loadQueueIntoZustand();

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
        // Bucket changed — move entity to the correct table
        console.log('[Reclassify] Bucket changed, moving entity', {
          id: entity.id,
          from: `${entity.table} (${currentBucket})`,
          to: `${newBucket}`,
        });

        // Skip if user has edited the entity (don't overwrite their changes)
        const created = new Date(
          (entity as any).created_at || (entity as any).createdAt || 0,
        ).getTime();
        const updated = new Date(
          (entity as any).updated_at || (entity as any).updatedAt || 0,
        ).getTime();
        if (updated - created > 60000) {
          console.log('[Reclassify] Entity was user-edited, skipping move', { id: entity.id });
          // Just clear the degraded flag
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
          reclassified++;
          continue;
        }

        try {
          const newTable =
            newBucket === 'todo' ? 'todos' : newBucket === 'habit' ? 'habits' : 'notes';
          const title = (entity as any).title || (entity as any).name || '';
          const body = (entity as any).body || (entity as any).notes || '';
          const ownerId = (entity as any).owner_id;
          const dropId = (entity as any).drop_id;
          const tags = (entity as any).tags || [];
          const spaceId = (entity as any).space_id || null;

          // Build base payload for new table
          let newPayload: Record<string, any> = {
            owner_id: ownerId,
            drop_id: dropId,
            space_id: spaceId,
            tags,
            views: {
              ...(entity.views as any),
              ai_degraded: false,
              classification_source: result.source,
            },
            updated_at: nowTimestamp(),
          };

          if (newTable === 'todos') {
            newPayload = {
              ...newPayload,
              name: title,
              body,
              origin: 'catchall',
              energy_type: 'administrative',
            };
          } else if (newTable === 'habits') {
            newPayload = {
              ...newPayload,
              name: title,
              title,
              notes: body,
              origin: 'catchall',
              subtype: result.habitSubtype || 'start_habit',
              frequency: 'daily',
              cadence: 'daily',
              target_per_period: 1,
              time_window: 'day',
              energy_type: 'administrative',
            };
          } else {
            newPayload = {
              ...newPayload,
              title,
              body,
              subtype: result.subtype || 'catchall',
              origin: 'catchall',
            };
          }

          // Insert into new table
          const { data: newEntity, error: insertErr } = await supabase
            .from(newTable)
            .insert(newPayload)
            .select()
            .single();

          if (insertErr) {
            console.error('[Reclassify] Insert failed', { error: insertErr });
            continue;
          }

          // Delete from old table
          await supabase.from(entity.table).delete().eq('id', entity.id);

          // Update Zustand
          const oldStoreKey = entity.table;
          const newStoreKey = newTable;
          useGremlyStore.setState((state) => {
            const oldItems = (state[oldStoreKey] as any[]).filter(
              (item: any) => item.id !== entity.id,
            );
            const newItems = [
              ...(state[newStoreKey] as any[]),
              {
                ...newEntity,
                type: newBucket === 'todo' ? 'todo' : newBucket === 'habit' ? 'habit' : 'note',
              },
            ];
            return { [oldStoreKey]: oldItems, [newStoreKey]: newItems };
          });

          // Emit event for UI update
          eventBus.emit('entity:bucket_changed', {
            oldId: entity.id,
            newId: newEntity.id,
            oldTable: entity.table,
            newTable,
            newBucket,
          });

          reclassified++;
          console.log('[Reclassify] Moved entity', {
            oldId: entity.id,
            newId: newEntity.id,
            to: newTable,
          });
        } catch (moveErr) {
          console.error('[Reclassify] Move failed', { id: entity.id, error: String(moveErr) });
        }
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
