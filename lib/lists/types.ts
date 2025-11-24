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

/**
 * ListTemplate represents a reusable list pattern saved by a user.
 * Can be applied to todos, notes, or habits.
 * Stored in the `list_templates` table (Phase 4).
 */
export interface ListTemplate {
  id: string; // UUID primary key
  owner_id: string; // User who owns this template
  name: string; // Human-readable name (e.g., "Grocery List", "Beach Packing")
  scope: 'any' | 'todo' | 'habit' | 'note'; // Allowed usage scope
  items: ListItem[]; // List items (same structure as list_items on entities)
  source_entity_type: 'todo' | 'note' | 'habit' | null; // Optional: Original entity type
  source_entity_id: string | null; // Optional: Original entity ID
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}
