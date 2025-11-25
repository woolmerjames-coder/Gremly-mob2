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
  | 'social' // Social interactions, compliments, gratitude - not actions
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
  // Phase 11.8: AI confidence scoring
  aiConfidence?: number; // 0–100, AI's confidence in classification (optional)
  // Phase 4: Unified classifier fields from Cloudflare Worker
  classifierBucket?: string; // Master classifier bucket (todo|habit|log-journal|log-idea|log-general|unsorted)
  classifierType?: string; // Derived type (todo|habit|log|ignore)
  classifierSubtype?: string | null; // Subtype for logs (journal|idea|general|null)
  classifierTitle?: string; // AI-generated title from classifier
  classifierTags?: string[]; // AI-generated tags from classifier
  // Phase 3.2: Canonical intent result (computed once in classifyIntentWithAI)
  canonicalType?: 'todo' | 'habit' | 'log' | 'ignore'; // Canonical type from resolver
  canonicalAllowAutoCreate?: boolean; // Whether this intent should auto-create
  canonicalSuppressChips?: boolean; // Whether to suppress chips
  canonicalConfidence?: number; // Canonical confidence (0-1 scale)
  canonicalReasoning?: string; // Why this classification was chosen
}
