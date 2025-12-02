/**
 * Mind Drop Pipeline - Two-Stage Architecture (Phase 4B)
 *
 * Stage A: Classification
 * - Intent detection + canonical resolution
 * - Create/update entities (todo/habit/log)
 * - Set views.minddrop_stage = 'classified'
 *
 * Stage B: Prefill
 * - AI enhancement (title, tags, subtypes)
 * - Update entity with enriched data
 * - Set views.minddrop_stage = 'prefilled'
 * - Set views.minddrop_prefilled_v1 = true
 */

import type { IRepo } from '../repo/IRepo';
import type { Habit, Todo, Note, NoteSubtype } from '../types';
import type { CortexResponse, CortexContext } from '../cortex/cortexDecide';
import { convertUnsortedToTodo } from '../conversion';
import { convertUnsortedToHabit } from '../conversion';
import { backgroundPrefill } from './backgroundPrefill';
import { persistedToCanonical } from '../cortex/canonicalMap';
import { buildHabitFields } from '../cortex/textNormalization';

// ─────────────────────────────────────────────────────────────────────────────
// Log Shape Mapping - Maps Cortex log intents to proper note shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps raw log subtype from Cortex to a valid NoteSubtype.
 * Ensures notes classified as "log" have proper shape, not "catchall".
 */
function mapLogSubtypeToNoteSubtype(rawSubtype: string | undefined | null): NoteSubtype {
  switch (rawSubtype) {
    case 'journal':
      return 'journal';
    case 'list':
      return 'list';
    case 'idea':
      return 'idea';
    case 'reference':
      return 'reference';
    // 'everything_else' and undefined map to 'journal' as the default log subtype
    // This ensures log-classified notes don't stay as 'catchall'
    default:
      return 'journal';
  }
}

/**
 * Build the proper labels for a log-classified note.
 * Removes 'catchall' and 'needs_review', adds 'log' label.
 */
function buildLogLabels(existingLabels: string[] | undefined): string[] {
  const labels = (existingLabels ?? []).filter((l) => l !== 'catchall' && l !== 'needs_review');
  if (!labels.includes('log')) {
    labels.push('log');
  }
  return labels;
}

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
      // Parse frequency from text directly - don't use AI's freq which may be incorrect
      // e.g., "Run 3x per week" should be weekly with frequencyValue=3, not daily
      const { freq: parsedFreq, frequencyValue } = buildHabitFields(text);
      const frequency = parsedFreq;
      const result = await convertUnsortedToHabit(repo, unsortedNoteId, {
        frequency,
        frequencyValue,
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
    } else if (firstAction.type === 'create.note' || firstAction.type === 'add.to.list') {
      // For notes: Stage A updates note shape based on log classification
      // This ensures log-classified notes have proper subtype, labels, and canonical_type
      const existingNote = await repo.getById(unsortedNoteId);

      if (existingNote && existingNote.type === 'note') {
        // Extract log subtype from action payload or mindDropDecision
        const rawSubtype =
          firstAction.type === 'add.to.list'
            ? 'list'
            : (firstAction.payload.subtype ??
              decision.mindDropDecision?.logSubtype ??
              'everything_else');

        // Map to proper NoteSubtype (avoids staying as 'catchall')
        const subtype = mapLogSubtypeToNoteSubtype(rawSubtype);
        const canonicalType = persistedToCanonical('note', subtype);

        // Build proper labels for log notes
        const existingLabels = (existingNote as any)?.labels;
        const updatedLabels = buildLogLabels(existingLabels);

        // Mark classification complete with proper shape
        await repo.update({
          id: unsortedNoteId,
          patch: {
            subtype,
            canonicalType,
            ai_placed: true, // Now classified by AI
            labels: updatedLabels,
            views: {
              ...(existingNote.views ?? {}),
              minddrop_stage: 'classified',
              ai_pending: true, // Still waiting for prefill
              ai_failed: false,
              alsoShowIn: ['Hub:Catch-All'],
            },
          } as any,
        });

        createdIds.notes.push(unsortedNoteId);
        entityDetails.push({ kind: 'note', noteSubtype: subtype });

        console.log('[StageA] Classified note with proper shape', {
          id: unsortedNoteId,
          dropId,
          subtype,
          canonicalType,
          labels: updatedLabels,
          stage: 'classified',
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
