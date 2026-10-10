/**
 * Drop Queue - AsyncStorage-based persistence for Mind Drops
 *
 * Ensures crash resilience by persisting drops before any network calls.
 * Drops are only removed after successful Supabase sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGremlyStore } from '../store/useGremlyStore';
import { generateDropId } from './ids';
import type { MindDropBucket, LogSubtype } from './types';
import type { HabitSubtype } from '../types';
import { nowTimestamp } from '../date/DateService';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'gremly:mindDropQueue';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRY_COUNT = 3;

// ============================================================================
// Async Mutex — prevents concurrent read-modify-write races on AsyncStorage
// ============================================================================
// Without this, concurrent saveDrop() calls can overwrite each other's changes:
// D1 reads → D2 reads (stale) → D1 writes → D2 writes (clobbers D1's update)

let queueLock: Promise<void> = Promise.resolve();

async function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const prevLock = queueLock;
  queueLock = new Promise<void>((r) => {
    release = r;
  });
  await prevLock;
  try {
    return await fn();
  } finally {
    release!();
  }
}

// ============================================================================
// Zustand sync
// ============================================================================

/**
 * After every AsyncStorage write, push active queue items to Zustand.
 * Active = not yet complete (still processing or failed-retryable).
 * This is the ONLY path that updates queueItems.
 */
function syncQueueToZustand(queue: QueuedDrop[]): void {
  const active = queue.filter((d) => d.phase !== 'complete');

  useGremlyStore.setState((state) => {
    const oldByLocalId = new Map(state.queueItems.map((d) => [d.localId, d]));

    const newItems = active.map((drop) => {
      const old = oldByLocalId.get(drop.localId);
      if (!old) {
        console.log('[STABILITY] New drop, no old ref:', drop.localId);
        return drop;
      }

      // Compare visual-relevant fields only.
      // If none changed, return the OLD reference so React skips re-render.
      const fieldsMatch =
        old.phase === drop.phase &&
        old.supabaseId === drop.supabaseId &&
        old.split === drop.split &&
        old.bucket === drop.bucket &&
        old.subtype === drop.subtype &&
        old.smartTitle === drop.smartTitle &&
        old.confirmationMessage === drop.confirmationMessage &&
        old.timeEstimateMinutes === drop.timeEstimateMinutes &&
        old.extractedDate === drop.extractedDate &&
        old.extractedFrequency === drop.extractedFrequency &&
        old.targetDate === drop.targetDate &&
        old.scheduledDate === drop.scheduledDate &&
        old.eventTime === drop.eventTime &&
        old.needsClarification === drop.needsClarification &&
        old.clarificationQuestion === drop.clarificationQuestion &&
        old.isMulti === drop.isMulti &&
        old.multiSummary === drop.multiSummary &&
        arraysEqual(old.tags, drop.tags) &&
        arraysEqual(old.people, drop.people) &&
        arraysEqual(old.mood, drop.mood) &&
        arraysEqual(old.extractedDays, drop.extractedDays);

      if (fieldsMatch) {
        console.log('[STABILITY] Reusing old ref for:', drop.localId);
        return old;
      }

      console.log('[STABILITY] Fields changed for:', drop.localId, {
        phase: old.phase !== drop.phase ? `${old.phase} → ${drop.phase}` : 'same',
        bucket: old.bucket !== drop.bucket ? `${old.bucket} → ${drop.bucket}` : 'same',
        smartTitle: old.smartTitle !== drop.smartTitle ? 'changed' : 'same',
        confirmationMessage:
          old.confirmationMessage !== drop.confirmationMessage ? 'changed' : 'same',
        tags: old.tags === drop.tags ? 'same ref' : 'diff ref',
      });
      return drop;
    });

    // Also preserve the array reference itself if nothing changed at all
    const arrayUnchanged =
      newItems.length === state.queueItems.length &&
      newItems.every((item, i) => item === state.queueItems[i]);

    if (arrayUnchanged) {
      console.log('[STABILITY] Array unchanged, returning same state');
      return state; // No change — don't trigger any subscribers
    }

    console.log('[STABILITY] Array changed, updating queueItems');
    return { queueItems: newItems };
  });
}

