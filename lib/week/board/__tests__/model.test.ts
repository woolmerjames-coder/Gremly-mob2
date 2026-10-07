/**
 * The week's board, worked out (lib/week/board/model.ts): what is saved, with
 * Gremly's spread over it and their own moves over both; what finishing it
 * has to write; and their moves. The person is made up (Maya, whose weekly
 * day is Sunday): Sunday 4 October 2026, planning Monday 5 to Sunday 11.
 */
import {
  applyRelief,
  boardDiff,
  boardOf,
  boardStage,
  diffEmpty,
  easeHabitOnBoard,
  gremlyPlaced,
  groupsOf,
  keepLoad,
  moveTodo,
  onlyMoved,
  ownMoves,
  placedBy,
  plannedDays,
  reliefFor,
  toggleHabitDay,
  unfitted,
  withoutMoves,
  workingPicture,
  type BoardInput,
} from '../model';
import type { WeekSpread } from '../../../repo/weekReviewRepo';

const TODAY = '2026-10-04';
const [MON, TUE, WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

const todo = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: `Todo ${id}`,
  created_at: '2026-09-20T09:00:00Z',
  ...o,
});

const TODOS = [
  todo('marking', { name: 'The Year 9 marking', time_estimate_minutes: 60, due_day: TUE }),
  todo('boiler', { name: 'Sort the boiler', time_estimate_minutes: 20, sweep_reschedule_count: 6 }),
  todo('reports', { name: 'Gather the grades', time_estimate_minutes: 30, due_day: '2026-10-01' }),
  todo('present', { name: 'Find a present', resurface_at: '2026-10-15' }),
  todo('dentist', { name: 'Dentist forms', due_day: '2026-10-14' }),
  todo('desk', { name: 'Look at standing desks', time_estimate_minutes: 15 }),
  todo('bulbs', {
    name: 'Plant the bulbs',
    time_estimate_minutes: 45,
    created_at: '2026-08-02T09:00:00Z',
  }),
  todo('done', { name: 'Already done', completed_at: '2026-10-03T10:00:00Z' }),
  todo('gone', { name: 'Archived', archived: true }),
  todo('step', {
    name: 'Draft the first ten',
    time_estimate_minutes: 60,
    due_day: THU,
    views: { milestone: { goal: 'Reports handed in', date: '2026-10-23' } },
  }),
];

const HABITS = [
  { id: 'swim', name: 'Swim', cadence: 'weekly', target_per_period: 2, time_estimate_minutes: 40 },
  { id: 'read', name: 'Read', cadence: 'daily' },
  { id: 'smoke', name: 'No cigarettes', cadence: 'daily', subtype: 'break_habit' },
  { id: 'old', name: 'Old habit', cadence: 'weekly', archived: true },
];

const SPREAD: WeekSpread = {
  version: 'week-spread-test',
  made_at: '2026-10-04T19:00:00.000Z',
  made_on: TODAY,
  model: 'gpt-6-luna',
  first: MON,
  last: SUN,
  basis: 'basis',
  place: [
    { id: 'reports', day: MON },
    { id: 'boiler', day: WED },
    // the spread never moves what has a day of its own
    { id: 'marking', day: FRI },
  ],
  later: [
    { id: 'desk', back_on: '2026-10-13' },
    { id: 'present', back_on: '2026-10-20' },
  ],
  habit_days: [{ id: 'swim', days: [MON, SAT] }],
  notes: [{ day: WED, note: 'A lighter day.' }],
};

function input(over: Partial<BoardInput> = {}, answers: Record<string, unknown> = {}): BoardInput {
  return {
    today: TODAY,
    span: { span_start: MON, span_end: SUN },
    daysOff: [0, 6],
    row: {
      read: null,
      spread: SPREAD,
      answers: {
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: [THU],
        ...answers,
      },
    },
    todos: TODOS,
    habits: HABITS,
    habitPlans: [],
    ...over,
  };
}

const where = (b: ReturnType<typeof boardOf>) => ({
  days: Object.fromEntries(b.days.map((d) => [d.day, d.todos.map((t) => t.id)])),
  later: Object.fromEntries(b.later.map((t) => [t.id, t.backOn])),
});

