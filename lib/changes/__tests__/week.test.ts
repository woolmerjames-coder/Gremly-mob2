/**
 * The week's own changes in the app (lib/changes/week, lib/changes/later):
 * each one checked against the person's week, applied through the store, the
 * week's review or the settings, worded for the card, and put back by Undo.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    setState: (to: any) => Object.assign(mockState, typeof to === 'function' ? to(mockState) : to),
  },
}));
jest.mock('../../repo/linkingRepo', () => ({
  upsertDropWorldLinks: jest.fn(async () => {}),
  deleteDropWorldLink: jest.fn(async () => {}),
  upsertDropChapterLinks: jest.fn(async () => {}),
  deleteDropChapterLink: jest.fn(async () => {}),
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(async () => null),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ thread: null, patchMeta: () => {} }) },
}));
let mockIds = 0;
jest.mock('../../minddrop/ids', () => ({ generateDropId: () => `id-${++mockIds}` }));
// the week's review as the database has it, and the weekly day as saved; what
// each call does is set before every test, since mocks are reset between tests
const mockDb: { row: any; weeklyDay: number } = { row: null, weeklyDay: 0 };
jest.mock('../../repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveWeeklyDay: jest.fn(),
  changeWeekReview: jest.fn(),
}));

import { applyChange, applyChanges } from '../apply';
import { checkChange, type Change } from '../model';
import { contextFor } from '../snapshot';
import { buttonWords, doneWords, rowWords } from '../words';
import { laterColumns } from '../later';
import { intentionNote, plannedDays, weekCheckContext } from '../week';
import { useThisWeek } from '../../week/thisWeek';
import {
  changeWeekReview,
  getWeekReview,
  getWeekSettings,
  saveWeeklyDay,
} from '../../repo/weekReviewRepo';
import { getDateService } from '../../date/DateService';

// Wednesday 7 October 2026; with Sunday as the weekly day the week is Monday 5 to Sunday 11
const TODAY = '2026-10-07';
const MON = '2026-10-05';
const THU = '2026-10-08';
const FRI = '2026-10-09';
const SAT = '2026-10-10';
const SUN = '2026-10-11';

function updater(list: string) {
  return jest.fn(async (id: string, updates: any) => {
    mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...updates } : x));
  });
}
let mockMade = 0;
function creator(list: string, type: string) {
  return jest.fn(async (row: any) => {
    const item = { id: `${type}-new-${++mockMade}`, type, ...row };
    mockState[list] = [...mockState[list], item];
    return item;
  });
}
function remover(list: string) {
  return jest.fn(async (id: string) => {
    mockState[list] = mockState[list].filter((x: any) => x.id !== id);
  });
}

const review = (over: Record<string, any> = {}): any => ({
  id: 'r1',
  owner_id: 'u1',
  week_start: MON,
  span_start: MON,
  status: 'done',
  kind: 'weekly',
  read: null,
  answers: { hours: { normal_day: 2, busy_day: 1, weekend_day: 4 }, busy_days: [FRI] },
  spread: null,
  checkins: [],
  prompt_versions: {},
  created_at: '2026-10-04T18:00:00Z',
  completed_at: '2026-10-04T18:20:00Z',
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockIds = 0;
  mockMade = 0;
  mockDb.row = review();
  mockDb.weeklyDay = 0;
  (saveWeeklyDay as jest.Mock).mockImplementation(async (_user: string, weekday: number) => {
    mockDb.weeklyDay = weekday;
  });
  (changeWeekReview as jest.Mock).mockImplementation(
    async (_id: string, change: (row: any) => any) => {
      if (!mockDb.row) return null;
      mockDb.row = { ...mockDb.row, ...change(mockDb.row) };
      return mockDb.row;
    },
  );
  // the account: the weekly day as saved, and the review of whichever week is asked for
  (getWeekSettings as jest.Mock).mockImplementation(async () => ({
    weekly_day: mockDb.weeklyDay,
    days_off: [6, 0],
  }));
  (getWeekReview as jest.Mock).mockImplementation(async (_user: string, weekStart: string) =>
    mockDb.row && mockDb.row.week_start === weekStart ? mockDb.row : null,
  );
  Object.assign(mockState, {
    userId: 'u1',
    todos: [
      { id: 't1', name: 'Clear the garage', due_day: SAT, due_date: SAT, scheduled_date: SAT },
      {
        id: 't2',
        name: 'Book the vet',
        due_day: null,
        resurface_at: '2026-10-19',
        resurface_count: 1,
      },
    ],
    habits: [{ id: 'h1', name: 'Run', cadence: 'weekly', target_per_period: 3, views: {} }],
    notes: [],
    habitPlans: [
      { id: 'p1', habit_id: 'h1', planned_date: MON, week_start: MON, status: 'planned' },
      { id: 'p2', habit_id: 'h1', planned_date: TODAY, week_start: MON, status: 'planned' },
      { id: 'p3', habit_id: 'h1', planned_date: SAT, week_start: MON, status: 'planned' },
      {
        id: 'p4',
        habit_id: 'h1',
        planned_date: '2026-10-12',
        week_start: '2026-10-12',
        status: 'planned',
      },
    ],
    habitProgress: [],
    worlds: [],
    chapters: [],
    dropWorldLinks: [],
    dropChapterLinks: [],
    updateTodo: updater('todos'),
    updateNote: updater('notes'),
    createTodo: creator('todos', 'todo'),
    createNote: creator('notes', 'note'),
    deleteTodo: remover('todos'),
    deleteNote: remover('notes'),
    setHabitPlan: jest.fn(async (habitId: string, day: string) => {
      mockState.habitPlans = [
        ...mockState.habitPlans.filter(
          (p: any) => !(p.habit_id === habitId && p.planned_date === day),
        ),
        {
          id: `plan-${day}`,
          habit_id: habitId,
          planned_date: day,
          week_start: MON,
          status: 'planned',
        },
      ];
    }),
    removeHabitPlan: jest.fn(async (habitId: string, day: string) => {
      mockState.habitPlans = mockState.habitPlans.filter(
        (p: any) => !(p.habit_id === habitId && p.planned_date === day),
      );
    }),
  });
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: mockDb.row, loaded: true });
});

afterEach(() => {
  jest.useRealTimers();
});

/** A change as the card would hold it: checked against the store and the week. */
function checked(raw: Record<string, any>): Change {
  const r = checkChange({ cid: 'c1', ...raw }, contextFor(raw));
  if (!r.ok) throw new Error(r.reason);
  return r.change;
}
const todo = (id: string) => mockState.todos.find((t: any) => t.id === id);
const runDays = () =>
  mockState.habitPlans
    .filter((p: any) => p.habit_id === 'h1')
    .map((p: any) => p.planned_date)
    .sort();
