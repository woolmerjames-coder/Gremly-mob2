/**
 * Core data types for Gremly Phase 4 with Supabase persistence.
 * Includes owner_id for multi-user support.
 */

export type ID = string;
export type RecordType = 'habit' | 'todo' | 'note';
export type NoteSubtype = 'journal' | 'list' | 'catchall' | 'idea' | 'reference';
export type Frequency = 'daily' | 'weekly' | 'monthly';
export type EntityType = 'habit' | 'todo' | 'note' | 'space';

/**
 * Habit - recurring activity tracked by user
 */
export interface Habit {
  id: ID;
  type: 'habit';
  title: string;
  frequency: Frequency;
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  why_string?: string | null;
  origin?: 'catchall' | null;
  canonicalType?: 'note' | 'todo' | 'habit' | 'journal';
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID; // Supabase user ID
}

/**
 * Todo - task with optional due date
 * undefined_due flag indicates if user explicitly left date undefined
 */
export interface Todo {
  id: ID;
  type: 'todo';
  title: string;
  body?: string | null;
  space_id?: ID | null;
  due_date?: string | null; // ISO 8601 or null
  undefined_due: boolean; // true if user wants "Might be today?" treatment
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  why_string?: string | null;
  origin?: 'catchall' | null;
  canonicalType?: 'note' | 'todo' | 'habit' | 'journal';
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;
}

/**
 * Note - journal entry, list, or catch-all note
 */
export interface Note {
  id: ID;
  type: 'note';
  title?: string | null;
  body?: string | null;
  subtype: NoteSubtype;
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean; // true when converted to another type
  why_string?: string | null;
  origin?: 'catchall' | null;
  canonicalType?: 'note' | 'todo' | 'habit' | 'journal';
  labels?: string[];
  views?: {
    alsoShowIn?: string[];
  };
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  owner_id: ID;
}

/**
 * Discriminated union of all record types
 */
export type AppRecord = Habit | Todo | Note;

/**
 * Space - container for organizing Habits, Todos, and Notes
 */
export interface Space {
  id: ID;
  owner_id: ID;
  name: string;
  icon?: string | null;
  theme?: 'deepTeal' | 'mint' | 'cream' | 'periwinkle' | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
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
export interface Person {
  id: ID;
  owner_id: ID;
  name: string;
  email?: string | null;
  avatar?: string | null;
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
 * Helper functions
 */
export const nowIso = (): string => new Date().toISOString();

export const genId = (prefix = 'id'): ID =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
