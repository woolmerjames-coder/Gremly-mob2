/**
 * Applying the day turn's card: each change goes through the change model
 * (lib/changes), set times are kept on today's thread, field changes go into
 * the item's history, everything can be undone, and what it means for the
 * plan is handed back.
 */
import { applyCardChanges, applyDayChanges, changedEventText } from '../applyChanges';
import type { Change } from '../../changes/model';
import { useGremlyStore } from '../../store/useGremlyStore';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import { useTodayThread } from '../todayThread';
import type { DayChange } from '../../cortex/CortexClient';
import { changeLogOf } from '../../chat/changeHistory';

jest.mock('../../store/useGremlyStore', () => ({ useGremlyStore: { getState: jest.fn() } }));
jest.mock('../../repo/dailyThreadRepo', () => ({ patchDailyThreadMeta: jest.fn() }));
jest.mock('../../minddrop/ids', () => ({ generateDropId: () => 'uuid-1' }));
jest.mock('../todayThread', () => ({ useTodayThread: { getState: jest.fn() } }));

const store: any = {
  createTodo: jest.fn(),
  updateTodo: jest.fn(),
  updateHabit: jest.fn(),
  completeTodo: jest.fn(),
  uncompleteTodo: jest.fn(),
  completeHabit: jest.fn(),
  archiveTodo: jest.fn(),
  restoreTodo: jest.fn(),
  deleteTodo: jest.fn(),
};
const patchMeta = jest.fn();

beforeEach(() => {
  for (const f of Object.values(store)) {
    if (typeof f === 'function') (f as jest.Mock).mockResolvedValue(undefined);
  }
  store.createTodo.mockResolvedValue({ id: 'new-1' });
  // the items the card is about, as the store has them
  store.todos = [
    { id: 'mum', name: 'Call Mum', due_day: '2026-10-02', due_time: null, views: {} },
    { id: 'deck', name: 'Finish the deck', due_day: '2026-10-02', views: {} },
  ];
  store.habits = [{ id: 'run', name: 'Run', cadence: 'daily', target_per_period: 1 }];
  store.notes = [];
  store.habitProgress = [];
  store.updateTodo.mockImplementation(async (id: string, updates: any) => {
    store.todos = store.todos.map((t: any) => (t.id === id ? { ...t, ...updates } : t));
  });
  (useGremlyStore.getState as jest.Mock).mockReturnValue(store);
  (patchDailyThreadMeta as jest.Mock).mockResolvedValue(null);
  (useTodayThread.getState as jest.Mock).mockReturnValue({
    thread: { id: 't1', metadata_json: { ritual_day: '2026-10-02', fixed_blocks: [] } },
    patchMeta,
  });
});

const ctx = { date: '2026-10-02', threadId: 't1', inPlan: new Set(['mum']), hasPlan: true };
const change = (c: Partial<DayChange> & Pick<DayChange, 'kind'>): DayChange =>
  ({ cid: 'c1', label: '', title: '', ...c }) as DayChange;

