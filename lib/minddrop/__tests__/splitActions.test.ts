/**
 * splitActions: a drop with several things in it (Mind Drop rethink stage 7).
 *
 * - Split on an unsure split's card saves its pieces where the card was,
 *   archives the one item ('split'), fills each piece and logs the answer.
 * - Keep as one on an unsure split keeps the one item; under a clear split's
 *   pieces it saves one note with the drop's words and archives the pieces
 *   ('kept_as_one').
 * - Each piece gets its own details and title, settles by the deadline, and
 *   is checked against what they have only when the whole drop's check found
 *   something.
 * - The telemetry carries what the classifier said and what was tapped, and
 *   no words.
 */
import type { QueuedDrop, SavedPieceRow } from '../dropQueue';

const mockState: Record<string, any> = { todos: [], habits: [], notes: [] };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../dropSync', () => ({
  attachDropRelation: jest.fn(),
  detailBaseOf: jest.fn(),
  kindWordOf: jest.requireActual('../dropSync').kindWordOf,
  insertSplitPieces: jest.fn(),
  settleDropRow: jest.fn(),
  syncDropToSupabase: jest.fn(),
  updateDropDetails: jest.fn(),
  updateDropRow: jest.fn(),
  updateDropWords: jest.fn(),
}));
jest.mock('../dropDetails', () => ({ startDropDetails: jest.fn(), startDropReminder: jest.fn() }));
jest.mock('../dropReminder', () => ({ scheduleDropReminder: jest.fn() }));
jest.mock('../dropWords', () => ({ dropWordsFor: jest.fn() }));
jest.mock('../relationActions', () => ({
  dropRelationFor: jest.fn(),
  heldRelationFor: jest.fn(),
  shouldRelate: jest.fn(),
  startedDropRelation: jest.fn(),
}));
jest.mock('../fileDrop', () => ({ startDropFiling: jest.fn() }));
jest.mock('../../appEvents', () => ({ logAppEvent: jest.fn() }));

import {
  fillPieces,
  keepPiecesAsOne,
  keepSplitAsOne,
  keptGroupsNow,
  logSplitAnswer,
  numberWord,
  piecesOf,
  splitDropNow,
} from '../splitActions';
import {
  attachDropRelation,
  insertSplitPieces,
  settleDropRow,
  syncDropToSupabase,
  updateDropDetails,
  updateDropRow,
  updateDropWords,
} from '../dropSync';
import { startDropDetails, startDropReminder } from '../dropDetails';
import { scheduleDropReminder } from '../dropReminder';
import { DIDNT_GO } from '../plainError';
import { dropWordsFor } from '../dropWords';
import {
  dropRelationFor,
  heldRelationFor,
  shouldRelate,
  startedDropRelation,
} from '../relationActions';
import { startDropFiling } from '../fileDrop';
import { logAppEvent } from '../../appEvents';

type Call<T> = { promise: Promise<T | null>; done: boolean; value: T | null };
const answered = <T>(value: T): Call<T> => ({ promise: Promise.resolve(value), done: true, value });
function later<T>(): Call<T> & { land: (v: T) => void } {
  let land: (v: T) => void = () => {};
  const call = {
    promise: new Promise<T | null>((r) => {
      land = r;
    }),
    done: false,
    value: null,
  } as Call<T> & { land: (v: T) => void };
  call.land = (v: T) => land(v);
  return call;
}

const flush = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** The row as the database holds it, for updateDropRow's build. */
let rows: Record<string, Record<string, any>> = {};
const patches: Array<{ id: string; what: string; patch: Record<string, unknown> | null }> = [];

const DETAILS = { tags: [], time_estimate_minutes: 20 };
const WORDS = { smartTitle: 'Clean out the garage', reaction: 'Brave.' };

