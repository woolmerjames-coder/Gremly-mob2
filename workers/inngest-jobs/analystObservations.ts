// workers/inngest-jobs/analystObservations.ts
//
// Phase 2a: persistence helper for the output-agnostic analyst.
// Maps the analyst's parsed output onto rows in the shared `observations` table
// (stage='analyst') per the Analyst Output Contract section 5.
//
// Design constraints honored here:
//  - No migration required. The Phase 1 substrate already has every column.
//    An analyst row supplies only: user_id, stage, kind, observed_for_week,
//    claim_summary, evidence_snapshot. Everything else is code-defaulted
//    (id, status='candidate', created_at, updated_at) or left null
//    (detector_id, surfaced_at, surfaced_in_summary_id, card_treatment_used,
//    card_payload, superseded_by). Verified against live schema.
//  - The pure builder (buildAnalystObservations) does no I/O. It is the only
//    part the dual-run uses. Rows are diffed and dumped to shadow_runs, never
//    inserted, until the cutover gate passes.
//  - The one function that writes (persistAnalystObservations) is insert-only.
//  - The only destructive op (clearAnalystObservationsForWeek) is separate and
//    never called by default. Wire it in deliberately if re-run idempotency is
//    wanted; until then re-runs are handled by Phase 4 supersession.
//
// Conventions: no em dashes in any string that lands in the database
// (claim_summary is DB text). No examples (this is code, not an AI prompt).

// ---- Types ---------------------------------------------------------------

export interface AnalystEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

// The analyst output is parsed JSON per XML section. Typed loosely and read
// defensively, because the parser has jsonrepair and legacy fallbacks and a
// section can be absent or malformed.
export interface AnalystOutput {
  themes?: unknown;
  behavioral_fingerprints?: unknown;
  cross_references?: unknown;
  magic_moment_candidates?: unknown;
  temporal_observations?: unknown;
  world_signal_candidates?: unknown;
  new_theme_candidates?: unknown;
  week_shape?: unknown;
  // Intentionally NOT persisted (consumed in-process by the rebuilder and
  // storyteller within the same weekly run, per Decision A):
  //   engagement_metrics, week_timeline, event_analysis, stale_items
  [key: string]: unknown;
}

// Only the columns an analyst row sets. PostgREST fills the rest from defaults.
export interface AnalystObservationRow {
  user_id: string;
  stage: 'analyst';
  kind: AnalystObservationKind;
  observed_for_week: string; // 'YYYY-MM-DD' (the run's weekStart); column is DATE
  claim_summary: string;
  evidence_snapshot: Record<string, unknown>;
}

export type AnalystObservationKind =
  | 'theme'
  | 'behavioral_fingerprint'
  | 'cross_reference'
  | 'magic_moment'
  | 'temporal_observation'
  | 'world_signal_candidate'
  | 'new_theme_candidate'
  | 'week_shape';

// ---- Small internal utilities -------------------------------------------

