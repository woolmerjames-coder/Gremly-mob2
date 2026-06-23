#!/usr/bin/env npx tsx
/**
 * scripts/bundleEquivalenceCheck.ts
 *
 * Validates buildUnifiedUserBundle against fetchUserSnapshot + collectSignalForLiveClassifier
 * for three shadow users (James / Dave / Tina).
 *
 * Run:  npx tsx scripts/bundleEquivalenceCheck.ts
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Results are written to shadow_runs (run_kind='bundle_equivalence') and
 * printed as a concise pass/fail summary.
 */

import { buildUnifiedUserBundle } from '../workers/inngest-jobs/unifiedUserBundle';
import { collectSignalForLiveClassifier } from '../workers/inngest-jobs/signalCollector';
// @ts-expect-error — JS worker module; fetchUserSnapshot is exported via named export added for this harness
import { fetchUserSnapshot } from '../workers/inngest-jobs/inngest-index.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

// Auto-load env vars from .env.local so EXPO_PUBLIC_SUPABASE_URL is available
// without the user needing to export it manually.
function loadDotEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadDotEnvLocal();

// Map Expo's public URL env var → canonical name (no service key equivalent; user must supply that).
if (!process.env.SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SHADOW_USERS = [
  { id: '05a3c53d-b242-4b5f-a0db-83004c8e3892', name: 'James', timezone: 'UTC' },
  { id: 'c7674834-114b-4f6d-ac57-4d18aec8393b', name: 'Dave',  timezone: 'UTC' },
  { id: 'c64ec85f-735c-4d5c-859a-1ac6630aebb3', name: 'Tina',  timezone: 'UTC' },
] as const;

/** Matches the windowDays value the weeklySummaryV2Worker passes to fetchUserSnapshot. */
const WINDOW_DAYS = 21;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.\n' +
    '  SUPABASE_URL is loaded automatically from .env.local (EXPO_PUBLIC_SUPABASE_URL).\n' +
    '  SUPABASE_SERVICE_KEY must be supplied manually:\n' +
    '\n' +
    '  SUPABASE_SERVICE_KEY=<service_role_key> npx tsx scripts/bundleEquivalenceCheck.ts\n' +
    '\n' +
    '  Obtain the key from: Supabase dashboard → Project Settings → API → service_role (secret).'
  );
  process.exit(1);
}

const env = { SUPABASE_URL, SUPABASE_SERVICE_KEY } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

interface SectionCounts {
  bundleCount: number;
  snapshotCount: number;
  signalCollectorCount: number;
  /** IDs present in the snapshot fetcher but absent in the bundle. Should be empty. */
  missingFromBundle: string[];
}

// ─── Sections to skip the missing-ID check (see allowlist comment in task) ───

const SKIP_ID_CHECK = new Set([
  // Table rename: snapshot still queries space_chats, bundle queries scope_chats —
  // different table, different row IDs by design.
  'chatSummaries',
  // Deliberate superset: bundle fetches without any status/window filter,
  // so bundle may have MORE rows than snapshot (which filters status=active).
  'temporalAnchors',
]);

// ─── Deep equality: returns first divergent key-path ─────────────────────────

type EqResult =
  | { equal: true }
  | { equal: false; path: string; bundleVal: unknown; snapshotVal: unknown };

function deepEq(a: unknown, b: unknown, path = ''): EqResult {
  // Float tolerance: round to 4 decimal places to absorb floating-point noise
  if (typeof a === 'number' && typeof b === 'number') {
    const ra = Math.round(a * 10000) / 10000;
    const rb = Math.round(b * 10000) / 10000;
    if (ra !== rb) return { equal: false, path, bundleVal: a, snapshotVal: b };
    return { equal: true };
  }
  if (a === b) return { equal: true };
  if (a === null || b === null || typeof a !== typeof b)
    return { equal: false, path, bundleVal: a, snapshotVal: b };
  if (typeof a !== 'object')
    return { equal: false, path, bundleVal: a, snapshotVal: b };

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return { equal: false, path: `${path}.length`, bundleVal: a.length, snapshotVal: (b as unknown[]).length };
    for (let i = 0; i < a.length; i++) {
      const r = deepEq(a[i], (b as unknown[])[i], `${path}[${i}]`);
      if (!r.equal) return r;
    }
    return { equal: true };
  }
  if (Array.isArray(a) !== Array.isArray(b))
    return { equal: false, path, bundleVal: a, snapshotVal: b };

  const ao = a as AnyObj;
  const bo = b as AnyObj;
  const allKeys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const key of allKeys) {
    const r = deepEq(ao[key], bo[key], path ? `${path}.${key}` : key);
    if (!r.equal) return r;
  }
  return { equal: true };
}

