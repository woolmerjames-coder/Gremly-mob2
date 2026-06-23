// workers/inngest-jobs/analystDualRunReport.ts
//
// Phase 2a dual-run validation: pure report logic (no I/O). The in-worker
// dual-run test function runs the analyst+rebuilder THREE times over the SAME
// input (two legacy draws for a noise floor, one output-agnostic draw) and
// calls these functions to diff and assemble the report it writes to
// shadow_runs. Keeping the logic pure here makes it unit-testable and keeps the
// worker wiring thin.
//
// Methodology: both stages are stochastic (Haiku analyst, Sonnet rebuilder at
// temperature 0.3), so a single legacy-vs-new comparison mixes the boundary
// change with plain LLM jitter. We therefore compute TWO structural diffs:
//   signal = diff(legacyDeltaA, newDelta)      the boundary change plus jitter
//   noise  = diff(legacyDeltaA, legacyDeltaB)  jitter alone, same pipeline twice
// The triage verdict compares their divergence counts. It is a hint, not a
// ruling: the full diffs are in the payload so a human judges whether any
// signal divergence beyond the noise floor is an improvement or a regression.
//
// The diff is structural: which threads get updated, which evidence (by
// type+date) lands in which thread, and which lifecycle/status/importance
// transitions fire. Prose fields (summary, recent_update) are expected to
// differ run to run and are NOT counted as divergence.
//
// Conventions: no em dashes in any string. No examples (this is code).

// ---- Types (read defensively; deltas are parsed LLM JSON) ----------------

export interface Evidence {
  type?: string;
  date?: string;
  signal?: string;
  salience?: string;
}

export interface ThreadUpdate {
  thread_name?: string;
  domain_name?: string;
  status?: string;
  momentum?: string;
  lifecycle?: string;
  importance?: string;
  attention?: string;
  last_activity?: string | null;
  summary?: string;
  recent_update?: string;
  new_evidence?: Evidence[];
  [k: string]: unknown;
}

export interface NewThread {
  name?: string;
  domain_name?: string | null;
  new_domain_name?: string | null;
  [k: string]: unknown;
}

export interface RebuildDelta {
  thread_updates?: ThreadUpdate[];
  new_threads?: NewThread[];
  domain_attention_updates?: Record<string, string>;
  [k: string]: unknown;
}

// The structural fields whose changes matter for the equivalence bar. Prose
// fields (summary, recent_update) are intentionally excluded.
const STRUCTURAL_FIELDS = [
  'status',
  'momentum',
  'lifecycle',
  'importance',
  'attention',
  'last_activity',
] as const;
type StructuralField = (typeof STRUCTURAL_FIELDS)[number];

// ---- Small utilities -----------------------------------------------------

function norm(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

function threadKey(u: ThreadUpdate): string {
  return `${norm(u.domain_name)}::${norm(u.thread_name)}`;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Evidence compared structurally by (type, date), wording-agnostic.
function evidenceKey(e: Evidence): string {
  return `${norm(e.type)}|${norm(e.date)}`;
}

function setDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[]; common: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    onlyA: [...sa].filter((x) => !sb.has(x)).sort(),
    onlyB: [...sb].filter((x) => !sa.has(x)).sort(),
    common: [...sa].filter((x) => sb.has(x)).sort(),
  };
}

// ---- Rebuild-delta structural diff ---------------------------------------

export interface FieldChange {
  field: StructuralField;
  legacy: string;
  new: string;
}

export interface CommonThreadDiff {
  key: string;
  field_changes: FieldChange[];
  evidence_only_legacy: string[];
  evidence_only_new: string[];
}

export interface RebuildDeltaDiff {
  thread_updates: {
    only_legacy: string[];
    only_new: string[];
    common_count: number;
    common_with_changes: CommonThreadDiff[];
  };
  new_threads: {
    only_legacy: string[];
    only_new: string[];
    common: string[];
  };
  domain_attention: {
    only_legacy: string[];
    only_new: string[];
    changed: Array<{ domain: string; legacy: string; new: string }>;
  };
  verdict: 'structural_match' | 'diverged';
  divergence_count: number;
}

