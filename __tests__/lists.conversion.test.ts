/**
 * __tests__/lists.conversion.test.ts
 *
 * Phase 3 Lists: Test list conversions (log ↔ todo)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemoryRepo } from '../lib/repo/memory';
import { convertLogListToTodo } from '../lib/lists/convertLogListToTodo';
import { convertTodoToLogList } from '../lib/lists/convertTodoToLogList';
import type { Note, Todo, ListItem } from '../lib/types';
import { randomUUID } from 'crypto';

describe('List Conversions', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user');
  });

  describe('convertLogListToTodo', () => {
    it('should convert list note to todo with has_list=true', async () => {
      // Create a note with a shopping list
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Milk', checked: false },
        { id: randomUUID(), text: 'Bread', checked: false },
        { id: randomUUID(), text: 'Eggs', checked: true },
      ];

      const note = (await repo.create({
        type: 'note',
        title: 'Shopping list',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
      })) as Note;

      // Convert to todo
      const { todo, archivedNote } = await convertLogListToTodo(repo, note.id);

      // Verify todo structure
      expect(todo.type).toBe('todo');
      expect(todo.has_list).toBe(true);
      expect(todo.list_items).toHaveLength(3);
      expect(todo.list_items?.[0].text).toBe('Milk');
      expect(todo.list_items?.[0].checked).toBe(false);
      expect(todo.list_items?.[2].text).toBe('Eggs');

      // Verify title generation
      expect(todo.name).toBe('Buy groceries'); // Smart title from "Shopping list"

      // Verify original note archived
      expect(archivedNote.archived).toBe(true);
      expect(archivedNote.why_string).toContain(`Converted to todo ${todo.id}`);
    });

    it('should reset checked state when preserveCheckedState=false', async () => {
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Task 1', checked: true },
        { id: randomUUID(), text: 'Task 2', checked: true },
      ];

      const note = (await repo.create({
        type: 'note',
        title: 'Completed tasks',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
      })) as Note;

      const { todo } = await convertLogListToTodo(repo, note.id, {
        preserveCheckedState: false,
      });

      // All items should be unchecked
      expect(todo.list_items?.[0].checked).toBe(false);
      expect(todo.list_items?.[1].checked).toBe(false);
    });

    it('should preserve checked state when preserveCheckedState=true', async () => {
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Task 1', checked: true },
        { id: randomUUID(), text: 'Task 2', checked: false },
      ];

      const note = (await repo.create({
        type: 'note',
        title: 'Mixed tasks',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
      })) as Note;

      const { todo } = await convertLogListToTodo(repo, note.id, {
        preserveCheckedState: true,
      });

      expect(todo.list_items?.[0].checked).toBe(true);
      expect(todo.list_items?.[1].checked).toBe(false);
    });

    it('should preserve drop_id for Mind Drop traceability', async () => {
      const listItems: ListItem[] = [{ id: randomUUID(), text: 'Item', checked: false }];

      const dropId = randomUUID();
      const note = (await repo.create({
        type: 'note',
        title: 'List from Mind Drop',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        dropId: dropId,
        has_list: true,
        list_items: listItems,
      })) as Note;

      const { todo } = await convertLogListToTodo(repo, note.id);

      expect(todo.drop_id).toBe(dropId);
    });

    it('should preserve views.minddrop_stage', async () => {
      const listItems: ListItem[] = [{ id: randomUUID(), text: 'Item', checked: false }];

      const note = (await repo.create({
        type: 'note',
        title: 'List',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
        views: {
          minddrop_stage: 'b',
          ai_pending: true,
        },
      })) as Note;

      const { todo } = await convertLogListToTodo(repo, note.id);

      expect(todo.views?.minddrop_stage).toBe('b');
      expect(todo.views?.ai_pending).toBe(true);
    });

    it('should throw error if note has no list', async () => {
      const note = (await repo.create({
        type: 'note',
        title: 'Regular note',
        body: 'Just some text',
        subtype: 'idea',
        canonicalType: 'log',
        labels: ['log'],
      })) as Note;

      await expect(convertLogListToTodo(repo, note.id)).rejects.toThrow(
        'does not have a list to convert',
      );
    });

    it('should generate smart titles based on note title patterns', async () => {
      const testCases: Array<{ title: string; expected: string }> = [
        { title: 'Shopping list', expected: 'Buy groceries' },
        { title: 'Grocery list', expected: 'Buy groceries' },
        { title: 'Packing list', expected: 'Finish packing' },
        { title: 'To-Do list', expected: 'Complete tasks' },
        { title: 'Chores', expected: 'Do chores' },
        { title: 'Errands to run', expected: 'Run errands' },
        { title: 'Custom title', expected: 'Custom title' }, // Fallback
      ];

      for (const { title, expected } of testCases) {
        const listItems: ListItem[] = [{ id: randomUUID(), text: 'Item', checked: false }];

        const note = (await repo.create({
          type: 'note',
          title,
          subtype: 'reference',
          canonicalType: 'log',
          labels: ['log'],
          has_list: true,
          list_items: listItems,
        })) as Note;

        const { todo } = await convertLogListToTodo(repo, note.id);
        expect(todo.name).toBe(expected);
      }
    });

    it('should use first list item as title if note has no title', async () => {
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Buy milk', checked: false },
        { id: randomUUID(), text: 'Call dentist', checked: false },
      ];

      const note = (await repo.create({
        type: 'note',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: listItems,
      })) as Note;

      const { todo } = await convertLogListToTodo(repo, note.id);
      expect(todo.name).toBe('Buy milk');
    });
  });

  describe('convertTodoToLogList', () => {
    it('should convert todo with list to reference note', async () => {
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Step 1', checked: true },
        { id: randomUUID(), text: 'Step 2', checked: false },
        { id: randomUUID(), text: 'Step 3', checked: false },
      ];

      const todo = (await repo.create({
        type: 'todo',
        name: 'Complete project',
        canonicalType: 'todo',
        labels: ['todo'],
        has_list: true,
        list_items: listItems,
      })) as Todo;

      const { note, archivedTodo } = await convertTodoToLogList(repo, todo.id);

      // Verify note structure
      expect(note.type).toBe('note');
      expect(note.subtype).toBe('reference');
      expect(note.has_list).toBe(true);
      expect(note.list_items).toHaveLength(3);
      expect(note.list_items?.[0].text).toBe('Step 1');
      expect(note.list_items?.[0].checked).toBe(true);
      expect(note.title).toBe('Complete project');

      // Verify todo archived
      expect(archivedTodo.archived).toBe(true);
      expect(archivedTodo.why_string).toContain(`Converted to note ${note.id}`);
    });

    it('should reset checked state when preserveCheckedState=false', async () => {
      const listItems: ListItem[] = [
        { id: randomUUID(), text: 'Done', checked: true },
        { id: randomUUID(), text: 'Not done', checked: false },
      ];

      const todo = (await repo.create({
        type: 'todo',
        name: 'Tasks',
        canonicalType: 'todo',
        labels: ['todo'],
        has_list: true,
        list_items: listItems,
      })) as Todo;

      const { note } = await convertTodoToLogList(repo, todo.id, {
        preserveCheckedState: false,
      });

      expect(note.list_items?.[0].checked).toBe(false);
      expect(note.list_items?.[1].checked).toBe(false);
    });

    it('should create list from todo name if no list_items', async () => {
      const todo = (await repo.create({
        type: 'todo',
        name: 'Simple task',
        canonicalType: 'todo',
        labels: ['todo'],
      })) as Todo;

      const { note } = await convertTodoToLogList(repo, todo.id);

      expect(note.has_list).toBe(true);
      expect(note.list_items).toHaveLength(1);
      expect(note.list_items?.[0].text).toBe('Simple task');
      expect(note.list_items?.[0].checked).toBe(false);
    });

    it('should preserve drop_id and views', async () => {
      const listItems: ListItem[] = [{ id: randomUUID(), text: 'Item', checked: false }];

      const dropId = randomUUID();
      const todo = (await repo.create({
        type: 'todo',
        name: 'Task',
        canonicalType: 'todo',
        labels: ['todo'],
        dropId: dropId,
        has_list: true,
        list_items: listItems,
        views: {
          minddrop_stage: 'a',
          ai_pending: false,
        },
      })) as Todo;

      const { note } = await convertTodoToLogList(repo, todo.id);

      expect(note.drop_id).toBe(dropId);
      expect(note.views?.minddrop_stage).toBe('a');
      expect(note.views?.ai_pending).toBe(false);
    });
  });

  describe('Round-trip conversions', () => {
    it('should preserve list data through note→todo→note conversion', async () => {
      const originalListItems: ListItem[] = [
        { id: randomUUID(), text: 'Alpha', checked: false },
        { id: randomUUID(), text: 'Beta', checked: true },
        { id: randomUUID(), text: 'Gamma', checked: false },
      ];

      // Create original note
      const note1 = (await repo.create({
        type: 'note',
        title: 'Original list',
        subtype: 'reference',
        canonicalType: 'log',
        labels: ['log'],
        has_list: true,
        list_items: originalListItems,
      })) as Note;

      // Convert to todo
      const { todo } = await convertLogListToTodo(repo, note1.id, {
        preserveCheckedState: true,
      });

      // Convert back to note
      const { note: note2 } = await convertTodoToLogList(repo, todo.id, {
        preserveCheckedState: true,
      });

      // Verify data preserved
      expect(note2.list_items).toHaveLength(3);
      expect(note2.list_items?.[0].text).toBe('Alpha');
      expect(note2.list_items?.[0].checked).toBe(false);
      expect(note2.list_items?.[1].text).toBe('Beta');
      expect(note2.list_items?.[1].checked).toBe(true);
      expect(note2.list_items?.[2].text).toBe('Gamma');
      expect(note2.list_items?.[2].checked).toBe(false);
    });
  });
});
