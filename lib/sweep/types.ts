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
 * Includes habits that need start date confirmation.
 */
export type SweepEntityKind = 'todo' | 'note' | 'habit';

// ─────────────────────────────────────────────────────────────────────────
// Raw DB Row Types (from Supabase generated types)
// ─────────────────────────────────────────────────────────────────────────

export type SweepTodoRow = Database['public']['Tables']['todos']['Row'];
export type SweepNoteRow = Database['public']['Tables']['notes']['Row'];
export type SweepHabitRow = Database['public']['Tables']['habits']['Row'];

// ─────────────────────────────────────────────────────────────────────────────
// Attachment Type (matches log_photos table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attachment for sweep candidates (photos from log_photos table).
 * This matches the shape returned by IRepo.listLogPhotos.
 */
export interface SweepAttachment {
  /** Unique identifier for the attachment */
  id: string;
  /** URL to the attachment image */
  url: string;
  /** Position/order of the attachment */
  position: number;
}

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
  /** True if item's due date is strictly before today (todos: due_day/scheduled_date, notes: target_date) */
  isOverdue: boolean;
  /** True if item's due date is exactly today (todos: due_day/scheduled_date, notes: target_date) */
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
  /** Photo attachments for this note (from log_photos table) */
  attachments?: SweepAttachment[];

  // ─────────────────────────────────────────────────────────────────────
  // Date Intelligence Fields (Phase C)
  // ─────────────────────────────────────────────────────────────────────

  /** Event date for this note (YYYY-MM-DD) - e.g., "Mom's birthday March 5" */
  targetDate?: string | null;

  /** Event time if specified */
  eventTime?: string | null;

  /** Date when this note should resurface in sweep (YYYY-MM-DD) - user set a reminder */
  resurfaceAt?: string | null;

  /** True if target_date equals today */
  isEventToday: boolean;

  /** True if target_date is before today (event has passed) */
  isEventPassed: boolean;

  /** Days until event (negative if passed), null if no target_date */
  daysUntilEvent: number | null;
}

export interface SweepCandidateHabit extends SweepCandidateBase {
  kind: 'habit';
  /** Original database row */
  raw: SweepHabitRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

export type SweepCandidate = SweepCandidateTodo | SweepCandidateNote | SweepCandidateHabit;

// ─────────────────────────────────────────────────────────────────────────────
// Sweep Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Individual item detail for the sweep summary screen.
 */
export interface SweepSummaryItem {
  id: string;
  name: string;
  /** What happened to this item */
  outcome:
    | 'scheduled'
    | 'saved'
    | 'kept'
    | 'cleared'
    | 'archived'
    | 'logged'
    | 'skipped'
    | 'remind'
    | 'removed';
  /** For scheduled items, the date it was scheduled to */
  scheduledDate?: string;
}

/**
 * Summary of actions taken during a Sweep session.
 * Note: 'skipped' was removed from counts - we no longer track skipped items in the summary.
 */
export interface SweepSummary {
  kept: number;
  cleared: number;
  /** Detailed breakdown by item type for the expandable summary */
  items?: {
    todos: SweepSummaryItem[];
    thoughts: SweepSummaryItem[]; // notes/logs
    habits: SweepSummaryItem[];
  };
  /** Whether Gremly aged up during this sweep session */
  didAgeUp?: boolean;
  /** Gremly's final age after this sweep session */
  finalAge?: number;
}

/**
 * Computed display metadata for a Sweep card.
 * Pre-computed from SweepCandidate + Space data for rendering.
 */
export interface SweepCardMeta {
  /** Type chip label: 'Todo', 'Note', or 'Habit' */
  typeChip: 'Todo' | 'Note' | 'Habit';

  /** Status chip for todos: scheduling state */
  todoStatus: 'unscheduled' | 'due_today' | 'due_tomorrow' | 'overdue' | 'reminder' | null;

  /** Status chip for logs: subtype */
  logSubtype: 'idea' | 'general' | 'journal' | null;

  /** Status chip for habits: needs start date confirmation */
  habitStatus: 'needs_start_date' | null;

  /** True if this is the first time in Sweep (never skipped) */
  isNew: boolean;

  /** Formatted date string if resurfacing, e.g. "Dec 8" */
  resurfacingDate: string | null;

  /** Space name if assigned */
  spaceName: string | null;

  /** Space ID if assigned */
  spaceId: string | null;

  /** Primary World pill: AI-derived life domain. Separate dimension from space. */
  world?: { name: string; accentColor: string; extraCount: number };

  /** True if commitment === true (locked-in item) */
  isLockedIn: boolean;

  /** Gremly's contextual response message */
  gremlyResponse: string;

  /** Number of times this todo has been rescheduled in Sweep (0 for notes) */
  rescheduleCount: number;

  /** Note subtype for card variant selection: 'idea' | 'general' | 'event' | null */
  noteCardType?: 'idea' | 'general' | 'event' | null;

  /** For notes that have been resurfaced before: formatted date string e.g. "Mar 12" */
  resurfacedFromDate?: string | null;

  /** For event notes: the target date as YYYY-MM-DD string */
  eventDate?: string | null;

  /** For event notes: formatted display date e.g. "Saturday, April 12" */
  eventDateFormatted?: string | null;

  /** For event notes: number of days until event (negative if passed) */
  daysUntilEvent?: number | null;

  /** Resurface count from database (how many times this note has been resurfaced) */
  resurfaceCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary Action Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union for context-aware primary actions on Sweep cards.
 * Each type maps to a specific user intent based on item type and state.
 */
export type SweepPrimaryActionType =
  | 'todo_add_due_date'
  | 'todo_review_due_date'
  | 'log_idea_to_todo'
  | 'log_journal_followup'
  | 'log_general_decide'
  | 'habit_set_start_date';

/**
 * Configuration for the primary action button shown on a Sweep card.
 */
export interface SweepPrimaryActionConfig {
  type: SweepPrimaryActionType;
  label: string;
  icon: 'calendar' | 'todo' | 'journal' | 'more' | 'habit';
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
