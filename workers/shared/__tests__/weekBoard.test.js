/**
 * @jest-environment node
 */
// The week board's rules (workers/shared/weekBoard.js): where a todo is
// against the days being planned, the days a Later can come back on, and how
// returns are spread. Dates, ids and numbers only.

import {
  FALLBACK_HOURS,
  KEEP_ASK_FROM,
  RETURNS_A_DAY_MIN,
  backDays,
  busyFor,
  gremlyPut,
  hoursFor,
  released,
  reliefBasis,
  returnsCap,
  spreadBasis,
  spreadReturns,
  todoSpot,
} from '../weekBoard.js';

// Sunday 4 October 2026: the review plans Monday 5 to Sunday 11
const TODAY = '2026-10-04';
const SPAN = { today: TODAY, first: '2026-10-05', last: '2026-10-11' };
const DAYS = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

describe('where a todo is, against the days being planned', () => {
  it('is fixed on a saved day that is being planned', () => {
    expect(todoSpot({ due_day: '2026-10-07' }, SPAN)).toEqual({ spot: 'fixed', day: '2026-10-07' });
    expect(todoSpot({ due_day: '2026-10-11', back_on: '2026-10-20' }, SPAN).spot).toBe('fixed');
  });

  it('keeps its own day when that is today or a day further out', () => {
    // today's own plan, when the week being planned starts tomorrow
    expect(todoSpot({ due_day: TODAY }, SPAN)).toEqual({ spot: 'own', day: TODAY });
    expect(todoSpot({ due_day: '2026-10-14' }, SPAN)).toEqual({ spot: 'own', day: '2026-10-14' });
  });

  it('is put off when it has no day to come and a day ahead it comes back on', () => {
    expect(todoSpot({ back_on: '2026-10-15' }, SPAN)).toEqual({
      spot: 'later',
      back_on: '2026-10-15',
    });
    // a day that has gone by does not hold it: the back day does
    expect(todoSpot({ due_day: '2026-10-01', back_on: '2026-10-15' }, SPAN).spot).toBe('later');
  });

  it('is free with no day, a day gone by, or a back day that has come', () => {
    expect(todoSpot({}, SPAN)).toEqual({ spot: 'free' });
    expect(todoSpot({ due_day: '2026-10-01' }, SPAN)).toEqual({ spot: 'free' });
    expect(todoSpot({ back_on: TODAY }, SPAN)).toEqual({ spot: 'free' });
    expect(todoSpot({ due_day: 'soon', back_on: 'later' }, SPAN)).toEqual({ spot: 'free' });
    expect(todoSpot(null, SPAN)).toEqual({ spot: 'free' });
  });

  it('counts only today onwards in a review begun part way through the week', () => {
    // Wednesday 7: the rest of this week
    const rest = { today: '2026-10-07', first: '2026-10-07', last: '2026-10-11' };
    expect(todoSpot({ due_day: '2026-10-06' }, rest)).toEqual({ spot: 'free' });
    expect(todoSpot({ due_day: '2026-10-07' }, rest).spot).toBe('fixed');
  });
});

describe('the days a Later can come back on', () => {
  it('are the days after the ones being planned, up to four weeks from today', () => {
    const days = backDays(TODAY, '2026-10-11');
    expect(days[0]).toBe('2026-10-12');
    expect(days[days.length - 1]).toBe('2026-11-01');
    expect(days).toHaveLength(21);
  });

  it('start tomorrow at the earliest', () => {
    // the last day being planned is today
    expect(backDays('2026-10-11', '2026-10-11')[0]).toBe('2026-10-12');
    expect(backDays('2026-10-11', '2026-10-09')[0]).toBe('2026-10-12');
  });

  it('are none without real days', () => {
    expect(backDays('soon', '2026-10-11')).toEqual([]);
    expect(backDays(TODAY, null)).toEqual([]);
  });
});

describe('how many returns a day takes', () => {
  it('is an even share and one more, and never fewer than three', () => {
    expect(returnsCap(5, 21)).toBe(RETURNS_A_DAY_MIN);
    expect(returnsCap(0, 21)).toBe(RETURNS_A_DAY_MIN);
    expect(returnsCap(120, 21)).toBe(7);
    expect(returnsCap(10, 0)).toBe(RETURNS_A_DAY_MIN);
  });
});

