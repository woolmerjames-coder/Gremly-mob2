// workers/inngest-jobs/worldsOutputDiffReport.ts
//
// Phase 2b Step C: pure report logic (no I/O) for the Worlds OUTPUT dual-run.
// The in-worker harness runs classifyWorldsWeekly under four flag combinations
// over the SAME window and active state, plus a second baseline draw for the
// noise floor, and calls these functions to diff the ClassifierOutputs and
// assemble the report it writes to shadow_runs (run_kind='worlds_output_dual_run').
//
// Methodology (mirrors the analyst gate, adapted for heavily-generative output):
//  - Diff is STRUCTURAL ONLY: which worlds/chapters/life-contexts are proposed,
//    which chapters close, per-world velocity DELTA enum + dormancy bool,
//    evolution/reactivation/reclassification calls. Prose fields (headline,
//    summary, card_subtitle, epigraph, display_name, reasons, key_priorities,
//    all new_* refresh fields, and the continuous signal_velocity float) are
//    EXCLUDED. They regenerate every run and are noise, not signal.
//  - NOISE BASELINE: baseline is run twice; baseline-vs-baseline is the jitter
//    floor. The target diff is read against that floor.
//  - ATTRIBUTION: four runs (bundle x ledger flags) let the harness separate a
//    C1 (bundle) effect from a C2 (ledger) effect. This module computes each
//    pairwise diff so remediation is targetable.
//  - ANTI-POISONING CHECK: a dedicated test for whether the analyst's
//    world_signal_candidates became worlds one-to-one (the C2 boundary-leak
//    signal), checkable regardless of whose life it is.
//
// The verdict here is a TRIAGE/SUMMARY for a human, never an auto-pass: the
// improvement-vs-regression judgment is the user's, against a fixed bar.
//
// Conventions: no em dashes in any string. No examples (this is code).

// ---- ClassifierOutput shape (the fields we diff; others ignored) ---------

export interface VelocityUpdate {
  world_id?: string;
  signal_velocity?: number; // continuous, NOT diffed (jitters every run)
  signal_velocity_delta?: string; // growing | stable | declining | dormant  -- diffed
  recommend_dormant?: boolean; // diffed
  [k: string]: unknown;
}

