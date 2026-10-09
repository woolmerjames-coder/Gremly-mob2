/**
 * @jest-environment node
 *
 * The week ahead in Ask Gremly's context: each of the next seven days with
 * its calendar and planned todos, in the person's time zone, an all day entry
 * on the dates it covers, and a clear day said to be clear.
 */
import { formatWeekAhead, readWeekAhead, weekFrom } from '../weekAhead.js';
import { allDayCovers, calendarSelects } from '../../../shared/calendar.js';

const TZ = 'America/Los_Angeles';
const FIRST = '2026-10-03'; // a Saturday

test('the week read includes an event already underway until its end date', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T19:00:00Z'));
  const paths = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const parsed = new URL(url);
    const query = parsed.searchParams;
    paths.push(parsed);
    const rows =
      parsed.pathname.endsWith('/notes') &&
      query.get('or') === `(target_date.gte.${FIRST},end_date.gte.${FIRST})` &&
      query.get('target_date') === 'lte.2026-10-09'
        ? [{ id: 'trip', title: 'Trip', target_date: '2026-10-01', end_date: '2026-10-04' }]
        : [];
    return { ok: true, text: async () => JSON.stringify(rows) };
  });
  const result = await readWeekAhead('u1', TZ, {
    SUPABASE_URL: 'https://example.test',
    SUPABASE_SERVICE_KEY: 'test-key',
  });
  expect(paths.filter((p) => p.pathname.endsWith('/notes'))).toHaveLength(1);
  expect(result.days[0].allDay).toEqual([{ id: 'trip', title: 'Trip' }]);
  expect(result.days[1].allDay).toEqual([{ id: 'trip', title: 'Trip' }]);
  expect(result.days[2].allDay).toEqual([]);
});

const week = () =>
  weekFrom({
    first: FIRST,
    tz: TZ,
    synced: {
      timed: [
        // Sunday 3:56pm where they are
        {
          id: 'f',
          title: 'Flight to San Francisco',
          start_at: '2026-10-04T22:56:00Z',
          end_at: '2026-10-05T00:38:00Z',
        },
        // Monday 8am where they are, Monday 3pm UTC
        {
          id: 'h',
          title: 'Team huddle',
          start_at: '2026-10-05T15:00:00Z',
          end_at: '2026-10-05T15:30:00Z',
        },
        {
          id: 'c',
          title: 'Canceled: Old sync',
          start_at: '2026-10-05T16:00:00Z',
          end_at: '2026-10-05T16:30:00Z',
        },
        {
          id: 'x',
          title: 'Known cancelled',
          start_at: '2026-10-05T17:00:00Z',
          end_at: '2026-10-05T17:30:00Z',
        },
      ],
      // midnight to midnight in New York: a whole Friday where they are too
      long: [
        {
          id: 'l',
          title: 'US office closed',
          start_at: '2026-10-09T04:00:00Z',
          end_at: '2026-10-10T03:59:00Z',
          is_all_day: false,
        },
      ],
      allDay: [
        // Friday and Saturday, stored from midnight UTC on Friday
        {
          id: 'o',
          title: 'Office closed',
          start_at: '2026-10-09T00:00:00Z',
          end_at: '2026-10-10T23:59:59Z',
          is_all_day: true,
        },
      ],
    },
    noteEvents: [
      { id: 'n', title: 'Dinner with Mira', event_time: '19:00', target_date: '2026-10-07' },
    ],
    quickEvents: [
      {
        id: 'q',
        title: 'Vet',
        event_time: '09:30',
        duration_minutes: 30,
        event_date: '2026-10-06',
      },
    ],
    todos: [
      { id: 't1', name: 'Do taxes', due_day: '2026-10-03', due_time: '15:00:00' },
      { id: 't2', title: 'Book flights', due_day: '2026-10-06' },
    ],
    overdue: [{ id: 'o1', name: 'Tax form', due_day: '2026-09-29' }],
    cancelledIds: ['x'],
  });

test('each of the seven days, in their time zone, with what is on it', () => {
  const w = week();
  expect(w.days.map((d) => d.date)).toEqual([
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
  ]);
  const on = (date) => w.days.find((d) => d.date === date);
  expect(on('2026-10-04').meetings.map((m) => m.title)).toEqual(['Flight to San Francisco']);
  // cancelled by title or by the daily context are left out
  expect(on('2026-10-05').meetings.map((m) => m.title)).toEqual(['Team huddle']);
  expect(on('2026-10-06').meetings.map((m) => m.title)).toEqual(['Vet']);
  expect(on('2026-10-06').todos).toEqual([{ id: 't2', title: 'Book flights', due_time: null }]);
  expect(on('2026-10-07').meetings.map((m) => m.title)).toEqual(['Dinner with Mira']);
  // the all day entry is on Friday, not on Thursday evening where they are
  expect(on('2026-10-08').allDay).toEqual([]);
  expect(on('2026-10-09').allDay.map((a) => a.title)).toEqual([
    'Office closed',
    'US office closed',
  ]);
  expect(on('2026-10-08').meetings.map((m) => m.title)).toEqual([]);
});

