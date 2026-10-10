/**
 * dropPhases: the new order (Mind Drop rethink stage 4).
 *
 * - queued: the title call and the already have it check start at the tap,
 *   beside the classifier; reminder_intent is copied; the title call sends the
 *   timezone and today's date.
 * - sorted: the details start with the kind; the title call gets at most a
 *   little longer; the drop is saved as its kind without waiting for the
 *   details or the relation; an unclear drop saves its question, an unsure
 *   split one item with views.split, a clear split its pieces.
 * - saved: details in time are written with the settle; late ones after it;
 *   an unclear drop takes the writer's words only when they are the writer's.
 * - an older build's phases run the handler they move to.
 */

import type { QueuedDrop } from '../dropQueue';

jest.mock('../detectMulti', () => ({
  detectMulti: jest.fn().mockResolvedValue({ is_multi: false }),
}));
jest.mock('../phase1', () => ({
  runPhase1: jest.fn(),
  runClassifyV3: jest.fn(),
}));
jest.mock('../../config/featureFlags', () => ({
  FEATURE_FLAGS: { CLASSIFY_V3_ENABLED: true, HEURISTIC_LOGGING_ENABLED: false },
}));
jest.mock('../dropSync', () => {
  const actual = jest.requireActual('../dropSync');
  return {
    splitPiecesView: actual.splitPiecesView,
    kindWordOf: actual.kindWordOf,
    detailBaseOf: actual.detailBaseOf,
    syncDropToSupabase: jest.fn(),
    insertSplitPieces: jest.fn(),
    updateDropDetails: jest.fn().mockResolvedValue(true),
    settleDropRow: jest.fn().mockResolvedValue(true),
    updateDropWords: jest.fn().mockResolvedValue(true),
    updateDropQuestion: jest.fn().mockResolvedValue(true),
    attachDropRelation: jest.fn().mockResolvedValue('card'),
  };
});
jest.mock('../dropReminder', () => ({
  scheduleDropReminder: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(() => ({}), {
    getState: () => ({
      userId: 'user-1',
      todos: [],
      habits: [],
      notes: [],
      recentSpeech: [],
      pushRecentSpeech: jest.fn(),
    }),
    setState: jest.fn(),
  }),
}));
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));
jest.mock('../../chat/entityCards', () => ({
  applyEntityChange: jest.fn(),
  formatDay: (d: string) => d,
  formatTime: (t: string) => t,
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../date/DateService', () => ({
  nowTimestamp: () => '2026-10-09T12:00:00Z',
  dateService: { today: () => '2026-10-09', now: () => new Date('2026-10-09T12:00:00Z') },
  getDateService: () => ({
    today: () => '2026-10-09',
    now: () => new Date('2026-10-09T12:00:00Z'),
    dayNow: () => new Date('2026-10-09T12:00:00Z'),
    getTimezone: () => 'Europe/London',
  }),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex' },
  getEnv: (key: string) => (key === 'EXPO_PUBLIC_CORTEX_URL' ? 'https://test.cortex' : undefined),
}));

import {
  DROP_WAITS,
  getPhaseHandler,
  handleQueued,
  handleSaved,
  handleSorted,
  forgetDropCalls,
} from '../dropPhases';
import { runClassifyV3, runPhase1 } from '../phase1';
import {
  attachDropRelation,
  insertSplitPieces,
  settleDropRow,
  syncDropToSupabase,
  updateDropDetails,
  updateDropQuestion,
  updateDropWords,
} from '../dropSync';
import { scheduleDropReminder } from '../dropReminder';
import { eventBus } from '../../events/EventBus';

// ── A Worker that answers each call when the test says ───────────────────

type Gate = { gate: Promise<void>; open: () => void };
function gate(): Gate {
  let open = () => {};
  const g = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { gate: g, open };
}

let replies: Record<string, unknown> = {};
let gates: Record<string, Gate> = {};
let sent: Array<Record<string, any>> = [];

const realFetch = global.fetch;
function installWorker() {
  global.fetch = jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    const g = gates[body.type];
    if (g) await g.gate;
    return { ok: true, json: async () => replies[body.type] ?? {} };
  }) as any;
}
const sentTypes = () => sent.map((b) => b.type);
const sentOf = (type: string) => sent.filter((b) => b.type === type);

