/**
 * Inngest Jobs Worker - User Profile Synthesis v2
 *
 * Now includes:
 * - Pattern analysis (todos, habits, moods)
 * - Chat message fact extraction (space chats + entity chats)
 */

import { Inngest, InngestMiddleware } from 'inngest';
import { serve } from 'inngest/cloudflare';
import { jsonrepair } from 'jsonrepair';
import { buildOutputAgnosticAnalystPrompt } from './analystPrompt';
import {
  buildAnalystObservations,
  persistAnalystObservations,
  clearAnalystObservationsForWeek,
} from './analystObservations';
import { generateAdaptiveSummary } from './generateAdaptiveSummary';
import { createWorldsWeeklyRun } from './worldsWeeklyRun';
import { createDropAssignmentBackfill } from './dropAssignmentBackfill';
import { aiContext, installAiUsageLogging } from '../shared/aiUsage';
import { CARE_RULES } from './careRules';
import { createContextFunctions, hourlyContextEvents, contextMode } from './context/functions';
import { createBriefFunctions, handleBriefApi, MORNING_ACTIVE_DAYS } from './brief';
import { createWeekFunctions, handleWeekReadApi, handleWeekSpreadApi } from './week';
import { REVIEW_UNREAD, reviewAheadStatus, summaryPushData } from './week/summaryPush';
import { addDays as dayPlus, cycleOf, isDay as isRealDay } from '../shared/week.js';
import { createNotificationFunctions } from './notifications/functions';
import { runMinute as runNotificationsMinute } from './notifications/cron';
import { dedupeKey as notificationKey } from './notifications/policy';
import { handleNotificationsApi } from './notifications/api';
import { handlePlanPickApi } from './brief/planPick';
import { handleDayTurnApi } from './brief/dayTurn';
import { buildDcoV4, writeDco } from './context/daily';
import { handleFirstWorldsApi } from './context/firstWorlds';
import { handleChapterMemoryApi } from './context/memory';
import { handleWordsFreshApi } from './context/words';
import { sendEvents } from './notifications/planner';
import { reviewQuestions } from './context/questions';
import { weeklySummaryContext } from './context/summaryContext';
import {
  generateSummaryFromPass,
  loadWeeklyPass,
  summaryCheckRow,
  summaryFromPassMode,
} from './summaryFromPass';
import { jsonCall, modelFor } from './context/llm';

// Cloudflare Workers middleware to inject env bindings
const bindings = new InngestMiddleware({
  name: 'Cloudflare Workers bindings',
  init({ client, fn }) {
    return {
      onFunctionRun({ ctx, fn, steps, reqArgs }) {
        return {
          transformInput({ ctx, fn, steps }) {
            const env = reqArgs[1];
            return {
              ctx: {
                env,
              },
            };
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

// ============================================================================
// DCO (Daily Context Object) generation
// ============================================================================

function getUserLocalDate(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  return parts; // en-CA gives YYYY-MM-DD format
}

// ── Timezone day-boundary helpers ──────────────────────────────────────────────
// CANONICAL SOURCE: app DateService.ts (startOfDayUtc / endOfDayUtc).
// Mirrored here because the inngest worker is a separate bundle and cannot import
// the app TypeScript. If the worker later imports DateService directly, DELETE these
// and call dateService.startOfDayUtc / endOfDayUtc instead. Keep in sync with the service.
function startOfDayUtc(localDay, timezone) {
  const parts = localDay.split('-').map(Number);
  const localMidnight = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const utcMs = localMidnight.getTime();
  const localStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(utcMs));
  const m = localStr.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!m) return new Date(`${localDay}T00:00:00Z`).toISOString();
  const formatted = new Date(+m[3], +m[1] - 1, +m[2], +m[4] === 24 ? 0 : +m[4], +m[5], +m[6]);
  const offsetMs = formatted.getTime() - utcMs;
  return new Date(localMidnight.getTime() - offsetMs).toISOString();
}

function endOfDayUtc(localDay, timezone) {
  const parts = localDay.split('-').map(Number);
  const localEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
  const utcMs = localEnd.getTime();
  const localStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(utcMs));
  const m = localStr.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!m) return new Date(`${localDay}T23:59:59.999Z`).toISOString();
  const formatted = new Date(+m[3], +m[1] - 1, +m[2], +m[4] === 24 ? 0 : +m[4], +m[5], +m[6]);
  const offsetMs = formatted.getTime() - utcMs;
  return new Date(localEnd.getTime() - offsetMs).toISOString();
}

function addLocalDays(localDay, n) {
  const [y, mo, d] = localDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Dispatcher: hourly check for users in their 4 AM window, fan out DCO generation
const dcoDispatcher = inngest.createFunction(
  {
    id: 'dco-dispatcher',
    name: 'DCO Dispatcher',
  },
  [
    { cron: '0 * * * *' }, // Hourly — check timezone windows each run
    { event: 'app/dco.generate' }, // Manual trigger
  ],
  async ({ step, env }) => {
    // Step 1: Clean up expired DCO rows
    const cleaned = await step.run('cleanup-expired', async () => {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?expires_at=lt.${new Date().toISOString()}`,
        {
          method: 'DELETE',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
        },
      );

      const deleted = res.ok ? (await res.json()).length : 0;
      console.log(`[DCO Dispatcher] Cleaned up ${deleted} expired rows`);
      return deleted;
    });

    // Step 2: Everyone active in the last week, with the date of their last real DCO.
    // Anyone else gets theirs made fresh when they next open the app (brief/data.js).
    // Activity covers chats, sweeps and habit check-ins as well as new items.
    const allUsers = await step.run('get-users-for-dco', async () => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_users_for_dco`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active_days: MORNING_ACTIVE_DAYS }),
      });

      if (!res.ok) {
        throw new Error(`Failed to get users for DCO: ${res.status} ${res.statusText}`);
      }

      return res.json(); // [{ user_id, timezone, last_dco_date }]
    });

    // Step 3: Generate once per local day, from 4am local onwards. A run missed in the
    // 4am hour is picked up the next hour instead of skipping the day.
    const readyUsers = await step.run('filter-by-local-day', async () => {
      const now = new Date();
      const ready = [];
      for (const u of allUsers) {
        try {
          const tz = u.timezone || 'America/Los_Angeles';
          const hour = parseInt(
            new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              hour12: false,
              timeZone: tz,
            }).format(now),
            10,
          );
          const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
          const due = !u.last_dco_date || u.last_dco_date < localDay;
          if (hour >= 4 && hour !== 24 && due)
            ready.push({ user_id: u.user_id, timezone: tz, local_day: localDay });
        } catch {
          // an unknown timezone is skipped rather than guessed
        }
      }
      return ready;
    });

    console.log(
      `[DCO Dispatcher] ${allUsers.length} active users, ${readyUsers.length} due a DCO now`,
    );

    // Context pipeline: read new records into the ledger, and apply any
    // correction whose event did not arrive.
    const contextEvents = await step.run('context-events', () => hourlyContextEvents(env));
    if (contextEvents.length > 0) {
      await step.sendEvent('dispatch-context', contextEvents);
    }

    // Step 4: Fan out DCO generation for each ready user
    if (readyUsers.length > 0) {
      await step.sendEvent(
        'dispatch-dco-users',
        readyUsers.map((u) => ({
          // One event per user per local day: Inngest drops repeats with the same id,
          // so a failing user is retried by Inngest, not re-sent every hour.
          id: `dco-${u.user_id}-${u.local_day}`,
          name: 'app/dco.generate-user',
          data: { user_id: u.user_id, timezone: u.timezone },
        })),
      );
    }

    return { cleaned, total_active: allUsers.length, dispatched: readyUsers.length };
  },
);

