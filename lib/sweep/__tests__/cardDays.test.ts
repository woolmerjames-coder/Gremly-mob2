/**
 * The days a card offers a todo (lib/sweep/cardDays): how full each already
 * is, the day a Later comes back on, and when the card stops offering Later.
 */
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: () => [],
}));
jest.mock('../../week/thisWeek', () => ({
  useThisWeek: () => 0,
}));

import {
  PUSHES_BEFORE_ASK,
  asksKeepOrLetGo,
  backDayName,
  dayLoad,
  dayWithLoad,
  laterBackDay,
  laterOffered,
  pickedDayName,
} from '../cardDays';

// Wednesday 7 October 2026
const TODAY = '2026-10-07';

describe('how full a day already is', () => {
  const todos = [
    { id: 'a', due_day: '2026-10-08', time_estimate_minutes: 90 },
    // no length: half an hour, as on the board
    { id: 'b', due_day: '2026-10-08' },
    { id: 'own', due_day: '2026-10-08', time_estimate_minutes: 60 },
    { id: 'done', due_day: '2026-10-08', completed_at: '2026-10-07T09:00:00Z' },
    { id: 'c', due_day: '2026-10-09', time_estimate_minutes: 20 },
  ];
  const habits = [{ id: 'h1', name: 'Swim', cadence: 'weekly', time_estimate_minutes: 45 }];
  const plans = [{ habit_id: 'h1', planned_date: '2026-10-08', status: 'planned' }];

  it('is the todos due on it and the habits planned on it', () => {
    expect(dayLoad({ day: '2026-10-08', todos, habits, plans })).toBe(90 + 30 + 60 + 45);
    expect(dayLoad({ day: '2026-10-09', todos, habits, plans })).toBe(20);
    expect(dayLoad({ day: '2026-10-10', todos, habits, plans })).toBe(0);
  });

  it('leaves out the card’s own todo, so the day reads as what else is on it', () => {
    expect(dayLoad({ day: '2026-10-08', todos, habits, plans, without: 'own' })).toBe(165);
  });

  it('does not count a habit already logged that day, or one that was put away', () => {
    const logged = [{ habit_id: 'h1', occurred_day: '2026-10-08' }];
    expect(dayLoad({ day: '2026-10-08', todos, habits, plans, progress: logged })).toBe(180);
    // logged on another day: still on for this one
    const other = [{ habit_id: 'h1', occurred_day: '2026-10-07' }];
    expect(dayLoad({ day: '2026-10-08', todos, habits, plans, progress: other })).toBe(225);
    const away = [{ ...habits[0], archived: true }];
    expect(dayLoad({ day: '2026-10-08', todos, habits: away, plans })).toBe(180);
  });

  it('is said beside the day, in hours and minutes', () => {
    expect(dayWithLoad('Tue', 360)).toBe('Tue · 6h');
    expect(dayWithLoad('Tomorrow', 165)).toBe('Tomorrow · 2h 45m');
    expect(dayWithLoad('Today', 20)).toBe('Today · 20m');
    expect(dayWithLoad('Today', 0)).toBe('Today · 0h');
    // not known: the name alone
    expect(dayWithLoad('Today', null)).toBe('Today');
    expect(pickedDayName('2026-10-13')).toBe('Tue 13 Oct');
    expect(backDayName('2026-10-12')).toBe('Mon 12');
  });
});

describe('the day a Later comes back on', () => {
  const later = (id: string, back: string, more = {}) => ({ id, resurface_at: back, ...more });

  it('is after the week they are in, the earliest day with the fewest already coming back', () => {
    // Sunday is their weekly day: this week ends on Sunday 11 October
    expect(laterBackDay({ todoId: 't', today: TODAY, weeklyDay: 0, todos: [] })).toBe('2026-10-12');
    const todos = [
      later('a', '2026-10-12'),
      later('b', '2026-10-12'),
      later('c', '2026-10-13'),
      // this todo's own back day, one with a day of its own, and ones done or put away, are not counted
      later('t', '2026-10-14'),
      later('d', '2026-10-14', { due_day: '2026-10-14' }),
      later('e', '2026-10-14', { completed_at: '2026-10-07T09:00:00Z' }),
      later('f', '2026-10-14', { archived: true }),
    ];
    expect(laterBackDay({ todoId: 't', today: TODAY, weeklyDay: 0, todos })).toBe('2026-10-14');
  });

  it('follows their own weekly day', () => {
    // Friday is their weekly day: the week ends on Friday 9 October
    expect(laterBackDay({ todoId: 't', today: TODAY, weeklyDay: 5, todos: [] })).toBe('2026-10-10');
    // on the weekly day itself the week being planned is the one ahead
    expect(laterBackDay({ todoId: 't', today: TODAY, weeklyDay: 3, todos: [] })).toBe('2026-10-15');
  });
});

describe('when a card stops offering Later', () => {
  it('offers Later until the todo has been put off twice', () => {
    expect(PUSHES_BEFORE_ASK).toBe(2);
    expect(laterOffered({ id: 't' })).toBe(true);
    expect(laterOffered({ id: 't', resurface_count: 1 })).toBe(true);
    expect(laterOffered({ id: 't', resurface_count: 2 })).toBe(false);
    expect(laterOffered({ id: 't', resurface_count: 5 })).toBe(false);
  });

  it('asks keep or let go when one put off twice has come back', () => {
    const back = { id: 't', resurface_count: 2, resurface_at: TODAY, due_day: null };
    expect(asksKeepOrLetGo(back, TODAY)).toBe(true);
    // back since an earlier day and still waiting
    expect(asksKeepOrLetGo({ ...back, resurface_at: '2026-10-05' }, TODAY)).toBe(true);
    // put off once: the card offers its days, Later among them
    expect(asksKeepOrLetGo({ ...back, resurface_count: 1 }, TODAY)).toBe(false);
    // given a day since: it is no longer put off
    expect(asksKeepOrLetGo({ ...back, due_day: TODAY, resurface_at: null }, TODAY)).toBe(false);
    expect(asksKeepOrLetGo({ ...back, due_day: TODAY }, TODAY)).toBe(false);
    // still to come back
    expect(asksKeepOrLetGo({ ...back, resurface_at: '2026-10-09' }, TODAY)).toBe(false);
    expect(asksKeepOrLetGo(null, TODAY)).toBe(false);
  });
});