/** Let the started calls run up to their fetch. */
const flush = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const WORDS = { smart_title: 'Call mum about Sunday', confirmation_message: 'She will love that.' };
const DETAILS = {
  tags: ['family'],
  time_estimate_minutes: 10,
  time_window: 'evening',
  people: ['Mum'],
  energy_type: 'social',
};
const RELATION = {
  enabled: true,
  relation: {
    kind: 'edit',
    intent: 'complete',
    entity: { id: 't1', type: 'todo', title: 'Book the pet sitter', due_day: null, due_time: null },
    others: [],
    confidence: 95,
    change: { field: 'completed', from: null, to: 'done' },
  },
};

let n = 0;
function drop(over: Partial<QueuedDrop> = {}): QueuedDrop {
  n += 1;
  return {
    localId: `d-${n}`,
    text: 'call mum about sunday',
    spaceId: null,
    source: 'minddrop',
    createdAt: '2026-10-09T12:00:00Z',
    status: 'queued',
    retryCount: 0,
    phase: 'queued',
    ...over,
  } as QueuedDrop;
}

function sorted(over: Partial<QueuedDrop> = {}): QueuedDrop {
  return drop({
    phase: 'sorted',
    sortedAt: new Date('2026-10-09T12:00:00Z').getTime(),
    classifyEngine: 'v3',
    bucket: 'todo',
    subtype: null,
    needsClarification: false,
    ...over,
  });
}

const v3 = (
  phase1: Record<string, unknown>,
  multi: Record<string, unknown> = { is_multi: false },
) => ({
  phase1: { subtype: null, habitSubtype: null, confidence: 0.9, source: 'api', ...phase1 },
  multi,
  latencyMs: 10,
});

const reactions: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  replies = {
    'enrich-phase1-5a': WORDS,
    'enrich-phase2': DETAILS,
    'enrich-phase2b': {
      auto_reminder: true,
      reminder_date: '2026-10-10',
      reminder_time: '09:00',
      reminder_frequency: 'once',
    },
    'minddrop-relate': { enabled: true, relation: null },
    'clarify-ambiguity': {
      clarification_question: 'Is this something to do, or to remember?',
      options: [
        { id: 'opt_1', label: 'To do', bucket: 'todo' },
        { id: 'opt_2', label: 'To remember', bucket: 'log', subtype: 'general' },
      ],
      question_source: 'model',
      labels_source: 'model',
    },
  };
  gates = {};
  sent = [];
  installWorker();
  DROP_WAITS.wordsAfterSortMs = 30;
  DROP_WAITS.settleMs = 80;
  (syncDropToSupabase as jest.Mock).mockResolvedValue({
    success: true,
    supabaseId: 'row-1',
    entityType: 'todo',
  });
  reactions.length = 0;
  eventBus.clear();
  eventBus.on('drop:reaction_ready', (p) => reactions.push(p));
});

afterEach(async () => {
  // let every held call finish so nothing is left running
  Object.values(gates).forEach((g) => g.open());
  await flush();
  global.fetch = realFetch;
});

// ── queued: the tap ──────────────────────────────────────────────────────