// Per-person worker: the daily picture (DCO v4). There is no older picture to
// fall back to: when the new one fails, the run fails and says so, and the
// brief builds a picture on the spot when the person opens the app.
const generateSingleUserDco = inngest.createFunction(
  {
    id: 'generate-single-user-dco',
    name: 'Generate Single User DCO',
    concurrency: { limit: 5 },
  },
  { event: 'app/dco.generate-user' },
  async ({ event, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone;
    const mode = contextMode(env, userId);
    if (mode === 'off') return { user_id: userId, skipped: 'pipeline off' };
    const live = mode === 'on';

    if (live) {
      // Questions that have gone out of date are retired before the brief can ask one.
      await reviewQuestions(env, userId, timezone, { shadow: false }).catch((err) =>
        console.error(`[Questions] review failed for ${userId}:`, err),
      );
    }
    const built = await buildDcoV4(env, userId, { tz: timezone });
    const written = await writeDco(env, userId, built, { shadow: !live });
    return {
      user_id: userId,
      pipeline: 'dco-v4',
      shadow: !live,
      written,
      date: built.today,
      attempts: built.attempts,
      review_flags: built.problems,
    };
  },
);

const weeklySummaryV07Worker = inngest.createFunction(
  {
    id: 'weekly-summary-v07-worker',
    name: 'Weekly Summary V07 Worker',
    concurrency: { limit: 3 },
    retries: 2,
    idempotency:
      'event.data.idempotency_key ? event.data.idempotency_key : (event.data.user_id + "-" + event.data.week_start)',
  },
  { event: 'app/weekly-summary-v07.run' },
  async ({ event, step, env }) => {
    const { user_id, week_start, timezone = 'UTC' } = event.data;
    if (!user_id) throw new Error('user_id is required');
    // A week is the seven days from week_start. A person's own week ends on
    // their weekly day, so it can start on any day: Monday for a Sunday.
    if (!isRealDay(week_start)) throw new Error('week_start is required (a real day, yyyy-mm-dd)');
    const week_end = dayPlus(week_start, 6);

    const authHeaders = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };
    const runRpc = async (fnName, params) => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(params),
      });
      if (!res.ok)
        throw new Error(
          `rpc ${fnName} failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`,
        );
      return res.json();
    };
    const fetchRows = async (path) => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        method: 'GET',
        headers: authHeaders,
      });
      if (!res.ok)
        throw new Error(
          `fetch ${path} failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`,
        );
      return res.json();
    };

    // Step 0: idempotency — skip if a summary already exists for this week.
    const alreadyExists = await step.run('check-existing-summary', async () => {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${user_id}&week_start_date=eq.${week_start}&select=id&limit=1`,
        { headers: authHeaders },
      );
      if (!res.ok) return false;
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    });
    if (alreadyExists && event.data.dry_run !== true) {
      return { success: true, skipped: true, reason: 'summary_already_exists' };
    }

    // A week with nothing recorded gets no deck: there is nothing to say about
    // it, and a deck about a blank week only tells the person the app was
    // quiet. Opening the app counts as nothing recorded.
    const weekRecords = await step.run('count-week-records', async () => {
      const days = await runRpc('user_activity_days', {
        p_user: user_id,
        p_from: week_start,
        p_to: week_end,
      });
      return (days || []).reduce(
        (n, d) =>
          n +
          (d.drops || 0) +
          (d.journals || 0) +
          (d.todos_done || 0) +
          (d.habit_checkins || 0) +
          (d.chat_messages || 0) +
          (d.sweeps || 0),
        0,
      );
    });
    if (weekRecords === 0) {
      return {
        success: true,
        skipped: true,
        reason: 'nothing_recorded_this_week',
        user_id,
        week_start,
      };
    }

    // The summary from the weekly pass (data fabric stage 5): for people on
    // the context pipeline, SUMMARY_FROM_PASS says whether it is sent (on),
    // written beside the old one for James to read (beside), or not yet (off).
    // A dry run with from_pass writes it and returns it, saving nothing.
    const passMode = contextMode(env, user_id) === 'on' ? summaryFromPassMode(env) : 'off';
    // a card says more than a sentence, so its answer has more room than the morning's
    const askWords = async (req) =>
      (
        await jsonCall(env, {
          primary: modelFor(env, 'check'),
          fallback: modelFor(env, 'checkFallback'),
          ...req,
          maxTokens: 1500,
          effort: 'low',
          thinking: 'low',
        })
      ).output;
    const fromPass = (statuses) =>
      generateSummaryFromPass({
        userId: user_id,
        weekStart: week_start,
        weekEnd: week_end,
        label: `${user_id.slice(0, 8)} · ${week_start} · from the weekly pass`,
        env,
        runRpc,
        fetchRows,
        ask: askWords,
        statuses,
      });
    // the check's row is something to watch, never a gate: a row that cannot
    // be kept is said, and the summary goes on
    const keepCheck = async (r) => {
      if (!r?.deck) return;
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/check_runs`, {
          method: 'POST',
          headers: { ...authHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify(summaryCheckRow(user_id, week_end, r.deck)),
        });
        if (!res.ok)
          console.error(
            `[ALERT][V07Worker] the summary's check row was not kept for ${user_id} week ${week_start}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`,
          );
      } catch (err) {
        console.error(
          `[ALERT][V07Worker] the summary's check row was not kept for ${user_id} week ${week_start}: ${String(err?.message || err).slice(0, 160)}`,
        );
      }
    };

    if (event.data.dry_run === true && event.data.from_pass === true) {
      const dry = await step.run('summary-from-pass-dry-run', async () => {
        const r = await fromPass(['applied', 'shadow']);
        return { ...r, html: undefined };
      });
      return { dry_run: true, from_pass: true, user_id, week_start, ...dry };
    }

    let passOut = null;
    // a dry run without from_pass is the old summary's comparison run, as before
    const passWrites = passMode === 'on' && event.data.dry_run !== true;
    if (passWrites) {
      // The summary waits for the week's pass: one that has not been applied
      // is started now, straight away rather than by batch, and waited for.
      let hasPass = await step.run(
        'find-weekly-pass',
        async () => !!(await loadWeeklyPass(fetchRows, user_id, week_end, ['applied'])),
      );
      // a pass already on its way (by batch, which can take hours) is waited
      // for; a second one would only queue behind it
      for (let i = 0; !hasPass && i < 18; i++) {
        const onItsWay = await step.run(`find-weekly-pass-on-its-way-${i}`, async () => {
          const rows = await fetchRows(
            `synthesis_runs?user_id=eq.${user_id}&kind=eq.weekly&period_end=eq.${week_end}&status=in.(queued,submitted,completed)&created_at=gte.${encodeURIComponent(new Date(Date.now() - 6 * 3600e3).toISOString())}&select=id&limit=1`,
          );
          return Array.isArray(rows) && rows.length > 0;
        });
        if (!onItsWay) break;
        await step.sleep(`wait-for-weekly-pass-${i}`, '10m');
        hasPass = await step.run(
          `find-weekly-pass-${i}`,
          async () => !!(await loadWeeklyPass(fetchRows, user_id, week_end, ['applied'])),
        );
      }
      if (!hasPass) {
        console.warn(
          `[ALERT][V07Worker] no weekly pass was applied for ${user_id} week ${week_start}; starting one`,
        );
        await step.invoke('weekly-pass', {
          function: contextFunctions.weekly,
          data: { user_id, period_end: week_end, direct: true, kind: 'weekly' },
          timeout: '2h',
        });
      }
      passOut = await step.run('generate-summary-from-pass', async () => {
        const r = await fromPass(['applied']);
        await keepCheck(r);
        return { ...r, html: undefined };
      });
      if (passOut.outcome !== 'written') {
        // never a blank summary: when no deck stands, none is sent, and it is said
        console.error(
          `[ALERT][V07Worker] no summary from the weekly pass for ${user_id} week ${week_start}: ${passOut.outcome}${passOut.why ? `, ${passOut.why}` : ''}`,
        );
        return {
          success: false,
          user_id,
          week_start,
          week_end,
          outcome: passOut.outcome,
          why: passOut.why || null,
        };
      }
    }

    // Step A: fetch a snapshot so the analyst has raw data. (Not for a summary
    // from the weekly pass, which reads none of it.)
    const oldPath = !passWrites;
    // Pass targetDate: week_end so backfill/historical runs anchor to the requested week,
    // not to today.
    const snapshot = !oldPath
      ? null
      : await step.run('fetch-snapshot', async () =>
          fetchUserSnapshot(user_id, timezone, 21, env, { targetDate: week_end }),
        );

    // Context pipeline: for people on it, the week is read against the fact
    // ledger and their story instead of raw milestones, old summaries and chat
    // summaries (Gremly's own words, which are never evidence).
    const ledgerContext =
      oldPath && contextMode(env, user_id) === 'on'
        ? await step.run('ledger-context', () =>
            weeklySummaryContext(env, user_id, week_start, week_end),
          )
        : null;

    const dryRun = event.data.dry_run === true;
    const skipAnalyst = dryRun && event.data.skip_analyst === true;

    // Step B: run the analyst — produces week_shape and world_signal_candidate
    // observations that loadBrief (inside generateAdaptiveSummary) needs.
    let analystResult = null;
    if (oldPath && !skipAnalyst)
      analystResult = await step.run('run-analyst', async () => {
        const weeklySnapshot = buildWeeklySnapshot(snapshot);
        if (ledgerContext) {
          weeklySnapshot.ledger = ledgerContext;
          weeklySnapshot.weeklySummaries = [];
          weeklySnapshot.chatSummaries = [];
        }
        const lifeMap = snapshot.raw.currentLifeMap?.life_map || null;
        return runUnifiedAnalyst(weeklySnapshot, lifeMap, week_start, week_end, env);
      });

    // Step C: persist analyst observations (replaces this user-week's prior rows).
    if (oldPath && !skipAnalyst)
      await step.run('persist-analyst-observations', async () => {
        const obsRows = buildAnalystObservations(analystResult.analysis, user_id, week_start);
        await clearAnalystObservationsForWeek(user_id, week_start, env);
        const p = await persistAnalystObservations(obsRows, env);
        if (p.ok) {
          console.log(
            `[V07Worker] Persisted ${p.inserted} analyst observations for ${user_id} week ${week_start}`,
          );
          return { inserted: p.inserted, ok: true };
        }
        // Non-fatal: failed observations write must never abort the summary. Log
        // with ALERT prefix for log-based alerting, and write a queryable failure
        // row so a systemic problem is visible by SQL without log archaeology.
        console.error(
          `[ALERT][V07Worker] analyst observations persist FAILED for ${user_id} week ${week_start}: ${p.status} ${p.error || ''}`,
        );
        try {
          await fetch(`${env.SUPABASE_URL}/rest/v1/events`, {
            method: 'POST',
            headers: { ...authHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              owner_id: user_id,
              kind: 'analyst_observations_persist_failed',
              payload_json: {
                week_start,
                status: p.status ?? null,
                error: (p.error || '').slice(0, 500),
              },
            }),
          });
        } catch (e) {
          console.error(
            `[ALERT][V07Worker] could not record persist-failure event for ${user_id}: ${String(e).slice(0, 200)}`,
          );
        }
        return { inserted: 0, ok: false };
      });

    // A comparison run (dry_run) saves no deck: it runs the analyst and saves its
    // observations for the week as a real run would (skip_analyst reuses the ones
    // already saved), then returns the deck, written by writer_model when given,
    // so two writer models can be compared on the same observations.
    if (dryRun) {
      const runEnv = event.data.writer_model
        ? { ...env, SUMMARY_WRITER_MODEL: String(event.data.writer_model) }
        : env;
      const dry = await step.run('generate-summary-dry-run', async () =>
        generateAdaptiveSummary({
          userId: user_id,
          weekStart: week_start,
          weekEnd: week_end,
          label: `${user_id.slice(0, 8)} · ${week_start} · dry run`,
          env: runEnv,
          runRpc,
          fetchRows,
          ledgerContext,
        }),
      );
      return {
        dry_run: true,
        user_id,
        week_start,
        writer_model: runEnv.SUMMARY_WRITER_MODEL || 'default',
        ...dry,
      };
    }

    // Step C.5: rebuild the Life Map from this week's analyst output (incremental delta merge).
    const lifeMapRebuild = await step.run('rebuild-life-map', async () => {
      if (!oldPath)
        return { skipped: true, mergedLifeMap: null, reason: 'owned by weekly synthesis' };
      const currentLifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      if (contextMode(env, user_id) === 'on') {
        // The weekly synthesis owns the Life Map when the context pipeline is on.
        return { skipped: true, mergedLifeMap: null, reason: 'owned by weekly synthesis' };
      }
      if (!currentLifeMap) {
        console.warn(`[V07Worker] No existing Life Map for ${user_id}; skipping rebuild`);
        return { skipped: true, mergedLifeMap: null };
      }
      const userProfile = snapshot.raw.userProfile?.profile_text || null;
      const spaces = snapshot.raw.spaces || [];
      const journals = (snapshot.raw.journals || []).map((j) => ({
        title: j.title,
        body: j.body,
        mood: j.mood,
        date: j.created_at ? j.created_at.split('T')[0] : null,
      }));
      const result = await rebuildLifeMap(
        currentLifeMap,
        analystResult.analysis,
        userProfile,
        spaces,
        journals,
        env,
      );
      const mergedLifeMap = mergeWeeklyLifeMapUpdates(
        JSON.parse(JSON.stringify(currentLifeMap)),
        result.delta,
      );
      return {
        skipped: false,
        mergedLifeMap,
        currentVersion: snapshot.raw.currentLifeMap?.version || 1,
      };
    });

    // Step C.6: persist the rebuilt Life Map (only if a rebuild happened).
    await step.run('save-life-map', async () => {
      if (lifeMapRebuild.skipped || !lifeMapRebuild.mergedLifeMap) {
        return { saved: false };
      }
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id,
          life_map: lifeMapRebuild.mergedLifeMap,
          version: lifeMapRebuild.currentVersion,
          rebuilt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_evidence_date: extractLastEvidenceDate(lifeMapRebuild.mergedLifeMap),
        }),
      });
      if (!res.ok) {
        console.error(`[V07Worker] Failed to save Life Map for ${user_id}: ${res.statusText}`);
        return { saved: false };
      }
      return { saved: true };
    });

    // Step 1: run v0.7 generation pipeline. Publish-always: fact_errors are review flags,
    // not a publish gate. The only catastrophe guard is genuinely empty cards.
    // A summary from the weekly pass was written and checked above.
    const out = passOut
      ? {
          content: passOut.content,
          quality_issues: [],
          polish_outcome: 'checked',
          attempts: passOut.deck?.attempts ?? null,
          fact_errors: [],
        }
      : await step.run('generate-summary', async () =>
          generateAdaptiveSummary({
            userId: user_id,
            weekStart: week_start,
            weekEnd: week_end,
            label: `${user_id.slice(0, 8)} · ${week_start}`,
            env,
            runRpc,
            fetchRows,
            ledgerContext,
          }),
        );

    // Beside the old summary, the one from the weekly pass is written and kept
    // in shadow_runs for James to read. Nothing it does touches the old one.
    if (passMode === 'beside') {
      await step.run('summary-from-pass-beside', async () => {
        let payload;
        try {
          const r = await fromPass(['applied', 'shadow']);
          await keepCheck(r);
          payload = {
            outcome: r.outcome,
            why: r.why || null,
            run_id: r.run_id,
            content: r.content,
            dropped: r.dropped,
            left_out: r.deck?.left_out ?? [],
            tries: r.deck?.tries ?? [],
            writer_model: r.deck?.writer_model ?? null,
          };
        } catch (err) {
          console.warn(
            `[ALERT][V07Worker] the summary from the weekly pass failed beside the old one for ${user_id} week ${week_start}: ${String(err?.message || err).slice(0, 200)}`,
          );
          payload = { outcome: 'error', why: String(err?.message || err).slice(0, 500) };
        }
        // the copy kept for James to read beside the old one; one that cannot be
        // kept is said, and the old summary goes out as it would anyway
        try {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/shadow_runs`, {
            method: 'POST',
            headers: { ...authHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              user_id,
              run_kind: 'weekly_summary_from_pass',
              run_mode: 'beside',
              payload,
              window_start: week_start,
              window_end: week_end,
            }),
          });
          if (!res.ok)
            console.error(
              `[ALERT][V07Worker] the summary from the weekly pass was not kept beside the old one for ${user_id} week ${week_start}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`,
            );
        } catch (err) {
          console.error(
            `[ALERT][V07Worker] the summary from the weekly pass was not kept beside the old one for ${user_id} week ${week_start}: ${String(err?.message || err).slice(0, 160)}`,
          );
        }
        return { outcome: payload.outcome };
      });
    }

    // Catastrophe guard: nothing to publish if the writer produced zero cards.
    if (!out.content || out.content.cards.length === 0) {
      console.error(`[V07Worker] Catastrophic failure (no cards) for ${user_id} ${week_start}`);
      return {
        success: false,
        user_id,
        week_start,
        week_end,
        outcome: 'no_cards',
        fact_errors: out.fact_errors ?? [],
      };
    }

    // Step 2: resolve image hints on hero and moment cards.
    const resolvedContent = await step.run('resolve-image-hints', async () => {
      await resolveV07ImageHints(out.content.cards, env);
      return out.content;
    });

    // Step 3: delete any existing row, insert new summary.
    await step.run('save-weekly-summary', async () => {
      const headers = authHeaders;

      // Delete any existing summary for this week before insert.
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${user_id}&week_start_date=eq.${week_start}`,
        { method: 'DELETE', headers },
      );

      const cards = resolvedContent.cards ?? [];

      // Extract moment dates from source_journal_quote_id ('q_yyyy-mm-dd_n' format).
      const momentDates = cards
        .filter((c) => c.shape === 'moment')
        .map((c) => {
          const m = c.body?.source_journal_quote_id?.match(/^q_(\d{4}-\d{2}-\d{2})_/);
          return m ? m[1] : null;
        })
        .filter(Boolean);

      const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/weekly_summaries`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id,
          week_start_date: week_start,
          week_end_date: week_end,
          content: resolvedContent,
          moment_dates: momentDates,
          stats_snapshot: {
            card_count: cards.length,
            card_shapes: cards.map((c) => c.shape),
          },
          key_themes: [],
          viewed: false,
          banner_dismissed: false,
          review_flags: out.content.metadata.review_flags ?? [],
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!insertRes.ok) {
        const errText = await insertRes.text();
        throw new Error(`Failed to save weekly summary: ${errText}`);
      }
    });

    // Step 4: the scheduled run tells them it's ready, through the notifications
    // sender (settings, quiet hours, delivery receipts). Backfills stay quiet.
    if (event.data.notify) {
      // One push for the summary and the weekly review together: while the
      // review of the week ahead is still to do, the push says so too
      // (week/summaryPush.js). If that cannot be read, the push is about the
      // summary alone.
      const reviewAhead = await step.run('review-of-the-week-ahead', () =>
        reviewAheadStatus(env, user_id, week_end).catch((err) => {
          console.warn(`[WeeklySummary] could not read the review ahead: ${err?.message || err}`);
          return REVIEW_UNREAD;
        }),
      );
      const subject = `weekly_summary:${week_start}`;
      const key = notificationKey({
        userId: user_id,
        moment: 'good_news',
        subject,
        localDate: week_start,
      });
      await step.sendEvent('tell-them-it-is-ready', {
        name: 'notifications/send.due',
        id: key,
        data: {
          user_id,
          moment: 'good_news',
          subject,
          subject_type: 'weekly_summary',
          dedupe_key: key,
          planned_for: null,
          data: summaryPushData(reviewAhead),
        },
      });
    }

    return {
      success: true,
      user_id,
      week_start,
      week_end,
      outcome: out.quality_issues.length === 0 ? 'hard_pass' : 'soft_pass',
      card_shapes: (resolvedContent.cards ?? []).map((c) => c.shape),
      polish_outcome: out.polish_outcome,
      attempts: out.attempts,
    };
  },
);

// ============================================================================
// Weekly Summary V2: Dispatcher (cron + manual trigger)
// ============================================================================

const weeklySummaryV2Dispatcher = inngest.createFunction(
  {
    id: 'weekly-summary-v2-dispatcher',
    name: 'Weekly Summary V2 Dispatcher',
  },
  [
    { cron: '0 * * * *' }, // Hourly: each user's weekly slot is matched to the hour
    { event: 'app/weekly-summary-v2.dispatch' }, // Manual trigger
  ],
  async ({ step, env }) => {
    // Step 1: Fetch all users with weekly_enabled = true, including their push tokens
    const usersAndTokens = await step.run('fetch-weekly-users', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      };

      const [prefsRes, accessRes] = await Promise.all([
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?weekly_enabled=eq.true&select=user_id,weekly_time,weekly_day,timezone`,
          { headers },
        ),
        fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_active_people`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_days: 30 }),
        }),
      ]);

      if (!prefsRes.ok) throw new Error(`Failed to fetch weekly prefs: ${prefsRes.statusText}`);
      const prefs = await prefsRes.json();
      if (!accessRes.ok) throw new Error(`Failed to fetch active users: ${accessRes.status}`);
      const accessPrefs = await accessRes.json();

      // Anyone active in the last 30 days gets a weekly summary, whatever their tier.
      // The challenge no longer affects access.
      const accessMap = {};
      // where they are when their settings do not say: the same place the
      // weekly pipe works from, so the pipe always comes before the summary
      const activeTz = {};
      for (const p of accessPrefs) {
        accessMap[p.user_id] = true;
        activeTz[p.user_id] = p.timezone;
      }

      const total = prefs.length;
      let droppedNoAccess = 0;

      const filtered = prefs
        .filter((p) => {
          if (!accessMap[p.user_id]) {
            droppedNoAccess++;
            return false;
          }
          return true;
        })
        .map((p) => ({
          user_id: p.user_id,
          timezone: p.timezone || activeTz[p.user_id] || 'UTC',
          weekly_time: p.weekly_time,
          weekly_day: p.weekly_day ?? 0, // 0 = Sunday
        }));

      console.log(
        `[Weekly V2 Dispatcher] fetch-weekly-users: total=${total}, dropped_no_access=${droppedNoAccess}, eligible=${filtered.length}`,
      );

      return filtered;
    });

    // Step 2: Filter to users whose local day and hour match their configured weekly slot
    const readyUsers = await step.run('filter-by-timezone-window', async () => {
      const now = new Date();
      return usersAndTokens.filter((u) => {
        if (!u.weekly_time) return false;
        try {
          // Check day of week
          const dayStr = new Intl.DateTimeFormat('en-US', {
            timeZone: u.timezone,
            weekday: 'short',
          }).format(now);
          const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const userDayOfWeek = dayMap[dayStr] ?? 0;
          if (userDayOfWeek !== u.weekly_day) return false;

          // Check time window
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: u.timezone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          }).formatToParts(now);
          const userHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
          const userMin = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');

          const [targetHour] = u.weekly_time.split(':').map(Number);
          void userMin;
          return userHour % 24 === targetHour;
        } catch {
          return false;
        }
      });
    });

    console.log(
      `[Weekly V2 Dispatcher] ${usersAndTokens.length} weekly-enabled users, ${readyUsers.length} in window now`,
    );

    // Step 3: Fan out per-user events
    if (readyUsers.length > 0) {
      const weekKeys = {};
      for (const u of readyUsers) {
        try {
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: u.timezone }).format(
            new Date(),
          );
          // Their own week: the seven days ending on their weekly day, the one
          // today or the last one before it. With Sunday that is Monday to
          // Sunday, as it always was. People reach here on their weekly day,
          // and if this runs again after their midnight it still gives the
          // week that ended, never one that has only begun.
          weekKeys[u.user_id] = dayPlus(cycleOf(todayStr, u.weekly_day).start, -6);
        } catch {
          weekKeys[u.user_id] = 'unknown';
        }
      }

      await step.sendEvent(
        'dispatch-weekly-users',
        readyUsers.map((u) => ({
          id: `weekly-${u.user_id}-${weekKeys[u.user_id]}`,
          name: 'app/weekly-summary-v07.run',
          data: {
            user_id: u.user_id,
            timezone: u.timezone,
            week_start: weekKeys[u.user_id],
            notify: true,
          },
        })),
      );
    }

    return { total_weekly_users: usersAndTokens.length, dispatched: readyUsers.length };
  },
);

// ───────────────────────────────────────────────────────────────────
// Challenge completion: fired when someone reaches their 7th fed day.
// It records the event and starts nothing.
// ───────────────────────────────────────────────────────────────────

const handleChallengeCompletion = inngest.createFunction(
  {
    id: 'handle-challenge-completion',
    name: 'Handle Challenge Completion',
    concurrency: { limit: 5 },
    retries: 3,
  },
  { event: 'app/challenge.completed' },
  async ({ event }) => {
    const { user_id: userId, completed_at, timezone } = event.data;

    if (!userId) {
      return { skipped: true, reason: 'missing_user_id' };
    }

    // Nothing in the pipeline runs on a finished challenge any more. A new
    // person's Life Map comes from their first weekly synthesis, inside the
    // context pipeline, and the challenge is being reworked.
    void timezone;

    return { success: true, userId, completed_at };
  },
);

// ============================================================================
// DCO data fetching
// ============================================================================

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return formatDateOnly(d);
}

function fourteenDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return formatDateOnly(d);
}

function fourteenDaysFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return formatDateOnly(d);
}

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]); // eslint-disable-line no-restricted-syntax -- UTC-only date range util
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function getExpectedCompletionsForDays(frequency, days) {
  switch (frequency) {
    case 'daily':
      return days;
    case 'weekly':
      return Math.ceil(days / 7);
    case '2x/week':
      return Math.ceil((days / 7) * 2);
    case '3x/week':
      return Math.ceil((days / 7) * 3);
    case '4x/week':
      return Math.ceil((days / 7) * 4);
    case '5x/week':
      return Math.ceil((days / 7) * 5);
    case '6x/week':
      return Math.ceil((days / 7) * 6);
    case '5x/month':
      return Math.ceil((days / 30) * 5);
    case 'monthly':
      return days >= 30 ? 1 : 0;
    default:
      return days;
  }
}

// ============================================================================
// Date helpers
// ============================================================================

// Format date as YYYY-MM-DD using UTC (intentional for server-side jobs)
function formatDateOnly(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDateOnly(d);
}

function ninetyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDateOnly(d);
}

// ============================================================================
// Life Map: Extract last evidence date from Life Map JSONB
// ============================================================================

function extractLastEvidenceDate(lifeMap) {
  let maxDate = null;
  for (const domain of lifeMap.domains || []) {
    for (const thread of domain.threads || []) {
      for (const ev of thread.evidence || []) {
        if (ev.date && (!maxDate || ev.date > maxDate)) {
          maxDate = ev.date;
        }
      }
    }
  }
  return maxDate; // YYYY-MM-DD or null
}

/**
 * @param {{ selfMap?: boolean }} [opts]
 */
async function rebuildLifeMap(
  currentLifeMap,
  analystOutput,
  userProfile,
  spaces,
  journals,
  env,
  opts = {},
) {
  const t0 = Date.now();

  // Format current Life Map as compact reference (summaries + metadata, skip evidence arrays)
  const compactMap = (currentLifeMap.domains || []).map((d) => ({
    name: d.name,
    source: d.source,
    space_id: d.space_id,
    attention: d.attention,
    threads: (d.threads || []).map((t) => ({
      name: t.name,
      status: t.status,
      momentum: t.momentum,
      importance: t.importance,
      lifecycle: t.lifecycle,
      attention: t.attention,
      last_activity: t.last_activity,
      summary: t.summary,
      recent_update: t.recent_update,
      evidence_count: (t.evidence || []).length,
    })),
  }));
  const currentMapText = JSON.stringify(compactMap, null, 2);

  // Format analyst output — all sections Sonnet needs
  const analystText = JSON.stringify(
    {
      themes: analystOutput.themes,
      new_theme_candidates: analystOutput.new_theme_candidates,
      week_shape: analystOutput.week_shape,
      cross_references: analystOutput.cross_references,
      engagement_metrics: analystOutput.engagement_metrics,
      stale_items: analystOutput.stale_items,
    },
    null,
    2,
  );

  // Format raw journals for cross-reference
  let journalText = '';
  if (journals && journals.length > 0) {
    const journalLines = journals.map((j) => {
      const mood = j.mood?.length > 0 ? ` [mood: ${j.mood.join(', ')}]` : '';
      const body = j.body ? `\n    "${j.body.slice(0, 600)}"` : '';
      return `  ${j.date || j.created_at?.split('T')[0] || 'unknown'}: ${j.title}${mood}${body}`;
    });
    journalText = `\n\nRAW JOURNALS (cross-reference against analyst — pull additional emotional texture or details the analyst may have missed):\n${journalLines.join('\n')}`;
  }

  const spaceList = spaces
    .filter((s) => !s.archived_at)
    .map((s) => `"${s.name}" (id: ${s.id})`)
    .join(', ');

  const selfMap = opts.selfMap !== false;

  const analystFraming = selfMap
    ? `An analyst AI has already organized this week's raw data into observed clusters. These clusters are labeled descriptively and are NOT pre-assigned to your threads; you decide which existing thread each one corresponds to.`
    : `An analyst AI has already organized this week's raw data by thread.`;

  const matchingBlock = selfMap
    ? `MATCHING CLUSTERS TO THREADS:
- The analyst's themes are observed clusters with descriptive labels. They are not assigned to your threads, and they do not name your threads or domains.
- For each cluster, decide which existing thread in the CURRENT LIFE MAP it corresponds to by comparing the cluster's label, evidence, and content against the thread names and summaries you were given.
- When a cluster matches an existing thread, emit a thread_update keyed on that exact thread_name and domain_name.
- When a cluster matches no existing thread, do not force it. Treat it as a candidate for new_threads per the NEW THREADS rules.
- A single cluster may inform more than one thread, and more than one cluster may inform a single thread. Judge from the content.

`
    : ``;

  const threadUpdatesFirstBullet = selfMap
    ? `- Include an update for EVERY existing thread you matched a cluster to that had activity this week.`
    : `- Include an update for EVERY thread the analyst flagged with activity this week.`;

  const rebuildToday = opts.today || new Date().toISOString().slice(0, 10);
  const systemPrompt = `You are updating a Life Map — a structured model of what matters in a person's life. ${analystFraming} Your job: decide what changed and output ONLY THE CHANGES.

TODAY'S DATE: ${rebuildToday}

KEY PRINCIPLE: Output deltas, not the full Life Map. Unchanged threads should NOT appear in your output. Code will merge your changes into the existing Life Map.

${CARE_RULES}
- A thread whose summary or recent_update describes a past plan as still ahead, or carries clinical or diagnostic language, must be updated now so it reads correctly as of today, even if it had no activity this week.
- Evidence dates are the dates things happened. Never date evidence in the future.

USER'S ACTIVE SPACES: ${spaceList}

WHAT YOU RECEIVE:
1. CURRENT LIFE MAP (compact — summaries + metadata, evidence counts but not evidence arrays)
2. ANALYST OUTPUT — this week's organized findings per thread, with full specifics
3. RAW JOURNALS — for cross-referencing emotional texture the analyst may have missed

WHAT YOU PRODUCE:
A JSON delta object. Code will merge this into the existing Life Map.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:
{
  "thread_updates": [
    {
      "thread_name": "exact existing thread name",
      "domain_name": "exact existing domain name",
      "summary": "FULL updated summary — weave this week into the existing accumulated narrative. This REPLACES the old summary, so include the history PLUS this week. 1-3 sentences.",
      "recent_update": "1-2 sentences about THIS WEEK ONLY. Fresh each rebuild.",
      "status": "thriving | consistent | building | approaching_milestone | active | struggling | paused | at_risk | declining | recurring_concern",
      "momentum": "strong_upward | upward | steady | fluctuating | declining | stalled",
      "lifecycle": "active | dormant | concluded | archived",
      "importance": "high | medium | low",
      "attention": "front_of_mind | active | background",
      "last_activity": "YYYY-MM-DD — most recent activity date this week, or null if no activity",
      "new_evidence": [
        {
          "type": "journal | habit | todo | drop | calendar | milestone | chat | sweep",
          "date": "YYYY-MM-DD",
          "signal": "Short factual description of what happened",
          "salience": "high | medium | low"
        }
      ]
    }
  ],
  "new_threads": [
    {
      "domain_name": "existing domain name to add this thread to, or null for new ai_detected domain",
      "new_domain_name": "only if domain_name is null — name for new ai_detected domain",
      "name": "short specific thread name",
      "status": "building | active",
      "momentum": "upward | steady",
      "importance": "high | medium | low",
      "lifecycle": "active",
      "attention": "active",
      "summary": "1 sentence — brief, will accumulate depth over future weeks",
      "recent_update": "1-2 sentences about this week",
      "last_activity": "YYYY-MM-DD",
      "evidence": [
        {
          "type": "string",
          "date": "YYYY-MM-DD",
          "signal": "string",
          "salience": "high | medium | low"
        }
      ]
    }
  ],
  "domain_attention_updates": {
    "domain name": "front_of_mind | active | background"
  }
}

RULES:

${matchingBlock}THREAD UPDATES:
${threadUpdatesFirstBullet}
- Also include threads where the analyst flagged lifecycle changes (approaching_dormant, concluded) even if activity was zero — these need status/lifecycle/attention updates.
- Do NOT include threads with zero activity and no lifecycle change — they stay as-is.
- SUMMARY must be the FULL replacement text. Read the existing summary and weave in this week. It should read as accumulated understanding over weeks, not just this week's snapshot. Cross-check raw journals for emotional texture the analyst may have condensed.
- RECENT_UPDATE is fresh — only this week.
- NEW_EVIDENCE: Include 1-3 genuinely new evidence entries from this week. Focus on the most significant items. Code handles deduplication, but don't include things that are clearly already in the existing evidence.

NEW THREADS:
- Create from analyst's new_theme_candidates with evidence_count >= 2 spanning 2+ days.
- ALSO: Scan ALL thread updates for signals that share a common life theme but are scattered across different existing threads. If 3+ signals across 2+ weeks share an underlying theme that doesn't have its own thread yet, create one — even if each individual signal was already mapped to an existing thread. Scattered signals that belong together are MORE important to coalesce than unmatched signals.
- If the candidate overlaps with an existing thread, add the data to that thread's update instead.
- Keep summaries brief — 1 sentence. They'll accumulate over future weeks.

LIFECYCLE TRANSITIONS:
- Trust the analyst's lifecycle_signal. If "concluded" → set lifecycle: "concluded", attention: "background".
- If "approaching_dormant" and no activity 14+ days → set lifecycle: "dormant", attention: "background".
- If a previously dormant thread shows activity → set lifecycle: "active" (reactivation).

DOMAIN ATTENTION:
- front_of_mind: any thread in domain is front_of_mind
- active: any thread had activity this week
- background: no threads had activity this week
- Include in domain_attention_updates ONLY for domains whose attention level changed.

OUTPUT ONLY the JSON. No explanation, no markdown fences.`;

  const userMessage = `CURRENT LIFE MAP (compact):
${currentMapText}

ANALYST OUTPUT (this week's organized findings):
${analystText}${journalText}

${userProfile ? `USER PROFILE:\n${userProfile}` : ''}

Produce the delta JSON — only what changed this week.`;

  console.log(
    `[LifeMap:Rebuild] Calling Sonnet (delta mode). Payload: ${userMessage.length} chars`,
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      temperature: 0.3,
      stream: true,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(
      `Life Map rebuild Sonnet call failed: ${response.status} ${errBody.slice(0, 300)}`,
    );
  }

  // Read SSE stream
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // eslint-disable-next-line no-constant-condition -- SSE stream reader
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  console.log(
    `[LifeMap:Rebuild] Stream complete. Text length: ${fullText.length}, Input: ${inputTokens}, Output: ${outputTokens}`,
  );

  // Parse JSON with jsonrepair fallback
  let jsonStr = fullText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let delta;
  try {
    delta = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn('[LifeMap:Rebuild] Initial parse failed, using jsonrepair:', parseErr.message);
    try {
      delta = JSON.parse(jsonrepair(jsonStr));
      console.log('[LifeMap:Rebuild] jsonrepair succeeded');
    } catch (repairErr) {
      console.error('[LifeMap:Rebuild] jsonrepair also failed:', repairErr.message);
      console.error('[LifeMap:Rebuild] First 500:', jsonStr.slice(0, 500));
      throw new Error(`Life Map rebuild parse error: ${repairErr.message}`);
    }
  }

  const latency = Date.now() - t0;

  console.log(`[LifeMap:Rebuild] Complete in ${latency}ms`, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    thread_updates: delta.thread_updates?.length || 0,
    new_threads: delta.new_threads?.length || 0,
    domain_attention_changes: Object.keys(delta.domain_attention_updates || {}).length,
  });

  return {
    delta,
    metadata: {
      latency_ms: latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-6',
      thread_updates: delta.thread_updates?.length || 0,
      new_threads: delta.new_threads?.length || 0,
    },
  };
}

