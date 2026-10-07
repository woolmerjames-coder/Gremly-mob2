/**
 * @jest-environment node
 *
 * What is filed in a World or a Chapter (context/filed.js, data fabric stage
 * 4b): an item is marked private or about health from every fact the reader
 * took from it, not only the facts a writer is given.
 */
import { markItems, readItemMarks, loadFiled } from '../filed.js';
import { db } from '../db.js';

jest.mock('../db.js', () => ({ db: jest.fn() }));

const U = 'u-1';
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const N1 = '33333333-3333-4333-8333-333333333333';
const FA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function fakeD(routes) {
  const calls = [];
  return {
    calls,
    select: async (path) => {
      calls.push(path);
      for (const [k, v] of routes)
        if (path.startsWith(k)) return typeof v === 'function' ? v(path) : v;
      return [];
    },
  };
}

describe('marking items', () => {
  it('marks an item from the facts given and from the marks read for it', () => {
    const items = [
      { type: 'todo', id: T1 },
      { type: 'todo', id: T2 },
      { type: 'note', id: N1 },
    ];
    const facts = [{ id: FA, item_table: 'todos', item_id: T1, private: true, health: false }];
    const marks = new Map([[`notes:${N1}`, { private: false, health: true }]]);
    expect(markItems(items, facts, marks)).toEqual([
      { type: 'todo', id: T1, private: true, health: false },
      { type: 'todo', id: T2, private: false, health: false },
      { type: 'note', id: N1, private: false, health: true },
    ]);
  });

  it('reads every fact taken from the items, from any place and in any state, and keeps only the marked', async () => {
    const d = fakeD([
      [
        'life_fact_sources?',
        (path) =>
          path.includes('source_table=eq.todos')
            ? [
                { fact_id: FA, source_table: 'todos', source_id: T1 },
                { fact_id: FB, source_table: 'todos', source_id: T2 },
              ]
            : [{ fact_id: FC, source_table: 'notes', source_id: N1 }],
      ],
      ['life_facts?', [{ id: FC, private: true, health: true }]],
    ]);
    const marks = await readItemMarks(d, U, [
      { type: 'todo', id: T1 },
      { type: 'todo', id: T2 },
      { type: 'note', id: N1 },
    ]);
    expect([...marks.entries()]).toEqual([[`notes:${N1}`, { private: true, health: true }]]);
    const sources = d.calls.filter((c) => c.startsWith('life_fact_sources?'));
    // no role or state is chosen: a fact said in an item marks it as much as one about it
    for (const c of sources) expect(c).not.toMatch(/role=|state=/);
    const read = d.calls.find((c) => c.startsWith('life_facts?'));
    expect(read).toContain(`user_id=eq.${U}`);
    expect(read).toContain('or=(private.is.true,health.is.true)');
    expect(read).not.toMatch(/state=/);
  });

  it('asks nothing for no items', async () => {
    const d = fakeD([]);
    expect((await readItemMarks(d, U, [])).size).toBe(0);
    expect(d.calls).toEqual([]);
  });
});

describe('what is filed', () => {
  it('marks an item private from a fact the writer is not given', async () => {
    const d = fakeD([
      [
        'drop_world_links?',
        [
          { drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' },
          { drop_id: T2, drop_type: 'todo', assigned_by: 'user' },
        ],
      ],
      [
        'todos?',
        [
          { id: T1, name: 'Book the physio', created_at: '2026-10-05T09:00:00Z' },
          { id: T2, name: 'Long run', created_at: '2026-10-04T09:00:00Z' },
        ],
      ],
      // the facts a writer is given hold nothing private
      ['life_facts_now?', []],
      ['life_fact_sources?', [{ fact_id: FA, source_table: 'todos', source_id: T1 }]],
      ['life_facts?', [{ id: FA, private: false, health: true }]],
    ]);
    db.mockReturnValue(d);
    const got = await loadFiled({}, U, { table: 'worlds', id: 'w-1' });
    expect(got.items).toEqual([
      expect.objectContaining({ id: T1, health: true, private: false, placed: false }),
      expect.objectContaining({ id: T2, health: false, private: false, placed: true }),
    ]);
  });
});
