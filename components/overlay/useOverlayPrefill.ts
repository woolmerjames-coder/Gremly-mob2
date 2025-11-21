/**
 * PHASE 2B: AI Prefill Disabled
 *
 * AI enrichment has been moved to background pipeline (backgroundPrefill.ts)
 * Overlay is now a pure editor - no AI generation on open/edit.
 *
 * This stub always returns empty/false/null values - no conditional logic.
 */

export type SuggestedTag = { name: string; lowConfidence?: boolean };

const noOpRefresh = async () => {
  // Phase 2B: No-op - AI permanently disabled
  return null;
};

export default function useOverlayPrefill(_opts: {
  mode: 'create' | 'edit';
  getText: () => string;
  skipAutoRun?: boolean;
}): {
  shouldRunMindDropPrefill: boolean;
  suggestedTitle: string | null;
  suggestedTags: SuggestedTag[];
  aiTags: SuggestedTag[];
  refresh: typeof noOpRefresh;
  loading: boolean;
  error: string | null;
} {
  // Phase 2B: Static stub - overlay AI permanently disabled
  return {
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: [],
    aiTags: [],
    refresh: noOpRefresh,
    loading: false,
    error: null,
  };
}