// ============================================================================
// Merge weekly Life Map delta into existing Life Map
//
// Extends the daily mergeLifeMapUpdates pattern with additional fields:
//   - summary (full replacement)
//   - lifecycle, importance, attention
//   - new thread creation
//   - domain attention updates
//   - evidence deduplication
// ============================================================================

function mergeWeeklyLifeMapUpdates(lifeMap, delta) {
  if (!lifeMap?.domains || !delta) return lifeMap;

  const now = new Date().toISOString();

  // --- Apply thread updates ---
  for (const update of delta.thread_updates || []) {
    const domain = lifeMap.domains.find((d) => d.name === update.domain_name);
    if (!domain) {
      console.warn(`[LifeMap:WeeklyMerge] Domain not found: "${update.domain_name}"`);
      continue;
    }

    const thread = (domain.threads || []).find((t) => t.name === update.thread_name);
    if (!thread) {
      console.warn(
        `[LifeMap:WeeklyMerge] Thread not found: "${update.domain_name}" → "${update.thread_name}"`,
      );
      continue;
    }

    // Apply all fields from the update
    if (update.summary) thread.summary = update.summary;
    if (update.recent_update) thread.recent_update = update.recent_update;
    if (update.status) thread.status = update.status;
    if (update.momentum) thread.momentum = update.momentum;
    if (update.lifecycle) thread.lifecycle = update.lifecycle;
    if (update.importance) thread.importance = update.importance;
    if (update.attention) thread.attention = update.attention;
    if (update.last_activity) thread.last_activity = update.last_activity;

    // Append new evidence with deduplication
    if (update.new_evidence && Array.isArray(update.new_evidence)) {
      if (!thread.evidence) thread.evidence = [];
      for (const e of update.new_evidence) {
        // Exact duplicate check (same date + same signal)
        const exactDuplicate = thread.evidence.some(
          (existing) => existing.date === e.date && existing.signal === e.signal,
        );
        if (exactDuplicate) continue;

        // Rolling-value deduplication: for milestones and habits, check if a recent
        // entry of the same type exists with a signal that's essentially the same
        // metric with a different number (e.g. "5 days away" vs "6 days away",
        // or "200% of target" vs "300% of target"). If so, UPDATE the existing
        // entry with the newer date and value instead of appending.
        const isRollingType = e.type === 'milestone' || e.type === 'habit';
        if (isRollingType) {
          // Normalize signal to a pattern by replacing numbers with a placeholder
          const normalize = (sig) => (sig || '').replace(/\d+/g, '#').toLowerCase().trim();
          const newPattern = normalize(e.signal);

          // Look for a recent entry (last 7 days) with the same type and same pattern
          const recentCutoff = new Date(e.date);
          recentCutoff.setDate(recentCutoff.getDate() - 7);
          // eslint-disable-next-line no-restricted-syntax -- worker-side date comparison, UTC is acceptable
          const recentCutoffStr = recentCutoff.toISOString().split('T')[0];

          const existingIdx = thread.evidence.findIndex(
            (existing) =>
              existing.type === e.type &&
              existing.date >= recentCutoffStr &&
              normalize(existing.signal) === newPattern,
          );

          if (existingIdx !== -1) {
            // Update in place with newer date and signal value
            thread.evidence[existingIdx].date = e.date;
            thread.evidence[existingIdx].signal = e.signal;
            thread.evidence[existingIdx].salience =
              e.salience || thread.evidence[existingIdx].salience;
            continue;
          }
        }

        // No duplicate found — append as new
        thread.evidence.push({
          type: e.type || 'drop',
          source: e.source || null,
          date: e.date,
          signal: e.signal,
          salience: e.salience || 'medium',
        });
      }
    }
  }

  // --- Add new threads ---
  for (const newThread of delta.new_threads || []) {
    let targetDomain;

    if (newThread.domain_name) {
      // Add to existing domain
      targetDomain = lifeMap.domains.find((d) => d.name === newThread.domain_name);
      if (!targetDomain) {
        console.warn(
          `[LifeMap:WeeklyMerge] Domain for new thread not found: "${newThread.domain_name}"`,
        );
        continue;
      }
    } else if (newThread.new_domain_name) {
      // Create new ai_detected domain
      targetDomain = {
        name: newThread.new_domain_name,
        source: 'ai_detected',
        space_id: null,
        attention: 'active',
        threads: [],
      };
      lifeMap.domains.push(targetDomain);
      console.log(`[LifeMap:WeeklyMerge] Created new domain: "${newThread.new_domain_name}"`);
    } else {
      console.warn(
        `[LifeMap:WeeklyMerge] New thread has no domain_name or new_domain_name: "${newThread.name}"`,
      );
      continue;
    }

    // Check for duplicate thread name
    const existing = (targetDomain.threads || []).find((t) => t.name === newThread.name);
    if (existing) {
      console.warn(`[LifeMap:WeeklyMerge] Thread already exists, skipping: "${newThread.name}"`);
      continue;
    }

    if (!targetDomain.threads) targetDomain.threads = [];
    targetDomain.threads.push({
      name: newThread.name,
      status: newThread.status || 'building',
      attention: newThread.attention || 'active',
      importance: newThread.importance || 'medium',
      summary: newThread.summary || '',
      recent_update: newThread.recent_update || '',
      momentum: newThread.momentum || 'upward',
      lifecycle: newThread.lifecycle || 'active',
      evidence: (newThread.evidence || []).map((e) => ({
        type: e.type || 'drop',
        source: e.source || null,
        date: e.date,
        signal: e.signal,
        salience: e.salience || 'medium',
      })),
      last_activity: newThread.last_activity || null,
    });
    console.log(
      `[LifeMap:WeeklyMerge] Added new thread: "${newThread.name}" in "${targetDomain.name}"`,
    );
  }

  // --- Apply domain attention updates ---
  for (const [domainName, attention] of Object.entries(delta.domain_attention_updates || {})) {
    const domain = lifeMap.domains.find((d) => d.name === domainName);
    if (domain) {
      domain.attention = attention;
    }
  }

  // --- Prune bloated evidence arrays ---
  for (const domain of lifeMap.domains) {
    for (const thread of domain.threads || []) {
      if (!thread.evidence || thread.evidence.length <= 25) continue;
      thread.evidence = pruneThreadEvidence(thread.evidence);
    }
  }

  // --- Update Life Map metadata ---
  lifeMap.version = (lifeMap.version || 1) + 1;
  lifeMap.rebuilt_at = now;
  lifeMap.updated_at = now;

  return lifeMap;
}

function pruneThreadEvidence(evidence) {
  // 1. Collapse milestone countdowns: keep only the final (most recent) entry per milestone pattern
  const milestoneGroups = {};
  const nonMilestones = [];
  for (const e of evidence) {
    if (e.type === 'milestone') {
      const pattern = (e.signal || '')
        .replace(/\d+/g, '#')
        .replace(/today/gi, '#')
        .toLowerCase()
        .trim();
      if (!milestoneGroups[pattern] || e.date > milestoneGroups[pattern].date) {
        milestoneGroups[pattern] = e;
      }
    } else {
      nonMilestones.push(e);
    }
  }

  // 2. Collapse same-week habit snapshots: keep only the latest per week per pattern
  const habitGroups = {};
  const nonHabits = [];
  for (const e of nonMilestones) {
    if (e.type === 'habit') {
      const d = new Date(e.date + 'T00:00:00Z');
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
      // eslint-disable-next-line no-restricted-syntax -- UTC-only date math for evidence grouping
      const weekKey = weekStart.toISOString().split('T')[0];
      const pattern = (e.signal || '').replace(/\d+/g, '#').toLowerCase().trim();
      const key = `${weekKey}|${pattern}`;
      if (!habitGroups[key] || e.date > habitGroups[key].date) {
        habitGroups[key] = e;
      }
    } else {
      nonHabits.push(e);
    }
  }

  // 3. Fuzzy-dedup remaining: if two entries share same date + type and signals are >80% similar, keep the longer one
  const seen = [];
  for (const e of nonHabits) {
    const isDuplicate = seen.some(
      (existing) =>
        existing.date === e.date &&
        existing.type === e.type &&
        stringSimilarity(existing.signal, e.signal) > 0.8,
    );
    if (!isDuplicate) {
      seen.push(e);
    } else {
      // If the new one is longer, replace
      const existingIdx = seen.findIndex(
        (existing) =>
          existing.date === e.date &&
          existing.type === e.type &&
          stringSimilarity(existing.signal, e.signal) > 0.8,
      );
      if (existingIdx !== -1 && (e.signal || '').length > (seen[existingIdx].signal || '').length) {
        seen[existingIdx] = e;
      }
    }
  }

  // Reassemble and sort by date
  const result = [...Object.values(milestoneGroups), ...Object.values(habitGroups), ...seen].sort(
    (a, b) => (a.date || '').localeCompare(b.date || ''),
  );

  // 4. Cap at 50, preserving all high-salience entries
  if (result.length > 50) {
    const high = result.filter((e) => e.salience === 'high');
    const rest = result
      .filter((e) => e.salience !== 'high')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 50 - high.length);
    return [...high, ...rest].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  return result;
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  const longer = la.length > lb.length ? la : lb;
  const shorter = la.length > lb.length ? lb : la;
  if (longer.length === 0) return 1;
  // Simple containment + length ratio check
  if (longer.includes(shorter)) return shorter.length / longer.length;
  // Word overlap
  const wordsA = new Set(la.split(/\s+/));
  const wordsB = new Set(lb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// ============================================================================
// Phase 4i: Weekly Summary Storyteller v2
//
// Flexible card-based output where the AI decides composition.
// Powered by:
//   - Unified analyst extraction (Haiku)
//   - Rebuilt Life Map with thread trajectories
//   - Raw journals for quote verification
//   - Prior summaries for trend context
//
// Key differences from v1:
//   - Cards are ordered by the AI based on what matters most this week
//   - Thread movements card shows Life Map trajectory changes
//   - Opening is insight-driven, not a mood label
//   - Pattern card leads with one big finding, not three equal ones
//   - Monthly retro card appears on first summary of each month
//   - AI decides emphasis — a launch week looks different from a quiet week
// ============================================================================

// ── Unsplash image resolution ────────────────────────────────────────────────
async function resolveImageUrl(imageHint, env) {
  if (!imageHint || !env.UNSPLASH_ACCESS_KEY) return null;
  try {
    const query = imageHint.replace(/_/g, ' ');
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } },
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular;
    }

    // Fallback: try shorter query (first two words only)
    const shortQuery = query.split(' ').slice(0, 2).join(' ');
    if (shortQuery !== query) {
      const retryRes = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(shortQuery)}&per_page=1&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } },
      );
      const retryData = await retryRes.json();
      if (retryData.results && retryData.results.length > 0) {
        return retryData.results[0].urls.regular;
      }
    }

    return null;
  } catch (e) {
    console.warn('[WeeklySummaryV2] Unsplash failed:', imageHint, e.message);
    return null;
  }
}

// ── Resolve image hints on v0.7 hero and moment cards ───────────────────────
// Mutates cards in-place; returns the content object (for step.run return values).
async function resolveV07ImageHints(cards, env) {
  if (!Array.isArray(cards) || !env.UNSPLASH_ACCESS_KEY) return;
  await Promise.all(
    cards
      .filter((c) => (c.shape === 'hero' || c.shape === 'moment') && c.body?.image_hint)
      .map((c) =>
        resolveImageUrl(c.body.image_hint, env).then((url) => {
          if (url) c.body.image_url = url;
        }),
      ),
  );
}

// ── Safe JSON parse with jsonrepair ─────────────────────────────────────────
function safeParseJSON(raw, label) {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn(
      `[WeeklySummaryV2:${label}] Initial parse failed, using jsonrepair:`,
      parseErr.message,
    );
    try {
      const result = JSON.parse(jsonrepair(jsonStr));
      console.log(`[WeeklySummaryV2:${label}] jsonrepair succeeded`);
      return result;
    } catch (repairErr) {
      console.error(`[WeeklySummaryV2:${label}] jsonrepair also failed:`, repairErr.message);
      console.error(`[WeeklySummaryV2:${label}] First 500:`, jsonStr.slice(0, 500));
      throw new Error(`${label} parse error: ${repairErr.message}`);
    }
  }
}

// ── SSE stream reader (reusable for Sonnet streaming) ───────────────────────
async function readSSEStream(response) {
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // eslint-disable-next-line no-constant-condition -- SSE stream reader
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }
  return { fullText, inputTokens, outputTokens };
}

// ============================================================================
// SHARED SNAPSHOT LAYER (Phase 1b)
// ============================================================================
// fetchUserSnapshot is the single canonical data assembly function.
// Every downstream pipeline (daily Life Map update, weekly rebuild,
// weekly summary, chat context) draws from this instead of running
// its own parallel queries.
// ============================================================================

/**
 * Fetch a canonical data snapshot for a user.
 * @param {string} userId
 * @param {string} timezone - IANA timezone
 * @param {number} windowDays - 7 for daily pipelines, 21 for weekly
 * @param {object} env - Cloudflare worker env
 * @param {object} opts
 * @param {string} opts.targetDate - YYYY-MM-DD, defaults to today in user's tz
 * @param {boolean} opts.includeLifeMap - fetch current Life Map (default true)
 * @param {boolean} opts.includePreviousDco - fetch previous DCO (default true)
 * @param {boolean} opts.includeWeeklySummaries - fetch recent summaries (default true)
 * @param {boolean} opts.includeProfile - fetch user profile (default true)
 * @returns {object} Canonical snapshot with raw data + computed metrics
 */