const fixed = { relative: false };

describe('the week a change is checked against', () => {
  it('runs from their day to the end of the week they are in, with its shape and intention', () => {
    expect(getDateService().today()).toBe(TODAY);
    expect(weekCheckContext()).toEqual({
      first: TODAY,
      last: SUN,
      week_start: MON,
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: [FRI],
      has_review: true,
      intention: null,
      // what matters most as it stands: nothing chosen yet
      priorities: [],
      weekly_day: 0,
    });
  });

  it('has no review to keep things on until one is started', () => {
    useThisWeek.setState({ review: null });
    expect(weekCheckContext()).toMatchObject({ has_review: false, hours: null, busy_days: [] });
    useThisWeek.setState({ review: review({ status: 'ready' }) });
    expect(weekCheckContext().has_review).toBe(false);
  });

  it("is given only to the week's own changes, and a habit's days come with it", () => {
    expect(contextFor({ op: 'change', type: 'todo', id: 't1' }).week).toBeUndefined();
    const ctx = contextFor({ op: 'habit_days', type: 'habit', id: 'h1' });
    expect(ctx.week?.last).toBe(SUN);
    // from their day on: Monday has gone, and next week is not this week's
    expect(ctx.item?.planned_days).toEqual([TODAY, SAT]);
    expect(plannedDays('h1', MON, SUN)).toEqual([MON, TODAY, SAT]);
  });
});