describe('the board as it stands', () => {
  it('lays Gremly’s spread over what is saved', () => {
    const b = boardOf(input());
    expect(where(b)).toEqual({
      days: {
        [MON]: ['reports'],
        // saved on Tuesday: it stays there, whatever the spread says
        [TUE]: ['marking'],
        [WED]: ['boiler'],
        [THU]: ['step'],
        [FRI]: [],
        [SAT]: [],
        [SUN]: [],
      },
      later: {
        // Gremly's day for the desk; the present keeps the day it already had;
        // the bulbs were in no spread, so they are given the emptiest day
        desk: '2026-10-13',
        bulbs: '2026-10-12',
        present: '2026-10-15',
      },
    });
    // the dentist forms have their own day in another week, and are not on the board
    expect(JSON.stringify(where(b))).not.toContain('dentist');
    expect(JSON.stringify(where(b))).not.toContain('gone');
  });

  it('keeps what is already put off on its day, whatever a spread made before it was put off says', () => {
    // a spread that placed the present on Friday, made before they put it off
    const stale = { ...SPREAD, place: [...SPREAD.place, { id: 'present', day: FRI }] };
    const b = boardOf(input({ row: { ...input().row, spread: stale } }));
    expect(where(b).days[FRI]).toEqual([]);
    expect(where(b).later.present).toBe('2026-10-15');
    // one of the things that matter most this week is Gremly's to bring back onto a day
    const chosen = input({}, { priorities: [{ text: 'The present', item_ids: ['present'] }] });
    const picked = boardOf({ ...chosen, row: { ...chosen.row, spread: stale } });
    expect(where(picked).days[FRI]).toEqual(['present']);
  });

  it('counts what Gremly placed apart from what is on a day by their own hand', () => {
    // the reports and the boiler are his; the marking and the step were theirs already
    expect(placedBy(boardOf(input()))).toEqual({ gremly: 2, own: 2 });
    const moved = boardOf(input({}, { board: { placed: { boiler: SAT, desk: SUN } } }));
    expect(placedBy(moved)).toEqual({ gremly: 1, own: 4 });
  });

  it('says who put each todo where it is', () => {
    const b = boardOf(input());
    const all = [...b.days.flatMap((d) => d.todos), ...b.later];
    const of = (id: string) => all.find((t) => t.id === id)!;
    expect(of('boiler')).toMatchObject({
      title: 'Sort the boiler',
      minutes: 20,
      gremly: true,
      moved: 6,
      created: '2026-09-20',
      saved: { day: null, backOn: null },
    });
    expect(of('marking')).toMatchObject({ gremly: false, saved: { day: TUE, backOn: null } });
    expect(of('present')).toMatchObject({
      gremly: false,
      // no length of its own: thirty minutes
      minutes: 30,
      saved: { day: null, backOn: '2026-10-15' },
    });
    expect(of('desk').gremly).toBe(true);
    expect(of('bulbs').gremly).toBe(false);
    expect(of('step').step).toBe(true);
    // a day that has gone by is not where it is saved any more
    expect(of('reports').saved).toEqual({ day: null, backOn: null });
  });

  it('works out each day’s room from the hours, the busy days and what is on it', () => {
    const b = boardOf(input());
    const day = (d: string) => b.days.find((x) => x.day === d)!;
    expect(day(MON)).toMatchObject({
      kind: 'normal_day',
      busy: false,
      minutes: 120,
      habitMinutes: 40,
      todoMinutes: 30,
      left: 50,
      note: null,
    });
    expect(day(MON).habits).toEqual([{ id: 'swim', title: 'Swim', minutes: 40 }]);
    expect(day(WED).note).toBe('A lighter day.');
    // Thursday is busy: an hour, and the step set up for it takes it all
    expect(day(THU)).toMatchObject({ kind: 'busy_day', busy: true, minutes: 60, left: 0 });
    expect(day(SAT)).toMatchObject({ kind: 'weekend_day', minutes: 240, habitMinutes: 40 });
    expect(b.totals).toEqual({
      room: 120 * 4 + 60 + 240 * 2,
      habits: 80,
      placed: 60 + 30 + 20 + 60,
      later: 15 + 45 + 30,
      all: 170 + 90,
      todosPlaced: 4,
      habitSessions: 2,
    });
    expect(b.first).toBe(MON);
    expect(b.last).toBe(SUN);
    expect(b.returns[0]).toBe('2026-10-12');
  });

  it('shows a day that is over its room', () => {
    const b = boardOf(input({}, { board: { placed: { bulbs: THU, desk: THU } } }));
    expect(b.days.find((d) => d.day === THU)).toMatchObject({ todoMinutes: 120, left: -60 });
  });

  it('puts each habit on the days saved for it, else Gremly’s, and theirs over both', () => {
    const fromSpread = boardOf(input());
    // as usual: neither paused nor on a lighter version
    const usual = {
      ease: null,
      note: '',
      smallest: '',
      savedEase: null,
      savedEased: false,
      pausedDays: [],
      easeTo: null,
    };
    expect(fromSpread.habits).toEqual([
      { id: 'swim', title: 'Swim', minutes: 40, days: [MON, SAT], target: 2, saved: [], ...usual },
      // nothing chosen for it: on no day, aiming for every day
      { id: 'read', title: 'Read', minutes: 30, days: [], target: 7, saved: [], ...usual },
    ]);
    const plans = [
      { habit_id: 'swim', planned_date: WED },
      { habit_id: 'swim', planned_date: '2026-10-14' },
    ];
    const saved = boardOf(input({ habitPlans: plans }));
    expect(saved.habits[0]).toMatchObject({ days: [WED], saved: [WED] });
    const mine = boardOf(
      input({ habitPlans: plans }, { board: { habit_days: { swim: [FRI, TUE, '2026-10-20'] } } }),
    );
    expect(mine.habits[0]).toMatchObject({ days: [TUE, FRI], saved: [WED] });
    // taken off every day by them: Gremly's days do not come back
    const off = boardOf(input({}, { board: { habit_days: { swim: [] } } }));
    expect(off.habits[0].days).toEqual([]);
  });

  it('lets their own moves stand over the spread and over what is saved', () => {
    const b = boardOf(
      input(
        {},
        {
          board: {
            placed: { marking: FRI, present: SAT, boiler: '2026-10-20' },
            later: { reports: '2026-10-19' },
          },
        },
      ),
    );
    const w = where(b);
    expect(w.days[FRI]).toEqual(['marking']);
    expect(w.days[TUE]).toEqual([]);
    expect(w.days[SAT]).toEqual(['present']);
    expect(w.later.reports).toBe('2026-10-19');
    // a day that is not being planned is no move: the spread's Wednesday stands
    expect(w.days[WED]).toEqual(['boiler']);
    const all = [...b.days.flatMap((d) => d.todos), ...b.later];
    expect(all.find((t) => t.id === 'marking')!.gremly).toBe(false);
  });

  it('gives every todo on no day a day to come back on when there is no spread', () => {
    const b = boardOf(input({ row: { read: null, spread: null, answers: {} } }));
    expect(where(b).days[TUE]).toEqual(['marking']);
    // the oldest first, a day each
    expect(where(b).later).toEqual({
      bulbs: '2026-10-12',
      boiler: '2026-10-13',
      desk: '2026-10-14',
      present: '2026-10-15',
      reports: '2026-10-16',
    });
    // the read's guess, then the fallback, stand in for hours they have not set
    expect(b.hours).toEqual({ normal_day: 2, busy_day: 1, weekend_day: 4 });
  });

  it('plans only from today in a review picked up part way through the week', () => {
    const b = boardOf(input({ today: WED }));
    expect(b.days.map((d) => d.day)).toEqual([WED, THU, FRI, SAT, SUN]);
    // Monday has gone by: Gremly's Monday is no place for the reports now
    expect(where(b).later).toHaveProperty('reports');
    // Tuesday has gone by too, so the marking is Gremly's to place, and he had it on Friday
    expect(where(b).days[FRI]).toEqual(['marking']);
    expect(b.habits[0].days).toEqual([SAT]);
  });

  it('groups a todo by the part of their life it is linked to most strongly', () => {
    const groups = groupsOf(
      [
        { id: 'w1', name: 'School' },
        { id: 'w2', display_name: 'Home', name: 'home' },
      ],
      [
        { drop_id: 'boiler', world_id: 'w1', relevance_score: 0.2 },
        { drop_id: 'boiler', world_id: 'w2', relevance_score: 0.9 },
        { drop_id: 'marking', world_id: 'w1', relevance_score: 0.5 },
        { drop_id: 'desk', world_id: 'nowhere', relevance_score: 1 },
      ],
    );
    expect([...groups]).toEqual([
      ['boiler', 'Home'],
      ['marking', 'School'],
    ]);
    const b = boardOf(input({ groups }));
    const all = [...b.days.flatMap((d) => d.todos), ...b.later];
    expect(all.find((t) => t.id === 'boiler')!.group).toBe('Home');
    expect(all.find((t) => t.id === 'desk')!.group).toBeNull();
  });
});

describe('what Gremly is told of the board', () => {
  it('is every todo on a day, every todo put off with its day, and each habit’s days', () => {
    expect(workingPicture(boardOf(input()))).toEqual({
      placed: [
        { id: 'reports', day: MON },
        { id: 'marking', day: TUE },
        { id: 'boiler', day: WED },
        { id: 'step', day: THU },
      ],
      later: [
        { id: 'bulbs', back_on: '2026-10-12' },
        { id: 'desk', back_on: '2026-10-13' },
        { id: 'present', back_on: '2026-10-15' },
      ],
      habit_days: [
        { id: 'swim', days: [MON, SAT] },
        { id: 'read', days: [] },
      ],
    });
  });

  it('sends their own moves with a new spread, which never moves them', () => {
    expect(
      ownMoves({
        placed: { marking: FRI },
        later: { reports: '2026-10-19' },
        habit_days: { swim: [TUE] },
        habit_ease: { read: { mode: 'lighter', note: 'Two pages' } },
        opened: true,
      }),
    ).toEqual({
      placed: [{ id: 'marking', day: FRI }],
      later: [{ id: 'reports', back_on: '2026-10-19' }],
      habit_days: [{ id: 'swim', days: [TUE] }],
      // what they chose for a habit over these days, without its words
      habit_ease: [{ id: 'read', mode: 'lighter' }],
    });
    expect(ownMoves(null)).toEqual({ placed: [], later: [], habit_days: [], habit_ease: [] });
  });
});

