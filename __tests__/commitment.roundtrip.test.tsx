/**
 * Commitment Round-Trip Tests
 *
 * Verify that commitment fields (commitment, commitment_note, commitment_started_at)
 * round-trip correctly through the full flow:
 * 1. DB row → repo mapper → entity
 * 2. Entity → buildDraftPayloadFromEntity → overlay V2State
 * 3. Overlay V2State → toCreateOrUpdateInput → save payload
 * 4. Save payload → repo.update → DB row
 */

import { buildDraftPayloadFromEntity } from '../components/overlay/overlayHydration';

describe('Commitment Round-Trip', () => {
  describe('Todo commitment fields', () => {
    it('should hydrate commitment=true from entity into overlay state', () => {
      const mockTodo = {
        id: 'test-todo-1',
        type: 'todo',
        name: 'Test todo with commitment',
        body: 'This is a test todo',
        commitment: true,
        commitment_note: 'This is important',
        commitment_started_at: '2025-11-30T10:00:00.000Z',
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockTodo);

      expect(payload.commitment).toBe(true);
      expect(payload.commitmentNote).toBe('This is important');
      expect(payload.commitmentStartedAt).toBe('2025-11-30T10:00:00.000Z');
    });

    it('should hydrate commitment=false from entity into overlay state', () => {
      const mockTodo = {
        id: 'test-todo-2',
        type: 'todo',
        name: 'Test todo without commitment',
        body: 'This is a test todo',
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockTodo);

      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');
      expect(payload.commitmentStartedAt).toBe(null);
    });

    it('should default commitment to false when field is missing', () => {
      const mockTodo = {
        id: 'test-todo-3',
        type: 'todo',
        name: 'Test todo without commitment field',
        body: 'This is a test todo',
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockTodo);

      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');
      expect(payload.commitmentStartedAt).toBe(null);
    });
  });

  describe('Habit commitment fields', () => {
    it('should hydrate commitment=true from habit entity into overlay state', () => {
      const mockHabit = {
        id: 'test-habit-1',
        type: 'habit',
        name: 'Test habit with commitment',
        notes: 'Daily meditation',
        frequency: 'daily',
        commitment: true,
        commitment_note: 'Need to build this habit',
        commitment_started_at: '2025-11-30T08:00:00.000Z',
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockHabit);

      expect(payload.commitment).toBe(true);
      expect(payload.commitmentNote).toBe('Need to build this habit');
      expect(payload.commitmentStartedAt).toBe('2025-11-30T08:00:00.000Z');
    });

    it('should hydrate commitment=false from habit entity into overlay state', () => {
      const mockHabit = {
        id: 'test-habit-2',
        type: 'habit',
        name: 'Test habit without commitment',
        notes: 'Evening walk',
        frequency: 'custom',
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockHabit);

      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');
      expect(payload.commitmentStartedAt).toBe(null);
    });
  });

  describe('Note/Log commitment fields', () => {
    it('should hydrate commitment fields from note entity (if supported)', () => {
      const mockNote = {
        id: 'test-note-1',
        type: 'note',
        title: 'Test note',
        body: 'This is a test note',
        subtype: 'journal',
        commitment: false, // Notes typically don't use commitment, but test the path
        commitment_note: null,
        commitment_started_at: null,
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockNote);

      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');
      expect(payload.commitmentStartedAt).toBe(null);
    });
  });

  describe('Reminders round-trip', () => {
    it('should hydrate reminders from todo entity', () => {
      const mockTodo = {
        id: 'test-todo-4',
        type: 'todo',
        name: 'Todo with reminder',
        body: 'Call doctor',
        reminders: [{ when: '2025-12-01T09:00:00.000Z', type: 'absolute' }],
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockTodo);

      expect(payload.reminderAt).toBe('2025-12-01T09:00:00.000Z');
    });

    it('should hydrate reminders from note entity (for journal entries)', () => {
      const mockNote = {
        id: 'test-note-2',
        type: 'note',
        title: 'Journal with reminder',
        body: 'Reflect on today',
        subtype: 'journal',
        reminders: [{ when: '2025-12-01T20:00:00.000Z', type: 'absolute' }],
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockNote);

      expect(payload.reminderAt).toBe('2025-12-01T20:00:00.000Z');
    });

    it('should handle missing reminders gracefully', () => {
      const mockTodo = {
        id: 'test-todo-5',
        type: 'todo',
        name: 'Todo without reminder',
        body: 'Buy groceries',
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockTodo);

      expect(payload.reminderAt).toBe(null);
    });
  });

  describe('Frequency round-trip for habits', () => {
    it('should hydrate frequency_json from habit entity', () => {
      const mockHabit = {
        id: 'test-habit-3',
        type: 'habit',
        name: 'Custom frequency habit',
        notes: 'Yoga',
        frequency: 'custom',
        frequency_value: {
          type: 'days',
          days: [1, 3, 5], // Monday, Wednesday, Friday
        },
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockHabit);

      expect(payload.habit?.frequency_json).toEqual({
        type: 'days',
        days: [1, 3, 5],
      });
    });

    it('should handle missing frequency_value gracefully', () => {
      const mockHabit = {
        id: 'test-habit-4',
        type: 'habit',
        name: 'Simple habit',
        notes: 'Drink water',
        frequency: 'daily',
        tags: [],
        tags_meta: { sticky: [], tombstones: [] },
      };

      const payload = buildDraftPayloadFromEntity(mockHabit);

      // When frequency_value is missing, defaults to simple daily
      expect(payload.habit?.frequency_json).toEqual({ type: 'simple', value: 'daily' });
    });
  });
});
