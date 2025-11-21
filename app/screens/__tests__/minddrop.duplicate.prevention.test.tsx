/**
 * Mind Drop Duplicate Prevention Test
 *
 * Verifies that submitting the same text multiple times in quick succession
 * doesn't create duplicate unsorted notes.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('../../../lib/supabase/client');
const mockSupabaseRpc = supabase.rpc as jest.Mock;

let unsortedIdCounter = 0;

const mockRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  findNoteBySourceMessageId: jest.fn(() => Promise.resolve(null)),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
  remove: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const createAskDecision = () => ({
  mode: 'ask' as const,
  confidence: 0.7,
  suggestions: [
    {
      type: 'create.todo',
      label: 'Add to To-Do List',
      payload: { title: 'Add to To-Do List' },
    },
  ],
  actions: [] as unknown[],
  meta: { intent: { kind: 'todo' } },
});

const mockDecideWithContext = jest.fn(async () => createAskDecision());

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#000',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

const mockShowActionToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();

jest.mock('../../../lib/conversion', () => {
  const actual = jest.requireActual('../../../lib/conversion');
  return {
    ...actual,
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
    convertUnsortedToLog: (...args: any[]) => mockConvertUnsortedToHabit(...args),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;

const resetRepoMocks = () => {
  unsortedIdCounter = 0;

  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();
  mockRepo.remove.mockReset();

  mockRepo.getById.mockResolvedValue(null);
  mockRepo.update.mockResolvedValue(undefined);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.notes.list.mockResolvedValue([]);
  mockRepo.todos.list.mockResolvedValue([]);
  mockRepo.habits.list.mockResolvedValue([]);

  mockRepo.create.mockImplementation(async () => ({
    id: `unsorted-${++unsortedIdCounter}`,
  }));
};

const resetOtherMocks = () => {
  mockDecideWithContext.mockReset();
  mockDecideWithContext.mockImplementation(async () => createAskDecision());
  mockShowActionToast.mockReset();
};

const getCreatePayload = (index: number): Record<string, unknown> => {
  const call = mockRepo.create.mock.calls[index];
  return (call?.[0] ?? {}) as Record<string, unknown>;
};

describe('Mind Drop - Duplicate Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepoMocks();
    resetOtherMocks();
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: 'todo-123', error: null });
    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';

    // Setup conversion helper mocks
    mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId, options) => {
      const note = await repo.getById(noteId);
      const todoId = `todo-${noteId.replace('record-', '')}`;
      const createdTodo = {
        id: todoId,
        type: 'todo',
        name: note?.body || note?.title || 'Untitled',
        body: note?.body || note?.title,
        due_date: options?.due || null,
        undefined_due: !options?.due,
        labels: ['todo'],
        tags: note?.tags || [],
      };
      const savedTodo = await repo.create(createdTodo);
      await repo.update({ id: noteId, patch: { labels: ['archived'] } });
      return { todo: savedTodo, updatedNote: { ...note, labels: ['archived'] } };
    });
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('prevents duplicate unsorted notes when same text submitted twice quickly', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const firstPayload = getCreatePayload(0);
    expect(firstPayload.body).toBe('buy groceries');
    expect(firstPayload.labels).toEqual(expect.arrayContaining(['catchall', 'needs_review']));

    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('allows new unsorted note when text is different', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });

    fireEvent.changeText(input, 'call mom');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(2), { timeout: 4000 });
    const secondPayload = getCreatePayload(1);
    expect(secondPayload.body).toBe('call mom');
  });

  it('shows category chips for duplicate submission without creating new record', async () => {
    const { getByTestId, queryByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await waitFor(
      () => {
        expect(queryByText('Add to To-Do List')).toBeTruthy();
      },
      { timeout: 4000 },
    );

    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('clears duplicate tracking after category chip action', async () => {
    mockRepo.getById.mockResolvedValue({
      id: 'unsorted-1',
      body: 'exercise daily',
      drop_id: 'a1e8f2c0-1234-4bcd-9abc-1234567890ab',
      source_message_id: 'minddrop-test',
      tags: ['catchall'],
    });
    mockRepo.update.mockResolvedValue({ id: 'unsorted-1' });

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);
    const overlay = useGlobalOverlay();
    const openCreate = overlay.openCreate as jest.Mock;
    openCreate.mockClear();

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await waitFor(() => expect(queryByTestId('minddrop-category-todo')).toBeTruthy(), {
      timeout: 4000,
    });

    const todoChip = queryByTestId('minddrop-category-todo');
    if (!todoChip) {
      throw new Error('Category chip did not render');
    }
    fireEvent.press(todoChip);

    // Phase 4A: Check conversion helper is called instead of RPC
    await waitFor(() => expect(mockConvertUnsortedToTodo).toHaveBeenCalledTimes(1), {
      timeout: 4000,
    });
    expect(mockConvertUnsortedToTodo).toHaveBeenCalledWith(
      expect.anything(), // repo
      'unsorted-1', // noteId
      expect.objectContaining({}), // options
    );

    expect(openCreate).not.toHaveBeenCalled();
    expect(mockShowActionToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        content: 'Converted to To-Do ✓',
      }),
    );

    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(2), { timeout: 4000 });
  });
});
