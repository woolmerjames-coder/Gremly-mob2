import {
  candidateFromStore,
  lockPlanItems,
  placedOn,
  plannedTimePatch,
  poolForDay,
} from '../storePlan';
import { getDateService } from '../../date/DateService';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../../capacity/capacityTypes';
import type { PlanItem } from '../../brief/types';

const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  // a new object each read, as the store's state is after any update, so the
  // memoised selectors the pool reads are run again for each test
  useGremlyStore: { getState: () => ({ ...mockState }) },
}));
jest.mock('../../brief/feeding', () => ({
  withFeedAnimation: (credit: () => Promise<unknown>) => credit(),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ thread: null }) },
}));
jest.mock('../../brief/time', () => ({
  localMinutesToIso: (day: string, m: number) =>
    `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`,
  localDateOf: (iso: string) => iso.slice(0, 10),
}));

const item = (id: string, kind: PlanItem['kind'], start: number, extra = {}): PlanItem =>
  ({ id, kind, title: id, start, end: start + 30, ...extra }) as PlanItem;

beforeEach(() => {
  Object.assign(mockState, {
    todos: [],
    habits: [],
    timeBlockPreferences: DEFAULT_TIME_BLOCK_PREFERENCES,
    isFedToday: false,
    feedingGaugeValue: 0,
    createTodo: jest.fn(async (t: any) => ({ id: 'new-todo', ...t })),
    updateTodo: jest.fn(async () => undefined),
    updateHabit: jest.fn(async () => undefined),
    saveBrief: jest.fn(async () => undefined),
    creditPlanItems: jest.fn(async () => undefined),
    // the old Lock In: saying yes to a plan must never reach for it
    addCommitment: jest.fn(async () => undefined),
  });
});

describe('what a plan gave a time on a day', () => {
  it('is the todos and habits placed on that day, and nothing flagged the old way', () => {
    mockState.todos = [
      { id: 'deck', scheduled_start_iso: '2026-10-01T09:00:00' },
      { id: 'tomorrow', scheduled_start_iso: '2026-10-02T09:00:00' },
      { id: 'flagged', scheduled_start_iso: null, commitment: true },
    ];
    mockState.habits = [
      { id: 'run', scheduled_start_iso: '2026-10-01T18:00:00' },
      { id: 'until', scheduled_start_iso: null, commitment_until: '2026-10-09' },
    ];
    expect([...placedOn('2026-10-01')].sort()).toEqual(['deck', 'run']);
    expect([...placedOn('2026-10-02')]).toEqual(['tomorrow']);
  });
});

describe('an item asked for by id', () => {
  beforeEach(() => {
    mockState.todos = [{ id: 'deck', name: 'Finish the deck', time_estimate_minutes: 40 }];
    mockState.habits = [
      { id: 'run', name: 'Run', time_estimate_minutes: 30 },
      { id: 'sugar', name: 'No sugar', subtype: 'break_habit' },
    ];
    mockState.timeBlockPreferences = DEFAULT_TIME_BLOCK_PREFERENCES;
  });

  it('is a candidate for the plan when it is a todo or a habit they are building', () => {
    expect(candidateFromStore('deck', 'todo')).toMatchObject({
      id: 'deck',
      kind: 'todo',
      minutes: 40,
    });
    expect(candidateFromStore('run', 'habit')).toMatchObject({ id: 'run', kind: 'habit' });
  });

  it('is never one when it is a habit they are breaking, or is not there', () => {
    expect(candidateFromStore('sugar', 'habit')).toBeNull();
    expect(candidateFromStore('gone', 'todo')).toBeNull();
  });
});

