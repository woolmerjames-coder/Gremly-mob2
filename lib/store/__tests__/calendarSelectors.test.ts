/**
 * Tests for lib/store/calendarSelectors.ts
 * Tests calendar view data selectors
 */

import { renderHook } from '@testing-library/react-native';
import { useCalendarItemsForDate, useDatesWithItems } from '../calendarSelectors';
import { resetDateService, createDateService } from '../../date';
import { useGremlyStore } from '../useGremlyStore';
import type { Todo, Habit, Note, Space } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-22';
const YESTERDAY = '2025-12-21';
const TOMORROW = '2025-12-23';

// Mock the store
jest.mock('../useGremlyStore');
const mockUseGremlyStore = useGremlyStore as jest.MockedFunction<typeof useGremlyStore>;

beforeEach(() => {
  resetDateService();
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
  jest.clearAllMocks();
});

afterEach(() => {
  resetDateService();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    name: 'Test Todo',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Todo;
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    frequency: 'daily',
    subtype: 'start_habit',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    cadence: 'daily',
    ...overrides,
  } as Habit;
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    body: 'Test journal entry',
    subtype: 'journal',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Note;
}

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: `space-${Math.random().toString(36).slice(2)}`,
    owner_id: 'user-1',
    name: 'Test Space',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    ...overrides,
  } as Space;
}

