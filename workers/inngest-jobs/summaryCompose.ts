/**
 * summaryCompose — stage 3, pure data ops, no model.
 *
 * Operates on the fired MIDDLE candidates (hero and letter are slotted by the orchestrator).
 * Applies, in order: MIX (hard <=2 negative; soft >=1 positive, never fabricated), cap, VARIETY
 * (no two consecutive same family; no template twice under 7 cards, resolved by walking the
 * detector's preferred_templates), and urgency sort. Emits a ComposeLogEntry for every candidate.
 */

import type { Candidate, ComposeLogEntry, TemplateId } from './summaryTypes';
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

  // 1. Stable sort by urgency (high -> low). Insertion order breaks ties (registry order).
  const sorted = [...fired].sort(
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

  for (const c of ordered) {
    log.push({
      detector_id: c.detector_id,
      template_id: c.template_id,
      accepted: true,
      reason: 'composed',
    });
  }

  return { middle: ordered, log };
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