describe('saying yes to a plan', () => {
  it('gives each item its time on the day, with no Lock In on any of them', async () => {
    const res = await lockPlanItems(
      '2026-10-01',
      [item('deck', 'todo', 9 * 60), item('run', 'habit', 18 * 60)],
      [],
    );
    expect(mockState.updateTodo).toHaveBeenCalledWith('deck', {
      daily_block: 'morning',
      scheduled_start_iso: '2026-10-01T09:00:00',
    });
    expect(mockState.updateHabit).toHaveBeenCalledWith('run', {
      daily_block: 'evening',
      scheduled_start_iso: '2026-10-01T18:00:00',
    });
    expect(mockState.addCommitment).not.toHaveBeenCalled();
    for (const call of [...mockState.updateTodo.mock.calls, ...mockState.updateHabit.mock.calls]) {
      expect(Object.keys(call[1]).some((k) => /commit|locked/.test(k))).toBe(false);
    }
    expect(res.items.map((x) => x.id)).toEqual(['deck', 'run']);
  });

  it('writes a planned start with the block it falls in, so the two never disagree', () => {
    expect(plannedTimePatch('2026-10-01', 9 * 60)).toEqual({
      daily_block: 'morning',
      scheduled_start_iso: '2026-10-01T09:00:00',
    });
    expect(plannedTimePatch('2026-10-01', 18 * 60 + 30)).toEqual({
      daily_block: 'evening',
      scheduled_start_iso: '2026-10-01T18:30:00',
    });
  });

  it('makes a suggestion into a todo due that day', async () => {
    const res = await lockPlanItems(
      '2026-10-01',
      [item('fact-1', 'reach', 10 * 60, { title: 'Book the car service', minutes: 15 })],
      [],
    );
    expect(mockState.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Book the car service', due_day: '2026-10-01' }),
    );
    expect(res.created).toEqual(['Book the car service']);
    expect(res.items[0]).toMatchObject({ id: 'new-todo', kind: 'todo' });
  });

  it('takes the time off what an earlier plan placed and this one leaves out', async () => {
    await lockPlanItems(
      '2026-10-01',
      [item('deck', 'todo', 9 * 60)],
      [item('deck', 'todo', 8 * 60), item('old', 'todo', 11 * 60), item('walk', 'habit', 12 * 60)],
    );
    const clear = { daily_block: null, scheduled_start_iso: null };
    expect(mockState.updateTodo).toHaveBeenCalledWith('old', clear);
    expect(mockState.updateHabit).toHaveBeenCalledWith('walk', clear);
    expect(mockState.updateTodo).not.toHaveBeenCalledWith('deck', clear);
  });

  it('writes the day row in time order and feeds for the items, whichever day the plan is for', async () => {
    await lockPlanItems(
      '2026-10-02',
      [item('late', 'todo', 19 * 60), item('early', 'todo', 9 * 60), item('run', 'habit', 13 * 60)],
      [],
    );
    expect(mockState.saveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-10-02',
        morning_sequence: [{ id: 'early', type: 'todo' }],
        day_sequence: [{ id: 'run', type: 'habit' }],
        evening_sequence: [{ id: 'late', type: 'todo' }],
      }),
    );
    expect(mockState.creditPlanItems).toHaveBeenCalledWith(3);
  });
});

describe('planning another day', () => {
  it("reads that day's todos and says each is due that day, not today", () => {
    const today = getDateService().ritualDay();
    const next = getDateService().addDays(today, 1);
    mockState.todos = [
      { id: 'a', name: 'Book the dentist', due_day: next },
      { id: 'b', name: 'Done already', due_day: next, completed_at: 'x' },
      { id: 'c', name: 'Due today', due_day: today },
    ];
    mockState.habits = [];
    mockState.habitProgress = [];
    const pool = poolForDay(next);
    expect(pool.map((c) => c.id)).toEqual(['a']);
    expect(pool[0].why).toMatch(/^Due (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/);
  });
});

describe('their own week in the pool', () => {
  const TODAY = '2026-09-30'; // a Wednesday
  const strength = {
    id: 'strength',
    name: 'Strength',
    subtype: 'start_habit',
    cadence: 'weekly',
    target_per_period: 3,
    start_date: '2026-09-01',
  };
  const log = (occurred_day: string) => ({ habit_id: 'strength', occurred_day, count: 1 });
  const lines = (day: string) => poolForDay(day).map((c) => [c.id, c.source, c.why]);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    Object.assign(mockState, {
      habits: [strength],
      // the Thursday before, and Monday
      habitProgress: [log('2026-09-24'), log('2026-09-28')],
      habitAdaptations: [],
      habitPlans: [],
      hiddenTodayIds: [],
      dco: null,
      weeklyDay: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts a Sunday person from Monday', () => {
    // one done since Monday, and Wednesday is day 3: on pace
    expect(lines(TODAY)).toEqual([['strength', 'habit', '1 of 3 this week']]);
  });

  it('counts a Wednesday person from Thursday', () => {
    mockState.weeklyDay = 3;
    // two done since Thursday, and Wednesday is the last day of their week: behind
    expect(lines(TODAY)).toEqual([['strength', 'behind', '2 of 3 this week, behind']]);
  });

  it('starts a plan for tomorrow in the week tomorrow is in', () => {
    mockState.habitProgress = [log('2026-09-24')];
    mockState.weeklyDay = 3;
    // Thursday is the first day of their next week, which has not begun: nothing is behind
    expect(lines('2026-10-01')).toEqual([]);
    // for a Sunday person Thursday is day 4 of the week they are in: 0 of 3 is behind
    mockState.weeklyDay = 0;
    expect(lines('2026-10-01')).toEqual([['strength', 'behind', '0 of 3 this week, behind']]);
  });

  it('leaves a paused habit out of today and of another day it is paused on', () => {
    mockState.habits = [strength, { id: 'walk', name: 'Walk', start_date: '2026-09-01' }];
    // nothing done since Monday: strength is behind on both days, and paused on the first
    mockState.habitProgress = [log('2026-09-24')];
    mockState.habitAdaptations = [
      { id: 'p1', habit_id: 'strength', mode: 'pause', period_start: TODAY, period_end: TODAY },
      {
        id: 'p2',
        habit_id: 'walk',
        mode: 'pause',
        period_start: '2026-10-01',
        period_end: '2026-10-01',
      },
    ];
    expect(lines(TODAY).map((c) => c[0])).toEqual(['walk']);
    expect(lines('2026-10-01').map((c) => c[0])).toEqual(['strength']);
  });
});
