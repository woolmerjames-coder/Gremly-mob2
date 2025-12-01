/**
 * Classification Cascade V2
 *
 * 8-layer cascade for Mind Drop classification.
 * Layers are evaluated in order; first match wins.
 *
 * Layer 0: Gibberish Gate (pre-filter)
 * Layer 1: Explicit Commands
 * Layer 2: Clear Habits
 * Layer 3: Clear Todos
 * Layer 4: Clear Journals
 * Layer 5: Clear Ideas
 * Layer 6: Chips (ambiguous but actionable)
 * Layer 7: Log-General (safe default)
 */

import { detectHedging } from './detectHedging';
import { AUTO_TODO, AUTO_HABIT } from '../thresholds';

// ============ TYPES ============

export type ClassifyResult = {
  type: 'todo' | 'habit' | 'log';
  subtype?: 'journal' | 'idea' | 'general';
  mode: 'auto' | 'chips' | 'default';
  confidence: number;
  layer: number;
  reason: string;
  chipOptions?: ChipOption[];
};

export type ChipOption = {
  kind: 'todo' | 'habit' | 'log';
  label: string;
};

// ============ LAYER 0: GIBBERISH GATE ============

const KEYBOARD_MASH = /^[asdfghjklqwertyuiopzxcvbnm]{5,}$/i;
const GIBBERISH_PATTERNS = [
  /^[^a-zA-Z]*$/, // No letters at all
  /^(.)\1{4,}$/, // Same char repeated 5+ times
  KEYBOARD_MASH,
];

function isGibberish(text: string): boolean {
  const trimmed = text.trim();

  // Empty or whitespace only
  if (!trimmed) return true;

  // Too short (under 2 chars)
  if (trimmed.length < 2) return true;

  // Count real words (3+ chars)
  const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 1) return true;

  // Check gibberish patterns
  for (const pattern of GIBBERISH_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

// ============ LAYER 1: EXPLICIT COMMANDS ============

const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  type: 'todo' | 'habit' | 'log';
  subtype?: string;
}> = [
  { pattern: /^add\s+todo:\s*/i, type: 'todo' },
  { pattern: /^todo:\s*/i, type: 'todo' },
  { pattern: /^task:\s*/i, type: 'todo' },
  { pattern: /^remind\s+me\s+to\s+/i, type: 'todo' },
  { pattern: /^create\s+habit:\s*/i, type: 'habit' },
  { pattern: /^habit:\s*/i, type: 'habit' },
  { pattern: /^start\s+habit:\s*/i, type: 'habit' },
  { pattern: /^note:\s*/i, type: 'log', subtype: 'general' },
  { pattern: /^idea:\s*/i, type: 'log', subtype: 'idea' },
  { pattern: /^journal:\s*/i, type: 'log', subtype: 'journal' },
];

function matchExplicitCommand(text: string): ClassifyResult | null {
  const trimmed = text.trim();

  for (const cmd of COMMAND_PATTERNS) {
    if (cmd.pattern.test(trimmed)) {
      return {
        type: cmd.type,
        subtype: cmd.subtype as any,
        mode: 'auto',
        confidence: 0.95,
        layer: 1,
        reason: `Explicit command: ${cmd.pattern.source}`,
      };
    }
  }

  return null;
}

// ============ LAYER 2: CLEAR HABITS ============

const FREQUENCY_PATTERNS = [
  /\bevery\s+(day|morning|evening|night|week|month)\b/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bmonthly\b/i,
  /\b\d+\s*x\s*(per|a)\s*(day|week|month)\b/i,
  /\b(once|twice|three\s+times)\s+(a|per)\s+(day|week|month)\b/i,
  /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\beach\s+(day|morning|evening|night|week)\b/i,
];

const ACTIVITY_VERBS = new Set([
  'run',
  'jog',
  'walk',
  'exercise',
  'workout',
  'meditate',
  'read',
  'write',
  'journal',
  'stretch',
  'yoga',
  'swim',
  'cycle',
  'lift',
  'practice',
  'study',
  'learn',
  'review',
  'plan',
  'reflect',
  'drink',
  'eat',
  'sleep',
  'wake',
  'call',
  'text',
  'check',
]);

function matchClearHabit(text: string): ClassifyResult | null {
  const textLower = text.toLowerCase();

  // Must have frequency pattern
  const hasFrequency = FREQUENCY_PATTERNS.some((p) => p.test(textLower));
  if (!hasFrequency) return null;

  // Check for hedging - if hedged, NOT a habit
  const hedging = detectHedging(text);
  if (hedging.isHedged) return null;

  // Should have an activity verb (optional but increases confidence)
  const words = textLower.split(/\s+/);
  const hasActivity = words.some((w) => ACTIVITY_VERBS.has(w.replace(/[^a-z]/g, '')));

  const confidence = hasActivity ? AUTO_HABIT : 0.8;

  return {
    type: 'habit',
    mode: 'auto',
    confidence,
    layer: 2,
    reason: 'Clear frequency pattern + activity',
  };
}