beforeEach(() => {
  rows = {};
  patches.length = 0;
  keptGroupsNow.clear();
  mockState.todos = [];
  mockState.habits = [];
  mockState.notes = [];
  mockState.archiveTodo = jest.fn().mockResolvedValue(undefined);
  mockState.archiveHabit = jest.fn().mockResolvedValue(undefined);
  mockState.archiveNote = jest.fn().mockResolvedValue(undefined);
  mockState.deleteTodo = jest.fn().mockResolvedValue(undefined);
  mockState.deleteHabit = jest.fn().mockResolvedValue(undefined);
  mockState.deleteNote = jest.fn().mockResolvedValue(undefined);
  (startedDropRelation as jest.Mock).mockReturnValue(null);
  (updateDropRow as jest.Mock).mockImplementation(
    async (_kind: string, id: string, what: string, build: (row: any) => any) => {
      const patch = build(rows[id] ?? {});
      patches.push({ id, what, patch });
      if (!patch) return false;
      rows[id] = { ...(rows[id] ?? {}), ...patch };
      return true;
    },
  );
  (settleDropRow as jest.Mock).mockResolvedValue(true);
  (updateDropDetails as jest.Mock).mockResolvedValue(true);
  (updateDropWords as jest.Mock).mockResolvedValue(true);
  (attachDropRelation as jest.Mock).mockResolvedValue('card');
  (startDropDetails as jest.Mock).mockImplementation(() => answered(DETAILS));
  (dropWordsFor as jest.Mock).mockImplementation(() => answered(WORDS));
  (shouldRelate as jest.Mock).mockReturnValue(true);
  (dropRelationFor as jest.Mock).mockImplementation(() => answered(null));
  (heldRelationFor as jest.Mock).mockImplementation((_d, r) => ({ ...r, status: 'pending' }));
  (startDropFiling as jest.Mock).mockImplementation(() => answered(null));
  (startDropReminder as jest.Mock).mockReturnValue(null);
  (scheduleDropReminder as jest.Mock).mockResolvedValue(undefined);
  (logAppEvent as jest.Mock).mockResolvedValue(undefined);
});

const piece = (index: number, over: Partial<SavedPieceRow> = {}): SavedPieceRow =>
  ({
    entityType: 'todo',
    id: `p${index}`,
    dropId: `split-d1-${index}`,
    index,
    text: index === 0 ? 'clean out the garage' : 'sort the donations pile',
    title: index === 0 ? 'Clean out the garage' : 'Sort the donations pile',
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    ...over,
  }) as SavedPieceRow;

const parentDrop = {
  localId: 'd1',
  text: 'clean out the garage and sort the donations pile',
  source: 'minddrop',
  classifyEngine: 'v3',
  createdAt: '2026-10-09T09:00:00Z',
  status: 'queued',
  phase: 'saved',
  retryCount: 0,
  spaceId: null,
} as unknown as QueuedDrop;

describe('the words', () => {
  it('says the number of pieces in words', () => {
    expect(numberWord(2)).toBe('two');
    expect(numberWord(3)).toBe('three');
    expect(numberWord(12)).toBe('12');
  });

  it('logs what the classifier said and what was tapped, and no words', () => {
    logSplitAnswer('unsure', 'not_now', 2, { type: 'todo', id: 't1' });
    expect(logAppEvent).toHaveBeenCalledWith(
      'split_answer',
      { type: 'todo', id: 't1' },
      { said: 'unsure', tapped: 'not_now', pieces: 2 },
    );
  });
});

