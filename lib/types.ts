/**
 * Core data types for Gremly Phase 4 with Supabase persistence.
 * Includes owner_id for multi-user support.
 */

import type { Mood } from './shared/moods';

export type ID = string;
export type RecordType = 'habit' | 'todo' | 'note';

/**
 * NoteSubtype - Database values for note.subtype column
 * - 'journal': personal reflections, diary entries
 * - 'idea': captured ideas, brainstorms
 * - 'catchall': general notes (maps to LogSubtype 'general' in UI)
 * - 'list': checklist-style notes (legacy, rarely used)
 * - 'reference': reference materials (legacy, rarely used)
 */
export type NoteSubtype = 'journal' | 'list' | 'catchall' | 'idea' | 'reference' | 'event';

export type CanonicalType = 'habit' | 'todo' | 'log' | 'unsorted';
export type LegacyCanonicalType = 'note' | 'journal';

/**
 * ClarificationType - Types of clarifications the AI can request from the user
 * - 'bucket': Which entity type (todo, habit, log)
 * - 'habit_or_todo': Specifically disambiguating between habit and todo
 * - 'date_type': Whether a date is a target date or scheduled date
 * - 'detail': Request for more details about the task
 * - 'intent': Clarify what the user wants to accomplish
 * - 'action': Clarify what action to take
 */
export type ClarificationType =
  | 'bucket'
  | 'habit_or_todo'
  | 'date_type'
  | 'detail'
  | 'intent'
  | 'action';

/**
 * ClarificationOption - A single option presented to the user for clarification
 */
export interface ClarificationOption {
  id: string;
  label: string;
  action: {
    bucket?: 'todo' | 'habit' | 'log';
    subtype?: string;
    target_date?: boolean;
    scheduled_date?: boolean;
  };
}

/**
 * ClarificationFields - Fields for tracking AI clarification state on entities
 * Mixed into Todo, Habit, and Note interfaces
 */
export interface ClarificationFields {
  needs_clarification?: boolean;
  clarification_type?: ClarificationType | null;
  clarification_question?: string | null;
  clarification_options?: ClarificationOption[] | null;
  clarification_resolved?: boolean;
}

/**
 * LogSubtype - UI-facing classification for Mind Drop
 * Maps to NoteSubtype for database persistence:
 * - 'journal' → 'journal'
 * - 'idea' → 'idea'
 * - 'general' → 'catchall'
 */
export type LogSubtype = 'journal' | 'idea' | 'general' | 'event';
export type HabitSubtype = 'start_habit' | 'break_habit' | 'routine';
export type Frequency = string; // Changed from strict enum to string - supports custom frequencies like "3x/week"
export type Cadence = 'daily' | 'weekly' | 'monthly';
export type EntityType = 'habit' | 'todo' | 'note' | 'space' | 'calendar_event';

export interface TagsMeta {
  sticky?: string[];
  tombstones?: string[];
}

/**
 * Habit - recurring activity tracked by user (tags stored as searchable, AI/editable JSON array)
 */
