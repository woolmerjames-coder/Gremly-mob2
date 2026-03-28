import { nowTimestamp } from '../date/DateService';

/**
 * Types and constants for the saveable detection system.
 *
 * This module defines the data structures used to detect, classify,
 * and prefill saveable content from Space Chat conversations.
 */

// ============================================================================
// Entity Types
// ============================================================================

/**
 * The types of entities that can be saved from a conversation.
 *
 * - 'log-general': General notes, thoughts, reflections
 * - 'log-idea': Creative ideas, brainstorms, inspirations
 * - 'log-journal': Time-anchored journal entries, reflections
 * - 'todo': Actionable tasks with optional due dates
 * - 'habit': Recurring behaviors to track
 */
export type SaveableType = 'log-general' | 'log-idea' | 'log-journal' | 'todo' | 'habit';

/**
 * Subtype for habit entities.
 * - 'start_habit': Building a new positive behavior
 * - 'break_habit': Stopping an unwanted behavior
 */
export type HabitSubtype = 'start_habit' | 'break_habit';

/**
 * Subtype for log entities.
 * - 'general': General notes, thoughts
 * - 'idea': Creative ideas, brainstorms
 * - 'journal': Time-anchored reflections
 */
export type LogSubtype = 'general' | 'idea' | 'journal';

/**
 * Frequency options for habit tracking.
 *
 * - 'daily': Every day
 * - 'weekly': Once per week
 * - 'weekdays': Monday through Friday
 * - 'weekends': Saturday and Sunday
 * - 'monthly': Once per month
 * - 'custom': User-defined frequency
 * - null: No frequency specified (not a habit)
 */
export type HabitFrequency =
  | 'daily'
  | 'weekly'
  | 'weekdays'
  | 'weekends'
  | 'monthly'
  | 'custom'
  | null;

// ============================================================================
// Prefill Data
// ============================================================================

/**
 * Data to prefill the save overlay when the user taps Save.
 *
 * This allows the user to review and edit before actually saving,
 * while reducing friction by pre-populating fields.
 */
export interface SaveablePrefill {
  /**
   * Short summary of the content, 5-10 words.
   * Used as the title for todos, habits, or log entries.
   */
  title: string;

  /**
   * The relevant content to save.
   * May be extracted or summarized from the conversation.
   */
  content: string;

  /**
   * 1-3 relevant tags for categorization.
   * Should be lowercase, no special characters.
   */
  tags: string[];

  /**
   * Frequency for habits. Only populated when suggestedType is 'habit'.
   */
  frequency?: HabitFrequency;

  /**
   * Frequency value for habits (count for "N times a week").
   * Only populated when suggestedType is 'habit'.
   */
  frequencyValue?: number;

  /**
   * Subtype for habits (start_habit vs break_habit).
   * Only populated when suggestedType is 'habit'.
   */
  habitSubtype?: HabitSubtype;

  /**
   * Whether the content contains a list/checklist.
   * When true, the overlay should render list UI.
   */
  hasList?: boolean;

  /**
   * Due date for todos. Only populated when suggestedType is 'todo'.
   * ISO 8601 date string (e.g., "2025-12-15") or null if no due date.
   */
  dueDate?: string | null;

  /**
   * Steps/subtasks for todos.
   * When provided, these become checklist items on the saved todo.
   */
  steps?: string[];
}

// ============================================================================
// Detection Results
// ============================================================================

/**
 * The output of the saveable detection system.
 *
 * This is produced by analyzing an assistant message and determining
 * whether it contains content worth saving.
 */
export interface SaveableResult {
  /**
   * Whether this content is worth saving.
   * True if confidence >= threshold for the suggested type.
   */
  isSaveable: boolean;

  /**
   * Confidence score from 0 to 1.
   * Higher values indicate stronger signals that content is saveable.
   */
  confidence: number;

  /**
   * The suggested entity type for this content.
   * Used to determine which overlay to show and how to prefill.
   */
  suggestedType: SaveableType;

  /**
   * Prefilled data for the save overlay.
   * Populated even if isSaveable is false, for explicit save requests.
   */
  prefill: SaveablePrefill;

  /**
   * Brief explanation of why this was detected as saveable.
   * Used for debugging and logging, not shown to users.
   */
  reasoning?: string;

  /**
   * ISO timestamp when detection was performed.
   */
  detectedAt: string;

  /**
   * ID of the assistant message that was analyzed.
   * Used to track which messages have been processed.
   */
  messageId: string;
}

// ============================================================================
// Space Chat Save Result
// ============================================================================

/**
 * Response from on-tap classification when user saves from Space Chat.
 * This is the result of analyzing the conversation to determine
 * what type of entity to create.
 */
export interface SpaceChatSaveResult {
  /**
   * The base entity type to create.
   */
  type: 'habit' | 'todo' | 'log';

