/**
 * Heuristic Classification for Mind Drop
 *
 * Fast, regex-based classification to provide instant bucket prediction
 * before AI enrichment completes. Used for optimistic UI updates.
 */

import { MindDropBucket, LogSubtype } from './types';

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
  /** Confidence score (0-1) */
  confidence: number;
  /** Debug signals showing which patterns matched */
  signals: string[];
}

// Regex patterns for classification
const todoVerbs =
  /\b(buy|get|call|email|schedule|book|remind|cancel|update|fix|send|submit|finish|complete|pick up|drop off)\b/;
const todoKeywords =
  /\b(todo|task|asap|urgent|deadline|by|before|due|need to|have to|must|should)\b/;
const imperativeStart =
  /^(buy|get|call|email|schedule|book|remind|cancel|update|fix|send|submit|finish|complete|pick|drop|make|do|check|review|prepare|write|create|set up)\b/i;
const habitFrequency =
  /\b(every|daily|weekly|monthly|each|routine|habit|practice|quit|stop|start doing|keep doing)\b/;
const habitPatterns =
  /\b(\d+x\s*(a|per)\s*(day|week|month)|every\s+(morning|evening|night|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const journalPhrases =
  /\b(i feel|i think|i wonder|i realized|i noticed|i'm grateful|grateful for|thankful)\b/i;
const ideaPhrases = /\b(idea:|what if|maybe we|could we|how about|imagine if)\b/i;
const narrativeIndicators =
  /\b(feeling|felt|realized|thinking|thought|wondering|noticed|today|yesterday|just|had a|went to|saw|met|talked)\b/;

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

  // Calculate todo score
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

  // Calculate habit score
  let habitScore = 0;
  if (habitFrequency.test(lowerText)) {
    habitScore += 0.5;
    signals.push('habitFrequency');
  }
  if (habitPatterns.test(lowerText)) {
    habitScore += 0.4;
    signals.push('habitPatterns');
  }

  // Calculate log score (starts with base score)
  let logScore = 0.1;
  let hasJournalPhrases = false;
  let hasIdeaPhrases = false;

  if (journalPhrases.test(lowerText)) {
    logScore += 0.4;
    hasJournalPhrases = true;
    signals.push('journalPhrases');
  }
  if (narrativeIndicators.test(lowerText)) {
    logScore += 0.3;
    signals.push('narrativeIndicators');
  }
  if (ideaPhrases.test(lowerText)) {
    logScore += 0.3;
    hasIdeaPhrases = true;
    signals.push('ideaPhrases');
  }

  // Attachments boost log score
  if (context.hasAttachments) {
    logScore += 0.4;
    signals.push('hasAttachments');
  }

  // Determine subtype hint for logs
  let subtypeHint: LogSubtype | null = null;
  if (hasIdeaPhrases) {
    subtypeHint = 'idea'; // idea overrides journal
  } else if (hasJournalPhrases) {
    subtypeHint = 'journal';
  } else {
    subtypeHint = 'general';
  }

  // Pick winner bucket
  let bucket: MindDropBucket;
  let confidence: number;

  if (todoScore >= 0.3 && todoScore >= habitScore && todoScore >= logScore) {
    bucket = 'todo';
    confidence = todoScore;
    subtypeHint = null; // No subtype for todos
  } else if (habitScore >= 0.4 && habitScore >= todoScore && habitScore >= logScore) {
    bucket = 'habit';
    confidence = habitScore;
    subtypeHint = null; // No subtype for habits
  } else {
    bucket = 'log';
    confidence = logScore;
    // subtypeHint already set above
  }

  return {
    bucket,
    subtypeHint,
    confidence,
    signals,
  };
}