test('in words: times where they are, clear days said to be clear, what is still open', () => {
  const text = formatWeekAhead(week());
  expect(text).toContain('Sat 3 Oct (today):\n  todos planned for it (1): Do taxes at 3:00pm');
  expect(text).toContain(
    'Sun 4 Oct (tomorrow):\n  on their calendar (1): 3:56pm to 5:38pm Flight to San Francisco',
  );
  expect(text).toContain('Mon 5 Oct:\n  on their calendar (1): 8:00am to 8:30am Team huddle');
  expect(text).toContain('Thu 8 Oct: nothing planned');
  expect(text).toContain(
    'Fri 9 Oct:\n  on their calendar (2): all day: Office closed; US office closed',
  );
  // an answer about a day covers its todos as well as its calendar
  expect(text).toContain('an answer about a day covers both its calendar and its todos');
  expect(text).toContain('Still open from before today: Tax form (was Tue 29 Sep)');
  expect(formatWeekAhead(null)).toBe('');
});

test('with ids, for the agent: each todo carries its id, and the words are otherwise the same', () => {
  const plain = formatWeekAhead(week());
  const text = formatWeekAhead(week(), { ids: true });
  expect(text).toContain(
    'Tue 6 Oct:\n  on their calendar (1): 9:30am to 10:00am Vet\n  todos planned for it (1): Book flights (id t2)',
  );
  expect(text).toMatch(/Still open from before today: Tax form \(id [^)]+\) \(was Tue 29 Sep\)/);
  expect(text.replace(/ \(id [^)]+\)/g, '')).toBe(plain);
});

test('an all day entry covers the dates it was stored for, whatever the time zone', () => {
  const closed = {
    is_all_day: true,
    start_at: '2026-10-09T00:00:00Z',
    end_at: '2026-10-10T23:59:59Z',
  };
  expect(allDayCovers(closed, '2026-10-08')).toBe(false);
  expect(allDayCovers(closed, '2026-10-09')).toBe(true);
  expect(allDayCovers(closed, '2026-10-10')).toBe(true);
  expect(allDayCovers(closed, '2026-10-11')).toBe(false);
  // an end at the next midnight is exclusive
  const oneDay = {
    is_all_day: true,
    start_at: '2026-10-09T00:00:00Z',
    end_at: '2026-10-10T00:00:00Z',
  };
  expect(allDayCovers(oneDay, '2026-10-10')).toBe(false);
  expect(allDayCovers({ is_all_day: true, start_at: '2026-10-09T00:00:00Z' }, '2026-10-09')).toBe(
    true,
  );
  expect(allDayCovers({ ...oneDay, is_all_day: false }, '2026-10-09')).toBe(false);
});

test("one day's calendar puts an all day entry on its own date, not the evening before", async () => {
  const rows = {
    timed: [
      {
        id: 'm',
        title: 'Standup',
        start_at: '2026-10-08T16:00:00Z',
        end_at: '2026-10-08T16:30:00Z',
        is_all_day: false,
      },
      // a whole Friday in New York starts on Thursday evening where they are
      {
        id: 'l',
        title: 'US office closed',
        start_at: '2026-10-09T04:00:00Z',
        end_at: '2026-10-10T03:59:00Z',
        is_all_day: false,
      },
      // a local Thursday west of UTC holds Friday's midnight UTC
      {
        id: 'o',
        title: 'Office closed',
        start_at: '2026-10-09T00:00:00Z',
        end_at: '2026-10-10T23:59:59Z',
        is_all_day: true,
      },
    ],
    allDay: [
      {
        id: 'o',
        title: 'Office closed',
        start_at: '2026-10-09T00:00:00Z',
        end_at: '2026-10-10T23:59:59Z',
        is_all_day: true,
      },
    ],
  };
  const paths = [];
  const d = {
    select: async (path) => {
      paths.push(path);
      if (!path.startsWith('synced_calendar_events')) return [];
      if (path.includes('is_all_day=eq.true')) return rows.allDay;
      // the timed read is bounded by the local day
      const q = new URLSearchParams(path.split('?')[1]);
      const [from, to] = q.getAll('start_at').map((v) => v.replace(/^(gte|lt)\./, ''));
      return rows.timed.filter((e) => e.start_at >= from && e.start_at < to);
    },
  };
  const [thursday] = await Promise.all(calendarSelects(d, 'u1', TZ, '2026-10-08'));
  expect(thursday.map((e) => e.title)).toEqual(['Standup']);
  const [friday] = await Promise.all(calendarSelects(d, 'u1', TZ, '2026-10-09'));
  expect(friday.map((e) => e.title)).toEqual(['Office closed', 'US office closed']);
  expect(paths.filter((p) => p.startsWith('synced_calendar_events'))).toHaveLength(4);
});