describe('applying the change card', () => {
  it('2 October: Call Mum at 12 and leaving for the airport at 12:30', async () => {
    const res = await applyDayChanges(
      [
        change({
          cid: 'c1',
          kind: 'retime',
          id: 'mum',
          item: 'todo',
          title: 'Call Mum',
          start: 720,
          day: '2026-10-02',
        }),
        change({
          cid: 'c2',
          kind: 'add_block',
          title: 'Leave for the airport',
          start: 750,
          travel: true,
        }),
      ],
      ctx,
    );
    expect(store.updateTodo).toHaveBeenCalledWith(
      'mum',
      expect.objectContaining({ due_time: '12:00' }),
    );
    // into the item's history, from today's thread
    expect(changeLogOf(store.todos[0].views)[0]).toMatchObject({
      field: 'due_time',
      source: 'thread',
      now: 'Fri 2 Oct, 12:00pm',
    });
    const block = {
      id: 'chat:uuid-1',
      title: 'Leave for the airport',
      start: 750,
      end: null,
      travel: true,
    };
    expect(patchDailyThreadMeta).toHaveBeenCalledWith('t1', {
      fixed_blocks: [block],
      fixed_removed: [],
      skipped_habits: [],
    });
    expect(patchMeta).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ fixed_blocks: [block] }),
    );
    expect(res).toMatchObject({
      done: ['c1', 'c2'],
      failed: [],
      plan: { add: [], remove: [], pin: [{ id: 'mum', start: 720 }] },
      frameChanged: true,
    });
  });

  it('one Undo puts the card back: the time, its history line and the set times', async () => {
    const res = await applyDayChanges(
      [
        change({
          cid: 'c1',
          kind: 'retime',
          id: 'mum',
          item: 'todo',
          title: 'Call Mum',
          start: 720,
        }),
        change({ cid: 'c2', kind: 'add_block', title: 'Leave for the airport', start: 750 }),
      ],
      ctx,
    );
    await res.revert();
    expect(store.todos[0].due_time).toBeNull();
    expect(changeLogOf(store.todos[0].views)).toEqual([]);
    expect(patchDailyThreadMeta).toHaveBeenLastCalledWith('t1', {
      fixed_blocks: [],
      fixed_removed: [],
      skipped_habits: [],
    });
  });

  it('a change to an item that is gone is not claimed', async () => {
    const res = await applyDayChanges(
      [change({ cid: 'c1', kind: 'rename', id: 'nope', item: 'todo', title: 'Ghost' })],
      ctx,
    );
    expect(res).toMatchObject({ done: [], failed: ['c1'] });
  });

  it('moves, finishes and skips take items out of the plan', async () => {
    const res = await applyDayChanges(
      [
        change({ cid: 'c1', kind: 'move_day', id: 'mum', item: 'todo', day: '2026-10-05' }),
        change({ cid: 'c2', kind: 'skip_habit', id: 'run', item: 'habit' }),
      ],
      { ...ctx, inPlan: new Set(['mum', 'run']) },
    );
    expect(store.updateTodo).toHaveBeenCalledWith(
      'mum',
      expect.objectContaining({
        due_day: '2026-10-05',
        due_date: '2026-10-05',
        scheduled_date: '2026-10-05',
      }),
    );
    expect(res.plan.remove).toEqual(['mum', 'run']);
    expect(patchDailyThreadMeta).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ skipped_habits: ['run'] }),
    );
  });

  it('a new todo with a time today joins the plan at that time', async () => {
    const res = await applyDayChanges(
      [change({ kind: 'create_todo', title: 'Pack', day: '2026-10-02', start: 600, minutes: 20 })],
      ctx,
    );
    expect(store.createTodo).toHaveBeenCalledWith({
      name: 'Pack',
      due_day: '2026-10-02',
      due_time: '10:00',
      time_estimate_minutes: 20,
    });
    expect(res.plan.add).toEqual([{ id: 'new-1', kind: 'todo', start: 600, minutes: 20 }]);
  });

  it('a change that fails is reported, not claimed', async () => {
    store.archiveTodo.mockRejectedValueOnce(new Error('offline'));
    const res = await applyDayChanges(
      [
        change({ cid: 'c1', kind: 'cancel', id: 'deck', item: 'todo' }),
        change({ cid: 'c2', kind: 'complete', id: 'mum', item: 'todo' }),
      ],
      ctx,
    );
    expect(res.done).toEqual(['c2']);
    expect(res.failed).toEqual(['c1']);
  });

  it('set times that could not be saved are not done', async () => {
    (patchDailyThreadMeta as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const res = await applyDayChanges(
      [change({ cid: 'c1', kind: 'add_block', title: 'Pick up Bella', start: 900 })],
      ctx,
    );
    expect(res).toMatchObject({ done: [], failed: ['c1'], frameChanged: false });
  });

  it('counts what was updated', () => {
    expect(changedEventText(1)).toBe('Updated 1 thing');
    expect(changedEventText(3)).toBe('Updated 3 things');
  });
});

describe("applying the agent's card", () => {
  it('writes each row and works out what each means for the plan', async () => {
    const card = [
      {
        cid: 'c1',
        op: 'change',
        type: 'todo',
        id: 'mum',
        title: 'Call Mum',
        fields: { time: '12:00' },
        before: { time: null },
      },
      {
        cid: 'c2',
        op: 'plan',
        type: null,
        id: null,
        title: 'Leave for the airport',
        plan: {
          kind: 'add_block',
          start: 750,
          end: null,
          travel: true,
          title: 'Leave for the airport',
        },
      },
      {
        cid: 'c3',
        op: 'add',
        type: 'todo',
        id: null,
        title: 'Buy sunscreen',
        fields: { name: 'Buy sunscreen', day: '2026-10-02', time: '15:00' },
        before: {},
      },
      {
        cid: 'c4',
        op: 'plan',
        type: 'habit',
        id: 'run',
        title: 'Run',
        plan: {
          kind: 'plan_add',
          id: 'run',
          item: 'habit',
          start: null,
          minutes: 30,
          title: 'Run',
        },
      },
    ] as Change[];
    const res = await applyCardChanges(card, ctx);
    expect(res.done).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(res.failed).toEqual([]);
    expect(res.plan).toEqual({
      add: [
        { id: 'new-1', kind: 'todo', start: 900, minutes: null },
        { id: 'run', kind: 'habit', start: null, minutes: 30 },
      ],
      remove: [],
      pin: [{ id: 'mum', start: 720 }],
    });
    expect(res.frameChanged).toBe(true);
  });

  it('a new day takes an item out of the plan; what is not in the plan stays out of it', async () => {
    const card = [
      {
        cid: 'c1',
        op: 'change',
        type: 'todo',
        id: 'mum',
        title: 'Call Mum',
        fields: { day: '2026-10-03' },
        before: { day: '2026-10-02' },
      },
      { cid: 'c2', op: 'done', type: 'todo', id: 'deck', title: 'Finish the deck' },
      {
        cid: 'c3',
        op: 'change',
        type: 'todo',
        id: 'deck',
        title: 'Finish the deck',
        fields: { time: '16:00' },
        before: { time: null },
      },
    ] as Change[];
    const res = await applyCardChanges(card, { ...ctx, inPlan: new Set(['mum']) });
    expect(res.plan.remove).toEqual(['mum']);
    expect(res.plan.pin).toEqual([]);
  });
});
