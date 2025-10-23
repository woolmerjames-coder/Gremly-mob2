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
}
