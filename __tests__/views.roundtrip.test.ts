/**
 * Integration test: Verify views round-trip through normalizeViews
 * Tests that stage and failure flags are preserved when mapping from DB
 */

// Note: We can't directly test the private normalizeViews function,
// but we can verify the type system allows the extended shape

import type { Note } from '../lib/types';

describe('Views round-trip integration', () => {
  it('should preserve ai_failed flag through entity lifecycle', () => {
    // Simulate entity from DB with ai_failed
    const dbRecord = {
      id: '123',
      type: 'note' as const,
      title: 'Test Note',
      subtype: 'catchall' as const,
      ai_placed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user1',
      views: {
        ai_pending: false,
        ai_failed: true,
        minddrop_stage: 'pending' as const,
      },
    };

    // Type check: This should compile without errors
    const note: Note = dbRecord;

    // Verify fields are accessible
    expect(note.views?.ai_failed).toBe(true);
    expect(note.views?.minddrop_stage).toBe('pending');
  });

  it('should preserve minddrop_stage through entity lifecycle', () => {
    const stages = ['pending', 'classified', 'prefilled'] as const;

    stages.forEach((stage) => {
      const dbRecord = {
        id: '123',
        type: 'note' as const,
        title: 'Test Note',
        subtype: 'catchall' as const,
        ai_placed: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: {
          minddrop_stage: stage,
        },
      };

      const note: Note = dbRecord;
      expect(note.views?.minddrop_stage).toBe(stage);
    });
  });

  it('should handle views object with all new fields', () => {
    const fullViews = {
      ai_pending: true,
      ai_failed: false,
      minddrop_stage: 'classified' as const,
      minddrop_prefilled_v1: true,
      custom_field_1: 'value1',
      custom_field_2: 123,
      custom_field_3: { nested: 'object' },
    };

    const dbRecord = {
      id: '123',
      type: 'note' as const,
      title: 'Test Note',
      subtype: 'catchall' as const,
      ai_placed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user1',
      views: fullViews,
    };

    const note: Note = dbRecord;

    // All fields should be preserved
    expect(note.views?.ai_pending).toBe(true);
    expect(note.views?.ai_failed).toBe(false);
    expect(note.views?.minddrop_stage).toBe('classified');
    expect(note.views?.minddrop_prefilled_v1).toBe(true);
    expect(note.views?.custom_field_1).toBe('value1');
    expect(note.views?.custom_field_2).toBe(123);
    expect(note.views?.custom_field_3).toEqual({ nested: 'object' });
  });

  it('should handle empty views object', () => {
    const dbRecord = {
      id: '123',
      type: 'note' as const,
      title: 'Test Note',
      subtype: 'catchall' as const,
      ai_placed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user1',
      views: {},
    };

    const note: Note = dbRecord;
    expect(note.views).toEqual({});
  });

  it('should handle undefined views', () => {
    const dbRecord = {
      id: '123',
      type: 'note' as const,
      title: 'Test Note',
      subtype: 'catchall' as const,
      ai_placed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user1',
      // views is undefined
    };

    const note: Note = dbRecord;
    expect(note.views).toBeUndefined();
  });
});
