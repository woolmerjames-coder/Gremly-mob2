/**
 * The week's review (lib/repo/weekReviewRepo): its answers and check ins are
 * each one JSON value changed by read, merge, write, so two changes that
 * overlap must not undo each other; and the week's two settings are read and
 * saved with the notification settings.
 */
let mockRow: Record<string, any> | null = null;
let mockSettings: Record<string, any> | null = null;
// the rows a read of several reviews answers with, and the error it fails with
let mockRows: Record<string, any>[] = [];
let mockReadError: { message: string } | null = null;
// what the database answers a write to weekly_reviews with, when it refuses it
let mockWriteError: { code?: string; message: string } | null = null;
const mockCalls: { table: string; op: string; values?: unknown; filters: [string, unknown][] }[] =
  [];

jest.mock('../../supabase/client', () => {
  const later = <T>(value: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value()), 5));
  return {
    supabase: {
      from: (table: string) => {
        const call = {
          table,
          op: 'select',
          values: undefined as unknown,
          filters: [] as [string, unknown][],
        };
        mockCalls.push(call);
        const read = () => ({
          data: table === 'weekly_reviews' ? (mockRow ? { ...mockRow } : null) : mockSettings,
          error: null,
        });
        const chain: any = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return chain;
          },
          gte: (column: string, value: unknown) => {
            call.filters.push([`${column}>=`, value]);
            return chain;
          },
          lte: (column: string, value: unknown) => {
            call.filters.push([`${column}<=`, value]);
            return chain;
          },
          neq: (column: string, value: unknown) => {
            call.filters.push([`${column}!=`, value]);
            return chain;
          },
          // a read of several rows: every review that holds a check in
          limit: () => later(() => ({ data: mockRows, error: mockReadError })),
          maybeSingle: () => later(call.op === 'select' ? read : chain.write),
          insert: (values: Record<string, unknown>) => {
            call.op = 'insert';
            call.values = values;
            chain.write = () => {
              if (mockWriteError) return { data: null, error: mockWriteError };
              mockRow = { id: 'r-new', answers: {}, checkins: [], ...values };
              return { data: { ...mockRow }, error: null };
            };
            return chain;
          },
          update: (values: Record<string, unknown>) => {
            call.op = 'update';
            call.values = values;
            chain.write = () => {
              if (table === 'weekly_reviews') {
                if (mockWriteError) return { data: null, error: mockWriteError };
                if (!mockRow) return { data: null, error: null };
                mockRow = { ...mockRow, ...values };
                return { data: { ...mockRow }, error: null };
              }
              // an update matches the person's settings row, when they have one
              if (!mockSettings) return { data: null, error: null };
              mockSettings = { ...mockSettings, ...values };
              return { data: { ...mockSettings }, error: null };
            };
            return chain;
          },
          // an update with no select is awaited as it is
          then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
            later(chain.write).then(ok, bad),
        };
        return chain;
      },
    },
  };
});

import {
  changeWeekReview,
  createWeekReview,
  getDoneWeekReviews,
  getDueCheckIns,
  getWeekReview,
  getWeekSettings,
  moveWeekReview,
  saveDaysOff,
  saveWeeklyDay,
  settleCheckIn,
} from '../weekReviewRepo';

beforeEach(() => {
  mockCalls.length = 0;
  mockWriteError = null;
  mockRow = {
    id: 'r1',
    owner_id: 'u1',
    week_start: '2026-10-05',
    span_start: '2026-10-05',
    status: 'started',
    kind: 'weekly',
    answers: { hours: { normal_day: 2 } },
    checkins: [],
  };
  mockSettings = { weekly_day: 3, days_off: [5, 6] };
});

describe("the week's review", () => {
  it('is read by the person and the first day of its week', async () => {
    const row = await getWeekReview('u1', '2026-10-05');
    expect(row).toMatchObject({ id: 'r1', answers: { hours: { normal_day: 2 } }, checkins: [] });
    expect(mockCalls[0]).toMatchObject({
      table: 'weekly_reviews',
      filters: [
        ['owner_id', 'u1'],
        ['week_start', '2026-10-05'],
      ],
    });
  });

  it('is null when the week has none, and never without its answers and check ins', async () => {
    mockRow = null;
    expect(await getWeekReview('u1', '2026-10-05')).toBeNull();
    mockRow = { id: 'r2', week_start: '2026-10-12', answers: null, checkins: null };
    expect(await getWeekReview('u1', '2026-10-12')).toMatchObject({ answers: {}, checkins: [] });
  });

  it('keeps both of two changes made at the same moment', async () => {
    await Promise.all([
      changeWeekReview('r1', (row) => ({ answers: { ...row.answers, busy_days: ['2026-10-08'] } })),
      changeWeekReview('r1', (row) => ({
        checkins: [
          ...row.checkins,
          {
            id: 'c1',
            goal: 'Talk',
            goal_date: '2026-10-20',
            date: '2026-10-12',
            title: 'How is it going?',
            status: 'open',
          },
        ],
      })),
      changeWeekReview('r1', (row) => ({
        answers: { ...row.answers, hours: { ...row.answers.hours, busy_day: 1 } },
      })),
    ]);
    // each waited for the one before it, so each read what the last one wrote
    expect(mockRow).toMatchObject({
      answers: { hours: { normal_day: 2, busy_day: 1 }, busy_days: ['2026-10-08'] },
      checkins: [expect.objectContaining({ id: 'c1' })],
    });
  });

  it('hands back the row as written, or null when it has gone', async () => {
    const saved = await changeWeekReview('r1', () => ({ answers: { busy_days: [] } }));
    expect(saved?.answers).toEqual({ busy_days: [] });
    mockRow = null;
    expect(await changeWeekReview('r1', () => ({ answers: {} }))).toBeNull();
  });
});

