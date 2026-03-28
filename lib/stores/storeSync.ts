/**
 * Store Sync - Event Bus to Zustand Store Bridge
 *
 * PHASE A: Listen-only mode
 * This module subscribes to EventBus entity events and updates the Zustand store.
 * No writes back to the database - purely reactive synchronization.
 *
 * Flow: DB write → EventBus emit → storeSync listener → Zustand store update
 */

import { useMindDropStore } from './mindDropStore';
import { eventBus } from '../events/EventBus';
import { MindDropItem, MindDropBucket, MindDropStage, LogSubtype } from '../minddrop/types';
import { nowTimestamp } from '../date/DateService';

/**
 * Map entity type string to MindDropBucket
 */
function typeToBucket(type: string): MindDropBucket {
  switch (type) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'note':
    case 'log':
      return 'log';
    default:
      return 'log';
  }
}

/**
 * Convert a database record to MindDropItem format
 */
export function dbRecordToMindDropItem(record: any, type: string): MindDropItem {
  const bucket = typeToBucket(type);
  const now = nowTimestamp();

  // Determine log subtype from record if available
  let subtype: LogSubtype | null = null;
  if (bucket === 'log') {
    if (record.log_subtype) {
      subtype = record.log_subtype as LogSubtype;
    } else if (record.subtype) {
      subtype = record.subtype as LogSubtype;
    } else {
      subtype = 'general';
    }
  }

  // Determine stage from record
  let stage: MindDropStage = 'classified';
  if (record.stage) {
    stage = record.stage as MindDropStage;
  } else if (record.ai_enriched === true) {
    stage = 'enriched';
  } else if (record.ai_failed === true) {
    stage = 'enrichment_failed';
  }

  return {
    id: record.id,
    dropId: record.drop_id || record.dropId || record.id,
    bucket,
    subtype,
    originalText: record.original_text || record.originalText || record.title || record.name || '',
    title: record.title || record.name || '',
    tags: record.tags || [],
    timeEstimateMinutes: record.time_estimate_minutes ?? record.timeEstimateMinutes ?? null,
    dueAt: record.due_at || record.dueAt || record.due_date || null,
    people: record.people || [],
    stage,
    createdAt: record.created_at || record.createdAt || now,
    updatedAt: record.updated_at || record.updatedAt || now,
    spaceId: record.space_id ?? record.spaceId ?? null,
    isOptimistic: false,
    aiFailed: record.ai_failed ?? record.aiFailed ?? false,
    photosFailed: record.photos_failed ?? record.photosFailed ?? false,
  };
}

/**
 * Initialize store synchronization with EventBus
 * Call this once at app startup to begin listening for entity events
 *
 * @returns Cleanup function to unsubscribe all listeners
 */
export function initializeStoreSync(): () => void {
  const store = useMindDropStore.getState();
  const unsubscribers: Array<() => void> = [];

  // Listen for entity:created events
  const unsubCreated = eventBus.on('entity:created', ({ entity, type, spaceId }) => {
    if (!entity) {
      console.warn('[StoreSync] entity:created received with no entity');
      return;
    }

    // If entity has drop_id, this is a confirmed pending item
    const dropId = entity.drop_id || entity.dropId;

    if (dropId) {
      // Convert to MindDropItem and confirm
      const mindDropItem = dbRecordToMindDropItem(
        { ...entity, space_id: spaceId ?? entity.space_id },
        type,
      );
      useMindDropStore.getState().confirmItem(dropId, mindDropItem);
    } else {
      // Direct creation without pending state - just add to items
      const mindDropItem = dbRecordToMindDropItem(
        { ...entity, space_id: spaceId ?? entity.space_id },
        type,
      );
      useMindDropStore
        .getState()
        .setItems([...Object.values(useMindDropStore.getState().items), mindDropItem]);
    }
  });
  unsubscribers.push(unsubCreated);

  // Listen for entity:updated events
  const unsubUpdated = eventBus.on('entity:updated', ({ entity, type, spaceId }) => {
    if (!entity || !entity.id) {
      console.warn('[StoreSync] entity:updated received with no entity or id');
      return;
    }

    const patch: Partial<MindDropItem> = {};

    // Map relevant fields from entity to patch
    if (entity.title !== undefined) patch.title = entity.title;
    if (entity.name !== undefined) patch.title = entity.name;
    if (entity.tags !== undefined) patch.tags = entity.tags;
    if (entity.time_estimate_minutes !== undefined)
      patch.timeEstimateMinutes = entity.time_estimate_minutes;
    if (entity.due_at !== undefined) patch.dueAt = entity.due_at;
    if (entity.due_date !== undefined) patch.dueAt = entity.due_date;
    if (entity.people !== undefined) patch.people = entity.people;
    if (entity.stage !== undefined) patch.stage = entity.stage;
    if (entity.ai_failed !== undefined) patch.aiFailed = entity.ai_failed;
    if (entity.photos_failed !== undefined) patch.photosFailed = entity.photos_failed;
    if (spaceId !== undefined) patch.spaceId = spaceId;
    if (entity.space_id !== undefined) patch.spaceId = entity.space_id;

    // Update bucket if type changed
    if (type) {
      patch.bucket = typeToBucket(type);
    }

    useMindDropStore.getState().updateItem(entity.id, patch);
  });
  unsubscribers.push(unsubUpdated);

  // Listen for entity:deleted events
  const unsubDeleted = eventBus.on('entity:deleted', ({ id }) => {
    if (!id) {
      console.warn('[StoreSync] entity:deleted received with no id');
      return;
    }

    useMindDropStore.getState().removeItem(id);
  });
  unsubscribers.push(unsubDeleted);

  // Return cleanup function
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}
