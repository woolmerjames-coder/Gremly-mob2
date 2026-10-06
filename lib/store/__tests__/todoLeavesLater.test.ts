/**
 * A todo given a day is no longer put off (useGremlyStore updateTodo): its
 * back day goes with the write, whoever gave it the day. Before this, a Later
 * given a day in its own editor kept its back day, and the wrap up's cards
 * left it out until that day came.
 */
const mockUpdates: Record<string, unknown>[] = [];
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

const todoNow = (id: string) =>
  (useGremlyStore.getState().todos as unknown as Record<string, unknown>[]).find(
    (t) => t.id === id,
  ) as Record<string, unknown>;

beforeEach(() => {
  mockUpdates.length = 0;
  // every write to the database is kept, and succeeds
  (supabase.from as jest.Mock).mockImplementation(() => ({
    update: (values: Record<string, unknown>) => {
      mockUpdates.push(values);
      return { eq: async () => ({ error: null }) };
    },
  }));
  useGremlyStore.setState({
    todos: [
      // put off: no day of its own, back on the 20th
      { id: 'later', name: 'Renew the passport', due_day: null, resurface_at: '2026-10-20' },
      { id: 'plain', name: 'Call the bank', due_day: '2026-10-08', resurface_at: null },
    ] as never,
  });
});

describe('a todo given a day', () => {
  it('loses its back day in the same write', async () => {
    await useGremlyStore.getState().updateTodo('later', { due_day: '2026-10-09' } as never);
    expect(todoNow('later')).toMatchObject({ due_day: '2026-10-09', resurface_at: null });
    expect(mockUpdates[0]).toMatchObject({ due_day: '2026-10-09', resurface_at: null });
  });

  it('is left alone when the write names the back day itself', async () => {
    // the Undo of a day given to a Later puts both columns back as they were
    await useGremlyStore
      .getState()
      .updateTodo('later', { due_day: '2026-10-09', resurface_at: '2026-10-20' } as never);
    expect(todoNow('later')).toMatchObject({ due_day: '2026-10-09', resurface_at: '2026-10-20' });
  });

  it('changes nothing else: a write with no day, or a todo that was not put off', async () => {
    await useGremlyStore.getState().updateTodo('later', { name: 'Renew passports' } as never);
    expect(todoNow('later')).toMatchObject({ resurface_at: '2026-10-20', due_day: null });
    expect('resurface_at' in mockUpdates[0]).toBe(false);
    // the day taken away is not a day given
    await useGremlyStore.getState().updateTodo('later', { due_day: null } as never);
    expect(todoNow('later').resurface_at).toBe('2026-10-20');
    await useGremlyStore.getState().updateTodo('plain', { due_day: '2026-10-10' } as never);
    expect('resurface_at' in mockUpdates[2]).toBe(false);
  });
});
