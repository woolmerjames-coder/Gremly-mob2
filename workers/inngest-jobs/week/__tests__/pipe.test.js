/**
 * @jest-environment node
 */
// The weekly pipe and the read's two ways in (workers/inngest-jobs/week): who
// is due, which read serves a review started on a day, and what is kept on
// the week's row. No model is called here.

import {
  ensureWeekRead,
  ensureWeekSpread,
  handleWeekReadApi,
  handleWeekSpreadApi,
  keepWeekRead,
  pipeDueDay,
  pipesDue,
  prepareWeekRead,
  readEffort,
} from '../index';
import { slotHour, weekSettings } from '../settings';
import { lastCompleteWeekEnd } from '../../context/functions';
import { db, userTimezone } from '../../context/db';
import { dayEndHourOf } from '../../../shared/day.js';

jest.mock('../../context/db', () => ({
  ...jest.requireActual('../../context/db'),
  db: jest.fn(),
  userTimezone: jest.fn(),
}));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  dayEndHourOf: jest.fn(),
}));

const USER = '11111111-2222-4333-8444-555555555555';
const LA = 'America/Los_Angeles';
// Sunday 4 October 2026, 3:10pm in Los Angeles
const SUNDAY_3PM = new Date('2026-10-04T22:10:00Z');

/**
 * A stand in for the database: what each table hands back, and every call
 * made. rows, when given, are what the week's row reads as each time it is
 * looked at, the last one from then on.
 */
function fakeDb({
  prefs = {},
  row = null,
  rows,
  finished = [],
  people = [],
  allPrefs = [],
  insert,
} = {}) {
  const calls = [];
  const looks = rows ? [...rows] : null;
  const d = {
    calls,
    select: jest.fn(async (path) => {
      calls.push(['select', path]);
      if (path.startsWith('notification_preferences?user_id=eq.')) return [prefs];
      if (path.startsWith('notification_preferences?user_id=in.')) return allPrefs;
      if (path.includes('status=eq.done')) return finished;
      if (path.startsWith('weekly_reviews?')) {
        const now = looks ? (looks.length > 1 ? looks.shift() : looks[0]) : row;
        return now ? [now] : [];
      }
      return [];
    }),
    insert: jest.fn(async (table, list) => {
      calls.push(['insert', table, list]);
      if (insert) return insert(table, list);
      return list.map((r) => ({ id: 'row-new', answers: {}, checkins: [], ...r }));
    }),
    update: jest.fn(async (path, patch) => {
      calls.push(['update', path, patch]);
      return [{ ...row, ...patch }];
    }),
    rpc: jest.fn(async () => people),
  };
  return d;
}

const READ = { challenge: { headline: 'A full week' } };
const made = () => ({
  gather: jest.fn(async (_env, _userId, p) => ({ today: p.today, first: p.first, last: p.last })),
  run: jest.fn(async () => ({
    read: READ,
    dropped: [],
    model: 'gpt-6-luna',
    figures: { open: 3 },
    prompt_version: 'week-read-test',
  })),
});

beforeEach(() => {
  userTimezone.mockResolvedValue(LA);
  dayEndHourOf.mockResolvedValue(3);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the weekly slot', () => {
  it('reads the hour of the slot, 6pm when none is kept', () => {
    expect(slotHour('18:00')).toBe(18);
    expect(slotHour('07:30')).toBe(7);
    expect(slotHour('20:11')).toBe(20);
    expect(slotHour(null)).toBe(18);
    expect(slotHour('late')).toBe(18);
  });

  it('gives the defaults for anything not set', async () => {
    db.mockReturnValue(fakeDb({ prefs: {} }));
    expect(await weekSettings({}, USER)).toEqual({
      weekly_day: 0,
      days_off: [0, 6],
      weekly_time: '18:00',
    });
    db.mockReturnValue(
      fakeDb({ prefs: { weekly_day: 3, days_off: [5, 6], weekly_time: '09:00' } }),
    );
    expect(await weekSettings({}, USER)).toEqual({
      weekly_day: 3,
      days_off: [5, 6],
      weekly_time: '09:00',
    });
  });
});

