import type { CreateRecordInput, IRepo } from './repo/IRepo';
import type { Note, Todo } from './types';
import {
  logConversionStart,
  logConversionSuccess,
  logConversionError,
} from './conversionTelemetry';

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
): 'catchall' | 'space_chat' | 'manual' | undefined => {
  if (origin === 'catchall' || origin === 'space_chat' || origin === 'manual') return origin;
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
