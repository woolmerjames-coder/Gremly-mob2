/**
 * Tests for NOW Page Selectors
 * All tests use deterministic mock data with no side effects
 */

import type { Habit, Todo, Note } from '../../lib/types';
import {
  getHabitWeeklyStatus,
  isHabitNeededToday,
  getActiveTodayItems,
  getFutureItems,
  getProgressEligibleItems,
  getProgressState,
  getMindVaultSummary,
  getLockedItems,
  getWeeklyHabitSummaries,
  getCompletedTodayItems,
} from '../../lib/now/nowSelectors';

// Helper to create mock habits
function createMockHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    type: 'habit',
    name: 'Test Habit',
    frequency: 'daily',
    subtype: 'start_habit',
    ai_placed: false,
    cadence: 'daily',
    target_per_period: 1,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-1',
    ...overrides,
  } as Habit;
}

// Helper to create mock todos
function createMockTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    type: 'todo',
    name: 'Test Todo',
    ai_placed: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-1',
    ...overrides,
  } as Todo;
}

// Helper to create mock notes/logs
function createMockNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    type: 'note',
    title: 'Test Note',
    body: 'Test body',
    subtype: 'list',
    ai_placed: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-1',
    ...overrides,
  } as Note;
}

describe('getHabitWeeklyStatus', () => {
  // Test date: Wednesday (day 3)
  const testDate = new Date('2025-11-26T12:00:00Z'); // Wednesday

  it('returns week_complete when remaining is 0', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 3,
    });

    const status = getHabitWeeklyStatus(habit, 3, testDate);
    expect(status).toBe('week_complete');
  });

  it('returns flexible when more days left than needed', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 1 completion, need 2 more, 4 days left (Wed->Sat)
    const status = getHabitWeeklyStatus(habit, 1, testDate);
    expect(status).toBe('flexible');
  });

  it('returns on_track_today when days left equals remaining', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 4,
    });

    // 0 completions, need 4, 4 days left (Wed->Sat)
    const status = getHabitWeeklyStatus(habit, 0, testDate);
    expect(status).toBe('on_track_today');
  });

  it('returns last_chance when behind schedule', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 5,
    });

    // 0 completions, need 5, only 4 days left
    const status = getHabitWeeklyStatus(habit, 0, testDate);
    expect(status).toBe('last_chance');
  });

  it('returns on_track_today for daily habits', () => {
    const habit = createMockHabit({
      cadence: 'daily',
      target_per_period: 1,
    });

    const status = getHabitWeeklyStatus(habit, 0, testDate);
    expect(status).toBe('on_track_today');
  });

  it('returns flexible for monthly habits', () => {
    const habit = createMockHabit({
      cadence: 'monthly',
      target_per_period: 10,
    });

    const status = getHabitWeeklyStatus(habit, 5, testDate);
    expect(status).toBe('flexible');
  });
});

describe('isHabitNeededToday', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');

  it('returns true for daily habits', () => {
    const habit = createMockHabit({
      cadence: 'daily',
    });

    const needed = isHabitNeededToday(habit, 0, testDate);
    expect(needed).toBe(true);
  });

  it('returns true for weekly habits with on_track_today status', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 4,
    });

    // 0 completions, need 4, 4 days left -> on_track_today
    const needed = isHabitNeededToday(habit, 0, testDate);
    expect(needed).toBe(true);
  });

  it('returns true for weekly habits with last_chance status', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 5,
    });

    // 0 completions, need 5, 4 days left -> last_chance
    const needed = isHabitNeededToday(habit, 0, testDate);
    expect(needed).toBe(true);
  });

  it('returns false for weekly habits with flexible status', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 1 completion, need 2 more, 4 days left -> flexible
    const needed = isHabitNeededToday(habit, 1, testDate);
    expect(needed).toBe(false);
  });

  it('returns false for weekly habits that are week_complete', () => {
    const habit = createMockHabit({
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 3 completions, target met -> week_complete
    const needed = isHabitNeededToday(habit, 3, testDate);
    expect(needed).toBe(false);
  });
});

describe('getLockedItems', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');
  const completionHistory = new Map<string, number>();

  it('includes locked habits needed today', () => {
    const habit = createMockHabit({
      id: 'habit-locked',
      cadence: 'daily',
    });
    (habit as any).locked = true;

    const items = getLockedItems([habit], completionHistory, testDate);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('habit-locked');
    expect(items[0].locked).toBe(true);
  });

  it('includes locked todos due today', () => {
    const todo = createMockTodo({
      id: 'todo-locked',
      due_day: '2025-11-26',
    });
    (todo as any).locked = true;

    const items = getLockedItems([todo], completionHistory, testDate);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('todo-locked');
    expect(items[0].type).toBe('todo');
  });

  it('excludes unlocked items', () => {
    const habit = createMockHabit({
      cadence: 'daily',
    });
    const todo = createMockTodo({
      due_day: '2025-11-26',
    });

    const items = getLockedItems([habit, todo], completionHistory, testDate);

    expect(items).toHaveLength(0);
  });

  it('excludes locked habits not needed today', () => {
    const habit = createMockHabit({
      id: 'habit-weekly',
      cadence: 'weekly',
      target_per_period: 3,
    });
    (habit as any).locked = true;

    // 1 completion, 2 needed, 4 days left -> flexible (not needed today)
    completionHistory.set('habit-weekly', 1);

    const items = getLockedItems([habit], completionHistory, testDate);

    expect(items).toHaveLength(0);
  });
});

