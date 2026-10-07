/**
 * @jest-environment node
 */
import {
  behindInWeek,
  checkInOpen,
  dayOfWeek,
  daysLeft,
  easeApplied,
  easeOf,
  easeOn,
  easeOver,
  easePlan,
  easesFrom,
  habitToCheckIn,
  loadOn,
  moveDayFor,
  moveDaysFor,
  paceFloor,
  pauseSpans,
  pausedOn,
  plannedOn,
  roomLeft,
  unpaused,
  weekAround,
  weeklyTarget,
} from '../habitWeek';
import { habitAllowance, habitOpenDays } from '../weekBoard';

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

  it('says how full a day already is: what is due on it and what is planned on it', () => {
    const full = loadOn({
      days: ['2026-10-09', '2026-10-10', '2026-10-12'],
      todos: [
        { id: 't1', due_day: '2026-10-09', time_estimate_minutes: 90 },
        // no length: the board's half hour
        { id: 't2', due_day: '2026-10-09' },
        { id: 't3', due_day: '2026-10-09', completed_at: '2026-10-08T10:00:00Z' },
        { id: 't4', due_day: '2026-10-10', archived: true },
      ],
      habits: [strength, walk],
      plans: [plan('h-strength', '2026-10-09'), plan('h-walk', '2026-10-10', 'kept')],
    });
    // 90 + 30 of todos and the 45 minute habit
    expect(full.get('2026-10-09')).toBe(165);
    // an archived todo and a plan already settled add nothing
    expect(full.get('2026-10-10')).toBe(0);
    expect(full.get('2026-10-12')).toBe(0);
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

describe('a count toward a weekly target', () => {
  const run = { id: 'h-run', name: 'Run', cadence: 'weekly', target_per_period: 3 };

  it('is made in their own week: day 1 is the day after their weekly day', () => {
    // Sunday: Monday is day 1, Thursday day 4, Sunday day 7
    expect(dayOfWeek('2026-10-05', 0)).toBe(1);
    expect(dayOfWeek(TODAY, 0)).toBe(4);
    expect(dayOfWeek('2026-10-11', 0)).toBe(7);
    // Wednesday: their week runs Thursday to Wednesday
    expect(weekAround(TODAY, 3)).toEqual({ first: '2026-10-08', last: '2026-10-14' });
    expect(dayOfWeek(TODAY, 3)).toBe(1);
    expect(dayOfWeek('2026-10-14', 3)).toBe(7);
  });

  it('has a target only for a weekly habit they are building', () => {
    expect(weeklyTarget(run)).toBe(3);
    expect(weeklyTarget({ cadence: 'weekly', days_active: [1, 3] })).toBe(2);
    expect(weeklyTarget({ cadence: 'weekly' })).toBe(1);
    expect(weeklyTarget({ cadence: 'daily', target_per_period: 1 })).toBeNull();
    expect(weeklyTarget({ ...run, subtype: 'break_habit' })).toBeNull();
    expect(weeklyTarget(null)).toBeNull();
  });

  it('is behind when what is done is under the target pro rata for the days gone', () => {
    expect(paceFloor(3, 3)).toBe(1);
    expect(paceFloor(2, 3)).toBe(0);
    // Wednesday, day 3 of a Sunday person's week
    const wed = '2026-10-07';
    expect(behindInWeek({ habit: run, done: 0, today: wed, weeklyDay: 0 })).toBe(true);
    expect(behindInWeek({ habit: run, done: 1, today: wed, weeklyDay: 0 })).toBe(false);
    expect(
      behindInWeek({ habit: { ...run, target_per_period: 2 }, done: 0, today: wed, weeklyDay: 0 }),
    ).toBe(false);
    // never on the first day of the week, for a target under seven
    expect(behindInWeek({ habit: run, done: 0, today: '2026-10-05', weeklyDay: 0 })).toBe(false);
    // never a daily habit, one being broken, or one put away
    expect(
      behindInWeek({ habit: { ...run, cadence: 'daily' }, done: 0, today: wed, weeklyDay: 0 }),
    ).toBe(false);
    expect(
      behindInWeek({ habit: { ...run, archived: true }, done: 0, today: wed, weeklyDay: 0 }),
    ).toBe(false);
  });

  it('follows their week: the same Wednesday is day 7 for a Wednesday person', () => {
    const wed = '2026-10-07';
    // for a Wednesday person the week ends that day: 2 of 3 is behind by the last day
    expect(behindInWeek({ habit: run, done: 2, today: wed, weeklyDay: 3 })).toBe(true);
    expect(behindInWeek({ habit: run, done: 2, today: wed, weeklyDay: 0 })).toBe(false);
  });
});

describe('a pause, or a lighter version', () => {
  const run = { id: 'h-run', name: 'Run', cadence: 'weekly', target_per_period: 3 };
  const row = (mode, period_start, period_end, more = {}) => ({
    id: `${mode}-${period_start}`,
    habit_id: 'h-run',
    mode,
    period_start,
    period_end,
    floor_note: null,
    ...more,
  });

  it('is read from its row: the table calls a lighter version floor', () => {
    expect(easeOf(row('pause', '2026-10-05', '2026-10-11'))).toEqual({
      id: 'pause-2026-10-05',
      habit_id: 'h-run',
      mode: 'pause',
      first: '2026-10-05',
      last: '2026-10-11',
      note: '',
    });
    expect(
      easeOf(row('floor', '2026-10-05', '2026-10-11', { floor_note: '  10 minute   walk ' })),
    ).toMatchObject({ mode: 'lighter', note: '10 minute walk' });
    // a mode that changes nothing, and a row that is not a stretch of days
    expect(easeOf(row('keep', '2026-10-05', '2026-10-11'))).toBeNull();
    expect(easeOf(row('pause', '2026-10-11', '2026-10-05'))).toBeNull();
    expect(easeOf(null)).toBeNull();
  });

  it('holds on its own days and its own habit only', () => {
    const rows = [row('pause', '2026-10-08', '2026-10-11')];
    expect(pausedOn(rows, 'h-run', '2026-10-07')).toBe(false);
    expect(pausedOn(rows, 'h-run', TODAY)).toBe(true);
    expect(pausedOn(rows, 'h-run', '2026-10-11')).toBe(true);
    expect(pausedOn(rows, 'h-run', '2026-10-12')).toBe(false);
    expect(pausedOn(rows, 'h-walk', TODAY)).toBe(false);
    expect(pausedOn(null, 'h-run', TODAY)).toBe(false);
    // a lighter version is not a pause
    const lighter = [row('floor', '2026-10-08', '2026-10-11', { floor_note: 'Stretch' })];
    expect(pausedOn(lighter, 'h-run', TODAY)).toBe(false);
    expect(easeOn(lighter, 'h-run', TODAY)).toMatchObject({ mode: 'lighter', note: 'Stretch' });
    expect(unpaused(rows, 'h-run', ['2026-10-07', TODAY, '2026-10-12'])).toEqual([
      '2026-10-07',
      '2026-10-12',
    ]);
    expect(pauseSpans(rows, 'h-run')).toEqual([{ first: '2026-10-08', last: '2026-10-11' }]);
  });

  it('is the one over every day asked about, or none', () => {
    const week = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    expect(easeOver([row('pause', '2026-10-05', '2026-10-11')], 'h-run', week)?.mode).toBe('pause');
    // only part of the days
    expect(easeOver([row('pause', '2026-10-08', '2026-10-09')], 'h-run', week)).toBeNull();
    expect(easeOver([], 'h-run', week)).toBeNull();
    expect(easeOver([row('pause', '2026-10-05', '2026-10-11')], 'h-run', [])).toBeNull();
  });

  it('lists what is still to run, soonest first', () => {
    const rows = [
      row('floor', '2026-10-19', '2026-10-25'),
      row('pause', '2026-10-01', '2026-10-04'),
      row('pause', '2026-10-06', '2026-10-09'),
    ];
    expect(easesFrom(rows, TODAY).map((e) => e.first)).toEqual(['2026-10-06', '2026-10-19']);
  });

  it('leaves a paused habit alone: not asked about, and never behind', () => {
    const paused = [row('pause', TODAY, '2026-10-11')];
    const strengthPaused = [{ ...paused[0], habit_id: 'h-strength' }];
    const on = { today: TODAY, planned: new Set(['h-strength']), doneToday: new Set() };
    expect(checkInOpen(strength, on)).toBe(true);
    expect(checkInOpen(strength, { ...on, eases: strengthPaused })).toBe(false);
    expect(
      habitToCheckIn({
        today: TODAY,
        habits: [strength],
        plans: [plan('h-strength', TODAY)],
        doneToday: [],
        eases: strengthPaused,
      }),
    ).toBeNull();
    // Thursday, day 4: 0 of 3 is behind, but not while it is paused
    expect(behindInWeek({ habit: run, done: 0, today: TODAY, weeklyDay: 0 })).toBe(true);
    expect(behindInWeek({ habit: run, done: 0, today: TODAY, weeklyDay: 0, eases: paused })).toBe(
      false,
    );
  });

  it('does not count a paused day as gone once the pause is over', () => {
    // paused Monday to Wednesday, back on Thursday: one day gone, so 0 of 3 is on pace
    const eases = [row('pause', '2026-10-05', '2026-10-07')];
    expect(behindInWeek({ habit: run, done: 0, today: TODAY, weeklyDay: 0, eases })).toBe(false);
    // by Sunday four days have gone: floor(12 / 7) = 1
    expect(behindInWeek({ habit: run, done: 0, today: '2026-10-11', weeklyDay: 0, eases })).toBe(
      true,
    );
  });

  it('takes its days off the ones a habit can be planned on', () => {
    const days = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const rule = { cadence: 'weekly', target: 3 };
    expect(habitAllowance(rule, days)).toBe(3);
    const part = { ...rule, paused: [{ first: '2026-10-09', last: '2026-10-11' }] };
    expect(habitOpenDays(part, days)).toEqual(['2026-10-08']);
    expect(habitAllowance(part, days)).toBe(1);
    const all = { ...rule, paused: [{ first: '2026-10-05', last: '2026-10-11' }] };
    expect(habitAllowance(all, days)).toBe(0);
  });
});

describe('giving a habit a pause, a lighter version or its usual self', () => {
  const row = (id, mode, period_start, period_end, floor_note = null) => ({
    id,
    habit_id: 'h-run',
    mode,
    period_start,
    period_end,
    floor_note,
    source_ref: null,
  });
  const stretch = { first: '2026-10-08', last: '2026-10-11' };

  it('adds the stretch when nothing is in its way', () => {
    expect(easePlan([], { mode: 'pause', ...stretch })).toEqual({
      remove: [],
      shorten: [],
      add: [
        {
          mode: 'pause',
          period_start: '2026-10-08',
          period_end: '2026-10-11',
          floor_note: null,
          source_ref: null,
        },
      ],
      same: false,
    });
    const lighter = easePlan([], { mode: 'lighter', ...stretch, note: ' 10 minute  walk ' });
    expect(lighter.add[0]).toMatchObject({ mode: 'floor', floor_note: '10 minute walk' });
    // a lighter version need not say what it is
    expect(easePlan([], { mode: 'lighter', ...stretch }).add[0].floor_note).toBeNull();
  });

  it('makes what is already there give way', () => {
    const inside = row('in', 'floor', '2026-10-09', '2026-10-10', 'Stretch');
    const before = row('left', 'floor', '2026-10-05', '2026-10-08', 'Walk');
    const after = row('right', 'floor', '2026-10-11', '2026-10-14', 'Walk');
    const clear = row('clear', 'pause', '2026-10-20', '2026-10-25');
    const plan = easePlan([inside, before, after, clear], { mode: 'pause', ...stretch });
    expect(plan.remove).toEqual([inside]);
    expect(plan.shorten).toEqual([
      { row: before, period_start: '2026-10-05', period_end: '2026-10-07' },
      { row: after, period_start: '2026-10-12', period_end: '2026-10-14' },
    ]);
    expect(plan.add.map((a) => [a.mode, a.period_start, a.period_end])).toEqual([
      ['pause', '2026-10-08', '2026-10-11'],
    ]);
  });

  it('joins what is already there of its own kind into one row', () => {
    // a pause that reaches in, one that touches the day after, and a lighter version in the way
    const reaching = row('left', 'pause', '2026-10-05', '2026-10-08');
    const touching = row('right', 'pause', '2026-10-12', '2026-10-14');
    const inside = row('in', 'floor', '2026-10-09', '2026-10-10', 'Stretch');
    const apart = row('apart', 'pause', '2026-10-16', '2026-10-20');
    const plan = easePlan([reaching, inside, touching, apart], { mode: 'pause', ...stretch });
    expect(plan.remove).toEqual([reaching, touching, inside]);
    expect(plan.shorten).toEqual([]);
    expect(plan.add.map((a) => [a.mode, a.period_start, a.period_end])).toEqual([
      ['pause', '2026-10-05', '2026-10-14'],
    ]);
    // a lighter version joins only one with the same words
    const walk = row('w', 'floor', '2026-10-05', '2026-10-08', 'Walk');
    const same = easePlan([walk], { mode: 'lighter', ...stretch, note: 'Walk' });
    expect(same.add.map((a) => [a.period_start, a.period_end])).toEqual([
      ['2026-10-05', '2026-10-11'],
    ]);
    const other = easePlan([walk], { mode: 'lighter', ...stretch, note: 'Swim' });
    expect(other.shorten).toEqual([
      { row: walk, period_start: '2026-10-05', period_end: '2026-10-07' },
    ]);
    expect(other.add.map((a) => [a.period_start, a.period_end, a.floor_note])).toEqual([
      ['2026-10-08', '2026-10-11', 'Swim'],
    ]);
  });

  it('cuts a row that runs across the stretch in two', () => {
    const across = row('long', 'pause', '2026-10-05', '2026-10-20');
    const plan = easePlan([across], { mode: 'lighter', ...stretch, note: 'Walk' });
    expect(plan.shorten).toEqual([
      { row: across, period_start: '2026-10-05', period_end: '2026-10-07' },
    ]);
    expect(plan.add.map((a) => [a.mode, a.period_start, a.period_end, a.floor_note])).toEqual([
      ['pause', '2026-10-12', '2026-10-20', null],
      ['floor', '2026-10-08', '2026-10-11', 'Walk'],
    ]);
  });

  it('takes a pause or lighter version away for usual, keeping the days already gone', () => {
    const running = row('run', 'pause', '2026-10-05', '2026-10-18');
    const later = row('next', 'floor', '2026-10-20', '2026-10-25', 'Walk');
    const plan = easePlan([running, later], {
      mode: 'usual',
      first: '2026-10-08',
      last: '2026-11-05',
    });
    expect(plan.shorten).toEqual([
      { row: running, period_start: '2026-10-05', period_end: '2026-10-07' },
    ]);
    expect(plan.remove).toEqual([later]);
    expect(plan.add).toEqual([]);
    expect(plan.same).toBe(false);
  });

  it('says so when it already is that way', () => {
    const there = row('p', 'pause', '2026-10-08', '2026-10-11');
    expect(easePlan([there], { mode: 'pause', ...stretch }).same).toBe(true);
    // days it already holds are already so: a pause inside a pause changes nothing
    expect(easePlan([there], { mode: 'pause', first: '2026-10-09', last: '2026-10-10' }).same).toBe(
      true,
    );
    // a day more, or another kind, is a change
    expect(easePlan([there], { mode: 'pause', first: '2026-10-08', last: '2026-10-12' }).same).toBe(
      false,
    );
    expect(easePlan([there], { mode: 'lighter', ...stretch }).same).toBe(false);
    const walk = row('f', 'floor', '2026-10-08', '2026-10-11', 'Walk');
    expect(easePlan([walk], { mode: 'lighter', ...stretch, note: 'Walk' }).same).toBe(true);
    expect(easePlan([walk], { mode: 'lighter', ...stretch, note: 'Swim' }).same).toBe(false);
    // usual, with nothing to take away
    expect(easePlan([], { mode: 'usual', ...stretch }).same).toBe(true);
    expect(
      easePlan([row('old', 'pause', '2026-10-01', '2026-10-04')], { mode: 'usual', ...stretch })
        .same,
    ).toBe(true);
  });

  it('shows the rows as they would stand, before anything is saved', () => {
    const running = row('f', 'floor', '2026-10-05', '2026-10-09', 'Walk');
    const other = { ...row('z', 'pause', '2026-10-01', '2026-10-30'), habit_id: 'h-read' };
    const rows = [running, other];
    const paused = easeApplied(rows, 'h-run', { mode: 'pause', ...stretch });
    // the lighter version gives way, the pause is new, and another habit's row is as it was
    expect(paused).toEqual([
      { ...running, period_end: '2026-10-07' },
      other,
      {
        id: null,
        habit_id: 'h-run',
        mode: 'pause',
        period_start: '2026-10-08',
        period_end: '2026-10-11',
        floor_note: null,
        source_ref: null,
      },
    ]);
    expect(pausedOn(paused, 'h-run', '2026-10-09')).toBe(true);
    // nothing was changed in place
    expect(running.period_end).toBe('2026-10-09');
    // back to usual over the stretch, and what is already so is handed back as it is
    expect(easeApplied(paused, 'h-run', { mode: 'usual', ...stretch })).toEqual([
      { ...running, period_end: '2026-10-07' },
      other,
    ]);
    expect(easeApplied(rows, 'h-swim', { mode: 'usual', ...stretch })).toBe(rows);
    expect(easeApplied(null, 'h-run', { mode: 'usual', ...stretch })).toEqual([]);
  });
});