async function gatherTodayFacts(userId, timezone, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const targetDate = getUserLocalDate(timezone);
  const nowIso = new Date().toISOString();
  const startOfTodayIso = startOfDayUtc(targetDate, timezone);
  const endOfTodayIso = endOfDayUtc(targetDate, timezone);
  // forward window end = end of the 3rd day after today, local
  const endOf3DaysIso = endOfDayUtc(addLocalDays(targetDate, 3), timezone);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const queries = [
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,title,name,scheduled_date,due_day,due_date,due_time,target_date,time_window,time_estimate_minutes,duration_minutes,priority_kind,daily_block,scheduled_start_iso,locked_in,space_id,created_at,completed_at&limit=1000`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),

    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&completed_at=gte.${startOfTodayIso}&completed_at=lte.${endOfTodayIso}&select=id,title,name,space_id,completed_at&order=completed_at.desc&limit=200`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),

    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,frequency,frequency_json,days_active,time_window,time_estimate_minutes,scheduled_start_iso,daily_block,subtype,commitment,commitment_until,locked_in,target_per_period,cadence,space_id&limit=100`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),

    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=eq.${targetDate}&select=habit_id,occurred_day,count&limit=500`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),

    fetch(
      `${env.SUPABASE_URL}/rest/v1/synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${startOfTodayIso}&start_at=lte.${endOf3DaysIso}&select=id,title,start_at,end_at,is_all_day,location,provider&order=start_at.asc&limit=200`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),

    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?user_id=eq.${userId}&status=eq.active&select=id,title,description,category,date_text,resolved_date,date_confidence,date_range_start,date_range_end&order=resolved_date.asc.nullslast&limit=50`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  ];

  // GATHER part B inserted here
  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&journal_subtype=eq.intention&archived=eq.false&select=id,title,body,created_at&order=created_at.desc&limit=3`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_adaptations?owner_id=eq.${userId}&period_start=lte.${targetDate}&period_end=gte.${targetDate}&select=id,habit_id,mode,period_start,period_end,floor_note&limit=100`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_plans?owner_id=eq.${userId}&week_start=gte.${weekAgo}&select=id,habit_id,planned_date,week_start,status&order=planned_date.asc&limit=200`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/sweep_skip_events?owner_id=eq.${userId}&created_at=gte.${weekAgo}&select=id,target_date,todo_count,created_at&order=created_at.desc&limit=20`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/daily_briefs?owner_id=eq.${userId}&date=eq.${targetDate}&select=id,one_thing_id,one_thing_type,morning_sequence,day_sequence,evening_sequence,completed_at&limit=1`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_floor_suggestions?owner_id=eq.${userId}&week_start=gte.${weekAgo}&select=id,habit_id,week_start,payload&limit=100`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&completed=eq.false&select=id,title,name,date,space_id&order=date.asc&limit=50`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.journal&mood=not.is.null&created_at=gte.${weekAgo}&select=id,title,mood,created_at&order=created_at.desc&limit=20`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  const results = await Promise.all(queries);

  const safeArr = (v) => (Array.isArray(v) ? v : []);

  const todos = safeArr(results[0]);
  const completedToday = safeArr(results[1]);
  const habits = safeArr(results[2]);
  const habitProgressToday = safeArr(results[3]);
  const syncedEvents = safeArr(results[4]);
  const anchors = safeArr(results[5]);
  const intentionNotes = safeArr(results[6]);
  const habitAdaptations = safeArr(results[7]);
  const habitPlans = safeArr(results[8]);
  const skipEvents = safeArr(results[9]);
  const dailyBriefRows = safeArr(results[10]);
  const dailyBrief = dailyBriefRows[0] || null;
  const floorSuggestions = safeArr(results[11]);
  const milestones = safeArr(results[12]);
  const moodNotes = safeArr(results[13]);

  console.log(`[Gather] Built for ${userId.slice(0, 8)} (${targetDate}):`, {
    nowIso,
    weekAgo,
    todos: todos.length,
    completedToday: completedToday.length,
    habits: habits.length,
    habitProgressToday: habitProgressToday.length,
    syncedEvents: syncedEvents.length,
    anchors: anchors.length,
    intentionNotes: intentionNotes.length,
    habitAdaptations: habitAdaptations.length,
    habitPlans: habitPlans.length,
    skipEvents: skipEvents.length,
    dailyBrief: dailyBrief ? 1 : 0,
    floorSuggestions: floorSuggestions.length,
    milestones: milestones.length,
    moodNotes: moodNotes.length,
  });

  return {
    targetDate,
    todos,
    completedToday,
    habits,
    habitProgressToday,
    syncedEvents,
    anchors,
    intentionNotes,
    habitAdaptations,
    habitPlans,
    skipEvents,
    dailyBrief,
    floorSuggestions,
    milestones,
    moodNotes,
  };
}

function bucketTodayFacts(gathered) {
  const {
    targetDate,
    todos,
    completedToday,
    habits,
    habitProgressToday,
    syncedEvents,
    anchors,
    intentionNotes,
    habitAdaptations,
    habitPlans,
    skipEvents,
    dailyBrief,
    floorSuggestions,
    milestones,
    moodNotes,
  } = gathered;

  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const todosArr = safeArr(todos);
  const completedTodayRaw = safeArr(completedToday);
  const habitsArr = safeArr(habits);
  const habitProgressArr = safeArr(habitProgressToday);
  const syncedEventsArr = safeArr(syncedEvents);
  const anchorsArr = safeArr(anchors);
  const intentionNotesArr = safeArr(intentionNotes);
  const habitAdaptationsArr = safeArr(habitAdaptations);
  const habitPlansArr = safeArr(habitPlans);
  const skipEventsArr = safeArr(skipEvents);
  const floorSuggestionsArr = safeArr(floorSuggestions);
  const milestonesArr = safeArr(milestones);
  const moodNotesArr = safeArr(moodNotes);

  const todoDay = (t) => t?.scheduled_date || t?.due_day || t?.target_date || null;

  const projectTodo = (t) => ({
    title: t.title || t.name,
    day: todoDay(t),
    time_window: t.time_window || null,
    due_time: t.due_time || null,
    est_minutes: t.time_estimate_minutes ?? t.duration_minutes ?? null,
    priority_kind: t.priority_kind || null,
    daily_block: t.daily_block || null,
    locked_in: !!t.locked_in,
  });

  // completed_at is the source of truth for done-state in this DB.
  const openTodosArr = todosArr.filter((t) => t?.completed_at == null);

  const dueToday = openTodosArr.filter((t) => todoDay(t) === targetDate).map(projectTodo);
  const overdue = openTodosArr
    .filter((t) => {
      const day = todoDay(t);
      return day !== null && day < targetDate;
    })
    .map(projectTodo);
  const lockedIn = openTodosArr.filter((t) => t.locked_in === true).map(projectTodo);
  const untimedCount = openTodosArr.filter((t) => todoDay(t) === null).length;
  const totalActive = openTodosArr.length;

  const doneSet = new Set(habitProgressArr.map((hp) => hp?.habit_id).filter(Boolean));

  const adaptationMap = {};
  for (const a of habitAdaptationsArr) {
    if (!a?.habit_id) continue;
    adaptationMap[a.habit_id] = {
      mode: a.mode || null,
      floor_note: a.floor_note || null,
      period_end: a.period_end || null,
    };
  }

  const planTodayMap = {};
  for (const p of habitPlansArr) {
    if (!p?.habit_id) continue;
    if (p.planned_date === targetDate) {
      planTodayMap[p.habit_id] = p.status || null;
    }
  }

  const projectHabit = (h) => ({
    id: h.id,
    name: h.name || h.title,
    done_today: doneSet.has(h.id),
    time_window: h.time_window || null,
    scheduled_start_iso: h.scheduled_start_iso || null,
    daily_block: h.daily_block || null,
    locked_in: !!h.locked_in,
    adaptation: adaptationMap[h.id] || null,
    planned_today: planTodayMap[h.id] || null,
  });

  const projectedHabits = habitsArr.map(projectHabit);

  const scheduledToday = projectedHabits.filter(
    (h) =>
      (h.time_window && String(h.time_window).toLowerCase() !== 'any') ||
      !!h.scheduled_start_iso ||
      !!h.daily_block ||
      !!h.planned_today,
  );
  const other = projectedHabits.filter(
    (h) =>
      !(
        (h.time_window && String(h.time_window).toLowerCase() !== 'any') ||
        !!h.scheduled_start_iso ||
        !!h.daily_block ||
        !!h.planned_today
      ),
  );

  const adaptedHabitIds = new Set(
    habitAdaptationsArr
      .filter((a) => a?.habit_id && (a.mode === 'pause' || a.mode === 'floor'))
      .map((a) => a.habit_id),
  );

  const targetStart = new Date(targetDate + 'T00:00:00Z');
  const plus3Date = new Date(targetStart);
  plus3Date.setUTCDate(plus3Date.getUTCDate() + 3);
  const plus3DateStr = plus3Date.toISOString().slice(0, 10);

  const filteredSyncedEvents = syncedEventsArr.filter((e) => {
    const title = String(e?.title || '')
      .trim()
      .toLowerCase();
    return !(title.startsWith('canceled:') || title.startsWith('cancelled:'));
  });

  const seenEventKeys = new Set();
  const dedupedSyncedEvents = [];
  for (const e of filteredSyncedEvents) {
    const key = `${String(e?.title || '')
      .trim()
      .toLowerCase()}|${e?.start_at || ''}`;
    if (seenEventKeys.has(key)) continue;
    seenEventKeys.add(key);
    dedupedSyncedEvents.push(e);
  }

  const calendarToday = dedupedSyncedEvents
    .filter((e) => {
      const day = e?.start_at ? String(e.start_at).slice(0, 10) : null;
      return day === targetDate;
    })
    .map((e) => ({
      title: e.title || null,
      start_at: e.start_at,
      end_at: e.end_at || null,
      is_all_day: !!e.is_all_day,
      location: e.location || null,
      provider: e.provider || null,
    }));

  const calendarComingUpRaw = dedupedSyncedEvents
    .filter((e) => {
      const day = e?.start_at ? String(e.start_at).slice(0, 10) : null;
      return day !== null && day > targetDate && day <= plus3DateStr;
    })
    .map((e) => ({
      title: e.title || null,
      date: String(e.start_at).slice(0, 10),
      start_at: e.start_at,
      is_all_day: !!e.is_all_day,
      location: e.location || null,
    }));

  const calendarByTitle = new Map();
  for (const entry of calendarComingUpRaw) {
    const titleKey = String(entry?.title || '')
      .trim()
      .toLowerCase();
    if (!calendarByTitle.has(titleKey)) {
      calendarByTitle.set(titleKey, []);
    }
    calendarByTitle.get(titleKey).push(entry);
  }

  const calendarComingUpMixed = [];
  for (const entries of calendarByTitle.values()) {
    const days = [...new Set(entries.map((e) => e?.date).filter(Boolean))].sort();
    if (days.length <= 1) {
      calendarComingUpMixed.push(...entries);
      continue;
    }

    const sortedEntries = [...entries].sort((a, b) => {
      const aStart = String(a?.start_at || '');
      const bStart = String(b?.start_at || '');
      return aStart.localeCompare(bStart);
    });
    const first = sortedEntries[0] || entries[0];
    calendarComingUpMixed.push({
      title: first?.title || null,
      recurring: true,
      days,
      first_start_at: first?.start_at || null,
      location: first?.location || null,
    });
  }

  const calendarComingUp = calendarComingUpMixed.sort((a, b) => {
    const aDay = a?.recurring ? String(a?.days?.[0] || '') : String(a?.date || '');
    const bDay = b?.recurring ? String(b?.days?.[0] || '') : String(b?.date || '');
    if (aDay !== bDay) return aDay.localeCompare(bDay);

    const aStart = a?.recurring ? String(a?.first_start_at || '') : String(a?.start_at || '');
    const bStart = b?.recurring ? String(b?.first_start_at || '') : String(b?.start_at || '');
    return aStart.localeCompare(bStart);
  });

  const anchorsActive = anchorsArr.map((a) => ({
    title: a.title,
    category: a.category,
    date_text: a.date_text || null,
    resolved_date: a.resolved_date || null,
    date_confidence: a.date_confidence,
    range_start: a.date_range_start || null,
    range_end: a.date_range_end || null,
  }));

  const weeklyIntention = intentionNotesArr[0]
    ? {
        text: intentionNotesArr[0].title || intentionNotesArr[0].body,
        set_at: intentionNotesArr[0].created_at,
      }
    : null;

  const projectedSkipEvents = skipEventsArr
    .filter((s) => Number(s?.todo_count) > 0)
    .map((s) => ({
      target_date: s.target_date,
      todo_count: s.todo_count,
      created_at: s.created_at,
    }));

  const projectedDailyBrief = dailyBrief
    ? {
        one_thing_id: dailyBrief.one_thing_id,
        one_thing_type: dailyBrief.one_thing_type,
        has_morning: (dailyBrief.morning_sequence?.length || 0) > 0,
        has_day: (dailyBrief.day_sequence?.length || 0) > 0,
        has_evening: (dailyBrief.evening_sequence?.length || 0) > 0,
        completed: !!dailyBrief.completed_at,
      }
    : null;

  const floorCount = floorSuggestionsArr.length;

  const projectedMilestones = milestonesArr.map((m) => ({
    title: m.title || m.name,
    date: m.date,
    space_id: m.space_id,
  }));

  const recentMood = moodNotesArr.map((n) => ({
    date: n.created_at,
    moods: safeArr(n.mood),
  }));

  const commitmentHabits = habitsArr
    .filter((h) => {
      if (h.commitment !== true) return false;
      if (!h.commitment_until) return true;
      const untilDate = String(h.commitment_until).slice(0, 10);
      return untilDate >= targetDate;
    })
    .map((h) => ({
      name: h.name || h.title,
      until: h.commitment_until || null,
    }));

  const completedTodayProjected = completedTodayRaw.map((t) => ({
    title: t.title || t.name,
    completed_at: t.completed_at,
    space_id: t.space_id || null,
  }));

  return {
    targetDate,
    weeklyIntention,
    todos: {
      dueToday,
      overdue,
      lockedIn,
      untimedCount,
      totalActive,
    },
    habits: {
      scheduledToday,
      other,
      doneTodayCount: doneSet.size,
      adaptedHabitIds: [...adaptedHabitIds],
      commitments: commitmentHabits,
    },
    calendarToday,
    calendarComingUp,
    anchorsActive,
    completedToday: completedTodayProjected,
    recentMood,
    deliberate: {
      skipEvents: projectedSkipEvents,
      dailyBrief: projectedDailyBrief,
      floorCount,
      milestones: projectedMilestones,
    },
  };
}

function renderTodayFactsText(bucketed) {
  const parts = [];

  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const targetDate = bucketed?.targetDate || 'unknown';
  const weeklyIntention = bucketed?.weeklyIntention || null;

  const todosDueToday = safeArr(bucketed?.todos?.dueToday);
  const todosOverdue = safeArr(bucketed?.todos?.overdue);
  const todosLockedIn = safeArr(bucketed?.todos?.lockedIn);
  const completedToday = safeArr(bucketed?.completedToday);
  const untimedCount = Number.isFinite(bucketed?.todos?.untimedCount)
    ? bucketed.todos.untimedCount
    : 0;
  const totalActive = Number.isFinite(bucketed?.todos?.totalActive)
    ? bucketed.todos.totalActive
    : 0;

  const habitsScheduled = safeArr(bucketed?.habits?.scheduledToday);
  const habitsOther = safeArr(bucketed?.habits?.other);
  const allHabits = [...habitsScheduled, ...habitsOther];
  const adaptedHabits = allHabits.filter((h) => h?.adaptation?.mode);
  const calendarToday = safeArr(bucketed?.calendarToday);
  const calendarComingUp = safeArr(bucketed?.calendarComingUp);
  const anchorsActive = safeArr(bucketed?.anchorsActive);
  const milestones = safeArr(bucketed?.deliberate?.milestones);
  const recentMood = safeArr(bucketed?.recentMood);
  const commitments = safeArr(bucketed?.habits?.commitments);
  const skipEvents = safeArr(bucketed?.deliberate?.skipEvents);
  const dailyBrief = bucketed?.deliberate?.dailyBrief || null;
  const floorCount = Number.isFinite(bucketed?.deliberate?.floorCount)
    ? bucketed.deliberate.floorCount
    : 0;

  parts.push("=== THIS WEEK'S INTENTION (set by user in Sweep) ===");
  if (weeklyIntention?.text) {
    const setAt = weeklyIntention?.set_at || 'unknown';
    parts.push(`"${weeklyIntention.text}" (set ${setAt})`);
    parts.push(
      "This is the user's stated focus for the week. Treat it as a strong lens on today, but today's concrete reality or emotional state can take precedence when warranted.",
    );
  } else {
    parts.push('(no weekly intention set)');
  }

  parts.push('');
  parts.push(`=== TODOS DUE TODAY (${targetDate}) ===`);
  if (todosDueToday.length === 0) {
    parts.push('(none)');
  } else {
    for (const t of todosDueToday) {
      const title = t?.title || 'Untitled';
      const timeWindow = t?.time_window || 'any';
      const est = t?.est_minutes ?? '?';
      const priority = t?.priority_kind || 'none';
      const block = t?.daily_block || 'none';
      const lockedSuffix = t?.locked_in ? ', LOCKED IN' : '';
      parts.push(
        `- "${title}" [window: ${timeWindow}, est: ${est}m, priority: ${priority}, block: ${block}]${lockedSuffix}`,
      );
    }
  }

  parts.push('');
  parts.push('=== OVERDUE TODOS ===');
  if (todosOverdue.length === 0) {
    parts.push('(none)');
  } else {
    for (const t of todosOverdue) {
      const title = t?.title || 'Untitled';
      const day = t?.day || 'unknown';
      const priority = t?.priority_kind || 'none';
      parts.push(`- "${title}" (was ${day}) [priority: ${priority}]`);
    }
  }

  parts.push('');
  parts.push("=== LOCKED IN (user's explicit priorities) ===");
  if (todosLockedIn.length === 0) {
    parts.push('(none)');
  } else {
    for (const t of todosLockedIn) {
      const title = t?.title || 'Untitled';
      const day = t?.day || null;
      let label = '(no date)';
      if (day === targetDate) {
        label = '(today)';
      } else if (day && day > targetDate) {
        label = `(locked for ${day})`;
      }
      parts.push(`- "${title}" ${label}`);
    }
  }

  parts.push('');
  parts.push('=== TODOS (other) ===');
  parts.push(`${untimedCount} untimed, ${totalActive} active total`);

  parts.push('');
  parts.push('=== COMPLETED TODAY ===');
  if (completedToday.length === 0) {
    parts.push('(none)');
  } else {
    for (const t of completedToday) {
      const title = t?.title || 'Untitled';
      parts.push(`- "${title}"`);
    }
  }
  parts.push(
    'These were completed today and are evidence of momentum. Use them when judging thread state changes.',
  );

  parts.push('');
  parts.push('=== HABITS SCHEDULED TODAY ===');
  if (habitsScheduled.length === 0) {
    parts.push('(none)');
  } else {
    for (const h of habitsScheduled) {
      const name = h?.name || 'Untitled habit';
      const startIso = h?.scheduled_start_iso || null;
      const startTime =
        startIso && String(startIso).length >= 16 ? String(startIso).slice(11, 16) : null;
      const dailyBlock = h?.daily_block || null;
      const timeWindow = h?.time_window || null;
      const resolvedTime = startTime
        ? `at ${startTime}`
        : dailyBlock
          ? String(dailyBlock)
          : timeWindow && String(timeWindow).toLowerCase() !== 'any'
            ? String(timeWindow)
            : 'anytime';
      const done = h?.done_today ? 'yes' : 'no';
      const planned = h?.planned_today || 'none';
      let line = `- "${name}" [${resolvedTime}, done_today: ${done}, planned: ${planned}]`;
      if (h?.adaptation?.mode) {
        const floorNote = h?.adaptation?.floor_note ? `, floor: ${h.adaptation.floor_note}` : '';
        line += ` | ADAPTED: ${h.adaptation.mode}${floorNote}`;
      }
      parts.push(line);
    }
  }

  parts.push('');
  parts.push('=== HABITS (other active) ===');
  if (habitsOther.length === 0) {
    parts.push('(none)');
  } else {
    for (const h of habitsOther) {
      const name = h?.name || 'Untitled habit';
      const done = h?.done_today ? 'yes' : 'no';
      let line = `- "${name}" [done_today: ${done}]`;
      if (h?.adaptation?.mode) {
        line += ` | ADAPTED: ${h.adaptation.mode}`;
      }
      parts.push(line);
    }
  }

  parts.push('');
  parts.push('=== HABIT ADAPTATIONS THIS WEEK (deliberate keep/floor/pause) ===');
  if (adaptedHabits.length === 0) {
    parts.push('(none)');
  } else {
    for (const h of adaptedHabits) {
      const name = h?.name || 'Untitled habit';
      const mode = h?.adaptation?.mode || 'unknown';
      const floorNote = h?.adaptation?.floor_note ? `, floor: ${h.adaptation.floor_note}` : '';
      parts.push(`- "${name}" mode: ${mode}${floorNote}`);
    }
    parts.push(
      'These are deliberate choices; habits marked pause or floor must NOT be treated as streak risks.',
    );
  }

  parts.push('');
  parts.push(`=== CALENDAR TODAY (${targetDate}) ===`);
  if (calendarToday.length === 0) {
    parts.push('(none)');
  } else {
    for (const e of calendarToday) {
      const title = e?.title || 'Untitled';
      const startAt =
        e?.start_at && String(e.start_at).length >= 16 ? String(e.start_at).slice(11, 16) : '??:??';
      const endAt =
        e?.end_at && String(e.end_at).length >= 16 ? String(e.end_at).slice(11, 16) : 'open';
      const timing = e?.is_all_day ? 'all day' : 'timed';
      const locationPart = e?.location ? `, at ${e.location}` : '';
      parts.push(`- "${title}" ${startAt} to ${endAt} [${timing}]${locationPart}`);
    }
  }

  parts.push('');
  parts.push('=== COMING UP (next 3 days) ===');
  if (calendarComingUp.length === 0) {
    parts.push('(none)');
  } else {
    for (const e of calendarComingUp) {
      const title = e?.title || 'Untitled';
      const locationPart = e?.location ? `, at ${e.location}` : '';
      if (e?.recurring === true) {
        const days = Array.isArray(e?.days) ? e.days.join(', ') : 'unknown';
        parts.push(`- "${title}" (recurring: ${days})${locationPart}`);
        continue;
      }

      const date = e?.date || 'unknown';
      const startVal = e?.is_all_day
        ? 'all day'
        : e?.start_at && String(e.start_at).length >= 16
          ? String(e.start_at).slice(11, 16)
          : '??:??';
      const normalLocationPart = e?.location ? ` | at ${e.location}` : '';
      parts.push(`- ${date}: "${title}" ${startVal}${normalLocationPart}`);
    }
  }

  parts.push('');
  parts.push('=== DATED ANCHORS (active, from conversations) ===');
  if (anchorsActive.length === 0) {
    parts.push('(none)');
  } else {
    for (const a of anchorsActive) {
      const title = a?.title || 'Untitled';
      const category = a?.category || 'unknown';
      const dateVal = a?.resolved_date || a?.date_text || 'unknown';
      const confidence = a?.date_confidence ?? 'unknown';
      parts.push(`- "${title}" [${category}] date: ${dateVal}, confidence: ${confidence}`);
    }
  }

  parts.push('');
  parts.push('=== MILESTONES (active, dated targets) ===');
  if (milestones.length === 0) {
    parts.push('(none)');
  } else {
    for (const m of milestones) {
      const title = m?.title || 'Untitled';
      const date = m?.date || 'none';
      parts.push(`- "${title}" target: ${date}`);
    }
  }

  parts.push('');
  parts.push("=== THIS WEEK'S SHAPE ===");
  const briefState = dailyBrief ? 'set today' : 'not set today';
  const oneThingPart = dailyBrief?.one_thing_id ? ', one_thing present' : '';
  parts.push(`Daily Brief: ${briefState}${oneThingPart}`);
  if (skipEvents.length > 0) {
    for (const s of skipEvents) {
      parts.push(`Bulk-skipped ${s.todo_count} todos to ${s.target_date}`);
    }
  } else {
    parts.push('Sweep skips last 7d: (none)');
  }
  parts.push(`Floor suggestions active: ${floorCount}`);

  parts.push('');
  parts.push('=== RECENT MOOD (last 7d, user-logged) ===');
  if (recentMood.length === 0) {
    parts.push('(none logged)');
  } else {
    for (const m of recentMood) {
      const date = m?.date || 'unknown';
      const moods = safeArr(m?.moods);
      parts.push(`- ${date}: ${moods.length > 0 ? moods.join(', ') : 'none'}`);
    }
  }

  parts.push('');
  parts.push('=== ACTIVE COMMITMENTS (habits user formally committed to) ===');
  if (commitments.length === 0) {
    parts.push('(none)');
  } else {
    for (const c of commitments) {
      const name = c?.name || 'Untitled habit';
      const untilPart = c?.until ? `, until ${c.until}` : '';
      parts.push(`- "${name}"${untilPart}`);
    }
  }

  return parts.join('\n');
}

async function fetchUserSnapshot(userId, timezone, windowDays, env, opts = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // --- Date math ---
  const targetDate = opts.targetDate || getUserLocalDate(timezone);
  const target = new Date(startOfDayUtc(targetDate, timezone));
  const targetEndOfDay = new Date(endOfDayUtc(targetDate, timezone));

  const windowStart = new Date(target);
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
  const windowStartStr = formatDateOnly(windowStart);

  const forwardWindow = new Date(target);
  forwardWindow.setUTCDate(forwardWindow.getUTCDate() + 14);
  const forwardWindowStr = formatDateOnly(forwardWindow);

  const yesterday = new Date(target);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = formatDateOnly(yesterday);

  const includeLifeMap = opts.includeLifeMap !== false;
  const includePreviousDco = opts.includePreviousDco !== false;
  const includeWeeklySummaries = opts.includeWeeklySummaries !== false;
  const includeProfile = opts.includeProfile !== false;

  // --- Parallel fetch: all raw data in one batch ---
  const queries = [
    // 0: Todos — within window
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${windowStartStr}&select=id,title,name,status,completed_at,target_date,space_id,created_at,tags,archived,due_day&order=created_at.desc&limit=500`,
      { headers },
    ).then((r) => r.json()),

    // 1: Notes (non-events) — within window
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=neq.event&archived=eq.false&created_at=gte.${windowStartStr}&select=id,title,body,subtype,mood,space_id,created_at,is_goal&order=created_at.desc&limit=500`,
      { headers },
    ).then((r) => r.json()),

    // 2: Calendar events (notes with subtype=event) — window + 14 day forward look
    // Also fetches multi-day events that started before the window but are still active (end_date >= windowStart)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&or=(and(target_date.gte.${windowStartStr},target_date.lte.${forwardWindowStr}),and(target_date.lt.${windowStartStr},end_date.gte.${windowStartStr}))&select=id,title,target_date,end_date,event_time,location,is_all_day,space_id,external_source&order=target_date.asc&limit=500`,
      { headers },
    ).then((r) => r.json()),

    // 3: Habits — all active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,space_id,created_at,subtype,commitment&limit=50`,
      { headers },
    ).then((r) => r.json()),

    // 4: Habit progress — within window
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${windowStartStr}&select=habit_id,occurred_day&limit=2000`,
      { headers },
    ).then((r) => r.json()),

    // 5: Spaces — active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // 6: Space milestones — active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=id,title,name,date,space_id,completed,completed_at&order=date.asc&limit=50`,
      { headers },
    ).then((r) => r.json()),
  ];

  // Conditional queries
  if (includeLifeMap) {
    // 7: Current Life Map
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map,version,rebuilt_at,updated_at`,
        { headers },
      ).then((r) => r.json()),
    );
  }

  if (includePreviousDco) {
    // 8: Previous DCO
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${targetDate}&select=dco,date&order=date.desc&limit=1`,
        { headers },
      ).then((r) => r.json()),
    );
  }

  if (includeWeeklySummaries) {
    // 9: Recent weekly summaries
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&select=week_start_date,content,stats_snapshot,key_themes&order=week_start_date.desc&limit=4`,
        { headers },
      ).then((r) => r.json()),
    );
  }

  if (includeProfile) {
    // 10: User profile
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,signals`,
        { headers },
      ).then((r) => r.json()),
    );
  }

  // 11: Scope chat running summaries (renamed from space_chats in Spaces→Scopes migration)
  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/scope_chats?user_id=eq.${userId}&running_summary=neq.&running_summary=not.is.null&updated_at=gte.${windowStartStr}&select=id,scope_id,title,running_summary,updated_at&order=updated_at.desc&limit=10`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  // 12: Entity chat summaries (entities with chat_summary in views, updated in window)
  queries.push(
    fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_recent_entity_chat_summaries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user_id: userId, p_since: windowStartStr }),
    })
      .then((r) => r.json())
      .catch(() => []),
  );

  // 13: Temporal anchors — active events/deadlines from conversations
  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?user_id=eq.${userId}&status=eq.active&select=*&order=resolved_date.asc.nullslast&limit=20`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  );

  const results = await Promise.all(queries);
  const safeArr = (v) => (Array.isArray(v) ? v : []);

  // Unpack results
  const todosRaw = safeArr(results[0]);
  const dropsRaw = safeArr(results[1]);
  const eventsRaw = safeArr(results[2]);
  const habits = safeArr(results[3]);
  const habitProgressRaw = safeArr(results[4]);
  const spaces = safeArr(results[5]);
  const milestones = safeArr(results[6]);

  let currentLifeMap = null;
  let previousDco = null;
  let weeklySummaries = [];
  let userProfile = null;

  let idx = 7;
  if (includeLifeMap) {
    const rows = safeArr(results[idx]);
    currentLifeMap = rows[0] || null;
    idx++;
  }
  if (includePreviousDco) {
    const rows = safeArr(results[idx]);
    previousDco = rows[0] || null;
    idx++;
  }
  if (includeWeeklySummaries) {
    weeklySummaries = safeArr(results[idx]);
    idx++;
  }
  if (includeProfile) {
    const rows = safeArr(results[idx]);
    userProfile = rows[0] || null;
    idx++;
  }

  // Chat summaries (always fetched)
  const spaceChatSummariesData = results[idx] || [];
  idx++;
  const entityChatSummariesData = results[idx] || [];
  idx++;
  const temporalAnchorsData = safeArr(results[idx]);
  idx++;

  // --- Filter: only data on or before target date ---
  const todos = todosRaw.filter((t) => !t.created_at || new Date(t.created_at) <= targetEndOfDay);
  const drops = dropsRaw.filter((n) => !n.created_at || new Date(n.created_at) <= targetEndOfDay);
  const habitProgress = habitProgressRaw.filter(
    (h) => !h.occurred_day || h.occurred_day <= targetDate,
  );

  // --- Build space lookup ---
  const spaceMap = {};
  for (const s of spaces) {
    spaceMap[s.id] = s.name;
  }

  // --- Deduplicate calendar events ---
  const calendarEvents = snapshotDeduplicateEvents(eventsRaw);

  // Helper: is an event active on a given date? Handles multi-day events.
  function eventActiveOnDate(evt, date) {
    const start = evt.target_date;
    const end = evt.end_date || evt.target_date;
    return start <= date && end >= date;
  }

  // --- Compute all derived metrics ---
  const todoStats = snapshotComputeTodoStats(todos, targetDate);
  const habitHealth = snapshotComputeHabitHealth(habits, habitProgress, windowDays);
  const dropVelocity = snapshotComputeDropVelocity(drops, targetDate);
  const journals = drops.filter((n) => n.subtype === 'journal');
  const moodSignal = snapshotComputeMoodSignal(journals);
  const spaceActivity = snapshotComputeSpaceActivity(drops, todos, spaceMap);

  // --- Calendar projections ---
  const todaysEvents = calendarEvents
    .filter((e) => eventActiveOnDate(e, targetDate))
    .map((e) => ({
      title: e.title,
      time: e.event_time || null,
      location: e.location || null,
      is_all_day: e.is_all_day || null,
      space: spaceMap[e.space_id] || null,
      space_id: e.space_id || null,
      is_synced: !!e.external_source,
    }));

  const sevenAfter = new Date(target);
  sevenAfter.setUTCDate(sevenAfter.getUTCDate() + 7);
  const sevenAfterStr = formatDateOnly(sevenAfter);

  const upcomingEvents = calendarEvents
    .filter((e) => {
      const start = e.target_date;
      const end = e.end_date || e.target_date;
      // Event is upcoming if it starts after today, OR if it's multi-day and extends past today
      return (
        (start > targetDate && start <= sevenAfterStr) ||
        (start <= targetDate && end > targetDate && end <= sevenAfterStr)
      );
    })
    .slice(0, 15)
    .map((e) => ({
      title: e.title,
      date: e.target_date,
      space: spaceMap[e.space_id] || null,
      space_id: e.space_id || null,
      is_synced: !!e.external_source,
    }));

  const fiveBeforeStr = formatDateOnly(new Date(target.getTime() - 5 * 86400000));
  const fiveAfterStr = formatDateOnly(new Date(target.getTime() + 5 * 86400000));

  const spaceKeyDates = calendarEvents
    .filter((e) => {
      if (e.external_source || !e.space_id) return false;
      const end = e.end_date || e.target_date;
      return e.target_date <= fiveAfterStr && end >= fiveBeforeStr;
    })
    .map((e) => ({
      date: e.target_date,
      title: e.title,
      space: spaceMap[e.space_id] || null,
      space_id: e.space_id || null,
    }));

  console.log(
    `[Snapshot] Built for ${userId.slice(0, 8)} (${targetDate}, ${windowDays}d window):`,
    {
      todos: todos.length,
      drops: drops.length,
      events: calendarEvents.length,
      habits: habits.length,
      habitProgress: habitProgress.length,
      spaces: spaces.length,
      milestones: milestones.length,
      hasLifeMap: !!currentLifeMap,
      hasPreviousDco: !!previousDco,
      weeklySummaries: weeklySummaries.length,
    },
  );

  // Phase 1 GATHER: typed today-facts block (additive, shadow)
  let todayFacts = null;
  try {
    const gathered = await gatherTodayFacts(userId, timezone, env);
    const bucketed = bucketTodayFacts(gathered);
    todayFacts = { bucketed, text: renderTodayFactsText(bucketed) };
  } catch (e) {
    console.error('[Gather] failed (non-fatal Phase 1):', e?.message || e);
  }

  return {
    userId,
    targetDate,
    timezone,
    windowDays,

    // Raw data
    raw: {
      todos,
      drops,
      journals,
      calendarEvents,
      habits,
      habitProgress,
      spaces,
      milestones,
      weeklySummaries,
      previousDco,
      currentLifeMap,
      userProfile,
      spaceChatSummaries: Array.isArray(spaceChatSummariesData) ? spaceChatSummariesData : [],
      entityChatSummaries: Array.isArray(entityChatSummariesData) ? entityChatSummariesData : [],
      temporalAnchors: temporalAnchorsData,
    },

    // Computed metrics
    computed: {
      todoStats,
      habitHealth,
      dropVelocity,
      moodSignal,
      spaceActivity,
      spaceMap,
    },

    // Calendar projections
    calendar: {
      todaysEvents,
      upcomingEvents,
      spaceKeyDates,
    },

    today: todayFacts,
  };
}

