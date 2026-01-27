/**
 * MindDrop Type Definitions
 *
 * Core types for the Mind Drop classification and enrichment system.
 */

import type { HabitSubtype } from '../types';

/**
 * The bucket/category a mind drop is classified into.
 * - 'todo': Actionable tasks with optional due dates and time estimates
 * - 'habit': Recurring behaviors to track
 * - 'log': Journal entries, ideas, or general notes
 */
export type MindDropBucket = 'todo' | 'habit' | 'log';

/**
 * The processing stage of a mind drop item.
 * - 'pending': Initial state, awaiting classification
 * - 'classified': Bucket determined, basic fields set
 * - 'enriching': AI enrichment in progress (tags, time estimates, etc.)
 * - 'enriched': AI enrichment complete
 * - 'enrichment_failed': AI enrichment failed, item still usable with basic fields
 */
export type MindDropStage =
  | 'pending'
  | 'classified'
  | 'enriching'
  | 'enriched'
  | 'enrichment_failed';

/**
 * Subtype for log bucket items.
 * - 'journal': Personal reflections, diary-style entries
 * - 'idea': Creative thoughts, brainstorms, concepts to explore
 * - 'general': General notes that don't fit other categories
 */
export type LogSubtype = 'journal' | 'idea' | 'general';

/**
 * A fully processed mind drop item stored in the system.
 * Represents items that have been classified and potentially enriched.
 */
export interface MindDropItem {
  /** Unique identifier for the item */
  id: string;

  /** Client-generated ID used for optimistic updates and deduplication */
  dropId: string;

  /** The classified bucket/category */
  bucket: MindDropBucket;

  /** Subtype for log items (null for todos and habits) */
  subtype: LogSubtype | null;

  /** The original text entered by the user */
  originalText: string;

  /** Processed/cleaned title for display */
  title: string;

  /** AI-extracted or user-assigned tags */
  tags: string[];

  /** Estimated time to complete in minutes (todos only) */
  timeEstimateMinutes: number | null;

  /** Due date/time as ISO string (todos only) */
  dueAt: string | null;

  /** Extracted people/names mentioned */
  people: string[];

  /** Current processing stage */
  stage: MindDropStage;

  /** When the item was created (ISO string) */
  createdAt: string;

  /** When the item was last updated (ISO string) */
  updatedAt: string;

  /** Associated space ID (null if in global/catch-all) */
  spaceId: string | null;

  /** True if this is an optimistic/local-only item not yet persisted */
  isOptimistic: boolean;

  /** True if AI enrichment failed for this item */
  aiFailed: boolean;

  /** True if photo processing failed for this item */
  photosFailed: boolean;
}

/**
 * A pending item awaiting full classification.
 * Represents the initial state before AI processing completes.
 */
export interface PendingItem {
  /** Client-generated ID for tracking and deduplication */
  dropId: string;

  /** The raw text entered by the user */
  text: string;

  /** Quick heuristic prediction of bucket (may change after AI) */
  predictedBucket: MindDropBucket;

  /** Quick heuristic prediction of subtype (for logs) */
  predictedSubtype: LogSubtype | null;

  /** When the pending item was created (ISO string) */
  createdAt: string;

  /** Associated space ID (null if in global/catch-all) */
  spaceId: string | null;
}

/**
 * A single item extracted from a multi-entity mind drop.
 * Represents one of potentially several items parsed from a compound input.
 */
export interface MultiDropItem {
  /** The extracted text segment for this item */
  text: string;

  /** The classified bucket/category */
  bucket: MindDropBucket;

  /** Subtype for log items (null for todos and habits) */
  subtype: LogSubtype | null;

  /** Subtype for habit items: 'start_habit' | 'break_habit' | null */
  habitSubtype: HabitSubtype | null;

  /** AI-generated 3-5 word preview title (from Phase 0, may be raw text) */
  preview_title: string;

  /** Smart title from Phase 1 classification (properly formatted) */
  smart_title?: string | null;

  /** Confirmation message from Phase 1 classification */
  confirmation_message?: string | null;
}

/**
 * Result from Phase 1 classification.
 * Determines the bucket, subtype, and confidence of a mind drop.
 * Supports both single-entity and multi-entity responses.
 */
export interface Phase1Result {
  /** The classified bucket/category */
  bucket: MindDropBucket;

  /** Subtype for log items (null for todos and habits) */
  subtype: LogSubtype | null;

  /** Habit subtype: 'start_habit' (build) or 'break_habit' (break) */
  habitSubtype: HabitSubtype | null;

  /** Classification confidence score (0-1) */
  confidence: number;

  /** Source of the classification */
  source: 'heuristic' | 'api' | 'heuristic-confirmed' | 'heuristic-fallback';

  /** True if multiple items were detected in the input */
  is_multi: boolean;

  /** Array of parsed items when is_multi is true */
  items?: MultiDropItem[];

  /** Combined title for multi-entity drops (e.g., "Groceries + Running Habit") */
  summary_title?: string;

  /** Early smart title from Phase 1 (enables faster typewriter animation) */
  smart_title?: string | null;

  /** Early confirmation message from Phase 1 (enables faster typewriter animation) */
  confirmation_message?: string | null;

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Clarification fields (when bucket confidence < threshold)
  // ──────────────────────────────────────────────────────────────────────────

  /** True if AI needs user to disambiguate the intent */
  needs_clarification?: boolean;

  /** Type of clarification needed */
  clarification_type?: 'bucket' | 'date' | 'social_plan' | null;

  /** Question to present to the user */
  clarification_question?: string | null;

  /** Available options for the user to choose from */
  clarification_options?: Array<{
    id: string;
    label: string;
    action: {
      bucket?: 'todo' | 'habit' | 'log';
      subtype?: string | null;
      target_date?: boolean;
      scheduled_date?: boolean;
    };
  }> | null;
}
