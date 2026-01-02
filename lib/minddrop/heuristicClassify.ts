/**
 * Heuristic Classification for Mind Drop
 *
 * Fast, regex-based classification to provide instant bucket prediction
 * before AI enrichment completes. Used for optimistic UI updates.
 *
 * Updated: Comprehensive patterns for habit detection, self-talk/venting,
 * phrasal verbs, and better subtype detection.
 *
 * v2.1 (2026-01-02): Added habitSubtypeHint for build/break habit detection
 */

import { MindDropBucket, LogSubtype } from './types';
import type { HabitSubtype } from '../types';

/**
 * Context passed to heuristic classifier for additional signals
 */
export interface ClassifyContext {
  /** Whether the drop has photo/file attachments */
  hasAttachments?: boolean;
  /** Associated space ID (null if global/catch-all) */
  spaceId?: string | null;
}

/**
 * Result from heuristic classification
 */
export interface HeuristicResult {
  /** Predicted bucket */
  bucket: MindDropBucket;
  /** Predicted subtype hint for logs */
  subtypeHint: LogSubtype | null;
  /** Predicted habit subtype: 'start_habit' (build) or 'break_habit' (break) */
  habitSubtypeHint: HabitSubtype | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Debug signals showing which patterns matched */
  signals: string[];
}

// =============================================================================
// REGEX PATTERNS FOR CLASSIFICATION
// =============================================================================

// TODO patterns - discrete, completable actions
const todoVerbs =
  /\b(buy|get|call|email|schedule|book|remind|cancel|update|fix|send|submit|finish|complete|pick up|drop off|figure out|decide|plan|organize|set up|choose|select|research|look into|find|arrange|write|draft|prepare|make)\b/;
const todoKeywords =
  /\b(todo|task|asap|urgent|deadline|by|before|due|need to|have to|must|should)\b/;
const imperativeStart =
  /^(buy|get|call|email|schedule|book|remind|cancel|update|fix|send|submit|finish|complete|pick|drop|make|do|check|review|prepare|write|create|set up|figure out|decide|plan|organize|choose|research|find)\b/i;

// Phrasal verbs that are TODO (one-time actions, NOT habits)
// "Stop by" = visit, "Stop the subscription" = cancel, "Quit my job" = resign
const todoPhrasalVerbs =
  /\b(stop by|stop the|quit my job|quit the (app|subscription|program|service)|reduce the (file|budget|size|number))\b/i;

// HABIT patterns - recurring behaviors or behavioral changes
// Note: These detect CONCRETE, TRACKABLE behaviors only
const habitFrequency = /\b(every|daily|weekly|monthly|each|routine|habit|practice)\b/;
const habitBehaviorChange =
  /\b(quit|stop|start doing|keep doing|reduce|cut back|less|no more|avoid|limit)\b/;
