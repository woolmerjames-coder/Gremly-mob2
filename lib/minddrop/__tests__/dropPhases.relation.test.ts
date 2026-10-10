/**
 * The already have it answer in the new order (Mind Drop rethink stage 4):
 * asked once, at the tap; the drop is saved as its own kind (never held as a
 * note); the answer is attached to the saved item whenever it lands. Which
 * surface it gets (card before the settle, Sweep after) is decided in
 * dropSync.attachDropRelation (dropSync.test.ts).
 */
import type { QueuedDrop } from '../dropQueue';

jest.mock('../phase1', () => ({ runClassifyV3: jest.fn() }));
jest.mock('../../config/featureFlags', () => ({
  FEATURE_FLAGS: { HEURISTIC_LOGGING_ENABLED: false },
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
jest.mock('../dropReminder', () => ({ scheduleDropReminder: jest.fn() }));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(() => ({}), {
    getState: () => ({ userId: 'user-1', recentSpeech: [], pushRecentSpeech: jest.fn() }),
    setState: jest.fn(),
  }),
}));
jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../chat/entityCards', () => ({
  applyEntityChange: jest.fn(),
  formatDay: (d: string) => d,
  formatTime: (t: string) => t,
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../date/DateService', () => ({
  nowTimestamp: () => '2026-09-30T12:00:00Z',
  dateService: { today: () => '2026-09-30', now: () => new Date('2026-09-30T12:00:00Z') },
  getDateService: () => ({
    today: () => '2026-09-30',
    now: () => new Date('2026-09-30T12:00:00Z'),
    dayNow: () => new Date('2026-09-30T12:00:00Z'),
    getTimezone: () => 'Europe/London',
  }),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex' },
  getEnv: (key: string) => (key === 'EXPO_PUBLIC_CORTEX_URL' ? 'https://test.cortex' : undefined),
}));

import { DROP_WAITS, handleQueued, handleSaved, handleSorted } from '../dropPhases';
import { runClassifyV3 } from '../phase1';
import {
  attachDropRelation,
  settleDropRow,
  syncDropToSupabase,
  updateDropDetails,
} from '../dropSync';

const complete = {
  kind: 'edit',
  intent: 'complete',
  entity: {
    id: 't1',
    type: 'todo',
    title: 'Arrange a Pet Sitter for Pepper',
    due_day: null,
    due_time: null,
  },
  others: [],
  confidence: 95,
  change: { field: 'completed', from: null, to: 'done' },
};

let n = 0;
function drop(over: Partial<QueuedDrop> = {}): QueuedDrop {
  n += 1;
  return {
    localId: `r-${n}`,
    text: 'Booked the pet sitter',
    source: 'minddrop',
    spaceId: null,
    createdAt: '2026-09-30T12:00:00Z',
    status: 'queued',
    phase: 'queued',
    retryCount: 0,
    ...over,
  } as QueuedDrop;
}

let relateReply: unknown = { enabled: true, relation: complete };
let relateGate: Promise<void> | null = null;
const realFetch = global.fetch;

const relateCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    (c) => JSON.parse(c[1].body).type === 'minddrop-relate',
  );
const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  jest.clearAllMocks();
  relateReply = { enabled: true, relation: complete };
  relateGate = null;
  DROP_WAITS.wordsAfterSortMs = 10;
  DROP_WAITS.settleMs = 30;
  global.fetch = jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (body.type === 'minddrop-relate') {
      if (relateGate) await relateGate;
      return { ok: true, json: async () => relateReply };
    }
    if (body.type === 'enrich-phase1-5a') {
      return { ok: true, json: async () => ({ smart_title: 'Booked the pet sitter' }) };
    }
    return { ok: true, json: async () => ({}) };
  }) as any;
  (syncDropToSupabase as jest.Mock).mockResolvedValue({
    success: true,
    supabaseId: 'row-1',
    entityType: 'todo',
  });
});

afterEach(async () => {
  await flush();
  global.fetch = realFetch;
});

async function sortAndSave(d: QueuedDrop, phase1: Record<string, unknown>, multi?: unknown) {
  (runClassifyV3 as jest.Mock).mockResolvedValue({
    phase1: { subtype: null, habitSubtype: null, confidence: 0.9, source: 'api', ...phase1 },
    multi: multi ?? { is_multi: false },
  });
  const sorted = await handleQueued(d);
  await flush();
  return handleSorted(sorted);
}

