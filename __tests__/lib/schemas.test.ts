import { habitZ, todoZ, noteZ, recordZ } from '../../lib/schemas';

describe('schemas', () => {
  test('habit validates', () => {
    const h = habitZ.parse({
      id: 'h1',
      type: 'habit',
      title: 'Run',
      frequency: 'daily',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(h.frequency).toBe('daily');
  });

  test('todo validates', () => {
    const t = todoZ.parse({
      id: 't1',
      type: 'todo',
      title: 'Call dentist',
      dueDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(r.type).toBe('note');
  });
});
