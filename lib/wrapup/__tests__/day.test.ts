import { getDateService } from '../../date/DateService';
import { tomorrowLabel, weekdayOf, wrapNow } from '../day';

describe('the day being wrapped up', () => {
  const ds = getDateService() as any;
  let was: { clock: () => Date; timezone: string; hour: number };

  // the clock, in Los Angeles, with the day ending at 3 AM
  const at = (iso: string) => {
    ds.clock = () => new Date(iso);
  };

  beforeEach(() => {
    was = { clock: ds.clock, timezone: ds.getTimezone(), hour: ds.getDayBoundaryHour() };
    ds.setTimezone('America/Los_Angeles');
    ds.setDayBoundaryHour(3);
  });

  afterEach(() => {
    ds.clock = was.clock;
    ds.setTimezone(was.timezone);
    ds.setDayBoundaryHour(was.hour);
  });

  it('in the evening is today, and the next day is tomorrow', () => {
    at('2026-10-01T04:00:00Z'); // 9 PM on Wednesday 30 September
    const now = wrapNow();
    expect(now.day).toBe('2026-09-30');
    expect(now.tomorrow).toBe('2026-10-01');
    expect(now.words).toEqual({
      weekday: 'Wednesday',
      tomorrow: 'tomorrow',
      late: false,
      early: false,
    });
    expect(now.evening).toBe(true);
    expect(now.part).toBe('evening');
    expect(now.dayEndHour).toBe(3);
    expect(tomorrowLabel()).toBe('Tomorrow');
  });

  it('after midnight is still yesterday, and the next day goes by its weekday', () => {
    at('2026-10-01T07:30:00Z'); // 12:30 AM on Thursday 1 October
    const now = wrapNow();
    expect(now.day).toBe('2026-09-30');
    expect(now.tomorrow).toBe('2026-10-01');
    expect(now.words).toEqual({
      weekday: 'Wednesday',
      tomorrow: 'Thursday',
      late: true,
      early: false,
    });
    expect(now.part).toBe('evening');
    expect(now.evening).toBe(true);
    expect(tomorrowLabel()).toBe('Thursday');
  });

  it('starts counting from when the day began, 3 AM', () => {
    at('2026-10-01T07:30:00Z');
    // Wednesday began at 3 AM on 30 September in Los Angeles
    expect(new Date(wrapNow().dayStartMs).toISOString()).toBe('2026-09-30T10:00:00.000Z');
  });

  it('turns over when the day ends', () => {
    at('2026-10-01T10:30:00Z'); // 3:30 AM on Thursday
    const now = wrapNow();
    expect(now.day).toBe('2026-10-01');
    // before the evening the day is not over: its words do not say tonight
    expect(now.words).toEqual({
      weekday: 'Thursday',
      tomorrow: 'tomorrow',
      late: false,
      early: true,
    });
    expect(now.evening).toBe(false);
    expect(tomorrowLabel()).toBe('Tomorrow');
  });

  it('names the part of the day, for a journal entry written before the evening', () => {
    at('2026-09-30T16:00:00Z'); // 9 AM
    expect(wrapNow()).toMatchObject({ part: 'morning', evening: false });
    expect(wrapNow().words.early).toBe(true);
    at('2026-09-30T21:00:00Z'); // 2 PM
    expect(wrapNow()).toMatchObject({ part: 'afternoon', evening: false });
    at('2026-10-01T03:00:00Z'); // 8 PM
    expect(wrapNow()).toMatchObject({ part: 'evening', evening: true });
    expect(wrapNow().words.early).toBe(false);
  });

  it('is not evening in the afternoon, and is from 5 PM', () => {
    at('2026-09-30T21:00:00Z'); // 2 PM
    expect(wrapNow().evening).toBe(false);
    at('2026-10-01T00:00:00Z'); // 5 PM
    expect(wrapNow().evening).toBe(true);
  });

  it('names a day by its weekday', () => {
    expect(weekdayOf('2026-10-03')).toBe('Saturday');
  });
});
