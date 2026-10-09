/**
 * Tests for lib/store/selectors.ts
 * Focus on selectors added/modified in zustand-unification branch
 */

import {
  filterUnsortedForReview,
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
  selectUndatedTodos,
  selectHabitsUpToDateCount,
  selectItemsLinkedToEvent,
  selectEventsForDate,
  selectDco,
  selectBriefHeadline,
  selectDcoTone,
  selectTodayFocus,
  selectNamedAnchors,
  selectDcoLoading,
  selectLifeMoment,
} from '../selectors';
import type { Todo, Habit, Note, DailyContextObject } from '../../types';
import type { HabitAdaptationRow, HabitProgressRow } from '../useGremlyStore';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const _TODAY = '2025-12-15';
const _YESTERDAY = '2025-12-14';

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

/** A pause (or, with mode 'floor', a lighter version) of a habit from one day to another */
function makeAdaptation(
  habitId: string,
  periodStart: string,
  periodEnd: string,
  mode: HabitAdaptationRow['mode'] = 'pause',
): HabitAdaptationRow {
  return {
    id: `adaptation-${Math.random().toString(36).slice(2)}`,
    owner_id: 'user-1',
    habit_id: habitId,
    mode,
    period_start: periodStart,
    period_end: periodEnd,
    created_at: `${periodStart}T12:00:00Z`,
    updated_at: `${periodStart}T12:00:00Z`,
  };
}

function makeState(
  overrides: Partial<{
    todos: Todo[];
    habits: Habit[];
    notes: Note[];
    habitProgress: HabitProgressRow[];
    habitAdaptations: HabitAdaptationRow[];
    // Their weekly day (0 Sunday to 6 Saturday): their week ends on it
    weeklyDay: number;
    // Sweep preferences
    lastSweepCompletedAt: string | null;
    sweepStreak: number;
    totalSweepCount: number;
    // Morning Brief fields
    briefSelectedIds: string[];
    briefLockedIds: string[];
    briefSelectionDate: string | null;
    briefCompletedToday: string | null;
    eventTimeOverrides: Record<string, unknown>;
    hiddenCalendarEventsByDate: Record<string, string[]>;
  }> = {},
) {
  return {
    todos: [],
    habits: [],
    notes: [],
    tags: [],
    habitProgress: [],
    habitAdaptations: [],
    weeklyDay: 0,
    spaceChatMessages: [],
    hiddenTodayIds: [],
    isLoading: false,
    isInitialized: true,
    lastSyncedAt: new Date(),
    userId: 'user-1',
    // Sweep preferences (needed for selectSweepIntroStats)
    lastSweepCompletedAt: null,
    sweepStreak: 0,
    totalSweepCount: 0,
    // Morning Brief fields
    briefSelectedIds: [],
    briefLockedIds: [],
    briefSelectionDate: null,
    briefCompletedToday: null,
    eventTimeOverrides: {},
    hiddenCalendarEventsByDate: {},
    ...overrides,
  };
}

/**
 * The same store after any update: every update hands the selectors a new
 * state object, and a memoised selector is not run again for the very same one.
 */
