/**
 * Tests for lib/store/selectors.ts
 * Focus on selectors added/modified in zustand-unification branch
 */

import {
  selectSpaceTimeline,
  filterUnsortedForReview,
  selectSpaceNotes,
  selectAllMilestonesForSpace,
  selectItemById,
  selectNoteBySourceMessageId,
  selectRecentNotes,
  selectRecentTodos,
  selectRecentHabits,
  selectTodosDueToday,
  selectHabitsDueToday,
  selectTodayCompletedItems,
  selectSweepCandidatesUnified,
} from '../selectors';
import type { Todo, Habit, Note, Space } from '../../types';
import type { Milestone } from '../../schemas';
import type { HabitProgressRow } from '../useGremlyStore';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-15';
const YESTERDAY = '2025-12-14';
const TOMORROW = '2025-12-16';

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Todo',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Todo;
}

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

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    body: 'Test note body',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Note;
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: `milestone-${Math.random().toString(36).slice(2)}`,
    space_id: 'space-1',
    owner_id: 'user-1',
    title: 'Test Milestone',
    date: TOMORROW,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Milestone;
}

function makeHabitProgress(habitId: string, occurredDay: string): HabitProgressRow {
  return {
    id: `progress-${Math.random().toString(36).slice(2)}`,
    owner_id: 'user-1',
    habit_id: habitId,
    occurred_at: `${occurredDay}T12:00:00Z`,
    occurred_day: occurredDay,
    count: 1,
    occurrence_index: null,
  };
}

