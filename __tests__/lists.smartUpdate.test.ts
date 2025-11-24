/**
 * __tests__/lists.smartUpdate.test.ts
 *
 * Phase 3 Lists: Test smart list updates - "add X to Y list"
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemoryRepo } from '../lib/repo/memory';
import { appendItemToList } from '../lib/lists/appendItemToList';
import type { Note, ListItem } from '../lib/types';
import { randomUUID } from 'crypto';

describe('Smart List Updates', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user');
  });

  describe('appendItemToList', () => {
    it('should append single item to existing list by title', async () => {
      // Create shopping list
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Milk', checked: false },
        { id: randomUUID(), text: 'Bread', checked: false },
      ];

      await repo.create({
        type: 'note',
        title: 'Shopping list',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
      });

      // Append "eggs" to shopping list
      const updatedNote = await appendItemToList(repo, {
        listTitle: 'Shopping list',
        itemText: 'Eggs',
      });

      expect(updatedNote.list_items).toHaveLength(3);
      expect(updatedNote.list_items?.[2].text).toBe('Eggs');
      expect(updatedNote.list_items?.[2].checked).toBe(false);
    });

    it('should append multiple comma-separated items', async () => {
      const listItems: ListItem[] = [{ id: randomUUID(), text: 'Apples', checked: false }];

      await repo.create({
        type: 'note',
        title: 'Grocery list',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: listItems,
      });

      const updatedNote = await appendItemToList(repo, {
        listTitle: 'Grocery list',
        itemText: 'Bananas, Oranges, Grapes',
      });

      expect(updatedNote.list_items).toHaveLength(4);
      expect(updatedNote.list_items?.[1].text).toBe('Bananas');
      expect(updatedNote.list_items?.[2].text).toBe('Oranges');
      expect(updatedNote.list_items?.[3].text).toBe('Grapes');
    });

    it('should find list by partial title match (case-insensitive)', async () => {
      await repo.create({
        type: 'note',
        title: 'Grocery Shopping List',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: [],
      });

      const updatedNote = await appendItemToList(repo, {
        listTitle: 'grocery', // Partial, lowercase
        itemText: 'Cheese',
      });

      expect(updatedNote.list_items).toHaveLength(1);
      expect(updatedNote.list_items?.[0].text).toBe('Cheese');
    });

    it('should find list by tag when title not provided', async () => {
      await repo.create({
        type: 'note',
        title: 'Items to buy',
        subtype: 'reference',
        canonicalType: 'log',
        tags: ['shopping', 'groceries'],
        has_list: true,
        list_items: [],
      });

      const updatedNote = await appendItemToList(repo, {
        listTags: ['shopping'],
        itemText: 'Coffee',
      });

      expect(updatedNote.list_items).toHaveLength(1);
      expect(updatedNote.list_items?.[0].text).toBe('Coffee');
    });

    it('should create new list if not found and createIfMissing=true', async () => {
      const newNote = await appendItemToList(repo, {
        listTitle: 'New List',
        itemText: 'First item',
        createIfMissing: true,
      });

      expect(newNote.type).toBe('note');
      expect(newNote.title).toBe('New List');
      expect(newNote.has_list).toBe(true);
      expect(newNote.list_items).toHaveLength(1);
      expect(newNote.list_items?.[0].text).toBe('First item');
    });

    it('should throw error if list not found and createIfMissing=false', async () => {
      await expect(
        appendItemToList(repo, {
          listTitle: 'Nonexistent list',
          itemText: 'Item',
          createIfMissing: false,
        }),
      ).rejects.toThrow('List not found');
    });

    it('should prefer exact title match over partial', async () => {
      // Create two lists
      await repo.create({
        type: 'note',
        title: 'Shopping',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: [{ id: randomUUID(), text: 'A', checked: false }],
      });

      await repo.create({
        type: 'note',
        title: 'Shopping list for trip',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: [{ id: randomUUID(), text: 'B', checked: false }],
      });

      // Search for "Shopping" - should match first one exactly
      const updatedNote = await appendItemToList(repo, {
        listTitle: 'Shopping',
        itemText: 'New item',
      });

      expect(updatedNote.title).toBe('Shopping');
      expect(updatedNote.list_items).toHaveLength(2);
    });

    it('should ignore archived lists', async () => {
      // Create list then archive it
      const oldList = (await repo.create({
        type: 'note',
        title: 'Old list',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: [],
      })) as Note;

      await repo.update({
        id: oldList.id,
        patch: { archived: true },
      });

      // Should create new list instead of using archived one
      const newNote = await appendItemToList(repo, {
        listTitle: 'Old list',
        itemText: 'Item',
        createIfMissing: true,
      });

      // Should be a new note, not the archived one
      const allNotes = await repo.getAll();
      const nonArchivedLists = allNotes.filter(
        (n) => n.type === 'note' && n.has_list && !n.archived,
      );

      expect(nonArchivedLists).toHaveLength(1);
      expect(newNote.archived).toBeFalsy();
    });

    it('should create list with tags when provided', async () => {
      const newNote = await appendItemToList(repo, {
        listTitle: 'Tagged list',
        listTags: ['work', 'projects'],
        itemText: 'Task 1',
        createIfMissing: true,
      });

      expect(newNote.tags).toContain('work');
      expect(newNote.tags).toContain('projects');
    });

    it('should use default subtype for new lists', async () => {
      const newNote = await appendItemToList(repo, {
        listTitle: 'Idea list',
        itemText: 'Brainstorm',
        createIfMissing: true,
        defaultSubtype: 'idea',
      });

      expect(newNote.subtype).toBe('idea');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle "add milk to shopping list" command', async () => {
      // Pre-existing shopping list
      await repo.create({
        type: 'note',
        title: 'Shopping List',
        subtype: 'reference',
        canonicalType: 'log',
        has_list: true,
        list_items: [{ id: randomUUID(), text: 'Bread', checked: false }],
      });

      // Command: "add milk to shopping list"
      const updatedNote = await appendItemToList(repo, {
        listTitle: 'shopping list',
        itemText: 'Milk',
      });

      expect(updatedNote.list_items).toHaveLength(2);
      expect(updatedNote.list_items?.some((item) => item.text === 'Milk')).toBe(true);
    });

    it('should handle "remember to buy bread and eggs" (create if missing)', async () => {
      // No existing list
      const newNote = await appendItemToList(repo, {
        listTitle: 'Groceries',
        listTags: ['shopping'],
        itemText: 'Bread, Eggs',
        createIfMissing: true,
      });

      expect(newNote.title).toBe('Groceries');
      expect(newNote.list_items).toHaveLength(2);
      expect(newNote.list_items?.[0].text).toBe('Bread');
      expect(newNote.list_items?.[1].text).toBe('Eggs');
    });

    it('should handle "add yoga to morning routine" (finds by tag)', async () => {
      await repo.create({
        type: 'note',
        title: 'Daily Routine',
        subtype: 'reference',
        canonicalType: 'log',
        tags: ['morning', 'routine'],
        has_list: true,
        list_items: [{ id: randomUUID(), text: 'Meditation', checked: false }],
      });

      const updatedNote = await appendItemToList(repo, {
        listTags: ['morning'],
        itemText: 'Yoga',
      });

      expect(updatedNote.list_items).toHaveLength(2);
      expect(updatedNote.list_items?.[1].text).toBe('Yoga');
    });
  });
});