describe('the already have it answer in the new order', () => {
  it('is asked once, at the tap, and saved on the item as its own kind', async () => {
    const out = await sortAndSave(drop(), { bucket: 'todo' });
    expect(relateCalls()).toHaveLength(1);
    const [saved, , opts] = (syncDropToSupabase as jest.Mock).mock.calls[0];
    // saved as a todo, not held as a note
    expect(opts.kind.bucket).toBe('todo');
    expect(saved.relation).toBeUndefined();
    expect(opts.extraViews.relation).toMatchObject({
      status: 'pending',
      surface: 'card',
      kind: 'edit',
      classified: { bucket: 'todo' },
    });
    expect(out.relationPending).toBe(false);
  });

  it('attaches to a habit when it lands after the save', async () => {
    let open = () => {};
    relateGate = new Promise<void>((r) => {
      open = r;
    });
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'h-1',
      entityType: 'habit',
    });
    const out = await sortAndSave(drop({ text: 'went for my run' }), {
      bucket: 'habit',
      habitSubtype: 'start_habit',
    });
    expect(out.relationPending).toBe(true);
    open();
    await flush();
    expect(attachDropRelation).toHaveBeenCalledWith(
      { entityType: 'habit', id: 'h-1' },
      expect.objectContaining({
        status: 'pending',
        classified: expect.objectContaining({ bucket: 'habit', habitSubtype: 'start_habit' }),
      }),
    );
  });

  it('files the drop as it is when the switch is off', async () => {
    relateReply = { enabled: false, relation: null };
    await sortAndSave(drop(), { bucket: 'todo' });
    await flush();
    const opts = (syncDropToSupabase as jest.Mock).mock.calls[0][2];
    expect(opts.extraViews.relation).toBeUndefined();
    expect(attachDropRelation).not.toHaveBeenCalled();
  });

  it('does not attach to drops addressed to Gremly', async () => {
    await sortAndSave(drop({ text: 'hey gremly how are you' }), {
      bucket: 'log',
      subtype: 'general',
      is_ambiguous: true,
      ambiguity_type: 'conversation',
      clarification_question: 'Want to chat?',
      clarification_options: [
        { id: 'a', label: 'Chat', action: {} },
        { id: 'b', label: 'Keep it', action: {} },
      ],
    });
    await flush();
    const opts = (syncDropToSupabase as jest.Mock).mock.calls[0][2];
    expect(opts.extraViews.relation).toBeUndefined();
    expect(attachDropRelation).not.toHaveBeenCalled();
  });

  it('is not asked for a quick add from Today', async () => {
    await sortAndSave(drop({ source: 'today' }), { bucket: 'todo' });
    expect(relateCalls()).toHaveLength(0);
  });

  it('is let go for a drop with several things in it (stage 7 checks the pieces)', async () => {
    await sortAndSave(
      drop({ text: 'booked the sitter, buy milk' }),
      { bucket: 'todo' },
      {
        is_multi: true,
        split: 'unsure',
        as_one: { bucket: 'todo', subtype: null, habitSubtype: null },
        segments: [
          { text: 'booked the sitter', bucket: 'todo' },
          { text: 'buy milk', bucket: 'todo' },
        ],
      },
    );
    await flush();
    const opts = (syncDropToSupabase as jest.Mock).mock.calls[0][2];
    expect(opts.extraViews.relation).toBeUndefined();
    expect(attachDropRelation).not.toHaveBeenCalled();
  });

  it('holds the settle for an answer still on its way, so a duplicate known in time is on the card', async () => {
    // the stage 6 simulator check: the answer landed a second after the details
    let open = () => {};
    relateGate = new Promise<void>((r) => {
      open = r;
    });
    DROP_WAITS.settleMs = 2000;
    const saved = await sortAndSave(drop({ text: 'ring the vet about the booster jab' }), {
      bucket: 'todo',
    });
    expect(saved.relationPending).toBe(true);
    const settling = handleSaved(saved);
    await flush();
    expect(updateDropDetails).not.toHaveBeenCalled();
    expect(settleDropRow).not.toHaveBeenCalled();
    open();
    const out = await settling;
    const attached = (attachDropRelation as jest.Mock).mock.invocationCallOrder[0];
    const settledAt = Math.min(
      (updateDropDetails as jest.Mock).mock.invocationCallOrder[0] ?? Infinity,
      (settleDropRow as jest.Mock).mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(settledAt).toBeLessThan(Infinity);
    expect(attached).toBeLessThan(settledAt);
    expect(out.relationIn).toBe('in_time');
  });

  it('settles at the five seconds without an answer still out, which then goes to Sweep', async () => {
    let open = () => {};
    relateGate = new Promise<void>((r) => {
      open = r;
    });
    const saved = await sortAndSave(drop(), { bucket: 'todo' });
    const out = await handleSaved(saved);
    expect(out.relationIn).toBe('after_settle');
    expect(attachDropRelation).not.toHaveBeenCalled();
    open();
    await flush();
    expect(attachDropRelation).toHaveBeenCalled();
  });

  it('records that an answer in before the save was in time', async () => {
    const saved = await sortAndSave(drop(), { bucket: 'todo' });
    const out = await handleSaved(saved);
    expect(out.relationIn).toBe('in_time');
  });
});
