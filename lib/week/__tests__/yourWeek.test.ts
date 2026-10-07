/**
 * Your week (lib/week/yourWeek.ts): the week they planned, read back as what
 * was planned for each day against how it went. The person is made up (Maya):
 * her week runs Monday 5 to Sunday 11 October 2026, and today is Wednesday.
 */
import { yourWeekOf, type YourWeekInput } from '../yourWeek';

const [MON, TUE, WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

const todo = (id: string, name: string, o: Record<string, unknown> = {}) => ({ id, name, ...o });

const TODOS = [
  // planned for Monday and done that day
  todo('reports', 'Gather the grades', { due_day: MON, completed_at: `${MON}T17:00:00Z` }),
  // planned for Monday, moved on to Thursday
  todo('boiler', 'Sort the boiler', { due_day: THU }),
  // planned for Monday, then put off
  todo('desk', 'Look at standing desks', { resurface_at: '2026-10-13' }),
  // planned for Tuesday, let go
  todo('forms', 'Dentist forms', { due_day: TUE, archived: true }),
  // planned for Tuesday, done a day late
  todo('marking', 'The Year 9 marking', { due_day: TUE, completed_at: `${WED}T09:00:00Z` }),
  // planned for Wednesday, still open
  todo('present', 'Find a present', { due_day: WED }),
  // planned for Wednesday, its day taken off since
  todo('bulbs', 'Plant the bulbs'),
  // not in the plan: added to Wednesday since, and one done on Monday besides
  todo('milk', 'Buy milk', { due_day: WED }),
  todo('call', 'Call the plumber', { completed_at: `${MON}T12:00:00Z` }),
  // in Later, and never in the plan
  todo('shed', 'Clear the shed', { resurface_at: '2026-10-20' }),
  // archived and never planned: nowhere
  todo('old', 'Old thing', { due_day: WED, archived: true }),
];

const HABITS = [
  { id: 'swim', name: 'Swim' },
  { id: 'read', name: 'Read' },
  { id: 'gone', name: 'Old habit', archived: true },
];

function input(over: Partial<YourWeekInput> = {}, answers: Record<string, unknown> = {}) {
  return {
    today: WED,
    row: {
      week_start: MON,
      answers: {
        intention: ' Fewer things, finished. ',
        priorities: [
          { text: 'Get the reports started', item_ids: ['reports'] },
          { text: 'Two swims', item_ids: [] },
        ],
        planned: {
          todos: 7,
          later: 1,
          habit_days: 2,
          days: {
            [MON]: { todos: ['reports', 'boiler', 'desk', 'deleted'], habits: ['swim'] },
            [TUE]: { todos: ['forms', 'marking'], habits: [] },
            [WED]: { todos: ['present', 'bulbs'], habits: ['read', 'gone'] },
            [SAT]: { todos: [], habits: ['swim'] },
          },
        },
        ...answers,
      },
    },
    todos: TODOS,
    habits: HABITS,
    habitPlans: [
      { habit_id: 'swim', planned_date: MON },
      { habit_id: 'swim', planned_date: SAT },
      // given a day since the week was planned
      { habit_id: 'read', planned_date: FRI },
    ],
    habitProgress: [
      { habit_id: 'swim', occurred_day: MON, count: 1 },
      // done without having the day
      { habit_id: 'read', occurred_day: TUE, count: 1 },
      // a row that counts nothing is not a day done
      { habit_id: 'read', occurred_day: WED, count: 0 },
    ],
    dayOf: (ts: string) => ts.slice(0, 10),
    ...over,
  } as YourWeekInput;
}

const dayOf = (w: ReturnType<typeof yourWeekOf>, d: string) => w.days.find((x) => x.day === d)!;
const states = (w: ReturnType<typeof yourWeekOf>, d: string) =>
  dayOf(w, d).todos.map((t) => [t.id, t.state, t.to, t.planned]);

describe('your week, read back', () => {
  it('is the week’s seven days with the intention and what matters most as they were kept', () => {
    const w = yourWeekOf(input());
    expect(w).toMatchObject({
      first: MON,
      last: SUN,
      intention: 'Fewer things, finished.',
      priorities: ['Get the reports started', 'Two swims'],
    });
    expect(w.days.map((d) => [d.day, d.when])).toEqual([
      [MON, 'past'],
      [TUE, 'past'],
      [WED, 'today'],
      [THU, 'ahead'],
      [FRI, 'ahead'],
      [SAT, 'ahead'],
      [SUN, 'ahead'],
    ]);
  });

  it('says how each planned todo stands: done, open, moved, put off or let go', () => {
    const w = yourWeekOf(input());
    expect(states(w, MON)).toEqual([
      ['reports', 'done', null, true],
      ['boiler', 'moved', THU, true],
      ['desk', 'later', '2026-10-13', true],
      // done on the day without being in its plan
      ['call', 'done', null, false],
    ]);
    expect(states(w, TUE)).toEqual([
      ['forms', 'let_go', null, true],
      // done a day late is still done, and shows on the day it was planned for
      ['marking', 'done', null, true],
    ]);
    expect(states(w, WED)).toEqual([
      ['present', 'open', null, true],
      // its day was taken off and it was not put off: it is on no day now
      ['bulbs', 'later', null, true],
      ['milk', 'open', null, false],
    ]);
    // moved here since: on the day now, and not in its plan
    expect(states(w, THU)).toEqual([['boiler', 'open', null, false]]);
  });

  it('counts what was planned for a day, how much of it is done, and what was done besides', () => {
    const w = yourWeekOf(input());
    // three todos and the swim; the grades and the swim are done; the call was done besides
    expect(dayOf(w, MON)).toMatchObject({ planned: 4, done: 2, alsoDone: 1 });
    // reading was done on Tuesday without having the day
    expect(dayOf(w, TUE)).toMatchObject({ planned: 2, done: 1, alsoDone: 1 });
    expect(dayOf(w, WED)).toMatchObject({ planned: 3, done: 0, alsoDone: 0 });
    // no plan was kept for Thursday
    expect(dayOf(w, THU)).toMatchObject({ planned: null, done: 0, alsoDone: 0 });
    expect(dayOf(w, SAT)).toMatchObject({ planned: 1, done: 0 });
  });

  it('shows each habit on the days it has, done or not, and one done without the day', () => {
    const w = yourWeekOf(input());
    expect(dayOf(w, MON).habits).toEqual([
      { id: 'swim', title: 'Swim', done: true, planned: true },
    ]);
    expect(dayOf(w, TUE).habits).toEqual([
      { id: 'read', title: 'Read', done: true, planned: false },
    ]);
    // the archived habit is gone; a progress row that counts nothing is not done
    expect(dayOf(w, WED).habits).toEqual([
      { id: 'read', title: 'Read', done: false, planned: true },
    ]);
    // given the day since the week was planned
    expect(dayOf(w, FRI).habits).toEqual([
      { id: 'read', title: 'Read', done: false, planned: true },
    ]);
  });

  it('leaves a paused habit off the days of its pause, unless it was done all the same', () => {
    const eases = [
      { id: 'e1', habit_id: 'swim', mode: 'pause', period_start: MON, period_end: SUN },
      // a lighter version changes nothing about its days
      { id: 'e2', habit_id: 'read', mode: 'floor', period_start: MON, period_end: SUN },
    ];
    const w = yourWeekOf(input({ eases }));
    // done on Monday though paused: it shows as done, and not as something planned
    expect(dayOf(w, MON).habits).toEqual([
      { id: 'swim', title: 'Swim', done: true, planned: false },
    ]);
    expect(dayOf(w, SAT).habits).toEqual([]);
    expect(dayOf(w, SAT).planned).toBe(0);
    expect(dayOf(w, FRI).habits).toEqual([
      { id: 'read', title: 'Read', done: false, planned: true },
    ]);
  });

  it('lists what comes back from Later on a day, today or still ahead, with no day of its own', () => {
    const todos = [
      ...TODOS,
      // put off until today, and until Friday
      todo('paint', 'Order the paint', { resurface_at: WED }),
      todo('shelf', 'Put up the shelf', { resurface_at: `${FRI}T00:00:00Z` }),
      // back on a day gone by and never given a day: not that day's any more
      todo('rota', 'Sort the rota', { resurface_at: MON }),
      // given a day of its own since: it is on that day, not back from anywhere
      todo('bins', 'Book the tip', { resurface_at: FRI, due_day: THU }),
      // done since
      todo('keys', 'Cut the keys', { resurface_at: FRI, completed_at: `${TUE}T10:00:00Z` }),
    ];
    const w = yourWeekOf(input({ todos }));
    expect(states(w, WED)).toContainEqual(['paint', 'back', null, false]);
    expect(states(w, FRI)).toEqual([['shelf', 'back', null, false]]);
    expect(states(w, MON).map((x) => x[0])).not.toContain('rota');
    expect(states(w, THU)).toContainEqual(['bins', 'open', null, false]);
    // what has come back is not planned for the day, and does not count as done or to do
    expect(dayOf(w, FRI)).toMatchObject({ planned: null, done: 0, alsoDone: 0 });
  });

  it('counts what is waiting in Later, with the first day one comes back', () => {
    expect(yourWeekOf(input()).later).toEqual({ count: 2, next: '2026-10-13' });
    // one whose day has come is no longer waiting
    expect(yourWeekOf(input({ today: '2026-10-13' })).later).toEqual({
      count: 1,
      next: '2026-10-20',
    });
    expect(yourWeekOf(input({ todos: [] })).later).toEqual({ count: 0, next: null });
  });

  it('gives a todo planned for two days to the later one, and says on the first where it went', () => {
    const w = yourWeekOf(
      input(
        {},
        {
          planned: {
            todos: 2,
            later: 0,
            habit_days: 0,
            days: {
              [MON]: { todos: ['reports', 'present'], habits: [] },
              // the week planned again on Wednesday: the present is now Wednesday's
              [WED]: { todos: ['present'], habits: [] },
            },
          },
        },
      ),
    );
    expect(states(w, MON)).toEqual([
      ['reports', 'done', null, true],
      ['present', 'moved', WED, true],
      ['call', 'done', null, false],
    ]);
    expect(states(w, WED)).toEqual([
      ['present', 'open', null, true],
      ['milk', 'open', null, false],
      // no longer in any day's plan, so it shows on the day it was done
      ['marking', 'done', null, false],
    ]);
  });

  it('shows what is on each day and what got done when no plan was kept', () => {
    const w = yourWeekOf(input({}, { planned: undefined, intention: null, priorities: undefined }));
    expect(w.intention).toBeNull();
    expect(w.priorities).toEqual([]);
    expect(w.days.every((d) => d.planned === null)).toBe(true);
    expect(states(w, MON)).toEqual([
      ['reports', 'done', null, false],
      ['call', 'done', null, false],
    ]);
    expect(dayOf(w, MON).alsoDone).toBe(2);
    expect(states(w, WED)).toEqual([
      ['present', 'open', null, false],
      ['milk', 'open', null, false],
      ['marking', 'done', null, false],
    ]);
  });
});
