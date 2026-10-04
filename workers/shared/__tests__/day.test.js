/**
 * @jest-environment node
 *
 * The person's day (workers/shared/day.js): before the hour their day ends it
 * is still yesterday for them, whatever the calendar says.
 */
import {
  DEFAULT_DAY_END_HOUR,
  dayEndHourFrom,
  dayEndHourOf,
  forgetDayEnds,
  personDay,
  personNow,
} from '../day.js';

const ENV = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_KEY: 'test-key' };
const TZ = 'America/Los_Angeles';

/** The preferences read answers with this hour (no row when left out). */
function dayEndsAt(hour, calls = []) {
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    calls.push(String(url));
    const rows = hour === undefined ? [] : [{ day_boundary_hour: hour }];
    return { ok: true, text: async () => JSON.stringify(rows) };
  });
  return calls;
}

beforeEach(() => forgetDayEnds());
afterEach(() => jest.restoreAllMocks());

test('before the day end hour it is still yesterday', () => {
  expect(personDay('2026-10-04', 106, 3)).toBe('2026-10-03');
  expect(personDay('2026-10-04', 179, 3)).toBe('2026-10-03');
  expect(personDay('2026-10-04', 180, 3)).toBe('2026-10-04');
  // a new year, a new month
  expect(personDay('2026-01-01', 30, 3)).toBe('2025-12-31');
  expect(personDay('2026-03-01', 30, 5)).toBe('2026-02-28');
});

test('a day that ends at midnight is the calendar day', () => {
  expect(personDay('2026-10-04', 106, 0)).toBe('2026-10-04');
});

test('with no hour at all, the day ends at 3am', () => {
  expect(DEFAULT_DAY_END_HOUR).toBe(3);
  expect(personDay('2026-10-04', 106, null)).toBe('2026-10-03');
  expect(personDay('2026-10-04', 106, undefined)).toBe('2026-10-03');
  expect(personDay('2026-10-04', 200, undefined)).toBe('2026-10-04');
});

test('the saved hour is kept, midnight included, and nothing saved means 3am', () => {
  expect(dayEndHourFrom(0)).toBe(0);
  expect(dayEndHourFrom(5)).toBe(5);
  expect(dayEndHourFrom('3')).toBe(3);
  expect(dayEndHourFrom(null)).toBe(3);
  expect(dayEndHourFrom(undefined)).toBe(3);
  expect(dayEndHourFrom('not an hour')).toBe(3);
  expect(dayEndHourFrom(40)).toBe(3);
});

test('1:46am on Sunday, with a day that ends at 3am, is still Saturday', async () => {
  dayEndsAt(3);
  const now = await personNow(ENV, 'u1', TZ, Date.parse('2026-10-04T08:46:00Z'));
  expect(now).toEqual({
    today: '2026-10-03',
    calendarDay: '2026-10-04',
    nowMin: 106,
    dayEndHour: 3,
    late: true,
  });
});

test('once their day has ended, or when it ends at midnight, it is the calendar day', async () => {
  dayEndsAt(3);
  const after = await personNow(ENV, 'u1', TZ, Date.parse('2026-10-04T10:05:00Z'));
  expect(after.today).toBe('2026-10-04');
  expect(after.late).toBe(false);

  forgetDayEnds();
  dayEndsAt(0);
  const midnight = await personNow(ENV, 'u2', TZ, Date.parse('2026-10-04T08:46:00Z'));
  expect(midnight.today).toBe('2026-10-04');
  expect(midnight.late).toBe(false);
});

test('the hour is read at most once a minute for a person', async () => {
  const calls = dayEndsAt(3);
  expect(await dayEndHourOf(ENV, 'u1', { now: 1000 })).toBe(3);
  expect(await dayEndHourOf(ENV, 'u1', { now: 30000 })).toBe(3);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('cortex_preferences?owner_id=eq.u1&select=day_boundary_hour');
  await dayEndHourOf(ENV, 'u1', { now: 62000 });
  expect(calls).toHaveLength(2);
  // another person is read for themselves
  await dayEndHourOf(ENV, 'u2', { now: 62000 });
  expect(calls).toHaveLength(3);
});

test('no preferences row means 3am, and nobody means 3am without a read', async () => {
  const calls = dayEndsAt(undefined);
  expect(await dayEndHourOf(ENV, 'u1')).toBe(3);
  expect(await dayEndHourOf(ENV, null)).toBe(3);
  expect(calls).toHaveLength(1);
});

test('a read that fails is logged, and the day ends at 3am', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => ({ ok: false, status: 500, text: async () => 'down' }));
  const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  // 1:46am: still Saturday for them
  const now = await personNow(ENV, 'u1', TZ, Date.parse('2026-10-04T08:46:00Z'));
  expect(now.today).toBe('2026-10-03');
  expect(logged).toHaveBeenCalledTimes(1);
});

test('a read that fails after a good one keeps the hour it had', async () => {
  dayEndsAt(3);
  expect(await dayEndHourOf(ENV, 'u1', { now: 1000 })).toBe(3);
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => ({ ok: false, status: 500, text: async () => 'down' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(await dayEndHourOf(ENV, 'u1', { now: 120000 })).toBe(3);
});
