import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

const mockClassify = jest.fn();

jest.mock('../cortex/createEngine', () => ({
  __esModule: true,
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: jest.fn(),
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 96,
}));

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  addUnsorted: jest.fn(),
  notes: {
    list: jest.fn(async () => []),
    delete: jest.fn(async () => undefined),
  },
  todos: {
    list: jest.fn(async () => []),
    delete: jest.fn(async () => undefined),
  },
  habits: {
    list: jest.fn(async () => []),
    delete: jest.fn(async () => undefined),
  },
};

jest.mock('../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => mockRepo,
}));

const mockDecideWithContext = jest.fn();

jest.mock('../providers/CortexProvider', () => ({
  __esModule: true,
  useCortex: () => ({
    decideWithContext: mockDecideWithContext,
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'user-1', user: { id: 'user-1' } }),
}));

jest.mock('../src/hooks/useActionToast', () => ({
  __esModule: true,
  useActionToast: () => ({
    showToast: jest.fn(),
    Toast: () => null,
  }),
}));

describe('Mind Drop classification tag persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockImplementation(async (payload) => ({
      id: `record-${Date.now()}`,
      ...payload,
    }));
    mockDecideWithContext.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  const submitMindDrop = async (text: string) => {
    const utils = render(<CatchAllNotepad />);
    const input = utils.getByTestId('minddrop-input');
    const submit = utils.getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, text);

    await act(async () => {
      fireEvent.press(submit);
    });

    return utils;
  };

  it('persists classification tags for todos', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'todo' as const,
      undefinedDue: true,
      tags: ['@Mom', '*list', '#family'],
    });

    await submitMindDrop('Call mom about groceries');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    const payload = mockRepo.create.mock.calls[0][0];
    expect(payload.type).toBe('todo');
    expect(payload.tags).toEqual(expect.arrayContaining(['@Mom', '*list', '#family']));
  });

  it('derives journal subtype from star tag and keeps tags for notes', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'note' as const,
      subtype: 'catchall' as const,
      tags: ['*journal', '#anxious'],
    });

    await submitMindDrop('Reflecting on today');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    const payload = mockRepo.create.mock.calls[0][0];
    expect(payload.type).toBe('note');
    expect(payload.subtype).toBe('journal');
    expect(payload.tags).toEqual(expect.arrayContaining(['*journal', '#anxious']));
  });

  it('preserves tags for habit classifications', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'habit' as const,
      frequency: 'weekly',
      tags: ['#wellness', '*idea'],
    });

    await submitMindDrop('Practice yoga session ideas');

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    const payload = mockRepo.create.mock.calls[0][0];
    expect(payload.type).toBe('habit');
    expect(payload.tags).toEqual(expect.arrayContaining(['#wellness', '*idea']));
  });
});
