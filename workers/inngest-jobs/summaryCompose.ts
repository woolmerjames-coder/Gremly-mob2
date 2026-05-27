/**
 * summaryCompose — stage 3, pure data ops, no model.
 *
 * Operates on the fired MIDDLE candidates (hero and letter are slotted by the orchestrator).
 * Applies, in order: MIX (hard <=2 negative; soft >=1 positive, never fabricated), cap, VARIETY
 * (no two consecutive same family; no template twice under 7 cards, resolved by walking the
 * detector's preferred_templates), and urgency sort. Emits a ComposeLogEntry for every candidate.
 */

import type {
  Candidate,
  ComposeLogEntry,
  ClusterLogEntry,
  ClusterResult,
  TemplateId,
  DetectorId,
} from './summaryTypes';
import { templateFamily } from './summaryTemplates';

const MAX_DECK = 7; // hero + <=5 middle + letter
const MAX_MIDDLE = MAX_DECK - 2;
const MAX_NEGATIVE = 2;

const URGENCY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export interface ComposeResult {
  middle: Candidate[];
  log: ComposeLogEntry[];
}

export function compose(fired: Candidate[]): ComposeResult {
  const log: ComposeLogEntry[] = [];
  const reject = (c: Candidate, reason: string) =>
    log.push({ detector_id: c.detector_id, template_id: c.template_id, accepted: false, reason });

  // Separate leads (week_shape frame) from the rest; they are pinned to the front unconditionally.
  const leadCandidates = fired.filter((c) => c.lead);
  const nonLeads = fired.filter((c) => !c.lead);

  // 1. Stable sort non-leads by urgency (high -> low). Insertion order breaks ties (registry order).
  const sorted = [...nonLeads].sort(
    (a, b) => (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2),
  );

  // 2. MIX — cap negatives at 2 (excess negatives, lowest urgency first, drop).
  const kept: Candidate[] = [];
  let negCount = 0;
  for (const c of sorted) {
    if (c.valence === 'negative') {
      if (negCount >= MAX_NEGATIVE) {
        reject(c, 'mix_negative_cap');
        continue;
      }
      negCount++;
    }
    kept.push(c);
  }

  // 3. Cap middle at MAX_MIDDLE. When dropping for space, protect the last surviving positive
  //    so the soft ">=1 positive" rule is honored WITHOUT ever fabricating one.
  let capped = kept;
  if (kept.length > MAX_MIDDLE) {
    const overflow = kept.length - MAX_MIDDLE;
    const positives = kept.filter((c) => c.valence === 'positive');
    const protectId = positives.length === 1 ? positives[0] : null; // protect the lone positive
    // Drop from the tail (lowest urgency) but skip the protected positive.
    const survivors: Candidate[] = [];
    const dropped: Candidate[] = [];
    for (let i = kept.length - 1; i >= 0; i--) {
      const c = kept[i];
      if (dropped.length < overflow && c !== protectId) {
        dropped.push(c);
      } else {
        survivors.unshift(c);
      }
    }
    for (const d of dropped) reject(d, 'deck_full');
    capped = survivors;
  }

  // 4. VARIETY — resolve duplicate templates by walking preferred_templates; then greedily
  //    order so no two consecutive cards share a family.
  const usedTemplates = new Set<TemplateId>();
  const variety: Candidate[] = [];
  for (const c of capped) {
    let chosen: TemplateId | null = null;
    const prefs = [c.template_id, ...detectorAltTemplates(c)];
    for (const t of prefs) {
      if (!usedTemplates.has(t)) {
        chosen = t;
        break;
      }
    }
    if (!chosen) {
      reject(c, 'variety_template_exhausted');
      continue;
    }
    usedTemplates.add(chosen);
    variety.push({ ...c, template_id: chosen });
  }

  const ordered = orderByFamily(variety);

  // Log leads first, then the variety-ordered non-leads.
  for (const c of leadCandidates) {
    log.push({
      detector_id: c.detector_id,
      template_id: c.template_id,
      accepted: true,
      reason: 'lead_pinned',
    });
  }
  for (const c of ordered) {
    log.push({
      detector_id: c.detector_id,
      template_id: c.template_id,
      accepted: true,
      reason: 'composed',
    });
  }

  // Leads are pinned before the variety-ordered middle; heroes/letter slotted by the orchestrator.
  return { middle: [...leadCandidates, ...ordered], log };
}