describe('each piece is filled on its own', () => {
  it('gets its own details and title, and settles with them', async () => {
    await expect(
      fillPieces(parentDrop, [piece(0), piece(1)], {
        deadline: Date.now() + 200,
        related: false,
      }),
    ).resolves.toBe('in_time');
    const detailed = (updateDropDetails as jest.Mock).mock.calls.map((c) => [c[0].id, c[3].settle]);
    expect(detailed).toEqual([
      ['p0', true],
      ['p1', true],
    ]);
    // the title call's reaction is not shown on a piece
    expect((updateDropWords as jest.Mock).mock.calls[0][1]).toEqual({
      smartTitle: 'Clean out the garage',
      reaction: null,
    });
    // each piece's calls are its own
    expect((startDropDetails as jest.Mock).mock.calls.map((c) => c[0].localId)).toEqual([
      'split-d1-0',
      'split-d1-1',
    ]);
  });

  it('each piece is filed where it lives as it is filled, and the settle waits for it (stage 9)', async () => {
    const late = later<null>();
    (startDropFiling as jest.Mock).mockImplementation((d: { localId: string }) =>
      d.localId === 'split-d1-1' ? late : answered(null),
    );
    let settledAt = 0;
    const filled = fillPieces(parentDrop, [piece(0), piece(1)], {
      deadline: Date.now() + 200,
      related: false,
    }).then(() => (settledAt = Date.now()));
    await flush();
    expect(
      (startDropFiling as jest.Mock).mock.calls.map((c) => [c[0].localId, c[0].supabaseId]),
    ).toEqual([
      ['split-d1-0', 'p0'],
      ['split-d1-1', 'p1'],
    ]);
    // the second piece waits for its place
    expect(settledAt).toBe(0);
    late.land(null);
    await filled;
    expect(settledAt).toBeGreaterThan(0);
  });

  it('a remind me on the drop: each piece that does not ask gets its own reminder call, saved when it lands', async () => {
    const reminder = { auto_reminder: true, reminder_date: '2026-10-12', reminder_time: '09:00' };
    (startDropReminder as jest.Mock).mockImplementation((d: QueuedDrop) =>
      d.reminderIntent ? answered(reminder) : null,
    );
    await fillPieces(
      { ...parentDrop, reminderIntent: true },
      [piece(0), piece(1, { asks: true })],
      { deadline: Date.now() + 200, related: false },
    );
    await flush();
    expect((startDropReminder as jest.Mock).mock.calls.map((c) => c[0].localId)).toEqual([
      'split-d1-0',
    ]);
    expect(scheduleDropReminder).toHaveBeenCalledWith({ entityType: 'todo', id: 'p0' }, reminder);
  });

  it('a piece that asks keeps its question and gets no details call', async () => {
    await fillPieces(parentDrop, [piece(0), piece(1, { asks: true })], {
      deadline: Date.now() + 200,
      related: false,
    });
    expect(startDropDetails).toHaveBeenCalledTimes(1);
    await expect(
      fillPieces(parentDrop, [piece(1, { asks: true })], {
        deadline: Date.now() + 200,
        related: false,
      }),
    ).resolves.toBe('not_asked');
    expect((updateDropDetails as jest.Mock).mock.calls.map((c) => c[0].id)).toEqual(['p0']);
  });

  it('settles by the deadline when its details are late, and writes them when they land', async () => {
    const late = later<typeof DETAILS>();
    (startDropDetails as jest.Mock).mockImplementation(() => late);
    await expect(
      fillPieces(parentDrop, [piece(0)], { deadline: Date.now() + 30, related: false }),
    ).resolves.toBe('after_settle');
    expect(settleDropRow).toHaveBeenCalledWith({ entityType: 'todo', id: 'p0' });
    expect(updateDropDetails).not.toHaveBeenCalled();
    late.land(DETAILS);
    await flush();
    expect((updateDropDetails as jest.Mock).mock.calls[0][3].settle).toBe(false);
  });

  it('checks a piece against what they have only when the whole drop found something', async () => {
    await fillPieces(parentDrop, [piece(0), piece(1)], {
      deadline: Date.now() + 200,
      related: false,
    });
    expect(dropRelationFor).not.toHaveBeenCalled();

    (dropRelationFor as jest.Mock).mockImplementation(() =>
      answered({ kind: 'same', entity: { id: 'old', type: 'todo', title: 'Garage' } }),
    );
    await fillPieces(parentDrop, [piece(0), piece(1)], {
      deadline: Date.now() + 200,
      related: Promise.resolve(true),
    });
    await flush();
    expect((dropRelationFor as jest.Mock).mock.calls.map((c) => c[0].text)).toEqual([
      'clean out the garage',
      'sort the donations pile',
    ]);
    expect((attachDropRelation as jest.Mock).mock.calls.map((c) => c[0].id).sort()).toEqual([
      'p0',
      'p1',
    ]);
  });
});

