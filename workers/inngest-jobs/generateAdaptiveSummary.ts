/**
 * generateAdaptiveSummary — v0.7a orchestrator.
 *
 * Sequence:
 *   1. Load the analyst BRIEF.
 *   2. Load the hard FACTS.
 *   3. Write the deck (writer, with built-in retry and Haiku quality check).
 *   4. If the writer produced a soft_pass deck (fact_errors empty, quality_issues non-empty),
 *      run the polish pass against the per-card critic notes. One polish pass max.
 *   5. Assemble final content + telemetry. Persist whichever deck is shippable: polished if
 *      polish succeeded validation, pre-polish otherwise.
 *
 * Telemetry preservation invariant: under no circumstance does this orchestrator return
 * content with cards: []  when the writer actually produced cards. The "(write failed)"
 * sentinel is reserved exclusively for the case where the writer's underlying API call
 * never returned parseable JSON (a true catastrophic failure). When validation fails on a
 * produced deck, the deck's raw content is preserved in metadata.last_attempted_raw so the
 * failure mode can be studied.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Success criteria for the v07a comparison run (set BEFORE the corpus arrives,
 * for mechanical comparison, no rationalization after the fact):
 *
 *   Weekday hallucination rate:    0   (structural; non-zero means schema or validator did not land)
 *   Letter tone failure rate:      ≤ 30%   (was 100% in v07; polish target)
 *   Question sharpness rate:       ≤ 30%   (was 91% in v07; polish target)
 *   No new failure modes:          tabulate FULL checker set against post-polish corpus,
 *                                  not just the targeted criteria. A polish pass that fixes
 *                                  letter tone but introduces hero subtitle drift is not a win.
 *
 * Cost shape: +1 Sonnet call (polish) + 1 Haiku call (post-polish quality check) per
 * soft_pass deck. At observed ~64% soft_pass rate, that is ~7 extra Sonnet calls and ~7
 * extra Haiku calls per 11-deck corpus run.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AdaptiveSummaryContent,
  Card,
  CardShape,
  Deck,
  SurfacedAnchor,
  QualityIssue,
} from './summaryTypes';
import { loadBrief } from './briefLoader';
import { loadFacts } from './factsLoader';
import { writeDeck, polishDeck, type PolishOutcome } from './summaryWriter';
import { renderInspectionDeck } from './summaryRender';

export interface GenerateParams {
  userId: string;
  weekStart: string; // 'yyyy-MM-dd' — canonical analyst week bucket
  weekEnd: string;
  label: string; // for the inspection header
  env: Record<string, string>;
  runRpc: (fnName: string, params: Record<string, unknown>) => Promise<unknown>;
  fetchRows: (path: string) => Promise<unknown[]>;
}

export interface SurfacedObservationRow {
  user_id: string;
  stage: 'summary';
  detector_id: string | null;
  kind: string | null;
  observed_for_week: string;
  surfaced_at: string;
  surfaced_in_summary_id: string | null;
  claim_summary: string;
  evidence_snapshot: Record<string, unknown>;
  card_treatment_used: string;
  card_payload: Record<string, unknown>;
  status: 'surfaced';
  client_ref: string;
}

export interface GenerateResult {
  // Shippable shape (production caller uses this; shadow function persists this as payload.content)
  content: AdaptiveSummaryContent | null;
  html: string;
  surfaced_observations: SurfacedObservationRow[];
  errors: string[];

  // Telemetry fields (consumed by shadow function for shadow_runs.payload; production ignores)
  fact_errors: string[];
  quality_issues: QualityIssue[];
  attempt_1_fact_errors: string[];
  attempt_1_quality_issues: QualityIssue[];
  attempts: number;
  writer_model: string;
  checker_model: string;

  /** Raw parsed JSON from the writer's last attempt, regardless of validation outcome. */
  last_attempted_raw: unknown | null;

  /** Pre-polish deck content (null when polish was not applicable or did not change things). */
  pre_polish_content: AdaptiveSummaryContent | null;
  pre_polish_quality_issues: QualityIssue[] | null;

  /** Post-polish Haiku critique (null when polish did not run or did not pass validation). */
  post_polish_quality_issues: QualityIssue[] | null;

  polish_outcome: PolishOutcome | 'no_writer_deck';
  polish_errors: string[];
}