export function diffRebuildDeltas(
  legacy: RebuildDelta | null,
  neu: RebuildDelta | null,
): RebuildDeltaDiff {
  const legacyUpdates = arr<ThreadUpdate>(legacy?.thread_updates);
  const newUpdates = arr<ThreadUpdate>(neu?.thread_updates);

  const legacyByKey = new Map(legacyUpdates.map((u) => [threadKey(u), u]));
  const newByKey = new Map(newUpdates.map((u) => [threadKey(u), u]));

  const tu = setDiff([...legacyByKey.keys()], [...newByKey.keys()]);

  const commonWithChanges: CommonThreadDiff[] = [];
  for (const key of tu.common) {
    const l = legacyByKey.get(key) as ThreadUpdate;
    const n = newByKey.get(key) as ThreadUpdate;

    const fieldChanges: FieldChange[] = [];
    for (const f of STRUCTURAL_FIELDS) {
      const lv = norm(l[f]);
      const nv = norm(n[f]);
      if (lv !== nv)
        fieldChanges.push({ field: f, legacy: String(l[f] ?? ''), new: String(n[f] ?? '') });
    }

    const evLegacy = arr<Evidence>(l.new_evidence).map(evidenceKey);
    const evNew = arr<Evidence>(n.new_evidence).map(evidenceKey);
    const evDiff = setDiff(evLegacy, evNew);

    if (fieldChanges.length > 0 || evDiff.onlyA.length > 0 || evDiff.onlyB.length > 0) {
      commonWithChanges.push({
        key,
        field_changes: fieldChanges,
        evidence_only_legacy: evDiff.onlyA,
        evidence_only_new: evDiff.onlyB,
      });
    }
  }

  const ntLegacy = arr<NewThread>(legacy?.new_threads).map((t) => norm(t.name));
  const ntNew = arr<NewThread>(neu?.new_threads).map((t) => norm(t.name));
  const ntDiff = setDiff(ntLegacy, ntNew);

  const daLegacy = legacy?.domain_attention_updates || {};
  const daNew = neu?.domain_attention_updates || {};
  const daKeys = setDiff(Object.keys(daLegacy).map(norm), Object.keys(daNew).map(norm));
  const daChanged: Array<{ domain: string; legacy: string; new: string }> = [];
  for (const d of daKeys.common) {
    const lEntry = Object.entries(daLegacy).find(([k]) => norm(k) === d);
    const nEntry = Object.entries(daNew).find(([k]) => norm(k) === d);
    if (lEntry && nEntry && norm(lEntry[1]) !== norm(nEntry[1])) {
      daChanged.push({ domain: lEntry[0], legacy: lEntry[1], new: nEntry[1] });
    }
  }

  const divergence_count =
    tu.onlyA.length +
    tu.onlyB.length +
    commonWithChanges.length +
    ntDiff.onlyA.length +
    ntDiff.onlyB.length +
    daKeys.onlyA.length +
    daKeys.onlyB.length +
    daChanged.length;

  return {
    thread_updates: {
      only_legacy: tu.onlyA,
      only_new: tu.onlyB,
      common_count: tu.common.length,
      common_with_changes: commonWithChanges,
    },
    new_threads: {
      only_legacy: ntDiff.onlyA,
      only_new: ntDiff.onlyB,
      common: ntDiff.common,
    },
    domain_attention: {
      only_legacy: daKeys.onlyA,
      only_new: daKeys.onlyB,
      changed: daChanged,
    },
    verdict: divergence_count === 0 ? 'structural_match' : 'diverged',
    divergence_count,
  };
}

// ---- Analyst-output summary + boundary self-check ------------------------

// Fields the output-agnostic analyst must NOT emit any more. If any appear,
// the boundary leaked and the cutover is not safe.
const FORBIDDEN_MAPPING_FIELDS = [
  'life_map_thread',
  'life_map_domain',
  'suggested_domain',
  'domain_hint',
];

