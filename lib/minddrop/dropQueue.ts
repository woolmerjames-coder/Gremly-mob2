/**
 * Drop Queue - AsyncStorage-based persistence for Mind Drops
 *
 * Ensures crash resilience by persisting drops before any network calls.
 * Drops are only removed after successful Supabase sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateDropId } from './ids';
import type { MindDropBucket, LogSubtype } from './types';
import type { HabitSubtype } from '../types';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'gremly:mindDropQueue';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRY_COUNT = 3;

// ============================================================================
// Types
// ============================================================================

export type DropStatus =
  | 'queued' // Written to AsyncStorage, not yet processed
  | 'classified' // Phase 0/1 complete, ready for Phase 2
  | 'enriched' // Phase 2 complete, ready for sync
  | 'synced' // Complete, can be removed
  | 'failed'; // Failed, needs retry

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

  /** Extracted mood(s) for journal entries */
  mood?: string[] | null;

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Clarification fields
  // ──────────────────────────────────────────────────────────────────────────

  /** True if AI needs user to disambiguate the intent */
  needsClarification?: boolean;

  /** Type of clarification needed */
  clarificationType?: 'bucket' | 'date' | 'social_plan' | null;

  /** Question to present to the user */
  clarificationQuestion?: string | null;

  /** Available options for the user to choose from */
  clarificationOptions?: Array<{
    id: string;
    label: string;
    action: {
      bucket?: 'todo' | 'habit' | 'log';
      subtype?: string | null;
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
  const queue = await getQueue();

  // Enforce max queue size - remove oldest synced first
  while (queue.length >= MAX_QUEUE_SIZE) {
    const syncedIndex = queue.findIndex((d) => d.status === 'synced');
    if (syncedIndex !== -1) {
      const removed = queue.splice(syncedIndex, 1)[0];
      console.log(`[DropQueue] Removed synced drop ${removed.localId} to make room`);
    } else {
      // No synced items to remove, remove oldest item
      const removed = queue.shift();
      console.log(`[DropQueue] Removed oldest drop ${removed?.localId} to make room`);
    }
  }

  const queuedDrop: QueuedDrop = {
    ...drop,
    localId: generateDropId(),
    status: 'queued',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  queue.push(queuedDrop);
  await saveQueue(queue);

  console.log(
    `[DropQueue] Enqueued drop ${queuedDrop.localId} (source: ${queuedDrop.source}, text: "${queuedDrop.text.slice(0, 50)}...")`,
  );

  return queuedDrop;
}

/**
 * Update a drop in the queue by localId.
 */
export async function updateDrop(localId: string, updates: Partial<QueuedDrop>): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((d) => d.localId === localId);

  if (index === -1) {
    console.log(`[DropQueue] Drop ${localId} not found for update`);
    return;
  }

  queue[index] = { ...queue[index], ...updates };
  await saveQueue(queue);

  console.log(`[DropQueue] Updated drop ${localId} with:`, Object.keys(updates).join(', '));
}

/**
 * Mark a drop as successfully synced to Supabase.
 */
export async function markSynced(
  localId: string,
  supabaseId: string,
  entityType: 'todo' | 'habit' | 'note',
): Promise<void> {
  await updateDrop(localId, {
    status: 'synced',
    supabaseId,
    entityType,
  });

  console.log(
    `[DropQueue] Marked drop ${localId} as synced (supabaseId: ${supabaseId}, entityType: ${entityType})`,
  );
}

/**
 * Mark a drop as failed and increment retry count.
 */
export async function markFailed(localId: string): Promise<void> {
  const queue = await getQueue();
  const drop = queue.find((d) => d.localId === localId);

  if (!drop) {
    console.log(`[DropQueue] Drop ${localId} not found for markFailed`);
    return;
  }

  await updateDrop(localId, {
    status: 'failed',
    retryCount: drop.retryCount + 1,
    lastAttemptAt: new Date().toISOString(),
  });

  console.log(`[DropQueue] Marked drop ${localId} as failed (retryCount: ${drop.retryCount + 1})`);
}

/**
 * Remove a drop from the queue.
 */
export async function dequeue(localId: string): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((d) => d.localId === localId);

  if (index === -1) {
    console.log(`[DropQueue] Drop ${localId} not found for dequeue`);
    return;
  }

  queue.splice(index, 1);
  await saveQueue(queue);

  console.log(`[DropQueue] Dequeued drop ${localId}`);
}

/**
 * Remove all synced drops from the queue.
 * @returns Number of drops removed
 */
export async function cleanupSynced(): Promise<number> {
  const queue = await getQueue();
  const initialLength = queue.length;

  const filtered = queue.filter((d) => d.status !== 'synced');
  const removedCount = initialLength - filtered.length;

  if (removedCount > 0) {
    await saveQueue(filtered);
    console.log(`[DropQueue] Cleaned up ${removedCount} synced drops`);
  } else {
    console.log('[DropQueue] No synced drops to clean up');
  }

  return removedCount;
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

  const byStatus: Record<DropStatus, number> = {
    queued: 0,
    classified: 0,
    enriched: 0,
    synced: 0,
    failed: 0,
  };

  for (const drop of queue) {
    byStatus[drop.status]++;
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
