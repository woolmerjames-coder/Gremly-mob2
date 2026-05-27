/**
 * summaryDetectors — the v0.5 deterministic detector registry.
 *
 * Every detector here has source:'sql' and a detect() that calls one Postgres function
 * (see migrations/0001_summary_v05_detectors.sql) and maps the returned jsonb to a Candidate.
 * Phase 4 ledger detectors are authored against the same Detector interface (source:'analyst_ledger')
 * and added to this registry without touching COMPOSE/FILL/RENDER.
 */

import type { Detector, Candidate, DetectContext, Valence } from './summaryTypes';
import { moodArrayValence } from './summaryTypes';

interface SqlDetectorResult {
  fired: boolean;
  fill_input: Record<string, unknown>;
  evidence_snapshot: Record<string, unknown>;
  score_components: Record<string, unknown>;
}

async function runSqlDetector(ctx: DetectContext, fnName: string): Promise<SqlDetectorResult> {
  const raw = (await ctx.runDetectorSql(fnName, {
    p_owner: ctx.userId,
    p_week_start: ctx.weekStart,
    p_week_end: ctx.weekEnd,
  })) as SqlDetectorResult;
  return raw;
}

function deltaToDirection(delta: unknown): 'up' | 'down' | 'flat' {
  if (delta === 'growing') return 'up';
  if (delta === 'declining' || delta === 'dormant') return 'down';
  return 'flat';
}

// ───────────────────────────────────────────────────────────────────────────
// reschedule_as_soft_no  ->  rank_list_v1
// ───────────────────────────────────────────────────────────────────────────

const rescheduleAsSoftNo: Detector = {
  id: 'reschedule_as_soft_no',
  source: 'sql',
  cadence_type: 'slow_moving',
  valence: 'negative',
  urgency: 'medium',
  recency_window_weeks: 4,
  evolution_similarity_threshold: 0.7,
  gates: [{ kind: 'min_evidence_count', n: 50 }],
  preferred_templates: ['rank_list_v1', 'big_number_v1'],
  reframe_template:
    'After the Nth reschedule, that is not a scheduling decision, it is a slow no. Surface the worst offenders without shame; frame trying a different size or home for them, not forcing them.',
  recommendation_kind: 'try',
  data_lineage_footer_template: 'reschedule pattern',
  concept_compatible: false,
  async detect(ctx) {
    const r = await runSqlDetector(ctx, 'summary_detect_reschedule_as_soft_no');
    if (!r.fired) return [];
    const fi = r.fill_input as { count_ge5?: number; total_active?: number };
    const worst = (r.fill_input as { worst?: { count?: number } }).worst;
    return [
      {
        detector_id: this.id,
        template_id: this.preferred_templates[0],
        valence: this.valence,
        urgency: this.urgency,
        fill_input: r.fill_input,
        reframe_template: this.reframe_template,
        recommendation_kind: this.recommendation_kind,
        data_lineage: `reschedule pattern · ${fi.count_ge5 ?? 0} of ${fi.total_active ?? 0} active todos rescheduled 5+ times, worst at ${worst?.count ?? 0}`,
        concept_compatible: this.concept_compatible,
        evidence_snapshot: r.evidence_snapshot,
        score_components: r.score_components,
      },
    ];
  },
};

// ───────────────────────────────────────────────────────────────────────────
// cadence_calibration_mismatch  ->  then_now_split_v1
// ───────────────────────────────────────────────────────────────────────────