function setupMockStore(data: {
  todos?: Todo[];
  habits?: Habit[];
  notes?: Note[];
  spaces?: Space[];
  calendarEvents?: Record<string, unknown[]>;
  hiddenCalendarEventsByDate?: Record<string, string[]>;
  eventTimeOverrides?: Record<string, unknown>;
}) {
  mockUseGremlyStore.mockImplementation((selector: any) => {
    const state = {
      todos: data.todos || [],
      habits: data.habits || [],
      notes: data.notes || [],
      spaces: data.spaces || [],
      calendarEvents: data.calendarEvents || {},
      hiddenCalendarEventsByDate: data.hiddenCalendarEventsByDate || {},
      eventTimeOverrides: data.eventTimeOverrides || {},
    };
    return selector(state);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// useCalendarItemsForDate
// ═══════════════════════════════════════════════════════════════════════════════

describe('useCalendarItemsForDate', () => {
  it('returns empty array when no items exist', () => {
    setupMockStore({});
    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));
    expect(result.current).toEqual([]);
  });

  describe('todos', () => {
    it('includes todos due on the date', () => {
      const todo = makeTodo({ due_day: TODAY, name: 'Due today' });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].type).toBe('todo');
      expect(result.current[0].title).toBe('Due today');
    });

    it('excludes todos not due on the date', () => {
      const todo = makeTodo({ due_day: TOMORROW, name: 'Due tomorrow' });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('includes todos completed on the date', () => {
      const todo = makeTodo({
        due_day: YESTERDAY,
        completed_at: `${TODAY}T15:00:00Z`,
        name: 'Completed today',
      });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].isCompleted).toBe(true);
    });

    it('excludes archived todos', () => {
      const todo = makeTodo({ due_day: TODAY, archived: true });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('marks overdue todos correctly', () => {
      const todo = makeTodo({ due_day: YESTERDAY });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(YESTERDAY));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].isOverdue).toBe(true);
    });

    it('includes due_time in the time field', () => {
      const todo = makeTodo({ due_day: TODAY, due_time: '14:30' });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current[0].time).toBe('14:30');
    });
  });

  describe('habits', () => {
    it('includes daily habits', () => {
      const habit = makeHabit({ cadence: 'daily', name: 'Daily habit' });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].type).toBe('habit');
      expect(result.current[0].title).toBe('Daily habit');
    });

    it('excludes archived habits', () => {
      const habit = makeHabit({ archived: true });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('excludes habits before start_date', () => {
      const habit = makeHabit({ start_date: TOMORROW });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('excludes habits after end_date', () => {
      const habit = makeHabit({ end_date: YESTERDAY });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('respects days_active for custom schedules', () => {
      // Dec 22, 2025 is a Monday
      const habit = makeHabit({
        days_active: [1, 3, 5], // Monday, Wednesday, Friday
      });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY)); // Monday

      expect(result.current).toHaveLength(1);
    });

    it('excludes habits on non-active days', () => {
      // Dec 22, 2025 is a Monday
      const habit = makeHabit({
        days_active: [2, 4], // Tuesday, Thursday
      });
      setupMockStore({ habits: [habit] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY)); // Monday

      expect(result.current).toHaveLength(0);
    });
  });

  describe('journals', () => {
    it('includes journals created on the date', () => {
      const note = makeNote({
        subtype: 'journal',
        created_at: `${TODAY}T10:00:00Z`,
        title: 'My journal',
      });
      setupMockStore({ notes: [note] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].type).toBe('journal');
      expect(result.current[0].title).toBe('My journal');
    });

    it('excludes non-journal notes', () => {
      const note = makeNote({ subtype: 'catchall' });
      setupMockStore({ notes: [note] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('excludes archived journals', () => {
      const note = makeNote({ subtype: 'journal', archived: true });
      setupMockStore({ notes: [note] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(0);
    });

    it('uses note.date if available', () => {
      const note = makeNote({
        subtype: 'journal',
        date: TODAY,
        created_at: `${YESTERDAY}T10:00:00Z`,
      });
      setupMockStore({ notes: [note] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current).toHaveLength(1);
    });
  });

  describe('sorting', () => {
    it('puts timed items before untimed items', () => {
      const timedTodo = makeTodo({ due_day: TODAY, due_time: '14:00', name: 'Timed' });
      const untimedTodo = makeTodo({ due_day: TODAY, name: 'Untimed' });
      setupMockStore({ todos: [untimedTodo, timedTodo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current[0].title).toBe('Timed');
      expect(result.current[1].title).toBe('Untimed');
    });

    it('sorts timed items by time', () => {
      const laterTodo = makeTodo({ due_day: TODAY, due_time: '16:00', name: 'Later' });
      const earlierTodo = makeTodo({ due_day: TODAY, due_time: '09:00', name: 'Earlier' });
      setupMockStore({ todos: [laterTodo, earlierTodo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current[0].title).toBe('Earlier');
      expect(result.current[1].title).toBe('Later');
    });
  });

  describe('space info', () => {
    it('includes space info for items with space_id', () => {
      const space = makeSpace({ id: 'space-1', name: 'Work' });
      const todo = makeTodo({ due_day: TODAY, space_id: 'space-1' });
      setupMockStore({ todos: [todo], spaces: [space] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current[0].space).toEqual({
        id: 'space-1',
        name: 'Work',
        theme: null,
      });
    });

    it('returns null space for items without space_id', () => {
      const todo = makeTodo({ due_day: TODAY });
      setupMockStore({ todos: [todo] });

      const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

      expect(result.current[0].space).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// useDatesWithItems
// ═══════════════════════════════════════════════════════════════════════════════

describe('useDatesWithItems', () => {
  it('returns empty set when no items exist', () => {
    setupMockStore({});
    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));
    expect(result.current.size).toBe(0);
  });

  it('includes dates with todos', () => {
    const todo = makeTodo({ due_day: TODAY });
    setupMockStore({ todos: [todo] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    expect(result.current.has(TODAY)).toBe(true);
    expect(result.current.has(YESTERDAY)).toBe(false);
  });

  it('includes dates with habits', () => {
    const habit = makeHabit({ cadence: 'daily' });
    setupMockStore({ habits: [habit] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    // Daily habit appears on all dates
    expect(result.current.has(YESTERDAY)).toBe(true);
    expect(result.current.has(TODAY)).toBe(true);
    expect(result.current.has(TOMORROW)).toBe(true);
  });

  it('includes dates with journals', () => {
    const note = makeNote({
      subtype: 'journal',
      created_at: `${TODAY}T10:00:00Z`,
    });
    setupMockStore({ notes: [note] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    expect(result.current.has(TODAY)).toBe(true);
    expect(result.current.has(YESTERDAY)).toBe(false);
  });

  it('returns multiple dates when items span range', () => {
    const todo1 = makeTodo({ due_day: YESTERDAY });
    const todo2 = makeTodo({ due_day: TOMORROW });
    setupMockStore({ todos: [todo1, todo2] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    expect(result.current.has(YESTERDAY)).toBe(true);
    expect(result.current.has(TOMORROW)).toBe(true);
    expect(result.current.size).toBe(2);
  });

  it('includes dates with event notes', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      target_date: TODAY,
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    expect(result.current.has(TODAY)).toBe(true);
    expect(result.current.has(YESTERDAY)).toBe(false);
  });

  it('excludes archived event notes from date markers', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      target_date: TODAY,
      archived: true,
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useDatesWithItems(YESTERDAY, TOMORROW));

    expect(result.current.has(TODAY)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event Notes in Calendar Items
// ═══════════════════════════════════════════════════════════════════════════════

describe('useCalendarItemsForDate — event notes', () => {
  it('includes event notes as calendar_event items', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Flight to LA',
      target_date: TODAY,
      event_time: '14:30',
      location: 'LAX Airport',
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].type).toBe('calendar_event');
    expect(result.current[0].title).toBe('Flight to LA');
    expect(result.current[0].time).toBe('14:30');
    expect(result.current[0].location).toBe('LAX Airport');
  });

  it('excludes archived event notes', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Cancelled Event',
      target_date: TODAY,
      archived: true,
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current).toHaveLength(0);
  });

  it('includes space info for event notes with space_id', () => {
    const space = makeSpace({ id: 'space-trip', name: 'LA Trip' });
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Flight',
      target_date: TODAY,
      space_id: 'space-trip',
    });
    setupMockStore({ notes: [eventNote], spaces: [space] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current[0].space).toEqual({
      id: 'space-trip',
      name: 'LA Trip',
      theme: null,
    });
  });

  it('marks native event notes as non-external', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Party',
      target_date: TODAY,
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current[0].isExternal).toBe(false);
  });

  it('marks synced event notes as external with provider', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Synced Meeting',
      target_date: TODAY,
      external_source: {
        provider: 'google_calendar',
        externalId: 'ext-123',
        calendarId: 'cal-1',
        lastSyncedAt: '2025-12-22T00:00:00Z',
      },
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current[0].isExternal).toBe(true);
    expect(result.current[0].provider).toBe('google');
  });

  it('deduplicates: event note covers raw calendar event with same externalId', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'Meeting (from Note)',
      target_date: TODAY,
      event_time: '10:00',
      external_source: {
        provider: 'google_calendar',
        externalId: 'google-event-xyz',
        calendarId: 'cal-1',
        lastSyncedAt: '2025-12-22T00:00:00Z',
      },
    });

    // Raw calendar event with same providerEventId
    const calendarEvents = {
      [TODAY]: [
        {
          provider: 'google',
          providerEventId: 'google-event-xyz',
          title: 'Meeting (from Calendar)',
          startAt: `${TODAY}T10:00:00Z`,
          endAt: `${TODAY}T11:00:00Z`,
          isAllDay: false,
          location: null,
        },
      ],
    };

    setupMockStore({ notes: [eventNote], calendarEvents });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    // Should only show the Note-based event, not the raw calendar event
    expect(result.current.filter((i) => i.type === 'calendar_event')).toHaveLength(1);
    expect(result.current[0].title).toBe('Meeting (from Note)');
  });

  it('shows raw calendar events that are NOT covered by event notes', () => {
    const calendarEvents = {
      [TODAY]: [
        {
          provider: 'google',
          providerEventId: 'uncovered-event',
          title: 'Uncovered Meeting',
          startAt: `${TODAY}T15:00:00Z`,
          endAt: `${TODAY}T16:00:00Z`,
          isAllDay: false,
          location: null,
        },
      ],
    };

    setupMockStore({ calendarEvents });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].title).toBe('Uncovered Meeting');
  });

  it('handles event notes without event_time as all-day events', () => {
    const eventNote = makeNote({
      subtype: 'event' as any,
      title: 'All Day Event',
      target_date: TODAY,
      event_time: null,
    });
    setupMockStore({ notes: [eventNote] });

    const { result } = renderHook(() => useCalendarItemsForDate(TODAY));

    expect(result.current[0].time).toBeNull();
  });
});
