/**
 * A drop that failed is tried again, never lost (the planning chat's final
 * check, item 1): retryFailedDrops puts every failed drop back at the phase it
 * failed in, and an older build's degraded item is read again with classify-v3.
 */

const mockState = {
  userId: 'user-1',
  todos: [] as any[],
  habits: [] as any[],
  notes: [] as any[],
};
const mockUpdate = jest.fn();

jest.mock('../dropQueue', () => ({
  getQueue: jest.fn(),
  saveDrop: jest.fn(),
  dequeue: jest.fn(),
  migrateDropPhases: jest.fn(),
  loadQueueIntoZustand: jest.fn(),
}));
jest.mock('../dropPhases', () => ({
  CLASSIFY_V3_TIMEOUT_MS: 10000,
  getPhaseHandler: jest.fn(),
  forgetDropCalls: jest.fn(),
}));
jest.mock('../phase1', () => ({ runClassifyV3: jest.fn() }));
jest.mock('../fileDrop', () => ({ fileDropItem: jest.fn(), startedDropFiling: jest.fn() }));
jest.mock('../dropSync', () => ({ kindWordOf: jest.fn() }));
jest.mock('../../changes/links', () => ({ copyLinks: jest.fn() }));
jest.mock('../../appEvents', () => ({ logAppEvent: jest.fn() }));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(() => null, {
    getState: () => mockState,
    setState: jest.fn(),
  }),
}));
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => {
        mockUpdate(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));
jest.mock('../../date/DateService', () => ({
  nowTimestamp: () => '2026-10-10T12:00:00Z',
  getDateService: () => ({ now: () => new Date('2026-10-10T12:00:00Z') }),
}));
jest.mock('../../events/EventBus', () => ({ eventBus: { emit: jest.fn() } }));
jest.mock('../../network/NetworkStatus', () => ({ networkStatus: { isConnected: true } }));

import { reclassifyDegradedEntities, retryFailedDrops } from '../dropPipeline';
import { getQueue, saveDrop } from '../dropQueue';
import { runClassifyV3 } from '../phase1';

const drop = (localId: string, extra: Record<string, unknown>) => ({
  localId,
  text: 'words',
  source: 'minddrop',
  createdAt: '2026-10-10T11:00:00Z',
  status: 'queued',
  retryCount: 0,
  ...extra,
});

beforeEach(() => {
  mockState.todos = [];
  mockState.habits = [];
  mockState.notes = [];
  (saveDrop as jest.Mock).mockResolvedValue(undefined);
});

describe('retryFailedDrops', () => {
  it('puts every failed drop back at the phase it failed in, with its tries counted again', async () => {
    (getQueue as jest.Mock).mockResolvedValue([
      drop('a', { phase: 'failed', failedAtPhase: 'queued', retryCount: 3, lastError: 'x' }),
      drop('b', { phase: 'failed', failedAtPhase: 'saved', retryCount: 3, lastError: 'y' }),
      drop('c', { phase: 'sorted' }),
    ]);
    await expect(retryFailedDrops()).resolves.toBe(2);
    expect(saveDrop).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ phase: 'queued', retryCount: 0, lastError: null }),
    );
    expect(saveDrop).toHaveBeenCalledWith(
      'b',
      expect.objectContaining({ phase: 'saved', retryCount: 0, lastError: null }),
    );
    expect(saveDrop).not.toHaveBeenCalledWith('c', expect.anything());
  });

  it('does nothing when no drop has failed', async () => {
    (getQueue as jest.Mock).mockResolvedValue([drop('c', { phase: 'saved' })]);
    await expect(retryFailedDrops()).resolves.toBe(0);
    expect(saveDrop).not.toHaveBeenCalled();
  });
});

describe('reclassifyDegradedEntities', () => {
  const degraded = {
    id: 'n1',
    body: 'call the dentist',
    created_at: '2026-10-01T09:00:00Z',
    updated_at: '2026-10-01T09:00:00Z',
    views: { ai_degraded: true },
  };

  it('reads an older degraded item again with classify-v3', async () => {
    mockState.notes = [degraded];
    (runClassifyV3 as jest.Mock).mockResolvedValue({
      phase1: { bucket: 'log', subtype: 'general', source: 'api' },
      multi: { is_multi: false },
      latencyMs: 900,
    });
    await reclassifyDegradedEntities();
    expect(runClassifyV3).toHaveBeenCalledWith('call the dentist', {}, 10000);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ views: expect.objectContaining({ ai_degraded: false }) }),
    );
  });

  it('leaves it for later when the classifier does not answer', async () => {
    mockState.notes = [degraded];
    (runClassifyV3 as jest.Mock).mockResolvedValue(null);
    await reclassifyDegradedEntities();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