function arraysEqual(a?: any[] | null, b?: any[] | null): boolean {
  // Treat undefined/null/[] as equivalent
  const aEmpty = !a || a.length === 0;
  const bEmpty = !b || b.length === 0;
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;
  if (a!.length !== b!.length) return false;
  return a!.every((v, i) => v === b![i]);
}

/**
 * Read the durable queue from AsyncStorage and set queueItems in Zustand.
 * Called on app start and every foreground event.
 */
export async function loadQueueIntoZustand(): Promise<void> {
  const queue = await getQueue();
  syncQueueToZustand(queue);
}

// ============================================================================
// Types
// ============================================================================

export type DropStatus =
  | 'queued' // Written to AsyncStorage, not yet processed
  | 'classified' // Phase 0/1 complete, ready for Phase 2
  | 'enriched' // Phase 2 complete, ready for sync
  | 'enrichment_failed' // Phase 2 failed, can be retried
  | 'synced' // Complete, can be removed
  | 'failed'; // Failed, needs retry

/**
 * Pipeline phase: the single source of truth for where a drop is in processing.
 * From the Mind Drop rethink (stage 4, 9 Oct 2026) the order is
 * queued → sorted → saved → complete (dropPhases.ts says what each does).
 * The other names are an older build's; `migrateDropPhases` moves them on.
 */
export type DropPhase =
  | 'queued' // the tap: the title call, the already have it check and the classifier start
  | 'sorted' // the kind is known: the details start and the drop is saved as its kind
  | 'saved' // saved: waits for the details (at most 5s after the sort), then settles
  | 'complete' // settled and dequeued
  | 'failed' // Max retries exceeded: shows retry button
  // An older build's phases, moved on by migrateDropPhases
  | 'classified'
  | 'titled'
  | 'enriched'
  | 'syncing'
  | 'multi_detected'
  | 'multi_awaiting';

/** An older build's phase, and the phase it resumes at (the insert is safe to repeat by drop id). */
export const LEGACY_PHASES: Partial<Record<DropPhase, DropPhase>> = {
  classified: 'sorted',
  titled: 'sorted',
  multi_detected: 'sorted',
  multi_awaiting: 'sorted',
  enriched: 'saved',
  syncing: 'saved',
};

/** The drop is saved: its own row (or its pieces') now stands for it on screen. */
export function isDropSaved(drop: Pick<QueuedDrop, 'supabaseId' | 'pieceRows'>): boolean {
  return !!drop.supabaseId || !!drop.pieceRows?.length;
}

export type DropSource = 'minddrop' | 'today' | 'space' | 'photo';

export interface MultiSegment {
  text: string;
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  habitSubtype?: HabitSubtype | null;
  /** Smart title from Phase 1 classification */
  smart_title?: string | null;
  /** Confirmation message from Phase 1 classification */
  confirmation_message?: string | null;
  /** A piece the classifier could not settle asks its own question (v3.8 with piece_questions) */
  needsClarification?: boolean;
  ambiguityType?: string | null;
  clarificationQuestion?: string | null;
  clarificationOptions?: unknown[] | null;
}

/** A piece of a clear split, once saved as its own item. */
export interface SavedPieceRow {
  entityType: 'todo' | 'habit' | 'note';
  id: string;
  dropId: string;
  index: number;
  text: string;
  title: string;
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  habitSubtype?: string | null;
  /** the piece asks its own question (stage 7) */
  asks?: boolean;
  /** the row as saved, to tell a person's edit apart from the details (stage 7) */
  base?: Record<string, unknown> & { views: Record<string, unknown> };
}

export interface QueuedDrop {
  /** Client-generated UUID for tracking */
  localId: string;

  /** The original text entered by the user */
  text: string;

  /** Photo URIs if any */
  attachments?: string[];

