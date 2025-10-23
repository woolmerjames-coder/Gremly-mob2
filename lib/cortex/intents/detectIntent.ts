/**
 * Phase 10.7: Conversational Intelligence v2
 * Intent detection helper using rule-based classification
 *
 * This uses simple regex patterns for now. Can be replaced with
 * an ML endpoint later while keeping the same interface.
 */

import type { DetectedIntent } from './types';

/**
 * Detect user intent from input text
 * Returns intent kind, confidence, and suggested title
 * Priority: question > reflection > note > todo > habit > idea
 */
export function detectIntent(text: string): DetectedIntent {
  const t = text.toLowerCase();
  const trimmed = text.trim();

  // 1. Question patterns: question words or question mark (HIGHEST PRIORITY)
  if (
    /\?/.test(t) ||
    /^(who|what|where|when|why|how|can|could|would|should|is|are|do|does)\b/i.test(t)
  ) {
    return { kind: 'question', confidence: 0.8 };
  }

  // 2. Reflection patterns: introspective words
  if (
    /\b(reflect|journal|grateful|thankful|learned|realized|felt|feeling|today was|today has been|proud of|great day|wonderful|amazing day)\b/i.test(
      t,
    )
  ) {
    return { kind: 'reflection', confidence: 0.85, title: trimmed };
  }

  // 3. Note patterns: memory/reminder words
  if (/\b(note|remember|don't forget|remind me|keep in mind|write down|jot down)\b/i.test(t)) {
    return { kind: 'note', confidence: 0.8, title: trimmed };
  }

  // 4. To-do patterns: action verbs, deadlines
  if (
    /\b(todo|buy|finish|email|send|book|call|schedule|check|complete|submit|review|sign|pay|order|pick up|drop off|get|make|do)\b/i.test(
      t,
    ) &&
    !/\b(how do|how to|how can)\b/i.test(t)
  ) {
    return { kind: 'todo', confidence: 0.85, title: trimmed };
  }

  // 5. Habit patterns: routine, frequency words
  if (
    /every\s+(day|morning|night|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
      t,
    ) ||
    /habit|routine|daily|weekly/i.test(t)
  ) {
    return { kind: 'habit', confidence: 0.9, title: trimmed };
  }

  // 6. Idea patterns: creative/conceptual words (LOWEST PRIORITY)
  if (/\b(idea|concept|maybe we could|what if|thinking about|brainstorm|imagine)\b/i.test(t)) {
    return { kind: 'idea', confidence: 0.8, title: trimmed };
  }

  // No clear intent detected
  return { kind: 'none', confidence: 0 };
}
