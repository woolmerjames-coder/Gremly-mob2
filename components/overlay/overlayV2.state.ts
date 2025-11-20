import { deriveCompactTitle } from '../../lib/text/compactTitle';

export type BaseType = 'log' | 'todo' | 'habit';

export type TagKey = string;

export type LogKind = 'journal' | 'idea' | 'list' | 'basic';

export type LogState = { body: string; title: string; kind: LogKind; private: boolean };

/**
 * Classify log kind based on content heuristics.
 * Looks at first ~200 chars for emotional/reflective language (journal),
 * speculative language (idea), or list-like formatting (list).
 */
export function classifyLogKind(raw: string): LogKind {
  const text = (raw || '').toLowerCase();
  const firstChunk = text.slice(0, 200);

  // Journal detection – emotional / reflective language
  const isJournal =
    /\b(i feel|i'm feeling|feeling|today\b|tonight\b|this morning\b|this evening\b|i am\b|i was\b)/.test(
      firstChunk,
    );

  // Idea detection – speculative / "what if" language
  const isIdea = /\b(idea\b|what if\b|maybe we could\b|could we\b|we should\b|brainstorm\b)/.test(
    firstChunk,
  );

  // List detection – multiple short lines starting with bullets / numbers
  const lines = firstChunk.split(/\r?\n/);
  const listLikeLines = lines.filter((line) => /^\s*([-*]|\d+\.)\s+/.test(line));
  const isList = listLikeLines.length >= 2;

  if (isList) return 'list';
  if (isJournal) return 'journal';
  if (isIdea) return 'idea';
  return 'basic';
}

export type TodoState = { title: string; details: string; due_at?: string | null };
export type HabitState = {
  title: string;
  notes: string;
  schedule?: 'daily' | 'weekly' | 'custom';
  frequency_json?: any; // Structured frequency configuration
  subtype?: 'start_habit' | 'break_habit' | 'routine'; // Habit mode
};

export type FormatKind = 'plain' | 'checkboxes' | 'bullet';
export type PersonLink = { id: string; display: string } | null;
export type MoodValue = 'pos' | 'neu' | 'neg';
export type LogSubtypeOverride = 'journal' | 'list' | 'idea' | 'plain' | null;

export type V2State = {
  baseType: BaseType;
  tags: TagKey[];
  stickyTags: TagKey[];
  tagTombstones: TagKey[];
  mood?: MoodValue | null;
  list?: { items: { id: string; text: string; checked: boolean }[] } | null;
  detected: { mentions: string[]; dates: string[] };
  // Phase 4 additions
  expanded: boolean;
  spaceId: string | null;
  person: PersonLink;
  format: FormatKind; // notes only
  reminderAt: string | null; // ISO-ish
  // Commitment fields (Phase X)
  commitment: boolean;
  commitmentNote: string;
  commitmentStartedAt: string | null;
  compactTitle: string;
  compactTitleSource: string;
  userEditedTitle: boolean;
  log: LogState;
  todo: TodoState;
  habit: HabitState;
  // undo stack for lightweight UI-only undos (Phase 9 QA pack)
  undoStack?: Array<{ kind: 'type' | 'tag' | 'commitment'; prev: Partial<V2State> }>;
  // Phase L8: Manual log subtype override
  logSubtypeOverride: LogSubtypeOverride;
  // Phase L9: Private flag for journal logs (persisted via views.private_journal)
  logIsPrivate: boolean;
};

export const initialV2State: V2State = {
  baseType: 'log',
  tags: [],
  stickyTags: [],
  tagTombstones: [],
  mood: null,
  list: null,
  detected: { mentions: [], dates: [] },
  expanded: false,
  spaceId: null,
  person: null,
  format: 'plain',
  reminderAt: null,
  commitment: false,
  commitmentNote: '',
  commitmentStartedAt: null,
  compactTitle: '',
  compactTitleSource: '',
  userEditedTitle: false,
  log: { title: '', body: '', kind: 'basic', private: false },
  todo: { title: '', details: '', due_at: null },
  habit: { title: '', notes: '', schedule: 'custom', subtype: 'start_habit' },
  undoStack: [],
  logSubtypeOverride: null, // Phase L8: Manual log subtype override
  logIsPrivate: false, // Phase L9: Private flag for journal logs
};

