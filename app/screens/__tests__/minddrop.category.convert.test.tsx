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
  findBySourceMessageId: jest.fn(() => Promise.resolve(null)),
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

const mockOverlayController = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
};

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
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
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
  mockRepo.findBySourceMessageId.mockReset();
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
  mockRepo.findBySourceMessageId.mockResolvedValue(null);
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

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Buy groceries and milk');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await waitFor(() => expect(queryByTestId('minddrop-category-todo')).toBeTruthy(), {
      timeout: 4000,
    });

    const todoChip = queryByTestId('minddrop-category-todo');
    if (!todoChip) {
      throw new Error('Category chip did not render');
    }
    fireEvent.press(todoChip);

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: 'unsorted-123',
        patch: expect.objectContaining({
          canonicalType: 'todo',
          ai_placed: true,
          labels: expect.not.arrayContaining(['catchall', 'unsorted', 'needs_review']),
          why_string: expect.stringContaining('Confirmed as to-do via category chip'),
          title: 'Buy groceries and milk',
          body: 'Buy groceries and milk',
        }),
      });
    });

    const overlay = useGlobalOverlay();
    const openCreate = overlay.openCreate as jest.Mock;
    expect(openCreate).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRepo.getById).toHaveBeenCalledWith('unsorted-123');
  });

  it('prefills overlay with the original note text for manual todo conversion', async () => {
    const longText =
      'Plan the entire quarterly roadmap agenda with stakeholder updates and detailed timelines so nothing slips through the cracks this week\nSecond line here';
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

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, longText);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => expect(mockDecideWithContext).toHaveBeenCalledTimes(1), {
      timeout: 4000,
    });

    const decision = await mockDecideWithContext.mock.results[0].value;
    expect(Array.isArray(decision?.suggestions) ? decision.suggestions.length : 0).toBeGreaterThan(
      0,
    );

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await waitFor(() => expect(queryByTestId('minddrop-category-todo')).toBeTruthy(), {
      timeout: 4000,
    });

    const todoChip = queryByTestId('minddrop-category-todo');
    if (!todoChip) {
      throw new Error('Category chip did not render');
    }
    fireEvent.press(todoChip);

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: 'unsorted-456',
        patch: expect.objectContaining({
          canonicalType: 'todo',
          title: longText,
          body: longText,
        }),
      });
    });

    const overlay = useGlobalOverlay();
    const openCreate = overlay.openCreate as jest.Mock;
    expect(openCreate).not.toHaveBeenCalled();
  });
});