describe('handleQueued', () => {
  it('starts the title call and the already have it check at the tap, beside the classifier', async () => {
    const classifier = gate();
    (runClassifyV3 as jest.Mock).mockImplementation(async () => {
      await classifier.gate;
      return v3({ bucket: 'todo' });
    });
    const pending = handleQueued(drop());
    await flush();
    // both asked while the classifier was still out
    expect(sentTypes()).toEqual(expect.arrayContaining(['enrich-phase1-5a', 'minddrop-relate']));
    const words = sentOf('enrich-phase1-5a')[0];
    expect(words.bucket).toBeUndefined();
    expect(words.timezone).toBe('Europe/London');
    expect(words.currentDate).toBe('2026-10-09');
    classifier.open();
    const out = await pending;
    expect(out.phase).toBe('sorted');
    expect(typeof out.sortedAt).toBe('number');
  });

  it("copies the classifier's reminder_intent onto the drop", async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(v3({ bucket: 'todo', reminder_intent: true }));
    const out = await handleQueued(drop({ text: 'remind me to call mum' }));
    expect(out.reminderIntent).toBe(true);
  });

  it('sorts with the title when the title call is already back, and sends the reaction once', async () => {
    (runClassifyV3 as jest.Mock).mockImplementation(async () => {
      await flush();
      return v3({ bucket: 'todo' });
    });
    const out = await handleQueued(drop());
    expect(out.smartTitle).toBe('Call mum about Sunday');
    expect(out.confirmationMessage).toBe('She will love that.');
    expect(reactions).toEqual([
      expect.objectContaining({ message: 'She will love that.', followUp: null }),
    ]);
  });

  it('keeps an unclear drop with its type and the classifier question', async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(
      v3({
        bucket: 'log',
        subtype: 'general',
        is_ambiguous: true,
        ambiguity_type: null,
        clarification_question: 'Booked yet?',
        clarification_options: [
          { id: 'a', label: 'Yes', action: {} },
          { id: 'b', label: 'No', action: {} },
        ],
      }),
    );
    const out = await handleQueued(drop());
    expect(out.needsClarification).toBe(true);
    expect(out.ambiguityType).toBe('bucket');
    expect(out.clarificationQuestion).toBe('Booked yet?');
  });

  it('records a split with how sure the classifier is and the drop as one', async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(
      v3(
        { bucket: 'todo' },
        {
          is_multi: true,
          split: 'unsure',
          as_one: { bucket: 'todo', subtype: null, habitSubtype: null },
          segments: [
            { text: 'buy milk', bucket: 'todo', subtype: null },
            { text: 'walk daily', bucket: 'habit', habitSubtype: 'start_habit' },
          ],
        },
      ),
    );
    const out = await handleQueued(drop({ text: 'buy milk, walk daily' }));
    expect(out).toMatchObject({ phase: 'sorted', isMulti: true, split: 'unsure' });
    expect(out.asOne).toEqual({ bucket: 'todo', subtype: null, habitSubtype: null });
    expect(out.multiSegments).toHaveLength(2);
    // the split line as before: no reaction
    expect(reactions).toEqual([expect.objectContaining({ message: null, followUp: 'multi' })]);
  });

  it('gives a piece that asks a question to show even when its own was unusable', async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(
      v3(
        { bucket: 'todo' },
        {
          is_multi: true,
          split: 'clear',
          as_one: null,
          segments: [
            { text: 'buy milk', bucket: 'todo' },
            { text: 'gym', bucket: 'log', is_ambiguous: true, ambiguity_type: 'habit_or_todo' },
          ],
        },
      ),
    );
    const out = await handleQueued(drop({ text: 'buy milk, gym' }));
    const piece = out.multiSegments![1];
    expect(piece.needsClarification).toBe(true);
    expect(piece.ambiguityType).toBe('habit_or_todo');
    expect(typeof piece.clarificationQuestion).toBe('string');
    expect((piece.clarificationOptions || []).length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the v2 classifier when classify-v3 fails', async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(null);
    (runPhase1 as jest.Mock).mockResolvedValue({
      bucket: 'habit',
      subtype: null,
      habitSubtype: 'start_habit',
      confidence: 0.8,
      source: 'api',
    });
    const out = await handleQueued(drop({ text: 'walk every day' }));
    expect(out).toMatchObject({ phase: 'sorted', bucket: 'habit', classifyEngine: 'v2' });
  });

  it('throws when nothing could sort it, so the runner tries again', async () => {
    (runClassifyV3 as jest.Mock).mockResolvedValue(null);
    (runPhase1 as jest.Mock).mockResolvedValue(null);
    await expect(handleQueued(drop({ text: 'buy milk' }))).rejects.toThrow('Classification');
  });
});

// ── sorted: details start, and the drop is saved as its kind ─────────────