describe('getActiveTodayItems', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');
  const completionHistory = new Map<string, number>();

  it('includes todos due today', () => {
    const todo = createMockTodo({
      id: 'todo-today',
      due_day: '2025-11-26',
    });

    const items = getActiveTodayItems([todo], completionHistory, testDate);

    expect(items.length).toBeGreaterThan(0);
    const found = items.find((item) => item.id === 'todo-today');
    expect(found).toBeDefined();
    expect(found?.type).toBe('todo');
  });

  it('includes habits needed today', () => {
    const habit = createMockHabit({
      id: 'habit-daily',
      cadence: 'daily',
    });

    const items = getActiveTodayItems([habit], completionHistory, testDate);

    expect(items.length).toBeGreaterThan(0);
    const found = items.find((item) => item.id === 'habit-daily');
    expect(found).toBeDefined();
    expect(found?.type).toBe('habit');
  });

  it('excludes locked items', () => {
    const habit = createMockHabit({
      id: 'habit-locked',
      cadence: 'daily',
    });
    (habit as any).locked = true;

    const items = getActiveTodayItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-locked');
    expect(found).toBeUndefined();
  });

  it('excludes completed items', () => {
    const todo = createMockTodo({
      id: 'todo-completed',
      due_day: '2025-11-26',
    });
    (todo as any).status = 'completed';

    const items = getActiveTodayItems([todo], completionHistory, testDate);

    const found = items.find((item) => item.id === 'todo-completed');
    expect(found).toBeUndefined();
  });

  // Timezone-safe due_day tests
  describe('due_day timezone handling', () => {
    it('includes todo with due_day matching today', () => {
      const todo = createMockTodo({
        id: 'todo-due-day-today',
        due_day: '2025-11-26', // Matches testDate
        due_date: '2025-11-26T00:00:00+00:00',
      });

      const items = getActiveTodayItems([todo], completionHistory, testDate);

      const found = items.find((item) => item.id === 'todo-due-day-today');
      expect(found).toBeDefined();
      expect(found?.type).toBe('todo');
    });

    it('excludes todo with due_day = yesterday (overdue)', () => {
      const todo = createMockTodo({
        id: 'todo-due-day-yesterday',
        due_day: '2025-11-25', // Yesterday
        due_date: '2025-11-25T00:00:00+00:00',
      });

      const items = getActiveTodayItems([todo], completionHistory, testDate);

      const found = items.find((item) => item.id === 'todo-due-day-yesterday');
      expect(found).toBeUndefined();
    });

    it('excludes todo with due_day = tomorrow (future)', () => {
      const todo = createMockTodo({
        id: 'todo-due-day-tomorrow',
        due_day: '2025-11-27', // Tomorrow
        due_date: '2025-11-27T00:00:00+00:00',
      });

      const items = getActiveTodayItems([todo], completionHistory, testDate);

      const found = items.find((item) => item.id === 'todo-due-day-tomorrow');
      expect(found).toBeUndefined();
    });

    it('uses due_day over due_date when both present (timezone edge case)', () => {
      // Simulate the bug: due_date is UTC midnight which might parse as yesterday in local timezone
      // But due_day explicitly says "2025-11-26" so that should be used
      const todo = createMockTodo({
        id: 'todo-timezone-edge',
        due_day: '2025-11-26', // Explicit "today"
        due_date: '2025-11-26T00:00:00+00:00', // UTC midnight - would be Nov 25 in Pacific
      });

      const items = getActiveTodayItems([todo], completionHistory, testDate);

      const found = items.find((item) => item.id === 'todo-timezone-edge');
      expect(found).toBeDefined();
      expect(found?.type).toBe('todo');
    });

    it('does NOT include todo without due_day (no fallback to due_date)', () => {
      // Current behavior: due_day is required, no fallback to due_date
      const todo = createMockTodo({
        id: 'todo-fallback',
        due_date: '2025-11-26',
        // No due_day - won't show in Today
      });

      const items = getActiveTodayItems([todo], completionHistory, testDate);

      const found = items.find((item) => item.id === 'todo-fallback');
      expect(found).toBeUndefined();
    });
  });

  it('excludes flexible weekly habits', () => {
    const habit = createMockHabit({
      id: 'habit-flexible',
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 1 completion, 2 needed, 4 days left -> flexible
    completionHistory.set('habit-flexible', 1);

    const items = getActiveTodayItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-flexible');
    expect(found).toBeUndefined();
  });
});

describe('getFutureItems', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');
  const completionHistory = new Map<string, number>();

  it('does NOT include todos due tomorrow (simplified view - no future todos)', () => {
    const todo = createMockTodo({
      id: 'todo-tomorrow',
      due_date: '2025-11-27',
    });

    const items = getFutureItems([todo], completionHistory, testDate);

    // Simplified Now page: todos are only shown if due TODAY
    const found = items.find((item) => item.id === 'todo-tomorrow');
    expect(found).toBeUndefined();
  });

  it('does NOT include todos due next week (simplified view - no future todos)', () => {
    const todo = createMockTodo({
      id: 'todo-next-week',
      due_date: '2025-12-03',
    });

    const items = getFutureItems([todo], completionHistory, testDate);

    // Simplified Now page: todos are only shown if due TODAY
    const found = items.find((item) => item.id === 'todo-next-week');
    expect(found).toBeUndefined();
  });

  it('includes flexible weekly habits', () => {
    const habit = createMockHabit({
      id: 'habit-flexible',
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 1 completion, 2 needed, 4 days left -> flexible
    completionHistory.set('habit-flexible', 1);

    const items = getFutureItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-flexible');
    expect(found).toBeDefined();
  });

  it('excludes todos due today', () => {
    const todo = createMockTodo({
      id: 'todo-today',
      due_date: '2025-11-26',
    });

    const items = getFutureItems([todo], completionHistory, testDate);

    const found = items.find((item) => item.id === 'todo-today');
    expect(found).toBeUndefined();
  });

  it('excludes habits needed today', () => {
    const habit = createMockHabit({
      id: 'habit-daily',
      cadence: 'daily',
    });

    const items = getFutureItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-daily');
    expect(found).toBeUndefined();
  });
});

describe('getProgressEligibleItems', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');
  const completionHistory = new Map<string, number>();

  it('includes daily habits', () => {
    const habit = createMockHabit({
      id: 'habit-daily',
      cadence: 'daily',
    });

    const items = getProgressEligibleItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-daily');
    expect(found).toBeDefined();
  });

  it('includes weekly habits with on_track_today status', () => {
    const habit = createMockHabit({
      id: 'habit-on-track',
      cadence: 'weekly',
      target_per_period: 4,
    });

    // 0 completions, 4 needed, 4 days left -> on_track_today
    const items = getProgressEligibleItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-on-track');
    expect(found).toBeDefined();
  });

  it('includes todos due today', () => {
    const todo = createMockTodo({
      id: 'todo-today',
      due_day: '2025-11-26',
    });

    const items = getProgressEligibleItems([todo], completionHistory, testDate);

    const found = items.find((item) => item.id === 'todo-today');
    expect(found).toBeDefined();
  });

  it('includes locked items', () => {
    const habit = createMockHabit({
      id: 'habit-locked',
      cadence: 'daily',
    });
    (habit as any).locked = true;

    const items = getProgressEligibleItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-locked');
    expect(found).toBeDefined();
  });

  it('excludes flexible weekly habits', () => {
    const habit = createMockHabit({
      id: 'habit-flexible',
      cadence: 'weekly',
      target_per_period: 3,
    });

    // 1 completion, 2 needed, 4 days left -> flexible
    completionHistory.set('habit-flexible', 1);

    const items = getProgressEligibleItems([habit], completionHistory, testDate);

    const found = items.find((item) => item.id === 'habit-flexible');
    expect(found).toBeUndefined();
  });

  it('excludes future todos', () => {
    const todo = createMockTodo({
      id: 'todo-tomorrow',
      due_date: '2025-11-27',
    });

    const items = getProgressEligibleItems([todo], completionHistory, testDate);

    const found = items.find((item) => item.id === 'todo-tomorrow');
    expect(found).toBeUndefined();
  });
});

describe('getProgressState', () => {
  it('uses dots mode for 15 or fewer items', () => {
    const eligible = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      type: 'todo' as const,
    }));
    const completed = new Set(['item-0', 'item-1', 'item-2']);

    const state = getProgressState(eligible, completed);

    expect(state.mode).toBe('dots');
    expect(state.totalEligibleCount).toBe(10);
    expect(state.completedCount).toBe(3);
    expect(state.percent).toBe(30);
    expect(state.dots).toBeDefined();
    expect(state.dots?.length).toBe(10);
    expect(state.dots?.filter((d) => d).length).toBe(3);
  });

  it('uses denseDots mode for 16-30 items', () => {
    const eligible = Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i}`,
      type: 'habit' as const,
    }));
    const completed = new Set(Array.from({ length: 10 }, (_, i) => `item-${i}`));

    const state = getProgressState(eligible, completed);

    expect(state.mode).toBe('denseDots');
    expect(state.totalEligibleCount).toBe(25);
    expect(state.completedCount).toBe(10);
    expect(state.percent).toBe(40);
    expect(state.dots).toBeDefined();
    expect(state.dots?.length).toBe(25);
  });

  it('uses bar mode for 31+ items', () => {
    const eligible = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i}`,
      type: 'todo' as const,
    }));
    const completed = new Set(Array.from({ length: 25 }, (_, i) => `item-${i}`));

    const state = getProgressState(eligible, completed);

    expect(state.mode).toBe('bar');
    expect(state.totalEligibleCount).toBe(50);
    expect(state.completedCount).toBe(25);
    expect(state.percent).toBe(50);
    expect(state.dots).toBeUndefined();
  });

  it('handles 0 eligible items', () => {
    const state = getProgressState([], new Set());

    expect(state.mode).toBe('dots'); // 0 items still uses dots mode (0 <= 15)
    expect(state.totalEligibleCount).toBe(0);
    expect(state.completedCount).toBe(0);
    expect(state.percent).toBe(0);
    expect(state.dots).toEqual([]); // Empty dots array
  });

  it('handles 100% completion', () => {
    const eligible = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      type: 'todo' as const,
    }));
    const completed = new Set(eligible.map((e) => e.id));

    const state = getProgressState(eligible, completed);

    expect(state.percent).toBe(100);
    expect(state.completedCount).toBe(5);
    expect(state.dots?.every((d) => d)).toBe(true);
  });
});

