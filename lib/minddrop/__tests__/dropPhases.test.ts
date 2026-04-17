/**
 * dropPhases Tests
 *
 * Tests for the drop pipeline phase handlers and helper functions:
 * - withTimeout: soft timeout with fallback
 * - mightBeMulti: multi-entity heuristic
 * - extractTemporal: date/time pattern extraction
 * - getPhaseHandler: phase router
 * - Phase handlers: handleQueued, handleClassified, handleMultiDetected, handleTitled, handleEnriched
 */

import type { QueuedDrop, DropPhase } from '../dropQueue';

// Mock dependencies before importing
jest.mock('../dropQueue', () => ({
  saveDrop: jest.fn(),
  getQueue: jest.fn().mockResolvedValue([]),
}));
jest.mock('../detectMulti', () => ({
  detectMulti: jest.fn().mockResolvedValue({ is_multi: false }),
}));
jest.mock('../phase1', () => ({
  runPhase1: jest.fn().mockResolvedValue({
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    confidence: 0.95,
    source: 'ai',
  }),
}));
jest.mock('../dropSync', () => ({
  syncDropToSupabase: jest
    .fn()
    .mockResolvedValue({ success: true, supabaseId: 'sb-1', entityType: 'todo' }),
  syncMultiDropToSupabase: jest
    .fn()
    .mockResolvedValue({ success: true, supabaseId: 'sb-2', entityType: 'note' }),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      userId: 'user-1',
      pendingDrops: new Map(),
      recentSpeech: [],
      pushRecentSpeech: jest.fn(),
    }),
  },
}));
jest.mock('../../date/DateService', () => ({
  dateService: { today: () => '2026-03-30', now: () => new Date('2026-03-30T12:00:00') },
  getDateService: () => ({ today: () => '2026-03-30', now: () => new Date('2026-03-30T12:00:00') }),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex', supabaseAnonKey: 'test-key' },
  getEnv: (key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL') return 'https://test.cortex';
    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') return 'test-key';
    return undefined;
  },
}));

import {
  withTimeout,
  getPhaseHandler,
  handleQueued,
  handleClassified,
  handleEnriched,
} from '../dropPhases';
import { runPhase1 } from '../phase1';
import { detectMulti } from '../detectMulti';
import { syncDropToSupabase, syncMultiDropToSupabase } from '../dropSync';
import { eventBus } from '../../events/EventBus';

// ── Helpers ──────────────────────────────────────────────────────

function makeDrop(overrides: Partial<QueuedDrop> = {}): QueuedDrop {
  return {
    localId: 'test-drop-1',
    text: 'Buy groceries',
    spaceId: null,
    source: 'minddrop',
    createdAt: '2026-03-30T12:00:00Z',
    status: 'queued',
    retryCount: 0,
    phase: 'queued',
    ...overrides,
  } as QueuedDrop;
}

// ── withTimeout ──────────────────────────────────────────────────

describe('withTimeout', () => {
  it('returns promise result when it resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 1000, 'fallback');
    expect(result).toBe('fast');
  });

  it('returns fallback when promise takes longer than timeout', async () => {
    const slowPromise = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 500));
    const result = await withTimeout(slowPromise, 10, 'fallback');
    expect(result).toBe('fallback');
  });

  it('does not throw on timeout — returns fallback instead', async () => {
    const neverResolves = new Promise<string>(() => {}); // never resolves
    const result = await withTimeout(neverResolves, 10, 'safe');
    expect(result).toBe('safe');
  });
});

// ── getPhaseHandler ──────────────────────────────────────────────

describe('getPhaseHandler', () => {
  it('returns handler for queued phase', () => {
    expect(getPhaseHandler('queued')).toBe(handleQueued);
  });

  it('returns handler for classified phase', () => {
    expect(getPhaseHandler('classified')).toBeInstanceOf(Function);
  });

  it('returns handler for titled phase', () => {
    expect(getPhaseHandler('titled')).toBeInstanceOf(Function);
  });

  it('returns handler for enriched phase', () => {
    expect(getPhaseHandler('enriched')).toBe(handleEnriched);
  });

  it('returns handler for multi_detected phase', () => {
    expect(getPhaseHandler('multi_detected')).toBeInstanceOf(Function);
  });

  it('returns null for terminal phases', () => {
    expect(getPhaseHandler('complete')).toBeNull();
    expect(getPhaseHandler('failed')).toBeNull();
  });

  it('returns null for multi_awaiting (legacy)', () => {
    expect(getPhaseHandler('multi_awaiting')).toBeNull();
  });

  it('returns null for unknown phases', () => {
    expect(getPhaseHandler('unknown' as DropPhase)).toBeNull();
  });
});

