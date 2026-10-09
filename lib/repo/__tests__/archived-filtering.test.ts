/**
 * Archived Filtering Tests
 *
 * Verifies that archived items are excluded from various repository queries.
 * These tests ensure the filtering behavior is consistent across:
 * - search
 * - listDueToday
 * - listTodayMerged
 *
 * Archive states tested:
 * - Todos: status='archived' and/or archived=true
 * - Habits: archived=true
 * - Notes: archived=true
 */

import { MemoryRepo } from '../memory';
import type { Todo, Habit, Note } from '../../types';

describe('Archived Filtering', () => {
  const userId = 'test-user-archived-filtering';
  const testSpaceId = 'space-archived-test-123';
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo(userId);
  });

  // =========================================================================
  // Helper to create and archive items
  // =========================================================================

  async function createTodo(
    overrides: {
      name?: string;
      space_id?: string | null;
      due_date?: string | null;
      body?: string;
    } = {},
  ): Promise<Todo> {
    const todo = await repo.create({
      type: 'todo',
      name: overrides.name ?? 'Test Todo',
      space_id: overrides.space_id ?? testSpaceId,
      due_date: overrides.due_date ?? undefined,
      body: overrides.body ?? undefined,
    });
    return todo as Todo;
  }

  async function createHabit(
    overrides: { name?: string; space_id?: string | null; frequency?: 'daily' | 'weekly' } = {},
  ): Promise<Habit> {
    const habit = await repo.create({
      type: 'habit',
      name: overrides.name ?? 'Test Habit',
      frequency: overrides.frequency ?? 'daily',
      subtype: 'start_habit',
      space_id: overrides.space_id ?? testSpaceId,
    });
    return habit as Habit;
  }

  async function createNote(
    overrides: { title?: string; space_id?: string | null } = {},
  ): Promise<Note> {
    const note = await repo.create({
      type: 'note',
      title: overrides.title ?? 'Test Note',
      subtype: 'idea', // Use 'idea' which is valid NoteSubtype
      space_id: overrides.space_id ?? testSpaceId,
    });
    return note as Note;
  }

  async function archiveTodo(id: string): Promise<void> {
    // Archive todo by setting status='archived' (DB-level archive state)
    await repo.update({ id, patch: { status: 'archived', archived: true } as any });
  }

  async function archiveHabit(id: string): Promise<void> {
    await repo.update({ id, patch: { archived: true } as any });
  }

  async function archiveNote(id: string): Promise<void> {
    await repo.update({ id, patch: { archived: true } as any });
  }

  // =========================================================================
  // search - Archived Filtering
  // =========================================================================

  describe('search archived filtering', () => {
    it('excludes archived todos from search results', async () => {
      // Setup: Create 2 todos with searchable name
      const activeTodo = await createTodo({ name: 'searchable item active' });
      const archivedTodo = await createTodo({ name: 'searchable item archived' });

      // Archive one
      await archiveTodo(archivedTodo.id);

      // Search
      const results = await repo.search('searchable item');

      // Assert: Only active todo in results
      const todos = results.filter((r) => r.type === 'todo');
      expect(todos).toHaveLength(1);
      expect(todos[0].id).toBe(activeTodo.id);
    });

    it('excludes archived habits from search results', async () => {
      // Setup: Create 2 habits with searchable name
      const activeHabit = await createHabit({ name: 'findable habit active' });
      const archivedHabit = await createHabit({ name: 'findable habit archived' });

      // Archive one
      await archiveHabit(archivedHabit.id);

      // Search
      const results = await repo.search('findable habit');

      // Assert: Only active habit in results
      const habits = results.filter((r) => r.type === 'habit');
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe(activeHabit.id);
    });

    it('excludes archived notes from search results', async () => {
      // Setup: Create 2 notes with searchable title
      const activeNote = await createNote({ title: 'discoverable note active' });
      const archivedNote = await createNote({ title: 'discoverable note archived' });

      // Archive one
      await archiveNote(archivedNote.id);

      // Search
      const results = await repo.search('discoverable note');

      // Assert: Only active note in results
      const notes = results.filter((r) => r.type === 'note');
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(activeNote.id);
    });

    it('excludes archived items when searching by body content', async () => {
      // Setup: Create todos with searchable body
      const activeTodo = await createTodo({
        name: 'Todo 1',
        body: 'contains special keyword here',
      });
      const archivedTodo = await createTodo({
        name: 'Todo 2',
        body: 'also contains special keyword',
      });

      // Archive one
      await archiveTodo(archivedTodo.id);

      // Search by body content
      const results = await repo.search('special keyword');

      // Assert: Only active todo found
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(activeTodo.id);
    });
  });

  // =========================================================================
  // listDueToday - Archived Filtering
  // =========================================================================

  describe('listDueToday archived filtering', () => {
    it('excludes archived todos due today', async () => {
      // Setup: Get today's date
      const today = new Date();
      const todayIso = today.toISOString();

      // Create 2 todos with due_day = today
      const activeTodo = await createTodo({
        name: 'Active Todo Due Today',
        due_date: todayIso,
      });
      const archivedTodo = await createTodo({
        name: 'Archived Todo Due Today',
        due_date: todayIso,
      });

      // Archive one (status='archived')
      await archiveTodo(archivedTodo.id);

      // Call listDueToday
      const results = await repo.listDueToday(todayIso);

      // Assert: Only active todo returned
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(activeTodo.id);
    });

    it('excludes archived todos regardless of archive method', async () => {
      const today = new Date();
      const todayIso = today.toISOString();

      // Create multiple todos due today
      const activeTodo = await createTodo({
        name: 'Active',
        due_date: todayIso,
      });
      const statusArchivedTodo = await createTodo({
        name: 'Status Archived',
        due_date: todayIso,
      });
      const boolArchivedTodo = await createTodo({
        name: 'Bool Archived',
        due_date: todayIso,
      });

      // Archive using status field
      await repo.update({ id: statusArchivedTodo.id, patch: { status: 'archived' } as any });

      // Archive using archived boolean
      await repo.update({ id: boolArchivedTodo.id, patch: { archived: true } as any });

      // Call listDueToday
      const results = await repo.listDueToday(todayIso);

      // Assert: Only active todo returned
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(activeTodo.id);
    });
  });

  // =========================================================================
  // listTodayMerged - Archived Filtering
  // =========================================================================

  describe('listTodayMerged archived filtering', () => {
    it('excludes archived todos from today view', async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todayIso = `${todayStr}T12:00:00.000Z`;

      // Create active + archived todo due today
      const activeTodo = await createTodo({
        name: 'Active Todo Today',
        due_date: todayIso,
      });
      const archivedTodo = await createTodo({
        name: 'Archived Todo Today',
        due_date: todayIso,
      });

      // Archive one
      await archiveTodo(archivedTodo.id);

      // Call listTodayMerged
      const results = await repo.listTodayMerged(todayIso);

      // Assert: Only active todo in results
      const todos = results.filter((r) => r.type === 'todo');
      // Filter out completed todos (which may appear in today view)
      const activeTodos = todos.filter((t) => t.status !== 'completed' && t.status !== 'archived');
      expect(activeTodos.length).toBeGreaterThanOrEqual(1);
      expect(activeTodos.find((t) => t.id === activeTodo.id)).toBeDefined();
      expect(results.find((r) => r.id === archivedTodo.id)).toBeUndefined();
    });

    it('excludes archived habits from today view', async () => {
      const today = new Date();
      const todayIso = today.toISOString();

      // Create active + archived daily habit
      const activeHabit = await createHabit({
        name: 'Active Daily Habit',
        frequency: 'daily',
      });
      const archivedHabit = await createHabit({
        name: 'Archived Daily Habit',
        frequency: 'daily',
      });

      // Archive one
      await archiveHabit(archivedHabit.id);

      // Call listTodayMerged
      const results = await repo.listTodayMerged(todayIso);

      // Assert: Active habit should be present, archived should not
      const habits = results.filter((r) => r.type === 'habit');
      expect(habits.find((h) => h.id === activeHabit.id)).toBeDefined();
      expect(results.find((r) => r.id === archivedHabit.id)).toBeUndefined();
    });

    it('handles mixed archived and completed todos correctly', async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todayIso = `${todayStr}T12:00:00.000Z`;

      // Create todos: active, completed, archived
      const activeTodo = await createTodo({
        name: 'Active Todo',
        due_date: todayIso,
      });
      const completedTodo = await createTodo({
        name: 'Completed Todo',
        due_date: todayIso,
      });
      const archivedTodo = await createTodo({
        name: 'Archived Todo',
        due_date: todayIso,
      });

      // Complete one
      await repo.completeTodo(completedTodo.id, todayIso);

      // Archive one
      await archiveTodo(archivedTodo.id);

      // Call listTodayMerged
      const results = await repo.listTodayMerged(todayIso);

      // Assert: Completed may appear (for "completed today" section), but archived should not
      expect(results.find((r) => r.id === archivedTodo.id)).toBeUndefined();
      // Active todo should be present
      expect(results.find((r) => r.id === activeTodo.id)).toBeDefined();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles null archived field gracefully (legacy notes)', async () => {
      // Some legacy notes may have archived=null instead of false
      const note = await createNote({ title: 'Legacy Note' });

      // Manually set archived to null to simulate legacy data
      await repo.update({ id: note.id, patch: { archived: null } as any });

      // Should still appear in results (null treated as not archived)
      const results = await repo.search('Legacy Note');
      const notes = results.filter((r) => r.type === 'note');
      expect(notes.find((n) => n.id === note.id)).toBeDefined();
    });

    it('restoring an archived item makes it visible again', async () => {
      // Create and archive a todo
      const todo = await createTodo({ name: 'Will Be Restored' });
      await archiveTodo(todo.id);

      // Verify it's not in results
      let results = await repo.search('Will Be Restored');
      expect(results.find((r) => r.id === todo.id)).toBeUndefined();

      // Restore it
      await repo.restoreItem(todo.id, 'todo');

      // Verify it's now visible
      results = await repo.search('Will Be Restored');
      expect(results.find((r) => r.id === todo.id)).toBeDefined();
    });
  });
});