describe('handleSorted', () => {
  it('starts the details with the kind, and the reminder when one was asked for', async () => {
    gates['enrich-phase2'] = gate();
    await handleSorted(sorted({ smartTitle: 'Call mum', reminderIntent: true }));
    await flush();
    expect(sentOf('enrich-phase2')[0]).toMatchObject({ bucket: 'todo', subtype: null });
    expect(sentOf('enrich-phase2b')).toHaveLength(1);
  });

  it('saves without waiting for the details or the relation', async () => {
    gates['enrich-phase2'] = gate();
    gates['minddrop-relate'] = gate();
    const d = sorted({ smartTitle: 'Call mum' });
    const out = await handleSorted(d);
    expect(syncDropToSupabase).toHaveBeenCalledTimes(1);
    const [, enrichment, opts] = (syncDropToSupabase as jest.Mock).mock.calls[0];
    expect(enrichment).toBeNull();
    expect(opts).toMatchObject({ stage: 'saved', title: 'Call mum' });
    expect(opts.kind).toEqual({ bucket: 'todo', subtype: null, habitSubtype: null });
    expect(out).toMatchObject({
      phase: 'saved',
      supabaseId: 'row-1',
      entityType: 'todo',
      relationPending: true,
    });
    expect(typeof out.savedAt).toBe('number');
  });

  it('gives the title call a little longer, then saves the drop in its own words and updates it when the title lands', async () => {
    gates['enrich-phase1-5a'] = gate();
    const d = sorted();
    const out = await handleSorted(d);
    expect(out.wordsPending).toBe(true);
    expect((syncDropToSupabase as jest.Mock).mock.calls[0][2].title).toBe('Call mum about sunday');
    expect(reactions).toHaveLength(0);
    gates['enrich-phase1-5a'].open();
    await flush();
    expect(updateDropWords).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      { smartTitle: 'Call mum about Sunday', reaction: 'She will love that.' },
      'Call mum about sunday',
    );
    expect(reactions).toEqual([expect.objectContaining({ message: 'She will love that.' })]);
  });

  it('saves the already have it answer on the item, of any kind, when it is in by the save', async () => {
    replies['minddrop-relate'] = RELATION;
    const d = sorted({ smartTitle: 'Booked the pet sitter' });
    // asked at the tap
    (runClassifyV3 as jest.Mock).mockResolvedValue(v3({ bucket: 'todo' }));
    const q = await handleQueued({ ...d, phase: 'queued' });
    await flush();
    const out = await handleSorted({ ...q, smartTitle: 'Booked the pet sitter' });
    const opts = (syncDropToSupabase as jest.Mock).mock.calls[0][2];
    expect(opts.extraViews.relation).toMatchObject({
      status: 'pending',
      surface: 'card',
      kind: 'edit',
      classified: { bucket: 'todo' },
    });
    expect(out.relationPending).toBe(false);
    // asked once, at the tap
    expect(sentOf('minddrop-relate')).toHaveLength(1);
  });

  it('attaches the answer when it lands after the save', async () => {
    replies['minddrop-relate'] = RELATION;
    gates['minddrop-relate'] = gate();
    const out = await handleSorted(sorted({ smartTitle: 'Booked the pet sitter' }));
    expect(out.relationPending).toBe(true);
    expect(attachDropRelation).not.toHaveBeenCalled();
    gates['minddrop-relate'].open();
    await flush();
    expect(attachDropRelation).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.objectContaining({ status: 'pending', kind: 'edit', intent: 'complete' }),
    );
  });

  it('saves an unclear drop as a note with the classifier question, and asks the writer, not the details', async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'note-1',
      entityType: 'note',
    });
    const d = sorted({
      smartTitle: 'Dentist',
      bucket: 'log',
      subtype: 'general',
      needsClarification: true,
      ambiguityType: 'booking',
      clarificationQuestion: 'Booked yet?',
      clarificationOptions: [
        { id: 'a', label: 'Yes', action: {} },
        { id: 'b', label: 'No', action: {} },
      ] as any,
    });
    await handleSorted(d);
    await flush();
    const [saved] = (syncDropToSupabase as jest.Mock).mock.calls[0];
    expect(saved.clarificationQuestion).toBe('Booked yet?');
    expect(sentTypes()).toContain('clarify-ambiguity');
    expect(sentTypes()).not.toContain('enrich-phase2');
    expect(reactions).toEqual([expect.objectContaining({ followUp: 'clarify' })]);
  });

  it('saves an unsure split as one item of its kind as one, with the pieces waiting', async () => {
    const d = sorted({
      smartTitle: 'Buy milk, walk daily',
      isMulti: true,
      split: 'unsure',
      asOne: { bucket: 'todo', subtype: null, habitSubtype: null },
      multiSegments: [
        { text: 'buy milk', bucket: 'todo', subtype: null },
        { text: 'walk daily', bucket: 'habit', subtype: null, habitSubtype: 'start_habit' },
      ],
    });
    const out = await handleSorted(d);
    const opts = (syncDropToSupabase as jest.Mock).mock.calls[0][2];
    expect(opts.kind).toEqual({ bucket: 'todo', subtype: null, habitSubtype: null });
    expect(opts.extraViews.split).toEqual({
      status: 'pending',
      pieces: [
        expect.objectContaining({ text: 'buy milk', kind: 'todo' }),
        expect.objectContaining({ text: 'walk daily', kind: 'habit' }),
      ],
    });
    expect(out.bucket).toBe('todo');
  });

  it('saves an unsure split with no kind as one as a note', async () => {
    const d = sorted({
      smartTitle: 'Two things',
      isMulti: true,
      split: 'unsure',
      asOne: null,
      multiSegments: [
        { text: 'a', bucket: 'todo', subtype: null },
        { text: 'b', bucket: 'todo', subtype: null },
      ],
    });
    await handleSorted(d);
    expect((syncDropToSupabase as jest.Mock).mock.calls[0][2].kind).toEqual({
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
    });
  });

  it('saves a clear split as its pieces', async () => {
    const pieces = [
      { entityType: 'todo', id: 'p0', dropId: 'split-x-0', index: 0, text: 'a', title: 'A' },
      { entityType: 'todo', id: 'p1', dropId: 'split-x-1', index: 1, text: 'b', title: 'B' },
    ];
    (insertSplitPieces as jest.Mock).mockResolvedValue(pieces);
    const d = sorted({
      isMulti: true,
      split: 'clear',
      multiSegments: [
        { text: 'a', bucket: 'todo', subtype: null },
        { text: 'b', bucket: 'todo', subtype: null },
      ],
    });
    const out = await handleSorted(d);
    expect(insertSplitPieces).toHaveBeenCalledWith(d);
    expect(syncDropToSupabase).not.toHaveBeenCalled();
    expect(out).toMatchObject({ phase: 'saved', pieceRows: pieces });
    const done = await handleSaved(out);
    expect(done).toMatchObject({ phase: 'complete', detailsIn: 'not_asked' });
  });

  it('throws when the save fails, so the runner tries again', async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: false,
      error: new Error('offline'),
    });
    await expect(handleSorted(sorted({ smartTitle: 'Call mum' }))).rejects.toThrow('offline');
  });
});

