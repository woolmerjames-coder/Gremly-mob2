import type { CreateRecordInput, IRepo } from './repo/IRepo';
import type { Note, Todo, Habit, LogSubtype } from './types';
import {
  logConversionStart,
  logConversionSuccess,
  logConversionError,
} from './conversionTelemetry';
import { buildMindDropDerivedFields } from './minddrop/minddropShared';
import { normalizeTodoTitle } from './minddrop/normalizeTodoTitle';
import { getEffectiveLogSubtype } from './logs/getEffectiveLogSubtype';
import { parseHabitFrequency } from './sweep/habitHelpers';
import { nowTimestamp } from './date/DateService';

type LineageMeta = {
  originId: string;
  source: string;
};

export type ChecklistItem = {
  text: string;
  checked: boolean;
};

const CHECKBOX_REGEX = /^-\s\[( |x)\]\s(.*)$/i;

const ensureString = (value: string | null | undefined): string => (value ?? '').trim();

export const appendLineageToWhyString = (
  existing: string | null | undefined,
  lineage: LineageMeta,
): string => {
  const base = ensureString(existing);
  const addition = `origin:${lineage.originId};source:${lineage.source}`;
  if (!base) return addition;
  if (base.includes(addition)) return base;
  return `${base} | ${addition}`;
};

export const parseChecklistItems = (body: string | null | undefined): ChecklistItem[] => {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const items: ChecklistItem[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = CHECKBOX_REGEX.exec(line);
    if (!match) continue;
    const checked = match[1].toLowerCase() === 'x';
    const text = match[2].trim();
    if (!text) continue;
    items.push({ text, checked });
  }
  return items;
};

export const hasChecklist = (body: string | null | undefined): boolean =>
  parseChecklistItems(body).length > 0;

const renderChecklistItems = (items: ChecklistItem[]): string =>
  items.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');

const normalizeChecklist = (items: ChecklistItem[], preserve: boolean): ChecklistItem[] =>
  items.map((item) => ({ ...item, checked: preserve ? item.checked : false }));

const deriveTodoName = (note: Note, items: ChecklistItem[]): string => {
  if (note.title && note.title.trim()) return note.title.trim();
  if (items.length > 0) return items[0].text;
  return 'Converted list';
};

const deriveTodoBody = (
  note: Note,
  items: ChecklistItem[],
  preserveState: boolean,
): string | undefined => {
  if (items.length === 0) return note.body ?? undefined;
  const normalized = normalizeChecklist(items, preserveState);
  return renderChecklistItems(normalized);
};

const deriveNoteBody = (todo: Todo, items: ChecklistItem[], preserveState: boolean): string => {
  const sourceItems = items.length > 0 ? items : [{ text: todo.name, checked: false }];
  const normalized = normalizeChecklist(sourceItems, preserveState);
  return renderChecklistItems(normalized);
};

const resolveOrigin = (
  origin: Note['origin'] | Todo['origin'],
): 'catchall' | 'space_chat' | 'manual' | 'overlay' | undefined => {
  if (
    origin === 'catchall' ||
    origin === 'space_chat' ||
    origin === 'manual' ||
    origin === 'overlay'
  )
    return origin;
  return undefined;
};

