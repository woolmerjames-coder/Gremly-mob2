/**
 * What Today counts and hides by comes back with the store's refresh
 * (useGremlyStore refreshFromServer): the days their habits are planned on,
 * their pauses and lighter versions, and their weekly day. A returning user is
 * shown the cached store and refreshed from here, so a read left out of the
 * refresh is a thing the app never knows after a restart. A read that fails
 * keeps what is held: it is never taken for "there are none".
 */
type Answer = { data: unknown; error: unknown };
const mockTables: Record<string, Answer> = {};
const mockAsked: string[] = [];

jest.mock('../../supabase/fetchAllPaginated', () => ({ fetchAllPaginated: jest.fn() }));
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
import { fetchAllPaginated } from '../../supabase/fetchAllPaginated';
import { weeklyDayNow } from '../../week/weeklyDayNow';

/** A query that takes any filter and answers with the table's rows, awaited or as one row. */
function query(table: string) {
  const answer = () => mockTables[table] ?? { data: [], error: null };
  const q: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') {
          return (ok: (a: Answer) => unknown, no: (e: unknown) => unknown) =>
            Promise.resolve(answer()).then(ok, no);
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return async () => {
            const a = answer();
            return { data: Array.isArray(a.data) ? (a.data[0] ?? null) : a.data, error: a.error };
          };
        }
        return () => q;
      },
    },
  );
  return q;
}

const plan = (id: string, habit_id: string, planned_date: string) => ({
  id,
  habit_id,
  owner_id: 'u1',
  planned_date,
  week_start: '2026-10-05',
  status: 'planned',
});
const pause = (id: string, habit_id: string) => ({
  id,
  habit_id,
  owner_id: 'u1',
  mode: 'pause',
  period_start: '2026-10-05',
  period_end: '2026-10-11',
  floor_note: null,
});

beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockAsked.length = 0;
  (fetchAllPaginated as jest.Mock).mockResolvedValue([]);
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    mockAsked.push(table);
    return query(table);
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  useGremlyStore.setState({
    userId: 'u1',
    weeklyDay: 0,
    habitPlans: [],
    habitAdaptations: [],
    // the worlds graph is its own read, with its own tests
    refreshWorldsGraph: async () => {},
  } as never);
});

describe('the store refreshed from the server', () => {
  it('reads the days their habits are planned on, their pauses and their weekly day', async () => {
    mockTables.habit_plans = { data: [plan('p1', 'run', '2026-10-08')], error: null };
    mockTables.habit_adaptations = { data: [pause('e1', 'run')], error: null };
    mockTables.notification_preferences = { data: { weekly_day: 3 }, error: null };
    await useGremlyStore.getState().refreshFromServer();
    const s = useGremlyStore.getState();
    expect(mockAsked).toEqual(expect.arrayContaining(['habit_plans', 'habit_adaptations']));
    expect(s.habitPlans.map((p) => p.id)).toEqual(['p1']);
    expect(s.habitAdaptations.map((a) => a.id)).toEqual(['e1']);
    expect(s.weeklyDay).toBe(3);
    // and the calls to a worker send the same day
    expect(weeklyDayNow()).toBe(3);
  });

  it('keeps what is held when a read fails: a pause is not lost, nor a planned day', async () => {
    useGremlyStore.setState({
      weeklyDay: 3,
      habitPlans: [plan('p1', 'run', '2026-10-08')],
      habitAdaptations: [pause('e1', 'run')],
    } as never);
    mockTables.habit_plans = { data: null, error: { message: 'offline' } };
    mockTables.habit_adaptations = { data: null, error: { message: 'offline' } };
    mockTables.notification_preferences = { data: null, error: { message: 'offline' } };
    await useGremlyStore.getState().refreshFromServer();
    const s = useGremlyStore.getState();
    expect(s.habitPlans.map((p) => p.id)).toEqual(['p1']);
    expect(s.habitAdaptations.map((a) => a.id)).toEqual(['e1']);
    expect(s.weeklyDay).toBe(3);
  });

  it('takes an empty read as none, and keeps a day that is still being saved', async () => {
    useGremlyStore.setState({
      habitPlans: [
        plan('old', 'run', '2026-10-06'),
        plan('temp-run-2026-10-09', 'run', '2026-10-09'),
        // its write came back before the read: the row read stands for it
        plan('temp-run-2026-10-08', 'run', '2026-10-08'),
      ],
      habitAdaptations: [pause('e1', 'run')],
    } as never);
    mockTables.habit_plans = { data: [plan('p1', 'run', '2026-10-08')], error: null };
    mockTables.habit_adaptations = { data: [], error: null };
    await useGremlyStore.getState().refreshFromServer();
    const s = useGremlyStore.getState();
    expect(s.habitPlans.map((p) => p.id)).toEqual(['p1', 'temp-run-2026-10-09']);
    expect(s.habitAdaptations).toEqual([]);
  });
});
