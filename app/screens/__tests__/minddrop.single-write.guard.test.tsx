/**
 * Mind Drop Single Write Guard
 *
 * Ensures that when a record already exists for a sourceMessageId we update it
 * instead of creating a duplicate entry.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

const existingRecord = {
  id: 'existing-todo-id',
  type: 'todo' as const,
  title: 'Existing placeholder',
};

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  notes: { list: jest.fn() },
  todos: { list: jest.fn() },
  habits: { list: jest.fn() },
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
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

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
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

const mockShowToast = jest.fn();

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowToast,
    Toast: () => null,
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
}));

jest.mock('@/src/config/featureFlags', () => ({
  MIND_DROP_V2: true,
}));

// Import after mocks
import CatchAllNotepad from '../CatchAllNotepad';

describe('Mind Drop single-write guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRepo.getById.mockResolvedValue(null);
    mockRepo.remove.mockResolvedValue(undefined);
    mockRepo.notes.list.mockResolvedValue([]);
    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);
    mockRepo.findBySourceMessageId.mockResolvedValue(existingRecord);
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(existingRecord);
    mockRepo.update.mockImplementation(({ id, patch }) =>
      Promise.resolve({ ...existingRecord, id, ...patch }),
    );
    mockRepo.create.mockImplementation(() => Promise.resolve({ id: 'should-not-be-created' }));

    const autoTodo: CortexResponse = {
      mode: 'auto',
      confidence: 0.91,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Buy groceries' },
        },
      ],
      suggestions: [],
      explanation: 'Auto organize',
    };

    mockDecideWithContext.mockResolvedValue(autoTodo);
  });

  it('updates existing record instead of creating a duplicate', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Buy groceries');

    const submit = getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledTimes(1);
    });

    expect(mockRepo.create).not.toHaveBeenCalled();

    const updateCall = mockRepo.update.mock.calls[0]?.[0];
    expect(updateCall?.id).toBe(existingRecord.id);
    expect(updateCall?.patch?.title ?? updateCall?.patch?.name).toBe('Buy groceries');
  });
});
