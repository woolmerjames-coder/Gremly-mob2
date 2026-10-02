jest.mock('../../supabase/client', () => ({ supabase: {} }));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ todos: [], habits: [], notes: [] }) },
}));

import { beforeReminder, inMinutes } from '../save';

describe('reminders made from elsewhere', () => {
  const now = new Date(2026, 9, 1, 23, 30);
  it('an event reminder counts back from the start, or goes the evening before', () => {
    expect(beforeReminder(15, now)).toMatchObject({ kind: 'before', minutes: 15 });
    expect(beforeReminder(1440, now)).toMatchObject({ kind: 'before', evening: true });
  });
  it('"in an hour" lands on the right day near midnight', () => {
    expect(inMinutes(60, now)).toMatchObject({
      frequency: 'once',
      date: '2026-10-02',
      time: '00:30',
    });
  });
});