describe('getMindVaultSummary', () => {
  // Test date: Wednesday, Nov 26, 2025
  const testDate = new Date('2025-11-26T12:00:00Z');

  it('returns top three lists by item count', () => {
    const logs: Note[] = [
      createMockNote({
        id: 'list-1',
        title: 'Shopping List',
        subtype: 'list',
        created_at: '2025-11-20T00:00:00Z',
      }),
      createMockNote({
        id: 'list-2',
        title: 'Reading List',
        subtype: 'list',
        created_at: '2025-11-21T00:00:00Z',
      }),
      createMockNote({
        id: 'list-3',
        title: 'Packing List',
        subtype: 'list',
        created_at: '2025-11-22T00:00:00Z',
      }),
      createMockNote({
        id: 'list-4',
        title: 'Grocery List',
        subtype: 'list',
        created_at: '2025-11-23T00:00:00Z',
      }),
    ];

    // Mock item counts
    (logs[0] as any).item_count = 15;
    (logs[1] as any).item_count = 8;
    (logs[2] as any).item_count = 12;
    (logs[3] as any).item_count = 5;

    const summary = getMindVaultSummary(logs, testDate);

    expect(summary.topThree).toHaveLength(3);
    expect(summary.topThree[0].name).toBe('Shopping List');
    expect(summary.topThree[0].itemCount).toBe(15);
    expect(summary.topThree[1].name).toBe('Packing List');
    expect(summary.topThree[1].itemCount).toBe(12);
    expect(summary.topThree[2].name).toBe('Reading List');
    expect(summary.topThree[2].itemCount).toBe(8);
  });

  it('calculates overflow count correctly', () => {
    const logs: Note[] = Array.from({ length: 7 }, (_, i) =>
      createMockNote({
        id: `list-${i}`,
        title: `List ${i}`,
        subtype: 'list',
      }),
    );

    logs.forEach((log, i) => {
      (log as any).item_count = i + 1;
    });

    const summary = getMindVaultSummary(logs, testDate);

    expect(summary.topThree).toHaveLength(3);
    expect(summary.overflowCount).toBe(4); // 7 total - 3 shown = 4
  });

  it('calculates this week stats accurately', () => {
    // Week starts Sunday Nov 23, ends Saturday Nov 29
    const logs: Note[] = [
      // This week
      createMockNote({
        id: 'journal-1',
        subtype: 'journal',
        created_at: '2025-11-24T10:00:00Z', // Monday
      }),
      createMockNote({
        id: 'journal-2',
        subtype: 'journal',
        created_at: '2025-11-25T10:00:00Z', // Tuesday
      }),
      createMockNote({
        id: 'idea-1',
        subtype: 'idea',
        created_at: '2025-11-26T10:00:00Z', // Wednesday (today)
      }),
      createMockNote({
        id: 'idea-2',
        subtype: 'idea',
        created_at: '2025-11-24T10:00:00Z', // Monday
      }),
      // Last week (should not count)
      createMockNote({
        id: 'journal-old',
        subtype: 'journal',
        created_at: '2025-11-20T10:00:00Z',
      }),
      createMockNote({
        id: 'idea-old',
        subtype: 'idea',
        created_at: '2025-11-19T10:00:00Z',
      }),
    ];

    const summary = getMindVaultSummary(logs, testDate);

    expect(summary.thisWeekStats.journalCount).toBe(2);
    expect(summary.thisWeekStats.ideaCount).toBe(2);
    expect(summary.thisWeekStats.personCount).toBe(0);
  });

  it('handles empty logs array', () => {
    const summary = getMindVaultSummary([], testDate);

    expect(summary.topThree).toHaveLength(0);
    expect(summary.overflowCount).toBe(0);
    expect(summary.thisWeekStats.journalCount).toBe(0);
    expect(summary.thisWeekStats.ideaCount).toBe(0);
    expect(summary.thisWeekStats.personCount).toBe(0);
  });

  it('handles lists with no item counts', () => {
    const logs: Note[] = [
      createMockNote({
        id: 'list-1',
        title: 'Empty List',
        subtype: 'list',
      }),
    ];

    const summary = getMindVaultSummary(logs, testDate);

    expect(summary.topThree).toHaveLength(1);
    expect(summary.topThree[0].itemCount).toBe(0);
  });
});

