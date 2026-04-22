/**
 * Manual validation harness for inngest-jobs/signalCollector.ts.
 *
 * Runs live and backfill modes against a real user id, prints per-section
 * counts, and asserts the invariants from handover_v3 §8.6.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/validate-signal-collector.ts
 *
 * Or set USER_ID to test against a user other than James.
 */

import {
  collectSignalForBackfillClassifier,
  collectSignalForLiveClassifier,
  type Env,
  type SignalBundle,
} from '../workers/inngest-jobs/signalCollector';

const JAMES = '05a3c53d-b242-4b5f-a0db-83004c8e3892';

function readEnv(): Env {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing env: SUPABASE_URL and SUPABASE_SERVICE_KEY required.');
  }
  return { SUPABASE_URL, SUPABASE_SERVICE_KEY };
}

function counts(b: SignalBundle): Record<string, number> {
  const base = {
    journals: b.journals.length,
    notes: b.notes.length,
    todos: b.todos.length,
    habits: b.habits.length,
    habitProgress: b.habitProgress.length,
    chatSummaries: b.chatSummaries.length,
    temporalAnchors: b.temporalAnchors.length,
    profileOverrides: b.profileOverrides.length,
    ritualProgress: b.ritualProgress.length,
    photoNotes: b.photoNotes.length,
  };
  if (b.mode === 'live') {
    return {
      ...base,
      dcoHistory: b.dcoHistory.length,
      weeklySummaries: b.weeklySummaries.length,
    };
  }
  return base;
}

let failures = 0;
function pass(msg: string) { console.log(`  PASS  ${msg}`); }
function fail(msg: string) { console.log(`  FAIL  ${msg}`); failures++; }

async function main() {
  const env = readEnv();
  const userId = process.env.USER_ID || JAMES;
  const isJames = userId === JAMES;

  console.log(`\n=== Live mode: ${userId} ===`);
  const live = await collectSignalForLiveClassifier(userId, env);
  console.log(JSON.stringify(counts(live), null, 2));

  console.log('\nInvariants:');

  // Non-negotiable §6: synced calendar junk did not leak.
  // Budget for James: ≤ 356 non-journal notes. If calendar filter broke,
  // we'd see 4000+ (audit §2.6 documents 4,081 junk rows).
  if (isJames) {
    if (live.notes.length <= 356) {
      pass(`notes count ${live.notes.length} ≤ 356 (calendar junk filtered)`);
    } else {
      fail(`notes count ${live.notes.length} > 356, calendar junk likely leaked`);
    }
    if (live.journals.length === 119) {
      pass('journals count is 119');
    } else {
      fail(`journals count is ${live.journals.length}, expected 119 (audit §2.11)`);
    }
    if (live.chatSummaries.length === 86) {
      pass('chatSummaries count is 86');
    } else {
      fail(`chatSummaries count is ${live.chatSummaries.length}, expected 86`);
    }
    if (live.todos.length <= 714) {
      pass(`todos count ${live.todos.length} ≤ 714`);
    } else {
      fail(`todos count ${live.todos.length} exceeds audit total of 714`);
    }
  }

  // Discriminated union discipline: backfill must not carry live-only fields.
  console.log(`\n=== Backfill mode: ${userId} (last 7 days) ===`);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const backfill = await collectSignalForBackfillClassifier(
    userId,
    env,
    weekAgo.toISOString(),
    now.toISOString(),
  );
  console.log(JSON.stringify(counts(backfill), null, 2));

  console.log('\nInvariants:');
  if ('dcoHistory' in backfill || 'weeklySummaries' in backfill) {
    fail('backfill bundle leaked dcoHistory or weeklySummaries');
  } else {
    pass('backfill excludes DCO history and weekly summaries');
  }
  if (backfill.journals.length <= live.journals.length) {
    pass('backfill journals ≤ live journals (window filter applied)');
  } else {
    fail('backfill journals exceed live journals (window filter broken)');
  }

  console.log(
    failures === 0
      ? '\nAll invariants passed.\n'
      : `\n${failures} invariant(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nERROR:', err);
  process.exit(1);
});