describe('a todo put off for later', () => {
  const raw = { op: 'later', type: 'todo', id: 't1', back_on: '2026-10-19' };

  it('leaves its day, gets its back day and counts the time, with no reminder', async () => {
    const c = checked(raw);
    expect(rowWords(c, fixed)).toBe('Put Clear the garage off until Mon 19 Oct');
    expect(buttonWords(c)).toBe('Yes, put it off');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: true, summary: 'Clear the garage comes back on Mon 19 Oct.' });
    expect(todo('t1')).toMatchObject({
      resurface_at: '2026-10-19',
      due_day: null,
      due_date: null,
      scheduled_date: null,
      resurface_count: 1,
    });
    expect(todo('t1').reminders).toBeUndefined();
  });

  it('Undo puts it back on its day with its count as it was', async () => {
    const o = await applyChange(checked(raw), { source: 'thread' });
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(todo('t1')).toMatchObject({
      resurface_at: null,
      due_day: SAT,
      due_date: SAT,
      scheduled_date: SAT,
      resurface_count: null,
    });
  });

  it('moves the back day of one already put off, and counts again', async () => {
    const c = checked({ ...raw, id: 't2', back_on: '2026-10-26' });
    expect(rowWords(c, fixed)).toBe('Bring Book the vet back on Mon 26 Oct, not Mon 19 Oct');
    await applyChange(c, { source: 'thread' });
    expect(todo('t2')).toMatchObject({ resurface_at: '2026-10-26', resurface_count: 2 });
  });

  it('leaves alone a todo they moved since the card was made', async () => {
    const c = checked(raw);
    await mockState.updateTodo('t1', { due_day: FRI });
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: false, reason: 'stale' });
    expect(todo('t1').resurface_at).toBeUndefined();
  });

  it('leaves alone a todo they ticked off since the card was made', async () => {
    const c = checked(raw);
    await mockState.updateTodo('t1', { completed_at: '2026-10-07T12:30:00Z' });
    mockState.updateTodo.mockClear();
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });

  it('is simply put off again when the day it came back on has gone', () => {
    mockState.todos = [
      { id: 't3', name: 'Renew passport', due_day: null, resurface_at: '2026-10-01' },
    ];
    const c = checked({ ...raw, id: 't3' });
    expect(c.before).toEqual({ back_on: '2026-10-01', day: null });
    expect(rowWords(c, fixed)).toBe('Put Renew passport off until Mon 19 Oct');
  });

  it('says so when the todo has gone', async () => {
    const c = checked(raw);
    mockState.todos = [];
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: false, reason: 'gone' });
  });

  it('writes the same columns wherever it is used', () => {
    expect(laterColumns({ id: 'x', due_day: SAT, resurface_count: 2 }, '2026-10-19')).toEqual({
      patch: {
        resurface_at: '2026-10-19',
        due_day: null,
        due_date: null,
        scheduled_date: null,
        resurface_count: 3,
      },
      before: {
        resurface_at: null,
        due_day: SAT,
        due_date: null,
        scheduled_date: null,
        resurface_count: 2,
      },
    });
  });
});

