/**
 * @jest-environment node
 */
// The person's week (workers/shared/week.js): the cycle a day is in, what a
// review started on a day plans, the kind of day a date is, and a day's room.
// With Sunday as the weekly day the week is Monday to Sunday.

import {
  addDays,
  cycleOf,
  dayKind,
  dayRoom,
  daysBetween,
  daysOffOf,
  isDay,
  minutesOf,
  normHours,
  reviewOn,
  spanDays,
  weekdayOf,
  weeklyDayOf,
} from '../week.js';

// Sunday 4 October 2026 to Saturday 10 October 2026
const SUN = '2026-10-04';
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const FRI = '2026-10-09';
const SAT = '2026-10-10';

describe('days', () => {
  it('reads real dates only', () => {
    expect(isDay('2026-10-04')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('4 October')).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it('adds days and counts between them across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf(SAT)).toBe(6);
  });

  it('lists a span, and nothing for a span that runs backwards', () => {
    expect(spanDays(WED, FRI)).toEqual([WED, '2026-10-08', FRI]);
    expect(spanDays(FRI, WED)).toEqual([]);
    expect(spanDays(MON, '2026-12-01')).toHaveLength(14);
  });
});

describe('their settings', () => {
  it('falls back to Sunday, and to Saturday and Sunday off', () => {
    expect(weeklyDayOf(null)).toBe(0);
    expect(weeklyDayOf(9)).toBe(0);
    expect(weeklyDayOf(3)).toBe(3);
    expect(daysOffOf(null)).toEqual([0, 6]);
    expect(daysOffOf([5, 6, 6, 'x'])).toEqual([5, 6]);
    // someone with no days off has none
    expect(daysOffOf([])).toEqual([]);
  });
});

describe('the cycle a day is in', () => {
  it('starts on the weekly day and plans the seven days after it', () => {
    expect(cycleOf(SUN, 0)).toEqual({
      since: 0,
      start: SUN,
      week_start: MON,
      week_end: '2026-10-11',
      next: '2026-10-11',
    });
    expect(cycleOf(WED, 0)).toMatchObject({ since: 3, start: SUN, week_start: MON });
    expect(cycleOf(SAT, 0)).toMatchObject({ since: 6, start: SUN, next: '2026-10-11' });
  });

  it('follows a weekly day that is not Sunday', () => {
    // a Wednesday weekly day: the week is Thursday to Wednesday
    expect(cycleOf(WED, 3)).toMatchObject({ since: 0, start: WED, week_start: '2026-10-08' });
    expect(cycleOf(TUE, 3)).toMatchObject({
      since: 6,
      start: '2026-09-30',
      week_start: '2026-10-01',
      week_end: WED,
    });
  });
});

describe('what a review plans, by the day it starts', () => {
  it('on the weekly day plans the whole new week with the read made for it', () => {
    expect(reviewOn(SUN, 0)).toEqual({
      kind: 'weekly',
      promoted: true,
      fresh: false,
      week_start: MON,
      span_start: MON,
      span_end: '2026-10-11',
    });
  });

  it('on the two days after plans the rest of the new week', () => {
    expect(reviewOn(MON, 0)).toMatchObject({ kind: 'weekly', promoted: true, span_start: MON });
    expect(reviewOn(TUE, 0)).toMatchObject({
      kind: 'weekly',
      promoted: true,
      fresh: false,
      week_start: MON,
      span_start: TUE,
      span_end: '2026-10-11',
    });
  });

  it('midweek plans the rest of this week on a fresh read, as the extra', () => {
    for (const day of [WED, '2026-10-08', FRI]) {
      expect(reviewOn(day, 0)).toMatchObject({
        kind: 'extra',
        promoted: false,
        fresh: true,
        week_start: MON,
        span_start: day,
        span_end: '2026-10-11',
      });
    }
  });

  it('the day before the weekly day brings next week forward', () => {
    expect(reviewOn(SAT, 0)).toEqual({
      kind: 'brought_forward',
      promoted: false,
      fresh: true,
      week_start: '2026-10-12',
      span_start: '2026-10-12',
      span_end: '2026-10-18',
    });
  });

  it('keeps to the same rules for another weekly day', () => {
    expect(reviewOn(WED, 3)).toMatchObject({ kind: 'weekly', span_start: '2026-10-08' });
    expect(reviewOn(FRI, 3)).toMatchObject({ kind: 'weekly', span_start: FRI });
    expect(reviewOn(SUN, 3)).toMatchObject({ kind: 'extra', week_start: '2026-10-01' });
    expect(reviewOn(TUE, 3)).toMatchObject({ kind: 'brought_forward', week_start: '2026-10-08' });
  });
});

describe('the kind of day', () => {
  it('is busy when they said so, a day off on their days off, otherwise normal', () => {
    expect(dayKind(WED)).toBe('normal_day');
    expect(dayKind(SAT)).toBe('weekend_day');
    expect(dayKind(SAT, { busyDays: [SAT] })).toBe('busy_day');
    // a week that is not Monday to Friday
    expect(dayKind(WED, { daysOff: [2, 3] })).toBe('weekend_day');
    expect(dayKind(SAT, { daysOff: [2, 3] })).toBe('normal_day');
  });
});

describe("a day's room", () => {
  it('reads hours in half hour steps', () => {
    expect(normHours(2)).toBe(2);
    expect(normHours(1.5)).toBe(1.5);
    expect(normHours(1.4)).toBe(1.5);
    expect(normHours('3')).toBe(3);
    expect(normHours(0)).toBe(0);
    expect(normHours(-1)).toBeUndefined();
    expect(normHours(17)).toBeUndefined();
    expect(normHours('lots')).toBeUndefined();
  });

  it('counts an item with no length as thirty minutes', () => {
    expect(minutesOf({ time_estimate_minutes: 45 })).toBe(45);
    expect(minutesOf({ minutes: 20 })).toBe(20);
    expect(minutesOf({})).toBe(30);
    expect(minutesOf(null)).toBe(30);
  });

  it('works out what is left, and says nothing when no hours are set', () => {
    const hours = { normal_day: 2, busy_day: 0.5, weekend_day: 4 };
    expect(dayRoom(hours, 'normal_day', 75)).toEqual({ minutes: 120, placed: 75, left: 45 });
    expect(dayRoom(hours, 'busy_day', 60)).toEqual({ minutes: 30, placed: 60, left: -30 });
    expect(dayRoom(null, 'normal_day', 60)).toEqual({ minutes: null, placed: 60, left: null });
  });
});
