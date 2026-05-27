/**
 * generateAdaptiveSummary — the v0.5 orchestrator (DETECT -> FILTER -> COMPOSE -> FILL -> RENDER).
 *
 * Sibling to generateWeeklySummaryV2; it never replaces it and never writes weekly_summaries or
 * observations. It is PURE: it returns the deck content, the inspection HTML, and the detector_fires
 * rows. The shadow harness performs the only writes (detector_fires + shadow_runs).
 *
 * FILTER is a structural pass-through in v0.5. Recency/evolution culling requires the surfaced-
 * observations library, which is Phase 4; the stage exists here so the pipeline shape is complete.
 */

import type {
  Candidate,
  DetectContext,
  AdaptiveSummaryContent,
  SummaryCard,
  ComposeLogEntry,
  DetectorId,
  TemplateId,
} from './summaryTypes';
import { DETERMINISTIC_DETECTORS, buildHeroCandidate, LETTER_META } from './summaryDetectors';
import { compose, clusterCandidates } from './summaryCompose';
import { LEDGER_DETECTORS } from './summaryLedgerDetectors';
import {
  filterByRecency,
  type PriorSurfaced,
  type DetectorRecency,
  type FilterOutcome,
} from './summaryFilter';
import type { AnalystObservation } from './summaryTypes';
import { fillCard } from './summaryFill';
import { renderInspectionDeck } from './summaryRender';

export interface GenerateParams {
  userId: string;
  weekStart: string; // 'yyyy-MM-dd'
  weekEnd: string; // 'yyyy-MM-dd'
  label: string; // for the inspection header, e.g. 'James'
  env: Record<string, string>;
  /** Calls a Postgres detector function via /rest/v1/rpc and returns its jsonb. Provided by the harness. */
  runRpc: (fnName: string, params: Record<string, unknown>) => Promise<unknown>;
  /** GETs a Supabase REST path and returns rows. Provided by the harness. */
  fetchRows: (path: string) => Promise<unknown[]>;
}

export interface DetectorFireRow {
  user_id: string;
  detector_id: DetectorId;
  fired_at: string;
  candidate_payload: Record<string, unknown>;
  score_components: Record<string, unknown>;
  accepted_into_deck: boolean;
  rejection_reason: string | null;
}

export interface SurfacedObservationRow {
  user_id: string;
  stage: 'summary';
  kind: string | null;
  detector_id: DetectorId;
  observed_for_week: string;
  surfaced_at: string;
  surfaced_in_summary_id: string | null;
  claim_summary: string;
  evidence_snapshot: Record<string, unknown>;
  card_treatment_used: TemplateId;
  card_payload: Record<string, unknown>;
  status: 'surfaced';
  client_ref: string;
}
export interface EvolvedUpdate {
  prior_id: string;
  superseded_by_ref: string;
}

