/**
 * MindDrop Store Tests
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMindDropStore, useMindDropItems } from '../../../lib/stores/mindDropStore';
import type { MindDropItem, PendingItem } from '../../../lib/minddrop/types';

describe('mindDropStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useMindDropStore.getState().clearAll();
  });

  // Helper to create a valid PendingItem
  const createPendingItem = (overrides: Partial<PendingItem> = {}): PendingItem => ({
    dropId: 'drop-123',
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
    dropId: 'drop-123',
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

  describe('addPendingItem', () => {
    it('should add pending item', () => {
      const pending = createPendingItem();

      act(() => {
        useMindDropStore.getState().addPendingItem(pending);
      });

      const state = useMindDropStore.getState();
      expect(state.pendingItems[pending.dropId]).toEqual(pending);
      expect(Object.keys(state.pendingItems)).toHaveLength(1);
    });
  });

  describe('confirmItem', () => {
    it('should confirm item and remove pending', () => {
      const pending = createPendingItem({ dropId: 'drop-abc' });
      const confirmed = createMindDropItem({ id: 'item-xyz', dropId: 'drop-abc' });

      act(() => {
        useMindDropStore.getState().addPendingItem(pending);
      });

      // Verify pending item exists
      expect(useMindDropStore.getState().pendingItems['drop-abc']).toBeDefined();

      act(() => {
        useMindDropStore.getState().confirmItem('drop-abc', confirmed);
      });

      const state = useMindDropStore.getState();

      // Pending should be removed
      expect(state.pendingItems['drop-abc']).toBeUndefined();
      expect(Object.keys(state.pendingItems)).toHaveLength(0);

      // Confirmed item should exist
      expect(state.items['item-xyz']).toEqual(confirmed);
      expect(Object.keys(state.items)).toHaveLength(1);
    });
  });

  describe('updateItem', () => {
    it('should update existing item', () => {
      const item = createMindDropItem({ id: 'item-update', title: 'Original Title' });

      act(() => {
        useMindDropStore.getState().confirmItem('drop-123', item);
      });

      const originalUpdatedAt = useMindDropStore.getState().items['item-update'].updatedAt;

      // Small delay to ensure updatedAt changes
      act(() => {
        useMindDropStore.getState().updateItem('item-update', { title: 'New Title' });
      });

      const state = useMindDropStore.getState();
      expect(state.items['item-update'].title).toBe('New Title');
      expect(state.items['item-update'].updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should ignore update for non-existent item', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const stateBefore = { ...useMindDropStore.getState() };

      act(() => {
        useMindDropStore.getState().updateItem('non-existent-id', { title: 'Should Not Work' });
      });

      const stateAfter = useMindDropStore.getState();

      // State should be unchanged
      expect(stateAfter.items).toEqual(stateBefore.items);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-existent-id'));

      consoleSpy.mockRestore();
    });
  });

  describe('removeItem', () => {
    it('should remove item', () => {
      const item = createMindDropItem({ id: 'item-to-remove' });

      act(() => {
        useMindDropStore.getState().confirmItem('drop-123', item);
      });

      expect(useMindDropStore.getState().items['item-to-remove']).toBeDefined();

      act(() => {
        useMindDropStore.getState().removeItem('item-to-remove');
      });

      const state = useMindDropStore.getState();
      expect(state.items['item-to-remove']).toBeUndefined();
      expect(Object.keys(state.items)).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all', () => {
      const pending = createPendingItem({ dropId: 'pending-1' });
      const item = createMindDropItem({ id: 'item-1', dropId: 'drop-other' });

      act(() => {
        useMindDropStore.getState().addPendingItem(pending);
        useMindDropStore.getState().confirmItem('drop-other', item);
      });

      // Verify items exist
      expect(Object.keys(useMindDropStore.getState().pendingItems)).toHaveLength(1);
      expect(Object.keys(useMindDropStore.getState().items)).toHaveLength(1);

      act(() => {
        useMindDropStore.getState().clearAll();
      });

      const state = useMindDropStore.getState();
      expect(Object.keys(state.pendingItems)).toHaveLength(0);
      expect(Object.keys(state.items)).toHaveLength(0);
    });
  });

  describe('useMindDropItems', () => {
    it('returns combined pending and confirmed items', () => {
      // Add a pending item (newer)
      const pending = createPendingItem({
        dropId: 'pending-drop',
        text: 'Pending task',
        createdAt: '2025-12-10T12:00:00.000Z',
      });

      // Add a confirmed item (older)
      const confirmed = createMindDropItem({
        id: 'confirmed-item',
        dropId: 'confirmed-drop',
        title: 'Confirmed task',
        createdAt: '2025-12-10T10:00:00.000Z',
      });

      act(() => {
        useMindDropStore.getState().addPendingItem(pending);
        useMindDropStore.getState().confirmItem('confirmed-drop', confirmed);
      });

      const { result } = renderHook(() => useMindDropItems());

      // Should return both items
      expect(result.current).toHaveLength(2);

      // First item should be the pending one (newest, isOptimistic: true)
      expect(result.current[0].id).toBe('pending-pending-drop');
      expect(result.current[0].isOptimistic).toBe(true);
      expect(result.current[0].title).toBe('Pending task');

      // Second item should be the confirmed one
      expect(result.current[1].id).toBe('confirmed-item');
      expect(result.current[1].isOptimistic).toBe(false);
      expect(result.current[1].title).toBe('Confirmed task');
    });

    it('filters by bucket when specified', () => {
      const todoPending = createPendingItem({
        dropId: 'todo-pending',
        predictedBucket: 'todo',
      });
      const habitPending = createPendingItem({
        dropId: 'habit-pending',
        predictedBucket: 'habit',
      });
      const todoConfirmed = createMindDropItem({
        id: 'todo-confirmed',
        dropId: 'todo-drop',
        bucket: 'todo',
      });
      const logConfirmed = createMindDropItem({
        id: 'log-confirmed',
        dropId: 'log-drop',
        bucket: 'log',
      });

      act(() => {
        useMindDropStore.getState().addPendingItem(todoPending);
        useMindDropStore.getState().addPendingItem(habitPending);
        useMindDropStore.getState().confirmItem('todo-drop', todoConfirmed);
        useMindDropStore.getState().confirmItem('log-drop', logConfirmed);
      });

      const { result } = renderHook(() => useMindDropItems('todo'));

      // Should only return todo items
      expect(result.current).toHaveLength(2);
      expect(result.current.every((item) => item.bucket === 'todo')).toBe(true);
    });
  });
});
