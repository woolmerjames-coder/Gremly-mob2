/**
 * Applying the day turn's card: each change written the way the app writes
 * it, set times kept on today's thread, and what it means for the plan.
 */
import { applyDayChanges, changedEventText } from '../applyChanges';
import { useGremlyStore } from '../../store/useGremlyStore';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import { useTodayThread } from '../todayThread';
import type { DayChange } from '../../cortex/CortexClient';

jest.mock('../../store/useGremlyStore', () => ({ useGremlyStore: { getState: jest.fn() } }));
jest.mock('../../repo/dailyThreadRepo', () => ({ patchDailyThreadMeta: jest.fn() }));
jest.mock('../../minddrop/ids', () => ({ generateDropId: () => 'uuid-1' }));
jest.mock('../todayThread', () => ({ useTodayThread: { getState: jest.fn() } }));

const store = {
  createTodo: jest.fn(),
  updateTodo: jest.fn(),
  updateHabit: jest.fn(),
  completeTodo: jest.fn(),
  completeHabit: jest.fn(),
  archiveTodo: jest.fn(),
};
const patchMeta = jest.fn();

beforeEach(() => {
  for (const f of Object.values(store)) (f as jest.Mock).mockResolvedValue(undefined);
  store.createTodo.mockResolvedValue({ id: 'new-1' });
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
    expect(store.updateTodo).toHaveBeenCalledWith('mum', { due_time: '12:00' });
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
    expect(res).toEqual({
      done: ['c1', 'c2'],
      failed: [],
      plan: { add: [], remove: [], pin: [{ id: 'mum', start: 720 }] },
      frameChanged: true,
    });
  });

  it('moves, finishes and skips take items out of the plan', async () => {
    const res = await applyDayChanges(
      [
        change({ cid: 'c1', kind: 'move_day', id: 'mum', item: 'todo', day: '2026-10-05' }),
        change({ cid: 'c2', kind: 'skip_habit', id: 'run', item: 'habit' }),
      ],
      { ...ctx, inPlan: new Set(['mum', 'run']) },
    );
    expect(store.updateTodo).toHaveBeenCalledWith('mum', {
      due_day: '2026-10-05',
      scheduled_date: '2026-10-05',
    });
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
