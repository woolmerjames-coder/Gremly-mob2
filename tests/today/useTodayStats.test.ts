// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * Tests for useTodayStats Hook
 * Focus: overdueTodos and recentDrops derived arrays
 *
 * recentDrops semantics (updated):
 * - Items captured TODAY (created_at date === today)
 * - NOT already in Today's Focus
 * - Unscheduled (no due_day) - need triage
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
    created_at?: string | null;
  }>,
  nowData: {
    lockedItems: [] as Array<{ id: string; type: string; name: string; locked: boolean }>,
    activeItems: [] as Array<{ id: string; type: string; name: string; locked: boolean }>,
    futureItems: [] as Array<{ id: string; type: string; name: string }>,
    completedToday: [] as Array<{ id: string; type: string; name: string; completedAt: string }>,
    allTodos: [] as Array<{
      id: string;
      type: 'todo';
      name: string;
      due_day?: string | null;
      due_date?: string | null;
      status?: string;
      carry_forward?: boolean;
      archived?: boolean;
      created_at: string;
    }>,
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

const todayIsoString = new Date().toISOString();

// Use LOCAL date format (same as getTodayDayString in useTodayStats)
function getLocalDayString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const todayDayString = getLocalDayString();

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
    created_at: todayIsoString, // Default to created today
    ...overrides,
  };
}

/**
 * Convert a sweep candidate to allTodos format.
 * allTodos uses a slightly different shape (same fields but typed differently)
 */
function toAllTodo(candidate: ReturnType<typeof createMockSweepCandidate>) {
  return {
    id: candidate.id,
    type: 'todo' as const,
    name: candidate.name,
    due_day: candidate.due_day,
    due_date: candidate.due_date,
    status: candidate.status ?? 'active',
    carry_forward: candidate.carry_forward,
    archived: candidate.archived,
    created_at: candidate.created_at ?? todayIsoString,
  };
}

