/**
 * Core data types for Gremly Phase 4 with Supabase persistence.
 * Includes owner_id for multi-user support.
 */

export type ID = string;
export type RecordType = 'habit' | 'todo' | 'note';
export type NoteSubtype = 'journal' | 'list' | 'catchall' | 'idea' | 'reference';
export type CanonicalType = 'habit' | 'todo' | 'log' | 'unsorted';
export type LegacyCanonicalType = 'note' | 'journal';
export type LogSubtype = 'journal' | 'idea' | 'person' | 'list' | 'everything_else';
export type HabitSubtype = 'start_habit' | 'break_habit' | 'routine';
export type Frequency = string; // Changed from strict enum to string - supports custom frequencies like "3x/week"
export type Cadence = 'daily' | 'weekly' | 'monthly';
export type EntityType = 'habit' | 'todo' | 'note' | 'space';

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
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  source_message_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID; // Supabase user ID

  // Cadence tracking (Phase 10.10)
  cadence?: Cadence; // Defaults to 'daily' in DB
  target_per_period?: number;
  target_per_day?: number;
  days_active?: string[] | null;
  last_completed_at?: string | null;
  period_start_at?: string | null;

  commitment?: boolean;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
  commitment_archived_at?: string | null;

  // Extended habit fields (Phase 7+)
  frequency_value?: any; // FrequencyValue JSON (daily, weekly, monthly, custom_days, n_per_period)
  reminders?: any[] | null; // ReminderRow[] JSON (nullable in DB)
  notes?: string | null;
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB
  buddy_id?: ID | null;
  buddy_email?: string | null;
  stack_with_id?: ID | null;
  stack_position?: 'before' | 'after' | null;
  stack_offset_minutes?: number | null;
  start_date?: string | null; // ISO date
  end_date?: string | null; // ISO date

  // Break habit specific fields
  taper_plan?: any | null; // TaperPlanState JSON
  triggers?: string[] | null;
  replacement_habit_id?: ID | null;
  replacement_text?: string | null;
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
  due_time?: string | null; // HH:mm format or null
  reminders?: any[] | null; // ReminderRow[] JSON
  undefined_due?: boolean; // true if user wants "Might be today?" treatment (legacy)
  notes?: string | null; // Additional notes
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB
  subtype?: 'reminder' | 'microproject' | null; // AI-only, never set by front-end
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  source_message_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;

  commitment?: boolean;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
  commitment_archived_at?: string | null;
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
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  source_message_id?: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;

  // Note formatting and organization (Phase 7+) - used for all note types
  fmt?: 'bullets' | 'numbers' | 'checkboxes' | null; // Formatting style
  tags?: string[] | null; // Searchable, AI-editable JSON array persisted in DB

  // Journal-specific fields (Phase 7+) - only used when subtype='journal'
  date?: string | null; // ISO date for journal entry (may differ from created_at)
  mood?: 'ecstatic' | 'happy' | 'neutral' | 'low' | 'sad' | 'tired' | null;
  reminders?: any[] | null; // ReminderRow[] JSON for journal reminders
  journal_subtype?: 'reflection' | 'gratitude' | 'dream' | 'review' | null; // AI-only journal classification
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
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601

  // Phase 8+ Spaces v2 enhancements
  summary_cached?: string | null; // Cached AI-generated summary of space contents
  summary_updated_at?: string | null; // ISO 8601 timestamp of last summary update
  layout_state_json?: any | null; // JSON blob for saving UI layout state (collapsed sections, sort order, etc.)
  archived_at?: string | null; // ISO 8601 timestamp when space was archived (null = active)
}

/**
 * SpaceMilestone - user-authored milestone/event for a space timeline
 */
export interface SpaceMilestone {
  id: ID;
  owner_id: ID;
  space_id: ID;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  note?: string | null;
  created_at: string; // ISO 8601
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
    type?: 'action-confirmation' | 'entry-card' | 'multi-intent';
    actionType?: string;
    actionId?: string;
    entryId?: string;
    entry?: any;
    entryType?: string;
    options?: any[];
    [key: string]: any;
  } | null;
  created_at: string; // ISO 8601
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
    type?: 'action-confirmation' | 'entry-card' | 'multi-intent';
    actionType?: string;
    actionId?: string;
    entryId?: string;
    entry?: any;
    entryType?: string;
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

/**
 * Helper functions
 */
export const nowIso = (): string => new Date().toISOString();

export const genId = (prefix = 'id'): ID =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