describe('what finishing the board writes', () => {
  it('is only where the board differs from what is saved', () => {
    const d = boardDiff(boardOf(input()));
    expect(d).toEqual({
      // the marking and the step are already saved on their days
      place: [
        { id: 'reports', day: MON },
        { id: 'boiler', day: WED },
      ],
      // the present is already coming back on its day
      later: [
        { id: 'bulbs', backOn: '2026-10-12' },
        { id: 'desk', backOn: '2026-10-13' },
      ],
      habits: [{ id: 'swim', add: [MON, SAT], remove: [] }],
      eases: [],
    });
    expect(diffEmpty(d)).toBe(false);
  });

  it('takes a habit off a day it was saved on, and moves a todo off its saved day', () => {
    const plans = [{ habit_id: 'swim', planned_date: WED }];
    const d = boardDiff(
      boardOf(
        input(
          { habitPlans: plans },
          {
            board: {
              placed: { marking: FRI },
              later: { step: '2026-10-19' },
              habit_days: { swim: [SAT] },
            },
          },
        ),
      ),
    );
    expect(d.place).toContainEqual({ id: 'marking', day: FRI });
    expect(d.later).toContainEqual({ id: 'step', backOn: '2026-10-19' });
    expect(d.habits).toEqual([{ id: 'swim', add: [SAT], remove: [WED] }]);
  });

  it('is nothing when the board is as saved', () => {
    const saved = [
      todo('marking', { due_day: TUE }),
      todo('present', { resurface_at: '2026-10-15' }),
    ];
    const d = boardDiff(
      boardOf(input({ todos: saved, habits: [], row: { read: null, spread: null, answers: {} } })),
    );
    expect(diffEmpty(d)).toBe(true);
  });
});

describe('their own moves', () => {
  const board = () => boardOf(input());

  it('move a todo to a day, and it is theirs from then on', () => {
    const moves = moveTodo(board(), {}, 'boiler', FRI);
    expect(moves.placed).toEqual({ boiler: FRI });
    const after = boardOf(input({}, { board: moves }));
    const t = after.days.find((d) => d.day === FRI)!.todos[0];
    expect(t).toMatchObject({ id: 'boiler', gremly: false });
    // a day that is not on the board is no move
    expect(moveTodo(board(), moves, 'boiler', '2026-10-20').placed).toEqual({});
  });

  it('put a todo off: it comes back on the day with the fewest returns', () => {
    const moves = moveTodo(board(), { placed: { marking: FRI } }, 'marking', 'later');
    expect(moves.placed).toEqual({});
    // the 12th, 13th and 15th each have one already
    expect(moves.later).toEqual({ marking: '2026-10-14' });
  });

  it('put a todo that was already put off back on the day it had', () => {
    const b = boardOf(input({}, { board: { placed: { present: SAT } } }));
    const moves = moveTodo(b, { placed: { present: SAT } }, 'present', 'later');
    expect(moves.later).toEqual({ present: '2026-10-15' });
  });

  it('bring a todo from Later onto a day', () => {
    const moves = moveTodo(board(), { later: { desk: '2026-10-19' } }, 'desk', MON);
    expect(moves).toMatchObject({ placed: { desk: MON }, later: {} });
  });

  it('put a habit on a day or take it off, as their own choice of days', () => {
    const on = toggleHabitDay(board(), {}, 'swim', WED);
    expect(on.habit_days).toEqual({ swim: [MON, WED, SAT] });
    const off = toggleHabitDay(boardOf(input({}, { board: on })), on, 'swim', MON);
    expect(off.habit_days).toEqual({ swim: [WED, SAT] });
    // a habit or a day that is not on the board changes nothing
    expect(toggleHabitDay(board(), on, 'smoke', WED)).toBe(on);
    expect(toggleHabitDay(board(), on, 'swim', '2026-10-20')).toBe(on);
  });

  it('give way to a change saved since: what is saved is then their latest word', () => {
    const moves = {
      placed: { marking: FRI, boiler: MON },
      later: { desk: '2026-10-19' },
      habit_days: { swim: [TUE], read: [MON] },
      habit_ease: { swim: { mode: 'pause' as const }, read: { mode: 'lighter' as const } },
      opened: true,
    };
    expect(withoutMoves(moves, { todos: ['marking', 'desk'], habits: ['swim'] })).toEqual({
      placed: { boiler: MON },
      later: {},
      habit_days: { read: [MON] },
      habit_ease: { read: { mode: 'lighter' } },
      opened: true,
    });
    // a lighter version saved for a habit: what they chose for it gives way, its days stay
    expect(withoutMoves(moves, { eases: ['read'] })).toMatchObject({
      habit_days: { swim: [TUE], read: [MON] },
      habit_ease: { swim: { mode: 'pause' } },
    });
  });
});