export interface AnalystSummary {
  section_counts: Record<string, number>;
  has_world_signal_candidates: boolean;
  has_temporal_observations: boolean;
  temporal_pattern_types: string[];
  leaked_mapping_fields: string[];
}

function countSection(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return 1;
  return 0;
}

export function summarizeAnalystOutput(
  analysis: Record<string, unknown> | null | undefined,
): AnalystSummary {
  const a = analysis || {};
  const section_counts: Record<string, number> = {};
  for (const key of Object.keys(a)) section_counts[key] = countSection(a[key]);

  const temporal = arr<Record<string, unknown>>(a.temporal_observations);
  const temporal_pattern_types = [
    ...new Set(temporal.map((t) => norm(t.pattern_type)).filter(Boolean)),
  ].sort();

  // Deep scan for any forbidden mapping field anywhere in the output.
  const leaked = new Set<string>();
  const scan = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(scan);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_MAPPING_FIELDS.includes(k) && v !== null && v !== undefined) leaked.add(k);
      scan(v);
    }
  };
  scan(a);

  return {
    section_counts,
    has_world_signal_candidates: countSection(a.world_signal_candidates) > 0,
    has_temporal_observations: temporal.length > 0,
    temporal_pattern_types,
    leaked_mapping_fields: [...leaked].sort(),
  };
}

// ---- Full per-user report (the core of the shadow_runs payload) ----------

export interface DualRunReportInput {
  userId: string;
  weekStart: string;
  weekEnd: string;
  runMode: 'incremental' | 'bootstrap';
  legacyAnalyst: Record<string, unknown> | null; // the legacy A draw, for summary context
  newAnalyst: Record<string, unknown> | null;
  legacyDeltaA: RebuildDelta | null;
  legacyDeltaB: RebuildDelta | null; // the second legacy draw, for the noise floor
  newDelta: RebuildDelta | null;
  observationRowCount: number; // built, not inserted
  observationKinds: Record<string, number>;
  seededMapDomains?: Array<{ name: string; thread_count: number }> | null; // bootstrap only
  notes?: string[];
}

export interface DualRunReport {
  user_id: string;
  week_start: string;
  week_end: string;
  run_mode: 'incremental' | 'bootstrap';
  legacy_analyst: AnalystSummary;
  new_analyst: AnalystSummary;
  signal_diff: RebuildDeltaDiff; // legacy A vs new (boundary change plus jitter)
  noise_diff: RebuildDeltaDiff; // legacy A vs legacy B (jitter alone)
  signal_divergence: number;
  noise_divergence: number;
  verdict: 'within_noise' | 'exceeds_noise'; // triage hint, not a ruling
  boundary_clean: boolean;
  seeded_map_domains?: Array<{ name: string; thread_count: number }> | null;
  notes: string[];
}

export function buildDualRunReport(input: DualRunReportInput): DualRunReport {
  const legacy_analyst = summarizeAnalystOutput(input.legacyAnalyst);
  const new_analyst = summarizeAnalystOutput(input.newAnalyst);

  const signal_diff = diffRebuildDeltas(input.legacyDeltaA, input.newDelta);
  const noise_diff = diffRebuildDeltas(input.legacyDeltaA, input.legacyDeltaB);

  const boundary_clean = new_analyst.leaked_mapping_fields.length === 0;

  // Triage hint only. The boundary change is acceptable when its structural
  // divergence sits within the same-pipeline jitter floor. Anything above the
  // floor is flagged for a human to read the diffs and judge improvement vs
  // regression. It is never auto-passed.
  const verdict: DualRunReport['verdict'] =
    signal_diff.divergence_count <= noise_diff.divergence_count ? 'within_noise' : 'exceeds_noise';

  return {
    user_id: input.userId,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    run_mode: input.runMode,
    legacy_analyst,
    new_analyst,
    signal_diff,
    noise_diff,
    signal_divergence: signal_diff.divergence_count,
    noise_divergence: noise_diff.divergence_count,
    verdict,
    boundary_clean,
    seeded_map_domains: input.seededMapDomains ?? null,
    notes: input.notes || [],
  };
}
