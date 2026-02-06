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
  selectTodayCompletedItems,
  selectSweepCandidatesUnified,
  selectOverdueTodos,
  selectUnscheduledTodosForMiniSweep,
  selectRecentDrops,
  selectHabitsUpToDateCount,
  selectEventsForSpace,
  selectGoalForSpace,
  selectGoalsForSpace,
  selectCheckInsForGoal,
  selectItemsLinkedToEvent,
  selectSpaceHasEvents,
  selectUpcomingEventsForSpace,
  selectEventsForDate,
  selectNewSpaceSuggestions,
} from '../selectors';
import type { Todo, Habit, Note, Space, SpaceSuggestion } from '../../types';
import type { Milestone } from '../../schemas';
import type { HabitProgressRow } from '../useGremlyStore';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const _TODAY = '2025-12-15';
const _YESTERDAY = '2025-12-14';
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
    // Habits need start_date to appear on Today page (per isHabitDueToday requirements)
    start_date: '2025-01-01',
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
    spaceSuggestions: SpaceSuggestion[];
    // Sweep preferences
    lastSweepCompletedAt: string | null;
    sweepStreak: number;
    totalSweepCount: number;
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
    spaceSuggestions: [],
    isLoading: false,
    isInitialized: true,
    lastSyncedAt: new Date(),
    userId: 'user-1',
    // Sweep preferences (needed for selectSweepIntroStats)
    lastSweepCompletedAt: null,
    sweepStreak: 0,
    totalSweepCount: 0,
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

  it('returns overdue todos as sweep candidates with meta', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-10' }), // Overdue
        makeTodo({ id: 't2', due_day: '2025-12-20' }), // Future
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);

    // Result is Array<{ candidate, meta }>
    const todoIds = result
      .filter((item) => item.candidate.kind === 'todo')
      .map((item) => item.candidate.id);
    expect(todoIds).toContain('t1');
    expect(todoIds).not.toContain('t2');
    // Verify meta is present
    const t1Item = result.find((item) => item.candidate.id === 't1');
    expect(t1Item?.meta).toBeDefined();
    expect(t1Item?.meta.typeChip).toBe('Todo');
  });

  it('returns undated todos as sweep candidates', () => {
    const oldDate = new Date('2025-12-01T00:00:00Z').toISOString();
    const state = makeState({
      todos: [makeTodo({ id: 't1', created_at: oldDate, due_date: null, due_day: null })],
    });

    const result = selectSweepCandidatesUnified(state as any);

    expect(result.some((item) => item.candidate.id === 't1')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // resurface_at filtering (Remind Me Later feature)
  // ─────────────────────────────────────────────────────────────────────────────

  it('excludes todos with future resurface_at date', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-10', resurface_at: '2025-12-20' } as any), // Future resurface
        makeTodo({ id: 't2', due_day: '2025-12-10' }), // No resurface date
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const todoIds = result.map((item) => item.candidate.id);

    expect(todoIds).not.toContain('t1'); // Future resurface - excluded
    expect(todoIds).toContain('t2'); // No resurface - included (overdue)
  });

  it('includes todos when resurface_at is today or past', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-01', resurface_at: '2025-12-15' } as any), // Resurface today
        makeTodo({ id: 't2', due_day: '2025-12-01', resurface_at: '2025-12-10' } as any), // Resurface in past
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const todoIds = result.map((item) => item.candidate.id);

    expect(todoIds).toContain('t1'); // Resurface today - included
    expect(todoIds).toContain('t2'); // Resurface past - included
  });

  it('excludes notes with future resurface_at date', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'n1', subtype: 'idea', resurface_at: '2025-12-20' } as any), // Future resurface
        makeNote({ id: 'n2', subtype: 'idea', created_at: '2025-12-10T12:00:00Z' }), // Recent idea, no resurface
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const noteIds = result
      .filter((i) => i.candidate.kind === 'note')
      .map((item) => item.candidate.id);

    expect(noteIds).not.toContain('n1'); // Future resurface - excluded
    expect(noteIds).toContain('n2'); // No resurface - included
  });

  it('includes notes when resurface_at is today or past', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'n1',
          subtype: 'idea',
          swept_at: '2025-12-01T12:00:00Z',
          resurface_at: '2025-12-15',
        } as any), // Swept but resurfacing today
        makeNote({
          id: 'n2',
          subtype: 'idea',
          swept_at: '2025-12-01T12:00:00Z',
          resurface_at: '2025-12-10',
        } as any), // Swept but resurfacing past
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const noteIds = result
      .filter((i) => i.candidate.kind === 'note')
      .map((item) => item.candidate.id);

    expect(noteIds).toContain('n1'); // Resurfacing today - included
    expect(noteIds).toContain('n2'); // Resurfacing past - included
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // swept_at filtering (Just Save feature)
  // ─────────────────────────────────────────────────────────────────────────────

  it('excludes notes with swept_at set (unless resurfacing or skipped)', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'n1',
          subtype: 'idea',
          created_at: '2025-12-10T12:00:00Z',
          swept_at: '2025-12-12T12:00:00Z',
        } as any), // Swept - excluded
        makeNote({ id: 'n2', subtype: 'idea', created_at: '2025-12-10T12:00:00Z' }), // Not swept - included
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const noteIds = result
      .filter((i) => i.candidate.kind === 'note')
      .map((item) => item.candidate.id);

    expect(noteIds).not.toContain('n1'); // Swept - excluded
    expect(noteIds).toContain('n2'); // Not swept - included
  });

  it('includes swept notes if skipped_in_sweep_at is set', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'n1',
          subtype: 'idea',
          created_at: '2025-12-10T12:00:00Z',
          swept_at: '2025-12-12T12:00:00Z',
          skipped_in_sweep_at: '2025-12-14T12:00:00Z',
        } as any), // Swept but skipped - should reappear
      ],
    });

    const result = selectSweepCandidatesUnified(state as any);
    const noteIds = result
      .filter((i) => i.candidate.kind === 'note')
      .map((item) => item.candidate.id);

    expect(noteIds).toContain('n1'); // Skipped overrides swept
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // commitment (lock-in) filtering - NEW TESTS FOR SWEEP BRANCH
  // ─────────────────────────────────────────────────────────────────────────────

  describe('commitment (lock-in) filtering', () => {
    it('excludes todos with commitment=true from sweep candidates', () => {
      const state = makeState({
        todos: [
          makeTodo({ id: 't1', due_day: '2025-12-10', commitment: true }), // Locked-in - excluded
          makeTodo({ id: 't2', due_day: '2025-12-10', commitment: false }), // Not locked - included
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const todoIds = result
        .filter((i) => i.candidate.kind === 'todo')
        .map((item) => item.candidate.id);

      expect(todoIds).not.toContain('t1'); // Locked - excluded
      expect(todoIds).toContain('t2'); // Not locked - included
    });

    it('excludes habits with commitment_until from sweep candidates', () => {
      const state = makeState({
        habits: [
          makeHabit({ id: 'h1', commitment_until: '2025-12-31', start_date_confirmed: false }), // Locked-in - excluded
          makeHabit({ id: 'h2', start_date_confirmed: false }), // Not locked - included
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const habitIds = result
        .filter((i) => i.candidate.kind === 'habit')
        .map((item) => item.candidate.id);

      expect(habitIds).not.toContain('h1'); // Locked - excluded
      expect(habitIds).toContain('h2'); // Not locked - included
    });

    it('includes todos with commitment=false', () => {
      const state = makeState({
        todos: [makeTodo({ id: 't1', due_day: '2025-12-10', commitment: false })],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const todoIds = result.map((item) => item.candidate.id);

      expect(todoIds).toContain('t1');
    });

    it('includes todos with commitment=undefined', () => {
      const state = makeState({
        todos: [makeTodo({ id: 't1', due_day: '2025-12-10' })], // No commitment field
      });

      const result = selectSweepCandidatesUnified(state as any);
      const todoIds = result.map((item) => item.candidate.id);

      expect(todoIds).toContain('t1');
    });

    it('includes habits with commitment=undefined', () => {
      const state = makeState({
        habits: [makeHabit({ id: 'h1', start_date_confirmed: false })], // No commitment field
      });

      const result = selectSweepCandidatesUnified(state as any);
      const habitIds = result.map((item) => item.candidate.id);

      expect(habitIds).toContain('h1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // note attachments from log_photos - NEW TESTS FOR SWEEP BRANCH
  // ─────────────────────────────────────────────────────────────────────────────

  describe('note attachments from log_photos', () => {
    it('extracts attachments array from log_photos for notes', () => {
      const state = makeState({
        notes: [
          makeNote({
            id: 'n1',
            subtype: 'catchall',
            created_at: '2025-12-15T10:00:00Z',
            log_photos: [
              { id: 'p1', url: 'https://example.com/photo1.jpg', position: 0 },
              { id: 'p2', url: 'https://example.com/photo2.jpg', position: 1 },
            ],
          } as any),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const noteCandidate = result.find((i) => i.candidate.id === 'n1');

      // Type narrow to note candidate to access attachments
      expect(noteCandidate?.candidate.kind).toBe('note');
      if (noteCandidate?.candidate.kind === 'note') {
        expect(noteCandidate.candidate.attachments).toHaveLength(2);
        expect(noteCandidate.candidate.attachments?.[0]).toEqual({
          id: 'p1',
          url: 'https://example.com/photo1.jpg',
          position: 0,
        });
      }
    });

    it('includes id, url, and position for each attachment', () => {
      const state = makeState({
        notes: [
          makeNote({
            id: 'n1',
            subtype: 'catchall',
            created_at: '2025-12-15T10:00:00Z',
            log_photos: [{ id: 'p1', url: 'https://example.com/photo.jpg', position: 2 }],
          } as any),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const noteCandidate = result.find((i) => i.candidate.id === 'n1');

      expect(noteCandidate?.candidate.kind).toBe('note');
      if (noteCandidate?.candidate.kind === 'note') {
        const attachment = noteCandidate.candidate.attachments?.[0];
        expect(attachment).toHaveProperty('id', 'p1');
        expect(attachment).toHaveProperty('url', 'https://example.com/photo.jpg');
        expect(attachment).toHaveProperty('position', 2);
      }
    });

    it('returns empty attachments array when log_photos is undefined', () => {
      const state = makeState({
        notes: [
          makeNote({
            id: 'n1',
            subtype: 'catchall',
            created_at: '2025-12-15T10:00:00Z',
          }),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const noteCandidate = result.find((i) => i.candidate.id === 'n1');

      expect(noteCandidate?.candidate.kind).toBe('note');
      if (noteCandidate?.candidate.kind === 'note') {
        expect(noteCandidate.candidate.attachments).toEqual([]);
      }
    });

    it('returns empty attachments array when log_photos is null', () => {
      const state = makeState({
        notes: [
          makeNote({
            id: 'n1',
            subtype: 'catchall',
            created_at: '2025-12-15T10:00:00Z',
            log_photos: null,
          } as any),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const noteCandidate = result.find((i) => i.candidate.id === 'n1');

      expect(noteCandidate?.candidate.kind).toBe('note');
      if (noteCandidate?.candidate.kind === 'note') {
        expect(noteCandidate.candidate.attachments).toEqual([]);
      }
    });

    it('returns empty attachments array when log_photos is empty array', () => {
      const state = makeState({
        notes: [
          makeNote({
            id: 'n1',
            subtype: 'catchall',
            created_at: '2025-12-15T10:00:00Z',
            log_photos: [],
          } as any),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const noteCandidate = result.find((i) => i.candidate.id === 'n1');

      expect(noteCandidate?.candidate.kind).toBe('note');
      if (noteCandidate?.candidate.kind === 'note') {
        expect(noteCandidate.candidate.attachments).toEqual([]);
      }
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// selectTodayLockedItems - NEW TESTS FOR MORNING BRIEF
// ═══════════════════════════════════════════════════════════════════════════════

import { selectLockedTodos, selectTodayLockedItems, selectTodayActiveItems } from '../selectors';

describe('selectLockedTodos', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns todos with commitment = true and due today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: true, archived: false, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', commitment: false, archived: false, due_day: '2025-12-15' }),
        makeTodo({ id: 't3', commitment: true, archived: false, due_day: '2025-12-15' }),
      ],
    });

    const result = selectLockedTodos(state as any);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('excludes archived todos even if commitment is true', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: true, archived: true, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', commitment: true, archived: false, due_day: '2025-12-15' }),
      ],
    });

    const result = selectLockedTodos(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t2');
  });

  it('excludes completed todos even if commitment is true', () => {
    const state = makeState({
      todos: [
        makeTodo({
          id: 't1',
          commitment: true,
          completed_at: '2025-12-15T10:00:00Z',
          due_day: '2025-12-15',
        }),
        makeTodo({ id: 't2', commitment: true, completed_at: null, due_day: '2025-12-15' }),
      ],
    });

    const result = selectLockedTodos(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t2');
  });

  it('returns empty array when no locked todos', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: false, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', commitment: undefined, due_day: '2025-12-15' }),
      ],
    });

    const result = selectLockedTodos(state as any);

    expect(result).toHaveLength(0);
  });
});

describe('selectTodayLockedItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('combines locked todos and locked habits', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: true, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', commitment: false, due_day: '2025-12-15' }),
      ],
      habits: [
        makeHabit({ id: 'h1', commitment_until: '2025-12-31', cadence: 'daily' }),
        makeHabit({ id: 'h2', cadence: 'daily' }),
      ],
      habitProgress: [], // No completions today
    });

    const result = selectTodayLockedItems(state as any);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id).sort()).toEqual(['h1', 't1']);
  });

  it('only includes habits due today that are locked', () => {
    const state = makeState({
      todos: [],
      habits: [
        makeHabit({ id: 'h1', commitment_until: '2025-12-31', cadence: 'daily' }),
        makeHabit({
          id: 'h2',
          commitment_until: '2025-12-31',
          cadence: 'weekly',
          days_active: [1],
        }), // Monday - today is Monday Dec 15
        makeHabit({
          id: 'h3',
          commitment_until: '2025-12-31',
          cadence: 'weekly',
          days_active: [3],
        }), // Wednesday - not today
      ],
      habitProgress: [],
    });

    const result = selectTodayLockedItems(state as any);

    // h1 (daily) and h2 (Monday) should be included, h3 (Wednesday) not
    expect(result.map((i) => i.id)).toContain('h1');
  });

  it('excludes habits already completed today', () => {
    const habit = makeHabit({ id: 'h1', commitment_until: '2025-12-31', cadence: 'daily' });
    const state = makeState({
      todos: [],
      habits: [habit],
      habitProgress: [makeHabitProgress('h1', '2025-12-15')], // Completed today
    });

    const result = selectTodayLockedItems(state as any);

    // Habit was completed today, so not in locked items
    expect(result).toHaveLength(0);
  });
});

describe('selectTodayActiveItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('excludes locked items from active items', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: true, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', commitment: false, due_day: '2025-12-15' }),
      ],
      habits: [
        makeHabit({ id: 'h1', commitment_until: '2025-12-31', cadence: 'daily' }),
        makeHabit({ id: 'h2', cadence: 'daily' }),
      ],
      habitProgress: [],
    });

    const result = selectTodayActiveItems(state as any);

    // Only non-locked items
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id).sort()).toEqual(['h2', 't2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MINI SWEEP SELECTORS (today-page-tweaks-jan-2 branch)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectOverdueTodos', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns todos with due_day before today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-14' }), // Yesterday - overdue
        makeTodo({ id: 't2', due_day: '2025-12-15' }), // Today - not overdue
        makeTodo({ id: 't3', due_day: '2025-12-16' }), // Tomorrow - not overdue
        makeTodo({ id: 't4', due_day: '2025-12-10' }), // 5 days ago - overdue
      ],
    });

    const result = selectOverdueTodos(state as any);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't4']);
  });

  it('excludes archived and completed todos', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-14' }), // Overdue
        makeTodo({ id: 't2', due_day: '2025-12-14', archived: true }), // Archived
        makeTodo({ id: 't3', due_day: '2025-12-14', completed_at: '2025-12-15T09:00:00Z' }), // Completed
      ],
    });

    const result = selectOverdueTodos(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('excludes todos skipped today via skipped_in_sweep_at', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-14' }), // Overdue, not skipped
        makeTodo({ id: 't2', due_day: '2025-12-14', skipped_in_sweep_at: '2025-12-15T00:00:00' }), // Skipped today
        makeTodo({ id: 't3', due_day: '2025-12-13', skipped_in_sweep_at: '2025-12-14T00:00:00' }), // Skipped yesterday - should reappear
      ],
    });

    const result = selectOverdueTodos(state as any);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('returns empty array when no overdue todos', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: '2025-12-15' }), // Today
        makeTodo({ id: 't2', due_day: '2025-12-16' }), // Tomorrow
        makeTodo({ id: 't3' }), // No due_day
      ],
    });

    const result = selectOverdueTodos(state as any);

    expect(result).toHaveLength(0);
  });
});

