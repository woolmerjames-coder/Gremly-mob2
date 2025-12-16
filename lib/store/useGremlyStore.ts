import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '../supabase/client';
import type { Todo, Habit, Note, Space, Tag, SpaceChat, SpaceChatMessage } from '../types';
import type { Milestone } from '../schemas';
import { eventBus } from '../events';

// Source marker to identify events emitted by this store (to prevent self-handling)
const STORE_EVENT_SOURCE = 'gremly-store';

// Module-level unsubscribe function for cleanup
let eventBusUnsubscribe: (() => void) | null = null;

/**
 * Sanitize payload before sending to Supabase.
 * - Strips app-only fields that don't exist in DB
 * - Renames camelCase fields to snake_case DB columns
 */
function sanitizeForSupabase(
  payload: Record<string, unknown>,
  entityType: 'note' | 'todo' | 'habit',
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...payload };

  // Remove app-only fields (re-added on read)
  delete sanitized.type;

  // RENAME canonicalType → canonical_type (all entities)
  if ('canonicalType' in sanitized) {
    sanitized.canonical_type = sanitized.canonicalType;
    delete sanitized.canonicalType;
  }

  // RENAME details → body (for todos)
  if (entityType === 'todo' && 'details' in sanitized) {
    sanitized.body = sanitized.details;
    delete sanitized.details;
  }

  // RENAME content → body (for notes, if passed as content)
  if (entityType === 'note' && 'content' in sanitized) {
    sanitized.body = sanitized.content;
    delete sanitized.content;
  }

  // RENAME frequency_value → frequency_json (for habits)
  if (entityType === 'habit' && 'frequency_value' in sanitized) {
    sanitized.frequency_json = sanitized.frequency_value;
    delete sanitized.frequency_value;
  }

  // These don't exist in DB, safe to remove
  delete sanitized.due_at;
  delete sanitized.photo_uri;

  // For todos and habits: ensure 'name' is set (required NOT NULL column)
  if ((entityType === 'todo' || entityType === 'habit') && !sanitized.name && sanitized.title) {
    sanitized.name = sanitized.title;
  }

  return sanitized;
}