const cadenceCalibrationMismatch: Detector = {
  id: 'cadence_calibration_mismatch',
  source: 'sql',
  cadence_type: 'slow_moving',
  valence: 'mixed',
  urgency: 'low',
  recency_window_weeks: 6,
  evolution_similarity_threshold: 0.7,
  gates: [{ kind: 'min_evidence_count', n: 10 }],
  preferred_templates: ['then_now_split_v1', 'rank_list_v1'],
  reframe_template:
    'Your nervous system has settled on its rhythm; the goal has not caught up yet. Present the intended target and the settled actual side by side as two honest numbers, not a failure.',
  recommendation_kind: 'try',
  data_lineage_footer_template: 'weekly habit hit-rate',
  concept_compatible: true,
  async detect(ctx) {
    const r = await runSqlDetector(ctx, 'summary_detect_cadence_calibration_mismatch');
    if (!r.fired) return [];
    const worst = (
      r.fill_input as {
        worst?: { weeks_observed?: number; hit_rate_pct?: number };
      }
    ).worst;
    return [
      {
        detector_id: this.id,
        template_id: this.preferred_templates[0],
        valence: this.valence,
        urgency: this.urgency,
        fill_input: r.fill_input,
        reframe_template: this.reframe_template,
        recommendation_kind: this.recommendation_kind,
        data_lineage: `weekly habit hit-rate · ${worst?.weeks_observed ?? 0} weeks observed, hitting target ${worst?.hit_rate_pct ?? 0}% of weeks`,
        concept_compatible: this.concept_compatible,
        evidence_snapshot: r.evidence_snapshot,
        score_components: r.score_components,
      },
    ];
  },
};

// ───────────────────────────────────────────────────────────────────────────
// cross_domain_alignment  ->  constellation_v1
// ───────────────────────────────────────────────────────────────────────────

const crossDomainAlignment: Detector = {
  id: 'cross_domain_alignment',
  source: 'sql',
  cadence_type: 'episodic',
  valence: 'positive',
  urgency: 'low',
  recency_window_weeks: 3,
  evolution_similarity_threshold: 0.6,
  gates: [],
  preferred_templates: ['constellation_v1', 'rank_list_v1'],
  reframe_template:
    'When the floor is steady across this many domains, that is not luck, it is structure the user built. Name the steadiness as earned, not accidental.',
  recommendation_kind: null,
  data_lineage_footer_template: 'world velocity',
  concept_compatible: false,
  async detect(ctx) {
    const r = await runSqlDetector(ctx, 'summary_detect_cross_domain_alignment');
    if (!r.fired) return [];
    const count = (r.fill_input as { count?: number }).count ?? 0;
    return [
      {
        detector_id: this.id,
        template_id: this.preferred_templates[0],
        valence: this.valence,
        urgency: this.urgency,
        fill_input: r.fill_input,
        reframe_template: this.reframe_template,
        recommendation_kind: this.recommendation_kind,
        data_lineage: `world velocity · ${count} domains reading stable or growing this window`,
        concept_compatible: this.concept_compatible,
        evidence_snapshot: r.evidence_snapshot,
        score_components: r.score_components,
      },
    ];
  },
};

// ───────────────────────────────────────────────────────────────────────────
// decisive_closure  ->  big_number_v1
// ───────────────────────────────────────────────────────────────────────────

const decisiveClosure: Detector = {
  id: 'decisive_closure',
  source: 'sql',
  cadence_type: 'milestone',
  valence: 'positive',
  urgency: 'low',
  recency_window_weeks: 8,
  evolution_similarity_threshold: 0.6,
  gates: [],
  preferred_templates: ['big_number_v1', 'rank_list_v1'],
  reframe_template:
    'A clean close means the next chapter is not carrying re-litigation weight. Mark the absence of second-guessing as the win; the dominating number is zero re-opens.',
  recommendation_kind: null,
  data_lineage_footer_template: 'chapter closure',
  concept_compatible: false,
  async detect(ctx) {
    const r = await runSqlDetector(ctx, 'summary_detect_decisive_closure');
    if (!r.fired) return [];
    const days = (r.fill_input as { days_since_close?: number }).days_since_close ?? 0;
    return [
      {
        detector_id: this.id,
        template_id: this.preferred_templates[0],
        valence: this.valence,
        urgency: this.urgency,
        fill_input: r.fill_input,
        reframe_template: this.reframe_template,
        recommendation_kind: this.recommendation_kind,
        data_lineage: `chapter closure · outcome chapter closed ${days}d ago, no recorded re-open`,
        concept_compatible: this.concept_compatible,
        evidence_snapshot: r.evidence_snapshot,
        score_components: r.score_components,
      },
    ];
  },
};

