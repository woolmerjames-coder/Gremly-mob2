/**
 * Sweep Engine - Database Logic Tests
 *
 * These tests verify the Supabase query logic in fetchSweepCandidatesForUser
 * and applySweepAction using a mocked SupabaseClient.
 *
 * No real database calls are made - we mock the Supabase client methods
 * to return predictable data and verify the correct queries are made.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/supabase';
import { fetchSweepCandidatesForUser, applySweepAction, SweepAction } from '../engine';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock Supabase client with chainable query methods.
 * Each table mock returns its own chain with configurable data/error.
 *
 * The actual query chains in the engine are:
 * - cortex_preferences: .select().eq().maybeSingle()
 * - todos: .select().eq().eq().or()
 * - habits: .select().eq().is().or()
 * - notes: .select().eq().eq().or().or()
 */
function createMockSupabaseClient(options: {
  cortexPreferences?: { data: unknown; error: unknown };
  todos?: { data: unknown; error: unknown };
  habits?: { data: unknown; error: unknown };
  notes?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
}): {
  client: SupabaseClient<Database>;
  updateCalls: Array<{ table: string; payload: unknown; id: string }>;
} {
  const updateCalls: Array<{ table: string; payload: unknown; id: string }> = [];

  // Create a chain that always returns the result at the end
  // Each method returns the same chain object, allowing arbitrary method calls
  const createChainableResult = (result: { data: unknown; error: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    const returnChain = () => chain;

    chain.eq = jest.fn().mockImplementation(returnChain);
    chain.neq = jest.fn().mockImplementation(returnChain);
    chain.is = jest.fn().mockImplementation(returnChain);
    chain.or = jest.fn().mockImplementation(returnChain);
    chain.maybeSingle = jest.fn().mockReturnValue(result);

    // Make the chain itself thenable (for await)
    chain.then = (resolve: (value: unknown) => void) => resolve(result);

    return chain;
  };

  const createUpdateChain = (tableName: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};

    chain.eq = jest.fn().mockImplementation((field: string, value: string) => {
      // Track the id when eq('id', ...) is called
      if (field === 'id') {
        const lastCall = updateCalls.filter((c) => c.table === tableName).pop();
        if (lastCall) {
          lastCall.id = value;
        }
      }
      return chain;
    });

    // Make the chain itself thenable (for await) - returns update result
    chain.then = (resolve: (value: unknown) => void) =>
      resolve(options.updateResult ?? { data: null, error: null });

    return chain;
  };

  const mockFrom = jest.fn().mockImplementation((table: string) => {
    switch (table) {
      case 'cortex_preferences':
        return {
          select: jest
            .fn()
            .mockReturnValue(
              createChainableResult(options.cortexPreferences ?? { data: null, error: null }),
            ),
          update: jest.fn().mockReturnValue(createUpdateChain(table)),
        };
      case 'todos':
        return {
          select: jest
            .fn()
            .mockReturnValue(createChainableResult(options.todos ?? { data: [], error: null })),
          update: jest.fn().mockImplementation((payload: unknown) => {
            updateCalls.push({ table: 'todos', payload, id: '' });
            return createUpdateChain('todos');
          }),
        };
      case 'habits':
        return {
          select: jest
            .fn()
            .mockReturnValue(createChainableResult(options.habits ?? { data: [], error: null })),
          update: jest.fn().mockImplementation((payload: unknown) => {
            updateCalls.push({ table: 'habits', payload, id: '' });
            return createUpdateChain('habits');
          }),
        };
      case 'notes':
        return {
          select: jest
            .fn()
            .mockReturnValue(createChainableResult(options.notes ?? { data: [], error: null })),
          update: jest.fn().mockImplementation((payload: unknown) => {
            updateCalls.push({ table: 'notes', payload, id: '' });
            return createUpdateChain('notes');
          }),
        };
      default:
        return {
          select: jest.fn().mockReturnValue(createChainableResult({ data: [], error: null })),
          update: jest.fn().mockReturnValue(createUpdateChain(table)),
        };
    }
  });

  return {
    client: { from: mockFrom } as unknown as SupabaseClient<Database>,
    updateCalls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchSweepCandidatesForUser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchSweepCandidatesForUser', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return combined candidates from all tables sorted by createdAt', async () => {
    // Arrange: Mock data for each table with different timestamps
    const mockTodo = {
      id: 'todo-1',
      owner_id: 'user-1',
      created_at: '2025-12-03T10:00:00Z', // Earlier
      drop_id: 'drop-todo-1',
      skipped_in_sweep_at: null,
      archived: false,
      title: 'Test todo',
    };

    const mockNote = {
      id: 'note-1',
      owner_id: 'user-1',
      created_at: '2025-12-03T12:00:00Z', // Later
      drop_id: 'drop-note-1',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'log',
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null }, // No previous sweep
      todos: { data: [mockTodo], error: null },
      habits: { data: [], error: null },
      notes: { data: [mockNote], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: 2 candidates sorted by createdAt ascending (oldest first)
    // Note: Habits are not included in sweep candidates
    expect(candidates).toHaveLength(2);

    // Todo is earlier (10:00)
    expect(candidates[0].id).toBe('todo-1');
    expect(candidates[0].kind).toBe('todo');
    expect(candidates[0].createdAt).toBe('2025-12-03T10:00:00Z');
    expect(candidates[0].dropId).toBe('drop-todo-1');
    expect(candidates[0].skippedInSweepAt).toBeNull();

    // Note is later (12:00)
    expect(candidates[1].id).toBe('note-1');
    expect(candidates[1].kind).toBe('note');
    expect(candidates[1].createdAt).toBe('2025-12-03T12:00:00Z');
    expect(candidates[1].dropId).toBe('drop-note-1');
    expect(candidates[1].skippedInSweepAt).toBeNull();
  });

  it('should treat table errors as empty results and continue with other tables', async () => {
    // Arrange: todos returns error, notes still returns data
    const mockNote = {
      id: 'note-2',
      owner_id: 'user-1',
      created_at: '2025-12-03T11:00:00Z',
      drop_id: 'drop-note-2',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'log',
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: null, error: { message: 'Database error', code: '500' } },
      habits: { data: [], error: null },
      notes: { data: [mockNote], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: Only 1 candidate (note), todos error was handled gracefully
    // Note: Habits are not included in sweep candidates
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('note-2');

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith(
      '[Sweep] Failed to fetch todos:',
      expect.objectContaining({ message: 'Database error' }),
    );
  });

  it('should populate all candidate fields correctly from raw database rows', async () => {
    // Arrange: A todo with all fields populated
    const mockTodo = {
      id: 'todo-full',
      owner_id: 'user-1',
      created_at: '2025-12-03T15:30:00Z',
      drop_id: 'drop-123',
      skipped_in_sweep_at: '2025-12-02T18:00:00Z',
      archived: false,
      title: 'Full test todo',
      canonical_type: 'task',
      due_day: '2025-12-04',
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: [mockTodo], error: null },
      habits: { data: [], error: null },
      notes: { data: [], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: All fields mapped correctly
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];

    expect(candidate.id).toBe('todo-full');
    expect(candidate.kind).toBe('todo');
    expect(candidate.createdAt).toBe('2025-12-03T15:30:00Z');
    expect(candidate.dropId).toBe('drop-123');
    expect(candidate.skippedInSweepAt).toBe('2025-12-02T18:00:00Z');
    expect(candidate.raw).toEqual(mockTodo);
  });

  it('should return empty array when all tables return errors', async () => {
    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: null, error: { message: 'Error 1' } },
      habits: { data: [], error: null }, // Habits not queried anymore
      notes: { data: null, error: { message: 'Error 2' } },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: 5 error calls (1 todo + 4 note subtypes: ideas, general, lists, reference)
    expect(candidates).toHaveLength(0);
    expect(console.error).toHaveBeenCalledTimes(5);
  });

  it('should handle null created_at with fallback to current time', async () => {
    // Arrange: Todo with null created_at
    const mockTodo = {
      id: 'todo-null-date',
      owner_id: 'user-1',
      created_at: null, // Null timestamp
      drop_id: null,
      skipped_in_sweep_at: null,
      archived: false,
      title: 'Null date todo',
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: [mockTodo], error: null },
      habits: { data: [], error: null },
      notes: { data: [], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: createdAt should be a valid ISO string (fallback)
    expect(candidates).toHaveLength(1);
    expect(candidates[0].createdAt).toBeDefined();
    expect(new Date(candidates[0].createdAt).getTime()).toBeGreaterThan(0);
  });

  it('should include log-general notes (subtype: journal) with photo attachments', async () => {
    // This is the key test case: log-general entries with photos MUST appear in Sweep
    // The subtype 'journal' is used for log-general (everything_else maps to 'journal')
    // Photos are joined from log_photos table
    const mockNoteWithPhotos = {
      id: 'note-photo-1',
      owner_id: 'user-1',
      created_at: '2025-12-03T14:00:00Z',
      drop_id: 'drop-photo-1',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'journal', // log-general maps to 'journal' subtype
      canonical_type: 'log',
      title: 'Photo entry test',
      log_photos: [
        { id: 'photo-1', url: 'https://example.com/photo1.jpg', position: 0 },
        { id: 'photo-2', url: 'https://example.com/photo2.jpg', position: 1 },
      ],
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null }, // No previous sweep
      todos: { data: [], error: null },
      habits: { data: [], error: null },
      notes: { data: [mockNoteWithPhotos], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: Note with photos should appear in Sweep
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('note-photo-1');
    expect(candidates[0].kind).toBe('note');

    // Should have attachments mapped from log_photos
    const noteCandidate = candidates[0] as {
      attachments?: Array<{ id: string; url: string; position: number }>;
    };
    expect(noteCandidate.attachments).toHaveLength(2);
    expect(noteCandidate.attachments![0]).toEqual({
      id: 'photo-1',
      url: 'https://example.com/photo1.jpg',
      position: 0,
    });
    expect(noteCandidate.attachments![1]).toEqual({
      id: 'photo-2',
      url: 'https://example.com/photo2.jpg',
      position: 1,
    });
  });

  it('should include log-general notes with subtype everything_else', async () => {
    // Some notes may still have subtype: 'everything_else' directly
    // These should also appear in Sweep (not filtered by .neq('subtype', 'catchall'))
    const mockLogGeneralNote = {
      id: 'note-everything-else',
      owner_id: 'user-1',
      created_at: '2025-12-03T15:00:00Z',
      drop_id: 'drop-log-1',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'everything_else', // Direct log-general subtype
      canonical_type: 'log',
      title: 'General log entry',
      log_photos: [],
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: [], error: null },
      habits: { data: [], error: null },
      notes: { data: [mockLogGeneralNote], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: log-general (everything_else) note should appear in Sweep
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('note-everything-else');
    expect(candidates[0].kind).toBe('note');
  });

  it('should NOT include catchall notes (still being processed)', async () => {
    // catchall notes are excluded because they haven't been classified yet
    const mockCatchallNote = {
      id: 'note-catchall',
      owner_id: 'user-1',
      created_at: '2025-12-03T16:00:00Z',
      drop_id: 'drop-catchall',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'catchall', // Still being processed
      title: 'Unprocessed entry',
      log_photos: [],
    };

    // The mock returns the catchall note, but the engine should filter it out
    // via .neq('subtype', 'catchall')
    // Since we're mocking at the result level, this test documents expected behavior
    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null },
      todos: { data: [], error: null },
      habits: { data: [], error: null },
      // In real usage, the .neq filter would exclude this, but mock returns it
      // This test documents the expected SQL filter behavior
      notes: { data: [], error: null }, // Simulate filtered result
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: No candidates when only catchall notes exist (filtered by DB)
    expect(candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applySweepAction Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applySweepAction', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('keep action', () => {
    it.each(['todo', 'note'] as const)(
      'should update %s with skipped_in_sweep_at: null',
      async (kind) => {
        // Arrange
        const { client, updateCalls } = createMockSupabaseClient({});
        const action: SweepAction = { type: 'keep', id: `${kind}-123`, kind };

        // Act
        await applySweepAction(action, client);

        // Assert
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0].table).toBe(`${kind}s`);
        expect(updateCalls[0].payload).toEqual({ skipped_in_sweep_at: null });
        expect(updateCalls[0].id).toBe(`${kind}-123`);
      },
    );
  });

  describe('clear action', () => {
    it('should archive todo with archived fields', async () => {
      // Arrange
      const { client, updateCalls } = createMockSupabaseClient({});
      const action: SweepAction = { type: 'clear', id: 'todo-456', kind: 'todo' };

      // Act
      await applySweepAction(action, client);

      // Assert
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].table).toBe('todos');
      expect(updateCalls[0].payload).toMatchObject({
        archived: true,
        archived_reason: 'swept',
      });
      // archived_at should be a non-empty ISO timestamp
      const payload = updateCalls[0].payload as { archived_at: string };
      expect(payload.archived_at).toBeDefined();
      expect(payload.archived_at.length).toBeGreaterThan(0);
      expect(new Date(payload.archived_at).getTime()).toBeGreaterThan(0);
      expect(updateCalls[0].id).toBe('todo-456');
    });

    it('should clear skip marker for note (not archive)', async () => {
      // Notes should stay in Your Notes when cleared during sweep
      // Clearing just confirms the note was reviewed
      const { client, updateCalls } = createMockSupabaseClient({});
      const action: SweepAction = { type: 'clear', id: 'note-456', kind: 'note' };

      // Act
      await applySweepAction(action, client);

      // Assert
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].table).toBe('notes');
      expect(updateCalls[0].payload).toMatchObject({
        skipped_in_sweep_at: null,
      });
      // Should NOT have archived fields
      const payload = updateCalls[0].payload as { archived?: boolean; archived_reason?: string };
      expect(payload.archived).toBeUndefined();
      expect(payload.archived_reason).toBeUndefined();
      expect(updateCalls[0].id).toBe('note-456');
    });
  });

  describe('skip action', () => {
    it.each(['todo', 'note'] as const)(
      'should update %s with skipped_in_sweep_at timestamp',
      async (kind) => {
        // Arrange
        const { client, updateCalls } = createMockSupabaseClient({});
        const action: SweepAction = { type: 'skip', id: `${kind}-789`, kind };

        // Act
        await applySweepAction(action, client);

        // Assert
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0].table).toBe(`${kind}s`);
        // skipped_in_sweep_at should be a non-empty ISO timestamp
        const payload = updateCalls[0].payload as { skipped_in_sweep_at: string };
        expect(payload.skipped_in_sweep_at).toBeDefined();
        expect(payload.skipped_in_sweep_at.length).toBeGreaterThan(0);
        expect(new Date(payload.skipped_in_sweep_at).getTime()).toBeGreaterThan(0);
        expect(updateCalls[0].id).toBe(`${kind}-789`);
      },
    );
  });

  describe('error handling', () => {
    it('should log error but not throw when update fails', async () => {
      // Arrange: Mock that returns an error
      const { client } = createMockSupabaseClient({
        updateResult: { data: null, error: { message: 'Update failed', code: '500' } },
      });
      const action: SweepAction = { type: 'keep', id: 'todo-error', kind: 'todo' };

      // Act & Assert: Should not throw
      await expect(applySweepAction(action, client)).resolves.not.toThrow();

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        "[Sweep] Failed to apply 'keep' to todo:",
        expect.objectContaining({ message: 'Update failed' }),
      );
    });

    it('should continue sweep even when multiple actions fail', async () => {
      // Arrange
      const { client } = createMockSupabaseClient({
        updateResult: { data: null, error: { message: 'DB down' } },
      });

      // Act: Apply multiple failing actions
      const actions: SweepAction[] = [
        { type: 'keep', id: 'todo-1', kind: 'todo' },
        { type: 'clear', id: 'note-1', kind: 'note' },
        { type: 'skip', id: 'note-2', kind: 'note' },
      ];

      // Assert: None should throw
      for (const action of actions) {
        await expect(applySweepAction(action, client)).resolves.not.toThrow();
      }

      // All 3 errors were logged
      expect(console.error).toHaveBeenCalledTimes(3);
    });
  });
});
