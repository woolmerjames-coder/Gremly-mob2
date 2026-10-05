import { getDateService } from '../DateService';
import { isFuture, isPast, isToday, isTomorrow, isYesterday } from '../dayCompare';

describe('is this day today, for the person', () => {
  const ds = getDateService() as any;
  let was: { clock: () => Date; hour: number };
  // a day as a screen holds it: parsed from YYYY-MM-DD, at noon on the phone
  const day = (d: string) => getDateService().fromLocalDate(d) as Date;

  beforeEach(() => {
    was = { clock: ds.clock, hour: ds.getDayBoundaryHour() };
    ds.setDayBoundaryHour(3);
  });

  afterEach(() => {
    ds.clock = was.clock;
    ds.setDayBoundaryHour(was.hour);
  });

  it('follows the calendar before midnight', () => {
    const now = day('2026-09-30');
    now.setHours(21, 0, 0, 0);
    ds.clock = () => new Date(now);
    expect(isToday(day('2026-09-30'))).toBe(true);
    expect(isTomorrow(day('2026-10-01'))).toBe(true);
    expect(isYesterday(day('2026-09-29'))).toBe(true);
    expect(isPast(day('2026-09-29'))).toBe(true);
    expect(isPast(day('2026-09-30'))).toBe(false);
    expect(isFuture(day('2026-10-01'))).toBe(true);
    expect(isFuture(day('2026-09-30'))).toBe(false);
  });

  it('after midnight, yesterday by the clock is still today', () => {
    const now = day('2026-10-01');
    now.setHours(0, 30, 0, 0);
    ds.clock = () => new Date(now);
    expect(getDateService().today()).toBe('2026-09-30');
    expect(isToday(day('2026-09-30'))).toBe(true);
    expect(isToday(day('2026-10-01'))).toBe(false);
    // the date on the clock is tomorrow, and not in the past
    expect(isTomorrow(day('2026-10-01'))).toBe(true);
    expect(isFuture(day('2026-10-01'))).toBe(true);
    expect(isPast(day('2026-10-01'))).toBe(false);
    expect(isPast(day('2026-09-30'))).toBe(false);
    expect(isYesterday(day('2026-09-29'))).toBe(true);
  });
});