export interface Habit {
  id: ID;
  type: 'habit';
  name: string; // Changed from 'title' per Phase 7 spec
  frequency: Frequency;
  subtype: HabitSubtype; // Required: start_habit | break_habit | routine
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  archived_at?: string | null; // ISO 8601 timestamp when archived
  archived_reason?: string | null; // 'swept' | 'manual' | 'user_deleted_drop' | 'converted'
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | 'overlay' | 'goal_checkin' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    ai_pending?: boolean;
    ai_failed?: boolean;
    minddrop_stage?: 'pending' | 'classified' | 'prefilled' | 'multi_pending' | 'enriched';
    minddrop_prefilled_v1?: boolean;
    [key: string]: any;
  }; // JSONB field for UI state flags
  drop_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID; // Supabase user ID

  // Cadence tracking (Phase 10.10)
  cadence?: Cadence; // Defaults to 'daily' in DB
  target_per_period?: number;
  target_per_day?: number;
  days_active?: number[] | null; // Day numbers (0=Sunday, 1=Monday, ... 6=Saturday)
  last_completed_at?: string | null;
  last_checked_in_at?: string | null; // ISO 8601 - when user last reviewed this habit
  period_start_at?: string | null;

  /** Date when lock-in expires (ISO date string YYYY-MM-DD). Null means not locked in. */
  commitment_until?: string | null;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
  commitment_archived_at?: string | null;

  // Extended habit fields (Phase 7+)
  frequency_value?: any; // FrequencyValue JSON (daily, weekly, monthly, custom_days, n_per_period)
  reminders?: any[] | null; // ReminderRow[] JSON (nullable in DB)
  notes?: string | null;
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB
  tags_meta?: TagsMeta | null;
  buddy_id?: ID | null;
  buddy_email?: string | null;
  stack_with_id?: ID | null;
  stack_position?: 'before' | 'after' | null;
  stack_offset_minutes?: number | null;
  start_date?: string | null; // ISO date
  // Whether the user has confirmed when to start this habit
  // null/undefined start_date + start_date_confirmed: false → needs confirmation in Sweep
  // null/undefined start_date + start_date_confirmed: true → user chose "start immediately"
  // Non-null start_date → implicitly confirmed
  start_date_confirmed?: boolean;
  end_date?: string | null; // ISO date

  // Break habit specific fields
  taper_plan?: any | null; // TaperPlanState JSON
  triggers?: string[] | null;
  replacement_habit_id?: ID | null;
  replacement_text?: string | null;

  // Phase 12: Pinned items feature
  is_pinned?: boolean;

  // Morning Brief: locked-in items
  locked_in?: boolean;
  locked_in_at?: string | null;

  // Preferred time of day for scheduling
  time_window?: 'any' | 'morning' | 'day' | 'evening' | null;

  // Estimated minutes per session
  time_estimate_minutes?: number | null;

  // ═══════════════════════════════════════════════════════════════════
  // Clarifying Questions (Phase 2)
  // ═══════════════════════════════════════════════════════════════════

  /** True if AI couldn't confidently classify and needs user input */
  needs_clarification?: boolean;

  /** Type of clarification needed */
  clarification_type?: ClarificationType | null;

  /** Human-readable question to show user */
  clarification_question?: string | null;

  /** Options for user to choose from */
  clarification_options?: ClarificationOption[] | null;

  /** True once user has resolved the clarification */
  clarification_resolved?: boolean;

  /** Link to an event note (for items related to a key date) */
  linked_event_id?: ID | null;
}

/**
 * Todo - task with optional due date (tags stored as searchable, AI/editable JSON array)
 * undefined_due flag indicates if user explicitly left date undefined
 */
export interface Todo {
  id: ID;
  type: 'todo';
  name: string; // Changed from 'title' for consistency with habits
  title?: string; // Keep for backwards compatibility
  body?: string | null;
  space_id?: ID | null;
  due_date?: string | null; // ISO 8601 date or null
  due_day?: string | null; // YYYY-MM-DD format - canonical field for day-based logic
  due_time?: string | null; // HH:mm format or null
  time_estimate_minutes?: number | null; // Estimated minutes to complete
  reminders?: any[] | null; // ReminderRow[] JSON
  undefined_due?: boolean; // true if user wants "Might be today?" treatment (legacy)
  notes?: string | null; // Additional notes
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB
  subtype?: 'reminder' | 'microproject' | null; // AI-only, never set by front-end
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  archived_at?: string | null; // ISO 8601 timestamp when archived
  archived_reason?: string | null; // 'swept' | 'manual' | 'user_deleted_drop' | 'converted'
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | 'overlay' | 'goal_checkin' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    ai_pending?: boolean;
    ai_failed?: boolean;
    minddrop_stage?: 'pending' | 'classified' | 'prefilled' | 'multi_pending' | 'enriched';
    minddrop_prefilled_v1?: boolean;
    [key: string]: any;
  }; // JSONB field for UI state flags
  source_message_id?: string | null;
  // Make Actionable: reference to note this todo was created from
  source_note_id?: string | null;
  drop_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;

  commitment?: boolean;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
  commitment_archived_at?: string | null;

  tags_meta?: TagsMeta | null;

  // Phase 12: Pinned items feature
  is_pinned?: boolean;

  // Completion tracking (soft delete)
  completed_at?: string | null;

  // Sweep tracking
  skipped_in_sweep_at?: string | null;
  resurface_at?: string | null; // ISO date for "remind me later" resurface
  // Sweep reschedule tracking - counts how many times rescheduled via quick date buttons
  sweep_reschedule_count?: number;

  // Morning Brief: locked-in items
  locked_in?: boolean;
  locked_in_at?: string | null;

  // Preferred time of day for scheduling
  time_window?: 'any' | 'morning' | 'day' | 'evening' | null;

  // ═══════════════════════════════════════════════════════════════════
  // Date Intelligence (Phase 2)
  // ═══════════════════════════════════════════════════════════════════

  /** When something IS or is DUE - external, immovable deadline (e.g., "taxes due April 15") */
  target_date?: string | null; // YYYY-MM-DD

  /** When user plans to DO the work - internal, movable (e.g., "work on taxes Saturday") */
  scheduled_date?: string | null; // YYYY-MM-DD (synced with due_day via DB trigger)

  // ═══════════════════════════════════════════════════════════════════
  // Clarifying Questions (Phase 2)
  // ═══════════════════════════════════════════════════════════════════

  /** True if AI couldn't confidently classify and needs user input */
  needs_clarification?: boolean;

  /** Type of clarification needed */
  clarification_type?: ClarificationType | null;

  /** Human-readable question to show user */
  clarification_question?: string | null;

  /** Options for user to choose from */
  clarification_options?: ClarificationOption[] | null;

  /** True once user has resolved the clarification */
  clarification_resolved?: boolean;

  /** Link to an event note (for items related to a key date) */
  linked_event_id?: ID | null;
}

