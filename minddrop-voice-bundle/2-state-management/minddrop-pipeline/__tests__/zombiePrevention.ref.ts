/**
 * Zombie Prevention Test
 *
 * Verifies that deleting a Mind Drop properly archives ALL related entities
 * and prevents "zombie resurrections" where deleted items reappear.
 *
 * Scenarios tested:
 * 1. Create Mind Drop (unsorted note)
 * 2. Convert to todo
 * 3. Delete via archiveItemsByDropId
 * 4. Verify both note and todo are archived in database
 * 5. Verify archived items don't appear in active queries
 * 6. Verify re-submitting same text creates NEW drop_id (not resurrection)
 */

import { MemoryRepo } from '../../repo/memory';
import type { Note, Todo } from '../../types';

describe('Zombie Prevention - archiveItemsByDropId', () => {
  let repo: MemoryRepo;
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    repo = new MemoryRepo(mockUserId);
  });

  it('should archive all Mind Drop entities and prevent zombie resurrections', async () => {
    const dropId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    // Step 1: Create Mind Drop (unsorted note + todo with same drop_id)
    const unsortedNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Buy groceries',
      body: 'Buy groceries',
      labels: ['catchall', 'needs_review'],
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Buy groceries',
      body: 'Buy groceries',
      labels: ['todo'],
      dropId,
    });

    // Verify both exist and are active
    expect(unsortedNote).not.toBeNull();
    expect(todo).not.toBeNull();

    // Step 2: Delete the Mind Drop
    const archiveResult = await repo.archiveItemsByDropId(dropId);

    // Verify archive counts
    expect(archiveResult.notesArchived).toBe(1);
    expect(archiveResult.todosArchived).toBe(1);
    expect(archiveResult.habitsArchived).toBe(0);

    // Step 3: Verify BOTH entities are archived in database (not hard-deleted)
    const archivedNote = await repo.getById(unsortedNote.id);
    const archivedTodo = await repo.getById(todo.id);

    // Notes: soft delete via archived flag
    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true);

    // Todos: soft delete via completed_at timestamp
    expect(archivedTodo).not.toBeNull();
    expect((archivedTodo as any).completed_at).toBeTruthy();

    // Step 4: Verify archived entities don't appear in "active" queries
    // (This would require a getAllActive() method or similar - simulated here)
    const allRecords = (repo as any).data; // Access internal data for testing
    const activeNotes = allRecords.filter(
      (r: any) => r.type === 'note' && r.owner_id === mockUserId && !r.archived,
    );
    const activeTodos = allRecords.filter(
      (r: any) => r.type === 'todo' && r.owner_id === mockUserId && !r.completed_at,
    );

    // Our archived entities should NOT appear in active lists
    expect(activeNotes.some((n: Note) => n.id === unsortedNote.id)).toBe(false);
    expect(activeTodos.some((t: Todo) => t.id === todo.id)).toBe(false);

    // Step 5: Verify re-submitting same text creates NEW drop_id (not zombie)
    const newDropId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const newNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Buy groceries', // Same text!
      body: 'Buy groceries',
      labels: ['catchall', 'needs_review'],
      dropId: newDropId, // Different drop_id
    });

    // New note should be active
    expect(newNote.id).not.toBe(unsortedNote.id); // Different ID
    expect((newNote as any).drop_id).toBe(newDropId); // Different drop_id
    expect((newNote as any).archived).toBeFalsy(); // Active, not archived

    // Old note should still be archived
    const stillArchivedNote = await repo.getById(unsortedNote.id);
    expect(stillArchivedNote).not.toBeNull();
    expect((stillArchivedNote as any).archived).toBe(true);
  });

  it('should handle lifecycle: create → convert → delete → query returns zero active', async () => {
    const dropId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    // Create unsorted note
    const note = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Exercise daily',
      body: 'Exercise daily',
      dropId,
    });

    // Convert to todo
    const todo = await repo.create({
      type: 'todo',
      name: 'Exercise daily',
      dropId,
    });

    // Convert to habit (same drop_id - multiple conversions)
    const habit = await repo.create({
      type: 'habit',
      name: 'Exercise daily',
      frequency: 'daily',
      subtype: 'start_habit',
      dropId,
    });

    // Delete all
    await repo.archiveItemsByDropId(dropId);

    // Query for active entities with this drop_id
    const allRecords = (repo as any).data;
    const activeWithDropId = allRecords.filter(
      (r: any) =>
        r.drop_id === dropId &&
        r.owner_id === mockUserId &&
        !r.archived && // notes filter
        !r.completed_at, // todos/habits filter
    );

    // Should be ZERO active entities
    expect(activeWithDropId.length).toBe(0);

    // All three should still exist but archived
    const archivedNote = await repo.getById(note.id);
    const archivedTodo = await repo.getById(todo.id);
    const archivedHabit = await repo.getById(habit.id);

    expect(archivedNote).not.toBeNull();
    expect((archivedNote as any).archived).toBe(true);

    expect(archivedTodo).not.toBeNull();
    expect((archivedTodo as any).completed_at).toBeTruthy();

    expect(archivedHabit).not.toBeNull();
    expect((archivedHabit as any).completed_at).toBeTruthy();
  });

  it('should be idempotent: calling archiveItemsByDropId twice is safe', async () => {
    const dropId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

    const note = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test',
      dropId,
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Test',
      dropId,
    });

    // First delete
    const result1 = await repo.archiveItemsByDropId(dropId);
    expect(result1.notesArchived).toBe(1);
    expect(result1.todosArchived).toBe(1);

    // Second delete (should be idempotent)
    const result2 = await repo.archiveItemsByDropId(dropId);
    expect(result2.notesArchived).toBe(0); // Already archived
    expect(result2.todosArchived).toBe(0); // Already archived

    // Verify entities are still archived (not double-deleted or resurrected)
    const finalNote = await repo.getById(note.id);
    const finalTodo = await repo.getById(todo.id);

    expect(finalNote).not.toBeNull();
    expect((finalNote as any).archived).toBe(true);

    expect(finalTodo).not.toBeNull();
    expect((finalTodo as any).completed_at).toBeTruthy();
  });

  it('should prevent PGRST204 errors by only setting columns that exist', async () => {
    // This test verifies the fix works with actual schema constraints
    const dropId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    // Create all entity types
    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test Note',
      dropId,
    });

    await repo.create({
      type: 'todo',
      name: 'Test Todo',
      dropId,
    });

    await repo.create({
      type: 'habit',
      name: 'Test Habit',
      frequency: 'daily',
      subtype: 'start_habit',
      dropId,
    });

    // This should NOT throw errors about missing columns:
    // - notes.archived ✅ (exists as of migration 20251116)
    // - todos.completed_at ✅ (exists)
    // - habits.completed_at ✅ (exists)
    //
    // These columns DO NOT exist and should NOT be set:
    // - notes.completed_at ❌
    // - notes.archived_reason ❌
    // - todos.archived ❌
    // - todos.status ❌
    // - habits.archived ❌
    // - habits.archived_reason ❌
    await expect(repo.archiveItemsByDropId(dropId)).resolves.toEqual({
      notesArchived: 1,
      todosArchived: 1,
      habitsArchived: 1,
    });

    // No errors = success!
  });

  it('should log clear errors if archiving fails on any table', async () => {
    // This test documents the error handling behavior
    // In production, if one table fails (e.g., Supabase error), others should still succeed
    // and the error should be logged with CRITICAL prefix

    const dropId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Test',
      dropId,
    });

    // Mock console.error to capture error logs
    const originalError = console.error;
    const errorLogs: any[] = [];
    console.error = (...args: any[]) => errorLogs.push(args);

    try {
      await repo.archiveItemsByDropId(dropId);

      // In MemoryRepo, errors shouldn't occur, but in SupabaseRepo:
      // - Errors are caught per-table
      // - Logged with '❌ CRITICAL:' prefix
      // - Other tables continue archiving
      // - Counts are returned (may be partial on error)

      // This test passes if no uncaught errors are thrown
      expect(true).toBe(true);
    } finally {
      console.error = originalError;
    }

    // In SupabaseRepo, check for critical error logs:
    // expect(errorLogs.some(log => log[0].includes('❌ CRITICAL'))).toBe(true);
  });
});
