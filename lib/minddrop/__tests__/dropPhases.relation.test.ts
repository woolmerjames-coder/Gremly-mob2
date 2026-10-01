/**
 * handleClassified: a drop about something the user already has is held as a
 * note carrying the question; anything else files exactly as before.
 */
import type { QueuedDrop } from '../dropQueue';

jest.mock('../dropQueue', () => ({ saveDrop: jest.fn(), getQueue: jest.fn() }));
jest.mock('../detectMulti', () => ({ detectMulti: jest.fn() }));
jest.mock('../phase1', () => ({ runPhase1: jest.fn(), runClassifyV3: jest.fn() }));
jest.mock('../../config/featureFlags', () => ({
  FEATURE_FLAGS: { CLASSIFY_V3_ENABLED: true, HEURISTIC_LOGGING_ENABLED: false },
}));
jest.mock('../dropSync', () => ({
  syncDropToSupabase: jest.fn(),
  syncMultiDropToSupabase: jest.fn(),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ userId: 'user-1', spaces: new Map() }) },
}));
jest.mock('../../chat/entityCards', () => ({ applyEntityChange: jest.fn() }));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../date/DateService', () => ({
  dateService: { today: () => '2026-09-30', now: () => new Date('2026-09-30T12:00:00') },
  getDateService: () => ({ today: () => '2026-09-30', now: () => new Date('2026-09-30T12:00:00') }),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex' },
  getEnv: (key: string) => (key === 'EXPO_PUBLIC_CORTEX_URL' ? 'https://test.cortex' : undefined),
}));

import { handleClassified, handleQueued } from '../dropPhases';
import { runClassifyV3 } from '../phase1';
import { eventBus } from '../../events/EventBus';

const complete = {
  kind: 'edit',
  intent: 'complete',
  entity: {
    id: 't1',
    type: 'todo',
    title: 'Arrange a Pet Sitter for Bella',
    due_day: null,
    due_time: null,
  },
  others: [],
  confidence: 95,
  change: { field: 'completed', from: null, to: 'done' },
};

function drop(over: Partial<QueuedDrop> = {}): QueuedDrop {
  return {
    localId: 'd1',
    text: 'Booked the pet sitter',
    source: 'minddrop',
    phase: 'classified',
    classifyEngine: 'v3',
    bucket: 'todo',
    subtype: null,
    needsClarification: false,
    retryCount: 0,
    ...over,
  } as QueuedDrop;
}

function mockWorker(relate: unknown) {
  global.fetch = jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (body.type === 'minddrop-relate') return { ok: true, json: async () => relate };
    return { ok: true, json: async () => ({ smart_title: 'Booked the Pet Sitter' }) };
  }) as any;
}

const relateCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    (c) => JSON.parse(c[1].body).type === 'minddrop-relate',
  );

describe('handleClassified: drops about things they already have', () => {
  const realFetch = global.fetch;
  beforeEach(() => eventBus.clear());
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('holds the drop as a note with the question when it relates', async () => {
    mockWorker({ enabled: true, relation: complete });
    const out = await handleClassified(drop());
    expect(out.phase).toBe('titled');
    expect(out.bucket).toBe('log');
    expect(out.relation).toMatchObject({
      status: 'pending',
      kind: 'edit',
      classified: { bucket: 'todo' },
    });
  });

  it('starts the check beside classification and uses that answer', async () => {
    mockWorker({ enabled: true, relation: complete });
    (runClassifyV3 as jest.Mock).mockResolvedValue({
      multi: { is_multi: false },
      phase1: { bucket: 'todo', subtype: null, confidence: 0.9, source: 'v3' },
    });
    const queued = await handleQueued(
      drop({ localId: 'd-early', phase: 'queued', classifyEngine: undefined, bucket: undefined }),
    );
    // asked while the drop was being classified
    expect(relateCalls()).toHaveLength(1);
    const out = await handleClassified(queued);
    // and not asked a second time
    expect(relateCalls()).toHaveLength(1);
    expect(out.relation).toMatchObject({ status: 'pending', kind: 'edit' });
  });

  it('files the drop as before when the switch is off', async () => {
    mockWorker({ enabled: false, relation: null });
    const out = await handleClassified(drop());
    expect(out.bucket).toBe('todo');
    expect(out.relation).toBeUndefined();
  });

  it('does not ask for v2 drops or drops addressed to Gremly', async () => {
    mockWorker({ enabled: true, relation: complete });
    await handleClassified(drop({ classifyEngine: 'v2' }));
    await handleClassified(
      drop({
        needsClarification: true,
        ambiguityType: 'conversation',
        clarificationQuestion: 'Want to chat?',
        clarificationOptions: [
          { id: 'a', label: 'Chat', action: {} },
          { id: 'b', label: 'Keep it', action: {} },
        ],
      }),
    );
    expect(relateCalls()).toHaveLength(0);
  });
});