// Habit progress row from Supabase
export interface HabitProgressRow {
  id: string;
  owner_id: string;
  habit_id: string;
  occurred_at: string; // ISO timestamp
  occurred_day: string; // YYYY-MM-DD
  count: number;
  occurrence_index: number | null;
}

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
  habitProgress: HabitProgressRow[];
  spaceChats: SpaceChat[];
  spaceChatMessages: SpaceChatMessage[];
  milestones: Milestone[];

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
  /** Log habit completion for a specific date (for Habits This Week) */
  logHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
  /** Remove habit completion for a specific date (for Habits This Week) */
  removeHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
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
  // SPACE CHAT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpaceChat: (spaceId: string, title: string) => Promise<SpaceChat | null>;
  updateSpaceChat: (chatId: string, patch: Partial<SpaceChat>) => Promise<void>;
  archiveSpaceChat: (chatId: string) => Promise<void>;
  deleteSpaceChat: (chatId: string) => Promise<void>;
  addChatMessage: (
    message: Omit<SpaceChatMessage, 'id' | 'created_at'>,
  ) => Promise<SpaceChatMessage | null>;
  loadChatMessages: (chatId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // MILESTONE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createMilestone: (
    spaceId: string,
    data: { name: string; date?: string | null },
  ) => Promise<Milestone | null>;
  updateMilestone: (milestoneId: string, patch: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (milestoneId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // LOG PHOTO MUTATIONS (for Mind Drop attachments)
  // ═══════════════════════════════════════════════════════════════════
  insertLogPhoto: (params: {
    noteId: string;
    url: string;
    position: number;
  }) => Promise<{ id: string }>;
  deleteLogPhoto: (photoId: string) => Promise<void>;
  updateLogPhotoPosition: (photoId: string, position: number) => Promise<void>;
  listLogPhotos: (noteId: string) => Promise<Array<{ id: string; url: string; position: number }>>;

  // ═══════════════════════════════════════════════════════════════════
  // BULK/UTILITY
  // ═══════════════════════════════════════════════════════════════════
  refreshFromServer: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // EVENT BUS SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════
  subscribeToEvents: () => () => void; // Returns unsubscribe function
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
  habitProgress: [] as HabitProgressRow[],
  spaceChats: [] as SpaceChat[],
  spaceChatMessages: [] as SpaceChatMessage[],
  milestones: [] as Milestone[],
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
        // Calculate date range: last 60 days for monthly cadence + streak calculation
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sinceDate = sixtyDaysAgo.toISOString().split('T')[0];

        // Fetch ALL user data in parallel
        const [
          todosRes,
          habitsRes,
          notesRes,
          spacesRes,
          tagsRes,
          progressRes,
          chatsRes,
          milestonesRes,
        ] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
          supabase
            .from('habit_progress')
            .select('*')
            .eq('owner_id', userId)
            .gte('occurred_day', sinceDate),
          supabase.from('space_chats').select('*').eq('user_id', userId),
          supabase.from('space_milestones').select('*').eq('owner_id', userId),
        ]);

        // Check for errors (chats/milestones are optional - don't fail if tables don't exist)
        if (todosRes.error) throw todosRes.error;
        if (habitsRes.error) throw habitsRes.error;
        if (notesRes.error) throw notesRes.error;
        if (spacesRes.error) throw spacesRes.error;
        if (tagsRes.error) throw tagsRes.error;
        if (progressRes.error) throw progressRes.error;
        // Log but don't throw for chats/milestones
        if (chatsRes.error) console.warn('[GremlyStore] space_chats fetch error:', chatsRes.error);
        if (milestonesRes.error)
          console.warn('[GremlyStore] milestones fetch error:', milestonesRes.error);

        set({
          // Add type field since DB doesn't store it
          todos: (todosRes.data ?? []).map((t) => ({ ...t, type: 'todo' as const })),
          habits: (habitsRes.data ?? []).map((h) => ({ ...h, type: 'habit' as const })),
          notes: (notesRes.data ?? []).map((n) => ({ ...n, type: 'note' as const })),
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          habitProgress: progressRes.data ?? [],
          spaceChats: chatsRes.data ?? [],
          milestones: milestonesRes.data ?? [],
          spaceChatMessages: [], // Messages are loaded on-demand per chat
          isLoading: false,
          isInitialized: true,
          lastSyncedAt: new Date(),
        });

        console.log('[GremlyStore] ✅ Initialized with', {
          todos: todosRes.data?.length ?? 0,
          habits: habitsRes.data?.length ?? 0,
          notes: notesRes.data?.length ?? 0,
          spaces: spacesRes.data?.length ?? 0,
          habitProgress: progressRes.data?.length ?? 0,
          spaceChats: chatsRes.data?.length ?? 0,
          milestones: milestonesRes.data?.length ?? 0,
        });

        // Subscribe to EventBus for bidirectional sync
        if (eventBusUnsubscribe) {
          eventBusUnsubscribe(); // Clean up any existing subscription
        }
        eventBusUnsubscribe = get().subscribeToEvents();
        console.log('[GremlyStore] ✅ Subscribed to EventBus');
      } catch (error) {
        console.error('[GremlyStore] ❌ Failed to initialize:', error);
        set({ isLoading: false });
        throw error;
      }
    },

    reset: () => {
      // Unsubscribe from EventBus
      if (eventBusUnsubscribe) {
        eventBusUnsubscribe();
        eventBusUnsubscribe = null;
        console.log('[GremlyStore] Unsubscribed from EventBus');
      }

      set({
        todos: [],
        habits: [],
        notes: [],
        spaces: [],
        tags: [],
        habitProgress: [],
        spaceChats: [],
        spaceChatMessages: [],
        milestones: [],
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
      const sanitized = sanitizeForSupabase(todo as Record<string, unknown>, 'todo');
      const payload = {
        ...sanitized,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('todos').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createTodo failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const todoWithType = { ...data, type: 'todo' as const };
      set((state) => ({
        todos: [...state.todos, todoWithType],
      }));

      eventBus.emit('entity:created', {
        entity: todoWithType,
        type: 'todo',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return todoWithType;
    },

    updateTodo: async (id: string, updates: Partial<Todo>) => {
      const prevTodo = get().todos.find((t) => t.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, ...updates, updated_at: now } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'todo');
      const supabaseUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('todos').update(supabaseUpdates).eq('id', id);

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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('entity:deleted', {
        id,
        type: 'todo',
        spaceId: prevTodo?.space_id,
        source: STORE_EVENT_SOURCE,
      });
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
      eventBus.emit('ItemCompleted', { id, type: 'todo', source: STORE_EVENT_SOURCE });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // HABIT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createHabit: async (habit: Partial<Habit>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const sanitized = sanitizeForSupabase(habit as Record<string, unknown>, 'habit');
      const payload = {
        ...sanitized,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('habits').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createHabit failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const habitWithType = { ...data, type: 'habit' as const };
      set((state) => ({
        habits: [...state.habits, habitWithType],
      }));

      eventBus.emit('entity:created', {
        entity: habitWithType,
        type: 'habit',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return habitWithType;
    },

    updateHabit: async (id: string, updates: Partial<Habit>) => {
      const prevHabit = get().habits.find((h) => h.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates, updated_at: now } : h)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'habit');
      const supabaseUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('habits').update(supabaseUpdates).eq('id', id);

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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('entity:deleted', {
        id,
        type: 'habit',
        spaceId: prevHabit?.space_id,
        source: STORE_EVENT_SOURCE,
      });
    },

    completeHabit: async (id: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date();
      const nowIso = now.toISOString();
      // Use LOCAL date for occurred_day to match filtering logic
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE - update habit's last_completed_at
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, last_completed_at: nowIso, updated_at: nowIso } : h,
        ),
      }));

      try {
        // 2. INSERT into habit_progress (source of truth for completions)
        const { error: progressError } = await supabase.from('habit_progress').insert({
          habit_id: id,
          owner_id: userId,
          occurred_day: todayDate,
          occurred_at: nowIso,
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

        // Add to local habitProgress array
        const newProgressRow: HabitProgressRow = {
          id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          habit_id: id,
          owner_id: userId,
          occurred_at: nowIso,
          occurred_day: todayDate,
          count: 1,
          occurrence_index: null,
        };
        set((state) => ({
          habitProgress: [...state.habitProgress, newProgressRow],
        }));

        // 3. UPDATE habit's last_completed_at (denormalized field for fast reads)
        const { error: habitError } = await supabase
          .from('habits')
          .update({ last_completed_at: nowIso, updated_at: nowIso })
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
        eventBus.emit('ItemCompleted', { id, type: 'habit', source: STORE_EVENT_SOURCE });

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

      // Use LOCAL date for occurred_day to match filtering logic
      const now = new Date();
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

        // Remove from local habitProgress array
        set((state) => ({
          habitProgress: state.habitProgress.filter(
            (p) => !(p.habit_id === id && p.occurred_day === todayDate),
          ),
        }));

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
        eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });

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

    /**
     * Log habit completion for a specific date (used by Habits This Week sheet).
     * Updates habitProgress immediately so both Today's Focus and Habits sheet stay in sync.
     */
    logHabitCompletionForDate: async (habitId: string, dateIso: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const occurredDay = dateIso.split('T')[0]; // Ensure YYYY-MM-DD format
      const now = new Date().toISOString();

      // Check if already completed for this date
      const existing = get().habitProgress.find(
        (p) => p.habit_id === habitId && p.occurred_day === occurredDay,
      );
      if (existing) {
        console.log('[GremlyStore] Habit already completed for date:', { habitId, occurredDay });
        return;
      }

      // 1. OPTIMISTIC UPDATE - add to habitProgress immediately
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const newProgressRow: HabitProgressRow = {
        id: tempId,
        habit_id: habitId,
        owner_id: userId,
        occurred_at: now,
        occurred_day: occurredDay,
        count: 1,
        occurrence_index: null,
      };
      set((state) => ({
        habitProgress: [...state.habitProgress, newProgressRow],
      }));

      // 2. PERSIST TO SUPABASE (don't await, fire-and-forget with error handling)
      supabase
        .from('habit_progress')
        .insert({
          habit_id: habitId,
          owner_id: userId,
          occurred_day: occurredDay,
          occurred_at: now,
          count: 1,
        })
        .then(({ error }) => {
          if (error) {
            // Rollback on error
            if (error.code !== '23505') {
              // Ignore duplicate errors
              console.error('[GremlyStore] logHabitCompletionForDate failed:', error);
              set((state) => ({
                habitProgress: state.habitProgress.filter((p) => p.id !== tempId),
              }));
            }
          } else {
            console.log('[GremlyStore] ✅ Habit completion logged:', { habitId, occurredDay });
          }
        });
    },

    /**
     * Remove habit completion for a specific date (used by Habits This Week sheet).
     * Updates habitProgress immediately so both Today's Focus and Habits sheet stay in sync.
     */
    removeHabitCompletionForDate: async (habitId: string, dateIso: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const occurredDay = dateIso.split('T')[0]; // Ensure YYYY-MM-DD format

      // Find the record to remove
      const toRemove = get().habitProgress.find(
        (p) => p.habit_id === habitId && p.occurred_day === occurredDay,
      );

      if (!toRemove) {
        console.log('[GremlyStore] No completion found to remove:', { habitId, occurredDay });
        return;
      }

      // 1. OPTIMISTIC UPDATE - remove from habitProgress immediately
      set((state) => ({
        habitProgress: state.habitProgress.filter(
          (p) => !(p.habit_id === habitId && p.occurred_day === occurredDay),
        ),
      }));

      // 2. PERSIST TO SUPABASE (don't await, fire-and-forget with error handling)
      supabase
        .from('habit_progress')
        .delete()
        .eq('habit_id', habitId)
        .eq('owner_id', userId)
        .eq('occurred_day', occurredDay)
        .then(({ error }) => {
          if (error) {
            // Rollback on error
            console.error('[GremlyStore] removeHabitCompletionForDate failed:', error);
            if (toRemove) {
              set((state) => ({
                habitProgress: [...state.habitProgress, toRemove],
              }));
            }
          } else {
            console.log('[GremlyStore] ✅ Habit completion removed:', { habitId, occurredDay });
          }
        });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // NOTE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createNote: async (note: Partial<Note>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const sanitized = sanitizeForSupabase(note as Record<string, unknown>, 'note');
      const payload = {
        ...sanitized,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('notes').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createNote failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const noteWithType = { ...data, type: 'note' as const };
      set((state) => ({
        notes: [...state.notes, noteWithType],
      }));

      eventBus.emit('entity:created', {
        entity: noteWithType,
        type: 'note',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return noteWithType;
    },

    updateNote: async (id: string, updates: Partial<Note>) => {
      const prevNote = get().notes.find((n) => n.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates, updated_at: now } : n)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'note');
      const dbUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('notes').update(dbUpdates).eq('id', id);

      // 4. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('entity:deleted', {
        id,
        type: 'note',
        spaceId: prevNote?.space_id,
        source: STORE_EVENT_SOURCE,
      });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('entity:created', { entity: data, type: 'space', source: STORE_EVENT_SOURCE });
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

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
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

      eventBus.emit('entity:deleted', { id, type: 'space', source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // SPACE CHAT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createSpaceChat: async (spaceId: string, title: string) => {
      const userId = get().userId;
      if (!userId) return null;

      const now = new Date().toISOString();
      const newChat: Partial<SpaceChat> = {
        space_id: spaceId,
        user_id: userId,
        title,
        pinned: false,
        created_at: now,
        updated_at: now,
      };

      // Optimistic update with temp ID
      const tempId = `temp-${Date.now()}`;
      const optimisticChat = { ...newChat, id: tempId } as SpaceChat;
      set((state) => ({ spaceChats: [optimisticChat, ...state.spaceChats] }));

      try {
        const { data, error } = await supabase
          .from('space_chats')
          .insert(newChat)
          .select()
          .single();

        if (error) throw error;

        // Replace temp with real
        set((state) => ({
          spaceChats: state.spaceChats.map((c) => (c.id === tempId ? data : c)),
        }));

        eventBus.emit('entity:created', {
          type: 'space_chat',
          entity: data,
          source: STORE_EVENT_SOURCE,
        });
        return data;
      } catch (error) {
        // Rollback
        set((state) => ({
          spaceChats: state.spaceChats.filter((c) => c.id !== tempId),
        }));
        console.error('[GremlyStore] createSpaceChat failed:', error);
        throw error;
      }
    },

    updateSpaceChat: async (chatId: string, patch: Partial<SpaceChat>) => {
      const prev = get().spaceChats.find((c) => c.id === chatId);
      if (!prev) return;

      const now = new Date().toISOString();

      // Optimistic update
      set((state) => ({
        spaceChats: state.spaceChats.map((c) =>
          c.id === chatId ? { ...c, ...patch, updated_at: now } : c,
        ),
      }));

      try {
        const { error } = await supabase
          .from('space_chats')
          .update({ ...patch, updated_at: now })
          .eq('id', chatId);

        if (error) throw error;

        // Get the updated entity from store for the event
        const updated = get().spaceChats.find((c) => c.id === chatId);
        eventBus.emit('entity:updated', {
          type: 'space_chat',
          entity: updated,
          source: STORE_EVENT_SOURCE,
        });
      } catch (error) {
        // Rollback
        set((state) => ({
          spaceChats: state.spaceChats.map((c) => (c.id === chatId ? prev : c)),
        }));
        console.error('[GremlyStore] updateSpaceChat failed:', error);
        throw error;
      }
    },

    archiveSpaceChat: async (chatId: string) => {
      await get().updateSpaceChat(chatId, { archived_at: new Date().toISOString() });
    },

    deleteSpaceChat: async (chatId: string) => {
      const prev = get().spaceChats.find((c) => c.id === chatId);

      // Optimistic update - remove chat and its messages
      set((state) => ({
        spaceChats: state.spaceChats.filter((c) => c.id !== chatId),
        spaceChatMessages: state.spaceChatMessages.filter((m) => m.chat_id !== chatId),
      }));

      try {
        const { error } = await supabase.from('space_chats').delete().eq('id', chatId);
        if (error) throw error;
        eventBus.emit('entity:deleted', {
          type: 'space_chat',
          id: chatId,
          source: STORE_EVENT_SOURCE,
        });
      } catch (error) {
        // Rollback
        if (prev) {
          set((state) => ({ spaceChats: [...state.spaceChats, prev] }));
        }
        console.error('[GremlyStore] deleteSpaceChat failed:', error);
        throw error;
      }
    },

    addChatMessage: async (message: Omit<SpaceChatMessage, 'id' | 'created_at'>) => {
      const userId = get().userId;
      if (!userId) return null;

      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticMessage = {
        ...message,
        id: tempId,
        user_id: userId,
        created_at: now,
      } as SpaceChatMessage;

      set((state) => ({
        spaceChatMessages: [...state.spaceChatMessages, optimisticMessage],
      }));

      try {
        const { data, error } = await supabase
          .from('space_chat_messages')
          .insert({ ...message, user_id: userId })
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          spaceChatMessages: state.spaceChatMessages.map((m) => (m.id === tempId ? data : m)),
        }));

        // Update chat's last_message_snippet
        const snippet = message.content.slice(0, 100);
        await get().updateSpaceChat(message.chat_id, {
          last_message_snippet: snippet,
        });

        return data;
      } catch (error) {
        set((state) => ({
          spaceChatMessages: state.spaceChatMessages.filter((m) => m.id !== tempId),
        }));
        console.error('[GremlyStore] addChatMessage failed:', error);
        throw error;
      }
    },

    loadChatMessages: async (chatId: string) => {
      try {
        const { data, error } = await supabase
          .from('space_chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Merge with existing messages (avoid duplicates)
        set((state) => {
          const existingIds = new Set(
            state.spaceChatMessages.filter((m) => m.chat_id === chatId).map((m) => m.id),
          );
          const newMessages = (data ?? []).filter((m) => !existingIds.has(m.id));
          return {
            spaceChatMessages: [
              ...state.spaceChatMessages.filter((m) => m.chat_id !== chatId),
              ...(data ?? []),
            ],
          };
        });
      } catch (error) {
        console.error('[GremlyStore] loadChatMessages failed:', error);
        throw error;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // MILESTONE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createMilestone: async (spaceId: string, data: { name: string; date?: string | null }) => {
      const userId = get().userId;
      if (!userId) return null;

      const now = new Date().toISOString();
      const newMilestone = {
        space_id: spaceId,
        owner_id: userId,
        name: data.name,
        date: data.date ?? null,
        completed: false,
        completed_at: null,
        is_active: true,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      };

      const tempId = `temp-${Date.now()}`;
      set((state) => ({
        milestones: [...state.milestones, { ...newMilestone, id: tempId } as Milestone],
      }));

      try {
        const { data: result, error } = await supabase
          .from('space_milestones')
          .insert(newMilestone)
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          milestones: state.milestones.map((m) => (m.id === tempId ? result : m)),
        }));

        return result;
      } catch (error) {
        set((state) => ({
          milestones: state.milestones.filter((m) => m.id !== tempId),
        }));
        console.error('[GremlyStore] createMilestone failed:', error);
        throw error;
      }
    },

    updateMilestone: async (milestoneId: string, patch: Partial<Milestone>) => {
      const prev = get().milestones.find((m) => m.id === milestoneId);
      if (!prev) return;

      const now = new Date().toISOString();

      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? { ...m, ...patch, updated_at: now } : m,
        ),
      }));

      try {
        const { error } = await supabase
          .from('space_milestones')
          .update({ ...patch, updated_at: now })
          .eq('id', milestoneId);

        if (error) throw error;
      } catch (error) {
        set((state) => ({
          milestones: state.milestones.map((m) => (m.id === milestoneId ? prev : m)),
        }));
        console.error('[GremlyStore] updateMilestone failed:', error);
        throw error;
      }
    },

    deleteMilestone: async (milestoneId: string) => {
      const prev = get().milestones.find((m) => m.id === milestoneId);

      set((state) => ({
        milestones: state.milestones.filter((m) => m.id !== milestoneId),
      }));

      try {
        const { error } = await supabase.from('space_milestones').delete().eq('id', milestoneId);
        if (error) throw error;
      } catch (error) {
        if (prev) {
          set((state) => ({ milestones: [...state.milestones, prev] }));
        }
        console.error('[GremlyStore] deleteMilestone failed:', error);
        throw error;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // LOG PHOTO MUTATIONS (for Mind Drop attachments)
    // ═══════════════════════════════════════════════════════════════════

    insertLogPhoto: async (params: { noteId: string; url: string; position: number }) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('log_photos')
        .insert({
          note_id: params.noteId,
          owner_id: userId,
          url: params.url,
          position: params.position,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[GremlyStore] insertLogPhoto failed:', error);
        throw new Error(`Failed to insert log photo: ${error.message}`);
      }

      return { id: data.id };
    },

    deleteLogPhoto: async (photoId: string) => {
      const { error } = await supabase.from('log_photos').delete().eq('id', photoId);

      if (error) {
        console.error('[GremlyStore] deleteLogPhoto failed:', error);
        throw new Error(`Failed to delete log photo: ${error.message}`);
      }
    },

    updateLogPhotoPosition: async (photoId: string, position: number) => {
      const { error } = await supabase.from('log_photos').update({ position }).eq('id', photoId);

      if (error) {
        console.error('[GremlyStore] updateLogPhotoPosition failed:', error);
        throw new Error(`Failed to update log photo position: ${error.message}`);
      }
    },

    listLogPhotos: async (noteId: string) => {
      const { data, error } = await supabase
        .from('log_photos')
        .select('id, url, position')
        .eq('note_id', noteId)
        .order('position', { ascending: true });

      if (error) {
        console.error('[GremlyStore] listLogPhotos failed:', error);
        throw new Error(`Failed to list log photos: ${error.message}`);
      }

      return data ?? [];
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
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sinceDate = sixtyDaysAgo.toISOString().split('T')[0];

        const [
          todosRes,
          habitsRes,
          notesRes,
          spacesRes,
          tagsRes,
          progressRes,
          chatsRes,
          milestonesRes,
        ] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
          supabase
            .from('habit_progress')
            .select('*')
            .eq('owner_id', userId)
            .gte('occurred_day', sinceDate),
          supabase.from('space_chats').select('*').eq('user_id', userId),
          supabase.from('space_milestones').select('*').eq('owner_id', userId),
        ]);

        set({
          // Add type field since DB doesn't store it
          todos: (todosRes.data ?? []).map((t) => ({ ...t, type: 'todo' as const })),
          habits: (habitsRes.data ?? []).map((h) => ({ ...h, type: 'habit' as const })),
          notes: (notesRes.data ?? []).map((n) => ({ ...n, type: 'note' as const })),
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          habitProgress: progressRes.data ?? [],
          spaceChats: chatsRes.data ?? [],
          milestones: milestonesRes.data ?? [],
          isLoading: false,
          lastSyncedAt: new Date(),
        });

        console.log('[GremlyStore] ✅ Refreshed from server');
      } catch (error) {
        console.error('[GremlyStore] refreshFromServer failed:', error);
        set({ isLoading: false });
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // EVENT BUS SUBSCRIPTION
    // Listens for entity events from other parts of the app (MindDrop, etc.)
    // This enables bidirectional sync during the migration period
    // ═══════════════════════════════════════════════════════════════════

    subscribeToEvents: () => {
      // Handler for entity:created events
      const handleEntityCreated = (payload: {
        entity: any;
        type: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        console.log('[GremlyStore] entity:created received', {
          type: payload.type,
          entityId: payload.entity?.id,
          source: payload.source,
          hasEntity: !!payload.entity,
        });

        // Skip events emitted by this store to prevent duplicate handling
        if (payload.source === STORE_EVENT_SOURCE) {
          console.log('[GremlyStore] Skipping self-emitted event');
          return;
        }

        const state = get();
        const entity = payload.entity;

        if (!entity?.id) {
          console.warn('[GremlyStore] entity:created received without valid entity');
          return;
        }

        if (payload.type === 'todo') {
          // Only add if not already in store
          if (!state.todos.some((t) => t.id === entity.id)) {
            set({ todos: [...state.todos, entity as Todo] });
            console.log('[GremlyStore] ✅ Added todo from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Todo already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'habit') {
          if (!state.habits.some((h) => h.id === entity.id)) {
            set({ habits: [...state.habits, entity as Habit] });
            console.log('[GremlyStore] ✅ Added habit from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Habit already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'note') {
          if (!state.notes.some((n) => n.id === entity.id)) {
            set({ notes: [...state.notes, entity as Note] });
            console.log('[GremlyStore] ✅ Added note from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Note already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'space') {
          if (!state.spaces.some((s) => s.id === entity.id)) {
            set({ spaces: [...state.spaces, entity as Space] });
            console.log('[GremlyStore] ✅ Added space from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Space already exists, skipping:', entity.id);
          }
        } else {
          console.log('[GremlyStore] Unknown entity type, ignoring:', payload.type);
        }
      };

      // Handler for entity:updated events
      const handleEntityUpdated = (payload: {
        entity: any;
        type: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        // Skip events emitted by this store
        if (payload.source === STORE_EVENT_SOURCE) return;

        const state = get();
        const entity = payload.entity;

        if (!entity?.id) return;

        if (payload.type === 'todo') {
          set({
            todos: state.todos.map((t) => (t.id === entity.id ? { ...t, ...entity } : t)),
          });
          console.log('[GremlyStore] Updated todo from EventBus:', entity.id);
        } else if (payload.type === 'habit') {
          set({
            habits: state.habits.map((h) => (h.id === entity.id ? { ...h, ...entity } : h)),
          });
          console.log('[GremlyStore] Updated habit from EventBus:', entity.id);
        } else if (payload.type === 'note') {
          set({
            notes: state.notes.map((n) => (n.id === entity.id ? { ...n, ...entity } : n)),
          });
          console.log('[GremlyStore] Updated note from EventBus:', entity.id);
        } else if (payload.type === 'space') {
          set({
            spaces: state.spaces.map((s) => (s.id === entity.id ? { ...s, ...entity } : s)),
          });
          console.log('[GremlyStore] Updated space from EventBus:', entity.id);
        }
      };

      // Handler for entity:deleted events
      const handleEntityDeleted = (payload: {
        id: string;
        type?: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        // Skip events emitted by this store
        if (payload.source === STORE_EVENT_SOURCE) return;

        const state = get();
        const { id, type } = payload;

        if (type === 'todo') {
          set({ todos: state.todos.filter((t) => t.id !== id) });
          console.log('[GremlyStore] Deleted todo from EventBus:', id);
        } else if (type === 'habit') {
          set({ habits: state.habits.filter((h) => h.id !== id) });
          console.log('[GremlyStore] Deleted habit from EventBus:', id);
        } else if (type === 'note') {
          set({ notes: state.notes.filter((n) => n.id !== id) });
          console.log('[GremlyStore] Deleted note from EventBus:', id);
        } else if (type === 'space') {
          set({ spaces: state.spaces.filter((s) => s.id !== id) });
          console.log('[GremlyStore] Deleted space from EventBus:', id);
        }
      };

      // Handler for legacy ItemUpdated events (from useTodayInteractions, etc.)
      const handleItemUpdated = (payload: { id: string; type?: string; source?: string }) => {
        if (payload.source === STORE_EVENT_SOURCE) return;

        // For ItemUpdated, we need to fetch the latest from Supabase
        // since the payload doesn't contain the full entity
        const fetchAndUpdate = async () => {
          const state = get();
          const userId = state.userId;
          if (!userId) return;

          // Try to find which type this ID belongs to
          const inTodos = state.todos.some((t) => t.id === payload.id);
          const inHabits = state.habits.some((h) => h.id === payload.id);
          const inNotes = state.notes.some((n) => n.id === payload.id);

          if (inTodos || payload.type === 'todo') {
            const { data } = await supabase.from('todos').select('*').eq('id', payload.id).single();
            if (data) {
              set({
                todos: state.todos.map((t) => (t.id === payload.id ? data : t)),
              });
              console.log('[GremlyStore] Synced todo from ItemUpdated:', payload.id);
            }
          } else if (inHabits || payload.type === 'habit') {
            const { data } = await supabase
              .from('habits')
              .select('*')
              .eq('id', payload.id)
              .single();
            if (data) {
              set({
                habits: state.habits.map((h) => (h.id === payload.id ? data : h)),
              });
              console.log('[GremlyStore] Synced habit from ItemUpdated:', payload.id);
            }
          } else if (inNotes || payload.type === 'note') {
            const { data } = await supabase.from('notes').select('*').eq('id', payload.id).single();
            if (data) {
              set({
                notes: state.notes.map((n) => (n.id === payload.id ? data : n)),
              });
              console.log('[GremlyStore] Synced note from ItemUpdated:', payload.id);
            }
          }
        };

        void fetchAndUpdate();
      };

      // Handler for entity:enriched events (Phase 2 enrichment updates)
      // This refetches the entity from DB since enrichment updates name, title, frequency, tags, etc.
      const handleEntityEnriched = (payload: { entityId: string; smartTitle?: string }) => {
        const fetchAndUpdate = async () => {
          const state = get();
          const userId = state.userId;
          if (!userId) return;

          const entityId = payload.entityId;

          // Check which store array contains this entity
          const inTodos = state.todos.some((t) => t.id === entityId);
          const inHabits = state.habits.some((h) => h.id === entityId);
          const inNotes = state.notes.some((n) => n.id === entityId);

          if (inTodos) {
            const { data } = await supabase.from('todos').select('*').eq('id', entityId).single();
            if (data) {
              set({
                todos: state.todos.map((t) => (t.id === entityId ? { ...t, ...data } : t)),
              });
              console.log('[GremlyStore] ✅ Synced todo from entity:enriched:', entityId);
            }
          } else if (inHabits) {
            const { data } = await supabase.from('habits').select('*').eq('id', entityId).single();
            if (data) {
              set({
                habits: state.habits.map((h) => (h.id === entityId ? { ...h, ...data } : h)),
              });
              console.log('[GremlyStore] ✅ Synced habit from entity:enriched:', entityId);
            }
          } else if (inNotes) {
            const { data } = await supabase.from('notes').select('*').eq('id', entityId).single();
            if (data) {
              set({
                notes: state.notes.map((n) => (n.id === entityId ? { ...n, ...data } : n)),
              });
              console.log('[GremlyStore] ✅ Synced note from entity:enriched:', entityId);
            }
          } else {
            console.log('[GremlyStore] entity:enriched for unknown entity:', entityId);
          }
        };

        void fetchAndUpdate();
      };

      // Subscribe to entity lifecycle events
      const unsub1 = eventBus.on('entity:created', handleEntityCreated);
      const unsub2 = eventBus.on('entity:updated', handleEntityUpdated);
      const unsub3 = eventBus.on('entity:deleted', handleEntityDeleted);

      // Subscribe to enrichment events (Phase 2 updates)
      const unsub6 = eventBus.on('entity:enriched', handleEntityEnriched);

      // Subscribe to legacy events for backward compatibility
      const unsub4 = eventBus.on('ItemUpdated', handleItemUpdated);
      const unsub5 = eventBus.on('ItemCompleted', handleItemUpdated);

      // Return combined unsubscribe function
      return () => {
        unsub1();
        unsub2();
        unsub3();
        unsub4();
        unsub5();
        unsub6();
      };
    },
  })),
);
