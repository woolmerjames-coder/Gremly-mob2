/**
 * dropProcessor.processingLocks.test.ts
 *
 * Tests for the processingLocks guard that prevents duplicate
 * processing of the same drop by multiple callers (useMindDropSubmit,
 * useDropRecovery, offlineSync).
 *
 * The processingLocks Set ensures only one processDrop() invocation
 * runs for a given localId at a time. Additional calls return early
 * with { success: false }.
 */

import type { QueuedDrop } from '../dropQueue';

// We need to mock all external dependencies before importing processDrop.

// Mock dropQueue
const mockUpdateDrop = jest.fn().mockResolvedValue(undefined);
const mockMarkFailed = jest.fn().mockResolvedValue(undefined);
const mockDequeue = jest.fn().mockResolvedValue(undefined);
const mockGetPendingDrops = jest.fn().mockResolvedValue([]);
jest.mock('../dropQueue', () => ({
  updateDrop: (...args: any[]) => mockUpdateDrop(...args),
  markFailed: (...args: any[]) => mockMarkFailed(...args),
  dequeue: (...args: any[]) => mockDequeue(...args),
  getPendingDrops: () => mockGetPendingDrops(),
}));

// Mock detectMulti
jest.mock('../detectMulti', () => ({
  detectMulti: jest.fn().mockResolvedValue({ is_multi: false }),
}));

// Mock phase1
jest.mock('../phase1', () => ({
  runPhase1: jest.fn().mockResolvedValue({
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    confidence: 0.9,
    smart_title: 'Test',
    confirmation_message: 'Done',
  }),
}));

// Mock phase1_5
jest.mock('../../ai/phase1_5', () => ({
  shouldRunPhase1_5: jest.fn().mockReturnValue(false),
  runPhase1_5: jest.fn(),
}));

// Mock calculateBuffers
jest.mock('../../planning', () => ({
  calculateBuffers: jest.fn().mockReturnValue({
    prep_buffer_minutes: 0,
    cooldown_buffer_minutes: 0,
  }),
}));

// Mock Zustand store
jest.mock('../../store/useGremlyStore', () => {
  const state = {
    userId: 'test-user',
    gremlyAge: 5,
    todos: [],
    habits: [],
    notes: [],
    settings: {},
  };
  return {
    useGremlyStore: Object.assign(
      (selector: any) => (typeof selector === 'function' ? selector(state) : state),
      {
        getState: () => state,
        setState: jest.fn(),
        subscribe: () => () => {},
      },
    ),
  };
});

// Mock EventBus
jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: jest.fn() },
}));

// Mock Supabase - make insert hang so we can test concurrent calls
let insertResolve: ((value: any) => void) | null = null;
const mockInsert = jest.fn().mockImplementation(() => ({
  select: () => ({
    single: () =>
      new Promise((resolve) => {
        insertResolve = resolve;
      }),
  }),
}));

jest.mock('../../supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (...args: any[]) => mockInsert(...args),
    }),
  },
}));

// Mock dateService
jest.mock('../../date/DateService', () => ({
  dateService: { today: () => '2026-02-26' },
  getDateService: () => ({
    now: () => new Date('2026-02-26T12:00:00.000Z'),
    getTimezone: () => 'America/New_York',
  }),
  nowTimestamp: () => '2026-02-26T12:00:00.000Z',
}));

// Mock textNormalization
jest.mock('../../cortex/textNormalization', () => ({
  buildTodoFields: jest.fn().mockReturnValue({}),
}));

// Mock frequencyUtils
jest.mock('../../habits/frequencyUtils', () => ({
  parseFrequencyString: jest.fn().mockReturnValue(null),
}));

// Mock notifications
jest.mock('../../notifications/itemReminderService', () => ({
  scheduleItemReminder: jest.fn(),
  scheduleQuickReminder: jest.fn(),
}));
jest.mock('../../../src/utils/notifications', () => ({
  hasNotificationPermission: jest.fn().mockResolvedValue(false),
}));

// Mock env
jest.mock('../../env', () => ({
  env: { CORTEX_WORKER_URL: 'https://test' },
  getEnv: () => ({ CORTEX_WORKER_URL: 'https://test' }),
}));

// Import after mocks
import { processDrop } from '../dropProcessor';

function makeDrop(localId: string): QueuedDrop {
  return {
    localId,
    text: 'test drop',
    spaceId: null,
    status: 'queued',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    source: 'minddrop',
  } as QueuedDrop;
}

describe('processDrop - processingLocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    insertResolve = null;
  });

  it('returns early with success: false when same localId is already processing', async () => {
    const drop = makeDrop('lock-test-1');

    // Start first call — it will hang on the Supabase insert
    const firstCall = processDrop(drop);

    // Second call with same localId should return immediately
    const secondResult = await processDrop(drop);

    expect(secondResult.success).toBe(false);
    expect(secondResult.error?.message).toContain('Already processing');

    // Resolve the first call so it cleans up
    if (insertResolve) {
      insertResolve({ data: { id: 'supabase-1' }, error: null });
    }
    await firstCall.catch(() => {});
  });

  it('allows processing different localIds concurrently', async () => {
    const drop1 = makeDrop('lock-test-2a');
    const drop2 = makeDrop('lock-test-2b');

    // Start first call — it will hang on the Supabase insert
    const firstCall = processDrop(drop1);

    // Second call with DIFFERENT localId should NOT be blocked by lock
    const secondResult = await processDrop(drop2);

    // The key assertion: drop2 was NOT blocked by drop1's lock.
    // If the lock was wrongly global (not per-localId), we'd get "Already processing".
    if (!secondResult.success && secondResult.error) {
      expect(secondResult.error.message).not.toContain('Already processing');
    }

    // Resolve the first call so it cleans up
    if (insertResolve) {
      insertResolve({ data: { id: 'supabase-1' }, error: null });
    }
    await firstCall.catch(() => {});
  });

  it('releases the lock after processing completes (success or failure)', async () => {
    // Mock a fast-completing insert
    mockInsert.mockImplementationOnce(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'fast-1' }, error: null }),
      }),
    }));

    const drop = makeDrop('lock-test-3');

    // First call completes
    await processDrop(drop);

    // Mock insert again for second call
    mockInsert.mockImplementationOnce(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'fast-2' }, error: null }),
      }),
    }));

    // Second call with SAME localId should now succeed (lock was released)
    const result = await processDrop(drop);

    // Should NOT get "Already processing" — the lock should have been released
    // (May still fail for other pipeline reasons, but not due to lock)
    if (result.error) {
      expect(result.error.message).not.toContain('Already processing');
    }
  });

  it('releases the lock even when processing throws an error', async () => {
    // Mock phase1 to throw
    const { runPhase1 } = require('../phase1');
    runPhase1.mockRejectedValueOnce(new Error('AI service down'));

    const drop = makeDrop('lock-test-4');

    // First call fails
    const firstResult = await processDrop(drop);
    expect(firstResult.success).toBe(false);

    // Reset phase1 mock
    runPhase1.mockResolvedValueOnce({
      bucket: 'todo',
      subtype: null,
      habitSubtype: null,
      confidence: 0.9,
      smart_title: 'Test',
      confirmation_message: 'Done',
    });

    // Mock insert for second call
    mockInsert.mockImplementationOnce(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'fast-3' }, error: null }),
      }),
    }));

    // Second call should NOT be blocked — lock was released in finally block
    const secondResult = await processDrop(drop);
    if (secondResult.error) {
      expect(secondResult.error.message).not.toContain('Already processing');
    }
  });
});
