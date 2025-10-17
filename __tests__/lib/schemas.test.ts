import { habitZ, todoZ, noteZ, recordZ } from '../../lib/schemas';

describe('schemas', () => {
  test('habit validates', () => {
    const h = habitZ.parse({
      id: 'h1',
      type: 'habit',
      title: 'Run',
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
      title: 'Call dentist',
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
});