describe('a habit paused or made lighter for the days being planned', () => {
  const ease = (
    id: string,
    mode: string,
    first: string,
    last: string,
    note: string | null = null,
  ) => ({
    id: `${id}-${first}`,
    habit_id: id,
    mode,
    period_start: first,
    period_end: last,
    floor_note: note,
  });
  const swimOf = (b: ReturnType<typeof boardOf>) => b.habits.find((h) => h.id === 'swim')!;
  const withEase = (habit_ease: Record<string, unknown>, over: Partial<BoardInput> = {}) =>
    boardOf(input(over, { board: { habit_ease } }));

  it('is as usual until they say, with the habit’s smallest version ready to start from', () => {
    const habits = [{ ...HABITS[0], floor_note: '  Ten   lengths ' }, HABITS[1]];
    const swim = swimOf(boardOf(input({ habits })));
    expect(swim).toMatchObject({
      ease: null,
      note: '',
      smallest: 'Ten lengths',
      pausedDays: [],
      easeTo: null,
    });
  });

  it('paused, it is on none of the days, takes none of their room, and stays in the list', () => {
    const usual = boardOf(input());
    const b = withEase({ swim: { mode: 'pause' } });
    const swim = swimOf(b);
    expect(swim).toMatchObject({ ease: 'pause', days: [], target: 0 });
    expect(swim.easeTo).toEqual({ mode: 'pause', first: MON, last: SUN, note: '' });
    expect(b.days.find((d) => d.day === MON)!.habits.map((h) => h.id)).not.toContain('swim');
    expect(b.totals.habits).toBe(usual.totals.habits - 80);
    // Gremly is told it is on no day
    expect(workingPicture(b).habit_days).toContainEqual({ id: 'swim', days: [] });
  });

  it('writes the pause, and takes it off the days saved for it', () => {
    const plans = [{ habit_id: 'swim', planned_date: WED }];
    const d = boardDiff(withEase({ swim: { mode: 'pause' } }, { habitPlans: plans }));
    expect(d.eases).toEqual([{ id: 'swim', mode: 'pause', first: MON, last: SUN, note: '' }]);
    expect(d.habits).toEqual([{ id: 'swim', add: [], remove: [WED] }]);
    expect(diffEmpty({ place: [], later: [], habits: [], eases: d.eases })).toBe(false);
  });

  it('on a lighter version, its days and its count stay, and the words are theirs', () => {
    const b = withEase({ swim: { mode: 'lighter', note: ' Ten  lengths ' } });
    const swim = swimOf(b);
    expect(swim).toMatchObject({
      ease: 'lighter',
      note: 'Ten lengths',
      days: [MON, SAT],
      target: 2,
    });
    expect(boardDiff(b).eases).toEqual([
      { id: 'swim', mode: 'lighter', first: MON, last: SUN, note: 'Ten lengths' },
    ]);
  });

  it('plans from today in a review picked up part way through the week', () => {
    const b = boardOf(
      input({ today: WED }, { board: { habit_ease: { swim: { mode: 'pause' } } } }),
    );
    expect(swimOf(b).easeTo).toMatchObject({ first: WED, last: SUN });
  });

  it('shows what is saved, and writes nothing when the board agrees with it', () => {
    const saved = [ease('swim', 'pause', MON, SUN)];
    const b = boardOf(input({ eases: saved }));
    expect(swimOf(b)).toMatchObject({ ease: 'pause', days: [], easeTo: null });
    expect(boardDiff(b).eases).toEqual([]);
    // saying it again is no change
    expect(swimOf(withEase({ swim: { mode: 'pause' } }, { eases: saved })).easeTo).toBeNull();
    // and back to usual ends it
    const ended = withEase({ swim: { mode: 'usual' } }, { eases: saved });
    expect(swimOf(ended)).toMatchObject({ ease: null, days: [MON, SAT], target: 2 });
    expect(boardDiff(ended).eases).toEqual([
      { id: 'swim', mode: 'usual', first: MON, last: SUN, note: '' },
    ]);
    // usual with nothing saved is nothing to write
    expect(boardDiff(withEase({ swim: { mode: 'usual' } })).eases).toEqual([]);
  });

  it('closes only the days of a pause that holds part of the week', () => {
    const b = boardOf(input({ eases: [ease('swim', 'pause', MON, TUE)] }));
    const swim = swimOf(b);
    // Gremly had it on Monday: a day it is paused on is no day of its
    expect(swim).toMatchObject({ ease: null, pausedDays: [MON, TUE], days: [SAT], target: 2 });
    // a daily habit aims for the days left open
    const read = boardOf(input({ eases: [ease('read', 'pause', MON, WED)] })).habits.find(
      (h) => h.id === 'read',
    )!;
    expect(read.target).toBe(4);
  });

  it('is chosen and taken back with their own moves', () => {
    const b = boardOf(input());
    const paused = easeHabitOnBoard(b, { opened: true }, 'swim', 'pause');
    expect(paused).toEqual({ opened: true, habit_ease: { swim: { mode: 'pause' } } });
    const lighter = easeHabitOnBoard(b, paused, 'swim', 'lighter', ' A short   swim ');
    expect(lighter.habit_ease).toEqual({ swim: { mode: 'lighter', note: 'A short swim' } });
    // neither, with nothing saved for these days: there is no move left to make
    expect(easeHabitOnBoard(b, lighter, 'swim', null).habit_ease).toEqual({});
    expect(easeHabitOnBoard(b, {}, 'swim', null).habit_ease).toEqual({});
    // a habit that is not on the board changes nothing
    expect(easeHabitOnBoard(b, paused, 'smoke', 'pause')).toBe(paused);
  });

  it('shows what was last tapped, whatever is saved: every tap of a lit chip turns it off', () => {
    // each tap as the sheet makes it: a lit chip asks for neither, an unlit one for itself
    const tap = (b: ReturnType<typeof boardOf>, moves: any, chip: 'pause' | 'lighter') => {
      const h = swimOf(b);
      const want = h.ease === chip ? null : chip;
      return easeHabitOnBoard(b, moves, 'swim', want, chip === 'lighter' ? h.smallest : '');
    };
    const run = (saved: any[], chips: ('pause' | 'lighter')[]) => {
      let moves: any = {};
      const shown: (string | null)[] = [];
      for (const chip of chips) {
        moves = tap(boardOf(input({ eases: saved }, { board: moves })), moves, chip);
        shown.push(swimOf(boardOf(input({ eases: saved }, { board: moves }))).ease);
      }
      return { shown, moves, board: boardOf(input({ eases: saved }, { board: moves })) };
    };
    // a pause saved for the week: off, on, off, on
    const paused = [ease('swim', 'pause', MON, SUN)];
    expect(run(paused, ['pause', 'pause', 'pause', 'pause']).shown).toEqual([
      null,
      'pause',
      null,
      'pause',
    ]);
    // back on what is saved, nothing is left to write
    expect(boardDiff(run(paused, ['pause', 'pause']).board).eases).toEqual([]);
    // a lighter version saved in their words: off ends it, and on again is theirs, not the habit's own
    const lighter = [ease('swim', 'floor', MON, SUN, 'Five lengths')];
    const off = run(lighter, ['lighter']);
    expect(off.shown).toEqual([null]);
    expect(boardDiff(off.board).eases).toEqual([
      { id: 'swim', mode: 'usual', first: MON, last: SUN, note: '' },
    ]);
    const again = run(lighter, ['lighter', 'lighter']);
    expect(swimOf(again.board)).toMatchObject({ ease: 'lighter', note: 'Five lengths' });
    expect(boardDiff(again.board).eases).toEqual([]);
    // from a saved lighter version to a pause and back: the saved words stand
    const round = run(lighter, ['pause', 'lighter']);
    expect(round.shown).toEqual(['pause', 'lighter']);
    expect(swimOf(round.board).note).toBe('Five lengths');
    // a pause that holds part of the week: pausing the week and taking it back ends that too
    const part = [ease('swim', 'pause', MON, TUE)];
    const cleared = run(part, ['pause', 'pause']);
    expect(cleared.shown).toEqual(['pause', null]);
    expect(swimOf(cleared.board).pausedDays).toEqual([]);
  });

  it('writes nothing for a week already paused when it is said again part way through', () => {
    const saved = [ease('swim', 'pause', MON, SUN)];
    const b = boardOf(
      input({ today: WED, eases: saved }, { board: { habit_ease: { swim: { mode: 'pause' } } } }),
    );
    expect(swimOf(b)).toMatchObject({ ease: 'pause', easeTo: null });
    expect(boardDiff(b).eases).toEqual([]);
  });

  it('counts as their move on a week changed by hand, the days it loses with it', () => {
    const plans = [{ habit_id: 'swim', planned_date: WED }];
    const moves = { habit_ease: { swim: { mode: 'pause' as const } } };
    const b = boardOf(
      input({
        assign: false,
        habitPlans: plans,
        row: { ...input({}, { board: moves }).row, spread: null },
      }),
    );
    expect(onlyMoved(boardDiff(b), moves)).toEqual({
      place: [],
      later: [],
      habits: [{ id: 'swim', add: [], remove: [WED] }],
      eases: [{ id: 'swim', mode: 'pause', first: MON, last: SUN, note: '' }],
    });
  });
});