const habitPatterns =
  /\b(\d+\s*(x|times)\s*(a|per)\s*(day|week|month)|every\s+(morning|evening|night|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

// BREAK HABIT patterns - stopping/reducing/avoiding behaviors
const breakHabitVerbs =
  /\b(quit|stop|no more|avoid|limit|reduce|cut back|cut out|less|don't|dont|no\s+\w+\s+(during|after|before|at|in|while))\b/i;

// BUILD HABIT patterns - starting/doing/increasing behaviors
const buildHabitVerbs =
  /\b(start|begin|do|practice|exercise|meditate|read|drink\s+more|eat\s+more|sleep\s+more|work\s+out|run|walk|journal|write|learn)\b/i;

// "More" pattern for habits: "drink more water", "exercise more", "work out more"
const habitMoreLessPattern =
  /\b(drink more|eat more|eat less|sleep more|exercise more|work out more|read more|walk more|run more)\b/i;

// Concrete behaviors that can be tracked (used to validate habit detection)
const concreteTrackableBehaviors =
  /\b(smoking|smoke|cigarettes?|drinking|alcohol|coffee|caffeine|sugar(y)?|snack(s|ing)?|eating|eat|screen time|phone|social media|twitter|instagram|facebook|tiktok|gaming|porn|masturbat|nail.?biting|biting.?nails|exercise|workout|work out|running|run|gym|water|meditat|journal|read|sleep|waking|wake up|nails)\b/i;

// Abstract states that CANNOT be tracked (should be LOG, not HABIT)
const abstractMentalStates =
  /\b(overthink(ing)?|over-think(ing)?|worrying|worry|anxious|anxiety|stressed|stress(ing)?|negative|positiv|patient|impatient|calm|angry|procrastinat(e|ing|ion)?|lazy|motivated|confident|insecure|happy|sad|depressed|focus(ed|ing)?|distracted)\b/i;

// "Be more/less X" pattern - abstract aspirations that are LOG, not HABIT
const beMoreLessPattern =
  /\b(be more|be less|be a better|be the best|be kinder|be nicer|be patient|be calm|be happy|be positive|be stronger)\b/i;

// LOG patterns - reflection, venting, ideas
const journalPhrases =
  /\b(i feel|i think|i wonder|i realized|i noticed|i'm grateful|grateful for|thankful|feeling\s+\w+)\b/i;
const ideaPhrases =
  /\b(what if|maybe we|could we|how about|imagine if|random thought:?|would be cool)\b/i;
const ideaLabel = /^idea[:\s-]/i;
const narrativeIndicators =
  /\b(felt|realized|thinking|thought|wondering|noticed|yesterday|had a|went to|saw|met|talked)\b/;

// Self-talk and venting patterns (should be LOG/journal, not actionable)
const selfTalkVenting =
  /\b(such a|such an|so (bad|good|terrible|awful|stupid|dumb|lazy|tired|exhausted)|why do i always|why can't i|god,|damn|i wish i could|i wish i was|what is wrong with me|i suck at|i'm (so|such|the worst)|i really need to)\b/i;
const selfTalkExclamation = /^ugh[,!\s]|get (my|it|your) life together/i;

// Past tense indicators (usually LOG, not actionable)
const pastTenseReflection =
  /\b(finally (quit|stopped|started|did|finished)|i (quit|stopped|started|gave up|cut out)|have been|had been|used to|managed to|reduced my|this week|last week|last month|this month)\b/i;

// Coping habit pattern: concrete action "when" emotional state
// "Take 3 deep breaths when I feel anxious" = HABIT (concrete action is trackable)
const copingHabitPattern =
  /\b(take|do|go for|write|breathe|call|walk|run|meditate|read)\s+.{1,40}\s+when\s+(i\s+)?(feel\s+|am\s+|get\s+)?(anxious|stressed|overwhelmed|angry|upset|sad|frustrated)\b/i;

// =============================================================================
// HELPER: Determine habit subtype (build vs break)
// =============================================================================

/**
 * Determine if a habit is "start_habit" (build) or "break_habit" (break)
 * based on the text patterns.
 */
function detectHabitSubtype(text: string): HabitSubtype {
  const lowerText = text.toLowerCase();

  // Check for break patterns first (more specific)
  // "stop X", "quit X", "no X", "avoid X", "reduce X", "less X", "cut back on X"
  if (breakHabitVerbs.test(lowerText)) {
    return 'break_habit';
  }

  // "No [noun] during/after/before" pattern: "No phone during meals"
  if (/\bno\s+\w+\s+(during|after|before|at|in|while)\b/i.test(lowerText)) {
    return 'break_habit';
  }

  // "Less [noun]" pattern: "Less coffee", "Less screen time"
  if (/\bless\s+\w+/i.test(lowerText)) {
    return 'break_habit';
  }

  // Default to start_habit (build)
  return 'start_habit';
}

// =============================================================================
// CLASSIFICATION FUNCTION
// =============================================================================

/**
 * Classify text into a bucket using fast regex heuristics.
 * Provides instant classification for optimistic UI before AI completes.
 *
 * @param text - The raw text to classify
 * @param context - Additional context (attachments, space)
 * @returns Classification result with bucket, confidence, and debug signals
 */
export function heuristicClassify(text: string, context: ClassifyContext = {}): HeuristicResult {
  const lowerText = text.toLowerCase();
  const signals: string[] = [];

  // ==========================================================================
  // EARLY EXIT: Phrasal verbs that are one-time TODO actions
  // "Stop by the pharmacy", "Quit my job", "Reduce the file size"
  // ==========================================================================
  if (todoPhrasalVerbs.test(lowerText)) {
    signals.push('todoPhrasalVerb');
    return {
      bucket: 'todo',
      subtypeHint: null,
      habitSubtypeHint: null,
      confidence: 0.7,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: Self-talk/venting detection (LOG/journal)
  // ==========================================================================
  if (selfTalkVenting.test(lowerText) || selfTalkExclamation.test(text)) {
    signals.push('selfTalkVenting');
    return {
      bucket: 'log',
      subtypeHint: 'journal',
      habitSubtypeHint: null,
      confidence: 0.6,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: Past tense reflection (LOG/journal)
  // ==========================================================================
  if (pastTenseReflection.test(lowerText)) {
    signals.push('pastTenseReflection');
    return {
      bucket: 'log',
      subtypeHint: 'journal',
      habitSubtypeHint: null,
      confidence: 0.5,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: "Be more/less X" abstract aspirations (LOG/journal)
  // ==========================================================================
  if (beMoreLessPattern.test(lowerText)) {
    signals.push('beMoreLessAbstract');
    return {
      bucket: 'log',
      subtypeHint: 'journal',
      habitSubtypeHint: null,
      confidence: 0.5,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: Coping habits (concrete action when emotional state)
  // "Take 3 deep breaths when anxious" → HABIT
  // ==========================================================================
  if (copingHabitPattern.test(lowerText)) {
    signals.push('copingHabit');
    return {
      bucket: 'habit',
      subtypeHint: null,
      habitSubtypeHint: 'start_habit', // Coping habits are positive behaviors to build
      confidence: 0.7,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: Explicit idea label at start (LOG/idea)
  // "Idea: subscription box for dog owners"
  // ==========================================================================
  if (ideaLabel.test(text)) {
    signals.push('ideaLabel');
    return {
      bucket: 'log',
      subtypeHint: 'idea',
      habitSubtypeHint: null,
      confidence: 0.7,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: Idea patterns (LOG/idea)
  // ==========================================================================
  if (ideaPhrases.test(lowerText)) {
    signals.push('ideaPhrases');
    return {
      bucket: 'log',
      subtypeHint: 'idea',
      habitSubtypeHint: null,
      confidence: 0.6,
      signals,
    };
  }

  // ==========================================================================
  // EARLY EXIT: "More/less" habit patterns
  // "Drink more water", "Work out more" → HABIT
  // ==========================================================================
  if (habitMoreLessPattern.test(lowerText)) {
    signals.push('habitMoreLess');
    const habitSubtype = detectHabitSubtype(text);
    return {
      bucket: 'habit',
      subtypeHint: null,
      habitSubtypeHint: habitSubtype,
      confidence: 0.6,
      signals,
    };
  }
  // ==========================================================================
  // Calculate todo score
  // ==========================================================================
  let todoScore = 0;
  if (todoVerbs.test(lowerText)) {
    todoScore += 0.4;
    signals.push('todoVerbs');
  }
  if (todoKeywords.test(lowerText)) {
    todoScore += 0.3;
    signals.push('todoKeywords');
  }
  if (imperativeStart.test(text)) {
    // Use original text for start-of-string match
    todoScore += 0.3;
    signals.push('imperativeStart');
  }

  // ==========================================================================
  // Calculate habit score
  // ==========================================================================
  let habitScore = 0;
  let hasBehaviorChangeVerb = false;

  if (habitFrequency.test(lowerText)) {
    habitScore += 0.5;
    signals.push('habitFrequency');
  }
  if (habitPatterns.test(lowerText)) {
    habitScore += 0.4;
    signals.push('habitPatterns');
  }
  if (habitBehaviorChange.test(lowerText)) {
    hasBehaviorChangeVerb = true;
    signals.push('habitBehaviorChange');
  }

  // Behavior change verb + concrete trackable behavior = HABIT
  // Behavior change verb + abstract mental state = LOG
  if (hasBehaviorChangeVerb) {
    const hasConcreteTarget = concreteTrackableBehaviors.test(lowerText);
    const hasAbstractTarget = abstractMentalStates.test(lowerText);

    if (hasConcreteTarget && !hasAbstractTarget) {
      // "Stop smoking", "Reduce caffeine" → HABIT
      habitScore += 0.5;
      signals.push('concreteTrackableBehavior');
    } else if (hasAbstractTarget) {
      // "Stop overthinking", "Be less anxious" → LOG (can't track)
      // Return early as LOG/journal
      signals.push('abstractMentalState');
      return {
        bucket: 'log',
        subtypeHint: 'journal',
        habitSubtypeHint: null,
        confidence: 0.5,
        signals,
      };
    } else {
      // Behavior change verb but unclear target - slight habit lean
      habitScore += 0.3;
      signals.push('behaviorChangeUnclearTarget');
    }
  }

  // ==========================================================================
  // Calculate log score (starts with base score)
  // ==========================================================================
  let logScore = 0.1;
  let hasJournalPhrases = false;

  if (journalPhrases.test(lowerText)) {
    logScore += 0.4;
    hasJournalPhrases = true;
    signals.push('journalPhrases');
  }
  if (narrativeIndicators.test(lowerText)) {
    logScore += 0.3;
    signals.push('narrativeIndicators');
  }

  // Attachments boost log score
  if (context.hasAttachments) {
    logScore += 0.4;
    signals.push('hasAttachments');
  }

  // Abstract mental state without behavior change verb → LOG
  if (abstractMentalStates.test(lowerText) && !hasBehaviorChangeVerb) {
    logScore += 0.3;
    signals.push('abstractMentalStateAlone');
  }

  // ==========================================================================
  // Determine subtype hint for logs
  // ==========================================================================
  let subtypeHint: LogSubtype | null = null;
  if (hasJournalPhrases) {
    subtypeHint = 'journal';
  } else {
    subtypeHint = 'general';
  }

  // ==========================================================================
  // Pick winner bucket
  // ==========================================================================
  let bucket: MindDropBucket;
  let confidence: number;
  let habitSubtypeHint: HabitSubtype | null = null;

  if (todoScore >= 0.3 && todoScore >= habitScore && todoScore >= logScore) {
    bucket = 'todo';
    confidence = todoScore;
    subtypeHint = null; // No subtype for todos
  } else if (habitScore >= 0.4 && habitScore >= todoScore && habitScore >= logScore) {
    bucket = 'habit';
    confidence = habitScore;
    subtypeHint = null; // No subtype for habits
    habitSubtypeHint = detectHabitSubtype(text); // Detect build vs break
  } else {
    bucket = 'log';
    confidence = logScore;
    // subtypeHint already set above
  }

  return {
    bucket,
    subtypeHint,
    habitSubtypeHint,
    confidence,
    signals,
  };
}
