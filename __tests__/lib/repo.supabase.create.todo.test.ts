/**
 * Unit test for SupabaseRepo.create() - Todo creation
 *
 * Verifies that create() does NOT send id, owner_id, created_at, or updated_at
 * to the database, relying instead on DB defaults.
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
      }),
    );

    // Assert: Payload does NOT have auto-generated fields
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).not.toHaveProperty('owner_id');
    expect(insertPayload).not.toHaveProperty('created_at');
    expect(insertPayload).not.toHaveProperty('updated_at');
  });

  it('should handle optional body and due_date fields', async () => {
    const dbResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: 'test-user-id',
      name: 'Todo with body',
      body: 'Test body',
      space_id: null,
      due_date: '2025-10-20T10:00:00Z',
      undefined_due: false,
      ai_placed: false,
      created_at: '2025-10-15T12:00:00Z',
      updated_at: '2025-10-15T12:00:00Z',
    };

    mockSingle.mockResolvedValue({ data: dbResult, error: null });

    await repo.create({
      type: 'todo',
      name: 'Todo with body',
      body: 'Test body',
      due_date: '2025-10-20T10:00:00Z',
      undefined_due: false,
      ai_placed: false,
    });

    const insertPayload = mockInsert.mock.calls[0][0];

    expect(insertPayload).toEqual(
      expect.objectContaining({
        name: 'Todo with body',
        body: 'Test body',
        due_date: '2025-10-20T10:00:00Z',
        undefined_due: false,
        ai_placed: false,
      }),
    );

    // Still no auto-generated fields
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).not.toHaveProperty('owner_id');
    expect(insertPayload).not.toHaveProperty('created_at');
    expect(insertPayload).not.toHaveProperty('updated_at');
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
});
