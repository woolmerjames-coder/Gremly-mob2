// ============================================================
// Training System Types
// ============================================================

/**
 * IDs for all training checklist items.
 * These are the keys used in trainingItemsCompleted arrays
 * and throughout the training system.
 */
export type TrainingItemId =
  | 'drops'
  | 'sweeps'
  | 'briefs'
  | 'habits'
  | 'journals'
  | 'lock_ins'
  | 'entity_chat'
  | 'space'
  | 'calendar';

/**
 * Cumulative progress counts tracked during training.
 * Incremented locally on each action, reconciled from Supabase on launch.
 */
export interface TrainingProgress {
  drops: number;
  sweeps: number;
  briefs: number;
  habits: number;
  journals: number;
  lockIns: number;
  entityChats: number;
  spaces: number;
  calendarConnected: boolean;
}

/**
 * Training level definition (1, 2, or 3).
 */
export interface TrainingLevel {
  level: 1 | 2 | 3;
  title: string;
  items: TrainingItemId[];
}

/**
 * Configuration for a single training checklist item.
 */
export interface TrainingItemConfig {
  id: TrainingItemId;
  label: string;
  /** Short description shown in the expanded detail view */
  description: string;
  /** Number of completions needed to mark this item done */
  threshold: number;
  /** Which level this item belongs to */
  level: 1 | 2 | 3;
  /** Whether this item is required for graduation */
  required: boolean;
  /** Whether this item is tracked contextually (not shown as a main checklist item) */
  contextual: boolean;
  /** Lucide icon name for the checklist */
  iconName: string;
  /** CTA text for the detail view */
  ctaLabel: string;
  /** Navigation target when "Let's go" is tapped */
  navigateTo: string;
}

/**
 * Result of checking training progress against thresholds.
 */
export interface TrainingCheckResult {
  /** Items that just crossed their threshold this check */
  newlyCompleted: TrainingItemId[];
  /** New level to unlock (null if no change) */
  newLevel: 2 | 3 | null;
  /** Whether all required items are complete */
  shouldGraduate: boolean;
}

/**
 * Friendly progress label for a training item.
 * Used instead of raw numbers to avoid overwhelming users.
 */
export type ProgressStage =
  | 'not_started'
  | 'just_started'
  | 'getting_there'
  | 'almost_there'
  | 'complete';

export const EMPTY_TRAINING_PROGRESS: TrainingProgress = {
  drops: 0,
  sweeps: 0,
  briefs: 0,
  habits: 0,
  journals: 0,
  lockIns: 0,
  entityChats: 0,
  spaces: 0,
  calendarConnected: false,
};