const afterUpdate = <S extends object>(state: S): S => ({ ...state });

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

  it('returns catchall items, in a Space or not', () => {
    const items = [
      makeTodo({ id: 't1', origin: 'catchall', ai_placed: false, space_id: null }),
      makeTodo({ id: 't2', origin: 'catchall', ai_placed: false, space_id: 'space-1' }),
      makeTodo({ id: 't3', origin: 'manual', ai_placed: false, space_id: null }),
    ];

    const result = filterUnsortedForReview(items);

    expect(result.map((i) => i.id)).toEqual(['t1', 't2']);
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

  it('includes a todo put off whose day to come back is today, and only on that day', () => {
    const later = (id: string, o: Record<string, unknown>) =>
      makeTodo({ id, due_day: null, ...o } as Partial<Todo>);
    const state = makeState({
      todos: [
        later('back-today', { resurface_at: '2025-12-15' }),
        later('back-tomorrow', { resurface_at: '2025-12-16' }),
        // its back day has gone by: it waits in the wrap up's cards, not on Today
        later('back-yesterday', { resurface_at: '2025-12-14' }),
        later('no-day', {}),
        // given a day of its own since: that day decides
        makeTodo({ id: 'moved-on', due_day: '2025-12-17', resurface_at: '2025-12-15' } as any),
        later('done', { resurface_at: '2025-12-15', completed_at: '2025-12-15T09:00:00Z' }),
        later('archived', { resurface_at: '2025-12-15', archived: true }),
      ],
    });

    expect(selectTodosDueToday(state as any).map((t) => t.id)).toEqual(['back-today']);
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
  // The old Lock In flag (commitment) no longer keeps anything out of Sweep
  // ─────────────────────────────────────────────────────────────────────────────

  describe('the old Lock In flag', () => {
    it('does not keep a todo out of sweep candidates', () => {
      const state = makeState({
        todos: [
          makeTodo({ id: 't1', due_day: '2025-12-10', commitment: true }), // an old flag, left on
          makeTodo({ id: 't2', due_day: '2025-12-10', commitment: false }),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const todoIds = result
        .filter((i) => i.candidate.kind === 'todo')
        .map((item) => item.candidate.id);

      expect(todoIds.sort()).toEqual(['t1', 't2']);
    });

    it('never includes habits in sweep candidates', () => {
      const state = makeState({
        habits: [
          makeHabit({ id: 'h1', start_date: null as any, start_date_confirmed: false }),
          makeHabit({ id: 'h2', start_date: null as any, start_date_confirmed: false }),
        ],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const habitIds = result
        .filter((i) => i.candidate.kind === 'habit')
        .map((item) => item.candidate.id);

      expect(habitIds).toHaveLength(0);
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

    it('excludes habits even without commitment or start_date', () => {
      const state = makeState({
        habits: [makeHabit({ id: 'h1', start_date: null as any, start_date_confirmed: false })],
      });

      const result = selectSweepCandidatesUnified(state as any);
      const habitIds = result.filter((i) => i.candidate.kind === 'habit');

      expect(habitIds).toHaveLength(0);
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

  it('counts completions in their week', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'weekly', target_per_period: 3 })],
      habitProgress: [
        // A Sunday person's week is Monday to Sunday (Dec 15 to Dec 21 for 2025-12-17)
        makeHabitProgress('h1', '2025-12-15'), // Monday (week start)
        makeHabitProgress('h1', '2025-12-16'), // Tuesday
        makeHabitProgress('h1', '2025-12-14'), // Sunday before (should not count)
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
      habitProgress: [makeHabitProgress('h1', '2025-12-15'), makeHabitProgress('h1', '2025-12-16')],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].status).toBe('week_complete');
  });

  it('returns last_chance status when behind with limited days left', () => {
    // Wednesday Dec 17: days remaining = 5 (Wed, Thu, Fri, Sat, Sun)
    // For daily habit needing 7/week with 0 completions, remaining = 7 > 5 days remaining
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'daily' })],
      habitProgress: [], // No completions yet this week
    });

    const result = selectWeeklyHabitSummaries(state as any);

    expect(result[0].status).toBe('last_chance');
  });

  it('returns flexible status when well ahead of schedule', () => {
    // Wednesday Dec 17: days remaining = 5
    // Daily habit needs 7/week, with 5 completions, remaining = 2
    // remaining (2) < daysRemaining - 1 (4) → flexible
    const state = makeState({
      habits: [makeHabit({ id: 'h1', cadence: 'daily' })],
      habitProgress: [
        makeHabitProgress('h1', '2025-12-15'), // Mon
        makeHabitProgress('h1', '2025-12-16'), // Tue
        makeHabitProgress('h1', '2025-12-17'), // Wed (today)
        makeHabitProgress('h1', '2025-12-15'), // Extra Mon completion (duplicate day)
        makeHabitProgress('h1', '2025-12-16'), // Extra Tue completion (duplicate day)
      ],
    });

    const result = selectWeeklyHabitSummaries(state as any);

    // 5 completions, need 7, remaining = 2, days left = 5
    // 2 < 5 - 1 = 4, so flexible
    expect(result[0].status).toBe('flexible');
  });

  it('counts the days left in their own week', () => {
    // Wednesday Dec 17 is the last day of a Wednesday person's week (Thu Dec 11 to Wed Dec 17)
    const habits = [makeHabit({ id: 'h1', cadence: 'weekly', target_per_period: 3 })];
    const habitProgress = [
      makeHabitProgress('h1', '2025-12-11'), // Thursday
      makeHabitProgress('h1', '2025-12-15'), // Monday
    ];

    const wednesday = selectWeeklyHabitSummaries(
      makeState({ habits, habitProgress, weeklyDay: 3 }) as any,
    );
    // 2 of 3 done with one day left: today is the last chance
    expect(wednesday[0].completionsThisWeek).toBe(2);
    expect(wednesday[0].status).toBe('last_chance');

    const sunday = selectWeeklyHabitSummaries(
      makeState({ habits, habitProgress, weeklyDay: 0 }) as any,
    );
    // 1 of 3 done since Monday with five days left
    expect(sunday[0].completionsThisWeek).toBe(1);
    expect(sunday[0].status).toBe('flexible');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectCompletionsThisWeek
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectCompletionsThisWeek', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Wednesday Dec 17, 2025: a Sunday person's week is Monday Dec 15 to Sunday Dec 21
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

  it('counts completions from their current week only', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('h1', '2025-12-15'), // Monday (week start)
        makeHabitProgress('h1', '2025-12-16'), // Tuesday
        makeHabitProgress('h1', '2025-12-17'), // Wednesday (today)
        makeHabitProgress('h1', '2025-12-14'), // Sunday (last week)
        makeHabitProgress('h1', '2025-12-10'), // Last week
      ],
    });

    const result = selectCompletionsThisWeek(state as any);

    expect(result.get('h1')).toBe(3);
  });

  it('a Sunday person counts Monday to Sunday', () => {
    const state = makeState({
      habitProgress: [
        makeHabitProgress('h1', '2025-12-14'), // the Sunday before
        makeHabitProgress('h1', '2025-12-15'), // Monday
      ],
    });

    // On Monday the log from the Sunday before is last week's
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
    expect(selectCompletionsThisWeek(state as any).get('h1')).toBe(1);

    // On the Sunday that ends the week, Monday's log still counts
    jest.setSystemTime(new Date('2025-12-21T12:00:00Z'));
    expect(selectCompletionsThisWeek(afterUpdate(state) as any).get('h1')).toBe(1);

    // The next Monday starts a new week, with no habit logged or removed since
    jest.setSystemTime(new Date('2025-12-22T12:00:00Z'));
    expect(selectCompletionsThisWeek(afterUpdate(state) as any).get('h1')).toBeUndefined();
  });

  it('a Wednesday person counts Thursday to Wednesday', () => {
    const state = makeState({
      weeklyDay: 3,
      habitProgress: [
        makeHabitProgress('h1', '2025-12-10'), // the Wednesday before
        makeHabitProgress('h1', '2025-12-11'), // Thursday (week start)
        makeHabitProgress('h1', '2025-12-17'), // Wednesday (today, the last day)
      ],
    });

    expect(selectCompletionsThisWeek(state as any).get('h1')).toBe(2);

    // Thursday starts their next week
    jest.setSystemTime(new Date('2025-12-18T12:00:00Z'));
    expect(selectCompletionsThisWeek(afterUpdate(state) as any).get('h1')).toBeUndefined();
  });

  it('counts again when their weekly day changes', () => {
    const state = makeState({
      habitProgress: [makeHabitProgress('h1', '2025-12-11'), makeHabitProgress('h1', '2025-12-15')],
    });

    expect(selectCompletionsThisWeek(state as any).get('h1')).toBe(1);
    expect(selectCompletionsThisWeek({ ...state, weeklyDay: 3 } as any).get('h1')).toBe(2);
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
// selectHabitsDueToday: their week, and a pause
// ═══════════════════════════════════════════════════════════════════════════════

import { selectHabitsCompletedToday } from '../selectors';

describe('selectHabitsDueToday in their week', () => {
  const dueIds = (state: ReturnType<typeof makeState>) =>
    selectHabitsDueToday(state as any).map((h) => h.id);

  beforeEach(() => {
    jest.useFakeTimers();
    // Sunday Dec 21, 2025: the last day of a Sunday person's week
    jest.setSystemTime(new Date('2025-12-21T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a flexible weekly habit met earlier in their week is not due on its last day', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'met', cadence: 'weekly', target_per_period: 2 }),
        makeHabit({ id: 'open', cadence: 'weekly', target_per_period: 2 }),
      ],
      habitProgress: [
        makeHabitProgress('met', '2025-12-15'), // Monday
        makeHabitProgress('met', '2025-12-16'), // Tuesday
        makeHabitProgress('open', '2025-12-14'), // the Sunday before, last week's
        makeHabitProgress('open', '2025-12-15'), // Monday
      ],
    });

    expect(dueIds(state)).toEqual(['open']);

    // Monday starts a new week and both are open again
    jest.setSystemTime(new Date('2025-12-22T12:00:00Z'));
    expect(dueIds(afterUpdate(state))).toEqual(['met', 'open']);
  });

  it('a Wednesday person is done for the week on Wednesday and starts again on Thursday', () => {
    jest.setSystemTime(new Date('2025-12-17T12:00:00Z'));
    const state = makeState({
      weeklyDay: 3,
      habits: [makeHabit({ id: 'gym', cadence: 'weekly', target_per_period: 2 })],
      habitProgress: [
        makeHabitProgress('gym', '2025-12-11'), // Thursday (week start)
        makeHabitProgress('gym', '2025-12-15'), // Monday
      ],
    });

    expect(dueIds(state)).toEqual([]);
    // the same logs leave it open for a Sunday person, whose week began on Monday
    expect(dueIds({ ...state, weeklyDay: 0 })).toEqual(['gym']);

    jest.setSystemTime(new Date('2025-12-18T12:00:00Z'));
    expect(dueIds(afterUpdate(state))).toEqual(['gym']);
  });
});

describe('selectHabitsDueToday with a pause', () => {
  const dueIds = (state: ReturnType<typeof makeState>) =>
    selectHabitsDueToday(state as any).map((h) => h.id);

  beforeEach(() => {
    jest.useFakeTimers();
    // Wednesday Dec 17, 2025
    jest.setSystemTime(new Date('2025-12-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a paused habit is not due today and is due again the day after the pause ends', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'run', cadence: 'daily' }),
        makeHabit({ id: 'read', cadence: 'daily' }),
      ],
      habitAdaptations: [makeAdaptation('run', '2025-12-16', '2025-12-18')],
    });

    expect(dueIds(state)).toEqual(['read']);

    // the last day of the pause
    jest.setSystemTime(new Date('2025-12-18T12:00:00Z'));
    expect(dueIds(afterUpdate(state))).toEqual(['read']);

    // the day after it ends
    jest.setSystemTime(new Date('2025-12-19T12:00:00Z'));
    expect(dueIds(afterUpdate(state))).toEqual(['run', 'read']);
  });

  it('a paused habit is off the list whatever its cadence', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'wednesdays', cadence: 'weekly', days_active: [3] }),
        makeHabit({ id: 'flexible', cadence: 'weekly', target_per_period: 3 }),
        makeHabit({ id: 'monthly', cadence: 'monthly', target_per_period: 2 }),
      ],
    });
    expect(dueIds(state)).toEqual(['wednesdays', 'flexible', 'monthly']);

    const paused = {
      ...state,
      habitAdaptations: state.habits.map((h) => makeAdaptation(h.id, '2025-12-17', '2025-12-17')),
    };
    expect(dueIds(paused)).toEqual([]);
  });

  it('a lighter version leaves a habit on the list', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'run', cadence: 'daily' })],
      habitAdaptations: [makeAdaptation('run', '2025-12-16', '2025-12-18', 'floor')],
    });

    expect(dueIds(state)).toEqual(['run']);
  });

  it('a paused habit logged anyway still counts', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'run', cadence: 'weekly', target_per_period: 3 })],
      habitProgress: [makeHabitProgress('run', '2025-12-17')],
      habitAdaptations: [makeAdaptation('run', '2025-12-16', '2025-12-18')],
    });

    expect(selectCompletionsThisWeek(state as any).get('run')).toBe(1);
    expect(selectHabitsCompletedToday(state as any).map((h) => h.id)).toEqual(['run']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectTodayActiveItems: what is on Today
// ═══════════════════════════════════════════════════════════════════════════════

import { selectTodayActiveItems, selectTodayProgress } from '../selectors';

describe('selectTodayActiveItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds everything due today, with no separate locked list', () => {
    const state = makeState({
      todos: [
        // old Lock In flags left on a todo and a habit make no difference
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

    expect(result.map((i) => i.id).sort()).toEqual(['h1', 'h2', 't1', 't2']);
  });

  it('counts each item once in the day progress', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 't1', commitment: true, due_day: '2025-12-15' }),
        makeTodo({ id: 't2', due_day: '2025-12-15', completed_at: '2025-12-15T09:00:00Z' }),
      ],
      habits: [],
      habitProgress: [],
    });

    expect(selectTodayProgress(state as any)).toMatchObject({
      completedCount: 1,
      totalEligible: 2,
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// DCO SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

function makeDco(overrides: Partial<DailyContextObject> = {}): DailyContextObject {
  return {
    user_id: 'user-1',
    date: '2025-12-15',
    generated_at: '2025-12-15T06:00:00Z',
    ttl_days: 1,
    life_moment: 'hosting family',
    life_moment_confidence: 'high',
    tone: 'focused',
    brief_headline: 'Busy week with Sarah visiting',
    named_anchors: [{ label: 'Sarah', type: 'person', source: 'drop' }],
    active_today: {
      overdue_todos: 2,
      habit_streak_risk: ['Meditate'],
      upcoming_in_7d: [{ date: '2025-12-20', title: 'Dentist' }],
    },
    deltas: {
      drop_velocity: 'normal',
      habit_health: 'high',
      mood_signal: 'positive',
      notable_change: null,
    },
    today_focus: ['Finish report', 'Call dentist'],
    weekly_digest: 'Productive week overall',
    input_sources: ['drops', 'habits', 'calendar'],
    model_used: 'gpt-4.1-mini',
    ...overrides,
  };
}

describe('selectDco', () => {
  it('returns full DCO when present', () => {
    const dco = makeDco();
    const state = makeState({ dco } as any);
    expect(selectDco(state as any)).toEqual(dco);
  });

  it('returns null when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectDco(state as any)).toBeNull();
  });
});

describe('selectBriefHeadline', () => {
  it('returns brief_headline from DCO', () => {
    const state = makeState({ dco: makeDco({ brief_headline: 'Big day ahead' }) } as any);
    expect(selectBriefHeadline(state as any)).toBe('Big day ahead');
  });

  it('returns null when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectBriefHeadline(state as any)).toBeNull();
  });

  it('returns null when headline is null', () => {
    const state = makeState({ dco: makeDco({ brief_headline: null }) } as any);
    expect(selectBriefHeadline(state as any)).toBeNull();
  });
});

