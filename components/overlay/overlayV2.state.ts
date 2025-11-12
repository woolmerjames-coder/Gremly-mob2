import { parseDue } from '../../lib/cortex/entities/datetime';

export type BaseType = 'log' | 'todo' | 'habit';

export type TagKey = string;

export type LogState = { body: string; title: string };
export type TodoState = { title: string; details: string; due_at?: string | null };
export type HabitState = { title: string; notes: string; schedule?: 'daily' | 'weekly' | 'custom' };

export type FormatKind = 'plain' | 'checkboxes' | 'bullet';
export type PersonLink = { id: string; display: string } | null;

export type V2State = {
  baseType: BaseType;
  tags: TagKey[];
  mood?: 'pos' | 'neu' | 'neg' | null;
  list?: { items: { id: string; text: string; checked: boolean }[] } | null;
  detected: { mentions: string[]; dates: string[] };
  // Phase 4 additions
  expanded: boolean;
  spaceId: string | null;
  person: PersonLink;
  format: FormatKind; // notes only
  reminderAt: string | null; // ISO-ish
  suggestedDue: string | null;
  // Commitment fields (Phase X)
  commitment: boolean;
  commitmentNote: string;
  commitmentStartedAt: string | null;
  log: LogState;
  todo: TodoState;
  habit: HabitState;
  // undo stack for lightweight UI-only undos (Phase 9 QA pack)
  undoStack?: Array<{ kind: 'type' | 'tag' | 'commitment'; prev: Partial<V2State> }>;
};

export const initialV2State: V2State = {
  baseType: 'log',
  tags: [],
  mood: null,
  list: null,
  detected: { mentions: [], dates: [] },
  expanded: false,
  spaceId: null,
  person: null,
  format: 'plain',
  reminderAt: null,
  suggestedDue: null,
  commitment: false,
  commitmentNote: '',
  commitmentStartedAt: null,
  log: { title: '', body: '' },
  todo: { title: '', details: '', due_at: null },
  habit: { title: '', notes: '', schedule: 'custom' },
  undoStack: [],
};

export type Action =
  | { type: 'SET_BASE_TYPE'; to: BaseType }
  | { type: 'SET_TEXT'; text: string } // applies to current type
  | { type: 'HYDRATE_EDIT'; payload: Partial<V2State> }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_TODO_DUE'; due_at: string | null }
  | { type: 'TOGGLE_COMMITMENT' }
  | { type: 'SET_COMMITMENT_NOTE'; note: string }
  | { type: 'SET_TAGS'; tags: TagKey[] }
  | { type: 'TOGGLE_TAG'; tag: TagKey }
  | { type: 'SET_MOOD'; mood: 'pos' | 'neu' | 'neg' | null }
  | { type: 'SET_LIST_FROM_TEXT'; lines: string[] }
  | { type: 'TOGGLE_LIST_ITEM'; id: string; checked: boolean }
  | { type: 'SET_DETECTED'; mentions: string[]; dates: string[] }
  | { type: 'TOGGLE_EXPANDED' }
  | { type: 'SET_SPACE'; spaceId: string | null }
  | { type: 'SET_PERSON'; person: PersonLink }
  | { type: 'SET_FORMAT'; fmt: FormatKind }
  | { type: 'SET_REMINDER'; when: string | null }
  | { type: 'PUSH_UNDO'; entry: { kind: 'type' | 'tag' | 'commitment'; prev: Partial<V2State> } }
  | { type: 'UNDO_LAST' };

