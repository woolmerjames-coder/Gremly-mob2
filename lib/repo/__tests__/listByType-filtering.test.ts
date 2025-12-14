/**
 * listByType Filtering Tests (Memory Repo)
 *
 * Covers the new ListByTypeOptions filters:
 * - Default behavior: active-only, not archived (ZOMBIE PREVENTION)
 * - createdAfter/createdBefore: time-range filtering
 * - status='active': excludes archived + completed (default)
 * - status='completed': only completed, not archived
 * - status='all': active + completed, not archived
 * - archivedOnly: only archived items
 *
 * Uses deterministic ISO timestamps for reproducible tests.
 */

import { MemoryRepo } from '../memory';
import type { Todo, Habit, Note } from '../../types';

describe('listByType Filtering', () => {
  const userId = 'test-user-listbytype-filtering';
  let repo: MemoryRepo;

  // Deterministic timestamps for predictable filtering
  const T = {
    jan1: '2025-01-01T00:00:00.000Z',
    jan15: '2025-01-15T12:00:00.000Z',
    feb1: '2025-02-01T00:00:00.000Z',
    feb15: '2025-02-15T12:00:00.000Z',
    mar1: '2025-03-01T00:00:00.000Z',
  };

  beforeEach(() => {
    repo = new MemoryRepo(userId);
    // Clear seed data for deterministic tests
    (repo as any).data = [];
  });

  // =========================================================================
  // Helpers to create items with specific timestamps
  // =========================================================================

  async function createTodo(
    name: string,
    overrides: {
      created_at?: string;
      completed_at?: string | null;
      archived?: boolean;
      status?: string;
      space_id?: string | null;
    } = {},
  ): Promise<Todo> {
    const todo = await repo.create({
      type: 'todo',
      name,
      space_id: overrides.space_id ?? null,
    });

    // Patch created_at and other fields directly
    const idx = (repo as any).data.findIndex((r: any) => r.id === todo.id);
    if (idx !== -1) {
      if (overrides.created_at) {
        (repo as any).data[idx].created_at = overrides.created_at;
      }
      if (overrides.completed_at !== undefined) {
        (repo as any).data[idx].completed_at = overrides.completed_at;
      }
      if (overrides.archived !== undefined) {
        (repo as any).data[idx].archived = overrides.archived;
      }
      if (overrides.status !== undefined) {
        (repo as any).data[idx].status = overrides.status;
      }
    }

    return (repo as any).data[idx] as Todo;
  }

  async function createHabit(
    name: string,
    overrides: {
      created_at?: string;
      completed_at?: string | null;
      archived?: boolean;
      space_id?: string | null;
    } = {},
  ): Promise<Habit> {
    const habit = await repo.create({
      type: 'habit',
      name,
      frequency: 'daily',
      subtype: 'start_habit',
      space_id: overrides.space_id ?? null,
    });

    // Patch created_at and other fields directly
    const idx = (repo as any).data.findIndex((r: any) => r.id === habit.id);
    if (idx !== -1) {
      if (overrides.created_at) {
        (repo as any).data[idx].created_at = overrides.created_at;
      }
      if (overrides.completed_at !== undefined) {
        (repo as any).data[idx].completed_at = overrides.completed_at;
      }
      if (overrides.archived !== undefined) {
        (repo as any).data[idx].archived = overrides.archived;
      }
    }

    return (repo as any).data[idx] as Habit;
  }

  async function createNote(
    title: string,
    overrides: {
      created_at?: string;
      archived?: boolean;
      subtype?: 'journal' | 'list' | 'catchall' | 'idea' | 'reference';
      space_id?: string | null;
    } = {},
  ): Promise<Note> {
    const note = await repo.create({
      type: 'note',
      title,
      subtype: overrides.subtype ?? 'idea',
      space_id: overrides.space_id ?? null,
    });

    // Patch created_at and other fields directly
    const idx = (repo as any).data.findIndex((r: any) => r.id === note.id);
    if (idx !== -1) {
      if (overrides.created_at) {
        (repo as any).data[idx].created_at = overrides.created_at;
      }
      if (overrides.archived !== undefined) {
        (repo as any).data[idx].archived = overrides.archived;
      }
    }

    return (repo as any).data[idx] as Note;
  }

  // =========================================================================
  // Default Behavior Tests (ZOMBIE PREVENTION)
  // =========================================================================

  describe('default behavior (active-only, ZOMBIE PREVENTION)', () => {
    it('returns active todos by default', async () => {
      await createTodo('Active Todo', { created_at: T.jan15 });
      await createTodo('Completed Todo', { created_at: T.jan15, completed_at: T.feb1 });
      await createTodo('Archived Todo', { created_at: T.jan15, archived: true });

      const results = await repo.listByType('todo');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Active Todo');
    });

    it('returns active habits by default', async () => {
      await createHabit('Active Habit', { created_at: T.jan15 });
      await createHabit('Completed Habit', { created_at: T.jan15, completed_at: T.feb1 });
      await createHabit('Archived Habit', { created_at: T.jan15, archived: true });

      const results = await repo.listByType('habit');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Active Habit');
    });

    it('returns non-archived notes by default', async () => {
      await createNote('Active Note', { created_at: T.jan15 });
      await createNote('Archived Note', { created_at: T.jan15, archived: true });

      const results = await repo.listByType('note');

      expect(results).toHaveLength(1);
      expect((results[0] as Note).title).toBe('Active Note');
    });

    it('excludes todo archived via status field', async () => {
      await createTodo('Active Todo', { created_at: T.jan15 });
      await createTodo('Status Archived Todo', { created_at: T.jan15, status: 'archived' });

      const results = await repo.listByType('todo');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Active Todo');
    });
  });

  // =========================================================================
  // Time-Range Filtering Tests
  // =========================================================================

  describe('createdAfter/createdBefore time-range filtering', () => {
    beforeEach(async () => {
      // Create todos at different timestamps
      await createTodo('Jan Todo', { created_at: T.jan15 });
      await createTodo('Feb Todo', { created_at: T.feb15 });
    });

    it('createdAfter filters items created on or after the timestamp', async () => {
      const results = await repo.listByType('todo', { createdAfter: T.feb1 });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Feb Todo');
    });

    it('createdBefore filters items created before the timestamp (exclusive)', async () => {
      const results = await repo.listByType('todo', { createdBefore: T.feb1 });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Jan Todo');
    });

    it('createdAfter and createdBefore combine for a range', async () => {
      await createTodo('Dec Todo', { created_at: '2024-12-15T00:00:00.000Z' });
      await createTodo('Mar Todo', { created_at: T.mar1 });

      const results = await repo.listByType('todo', {
        createdAfter: T.jan1,
        createdBefore: T.mar1,
      });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name).sort()).toEqual(['Feb Todo', 'Jan Todo']);
    });

    it('empty result when range matches no items', async () => {
      const results = await repo.listByType('todo', {
        createdAfter: '2024-01-01T00:00:00.000Z',
        createdBefore: '2024-12-01T00:00:00.000Z',
      });

      expect(results).toHaveLength(0);
    });

    it('exact timestamp boundary is inclusive for createdAfter', async () => {
      const results = await repo.listByType('todo', { createdAfter: T.jan15 });

      expect(results).toHaveLength(2);
    });

    it('exact timestamp boundary is exclusive for createdBefore', async () => {
      const results = await repo.listByType('todo', { createdBefore: T.feb15 });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Jan Todo');
    });
  });

  // =========================================================================
  // Status Filter Tests
  // =========================================================================

  describe('status filter', () => {
    beforeEach(async () => {
      await createTodo('Active Todo', { created_at: T.jan15 });
      await createTodo('Completed Todo', { created_at: T.jan15, completed_at: T.feb1 });
      await createTodo('Archived Todo', { created_at: T.jan15, archived: true });
    });

    describe("status='active' (default)", () => {
      it('returns only active items', async () => {
        const results = await repo.listByType('todo', { status: 'active' });

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Active Todo');
      });

      it('excludes completed items', async () => {
        const results = await repo.listByType('todo', { status: 'active' });

        expect(results.find((r) => r.name === 'Completed Todo')).toBeUndefined();
      });

      it('excludes archived items', async () => {
        const results = await repo.listByType('todo', { status: 'active' });

        expect(results.find((r) => r.name === 'Archived Todo')).toBeUndefined();
      });
    });

    describe("status='completed'", () => {
      it('returns only completed todos', async () => {
        const results = await repo.listByType('todo', { status: 'completed' });

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Completed Todo');
      });

      it('returns only completed habits', async () => {
        await createHabit('Active Habit', { created_at: T.jan15 });
        await createHabit('Completed Habit', { created_at: T.jan15, completed_at: T.feb1 });

        const results = await repo.listByType('habit', { status: 'completed' });

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Completed Habit');
      });

      it('excludes notes (notes have no completed state)', async () => {
        await createNote('Some Note', { created_at: T.jan15 });

        const results = await repo.listByType('note', { status: 'completed' });

        expect(results).toHaveLength(0);
      });

      it('excludes archived items even if completed', async () => {
        await createTodo('Archived Completed', {
          created_at: T.jan15,
          completed_at: T.feb1,
          archived: true,
        });

        const results = await repo.listByType('todo', { status: 'completed' });

        // Only the original "Completed Todo" should be returned
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Completed Todo');
      });
    });

    describe("status='all'", () => {
      it('returns both active and completed items', async () => {
        const results = await repo.listByType('todo', { status: 'all' });

        expect(results).toHaveLength(2);
        expect(results.map((r) => r.name).sort()).toEqual(['Active Todo', 'Completed Todo']);
      });

      it('excludes archived items', async () => {
        const results = await repo.listByType('todo', { status: 'all' });

        expect(results.find((r) => r.name === 'Archived Todo')).toBeUndefined();
      });

      it('works for habits', async () => {
        await createHabit('Active Habit', { created_at: T.jan15 });
        await createHabit('Completed Habit', { created_at: T.jan15, completed_at: T.feb1 });
        await createHabit('Archived Habit', { created_at: T.jan15, archived: true });

        const results = await repo.listByType('habit', { status: 'all' });

        expect(results).toHaveLength(2);
        expect(results.find((r) => r.name === 'Archived Habit')).toBeUndefined();
      });

      it('returns all non-archived notes', async () => {
        await createNote('Note 1', { created_at: T.jan15 });
        await createNote('Note 2', { created_at: T.feb15 });
        await createNote('Archived Note', { created_at: T.jan15, archived: true });

        const results = await repo.listByType('note', { status: 'all' });

        expect(results).toHaveLength(2);
        expect(results.find((r) => (r as Note).title === 'Archived Note')).toBeUndefined();
      });
    });
  });

  // =========================================================================
  // archivedOnly Filter Tests
  // =========================================================================

  describe('archivedOnly filter', () => {
    beforeEach(async () => {
      await createTodo('Active Todo', { created_at: T.jan15 });
      await createTodo('Completed Todo', { created_at: T.jan15, completed_at: T.feb1 });
      await createTodo('Archived Todo', { created_at: T.jan15, archived: true });
      await createTodo('Status Archived Todo', { created_at: T.jan15, status: 'archived' });
    });

    it('returns only archived todos', async () => {
      const results = await repo.listByType('todo', { archivedOnly: true });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name).sort()).toEqual(['Archived Todo', 'Status Archived Todo']);
    });

    it('returns only archived habits', async () => {
      await createHabit('Active Habit', { created_at: T.jan15 });
      await createHabit('Archived Habit', { created_at: T.jan15, archived: true });

      const results = await repo.listByType('habit', { archivedOnly: true });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Archived Habit');
    });

    it('returns only archived notes', async () => {
      await createNote('Active Note', { created_at: T.jan15 });
      await createNote('Archived Note', { created_at: T.jan15, archived: true });

      const results = await repo.listByType('note', { archivedOnly: true });

      expect(results).toHaveLength(1);
      expect((results[0] as Note).title).toBe('Archived Note');
    });

    it('archivedOnly takes precedence over status filter', async () => {
      // When archivedOnly=true, status filter should be ignored
      const results = await repo.listByType('todo', {
        archivedOnly: true,
        status: 'active',
      });

      // Should still return archived items
      expect(results).toHaveLength(2);
      expect(results.every((r) => (r as any).archived || (r as any).status === 'archived')).toBe(
        true,
      );
    });
  });

  // =========================================================================
  // Combined Filters Tests
  // =========================================================================

  describe('combined filters', () => {
    beforeEach(async () => {
      // Create a variety of items across timestamps and states
      await createTodo('Jan Active', { created_at: T.jan15 });
      await createTodo('Jan Completed', { created_at: T.jan15, completed_at: T.feb1 });
      await createTodo('Feb Active', { created_at: T.feb15 });
      await createTodo('Feb Completed', { created_at: T.feb15, completed_at: T.mar1 });
      await createTodo('Feb Archived', { created_at: T.feb15, archived: true });
    });

    it('time-range + status=completed', async () => {
      const results = await repo.listByType('todo', {
        createdAfter: T.feb1,
        status: 'completed',
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Feb Completed');
    });

    it('time-range + status=all', async () => {
      const results = await repo.listByType('todo', {
        createdAfter: T.feb1,
        status: 'all',
      });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name).sort()).toEqual(['Feb Active', 'Feb Completed']);
    });

    it('time-range + archivedOnly', async () => {
      const results = await repo.listByType('todo', {
        createdAfter: T.feb1,
        archivedOnly: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Feb Archived');
    });

    it('spaceId + status filter', async () => {
      const spaceId = 'test-space-1';
      await createTodo('Space Active', { created_at: T.jan15, space_id: spaceId });
      await createTodo('Space Completed', {
        created_at: T.jan15,
        space_id: spaceId,
        completed_at: T.feb1,
      });

      const results = await repo.listByType('todo', {
        spaceId,
        status: 'completed',
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Space Completed');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('empty repository returns empty array', async () => {
      const results = await repo.listByType('todo');
      expect(results).toHaveLength(0);
    });

    it('handles null completed_at as active', async () => {
      await createTodo('Null Completed', { created_at: T.jan15, completed_at: null });

      const results = await repo.listByType('todo', { status: 'active' });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Null Completed');
    });

    it('handles undefined archived as not archived', async () => {
      const todo = await createTodo('No Archived Field', { created_at: T.jan15 });
      // Ensure archived field is truly undefined
      delete (todo as any).archived;

      const results = await repo.listByType('todo');

      expect(results).toHaveLength(1);
    });

    it('preserves existing behavior when no new options provided', async () => {
      await createTodo('Active', { created_at: T.jan15 });
      await createTodo('Completed', { created_at: T.jan15, completed_at: T.feb1 });
      await createTodo('Archived', { created_at: T.jan15, archived: true });

      // Call with empty options object
      const results = await repo.listByType('todo', {});

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Active');
    });

    it('timestamp comparison works correctly at millisecond precision', async () => {
      const precise1 = '2025-01-15T12:00:00.001Z';
      const precise2 = '2025-01-15T12:00:00.002Z';

      await createTodo('Precise 1', { created_at: precise1 });
      await createTodo('Precise 2', { created_at: precise2 });

      const results = await repo.listByType('todo', {
        createdAfter: precise1,
        createdBefore: precise2,
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Precise 1');
    });
  });
});