describe('getWeeklyHabitSummaries', () => {
  const testDate = new Date('2025-11-26T12:00:00Z'); // Wednesday

  it('returns summary for habit with 0 completions', () => {
    const habits = [
      createMockHabit({
        id: 'habit-1',
        name: 'Morning Meditation',
        cadence: 'weekly',
        target_per_period: 3,
      }),
    ];

    const completionHistory = new Map<string, number>();

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      habitId: 'habit-1',
      name: 'Morning Meditation',
      targetPerWeek: 3,
      completionsThisWeek: 0,
      status: 'flexible', // 0 completions, need 3, 4 days left (Wed-Sat) = flexible
    });
  });

  it('returns summary for habit with some completions (flexible status)', () => {
    const habits = [
      createMockHabit({
        id: 'habit-2',
        name: 'Evening Walk',
        cadence: 'weekly',
        target_per_period: 3,
      }),
    ];

    const completionHistory = new Map([['habit-2', 1]]);

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      habitId: 'habit-2',
      name: 'Evening Walk',
      targetPerWeek: 3,
      completionsThisWeek: 1,
      status: 'flexible', // 1 completion, need 2 more, 4 days left
    });
  });

  it('returns summary for habit in on_track_today status', () => {
    const habits = [
      createMockHabit({
        id: 'habit-3',
        name: 'Read',
        cadence: 'weekly',
        target_per_period: 4,
      }),
    ];

    const completionHistory = new Map([['habit-3', 0]]);

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      habitId: 'habit-3',
      name: 'Read',
      targetPerWeek: 4,
      completionsThisWeek: 0,
      status: 'on_track_today', // 0 completions, need 4, 4 days left = exactly on track
    });
  });

  it('returns summary for habit in last_chance status', () => {
    const habits = [
      createMockHabit({
        id: 'habit-4',
        name: 'Gym',
        cadence: 'weekly',
        target_per_period: 5,
      }),
    ];

    const completionHistory = new Map([['habit-4', 0]]);

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      habitId: 'habit-4',
      name: 'Gym',
      targetPerWeek: 5,
      completionsThisWeek: 0,
      status: 'last_chance', // 0 completions, need 5, only 4 days left
    });
  });

  it('returns summary for daily habit (always on_track_today)', () => {
    const habits = [
      createMockHabit({
        id: 'habit-5',
        name: 'Drink Water',
        cadence: 'daily',
        target_per_period: 1,
      }),
    ];

    const completionHistory = new Map([['habit-5', 3]]);

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      habitId: 'habit-5',
      name: 'Drink Water',
      targetPerWeek: 7, // Daily habit = 7 times per week
      completionsThisWeek: 3,
      status: 'on_track_today', // Daily habits always on_track_today
    });
  });

  it('returns summary for multiple habits', () => {
    const habits = [
      createMockHabit({
        id: 'habit-1',
        name: 'Habit 1',
        cadence: 'weekly',
        target_per_period: 2,
      }),
      createMockHabit({
        id: 'habit-2',
        name: 'Habit 2',
        cadence: 'daily',
        target_per_period: 1,
      }),
    ];

    const completionHistory = new Map([
      ['habit-1', 2],
      ['habit-2', 4],
    ]);

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].status).toBe('week_complete');
    expect(summaries[1].status).toBe('on_track_today');
  });

  it('handles habits without completion data', () => {
    const habits = [
      createMockHabit({
        id: 'habit-1',
        name: 'New Habit',
        cadence: 'weekly',
        target_per_period: 3,
      }),
    ];

    const completionHistory = new Map<string, number>();

    const summaries = getWeeklyHabitSummaries(habits, completionHistory, testDate);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].completionsThisWeek).toBe(0);
  });
});

