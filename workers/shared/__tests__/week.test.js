/**
 * @jest-environment node
 */
// The person's week (workers/shared/week.js): the cycle a day is in, what a
// review started on a day plans, the kind of day a date is, and a day's room.
// With Sunday as the weekly day the week is Monday to Sunday.

import {
  addDays,
  briefOffersReview,
  closeOffersWeek,
  cycleOf,
  dayKind,
  dayRoom,
  daysBetween,
  daysOffOf,
  extraUsed,
  isDay,
  minutesOf,
  normHours,
  readServes,
  reviewOn,
  reviewWith,
  spanDays,
  summaryWeekOf,
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

describe('the week a summary covers', () => {
  it('is Monday to Sunday for a Sunday weekly day, on every day of it', () => {
    for (const day of ['2026-10-05', WED, SAT, '2026-10-11']) {
      expect(summaryWeekOf(day, 0)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    }
    // the Sunday before closes the week before
    expect(summaryWeekOf(SUN, 0)).toEqual({ start: '2026-09-28', end: SUN });
    expect(summaryWeekOf(SUN, null)).toEqual({ start: '2026-09-28', end: SUN });
  });

  it('ends on their own weekly day when it is not Sunday', () => {
    // a Wednesday weekly day: Thursday to Wednesday
    expect(summaryWeekOf(WED, 3)).toEqual({ start: '2026-10-01', end: WED });
    expect(summaryWeekOf('2026-10-08', 3)).toEqual({ start: '2026-10-08', end: '2026-10-14' });
    expect(summaryWeekOf(TUE, 3)).toEqual({ start: '2026-10-01', end: WED });
  });
});

describe('where the review is offered while it is promoted', () => {
  // Sunday is the weekly day; the review is of the week that starts Monday 5
  const row = (status) => ({ week_start: MON, status });

  it('is offered by the morning brief on the two days after the weekly day', () => {
    expect(briefOffersReview(SUN, 0, null)).toBe(false);
    expect(briefOffersReview(MON, 0, null)).toBe(true);
    expect(briefOffersReview(TUE, 0, row('ready'))).toBe(true);
    expect(briefOffersReview(TUE, 0, row('started'))).toBe(true);
    expect(briefOffersReview(WED, 0, null)).toBe(false);
  });

  it('stops in the morning once the review is done, or they said not this week', () => {
    expect(briefOffersReview(MON, 0, row('done'))).toBe(false);
    expect(briefOffersReview(MON, 0, row('skipped'))).toBe(false);
    // a row for another week says nothing about this one
    expect(briefOffersReview(MON, 0, { week_start: '2026-09-28', status: 'done' })).toBe(true);
  });

  it('is offered by the wrap up close on the weekly day and the two evenings after', () => {
    for (const day of [SUN, MON, TUE]) {
      expect(closeOffersWeek(day, 0, null)).toBe('plan');
      expect(closeOffersWeek(day, 0, row('started'))).toBe('plan');
    }
    expect(closeOffersWeek(WED, 0, null)).toBeNull();
    expect(closeOffersWeek(SAT, 0, null)).toBeNull();
  });

  it('offers their week instead once the review is done, and nothing once skipped', () => {
    expect(closeOffersWeek(SUN, 0, row('done'))).toBe('see');
    expect(closeOffersWeek(TUE, 0, row('done'))).toBe('see');
    expect(closeOffersWeek(MON, 0, row('skipped'))).toBeNull();
    expect(closeOffersWeek(WED, 0, row('done'))).toBeNull();
  });

  it('follows their own weekly day', () => {
    // a Wednesday weekly day: the week starts Thursday 8
    expect(closeOffersWeek(WED, 3, null)).toBe('plan');
    expect(briefOffersReview('2026-10-08', 3, null)).toBe(true);
    expect(briefOffersReview('2026-10-08', 3, { week_start: '2026-10-08', status: 'done' })).toBe(
      false,
    );
    expect(briefOffersReview(SAT, 3, null)).toBe(false);
  });
});

describe('the read a review opens with', () => {
  const read = { challenge: { headline: 'A full week' } };

  it('is the one the row holds for the weekly review and for a week brought forward', () => {
    const weekly = reviewOn(SUN, 0);
    expect(readServes(weekly, { kind: 'weekly', read })).toBe(true);
    // a week brought forward the day before keeps its read on the weekly day
    expect(readServes(weekly, { kind: 'brought_forward', read })).toBe(true);
    expect(readServes(reviewOn(SAT, 0), { kind: 'brought_forward', read })).toBe(true);
    expect(readServes(weekly, { kind: 'weekly', read: null })).toBe(false);
    expect(readServes(weekly, null)).toBe(false);
  });

  it('is a fresh one for the extra review, once a week', () => {
    const extra = reviewOn(WED, 0);
    expect(extra.kind).toBe('extra');
    expect(readServes(extra, { kind: 'weekly', read })).toBe(false);
    expect(readServes(extra, { kind: 'brought_forward', read })).toBe(false);
    expect(readServes(extra, { kind: 'extra', read })).toBe(true);
    expect(extraUsed({ kind: 'extra' })).toBe(true);
    expect(extraUsed({ kind: 'weekly' })).toBe(false);
    expect(extraUsed(null)).toBe(false);
  });
});

describe('a review opened again', () => {
  const read = { challenge: { headline: 'A full week' } };
  // the week Sunday's review plans, Monday to Sunday
  const week = reviewOn(SUN, 0).week_start;

  it('carries on a review started in its window, with its read, and leaves the extra free', () => {
    const row = { week_start: week, status: 'started', kind: 'weekly', read };
    const on = reviewWith(WED, 0, row);
    // by the date Wednesday is the extra; the review under way stays the weekly one
    expect(reviewOn(WED, 0).kind).toBe('extra');
    expect(on).toMatchObject({ kind: 'weekly', fresh: false, resumed: true, week_start: week });
    // it plans from the day it is opened again
    expect(on.span_start).toBe(WED);
    expect(on.span_end).toBe('2026-10-11');
    expect(readServes(on, row)).toBe(true);
    expect(extraUsed(row)).toBe(false);
  });

  it('carries on a week brought forward the same way', () => {
    const row = { week_start: week, status: 'started', kind: 'brought_forward', read };
    expect(reviewWith(WED, 0, row)).toMatchObject({ kind: 'brought_forward', resumed: true });
  });

  it('is what the date says when nothing is under way', () => {
    for (const status of ['ready', 'done', 'skipped']) {
      const row = { week_start: week, status, kind: 'weekly', read };
      expect(reviewWith(WED, 0, row)).toEqual(reviewOn(WED, 0));
    }
    expect(reviewWith(WED, 0, null)).toEqual(reviewOn(WED, 0));
    // the extra itself, under way, is still the extra
    const extra = { week_start: week, status: 'started', kind: 'extra', read };
    expect(reviewWith(WED, 0, extra)).toEqual(reviewOn(WED, 0));
    // a row of another week is not this review's
    const other = { week_start: '2026-09-28', status: 'started', kind: 'weekly', read };
    expect(reviewWith(WED, 0, other)).toEqual(reviewOn(WED, 0));
  });

  it('is what the date says inside the window, started or not', () => {
    const row = { week_start: week, status: 'started', kind: 'weekly', read };
    expect(reviewWith(SUN, 0, row)).toEqual(reviewOn(SUN, 0));
    expect(reviewWith(TUE, 0, row)).toEqual(reviewOn(TUE, 0));
  });

  it('takes a fresh read under its own kind when the one it began with is gone', () => {
    const row = { week_start: week, status: 'started', kind: 'weekly', read: null };
    const on = reviewWith(WED, 0, row);
    expect(on.kind).toBe('weekly');
    expect(readServes(on, row)).toBe(false);
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
