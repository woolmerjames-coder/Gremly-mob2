/**
 * The change model's apply and Undo (lib/changes/apply): a habit's schedule
 * written whole, nothing overwritten that changed since, an item turned into
 * another kind, links, lists, tags, reminders, and one Undo for a card.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    setState: (fn: (s: any) => any) => Object.assign(mockState, fn(mockState)),
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

import { applyChange, applyChanges } from '../apply';
import { checkChange, type Change } from '../model';
import { contextFor } from '../snapshot';
import { rowWords, doneWords, scheduleWords } from '../words';
import { changeLogOf } from '../../chat/changeHistory';
import { upsertDropWorldLinks, deleteDropWorldLink } from '../../repo/linkingRepo';

function updater(list: string) {
  return jest.fn(async (id: string, updates: any) => {
    mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...updates } : x));
  });
}
function creator(list: string, type: string) {
  return jest.fn(async (row: any) => {
    const item = { id: `${type}-new`, type, ...row };
    mockState[list] = [...mockState[list], item];
    return item;
  });
}
function remover(list: string) {
  return jest.fn(async (id: string) => {
    mockState[list] = mockState[list].filter((x: any) => x.id !== id);
  });
}

beforeEach(() => {
  mockIds = 0;
  Object.assign(mockState, {
    userId: 'u1',
    todos: [
      { id: 't1', name: 'Dentist', due_day: '2026-10-02', due_time: '10:00', body: '', views: {} },
    ],
    habits: [
      {
        id: 'h1',
        name: 'Run',
        frequency: 'daily',
        cadence: 'daily',
        target_per_period: 1,
        views: {},
      },
    ],
    notes: [
      {
        id: 'n1',
        title: 'Packing',
        body: 'For the trip',
        subtype: 'catchall',
        list_items: [{ id: 'l1', text: 'Sunglasses', checked: false }],
        has_list: true,
        tags: ['travel'],
        views: { minddrop_stage: 'enriched' },
      },
    ],
    habitProgress: [],
    worlds: [{ id: 'w1', display_name: 'Health' }],
    chapters: [],
    dropWorldLinks: [{ drop_id: 'n1', world_id: 'w1' }],
    dropChapterLinks: [],
    updateTodo: updater('todos'),
    updateHabit: updater('habits'),
    updateNote: updater('notes'),
    createTodo: creator('todos', 'todo'),
    createHabit: creator('habits', 'habit'),
    createNote: creator('notes', 'note'),
    deleteTodo: remover('todos'),
    deleteHabit: remover('habits'),
    deleteNote: remover('notes'),
    archiveNote: jest.fn(async (id: string) => {
      mockState.notes = mockState.notes.map((n: any) =>
        n.id === id ? { ...n, archived: true } : n,
      );
    }),
    restoreNote: jest.fn(async (id: string) => {
      mockState.notes = mockState.notes.map((n: any) =>
        n.id === id ? { ...n, archived: false } : n,
      );
    }),
    setHabitTarget: jest.fn(async (id: string, cadence: string, target: number) => {
      await mockState.updateHabit(id, { cadence, target_per_period: target });
    }),
  });
});

/** A change as the card would hold it: checked against the store. */
function checked(raw: Record<string, any>): Change {
  const r = checkChange({ cid: 'c1', ...raw }, contextFor(raw));
  if (!r.ok) throw new Error(r.reason);
  return r.change;
}

const habit = () => mockState.habits[0];
const note = () => mockState.notes.find((n: any) => n.id === 'n1');

