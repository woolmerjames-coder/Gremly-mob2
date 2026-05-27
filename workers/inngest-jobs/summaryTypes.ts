/**
 * summaryTypes — shared contract for the adaptive weekly summary pipeline (Phase 3 v0.5).
 *
 * This file is the single source of truth for the Detector interface, the Candidate shape,
 * and the typed template/card schemas. It is deliberately designed to accommodate BOTH
 * detector execution models, even though Phase 3 only builds the SQL-backed ones:
 *
 *   - source: 'sql'             — fires from a Postgres detector function (built now)
 *   - source: 'analyst_ledger'  — fires by reading persisted analyst observations (Phase 4)
 *
 * The uniform `detect(ctx)` method + the rich DetectContext mean a Phase 4 ledger detector
 * slots into the same registry and the same COMPOSE/FILL/RENDER stages without a retrofit.
 * See the "PHASE 4 FORWARD-DESIGN" note at the bottom.
 */

// ───────────────────────────────────────────────────────────────────────────
// Identifiers
// ───────────────────────────────────────────────────────────────────────────

export type DetectorId =
  // always-fires
  | 'hero_spine'
  | 'letter'
  // deterministic (SQL) — surface metrics, demoted to riding alongside the ledger selectors
  | 'reschedule_as_soft_no'
  | 'cadence_calibration_mismatch'
  | 'cross_domain_alignment'
  | 'decisive_closure'
  // analyst-ledger (the depth: cross-week interpretive findings the user cannot see themselves)
  | 'sustained_chat_action_gap'
  | 'named_person_arc'
  | 'state_cluster_burst'
  | 'ambient_meta_theme'
  | 'return_longing'
  | 'naming_then_acting'
  | 'the_question'
  | 'magic_moment'
  | 'behavioral_discovery'
  // synthesis / framing
  | 'cross_reference'
  | 'week_shape';

export type TemplateId =
  | 'hero_spine_v1'
  | 'then_now_split_v1'
  | 'rank_list_v1'
  | 'constellation_v1'
  | 'big_number_v1'
  | 'letter_v1'
  // referenced by ledger detectors; renderers/schemas added with the FILL/RENDER wiring (Unit follow-on)
  | 'single_sentence_v1'
  | 'evidence_chain_v1'
  | 'photo_lead_v1';

export type Valence = 'positive' | 'negative' | 'mixed' | 'neutral';
export type Urgency = 'low' | 'medium' | 'high';
export type CadenceType = 'always' | 'episodic' | 'slow_moving' | 'milestone';
export type RecommendationKind = 'try' | 'hold' | 'mark' | 'protect';

export type GateRule =
  | 'user_initiated_only'
  | 'requires_user_named_topic'
  | 'no_diagnostic_language'
  | 'requires_followthrough_signal'
  | 'requires_min_data_age'
  | { kind: 'min_evidence_count'; n: number }
  | { kind: 'min_data_volume'; tier: 'low' | 'medium' | 'high' };

// ───────────────────────────────────────────────────────────────────────────
// Execution context — carries what EITHER model needs
// ───────────────────────────────────────────────────────────────────────────

/**
 * Runs a named Postgres detector function via /rest/v1/rpc and returns its jsonb result.
 * fnName e.g. 'summary_detect_reschedule_as_soft_no'.
 */
