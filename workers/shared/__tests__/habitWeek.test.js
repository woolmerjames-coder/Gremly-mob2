/**
 * @jest-environment node
 */
import {
  checkInOpen,
  daysLeft,
  habitToCheckIn,
  moveDayFor,
  moveDaysFor,
  plannedOn,
  roomLeft,
  weekAround,
} from '../habitWeek';

// Thursday 8 October 2026; their weekly day is Sunday, so the week is Monday 5 to Sunday 11
const TODAY = '2026-10-08';
const HOURS = { normal_day: 2, busy_day: 1, weekend_day: 4 };

const strength = {
  id: 'h-strength',
  name: 'Strength',
  cadence: 'weekly',
  target_per_period: 3,
  time_estimate_minutes: 45,
};
const walk = { id: 'h-walk', name: 'Walk', cadence: 'weekly', time_estimate_minutes: 20 };
const plan = (habit_id, planned_date, status = 'planned') => ({ habit_id, planned_date, status });

describe('the week a day is in', () => {
  it('is the seven days that end on their weekly day', () => {
    expect(weekAround(TODAY, 0)).toEqual({ first: '2026-10-05', last: '2026-10-11' });
    expect(weekAround('2026-10-11', 0)).toEqual({ first: '2026-10-05', last: '2026-10-11' });
    expect(weekAround('2026-10-12', 0)).toEqual({ first: '2026-10-12', last: '2026-10-18' });
  });

  it('has the days after today left, and none on the weekly day', () => {
    expect(daysLeft(TODAY, 0)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(daysLeft('2026-10-11', 0)).toEqual([]);
    expect(daysLeft('2026-10-11', 3)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('which habit a morning checks in on', () => {
  const on = (over = {}) => ({
    today: TODAY,
    planned: new Set(['h-strength']),
    doneToday: new Set(),
    ...over,
  });

  it('asks about a habit still planned for today', () => {
    expect(checkInOpen(strength, on())).toBe(true);
  });

  it('never asks about one not planned today, done today, daily, or being broken', () => {
    expect(checkInOpen(strength, on({ planned: new Set() }))).toBe(false);
    expect(checkInOpen(strength, on({ doneToday: new Set(['h-strength']) }))).toBe(false);
    expect(checkInOpen({ ...strength, cadence: 'daily' }, on())).toBe(false);
    expect(checkInOpen({ ...strength, cadence: null }, on())).toBe(false);
    expect(checkInOpen({ ...strength, subtype: 'break_habit' }, on())).toBe(false);
    expect(checkInOpen({ ...strength, archived: true }, on())).toBe(false);
  });

  it('never asks before a habit starts or after it ends', () => {
    expect(checkInOpen({ ...strength, start_date: '2026-10-09' }, on())).toBe(false);
    expect(checkInOpen({ ...strength, end_date: '2026-10-07' }, on())).toBe(false);
    expect(checkInOpen({ ...strength, start_date: TODAY, end_date: TODAY }, on())).toBe(true);
  });

  it('stays quiet through the day Skip this week runs to, and asks again after', () => {
    const quiet = (until) => ({ ...strength, views: { checkins_quiet_until: until } });
    expect(checkInOpen(quiet('2026-10-11'), on())).toBe(false);
    expect(checkInOpen(quiet(TODAY), on())).toBe(false);
    expect(checkInOpen(quiet('2026-10-07'), on())).toBe(true);
    // the worker selects the day as a column of its own
    expect(checkInOpen({ ...strength, quiet_until: '2026-10-11' }, on())).toBe(false);
  });

  it('reads a plan as still on only while it is planned', () => {
    const plans = [
      plan('h-strength', TODAY),
      plan('h-walk', TODAY, 'kept'),
      plan('h-run', TODAY, 'rescheduled'),
      plan('h-swim', '2026-10-09'),
      { habit_id: 'h-new', planned_date: `${TODAY}T00:00:00` },
    ];
    expect([...plannedOn(plans, TODAY)].sort()).toEqual(['h-new', 'h-strength']);
  });

  it('asks about one a morning: the longest, then by name', () => {
    const plans = [plan('h-strength', TODAY), plan('h-walk', TODAY)];
    const pick = (habits, doneToday = []) =>
      habitToCheckIn({ today: TODAY, habits, plans, doneToday });
    expect(pick([walk, strength])).toEqual({ id: 'h-strength', title: 'Strength', minutes: 45 });
    expect(pick([walk, strength], ['h-strength'])?.id).toBe('h-walk');
    expect(pick([walk, { ...strength, time_estimate_minutes: 20 }])?.id).toBe('h-strength');
    expect(pick([walk, strength], ['h-strength', 'h-walk'])).toBeNull();
    expect(pick([])).toBeNull();
  });
});

describe('the day a habit can move to', () => {
  const days = daysLeft(TODAY, 0);
  const room = (over = {}) =>
    roomLeft({
      days,
      hours: HOURS,
      daysOff: [6, 0],
      busyDays: [],
      todos: [],
      habits: [strength, walk],
      plans: [],
      ...over,
    });

  it('counts room as the free hours of the day, less what is due and planned on it', () => {
    const left = room({
      busyDays: ['2026-10-09'],
      todos: [
        { id: 't1', due_day: '2026-10-09', time_estimate_minutes: 30 },
        { id: 't2', due_day: '2026-10-10' },
        { id: 't3', due_day: '2026-10-10', completed_at: '2026-10-07T10:00:00Z' },
        { id: 't4', due_day: '2026-10-10', archived: true },
      ],
      plans: [plan('h-walk', '2026-10-10'), plan('h-walk', '2026-10-11', 'kept')],
    });
    // Friday is busy: one hour, less the half hour todo
    expect(left.get('2026-10-09')).toBe(30);
    // Saturday is a day off: four hours, less a todo with no length (30) and the walk (20)
    expect(left.get('2026-10-10')).toBe(190);
    expect(left.get('2026-10-11')).toBe(240);
  });

  it('is the day left with the most room, the sooner of two the same', () => {
    expect(moveDayFor({ habit: strength, days, plans: [], room: room() })).toBe('2026-10-10');
    const full = room({
      todos: [{ id: 't1', due_day: '2026-10-10', time_estimate_minutes: 90 }],
    });
    expect(moveDayFor({ habit: strength, days, plans: [], room: full })).toBe('2026-10-11');
  });

  it('is never a day the habit is already planned on', () => {
    const plans = [plan('h-strength', TODAY), plan('h-strength', '2026-10-10')];
    expect(moveDayFor({ habit: strength, days, plans, room: room({ plans }) })).toBe('2026-10-11');
  });

  it('is never a day the habit does not fit in, or one after it ends', () => {
    const tight = room({
      todos: [
        { id: 't1', due_day: '2026-10-09', time_estimate_minutes: 90 },
        { id: 't2', due_day: '2026-10-10', time_estimate_minutes: 210 },
        { id: 't3', due_day: '2026-10-11', time_estimate_minutes: 200 },
      ],
    });
    expect(moveDayFor({ habit: strength, days, plans: [], room: tight })).toBeNull();
    expect(moveDayFor({ habit: walk, days, plans: [], room: tight })).toBe('2026-10-11');
    const ending = { ...strength, end_date: '2026-10-09' };
    expect(moveDayFor({ habit: ending, days, plans: [], room: room() })).toBe('2026-10-09');
  });

  it('gives several habits their days in turn, so none lands on a day another filled', () => {
    // Saturday has four hours, Sunday four, Friday two; 200 minutes are taken on Sunday
    const some = room({ todos: [{ id: 't1', due_day: '2026-10-11', time_estimate_minutes: 200 }] });
    const long = { ...strength, id: 'h-long', time_estimate_minutes: 150 };
    const days2 = moveDaysFor({ habits: [long, strength, walk], days, plans: [], room: some });
    // the first takes Saturday (240), leaving 90 there; the next has most room on Friday (120)
    expect(days2.get('h-long')).toBe('2026-10-10');
    expect(days2.get('h-strength')).toBe('2026-10-09');
    // and the last where the most is left after both: Saturday's 90
    expect(days2.get('h-walk')).toBe('2026-10-10');
    // one that fits nowhere after the others is left out, and the room handed in is not changed
    const two = moveDaysFor({
      habits: [long, { ...long, id: 'h-long-2' }],
      days,
      plans: [],
      room: some,
    });
    expect([...two.keys()]).toEqual(['h-long']);
    expect(some.get('2026-10-10')).toBe(240);
  });

  it('has nowhere to go on the weekly day, the last of the week', () => {
    expect(
      moveDayFor({ habit: strength, days: daysLeft('2026-10-11', 0), plans: [], room: new Map() }),
    ).toBeNull();
  });
});
