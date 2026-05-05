/**
 * Worlds & Chapters Inngest Jobs Worker
 *
 * Separate entry point for Worlds/Chapters classifier jobs.
 * Kept isolated from the Life Map host bundle (index.js) per the
 * check-worlds-boundary.mjs architectural constraint.
 */

import { Inngest, InngestMiddleware } from 'inngest';
import { serve } from 'inngest/cloudflare';
import {
  collectSignalForLiveClassifier,
  collectSignalForBackfillClassifier,
} from './signalCollector';
import { classifyWorldsWeekly } from './worldsClassifier';
import {
  findEarliestDropDate,
  computeWindows,
  sectionCountsOf,
  worldBookToActiveWorlds,
  chapterBookToActiveChapters,
  mergeRunIntoState,
  buildSummary,
  buildHarnessSummary,
} from './worldsHarness';
import { createWorldsWriterTest } from './worldsWriterTest';
import { createWorldsBootstrap } from './worldsBootstrap';
import { createWorldsWeeklyRun } from './worldsWeeklyRun';
import { createWorldsWeeklyScheduler } from './worldsWeeklyScheduler';
import { createDropAssignmentBackfill } from './dropAssignmentBackfill';

// Cloudflare Workers middleware to inject env bindings
const bindings = new InngestMiddleware({
  name: 'Cloudflare Workers bindings',
  init({ _client, _fn }) {
    return {
      onFunctionRun({ _ctx, _fn2, _steps, reqArgs }) {
        return {
          transformInput({ _ctx2, _fn3, _steps2 }) {
            const env = reqArgs[1];
            return { ctx: { env } };
          },
        };
      },
    };
  },
});

const inngest = new Inngest({
  id: 'gremly',
  isDev: false,
  middleware: [bindings],
});

// ─── Worlds signal collector validation (Phase 1 step 2) ────────────────────
// Trigger: send event 'app/worlds.validate-collector' from the Inngest dashboard.
// Optional payload: { "user_id": "<uuid>" }. Defaults to James.
const validateSignalCollector = inngest.createFunction(
  {
    id: 'worlds-validate-signal-collector',
    name: 'Worlds: Validate Signal Collector',
  },
  [{ event: 'app/worlds.validate-collector' }],
  async ({ event, step, env }) => {
    const JAMES = '05a3c53d-b242-4b5f-a0db-83004c8e3892';
    const userId = event.data?.user_id || JAMES;

    const liveCounts = await step.run('collect-live', async () => {
      const b = await collectSignalForLiveClassifier(userId, env);
      return {
        mode: b.mode,
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
        dcoHistory: b.dcoHistory.length,
        weeklySummaries: b.weeklySummaries.length,
      };
    });

    const backfillCounts = await step.run('collect-backfill-7d', async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const b = await collectSignalForBackfillClassifier(
        userId,
        env,
        weekAgo.toISOString(),
        now.toISOString(),
      );
      return {
        mode: b.mode,
        windowStart: b.windowStart,
        windowEnd: b.windowEnd,
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
        hasDcoHistory: 'dcoHistory' in b,
        hasWeeklySummaries: 'weeklySummaries' in b,
      };
    });

    const invariants = await step.run('check-invariants', async () => {
      const isJames = userId === JAMES;
      const checks = [];
      if (isJames) {
        checks.push({
          name: 'notes <= 356 (calendar junk filtered)',
          pass: liveCounts.notes <= 356,
          actual: liveCounts.notes,
        });
        checks.push({
          name: 'journals == 119',
          pass: liveCounts.journals === 119,
          actual: liveCounts.journals,
        });
        checks.push({
          name: 'chatSummaries == 86',
          pass: liveCounts.chatSummaries === 86,
          actual: liveCounts.chatSummaries,
        });
        checks.push({
          name: 'todos <= 714',
          pass: liveCounts.todos <= 714,
          actual: liveCounts.todos,
        });
      }
      checks.push({
        name: 'backfill excludes DCO and weekly summaries',
        pass: !backfillCounts.hasDcoHistory && !backfillCounts.hasWeeklySummaries,
      });
      checks.push({
        name: 'backfill journals <= live journals',
        pass: backfillCounts.journals <= liveCounts.journals,
        actual: `${backfillCounts.journals} vs ${liveCounts.journals}`,
      });
      const failed = checks.filter((c) => !c.pass);
      return { allPassed: failed.length === 0, failed, checks };
    });

    return { userId, liveCounts, backfillCounts, invariants };
  },
);