  /** Associated space (null for inbox) */
  spaceId: string | null;

  /** Where the drop originated */
  source: DropSource;

  /** When the drop was created (ISO timestamp) */
  createdAt: string;

  /** Current processing status */
  status: DropStatus;

  /** Number of retry attempts */
  retryCount: number;

  /** Last attempt timestamp (ISO) */
  lastAttemptAt?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Multi-item processing results
  // ──────────────────────────────────────────────────────────────────────────

  /** Whether this drop contains multiple items */
  isMulti?: boolean;

  /** Individual segments for multi-item drops */
  multiSegments?: MultiSegment[];

  /** Summary title for multi-item drops */
  multiSummary?: string;

  /** Dominant bucket for multi-item drops */
  dominantBucket?: MindDropBucket;

  /** Dominant subtype for multi-item drops */
  dominantSubtype?: LogSubtype | null;

  /**
   * How sure the classifier is that the pieces are separate (v3.8): clear
   * splits are saved as their pieces, unsure ones as one item that asks.
   * An older classifier says nothing, which is unsure.
   */
  split?: 'clear' | 'unsure' | null;

  /** The drop's kind kept as one item, for an unsure split (null: saved as a note) */
  asOne?: {
    bucket: MindDropBucket;
    subtype: LogSubtype | null;
    habitSubtype: HabitSubtype | null;
  } | null;

  /** A clear split's pieces, once saved */
  pieceRows?: SavedPieceRow[];

  // ──────────────────────────────────────────────────────────────────────────
  // Single-item classification results
  // ──────────────────────────────────────────────────────────────────────────

  /** Classified bucket */
  bucket?: MindDropBucket;

  /** Classified subtype */
  subtype?: LogSubtype | null;

  /** Habit subtype (start_habit, break_habit, routine) */
  habitSubtype?: HabitSubtype | null;

  /** Classification confidence (0-1) */
  confidence?: number;

  // ──────────────────────────────────────────────────────────────────────────
  // Enrichment results
  // ──────────────────────────────────────────────────────────────────────────

  /** AI-generated smart title */
  smartTitle?: string;

  /** AI-extracted tags */
  tags?: string[];

  /** Estimated time to complete in minutes */
  timeEstimateMinutes?: number | null;

  /** Suggested time window */
  timeWindow?: 'morning' | 'day' | 'evening' | null;

  /** Extracted due date (ISO) */
  extractedDate?: string | null;

  /** Extracted start date for habits (ISO) */
  extractedStartDate?: string | null;

  /** Extracted frequency for habits */
  extractedFrequency?: string | null;

  /** Extracted days for habits (0=Sun, 6=Sat) */
  extractedDays?: number[] | null;

  /** Extracted people/names */
  people?: string[];

  /** Confirmation message to show user */
  confirmationMessage?: string | null;

  /** AI-generated card note (warm subtitle) */
  cardNote?: string | null;

  /** Follow-up signal for speech bubble (multi-detect or clarify) */
  followUpSignal?: 'multi' | 'clarify' | null;

  /** Extracted mood(s) for journal entries */
  mood?: string[] | null;

  // ──────────────────────────────────────────────────────────────────────────
  // Classification quality tracking
  // ──────────────────────────────────────────────────────────────────────────

  /** True if classification came from a fallback, not real AI */
  classificationDegraded?: boolean;

  /** Source of the classification (e.g. 'api', 'heuristic', 'preparse-fallback') */
  classificationSource?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Date Intelligence (Phase 2)
  // ──────────────────────────────────────────────────────────────────────────

  /** External deadline/due date (ISO) */
  targetDate?: string | null;

  /** Caller-supplied due_day override (e.g. tomorrow mode) */
  dueDayOverride?: string | null;

  /** Caller-supplied date from calendar (ISO, e.g. "2025-04-10") */
  prefillDate?: string | null;

  /** Scheduled work date (ISO) */
  scheduledDate?: string | null;