// ── handleQueued ─────────────────────────────────────────────────

describe('handleQueued', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (detectMulti as jest.Mock).mockResolvedValue({ is_multi: false });
    (runPhase1 as jest.Mock).mockResolvedValue({
      bucket: 'todo',
      subtype: null,
      habitSubtype: null,
      confidence: 0.95,
      source: 'ai',
    });
  });

  it('transitions single drop from queued to classified', async () => {
    const drop = makeDrop({ text: 'Buy groceries' });
    const result = await handleQueued(drop);

    expect(result.phase).toBe('classified');
    expect(result.bucket).toBe('todo');
    expect(result.confidence).toBe(0.95);
    expect(result.retryCount).toBe(0);
    expect(result.lastError).toBeNull();
  });

  it('transitions multi-entity drop from queued to multi_detected', async () => {
    (detectMulti as jest.Mock).mockResolvedValue({
      is_multi: true,
      segments: [
        { text: 'Buy groceries', bucket: 'todo', subtype: null },
        { text: 'Feeling good', bucket: 'log', subtype: 'catchall' },
      ],
      dominant_bucket: 'log',
    });

    const drop = makeDrop({ text: 'Buy groceries and feeling good' });
    const result = await handleQueued(drop);

    expect(result.phase).toBe('multi_detected');
    expect(result.isMulti).toBe(true);
    expect(result.multiSegments).toHaveLength(2);
  });

  it('does not call detectMulti when text has no multi indicators', async () => {
    const drop = makeDrop({ text: 'hello' });
    await handleQueued(drop);

    expect(detectMulti).not.toHaveBeenCalled();
  });

  it('calls detectMulti when text contains comma', async () => {
    const drop = makeDrop({ text: 'buy milk, eggs' });
    await handleQueued(drop);

    expect(detectMulti).toHaveBeenCalled();
  });

  it('calls detectMulti when text contains " and "', async () => {
    const drop = makeDrop({ text: 'buy milk and eggs' });
    await handleQueued(drop);

    expect(detectMulti).toHaveBeenCalled();
  });

  it('preserves classificationDegraded flag', async () => {
    (runPhase1 as jest.Mock).mockResolvedValue({
      bucket: 'log',
      subtype: 'catchall',
      confidence: 0.5,
      source: 'client-fallback',
      classificationDegraded: true,
    });

    const drop = makeDrop({ text: 'note to self' });
    const result = await handleQueued(drop);

    expect(result.classificationDegraded).toBe(true);
  });
});

// ── handleEnriched ───────────────────────────────────────────────

describe('handleEnriched', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'sb-1',
      entityType: 'todo',
    });
    (syncMultiDropToSupabase as jest.Mock).mockResolvedValue({
      success: true,
      supabaseId: 'sb-2',
      entityType: 'note',
    });
  });

  it('transitions to complete after successful sync', async () => {
    const drop = makeDrop({
      phase: 'enriched',
      bucket: 'todo',
      text: 'Buy groceries',
      tags: ['shopping'],
    });

    const result = await handleEnriched(drop);

    expect(result.phase).toBe('complete');
    expect(result.supabaseId).toBe('sb-1');
    expect(result.entityType).toBe('todo');
    expect(result.retryCount).toBe(0);
    expect(result.lastError).toBeNull();
  });

  it('uses syncMultiDropToSupabase for multi drops', async () => {
    const drop = makeDrop({
      phase: 'enriched',
      isMulti: true,
      bucket: 'log',
      text: 'Buy milk and feeling good',
    });

    const result = await handleEnriched(drop);

    expect(syncMultiDropToSupabase).toHaveBeenCalled();
    expect(result.phase).toBe('complete');
  });

  it('throws on sync failure so pipeline can retry', async () => {
    (syncDropToSupabase as jest.Mock).mockResolvedValue({
      success: false,
      error: new Error('Network error'),
    });

    const drop = makeDrop({
      phase: 'enriched',
      bucket: 'todo',
      text: 'Buy groceries',
      tags: ['shopping'],
    });

    await expect(handleEnriched(drop)).rejects.toThrow('Network error');
  });

  it('builds enrichment from drop fields for single drops', async () => {
    const drop = makeDrop({
      phase: 'enriched',
      bucket: 'todo',
      text: 'Buy groceries tomorrow',
      tags: ['shopping', 'errands'],
      timeEstimateMinutes: 30,
      timeWindow: 'morning',
      extractedDate: '2026-03-31',
    });

    await handleEnriched(drop);

    expect(syncDropToSupabase).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'todo' }),
      expect.objectContaining({
        tags: ['shopping', 'errands'],
        time_estimate_minutes: 30,
        time_window: 'morning',
        extracted_date: '2026-03-31',
      }),
    );
  });
});

