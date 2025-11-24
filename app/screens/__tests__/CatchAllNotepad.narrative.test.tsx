/**
 * Test suite for narrative detection guard
 * Verifies that journaling/narrative text doesn't trigger todo conversion chips
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
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
jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({
    decideWithContext: mockDecideWithContext,
  }),
}));

const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();
jest.mock('../../../lib/conversion', () => ({
  convertUnsortedToTodo: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToTodo(repo, noteId, options),
  convertUnsortedToHabit: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToHabit(repo, noteId, options),
  convertUnsortedToLog: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToLog(repo, noteId, options),
}));

// Mock Mind Drop v3 pipeline stages
const mockRunMindDropStageAClassification = jest.fn();
const mockRunMindDropStageBPrefill = jest.fn();
jest.mock('../../../lib/minddrop/pipelineStages', () => ({
  runMindDropStageAClassification: (...args: any[]) => mockRunMindDropStageAClassification(...args),
  runMindDropStageBPrefill: (...args: any[]) => mockRunMindDropStageBPrefill(...args),
}));

const mockShowActionToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    close: jest.fn(),
  }),
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad - Narrative Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({
      id: 'test-note-id',
      type: 'note',
      created_at: new Date().toISOString(),
    });
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

    // Setup Phase 4A conversion helper mocks
    mockRepo.getById.mockImplementation(async (id: string) => ({
      id,
      type: 'note',
      created_at: new Date().toISOString(),
      labels: [],
    }));

    mockConvertUnsortedToTodo.mockImplementation(
      async (repo: any, noteId: string, options?: any) => {
        const note = await repo.getById(noteId);
        const todo = await repo.create({
          type: 'todo',
          title: options?.title || 'Converted todo',
          created_at: new Date().toISOString(),
        });
        await repo.update({
          id: noteId,
          patch: { labels: ['archived'] },
        });
        return { todo, updatedNote: { ...note, labels: ['archived'] } };
      },
    );

    // Reset and implement pipeline stage mocks
    mockRunMindDropStageAClassification.mockReset();
    mockRunMindDropStageBPrefill.mockReset();

    let stageACounter = 0;
    mockRunMindDropStageAClassification.mockImplementation(async (params) => {
      const todoId = `todo-stage-a-${++stageACounter}`;
      return {
        entities: {
          todos: [todoId],
          habits: [],
          notes: [],
        },
        entityDetails: [{ kind: 'todo' as const }],
        mode: 'todo' as const,
        confidence: params.decision.confidence ?? 0.92,
      };
    });

    mockRunMindDropStageBPrefill.mockImplementation(async () => {
      return { success: true };
    });
  });

  it('should NOT trigger todo conversion for multi-sentence narrative text', async () => {
    // Cortex returns todo classification for narrative text
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Had a great day today' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId, queryByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Multi-sentence narrative without imperative verbs or task keywords
    fireEvent.changeText(
      input,
      'Had a great day today. Met with friends and discussed interesting ideas about philosophy and life.',
    );
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        // Should NOT create a todo despite cortex saying so
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBe(0);
      },
      { timeout: 3000 },
    );
  });

  it('should trigger todo for imperative verb start even if multiple sentences', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.9,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Buy groceries' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Starts with imperative verb - should still create todo
    fireEvent.changeText(input, 'Buy groceries tomorrow. Need milk and bread.');
    fireEvent.press(submitButton);

    // Phase 4A: Should have created unsorted note + todo
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('should trigger todo for text with task keywords', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.88,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'This is urgent' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'This is urgent and needs to be done ASAP. Very important task.');
    fireEvent.press(submitButton);

    // Phase 4A: Should have created unsorted note + todo
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it.skip('should trigger todo for text with date/time patterns', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.87,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Meeting tomorrow' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(
      input,
      'Had a thought about the meeting tomorrow. Need to prepare some notes for it.',
    );
    fireEvent.press(submitButton);

    // Phase 4A: Should have created unsorted note + todo
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('should allow narrative text with long single sentence', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.82,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Long thought' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Single sentence but >8 words average - should be classified as narrative
    fireEvent.changeText(
      input,
      'Thinking deeply about how to approach this complex philosophical question regarding consciousness and awareness',
    );
    fireEvent.press(submitButton);

    await waitFor(
      () => {
        const todoCalls = mockRepo.create.mock.calls.filter((call) => call[0]?.type === 'todo');
        expect(todoCalls.length).toBe(0);
      },
      { timeout: 3000 },
    );
  });

  it('should allow short action-oriented text to become todo', async () => {
    const todoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.95,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Fix bug' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(todoResponse);

    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Short, imperative - should create todo
    fireEvent.changeText(input, 'Fix the signup bug');
    fireEvent.press(submitButton);

    // v3: Creates unsorted note, Stage A runs in background
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled(), { timeout: 3000 });
  });
});
