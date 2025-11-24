/**
 * Test helper to add default list support fields to mock records.
 * Phase 7 Lists: All entities now have has_list, list_items, body_legacy fields.
 */

import type { Habit, Todo, Note, ListItem } from '../../lib/types';

/**
 * Add default list fields to a partial Habit object
 */
export function withListDefaults<T extends Partial<Habit>>(
  habit: T,
): T & { has_list: boolean; list_items: ListItem[] | null } {
  return {
    ...habit,
    has_list: habit.has_list ?? false,
    list_items: habit.list_items ?? null,
  };
}

/**
 * Add default list fields to a partial Todo object
 */
export function todoWithListDefaults<T extends Partial<Todo>>(
  todo: T,
): T & { has_list: boolean; list_items: ListItem[] | null } {
  return {
    ...todo,
    has_list: todo.has_list ?? false,
    list_items: todo.list_items ?? null,
  };
}

/**
 * Add default list fields to a partial Note object
 */
export function noteWithListDefaults<T extends Partial<Note>>(
  note: T,
): T & { has_list: boolean; list_items: ListItem[] | null } {
  return {
    ...note,
    has_list: note.has_list ?? false,
    list_items: note.list_items ?? null,
  };
}

/**
 * Generic helper that works for any record type
 */
export function recordWithListDefaults<T extends Partial<Habit | Todo | Note>>(
  record: T,
): T & { has_list: boolean; list_items: ListItem[] | null } {
  return {
    ...record,
    has_list: (record as any).has_list ?? false,
    list_items: (record as any).list_items ?? null,
  };
}
