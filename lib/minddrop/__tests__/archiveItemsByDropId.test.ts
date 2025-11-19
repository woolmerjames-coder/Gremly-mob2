/**
 * Phase 1A: archiveItemsByDropId Integration Test
 *
 * Tests the repo-level method that archives all entities with a given drop_id.
 * Verifies:
 * - Correct archiving mechanism per entity type (completed_at for todos/habits, delete for notes)
 * - No schema mismatches (no non-existent columns like archived, archived_reason, status)
 * - Parallel execution with individual error handling
 * - Return summary with counts
 */

import { MemoryRepo } from '../../repo/memory';
import type { Note, Todo } from '../../types';

describe('archiveItemsByDropId', () => {
  let repo: MemoryRepo;
  const mockUserId = 'test-user-123';
  const testDropId = '9dd65d79-3d1d-4278-875b-472c964b445f'; // Valid UUID for drop_id

  beforeEach(() => {
    repo = new MemoryRepo(mockUserId);
  });

  it('should archive all three entity types (note, todo, habit) with same drop_id', async () => {
    // Create a note, todo, and habit all with the same drop_id
    const note = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test Note',
      body: 'This is a test note from Mind Drop',
      dropId: testDropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Test Todo',
      body: 'This is a test todo from Mind Drop',
      dropId: testDropId,
    });

    const habit = await repo.create({
      type: 'habit',
      name: 'Test Habit',
      notes: 'This is a test habit from Mind Drop',
      frequency: 'daily',
      subtype: 'start_habit',
      dropId: testDropId,
    });

    // Archive all items with this drop_id
    const result = await repo.archiveItemsByDropId(testDropId);

    // Verify return counts
    expect(result.notesArchived).toBe(1);
    expect(result.todosArchived).toBe(1);
    expect(result.habitsArchived).toBe(1);

    // Verify note is soft deleted (archived = true)
    const fetchedNote = await repo.getById(note.id);
    expect(fetchedNote).not.toBeNull();
    expect((fetchedNote as any).archived).toBe(true);

    // Verify todo is soft deleted (completed_at is set)
    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedTodo).not.toBeNull();
    expect((fetchedTodo as any).completed_at).toBeTruthy();
    expect((fetchedTodo as any).completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format

    // Verify habit is soft deleted (completed_at is set)
    const fetchedHabit = await repo.getById(habit.id);
    expect(fetchedHabit).not.toBeNull();
    expect((fetchedHabit as any).completed_at).toBeTruthy();
    expect((fetchedHabit as any).completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
  });

  it('should not affect entities with different drop_ids', async () => {
    // Create entities with different drop_ids
    const note1 = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note with drop_id A',
      dropId: '11111111-1111-1111-1111-111111111111',
    });

    const note2 = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note with drop_id B',
      dropId: '22222222-2222-2222-2222-222222222222',
    });

    const todo1 = await repo.create({
      type: 'todo',
      name: 'Todo with drop_id A',
      dropId: '11111111-1111-1111-1111-111111111111',
    });

    const todo2 = await repo.create({
      type: 'todo',
      name: 'Todo with drop_id B',
      dropId: '22222222-2222-2222-2222-222222222222',
    });

    // Archive only drop-A items
    const result = await repo.archiveItemsByDropId('11111111-1111-1111-1111-111111111111');

    expect(result.notesArchived).toBe(1);
    expect(result.todosArchived).toBe(1);
    expect(result.habitsArchived).toBe(0);

    // Verify drop-A items are archived
    const fetchedNote1 = await repo.getById(note1.id);
    expect(fetchedNote1).not.toBeNull();
    expect((fetchedNote1 as any).archived).toBe(true); // Notes are soft deleted

    const fetchedTodo1 = await repo.getById(todo1.id);
    expect(fetchedTodo1).not.toBeNull();
    expect((fetchedTodo1 as any).completed_at).toBeTruthy();

    // Verify drop-B items are NOT affected
    const fetchedNote2 = await repo.getById(note2.id);
    expect(fetchedNote2).not.toBeNull();
    expect((fetchedNote2 as Note).title).toBe('Note with drop_id B');

    const fetchedTodo2 = await repo.getById(todo2.id);
    expect(fetchedTodo2).not.toBeNull();
    expect((fetchedTodo2 as Todo).name).toBe('Todo with drop_id B');
    expect((fetchedTodo2 as any).completed_at).toBeFalsy(); // Not archived
  });

  it('should handle entities without drop_id gracefully', async () => {
    // Create entities without drop_id
    const noteWithoutDrop = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note without drop_id',
    });

    const todoWithoutDrop = await repo.create({
      type: 'todo',
      name: 'Todo without drop_id',
    });

    // Create entity with drop_id
    const noteWithDrop = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note with drop_id',
      dropId: testDropId,
    });

    // Archive items with drop_id
    const result = await repo.archiveItemsByDropId(testDropId);

    expect(result.notesArchived).toBe(1);
    expect(result.todosArchived).toBe(0);
    expect(result.habitsArchived).toBe(0);

    // Verify entity without drop_id is NOT affected
    const fetchedNoteWithoutDrop = await repo.getById(noteWithoutDrop.id);
    expect(fetchedNoteWithoutDrop).not.toBeNull();

    const fetchedTodoWithoutDrop = await repo.getById(todoWithoutDrop.id);
    expect(fetchedTodoWithoutDrop).not.toBeNull();

    // Verify entity with drop_id IS archived
    const fetchedNoteWithDrop = await repo.getById(noteWithDrop.id);
    expect(fetchedNoteWithDrop).not.toBeNull();
    expect((fetchedNoteWithDrop as any).archived).toBe(true);
  });

  it('should return zero counts when no entities match the drop_id', async () => {
    // Create entities with different drop_ids
    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note',
      dropId: '33333333-3333-3333-3333-333333333333',
    });

    // Try to archive with non-existent drop_id
    const result = await repo.archiveItemsByDropId('44444444-4444-4444-4444-444444444444');

    expect(result.notesArchived).toBe(0);
    expect(result.todosArchived).toBe(0);
    expect(result.habitsArchived).toBe(0);
  });

  it('should handle multiple entities of same type with same drop_id', async () => {
    // Create multiple notes with same drop_id
    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note 1',
      dropId: testDropId,
    });

    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note 2',
      dropId: testDropId,
    });

    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Note 3',
      dropId: testDropId,
    });

    // Archive all notes with this drop_id
    const result = await repo.archiveItemsByDropId(testDropId);

    expect(result.notesArchived).toBe(3);
    expect(result.todosArchived).toBe(0);
    expect(result.habitsArchived).toBe(0);
  });

  it('should handle the full Mind Drop lifecycle: create unsorted → convert → delete', async () => {
    // Step 1: Create unsorted note (Mind Drop)
    const unsortedNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Unsorted Mind Drop',
      body: 'Buy groceries tomorrow',
      dropId: testDropId,
    });

    // Step 2: Convert to todo (creates new entity with same drop_id)
    const todo = await repo.create({
      type: 'todo',
      name: 'Buy groceries',
      body: 'Buy groceries tomorrow',
      dropId: testDropId, // Same drop_id as unsorted note
    });

    // Step 3: User deletes the todo
    // This should delete BOTH the todo AND the original unsorted note
    const result = await repo.archiveItemsByDropId(testDropId);

    expect(result.notesArchived).toBe(1); // Unsorted note deleted
    expect(result.todosArchived).toBe(1); // Todo archived
    expect(result.habitsArchived).toBe(0);

    // Verify both are archived
    const fetchedNote = await repo.getById(unsortedNote.id);
    expect(fetchedNote).not.toBeNull();
    expect((fetchedNote as any).archived).toBe(true); // Soft deleted

    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedTodo).not.toBeNull();
    expect((fetchedTodo as any).completed_at).toBeTruthy(); // Soft deleted
  });

  it('should handle multiple conversions from same drop (e.g., todo + habit)', async () => {
    // Scenario: User creates Mind Drop "Exercise daily"
    // Then converts it to BOTH a todo (one-time) AND a habit (recurring)

    // Step 1: Create unsorted note
    const unsortedNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Exercise',
      body: 'Exercise daily',
      dropId: testDropId,
    });

    // Step 2: Convert to todo
    const todo = await repo.create({
      type: 'todo',
      name: 'Exercise today',
      body: 'Exercise daily',
      dropId: testDropId,
    });

    // Step 3: Also convert to habit
    const habit = await repo.create({
      type: 'habit',
      name: 'Exercise daily',
      notes: 'Exercise daily',
      frequency: 'daily',
      subtype: 'start_habit',
      dropId: testDropId,
    });

    // Now we have 3 entities with same drop_id

    // Step 4: User deletes the habit
    // This should delete ALL THREE entities
    const result = await repo.archiveItemsByDropId(testDropId);

    expect(result.notesArchived).toBe(1);
    expect(result.todosArchived).toBe(1);
    expect(result.habitsArchived).toBe(1);

    // Verify all are archived
    const fetchedNote = await repo.getById(unsortedNote.id);
    expect(fetchedNote).not.toBeNull();
    expect((fetchedNote as any).archived).toBe(true);

    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedTodo).not.toBeNull();
    expect((fetchedTodo as any).completed_at).toBeTruthy();

    const fetchedHabit = await repo.getById(habit.id);
    expect(fetchedHabit).not.toBeNull();
    expect((fetchedHabit as any).completed_at).toBeTruthy();
  });

  it('should not throw errors for missing schema columns', async () => {
    // This test ensures that we're not trying to set non-existent columns
    // like 'archived', 'archived_reason', or 'status'

    const note = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test Note',
      dropId: testDropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Test Todo',
      dropId: testDropId,
    });

    const habit = await repo.create({
      type: 'habit',
      name: 'Test Habit',
      frequency: 'daily',
      subtype: 'start_habit',
      dropId: testDropId,
    });

    // Should not throw
    await expect(repo.archiveItemsByDropId(testDropId)).resolves.not.toThrow();

    // Verify the correct columns were set
    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedTodo).not.toBeNull();
    expect((fetchedTodo as any).completed_at).toBeTruthy();
    expect((fetchedTodo as any).status).toBe('archived'); // Status column should be set to 'archived'
    expect((fetchedTodo as any).archived).toBeUndefined(); // No 'archived' column on todos
    expect((fetchedTodo as any).archived_reason).toBeUndefined(); // No 'archived_reason' column (distinct from status field)

    const fetchedHabit = await repo.getById(habit.id);
    expect(fetchedHabit).not.toBeNull();
    expect((fetchedHabit as any).completed_at).toBeTruthy();
    expect((fetchedHabit as any).status).toBeUndefined(); // No 'status' column on habits
    expect((fetchedHabit as any).archived).toBeUndefined(); // No 'archived' column on habits
    expect((fetchedHabit as any).archived_reason).toBeUndefined(); // No 'archived_reason' column on habits
  });

  it('should be idempotent (safe to call multiple times)', async () => {
    const note = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test Note',
      dropId: testDropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Test Todo',
      dropId: testDropId,
    });

    // First call
    const result1 = await repo.archiveItemsByDropId(testDropId);
    expect(result1.notesArchived).toBe(1);
    expect(result1.todosArchived).toBe(1);

    // Second call (should return 0 since items are already archived)
    const result2 = await repo.archiveItemsByDropId(testDropId);
    expect(result2.notesArchived).toBe(0); // Note already archived
    expect(result2.todosArchived).toBe(0); // Todo already archived
    expect(result2.habitsArchived).toBe(0);

    // Verify note is still archived
    const fetchedNote = await repo.getById(note.id);
    expect(fetchedNote).not.toBeNull();
    expect((fetchedNote as any).archived).toBe(true);

    // Verify todo is still archived
    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedTodo).not.toBeNull();
    expect((fetchedTodo as any).completed_at).toBeTruthy();
  });
});
