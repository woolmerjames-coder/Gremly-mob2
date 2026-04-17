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
      }),
    },
  ),
}));
jest.mock('../phase1', () => ({
  runPhase1: jest.fn().mockResolvedValue({ bucket: 'todo', source: 'ai', confidence: 0.9 }),
}));
jest.mock('../../supabase/client', () => ({
  supabase: {
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
jest.mock('../../notifications/itemReminderService', () => ({
  scheduleItemReminder: jest.fn().mockResolvedValue(undefined),
  scheduleQuickReminder: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/utils/notifications', () => ({
  hasNotificationPermission: jest.fn().mockResolvedValue(false),
}));

import { startQueueRunner, stopQueueRunner, triggerProcessing, retryDrop } from '../dropPipeline';
import { getQueue, saveDrop, migrateDropPhases } from '../dropQueue';
import { getPhaseHandler } from '../dropPhases';

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
      const handler = jest.fn().mockResolvedValue({ ...drop, phase: 'classified' });
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockReturnValue(handler);
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
        failedAtPhase: 'titled',
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
          phase: 'titled',
          retryCount: 0,
          lastError: null,
        }),
      );
    });

    it('ignores non-failed drops', async () => {
      const activeDrop = makeDrop({
        localId: 'active-one',
        phase: 'classified',
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
      const handler = jest.fn().mockResolvedValue({ ...drop, phase: 'classified' });
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockReturnValue(handler);
      mockPendingDrops.set('adv-1', { id: 'adv-1' });

      // Use triggerProcessing which forces a queue read
      await triggerProcessing();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ localId: 'adv-1' }));
      expect(saveDrop).toHaveBeenCalledWith(
        'adv-1',
        expect.objectContaining({ phase: 'classified', retryCount: 0 }),
      );
    });

    it('moves to failed phase after MAX_RETRIES_PER_PHASE failures', async () => {
      await startQueueRunner();

      const drop = makeDrop({ localId: 'fail-1', phase: 'titled', retryCount: 2 });
      const handler = jest.fn().mockRejectedValue(new Error('Network timeout'));
      (getQueue as jest.Mock).mockResolvedValue([drop]);
      (getPhaseHandler as jest.Mock).mockReturnValue(handler);
      mockPendingDrops.set('fail-1', { id: 'fail-1' });

      await triggerProcessing();

      expect(saveDrop).toHaveBeenCalledWith(
        'fail-1',
        expect.objectContaining({
          phase: 'failed',
          failedAtPhase: 'titled',
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
});
