import { MemoryRepo } from '../../lib/repo/memory';
import type { Note } from '../../lib/types';

describe('Repo filtering features', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user');
  });

  describe('listByType with options', () => {
    beforeEach(async () => {
      // Create test data with different space assignments
      await repo.create({
        type: 'habit',
        title: 'Habit in Space A',
        frequency: 'daily',
        subtype: 'start_habit',
        space_id: 'space-a',
        ai_placed: false,
      });

      await repo.create({
        type: 'habit',
        title: 'Habit Unassigned',
        frequency: 'daily',
        subtype: 'start_habit',
        space_id: null,
        ai_placed: false,
      });

      await repo.create({
        type: 'todo',
        title: 'Todo in Space A',
        space_id: 'space-a',
        ai_placed: false,
      });

      await repo.create({
        type: 'todo',
        title: 'Todo AI Placed',
        space_id: null,
        ai_placed: true,
      });

      await repo.create({
        type: 'note',
        title: 'Journal Entry',
        body: 'My thoughts',
        subtype: 'journal',
        space_id: null,
        ai_placed: false,
      });

      await repo.create({
        type: 'note',
        title: 'Idea Note',
        body: 'A great idea',
        subtype: 'idea',
        space_id: 'space-a',
        ai_placed: true,
      });

      await repo.create({
        type: 'note',
        title: 'Catchall Note',
        body: 'Quick capture',
        subtype: 'catchall',
        space_id: null,
        ai_placed: true,
      });
    });

    it('returns all items when no options provided (Everywhere)', async () => {
      const habits = await repo.listByType('habit');
      expect(habits.length).toBe(3); // 1 in space + 1 unassigned + 1 seed
    });

    it('filters by specific spaceId', async () => {
      const habitsInSpaceA = await repo.listByType('habit', { spaceId: 'space-a' });
      expect(habitsInSpaceA.length).toBe(1);
      expect(habitsInSpaceA[0].title).toBe('Habit in Space A');
    });

    it('filters by unassignedOnly', async () => {
      const unassignedHabits = await repo.listByType('habit', { unassignedOnly: true });
      expect(unassignedHabits.length).toBeGreaterThanOrEqual(1);
      expect(unassignedHabits.every((h) => h.space_id === null)).toBe(true);
    });

    it('filters notes by subtypes', async () => {
      const journalNotes = await repo.listByType('note', { subtypes: ['journal'] });
      expect(journalNotes.length).toBe(2); // 1 created + 1 seed
      expect(journalNotes.every((n) => (n as Note).subtype === 'journal')).toBe(true);

      const ideaAndCatchall = await repo.listByType('note', { subtypes: ['idea', 'catchall'] });
      expect(ideaAndCatchall.length).toBe(2);
    });

    it('combines space filter and subtype filter', async () => {
      const ideasInSpaceA = await repo.listByType('note', {
        spaceId: 'space-a',
        subtypes: ['idea'],
      });
      expect(ideasInSpaceA.length).toBe(1);
      expect((ideasInSpaceA[0] as Note).subtype).toBe('idea');
    });
  });

  describe('countUnsorted', () => {
    it('counts all ai_placed items across types', async () => {
      await repo.create({
        type: 'habit',
        title: 'AI Habit',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: true,
      });

      await repo.create({
        type: 'todo',
        title: 'AI Todo',
        ai_placed: true,
      });

      await repo.create({
        type: 'note',
        title: 'AI Note',
        subtype: 'catchall',
        ai_placed: true,
      });

      await repo.create({
        type: 'todo',
        title: 'Manual Todo',
        ai_placed: false,
      });

      const count = await repo.countUnsorted();
      expect(count).toBe(3); // Only the 3 ai_placed items
    });

    it('returns 0 when no ai_placed items exist', async () => {
      const count = await repo.countUnsorted();
      expect(count).toBe(0);
    });
  });

  describe('Tag and People stubs', () => {
    it('listTags returns empty array', async () => {
      const tags = await repo.listTags();
      expect(tags).toEqual([]);
    });

    it('listPeople returns empty array', async () => {
      const people = await repo.listPeople();
      expect(people).toEqual([]);
    });

    it('listLinkedTags returns empty array', async () => {
      const tags = await repo.listLinkedTags({ type: 'habit', id: 'habit-1' });
      expect(tags).toEqual([]);
    });

    it('listLinkedPeople returns empty array', async () => {
      const people = await repo.listLinkedPeople({ type: 'todo', id: 'todo-1' });
      expect(people).toEqual([]);
    });
  });
});
