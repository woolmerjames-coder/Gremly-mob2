/**
 * Changing a week already planned (lib/week/board/change.ts): the board it is
 * changed on, and saving their moves as one change with one Undo. The person
 * is made up (Maya); today is Wednesday 7 October 2026, in the week of
 * Monday 5 to Sunday 11.
 */
const mockStore: any = {};
jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockStore },
}));
const mockSaveBoard = jest.fn();
jest.mock('../save', () => ({ saveBoard: (...a: unknown[]) => mockSaveBoard(...a) }));
const mockChange = jest.fn();
jest.mock('../../../repo/weekReviewRepo', () => ({
  changeWeekReview: (...a: unknown[]) => mockChange(...a),
}));
const mockSetReview = jest.fn();
jest.mock('../../thisWeek', () => ({
  useThisWeek: { getState: () => ({ setReview: mockSetReview }) },
}));
const mockRowSaved = jest.fn();
const mockDropUndo = jest.fn();
const mockPatchSession = jest.fn();
jest.mock('../../review/session', () => ({
  rowSaved: (...a: unknown[]) => mockRowSaved(...a),
  dropUndo: (...a: unknown[]) => mockDropUndo(...a),
  patchSession: (...a: unknown[]) => mockPatchSession(...a),
}));

import { changeBoard, saveChange } from '../change';
import { easeHabitOnBoard, moveTodo, toggleHabitDay } from '../model';

const [MON, , WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];

const TODOS = [
  { id: 'marking', name: 'The Year 9 marking', due_day: THU, time_estimate_minutes: 60 },
  { id: 'boiler', name: 'Sort the boiler', due_day: WED },
  { id: 'present', name: 'Find a present', resurface_at: '2026-10-15' },
  { id: 'milk', name: 'Buy milk' },
  { id: 'done', name: 'Gather the grades', due_day: WED, completed_at: `${WED}T09:00:00Z` },
];
const HABITS = [{ id: 'swim', name: 'Swim', cadence: 'weekly', target_per_period: 2 }];
const PLANNED = {
  todos: 3,
  later: 1,
  habit_days: 2,
  gremly: { marking: THU },
  days: {
    [MON]: { todos: ['gone-by'], habits: ['swim'] },
    [WED]: { todos: ['boiler', 'done'], habits: [] },
    [THU]: { todos: ['marking'], habits: [] },
  },
};

let row: any;
const board = (moves = {}) =>
  changeBoard({
    today: WED,
    row,
    daysOff: [0, 6],
    moves,
    todos: mockStore.todos,
    habits: HABITS,
    habitPlans: [{ habit_id: 'swim', planned_date: SAT }],
  });

