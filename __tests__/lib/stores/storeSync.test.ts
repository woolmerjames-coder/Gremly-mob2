/**
 * Store Sync Tests
 *
 * Integration tests for the EventBus to Zustand store synchronization.
 * Uses the real eventBus to test actual event flow.
 */

import { act } from '@testing-library/react-native';
import { useMindDropStore } from '../../../lib/stores/mindDropStore';
import { initializeStoreSync, dbRecordToMindDropItem } from '../../../lib/stores/storeSync';
import { eventBus } from '../../../lib/events/EventBus';
import type { MindDropItem, PendingItem } from '../../../lib/minddrop/types';

// Keep track of cleanup functions to call after each test
let cleanupFn: (() => void) | null = null;

describe('storeSync', () => {
  // Reset store before each test
  beforeEach(() => {
    useMindDropStore.getState().clearAll();
  });

  // Clean up event subscriptions after each test
  afterEach(() => {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
  });

  // Helper to create a valid PendingItem
  const createPendingItem = (overrides: Partial<PendingItem> = {}): PendingItem => ({
    dropId: 'test-123',
    text: 'Test pending item',
    predictedBucket: 'todo',
    predictedSubtype: null,
    createdAt: '2025-12-10T10:00:00.000Z',
    spaceId: null,
    ...overrides,
  });

  // Helper to create a valid MindDropItem
  const createMindDropItem = (overrides: Partial<MindDropItem> = {}): MindDropItem => ({
    id: 'item-456',
    dropId: 'test-123',
    bucket: 'todo',
    subtype: null,
    originalText: 'Test item',
    title: 'Test item',
    tags: [],
    timeEstimateMinutes: null,
    dueAt: null,
    people: [],
    stage: 'classified',
    createdAt: '2025-12-10T10:00:00.000Z',
    updatedAt: '2025-12-10T10:00:00.000Z',
    spaceId: null,
    isOptimistic: false,
    aiFailed: false,
    photosFailed: false,
    ...overrides,
  });

  describe('entity:created event', () => {
    it('should confirm pending item on entity:created event', () => {
      // Add a pending item to store
      const pending = createPendingItem({ dropId: 'test-123' });
      act(() => {
        useMindDropStore.getState().addPendingItem(pending);
      });

      // Verify pending item exists
      expect(useMindDropStore.getState().pendingItems['test-123']).toBeDefined();

      // Initialize store sync (subscribes to events)
      cleanupFn = initializeStoreSync();

      // Emit entity:created event with matching drop_id
      act(() => {
        eventBus.emit('entity:created', {
          entity: {
            id: 'confirmed-item-id',
            drop_id: 'test-123',
            title: 'Confirmed Task',
            created_at: '2025-12-10T10:00:00.000Z',
            updated_at: '2025-12-10T10:00:00.000Z',
          },
          type: 'todo',
          spaceId: null,
        });
      });

      const state = useMindDropStore.getState();

      // Pending item should be removed
      expect(state.pendingItems['test-123']).toBeUndefined();
      expect(Object.keys(state.pendingItems)).toHaveLength(0);

      // Confirmed item should be added
      expect(state.items['confirmed-item-id']).toBeDefined();
      expect(state.items['confirmed-item-id'].title).toBe('Confirmed Task');
      expect(state.items['confirmed-item-id'].bucket).toBe('todo');
      expect(state.items['confirmed-item-id'].dropId).toBe('test-123');
    });
  });

  describe('entity:updated event', () => {
    it('should update item on entity:updated event', () => {
      // Add a confirmed item to store
      const item = createMindDropItem({
        id: 'update-test-id',
        title: 'Original Title',
      });

      act(() => {
        useMindDropStore.getState().confirmItem('drop-xyz', item);
      });

      // Verify item exists with original title
      expect(useMindDropStore.getState().items['update-test-id'].title).toBe('Original Title');

      // Initialize store sync
      cleanupFn = initializeStoreSync();

      // Emit entity:updated event with new title
      act(() => {
        eventBus.emit('entity:updated', {
          entity: {
            id: 'update-test-id',
            title: 'Updated Title',
          },
          type: 'todo',
          spaceId: null,
        });
      });

      const state = useMindDropStore.getState();

      // Item should have updated title
      expect(state.items['update-test-id'].title).toBe('Updated Title');
    });
  });

  describe('entity:deleted event', () => {
    it('should remove item on entity:deleted event', () => {
      // Add a confirmed item to store
      const item = createMindDropItem({
        id: 'delete-test-id',
        title: 'Item to delete',
      });

      act(() => {
        useMindDropStore.getState().confirmItem('drop-abc', item);
      });

      // Verify item exists
      expect(useMindDropStore.getState().items['delete-test-id']).toBeDefined();

      // Initialize store sync
      cleanupFn = initializeStoreSync();

      // Emit entity:deleted event
      act(() => {
        eventBus.emit('entity:deleted', {
          id: 'delete-test-id',
          type: 'todo',
          spaceId: null,
        });
      });

      const state = useMindDropStore.getState();

      // Item should be removed
      expect(state.items['delete-test-id']).toBeUndefined();
      expect(Object.keys(state.items)).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from all events on cleanup', () => {
      cleanupFn = initializeStoreSync();

      // Call cleanup immediately
      cleanupFn();
      cleanupFn = null; // Prevent afterEach from calling again

      // Add item and emit event - should not affect store since unsubscribed
      act(() => {
        useMindDropStore.getState().addPendingItem(createPendingItem({ dropId: 'after-cleanup' }));
      });

      act(() => {
        eventBus.emit('entity:created', {
          entity: {
            id: 'should-not-add',
            drop_id: 'after-cleanup',
            title: 'Test',
          },
          type: 'todo',
        });
      });

      // Pending should still exist (not confirmed) since we unsubscribed
      expect(useMindDropStore.getState().pendingItems['after-cleanup']).toBeDefined();
      expect(useMindDropStore.getState().items['should-not-add']).toBeUndefined();
    });
  });

  describe('dbRecordToMindDropItem', () => {
    it('should convert database record to MindDropItem format', () => {
      const record = {
        id: 'record-123',
        drop_id: 'drop-456',
        title: 'Test Task',
        tags: ['work', 'urgent'],
        time_estimate_minutes: 30,
        due_at: '2025-12-15T10:00:00.000Z',
        created_at: '2025-12-10T10:00:00.000Z',
        updated_at: '2025-12-10T10:00:00.000Z',
      };

      const result = dbRecordToMindDropItem(record, 'todo');

      expect(result.id).toBe('record-123');
      expect(result.dropId).toBe('drop-456');
      expect(result.bucket).toBe('todo');
      expect(result.title).toBe('Test Task');
      expect(result.tags).toEqual(['work', 'urgent']);
      expect(result.timeEstimateMinutes).toBe(30);
      expect(result.dueAt).toBe('2025-12-15T10:00:00.000Z');
      expect(result.isOptimistic).toBe(false);
    });

    it('should map note type to log bucket', () => {
      const record = { id: 'note-1', title: 'My Note' };
      const result = dbRecordToMindDropItem(record, 'note');

      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('general');
    });
  });
});