describe('the board once the week is planned, changed by hand', () => {
  // no spread, and nothing is given a day it was not given by them
  const changing = (answers: Record<string, unknown> = {}) =>
    boardOf(input({ assign: false, row: { ...input({}, answers).row, spread: null } }));

  it('shows what is saved, and leaves a todo with no day as it is', () => {
    const b = changing();
    expect(where(b)).toEqual({
      days: {
        [MON]: [],
        [TUE]: ['marking'],
        [WED]: [],
        [THU]: ['step'],
        [FRI]: [],
        [SAT]: [],
        [SUN]: [],
      },
      later: { present: '2026-10-15' },
    });
    // on no day and never put off: loose, with no day to come back made up for them
    expect(b.loose.map((t) => t.id)).toEqual(['reports', 'desk', 'bulbs', 'boiler']);
    expect(b.loose.every((t) => t.backOn === null && !t.gremly)).toBe(true);
    // in the review nothing is ever left loose
    expect(boardOf(input()).loose).toEqual([]);
  });

  it('writes only what they moved themselves', () => {
    const b = changing();
    expect(diffEmpty(boardDiff(b))).toBe(true);
    let moves = moveTodo(b, {}, 'boiler', WED);
    moves = moveTodo(changing({ board: moves }), moves, 'desk', 'later');
    moves = toggleHabitDay(changing({ board: moves }), moves, 'swim', SAT);
    const moved = changing({ board: moves });
    // a loose todo put off is given a day to come back, like any other
    expect(moves.later?.desk).toBe('2026-10-12');
    const diff = boardDiff(moved);
    expect(onlyMoved(diff, moves)).toEqual({
      place: [{ id: 'boiler', day: WED }],
      later: [{ id: 'desk', backOn: '2026-10-12' }],
      habits: [{ id: 'swim', add: [SAT], remove: [] }],
      eases: [],
    });
    // a difference that is not a move of theirs is left out
    expect(
      onlyMoved(
        {
          place: [...diff.place, { id: 'bulbs', day: FRI }],
          later: [...diff.later, { id: 'reports', backOn: '2026-10-13' }],
          habits: [...diff.habits, { id: 'read', add: [MON], remove: [] }],
          eases: [],
        },
        moves,
      ),
    ).toEqual(onlyMoved(diff, moves));
    expect(onlyMoved(diff, null)).toEqual({ place: [], later: [], habits: [], eases: [] });
  });
});

describe('the plan kept when the board is saved', () => {
  it('is each day’s todos and habits as the board has them', () => {
    const b = boardOf(input());
    const days = plannedDays(b, null, new Set(TODOS.map((t) => t.id)));
    expect(Object.keys(days)).toEqual([MON, TUE, WED, THU, FRI, SAT, SUN]);
    expect(days[MON]).toEqual({ todos: ['reports'], habits: ['swim'] });
    expect(days[WED]).toEqual({ todos: ['boiler'], habits: [] });
    expect(days[SAT]).toEqual({ todos: [], habits: ['swim'] });
  });

  it('keeps a day gone by as it was planned, and what was planned for a day and is done', () => {
    // Wednesday: Monday and Tuesday have gone by, and the marking was done on its day
    const b = boardOf(input({ today: WED }));
    const before = {
      [MON]: { todos: ['reports'], habits: ['swim'] },
      [TUE]: { todos: ['marking'], habits: [] },
      [WED]: { todos: ['boiler', 'finished', 'desk'], habits: [] },
    };
    // finished is done; desk is still open, and is no longer on Wednesday
    const open = new Set(TODOS.map((t) => t.id));
    const days = plannedDays(b, before, open);
    expect(days[MON]).toEqual(before[MON]);
    expect(days[TUE]).toEqual(before[TUE]);
    expect(days[WED].todos).toEqual(['finished', 'boiler']);
    expect(days[THU].todos).toEqual(['step']);
  });
});

describe('the days they gave their todos themselves', () => {
  // the marking is on Tuesday and the step on Thursday, both by their own hand
  const kept = (answers: Record<string, unknown> = {}, over: Partial<BoardInput> = {}) =>
    boardOf(input(over, answers));
  const at = (b: ReturnType<typeof boardOf>, id: string) =>
    [...b.days.flatMap((d) => d.todos), ...b.later].find((t) => t.id === id)!;

  it('are kept where they are, marked as theirs, and counted against the day', () => {
    const b = kept();
    expect(b.theirs.map((t) => [t.id, t.day, t.freed])).toEqual([
      ['marking', TUE, false],
      ['step', THU, false],
    ]);
    expect(at(b, 'marking')).toMatchObject({ day: TUE, theirs: true, gremly: false });
    // what Gremly placed is not theirs
    expect(at(b, 'reports')).toMatchObject({ theirs: false, gremly: true });
    const tue = b.days.find((d) => d.day === TUE)!;
    expect(tue).toMatchObject({ theirMinutes: 60, ownMinutes: 60, over: 0 });
  });

  it('go where the spread puts them once they say rearrange, and stay put until it says', () => {
    // the spread on the week was made before they said so: it says nothing of the marking
    const waiting = boardOf(input({ row: { ...input({}, { keep: 'none' }).row, spread: null } }));
    expect(at(waiting, 'marking')).toMatchObject({ day: TUE, theirs: false, gremly: false });
    expect(waiting.theirs.every((t) => t.freed)).toBe(true);
    // it is where it is saved, so there is nothing to write for it
    expect(boardDiff(waiting).place.map((x) => x.id)).not.toContain('marking');
    // the spread moves the marking to Friday, and puts the step off
    const spread = {
      ...SPREAD,
      later: [...SPREAD.later, { id: 'step', back_on: '2026-10-14' }],
    };
    const b = boardOf(input({ row: { ...input({}, { keep: 'none' }).row, spread } }));
    expect(at(b, 'marking')).toMatchObject({ day: FRI, gremly: true, theirs: false });
    expect(at(b, 'step')).toMatchObject({ day: null, backOn: '2026-10-14', gremly: true });
    const diff = boardDiff(b);
    expect(diff.place).toEqual(expect.arrayContaining([{ id: 'marking', day: FRI }]));
    expect(diff.later).toEqual(expect.arrayContaining([{ id: 'step', backOn: '2026-10-14' }]));
  });

  it('are freed one at a time when they keep some', () => {
    const b = kept({ keep: 'some', freed: ['marking'] });
    expect(at(b, 'marking')).toMatchObject({ day: FRI, gremly: true, theirs: false });
    expect(at(b, 'step')).toMatchObject({ day: THU, theirs: true });
    expect(b.theirs.map((t) => [t.id, t.freed])).toEqual([
      ['marking', true],
      ['step', false],
    ]);
  });

  it('never include a todo with a time of day in what is freed', () => {
    const todos = TODOS.map((t) => (t.id === 'marking' ? { ...t, due_time: '15:30' } : t));
    const b = kept({ keep: 'none' }, { todos });
    expect(at(b, 'marking')).toMatchObject({ day: TUE, theirs: true, timed: true });
  });

  it('leave out where Gremly’s last spread of this week put a todo: that day is his to plan again', () => {
    const b = kept({ planned: { todos: 2, later: 0, habit_days: 0, gremly: { marking: TUE } } });
    expect(b.theirs.map((t) => t.id)).toEqual(['step']);
    // the spread in hand places it again
    expect(at(b, 'marking')).toMatchObject({ day: FRI, gremly: true });
  });

  it('stand under their own moves on the board, which are theirs anyway', () => {
    const b = kept({ board: { placed: { marking: SAT } } });
    expect(b.theirs.map((t) => t.id)).toEqual(['step']);
    // a day they gave it on the board is theirs like one they gave it before
    expect(at(b, 'marking')).toMatchObject({ day: SAT, theirs: true, byHand: true, gremly: false });
    expect(b.days.find((d) => d.day === SAT)).toMatchObject({ theirMinutes: 60, ownMinutes: 60 });
    // one kept on the day it is saved on was not put there on the board
    expect(at(b, 'step')).toMatchObject({ theirs: true, byHand: false });
  });

  it('record where Gremly put each todo, for the next time this week is planned', () => {
    expect(gremlyPlaced(kept())).toEqual({ reports: MON, boiler: WED });
  });
});

