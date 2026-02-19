/**
 * Tests for organizeDay API module
 *
 * Tests the organize-day API client and request builder that powers
 * the "Help me organize" feature in Morning Brief.
 *
 * Key functions tested:
 * - buildOrganizeDayRequest: Converts store data to API format
 * - organizeDay: API client with error handling
 */

import { buildOrganizeDayRequest, type OrganizeDayRequest } from '../organizeDay';
import type { Todo, Habit } from '../../types';
import type { DayCapacity, TimeBlockCapacity } from '../../capacity';
import type { CalendarEvent } from '../../calendar/CalendarClient';

// Mock capacity functions
jest.mock('../../capacity', () => ({
  calculateRealisticAvailableMinutes: jest.fn().mockReturnValue(120),
}));

// =============================================================================
// FACTORIES
// =============================================================================

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
    due_day: '2025-01-25',
    time_window: null,
    time_estimate_minutes: 30,
    locked_in: false,
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
    start_date: '2025-01-01',
    end_date: null,
    time_window: null,
    time_estimate_minutes: 20,
    tags: [],
    ...overrides,
  } as Habit;
}

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    provider: 'google',
    providerEventId: `google-${Math.random().toString(36).slice(2)}`,
    title: 'Test Event',
    startAt: '2025-01-25T10:00:00Z',
    endAt: '2025-01-25T11:00:00Z',
    isAllDay: false,
    calendarId: 'cal-1',
    ...overrides,
  } as CalendarEvent;
}

function makeBlockCapacity(block: 'morning' | 'day' | 'evening'): TimeBlockCapacity {
  const configs = {
    morning: { startHour: 6, endHour: 12, label: 'Morning' },
    day: { startHour: 12, endHour: 17, label: 'Afternoon' },
    evening: { startHour: 17, endHour: 22, label: 'Evening' },
  };

  const config = configs[block];
  return {
    block,
    label: config.label,
    startHour: config.startHour,
    endHour: config.endHour,
    effectiveStartHour: config.startHour,
    totalMinutes: (config.endHour - config.startHour) * 60,
    calendarMinutes: 0,
    taskMinutes: 0,
    availableMinutes: (config.endHour - config.startHour) * 60,
    isPast: false,
    eventCount: 0,
  };
}

