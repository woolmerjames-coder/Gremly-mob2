import { bestRun, recordFrom, shortDay } from '../record';

describe('the record row', () => {
  it('formats the day he arrived', () => {
    expect(shortDay('2026-08-14')).toBe('14 Aug');
    expect(shortDay('2026-08-14T10:22:00.000Z')).toBe('14 Aug');
    expect(shortDay(null)).toBeNull();
  });

  it('counts the best run of consecutive fed days', () => {
    expect(bestRun([])).toBe(0);
    expect(bestRun(['2026-09-01'])).toBe(1);
    expect(bestRun(['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06'])).toBe(3);
    expect(bestRun(['2026-09-06', '2026-09-05', '2026-09-05', '2026-09-04'])).toBe(3);
  });

  it('counts fed days from the list, or from the age when the list is missing', () => {
    const r = recordFrom({
      fedDays: ['2026-09-01', '2026-09-02', '2026-09-04'],
      age: 1,
      fedDaysCount: 0,
      accountCreatedAt: '2026-08-14',
    });
    expect(r).toEqual({ fedDays: 3, bestRun: 2, since: '14 Aug' });
    const f = recordFrom({ fedDays: null, age: 7, fedDaysCount: 0, accountCreatedAt: null });
    expect(f).toEqual({ fedDays: 21, bestRun: 1, since: null });
  });
});
