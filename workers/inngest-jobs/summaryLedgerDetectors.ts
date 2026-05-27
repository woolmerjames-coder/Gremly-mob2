/**
 * summaryLedgerDetectors — Unit 1 of the correction: the analyst-ledger DETECT path.
 *
 * This is the half of "Summary DETECT = analyst observations + deterministic SQL" (master spec §1)
 * that was skipped, and it is where the weekly's depth comes from. The analyst already did the
 * interpretive work and persisted it (observations.stage='analyst'); these detectors are THIN
 * SELECTORS over that ledger — they do not re-analyze. Per 0c §4 (line 54), Summary DETECT reads
 * `temporal_observations` + `magic_moment_candidates` + `behavioral_fingerprints`; `themes` and
 * `world_signal_candidates` are reserved for the Life Map rebuilder and Worlds (§1/§11), so they
 * are deliberately NOT read here — surfacing them in the weekly is the Worlds duplication that
 * cross_domain_alignment / decisive_closure wrongly committed.
 *
 * Real emission shapes (verified live against the ledger):
 *   temporal_observation.evidence_snapshot =
 *     { claim, subject, strength: 'high'|'medium'|'low', date_span:[s,e],
 *       pattern_type, evidence_refs: string[], valence_trend }
 *   magic_moment.evidence_snapshot =
 *     { title, date, why, journal_quote, connected_items: string[], enrichment_hint }
 *   behavioral_fingerprint.evidence_snapshot =
 *     { pattern, evidence, is_novel, themes_involved: string[], narrative_interest: 0..10, is_discovery_candidate }
 *
 * Detector field values (recency_window_weeks, evolution_similarity_threshold, valence, urgency,
 * preferred_templates, reframe, recommendation, gates) are transcribed from adaptive_summaries_spec
 * §4. Reframe strings are rephrased to remove em/en dashes per the house copy rule; their meaning is
 * preserved. recency_window_weeks / evolution_similarity_threshold are stored now and CONSUMED by
 * the FILTER stage (Unit 2).
 */

import type {
  Detector,
  Candidate,
  DetectContext,
  AnalystObservation,
  DetectorId,
  TemplateId,
  Valence,
  Urgency,
  RecommendationKind,
  GateRule,
} from './summaryTypes';

// ── Evidence shapes (typed views over evidence_snapshot per kind) ────────────

interface TemporalEvidence {
  claim: string;
  subject: string;
  strength: 'high' | 'medium' | 'low';
  date_span?: [string, string];
  pattern_type: string;
  evidence_refs?: string[];
  valence_trend?: string;
}
interface MomentEvidence {
  title: string;
  date?: string;
  why: string;
  journal_quote?: string;
  connected_items?: string[];
}
interface FingerprintEvidence {
  pattern: string;
  evidence: string;
  is_novel?: boolean;
  themes_involved?: string[];
  narrative_interest?: number;
  is_discovery_candidate?: boolean;
}

// ── Selector config: one entry per analyst-fed detector ──────────────────────

type LedgerSource =
  | { kind: 'temporal_observation'; pattern_type: string }
  | { kind: 'magic_moment' }
  | { kind: 'behavioral_fingerprint' };

interface LedgerDetectorConfig {
  id: DetectorId;
  reads: LedgerSource;
  valence: Valence;
  urgency: Urgency;
  recency_window_weeks: number;
  evolution_similarity_threshold: number;
  preferred_templates: TemplateId[];
  reframe_template: string;
  recommendation_kind: RecommendationKind | null;
  gates: GateRule[];
  concept_compatible: boolean;
  /** Minimum analyst-assigned strength for a temporal observation to be surfaced. */
  min_strength?: 'high' | 'medium' | 'low';
  /** Minimum analyst-assigned narrative_interest (0..10) for a fingerprint to be surfaced. */
  min_narrative_interest?: number;
  /** A short label for the data-lineage footer. */
  lineage_label: string;
}

const STRENGTH_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/**
 * The analyst-fed detector registry. The temporal pattern_types map 1:1 onto the §4 detectors;
 * magic_moment and behavioral_discovery are the moment + discovery surfaces fed by their kinds.
 */
