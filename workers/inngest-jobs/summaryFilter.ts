import type { Candidate } from './summaryTypes';

export interface PriorSurfaced {
  id: string;
  detector_id: string;
  subject: string;
  evidence_snapshot: Record<string, unknown>;
  surfaced_at: string;
  observed_for_week: string;
}
export interface DetectorRecency {
  recency_window_weeks: number;
  evolution_similarity_threshold: number;
}
export type FilterDecision = 'surface' | 'suppress' | 'evolve';
export interface FilterOutcome {
  candidate: Candidate;
  decision: FilterDecision;
  prior_id: string | null;
  similarity: number | null;
  reason: string;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Word-boundary match prevents short keywords (e.g. 'win') from matching inside longer words.
const wordMatch = (text: string, words: string[]): boolean =>
  words.some((w) => new RegExp(`\\b${w}\\b`).test(text));

function valenceDir(ev: Record<string, unknown>): 'up' | 'down' | 'neutral' {
  const trend = norm(ev['valence_trend'] as string);
  const tail = trend.includes('→') ? trend.split('→').pop()!.trim() : trend;
  if (wordMatch(tail, ['relief', 'integration', 'presence', 'warmth', 'recovery', 'win']))
    return 'up';
  if (
    wordMatch(tail, [
      'exhaustion',
      'blocked',
      'normalized',
      'unresolved',
      'collapse',
      'absence',
      'sacrifice',
    ])
  )
    return 'down';
  return 'neutral';
}

// v1.1: stage/intensity WITHIN a direction. acute crisis vs normalized baseline.
function stageOf(ev: Record<string, unknown>): 'acute' | 'chronic' | null {
  const t = norm(`${ev['valence_trend'] ?? ''} ${ev['claim'] ?? ''}`);
  if (/\b(acute|crisis|emerging|spike|scramble)\b/.test(t)) return 'acute';
  if (/\b(normalized|baseline|default|chronic|habitual|entrenched|ongoing)\b/.test(t))
    return 'chronic';
  return null;
}

function similarity(prior: Record<string, unknown>, current: Record<string, unknown>): number {
  const dp = valenceDir(prior),
    dc = valenceDir(current);
  if (dp !== 'neutral' && dc !== 'neutral' && dp !== dc) return 0.4; // direction flipped -> evolve
  const sp = stageOf(prior),
    sc = stageOf(current);
  if (sp && sc && sp !== sc) return 0.4; // same direction, stage escalated -> evolve
  if (dp === 'neutral' || dc === 'neutral') return 0.85; // no clear signal -> same -> suppress
  return 1.0; // same direction, same stage -> suppress
}

const subjectOf = (c: Candidate) => norm(c.dedup_key ?? (c.fill_input['subject'] as string) ?? '');

export function filterByRecency(
  representatives: Candidate[],
  priorSurfaced: PriorSurfaced[],
  recencyByDetector: Record<string, DetectorRecency>,
  now: Date = new Date(),
): FilterOutcome[] {
  return representatives.map((c) => {
    const subj = subjectOf(c);
    const cfg = recencyByDetector[c.detector_id];
    if (!cfg || !subj)
      return {
        candidate: c,
        decision: 'surface',
        prior_id: null,
        similarity: null,
        reason: 'no_recency_or_subject',
      };
    const matches = priorSurfaced
      .filter((p) => p.detector_id === c.detector_id && norm(p.subject) === subj)
      .sort((a, b) => +new Date(b.surfaced_at) - +new Date(a.surfaced_at));
    if (!matches.length)
      return {
        candidate: c,
        decision: 'surface',
        prior_id: null,
        similarity: null,
        reason: 'no_prior_surfacing',
      };
    const prior = matches[0];
    const ageWeeks = (now.getTime() - +new Date(prior.surfaced_at)) / MS_PER_WEEK;
    if (ageWeeks > cfg.recency_window_weeks)
      return {
        candidate: c,
        decision: 'surface',
        prior_id: prior.id,
        similarity: null,
        reason: `prior_outside_window_${ageWeeks.toFixed(1)}w`,
      };
    const sim = similarity(prior.evidence_snapshot, c.evidence_snapshot);
    if (sim > cfg.evolution_similarity_threshold)
      return {
        candidate: c,
        decision: 'suppress',
        prior_id: prior.id,
        similarity: sim,
        reason: `recent_duplicate_sim_${sim.toFixed(2)}`,
      };
    return {
      candidate: c,
      decision: 'evolve',
      prior_id: prior.id,
      similarity: sim,
      reason: `evolved_sim_${sim.toFixed(2)}`,
    };
  });
}