describe("a habit's days", () => {
  const days = (list: string[]) =>
    checked({ op: 'habit_days', type: 'habit', id: 'h1', days: list });

  it('moves one day and leaves the rest, in the past and next week too', async () => {
    const c = days([THU, SAT]);
    expect(rowWords(c, fixed)).toBe('Move Run from Wed 7 Oct to Thu 8 Oct');
    expect(buttonWords(c)).toBe('Yes, plan it');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: true, summary: 'Run is planned on Thu 8 Oct and Sat 10 Oct.' });
    expect(runDays()).toEqual([MON, THU, SAT, '2026-10-12']);
    expect(mockState.removeHabitPlan).toHaveBeenCalledWith('h1', TODAY);
    expect(mockState.setHabitPlan).toHaveBeenCalledWith('h1', THU);
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(runDays()).toEqual([MON, TODAY, SAT, '2026-10-12']);
  });

  it('says a day added, days taken off, a whole new set, and the week cleared', () => {
    expect(rowWords(days([TODAY, FRI, SAT]), fixed)).toBe('Add Run on Fri 9 Oct');
    expect(rowWords(days([SAT]), fixed)).toBe('Take Run off Wed 7 Oct');
    expect(rowWords(days([THU, FRI, SUN]), fixed)).toBe(
      'Plan Run on Thu 8 Oct, Fri 9 Oct and Sun 11 Oct',
    );
    const off = days([]);
    expect(rowWords(off, fixed)).toBe('Take Run off the week');
    expect(doneWords(off)).toBe('Run has no days planned.');
  });

  it('writes only what differs from now, so a day changed by hand since is left alone', async () => {
    const c = days([THU, SAT]);
    // they took Wednesday off themselves, and added Friday, after the card was made
    await mockState.removeHabitPlan('h1', TODAY);
    await mockState.setHabitPlan('h1', FRI);
    mockState.removeHabitPlan.mockClear();
    await applyChange(c, { source: 'thread' });
    expect(mockState.removeHabitPlan).not.toHaveBeenCalled();
    expect(runDays()).toEqual([MON, THU, FRI, SAT, '2026-10-12']);
  });

  it('is changed whole or not at all: a day that did not save is reported, and the rest put back', async () => {
    const c = days([THU, FRI]);
    // the store's writer puts its own change back when the save fails, and does not throw
    mockState.setHabitPlan.mockImplementationOnce(async () => undefined);
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({
      ok: false,
      reason: 'failed',
      message: "Run's days could not be saved.",
    });
    expect(runDays()).toEqual([MON, TODAY, SAT, '2026-10-12']);
  });

  it('says so when the habit has gone', async () => {
    const c = days([THU]);
    mockState.habits = [];
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: false, reason: 'gone' });
  });
});

describe('the shape of the week', () => {
  const shape = (s: Record<string, any>) => checked({ op: 'week_shape', shape: s });

  it("is kept on the week's review, and the app's copy follows", async () => {
    const c = shape({ busy_days: [THU, FRI, SAT], hours: { normal_day: 1.5 } });
    expect(rowWords(c, fixed)).toBe(
      'This week: Thu 8 Oct, Fri 9 Oct and Sat 10 Oct as busy days, with 1 hr 30 min free on a normal day',
    );
    expect(buttonWords(c)).toBe('Yes, change my week');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({
      ok: true,
      summary:
        'Your week now has Thu 8 Oct, Fri 9 Oct and Sat 10 Oct as busy days and 1 hr 30 min free on a normal day.',
    });
    expect(changeWeekReview).toHaveBeenCalledWith('r1', expect.any(Function));
    const answers = {
      hours: { normal_day: 1.5, busy_day: 1, weekend_day: 4 },
      busy_days: [THU, FRI, SAT],
    };
    expect(mockDb.row.answers).toEqual(answers);
    expect(useThisWeek.getState().review?.answers).toEqual(answers);
  });

  it('Undo puts back only what it set, keeping what was answered since', async () => {
    const o = await applyChange(shape({ hours: { normal_day: 1.5 } }), { source: 'thread' });
    // something else answered in the review since
    mockDb.row = {
      ...mockDb.row,
      answers: { ...mockDb.row.answers, busy_days: [SAT], intention_id: 'n9' },
    };
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockDb.row.answers).toEqual({
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: [SAT],
      intention_id: 'n9',
    });
  });

  it('says hours for each kind of day, and a week with no busy days', () => {
    expect(rowWords(shape({ hours: { normal_day: 3, busy_day: 0, weekend_day: 5 } }), fixed)).toBe(
      'This week: 3 hr free on a normal day, no time on a busy day and 5 hr on a day off',
    );
    const none = shape({ busy_days: [] });
    expect(rowWords(none, fixed)).toBe('This week: no busy days');
    expect(doneWords(none)).toBe('Your week now has no busy days.');
  });

  it('keeps a busy day that has already gone: the days stated are the ones from here on', async () => {
    mockDb.row = review({ answers: { busy_days: [MON, FRI] } });
    useThisWeek.setState({ review: mockDb.row });
    const c = shape({ busy_days: [THU] });
    expect(c).toMatchObject({ from: TODAY, week_start: MON, before: { busy_days: [FRI] } });
    const o = await applyChange(c, { source: 'thread' });
    expect(mockDb.row.answers.busy_days).toEqual([MON, THU]);
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockDb.row.answers.busy_days).toEqual([MON, FRI]);
  });

  it('leaves alone hours or busy days they changed since the card was made', async () => {
    const hours = shape({ hours: { normal_day: 1.5 } });
    const busy = shape({ busy_days: [THU] });
    mockDb.row = {
      ...mockDb.row,
      answers: { hours: { normal_day: 3, busy_day: 1, weekend_day: 4 }, busy_days: [SAT] },
    };
    for (const c of [hours, busy]) {
      const o = await applyChange(c, { source: 'thread' });
      expect(o).toMatchObject({
        ok: false,
        reason: 'stale',
        message: 'Your week changed since, so it was left as it is.',
      });
    }
    expect(mockDb.row.answers).toEqual({
      hours: { normal_day: 3, busy_day: 1, weekend_day: 4 },
      busy_days: [SAT],
    });
  });

  it("reads the week's review from the account when the app is not holding it", async () => {
    const c = shape({ busy_days: [] });
    useThisWeek.setState({ review: null });
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(getWeekReview).toHaveBeenCalledWith('u1', MON);
    expect(mockDb.row.answers.busy_days).toEqual([]);
  });

  it('is not applied when the week has no review to keep it on', async () => {
    const c = shape({ busy_days: [] });
    useThisWeek.setState({ review: null });
    mockDb.row = null;
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: false, reason: 'failed' });
    expect(changeWeekReview).not.toHaveBeenCalled();
  });

  it('is kept for the week it names, which is next week when that is the one being planned', async () => {
    // a review of next week, brought forward: its row is not the week they are in
    const next = review({
      id: 'r2',
      week_start: '2026-10-12',
      span_start: '2026-10-12',
      answers: {},
    });
    const c: Change = {
      cid: 'c1',
      op: 'week_shape',
      type: null,
      id: null,
      title: '',
      week_start: '2026-10-12',
      from: '2026-10-12',
      shape: { busy_days: ['2026-10-14'] },
      before: { busy_days: [] },
    };
    const mine = mockDb.row;
    mockDb.row = next;
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(changeWeekReview).toHaveBeenCalledWith('r2', expect.any(Function));
    expect(mockDb.row.answers.busy_days).toEqual(['2026-10-14']);
    // the app's copy stays this week's
    expect(useThisWeek.getState().review).toBe(mine);
  });
});

