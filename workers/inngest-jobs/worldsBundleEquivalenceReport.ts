// workers/inngest-jobs/worldsBundleEquivalenceReport.ts
//
// Phase 2b Step A: pure report logic (no I/O) for the Worlds bundle-equivalence
// harness. The in-worker test function dual-collects the legacy backfill bundle
// (collectSignalForBackfillClassifier) and the unified bundle (range mode) for
// the same window, projects the unified bundle down to the 11 Worlds-consumed
// sections, and calls these functions to diff them and assemble the per-window
// report it writes to shadow_runs (run_kind='worlds_bundle_equivalence').
//
// The bar (per the agreed Step A contract section 5, with the membership nuance):
//   - 9 same-fetcher sections: must be structurally IDENTICAL (no adds, no drops,
//     no value changes) per window. Any mismatch is a real bug and blocks.
//   - 2 intentional-superset sections (habits, temporalAnchors): legacy MUST be a
//     subset of unified by IDENTITY (every legacy item present in unified), plus
//     extras allowed. A larger set that DROPPED a legacy item is a regression, not
//     a pass. We assert membership, never count. Value drift on a shared item is
//     also reported (same id, changed fields).
//   - calendarSummary is a single object, not a collection: deep-equality compare,
//     no subset semantics.
//
// Conventions: no em dashes in any string. No examples (this is code).

// ---- Section identity keys -----------------------------------------------
// Each collection section is compared by a stable identity key, never by array
// order. Sections with an `id` use it; the rest use documented composites.

export type SectionName =
  | 'journals'
  | 'notes'
  | 'todos'
  | 'habits'
  | 'habitProgress'
  | 'chatSummaries'
  | 'temporalAnchors'
  | 'profileOverrides'
  | 'ritualProgress'
  | 'photoNotes';

// Sections that must be byte-for-byte identical (same fetcher, same window).
export const IDENTICAL_SECTIONS: SectionName[] = [
  'journals',
  'notes',
  'todos',
  'habitProgress',
  'chatSummaries',
  'profileOverrides',
  'ritualProgress',
  'photoNotes',
];

// Sections that are intentional Phase 1 supersets (unwindowed in the unified
// bundle): legacy must be a subset of unified, extras are expected.
export const SUPERSET_SECTIONS: SectionName[] = ['habits', 'temporalAnchors'];

// Identity-key extractor per section.
function identityKey(section: SectionName, row: Record<string, unknown>): string {
  switch (section) {
    case 'journals':
    case 'notes':
    case 'todos':
    case 'habits':
    case 'chatSummaries':
    case 'temporalAnchors':
      return String(row.id ?? '');
    case 'habitProgress':
      return `${String(row.habit_id ?? '')}|${String(row.occurred_day ?? '')}`;
    case 'profileOverrides':
      return `${String(row.action ?? '')}|${String(row.fact_text ?? '')}|${String(row.created_at ?? '')}`;
    case 'ritualProgress':
      return String(row.ritual_day ?? '');
    case 'photoNotes':
      return String(row.note_id ?? '');
    default:
      return '';
  }
}

// ---- Utilities -----------------------------------------------------------

function asRows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
    : [];
}

// Stable stringify for value-equality (key-sorted, so field order never matters).
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

function indexByKey(
  section: SectionName,
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const r of rows) m.set(identityKey(section, r), r);
  return m;
}

// ---- Per-section diff ----------------------------------------------------

export interface SectionDiff {
  section: SectionName;
  kind: 'identical' | 'superset';
  legacy_count: number;
  unified_count: number;
  missing_from_unified: string[]; // legacy keys absent in unified -> REGRESSION
  extra_in_unified: string[]; // unified keys absent in legacy (expected for superset, a bug for identical)
  value_changed: string[]; // shared keys whose serialized value differs
  verdict: 'pass' | 'fail';
}

// Compare one collection section by identity membership.
//  - identical sections pass only with zero missing, zero extra, zero changed.
//  - superset sections pass with zero missing AND zero value_changed (legacy
//    subset of unified, shared rows unchanged); extras are allowed and reported.
export function diffSection(
  section: SectionName,
  legacyVal: unknown,
  unifiedVal: unknown,
): SectionDiff {
  const kind: SectionDiff['kind'] = SUPERSET_SECTIONS.includes(section) ? 'superset' : 'identical';
  const legacyRows = asRows(legacyVal);
  const unifiedRows = asRows(unifiedVal);

  const legacyIdx = indexByKey(section, legacyRows);
  const unifiedIdx = indexByKey(section, unifiedRows);

  const missing_from_unified: string[] = [];
  const value_changed: string[] = [];
  for (const [k, lrow] of legacyIdx) {
    const urow = unifiedIdx.get(k);
    if (!urow) {
      missing_from_unified.push(k);
    } else if (stable(lrow) !== stable(urow)) {
      value_changed.push(k);
    }
  }

  const extra_in_unified: string[] = [];
  for (const k of unifiedIdx.keys()) {
    if (!legacyIdx.has(k)) extra_in_unified.push(k);
  }

  missing_from_unified.sort();
  extra_in_unified.sort();
  value_changed.sort();

  let verdict: 'pass' | 'fail';
  if (kind === 'identical') {
    // must be exactly equal: nothing missing, nothing extra, nothing changed
    verdict =
      missing_from_unified.length === 0 &&
      extra_in_unified.length === 0 &&
      value_changed.length === 0
        ? 'pass'
        : 'fail';
  } else {
    // superset: legacy must be a subset (nothing missing) and shared rows must
    // not have drifted in value. Extras are expected and do not fail.
    verdict = missing_from_unified.length === 0 && value_changed.length === 0 ? 'pass' : 'fail';
  }

  return {
    section,
    kind,
    legacy_count: legacyRows.length,
    unified_count: unifiedRows.length,
    missing_from_unified,
    extra_in_unified,
    value_changed,
    verdict,
  };
}