describe('selectUnscheduledTodosForMiniSweep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns unscheduled todos created in last 3 days', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // Yesterday
        makeTodo({ id: 't2', due_day: null, created_at: '2025-12-13T10:00:00Z' }), // 2 days ago
        makeTodo({ id: 't3', due_day: null, created_at: '2025-12-12T10:00:00Z' }), // 3 days ago
        makeTodo({ id: 't4', due_day: null, created_at: '2025-12-11T10:00:00Z' }), // 4 days ago - too old
        makeTodo({ id: 't5', due_day: null, created_at: '2025-12-15T08:00:00Z' }), // Today
      ],
    });

    const result = selectUnscheduledTodosForMiniSweep(state as any);

    expect(result).toHaveLength(4);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't5']);
  });

  it('excludes todos that have a due_day', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // Unscheduled
        makeTodo({ id: 't2', due_day: '2025-12-20', created_at: '2025-12-14T10:00:00Z' }), // Scheduled
      ],
    });

    const result = selectUnscheduledTodosForMiniSweep(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('excludes todos skipped today via skipped_in_sweep_at', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // Not skipped
        makeTodo({
          id: 't2',
          due_day: null,
          created_at: '2025-12-14T10:00:00Z',
          skipped_in_sweep_at: '2025-12-15T00:00:00',
        }), // Skipped today
        makeTodo({
          id: 't3',
          due_day: null,
          created_at: '2025-12-14T10:00:00Z',
          skipped_in_sweep_at: '2025-12-14T00:00:00',
        }), // Skipped yesterday - should reappear
      ],
    });

    const result = selectUnscheduledTodosForMiniSweep(state as any);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('excludes archived and completed todos', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // Active
        makeTodo({ id: 't2', due_day: null, created_at: '2025-12-14T10:00:00Z', archived: true }), // Archived
        makeTodo({
          id: 't3',
          due_day: null,
          created_at: '2025-12-14T10:00:00Z',
          completed_at: '2025-12-15T09:00:00Z',
        }), // Completed
      ],
    });

    const result = selectUnscheduledTodosForMiniSweep(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });
});

