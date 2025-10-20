import { MemoryRepo } from '../lib/repo/memory';
import { spaceInsertSchema } from '../lib/schemas';
import type { Habit, Todo, Note } from '../lib/types';

describe('Spaces Repository', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user');
  });

  describe('createSpace + listSpaces', () => {
    it('creates a space and lists it', async () => {
      const input = spaceInsertSchema.parse({ name: 'Work', theme: 'deepTeal' });
      const created = await repo.createSpace(input);

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Work');
      expect(created.theme).toBe('deepTeal');
      expect(created.owner_id).toBe('test-user');

      const list = await repo.listSpaces();
      expect(list.some((s) => s.id === created.id)).toBe(true);
    });

    it('defaults theme to deepTeal when not provided', async () => {
      const input = spaceInsertSchema.parse({ name: 'Home' });
      const created = await repo.createSpace(input);

      expect(created.theme).toBe('deepTeal');
    });

    it('stores optional icon', async () => {
      const input = spaceInsertSchema.parse({ name: 'Fitness', icon: '🏋️' });
      const created = await repo.createSpace(input);

      expect(created.icon).toBe('🏋️');
    });
  });

  describe('getSpaceById', () => {
    it('retrieves space by id', async () => {
      const created = await repo.createSpace({ name: 'Test Space' });
      const retrieved = await repo.getSpaceById(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Space');
    });

    it('returns null for non-existent space', async () => {
      const retrieved = await repo.getSpaceById('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateSpace', () => {
    it('updates space properties', async () => {
      const created = await repo.createSpace({ name: 'Original' });
      const updated = await repo.updateSpace(created.id, {
        name: 'Updated',
        theme: 'mint',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.theme).toBe('mint');
    });
  });

  describe('deleteSpace', () => {
    it('deletes a space', async () => {
      const created = await repo.createSpace({ name: 'To Delete' });
      await repo.deleteSpace(created.id);

      const retrieved = await repo.getSpaceById(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('listBySpaceGrouped', () => {
    it('groups items by type for a space', async () => {
      const space = await repo.createSpace({ name: 'Test Space' });

      // Create items in the space
      await repo.create({
        type: 'habit',
        name: 'Test Habit',
        frequency: 'daily',
        subtype: 'start_habit',
        space_id: space.id,
      });

      await repo.create({
        type: 'todo',
        name: 'Test Todo',
        space_id: space.id,
      });

      await repo.create({
        type: 'note',
        title: 'Test Note',
        subtype: 'journal',
        space_id: space.id,
      });

      const grouped = await repo.listBySpaceGrouped(space.id);

      expect(grouped.habits).toHaveLength(1);
      expect(grouped.todos).toHaveLength(1);
      expect(grouped.notes).toHaveLength(1);
      expect((grouped.habits[0] as Habit).name).toBe('Test Habit');
      expect((grouped.todos[0] as Todo).name).toBe('Test Todo');
      expect((grouped.notes[0] as Note).title).toBe('Test Note');
    });

    it('returns empty arrays for space with no items', async () => {
      const space = await repo.createSpace({ name: 'Empty Space' });
      const grouped = await repo.listBySpaceGrouped(space.id);

      expect(grouped.habits).toHaveLength(0);
      expect(grouped.todos).toHaveLength(0);
      expect(grouped.notes).toHaveLength(0);
    });
  });
});
