/**
 * Types for the Make Actionable feature - list extraction and checklist management
 */

/**
 * A single item in a checklist, stored in notes.list_items JSONB column
 */
export interface ListItem {
  /** Unique identifier (nanoid) for React keys and future reordering */
  id: string;
  /** The item text with markdown formatting stripped */
  text: string;
  /** Whether this item has been checked off */
  checked: boolean;
}

/**
 * Extended list item with actionability heuristic, used during extraction
 */
export interface ExtractedListItem extends ListItem {
  /**
   * Heuristic flag: true if this looks like a task, false if it's advice/info
   * Used to pre-select items in the "explode to todos" modal
   */
  isActionable: boolean;
}

/**
 * Note entity with list-related fields for type safety
 */
export interface NoteWithList {
  id: string;
  title: string;
  body: string;
  list_items: ListItem[] | null;
  has_list: boolean;
  is_favorite: boolean;
  space_id: string;
}
