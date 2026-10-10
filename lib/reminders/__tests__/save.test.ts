jest.mock('../../supabase/client', () => ({ supabase: {} }));
jest.mock('../../minddrop/dropSync', () => ({ updateDropRow: jest.fn() }));

import { addReminderToItem, beforeReminder, inMinutes } from '../save';
import { updateDropRow } from '../../minddrop/dropSync';

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

describe('adding a reminder to an item (final check item 5)', () => {
  it('writes through updateDropRow, on the row as the database holds it, keeping its reminders', async () => {
    let patch: any = null;
    (updateDropRow as jest.Mock).mockImplementation(
      async (_t: string, _id: string, _w: string, build: (r: any) => any) => {
        patch = build({ reminders_json: [{ id: 'r1', kind: 'before', minutes: 15 }] });
        return true;
      },
    );
    const added = { id: 'r2', frequency: 'once' as const, date: '2099-01-01', time: '09:00' };
    await addReminderToItem('todo', 't1', added);
    expect(updateDropRow).toHaveBeenCalledWith('todo', 't1', 'add_reminder', expect.any(Function));
    expect(patch.reminders).toEqual([{ id: 'r1', kind: 'before', minutes: 15 }, added]);
  });

  it('says so when the item has gone', async () => {
    (updateDropRow as jest.Mock).mockResolvedValue(false);
    await expect(
      addReminderToItem('note', 'n1', {
        id: 'r3',
        frequency: 'once',
        date: '2099-01-01',
        time: '09:00',
      }),
    ).rejects.toThrow('no longer there');
  });
});