/**
 * Note - journal entry, list, or catch-all note (tags stored as searchable, AI/editable JSON array)
 * When subtype='journal', additional fields (mood, date, reminders, journal_subtype) are used
 * fmt and tags are used for all note types
 */
export interface Note {
  id: ID;
  type: 'note';
  title?: string | null;
  body?: string | null; // Required for creation, but nullable in DB
  subtype: NoteSubtype;
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  archived_at?: string | null; // ISO 8601 timestamp when archived
  archived_reason?: string | null; // 'swept' | 'manual' | 'user_deleted_drop' | 'converted'
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | 'overlay' | 'goal_checkin' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    ai_pending?: boolean;
    ai_failed?: boolean;
    minddrop_stage?: 'pending' | 'classified' | 'prefilled' | 'multi_pending' | 'enriched';
    minddrop_prefilled_v1?: boolean;
    [key: string]: any;
  }; // JSONB field for UI state flags
  source_message_id?: string | null;
  drop_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;

  // Note formatting and organization (Phase 7+) - used for all note types
  fmt?: 'bullets' | 'numbers' | 'checkboxes' | null; // Formatting style
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB

  // Journal-specific fields (Phase 7+) - only used when subtype='journal'
  date?: string | null; // ISO date for journal entry (may differ from created_at)
  mood?: Mood[] | null; // Multi-select mood array (uses shared/moods.ts)
  reminders?: any[] | null; // ReminderRow[] JSON for journal reminders
  journal_subtype?: 'reflection' | 'gratitude' | 'dream' | 'review' | null; // AI-only journal classification
  tags_meta?: TagsMeta | null;

  // Make Actionable feature fields
  is_favorite?: boolean;
  has_list?: boolean;
  list_items?: Array<{ id: string; text: string; checked: boolean }> | null;

  // Phase 12: Pinned items feature
  is_pinned?: boolean;

  // Sweep tracking
  skipped_in_sweep_at?: string | null;
  swept_at?: string | null; // ISO timestamp when note was reviewed in sweep ("Just Save")
  resurface_at?: string | null; // ISO date when note should reappear in sweep ("Remind Me")

  // ═══════════════════════════════════════════════════════════════════
  // Date Intelligence (Phase 2) - For events and reminders
  // ═══════════════════════════════════════════════════════════════════

  /** When the event IS (e.g., "Mom's birthday March 5", "dentist Tuesday 2pm") */
  target_date?: string | null; // YYYY-MM-DD

  /** For multi-day events - when the event ends */
  end_date?: string | null; // YYYY-MM-DD

  /** Specific time for events (e.g., "2pm" -> "14:00") */
  event_time?: string | null; // HH:mm format

  /** Whether this event note is a Space goal */
  is_goal?: boolean;

  /** When to surface a reminder about this note */
  reminder_date?: string | null; // YYYY-MM-DD

  /** Link to an event note (for items related to a key date) */
  linked_event_id?: ID | null;

  // ═══════════════════════════════════════════════════════════════════
  // Clarifying Questions (Phase 2)
  // ═══════════════════════════════════════════════════════════════════

  /** True if AI couldn't confidently classify and needs user input */
  needs_clarification?: boolean;

  /** Type of clarification needed */
  clarification_type?: ClarificationType | null;

  /** Human-readable question to show user */
  clarification_question?: string | null;

  /** Options for user to choose from */
  clarification_options?: ClarificationOption[] | null;

  /** True once user has resolved the clarification */
  clarification_resolved?: boolean;
}