describe('spreading the returns', () => {
  const days = backDays(TODAY, '2026-10-11');

  it('gives the day asked for while it has room', () => {
    const out = spreadReturns(
      [
        { id: 'a', back_on: '2026-10-13' },
        { id: 'b', back_on: '2026-10-13' },
      ],
      { days, cap: 3 },
    );
    expect([...out]).toEqual([
      ['a', '2026-10-13'],
      ['b', '2026-10-13'],
    ]);
  });

  it('moves what a full day cannot take to the nearest day with room, a later one first', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, back_on: '2026-10-13' }));
    const out = spreadReturns(list, { days, cap: 2 });
    expect(out.get('a')).toBe('2026-10-13');
    expect(out.get('b')).toBe('2026-10-13');
    expect(out.get('c')).toBe('2026-10-14');
    expect(out.get('d')).toBe('2026-10-14');
    // the next nearest is the day before
    expect(out.get('e')).toBe('2026-10-12');
  });

  it('counts the returns a day already has', () => {
    const out = spreadReturns([{ id: 'a', back_on: '2026-10-13' }], {
      days,
      cap: 2,
      load: new Map([['2026-10-13', 2]]),
    });
    expect(out.get('a')).toBe('2026-10-14');
  });

  it('puts a day that cannot be one right: the first after it, or the last there is', () => {
    const out = spreadReturns(
      [
        { id: 'inside', back_on: '2026-10-06' },
        { id: 'far', back_on: '2026-12-25' },
        { id: 'odd', back_on: 'next week' },
      ],
      { days, cap: 3 },
    );
    expect(out.get('inside')).toBe('2026-10-12');
    expect(out.get('far')).toBe('2026-11-01');
    // not a day at all: the day with the fewest returns, the earliest of those
    expect(out.get('odd')).toBe('2026-10-13');
  });

  it('gives one that asked for no day the day with the fewest returns, so they never pile up', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const out = spreadReturns(list, { days, cap: 3, load: [['2026-10-13', 1]] });
    expect([...out.values()]).toEqual(['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16']);
  });

  it('still gives every one a day when every day is full, and none when there are no days', () => {
    const two = ['2026-10-12', '2026-10-13'];
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, back_on: '2026-10-12' }));
    const out = spreadReturns(list, { days: two, cap: 1 });
    expect(out.size).toBe(5);
    expect([...out.values()].filter((d) => d === '2026-10-12')).toHaveLength(3);
    expect(spreadReturns(list, { days: [], cap: 3 }).size).toBe(0);
  });

  it('never passes a hard date while a day on or before it is open', () => {
    // asked for a day after its date: the nearest day that is not
    const late = spreadReturns([{ id: 'a', back_on: '2026-10-20', by: '2026-10-14' }], {
      days,
      cap: 3,
    });
    expect(late.get('a')).toBe('2026-10-14');
    // the days up to its date are full: one of them all the same, the least full
    const full = spreadReturns([{ id: 'a', back_on: '2026-10-13', by: '2026-10-13' }], {
      days,
      cap: 1,
      load: [
        ['2026-10-12', 1],
        ['2026-10-13', 2],
      ],
    });
    expect(full.get('a')).toBe('2026-10-12');
    // asked for no day: the fewest returns among the days up to its date
    const none = spreadReturns([{ id: 'a', by: '2026-10-13' }], {
      days,
      cap: 3,
      load: [['2026-10-12', 1]],
    });
    expect(none.get('a')).toBe('2026-10-13');
    // its date is before any day it can come back on: any day, as for the rest
    const gone = spreadReturns([{ id: 'a', by: '2026-10-09' }], { days, cap: 3 });
    expect(gone.get('a')).toBe('2026-10-12');
  });

  it('names nobody twice', () => {
    const out = spreadReturns(
      [
        { id: 'a', back_on: '2026-10-13' },
        { id: 'a', back_on: '2026-10-20' },
      ],
      { days, cap: 3 },
    );
    expect([...out]).toEqual([['a', '2026-10-13']]);
  });
});

