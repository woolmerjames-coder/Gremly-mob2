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

// ─────────────────────────────────────────────────────────────────────────
// Entity Kind
// ─────────────────────────────────────────────────────────────────────────

/**
 * Entity kinds that can appear in Sweep.
 * Note: 'habit' was removed - habits are no longer included in sweep candidates.
 */
export type SweepEntityKind = 'todo' | 'note';

// ─────────────────────────────────────────────────────────────────────────
// Raw DB Row Types (from Supabase generated types)
// ─────────────────────────────────────────────────────────────────────────

export type SweepTodoRow = Database['public']['Tables']['todos']['Row'];
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
  /** True if item's due_day (or due_date) is strictly before today (todos only) */
  isOverdue: boolean;
  /** True if item's due_day (or due_date) is exactly today (todos only) */
  isDueToday: boolean;
  /** True if item was created today */
  isCreatedToday: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-Specific Candidates
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepCandidateTodo extends SweepCandidateBase {
  kind: 'todo';
  /** Original database row */
  raw: SweepTodoRow;
}

export interface SweepCandidateNote extends SweepCandidateBase {
  kind: 'note';
  /** Original database row */
  raw: SweepNoteRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

export type SweepCandidate = SweepCandidateTodo | SweepCandidateNote;

// ─────────────────────────────────────────────────────────────────────────────
// Primary Action Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union for context-aware primary actions on Sweep cards.
 * Each type maps to a specific user intent based on item type and state.
 * Note: habit_review_plan was removed - habits are no longer in sweep.
 */
export type SweepPrimaryActionType =
  | 'todo_add_due_date'
  | 'todo_review_due_date'
  | 'log_idea_to_todo'
  | 'log_journal_followup'
  | 'log_general_decide';

/**
 * Configuration for the primary action button shown on a Sweep card.
 */
export interface SweepPrimaryActionConfig {
  type: SweepPrimaryActionType;
  label: string;
  icon: 'calendar' | 'todo' | 'journal' | 'more';
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary Action Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines the primary action configuration for a given Sweep candidate.
 *
 * Mapping rules:
 * - To-do with due date → 'todo_review_due_date' ("Review date")
 * - To-do without due date → 'todo_add_due_date' ("Add due date")
 * - Log – idea/actionable → 'log_idea_to_todo' ("Turn into to-do")
 * - Log – journal → 'log_journal_followup' ("Reflect more")
 * - Log – general/uncategorized → 'log_general_decide' ("Decide what this is")
 *
 * Note: Habits were removed from sweep candidates.
 *
 * @param candidate - The Sweep candidate to analyze
 * @returns Primary action config, or null if no action applies
 */
export function getPrimaryActionForCandidate(
  candidate: SweepCandidate,
): SweepPrimaryActionConfig | null {
  switch (candidate.kind) {
    case 'todo': {
      // Check if todo has a due date (due_day is the canonical field)
      const hasDueDate = !!candidate.raw.due_day || !!candidate.raw.due_date;
      if (hasDueDate) {
        return {
          type: 'todo_review_due_date',
          label: 'Review date',
          icon: 'calendar',
        };
      }
      return {
        type: 'todo_add_due_date',
        label: 'Add due date',
        icon: 'calendar',
      };
    }

    case 'note': {
      const { subtype, canonical_type, journal_subtype } = candidate.raw;

      // Journal detection: subtype='journal', canonical_type contains 'journal',
      // or journal_subtype is set
      const isJournal =
        subtype === 'journal' ||
        canonical_type === 'journal' ||
        (canonical_type && canonical_type.includes('journal')) ||
        !!journal_subtype;

      if (isJournal) {
        return {
          type: 'log_journal_followup',
          label: 'Reflect more',
          icon: 'journal',
        };
      }

      // Idea/actionable detection: subtype='idea' or canonical_type contains 'idea'
      const isIdea =
        subtype === 'idea' ||
        canonical_type === 'idea' ||
        (canonical_type && canonical_type.includes('idea'));

      if (isIdea) {
        return {
          type: 'log_idea_to_todo',
          label: 'Turn into to-do',
          icon: 'todo',
        };
      }

      // General/uncategorized log - catch-all for notes without clear categorization
      return {
        type: 'log_general_decide',
        label: 'Decide what this is',
        icon: 'more',
      };
    }

    default:
      return null;
  }
}