/**
 * CalendarEvent - Quick-add calendar entries for Morning Brief
 * Separate from notes/todos - these are pure time blocks
 */
export interface CalendarEvent {
  id: ID;
  type: 'calendar_event';
  owner_id: ID;
  title: string;
  event_date: string; // YYYY-MM-DD
  event_time?: string | null; // HH:mm format
  duration_minutes?: number | null;
  source: 'user' | 'sync';
  space_id?: ID | null;
  notes?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/**
 * Discriminated union of all record types
 */
export type AppRecord = Habit | Todo | Note;

/**
 * Space - container for organizing Habits, Todos, and Notes
 * Phase 8+: Enhanced with icon, theme, summary caching, layout state, and archiving
 */
export interface Space {
  id: ID;
  owner_id: ID;
  name: string;
  icon?: string | null;
  theme?: 'deepTeal' | 'mint' | 'cream' | 'periwinkle' | null;
  mascot_id?: string | null; // Gremly mascot variant (e.g., 'astro', 'runner', 'journal')
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601

  // Phase 8+ Spaces v2 enhancements
  summary_cached?: string | null; // Cached AI-generated summary of space contents
  summary_updated_at?: string | null; // ISO 8601 timestamp of last summary update
  layout_state_json?: any | null; // JSON blob for saving UI layout state (collapsed sections, sort order, etc.)
  archived_at?: string | null; // ISO 8601 timestamp when space was archived (null = active)

  // Space Suggestions feature
  disable_suggestions?: boolean; // If true, nightly job skips this space for suggestions
}

/**
 * SpaceSuggestion - AI-generated suggestions for organizing unassigned items into Spaces
 * Generated nightly by the inngest-jobs worker
 */
export interface SpaceSuggestion {
  id: ID;
  user_id: ID;
  suggestion_type: 'assign_to_space' | 'new_space';
  space_id: ID | null; // For assign_to_space type - references existing space
  suggested_name: string | null; // For new_space type - proposed name
  reason: string | null; // AI-generated explanation for the suggestion
  drop_ids: ID[]; // Array of todo/note/habit IDs this suggestion applies to
  confidence: number; // 0.0 to 1.0 confidence score from AI
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  acted_on_at: string | null; // ISO 8601 - when user accepted/dismissed
}

/**
 * SpaceMilestone - goal/direction for a Space journey
 * Phase 12: Redesigned for "Spaces as dashboards for journeys"
 *
 * TRANSITION: Both `title` (legacy) and `name` (new) are supported.
 * New code should use `name`. Legacy code using `title` continues to work.
 */
export interface SpaceMilestone {
  id: ID;
  space_id: ID;
  owner_id: ID;
  // New field (Phase 12) - preferred
  name?: string;
  // Legacy field - kept for backward compatibility
  title?: string;
  // Now optional - direction without deadline is valid
  date: string | null;
  // Legacy field - kept for backward compatibility
  note?: string | null;
  // New fields (Phase 12)
  completed: boolean;
  completed_at: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * SpaceMeta - enrichment data for AI context
 * Stores user-defined success criteria and additional context
 */
export interface SpaceMeta {
  id: ID;
  space_id: ID;
  success_criteria: string | null;
  other_context: string | null;
  owner_id: ID;
  created_at: string;
  updated_at: string;
}

/**
 * SpaceWithContext - Space with milestone and meta data joined
 * Used for dashboard display and AI context building
 */
export interface SpaceWithContext extends Space {
  active_milestone: SpaceMilestone | null;
  milestones: SpaceMilestone[];
  meta: SpaceMeta | null;
}

/**
 * SpaceChat - Chat/thread within a space for notes, discussion, or context
 * Phase 8+ Spaces v2 feature
 */
export interface SpaceChat {
  id: ID;
  user_id: ID;
  space_id: ID;
  title: string;
  pinned: boolean;
  archived_at?: string | null; // ISO 8601 timestamp when chat was archived (null = active)
  last_message_snippet?: string | null; // Preview of last message
  running_summary?: string | null; // Rolling context summary
  context_json?: any | null; // Structured context data (ChatContextStructured)
  updated_at: string; // ISO 8601
  metadata_json?: any | null; // JSON blob for additional metadata
  created_at: string; // ISO 8601
}

/**
 * Input types for SpaceChat operations
 */
export interface SpaceChatCreateInput {
  title: string;
}

export interface SpaceChatUpdateInput {
  title?: string;
  pinned?: boolean;
  last_message_snippet?: string;
  running_summary?: string;
  context_json?: any;
  metadata_json?: any;
}

/**
 * SpaceChatMessage - Individual message within a space chat thread
 * Phase 10.5 feature
 * Phase 11.3: Added 'action-confirmation' role for inline action toasts
 * Phase 11.6: Added 'entry-card' role for showing created/retrieved entries
 * Phase 11.7+: Updated to support flexible role types with metadata
 */
export type MessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'action'
  | 'confirmation'
  | 'action-confirmation'
  | 'entry-card';

export interface SpaceChatMessage {
  id: ID;
  chat_id: ID;
  space_id: ID;
  user_id: ID;
  role: MessageRole;
  content: string;
  metadata_json?: {
    type?: 'action-confirmation' | 'entry-card' | 'multi-intent' | 'saved-item';
    actionType?: string;
    actionId?: string;
    entryId?: string;
    entityId?: string;
    entry?: any;
    entity?: any;
    entryType?: string;
    entityType?: string;
    title?: string;
    subtitle?: string;
    options?: any[];
    [key: string]: any;
  } | null;
  // Persisted saveable detection data (survives app restart)
  saveable_json?: {
    type: 'todo' | 'habit' | 'note';
    title: string;
    dismissed?: boolean;
    savedItemId?: string;
    savedItemType?: string;
  } | null;
  created_at: string; // ISO 8601