describe('getCompletedTodayItems', () => {
  // Test date: Wednesday November 26, 2025
  const testDate = new Date('2025-11-26T12:00:00Z');
  const todayIso = '2025-11-26T10:30:00Z';
  const yesterdayIso = '2025-11-25T10:30:00Z';

  it('returns empty array when no items are completed', () => {
    const entities = [
      createMockHabit({ id: 'habit-1', name: 'Exercise' }),
      createMockTodo({ id: 'todo-1', name: 'Buy groceries', due_date: '2025-11-26' }),
    ];

    const result = getCompletedTodayItems(entities, testDate);
    expect(result).toEqual([]);
  });

  it('returns completed todos from today', () => {
    const entities = [
      createMockTodo({
        id: 'todo-1',
        name: 'Buy groceries',
        due_date: '2025-11-26',
        completed_at: todayIso,
      } as any),
    ];

    const result = getCompletedTodayItems(entities, testDate);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'todo-1',
      type: 'todo',
      name: 'Buy groceries',
      completedAt: todayIso,
    });
  });

  it('returns completed habits from today using last_completed_at', () => {
    const entities = [
      createMockHabit({
        id: 'habit-1',
        name: 'Exercise',
        last_completed_at: todayIso,
      }),
    ];

    const result = getCompletedTodayItems(entities, testDate);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'habit-1',
      type: 'habit',
      name: 'Exercise',
      completedAt: todayIso,
    });
  });

  it('excludes items completed yesterday', () => {
    const entities = [
      createMockHabit({
        id: 'habit-1',
        name: 'Exercise',
        last_completed_at: yesterdayIso,
      }),
      createMockTodo({
        id: 'todo-1',
        name: 'Old task',
        completed_at: yesterdayIso,
      } as any),
    ];

    const result = getCompletedTodayItems(entities, testDate);
    expect(result).toEqual([]);
  });

  it('returns both habits and todos completed today', () => {
    const habitCompletedAt = '2025-11-26T08:00:00Z';
    const todoCompletedAt = '2025-11-26T14:30:00Z';

    const entities = [
      createMockHabit({
        id: 'habit-1',
        name: 'Morning Exercise',
        last_completed_at: habitCompletedAt,
      }),
      createMockTodo({
        id: 'todo-1',
        name: 'Team meeting',
        due_date: '2025-11-26',
        completed_at: todoCompletedAt,
      } as any),
    ];

    const result = getCompletedTodayItems(entities, testDate);
    expect(result).toHaveLength(2);

    // Should be sorted by completion time (most recent first)
    expect(result[0].id).toBe('todo-1'); // Completed at 14:30
    expect(result[1].id).toBe('habit-1'); // Completed at 08:00
  });

  it('integrates with getProgressState for combined progress', () => {
    const entities = [
      createMockHabit({
        id: 'habit-1',
        name: 'Exercise',
        cadence: 'daily',
        last_completed_at: todayIso,
      }),
      createMockTodo({
        id: 'todo-1',
        name: 'Buy groceries',
        due_day: '2025-11-26',
        completed_at: todayIso,
      } as any),
    ];

    const completionHistory = new Map<string, number>();

    // Get completed items
    const completedToday = getCompletedTodayItems(entities, testDate);
    expect(completedToday).toHaveLength(2);

    // Get eligible items
    const eligibleItems = getProgressEligibleItems(entities, completionHistory, testDate);
    expect(eligibleItems).toHaveLength(2);

    // Calculate progress
    const completedIds = new Set(completedToday.map((item) => item.id));
    const progressState = getProgressState(eligibleItems, completedIds);

    expect(progressState.completedCount).toBe(2);
    expect(progressState.totalEligibleCount).toBe(2);
    expect(progressState.percent).toBe(100);
  });
});

