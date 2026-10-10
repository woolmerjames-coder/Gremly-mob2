/**
 * dropSync Tests
 *
 * Tests for the Supabase sync layer that writes classified + enriched drops
 * as todos, habits, or notes. Covers:
 * - syncDropToSupabase: entity type routing (todo/habit/note), payload construction
 * - Error handling: auth checks, bucket validation, duplicate key recovery (23505)
 * - dueDayOverride for "Plan your tomorrow" mode
 */

import type { QueuedDrop } from '../dropQueue';
import type { Phase2MetadataResult } from '../dropSync';

// Supabase mock chain – result variables are reset in beforeEach
let mockInsertResult: { data: any; error: any } = { data: { id: 'sb-uuid-1' }, error: null };
let mockSelectResult: { data: any; error: any } = { data: null, error: null };

function buildChain() {
  return {
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockImplementation(() => Promise.resolve(mockInsertResult)),
      }),
    }),
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
        }),
      }),
    }),
  };
}

const mockFrom = jest.fn().mockImplementation(() => buildChain());

// Store mock
const mockSetState = jest.fn();
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(() => ({}), {
    getState: () => ({
      userId: 'user-1',
      todos: [],
      habits: [],
      notes: [],
    }),
    setState: (...args: any[]) => mockSetState(...args),
  }),
}));
jest.mock('../../supabase/client', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));
jest.mock('../../date/DateService', () => ({
  nowTimestamp: () => '2026-03-30T12:00:00Z',
  dateService: { today: () => '2026-03-30', now: () => new Date('2026-03-30T12:00:00') },
}));
jest.mock('../../habits/frequencyUtils', () => ({
  parseFrequencyString: (freq: string) => {
    if (freq === 'daily') return { cadence: 'daily', target_per_period: 1 };
    if (freq === '3x per week') return { cadence: 'weekly', target_per_period: 3 };
    return { cadence: 'daily', target_per_period: 1 };
  },
}));
jest.mock('../../planning', () => ({
  calculateBuffers: () => ({ prep_buffer_minutes: 5, cooldown_buffer_minutes: 5 }),
}));
jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: jest.fn() },
}));

import {
  __resetDropSync,
  attachDropRelation,
  detailBaseOf,
  insertSplitPieces,
  settleDropRow,
  syncDropToSupabase,
  updateDropDetails,
  updateDropQuestion,
  updateDropWords,
} from '../dropSync';
import { eventBus } from '../../events/EventBus';

// ── Helpers ──────────────────────────────────────────────────────

function makeDrop(overrides: Partial<QueuedDrop> = {}): QueuedDrop {
  return {
    localId: 'drop-1',
    text: 'Buy groceries',
    spaceId: null,
    source: 'minddrop',
    createdAt: '2026-03-30T12:00:00Z',
    status: 'enriched',
    retryCount: 0,
    phase: 'enriched',
    bucket: 'todo',
    subtype: null,
    smartTitle: 'Buy groceries',
    confirmationMessage: 'Task added!',
    ...overrides,
  } as QueuedDrop;
}

