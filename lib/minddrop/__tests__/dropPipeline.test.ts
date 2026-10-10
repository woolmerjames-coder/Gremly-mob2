/**
 * dropPipeline Tests
 *
 * Tests for the queue runner and pipeline infrastructure:
 * - phaseToUIStatus / phaseToUIStage mapping
 * - processOne: phase advancement, retry logic, failure handling
 * - startQueueRunner / stopQueueRunner lifecycle
 * - retryDrop: resetting failed drops
 * - triggerProcessing: event-driven ticks
 */

import type { QueuedDrop, DropPhase } from '../dropQueue';

// Track Zustand updates
const mockPendingDrops = new Map();
const mockUpdatePendingDrop = jest.fn();

jest.mock('../dropQueue', () => ({
  getQueue: jest.fn().mockResolvedValue([]),
  saveDrop: jest.fn().mockResolvedValue(undefined),
  dequeue: jest.fn().mockResolvedValue(undefined),
  migrateDropPhases: jest.fn().mockResolvedValue(0),
  loadQueueIntoZustand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../dropPhases', () => ({
  getPhaseHandler: jest.fn().mockReturnValue(null),
  forgetDropCalls: jest.fn(),
}));
jest.mock('../../appEvents', () => ({ logAppEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex' },
  getEnv: () => undefined,
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(
    (selector: any) =>
      selector({
        habits: [],
        habitProgress: [],
        pendingDrops: mockPendingDrops,
        updatePendingDrop: mockUpdatePendingDrop,
        updatePendingDropEnrichment: jest.fn(),
        promotePendingDrop: jest.fn(),
        removePendingDrop: jest.fn(),
      }),
    {
      getState: () => ({
        userId: 'user-1',
        todos: [],
        habits: [],
        notes: [],
        pendingDrops: mockPendingDrops,
        updatePendingDrop: mockUpdatePendingDrop,
        updatePendingDropEnrichment: jest.fn(),
        promotePendingDrop: jest.fn(),
        removePendingDrop: jest.fn(),
        incrementDropCount: jest.fn().mockResolvedValue({ didAgeUp: false }),
        setDropFiling: jest.fn(),
      }),
    },
  ),
}));
jest.mock('../phase1', () => ({
  runPhase1: jest.fn().mockResolvedValue({ bucket: 'todo', source: 'ai', confidence: 0.9 }),
  runClassifyV3: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }),
          }),
        }),
      }),
    }),
  },
}));
jest.mock('../../date/DateService', () => ({
  nowTimestamp: () => '2026-03-30T12:00:00Z',
  dateService: { today: () => '2026-03-30' },
  getDateService: () => ({
    today: () => '2026-03-30',
    now: () => new Date('2026-03-30T12:00:00'),
  }),
}));
jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
}));
jest.mock('../../network/NetworkStatus', () => ({
  networkStatus: { isConnected: true },
}));
jest.mock('../../notifications/ask', () => ({
  maybeAsk: jest.fn().mockResolvedValue(false),
}));

import { startDropFiling } from '../fileDrop';
import {
  dropTimingMeta,
  startQueueRunner,
  stopQueueRunner,
  triggerProcessing,
  retryDrop,
} from '../dropPipeline';
import { getQueue, saveDrop, migrateDropPhases, dequeue } from '../dropQueue';
import { forgetDropCalls, getPhaseHandler } from '../dropPhases';
import { logAppEvent } from '../../appEvents';

// ── Helpers ──────────────────────────────────────────────────────

function makeDrop(overrides: Partial<QueuedDrop> = {}): QueuedDrop {
  return {
    localId: 'test-drop-1',
    text: 'Buy groceries',
    spaceId: null,
    source: 'minddrop' as const,
    createdAt: '2026-03-30T12:00:00Z',
    status: 'queued' as const,
    retryCount: 0,
    phase: 'queued' as DropPhase,
    ...overrides,
  } as QueuedDrop;
}

// ── Tests ────────────────────────────────────────────────────────

