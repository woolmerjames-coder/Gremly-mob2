/**
 * A habit's pause or lighter version, written as one thing (useGremlyStore
 * easeHabit). The table lets no two stretches of one habit overlap, so what is
 * already there gives way in a set order, the way back runs it in reverse, and
 * a step that fails takes the earlier ones back with it.
 */
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

import { useGremlyStore } from '../useGremlyStore';
import { supabase } from '../../supabase/client';

type Row = Record<string, unknown>;

/** Every write, in the order it reached the database. */
let writes: string[];
/** The write that fails, by the words it is kept under, when a test wants one to. */
let failOn: string | null;
let made: number;

const row = (
  id: string,
  mode: string,
  period_start: string,
  period_end: string,
  note = '',
): Row => ({
  id,
  habit_id: 'h1',
  owner_id: 'u1',
  mode,
  period_start,
  period_end,
  floor_note: note || null,
  source_ref: null,
  source_event_id: null,
  created_at: '2026-10-01T09:00:00Z',
});

const rowsNow = () =>
  (useGremlyStore.getState().habitAdaptations as unknown as Row[])
    .map((a) => `${a.id} ${a.mode} ${a.period_start} ${a.period_end}`)
    .sort();

beforeEach(() => {
  writes = [];
  failOn = null;
  made = 0;
  const answer = (what: string, data: Row | null = null) => {
    writes.push(what);
    return what === failOn ? { data: null, error: { message: 'no' } } : { data, error: null };
  };
  (supabase.from as jest.Mock).mockImplementation(() => ({
    delete: () => ({ eq: async (_: string, id: string) => answer(`delete ${id}`) }),
    update: (v: Row) => ({
      eq: async (_: string, id: string) => answer(`update ${id} ${v.period_start} ${v.period_end}`),
    }),
    insert: (v: Row) => ({
      select: () => ({
        single: async () => {
          const id = (v.id as string) ?? `new${++made}`;
          return answer(`insert ${v.mode} ${v.period_start} ${v.period_end}`, { ...v, id });
        },
      }),
    }),
  }));
  useGremlyStore.setState({
    userId: 'u1',
    habitAdaptations: [
      // a lighter version that runs across the week, and a pause inside it
      row('a', 'floor', '2026-10-01', '2026-10-06', 'Ten minute walk'),
      row('b', 'pause', '2026-10-08', '2026-10-09'),
      row('c', 'floor', '2026-10-10', '2026-10-14', 'Ten minute walk'),
      // another habit's, never touched
      { ...row('z', 'pause', '2026-10-05', '2026-10-12'), habit_id: 'h2' },
    ] as never,
  });
});

const pause = { mode: 'pause' as const, first: '2026-10-05', last: '2026-10-11', note: '' };

describe('easing a habit', () => {
  it('removes what is inside the stretch, shortens what reaches in, then adds the new one', async () => {
    const back = await useGremlyStore.getState().easeHabit('h1', pause);
    expect(writes).toEqual([
      'delete b',
      'update a 2026-10-01 2026-10-04',
      'update c 2026-10-12 2026-10-14',
      'insert pause 2026-10-05 2026-10-11',
    ]);
    expect(rowsNow()).toEqual([
      'a floor 2026-10-01 2026-10-04',
      'c floor 2026-10-12 2026-10-14',
      'new1 pause 2026-10-05 2026-10-11',
      'z pause 2026-10-05 2026-10-12',
    ]);
    expect(typeof back).toBe('function');
  });

  it('takes it all back in the reverse order', async () => {
    const before = rowsNow();
    const back = await useGremlyStore.getState().easeHabit('h1', pause);
    writes.length = 0;
    await back!();
    expect(writes).toEqual([
      'delete new1',
      'update c 2026-10-10 2026-10-14',
      'update a 2026-10-01 2026-10-06',
      'insert pause 2026-10-08 2026-10-09',
    ]);
    expect(rowsNow()).toEqual(before);
  });

  it('cuts a stretch that runs across the new one in two', async () => {
    useGremlyStore.setState({
      habitAdaptations: [row('a', 'floor', '2026-10-01', '2026-10-20', 'Ten minute walk')] as never,
    });
    await useGremlyStore
      .getState()
      .easeHabit('h1', { mode: 'pause', first: '2026-10-07', last: '2026-10-08', note: '' });
    expect(writes).toEqual([
      'update a 2026-10-01 2026-10-06',
      'insert floor 2026-10-09 2026-10-20',
      'insert pause 2026-10-07 2026-10-08',
    ]);
  });

  it('ends what is running with usual, and adds nothing', async () => {
    await useGremlyStore
      .getState()
      .easeHabit('h1', { mode: 'usual', first: '2026-10-07', last: '2026-10-14', note: '' });
    expect(writes).toEqual(['delete b', 'delete c']);
    expect(rowsNow()).toEqual(['a floor 2026-10-01 2026-10-06', 'z pause 2026-10-05 2026-10-12']);
  });

  it('writes nothing when it already is that way', async () => {
    const same = await useGremlyStore
      .getState()
      .easeHabit('h1', { mode: 'pause', first: '2026-10-08', last: '2026-10-09', note: '' });
    expect(same).toBeNull();
    expect(writes).toEqual([]);
  });

  it('is all or nothing: a step that fails takes the earlier ones back', async () => {
    const before = rowsNow();
    failOn = 'insert pause 2026-10-05 2026-10-11';
    await expect(useGremlyStore.getState().easeHabit('h1', pause)).rejects.toThrow(/save/);
    expect(rowsNow()).toEqual(before);
    expect(writes.slice(4)).toEqual([
      'update c 2026-10-10 2026-10-14',
      'update a 2026-10-01 2026-10-06',
      'insert pause 2026-10-08 2026-10-09',
    ]);
  });

  it('can be taken back again after a way back that failed part way, doing only what is left', async () => {
    const before = rowsNow();
    const back = await useGremlyStore.getState().easeHabit('h1', pause);
    writes.length = 0;
    failOn = 'update a 2026-10-01 2026-10-06';
    await expect(back!()).rejects.toThrow(/put back/);
    expect(writes).toEqual([
      'delete new1',
      'update c 2026-10-10 2026-10-14',
      'update a 2026-10-01 2026-10-06',
    ]);
    // the second try starts at the step that failed: nothing already put back is written twice
    writes.length = 0;
    failOn = null;
    await back!();
    expect(writes).toEqual([
      'update a 2026-10-01 2026-10-06',
      'insert pause 2026-10-08 2026-10-09',
    ]);
    expect(rowsNow()).toEqual(before);
  });

  it('needs someone signed in', async () => {
    useGremlyStore.setState({ userId: null } as never);
    await expect(useGremlyStore.getState().easeHabit('h1', pause)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