describe('something added to what matters most', () => {
  const add = (text: string) => checked({ op: 'priority', priority: text });
  const chosen = [{ text: 'Finish the grant', item_ids: ['t1'] }];
  beforeEach(() => {
    mockDb.row = review({ answers: { ...review().answers, priorities: chosen } });
    useThisWeek.setState({ review: mockDb.row });
  });

  it("is kept with the priorities on the week's review, beside the ones they picked", async () => {
    expect(weekCheckContext().priorities).toEqual(['Finish the grant']);
    const c = add('The stock audit');
    expect(c).toMatchObject({
      op: 'priority',
      week_start: MON,
      fields: { text: 'The stock audit' },
      before: { priorities: ['Finish the grant'] },
    });
    expect(rowWords(c, fixed)).toBe('Add to what matters most this week: The stock audit');
    expect(buttonWords(c)).toBe('Yes, add it');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({
      ok: true,
      summary: 'The stock audit is now among what matters most this week.',
    });
    const priorities = [...chosen, { text: 'The stock audit', item_ids: [] }];
    expect(mockDb.row.answers.priorities).toEqual(priorities);
    expect(useThisWeek.getState().review?.answers.priorities).toEqual(priorities);
  });

  it('Undo takes out only what it added, keeping what was chosen since', async () => {
    const o = await applyChange(add('The stock audit'), { source: 'thread' });
    mockDb.row = {
      ...mockDb.row,
      answers: {
        ...mockDb.row.answers,
        priorities: [...mockDb.row.answers.priorities, { text: 'The move', item_ids: [] }],
      },
    };
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockDb.row.answers.priorities.map((p: any) => p.text)).toEqual([
      'Finish the grant',
      'The move',
    ]);
  });

  it('writes nothing twice when it is there already, and Undo then leaves it', async () => {
    const c = add('The stock audit');
    // they picked the same thing on the card since
    mockDb.row = {
      ...mockDb.row,
      answers: {
        ...mockDb.row.answers,
        priorities: [...chosen, { text: 'the stock audit', item_ids: ['t2'] }],
      },
    };
    const o = await applyChange(c, { source: 'thread' });
    expect(o.ok).toBe(true);
    expect(mockDb.row.answers.priorities).toHaveLength(2);
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockDb.row.answers.priorities).toHaveLength(2);
  });

  it('leaves the week alone when it has filled up since the card was made', async () => {
    const c = add('The stock audit');
    mockDb.row = {
      ...mockDb.row,
      answers: {
        ...mockDb.row.answers,
        priorities: [...chosen, { text: 'Two', item_ids: [] }, { text: 'Three', item_ids: [] }],
      },
    };
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({
      ok: false,
      reason: 'stale',
      message: 'What matters most this week changed since, so it was left as it is.',
    });
    expect(mockDb.row.answers.priorities).toHaveLength(3);
  });

  it('is not offered where it is there already, the week is full, or there is no review', () => {
    const reason = (raw: Record<string, any>) => {
      const r = checkChange({ cid: 'c1', ...raw }, contextFor(raw));
      return r.ok ? null : r.reason;
    };
    expect(reason({ op: 'priority', priority: 'finish the grant' })).toBe('no_change');
    useThisWeek.setState({
      review: review({ answers: { priorities: ['A', 'B', 'C'].map((text) => ({ text })) } }),
    });
    expect(reason({ op: 'priority', priority: 'A fourth' })).toBe('priorities_full');
    useThisWeek.setState({ review: null });
    expect(reason({ op: 'priority', priority: 'The audit' })).toBe('no_review');
  });

  it('is kept for the week it names, which is next week when that is the one being planned', async () => {
    const c = { ...add('The stock audit'), week_start: '2026-10-12' };
    const next = review({ id: 'r2', week_start: '2026-10-12', status: 'started', answers: {} });
    const mine = mockDb.row;
    mockDb.row = next;
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(changeWeekReview).toHaveBeenCalledWith('r2', expect.any(Function));
    expect(mockDb.row.answers.priorities).toEqual([{ text: 'The stock audit', item_ids: [] }]);
    // the app's copy stays this week's
    expect(useThisWeek.getState().review).toBe(mine);
  });
});

