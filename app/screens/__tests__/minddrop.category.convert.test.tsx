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

  mockRepo.create.mockImplementation(async (payload: Record<string, unknown>) => ({
    id: `unsorted-${++repoCreateCounter}`,
    ...payload,
  }));
};

const resetOtherMocks = () => {
  mockDecideWithContext.mockReset();
  mockDecideWithContext.mockImplementation(async () => createAskDecision());
  mockShowActionToast.mockReset();
};

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

    const overlay = useGlobalOverlay();
    (overlay.openCreate as jest.Mock).mockClear();
    (overlay.openEdit as jest.Mock).mockClear();
  });

  it('converts low-confidence note to todo via category chip - ONE entry only', async () => {
    const mockUnsortedNote = {
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
      labels: ['needs_review', 'unsorted'],
      created_at: new Date().toISOString(),
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-123',
      type: 'note',
      body: 'Buy groceries and milk',
      labels: ['needs_review', 'unsorted'],
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

    await waitFor(() => {
      expect(openCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          initialEntity: expect.objectContaining({ type: 'todo' }),
          initialText: 'Buy groceries and milk',
        }),
      );
    });

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRepo.getById).toHaveBeenCalledWith('unsorted-123');
  });

  it('prefills overlay with the original note text for manual todo conversion', async () => {
    const longText =
      'This is a very long first line that exceeds eighty characters and should be truncated properly\nSecond line here';
    const mockUnsortedNote = {
      id: 'unsorted-456',
      type: 'note',
      body: longText,
      labels: ['needs_review'],
    };

    mockRepo.create.mockResolvedValue({
      id: 'unsorted-456',
      type: 'note',
      body: longText,
      labels: ['needs_review'],
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

    await waitFor(() => {
      expect(openCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          initialEntity: expect.objectContaining({ type: 'todo' }),
          initialText: longText,
        }),
      );
    });

    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