describe('when a pipe is due', () => {
  const sundaySix = { timezone: LA, weekly_day: 0, weekly_time: '18:00' };
  // Los Angeles is seven hours behind UTC in October
  const la = (day, hour) => new Date(Date.parse(`${day}T00:00:05Z`) + (hour + 7) * 3600e3);

  it('is in the three hours before their slot, on their weekly day', () => {
    expect(pipeDueDay(sundaySix, la('2026-10-04', 14))).toBeNull();
    expect(pipeDueDay(sundaySix, la('2026-10-04', 15))).toBe('2026-10-04');
    expect(pipeDueDay(sundaySix, la('2026-10-04', 16))).toBe('2026-10-04');
    // 5pm in Los Angeles is midnight UTC on the Monday
    expect(pipeDueDay(sundaySix, new Date('2026-10-05T00:00:05Z'))).toBe('2026-10-04');
    // at the slot itself the summary goes out; the pipe is not asked for again
    expect(pipeDueDay(sundaySix, new Date('2026-10-05T01:00:05Z'))).toBeNull();
    expect(pipeDueDay(sundaySix, la('2026-10-03', 15))).toBeNull();
  });

  it('follows their own day, hour and place', () => {
    const wednesdayNine = { timezone: 'Europe/London', weekly_day: 3, weekly_time: '09:00' };
    // London is an hour ahead of UTC in early October: 6am there is 5am UTC
    expect(pipeDueDay(wednesdayNine, new Date('2026-10-07T05:00:05Z'))).toBe('2026-10-07');
    expect(pipeDueDay(wednesdayNine, new Date('2026-10-07T04:00:05Z'))).toBeNull();
    expect(pipeDueDay(wednesdayNine, new Date('2026-10-04T05:00:05Z'))).toBeNull();
    // nothing kept: Sunday at 6pm in Los Angeles
    expect(pipeDueDay({}, la('2026-10-04', 15))).toBe('2026-10-04');
  });

  it('starts the evening before for a slot in the small hours, for the weekly day itself', () => {
    const sundayOne = { timezone: LA, weekly_day: 0, weekly_time: '01:00' };
    // 10pm on Saturday in Los Angeles
    expect(pipeDueDay(sundayOne, la('2026-10-03', 22))).toBe('2026-10-04');
    expect(pipeDueDay(sundayOne, la('2026-10-03', 21))).toBeNull();
  });

  it('says so when a timezone does not exist', () => {
    expect(() => pipeDueDay({ timezone: 'Mars/Olympus' }, SUNDAY_3PM)).toThrow();
  });

  it('finds everyone active whose slot is near, and reports a place it cannot read', async () => {
    const OTHER = '99999999-2222-4333-8444-555555555555';
    const LOST = '77777777-2222-4333-8444-555555555555';
    const d = fakeDb({
      people: [
        { user_id: USER, timezone: LA },
        { user_id: OTHER, timezone: 'Europe/London' },
        { user_id: LOST, timezone: 'Mars/Olympus' },
      ],
      allPrefs: [{ user_id: OTHER, weekly_day: 0, weekly_time: '18:00' }],
    });
    db.mockReturnValue(d);
    // 3:10pm Sunday in Los Angeles is 11:10pm in London
    expect(await pipesDue({}, SUNDAY_3PM)).toEqual([{ user_id: USER, day: '2026-10-04' }]);
    expect(d.rpc).toHaveBeenCalledWith('get_active_people', { active_days: 30 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(LOST));
  });
});

describe('the day that ends their last whole week', () => {
  it('is today on their weekly day, otherwise the weekly day before', () => {
    expect(lastCompleteWeekEnd(LA, 0, SUNDAY_3PM)).toBe('2026-10-04');
    expect(lastCompleteWeekEnd(LA, 0, new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-04');
    expect(lastCompleteWeekEnd(LA, 3, new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-07');
    expect(lastCompleteWeekEnd(LA, 3, SUNDAY_3PM)).toBe('2026-09-30');
    expect(lastCompleteWeekEnd(LA, undefined, SUNDAY_3PM)).toBe('2026-10-04');
  });
});

describe('the read for a review', () => {
  it('is made on a first open on the weekly day, and the week gets its row', async () => {
    const d = fakeDb();
    db.mockReturnValue(d);
    const deps = made();
    const r = await ensureWeekRead({}, USER, { today: '2026-10-04', at: SUNDAY_3PM, deps });
    expect(r.made).toBe(true);
    expect(r.on).toMatchObject({
      kind: 'weekly',
      week_start: '2026-10-05',
      span_start: '2026-10-05',
    });
    // the days it plans: Monday to Sunday of the new week
    expect(deps.gather.mock.calls[0][2]).toMatchObject({
      today: '2026-10-04',
      first: '2026-10-05',
      last: '2026-10-11',
      week_start: '2026-10-05',
      tz: LA,
      days_off: [0, 6],
    });
    const [table, rows] = d.insert.mock.calls[0];
    expect(table).toBe('weekly_reviews');
    expect(rows[0]).toMatchObject({
      owner_id: USER,
      week_start: '2026-10-05',
      span_start: '2026-10-05',
      status: 'ready',
      kind: 'weekly',
      prompt_versions: { read: 'week-read-test' },
    });
    expect(rows[0].read).toMatchObject({
      ...READ,
      version: 'week-read-test',
      made_on: '2026-10-04',
      model: 'gpt-6-luna',
      first: '2026-10-05',
      last: '2026-10-11',
      dropped: 0,
    });
    expect(r.review.read.challenge).toEqual(READ.challenge);
  });

  it('is the one the row holds on the weekly day and the two days after', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'ready',
      read: READ,
    };
    db.mockReturnValue(fakeDb({ row }));
    const deps = made();
    // Tuesday 6 October, 9am in Los Angeles
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-06T16:00:00Z'), deps });
    expect(r).toMatchObject({ made: false, review: row });
    // the rest of the new week
    expect(r.on).toMatchObject({
      kind: 'weekly',
      week_start: '2026-10-05',
      span_start: '2026-10-06',
    });
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('is fresh for the one extra review of a week, and leaves a finished week finished', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'done',
      read: READ,
      prompt_versions: { read: 'older', spread: 'spread-1' },
    };
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = made();
    // Wednesday 7 October in Los Angeles
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-07T19:00:00Z'), deps });
    expect(r.made).toBe(true);
    expect(r.on).toMatchObject({ kind: 'extra', span_start: '2026-10-07', span_end: '2026-10-11' });
    expect(d.insert).not.toHaveBeenCalled();
    const [path, patch] = d.update.mock.calls[0];
    expect(path).toBe(`weekly_reviews?id=eq.row-1&owner_id=eq.${USER}`);
    expect(patch).toMatchObject({
      kind: 'extra',
      span_start: '2026-10-07',
      prompt_versions: { read: 'week-read-test', spread: 'spread-1' },
    });
    // the review's own progress is the app's to move
    expect(patch).not.toHaveProperty('status');
  });

  it('makes a week that was only ready or skipped ready again', async () => {
    for (const status of ['ready', 'skipped']) {
      const d = fakeDb({
        row: { id: 'row-1', week_start: '2026-10-05', kind: 'weekly', status, read: READ },
      });
      db.mockReturnValue(d);
      await ensureWeekRead({}, USER, { at: new Date('2026-10-07T19:00:00Z'), deps: made() });
      expect(d.update.mock.calls[0][1]).toMatchObject({ status: 'ready', kind: 'extra' });
    }
  });

  it('is the same read again once the extra is used', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'extra',
      status: 'started',
      read: READ,
    };
    db.mockReturnValue(fakeDb({ row }));
    const deps = made();
    // Friday 9 October
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-09T19:00:00Z'), deps });
    expect(r).toMatchObject({ made: false, review: row });
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('brings next week forward the day before the weekly day', async () => {
    const d = fakeDb();
    db.mockReturnValue(d);
    const deps = made();
    // Saturday 10 October
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-10T19:00:00Z'), deps });
    expect(r.on).toMatchObject({
      kind: 'brought_forward',
      week_start: '2026-10-12',
      span_start: '2026-10-12',
      span_end: '2026-10-18',
    });
    expect(d.insert.mock.calls[0][1][0]).toMatchObject({
      week_start: '2026-10-12',
      kind: 'brought_forward',
    });
    expect(
      d.calls.find(([op, path]) => op === 'select' && path.includes('week_start=eq.'))[1],
    ).toContain('week_start=eq.2026-10-12');
  });

  it("works from the person's day: the app's when it is near, the small hours as the day before", async () => {
    db.mockReturnValue(fakeDb());
    // 1am on Monday in Los Angeles: their Sunday has not ended
    const late = new Date('2026-10-05T08:00:00Z');
    let r = await ensureWeekRead({}, USER, { at: late, deps: made() });
    expect(r.on).toMatchObject({
      kind: 'weekly',
      week_start: '2026-10-05',
      span_start: '2026-10-05',
    });
    // Tuesday morning here, and the app says it is already Wednesday (its own
    // clock is the person's): taken, as it is a day away at most, so the review
    // is Wednesday's, the extra, where Tuesday's would be the weekly one
    const tuesday = new Date('2026-10-06T16:00:00Z');
    r = await ensureWeekRead({}, USER, { at: tuesday, deps: made() });
    expect(r.on).toMatchObject({ kind: 'weekly', span_start: '2026-10-06' });
    r = await ensureWeekRead({}, USER, { today: '2026-10-07', at: tuesday, deps: made() });
    expect(r.on).toMatchObject({ kind: 'extra', span_start: '2026-10-07' });
    // a date nowhere near their day, or not a day at all, is not taken
    for (const today of ['2026-11-20', '2026-13-01', 'today']) {
      r = await ensureWeekRead({}, USER, { today, at: SUNDAY_3PM, deps: made() });
      expect(r.on.week_start).toBe('2026-10-05');
    }
  });

  it('is made ahead for everyone the pipe runs for, whether or not they have done a review', async () => {
    const quiet = fakeDb({ finished: [] });
    db.mockReturnValue(quiet);
    const deps = made();
    const r = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      ahead: true,
      at: SUNDAY_3PM,
      deps,
    });
    expect(r.made).toBe(true);
    expect(deps.run).toHaveBeenCalledTimes(1);
    // nobody's past reviews are looked up to decide it
    expect(
      quiet.calls.some(([op, path]) => op === 'select' && path.includes('status=eq.done')),
    ).toBe(false);
  });

  it('can be kept to people who finished a review in the last four weeks (the rule, switched off)', async () => {
    const quiet = fakeDb({ finished: [] });
    db.mockReturnValue(quiet);
    let deps = made();
    let r = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      ahead: true,
      needsReview: true,
      at: SUNDAY_3PM,
      deps,
    });
    expect(r).toMatchObject({ made: false, skipped: 'no review finished in four weeks' });
    expect(deps.run).not.toHaveBeenCalled();
    const asked = quiet.calls.find(
      ([op, path]) => op === 'select' && path.includes('status=eq.done'),
    )[1];
    // four weeks back from the start of their Sunday, in their own time
    expect(asked).toContain(`completed_at=gte.${encodeURIComponent('2026-09-06T07:00:00.000Z')}`);

    db.mockReturnValue(fakeDb({ finished: [{ id: 'row-0' }] }));
    deps = made();
    r = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      ahead: true,
      needsReview: true,
      at: SUNDAY_3PM,
      deps,
    });
    expect(r.made).toBe(true);
    expect(deps.run).toHaveBeenCalledTimes(1);
  });

  it('carries on a review started in its window on a later day, with its read and the extra unused', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'started',
      read: READ,
    };
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = made();
    // Wednesday 7 October in Los Angeles: by the date, the day of the extra
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-07T19:00:00Z'), deps });
    expect(r).toMatchObject({ made: false, review: row });
    expect(r.on).toMatchObject({
      kind: 'weekly',
      resumed: true,
      week_start: '2026-10-05',
      span_start: '2026-10-07',
      span_end: '2026-10-11',
    });
    expect(deps.run).not.toHaveBeenCalled();
    // nothing about the week's row is changed: it is not the extra's
    expect(d.update).not.toHaveBeenCalled();
    expect(d.insert).not.toHaveBeenCalled();
  });

  it('gives a review under way that has lost its read a new one, still not the extra', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'started',
      read: null,
    };
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = made();
    const r = await ensureWeekRead({}, USER, { at: new Date('2026-10-07T19:00:00Z'), deps });
    expect(r.made).toBe(true);
    expect(d.update.mock.calls[0][1]).toMatchObject({ kind: 'weekly', span_start: '2026-10-07' });
    expect(d.update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(deps.run.mock.calls[0][2]).toEqual({ effort: 'medium' });
  });

  it('thinks at medium effort for every review, the midweek extra too', async () => {
    expect(readEffort({ kind: 'weekly' })).toBe('medium');
    expect(readEffort({ kind: 'brought_forward' })).toBe('medium');
    expect(readEffort({ kind: 'extra' })).toBe('medium');
    const effortOn = async (p) => {
      db.mockReturnValue(fakeDb());
      const deps = made();
      const r = await ensureWeekRead({}, USER, { ...p, deps });
      return [r.on.kind, deps.run.mock.calls[0][2]];
    };
    // the read ahead on their weekly day, and a first open in the window
    expect(await effortOn({ today: '2026-10-04', ahead: true, at: SUNDAY_3PM })).toEqual([
      'weekly',
      { effort: 'medium' },
    ]);
    expect(await effortOn({ at: new Date('2026-10-06T16:00:00Z') })).toEqual([
      'weekly',
      { effort: 'medium' },
    ]);
    // Saturday 10 October: next week, brought forward
    expect(await effortOn({ at: new Date('2026-10-10T19:00:00Z') })).toEqual([
      'brought_forward',
      { effort: 'medium' },
    ]);
    // Wednesday 7 October: the extra, behind the loading screen
    expect(await effortOn({ at: new Date('2026-10-07T19:00:00Z') })).toEqual([
      'extra',
      { effort: 'medium' },
    ]);
  });

  it('is not made ahead twice, nor over a week brought forward', async () => {
    for (const kind of ['weekly', 'brought_forward']) {
      const row = { id: 'row-1', week_start: '2026-10-05', kind, status: 'done', read: READ };
      db.mockReturnValue(fakeDb({ row, finished: [{ id: 'row-1' }] }));
      const deps = made();
      const r = await ensureWeekRead({}, USER, {
        today: '2026-10-04',
        ahead: true,
        at: SUNDAY_3PM,
        deps,
      });
      expect(r).toMatchObject({ made: false, review: row });
      expect(deps.run).not.toHaveBeenCalled();
    }
  });

  it('is not made ahead over their word that this week is not for planning', async () => {
    const row = { id: 'row-1', week_start: '2026-10-05', kind: 'weekly', status: 'skipped' };
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = made();
    const r = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      ahead: true,
      at: SUNDAY_3PM,
      deps,
    });
    expect(r).toMatchObject({ made: false, skipped: 'they said not this week' });
    expect(deps.run).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();

    // opened by them afterwards, the read is made and the week is ready again
    const again = made();
    const opened = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      at: SUNDAY_3PM,
      deps: again,
    });
    expect(opened.made).toBe(true);
    expect(d.update.mock.calls[0][1]).toMatchObject({ status: 'ready' });
  });

  it('is not made ahead once the day is outside their weekly window, so it never takes the extra', async () => {
    // they moved their weekly day to Thursday while the pipe for Sunday waited
    const done = {
      id: 'row-1',
      week_start: '2026-10-02',
      kind: 'weekly',
      status: 'done',
      read: READ,
    };
    const d = fakeDb({ prefs: { weekly_day: 4 }, row: done });
    db.mockReturnValue(d);
    const deps = made();
    const r = await ensureWeekRead({}, USER, {
      today: '2026-10-04',
      ahead: true,
      at: SUNDAY_3PM,
      deps,
    });
    expect(r).toMatchObject({ made: false, skipped: 'the day is not in their weekly window' });
    expect(deps.run).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it('lets its own read go when another was kept while it was being made', async () => {
    const other = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'started',
      read: { challenge: { headline: 'The first one' } },
    };
    // no row when the read is started, one that serves by the time it is made
    const d = fakeDb({ rows: [null, other] });
    db.mockReturnValue(d);
    const deps = made();
    const r = await ensureWeekRead({}, USER, { at: SUNDAY_3PM, deps });
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ made: false, review: other });
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it('lets its own read go when the row appears as it is being kept', async () => {
    const other = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'ready',
      read: READ,
    };
    const taken = () => {
      throw new Error('Supabase POST weekly_reviews failed: 409 duplicate key value');
    };
    // nothing there on both looks, then the insert finds the week taken
    const d = fakeDb({ rows: [null, null, other], insert: taken });
    db.mockReturnValue(d);
    const r = await ensureWeekRead({}, USER, { at: SUNDAY_3PM, deps: made() });
    expect(r).toMatchObject({ made: false, review: other });

    // a save that fails for any other reason is said, not swallowed
    db.mockReturnValue(fakeDb({ insert: taken }));
    await expect(ensureWeekRead({}, USER, { at: SUNDAY_3PM, deps: made() })).rejects.toThrow(
      'weekly_reviews failed',
    );
  });

  it('makes the read and keeps it in two halves, so a failed save does not pay twice', async () => {
    const d = fakeDb();
    db.mockReturnValue(d);
    const deps = made();
    const first = await prepareWeekRead({}, USER, { today: '2026-10-04', at: SUNDAY_3PM, deps });
    // nothing is written while the read is made
    expect(d.insert).not.toHaveBeenCalled();
    expect(first.read).toMatchObject({ ...READ, made_on: '2026-10-04' });
    // the read travels as plain data between the two
    const carried = JSON.parse(JSON.stringify({ on: first.on, read: first.read }));
    const kept = await keepWeekRead({}, USER, carried.on, carried.read);
    expect(kept.made).toBe(true);
    await keepWeekRead({}, USER, carried.on, carried.read);
    expect(deps.run).toHaveBeenCalledTimes(1);
  });

  it('reports what the check dropped', async () => {
    db.mockReturnValue(fakeDb());
    const deps = made();
    deps.run.mockResolvedValue({
      read: READ,
      dropped: [
        { what: 'priority_item', why: 'unknown_id' },
        { what: 'priority_item', why: 'unknown_id' },
      ],
      model: 'gpt-6-luna',
      figures: {},
      prompt_version: 'week-read-test',
    });
    const r = await ensureWeekRead({}, USER, { at: SUNDAY_3PM, deps });
    expect(r.review.read.dropped).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dropped 2 from the read'));
  });
});

