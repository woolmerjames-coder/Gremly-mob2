/**
 * Rolling Context Management for Spaces Chat
 *
 * Manages conversation context that persists across chat sessions.
 * Context is stored in two DB columns:
 * - running_summary: Text summary of conversation history
 * - context_json: Structured data for quick lookups
 */

import { nowTimestamp } from '../date/DateService';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Structured context data extracted from conversations.
 * Stored in context_json column.
 */
export interface ChatContextStructured {
  /** Quick reference topics from conversation */
  keyTopics: string[];
  /** Number of conversation turns */
  turnCount: number;
  /** Facts the user has mentioned */
  userMentioned: {
    /** User preferences, e.g., { "workout_time": "morning" } */
    preferences?: Record<string, string>;
    /** Important dates, e.g., { "anniversary": "June 15" } */
    dates?: Record<string, string>;
    /** Names of people mentioned */
    people?: string[];
    /** Stated goals/intentions */
    goals?: string[];
  };
  /** ISO timestamp of last update */
  lastUpdatedAt: string;
  /** Schema version, always 1 for now */
  version: number;
}

/**
 * Complete chat context combining summary text and structured data.
 */
export interface ChatContext {
  /** Text summary of conversation history (stored in running_summary column) */
  runningSummary: string;
  /** Structured data for quick lookups (stored in context_json column) */
  structured: ChatContextStructured;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of key topics to retain */
const MAX_KEY_TOPICS = 10;

/** Recompress context every N turns */
const RECOMPRESS_INTERVAL = 3;

/** Current schema version */
const SCHEMA_VERSION = 1;

/**
 * Empty context with sensible defaults.
 * Use createEmptyContext() to get a fresh instance.
 */
export const EMPTY_CONTEXT: ChatContext = {
  runningSummary: '',
  structured: {
    keyTopics: [],
    turnCount: 0,
    userMentioned: {
      preferences: {},
      dates: {},
      people: [],
      goals: [],
    },
    lastUpdatedAt: nowTimestamp(),
    version: SCHEMA_VERSION,
  },
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates a fresh empty context.
 * @returns A new ChatContext with default values
 */
export function createEmptyContext(): ChatContext {
  return {
    runningSummary: '',
    structured: {
      keyTopics: [],
      turnCount: 0,
      userMentioned: {
        preferences: {},
        dates: {},
        people: [],
        goals: [],
      },
      lastUpdatedAt: nowTimestamp(),
      version: SCHEMA_VERSION,
    },
  };
}

// ============================================================================
// SERIALIZATION / DESERIALIZATION
// ============================================================================

/**
 * Safely parses DB values into ChatContext.
 * Handles null, undefined, and malformed data gracefully.
 *
 * @param runningSummary - Value from running_summary column (may be null)
 * @param contextJson - Value from context_json column (may be null or malformed)
 * @returns Parsed ChatContext with defaults for missing fields
 */
export function parseContextFromDb(
  runningSummary: string | null,
  contextJson: unknown,
): ChatContext {
  // Start with empty context
  const context = createEmptyContext();

  // Parse running summary
  if (typeof runningSummary === 'string' && runningSummary.trim()) {
    context.runningSummary = runningSummary;
  }

  // Parse structured context
  if (contextJson && typeof contextJson === 'object' && !Array.isArray(contextJson)) {
    const json = contextJson as Record<string, unknown>;

    // keyTopics
    if (Array.isArray(json.keyTopics)) {
      context.structured.keyTopics = json.keyTopics.filter(
        (t): t is string => typeof t === 'string',
      );
    }

    // turnCount
    if (typeof json.turnCount === 'number' && json.turnCount >= 0) {
      context.structured.turnCount = json.turnCount;
    }

    // userMentioned
    if (json.userMentioned && typeof json.userMentioned === 'object') {
      const um = json.userMentioned as Record<string, unknown>;

      // preferences
      if (um.preferences && typeof um.preferences === 'object' && !Array.isArray(um.preferences)) {
        context.structured.userMentioned.preferences = um.preferences as Record<string, string>;
      }

      // dates
      if (um.dates && typeof um.dates === 'object' && !Array.isArray(um.dates)) {
        context.structured.userMentioned.dates = um.dates as Record<string, string>;
      }

      // people
      if (Array.isArray(um.people)) {
        context.structured.userMentioned.people = um.people.filter(
          (p): p is string => typeof p === 'string',
        );
      }

      // goals
      if (Array.isArray(um.goals)) {
        context.structured.userMentioned.goals = um.goals.filter(
          (g): g is string => typeof g === 'string',
        );
      }
    }

    // lastUpdatedAt
    if (typeof json.lastUpdatedAt === 'string') {
      context.structured.lastUpdatedAt = json.lastUpdatedAt;
    }

    // version
    if (typeof json.version === 'number') {
      context.structured.version = json.version;
    }
  }

  return context;
}

/**
 * Prepares context for DB update.
 * Serializes ChatContext into the format expected by DB columns.
 *
 * @param context - The ChatContext to serialize
 * @returns Object with running_summary and context_json ready for DB
 */
export function serializeContextForDb(context: ChatContext): {
  running_summary: string;
  context_json: object;
} {
  return {
    running_summary: context.runningSummary,
    context_json: context.structured,
  };
}

// ============================================================================
// CONTEXT MANAGEMENT UTILITIES
// ============================================================================

/**
 * Determines if context should be recompressed.
 * Returns true every RECOMPRESS_INTERVAL turns (default: 3).
 *
 * @param context - Current context
 * @returns True if recompression should occur
 */
export function shouldRecompress(context: ChatContext): boolean {
  return (
    context.structured.turnCount > 0 && context.structured.turnCount % RECOMPRESS_INTERVAL === 0
  );
}

/**
 * Increments the turn count and updates timestamp.
 * Pure function - returns new context without mutating input.
 *
 * @param context - Current context
 * @returns New context with incremented turnCount
 */
export function incrementTurnCount(context: ChatContext): ChatContext {
  return {
    ...context,
    structured: {
      ...context.structured,
      turnCount: context.structured.turnCount + 1,
      lastUpdatedAt: nowTimestamp(),
    },
  };
}

/**
 * Adds a key topic to the context.
 * - Skips if topic already exists (case-insensitive)
 * - Keeps max MAX_KEY_TOPICS topics (removes oldest when full)
 * Pure function - returns new context without mutating input.
 *
 * @param context - Current context
 * @param topic - Topic to add
 * @returns New context with topic added
 */
export function addKeyTopic(context: ChatContext, topic: string): ChatContext {
  const normalizedTopic = topic.trim();
  if (!normalizedTopic) return context;

  const existingTopics = context.structured.keyTopics;

  // Check if topic already exists (case-insensitive)
  const topicLower = normalizedTopic.toLowerCase();
  if (existingTopics.some((t) => t.toLowerCase() === topicLower)) {
    return context;
  }

  // Add topic, removing oldest if at capacity
  let newTopics = [...existingTopics, normalizedTopic];
  if (newTopics.length > MAX_KEY_TOPICS) {
    newTopics = newTopics.slice(newTopics.length - MAX_KEY_TOPICS);
  }

  return {
    ...context,
    structured: {
      ...context.structured,
      keyTopics: newTopics,
      lastUpdatedAt: nowTimestamp(),
    },
  };
}

/**
 * Adds a fact the user mentioned to the context.
 * Pure function - returns new context without mutating input.
 *
 * @param context - Current context
 * @param category - Category of fact: 'preferences', 'dates', 'people', or 'goals'
 * @param key - Key for the fact (for preferences/dates) or value itself (for people/goals)
 * @param value - Value for the fact (ignored for people/goals)
 * @returns New context with fact added
 */
export function addUserFact(
  context: ChatContext,
  category: 'preferences' | 'dates' | 'people' | 'goals',
  key: string,
  value: string,
): ChatContext {
  const trimmedKey = key.trim();
  const trimmedValue = value.trim();
  if (!trimmedKey) return context;

  const userMentioned = { ...context.structured.userMentioned };

  switch (category) {
    case 'preferences':
      userMentioned.preferences = {
        ...userMentioned.preferences,
        [trimmedKey]: trimmedValue,
      };
      break;

    case 'dates':
      userMentioned.dates = {
        ...userMentioned.dates,
        [trimmedKey]: trimmedValue,
      };
      break;

    case 'people': {
      const people = userMentioned.people || [];
      // Avoid duplicates (case-insensitive)
      if (!people.some((p) => p.toLowerCase() === trimmedKey.toLowerCase())) {
        userMentioned.people = [...people, trimmedKey];
      }
      break;
    }

    case 'goals': {
      const goals = userMentioned.goals || [];
      // Avoid duplicates (case-insensitive)
      if (!goals.some((g) => g.toLowerCase() === trimmedKey.toLowerCase())) {
        userMentioned.goals = [...goals, trimmedKey];
      }
      break;
    }
  }

  return {
    ...context,
    structured: {
      ...context.structured,
      userMentioned,
      lastUpdatedAt: nowTimestamp(),
    },
  };
}

/**
 * Updates the running summary text.
 * Pure function - returns new context without mutating input.
 *
 * @param context - Current context
 * @param summary - New summary text
 * @returns New context with updated summary
 */
export function updateRunningSummary(context: ChatContext, summary: string): ChatContext {
  return {
    ...context,
    runningSummary: summary,
    structured: {
      ...context.structured,
      lastUpdatedAt: nowTimestamp(),
    },
  };
}
