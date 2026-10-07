/**
 * A habit's weeks on its detail screen (lib/habits/weeksOnTarget): the row of
 * days it shows and its weeks on target, both in the person's own week.
 */
import { countWeeksOnTarget, weekRowDays } from '../weeksOnTarget';

const WED = '2025-12-17'; // a Wednesday

describe('the row of days on a habit', () => {
  it('runs Monday to Sunday for a Sunday person', () => {
    expect(weekRowDays(WED, 0)).toEqual([
      '2025-12-15',
      '2025-12-16',
      '2025-12-17',
      '2025-12-18',
      '2025-12-19',
      '2025-12-20',
      '2025-12-21',
    ]);
  });

  it('runs Thursday to Wednesday for a Wednesday person, ending on today', () => {
    const days = weekRowDays(WED, 3);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2025-12-11');
    expect(days[6]).toBe(WED);
  });

  it('runs Sunday to Saturday for a Saturday person', () => {
    const days = weekRowDays(WED, 6);
    expect([days[0], days[6]]).toEqual(['2025-12-14', '2025-12-20']);
  });

  it('moves a whole week at a time', () => {
    expect(weekRowDays(WED, 0, -1).slice(0, 1)).toEqual(['2025-12-08']);
    expect(weekRowDays(WED, 0, -1).slice(-1)).toEqual(['2025-12-14']);
    expect(weekRowDays(WED, 3, -2).slice(0, 1)).toEqual(['2025-11-27']);
    expect(weekRowDays(WED, 3, 1).slice(0, 1)).toEqual(['2025-12-18']);
  });

  it('crosses a month and a year', () => {
    // Thursday 1 January 2026
    const days = weekRowDays('2026-01-01', 0);
    expect([days[0], days[6]]).toEqual(['2025-12-29', '2026-01-04']);
  });
});

describe('weeks on target', () => {
  // local midnight on Monday 1 December 2025
  const start = new Date(2025, 11, 1);
  const completedDates = ['2025-12-01', '2025-12-07', '2025-12-14', '2025-12-15', '2025-12-16'];

  it('buckets Monday to Sunday for a Sunday person', () => {
    // 12/15 on: 2 (met). 12/8 to 12/14: 1 (missed). 12/1 to 12/7: 2 (met).
    expect(
      countWeeksOnTarget({ completedDates, targetPerWeek: 2, start, today: WED, weeklyDay: 0 }),
    ).toEqual({ weeksHit: 2, totalWeeks: 3 });
  });

  it('buckets Thursday to Wednesday for a Wednesday person', () => {
    // 12/11 to 12/17: 3 (met). 12/4 to 12/10: 1 (missed).
    // The week of 11/27 began before the habit did, so it is not counted.
    expect(
      countWeeksOnTarget({ completedDates, targetPerWeek: 2, start, today: WED, weeklyDay: 3 }),
    ).toEqual({ weeksHit: 1, totalWeeks: 2 });
  });

  it('leaves out a week that began before the habit started', () => {
    // started on Tuesday 2 December: the week of Monday 12/1 is not counted
    expect(
      countWeeksOnTarget({
        completedDates,
        targetPerWeek: 2,
        start: new Date(2025, 11, 2),
        today: WED,
        weeklyDay: 0,
      }),
    ).toEqual({ weeksHit: 1, totalWeeks: 2 });
  });

  it('counts no weeks for a habit that started after their week began', () => {
    expect(
      countWeeksOnTarget({
        completedDates,
        targetPerWeek: 2,
        start: new Date(2025, 11, 16),
        today: WED,
        weeklyDay: 0,
      }),
    ).toEqual({ weeksHit: 0, totalWeeks: 0 });
  });

  it('looks back a year at most', () => {
    expect(
      countWeeksOnTarget({
        completedDates,
        targetPerWeek: 1,
        start: new Date(2000, 0, 1),
        today: WED,
        weeklyDay: 0,
      }),
    ).toEqual({ weeksHit: 3, totalWeeks: 52 });
  });

  it('passes over a week they paused in, unless they met it anyway', () => {
    // three weeks: 1 to 7 Dec met (2), 8 to 14 Dec one log, 15 to 21 Dec met (2)
    const base = { completedDates, targetPerWeek: 2, start, today: WED, weeklyDay: 0 };
    expect(countWeeksOnTarget(base)).toEqual({ weeksHit: 2, totalWeeks: 3 });
    // paused for two days of the middle week: it is not a week missed
    const pause = (period_start: string, period_end: string) => ({
      habit_id: 'h1',
      mode: 'pause',
      period_start,
      period_end,
    });
    expect(
      countWeeksOnTarget({ ...base, habitId: 'h1', eases: [pause('2025-12-09', '2025-12-10')] }),
    ).toEqual({ weeksHit: 2, totalWeeks: 2 });
    // paused in a week that was met anyway: it still counts
    expect(
      countWeeksOnTarget({ ...base, habitId: 'h1', eases: [pause('2025-12-03', '2025-12-04')] }),
    ).toEqual({ weeksHit: 2, totalWeeks: 3 });
    // another habit's pause changes nothing
    expect(
      countWeeksOnTarget({
        ...base,
        habitId: 'h1',
        eases: [{ ...pause('2025-12-09', '2025-12-10'), habit_id: 'h2' }],
      }),
    ).toEqual({ weeksHit: 2, totalWeeks: 3 });
  });
});