describe('Split, on an unsure split’s card', () => {
  const item = {
    id: 't9',
    drop_id: 'd9',
    name: 'Clean out the garage and sort the donations',
    body: 'clean out the garage and sort the donations pile',
    created_at: '2026-10-09T08:00:00Z',
    views: {
      split: {
        status: 'pending',
        related: false,
        pieces: [
          { text: 'clean out the garage', kind: 'todo', bucket: 'todo', subtype: null },
          { text: 'sort the donations pile', kind: 'todo', bucket: 'todo', subtype: null },
        ],
      },
    },
  };

  beforeEach(() => {
    mockState.todos = [item];
    rows.t9 = { ...item };
    (insertSplitPieces as jest.Mock).mockResolvedValue([piece(0), piece(1)]);
  });

  it('saves the pieces where the card was, archives the one item, logs it and fills each piece', async () => {
    await splitDropNow('t9');
    expect(patches[0]).toMatchObject({ id: 't9', what: 'split_now' });
    expect(rows.t9.views.split.status).toBe('split');
    const [parent, opts] = (insertSplitPieces as jest.Mock).mock.calls[0];
    expect(opts).toEqual({ said: 'unsure', at: '2026-10-09T08:00:00Z' });
    expect(parent).toMatchObject({ localId: 'd9', text: item.body });
    expect(parent.multiSegments.map((s: any) => s.text)).toEqual([
      'clean out the garage',
      'sort the donations pile',
    ]);
    expect(mockState.archiveTodo).toHaveBeenCalledWith('t9', 'split');
    expect(logAppEvent).toHaveBeenCalledWith(
      'split_answer',
      { type: 'todo', id: 't9' },
      { said: 'unsure', tapped: 'split', pieces: 2 },
    );
    await flush();
    expect((updateDropDetails as jest.Mock).mock.calls.map((c) => c[0].id).sort()).toEqual([
      'p0',
      'p1',
    ]);
    // then each piece finds its own place, as a drop's item does
    expect((startDropFiling as jest.Mock).mock.calls.map((c) => c[0].supabaseId)).toEqual([
      'p0',
      'p1',
    ]);
  });

  it('carries a remind me and the item’s kind over to the pieces', async () => {
    rows.t9 = { ...item, views: { ...item.views, reminder_intent: true } };
    mockState.todos = [rows.t9];
    await splitDropNow('t9');
    const [parent] = (insertSplitPieces as jest.Mock).mock.calls[0];
    expect(parent).toMatchObject({
      reminderIntent: true,
      asOne: { bucket: 'todo', subtype: null, habitSubtype: null },
    });
  });

  it('splits only once: a second tap finds it already sorted', async () => {
    rows.t9 = { ...item, views: { split: { ...item.views.split, status: 'split' } } };
    await expect(splitDropNow('t9')).rejects.toThrow('already been sorted');
    expect(insertSplitPieces).not.toHaveBeenCalled();
    expect(mockState.archiveTodo).not.toHaveBeenCalled();
  });

  it('puts it back as it was when the pieces could not all be saved', async () => {
    // the first piece was saved before the second failed
    (insertSplitPieces as jest.Mock).mockImplementation(async () => {
      mockState.todos.push({ id: 'p0', views: { split_group: { id: 'd9', index: 0 } } });
      throw new Error('offline');
    });
    await expect(splitDropNow('t9')).rejects.toThrow('offline');
    expect(mockState.deleteTodo).toHaveBeenCalledWith('p0');
    expect(rows.t9.views.split.status).toBe('pending');
    expect(mockState.archiveTodo).not.toHaveBeenCalled();
    expect(logAppEvent).not.toHaveBeenCalled();
  });

  it('puts it back as it was when the one item could not be archived', async () => {
    (insertSplitPieces as jest.Mock).mockImplementation(async () => {
      mockState.todos.push(
        { id: 'p0', views: { split_group: { id: 'd9', index: 0 } } },
        { id: 'p1', views: { split_group: { id: 'd9', index: 1 } } },
      );
      return [piece(0), piece(1)];
    });
    mockState.archiveTodo.mockRejectedValue(new Error('offline'));
    await expect(splitDropNow('t9')).rejects.toThrow('offline');
    expect(mockState.deleteTodo.mock.calls).toEqual([['p0'], ['p1']]);
    expect(rows.t9.views.split.status).toBe('pending');
    expect(logAppEvent).not.toHaveBeenCalled();
  });

  it('a Split tapped before the whole drop’s check landed still checks each piece when it found something', async () => {
    rows.t9 = { ...item, views: { split: { ...item.views.split, related: undefined } } };
    mockState.todos = [rows.t9];
    (startedDropRelation as jest.Mock).mockReturnValue(answered({ kind: 'same' }));
    await splitDropNow('t9');
    await flush();
    expect(startedDropRelation).toHaveBeenCalledWith('d9');
    expect((dropRelationFor as jest.Mock).mock.calls.map((c) => c[0].text)).toEqual([
      'clean out the garage',
      'sort the donations pile',
    ]);
  });

  it('Keep as one keeps the one item and logs it', async () => {
    await expect(keepSplitAsOne('t9')).resolves.toBe(true);
    expect(rows.t9.views.split.status).toBe('kept');
    expect(mockState.archiveTodo).not.toHaveBeenCalled();
    expect(logAppEvent).toHaveBeenCalledWith(
      'split_answer',
      { type: 'todo', id: 't9' },
      { said: 'unsure', tapped: 'keep_as_one', pieces: 2 },
    );
  });
});