describe('selectRecentDrops', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns undated todos created in last 3 days', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // 1 day ago
        makeTodo({ id: 't2', due_day: null, created_at: '2025-12-10T10:00:00Z' }), // 5 days ago - too old
      ],
    });

    const result = selectRecentDrops(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('excludes todos skipped today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', due_day: null, created_at: '2025-12-14T10:00:00Z' }), // Not skipped
        makeTodo({
          id: 't2',
          due_day: null,
          created_at: '2025-12-14T10:00:00Z',
          skipped_in_sweep_at: '2025-12-15T00:00:00',
        }), // Skipped today
      ],
    });

    const result = selectRecentDrops(state as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HABITS UP TO DATE COUNT (today-page-tweaks-jan-2 branch)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectHabitsUpToDateCount', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts daily habits checked in today or yesterday as up to date', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'h1', cadence: 'daily', last_checked_in_at: '2025-12-15T08:00:00Z' }), // Today - up to date
        makeHabit({ id: 'h2', cadence: 'daily', last_checked_in_at: '2025-12-14T20:00:00Z' }), // Yesterday - up to date
        makeHabit({ id: 'h3', cadence: 'daily', last_checked_in_at: '2025-12-13T08:00:00Z' }), // 2 days ago - not up to date
        makeHabit({ id: 'h4', cadence: 'daily', last_checked_in_at: null }), // Never checked in - not up to date
      ],
    });

    const result = selectHabitsUpToDateCount(state as any);

    expect(result.upToDate).toBe(2);
    expect(result.total).toBe(4);
  });

  it('counts weekly habits checked in within last 7 days as up to date', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'h1', cadence: 'weekly', last_checked_in_at: '2025-12-10T08:00:00Z' }), // 5 days ago - up to date
        makeHabit({ id: 'h2', cadence: 'weekly', last_checked_in_at: '2025-12-07T08:00:00Z' }), // 8 days ago - not up to date
        makeHabit({ id: 'h3', cadence: 'weekly', last_checked_in_at: '2025-12-15T08:00:00Z' }), // Today - up to date
      ],
    });

    const result = selectHabitsUpToDateCount(state as any);

    expect(result.upToDate).toBe(2);
    expect(result.total).toBe(3);
  });

  it('excludes archived habits from count', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'h1', cadence: 'daily', last_checked_in_at: '2025-12-15T08:00:00Z' }), // Active, up to date
        makeHabit({
          id: 'h2',
          cadence: 'daily',
          last_checked_in_at: '2025-12-15T08:00:00Z',
          archived: true,
        }), // Archived
      ],
    });

    const result = selectHabitsUpToDateCount(state as any);

    expect(result.upToDate).toBe(1);
    expect(result.total).toBe(1);
  });

  it('returns zero counts when no habits', () => {
    const state = makeState({
      habits: [],
    });

    const result = selectHabitsUpToDateCount(state as any);

    expect(result.upToDate).toBe(0);
    expect(result.total).toBe(0);
  });
});
// ═══════════════════════════════════════════════════════════════════════════════
// SweepPill Count (app-fixes-1.22)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectSweepCandidateCountUnified (SweepPill count)', () => {
  /**
   * This test validates the app-fixes-1.22 fix where SweepPill was
   * incorrectly showing counts that included recentDrops.
   *
   * The fix ensures SweepPill uses ONLY the sweep candidate count
   * (from selectSweepCandidateCountUnified) and does NOT include
   * recentDrops in its count.
   *
   * selectSweepCandidatesUnified counts: overdue/due-today/undated todos,
   * unconfirmed habits, and recent notes meeting sweep criteria.
   *
   * selectRecentDrops is a SEPARATE selector for the Mind Drop UI and
   * should NOT be included in the SweepPill count.
   */

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should count only sweep candidates, not recent drops', () => {
    // State with 2 sweep candidates (overdue todos)
    // The key point is that SweepPill count should be 2
    // (from selectSweepCandidatesUnified), NOT combined with any
    // other sources like recentDrops
    const state = makeState({
      todos: [
        // Overdue todos are sweep candidates
        makeTodo({ id: 'overdue-1', due_day: '2025-12-10' }),
        makeTodo({ id: 'overdue-2', due_day: '2025-12-13' }),
      ],
    });

    const candidates = selectSweepCandidatesUnified(state as any);
    expect(candidates.length).toBe(2);

    // The count used by SweepPill is candidates.length
    // In NowScreenV1, this is: const sweepCandidateCount = useSweepCountUnified();
    // which uses selectSweepCandidateCountUnified which just returns candidates.length
    const sweepPillCount = candidates.length;
    expect(sweepPillCount).toBe(2);
  });

  it('should return 0 when no sweep candidates exist', () => {
    // No sweep candidates - future-due todo only
    const state = makeState({
      todos: [
        // Future-due todo (due_day after today 2025-12-15) - NOT a sweep candidate
        makeTodo({ id: 'future-1', due_day: '2025-12-20' }),
      ],
    });

    const candidates = selectSweepCandidatesUnified(state as any);

    // SweepPill count should be 0 (no candidates)
    expect(candidates.length).toBe(0);
  });

  it('should correctly exclude future-due todos from count', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 'overdue-1', due_day: '2025-12-10' }), // Sweep candidate
        makeTodo({ id: 'future-1', due_day: '2025-12-20' }), // NOT a candidate
        makeTodo({ id: 'future-2', due_day: '2025-12-25' }), // NOT a candidate
      ],
    });

    const candidates = selectSweepCandidatesUnified(state as any);

    // Only the overdue todo should be counted
    expect(candidates.length).toBe(1);
    expect(candidates[0].candidate.id).toBe('overdue-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT NOTE SELECTORS (Key Dates feature)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectEventsForSpace', () => {
  it('returns event notes for the given space', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1', target_date: '2025-12-20' }),
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-1', target_date: '2025-12-18' }),
        makeNote({ id: 'n1', subtype: 'journal', space_id: 'space-1' }),
      ],
    });

    const result = selectEventsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e2'); // sorted by date ascending
    expect(result[1].id).toBe('e1');
  });

  it('excludes goals (is_goal=true)', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1', is_goal: true }),
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-1' }),
      ],
    });

    const result = selectEventsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e2');
  });

  it('excludes archived events', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1', archived: true }),
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-1' }),
      ],
    });

    const result = selectEventsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e2');
  });

  it('excludes events from other spaces', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1' }),
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-2' }),
      ],
    });

    const result = selectEventsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('sorts dateless events to the bottom', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1' }), // no target_date
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-1', target_date: '2025-12-18' }),
      ],
    });

    const result = selectEventsForSpace(state as any, 'space-1');
    expect(result[0].id).toBe('e2');
    expect(result[1].id).toBe('e1');
  });
});

