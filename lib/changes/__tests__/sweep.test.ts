/**
 * Sweep's decisions as changes (lib/changes/sweep): each one written as it is
 * made, with a record in the change model's shape and an Undo that puts the
 * item back exactly as it was.
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
jest.mock('../../minddrop/ids', () => ({ generateDropId: () => 'id-1' }));
jest.mock('../../notifications/ask', () => ({ maybeAsk: jest.fn(async () => true) }));
const mockInsert = jest.fn();
jest.mock('../../supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => mockInsert(...a) },
}));

import {
  applySweepDecision,
  sweepCounts,
  sweepDayWords,
  SWEEP_OPS,
  type SweepRecord,
} from '../sweep';
import { checkChange, OPS, TYPES } from '../model';
import { changeLogOf } from '../../chat/changeHistory';
import { getDateService } from '../../date/DateService';
import { maybeAsk } from '../../notifications/ask';

function updater(list: string) {
  return jest.fn(async (id: string, updates: any) => {
    mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...updates } : x));
  });
}
function flag(list: string, archived: boolean) {
  return jest.fn(async (id: string, reason?: string) => {
    mockState[list] = mockState[list].map((x: any) =>
      x.id === id ? { ...x, archived, archived_reason: archived ? (reason ?? null) : null } : x,
    );
  });
}
const todo = (id: string) => mockState.todos.find((t: any) => t.id === id);
const note = (id: string) => mockState.notes.find((n: any) => n.id === id);

const ds = getDateService();
let today = '';
let tomorrow = '';

beforeEach(() => {
  // midday, with a day that ends at 3am
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 30, 12, 0, 0));
  ds.setDayBoundaryHour(3);
  today = ds.ritualDay();
  tomorrow = ds.addDays(today, 1);
  Object.assign(mockState, {
    userId: 'u1',
    todos: [
      {
        id: 't1',
        name: 'Return the parcel',
        due_day: ds.addDays(today, -2),
        due_date: null,
        scheduled_date: ds.addDays(today, -2),
        skipped_in_sweep_at: '2026-09-28T20:00:00.000Z',
        resurface_at: null,
        sweep_reschedule_count: 1,
        reminders: [],
        views: {},
      },
      { id: 't2', name: 'Call the vet', due_day: tomorrow, views: {} },
    ],
    notes: [
      {
        id: 'n1',
        title: 'Try the new ramen place',
        subtype: 'idea',
        swept_at: null,
        skipped_in_sweep_at: null,
        resurface_at: null,
        resurface_count: 2,
        views: {},
      },
      {
        id: 'e1',
        title: 'Anniversary weekend',
        subtype: 'event',
        target_date: ds.addDays(today, 3),
        swept_at: null,
        reminders: [],
        views: {},
      },
    ],
    habits: [],
    habitProgress: [],
    worlds: [],
    chapters: [],
    dropWorldLinks: [],
    dropChapterLinks: [],
    updateTodo: updater('todos'),
    updateNote: updater('notes'),
    archiveTodo: flag('todos', true),
    restoreTodo: flag('todos', false),
    archiveNote: flag('notes', true),
    restoreNote: flag('notes', false),
    deleteTodo: jest.fn(async (id: string) => {
      mockState.todos = mockState.todos.filter((t: any) => t.id !== id);
    }),
  });
  (maybeAsk as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  ds.setDayBoundaryHour(0);
  jest.useRealTimers();
});

describe('a todo', () => {
  it('kept for a day is moved through the change model, with Sweep’s marks', async () => {
    const was = { ...todo('t1') };
    const out = await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'keep',
      dueDateStr: tomorrow,
    });
    if (!out.ok) throw new Error(out.message);
    expect(todo('t1')).toMatchObject({
      due_day: tomorrow,
      scheduled_date: tomorrow,
      skipped_in_sweep_at: null,
      resurface_at: null,
      sweep_reschedule_count: 2,
    });
    // the move is in the item's history, as coming from Sweep
    expect(changeLogOf(todo('t1').views).map((e) => [e.field, e.source])).toEqual([
      ['due_day', 'sweep'],
    ]);
    expect(out.record).toMatchObject({
      op: 'change',
      type: 'todo',
      id: 't1',
      title: 'Return the parcel',
      fields: { day: tomorrow },
      before: { day: was.due_day },
      out: 'kept',
      label: 'Tomorrow',
    });

    await out.revert();
    expect(todo('t1')).toMatchObject({
      due_day: was.due_day,
      scheduled_date: was.scheduled_date,
      skipped_in_sweep_at: was.skipped_in_sweep_at,
      sweep_reschedule_count: 1,
    });
    expect(changeLogOf(todo('t1').views)).toEqual([]);
  });

  it('kept for the day it already has only gets the marks', async () => {
    const out = await applySweepDecision({
      candidateId: 't2',
      candidateKind: 'todo',
      action: 'keep',
      dueDateStr: tomorrow,
    });
    if (!out.ok) throw new Error(out.message);
    expect(todo('t2')).toMatchObject({ due_day: tomorrow, sweep_reschedule_count: 1 });
    expect(changeLogOf(todo('t2').views)).toEqual([]);
    expect(out.record).toMatchObject({ op: 'change', fields: { day: tomorrow } });
    await out.revert();
    expect(todo('t2').sweep_reschedule_count).toBeNull();
  });

  it('kept with a reminder asks for notifications once and sets the reminder', async () => {
    const out = await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'keep',
      dueDateStr: tomorrow,
      reminderDateStr: today,
      reminderTime: '08:00',
    });
    if (!out.ok) throw new Error(out.message);
    expect(maybeAsk).toHaveBeenCalledWith('bell');
    expect(todo('t1').reminders).toEqual([
      expect.objectContaining({ time: '08:00', frequency: 'once', date: today }),
    ]);
    expect(out.record.fields).toEqual({ day: tomorrow, reminder_day: today });
    await out.revert();
    expect(todo('t1').reminders).toEqual([]);
  });

  it('kept as it is only clears the skipped mark', async () => {
    const out = await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'keep',
    });
    if (!out.ok) throw new Error(out.message);
    expect(todo('t1').skipped_in_sweep_at).toBeNull();
    expect(todo('t1').due_day).toBe(ds.addDays(today, -2));
    expect(out.record).toMatchObject({ op: 'keep', out: 'kept', label: 'Kept' });
    await out.revert();
    expect(todo('t1').skipped_in_sweep_at).toBe('2026-09-28T20:00:00.000Z');
  });

  it('let go is archived as swept, and Undo brings it back', async () => {
    const out = await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'clear',
    });
    if (!out.ok) throw new Error(out.message);
    expect(mockState.archiveTodo).toHaveBeenCalledWith('t1', 'swept');
    expect(todo('t1').archived).toBe(true);
    expect(out.record).toMatchObject({ op: 'archive', out: 'let_go', label: 'Let go' });
    await out.revert();
    expect(todo('t1').archived).toBe(false);
  });

  it('deleted from the wrong type menu keeps that reason', async () => {
    await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'clear',
      archiveReason: 'user_deleted',
    });
    expect(mockState.archiveTodo).toHaveBeenCalledWith('t1', 'user_deleted');
  });

  it('left for next time is marked skipped', async () => {
    const out = await applySweepDecision({
      candidateId: 't2',
      candidateKind: 'todo',
      action: 'skip',
    });
    if (!out.ok) throw new Error(out.message);
    expect(todo('t2').skipped_in_sweep_at).toBe(ds.nowTimestamp());
    expect(out.record).toMatchObject({ op: 'keep', out: 'left', label: 'Left for next time' });
    await out.revert();
    expect(todo('t2').skipped_in_sweep_at).toBeNull();
  });
});

describe('a note', () => {
  it('fine as it is is marked swept', async () => {
    const out = await applySweepDecision({
      candidateId: 'n1',
      candidateKind: 'note',
      action: 'keep',
      noteAction: 'fine',
      spaceId: 'sp1',
    });
    if (!out.ok) throw new Error(out.message);
    expect(note('n1')).toMatchObject({
      swept_at: ds.nowTimestamp(),
      skipped_in_sweep_at: null,
      resurface_at: null,
      space_id: 'sp1',
    });
    expect(out.record).toMatchObject({ op: 'keep', out: 'kept', label: 'Kept as it is' });
    await out.revert();
    expect(note('n1').swept_at).toBeNull();
    expect(note('n1').space_id).toBeNull();
  });

  it('brought back later gets its day, with no reminder', async () => {
    const day = ds.addDays(today, 14);
    const out = await applySweepDecision({
      candidateId: 'n1',
      candidateKind: 'note',
      action: 'keep',
      noteAction: 'resurface',
      resurfaceDateStr: day,
    });
    if (!out.ok) throw new Error(out.message);
    expect(note('n1')).toMatchObject({ resurface_at: day, resurface_count: 3 });
    expect(maybeAsk).not.toHaveBeenCalled();
    expect(out.record).toMatchObject({
      op: 'later',
      fields: { later: day },
      before: { later: null },
      label: 'Back in two weeks',
    });
    await out.revert();
    expect(note('n1')).toMatchObject({ resurface_at: null, resurface_count: 2, swept_at: null });
  });

  it('an event kept with a reminder and a todo to get ready, both undone together', async () => {
    mockInsert.mockReturnValue({
      insert: (row: any) => ({
        select: () => ({ single: async () => ({ data: { id: 'prep-1', ...row } }) }),
      }),
    });
    const before = ds.addDays(today, 2);
    const out = await applySweepDecision({
      candidateId: 'e1',
      candidateKind: 'note',
      action: 'keep',
      reminderDateStr: before,
      eventReminder: 'daybefore',
      prepTodoText: 'Book the restaurant',
    });
    if (!out.ok) throw new Error(out.message);
    expect(mockInsert).toHaveBeenCalledWith('todos');
    expect(todo('prep-1')).toMatchObject({
      name: 'Book the restaurant',
      origin: 'sweep',
      linked_event_id: 'e1',
      due_day: ds.addDays(today, 3),
    });
    expect(note('e1').reminders).toEqual([
      expect.objectContaining({ time: '09:00', frequency: 'once', date: before }),
    ]);
    expect(note('e1').swept_at).toBe(ds.nowTimestamp());
    expect(out.record).toMatchObject({ op: 'keep', fields: { reminder_day: before } });

    await out.revert();
    expect(todo('prep-1')).toBeUndefined();
    expect(note('e1').reminders).toEqual([]);
    expect(note('e1').swept_at).toBeNull();
  });

  it('let go is archived as swept', async () => {
    const out = await applySweepDecision({
      candidateId: 'n1',
      candidateKind: 'note',
      action: 'clear',
    });
    if (!out.ok) throw new Error(out.message);
    expect(mockState.archiveNote).toHaveBeenCalledWith('n1', 'swept');
    await out.revert();
    expect(note('n1').archived).toBe(false);
  });
});

describe('what cannot be saved', () => {
  it('an item that has gone is reported, not written', async () => {
    const out = await applySweepDecision({
      candidateId: 'nope',
      candidateKind: 'todo',
      action: 'keep',
    });
    expect(out).toMatchObject({ ok: false, reason: 'gone' });
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });

  it('a write that fails is reported, never claimed', async () => {
    mockState.updateTodo.mockRejectedValueOnce(new Error('offline'));
    const out = await applySweepDecision({
      candidateId: 't1',
      candidateKind: 'todo',
      action: 'keep',
    });
    expect(out).toMatchObject({ ok: false, reason: 'failed', message: 'offline' });
  });
});

describe('kept apart from what Gremly can propose', () => {
  it('keep and later are not operations on the general list every surface is offered', () => {
    for (const op of Object.keys(SWEEP_OPS)) {
      expect(op in OPS).toBe(false);
      for (const type of Object.values(TYPES)) expect(type.ops).not.toContain(op);
    }
  });

  it('keeping an item as it is cannot be proposed at all', () => {
    expect(checkChange({ op: 'keep', type: 'todo', id: 't1' }, { item: todo('t1') })).toEqual({
      ok: false,
      reason: 'unknown_op',
    });
  });

  it("putting one off is the weekly review's own change, dropped wherever the week is not known", () => {
    expect(checkChange({ op: 'later', type: 'todo', id: 't1' }, { item: todo('t1') })).toEqual({
      ok: false,
      reason: 'no_week',
    });
  });
});

describe('the receipt’s words for a day', () => {
  it('counts from their day', () => {
    expect(sweepDayWords(today)).toBe('Today');
    expect(sweepDayWords(tomorrow)).toBe('Tomorrow');
    // Wednesday 30 September: the Saturday after
    expect(sweepDayWords(ds.addDays(today, 3))).toBe('Saturday');
    expect(sweepDayWords(ds.addDays(today, 16))).toBe('16 Oct');
  });

  it('after midnight their day is still yesterday, and tomorrow is named', () => {
    // 12:30am on Thursday 1 October, with a day that ends at 3am
    jest.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));
    expect(ds.ritualDay()).toBe(today);
    expect(sweepDayWords(tomorrow)).toBe('Thursday');
    expect(sweepDayWords(today)).toBe('Today');
  });
});

describe('the receipt’s counts', () => {
  it('leave out what was put back', () => {
    const r = (out: SweepRecord['out'], undone = false): SweepRecord => ({
      cid: 's',
      op: 'keep',
      type: 'todo',
      id: 'x',
      title: 'X',
      out,
      label: '',
      at: '',
      undone_at: undone ? 'now' : null,
    });
    expect(sweepCounts([r('kept'), r('kept'), r('let_go'), r('left'), r('kept', true)])).toEqual({
      kept: 2,
      letGo: 1,
      left: 1,
      back: 1,
      decided: 3,
    });
  });
});
