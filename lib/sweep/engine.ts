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
import type { SweepCandidate, SweepEntityKind, SweepAttachment } from './types';
import { buildSweepTodoOrClause, getEffectiveDueDay } from './todoFilters';
import { getDateService, nowTimestamp } from '../date';
import { fetchAllPaginated } from '../supabase/fetchAllPaginated';

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
 * 3. Meet one of these conditions:
 *    - **Todos:** Are DUE TODAY or OVERDUE (due_day <= today) → ALWAYS included
 *    - **Notes:** Created AFTER the last sweep completed → ALWAYS included
 *    - Were created AFTER the last sweep completed (both types), OR
 *    - Were previously skipped (skipped_in_sweep_at is not null)
 *
 * For first-time users (no previous sweep):
 * - Todos: Use 48-hour lookback window for creation time filter
 * - Notes: Include only notes created TODAY
 *
 * **Why include due-today and overdue todos unconditionally?**
 * Todos that are due today or overdue represent commitments that need attention.
 * They should always appear in Sweep regardless of when they were created,
 * so users can decide to keep, clear, or reschedule them.
 *
 * This logic is ALIGNED with the Today/NOW page's sweep selectors
 * (see lib/today/sweepSelectors.ts and lib/sweep/todoFilters.ts).
 *
 * **Why include all new notes/captures?**
 * Every Mind Drop capture should be reviewed at least once in Sweep.
 * This ensures users don't accumulate unreviewed captures. After the first
 * sweep review (keep or clear), the note won't reappear unless skipped.
 *
 * **Why include skipped items?**
 * When a user clicks "Skip" during a sweep, we set `skipped_in_sweep_at` on that item.
 * This ensures the item reappears in the next sweep session for another decision,
 * even if it was created before the last sweep timestamp.
 *
 * **Entity-specific filters:**
 * - Todos: Non-archived, non-completed. Due today OR overdue ALWAYS included.
 * - Notes: Non-archived, non-catchall. New since last sweep ALWAYS included.
 * - Habits: NOT included in sweep candidates
 *
 * **Computed metadata:**
 * - isOverdue: due_day < today (todos only)
 * - isDueToday: due_day == today (todos only)
 * - isCreatedToday: createdAt is today (all items)
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
  const fallbackCutoff = new Date(
    getDateService().now().getTime() - 48 * 60 * 60 * 1000,
  ).toISOString();
  const cutoffTimestamp = lastSweepAt ?? fallbackCutoff;

  const candidates: SweepCandidate[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch TODOS
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Get today's date string for due date comparison
    const todayDay = getDateService().today();

    // Build the OR clause using shared filter logic
    // This aligns with lib/today/sweepSelectors.ts for consistency
    const todoOrClause = buildSweepTodoOrClause(todayDay, cutoffTimestamp);

    // Query todos that are:
    // - Owned by user
    // - Not archived
    // - Not completed (status !== 'completed')
    // - AND one of:
    //   - Due today or overdue (due_day <= today) → ALWAYS include
    //   - New (created after cutoff)
    //   - Previously skipped (skipped_in_sweep_at is set)
    let todos: any[] = [];
    try {
      todos = await fetchAllPaginated<any>(() =>
        client
          .from('todos')
          .select('*')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .neq('status', 'completed')
          .or(todoOrClause)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch todos:', error);
    }

    if (todos.length > 0) {
      // Debug: check if any completed todos slipped through
      const completedSlipped = todos.filter((t) => t.status === 'completed');
      if (completedSlipped.length > 0) {
        console.warn(
          '[Sweep] BUG: Completed todos in candidates!',
          completedSlipped.map((t) => ({
            id: t.id.slice(0, 8),
            name: t.name,
            status: t.status,
            completed_at: t.completed_at,
          })),
        );
      }

      for (const row of todos) {
        // Compute isOverdue and isDueToday using shared helper
        const dueDay = getEffectiveDueDay(row);
        const isOverdue = dueDay !== null && dueDay < todayDay;
        const isDueToday = dueDay !== null && dueDay === todayDay;

        // Compute isCreatedToday: createdAt is on today's date
        const createdDay = getDateService().extractLocalDate(row.created_at);
        const isCreatedToday = createdDay === todayDay;

        candidates.push({
          id: row.id,
          kind: 'todo',
          createdAt: row.created_at ?? nowTimestamp(),
          dropId: row.drop_id,
          skippedInSweepAt: row.skipped_in_sweep_at,
          isOverdue,
          isDueToday,
          isCreatedToday,
          raw: row,
        });
      }
    }
  } catch (error) {
    console.error('[Sweep] Unexpected error fetching todos:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch NOTES (Mind Drop captures) - with subtype-specific time windows
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Get today's date string for filtering
    const todayDay = getDateService().today();

    // Helper to process note rows into candidates
    const processNoteRows = (rows: any[]) => {
      for (const row of rows) {
        // Compute isCreatedToday: createdAt is on today's date
        const createdDay = getDateService().extractLocalDate(row.created_at);
        const isCreatedToday = createdDay === todayDay;

        // Extract attachments from the joined log_photos
        const rawPhotos = (row as any).log_photos;
        const attachments: SweepAttachment[] | undefined =
          Array.isArray(rawPhotos) && rawPhotos.length > 0
            ? rawPhotos
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map((photo: any) => ({
                  id: photo.id,
                  url: photo.url,
                  position: photo.position ?? 0,
                }))
            : undefined;

        // Extract date intelligence fields
        const targetDate = row.target_date ?? null;
        const eventTime = row.event_time ?? null;
        const resurfaceAt = row.resurface_at ?? null;

        // Compute event date status
        const isEventToday = targetDate === todayDay;
        const isEventPassed = targetDate !== null && targetDate < todayDay;
        const daysUntilEvent = targetDate
          ? Math.ceil(
              (new Date(targetDate).getTime() - new Date(todayDay).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        // Skip notes where the event date has passed - these should not appear in sweep
        // User can still find them in Notes view, but they don't need sweep attention
        if (isEventPassed) {
          console.log('[Sweep] Skipping past-event note:', {
            id: row.id.slice(0, 8),
            targetDate,
            todayDay,
          });
          continue;
        }

        // For notes, isOverdue/isDueToday now reflect target_date (event date)
        const isOverdue = isEventPassed;
        const isDueToday = isEventToday;

        candidates.push({
          id: row.id,
          kind: 'note',
          createdAt: row.created_at ?? nowTimestamp(),
          dropId: row.drop_id,
          skippedInSweepAt: row.skipped_in_sweep_at,
          isOverdue,
          isDueToday,
          isCreatedToday,
          raw: row,
          attachments,
          // Date intelligence fields
          targetDate,
          eventTime,
          resurfaceAt,
          isEventToday,
          isEventPassed,
          daysUntilEvent,
        });
      }
    };

    // ─────────────────────────────────────────────────────────────────────
    // IDEAS - 7 day window (ideas are worth revisiting longer)
    // ─────────────────────────────────────────────────────────────────────
    const ds = getDateService();
    const sevenDaysAgo = (ds.fromLocalDate(ds.daysAgo(7)) ?? ds.now()).toISOString();
    const ideaOrClause = `created_at.gt.${sevenDaysAgo},skipped_in_sweep_at.not.is.null,resurface_at.lte.${todayDay}`;

    let ideas: any[] = [];
    try {
      ideas = await fetchAllPaginated<any>(() =>
        client
          .from('notes')
          .select('*, log_photos(id, url, position)')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .eq('subtype', 'idea')
          .or(ideaOrClause)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch ideas:', error);
    }

    if (ideas.length > 0) {
      processNoteRows(ideas);
    }

    // ─────────────────────────────────────────────────────────────────────
    // CATCHALL LOGS - today only (recent captures that need triage)
    // ─────────────────────────────────────────────────────────────────────
    const generalOrClause = `created_at.gte.${todayDay}T00:00:00.000Z,skipped_in_sweep_at.not.is.null,resurface_at.lte.${todayDay}`;

    let generalLogs: any[] = [];
    try {
      generalLogs = await fetchAllPaginated<any>(() =>
        client
          .from('notes')
          .select('*, log_photos(id, url, position)')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .eq('subtype', 'catchall')
          .or(generalOrClause)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch general logs:', error);
    }

    if (generalLogs.length > 0) {
      processNoteRows(generalLogs);
    }

    // ─────────────────────────────────────────────────────────────────────
    // LISTS - today only (recent captures that need triage)
    // Note: 'catchall' and 'journal' subtypes are excluded from sweep
    // ─────────────────────────────────────────────────────────────────────
    const listOrClause = `created_at.gte.${todayDay}T00:00:00.000Z,skipped_in_sweep_at.not.is.null,resurface_at.lte.${todayDay}`;

    let lists: any[] = [];
    try {
      lists = await fetchAllPaginated<any>(() =>
        client
          .from('notes')
          .select('*, log_photos(id, url, position)')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .eq('subtype', 'list')
          .or(listOrClause)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch lists:', error);
    }

    if (lists.length > 0) {
      processNoteRows(lists);
    }

    // ─────────────────────────────────────────────────────────────────────
    // REFERENCE notes - today only
    // ─────────────────────────────────────────────────────────────────────
    const refOrClause = `created_at.gte.${todayDay}T00:00:00.000Z,skipped_in_sweep_at.not.is.null,resurface_at.lte.${todayDay}`;

    let refs: any[] = [];
    try {
      refs = await fetchAllPaginated<any>(() =>
        client
          .from('notes')
          .select('*, log_photos(id, url, position)')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .eq('subtype', 'reference')
          .or(refOrClause)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch reference notes:', error);
    }

    if (refs.length > 0) {
      processNoteRows(refs);
    }

    // ─────────────────────────────────────────────────────────────────────
    // EVENT NOTES - Notes with target_date that need reminder prompts
    // Include notes where target_date is within the next 7 days
    // ─────────────────────────────────────────────────────────────────────
    const sevenDaysFromNow = new Date(getDateService().now().getTime());
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysFromNowStr = getDateService().toLocalDate(sevenDaysFromNow);

    let eventNotes: any[] = [];
    try {
      eventNotes = await fetchAllPaginated<any>(() =>
        client
          .from('notes')
          .select('*, log_photos(id, url, position)')
          .eq('owner_id', ownerId)
          .eq('archived', false)
          .not('target_date', 'is', null)
          .gte('target_date', todayDay)
          .lte('target_date', sevenDaysFromNowStr)
          .order('created_at', { ascending: false }),
      );
    } catch (error) {
      console.error('[Sweep] Failed to fetch event notes:', error);
    }

    if (eventNotes.length > 0) {
      processNoteRows(eventNotes);
    }
  } catch (error) {
    console.error('[Sweep] Unexpected error fetching notes:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deduplicate candidates by ID
  // ─────────────────────────────────────────────────────────────────────────
  // Notes are fetched in multiple queries by subtype. In tests or edge cases,
  // the same note might appear in multiple query results. Deduplicate by ID.
  const seenIds = new Set<string>();
  const deduplicatedCandidates = candidates.filter((candidate) => {
    if (seenIds.has(candidate.id)) {
      return false;
    }
    seenIds.add(candidate.id);
    return true;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sort by createdAt ascending (oldest first)
  // ─────────────────────────────────────────────────────────────────────────
  // This ensures users process older items first, which makes more sense
  // for a "sweep" workflow where you're catching up on things.
  deduplicatedCandidates.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  // Enhanced diagnostic logging for debugging count discrepancy
  const todoCandidates = deduplicatedCandidates.filter((c) => c.kind === 'todo');
  const noteCandidates = deduplicatedCandidates.filter((c) => c.kind === 'note');

  console.log('[Sweep] fetchSweepCandidatesForUser:', {
    ownerId,
    cutoffTimestamp,
    lastSweepAt,
    candidateCount: deduplicatedCandidates.length,
    rawCandidateCount: candidates.length,
    deduplicatedCount: candidates.length - deduplicatedCandidates.length,
    breakdown: {
      todos: todoCandidates.length,
      notes: noteCandidates.length,
    },
    todoDetails: todoCandidates.map((c) => ({
      id: c.id.slice(0, 8),
      isOverdue: c.isOverdue,
      isDueToday: c.isDueToday,
      isCreatedToday: c.isCreatedToday,
      dueDay: (c.raw as any)?.due_day,
    })),
    noteDetails: noteCandidates.map((c) => ({
      id: c.id.slice(0, 8),
      subtype: (c.raw as any)?.subtype,
      isCreatedToday: c.isCreatedToday,
      hasPhotos: ((c as any).attachments?.length ?? 0) > 0,
      targetDate: (c.raw as any)?.target_date,
      resurfaceAt: (c.raw as any)?.resurface_at,
      isEventToday: (c as any).isEventToday,
    })),
  });

  return deduplicatedCandidates;
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
 * - `clear`: Behavior depends on item type:
 *   - **Todos:** Archives by setting `archived = true`, `archived_reason = 'swept'`, `archived_at = now()`
 *   - **Notes:** Just clears `skipped_in_sweep_at` (confirms reviewed, keeps in Your Notes)
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
  const now = nowTimestamp();

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
        // Handle 'clear' action differently based on item type:
        // - Todos: Archive (remove from active views)
        // - Notes: Just confirm reviewed (clear skip marker, keep in Your Notes)
        if (action.kind === 'todo') {
          // Archive todos with reason 'swept'
          const { error } = await client
            .from('todos')
            .update({
              archived: true,
              archived_reason: 'swept',
              archived_at: now,
            })
            .eq('id', action.id);

          if (error) {
            console.error(`[Sweep] Failed to archive todo:`, error);
          }
        } else if (action.kind === 'note') {
          // Archive notes on clear - same behavior as todos
          const { error } = await client
            .from('notes')
            .update({
              archived: true,
              archived_at: now,
            })
            .eq('id', action.id);

          if (error) {
            console.error(`[Sweep] Failed to archive note:`, error);
          }
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
/**
 * Mark the sweep as completed:
 * 1. Logs an event to the `events` table with the sweep summary (for analytics/history)
 * 2. Updates `last_sweep_completed_at` in `cortex_preferences` so future sweeps know the cutoff
 * 3. Calculates and updates the sweep streak
 *
 * @param ownerId - The user's ID
 * @param client - Supabase client instance
 * @param summary - Counts of actions taken during the sweep
 * @returns The updated streak count
 */
export async function markSweepCompleted(
  ownerId: string,
  client: SupabaseClient<Database>,
  summary: { kept: number; cleared: number },
): Promise<{ streak: number }> {
  const now = getDateService().now();
  const todayDate = getDateService().today(); // YYYY-MM-DD (local timezone)

  try {
    // 1. Insert event for analytics/history
    const { error: eventError } = await client.from('events').insert({
      owner_id: ownerId,
      kind: 'sweep_completed',
      payload_json: {
        ...summary,
        completed_at: now.toISOString(),
      },
    });

    if (eventError) {
      console.error('[Sweep] Failed to log sweep_completed event:', eventError);
    }

    // 2. Get current streak data
    // Note: sweep_streak and sweep_streak_last_date columns may not exist yet
    const { data: prefs, error: fetchError } = await client
      .from('cortex_preferences')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (fetchError) {
      console.error('[Sweep] Failed to fetch streak data:', fetchError);
    }

    // 3. Calculate new streak
    let newStreak = 1;
    // Cast to any to handle columns that may not exist in TypeScript types yet
    const prefsAny = prefs as Record<string, unknown> | null;
    const lastDate = prefsAny?.sweep_streak_last_date as string | undefined;
    const currentStreak = (prefsAny?.sweep_streak as number) || 0;

    if (lastDate) {
      const lastDateObj = new Date(lastDate + 'T00:00:00');
      const todayObj = new Date(todayDate + 'T00:00:00');
      const diffDays = Math.floor(
        (todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) {
        // Already swept today, keep current streak
        newStreak = currentStreak;
      } else if (diffDays === 1) {
        // Swept yesterday, increment streak
        newStreak = currentStreak + 1;
      } else {
        // Streak broken, start fresh
        newStreak = 1;
      }
    }

    console.log('[Sweep] Streak calculation:', { lastDate, todayDate, currentStreak, newStreak });

    // 4. Upsert cortex_preferences with new streak and timestamp
    // Using upsert to handle first-time users who don't have a row yet
    const { error: prefError } = await client.from('cortex_preferences').upsert(
      {
        owner_id: ownerId,
        last_sweep_completed_at: now.toISOString(),
        sweep_streak: newStreak,
        sweep_streak_last_date: todayDate,
      },
      { onConflict: 'owner_id' },
    );

    if (prefError) {
      console.error('[Sweep] Failed to upsert cortex_preferences:', prefError);
    }

    return { streak: newStreak };
  } catch (error) {
    console.error('[Sweep] Unexpected error in markSweepCompleted:', error);
    return { streak: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map entity kind to database table name.
 * Note: 'habit' was removed - habits are no longer included in sweep candidates.
 */
function getTableName(kind: SweepEntityKind): 'todos' | 'notes' {
  switch (kind) {
    case 'todo':
      return 'todos';
    case 'note':
      return 'notes';
    case 'habit':
      // Habits are no longer included in sweep candidates, but TypeScript needs exhaustive switch
      throw new Error('Habits are not supported in sweep engine');
  }
}
