import {
  dayOfWeekNumber,
  habitsBehindThisWeek,
  isBehindThisWeek,
  paceFloor,
  weeklyTarget,
} from '../behind';
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

describe('behind this week', () => {
  it('counts Monday as day 1 and Wednesday as day 3', () => {
    expect(dayOfWeekNumber('2026-09-28', '2026-09-28')).toBe(1);
    expect(dayOfWeekNumber('2026-09-30', '2026-09-28')).toBe(3);
    expect(dayOfWeekNumber('2026-10-04', '2026-09-28')).toBe(7);
  });

  it('matches the signed-off example: on a Wednesday 0 of 3 is behind, 0 of 2 is not', () => {
    expect(paceFloor(3, 3)).toBe(1);
    expect(paceFloor(2, 3)).toBe(0);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 0, 3)).toBe(true);
    expect(isBehindThisWeek(habit({ target_per_period: 2 }), 0, 3)).toBe(false);
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 1, 3)).toBe(false);
  });

  it('a week away: 0 of 3 strength by Wednesday is behind', () => {
    expect(isBehindThisWeek(habit({ target_per_period: 3 }), 0, 3)).toBe(true);
  });

  it('never counts daily habits, habits being broken, or archived ones', () => {
    expect(weeklyTarget(habit({ cadence: 'daily' }))).toBeNull();
    expect(weeklyTarget(habit({ cadence: 'monthly' }))).toBeNull();
    expect(isBehindThisWeek(habit({ cadence: 'daily' }), 0, 7)).toBe(false);
    expect(isBehindThisWeek(habit({ subtype: 'break_habit' as Habit['subtype'] }), 0, 7)).toBe(
      false,
    );
    expect(isBehindThisWeek(habit({ archived: true }), 0, 7)).toBe(false);
  });

  it('takes the target from the days a scheduled habit runs when there is no number', () => {
    expect(weeklyTarget(habit({ target_per_period: undefined, days_active: [1, 3, 5] }))).toBe(3);
    expect(weeklyTarget(habit({ target_per_period: undefined, days_active: null }))).toBe(1);
  });

  it('is never behind on Monday for targets under 7', () => {
    for (let t = 1; t < 7; t++)
      expect(isBehindThisWeek(habit({ target_per_period: t }), 0, 1)).toBe(false);
  });

  it('lists the habits behind, in order', () => {
    const list = [
      habit({ id: 'social', target_per_period: 3 }),
      habit({ id: 'pushups', target_per_period: 2 }),
      habit({ id: 'strength', target_per_period: 3 }),
      habit({ id: 'messaging', cadence: 'daily' }),
    ];
    const done = new Map([['strength', 1]]);
    expect(habitsBehindThisWeek(list, done, 3).map((h) => h.id)).toEqual(['social']);
  });
});
