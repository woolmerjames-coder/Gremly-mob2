/**
 * Their weekly day as the worker calls read it (lib/week/weeklyDayNow.ts):
 * the last day the store said, and Sunday for anything that is not a day.
 */
import { setWeeklyDayNow, weeklyDayNow } from '../weeklyDayNow';

describe('their weekly day, for the calls to a worker', () => {
  it('is the day last set, and Sunday for anything that is not a day of the week', () => {
    setWeeklyDayNow(3);
    expect(weeklyDayNow()).toBe(3);
    for (const bad of [7, -1, 2.5, '3', null, undefined]) {
      setWeeklyDayNow(bad);
      expect(weeklyDayNow()).toBe(0);
    }
    setWeeklyDayNow(6);
    expect(weeklyDayNow()).toBe(6);
  });
});
