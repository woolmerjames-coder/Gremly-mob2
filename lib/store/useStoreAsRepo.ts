/**
 * useStoreAsRepo - Provides a repo-compatible interface backed by Zustand store
 *
 * This adapter allows code that expects repo methods to use the store instead.
 * Used during the migration from repo pattern to Zustand store.
 *
 * Usage:
 * ```typescript
 * const storeRepo = useStoreAsRepo();
 * // Now use storeRepo.getById, storeRepo.create, storeRepo.update, etc.
 * ```
 */
import { useCallback, useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { selectItemById, selectNoteBySourceMessageId } from './selectors';
import type { Todo, Habit, Note } from '../types';
import type { CreateRecordInput } from '../repo/IRepo';

export type StoreRepoAdapter = {
  // Core CRUD
  getById: (id: string) => (Todo | Habit | Note) | null;
  create: (input: CreateRecordInput) => Promise<Todo | Habit | Note>;
  update: (params: { id: string; patch: Record<string, unknown> }) => Promise<Todo | Habit | Note>;
  remove: (id: string) => Promise<void>;

  // Specialized methods
  findNoteBySourceMessageId: (sourceMessageId: string) => Note | null;
  insertLogPhoto: (params: {
    noteId: string;
    url: string;
    position: number;
  }) => Promise<{ id: string }>;

  // List methods for backward compatibility
  notes: {
    create: (input: Partial<Note>) => Promise<Note>;
    list: (opts?: { limit?: number; order?: string }) => Promise<Note[]>;
  };
  todos: {
    list: (opts?: { limit?: number; order?: string }) => Promise<Todo[]>;
  };
  habits: {
    list: (opts?: { limit?: number; order?: string }) => Promise<Habit[]>;
  };

  // Legacy method for catchall creation
  addUnsorted: (spaceId: string | null, input: Partial<Note>) => Promise<Note>;
};

/**
 * Hook that provides a repo-like interface backed by the Zustand store.
 * All operations go through the store - no direct repo calls.
 */
export function useStoreAsRepo(): StoreRepoAdapter {
  const store = useGremlyStore();

  // Get item by ID (synchronous from store state)
  const getById = useCallback((id: string): (Todo | Habit | Note) | null => {
    const state = useGremlyStore.getState();
    return selectItemById(state, id);
  }, []);

  // Create item based on type
  const create = useCallback(
    async (input: CreateRecordInput): Promise<Todo | Habit | Note> => {
      const type = input.type;
      if (type === 'todo') {
        return store.createTodo(input as Partial<Todo>);
      } else if (type === 'habit') {
        return store.createHabit(input as Partial<Habit>);
      } else {
        // Default to note
        return store.createNote(input as Partial<Note>);
      }
    },
    [store],
  );

  // Update item - determine type and call appropriate store method
  const update = useCallback(
    async (params: {
      id: string;
      patch: Record<string, unknown>;
    }): Promise<Todo | Habit | Note> => {
      const { id, patch } = params;
      const item = getById(id);

      if (!item) {
        throw new Error(`Item ${id} not found`);
      }

      // Determine type from item
      const itemType =
        (item as unknown as Record<string, unknown>).type ??
        ('due_date' in item || 'due_day' in item ? 'todo' : 'frequency' in item ? 'habit' : 'note');

      if (itemType === 'todo') {
        await store.updateTodo(id, patch as Partial<Todo>);
      } else if (itemType === 'habit') {
        await store.updateHabit(id, patch as Partial<Habit>);
      } else {
        await store.updateNote(id, patch as Partial<Note>);
      }

      // Return updated item from store
      const updated = getById(id);
      if (!updated) {
        throw new Error(`Item ${id} not found after update`);
      }
      return updated;
    },
    [store, getById],
  );

  // Remove item - determine type and call appropriate store method
  const remove = useCallback(
    async (id: string): Promise<void> => {
      const item = getById(id);

      if (!item) {
        // Item may already be deleted, don't throw
        console.warn(`[StoreAsRepo] remove: item ${id} not found`);
        return;
      }

      const itemType =
        (item as unknown as Record<string, unknown>).type ??
        ('due_date' in item || 'due_day' in item ? 'todo' : 'frequency' in item ? 'habit' : 'note');

      if (itemType === 'todo') {
        await store.deleteTodo(id);
      } else if (itemType === 'habit') {
        await store.deleteHabit(id);
      } else {
        await store.deleteNote(id);
      }
    },
    [store, getById],
  );

  // Find note by source message ID (synchronous from store state)
  const findNoteBySourceMessageId = useCallback((sourceMessageId: string): Note | null => {
    const state = useGremlyStore.getState();
    return selectNoteBySourceMessageId(state, sourceMessageId);
  }, []);

  // Insert log photo
  const insertLogPhoto = useCallback(
    async (params: { noteId: string; url: string; position: number }) => {
      return store.insertLogPhoto(params);
    },
    [store],
  );

  // Notes namespace for compatibility
  const notes = useMemo(
    () => ({
      create: async (input: Partial<Note>): Promise<Note> => {
        return store.createNote(input);
      },
      list: async (opts?: { limit?: number; order?: string }): Promise<Note[]> => {
        const state = useGremlyStore.getState();
        let result = state.notes.filter((n) => !n.archived);

        // Sort by created_at desc by default
        if (opts?.order === 'desc' || !opts?.order) {
          result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        } else {
          result = result.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        }

        // Apply limit
        if (opts?.limit) {
          result = result.slice(0, opts.limit);
        }

        return result;
      },
    }),
    [store],
  );

  // Todos namespace for compatibility
  const todos = useMemo(
    () => ({
      list: async (opts?: { limit?: number; order?: string }): Promise<Todo[]> => {
        const state = useGremlyStore.getState();
        let result = state.todos.filter((t) => !t.archived);

        // Sort by created_at desc by default
        if (opts?.order === 'desc' || !opts?.order) {
          result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        } else {
          result = result.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        }

        // Apply limit
        if (opts?.limit) {
          result = result.slice(0, opts.limit);
        }

        return result;
      },
    }),
    [],
  );

  // Habits namespace for compatibility
  const habits = useMemo(
    () => ({
      list: async (opts?: { limit?: number; order?: string }): Promise<Habit[]> => {
        const state = useGremlyStore.getState();
        let result = state.habits.filter((h) => !h.archived);

        // Sort by created_at desc by default
        if (opts?.order === 'desc' || !opts?.order) {
          result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        } else {
          result = result.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        }

        // Apply limit
        if (opts?.limit) {
          result = result.slice(0, opts.limit);
        }

        return result;
      },
    }),
    [],
  );

  // Legacy addUnsorted method for catchall creation
  const addUnsorted = useCallback(
    async (spaceId: string | null, input: Partial<Note>): Promise<Note> => {
      return store.createNote({
        ...input,
        space_id: spaceId,
        type: 'note',
      });
    },
    [store],
  );

  return useMemo(
    () => ({
      getById,
      create,
      update,
      remove,
      findNoteBySourceMessageId,
      insertLogPhoto,
      notes,
      todos,
      habits,
      addUnsorted,
    }),
    [
      getById,
      create,
      update,
      remove,
      findNoteBySourceMessageId,
      insertLogPhoto,
      notes,
      todos,
      habits,
      addUnsorted,
    ],
  );
}

/**
 * Get store adapter for non-React contexts (e.g., inside callbacks)
 * Returns the adapter functions directly without React hooks.
 */
export function getStoreAsRepo(): StoreRepoAdapter {
  const store = useGremlyStore.getState();

  const getById = (id: string): (Todo | Habit | Note) | null => {
    const state = useGremlyStore.getState();
    return selectItemById(state, id);
  };

  const create = async (input: CreateRecordInput): Promise<Todo | Habit | Note> => {
    const type = input.type;
    if (type === 'todo') {
      return store.createTodo(input as Partial<Todo>);
    } else if (type === 'habit') {
      return store.createHabit(input as Partial<Habit>);
    } else {
      return store.createNote(input as Partial<Note>);
    }
  };

  const update = async (params: {
    id: string;
    patch: Record<string, unknown>;
  }): Promise<Todo | Habit | Note> => {
    const { id, patch } = params;
    const item = getById(id);

    if (!item) {
      throw new Error(`Item ${id} not found`);
    }

    const itemType =
      (item as unknown as Record<string, unknown>).type ??
      ('due_date' in item || 'due_day' in item ? 'todo' : 'frequency' in item ? 'habit' : 'note');

    if (itemType === 'todo') {
      await store.updateTodo(id, patch as Partial<Todo>);
    } else if (itemType === 'habit') {
      await store.updateHabit(id, patch as Partial<Habit>);
    } else {
      await store.updateNote(id, patch as Partial<Note>);
    }

    const updated = getById(id);
    if (!updated) {
      throw new Error(`Item ${id} not found after update`);
    }
    return updated;
  };

  const remove = async (id: string): Promise<void> => {
    const item = getById(id);
    if (!item) return;

    const itemType =
      (item as unknown as Record<string, unknown>).type ??
      ('due_date' in item || 'due_day' in item ? 'todo' : 'frequency' in item ? 'habit' : 'note');

    if (itemType === 'todo') {
      await store.deleteTodo(id);
    } else if (itemType === 'habit') {
      await store.deleteHabit(id);
    } else {
      await store.deleteNote(id);
    }
  };

  const findNoteBySourceMessageId = (sourceMessageId: string): Note | null => {
    const state = useGremlyStore.getState();
    return selectNoteBySourceMessageId(state, sourceMessageId);
  };

  const insertLogPhoto = async (params: { noteId: string; url: string; position: number }) => {
    return store.insertLogPhoto(params);
  };

  const notes = {
    create: async (input: Partial<Note>): Promise<Note> => {
      return store.createNote(input);
    },
    list: async (opts?: { limit?: number; order?: string }): Promise<Note[]> => {
      const state = useGremlyStore.getState();
      let result = state.notes.filter((n) => !n.archived);
      if (opts?.order === 'desc' || !opts?.order) {
        result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      if (opts?.limit) {
        result = result.slice(0, opts.limit);
      }
      return result;
    },
  };

  const todos = {
    list: async (opts?: { limit?: number; order?: string }): Promise<Todo[]> => {
      const state = useGremlyStore.getState();
      let result = state.todos.filter((t) => !t.archived);
      if (opts?.order === 'desc' || !opts?.order) {
        result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      if (opts?.limit) {
        result = result.slice(0, opts.limit);
      }
      return result;
    },
  };

  const habits = {
    list: async (opts?: { limit?: number; order?: string }): Promise<Habit[]> => {
      const state = useGremlyStore.getState();
      let result = state.habits.filter((h) => !h.archived);
      if (opts?.order === 'desc' || !opts?.order) {
        result = result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      if (opts?.limit) {
        result = result.slice(0, opts.limit);
      }
      return result;
    },
  };

  const addUnsorted = async (spaceId: string | null, input: Partial<Note>): Promise<Note> => {
    return store.createNote({
      ...input,
      space_id: spaceId,
      type: 'note',
    });
  };

  return {
    getById,
    create,
    update,
    remove,
    findNoteBySourceMessageId,
    insertLogPhoto,
    notes,
    todos,
    habits,
    addUnsorted,
  };
}
