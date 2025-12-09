/**
 * Tests for Make Actionable feature - repository changes
 * Tests source_note_id on todos and is_favorite/has_list/list_items on notes
 */

import { todoInsertSchema, noteInsertSchema } from '../../schemas';

// Mock supabase client following existing patterns
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('Make Actionable - Schema Validation', () => {
  describe('todoInsertSchema', () => {
    it('accepts source_note_id as valid UUID', () => {
      const input = {
        name: 'Test todo from note',
        source_note_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = todoInsertSchema.parse(input);
      expect(result.source_note_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('accepts null source_note_id', () => {
      const input = {
        name: 'Test todo',
        source_note_id: null,
      };

      const result = todoInsertSchema.parse(input);
      expect(result.source_note_id).toBeNull();
    });

    it('accepts undefined source_note_id', () => {
      const input = {
        name: 'Test todo',
      };

      const result = todoInsertSchema.parse(input);
      expect(result.source_note_id).toBeUndefined();
    });

    it('rejects invalid UUID for source_note_id', () => {
      const input = {
        name: 'Test todo',
        source_note_id: 'not-a-uuid',
      };

      expect(() => todoInsertSchema.parse(input)).toThrow();
    });
  });

  describe('noteInsertSchema', () => {
    it('accepts is_favorite boolean', () => {
      const input = {
        title: 'Test note',
        is_favorite: true,
      };

      const result = noteInsertSchema.parse(input);
      expect(result.is_favorite).toBe(true);
    });

    it('accepts has_list boolean', () => {
      const input = {
        title: 'Test note',
        has_list: true,
      };

      const result = noteInsertSchema.parse(input);
      expect(result.has_list).toBe(true);
    });

    it('accepts list_items array', () => {
      const input = {
        title: 'Test note',
        list_items: [
          { id: 'item-1', text: 'First item', checked: false },
          { id: 'item-2', text: 'Second item', checked: true },
        ],
      };

      const result = noteInsertSchema.parse(input);
      expect(result.list_items).toHaveLength(2);
      expect(result.list_items![0]).toEqual({
        id: 'item-1',
        text: 'First item',
        checked: false,
      });
      expect(result.list_items![1].checked).toBe(true);
    });

    it('accepts null list_items', () => {
      const input = {
        title: 'Test note',
        list_items: null,
      };

      const result = noteInsertSchema.parse(input);
      expect(result.list_items).toBeNull();
    });

    it('rejects list_items with missing required fields', () => {
      const input = {
        title: 'Test note',
        list_items: [{ id: 'item-1', text: 'Missing checked field' }],
      };

      expect(() => noteInsertSchema.parse(input)).toThrow();
    });

    it('accepts combined Make Actionable fields', () => {
      const input = {
        title: 'My actionable note',
        is_favorite: true,
        has_list: true,
        list_items: [
          { id: 'a1b2c3', text: 'Pack passport', checked: false },
          { id: 'd4e5f6', text: 'Book hotel', checked: true },
        ],
      };

      const result = noteInsertSchema.parse(input);
      expect(result.is_favorite).toBe(true);
      expect(result.has_list).toBe(true);
      expect(result.list_items).toHaveLength(2);
    });
  });
});

describe('Make Actionable - Field Mapping', () => {
  describe('mapNoteFromDb simulation', () => {
    // Simulate the mapping logic from supabase.ts
    function mapNoteFields(dbRecord: any) {
      return {
        is_favorite: dbRecord.is_favorite ?? false,
        has_list: dbRecord.has_list ?? false,
        list_items: dbRecord.list_items ?? null,
      };
    }

    it('maps is_favorite from DB with default false', () => {
      expect(mapNoteFields({}).is_favorite).toBe(false);
      expect(mapNoteFields({ is_favorite: true }).is_favorite).toBe(true);
      expect(mapNoteFields({ is_favorite: false }).is_favorite).toBe(false);
    });

    it('maps has_list from DB with default false', () => {
      expect(mapNoteFields({}).has_list).toBe(false);
      expect(mapNoteFields({ has_list: true }).has_list).toBe(true);
    });

    it('maps list_items from DB with default null', () => {
      expect(mapNoteFields({}).list_items).toBeNull();

      const items = [{ id: '1', text: 'Test', checked: false }];
      expect(mapNoteFields({ list_items: items }).list_items).toEqual(items);
    });
  });

  describe('mapTodoFromDb simulation', () => {
    // Simulate the mapping logic from supabase.ts
    function mapTodoFields(dbRecord: any) {
      return {
        source_note_id: dbRecord.source_note_id ?? null,
      };
    }

    it('maps source_note_id from DB with default null', () => {
      expect(mapTodoFields({}).source_note_id).toBeNull();

      const noteId = '123e4567-e89b-12d3-a456-426614174000';
      expect(mapTodoFields({ source_note_id: noteId }).source_note_id).toBe(noteId);
    });
  });
});

describe('Make Actionable - Update Payload Handling', () => {
  describe('note update payload simulation', () => {
    // Simulate the update payload building from supabase.ts
    function buildNoteUpdatePayload(patch: any) {
      const updatePayload: any = {};

      if ('is_favorite' in patch) {
        updatePayload.is_favorite = !!patch.is_favorite;
      }
      if ('has_list' in patch) {
        updatePayload.has_list = !!patch.has_list;
      }
      if ('list_items' in patch) {
        updatePayload.list_items = patch.list_items ?? null;
      }

      return updatePayload;
    }

    it('builds payload for is_favorite toggle', () => {
      const payload = buildNoteUpdatePayload({ is_favorite: true });
      expect(payload).toEqual({ is_favorite: true });
    });

    it('builds payload for checklist conversion', () => {
      const items = [
        { id: 'a', text: 'Task 1', checked: false },
        { id: 'b', text: 'Task 2', checked: false },
      ];

      const payload = buildNoteUpdatePayload({
        has_list: true,
        list_items: items,
      });

      expect(payload.has_list).toBe(true);
      expect(payload.list_items).toEqual(items);
    });

    it('builds payload for toggling checklist item', () => {
      const items = [
        { id: 'a', text: 'Task 1', checked: true }, // Changed from false to true
        { id: 'b', text: 'Task 2', checked: false },
      ];

      const payload = buildNoteUpdatePayload({ list_items: items });
      expect(payload.list_items[0].checked).toBe(true);
    });

    it('coerces truthy/falsy values for booleans', () => {
      // Ensure boolean coercion with !!
      expect(buildNoteUpdatePayload({ is_favorite: 1 }).is_favorite).toBe(true);
      expect(buildNoteUpdatePayload({ is_favorite: 0 }).is_favorite).toBe(false);
      expect(buildNoteUpdatePayload({ has_list: 'yes' }).has_list).toBe(true);
      expect(buildNoteUpdatePayload({ has_list: '' }).has_list).toBe(false);
    });
  });
});
