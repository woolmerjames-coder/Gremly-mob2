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
 *
 * Phase 1: Now integrates with master classifier spec for consistent categorization.
 */

import type { IntentKind } from './types';
import {
  getPreferredMasterCategoryFromTextOnly,
  MASTER_CLASSIFIER_THRESHOLDS,
  type MasterCategory,
  hasRealWords,
} from './masterClassifierSpec';

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
  /** Phase 3: Worker bucket (source of truth from unified classifier) */
  bucket?: string;
  /** Phase 3: Log subtype from worker (journal|idea|general) */
  logSubtype?: 'journal' | 'idea' | 'general' | null;
}

export interface IntentInputs {
  ruleKind: IntentKind;
  ruleConfidence: number;
  aiBucket?: string | null; // Worker's bucket: todo|habit|log-journal|log-idea|log-general|unsorted
  aiType?: string | null; // Worker's type: todo|habit|log|ignore
  aiSubtype?: string | null; // Worker's subtype: journal|idea|general|null
  aiCategory?: string | null; // DEPRECATED: Old category field for backward compat
  aiConfidence?: number | null; // 0-1 scale (normalized from 0-100 by classifyIntentWithAI)
  text: string;
}

// Thresholds (0-1 scale)
const AUTO_TASK_FLOOR = 0.85;
const AUTO_HABIT_FLOOR = 0.8;
const MIN_AI_FLOOR = 0.4;
const HIGH_CONF_ACTION = 0.8; // High-confidence threshold for auto-create todos/habits

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
 * Map worker bucket to MasterCategory
 * Bucket is the source of truth from the unified classifier
 */
function mapBucketToMasterCategory(bucket: string | null | undefined): MasterCategory | null {
  if (!bucket) return null;

  const normalized = bucket.toLowerCase().trim();
  switch (normalized) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log-journal':
      return 'log_journal';
    case 'log-idea':
      return 'log_idea';
    case 'log-general':
      return 'log_general';
    case 'unsorted':
      return 'unsorted';
    default:
      return null;
  }
}

/**
 * Map worker type to canonical type
 * Type is derived from bucket: todo|habit|log|ignore
 */
function mapWorkerTypeToCanonical(type: string | null | undefined): CanonicalType | null {
  if (!type) return null;

  const normalized = type.toLowerCase().trim();
  switch (normalized) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log':
      return 'log';
    case 'ignore':
      return 'ignore';
    default:
      return null;
  }
}

/**
 * Normalize AI category to canonical type (DEPRECATED - use bucket instead)
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
 * Map AI category to MasterCategory (DEPRECATED - use bucket mapping)
 */
function mapAIToMasterCategory(aiCategory: string | null | undefined): MasterCategory | null {
  if (!aiCategory) return null;

  const normalized = aiCategory.toLowerCase().trim();
  switch (normalized) {
    case 'todo':
    case 'task':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log':
    case 'note':
    case 'journal':
      return 'log_general';
    default:
      return null;
  }
}

/**
 * Map rule kind to MasterCategory
 */
function mapRuleKindToMasterCategory(kind: IntentKind): MasterCategory {
  switch (kind) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'note':
    case 'reflection':
    case 'ambiguous':
      return 'log_general';
    case 'none':
    case 'question':
      // Check context - if meaningful text, should be log_general
      // Will be handled by pickMasterCategory
      return 'unsorted';
    default:
      return 'log_general';
  }
}

/**
 * Pick the best MasterCategory from text, rules, and AI signals
 *
 * Priority:
 * 1. Strong AI signal (>= threshold)
 * 2. Strong rule signal (>= threshold)
 * 3. Text-based category (if has real words)
 * 4. Force log_general for meaningful text (never lose content)
 * 5. Unsorted only for pure gibberish
 */
function pickMasterCategory({
  textCategory,
  rulesCategory,
  aiCategory,
  rulesConfidence,
  aiConfidence,
  text,
}: {
  textCategory: MasterCategory;
  rulesCategory: MasterCategory;
  aiCategory: MasterCategory | null;
  rulesConfidence: number;
  aiConfidence: number;
  text: string;
}): MasterCategory {
  const threshold = MASTER_CLASSIFIER_THRESHOLDS.MIN_CATEGORY_CONFIDENCE;
  const hasWords = hasRealWords(text);

  // 1. Prefer strong AI if above threshold
  if (aiCategory && aiConfidence >= threshold) {
    return aiCategory;
  }

  // 2. Prefer strong rule result if above threshold
  if (rulesCategory !== 'unsorted' && rulesConfidence >= threshold) {
    return rulesCategory;
  }

  // 3. If there's meaningful text, fallback to textCategory → but force log_general if textCategory === "unsorted"
  if (hasWords) {
    if (textCategory === 'unsorted') return 'log_general';
    return textCategory;
  }

  // 4. Only pure gibberish goes to unsorted
  return 'unsorted';
}

/**
 * Map MasterCategory to CanonicalType
 */