const LEDGER_DETECTOR_CONFIGS: LedgerDetectorConfig[] = [
  {
    id: 'sustained_chat_action_gap',
    reads: { kind: 'temporal_observation', pattern_type: 'chat_action_gap' },
    valence: 'negative',
    urgency: 'high',
    recency_window_weeks: 2,
    evolution_similarity_threshold: 0.65,
    preferred_templates: ['evidence_chain_v1', 'then_now_split_v1'],
    reframe_template:
      'You have been doing the work in chat. The half that needs a person on the other side has been waiting. Name the gap without shame, and point at the one move that closes it.',
    recommendation_kind: 'try',
    gates: ['user_initiated_only', 'no_diagnostic_language', 'requires_user_named_topic'],
    concept_compatible: true,
    min_strength: 'medium',
    lineage_label: 'chat to action gap',
  },
  {
    id: 'named_person_arc',
    reads: { kind: 'temporal_observation', pattern_type: 'named_person_arc' },
    valence: 'negative',
    urgency: 'medium',
    recency_window_weeks: 4,
    evolution_similarity_threshold: 0.5,
    preferred_templates: ['then_now_split_v1', 'evidence_chain_v1'],
    reframe_template:
      'This person keeps showing up where the feeling shifts. Interpret the dynamic, do not just count the mentions; the relationship may be costing more than it looks like.',
    recommendation_kind: 'mark',
    gates: ['user_initiated_only', 'requires_min_data_age'],
    concept_compatible: false,
    min_strength: 'medium',
    lineage_label: 'named person arc',
  },
  {
    id: 'state_cluster_burst',
    reads: { kind: 'temporal_observation', pattern_type: 'state_cluster_burst' },
    valence: 'mixed',
    urgency: 'medium',
    recency_window_weeks: 3,
    evolution_similarity_threshold: 0.5,
    preferred_templates: ['single_sentence_v1', 'then_now_split_v1'],
    reframe_template:
      'When a feeling concentrates in a tight window then does not return, hold it as a situation that passed, not a state of being.',
    recommendation_kind: null,
    gates: ['user_initiated_only', 'requires_user_named_topic', 'no_diagnostic_language'],
    concept_compatible: false,
    min_strength: 'medium',
    lineage_label: 'state cluster',
  },
  {
    id: 'ambient_meta_theme',
    reads: { kind: 'temporal_observation', pattern_type: 'ambient_meta_theme' },
    valence: 'neutral',
    urgency: 'low',
    recency_window_weeks: 6,
    evolution_similarity_threshold: 0.6,
    preferred_templates: ['single_sentence_v1', 'big_number_v1'],
    reframe_template:
      'This is not one of the week\u2019s projects. Name the quiet wrapper running underneath all of them, the thing the user is living inside without naming.',
    recommendation_kind: null,
    gates: ['user_initiated_only'],
    concept_compatible: false,
    min_strength: 'high',
    lineage_label: 'meta theme',
  },
  {
    id: 'return_longing',
    reads: { kind: 'temporal_observation', pattern_type: 'return_longing' },
    valence: 'mixed',
    urgency: 'low',
    recency_window_weeks: 6,
    evolution_similarity_threshold: 0.5,
    preferred_templates: ['photo_lead_v1', 'then_now_split_v1'],
    reframe_template:
      'A pull back toward something is not about that thing. It is the mind finally getting enough air to notice what it has been missing. Reframe the longing as information.',
    recommendation_kind: 'hold',
    gates: ['user_initiated_only', 'requires_user_named_topic'],
    concept_compatible: false,
    min_strength: 'medium',
    lineage_label: 'return longing',
  },
  {
    // §4 naming_then_acting; analyst emits this arc as pattern_type 'hinge_moment'
    id: 'naming_then_acting',
    reads: { kind: 'temporal_observation', pattern_type: 'hinge_moment' },
    valence: 'positive',
    urgency: 'low',
    recency_window_weeks: 8,
    evolution_similarity_threshold: 0.6,
    preferred_templates: ['evidence_chain_v1', 'then_now_split_v1'],
    reframe_template:
      'A lot of wins look like this in hindsight: a clear naming, a quiet middle, a shift. Mark the hinge, and note that the middle is where most of the work happened.',
    recommendation_kind: null,
    gates: ['user_initiated_only'],
    concept_compatible: false,
    min_strength: 'medium',
    lineage_label: 'hinge moment',
  },
  {
    // §4 the_question; analyst emits it as pattern_type 'recurring_question'
    id: 'the_question',
    reads: { kind: 'temporal_observation', pattern_type: 'recurring_question' },
    valence: 'neutral',
    urgency: 'medium',
    recency_window_weeks: 8,
    evolution_similarity_threshold: 0.5,
    preferred_templates: ['single_sentence_v1', 'evidence_chain_v1'],
    reframe_template:
      'Mark the question itself, in the user\u2019s own framing. The question is the work right now; do not rush it toward an answer.',
    recommendation_kind: 'hold',
    gates: ['user_initiated_only', 'requires_user_named_topic'],
    concept_compatible: false,
    min_strength: 'medium',
    lineage_label: 'recurring question',
  },
  {
    // magic_moment_candidates feed the positive "moment" surface (0c line 28)
    id: 'magic_moment',
    reads: { kind: 'magic_moment' },
    valence: 'positive',
    urgency: 'low',
    recency_window_weeks: 4,
    evolution_similarity_threshold: 0.5,
    preferred_templates: ['photo_lead_v1', 'single_sentence_v1'],
    reframe_template:
      'Surface the moment as the user lived it, in their own words, and name the small shift it marked. Do not inflate it; let the quiet significance stand.',
    recommendation_kind: null,
    gates: ['user_initiated_only'],
    concept_compatible: false,
    lineage_label: 'magic moment',
  },
  {
    // High-interest interpretive patterns the user cannot see. v1 general surface; later this splits
    // into the specific §4 fingerprint-fed detectors (categorical_avoidance, felt_vs_narrated_gap).
    id: 'behavioral_discovery',
    reads: { kind: 'behavioral_fingerprint' },
    valence: 'mixed',
    urgency: 'low',
    recency_window_weeks: 5,
    evolution_similarity_threshold: 0.6,
    preferred_templates: ['then_now_split_v1', 'single_sentence_v1'],
    reframe_template:
      'Reflect a pattern the user is inside but cannot see from within. Interpret what it reveals, grounded only in the cited evidence.',
    recommendation_kind: null,
    gates: ['user_initiated_only'],
    concept_compatible: false,
    min_narrative_interest: 6,
    lineage_label: 'behavioral pattern',
  },
];

