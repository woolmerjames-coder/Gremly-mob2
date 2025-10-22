/**
 * Phase 10.2: Lists and ListItems tests (memory-backed, no DB)
 */

import { MemoryRepo } from '../lib/repo/memory';

describe('MemoryRepo - Lists (Phase 10.2)', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-123');
  });

  describe('getOrCreateList', () => {
    it('should create a new shopping list and add items in order', async () => {
      // Arrange: Create a shopping list
      const list = await repo.getOrCreateList('shopping');

      // Assert: List has stable id and correct key/name
      expect(list.id).toBeDefined();
      expect(list.key).toBe('shopping');
      expect(list.name).toBe('Shopping'); // Title case
      expect(list.owner_id).toBe('test-user-123');

      // Act: Add two items
      const item1 = await repo.addListItem(list.id, 'oats');
      const item2 = await repo.addListItem(list.id, 'bananas', { qty: 6, unit: 'pcs' });

      // Assert: Items have correct structure
      expect(item1.id).toBeDefined();
      expect(item1.list_id).toBe(list.id);
      expect(item1.label).toBe('oats');
      expect(item1.qty).toBeNull();
      expect(item1.unit).toBeNull();

      expect(item2.id).toBeDefined();
      expect(item2.list_id).toBe(list.id);
      expect(item2.label).toBe('bananas');
      expect(item2.qty).toBe(6);
      expect(item2.unit).toBe('pcs');

      // Act: List all items
      const items = await repo.listItems(list.id);

      // Assert: Two items in ascending created_at order
      expect(items).toHaveLength(2);
      expect(items[0].label).toBe('oats');
      expect(items[1].label).toBe('bananas');
      expect(items[1].qty).toBe(6);
      expect(items[1].unit).toBe('pcs');

      // Verify order by created_at
      const time1 = new Date(items[0].created_at!).getTime();
      const time2 = new Date(items[1].created_at!).getTime();
      expect(time1).toBeLessThanOrEqual(time2);
    });

    it('should return existing list on subsequent calls', async () => {
      // Arrange: Create list first time
      const list1 = await repo.getOrCreateList('reading');

      // Act: Get same list again
      const list2 = await repo.getOrCreateList('reading');

      // Assert: Same list returned (same id)
      expect(list1.id).toBe(list2.id);
      expect(list2.key).toBe('reading');
      expect(list2.name).toBe('Reading');
    });

    it('should create list with custom name if provided', async () => {
      // Act: Create with custom name
      const list = await repo.getOrCreateList('custom', { name: 'My Custom List' });

      // Assert: Custom name used
      expect(list.key).toBe('custom');
      expect(list.name).toBe('My Custom List');
    });

    it('should handle space-scoped lists', async () => {
      // Act: Create list with space_id
      const list = await repo.getOrCreateList('packing', { spaceId: 'space-123' });

      // Assert: space_id preserved
      expect(list.key).toBe('packing');
      expect(list.space_id).toBe('space-123');
    });
  });

  describe('findListByKey', () => {
    it('should return null if list does not exist', async () => {
      // Act
      const result = await repo.findListByKey('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should find existing list by key', async () => {
      // Arrange: Create list
      const created = await repo.getOrCreateList('shopping');

      // Act: Find it
      const found = await repo.findListByKey('shopping');

      // Assert: Same list
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.key).toBe('shopping');
    });

    it('should filter by space_id when provided', async () => {
      // Arrange: Create two lists with same key but different spaces
      const list1 = await repo.getOrCreateList('tasks', { spaceId: 'space-1' });
      const _list2 = await repo.getOrCreateList('tasks', { spaceId: 'space-2' });

      // Act: Find by key and space
      const found = await repo.findListByKey('tasks', { spaceId: 'space-1' });

      // Assert: Correct list returned
      expect(found?.id).toBe(list1.id);
      expect(found?.space_id).toBe('space-1');
    });
  });

  describe('listItems', () => {
    it('should return empty array for list with no items', async () => {
      // Arrange: Create empty list
      const list = await repo.getOrCreateList('empty');

      // Act
      const items = await repo.listItems(list.id);

      // Assert
      expect(items).toEqual([]);
    });

    it('should preserve meta_json', async () => {
      // Arrange
      const list = await repo.getOrCreateList('shopping');
      await repo.addListItem(list.id, 'milk', {
        meta_json: { brand: 'organic', urgent: true },
      });

      // Act
      const items = await repo.listItems(list.id);

      // Assert
      expect(items[0].meta_json).toEqual({ brand: 'organic', urgent: true });
    });
  });
});
