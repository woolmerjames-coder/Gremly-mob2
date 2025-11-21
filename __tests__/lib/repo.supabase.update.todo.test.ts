/**
 * Unit test for SupabaseRepo.update() - Todo updates
 *
 * Verifies that update() correctly maps details → body for todos
 * and keeps name/title in sync.
 *
 * Note: These tests verify the update payload construction logic
 * by checking the [TodoUpdate] dbPayload logs in development mode.
 */

import { SupabaseRepo } from '../../lib/repo/supabase';

// Mock the Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock date-fns to avoid installation requirement
jest.mock('date-fns', () => ({
  isToday: jest.fn(),
  parseISO: jest.fn(),
}));

describe('SupabaseRepo.update - Todo payload construction', () => {
  let repo: SupabaseRepo;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create repo with authenticated user
    repo = new SupabaseRepo('test-user-id');

    // Mock getById to avoid complex Supabase chain mocking
    // We just want to test the update payload construction, not getById
    jest.spyOn(repo, 'getById').mockResolvedValue({
      type: 'todo',
      id: 'todo-1',
      name: 'Original name',
      title: 'Original title',
      details: 'Original details',
      frequency: 'once',
      completed: false,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    } as any);

    // Spy on console.log to capture dev logging
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');

    // Mock minimal update chain: from().update().eq().select().single()
    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'todo-1',
        name: 'Updated',
        body: 'Updated body',
        entity_type: 'todo',
        owner_id: 'test-user-id',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        frequency: 'once',
        completed: false,
        ai_placed: false,
        tags_meta: { tags: [], source: 'none' },
      },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

    supabase.from = mockFrom;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should create update payload with details mapped to body', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        name: 'Dinner in Zipolite',
        title: 'Dinner in Zipolite',
        details: 'Find somewhere great for dinner in Zipolite',
      } as any,
    });

    // Find the [TodoUpdate] dbPayload log
    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Assert: details was mapped to body
    expect(payload.body).toBe('Find somewhere great for dinner in Zipolite');
    expect(payload.name).toBe('Dinner in Zipolite');
    expect(payload.title).toBe('Dinner in Zipolite');
    expect(payload).not.toHaveProperty('details');
  });

  it('should log incoming patch with details field', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        details: 'Test details',
      } as any,
    });

    // Find the [TodoUpdate] incoming patch log
    const incomingPatchLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] incoming patch',
    );

    expect(incomingPatchLog).toBeDefined();
    const patch = incomingPatchLog[1];
    expect(patch.details).toBe('Test details');
  });
});