// ─── Worlds classifier test (Phase 1 step 3) ────────────────────────────────
// Trigger: 'app/worlds.classify'. data.user_id optional (defaults to James).
// data.mode: 'live' (default) or 'backfill'. data.window_days: int, default 28.
const classifyWorldsTest = inngest.createFunction(
  {
    id: 'worlds-classify-test',
    name: 'Worlds: Classify (test)',
  },
  [{ event: 'app/worlds.classify' }],
  async ({ event, step, env }) => {
    const JAMES = '05a3c53d-b242-4b5f-a0db-83004c8e3892';
    const userId = event.data?.user_id || JAMES;
    const mode = event.data?.mode === 'backfill' ? 'backfill' : 'live';
    const windowDays = event.data?.window_days ?? 28;

    const bundle = await step.run('collect-bundle', async () => {
      if (mode === 'backfill') {
        const end = new Date();
        const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
        return collectSignalForBackfillClassifier(
          userId,
          env,
          start.toISOString(),
          end.toISOString(),
        );
      }
      return collectSignalForLiveClassifier(userId, env);
    });

    const output = await step.run('classify', async () => {
      return classifyWorldsWeekly(bundle, [], [], env);
    });

    const summary = await step.run('summarize', async () => ({
      meta: output.run_metadata,
      counts: {
        new_world_candidates: output.new_world_candidates.length,
        new_chapter_candidates: output.new_chapter_candidates.length,
        velocity_updates: output.velocity_updates.length,
        evolution_proposals: output.evolution_proposals.length,
      },
      world_names: output.new_world_candidates.map((c) => c.proposed_name),
      chapter_titles: output.new_chapter_candidates.map((c) => c.proposed_title),
    }));

    return { summary, output };
  },
);

