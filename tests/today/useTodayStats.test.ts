/**
 * Tests for useTodayStats Hook
 * Focus: overdueTodos and recentDrops derived arrays
 */

import { renderHook } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────────────────────

// Store for mock sweep candidates - use a getter function pattern
const mockState = {
  sweepCandidates: [] as Array<{
    id: string;
    type: 'todo';
    name: string;
    due_day?: string | null;
    due_date?: string | null;
    status?: 'active' | 'completed' | 'archived';
    carry_forward?: boolean;
    completed_at?: string | null;
    archived?: boolean;
  }>,
  nowData: {
    lockedItems: [] as Array<{ id: string; type: string; name: string; locked: boolean }>,
    activeItems: [] as Array<{ id: string; type: string; name: string; locked: boolean }>,
    futureItems: [] as Array<{ id: string; type: string; name: string }>,
    completedToday: [] as Array<{ id: string; type: string; name: string; completedAt: string }>,
    capturesCount: 0,
    progressState: {
      mode: 'dots' as const,
      percent: 0,
      completedCount: 0,
      totalEligibleCount: 0,
      dots: [] as boolean[],
    },
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
  },
};

// Mock useNowData - reads from mockState
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: jest.fn(() => mockState.nowData),
}));

// Mock selectSweepCandidates - reads from mockState
jest.mock('../../lib/today/sweepSelectors', () => ({
  selectSweepCandidates: jest.fn(() => mockState.sweepCandidates),
  isSweepEligible: jest.fn(() => false),
  getSweepCandidateCount: jest.fn(() => mockState.sweepCandidates.length),
}));

// Import after mocks are set up
import { useTodayStats } from '../../lib/today/hooks/useTodayStats';
import { useNowData } from '../../lib/now/useNowData';
import { selectSweepCandidates } from '../../lib/today/sweepSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function createMockSweepCandidate(overrides: Partial<(typeof mockState.sweepCandidates)[0]> = {}) {
  return {
    id: `todo-${Math.random().toString(36).slice(2, 9)}`,
    type: 'todo' as const,
    name: 'Test Todo',
    due_day: null,
    due_date: null,
    status: 'active' as const,
    carry_forward: false,
    completed_at: null,
    archived: false,
    ...overrides,
  };
}

