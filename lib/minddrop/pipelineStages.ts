/**
 * Mind Drop Pipeline - Two-Stage Architecture (Phase 4B)
 *
 * LIFECYCLE (Deterministic State Transitions):
 * ============================================
 *
 * 1. UNSORTED (Initial State)
 *    - User submits text → saveToUnsortedTray creates provisional note
 *    - views.minddrop_stage = 'pending'
 *    - views.ai_pending = true
 *    - views.ai_failed = false
 *
 * 2. STAGE A: CLASSIFICATION (Intent Detection + Entity Creation)
 *    - Cortex decides intent → creates canonical entity (todo/habit/note)
 *    - On SUCCESS:
 *      - views.minddrop_stage = 'classified'
 *      - views.ai_pending = true (still waiting for prefill)
 *      - views.ai_failed = false
 *    - On FAILURE:
 *      - views.ai_pending = false
 *      - views.ai_failed = true
 *      - minddrop_stage stays 'pending'
 *
 * 3. STAGE B: PREFILL (AI Enrichment)
 *    - backgroundPrefill enhances title (tags come from Stage A only)
 *    - On SUCCESS:
 *      - views.minddrop_stage = 'prefilled'
 *      - views.ai_pending = false
 *      - views.ai_failed = false
 *      - views.minddrop_prefilled_v1 = true
 *    - On NETWORK ERROR:
 *      - views.ai_pending = true (keep for retry)
 *      - minddrop_stage stays 'classified' (don't advance)
 *      - views.ai_error = error message
 *    - On OTHER ERROR:
 *      - views.ai_pending = false
 *      - views.ai_failed = true
 *      - minddrop_stage stays 'classified'
 *
 * CRITICAL RULES:
 * ===============
 * - ONLY Stage A sets minddrop_stage = 'classified'
 * - ONLY Stage B sets minddrop_stage = 'prefilled'
 * - ONLY Stage A and Stage B modify ai_pending and minddrop_stage
 * - NO other code should write to these fields
 * - Tags are ONLY set in Stage A via buildCanonicalFromMindDrop
 * - Stage B enriches title ONLY, never modifies tags or subtype
 */

import type { IRepo } from '../repo/IRepo';
import type { Habit, Todo, Note, NoteSubtype } from '../types';
import type { CortexResponse, CortexContext } from '../cortex/cortexDecide';
import { convertUnsortedToTodo } from '../conversion';
import { convertUnsortedToHabit } from '../conversion';
import { backgroundPrefill } from './backgroundPrefill';
import { buildCanonicalFromMindDrop } from './buildCanonicalFromMindDrop';
import { appendItemToList } from '../lists/appendItemToList';
import { convertLogListToTodo } from '../lists/convertLogListToTodo';

export interface StageAParams {
  repo: IRepo;
  text: string;
  cleanedText: string;
  decision: CortexResponse;
  dropId: string;
  sourceMessageId?: string | null;
  parsedDue?: string | null;
  unsortedNoteId?: string | null;
}

export interface StageAResult {
  entities: {
    todos: string[];
    habits: string[];
    notes: string[];
  };
  entityDetails: Array<{
    kind: 'todo' | 'habit' | 'note';
    noteSubtype?: string; // Changed from NoteSubtype to string to accept 'everything_else'
  }>;
  mode: 'auto' | 'ask' | 'ambiguous' | 'keep' | 'reply'; // Include all CortexResponse modes
  confidence: number;
}

export interface StageBParams {
  repo: IRepo;
  entityIds: {
    todos: string[];
    habits: string[];
    notes: string[];
  };
  rawText: string;
}

export interface StageBResult {
  enrichedCount: number;
  failures: string[];
}

/**
 * Stage A: Classification
 *
 * Intent detection + canonical resolution → entity creation
 * Sets views.minddrop_stage = 'classified'
 *
 * On success:
 * - views.minddrop_stage = 'classified'
 * - views.ai_pending = true (still waiting for prefill)
 * - views.ai_failed = false
 *
 * On failure:
 * - views.ai_pending = false
 * - views.ai_failed = true
 * - minddrop_stage stays 'pending'
 */