// ============================================================================
// Snapshot compute helpers
// ============================================================================

/**
 * Check whether an event is active on a given date (YYYY-MM-DD).
 * Handles multi-day events via end_date, falls back to exact target_date match.
 */
function eventActiveOnDate(evt, date) {
  const start = evt.target_date;
  const end = evt.end_date || evt.target_date;
  return start <= date && end >= date;
}

function snapshotDeduplicateEvents(events) {
  const seenExternalIds = new Map();
  const seenKeyDates = new Set();
  const deduped = [];

  for (const evt of events) {
    // Skip cancelled
    if (
      evt.title &&
      (evt.title.toLowerCase().startsWith('canceled:') ||
        evt.title.toLowerCase().startsWith('cancelled:'))
    )
      continue;

    if (evt.external_source && evt.external_source.externalId) {
      const extId = evt.external_source.externalId;
      if (!seenExternalIds.has(extId)) {
        seenExternalIds.set(extId, evt);
        deduped.push(evt);
      }
    } else {
      const key = `${(evt.title || '').trim().toLowerCase()}|${evt.target_date}|${evt.space_id || ''}`;
      if (!seenKeyDates.has(key)) {
        seenKeyDates.add(key);
        deduped.push(evt);
      }
    }
  }

  return deduped;
}

function snapshotComputeTodoStats(todos, targetDate) {
  const overdue = todos.filter(
    (t) => t.target_date && t.target_date < targetDate && t.status !== 'completed' && !t.archived,
  ).length;
  const active = todos.filter((t) => t.status === 'active' && !t.archived).length;
  const completedRecently = todos.filter((t) => t.completed_at).length;

  return { overdue, active, completedRecently };
}

function snapshotComputeHabitHealth(habits, habitProgress, windowDays) {
  const completionMap = {};
  for (const hp of habitProgress) {
    completionMap[hp.habit_id] = (completionMap[hp.habit_id] || 0) + 1;
  }

  return habits.map((h) => {
    const done = completionMap[h.id] || 0;
    const expected = getExpectedCompletionsForDays(h.frequency, windowDays);
    const score = expected > 0 ? Math.round((done / expected) * 100) : 0;
    return {
      id: h.id,
      name: h.name,
      frequency: h.frequency,
      space_id: h.space_id || null,
      completions: done,
      expected,
      score_pct: score,
    };
  });
}

function snapshotComputeDropVelocity(drops, targetDate) {
  const target = new Date(targetDate + 'T00:00:00Z');

  const threeBefore = new Date(target);
  threeBefore.setUTCDate(threeBefore.getUTCDate() - 3);
  const threeBeforeStr = formatDateOnly(threeBefore);

  const sixBefore = new Date(target);
  sixBefore.setUTCDate(sixBefore.getUTCDate() - 6);
  const sixBeforeStr = formatDateOnly(sixBefore);

  const dropsLast3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= threeBeforeStr && d <= targetDate;
  }).length;

  const dropsPrev3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= sixBeforeStr && d < threeBeforeStr;
  }).length;

  let velocity = 'steady';
  if (dropsLast3 > dropsPrev3 * 1.5) velocity = 'increasing';
  else if (dropsLast3 < dropsPrev3 * 0.5) velocity = 'decreasing';

  return { velocity, dropsLast3, dropsPrev3 };
}