export function v2Reducer(state: V2State, action: Action): V2State {
  switch (action.type) {
    case 'PUSH_UNDO': {
      const stack = (state.undoStack ?? []).concat([action.entry]);
      return { ...state, undoStack: stack };
    }
    case 'UNDO_LAST': {
      const stack = state.undoStack ?? [];
      if (stack.length === 0) return state;
      const last = stack[stack.length - 1];
      const nextStack = stack.slice(0, -1);
      // Restore the previous partial state (shallow merge)
      const restored: V2State = { ...state, ...last.prev, undoStack: nextStack } as V2State;
      return restored;
    }

    case 'SET_BASE_TYPE': {
      // When switching base type, preserve the current input text by
      // copying it into the newly selected type if that field is empty.
      const prev = state.baseType;
      if (action.to === prev) return state;
      const currentText = currentTextOf(state);
      const next: V2State = { ...state, baseType: action.to };
      if (action.to === 'log' && !next.log.body)
        next.log = { ...next.log, body: currentText, title: firstLine(currentText) };
      if (action.to === 'todo' && !next.todo.details)
        next.todo = { ...next.todo, details: currentText, title: firstLine(currentText) };
      if (action.to === 'habit' && !next.habit.notes)
        next.habit = { ...next.habit, notes: currentText, title: firstLine(currentText) };
      return applySuggestedDue(next);
    }
    case 'SET_TAGS': {
      const deduped = Array.from(new Set(action.tags));
      const { list, mood } = deriveTagSideEffects(state, deduped);
      return { ...state, tags: deduped, list, mood };
    }
    case 'TOGGLE_TAG': {
      const hasTag = state.tags.includes(action.tag);
      const nextTags = hasTag
        ? state.tags.filter((t) => t !== action.tag)
        : [...state.tags, action.tag];
      const { list, mood } = deriveTagSideEffects(state, nextTags);
      return { ...state, tags: nextTags, list, mood };
    }
    case 'SET_MOOD':
      return { ...state, mood: action.mood };
    case 'SET_LIST_FROM_TEXT':
      return { ...state, list: { items: linesToItems(action.lines) } };
    case 'TOGGLE_LIST_ITEM':
      return {
        ...state,
        list: state.list
          ? {
              items: state.list.items.map((it) =>
                it.id === action.id ? { ...it, checked: action.checked } : it,
              ),
            }
          : null,
      };
    case 'SET_DETECTED':
      return { ...state, detected: { mentions: action.mentions, dates: action.dates } };
    case 'SET_TEXT': {
      const next = setTextForCurrent(state, action.text);
      // refresh list items live if list tag on
      if (next.tags.includes('list')) {
        const lines = action.text.split(/\r?\n/).filter(Boolean);
        const existing = new Map((next.list?.items ?? []).map((i) => [i.text, i]));
        const items = lines.map(
          (tx) => existing.get(tx) ?? { id: makeId(), text: tx, checked: false },
        );
        next.list = { items };
      }
      // lightweight detection
      const { mentions, dates } = detectInline(action.text);
      next.detected = { mentions, dates };
      return applySuggestedDue(next);
    }
    case 'SET_TITLE': {
      if (state.baseType === 'log') return { ...state, log: { ...state.log, title: action.title } };
      if (state.baseType === 'todo')
        return applySuggestedDue({
          ...state,
          todo: { ...state.todo, title: action.title },
        });
      return { ...state, habit: { ...state.habit, title: action.title } };
    }
    case 'SET_TODO_DUE':
      if (action.due_at) {
        return { ...state, todo: { ...state.todo, due_at: action.due_at }, suggestedDue: null };
      }
      return applySuggestedDue({
        ...state,
        todo: { ...state.todo, due_at: action.due_at },
        suggestedDue: null,
      });
    case 'TOGGLE_COMMITMENT': {
      const turningOn = !state.commitment;
      // If turning on and no prior startedAt, stamp a start time. If turning off, keep history.
      return {
        ...state,
        commitment: turningOn,
        commitmentStartedAt:
          turningOn && !state.commitmentStartedAt
            ? new Date().toISOString()
            : state.commitmentStartedAt,
      };
    }
    case 'SET_COMMITMENT_NOTE':
      return { ...state, commitmentNote: action.note };
    case 'HYDRATE_EDIT':
      return applySuggestedDue({ ...state, ...action.payload } as V2State);
    case 'TOGGLE_EXPANDED':
      return { ...state, expanded: !state.expanded };
    case 'SET_SPACE':
      return { ...state, spaceId: action.spaceId };
    case 'SET_PERSON':
      return { ...state, person: action.person };
    case 'SET_FORMAT':
      return { ...state, format: action.fmt };
    case 'SET_REMINDER':
      return { ...state, reminderAt: action.when };
    default:
      return state;
  }
}

function applySuggestedDue(next: V2State): V2State {
  const suggested = deriveSuggestedDue(next);
  if (next.suggestedDue === suggested) return next;
  return { ...next, suggestedDue: suggested };
}

function deriveSuggestedDue(state: V2State): string | null {
  if (state.baseType !== 'todo') return null;
  if (state.todo?.due_at) return null;

  const segments = [state.todo?.title ?? '', state.todo?.details ?? '', state.log?.body ?? '']
    .map((segment) => (typeof segment === 'string' ? segment.trim() : ''))
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return null;

  try {
    const parsed = parseDue(segments.join('\n'));
    return parsed?.iso ?? null;
  } catch (e) {
    return null;
  }
}

// helpers
export function firstLine(t: string) {
  return (t ?? '').split(/\r?\n/)[0]?.trim().slice(0, 120) ?? '';
}

function currentTextOf(s: V2State) {
  return s.baseType === 'log' ? s.log.body : s.baseType === 'todo' ? s.todo.details : s.habit.notes;
}
function setTextForCurrent(s: V2State, t: string): V2State {
  if (s.baseType === 'log') return { ...s, log: { ...s.log, body: t, title: firstLine(t) } };
  if (s.baseType === 'todo') return { ...s, todo: { ...s.todo, details: t, title: firstLine(t) } };
  return { ...s, habit: { ...s.habit, notes: t, title: firstLine(t) } };
}
function parseListLines(src: string) {
  return linesToItems(src.split(/\r?\n/).filter(Boolean));
}
function linesToItems(lines: string[]) {
  return lines.map((tx) => ({ id: makeId(), text: tx, checked: false }));
}
function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function deriveTagSideEffects(state: V2State, tags: TagKey[]) {
  let list = state.list;
  if (tags.includes('list')) {
    if (!list) {
      const src = currentTextOf(state);
      list = { items: parseListLines(src) };
    }
  } else {
    list = null;
  }

  const mood = tags.includes('journal') ? (state.mood ?? 'neu') : null;

  return { list, mood };
}

// very light inline detection; repo can swap to its NLP later
function detectInline(t: string) {
  const mentions = Array.from(
    new Set((t.match(/@[\p{L}0-9_.-]+/gu) ?? []).map((s) => s.slice(1)).filter(Boolean)),
  );
  // prefer repo’s date parser if present; fall back to simple today/tomorrow tokens
  const dates: string[] = [];
  if (/\btomorrow\b/i.test(t)) dates.push('__token:tomorrow');
  if (/\btoday\b/i.test(t)) dates.push('__token:today');
  return { mentions, dates };
}
