/**
 * @jest-environment node
 *
 * Today so far in Ask Gremly's context (todayActivity.js), read for the
 * person's day: after midnight and before their day ends it is still
 * yesterday for them (workers/shared/day.js).
 */
import { buildTodayActivity } from '../todayActivity.js';

const ENV = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_KEY: 'test-key' };
const TZ = 'America/Los_Angeles';

/** Every read answers from what the path asks for; the paths asked are kept. */
function reads(asked = []) {
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const u = new URL(url);
    asked.push(u);
    const q = u.searchParams;
    let rows = [];
    if (u.pathname.endsWith('/notes') && q.get('subtype') === 'eq.event') {
      rows = [{ title: 'Dinner with Jen', event_time: '19:00', target_date: q.get('target_date') }];
    }
    return { ok: true, json: async () => rows, text: async () => JSON.stringify(rows) };
  });
  return asked;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('after midnight it reads their day, and that day’s calendar has all passed', async () => {
  // 1:46am on Sunday 4 October where they are
  jest.useFakeTimers().setSystemTime(Date.parse('2026-10-04T08:46:00Z'));
  const asked = reads();
  const text = await buildTodayActivity('u1', TZ, ENV, { today: Promise.resolve('2026-10-03') });

  const habits = asked.find((u) => u.pathname.endsWith('/habit_progress'));
  expect(habits.searchParams.get('occurred_day')).toBe('eq.2026-10-03');
  const events = asked.find(
    (u) => u.pathname.endsWith('/notes') && u.searchParams.get('subtype') === 'eq.event',
  );
  expect(events.searchParams.get('target_date')).toBe('eq.2026-10-03');
  expect(text).toContain('Events done: "Dinner with Jen" (19:00)');
  expect(text).not.toContain('Still ahead');
});

test('with no day given it reads the calendar’s date, as before', async () => {
  jest.useFakeTimers().setSystemTime(Date.parse('2026-10-04T08:46:00Z'));
  const asked = reads();
  const text = await buildTodayActivity('u1', TZ, ENV);

  const habits = asked.find((u) => u.pathname.endsWith('/habit_progress'));
  expect(habits.searchParams.get('occurred_day')).toBe('eq.2026-10-04');
  // 7pm on the Sunday is still ahead at 1:46am
  expect(text).toContain('Still ahead: "Dinner with Jen" (19:00)');
});
