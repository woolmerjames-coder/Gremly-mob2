/**
 * Where a notification tap lands.
 */
jest.mock('../../../lib/supabase/client', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../../lib/brief/pinned', () => ({
  todayThreadParams: (step?: string) => ({
    mode: 'chat',
    thread: 'today',
    ...(step ? { step } : {}),
    threadKey: 'k',
  }),
}));
jest.mock('../../../contexts/OverlayContext', () => ({ useGlobalOverlay: jest.fn() }));
jest.mock('../../../lib/notifications/ask', () => ({ maybeAsk: jest.fn() }));
jest.mock('../../../lib/store/useGremlyStore', () => {
  const state = { isInitialized: true, todos: [{ id: 't1', type: 'todo' }], habits: [], notes: [] };
  const hook: any = (sel: any) => sel(state);
  hook.getState = () => state;
  return { useGremlyStore: hook };
});

import { runRoute } from '../NotificationResponder';
import { supabase } from '../../../lib/supabase/client';

const nav = () => ({ navigate: jest.fn(), isReady: () => true });
const overlay = () => ({ openEdit: jest.fn() });

it('the brief opens today’s thread in Chat', async () => {
  const n = nav();
  await runRoute('brief', n, overlay());
  expect(n.navigate).toHaveBeenCalledWith('Tabs', {
    screen: 'Gremly',
    params: expect.objectContaining({ thread: 'today' }),
  });
});

it('the evening one opens the wrap up in today’s thread, not the old Sweep screen', async () => {
  const n = nav();
  await runRoute('sweep', n, overlay());
  expect(n.navigate).toHaveBeenCalledWith('Tabs', {
    screen: 'Gremly',
    params: expect.objectContaining({ thread: 'today', step: 'wrap' }),
  });
});

it('summary and habits open their screens', async () => {
  const n = nav();
  await runRoute('summary', n, overlay());
  await runRoute('habit/h1', n, overlay());
  expect(n.navigate.mock.calls).toEqual([['WeeklySummary'], ['HabitDetail', { habitId: 'h1' }]]);
});

it('a reminder opens its item', async () => {
  const o = overlay();
  await runRoute('item/todo/t1', nav(), o);
  expect(o.openEdit).toHaveBeenCalledWith({ record: { id: 't1', type: 'todo' } });
});

it('a person reminder opens the person', async () => {
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Mum' } }) }),
    }),
  });
  const n = nav();
  await runRoute('item/person/p1', n, overlay());
  expect(n.navigate).toHaveBeenCalledWith('PersonDetail', { personName: 'Mum' });
});