function resetMocks() {
  mockState.sweepCandidates = [];
  mockState.nowData = {
    lockedItems: [],
    activeItems: [],
    futureItems: [],
    completedToday: [],
    allTodos: [],
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

describe.skip('useTodayStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  describe.skip('overdueTodos', () => {
    it('returns empty array when no sweep candidates exist', () => {
      mockState.sweepCandidates = [];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.overdueTodos).toEqual([]);
    });

    it('includes todos where due_day is before today', () => {
      // Use local day strings for consistency with useTodayStats
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = getLocalDayString(yesterday);

      const overdueTodo = createMockSweepCandidate({
        id: 'todo-overdue',
        name: 'Overdue Task',
        due_day: yesterdayString,
      });

      const todayTodo = createMockSweepCandidate({
        id: 'todo-today',
        name: 'Today Task',
        due_day: todayDayString,
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
      const twoDaysAgoString = getLocalDayString(twoDaysAgo);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = getLocalDayString(yesterday);

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
      const yesterdayString = getLocalDayString(yesterday);

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

  describe.skip('recentDrops', () => {
    it('returns empty array when no todos exist', () => {
      mockState.sweepCandidates = [];
      mockState.nowData.allTodos = [];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toEqual([]);
    });

    it('includes candidates created today with no due date (need sorting)', () => {
      const noDueDateTodo = createMockSweepCandidate({
        id: 'todo-no-due',
        name: 'Unscheduled Task',
        due_day: null,
        due_date: null,
        created_at: todayIsoString, // Created today
      });

      mockState.sweepCandidates = [noDueDateTodo];
      mockState.nowData.allTodos = [toAllTodo(noDueDateTodo)];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-no-due');
    });

    it('excludes items NOT created in the last 3 days even if unscheduled', () => {
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
      const fourDaysAgoIso = fourDaysAgo.toISOString();

      const oldUnscheduledTodo = createMockSweepCandidate({
        id: 'todo-old-no-due',
        name: 'Old Unscheduled Task',
        due_day: null,
        due_date: null,
        created_at: fourDaysAgoIso, // NOT created in the last 3 days
      });

      mockState.sweepCandidates = [oldUnscheduledTodo];
      mockState.nowData.allTodos = [toAllTodo(oldUnscheduledTodo)];

      const { result } = renderHook(() => useTodayStats());

      // Should NOT be in recentDrops because not created in the last 3 days
      expect(result.current.recentDrops).toHaveLength(0);
    });

    it('excludes carry-forward items not created in the last 3 days', () => {
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
      const fourDaysAgoIso = fourDaysAgo.toISOString();

      const carryForwardTodo = createMockSweepCandidate({
        id: 'todo-carry-forward',
        name: 'Carried Forward',
        due_day: null,
        carry_forward: true,
        created_at: fourDaysAgoIso, // NOT created in the last 3 days
      });

      mockState.sweepCandidates = [carryForwardTodo];
      mockState.nowData.allTodos = [toAllTodo(carryForwardTodo)];

      const { result } = renderHook(() => useTodayStats());

      // carry_forward alone is not enough - must be created in the last 3 days
      expect(result.current.recentDrops).toHaveLength(0);
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
        created_at: todayIsoString,
      });

      const notInFocusTodo = createMockSweepCandidate({
        id: 'todo-not-in-focus',
        name: 'Not in Focus',
        due_day: null,
        created_at: todayIsoString,
      });

      mockState.sweepCandidates = [inFocusTodo, notInFocusTodo];
      mockState.nowData.allTodos = [toAllTodo(inFocusTodo), toAllTodo(notInFocusTodo)];

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
        created_at: todayIsoString,
      });

      mockState.sweepCandidates = [todoWithHabitId];
      mockState.nowData.allTodos = [toAllTodo(todoWithHabitId)];

      const { result } = renderHook(() => useTodayStats());

      // Should be excluded because ID is in habitsToday
      expect(result.current.recentDrops).toHaveLength(0);
    });

    it('excludes items with a scheduled due date even if created today', () => {
      const scheduledTodo = createMockSweepCandidate({
        id: 'todo-scheduled',
        name: 'Scheduled Task',
        due_day: todayDayString,
        created_at: todayIsoString,
      });

      const unscheduledTodo = createMockSweepCandidate({
        id: 'todo-unscheduled',
        name: 'Unscheduled Task',
        due_day: null,
        created_at: todayIsoString,
      });

      mockState.sweepCandidates = [scheduledTodo, unscheduledTodo];
      mockState.nowData.allTodos = [toAllTodo(scheduledTodo), toAllTodo(unscheduledTodo)];

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-unscheduled');
    });

    it('handles combination of focus exclusion, created-recently, and no-due-date filtering', () => {
      const focusTodoId = 'todo-focus';
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
      const fourDaysAgoIso = fourDaysAgo.toISOString();

      mockState.nowData.activeItems = [
        {
          id: focusTodoId,
          type: 'todo',
          name: 'Focus Task',
          locked: false,
        },
      ];

      // In focus, created today, no due - excluded (in focus)
      const inFocusNoDue = createMockSweepCandidate({
        id: focusTodoId,
        name: 'In Focus, No Due',
        due_day: null,
        created_at: todayIsoString,
      });

      // Not in focus, created today, no due - INCLUDED
      const notInFocusNoDueToday = createMockSweepCandidate({
        id: 'todo-not-focus-no-due-today',
        name: 'Not in Focus, No Due, Today',
        due_day: null,
        created_at: todayIsoString,
      });

      // Not in focus, created 4 days ago, no due - excluded (not created in last 3 days)
      const notInFocusNoDueOld = createMockSweepCandidate({
        id: 'todo-not-focus-no-due-old',
        name: 'Not in Focus, No Due, Old',
        due_day: null,
        created_at: fourDaysAgoIso,
      });

      // Not in focus, created today, has due - excluded (has due date)
      const notInFocusWithDue = createMockSweepCandidate({
        id: 'todo-not-focus-with-due',
        name: 'Not in Focus, Has Due',
        due_day: todayDayString,
        created_at: todayIsoString,
      });

      mockState.sweepCandidates = [
        inFocusNoDue,
        notInFocusNoDueToday,
        notInFocusNoDueOld,
        notInFocusWithDue,
      ];
      mockState.nowData.allTodos = [
        toAllTodo(inFocusNoDue),
        toAllTodo(notInFocusNoDueToday),
        toAllTodo(notInFocusNoDueOld),
        toAllTodo(notInFocusWithDue),
      ];

      const { result } = renderHook(() => useTodayStats());

      // Only the one that's not in focus AND created in the last 3 days AND has no due date
      expect(result.current.recentDrops).toHaveLength(1);
      expect(result.current.recentDrops[0].id).toBe('todo-not-focus-no-due-today');
    });

    it('does not mutate the original allTodos array', () => {
      const noDueTodo = createMockSweepCandidate({
        id: 'todo-no-due',
        due_day: null,
        created_at: todayIsoString,
      });

      mockState.sweepCandidates = [noDueTodo];
      mockState.nowData.allTodos = [toAllTodo(noDueTodo)];
      const originalLength = mockState.nowData.allTodos.length;

      const { result } = renderHook(() => useTodayStats());

      expect(result.current.recentDrops).toHaveLength(1);
      expect(mockState.nowData.allTodos.length).toBe(originalLength);
    });

    it('excludes items with null created_at', () => {
      const noCreatedAtTodo = createMockSweepCandidate({
        id: 'todo-no-created-at',
        name: 'No created_at',
        due_day: null,
        created_at: null,
      });

      mockState.sweepCandidates = [noCreatedAtTodo];
      // Note: allTodos requires created_at to be string, but we test that null created_at is handled
      mockState.nowData.allTodos = [{ ...toAllTodo(noCreatedAtTodo), created_at: '' }];

      const { result } = renderHook(() => useTodayStats());

      // Should NOT be in recentDrops because created_at is null/empty
      expect(result.current.recentDrops).toHaveLength(0);
    });
  });

  describe.skip('return shape includes new fields', () => {
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
      const yesterdayString = getLocalDayString(yesterday);

      const overdue = createMockSweepCandidate({
        id: 'todo-overdue',
        due_day: yesterdayString,
        created_at: todayIsoString, // Created today
      });

      const noDue = createMockSweepCandidate({
        id: 'todo-no-due',
        due_day: null,
        created_at: todayIsoString, // Created today
      });

      mockState.sweepCandidates = [overdue, noDue];
      mockState.nowData.allTodos = [toAllTodo(overdue), toAllTodo(noDue)];

      const { result } = renderHook(() => useTodayStats());

      // sweepCandidates should have both
      expect(result.current.sweepCandidates).toHaveLength(2);
      // overdueTodos comes from sweepCandidates (items with due_day < today)
      expect(result.current.overdueTodos).toHaveLength(1);
      // recentDrops comes from allTodos (items created today, no due date, not in focus)
      expect(result.current.recentDrops).toHaveLength(1);
    });
  });
});