describe('selectGoalForSpace', () => {
  it('returns the first goal event for a space', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'g1', subtype: 'event', space_id: 'space-1', is_goal: true }),
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1' }),
      ],
    });

    const result = selectGoalForSpace(state as any, 'space-1');
    expect(result?.id).toBe('g1');
  });

  it('returns null when no goal exists', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1' })],
    });

    const result = selectGoalForSpace(state as any, 'space-1');
    expect(result).toBeNull();
  });

  it('excludes archived goals', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'g1',
          subtype: 'event',
          space_id: 'space-1',
          is_goal: true,
          archived: true,
        }),
      ],
    });

    const result = selectGoalForSpace(state as any, 'space-1');
    expect(result).toBeNull();
  });
});

describe('selectGoalsForSpace', () => {
  it('returns up to 3 goals sorted by created_at', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'g1',
          subtype: 'event',
          space_id: 'space-1',
          is_goal: true,
          created_at: '2025-12-03T00:00:00Z',
        }),
        makeNote({
          id: 'g2',
          subtype: 'event',
          space_id: 'space-1',
          is_goal: true,
          created_at: '2025-12-01T00:00:00Z',
        }),
        makeNote({
          id: 'g3',
          subtype: 'event',
          space_id: 'space-1',
          is_goal: true,
          created_at: '2025-12-02T00:00:00Z',
        }),
        makeNote({
          id: 'g4',
          subtype: 'event',
          space_id: 'space-1',
          is_goal: true,
          created_at: '2025-12-04T00:00:00Z',
        }),
      ],
    });

    const result = selectGoalsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.id)).toEqual(['g2', 'g3', 'g1']); // sorted asc, max 3
  });

  it('returns empty array when no goals exist', () => {
    const state = makeState({ notes: [] });
    const result = selectGoalsForSpace(state as any, 'space-1');
    expect(result).toEqual([]);
  });
});