describe('the hours and busy days a week is planned with', () => {
  it('are what they set, then Gremly’s guess, then the fallback, kind by kind', () => {
    expect(hoursFor(null, null)).toEqual(FALLBACK_HOURS);
    expect(
      hoursFor(
        { hours: { normal_day: 3 } },
        { free_hours_guess: { normal_day: 1, busy_day: 0.5 } },
      ),
    ).toEqual({ normal_day: 3, busy_day: 0.5, weekend_day: FALLBACK_HOURS.weekend_day });
    // none is an answer: no time on a busy day
    expect(hoursFor({ hours: { busy_day: 0 } }, null).busy_day).toBe(0);
  });

  it('take the busy days they settled over the ones Gremly read, and only days being planned', () => {
    const read = { busy_days: ['2026-10-08', '2026-10-20'] };
    expect(busyFor(null, read, DAYS, TODAY)).toEqual(['2026-10-08']);
    expect(busyFor({ busy_days: ['2026-10-09', '2026-10-06'] }, read, DAYS, TODAY)).toEqual([
      '2026-10-06',
      '2026-10-09',
    ]);
    // they said none are busy: Gremly's guess does not come back
    expect(busyFor({ busy_days: [] }, read, DAYS, TODAY)).toEqual([]);
  });
});

describe('what a spread was made from', () => {
  const read = { free_hours_guess: { normal_day: 2, busy_day: 1, weekend_day: 4 } };
  const answers = {
    hours: { normal_day: 2 },
    busy_days: ['2026-10-08'],
    priorities: [{ text: 'The report', item_ids: ['b', 'a'] }],
  };

  it('is the same line for the same answers, however they are ordered', () => {
    const again = {
      ...answers,
      priorities: [{ text: 'Reworded', item_ids: ['a', 'b'] }],
      intention: '  ',
      said: [{ text: 'Typed along the way' }],
    };
    expect(spreadBasis(again, read, DAYS, TODAY)).toBe(spreadBasis(answers, read, DAYS, TODAY));
  });

  it('changes with the hours, the busy days, the todos that matter most, and the days', () => {
    const base = spreadBasis(answers, read, DAYS, TODAY);
    expect(spreadBasis({ ...answers, hours: { normal_day: 3 } }, read, DAYS, TODAY)).not.toBe(base);
    expect(spreadBasis({ ...answers, busy_days: [] }, read, DAYS, TODAY)).not.toBe(base);
    expect(spreadBasis({ ...answers, priorities: [] }, read, DAYS, TODAY)).not.toBe(base);
    expect(spreadBasis(answers, read, DAYS.slice(2), TODAY)).not.toBe(base);
  });

  it('changes with what they said of their own days, and not with an answer that means the same', () => {
    const base = spreadBasis(answers, read, DAYS, TODAY);
    // keeping their days is what happens when nothing is said
    expect(spreadBasis({ ...answers, keep: 'all' }, read, DAYS, TODAY)).toBe(base);
    expect(spreadBasis({ ...answers, keep: 'none' }, read, DAYS, TODAY)).not.toBe(base);
    const some = spreadBasis({ ...answers, keep: 'some', freed: ['x', 'y'] }, read, DAYS, TODAY);
    expect(some).not.toBe(base);
    expect(
      spreadBasis({ ...answers, keep: 'some', freed: ['y', 'x', 'x'] }, read, DAYS, TODAY),
    ).toBe(some);
    expect(spreadBasis({ ...answers, keep: 'some', freed: ['x'] }, read, DAYS, TODAY)).not.toBe(
      some,
    );
    // what was freed counts only while they are keeping some
    expect(spreadBasis({ ...answers, keep: 'all', freed: ['x'] }, read, DAYS, TODAY)).toBe(base);
    // and keeping some with none freed is keeping them all
    expect(spreadBasis({ ...answers, keep: 'some', freed: [] }, read, DAYS, TODAY)).toBe(base);
    expect(spreadBasis({ ...answers, keep: 'some' }, read, DAYS, TODAY)).toBe(base);
  });

  it('changes with what else the spread is given: the intention, what they told Gremly, what they decided', () => {
    const base = spreadBasis(answers, read, DAYS, TODAY);
    const differs = (more) =>
      expect(spreadBasis({ ...answers, ...more }, read, DAYS, TODAY)).not.toBe(base);
    differs({ intention: 'One thing at a time' });
    differs({ challenge: { agreed: false, note: 'The trip is off' } });
    differs({ needs_you: [{ title: 'The boiler', item_ids: ['x'], decision: 'Moved to Friday' }] });
    // one opened and not decided changes nothing
    expect(
      spreadBasis({ ...answers, needs_you: [{ title: 'The boiler' }] }, read, DAYS, TODAY),
    ).toBe(base);
    expect(spreadBasis({ ...answers, challenge: { agreed: true } }, read, DAYS, TODAY)).toBe(base);
  });

  it('changes when a change to their items is saved during the review, and on another day', () => {
    const base = spreadBasis(answers, read, DAYS, TODAY);
    const once = spreadBasis({ ...answers, touched: 1 }, read, DAYS, TODAY);
    expect(once).not.toBe(base);
    expect(spreadBasis({ ...answers, touched: 2 }, read, DAYS, TODAY)).not.toBe(once);
    expect(spreadBasis({ ...answers, touched: 0 }, read, DAYS, TODAY)).toBe(base);
    // picked up the day after, with the same days still ahead (next week, planned early)
    expect(spreadBasis(answers, read, DAYS, '2026-10-06')).not.toBe(base);
    expect(reliefBasis(answers, read, DAYS, '2026-10-06')).not.toBe(
      reliefBasis(answers, read, DAYS, TODAY),
    );
  });

  it('changes when they change an over-full day, so the week is spread again around it', () => {
    const base = spreadBasis(answers, read, DAYS, TODAY);
    const moved = spreadBasis(
      { ...answers, relieved: { '2026-10-07': 'moved' } },
      read,
      DAYS,
      TODAY,
    );
    expect(moved).not.toBe(base);
    expect(
      spreadBasis({ ...answers, relieved: { '2026-10-07': 'changed' } }, read, DAYS, TODAY),
    ).toBe(moved);
    // a day left as it is changes nothing
    expect(spreadBasis({ ...answers, relieved: { '2026-10-07': 'left' } }, read, DAYS, TODAY)).toBe(
      base,
    );
  });

  it('is not what the suggestions for over-full days were made from, which no answer to them changes', () => {
    const base = reliefBasis(answers, read, DAYS, TODAY);
    expect(
      reliefBasis({ ...answers, relieved: { '2026-10-07': 'moved' } }, read, DAYS, TODAY),
    ).toBe(base);
    expect(reliefBasis({ ...answers, keep: 'none' }, read, DAYS, TODAY)).not.toBe(base);
    expect(reliefBasis({ ...answers, hours: { normal_day: 3 } }, read, DAYS, TODAY)).not.toBe(base);
  });
});

