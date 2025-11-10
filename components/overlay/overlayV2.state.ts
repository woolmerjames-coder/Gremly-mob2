export type BaseType = 'log' | 'todo' | 'habit';

export type TagKey = 'journal' | 'list';

export type LogState = { body: string; title: string };
export type TodoState = { title: string; details: string; due_at?: string | null };
export type HabitState = { title: string; notes: string; schedule?: 'daily' | 'weekly' | 'custom' };

export type FormatKind = 'plain' | 'checkboxes' | 'bullet';
export type PersonLink = { id: string; display: string } | null;

export type V2State = {
  baseType: BaseType;
  tags: Partial<Record<TagKey, boolean>>;
  mood?: 'pos' | 'neu' | 'neg' | null;
  list?: { items: { id: string; text: string; checked: boolean }[] } | null;
  detected: { mentions: string[]; dates: string[] };
  // Phase 4 additions
  expanded: boolean;
  spaceId: string | null;
  person: PersonLink;
  format: FormatKind; // notes only
  reminderAt: string | null; // ISO-ish
  log: LogState;
  todo: TodoState;
  habit: HabitState;
};

export const initialV2State: V2State = {
  baseType: 'log',
  tags: {},
  mood: null,
  list: null,
  detected: { mentions: [], dates: [] },
  expanded: false,
  spaceId: null,
  person: null,
  format: 'plain',
  reminderAt: null,
  log: { title: '', body: '' },
  todo: { title: '', details: '', due_at: null },
  habit: { title: '', notes: '', schedule: 'custom' },
};

type Action =
  | { type: 'SET_BASE_TYPE'; to: BaseType }
  | { type: 'SET_TEXT'; text: string } // applies to current type
  | { type: 'HYDRATE_EDIT'; payload: Partial<V2State> }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_TODO_DUE'; due_at: string | null }
  | { type: 'TOGGLE_TAG'; tag: TagKey; on?: boolean }
  | { type: 'SET_MOOD'; mood: 'pos' | 'neu' | 'neg' | null }
  | { type: 'SET_LIST_FROM_TEXT'; lines: string[] }
  | { type: 'TOGGLE_LIST_ITEM'; id: string; checked: boolean }
  | { type: 'SET_DETECTED'; mentions: string[]; dates: string[] }
  | { type: 'TOGGLE_EXPANDED' }
  | { type: 'SET_SPACE'; spaceId: string | null }
  | { type: 'SET_PERSON'; person: PersonLink }
  | { type: 'SET_FORMAT'; fmt: FormatKind }
  | { type: 'SET_REMINDER'; when: string | null };

export function v2Reducer(state: V2State, action: Action): V2State {
  switch (action.type) {
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
      return next;
    }
    case 'TOGGLE_TAG': {
      const tags = { ...state.tags, [action.tag]: action.on ?? !state.tags[action.tag] };
      // bootstrap list structure when tag turns on
      let list = state.list;
      if (tags.list && !list) {
        const src = currentTextOf(state);
        list = { items: parseListLines(src) };
      }
      if (!tags.list) list = null;
      // clear mood when journal off
      const mood = tags.journal ? (state.mood ?? 'neu') : null;
      return { ...state, tags, list, mood };
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
      if (next.tags.list) {
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
      return next;
    }
    case 'SET_TITLE': {
      if (state.baseType === 'log') return { ...state, log: { ...state.log, title: action.title } };
      if (state.baseType === 'todo')
        return { ...state, todo: { ...state.todo, title: action.title } };
      return { ...state, habit: { ...state.habit, title: action.title } };
    }
    case 'SET_TODO_DUE':
      return { ...state, todo: { ...state.todo, due_at: action.due_at } };
    case 'HYDRATE_EDIT':
      return { ...state, ...action.payload } as V2State;
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
