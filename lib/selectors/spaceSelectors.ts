/**
 * Space-scoped selector functions (Phase 8+ Spaces v2)
 * Pure functions for querying records within a specific space context
 */

import type { AppRecord, Habit, Todo, Note, ID } from '../types';
import { isToday, parseISO, startOfWeek, endOfWeek } from 'date-fns';

/**
 * Select items that need user review/confirmation
 * Includes:
 * - Items with ai_placed = true (AI-placed items awaiting confirmation)
 * - Items with origin = 'catchall' that haven't been properly classified/moved
 * @param items - All items to consider
 * @returns Array of items needing review
 */
export function selectUnsortedForReview(items: AppRecord[]): AppRecord[] {
  return items.filter((item) => {
    // AI-placed items awaiting confirmation
    if (item.ai_placed === true) return true;

    // Items from catchall that haven't been moved (still in catch-all limbo)
    // These are items that came from catchall but weren't properly classified
    if (item.origin === 'catchall' && item.ai_placed === false && !item.space_id) return true;

    return false;
  });
}

/**
 * Get a preview of scheduled items for a space within a given week
 * @param items - All items to consider
 * @param spaceId - The space to filter by
 * @param weekStart - ISO date string for the start of the week
 * @returns Array of items with due dates or scheduled times in the week
 */
export function getSchedulePreview(
  items: AppRecord[],
  spaceId: ID,
  weekStart: string,
): AppRecord[] {
  const weekStartDate = parseISO(weekStart);
  const weekEndDate = endOfWeek(weekStartDate);

  return items.filter((item) => {
    // Must belong to the space
    if (item.space_id !== spaceId) return false;

    // Todos with due dates
    if (item.type === 'todo' && item.due_date) {
      const dueDate = parseISO(item.due_date);
      return dueDate >= weekStartDate && dueDate <= weekEndDate;
    }

    // Habits with start dates in the week
    if (item.type === 'habit' && item.start_date) {
      const startDate = parseISO(item.start_date);
      return startDate >= weekStartDate && startDate <= weekEndDate;
    }

    return false;
  });
}

/**
 * List habits for a space, optionally limiting results
 * @param items - All items to consider
 * @param spaceId - The space to filter by
 * @param opts - Options for limiting results
 * @returns Array of Habit records
 */
export function listHabitsForSpace(
  items: AppRecord[],
  spaceId: ID,
  opts?: { limit?: number },
): Habit[] {
  const habits = items.filter(
    (item): item is Habit => item.type === 'habit' && item.space_id === spaceId,
  );

  if (opts?.limit) {
    return habits.slice(0, opts.limit);
  }

  return habits;
}

/**
 * List todos for a space, optionally limiting results
 * @param items - All items to consider
 * @param spaceId - The space to filter by
 * @param opts - Options for limiting results
 * @returns Array of Todo records
 */
export function listTodosForSpace(
  items: AppRecord[],
  spaceId: ID,
  opts?: { limit?: number },
): Todo[] {
  const todos = items.filter(
    (item): item is Todo => item.type === 'todo' && item.space_id === spaceId,
  );

  if (opts?.limit) {
    return todos.slice(0, opts.limit);
  }

  return todos;
}

/**
 * List notes for a space, optionally filtering by subtype and limiting results
 * @param items - All items to consider
 * @param spaceId - The space to filter by
 * @param opts - Options for filtering and limiting
 * @returns Array of Note records
 */
export function listNotesForSpace(
  items: AppRecord[],
  spaceId: ID,
  opts?: { limit?: number; subtype?: string },
): Note[] {
  let notes = items.filter(
    (item): item is Note => item.type === 'note' && item.space_id === spaceId,
  );

  if (opts?.subtype) {
    notes = notes.filter((note) => note.subtype === opts.subtype);
  }

  if (opts?.limit) {
    return notes.slice(0, opts.limit);
  }

  return notes;
}

/**
 * Count journal entries for a space within a timeframe
 * @param items - All items to consider
 * @param spaceId - The space to filter by
 * @param opts - Options for timeframe filtering
 * @returns Count of journal entries
 */
export function countJournalForSpace(
  items: AppRecord[],
  spaceId: ID,
  opts?: { timeframe?: 'today' | 'week' | 'all' },
): number {
  const journals = items.filter(
    (item): item is Note =>
      item.type === 'note' && item.subtype === 'journal' && item.space_id === spaceId,
  );

  const timeframe = opts?.timeframe || 'all';

  if (timeframe === 'all') {
    return journals.length;
  }

  const now = new Date();

  if (timeframe === 'today') {
    return journals.filter((journal) => {
      const journalDate = journal.date ? parseISO(journal.date) : parseISO(journal.created_at);
      return isToday(journalDate);
    }).length;
  }

  if (timeframe === 'week') {
    const weekStart = startOfWeek(now);
    return journals.filter((journal) => {
      const journalDate = journal.date ? parseISO(journal.date) : parseISO(journal.created_at);
      return journalDate >= weekStart;
    }).length;
  }

  return 0;
}
