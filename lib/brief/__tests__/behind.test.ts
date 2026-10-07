import { habitsBehindThisWeek, isBehindThisWeek, paceFloor, weeklyTarget } from '../behind';
import { dayOfWeek } from '../../week/habitWeek';
import type { HabitAdaptationRow } from '../../store/useGremlyStore';
import type { Habit } from '../../types';

const habit = (over: Partial<Habit>): Habit =>
  ({
    id: 'h',
    name: 'Habit',
    cadence: 'weekly',
    target_per_period: 3,
    subtype: 'start_habit',
    ...over,
  }) as Habit;

// Monday 28 September to Sunday 4 October 2026 is a Sunday person's week
const MON = '2026-09-28';
const WED = '2026-09-30';
const SUN = '2026-10-04';
/** A day in a Sunday person's week */
const sunday = (today: string) => ({ today, weeklyDay: 0 });

const pause = (habitId: string, first: string, last: string): HabitAdaptationRow => ({
  id: `pause-${habitId}`,
  owner_id: 'u',
  habit_id: habitId,
  mode: 'pause',
  period_start: first,
  period_end: last,
  created_at: `${first}T08:00:00Z`,
  updated_at: `${first}T08:00:00Z`,
});

describe('behind this week', () => {
  it('counts Monday as day 1 and Wednesday as day 3 for a Sunday person', () => {
    expect(dayOfWeek(MON, 0)).toBe(1);
    expect(dayOfWeek(WED, 0)).toBe(3);
    expect(dayOfWeek(SUN, 0)).toBe(7);
  });

  it('matches the signed-off example: on a Wednesday 0 of 3 is behind, 0 of 2 is not', () => {
    expect(paceFloor(3, 3)).toBe(1);
    expect(paceFloor(2, 3)).toBe(0);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 0, sunday(WED))).toBe(true);
    expect(isBehindThisWeek(habit({ target_per_period: 2 }), 0, sunday(WED))).toBe(false);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 1, sunday(WED))).toBe(false);
  });

  it('a week away: 0 of 3 strength by Wednesday is behind', () => {
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 0, sunday(WED))).toBe(true);
  });

  it('counts the same day in the week of a Wednesday person', () => {
    // their week is Thursday to Wednesday, so that Wednesday is its last day
    const wednesday = (today: string) => ({ today, weeklyDay: 3 });
    expect(dayOfWeek(WED, 3)).toBe(7);
    // all 3 are due by the last day: 2 of 3 is behind for them, and not for a Sunday person
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 2, wednesday(WED))).toBe(true);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 2, sunday(WED))).toBe(false);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 3, wednesday(WED))).toBe(false);
    // Thursday is the first day of their next week
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 0, wednesday('2026-10-01'))).toBe(
      false,
    );
  });

  it('never counts daily habits, habits being broken, or archived ones', () => {
    expect(weeklyTarget(habit({ cadence: 'daily' }))).toBeNull();
    expect(weeklyTarget(habit({ cadence: 'monthly' }))).toBeNull();
    expect(isBehindThisWeek(habit({ cadence: 'daily' }), 0, sunday(SUN))).toBe(false);
    expect(
      isBehindThisWeek(habit({ subtype: 'break_habit' as Habit['subtype'] }), 0, sunday(SUN)),
    ).toBe(false);
    expect(isBehindThisWeek(habit({ archived: true }), 0, sunday(SUN))).toBe(false);
  });

  it('takes the target from the days a scheduled habit runs when there is no number', () => {
    expect(weeklyTarget(habit({ target_per_period: undefined, days_active: [1, 3, 5] }))).toBe(3);
    expect(weeklyTarget(habit({ target_per_period: undefined, days_active: null }))).toBe(1);
  });

  it('is never behind on the first day of their week for targets under 7', () => {
    for (let t = 1; t < 7; t++)
      expect(isBehindThisWeek(habit({ target_per_period: t }), 0, sunday(MON))).toBe(false);
  });

  it('is never behind while paused', () => {
    const run = habit({ id: 'run', target_per_period: 3 });
    const paused = [pause('run', WED, '2026-10-02')];
    expect(isBehindThisWeek(run, 0, sunday(WED))).toBe(true);
    expect(isBehindThisWeek(run, 0, { ...sunday(WED), eases: paused })).toBe(false);
    // another habit's pause does not hold this one
    expect(isBehindThisWeek(run, 0, { ...sunday(WED), eases: [pause('walk', WED, WED)] })).toBe(
      true,
    );
  });

  it('does not count a paused day as gone once the pause is over', () => {
    const run = habit({ id: 'run', target_per_period: 3 });
    // paused Tuesday to Friday: by Saturday only Monday and Saturday are gone
    const eases = [pause('run', '2026-09-29', '2026-10-02')];
    expect(isBehindThisWeek(run, 0, sunday('2026-10-03'))).toBe(true);
    expect(isBehindThisWeek(run, 0, { ...sunday('2026-10-03'), eases })).toBe(false);
  });

  it('lists the habits behind, in order', () => {
    const list = [
      habit({ id: 'social', target_per_period: 3 }),
      habit({ id: 'pushups', target_per_period: 2 }),
      habit({ id: 'strength', target_per_period: 3 }),
      habit({ id: 'messaging', cadence: 'daily' }),
    ];
    const done = new Map([['strength', 1]]);
    expect(habitsBehindThisWeek(list, done, sunday(WED)).map((h) => h.id)).toEqual(['social']);
    // a paused habit is left off the list
    const eases = [pause('social', WED, WED)];
    expect(habitsBehindThisWeek(list, done, { ...sunday(WED), eases })).toEqual([]);
  });
});
