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
  // TODO: Read last_sweep_completed_at from public.cortex_preferences for this owner.
  //
  // Implementation plan:
  // 1. Query cortex_preferences where owner_id = ownerId
  // 2. Return the last_sweep_completed_at value (may be null)
  //
  // Example:
  // const { data, error } = await client
  //   .from('cortex_preferences')
  //   .select('last_sweep_completed_at')
  //   .eq('owner_id', ownerId)
  //   .single();
  // return data?.last_sweep_completed_at ?? null;

  return null;
}

/**
 * Fetch all items that should appear in the current sweep session.
 *
 * Candidates are items that:
 * 1. Belong to the user (owner_id matches)
 * 2. Are NOT archived
 * 3. Were created AFTER the last sweep completed, OR
 * 4. Were previously skipped (skipped_in_sweep_at is not null)
 *
 * This queries todos, habits, and notes tables and normalizes them
 * into SweepCandidate objects.
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @returns Array of sweep candidates across all entity types
 */
export async function fetchSweepCandidatesForUser(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<SweepCandidate[]> {
  // TODO: Select from todos, habits, notes where:
  //   - owner_id = ownerId
  //   - archived = false (or is null)
  //   - created_at > last_sweep_completed_at OR skipped_in_sweep_at IS NOT NULL
  //
  // Implementation plan:
  //
  // 1. First get lastSweepAt = await getLastSweepCompletedAt(ownerId, client)
  //
  // 2. For TODOS:
  //    const { data: todos } = await client
  //      .from('todos')
  //      .select('*')
  //      .eq('owner_id', ownerId)
  //      .or('archived.is.null,archived.eq.false')
  //      .or(`created_at.gt.${lastSweepAt},skipped_in_sweep_at.not.is.null`);
  //
  // 3. For HABITS:
  //    const { data: habits } = await client
  //      .from('habits')
  //      .select('*')
  //      .eq('owner_id', ownerId)
  //      .is('completed_at', null)  // habits use completed_at for "archived"
  //      .or(`created_at.gt.${lastSweepAt},skipped_in_sweep_at.not.is.null`);
  //
  // 4. For NOTES:
  //    const { data: notes } = await client
  //      .from('notes')
  //      .select('*')
  //      .eq('owner_id', ownerId)
  //      .or('archived.is.null,archived.eq.false')
  //      .or(`created_at.gt.${lastSweepAt},skipped_in_sweep_at.not.is.null`);
  //
  // 5. Normalize each row into SweepCandidate format:
  //    - Extract id, kind, createdAt, dropId, skippedInSweepAt
  //    - Attach raw row for UI rendering
  //
  // 6. Combine and sort by createdAt (newest first? oldest first? TBD)
  //
  // 7. Return combined array

  return [];
}

/**
 * Apply a user's action to a sweep candidate.
 *
 * Actions:
 * - `keep`: Clear skipped_in_sweep_at (item stays as-is, won't reappear in sweep)
 * - `clear`: Archive the item (set archived = true, archived_reason = 'swept')
 * - `skip`: Set skipped_in_sweep_at = now() (item will reappear in next sweep)
 *
 * @param action - The action to apply
 * @param client - Supabase client instance
 */
export async function applySweepAction(
  action: SweepAction,
  client: SupabaseClient<Database>,
): Promise<void> {
  const tableName = getTableName(action.kind);

  switch (action.type) {
    case 'keep': {
      // TODO: Clear skipped_in_sweep_at for this row.
      // This means the user confirmed the item - it won't appear in future sweeps
      // unless it's edited or new activity occurs.
      //
      // await client
      //   .from(tableName)
      //   .update({ skipped_in_sweep_at: null })
      //   .eq('id', action.id);
      break;
    }

    case 'clear': {
      // TODO: Archive the item.
      // Set archived = true, archived_reason = 'swept', archived_at = now()
      //
      // For todos/notes:
      // await client
      //   .from(tableName)
      //   .update({
      //     archived: true,
      //     archived_reason: 'swept',
      //     archived_at: new Date().toISOString(),
      //   })
      //   .eq('id', action.id);
      //
      // For habits (which use completed_at):
      // await client
      //   .from('habits')
      //   .update({
      //     completed_at: new Date().toISOString(),
      //     // Note: habits may not have archived_reason field - check schema
      //   })
      //   .eq('id', action.id);
      break;
    }

    case 'skip': {
      // TODO: Set skipped_in_sweep_at = now()
      // This defers the decision - item will reappear in the next sweep session.
      //
      // await client
      //   .from(tableName)
      //   .update({ skipped_in_sweep_at: new Date().toISOString() })
      //   .eq('id', action.id);
      break;
    }
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
