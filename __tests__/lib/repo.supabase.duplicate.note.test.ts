/**
 * Tests for SupabaseRepo duplicate key handling on notes.
 *
 * Phase 2: Database-layer fallback for duplicate note creation.
 * When create() hits 23505 error on notes_owner_drop_id_active_unique,
 * it should fetch and return the existing note instead of throwing.
 */

import { SupabaseRepo } from '../../lib/repo/supabase';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { Note } from '../../lib/types';

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
const mockDropId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID format

describe('SupabaseRepo - Duplicate Note Handling (23505)', () => {
  let repo: SupabaseRepo;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    repo = new SupabaseRepo(mockUserId);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockClear();

    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GIVEN duplicate note error (23505) WHEN creating note THEN fetch and return existing note', async () => {
    const existingNoteId = 'existing-note-id-123';
    const existingNote = {
      id: existingNoteId,
      type: 'note',
      title: 'Existing Note',
      body: 'Already created',
      subtype: 'catchall',
      drop_id: mockDropId,
      owner_id: mockUserId,
      archived: false,
      ai_placed: false,
      labels: [],
      tags: [],
      tags_meta: null,
      space_id: null,
      origin: 'catchall',
      views: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    // Mock the insert to return 23505 duplicate key error
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "notes_owner_drop_id_active_unique"',
            details:
              'Key (owner_id, drop_id, archived)=(test-user-123, 550e8400-e29b-41d4-a716-446655440000, false) already exists.',
          },
        }),
      }),
    });

    // Mock the subsequent select to fetch existing note
    const mockEq = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnValue({
      eq: mockEq,
      single: jest.fn().mockResolvedValue({
        data: existingNote,
        error: null,
      }),
    });

    // First call (insert) returns mockInsert
    // Second call (select for fetch) returns mockSelect
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return { insert: mockInsert };
      } else {
        return { select: mockSelect };
      }
    });

    const input: CreateRecordInput = {
      type: 'note',
      title: 'New Note',
      subtype: 'catchall',
      dropId: mockDropId,
    };

    const result = await repo.create(input);

    // Should have called insert first
    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockInsert).toHaveBeenCalled();

    // Should have called select to fetch existing note
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('drop_id', mockDropId);
    expect(mockEq).toHaveBeenCalledWith('owner_id', mockUserId);
    expect(mockEq).toHaveBeenCalledWith('archived', false);

    // Should return the existing note
    expect(result.type).toBe('note');
    expect(result.id).toBe(existingNoteId);
    expect((result as Note).title).toBe('Existing Note');
    expect((result as Note).body).toBe('Already created');

    // Should have logged warning instead of error
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate note detected'),
      expect.objectContaining({
        code: '23505',
        constraint: 'notes_owner_drop_id_active_unique',
      }),
    );
  });

  test('GIVEN duplicate error but no dropId WHEN creating note THEN throw original error', async () => {
    // Mock insert to return 23505 error
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "notes_owner_drop_id_active_unique"',
          },
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'note',
      title: 'Note without drop_id',
      subtype: 'catchall',
      // dropId is missing - cannot fetch existing note
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create note');

    // Should NOT have attempted to fetch (no dropId to query with)
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('notes');

    // Should have logged error (not warning)
    expect(console.error).toHaveBeenCalled();
  });

  test('GIVEN duplicate error on TODO WHEN creating todo THEN throw error (no fallback)', async () => {
    // Mock insert to return 23505 error (different constraint, not notes-specific)
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "some_other_constraint"',
          },
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'todo',
      name: 'Duplicate todo',
      dropId: mockDropId,
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create todo');

    // Should have called insert but NOT select (no fallback for todos)
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('todos');

    // Should have logged error
    expect(console.error).toHaveBeenCalled();
  });

  test('GIVEN duplicate error on HABIT WHEN creating habit THEN throw error (no fallback)', async () => {
    // Mock insert to return 23505 error
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "habits_unique_constraint"',
          },
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'habit',
      name: 'Duplicate habit',
      frequency: 'daily',
      dropId: mockDropId,
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create habit');

    // Should have called insert but NOT select (no fallback for habits)
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('habits');

    // Should have logged error
    expect(console.error).toHaveBeenCalled();
  });

  test('GIVEN duplicate error but fetch fails WHEN creating note THEN throw original error', async () => {
    // Mock insert to return 23505 error
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "notes_owner_drop_id_active_unique"',
          },
        }),
      }),
    });

    // Mock the subsequent select to fail
    const mockEq = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnValue({
      eq: mockEq,
      single: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'The result contains 0 rows',
        },
      }),
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return { insert: mockInsert };
      } else {
        return { select: mockSelect };
      }
    });

    const input: CreateRecordInput = {
      type: 'note',
      title: 'Note with fetch failure',
      subtype: 'catchall',
      dropId: mockDropId,
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create note');

    // Should have attempted fetch but failed
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockSelect).toHaveBeenCalled();

    // Should have logged error for both insert and fetch failure
    expect(console.error).toHaveBeenCalled();
  });

  test('GIVEN non-23505 error WHEN creating note THEN throw error (no fallback)', async () => {
    // Mock insert to return different error code
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42501',
            message: 'permission denied for table notes',
          },
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'note',
      title: 'Note with permission error',
      subtype: 'catchall',
      dropId: mockDropId,
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create note');

    // Should have called insert but NOT select (different error code)
    expect(mockFrom).toHaveBeenCalledTimes(1);

    // Should have logged error
    expect(console.error).toHaveBeenCalled();
  });

  test('GIVEN 23505 error on different constraint WHEN creating note THEN throw error (no fallback)', async () => {
    // Mock insert to return 23505 but for a different constraint
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "notes_some_other_constraint"',
          },
        }),
      }),
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    const input: CreateRecordInput = {
      type: 'note',
      title: 'Note with different constraint',
      subtype: 'catchall',
      dropId: mockDropId,
    };

    await expect(repo.create(input)).rejects.toThrow('Failed to create note');

    // Should have called insert but NOT select (wrong constraint name)
    expect(mockFrom).toHaveBeenCalledTimes(1);

    // Should have logged error
    expect(console.error).toHaveBeenCalled();
  });
});