describe('the intention', () => {
  const intend = (text: string) => checked({ op: 'intention', intention: text });

  it('is a journal note for the week, which the brief already reads', async () => {
    const c = intend('One thing at a time');
    expect(rowWords(c, fixed)).toBe("Set this week's intention: “One thing at a time”");
    expect(buttonWords(c)).toBe('Yes, set it');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({
      ok: true,
      summary: 'Your intention is set.',
      createdId: 'note-new-1',
    });
    expect(mockState.createNote).toHaveBeenCalledWith({
      subtype: 'journal',
      title: 'One thing at a time',
      body: 'One thing at a time',
      origin: 'manual',
      canonicalType: 'log',
      journal_subtype: 'intention',
      target_date: MON,
      tags: ['intention'],
      views: { week_review: true, week_start: MON },
    });
    expect(intentionNote(MON)?.id).toBe('note-new-1');
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockState.notes).toEqual([]);
  });

  it('rewrites the one the week has, and Undo puts its words back', async () => {
    mockState.notes = [
      {
        id: 'n9',
        title: 'Protect my mornings',
        body: 'Protect my mornings',
        journal_subtype: 'intention',
        target_date: MON,
      },
      {
        id: 'n8',
        title: 'Last week',
        body: 'Last week',
        journal_subtype: 'intention',
        target_date: '2026-09-28',
      },
    ];
    const c = intend('Rest first');
    expect(c).toMatchObject({ id: 'n9', before: { text: 'Protect my mornings' } });
    const o = await applyChange(c, { source: 'thread' });
    expect(mockState.createNote).not.toHaveBeenCalled();
    expect(mockState.notes[0]).toMatchObject({ id: 'n9', title: 'Rest first', body: 'Rest first' });
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockState.notes[0]).toMatchObject({
      title: 'Protect my mornings',
      body: 'Protect my mornings',
    });
    expect(mockState.notes[1].body).toBe('Last week');
  });
});