function snapshotComputeMoodSignal(journals) {
  const moodCounts = {};
  let totalMoodTags = 0;

  for (const j of journals) {
    if (j.mood && Array.isArray(j.mood)) {
      for (const m of j.mood) {
        moodCounts[m] = (moodCounts[m] || 0) + 1;
        totalMoodTags++;
      }
    }
  }

  const topMoods =
    totalMoodTags > 0
      ? Object.entries(moodCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([mood, count]) => ({ mood, count, pct: Math.round((count / totalMoodTags) * 100) }))
      : [];

  return {
    topMoods,
    allTags: moodCounts,
    totalTags: totalMoodTags,
    journalCount: journals.length,
  };
}

function snapshotComputeSpaceActivity(drops, todos, spaceMap) {
  const activity = {};

  for (const spaceId of Object.keys(spaceMap)) {
    const dropCount = drops.filter((n) => n.space_id === spaceId).length;
    const todoCount = todos.filter((t) => t.space_id === spaceId && !t.archived).length;
    activity[spaceId] = {
      name: spaceMap[spaceId],
      recentDrops: dropCount,
      recentTodos: todoCount,
      totalRecent: dropCount + todoCount,
    };
  }

  return activity;
}

/**
 * Build a full-granularity weekly snapshot for Life Map rebuild and weekly summary.
 * @param {object} snapshot - from fetchUserSnapshot(userId, tz, 21)
 * @returns {object} Full weekly projection
 */
function buildWeeklySnapshot(snapshot) {
  const { raw, computed, calendar } = snapshot;

  // Group drops by day for pattern analysis
  const dropsByDay = {};
  for (const d of raw.drops) {
    const day = d.created_at ? d.created_at.split('T')[0] : 'unknown';
    if (!dropsByDay[day]) dropsByDay[day] = [];
    dropsByDay[day].push({
      title: d.title,
      subtype: d.subtype,
      mood: d.mood || [],
      space: computed.spaceMap[d.space_id] || null,
      space_id: d.space_id || null,
      body: d.subtype === 'journal' && d.body ? d.body.slice(0, 300) : null,
    });
  }

  // Todos with full detail
  const todosDetail = raw.todos.map((t) => ({
    id: t.id,
    title: t.title || t.name,
    status: t.status,
    completed_at: t.completed_at ? t.completed_at.split('T')[0] : null,
    created_at: t.created_at ? t.created_at.split('T')[0] : null,
    space: computed.spaceMap[t.space_id] || null,
    space_id: t.space_id || null,
    archived: t.archived,
    target_date: t.target_date,
  }));

  // Habit progress by week
  const habitProgressByWeek = {};
  for (const hp of raw.habitProgress) {
    const d = new Date(hp.occurred_day + 'T00:00:00Z');
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const wk = formatDateOnly(weekStart);
    const key = `${hp.habit_id}|${wk}`;
    habitProgressByWeek[key] = (habitProgressByWeek[key] || 0) + 1;
  }

  // Milestones with status
  const milestonesDetail = raw.milestones.map((m) => ({
    title: m.title || m.name,
    date: m.date,
    space: computed.spaceMap[m.space_id] || null,
    space_id: m.space_id || null,
    completed: m.completed,
    daysFromTarget: m.date
      ? Math.ceil(
          (new Date(m.date + 'T00:00:00Z') - new Date(snapshot.targetDate + 'T00:00:00Z')) /
            86400000,
        )
      : null,
  }));

  return {
    targetDate: snapshot.targetDate,
    timezone: snapshot.timezone,
    windowDays: snapshot.windowDays,

    // Full data
    dropsByDay,
    todosDetail,
    journals: raw.journals.map((j) => ({
      id: j.id,
      title: j.title,
      body: j.body ? j.body.slice(0, 500) : null,
      mood: j.mood || [],
      space: computed.spaceMap[j.space_id] || null,
      space_id: j.space_id || null,
      date: j.created_at ? j.created_at.split('T')[0] : null,
    })),
    calendarEvents: calendar.todaysEvents.concat(calendar.upcomingEvents),
    allCalendarEvents: raw.calendarEvents.map((e) => ({
      title: e.title,
      date: e.target_date,
      space: computed.spaceMap[e.space_id] || null,
      is_synced: !!e.external_source,
    })),

    // Habits full detail
    habits: computed.habitHealth,
    habitProgressByWeek,
    rawHabitProgress: raw.habitProgress || [],

    // Milestones
    milestones: milestonesDetail,

    // Computed
    todoStats: computed.todoStats,
    dropVelocity: computed.dropVelocity,
    moodSignal: computed.moodSignal,
    spaceActivity: computed.spaceActivity,

    // Context
    spaces: raw.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      activity: computed.spaceActivity[s.id] || { recentDrops: 0, recentTodos: 0, totalRecent: 0 },
    })),
    weeklySummaries: raw.weeklySummaries,
    userProfile: raw.userProfile?.profile_text || null,
    currentLifeMap: raw.currentLifeMap?.life_map || null,

    // Chat summaries
    chatSummaries: [
      ...(raw.spaceChatSummaries || []).map((chat) => ({
        source: 'space_chat',
        space_id: chat.space_id,
        title: chat.title,
        summary: (chat.running_summary || '').slice(0, 500),
        date: chat.updated_at ? chat.updated_at.split('T')[0] : null,
      })),
      ...(raw.entityChatSummaries || []).map((entity) => ({
        source: 'entity_chat',
        space_id: entity.space_id,
        entity_type: entity.entity_type,
        title: entity.entity_title,
        summary: (entity.chat_summary || '').slice(0, 400),
        date: entity.chat_summary_at ? entity.chat_summary_at.split('T')[0] : null,
      })),
    ],
  };
}

// ============================================================================
// Phase 4a: Calendar cleaning for analyst
// ============================================================================

function cleanCalendarForAnalyst(calendarEvents, targetDate) {
  if (!calendarEvents || calendarEvents.length === 0) return [];

  const cleaned = [];
  const titleOccurrences = {};

  for (const evt of calendarEvents) {
    if (!evt.title) continue;
    const key = evt.title.trim().toLowerCase();
    if (!titleOccurrences[key]) {
      titleOccurrences[key] = { events: [], title: evt.title };
    }
    titleOccurrences[key].events.push(evt);
  }

  for (const [key, group] of Object.entries(titleOccurrences)) {
    const events = group.events;

    if (events.length === 1) {
      const evt = events[0];
      const entry = {
        title: evt.title,
        date: evt.target_date || evt.date,
        end_date: evt.end_date || null,
        space: evt.space || null,
        is_synced: !!evt.external_source || evt.is_synced || false,
        is_recurring: false,
        occurrence_count: 1,
      };
      if (entry.end_date && entry.end_date !== entry.date) {
        entry.date_range = `${entry.date} to ${entry.end_date}`;
      }
      cleaned.push(entry);
    } else {
      const dates = events
        .map((e) => e.target_date || e.date)
        .filter(Boolean)
        .sort();
      const weekdays = dates.map((d) => new Date(d + 'T00:00:00Z').getUTCDay());
      const uniqueWeekdays = [...new Set(weekdays)];
      const isRecurring = events.length >= 2 && uniqueWeekdays.length <= 2;

      if (isRecurring) {
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        const recurringDays = uniqueWeekdays.map((d) => dayNames[d]).join(' & ');
        cleaned.push({
          title: events[0].title,
          date: dates[0],
          space: events[0].space || null,
          is_synced: true,
          is_recurring: true,
          occurrence_count: events.length,
          recurring_pattern: `Recurring ${recurringDays} (${events.length} occurrences in window)`,
        });
      } else {
        const seenDates = new Set();
        for (const evt of events) {
          const d = evt.target_date || evt.date;
          if (d && !seenDates.has(d)) {
            seenDates.add(d);
            cleaned.push({
              title: evt.title,
              date: d,
              end_date: evt.end_date || null,
              space: evt.space || null,
              is_synced: !!evt.external_source || evt.is_synced || false,
              is_recurring: false,
              occurrence_count: 1,
            });
          }
        }
      }
    }
  }

  cleaned.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return cleaned;
}

