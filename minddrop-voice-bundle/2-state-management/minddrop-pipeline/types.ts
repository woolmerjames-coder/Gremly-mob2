/**
 * MindDrop Type Definitions
 *
 * Core types for the Mind Drop classification and enrichment system.
 */

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