function resetMocks() {
  mockState.sweepCandidates = [];
  mockState.nowData = {
    lockedItems: [],
    activeItems: [],
    futureItems: [],
    completedToday: [],
    capturesCount: 0,
    progressState: {
      mode: 'dots' as const,
      percent: 0,
      completedCount: 0,
      totalEligibleCount: 0,
      dots: [],
    },
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
  };
  // Re-set mock implementations to use updated mockState
  (useNowData as jest.Mock).mockImplementation(() => mockState.nowData);
  (selectSweepCandidates as jest.Mock).mockImplementation(() => mockState.sweepCandidates);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useTodayStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  describe('overdueTodos', () => {
    it('returns empty array when no sweep candidates exist', () => {
      mockState.sweepCandidates = [];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toEqual([]);
    });

    it('includes todos where due_day is before today', () => {
      // Mock today as 2025-12-04
      const todayString = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];

      const overdueTodo = createMockSweepCandidate({
        id: 'todo-overdue',
        name: 'Overdue Task',
        due_day: yesterdayString,
      });

      const todayTodo = createMockSweepCandidate({
        id: 'todo-today',
        name: 'Today Task',
        due_day: todayString,
      });

      mockState.sweepCandidates = [overdueTodo, todayTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(1);
      expect(result.current.overdueTodos[0].id).toBe('todo-overdue');
    });

    it('includes todos where due_date (fallback) is before today when due_day is null', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = yesterday.toISOString();

      const overdueTodo = createMockSweepCandidate({
        id: 'todo-overdue-date',
        name: 'Overdue via due_date',
        due_day: null,
        due_date: yesterdayIso,
      });

      mockState.sweepCandidates = [overdueTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(1);
      expect(result.current.overdueTodos[0].id).toBe('todo-overdue-date');
    });

    it('excludes todos with no due date (null due_day and null due_date)', () => {
      const noDueDateTodo = createMockSweepCandidate({
        id: 'todo-no-due',
        name: 'No Due Date',
        due_day: null,
        due_date: null,
      });

      mockState.sweepCandidates = [noDueDateTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(0);
    });

    it('excludes todos due today (not overdue)', () => {
      const todayString = new Date().toISOString().split('T')[0];

      const todayTodo = createMockSweepCandidate({
        id: 'todo-today',
        name: 'Due Today',
        due_day: todayString,
      });

      mockState.sweepCandidates = [todayTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(0);
    });

    it('excludes todos due in the future', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];

      const futureTodo = createMockSweepCandidate({
        id: 'todo-future',
        name: 'Future Task',
        due_day: tomorrowString,
      });

      mockState.sweepCandidates = [futureTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(0);
    });

    it('handles multiple overdue todos correctly', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoString = twoDaysAgo.toISOString().split('T')[0];

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];

      const overdue1 = createMockSweepCandidate({
        id: 'todo-overdue-1',
        name: 'Overdue 1',
        due_day: twoDaysAgoString,
      });

      const overdue2 = createMockSweepCandidate({
        id: 'todo-overdue-2',
        name: 'Overdue 2',
        due_day: yesterdayString,
      });

      mockState.sweepCandidates = [overdue1, overdue2];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(2);
      expect(result.current.overdueTodos.map((t) => t.id)).toContain('todo-overdue-1');
      expect(result.current.overdueTodos.map((t) => t.id)).toContain('todo-overdue-2');
    });

    it('does not mutate the original sweepCandidates array', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];

      const overdueTodo = createMockSweepCandidate({
        id: 'todo-overdue',
        due_day: yesterdayString,
      });

      mockState.sweepCandidates = [overdueTodo];
      const originalLength = mockState.sweepCandidates.length;

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toHaveLength(1);
      expect(mockState.sweepCandidates.length).toBe(originalLength);
    });
  });

  describe('recentDrops', () => {
    it('returns empty array when no sweep candidates exist', () => {
      mockState.sweepCandidates = [];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toEqual([]);
    });

    it('includes candidates with no due date (need sorting)', () => {
      const noDueDateTodo = createMockSweepCandidate({
        id: 'todo-no-due',
        name: 'Unscheduled Task',
        due_day: null,
        due_date: null,
      });

      mockState.sweepCandidates = [noDueDateTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-no-due');
    });

    it('includes carry-forward items', () => {
      const carryForwardTodo = createMockSweepCandidate({
        id: 'todo-carry-forward',
        name: 'Carried Forward',
        due_day: null,
        carry_forward: true,
      });

      mockState.sweepCandidates = [carryForwardTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-carry-forward');
    });

    it("excludes items already in Today's Focus (todosToday)", () => {
      const focusTodoId = 'todo-in-focus';

      // Mock the todosToday to include this item
      mockState.nowData.activeItems = [
        {
          id: focusTodoId,
          type: 'todo',
          name: 'Focus Task',
          locked: false,
        },
      ];

      const inFocusTodo = createMockSweepCandidate({
        id: focusTodoId,
        name: 'Focus Task',
        due_day: null,
      });

      const notInFocusTodo = createMockSweepCandidate({
        id: 'todo-not-in-focus',
        name: 'Not in Focus',
        due_day: null,
      });

      mockState.sweepCandidates = [inFocusTodo, notInFocusTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-not-in-focus');
    });

    it("excludes items already in Today's Focus (habitsToday)", () => {
      const focusHabitId = 'habit-in-focus';

      // Mock the habitsToday to include this item
      mockState.nowData.activeItems = [
        {
          id: focusHabitId,
          type: 'habit',
          name: 'Focus Habit',
          locked: false,
        },
      ];

      // Note: sweepCandidates are only todos in current implementation,
      // but test the exclusion logic works for any ID in focus
      const todoWithHabitId = createMockSweepCandidate({
        id: focusHabitId, // Same ID as a habit in focus
        name: 'Task with habit ID',
        due_day: null,
      });

      mockState.sweepCandidates = [todoWithHabitId];

      const { result } = renderHook(() => useTodayStats());

      // Should be excluded because ID is in habitsToday
      expect(result.current.recentDrops).toHaveLength(0);
    });

    it('excludes items with a scheduled due date', () => {
      const todayString = new Date().toISOString().split('T')[0];

      const scheduledTodo = createMockSweepCandidate({
        id: 'todo-scheduled',
        name: 'Scheduled Task',
        due_day: todayString,
      });

      const unscheduledTodo = createMockSweepCandidate({
        id: 'todo-unscheduled',
        name: 'Unscheduled Task',
        due_day: null,
      });

      mockState.sweepCandidates = [scheduledTodo, unscheduledTodo];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-unscheduled');
    });

    it('handles combination of focus exclusion and no-due-date filtering', () => {
      const focusTodoId = 'todo-focus';

      mockState.nowData.activeItems = [
        {
          id: focusTodoId,
          type: 'todo',
          name: 'Focus Task',
          locked: false,
        },
      ];

      const inFocusNoDue = createMockSweepCandidate({
        id: focusTodoId,
        name: 'In Focus, No Due',
        due_day: null,
      });

      const notInFocusNoDue = createMockSweepCandidate({
        id: 'todo-not-focus-no-due',
        name: 'Not in Focus, No Due',
        due_day: null,
      });

      const todayString = new Date().toISOString().split('T')[0];
      const notInFocusWithDue = createMockSweepCandidate({
        id: 'todo-not-focus-with-due',
        name: 'Not in Focus, Has Due',
        due_day: todayString,
      });

      mockState.sweepCandidates = [inFocusNoDue, notInFocusNoDue, notInFocusWithDue];

      const { result } = renderHook(() => useTodayStats());

      // Only the one that's not in focus AND has no due date
      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-not-focus-no-due');
    });

    it('does not mutate the original sweepCandidates array', () => {
      const noDueTodo = createMockSweepCandidate({
        id: 'todo-no-due',
        due_day: null,
      });

      mockState.sweepCandidates = [noDueTodo];
      const originalLength = mockState.sweepCandidates.length;

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(mockState.sweepCandidates.length).toBe(originalLength);
    });
  });

  describe('return shape includes new fields', () => {
    it('TodayStats includes overdueTodos and recentDrops arrays', () => {
      mockState.sweepCandidates = [];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current).toHaveProperty('overdueTodos');
      expect(result.current).toHaveProperty('recentDrops');
      expect(Array.isArray(result.current.overdueTodos)).toBe(true);
      expect(Array.isArray(result.current.recentDrops)).toBe(true);
    });

    it('sweepCandidates still includes all candidates regardless of filtering', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];

      const overdue = createMockSweepCandidate({
        id: 'todo-overdue',
        due_day: yesterdayString,
      });

      const noDue = createMockSweepCandidate({
        id: 'todo-no-due',
        due_day: null,
      });

      mockState.sweepCandidates = [overdue, noDue];

      const { result } = renderHook(() => useTodayStats());

      // sweepCandidates should have both
      expect(result.current.sweepCandidates).toHaveLength(2);
      // But they should be split into the derived arrays
      expect(result.current.overdueTodos).toHaveLength(1);
      expect(result.current.recentDrops).toHaveLength(1);
    });
  });
});
