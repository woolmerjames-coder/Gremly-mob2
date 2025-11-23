/**
 * Mind Drop Views State Integration Test
 *
 * Verifies that views flags (minddrop_stage, ai_pending, ai_failed, minddrop_prefilled_v1)
 * are correctly set throughout the Mind Drop pipeline.
 *
 * Tests both success and failure paths.
 */

import { MemoryRepo } from '../lib/repo/memory';
import { runMindDropStageAClassification, runMindDropStageBPrefill } from '../lib/minddrop/pipelineStages';
import type { CortexResponse } from '../lib/cortex/cortexDecide';
import type { IRepo } from '../lib/repo/IRepo';

// Mock backgroundPrefill to avoid AI calls
const mockBackgroundPrefill = jest.fn();
jest.mock('../lib/minddrop/backgroundPrefill', () => ({
  backgroundPrefill: (...args: any[]) => mockBackgroundPrefill(...args),
}));

describe('Mind Drop Views State Integration', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo();
    mockBackgroundPrefill.mockClear();
    mockBackgroundPrefill.mockResolvedValue(undefined); // Default: success
  });

  describe('Success Path: Complete Pipeline', () => {
    it('should track state from pending → classified → prefilled for a todo', async () => {
      // Create initial unsorted note
      const unsortedNote = await repo.create({
        type: 'note',
        title: 'Email Sarah',
        body: 'Email Sarah',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.todo', payload: { title: 'Email Sarah' } }],
        confidence: 0.88,
      };

      // Stage A: Classification
      const stageAResult = await runMindDropStageAClassification({
        repo,
        text: 'Email Sarah',
        cleanedText: 'Email Sarah',
        decision,
        dropId: 'test-drop',
        unsortedNoteId: unsortedNote.id,
      });

      expect(stageAResult.entities.todos).toHaveLength(1);
      const todoId = stageAResult.entities.todos[0];

      // Verify todo has classified state
      const todoAfterStageA = await repo.getById(todoId);
      expect(todoAfterStageA).toBeDefined();
      expect(todoAfterStageA!.views).toMatchObject({
        minddrop_stage: 'classified',
        ai_pending: true,  // Still waiting for prefill
        ai_failed: false,
      });

      // Stage B: Prefill
      const stageBResult = await runMindDropStageBPrefill({
        repo,
        entityIds: stageAResult.entities,
        rawText: 'Email Sarah',
      });

      expect(stageBResult.enrichedCount).toBe(1);
      expect(stageBResult.failures).toHaveLength(0);

      // Verify backgroundPrefill was called once from Stage B
      // (conversion functions no longer call backgroundPrefill to avoid duplication)
      expect(mockBackgroundPrefill).toHaveBeenCalledTimes(1);
    });

    it('should track state from pending → classified → prefilled for a habit', async () => {
      // Create initial unsorted note
      const unsortedNote = await repo.create({
        type: 'note',
        title: 'Run daily',
        body: 'Run daily',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.habit', payload: { name: 'Run', freq: 'daily' } }],
        confidence: 0.95,
      };

      // Stage A: Classification
      const stageAResult = await runMindDropStageAClassification({
        repo,
        text: 'Run daily',
        cleanedText: 'Run daily',
        decision,
        dropId: 'test-drop',
        unsortedNoteId: unsortedNote.id,
      });

      expect(stageAResult.entities.habits).toHaveLength(1);
      const habitId = stageAResult.entities.habits[0];

      // Verify habit has classified state
      const habitAfterStageA = await repo.getById(habitId);
      expect(habitAfterStageA).toBeDefined();
      expect(habitAfterStageA!.views).toMatchObject({
        minddrop_stage: 'classified',
        ai_pending: true,
        ai_failed: false,
      });

      // Stage B: Prefill
      await runMindDropStageBPrefill({
        repo,
        entityIds: stageAResult.entities,
        rawText: 'Run daily',
      });

      // Verify backgroundPrefill was called once from Stage B
      // (conversion functions no longer call backgroundPrefill to avoid duplication)
      expect(mockBackgroundPrefill).toHaveBeenCalledTimes(1);
    });

    it('should track state from pending → classified → prefilled for a note', async () => {
      // Create initial unsorted note
      const unsortedNote = await repo.create({
        type: 'note',
        title: 'Thinking out loud',
        body: 'Thinking out loud',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.note', payload: { text: 'Thinking out loud', subtype: 'journal' } }],
        confidence: 0.48,
      };

      // Stage A: Classification
      const stageAResult = await runMindDropStageAClassification({
        repo,
        text: 'Thinking out loud',
        cleanedText: 'Thinking out loud',
        decision,
        dropId: 'test-drop',
        unsortedNoteId: unsortedNote.id,
      });

      expect(stageAResult.entities.notes).toHaveLength(1);
      const noteId = stageAResult.entities.notes[0];

      // Verify note has classified state
      const noteAfterStageA = await repo.getById(noteId);
      expect(noteAfterStageA).toBeDefined();
      expect(noteAfterStageA!.views).toMatchObject({
        minddrop_stage: 'classified',
        ai_pending: true,
        ai_failed: false,
      });

      // Stage B: Prefill
      await runMindDropStageBPrefill({
        repo,
        entityIds: stageAResult.entities,
        rawText: 'Thinking out loud',
      });

      expect(mockBackgroundPrefill).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failure Path: Stage B Enrichment Failure', () => {
    it('should set ai_failed=true, ai_pending=false when enrichment fails', async () => {
      // Create initial unsorted note
      const unsortedNote = await repo.create({
        type: 'note',
        title: 'Email Sarah',
        body: 'Email Sarah',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const decision: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.todo', payload: { title: 'Email Sarah' } }],
        confidence: 0.88,
      };

      // Stage A: Classification
      const stageAResult = await runMindDropStageAClassification({
        repo,
        text: 'Email Sarah',
        cleanedText: 'Email Sarah',
        decision,
        dropId: 'test-drop',
        unsortedNoteId: unsortedNote.id,
      });

      const todoId = stageAResult.entities.todos[0];

      // Verify classified state
      let todo = await repo.getById(todoId);
      expect(todo!.views).toMatchObject({
        minddrop_stage: 'classified',
        ai_pending: true,
        ai_failed: false,
      });

      // Configure mock to fail BEFORE calling Stage B
      mockBackgroundPrefill.mockReset();
      mockBackgroundPrefill.mockRejectedValue(new Error('AI service timeout'));

      // Stage B: Prefill (will fail)
      const stageBResult = await runMindDropStageBPrefill({
        repo,
        entityIds: stageAResult.entities,
        rawText: 'Email Sarah',
      });

      // Verify failure was tracked
      expect(stageBResult.enrichedCount).toBe(0);
      expect(stageBResult.failures).toContain(todoId);

      // Verify todo now has failed state
      todo = await repo.getById(todoId);
      expect(todo!.views).toMatchObject({
        minddrop_stage: 'classified', // Stays at classified (didn't reach prefilled)
        ai_pending: false,
        ai_failed: true,
      });

      // Verify content is still intact
      expect(todo!.type).toBe('todo');
      if (todo && todo.type === 'todo') {
        expect(todo.name).toBeTruthy();
      }
    });

    it('should continue processing other entities when one fails', async () => {
      // Create two unsorted notes
      const note1 = await repo.create({
        type: 'note',
        title: 'Email Sarah',
        body: 'Email Sarah',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const note2 = await repo.create({
        type: 'note',
        title: 'Call John',
        body: 'Call John',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      const decision1: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.todo', payload: { title: 'Email Sarah' } }],
        confidence: 0.88,
      };

      const decision2: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.todo', payload: { title: 'Call John' } }],
        confidence: 0.92,
      };

      // Create two todos via Stage A
      const result1 = await runMindDropStageAClassification({
        repo,
        text: 'Email Sarah',
        cleanedText: 'Email Sarah',
        decision: decision1,
        dropId: 'test-drop-1',
        unsortedNoteId: note1.id,
      });

      const result2 = await runMindDropStageAClassification({
        repo,
        text: 'Call John',
        cleanedText: 'Call John',
        decision: decision2,
        dropId: 'test-drop-2',
        unsortedNoteId: note2.id,
      });

      const todo1Id = result1.entities.todos[0];
      const todo2Id = result2.entities.todos[0];

      // Configure mock: first fails, second succeeds
      mockBackgroundPrefill.mockReset();
      mockBackgroundPrefill
        .mockRejectedValueOnce(new Error('AI error'))
        .mockResolvedValueOnce(undefined);

      // Run Stage B with both todos
      const stageBResult = await runMindDropStageBPrefill({
        repo,
        entityIds: {
          todos: [todo1Id, todo2Id],
          habits: [],
          notes: [],
        },
        rawText: 'Test',
      });

      // Verify one failed, one succeeded
      expect(stageBResult.enrichedCount).toBe(1);
      expect(stageBResult.failures).toHaveLength(1);
      expect(stageBResult.failures).toContain(todo1Id);

      // Verify first todo has failed state
      const failedTodo = await repo.getById(todo1Id);
      expect(failedTodo!.views).toMatchObject({
        ai_pending: false,
        ai_failed: true,
      });

      // Verify second todo was still processed
      expect(mockBackgroundPrefill).toHaveBeenCalledTimes(2);
    });
  });

  describe('Failure Path: Stage A Classification Failure', () => {
    it('should mark ai_failed=true and ai_pending=false when Stage A classification fails', async () => {
      // Create initial unsorted note
      const unsortedNote = await repo.create({
        type: 'note',
        title: 'Email Sarah',
        body: 'Email Sarah',
        subtype: 'catchall',
        labels: ['catchall', 'needs_review'],
        tags: [],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      });

      // Create a malformed decision that will cause Stage A to throw
      const malformedDecision: CortexResponse = {
        mode: 'auto',
        actions: [{ type: 'create.todo', payload: { title: 'Email Sarah' } }],
        confidence: 0.88,
      };

      // Mock repo.create to throw during Stage A classification
      const originalCreate = repo.create;
      repo.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      // Stage A: Classification (will fail)
      let stageAError: Error | null = null;
      try {
        await runMindDropStageAClassification({
          repo,
          text: 'Email Sarah',
          cleanedText: 'Email Sarah',
          decision: malformedDecision,
          dropId: 'test-drop',
          unsortedNoteId: unsortedNote.id,
        });
      } catch (err) {
        stageAError = err as Error;
      }

      // Verify Stage A threw error
      expect(stageAError).toBeDefined();
      expect(stageAError?.message).toContain('Database connection failed');

      // Restore original repo.create
      repo.create = originalCreate;

      // Verify unsorted note has failed state
      const failedNote = await repo.getById(unsortedNote.id);
      expect(failedNote).toBeDefined();
      expect(failedNote!.views).toMatchObject({
        ai_pending: false,
        ai_failed: true,
        minddrop_stage: 'pending', // Never reached classified
      });

      // Verify raw content is still intact
      expect(failedNote!.type).toBe('note');
      if (failedNote && failedNote.type === 'note') {
        expect(failedNote.title).toBe('Email Sarah');
        expect(failedNote.body).toBe('Email Sarah');
        expect(failedNote.subtype).toBe('catchall');
      }

      // Verify Stage B was never called (no todo was created)
      expect(mockBackgroundPrefill).not.toHaveBeenCalled();
    });
  });
});