describe('archived item filtering', () => {
  const testDate = new Date('2025-11-26T12:00:00Z');
  const completionHistory = new Map<string, number>();

  describe('getActiveTodayItems', () => {
    it('excludes archived todos', () => {
      const activeTodo = createMockTodo({
        id: 'todo-active',
        name: 'Active task',
        due_day: '2025-11-26',
        status: 'active',
      } as any);

      const completedTodo = createMockTodo({
        id: 'todo-completed',
        name: 'Completed task',
        due_day: '2025-11-26',
        status: 'completed',
      } as any);

      const archivedTodo = createMockTodo({
        id: 'todo-archived',
        name: 'Archived task',
        due_day: '2025-11-26',
        status: 'archived',
      } as any);

      const items = getActiveTodayItems(
        [activeTodo, completedTodo, archivedTodo],
        completionHistory,
        testDate,
      );

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('todo-active');
    });

    it('excludes archived habits', () => {
      const activeHabit = createMockHabit({
        id: 'habit-active',
        name: 'Active habit',
        cadence: 'daily',
        status: 'active',
      } as any);

      const archivedHabit = createMockHabit({
        id: 'habit-archived',
        name: 'Archived habit',
        cadence: 'daily',
        status: 'archived',
      } as any);

      const items = getActiveTodayItems([activeHabit, archivedHabit], completionHistory, testDate);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('habit-active');
    });
  });

  describe('getFutureItems', () => {
    it('excludes archived habits from future lane', () => {
      const flexibleHabit = createMockHabit({
        id: 'habit-flexible',
        name: 'Flexible habit',
        cadence: 'weekly',
        target_per_period: 3,
        status: 'active',
      } as any);

      const archivedHabit = createMockHabit({
        id: 'habit-archived',
        name: 'Archived habit',
        cadence: 'weekly',
        target_per_period: 3,
        status: 'archived',
      } as any);

      // 1 completion makes them "flexible" (not needed today)
      const history = new Map([
        ['habit-flexible', 1],
        ['habit-archived', 1],
      ]);

      const items = getFutureItems([flexibleHabit, archivedHabit], history, testDate);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('habit-flexible');
    });
  });

  describe('getLockedItems', () => {
    it('excludes archived locked todos', () => {
      const activeTodo = createMockTodo({
        id: 'todo-active',
        name: 'Active locked task',
        due_day: '2025-11-26',
        status: 'active',
      } as any);
      (activeTodo as any).locked = true;

      const archivedTodo = createMockTodo({
        id: 'todo-archived',
        name: 'Archived locked task',
        due_day: '2025-11-26',
        status: 'archived',
      } as any);
      (archivedTodo as any).locked = true;

      const items = getLockedItems([activeTodo, archivedTodo], completionHistory, testDate);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('todo-active');
    });

    it('excludes archived locked habits', () => {
      const activeHabit = createMockHabit({
        id: 'habit-active',
        name: 'Active locked habit',
        cadence: 'daily',
        status: 'active',
      } as any);
      (activeHabit as any).locked = true;

      const archivedHabit = createMockHabit({
        id: 'habit-archived',
        name: 'Archived locked habit',
        cadence: 'daily',
        status: 'archived',
      } as any);
      (archivedHabit as any).locked = true;

      const items = getLockedItems([activeHabit, archivedHabit], completionHistory, testDate);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('habit-active');
    });

    it('excludes completed locked todos', () => {
      const activeTodo = createMockTodo({
        id: 'todo-active',
        name: 'Active locked task',
        due_day: '2025-11-26',
        status: 'active',
      } as any);
      (activeTodo as any).locked = true;

      const completedTodo = createMockTodo({
        id: 'todo-completed',
        name: 'Completed locked task',
        due_day: '2025-11-26',
        status: 'completed',
      } as any);
      (completedTodo as any).locked = true;

      const items = getLockedItems([activeTodo, completedTodo], completionHistory, testDate);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('todo-active');
    });
  });

  describe('combined status filtering', () => {
    it('only returns active items when given active, completed, and archived todos', () => {
      const activeTodo = createMockTodo({
        id: 'todo-active',
        name: 'Active task',
        due_day: '2025-11-26',
        status: 'active',
      } as any);

      const completedTodo = createMockTodo({
        id: 'todo-completed',
        name: 'Completed task',
        due_day: '2025-11-26',
        status: 'completed',
      } as any);

      const archivedTodo = createMockTodo({
        id: 'todo-archived',
        name: 'Archived task',
        due_day: '2025-11-26',
        status: 'archived',
      } as any);

      const entities = [activeTodo, completedTodo, archivedTodo];
      const activeItems = getActiveTodayItems(entities, completionHistory, testDate);

      expect(activeItems).toHaveLength(1);
      expect(activeItems[0].id).toBe('todo-active');
      expect(activeItems[0].name).toBe('Active task');
    });
  });
});