const CLAIM_MAX = 280;

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[])
    : [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function clip(value: string): string {
  const s = value.trim();
  return s.length > CLAIM_MAX ? s.slice(0, CLAIM_MAX - 1).trimEnd() + '.' : s;
}

// Build a one-line, em-dash-free claim_summary for a finding. This is internal
// ledger text (analyst rows are never surfaced to the user); it only needs to
// be a readable, searchable summary of the row.
function joinClaim(parts: Array<string | undefined | null>): string {
  return clip(
    parts
      .map((p) => str(p))
      .filter((p) => p.length > 0)
      .join(': '),
  );
}

// ---- The pure builder (no I/O) ------------------------------------------

export function buildAnalystObservations(
  analystOutput: AnalystOutput | null | undefined,
  userId: string,
  observedForWeek: string,
): AnalystObservationRow[] {
  if (!analystOutput || typeof analystOutput !== 'object') return [];

  const rows: AnalystObservationRow[] = [];
  const base = (
    kind: AnalystObservationKind,
    claim: string,
    evidence: Record<string, unknown>,
  ): AnalystObservationRow => ({
    user_id: userId,
    stage: 'analyst',
    kind,
    observed_for_week: observedForWeek,
    claim_summary: claim,
    evidence_snapshot: evidence,
  });

  // themes -> one row each
  for (const t of asArray(analystOutput.themes)) {
    rows.push(base('theme', joinClaim([str(t.label), str(t.trajectory)]), t));
  }

  // behavioral_fingerprints -> one row each
  for (const f of asArray(analystOutput.behavioral_fingerprints)) {
    rows.push(base('behavioral_fingerprint', joinClaim([str(f.pattern), str(f.evidence)]), f));
  }

  // cross_references -> one row each
  for (const c of asArray(analystOutput.cross_references)) {
    rows.push(base('cross_reference', joinClaim([str(c.connection)]), c));
  }

  // magic_moment_candidates -> one row each (kind 'magic_moment')
  for (const m of asArray(analystOutput.magic_moment_candidates)) {
    rows.push(base('magic_moment', joinClaim([str(m.title), str(m.date)]), m));
  }

  // temporal_observations -> one row each
  for (const o of asArray(analystOutput.temporal_observations)) {
    rows.push(base('temporal_observation', joinClaim([str(o.pattern_type), str(o.claim)]), o));
  }

  // world_signal_candidates -> one row each
  for (const w of asArray(analystOutput.world_signal_candidates)) {
    rows.push(base('world_signal_candidate', joinClaim([str(w.label), str(w.trend)]), w));
  }

  // new_theme_candidates -> one row each
  for (const n of asArray(analystOutput.new_theme_candidates)) {
    rows.push(base('new_theme_candidate', joinClaim([str(n.label)]), n));
  }

  // week_shape -> exactly one run-level row
  const ws = asObject(analystOutput.week_shape);
  if (ws) {
    rows.push(base('week_shape', joinClaim([str(ws.classification), str(ws.dominant_theme)]), ws));
  }

  return rows;
}

// ---- The writer (insert-only; the only function that writes) -------------

export interface PersistResult {
  ok: boolean;
  inserted: number;
  status?: number;
  error?: string;
}

export async function persistAnalystObservations(
  rows: AnalystObservationRow[],
  env: AnalystEnv,
): Promise<PersistResult> {
  if (!rows.length) return { ok: true, inserted: 0 };

  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/observations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, inserted: 0, status: res.status, error: body.slice(0, 500) };
  }

  let insertedCount = rows.length;
  try {
    const returned = await res.json();
    if (Array.isArray(returned)) insertedCount = returned.length;
  } catch {
    // return=representation should yield JSON; if it does not, fall back to the
    // count we sent. Not an error condition.
  }

  return { ok: true, inserted: insertedCount, status: res.status };
}

// ---- Destructive, opt-in only (NOT called by default) --------------------

// Clears a single user-week of analyst observation rows so a re-run does not
// duplicate. This issues a DELETE. It is not called anywhere by default. Wire
// it in only after deciding re-run idempotency policy. Until then, re-runs are
// reconciled by Phase 4 supersession rather than by deletion.
export async function clearAnalystObservationsForWeek(
  userId: string,
  observedForWeek: string,
  env: AnalystEnv,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const url =
    `${env.SUPABASE_URL}/rest/v1/observations` +
    `?user_id=eq.${userId}&stage=eq.analyst&observed_for_week=eq.${observedForWeek}` +
    // Never clear an observation that a shipped summary already references. This
    // is a no-op today (no summary stage sets surfaced_in_summary_id yet, so the
    // filter matches every analyst row and behavior is identical to an
    // unguarded whole-week clear). It is built in now so that the moment
    // summaries ship (Phase 3/4) and start marking observations surfaced, a
    // re-run's clear cannot silently delete a row a shipped summary points at.
    `&surfaced_in_summary_id=is.null`;

  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: body.slice(0, 500) };
  }
  return { ok: true, status: res.status };
}
