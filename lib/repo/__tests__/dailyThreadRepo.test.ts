/**
 * The thread's metadata is one JSON value changed by read, merge, write. Two
 * changes that overlap must not undo each other (lib/repo/dailyThreadRepo).
 */
let mockRow: { id: string; metadata_json: Record<string, unknown> } = {
  id: 't1',
  metadata_json: { ritual_day: '2026-09-30' },
};
const mockWrites: Record<string, unknown>[] = [];

jest.mock('../../supabase/client', () => {
  const later = <T>(value: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value()), 5));
  return {
    supabase: {
      from: () => ({
        // read: the row as it is when the read lands
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              later(() => ({ data: { metadata_json: { ...mockRow.metadata_json } }, error: null })),
          }),
        }),
        update: (values: { metadata_json: Record<string, unknown> }) => {
          const write = () => {
            mockWrites.push(values.metadata_json);
            mockRow = { ...mockRow, metadata_json: values.metadata_json };
            return { data: { ...mockRow }, error: null };
          };
          const done = later(write);
          return {
            eq: () => ({
              select: () => ({ maybeSingle: () => done }),
              then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
                done.then(ok, bad),
            }),
          };
        },
      }),
    },
  };
});

import { markDailyThreadOnce, patchDailyThreadMeta } from '../dailyThreadRepo';

beforeEach(() => {
  mockRow = { id: 't1', metadata_json: { ritual_day: '2026-09-30' } };
  mockWrites.length = 0;
});

describe('the daily thread metadata', () => {
  it('keeps both of two changes made at the same moment', async () => {
    await Promise.all([
      patchDailyThreadMeta('t1', { plan_locked_at: '2026-09-30T21:00:00Z' }),
      patchDailyThreadMeta('t1', { sweep: { step: 'close' } as never }),
    ]);
    expect(mockRow.metadata_json).toMatchObject({
      ritual_day: '2026-09-30',
      plan_locked_at: '2026-09-30T21:00:00Z',
      sweep: { step: 'close' },
    });
    // the second waited for the first: it read what the first wrote
    expect(mockWrites[1]).toHaveProperty('plan_locked_at');
  });

  it('keeps a stamp and a change made at the same moment', async () => {
    const [stamp] = await Promise.all([
      markDailyThreadOnce('t1', 'seen_at'),
      patchDailyThreadMeta('t1', { sweep: { step: 'offer' } as never }),
    ]);
    expect(stamp?.fresh).toBe(true);
    expect(mockRow.metadata_json).toHaveProperty('seen_at');
    expect(mockRow.metadata_json).toHaveProperty('sweep');
  });

  it('carries on after a change that failed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockRow = { id: 't1', metadata_json: {} as Record<string, unknown> };
    // no ritual_day on the row: the stamp finds nothing to mark, then the next change still runs
    await markDailyThreadOnce('t1', 'seen_at');
    await patchDailyThreadMeta('t1', { sweep: { step: 'offer' } as never });
    expect(mockRow.metadata_json).toHaveProperty('sweep');
    warn.mockRestore();
  });
});