function masterCategoryToCanonicalType(category: MasterCategory): CanonicalType {
  switch (category) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log_journal':
    case 'log_idea':
    case 'log_general':
      return 'log';
    case 'unsorted':
      // Never expose unsorted - convert to log
      return 'log';
    default:
      return 'log';
  }
}

/**
 * Resolve canonical intent from rule-based and AI classification
 *
 * **Phase 3: Worker Bucket is Primary Source of Truth**
 *
 * The worker's bucket/type/subtype drives all classification decisions.
 * Heuristics only apply in very limited edge cases.
 *
 * **Mapping Rules:**
 * 1. bucket='todo' → type='todo'
 * 2. bucket='habit' → type='habit'
 * 3. bucket='log-journal' → type='log', logSubtype='journal'
 * 4. bucket='log-idea' → type='log', logSubtype='idea'
 * 5. bucket='log-general' → type='log', logSubtype='general'
 * 6. bucket='unsorted' → type='ignore', allowAutoCreate=false
 *
 * **Heuristic Override (rare):**
 * - If bucket='log-general' BUT ruleKind='habit' with ruleConf >= 0.9 AND aiConf < 0.8:
 *   Upgrade to habit (worker was uncertain, rules very confident)
 *
 * **Examples:**
 * - "Run 5km every Saturday" → bucket='habit' → type='habit', allowAutoCreate=true
 * - "I'm nervous about review" → bucket='log-journal' → type='log', logSubtype='journal'
 * - "asdfghjkl" → bucket='unsorted' → type='ignore', allowAutoCreate=false
 */
