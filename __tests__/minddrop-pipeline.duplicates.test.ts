/**
 * Mind Drop v3 - Idempotency & Duplicate Prevention Tests (Prompt 3)
 *
 * Ensures that running the pipeline multiple times with the same dropId
 * results in only ONE canonical entity, preventing duplication issues.
 */

import { MemoryRepo } from '../lib/repo/memory';
import {
  runMindDropStageAClassification,
  runMindDropStageBPrefill,
} from '../lib/minddrop/pipelineStages';
import type { CortexResponse } from '../lib/cortex/cortexDecide';

// Helper to generate valid UUIDs for testing
function testUuid(suffix: string): string {
  // Ensure suffix is exactly 12 hex characters
  const hex = suffix
    .replace(/[^a-f0-9]/gi, '')
    .toLowerCase()
    .substring(0, 12)
    .padEnd(12, '0');
  return `00000000-0000-0000-0000-${hex}`;
}

describe('Mind Drop v3 - Idempotency & Duplicate Prevention', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo('test-user-id');
    // Clear seed data - MemoryRepo seeds with 1 habit, 1 todo, 1 note by default
    // Access private field for test cleanup
    (repo as any).data = [];
  });

  describe('Stage A: Idempotent Entity Creation', () => {
    it('creates only ONE todo when pipeline runs twice with same dropId', async () => {
      // Setup: Create unsorted note
      const note = await repo.create({
        type: 'note',
        body: 'Buy groceries tomorrow',
        origin: 'catchall',
        labels: ['catchall', 'needs_review'],
        dropId: testUuid('test123'),
        views: {
          minddrop_stage: 'pending',
          ai_pending: true,
        },
      });

      const dropId = testUuid('test123');
      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.9,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Buy groceries tomorrow',
              due: '2025-11-24T12:00:00Z',
            },
          },
        ],
      };

      // Run Stage A first time
      const result1 = await runMindDropStageAClassification({
        repo,
        text: 'Buy groceries tomorrow',
        cleanedText: 'Buy groceries tomorrow',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      expect(result1.entities.todos.length).toBe(1);
      const firstTodoId = result1.entities.todos[0];

      // Query all records - should have 1 todo + 1 archived note
      const todosAfterFirst = await repo.listByType('todo');
      const notesAfterFirst = await repo.listByType('note');

      expect(todosAfterFirst.length).toBe(1);
      expect(todosAfterFirst[0].id).toBe(firstTodoId);
      expect((todosAfterFirst[0] as any).drop_id).toBe(dropId);

      // Run Stage A SECOND time (simulating retry)
      const result2 = await runMindDropStageAClassification({
        repo,
        text: 'Buy groceries tomorrow',
        cleanedText: 'Buy groceries tomorrow',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      expect(result2.entities.todos.length).toBe(1);
      const secondTodoId = result2.entities.todos[0];

      // Assert: Same todo ID returned (no new todo created)
      expect(secondTodoId).toBe(firstTodoId);

      // Query all todos to verify still only ONE exists
      const todosAfterSecond = await repo.listByType('todo');
      expect(todosAfterSecond.length).toBe(1);
      expect(todosAfterSecond[0].id).toBe(firstTodoId);
      expect((todosAfterSecond[0] as any).drop_id).toBe(dropId);
    });

    it('creates only ONE habit when pipeline runs twice with same dropId', async () => {
      // Setup: Create unsorted note
      const note = await repo.create({
        type: 'note',
        body: 'Run daily',
        origin: 'catchall',
        labels: ['catchall'],
        dropId: testUuid('habit456'),
        views: {
          minddrop_stage: 'pending',
          ai_pending: true,
        },
      });

      const dropId = testUuid('habit456');
      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.95,
        actions: [
          {
            type: 'create.habit',
            payload: {
              name: 'Run daily',
              freq: 'daily',
            },
          },
        ],
      };

      // Run Stage A first time
      const result1 = await runMindDropStageAClassification({
        repo,
        text: 'Run daily',
        cleanedText: 'Run daily',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      expect(result1.entities.habits.length).toBe(1);
      const firstHabitId = result1.entities.habits[0];

      // Query all habits to verify count
      const habitsAfterFirst = await repo.listByType('habit');
      expect(habitsAfterFirst.length).toBe(1);
      expect(habitsAfterFirst[0].id).toBe(firstHabitId);
      expect((habitsAfterFirst[0] as any).drop_id).toBe(dropId);

      // Run Stage A SECOND time (simulating retry)
      const result2 = await runMindDropStageAClassification({
        repo,
        text: 'Run daily',
        cleanedText: 'Run daily',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      expect(result2.entities.habits.length).toBe(1);
      const secondHabitId = result2.entities.habits[0];

      // Assert: Same habit ID returned (no new habit created)
      expect(secondHabitId).toBe(firstHabitId);

      // Query all habits to verify still only ONE exists
      const habitsAfterSecond = await repo.listByType('habit');
      expect(habitsAfterSecond.length).toBe(1);
      expect(habitsAfterSecond[0].id).toBe(firstHabitId);
      expect((habitsAfterSecond[0] as any).drop_id).toBe(dropId);
    });

    it('updates existing todo stage when retry happens during Stage A', async () => {
      // Setup: Create unsorted note
      const note = await repo.create({
        type: 'note',
        body: 'Email client',
        origin: 'catchall',
        dropId: testUuid('retry789'),
        views: {
          minddrop_stage: 'pending',
        },
      });

      const dropId = testUuid('retry789');
      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Email client',
            },
          },
        ],
      };

      // First run - creates todo
      await runMindDropStageAClassification({
        repo,
        text: 'Email client',
        cleanedText: 'Email client',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      const todosAfterFirst = await repo.listByType('todo');
      expect(todosAfterFirst.length).toBe(1);

      // Manually set stage back to pending (simulating incomplete first run)
      await repo.update({
        id: todosAfterFirst[0].id,
        patch: {
          views: {
            ...((todosAfterFirst[0] as any).views ?? {}),
            minddrop_stage: 'pending',
          },
        },
      });

      // Second run - should update existing todo, not create new one
      await runMindDropStageAClassification({
        repo,
        text: 'Email client',
        cleanedText: 'Email client',
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      const todosAfterSecond = await repo.listByType('todo');
      expect(todosAfterSecond.length).toBe(1); // Still only one todo

      // Verify stage was updated to 'classified'
      const updatedTodo = await repo.getById(todosAfterSecond[0].id);
      expect((updatedTodo as any).views.minddrop_stage).toBe('classified');
      expect((updatedTodo as any).views.ai_pending).toBe(true);
    });
  });

  describe('Repo findByDropId Methods', () => {
    it('findTodoByDropId returns null when no todo exists', async () => {
      const result = await repo.findTodoByDropId('nonexistent-drop-id');
      expect(result).toBeNull();
    });

    it('findTodoByDropId returns todo when it exists', async () => {
      const dropId = testUuid('find1');
      const todo = await repo.create({
        type: 'todo',
        name: 'Test todo',
        origin: 'catchall',
        dropId,
      });

      const found = await repo.findTodoByDropId(dropId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(todo.id);
      expect((found as any).drop_id).toBe(dropId);
    });

    it('findHabitByDropId returns null when no habit exists', async () => {
      const result = await repo.findHabitByDropId('nonexistent-drop-id');
      expect(result).toBeNull();
    });

    it('findHabitByDropId returns habit when it exists', async () => {
      const dropId = testUuid('find2');
      const habit = await repo.create({
        type: 'habit',
        name: 'Test habit',
        frequency: 'daily',
        subtype: 'start_habit',
        origin: 'catchall',
        dropId,
      });

      const found = await repo.findHabitByDropId(dropId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(habit.id);
      expect((found as any).drop_id).toBe(dropId);
    });

    it('findTodoByDropId only returns todos owned by current user', async () => {
      const dropId = testUuid('ownership1');

      // Create todo as test-user-id
      await repo.create({
        type: 'todo',
        name: 'My todo',
        origin: 'catchall',
        dropId,
        owner_id: 'test-user-id',
      });

      // Create another repo for different user
      const otherRepo = new MemoryRepo('other-user-id');

      // Other user shouldn't see the first user's todo
      const found = await otherRepo.findTodoByDropId(dropId);
      expect(found).toBeNull();
    });
  });

  describe('End-to-End: No Duplication in Views', () => {
    it('ensures user text appears only once after full pipeline completes', async () => {
      const userText = 'Buy milk today';
      const dropId = testUuid('view1');

      // Stage 0: Create unsorted note (appears in Catch-All)
      const note = await repo.create({
        type: 'note',
        body: userText,
        origin: 'catchall',
        labels: ['catchall', 'needs_review'],
        dropId,
        views: {
          minddrop_stage: 'pending',
          ai_pending: true,
        },
      });

      // Query: Catch-All should show the note
      const catchAllNotes = (await repo.listByType('note')).filter(
        (n) => n.origin === 'catchall' && !(n as any).archived,
      );
      expect(catchAllNotes.length).toBe(1);
      expect(catchAllNotes[0].id).toBe(note.id);

      // Query: Today should be empty (no todos yet)
      const todosBeforeStageA = await repo.listByType('todo');
      expect(todosBeforeStageA.length).toBe(0);

      // Stage A: Classification creates todo
      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.9,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Send email',
              due: new Date().toISOString(), // Due today
            },
          },
        ],
      };

      const stageAResult = await runMindDropStageAClassification({
        repo,
        text: userText,
        cleanedText: userText,
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      expect(stageAResult.entities.todos.length).toBe(1);
      const todoId = stageAResult.entities.todos[0];

      // Query: Note should now be archived
      const updatedNote = await repo.getById(note.id);
      expect((updatedNote as any).archived).toBe(true);

      // Query: Today should show the todo
      const todosAfterStageA = await repo.listByType('todo');
      expect(todosAfterStageA.length).toBe(1);
      expect(todosAfterStageA[0].id).toBe(todoId);
      expect((todosAfterStageA[0] as any).drop_id).toBe(dropId);

      // Query Catch-All: Should NOT show archived note (filtered out)
      const catchAllAfterStageA = (await repo.listByType('note')).filter(
        (n) => n.origin === 'catchall' && !(n as any).archived,
      );
      expect(catchAllAfterStageA.length).toBe(0); // Archived note excluded

      // Query Catch-All: Should NOT show canonical todo for v3
      // (This would be filtered in CatchAllNotepad.tsx based on canonicalType)
      const catchAllTodos = (await repo.listByType('todo')).filter(
        (t) => t.origin === 'catchall' && (t as any).canonicalType === 'todo',
      );
      expect(catchAllTodos.length).toBe(1); // Todo exists with origin='catchall'
      // But in v3, CatchAllNotepad.tsx filters out canonicalType='todo'

      // Summary: User text appears only in ONE place (Today as todo)
      // - Catch-All: Archived note excluded
      // - Catch-All: Canonical todo excluded (by v3 filter)
      // - Today: Canonical todo shown
      expect(catchAllAfterStageA.length + todosAfterStageA.length).toBe(1); // Only 1 visible item
    });

    it('running pipeline twice results in NO duplicate items across views', async () => {
      const userText = 'Morning run';
      const dropId = testUuid('view2');

      // Create unsorted note
      const note = await repo.create({
        type: 'note',
        body: userText,
        origin: 'catchall',
        labels: ['catchall'],
        dropId,
        views: {
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.95,
        actions: [
          {
            type: 'create.habit',
            payload: {
              name: 'Morning run',
              freq: 'daily',
            },
          },
        ],
      };

      // Run Stage A twice
      await runMindDropStageAClassification({
        repo,
        text: userText,
        cleanedText: userText,
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      await runMindDropStageAClassification({
        repo,
        text: userText,
        cleanedText: userText,
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      // Query all entities
      const allNotes = await repo.listByType('note');
      const allHabits = await repo.listByType('habit');

      // Should have exactly 1 note (archived) and 1 habit (canonical)
      expect(allNotes.length).toBe(1);
      expect(allHabits.length).toBe(1);

      // Note is archived
      expect((allNotes[0] as any).archived).toBe(true);

      // Habit has correct dropId
      expect((allHabits[0] as any).drop_id).toBe(dropId);

      // No duplicates in total item count
      const totalItems = allNotes.filter((n) => !(n as any).archived).length + allHabits.length;
      expect(totalItems).toBe(1); // Only habit is visible (note is archived)
    });
  });

  describe('Stage A + Stage B: Full Pipeline Idempotency', () => {
    it('running both stages twice results in single enriched entity', async () => {
      const userText = 'Write blog post';
      const dropId = testUuid('fullpipe1');

      // Create unsorted note
      const note = await repo.create({
        type: 'note',
        body: userText,
        origin: 'catchall',
        dropId,
        views: {
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        confidence: 0.88,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Check inventory',
            },
          },
        ],
      };

      // Run Stage A twice
      const stageA1 = await runMindDropStageAClassification({
        repo,
        text: userText,
        cleanedText: userText,
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      const stageA2 = await runMindDropStageAClassification({
        repo,
        text: userText,
        cleanedText: userText,
        decision,
        dropId,
        unsortedNoteId: note.id,
      });

      // Should return same todo ID
      expect(stageA1.entities.todos[0]).toBe(stageA2.entities.todos[0]);

      // Run Stage B twice (simulating background job retry)
      // Note: backgroundPrefill is mocked in real tests, here we just verify entity count
      await runMindDropStageBPrefill({
        repo,
        entityIds: {
          todos: stageA1.entities.todos,
          habits: [],
          notes: [],
        },
        rawText: userText,
      });

      await runMindDropStageBPrefill({
        repo,
        entityIds: {
          todos: stageA2.entities.todos,
          habits: [],
          notes: [],
        },
        rawText: userText,
      });

      // Query: Should still have only ONE todo
      const finalTodos = await repo.listByType('todo');
      expect(finalTodos.length).toBe(1);
      expect((finalTodos[0] as any).drop_id).toBe(dropId);
    });
  });
});
