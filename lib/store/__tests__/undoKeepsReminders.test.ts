/**
 * Undo after a Mind Drop answer brings reminders back (Mind Drop rethink
 * stage 6). The database closes an item's reminders when it is archived or
 * ticked off, and opens them again when it is restored or unticked (the
 * trigger sync_reminder_schedule on todos, habits and notes reads
 * reminders_json and the item's archived and completed_at on every write).
 * So the store's restore and untick must only change those columns and leave
 * reminders_json as it is: then every Undo brings the reminders back.
 */
const mockWrites: Array<{ table: string; values: Record<string, unknown> }> = [];
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

const reminders = [{ id: 'r1', time: '09:00', frequency: 'once', date: '2026-10-12' }];

const find = (key: 'todos' | 'habits', id: string) =>
  (useGremlyStore.getState()[key] as unknown as Record<string, unknown>[]).find(
    (x) => x.id === id,
  )!;

beforeEach(() => {
  mockWrites.length = 0;
  (supabase.from as jest.Mock).mockImplementation((table: string) => ({
    update: (values: Record<string, unknown>) => {
      mockWrites.push({ table, values });
      return { eq: async () => ({ error: null }) };
    },
  }));
  useGremlyStore.setState({
    todos: [
      {
        id: 't1',
        name: 'Call the vet',
        reminders_json: reminders,
        archived: false,
        completed_at: null,
      },
    ] as never,
    habits: [{ id: 'h1', name: 'Stretch', reminders_json: reminders, archived: false }] as never,
  });
});

describe('Undo keeps reminders', () => {
  it('archiving and restoring a todo leaves its reminders where they were', async () => {
    await useGremlyStore.getState().archiveTodo('t1', 'minddrop_relation');
    await useGremlyStore.getState().restoreTodo('t1');
    expect(find('todos', 't1')).toMatchObject({ archived: false, reminders_json: reminders });
    for (const w of mockWrites) expect(w.values).not.toHaveProperty('reminders_json');
    expect(mockWrites.at(-1)).toEqual({
      table: 'todos',
      values: { archived: false, archived_at: null, archived_reason: null },
    });
  });

  it('unticking a todo that was ticked off leaves its reminders where they were', async () => {
    useGremlyStore.setState({
      todos: [
        {
          id: 't1',
          name: 'Call the vet',
          reminders_json: reminders,
          archived: false,
          completed_at: '2026-10-09T09:00:00Z',
        },
      ] as never,
    });
    await useGremlyStore.getState().uncompleteTodo('t1');
    expect(find('todos', 't1')).toMatchObject({ completed_at: null, reminders_json: reminders });
    expect(mockWrites).toEqual([{ table: 'todos', values: { completed_at: null } }]);
  });

  it('archiving and restoring a habit leaves its reminders where they were', async () => {
    await useGremlyStore.getState().archiveHabit('h1', 'minddrop_relation');
    await useGremlyStore.getState().restoreHabit('h1');
    expect(find('habits', 'h1')).toMatchObject({ archived: false, reminders_json: reminders });
    for (const w of mockWrites) expect(w.values).not.toHaveProperty('reminders_json');
  });
});
