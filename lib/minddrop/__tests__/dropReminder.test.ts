/**
 * The reminder a drop asked for (final check item 5): written on the row as
 * the database holds it now, in turn with every other write to it
 * (updateDropRow), keeping the person's own reminders; and the reminder call
 * after a question is answered.
 */
const mockState = { notes: [] as any[] };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../dropSync', () => ({ updateDropRow: jest.fn() }));
jest.mock('../dropDetails', () => ({ callPhase2b: jest.fn() }));
jest.mock('../../notifications/ask', () => ({ maybeAsk: jest.fn() }));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({ now: () => new Date('2026-10-10T12:00:00Z') }),
}));

import { remindAfterAnswer, scheduleDropReminder } from '../dropReminder';
import { updateDropRow } from '../dropSync';
import { callPhase2b } from '../dropDetails';
import { maybeAsk } from '../../notifications/ask';

let row: Record<string, any> = {};
let patch: Record<string, any> | null = null;

beforeEach(() => {
  row = {};
  patch = null;
  (updateDropRow as jest.Mock).mockImplementation(
    async (_t: string, _id: string, _what: string, build: (r: any) => any) => {
      patch = build(row);
      return !!patch;
    },
  );
  (maybeAsk as jest.Mock).mockResolvedValue(false);
});

describe('scheduleDropReminder', () => {
  it('writes through updateDropRow, keeping the person’s own reminders and replacing an earlier automatic one', async () => {
    row = {
      reminders_json: [
        { id: 'mine-1', time: '08:00', frequency: 'daily' },
        { id: 'auto-1', time: '09:00', frequency: 'once', date: '2026-10-11' },
      ],
    };
    await scheduleDropReminder({ entityType: 'todo', id: 't1' }, {
      auto_reminder: true,
      reminder_date: '2026-10-12',
      reminder_time: '10:00',
    } as any);
    expect(updateDropRow).toHaveBeenCalledWith('todo', 't1', 'reminder', expect.any(Function));
    expect(patch!.reminders).toEqual([
      { id: 'mine-1', time: '08:00', frequency: 'daily' },
      expect.objectContaining({ time: '10:00', frequency: 'once', date: '2026-10-12' }),
    ]);
    expect(maybeAsk).toHaveBeenCalledWith('bell');
  });

  it('writes nothing when the reminder call heard no remind me', async () => {
    await scheduleDropReminder({ entityType: 'todo', id: 't1' }, {
      auto_reminder: false,
    } as any);
    expect(updateDropRow).not.toHaveBeenCalled();
  });
});

describe('remindAfterAnswer', () => {
  it('runs the reminder call with the answered kind and saves what it says', async () => {
    (callPhase2b as jest.Mock).mockResolvedValue({
      auto_reminder: true,
      reminder_date: '2026-10-12',
      reminder_time: '09:30',
      reminder_frequency: null,
    });
    await remindAfterAnswer({ entityType: 'todo', id: 't2' }, 'remind me to call mum', {
      bucket: 'todo',
      subtype: null,
    });
    expect(callPhase2b).toHaveBeenCalledWith('remind me to call mum', 'todo', null);
    expect(updateDropRow).toHaveBeenCalledWith('todo', 't2', 'reminder', expect.any(Function));
  });

  it('never rejects, and logs when the call fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (callPhase2b as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(
      remindAfterAnswer({ entityType: 'note', id: 'n1' }, 'words', {
        bucket: 'log',
        subtype: null,
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
