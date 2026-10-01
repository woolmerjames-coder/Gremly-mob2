import { getDateService } from '../../date/DateService';
import { hhmmToMinutes, localMinutesToIso, minutesOfDay } from '../time';

describe('brief time helpers', () => {
  const ds = getDateService();
  const before = ds.getTimezone();
  afterEach(() => ds.setTimezone(before));

  it('turns a local day and minutes into the right instant, both sides of a clock change', () => {
    ds.setTimezone('America/Los_Angeles');
    // PDT, UTC-7
    expect(localMinutesToIso('2026-09-30', 13 * 60 + 15)).toBe('2026-09-30T20:15:00.000Z');
    // PST, UTC-8 (clocks went back on 1 Nov 2026)
    expect(localMinutesToIso('2026-11-02', 9 * 60)).toBe('2026-11-02T17:00:00.000Z');
    ds.setTimezone('Europe/London');
    expect(localMinutesToIso('2026-10-01', 8 * 60)).toBe('2026-10-01T07:00:00.000Z');
  });

  it('reads minutes of the day back in the same timezone', () => {
    ds.setTimezone('America/Los_Angeles');
    expect(minutesOfDay('2026-09-30T20:15:00.000Z')).toBe(13 * 60 + 15);
    expect(minutesOfDay(localMinutesToIso('2026-10-01', 7 * 60 + 40))).toBe(460);
  });

  it('parses HH:mm', () => {
    expect(hhmmToMinutes('08:05')).toBe(485);
    expect(hhmmToMinutes('13:15:00')).toBe(795);
    expect(hhmmToMinutes(null)).toBeNull();
    expect(hhmmToMinutes('soon')).toBeNull();
  });
});