  /** Event time for notes classified as events */
  eventTime?: string | null;

  /** True if AI couldn't determine date meaning */
  dateTypeAmbiguous?: boolean;

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 1: Ambiguity detection (triggers Phase 1.5 in background)
  // ──────────────────────────────────────────────────────────────────────────

  /** True if AI needs user to disambiguate the intent */
  needsClarification?: boolean;

  /** Reason for ambiguity (passed to Phase 1.5 for question generation) */
  ambiguityReason?: string | null;

  /** Ambiguity type from Phase 1 (bucket, date_type, habit_or_todo, ...). Defaults to 'bucket'. */
  ambiguityType?: string | null;

  /** Which classifier handled this drop: 'v3' (single call) or 'v2' (legacy chain) */
  classifyEngine?: 'v2' | 'v3';

  /** Plausible interpretations from Phase 1 ambiguity detection */
  plausibleInterpretations?: Array<{
    bucket: string | null;
    subtype?: string | null;
    habitSubtype?: string | null;
    dateField?: string | null;
  }> | null;

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 1.5: Clarification fields (populated asynchronously in background)
  // ──────────────────────────────────────────────────────────────────────────

  /** Type of clarification needed */
  clarificationType?: 'bucket' | 'date' | 'social_plan' | null;

  /** Question to present to the user */
  clarificationQuestion?: string | null;

  /**
   * Set by an older build when the drop is about something the user already
   * has: it then synced as a note carrying this in views.relation. From stage 4
   * the answer is attached to the saved item of any kind instead (dropSync.ts
   * attachDropRelation), and this stays unset.
   */
  relation?: import('./dropRelation').HeldRelation | null;

  /** Available options for the user to choose from */
  clarificationOptions?: Array<{
    id: string;
    label: string;
    action: {
      bucket?: 'todo' | 'habit' | 'log';
      subtype?: string | null;
      habitSubtype?: string | null;
      target_date?: boolean;
      scheduled_date?: boolean;
    };
  }> | null;

  // ──────────────────────────────────────────────────────────────────────────
  // Sync results
  // ──────────────────────────────────────────────────────────────────────────

  /** Supabase ID after successful sync */
  supabaseId?: string;

  /** Entity type after successful sync */
  entityType?: 'todo' | 'habit' | 'note';

  // ──────────────────────────────────────────────────────────────────────────
  // Pipeline state machine (v2)
  // ──────────────────────────────────────────────────────────────────────────

  /** Current pipeline phase — single source of truth for processing state */
  phase?: DropPhase;

  /** Which phase the drop was in when it moved to 'failed' (for retry resume) */
  failedAtPhase?: DropPhase;

  /** If this is a child of a multi-entity split, the parent's localId */
  parentLocalId?: string | null;

  /** If this is a multi-entity parent, the localIds of spawned children */
  childLocalIds?: string[];

  /** Last error message (for debugging, max 200 chars) */
  lastError?: string | null;

  /** Energy type from Phase 2 enrichment */
  energyType?: 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick' | null;

  /** Priority kind from Phase 2 enrichment (todos only) */
  priorityKind?: 'action' | 'blocker' | 'waiting' | 'decision' | 'momentum' | null;

  /** End date for events */
  endDate?: string | null;

  /** Phase 2b auto-reminder fields */
  autoReminder?: boolean;
  reminderDate?: string | null;
  reminderTime?: string | null;
  reminderFrequency?: 'once' | 'daily' | null;

  // ──────────────────────────────────────────────────────────────────────────
  // The new order (Mind Drop rethink stage 4)
  // ──────────────────────────────────────────────────────────────────────────

  /** The classifier heard a remind me: the reminder call runs with the details */
  reminderIntent?: boolean;

  /** When this run of the app first took the drop up (an offline drop waits first) */
  startedAt?: number;

  /** When the drop was sorted, saved and settled (ms since 1970, DateService) */
  sortedAt?: number;
  savedAt?: number;
  settledAt?: number;