/** The v0.5 deterministic registry. Phase 4 appends analyst-ledger detectors here. */
export const DETERMINISTIC_DETECTORS: Detector[] = [
  rescheduleAsSoftNo,
  cadenceCalibrationMismatch,
  crossDomainAlignment,
  decisiveClosure,
];

// ───────────────────────────────────────────────────────────────────────────
// Always-fires producers (structurally special: hero is slot 0, letter is last)
// ───────────────────────────────────────────────────────────────────────────

/** Builds the deterministic hero spine. FILL only authors vibe_label, hero_sentence, subtitle. */
export async function buildHeroCandidate(
  ctx: DetectContext,
  weekRange: string,
  level: number,
  fedString: string,
): Promise<Candidate> {
  const h = (await ctx.runDetectorSql('summary_hero_spine', {
    p_owner: ctx.userId,
    p_week_start: ctx.weekStart,
    p_week_end: ctx.weekEnd,
  })) as {
    drops: number;
    done: number;
    habits_active: number;
    per_day_moods: { day: string; moods: string[] }[];
    worlds: { name: string; delta: string }[];
  };

  // Build the 7-cell mood arc across the week; days with no notes are intentional silence (null).
  const moodByDay = new Map<string, string[]>();
  for (const d of h.per_day_moods) moodByDay.set(d.day, d.moods);
  const start = new Date(ctx.weekStart + 'T00:00:00Z');
  const mood_arc: { day_label: string; valence: Valence | null }[] = [];
  const dayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const initial = dayInitials[d.getUTCDay()];
    mood_arc.push({
      day_label: `${initial} ${d.getUTCDate()}`,
      valence: moodArrayValence(moodByDay.get(key)),
    });
  }

  const stats = [
    { value: String(h.drops), label: 'drops' },
    { value: String(h.done), label: 'done' },
    { value: String(h.habits_active), label: 'habits' },
    { value: `L ${level}`, label: fedString },
  ];

  const world_chips = (h.worlds || []).map((w) => ({
    name: w.name,
    direction: deltaToDirection(w.delta),
  }));

  // Compact week-character context handed to FILL for the vibe + hero sentence (facts only).
  const positiveDays = mood_arc.filter((m) => m.valence === 'positive').length;
  const negativeDays = mood_arc.filter((m) => m.valence === 'negative').length;
  const silentDays = mood_arc.filter((m) => m.valence === null).length;

  return {
    detector_id: 'hero_spine',
    template_id: 'hero_spine_v1',
    valence: 'neutral',
    urgency: 'low',
    fill_input: {
      hero_body: { week_range: weekRange, stats, mood_arc, world_chips },
      week_character: {
        drops: h.drops,
        done: h.done,
        habits_active: h.habits_active,
        positive_days: positiveDays,
        negative_days: negativeDays,
        silent_days: silentDays,
        world_chips,
      },
    },
    reframe_template:
      'Name the emotional shape of the week in a few honest words. Do not flatten silence into a value; silent days are real signal.',
    recommendation_kind: null,
    data_lineage: `week of ${weekRange} · ${h.drops} drops, ${h.done} done, ${world_chips.length} worlds`,
    concept_compatible: false,
    evidence_snapshot: { drops: h.drops, done: h.done, worlds: world_chips.length },
    score_components: { always: true },
  };
}

/** Letter metadata; the orchestrator builds the letter Candidate after the deck is composed (it needs deck context). */
export const LETTER_META = {
  detector_id: 'letter' as const,
  template_id: 'letter_v1' as const,
  reframe_template:
    'A short note to Monday-them. Reference the week’s actual threads by name. End on at most one or two concrete, gentle next steps grounded in what fired. Never invent; never console with a fabricated win.',
};
