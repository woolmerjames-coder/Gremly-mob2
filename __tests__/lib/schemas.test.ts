import { habitZ, todoZ, noteZ, recordZ } from '../../lib/schemas';

describe('schemas', () => {
  test('habit validates', () => {
    const h = habitZ.parse({
      id: 'h1',
      type: 'habit',
      name: 'Run',
      subtype: 'start_habit',
      frequency: 'daily',
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user',
    });
    expect(h.frequency).toBe('daily');
  });

  test('todo validates', () => {
    const t = todoZ.parse({
      id: 't1',
      type: 'todo',
      name: 'Call dentist',
      body: null,
      due_date: null,
      undefined_due: true,
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user',
    });
    expect(t.type).toBe('todo');
  });

  test('note (journal) validates', () => {
    const n = noteZ.parse({
      id: 'n1',
      type: 'note',
      title: 'Day 1',
      subtype: 'journal',
      body: 'Hello',
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user',
    });
    expect(n.subtype).toBe('journal');
  });

  test('record union', () => {
    const r = recordZ.parse({
      id: 'x',
      type: 'note',
      title: 'List',
      subtype: 'list',
      body: '- a\n- b',
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'test-user',
    });
    expect(r.type).toBe('note');
  });

  describe('views passthrough', () => {
    test('views with MindDrop fields validates', () => {
      const n = noteZ.parse({
        id: 'n1',
        type: 'note',
        title: 'Test Note',
        subtype: 'catchall',
        body: 'Test body',
        space_id: null,
        ai_placed: false,
        why_string: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'test-user',
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'enriching',
          confirmation_message: 'Got it, noted.',
        },
      });
      expect(n.views?.ai_pending).toBe(true);
      expect(n.views?.minddrop_stage).toBe('enriching');
      expect(n.views?.confirmation_message).toBe('Got it, noted.');
    });

    test('views passthrough allows unknown fields', () => {
      const t = todoZ.parse({
        id: 't1',
        type: 'todo',
        name: 'Test Todo',
        body: null,
        due_date: null,
        undefined_due: true,
        space_id: null,
        ai_placed: false,
        why_string: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'test-user',
        views: {
          alsoShowIn: ['space-1'],
          ai_pending: false,
          minddrop_stage: 'enriched',
          confirmation_message: 'Added to your list.',
          custom_field: 'should be preserved', // Extra field via passthrough
        },
      });
      expect(t.views?.alsoShowIn).toEqual(['space-1']);
      expect(t.views?.minddrop_stage).toBe('enriched');
      // Passthrough preserves unknown fields
      expect((t.views as any)?.custom_field).toBe('should be preserved');
    });

    test('habit with views validates', () => {
      const h = habitZ.parse({
        id: 'h1',
        type: 'habit',
        name: 'Exercise',
        subtype: 'start_habit',
        frequency: 'daily',
        space_id: null,
        ai_placed: false,
        why_string: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'test-user',
        views: {
          ai_pending: false,
          ai_failed: false,
          minddrop_stage: 'enriched',
          minddrop_prefilled_v1: true,
          confirmation_message: 'Habit tracked!',
        },
      });
      expect(h.views?.minddrop_prefilled_v1).toBe(true);
      expect(h.views?.confirmation_message).toBe('Habit tracked!');
    });
  });
});