type Action =
  | { type: 'SET_BASE_TYPE'; to: BaseType }
  | { type: 'SET_TEXT'; text: string } // applies to current type
  | { type: 'HYDRATE_EDIT'; payload: Partial<V2State> }
  | { type: 'SET_TITLE'; title: string; force?: boolean } // force=true bypasses userEditedTitle guard
  | { type: 'SET_COMPACT_TITLE'; title: string }
  | { type: 'SET_TODO_DUE'; due_at: string | null }
  | { type: 'SET_HABIT_FREQUENCY'; frequency_json: any }
  | { type: 'SET_HABIT_SUBTYPE'; subtype: 'start_habit' | 'break_habit' | 'routine' }
  | { type: 'TOGGLE_COMMITMENT' }
  | { type: 'SET_COMMITMENT_NOTE'; note: string }
  | { type: 'SET_TAGS'; tags: TagKey[] }
  | { type: 'TOGGLE_TAG'; tag: TagKey }
  | { type: 'SET_MOOD'; mood: MoodValue | null }
  | { type: 'SET_LIST_FROM_TEXT'; lines: string[] }
  | { type: 'TOGGLE_LIST_ITEM'; id: string; checked: boolean }
  | { type: 'SET_DETECTED'; mentions: string[]; dates: string[] }
  | { type: 'TOGGLE_EXPANDED' }
  | { type: 'SET_SPACE'; spaceId: string | null }
  | { type: 'SET_PERSON'; person: PersonLink }
  | { type: 'SET_FORMAT'; fmt: FormatKind }
  | { type: 'SET_REMINDER'; when: string | null }
  | { type: 'TOGGLE_LOG_PRIVATE' }
  | { type: 'SET_LOG_SUBTYPE_OVERRIDE'; value: LogSubtypeOverride }
  | { type: 'SET_LOG_IS_PRIVATE'; value: boolean }
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
      let next: V2State = { ...state, baseType: action.to };
      if (action.to === 'log' && !next.log.body) {
        const nextBody = currentText;
        const nextKind = classifyLogKind(nextBody);
        next = { ...next, log: { ...next.log, body: nextBody, kind: nextKind } };
      } else if (action.to === 'todo' && !next.todo.details) {
        next = { ...next, todo: { ...next.todo, details: currentText } };
      } else if (action.to === 'habit' && !next.habit.notes) {
        next = { ...next, habit: { ...next.habit, notes: currentText } };
      }
      return syncCompactTitle(next, []);
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
      const text = action.text ?? '';
      const trimmed = text.trim();
      let next = setTextForCurrent(state, text);

      // For todos: SET_TEXT only updates details, NOT title
      // Title is only updated via SET_TITLE/SET_COMPACT_TITLE or HYDRATE_EDIT
      // For logs/habits: syncCompactTitle derives title from body/notes
      if (state.baseType !== 'todo') {
        next = syncCompactTitle(next, [text]);
      }

      const prevList = next.list;
      let list = next.list;
      if (next.tags.includes('list')) {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const existing = new Map((prevList?.items ?? []).map((i) => [i.text, i]));
        const items = lines.map(
          (tx) => existing.get(tx) ?? { id: makeId(), text: tx, checked: false },
        );
        list = { items };
      } else {
        list = null;
      }

      const { mentions, dates } = detectInline(text);

      return {
        ...next,
        list,
        detected: { mentions, dates },
        userEditedTitle: trimmed.length > 0,
      };
    }
    case 'SET_TITLE': {
      // Allow forcing title update (for AI-generated titles) even if user has edited text
      if (state.userEditedTitle && !action.force) {
        return state;
      }
      let next: V2State;
      if (state.baseType === 'log') next = { ...state, log: { ...state.log, title: action.title } };
      else if (state.baseType === 'todo') {
        if (__DEV__) {
          console.log('[overlayV2.reducer] SET_TITLE for todo', {
            newTitle: action.title,
            force: action.force,
            userEditedTitle: state.userEditedTitle,
            currentDetails: state.todo.details,
            currentTitle: state.todo.title,
          });
        }
        next = { ...state, todo: { ...state.todo, title: action.title } };
        if (__DEV__) {
          console.log('[overlayV2.reducer] SET_TITLE result', {
            resultTitle: next.todo.title,
            resultDetails: next.todo.details,
            detailsPreserved: next.todo.details === state.todo.details,
          });
        }
      } else next = { ...state, habit: { ...state.habit, title: action.title } };

      // Use the title as-is for compactTitle without running through compacting logic
      return {
        ...next,
        compactTitle: action.title,
        compactTitleSource: action.title,
        userEditedTitle: false,
      };
    }
    case 'SET_COMPACT_TITLE': {
      return {
        ...state,
        compactTitle: action.title,
      };
    }
    case 'SET_TODO_DUE':
      return { ...state, todo: { ...state.todo, due_at: action.due_at } };
    case 'SET_HABIT_FREQUENCY':
      return { ...state, habit: { ...state.habit, frequency_json: action.frequency_json } };
    case 'SET_HABIT_SUBTYPE':
      return { ...state, habit: { ...state.habit, subtype: action.subtype } };
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
    case 'HYDRATE_EDIT': {
      const merged = { ...state, ...action.payload } as V2State;

      // If hydrating a log and kind is not explicitly provided, classify it from body
      let finalMerged = merged;
      if (merged.baseType === 'log' && merged.log) {
        const hasExplicitKind = action.payload?.log && 'kind' in action.payload.log;
        if (!hasExplicitKind) {
          const classifiedKind = classifyLogKind(merged.log.body || '');
          finalMerged = {
            ...merged,
            log: { ...merged.log, kind: classifiedKind },
          };
        }
      }

      const hydrated = syncCompactTitle(finalMerged, [
        action.payload?.compactTitle,
        action.payload?.compactTitleSource,
      ]);
      const text = currentTextOf(hydrated).trim();
      return { ...hydrated, userEditedTitle: text.length > 0 };
    }
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
    case 'TOGGLE_LOG_PRIVATE':
      return { ...state, log: { ...state.log, private: !state.log.private } };
    case 'SET_LOG_SUBTYPE_OVERRIDE':
      return { ...state, logSubtypeOverride: action.value };
    case 'SET_LOG_IS_PRIVATE':
      return { ...state, logIsPrivate: action.value };
    default:
      return state;
  }
}