describe('due_day canonical day logic', () => {
  // Test date: Wednesday November 26, 2025 at noon local time
  // The test runs as if the user is in a timezone where "today" is 2025-11-26
  const testDate = new Date(2025, 10, 26, 12, 0, 0); // November 26, 2025 at noon local

  it('todo with due_day = today appears in Today list regardless of due_date timezone', () => {
    // This todo has due_day = today (2025-11-26) but due_date might be
    // something like "2025-11-26T08:00:00.000Z" which could look like
    // yesterday or tomorrow in certain timezones when parsed naively
    const todo = createMockTodo({
      id: 'todo-today',
      name: 'Task due today',
      due_day: '2025-11-26', // Canonical day field
      due_date: '2025-11-26T08:00:00.000Z', // This could be parsed as different days
    });

    const entities = [todo];
    const completionHistory = new Map<string, number>();

    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);

    expect(activeItems).toHaveLength(1);
    expect(activeItems[0].id).toBe('todo-today');
    expect(activeItems[0].name).toBe('Task due today');
  });

  it('overdue todo with due_day = yesterday does NOT appear in Today list (simplified view)', () => {
    // Simplified Now page: only shows items due TODAY - not overdue, not future
    const todo = createMockTodo({
      id: 'todo-yesterday',
      name: 'Task from yesterday',
      due_day: '2025-11-25', // Yesterday
      due_date: '2025-11-25T23:59:59.000Z', // Edge of day in UTC
    });

    const entities = [todo];
    const completionHistory = new Map<string, number>();

    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);

    // Overdue items do NOT appear in active items - simplified view
    expect(activeItems.filter((item) => item.id === 'todo-yesterday')).toHaveLength(0);
  });

  it('todo with due_day = tomorrow does NOT appear in Today list (and is not in Future)', () => {
    const todo = createMockTodo({
      id: 'todo-tomorrow',
      name: 'Task for tomorrow',
      due_day: '2025-11-27', // Tomorrow
      due_date: '2025-11-27T00:00:00.000Z',
    });

    const entities = [todo];
    const completionHistory = new Map<string, number>();

    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);

    expect(activeItems.filter((item) => item.id === 'todo-tomorrow')).toHaveLength(0);

    // Future items only include habits now (simplified view - no future todos shown)
    const futureItems = getFutureItems(entities, completionHistory, testDate);
    expect(futureItems.filter((item) => item.id === 'todo-tomorrow')).toHaveLength(0);
  });

  it('todo with due_day = today is counted in progress eligible items', () => {
    const todo = createMockTodo({
      id: 'todo-today',
      name: 'Task due today',
      due_day: '2025-11-26',
      due_date: '2025-11-26T08:00:00.000Z',
    });

    const entities = [todo];
    const completionHistory = new Map<string, number>();

    const eligibleItems = getProgressEligibleItems(entities, completionHistory, testDate);

    expect(eligibleItems).toHaveLength(1);
    expect(eligibleItems[0].id).toBe('todo-today');
    expect(eligibleItems[0].type).toBe('todo');
  });

  it('overdue todo with due_day = yesterday is NOT counted in progress eligible items (simplified view)', () => {
    const overdueTodo = createMockTodo({
      id: 'todo-overdue',
      name: 'Overdue task',
      due_day: '2025-11-25', // Yesterday
      due_date: '2025-11-25T08:00:00.000Z',
    });

    const entities = [overdueTodo];
    const completionHistory = new Map<string, number>();

    const eligibleItems = getProgressEligibleItems(entities, completionHistory, testDate);

    // Overdue items are NOT counted in progress - simplified view only includes today
    expect(eligibleItems).toHaveLength(0);
  });

  it('does NOT include todo without due_day (requires due_day)', () => {
    // Current behavior: due_day is required for todos to appear in Today
    const todo = createMockTodo({
      id: 'todo-legacy',
      name: 'Legacy task',
      due_date: '2025-11-26', // Only due_date, no due_day
    });

    const entities = [todo];
    const completionHistory = new Map<string, number>();

    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);

    // Todos without due_day are NOT shown in Today
    expect(activeItems).toHaveLength(0);
  });

  it('overdue todos with due_day < today do NOT appear in locked or active items (simplified view)', () => {
    const overdueTodo = {
      ...createMockTodo({
        id: 'todo-overdue',
        name: 'Overdue task',
        due_day: '2025-11-25', // Yesterday
        due_date: '2025-11-25T10:00:00.000Z',
      }),
      locked: true, // Explicitly locked - extended property
    };
    const overdueNotLocked = createMockTodo({
      id: 'todo-overdue-unlocked',
      name: 'Overdue but not locked',
      due_day: '2025-11-25', // Yesterday
      due_date: '2025-11-25T10:00:00.000Z',
      // locked: false/undefined
    });

    const entities = [overdueTodo, overdueNotLocked];
    const completionHistory = new Map<string, number>();

    // Overdue todos do NOT appear in locked items - simplified view
    const lockedItems = getLockedItems(entities, completionHistory, testDate);
    expect(lockedItems.filter((item) => item.id === 'todo-overdue')).toHaveLength(0);
    expect(lockedItems.filter((item) => item.id === 'todo-overdue-unlocked')).toHaveLength(0);

    // Overdue todos do NOT appear in active items - simplified view
    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);
    expect(activeItems.filter((item) => item.id === 'todo-overdue-unlocked')).toHaveLength(0);
    expect(activeItems.filter((item) => item.id === 'todo-overdue')).toHaveLength(0);
  });

  it('todo created with local time 17:00 today uses due_day for Today vs Future classification', () => {
    // Simulate a todo created via overlay at "today 17:00" local time
    // The due_at would be converted to due_date (full ISO) and due_day (YYYY-MM-DD)
    // Even if due_date has timezone offset issues, due_day should be the canonical field
    const todoAt5pm = createMockTodo({
      id: 'todo-5pm',
      name: 'Task at 5pm today',
      due_day: '2025-11-26', // Canonical: today
      due_date: '2025-11-27T01:00:00.000Z', // UTC representation of 5pm PST = next day UTC
    });

    const entities = [todoAt5pm];
    const completionHistory = new Map<string, number>();

    // Should appear in Today (active) items because due_day = today
    const activeItems = getActiveTodayItems(entities, completionHistory, testDate);
    expect(activeItems.filter((item) => item.id === 'todo-5pm')).toHaveLength(1);

    // Should NOT appear in future items
    const futureItems = getFutureItems(entities, completionHistory, testDate);
    expect(futureItems.filter((item) => item.id === 'todo-5pm')).toHaveLength(0);

    // Should be counted in progress eligible items
    const eligibleItems = getProgressEligibleItems(entities, completionHistory, testDate);
    expect(eligibleItems.filter((item) => item.id === 'todo-5pm')).toHaveLength(1);
  });
});