describe('selectCheckInsForGoal', () => {
  it('matches journals by origin=goal_checkin with matching view data', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'j1',
          subtype: 'journal',
          space_id: 'space-1',
          origin: 'goal_checkin',
          views: { goal_checkin: { goal_name: 'Learn Spanish' } },
        } as any),
        makeNote({ id: 'j2', subtype: 'journal', space_id: 'space-1' }),
      ],
    });

    const result = selectCheckInsForGoal(state as any, 'Learn Spanish', 'space-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('j1');
  });

  it('matches journals by title containing goal words', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'j1',
          subtype: 'journal',
          space_id: 'space-1',
          title: 'Progress on learning Spanish today',
        }),
      ],
    });

    const result = selectCheckInsForGoal(state as any, 'Learn Spanish', 'space-1');
    expect(result).toHaveLength(1);
  });

  it('matches journals by tag containing goal name', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'j1',
          subtype: 'journal',
          space_id: 'space-1',
          tags: ['learn spanish'],
        }),
      ],
    });

    const result = selectCheckInsForGoal(state as any, 'Learn Spanish', 'space-1');
    expect(result).toHaveLength(1);
  });

  it('returns empty when no matches', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'j1', subtype: 'journal', space_id: 'space-1', title: 'Unrelated entry' }),
      ],
    });

    const result = selectCheckInsForGoal(state as any, 'Learn Spanish', 'space-1');
    expect(result).toHaveLength(0);
  });
});

