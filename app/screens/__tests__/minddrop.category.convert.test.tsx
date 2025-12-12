/**
 * Test: Category chip conversion creates ONE todo (no duplicates)
 *
 * DEPRECATED: Tests the legacy Mind Drop pipeline with category chips.
 * With FEATURE_FLAGS.MIND_DROP_V4_ENABLED = true (now the default), the pipeline:
 * - Bypasses category chips entirely
 * - Creates entities directly via useMindDropSubmit hook
 *
 * These tests are skipped until they can be rewritten for the V4 pipeline.
 */

describe.skip('Category chip conversion (DEPRECATED - V4 is now default)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

/*
 * Original test file preserved below for reference
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';

type MockDecision = {
  mode: 'auto' | 'ask';
  confidence?: number;
  actions: Array<{ type: string; payload: Record<string, unknown> }>;
  suggestions: Array<Record<string, unknown>>;
  explanation?: string;
  meta?: Record<string, unknown>;
};

let repoCreateCounter = 0;

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
  query: jest.fn(() => Promise.resolve([])),
};

const createAskDecision = (overrides: Partial<MockDecision> = {}): MockDecision => ({
  mode: 'ask',
  confidence: 0.6,
  actions: [],
  suggestions: [
    {
      type: 'create.todo',
      label: 'Add to To-Do List',
      payload: { title: 'Buy groceries and milk' },
    },
    {
      type: 'create.log',
      label: 'Just Save It',
      payload: { title: 'Just Save It' },
    },
  ],
  explanation: 'Low confidence, ask user',
  meta: { intent: { kind: 'todo' } },
  ...overrides,
});

const mockDecideWithContext = jest.fn(async () => createAskDecision());
const mockShowActionToast = jest.fn();
const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToLog = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();

jest.mock('../../../lib/conversion', () => {
  const actual = jest.requireActual('../../../lib/conversion');
  return {
    ...actual,
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
    convertUnsortedToLog: (...args: any[]) => mockConvertUnsortedToLog(...args),
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
  };
});

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

const resetRepo = () => {
  repoCreateCounter = 0;

  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.remove.mockReset();
  mockRepo.query.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();

  mockRepo.getById.mockResolvedValue(null);
  mockRepo.update.mockResolvedValue(undefined);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.remove.mockResolvedValue(undefined);
  mockRepo.query.mockResolvedValue([]);
  mockRepo.notes.list.mockResolvedValue([]);
  mockRepo.todos.list.mockResolvedValue([]);
  mockRepo.habits.list.mockResolvedValue([]);

  mockRepo.create.mockImplementation(async (payload: Record<string, unknown>) => {
    const dropId =
      typeof payload?.dropId === 'string'
        ? (payload.dropId as string)
        : '11111111-1111-1111-1111-111111111111';

    return {
      id: `unsorted-${++repoCreateCounter}`,
      ...payload,
      dropId,
      drop_id: dropId,
      source_message_id:
        typeof payload?.sourceMessageId === 'string'
          ? (payload.sourceMessageId as string)
          : 'minddrop-test-id',
      labels: Array.isArray(payload?.labels)
        ? (payload.labels as string[])
        : ['catchall', 'needs_review'],
    };
  });
};

const resetOtherMocks = () => {
  mockDecideWithContext.mockReset();
  mockDecideWithContext.mockImplementation(async () => createAskDecision());
  mockShowActionToast.mockReset();
  mockConvertUnsortedToTodo.mockReset();
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('../../../lib/supabase/client');
const mockSupabaseRpc = supabase.rpc as jest.Mock;

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;
});

// Skip - V4 pipeline doesn't use category chips
describe.skip('Mind Drop Category Chip Conversion (Original)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { supabase } = require('../../../lib/supabase/client');
  const mockSupabaseRpc = supabase.rpc as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: 'todo-xyz', error: null });
    resetRepo();
    resetOtherMocks();

    // Setup default mock for convertUnsortedToTodo
    mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId) => {
      const note = await repo.getById(noteId);
      const todoId = `todo-${noteId.replace('unsorted-', '')}`;
      const createdTodo = {
        id: todoId,
        type: 'todo',
        name: note?.body || 'Untitled',
        body: note?.body,
        labels: ['todo'],
        drop_id: note?.drop_id,
        dropId: note?.dropId,
      };

      // Simulate the conversion helper creating a todo
      await repo.create(createdTodo);

      // Simulate archiving the original note
      await repo.update(noteId, { labels: ['archived'] });

      return { todo: createdTodo, updatedNote: { ...note, labels: ['archived'] } };
    });

    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';

    const overlay = useGlobalOverlay();
    (overlay.openCreate as jest.Mock).mockClear();
    (overlay.openEdit as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('converts low-confidence note to todo via category chip without opening overlay', async () => {
    const mockUnsortedNote = {
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
      labels: ['needs_review', 'unsorted'],
      created_at: new Date().toISOString(),
      drop_id: 'drop-123',
      dropId: 'drop-123',
      source_message_id: 'source-123',
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
      labels: ['needs_review', 'unsorted'],
      drop_id: 'drop-123',
      dropId: 'drop-123',
      source_message_id: 'source-123',
    });
    mockRepo.getById.mockResolvedValue(mockUnsortedNote);
    mockRepo.update.mockResolvedValue({ id: 'unsorted-123' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Buy groceries and milk');
    fireEvent.press(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const todoChip = await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });
    fireEvent.press(todoChip);

    const overlay = useGlobalOverlay();
    const openCreate = overlay.openCreate as jest.Mock;

    // Verify convertUnsortedToTodo was called with correct parameters
    await waitFor(() => expect(mockConvertUnsortedToTodo).toHaveBeenCalledTimes(1));

    expect(mockConvertUnsortedToTodo).toHaveBeenCalledWith(
      mockRepo,
      'unsorted-123',
      expect.objectContaining({
        due: null, // No due date parsed from "Buy groceries and milk"
      }),
    );

    // Verify overlay never opens
    expect(openCreate).not.toHaveBeenCalled();

    // Verify success toast is shown
    expect(mockShowActionToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', content: 'Converted to To-Do ✓' }),
    );

    // Verify conversion helper was called (which internally creates todo + archives note)
    expect(mockRepo.getById).toHaveBeenCalledWith('unsorted-123');

    // repo.create should be called twice: once for initial note, once for todo via conversion
    expect(mockRepo.create).toHaveBeenCalledTimes(2);
    expect(mockRepo.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: 'todo',
        body: 'Buy groceries and milk',
      }),
    );
  });

  it('passes original note text to RPC payload for manual todo conversion', async () => {
    const longText =
      'This is a very long first line that exceeds eighty characters and should be truncated properly\nSecond line here';
    const mockUnsortedNote = {
      id: 'unsorted-456',
      type: 'note',
      body: longText,
      labels: ['needs_review'],
      drop_id: 'drop-456',
      dropId: 'drop-456',
      source_message_id: 'source-456',
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-456',
      type: 'note',
      body: longText,
      labels: ['needs_review'],
      drop_id: 'drop-456',
      dropId: 'drop-456',
      source_message_id: 'source-456',
    });
    mockRepo.getById.mockResolvedValue(mockUnsortedNote);
    mockRepo.update.mockResolvedValue({ id: 'unsorted-456' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, longText);
    fireEvent.press(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const todoChip = await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });
    fireEvent.press(todoChip);

    const overlay = useGlobalOverlay();
    const openCreate = overlay.openCreate as jest.Mock;

    // Verify convertUnsortedToTodo was called with the original long text
    await waitFor(() => expect(mockConvertUnsortedToTodo).toHaveBeenCalled());

    expect(mockConvertUnsortedToTodo).toHaveBeenCalledWith(
      mockRepo,
      'unsorted-456',
      expect.any(Object), // Options with due date
    );

    // Verify the note retrieved has the full original text
    expect(mockRepo.getById).toHaveBeenCalledWith('unsorted-456');

    // Verify the created todo preserves the original text in body field
    expect(mockRepo.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: 'todo',
        body: longText, // Full original text preserved
      }),
    );

    // Verify overlay never opens
    expect(openCreate).not.toHaveBeenCalled();
  });

  it('deduplicates rapid todo chip presses for the same drop', async () => {
    const mockUnsortedNote = {
      id: 'unsorted-777',
      type: 'note',
      body: 'File quarterly taxes',
      labels: ['needs_review', 'unsorted'],
      drop_id: 'drop-777',
      dropId: 'drop-777',
      source_message_id: 'source-777',
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-777',
      type: 'note',
      body: 'File quarterly taxes',
      labels: ['needs_review', 'unsorted'],
      drop_id: 'drop-777',
      dropId: 'drop-777',
      source_message_id: 'source-777',
    });
    mockRepo.getById.mockResolvedValue(mockUnsortedNote);
    mockRepo.update.mockResolvedValue({ id: 'unsorted-777' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'File quarterly taxes');
    fireEvent.press(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const todoChip = await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    // Rapid fire two clicks
    await act(async () => {
      fireEvent.press(todoChip);
      fireEvent.press(todoChip);
    });

    // Wait for conversion to complete
    await waitFor(() => expect(mockConvertUnsortedToTodo).toHaveBeenCalled());

    // The function may be called 1-2 times due to race conditions in rapid clicks,
    // but what matters is that only ONE todo is created (checked via repo.create calls)
    // First call is the provisional note, subsequent calls should be todo creation
    const todoCreateCalls = mockRepo.create.mock.calls.filter(
      (call: any[]) => call[0]?.type === 'todo',
    );

    // Should only create ONE todo, even if clicked twice
    expect(todoCreateCalls.length).toBe(1);

    // Verify success toast shown
    expect(mockShowActionToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', content: 'Converted to To-Do ✓' }),
    );

    // Verify overlay never opens
    const overlay = useGlobalOverlay();
    expect(overlay.openCreate as jest.Mock).not.toHaveBeenCalled();
  });
});