  /** Whether the details were in by the settle, came after it, or were not asked for */
  detailsIn?: 'in_time' | 'none' | 'after_settle' | 'not_asked';
  /** the already have it answer: in by the settle (on the card), after it (Sweep), or not asked */
  relationIn?: 'in_time' | 'after_settle' | 'not_asked';
  /** where it lives (stage 9): in by the settle, after it (it fades in alone), or not asked */
  filingIn?: 'in_time' | 'after_settle' | 'not_asked';

  /** The detail fields as saved, to tell a person's edit apart when the details land */
  savedBase?: import('./dropSync').DropDetailBase | null;

  /** Saved with its own words as the title while the title call is still out */
  wordsPending?: boolean;

  /** Saved before the already have it check answered */
  relationPending?: boolean;

  /** Picked up again after the app stopped mid drop */
  resumed?: boolean;
}

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Read the queue from AsyncStorage.
 * Returns empty array on error.
 */
export async function getQueue(): Promise<QueuedDrop[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log('[DropQueue] No queue found, returning empty array');
      return [];
    }
    const parsed = JSON.parse(raw) as QueuedDrop[];
    console.log(`[DropQueue] Loaded ${parsed.length} items from queue`);
    return parsed;
  } catch (error) {
    console.log('[DropQueue] Error reading queue:', error);
    return [];
  }
}

/**
 * Save the queue to AsyncStorage.
 */
