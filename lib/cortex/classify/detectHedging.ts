/**
 * Hedging Detection
 *
 * Detects hedging language that disqualifies input from being a todo or habit.
 * If hedging detected + action verb present → chips, not auto-create.
 */

// Hard blocklist - instant disqualification from todo/habit
const HEDGING_WORDS = new Set([
  // Modal verbs indicating uncertainty
  'should',
  'could',
  'would',
  'might',
  'may',

  // Probability hedges
  'maybe',
  'perhaps',
  'probably',
  'possibly',
  'likely',

  // Thinking/considering
  'thinking',
  'considering',
  'wondering',
  'pondering',

  // Soft intent
  'want',
  'wanna',
  'wish',
  'hope',

  // Conditional
  'if',
  'unless',
  'suppose',
  'assuming',
]);

// Phrases that indicate hedging (multi-word)
const HEDGING_PHRASES = [
  /\bthinking about\b/i,
  /\bthinking of\b/i,
  /\bconsidering\b/i,
  /\bwondering if\b/i,
  /\bwondering about\b/i,
  /\bmight want to\b/i,
  /\bmight need to\b/i,
  /\bshould probably\b/i,
  /\bcould probably\b/i,
  /\bwant to start\b/i,
  /\bneed to start\b/i,
  /\bi('d| would) like to\b/i,
  /\bi('d| would) love to\b/i,
  /\bmaybe i should\b/i,
  /\bmaybe i could\b/i,
  /\bprobably should\b/i,
  /\bi guess i should\b/i,
  /\bi suppose i should\b/i,
];

// Reflection patterns (these go to log-general, not chips)
const REFLECTION_PHRASES = [
  /\bbeen thinking about\b/i,
  /\bwas thinking about\b/i,
  /\bi've been\b/i,
  /\bi have been\b/i,
  /\blately i('ve| have)?\b/i,
  /\brecently i('ve| have)?\b/i,
];

export interface HedgingResult {
  isHedged: boolean;
  isReflection: boolean;
  hedgingWords: string[];
  confidence: number; // How confident we are this is hedged
}

/**
 * Detect hedging in text
 *
 * @returns HedgingResult with detection details
 */
export function detectHedging(text: string): HedgingResult {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);

  // Check for hedging words
  const foundHedgingWords: string[] = [];
  for (const word of words) {
    // Strip punctuation
    const clean = word.replace(/[^a-z]/g, '');
    if (HEDGING_WORDS.has(clean)) {
      foundHedgingWords.push(clean);
    }
  }

  // Check for hedging phrases
  let phraseMatch = false;
  for (const pattern of HEDGING_PHRASES) {
    if (pattern.test(textLower)) {
      phraseMatch = true;
      break;
    }
  }

  // Check for reflection patterns (stronger signal → log-general, not chips)
  let isReflection = false;
  for (const pattern of REFLECTION_PHRASES) {
    if (pattern.test(textLower)) {
      isReflection = true;
      break;
    }
  }

  const isHedged = foundHedgingWords.length > 0 || phraseMatch;

  // Calculate confidence
  let confidence = 0;
  if (isReflection) {
    confidence = 0.9; // High confidence this is reflection
  } else if (phraseMatch) {
    confidence = 0.85; // Phrase match is strong signal
  } else if (foundHedgingWords.length >= 2) {
    confidence = 0.8; // Multiple hedging words
  } else if (foundHedgingWords.length === 1) {
    confidence = 0.7; // Single hedging word
  }

  return {
    isHedged,
    isReflection,
    hedgingWords: foundHedgingWords,
    confidence,
  };
}

// Export for testing
export const _testExports = {
  HEDGING_WORDS,
  HEDGING_PHRASES,
  REFLECTION_PHRASES,
};
