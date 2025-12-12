/**
 * useMindDropSubmit.test.ts
 *
 * Tests for the Mind Drop submission hook (BRIDGE version)
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import { useMindDropStore } from '../../lib/stores/mindDropStore';
import { eventBus } from '../../lib/events/EventBus';

// Mock useRepo
const mockTodosCreate = jest.fn();
const mockHabitsCreate = jest.fn();
const mockNotesCreate = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn((input: any) => {
      if (input.type === 'todo') {
        return mockTodosCreate(input);
      } else if (input.type === 'habit') {
        return mockHabitsCreate(input);
      } else if (input.type === 'note') {
        return mockNotesCreate(input);
      }
    }),
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

    // Default mock implementations
    mockTodosCreate.mockResolvedValue({ id: 'mock-todo-id' });
    mockHabitsCreate.mockResolvedValue({ id: 'mock-habit-id' });
    mockNotesCreate.mockResolvedValue({ id: 'mock-note-id' });
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

    expect(mockTodosCreate).toHaveBeenCalledTimes(1);
    expect(mockTodosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'todo',
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

    expect(mockHabitsCreate).toHaveBeenCalledTimes(1);
    expect(mockHabitsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'habit',
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

    expect(mockNotesCreate).toHaveBeenCalledTimes(1);
    expect(mockNotesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        title: 'interesting thought',
      }),
    );
    expect(submitResult.success).toBe(true);
    expect(submitResult.bucket).toBe('log');
  });

  test('prevents double submission', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    // Make the first call take time
    mockTodosCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 'mock-id' }), 100)),
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
    expect(mockTodosCreate).toHaveBeenCalledTimes(1);
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

    // No repo calls should have been made
    expect(mockTodosCreate).not.toHaveBeenCalled();
    expect(mockHabitsCreate).not.toHaveBeenCalled();
    expect(mockNotesCreate).not.toHaveBeenCalled();
  });

  test('removes pending item on error', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    // Make todos.create throw an error
    mockTodosCreate.mockRejectedValue(new Error('Database error'));

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