describe('dropPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingDrops.clear();
    // Ensure runner is stopped before each test to reset isRunning
    stopQueueRunner();
    (getQueue as jest.Mock).mockResolvedValue([]);
    (getPhaseHandler as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    stopQueueRunner();
  });

  // ── Runner lifecycle ──────────────────────────────────────────

  describe('startQueueRunner / stopQueueRunner', () => {
    it('starts and migrates drops on first call', async () => {
      await startQueueRunner();
      expect(migrateDropPhases).toHaveBeenCalledTimes(1);
    });

    it('does not double-start the runner', async () => {
      await startQueueRunner();
      await startQueueRunner(); // second call is no-op
      expect(migrateDropPhases).toHaveBeenCalledTimes(1);
    });

    it('stopQueueRunner cleanly stops', async () => {
      await startQueueRunner();
      stopQueueRunner();
      // Should be safe to call again
      stopQueueRunner();
    });
  });

  // ── triggerProcessing ─────────────────────────────────────────

  describe('triggerProcessing', () => {
    it('is a no-op when runner is not started', async () => {
      stopQueueRunner();
      await triggerProcessing();
      // Nothing explodes, queue not read
    });

    it('processes drops when triggered after start', async () => {
      // Start with empty queue
      await startQueueRunner();

      // Now add a drop and trigger
      const drop = makeDrop();
      const handler = jest.fn().mockResolvedValue({ ...drop, phase: 'sorted' });
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) =>
        p === 'queued' ? handler : null,
      );
      mockPendingDrops.set('test-drop-1', { id: 'test-drop-1' });

      await triggerProcessing();

      expect(handler).toHaveBeenCalled();
      expect(saveDrop).toHaveBeenCalled();
    });
  });

  // ── retryDrop ─────────────────────────────────────────────────

  describe('retryDrop', () => {
    it('resets a failed drop to its failedAtPhase', async () => {
      const failedDrop = makeDrop({
        localId: 'retry-me',
        phase: 'failed',
        failedAtPhase: 'saved',
        retryCount: 3,
        lastError: 'Timeout',
      });
      (getQueue as jest.Mock).mockResolvedValue([failedDrop]);
      mockPendingDrops.set('retry-me', { id: 'retry-me' });

      // Need runner to be started for triggerProcessing
      await startQueueRunner();

      await retryDrop('retry-me');

      expect(saveDrop).toHaveBeenCalledWith(
        'retry-me',
        expect.objectContaining({
          phase: 'saved',
          retryCount: 0,
          lastError: null,
        }),
      );
    });

    it('ignores non-failed drops', async () => {
      const activeDrop = makeDrop({
        localId: 'active-one',
        phase: 'sorted',
      });
      (getQueue as jest.Mock).mockResolvedValue([activeDrop]);

      await retryDrop('active-one');

      // Should not save anything since it's not failed
      expect(saveDrop).not.toHaveBeenCalledWith('active-one', expect.anything());
    });

    it('ignores non-existent drops', async () => {
      (getQueue as jest.Mock).mockResolvedValue([]);

      await retryDrop('does-not-exist');
      // No crash, no save
    });

    it('defaults to queued when failedAtPhase is not set', async () => {
      const failedDrop = makeDrop({
        localId: 'no-phase',
        phase: 'failed',
        retryCount: 3,
      });
      (getQueue as jest.Mock).mockResolvedValue([failedDrop]);
      mockPendingDrops.set('no-phase', { id: 'no-phase' });

      await startQueueRunner();
      await retryDrop('no-phase');

      expect(saveDrop).toHaveBeenCalledWith(
        'no-phase',
        expect.objectContaining({
          phase: 'queued',
          retryCount: 0,
        }),
      );
    });
  });

  // ── processOne behavior (via triggerProcessing) ────────────────

  describe('phase advancement via triggerProcessing', () => {
    it('advances a queued drop through its phase handler', async () => {
      // Start runner with empty queue first
      await startQueueRunner();

      // Now set up the drop and handler
      const drop = makeDrop({ localId: 'adv-1', phase: 'queued' });
      const handler = jest.fn().mockResolvedValue({ ...drop, phase: 'sorted' });
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) =>
        p === 'queued' ? handler : null,
      );
      mockPendingDrops.set('adv-1', { id: 'adv-1' });

      // Use triggerProcessing which forces a queue read
      await triggerProcessing();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ localId: 'adv-1' }));
      expect(saveDrop).toHaveBeenCalledWith(
        'adv-1',
        expect.objectContaining({ phase: 'sorted', retryCount: 0 }),
      );
    });

    it('moves to failed phase after MAX_RETRIES_PER_PHASE failures', async () => {
      await startQueueRunner();

      const drop = makeDrop({ localId: 'fail-1', phase: 'saved', retryCount: 2 });
      const handler = jest.fn().mockRejectedValue(new Error('Network timeout'));
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockReturnValue(handler);
      mockPendingDrops.set('fail-1', { id: 'fail-1' });

      await triggerProcessing();

      expect(saveDrop).toHaveBeenCalledWith(
        'fail-1',
        expect.objectContaining({
          phase: 'failed',
          failedAtPhase: 'saved',
        }),
      );
    });

    it('skips terminal-phase drops', async () => {
      await startQueueRunner();

      const completeDrop = makeDrop({ localId: 'done-1', phase: 'complete' });
      (getQueue as jest.Mock).mockResolvedValue([completeDrop]);
      (getPhaseHandler as jest.Mock).mockReturnValue(null); // terminal

      // Clear any calls from startQueueRunner
      (saveDrop as jest.Mock).mockClear();

      await triggerProcessing();

      // Should not attempt to save or process
      expect(saveDrop).not.toHaveBeenCalled();
    });
  });

  // ── The new order (Mind Drop rethink stage 4) ────────────────────

  describe('queued, sorted, saved, complete', () => {
    const realFetch = global.fetch;
    beforeEach(() => {
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
    });
    afterEach(() => {
      global.fetch = realFetch;
    });

    const tap = Date.parse('2026-03-30T12:00:00Z');
    const handlersFor = (localId: string) => ({
      queued: jest.fn(async (d: QueuedDrop) => ({ ...d, phase: 'sorted', sortedAt: tap + 2000 })),
      sorted: jest.fn(async (d: QueuedDrop) => ({
        ...d,
        phase: 'saved',
        savedAt: tap + 2300,
        supabaseId: `row-${localId}`,
        entityType: 'todo',
        bucket: 'todo',
      })),
      saved: jest.fn(async (d: QueuedDrop) => ({
        ...d,
        phase: 'complete',
        settledAt: tap + 4000,
        detailsIn: 'in_time',
      })),
    });

    it('runs a drop through every phase, dequeues it, files it and logs its timing with no words', async () => {
      await startQueueRunner();
      const drop = makeDrop({ localId: 'new-1', phase: 'queued', text: 'call mum on sunday' });
      const h = handlersFor('new-1');
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) => (h as any)[p] ?? null);
      mockPendingDrops.set('new-1', { id: 'new-1' });

      await triggerProcessing();

      expect(h.queued).toHaveBeenCalled();
      expect(h.sorted).toHaveBeenCalled();
      expect(h.saved).toHaveBeenCalled();
      const phases = (saveDrop as jest.Mock).mock.calls
        .filter((c) => c[0] === 'new-1')
        .map((c) => c[1].phase);
      expect(phases).toEqual(['sorted', 'saved', 'complete']);
      expect(dequeue).toHaveBeenCalledWith('new-1');
      expect(forgetDropCalls).toHaveBeenCalledWith('new-1');
      await new Promise((r) => setTimeout(r, 0));
      const filed = (global.fetch as jest.Mock).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(filed).toEqual([
        expect.objectContaining({ type: 'assign-worlds', entity_id: 'row-new-1' }),
      ]);
      expect(logAppEvent).toHaveBeenCalledWith(
        'drop_timing',
        { type: 'drop', id: 'new-1' },
        expect.objectContaining({
          sorted_ms: 2000,
          saved_ms: 2300,
          settled_ms: 4000,
          details: 'in_time',
          kind: 'todo',
        }),
      );
      const meta = (logAppEvent as jest.Mock).mock.calls[0][2];
      expect(JSON.stringify(meta)).not.toContain('mum');
    });

    it('picks up a drop the app was stopped at, from its saved phase', async () => {
      const drop = makeDrop({
        localId: 'killed-1',
        phase: 'saved',
        supabaseId: 'row-killed-1',
        entityType: 'todo',
      });
      const h = handlersFor('killed-1');
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) => (h as any)[p] ?? null);
      mockPendingDrops.set('killed-1', { id: 'killed-1' });

      await startQueueRunner();

      expect(migrateDropPhases).toHaveBeenCalled();
      expect(h.queued).not.toHaveBeenCalled();
      expect(h.sorted).not.toHaveBeenCalled();
      expect(h.saved).toHaveBeenCalledWith(expect.objectContaining({ localId: 'killed-1' }));
      expect(dequeue).toHaveBeenCalledWith('killed-1');
    });

    it('a clear split’s pieces are filed as they are filled, not again at the end (stage 9)', async () => {
      await startQueueRunner();
      const drop = makeDrop({ localId: 'split-parent', phase: 'saved' });
      const done = {
        ...drop,
        phase: 'complete',
        isMulti: true,
        split: 'clear',
        pieceRows: [
          {
            entityType: 'todo',
            id: 'p0',
            dropId: 'split-split-parent-0',
            index: 0,
            text: 'buy milk',
            title: 'Buy milk',
            bucket: 'todo',
            subtype: null,
          },
          {
            entityType: 'habit',
            id: 'p1',
            dropId: 'split-split-parent-1',
            index: 1,
            text: 'walk daily',
            title: 'Walk daily',
            bucket: 'habit',
            subtype: null,
          },
        ],
      };
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) =>
        p === 'saved' ? jest.fn().mockResolvedValue(done) : null,
      );
      mockPendingDrops.set('split-parent', { id: 'split-parent' });

      await triggerProcessing();
      await new Promise((r) => setTimeout(r, 0));

      const filed = (global.fetch as jest.Mock).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(filed.filter((b) => b.type === 'assign-worlds')).toEqual([]);
      expect(logAppEvent).toHaveBeenCalledWith(
        'drop_timing',
        { type: 'drop', id: 'split-parent' },
        expect.objectContaining({ kind: 'split', split: 'clear', pieces: 2 }),
      );
    });

    it('a drop whose filing started at the save is not filed again when it completes (stage 9)', async () => {
      await startQueueRunner();
      const drop = makeDrop({
        localId: 'filed-1',
        phase: 'saved',
        supabaseId: 'row-filed-1',
        entityType: 'todo',
      });
      startDropFiling(drop);
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockImplementation((p: string) =>
        p === 'saved' ? jest.fn().mockResolvedValue({ ...drop, phase: 'complete' }) : null,
      );
      mockPendingDrops.set('filed-1', { id: 'filed-1' });
      await triggerProcessing();
      await new Promise((r) => setTimeout(r, 0));
      const filed = (global.fetch as jest.Mock).mock.calls
        .map((c) => JSON.parse(c[1].body))
        .filter((b) => b.type === 'assign-worlds');
      expect(filed).toEqual([expect.objectContaining({ entity_id: 'row-filed-1' })]);
    });
  });
});

describe('dropTimingMeta', () => {
  it('says what happened to a drop in numbers and kinds only', () => {
    const meta = dropTimingMeta(
      makeDrop({
        text: 'something private',
        createdAt: '2026-03-30T12:00:00Z',
        sortedAt: Date.parse('2026-03-30T12:00:01.900Z'),
        bucket: 'log',
        subtype: 'event',
        detailsIn: 'after_settle',
        classifyEngine: 'v3',
      }),
    );
    expect(meta).toMatchObject({
      sorted_ms: 1900,
      saved_ms: null,
      settled_ms: null,
      details: 'after_settle',
      engine: 'v3',
      kind: 'event',
      split: null,
    });
    expect(JSON.stringify(meta)).not.toContain('private');
  });
});