// ── Selection + candidate construction ───────────────────────────────────────

function matchesSource(obs: AnalystObservation, src: LedgerSource): boolean {
  if (obs.kind !== src.kind) return false;
  if (src.kind === 'temporal_observation') {
    const ev = obs.evidence_snapshot as Partial<TemporalEvidence>;
    return ev.pattern_type === src.pattern_type;
  }
  return true;
}

function passesFloor(obs: AnalystObservation, cfg: LedgerDetectorConfig): boolean {
  if (cfg.reads.kind === 'temporal_observation' && cfg.min_strength) {
    const ev = obs.evidence_snapshot as Partial<TemporalEvidence>;
    return (STRENGTH_RANK[ev.strength ?? 'low'] ?? 0) >= STRENGTH_RANK[cfg.min_strength];
  }
  if (cfg.reads.kind === 'behavioral_fingerprint' && cfg.min_narrative_interest != null) {
    const ev = obs.evidence_snapshot as Partial<FingerprintEvidence>;
    return (ev.narrative_interest ?? 0) >= cfg.min_narrative_interest;
  }
  return true;
}

function toCandidate(obs: AnalystObservation, cfg: LedgerDetectorConfig): Candidate {
  let fill_input: Record<string, unknown>;
  let dedup_key: string;
  let data_lineage: string;
  let score_components: Record<string, unknown>;

  if (cfg.reads.kind === 'temporal_observation') {
    const ev = obs.evidence_snapshot as unknown as TemporalEvidence;
    dedup_key = ev.subject;
    const refCount = ev.evidence_refs?.length ?? 0;
    const span = ev.date_span ? `${ev.date_span[0]} to ${ev.date_span[1]}` : 'this window';
    data_lineage = `${cfg.lineage_label} · ${refCount} evidence points, ${span}`;
    fill_input = {
      analyst_claim: ev.claim,
      subject: ev.subject,
      valence_trend: ev.valence_trend ?? null,
      evidence_refs: ev.evidence_refs ?? [],
      date_span: ev.date_span ?? null,
      pattern_type: ev.pattern_type,
    };
    score_components = {
      source: 'analyst_ledger',
      pattern_type: ev.pattern_type,
      strength: ev.strength,
    };
  } else if (cfg.reads.kind === 'magic_moment') {
    const ev = obs.evidence_snapshot as unknown as MomentEvidence;
    dedup_key = ev.title;
    data_lineage = `${cfg.lineage_label} · ${ev.date ?? 'this week'}`;
    fill_input = {
      title: ev.title,
      why: ev.why,
      journal_quote: ev.journal_quote ?? null,
      connected_items: ev.connected_items ?? [],
      date: ev.date ?? null,
    };
    score_components = { source: 'analyst_ledger', kind: 'magic_moment' };
  } else {
    const ev = obs.evidence_snapshot as unknown as FingerprintEvidence;
    dedup_key = ev.pattern;
    const themeCount = ev.themes_involved?.length ?? 0;
    data_lineage = `${cfg.lineage_label} · spans ${themeCount} domains`;
    fill_input = {
      pattern: ev.pattern,
      evidence: ev.evidence,
      themes_involved: ev.themes_involved ?? [],
      narrative_interest: ev.narrative_interest ?? null,
    };
    score_components = {
      source: 'analyst_ledger',
      kind: 'behavioral_fingerprint',
      narrative_interest: ev.narrative_interest,
      is_discovery_candidate: ev.is_discovery_candidate,
    };
  }

  return {
    detector_id: cfg.id,
    template_id: cfg.preferred_templates[0],
    valence: cfg.valence,
    urgency: cfg.urgency,
    fill_input,
    reframe_template: cfg.reframe_template,
    recommendation_kind: cfg.recommendation_kind,
    data_lineage,
    concept_compatible: cfg.concept_compatible,
    dedup_key,
    evidence_snapshot: obs.evidence_snapshot, // carried for FILTER's similarity check (Unit 2)
    score_components,
  };
}

