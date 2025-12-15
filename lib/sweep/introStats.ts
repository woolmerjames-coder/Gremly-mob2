/**
 * Sweep Intro Stats - Fetches activity since last sweep for the intro screen
 *
 * Shows users what they accomplished and what was added since their last sweep,
 * providing context and motivation for the current session.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepIntroItem {
  id: string;
  name: string;
  type: 'todo' | 'habit' | 'note';
}

export interface SweepIntroStats {
  /** Items completed since last sweep */
  completed: {
    todos: SweepIntroItem[];
    habits: SweepIntroItem[];
  };
  /** Items created/dropped since last sweep */
  dropped: {
    todos: SweepIntroItem[];
    habits: SweepIntroItem[];
    notes: SweepIntroItem[];
  };
  /** Whether this is the user's first sweep (no last_sweep_completed_at) */
  isFirstSweep: boolean;
  /** The cutoff timestamp used for queries */
  cutoffTimestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch activity stats since the user's last sweep session.
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @returns Stats showing completed and dropped items since last sweep
 */
export async function fetchSweepIntroStats(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<SweepIntroStats> {
  const emptyStats: SweepIntroStats = {
    completed: { todos: [], habits: [] },
    dropped: { todos: [], habits: [], notes: [] },
    isFirstSweep: true,
    cutoffTimestamp: new Date().toISOString(),
  };

  try {
    // 1. Get last_sweep_completed_at from cortex_preferences
    const { data: prefs, error: prefsError } = await client
      .from('cortex_preferences')
      .select('last_sweep_completed_at')
      .eq('owner_id', ownerId)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine for first-time users
      console.warn('[introStats] Failed to fetch cortex_preferences:', prefsError);
    }

    // 2. Determine cutoff - use last sweep time or 48-hour fallback
    const lastSweepAt = prefs?.last_sweep_completed_at;
    const isFirstSweep = !lastSweepAt;
    const cutoffTimestamp = lastSweepAt || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 3. Query completed todos (completed_at > cutoff)
    let completedTodos: SweepIntroItem[] = [];
    try {
      const { data: todoData, error: todoError } = await client
        .from('todos')
        .select('id, name')
        .eq('owner_id', ownerId)
        .gt('completed_at', cutoffTimestamp)
        .eq('status', 'completed');

      if (todoError) {
        console.warn('[introStats] Failed to fetch completed todos:', todoError);
      } else if (todoData) {
        completedTodos = todoData.map((t) => ({
          id: t.id,
          name: t.name || 'Untitled todo',
          type: 'todo' as const,
        }));
      }
    } catch (err) {
      console.warn('[introStats] Error fetching completed todos:', err);
    }

    // 4. Query completed habits (from habit_progress, dedupe by habit_id)
    let completedHabits: SweepIntroItem[] = [];
    try {
      const { data: progressData, error: progressError } = await client
        .from('habit_progress')
        .select('habit_id, habits(id, name)')
        .eq('owner_id', ownerId)
        .gt('occurred_at', cutoffTimestamp);

      if (progressError) {
        console.warn('[introStats] Failed to fetch habit_progress:', progressError);
      } else if (progressData) {
        // Dedupe by habit_id - one habit can have multiple completions
        const seenHabitIds = new Set<string>();
        completedHabits = progressData
          .filter((p) => {
            if (seenHabitIds.has(p.habit_id)) return false;
            seenHabitIds.add(p.habit_id);
            return true;
          })
          .map((p) => {
            const habit = p.habits as { id: string; name: string } | null;
            return {
              id: p.habit_id,
              name: habit?.name || 'Untitled habit',
              type: 'habit' as const,
            };
          });
      }
    } catch (err) {
      console.warn('[introStats] Error fetching completed habits:', err);
    }

    // 5. Query dropped todos (created since cutoff, not archived, not completed)
    let droppedTodos: SweepIntroItem[] = [];
    try {
      const { data: newTodoData, error: newTodoError } = await client
        .from('todos')
        .select('id, name')
        .eq('owner_id', ownerId)
        .gt('created_at', cutoffTimestamp)
        .eq('archived', false)
        .neq('status', 'completed');

      if (newTodoError) {
        console.warn('[introStats] Failed to fetch dropped todos:', newTodoError);
      } else if (newTodoData) {
        droppedTodos = newTodoData.map((t) => ({
          id: t.id,
          name: t.name || 'Untitled todo',
          type: 'todo' as const,
        }));
      }
    } catch (err) {
      console.warn('[introStats] Error fetching dropped todos:', err);
    }

    // 6. Query dropped habits (created since cutoff, not archived)
    let droppedHabits: SweepIntroItem[] = [];
    try {
      const { data: newHabitData, error: newHabitError } = await client
        .from('habits')
        .select('id, name')
        .eq('owner_id', ownerId)
        .gt('created_at', cutoffTimestamp)
        .eq('archived', false);

      if (newHabitError) {
        console.warn('[introStats] Failed to fetch dropped habits:', newHabitError);
      } else if (newHabitData) {
        droppedHabits = newHabitData.map((h) => ({
          id: h.id,
          name: h.name || 'Untitled habit',
          type: 'habit' as const,
        }));
      }
    } catch (err) {
      console.warn('[introStats] Error fetching dropped habits:', err);
    }

    // 7. Query dropped notes (created since cutoff, not archived)
    let droppedNotes: SweepIntroItem[] = [];
    try {
      const { data: newNoteData, error: newNoteError } = await client
        .from('notes')
        .select('id, title')
        .eq('owner_id', ownerId)
        .gt('created_at', cutoffTimestamp)
        .eq('archived', false);

      if (newNoteError) {
        console.warn('[introStats] Failed to fetch dropped notes:', newNoteError);
      } else if (newNoteData) {
        droppedNotes = newNoteData.map((n) => ({
          id: n.id,
          name: n.title || 'Untitled note',
          type: 'note' as const,
        }));
      }
    } catch (err) {
      console.warn('[introStats] Error fetching dropped notes:', err);
    }

    return {
      completed: {
        todos: completedTodos,
        habits: completedHabits,
      },
      dropped: {
        todos: droppedTodos,
        habits: droppedHabits,
        notes: droppedNotes,
      },
      isFirstSweep,
      cutoffTimestamp,
    };
  } catch (err) {
    console.error('[introStats] Unexpected error fetching sweep intro stats:', err);
    return emptyStats;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format intro stats into human-readable summary lines.
 *
 * @param stats - The sweep intro stats
 * @returns Object with completedLine and droppedLine (null if empty)
 */
export function formatIntroStatsSummary(stats: SweepIntroStats): {
  completedLine: string | null;
  droppedLine: string | null;
} {
  // Helper to pluralize
  const pluralize = (count: number, singular: string, plural?: string) => {
    if (count === 0) return null;
    const word = count === 1 ? singular : plural || `${singular}s`;
    return `${count} ${word}`;
  };

  // Build completed line: "3 todos, 1 habit"
  const completedParts: string[] = [];
  const todoCount = stats.completed.todos.length;
  const habitCount = stats.completed.habits.length;

  if (todoCount > 0) completedParts.push(pluralize(todoCount, 'todo')!);
  if (habitCount > 0) completedParts.push(pluralize(habitCount, 'habit')!);

  const completedLine = completedParts.length > 0 ? completedParts.join(', ') : null;

  // Build dropped line: "2 todos, 4 logs, 1 habit"
  const droppedParts: string[] = [];
  const droppedTodoCount = stats.dropped.todos.length;
  const droppedNoteCount = stats.dropped.notes.length;
  const droppedHabitCount = stats.dropped.habits.length;

  if (droppedTodoCount > 0) droppedParts.push(pluralize(droppedTodoCount, 'todo')!);
  // Notes are called "thoughts" in user-facing copy (feels more Gremly-like)
  if (droppedNoteCount > 0) droppedParts.push(pluralize(droppedNoteCount, 'thought')!);
  if (droppedHabitCount > 0) droppedParts.push(pluralize(droppedHabitCount, 'habit')!);

  const droppedLine = droppedParts.length > 0 ? droppedParts.join(', ') : null;

  return { completedLine, droppedLine };
}
