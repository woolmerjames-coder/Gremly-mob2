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