describe('Keep as one, under a clear split’s pieces', () => {
  const group = (index: number, asOne: unknown = { bucket: 'todo', subtype: null }) => ({
    id: 'd1',
    index,
    count: 2,
    text: 'clean out the garage, sort the donations pile',
    title: null,
    said: 'clear',
    as_one: asOne,
  });

  beforeEach(() => {
    mockState.todos = [
      { id: 'p1', created_at: '2026-10-09T09:00:01Z', views: { split_group: group(1) } },
      { id: 'p0', created_at: '2026-10-09T09:00:00Z', views: { split_group: group(0) } },
      { id: 'other', views: {} },
    ];
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'k1',
      entityType: 'todo',
    });
  });

  it('finds the pieces in their order', () => {
    expect(piecesOf('d1').map((p) => p.item.id)).toEqual(['p0', 'p1']);
  });

  it('saves one item of the kind the drop was as one, with its words, where the pieces were, and archives the pieces', async () => {
    await expect(keepPiecesAsOne('d1')).resolves.toEqual({
      itemId: 'k1',
      kindWord: 'todo',
      pieceIds: ['p0', 'p1'],
      stayed: [],
    });
    const [drop, , opts] = (syncDropToSupabase as jest.Mock).mock.calls[0];
    expect(drop).toMatchObject({
      localId: 'kept-d1',
      text: group(0).text,
      // it keeps the pieces' place
      createdAt: '2026-10-09T09:00:00Z',
    });
    expect(opts).toMatchObject({
      stage: 'settled',
      title: 'Clean out the garage, sort the donations pile',
      kind: { bucket: 'todo', subtype: null, habitSubtype: null },
      dropId: 'kept-d1',
      extraViews: { kept_as_one: { group: 'd1', count: 2, at: '2026-10-09T09:00:00Z' } },
    });
    expect(mockState.archiveTodo.mock.calls).toEqual([
      ['p0', 'kept_as_one'],
      ['p1', 'kept_as_one'],
    ]);
    expect(keptGroupsNow.has('d1')).toBe(true);
    expect(logAppEvent).toHaveBeenCalledWith(
      'split_answer',
      { type: 'todo', id: 'k1' },
      { said: 'clear', tapped: 'keep_as_one', pieces: 2 },
    );
  });

  it('runs its details, filing and reminder as a piece’s, and writes the details when they land', async () => {
    mockState.todos[0].views.reminder_intent = true;
    const reminder = { auto_reminder: true, reminder_date: '2026-10-12', reminder_time: '09:00' };
    (startDropReminder as jest.Mock).mockReturnValue(answered(reminder));
    await keepPiecesAsOne('d1');
    await flush();
    const kind = { bucket: 'todo', subtype: null, habitSubtype: null };
    expect(startDropFiling).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'kept-d1', supabaseId: 'k1', entityType: 'todo' }),
    );
    expect(startDropDetails).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'kept-d1' }),
      kind,
    );
    expect(updateDropDetails).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'k1' },
      expect.objectContaining({ localId: 'kept-d1' }),
      DETAILS,
      expect.objectContaining({ settle: false, kind }),
    );
    expect(startDropReminder).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'kept-d1', reminderIntent: true }),
      kind,
    );
    expect(scheduleDropReminder).toHaveBeenCalledWith({ entityType: 'todo', id: 'k1' }, reminder);
  });

  it('is kept as a note, logged, when the split has no kind as one', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.todos = [
      { id: 'p0', created_at: '2026-10-09T09:00:00Z', views: { split_group: group(0, null) } },
      { id: 'p1', created_at: '2026-10-09T09:00:01Z', views: { split_group: group(1, null) } },
    ];
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'n1',
      entityType: 'note',
    });
    await expect(keepPiecesAsOne('d1')).resolves.toMatchObject({ itemId: 'n1', kindWord: 'note' });
    expect((syncDropToSupabase as jest.Mock).mock.calls[0][2]).toMatchObject({
      kind: { bucket: 'log', subtype: 'general', habitSubtype: null },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no kind as one'),
      expect.objectContaining({ groupId: 'd1' }),
    );
    warn.mockRestore();
  });

  it('a piece that could not be archived stays, and the rest are kept as one', async () => {
    mockState.archiveTodo.mockImplementation(async (id: string) => {
      if (id === 'p1') throw new Error('offline');
    });
    await expect(keepPiecesAsOne('d1')).resolves.toEqual({
      itemId: 'k1',
      kindWord: 'todo',
      pieceIds: ['p0'],
      stayed: ['p1'],
    });
  });

  it('keeps the pieces when the item could not be saved, and never shows the database’s words', async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: false,
      error: new Error('duplicate key value violates unique constraint'),
    });
    await expect(keepPiecesAsOne('d1')).rejects.toThrow(DIDNT_GO);
    expect(mockState.archiveTodo).not.toHaveBeenCalled();
  });
});
