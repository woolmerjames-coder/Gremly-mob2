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

  it('should map due_at ISO timestamp to due_date in update', async () => {
    // Use a specific date: 2024-03-15 at 10:30
    const dueAt = new Date(2024, 2, 15, 10, 30).toISOString();

    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_at: dueAt,
      } as any,
    });

    // Find the [TodoUpdate] dbPayload log
    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Assert: due_at was mapped to due_date and due_time
    expect(payload.due_date).toBe('2024-03-15');
    expect(payload.due_time).toBe('10:30');
    expect(payload).not.toHaveProperty('due_at');
  });

  it('should map due_at without time (midnight) to due_date only', async () => {
    // Use a date at midnight
    const dueAt = new Date(2024, 5, 20, 0, 0).toISOString();

    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_at: dueAt,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should have due_date but NOT due_time for midnight
    expect(payload.due_date).toBe('2024-06-20');
    expect(payload.due_time).toBeUndefined();
  });

  it('should prefer due_date over due_at if both provided', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_date: '2024-12-25',
        due_at: new Date(2024, 0, 1).toISOString(), // Different date
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should use due_date, not parse due_at
    expect(payload.due_date).toBe('2024-12-25');
  });

  it('should clear due_date when due_at is null', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_at: null,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should set due_date to null
    expect(payload.due_date).toBeNull();
  });

  it('should set due_day when updating to a new due_date', async () => {
    const newDueDate = '2024-12-15T10:00:00.000Z';

    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_date: newDueDate,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should have due_day set to YYYY-MM-DD format
    expect(payload.due_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.due_date).toBe(newDueDate);
  });

  it('should set due_day when updating via due_at', async () => {
    // Create a date for tomorrow at 2pm local
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    const dueAt = tomorrow.toISOString();

    // Expected due_day in YYYY-MM-DD format
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const expectedDueDay = `${year}-${month}-${day}`;

    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_at: dueAt,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should have due_day set to the same day as due_at in local timezone
    expect(payload.due_day).toBe(expectedDueDay);
    expect(payload.due_time).toBe('14:00');
  });

  it('should clear due_day when clearing due_date', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_date: null,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should set both due_date and due_day to null
    expect(payload.due_date).toBeNull();
    expect(payload.due_day).toBeNull();
  });

  it('should clear due_day when clearing due_at', async () => {
    await repo.update({
      id: 'todo-1',
      patch: {
        type: 'todo',
        due_at: null,
      } as any,
    });

    const dbPayloadLog = consoleLogSpy.mock.calls.find(
      (call) => call[0] === '[TodoUpdate] dbPayload',
    );

    expect(dbPayloadLog).toBeDefined();
    const payload = dbPayloadLog[1];

    // Should set both due_date and due_day to null
    expect(payload.due_date).toBeNull();
    expect(payload.due_day).toBeNull();
  });
});
