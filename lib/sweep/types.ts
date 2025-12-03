/**
 * Sweep Feature - Core Domain Types
 *
 * This file defines the type system for the Evening Sweep feature.
 * No fetching or DB logic here – purely types.
 *
 * Usage:
 * - SweepCandidate is the union type for items that can appear in Sweep
 * - Use the `kind` discriminant to narrow the type
 * - Access the original DB row via the `raw` property
 */

import type { Database } from '../../types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Entity Kind
// ─────────────────────────────────────────────────────────────────────────────

export type SweepEntityKind = 'todo' | 'habit' | 'note';

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB Row Types (from Supabase generated types)
// ─────────────────────────────────────────────────────────────────────────────

export type SweepTodoRow = Database['public']['Tables']['todos']['Row'];
export type SweepHabitRow = Database['public']['Tables']['habits']['Row'];
export type SweepNoteRow = Database['public']['Tables']['notes']['Row'];

// ─────────────────────────────────────────────────────────────────────────────
// Normalized Base Type
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepCandidateBase {
  /** Unique identifier (from DB) */
  id: string;
  /** Discriminant for type narrowing */
  kind: SweepEntityKind;
  /** ISO timestamp when the item was created */
  createdAt: string;
  /** Mind Drop identifier for tracing origin */
  dropId?: string | null;
  /** ISO timestamp when this item was last skipped in Sweep */
  skippedInSweepAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-Specific Candidates
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepCandidateTodo extends SweepCandidateBase {
  kind: 'todo';
  /** Original database row */
  raw: SweepTodoRow;
}

export interface SweepCandidateHabit extends SweepCandidateBase {
  kind: 'habit';
  /** Original database row */
  raw: SweepHabitRow;
}

export interface SweepCandidateNote extends SweepCandidateBase {
  kind: 'note';
  /** Original database row */
  raw: SweepNoteRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

export type SweepCandidate = SweepCandidateTodo | SweepCandidateHabit | SweepCandidateNote;
