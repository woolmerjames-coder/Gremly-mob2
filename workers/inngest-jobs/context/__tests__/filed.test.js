/**
 * @jest-environment node
 *
 * What is filed in a World or a Chapter (context/filed.js, data fabric stage
 * 4b): an item is marked private or about health from every fact the reader
 * took from it, not only the facts a writer is given, and says whether the
 * reader has read it at all.
 */
import { markItems, readItemMarks, readItemSources, itemRead, loadFiled } from '../filed.js';
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

  it('reads every place a fact was taken from, a page at a time, so none is cut off', async () => {
    const page = (n, from) =>
      Array.from({ length: n }, (_, i) => ({
        fact_id: `f-${from + i}`,
        source_table: 'todos',
        source_id: T1,
      }));
    const d = fakeD([
      [
        'life_fact_sources?',
        (path) => (/offset=0(&|$)/.test(path) ? page(1000, 0) : page(3, 1000)),
      ],
      [
        'life_facts?',
        (path) => (path.includes('f-1002') ? [{ id: 'f-1002', private: true, health: false }] : []),
      ],
    ]);
    const { marks, sourced } = await readItemSources(d, U, [{ type: 'todo', id: T1 }]);
    expect(d.calls.filter((c) => c.startsWith('life_fact_sources?'))).toHaveLength(2);
    expect(marks.get(`todos:${T1}`)).toEqual({ private: true, health: false });
    expect(sourced.has(`todos:${T1}`)).toBe(true);
  });

  it('asks nothing for no items', async () => {
    const d = fakeD([]);
    expect((await readItemMarks(d, U, [])).size).toBe(0);
    expect(d.calls).toEqual([]);
  });
});

describe('whether the reader has read an item', () => {
  const reading = {
    readThrough: '2026-10-07T12:00:00Z',
    forgotAt: null,
    sourced: new Set(),
  };
  const todo = (changed_at) => ({ type: 'todo', id: T1, changed_at });

  it('has, when it last changed at or before the reader’s cursor', () => {
    expect(itemRead(todo('2026-10-07T11:00:00Z'), reading)).toBe(true);
    expect(itemRead(todo('2026-10-07T12:00:00Z'), reading)).toBe(true);
    expect(itemRead(todo('2026-10-07T12:30:00Z'), reading)).toBe(false);
    expect(itemRead(todo(null), reading)).toBe(false);
    expect(itemRead(todo('2026-10-07T11:00:00Z'), { ...reading, readThrough: null })).toBe(false);
  });

  it('has not, for what came before Forget Everything, unless facts were taken from it since', () => {
    const forgot = { ...reading, forgotAt: '2026-10-06T00:00:00Z' };
    expect(itemRead(todo('2026-10-05T09:00:00Z'), forgot)).toBe(false);
    expect(itemRead(todo('2026-10-06T09:00:00Z'), forgot)).toBe(true);
    expect(
      itemRead(todo('2026-10-05T09:00:00Z'), { ...forgot, sourced: new Set([`todos:${T1}`]) }),
    ).toBe(true);
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
      ['ledger_cursor?', [{ read_through: '2026-10-07T00:00:00Z' }]],
      ['events?', []],
    ]);
    db.mockReturnValue(d);
    const got = await loadFiled({}, U, { table: 'worlds', id: 'w-1' });
    expect(got.items).toEqual([
      expect.objectContaining({ id: T1, health: true, private: false, placed: false, read: true }),
      expect.objectContaining({ id: T2, health: false, private: false, placed: true, read: true }),
    ]);
  });

  it('says an item changed since the reader last read, or from before a Forget, is not read', async () => {
    const d = fakeD([
      [
        'drop_world_links?',
        [
          { drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' },
          { drop_id: T2, drop_type: 'todo', assigned_by: 'classifier' },
        ],
      ],
      [
        'todos?',
        [
          // changed after the reader's cursor
          {
            id: T1,
            name: 'New todo',
            created_at: '2026-10-07T09:00:00Z',
            updated_at: '2026-10-07T13:00:00Z',
          },
          // from before the person asked Gremly to forget
          { id: T2, name: 'Old todo', created_at: '2026-09-01T09:00:00Z' },
        ],
      ],
      ['ledger_cursor?', [{ read_through: '2026-10-07T12:00:00Z' }]],
      ['events?', [{ created_at: '2026-10-01T00:00:00Z' }]],
    ]);
    db.mockReturnValue(d);
    const got = await loadFiled({}, U, { table: 'worlds', id: 'w-1' });
    expect(got.items.map((i) => [i.id, i.read])).toEqual([
      [T1, false],
      [T2, false],
    ]);
    expect(d.calls.find((c) => c.startsWith('events?'))).toContain('kind=eq.context.forgotten');
  });
});

describe('what was cleared from their list', () => {
  const routes = () => [
    ['drop_world_links?', [{ drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' }]],
    ['todos?', [{ id: T1, name: 'Visit the allotment', created_at: '2026-10-05T09:00:00Z', archived: true }]],
    ['ledger_cursor?', [{ read_through: '2026-10-07T00:00:00Z' }]],
  ];

  it('is read only when asked for, by the reasons the app gives for clearing, and marked so', async () => {
    const d = fakeD(routes());
    db.mockReturnValue(d);
    const got = await loadFiled({}, U, { table: 'worlds', id: 'w-1' }, { cleared: true });
    expect(d.calls.find((c) => c.startsWith('todos?'))).toContain(
      'or=(archived.is.false,archived_reason.in.(swept,mini_sweep,weekly_cleanup))',
    );
    expect(got.items).toEqual([expect.objectContaining({ id: T1, cleared: true, read: true })]);
  });

  it('is left out otherwise, as everything archived is', async () => {
    const d = fakeD(routes());
    db.mockReturnValue(d);
    await loadFiled({}, U, { table: 'worlds', id: 'w-1' });
    const path = d.calls.find((c) => c.startsWith('todos?'));
    expect(path).toContain('&archived=is.false&');
    expect(path).not.toContain('archived_reason');
  });
});