describe('the spread for a review', () => {
  const row = {
    id: 'row-1',
    week_start: '2026-10-05',
    kind: 'weekly',
    status: 'started',
    read: READ,
    answers: { hours: { normal_day: 2 } },
    prompt_versions: { read: 'week-read-test' },
  };
  const spreadDeps = () => ({
    gather: jest.fn(async (_env, _userId, p) => ({
      today: p.today,
      first: p.first,
      last: p.last,
      todos: [],
    })),
    run: jest.fn(async () => ({
      place: [{ id: 'todo-1', day: '2026-10-06' }],
      later: [{ id: 'todo-2', back_on: '2026-10-13' }],
      notes: [],
      dropped: [],
      counts: { placed: 1, later: 1 },
      frame: { days: ['2026-10-05'], basis: 'the basis', habits: [{ id: 'h1', days: [] }] },
      model: 'gpt-6-luna',
      prompt_version: 'week-spread-test',
      effort: 'low',
    })),
    // the frame both are made from, and the suggestions for their over-full days
    frame: jest.fn(() => ({
      days: ['2026-10-05', '2026-10-06'],
      relief_basis: 'the relief basis',
      fixed: new Map([['todo-7', '2026-10-06']]),
      room: [
        { day: '2026-10-05', fixed: 0, over: 0 },
        { day: '2026-10-06', fixed: 160, over: 40 },
      ],
    })),
    relief: jest.fn(async () => ({
      days: [
        {
          day: '2026-10-06',
          over: 40,
          moves: [{ id: 'todo-7', to: '2026-10-05', back_on: null }],
          still: 0,
          note: '',
        },
      ],
      dropped: [],
      counts: { over_full: 1, moves: 1 },
      model: 'gpt-6-luna',
      prompt_version: 'week-relief-test',
    })),
  });

  it('is made from the review under way and kept on its row, with nothing else written', async () => {
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = spreadDeps();
    const board = { placed: [{ id: 'todo-9', day: '2026-10-07' }] };
    const r = await ensureWeekSpread({}, USER, {
      today: '2026-10-04',
      at: SUNDAY_3PM,
      board,
      deps,
    });
    expect(deps.gather.mock.calls[0][2]).toMatchObject({
      today: '2026-10-04',
      first: '2026-10-05',
      last: '2026-10-11',
      week_start: '2026-10-05',
    });
    // the review's row and their own moves on the board go to the spread
    expect(deps.run.mock.calls[0][2]).toBe(row);
    expect(deps.run.mock.calls[0][3]).toEqual({ board });
    expect(r.on).toMatchObject({ kind: 'weekly', week_start: '2026-10-05' });
    expect(r.spread).toMatchObject({
      version: 'week-spread-test',
      basis: 'the basis',
      place: [{ id: 'todo-1', day: '2026-10-06' }],
      later: [{ id: 'todo-2', back_on: '2026-10-13' }],
    });
    expect(d.update).toHaveBeenCalledTimes(1);
    const [path, patch] = d.update.mock.calls[0];
    expect(path).toBe(`weekly_reviews?id=eq.row-1&owner_id=eq.${USER}`);
    // the answers and how far the review has got are the app's: only the spread is written
    expect(Object.keys(patch).sort()).toEqual(['prompt_versions', 'spread']);
    expect(patch.prompt_versions).toEqual({
      read: 'week-read-test',
      spread: 'week-spread-test',
      relief: 'week-relief-test',
    });
    // the suggestions for their over-full days are made beside it, from the same frame, and kept with it
    expect(deps.frame).toHaveBeenCalledWith(expect.anything(), row, board);
    expect(deps.relief.mock.calls[0][2]).toBe(deps.frame.mock.results[0].value);
    expect(r.spread.relief).toMatchObject({
      version: 'week-relief-test',
      model: 'gpt-6-luna',
      days: [{ day: '2026-10-06', over: 40, moves: [{ id: 'todo-7', to: '2026-10-05' }] }],
    });
    expect(r.spread.relief.failed).toBeUndefined();
    expect(r.spread.relief.basis).toBe('the relief basis');
  });

  it('keeps the spread when no moves could be suggested, and names the over-full days with none', async () => {
    const d = fakeDb({ row });
    db.mockReturnValue(d);
    const deps = spreadDeps();
    deps.relief.mockRejectedValue(new Error('the model did not answer'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await ensureWeekSpread({}, USER, { today: '2026-10-04', at: SUNDAY_3PM, deps });
    expect(r.spread.place).toEqual([{ id: 'todo-1', day: '2026-10-06' }]);
    expect(r.spread.relief).toMatchObject({
      failed: true,
      days: [{ day: '2026-10-06', over: 40, moves: [], still: 40, note: '' }],
    });
    expect(d.update).toHaveBeenCalledTimes(1);
  });

  it('says so when there is no review with a read to spread', async () => {
    for (const none of [null, { ...row, read: null }]) {
      db.mockReturnValue(fakeDb({ row: none }));
      const deps = spreadDeps();
      await expect(
        ensureWeekSpread({}, USER, { today: '2026-10-04', at: SUNDAY_3PM, deps }),
      ).rejects.toThrow('there is no review with a read to spread');
      expect(deps.run).not.toHaveBeenCalled();
    }
  });

  it('carries on a review begun in its window: the rest of the week, from today', async () => {
    db.mockReturnValue(fakeDb({ row }));
    const deps = spreadDeps();
    // Wednesday 7 October: by the date alone this would be the extra
    const r = await ensureWeekSpread({}, USER, {
      at: new Date('2026-10-07T19:00:00Z'),
      deps,
    });
    expect(r.on).toMatchObject({ kind: 'weekly', resumed: true });
    expect(deps.gather.mock.calls[0][2]).toMatchObject({
      first: '2026-10-07',
      last: '2026-10-11',
    });
  });

  it('answers the route, and says what went wrong', async () => {
    const corsResponse = (body, status = 200) => ({ body, status });
    const bad = await handleWeekSpreadApi(
      { json: async () => ({ user_id: 'nobody' }) },
      {},
      corsResponse,
    );
    expect(bad).toEqual({ body: { error: 'user_id is required' }, status: 400 });
    db.mockReturnValue(fakeDb({ row: null }));
    const none = await handleWeekSpreadApi(
      { json: async () => ({ user_id: USER, date: '2026-10-04' }) },
      {},
      corsResponse,
    );
    expect(none.status).toBe(500);
    expect(none.body.error).toContain('there is no review with a read to spread');
  });
});

describe('the route', () => {
  const answer = (body, status = 200) => ({ body, status });
  const request = (body) => ({ json: async () => body });

  it('needs a person', async () => {
    expect(await handleWeekReadApi(request({}), {}, answer)).toEqual({
      body: { error: 'user_id is required' },
      status: 400,
    });
    expect((await handleWeekReadApi(request({ user_id: 'me' }), {}, answer)).status).toBe(400);
  });

  it('hands back the week and keeps the work alive past the request', async () => {
    const row = {
      id: 'row-1',
      week_start: '2026-10-05',
      kind: 'weekly',
      status: 'ready',
      read: READ,
    };
    db.mockReturnValue(fakeDb({ row }));
    jest.useFakeTimers().setSystemTime(SUNDAY_3PM);
    const kept = [];
    const got = await handleWeekReadApi(
      request({ user_id: USER, date: '2026-10-04' }),
      {},
      answer,
      { waitUntil: (p) => kept.push(p) },
    );
    jest.useRealTimers();
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ made: false, review: row, on: { kind: 'weekly' } });
    expect(kept).toHaveLength(1);
  });

  it('says what went wrong', async () => {
    db.mockReturnValue({
      select: async () => {
        throw new Error('Supabase GET weekly_reviews failed: 500');
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const got = await handleWeekReadApi(request({ user_id: USER }), {}, answer);
    expect(got.status).toBe(500);
    expect(got.body.error).toContain('weekly_reviews failed');
  });
});
