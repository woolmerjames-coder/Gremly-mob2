/**
 * recoverStuckMindDrops (final check item 14): an item left at saved settles,
 * and an older build's stuck stage is marked failed, each through
 * updateDropRow; a lookup that fails is logged, not passed over in silence.
 */
import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { updateDropRow } from '../../minddrop/dropSync';

const mockReads: Record<string, Array<{ data: unknown; error: unknown }>> = {};

jest.mock('../../minddrop/dropSync', () => ({ updateDropRow: jest.fn() }));
jest.mock('../../supabase/client', () => {
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'or', 'neq', 'in', 'order', 'limit', 'is']) c[m] = () => c;
    c.lt = () => Promise.resolve(mockReads[table]?.shift() ?? { data: [], error: null });
    c.range = () => Promise.resolve({ data: [], error: null });
    c.single = () => Promise.resolve({ data: null, error: null });
    c.then = (r: any, j?: any) => Promise.resolve({ data: [], error: null }).then(r, j);
    return c;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      channel: () => ({
        on: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => Promise.resolve() }) }) }),
        subscribe: () => ({ unsubscribe: () => Promise.resolve() }),
        unsubscribe: () => Promise.resolve({ error: null }),
      }),
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

beforeEach(() => {
  for (const k of Object.keys(mockReads)) delete mockReads[k];
  useGremlyStore.setState({ userId: 'user-1', todos: [], habits: [], notes: [] } as any);
});

it('settles an item left at saved, and marks an older stuck stage failed, through updateDropRow', async () => {
  const builds: Record<string, (row: any) => any> = {};
  (updateDropRow as jest.Mock).mockImplementation(async (_k, id, what, build) => {
    builds[`${what}:${id}`] = build;
    return true;
  });
  // the first read of each table is the left at saved lookup, the second the older stages
  mockReads.todos = [
    { data: [{ id: 't1' }], error: null },
    { data: [], error: null },
  ];
  mockReads.habits = [
    { data: [], error: null },
    { data: [], error: null },
  ];
  mockReads.notes = [
    { data: [], error: null },
    { data: [{ id: 'n9' }], error: null },
  ];
  await act(async () => {
    await useGremlyStore.getState().recoverStuckMindDrops();
  });
  expect(updateDropRow).toHaveBeenCalledWith('todo', 't1', 'recover_settle', expect.any(Function));
  expect(updateDropRow).toHaveBeenCalledWith('note', 'n9', 'recover_stuck', expect.any(Function));
  // built on the row as it is now: settled only while still at saved
  expect(builds['recover_settle:t1']({ views: { minddrop_stage: 'saved', a: 1 } })).toEqual({
    views: { minddrop_stage: 'settled', a: 1 },
  });
  expect(builds['recover_settle:t1']({ views: { minddrop_stage: 'settled' } })).toBeNull();
  expect(builds['recover_stuck:n9']({ views: { minddrop_stage: 'enriching' } })).toEqual({
    views: { minddrop_stage: 'classified', ai_pending: false, ai_failed: true },
  });
  expect(builds['recover_stuck:n9']({ views: { minddrop_stage: 'settled' } })).toBeNull();
});

it('logs a lookup that fails, and carries on with the other tables', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (updateDropRow as jest.Mock).mockResolvedValue(true);
  mockReads.todos = [
    { data: null, error: { message: 'timeout' } },
    { data: [], error: null },
  ];
  mockReads.habits = [
    { data: [{ id: 'h1' }], error: null },
    { data: [], error: null },
  ];
  await act(async () => {
    await useGremlyStore.getState().recoverStuckMindDrops();
  });
  expect(warn).toHaveBeenCalledWith(
    '[GremlyStore] could not look for Mind Drop items left at saved',
    { table: 'todos', error: 'timeout' },
  );
  expect(updateDropRow).toHaveBeenCalledWith('habit', 'h1', 'recover_settle', expect.any(Function));
  warn.mockRestore();
});