describe('selectDcoTone', () => {
  it('returns tone from DCO', () => {
    const state = makeState({ dco: makeDco({ tone: 'stretched' }) } as any);
    expect(selectDcoTone(state as any)).toBe('stretched');
  });

  it('returns null when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectDcoTone(state as any)).toBeNull();
  });
});

describe('selectTodayFocus', () => {
  it('returns focus priorities', () => {
    const state = makeState({
      dco: makeDco({ today_focus: ['Write report', 'Exercise'] }),
    } as any);
    expect(selectTodayFocus(state as any)).toEqual(['Write report', 'Exercise']);
  });

  it('returns null when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectTodayFocus(state as any)).toBeNull();
  });

  it('returns null when today_focus is null', () => {
    const state = makeState({ dco: makeDco({ today_focus: null }) } as any);
    expect(selectTodayFocus(state as any)).toBeNull();
  });
});

describe('selectNamedAnchors', () => {
  it('returns named anchors from DCO', () => {
    const anchors = [
      { label: 'Sarah', type: 'person' as const, source: 'drop' as const },
      { label: 'Trip to Paris', type: 'trip' as const, source: 'space' as const },
    ];
    const state = makeState({ dco: makeDco({ named_anchors: anchors }) } as any);
    expect(selectNamedAnchors(state as any)).toEqual(anchors);
  });

  it('returns empty array when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectNamedAnchors(state as any)).toEqual([]);
  });
});

