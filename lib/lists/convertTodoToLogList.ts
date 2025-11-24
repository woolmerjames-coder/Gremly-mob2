/**
 * lib/lists/convertTodoToLogList.ts
 *
 * Phase 3 Lists: Convert a Todo into a reference list Note/Log.
 * Opposite direction of convertLogListToTodo.
 */

import type { IRepo, CreateRecordInput } from '../repo/IRepo';
import type { Note, Todo } from '../types';
import { listItemsToText } from './helpers';
import { randomUUID } from 'crypto';

export interface ConvertTodoToLogListOptions {
  preserveCheckedState?: boolean; // If true, keep checked items; false resets all to unchecked
}

/**
 * Convert a Todo into a reference list Note.
 *
 * Use cases:
 * - User completes a todo checklist and wants to save as a reusable template
 * - User wants to convert an actionable todo into a reference list
 * - Declutter today's todos by moving checklists back to notes
 *
 * @param repo - Repository interface
 * @param todoId - ID of the todo to convert
 * @param options - Conversion options
 * @returns Object with created note and archived todo
 *
 * @throws Error if todo not found
 *
 * @example
 * ```ts
 * const { note, archivedTodo } = await convertTodoToLogList(repo, 'todo-123', {
 *   preserveCheckedState: true // Keep completion state
 * });
 * console.log(note.subtype); // 'reference'
 * console.log(note.has_list); // true
 * ```
 */
export async function convertTodoToLogList(
  repo: IRepo,
  todoId: string,
  options: ConvertTodoToLogListOptions = {},
): Promise<{ note: Note; archivedTodo: Todo }> {
  const { preserveCheckedState = true } = options;

  // Fetch the todo
  const entity = await repo.getById(todoId);
  if (!entity || entity.type !== 'todo') {
    throw new Error(`Todo ${todoId} not found`);
  }

  const todo = entity as Todo;

  // Prepare list items
  // If todo doesn't have structured list, we'll create one from the title/body
  let noteListItems;
  if (todo.has_list && todo.list_items && todo.list_items.length > 0) {
    noteListItems = preserveCheckedState
      ? todo.list_items
      : todo.list_items.map((item) => ({ ...item, checked: false }));
  } else {
    // Todo doesn't have a list - create one from the title
    noteListItems = [
      {
        id: randomUUID(),
        text: todo.name,
        checked: false,
      },
    ];
  }

  // Generate body text
  const noteBody = todo.body || listItemsToText(noteListItems, 'checkbox');

  // Create note
  const noteInput: CreateRecordInput = {
    type: 'note',
    title: todo.name,
    body: noteBody,
    subtype: 'reference', // Lists are reference material, not journal entries
    space_id: todo.space_id || null,
    ai_placed: todo.ai_placed || false,
    origin: todo.origin || undefined,
    canonicalType: 'log',
    labels: ['log'],
    tags: todo.tags || [],
    tags_meta: todo.tags_meta || { sticky: [], tombstones: [] },
    views: {
      ...todo.views,
      minddrop_stage: todo.views?.minddrop_stage,
      minddrop_prefilled_v1: todo.views?.minddrop_prefilled_v1,
    },
    dropId: todo.drop_id || null,
    has_list: true,
    list_items: noteListItems,
    body_legacy: todo.body_legacy || noteBody,
  };

  const createdNote = (await repo.create(noteInput)) as Note;

  // Archive the original todo
  const archivedTodo = (await repo.update({
    id: todo.id,
    patch: {
      archived: true,
      why_string: `Converted to note ${createdNote.id}`,
    },
  })) as Todo;

  console.log('[convertTodoToLogList] Converted todo → note', {
    todoId: todo.id,
    noteId: createdNote.id,
    noteTitle: createdNote.title,
    itemCount: noteListItems.length,
  });

  return { note: createdNote, archivedTodo };
}