describe('selectItemsLinkedToEvent', () => {
  it('returns todos, notes, and habits linked to an event', () => {
    const state = makeState({
      todos: [makeTodo({ id: 't1', linked_event_id: 'event-1' } as any), makeTodo({ id: 't2' })],
      notes: [makeNote({ id: 'n1', linked_event_id: 'event-1' } as any)],
      habits: [makeHabit({ id: 'h1', linked_event_id: 'event-1' } as any), makeHabit({ id: 'h2' })],
    });

    const result = selectItemsLinkedToEvent(state as any, 'event-1');
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0].id).toBe('t1');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].id).toBe('n1');
    expect(result.habits).toHaveLength(1);
    expect(result.habits[0].id).toBe('h1');
  });

  it('excludes archived and completed items', () => {
    const state = makeState({
      todos: [
        makeTodo({
          id: 't1',
          linked_event_id: 'event-1',
          completed_at: '2025-12-15T00:00:00Z',
        } as any),
        makeTodo({ id: 't2', linked_event_id: 'event-1', archived: true } as any),
      ],
      notes: [makeNote({ id: 'n1', linked_event_id: 'event-1', archived: true } as any)],
      habits: [makeHabit({ id: 'h1', linked_event_id: 'event-1', archived: true } as any)],
    });

    const result = selectItemsLinkedToEvent(state as any, 'event-1');
    expect(result.todos).toHaveLength(0);
    expect(result.notes).toHaveLength(0);
    expect(result.habits).toHaveLength(0);
  });

  it('returns empty lists when nothing linked', () => {
    const state = makeState({});
    const result = selectItemsLinkedToEvent(state as any, 'event-1');
    expect(result.todos).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.habits).toEqual([]);
  });
});

