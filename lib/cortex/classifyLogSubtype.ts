/**
 * Log Subtype Classifier
 *
 * Pure, deterministic classifier for Mind Drop logs.
 * Distinguishes between:
 * - "journal" - Personal reflections, emotions, experiences
 * - "idea" - Creative thoughts, possibilities, future plans
 * - "general" - Everything else or mixed signals
 *
 * Constraints:
 * - Synchronous, no async
 * - No crypto, randomness, or network calls
 * - No Date.now() or non-deterministic operations
 * - Uses only string/regex heuristics
 */

export type LogSubtype = 'journal' | 'idea' | 'general';

export interface LogSubtypeSignal {
  journalConfidence: number; // 0–100
  ideaConfidence: number; // 0–100
  subtype: LogSubtype;
  debug: {
    journalReasons: string[];
    ideaReasons: string[];
    textLength: number;
  };
}

// ====================================
// HELPER CONSTANTS
// ====================================

const EMOTION_WORDS = [
  'overwhelmed',
  'overwhelming',
  'stressed',
  'stressed out',
  'stressful',
  'anxious',
  'anxiety',
  'sad',
  'upset',
  'angry',
  'mad',
  'frustrated',
  'frustrating',
  'tired',
  'exhausted',
  'exhausting',
  'burned out',
  'burnt out',
  'worried',
  'worrying',
  'scared',
  'afraid',
  'happy',
  'excited',
  'exciting',
  'grateful',
  'thankful',
  'lonely',
  'depressed',
  'depressing',
  'low',
];

const IDEA_MARKERS = [
  'idea:',
  'app idea:',
  'business idea:',
  'startup idea:',
  'what if we',
  'what if i',
  'what if you',
  'we could',
  'we should',
  'maybe we could',
  'maybe we should',
  'would be cool if',
  'it would be cool if',
];

const POSSIBILITY_WORDS = ['could', 'might', 'maybe', 'potentially', 'perhaps', 'would'];

const CREATIVE_VERBS = [
  'build',
  'create',
  'design',
  'make',
  'try',
  'experiment',
  'prototype',
  'add',
  'change',
  'improve',
];

// ====================================
// HELPER UTILITIES
// ====================================

function containsAny(text: string, list: string[]): boolean {
  const lower = text.toLowerCase();
  return list.some((item) => lower.includes(item.toLowerCase()));
}

