/**
 * Multi-Intent Detector - Phase 11.5
 * Recognizes when input could validly be multiple types
 * Provides smart disambiguation and multi-creation options
 */

import type { DetectedIntent, IntentKind, AlternativeIntent } from './types';
import { detectIntent } from './detectIntent';

interface MultiIntentContext {
  conversationTopic?: { type: string; id?: string };
  lastUserMessage?: string;
  recentIntents?: IntentKind[];
  hasPersonContext?: boolean;
}

/**
 * Explains why a particular intent interpretation is valid
 */
function explainIntentChoice(text: string, kind: IntentKind): string {
  const normalized = text.toLowerCase();

  switch (kind) {
    case 'todo':
      if (/\b(need to|have to|must|should|remind me)\b/i.test(text)) {
        return 'Contains action language suggesting a task';
      }
      if (/\b(by|before|until|deadline)\b/i.test(text)) {
        return 'Has time constraint indicating a todo';
      }
      return 'Appears to be an actionable task';

    case 'note':
      if (/\b(remember|note|write down|jot down|capture)\b/i.test(text)) {
        return 'Language suggests capturing information';
      }
      if (/\b(thought|idea|observation|insight)\b/i.test(text)) {
        return 'Seems like a thought or idea to capture';
      }
      return 'Could be information worth noting';

    case 'habit':
      if (/\b(every|daily|weekly|regularly|consistently)\b/i.test(text)) {
        return 'Contains recurring frequency language';
      }
      if (/\b(start|build|develop|practice)\b/i.test(text)) {
        return 'Suggests building a regular practice';
      }
      return 'Could be tracked as a recurring habit';

    case 'reflection':
      if (/\b(feel|feeling|felt|think|believe)\b/i.test(text)) {
        return 'Contains reflective or emotional language';
      }
      return 'Appears to be a personal reflection';

    default:
      return 'Could be interpreted this way';
  }
}

/**
 * Detects text as a specific intent type with force-classification
 */
function detectIntentAsType(text: string, targetKind: IntentKind): DetectedIntent {
  // Use existing detectIntent but bias toward the target type
  const baseIntent = detectIntent(text);

  // If already matches target, return it
  if (baseIntent.kind === targetKind) {
    return baseIntent;
  }

  // Otherwise, create a new intent with adjusted confidence
  let confidence = 0;

  const normalized = text.toLowerCase().trim();

  switch (targetKind) {
    case 'todo':
      // Task language
      if (/\b(need to|have to|must|should|need|want to)\b/i.test(text)) confidence += 0.3;
      if (/\b(remind me|don't forget|remember to)\b/i.test(text)) confidence += 0.25;
      if (/\b(by|before|deadline|due|until)\b/i.test(text)) confidence += 0.2;
      if (/\b(call|email|buy|get|pick up|finish|complete)\b/i.test(text)) confidence += 0.15;
      break;

    case 'note':
      // Information capture language
      if (/\b(note|jot down|write down|capture|save|remember)\b/i.test(text)) confidence += 0.3;
      if (/\b(thought|idea|observation|insight|learned)\b/i.test(text)) confidence += 0.25;
      if (!/\b(need to|have to|must)\b/i.test(text)) confidence += 0.1; // Not task-like
      break;

    case 'habit':
      // Recurring pattern language
      if (/\b(every|daily|weekly|monthly|regularly|consistently)\b/i.test(text)) confidence += 0.4;
      if (/\b(start|build|develop|practice|maintain|track)\b/i.test(text)) confidence += 0.2;
      if (/\b(morning|evening|night|day|week)\b/i.test(text)) confidence += 0.15;
      break;

    case 'reflection':
      // Reflective language
      if (/\b(feel|feeling|felt|think|believe|realize|understand)\b/i.test(text)) confidence += 0.3;
      if (/\b(grateful|proud|happy|sad|anxious|excited)\b/i.test(text)) confidence += 0.25;
      break;
  }

  return {
    kind: targetKind,
    confidence: Math.min(confidence, 0.95), // Cap at 0.95 for non-primary
    title: text,
  };
}

/**
 * Determines if multiple intents should be auto-created
 */
function shouldCreateMultiple(intents: DetectedIntent[], ctx: MultiIntentContext): boolean {
  if (intents.length < 2) return false;

  const kinds = intents.map((i) => i.kind);
  const primaryKind = kinds[0];
  const text = ctx.lastUserMessage?.toLowerCase() || '';

  // Case 1: Person context + todo reminder
  // "Remind me to call Sarah about the project"
  if (
    ctx.hasPersonContext &&
    kinds.includes('note') &&
    kinds.includes('todo') &&
    /\b(remind|remember to|don't forget|need to call|should call)\b/i.test(text)
  ) {
    return true;
  }

  // Case 2: Habit tracking + note about why
  // "Start meditating daily to reduce stress"
  if (
    kinds.includes('habit') &&
    kinds.includes('note') &&
    /\b(to|because|for|so that)\b/i.test(text) &&
    intents[0].confidence > 0.8 &&
    intents[1].confidence > 0.7
  ) {
    return true;
  }

  // Case 3: Todo with reflection
  // "Need to finish the report - feeling overwhelmed"
  if (
    kinds.includes('todo') &&
    kinds.includes('reflection') &&
    /[-–—]|but |however |though /i.test(text)
  ) {
    return true;
  }

  // Default: Don't auto-create multiple unless clearly beneficial
  return false;
}

/**
 * Detects multiple valid intent interpretations
 */
export function detectMultipleIntents(text: string, ctx: MultiIntentContext = {}): DetectedIntent {
  const intents: DetectedIntent[] = [];

  // Run detection for each possible type
  const possibleTypes: IntentKind[] = ['todo', 'note', 'habit', 'reflection'];

  for (const type of possibleTypes) {
    const intent = detectIntentAsType(text, type);
    if (intent.confidence > 0.6) {
      intents.push(intent);
    }
  }

  // If no intents detected, fall back to standard detection
  if (intents.length === 0) {
    return detectIntent(text);
  }

  // If only one intent detected, return it
  if (intents.length === 1) {
    return intents[0];
  }

  // Multiple valid intents detected - sort by confidence
  intents.sort((a, b) => b.confidence - a.confidence);

  const primary = intents[0];
  const alternatives: AlternativeIntent[] = intents.slice(1).map((intent) => ({
    kind: intent.kind,
    confidence: intent.confidence,
    subtype: intent.title,
    rationale: explainIntentChoice(text, intent.kind),
  }));

  const isMulti = shouldCreateMultiple(intents, ctx);

  return {
    ...primary,
    alternativeIntents: alternatives,
    isMultiIntent: isMulti,
  };
}

/**
 * Gets a user-friendly label for intent type
 */
export function getIntentLabel(kind: IntentKind): string {
  switch (kind) {
    case 'habit':
      return 'Habit';
    case 'todo':
      return 'Task';
    case 'note':
      return 'Note';
    case 'reflection':
      return 'Reflection';
    case 'idea':
      return 'Idea';
    case 'question':
      return 'Question';
    default:
      return 'Item';
  }
}

/**
 * Gets a label for multiple intent creation
 */
export function getMultiLabel(intent: DetectedIntent): string {
  if (!intent.alternativeIntents || intent.alternativeIntents.length === 0) {
    return 'Multiple items';
  }

  const kinds = [intent.kind, ...intent.alternativeIntents.map((a) => a.kind)];
  const labels = kinds.map(getIntentLabel);

  if (labels.length === 2) {
    return `${labels[0]} & ${labels[1]}`;
  }

  return labels.join(', ');
}
