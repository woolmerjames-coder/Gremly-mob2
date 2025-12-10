/**
 * Tests for Zod schema field preservation
 *
 * Critical: Tests that Make Actionable fields are preserved through parse()
 * This was a bug where noteZ was stripping is_favorite, has_list, list_items
 */

import { noteZ, todoZ, noteInsertSchema, todoInsertSchema } from '../schemas';

describe('noteZ read schema - Make Actionable fields', () => {
  // Base valid note for testing
  const baseNote = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'note' as const,
    title: 'Test Note',
    body: 'Test body content',
    subtype: 'catchall' as const,
    ai_placed: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-123',
  };

  describe('is_favorite field', () => {
    it('preserves is_favorite: true through parse', () => {
      const input = { ...baseNote, is_favorite: true };
      const result = noteZ.parse(input);
      expect(result.is_favorite).toBe(true);
    });

    it('preserves is_favorite: false through parse', () => {
      const input = { ...baseNote, is_favorite: false };
      const result = noteZ.parse(input);
      expect(result.is_favorite).toBe(false);
    });

    it('accepts undefined is_favorite', () => {
      const input = { ...baseNote };
      const result = noteZ.parse(input);
      expect(result.is_favorite).toBeUndefined();
    });
  });

  describe('has_list field', () => {
    it('preserves has_list: true through parse', () => {
      const input = { ...baseNote, has_list: true };
      const result = noteZ.parse(input);
      expect(result.has_list).toBe(true);
    });

    it('preserves has_list: false through parse', () => {
      const input = { ...baseNote, has_list: false };
      const result = noteZ.parse(input);
      expect(result.has_list).toBe(false);
    });

    it('accepts undefined has_list', () => {
      const input = { ...baseNote };
      const result = noteZ.parse(input);
      expect(result.has_list).toBeUndefined();
    });
  });

  describe('list_items field', () => {
    it('preserves list_items array through parse', () => {
      const listItems = [
        { id: 'item-1', text: 'First item', checked: false },
        { id: 'item-2', text: 'Second item', checked: true },
        { id: 'item-3', text: 'Third item', checked: false },
      ];
      const input = { ...baseNote, list_items: listItems };
      const result = noteZ.parse(input);

      expect(result.list_items).toHaveLength(3);
      expect(result.list_items![0]).toEqual({ id: 'item-1', text: 'First item', checked: false });
      expect(result.list_items![1]).toEqual({ id: 'item-2', text: 'Second item', checked: true });
      expect(result.list_items![2]).toEqual({ id: 'item-3', text: 'Third item', checked: false });
    });

    it('preserves list_items: null through parse', () => {
      const input = { ...baseNote, list_items: null };
      const result = noteZ.parse(input);
      expect(result.list_items).toBeNull();
    });

    it('accepts undefined list_items', () => {
      const input = { ...baseNote };
      const result = noteZ.parse(input);
      expect(result.list_items).toBeUndefined();
    });

    it('preserves empty list_items array', () => {
      const input = { ...baseNote, list_items: [] };
      const result = noteZ.parse(input);
      expect(result.list_items).toEqual([]);
    });
  });

  describe('combined Make Actionable fields', () => {
    it('preserves all Make Actionable fields together', () => {
      const input = {
        ...baseNote,
        is_favorite: true,
        has_list: true,
        list_items: [
          { id: '1', text: 'Pack passport', checked: true },
          { id: '2', text: 'Book hotel', checked: false },
        ],
      };

      const result = noteZ.parse(input);

      expect(result.is_favorite).toBe(true);
      expect(result.has_list).toBe(true);
      expect(result.list_items).toHaveLength(2);
      expect(result.list_items![0].checked).toBe(true);
      expect(result.list_items![1].checked).toBe(false);
    });

    it('does NOT strip Make Actionable fields (regression test for bug)', () => {
      // This is the critical regression test
      // Before the fix, noteZ.parse() was stripping these fields
      const dbResponse = {
        ...baseNote,
        is_favorite: true,
        has_list: true,
        list_items: [{ id: '1', text: 'Test', checked: false }],
        // Include other fields that might come from DB
        space_id: 'space-123',
        origin: 'catchall',
      };

      const parsed = noteZ.parse(dbResponse);

      // These should NOT be undefined after parse
      expect(parsed.is_favorite).toBeDefined();
      expect(parsed.has_list).toBeDefined();
      expect(parsed.list_items).toBeDefined();

      // Verify actual values
      expect(parsed.is_favorite).toBe(true);
      expect(parsed.has_list).toBe(true);
      expect(parsed.list_items).toHaveLength(1);
    });
  });
});

describe('todoZ read schema - source_note_id field', () => {
  const baseTodo = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'todo' as const,
    name: 'Test Todo',
    ai_placed: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-123',
  };

  it('preserves source_note_id UUID through parse', () => {
    const input = {
      ...baseTodo,
      source_note_id: '456e7890-e89b-12d3-a456-426614174000',
    };
    const result = todoZ.parse(input);
    expect(result.source_note_id).toBe('456e7890-e89b-12d3-a456-426614174000');
  });

  it('preserves source_note_id: null through parse', () => {
    const input = { ...baseTodo, source_note_id: null };
    const result = todoZ.parse(input);
    expect(result.source_note_id).toBeNull();
  });

  it('accepts undefined source_note_id', () => {
    const input = { ...baseTodo };
    const result = todoZ.parse(input);
    expect(result.source_note_id).toBeUndefined();
  });

  it('does NOT strip source_note_id field (regression test)', () => {
    const dbResponse = {
      ...baseTodo,
      source_note_id: '789e0123-e89b-12d3-a456-426614174000',
      space_id: 'space-123',
      due_day: '2025-01-15',
    };

    const parsed = todoZ.parse(dbResponse);

    expect(parsed.source_note_id).toBeDefined();
    expect(parsed.source_note_id).toBe('789e0123-e89b-12d3-a456-426614174000');
  });
});

describe('noteInsertSchema - Make Actionable fields', () => {
  it('accepts is_favorite in insert schema', () => {
    const input = { title: 'Test', is_favorite: true };
    const result = noteInsertSchema.parse(input);
    expect(result.is_favorite).toBe(true);
  });

  it('accepts has_list in insert schema', () => {
    const input = { title: 'Test', has_list: true };
    const result = noteInsertSchema.parse(input);
    expect(result.has_list).toBe(true);
  });

  it('accepts list_items array in insert schema', () => {
    const input = {
      title: 'Test',
      list_items: [{ id: '1', text: 'Item', checked: false }],
    };
    const result = noteInsertSchema.parse(input);
    expect(result.list_items).toHaveLength(1);
  });
});

describe('todoInsertSchema - source_note_id field', () => {
  it('accepts valid UUID for source_note_id', () => {
    const input = {
      name: 'Test todo',
      source_note_id: '123e4567-e89b-12d3-a456-426614174000',
    };
    const result = todoInsertSchema.parse(input);
    expect(result.source_note_id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('accepts null for source_note_id', () => {
    const input = { name: 'Test todo', source_note_id: null };
    const result = todoInsertSchema.parse(input);
    expect(result.source_note_id).toBeNull();
  });

  it('rejects invalid UUID for source_note_id', () => {
    const input = { name: 'Test todo', source_note_id: 'not-a-uuid' };
    expect(() => todoInsertSchema.parse(input)).toThrow();
  });
});
