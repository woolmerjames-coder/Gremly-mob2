/**
 * Mocked tests for SupabaseRepo to keep CI green without network calls.
 * Uses jest.mock to intercept Supabase client calls.
 */

import { SupabaseRepo } from '../../lib/repo/supabase';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { Habit, Todo } from '../../lib/types';

// Mock the Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

// Mock date-fns to avoid installation requirement in tests
jest.mock('date-fns', () => ({
  isToday: jest.fn(() => true),
  parseISO: jest.fn((str: string) => new Date(str)),
}));

const mockUserId = 'test-user-123';

describe('SupabaseRepo (mocked)', () => {
  let repo: SupabaseRepo;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    repo = new SupabaseRepo(mockUserId);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockClear();
  });

  test('create habit calls insert with correct data', async () => {
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'habit-1',
            name: 'Exercise',
            subtype: 'start_habit',
            frequency: 'daily',
            ai_placed: false,
            created_at: '2025-10-15T00:00:00Z',
            updated_at: '2025-10-15T00:00:00Z',
            owner_id: mockUserId,
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'habit',
      name: 'Exercise',
      subtype: 'start_habit',
      frequency: 'daily',
      owner_id: mockUserId,
    };

    const result = await repo.create(input);

    expect(mockFrom).toHaveBeenCalledWith('habits');
    expect(mockInsert).toHaveBeenCalled();
    expect(result.type).toBe('habit');
    expect((result as Habit).name).toBe('Exercise');
  });

  test('create todo calls insert with correct data', async () => {
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'todo-1',
            name: 'Buy milk',
            body: null,
            due_date: null,
            undefined_due: true,
            ai_placed: false,
            created_at: '2025-10-15T00:00:00Z',
            updated_at: '2025-10-15T00:00:00Z',
            owner_id: mockUserId,
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'todo',
      name: 'Buy milk',
      owner_id: mockUserId,
    };

    const result = await repo.create(input);

    expect(mockFrom).toHaveBeenCalledWith('todos');
    expect(result.type).toBe('todo');
    expect((result as Todo).name).toBe('Buy milk');
  });

  test('listByType queries correct table', async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'habit-1',
              name: 'Exercise',
              subtype: 'start_habit',
              frequency: 'daily',
              ai_placed: false,
              created_at: '2025-10-15T00:00:00Z',
              updated_at: '2025-10-15T00:00:00Z',
              owner_id: mockUserId,
            },
          ],
          error: null,
        }),
      }),
    });

    mockFrom.mockReturnValue({ select: mockSelect });

    const results = await repo.listByType('habit');

    expect(mockFrom).toHaveBeenCalledWith('habits');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('habit');
  });

  test('search queries multiple tables', async () => {
    const mockHabitsQuery = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          ilike: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    };

    const mockTodosQuery = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          or: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    };

    const mockNotesQuery = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          or: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    };

    mockFrom
      .mockReturnValueOnce(mockHabitsQuery)
      .mockReturnValueOnce(mockTodosQuery)
      .mockReturnValueOnce(mockNotesQuery);

    await repo.search('exercise');

    expect(mockFrom).toHaveBeenCalledWith('habits');
    expect(mockFrom).toHaveBeenCalledWith('todos');
    expect(mockFrom).toHaveBeenCalledWith('notes');
  });

  test('throws error when user not authenticated', async () => {
    const unauthRepo = new SupabaseRepo();

    await expect(
      unauthRepo.create({
        type: 'habit',
        title: 'Test',
        frequency: 'daily',
        owner_id: 'test',
      }),
    ).rejects.toThrow('User must be authenticated');
  });
});
