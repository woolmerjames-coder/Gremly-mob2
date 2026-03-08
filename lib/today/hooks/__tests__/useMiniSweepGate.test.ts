/**
 * Tests for useMiniSweepGate hook
 *
 * This hook determines when to show the Mini Sweep gate before Morning Brief.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMiniSweepGate } from '../useMiniSweepGate';
import { useGremlyStore } from '../../../store/useGremlyStore';
import type { Todo } from '../../../types';

// Mock the store
jest.mock('../../../store/useGremlyStore');

// Mock the selectors
jest.mock('../../../store/selectors', () => ({
  useRolledOverTodos: jest.fn(() => []),
  useUnscheduledTodosForMiniSweep: jest.fn(() => []),
}));

import { useRolledOverTodos, useUnscheduledTodosForMiniSweep } from '../../../store/selectors';

const mockUseGremlyStore = useGremlyStore as jest.MockedFunction<typeof useGremlyStore>;
const mockUseRolledOverTodos = useRolledOverTodos as jest.MockedFunction<typeof useRolledOverTodos>;
const mockUseUnscheduledTodosForMiniSweep = useUnscheduledTodosForMiniSweep as jest.MockedFunction<
  typeof useUnscheduledTodosForMiniSweep
>;

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Todo',
    name: 'Test Todo',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Todo;
}

describe('useMiniSweepGate', () => {
  const mockMarkMiniSweepCompleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));

    // Default mock implementations
    mockUseGremlyStore.mockImplementation((selector: any) => {
      const state = {
        miniSweepLastCompletedAt: null,
        markMiniSweepCompleted: mockMarkMiniSweepCompleted,
        gremlyAge: 5, // Default to established user
        todos: [], // Required by todayUnprocessedDrops selector
      };
      return selector(state);
    });

    mockUseRolledOverTodos.mockReturnValue([]);
    mockUseUnscheduledTodosForMiniSweep.mockReturnValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('gremlyAge gate', () => {
    it('returns false when gremlyAge < 1 (brand new user) even with items to sweep', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          miniSweepLastCompletedAt: null,
          markMiniSweepCompleted: mockMarkMiniSweepCompleted,
          gremlyAge: 0, // Brand new user
          todos: [],
        };
        return selector(state);
      });

      mockUseRolledOverTodos.mockReturnValue([makeTodo({ id: 't1', due_day: '2025-12-14' })]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(false);
    });

    it('returns true when gremlyAge >= 1 and has items to sweep', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          miniSweepLastCompletedAt: null,
          markMiniSweepCompleted: mockMarkMiniSweepCompleted,
          gremlyAge: 1, // Completed first ritual
          todos: [],
        };
        return selector(state);
      });

      mockUseRolledOverTodos.mockReturnValue([makeTodo({ id: 't1', due_day: '2025-12-14' })]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(true);
    });
  });

  describe('shouldShowMiniSweep', () => {
    it('returns false when no items to sweep', () => {
      mockUseRolledOverTodos.mockReturnValue([]);
      mockUseUnscheduledTodosForMiniSweep.mockReturnValue([]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(false);
    });

    it('returns true when there are rolled over todos', () => {
      mockUseRolledOverTodos.mockReturnValue([makeTodo({ id: 't1', due_day: '2025-12-14' })]);
      mockUseUnscheduledTodosForMiniSweep.mockReturnValue([]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(true);
      expect(result.current.rolledOverCount).toBe(1);
    });

    it('returns true when there are unscheduled todos', () => {
      mockUseRolledOverTodos.mockReturnValue([]);
      mockUseUnscheduledTodosForMiniSweep.mockReturnValue([makeTodo({ id: 't1', due_day: null })]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(true);
      expect(result.current.unscheduledCount).toBe(1);
    });

    it('returns false when mini sweep was already completed today', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          miniSweepLastCompletedAt: '2025-12-15T18:00:00Z', // Completed earlier today
          markMiniSweepCompleted: mockMarkMiniSweepCompleted,
          gremlyAge: 5,
          todos: [],
        };
        return selector(state);
      });

      mockUseRolledOverTodos.mockReturnValue([makeTodo({ id: 't1', due_day: '2025-12-14' })]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(false);
    });

    it('returns true when mini sweep was completed yesterday (new day)', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          miniSweepLastCompletedAt: '2025-12-14T20:00:00Z', // Completed yesterday
          markMiniSweepCompleted: mockMarkMiniSweepCompleted,
          gremlyAge: 5,
          todos: [],
        };
        return selector(state);
      });

      mockUseRolledOverTodos.mockReturnValue([makeTodo({ id: 't1', due_day: '2025-12-14' })]);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.shouldShowMiniSweep).toBe(true);
    });
  });

  describe('counts', () => {
    it('provides correct counts for rolled over and unscheduled todos', () => {
      const rolledOver = [
        makeTodo({ id: 't1', due_day: '2025-12-14' }),
        makeTodo({ id: 't2', due_day: '2025-12-13' }),
      ];
      const unscheduled = [
        makeTodo({ id: 't3', due_day: null }),
        makeTodo({ id: 't4', due_day: null }),
        makeTodo({ id: 't5', due_day: null }),
      ];

      mockUseRolledOverTodos.mockReturnValue(rolledOver);
      mockUseUnscheduledTodosForMiniSweep.mockReturnValue(unscheduled);

      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.rolledOverCount).toBe(2);
      expect(result.current.unscheduledCount).toBe(3);
      expect(result.current.rolledOverTodos).toHaveLength(2);
      expect(result.current.unscheduledTodos).toHaveLength(3);
    });
  });

  describe('markMiniSweepCompleted', () => {
    it('provides the markMiniSweepCompleted action from store', () => {
      const { result } = renderHook(() => useMiniSweepGate());

      expect(result.current.markMiniSweepCompleted).toBe(mockMarkMiniSweepCompleted);
    });

    it('can be called to mark sweep as completed', async () => {
      const { result } = renderHook(() => useMiniSweepGate());

      await act(async () => {
        await result.current.markMiniSweepCompleted();
      });

      expect(mockMarkMiniSweepCompleted).toHaveBeenCalled();
    });
  });
});
