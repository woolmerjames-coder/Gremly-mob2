/**
 * lib/lists/convertLogListToTodo.ts
 *
 * Phase 3 Lists: Convert a list-based Note/Log into an actionable Todo.
 * Preserves list_items, generates smart title, maintains drop_id for Mind Drop traceability.
 */

import type { IRepo, CreateRecordInput } from '../repo/IRepo';
import type { Note, Todo } from '../types';
import { listItemsToText } from './helpers';

export interface ConvertLogListToTodoOptions {
  preserveCheckedState?: boolean; // If true, keep checked items; false resets all to unchecked
}

/**
 * Generate intelligent todo title from list note.
 * Prefers note title, falls back to first list item, or generic fallback.
 *
 * @example
 * "Shopping list" → "Buy groceries"
 * "Pack for trip" → "Finish packing"
 * "Things to remember" → "Complete tasks"
 */
function generateTodoTitle(note: Note): string {
  // Use existing title if meaningful
  if (note.title && note.title.trim()) {
    const title = note.title.trim();

    // Convert common list titles to action-oriented todo titles
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('shopping')) return 'Buy groceries';
    if (lowerTitle.includes('groceries') || lowerTitle.includes('grocery')) return 'Buy groceries';
    if (lowerTitle.includes('pack')) return 'Finish packing';
    if (lowerTitle.includes('to-do') || lowerTitle.includes('todo')) return 'Complete tasks';
    if (lowerTitle.includes('chores')) return 'Do chores';
    if (lowerTitle.includes('errands')) return 'Run errands';

    // Use the title as-is if it's already action-oriented
    return title;
  }

  // Fallback to first list item if available
  if (note.list_items && note.list_items.length > 0) {
    return note.list_items[0].text;
  }

  // Generic fallback
  return 'Complete checklist';
}

/**
 * Convert a list-based Note (has_list=true) into a Todo.
 *
 * Use cases:
 * - User says "time to do my grocery list" → finds list note, converts to todo
 * - User manually converts a reference list into an actionable todo
 * - Smart action detection in Mind Drop pipeline
 *
 * @param repo - Repository interface
 * @param noteId - ID of the note to convert
 * @param options - Conversion options
 * @returns Object with created todo and archived note
 *
 * @throws Error if note not found or doesn't have a list
 *
 * @example
 * ```ts
 * const { todo, archivedNote } = await convertLogListToTodo(repo, 'note-123', {
 *   preserveCheckedState: false // Reset all items to unchecked
 * });
 * console.log(todo.name); // "Buy groceries"
 * console.log(todo.has_list); // true
 * console.log(todo.list_items.length); // 5
 * ```
 */
export async function convertLogListToTodo(
  repo: IRepo,
  noteId: string,
  options: ConvertLogListToTodoOptions = {},
): Promise<{ todo: Todo; archivedNote: Note }> {
  const { preserveCheckedState = false } = options;

  // Fetch the note
  const entity = await repo.getById(noteId);
  if (!entity || entity.type !== 'note') {
    throw new Error(`Note ${noteId} not found`);
  }

  const note = entity as Note;

  // Validate it has a list
  if (!note.has_list || !note.list_items || note.list_items.length === 0) {
    throw new Error(`Note ${noteId} does not have a list to convert`);
  }

  // Prepare list items (optionally reset checked state)
  const todoListItems = preserveCheckedState
    ? note.list_items
    : note.list_items.map((item) => ({ ...item, checked: false }));

  // Generate title
  const todoTitle = generateTodoTitle(note);

  // Create todo
  const todoInput: CreateRecordInput = {
    type: 'todo',
    name: todoTitle,
    body: note.body || listItemsToText(todoListItems, 'checkbox'),
    space_id: note.space_id || null,
    ai_placed: note.ai_placed || false,
    origin: note.origin || undefined,
    canonicalType: 'todo',
    labels: ['todo'],
    tags: note.tags || [],
    tags_meta: note.tags_meta || { sticky: [], tombstones: [] },
    views: {
      ...note.views,
      // Preserve Mind Drop stage if present
      minddrop_stage: note.views?.minddrop_stage,
      minddrop_prefilled_v1: note.views?.minddrop_prefilled_v1,
    },
    dropId: note.drop_id || null, // Preserve drop_id for traceability
    has_list: true,
    list_items: todoListItems,
    body_legacy: note.body_legacy || note.body || null,
  };

  const createdTodo = (await repo.create(todoInput)) as Todo;

  // Archive the original note
  const archivedNote = (await repo.update({
    id: note.id,
    patch: {
      archived: true,
      why_string: `Converted to todo ${createdTodo.id}`,
    },
  })) as Note;

  console.log('[convertLogListToTodo] Converted note → todo', {
    noteId: note.id,
    todoId: createdTodo.id,
    todoTitle,
    itemCount: todoListItems.length,
  });

  return { todo: createdTodo, archivedNote };
}