describe('where the board’s step stands', () => {
  const many = (n: number, o: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) =>
      todo(`own${i}`, { name: `Own ${i}`, time_estimate_minutes: 50, due_day: WED, ...o }),
    );
  const withOwn = (n: number, answers: Record<string, unknown> = {}) =>
    boardOf(input({ todos: [...TODOS, ...many(n)] }, answers));

  it('asks about their own days once, from six of them, and keeps them without asking below that', () => {
    // the marking and the step, and four more
    const b = withOwn(4);
    expect(b.theirs).toHaveLength(6);
    expect(boardStage(b, {})).toEqual({ stage: 'keep' });
    expect(boardStage(withOwn(1), {}).stage).not.toBe('keep');
    // answered: not asked again, unless they open the question to change it
    expect(boardStage(b, { keep: 'all' }).stage).not.toBe('keep');
    expect(boardStage(b, { keep: 'all' }, { asking: true })).toEqual({ stage: 'keep' });
    expect(boardStage(b, { keep: 'some' }, { picking: true })).toEqual({ stage: 'pick' });
  });

  it('does not ask when they said Just plan it, which keeps their days without a word from them', () => {
    const b = withOwn(4);
    expect(boardStage(b, { guessed: true }).stage).not.toBe('keep');
    // an over-full day of theirs is still looked at
    expect(boardStage(b, { guessed: true })).toEqual({ stage: 'overfull', day: WED });
  });

  it('calls a day over-full only when it holds kept todos of theirs: habits alone leave nothing to move', () => {
    // half an hour a day: Monday's swim is forty minutes, and nothing on it is theirs
    const tight = { hours: { normal_day: 0.5, busy_day: 0.5, weekend_day: 0.5 } };
    const b = boardOf(input({}, tight));
    const mon = b.days.find((d) => d.day === MON)!;
    expect(mon).toMatchObject({ habitMinutes: 40, theirMinutes: 0, over: 0 });
    expect(mon.left).toBeLessThan(0);
    expect(keepLoad(b).find((d) => d.day === MON)).toMatchObject({ load: 40, count: 0, over: 0 });
    // Tuesday holds their marking: an hour on a half hour day
    expect(b.days.find((d) => d.day === TUE)).toMatchObject({ theirMinutes: 60, over: 30 });
    expect(boardStage(b, {})).toEqual({ stage: 'overfull', day: TUE });
  });

  it('takes each day their kept todos overfill in turn, then is the board', () => {
    // Wednesday has two hours: 200 minutes of theirs on it
    const b = withOwn(4, { keep: 'all' });
    const wed = b.days.find((d) => d.day === WED)!;
    expect(wed).toMatchObject({ theirMinutes: 200, over: 80 });
    expect(boardStage(b, { keep: 'all' })).toEqual({ stage: 'overfull', day: WED });
    for (const how of ['moved', 'changed', 'left'] as const) {
      expect(boardStage(b, { keep: 'all', relieved: { [WED]: how } })).toEqual({ stage: 'board' });
    }
    // with fewer than six nothing is asked, and an over-full day is still looked at
    const few = boardOf(input({ todos: [...TODOS, ...many(3, { time_estimate_minutes: 60 })] }));
    expect(boardStage(few, {})).toEqual({ stage: 'overfull', day: WED });
    // handed to Gremly, nothing of theirs overfills a day
    expect(boardStage(withOwn(4, { keep: 'none' }), { keep: 'none' })).toEqual({ stage: 'board' });
  });

  it('shows each day’s load from their own todos and habits against its hours', () => {
    const b = withOwn(4);
    const load = keepLoad(b);
    expect(load.find((d) => d.day === WED)).toEqual({
      day: WED,
      minutes: 120,
      load: 200,
      count: 4,
      over: 80,
    });
    // Monday has the swim and nothing of theirs
    expect(load.find((d) => d.day === MON)).toMatchObject({ load: 40, count: 0, over: 0 });
    // freeing two brings Wednesday inside its room
    expect(keepLoad(b, ['own0', 'own1']).find((d) => d.day === WED)).toMatchObject({
      load: 100,
      count: 2,
      over: 0,
    });
  });
});