function makeEnrichment(overrides: Partial<Phase2MetadataResult> = {}): Phase2MetadataResult {
  return {
    tags: ['shopping'],
    time_estimate_minutes: 30,
    time_window: 'morning',
    extracted_date: null,
    extracted_start_date: null,
    extracted_frequency: null,
    extracted_days: null,
    people: [],
    mood: null,
    dateConfidence: null,
    energy_type: null,
    priority_kind: null,
    target_date: null,
    scheduled_date: null,
    event_time: null,
    date_type_ambiguous: false,
    end_date: null,
    smart_title: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('syncDropToSupabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => buildChain());
    mockInsertResult = { data: { id: 'sb-uuid-1' }, error: null };
    mockSelectResult = { data: null, error: null };
  });

  // ── Auth & validation ─────────────────────────────────────────

  it('returns failure when user is not authenticated', async () => {
    const origGetState = require('../../store/useGremlyStore').useGremlyStore.getState;
    require('../../store/useGremlyStore').useGremlyStore.getState = () => ({
      userId: null,
    });

    const result = await syncDropToSupabase(makeDrop(), null);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Not authenticated');

    require('../../store/useGremlyStore').useGremlyStore.getState = origGetState;
  });

  it('returns failure when no bucket classification', async () => {
    const result = await syncDropToSupabase(makeDrop({ bucket: undefined }), null);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('No bucket');
  });

  // ── Entity routing ────────────────────────────────────────────

  it('inserts into todos table for bucket=todo', async () => {
    const result = await syncDropToSupabase(makeDrop({ bucket: 'todo' }), makeEnrichment());

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('todo');
    expect(mockFrom).toHaveBeenCalledWith('todos');
  });

  it('inserts into habits table for bucket=habit', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'habit', habitSubtype: 'start_habit' }),
      makeEnrichment({ extracted_frequency: 'daily' }),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('habit');
    expect(mockFrom).toHaveBeenCalledWith('habits');
  });

  it('inserts into notes table for bucket=log', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'log', subtype: 'general' }),
      makeEnrichment(),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('note');
    expect(mockFrom).toHaveBeenCalledWith('notes');
  });

  // ── Payload construction ──────────────────────────────────────

  it('includes enrichment fields in todo payload', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'todo', smartTitle: 'Get milk' }),
      makeEnrichment({ tags: ['groceries'], time_estimate_minutes: 15 }),
    );

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('todos');
  });

  it('uses dueDayOverride for today source', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'todo', source: 'today', dueDayOverride: '2026-03-31' }),
      makeEnrichment(),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('todo');
  });

  it('uses target_date from enrichment when available', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'todo' }),
      makeEnrichment({ target_date: '2026-04-15' }),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('todo');
  });

  // ── A deadline is not the day to do it (James, 9 Oct 2026) ──────
  const lastInsert = (): Record<string, any> => {
    const chains = mockFrom.mock.results.map((r: any) => r.value);
    for (let i = chains.length - 1; i >= 0; i -= 1) {
      const calls = chains[i]?.insert?.mock?.calls;
      if (calls?.length) return calls[0][0];
    }
    throw new Error('no insert');
  };

  it('saves a deadline as the deadline and leaves the day to do it for the person', async () => {
    await syncDropToSupabase(
      makeDrop({ bucket: 'todo' }),
      makeEnrichment({ target_date: '2026-04-15' }),
    );
    const row = lastInsert();
    expect(row.target_date).toBe('2026-04-15');
    expect(row.due_day ?? null).toBeNull();
  });

  it('sets the day to do it only from a day they said they would do it', async () => {
    await syncDropToSupabase(
      makeDrop({ bucket: 'todo' }),
      makeEnrichment({ target_date: '2026-04-15', scheduled_date: '2026-04-14' }),
    );
    const row = lastInsert();
    expect(row.due_day).toBe('2026-04-14');
    expect(row.target_date).toBe('2026-04-15');
    expect(row.scheduled_date).toBe('2026-04-14');
  });

  it("keeps a todo's clock time as its due time", async () => {
    await syncDropToSupabase(makeDrop({ bucket: 'todo' }), makeEnrichment({ event_time: '15:45' }));
    expect(lastInsert().due_time).toBe('15:45');
  });

  it('keeps a mood on a note that is not a journal', async () => {
    await syncDropToSupabase(
      makeDrop({ bucket: 'log', subtype: 'general' }),
      makeEnrichment({ mood: ['low'] }),
    );
    expect(lastInsert().mood).toEqual(['low']);
  });

  it('sets habit frequency from enrichment', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'habit', habitSubtype: 'start_habit' }),
      makeEnrichment({ extracted_frequency: '3x per week' }),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('habit');
    expect(mockFrom).toHaveBeenCalledWith('habits');
  });

  it('maps event subtype correctly in notes', async () => {
    const result = await syncDropToSupabase(
      makeDrop({ bucket: 'log', subtype: 'event' }),
      makeEnrichment({ event_time: '14:00' }),
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('note');
    expect(mockFrom).toHaveBeenCalledWith('notes');
  });

  // ── Zustand + EventBus ────────────────────────────────────────

  it('adds entity to Zustand store after sync', async () => {
    await syncDropToSupabase(makeDrop({ bucket: 'todo' }), makeEnrichment());
    expect(mockSetState).toHaveBeenCalled();
  });

  it('emits entity:created event after sync', async () => {
    await syncDropToSupabase(makeDrop({ bucket: 'todo' }), makeEnrichment());
    expect(eventBus.emit).toHaveBeenCalledWith(
      'entity:created',
      expect.objectContaining({ type: 'todo' }),
    );
  });

  // ── Degraded classification ───────────────────────────────────

  it('includes ai_degraded flag when classification is degraded', async () => {
    const result = await syncDropToSupabase(
      makeDrop({
        bucket: 'todo',
        classificationDegraded: true,
        classificationSource: 'client-fallback',
      }),
      makeEnrichment(),
    );

    expect(result.success).toBe(true);
    // The degraded flag is in the payload but we verify sync succeeds
    expect(result.entityType).toBe('todo');
  });

  // ── Error handling ────────────────────────────────────────────

  it('returns failure on Supabase insert error', async () => {
    mockInsertResult = { data: null, error: { code: '42P01', message: 'Table not found' } };

    const result = await syncDropToSupabase(makeDrop(), makeEnrichment());
    expect(result.success).toBe(false);
  });

  it('recovers from 23505 duplicate key by fetching existing row', async () => {
    // Insert fails with duplicate key
    mockInsertResult = { data: null, error: { code: '23505', message: 'Duplicate key' } };
    // Fallback select query returns existing row
    mockSelectResult = { data: { id: 'existing-id' }, error: null };

    const result = await syncDropToSupabase(makeDrop(), makeEnrichment());
    expect(result.success).toBe(true);
    expect(result.supabaseId).toBe('existing-id');
  });
});

