/**
 * @jest-environment node
 *
 * Reminder times in the person's own time zone, including the daylight saving
 * changes, before-it-starts reminders and repeating rules.
 */
import {
  nextFireAt,
  zonedTimeToUtc,
  localDateOf,
  localMinutesOf,
  repeats,
  addDays,
  weekdayOf,
} from '../reminderTimes';

const LA = 'America/Los_Angeles';
const LDN = 'Europe/London';
const iso = (d) => d && d.toISOString();

describe('zonedTimeToUtc', () => {
  test('a normal summer time', () => {
    expect(iso(zonedTimeToUtc('2026-10-02', '09:00', LA))).toBe('2026-10-02T16:00:00.000Z');
    expect(iso(zonedTimeToUtc('2026-10-02', '09:00', LDN))).toBe('2026-10-02T08:00:00.000Z');
  });
  test('winter time after the clocks go back', () => {
    expect(iso(zonedTimeToUtc('2026-11-02', '09:00', LA))).toBe('2026-11-02T17:00:00.000Z');
  });
  test('a time skipped by spring forward moves forward by the gap', () => {
    // 2026-03-08 2:30am does not exist in Los Angeles
    expect(iso(zonedTimeToUtc('2026-03-08', '02:30', LA))).toBe('2026-03-08T10:30:00.000Z');
  });
  test('a time that happens twice takes the first one', () => {
    // 2026-11-01 1:30am happens twice in Los Angeles; the first is still daylight time
    expect(iso(zonedTimeToUtc('2026-11-01', '01:30', LA))).toBe('2026-11-01T08:30:00.000Z');
  });
});

describe('local helpers', () => {
  test('local date and minutes', () => {
    const at = new Date('2026-10-02T06:30:00Z'); // 11:30pm on the 1st in LA
    expect(localDateOf(at, LA)).toBe('2026-10-01');
    expect(localMinutesOf(at, LA)).toBe(23 * 60 + 30);
  });
  test('calendar arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-10-04')).toBe(0); // a Sunday
  });
});

describe('nextFireAt', () => {
  const now = new Date('2026-10-02T15:00:00Z'); // Friday 8:00am in LA

  test('once, in the future', () => {
    expect(
      iso(nextFireAt({ frequency: 'once', date: '2026-10-02', time: '09:00' }, { tz: LA, now })),
    ).toBe('2026-10-02T16:00:00.000Z');
  });
  test('once, already passed, never fires', () => {
    expect(
      nextFireAt({ frequency: 'once', date: '2026-10-02', time: '07:00' }, { tz: LA, now }),
    ).toBeNull();
  });
  test('daily: later today, or tomorrow when today has passed', () => {
    expect(iso(nextFireAt({ frequency: 'daily', time: '18:00' }, { tz: LA, now }))).toBe(
      '2026-10-03T01:00:00.000Z',
    );
    expect(iso(nextFireAt({ frequency: 'daily', time: '07:00' }, { tz: LA, now }))).toBe(
      '2026-10-03T14:00:00.000Z',
    );
  });
  test('weekdays skip the weekend', () => {
    // Friday 8am, 7am weekdays reminder: next is Monday 7am
    expect(iso(nextFireAt({ frequency: 'weekdays', time: '07:00' }, { tz: LA, now }))).toBe(
      '2026-10-05T14:00:00.000Z',
    );
  });
  test('weekends', () => {
    expect(iso(nextFireAt({ frequency: 'weekends', time: '10:00' }, { tz: LA, now }))).toBe(
      '2026-10-03T17:00:00.000Z',
    );
  });
  test('chosen days (0 is Sunday)', () => {
    expect(
      iso(nextFireAt({ frequency: 'weekly', days_of_week: [0], time: '17:00' }, { tz: LA, now })),
    ).toBe('2026-10-05T00:00:00.000Z');
  });
  test('weekly with no days never fires', () => {
    expect(
      nextFireAt({ frequency: 'weekly', days_of_week: [], time: '17:00' }, { tz: LA, now }),
    ).toBeNull();
  });
  test('before it starts', () => {
    const eventStart = { date: '2026-10-02', time: '12:30' };
    expect(iso(nextFireAt({ kind: 'before', minutes: 60 }, { tz: LA, now, eventStart }))).toBe(
      '2026-10-02T18:30:00.000Z',
    );
    expect(iso(nextFireAt({ kind: 'before', minutes: 10 }, { tz: LA, now, eventStart }))).toBe(
      '2026-10-02T19:20:00.000Z',
    );
  });
  test('the evening before is 6pm the day before', () => {
    const eventStart = { date: '2026-10-03', time: '09:00' };
    expect(iso(nextFireAt({ kind: 'before', evening: true }, { tz: LA, now, eventStart }))).toBe(
      '2026-10-03T01:00:00.000Z',
    );
  });
  test('an all day event has no start to count back from', () => {
    expect(
      nextFireAt(
        { kind: 'before', minutes: 60 },
        { tz: LA, now, eventStart: { date: '2026-10-03', time: null } },
      ),
    ).toBeNull();
  });
  test('a broken rule never fires', () => {
    expect(nextFireAt({ frequency: 'daily', time: 'later' }, { tz: LA, now })).toBeNull();
    expect(nextFireAt(null, { tz: LA, now })).toBeNull();
  });
  test('a daily reminder keeps its wall clock time across the clocks going back', () => {
    const before = new Date('2026-10-31T20:00:00Z'); // Saturday 1pm PDT
    expect(iso(nextFireAt({ frequency: 'daily', time: '09:00' }, { tz: LA, now: before }))).toBe(
      '2026-11-01T17:00:00.000Z',
    ); // 9am PST
  });
  test('repeats', () => {
    expect(repeats({ frequency: 'daily', time: '09:00' })).toBe(true);
    expect(repeats({ frequency: 'once', time: '09:00', date: '2026-10-02' })).toBe(false);
    expect(repeats({ kind: 'before', minutes: 10 })).toBe(false);
  });
});
