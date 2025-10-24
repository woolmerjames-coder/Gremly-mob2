/**
 * Phase 10.7: Conversational Intelligence v2
 * Phase 10.7D: Hardened intent detection with advice-first mode
 * Intent detection helper using centralized rule-based classification
 *
 * This now delegates to intentRules.ts for the single source of truth.
 * All classification logic is centralized in intentRules.ts.
 */

import type { DetectedIntent } from './types';
import { classifyIntent } from './intentRules';

/**
 * Detect user intent from input text
 * Returns intent kind, confidence, and suggested title
 *
 * Phase 10.7D Changes:
 * - Priority: question > note > habit > todo > reflection > idea
 * - New thresholds: habit≥0.85, todo≥0.88, note≥0.80, question≥0.70
 * - Planning/exploring detector forces question mode
 * - Advice-first: default to guidance, not creation
 *
 * Phase 10.10 Changes:
 * - Detect explicit command verbs (set/add/create/save/send/log)
 * - Set isCommand flag to bypass cooldown and enable immediate action
 * - "remember" excluded from commands (it's a note hint, not explicit command)
 *
 * Phase 10.12 Changes:
 * - Refactored to use centralized intentRules.ts
 * - All regex patterns and classification logic moved to single source of truth
 * - This function now acts as a thin wrapper with optional enhancements
 */
export function detectIntent(text: string): DetectedIntent {
  // Delegate to centralized classification system
  const result = classifyIntent(text);

  // Add optional curiosity suggestions based on intent kind
  // These provide contextual follow-up questions for ambiguous cases
  if (!result.curiositySuggestion) {
    switch (result.kind) {
      case 'habit':
        result.curiositySuggestion = 'Want structured help building this habit, or just exploring?';
        break;
      case 'todo':
        result.curiositySuggestion = 'Want me to add this as a to-do, or just planning ahead?';
        break;
      case 'note':
        result.curiositySuggestion = 'Should I capture this as a note, or just keeping it in mind?';
        break;
      case 'idea':
        result.curiositySuggestion = 'Should I capture this idea, or just brainstorming?';
        break;
      case 'reflection':
        result.curiositySuggestion =
          'Want to save this as a reflection, or just thinking out loud?';
        break;
      case 'ambiguous':
        result.curiositySuggestion = 'Should I save this as a to-do or a note?';
        break;
      // No suggestions for questions, meta-comments, or none
    }
  }

  return result;
}