  // Saveable card data (attached to assistant messages) - local UI state
  saveable?: {
    type: 'todo' | 'habit' | 'note';
    title: string;
    content?: string;
    prefillData?: any;
    isSaving?: boolean; // True while save is in progress
    savedItemId?: string; // ID of the saved item (when status is 'saved')
    savedItemType?: 'habit' | 'todo' | 'log'; // Type of the saved item
  } | null;
  saveableDismissed?: boolean;
  // Streaming state
  isStreaming?: boolean;
  // Web search state
  isSearching?: boolean;
  searchQuery?: string | null;
  // URL fetch state
  isFetching?: boolean;
  fetchingUrl?: string | null;
  // Web search results
  sources?: Array<{ title: string; url: string }>;
  search_query?: string | null;
}

/**
 * Input type for SpaceChatMessage creation
 */
export interface SpaceChatMessageInsert {
  chat_id: ID;
  space_id: ID;
  role: MessageRole;
  content: string;
  metadata_json?: {
    type?: 'action-confirmation' | 'entry-card' | 'multi-intent' | 'saved-item';
    actionType?: string;
    actionId?: string;
    entryId?: string;
    entityId?: string;
    entry?: any;
    entity?: any;
    entryType?: string;
    entityType?: string;
    title?: string;
    subtitle?: string;
    options?: any[];
    [key: string]: any;
  } | null;
}

/**
 * Tag - organizing label for records
 */
export interface Tag {
  id: ID;
  owner_id: ID;
  name: string;
  color?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/**
 * TagMap - many-to-many relationship between tags and entities
 */
export interface TagMap {
  id: ID;
  tag_id: ID;
  entity_type: EntityType;
  entity_id: ID;
  owner_id: ID;
  created_at: string; // ISO 8601
}

/**
 * Person - contact for collaboration
 */
/**
 * PersonDate - Important date entry for a person (birthday, anniversary, etc.)
 */
export interface PersonDate {
  date: string; // ISO date (YYYY-MM-DD)
  label: 'birthday' | 'anniversary' | 'moving' | 'custom' | string;
}

/**
 * Person - Lightweight CRM contact
 * Phase 7+: Enhanced with dates, notes, reminders, and organization
 */
export interface Person {
  id: ID;
  owner_id: ID;
  display_name: string; // Primary name field
  name?: string; // Deprecated, kept for backwards compatibility
  email?: string | null;
  avatar?: string | null;

