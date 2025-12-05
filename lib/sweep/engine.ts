/**
 * Sweep Engine - Core Business Logic
 *
 * This module contains the core logic for the Evening Sweep feature.
 * It handles:
 * - Fetching sweep candidates (items created since last sweep)
 * - Applying user actions (keep, clear, skip)
 * - Recording sweep completion
 *
 * NOTE: This module uses raw Supabase client calls.
 * We may refactor to use repo helpers later for consistency.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';
import type { SweepCandidate, SweepEntityKind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Action Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User actions that can be applied to a sweep candidate.
 *
 * - `keep`: User wants to keep the item as-is (clears any previous skip)
 * - `clear`: User wants to archive/dismiss the item
 * - `skip`: User wants to defer decision to next sweep session
 */
export type SweepAction =
  | { type: 'keep'; id: string; kind: SweepEntityKind }
  | { type: 'clear'; id: string; kind: SweepEntityKind }
  | { type: 'skip'; id: string; kind: SweepEntityKind };

// ─────────────────────────────────────────────────────────────────────────────
// Engine Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the timestamp of the user's last completed sweep session.
 *
 * This is used to determine which items should appear in the current sweep:
 * - Items created AFTER this timestamp are candidates
 * - Items with skipped_in_sweep_at set are also candidates (deferred from previous sweeps)
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @returns ISO timestamp string or null if user has never completed a sweep
 */
export async function getLastSweepCompletedAt(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('cortex_preferences')
      .select('last_sweep_completed_at')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      console.error('[Sweep] Failed to get last_sweep_completed_at:', error);
      return null;
    }

    return data?.last_sweep_completed_at ?? null;
  } catch (error) {
    console.error('[Sweep] Unexpected error in getLastSweepCompletedAt:', error);
    return null;
  }
}

/**
 * Fetch all items that should appear in the current sweep session.
 *
 * Candidates are items that meet ALL of the following criteria:
 * 1. Belong to the user (owner_id matches)
 * 2. Are NOT archived
 * 3. Meet one of these time-based conditions:
 *    - Were created AFTER the last sweep completed, OR
 *    - Were previously skipped (skipped_in_sweep_at is not null)
 *
 * For first-time users (no previous sweep), we use a 48-hour lookback window
 * to avoid overwhelming them with old items.
 *
 * **Why include skipped items?**
 * When a user clicks "Skip" during a sweep, we set `skipped_in_sweep_at` on that item.
 * This ensures the item reappears in the next sweep session for another decision,
 * even if it was created before the last sweep timestamp.
 *
 * **Entity-specific filters:**
 * - Todos: All non-archived todos (any canonical_type that maps to a task)
 * - Habits: Active habits only (completed_at is null)
 * - Notes: Only logs/journals (subtype = 'log' or canonical_type in ['log', 'journal'])
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @returns Array of sweep candidates across all entity types, sorted by createdAt ascending
 */
