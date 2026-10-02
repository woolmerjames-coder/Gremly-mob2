import {
  quickPicks,
  describeReminder,
  summarizeReminders,
  confirmation,
  cleanReminders,
  clockLabel,
  isSpent,
} from '../reminders';

// Thursday 1 October 2026, local time
const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m);

describe('quick picks', () => {
  it('todos: later today, tomorrow morning, pick a time, repeat', () => {
    const p = quickPicks('todo', { now: at(10) });
    expect(p.map((x) => x.label)).toEqual([
      'Later today',
      'Tomorrow morning',
      'Pick a time',
      'Repeat',
    ]);
    expect(p[0].reminder).toMatchObject({ frequency: 'once', date: '2026-10-01', time: '18:00' });
    expect(p[1].reminder).toMatchObject({ date: '2026-10-02', time: '09:00' });
    expect(p[2].opens).toBe('pick-time');
  });

  it('in the evening "later" becomes an hour from now, rounded up', () => {
    const p = quickPicks('todo', { now: at(18, 10) });
    expect(p[0]).toMatchObject({ label: 'In an hour', detail: '7:15 PM' });
    expect(quickPicks('note', { now: at(22) })[0]).toMatchObject({ label: 'Tomorrow evening' });
  });

  it('events with a time count back from the start', () => {
    const p = quickPicks('event', {
      now: at(10),
      eventStart: { date: '2026-10-03', time: '15:30' },
    });
    expect(p.map((x) => x.detail).slice(0, 2)).toEqual(['2:30 PM', '3:15 PM']);
    expect(p[0].reminder).toMatchObject({ kind: 'before', minutes: 60 });
    expect(p[2].reminder).toMatchObject({ kind: 'before', evening: true });
  });

  it('all day events offer the evening before and that morning', () => {
    const p = quickPicks('event', { now: at(10), eventStart: { date: '2026-10-03', time: null } });
    expect(p.map((x) => x.label)).toEqual(['The evening before', 'That morning', 'Pick a time']);
    expect(p[1].reminder).toMatchObject({ date: '2026-10-03', time: '09:00' });
  });

  it('people: every Sunday, or next Monday', () => {
    const p = quickPicks('person', { now: at(10) });
    expect(p[0].reminder).toMatchObject({ frequency: 'weekly', days_of_week: [0], time: '18:00' });
    expect(p[1].reminder).toMatchObject({ date: '2026-10-05', time: '09:00' });
  });

  it('habits repeat by default', () => {
    expect(quickPicks('habit', { now: at(10) })[0].reminder).toMatchObject({
      frequency: 'daily',
      time: '09:00',
    });
  });
});

describe('words', () => {
  const now = at(10);
  it('describes each kind plainly', () => {
    expect(
      describeReminder({ id: 'a', frequency: 'once', date: '2026-10-01', time: '18:00' }, { now }),
    ).toBe('Today at 6:00 PM');
    expect(
      describeReminder({ id: 'a', frequency: 'once', date: '2026-10-02', time: '09:00' }, { now }),
    ).toBe('Tomorrow at 9:00 AM');
    expect(
      describeReminder({ id: 'a', frequency: 'once', date: '2026-10-09', time: '10:00' }, { now }),
    ).toBe('Fri 9 Oct at 10:00 AM');
    expect(
      describeReminder({ id: 'a', frequency: 'weekly', days_of_week: [0], time: '18:00' }, { now }),
    ).toBe('Every Sunday at 6:00 PM');
    expect(
      describeReminder(
        { id: 'a', frequency: 'weekly', days_of_week: [3, 1], time: '08:30' },
        { now },
      ),
    ).toBe('Mon, Wed at 8:30 AM');
    expect(describeReminder({ id: 'a', kind: 'before', minutes: 60 }, { now })).toBe(
      '1 hour before',
    );
    expect(describeReminder({ id: 'a', kind: 'before', evening: true }, { now })).toBe(
      'The evening before',
    );
  });

  it('summarises a row and leaves out spent one offs', () => {
    expect(summarizeReminders([], { now })).toBe('Off');
    const spent = { id: 'x', frequency: 'once' as const, date: '2026-09-30', time: '09:00' };
    expect(isSpent(spent, now)).toBe(true);
    expect(summarizeReminders([spent], { now })).toBe('Off');
    expect(
      summarizeReminders([spent, { id: 'y', frequency: 'daily', time: '07:00' }], { now }),
    ).toBe('Every day at 7:00 AM');
  });

  it('confirms in a sentence and never uses a dash', () => {
    const c = confirmation(
      { id: 'a', frequency: 'once', date: '2026-10-01', time: '18:00' },
      { now },
    );
    expect(c).toBe('Done. I’ll remind you today at 6:00 PM.');
    expect(c).not.toMatch(/[–—]/);
  });

  it('saves without the old phone ids or spent one offs', () => {
    const out = cleanReminders(
      [
        { id: 'a', frequency: 'daily', time: '07:00', notificationId: 'old' },
        { id: 'b', frequency: 'once', date: '2026-09-01', time: '07:00' },
      ],
      now,
    );
    expect(out).toEqual([{ id: 'a', frequency: 'daily', time: '07:00' }]);
  });

  it('clock labels', () => {
    expect(clockLabel('00:05')).toBe('12:05 AM');
    expect(clockLabel('12:00')).toBe('12:00 PM');
  });
});