// helpers
export function firstLine(t: string) {
  return deriveCompactTitle([t ?? '']).compact;
}

function currentTextOf(s: V2State) {
  return s.baseType === 'log' ? s.log.body : s.baseType === 'todo' ? s.todo.details : s.habit.notes;
}
function setTextForCurrent(s: V2State, t: string): V2State {
  if (s.baseType === 'log') {
    const nextKind = classifyLogKind(t);
    return { ...s, log: { ...s.log, body: t, kind: nextKind } };
  }
  if (s.baseType === 'todo') return { ...s, todo: { ...s.todo, details: t } };
  return { ...s, habit: { ...s.habit, notes: t } };
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

function syncCompactTitle(state: V2State, priority: Array<string | null | undefined>): V2State {
  const base = state.baseType;
  const body =
    base === 'log' ? state.log.body : base === 'todo' ? state.todo.details : state.habit.notes;
  const baseTitle =
    base === 'log' ? state.log.title : base === 'todo' ? state.todo.title : state.habit.title;

  const candidates = [...priority, baseTitle, body, state.compactTitle, state.compactTitleSource];
  const { compact, source } = deriveCompactTitle(candidates, {
    fallback: baseTitle || body || state.compactTitle || '',
  });

  if (base === 'log') {
    return {
      ...state,
      compactTitle: compact,
      compactTitleSource: source,
      log: { ...state.log, title: compact },
    };
  }

  if (base === 'todo') {
    // For todos: only update compactTitle/compactTitleSource, NOT todo.title
    // todo.title is only updated via SET_TITLE/SET_COMPACT_TITLE or HYDRATE_EDIT
    return {
      ...state,
      compactTitle: compact,
      compactTitleSource: source,
      // Preserve existing todo.title
    };
  }

  return {
    ...state,
    compactTitle: compact,
    compactTitleSource: source,
    habit: { ...state.habit, title: compact },
  };
}
