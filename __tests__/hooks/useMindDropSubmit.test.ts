/**
 * useMindDropSubmit.test.ts
 *
 * Tests for the Mind Drop submission hook (uses Zustand store methods)
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import { useMindDropStore } from '../../lib/stores/mindDropStore';
import { useGremlyStore as _useGremlyStore } from '../../lib/store/useGremlyStore';
import { eventBus } from '../../lib/events/EventBus';

// Mock Zustand store methods
const mockCreateTodo = jest.fn();
const mockCreateHabit = jest.fn();
const mockCreateNote = jest.fn();

jest.mock('../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: any) => {
    const mockStore = {
      createTodo: mockCreateTodo,
      createHabit: mockCreateHabit,
      createNote: mockCreateNote,
    };
    return selector(mockStore);
  },
}));

// Mock useRepo (still needed for Phase 2)
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
    update: jest.fn(),
    getById: jest.fn(),
  }),
}));

// Mock eventBus
jest.mock('../../lib/events/EventBus', () => ({
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
  },
}));

describe('useMindDropSubmit', () => {
  beforeEach(() => {
    useMindDropStore.getState().clearAll();
    jest.clearAllMocks();

    // Default mock implementations - return full entity objects
    mockCreateTodo.mockResolvedValue({ id: 'mock-todo-id', type: 'todo', name: 'test' });
    mockCreateHabit.mockResolvedValue({ id: 'mock-habit-id', type: 'habit', name: 'test' });
    mockCreateNote.mockResolvedValue({ id: 'mock-note-id', type: 'note', title: 'test' });
  });

  test('adds pending item immediately on submit', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    // Start submit but don't await
    let submitPromise: Promise<any>;
    act(() => {
      submitPromise = result.current.submit('buy groceries', {
        source: 'minddrop',
      });
    });

    // Check store has pending item before promise resolves
    const pendingItems = useMindDropStore.getState().pendingItems;
    expect(Object.keys(pendingItems).length).toBe(1);

    const pendingItem = Object.values(pendingItems)[0];
    expect(pendingItem.text).toBe('buy groceries');
    expect(pendingItem.predictedBucket).toBe('todo');

    // Clean up by awaiting the promise
    await act(async () => {
      await submitPromise;
    });
  });

  test('creates todo for action text', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('buy milk', {
        source: 'minddrop',
      });
    });

    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
    expect(mockCreateTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'buy milk',
      }),
    );
    expect(submitResult.success).toBe(true);
    expect(submitResult.bucket).toBe('todo');
  });

  test('creates habit for frequency text', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('exercise daily', {
        source: 'minddrop',
      });
    });

    expect(mockCreateHabit).toHaveBeenCalledTimes(1);
    expect(mockCreateHabit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'exercise daily',
      }),
    );
    expect(submitResult.success).toBe(true);
    expect(submitResult.bucket).toBe('habit');
  });

  test('creates note for general text', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('interesting thought', {
        source: 'minddrop',
      });
    });

    expect(mockCreateNote).toHaveBeenCalledTimes(1);
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'interesting thought',
      }),
    );
    expect(submitResult.success).toBe(true);
    expect(submitResult.bucket).toBe('log');
  });

  test('prevents double submission', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    // Make the first call take time
    mockCreateTodo.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ id: 'mock-id', type: 'todo' }), 100)),
    );

    let firstPromise: Promise<any>;
    let secondPromise: Promise<any>;

    act(() => {
      firstPromise = result.current.submit('buy milk', { source: 'minddrop' });
      secondPromise = result.current.submit('buy eggs', { source: 'minddrop' });
    });

    const [firstResult, secondResult] = await Promise.all([firstPromise!, secondPromise!]);

    // First should succeed, second should be blocked
    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(false);
    expect(secondResult.error?.message).toBe('Submission already in progress');

    // Only one create call should have been made
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
  });

  test('emits entity:created event', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('buy milk', { source: 'minddrop' });
    });

    expect(eventBus.emit).toHaveBeenCalledWith(
      'entity:created',
      expect.objectContaining({
        type: 'todo',
        entity: expect.objectContaining({
          id: 'mock-todo-id',
        }),
      }),
    );
  });

  test('handles empty text error', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('', { source: 'minddrop' });
    });

    expect(submitResult.success).toBe(false);
    expect(submitResult.error).toBeDefined();
    expect(submitResult.error.message).toBe('Cannot submit empty drop');

    // No store calls should have been made
    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(mockCreateHabit).not.toHaveBeenCalled();
    expect(mockCreateNote).not.toHaveBeenCalled();
  });

  test('removes pending item on error', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    // Make createTodo throw an error
    mockCreateTodo.mockRejectedValue(new Error('Database error'));

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('buy milk', {
        source: 'minddrop',
      });
    });

    expect(submitResult.success).toBe(false);
    expect(submitResult.error?.message).toBe('Database error');

    // Pending items should be empty after error
    const pendingItems = useMindDropStore.getState().pendingItems;
    expect(Object.keys(pendingItems).length).toBe(0);
  });
});