// ============ LAYER 3: CLEAR TODOS ============

const IMPERATIVE_VERBS = new Set([
  'call',
  'email',
  'text',
  'message',
  'send',
  'reply',
  'respond',
  'buy',
  'get',
  'pick',
  'grab',
  'order',
  'purchase',
  'book',
  'schedule',
  'reserve',
  'arrange',
  'set',
  'submit',
  'finish',
  'complete',
  'do',
  'make',
  'create',
  'fix',
  'repair',
  'update',
  'change',
  'edit',
  'review',
  'pay',
  'transfer',
  'deposit',
  'cancel',
  'renew',
  'clean',
  'wash',
  'organize',
  'sort',
  'file',
  'check',
  'confirm',
  'verify',
  'follow',
  'contact',
  'print',
  'sign',
  'fax',
  'mail',
  'ship',
  'return',
  'ask',
  'tell',
  'remind',
  'invite',
  'thank',
  'prepare',
  'pack',
  'bring',
  'take',
  'move',
  'put',
]);

function matchClearTodo(text: string): ClassifyResult | null {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);

  // Check for hedging first - if hedged, NOT a clear todo
  const hedging = detectHedging(text);
  if (hedging.isHedged) return null;

  // Check if starts with or contains imperative verb
  const firstWord = words[0]?.replace(/[^a-z]/g, '');
  const startsWithImperative = IMPERATIVE_VERBS.has(firstWord);

  // Also check second word (for "I need to VERB" after stripping)
  const hasImperative = words.some((w) => IMPERATIVE_VERBS.has(w.replace(/[^a-z]/g, '')));

  if (!hasImperative) return null;

  // Higher confidence if starts with imperative
  const confidence = startsWithImperative ? AUTO_TODO : 0.8;

  return {
    type: 'todo',
    mode: 'auto',
    confidence,
    layer: 3,
    reason: startsWithImperative ? 'Starts with imperative verb' : 'Contains imperative verb',
  };
}

// ============ LAYER 4: CLEAR JOURNALS ============

