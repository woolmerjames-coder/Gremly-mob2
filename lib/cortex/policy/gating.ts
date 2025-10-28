/* Shared gating policy for classification decisions (Mind Drop + Chat)
   One source of truth for thresholds and modes.
   Versioned for telemetry comparisons. */

export const POLICY_VERSION = 'gating-v1.0';

export type IntentKind =
  | 'todo'
  | 'habit'
  | 'note'
  | 'question'
  | 'reflection'
  | 'idea'
  | 'ambiguous'
  | 'none';

export interface GatingInput {
  intent: IntentKind;
  confidence: number; // 0..1
  isCommand?: boolean;
  isMetaComment?: boolean; // system/meta — never auto
  hasActionSignal?: boolean; // loose hint (e.g., imperative)
  hasTimeSignal?: boolean; // loose hint (e.g., 'tomorrow', 'Friday')
}

export type GatingMode = 'auto' | 'ask' | 'keep' | 'unsorted';

export interface GatingDecision {
  mode: GatingMode;
  reason: string;
  policyVersion: string;
  // Hints for UI
  showChips?: boolean;
  chipKind?: 'todo' | 'habit' | 'note' | 'disambiguate';
}

export const THRESHOLDS = {
  auto: 0.9,
  askLow: 0.7,
} as const;

/** Returns a unified gating decision based on input signals and confidence. */
export function decideGating(input: GatingInput): GatingDecision {
  const { intent, confidence, isCommand, isMetaComment, hasActionSignal, hasTimeSignal } = input;

  // Meta/system comments never auto-create
  if (isMetaComment) {
    return {
      mode: 'unsorted',
      reason: 'meta_comment',
      policyVersion: POLICY_VERSION,
      showChips: false,
    };
  }

  // Explicit commands bypass thresholds (quality requirement)
  if (isCommand) {
    return {
      mode: 'auto',
      reason: 'explicit_command',
      policyVersion: POLICY_VERSION,
      showChips: false,
    };
  }

  // Ambiguity handling: prefer surfacing chips in the middle band
  const midBand = confidence >= THRESHOLDS.askLow && confidence < THRESHOLDS.auto;

  // High confidence ⇒ auto
  if (confidence >= THRESHOLDS.auto) {
    return {
      mode: 'auto',
      reason: 'high_confidence',
      policyVersion: POLICY_VERSION,
      showChips: false,
    };
  }

  // Mid band ⇒ ask
  if (midBand) {
    // If the detected intent is ambiguous, explicitly request disambiguation
    if (intent === 'ambiguous') {
      return {
        mode: 'ask',
        reason: 'mid_confidence_ambiguous',
        policyVersion: POLICY_VERSION,
        showChips: true,
        chipKind: 'disambiguate',
      };
    }

    // Otherwise, propose chips for the detected kind
    const chipKind =
      intent === 'todo' || intent === 'habit' || intent === 'note' ? intent : 'disambiguate';

    return {
      mode: 'ask',
      reason: 'mid_confidence',
      policyVersion: POLICY_VERSION,
      showChips: true,
      chipKind,
    };
  }

  // Low confidence ⇒ keep as note only if no action/time signals
  const hasSignals = !!hasActionSignal || !!hasTimeSignal;

  if (!hasSignals) {
    return {
      mode: 'keep',
      reason: 'low_confidence_no_signals',
      policyVersion: POLICY_VERSION,
      showChips: false,
    };
  }

  // Edge case: low confidence but signals exist — ask instead of silently keeping
  return {
    mode: 'ask',
    reason: 'low_confidence_with_signals',
    policyVersion: POLICY_VERSION,
    showChips: true,
    chipKind: 'disambiguate',
  };
}