describe('the intention, since the card was made', () => {
  it('leaves alone one they rewrote', async () => {
    mockState.notes = [
      {
        id: 'n9',
        title: 'Protect my mornings',
        body: 'Protect my mornings',
        journal_subtype: 'intention',
        target_date: MON,
      },
    ];
    const c = checked({ op: 'intention', intention: 'Rest first' });
    await mockState.updateNote('n9', { body: 'Say no more often' });
    mockState.updateNote.mockClear();
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({
      ok: false,
      reason: 'stale',
      message: 'Your intention changed since, so it was left as it is.',
    });
    expect(mockState.updateNote).not.toHaveBeenCalled();
  });

  it('leaves alone one they wrote where there was none', async () => {
    const c = checked({ op: 'intention', intention: 'Rest first' });
    mockState.notes = [
      { id: 'n9', title: 'Mine', body: 'Mine', journal_subtype: 'intention', target_date: MON },
    ];
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    expect(mockState.createNote).not.toHaveBeenCalled();
  });

  it('reads the note the way its words were stated to Gremly: on one line, cut to length', async () => {
    const long = `Protect my mornings.\n\nNo meetings before ten.  ${'x'.repeat(300)}`;
    mockState.notes = [
      { id: 'n9', title: 'Protect', body: long, journal_subtype: 'intention', target_date: MON },
    ];
    const stated = long.replace(/\s+/g, ' ').trim().slice(0, 200);
    const c: Change = {
      cid: 'c1',
      op: 'intention',
      type: 'note',
      id: 'n9',
      title: 'Rest first',
      week_start: MON,
      fields: { text: 'Rest first' },
      before: { text: stated },
    };
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(mockState.notes[0].body).toBe('Rest first');
  });

  it('is dated for the week it names, which is next week when that is the one being planned', async () => {
    const c: Change = {
      cid: 'c1',
      op: 'intention',
      type: 'note',
      id: null,
      title: 'Rest first',
      week_start: '2026-10-12',
      fields: { text: 'Rest first' },
      before: { text: null },
    };
    // this week's intention is another note, and is left alone
    mockState.notes = [
      { id: 'n9', title: 'Mine', body: 'Mine', journal_subtype: 'intention', target_date: MON },
    ];
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(mockState.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        target_date: '2026-10-12',
        views: { week_review: true, week_start: '2026-10-12' },
      }),
    );
    expect(mockState.notes[0].body).toBe('Mine');
  });
});

describe('a milestone', () => {
  const milestone = {
    goal: 'Conference talk',
    date: '2026-10-20',
    steps: [
      { title: 'Draft the outline', by: THU, minutes: 45, kind: 'todo' },
      { title: 'How is the draft going?', by: '2026-10-12', kind: 'check_in' },
      { title: 'Rehearse once', by: '2026-10-16', kind: 'todo' },
    ],
  };
  const mile = (m: Record<string, any> = milestone) => checked({ op: 'milestone', milestone: m });

  it("adds a todo for each step to do, and keeps the check ins on the week's review", async () => {
    const c = mile();
    expect(rowWords(c, fixed)).toBe(
      'Set up Conference talk for Tue 20 Oct: 2 steps to do and 1 check in',
    );
    expect(buttonWords(c)).toBe('Yes, set it up');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: true, summary: 'Conference talk is set up.' });
    expect(mockState.createTodo).toHaveBeenNthCalledWith(1, {
      name: 'Draft the outline',
      due_day: THU,
      time_estimate_minutes: 45,
      views: { milestone: { goal: 'Conference talk', date: '2026-10-20' } },
    });
    expect(mockState.createTodo).toHaveBeenNthCalledWith(2, {
      name: 'Rehearse once',
      due_day: '2026-10-16',
      views: { milestone: { goal: 'Conference talk', date: '2026-10-20' } },
    });
    expect(mockDb.row.checkins).toEqual([
      {
        id: 'id-1',
        goal: 'Conference talk',
        goal_date: '2026-10-20',
        date: '2026-10-12',
        title: 'How is the draft going?',
        status: 'open',
      },
    ]);
    expect(useThisWeek.getState().review?.checkins).toHaveLength(1);
  });

  it('Undo takes the steps and the check ins away again, and no others', async () => {
    mockDb.row = {
      ...mockDb.row,
      checkins: [
        {
          id: 'kept',
          goal: 'Trip',
          goal_date: '2026-11-01',
          date: FRI,
          title: 'Booked?',
          status: 'open',
        },
      ],
    };
    useThisWeek.setState({ review: mockDb.row });
    const o = await applyChange(mile(), { source: 'thread' });
    expect(mockState.todos).toHaveLength(4);
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockState.todos.map((t: any) => t.id)).toEqual(['t1', 't2']);
    expect(mockDb.row.checkins.map((x: any) => x.id)).toEqual(['kept']);
  });

  it('is set up whole or not at all', async () => {
    mockState.createTodo
      .mockImplementationOnce(creator('todos', 'todo'))
      .mockImplementationOnce(async () => {
        throw new Error('offline');
      });
    const o = await applyChange(mile(), { source: 'thread' });
    expect(o).toMatchObject({ ok: false, reason: 'failed', message: 'offline' });
    expect(mockState.todos.map((t: any) => t.id)).toEqual(['t1', 't2']);
    expect(mockDb.row.checkins).toEqual([]);
  });

  it('needs no review when every step is a todo', async () => {
    useThisWeek.setState({ review: null });
    const c = mile({ ...milestone, steps: [milestone.steps[0]] });
    expect(rowWords(c, fixed)).toBe('Set up Conference talk for Tue 20 Oct: 1 step to do');
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({ ok: true });
    expect(changeWeekReview).not.toHaveBeenCalled();
  });
});