describe('a habit schedule', () => {
  it('writes the label, the tracking target and the days together, and Undo puts them back', async () => {
    const c = checked({
      op: 'change',
      type: 'habit',
      id: 'h1',
      fields: { schedule: { per: 'week', days: [1, 3, 5] } },
    });
    const o = await applyChange(c, { source: 'chat' });
    expect(o.ok).toBe(true);
    expect(mockState.setHabitTarget).toHaveBeenCalledWith('h1', 'weekly', 3);
    expect(habit()).toMatchObject({
      cadence: 'weekly',
      target_per_period: 3,
      frequency: '3x/week',
      days_active: [1, 3, 5],
      frequency_value: { type: 'days', days: [1, 3, 5] },
    });
    expect(changeLogOf(habit().views)[0]).toMatchObject({
      field: 'frequency',
      was: 'daily',
      now: 'on Mon, Wed and Fri',
    });
    if (o.ok) await o.revert();
    expect(habit()).toMatchObject({
      cadence: 'daily',
      target_per_period: 1,
      frequency: 'daily',
      days_active: null,
    });
    expect(changeLogOf(habit().views)).toEqual([]);
  });

  it('a label out of step is put right without moving the tracking target', async () => {
    mockState.habits[0] = { ...habit(), frequency: 'weekly' };
    const c = checked({
      op: 'change',
      type: 'habit',
      id: 'h1',
      fields: { schedule: { per: 'day', times: 1 } },
    });
    await applyChange(c, { source: 'chat' });
    expect(mockState.setHabitTarget).not.toHaveBeenCalled();
    expect(habit().frequency).toBe('daily');
  });
});