async function saveQueue(queue: QueuedDrop[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[DropQueue] Saved ${queue.length} items to queue`);
  } catch (error) {
    console.log('[DropQueue] Error saving queue:', error);
    throw error;
  }
}

/**
 * Add a new drop to the queue.
 * Enforces max queue size by removing oldest synced items first.
 */
export async function enqueue(
  drop: Omit<QueuedDrop, 'localId' | 'status' | 'retryCount' | 'createdAt'>,
): Promise<QueuedDrop> {
  return withQueueLock(async () => {
    const queue = await getQueue();

    while (queue.length >= MAX_QUEUE_SIZE) {
      const syncedIndex = queue.findIndex((d) => d.status === 'synced');
      if (syncedIndex !== -1) {
        const removed = queue.splice(syncedIndex, 1)[0];
        console.log(`[DropQueue] Removed synced drop ${removed.localId} to make room`);
      } else {
        const removed = queue.shift();
        console.log(`[DropQueue] Removed oldest drop ${removed?.localId} to make room`);
      }
    }

    const queuedDrop: QueuedDrop = {
      ...drop,
      localId: generateDropId(),
      status: 'queued',
      retryCount: 0,
      createdAt: nowTimestamp(),
    };

    queue.push(queuedDrop);
    await saveQueue(queue);
    syncQueueToZustand(queue);

    console.log(
      `[DropQueue] Enqueued drop ${queuedDrop.localId} (source: ${queuedDrop.source}, text: "${queuedDrop.text.slice(0, 50)}...")`,
    );

    return queuedDrop;
  });
}

/**
 * Internal update — caller must hold the queue lock.
 */
async function _updateDropUnsafe(localId: string, updates: Partial<QueuedDrop>): Promise<boolean> {
  const queue = await getQueue();
  const index = queue.findIndex((d) => d.localId === localId);

  if (index === -1) {
    console.log(`[DropQueue] Drop ${localId} not found for update`);
    return false;
  }

  queue[index] = { ...queue[index], ...updates };
  await saveQueue(queue);
  syncQueueToZustand(queue);

  console.log(`[DropQueue] Updated drop ${localId} with:`, Object.keys(updates).join(', '));
  return true;
}

/**
 * Update a drop in the queue by localId.
 * Resolves to false when the drop is no longer in the queue (already synced
 * and dequeued). It does NOT throw in that case, so callers that need a
 * fallback must check the return value rather than rely on .catch().
 */
export async function updateDrop(localId: string, updates: Partial<QueuedDrop>): Promise<boolean> {
  return withQueueLock(() => _updateDropUnsafe(localId, updates));
}

/**
 * Save a drop to the queue — creates if new, updates if exists.
 * Used by the pipeline runner for phase transitions.
 */
export async function saveDrop(localId: string, drop: QueuedDrop): Promise<void> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    const index = queue.findIndex((d) => d.localId === localId);

    if (index === -1) {
      queue.push(drop);
    } else {
      queue[index] = drop;
    }

    await saveQueue(queue);
    syncQueueToZustand(queue);
  });
}

/**
 * Move drops an older build left in the queue onto the phases this build runs.
 * Called once on app start. Safe to call any number of times.
 *
 * - A drop with no phase gets one from its status.
 * - An older build's phase moves on (LEGACY_PHASES): classified, titled and
 *   both multi phases become sorted; enriched and syncing become saved, whose
 *   handler saves the drop first when it has no row yet (the insert is safe to
 *   repeat by drop id). A failed drop's resume phase moves the same way.
 */
export async function migrateDropPhases(): Promise<number> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    let migrated = 0;

    for (const drop of queue) {
      if (drop.phase) {
        const moved = LEGACY_PHASES[drop.phase];
        const movedFailed = drop.failedAtPhase ? LEGACY_PHASES[drop.failedAtPhase] : undefined;
        if (!moved && !movedFailed) continue;
        if (moved) drop.phase = moved;
        if (movedFailed) drop.failedAtPhase = movedFailed;
        migrated++;
        continue;
      }

      // Derive phase from existing status
      switch (drop.status) {
        case 'queued':
          drop.phase = 'queued';
          break;
        case 'classified':
          drop.phase = 'sorted';
          break;
        case 'enriched':
          drop.phase = 'saved';
          break;
        case 'enrichment_failed':
          // Treat as saved with degraded data: the save goes ahead
          drop.phase = 'saved';
          break;
        case 'synced':
          drop.phase = 'complete';
          break;
        case 'failed':
          drop.phase = 'failed';
          drop.failedAtPhase = 'queued'; // Safe default — retry from start
          break;
        default:
          drop.phase = 'queued'; // Unknown status — start fresh
      }

      // Initialize new fields
      drop.lastError = drop.lastError ?? null;
      drop.parentLocalId = drop.parentLocalId ?? null;
      drop.childLocalIds = drop.childLocalIds ?? undefined;
      drop.failedAtPhase = drop.failedAtPhase ?? undefined;

      migrated++;
    }

    if (migrated > 0) {
      await saveQueue(queue);
      syncQueueToZustand(queue);
      console.log(`[DropQueue] Migrated ${migrated} drops to phase-based pipeline`);
    }

    return migrated;
  });
}

/**
 * Mark a drop as successfully synced to Supabase.
 */
export async function markSynced(
  localId: string,
  supabaseId: string,
  entityType: 'todo' | 'habit' | 'note',
): Promise<void> {
  return withQueueLock(async () => {
    await _updateDropUnsafe(localId, {
      status: 'synced',
      supabaseId,
      entityType,
    });

    console.log(
      `[DropQueue] Marked drop ${localId} as synced (supabaseId: ${supabaseId}, entityType: ${entityType})`,
    );
  });
}

/**
 * Mark a drop as failed and increment retry count.
 */
export async function markFailed(localId: string): Promise<void> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    const drop = queue.find((d) => d.localId === localId);

    if (!drop) {
      console.log(`[DropQueue] Drop ${localId} not found for markFailed`);
      return;
    }

    await _updateDropUnsafe(localId, {
      status: 'failed',
      retryCount: drop.retryCount + 1,
      lastAttemptAt: nowTimestamp(),
    });

    console.log(
      `[DropQueue] Marked drop ${localId} as failed (retryCount: ${drop.retryCount + 1})`,
    );
  });
}

/**
 * Remove a drop from the queue.
 */
export async function dequeue(localId: string): Promise<void> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    const index = queue.findIndex((d) => d.localId === localId);

    if (index === -1) {
      console.log(`[DropQueue] Drop ${localId} not found for dequeue`);
      return;
    }

    queue.splice(index, 1);
    await saveQueue(queue);
    syncQueueToZustand(queue);

    console.log(`[DropQueue] Dequeued drop ${localId}`);
  });
}

/**
 * Remove all synced drops from the queue.
 * @returns Number of drops removed
 */
export async function cleanupSynced(): Promise<number> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    const initialLength = queue.length;

    const filtered = queue.filter((d) => d.status !== 'synced');
    const removedCount = initialLength - filtered.length;

    if (removedCount > 0) {
      await saveQueue(filtered);
      syncQueueToZustand(filtered);
      console.log(`[DropQueue] Cleaned up ${removedCount} synced drops`);
    } else {
      console.log('[DropQueue] No synced drops to clean up');
    }

    return removedCount;
  });
}

/**
 * Resolve a clarification on a queued drop.
 * Called when the user taps a clarification option.
 * Updates the QueuedDrop in AsyncStorage + Zustand, then triggers re-processing.
 */
export async function resolveClarification(
  localId: string,
  resolution: {
    bucket?: 'todo' | 'habit' | 'log';
    subtype?: string | null;
    habitSubtype?: string | null;
    targetDate?: boolean;
    scheduledDate?: boolean;
  },
): Promise<boolean> {
  return withQueueLock(async () => {
    const queue = await getQueue();
    const index = queue.findIndex((d) => d.localId === localId);

    if (index === -1) return false;

    const drop = queue[index];

    // Apply the resolution
    const resolved: QueuedDrop = {
      ...drop,
      bucket: resolution.bucket || drop.bucket,
      subtype: (resolution.subtype as any) || drop.subtype,
      habitSubtype: (resolution.habitSubtype as any) || drop.habitSubtype,
      needsClarification: false,
      clarificationQuestion: null,
      clarificationOptions: null,
      // Back to sorted, so the drop is saved with its new kind (nothing calls this today)
      phase: 'sorted',
      retryCount: 0,
      lastError: null,
    };

    queue[index] = resolved;
    await saveQueue(queue);
    syncQueueToZustand(queue);

    return true;
  });
}

/**
 * Get all drops that need processing.
 * Includes: queued, classifying, enriching, syncing, or failed with retryCount < 3
 */
export async function getPendingDrops(): Promise<QueuedDrop[]> {
  const queue = await getQueue();

  const pending = queue.filter((drop) => {
    // Include drops in active processing states
    if (['queued', 'classifying', 'enriching', 'syncing'].includes(drop.status)) {
      return true;
    }

    // Include failed drops that haven't exceeded retry limit
    if (drop.status === 'failed' && drop.retryCount < MAX_RETRY_COUNT) {
      return true;
    }

    return false;
  });

  console.log(`[DropQueue] Found ${pending.length} pending drops (of ${queue.length} total)`);

  return pending;
}

/**
 * Check if there are any pending drops.
 */
export async function hasPendingDrops(): Promise<boolean> {
  const pending = await getPendingDrops();
  return pending.length > 0;
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Get queue statistics for debugging.
 */
export async function getQueueStats(): Promise<{
  total: number;
  byStatus: Record<DropStatus, number>;
  pendingCount: number;
}> {
  const queue = await getQueue();
  const pending = await getPendingDrops();

  const byStatus: Record<string, number> = {
    queued: 0,
    classified: 0,
    enriched: 0,
    enrichment_failed: 0,
    synced: 0,
    failed: 0,
  };

  for (const drop of queue) {
    const key = drop.status || 'queued';
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  console.log('[DropQueue] Stats:', {
    total: queue.length,
    byStatus,
    pendingCount: pending.length,
  });

  return {
    total: queue.length,
    byStatus,
    pendingCount: pending.length,
  };
}

/**
 * Clear the entire queue (for testing/debugging only).
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  console.log('[DropQueue] Queue cleared');
}
