/**
 * The week's review (lib/repo/weekReviewRepo): its answers and check ins are
 * each one JSON value changed by read, merge, write, so two changes that
 * overlap must not undo each other; and the week's two settings are read and
 * saved with the notification settings.
 */
let mockRow: Record<string, any> | null = null;
let mockSettings: Record<string, any> | null = null;
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
          maybeSingle: () => later(call.op === 'update' ? chain.write : read),
          update: (values: Record<string, unknown>) => {
            call.op = 'update';
            call.values = values;
            chain.write = () => {
              if (table === 'weekly_reviews') {
                if (!mockRow) return { data: null, error: null };
                mockRow = { ...mockRow, ...values };
                return { data: { ...mockRow }, error: null };
              }
              mockSettings = { ...(mockSettings ?? {}), ...values };
              return { data: null, error: null };
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

import { changeWeekReview, getWeekReview, getWeekSettings, saveWeeklyDay } from '../weekReviewRepo';

beforeEach(() => {
  mockCalls.length = 0;
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
});
