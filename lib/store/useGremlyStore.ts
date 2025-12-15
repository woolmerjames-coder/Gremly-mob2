import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '../supabase/client';
import type { Todo, Habit, Note, Space, Tag } from '../types';
import { eventBus } from '../events';

// ═══════════════════════════════════════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

interface GremlyState {
  // ═══════════════════════════════════════════════════════════════════
  // RAW DATA (populated on app start)
  // ═══════════════════════════════════════════════════════════════════
  todos: Todo[];
  habits: Habit[];
  notes: Note[];
  spaces: Space[];
  tags: Tag[];

  // Loading/sync state
  isLoading: boolean;
  isInitialized: boolean;
  lastSyncedAt: Date | null;
  userId: string | null;

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  initialize: (userId: string) => Promise<void>;
  reset: () => void;

  // ═══════════════════════════════════════════════════════════════════
  // TODO MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createTodo: (todo: Partial<Todo>) => Promise<Todo>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  completeTodo: (id: string) => Promise<void>;
  uncompleteTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string, reason?: string) => Promise<void>;
  restoreTodo: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // HABIT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createHabit: (habit: Partial<Habit>) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  completeHabit: (id: string) => Promise<void>;
  uncompleteHabit: (id: string) => Promise<void>;
  archiveHabit: (id: string, reason?: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // NOTE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createNote: (note: Partial<Note>) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  archiveNote: (id: string, reason?: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpace: (space: Partial<Space>) => Promise<Space>;
  updateSpace: (id: string, updates: Partial<Space>) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // BULK/UTILITY
  // ═══════════════════════════════════════════════════════════════════
  refreshFromServer: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const initialState = {
  todos: [] as Todo[],
  habits: [] as Habit[],
  notes: [] as Note[],
  spaces: [] as Space[],
  tags: [] as Tag[],
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null as Date | null,
  userId: null as string | null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export const useGremlyStore = create<GremlyState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ═══════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    initialize: async (userId: string) => {
      // Don't re-initialize if already done for same user
      if (get().isInitialized && get().userId === userId) {
        return;
      }

      set({ isLoading: true, userId });

      try {
        // Fetch ALL user data in parallel
        const [todosRes, habitsRes, notesRes, spacesRes, tagsRes] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
        ]);

        // Check for errors
        if (todosRes.error) throw todosRes.error;
        if (habitsRes.error) throw habitsRes.error;
        if (notesRes.error) throw notesRes.error;
        if (spacesRes.error) throw spacesRes.error;
        if (tagsRes.error) throw tagsRes.error;

        set({
          todos: todosRes.data ?? [],
          habits: habitsRes.data ?? [],
          notes: notesRes.data ?? [],
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          isLoading: false,
          isInitialized: true,
          lastSyncedAt: new Date(),
        });

        console.log('[GremlyStore] ✅ Initialized with', {
          todos: todosRes.data?.length ?? 0,
          habits: habitsRes.data?.length ?? 0,
          notes: notesRes.data?.length ?? 0,
          spaces: spacesRes.data?.length ?? 0,
        });
      } catch (error) {
        console.error('[GremlyStore] ❌ Failed to initialize:', error);
        set({ isLoading: false });
        throw error;
      }
    },

    reset: () => {
      set({
        todos: [],
        habits: [],
        notes: [],
        spaces: [],
        tags: [],
        isLoading: false,
        isInitialized: false,
        lastSyncedAt: null,
        userId: null,
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // TODO MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createTodo: async (todo: Partial<Todo>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const payload = {
        ...todo,
        owner_id: userId,
        type: 'todo' as const,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('todos').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createTodo failed:', error);
        throw error;
      }

      // Add to store
      set((state) => ({
        todos: [...state.todos, data],
      }));

      eventBus.emit('entity:created', { entity: data, type: 'todo', spaceId: data.space_id });
      return data;
    },

    updateTodo: async (id: string, updates: Partial<Todo>) => {
      const prevTodo = get().todos.find((t) => t.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, ...updates, updated_at: now } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('todos')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    deleteTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.filter((t) => t.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: [...state.todos, prevTodo],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', { id, type: 'todo', spaceId: prevTodo?.space_id });
    },

    completeTodo: async (id: string) => {
      const now = new Date().toISOString();
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, completed_at: now } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').update({ completed_at: now }).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] completeTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      // EMIT EVENT for backward compatibility
      eventBus.emit('ItemCompleted', { id, type: 'todo' });
    },

    uncompleteTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, completed_at: null } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').update({ completed_at: null }).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] uncompleteTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }
    },

    archiveTodo: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) =>
          t.id === id
            ? { ...t, archived: true, archived_at: now, archived_reason: reason ?? null }
            : t,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('todos')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    restoreTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) =>
          t.id === id ? { ...t, archived: false, archived_at: null, archived_reason: null } : t,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('todos')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    // ═══════════════════════════════════════════════════════════════════
    // HABIT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createHabit: async (habit: Partial<Habit>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const payload = {
        ...habit,
        owner_id: userId,
        type: 'habit' as const,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('habits').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createHabit failed:', error);
        throw error;
      }

      // Add to store
      set((state) => ({
        habits: [...state.habits, data],
      }));

      eventBus.emit('entity:created', { entity: data, type: 'habit', spaceId: data.space_id });
      return data;
    },

    updateHabit: async (id: string, updates: Partial<Habit>) => {
      const prevHabit = get().habits.find((h) => h.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates, updated_at: now } : h)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('habits')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    deleteHabit: async (id: string) => {
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.filter((h) => h.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('habits').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: [...state.habits, prevHabit],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', { id, type: 'habit', spaceId: prevHabit?.space_id });
    },

    completeHabit: async (id: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const todayDate = now.split('T')[0]; // YYYY-MM-DD for occurred_day
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE - update habit's last_completed_at
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, last_completed_at: now, updated_at: now } : h,
        ),
      }));

      try {
        // 2. INSERT into habit_progress (source of truth for completions)
        const { error: progressError } = await supabase.from('habit_progress').insert({
          habit_id: id,
          owner_id: userId,
          occurred_day: todayDate,
          occurred_at: now,
          count: 1,
        });

        if (progressError) {
          // Check if it's a duplicate (already completed today)
          if (progressError.code === '23505') {
            console.log('[GremlyStore] Habit already completed today:', id);
            // Update the existing record's count instead (for habits done multiple times/day)
            // For now, just return - habit is already marked complete
            return;
          }
          throw progressError;
        }

        // 3. UPDATE habit's last_completed_at (denormalized field for fast reads)
        const { error: habitError } = await supabase
          .from('habits')
          .update({ last_completed_at: now, updated_at: now })
          .eq('id', id);

        if (habitError) {
          // Rollback progress insert
          await supabase
            .from('habit_progress')
            .delete()
            .eq('habit_id', id)
            .eq('owner_id', userId)
            .eq('occurred_day', todayDate);
          throw habitError;
        }

        // 4. EMIT EVENT for backward compatibility (strangler fig pattern)
        eventBus.emit('ItemCompleted', { id, type: 'habit' });

        console.log('[GremlyStore] ✅ Habit completed:', id);
      } catch (error) {
        // ROLLBACK optimistic update
        console.error('[GremlyStore] completeHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }
    },

    uncompleteHabit: async (id: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, last_completed_at: null } : h)),
      }));

      try {
        // 2. DELETE from habit_progress for today
        const { error: progressError } = await supabase
          .from('habit_progress')
          .delete()
          .eq('habit_id', id)
          .eq('owner_id', userId)
          .eq('occurred_day', todayDate);

        if (progressError) throw progressError;

        // 3. Recalculate last_completed_at from remaining progress records
        const { data: latestProgress, error: fetchError } = await supabase
          .from('habit_progress')
          .select('occurred_at')
          .eq('habit_id', id)
          .eq('owner_id', userId)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchError) throw fetchError;

        const newLastCompleted = latestProgress?.occurred_at ?? null;

        // 4. UPDATE habit's last_completed_at
        const { error: habitError } = await supabase
          .from('habits')
          .update({ last_completed_at: newLastCompleted })
          .eq('id', id);

        if (habitError) throw habitError;

        // 5. Update store with correct recalculated value
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, last_completed_at: newLastCompleted } : h,
          ),
        }));

        // 6. EMIT EVENT for backward compatibility
        eventBus.emit('ItemUpdated', { id });

        console.log('[GremlyStore] ✅ Habit uncompleted:', id);
      } catch (error) {
        console.error('[GremlyStore] uncompleteHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }
    },

    archiveHabit: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id
            ? { ...h, archived: true, archived_at: now, archived_reason: reason ?? null }
            : h,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('habits')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    restoreHabit: async (id: string) => {
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, archived: false, archived_at: null, archived_reason: null } : h,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('habits')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    // ═══════════════════════════════════════════════════════════════════
    // NOTE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createNote: async (note: Partial<Note>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const payload = {
        ...note,
        owner_id: userId,
        type: 'note' as const,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('notes').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createNote failed:', error);
        throw error;
      }

      // Add to store
      set((state) => ({
        notes: [...state.notes, data],
      }));

      eventBus.emit('entity:created', { entity: data, type: 'note', spaceId: data.space_id });
      return data;
    },

    updateNote: async (id: string, updates: Partial<Note>) => {
      const prevNote = get().notes.find((n) => n.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates, updated_at: now } : n)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('notes')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    deleteNote: async (id: string) => {
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('notes').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: [...state.notes, prevNote],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', { id, type: 'note', spaceId: prevNote?.space_id });
    },

    archiveNote: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id
            ? { ...n, archived: true, archived_at: now, archived_reason: reason ?? null }
            : n,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('notes')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    restoreNote: async (id: string) => {
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id ? { ...n, archived: false, archived_at: null, archived_reason: null } : n,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('notes')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    // ═══════════════════════════════════════════════════════════════════
    // SPACE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createSpace: async (space: Partial<Space>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const payload = {
        ...space,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('spaces').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createSpace failed:', error);
        throw error;
      }

      // Add to store
      set((state) => ({
        spaces: [...state.spaces, data],
      }));

      eventBus.emit('entity:created', { entity: data, type: 'space' });
      return data;
    },

    updateSpace: async (id: string, updates: Partial<Space>) => {
      const prevSpace = get().spaces.find((s) => s.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        spaces: state.spaces.map((s) => (s.id === id ? { ...s, ...updates, updated_at: now } : s)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('spaces')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateSpace failed:', error);
        if (prevSpace) {
          set((state) => ({
            spaces: state.spaces.map((s) => (s.id === id ? prevSpace : s)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id });
    },

    deleteSpace: async (id: string) => {
      const prevSpace = get().spaces.find((s) => s.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        spaces: state.spaces.filter((s) => s.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('spaces').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteSpace failed:', error);
        if (prevSpace) {
          set((state) => ({
            spaces: [...state.spaces, prevSpace],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', { id, type: 'space' });
    },

    // ═══════════════════════════════════════════════════════════════════
    // BULK/UTILITY
    // ═══════════════════════════════════════════════════════════════════

    refreshFromServer: async () => {
      const userId = get().userId;
      if (!userId) return;

      // Re-fetch all data (same as initialize but doesn't reset isInitialized)
      set({ isLoading: true });

      try {
        const [todosRes, habitsRes, notesRes, spacesRes, tagsRes] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
        ]);

        set({
          todos: todosRes.data ?? [],
          habits: habitsRes.data ?? [],
          notes: notesRes.data ?? [],
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          isLoading: false,
          lastSyncedAt: new Date(),
        });

        console.log('[GremlyStore] ✅ Refreshed from server');
      } catch (error) {
        console.error('[GremlyStore] refreshFromServer failed:', error);
        set({ isLoading: false });
      }
    },
  })),
);