function formatLifeMapForAnalyst(lifeMap) {
  if (!lifeMap?.domains) return 'No Life Map available.';

  const lines = [];
  for (const domain of lifeMap.domains) {
    const activeThreads = (domain.threads || []).filter((thread) => {
      if (thread.lifecycle !== 'concluded') return true;
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(thread.last_activity + 'T00:00:00Z').getTime()) / 86400000,
      );
      return daysSinceActivity <= 14;
    });
    if (activeThreads.length === 0) continue;
    lines.push(`\nDOMAIN: "${domain.name}" [${domain.source}]`);
    for (const thread of activeThreads) {
      const firstSentence = thread.summary ? thread.summary.split(/\.\s/)[0] + '.' : 'No summary.';
      lines.push(
        `  THREAD: "${thread.name}" | ${thread.status} | ${thread.momentum} | ${thread.importance} | ${thread.lifecycle}`,
      );
      lines.push(`    ${firstSentence}`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {{ outputAgnostic?: boolean }} [opts]
 */
async function runUnifiedAnalyst(weeklySnapshot, lifeMap, weekStart, weekEnd, env, opts = {}) {
  const t0 = Date.now();

  const lifeMapRef = formatLifeMapForAnalyst(lifeMap);
  const cleanedEvents = cleanCalendarForAnalyst(
    weeklySnapshot.allCalendarEvents || [],
    weeklySnapshot.targetDate,
  );

  // Build day-by-day habit progress from raw data
  const habitDayDetail = {};
  const habitNameMap = {};
  for (const h of weeklySnapshot.habits || []) {
    habitNameMap[h.id] = h.name;
  }
  const rawHabitProgress = weeklySnapshot.habitProgressByWeek
    ? Object.entries(weeklySnapshot.habitProgressByWeek)
    : [];

  const outputAgnostic = opts.outputAgnostic !== false;
  const systemPrompt = outputAgnostic
    ? buildOutputAgnosticAnalystPrompt(weekStart, weekEnd)
    : `You are a meticulous analyst for a personal productivity app called Gremly. You receive 21 days of raw user data plus a reference to their existing Life Map (a structured understanding of their life domains and threads).

Your job: Deeply analyze the week of ${weekStart} to ${weekEnd}. Organize EVERYTHING into a structured extraction that serves two downstream consumers — a Life Map rebuild AI and a weekly summary storyteller AI. Both need maximum detail organized clearly.

CRITICAL: Preserve specifics. Include journal quotes, todo titles, event names, habit day-by-day data. Your output is the PRIMARY source both downstream AIs read. If you summarize away a detail, it's lost. When in doubt, include it.

IDENTITY & PRONOUNS: If a USER PROFILE is provided in the data, note the person's stated gender and pronouns in your theme labels and narrative descriptions. Never assume.

ANALYSIS WINDOW: ${weekStart} to ${weekEnd}
Data outside this range is CONTEXT (prior weeks for trends). Do not conflate past and future.

EXISTING LIFE MAP — organize your theme-level findings against these threads:
${lifeMapRef}

OUTPUT FORMAT — respond with each section wrapped in XML tags. Inside each tag, output valid JSON for that section. This allows each section to be parsed independently.

<themes>
[
  ... themes array ...
]
</themes>

<week_timeline>
{
  ... week_timeline object ...
}
</week_timeline>

<event_analysis>
{
  ... event_analysis object ...
}
</event_analysis>

<behavioral_fingerprints>
[
  ... behavioral_fingerprints array ...
]
</behavioral_fingerprints>

<cross_references>
[
  ... cross_references array ...
]
</cross_references>

<magic_moment_candidates>
[
  ... magic_moment_candidates array ...
]
</magic_moment_candidates>

<stale_items>
[
  ... stale_items array ...
]
</stale_items>

<engagement_metrics>
{
  ... engagement_metrics object ...
}
</engagement_metrics>

<new_theme_candidates>
[
  ... new_theme_candidates array ...
]
</new_theme_candidates>

<week_shape>
{
  ... week_shape object ...
}
</week_shape>

Here are the schemas for each section:

<themes>
[
  {
    "life_map_thread": "exact thread name from Life Map, or null if new",
    "life_map_domain": "exact domain name from Life Map, or null if new",
    "label": "use thread name if mapped, descriptive label if new",
    "this_week": {
      "activity_count": 0,
      "notable_items": ["specific items with dates — journal titles, todo names, event names. Include ALL relevant items, not just top 3"],
      "journal_refs": ["YYYY-MM-DD — dates of journal entries relevant to this thread. Just the dates, no quote text. Code will join the full text from the source data."],
      "completed_todo_refs": ["todo title only — code will join dates and IDs from source data"],
      "active_todo_refs": ["todo title only — code will join details from source data"],
      "habit_data": "habit name: X/Y completions this week, completed on [specific days] — or null if no habit for this thread",
      "events": ["YYYY-MM-DD: event title — brief note on significance"],
      "day_pattern": "which specific days had activity and what kind"
    },
    "trajectory": "building | consistent | declining | milestone_approaching | stalled | concluded | reactivated",
    "trajectory_reasoning": "one sentence explaining why, referencing specific data from this week AND trend from prior weeks",
    "emotional_signal": "mood tags and journal sentiment connected to this theme — quote the user's words. Or null if no emotional data",
    "evidence_refs": ["type:specific item — e.g. habit:Habit Name X/Y, journal:YYYY-MM-DD 'quote text', todo:Todo Title completed"],
    "lifecycle_signal": "active | approaching_dormant | concluded | reactivated | null",
    "lifecycle_reasoning": "max 10 words — why this lifecycle state",
    "importance": "high | medium | low",
    "narrative_interest": 0,
    "narrative_interest_reasoning": "one sentence — why this score"
  }
]
</themes>

<week_timeline>
{
  "narrative": "3-5 sentence chronological reconstruction of what happened this week, day by day. Focus on the STORY. Reference specific events, completions, and journal entries by name.",
  "significant_days": [
    {
      "date": "YYYY-MM-DD",
      "day_name": "Monday|Tuesday|...",
      "what_happened": "DETAILED — list every notable event, completion, journal entry, habit completion that day. Do not summarize.",
      "significance": "routine | notable | significant | milestone",
      "thread_connections": ["which Life Map threads were active this day"]
    }
  ]
}
</week_timeline>

<event_analysis>
{
  "this_week_events": [
    {
      "title": "event title",
      "date": "YYYY-MM-DD",
      "importance": 1,
      "importance_reason": "one sentence — why this score",
      "category": "travel | work_meeting | personal | social | health | deadline | milestone | admin | recurring",
      "is_recurring": false,
      "space": "space name or null",
      "thread_connection": "Life Map thread name or null",
      "connected_journal": "journal excerpt if a journal entry matches this event by date/topic, or null",
      "connected_todos": ["titles of completed todos related to this event"]
    }
  ],
  "next_week_events": [
    {
      "title": "event title",
      "date": "YYYY-MM-DD",
      "importance": 1,
      "importance_reason": "one sentence",
      "category": "string",
      "is_recurring": false,
      "thread_connection": "Life Map thread name or null",
      "thread_from_this_week": "how this connects to something that happened this week, or null",
      "prep_suggestion": "practical prep the user might want, or null"
    }
  ]
}
</event_analysis>

<behavioral_fingerprints>
[
  {
    "pattern": "short label — e.g. weekend_sprinter, stress_skips_exercise, deadline_procrastinator",
    "evidence": "specific data — e.g. '11 of 15 completions landed Thu-Sun'",
    "is_novel": false,
    "narrative_interest": 0,
    "threads_involved": ["thread names this pattern spans"],
    "is_discovery_candidate": false
  }
]
</behavioral_fingerprints>

<cross_references>
[
  {
    "connection": "how two or more threads interacted this week",
    "threads": ["thread name 1", "thread name 2"],
    "items": ["specific item titles showing the connection"],
    "significance": "why this connection matters for the user's story",
    "narrative_interest": 0
  }
]
</cross_references>

<magic_moment_candidates>
[
  {
    "title": "short evocative title",
    "date": "YYYY-MM-DD",
    "why": "why this moment stands out — be specific",
    "connected_items": ["related item titles"],
    "enrichment_hint": "what real-world knowledge would make this richer — e.g. 'seasonal weather context', 'local cultural significance', 'historical context of a landmark'",
    "journal_quote": "the user's own words about this moment if available, or null"
  }
]
</magic_moment_candidates>

<stale_items>
[
  {
    "title": "item title",
    "days_stale": 0,
    "domain_hint": "which Life Map domain this likely belongs to",
    "severity": "low | medium | high"
  }
]
</stale_items>

<engagement_metrics>
{
  "drops_this_week": 0,
  "completions_this_week": 0,
  "habit_overall_rate": "X% — across all habits",
  "active_todos": 0,
  "stale_todos_over_14d": 0,
  "journals_written": 0
}
</engagement_metrics>

<new_theme_candidates>
[
  {
    "label": "descriptive name for the pattern",
    "unmatched_items": ["specific titles/dates that don't fit existing threads"],
    "evidence_count": 0,
    "date_span": ["earliest date", "latest date"],
    "suggested_domain": "existing domain name this might belong to, or null for genuinely new",
    "reasoning": "why this is distinct from existing threads"
  }
]
</new_theme_candidates>

<week_shape>
{
  "classification": "2-4 word week type — e.g. 'launch sprint', 'recovery week', 'travel immersion', 'deadline crunch'",
  "dominant_theme": "the single thread/domain that dominated this week",
  "mood_arc": "how emotional tone shifted across the week — reference specific journal entries by date",
  "highlight": "single most notable moment with date and brief description",
  "concern": "single most notable concern or risk, or null"
}
</week_shape>

ANALYSIS RULES:

THEME MAPPING:
- Map every data point (journal, todo, habit, event, drop) to an existing Life Map thread where it naturally fits.
- One data point can appear in multiple themes if it genuinely connects to multiple threads.
- If a data point doesn't naturally fit ANY existing thread, do NOT force it — put it in new_theme_candidates.
- Include a theme entry for every Life Map thread that had ANY activity this week, even minimal.

EMERGING THEME DETECTION:
When you see signals scattered across multiple existing themes that share a common underlying concern, flag them as a new_theme_candidate even if each signal individually maps to an existing thread. Look for recurring topics that appear in journals, todos, chats, or drops across 2+ weeks and 2+ existing threads but have no dedicated thread of their own. These scattered signals often represent an emerging life priority the user hasn't consciously organized yet.
- For threads with ZERO activity this week, only include them if the absence is notable (e.g. a daily habit with no completions).

BUNDLED HABIT THEMES:
When a single theme contains multiple habits and their trajectories diverge (one hitting target, one not), you MUST note BOTH signals separately in the trajectory_reasoning. Do not let a declining habit drag down the trajectory label of a theme where another habit is succeeding. If the theme overall is "declining" because one habit dominates, add a field:
      "individual_habit_wins": ["Habit Name: X/Y this week — hit target"]
This ensures individual wins are visible even in a declining theme. Only include habits that met or exceeded their weekly target.

EVENT SCORING:
- HIGH (7-10): Travel (flights, trips, arrivals), personal milestones, PTO/vacation, one-off significant social events, health appointments, multi-day events.
- MEDIUM (4-6): One-off work meetings, deadlines, project milestones, personal errands.
- LOW (1-3): Recurring meetings (daily standups, weekly syncs, bi-weekly 1:1s, all-hands, internal huddles), admin tasks (timesheets). These are routine noise.
- Events with a non-work space (Vacation, Health, etc.) score higher.
- Events tied to a Life Map thread with high importance score higher.

DATE ACCURACY:
- NEVER infer specific dates for events the user hasn't explicitly dated. If the user says "in a couple weeks" or "soon" or "upcoming," report it as "upcoming, date not specified" — do not assign a day.
- For the week_ahead and event_analysis next_week_events, ONLY include events that have a specific date from the calendar data or were explicitly dated by the user in a journal, chat, or todo. Vague references to future events should appear in thread context, not as dated events.
- If a chat or journal mentions a future event without a date, note it in the relevant theme's notable_items as "upcoming, undated" — never assign it to a specific day of the week.

RECURRING MEETING DETECTION:
- Meetings that appear on the same weekday every week are ALWAYS 1-3.
- For recurring events in the cleaned calendar data, do not list each occurrence in event_analysis — list one entry with the recurring pattern noted.

BEHAVIORAL FINGERPRINTS:
- Look for patterns across entity types: completion day-of-week clustering, mood vs productivity correlation, habit completion timing.
- Only flag patterns with clear evidence from THIS week's data.
- When a behavioral fingerprint spans 3 or more threads, set is_discovery_candidate to true. Multi-thread patterns (e.g. maintaining discipline across several life areas during a challenging period) are strong candidates for the weekly summary's discovery card because they reveal something the user couldn't see from any single thread alone.

NARRATIVE INTEREST SCORING (1-10):
Apply this score to every theme, behavioral fingerprint, and cross-reference. This measures how SURPRISING, EMOTIONALLY RESONANT, or NOVEL something would be for the user to read about in their weekly summary. It is separate from importance.

Scoring criteria:
- 9-10: Life transitions, first-time behaviors, major spontaneous decisions, relationship milestones, emergence of entirely new life threads, profound emotional shifts captured in the user's own words
- 7-8: Multi-thread patterns showing discipline or growth across different life areas, contradictions between intention and behavior, the user noticing something about themselves for the first time (evidenced by journal reflection), achieving goals while in challenging circumstances
- 5-6: Consistent progress on established habits, expected milestones approaching on schedule, steady-state thread activity with some emotional signal
- 3-4: Routine habit completions or misses with no emotional context, incremental progress, administrative activity
- 1-2: Pure data points with no story — a number went up or down with no surrounding context

Key principle: a clean stat (habit went from 0 to 4 completions) scores LOWER than a messy human story (user spontaneously changed travel plans, or started researching something that signals a new life chapter). Numbers are easy to report but hard to feel. Stories are what make people stop scrolling.

MAGIC MOMENTS:
- Only genuinely interesting moments (importance 7+). 0-4 candidates. Never force them.
- Include the user's journal quote about the moment if one exists.
- The enrichment_hint tells the downstream storyteller what real-world knowledge to apply.

WEEK TIMELINE:
- Reconstruct the week chronologically. The storyteller needs to understand what happened WHEN.
- Include EVERY significant day. A day with 3+ events or a journal entry is always significant.
- The what_happened field should list specifics, not summarize.

STALE ITEMS:
- Only flag todos marked [STALE] in the data.
- Severity: high = important domain + 30+ days, medium = 14-30 days, low = minor items.

CROSS-WEEK PATTERN DETECTION:
Prior weekly summaries are provided under "PRIOR WEEKLY SUMMARIES." Use them to:
- Identify threads that appeared in previous weeks and track whether they're progressing, regressing, or cycling.
- Flag when a theme has appeared for 3+ consecutive weeks — this is an arc, not an observation.
- Note when a discovery from a prior week predicted this week's behavior (or the opposite happened).
- If a habit was flagged as struggling last week and is still struggling, escalate the narrative_interest score by +2.
- If a thread has reversed direction from the prior week (up → down or down → up), flag this explicitly in trajectory_reasoning.
- When scoring narrative_interest, BOOST scores by +2 for patterns that span 2+ weeks and by +3 for patterns spanning 3+ weeks. Multi-week arcs are inherently more interesting than single-week observations.`;

  const dataLines = [];

  dataLines.push('=== CALENDAR EVENTS (cleaned — recurring collapsed, multi-day annotated) ===');
  if (cleanedEvents.length === 0) {
    dataLines.push('  No events in window.');
  }
  for (const evt of cleanedEvents) {
    const range = evt.date_range ? ` [${evt.date_range}]` : '';
    const space = evt.space ? ` (${evt.space})` : '';
    const recurring = evt.is_recurring ? ` — ${evt.recurring_pattern}` : '';
    dataLines.push(`  ${evt.date}: ${evt.title}${range}${space}${recurring}`);
  }

  dataLines.push('\n=== JOURNALS (with body text) ===');
  const journals = weeklySnapshot.journals || [];
  if (journals.length === 0) {
    dataLines.push('  No journals this window.');
  }
  for (const j of journals) {
    const mood = j.mood?.length > 0 ? ` [mood: ${j.mood.join(', ')}]` : '';
    const space = j.space ? ` (${j.space})` : '';
    const body = j.body ? `\n    "${j.body.slice(0, 600)}"` : '';
    dataLines.push(`  ${j.date}: ${j.title}${mood}${space}${body}`);
  }

  dataLines.push('\n=== DROPS BY DAY (non-journal — notes, ideas, captures) ===');
  let hasDrops = false;
  for (const [day, drops] of Object.entries(weeklySnapshot.dropsByDay || {})) {
    const nonJournal = drops.filter((d) => d.subtype !== 'journal');
    if (nonJournal.length > 0) {
      hasDrops = true;
      dataLines.push(`  ${day}:`);
      for (const d of nonJournal) {
        const space = d.space ? ` (${d.space})` : '';
        dataLines.push(`    [${d.subtype || 'note'}] ${d.title}${space}`);
      }
    }
  }
  if (!hasDrops) {
    dataLines.push('  No non-journal drops in window.');
  }

  dataLines.push('\n=== TODOS ===');
  const completed = (weeklySnapshot.todosDetail || []).filter((t) => t.completed_at);
  const active = (weeklySnapshot.todosDetail || []).filter(
    (t) => t.status === 'active' && !t.archived,
  );
  if (completed.length > 0) {
    dataLines.push(`  Completed (${completed.length}):`);
    for (const t of completed) {
      const space = t.space ? ` (${t.space})` : '';
      dataLines.push(`    ${t.completed_at}: ${t.title}${space}`);
    }
  } else {
    dataLines.push('  Completed: none');
  }
  if (active.length > 0) {
    dataLines.push(`  Active (${active.length}):`);
    for (const t of active.slice(0, 40)) {
      const space = t.space ? ` (${t.space})` : '';
      const targetDate = weeklySnapshot.targetDate || new Date().toISOString().split('T')[0]; // eslint-disable-line no-restricted-syntax -- UTC fallback only
      const daysSinceCreation = t.created_at
        ? Math.floor(
            (new Date(targetDate + 'T00:00:00Z') - new Date(t.created_at + 'T00:00:00Z')) /
              86400000,
          )
        : null;
      const stale =
        daysSinceCreation !== null && daysSinceCreation > 14
          ? ` [STALE ${daysSinceCreation}d]`
          : '';
      dataLines.push(`    ${t.title}${space}${stale} (created ${t.created_at})`);
    }
  } else {
    dataLines.push('  Active: none');
  }

  dataLines.push('\n=== HABITS (with completion rates and day-by-day detail) ===');
  if ((weeklySnapshot.habits || []).length === 0) {
    dataLines.push('  No active habits.');
  }

  // Build a map of habit_id -> [occurred_day, occurred_day, ...]
  const habitDayMap = {};
  const rawHabitProgressEntries = weeklySnapshot.rawHabitProgress || [];
  for (const hp of rawHabitProgressEntries) {
    if (!habitDayMap[hp.habit_id]) habitDayMap[hp.habit_id] = [];
    habitDayMap[hp.habit_id].push(hp.occurred_day);
  }

  for (const h of weeklySnapshot.habits || []) {
    dataLines.push(
      `  ${h.name}: ${h.completions}/${h.expected} (${h.score_pct}%) — frequency: ${h.frequency}`,
    );
    // Add day-by-day completions
    const days = (habitDayMap[h.id] || []).sort();
    if (days.length > 0) {
      // Split into this week vs other weeks
      const thisWeek = days.filter((d) => d >= weekStart && d <= weekEnd);
      const otherWeeks = days.filter((d) => d < weekStart || d > weekEnd);
      dataLines.push(
        `    THIS WEEK (${weekStart} to ${weekEnd}): ${thisWeek.length > 0 ? thisWeek.join(', ') : 'none'}`,
      );
      if (otherWeeks.length > 0) {
        dataLines.push(`    Prior weeks: ${otherWeeks.join(', ')}`);
      }
    } else {
      dataLines.push(`    No completions logged in 21-day window.`);
    }
  }

  if (weeklySnapshot.ledger) {
    // Context pipeline: the fact ledger already accounts for milestones, with
    // what happened to each one. Raw milestone dates are not shown.
    dataLines.push(
      '\n=== WHAT GREMLY KNOWS (fact ledger with states; the source for plans, dates and outcomes) ===',
    );
    dataLines.push(weeklySnapshot.ledger);
  } else {
    dataLines.push('\n=== MILESTONES ===');
  }
  if (!weeklySnapshot.ledger && (weeklySnapshot.milestones || []).length === 0) {
    dataLines.push('  No active milestones.');
  }
  for (const m of weeklySnapshot.ledger ? [] : weeklySnapshot.milestones || []) {
    const status = m.completed ? ' [COMPLETED]' : '';
    const days =
      m.daysFromTarget !== null
        ? ` (${m.daysFromTarget > 0 ? m.daysFromTarget + ' days away' : m.daysFromTarget === 0 ? 'TODAY' : Math.abs(m.daysFromTarget) + ' days ago'})`
        : '';
    const space = m.space ? ` [${m.space}]` : '';
    dataLines.push(`  ${m.title}: ${m.date || 'no date'}${days}${space}${status}`);
  }

  dataLines.push('\n=== MOOD SUMMARY ===');
  if (weeklySnapshot.moodSignal?.topMoods?.length > 0) {
    const moodStr = weeklySnapshot.moodSignal.topMoods
      .map((m) => `${m.mood}: ${m.count} (${m.pct}%)`)
      .join(', ');
    dataLines.push(`  ${moodStr} — from ${weeklySnapshot.moodSignal.journalCount} journal(s)`);
  } else {
    dataLines.push('  No mood data.');
  }

  // Count drops and journals for the full week window
  const weekDropsCount = Object.entries(weeklySnapshot.dropsByDay || {}).reduce(
    (sum, [day, drops]) => {
      if (day >= weekStart && day <= weekEnd) return sum + drops.length;
      return sum;
    },
    0,
  );
  const weekJournalsCount = (weeklySnapshot.journals || []).filter(
    (j) => j.date >= weekStart && j.date <= weekEnd,
  ).length;
  const weekCompletions = (weeklySnapshot.todosDetail || []).filter(
    (t) => t.completed_at && t.completed_at >= weekStart && t.completed_at <= weekEnd,
  ).length;

  dataLines.push('\n=== ENGAGEMENT STATS ===');
  dataLines.push(`  Total drops this week: ${weekDropsCount}`);
  dataLines.push(`  Journals written this week: ${weekJournalsCount}`);
  dataLines.push(`  Todos completed this week: ${weekCompletions}`);
  dataLines.push(
    `  Todos: ${weeklySnapshot.todoStats.overdue} overdue, ${weeklySnapshot.todoStats.active} active`,
  );
  dataLines.push(
    `  Drop velocity: ${weeklySnapshot.dropVelocity.velocity} (${weeklySnapshot.dropVelocity.dropsLast3} last 3d, ${weeklySnapshot.dropVelocity.dropsPrev3} prev 3d)`,
  );

  dataLines.push('\n=== SPACES (with recent activity) ===');
  for (const s of weeklySnapshot.spaces || []) {
    const a = s.activity || {};
    if (a.totalRecent > 0) {
      dataLines.push(
        `  ${s.name}: ${a.recentDrops} drops, ${a.recentTodos} todos (${a.totalRecent} total recent)`,
      );
    } else {
      dataLines.push(`  ${s.name}: no recent activity`);
    }
  }

  if (weeklySnapshot.userProfile) {
    dataLines.push('\n=== USER PROFILE ===');
    dataLines.push(`  ${weeklySnapshot.userProfile}`);
  }

  if (weeklySnapshot.weeklySummaries?.length > 0) {
    dataLines.push(
      '\n=== PRIOR WEEKLY SUMMARIES (trend context — these are PAST weeks, not this week) ===',
    );
    for (const ws of weeklySnapshot.weeklySummaries.slice(0, 3)) {
      const content = ws.content || ws;
      const meta = content.metadata || {};
      const opening = (content.cards || []).find((c) => c.type === 'opening');
      const gremlyMood = (content.cards || []).find((c) => c.type === 'gremly_mood');
      const threadCard = (content.cards || []).find((c) => c.type === 'thread_movements');
      const discoveries = (content.cards || []).find((c) => c.type === 'discoveries');

      dataLines.push(
        `  ${ws.week_start_date}: [${meta.week_type || 'N/A'}] mood: ${meta.mood || 'N/A'}`,
      );
      dataLines.push(`    Hook: "${gremlyMood?.hook || 'N/A'}"`);
      dataLines.push(`    Headline: "${opening?.headline || 'N/A'}"`);
      dataLines.push(`    Key themes: ${(meta.key_themes || ws.key_themes || []).join(', ')}`);
      if (discoveries?.spotlight?.title) {
        dataLines.push(
          `    Discovery: "${discoveries.spotlight.title}" — ${discoveries.spotlight.takeaway || ''}`,
        );
      }
      if (threadCard?.threads) {
        const highlights = threadCard.threads
          .filter((t) => t.is_highlight)
          .map((t) => `${t.name} (${t.direction}: ${t.shift_label})`)
          .join('; ');
        if (highlights) dataLines.push(`    Highlighted threads: ${highlights}`);
      }
    }
  }

  if (weeklySnapshot.chatSummaries?.length > 0) {
    dataLines.push(
      '\n=== CHAT CONVERSATIONS (summaries of user-Gremly discussions this period) ===',
    );
    dataLines.push(
      'These capture decisions, emotional processing, and context from conversations. Cross-reference with habits, journals, and todos for deeper patterns.',
    );
    for (const chat of weeklySnapshot.chatSummaries) {
      const spaceName =
        (weeklySnapshot.spaces || []).find((s) => s.id === chat.space_id)?.name || 'General';
      const safeSummary = (chat.summary || '')
        // eslint-disable-next-line no-control-regex -- intentional control char sanitisation
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/"/g, "'")
        .trim();
      if (safeSummary) {
        const typeLabel =
          chat.source === 'entity_chat'
            ? `Entity: ${chat.entity_type} "${chat.title || 'Untitled'}"`
            : `Space: ${spaceName}`;
        dataLines.push(`[${typeLabel}] ${chat.date || 'recent'}: ${safeSummary}`);
      }
    }
  }

  const dataPayload = dataLines.join('\n');

  // Use streaming to avoid Cloudflare 60s subrequest timeout
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20000,
      stream: true,
      // The analyst prompt is the same for everyone in a given week, so it is
      // cached for the Sunday runs (Haiku caches prompts of 4,096 tokens or more).
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Analyze this user's data for the week of ${weekStart} to ${weekEnd}. Produce the comprehensive unified analysis. Preserve all specifics — event names, habit details, dates, and evidence references. For journal quotes and todo items, output ONLY date references or titles — do not include full quote text. The full text will be joined from source data by code.\n\n${dataPayload}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Unified analyst (Haiku) error: ${response.status} — ${errText.slice(0, 300)}`);
  }

  // Read SSE stream and collect text chunks (with partial line buffering)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';

  // eslint-disable-next-line no-constant-condition -- SSE stream reader
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last element — it may be an incomplete line
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
        } else if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        } else if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch (e) {
        // Skip unparseable lines
      }
    }
  }

  if (!fullText) throw new Error('Unified analyst returned empty response');

  const usage = { input_tokens: inputTokens, output_tokens: outputTokens };

  const cleanedText = fullText.replace(/```json\n?|```\n?/g, '').trim();

  function extractSection(text, tag) {
    const regex = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
    const match = text.match(regex);
    if (!match) return null;
    const content = match[1].trim();
    try {
      return JSON.parse(content);
    } catch (e) {
      try {
        return JSON.parse(jsonrepair(content));
      } catch (e2) {
        console.warn(`[UnifiedAnalyst] Failed to parse section <${tag}>: ${e2.message}`);
        return null;
      }
    }
  }

  const sections = {
    themes: extractSection(cleanedText, 'themes'),
    week_timeline: extractSection(cleanedText, 'week_timeline'),
    event_analysis: extractSection(cleanedText, 'event_analysis'),
    behavioral_fingerprints: extractSection(cleanedText, 'behavioral_fingerprints'),
    cross_references: extractSection(cleanedText, 'cross_references'),
    magic_moment_candidates: extractSection(cleanedText, 'magic_moment_candidates'),
    stale_items: extractSection(cleanedText, 'stale_items'),
    engagement_metrics: extractSection(cleanedText, 'engagement_metrics'),
    new_theme_candidates: extractSection(cleanedText, 'new_theme_candidates'),
    week_shape: extractSection(cleanedText, 'week_shape'),
    world_signal_candidates: extractSection(cleanedText, 'world_signal_candidates'),
    temporal_observations: extractSection(cleanedText, 'temporal_observations'),
  };

  const parsedSections = Object.entries(sections).filter(([k, v]) => v !== null).length;
  console.log(`[UnifiedAnalyst] Parsed ${parsedSections}/${Object.keys(sections).length} sections`);

  // If NO sections parsed at all, try legacy full-JSON parse as fallback
  let parsed;
  if (parsedSections === 0) {
    console.warn('[UnifiedAnalyst] No XML sections found, trying legacy JSON parse');
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      try {
        parsed = JSON.parse(jsonrepair(cleanedText));
        console.log('[UnifiedAnalyst] Legacy jsonrepair succeeded');
      } catch (e2) {
        console.error('[UnifiedAnalyst] All parsing failed:', e2.message);
        parsed = { parseError: e.message, raw: cleanedText };
      }
    }
  } else {
    parsed = {};
    for (const [key, value] of Object.entries(sections)) {
      if (value !== null) parsed[key] = value;
    }
  }

  // Join journal text and todo details back into themes from source data
  if (parsed.themes && Array.isArray(parsed.themes)) {
    const journalsByDate = {};
    for (const j of weeklySnapshot.journals || []) {
      const date = j.date || (j.created_at ? j.created_at.split('T')[0] : null);
      if (date) {
        if (!journalsByDate[date]) journalsByDate[date] = [];
        journalsByDate[date].push(j);
      }
    }

    const todosMap = {};
    for (const t of weeklySnapshot.todosDetail || []) {
      const titleKey = (t.title || '').toLowerCase().trim();
      if (titleKey) todosMap[titleKey] = t;
    }

    for (const theme of parsed.themes) {
      const tw = theme.this_week;
      if (!tw) continue;

      // Join journal quotes from refs
      if (tw.journal_refs && Array.isArray(tw.journal_refs)) {
        tw.journal_quotes = [];
        for (const ref of tw.journal_refs) {
          // ref is a date string like "2026-03-12" or "2026-03-12 — description"
          const date = ref.split(/[\s\u2014-]/)[0].trim(); // eslint-disable-line no-misleading-character-class
          const matches = journalsByDate[date] || [];
          for (const j of matches) {
            const bodySlice = j.body ? j.body.slice(0, 400) : '';
            tw.journal_quotes.push(`${date}: '${bodySlice}'`);
          }
        }
      }

      // Join completed todo details from refs
      if (tw.completed_todo_refs && Array.isArray(tw.completed_todo_refs)) {
        tw.completed_todos = tw.completed_todo_refs.map((title) => {
          const key = (title || '').toLowerCase().trim();
          const match = todosMap[key];
          return match ? `${match.title} (${match.completed_at || 'unknown date'})` : title;
        });
      }

      // Join active todo details from refs
      if (tw.active_todo_refs && Array.isArray(tw.active_todo_refs)) {
        tw.active_todos = tw.active_todo_refs.map((title) => {
          const key = (title || '').toLowerCase().trim();
          const match = todosMap[key];
          return match ? `${match.title} (created ${match.created_at || 'unknown'})` : title;
        });
      }
    }

    console.log(`[UnifiedAnalyst] Joined journal text for ${parsed.themes.length} themes`);
  }

  const latency = Date.now() - t0;

  console.log(`[UnifiedAnalyst] Complete in ${latency}ms`, {
    input_tokens: usage?.input_tokens,
    output_tokens: usage?.output_tokens,
    themes: parsed.themes?.length || 0,
    new_candidates: parsed.new_theme_candidates?.length || 0,
    magic_moments: parsed.magic_moment_candidates?.length || 0,
    week_type: parsed.week_shape?.classification || 'unknown',
  });

  return {
    analysis: parsed,
    metadata: {
      latency_ms: latency,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
      model: 'claude-haiku-4-5-20251001',
      data_payload_chars: dataPayload.length,
      cleaned_events_count: cleanedEvents.length,
    },
  };
}

