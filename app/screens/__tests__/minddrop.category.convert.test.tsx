/**
 * Test: Category chip conversion creates ONE todo (no duplicates)
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

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
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
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('../../../lib/supabase/client');
const mockSupabaseRpc = supabase.rpc as jest.Mock;

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;
});

describe('Mind Drop Category Chip Conversion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepo();
    resetOtherMocks();
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: 'todo-123', error: null });
    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';

    const overlay = useGlobalOverlay();
    (overlay.openCreate as jest.Mock).mockClear();
    (overlay.openEdit as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('converts low-confidence note to todo via category chip - ONE entry only', async () => {
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

    await waitFor(() => expect(mockSupabaseRpc).toHaveBeenCalledTimes(1));

    expect(mockSupabaseRpc).toHaveBeenCalledWith(
      'convert_or_create_from_drop',
      expect.objectContaining({
        p_owner: 'test-user',
        p_drop_id: 'drop-123',
        p_target: 'todo',
        p_payload: expect.objectContaining({
          body: 'Buy groceries and milk',
          origin: 'catchall',
          why_string: 'Converted via Mind Drop chip',
        }),
      }),
    );

    expect(openCreate).not.toHaveBeenCalled();
    expect(mockShowActionToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', content: 'Converted to To-Do ✓' }),
    );

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRepo.getById).toHaveBeenCalledWith('unsorted-123');
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

    await waitFor(() => expect(mockSupabaseRpc).toHaveBeenCalled());

    const rpcArgs = mockSupabaseRpc.mock.calls.slice(-1)[0][1];
    expect(rpcArgs).toEqual(
      expect.objectContaining({
        p_drop_id: 'drop-456',
        p_payload: expect.objectContaining({
          body: longText,
          origin: 'catchall',
        }),
      }),
    );

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(openCreate).not.toHaveBeenCalled();
  });
});