function makeState(
  overrides: Partial<{
    todos: Todo[];
    habits: Habit[];
    notes: Note[];
    spaces: Space[];
    habitProgress: HabitProgressRow[];
    milestones: Milestone[];
  }> = {},
) {
  return {
    todos: [],
    habits: [],
    notes: [],
    spaces: [],
    tags: [],
    habitProgress: [],
    spaceChats: [],
    spaceChatMessages: [],
    milestones: [],
    isLoading: false,
    isInitialized: true,
    lastSyncedAt: new Date(),
    userId: 'user-1',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// filterUnsortedForReview
// ═══════════════════════════════════════════════════════════════════════════════

describe('filterUnsortedForReview', () => {
  it('returns items with ai_placed=true', () => {
    const items = [
      makeTodo({ id: 't1', ai_placed: true }),
      makeTodo({ id: 't2', ai_placed: false }),
      makeNote({ id: 'n1', ai_placed: true }),
    ];

    const result = filterUnsortedForReview(items);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['t1', 'n1']);
  });

  it('returns catchall items without space_id', () => {
    const items = [
      makeTodo({ id: 't1', origin: 'catchall', ai_placed: false, space_id: null }),
      makeTodo({ id: 't2', origin: 'catchall', ai_placed: false, space_id: 'space-1' }),
      makeTodo({ id: 't3', origin: 'manual', ai_placed: false, space_id: null }),
    ];

    const result = filterUnsortedForReview(items);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('returns empty array when no items match', () => {
    const items = [
      makeTodo({ ai_placed: false, origin: 'manual' }),
      makeNote({ ai_placed: false, origin: 'manual' }),
    ];

    const result = filterUnsortedForReview(items);

    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectSpaceNotes
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectSpaceNotes', () => {
  it('returns notes for specified space', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'n1', space_id: 'space-1' }),
        makeNote({ id: 'n2', space_id: 'space-2' }),
        makeNote({ id: 'n3', space_id: 'space-1' }),
      ],
    });

    const result = selectSpaceNotes(state as any, 'space-1');

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
  });

  it('excludes archived notes', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'n1', space_id: 'space-1', archived: false }),
        makeNote({ id: 'n2', space_id: 'space-1', archived: true }),
      ],
    });

    const result = selectSpaceNotes(state as any, 'space-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });

  it('returns empty array for null spaceId', () => {
    const state = makeState({
      notes: [makeNote({ space_id: 'space-1' })],
    });

    const result = selectSpaceNotes(state as any, null);

    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectAllMilestonesForSpace
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectAllMilestonesForSpace', () => {
  it('returns milestones for specified space sorted by date', () => {
    const state = makeState({
      milestones: [
        makeMilestone({ id: 'm1', space_id: 'space-1', date: '2025-12-20' }),
        makeMilestone({ id: 'm2', space_id: 'space-2', date: '2025-12-15' }),
        makeMilestone({ id: 'm3', space_id: 'space-1', date: '2025-12-10' }),
      ],
    });

    const result = selectAllMilestonesForSpace(state as any, 'space-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('m3'); // Earlier date first
    expect(result[1].id).toBe('m1');
  });

  it('returns empty array when no milestones for space', () => {
    const state = makeState({
      milestones: [makeMilestone({ space_id: 'space-2' })],
    });

    const result = selectAllMilestonesForSpace(state as any, 'space-1');

    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectItemById
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectItemById', () => {
  it('finds todo by id', () => {
    const todo = makeTodo({ id: 'todo-123' });
    const state = makeState({ todos: [todo] });

    const result = selectItemById(state as any, 'todo-123');

    expect(result).toEqual(todo);
  });

  it('finds habit by id', () => {
    const habit = makeHabit({ id: 'habit-123' });
    const state = makeState({ habits: [habit] });

    const result = selectItemById(state as any, 'habit-123');

    expect(result).toEqual(habit);
  });

  it('finds note by id', () => {
    const note = makeNote({ id: 'note-123' });
    const state = makeState({ notes: [note] });

    const result = selectItemById(state as any, 'note-123');

    expect(result).toEqual(note);
  });

  it('returns null when id not found', () => {
    const state = makeState({
      todos: [makeTodo({ id: 'other-id' })],
    });

    const result = selectItemById(state as any, 'missing-id');

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectNoteBySourceMessageId
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectNoteBySourceMessageId', () => {
  it('finds note by source_message_id', () => {
    const note = makeNote({ id: 'n1' });
    (note as any).source_message_id = 'msg-123';
    const state = makeState({ notes: [note] });

    const result = selectNoteBySourceMessageId(state as any, 'msg-123');

    expect(result?.id).toBe('n1');
  });

  it('returns null when not found', () => {
    const state = makeState({
      notes: [makeNote({ id: 'n1' })],
    });

    const result = selectNoteBySourceMessageId(state as any, 'missing-msg');

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectRecentNotes/Todos/Habits
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectRecentNotes', () => {
  it('returns non-archived notes sorted by created_at desc', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'n1', created_at: '2025-12-10T00:00:00Z' }),
        makeNote({ id: 'n2', created_at: '2025-12-15T00:00:00Z' }),
        makeNote({ id: 'n3', created_at: '2025-12-12T00:00:00Z', archived: true }),
      ],
    });

    const result = selectRecentNotes(state as any, 10);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('n2'); // Most recent first
    expect(result[1].id).toBe('n1');
  });

  it('respects limit parameter', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'n1', created_at: '2025-12-10T00:00:00Z' }),
        makeNote({ id: 'n2', created_at: '2025-12-15T00:00:00Z' }),
        makeNote({ id: 'n3', created_at: '2025-12-12T00:00:00Z' }),
      ],
    });

    const result = selectRecentNotes(state as any, 2);

    expect(result).toHaveLength(2);
  });
});

describe('selectRecentTodos', () => {
  it('returns non-archived todos sorted by created_at desc', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', created_at: '2025-12-10T00:00:00Z' }),
        makeTodo({ id: 't2', created_at: '2025-12-15T00:00:00Z' }),
        makeTodo({ id: 't3', created_at: '2025-12-12T00:00:00Z', archived: true }),
      ],
    });

    const result = selectRecentTodos(state as any, 10);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('t2');
  });
});