  /**
   * Subtype for the entity.
   * - For habits: 'start_habit' | 'break_habit'
   * - For logs: 'general' | 'idea' | 'journal'
   * - For todos: null
   */
  subtype: HabitSubtype | LogSubtype | null;

  /**
   * Confidence score from 0 to 1.
   */
  confidence: number;

  /**
   * Short title for the entity.
   */
  title: string;

  /**
   * Extracted tags for categorization.
   */
  tags: string[];

  /**
   * Frequency for habits. Only populated for habit type.
   */
  frequency?: string | null;

  /**
   * Estimated time in minutes for todos.
   */
  timeEstimateMinutes?: number | null;

  /**
   * Whether the content contains a list/checklist.
   */
  hasList?: boolean;
}

// ============================================================================
// Detection Input
// ============================================================================

/**
 * Input to the saveable detection system.
 *
 * Provides all the context needed to analyze whether an assistant
 * message contains saveable content.
 */
export interface SaveableDetectionInput {
  /**
   * The assistant's response to analyze.
   * This is the primary content being evaluated for saveability.
   */
  assistantMessage: string;

  /**
   * The user's message that triggered the assistant response.
   * Provides context about user intent.
   */
  userMessage: string;

  /**
   * Optional rolling summary of the conversation so far.
   * Helps understand context for better detection.
   */
  conversationContext?: string;

  /**
   * Last few conversation turns for immediate context.
   * Typically 2-4 recent exchanges.
   */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /**
   * Space ID for context-aware detection.
   * May influence what types of content are considered saveable.
   */
  spaceId?: string;

  /**
   * Space name for prefilling tags or context.
   */
  spaceName?: string;
}

// ============================================================================
// Threshold Constants
// ============================================================================

/**
 * Confidence thresholds for automatic saveable detection.
 *
 * These thresholds are used when the system proactively suggests
 * saving content. They are intentionally high to avoid false positives
 * and user annoyance.
 */
export const SAVEABLE_THRESHOLDS = {
  /**
   * Minimum confidence to show the Save button at all.
   * Below this, no save option is presented.
   */
  FLOOR: 0.6,

  /**
   * Confidence required to suggest 'todo' type.
   * Lowered from 0.92 → 0.85 → 0.75 - the AI detection is reliable
   * and higher thresholds were causing valid todos to be downgraded.
   */
  TODO: 0.75,

  /**
   * Confidence required to suggest 'habit' type.
   * Lowered from 0.9 to 0.75 - the AI detection is reliable
   * and 0.9 was causing valid habits to be downgraded.
   * Note: habits also require frequency detection to pass.
   */
  HABIT: 0.75,

  /**
   * Default entity type when confidence is above floor
   * but below specific type thresholds.
   */
  DEFAULT_TYPE: 'log-general' as const,
} as const;

/**
 * Relaxed thresholds when the user explicitly asks to save.
 *
 * When the user expresses intent to save (e.g., "save this",
 * "add this to my list"), we use lower thresholds since
 * we have explicit user intent.
 */
export const EXPLICIT_SAVE_THRESHOLDS = {
  /**
   * Minimum confidence when user explicitly requests save.
   * Much lower since user has expressed intent.
   */
  FLOOR: 0.3,

  /**
   * Todo threshold when user explicitly requests save.
   */
  TODO: 0.7,

  /**
   * Habit threshold when user explicitly requests save.
   */
  HABIT: 0.7,
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid SaveableType.
 */
export function isSaveableType(value: string): value is SaveableType {
  return ['log-general', 'log-idea', 'log-journal', 'todo', 'habit'].includes(value);
}

/**
 * Check if a string is a valid HabitSubtype.
 */
export function isHabitSubtype(value: string): value is HabitSubtype {
  return ['start_habit', 'break_habit'].includes(value);
}

/**
 * Check if a string is a valid LogSubtype.
 */
export function isLogSubtype(value: string): value is LogSubtype {
  return ['general', 'idea', 'journal'].includes(value);
}

/**
 * Check if a string is a valid HabitFrequency.
 */
export function isHabitFrequency(value: string | null): value is HabitFrequency {
  if (value === null) return true;
  return ['daily', 'weekly', 'weekdays', 'weekends', 'monthly', 'custom'].includes(value);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an empty SaveablePrefill with default values.
 */
export function createEmptyPrefill(): SaveablePrefill {
  return {
    title: '',
    content: '',
    tags: [],
  };
}

/**
 * Create a "not saveable" result for when detection finds nothing.
 */
export function createNotSaveableResult(messageId: string): SaveableResult {
  return {
    isSaveable: false,
    confidence: 0,
    suggestedType: SAVEABLE_THRESHOLDS.DEFAULT_TYPE,
    prefill: createEmptyPrefill(),
    detectedAt: nowTimestamp(),
    messageId,
  };
}