export async function generateAdaptiveSummary(params: GenerateParams): Promise<GenerateResult> {
  const { userId, weekStart, weekEnd, label, env, runRpc, fetchRows } = params;

  // ── 1. Brief ──────────────────────────────────────────────────────────────
  const brief = await loadBrief(userId, weekStart, fetchRows);

  // ── 2. Facts ──────────────────────────────────────────────────────────────
  const facts = await loadFacts({
    userId,
    canonicalWeekStart: weekStart,
    canonicalWeekEnd: weekEnd,
    runRpc,
    fetchRows,
  });

  const writerModelEnv = env.SUMMARY_WRITER_MODEL || env.SUMMARY_FILL_MODEL || 'claude-sonnet-4-6';
  const checkerModelEnv = env.SUMMARY_CHECKER_MODEL || 'claude-haiku-4-5-20251001';

  // ── No-brief short-circuit ────────────────────────────────────────────────
  if (!brief.week_shape) {
    const errMsg = `no week_shape observation for user ${userId} week ${weekStart}`;
    const empty: AdaptiveSummaryContent = {
      content_version: 4,
      generated_for_week: weekStart,
      classification: '',
      through_line: '(no brief)',
      cards: [],
      metadata: {
        deck_size: 0,
        card_shapes: [],
        fill_model: `${writerModelEnv} + ${checkerModelEnv}`,
        fill_attempts: 0,
        fill_errors: [errMsg],
        run_mode: 'shadow',
        user_tenure_days: facts.user.tenure_days,
        is_first_weekly: facts.user.is_first_weekly,
        fed_days_in_window: facts.fed.days_in_window,
      },
    };
    return {
      content: empty,
      html: renderInspectionDeck(label, empty),
      surfaced_observations: [],
      errors: [errMsg],
      fact_errors: [],
      quality_issues: [],
      attempt_1_fact_errors: [],
      attempt_1_quality_issues: [],
      attempts: 0,
      writer_model: writerModelEnv,
      checker_model: checkerModelEnv,
      last_attempted_raw: null,
      pre_polish_content: null,
      pre_polish_quality_issues: null,
      post_polish_quality_issues: null,
      polish_outcome: 'no_writer_deck',
      polish_errors: [],
    };
  }

  // ── 3. Writer ─────────────────────────────────────────────────────────────
  const writeRes = await writeDeck(env, brief, facts);

  // Telemetry for both the success and failure paths is identical from here on.
  const combinedWriterErrors = [
    ...writeRes.fact_errors.map((e) => `fact: ${e}`),
    ...writeRes.quality_issues.map((q) => {
      const idx = q.card_index === null ? 'deck' : `card[${q.card_index}]`;
      return `quality(${idx}): ${q.issue}`;
    }),
  ];
  const attempt1Errors = [
    ...writeRes.attempt_1_fact_errors.map((e) => `[a1] fact: ${e}`),
    ...writeRes.attempt_1_quality_issues.map((q) => {
      const idx = q.card_index === null ? 'deck' : `card[${q.card_index}]`;
      return `[a1] quality(${idx}): ${q.issue}`;
    }),
  ];

  // ── 3a. Writer hard-failed (no valid deck after both attempts) ────────────
  if (!writeRes.deck) {
    const lastRaw = writeRes.last_attempted_raw as Record<string, unknown> | null;
    // Telemetry preservation: even on hard_fail, persist whatever the writer DID emit so we
    // can study the failure mode. The "(write failed)" sentinel previously dropped this data.
    const rawCards = Array.isArray(lastRaw?.['cards']) ? (lastRaw['cards'] as Card[]) : [];
    const failedContent: AdaptiveSummaryContent = {
      content_version: 4,
      generated_for_week: weekStart,
      classification: brief.week_shape.classification,
      through_line: String(
        lastRaw?.['through_line'] ??
          '(write failed: validation rejected the writer output, raw preserved in last_attempted_raw)',
      ),
      cards: rawCards,
      metadata: {
        deck_size: rawCards.length,
        card_shapes: rawCards.map((c) => (c?.shape ?? 'unknown') as CardShape),
        fill_model: `${writeRes.writer_model} + ${writeRes.checker_model}`,
        fill_attempts: writeRes.attempts,
        fill_errors: [...combinedWriterErrors, ...attempt1Errors],
        run_mode: 'shadow',
        user_tenure_days: facts.user.tenure_days,
        is_first_weekly: facts.user.is_first_weekly,
        fed_days_in_window: facts.fed.days_in_window,
      },
    };
    return {
      content: failedContent,
      html: renderInspectionDeck(label, failedContent),
      surfaced_observations: [],
      errors: combinedWriterErrors,
      fact_errors: writeRes.fact_errors,
      quality_issues: writeRes.quality_issues,
      attempt_1_fact_errors: writeRes.attempt_1_fact_errors,
      attempt_1_quality_issues: writeRes.attempt_1_quality_issues,
      attempts: writeRes.attempts,
      writer_model: writeRes.writer_model,
      checker_model: writeRes.checker_model,
      last_attempted_raw: writeRes.last_attempted_raw,
      pre_polish_content: null,
      pre_polish_quality_issues: null,
      post_polish_quality_issues: null,
      polish_outcome: 'no_writer_deck',
      polish_errors: [],
    };
  }

  const writerDeck: Deck = writeRes.deck;
  const preFinal = assembleContent(
    writerDeck,
    weekStart,
    facts,
    writeRes.attempts,
    writeRes.writer_model,
    writeRes.checker_model,
    [...combinedWriterErrors, ...attempt1Errors],
  );

  // ── 4. Polish pass (only if soft_pass and there is a card-specific critique) ─
  const hasCardSpecificIssues = writeRes.quality_issues.some((q) => q.card_index !== null);
  const shouldPolish = writeRes.fact_errors.length === 0 && hasCardSpecificIssues;

  let finalDeck: Deck = writerDeck;
  let pre_polish_content: AdaptiveSummaryContent | null = null;
  let pre_polish_quality_issues: QualityIssue[] | null = null;
  let post_polish_quality_issues: QualityIssue[] | null = null;
  let polish_outcome: PolishOutcome | 'no_writer_deck' = 'not_applicable';
  let polish_errors: string[] = [];

  if (shouldPolish) {
    pre_polish_content = preFinal;
    pre_polish_quality_issues = writeRes.quality_issues;

    const polishRes = await polishDeck(env, writerDeck, brief, facts, writeRes.quality_issues);
    polish_outcome = polishRes.outcome;
    polish_errors = polishRes.errors;
    post_polish_quality_issues = polishRes.post_polish_quality_issues;

    if (polishRes.outcome === 'applied' && polishRes.polished_deck) {
      // Polish succeeded validation. Ship the polished deck.
      finalDeck = polishRes.polished_deck;
    } else {
      // Polish failed validation or call. Fall back to the writer's pre-polish deck.
      finalDeck = writerDeck;
    }
  }

  // ── 5. Assemble final content + render ────────────────────────────────────
  const finalErrors = shouldPolish
    ? buildPostPolishErrorList(
        combinedWriterErrors,
        attempt1Errors,
        polish_outcome,
        polish_errors,
        post_polish_quality_issues,
      )
    : [...combinedWriterErrors, ...attempt1Errors];

  const content = assembleContent(
    finalDeck,
    weekStart,
    facts,
    writeRes.attempts,
    writeRes.writer_model,
    writeRes.checker_model,
    finalErrors,
  );

  const surfacedAt = new Date().toISOString();
  const surfaced_observations: SurfacedObservationRow[] = finalDeck.surfaced_anchors.map(
    (a: SurfacedAnchor, i: number) => {
      const card = finalDeck.cards[a.card_index];
      return {
        user_id: userId,
        stage: 'summary',
        detector_id: null,
        kind: a.card_shape,
        observed_for_week: weekStart,
        surfaced_at: surfacedAt,
        surfaced_in_summary_id: null,
        claim_summary: a.subject,
        evidence_snapshot: {
          subject: a.subject,
          observation_id: a.observation_id,
          classification: finalDeck.classification,
          card_shape: a.card_shape,
        },
        card_treatment_used: a.card_shape,
        card_payload: (card as unknown as Record<string, unknown>) ?? {},
        status: 'surfaced',
        client_ref: `surf_${i}`,
      };
    },
  );

  return {
    content,
    html: renderInspectionDeck(label, content),
    surfaced_observations,
    errors: combinedWriterErrors,
    fact_errors: writeRes.fact_errors,
    quality_issues: writeRes.quality_issues,
    attempt_1_fact_errors: writeRes.attempt_1_fact_errors,
    attempt_1_quality_issues: writeRes.attempt_1_quality_issues,
    attempts: writeRes.attempts,
    writer_model: writeRes.writer_model,
    checker_model: writeRes.checker_model,
    last_attempted_raw: writeRes.last_attempted_raw,
    pre_polish_content,
    pre_polish_quality_issues,
    post_polish_quality_issues,
    polish_outcome,
    polish_errors,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function assembleContent(
  deck: Deck,
  weekStart: string,
  facts: {
    user: { tenure_days: number; is_first_weekly: boolean };
    fed: { days_in_window: number };
  },
  attempts: number,
  writerModel: string,
  checkerModel: string,
  errors: string[],
): AdaptiveSummaryContent {
  return {
    content_version: 4,
    generated_for_week: weekStart,
    classification: deck.classification,
    through_line: deck.through_line,
    cards: deck.cards,
    metadata: {
      deck_size: deck.cards.length,
      card_shapes: deck.cards.map((c: Card) => c.shape as CardShape),
      fill_model: `${writerModel} + ${checkerModel}`,
      fill_attempts: attempts,
      fill_errors: errors,
      run_mode: 'shadow',
      user_tenure_days: facts.user.tenure_days,
      is_first_weekly: facts.user.is_first_weekly,
      fed_days_in_window: facts.fed.days_in_window,
    },
  };
}

function buildPostPolishErrorList(
  writerErrors: string[],
  attempt1Errors: string[],
  outcome: PolishOutcome | 'no_writer_deck',
  polishErrors: string[],
  postPolishQuality: QualityIssue[] | null,
): string[] {
  const lines: string[] = [];
  lines.push(`[polish] outcome=${outcome}`);
  if (polishErrors.length > 0) {
    for (const e of polishErrors) lines.push(`[polish] error: ${e}`);
  }
  if (postPolishQuality && postPolishQuality.length > 0) {
    for (const q of postPolishQuality) {
      const idx = q.card_index === null ? 'deck' : `card[${q.card_index}]`;
      lines.push(`[polish] post quality(${idx}): ${q.issue}`);
    }
  }
  // Keep the original writer errors for telemetry visibility (pre-polish)
  return [...writerErrors, ...attempt1Errors, ...lines];
}