// ─── Sorting helpers for stable array comparison ──────────────────────────────

function sortBy<T>(arr: T[], key: (x: T) => string | number): T[] {
  return [...arr].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// ─── Normalise computed / calendar before deep-equal ─────────────────────────
// Sort arrays by stable keys so ordering differences don't flag false failures.

function normaliseComputed(c: AnyObj): AnyObj {
  return {
    todoStats: c.todoStats,
    // Sort habitHealth by habit name — legacy and bundle fetch in the same window
    // so index order may differ.
    habitHealth: sortBy(
      ((c.habitHealth as AnyObj[]) ?? []),
      (r) => (r.name as string) ?? '',
    ),
    dropVelocity: c.dropVelocity,
    moodSignal: c.moodSignal,
    // Sort spaceActivity entries by space name for stable comparison
    spaceActivity: c.spaceActivity,
    // spaceMap excluded: it's a derived lookup, tested implicitly via spaceActivity
  };
}

function normaliseCalendar(cal: AnyObj): AnyObj {
  return {
    todaysEvents: sortBy(
      ((cal.todaysEvents as AnyObj[]) ?? []),
      (e) => `${e.title}|${e.time ?? ''}`,
    ),
    upcomingEvents: sortBy(
      ((cal.upcomingEvents as AnyObj[]) ?? []),
      (e) => `${e.date}|${e.title}`,
    ),
    spaceKeyDates: sortBy(
      ((cal.spaceKeyDates as AnyObj[]) ?? []),
      (e) => `${e.date}|${e.title}`,
    ),
  };
}

// ─── Extract IDs from an array of rows ───────────────────────────────────────

function getIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (r as AnyObj)?.id as string | undefined)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

// ─── Write result to shadow_runs ─────────────────────────────────────────────

async function writeShadowRun(userId: string, payload: unknown): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shadow_runs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        run_kind: 'bundle_equivalence',
        run_mode: 'trailing',
        payload,
        created_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`  [shadow_runs] write failed ${res.status}: ${txt.slice(0, 120)}`);
    }
  } catch (err) {
    console.warn(`  [shadow_runs] write error: ${err}`);
  }
}

// ─── Per-user check ───────────────────────────────────────────────────────────