describe('how far a review has got', () => {
  it('is written with its answers: started, then done with when it was finished', async () => {
    await changeWeekReview('r1', (row) => ({
      status: 'started',
      answers: { ...row.answers, step: 'priorities' },
    }));
    expect(mockRow).toMatchObject({
      status: 'started',
      answers: { hours: { normal_day: 2 }, step: 'priorities' },
    });
    const done = await changeWeekReview('r1', (row) => ({
      status: 'done',
      completed_at: '2026-10-04T20:00:00Z',
      answers: { ...row.answers, step: 'done' },
    }));
    expect(done).toMatchObject({ status: 'done', completed_at: '2026-10-04T20:00:00Z' });
    expect(done?.answers).toEqual({ hours: { normal_day: 2 }, step: 'done' });
  });

  it('makes a row for a week that has none, as the person', async () => {
    mockRow = null;
    const made = await createWeekReview('u1', {
      week_start: '2026-10-05',
      span_start: '2026-10-05',
      status: 'skipped',
      kind: 'weekly',
    });
    expect(made).toMatchObject({ id: 'r-new', status: 'skipped', answers: {}, checkins: [] });
    const insert = mockCalls.find((c) => c.op === 'insert');
    expect(insert?.values).toEqual({
      owner_id: 'u1',
      week_start: '2026-10-05',
      span_start: '2026-10-05',
      status: 'skipped',
      kind: 'weekly',
    });
  });

  it('hands back the row already there when the week got one in the meantime', async () => {
    // one person has one row a week: the database refuses a second
    mockWriteError = { code: '23505', message: 'duplicate key' };
    const row = await createWeekReview('u1', {
      week_start: '2026-10-05',
      span_start: '2026-10-05',
      status: 'skipped',
      kind: 'weekly',
    });
    expect(row).toMatchObject({ id: 'r1', status: 'started' });
    mockWriteError = { message: 'permission denied' };
    await expect(
      createWeekReview('u1', {
        week_start: '2026-10-05',
        span_start: '2026-10-05',
        status: 'skipped',
        kind: 'weekly',
      }),
    ).rejects.toThrow('permission denied');
  });

  it('moves a review to the week their new weekly day gives', async () => {
    const moved = await moveWeekReview('r1', {
      week_start: '2026-10-08',
      span_start: '2026-10-08',
      kind: 'weekly',
    });
    expect(moved).toMatchObject({ id: 'r1', week_start: '2026-10-08', span_start: '2026-10-08' });
    expect(mockCalls.at(-1)).toMatchObject({ op: 'update', filters: [['id', 'r1']] });
  });

  it('says the week is taken when it already has a review, and changes nothing', async () => {
    mockWriteError = { code: '23505', message: 'duplicate key' };
    expect(
      await moveWeekReview('r1', {
        week_start: '2026-10-08',
        span_start: '2026-10-08',
        kind: 'weekly',
      }),
    ).toBe('taken');
    expect(mockRow).toMatchObject({ week_start: '2026-10-05' });
    mockWriteError = { message: 'offline' };
    await expect(
      moveWeekReview('r1', { week_start: '2026-10-08', span_start: '2026-10-08', kind: 'weekly' }),
    ).rejects.toThrow('offline');
  });
});

describe("the week's settings", () => {
  it('are their weekly day and days off, null when not set', async () => {
    expect(await getWeekSettings('u1')).toEqual({ weekly_day: 3, days_off: [5, 6] });
    expect(mockCalls[0]).toMatchObject({
      table: 'notification_preferences',
      filters: [['user_id', 'u1']],
    });
    mockSettings = null;
    expect(await getWeekSettings('u1')).toEqual({ weekly_day: null, days_off: null });
  });

  it('save the weekly day where the weekly summary reads it', async () => {
    await saveWeeklyDay('u1', 5);
    expect(mockSettings).toMatchObject({ weekly_day: 5 });
    expect(mockCalls[0]).toMatchObject({
      table: 'notification_preferences',
      op: 'update',
      values: { weekly_day: 5 },
      filters: [['user_id', 'u1']],
    });
  });

  it('say so when there is no settings row to keep the weekly day with', async () => {
    mockSettings = null;
    await expect(saveWeeklyDay('u1', 5)).rejects.toThrow('there are no settings to keep it with');
  });
});