/** Alternate templates a candidate can fall back to (its preferred list minus the primary). */
function detectorAltTemplates(c: Candidate): TemplateId[] {
  // The candidate carries only its chosen template_id; preferred alternates are encoded on the
  // detector. For v0.5 the four detectors have distinct families so this rarely triggers; we keep
  // a conservative single-step fallback table to exercise the rule in the proving ground.
  const FALLBACK: Partial<Record<TemplateId, TemplateId[]>> = {
    rank_list_v1: ['big_number_v1'],
    big_number_v1: ['rank_list_v1'],
    then_now_split_v1: ['rank_list_v1'],
    constellation_v1: ['rank_list_v1'],
  };
  return FALLBACK[c.template_id] ?? [];
}

/** Greedy reorder so no two consecutive cards share a template family, preserving urgency order as far as possible. */
function orderByFamily(cards: Candidate[]): Candidate[] {
  const result: Candidate[] = [];
  const pool = [...cards];
  let lastFamily: string | null = null;
  while (pool.length > 0) {
    let idx = pool.findIndex((c) => templateFamily(c.template_id) !== lastFamily);
    if (idx === -1) idx = 0; // cannot avoid; place the next one
    const [c] = pool.splice(idx, 1);
    result.push(c);
    lastFamily = templateFamily(c.template_id);
  }
  return result;
}

// ── Clustering (within-week same-story dedup) ─────────────────────────────────

// v1 kinship guard: categorically standalone story types (change 2). Tunable.
const STANDALONE: ReadonlySet<string> = new Set(['named_person_arc', 'sustained_chat_action_gap']);
// Higher = headlines (change 1: interpretation over moment).
const INTERP: Record<string, number> = {
  cross_reference: 7,
  ambient_meta_theme: 6,
  naming_then_acting: 6,
  named_person_arc: 5,
  the_question: 5,
  return_longing: 4,
  state_cluster_burst: 4,
  sustained_chat_action_gap: 4,
  behavioral_discovery: 3,
  magic_moment: 2,
};
const STOP = new Set(
  'this that with from your dave james week days prior across capacity triage simultaneity'.split(
    ' ',
  ),
);

function datesIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  const MI: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  for (const m of s.matchAll(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/gi,
  ))
    out.push(`2026-${MI[m[1].slice(0, 3).toLowerCase()]}-${String(+m[2]).padStart(2, '0')}`);
  return out;
}
// Focal day = the day the observation is centrally ABOUT (culmination), not its supporting context.
function focalDay(c: Candidate): string | null {
  const ev = c.evidence_snapshot ?? {};
  if (typeof ev['date'] === 'string') return ev['date'] as string; // moment
  const span = ev['date_span'] as string[] | undefined;
  if (span?.length === 2) return span[1]; // temporal: end of span
  const d = datesIn(String(ev['evidence'] ?? ev['pattern'] ?? '')).sort(); // fingerprint prose
  return d.length ? d[d.length - 1] : null;
}
function themeTokens(c: Candidate): Set<string> {
  const ev = c.evidence_snapshot ?? {};
  const text = [
    ev['subject'],
    ev['pattern'],
    ev['title'],
    ev['why'],
    ...((ev['themes_involved'] as string[]) ?? []),
    ...((ev['themes'] as string[]) ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return new Set((text.match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
}
function clusterValenceDir(c: Candidate): 'up' | 'down' | 'neutral' {
  const ev = c.evidence_snapshot ?? {};
  const trend = String(ev['valence_trend'] ?? '').toLowerCase();
  if (trend) {
    const tail = trend.includes('\u2192') ? trend.split('\u2192').pop()!.trim() : trend;
    if (
      ['relief', 'integration', 'presence', 'warmth', 'recovery', 'win'].some((w) =>
        tail.includes(w),
      )
    )
      return 'up';
    if (
      [
        'exhaustion',
        'blocked',
        'normalized',
        'unresolved',
        'collapse',
        'absence',
        'sacrifice',
      ].some((w) => tail.includes(w))
    )
      return 'down';
  }
  const t = `${ev['pattern'] ?? ''} ${ev['evidence'] ?? ''}`.toLowerCase(); // fingerprint derivation
  if (/integration|relief|recovery|return|presence|warmth|reintegrat|win/.test(t)) return 'up';
  if (
    /gap|collapse|dormancy|exceeds|backlog|stale|fragile|deficit|absence|sacrifice|unresolved|protection under/.test(
      t,
    )
  )
    return 'down';
  return 'neutral';
}
const compat = (a: string, b: string) => a === 'neutral' || b === 'neutral' || a === b;
function confidence(c: Candidate): number {
  const sc = c.score_components ?? {};
  if (sc['kind'] === 'magic_moment') return 3;
  const s = sc['strength'] as string;
  if (s) return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
  const ni = sc['narrative_interest'] as number;
  return ni != null ? ni / 3 : 1;
}
function within1Day(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return Math.abs(+new Date(a) - +new Date(b)) <= 86400000;
}

export function clusterCandidates(candidates: Candidate[]): ClusterResult {
  // lead candidates (week_shape) are pinned to the front by compose(); exclude from clustering.
  const leads = candidates.filter((c) => c.lead);
  const clusterables = candidates.filter((c) => !c.lead);

  // Same-story edge: not a standalone type, valence-compatible, and share a focal day OR a theme token.
  const edge = (a: Candidate, b: Candidate): boolean => {
    if (STANDALONE.has(a.detector_id) || STANDALONE.has(b.detector_id)) return false;
    if (!compat(clusterValenceDir(a), clusterValenceDir(b))) return false;
    if (within1Day(focalDay(a), focalDay(b))) return true;
    const ta = themeTokens(a),
      tb = themeTokens(b);
    for (const t of ta) if (tb.has(t)) return true;
    return false;
  };

  // Connected components.
  const parent = clusterables.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < clusterables.length; i++)
    for (let j = i + 1; j < clusterables.length; j++)
      if (edge(clusterables[i], clusterables[j])) parent[find(i)] = find(j);

  const groups = new Map<number, Candidate[]>();
  clusterables.forEach((c, i) => {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(c);
  });

  const representatives: Candidate[] = [...leads]; // leads come first, never absorbed
  const log: ClusterLogEntry[] = leads.map((c) => ({
    representative: c.detector_id,
    absorbed: [],
  }));
  for (const members of groups.values()) {
    // Representative = most interpretive, then most confident (change 1).
    const ranked = [...members].sort((a, b) => {
      const d = (INTERP[b.detector_id] ?? 0) - (INTERP[a.detector_id] ?? 0);
      return d !== 0 ? d : confidence(b) - confidence(a);
    });
    const rep = ranked[0];
    if (members.length === 1) {
      representatives.push(rep);
      log.push({ representative: rep.detector_id, absorbed: [] });
      continue;
    }

    const refs = new Set<string>();
    let groundingQuote: string | undefined;
    for (const m of members) {
      const ev = m.evidence_snapshot ?? {};
      for (const r of (ev['evidence_refs'] as string[]) ?? []) refs.add(r);
      for (const r of (ev['connected_items'] as string[]) ?? []) refs.add(r);
      if (!groundingQuote && typeof ev['journal_quote'] === 'string')
        groundingQuote = ev['journal_quote'] as string; // moment quote rides along
    }
    const absorbed = ranked.slice(1).map((o) => ({
      detector_id: o.detector_id,
      subject: o.dedup_key ?? String(o.fill_input['subject'] ?? o.fill_input['title'] ?? ''),
    }));
    representatives.push({
      ...rep,
      fill_input: {
        ...rep.fill_input,
        cluster_evidence_refs: [...refs],
        grounding_quote: groundingQuote,
        absorbed_angles: absorbed.map((a) => a.subject),
      },
      data_lineage: `${rep.data_lineage} \u00b7 synthesizes ${members.length} related observations`,
    });
    log.push({ representative: rep.detector_id, absorbed });
  }
  return { representatives, log };
}
