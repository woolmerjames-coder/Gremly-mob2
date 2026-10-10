/**
 * Sweep Helpers
 *
 * Predicts when an item will appear in Sweep based on the rules in selectors.ts.
 * Used by All Items table to show "Next Sweep" / date / "-" in Sweep column.
 */

import { getDateService } from '../date';
import type { Todo, Habit, Note } from '../types';
// Which day a todo is on: its planned day, else its deadline (stage 2c, 9 Oct 2026)
import { isTodoOn, isTodoOverdue, plannedDayOf } from '../../workers/shared/todoDay';

export type SweepPrediction =
  | { type: 'next'; label: 'Next Sweep' }
  | { type: 'date'; label: string; date: string } // "Mon", "Dec 25", etc.
  | { type: 'none'; label: '-' };

/**
 * Predict when a todo will appear in Sweep
 */
export function getTodoSweepPrediction(todo: Todo): SweepPrediction {
  const dateService = getDateService();
  const today = dateService.today();

  // Completed or archived = won't appear
  if (todo.completed_at || todo.archived) {
    return { type: 'none', label: '-' };
  }

  // Overdue = next sweep (its planned day, else its deadline, has passed)
  if (isTodoOverdue(todo, today)) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // Due today = next sweep
  if (isTodoOn(todo, today)) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // No day planned = next sweep (a deadline is not a day to do it)
  const planned = plannedDayOf(todo);
  if (!planned) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // Skipped = next sweep
  if (todo.skipped_in_sweep_at) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // Future dated = show the due date
  if (planned > today) {
    const label = dateService.formatForChip(planned);
    return { type: 'date', label, date: planned };
  }

  return { type: 'none', label: '-' };
}

/**
 * Predict when a habit will appear in Sweep
 */
export function getHabitSweepPrediction(habit: Habit): SweepPrediction {
  // Archived = won't appear
  if (habit.archived) {
    return { type: 'none', label: '-' };
  }

  // Unconfirmed habits appear in Sweep decision cards
  if (habit.start_date_confirmed !== true) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // Confirmed habits only appear in check-in section (not decision cards)
  // So they don't show "Next Sweep" in the Hub table
  return { type: 'none', label: '-' };
}

/**
 * Predict when a note/log will appear in Sweep
 */
export function getNoteSweepPrediction(note: Note): SweepPrediction {
  const dateService = getDateService();
  const today = dateService.today();

  // Archived = won't appear
  if (note.archived) {
    return { type: 'none', label: '-' };
  }

  // Journals don't appear in sweep
  if (note.subtype === 'journal') {
    return { type: 'none', label: '-' };
  }

  // Skipped = next sweep
  if (note.skipped_in_sweep_at) {
    return { type: 'next', label: 'Next Sweep' };
  }

  // Recent idea (< 7 days) = next sweep
  if (note.subtype === 'idea') {
    const createdDate = dateService.toLocalDate(new Date(note.created_at));
    const daysSinceCreated = dateService.daysBetween(createdDate, today);
    if (daysSinceCreated <= 7) {
      return { type: 'next', label: 'Next Sweep' };
    }
    return { type: 'none', label: '-' };
  }

  // Today's catchall/list/reference = next sweep
  const createdDate = dateService.toLocalDate(new Date(note.created_at));
  if (createdDate === today) {
    return { type: 'next', label: 'Next Sweep' };
  }

  return { type: 'none', label: '-' };
}

/**
 * Get sweep prediction for any item type
 */
export function getSweepPrediction(item: Todo | Habit | Note): SweepPrediction {
  if (item.type === 'todo') {
    return getTodoSweepPrediction(item as Todo);
  }
  if (item.type === 'habit') {
    return getHabitSweepPrediction(item as Habit);
  }
  if (item.type === 'note') {
    return getNoteSweepPrediction(item as Note);
  }
  return { type: 'none', label: '-' };
}