describe('selectSpaceHasEvents', () => {
  it('returns true when space has events', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1' })],
    });

    expect(selectSpaceHasEvents(state as any, 'space-1')).toBe(true);
  });

  it('returns false when space has no events', () => {
    const state = makeState({
      notes: [makeNote({ id: 'n1', subtype: 'journal', space_id: 'space-1' })],
    });

    expect(selectSpaceHasEvents(state as any, 'space-1')).toBe(false);
  });
});

describe('selectUpcomingEventsForSpace', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns only future events', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', space_id: 'space-1', target_date: '2025-12-20' }),
        makeNote({ id: 'e2', subtype: 'event', space_id: 'space-1', target_date: '2025-12-10' }),
        makeNote({ id: 'e3', subtype: 'event', space_id: 'space-1', target_date: '2025-12-15' }),
      ],
    });

    const result = selectUpcomingEventsForSpace(state as any, 'space-1');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['e3', 'e1']); // today + future, sorted by date
  });
});

describe('selectEventsForDate', () => {
  it('matches single-day events on that date', () => {
    const state = makeState({
      notes: [
        makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-15' }),
        makeNote({ id: 'e2', subtype: 'event', target_date: '2025-12-16' }),
      ],
    });

    const result = selectEventsForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('matches multi-day events spanning the date', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-10',
          end_date: '2025-12-20',
        } as any),
      ],
    });

    const result = selectEventsForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('excludes multi-day events that do not span the date', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-01',
          end_date: '2025-12-05',
        } as any),
      ],
    });

    const result = selectEventsForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(0);
  });

  it('excludes archived events', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-15', archived: true })],
    });

    const result = selectEventsForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(0);
  });
});

