/**
 * Type Interface Tests
 *
 * Type-level and contract tests for shared interfaces.
 * Ensures that interface changes are backward-compatible and
 * new optional fields don't break existing consumers.
 */

import type { DailyBriefInput, DailyBrief, SequencedItem } from '../types';

describe('DailyBriefInput interface', () => {
  describe('date field', () => {
    it('accepts date as YYYY-MM-DD string', () => {
      const input: DailyBriefInput = {
        date: '2026-02-10',
        morning_sequence: [],
        day_sequence: [],
        evening_sequence: [],
      };

      expect(input.date).toBe('2026-02-10');
    });

    it('compiles without date field (backward-compatible)', () => {
      const input: DailyBriefInput = {
        morning_sequence: [],
        day_sequence: [],
        evening_sequence: [],
      };

      expect(input.date).toBeUndefined();
    });

    it('works with minimal fields (empty object)', () => {
      const input: DailyBriefInput = {};

      expect(input.date).toBeUndefined();
      expect(input.morning_sequence).toBeUndefined();
    });

    it('works alongside all other fields', () => {
      const input: DailyBriefInput = {
        date: '2025-12-16',
        morning_sequence: [{ id: 'todo-1', type: 'todo' }],
        day_sequence: [{ id: 'habit-1', type: 'habit' }],
        evening_sequence: [],
        dismissed_habit_ids: ['habit-2'],
        completed_at: '2025-12-16T08:00:00Z',
      };

      expect(input.date).toBe('2025-12-16');
      expect(input.morning_sequence).toHaveLength(1);
      expect(input.day_sequence).toHaveLength(1);
      expect(input.dismissed_habit_ids).toEqual(['habit-2']);
      expect(input.completed_at).toBeTruthy();
    });
  });

  describe('deprecated fields still work', () => {
    it('one_thing_id and one_thing_type remain in interface', () => {
      const input: DailyBriefInput = {
        one_thing_id: 'todo-123',
        one_thing_type: 'todo',
      };

      expect(input.one_thing_id).toBe('todo-123');
      expect(input.one_thing_type).toBe('todo');
    });

    it('one_thing fields accept null', () => {
      const input: DailyBriefInput = {
        one_thing_id: null,
        one_thing_type: null,
      };

      expect(input.one_thing_id).toBeNull();
      expect(input.one_thing_type).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ItemReminder interface contract (new on app-fixes-2.24 branch)
// ═══════════════════════════════════════════════════════════════════════════════

import type { ItemReminder, Todo, Habit, Note } from '../types';

describe('ItemReminder interface', () => {
  it('compiles with required fields only', () => {
    const reminder: ItemReminder = {
      id: 'rem-1',
      time: '09:00',
      frequency: 'once',
    };

    expect(reminder.id).toBe('rem-1');
    expect(reminder.time).toBe('09:00');
    expect(reminder.frequency).toBe('once');
  });

  it('accepts optional date field for once-frequency', () => {
    const reminder: ItemReminder = {
      id: 'rem-2',
      time: '14:30',
      frequency: 'once',
      date: '2025-12-20',
    };

    expect(reminder.date).toBe('2025-12-20');
  });

  it('accepts optional notificationId field', () => {
    const reminder: ItemReminder = {
      id: 'rem-3',
      time: '09:00',
      frequency: 'daily',
      notificationId: 'expo-notif-abc123',
    };

    expect(reminder.notificationId).toBe('expo-notif-abc123');
  });

  it('frequency accepts "once" and "daily" as union values', () => {
    const once: ItemReminder = { id: '1', time: '08:00', frequency: 'once' };
    const daily: ItemReminder = { id: '2', time: '08:00', frequency: 'daily' };

    expect(once.frequency).toBe('once');
    expect(daily.frequency).toBe('daily');
  });

  it('time field uses HH:MM format', () => {
    const reminder: ItemReminder = { id: '1', time: '23:59', frequency: 'daily' };
    expect(reminder.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('reminders field on entity types', () => {
  it('Todo type accepts reminders array', () => {
    const todo = {
      id: 'todo-1',
      type: 'todo',
      reminders: [{ id: 'r1', time: '09:00', frequency: 'once' as const, date: '2025-12-20' }],
    } as Partial<Todo>;

    expect(todo.reminders).toHaveLength(1);
  });

  it('Todo type accepts null reminders', () => {
    const todo = { id: 'todo-1', type: 'todo', reminders: null } as Partial<Todo>;
    expect(todo.reminders).toBeNull();
  });

  it('Habit type accepts reminders array', () => {
    const habit = {
      id: 'habit-1',
      type: 'habit',
      reminders: [{ id: 'r1', time: '08:00', frequency: 'daily' as const }],
    } as Partial<Habit>;

    expect(habit.reminders).toHaveLength(1);
  });

  it('Note type accepts reminders array', () => {
    const note = {
      id: 'note-1',
      type: 'note',
      reminders: [{ id: 'r1', time: '10:00', frequency: 'once' as const, date: '2025-12-25' }],
    } as Partial<Note>;

    expect(note.reminders).toHaveLength(1);
  });
});
