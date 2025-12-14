/**
 * Hub selectors - Pure functions for Hub screen item filtering and analysis
 *
 * These selectors are pure (no side effects), stable (deterministic given same input),
 * and do not depend on current time directly (time is passed as parameter).
 */

import type { Todo, Note } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Reason codes for why an item needs attention
 */
export type AttentionReason =
  | 'todo_missing_due_date_stale' // Todo without due_day, older than threshold
  | 'idea_stale' // Idea note older than threshold
  | 'no_space_assigned'; // Item has no space (optional, feature-flagged)

/**
 * Item that needs attention with reason
 */
export interface NeedsAttentionItem {
  item: Todo | Note;
  reason: AttentionReason;
  reasonText: string; // Human-readable explanation
  ageInDays: number; // How old the item is
}

/**
 * Options for selectNeedsAttentionItems
 */
export interface NeedsAttentionOptions {
  /** Current time as ISO string - required for deterministic output */
  nowIso: string;
  /** Threshold in days for todos without due dates (default: 5) */
  todoStaleDays?: number;
  /** Threshold in days for stale ideas (default: 7) */
  ideaStaleDays?: number;
  /** Include items with no space assigned (feature flag, default: false) */
  includeNoSpace?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate age in days between two ISO date strings
 */
function getDaysBetween(olderIso: string, newerIso: string): number {
  const older = new Date(olderIso);
  const newer = new Date(newerIso);
  const diffMs = newer.getTime() - older.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a note is an "idea" type
 * Ideas can be identified by:
 * - subtype === 'idea'
 */
function isIdeaNote(note: Note): boolean {
  return note.subtype === 'idea';
}

/**
 * Check if item is archived
 */
function isArchived(item: Todo | Note): boolean {
  if (item.archived === true) return true;
  if (item.type === 'todo' && item.completed_at) return true;
  return false;
}

// =============================================================================
// Main Selector
// =============================================================================

/**
 * Select items that need attention based on various criteria.
 *
 * This is a pure function - it does not read system time or have side effects.
 * Pass `nowIso` to make output deterministic and testable.
 *
 * Criteria:
 * 1. Todos missing due_day that are older than `todoStaleDays` (default: 5)
 * 2. Idea notes older than `ideaStaleDays` (default: 7)
 * 3. Items with no space assigned (optional, controlled by `includeNoSpace`)
 *
 * @param todos - Array of Todo items to evaluate
 * @param notes - Array of Note items to evaluate (includes ideas, journals, etc.)
 * @param options - Configuration options including required `nowIso`
 * @returns Array of items needing attention with reasons
 */
export function selectNeedsAttentionItems(
  todos: Todo[],
  notes: Note[],
  options: NeedsAttentionOptions,
): NeedsAttentionItem[] {
  const { nowIso, todoStaleDays = 5, ideaStaleDays = 7, includeNoSpace = false } = options;

  const results: NeedsAttentionItem[] = [];

  // -------------------------------------------------------------------------
  // Check todos for missing due dates
  // -------------------------------------------------------------------------
  for (const todo of todos) {
    // Skip archived/completed items
    if (isArchived(todo)) continue;

    // Check for missing due_day
    if (!todo.due_day && !todo.due_date) {
      const ageInDays = getDaysBetween(todo.created_at, nowIso);
      if (ageInDays >= todoStaleDays) {
        results.push({
          item: todo,
          reason: 'todo_missing_due_date_stale',
          reasonText: `Task has no due date and is ${ageInDays} days old`,
          ageInDays,
        });
        continue; // Don't add same item twice
      }
    }

    // Optional: check for no space
    if (includeNoSpace && !todo.space_id) {
      const ageInDays = getDaysBetween(todo.created_at, nowIso);
      results.push({
        item: todo,
        reason: 'no_space_assigned',
        reasonText: 'Task has no space assigned',
        ageInDays,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Check notes for stale ideas
  // -------------------------------------------------------------------------
  for (const note of notes) {
    // Skip archived items
    if (isArchived(note)) continue;

    // Check for stale ideas
    if (isIdeaNote(note)) {
      const ageInDays = getDaysBetween(note.created_at, nowIso);
      if (ageInDays >= ideaStaleDays) {
        results.push({
          item: note,
          reason: 'idea_stale',
          reasonText: `Idea is ${ageInDays} days old and may need review`,
          ageInDays,
        });
        continue; // Don't add same item twice
      }
    }

    // Optional: check for no space
    if (includeNoSpace && !note.space_id) {
      const ageInDays = getDaysBetween(note.created_at, nowIso);
      results.push({
        item: note,
        reason: 'no_space_assigned',
        reasonText: 'Note has no space assigned',
        ageInDays,
      });
    }
  }

  return results;
}
