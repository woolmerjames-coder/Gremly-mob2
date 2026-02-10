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
