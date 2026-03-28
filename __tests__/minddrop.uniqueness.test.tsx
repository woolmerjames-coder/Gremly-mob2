import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../lib/cortex/cortexDecide';

const existingRecord = { id: 'note-123', type: 'note' as const };

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  notes: { list: jest.fn() },
  todos: { list: jest.fn() },
  habits: { list: jest.fn() },
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

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

const mockDecideWithContext = jest.fn();

jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../lib/diagnostics/catchallDebug', () => ({
  startCatchallTrace: () => ({ id: 'fixed-trace-id' }),
  step: jest.fn(),
  end: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockShowToast = jest.fn();

jest.mock('../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowToast,
    Toast: () => null,
  }),
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
}));

jest.mock('@/src/config/featureFlags', () => ({
  MIND_DROP_V2: true,
}));

// Import after mocks
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

const noteDecision = {
  mode: 'auto',
  confidence: 0.9,
  actions: [
    {
      type: 'create.note',
      payload: { title: 'Initial capture' },
    },
  ],
  suggestions: [],
  explanation: 'Create note',
} as unknown as CortexResponse;

const todoDecision = {
  mode: 'auto',
  confidence: 0.92,
  actions: [
    {
      type: 'create.todo',
      payload: { title: 'Convert to todo' },
    },
  ],
  suggestions: [],
  explanation: 'Convert note to todo',
} as unknown as CortexResponse;

describe('Mind Drop uniqueness when converting note to todo', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    let noteCreated = false;

    mockRepo.create.mockImplementation((input: any) => {
      noteCreated = true;
      return Promise.resolve({ id: existingRecord.id, type: input.type });
    });

    mockRepo.update.mockResolvedValue({ id: existingRecord.id, type: 'todo' });

    // Return existing note on subsequent lookups after first create
    mockRepo.findNoteBySourceMessageId.mockImplementation(() => {
      if (noteCreated) {
        return Promise.resolve(existingRecord);
      }
      return Promise.resolve(null);
    });

    mockRepo.getById.mockResolvedValue(null);
    mockRepo.notes.list.mockResolvedValue([]);
    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    mockDecideWithContext.mockReset();
    mockDecideWithContext.mockResolvedValueOnce(noteDecision);
    mockDecideWithContext.mockResolvedValueOnce(todoDecision);
    mockDecideWithContext.mockResolvedValue(todoDecision);
  });

  it.skip('reuses existing record via update when converting to todo', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, 'Draft project notes');
    fireEvent.press(getByTestId('minddrop-submit-button'));

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));
    expect(mockRepo.create.mock.calls[0]?.[0]?.sourceMessageId).toEqual(expect.any(String));

    fireEvent.changeText(input, 'Convert this into a todo by tomorrow');
    fireEvent.press(getByTestId('minddrop-submit-button'));

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));
    expect(mockRepo.create).toHaveBeenCalledTimes(1);

    const updateCall = mockRepo.update.mock.calls[0]?.[0];
    expect(updateCall?.id).toBe(existingRecord.id);
  });
});
