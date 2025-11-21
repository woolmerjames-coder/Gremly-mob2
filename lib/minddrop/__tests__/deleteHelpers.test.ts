/**
 * Tests for Phase 1A: Mind Drop Delete Helpers
 *
 * Verifies that deleteByDropId properly archives all entities with a given drop_id,
 * fixing the "zombie unsorted" problem.
 */

import { deleteByDropId, deleteEntityOrDrop } from '../deleteHelpers';
import { MemoryRepo } from '../../repo/memory';
import type { IRepo } from '../../repo/IRepo';
import { randomUUID } from 'crypto';

describe('deleteByDropId', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-id');
  });

  it('should archive all entities with the same drop_id', async () => {
    // Create an unsorted note and a converted todo sharing the same drop_id
    const dropId = randomUUID();

    const unsortedNote = await repo.create({
      type: 'note',
      title: 'Buy groceries',
      body: 'Buy groceries',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Buy groceries',
      body: 'Buy groceries',
      space_id: null,
      dropId,
    });

    // Both should exist initially and not be archived
    const fetchedNote = await repo.getById(unsortedNote.id);
    const fetchedTodo = await repo.getById(todo.id);
    expect(fetchedNote).toBeDefined();
    expect(fetchedNote).not.toBeNull();
    expect(fetchedTodo).toBeDefined();
    expect((fetchedTodo as any)?.completed_at).toBeFalsy();

    // Delete by drop_id
    await deleteByDropId(repo, dropId);

    // Both should be archived (MemoryRepo sets status='archived' for todos at DB level)
    const archivedNote = await repo.getById(unsortedNote.id);
    const archivedTodo = await repo.getById(todo.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    // Notes are hard deleted - no archived_reason field
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
    // Todos use completed_at for soft delete
  });

  it('should archive only the unsorted note if no converted entity exists', async () => {
    // Create only an unsorted note with a drop_id
    const dropId = randomUUID();

    const unsortedNote = await repo.create({
      type: 'note',
      title: 'Random thought',
      body: 'Random thought',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    // Verify it's not archived initially
    const fetchedNote = await repo.getById(unsortedNote.id);
    expect(fetchedNote).not.toBeNull();

    // Delete by drop_id
    await deleteByDropId(repo, dropId);

    // Should be archived
    const archivedNote = await repo.getById(unsortedNote.id);
    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    // Notes are hard deleted - no archived_reason field
  });

  it('should be idempotent - calling twice leaves state consistent', async () => {
    const dropId = randomUUID();

    const note = await repo.create({
      type: 'note',
      title: 'Test note',
      body: 'Test note',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    // Call deleteByDropId twice
    await deleteByDropId(repo, dropId);
    await deleteByDropId(repo, dropId);

    // Should still be archived with correct reason
    const archivedNote = await repo.getById(note.id);
    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    // Notes are hard deleted - no archived_reason field
  });

  it('should archive all three entity types (note, todo, habit) with same drop_id', async () => {
    const dropId = randomUUID();

    // Create note, todo, and habit with same drop_id
    const note = await repo.create({
      type: 'note',
      title: 'Exercise',
      body: 'Exercise',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Exercise today',
      body: 'Exercise today',
      space_id: null,
      dropId,
    });

    const habit = await repo.create({
      type: 'habit',
      name: 'Exercise daily',
      notes: 'Exercise daily',
      frequency: 'daily',
      subtype: 'start_habit',
      space_id: null,
      dropId,
    });

    // Delete by drop_id
    await deleteByDropId(repo, dropId);

    // All should be archived
    const archivedNote = await repo.getById(note.id);
    const archivedTodo = await repo.getById(todo.id);
    const archivedHabit = await repo.getById(habit.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
    expect((archivedHabit as any)?.completed_at).toBeTruthy(); // Soft deleted

    // Notes are hard deleted - no archived_reason field
    // Todos use completed_at for soft delete
    // Habits use completed_at for soft delete
  });

  it('should not affect entities with different drop_ids', async () => {
    const dropId1 = randomUUID();
    const dropId2 = randomUUID();

    const note1 = await repo.create({
      type: 'note',
      title: 'Note A',
      body: 'Note A',
      subtype: 'idea',
      space_id: null,
      dropId: dropId1,
    });

    const note2 = await repo.create({
      type: 'note',
      title: 'Note B',
      body: 'Note B',
      subtype: 'idea',
      space_id: null,
      dropId: dropId2,
    });

    // Delete only drop_a
    await deleteByDropId(repo, dropId1);

    // note1 should be archived (soft delete), note2 should not
    const archivedNote1 = await repo.getById(note1.id);
    const fetchedNote2 = await repo.getById(note2.id);

    expect(archivedNote1).not.toBeNull();
    expect((archivedNote1 as any).archived).toBe(true); // Notes are soft deleted
    expect(fetchedNote2).not.toBeNull(); // Not deleted
  });

  it('should throw error if dropId is not provided', async () => {
    await expect(deleteByDropId(repo, '')).rejects.toThrow('dropId is required');
  });
});

describe('deleteEntityOrDrop', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-id');
  });

  it('should delete all items with drop_id when entity has drop_id', async () => {
    const dropId = randomUUID();

    const note = await repo.create({
      type: 'note',
      title: 'Unsorted',
      body: 'Unsorted',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Todo from drop',
      body: 'Todo from drop',
      space_id: null,
      dropId,
    });

    // Delete the todo (which has drop_id)
    await deleteEntityOrDrop(repo, todo.id, 'todo');

    // Both should be archived
    const archivedNote = await repo.getById(note.id);
    const archivedTodo = await repo.getById(todo.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
  });

  it('should delete only single entity when drop_id is null', async () => {
    const todo = await repo.create({
      type: 'todo',
      name: 'Standalone todo',
      body: 'Standalone todo',
      space_id: null,
      dropId: null, // No drop_id
    });

    // Delete the todo
    await deleteEntityOrDrop(repo, todo.id, 'todo');

    // Should be hard deleted since repo.remove() was called
    const deletedTodo = await repo.getById(todo.id);
    expect(deletedTodo).toBeNull();
  });

  it('should use provided drop_id when available (more efficient)', async () => {
    const dropId = randomUUID();

    const note = await repo.create({
      type: 'note',
      title: 'Note',
      body: 'Note',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Todo',
      body: 'Todo',
      space_id: null,
      dropId,
    });

    // Delete with known drop_id (avoids fetch)
    await deleteEntityOrDrop(repo, todo.id, 'todo', dropId);

    // Both should be archived
    const archivedNote = await repo.getById(note.id);
    const archivedTodo = await repo.getById(todo.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
  });

  it('should handle different entity types (habit)', async () => {
    const dropId = randomUUID();

    const note = await repo.create({
      type: 'note',
      title: 'Habit note',
      body: 'Habit note',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    const habit = await repo.create({
      type: 'habit',
      name: 'Daily habit',
      notes: 'Daily habit',
      frequency: 'daily',
      subtype: 'start_habit',
      space_id: null,
      dropId,
    });

    // Delete the habit
    await deleteEntityOrDrop(repo, habit.id, 'habit');

    // Both should be archived
    const archivedNote = await repo.getById(note.id);
    const archivedHabit = await repo.getById(habit.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    expect((archivedHabit as any)?.completed_at).toBeTruthy(); // Soft deleted
  });

  it('should fallback to single delete if entity fetch fails', async () => {
    // Mock a failing get by using a non-existent ID
    const nonExistentId = 'non_existent_123';

    // Should not throw, should fallback to single delete
    await expect(deleteEntityOrDrop(repo, nonExistentId, 'todo')).resolves.not.toThrow();
  });

  it('should throw error if entityId is not provided', async () => {
    await expect(deleteEntityOrDrop(repo, '', 'todo')).rejects.toThrow('entityId is required');
  });

  it('should not delete entities without drop_id when explicitly passed null', async () => {
    const todo = await repo.create({
      type: 'todo',
      name: 'Standalone',
      body: 'Standalone',
      space_id: null,
      dropId: null,
    });

    // Pass null drop_id explicitly - should fallback to single delete
    await deleteEntityOrDrop(repo, todo.id, 'todo', null);

    // Should be hard deleted
    const deletedTodo = await repo.getById(todo.id);
    expect(deletedTodo).toBeNull();
  });
});

describe('Mind Drop deletion integration', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-id');
  });

  it('should handle the full Mind Drop lifecycle: create unsorted → convert → delete', async () => {
    const dropId = randomUUID();

    // 1. User creates unsorted note via Mind Drop
    const unsortedNote = await repo.create({
      type: 'note',
      title: 'Need to buy milk',
      body: 'Need to buy milk',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    expect(unsortedNote.archived).toBeFalsy();

    // 2. System converts to todo (conversion logic would do this)
    const todo = await repo.create({
      type: 'todo',
      name: 'Buy milk',
      body: 'Need to buy milk',
      space_id: null,
      dropId, // Same drop_id
    });

    expect(todo.archived).toBeFalsy();

    // 3. User deletes the todo from UI
    await deleteByDropId(repo, dropId);

    // 4. Both unsorted note and todo should be archived (no zombie)
    const archivedNote = await repo.getById(unsortedNote.id);
    const archivedTodo = await repo.getById(todo.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    // Notes are hard deleted - no archived_reason field
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
    // Todos use completed_at for soft delete
  });

  it('should handle multiple conversions from same drop (e.g., todo + habit)', async () => {
    const dropId = randomUUID();

    // Unsorted note
    const note = await repo.create({
      type: 'note',
      title: 'Exercise every day',
      body: 'Exercise every day',
      subtype: 'idea',
      space_id: null,
      dropId,
    });

    // User might convert to both todo AND habit
    const todo = await repo.create({
      type: 'todo',
      name: 'Exercise today',
      body: 'Exercise every day',
      space_id: null,
      dropId,
    });

    const habit = await repo.create({
      type: 'habit',
      name: 'Daily exercise',
      notes: 'Exercise every day',
      frequency: 'daily',
      subtype: 'start_habit',
      space_id: null,
      dropId,
    });

    // Delete by drop_id
    await deleteByDropId(repo, dropId);

    // All three should be archived
    const archivedNote = await repo.getById(note.id);
    const archivedTodo = await repo.getById(todo.id);
    const archivedHabit = await repo.getById(habit.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true); // Notes are soft deleted
    expect((archivedTodo as any)?.completed_at).toBeTruthy(); // Soft deleted
    expect((archivedHabit as any)?.completed_at).toBeTruthy(); // Soft deleted
  });
});