describe('a todo that was put off, given a day', () => {
  it('is no longer put off: its day to come back is cleared, and Undo puts it back', async () => {
    mockState.todos[0] = { ...mockState.todos[0], due_day: null, resurface_at: '2026-10-20' };
    const c = checked({ op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-08' } });
    const o = await applyChange(c, { source: 'thread' });
    expect(mockState.todos[0]).toMatchObject({ due_day: '2026-10-08', resurface_at: null });
    if (o.ok) await o.revert();
    expect(mockState.todos[0]).toMatchObject({ due_day: null, resurface_at: '2026-10-20' });
  });

  it('writes nothing about a back day for a todo that was never put off', async () => {
    const c = checked({ op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-08' } });
    await applyChange(c, { source: 'thread' });
    expect(mockState.updateTodo.mock.calls[0][1]).not.toHaveProperty('resurface_at');
  });
});

describe('nothing the person did since is overwritten', () => {
  it('leaves the item alone when a field moved after the card was drawn', async () => {
    const c = checked({ op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-05' } });
    mockState.todos[0] = { ...mockState.todos[0], due_day: '2026-10-03' };
    const o = await applyChange(c, { source: 'thread' });
    expect(o).toMatchObject({ ok: false, reason: 'stale' });
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });

  it('says so when the item is gone', async () => {
    const c = checked({ op: 'change', type: 'todo', id: 't1', fields: { time: '11:00' } });
    mockState.todos = [];
    expect(await applyChange(c, { source: 'chat' })).toMatchObject({
      ok: false,
      reason: 'gone',
      message: 'That todo is no longer here.',
    });
  });
});

describe('turning an item into another kind', () => {
  it('adds the new item with what carries over and its Worlds, archives the old one as converted, and Undo reverses it', async () => {
    const c = checked({
      op: 'convert',
      type: 'note',
      id: 'n1',
      to: 'todo',
      fields: { day: '2026-10-04' },
    });
    const o = await applyChange(c, { source: 'chat' });
    expect(o).toMatchObject({ ok: true, createdId: 'todo-new', summary: 'Packing is now a todo.' });
    expect(mockState.createTodo).toHaveBeenCalledWith({
      name: 'Packing',
      body: 'For the trip',
      due_day: '2026-10-04',
    });
    expect(upsertDropWorldLinks).toHaveBeenCalledWith([
      expect.objectContaining({ drop_id: 'todo-new', world_id: 'w1', drop_type: 'todo' }),
    ]);
    expect(note()).toMatchObject({
      archived: true,
      views: { converted_to_type: 'todo', converted_to_id: 'todo-new' },
    });
    if (o.ok) await o.revert();
    expect(mockState.todos.find((t: any) => t.id === 'todo-new')).toBeUndefined();
    expect(note().archived).toBe(false);
    expect(note().views).toEqual({ minddrop_stage: 'enriched' });
  });
});

describe('the rest of the fields', () => {
  it('ticks and adds list items, and Undo puts the list back', async () => {
    const c = checked({
      op: 'change',
      type: 'note',
      id: 'n1',
      fields: { list: { add: ['Charger'], tick: ['l1'] } },
    });
    const o = await applyChange(c, { source: 'chat' });
    expect(note().list_items).toEqual([
      { id: 'l1', text: 'Sunglasses', checked: true },
      { id: 'id-1', text: 'Charger', checked: false },
    ]);
    if (o.ok) await o.revert();
    expect(note().list_items).toEqual([{ id: 'l1', text: 'Sunglasses', checked: false }]);
  });

  it('tags, pins and unlinks a World in one change', async () => {
    const c = checked({
      op: 'change',
      type: 'note',
      id: 'n1',
      fields: { tags: { add: ['packing'] }, pinned: true, worlds: { remove: ['w1'] } },
    });
    const o = await applyChange(c, { source: 'chat' });
    expect(note()).toMatchObject({ tags: ['travel', 'packing'], is_pinned: true });
    expect(deleteDropWorldLink).toHaveBeenCalledWith('n1', 'w1');
    expect(mockState.dropWorldLinks).toEqual([]);
    if (o.ok) await o.revert();
    expect(note()).toMatchObject({ tags: ['travel'], is_pinned: null });
    expect(mockState.dropWorldLinks).toEqual([
      expect.objectContaining({ drop_id: 'n1', world_id: 'w1' }),
    ]);
  });

  it('adds a reminder in the shape the server sends', async () => {
    const c = checked({
      op: 'change',
      type: 'todo',
      id: 't1',
      fields: { reminder: { add: [{ time: '08:30', day: '2026-10-02' }] } },
    });
    await applyChange(c, { source: 'chat' });
    expect(mockState.todos[0].reminders).toEqual([
      { id: 'id-1', time: '08:30', frequency: 'once', date: '2026-10-02' },
    ]);
  });
});

describe('a card', () => {
  it('applies in order and one Undo takes everything back, newest first', async () => {
    const changes = [
      checked({
        op: 'change',
        type: 'todo',
        id: 't1',
        fields: { day: '2026-10-03', time: '15:00' },
      }),
      {
        ...checked({ op: 'add', type: 'todo', fields: { name: 'Pack', day: '2026-10-03' } }),
        cid: 'c2',
      },
    ];
    const { outcomes, revertAll } = await applyChanges(changes, { source: 'thread' });
    expect(outcomes.map((o) => o.ok)).toEqual([true, true]);
    expect(mockState.todos[0]).toMatchObject({ due_day: '2026-10-03', due_time: '15:00' });
    expect(changeLogOf(mockState.todos[0].views)).toHaveLength(1);
    await revertAll();
    expect(mockState.todos).toHaveLength(1);
    expect(mockState.todos[0]).toMatchObject({ due_day: '2026-10-02', due_time: '10:00' });
  });
});

describe('the words', () => {
  it('reads a row, and a closing line that names the date', () => {
    const move = checked({
      op: 'change',
      type: 'todo',
      id: 't1',
      fields: { day: '2026-10-05', time: '15:00' },
    });
    expect(
      rowWords(
        checked({ op: 'plan', title: 'Plan the rest of today', plan: { kind: 'plan_day' } } as any),
      ),
    ).toBe('Plan the rest of today');
    // a moved item's row says where it was as well as where it goes
    expect(rowWords(move, { relative: false })).toBe(
      'Move Dentist from Fri 2 Oct, 10:00am to Mon 5 Oct, 3:00pm',
    );
    expect(
      rowWords(
        { ...move, fields: { day: '2026-10-05' }, before: { day: '2026-10-03' } },
        { relative: false },
      ),
    ).toBe('Move Dentist from Sat 3 Oct to Mon 5 Oct');
    expect(rowWords({ ...move, before: {} }, { relative: false })).toBe(
      'Move Dentist to Mon 5 Oct, 3:00pm',
    );
    expect(doneWords(move)).toBe('Dentist is now Mon 5 Oct, 3:00pm.');
    expect(rowWords(checked({ op: 'convert', type: 'note', id: 'n1', to: 'habit' }))).toBe(
      'Turn Packing into a habit',
    );
    expect(scheduleWords({ per: 'week', times: 3 })).toBe('3 times a week');
    expect(scheduleWords({ per: 'day', times: 1 })).toBe('every day');
  });
});