function matchesPattern(text: string, regex: RegExp): boolean {
  return regex.test(text);
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

function isShort(text: string): boolean {
  return text.length < 50 && wordCount(text) <= 8;
}

// ====================================
// JOURNAL CONFIDENCE
// ====================================

interface ConfidenceResult {
  confidence: number;
  reasons: string[];
}

function calculateJournalConfidence(text: string): ConfidenceResult {
  let confidence = 0;
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  // Rule 1: Strong first-person emotion pattern -> at least 80
  const strongEmotionPatterns = [
    /\b(i feel|i'm feeling|i am feeling|i am so)\b/i,
    /\b(i'm|i am)\s+(overwhelmed|stressed|anxious|sad|exhausted|tired|worried|upset|angry|low)\b/i,
  ];

  const hasStrongEmotion =
    strongEmotionPatterns.some((pattern) => matchesPattern(text, pattern)) ||
    lower.includes("can't stop thinking about") ||
    lower.includes('cannot stop thinking about');

  if (hasStrongEmotion) {
    confidence = Math.max(confidence, 80);
    reasons.push('strong_first_person_emotion');
  }

  // Rule 2: Personal reflection pattern -> bump to at least 70
  const timeMarkerPattern = /\b(today|yesterday|this morning|this evening|tonight)\b/i;
  const hasTimeMarker = matchesPattern(text, timeMarkerPattern);
  const hasFirstPerson = /\b(i|my)\b/i.test(text);
  const hasEmotionWord = containsAny(text, EMOTION_WORDS);

  // Time marker + first person OR time marker + emotion word (implies personal reflection)
  if ((hasTimeMarker && hasFirstPerson) || (hasTimeMarker && hasEmotionWord)) {
    confidence = Math.max(confidence, 70);
    reasons.push('personal_reflection');
  }

  // Rule 3: Short emotional statement -> at least 65
  if (isShort(text) && containsAny(text, EMOTION_WORDS)) {
    confidence = Math.max(confidence, 65);
    reasons.push('short_emotional_statement');
  }

  // Rule 4: Third-person only -> keep low
  const hasThirdPerson = /\b(he|she|they|their|his|her|the)\b/i.test(text);
  const hasFirstPersonStrict = /\b(i|my|i'm|i am)\b/i.test(text);

  if (hasThirdPerson && !hasFirstPersonStrict) {
    confidence = Math.min(confidence, 50);
    reasons.push('third_person_only');
  }

  // Clamp to [0, 100]
  confidence = Math.max(0, Math.min(100, confidence));

  return { confidence, reasons };
}

// ====================================
// IDEA CONFIDENCE
// ====================================

function calculateIdeaConfidence(text: string): ConfidenceResult {
  let confidence = 0;
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  // Rule 1: Explicit idea markers -> at least 85
  if (containsAny(text, IDEA_MARKERS)) {
    confidence = Math.max(confidence, 85);
    reasons.push('explicit_idea_marker');
  }

  // Rule 2: Creative future language -> at least 75
  const futureWords = ['will', 'would', 'could', 'might', 'maybe'];
  const hasFutureWord = futureWords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
  const hasCreativeVerb = containsAny(text, CREATIVE_VERBS);

  if (hasFutureWord && hasCreativeVerb) {
    confidence = Math.max(confidence, 75);
    reasons.push('creative_future_language');
  }

  // Rule 3: Soft possibilities -> at least 65
  const hasPossibilityWord = containsAny(text, POSSIBILITY_WORDS);
  const changeVerbs = ['add', 'change', 'improve', 'try'];
  const hasChangeVerb = changeVerbs.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(text));

  if (hasPossibilityWord && hasChangeVerb) {
    confidence = Math.max(confidence, 65);
    reasons.push('soft_possibility');
  }

  // Rule 4: Imperative commands (not ideas) -> keep low
  const commandVerbs = ['fix', 'email', 'call', 'send', 'update', 'check'];
  const startsWithCommand = commandVerbs.some((verb) =>
    new RegExp(`^${verb}\\b`, 'i').test(text.trim()),
  );

  const hasNoIdeaSignals =
    !containsAny(text, IDEA_MARKERS) && !hasPossibilityWord && confidence < 60;

  if (startsWithCommand && hasNoIdeaSignals) {
    confidence = Math.min(confidence, 40);
    reasons.push('plain_command');
  }

  // Clamp to [0, 100]
  confidence = Math.max(0, Math.min(100, confidence));

  return { confidence, reasons };
}

// ====================================
// MASTER CLASSIFIER
// ====================================

export function classifyLogSubtype(text: string): LogSubtypeSignal {
  // Normalize
  const trimmed = text.trim();
  const length = trimmed.length;

  // Handle empty input
  if (trimmed === '') {
    return {
      subtype: 'general',
      journalConfidence: 0,
      ideaConfidence: 0,
      debug: {
        journalReasons: [],
        ideaReasons: [],
        textLength: 0,
      },
    };
  }

  // Compute confidences
  const { confidence: journalConf, reasons: journalReasons } = calculateJournalConfidence(trimmed);
  const { confidence: ideaConf, reasons: ideaReasons } = calculateIdeaConfidence(trimmed);

  // Decide subtype using exact rules
  let subtype: LogSubtype;

  // Rule 1: Conflict - both reasonably high => general
  if (journalConf >= 60 && ideaConf >= 60) {
    subtype = 'general';
  }
  // Rule 2: Journal strong
  else if (journalConf >= 70) {
    subtype = 'journal';
  }
  // Rule 3: Idea strong
  else if (ideaConf >= 70) {
    subtype = 'idea';
  }
  // Rule 4: Short emotional statements
  else if (length < 50 && journalConf >= 60) {
    subtype = 'journal';
  }
  // Rule 5: Everything else
  else {
    subtype = 'general';
  }

  return {
    journalConfidence: journalConf,
    ideaConfidence: ideaConf,
    subtype,
    debug: {
      journalReasons,
      ideaReasons,
      textLength: length,
    },
  };
}
