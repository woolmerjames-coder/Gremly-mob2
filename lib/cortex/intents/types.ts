/**
 * Phase 10.7: Conversational Intelligence v2
 * Intent detection types for smart suggestions
 */

export type IntentKind =
  | 'habit'
  | 'todo'
  | 'note'
  | 'reflection'
  | 'idea'
  | 'question'
  | 'ambiguous'
  | 'habit_reminder' // Phase 11.2: Reminder configuration in habit context
  | 'none';

export interface AlternativeIntent {
  kind: IntentKind;
  confidence: number;
  subtype?: string;
  rationale: string; // Why this interpretation is valid
}

export interface DetectedIntent {
  kind: IntentKind;
  confidence: number; // 0–1
  title?: string; // e.g., "Start running daily"
  why?: string; // explanation or rationale
  curiositySuggestion?: string; // Phase 10.7C: clarifying question before action
  suppressChips?: boolean; // Phase 10.7D: prevent chip display (for planning/exploring)
  isPlanning?: boolean; // Phase 10.7D: user is in planning/exploring mode
  isCommand?: boolean; // Phase 10.10: explicit command verb detected (set/add/create/etc)
  isMetaComment?: boolean; // Explicit flag for meta-comments that should never create actions
  requiresAction?: boolean; // Whether this intent should trigger action creation (vs just conversation)
  // Phase 10.11B: Ambiguity support for disambiguation toast
  options?: Array<'todo' | 'note'>; // candidate choices when ambiguous
  confidences?: { todo?: number; note?: number }; // raw confidences for candidates
  showDisambiguationToast?: boolean; // hint for UI to surface chooser
  // Phase 11.5: Multi-intent detection
  alternativeIntents?: AlternativeIntent[]; // Other valid interpretations
  isMultiIntent?: boolean; // Whether multiple intents should be created
}
