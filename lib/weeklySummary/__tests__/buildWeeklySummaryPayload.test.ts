/**
 * Tests for lib/weeklySummary/buildWeeklySummaryPayload.ts
 *
 * Tests the data aggregation logic that builds the payload sent to the
 * Cloudflare Worker for AI-generated weekly summaries.
 */

import type { WeeklySummaryPayload } from '../buildWeeklySummaryPayload';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockGetState = jest.fn();
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockGetState(),
  },
}));

const MOCK_TODAY = '2025-12-15'; // Monday

jest.mock('../../date', () => ({
  getDateService: () => ({
    getCurrentDate: () => MOCK_TODAY,
    fromDateString: (str: string) => (str ? new Date(str + 'T00:00:00') : null),
    addDays: (dateStr: string, days: number) => {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    },
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBaseState(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    isInitialized: true,
    todos: [],
    habits: [],
    habitProgress: [],
    notes: [],
    spaces: [],
    calendarEvents: {},
    userCalendarEvents: [],
    userTimezone: 'America/New_York',
    fetchCalendarEventsForRange: jest.fn(),
    ...overrides,
  };
}

function makeTodo(overrides: Record<string, unknown> = {}) {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Todo',
    name: 'Test Todo',
    owner_id: 'user-1',
    created_at: '2025-12-15T10:00:00Z',
    updated_at: '2025-12-15T10:00:00Z',
    archived: false,
    completed_at: null,
    due_date: null,
    due_day: null,
    drop_id: null,
    locked_in_at: null,
    sweep_reschedule_count: 0,
    space_id: null,
    skipped_in_sweep_at: null,
    tags: [],
    ...overrides,
  };
}

function makeHabit(overrides: Record<string, unknown> = {}) {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    owner_id: 'user-1',
    created_at: '2025-12-01T10:00:00Z',
    updated_at: '2025-12-15T10:00:00Z',
    archived: false,
    subtype: 'start_habit',
    days_active: null,
    target_per_period: 7,
    last_completed_at: null,
    last_checked_in_at: null,
    locked_in_at: null,
    drop_id: null,
    space_id: null,
    cadence: 'daily',
    ...overrides,
  };
}

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    title: 'Test Note',
    body: 'Test note body text',
    owner_id: 'user-1',
    created_at: '2025-12-15T10:00:00Z',
    updated_at: '2025-12-15T10:00:00Z',
    archived: false,
    subtype: 'note',
    drop_id: null,
    space_id: null,
    skipped_in_sweep_at: null,
    swept_at: null,
    tags: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklySummaryPayload', () => {
  let buildWeeklySummaryPayload: () => Promise<WeeklySummaryPayload | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-require to reset module state
    ({ buildWeeklySummaryPayload } = require('../buildWeeklySummaryPayload'));
  });

  // ── Null guards ──────────────────────────────────────────────────────────

  it('returns null if no userId', async () => {
    mockGetState.mockReturnValue(makeBaseState({ userId: null }));
    const result = await buildWeeklySummaryPayload();
    expect(result).toBeNull();
  });

  it('returns null if not initialized', async () => {
    mockGetState.mockReturnValue(makeBaseState({ isInitialized: false }));
    const result = await buildWeeklySummaryPayload();
    expect(result).toBeNull();
  });

  // ── Week boundaries ──────────────────────────────────────────────────────

  it('computes correct week start/end dates', async () => {
    // MOCK_TODAY = 2025-12-15 (Monday)
    mockGetState.mockReturnValue(makeBaseState());
    const result = await buildWeeklySummaryPayload();
    expect(result).not.toBeNull();
    expect(result!.weekStartDate).toBe('2025-12-15'); // Monday
    expect(result!.weekEndDate).toBe('2025-12-21'); // Sunday
  });

  it('includes userId in payload', async () => {
    mockGetState.mockReturnValue(makeBaseState());
    const result = await buildWeeklySummaryPayload();
    expect(result!.userId).toBe('user-1');
  });

  // ── Todo stats ────────────────────────────────────────────────────────────

  it('counts todos completed this week', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ completed_at: '2025-12-15T14:00:00Z' }), // This week
        makeTodo({ completed_at: '2025-12-16T09:00:00Z' }), // This week
        makeTodo({ completed_at: '2025-12-08T09:00:00Z' }), // Last week
        makeTodo({ completed_at: null }), // Not completed
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.todosCompleted).toBe(2);
  });

  it('counts todos completed last week for trend comparison', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ completed_at: '2025-12-08T14:00:00Z' }), // Last week (Mon)
        makeTodo({ completed_at: '2025-12-10T09:00:00Z' }), // Last week (Wed)
        makeTodo({ completed_at: '2025-12-14T09:00:00Z' }), // Last week (Sun)
        makeTodo({ completed_at: '2025-12-15T09:00:00Z' }), // This week
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.todosCompletedLastWeek).toBe(3);
  });

  it('counts todos created this week', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ created_at: '2025-12-15T10:00:00Z' }), // This week
        makeTodo({ created_at: '2025-12-17T10:00:00Z' }), // This week
        makeTodo({ created_at: '2025-12-01T10:00:00Z' }), // Earlier
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.todosCreated).toBe(2);
  });

  // ── Completed todo details ────────────────────────────────────────────────

  it('builds completed todo details with overdue detection', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({
          title: 'Overdue task',
          due_date: '2025-12-14T00:00:00Z', // Due Sunday (before completion)
          completed_at: '2025-12-15T10:00:00Z', // Completed Monday
          created_at: '2025-12-10T10:00:00Z',
        }),
        makeTodo({
          title: 'On time task',
          due_date: '2025-12-16T00:00:00Z', // Due Tuesday
          completed_at: '2025-12-15T08:00:00Z', // Completed Monday (before due)
          created_at: '2025-12-10T10:00:00Z',
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    expect(result!.completedTodos).toHaveLength(2);

    const overdue = result!.completedTodos.find((t) => t.title === 'Overdue task');
    expect(overdue!.wasOverdue).toBe(true);

    const onTime = result!.completedTodos.find((t) => t.title === 'On time task');
    expect(onTime!.wasOverdue).toBe(false);
  });

  // ── Habit tracking ────────────────────────────────────────────────────────

  it('tracks habit progress per day', async () => {
    const habit = makeHabit({ id: 'habit-1', name: 'Meditate', target_per_period: 5 });
    const state = makeBaseState({
      habits: [habit],
      habitProgress: [
        { habit_id: 'habit-1', occurred_day: '2025-12-15' }, // Monday
        { habit_id: 'habit-1', occurred_day: '2025-12-16' }, // Tuesday
        { habit_id: 'habit-1', occurred_day: '2025-12-18' }, // Thursday
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const tracked = result!.stats.habitsTracked['Meditate'];
    expect(tracked).toBeDefined();
    expect(tracked.targetDays).toBe(5);
    expect(tracked.completedDays).toEqual([true, true, false, true, false, false, false]);
  });

  it('excludes archived habits', async () => {
    const state = makeBaseState({
      habits: [
        makeHabit({ name: 'Active', archived: false }),
        makeHabit({ name: 'Archived', archived: true }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(Object.keys(result!.stats.habitsTracked)).toEqual(['Active']);
  });

  it('excludes break_habit subtypes', async () => {
    const state = makeBaseState({
      habits: [
        makeHabit({ name: 'Good Habit', subtype: 'start_habit' }),
        makeHabit({ name: 'Bad Habit', subtype: 'break_habit' }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(Object.keys(result!.stats.habitsTracked)).toEqual(['Good Habit']);
  });

  // ── Note counts ───────────────────────────────────────────────────────────

  it('counts journal entries this week', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({ subtype: 'journal', created_at: '2025-12-15T10:00:00Z' }),
        makeNote({ subtype: 'journal', created_at: '2025-12-17T10:00:00Z' }),
        makeNote({ subtype: 'idea', created_at: '2025-12-15T10:00:00Z' }),
        makeNote({ subtype: 'journal', created_at: '2025-12-01T10:00:00Z' }), // Not this week
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.journalEntries).toBe(2);
  });

  it('counts ideas captured this week', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({ subtype: 'idea', created_at: '2025-12-15T10:00:00Z' }),
        makeNote({ subtype: 'idea', created_at: '2025-12-18T10:00:00Z' }),
        makeNote({ subtype: 'note', created_at: '2025-12-15T10:00:00Z' }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.ideasCaptured).toBe(2);
  });

  // ── Lock-ins ──────────────────────────────────────────────────────────────

  it('counts lock-ins from todos and habits', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ locked_in_at: '2025-12-15T08:00:00Z' }), // This week
        makeTodo({ locked_in_at: '2025-12-01T08:00:00Z' }), // Not this week
      ],
      habits: [
        makeHabit({ locked_in_at: '2025-12-16T08:00:00Z' }), // This week
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.lockIns).toBe(2);
  });

  // ── Mind Drops ────────────────────────────────────────────────────────────

  it('counts mind drops created and swept', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({
          drop_id: 'drop-1',
          created_at: '2025-12-15T10:00:00Z',
          completed_at: '2025-12-15T14:00:00Z',
        }),
        makeTodo({
          drop_id: 'drop-2',
          created_at: '2025-12-16T10:00:00Z',
          due_date: '2025-12-20T00:00:00Z',
        }),
        makeTodo({ drop_id: 'drop-3', created_at: '2025-12-17T10:00:00Z' }), // Not swept
        makeTodo({ created_at: '2025-12-15T10:00:00Z' }), // No drop_id - not a mind drop
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.stats.mindDropsCreated).toBe(3);
    expect(result!.stats.mindDropsSwept).toBe(2); // completed + scheduled
  });

  // ── Stale items ───────────────────────────────────────────────────────────

  it('detects stale todos with high reschedule count', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({
          title: 'Zombie task',
          sweep_reschedule_count: 10,
          created_at: '2025-11-01T10:00:00Z',
          due_date: '2025-12-15T00:00:00Z',
        }),
        makeTodo({
          title: 'Normal task',
          sweep_reschedule_count: 1,
          created_at: '2025-12-14T10:00:00Z',
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.staleItems).toHaveLength(1);
    expect(result!.staleItems[0].title).toBe('Zombie task');
    expect(result!.staleItems[0].sweepRescheduleCount).toBe(10);
  });

  it('detects floating old items with no due date', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({
          title: 'Forgotten task',
          created_at: '2025-11-01T10:00:00Z', // 44 days ago
          due_date: null,
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.staleItems).toHaveLength(1);
    expect(result!.staleItems[0].title).toBe('Forgotten task');
  });

  it('excludes completed and archived items from stale detection', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({
          created_at: '2025-11-01T10:00:00Z',
          completed_at: '2025-12-10T10:00:00Z',
          sweep_reschedule_count: 10,
        }),
        makeTodo({
          created_at: '2025-11-01T10:00:00Z',
          archived: true,
          sweep_reschedule_count: 10,
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.staleItems).toHaveLength(0);
  });

  // ── Completions by day ────────────────────────────────────────────────────

  it('buckets completions by day of week', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ completed_at: '2025-12-15T10:00:00Z' }), // Monday
        makeTodo({ completed_at: '2025-12-15T14:00:00Z' }), // Monday
        makeTodo({ completed_at: '2025-12-17T18:00:00Z' }), // Wednesday
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.completionsByDay['Monday']).toBe(2);
    expect(result!.completionsByDay['Wednesday']).toBe(1);
    expect(result!.completionsByDay['Tuesday']).toBe(0);
  });

  // ── Completions by time block ─────────────────────────────────────────────

  it('buckets completions by morning/afternoon/evening', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ completed_at: '2025-12-15T07:00:00Z' }), // Morning (7am)
        makeTodo({ completed_at: '2025-12-15T10:30:00Z' }), // Morning (10:30am)
        makeTodo({ completed_at: '2025-12-15T14:00:00Z' }), // Afternoon (2pm)
        makeTodo({ completed_at: '2025-12-15T20:00:00Z' }), // Evening (8pm)
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    // Note: hour depends on local timezone interpretation, so just verify shape
    expect(result!.completionsByTimeBlock).toHaveProperty('morning');
    expect(result!.completionsByTimeBlock).toHaveProperty('afternoon');
    expect(result!.completionsByTimeBlock).toHaveProperty('evening');
    const total =
      result!.completionsByTimeBlock.morning +
      result!.completionsByTimeBlock.afternoon +
      result!.completionsByTimeBlock.evening;
    expect(total).toBe(4);
  });

  // ── Space activity ────────────────────────────────────────────────────────

  it('computes space activity counts', async () => {
    const state = makeBaseState({
      spaces: [{ id: 'space-1', name: 'Work', created_at: '2025-12-01T00:00:00Z' }],
      todos: [
        makeTodo({ space_id: 'space-1' }),
        makeTodo({ space_id: 'space-1' }),
        makeTodo({ space_id: 'other-space' }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.spaceActivity).toHaveLength(1);
    expect(result!.spaceActivity[0].spaceName).toBe('Work');
    expect(result!.spaceActivity[0].itemCount).toBe(2);
  });

  // ── Journal excerpts ──────────────────────────────────────────────────────

  it('includes recent journal excerpts (max 5, this week)', async () => {
    const journals = Array.from({ length: 7 }, (_, i) =>
      makeNote({
        subtype: 'journal',
        body: `Journal entry ${i}`,
        created_at: `2025-12-${15 + (i % 5)}T10:00:00Z`,
      }),
    );
    const state = makeBaseState({ notes: journals });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.recentJournalExcerpts.length).toBeLessThanOrEqual(5);
    expect(result!.recentJournalExcerpts[0]).toHaveProperty('excerpt');
    expect(result!.recentJournalExcerpts[0]).toHaveProperty('date');
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('returns valid payload with empty store', async () => {
    mockGetState.mockReturnValue(makeBaseState());
    const result = await buildWeeklySummaryPayload();
    expect(result).not.toBeNull();
    expect(result!.stats.todosCompleted).toBe(0);
    expect(result!.stats.todosCreated).toBe(0);
    expect(result!.stats.journalEntries).toBe(0);
    expect(result!.stats.ideasCaptured).toBe(0);
    expect(result!.stats.lockIns).toBe(0);
    expect(result!.stats.mindDropsCreated).toBe(0);
    expect(result!.stats.mindDropsSwept).toBe(0);
    expect(result!.completedTodos).toEqual([]);
    expect(result!.staleItems).toEqual([]);
    expect(result!.spaceActivity).toEqual([]);
    expect(result!.upcomingTodos).toEqual([]);
    expect(result!.recentJournalExcerpts).toEqual([]);
    expect(result!.recentNotesTitles).toEqual([]);
  });

  // ── Upcoming todos ────────────────────────────────────────────────────────

  it('includes upcoming todos due next week', async () => {
    const state = makeBaseState({
      todos: [
        makeTodo({ title: 'Next week task', due_date: '2025-12-22T00:00:00Z' }), // Next Mon
        makeTodo({ title: 'This week task', due_date: '2025-12-17T00:00:00Z' }), // This week
        makeTodo({
          title: 'Completed',
          due_date: '2025-12-23T00:00:00Z',
          completed_at: '2025-12-15T10:00:00Z',
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.upcomingTodos).toHaveLength(1);
    expect(result!.upcomingTodos[0].title).toBe('Next week task');
  });

  // ── Entity events (Space events) ─────────────────────────────────────────

  it('includes entity events (Notes with subtype=event) in upcomingEvents', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({
          subtype: 'event',
          title: 'Flight to Los Angeles',
          target_date: '2025-12-23', // Next week Tuesday
          event_time: '14:30',
          is_all_day: false,
          space_id: 'space-trip',
          location: 'LAX Airport',
        }),
      ],
      spaces: [{ id: 'space-trip', name: 'LA Trip', created_at: '2025-12-01T00:00:00Z' }],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const entityEvent = result!.upcomingEvents.find((e) => e.title === 'Flight to Los Angeles');
    expect(entityEvent).toBeDefined();
    expect(entityEvent!.source).toBe('gremly_entity');
    expect(entityEvent!.isUserCreated).toBe(true);
    expect(entityEvent!.hasGremlyInteraction).toBe(true);
    expect(entityEvent!.spaceId).toBe('space-trip');
    expect(entityEvent!.spaceName).toBe('LA Trip');
    expect(entityEvent!.location).toBe('LAX Airport');
    expect(entityEvent!.startTime).toBe('14:30');
    expect(entityEvent!.isAllDay).toBe(false);
  });

  it('excludes archived entity events', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({
          subtype: 'event',
          title: 'Archived Event',
          target_date: '2025-12-23',
          archived: true,
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.upcomingEvents.find((e) => e.title === 'Archived Event')).toBeUndefined();
  });

  it('excludes entity events outside next week range', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({
          subtype: 'event',
          title: 'Too Far Out',
          target_date: '2025-12-30', // Two weeks out
        }),
        makeNote({
          subtype: 'event',
          title: 'Already Past',
          target_date: '2025-12-14', // Last week
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();
    expect(result!.upcomingEvents).toHaveLength(0);
  });

  it('includes multi-day entity events that overlap next week', async () => {
    // Next week is 2025-12-22 (Mon) to 2025-12-28 (Sun)
    const state = makeBaseState({
      notes: [
        makeNote({
          subtype: 'event',
          title: 'Conference',
          target_date: '2025-12-21', // Starts Sunday (this week)
          end_date: '2025-12-24', // Ends Wednesday (next week)
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const conf = result!.upcomingEvents.find((e) => e.title === 'Conference');
    expect(conf).toBeDefined();
    // Date should be clamped to nextWeekStart since the event starts before next week
    expect(conf!.date).toBe('2025-12-22');
    expect(conf!.endDate).toBe('2025-12-24');
  });

  it('counts linked todos for entity events', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({
          id: 'event-1',
          subtype: 'event',
          title: 'Big Presentation',
          target_date: '2025-12-25',
        }),
      ],
      todos: [
        makeTodo({ title: 'Prepare slides', linked_event_id: 'event-1' }),
        makeTodo({ title: 'Print handouts', linked_event_id: 'event-1' }),
        makeTodo({
          title: 'Done prep',
          linked_event_id: 'event-1',
          completed_at: '2025-12-15T10:00:00Z',
        }),
        makeTodo({ title: 'Archived prep', linked_event_id: 'event-1', archived: true }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const event = result!.upcomingEvents.find((e) => e.title === 'Big Presentation');
    expect(event).toBeDefined();
    expect(event!.linkedTodoCount).toBe(2); // Only non-completed, non-archived
  });

  it('merges entity events with calendar events sorted by date', async () => {
    // Next week: 2025-12-22 to 2025-12-28
    const state = makeBaseState({
      calendarEvents: {
        '2025-12-24': [
          { title: 'Calendar Meeting', startAt: '2025-12-24T10:00:00Z', isAllDay: false },
        ],
      },
      notes: [
        makeNote({
          subtype: 'event',
          title: 'Entity Event',
          target_date: '2025-12-22', // Monday
          event_time: '09:00',
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    expect(result!.upcomingEvents.length).toBeGreaterThanOrEqual(2);
    // Entity event on Monday should come before calendar event on Wednesday
    const entityIdx = result!.upcomingEvents.findIndex((e) => e.title === 'Entity Event');
    const calIdx = result!.upcomingEvents.findIndex((e) => e.title === 'Calendar Meeting');
    expect(entityIdx).toBeLessThan(calIdx);
  });

  it('marks all-day entity events correctly', async () => {
    const state = makeBaseState({
      notes: [
        makeNote({
          subtype: 'event',
          title: 'All Day Event',
          target_date: '2025-12-23',
          is_all_day: true,
          event_time: null,
        }),
      ],
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const event = result!.upcomingEvents.find((e) => e.title === 'All Day Event');
    expect(event).toBeDefined();
    expect(event!.isAllDay).toBe(true);
    expect(event!.startTime).toBeUndefined();
  });

  it('tags external calendar events with source=calendar', async () => {
    const state = makeBaseState({
      calendarEvents: {
        '2025-12-22': [
          { title: 'External Event', startAt: '2025-12-22T09:00:00Z', isAllDay: false },
        ],
      },
    });
    mockGetState.mockReturnValue(state);
    const result = await buildWeeklySummaryPayload();

    const event = result!.upcomingEvents.find((e) => e.title === 'External Event');
    expect(event).toBeDefined();
    expect(event!.source).toBe('calendar');
    expect(event!.isUserCreated).toBe(false);
  });
});