describe('a todo that matters most and is on no day', () => {
  // The room each day has, with the swim on Monday and Saturday: Mon 80, Tue
  // 60 beside their marking, Wed 120, Thu none (a busy day, with their step),
  // Fri 120, Sat 200, Sun 240. Gremly's own (the grades on Monday, the boiler
  // on Wednesday) give way to what matters most.
  const talk = (minutes: number, o: Record<string, unknown> = {}) =>
    todo('talk', { name: 'Write the talk', time_estimate_minutes: minutes, ...o });
  const matters = { priorities: [{ text: 'The talk', item_ids: ['talk'] }] };
  const off = (extra: WeekSpread['place'] = []): WeekSpread => ({
    ...SPREAD,
    place: [...SPREAD.place, ...extra],
    later: [...SPREAD.later, { id: 'talk', back_on: '2026-10-13' }],
  });
  const hours = { hours: { normal_day: 2, busy_day: 1, weekend_day: 4 }, busy_days: [THU] };
  const made = (
    minutes: number,
    o: Record<string, unknown> = {},
    extra: WeekSpread['place'] = [],
  ) => {
    const i = input({ todos: [...TODOS, talk(minutes, o)] }, { ...hours, ...matters });
    return boardOf({ ...i, row: { ...i.row, spread: off(extra) } });
  };

  it('is found when the spread put it off, with the day that has room for it', () => {
    const b = made(180);
    expect(where(b).later.talk).toBe('2026-10-13');
    const [u] = unfitted(b, matters);
    // three hours: Saturday has room for it as the board stands
    expect(u).toMatchObject({ todo: { id: 'talk', minutes: 180 }, fits: true, day: SAT });
    // and it could be split in two, on the first two days with ninety minutes
    expect(u.parts).toEqual([
      { minutes: 90, day: WED },
      { minutes: 90, day: FRI },
    ]);
  });

  it('fits no day when it is longer than any day has room for, and is offered only a split', () => {
    const [u] = unfitted(made(300), matters);
    expect(u).toMatchObject({ fits: false, day: null });
    expect(u.parts).toEqual([
      { minutes: 150, day: SAT },
      { minutes: 150, day: SUN },
    ]);
    // nine hours: no four days have room for the parts
    expect(unfitted(made(540), matters)[0]).toMatchObject({ fits: false, day: null, parts: null });
  });

  it('is offered the day with the most room once what Gremly placed there gives way', () => {
    // 230 minutes: Sunday would hold it, but for the desk Gremly put there
    const b = made(230, {}, [{ id: 'desk', day: SUN }]);
    expect(b.days.find((d) => d.day === SUN)).toMatchObject({ left: 225 });
    expect(unfitted(b, matters)[0]).toMatchObject({ fits: false, day: SUN });
  });

  it('is offered only days up to its hard date when that is in the week', () => {
    const [u] = unfitted(made(100, { target_date: WED }), matters);
    // Wednesday has a hundred minutes left beside the boiler
    expect(u).toMatchObject({ fits: true, day: WED });
    expect(u.parts).toEqual([
      { minutes: 50, day: MON },
      { minutes: 50, day: TUE },
    ]);
    // due on Tuesday: neither day up to it holds it whole, even without Gremly's own
    expect(unfitted(made(100, { target_date: TUE }), matters)[0]).toMatchObject({
      fits: false,
      day: null,
    });
  });

  it('splits into equal parts of half an hour or more, the last taking what is left', () => {
    const parts = (minutes: number) =>
      unfitted(made(minutes), matters)[0].parts?.map((x) => x.minutes) ?? null;
    expect(parts(65)).toEqual([35, 30]);
    // under an hour there are no two parts of half an hour
    expect(parts(50)).toBeNull();
    // 250 minutes: two parts of 125 fit Saturday and Sunday
    expect(parts(250)).toEqual([125, 125]);
    // 400 minutes: two of 200 fit Saturday and Sunday
    expect(parts(400)).toEqual([200, 200]);
    // 450 minutes: no two days hold 225 and no three hold 150, so it is four parts
    expect(parts(450)).toEqual([115, 115, 115, 105]);
  });

  it('is not one they put off themselves, one that is on a day, or one that does not matter most', () => {
    const b = made(180);
    expect(unfitted(b, {})).toEqual([]);
    expect(unfitted(b, { priorities: [{ text: 'Other', item_ids: ['desk'] }] })).toHaveLength(1);
    const i = input({ todos: [...TODOS, talk(180)] }, { ...hours, ...matters });
    const byHand = boardOf({
      ...i,
      row: {
        ...i.row,
        spread: off(),
        answers: { ...i.row.answers, board: { later: { talk: '2026-10-14' } } },
      },
    });
    expect(where(byHand).later.talk).toBe('2026-10-14');
    expect(unfitted(byHand, matters)).toEqual([]);
    const placed = boardOf({
      ...i,
      row: {
        ...i.row,
        spread: off(),
        answers: { ...i.row.answers, board: { placed: { talk: SAT } } },
      },
    });
    expect(unfitted(placed, matters)).toEqual([]);
  });

  it('is the board’s next card once the spread is in, until it is dealt with', () => {
    const b = made(180);
    // nothing is known of what the spread left off until it is on the board
    expect(boardStage(b, matters)).toEqual({ stage: 'board' });
    expect(boardStage(b, matters, { ready: true })).toEqual({ stage: 'unfitted', id: 'talk' });
    for (const how of ['day', 'split', 'left'] as const) {
      const fitted = { talk: { how, title: 'Write the talk', order: 1 } };
      expect(boardStage(b, { ...matters, fitted }, { ready: true })).toEqual({ stage: 'board' });
    }
  });
});

describe('Gremly’s suggestions for an over-full day', () => {
  const own = [
    todo('prep', { name: 'Prepare for the review', time_estimate_minutes: 60, due_day: WED }),
    todo('paint', { name: 'Order the paint', time_estimate_minutes: 45, due_day: WED }),
    todo('forms', { name: 'Fill in the forms', time_estimate_minutes: 30, due_day: WED }),
    todo('dentist', {
      name: 'The dentist',
      time_estimate_minutes: 30,
      due_day: WED,
      due_time: '09:00',
    }),
  ];
  const board = (answers: Record<string, unknown> = {}) =>
    boardOf(input({ todos: [...TODOS, ...own] }, answers));
  const relief = (
    moves: { id: string; to: string | null; back_on: string | null }[],
    note = '',
  ) => ({
    version: 'week-relief-test',
    basis: 'basis',
    days: [{ day: WED, over: 65, moves, still: 0, note }],
  });

  it('are shown as the board stands: what could move, where to, and what is left over', () => {
    const b = board();
    // 165 minutes of theirs and Gremly's boiler on a day with 120
    expect(b.days.find((d) => d.day === WED)).toMatchObject({ theirMinutes: 165, over: 45 });
    const r = reliefFor(
      b,
      relief(
        [
          { id: 'paint', to: FRI, back_on: null },
          { id: 'forms', to: null, back_on: '2026-10-13' },
        ],
        'The review prep stays.',
      ),
      WED,
    );
    expect(r).toEqual({
      over: 45,
      // how many he offered, before any check
      asked: 2,
      moves: [
        { id: 'paint', title: 'Order the paint', minutes: 45, to: FRI, backOn: null },
        { id: 'forms', title: 'Fill in the forms', minutes: 30, to: null, backOn: '2026-10-13' },
      ],
      still: 0,
      note: 'The review prep stays.',
    });
    expect(reliefFor(b, relief([{ id: 'forms', to: FRI, back_on: null }]), WED)!.still).toBe(15);
    // he looked and offered nothing, which is not the same as moves that fell
    const none = { ...relief([]), days: [{ ...relief([]).days[0], asked: 0 }] };
    expect(reliefFor(b, none, WED)).toMatchObject({ asked: 0, moves: [] });
    const fell = { ...relief([]), days: [{ ...relief([]).days[0], asked: 2 }] };
    expect(reliefFor(b, fell, WED)).toMatchObject({ asked: 2, moves: [] });
    // nothing for a day the relief does not speak of, or with no relief at all
    expect(reliefFor(b, relief([]), THU)).toBeNull();
    expect(reliefFor(b, null, WED)).toBeNull();
  });

  it('leave out a move that no longer holds, and the line written for it', () => {
    const b = board();
    const r = reliefFor(
      b,
      relief(
        [
          // not theirs on the day, timed, onto the day itself, and onto a day without room
          { id: 'boiler', to: FRI, back_on: null },
          { id: 'dentist', to: FRI, back_on: null },
          { id: 'prep', to: WED, back_on: null },
          // Thursday is a busy day with an hour, and the step takes it
          { id: 'paint', to: THU, back_on: null },
          { id: 'forms', to: FRI, back_on: null },
          { id: 'forms', to: SAT, back_on: null },
        ],
        'A line about six moves.',
      ),
      WED,
    )!;
    expect(r.moves.map((m) => [m.id, m.to])).toEqual([['forms', FRI]]);
    expect(r.note).toBe('');
  });

  it('give a todo that goes to later a day to come back on when the one asked for cannot be', () => {
    const r = reliefFor(board(), relief([{ id: 'forms', to: null, back_on: '2027-01-01' }]), WED)!;
    expect(r.moves[0]).toMatchObject({ to: null, backOn: '2026-10-12' });
  });

  it('become their own moves on the board when taken, and the day is no longer over', () => {
    const b = board();
    const r = reliefFor(
      b,
      relief([
        { id: 'paint', to: FRI, back_on: null },
        { id: 'forms', to: null, back_on: '2026-10-13' },
      ]),
      WED,
    )!;
    const moves = applyRelief({ placed: { desk: SAT }, opened: true }, r.moves);
    expect(moves).toEqual({
      placed: { desk: SAT, paint: FRI },
      later: { forms: '2026-10-13' },
      opened: true,
    });
    const after = board({ board: moves });
    expect(after.days.find((d) => d.day === WED)).toMatchObject({ theirMinutes: 90, over: 0 });
    // what they moved is theirs by their own hand now
    expect(
      after.days.find((d) => d.day === FRI)!.todos.map((t) => [t.id, t.theirs, t.byHand]),
    ).toEqual(expect.arrayContaining([['paint', true, true]]));
  });
});