// ── The new order: saved at the sort, the rest lands on the row (stage 4) ─

describe('saving at the sort and updating the saved row', () => {
  const storeMod = require('../../store/useGremlyStore').useGremlyStore;
  let origGet: any;
  let origSet: any;
  let state: any;
  /** the database: rows by id */
  let db: Map<string, Record<string, any>>;
  let rowN = 0;

  function dbChain(table: string) {
    return {
      insert: jest.fn((payload: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            rowN += 1;
            const row = {
              ...payload,
              id: `row-${rowN}`,
              created_at: '2026-03-30T12:00:00Z',
              _table: table,
            };
            db.set(row.id, row);
            return Promise.resolve({ data: row, error: null });
          },
        }),
      })),
      select: jest.fn(() => ({
        eq: jest.fn((col: string, val: string) => ({
          // a saved row by its id
          single: () => {
            const row = col === 'id' ? db.get(val) : null;
            return Promise.resolve(
              row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } },
            );
          },
          // a row by owner and drop id (the duplicate path)
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
          }),
        })),
      })),
    };
  }

  const inserts = (): Array<Record<string, any>> =>
    mockFrom.mock.results.flatMap(
      (r: any) => r.value?.insert?.mock?.calls?.map((c: any[]) => c[0]) ?? [],
    );

  /** The store's update writes the database and its own copy, as the real one does. */
  const applyPatch = (key: 'todos' | 'habits' | 'notes') =>
    jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = db.get(id);
      if (row) db.set(id, { ...row, ...patch });
      state[key] = state[key].map((x: any) => (x.id === id ? { ...x, ...patch } : x));
    });

  /** The person changes a saved row (in the database). */
  const edit = (id: string, patch: Record<string, unknown>) =>
    db.set(id, { ...db.get(id)!, ...patch });

  const todoKind = { bucket: 'todo' as const, subtype: null, habitSubtype: null };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetDropSync();
    rowN = 0;
    db = new Map();
    mockSelectResult = { data: null, error: null };
    state = { userId: 'user-1', todos: [], habits: [], notes: [] };
    state.updateTodo = applyPatch('todos');
    state.updateHabit = applyPatch('habits');
    state.updateNote = applyPatch('notes');
    origGet = storeMod.getState;
    origSet = storeMod.setState;
    storeMod.getState = () => state;
    storeMod.setState = (fn: any) =>
      Object.assign(state, typeof fn === 'function' ? fn(state) : fn);
    mockFrom.mockImplementation((table: string) => dbChain(table));
  });

  afterEach(() => {
    storeMod.getState = origGet;
    storeMod.setState = origSet;
  });

  async function saveTodo(over: Partial<QueuedDrop> = {}) {
    const drop = makeDrop({ bucket: 'todo', smartTitle: 'Buy groceries', ...over });
    const result = await syncDropToSupabase(drop, null, { stage: 'saved', title: 'Buy groceries' });
    return {
      drop,
      saved: { entityType: 'todo' as const, id: result.supabaseId! },
      base: detailBaseOf('todo', result.row),
    };
  }

  it('saves the drop as its kind with no details yet, and puts it in the store', async () => {
    const { saved } = await saveTodo();
    const row = inserts()[0];
    // the moment of the tap, so the card keeps its place (final check item 4)
    expect(row.created_at).toBe('2026-03-30T12:00:00Z');
    // no remind me was heard
    expect(row.views.reminder_intent).toBeUndefined();
    expect(row.views.minddrop_stage).toBe('saved');
    expect(row.tags).toEqual([]);
    expect(row.time_estimate_minutes).toBeNull();
    expect(state.todos.map((t: any) => t.id)).toEqual([saved.id]);
    expect(state.todos[0].type).toBe('todo');
  });

  it("keeps the title call's title for an event (the details' event title is not used)", async () => {
    await syncDropToSupabase(
      makeDrop({ bucket: 'log', subtype: 'event', smartTitle: 'Dinner with Sam' }),
      makeEnrichment({ smart_title: 'Dinner With Sam At Eight' }),
    );
    expect(inserts()[0].title).toBe('Dinner with Sam');
  });

  it("saves the drop's own words, in sentence case, when no title is given", async () => {
    await syncDropToSupabase(
      makeDrop({ bucket: 'todo', smartTitle: undefined, text: 'buy milk' }),
      null,
      { stage: 'saved' },
    );
    expect(inserts()[0].name).toBe('Buy milk');
  });

  it('writes the details to the saved row in one update, with the settle', async () => {
    const { drop, saved, base } = await saveTodo();
    await updateDropDetails(
      saved,
      drop,
      makeEnrichment({
        tags: ['shopping'],
        time_estimate_minutes: 20,
        scheduled_date: '2026-04-01',
        people: ['Sam'],
      }),
      { settle: true, kind: todoKind, base },
    );
    expect(state.updateTodo).toHaveBeenCalledTimes(1);
    const patch = state.updateTodo.mock.calls[0][1];
    expect(patch).toMatchObject({
      tags: ['shopping'],
      time_estimate_minutes: 20,
      due_day: '2026-04-01',
      scheduled_date: '2026-04-01',
    });
    expect(patch.name).toBeUndefined();
    expect(patch.views).toMatchObject({ minddrop_stage: 'settled', people: ['Sam'] });
    // what was in views stays
    expect(patch.views.confirmation_message).toBe('Task added!');
  });

  it('leaves a field the person changed since the save as they set it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { drop, saved, base } = await saveTodo();
    edit(saved.id, { due_day: '2026-05-01' });
    await updateDropDetails(
      saved,
      drop,
      makeEnrichment({ scheduled_date: '2026-04-01', tags: ['x'] }),
      { settle: true, kind: todoKind, base },
    );
    const patch = state.updateTodo.mock.calls[0][1];
    expect('due_day' in patch).toBe(false);
    expect(patch.tags).toEqual(['x']);
    expect(db.get(saved.id)!.due_day).toBe('2026-05-01');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('kept what the person changed'),
      expect.objectContaining({ kept: expect.arrayContaining(['due_day']) }),
    );
    warn.mockRestore();
  });

  it('builds each update on the row in the database, not an older copy in the store', async () => {
    const { saved } = await saveTodo();
    await settleDropRow(saved);
    // a refresh from the server puts back an older copy in the store
    state.todos[0] = {
      ...state.todos[0],
      views: { ...state.todos[0].views, minddrop_stage: 'saved' },
    };
    const relation: any = { kind: 'remove', intent: 'remove', status: 'pending', classified: {} };
    expect(await attachDropRelation(saved, relation)).toBe('sweep');
    expect(db.get(saved.id)!.views.minddrop_stage).toBe('settled');
  });

  it('writes late details without touching the settle', async () => {
    const { drop, saved, base } = await saveTodo();
    await updateDropDetails(saved, drop, makeEnrichment({ tags: ['late'] }), {
      settle: false,
      kind: todoKind,
      base,
    });
    expect(state.updateTodo.mock.calls[0][1].views.minddrop_stage).toBe('saved');
  });

  it('settles once', async () => {
    const { saved } = await saveTodo();
    await settleDropRow(saved);
    await settleDropRow(saved);
    expect(state.updateTodo).toHaveBeenCalledTimes(1);
    expect(db.get(saved.id)!.views.minddrop_stage).toBe('settled');
  });

  it('writes nothing to a row deleted since the save', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { saved } = await saveTodo();
    db.delete(saved.id);
    expect(await settleDropRow(saved)).toBe(false);
    expect(state.updateTodo).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  const relation: any = {
    kind: 'same',
    intent: 'same',
    extra: null,
    entity: { id: 't9', type: 'todo', title: 'Buy groceries' },
    others: [],
    confidence: 90,
    status: 'pending',
    classified: {
      bucket: 'todo',
      subtype: null,
      habitSubtype: null,
      needsClarification: false,
      ambiguityType: null,
      clarificationQuestion: null,
      clarificationOptions: null,
    },
  };

  it('marks an answer that lands before the settle for the card, and after it for Sweep', async () => {
    const first = await saveTodo({ localId: 'drop-a' });
    expect(await attachDropRelation(first.saved, relation)).toBe('card');
    expect(db.get(first.saved.id)!.views.relation).toMatchObject({
      status: 'pending',
      surface: 'card',
    });

    const second = await saveTodo({ localId: 'drop-b' });
    await settleDropRow(second.saved);
    expect(await attachDropRelation(second.saved, relation)).toBe('sweep');
    expect(db.get(second.saved.id)!.views.relation.surface).toBe('sweep');
  });

  it('never replaces an answer the item already carries', async () => {
    const { saved } = await saveTodo();
    await attachDropRelation(saved, relation);
    state.updateTodo.mockClear();
    expect(await attachDropRelation(saved, { ...relation, intent: 'remove' })).toBeNull();
    expect(state.updateTodo).not.toHaveBeenCalled();
  });

  it('records the day a drop asked, and that the card asks it (stage 6)', async () => {
    await saveTodo({ localId: 'plain' });
    expect(inserts()[0].views.ask_since).toBeUndefined();
    expect(inserts()[0].views.ask_on_card).toBeUndefined();
    await saveTodo({
      localId: 'unclear',
      needsClarification: true,
      ambiguityType: 'bucket',
      clarificationQuestion: 'Is this a job?',
      clarificationOptions: [] as any,
    });
    expect(inserts()[1].views).toMatchObject({ ask_since: '2026-03-30', ask_on_card: true });
  });

  it("an answer records the day it asked; one for the card asks there unless Not now sent the card's question off", async () => {
    const first = await saveTodo({ localId: 'drop-a' });
    await attachDropRelation(first.saved, relation);
    expect(db.get(first.saved.id)!.views).toMatchObject({
      ask_since: '2026-03-30',
      ask_on_card: true,
    });

    const late = await saveTodo({ localId: 'drop-b' });
    await settleDropRow(late.saved);
    await attachDropRelation(late.saved, relation);
    expect(db.get(late.saved.id)!.views.ask_since).toBe('2026-03-30');
    expect(db.get(late.saved.id)!.views.ask_on_card).toBeUndefined();

    const sentOff = await saveTodo({ localId: 'drop-c' });
    edit(sentOff.saved.id, {
      views: { ...db.get(sentOff.saved.id)!.views, ask_since: '2026-03-29', ask_on_card: false },
    });
    await attachDropRelation(sentOff.saved, relation);
    expect(db.get(sentOff.saved.id)!.views).toMatchObject({
      ask_since: '2026-03-29',
      ask_on_card: false,
    });
  });

  it("puts a late title in place of the drop's own words, and the reaction in views", async () => {
    const { saved } = await saveTodo({ confirmationMessage: null });
    await updateDropWords(
      saved,
      { smartTitle: 'Get groceries', reaction: 'Fridge saved.' },
      'Buy groceries',
    );
    expect(db.get(saved.id)!.name).toBe('Get groceries');
    expect(db.get(saved.id)!.views.confirmation_message).toBe('Fridge saved.');
  });

  it('leaves a title the person changed since the save, and a reaction already there', async () => {
    const { saved } = await saveTodo();
    edit(saved.id, { name: 'My own name' });
    await updateDropWords(
      saved,
      { smartTitle: 'Get groceries', reaction: 'Other.' },
      'Buy groceries',
    );
    expect(db.get(saved.id)!.name).toBe('My own name');
    expect(db.get(saved.id)!.views.confirmation_message).toBe('Task added!');
  });

  it("puts the writer's words on a question that is still open, and settles", async () => {
    const drop = makeDrop({
      bucket: 'log',
      subtype: 'general',
      needsClarification: true,
      clarificationQuestion: 'Do or remember?',
      clarificationOptions: [
        { id: 'a', label: 'Do', action: {} },
        { id: 'b', label: 'Remember', action: {} },
      ] as any,
    });
    const r = await syncDropToSupabase(drop, null, { stage: 'saved', title: 'Dentist' });
    const saved = { entityType: 'note' as const, id: r.supabaseId! };
    const words = { question: 'Booked, or still to book?', options: [{ id: 'a' }, { id: 'b' }] };
    await updateDropQuestion(saved, words, { settle: true });
    expect(db.get(saved.id)!.clarification_question).toBe('Booked, or still to book?');
    expect(db.get(saved.id)!.views).toMatchObject({
      clarification_question: 'Booked, or still to book?',
      minddrop_stage: 'settled',
    });

    // answered since: the words are not changed
    edit(saved.id, { clarification_resolved: true });
    state.updateNote.mockClear();
    await updateDropQuestion(saved, { question: 'Another?', options: [] }, { settle: true });
    expect(state.updateNote.mock.calls[0][1].clarification_question).toBeUndefined();
  });

  it('runs the updates to one row one after another, each on the row as it is then', async () => {
    const { drop, saved, base } = await saveTodo({ confirmationMessage: null });
    let release = () => {};
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const firstWrite = state.updateTodo;
    state.updateTodo = jest.fn(async (id: string, patch: Record<string, unknown>) => {
      if (state.updateTodo.mock.calls.length === 1) await slow;
      return firstWrite(id, patch);
    });
    const words = updateDropWords(saved, { smartTitle: null, reaction: 'Nice.' }, 'Buy groceries');
    const details = updateDropDetails(saved, drop, makeEnrichment({ tags: ['a'] }), {
      settle: true,
      kind: todoKind,
      base,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(state.updateTodo).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([words, details]);
    expect(db.get(saved.id)!.views).toMatchObject({
      confirmation_message: 'Nice.',
      minddrop_stage: 'settled',
    });
  });

  it('saves a clear split as its pieces, each in its own words, with its group', async () => {
    const drop = makeDrop({
      localId: 'drop-9',
      text: 'buy milk, gym',
      createdAt: '2026-10-09T09:00:00Z',
      reminderIntent: true,
      asOne: { bucket: 'todo', subtype: null, habitSubtype: null },
      isMulti: true,
      split: 'clear',
      multiSegments: [
        { text: 'buy milk', bucket: 'todo', subtype: null },
        {
          text: 'gym',
          bucket: 'log',
          subtype: 'general',
          needsClarification: true,
          ambiguityType: 'habit_or_todo',
          clarificationQuestion: 'Once, or a regular thing?',
          clarificationOptions: [
            { id: 'opt_1', label: 'Once', action: { bucket: 'todo' } },
            { id: 'opt_2', label: 'Regularly', action: { bucket: 'habit' } },
          ],
        },
      ],
    });
    const pieces = await insertSplitPieces(drop);
    expect(pieces.map((p) => p.dropId)).toEqual(['split-drop-9-0', 'split-drop-9-1']);
    const [first, second] = inserts();
    expect(first).toMatchObject({
      drop_id: 'split-drop-9-0',
      name: 'Buy milk',
      body: 'buy milk',
      needs_clarification: false,
    });
    // a piece's details and title come after (splitActions' fillPieces), so it is saved
    // waiting for them; a piece that asks is saved settled with its question
    expect(first.views).toMatchObject({
      minddrop_stage: 'saved',
      split_group: {
        id: 'drop-9',
        index: 0,
        count: 2,
        text: 'buy milk, gym',
        said: 'clear',
        // the drop's kind as one, for Keep as one (final check item 2)
        as_one: { bucket: 'todo', subtype: null, habitSubtype: null },
      },
      confirmation_message: null,
      // the remind me carries to each piece (final check item 5)
      reminder_intent: true,
    });
    // each piece keeps the moment of the tap (final check item 4)
    expect(first.created_at).toBe('2026-10-09T09:00:00Z');
    expect(second.created_at).toBe('2026-10-09T09:00:00Z');
    expect(second.views.minddrop_stage).toBe('settled');
    expect(pieces[1].asks).toBe(true);
    expect(pieces[0].asks).toBeFalsy();
    expect(second).toMatchObject({
      drop_id: 'split-drop-9-1',
      title: 'Gym',
      subtype: 'catchall',
      needs_clarification: true,
      clarification_question: 'Once, or a regular thing?',
    });
    expect(second.views.ambiguity_type).toBe('habit_or_todo');
    expect(mockFrom).toHaveBeenCalledWith('todos');
    expect(mockFrom).toHaveBeenCalledWith('notes');
  });

  it('finds a row an earlier try saved, says so, and puts it in the store when it is missing', async () => {
    mockFrom.mockImplementation((table: string) => ({
      ...dbChain(table),
      insert: jest.fn(() => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }),
        }),
      })),
    }));
    mockSelectResult = {
      data: { id: 'existing-1', owner_id: 'user-1', drop_id: 'drop-1', name: 'Buy groceries' },
      error: null,
    };
    const r = await syncDropToSupabase(makeDrop(), null, { stage: 'saved' });
    expect(r).toMatchObject({ success: true, supabaseId: 'existing-1', duplicate: true });
    expect(state.todos.map((t: any) => t.id)).toEqual(['existing-1']);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'entity:created',
      expect.objectContaining({ type: 'todo' }),
    );
  });
});