describe('their days off', () => {
  it('are saved beside the weekly day', async () => {
    await saveDaysOff('u1', [0, 5]);
    expect(mockSettings).toMatchObject({ weekly_day: 3, days_off: [0, 5] });
    expect(mockCalls.at(-1)).toMatchObject({
      table: 'notification_preferences',
      op: 'update',
      values: { days_off: [0, 5] },
      filters: [['user_id', 'u1']],
    });
  });

  it('say so when there is no settings row to keep them with', async () => {
    mockSettings = null;
    await expect(saveDaysOff('u1', [0, 5])).rejects.toThrow('no settings to keep them with');
  });
});

describe("a milestone's check ins, across the reviews that keep them", () => {
  const check = (id: string, date: string, status = 'open') => ({
    id,
    goal: 'Send the grant application',
    goal_date: '2026-10-20',
    date,
    title: 'See how the draft is coming along',
    status,
  });
  beforeEach(() => {
    mockReadError = null;
    mockRows = [
      {
        id: 'row-old',
        week_start: '2026-09-21',
        checkins: [check('late', '2026-10-06'), check('ahead', '2026-10-15')],
      },
      {
        id: 'row-now',
        week_start: '2026-10-05',
        checkins: [check('today', '2026-10-08'), check('done', '2026-10-08', 'done')],
      },
      { id: 'row-odd', week_start: '2026-10-05', checkins: null },
    ];
  });

  it('are the open ones whose day falls between two days, the earliest first', async () => {
    const due = await getDueCheckIns('user-1', '2026-10-05', '2026-10-08');
    expect(due.map((c) => [c.id, c.row_id])).toEqual([
      ['late', 'row-old'],
      ['today', 'row-now'],
    ]);
    const read = mockCalls[mockCalls.length - 1];
    expect(read.table).toBe('weekly_reviews');
    expect(read.filters).toEqual([
      ['owner_id', 'user-1'],
      // a check in's day can be weeks after the week it was set up in
      ['week_start>=', '2026-04-08'],
      ['checkins!=', '[]'],
    ]);
  });

  it('are none when nothing is due, and say so when they cannot be read', async () => {
    expect(await getDueCheckIns('user-1', '2026-10-09', '2026-10-10')).toEqual([]);
    mockReadError = { message: 'offline' };
    await expect(getDueCheckIns('user-1', '2026-10-05', '2026-10-08')).rejects.toThrow(
      'Failed to read the check ins: offline',
    );
  });

  it('are settled on the review that keeps them, leaving its other check ins alone', async () => {
    mockRow = {
      id: 'row-now',
      owner_id: 'user-1',
      week_start: '2026-10-05',
      answers: {},
      checkins: [check('today', '2026-10-08'), check('other', '2026-10-10')],
    };
    const saved = await settleCheckIn('row-now', 'today', 'done');
    expect(saved?.checkins.map((c) => [c.id, c.status])).toEqual([
      ['today', 'done'],
      ['other', 'open'],
    ]);
    const skipped = await settleCheckIn('row-now', 'other', 'skipped');
    expect(skipped?.checkins.map((c) => c.status)).toEqual(['done', 'skipped']);
  });

  it('settle nothing when the check in or its review is no longer there', async () => {
    mockRow = {
      id: 'row-now',
      owner_id: 'user-1',
      week_start: '2026-10-05',
      answers: {},
      checkins: [check('today', '2026-10-08')],
    };
    expect(await settleCheckIn('row-now', 'gone', 'done')).toBeNull();
    mockRow = null;
    expect(await settleCheckIn('row-now', 'today', 'done')).toBeNull();
  });
});

describe('the finished reviews of past weeks', () => {
  beforeEach(() => {
    mockReadError = null;
    mockRows = [
      {
        id: 'row-a',
        week_start: '2026-09-28',
        status: 'done',
        answers: { intention: 'Fewer things, finished.' },
      },
      { id: 'row-b', week_start: '2026-10-05', status: 'done', answers: null },
      // a row with no week is not one the archive can place
      { id: 'row-odd', status: 'done', answers: {} },
    ];
  });

  it('are the done ones of the weeks that start between two days, each with its answers', async () => {
    expect(await getDoneWeekReviews('user-1', '2026-09-28', '2026-10-05')).toEqual([
      {
        id: 'row-a',
        week_start: '2026-09-28',
        status: 'done',
        answers: { intention: 'Fewer things, finished.' },
      },
      { id: 'row-b', week_start: '2026-10-05', status: 'done', answers: {} },
    ]);
    const read = mockCalls[mockCalls.length - 1];
    expect(read.table).toBe('weekly_reviews');
    expect(read.filters).toEqual([
      ['owner_id', 'user-1'],
      ['status', 'done'],
      ['week_start>=', '2026-09-28'],
      ['week_start<=', '2026-10-05'],
    ]);
  });

  it('say so when they cannot be read', async () => {
    mockReadError = { message: 'offline' };
    await expect(getDoneWeekReviews('user-1', '2026-09-28', '2026-10-05')).rejects.toThrow(
      "Failed to read the weeks' reviews: offline",
    );
  });
});