describe('a day they fill by hand on the board', () => {
  // Maya said rearrange it all, the spread came back, and then she put four
  // of her own on Wednesday herself: 200 minutes on a day with two hours.
  const filled = { fill0: WED, fill1: WED, fill2: WED, fill3: WED };
  const fill = Array.from({ length: 4 }, (_, i) =>
    todo(`fill${i}`, { name: `Fill ${i}`, time_estimate_minutes: 50 }),
  );
  const at = (b: ReturnType<typeof boardOf>, id: string) =>
    [...b.days.flatMap((d) => d.todos), ...b.later].find((t) => t.id === id)!;
  const board = (answers: Record<string, unknown> = {}, over: Partial<BoardInput> = {}) =>
    boardOf(
      input(
        { todos: [...TODOS, ...fill], ...over },
        { keep: 'none', board: { placed: filled }, ...answers },
      ),
    );

  it('is over-full like one they kept, whatever they said of their own days', () => {
    const b = board();
    const wed = b.days.find((d) => d.day === WED)!;
    expect(wed).toMatchObject({ theirMinutes: 200, over: 80 });
    expect(wed.todos.every((t) => t.theirs && t.byHand)).toBe(true);
    // the day gets its card, and is dealt with like any other
    expect(boardStage(b, { keep: 'none' })).toEqual({ stage: 'overfull', day: WED });
    expect(boardStage(b, { keep: 'none', relieved: { [WED]: 'left' } })).toEqual({
      stage: 'board',
    });
    // and the question about their days shows its load
    expect(keepLoad(b).find((d) => d.day === WED)).toMatchObject({ load: 200, count: 4, over: 80 });
  });

  it('can be relieved by the moves Gremly suggests for it', () => {
    const b = board();
    const r = reliefFor(
      b,
      {
        version: 'week-relief-test',
        basis: 'basis',
        days: [
          {
            day: WED,
            over: 80,
            asked: 2,
            moves: [
              { id: 'fill3', to: FRI, back_on: null },
              { id: 'fill2', to: null, back_on: '2026-10-13' },
            ],
            still: 0,
            note: '',
          },
        ],
      },
      WED,
    )!;
    expect(r.moves.map((m) => [m.id, m.to, m.backOn])).toEqual([
      ['fill3', FRI, null],
      ['fill2', null, '2026-10-13'],
    ]);
    expect(r.still).toBe(0);
  });

  it('leaves no room for what Gremly placed there: his go to the next day with room', () => {
    const b = board();
    // the boiler was his on Wednesday. Thursday is full, so it is on Friday, still his
    expect(b.days.find((d) => d.day === WED)!.todos.map((t) => t.id)).not.toContain('boiler');
    expect(at(b, 'boiler')).toMatchObject({ day: FRI, gremly: true, theirs: false });
    expect(gremlyPlaced(b)).toMatchObject({ boiler: FRI });
    expect(boardDiff(b).place).toEqual(expect.arrayContaining([{ id: 'boiler', day: FRI }]));
  });

  it('sends his to Later, with a day to come back, when no later day has room', () => {
    // no free hours at all this week: no day after Wednesday has room for it
    const b = board({ hours: { normal_day: 0, busy_day: 0, weekend_day: 0 } });
    expect(at(b, 'boiler')).toMatchObject({ day: null, gremly: true });
    expect(b.returns).toContain(at(b, 'boiler').backOn);
    expect(boardDiff(b).later.map((l) => l.id)).toContain('boiler');
  });

  it('never leaves a day over its room because of something Gremly placed', () => {
    // Monday has two hours: his reports, and then an hour and three quarters of theirs by hand
    const b = boardOf(
      input(
        { todos: [...TODOS, todo('long', { name: 'A long job', time_estimate_minutes: 105 })] },
        { board: { placed: { long: MON } } },
      ),
    );
    const mon = b.days.find((d) => d.day === MON)!;
    // theirs fits beside the swim only just, so the day is not over, and his thirty minutes no longer fit
    expect(mon).toMatchObject({ habitMinutes: 40, theirMinutes: 105, over: 25 });
    expect(mon.todos.map((t) => t.id)).toEqual(['long']);
    expect(at(b, 'reports')).toMatchObject({ day: TUE, gremly: true });
    for (const d of b.days) {
      if (d.todos.some((t) => t.gremly)) expect(d.left).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives up what matters most to them last, and what he placed last first', () => {
    // Friday holds two of his, twenty and thirty minutes, then they put 90 minutes on it by hand
    const spread = {
      ...SPREAD,
      place: [
        { id: 'boiler', day: FRI },
        { id: 'reports', day: FRI },
      ],
    };
    const todos = [...TODOS, todo('big', { name: 'A big job', time_estimate_minutes: 90 })];
    const of = (answers: Record<string, unknown>) =>
      boardOf({
        ...input({ todos }, answers),
        row: { ...input({ todos }, answers).row, spread },
      });
    // room for one of them: the one placed last leaves
    const plain = of({ board: { placed: { big: FRI } } });
    expect(at(plain, 'boiler').day).toBe(FRI);
    expect(at(plain, 'reports').day).toBe(SAT);
    // the reports matter most this week: the boiler leaves instead, though it was placed first
    const picked = of({
      board: { placed: { big: FRI } },
      priorities: [{ text: 'The grades', item_ids: ['reports'] }],
    });
    expect(at(picked, 'reports').day).toBe(FRI);
    expect(at(picked, 'boiler').day).toBe(SAT);
  });

  it('holds one of his with a hard date on these days to a day up to that date', () => {
    const spread = { ...SPREAD, place: [{ id: 'boiler', day: WED }] };
    const dated = (by: string) =>
      boardOf({
        ...input(
          {
            todos: [
              ...TODOS.map((t) => (t.id === 'boiler' ? { ...t, target_date: by } : t)),
              ...fill,
            ],
          },
          { keep: 'none', board: { placed: filled } },
        ),
        row: {
          ...input({}, { keep: 'none', board: { placed: filled } }).row,
          spread,
        },
      });
    // due on Wednesday itself: it has no later day to go to, and stays
    expect(at(dated(WED), 'boiler').day).toBe(WED);
    // due by Friday: Thursday is full, Friday has room
    expect(at(dated(FRI), 'boiler').day).toBe(FRI);
    // due by Thursday, which is full: the nearest earlier day with room
    expect(at(dated(THU), 'boiler').day).toBe(TUE);
  });
});
