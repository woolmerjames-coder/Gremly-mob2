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
import { compose } from './summaryCompose';
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

export interface GenerateResult {
  content: AdaptiveSummaryContent;
  html: string;
  detector_fires: DetectorFireRow[];
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

/** FILTER stage (Phase 3 = pass-through; recency/evolution wired in Phase 4). */
function filterCandidates(candidates: Candidate[]): Candidate[] {
  return candidates;
}

export async function generateAdaptiveSummary(params: GenerateParams): Promise<GenerateResult> {
  const { userId, weekStart, weekEnd, label, env, runRpc, fetchRows } = params;

  const ctx: DetectContext = {
    userId,
    weekStart,
    weekEnd,
    env,
    runDetectorSql: runRpc,
    fetchRows,
    // analystObservations intentionally undefined in v0.5 -> ledger detectors are skipped.
  };

  // ── DETECT ────────────────────────────────────────────────────────────────
  const fired: Candidate[] = [];
  for (const det of DETERMINISTIC_DETECTORS) {
    if (det.source === 'analyst_ledger' && !ctx.analystObservations) continue; // Phase 4 seam
    const out = await det.detect(ctx);
    fired.push(...out);
  }

  // ── FILTER (stub) ───────────────────────────────────────────────────────────
  const filtered = filterCandidates(fired);

  // ── COMPOSE (middle only; hero/letter slotted below) ────────────────────────
  const { middle, log } = compose(filtered);

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

  return { content, html, detector_fires };
}
