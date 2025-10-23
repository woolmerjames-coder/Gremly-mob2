/**
 * Phase 10.7: Conversational Intelligence v2
 * Phase 10.7D: Hardened intent detection with advice-first mode
 * Intent detection helper using rule-based classification
 *
 * This uses simple regex patterns for now. Can be replaced with
 * an ML endpoint later while keeping the same interface.
 */

import type { DetectedIntent } from './types';

/**
 * Detect user intent from input text
 * Returns intent kind, confidence, and suggested title
 *
 * Phase 10.7D Changes:
 * - Priority: question > note > habit > todo > reflection > idea
 * - New thresholds: habit≥0.85, todo≥0.88, note≥0.80, question≥0.70
 * - Planning/exploring detector forces question mode
 * - Advice-first: default to guidance, not creation
 */
export function detectIntent(text: string): DetectedIntent {
  const t = text.toLowerCase();
  const trimmed = text.trim();

  // Special-case: creative exploration phrases should be classified as ideas
  // Ensure these do not get downgraded to questions by planning/exploring detector
  if (
    /^\s*what if\b/i.test(text) ||
    /^\s*maybe we could\b/i.test(text) ||
    /^\s*imagine\b/i.test(text)
  ) {
    return {
      kind: 'idea',
      confidence: 0.8,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
    };
  }

  // 0. Planning/exploring detector (HIGHEST PRIORITY)
  // Forces question mode to provide advice instead of chips
  if (
    /\b(planning|thinking about|explore|exploring|not ready|just planning ahead|considering|might)\b/i.test(
      t,
    )
  ) {
    return {
      kind: 'question',
      confidence: 0.75,
      suppressChips: true, // Flag to prevent chip display
      isPlanning: true,
    };
  }

  // 0.5 Idea-first phrases that look like questions but are ideation
  // Ensure "what if" and "maybe we could" classify as idea before generic question detection
  if (/\b(what if|maybe we could)\b/i.test(t)) {
    return {
      kind: 'idea',
      confidence: 0.8,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
    };
  }

  // 1. Question patterns: question words or question mark
  // Lowered threshold to 0.70 for better question detection
  if (
    /\?/.test(t) ||
    /^(who|what|where|when|why|how|can|could|would|should|is|are|do|does)\b/i.test(t)
  ) {
    return { kind: 'question', confidence: 0.8 };
  }

  // 2. Note patterns: memory/reminder words
  // Moved up priority: question > note > habit > todo
  if (/\b(note|remember|don't forget|remind me|keep in mind|write down|jot down)\b/i.test(t)) {
    return {
      kind: 'note',
      confidence: 0.85, // P0 Fix: Raised to match pipeline threshold
      title: trimmed,
      curiositySuggestion: 'Should I capture this as a note, or just keeping it in mind?',
    };
  }

  // 3. Habit patterns: routine, frequency words
  // Raised threshold to 0.90 for more confidence
  if (
    /every\s+(day|morning|night|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
      t,
    ) ||
    /habit|routine|daily|weekly/i.test(t)
  ) {
    return {
      kind: 'habit',
      confidence: 0.9, // P0 Fix: Raised to match pipeline threshold
      title: trimmed,
      curiositySuggestion: 'Want structured help building this habit, or just exploring?',
    };
  }

  // 4. To-do patterns: action verbs, deadlines
  // Raised threshold to 0.92 for highest confidence
  if (
    /\b(todo|buy|finish|email|send|book|call|schedule|check|complete|submit|review|sign|pay|order|pick up|drop off|get|make|do)\b/i.test(
      t,
    ) &&
    !/\b(how do|how to|how can)\b/i.test(t)
  ) {
    return {
      kind: 'todo',
      confidence: 0.92, // P0 Fix: Raised to match pipeline threshold
      title: trimmed,
      curiositySuggestion: 'Want me to add this as a to-do, or just planning ahead?',
    };
  }

  // 5. Reflection patterns: introspective words
  if (
    /\b(reflect|journal|grateful|thankful|learned|realized|felt|feeling|today was|today has been|proud of|great day|wonderful|amazing day)\b/i.test(
      t,
    )
  ) {
    return {
      kind: 'reflection',
      confidence: 0.85,
      title: trimmed,
      curiositySuggestion: 'Want to save this as a reflection, or just thinking out loud?',
    };
  }

  // 6. Idea patterns: creative/conceptual words (LOWEST PRIORITY)
  if (/\b(idea|concept|maybe we could|what if|brainstorm|imagine)\b/i.test(t)) {
    return {
      kind: 'idea',
      confidence: 0.8,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
    };
  }

  // No clear intent detected
  return { kind: 'none', confidence: 0 };
}