export function resolveCanonicalIntent(inputs: IntentInputs): CanonicalIntentResult {
  const { ruleKind, ruleConfidence, aiBucket, aiType, aiSubtype, aiCategory, aiConfidence, text } =
    inputs;

  // BACKWARD COMPATIBILITY: Map legacy aiCategory to bucket/type/subtype
  let bucket = aiBucket;
  let type = aiType;
  let subtype = aiSubtype;

  if (!bucket && aiCategory) {
    const category = String(aiCategory).toLowerCase();
    if (category === 'todo') {
      bucket = 'todo';
      type = 'todo';
      subtype = null;
    } else if (category === 'habit') {
      bucket = 'habit';
      type = 'habit';
      subtype = null;
    } else if (category === 'log' || category === 'note') {
      bucket = 'log-general';
      type = 'log';
      subtype = 'general';
    } else if (category === 'ignore') {
      bucket = 'unsorted';
      type = 'ignore';
      subtype = null;
    } else {
      bucket = 'log-general';
      type = 'log';
      subtype = 'general';
    }
  }

  const aiConf = aiConfidence ?? 0; // Normalized 0-1 scale
  const ruleConf = ruleConfidence;

  if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
    console.log('[canonicalIntent] Phase 3 - Worker-First Classification:', {
      bucket,
      type,
      subtype,
      aiConf,
      ruleConf,
      ruleKind,
      text: text.slice(0, 50),
    });
  }

  // ============================================================
  // PHASE 3: WORKER BUCKET IS PRIMARY SOURCE OF TRUTH
  // ============================================================

  // Step 1: Handle unsorted (gibberish/junk)
  if (bucket === 'unsorted') {
    return {
      type: 'ignore',
      confidence: aiConf,
      allowAutoCreate: false,
      suppressChips: true,
      bucket: 'unsorted',
      logSubtype: null,
      reasoning: 'Worker classified as unsorted (gibberish/junk) - no entity created',
    };
  }

  // Step 2: Handle todos - trust worker if confidence >= 0.8 (80%)
  if (bucket === 'todo') {
    const isHighConfidence = aiConf >= 0.8;
    const isMediumConfidence = aiConf >= 0.4 && aiConf < 0.85;

    // Proto-task detection (hedging + action)
    if (isProtoTask(text) && !isVagueReflection(text)) {
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
        bucket: 'todo',
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Worker says todo, but proto-task needs clarification',
      };
    }

    // Ambiguous social plan detection (for medium confidence)
    if (isMediumConfidence && isAmbiguousSocialPlan(text)) {
      return {
        type: 'todo',
        confidence: aiConf,
        allowAutoCreate: false,
        suppressChips: false,
        mode: 'ask',
        chipDecision: {
          showChips: true,
          needsClarification: true,
          reason: 'ambiguous-social-plan',
        },
        bucket: 'todo',
        logSubtype: null,
        probableKind: 'log',
        reasoning: 'Worker says todo, but ambiguous social plan needs clarification',
      };
    }

    if (isHighConfidence) {
      return {
        type: 'todo',
        confidence: aiConf,
        allowAutoCreate: true,
        suppressChips: false,
        bucket: 'todo',
        logSubtype: null,
        reasoning: `Worker classified as todo (confidence: ${Math.round(aiConf * 100)}%)`,
      };
    }

    // Medium confidence todo
    return {
      type: 'todo',
      confidence: aiConf,
      allowAutoCreate: false,
      suppressChips: false,
      bucket: 'todo',
      logSubtype: null,
      reasoning: `Worker classified as todo (medium confidence: ${Math.round(aiConf * 100)}%)`,
    };
  }

  // Step 3: Handle habits - trust worker if confidence >= 0.8 (80%)
  if (bucket === 'habit') {
    const isHighConfidence = aiConf >= 0.8;

    if (isHighConfidence) {
      return {
        type: 'habit',
        confidence: aiConf,
        allowAutoCreate: true,
        suppressChips: false,
        bucket: 'habit',
        logSubtype: null,
        reasoning: `Worker classified as habit (confidence: ${Math.round(aiConf * 100)}%)`,
      };
    }

    // Medium confidence habit
    return {
      type: 'habit',
      confidence: Math.max(aiConf, 0.6),
      allowAutoCreate: false,
      suppressChips: false,
      bucket: 'habit',
      logSubtype: null,
      reasoning: `Worker classified as habit (medium confidence: ${Math.round(aiConf * 100)}%)`,
    };
  }

  // Step 4: Handle logs - map bucket to subtype
  // log-journal → journal, log-idea → idea, log-general → general
  if (bucket === 'log-journal' || bucket === 'log-idea' || bucket === 'log-general') {
    let logSubtype: 'journal' | 'idea' | 'general' = 'general';

    if (bucket === 'log-journal') {
      logSubtype = 'journal';
    } else if (bucket === 'log-idea') {
      logSubtype = 'idea';
    } else {
      logSubtype = 'general';
    }

    // HEURISTIC OVERRIDE: Strong habit signal can upgrade log-general to habit
    // Only applies when:
    // - bucket is log-general (not journal/idea - those are clearly logs)
    // - rule says habit with very high confidence (>= 0.9)
    // - worker confidence is low (< 0.8)
    if (bucket === 'log-general' && ruleKind === 'habit' && ruleConf >= 0.9 && aiConf < 0.8) {
      return {
        type: 'habit',
        confidence: Math.max(ruleConf, 0.8),
        allowAutoCreate: true,
        suppressChips: false,
        bucket: 'habit',
        logSubtype: null,
        reasoning: 'Rule-based habit override (worker uncertain, rules very confident)',
      };
    }

    // Auto-create logs without chips
    return {
      type: 'log',
      confidence: Math.max(aiConf, 0.6),
      allowAutoCreate: true,
      suppressChips: false,
      bucket,
      logSubtype,
      reasoning: `Worker classified as ${bucket} (subtype: ${logSubtype})`,
    };
  }

  // ============================================================
  // FALLBACK: No worker classification or unexpected bucket
  // ============================================================

  // Reflection safety: convert ignore to log if has reflection keywords
  if (type === 'ignore' && aiConf < 0.7 && hasReflectionKeywords(text)) {
    return {
      type: 'log',
      confidence: 0.6,
      allowAutoCreate: true,
      suppressChips: false,
      bucket: 'log-general',
      logSubtype: 'general',
      reasoning: 'Reflection safety: converted ignore→log due to reflection keywords',
    };
  }

  // Use rule-based classification as final fallback
  const normalizedRule = normalizeRuleKind(ruleKind);

  if (normalizedRule === 'todo' && ruleConf >= 0.7) {
    return {
      type: 'todo',
      confidence: ruleConf,
      allowAutoCreate: ruleConf >= 0.85,
      suppressChips: false,
      bucket: 'todo',
      logSubtype: null,
      reasoning: `Fallback: rule-based todo (confidence: ${Math.round(ruleConf * 100)}%)`,
    };
  }

  if (normalizedRule === 'habit' && ruleConf >= 0.7) {
    return {
      type: 'habit',
      confidence: ruleConf,
      allowAutoCreate: ruleConf >= 0.8,
      suppressChips: false,
      bucket: 'habit',
      logSubtype: null,
      reasoning: `Fallback: rule-based habit (confidence: ${Math.round(ruleConf * 100)}%)`,
    };
  }

  if (normalizedRule === 'meta' && ruleConf >= 0.9) {
    return {
      type: 'meta',
      confidence: ruleConf,
      allowAutoCreate: false,
      suppressChips: true,
      bucket: 'unsorted',
      logSubtype: null,
      reasoning: 'Fallback: strong meta-comment from rules',
    };
  }

  // Default to log for any meaningful text
  if (hasRealWords(text)) {
    return {
      type: 'log',
      confidence: Math.max(ruleConf, 0.5),
      allowAutoCreate: true,
      suppressChips: false,
      bucket: 'log-general',
      logSubtype: 'general',
      reasoning: 'Fallback: meaningful text defaults to log-general',
    };
  }

  // Pure gibberish: ignore
  return {
    type: 'ignore',
    confidence: 0,
    allowAutoCreate: false,
    suppressChips: true,
    bucket: 'unsorted',
    logSubtype: null,
    reasoning: 'Fallback: gibberish/no real words',
  };
}