test('the week starts on their day when it is given: after midnight that is still yesterday', async () => {
  // 1:46am on Sunday 4 Oct where they are; with a day that ends at 3am it is still Saturday for them
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T08:46:00Z'));
  const asked = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    asked.push(new URL(url));
    return { ok: true, text: async () => '[]' };
  });
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_KEY: 'test-key' };

  const theirs = await readWeekAhead('u1', TZ, env, { today: Promise.resolve('2026-10-03') });
  expect(theirs.first).toBe('2026-10-03');
  expect(theirs.days.map((d) => d.date).slice(0, 3)).toEqual([
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
  ]);
  // so "tomorrow" is the Sunday, and the todos read start from their day
  expect(formatWeekAhead(theirs)).toContain('Sun 4 Oct (tomorrow)');
  // a todo is on its planned day, or with none its deadline (shared/todoDay.js)
  const todosRead = asked.find(
    (u) =>
      u.pathname.endsWith('/todos') && (u.searchParams.get('or') || '').includes('due_day.gte.'),
  );
  expect(todosRead.searchParams.get('or')).toBe(
    '(and(due_day.gte.2026-10-03,due_day.lte.2026-10-09),and(due_day.is.null,scheduled_date.gte.2026-10-03,scheduled_date.lte.2026-10-09),and(due_day.is.null,scheduled_date.is.null,target_date.gte.2026-10-03,target_date.lte.2026-10-09))',
  );

  // with no day given, and with one that could not be read, it is the calendar's date
  expect((await readWeekAhead('u1', TZ, env)).first).toBe('2026-10-04');
  expect(
    (await readWeekAhead('u1', TZ, env, { today: Promise.reject(new Error('down')) })).first,
  ).toBe('2026-10-04');
});

test('every todo planned for a day is named, so the whole list can be given when asked', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m${i + 1}`,
      name: `Thing ${i + 1}`,
      due_day: '2026-10-05',
    }));
  const weekWith = (n) =>
    weekFrom({
      first: FIRST,
      tz: TZ,
      synced: { timed: [], long: [], allDay: [] },
      noteEvents: [],
      quickEvents: [],
      todos: many(n),
      overdue: [],
      cancelledIds: [],
    });

  const text = formatWeekAhead(weekWith(47), { ids: true });
  expect(text).toContain('Thing 1 (id m1)');
  expect(text).toContain('Thing 16 (id m16)');
  expect(text).toContain('Thing 47 (id m47)');
  expect(text).not.toContain('more (');

  // past what one day's read holds, the count is still said
  const over = formatWeekAhead(weekWith(53));
  expect(over).toContain('Thing 50');
  expect(over).not.toContain('Thing 51');
  expect(over).toContain('and 3 more (53 in all)');
});

test('a todo with a deadline and no day planned is on its deadline day, and past it after (stage 2c)', () => {
  const w = weekFrom({
    first: FIRST,
    tz: TZ,
    synced: { timed: [], allDay: [] },
    noteEvents: [],
    quickEvents: [],
    todos: [
      { id: 'r', name: 'Send the report', due_day: null, target_date: '2026-10-06' },
      { id: 'p', name: 'Planned', due_day: '2026-10-05', target_date: '2026-10-06' },
    ],
    overdue: [{ id: 'o', name: 'Pay the bill', due_day: null, target_date: '2026-10-01' }],
    cancelledIds: [],
  });
  const on = (date) => w.days.find((d) => d.date === date).todos.map((t) => t.id);
  expect(on('2026-10-06')).toEqual(['r']);
  expect(on('2026-10-05')).toEqual(['p']);
  expect(w.overdue).toEqual([
    { id: 'o', title: 'Pay the bill', due_day: '2026-10-01', deadline: true },
  ]);
  const text = formatWeekAhead(w);
  expect(text).toContain('Send the report, due by its deadline, no day planned');
  expect(text).toContain(', its deadline)');
});