export type DetectorSqlRunner = (
  fnName: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

export interface DetectContext {
  userId: string;
  weekStart: string; // 'yyyy-MM-dd'
  weekEnd: string; // 'yyyy-MM-dd'
  env: Record<string, string>;
  /** SQL-backed detectors call this. */
  runDetectorSql: DetectorSqlRunner;
  /** Raw row fetch (REST passthrough) for the few non-function reads (cortex_preferences). */
  fetchRows: (path: string) => Promise<unknown[]>;

  // ── PHASE 4 (optional now, undefined in v0.5) ──────────────────────────────
  /** Persisted analyst observations for this user-week (stage='analyst'). Phase 4 ledger detectors read this. */
  analystObservations?: AnalystObservation[];
  /** Prior surfaced observations, for FILTER recency/evolution. Phase 4 only. */
  priorObservations?: SurfacedObservation[];
}

/** Shape of an analyst-ledger row (observations.stage='analyst'). Read by ledger-selector DETECT. */
export interface AnalystObservation {
  kind: string; // 'temporal_observation' | 'magic_moment' | 'behavioral_fingerprint' | ...
  detector_id: string | null; // null on analyst-emitted rows; the kind/pattern_type is the discriminator
  claim_summary: string;
  evidence_snapshot: Record<string, unknown>; // shape varies by kind (see summaryLedgerDetectors)
  observed_for_week: string;
}

/** A previously surfaced observation, used by FILTER recency checks. Phase 4 consumer. */
export interface SurfacedObservation {
  detector_id: string;
  surfaced_at: string;
  evidence_snapshot: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────
// Detector contract
// ───────────────────────────────────────────────────────────────────────────

export interface Detector {
  id: DetectorId;
  source: 'sql' | 'analyst_ledger';
  cadence_type: CadenceType;
  valence: Valence;
  urgency: Urgency;

  /** Cooldown before re-fire. Stored now; ENFORCED in Phase 4 FILTER (no-op in v0.5). */
  recency_window_weeks: number;
  /** Below this, a re-fire is allowed as a successor. Stored now; Phase 4 FILTER. */
  evolution_similarity_threshold: number;

  gates: GateRule[];
  /** Ranked. COMPOSE assigns preferred_templates[0]; on a VARIETY clash it walks the list. */
  preferred_templates: TemplateId[];
  reframe_template: string;
  recommendation_kind: RecommendationKind | null;
  data_lineage_footer_template: string;
  concept_compatible: boolean;

  /**
   * Uniform across both execution models.
   *  - source 'sql':            implementation calls ctx.runDetectorSql(...)
   *  - source 'analyst_ledger': implementation reads ctx.analystObservations (Phase 4)
   * Returns zero or more candidates (zero = did not fire).
   */
  detect(ctx: DetectContext): Promise<Candidate[]>;
}

// ───────────────────────────────────────────────────────────────────────────
// Candidate — what a detector emits; what COMPOSE orders; what FILL fills
// ───────────────────────────────────────────────────────────────────────────

export interface Candidate {
  detector_id: DetectorId;
  /** Assigned by the detector to preferred_templates[0]; may be reassigned by COMPOSE. */
  template_id: TemplateId;
  valence: Valence;
  urgency: Urgency;

  /** The deterministic facts FILL turns into prose. Shape is per-template (see fillInputs below). */
  fill_input: Record<string, unknown>;
  /** The mandatory "it's not X, it's Y" prose shape handed to FILL. */
  reframe_template: string;
  recommendation_kind: RecommendationKind | null;
  /** Deterministic footer string (already resolved; FILL does not touch it). */
  data_lineage: string;
  concept_compatible: boolean;
  /** Subject key for cross-week dedup (analyst `subject` / moment title / fingerprint pattern). Used by FILTER. */
  dedup_key?: string;

  /** For Phase 4 recency/evolution comparison. Populated now, unused by v0.5 FILTER. */
  evidence_snapshot: Record<string, unknown>;
  /** Logged verbatim to detector_fires.score_components. */
  score_components: Record<string, unknown>;
  /** When true, COMPOSE pins this candidate to the front of the middle deck (before variety ordering). */
  lead?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Template / card schemas (the JSON the native renderer will consume; FILL produces these)
// ───────────────────────────────────────────────────────────────────────────

export interface Recommendation {
  kind: RecommendationKind;
  text: string; // <= 30 words
}

/** Common header/footer present on every card. */
export interface CommonCardFields {
  type: TemplateId; // discriminator the renderer switches on
  source_detector: DetectorId;
  valence: Valence;
  eyebrow_icon: string; // Lucide icon name
  eyebrow_text: string; // <= 6 words
  hero_sentence: string; // <= 14 words
  hero_continuation?: string; // <= 8 words, italic accent
  insight: string; // <= 55 words, mandatory
  recommendation?: Recommendation;
  concept_ref: ConceptRef | null; // null in v0.5
  data_lineage_footer: string; // <= 18 words
}

export interface ConceptRef {
  slug: string;
  claim_short: string;
  citation_informal: string;
  citation_url?: string;
}

// ── Per-template body shapes ────────────────────────────────────────────────

export interface HeroSpineBody {
  vibe_label: string; // e.g. "This week was" (FILL)
  subtitle: string; // one sentence under the hero (FILL), <= 18 words
  week_range: string; // deterministic, e.g. "Apr 27 – May 3"
  stats: { value: string; label: string }[]; // deterministic 4-up
  mood_arc: { day_label: string; valence: Valence | null }[]; // null = intentional silence
  world_chips: { name: string; direction: 'up' | 'down' | 'flat' }[];
}

export interface ThenNowSplitBody {
  left: { label: string; value: string; sub: string; tone: 'positive' };
  right: { label: string; value: string; sub: string; tone: 'amber' };
}

export interface RankListBody {
  tiers: { tier_label: string; items: { primary: string; secondary: string }[] }[];
}

export interface ConstellationBody {
  nodes: { label: string; sublabel: string }[];
}

export interface BigNumberBody {
  number: string;
  unit: string;
  context_line: string; // <= 24 words (FILL)
}

export interface LetterBody {
  paragraphs: string[]; // 2–3, FILL
  signature: { name: string; level: number; state: string };
}

export type CardBody =
  | HeroSpineBody
  | ThenNowSplitBody
  | RankListBody
  | ConstellationBody
  | BigNumberBody
  | LetterBody;

export type SummaryCard = CommonCardFields & { body: CardBody };

/** Envelope written to weekly_summaries.content in Phase 4; written to shadow_runs in Phase 3. */
export interface AdaptiveSummaryContent {
  content_version: 2;
  generated_for_week: string;
  cards: SummaryCard[];
  metadata: {
    deck_size: number;
    card_types: TemplateId[];
    fired_detectors: DetectorId[];
    compose_log: ComposeLogEntry[];
    cluster_log?: ClusterLogEntry[];
    fill_model: string;
    run_mode: 'shadow';
  };
}

export interface ComposeLogEntry {
  detector_id: DetectorId;
  template_id: TemplateId | null;
  accepted: boolean;
  reason: string;
}

export interface ClusterLogEntry {
  representative: DetectorId;
  absorbed: { detector_id: DetectorId; subject: string }[];
}
export interface ClusterResult {
  representatives: Candidate[];
  log: ClusterLogEntry[];
}

// ───────────────────────────────────────────────────────────────────────────
// Mood valence map
//
// Fully specified by the schema audit. This is the trivial Phase-1 constant; if a canonical
// MOOD_VALENCE already lives in the codebase, dedupe to it and delete this copy.
// ───────────────────────────────────────────────────────────────────────────

export const MOOD_VALENCE: Record<string, 'positive' | 'negative' | 'neutral'> = {
  great: 'positive',
  good: 'positive',
  grateful: 'positive',
  hopeful: 'positive',
  focused: 'positive',
  calm: 'positive',
  okay: 'neutral',
  low: 'negative',
  tired: 'negative',
  anxious: 'negative',
  overwhelmed: 'negative',
  frustrated: 'negative',
  scattered: 'negative',
};

/** An entry is positive if it has >=1 positive and 0 negative tags; negative if the mirror; else mixed/neutral. */
export function moodArrayValence(moods: string[] | null | undefined): Valence | null {
  if (!moods || moods.length === 0) return null; // silence
  let pos = 0;
  let neg = 0;
  for (const m of moods) {
    const v = MOOD_VALENCE[(m || '').toLowerCase()];
    if (v === 'positive') pos++;
    else if (v === 'negative') neg++;
  }
  if (pos > 0 && neg === 0) return 'positive';
  if (neg > 0 && pos === 0) return 'negative';
  if (pos > 0 && neg > 0) return 'mixed';
  return 'neutral';
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE 4 FORWARD-DESIGN — how a ledger detector fits this same interface
//
// A Phase 4 analyst-fed detector is authored identically, differing only in `source` and
// the body of detect():
//
//   export const sustainedChatActionGap: Detector = {
//     id: 'sustained_chat_action_gap',
//     source: 'analyst_ledger',
//     ...
//     async detect(ctx) {
//       const obs = (ctx.analystObservations ?? []).filter(o => o.detector_id === 'temporal_observations');
//       // interpret obs into Candidate[]; no SQL
//     },
//   };
//
// The registry (summaryDetectors), COMPOSE, FILL, and RENDER do not change. The orchestrator
// skips any detector whose source is 'analyst_ledger' while ctx.analystObservations is undefined,
// which is the v0.5 state. That is the entire seam.
// ───────────────────────────────────────────────────────────────────────────