describe('selectDcoLoading', () => {
  it('returns true when loading', () => {
    const state = makeState({ dcoLoading: true } as any);
    expect(selectDcoLoading(state as any)).toBe(true);
  });

  it('returns false when not loading', () => {
    const state = makeState({ dcoLoading: false } as any);
    expect(selectDcoLoading(state as any)).toBe(false);
  });
});

describe('selectLifeMoment', () => {
  it('returns life_moment from DCO', () => {
    const state = makeState({ dco: makeDco({ life_moment: 'job transition' }) } as any);
    expect(selectLifeMoment(state as any)).toBe('job transition');
  });

  it('returns null when no DCO', () => {
    const state = makeState({ dco: null } as any);
    expect(selectLifeMoment(state as any)).toBeNull();
  });

  it('returns null when life_moment is null', () => {
    const state = makeState({ dco: makeDco({ life_moment: null }) } as any);
    expect(selectLifeMoment(state as any)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectEventNotesForDate — multi-day event support
// ═══════════════════════════════════════════════════════════════════════════════

import {
  selectEventNotesForDate,
  selectEventNotesForRange,
  selectUpcomingEventNotes,
} from '../selectors';

describe('selectEventNotesForDate', () => {
  it('returns single-day event matching exact date', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-15' })],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('excludes single-day event on different date', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-15' })],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-16');
    expect(result).toHaveLength(0);
  });

  it('includes multi-day event on intermediate date', () => {
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
    const result = selectEventNotesForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('includes multi-day event on start date', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-10',
          end_date: '2025-12-15',
        } as any),
      ],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-10');
    expect(result).toHaveLength(1);
  });

  it('includes multi-day event on end date', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-10',
          end_date: '2025-12-15',
        } as any),
      ],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(1);
  });

  it('excludes multi-day event after end date', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-10',
          end_date: '2025-12-14',
        } as any),
      ],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-15');
    expect(result).toHaveLength(0);
  });

  it('sorts all-day events before timed events', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-15',
          event_time: '10:00',
        } as any),
        makeNote({
          id: 'e2',
          subtype: 'event',
          target_date: '2025-12-15',
          event_time: null,
        } as any),
      ],
    });
    const result = selectEventNotesForDate(state as any, '2025-12-15');
    expect(result[0].id).toBe('e2'); // all-day first
    expect(result[1].id).toBe('e1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectEventNotesForRange — multi-day event support
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectEventNotesForRange', () => {
  it('includes events starting within the range', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-15' })],
    });
    const result = selectEventNotesForRange(state as any, '2025-12-10', '2025-12-20');
    expect(result).toHaveLength(1);
  });

  it('excludes events outside the range', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-25' })],
    });
    const result = selectEventNotesForRange(state as any, '2025-12-10', '2025-12-20');
    expect(result).toHaveLength(0);
  });

  it('includes multi-day event that started before range but extends into it', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-05',
          end_date: '2025-12-12',
        } as any),
      ],
    });
    const result = selectEventNotesForRange(state as any, '2025-12-10', '2025-12-20');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('excludes multi-day event that ended before range start', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-01',
          end_date: '2025-12-09',
        } as any),
      ],
    });
    const result = selectEventNotesForRange(state as any, '2025-12-10', '2025-12-20');
    expect(result).toHaveLength(0);
  });

  it('excludes events with null target_date', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: null } as any)],
    });
    const result = selectEventNotesForRange(state as any, '2025-12-10', '2025-12-20');
    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectUpcomingEventNotes — multi-day event support
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectUpcomingEventNotes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('includes events starting within the next N days', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-18' })],
    });
    const result = selectUpcomingEventNotes(state as any, 7);
    expect(result).toHaveLength(1);
  });

  it('excludes events beyond the window', () => {
    const state = makeState({
      notes: [makeNote({ id: 'e1', subtype: 'event', target_date: '2025-12-30' })],
    });
    const result = selectUpcomingEventNotes(state as any, 7);
    expect(result).toHaveLength(0);
  });

  it('includes multi-day event that started before today but extends into range', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-10',
          end_date: '2025-12-18',
        } as any),
      ],
    });
    const result = selectUpcomingEventNotes(state as any, 7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('excludes multi-day event that ended before today', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-01',
          end_date: '2025-12-10',
        } as any),
      ],
    });
    const result = selectUpcomingEventNotes(state as any, 7);
    expect(result).toHaveLength(0);
  });

  it('sorts by date then by time (all-day first)', () => {
    const state = makeState({
      notes: [
        makeNote({
          id: 'e1',
          subtype: 'event',
          target_date: '2025-12-17',
          event_time: '14:00',
        } as any),
        makeNote({
          id: 'e2',
          subtype: 'event',
          target_date: '2025-12-16',
          event_time: null,
        } as any),
        makeNote({
          id: 'e3',
          subtype: 'event',
          target_date: '2025-12-16',
          event_time: '09:00',
        } as any),
      ],
    });
    const result = selectUpcomingEventNotes(state as any, 7);
    expect(result.map((e) => e.id)).toEqual(['e2', 'e3', 'e1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Held drops ("is this one you already have?", lib/minddrop/dropRelation.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectSweepCandidatesUnified: held drops', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const relation = (status: string) => ({
    kind: 'same',
    intent: 'same',
    entity: { id: 't9', type: 'todo', title: 'Walk Pepper' },
    others: [],
    confidence: 90,
    extra: null,
    status,
    classified: {
      bucket: 'log',
      subtype: 'journal',
      habitSubtype: null,
      needsClarification: false,
      ambiguityType: null,
      clarificationQuestion: null,
      clarificationOptions: null,
    },
  });

  it('asks about a held drop whatever its kind or day, like a split', () => {
    const old = '2025-12-10T09:00:00Z';
    const state = makeState({
      notes: [
        makeNote({
          id: 'held',
          subtype: 'journal',
          created_at: old,
          views: { relation: relation('pending') },
        } as any),
        makeNote({ id: 'plain-journal', subtype: 'journal', created_at: old } as any),
        makeNote({
          id: 'answered',
          subtype: 'catchall',
          created_at: old,
          views: { relation: relation('kept') },
        } as any),
      ],
    });
    const ids = selectSweepCandidatesUnified(state as any).map((i) => i.candidate.id);
    expect(ids).toContain('held');
    expect(ids).not.toContain('plain-journal');
    expect(ids).not.toContain('answered');
  });

  it('puts cards with a question ahead of everything, even an overdue todo', () => {
    const state = makeState({
      todos: [makeTodo({ id: 'overdue', due_day: '2025-12-01' } as any)],
      notes: [
        makeNote({
          id: 'unclear',
          subtype: 'catchall',
          created_at: '2025-12-15T09:00:00Z',
          views: { needs_clarification: true },
        } as any),
        makeNote({
          id: 'held',
          subtype: 'catchall',
          created_at: '2025-12-15T10:00:00Z',
          views: { relation: relation('pending') },
        } as any),
      ],
    });
    const ids = selectSweepCandidatesUnified(state as any).map((i) => i.candidate.id);
    expect(ids.slice(0, 3)).toEqual(['held', 'unclear', 'overdue']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// One day end: after midnight, before the day ends, today is still yesterday
// ═══════════════════════════════════════════════════════════════════════════════

import { getDateService as realDateService } from '../../date/DateService';
import { selectHabitsDueToday, selectTodosCompletedToday } from '../selectors';

describe('after midnight, before the day ends', () => {
  // The clock: 12:30 AM on Tuesday 16 December 2025. The day ends at 3 AM,
  // so for the person it is still Monday 15 December.
  const ds = realDateService();
  let was: number;
  let previousTimezone: string;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-16T00:30:00Z'));
    was = ds.getDayBoundaryHour();
    previousTimezone = ds.getTimezone();
    ds.setTimezone('UTC');
    ds.setDayBoundaryHour(3);
  });

  afterEach(() => {
    ds.setDayBoundaryHour(was);
    ds.setTimezone(previousTimezone);
    jest.useRealTimers();
  });

  it('today is still Monday', () => {
    expect(ds.calendarDay()).toBe('2025-12-16');
    expect(ds.today()).toBe('2025-12-15');
  });

  it("Monday's todos are still due today, and Tuesday's are not yet", () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 'mon', due_day: '2025-12-15' }),
        makeTodo({ id: 'tue', due_day: '2025-12-16' }),
        makeTodo({ id: 'sun', due_day: '2025-12-14' }),
      ],
    });
    expect(selectTodosDueToday(state as any).map((t) => t.id)).toEqual(['mon']);
    // Monday's is not past its day until the day ends
    expect(selectOverdueTodos(state as any).map((t) => t.id)).toEqual(['sun']);
  });

  it('a todo ticked off after midnight was done today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 'late', due_day: '2025-12-15', completed_at: '2025-12-16T00:10:00Z' }),
        makeTodo({ id: 'evening', due_day: '2025-12-15', completed_at: '2025-12-15T21:00:00Z' }),
        // 1 AM on Monday belonged to Sunday
        makeTodo({ id: 'sunday', due_day: '2025-12-14', completed_at: '2025-12-15T01:00:00Z' }),
      ],
    });
    expect(
      selectTodosCompletedToday(state as any)
        .map((t) => t.id)
        .sort(),
    ).toEqual(['evening', 'late']);
  });

  it('a habit for Mondays is still on, and one for Tuesdays is not yet', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'mondays', cadence: 'weekly', days_active: [1] }),
        makeHabit({ id: 'tuesdays', cadence: 'weekly', days_active: [2] }),
        makeHabit({ id: 'daily', cadence: 'daily' }),
      ],
      habitProgress: [],
    });
    expect(
      selectHabitsDueToday(state as any)
        .map((h) => h.id)
        .sort(),
    ).toEqual(['daily', 'mondays']);
  });

  it('a habit logged for Monday counts as done today', () => {
    const state = makeState({
      habits: [makeHabit({ id: 'daily', cadence: 'daily' })],
      habitProgress: [makeHabitProgress('daily', '2025-12-15')],
    });
    expect(selectHabitsDueToday(state as any)).toHaveLength(0);
  });

  it('a drop made after midnight was made today', () => {
    const state = makeState({
      todos: [
        makeTodo({ id: 'late-drop', due_day: null as any, created_at: '2025-12-16T00:20:00Z' }),
      ],
    });
    expect(selectRecentDrops(state as any).map((t) => t.id)).toEqual(['late-drop']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The wrap up's cards: a todo due today that did not happen is a card
// ═══════════════════════════════════════════════════════════════════════════════

import { selectWrapUp } from '../selectors';

describe("the wrap up's cards", () => {
  const ds = realDateService();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T20:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a todo due today that did not happen is a swipe card, with the overdue ones', () => {
    expect(ds.today()).toBe('2025-12-15');
    const state = makeState({
      todos: [
        makeTodo({ id: 'today', due_day: '2025-12-15' }),
        makeTodo({ id: 'overdue', due_day: '2025-12-12' }),
        makeTodo({ id: 'tomorrow', due_day: '2025-12-16' }),
        makeTodo({ id: 'done', due_day: '2025-12-15', completed_at: '2025-12-15T10:00:00Z' }),
      ],
    });
    const ids = selectWrapUp(state as any)
      .cards.map((c) => c.candidate.id)
      .sort();
    expect(ids).toEqual(['overdue', 'today']);
  });

  it('a Later that comes back today is one of tonight’s cards, and one still put off is not', () => {
    const state = makeState({
      todos: [
        // put off (Later): no day of its own, and the day it comes back
        makeTodo({ id: 'back-today', due_day: null, resurface_at: '2025-12-15' }),
        makeTodo({ id: 'back-earlier', due_day: null, resurface_at: '2025-12-12' }),
        makeTodo({ id: 'still-away', due_day: null, resurface_at: '2025-12-19' }),
        makeTodo({
          id: 'back-done',
          due_day: null,
          resurface_at: '2025-12-15',
          completed_at: '2025-12-15T10:00:00Z',
        }),
      ],
    });
    const ids = selectWrapUp(state as any)
      .cards.map((c) => c.candidate.id)
      .sort();
    expect(ids).toEqual(['back-earlier', 'back-today']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A todo with only a deadline (stage 2c): due on its deadline day, overdue after
// ═══════════════════════════════════════════════════════════════════════════════

describe('a todo with a deadline and no day planned', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const deadline = (id: string, target_date: string) =>
    makeTodo({ id, due_day: null, scheduled_date: null, target_date } as Partial<Todo>);

  it('is on Today on its deadline day, and not before', () => {
    const state = makeState({
      todos: [deadline('due-today', '2025-12-15'), deadline('due-tomorrow', '2025-12-16')],
    });
    expect(selectTodosDueToday(state as any).map((t) => t.id)).toEqual(['due-today']);
  });

  it('is overdue once its deadline has passed, and not on the day', () => {
    const state = makeState({
      todos: [deadline('passed', '2025-12-14'), deadline('due-today', '2025-12-15')],
    });
    expect(selectOverdueTodos(state as any).map((t) => t.id)).toEqual(['passed']);
  });

  it('waits with the undated todos until its deadline, then leaves them', () => {
    const state = makeState({
      todos: [
        deadline('ahead', '2025-12-18'),
        deadline('due-today', '2025-12-15'),
        deadline('passed', '2025-12-14'),
      ],
    });
    expect(selectUndatedTodos(state as any).map((t) => t.id)).toEqual(['ahead']);
    expect(selectRecentDrops(state as any).map((t) => t.id)).toEqual(['ahead']);
  });

  it('a planned day wins over the deadline', () => {
    const state = makeState({
      todos: [makeTodo({ id: 'planned', due_day: '2025-12-16', target_date: '2025-12-15' } as any)],
    });
    expect(selectTodosDueToday(state as any)).toEqual([]);
    expect(selectOverdueTodos(state as any)).toEqual([]);
  });

  it('is due today in Sweep on its deadline, overdue after, worded as a deadline', () => {
    const state = makeState({
      todos: [deadline('due-today', '2025-12-15'), deadline('passed', '2025-12-14')],
    });
    const cards = selectSweepCandidatesUnified(state as any);
    const today = cards.find((c) => c.candidate.id === 'due-today')!;
    const passed = cards.find((c) => c.candidate.id === 'passed')!;
    expect(today.candidate).toMatchObject({ isDueToday: true, isOverdue: false });
    expect(today.meta).toMatchObject({ todoStatus: 'due_today', byDeadline: true });
    expect(passed.candidate).toMatchObject({ isDueToday: false, isOverdue: true });
    expect(passed.meta).toMatchObject({ todoStatus: 'overdue', byDeadline: true });
  });
});