async function checkUser(userId: string, userName: string, timezone: string) {
  console.log(`\n━━━ ${userName} (${userId.slice(0, 8)}) ━━━`);

  // Run all three fetchers in parallel
  const [bundle, snapshot, liveSignal] = await Promise.all([
    buildUnifiedUserBundle(userId, env, { mode: 'trailing', windowDays: WINDOW_DAYS }),
    fetchUserSnapshot(userId, timezone, WINDOW_DAYS, env) as Promise<AnyObj>,
    collectSignalForLiveClassifier(userId, env),
  ]);

  // ── Tier 1: deep-equal computed and calendar ────────────────────────────────
  const bundleComputedNorm   = normaliseComputed(bundle.computed as AnyObj);
  const snapshotComputedNorm = normaliseComputed((snapshot as AnyObj).computed as AnyObj);
  const computedResult = deepEq(bundleComputedNorm, snapshotComputedNorm, 'computed');

  const bundleCalNorm   = normaliseCalendar(bundle.calendar as AnyObj);
  const snapshotCalNorm = normaliseCalendar((snapshot as AnyObj).calendar as AnyObj);
  const calendarResult = deepEq(bundleCalNorm, snapshotCalNorm, 'calendar');

  // ── Tier 2: raw-section counts and superset membership ─────────────────────
  // Each entry: label, what to take from bundle, what to take from snapshot, what from live signal

  const snapRaw = (snapshot as AnyObj).raw as AnyObj;
  const sc = liveSignal as AnyObj;  // live SignalBundle (top-level fields, no .raw)

  const sectionChecks: Array<{
    label: string;
    bundleRows: unknown;
    snapshotRows: unknown;
    signalRows: unknown;
  }> = [
    {
      label: 'todos',
      bundleRows: bundle.raw.todos,
      snapshotRows: snapRaw.todos,
      signalRows: sc.todos,
    },
    {
      // snapshot.raw.drops = non-event notes + journals, pre-filtered archived=false at DB.
      // Bundle stores journals and notes separately; replication: filter !archived.
      label: 'drops (notes+journals, !archived)',
      bundleRows: [
        ...(bundle.raw.journals as AnyObj[]).filter((j) => !j.archived),
        ...(bundle.raw.notes   as AnyObj[]).filter((n) => !n.archived),
      ],
      snapshotRows: snapRaw.drops,
      signalRows: [
        ...((sc.journals as AnyObj[]) ?? []),
        ...((sc.notes    as AnyObj[]) ?? []),
      ],
    },
    {
      label: 'journals (!archived)',
      bundleRows: (bundle.raw.journals as AnyObj[]).filter((j) => !j.archived),
      snapshotRows: snapRaw.journals,
      signalRows: sc.journals,
    },
    {
      // Snapshot fetches habits with archived=eq.false.  Bundle keeps all; filter at comparison.
      label: 'habits (!archived)',
      bundleRows: (bundle.raw.habits as AnyObj[]).filter((h) => !h.archived),
      snapshotRows: snapRaw.habits,
      signalRows: ((sc.habits as AnyObj[]) ?? []).filter((h) => !h.archived),
    },
    {
      // habit_progress rows have no id — counts only, no membership check possible
      label: 'habitProgress',
      bundleRows: bundle.raw.habitProgress,
      snapshotRows: snapRaw.habitProgress,
      signalRows: sc.habitProgress,
    },
    {
      label: 'spaces',
      bundleRows: bundle.raw.spaces,
      snapshotRows: snapRaw.spaces,
      signalRows: sc.spaces,
    },
    {
      label: 'milestones',
      bundleRows: bundle.raw.milestones,
      snapshotRows: snapRaw.milestones,
      signalRows: sc.milestones,
    },
    {
      // ALLOWLISTED: bundle is a deliberate superset (no status/window filter).
      label: 'temporalAnchors',
      bundleRows: bundle.raw.temporalAnchors,
      snapshotRows: snapRaw.temporalAnchors,
      signalRows: sc.temporalAnchors,
    },
    {
      label: 'entityChatSummaries',
      bundleRows: bundle.raw.entityChatSummaries,
      snapshotRows: snapRaw.entityChatSummaries,
      signalRows: null,  // signalCollector does not include entityChatSummaries
    },
    {
      // ALLOWLISTED: snapshot queries space_chats (legacy table), bundle queries scope_chats
      // (post-rename) — different table names, different row IDs expected.
      label: 'chatSummaries',
      bundleRows: bundle.raw.chatSummaries,
      snapshotRows: snapRaw.spaceChatSummaries,
      signalRows: sc.chatSummaries,
    },
    {
      label: 'weeklySummaries',
      bundleRows: bundle.referenceState.weeklySummaries,
      snapshotRows: snapRaw.weeklySummaries,
      signalRows: sc.weeklySummaries,
    },
    {
      label: 'calendarEventsRaw',
      bundleRows: bundle.raw.calendarEventsRaw,
      // snapshot deduplicates before returning in raw — store as-is for count comparison
      snapshotRows: snapRaw.calendarEvents,
      signalRows: null,  // live signal doesn't include calendar events (no window)
    },
  ];

  const sectionReport: Record<string, SectionCounts> = {};
  for (const { label, bundleRows, snapshotRows, signalRows } of sectionChecks) {
    const bundleIds   = new Set(getIds(bundleRows));
    const snapshotIds = getIds(snapshotRows);
    const missing = SKIP_ID_CHECK.has(label)
      ? []
      : snapshotIds.filter((id) => !bundleIds.has(id));

    sectionReport[label] = {
      bundleCount:          Array.isArray(bundleRows)   ? bundleRows.length   : 0,
      snapshotCount:        Array.isArray(snapshotRows) ? snapshotRows.length : 0,
      signalCollectorCount: Array.isArray(signalRows)   ? signalRows.length   : 0,
      missingFromBundle:    missing,
    };
  }

  // ── Assemble full report ────────────────────────────────────────────────────
  const report = {
    userId,
    userName,
    checkedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    tier1: {
      computed: computedResult.equal
        ? { pass: true }
        : { pass: false, ...computedResult },
      calendar: calendarResult.equal
        ? { pass: true }
        : { pass: false, ...calendarResult },
      // Full raw objects for inspector queries
      bundleComputed:   bundle.computed,
      snapshotComputed: (snapshot as AnyObj).computed,
      bundleCalendar:   bundle.calendar,
      snapshotCalendar: (snapshot as AnyObj).calendar,
    },
    tier2: sectionReport,
  };

  await writeShadowRun(userId, report);

  // ── Console summary for this user ──────────────────────────────────────────
  const computedMark = computedResult.equal ? '✓' : '✗';
  const calMark      = calendarResult.equal ? '✓' : '✗';

  if (!computedResult.equal) {
    console.log(`  computed  ✗  first diff: ${computedResult.path}`);
    console.log(`    bundle:   ${JSON.stringify(computedResult.bundleVal)}`);
    console.log(`    snapshot: ${JSON.stringify(computedResult.snapshotVal)}`);
  } else {
    console.log(`  computed  ✓`);
  }

  if (!calendarResult.equal) {
    console.log(`  calendar  ✗  first diff: ${calendarResult.path}`);
    console.log(`    bundle:   ${JSON.stringify(calendarResult.bundleVal)}`);
    console.log(`    snapshot: ${JSON.stringify(calendarResult.snapshotVal)}`);
  } else {
    console.log(`  calendar  ✓`);
  }

  console.log('');
  for (const [label, counts] of Object.entries(sectionReport)) {
    const missingNote = counts.missingFromBundle.length
      ? ` ⚠ MISSING(${counts.missingFromBundle.length}): [${counts.missingFromBundle.slice(0, 6).join(', ')}${counts.missingFromBundle.length > 6 ? '…' : ''}]`
      : '';
    const scStr = counts.signalCollectorCount >= 0 ? ` sc=${counts.signalCollectorCount}` : '';
    console.log(
      `  ${label.padEnd(34)} bundle=${String(counts.bundleCount).padStart(4)}  snap=${String(counts.snapshotCount).padStart(4)}${scStr}${missingNote}`,
    );
  }

  return { userName, computedMark, calMark, report };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nBundle Equivalence Check  WINDOW_DAYS=${WINDOW_DAYS}`);
  console.log(`Users: ${SHADOW_USERS.map((u) => u.name).join(', ')}\n`);

  const summaries: Array<{ userName: string; computedMark: string; calMark: string; report: unknown }> = [];

  for (const user of SHADOW_USERS) {
    try {
      const result = await checkUser(user.id, user.name, user.timezone);
      summaries.push(result);
    } catch (err) {
      console.error(`\n✗ ${user.name} FATAL: ${err}`);
      summaries.push({ userName: user.name, computedMark: '✗', calMark: '✗', report: { error: String(err) } });
    }
  }

  console.log('\n══════════ SUMMARY ══════════');
  for (const s of summaries) {
    const r = s.report as { tier2?: Record<string, SectionCounts> };
    const totalMissing = r.tier2
      ? Object.values(r.tier2).reduce((sum, sec) => sum + sec.missingFromBundle.length, 0)
      : -1;
    const missingNote = totalMissing === 0 ? '✓ none' : totalMissing > 0 ? `⚠ ${totalMissing} missing ids` : 'n/a';
    console.log(
      `${s.userName.padEnd(8)} computed ${s.computedMark}  calendar ${s.calMark}  missing_ids ${missingNote}`,
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
