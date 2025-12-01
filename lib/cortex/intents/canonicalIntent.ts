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
  /** Override decision mode for special cases (e.g., ambiguous social plans) */
  mode?: 'auto' | 'ask';
  /** Chip decision details for UI rendering */
  chipDecision?: {
    showChips: boolean;
    needsClarification: boolean;
    reason?: string;
  };
  /** Probable canonical kind for MindDropDecision */
  probableKind?: 'todo' | 'habit' | 'log' | 'none';
}

export interface IntentInputs {
  ruleKind: IntentKind;
  ruleConfidence: number;
  aiCategory?: string | null;
  aiConfidence?: number | null; // 0-1 scale (normalized)
  text: string;
}

// Thresholds (0-1 scale)
const AUTO_TASK_FLOOR = 0.85;
const AUTO_HABIT_FLOOR = 0.8;
const MIN_AI_FLOOR = 0.4;
const HIGH_CONF_ACTION = 0.8; // High-confidence threshold for auto-create todos/habits

// Explicit ignore patterns - text that should truly be discarded
// These are safeguards for explicit opt-outs regardless of AI classification
const EXPLICIT_IGNORE_PATTERNS = [
  /^ignore\s+this$/i,
  /^do\s+not\s+save$/i,
  /^don'?t\s+save\s+this$/i,
  /^test\s+prompt$/i,
  /^testing\s+1\s*2\s*3$/i,
  /^never\s*mind$/i,
  /^forget\s+it$/i,
  /^cancel$/i,
  /^stop$/i,
];

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

// Hedging language for proto-task detection
const HEDGING_WORDS = [
  'maybe',
  'might',
  'should probably',
  'should really',
  'probably should',
  'i should',
  'should',
  'could',
  'thinking i should',
  'thinking about',
];

// Action verbs for proto-task detection
const ACTION_VERBS = [
  'email',
  'call',
  'book',
  'schedule',
  'sign up',
  'start looking',
  'apply',
  'contact',
  'reach out',
  'text',
  'message',
  'ask',
  'tell',
  'remind',
  'check',
  'look into',
  'research',
  'find',
  'get',
  'buy',
  'order',
  'pay',
  'finish',
  'complete',
  'test',
  'fix',
];

// Temporal keywords for ambiguous social plan detection
const TEMPORAL_KEYWORDS = [
  'tonight',
  'tomorrow',
  'this weekend',
  'next weekend',
  'friday',
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'this week',
  'next week',
];

// Social event words that commonly appear with ambiguous plans
const SOCIAL_EVENT_WORDS = [
  'dinner',
  'lunch',
  'brunch',
  'breakfast',
  'drinks',
  'coffee',
  'meeting',
  'call',
];

/**
 * Check if text matches explicit ignore patterns
 * These are safeguards for explicit opt-outs like "ignore this", "test prompt", etc.
 */