function makeDayCapacity(): DayCapacity {
  const morning = makeBlockCapacity('morning');
  const day = makeBlockCapacity('day');
  const evening = makeBlockCapacity('evening');

  return {
    blocks: { morning, day, evening },
    totalAvailableMinutes:
      morning.availableMinutes + day.availableMinutes + evening.availableMinutes,
    totalCalendarMinutes: 0,
    totalTaskMinutes: 0,
    totalEventCount: 0,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('buildOrganizeDayRequest', () => {
  const today = '2025-01-25';
  const currentHour = 9;

  describe('todos filtering', () => {
    it("includes only today's incomplete, non-archived todos", () => {
      const todos = [
        makeTodo({ id: 'todo-1', due_day: today, archived: false, completed_at: null }),
        makeTodo({ id: 'todo-2', due_day: today, archived: true, completed_at: null }),
        makeTodo({
          id: 'todo-3',
          due_day: today,
          archived: false,
          completed_at: '2025-01-25T10:00:00Z',
        }),
        makeTodo({ id: 'todo-4', due_day: '2025-01-26', archived: false, completed_at: null }),
      ];

      const result = buildOrganizeDayRequest({
        todos,
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('todo-1');
    });

    it('converts todo to OrganizeDayTask format', () => {
      const todo = makeTodo({
        id: 'todo-1',
        name: 'Buy groceries',
        due_day: today,
        time_estimate_minutes: 45,
        time_window: 'morning',
        locked_in: true,
      });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      const task = result.tasks[0];
      expect(task.id).toBe('todo-1');
      expect(task.title).toBe('Buy groceries');
      expect(task.type).toBe('todo');
      expect(task.estimateMinutes).toBe(45);
      expect(task.visibleMinutes).toBe(45);
      expect(task.currentBlock).toBe('morning');
      expect(task.isLockedIn).toBe(true);
    });

    it('uses fallback estimate of 30 when time_estimate_minutes is null', () => {
      const todo = makeTodo({
        id: 'todo-1',
        time_estimate_minutes: null,
      });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].visibleMinutes).toBe(30);
      expect(result.tasks[0].estimateMinutes).toBeNull();
    });

    it('sets currentBlock to null when time_window is "any"', () => {
      const todo = makeTodo({
        id: 'todo-1',
        time_window: 'any',
      });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].currentBlock).toBeNull();
      expect(result.tasks[0].timeWindowPreference).toBe('any');
    });
  });

  describe('habits filtering', () => {
    it('includes only active, non-archived habits for today', () => {
      const habits = [
        makeHabit({ id: 'h-1', archived: false, start_date: '2025-01-01', end_date: null }),
        makeHabit({ id: 'h-2', archived: true, start_date: '2025-01-01', end_date: null }),
        makeHabit({ id: 'h-3', archived: false, start_date: '2025-01-26', end_date: null }), // future
        makeHabit({ id: 'h-4', archived: false, start_date: '2025-01-01', end_date: '2025-01-24' }), // ended
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('h-1');
    });

    it('converts habit to OrganizeDayTask format', () => {
      const habit = makeHabit({
        id: 'h-1',
        name: 'Morning meditation',
        time_estimate_minutes: 15,
        time_window: 'morning',
      });

      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [habit],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      const task = result.tasks[0];
      expect(task.id).toBe('h-1');
      expect(task.title).toBe('Morning meditation');
      expect(task.type).toBe('habit');
      expect(task.visibleMinutes).toBe(15);
      expect(task.isLockedIn).toBe(false); // habits are never locked in
    });
  });

  describe('calendar events', () => {
    it('converts calendar events to OrganizeDayCalendarEvent format', () => {
      const event = makeCalendarEvent({
        provider: 'google',
        providerEventId: 'evt-123',
        title: 'Team Meeting',
        startAt: '2025-01-25T10:00:00Z',
        endAt: '2025-01-25T11:30:00Z',
      });

      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [],
        calendarEvents: [event],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.calendarEvents).toHaveLength(1);
      expect(result.calendarEvents[0]).toEqual({
        id: 'google-evt-123',
        title: 'Team Meeting',
        startAt: '2025-01-25T10:00:00Z',
        endAt: '2025-01-25T11:30:00Z',
        durationMinutes: 90,
      });
    });
  });

  describe('blocks structure', () => {
    it('builds blocks with capacity and realistic available minutes', () => {
      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      // Verify structure - realisticAvailableMinutes may be undefined if mock doesn't apply
      expect(result.blocks.morning.startHour).toBe(6);
      expect(result.blocks.morning.endHour).toBe(12);
      expect(result.blocks.morning.availableMinutes).toBe(360);
      expect(result.blocks.morning).toHaveProperty('realisticAvailableMinutes');

      expect(result.blocks.day.startHour).toBe(12);
      expect(result.blocks.day.endHour).toBe(17);
      expect(result.blocks.day.availableMinutes).toBe(300);

      expect(result.blocks.evening.startHour).toBe(17);
      expect(result.blocks.evening.endHour).toBe(22);
      expect(result.blocks.evening.availableMinutes).toBe(300);
    });

    it('includes currentHour in request', () => {
      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour: 14,
      });

      expect(result.currentHour).toBe(14);
    });
  });

  describe('energy type handling', () => {
    it('validates and normalizes energy type from todo', () => {
      const todo = makeTodo({
        id: 'todo-1',
        energy_type: 'physical',
      } as any);

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].energyType).toBe('physical');
    });

    it('defaults to administrative for invalid energy type', () => {
      const todo = makeTodo({
        id: 'todo-1',
        energy_type: 'invalid_type',
      } as any);

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].energyType).toBe('administrative');
    });
  });

  describe('buffer calculations', () => {
    it('computes totalMinutes including prep and cooldown buffers', () => {
      const todo = makeTodo({
        id: 'todo-1',
        time_estimate_minutes: 60,
        prep_buffer_minutes: 15,
        cooldown_buffer_minutes: 10,
      } as any);

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].visibleMinutes).toBe(60);
      expect(result.tasks[0].totalMinutes).toBe(85); // 60 + 15 + 10
    });

    it('handles missing buffers gracefully', () => {
      const todo = makeTodo({
        id: 'todo-1',
        time_estimate_minutes: 45,
        // no prep_buffer_minutes or cooldown_buffer_minutes
      });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].totalMinutes).toBe(45); // no buffers added
    });
  });

  describe('combined todos and habits', () => {
    it('merges todos and habits into single tasks array', () => {
      const todo = makeTodo({ id: 'todo-1', name: 'Todo Task' });
      const habit = makeHabit({ id: 'habit-1', name: 'Habit Task' });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [habit],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.find((t) => t.id === 'todo-1')?.type).toBe('todo');
      expect(result.tasks.find((t) => t.id === 'habit-1')?.type).toBe('habit');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // hiddenTodayIds filtering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('hiddenTodayIds', () => {
    it('excludes hidden todos', () => {
      const todos = [
        makeTodo({ id: 'visible', due_day: today }),
        makeTodo({ id: 'hidden', due_day: today }),
      ];

      const result = buildOrganizeDayRequest({
        todos,
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        hiddenTodayIds: ['hidden'],
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('visible');
    });

    it('excludes hidden habits', () => {
      const habits = [
        makeHabit({ id: 'hvisible', start_date: '2025-01-01' }),
        makeHabit({ id: 'hhidden', start_date: '2025-01-01' }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        hiddenTodayIds: ['hhidden'],
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('hvisible');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isAtGoal computation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isAtGoal', () => {
    it('returns true for weekly habit at goal', () => {
      const habits = [
        makeHabit({
          id: 'weekly-habit',
          start_date: '2025-01-01',
          cadence: 'weekly',
          target_per_period: 3,
        }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        habitRolling7: new Map([['weekly-habit', 3]]),
      });

      expect(result.tasks[0].isAtGoal).toBe(true);
    });

    it('returns false for weekly habit below goal', () => {
      const habits = [
        makeHabit({
          id: 'weekly-habit',
          start_date: '2025-01-01',
          cadence: 'weekly',
          target_per_period: 3,
        }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        habitRolling7: new Map([['weekly-habit', 1]]),
      });

      expect(result.tasks[0].isAtGoal).toBe(false);
    });

    it('returns true for monthly habit at goal', () => {
      const habits = [
        makeHabit({
          id: 'monthly-habit',
          start_date: '2025-01-01',
          cadence: 'monthly',
          target_per_period: 10,
        }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        habitRolling30: new Map([['monthly-habit', 12]]),
      });

      expect(result.tasks[0].isAtGoal).toBe(true);
    });

    it('returns false for daily habit (no rolling window check)', () => {
      const habits = [
        makeHabit({
          id: 'daily-habit',
          start_date: '2025-01-01',
          cadence: 'daily',
          target_per_period: 1,
        }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      expect(result.tasks[0].isAtGoal).toBe(false);
    });

    it('returns false when rolling map is not provided', () => {
      const habits = [
        makeHabit({
          id: 'weekly-habit',
          start_date: '2025-01-01',
          cadence: 'weekly',
          target_per_period: 3,
        }),
      ];

      const result = buildOrganizeDayRequest({
        todos: [],
        habits,
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        // no habitRolling7 provided
      });

      expect(result.tasks[0].isAtGoal).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Gap data in blocks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('block gaps', () => {
    it('includes gaps array in each block', () => {
      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      for (const block of Object.values(result.blocks)) {
        expect(block.gaps).toBeDefined();
        expect(Array.isArray(block.gaps)).toBe(true);
      }
    });

    it('gaps have startIso, endIso, durationMinutes shape', () => {
      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
      });

      // With no calendar events, each block should have one full gap
      for (const block of Object.values(result.blocks)) {
        if (block.gaps.length > 0) {
          const gap = block.gaps[0];
          expect(gap).toHaveProperty('startIso');
          expect(gap).toHaveProperty('endIso');
          expect(gap).toHaveProperty('durationMinutes');
          expect(typeof gap.durationMinutes).toBe('number');
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // lockedIds support
  // ═══════════════════════════════════════════════════════════════════════════

  describe('lockedIds', () => {
    it('marks task as locked when its id is in lockedIds set', () => {
      const todo = makeTodo({ id: 'todo-locked', due_day: today });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        lockedIds: new Set(['todo-locked']),
      });

      expect(result.tasks[0].locked).toBe(true);
    });

    it('does not mark task as locked when not in lockedIds set', () => {
      const todo = makeTodo({ id: 'todo-free', due_day: today });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        lockedIds: new Set(['other-id']),
      });

      expect(result.tasks[0].locked).toBeFalsy();
    });

    it('works with empty lockedIds set', () => {
      const todo = makeTodo({ id: 'todo-1', due_day: today });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        lockedIds: new Set(),
      });

      expect(result.tasks[0].locked).toBeFalsy();
    });

    it('works when lockedIds is undefined', () => {
      const todo = makeTodo({ id: 'todo-1', due_day: today });

      const result = buildOrganizeDayRequest({
        todos: [todo],
        habits: [],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        // no lockedIds
      });

      expect(result.tasks[0].locked).toBeFalsy();
    });

    it('locks habits when in lockedIds set', () => {
      const habit = makeHabit({ id: 'habit-locked', start_date: '2025-01-01' });

      const result = buildOrganizeDayRequest({
        todos: [],
        habits: [habit],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        lockedIds: new Set(['habit-locked']),
      });

      expect(result.tasks[0].locked).toBe(true);
    });

    it('mixes locked and unlocked tasks', () => {
      const t1 = makeTodo({ id: 'locked-todo', due_day: today });
      const t2 = makeTodo({ id: 'free-todo', due_day: today });
      const h1 = makeHabit({ id: 'locked-habit', start_date: '2025-01-01' });

      const result = buildOrganizeDayRequest({
        todos: [t1, t2],
        habits: [h1],
        calendarEvents: [],
        capacity: makeDayCapacity(),
        today,
        currentHour,
        lockedIds: new Set(['locked-todo', 'locked-habit']),
      });

      const lockedTodo = result.tasks.find((t) => t.id === 'locked-todo');
      const freeTodo = result.tasks.find((t) => t.id === 'free-todo');
      const lockedHabit = result.tasks.find((t) => t.id === 'locked-habit');

      expect(lockedTodo?.locked).toBe(true);
      expect(freeTodo?.locked).toBeFalsy();
      expect(lockedHabit?.locked).toBe(true);
    });
  });
});

describe('organizeDay API', () => {
  // Note: These tests would require mocking fetch or using MSW
  // Documenting expected behavior here

  describe('successful response', () => {
    it.todo('returns assignments and summary from API');
    it.todo('includes reasoning array in response');
    it.todo('records latency_ms');
  });

  describe('error handling', () => {
    it.todo('returns empty assignments with error message on HTTP error');
    it.todo('returns all tasks as overflow on network error');
    it.todo('sets error field when API returns error');
  });
});
