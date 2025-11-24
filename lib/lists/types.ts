/**
 * lib/lists/types.ts
 *
 * Shared type definitions for structured list items across todos, notes, and habits.
 *
 * ListItem represents a single item within a structured list stored in the `list_items` JSONB column.
 */

export interface ListItem {
  id: string; // Stable UUID or generated string identifier
  text: string; // The item text/label
  checked: boolean; // Whether the item is completed/checked
}

/**
 * Helper type for list-enabled entities.
 * Can be mixed into Todo, Note, or Habit interfaces.
 */
export interface HasList {
  has_list: boolean; // Whether this entity contains a structured list
  list_items: ListItem[] | null; // Array of list items (null if no list)
  body_legacy?: string | null; // Original body text before list parsing (for reference/rollback)
}