export const convertLogListToTodo = async (
  repo: IRepo,
  noteId: string,
  options: { preserveState?: boolean } = {},
): Promise<{ todo: Todo; updatedNote: Note }> => {
  logConversionStart({ from: 'log-list', to: 'todo', originId: noteId });

  try {
    const record = await repo.getById(noteId);
    if (!record || record.type !== 'note') {
      throw new Error(`Note ${noteId} not found`);
    }

    const note = record as Note;
    const preserveState = options.preserveState ?? true;
    const checklist = parseChecklistItems(note.body ?? '');
    const body = deriveTodoBody(note, checklist, preserveState);
    const todoWhy = appendLineageToWhyString(note.why_string, {
      originId: note.id,
      source: 'log-list',
    });

    const todoInput: CreateRecordInput = {
      type: 'todo',
      name: deriveTodoName(note, checklist),
      body,
      space_id: note.space_id ?? null,
      ai_placed: !!note.ai_placed,
      why_string: todoWhy,
      origin: resolveOrigin(note.origin),
      canonicalType: 'todo',
      labels: note.labels,
      views: note.views,
    };

    const createdTodo = (await repo.create(todoInput)) as Todo;

    const noteWhy = appendLineageToWhyString(note.why_string, {
      originId: createdTodo.id,
      source: 'todo',
    });

    const updatedNote = (await repo.update({
      id: note.id,
      patch: {
        archived: true,
        archived_at: nowTimestamp(),
        archived_reason: 'converted',
        why_string: noteWhy,
      },
    })) as Note;

    logConversionSuccess({
      from: 'log-list',
      to: 'todo',
      originId: note.id,
      createdId: createdTodo.id,
    });

    return { todo: createdTodo, updatedNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConversionError({ from: 'log-list', to: 'todo', originId: noteId, error: message });
    throw error;
  }
};

export const convertTodoToLogList = async (
  repo: IRepo,
  todoId: string,
  options: { preserveState?: boolean } = {},
): Promise<{ note: Note; updatedTodo: Todo }> => {
  logConversionStart({ from: 'todo-list', to: 'log', originId: todoId });

  try {
    const record = await repo.getById(todoId);
    if (!record || record.type !== 'todo') {
      throw new Error(`Todo ${todoId} not found`);
    }

    const todo = record as Todo;
    const preserveState = options.preserveState ?? true;
    const checklist = parseChecklistItems(todo.body ?? todo.notes ?? '');
    const noteBody = deriveNoteBody(todo, checklist, preserveState);
    const noteWhy = appendLineageToWhyString(todo.why_string, {
      originId: todo.id,
      source: 'todo',
    });

    const noteInput: CreateRecordInput = {
      type: 'note',
      title: todo.name,
      body: noteBody,
      subtype: 'list',
      fmt: 'checkboxes',
      space_id: todo.space_id ?? null,
      ai_placed: !!todo.ai_placed,
      why_string: noteWhy,
      origin: resolveOrigin(todo.origin),
      canonicalType: 'log',
      labels: todo.labels,
      views: todo.views,
    };

    const createdNote = (await repo.create(noteInput)) as Note;

    const todoWhy = appendLineageToWhyString(todo.why_string, {
      originId: createdNote.id,
      source: 'log-list',
    });

    const updatedTodo = (await repo.update({
      id: todo.id,
      patch: {
        archived: true,
        archived_at: nowTimestamp(),
        archived_reason: 'converted',
        why_string: todoWhy,
      },
    })) as Todo;

    logConversionSuccess({
      from: 'todo-list',
      to: 'log',
      originId: todo.id,
      createdId: createdNote.id,
    });

    return { note: createdNote, updatedTodo };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConversionError({ from: 'todo-list', to: 'log', originId: todoId, error: message });
    throw error;
  }
};

/**
 * Converts an unsorted note (catchall) to a first-class todo.
 * Creates a new todo record and marks the original note as archived.
 *
 * @param repo - Repository instance
 * @param noteId - ID of the unsorted note to convert
 * @param options - Conversion options (due date, name override)
 * @returns Object containing the created todo and updated note
 */
export const convertUnsortedToTodo = async (
  repo: IRepo,
  noteId: string,
  options: { due?: string | null; nameOverride?: string } = {},
): Promise<{ todo: Todo; updatedNote: Note }> => {
  logConversionStart({ from: 'unsorted', to: 'todo', originId: noteId });

  try {
    const record = await repo.getById(noteId);
    if (!record || record.type !== 'note') {
      throw new Error(`Note ${noteId} not found`);
    }

    const note = record as Note;

    // Derive todo name from note: prefer body (Mind Drop text), then title
    const rawText = note.body ?? note.title ?? '';

    // Use shared Mind Drop helper for consistent tag cleaning
    const derived = await buildMindDropDerivedFields('todo', {
      rawText,
      aiTags: note.tags && note.tags.length > 0 ? note.tags : undefined,
    });

    // Create a short, clean title using the normalization helper
    // This will be the initial title (BackgroundPrefill may refine it later with AI)
    const todoName = options.nameOverride ?? normalizeTodoTitle(rawText);
    const due = options.due ?? null;

    // Preserve the original full Mind Drop text in body field
    // This ensures the overlay shows the complete original text, not just the short title
    const todoBody = note.body ?? note.title ?? undefined;

    // Filter labels: remove catchall/needs_review, add todo
    const originalLabels = note.labels ?? [];
    const filteredLabels = originalLabels.filter(
      (l: string) => l !== 'needs_review' && l !== 'catchall',
    );
    const todoLabels = Array.from(new Set([...filteredLabels, 'todo']));

    const todoWhy = appendLineageToWhyString(note.why_string, {
      originId: note.id,
      source: 'unsorted',
    });

    const todoInput: CreateRecordInput = {
      type: 'todo',
      name: todoName,
      due_date: due,
      undefined_due: !due,
      body: todoBody, // Preserve full Mind Drop text in body field
      space_id: note.space_id ?? null,
      ai_placed: !!note.ai_placed,
      why_string: todoWhy ?? 'Confirmed as todo via category chip',
      origin: note.origin ?? 'catchall',
      canonicalType: 'todo',
      labels: todoLabels,
      tags: derived.tags, // Use cleaned tags from shared helper
      tags_meta: note.tags_meta,
      views: note.views,
      dropId: (note as any).drop_id,
    };

    const createdTodo = (await repo.create(todoInput)) as Todo;

    // Note: backgroundPrefill is now called by Stage B (runMindDropStageBPrefill)
    // to avoid duplicate AI requests and race conditions on views updates

    const noteWhy = appendLineageToWhyString(note.why_string, {
      originId: createdTodo.id,
      source: 'todo',
    });

    const updatedNote = (await repo.update({
      id: note.id,
      patch: {
        archived: true,
        archived_at: nowTimestamp(),
        archived_reason: 'converted',
        why_string: noteWhy,
      },
    })) as Note;

    logConversionSuccess({
      from: 'unsorted',
      to: 'todo',
      originId: note.id,
      createdId: createdTodo.id,
    });

    return { todo: createdTodo, updatedNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConversionError({ from: 'unsorted', to: 'todo', originId: noteId, error: message });
    throw error;
  }
};

/**
 * Convert an unsorted note to a log (journal, idea, list, etc.)
 * Updates the note in place to promote it to a canonical log subtype.
 *
 * Uses AI classification to determine the best subtype unless manually overridden.
 *
 * @param repo - Repository instance
 * @param noteId - ID of the unsorted note to convert
 * @param options - Conversion options (subtype override, skip AI classification)
 * @returns Updated note
 */
export const convertUnsortedToLog = async (
  repo: IRepo,
  noteId: string,
  options: {
    subtype?: LogSubtype;
    skipAI?: boolean; // For photo-only logs or manual override cases
  } = {},
): Promise<{ note: Note }> => {
  logConversionStart({ from: 'unsorted', to: 'log', originId: noteId });

  try {
    const record = await repo.getById(noteId);
    if (!record || record.type !== 'note') {
      throw new Error(`Note ${noteId} not found`);
    }

    const note = record as Note;

    // Determine subtype: manual override > AI classification > fallback to 'journal'
    let targetSubtype: LogSubtype;

    if (options.subtype) {
      // Manual override provided
      targetSubtype = options.subtype;
    } else if (options.skipAI) {
      // Skip AI (e.g., photo-only logs) - use fallback
      targetSubtype = 'general';
    } else {
      // Use AI classification
      const rawText = note.body ?? note.title ?? '';
      try {
        targetSubtype = await getEffectiveLogSubtype(rawText);
      } catch (err) {
        console.warn(
          '[convertUnsortedToLog] AI subtype classification failed, using fallback',
          err,
        );
        targetSubtype = 'journal'; // Fallback to journal on AI failure
      }
    }

    // Filter labels: remove catchall and needs_review, add log
    const originalLabels = note.labels ?? [];
    const filteredLabels = originalLabels.filter(
      (l: string) => l !== 'needs_review' && l !== 'catchall',
    );
    const logLabels = Array.from(new Set([...filteredLabels, 'log']));

    const whyUpdate = appendLineageToWhyString(note.why_string, {
      originId: note.id,
      source: 'log_confirmation',
    });

    // Map LogSubtype to NoteSubtype for database persistence
    // journal→journal, idea→idea, general→catchall
    const subtypeForDb = (() => {
      switch (targetSubtype) {
        case 'journal':
          return 'journal';
        case 'idea':
          return 'idea';
        case 'general':
        default:
          return 'catchall';
      }
    })();

    const updatedNote = (await repo.update({
      id: note.id,
      patch: {
        archived: false,
        ai_placed: true,
        subtype: subtypeForDb,
        canonicalType: 'log',
        labels: logLabels,
        why_string: whyUpdate,
      },
    })) as Note;

    // Note: backgroundPrefill is now called by Stage B (runMindDropStageBPrefill)
    // to unify the prefill pipeline for todos, habits, and logs.
    // This prevents duplicate AI requests and ensures consistent stage transitions.

    logConversionSuccess({
      from: 'unsorted',
      to: 'log',
      originId: note.id,
      createdId: updatedNote.id,
    });

    return { note: updatedNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConversionError({ from: 'unsorted', to: 'log', originId: noteId, error: message });
    throw error;
  }
};

/**
 * Converts an unsorted note (catchall) to a first-class habit.
 * Creates a new habit record and marks the original note as archived.
 *
 * @param repo - Repository instance
 * @param noteId - ID of the unsorted note to convert
 * @param options - Conversion options (frequency, name override)
 * @returns Object containing the created habit and updated note
 */
export const convertUnsortedToHabit = async (
  repo: IRepo,
  noteId: string,
  options: { frequency?: string; frequencyValue?: number | null; nameOverride?: string } = {},
): Promise<{ habit: Habit; updatedNote: Note }> => {
  logConversionStart({ from: 'unsorted', to: 'habit', originId: noteId });

  try {
    const record = await repo.getById(noteId);
    if (!record || record.type !== 'note') {
      throw new Error(`Note ${noteId} not found`);
    }

    const note = record as Note;

    // Derive habit name from note: prefer body (Mind Drop text), then title
    const rawText = note.body ?? note.title ?? '';

    // Use shared Mind Drop helper for consistent tag cleaning
    const derived = await buildMindDropDerivedFields('habit', {
      rawText,
      aiTags: note.tags && note.tags.length > 0 ? note.tags : undefined,
    });

    // For conversion, use nameOverride or extract first line (unlike direct Mind Drop creation which can use full text)
    const firstLine = rawText.split('\n')[0].trim().slice(0, 80);
    const habitName = options.nameOverride ?? (firstLine || 'New habit');
    const frequency = options.frequency ?? 'daily';

    // Parse frequency into structured cadence and target fields
    const parsedFrequency = parseHabitFrequency(options.frequency, options.frequencyValue);

    // Filter labels: remove catchall/needs_review, add habit
    const originalLabels = note.labels ?? [];
    const filteredLabels = originalLabels.filter(
      (l: string) => l !== 'needs_review' && l !== 'catchall',
    );
    const habitLabels = Array.from(new Set([...filteredLabels, 'habit']));

    const habitWhy = appendLineageToWhyString(note.why_string, {
      originId: note.id,
      source: 'unsorted',
    });

    const habitInput: CreateRecordInput = {
      type: 'habit',
      name: habitName,
      frequency: parsedFrequency.frequency,
      frequency_value: options.frequencyValue ?? null,
      cadence: parsedFrequency.cadence,
      target_per_period: parsedFrequency.target_per_period,
      subtype: 'start_habit', // Default: most habits are about starting new behaviors
      notes: derived.notes, // Preserve full Mind Drop text in notes field using shared helper
      space_id: note.space_id ?? null,
      ai_placed: !!note.ai_placed,
      why_string: habitWhy ?? 'Confirmed as habit via category chip',
      origin: note.origin ?? 'catchall',
      canonicalType: 'habit',
      labels: habitLabels,
      tags: derived.tags, // Use cleaned tags from shared helper
      tags_meta: note.tags_meta,
      views: note.views,
      dropId: (note as any).drop_id,
    };

    const createdHabit = (await repo.create(habitInput)) as Habit;

    // Note: backgroundPrefill is now called by Stage B (runMindDropStageBPrefill)
    // to avoid duplicate AI requests and race conditions on views updates

    const noteWhy = appendLineageToWhyString(note.why_string, {
      originId: createdHabit.id,
      source: 'habit',
    });

    const updatedNote = (await repo.update({
      id: note.id,
      patch: {
        archived: true,
        archived_at: nowTimestamp(),
        archived_reason: 'converted',
        why_string: noteWhy,
      },
    })) as Note;

    logConversionSuccess({
      from: 'unsorted',
      to: 'habit',
      originId: note.id,
      createdId: createdHabit.id,
    });

    return { habit: createdHabit, updatedNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logConversionError({ from: 'unsorted', to: 'habit', originId: noteId, error: message });
    throw error;
  }
};

export const __testing = {
  CHECKBOX_REGEX,
  parseChecklistItems,
  renderChecklistItems,
  normalizeChecklist,
  deriveTodoName,
  deriveTodoBody,
  deriveNoteBody,
  hasChecklist,
};