export async function runMindDropStageAClassification(params: StageAParams): Promise<StageAResult> {
  const { repo, text, cleanedText, decision, dropId, sourceMessageId, parsedDue, unsortedNoteId } =
    params;

  // Telemetry: Stage A start
  console.debug('[MindDrop.StageA.Start]', {
    dropId,
    mode: decision.mode,
    actionCount: decision.actions?.length ?? 0,
  });

  const createdIds = {
    todos: [] as string[],
    habits: [] as string[],
    notes: [] as string[],
  };
  const entityDetails: StageAResult['entityDetails'] = [];

  // Guard: Must have unsorted note to convert
  if (!unsortedNoteId) {
    console.warn('[StageA] No unsorted note ID provided, skipping classification');
    return {
      entities: createdIds,
      entityDetails,
      mode: decision.mode,
      confidence: decision.confidence ?? 0,
    };
  }

  const actions = Array.isArray(decision.actions) ? decision.actions : [];
  if (actions.length === 0) {
    console.warn('[StageA] No actions in decision, skipping classification');
    return {
      entities: createdIds,
      entityDetails,
      mode: decision.mode,
      confidence: decision.confidence ?? 0,
    };
  }

  // Phase 3 Lists: Handle actionable list intent BEFORE creating entities
  // "time to do my shopping list" → find list, convert to todo
  if (decision.context?.actionableListName) {
    const listName = decision.context.actionableListName;
    console.log('[StageA] Actionable list intent detected', {
      listName,
      dropId,
    });

    try {
      // Find existing list by name
      const allRecords = await repo.getAll();
      const listNotes = allRecords.filter(
        (r) =>
          r.type === 'note' &&
          r.has_list &&
          !r.archived &&
          r.title &&
          r.title.toLowerCase().includes(listName.toLowerCase()),
      );

      if (listNotes.length > 0) {
        const targetList = listNotes[0];
        console.log('[StageA] Found matching list for actionable intent', {
          listId: targetList.id,
          listTitle: targetList.title,
        });

        // Convert list to todo
        const { todo } = await convertLogListToTodo(repo, targetList.id, {
          preserveCheckedState: false, // Reset for fresh todo
        });

        // Archive the unsorted note
        if (unsortedNoteId) {
          const unsortedNote = await repo.getById(unsortedNoteId);
          if (unsortedNote && !(unsortedNote as any).archived) {
            await repo.update({
              id: unsortedNoteId,
              patch: {
                archived: true,
              },
            });
          }
        }

        createdIds.todos.push(todo.id);
        entityDetails.push({ kind: 'todo' });

        console.log('[StageA] Converted actionable list to todo', {
          listId: targetList.id,
          todoId: todo.id,
          dropId,
        });

        return {
          entities: createdIds,
          entityDetails,
          mode: decision.mode,
          confidence: decision.confidence ?? 0,
        };
      } else {
        console.warn('[StageA] No matching list found for actionable intent', {
          listName,
        });
        // Fall through to normal entity creation
      }
    } catch (error) {
      console.error('[StageA] Failed to convert actionable list', error);
      // Fall through to normal entity creation
    }
  }

  const firstAction = actions[0];

  try {
    // Convert unsorted note to target type based on decision
    if (firstAction.type === 'create.todo') {
      // Check if a canonical todo already exists for this dropId (idempotency)
      let createdTodo;
      if (dropId) {
        const existingTodo = await repo.findTodoByDropId(dropId);
        if (existingTodo) {
          // Telemetry: Duplicate prevention triggered for todo
          console.debug('[MindDrop.Idempotency.TodoExists]', {
            id: existingTodo.id,
            dropId,
          });
          console.log('[StageA] Todo already exists for dropId, using existing', {
            id: existingTodo.id,
            dropId,
          });
          createdTodo = existingTodo;
          createdIds.todos.push(existingTodo.id);
          entityDetails.push({ kind: 'todo' });

          // Update stage to classified (in case retry happened during Stage A)
          await repo.update({
            id: existingTodo.id,
            patch: {
              views: {
                ...(existingTodo.views ?? {}),
                minddrop_stage: 'classified',
                ai_pending: true,
                ai_failed: false,
              },
            },
          });

          // Archive the unsorted note if it's not already archived
          if (unsortedNoteId) {
            const unsortedNote = await repo.getById(unsortedNoteId);
            if (unsortedNote && !(unsortedNote as any).archived) {
              await repo.update({
                id: unsortedNoteId,
                patch: {
                  archived: true,
                },
              });
            }
          }

          // Don't create a new todo - use existing
          return {
            entities: createdIds,
            entityDetails,
            mode: decision.mode,
            confidence: decision.confidence ?? 0,
          };
        }
      }

      // No existing todo found - create new one
      const due = firstAction.payload.due ?? parsedDue ?? null;
      const result = await convertUnsortedToTodo(repo, unsortedNoteId, {
        due,
      });
      createdTodo = result.todo;

      // Mark classification complete (success transition)
      await repo.update({
        id: createdTodo.id,
        patch: {
          views: {
            ...(createdTodo.views ?? {}),
            minddrop_stage: 'classified',
            ai_pending: true, // Still waiting for prefill
            ai_failed: false,
          },
        },
      });

      createdIds.todos.push(createdTodo.id);
      entityDetails.push({ kind: 'todo' });

      console.log('[StageA] Created todo', {
        id: createdTodo.id,
        dropId,
        stage: 'classified',
      });
    } else if (firstAction.type === 'create.habit') {
      // Check if a canonical habit already exists for this dropId (idempotency)
      let createdHabit;
      if (dropId) {
        const existingHabit = await repo.findHabitByDropId(dropId);
        if (existingHabit) {
          // Telemetry: Duplicate prevention triggered for habit
          console.debug('[MindDrop.Idempotency.HabitExists]', {
            id: existingHabit.id,
            dropId,
          });
          console.log('[StageA] Habit already exists for dropId, using existing', {
            id: existingHabit.id,
            dropId,
          });
          createdHabit = existingHabit;
          createdIds.habits.push(existingHabit.id);
          entityDetails.push({ kind: 'habit' });

          // Update stage to classified (in case retry happened during Stage A)
          await repo.update({
            id: existingHabit.id,
            patch: {
              views: {
                ...(existingHabit.views ?? {}),
                minddrop_stage: 'classified',
                ai_pending: true,
                ai_failed: false,
              },
            },
          });

          // Archive the unsorted note if it's not already archived
          if (unsortedNoteId) {
            const unsortedNote = await repo.getById(unsortedNoteId);
            if (unsortedNote && !(unsortedNote as any).archived) {
              await repo.update({
                id: unsortedNoteId,
                patch: {
                  archived: true,
                },
              });
            }
          }

          // Don't create a new habit - use existing
          return {
            entities: createdIds,
            entityDetails,
            mode: decision.mode,
            confidence: decision.confidence ?? 0,
          };
        }
      }

      // No existing habit found - create new one
      const freqRaw = firstAction.payload.freq;
      const frequency: string = freqRaw === 'weekly' ? 'weekly' : 'daily';
      const result = await convertUnsortedToHabit(repo, unsortedNoteId, {
        frequency,
      });
      createdHabit = result.habit;

      // Mark classification complete (success transition)
      await repo.update({
        id: createdHabit.id,
        patch: {
          views: {
            ...(createdHabit.views ?? {}),
            minddrop_stage: 'classified',
            ai_pending: true, // Still waiting for prefill
            ai_failed: false,
          },
        },
      });

      createdIds.habits.push(createdHabit.id);
      entityDetails.push({ kind: 'habit' });

      console.log('[StageA] Created habit', {
        id: createdHabit.id,
        dropId,
        stage: 'classified',
      });
    } else if (firstAction.type === 'add.to.list') {
      // Handle add.to.list action - append to existing list or create new one
      console.log('[StageA] Processing add.to.list action', {
        listKey: firstAction.payload.listKey,
        item: firstAction.payload.item,
        dropId,
      });

      // Check if a note with this dropId already exists (idempotency)
      if (dropId) {
        const existingNote = await repo.findNoteByDropId(dropId);
        if (existingNote && existingNote.id !== unsortedNoteId) {
          // A note already exists for this dropId - reuse it
          console.debug('[MindDrop.Idempotency.ListExists]', {
            id: existingNote.id,
            dropId,
            unsortedNoteId,
          });
          console.log('[StageA] List already exists for dropId, using existing', {
            id: existingNote.id,
            dropId,
          });

          // Update stage to classified
          await repo.update({
            id: existingNote.id,
            patch: {
              views: {
                ...(existingNote.views ?? {}),
                minddrop_stage: 'classified',
                ai_pending: true,
                ai_failed: false,
              },
            },
          });

          // Archive the unsorted note if it's different
          if (unsortedNoteId && unsortedNoteId !== existingNote.id) {
            const unsortedNote = await repo.getById(unsortedNoteId);
            if (unsortedNote && !(unsortedNote as any).archived) {
              await repo.update({
                id: unsortedNoteId,
                patch: {
                  archived: true,
                },
              });
            }
          }

          createdIds.notes.push(existingNote.id);
          entityDetails.push({
            kind: 'note',
            noteSubtype: existingNote.subtype ?? undefined,
          });

          return {
            entities: createdIds,
            entityDetails,
            mode: decision.mode,
            confidence: decision.confidence ?? 0,
          };
        }
      }

      // Convert listKey to listTitle
      const listKeyToTitle: Record<string, string> = {
        shopping: 'Shopping List',
        reading: 'Reading List',
        packing: 'Packing List',
        custom: 'List',
      };
      const listTitle = listKeyToTitle[firstAction.payload.listKey] || 'List';

      // Append item to list (or create new list if not found)
      const updatedOrCreatedList = await appendItemToList(repo, {
        listTitle,
        listTags: [firstAction.payload.listKey],
        itemText: firstAction.payload.item,
        createIfMissing: true,
        defaultSubtype: 'reference',
      });

      // Set dropId on the list if it was just created or doesn't have one
      if (
        dropId &&
        (!(updatedOrCreatedList as any).drop_id || updatedOrCreatedList.id === unsortedNoteId)
      ) {
        await repo.update({
          id: updatedOrCreatedList.id,
          patch: {
            dropId,
            views: {
              ...(updatedOrCreatedList.views ?? {}),
              minddrop_stage: 'classified',
              ai_pending: true,
              ai_failed: false,
            },
          },
        });
      } else {
        // Just update the stage markers
        await repo.update({
          id: updatedOrCreatedList.id,
          patch: {
            views: {
              ...(updatedOrCreatedList.views ?? {}),
              minddrop_stage: 'classified',
              ai_pending: true,
              ai_failed: false,
            },
          },
        });
      }

      // Archive the unsorted note if it's different from the updated list
      if (unsortedNoteId && unsortedNoteId !== updatedOrCreatedList.id) {
        const unsortedNote = await repo.getById(unsortedNoteId);
        if (unsortedNote && !(unsortedNote as any).archived) {
          await repo.update({
            id: unsortedNoteId,
            patch: {
              archived: true,
            },
          });
        }
      }

      createdIds.notes.push(updatedOrCreatedList.id);
      entityDetails.push({
        kind: 'note',
        noteSubtype: updatedOrCreatedList.subtype ?? undefined,
      });

      console.log('[StageA] Added item to list', {
        id: updatedOrCreatedList.id,
        title: updatedOrCreatedList.title,
        dropId,
        stage: 'classified',
      });
    } else if (firstAction.type === 'create.note') {
      // For notes: Stage A applies canonical mapping and marks as classified
      // Check if a note with this dropId already exists (idempotency)
      const targetNote: Note | null = null;

      if (dropId) {
        const existingNote = await repo.findNoteByDropId(dropId);
        if (existingNote && existingNote.id !== unsortedNoteId) {
          // A different note already exists for this dropId - telemetry and reuse
          console.debug('[MindDrop.Idempotency.NoteExists]', {
            id: existingNote.id,
            dropId,
            unsortedNoteId,
          });
          console.log('[StageA] Note already exists for dropId, using existing', {
            id: existingNote.id,
            dropId,
          });

          // Update stage to classified (in case retry happened during Stage A)
          await repo.update({
            id: existingNote.id,
            patch: {
              views: {
                ...(existingNote.views ?? {}),
                minddrop_stage: 'classified',
                ai_pending: true,
                ai_failed: false,
              },
            },
          });

          // Archive the unsorted note if it's different and not already archived
          if (unsortedNoteId && unsortedNoteId !== existingNote.id) {
            const unsortedNote = await repo.getById(unsortedNoteId);
            if (unsortedNote && !(unsortedNote as any).archived) {
              await repo.update({
                id: unsortedNoteId,
                patch: {
                  archived: true,
                },
              });
            }
          }

          createdIds.notes.push(existingNote.id);
          entityDetails.push({
            kind: 'note',
            noteSubtype: existingNote.subtype ?? undefined,
          });

          // Don't process the note again - use existing
          return {
            entities: createdIds,
            entityDetails,
            mode: decision.mode,
            confidence: decision.confidence ?? 0,
          };
        }
      }

      // No existing note found (or unsorted note is the same entity) - process normally
      const existingNote = await repo.getById(unsortedNoteId);

      if (existingNote && existingNote.type === 'note') {
        const note = existingNote as Note;
        const rawText = note.body ?? note.title ?? '';

        // Use buildCanonicalFromMindDrop to get canonical fields
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText,
          aiTitle: undefined, // Stage A doesn't use AI title yet
          aiTags: note.tags && note.tags.length > 0 ? note.tags : undefined, // Reuse existing tags if available
          existing: note, // Pass existing note to preserve tags_meta
        });

        // Update note with canonical fields
        await repo.update({
          id: unsortedNoteId,
          patch: {
            title: canonical.title,
            body: canonical.body,
            tags: canonical.tags,
            tags_meta: canonical.tags_meta,
            subtype: canonical.subtype as NoteSubtype | null,
            has_list: canonical.has_list,
            list_items: canonical.list_items,
            views: {
              ...(note.views ?? {}),
              minddrop_stage: 'classified',
              ai_pending: true, // Still waiting for prefill
              ai_failed: false,
            },
          } as any,
        });

        createdIds.notes.push(unsortedNoteId);
        entityDetails.push({
          kind: 'note',
          noteSubtype: canonical.subtype ?? undefined,
        });

        console.log('[StageA] Marked note as classified with canonical fields', {
          id: unsortedNoteId,
          dropId,
          stage: 'classified',
          subtype: canonical.subtype,
        });
      }
    }
  } catch (err) {
    // Telemetry: Stage A failed
    console.debug('[MindDrop.StageA.Failed]', {
      dropId,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('[StageA] Classification failed', err);

    // Mark failure on unsorted note
    if (unsortedNoteId) {
      try {
        const failedNote = await repo.getById(unsortedNoteId);
        if (failedNote) {
          await repo.update({
            id: unsortedNoteId,
            patch: {
              views: {
                ...(failedNote.views ?? {}),
                ai_pending: false,
                ai_failed: true,
                // minddrop_stage stays 'pending'
              },
            },
          });
        }
      } catch (updateErr) {
        console.error('[StageA] Failed to mark failure state', updateErr);
      }
    }

    throw err;
  }

  // Telemetry: Stage A complete
  console.debug('[MindDrop.StageA.Complete]', {
    dropId,
    todosCreated: createdIds.todos.length,
    habitsCreated: createdIds.habits.length,
    notesCreated: createdIds.notes.length,
  });

  return {
    entities: createdIds,
    entityDetails,
    mode: decision.mode,
    confidence: decision.confidence ?? 0,
  };
}

/**
 * Stage B: Prefill
 *
 * AI enhancement (title, tags, subtypes) for classified entities
 *
 * On success:
 * - views.minddrop_stage = 'prefilled'
 * - views.minddrop_prefilled_v1 = true
 * - views.ai_pending = false
 * - views.ai_failed = false
 *
 * On failure:
 * - views.ai_pending = false
 * - views.ai_failed = true
 * - minddrop_stage stays 'classified'
 */
export async function runMindDropStageBPrefill(params: StageBParams): Promise<StageBResult> {
  const { repo, entityIds, rawText } = params;

  // Telemetry: Stage B start
  console.debug('[MindDrop.StageB.Start]', {
    todoCount: entityIds.todos.length,
    habitCount: entityIds.habits.length,
    noteCount: entityIds.notes.length,
  });

  let enrichedCount = 0;
  const failures: string[] = [];

  // Enrich todos
  for (const todoId of entityIds.todos) {
    try {
      const todo = await repo.getById(todoId);
      if (todo && todo.type === 'todo') {
        await backgroundPrefill(todo, rawText);
        enrichedCount++;
        console.log('[StageB] Enriched todo', { id: todoId });
      }
    } catch (err) {
      console.error('[StageB] Failed to enrich todo', { id: todoId, error: err });
      failures.push(todoId);

      // Mark failure on entity
      try {
        const failedTodo = await repo.getById(todoId);
        if (failedTodo) {
          await repo.update({
            id: todoId,
            patch: {
              views: {
                ...(failedTodo.views ?? {}),
                ai_pending: false,
                ai_failed: true,
                // minddrop_stage stays 'classified'
              },
            },
          });
        }
      } catch (updateErr) {
        console.error('[StageB] Failed to mark failure state for todo', updateErr);
      }
    }
  }

  // Enrich habits
  for (const habitId of entityIds.habits) {
    try {
      const habit = await repo.getById(habitId);
      if (habit && habit.type === 'habit') {
        await backgroundPrefill(habit, rawText);
        enrichedCount++;
        console.log('[StageB] Enriched habit', { id: habitId });
      }
    } catch (err) {
      console.error('[StageB] Failed to enrich habit', { id: habitId, error: err });
      failures.push(habitId);

      // Mark failure on entity
      try {
        const failedHabit = await repo.getById(habitId);
        if (failedHabit) {
          await repo.update({
            id: habitId,
            patch: {
              views: {
                ...(failedHabit.views ?? {}),
                ai_pending: false,
                ai_failed: true,
                // minddrop_stage stays 'classified'
              },
            },
          });
        }
      } catch (updateErr) {
        console.error('[StageB] Failed to mark failure state for habit', updateErr);
      }
    }
  }

  // Enrich notes
  for (const noteId of entityIds.notes) {
    try {
      const note = await repo.getById(noteId);
      if (note && note.type === 'note') {
        await backgroundPrefill(note, rawText);
        enrichedCount++;
        console.log('[StageB] Enriched note', { id: noteId });
      }
    } catch (err) {
      console.error('[StageB] Failed to enrich note', { id: noteId, error: err });
      failures.push(noteId);

      // Mark failure on entity
      try {
        const failedNote = await repo.getById(noteId);
        if (failedNote) {
          await repo.update({
            id: noteId,
            patch: {
              views: {
                ...(failedNote.views ?? {}),
                ai_pending: false,
                ai_failed: true,
                // minddrop_stage stays 'classified'
              },
            },
          });
        }
      } catch (updateErr) {
        console.error('[StageB] Failed to mark failure state for note', updateErr);
      }
    }
  }

  // Telemetry: Stage B complete
  console.debug('[MindDrop.StageB.Complete]', {
    enrichedCount,
    failureCount: failures.length,
    failures: failures.length > 0 ? failures : undefined,
  });

  return {
    enrichedCount,
    failures,
  };
}