function buildLedgerDetector(cfg: LedgerDetectorConfig): Detector {
  return {
    id: cfg.id,
    source: 'analyst_ledger',
    cadence_type: 'episodic',
    valence: cfg.valence,
    urgency: cfg.urgency,
    recency_window_weeks: cfg.recency_window_weeks,
    evolution_similarity_threshold: cfg.evolution_similarity_threshold,
    gates: cfg.gates,
    preferred_templates: cfg.preferred_templates,
    reframe_template: cfg.reframe_template,
    recommendation_kind: cfg.recommendation_kind,
    data_lineage_footer_template: cfg.lineage_label,
    concept_compatible: cfg.concept_compatible,
    async detect(ctx: DetectContext): Promise<Candidate[]> {
      const obs = ctx.analystObservations ?? [];
      return obs
        .filter((o) => matchesSource(o, cfg.reads) && passesFloor(o, cfg))
        .map((o) => toCandidate(o, cfg));
    },
  };
}

/** The analyst-fed detector registry. Added to the orchestrator's DETECT loop alongside the SQL set. */
export const LEDGER_DETECTORS: Detector[] = LEDGER_DETECTOR_CONFIGS.map(buildLedgerDetector);

/** Exposed for the spec/mapping doc and for tests. */
export const LEDGER_DETECTOR_MAP = LEDGER_DETECTOR_CONFIGS.map((c) => ({
  detector: c.id,
  reads: c.reads,
  template: c.preferred_templates[0],
  valence: c.valence,
}));
