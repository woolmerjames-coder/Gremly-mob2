/**
 * bookedReminder: Want a reminder? after a booked appointment's day. Only
 * reminders still ahead are offered; An hour before only with a time; the
 * one picked is saved as a 'before' reminder on the item the drop became.
 */
const mockState: Record<string, any> = { todos: [], habits: [], notes: [] };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../reminders/save', () => ({
  addReminderToItem: jest.fn(),
  beforeReminder: jest.fn(),
}));

import { remindBefore, remindersAhead } from '../bookedReminder';
import { addReminderToItem, beforeReminder } from '../../reminders/save';

const at = (h: number, m = 0) => h * 60 + m;

describe('the reminders still ahead', () => {
  it('a day or more away: the evening before, and an hour before when it has a time', () => {
    expect(remindersAhead('2026-10-12', null, '2026-10-09', at(20))).toEqual(['evening']);
    expect(remindersAhead('2026-10-12', '10:00', '2026-10-09', at(20))).toEqual([
      'evening',
      'hour',
    ]);
  });

  it('tomorrow, after six this evening: only an hour before', () => {
    expect(remindersAhead('2026-10-10', '10:00', '2026-10-09', at(18, 30))).toEqual(['hour']);
    expect(remindersAhead('2026-10-10', null, '2026-10-09', at(18, 30))).toEqual([]);
    expect(remindersAhead('2026-10-10', null, '2026-10-09', at(17, 59))).toEqual(['evening']);
  });

  it('today: an hour before while it is still more than an hour away', () => {
    expect(remindersAhead('2026-10-09', '15:00', '2026-10-09', at(13, 30))).toEqual(['hour']);
    expect(remindersAhead('2026-10-09', '15:00', '2026-10-09', at(14, 30))).toEqual([]);
  });

  it('just after midnight: an hour before falls the evening before', () => {
    expect(remindersAhead('2026-10-10', '00:30', '2026-10-09', at(23, 0))).toEqual(['hour']);
    expect(remindersAhead('2026-10-10', '00:30', '2026-10-09', at(23, 45))).toEqual([]);
  });
});

describe('saving the one picked', () => {
  beforeEach(() => {
    mockState.notes = [
      { id: 'old', drop_id: 'd1', archived: true },
      { id: 'n1', drop_id: 'd1', archived: false },
    ];
    mockState.todos = [];
    mockState.habits = [];
    (beforeReminder as jest.Mock).mockImplementation((minutes: number) =>
      minutes >= 1440
        ? { id: 'r', kind: 'before', evening: true }
        : { id: 'r', kind: 'before', minutes },
    );
    (addReminderToItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('the evening before, on the event the drop became', async () => {
    await remindBefore('d1', 'evening');
    expect(addReminderToItem).toHaveBeenCalledWith('note', 'n1', {
      id: 'r',
      kind: 'before',
      evening: true,
    });
  });

  it('an hour before', async () => {
    await remindBefore('n1', 'hour');
    expect(addReminderToItem).toHaveBeenCalledWith('note', 'n1', {
      id: 'r',
      kind: 'before',
      minutes: 60,
    });
  });

  it('says so when the item has gone', async () => {
    mockState.notes = [];
    await expect(remindBefore('d1', 'evening')).rejects.toThrow('no longer on your list');
    expect(addReminderToItem).not.toHaveBeenCalled();
  });
});