// ---- calendarSummary (single object, not a collection) -------------------

export interface CalendarSummaryDiff {
  section: 'calendarSummary';
  equal: boolean;
  legacy: unknown;
  unified: unknown;
  verdict: 'pass' | 'fail';
}

export function diffCalendarSummary(legacyVal: unknown, unifiedVal: unknown): CalendarSummaryDiff {
  const equal = stable(legacyVal) === stable(unifiedVal);
  return {
    section: 'calendarSummary',
    equal,
    legacy: legacyVal ?? null,
    unified: unifiedVal ?? null,
    verdict: equal ? 'pass' : 'fail',
  };
}

// ---- Per-window report ---------------------------------------------------

export interface WorldsBundleProjection {
  journals: unknown;
  notes: unknown;
  todos: unknown;
  habits: unknown;
  habitProgress: unknown;
  chatSummaries: unknown;
  temporalAnchors: unknown;
  profileOverrides: unknown;
  ritualProgress: unknown;
  photoNotes: unknown;
  calendarSummary: unknown;
}

export interface WindowReport {
  window_index: number | 'weekly';
  window_start: string;
  window_end: string;
  section_diffs: SectionDiff[];
  calendar_diff: CalendarSummaryDiff;
  verdict: 'pass' | 'fail';
  // convenience rollups
  identical_failures: SectionName[];
  superset_extras: Record<string, number>; // section -> count of extras (habits, temporalAnchors)
  regressions: Array<{ section: string; missing: string[] }>;
}

const COLLECTION_SECTIONS: SectionName[] = [...IDENTICAL_SECTIONS, ...SUPERSET_SECTIONS];

export function buildWindowReport(
  windowIndex: number | 'weekly',
  windowStart: string,
  windowEnd: string,
  legacy: WorldsBundleProjection,
  unified: WorldsBundleProjection,
): WindowReport {
  const legacyRec = legacy as unknown as Record<string, unknown>;
  const unifiedRec = unified as unknown as Record<string, unknown>;
  const section_diffs = COLLECTION_SECTIONS.map((s) => diffSection(s, legacyRec[s], unifiedRec[s]));
  const calendar_diff = diffCalendarSummary(legacy.calendarSummary, unified.calendarSummary);

  const identical_failures = section_diffs
    .filter((d) => d.kind === 'identical' && d.verdict === 'fail')
    .map((d) => d.section);

  const superset_extras: Record<string, number> = {};
  for (const d of section_diffs) {
    if (d.kind === 'superset') superset_extras[d.section] = d.extra_in_unified.length;
  }

  const regressions = section_diffs
    .filter((d) => d.missing_from_unified.length > 0)
    .map((d) => ({ section: d.section, missing: d.missing_from_unified }));

  const allPass =
    section_diffs.every((d) => d.verdict === 'pass') && calendar_diff.verdict === 'pass';

  return {
    window_index: windowIndex,
    window_start: windowStart,
    window_end: windowEnd,
    section_diffs,
    calendar_diff,
    verdict: allPass ? 'pass' : 'fail',
    identical_failures,
    superset_extras,
    regressions,
  };
}

// ---- Per-user report (the shadow_runs payload) ---------------------------

export interface WorldsBundleUserReport {
  user_id: string;
  window_reports: WindowReport[];
  verdict: 'pass' | 'fail';
  // rollups across all windows
  any_regression: boolean;
  any_identical_failure: boolean;
  total_superset_extras: Record<string, number>;
  notes: string[];
}

export function buildUserReport(
  userId: string,
  windowReports: WindowReport[],
  notes: string[] = [],
): WorldsBundleUserReport {
  const any_regression = windowReports.some((w) => w.regressions.length > 0);
  const any_identical_failure = windowReports.some((w) => w.identical_failures.length > 0);

  const total_superset_extras: Record<string, number> = {};
  for (const w of windowReports) {
    for (const [section, n] of Object.entries(w.superset_extras)) {
      total_superset_extras[section] = (total_superset_extras[section] || 0) + n;
    }
  }

  const verdict: 'pass' | 'fail' = windowReports.every((w) => w.verdict === 'pass')
    ? 'pass'
    : 'fail';

  return {
    user_id: userId,
    window_reports: windowReports,
    verdict,
    any_regression,
    any_identical_failure,
    total_superset_extras,
    notes,
  };
}