// ── saved: the details, and the settle ───────────────────────────────────

describe('handleSaved', () => {
  async function savedDrop(over: Partial<QueuedDrop> = {}) {
    return handleSorted(sorted({ smartTitle: 'Call mum', ...over }));
  }

  it('writes details that are in time with the settle, and saves the reminder', async () => {
    const d = await savedDrop({ reminderIntent: true });
    const out = await handleSaved(d);
    await flush();
    expect(updateDropDetails).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.objectContaining({ localId: d.localId }),
      expect.objectContaining({ tags: ['family'], people: ['Mum'] }),
      expect.objectContaining({
        settle: true,
        kind: { bucket: 'todo', subtype: null, habitSubtype: null },
      }),
    );
    expect(settleDropRow).not.toHaveBeenCalled();
    expect(scheduleDropReminder).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.objectContaining({ auto_reminder: true, reminder_date: '2026-10-10' }),
    );
    expect(out).toMatchObject({ phase: 'complete', detailsIn: 'in_time', tags: ['family'] });
    expect(typeof out.settledAt).toBe('number');
  });

  it('does not hold the details for a slow reminder call', async () => {
    gates['enrich-phase2b'] = gate();
    const d = await savedDrop({ reminderIntent: true });
    const out = await handleSaved(d);
    expect(out.detailsIn).toBe('in_time');
    expect(scheduleDropReminder).not.toHaveBeenCalled();
    gates['enrich-phase2b'].open();
    await flush();
    expect(scheduleDropReminder).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.objectContaining({ auto_reminder: true }),
    );
  });

  it('protects what the person changed with the row as it was saved', async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'row-1',
      entityType: 'todo',
      row: { id: 'row-1', due_day: null, tags: [], views: { people: null } },
    });
    const d = await savedDrop();
    expect(d.savedBase).toMatchObject({ due_day: null, tags: [] });
    await handleSaved(d);
    expect((updateDropDetails as jest.Mock).mock.calls[0][3].base).toEqual(d.savedBase);
  });

  it('does not send a reaction that lands after the settle', async () => {
    gates['enrich-phase1-5a'] = gate();
    const d = await savedDrop({ smartTitle: undefined });
    await handleSaved(d);
    gates['enrich-phase1-5a'].open();
    await flush();
    expect(updateDropWords).toHaveBeenCalled();
    expect(reactions).toHaveLength(0);
  });

  it('settles without the details when they are late, and writes them when they land', async () => {
    gates['enrich-phase2'] = gate();
    const d = await savedDrop();
    const out = await handleSaved(d);
    expect(settleDropRow).toHaveBeenCalledWith({ entityType: 'todo', id: 'row-1' });
    expect(updateDropDetails).not.toHaveBeenCalled();
    expect(out).toMatchObject({ phase: 'complete', detailsIn: 'after_settle' });
    gates['enrich-phase2'].open();
    await flush();
    expect(updateDropDetails).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.anything(),
      expect.objectContaining({ tags: ['family'] }),
      expect.objectContaining({ settle: false }),
    );
  });

  it("puts the writer's words on an unclear drop when they are the writer's own", async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'note-1',
      entityType: 'note',
    });
    const d = await savedDrop({
      bucket: 'log',
      subtype: 'general',
      needsClarification: true,
      ambiguityType: 'bucket',
      clarificationQuestion: 'Do or remember?',
      clarificationOptions: [
        { id: 'a', label: 'Do', action: {} },
        { id: 'b', label: 'Remember', action: {} },
      ] as any,
    });
    const out = await handleSaved(d);
    expect(updateDropQuestion).toHaveBeenCalledWith(
      { entityType: 'note', id: 'note-1' },
      expect.objectContaining({ question: 'Is this something to do, or to remember?' }),
      { settle: true },
    );
    expect(out).toMatchObject({ phase: 'complete', detailsIn: 'not_asked' });
  });

  it("keeps the classifier's question when the writer gave only the fixed copy", async () => {
    replies['clarify-ambiguity'] = {
      ...(replies['clarify-ambiguity'] as object),
      question_source: 'fallback',
      labels_source: 'fallback',
    };
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'note-2',
      entityType: 'note',
    });
    const d = await savedDrop({
      bucket: 'log',
      subtype: 'general',
      needsClarification: true,
      ambiguityType: 'bucket',
    });
    await handleSaved(d);
    expect(updateDropQuestion).toHaveBeenCalledWith({ entityType: 'note', id: 'note-2' }, null, {
      settle: true,
    });
  });

  it('settles an unclear drop with its own question when the writer is late, and never changes it after', async () => {
    gates['clarify-ambiguity'] = gate();
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'note-3',
      entityType: 'note',
    });
    const d = await savedDrop({
      bucket: 'log',
      subtype: 'general',
      needsClarification: true,
      ambiguityType: 'bucket',
    });
    await handleSaved(d);
    expect(settleDropRow).toHaveBeenCalledWith({ entityType: 'note', id: 'note-3' });
    gates['clarify-ambiguity'].open();
    await flush();
    expect(updateDropQuestion).not.toHaveBeenCalled();
  });

  it('saves a drop an older build left with its details, settled, with its reminder', async () => {
    const d = drop({
      phase: 'saved',
      classifyEngine: 'v3',
      bucket: 'todo',
      smartTitle: 'Old one',
      tags: ['x'],
      timeEstimateMinutes: 15,
      autoReminder: true,
      reminderDate: '2026-10-10',
      reminderTime: '08:00',
    });
    const out = await handleSaved(d);
    const [, enrichment, opts] = (syncDropToSupabase as jest.Mock).mock.calls[0];
    expect(enrichment).toMatchObject({ tags: ['x'], time_estimate_minutes: 15 });
    expect(opts.stage).toBe('settled');
    expect(scheduleDropReminder).toHaveBeenCalled();
    expect(out).toMatchObject({ phase: 'complete', supabaseId: 'row-1', resumed: true });
  });

  it('puts the title and answer on a row an earlier try had saved without them', async () => {
    replies['minddrop-relate'] = RELATION;
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'row-1',
      entityType: 'todo',
      duplicate: true,
    });
    (runClassifyV3 as jest.Mock).mockResolvedValue(v3({ bucket: 'todo' }));
    const q = await handleQueued(drop({ text: 'call mum about sunday' }));
    await flush();
    await handleSorted(q);
    expect(updateDropWords).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      { smartTitle: 'Call mum about Sunday', reaction: 'She will love that.' },
      'Call mum about sunday',
    );
    expect(attachDropRelation).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-1' },
      expect.objectContaining({ kind: 'edit' }),
    );
  });

  it('after a restart asks for a late title again, with the kind, and still settles', async () => {
    const d = drop({
      phase: 'saved',
      classifyEngine: 'v3',
      bucket: 'todo',
      supabaseId: 'row-9',
      entityType: 'todo',
      smartTitle: 'Call mum about sunday',
      wordsPending: true,
      sortedAt: 1,
      savedAt: 2,
    });
    const out = await handleSaved(d);
    await flush();
    expect(sentOf('enrich-phase1-5a')[0]).toMatchObject({ bucket: 'todo' });
    expect(updateDropWords).toHaveBeenCalledWith(
      { entityType: 'todo', id: 'row-9' },
      expect.objectContaining({ smartTitle: 'Call mum about Sunday' }),
      'Call mum about sunday',
    );
    expect(out).toMatchObject({ phase: 'complete', resumed: true, detailsIn: 'in_time' });
    // nothing in the bubble about a drop from before the restart
    expect(reactions).toHaveLength(0);
  });

  it('gives a drop sorted before a restart a fresh five seconds, and marks its timings', async () => {
    gates['enrich-phase2'] = gate();
    const d = sorted({ smartTitle: 'Call mum', sortedAt: 1 });
    const saved = await handleSorted(d);
    expect(saved.resumed).toBe(true);
    const pending = handleSaved(saved);
    await new Promise((r) => setTimeout(r, 20));
    gates['enrich-phase2'].open();
    const out = await pending;
    // the old sortedAt does not count: the details were in time
    expect(out.detailsIn).toBe('in_time');
  });
});

// ── the router ───────────────────────────────────────────────────────────

describe('getPhaseHandler', () => {
  it('runs the new phases', () => {
    expect(getPhaseHandler('queued')).toBe(handleQueued);
    expect(getPhaseHandler('sorted')).toBe(handleSorted);
    expect(getPhaseHandler('saved')).toBe(handleSaved);
    expect(getPhaseHandler('complete')).toBeNull();
    expect(getPhaseHandler('failed')).toBeNull();
  });

  it("runs an older build's phase as the phase it moves to", () => {
    expect(getPhaseHandler('classified')).toBe(handleSorted);
    expect(getPhaseHandler('titled')).toBe(handleSorted);
    expect(getPhaseHandler('multi_detected')).toBe(handleSorted);
    expect(getPhaseHandler('enriched')).toBe(handleSaved);
    expect(getPhaseHandler('syncing')).toBe(handleSaved);
  });
});

describe('forgetDropCalls', () => {
  it('asks again for a drop it has let go of', async () => {
    const d = sorted({ smartTitle: 'Call mum' });
    await handleSorted(d);
    forgetDropCalls(d.localId);
    await handleSorted(d);
    await flush();
    expect(sentOf('enrich-phase2')).toHaveLength(2);
  });
});
