import { lockPlanItems, placedOn } from '../storePlan';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../../capacity/capacityTypes';
import type { PlanItem } from '../../brief/types';

const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
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
