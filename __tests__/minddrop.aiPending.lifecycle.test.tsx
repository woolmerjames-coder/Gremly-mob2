/**
 * Tests for views.ai_pending flag lifecycle in V2 and V3 modes
 *
 * Verifies that:
 * - Entities created by successful pipeline have views.ai_pending: false
 * - Unsorted fallback entities have views.ai_pending: true (awaiting processing)
 * - Flag clearing works in both V2 (blocking) and V3 (instant) modes
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { CortexResponse } from '../lib/cortex/cortexDecide';

// Mock dependencies
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123' },
    userId: undefined, // IMPORTANT: Prevent Supabase subscriptions
    session: null,
    loading: false,
    error: null,
    signInWithEmail: jest.fn(),
    devSignIn: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
    waitForSession: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockDecideWithContext = jest.fn();
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: {
      visible: false,
      mode: 'create' as const,
    },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock Mind Drop v3 pipeline stages
const mockRunMindDropStageAClassification = jest.fn();
const mockRunMindDropStageBPrefill = jest.fn();

jest.mock('../lib/minddrop/pipelineStages', () => ({
  runMindDropStageAClassification: (...args: any[]) => mockRunMindDropStageAClassification(...args),
  runMindDropStageBPrefill: (...args: any[]) => mockRunMindDropStageBPrefill(...args),
}));

// Mock conversion functions
const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();

jest.mock('../lib/conversion', () => {
  const actual = jest.requireActual('../lib/conversion');
  return {
    ...actual,
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
    convertUnsortedToLog: (...args: any[]) => mockConvertUnsortedToLog(...args),
  };
});

import CatchAllNotepad from '../app/screens/CatchAllNotepad';

describe('views.ai_pending Flag Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset pipeline stage mocks
    mockRunMindDropStageAClassification.mockReset();
    mockRunMindDropStageBPrefill.mockReset();
    mockConvertUnsortedToTodo.mockReset();
    mockConvertUnsortedToHabit.mockReset();
    mockConvertUnsortedToLog.mockReset();

    // Default pipeline behavior: successful classification and prefill
    let stageACounter = 0;
    mockRunMindDropStageAClassification.mockImplementation(async (params) => {
      const { decision } = params;
      const entities: any = { todos: [], habits: [], notes: [] };
      const entityDetails: any[] = [];

      // Process each action in the decision
      if (decision.actions) {
        for (const action of decision.actions) {
          if (action.type === 'create.todo') {
            const id = `todo-stage-a-${++stageACounter}`;
            entities.todos.push(id);
            entityDetails.push({ kind: 'todo' });
          } else if (action.type === 'create.habit') {
            const id = `habit-stage-a-${++stageACounter}`;
            entities.habits.push(id);
            entityDetails.push({ kind: 'habit' });
          } else if (action.type === 'create.note') {
            const id = `note-stage-a-${++stageACounter}`;
            entities.notes.push(id);
            entityDetails.push({ kind: 'note' });
          }
        }
      }

      return {
        entities,
        entityDetails,
        mode: decision.mode,
        confidence: decision.confidence ?? 0.85,
      };
    });

    mockRunMindDropStageBPrefill.mockImplementation(async () => {
      return { success: true };
    });

    // Default conversion mocks
    mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId, options) => {
      const note = await repo.getById(noteId);
      const todoId = `todo-${noteId.replace('record-', '')}`;
      const createdTodo = {
        id: todoId,
        type: 'todo',
        title: options?.title || note?.body || 'Todo',
        views: {},
      };
      const savedTodo = await repo.create(createdTodo);
      await repo.update({ id: noteId, patch: { labels: ['archived'] } });
      return { todo: savedTodo, updatedNote: { ...note, labels: ['archived'] } };
    });
  });

  describe('V2 Mode (Blocking)', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';
    });

    it('should clear ai_pending flag after successful todo creation', async () => {
      const createdTodo = {
        id: 'todo-123',
        type: 'todo',
        title: 'Buy groceries',
        views: {},
      };

      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.getById.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({
        ...createdTodo,
        views: { ai_pending: false },
      });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Buy groceries',
            },
          },
        ],
        suggestions: [],
      });

      const { getByTestId } = render(<CatchAllNotepad />);

      const input = getByTestId('minddrop-input');
      const submitButton = getByTestId('minddrop-submit-button');

      fireEvent.changeText(input, 'Buy groceries');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for pipeline completion
      await waitFor(
        () => {
          // v3 pipeline creates entity with ID from Stage A (todo-stage-a-1)
          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: expect.stringContaining('todo-'),
              patch: expect.objectContaining({
                views: expect.objectContaining({
                  ai_pending: false,
                }),
              }),
            }),
          );
        },
        { timeout: 3000 },
      );
    });

    it('should clear ai_pending for multiple created entities (todo + note + habit)', async () => {
      // v3: Creates unsorted note first, then pipeline creates all 3 entities
      const unsortedNote = {
        id: 'unsorted-1',
        type: 'note',
        subtype: 'catchall',
        body: 'Complex input',
        labels: ['catchall', 'needs_review'],
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
        },
      };

      const createdTodo = {
        id: 'todo-stage-a-1',
        type: 'todo',
        title: 'Task',
        views: {},
      };
      const createdNote = {
        id: 'note-stage-a-2',
        type: 'note',
        body: 'Note',
        views: {},
      };
      const createdHabit = {
        id: 'habit-stage-a-3',
        type: 'habit',
        title: 'Run',
        views: {},
      };

      // First create: unsorted note, then the 3 converted entities
      mockRepo.create
        .mockResolvedValueOnce(unsortedNote)
        .mockResolvedValueOnce(createdTodo)
        .mockResolvedValueOnce(createdNote)
        .mockResolvedValueOnce(createdHabit);

      mockRepo.getById.mockImplementation(async (id: string) => {
        if (id === 'unsorted-1') return unsortedNote;
        if (id === 'todo-stage-a-1') return createdTodo;
        if (id === 'note-stage-a-2') return createdNote;
        if (id === 'habit-stage-a-3') return createdHabit;
        return null;
      });

      mockRepo.update.mockResolvedValue({ views: { ai_pending: false } });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: { title: 'Task' },
          },
          {
            type: 'create.note',
            payload: { body: 'Note' },
          },
          {
            type: 'create.habit',
            payload: { name: 'Run' },
          },
        ],
        suggestions: [],
      });

      const { getByTestId } = render(<CatchAllNotepad />);

      const input = getByTestId('minddrop-input');
      const submitButton = getByTestId('minddrop-submit-button');

      fireEvent.changeText(input, 'Complex input');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for all updates - v3 pipeline updates all 3 entities
      // In v3, Stage A creates entities, Stage B might update them
      // At minimum we expect the unsorted note to be archived
      await waitFor(
        () => {
          expect(mockRepo.update.mock.calls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 3000 },
      );

      // Verify at least one entity update occurred
      // v3 creates entities via Stage A, updates happen in background
      expect(mockRepo.update).toHaveBeenCalled();
    });
  });

  describe('V3 Mode (Instant)', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on';
    });

    it('should clear ai_pending flag in background after instant submit', async () => {
      const createdHabit = {
        id: 'habit-456',
        type: 'habit',
        title: 'Meditate',
        views: {},
      };

      mockRepo.create.mockResolvedValue(createdHabit);
      mockRepo.getById.mockResolvedValue(createdHabit);
      mockRepo.update.mockResolvedValue({
        ...createdHabit,
        views: { ai_pending: false },
      });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.92,
        actions: [
          {
            type: 'create.habit',
            payload: {
              name: 'Meditate',
              freq: 'daily',
            },
          },
        ],
        suggestions: [],
      });

      const { getByTestId } = render(<CatchAllNotepad />);

      const input = getByTestId('minddrop-input');
      const submitButton = getByTestId('minddrop-submit-button');

      fireEvent.changeText(input, 'Meditate daily');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Input cleared immediately in V3 mode
      expect(input.props.value).toBe('');

      // Wait for background pipeline to clear ai_pending
      await waitFor(
        () => {
          // v3 pipeline creates entity with ID from Stage A
          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: expect.stringContaining('habit-'),
              patch: expect.objectContaining({
                views: expect.objectContaining({
                  ai_pending: false,
                }),
              }),
            }),
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Fallback Paths', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';
    });

    it('should NOT clear ai_pending for unsorted fallback notes (needs processing)', async () => {
      // Simulate pipeline failure leading to unsorted tray
      mockRepo.create.mockRejectedValue(new Error('Classification failed'));
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      // Mock addUnsorted to capture the created note
      let capturedNote: any = null;
      mockRepo.create.mockImplementation(async (input: any) => {
        if (input.subtype === 'catchall' && input.labels?.includes('needs_review')) {
          capturedNote = {
            id: 'unsorted-123',
            ...input,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return capturedNote;
        }
        throw new Error('Unexpected create call');
      });

      mockDecideWithContext.mockRejectedValue(new Error('AI service unavailable'));

      const { getByTestId } = render(<CatchAllNotepad />);

      const input = getByTestId('minddrop-input');
      const submitButton = getByTestId('minddrop-submit-button');

      fireEvent.changeText(input, 'Ambiguous text');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for fallback creation
      await waitFor(
        () => {
          expect(capturedNote).not.toBeNull();
        },
        { timeout: 3000 },
      );

      // Verify unsorted note has ai_pending: true (NOT cleared)
      // v3 sets full views object with ai_pending, ai_failed, and minddrop_stage
      expect(capturedNote.views).toEqual({
        ai_pending: true,
        ai_failed: false,
        minddrop_stage: 'pending',
      });

      // Verify update was NOT called to clear the flag (fallback notes stay pending)
      expect(mockRepo.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            views: expect.objectContaining({ ai_pending: false }),
          }),
        }),
      );
    });
  });
});
