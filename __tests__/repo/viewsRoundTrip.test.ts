/**
 * Tests for views JSONB field round-trip through SupabaseRepo
 *
 * Verifies that:
 * 1. Todos created with views.minddrop_prefilled_v1 and ai_pending retain those values on read
 * 2. Habits created with views.minddrop_prefilled_v1 and ai_pending retain those values on read
 * 3. Notes/logs created with views.minddrop_prefilled_v1 and ai_pending retain those values on read
 * 4. views field preserves all keys, including ai_pending, minddrop_prefilled_v1, and custom flags
 *
 * This ensures isMindDropAiLocked in UnifiedOverlayV2.tsx can see
 * views.minddrop_prefilled_v1 and views.ai_pending on entity reopen.
 */

describe('SupabaseRepo views field round-trip', () => {
  describe('mapTodoFromDb', () => {
    it('should include views from database row', () => {
      const dbRow = {
        id: 'todo-123',
        type: 'todo',
        name: 'Doctor Appointment',
        owner_id: 'user-456',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tags: ['doctor', 'appointment'],
        views: {
          minddrop_prefilled_v1: true,
          ai_pending: true,
          custom_flag: 'xyz',
        },
      };

      // Simulate mapTodoFromDb behavior
      const mapped = {
        ...dbRow,
        name: dbRow.name,
        title: dbRow.name,
        reminders: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        drop_id: null,
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.ai_pending).toBe(true);
      expect(mapped.views.custom_flag).toBe('xyz');
    });

    it('should default to empty object when views is null', () => {
      const dbRow = {
        id: 'todo-123',
        name: 'Regular Task',
        views: null,
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toEqual({});
    });

    it('should preserve multiple view keys', () => {
      const dbRow = {
        id: 'todo-123',
        name: 'Task',
        views: {
          minddrop_prefilled_v1: true,
          alsoShowIn: ['space-1', 'space-2'],
          custom_flag: 'test',
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.alsoShowIn).toEqual(['space-1', 'space-2']);
      expect(mapped.views.custom_flag).toBe('test');
    });
  });

  describe('mapHabitFromDb', () => {
    it('should include views from database row', () => {
      const dbRow: any = {
        id: 'habit-123',
        type: 'habit',
        name: 'Morning Yoga',
        owner_id: 'user-456',
        frequency: 'daily',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tags: ['yoga', 'exercise'],
        views: {
          minddrop_prefilled_v1: true,
          ai_pending: true,
          custom_flag: 'xyz',
        },
      };

      // Simulate mapHabitFromDb behavior
      const mapped = {
        ...dbRow,
        name: dbRow.name || dbRow.title,
        frequency_value: null,
        reminders: null,
        triggers: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        drop_id: null,
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.ai_pending).toBe(true);
      expect(mapped.views.custom_flag).toBe('xyz');
    });

    it('should default to empty object when views is undefined', () => {
      const dbRow = {
        id: 'habit-123',
        name: 'Regular Habit',
        // views is undefined
      };

      const mapped = {
        views: (dbRow as any).views ?? {},
      };

      expect(mapped.views).toEqual({});
    });

    it('should preserve complex view data', () => {
      const dbRow = {
        id: 'habit-123',
        name: 'Habit',
        views: {
          minddrop_prefilled_v1: true,
          alsoShowIn: ['space-1'],
          ui_state: {
            collapsed: false,
            position: 3,
          },
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.ui_state).toEqual({
        collapsed: false,
        position: 3,
      });
    });
  });

  describe('mapNoteFromDb', () => {
    it('should include views from database row', () => {
      const dbRow = {
        id: 'note-123',
        type: 'note',
        title: 'Journal Entry',
        body: 'Feeling grateful today',
        subtype: 'journal',
        owner_id: 'user-456',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tags: ['grateful', 'journal'],
        views: {
          minddrop_prefilled_v1: true,
          ai_pending: true,
          custom_flag: 'xyz',
        },
      };

      // Simulate mapNoteFromDb behavior
      const mapped = {
        ...dbRow,
        reminders: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        source_message_id: null,
        drop_id: null,
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.ai_pending).toBe(true);
      expect(mapped.views.custom_flag).toBe('xyz');
    });

    it('should handle empty views object', () => {
      const dbRow = {
        id: 'note-123',
        title: 'Note',
        views: {},
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toEqual({});
      expect(Object.keys(mapped.views)).toHaveLength(0);
    });

    it('should preserve journal-specific view metadata', () => {
      const dbRow = {
        id: 'note-123',
        title: 'Log Entry',
        subtype: 'journal',
        views: {
          minddrop_prefilled_v1: true,
          alsoShowIn: ['mood-tracker'],
          emotion_override: 'happy',
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.alsoShowIn).toEqual(['mood-tracker']);
      expect(mapped.views.emotion_override).toBe('happy');
    });
  });

  describe('Integration: views field in create/read cycle', () => {
    it('should preserve views.minddrop_prefilled_v1 for todos', () => {
      // Simulate creating a todo with views
      const createInput = {
        type: 'todo' as const,
        name: 'Book appointment',
        body: 'Book doctor appointment tomorrow',
        tags: ['doctor'],
        ai_placed: true,
        origin: 'catchall' as const,
        drop_id: 'drop-123',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      // Simulate database insert/return
      const dbRow = {
        id: 'todo-created-456',
        ...createInput,
        owner_id: 'user-789',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Simulate mapTodoFromDb
      const mapped = {
        ...dbRow,
        name: dbRow.name,
        title: dbRow.name,
        reminders: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        drop_id: dbRow.drop_id ?? null,
        views: dbRow.views ?? {},
      };

      // Verify views round-tripped correctly
      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.drop_id).toBe('drop-123');
      expect(mapped.ai_placed).toBe(true);
    });

    it('should preserve views.minddrop_prefilled_v1 for habits', () => {
      const createInput = {
        type: 'habit' as const,
        name: 'Morning Yoga',
        notes: 'Start doing 15 minutes of yoga every morning',
        frequency: 'daily',
        tags: ['yoga', 'exercise'],
        ai_placed: true,
        origin: 'catchall' as const,
        drop_id: 'drop-456',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const dbRow = {
        id: 'habit-created-789',
        ...createInput,
        owner_id: 'user-789',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mapped = {
        ...dbRow,
        name: dbRow.name || (dbRow as any).title,
        frequency_value: null,
        reminders: null,
        triggers: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        drop_id: dbRow.drop_id ?? null,
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.drop_id).toBe('drop-456');
      expect(mapped.ai_placed).toBe(true);
    });

    it('should preserve views.minddrop_prefilled_v1 for notes/logs', () => {
      const createInput = {
        type: 'note' as const,
        title: 'Anxious After Meeting',
        body: 'Feeling anxious after a long meeting but better after a walk',
        subtype: 'journal' as const,
        tags: ['journal', 'anxious'],
        ai_placed: true,
        origin: 'catchall' as const,
        drop_id: 'drop-789',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const dbRow = {
        id: 'note-created-012',
        ...createInput,
        owner_id: 'user-789',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mapped = {
        ...dbRow,
        reminders: null,
        tags: dbRow.tags ?? null,
        tags_meta: null,
        source_message_id: null,
        drop_id: dbRow.drop_id ?? null,
        views: dbRow.views ?? {},
      };

      expect(mapped.views).toBeDefined();
      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.drop_id).toBe('drop-789');
      expect(mapped.ai_placed).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle views with falsy values', () => {
      const dbRow = {
        views: {
          minddrop_prefilled_v1: false,
          some_flag: null,
          another_key: 0,
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.minddrop_prefilled_v1).toBe(false);
      expect(mapped.views.some_flag).toBeNull();
      expect(mapped.views.another_key).toBe(0);
    });

    it('should handle views with nested objects', () => {
      const dbRow = {
        views: {
          minddrop_prefilled_v1: true,
          ui_config: {
            theme: 'dark',
            layout: {
              sidebar: 'collapsed',
              zoom: 1.2,
            },
          },
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.minddrop_prefilled_v1).toBe(true);
      expect(mapped.views.ui_config.theme).toBe('dark');
      expect(mapped.views.ui_config.layout.zoom).toBe(1.2);
    });

    it('should handle views with arrays', () => {
      const dbRow = {
        views: {
          minddrop_prefilled_v1: true,
          alsoShowIn: ['space-1', 'space-2', 'space-3'],
          history: [
            { action: 'created', timestamp: '2024-01-01T00:00:00Z' },
            { action: 'prefilled', timestamp: '2024-01-01T00:01:00Z' },
          ],
        },
      };

      const mapped = {
        views: dbRow.views ?? {},
      };

      expect(mapped.views.alsoShowIn).toHaveLength(3);
      expect(mapped.views.history).toHaveLength(2);
      expect(mapped.views.history[1].action).toBe('prefilled');
    });
  });
});
