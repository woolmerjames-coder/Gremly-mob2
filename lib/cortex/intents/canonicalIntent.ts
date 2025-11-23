/**
 * Canonical Intent Resolver
 *
 * Unified logic for determining the canonical intent type for Mind Drop text inputs.
 * This module combines rule-based classification with AI classification to produce
 * a single canonical type: 'todo', 'habit', 'log', 'meta', or 'ignore'.
 *
 * Key behaviors:
 * - Reflection safety: Prevents "thinking about X" from being ignored
 * - Auto-create thresholds: High-confidence todos/habits can be auto-created
 * - Default to 'log': Never lose meaningful text
 */

import type { IntentKind } from './types';

export type CanonicalType = 'todo' | 'habit' | 'log' | 'meta' | 'ignore';

export interface CanonicalIntentResult {
  type: CanonicalType;
  confidence: number;
  allowAutoCreate: boolean;
  suppressChips: boolean;
  reasoning: string;
}

export interface IntentInputs {
  ruleKind: IntentKind;
  ruleConfidence: number;
  aiCategory?: string | null;
  aiConfidence?: number | null;
  text: string;
}

// Thresholds
const AUTO_TASK_FLOOR = 0.85;
const AUTO_HABIT_FLOOR = 0.8;
const MIN_AI_FLOOR = 0.4;

// Reflection keywords for safety rule
const REFLECTION_KEYWORDS = [
  'thinking',
  'thought',
  'wondering',
  'maybe',
  'considering',
  'might',
  'someday',
  'possibly',
  'should',
  'could',
];

// Vague reflection patterns that should NOT auto-create todos
const VAGUE_REFLECTION_PATTERNS = [
  /\bmaybe\s+(someday|one day|later)\b/i,
  /\bsomeday\s+(maybe|i|we)\b/i,
  /\bjust thinking about\b/i,
  /\bwondering if\b/i,
  /\bi might\b/i,
];

/**
 * Check if text contains reflection keywords
 */
function hasReflectionKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return REFLECTION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Check if text looks like a vague reflection (not actionable)
 */
function isVagueReflection(text: string): boolean {
  return VAGUE_REFLECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Normalize AI category to canonical type
 */
function normalizeAICategory(category: string | null | undefined): CanonicalType | null {
  if (!category) return null;

  const normalized = category.toLowerCase().trim();

  switch (normalized) {
    case 'todo':
    case 'task':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log':
    case 'note':
    case 'journal':
      return 'log';
    case 'ignore':
    case 'none':
      return 'ignore';
    case 'question':
    case 'meta':
      return 'meta';
    default:
      return null;
  }
}

/**
 * Normalize rule kind to canonical type
 */
function normalizeRuleKind(kind: IntentKind): CanonicalType {
  switch (kind) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'note':
    case 'reflection':
    case 'ambiguous':
      return 'log';
    case 'question':
      return 'meta';
    case 'none':
    default:
      return 'ignore';
  }
}

/**
 * Resolve canonical intent from rule-based and AI classification
 *
 * This is the SINGLE SOURCE OF TRUTH for intent decisions.
 * Implements reflection safety, auto-create thresholds, and fallback logic.
 */
export function resolveCanonicalIntent(inputs: IntentInputs): CanonicalIntentResult {
  const { ruleKind, ruleConfidence, aiCategory, aiConfidence, text } = inputs;

  // Normalize inputs
  const normalizedAI = normalizeAICategory(aiCategory);
  const normalizedRule = normalizeRuleKind(ruleKind);
  const aiConf = aiConfidence ?? 0;
  const ruleConf = ruleConfidence;

  // REFLECTION SAFETY RULE (highest priority)
  // Prevents "Just thinking about X" from being ignored
  if (
    (normalizedAI === 'ignore' || normalizedAI === null || normalizedRule === 'ignore') &&
    aiConf < 0.7 &&
    hasReflectionKeywords(text)
  ) {
    return {
      type: 'log',
      confidence: 0.6,
      allowAutoCreate: false,
      suppressChips: false,
      reasoning: 'Reflection safety: converted ignore→log due to reflection keywords',
    };
  }

  // META/IGNORE with strong evidence (let these through)
  if (normalizedRule === 'meta' && ruleConf >= 0.9) {
    return {
      type: 'meta',
      confidence: ruleConf,
      allowAutoCreate: false,
      suppressChips: true,
      reasoning: 'Strong meta-comment from rules',
    };
  }

  if (normalizedAI === 'ignore' && aiConf >= 0.8) {
    return {
      type: 'ignore',
      confidence: aiConf,
      allowAutoCreate: false,
      suppressChips: true,
      reasoning: 'High-confidence ignore from AI',
    };
  }

  // Combine AI and rule confidence for todo/habit
  const combinedTodoConf = Math.max(
    normalizedRule === 'todo' ? ruleConf : 0,
    normalizedAI === 'todo' ? aiConf : 0,
  );

  const combinedHabitConf = Math.max(
    normalizedRule === 'habit' ? ruleConf : 0,
    normalizedAI === 'habit' ? aiConf : 0,
  );

  // AUTO TODO RULE
  if (
    (normalizedRule === 'todo' || normalizedAI === 'todo') &&
    combinedTodoConf >= AUTO_TASK_FLOOR &&
    !isVagueReflection(text)
  ) {
    return {
      type: 'todo',
      confidence: combinedTodoConf,
      allowAutoCreate: true,
      suppressChips: false,
      reasoning: 'High-confidence todo (auto-create)',
    };
  }

  // AUTO HABIT RULE
  if (
    (normalizedRule === 'habit' || normalizedAI === 'habit') &&
    combinedHabitConf >= AUTO_HABIT_FLOOR
  ) {
    return {
      type: 'habit',
      confidence: combinedHabitConf,
      allowAutoCreate: true,
      suppressChips: false,
      reasoning: 'High-confidence habit (auto-create)',
    };
  }

  // Medium confidence todo/habit (show chips, don't auto-create)
  if (combinedTodoConf >= MIN_AI_FLOOR && combinedTodoConf < AUTO_TASK_FLOOR) {
    return {
      type: 'todo',
      confidence: combinedTodoConf,
      allowAutoCreate: false,
      suppressChips: false,
      reasoning: 'Medium-confidence todo (manual confirmation)',
    };
  }

  if (combinedHabitConf >= MIN_AI_FLOOR && combinedHabitConf < AUTO_HABIT_FLOOR) {
    return {
      type: 'habit',
      confidence: combinedHabitConf,
      allowAutoCreate: false,
      suppressChips: false,
      reasoning: 'Medium-confidence habit (manual confirmation)',
    };
  }

  // DEFAULT FALLBACK: log
  // Never lose meaningful text - if we're not confident it's todo/habit/meta/ignore, make it a log
  return {
    type: 'log',
    confidence: Math.max(ruleConf, aiConf, 0.4),
    allowAutoCreate: false,
    suppressChips: false,
    reasoning: 'Default fallback to log (preserve user input)',
  };
}
