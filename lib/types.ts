/**
 * Core, stable app types used across UI and data layers.
 * Phase 3 scope: Habit | Todo | Note (journal | list | catchall) + shared fields.
 * Also includes Habit Buddy types as interfaces only (no logic yet).
 */

export type ID = string;

export type RecordType = 'habit' | 'todo' | 'note';
export type NoteSubtype = 'journal' | 'list' | 'catchall';

export interface BaseRecord {
  id: ID;
  type: RecordType;
  title: string;
  body?: string;
  spaceId?: ID | null;
  dueDate?: string | null; // ISO 8601 or null
  frequency?: 'daily' | 'weekly' | 'monthly' | null;
  aiPlaced?: boolean; // set true when Cortex made an assisted guess
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface Habit extends BaseRecord {
  type: 'habit';
  frequency: 'daily' | 'weekly' | 'monthly'; // required for habits
  body?: string; // optional description
}

export interface Todo extends BaseRecord {
  type: 'todo';
  // if dueDate is undefined or null, Today screen may surface it under "Might be today?"
}

export interface Note extends BaseRecord {
  type: 'note';
  subtype: NoteSubtype;
  body: string; // notes always carry body text
}

export type AppRecord = Habit | Todo | Note;

// --- Buddy (types only; no logic yet) ---
export type BuddyStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface HabitBuddy {
  id: ID;
  habitId: ID;
  ownerId: ID;
  buddyUserId?: ID;
  inviteEmail?: string;
  status: BuddyStatus;
  createdAt: string;
  updatedAt: string;
}

// Small helper to create ISO timestamps
export const nowIso = () => new Date().toISOString();

// Small helper to generate local IDs for memory repo (not for production)
export const genId = (prefix = 'id'): ID =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