export interface ClassifierOutputShape {
  new_world_candidates?: Array<{ proposed_name?: string; [k: string]: unknown }>;
  new_chapter_candidates?: Array<{
    proposed_title?: string;
    primary_world_name?: string;
    [k: string]: unknown;
  }>;
  new_life_context_candidates?: Array<{
    proposed_name?: string;
    kind?: string;
    [k: string]: unknown;
  }>;
  chapter_updates?: Array<{ chapter_id?: string; close_chapter?: boolean; [k: string]: unknown }>;
  velocity_updates?: VelocityUpdate[];
  evolution_proposals?: Array<{
    parent_world_ids?: string[];
    evolution_type?: string;
    [k: string]: unknown;
  }>;
  reactivation_proposals?: Array<{ world_id?: string; [k: string]: unknown }>;
  reclassification_proposals?: Array<{
    world_id?: string;
    target_kind?: string;
    target_name?: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

// ---- Utilities -----------------------------------------------------------

function norm(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function setDiff(
  a: string[],
  b: string[],
): { only_a: string[]; only_b: string[]; common: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    only_a: [...sa].filter((x) => !sb.has(x)).sort(),
    only_b: [...sb].filter((x) => !sa.has(x)).sort(),
    common: [...sa].filter((x) => sb.has(x)).sort(),
  };
}

// ---- Structural key extraction (the diff identity per output type) -------

function worldKeys(o: ClassifierOutputShape): string[] {
  return arr<{ proposed_name?: string }>(o.new_world_candidates)
    .map((w) => norm(w.proposed_name))
    .filter(Boolean);
}
function chapterKeys(o: ClassifierOutputShape): string[] {
  return arr<{ proposed_title?: string; primary_world_name?: string }>(o.new_chapter_candidates)
    .map((c) => `${norm(c.primary_world_name)}::${norm(c.proposed_title)}`)
    .filter((k) => k !== '::');
}
function lifeContextKeys(o: ClassifierOutputShape): string[] {
  return arr<{ proposed_name?: string; kind?: string }>(o.new_life_context_candidates)
    .map((l) => `${norm(l.kind)}::${norm(l.proposed_name)}`)
    .filter((k) => k !== '::');
}
function chapterCloseKeys(o: ClassifierOutputShape): string[] {
  // only chapters being CLOSED (a structural act); plain updates are refresh noise
  return arr<{ chapter_id?: string; close_chapter?: boolean }>(o.chapter_updates)
    .filter((c) => c.close_chapter === true)
    .map((c) => norm(c.chapter_id))
    .filter(Boolean);
}
function velocityKeys(o: ClassifierOutputShape): Map<string, { delta: string; dormant: boolean }> {
  const m = new Map<string, { delta: string; dormant: boolean }>();
  for (const v of arr<VelocityUpdate>(o.velocity_updates)) {
    const id = norm(v.world_id);
    if (id)
      m.set(id, { delta: norm(v.signal_velocity_delta), dormant: v.recommend_dormant === true });
  }
  return m;
}
function evolutionKeys(o: ClassifierOutputShape): string[] {
  return arr<{ parent_world_ids?: string[]; evolution_type?: string }>(o.evolution_proposals)
    .map(
      (e) => `${norm(e.evolution_type)}::${(e.parent_world_ids || []).map(norm).sort().join(',')}`,
    )
    .filter((k) => k !== '::');
}
function reactivationKeys(o: ClassifierOutputShape): string[] {
  return arr<{ world_id?: string }>(o.reactivation_proposals)
    .map((r) => norm(r.world_id))
    .filter(Boolean);
}
function reclassKeys(o: ClassifierOutputShape): string[] {
  return arr<{ world_id?: string; target_kind?: string; target_name?: string }>(
    o.reclassification_proposals,
  )
    .map((r) => `${norm(r.world_id)}::${norm(r.target_kind)}::${norm(r.target_name)}`)
    .filter((k) => k !== '::::');
}

// ---- Pairwise structural diff between two ClassifierOutputs ---------------

export interface StructuralDiff {
  new_worlds: { only_a: string[]; only_b: string[] };
  new_chapters: { only_a: string[]; only_b: string[] };
  new_life_contexts: { only_a: string[]; only_b: string[] };
  chapter_closures: { only_a: string[]; only_b: string[] };
  velocity_delta_changes: Array<{ world_id: string; a: string; b: string }>;
  dormancy_changes: Array<{ world_id: string; a: boolean; b: boolean }>;
  evolution: { only_a: string[]; only_b: string[] };
  reactivations: { only_a: string[]; only_b: string[] };
  reclassifications: { only_a: string[]; only_b: string[] };
  divergence_count: number;
}

export function diffClassifierOutputs(
  a: ClassifierOutputShape | null,
  b: ClassifierOutputShape | null,
): StructuralDiff {
  const A = a || {};
  const B = b || {};

  const w = setDiff(worldKeys(A), worldKeys(B));
  const c = setDiff(chapterKeys(A), chapterKeys(B));
  const lc = setDiff(lifeContextKeys(A), lifeContextKeys(B));
  const cc = setDiff(chapterCloseKeys(A), chapterCloseKeys(B));
  const ev = setDiff(evolutionKeys(A), evolutionKeys(B));
  const re = setDiff(reactivationKeys(A), reactivationKeys(B));
  const rc = setDiff(reclassKeys(A), reclassKeys(B));

  const va = velocityKeys(A);
  const vb = velocityKeys(B);
  const velocity_delta_changes: Array<{ world_id: string; a: string; b: string }> = [];
  const dormancy_changes: Array<{ world_id: string; a: boolean; b: boolean }> = [];
  for (const [id, av] of va) {
    const bv = vb.get(id);
    if (!bv) continue; // a velocity update present in one but not the other is rare; not structural-critical
    if (av.delta !== bv.delta)
      velocity_delta_changes.push({ world_id: id, a: av.delta, b: bv.delta });
    if (av.dormant !== bv.dormant)
      dormancy_changes.push({ world_id: id, a: av.dormant, b: bv.dormant });
  }

  const divergence_count =
    w.only_a.length +
    w.only_b.length +
    c.only_a.length +
    c.only_b.length +
    lc.only_a.length +
    lc.only_b.length +
    cc.only_a.length +
    cc.only_b.length +
    velocity_delta_changes.length +
    dormancy_changes.length +
    ev.only_a.length +
    ev.only_b.length +
    re.only_a.length +
    re.only_b.length +
    rc.only_a.length +
    rc.only_b.length;

  return {
    new_worlds: { only_a: w.only_a, only_b: w.only_b },
    new_chapters: { only_a: c.only_a, only_b: c.only_b },
    new_life_contexts: { only_a: lc.only_a, only_b: lc.only_b },
    chapter_closures: { only_a: cc.only_a, only_b: cc.only_b },
    velocity_delta_changes,
    dormancy_changes,
    evolution: { only_a: ev.only_a, only_b: ev.only_b },
    reactivations: { only_a: re.only_a, only_b: re.only_b },
    reclassifications: { only_a: rc.only_a, only_b: rc.only_b },
    divergence_count,
  };
}

// ---- Anti-poisoning: did world_signal_candidates become worlds 1:1? ------

// C2 leak signal: if the analyst's world_signal_candidate labels map one-to-one
// onto the worlds the classifier proposed, the classifier is echoing hints
// rather than deciding independently. We measure the overlap between the
// analyst candidate labels fed in and the proposed_names emitted.
export interface AntiPoisoningCheck {
  analyst_candidate_labels: string[];
  proposed_world_names: string[];
  matched_one_to_one: string[]; // analyst labels that appear (fuzzy) as a proposed world
  match_ratio: number; // matched / analyst_candidate_labels (0..1); high = suspicious
  suspected_echo: boolean; // ratio over threshold AND most proposals are matches
}

function fuzzyContains(haystack: string, needle: string): boolean {
  const h = norm(haystack);
  const n = norm(needle);
  if (!h || !n) return false;
  return h.includes(n) || n.includes(h);
}

export function checkAntiPoisoning(
  analystCandidateLabels: string[],
  output: ClassifierOutputShape | null,
  echoThreshold = 0.6,
): AntiPoisoningCheck {
  const labels = analystCandidateLabels.map((l) => norm(l)).filter(Boolean);
  const proposed = worldKeys(output || {});

  const matched: string[] = [];
  for (const label of labels) {
    if (proposed.some((p) => fuzzyContains(p, label))) matched.push(label);
  }
  const match_ratio = labels.length === 0 ? 0 : matched.length / labels.length;
  // suspected echo only when a high share of analyst labels became worlds AND
  // the proposed worlds are mostly those matches (not the classifier also
  // independently proposing its own). Both conditions guard against false alarm.
  const proposalsAreMostlyMatches =
    proposed.length > 0 && matched.length / proposed.length >= echoThreshold;
  const suspected_echo = match_ratio >= echoThreshold && proposalsAreMostlyMatches;

  return {
    analyst_candidate_labels: labels,
    proposed_world_names: proposed,
    matched_one_to_one: matched.sort(),
    match_ratio: Math.round(match_ratio * 100) / 100,
    suspected_echo,
  };
}

// ---- Per-user report assembling the four-combination matrix --------------

// Flag combinations, named for the report.
//   base   = (bundle:false, ledger:false)  current production behavior
//   base2  = (bundle:false, ledger:false)  second draw, for the noise floor
//   c1     = (bundle:true,  ledger:false)  bundle swap only
//   c2     = (bundle:false, ledger:true)   ledger hints only
//   target = (bundle:true,  ledger:true)   full Option 3
export interface OutputDualRunInput {
  userId: string;
  windowStart: string;
  windowEnd: string;
  base: ClassifierOutputShape | null;
  base2: ClassifierOutputShape | null;
  c1: ClassifierOutputShape | null;
  c2: ClassifierOutputShape | null;
  target: ClassifierOutputShape | null;
  analystCandidateLabels: string[]; // world_signal_candidate labels fed to c2/target
  counts?: Record<string, Record<string, number>>; // optional per-combo output counts for context
  notes?: string[];
}

export interface OutputDualRunReport {
  user_id: string;
  window_start: string;
  window_end: string;
  noise_divergence: number; // base vs base2 (jitter floor)
  c1_divergence: number; // base vs c1 (bundle effect)
  c2_divergence: number; // base vs c2 (ledger effect)
  target_divergence: number; // base vs target (full effect)
  noise_diff: StructuralDiff;
  c1_diff: StructuralDiff;
  c2_diff: StructuralDiff;
  target_diff: StructuralDiff;
  anti_poisoning: AntiPoisoningCheck; // run on the target output
  target_exceeds_noise: boolean; // triage hint: target structural change above jitter floor
  attribution: string; // human-readable cause hint
  notes: string[];
}

export function buildOutputDualRunReport(input: OutputDualRunInput): OutputDualRunReport {
  const noise_diff = diffClassifierOutputs(input.base, input.base2);
  const c1_diff = diffClassifierOutputs(input.base, input.c1);
  const c2_diff = diffClassifierOutputs(input.base, input.c2);
  const target_diff = diffClassifierOutputs(input.base, input.target);
  const anti_poisoning = checkAntiPoisoning(input.analystCandidateLabels, input.target);

  const noise = noise_diff.divergence_count;
  const target_exceeds_noise = target_diff.divergence_count > noise;

  // Attribution hint: which knob most explains the target divergence above noise.
  let attribution: string;
  if (!target_exceeds_noise) {
    attribution = 'target within noise floor; no structural shift attributable to the change';
  } else {
    const c1Excess = Math.max(0, c1_diff.divergence_count - noise);
    const c2Excess = Math.max(0, c2_diff.divergence_count - noise);
    if (c1Excess > 0 && c2Excess === 0)
      attribution = 'shift attributable to C1 (unified bundle / wider data)';
    else if (c2Excess > 0 && c1Excess === 0)
      attribution = 'shift attributable to C2 (analyst ledger hints)';
    else if (c1Excess > 0 && c2Excess > 0)
      attribution = 'shift attributable to both C1 and C2; read each diff';
    else
      attribution =
        'shift appears only in the combination, not either flag alone; read target_diff';
  }

  return {
    user_id: input.userId,
    window_start: input.windowStart,
    window_end: input.windowEnd,
    noise_divergence: noise,
    c1_divergence: c1_diff.divergence_count,
    c2_divergence: c2_diff.divergence_count,
    target_divergence: target_diff.divergence_count,
    noise_diff,
    c1_diff,
    c2_diff,
    target_diff,
    anti_poisoning,
    target_exceeds_noise,
    attribution,
    notes: input.notes || [],
  };
}
