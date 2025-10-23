/**
 * Phase 10.7: Conversational Intelligence v2
 * Intent detection types for smart suggestions
 */

export type IntentKind = 'habit' | 'todo' | 'note' | 'reflection' | 'idea' | 'question' | 'none';

export interface DetectedIntent {
  kind: IntentKind;
  confidence: number; // 0–1
  title?: string; // e.g., "Start running daily"
  why?: string; // explanation or rationale
  curiositySuggestion?: string; // Phase 10.7C: clarifying question before action
  suppressChips?: boolean; // Phase 10.7D: prevent chip display (for planning/exploring)
  isPlanning?: boolean; // Phase 10.7D: user is in planning/exploring mode
}