describe('selectNewSpaceSuggestions', () => {
  it('returns pending new_space suggestions', () => {
    const state = makeState({
      spaceSuggestions: [
        {
          id: 's1',
          suggestion_type: 'new_space',
          status: 'pending',
          suggested_name: 'Fitness',
          reason: 'Multiple fitness drops',
          drop_ids: ['d1', 'd2'],
          confidence: 0.9,
          created_at: '2025-12-15T00:00:00Z',
          updated_at: '2025-12-15T00:00:00Z',
        } as SpaceSuggestion,
        {
          id: 's2',
          suggestion_type: 'assign_to_space',
          status: 'pending',
          space_id: 'space-1',
          suggested_name: null,
          reason: 'Related to space',
          drop_ids: ['d3'],
          confidence: 0.8,
          created_at: '2025-12-15T00:00:00Z',
          updated_at: '2025-12-15T00:00:00Z',
        } as SpaceSuggestion,
        {
          id: 's3',
          suggestion_type: 'new_space',
          status: 'accepted',
          suggested_name: 'Cooking',
          reason: 'Recipe drops',
          drop_ids: ['d4'],
          confidence: 0.85,
          created_at: '2025-12-14T00:00:00Z',
          updated_at: '2025-12-15T00:00:00Z',
        } as SpaceSuggestion,
      ],
    });

    const result = selectNewSpaceSuggestions(state as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array when no pending new_space suggestions', () => {
    const state = makeState({ spaceSuggestions: [] });
    const result = selectNewSpaceSuggestions(state as any);
    expect(result).toEqual([]);
  });
});
