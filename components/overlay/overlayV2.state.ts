import { deriveCompactTitle } from '../../lib/text/compactTitle';

export type BaseType = 'log' | 'todo' | 'habit';

export type TagKey = string;

export type LogKind = 'journal' | 'idea' | 'list' | 'basic';

export type LogState = {
  body: string;
  title: string;
  kind: LogKind;
  private: boolean;
  /** Date Intelligence: Event date for notes (when it IS) */
  target_date?: string | null;
  /** Date Intelligence: End date for multi-day events */
  end_date?: string | null;
  /** Date Intelligence: Event time if applicable */
  event_time?: string | null;
};

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

/**
 * TodoState - Overlay-editable fields for todos
 * Persisted fields: title → name/title, details → body, due_day, due_time
 * Also persisted via V2State: tags, tags_meta, spaceId, commitment fields
 */
export type TodoState = {
  title: string;
  details: string;
  due_at?: string | null;
  /** Canonical local date YYYY-MM-DD - source of truth for date */
  due_day?: string | null;
  /** Specific time HH:mm - only if user explicitly set a time */
  due_time?: string | null;
  /** AI-estimated or user-set duration in minutes */
  time_estimate_minutes?: number | null;
  /** Preferred time of day for scheduling (from AI or user) */
  time_window?: 'any' | 'morning' | 'day' | 'evening' | null;
  /** Date Intelligence: When it's due/event date (deadline) - external, immovable */
  target_date?: string | null;
  /** Date Intelligence: When user will work on it - internal, movable */
  scheduled_date?: string | null;
};

/**
 * HabitState - Overlay-editable fields for habits
 * Persisted fields: title → name/title, notes, frequency_json, subtype
 * Also persisted via V2State: tags, tags_meta, spaceId, commitment fields
 */
export type HabitState = {
  title: string;
  notes: string;
  schedule?: 'daily' | 'weekly' | 'custom';
  frequency_json?: any; // Structured frequency configuration → frequency_json column
  subtype?: 'start_habit' | 'break_habit' | 'routine'; // Habit mode → subtype column
  /** When habit tracking begins (null = TBD) */
  start_date?: string | null;
  /** Optional end date for time-bound habits */
  end_date?: string | null;
  /** Preferred time of day for scheduling (from AI or user) */
  time_window?: 'any' | 'morning' | 'day' | 'evening' | null;
  /** Estimated minutes per session */
  time_estimate_minutes?: number | null;
};

export type FormatKind = 'plain' | 'checkboxes' | 'bullet';
export type PersonLink = { id: string; display: string } | null;
export type SentimentValue = 'pos' | 'neu' | 'neg'; // Simplified positive/neutral/negative for logs (not journal moods)
export type LogSubtypeOverride = 'journal' | 'idea' | 'general' | 'list' | 'event' | null;

/**
 * V2State - Complete overlay state for all entity types
 *
 * PERSISTED FIELDS (to Supabase via toCreateOrUpdateInput):
 * - baseType: Determines which table (habits/todos/notes)
 * - tags → tags column (JSON array)
 * - stickyTags/tagTombstones → tags_meta column (JSON object)
 * - mood → mood column (notes only)
 * - spaceId → space_id column
 * - format → fmt column (notes only)
 * - reminderAt → date column (notes) or reminders_json (todos/habits)
 * - commitment/commitmentNote/commitmentStartedAt → commitment columns
 * - logSubtypeOverride → subtype column (notes)
 * - logIsPrivate → views.private_journal (notes/journal)
 * - log.title/body → title/body columns (notes)
 * - todo.title/details/due_day/due_time → name/body/due_day/due_time columns
 * - habit.title/notes/frequency_json/subtype → name/notes/frequency_json/subtype columns
 *
 * NOT PERSISTED (UI-only):
 * - list: Runtime list items state
 * - detected: Runtime @mentions and date detection
 * - expanded: UI toggle state
 * - person: Linked via entity_people junction (separate flow)
 * - undoStack: UI-only undo history
 * - userEditedTitle/compactTitle/compactTitleSource: Internal title tracking
 */
export type V2State = {
  baseType: BaseType;
  tags: TagKey[];
  stickyTags: TagKey[];
  tagTombstones: TagKey[];
  mood?: SentimentValue | null;
  list?: { items: { id: string; text: string; checked: boolean }[] } | null;
  detected: { mentions: string[]; dates: string[] };
  // Phase 4 additions
  expanded: boolean;
  // undefined = never set (use fallback), null = explicitly cleared via "None", string = explicitly set
  spaceId: string | null | undefined;
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
  // UI-only: Checklist formatting mode (applies to log, todo, habit)
  isChecklistMode: boolean;
  // Key Dates: Link to an event note
  linkedEventId: string | null;
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
  spaceId: undefined, // undefined = never set, null = explicitly cleared
  person: null,
  format: 'plain',
  reminderAt: null,
  commitment: false,
  commitmentNote: '',
  commitmentStartedAt: null,
  compactTitle: '',
  compactTitleSource: '',
  userEditedTitle: false,
  log: { title: '', body: '', kind: 'basic', private: false, target_date: null, event_time: null },
  todo: {
    title: '',
    details: '',
    due_at: null,
    due_day: null,
    due_time: null,
    time_estimate_minutes: null,
    time_window: null,
    target_date: null,
    scheduled_date: null,
  },
  habit: {
    title: '',
    notes: '',
    schedule: 'custom',
    subtype: 'start_habit',
    start_date: null,
    end_date: null,
    time_window: null,
    time_estimate_minutes: null,
  },
  undoStack: [],
  logSubtypeOverride: null, // Phase L8: Manual log subtype override
  logIsPrivate: false, // Phase L9: Private flag for journal logs
  isChecklistMode: false, // UI-only: Checklist formatting mode
  linkedEventId: null, // Key Dates: Link to an event note
};



// helpers
export function firstLine(t: string) {
  return deriveCompactTitle([t ?? '']).compact;
}
