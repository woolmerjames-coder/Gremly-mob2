/**
 * briefLoader — loads the analyst's pre-curated synthesis for a user-week.
 *
 * This is the single source of "what the week is about" for the writer. We trust the analyst's
 * curation (week_shape, magic_moments, cross_references, behavioral_fingerprints, temporal
 * observations). We do NOT re-curate via deterministic detectors here. Detector outputs are
 * loaded separately as evidence-facts the writer may cite (see factsLoader).
 *
 * Returns SummaryBrief or throws if week_shape is missing (no brief = no honest deck).
 */

import type {
  SummaryBrief,
  WeekShapeBrief,
  AnalystObservationFull,
  PriorSurfacedAnchor,
} from './summaryTypes';

type FetchRows = (path: string) => Promise<unknown[]>;

export async function loadBrief(
  userId: string,
  weekStart: string,
  fetchRows: FetchRows,
): Promise<SummaryBrief> {
  // ── All analyst observations for the week ────────────────────────────────
  const rawObs = (await fetchRows(
    `observations?user_id=eq.${userId}&stage=eq.analyst&observed_for_week=eq.${weekStart}` +
      `&select=id,kind,claim_summary,evidence_snapshot,observed_for_week`,
  )) as Array<{
    id: string;
    kind: string;
    claim_summary: string | null;
    evidence_snapshot: Record<string, unknown> | null;
  }>;

  const observations: AnalystObservationFull[] = rawObs.map((r) => ({
    id: r.id,
    kind: r.kind,
    claim_summary: r.claim_summary ?? '',
    evidence_snapshot: r.evidence_snapshot ?? {},
  }));

  // ── Extract week_shape (the brief itself) ────────────────────────────────
  const ws = observations.find((o) => o.kind === 'week_shape');
  let week_shape: WeekShapeBrief | null = null;
  if (ws) {
    const ev = ws.evidence_snapshot as Record<string, unknown>;
    week_shape = {
      classification: String(ev['classification'] ?? ''),
      dominant_theme: String(ev['dominant_theme'] ?? ''),
      mood_arc_text: String(ev['mood_arc'] ?? ''),
      highlight: String(ev['highlight'] ?? ''),
      concern: String(ev['concern'] ?? ''),
    };
  }

  // ── Prior surfaced anchors (cross-week recency context) ──────────────────
  // Last 6 weeks of surfaced rows for this user. The writer decides whether to evolve or skip.
  const sixWeeksAgo = new Date(weekStart + 'T00:00:00Z');
  sixWeeksAgo.setUTCDate(sixWeeksAgo.getUTCDate() - 42);
  const cutoff = sixWeeksAgo.toISOString().slice(0, 10);

  const rawPrior = (await fetchRows(
    `observations?user_id=eq.${userId}&stage=eq.summary&status=eq.surfaced` +
      `&observed_for_week=gte.${cutoff}&observed_for_week=lt.${weekStart}` +
      `&select=evidence_snapshot,surfaced_at,observed_for_week,claim_summary`,
  )) as Array<{
    evidence_snapshot: Record<string, unknown> | null;
    surfaced_at: string;
    observed_for_week: string;
    claim_summary: string | null;
  }>;

  const prior_surfaced: PriorSurfacedAnchor[] = rawPrior.map((r) => {
    const ev = r.evidence_snapshot ?? {};
    return {
      subject: String(ev['subject'] ?? r.claim_summary ?? ''),
      observation_id_or_null: (ev['observation_id'] as string) ?? null,
      surfaced_at: r.surfaced_at,
      classification_that_week: (ev['classification'] as string) ?? null,
    };
  });

  return {
    user_id: userId,
    week_shape,
    observations,
    prior_surfaced,
  };
}