  // Phase 7+ enhancements
  dates?: PersonDate[] | null; // Important dates (birthdays, anniversaries, etc.)
  notes?: string | null; // Gift ideas, last connect notes, etc.
  notes_fmt?: 'bullets' | 'numbers' | 'checkboxes' | null; // Formatting style for notes
  reminders?: any[] | null; // ReminderRow[] for check-ins
  space_id?: ID | null; // Organize people by space/context
  tags?: string[] | null; // Categories/labels

  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/**
 * EntityPerson - many-to-many relationship between entities and people
 */
export interface EntityPerson {
  id: ID;
  person_id: ID;
  entity_type: EntityType;
  entity_id: ID;
  owner_id: ID;
  created_at: string; // ISO 8601
}

/**
 * Buddy system types (Phase 5+)
 */
export type BuddyStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface HabitBuddy {
  id: ID;
  habit_id: ID;
  owner_id: ID;
  buddy_user_id?: ID;
  invite_email?: string;
  status: BuddyStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Mascot emotion states for Phase 10.6
 * Controls visual feedback and animations during chat interactions
 */
export type MascotState = 'idle' | 'thinking' | 'replying' | 'playful' | 'celebration' | 'rest';

// ============================================================================
// MORNING BRIEF TYPES
// ============================================================================

/**
 * Sequenced item reference - stored in time block arrays
 */
export interface SequencedItem {
  id: ID;
  type: 'todo' | 'habit';
}

/**
 * Time blocks for Morning Brief sequencing
 */
export type TimeBlock = 'morning' | 'day' | 'evening' | 'whenever';

/**
 * DailyBrief - Daily intention-setting state
 * Stored in Supabase, synced via Zustand store
 */
export interface DailyBrief {
  id: ID;
  owner_id: ID;

  /** Date this brief applies to (YYYY-MM-DD format) */
  date: string;

  /** @deprecated Use locked_in field on todos/habits instead */
  one_thing_id: ID | null;
  /** @deprecated Use locked_in field on todos/habits instead */
  one_thing_type: 'todo' | 'habit' | null;

  /** Time block sequences */
  morning_sequence: SequencedItem[];
  day_sequence: SequencedItem[];
  evening_sequence: SequencedItem[];

  /** Timestamp when brief was completed (null = not completed) */
  completed_at: string | null;

  /** Habit IDs the user dismissed with "Not today" - hidden from Morning Brief for this day only */
  dismissed_habit_ids: string[];

  created_at: string;
  updated_at: string;
}

/**
 * Input type for creating/updating a brief
 */
export interface DailyBriefInput {
  /** @deprecated Use locked_in field on todos/habits instead */
  one_thing_id?: ID | null;
  /** @deprecated Use locked_in field on todos/habits instead */
  one_thing_type?: 'todo' | 'habit' | null;
  morning_sequence?: SequencedItem[];
  day_sequence?: SequencedItem[];
  evening_sequence?: SequencedItem[];
  completed_at?: string | null;
  /** Habit IDs dismissed with "Not today" - defaults to [] */
  dismissed_habit_ids?: string[];
  /** Target date in YYYY-MM-DD format. Defaults to today if not provided. */
  date?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Chat Types
// Types for chat functionality within entity overlays and sweep cards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single message in an entity chat conversation
 */
export interface EntityChatMessage {
  id: string; // UUID
  role: 'user' | 'assistant';
  content: string;
  created_at: string; // ISO timestamp
  metadata?: {
    preset_used?:
      | 'break_down'
      | 'research'
      | 'think_through'
      | 'whats_blocking'
      | 'action_steps'
      | 'expand'
      | 'setup'
      | 'why_skipping'
      | 'make_easier';
    is_contextual_opener?: boolean;
    has_saveable_content?: boolean;
    isStreaming?: boolean; // True for temp streaming message
    isSearching?: boolean; // True when web search is in progress
    searchQuery?: string | null; // The query being searched
    sources?: Array<{ title: string; url: string }>; // Web search sources
    images?: string[]; // Images from visual search
    search_query?: string | null; // The final search query used
  };
}

/**
 * A saved note from an entity chat conversation
 */
export interface EntityChatNote {
  id: string; // UUID
  content: string; // The saved note text
  is_checklist: boolean;
  checklist_items?: Array<{
    id: string;
    label: string;
    completed: boolean;
  }>;
  preamble?: string; // Text before first bullet (when converted to checklist)
  postamble?: string; // Text after last bullet (when converted to checklist)
  created_at: string;
  source_message_id: string; // Which assistant message this came from
  // Smart Save fields (optional - only present for Smart Save notes)
  note_type?: 'regular' | 'smart_save'; // Type of save
  linked_entity_id?: string; // ID of entity created via Smart Save
  linked_entity_type?: 'todo' | 'habit' | 'note'; // Type of entity created via Smart Save
}

/**
 * Full entity chat data structure (stored on entity)
 */
export interface EntityChatData {
  messages: EntityChatMessage[];
  message_count: number;
  last_message_at: string | null;
  notes: EntityChatNote[];
}

/**
 * Entity chat preset types
 */
export type EntityChatPreset =
  | 'break_down'
  | 'research'
  | 'think_through'
  | 'whats_blocking'
  | 'action_steps'
  | 'expand'
  | 'setup' // NEW: habit setup
  | 'why_skipping' // NEW: habit troubleshooting
  | 'make_easier'; // NEW: habit optimization

/**
 * Request payload for entity chat to Cortex
 */
export interface EntityChatRequest {
  type: 'entity-chat';
  stream?: boolean;
  userId?: string;
  entity: {
    id: string;
    type: 'todo' | 'habit' | 'note';
    title: string;
    body?: string;
    tags?: string[];
    due_date?: string;
    frequency?: string;
    time_estimate?: number;
    space_name?: string;
    created_at: string;
    times_swept?: number;
    days_since_created?: number;
    // Enriched fields
    subtype?: string;
    energy_type?: string;
    time_window?: string;
    notes?: string;
    commitment?: boolean;
    commitment_note?: string;
    triggers?: string[];
    replacement_text?: string;
    mood?: string[];
    is_favorite?: boolean;
  };
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  preset?: EntityChatPreset;
  sweepContext?: {
    times_moved: number;
    days_unscheduled: number;
    is_overdue: boolean;
  };
  accountCreatedAt?: string | null;
}

/**
 * Response from Cortex for entity chat
 */
export interface EntityChatResponse {
  content: string;
  saveable?: {
    detected: boolean;
    type: 'note' | 'checklist';
    checklist_items?: string[];
    has_save_suggestion?: boolean;
  };
  promotion?: {
    suggested: boolean;
    reason?: string;
  };
  /** Save suggestion payload from Cortex (if any) */
  save_suggestion?: any | null;
  latency_ms: number;
  /** Web search sources from Tavily (if web search was used) */
  sources?: Array<{ title: string; url: string }>;
  /** Images from web search (if visual query) */
  images?: string[];
  /** The search query used for web search (if web search was used) */
  search_query?: string;
  /** Fetched URL info from Tavily Extract (if URL was fetched) */
  fetchedUrl?: { url: string; title: string } | null;
}

/**
 * Helper functions
 */
export const nowIso = (): string => new Date().toISOString();

export const genId = (prefix = 'id'): ID =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

export interface HabitBuilderResolvedFields {
  name: string | null;
  habit_type: 'build' | 'break' | null;
  cadence: 'daily' | 'weekly' | 'monthly' | null;
  target: string | null;
  start_date: string | null;
  time_window: 'morning' | 'afternoon' | 'evening' | 'anytime' | null;
  space_name: string | null;
  notes: string | null;
  end_date: string | null;
  time_estimate_minutes: number | null;
  is_confirmation: boolean;
  next_field: string | null;
  required_count: number;
  suggested_chips: string[] | null;
}

export interface HabitBuilderContext {
  currentDate: string;
  dayOfWeek: string;
  userName?: string;
  existingHabits: {
    name: string;
    subtype: string;
    frequency?: string;
    space_name?: string;
  }[];
  spaces: { id: string; name: string }[];
  prefill?: string;
}

export interface HabitBuilderRequest {
  type: 'habit-builder';
  stream: boolean;
  messages: { role: 'user' | 'assistant'; content: string }[];
  context: HabitBuilderContext;
}

export interface HabitBuilderStreamingResponse {
  content: string;
  resolved_fields: HabitBuilderResolvedFields;
  latency_ms?: number;
  sources?: Array<{ title: string; url: string }>;
}

export interface HabitBuilderStreamingCallbacks {
  onDelta: (delta: string) => void;
  onComplete: (response: HabitBuilderStreamingResponse) => void;
  onError: (error: Error) => void;
  onSearching?: (query: string) => void;
}
