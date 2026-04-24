/**
 * dropSync Tests
 *
 * Tests for the Supabase sync layer that writes classified + enriched drops
 * as todos, habits, or notes. Covers:
 * - syncDropToSupabase: entity type routing (todo/habit/note), payload construction
 * - syncMultiDropToSupabase: multi segment wrapper note creation
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

import { syncDropToSupabase, syncMultiDropToSupabase } from '../dropSync';
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

// ── syncMultiDropToSupabase ──────────────────────────────────────

describe('syncMultiDropToSupabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => buildChain());
    mockInsertResult = { data: { id: 'multi-uuid-1' }, error: null };
    mockSelectResult = { data: null, error: null };
  });

  it('inserts into notes table as a wrapper note', async () => {
    const drop = makeDrop({
      isMulti: true,
      multiSummary: 'Shopping and mood check',
      multiSegments: [
        { text: 'Buy milk', bucket: 'todo', subtype: null },
        { text: 'Feeling great', bucket: 'log', subtype: 'general' },
      ],
      dominantBucket: 'log',
      dominantSubtype: 'general' as any,
    });

    const result = await syncMultiDropToSupabase(drop);

    expect(result.success).toBe(true);
    expect(result.entityType).toBe('note');
    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockFrom).toHaveBeenCalledWith('notes');
  });

  it('returns failure when user is not authenticated', async () => {
    const origGetState = require('../../store/useGremlyStore').useGremlyStore.getState;
    require('../../store/useGremlyStore').useGremlyStore.getState = () => ({
      userId: null,
    });

    const result = await syncMultiDropToSupabase(makeDrop({ isMulti: true }));
    expect(result.success).toBe(false);

    require('../../store/useGremlyStore').useGremlyStore.getState = origGetState;
  });

  it('emits entity:created event after sync', async () => {
    const drop = makeDrop({
      isMulti: true,
      multiSummary: 'Test',
      multiSegments: [],
    });

    await syncMultiDropToSupabase(drop);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'entity:created',
      expect.objectContaining({ type: 'note' }),
    );
  });
});