describe('selectRecentHabits', () => {
  it('returns non-archived habits sorted by created_at desc', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'h1', created_at: '2025-12-10T00:00:00Z' }),
        makeHabit({ id: 'h2', created_at: '2025-12-15T00:00:00Z' }),
        makeHabit({ id: 'h3', created_at: '2025-12-12T00:00:00Z', archived: true }),
      ],
    });

    const result = selectRecentHabits(state as any, 10);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('h2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectSpaceTimeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectSpaceTimeline', () => {
  it('returns empty array for null spaceId', () => {
    const state = makeState({
      habits: [makeHabit({ space_id: 'space-1' })],
    });

    const result = selectSpaceTimeline(state as any, null);

    expect(result).toHaveLength(0);
  });

  it('returns 7 days of timeline data', () => {
    const state = makeState({
      habits: [makeHabit({ space_id: 'space-1' })],
    });

    const result = selectSpaceTimeline(state as any, 'space-1');

    expect(result).toHaveLength(7);
    result.forEach((day) => {
      expect(day).toHaveProperty('dateISO');
      expect(day).toHaveProperty('items');
      expect(Array.isArray(day.items)).toBe(true);
    });
  });

  it('marks habits as done based on habitProgress', () => {
    const habit = makeHabit({ id: 'habit-1', space_id: 'space-1' });
    // Get today's ISO date
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const state = makeState({
      habits: [habit],
      habitProgress: [makeHabitProgress('habit-1', todayISO)],
    });

    const result = selectSpaceTimeline(state as any, 'space-1');

    const todayTimeline = result.find((d) => d.dateISO === todayISO);
    expect(todayTimeline).toBeDefined();

    const habitItem = todayTimeline?.items.find((i) => i.id === 'habit-1');
    expect(habitItem?.done).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectTodosDueToday / selectHabitsDueToday
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectTodosDueToday', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns todos due today (via due_day field)', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-15' }),
        makeTodo({ id: 't2', due_day: '2025-12-16' }),
        makeTodo({ id: 't3', due_day: '2025-12-15' }),
      ],
    });

    const result = selectTodosDueToday(state as any);

    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectTodayCompletedItems
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectTodayCompletedItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns todos completed today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', completed_at: '2025-12-15T10:00:00Z' }),
        makeTodo({ id: 't2', completed_at: '2025-12-14T10:00:00Z' }),
        makeTodo({ id: 't3', completed_at: null }),
      ],
    });

    const result = selectTodayCompletedItems(state as any);

    expect(result.filter((i) => i.type === 'todo').map((i) => i.id)).toEqual(['t1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectSweepCandidatesUnified
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectSweepCandidatesUnified', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns overdue todos as sweep candidates', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-10' }), // Overdue
        makeTodo({ id: 't2', due_day: '2025-12-20' }), // Future
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);

    const todoIds = result.filter((c) => c.kind === 'todo').map((c) => c.id);
    expect(todoIds).toContain('t1');
    expect(todoIds).not.toContain('t2');
  });

  it('returns undated todos as sweep candidates', () => {
    const oldDate = new Date('2025-12-01T00:00:00Z').toISOString();
    const state = makeState({
      todos: [makeTodo({ id: 't1', created_at: oldDate, due_date: null, due_day: null })],
    });

    const result = selectSweepCandidatesUnified(state as any);

    expect(result.some((c) => c.id === 't1')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectCompletionsInRolling7Days
// ═══════════════════════════════════════════════════════════════════════════════

import {
  selectCompletionsInRolling7Days,
  selectCompletionsInRolling30Days,
  selectWeeklyHabitSummaries,
  selectCompletionsThisWeek,
} from '../selectors';

describe('selectCompletionsInRolling7Days', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty map when no progress', () => {
    const state = makeState({ habitProgress: [] });

    const result = selectCompletionsInRolling7Days(state as any);

    expect(result.size).toBe(0);
  });

  it('counts unique days within 7-day window', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('habit-1', '2025-12-15'), // Today
        makeHabitProgress('habit-1', '2025-12-14'), // Yesterday
        makeHabitProgress('habit-1', '2025-12-10'), // 5 days ago
        makeHabitProgress('habit-1', '2025-12-08'), // 7 days ago (out of 7-day window)
      ],
    });

    const result = selectCompletionsInRolling7Days(state as any);

    expect(result.get('habit-1')).toBe(3); // Only 3 days in window
  });

  it('handles multiple habits', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('habit-1', '2025-12-15'),
        makeHabitProgress('habit-1', '2025-12-14'),
        makeHabitProgress('habit-2', '2025-12-15'),
      ],
    });

    const result = selectCompletionsInRolling7Days(state as any);

    expect(result.get('habit-1')).toBe(2);
    expect(result.get('habit-2')).toBe(1);
  });

  it('excludes progress older than 7 days', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('habit-1', '2025-12-01'), // Way too old
        makeHabitProgress('habit-1', '2025-12-08'), // 7 days ago (out of window)
      ],
    });

    const result = selectCompletionsInRolling7Days(state as any);

    expect(result.get('habit-1')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectCompletionsInRolling30Days
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectCompletionsInRolling30Days', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts completions within 30-day window', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('habit-1', '2025-12-15'), // Today
        makeHabitProgress('habit-1', '2025-12-01'), // 14 days ago
        makeHabitProgress('habit-1', '2025-11-20'), // 25 days ago
        makeHabitProgress('habit-1', '2025-11-14'), // 31 days ago (out of window)
      ],
    });

    const result = selectCompletionsInRolling30Days(state as any);

    expect(result.get('habit-1')).toBe(3); // Only 3 days in window
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectWeeklyHabitSummaries
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectWeeklyHabitSummaries', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Set to Wednesday (day 3 of week)
    jest.setSystemTime(new Date('2025-12-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty array when no habits', () => {
    const state = makeState({ habits: [], habitProgress: [] });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result).toHaveLength(0);
  });

  it('calculates targetPerWeek=7 for daily habits', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'daily' })],
      habitProgress: [],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].targetPerWeek).toBe(7);
  });

  it('calculates targetPerWeek from target_per_period for weekly habits', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'weekly', target_per_period: 3 })],
      habitProgress: [],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].targetPerWeek).toBe(3);
  });

  it('counts completions this calendar week', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'weekly', target_per_period: 3 })],
      habitProgress: [
        // Week starts on Sunday (Dec 14 is Sunday for 2025-12-17)
        makeHabitProgress('h1', '2025-12-14'), // Sunday (week start)
        makeHabitProgress('h1', '2025-12-15'), // Monday
        makeHabitProgress('h1', '2025-12-10'), // Last week (should not count)
      ],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].completionsThisWeek).toBe(2);
  });

  it('excludes archived habits', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', archived: false }), makeHabit({ id: 'h2', archived: true })],
      habitProgress: [],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].habitId).toBe('h1');
  });

  it('returns week_complete status when target met', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'weekly', target_per_period: 2 })],
      habitProgress: [makeHabitProgress('h1', '2025-12-14'), makeHabitProgress('h1', '2025-12-15')],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].status).toBe('week_complete');
  });

  it('returns last_chance status when behind with limited days left', () => {
    // Wednesday Dec 17: days remaining = 7 - 3 = 4 (Wed, Thu, Fri, Sat)
    // For daily habit needing 7/week with 0 completions, remaining = 7 > 4 days remaining
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'daily' })],
      habitProgress: [], // No completions yet this week
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].status).toBe('last_chance');
  });

  it('returns flexible status when well ahead of schedule', () => {
    // Wednesday Dec 17: days remaining = 4
    // Daily habit needs 7/week, with 5 completions, remaining = 2
    // remaining (2) < daysRemaining - 1 (3) → flexible
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'daily' })],
      habitProgress: [
        makeHabitProgress('h1', '2025-12-14'), // Sun
        makeHabitProgress('h1', '2025-12-15'), // Mon
        makeHabitProgress('h1', '2025-12-16'), // Tue
        makeHabitProgress('h1', '2025-12-17'), // Wed (today)
        makeHabitProgress('h1', '2025-12-15'), // Extra Mon completion (duplicate day)
      ],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    // 5 completions, need 7, remaining = 2, days left = 4
    // 2 < 4 - 1 = 3, so flexible
    expect(result[0].status).toBe('flexible');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectCompletionsThisWeek
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectCompletionsThisWeek', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Wednesday Dec 17, 2025 - week starts Sunday Dec 14
    jest.setSystemTime(new Date('2025-12-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty map when no progress', () => {
    const state = makeState({ habitProgress: [] });

    const result = selectCompletionsThisWeek(state as any);

    expect(result.size).toBe(0);
  });

  it('counts completions from current calendar week only', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('h1', '2025-12-14'), // Sunday (week start)
        makeHabitProgress('h1', '2025-12-15'), // Monday
        makeHabitProgress('h1', '2025-12-17'), // Wednesday (today)
        makeHabitProgress('h1', '2025-12-13'), // Saturday (last week)
        makeHabitProgress('h1', '2025-12-10'), // Last week
      ],
    });

    const result = selectCompletionsThisWeek(state as any);

    expect(result.get('h1')).toBe(3);
  });

  it('sums counts from multiple progress records on same day', () => {
    const progress1 = makeHabitProgress('h1', '2025-12-15');
    const progress2 = makeHabitProgress('h1', '2025-12-15');
    progress2.count = 2; // Did it twice that day

    const state = makeState({
      habitProgress: [progress1, progress2],
    });

    const result = selectCompletionsThisWeek(state as any);

    expect(result.get('h1')).toBe(3); // 1 + 2
  });
});
