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
      created_at: '2025-12-03T10:00:00Z', // Middle
      drop_id: 'drop-todo-1',
      skipped_in_sweep_at: null,
      archived: false,
      title: 'Test todo',
    };

    const mockHabit = {
      id: 'habit-1',
      owner_id: 'user-1',
      created_at: '2025-12-03T08:00:00Z', // Earliest
      drop_id: 'drop-habit-1',
      skipped_in_sweep_at: '2025-12-02T20:00:00Z', // Previously skipped
      completed_at: null,
      name: 'Test habit',
    };

    const mockNote = {
      id: 'note-1',
      owner_id: 'user-1',
      created_at: '2025-12-03T12:00:00Z', // Latest
      drop_id: 'drop-note-1',
      skipped_in_sweep_at: null,
      archived: false,
      subtype: 'log',
    };

    const { client } = createMockSupabaseClient({
      cortexPreferences: { data: null, error: null }, // No previous sweep
      todos: { data: [mockTodo], error: null },
      habits: { data: [mockHabit], error: null },
      notes: { data: [mockNote], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: 3 candidates sorted by createdAt ascending (oldest first)
    expect(candidates).toHaveLength(3);

    // Habit is earliest (08:00)
    expect(candidates[0].id).toBe('habit-1');
    expect(candidates[0].kind).toBe('habit');
    expect(candidates[0].createdAt).toBe('2025-12-03T08:00:00Z');
    expect(candidates[0].dropId).toBe('drop-habit-1');
    expect(candidates[0].skippedInSweepAt).toBe('2025-12-02T20:00:00Z');

    // Todo is middle (10:00)
    expect(candidates[1].id).toBe('todo-1');
    expect(candidates[1].kind).toBe('todo');
    expect(candidates[1].createdAt).toBe('2025-12-03T10:00:00Z');
    expect(candidates[1].dropId).toBe('drop-todo-1');
    expect(candidates[1].skippedInSweepAt).toBeNull();

    // Note is latest (12:00)
    expect(candidates[2].id).toBe('note-1');
    expect(candidates[2].kind).toBe('note');
    expect(candidates[2].createdAt).toBe('2025-12-03T12:00:00Z');
    expect(candidates[2].dropId).toBe('drop-note-1');
    expect(candidates[2].skippedInSweepAt).toBeNull();
  });

  it('should treat table errors as empty results and continue with other tables', async () => {
    // Arrange: todos returns error, others return data
    const mockHabit = {
      id: 'habit-2',
      owner_id: 'user-1',
      created_at: '2025-12-03T09:00:00Z',
      drop_id: null,
      skipped_in_sweep_at: null,
      completed_at: null,
      name: 'Surviving habit',
    };

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
      habits: { data: [mockHabit], error: null },
      notes: { data: [mockNote], error: null },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert: Only 2 candidates (habit + note), todos error was handled gracefully
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe('habit-2');
    expect(candidates[1].id).toBe('note-2');

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
      habits: { data: null, error: { message: 'Error 2' } },
      notes: { data: null, error: { message: 'Error 3' } },
    });

    // Act
    const candidates = await fetchSweepCandidatesForUser('user-1', client);

    // Assert
    expect(candidates).toHaveLength(0);
    expect(console.error).toHaveBeenCalledTimes(3);
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
    it.each(['todo', 'habit', 'note'] as const)(
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
    it.each(['todo', 'habit', 'note'] as const)(
      'should update %s with archived fields',
      async (kind) => {
        // Arrange
        const { client, updateCalls } = createMockSupabaseClient({});
        const action: SweepAction = { type: 'clear', id: `${kind}-456`, kind };

        // Act
        await applySweepAction(action, client);

        // Assert
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0].table).toBe(`${kind}s`);
        expect(updateCalls[0].payload).toMatchObject({
          archived: true,
          archived_reason: 'swept',
        });
        // archived_at should be a non-empty ISO timestamp
        const payload = updateCalls[0].payload as { archived_at: string };
        expect(payload.archived_at).toBeDefined();
        expect(payload.archived_at.length).toBeGreaterThan(0);
        expect(new Date(payload.archived_at).getTime()).toBeGreaterThan(0);
        expect(updateCalls[0].id).toBe(`${kind}-456`);
      },
    );
  });

  describe('skip action', () => {
    it.each(['todo', 'habit', 'note'] as const)(
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
        { type: 'clear', id: 'habit-1', kind: 'habit' },
        { type: 'skip', id: 'note-1', kind: 'note' },
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