// ============================================================================
// CORS helpers
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// ============================================================================
// Nightly: auto-archive events older than 7 days
// ============================================================================

const archiveStaleEvents = inngest.createFunction(
  {
    id: 'archive-stale-events',
    name: 'Archive Stale Events',
  },
  { cron: '0 3 * * *' }, // 3 AM UTC daily
  async ({ step, env }) => {
    const result = await step.run('archive-old-events', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      const cutoffString = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(cutoffDate); // YYYY-MM-DD

      // Archive non-goal event notes whose target_date (or end_date for multi-day)
      // is more than 7 days ago. Skip dateless events and goals.
      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?subtype=eq.event&archived=eq.false&is_goal=neq.true&target_date=not.is.null&or=(and(end_date.is.null,target_date.lt.${encodeURIComponent(cutoffString)}),and(end_date.not.is.null,end_date.lt.${encodeURIComponent(cutoffString)}))&select=id`,
        {
          method: 'PATCH',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ archived: true }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to archive stale events: ${response.status} ${errText}`);
      }

      const archived = await response.json();
      return { archivedCount: Array.isArray(archived) ? archived.length : 0 };
    });

    console.log(`[ArchiveStaleEvents] Archived ${result.archivedCount} events older than 7 days`);
    return result;
  },
);

// ============================================================================
// Challenge completion detector — runs every 5 min, idempotent via PATCH guard
// ============================================================================
const detectChallengeCompletion = inngest.createFunction(
  {
    id: 'detect-challenge-completion',
    name: 'Detect Challenge Completion',
    concurrency: { limit: 1 },
    retries: 2,
  },
  [{ cron: '0 * * * *' }, { event: 'app/challenge-completion.detect' }],
  async ({ step, env }) => {
    const nowIso = new Date().toISOString();
    const trialWindowMs = 14 * 24 * 60 * 60 * 1000;

    // Step 1: Fetch candidates — challenge not yet stamped, trial started
    const candidates = await step.run('fetch-candidates', async () => {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/cortex_preferences?challenge_completed_at=is.null&trial_started_at=not.is.null&select=owner_id,trial_started_at`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (!res.ok) throw new Error(`fetch-candidates failed: ${res.status}`);
      const rows = await res.json();
      // Keep only users still inside their 14-day trial window
      const now = Date.now();
      return rows.filter((r) => {
        const started = new Date(r.trial_started_at).getTime();
        return !isNaN(started) && now < started + trialWindowMs;
      });
    });

    if (candidates.length === 0) {
      return { checked: 0, completed: 0 };
    }

    const ownerIds = candidates.map((c) => c.owner_id);

    // Step 2: Count true fed days per candidate
    const fedCounts = await step.run('count-fed-days', async () => {
      const inList = ownerIds.map((id) => `"${id}"`).join(',');
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=in.(${inList})&is_fed=eq.true&select=owner_id`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (!res.ok) throw new Error(`count-fed-days failed: ${res.status}`);
      const rows = await res.json();
      const counts = {};
      for (const row of rows) {
        counts[row.owner_id] = (counts[row.owner_id] ?? 0) + 1;
      }
      return counts;
    });

    // Step 3: For each candidate with >= 7 fed days, attempt idempotent write then emit
    const qualified = candidates.filter((c) => (fedCounts[c.owner_id] ?? 0) >= 7);
    let completed = 0;

    for (const candidate of qualified) {
      const userId = candidate.owner_id;

      const wrote = await step.run(`stamp-completion-${userId}`, async () => {
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${userId}&challenge_completed_at=is.null`,
          {
            method: 'PATCH',
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({ challenge_completed_at: nowIso }),
          },
        );
        if (!res.ok) throw new Error(`stamp-completion failed for ${userId}: ${res.status}`);
        const rows = await res.json();
        // 0 rows means another run already stamped it — skip
        return Array.isArray(rows) && rows.length > 0;
      });

      if (!wrote) continue;

      const timezone = await step.run(`fetch-timezone-${userId}`, async () => {
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${userId}&select=timezone&limit=1`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          },
        );
        if (!res.ok) return 'UTC';
        const rows = await res.json();
        return rows[0]?.timezone ?? 'UTC';
      });

      await step.sendEvent(`emit-challenge-completed-${userId}`, {
        name: 'app/challenge.completed',
        data: { user_id: userId, completed_at: nowIso, timezone },
      });

      completed++;
    }

    return { checked: candidates.length, qualified: qualified.length, completed };
  },
);

// Inngest serve handler
// the weekly synthesis is run by each person's weekly pipe, on their weekly day,
// and what is left of the Sunday classifier runs in the same pipe after it: it
// has no schedule of its own any more (data fabric stage 4b)
const worldsWeeklyRun = createWorldsWeeklyRun(inngest);
const dropAssignmentBackfill = createDropAssignmentBackfill(inngest);
const contextFunctions = createContextFunctions(inngest, { backfill: dropAssignmentBackfill });

const inngestHandler = serve({
  client: inngest,
  functions: [
    dcoDispatcher,
    generateSingleUserDco,
    handleChallengeCompletion,
    detectChallengeCompletion,
    weeklySummaryV07Worker,
    weeklySummaryV2Dispatcher,
    archiveStaleEvents,
    worldsWeeklyRun,
    dropAssignmentBackfill,
    ...contextFunctions.functions,
    ...createWeekFunctions(inngest, {
      synthesis: contextFunctions.weekly,
      classifier: worldsWeeklyRun,
      words: contextFunctions.words,
      memories: contextFunctions.memories,
      people: contextFunctions.people,
      review: contextFunctions.review,
    }),
    ...createBriefFunctions(inngest),
    ...createNotificationFunctions(inngest),
  ],
  servePath: '/',
});

const appHandler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Every custom /api route needs the admin key. challenge-completed already
    // checks it itself below; the Inngest serve path at / is signed by Inngest.
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/challenge-completed') {
      const adminKey = request.headers.get('x-admin-key');
      if (!env.INNGEST_ADMIN_KEY || adminKey !== env.INNGEST_ADMIN_KEY) {
        return corsResponse({ error: 'unauthorized' }, 401);
      }
    }

    // CVE-2026-42047: reject methods serve() doesn't use
    if (!['GET', 'POST', 'PUT'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    // Custom API endpoint: manually trigger space suggestions for a user
    if (url.pathname === '/api/generate-space-suggestions' && request.method === 'POST') {
      return corsResponse(
        {
          error:
            'This endpoint is deprecated. Space suggestions now run weekly inside the weeklySummaryV2Worker pipeline.',
          deprecated: true,
        },
        410,
      );
    }

    // Custom API endpoint: force-generate DCO for one or all users (bypasses Inngest)
    // Context pipeline: a person said something Gremly holds about their life
    // is wrong (from chat, a "Not right?" tap, the brief or a question). Saved
    // and applied straight away; the hourly check picks it up if the event is lost.
    if (url.pathname === '/api/correction' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const userId = typeof body.user_id === 'string' ? body.user_id : null;
        const said = typeof body.said === 'string' ? body.said.trim().slice(0, 2000) : '';
        const surface = ['chat', 'not_right', 'brief', 'question'].includes(body.surface)
          ? body.surface
          : 'chat';
        if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || !said) {
          return corsResponse({ error: 'user_id and said are required' }, 400);
        }
        const row = {
          user_id: userId,
          surface,
          said,
          chat_id:
            typeof body.chat_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.chat_id)
              ? body.chat_id
              : null,
          target_kind: typeof body.target_kind === 'string' ? body.target_kind.slice(0, 40) : null,
          // What they marked, the id it came from (a question when answering one), and
          // what they chose on the Not right sheet: wrong, changed, done or private.
          target_ref:
            body.target_text || body.target_id || body.kind
              ? {
                  text: body.target_text ? String(body.target_text).slice(0, 1000) : null,
                  id: typeof body.target_id === 'string' ? body.target_id.slice(0, 64) : null,
                  kind: ['wrong', 'changed', 'done', 'private'].includes(body.kind)
                    ? body.kind
                    : null,
                  // Some of them on a tidy up: the facts they ticked (data fabric stage 4f)
                  ...(Array.isArray(body.pick)
                    ? {
                        pick: body.pick
                          .filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
                          .slice(0, 50),
                      }
                    : {}),
                }
              : null,
          status: 'received',
        };
        const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/user_corrections`, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(row),
        });
        if (!ins.ok)
          return corsResponse(
            { error: `could not save: ${(await ins.text()).slice(0, 200)}` },
            500,
          );
        const [saved] = await ins.json();
        await fetch('https://inn.gs/e/' + env.INNGEST_EVENT_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/correction.apply',
            data: { correction_id: saved.id, user_id: userId },
          }),
        }).catch(() => {});
        return corsResponse({ ok: true, correction_id: saved.id });
      } catch (e) {
        return corsResponse({ error: String(e?.message || e).slice(0, 200) }, 500);
      }
    }

    // Notifications: the Lab's test send, through cortex
    if (url.pathname.startsWith('/api/notifications/')) {
      return handleNotificationsApi(request, env, corsResponse);
    }

    // Worlds and Chapters (data fabric stage 4b), through cortex for the signed
    // in person: a drop filed while they have no Worlds; a Chapter's memory at
    // the close; fresh words when they change something
    if (url.pathname === '/api/first-worlds' && request.method === 'POST') {
      return handleFirstWorldsApi(request, env, corsResponse, { send: sendEvents });
    }
    if (url.pathname === '/api/chapter-memory' && request.method === 'POST') {
      return handleChapterMemoryApi(request, env, corsResponse, { mode: contextMode });
    }
    if (url.pathname === '/api/words-fresh' && request.method === 'POST') {
      return handleWordsFreshApi(request, env, corsResponse, { send: sendEvents });
    }

    // Daily brief in Chat: the app's first open, or a fresh brief for a later
    // part of the day (once a day), through cortex
    if (url.pathname === '/api/daily-brief' && request.method === 'POST') {
      return handleBriefApi(request, env, corsResponse);
    }

    // Daily brief in Chat: the plan picker (Plan my day, typed changes to a plan), through cortex
    if (url.pathname === '/api/plan-pick' && request.method === 'POST') {
      return handlePlanPickApi(request, env, corsResponse);
    }

    if (url.pathname === '/api/day-turn' && request.method === 'POST') {
      return handleDayTurnApi(request, env, corsResponse);
    }

    // The weekly review: the read for a review opened today, made now when the
    // week has none that serves it, through cortex
    if (url.pathname === '/api/week-read' && request.method === 'POST') {
      return handleWeekReadApi(request, env, corsResponse, ctx);
    }
    // and its spread: which todos go on which day, once they have answered
    if (url.pathname === '/api/week-spread' && request.method === 'POST') {
      return handleWeekSpreadApi(request, env, corsResponse, ctx);
    }

    // Custom API endpoint: challenge completion — dispatches Life Map bootstrap + weekly summary
    if (url.pathname === '/api/challenge-completed' && request.method === 'POST') {
      const adminKey = request.headers.get('x-admin-key');
      if (adminKey !== env.INNGEST_ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        const body = await request.json().catch(() => ({}));
        const { user_id, completed_at, timezone } = body;

        if (!user_id) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        console.log(`[API] challenge-completed: dispatching Inngest job for ${user_id}`);

        const inngestRes = await fetch('https://inn.gs/e/' + env.INNGEST_EVENT_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/challenge.completed',
            data: {
              user_id,
              completed_at: completed_at || new Date().toISOString(),
              timezone: timezone || 'UTC',
            },
          }),
        });

        if (!inngestRes.ok) {
          const errText = await inngestRes.text().catch(() => '');
          throw new Error(
            `Failed to send Inngest event: ${inngestRes.status} ${errText.slice(0, 200)}`,
          );
        }

        return corsResponse({
          success: true,
          user_id,
          message: 'Challenge completion orchestration dispatched.',
        });
      } catch (err) {
        console.error('[API] challenge-completed error:', err);
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    // ── GET /api/ping-cortex ─────────────────────────────────────────────────
    // Diagnostic: makes a live enrich-phase2 call to env.CORTEX (service binding)
    // or env.CORTEX_WORKER_URL (fallback) from inside this Worker. Returns status + body.
    if (url.pathname === '/api/ping-cortex' && request.method === 'GET') {
      const cortexUrl = env.CORTEX_WORKER_URL;
      const usingBinding = !!env.CORTEX;
      try {
        const body = JSON.stringify({
          type: 'enrich-phase2',
          text: 'Buy groceries',
          bucket: 'todo',
          subtype: null,
          currentDate: new Date().toISOString().slice(0, 10),
          timezone: 'UTC',
          dayOfWeek: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()),
        });
        const req = new Request(usingBinding ? 'https://cortex-internal/' : cortexUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const res = usingBinding ? await env.CORTEX.fetch(req) : await fetch(req);
        const text = await res.text().catch(() => '');
        return corsResponse(
          {
            routing: usingBinding ? 'service_binding' : 'http',
            cortexUrl: usingBinding ? '(binding: gentle-thunder-5854)' : cortexUrl,
            status: res.status,
            ok: res.ok,
            body: text.slice(0, 500),
          },
          res.ok ? 200 : 502,
        );
      } catch (err) {
        return corsResponse({ error: String(err) }, 502);
      }
    }

    // ── POST /api/backfill-event-end-dates ──
    if (url.pathname === '/api/backfill-event-end-dates' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id } = body;

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        // Fetch all synced event notes (optionally filtered by user)
        let queryUrl = `${env.SUPABASE_URL}/rest/v1/notes?subtype=eq.event&archived=eq.false&external_source=not.is.null&select=id,title,target_date,end_date,external_source,is_all_day&limit=5000`;
        if (user_id) {
          queryUrl += `&owner_id=eq.${user_id}`;
        }

        const eventsRes = await fetch(queryUrl, { headers: supaHeaders });
        if (!eventsRes.ok) {
          return corsResponse({ error: `Failed to fetch events: ${eventsRes.statusText}` }, 500);
        }
        const events = await eventsRes.json();

        let updated = 0;
        let skippedSameDay = 0;
        let skippedNoEndData = 0;
        let errors = 0;
        const updates = [];

        for (const evt of events) {
          const ext = evt.external_source;
          if (!ext) {
            skippedNoEndData++;
            continue;
          }

          let rawEndDate = null;

          // Google all-day: end.date (YYYY-MM-DD, exclusive)
          if (ext.end?.date) {
            // Exclusive → subtract 1 day for inclusive end
            const d = new Date(ext.end.date + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            rawEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
          // Google timed / Outlook: end.dateTime (ISO string)
          else if (ext.end?.dateTime) {
            rawEndDate = ext.end.dateTime.split('T')[0];
          }
          // Legacy: endAt fallback
          else if (ext.endAt) {
            if (evt.is_all_day) {
              // Treat as exclusive
              const d = new Date(ext.endAt.split('T')[0] + 'T12:00:00');
              d.setDate(d.getDate() - 1);
              rawEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            } else {
              rawEndDate = ext.endAt.split('T')[0];
            }
          }

          if (!rawEndDate) {
            skippedNoEndData++;
            continue;
          }

          // If end date equals target_date → single-day, end_date should be null
          const endDate = rawEndDate !== evt.target_date ? rawEndDate : null;

          // Skip if already correct
          if ((evt.end_date ?? null) === endDate) {
            skippedSameDay++;
            continue;
          }

          updates.push({ id: evt.id, end_date: endDate });
        }

        // Batch updates in groups of 50
        for (let i = 0; i < updates.length; i += 50) {
          const batch = updates.slice(i, i + 50);

          const results = await Promise.allSettled(
            batch.map((u) =>
              fetch(`${env.SUPABASE_URL}/rest/v1/notes?id=eq.${u.id}`, {
                method: 'PATCH',
                headers: supaHeaders,
                body: JSON.stringify({ end_date: u.end_date }),
              }),
            ),
          );

          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.ok) {
              updated++;
            } else {
              errors++;
            }
          }
        }

        console.log(
          `[API] backfill-event-end-dates: checked=${events.length} updated=${updated} skipped_same=${skippedSameDay} skipped_no_end=${skippedNoEndData} errors=${errors}`,
        );

        return corsResponse({
          success: true,
          total_checked: events.length,
          updated,
          skipped_same_day: skippedSameDay,
          skipped_no_end_data: skippedNoEndData,
          errors,
        });
      } catch (err) {
        console.error('[API] backfill-event-end-dates error:', err);
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    // Pass through to Inngest handler for all other routes
    return inngestHandler(request, env, ctx);
  },
};

// Every request runs inside an AI usage context, so each model call the request
// makes is logged against the Inngest function (or API route) and the user.
export default {
  async fetch(request, env, ctx) {
    installAiUsageLogging();
    const url = new URL(request.url);
    let userId = null;
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        userId =
          body?.event?.data?.user_id || body?.events?.[0]?.data?.user_id || body?.user_id || null;
      } catch {
        userId = null;
      }
    }
    const store = {
      env,
      ctx,
      worker: 'inngest-jobs',
      job: url.searchParams.get('fnId') || url.pathname,
      userId,
      runId: url.searchParams.get('runId') || null,
    };
    globalThis.__aiUsageFallbackStore = { env, ctx, worker: 'inngest-jobs' };
    return aiContext.run(store, () => appHandler.fetch(request, env, ctx));
  },

  // The worker's own cron (wrangler.toml [triggers]): notifications planning,
  // receipts and the watchdog. Quiet minutes cost nothing in Inngest.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runNotificationsMinute(env, { now: new Date(event.scheduledTime || Date.now()) }).catch(
        (err) => console.error(`[ALERT][Notifications] minute cron crashed: ${err.message}`),
      ),
    );
  },
};

// ─── Named exports (for off-worker consumers, e.g. equivalence-check scripts) ─
export { fetchUserSnapshot };