export async function fetchSweepCandidatesForUser(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<SweepCandidate[]> {
  // Get the cutoff timestamp for "new" items
  const lastSweepAt = await getLastSweepCompletedAt(ownerId, client);

  // For first-time users, use a 48-hour lookback window
  const fallbackCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const cutoffTimestamp = lastSweepAt ?? fallbackCutoff;

  const candidates: SweepCandidate[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch TODOS
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Query todos that are:
    // - Owned by user
    // - Not archived
    // - Not completed (status !== 'completed')
    // - Either new (created after cutoff) OR previously skipped
    const { data: todos, error: todoError } = await client
      .from('todos')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('archived', false)
      .neq('status', 'completed')
      .or(`created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`);

    if (todoError) {
      console.error('[Sweep] Failed to fetch todos:', todoError);
    } else if (todos) {
      // Get today's date string for overdue comparison
      const todayDay = new Date().toISOString().split('T')[0];

      for (const row of todos) {
        // Compute isOverdue: due_day (or due_date fallback) < today
        const dueDay = row.due_day ?? (row.due_date ? row.due_date.split('T')[0] : null);
        const isOverdue = dueDay !== null && dueDay < todayDay;

        candidates.push({
          id: row.id,
          kind: 'todo',
          createdAt: row.created_at ?? new Date().toISOString(),
          dropId: row.drop_id,
          skippedInSweepAt: row.skipped_in_sweep_at,
          isOverdue,
          raw: row,
        });
      }
    }
  } catch (error) {
    console.error('[Sweep] Unexpected error fetching todos:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch HABITS
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Query habits that are:
    // - Owned by user
    // - Not completed (completed_at is null = active habit)
    // - Either new (created after cutoff) OR previously skipped
    const { data: habits, error: habitError } = await client
      .from('habits')
      .select('*')
      .eq('owner_id', ownerId)
      .is('completed_at', null)
      .or(`created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`);

    if (habitError) {
      console.error('[Sweep] Failed to fetch habits:', habitError);
    } else if (habits) {
      for (const row of habits) {
        candidates.push({
          id: row.id,
          kind: 'habit',
          createdAt: row.created_at ?? new Date().toISOString(),
          dropId: row.drop_id,
          skippedInSweepAt: row.skipped_in_sweep_at,
          isOverdue: false, // Habits don't have due dates
          raw: row,
        });
      }
    }
  } catch (error) {
    console.error('[Sweep] Unexpected error fetching habits:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch NOTES (logs/journals only)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Query notes that are:
    // - Owned by user
    // - Not archived
    // - Are logs/journals (subtype = 'log' OR canonical_type in ['log', 'journal'])
    // - Either new (created after cutoff) OR previously skipped
    //
    // We include both subtype and canonical_type checks for compatibility
    // with both the old and new classification systems.
    const { data: notes, error: noteError } = await client
      .from('notes')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('archived', false)
      .or('subtype.eq.log,canonical_type.eq.log,canonical_type.eq.journal')
      .or(`created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`);

    if (noteError) {
      console.error('[Sweep] Failed to fetch notes:', noteError);
    } else if (notes) {
      for (const row of notes) {
        candidates.push({
          id: row.id,
          kind: 'note',
          createdAt: row.created_at ?? new Date().toISOString(),
          dropId: row.drop_id,
          skippedInSweepAt: row.skipped_in_sweep_at,
          isOverdue: false, // Notes don't have due dates
          raw: row,
        });
      }
    }
  } catch (error) {
    console.error('[Sweep] Unexpected error fetching notes:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sort by createdAt ascending (oldest first)
  // ─────────────────────────────────────────────────────────────────────────
  // This ensures users process older items first, which makes more sense
  // for a "sweep" workflow where you're catching up on things.
  candidates.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  console.log('[Sweep] fetchSweepCandidatesForUser:', {
    ownerId,
    cutoffTimestamp,
    lastSweepAt,
    candidateCount: candidates.length,
    breakdown: {
      todos: candidates.filter((c) => c.kind === 'todo').length,
      habits: candidates.filter((c) => c.kind === 'habit').length,
      notes: candidates.filter((c) => c.kind === 'note').length,
    },
  });

  return candidates;
}

/**
 * Apply a user's action to a sweep candidate.
 *
 * This function performs a single Supabase update per action.
 * Errors are logged but not thrown — the calling UI should continue
 * the Sweep even if one update fails.
 *
 * **Actions:**
 * - `keep`: Clears `skipped_in_sweep_at` to NULL.
 *   The user reviewed this item and wants to keep it as-is.
 *   It won't reappear in future sweeps unless new activity occurs.
 *
 * - `clear`: Archives the item by setting:
 *   - `archived = true`
 *   - `archived_reason = 'swept'`
 *   - `archived_at = now()`
 *
 * - `skip`: Sets `skipped_in_sweep_at = now()`.
 *   The user deferred the decision — this item will reappear
 *   in the next sweep session.
 *
 * @param action - The action to apply (keep, clear, or skip)
 * @param client - Supabase client instance (do not create a new one)
 */
export async function applySweepAction(
  action: SweepAction,
  client: SupabaseClient<Database>,
): Promise<void> {
  const tableName = getTableName(action.kind);
  const now = new Date().toISOString();

  try {
    switch (action.type) {
      case 'keep': {
        // Clear skipped_in_sweep_at — user confirmed the item.
        // It won't reappear in future sweeps unless edited or new.
        const { error } = await client
          .from(tableName)
          .update({ skipped_in_sweep_at: null })
          .eq('id', action.id);

        if (error) {
          console.error(`[Sweep] Failed to apply 'keep' to ${action.kind}:`, error);
        }
        break;
      }

      case 'clear': {
        // Archive the item with reason 'swept'.
        // All three tables (todos, habits, notes) have these fields.
        const { error } = await client
          .from(tableName)
          .update({
            archived: true,
            archived_reason: 'swept',
            archived_at: now,
          })
          .eq('id', action.id);

        if (error) {
          console.error(`[Sweep] Failed to apply 'clear' to ${action.kind}:`, error);
        }
        break;
      }

      case 'skip': {
        // Set skipped_in_sweep_at — item will reappear in next sweep.
        const { error } = await client
          .from(tableName)
          .update({ skipped_in_sweep_at: now })
          .eq('id', action.id);

        if (error) {
          console.error(`[Sweep] Failed to apply 'skip' to ${action.kind}:`, error);
        }
        break;
      }
    }
  } catch (error) {
    // Swallow unexpected errors — don't block the sweep UX
    console.error(`[Sweep] Unexpected error in applySweepAction (${action.type}):`, error);
  }
}

/**
 * Record that the user has completed a sweep session.
 *
 * This is a **best-effort** operation for logging and metadata purposes.
 * It should NOT block the Sweep UX — if either operation fails, we log
 * the error and continue. The user should still see their sweep complete
 * successfully even if analytics/preferences fail to update.
 *
 * This does two things:
 * 1. Logs an event to the `events` table with the sweep summary (for analytics/history)
 * 2. Updates `last_sweep_completed_at` in `cortex_preferences` so future sweeps know the cutoff
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @param summary - Counts of actions taken during the sweep
 */
export async function markSweepCompleted(
  ownerId: string,
  client: SupabaseClient<Database>,
  summary: { kept: number; cleared: number; skipped: number },
): Promise<void> {
  const now = new Date().toISOString();

  try {
    // 1. Insert event for analytics/history
    const { error: eventError } = await client.from('events').insert({
      owner_id: ownerId,
      kind: 'sweep_completed',
      payload_json: {
        ...summary,
        completed_at: now,
      },
    });

    if (eventError) {
      console.error('[Sweep] Failed to log sweep_completed event:', eventError);
    }

    // 2. Update cortex_preferences.last_sweep_completed_at
    const { error: prefError } = await client
      .from('cortex_preferences')
      .update({ last_sweep_completed_at: now })
      .eq('owner_id', ownerId);

    if (prefError) {
      console.error('[Sweep] Failed to update last_sweep_completed_at:', prefError);
    }
  } catch (error) {
    // Swallow any unexpected errors — this is best-effort logging
    console.error('[Sweep] Unexpected error in markSweepCompleted:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map entity kind to database table name.
 */
function getTableName(kind: SweepEntityKind): 'todos' | 'habits' | 'notes' {
  switch (kind) {
    case 'todo':
      return 'todos';
    case 'habit':
      return 'habits';
    case 'note':
      return 'notes';
  }
}
