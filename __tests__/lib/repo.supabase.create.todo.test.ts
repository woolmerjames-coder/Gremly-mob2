/**
 * Unit test for SupabaseRepo.create() - Todo creation
 *
 * Verifies that create() properly maps fields to database schema:
 * - details → body (full Mind Drop sentence)
 * - due_at → due_date + due_time + due_day
 * - labels must be array (database schema requirement)
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

describe('SupabaseRepo.create - Todo', () => {
  let repo: SupabaseRepo;
  let mockFrom: jest.Mock;
  let mockInsert: jest.Mock;
  let mockSelect: jest.Mock;
  let mockSingle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock chain: from().insert().select().single()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');

    mockSingle = jest.fn();
    mockSelect = jest.fn(() => ({ single: mockSingle }));
    mockInsert = jest.fn(() => ({ select: mockSelect }));
    mockFrom = jest.fn(() => ({ insert: mockInsert }));

    supabase.from = mockFrom;

    // Create repo with authenticated user
    repo = new SupabaseRepo('test-user-id');
  });

  it('should NOT include id, owner_id, created_at, or updated_at in insert payload', async () => {
    // Setup: Mock successful database response
    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Test Todo',
      body: null,
      space_id: null,
      due_date: null,
      undefined_due: true,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    // Act: Create a todo
    await repo.create({
      type: 'todo',
      name: 'Test Todo',
      undefined_due: true,
      ai_placed: false,
    });

    // Assert: from() was called with correct table
    expect(mockFrom).toHaveBeenCalledWith('todos');

    // Assert: insert() was called
    expect(mockInsert).toHaveBeenCalledTimes(1);

    // Get the actual payload sent to insert()
    const insertPayload = mockInsert.mock.calls[0][0];

    // Assert: Payload has expected fields
    expect(insertPayload).toEqual(
      expect.objectContaining({
        name: 'Test Todo',
        undefined_due: true,
        ai_placed: false,
        owner_id: 'test-user-id', // Now included per schema conformance
      }),
    );

    // Assert: Payload does NOT have auto-generated fields (except owner_id)
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).toHaveProperty('owner_id'); // This IS included now
    expect(insertPayload).not.toHaveProperty('created_at');
    expect(insertPayload).not.toHaveProperty('updated_at');
  });

  it('should handle optional body and due_date fields', async () => {
    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo with body',
      body: 'Test body text for this todo',
      space_id: null,
      due_date: '2025-10-20', // DB stores date-only
      due_day: '2025-10-20',
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo with body',
      body: 'Test body text for this todo',
      due_date: '2025-10-20T10:00:00Z',
      undefined_due: false,
      ai_placed: false,
    });

    const insertPayload = mockInsert.mock.calls[0][0];

    expect(insertPayload).toEqual(
      expect.objectContaining({
        name: 'Todo with body',
        body: 'Test body text for this todo',
        due_date: '2025-10-20', // Date-only to prevent timezone issues
        undefined_due: false,
        ai_placed: false,
        owner_id: 'test-user-id', // Now included per schema conformance
      }),
    );

    // Still no auto-generated fields (except owner_id)
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).toHaveProperty('owner_id'); // This IS included now
    expect(insertPayload).not.toHaveProperty('created_at');
    expect(insertPayload).not.toHaveProperty('updated_at');
  });

  it('should map details to body when creating todo from Mind Drop', async () => {
    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Dinner in Zipolite',
      title: 'Dinner in Zipolite',
      body: 'Find somewhere great for dinner in Zipolite',
      space_id: null,
      origin: 'catchall',
      ai_placed: true,
      labels: [],
      created_at: '2025-11-17T12:00:00Z',
      updated_at: '2025-11-17T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    // Simulate Mind Drop creation with details field
    await repo.create({
      type: 'todo',
      name: 'Dinner in Zipolite',
      details: 'Find somewhere great for dinner in Zipolite', // This should map to body
      origin: 'catchall',
      ai_placed: true,
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Assert: details was mapped to body in the database payload
    expect(insertPayload).toEqual(
      expect.objectContaining({
        name: 'Dinner in Zipolite',
        body: 'Find somewhere great for dinner in Zipolite', // Mapped from details
        origin: 'catchall',
        ai_placed: true,
        owner_id: 'test-user-id',
      }),
    );

    // Should NOT have a details field in DB payload
    expect(insertPayload).not.toHaveProperty('details');
  });

  it('should throw error if input contains created_at', async () => {
    await expect(
      repo.create({
        type: 'todo',
        title: 'Bad todo',
        created_at: '2025-10-15T12:00:00Z',
      } as any),
    ).rejects.toThrow('create() payload must not include id, created_at, or updated_at');
  });

  it('should throw error if input contains updated_at', async () => {
    await expect(
      repo.create({
        type: 'todo',
        title: 'Bad todo',
        updated_at: '2025-10-15T12:00:00Z',
      } as any),
    ).rejects.toThrow('create() payload must not include id, created_at, or updated_at');
  });

  it('should throw error if input contains id', async () => {
    await expect(
      repo.create({
        type: 'todo',
        title: 'Bad todo',
        id: 'manual-id',
      } as any),
    ).rejects.toThrow('create() payload must not include id, created_at, or updated_at');
  });

  it('should handle database errors gracefully', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed', code: 'CONNECTION_ERROR' },
    });

    await expect(
      repo.create({
        type: 'todo',
        name: 'Test Todo',
        undefined_due: true,
      }),
    ).rejects.toThrow('Failed to create todo: Database connection failed');
  });

  it('should map due_at ISO timestamp to due_date and due_time', async () => {
    // Use a specific date: 2024-03-15 at 14:30
    const dueAt = new Date(2024, 2, 15, 14, 30).toISOString();

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo with due_at',
      body: null,
      space_id: null,
      due_date: dueAt,
      due_time: '14:30',
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo with due_at',
      due_at: dueAt, // Overlay-style due date
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Assert: due_at was converted to due_date (full ISO) and due_time (HH:mm)
    expect(insertPayload.due_date).toBe(dueAt);
    expect(insertPayload.due_time).toBe('14:30');
    expect(insertPayload).not.toHaveProperty('due_at');
  });

  it('should map due_at at midnight to due_date only (no due_time)', async () => {
    // Use a date at midnight
    const dueAt = new Date(2024, 5, 20, 0, 0).toISOString();

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo due today',
      body: null,
      space_id: null,
      due_date: dueAt, // Full ISO datetime
      due_time: null,
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo due today',
      due_at: dueAt,
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should have due_date as date-only string (YYYY-MM-DD) to prevent timezone issues
    // The date is computed from the due_at input
    expect(insertPayload.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(insertPayload.due_time).toBeUndefined();
  });

  it('should prefer explicit due_date over due_at if both provided', async () => {
    const explicitDueDate = '2024-12-25T00:00:00.000Z'; // Full datetime - will be converted to date-only

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo with explicit due_date',
      body: null,
      space_id: null,
      due_date: '2024-12-25', // DB stores date-only
      due_time: null,
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo with explicit due_date',
      due_date: explicitDueDate, // Explicit due_date
      due_at: new Date(2024, 0, 1).toISOString(), // Different date - should be ignored
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should use date computed from explicit due_date (date-only to avoid timezone issues)
    expect(insertPayload.due_date).toBe('2024-12-25');
  });

  it('should set due_day when todo is created with a due date (today)', async () => {
    // Create a date for today at 3pm local
    const today = new Date();
    today.setHours(15, 0, 0, 0); // 3pm local
    const dueAt = today.toISOString();

    // Expected due_day in YYYY-MM-DD format
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const expectedDueDay = `${year}-${month}-${day}`;

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo due today with due_day',
      body: null,
      space_id: null,
      due_date: dueAt,
      due_day: expectedDueDay,
      due_time: '15:00',
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo due today with due_day',
      due_at: dueAt,
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should have due_day set to YYYY-MM-DD in local timezone
    expect(insertPayload.due_day).toBe(expectedDueDay);
    expect(insertPayload.due_time).toBe('15:00');
  });

  it('should set due_day to null when todo is created without a due date', async () => {
    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo without due date',
      body: null,
      space_id: null,
      due_date: null,
      due_day: null,
      due_time: null,
      undefined_due: true,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo without due date',
      undefined_due: true,
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should NOT have due_day set (or it should be null)
    expect(insertPayload.due_day).toBeFalsy();
    expect(insertPayload.due_date).toBeFalsy();
  });

  it('should compute due_day from due_date when due_at is not provided', async () => {
    const dueDate = '2025-12-15T10:00:00.000Z';

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo with due_date',
      body: null,
      space_id: null,
      due_date: '2025-12-15', // DB stores date-only
      due_day: '2025-12-15',
      due_time: null,
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo with due_date',
      due_date: dueDate,
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should have due_day computed from due_date, and due_date as date-only string
    expect(insertPayload.due_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(insertPayload.due_date).toBe('2025-12-15');
  });

  it('should use due_day directly when passed without due_time (date-only)', async () => {
    // Simulates: user typed "call mom today" - date-only phrase
    const dueDay = '2025-12-02';

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Call mom',
      body: null,
      space_id: null,
      due_date: dueDay, // Should be date-only string
      due_day: dueDay,
      due_time: null, // No time when user didn't specify one
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Call mom',
      due_day: dueDay,
      due_time: null, // No explicit time
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should have due_day and due_date both as date-only string
    expect(insertPayload.due_day).toBe(dueDay);
    expect(insertPayload.due_date).toBe(dueDay); // Date-only, no time component
    expect(insertPayload.due_time).toBeFalsy(); // null or undefined
  });

  it('should use both due_day and due_time when passed (explicit time)', async () => {
    // Simulates: user typed "call mom today at 3pm" - explicit time
    const dueDay = '2025-12-02';
    const dueTime = '15:00';

    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Call mom',
      body: null,
      space_id: null,
      due_date: dueDay, // DB may store this differently
      due_day: dueDay,
      due_time: dueTime,
      undefined_due: false,
      ai_placed: false,
      labels: [],
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Call mom',
      due_day: dueDay,
      due_time: dueTime, // Explicit time
    } as any);

    const insertPayload = mockInsert.mock.calls[0][0];

    // Should have due_day, due_date, and due_time all set
    expect(insertPayload.due_day).toBe(dueDay);
    expect(insertPayload.due_time).toBe(dueTime);
    // due_date should be set (may be date-only or with time depending on implementation)
    expect(insertPayload.due_date).toBeTruthy();
  });
});