export interface GenerateResult {
  content: AdaptiveSummaryContent;
  html: string;
  detector_fires: DetectorFireRow[];
  surfaced_observations: SurfacedObservationRow[];
  evolved_updates: EvolvedUpdate[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}
// House rule: no en/em dashes in authored text. Use a plain hyphen.
function weekRange(ws: string, we: string): string {
  return `${fmt(ws)} - ${fmt(we)}`;
}

export async function generateAdaptiveSummary(params: GenerateParams): Promise<GenerateResult> {
  const { userId, weekStart, weekEnd, label, env, runRpc, fetchRows } = params;

  const analystObservations = (await fetchRows(
    `observations?user_id=eq.${userId}&stage=eq.analyst&observed_for_week=eq.${weekStart}` +
      `&select=kind,detector_id,claim_summary,evidence_snapshot,observed_for_week`,
  )) as AnalystObservation[];

  const ctx: DetectContext = {
    userId,
    weekStart,
    weekEnd,
    env,
    runDetectorSql: runRpc,
    fetchRows,
    analystObservations,
  };

  // ── DETECT ────────────────────────────────────────────────────────────────
  const fired: Candidate[] = [];
  for (const det of [...DETERMINISTIC_DETECTORS, ...LEDGER_DETECTORS]) {
    const out = await det.detect(ctx);
    fired.push(...out);
  }

  // ── CLUSTER (within-week deduplication, runs before cross-week filter) ──────
  const { representatives, log: clusterLog } = clusterCandidates(fired);

  // ── FILTER (cross-week recency/evolution memory) ─────────────────────────────
  const priorRows = (await fetchRows(
    `observations?user_id=eq.${userId}&stage=eq.summary&status=eq.surfaced` +
      `&select=id,detector_id,evidence_snapshot,surfaced_at,observed_for_week`,
  )) as Array<{
    id: string;
    detector_id: string;
    evidence_snapshot: Record<string, unknown>;
    surfaced_at: string;
    observed_for_week: string;
  }>;
  const prior: PriorSurfaced[] = priorRows.map((r) => ({
    id: r.id,
    detector_id: r.detector_id,
    subject: String(r.evidence_snapshot?.['subject'] ?? ''),
    evidence_snapshot: r.evidence_snapshot ?? {},
    surfaced_at: r.surfaced_at,
    observed_for_week: r.observed_for_week,
  }));

  const recencyByDetector: Record<string, DetectorRecency> = {};
  for (const d of [...DETERMINISTIC_DETECTORS, ...LEDGER_DETECTORS]) {
    recencyByDetector[d.id] = {
      recency_window_weeks: (d as { recency_window_weeks?: number }).recency_window_weeks ?? 4,
      evolution_similarity_threshold:
        (d as { evolution_similarity_threshold?: number }).evolution_similarity_threshold ?? 0.5,
    };
  }
  const outcomes = filterByRecency(representatives, prior, recencyByDetector, new Date());
  const survivors = outcomes.filter((o) => o.decision !== 'suppress').map((o) => o.candidate);

  // ── COMPOSE (middle only; hero/letter slotted below) ────────────────────────
  const { middle, log } = compose(survivors);

  // ── Hero + signature context ────────────────────────────────────────────────
  const cpRows = (await fetchRows(
    `cortex_preferences?owner_id=eq.${userId}&select=fed_days_count,current_tier,gremly_age`,
  )) as { fed_days_count?: number; current_tier?: string; gremly_age?: number }[];
  const cp = cpRows[0] || {};
  const level = cp.gremly_age ?? 1;
  const fedDays = cp.fed_days_count ?? 0;
  const state = cp.current_tier ?? 'getting started';
  const fedString = `${fedDays % 3}/3 fed`;

  const heroCandidate = await buildHeroCandidate(
    ctx,
    weekRange(weekStart, weekEnd),
    level,
    fedString,
  );

  // ── FILL hero + middle (per-card; drop on validation failure) ───────────────
  const composeLog: ComposeLogEntry[] = [...log];
  const fillFailures = new Set<DetectorId>();

  const heroOutcome = await fillCard(env, heroCandidate);
  const heroCard = heroOutcome.card; // hero failing is rare; if it does we still ship the floor

  const middleCards: SummaryCard[] = [];
  const acceptedMiddle: Candidate[] = [];
  for (const c of middle) {
    const outcome = await fillCard(env, c);
    if (outcome.card) {
      middleCards.push(outcome.card);
      acceptedMiddle.push(c);
    } else {
      fillFailures.add(c.detector_id);
      composeLog.push({
        detector_id: c.detector_id,
        template_id: c.template_id,
        accepted: false,
        reason: `fill_validation_failed: ${outcome.errors.join(' | ').slice(0, 160)}`,
      });
    }
  }

  // ── Surfacing rows (orchestrator emits; harness inserts) ────────────────────
  const outcomeByKey = new Map<string, FilterOutcome>();
  for (const o of outcomes)
    outcomeByKey.set(`${o.candidate.detector_id}|${o.candidate.dedup_key ?? ''}`, o);

  const surfacedAt = new Date().toISOString();
  const surfaced_observations: SurfacedObservationRow[] = [];
  const evolved_updates: EvolvedUpdate[] = [];
  acceptedMiddle.forEach((c, i) => {
    const card = middleCards[i];
    const ref = `surf_${i}`;
    surfaced_observations.push({
      user_id: userId,
      stage: 'summary',
      kind: (c.score_components?.['kind'] as string) ?? null,
      detector_id: c.detector_id,
      observed_for_week: weekStart,
      surfaced_at: surfacedAt,
      surfaced_in_summary_id: null,
      claim_summary: c.dedup_key ?? card?.hero_sentence ?? '',
      evidence_snapshot: {
        subject: c.dedup_key,
        valence_trend: c.evidence_snapshot?.['valence_trend'],
        cluster_evidence_refs: (c.fill_input?.['cluster_evidence_refs'] as string[]) ?? [],
      },
      card_treatment_used: c.template_id,
      card_payload: card as unknown as Record<string, unknown>,
      status: 'surfaced',
      client_ref: ref,
    });
    const o = outcomeByKey.get(`${c.detector_id}|${c.dedup_key ?? ''}`);
    if (o?.decision === 'evolve' && o.prior_id)
      evolved_updates.push({ prior_id: o.prior_id, superseded_by_ref: ref });
  });

  // ── Letter (built last; references the accepted cards) ──────────────────────
  const letterCandidate: Candidate = {
    detector_id: LETTER_META.detector_id,
    template_id: LETTER_META.template_id,
    valence: 'neutral',
    urgency: 'low',
    fill_input: {
      signature: { name: 'Your Gremly', level, state },
      week_range: weekRange(weekStart, weekEnd),
      cards_context: middleCards.map((c) => ({
        finding: c.hero_sentence,
        insight: c.insight,
        lineage: c.data_lineage_footer,
      })),
    },
    reframe_template: LETTER_META.reframe_template,
    recommendation_kind: null,
    data_lineage: `closing note · synthesises ${middleCards.length} fired cards`,
    concept_compatible: false,
    evidence_snapshot: {},
    score_components: { always: true },
  };
  const letterOutcome = await fillCard(env, letterCandidate);

  // ── Assemble deck (floor = hero + letter) ───────────────────────────────────
  const cards: SummaryCard[] = [];
  if (heroCard) cards.push(heroCard);
  cards.push(...middleCards);
  if (letterOutcome.card) cards.push(letterOutcome.card);

  const firedDetectors = [...new Set(fired.map((f) => f.detector_id))];
  const content: AdaptiveSummaryContent = {
    content_version: 2,
    generated_for_week: weekStart,
    cards,
    metadata: {
      deck_size: cards.length,
      card_types: cards.map((c) => c.type as TemplateId),
      fired_detectors: firedDetectors,
      compose_log: composeLog,
      cluster_log: clusterLog,
      fill_model: env.SUMMARY_FILL_MODEL || 'claude-sonnet-4-6',
      run_mode: 'shadow',
    },
  };

  // ── detector_fires rows (one per FIRED detector; fate tracked through compose + fill) ──
  const acceptedDetectorIds = new Set(acceptedMiddle.map((c) => c.detector_id));
  const composeRejectReason = new Map<DetectorId, string>();
  for (const l of log) if (!l.accepted) composeRejectReason.set(l.detector_id, l.reason);

  const now = new Date().toISOString();
  const detector_fires: DetectorFireRow[] = fired.map((c) => {
    const accepted = acceptedDetectorIds.has(c.detector_id);
    let reason: string | null = null;
    if (!accepted) {
      if (fillFailures.has(c.detector_id)) reason = 'fill_validation_failed';
      else reason = composeRejectReason.get(c.detector_id) ?? 'composed_out';
    }
    return {
      user_id: userId,
      detector_id: c.detector_id,
      fired_at: now,
      candidate_payload: c as unknown as Record<string, unknown>,
      score_components: c.score_components,
      accepted_into_deck: accepted,
      rejection_reason: reason,
    };
  });

  // ── RENDER (inspection surface) ─────────────────────────────────────────────
  const html = renderInspectionDeck(label, content);

  return { content, html, detector_fires, surfaced_observations, evolved_updates };
}