function isExplicitIgnore(text: string): boolean {
  const trimmed = text.trim();
  return EXPLICIT_IGNORE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

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
 * Check if text contains temporal keywords
 */
function hasTemporalKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return TEMPORAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Check if text contains social event words
 */
function hasSocialEventWords(text: string): boolean {
  const lower = text.toLowerCase();
  return SOCIAL_EVENT_WORDS.some((word) => lower.includes(word));
}

/**
 * Check if text has person indicators (capitalized words that might be names)
 * or words like "with" followed by capitalized word
 */
function hasPersonIndicators(text: string): boolean {
  // Check for "with [Name]" pattern
  const withPattern = /\bwith\s+[A-Z][a-z]+/;
  return withPattern.test(text);
}

/**
 * Detect if text is an ambiguous social plan
 * Returns true if:
 * - Contains temporal keywords AND person indicators
 * - OR contains social event words AND person indicators
 */
function isAmbiguousSocialPlan(text: string): boolean {
  const hasTemporal = hasTemporalKeywords(text);
  const hasSocial = hasSocialEventWords(text);
  const hasPerson = hasPersonIndicators(text);

  return hasPerson && (hasTemporal || hasSocial);
}

/**
 * Detect direct imperative command: starts with action verb (no hedging)
 * Examples: "Test the MindDrop", "Email Sarah about the meeting", "Buy groceries"
 * These are direct commands that should be todos with high confidence
 */
function isDirectImperative(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Imperative action verbs that often start direct commands
  const imperativeVerbs = [
    'test',
    'fix',
    'get',
    'buy',
    'email',
    'call',
    'book',
    'schedule',
    'finish',
    'complete',
    'pay',
    'check',
    'find',
    'order',
    'pick up',
    'clean',
    'make',
    'send',
    'write',
    'update',
    'review',
    'submit',
    'set up',
    'install',
    'download',
    'create',
  ];

  // Check if text starts with an imperative verb
  for (const verb of imperativeVerbs) {
    if (lower.startsWith(verb + ' ') || lower === verb) {
      return true;
    }
  }

  return false;
}

/**
 * Detect proto-task: hedging language + action verb
 * Examples: "Maybe I should email Sarah", "Should probably book a dentist appointment"
 * Returns true if text contains hedging language followed by an action verb
 */
function isProtoTask(text: string): boolean {
  const lower = text.toLowerCase();

  // Check for hedging words
  const hasHedging = HEDGING_WORDS.some((word) => lower.includes(word));
  if (!hasHedging) return false;

  // Check for action verbs
  const hasAction = ACTION_VERBS.some((verb) => lower.includes(verb));
  return hasAction;
}

/**
 * Detect simple social event: short phrase with social event + person + temporal
 * Examples: "Drinks with Sam on Friday", "Dinner with Alex tomorrow"
 * Returns true for patterns like: <event> with <Name> [on/this/next] <day>
 */
function isSimpleSocialEvent(text: string): boolean {
  const lower = text.toLowerCase();

  // Must be relatively short (social plans are typically brief)
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 10) return false;

  // Check for social event words
  const simpleSocialEvents = ['dinner', 'drinks', 'brunch', 'lunch', 'breakfast', 'coffee'];
  const hasSocialEvent = simpleSocialEvents.some((event) => lower.includes(event));
  if (!hasSocialEvent) return false;

  // Check for person indicators (with [Name])
  if (!hasPersonIndicators(text)) return false;

  // Check for temporal keywords
  const dayKeywords = [
    'tonight',
    'tomorrow',
    'friday',
    'saturday',
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'this weekend',
    'next weekend',
    'this week',
    'next week',
  ];
  const hasTemporal = dayKeywords.some((keyword) => lower.includes(keyword));

  return hasTemporal;
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

  // EXPLICIT IGNORE SAFEGUARD (text-based, highest priority)
  // Explicit opt-outs like "ignore this", "test prompt", "never mind" are truly ignored
  // This runs before any AI/rule processing
  if (isExplicitIgnore(text)) {
    return {
      type: 'ignore',
      confidence: 1.0,
      allowAutoCreate: false,
      suppressChips: true,
      reasoning: 'Explicit ignore pattern matched (text-based safeguard)',
    };
  }

  // Normalize inputs
  const normalizedAI = normalizeAICategory(aiCategory);
  const normalizedRule = normalizeRuleKind(ruleKind);
  const aiConf = aiConfidence ?? 0;
  const ruleConf = ruleConfidence;

  // PROTO-TASK RULE (Block 2) - CHECK FIRST before reflection safety
  // Proto-tasks have hedging language + action verb → medium-confidence todo, needs clarification
  // This must run before reflection safety to catch "Maybe I should email Sarah"
  const isProto = isProtoTask(text);
  if (isProto && !isVagueReflection(text)) {
    return {
      type: 'todo',
      confidence: 0.6,
      allowAutoCreate: false,
      suppressChips: false,
      mode: 'ask',
      chipDecision: {
        showChips: true,
        needsClarification: true,
        reason: 'proto-task',
      },
      probableKind: 'todo',
      reasoning: 'Medium-confidence todo (proto-task, manual confirmation)',
    };
  }

  // DIRECT IMPERATIVE RULE - commands starting with action verbs
  // Applies when:
  // 1. AI returns null/unknown category (like "junk"), OR
  // 2. AI returns non-todo type with low confidence (< 0.5)
  // Examples: "Test the MindDrop", "Email Sarah", "Buy groceries"
  // This catches valid tasks when AI fails to classify or has low confidence in a wrong type
  const isImperative = isDirectImperative(text);
  const aiIsLowConfidenceNonTodo = normalizedAI !== null && normalizedAI !== 'todo' && aiConf < 0.5;

  if (isImperative && (normalizedAI === null || aiIsLowConfidenceNonTodo)) {
    return {
      type: 'todo',
      confidence: 0.85,
      allowAutoCreate: true,
      suppressChips: false,
      reasoning: 'High-confidence todo (direct imperative command)',
    };
  }

  // REFLECTION SAFETY RULE (highest priority after proto-task)
  // Prevents "Just thinking about X" from being ignored OR showing chips
  if (
    (normalizedAI === 'ignore' || normalizedAI === null || normalizedRule === 'ignore') &&
    aiConf < 0.7 && // 0-1 scale (0.7 = 70% confidence)
    hasReflectionKeywords(text)
  ) {
    return {
      type: 'log',
      confidence: 0.6,
      allowAutoCreate: true, // Auto-create reflection logs without chips
      suppressChips: false,
      reasoning: 'Reflection safety: converted ignore→log due to reflection keywords',
    };
  }

  // REFLECTION CONFIDENCE BOOST
  // When AI/rules already say 'log' but confidence is low, boost it if reflection keywords present
  if (
    (normalizedAI === 'log' || normalizedRule === 'log') &&
    (aiConf < 0.6 || ruleConf < 0.6) &&
    hasReflectionKeywords(text)
  ) {
    return {
      type: 'log',
      confidence: 0.6,
      allowAutoCreate: true, // Auto-create reflection logs without chips
      suppressChips: false,
      reasoning: 'Reflection boost: low-confidence log boosted due to reflection keywords',
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

  // AUTO TODO RULE (Block 3)
  // High-confidence todos auto-create
  if (
    (normalizedRule === 'todo' || normalizedAI === 'todo') &&
    combinedTodoConf >= HIGH_CONF_ACTION &&
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

  // AUTO HABIT RULE (Block 3)
  // High-confidence habits auto-create
  if (
    (normalizedRule === 'habit' || normalizedAI === 'habit') &&
    combinedHabitConf >= HIGH_CONF_ACTION
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
  // BUT: Check for ambiguous social plans first
  const isSocialPlan = isAmbiguousSocialPlan(text);
  const isMediumConfidenceTodo =
    combinedTodoConf >= MIN_AI_FLOOR && combinedTodoConf < AUTO_TASK_FLOOR;

  if (isMediumConfidenceTodo && isSocialPlan) {
    // Medium-confidence todo that looks like social plan → force ask mode with chips
    return {
      type: 'todo',
      probableKind: 'log', // Hint that it could also be a log
      confidence: combinedTodoConf,
      allowAutoCreate: false,
      suppressChips: false,
      mode: 'ask',
      chipDecision: {
        showChips: true,
        needsClarification: true,
        reason: 'ambiguous-social-plan',
      },
      reasoning: 'Ambiguous social plan: needs user clarification (Log vs To-Do)',
    };
  }

  if (isMediumConfidenceTodo) {
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

  // SIMPLE SOCIAL EVENT RULE (Block 2)
  // Check for simple social events like "Drinks with Sam on Friday"
  // These should be ambiguous between Log and To-Do
  const isSimpleSocial = isSimpleSocialEvent(text);
  if (isSimpleSocial) {
    // If AI already classified as log with medium confidence (0.5-0.7)
    // OR if we're uncertain, treat as ambiguous social event
    const isLogWithMediumConf =
      (normalizedAI === 'log' || normalizedRule === 'log') && aiConf >= 0.5 && aiConf <= 0.7;

    if (isLogWithMediumConf || normalizedAI === 'log' || normalizedRule === 'log') {
      return {
        type: 'todo',
        confidence: 0.6,
        allowAutoCreate: false,
        suppressChips: false,
        mode: 'ask',
        chipDecision: {
          showChips: true,
          needsClarification: true,
          reason: 'simple-social-event',
        },
        probableKind: 'todo',
        reasoning: 'Medium-confidence todo (social event, manual confirmation)',
      };
    }
  }

  // REFLECTIVE LOG RULE
  // Explicit patterns for journaling/reflective content that should auto-create as logs
  // These are "safe" - subjective, not actionable, clearly personal reflection
  const reflectivePatterns = [
    /^just thinking(\s+about)?\b/i,
    /^just thinking out loud/i,
    /^been thinking about\b/i,
    /^reflected on\b/i,
    /^today was\b/i,
    /^this week was\b/i,
    /^i feel\b/i,
    /^i'm feeling\b/i,
    /^feeling\s+(like|that|grateful|thankful)/i,
  ];

  const isReflectiveLog = reflectivePatterns.some((pattern) => pattern.test(text));
  const hasStrongActionVerb =
    /\b(email|book|pay|call|schedule|confirm|buy|get|pick up|finish|complete)\b/i.test(text);

  if (isReflectiveLog && !hasStrongActionVerb) {
    return {
      type: 'log',
      confidence: Math.max(aiConf, ruleConf, 0.6),
      allowAutoCreate: true,
      suppressChips: false,
      reasoning: 'Reflective log: auto-create without chips',
    };
  }

  // AMBIGUOUS SOCIAL PLAN RULE (for logs)
  // If AI says "log" with 30-70% confidence AND text has temporal + person indicators,
  // OR if text has clear social plan heuristics (regardless of confidence)
  // treat as ambiguous social plan requiring user clarification
  const isLogCategory = normalizedAI === 'log' || normalizedRule === 'log';
  const isAmbiguousConfidence = aiConf >= 0.3 && aiConf <= 0.7;
  // Note: isSocialPlan already declared above for medium-confidence todo check

  // Two paths to ambiguous social plan:
  // 1. Log category + ambiguous confidence (30-70%) + social plan heuristics
  // 2. Log category + strong social plan heuristics (always, regardless of confidence)
  if (isLogCategory && isSocialPlan && (isAmbiguousConfidence || isSocialPlan)) {
    return {
      type: 'log',
      probableKind: 'log',
      confidence: aiConf > 0 ? aiConf : 0.5,
      allowAutoCreate: false,
      suppressChips: false,
      mode: 'ask',
      chipDecision: {
        showChips: true,
        needsClarification: true,
        reason: 'ambiguous-social-plan',
      },
      reasoning: 'Ambiguous social plan: needs user clarification (Log vs To-Do)',
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