const JOURNAL_PATTERNS = [
  /\b(i\s+)?feel(ing)?\s+(so\s+)?(happy|sad|anxious|overwhelmed|grateful|stressed|tired|excited|frustrated|angry|peaceful|calm)\b/i,
  /\bi('m| am)\s+(so\s+)?(happy|sad|anxious|overwhelmed|grateful|stressed|tired|excited|frustrated|angry|peaceful|calm)\b/i,
  /\btoday\s+was\b/i,
  /\btoday\s+i\b/i,
  /\bi\s+realized\b/i,
  /\bi\s+noticed\b/i,
  /\bcan't\s+stop\s+thinking\b/i,
  /\bso\s+grateful\b/i,
  /\bthankful\s+for\b/i,
  /\bproud\s+of\b/i,
  /\bworried\s+about\b/i,
  /\bexcited\s+about\b/i,
  /\bneed\s+to\s+vent\b/i,
];

function matchClearJournal(text: string): ClassifyResult | null {
  const textLower = text.toLowerCase();

  for (const pattern of JOURNAL_PATTERNS) {
    if (pattern.test(textLower)) {
      return {
        type: 'log',
        subtype: 'journal',
        mode: 'auto',
        confidence: 0.8,
        layer: 4,
        reason: 'Emotional/reflective language',
      };
    }
  }

  return null;
}

// ============ LAYER 5: CLEAR IDEAS ============

const IDEA_PATTERNS = [
  /^what\s+if\b/i,
  /\bwhat\s+if\s+we\b/i,
  /^idea:\s*/i,
  /\bidea\s*[-–—:]\s*/i,
  /\bfeature\s+idea\b/i,
  /\bwe\s+could\b/i,
  /\bwe\s+should\s+try\b/i,
  /\bimagine\s+if\b/i,
  /\bhow\s+about\b/i,
  /\bwouldn't\s+it\s+be\s+(cool|nice|great)\b/i,
];

function matchClearIdea(text: string): ClassifyResult | null {
  const textLower = text.toLowerCase();

  for (const pattern of IDEA_PATTERNS) {
    if (pattern.test(textLower)) {
      return {
        type: 'log',
        subtype: 'idea',
        mode: 'auto',
        confidence: 0.8,
        layer: 5,
        reason: 'Speculative/brainstorming language',
      };
    }
  }

  return null;
}

// ============ LAYER 6: CHIPS (AMBIGUOUS BUT ACTIONABLE) ============

// Social plan patterns
const SOCIAL_PLAN_PATTERNS = [
  /\b(dinner|lunch|breakfast|coffee|drinks|meeting)\s+with\s+[A-Z][a-z]+/i,
  /\bwith\s+[A-Z][a-z]+\s+(on|this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\b[A-Z][a-z]+('s)?\s+(birthday|party|wedding|event)/i,
];

// Hedged action (has action verb but hedged)
function isHedgedAction(text: string): boolean {
  const hedging = detectHedging(text);
  if (!hedging.isHedged) return false;
  if (hedging.isReflection) return false; // Reflection → log-general, not chips

  // Check for action verb
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  const hasAction = words.some((w) => IMPERATIVE_VERBS.has(w.replace(/[^a-z]/g, '')));

  return hasAction;
}

// Activity interest (mentions activity but no frequency)
const ACTIVITY_INTEREST_PATTERNS = [
  /\bi\s+want\s+to\s+(run|exercise|meditate|read|write|workout|yoga)\b/i,
  /\bi\s+should\s+(start|begin)\s+(running|exercising|meditating|reading|working\s+out)\b/i,
  /\bi\s+need\s+to\s+(start|begin)\s+(running|exercising|meditating|reading|working\s+out)\b/i,
  /\bwant\s+to\s+start\s+(a\s+)?(habit|routine)\b/i,
];

// Chips floor threshold
const CHIPS_FLOOR = 0.55;

function matchChips(text: string): ClassifyResult | null {
  const textLower = text.toLowerCase();

  // Check social plans
  for (const pattern of SOCIAL_PLAN_PATTERNS) {
    if (pattern.test(text)) {
      // Use original text for capitalization
      return {
        type: 'log',
        subtype: 'general',
        mode: 'chips',
        confidence: CHIPS_FLOOR + 0.1,
        layer: 6,
        reason: 'Social plan - unclear if commitment',
        chipOptions: [
          { kind: 'todo', label: 'Add to To-Do' },
          { kind: 'log', label: 'Just a Note' },
        ],
      };
    }
  }

  // Check hedged actions
  if (isHedgedAction(text)) {
    return {
      type: 'log',
      subtype: 'general',
      mode: 'chips',
      confidence: CHIPS_FLOOR + 0.1,
      layer: 6,
      reason: 'Hedged action - has verb but uncertain',
      chipOptions: [
        { kind: 'todo', label: 'Add to To-Do' },
        { kind: 'log', label: 'Just a Note' },
      ],
    };
  }

  // Check activity interest
  for (const pattern of ACTIVITY_INTEREST_PATTERNS) {
    if (pattern.test(textLower)) {
      return {
        type: 'log',
        subtype: 'general',
        mode: 'chips',
        confidence: CHIPS_FLOOR + 0.1,
        layer: 6,
        reason: 'Activity interest - no frequency commitment',
        chipOptions: [
          { kind: 'habit', label: 'Start Habit' },
          { kind: 'log', label: 'Just a Note' },
        ],
      };
    }
  }

  return null;
}

// ============ LAYER 7: LOG-GENERAL (DEFAULT) ============

function defaultToLogGeneral(text: string): ClassifyResult {
  const hedging = detectHedging(text);

  return {
    type: 'log',
    subtype: 'general',
    mode: 'default',
    confidence: 0.5,
    layer: 7,
    reason: hedging.isReflection
      ? 'Reflection/observation → log-general'
      : 'No strong pattern match → safe default',
  };
}

// ============ MAIN CLASSIFIER ============

/**
 * Classify text through 8-layer cascade
 */
export function classifyV2(text: string): ClassifyResult {
  // Layer 0: Gibberish gate
  if (isGibberish(text)) {
    return {
      type: 'log',
      subtype: 'general',
      mode: 'default',
      confidence: 0,
      layer: 0,
      reason: 'Gibberish or empty input',
    };
  }

  // Layer 1: Explicit commands
  const command = matchExplicitCommand(text);
  if (command) return command;

  // Layer 2: Clear habits
  const habit = matchClearHabit(text);
  if (habit) return habit;

  // Layer 3: Clear todos
  const todo = matchClearTodo(text);
  if (todo) return todo;

  // Layer 4: Clear journals
  const journal = matchClearJournal(text);
  if (journal) return journal;

  // Layer 5: Clear ideas
  const idea = matchClearIdea(text);
  if (idea) return idea;

  // Layer 6: Chips
  const chips = matchChips(text);
  if (chips) return chips;

  // Layer 7: Default to log-general
  return defaultToLogGeneral(text);
}

// Export for testing
export const _testExports = {
  isGibberish,
  matchExplicitCommand,
  matchClearHabit,
  matchClearTodo,
  matchClearJournal,
  matchClearIdea,
  matchChips,
  defaultToLogGeneral,
  COMMAND_PATTERNS,
  FREQUENCY_PATTERNS,
  IMPERATIVE_VERBS,
  JOURNAL_PATTERNS,
  IDEA_PATTERNS,
  SOCIAL_PLAN_PATTERNS,
  ACTIVITY_INTEREST_PATTERNS,
};
