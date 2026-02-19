/**
 * Tests for Morning Brief-related store actions
 *
 * Covers actions added on app-fixes-2.15 branch that previously had zero test coverage:
 * - setBriefSelections
 * - toggleBriefSelection
 * - toggleBriefLock
 * - setBriefParked
 * - hideForToday
 * - resetDailyAssignments
 * - isHabitLockedIn (exported utility)
 */

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { isHabitLockedIn } from '../useGremlyStore';
import type { Habit, Todo } from '../../types';

// Mock Supabase
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock AsyncStorage for hideForToday persistence
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

// Mock date service
jest.mock('../../date', () => ({
  getDateService: () => ({
    getCurrentDate: () => '2025-12-15',
    today: () => '2025-12-15',
    now: () => new Date('2025-12-15T10:00:00'),
  }),
}));

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Habit;
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    name: 'Test Todo',
    title: 'Test Todo',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    completed_at: null,
    due_day: '2025-12-15',
    time_window: null,
    time_estimate_minutes: 30,
    tags: [],
    ...overrides,
  } as Todo;
}

describe('Morning Brief store actions', () => {
  // Spy on updateTodo/updateHabit to prevent supabase persistence errors
  // We only test local state mutations here.
  const noopAsync = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    useGremlyStore.setState({
      todos: [],
      habits: [],
      habitProgress: [],
      userId: 'user-1',
      briefSelectedIds: [],
      briefLockedIds: [],
      briefSelectionDate: null,
      hiddenTodayIds: [],
      hiddenTodayDate: null,
      parkedForDay: [],
      // Override persistence actions so they don't call supabase
      updateTodo: noopAsync as any,
      updateHabit: noopAsync as any,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setBriefSelections
  // ═══════════════════════════════════════════════════════════════════════════

  describe('setBriefSelections', () => {
    it('sets selectedIds, lockedIds, and date', () => {
      act(() => {
        useGremlyStore
          .getState()
          .setBriefSelections(['todo-1', 'todo-2'], ['todo-1'], '2025-12-15');
      });

      const state = useGremlyStore.getState();
      expect(state.briefSelectedIds).toEqual(['todo-1', 'todo-2']);
      expect(state.briefLockedIds).toEqual(['todo-1']);
      expect(state.briefSelectionDate).toBe('2025-12-15');
    });

    it('caps lockedIds at 3', () => {
      act(() => {
        useGremlyStore
          .getState()
          .setBriefSelections(['t1', 't2', 't3', 't4'], ['t1', 't2', 't3', 't4'], '2025-12-15');
      });

      expect(useGremlyStore.getState().briefLockedIds).toHaveLength(3);
    });

    it('overwrites previous selections', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['old-1'],
        briefLockedIds: ['old-1'],
        briefSelectionDate: '2025-12-14',
      });

      act(() => {
        useGremlyStore.getState().setBriefSelections(['new-1'], [], '2025-12-15');
      });

      const state = useGremlyStore.getState();
      expect(state.briefSelectedIds).toEqual(['new-1']);
      expect(state.briefLockedIds).toEqual([]);
      expect(state.briefSelectionDate).toBe('2025-12-15');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // toggleBriefSelection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('toggleBriefSelection', () => {
    it('adds task to selection when not selected', () => {
      useGremlyStore.setState({ briefSelectedIds: ['todo-1'] });

      act(() => {
        useGremlyStore.getState().toggleBriefSelection('todo-2');
      });

      expect(useGremlyStore.getState().briefSelectedIds).toEqual(['todo-1', 'todo-2']);
    });

    it('removes task from selection when already selected', () => {
      useGremlyStore.setState({ briefSelectedIds: ['todo-1', 'todo-2'] });

      act(() => {
        useGremlyStore.getState().toggleBriefSelection('todo-1');
      });

      expect(useGremlyStore.getState().briefSelectedIds).toEqual(['todo-2']);
    });

    it('also removes from lockedIds when deselecting', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['todo-1', 'todo-2'],
        briefLockedIds: ['todo-1'],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefSelection('todo-1');
      });

      const state = useGremlyStore.getState();
      expect(state.briefSelectedIds).toEqual(['todo-2']);
      expect(state.briefLockedIds).toEqual([]);
    });

    it('does not affect lockedIds when adding a selection', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['todo-1'],
        briefLockedIds: ['todo-1'],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefSelection('todo-2');
      });

      expect(useGremlyStore.getState().briefLockedIds).toEqual(['todo-1']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // toggleBriefLock
  // ═══════════════════════════════════════════════════════════════════════════

  describe('toggleBriefLock', () => {
    it('locks a selected task', () => {
      useGremlyStore.setState({ briefSelectedIds: ['todo-1'], briefLockedIds: [] });

      act(() => {
        useGremlyStore.getState().toggleBriefLock('todo-1');
      });

      expect(useGremlyStore.getState().briefLockedIds).toEqual(['todo-1']);
    });

    it('unlocks a locked task', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['todo-1'],
        briefLockedIds: ['todo-1'],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefLock('todo-1');
      });

      expect(useGremlyStore.getState().briefLockedIds).toEqual([]);
    });

    it('does nothing for unselected, unslotted task', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['todo-1'],
        briefLockedIds: [],
        todos: [],
        habits: [],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefLock('todo-99');
      });

      expect(useGremlyStore.getState().briefLockedIds).toEqual([]);
    });

    it('caps locked items at 3', () => {
      useGremlyStore.setState({
        briefSelectedIds: ['t1', 't2', 't3', 't4'],
        briefLockedIds: ['t1', 't2', 't3'],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefLock('t4');
      });

      // Should not add t4 since already at cap
      expect(useGremlyStore.getState().briefLockedIds).toEqual(['t1', 't2', 't3']);
    });

    it('allows locking a slotted (scheduled) task even if not selected', () => {
      const todo = makeTodo({
        id: 'todo-slotted',
        scheduled_start_iso: '2025-12-15T09:00:00Z',
      } as any);
      useGremlyStore.setState({
        briefSelectedIds: [],
        briefLockedIds: [],
        todos: [todo],
      });

      act(() => {
        useGremlyStore.getState().toggleBriefLock('todo-slotted');
      });

      expect(useGremlyStore.getState().briefLockedIds).toEqual(['todo-slotted']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setBriefParked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('setBriefParked', () => {
    it('sets parkedForDay ids', () => {
      act(() => {
        useGremlyStore.getState().setBriefParked(['todo-1', 'todo-2']);
      });

      expect(useGremlyStore.getState().parkedForDay).toEqual(['todo-1', 'todo-2']);
    });

    it('replaces previous parked ids', () => {
      useGremlyStore.setState({ parkedForDay: ['old-1'] });

      act(() => {
        useGremlyStore.getState().setBriefParked(['new-1']);
      });

      expect(useGremlyStore.getState().parkedForDay).toEqual(['new-1']);
    });

    it('allows empty array to clear parked', () => {
      useGremlyStore.setState({ parkedForDay: ['todo-1'] });

      act(() => {
        useGremlyStore.getState().setBriefParked([]);
      });

      expect(useGremlyStore.getState().parkedForDay).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // hideForToday
  // ═══════════════════════════════════════════════════════════════════════════

  describe('hideForToday', () => {
    it('adds id to hiddenTodayIds for current date', () => {
      act(() => {
        useGremlyStore.getState().hideForToday('todo-1');
      });

      const state = useGremlyStore.getState();
      expect(state.hiddenTodayIds).toEqual(['todo-1']);
      expect(state.hiddenTodayDate).toBe('2025-12-15');
    });

    it('accumulates hidden ids', () => {
      useGremlyStore.setState({
        hiddenTodayIds: ['todo-1'],
        hiddenTodayDate: '2025-12-15',
      });

      act(() => {
        useGremlyStore.getState().hideForToday('todo-2');
      });

      expect(useGremlyStore.getState().hiddenTodayIds).toEqual(['todo-1', 'todo-2']);
    });

    it('does not duplicate already-hidden id', () => {
      useGremlyStore.setState({
        hiddenTodayIds: ['todo-1'],
        hiddenTodayDate: '2025-12-15',
      });

      act(() => {
        useGremlyStore.getState().hideForToday('todo-1');
      });

      expect(useGremlyStore.getState().hiddenTodayIds).toEqual(['todo-1']);
    });

    it('resets ids when date changes', () => {
      useGremlyStore.setState({
        hiddenTodayIds: ['old-todo'],
        hiddenTodayDate: '2025-12-14', // different date
      });

      act(() => {
        useGremlyStore.getState().hideForToday('new-todo');
      });

      const state = useGremlyStore.getState();
      expect(state.hiddenTodayIds).toEqual(['new-todo']);
      expect(state.hiddenTodayDate).toBe('2025-12-15');
    });

    it('accepts optional forDate parameter', () => {
      act(() => {
        useGremlyStore.getState().hideForToday('todo-1', '2025-12-16');
      });

      const state = useGremlyStore.getState();
      expect(state.hiddenTodayIds).toEqual(['todo-1']);
      expect(state.hiddenTodayDate).toBe('2025-12-16');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // resetDailyAssignments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resetDailyAssignments', () => {
    it('clears daily_block and scheduled_start_iso from all todos', async () => {
      const todo1 = makeTodo({
        id: 'todo-1',
        daily_block: 'morning',
        scheduled_start_iso: '2025-12-15T09:00:00Z',
      } as any);
      const todo2 = makeTodo({ id: 'todo-2' });
      useGremlyStore.setState({ todos: [todo1, todo2] });

      // resetDailyAssignments does set() synchronously, then fires async persistence.
      // The supabase mock may throw on persistence — that's fine, we test local state.
      await act(async () => {
        try {
          useGremlyStore.getState().resetDailyAssignments();
        } catch {
          /* persistence error from mock — expected */
        }
        // Let fire-and-forget persistence settle
        await new Promise((r) => setTimeout(r, 10));
      });

      const todos = useGremlyStore.getState().todos;
      expect((todos[0] as any).daily_block).toBeNull();
      expect((todos[0] as any).scheduled_start_iso).toBeNull();
      // Unaffected todo stays the same (no daily_block to clear)
      expect(todos[1].id).toBe('todo-2');
    });

    it('clears daily_block and scheduled_start_iso from all habits', async () => {
      const habit1 = makeHabit({
        id: 'habit-1',
        daily_block: 'evening',
        scheduled_start_iso: '2025-12-15T18:00:00Z',
      } as any);
      useGremlyStore.setState({ habits: [habit1] });

      // resetDailyAssignments does set() synchronously, then fires async persistence.
      await act(async () => {
        try {
          useGremlyStore.getState().resetDailyAssignments();
        } catch {
          /* persistence error from mock — expected */
        }
        await new Promise((r) => setTimeout(r, 10));
      });

      const habits = useGremlyStore.getState().habits;
      expect((habits[0] as any).daily_block).toBeNull();
      expect((habits[0] as any).scheduled_start_iso).toBeNull();
    });

    it('does nothing when nothing to reset', () => {
      const todo = makeTodo({ id: 'todo-1' });
      useGremlyStore.setState({ todos: [todo] });

      // Should not throw
      act(() => {
        useGremlyStore.getState().resetDailyAssignments();
      });

      expect(useGremlyStore.getState().todos[0].id).toBe('todo-1');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isHabitLockedIn (exported utility)
// ═══════════════════════════════════════════════════════════════════════════

describe('isHabitLockedIn', () => {
  it('returns false when commitment_until is null', () => {
    const habit = { commitment_until: null } as Habit;
    expect(isHabitLockedIn(habit)).toBe(false);
  });

  it('returns false when commitment_until is undefined', () => {
    const habit = {} as Habit;
    expect(isHabitLockedIn(habit)).toBe(false);
  });

  it('returns true when commitment_until is today or later', () => {
    // Mock date service returns '2025-12-15'
    const habit = { commitment_until: '2025-12-15' } as Habit;
    expect(isHabitLockedIn(habit)).toBe(true);
  });

  it('returns true when commitment_until is in the future', () => {
    const habit = { commitment_until: '2025-12-20' } as Habit;
    expect(isHabitLockedIn(habit)).toBe(true);
  });

  it('returns false when commitment_until is in the past', () => {
    const habit = { commitment_until: '2025-12-14' } as Habit;
    expect(isHabitLockedIn(habit)).toBe(false);
  });
});
