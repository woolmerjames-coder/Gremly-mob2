/**
 * Tests for habit save logic with extended fields (Step 6)
 * Unit tests to verify that habit schemas accept all new fields
 */
import { habitInsertSchema } from '../lib/schemas';

describe('Habit Save Logic - Schema Validation', () => {
  describe('Start Habit - Minimal Payload', () => {
    it('accepts minimal payload with only required fields (Name + Frequency) - acceptance criteria', () => {
      const payload = {
        name: 'Morning meditation',
        title: 'Morning meditation',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
      };

      const result = habitInsertSchema.parse(payload);
      expect(result).toMatchObject(payload);
    });

    it('accepts Start Habit with frequency_value', () => {
      const payload = {
        name: 'Exercise',
        title: 'Exercise',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        frequency_json: { kind: 'weekly' }, // Database column name
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.frequency_json).toEqual({ kind: 'weekly' }); // Database column name
    });
  });

  describe('Start Habit - With Optional Fields', () => {
    it('accepts reminders array', () => {
      const payload = {
        name: 'Meditate',
        title: 'Meditate',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        reminders_json: [{ id: '1', time: '08:00', days: 'every_day' }], // Database column name
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.reminders_json).toEqual([{ id: '1', time: '08:00', days: 'every_day' }]); // Database column name
    });

    it('accepts details fields (notes, tags, dates)', () => {
      const payload = {
        name: 'Read',
        title: 'Read',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        notes: '30 minutes daily',
        tags: ['health', 'learning'],
        start_date: '2025-10-20',
        end_date: null,
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.notes).toBe('30 minutes daily');
      expect(result.tags).toEqual(['health', 'learning']);
      expect(result.start_date).toBe('2025-10-20');
    });

    it('accepts buddy fields', () => {
      const payload = {
        name: 'Workout',
        title: 'Workout',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        buddy_id: '550e8400-e29b-41d4-a716-446655440000',
        buddy_email: 'friend@example.com',
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.buddy_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.buddy_email).toBe('friend@example.com');
    });

    it('accepts habit stack fields', () => {
      const payload = {
        name: 'Journal',
        title: 'Journal',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        stack_with_id: '660e8400-e29b-41d4-a716-446655440000',
        stack_position: 'after' as const,
        stack_offset_minutes: 5,
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.stack_with_id).toBe('660e8400-e29b-41d4-a716-446655440000');
      expect(result.stack_position).toBe('after');
      expect(result.stack_offset_minutes).toBe(5);
    });

    it('accepts all Start Habit fields together', () => {
      const payload = {
        name: 'Complete habit',
        title: 'Complete habit',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        frequency_json: { kind: 'custom_days', days: [1, 3, 5] },
        reminders_json: [{ id: '1', time: '09:00', days: 'per_occurrence' }],
        notes: 'Some notes',
        tags: ['productivity'],
        buddy_id: null,
        buddy_email: null,
        stack_with_id: null,
        stack_position: null,
        stack_offset_minutes: null,
        start_date: '2025-10-20',
        end_date: '2025-12-31',
      };

      const result = habitInsertSchema.parse(payload);
      expect(result).toMatchObject(payload);
    });
  });

  describe('Break Habit - Minimal Payload', () => {
    it('accepts minimal payload with only Name - acceptance criteria', () => {
      const payload = {
        name: 'Stop smoking',
        title: 'Stop smoking',
        frequency: 'daily',
        subtype: 'break_habit',
        ai_placed: false,
        taper_plan: null,
        triggers_json: null,
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.name).toBe('Stop smoking');
      expect(result.taper_plan).toBeNull();
      expect(result.triggers_json).toBeNull();
    });
  });

  describe('Break Habit - With Taper Plan', () => {
    it('accepts taper plan object', () => {
      const payload = {
        name: 'Quit caffeine',
        title: 'Quit caffeine',
        frequency: 'daily',
        subtype: 'break_habit',
        ai_placed: false,
        taper_plan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: 'step_down',
          stepDownReduceBy: 1,
          stepDownPer: 'week',
        },
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.taper_plan).toMatchObject({
        baselineCount: 7,
        strategy: 'step_down',
      });
    });

    it('accepts triggers array', () => {
      const payload = {
        name: 'Stop snacking',
        title: 'Stop snacking',
        frequency: 'daily',
        subtype: 'break_habit',
        ai_placed: false,
        triggers_json: ['Stress', 'Boredom', 'Late night'],
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.triggers_json).toEqual(['Stress', 'Boredom', 'Late night']);
    });

    it('accepts replacement routine fields', () => {
      const payload = {
        name: 'Stop scrolling',
        title: 'Stop scrolling',
        frequency: 'daily',
        subtype: 'break_habit',
        ai_placed: false,
        replacement_habit_id: null,
        replacement_text: 'Read a book for 10 minutes',
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.replacement_text).toBe('Read a book for 10 minutes');
    });

    it('accepts all Break Habit fields together', () => {
      const payload = {
        name: 'Complete break habit',
        title: 'Complete break habit',
        frequency: 'daily',
        subtype: 'break_habit',
        ai_placed: false,
        taper_plan: {
          baselineCount: 10,
          baselinePeriod: 'week',
          targetCount: 2,
          targetPeriod: 'week',
          strategy: 'step_down',
        },
        triggers_json: ['Morning', 'After meals'],
        replacement_habit_id: null,
        replacement_text: 'Drink water',
        reminders_json: [{ id: '1', time: '10:00', days: 'every_day' }],
        notes: 'Breaking this habit gradually',
        tags: ['health'],
        start_date: '2025-10-20',
      };

      const result = habitInsertSchema.parse(payload);
      expect(result).toMatchObject(payload);
    });
  });

  describe('Schema Edge Cases', () => {
    it('accepts undefined optional fields', () => {
      const payload = {
        name: 'Simple habit',
        title: 'Simple habit',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        // All optional fields omitted
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.reminders_json).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it('accepts null for nullable fields', () => {
      const payload = {
        name: 'Habit with nulls',
        title: 'Habit with nulls',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        notes: null,
        tags: null,
        buddy_id: null,
        start_date: null,
        taper_plan: null,
        triggers_json: null,
      };

      const result = habitInsertSchema.parse(payload);
      expect(result.notes).toBeNull();
      expect(result.tags).toBeNull();
    });

    it('rejects invalid email in buddy_email', () => {
      const payload = {
        name: 'Test',
        title: 'Test',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        buddy_email: 'not-an-email',
      };

      expect(() => habitInsertSchema.parse(payload)).toThrow();
    });

    it('rejects invalid stack_position', () => {
      const payload = {
        name: 'Test',
        title: 'Test',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        stack_position: 'invalid',
      };

      expect(() => habitInsertSchema.parse(payload)).toThrow();
    });
  });
});