describe('whose a day is', () => {
  const wed = { id: 'boiler', due_day: '2026-10-07' };

  it('is theirs unless it is where Gremly’s last spread of this week put it', () => {
    expect(gremlyPut(wed, {})).toBe(false);
    expect(gremlyPut(wed, null)).toBe(false);
    expect(gremlyPut(wed, { planned: { gremly: { boiler: '2026-10-07' } } })).toBe(true);
    // moved since: the day it is on now is one they gave it
    expect(gremlyPut(wed, { planned: { gremly: { boiler: '2026-10-06' } } })).toBe(false);
    expect(gremlyPut({ id: 'boiler', due_day: null }, { planned: { gremly: {} } })).toBe(false);
  });

  it('keeps their own days unless they say otherwise', () => {
    expect(released(wed, {})).toBe(false);
    expect(released(wed, { keep: 'all' })).toBe(false);
    expect(released(wed, { keep: 'none' })).toBe(true);
    expect(released(wed, { keep: 'some', freed: ['boiler'] })).toBe(true);
    expect(released(wed, { keep: 'some', freed: ['other'] })).toBe(false);
    // freed while keeping some, then keeping them all again
    expect(released(wed, { keep: 'all', freed: ['boiler'] })).toBe(false);
    expect(released({ id: 'boiler', due_day: null }, { keep: 'none' })).toBe(false);
  });

  it('gives Gremly back his own placement whatever they said of theirs', () => {
    const put = { planned: { gremly: { boiler: '2026-10-07' } } };
    expect(released(wed, put)).toBe(true);
    expect(released(wed, { ...put, keep: 'all' })).toBe(true);
  });

  it('never frees a todo with a time of day, whoever put it on its day', () => {
    const timed = { ...wed, timed: true };
    expect(released(timed, { keep: 'none' })).toBe(false);
    expect(released(timed, { keep: 'some', freed: ['boiler'] })).toBe(false);
    // Gremly put it there, and they have since given it a time
    expect(released(timed, { planned: { gremly: { boiler: '2026-10-07' } } })).toBe(false);
  });

  it('asks about their days from six of them', () => {
    expect(KEEP_ASK_FROM).toBe(6);
  });
});