// ─── Worlds rolling harness (Phase 1b) ──────────────────────────────────────
// Trigger: 'app/worlds.harness'. All data.* fields optional.
//   data.userId      — defaults to James
//   data.windowDays  — default 28
//   data.strideDays  — default 14
//   data.startDate   — ISO; auto-detected from earliest drop if omitted
//   data.endDate     — ISO; defaults to now
const runWorldsHarness = inngest.createFunction(
  { id: 'worlds-harness', name: 'Worlds & Chapters rolling harness (Phase 1b)' },
  [{ event: 'app/worlds.harness' }],
  async ({ event, step, env }) => {
    const data = event.data ?? {};
    const userId = data.userId ?? '05a3c53d-b242-4b5f-a0db-83004c8e3892';
    const windowDays = data.windowDays ?? 28;
    const strideDays = data.strideDays ?? 14;

    // ── Step 1: resolve the date range ─────────────────────────
    const startDate = await step.run('resolve-start-date', async () => {
      if (data.startDate) return data.startDate;
      return findEarliestDropDate(userId, env);
    });
    const endDate = data.endDate ?? new Date().toISOString();

    // ── Step 2: compute the window boundaries ───────────────────
    const windows = computeWindows(startDate, endDate, windowDays, strideDays);

    // ── Step 3: roll through each window ───────────────────────
    let worldBook = [];
    let chapterBook = [];
    let lifeContextBook = [];
    let events = [];
    const runs = [];

    for (const w of windows) {
      const activeWorlds = worldBookToActiveWorlds(worldBook);
      const activeChapters = chapterBookToActiveChapters(chapterBook);

      const run = await step.run(`window-${w.index}`, async () => {
        const bundle = await collectSignalForBackfillClassifier(userId, env, w.start, w.end);
        const output = await classifyWorldsWeekly(bundle, activeWorlds, activeChapters, env);
        const topTitle = bundle.calendarSummary.top_titles[0]?.title ?? null;
        return {
          window_index: w.index,
          window_start: w.start,
          window_end: w.end,
          bundle_counts: sectionCountsOf(bundle),
          calendar_summary: {
            total_events: bundle.calendarSummary.total_events,
            meetings_per_week: bundle.calendarSummary.meetings_per_week,
            top_title_sample: topTitle,
          },
          active_worlds_in: activeWorlds.length,
          active_chapters_in: activeChapters.length,
          output,
        };
      });

      runs.push(run);

      const merged = mergeRunIntoState(worldBook, chapterBook, lifeContextBook, events, run);
      worldBook = merged.worldBook;
      chapterBook = merged.chapterBook;
      lifeContextBook = merged.lifeContextBook;
      events = merged.events;
    }

    // ── Step 4: build summary ───────────────────────────────────
    const summary = buildSummary(runs, worldBook, chapterBook, lifeContextBook, events);

    const finalization = {
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      window_days: windowDays,
      stride_days: strideDays,
      total_windows: windows.length,
      runs,
      world_book: worldBook,
      chapter_book: chapterBook,
      life_context_book: lifeContextBook,
      events,
      summary,
    };

    // ── Step 5: persist finalization + compact summary ──────────
    await step.run('persist-results', async () => {
      const runId = `${userId}-${Date.now()}`;
      const sbHeaders = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      };

      // Write finalization JSON to Supabase Storage
      const finalizationRes = await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/worlds-harness/${runId}.finalization.json`,
        {
          method: 'POST',
          headers: { ...sbHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(finalization),
        },
      );

      // Build compact summary derived from finalization only — no recomputation
      const compactSummary = buildHarnessSummary(finalization);

      // Write compact summary JSON to Supabase Storage
      const summaryRes = await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/worlds-harness/${runId}.summary.json`,
        {
          method: 'POST',
          headers: { ...sbHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(compactSummary),
        },
      );

      // Insert row into worlds_harness_runs (run_id text PK, user_id uuid,
      // finalization_json jsonb, summary_json jsonb)
      const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/worlds_harness_runs`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          run_id: runId,
          user_id: userId,
          finalization_json: finalization,
          summary_json: compactSummary,
        }),
      });

      return {
        run_id: runId,
        finalization_stored: finalizationRes.ok,
        summary_stored: summaryRes.ok,
        db_inserted: dbRes.ok,
      };
    });

    // ── Step 6: compact summary (Inngest step output only) ──────
    await step.run('build-compact-summary', async () => {
      return {
        user_id: finalization.user_id,
        window_days: finalization.window_days,
        stride_days: finalization.stride_days,
        total_windows: finalization.total_windows,
        cost_usd: finalization.summary.estimated_cost_usd,

        worlds: finalization.world_book.map((w) => ({
          id: w.id,
          name: w.current_name,
          phase: w.phase,
          emerged_in_window: w.emerged_in_window,
        })),

        chapters: finalization.chapter_book.map((c) => ({
          id: c.id,
          title: c.title,
          primary_world_name: c.primary_world_name,
          phase: c.phase,
          start_date: c.start_date,
          end_date: c.end_date,
          proposed_in_window: c.proposed_in_window,
          closed_in_window: c.closed_in_window,
        })),

        life_contexts: finalization.life_context_book.map((l) => ({
          id: l.id,
          name: l.name,
          kind: l.kind,
          proposed_in_window: l.proposed_in_window,
          end_date: l.end_date,
        })),

        candidates_per_window: finalization.runs.map((r) => ({
          window_index: r.window_index,
          window_end: r.window_end,
          new_chapters: (r.output.new_chapter_candidates || []).map((c) => ({
            title: c.proposed_title,
            primary_world: c.primary_world_name,
            start: c.start_date,
            end: c.end_date,
          })),
          new_life_contexts: (r.output.new_life_context_candidates || []).map((c) => ({
            name: c.proposed_name,
            kind: c.kind,
          })),
          chapter_updates: (r.output.chapter_updates || []).map((u) => ({
            chapter_id: u.chapter_id,
            close: u.close_chapter,
          })),
          reclassifications: (r.output.reclassification_proposals || []).map((p) => ({
            world_id: p.world_id,
            target_name: p.target_name,
            target_kind: p.target_kind,
          })),
        })),

        totals: finalization.summary,
      };
    });

    return finalization;
  },
);

// Inngest serve handler for Worlds jobs
const inngestHandler = serve({
  client: inngest,
  functions: [
    validateSignalCollector,
    classifyWorldsTest,
    runWorldsHarness,
    createWorldsWriterTest(inngest),
    createWorldsBootstrap(inngest),
    createWorldsWeeklyRun(inngest),
    createWorldsWeeklyScheduler(inngest),
    createDropAssignmentBackfill(inngest),
  ],
  servePath: '/',
});

export default {
  async fetch(request, env, ctx) {
    return inngestHandler.fetch(request, env, ctx);
  },
};
