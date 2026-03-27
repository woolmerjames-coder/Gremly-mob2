/**
 * Hub selectors - Pure functions for Hub screen item filtering and analysis
 *
 * These selectors are pure (no side effects), stable (deterministic given same input),
 * and do not depend on current time directly (time is passed as parameter).
 */

import type { Todo, Note } from '../types';
import { getDateService } from '../date';

// =============================================================================
// Types
// =============================================================================

/**
 * Reason codes for why an item needs attention
 */
export type AttentionReason =
  | 'todo_missing_due_date_stale' // Todo without due_day, older than threshold
  | 'idea_stale' // Idea note older than threshold
  | 'unorganized_stale'; // Item with no tags AND no space, older than threshold

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
  /** Today's date as YYYY-MM-DD - items with this due_day are excluded */
  todayDate?: string;
  /** Threshold in days for todos without due dates (default: 7) */
  todoStaleDays?: number;
  /** Threshold in days for stale ideas (default: 14) */
  ideaStaleDays?: number;
  /** Threshold in days for unorganized items (default: 7) */
  unorganizedStaleDays?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate age in days between two ISO date strings
 */
function getDaysBetween(olderIso: string, newerIso: string): number {
  const ds = getDateService();
  return ds.daysBetween(ds.toLocalDate(new Date(olderIso)), ds.toLocalDate(new Date(newerIso)));
}

/**
 * Check if a note is an "idea" type
 */
function isIdeaNote(note: Note): boolean {
  return note.subtype === 'idea';
}

/**
 * Check if item is archived or completed
 */
function isArchived(item: Todo | Note): boolean {
  if (item.archived === true) return true;
  if (item.type === 'todo' && (item as Todo).completed_at) return true;
  return false;
}

/**
 * Check if item is scheduled for today
 */
function isInToday(item: Todo | Note, todayDate: string | undefined): boolean {
  if (!todayDate) return false;
  if (item.type === 'todo') {
    const todo = item as Todo;
    return todo.due_day === todayDate;
  }
  return false;
}

/**
 * Check if item has no tags and no space (unorganized)
 */
function isUnorganized(item: Todo | Note): boolean {
  const hasTags = item.tags && item.tags.length > 0;
  const hasSpace = !!item.space_id;
  return !hasTags && !hasSpace;
}

// =============================================================================
// Main Selector
// =============================================================================

/**
 * Select items that need attention based on various criteria.
 *
 * This is a pure function - it does not read system time or have side effects.
 * Pass `nowIso` and `todayDate` to make output deterministic and testable.
 *
 * Base filters (all items must pass):
 * - Not archived
 * - Not completed
 * - Not scheduled for today (due_day !== todayDate)
 *
 * Qualifying rules (item must match ONE of):
 * 1. Todo with no due date AND created_at > todoStaleDays (default: 7)
 * 2. Idea note older than ideaStaleDays (default: 14)
 * 3. Item with no tags AND no space older than unorganizedStaleDays (default: 7)
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
  const {
    nowIso,
    todayDate,
    todoStaleDays = 7,
    ideaStaleDays = 14,
    unorganizedStaleDays = 7,
  } = options;

  const results: NeedsAttentionItem[] = [];

  // -------------------------------------------------------------------------
  // Check todos
  // -------------------------------------------------------------------------
  for (const todo of todos) {
    // Base filters: skip archived/completed items and items in Today
    if (isArchived(todo)) continue;
    if (isInToday(todo, todayDate)) continue;

    const ageInDays = getDaysBetween(todo.created_at, nowIso);

    // Rule 1: Todo with no due date, older than threshold
    if (!todo.due_day && !todo.due_date && ageInDays >= todoStaleDays) {
      results.push({
        item: todo,
        reason: 'todo_missing_due_date_stale',
        reasonText: `Task has no due date and is ${ageInDays} days old`,
        ageInDays,
      });
      continue; // Don't add same item twice
    }

    // Rule 3: Unorganized item (no tags AND no space), older than threshold
    if (isUnorganized(todo) && ageInDays >= unorganizedStaleDays) {
      results.push({
        item: todo,
        reason: 'unorganized_stale',
        reasonText: `Task has no tags or space and is ${ageInDays} days old`,
        ageInDays,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Check notes
  // -------------------------------------------------------------------------
  for (const note of notes) {
    // Base filters: skip archived items (notes don't go to Today)
    if (isArchived(note)) continue;

    const ageInDays = getDaysBetween(note.created_at, nowIso);

    // Rule 2: Stale idea
    if (isIdeaNote(note) && ageInDays >= ideaStaleDays) {
      results.push({
        item: note,
        reason: 'idea_stale',
        reasonText: `Idea is ${ageInDays} days old and may need review`,
        ageInDays,
      });
      continue; // Don't add same item twice
    }

    // Rule 3: Unorganized item (no tags AND no space), older than threshold
    if (isUnorganized(note) && ageInDays >= unorganizedStaleDays) {
      results.push({
        item: note,
        reason: 'unorganized_stale',
        reasonText: `Note has no tags or space and is ${ageInDays} days old`,
        ageInDays,
      });
    }
  }

  return results;
}
