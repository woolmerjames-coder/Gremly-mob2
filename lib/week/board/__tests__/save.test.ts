/**
 * Saving the week's board (lib/week/board/save.ts): each kind of write goes
 * through the store, what failed is counted, and one Undo puts everything
 * that was written back as it was.
 */
const mockStore: any = {};
jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockStore },
}));
// a day's move names no world or chapter, so the names are never looked up
jest.mock('../../../changes/apply', () => ({ nameLookup: () => ({}) }));

import { changeLogOf } from '../../../chat/changeHistory';
import { placeTodo, saveBoard } from '../save';

const MON = '2026-10-05';
const WED = '2026-10-07';
const SAT = '2026-10-10';

const todoOf = (id: string) => mockStore.todos.find((t: any) => t.id === id);

beforeEach(() => {
  mockStore.todos = [
    { id: 'boiler', name: 'Sort the boiler', due_day: null, resurface_at: null },
    {
      id: 'reports',
      name: 'Gather the grades',
      due_day: '2026-10-01',
      due_date: '2026-10-01',
      scheduled_date: '2026-10-01',
      sweep_reschedule_count: 2,
    },
    { id: 'present', name: 'Find a present', due_day: null, resurface_at: '2026-10-15' },
    { id: 'desk', name: 'Look at standing desks', due_day: MON, resurface_count: 1 },
    { id: 'done', name: 'Already done', completed_at: '2026-10-03T10:00:00Z' },
  ];
  mockStore.habitPlans = [{ habit_id: 'swim', planned_date: WED }];
  mockStore.updateTodo = jest.fn(async (id: string, patch: any) => {
    mockStore.todos = mockStore.todos.map((t: any) => (t.id === id ? { ...t, ...patch } : t));
  });
  mockStore.setHabitPlan = jest.fn(async (habitId: string, day: string) => {
    mockStore.habitPlans = [...mockStore.habitPlans, { habit_id: habitId, planned_date: day }];
  });
  mockStore.removeHabitPlan = jest.fn(async (habitId: string, day: string) => {
    mockStore.habitPlans = mockStore.habitPlans.filter(
      (p: any) => !(p.habit_id === habitId && p.planned_date === day),
    );
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('putting a todo on a day', () => {
  it('writes its day with the two dates that follow it, and puts it back as it was', async () => {
    const undo = await placeTodo(todoOf('boiler'), WED);
    expect(todoOf('boiler')).toMatchObject({
      due_day: WED,
      due_date: WED,
      scheduled_date: WED,
      resurface_at: null,
    });
    // it had no day before, so nothing counts it as moved
    expect(todoOf('boiler').sweep_reschedule_count).toBeUndefined();
    // the move is in its own history, as one made in today's thread
    const log = changeLogOf(todoOf('boiler').views);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ field: 'due_day', source: 'thread' });
    await undo();
    expect(todoOf('boiler')).toMatchObject({ due_day: null, resurface_at: null });
    expect(changeLogOf(todoOf('boiler').views)).toHaveLength(0);
  });

  it('counts a todo that already had a day as moved, and clears its day to come back', async () => {
    const undo = await placeTodo(todoOf('reports'), MON);
    expect(todoOf('reports')).toMatchObject({ due_day: MON, sweep_reschedule_count: 3 });
    await undo();
    expect(todoOf('reports')).toMatchObject({
      due_day: '2026-10-01',
      due_date: '2026-10-01',
      sweep_reschedule_count: 2,
    });
    const back = await placeTodo(todoOf('present'), SAT);
    expect(todoOf('present')).toMatchObject({ due_day: SAT, resurface_at: null });
    await back();
    expect(todoOf('present')).toMatchObject({ due_day: null, resurface_at: '2026-10-15' });
  });
});

describe('saving the board', () => {
  const diff = () => ({
    place: [
      { id: 'boiler', day: WED },
      { id: 'reports', day: MON },
      // done since the board was drawn: no longer the board's to move
      { id: 'done', day: SAT },
      { id: 'nobody', day: SAT },
    ],
    later: [{ id: 'desk', backOn: '2026-10-13' }],
    habits: [{ id: 'swim', add: [MON, SAT], remove: [WED] }],
  });

  it('writes every kind of change and says how many', async () => {
    const saved = await saveBoard(diff());
    expect(saved).toMatchObject({ todos: 2, later: 1, habitDays: 3, failed: 0 });
    expect(todoOf('boiler').due_day).toBe(WED);
    expect(todoOf('reports').due_day).toBe(MON);
    // put off: its day cleared, the day it comes back set, and counted
    expect(todoOf('desk')).toMatchObject({
      due_day: null,
      resurface_at: '2026-10-13',
      resurface_count: 2,
    });
    expect(todoOf('done').due_day).toBeUndefined();
    expect(mockStore.habitPlans.map((p: any) => p.planned_date).sort()).toEqual([MON, SAT]);
  });

  it('puts all of it back with one Undo', async () => {
    const before = JSON.parse(JSON.stringify(mockStore.todos));
    const saved = await saveBoard(diff());
    await saved.revert();
    for (const t of before) {
      const now = todoOf(t.id);
      expect(now.due_day ?? null).toBe(t.due_day ?? null);
      expect(now.resurface_at ?? null).toBe(t.resurface_at ?? null);
      expect(now.resurface_count ?? 0).toBe(t.resurface_count ?? 0);
    }
    expect(mockStore.habitPlans).toEqual([{ habit_id: 'swim', planned_date: WED }]);
  });

  it('counts a write that fails, and still hands back an Undo for what went through', async () => {
    mockStore.updateTodo = jest.fn(async (id: string, patch: any) => {
      if (id === 'reports') throw new Error('offline');
      mockStore.todos = mockStore.todos.map((t: any) => (t.id === id ? { ...t, ...patch } : t));
    });
    // the store's habit writers put their own change back and do not throw
    mockStore.setHabitPlan = jest.fn(async () => undefined);
    const saved = await saveBoard(diff());
    expect(saved).toMatchObject({ todos: 1, later: 1, habitDays: 1, failed: 3 });
    await saved.revert();
    expect(todoOf('boiler').due_day).toBeNull();
    expect(todoOf('desk')).toMatchObject({ due_day: MON, resurface_count: 1 });
    expect(mockStore.habitPlans).toEqual([]);
  });

  it('says so when part of it could not be put back', async () => {
    const saved = await saveBoard(diff());
    mockStore.updateTodo = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(saved.revert()).rejects.toThrow("3 of the week's changes could not be put back.");
  });

  it('writes nothing for a board that is as saved', async () => {
    const saved = await saveBoard({ place: [], later: [], habits: [] });
    expect(saved).toMatchObject({ todos: 0, later: 0, habitDays: 0, failed: 0 });
    expect(mockStore.updateTodo).not.toHaveBeenCalled();
    await saved.revert();
  });
});
