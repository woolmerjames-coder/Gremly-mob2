/**
 * Test: Narrative classification prevents todo conversion
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

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

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  query: jest.fn(() => Promise.resolve([])),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

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

import CatchAllNotepad from '../CatchAllNotepad';

describe('Mind Drop Narrative Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecideWithContext.mockReset();
    mockRepo.create.mockImplementation(async (payload) => ({
      id: `record-${Date.now()}`,
      ...payload,
    }));
    mockRepo.update.mockResolvedValue(null);
    mockRepo.remove.mockResolvedValue(undefined);

    // Phase 4A conversion helper mocks
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
  });

  it('narrative journal text does NOT produce todo classification', async () => {
    const narrativeText =
      'Today was a great day. I went to the park and enjoyed the sunshine. Feeling grateful.';

    mockDecideWithContext.mockResolvedValue({
      mode: 'auto',
      confidence: 0.9,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Today was a great day' },
        },
      ],
      suggestions: [],
    });

    const { getByTestId, findByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Submit narrative text
    fireEvent.changeText(input, narrativeText);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      const created = mockRepo.create.mock.calls.map((call) => call[0]);
      expect(created.some((payload) => payload.type === 'note')).toBe(true);
      expect(created.some((payload) => payload.type === 'todo')).toBe(false);
    });

    // Verify category chips rendered for user confirmation
    expect(await findByTestId('minddrop-category-todo')).toBeTruthy();

    // Narrative guard should not surface timing chips automatically
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();

    // Verify created as note, not todo
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('note');
  });

  it('task-oriented input with narrative false produces todo with timing chips', async () => {
    const taskText = 'Submit quarterly report';

    mockDecideWithContext.mockResolvedValue({
      mode: 'auto',
      confidence: 0.92,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Submit quarterly report', due: null },
        },
      ],
      suggestions: [],
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, taskText);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    // v3 Instant Mode: Should create todo directly (1 create)
    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    // Verify created as todo
    const createCalls = mockRepo.create.mock.calls;
    const todoCall = createCalls[0];
    expect(todoCall).toBeDefined();
    expect(todoCall[0].type).toBe('todo');

    // Timing chips SHOULD appear for non-urgent high-confidence todo
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();
  });

  it('low-confidence narrative offers category chips for log (not todo)', async () => {
    const ambiguousNarrative = 'Went to dentist, teeth are fine';

    mockDecideWithContext.mockResolvedValue({
      mode: 'ask',
      confidence: 0.4,
      suggestions: [
        {
          type: 'create.note',
          label: 'Save as log',
          payload: { title: ambiguousNarrative, body: ambiguousNarrative, subtype: 'journal' },
        },
      ],
      actions: [],
    });

    const { getByTestId, findByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, ambiguousNarrative);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Category chips should appear for low confidence
    const logChip = await findByTestId('minddrop-category-log', {}, { timeout: 3000 });
    expect(logChip).toBeTruthy();

    // Todo chip should also be available but narrative context suggests log
    const todoChip = await findByTestId('minddrop-category-todo');
    expect(todoChip).toBeTruthy();

    // No automatic todo timing chips
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();
  });

  it('mixed narrative with action triggers note classification', async () => {
    const mixedText = 'Had a great meeting today. I should follow up with Jane about the proposal.';

    mockDecideWithContext.mockResolvedValue({
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Follow up with Jane' },
        },
      ],
      suggestions: [],
    });

    const { getByTestId, queryByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, mixedText);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // Should be classified as note
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.type).toBe('note');

    // Category chips should surface for manual follow-up
    expect(await findByTestId('minddrop-category-log')).toBeTruthy();

    // No timing chips for narrative-dominant input
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();
  });

  it('pure action without narrative context produces todo', async () => {
    const pureAction = 'Email Sarah about project timeline';

    mockDecideWithContext.mockResolvedValue({
      mode: 'auto',
      confidence: 0.93,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Email Sarah about project timeline' },
        },
      ],
      suggestions: [],
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, pureAction);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    // v3 Instant Mode: Should create todo directly (1 create)
    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    // Verify todo creation
    const createCalls = mockRepo.create.mock.calls;
    const todoCall = createCalls[0];
    expect(todoCall).toBeDefined();
    expect(todoCall[0].type).toBe('todo');

    // Timing chips should appear
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();
  });
});
