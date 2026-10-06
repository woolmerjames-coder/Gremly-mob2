/**
 * summaryForDay: the weekly summary for the week a day is in, whichever day
 * the person's week starts on.
 */
import { summaryForDay } from '../currentSummary';

const week = (id: string, start: string | null) => ({ id, week_start_date: start });

describe('the summary for the week a day is in', () => {
  // Monday 15 December 2025
  const MONDAY = '2025-12-15';

  it('is the one that starts this Monday, for a Monday to Sunday week', () => {
    const list = [
      week('last', '2025-12-08'),
      week('this', '2025-12-15'),
      week('next', '2025-12-22'),
    ];
    for (const day of ['2025-12-15', '2025-12-18', '2025-12-21']) {
      expect(summaryForDay(list, day)?.id).toBe('this');
    }
    expect(summaryForDay(list, '2025-12-14')?.id).toBe('last');
    expect(summaryForDay([week('last', '2025-12-08')], MONDAY)).toBeUndefined();
  });

  it('is the one whose seven days include the day, when their week starts on another day', () => {
    // a Wednesday weekly day: Thursday 11 to Wednesday 17
    const own = [week('own', '2025-12-11')];
    expect(summaryForDay(own, '2025-12-11')?.id).toBe('own');
    expect(summaryForDay(own, MONDAY)?.id).toBe('own');
    expect(summaryForDay(own, '2025-12-17')?.id).toBe('own');
    expect(summaryForDay(own, '2025-12-10')).toBeUndefined();
    expect(summaryForDay(own, '2025-12-18')).toBeUndefined();
  });

  it('takes the later week when two overlap, after the weekly day moved', () => {
    const list = [week('after', '2025-12-11'), week('before', '2025-12-09')];
    expect(summaryForDay(list, MONDAY)?.id).toBe('after');
    expect(summaryForDay([...list].reverse(), MONDAY)?.id).toBe('after');
  });

  it('reads a start kept with a time, and passes over one that is no date', () => {
    expect(summaryForDay([week('timed', '2025-12-15T00:00:00Z')], MONDAY)?.id).toBe('timed');
    expect(summaryForDay([week('none', null), week('odd', 'soon')], MONDAY)).toBeUndefined();
    expect(summaryForDay([], MONDAY)).toBeUndefined();
  });
});