// ── handleQueued: drop:reaction_ready emission ───────────────────

describe('handleQueued — drop:reaction_ready emission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    (runPhase1 as jest.Mock).mockResolvedValue({
      bucket: 'todo',
      subtype: null,
      habitSubtype: null,
      confidence: 0.95,
      source: 'ai',
    });
  });

  it('emits drop:reaction_ready with null message/rawReaction and multi followUp for multi drops', async () => {
    (detectMulti as jest.Mock).mockResolvedValue({
      is_multi: true,
      segments: [
        { text: 'Buy milk', bucket: 'todo', subtype: null },
        { text: 'Feeling good', bucket: 'log', subtype: 'catchall' },
      ],
      dominant_bucket: 'log',
    });

    const handler = jest.fn();
    eventBus.on('drop:reaction_ready', handler);

    const drop = makeDrop({ text: 'Buy milk, feeling good' });
    await handleQueued(drop);

    expect(handler).toHaveBeenCalledWith({
      localId: 'test-drop-1',
      message: null,
      rawReaction: null,
      followUp: 'multi',
    });
  });
});

// ── handleClassified — drop:reaction_ready emission ──────────────

describe('handleClassified — drop:reaction_ready emission', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('emits drop:reaction_ready with rawReaction from confirmation_message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          smart_title: 'Walk Bella',
          card_note: 'Good pup time',
          confirmation_message: 'Bella time!',
          speech_message: 'Nice one! Bella time!',
        }),
    });

    const handler = jest.fn();
    eventBus.on('drop:reaction_ready', handler);

    const drop = makeDrop({
      phase: 'classified',
      bucket: 'todo',
      text: 'Walk the dog Bella',
      needsClarification: false,
    });
    await handleClassified(drop);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      localId: 'test-drop-1',
      message: 'Nice one! Bella time!',
      rawReaction: 'Bella time!',
      followUp: null,
    });
  });

  it('sets rawReaction to confirmation_message even when speech_message differs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          smart_title: 'Test Title',
          card_note: null,
          confirmation_message: 'Raw reaction here',
          speech_message: 'Decorated opener + Raw reaction here',
        }),
    });

    const handler = jest.fn();
    eventBus.on('drop:reaction_ready', handler);

    const drop = makeDrop({
      phase: 'classified',
      bucket: 'todo',
      text: 'Test',
      needsClarification: false,
    });
    await handleClassified(drop);

    const payload = handler.mock.calls[0][0];
    expect(payload.message).toBe('Decorated opener + Raw reaction here');
    expect(payload.rawReaction).toBe('Raw reaction here');
  });

  it('sets rawReaction to null when no confirmation_message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          smart_title: 'Test Title',
          card_note: null,
          confirmation_message: null,
          speech_message: null,
        }),
    });

    const handler = jest.fn();
    eventBus.on('drop:reaction_ready', handler);

    const drop = makeDrop({
      phase: 'classified',
      bucket: 'todo',
      text: 'Test',
      needsClarification: false,
    });
    await handleClassified(drop);

    const payload = handler.mock.calls[0][0];
    expect(payload.message).toBeNull();
    expect(payload.rawReaction).toBeNull();
  });

  it('sets followUp to clarify when drop needs clarification', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          smart_title: 'Ambiguous Thing',
          card_note: null,
          confirmation_message: 'Got it',
          speech_message: 'Got it',
        }),
    });

    const handler = jest.fn();
    eventBus.on('drop:reaction_ready', handler);

    const drop = makeDrop({
      phase: 'classified',
      bucket: 'todo',
      text: 'Do the thing',
      needsClarification: true,
    });
    await handleClassified(drop);

    const payload = handler.mock.calls[0][0];
    expect(payload.followUp).toBe('clarify');
  });

  it('falls back to raw text title when Phase 1.5a times out', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: () => ({}) }), 10000),
          ),
      );

    const drop = makeDrop({
      phase: 'classified',
      bucket: 'todo',
      text: 'Buy groceries for the week ahead',
      needsClarification: false,
    });
    const result = await handleClassified(drop);

    expect(result.smartTitle).toBe('Buy groceries for the week ahead');
  });
});