let revert: jest.Mock;
beforeEach(() => {
  mockStore.todos = TODOS.map((t) => ({ ...t }));
  row = {
    id: 'row-1',
    week_start: MON,
    read: null,
    // a spread from when the week was planned is not laid over the board again
    spread: { place: [{ id: 'milk', day: FRI }], later: [], habit_days: [], notes: [] },
    answers: {
      step: 'done',
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      planned: PLANNED,
    },
  };
  revert = jest.fn(async () => undefined);
  mockSaveBoard.mockImplementation(async (diff: any) => ({
    todos: diff.place.length,
    later: diff.later.length,
    habitDays: diff.habits.reduce((n: number, h: any) => n + h.add.length + h.remove.length, 0),
    failed: 0,
    revert,
  }));
  mockChange.mockImplementation(async (_id: string, change: (r: any) => any) => {
    row = { ...row, ...change(row) };
    return row;
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the board a planned week is changed on', () => {
  it('runs from today to the week’s last day, as saved, with nothing given a day', () => {
    const b = board();
    expect(b.days.map((d) => d.day)).toEqual([WED, THU, FRI, SAT, SUN]);
    expect(b.days[0].todos.map((t) => t.id)).toEqual(['boiler']);
    expect(b.days[1].todos.map((t) => t.id)).toEqual(['marking']);
    expect(b.later.map((t) => [t.id, t.backOn])).toEqual([['present', '2026-10-15']]);
    // never placed and never put off: loose, whatever Gremly's old spread said
    expect(b.loose.map((t) => t.id)).toEqual(['milk']);
    expect(b.habits[0]).toMatchObject({ id: 'swim', days: [SAT], saved: [SAT] });
  });
});

describe('saving a change to the week', () => {
  it('writes nothing when they moved nothing', async () => {
    expect(await saveChange(row, board(), {})).toBeNull();
    expect(mockSaveBoard).not.toHaveBeenCalled();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it('writes only their moves, and the plan kept on the week follows them', async () => {
    let moves = moveTodo(board(), {}, 'boiler', FRI);
    moves = moveTodo(board(moves), moves, 'milk', THU);
    moves = toggleHabitDay(board(moves), moves, 'swim', WED);
    const changed = await saveChange(row, board(moves), moves);
    expect(mockSaveBoard).toHaveBeenCalledWith({
      place: [
        { id: 'milk', day: THU },
        { id: 'boiler', day: FRI },
      ],
      later: [],
      habits: [{ id: 'swim', add: [WED], remove: [] }],
      eases: [],
    });
    expect(changed).toMatchObject({ todos: 2, later: 0, habitDays: 1 });
    expect(row.answers.planned).toEqual({
      todos: 3,
      later: 1,
      habit_days: 2,
      // where Gremly put things when the week was planned is kept
      gremly: { marking: THU },
      days: {
        // a day gone by stays as it was planned
        [MON]: PLANNED.days[MON],
        // what was planned for today and is done stays; the boiler has moved on
        [WED]: { todos: ['done'], habits: ['swim'] },
        [THU]: { todos: ['marking', 'milk'], habits: [] },
        [FRI]: { todos: ['boiler'], habits: [] },
        [SAT]: { todos: [], habits: ['swim'] },
        [SUN]: { todos: [], habits: [] },
      },
    });
    // every copy of the week's row is kept in step
    expect(mockSetReview).toHaveBeenCalledWith(row);
    expect(mockRowSaved).toHaveBeenCalledWith(row);
    // the Undo of the board the review saved is let go: it would undo over this change
    expect(mockDropUndo).toHaveBeenCalledWith('board');
    expect(mockPatchSession).toHaveBeenCalledWith({ plannedBefore: null });
  });

  it('puts everything back with one Undo, the kept plan with it', async () => {
    const moves = moveTodo(board(), {}, 'boiler', 'later');
    const changed = await saveChange(row, board(moves), moves);
    expect(mockSaveBoard.mock.calls[0][0].later).toEqual([{ id: 'boiler', backOn: '2026-10-12' }]);
    expect(row.answers.planned.days[WED].todos).toEqual(['done']);
    await changed!.undo();
    expect(revert).toHaveBeenCalledTimes(1);
    expect(row.answers.planned).toEqual(PLANNED);
  });

  it('takes back what was written and says so when part of it could not be saved', async () => {
    mockSaveBoard.mockResolvedValue({ todos: 1, later: 0, habitDays: 0, failed: 1, revert });
    const moves = moveTodo(board(), {}, 'boiler', FRI);
    await expect(saveChange(row, board(moves), moves)).rejects.toThrow(
      "1 of the week's changes could not be saved.",
    );
    expect(revert).toHaveBeenCalledTimes(1);
    expect(mockChange).not.toHaveBeenCalled();
    expect(row.answers.planned).toEqual(PLANNED);
  });

  it('lets their moves stand when only the kept plan could not be written', async () => {
    mockChange.mockRejectedValue(new Error('offline'));
    const moves = moveTodo(board(), {}, 'boiler', FRI);
    const changed = await saveChange(row, board(moves), moves);
    expect(changed).toMatchObject({ todos: 1 });
    expect(revert).not.toHaveBeenCalled();
    // and the Undo still puts the moves back
    await changed!.undo();
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it('pauses a habit for the rest of the week: the pause, and the days it loses', async () => {
    const moves = easeHabitOnBoard(board(), {}, 'swim', 'pause');
    const paused = board(moves);
    expect(paused.habits[0]).toMatchObject({ ease: 'pause', days: [] });
    await saveChange(row, paused, moves);
    expect(mockSaveBoard).toHaveBeenCalledWith({
      place: [],
      later: [],
      habits: [{ id: 'swim', add: [], remove: [SAT] }],
      // from today to the week's last day
      eases: [{ id: 'swim', mode: 'pause', first: WED, last: SUN, note: '' }],
    });
    // the plan kept on the week no longer has it on Saturday
    expect(row.answers.planned.days[SAT]).toEqual({ todos: [], habits: [] });
  });

  it('shows a habit as it is saved: paused, with its pause there to end', async () => {
    const saved = [
      { id: 'e1', habit_id: 'swim', mode: 'pause', period_start: MON, period_end: SUN },
    ];
    const b = changeBoard({
      today: WED,
      row,
      daysOff: [0, 6],
      moves: {},
      todos: mockStore.todos,
      habits: HABITS,
      habitPlans: [],
      eases: saved,
    });
    expect(b.habits[0]).toMatchObject({ id: 'swim', ease: 'pause', easeTo: null });
  });

  it('starts a plan for the days ahead on a week that kept none', async () => {
    row.answers.planned = undefined;
    const moves = moveTodo(board(), {}, 'milk', SAT);
    await saveChange(row, board(moves), moves);
    expect(row.answers.planned).toMatchObject({ todos: 0, later: 0, habit_days: 0 });
    expect(Object.keys(row.answers.planned.days)).toEqual([WED, THU, FRI, SAT, SUN]);
    expect(row.answers.planned.days[SAT]).toEqual({ todos: ['milk'], habits: ['swim'] });
  });
});