describe('the weekly day', () => {
  it('is saved with their settings, and Undo moves it back', async () => {
    const c = checked({ op: 'weekly_day', weekday: 3 });
    expect(rowWords(c, fixed)).toBe('Move your weekly review to Wednesdays');
    expect(buttonWords(c)).toBe('Yes, move it');
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: true, summary: 'Your weekly review is now on Wednesdays.' });
    expect(saveWeeklyDay).toHaveBeenCalledWith('u1', 3);
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(mockDb.weeklyDay).toBe(0);
    expect(useThisWeek.getState().weeklyDay).toBe(0);
  });

  it('the week they are in moves with it, so its review is read again', async () => {
    const c = checked({ op: 'weekly_day', weekday: 3 });
    const o = await applyChange(c, { source: 'thread' });
    // with Wednesday as the weekly day the week starts Thursday 8 October: Monday's review is not its review
    expect(getWeekReview).toHaveBeenLastCalledWith('u1', THU);
    expect(useThisWeek.getState().review).toBeNull();
    if (!o.ok) throw new Error('not applied');
    await o.revert();
    expect(getWeekReview).toHaveBeenLastCalledWith('u1', MON);
    expect(useThisWeek.getState().review?.id).toBe('r1');
  });

  it('leaves alone a weekly day they chose since the card was made', async () => {
    const c = checked({ op: 'weekly_day', weekday: 3 });
    useThisWeek.setState({ weeklyDay: 5 });
    expect(await applyChange(c, { source: 'thread' })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    expect(saveWeeklyDay).not.toHaveBeenCalled();
  });
});

describe('a card with several of them', () => {
  it('applies each, reports one that fails, and one Undo puts the rest back', async () => {
    const card: Change[] = [
      { ...checked({ op: 'later', type: 'todo', id: 't1', back_on: '2026-10-19' }), cid: 'c1' },
      { ...checked({ op: 'habit_days', type: 'habit', id: 'h1', days: [THU, SAT] }), cid: 'c2' },
      { ...checked({ op: 'week_shape', shape: { busy_days: [] } }), cid: 'c3' },
      { ...checked({ op: 'weekly_day', weekday: 3 }), cid: 'c4' },
    ];
    (saveWeeklyDay as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { outcomes, revertAll } = await applyChanges(card, { source: 'thread' });
    expect(outcomes.map((o) => o.ok)).toEqual([true, true, true, false]);
    expect(outcomes[3]).toMatchObject({ reason: 'failed', message: 'offline' });
    expect(useThisWeek.getState().weeklyDay).toBe(0);
    await revertAll();
    expect(todo('t1')).toMatchObject({ due_day: SAT, resurface_at: null });
    expect(runDays()).toEqual([MON, TODAY, SAT, '2026-10-12']);
    expect(mockDb.row.answers.busy_days).toEqual([FRI]);
  });
});
