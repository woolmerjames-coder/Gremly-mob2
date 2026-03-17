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

// Dispatcher: fetch active users and fan out one event per user
const dailySynthesisDispatcher = inngest.createFunction(
  {
    id: 'daily-synthesis-dispatcher',
    name: 'Daily Synthesis Dispatcher',
  },
  [
    { cron: '0 4 * * *' }, // 4 AM UTC daily
    { event: 'app/profiles.sync' }, // Manual trigger
  ],
  async ({ step, env }) => {
    const activeUsers = await step.run('get-active-users', async () => {
      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/get_active_users_needing_synthesis`,
        {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get active users: ${response.statusText}`);
      }

      return response.json();
    });

    console.log(`[Dispatcher] Found ${activeUsers.length} active users`);

    // Fan out: send one event per user
    if (activeUsers.length > 0) {
      await step.sendEvent(
        'dispatch-users',
        activeUsers.map((u) => ({
          name: 'app/user.synthesize',
          data: { user_id: u.user_id },
        })),
      );
    }

    return { dispatched: activeUsers.length };
  },
);

// Per-user worker: synthesize profile + generate suggestions as separate steps
const synthesizeSingleUser = inngest.createFunction(
  {
    id: 'synthesize-single-user',
    name: 'Synthesize Single User',
    concurrency: { limit: 5 },
  },
  { event: 'app/user.synthesize' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    console.log(`[UserSynth] Starting for user: ${userId}`);

    const profileResult = await step.run('synthesize-profile', async () => {
      return synthesizeUserProfile(userId, env);
    });

    const suggestionsResult = await step.run('generate-suggestions', async () => {
      return generateSpaceSuggestions(userId, env);
    });

    return {
      user_id: userId,
      profile: profileResult,
      suggestions: suggestionsResult,
    };
  },
);

// ============================================================================
// DCO (Daily Context Object) generation
// ============================================================================

function getUserLocalDate(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  return parts; // en-CA gives YYYY-MM-DD format
}

// Dispatcher: hourly check for users in their 5 AM window, fan out DCO generation
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

    // Step 2: Get all users who need a DCO today
    const allUsers = await step.run('get-users-needing-dco', async () => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_users_needing_dco`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Failed to get users needing DCO: ${res.statusText}`);
      }

      return res.json(); // [{ user_id, timezone }]
    });

    // Step 3: Filter to users whose local time is in the 5:xx AM window
    const readyUsers = await step.run('filter-by-timezone-window', async () => {
      const now = new Date();
      return allUsers.filter((u) => {
        try {
          const userTime = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: u.timezone,
          }).format(now);
          const hour = parseInt(userTime, 10);
          return hour === 4; // Generate DCO at 4:xx AM — always ready before morning notifications
        } catch {
          return false;
        }
      });
    });

    console.log(
      `[DCO Dispatcher] ${allUsers.length} active users, ${readyUsers.length} in 5 AM window`,
    );

    // Step 4: Fan out DCO generation for each ready user
    if (readyUsers.length > 0) {
      await step.sendEvent(
        'dispatch-dco-users',
        readyUsers.map((u) => ({
          name: 'app/dco.generate-user',
          data: { user_id: u.user_id, timezone: u.timezone },
        })),
      );
    }

    return { cleaned, total_active: allUsers.length, dispatched: readyUsers.length };
  },
);

// Per-user worker: fetch data, run extraction + analysis, store DCO
const generateSingleUserDco = inngest.createFunction(
  {
    id: 'generate-single-user-dco',
    name: 'Generate Single User DCO',
    concurrency: { limit: 5 },
  },
  { event: 'app/dco.generate-user' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone;

    try {
      // Step 1: Fetch today's data + Life Map from Supabase
      const snapshot = await step.run('fetch-snapshot', async () => {
        return fetchUserSnapshot(userId, timezone, 7, env);
      });

      // If no Life Map exists, store a minimal DCO and exit
      if (!snapshot.raw.currentLifeMap) {
        console.log(`[DCO] No Life Map for user ${userId} — storing minimal DCO`);
        await step.run('store-minimal-dco', async () => {
          const headers = {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          };
          const todayLocal = getUserLocalDate(timezone);
          const now = new Date();
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                user_id: userId,
                date: todayLocal,
                dco: {
                  day_type: 'routine_day',
                  life_moment: null,
                  tone: 'relaxed',
                  brief_headline: null,
                  pipeline: 'no-life-map-fallback',
                  generated_at: now.toISOString(),
                },
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
                expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
              }),
            },
          );
        });
        return { user_id: userId, success: true, pipeline: 'no-life-map-fallback' };
      }

      // Step 2: Build the world picture (formatter — no AI, no opinions)
      const worldPicture = await step.run('build-world-picture', async () => {
        return buildWorldPicture(snapshot);
      });

      // Step 3: Flash reads the world picture, updates threads, picks daily focus
      const flashResult = await step.run('flash-daily-update', async () => {
        return updateLifeMapAndFocus(worldPicture.lifeMap, worldPicture.text, env);
      });

      // Step 4: Merge Flash's thread updates back into the Life Map
      const updatedLifeMap = await step.run('merge-updates', async () => {
        const mapCopy = JSON.parse(JSON.stringify(worldPicture.lifeMap));
        return mergeLifeMapUpdates(mapCopy, flashResult.thread_updates);
      });

      // Step 5: Haiku writes the headline from the lead story
      const headline = await step.run('generate-headline', async () => {
        return generateHeadlineFromFocus(flashResult.daily_focus, snapshot, env);
      });

      // Step 6: Assemble backward-compatible DCO
      const dco = assembleDcoFromFocus(flashResult.daily_focus, headline, snapshot);

      // Step 7: Store updated Life Map + DCO to Supabase
      await step.run('store-results', async () => {
        const headers = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        };

        const todayLocal = getUserLocalDate(timezone);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 86400000);

        const mapRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id: userId,
              life_map: updatedLifeMap,
              version: snapshot.raw.currentLifeMap.version || 1,
              updated_at: now.toISOString(),
            }),
          },
        );
        if (!mapRes.ok) {
          console.error(`[DCO] Failed to store Life Map: ${mapRes.statusText}`);
        }

        const dcoRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id: userId,
              date: todayLocal,
              dco,
              extraction_raw: {
                world_picture_length: worldPicture.text.length,
                thread_updates_count: flashResult.thread_updates?.length || 0,
                lead_story: flashResult.daily_focus?.lead_story || null,
              },
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
            }),
          },
        );
        if (!dcoRes.ok) {
          console.error(`[DCO] Failed to store DCO: ${dcoRes.statusText}`);
        }

        console.log(`[DCO] Stored Life Map + DCO for user ${userId} (${todayLocal})`);
      });

      return {
        user_id: userId,
        success: true,
        pipeline: 'life-map-v2',
        headline: dco.brief_headline,
        lead_story: flashResult.daily_focus?.lead_story?.thread || null,
        life_moment: dco.life_moment,
        tone: dco.tone,
        day_type: dco.day_type,
      };
    } catch (error) {
      console.error(`[DCO] Failed for user ${userId}:`, error);
      return { user_id: userId, success: false, error: String(error) };
    }
  },
);

const testUnifiedAnalyst = inngest.createFunction(
  {
    id: 'test-unified-analyst',
    name: 'Test Unified Analyst',
  },
  { event: 'app/test.analyst' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone || 'Pacific/Tahiti';
    const windowDays = event.data.window_days || 21;

    const snapshot = await step.run('fetch-snapshot', async () => {
      return fetchUserSnapshot(userId, timezone, windowDays, env);
    });

    const result = await step.run('run-analyst', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const lifeMap = snapshot.raw.currentLifeMap?.life_map || null;

      const target = new Date(snapshot.targetDate + 'T00:00:00Z');
      const dayOfWeek = target.getUTCDay();
      const weekEndDate = new Date(target);
      weekEndDate.setUTCDate(target.getUTCDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
      const weekStartDate = new Date(weekEndDate);
      weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6);
      const weekStart = formatDateOnly(weekStartDate);
      const weekEnd = formatDateOnly(weekEndDate);

      return runUnifiedAnalyst(weeklySnapshot, lifeMap, weekStart, weekEnd, env);
    });

    // Store result in user_daily_state with a special key so we can fetch it
    await step.run('store-result', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      };

      await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userId,
            date: '1999-01-01',
            dco: { _type: 'analyst_test', ...result },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
    });

    return { success: true, themes: result.analysis?.themes?.length || 0 };
  },
);

const testLifeMapRebuild = inngest.createFunction(
  {
    id: 'test-life-map-rebuild',
    name: 'Test Life Map Rebuild',
  },
  { event: 'app/test.rebuild' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone || 'Pacific/Tahiti';

    const snapshot = await step.run('fetch-snapshot', async () => {
      return fetchUserSnapshot(userId, timezone, 21, env);
    });

    const analystResult = await step.run('run-analyst', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const lifeMap = snapshot.raw.currentLifeMap?.life_map || null;

      const target = new Date(snapshot.targetDate + 'T00:00:00Z');
      const dayOfWeek = target.getUTCDay();
      const weekEndDate = new Date(target);
      weekEndDate.setUTCDate(target.getUTCDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
      const weekStartDate = new Date(weekEndDate);
      weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6);
      const weekStart = formatDateOnly(weekStartDate);
      const weekEnd = formatDateOnly(weekEndDate);

      return runUnifiedAnalyst(weeklySnapshot, lifeMap, weekStart, weekEnd, env);
    });

    const rebuildResult = await step.run('rebuild-life-map', async () => {
      const currentLifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      if (!currentLifeMap) {
        throw new Error('No existing Life Map found — run bootstrap first');
      }

      const userProfile = snapshot.raw.userProfile?.profile_text || null;
      const spaces = snapshot.raw.spaces || [];
      const journals = (snapshot.raw.journals || []).map(j => ({
        title: j.title,
        body: j.body,
        mood: j.mood,
        date: j.created_at ? j.created_at.split('T')[0] : null,
        created_at: j.created_at,
      }));

      const result = await rebuildLifeMap(currentLifeMap, analystResult.analysis, userProfile, spaces, journals, env);

      // Apply delta to get merged Life Map
      const mergedLifeMap = mergeWeeklyLifeMapUpdates(
        JSON.parse(JSON.stringify(currentLifeMap)),
        result.delta,
      );

      return {
        delta: result.delta,
        mergedLifeMap,
        metadata: result.metadata,
      };
    });

    await step.run('store-result', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      };

      await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userId,
            date: '1999-01-02',
            dco: {
              _type: 'rebuild_test',
              delta: rebuildResult.delta,
              rebuilt_life_map: rebuildResult.mergedLifeMap,
              rebuild_metadata: rebuildResult.metadata,
              analyst_metadata: analystResult.metadata,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
    });

    return {
      success: true,
      domains: rebuildResult.metadata.domains,
      threads: rebuildResult.metadata.threads,
      version: rebuildResult.metadata.version,
    };
  },
);

const testWeeklySummaryV2 = inngest.createFunction(
  {
    id: 'test-weekly-summary-v2',
    name: 'Test Weekly Summary V2',
  },
  { event: 'app/test.summary-v2' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone || 'Pacific/Tahiti';

    const snapshot = await step.run('fetch-snapshot', async () => {
      return fetchUserSnapshot(userId, timezone, 21, env);
    });

    const weekDates = await step.run('compute-week', async () => {
      const target = new Date(snapshot.targetDate + 'T00:00:00Z');
      const dayOfWeek = target.getUTCDay();
      const weekEndDate = new Date(target);
      weekEndDate.setUTCDate(target.getUTCDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
      const weekStartDate = new Date(weekEndDate);
      weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6);
      return {
        weekStart: formatDateOnly(weekStartDate),
        weekEnd: formatDateOnly(weekEndDate),
      };
    });

    const analystResult = await step.run('run-analyst', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const lifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      return runUnifiedAnalyst(weeklySnapshot, lifeMap, weekDates.weekStart, weekDates.weekEnd, env);
    });

    const rebuildResult = await step.run('rebuild-life-map', async () => {
      const currentLifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      if (!currentLifeMap) throw new Error('No existing Life Map found');
      const userProfile = snapshot.raw.userProfile?.profile_text || null;
      const spaces = snapshot.raw.spaces || [];
      const journals = (snapshot.raw.journals || []).map(j => ({
        title: j.title, body: j.body, mood: j.mood,
        date: j.created_at ? j.created_at.split('T')[0] : null,
      }));
      const result = await rebuildLifeMap(currentLifeMap, analystResult.analysis, userProfile, spaces, journals, env);
      const mergedLifeMap = mergeWeeklyLifeMapUpdates(
        JSON.parse(JSON.stringify(currentLifeMap)),
        result.delta,
      );
      return { delta: result.delta, mergedLifeMap, metadata: result.metadata };
    });

    const engagementStats = await step.run('fetch-engagement', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      // Drops from daily_ritual_progress
      const dropsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=eq.${userId}&ritual_day=gte.${weekDates.weekStart}&ritual_day=lte.${weekDates.weekEnd}&select=drops_count`,
        { headers },
      );
      const dropsRows = await dropsRes.json();
      const totalDrops = (dropsRows || []).reduce((sum, r) => sum + (r.drops_count || 0), 0);

      // Completed sweeps from events table
      const sweepsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/events?owner_id=eq.${userId}&kind=eq.sweep_completed&created_at=gte.${weekDates.weekStart}&created_at=lt.${weekDates.weekEnd}T23:59:59Z&select=id`,
        { headers },
      );
      const sweepsRows = await sweepsRes.json();
      const totalSweeps = (sweepsRows || []).length;

      // Journals count — scoped to this week
      const journals = (snapshot.raw?.journals || snapshot.raw?.drops || [])
        .filter(j => j.subtype === 'journal' && j.created_at && j.created_at.split('T')[0] >= weekDates.weekStart && j.created_at.split('T')[0] <= weekDates.weekEnd)
        .length;

      return { drops: totalDrops, sweeps: totalSweeps, journals };
    });

    const summaryResult = await step.run('generate-summary-v2', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const priorSummaries = snapshot.raw.weeklySummaries || [];
      return generateWeeklySummaryV2(
        analystResult.analysis, rebuildResult.delta, rebuildResult.mergedLifeMap,
        weeklySnapshot, weekDates.weekStart, weekDates.weekEnd, priorSummaries, env,
        engagementStats,
      );
    });

    await step.run('store-result', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      };
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userId,
            date: '1999-01-03',
            dco: {
              _type: 'summary_v2_test',
              summary: summaryResult.summary,
              summary_metadata: summaryResult.metadata,
              analyst_output: analystResult.analysis,
              life_map_delta: rebuildResult.delta,
              rebuilt_life_map: rebuildResult.mergedLifeMap,
              rebuild_metadata: rebuildResult.metadata,
              analyst_metadata: analystResult.metadata,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
    });

    return {
      success: true,
      card_count: summaryResult.summary?.cards?.length || 0,
      card_types: summaryResult.summary?.cards?.map(c => c.type) || [],
    };
  },
);

// ============================================================================
// Life Map: Bootstrap (async Inngest job)
// ============================================================================

const bootstrapSingleUserLifeMap = inngest.createFunction(
  {
    id: 'bootstrap-single-user-life-map',
    name: 'Bootstrap Single User Life Map',
    concurrency: { limit: 2 },
  },
  { event: 'app/life-map.bootstrap' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    console.log(`[LifeMap:Bootstrap] Starting for user: ${userId}`);

    try {
      // Step 1: Fetch full historical snapshot
      const snapshot = await step.run('fetch-snapshot', async () => {
        const s = await fetchFullHistoricalSnapshot(userId, env);
        console.log(`[LifeMap:Bootstrap] Snapshot loaded`, {
          todos: s.todos.length,
          notes: s.notes.length,
          habits: s.habits.length,
          habitProgress: s.habitProgress.length,
          spaces: s.spaces.length,
          milestones: s.milestones.length,
          chatMessages: s.chatMessages.length,
          weeklySummaries: s.weeklySummaries.length,
        });
        return s;
      });

      // Step 2: Generate Life Map via Sonnet
      const lifeMap = await step.run('generate-life-map', async () => {
        return bootstrapLifeMap(snapshot, env);
      });

      // Step 3: Upsert into user_life_map
      await step.run('store-life-map', async () => {
        const headers = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        };

        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id: userId,
              life_map: lifeMap,
              version: 1,
              rebuilt_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          },
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Failed to store Life Map: ${res.status} ${errText.slice(0, 200)}`);
        }

        console.log(`[LifeMap:Bootstrap] Stored for user ${userId}`);
      });

      return {
        user_id: userId,
        success: true,
        domain_count: lifeMap.domains?.length || 0,
        domains: (lifeMap.domains || []).map(d => ({
          name: d.name,
          source: d.source,
          thread_count: d.threads?.length || 0,
        })),
      };
    } catch (error) {
      console.error(`[LifeMap:Bootstrap] Failed for user ${userId}:`, error);
      return { user_id: userId, success: false, error: String(error) };
    }
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
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function fetchDcoInputData(userId, timezone, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const todayLocal = getUserLocalDate(timezone);

  // First, fetch previous DCO AND its extraction (we need both)
  const prevStateRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${todayLocal}&select=dco,extraction_raw,created_at,date&order=date.desc&limit=1`,
    { headers },
  );
  const prevStateRows = await prevStateRes.json();
  const previousDco = prevStateRows[0]?.dco || null;
  const previousExtraction = prevStateRows[0]?.extraction_raw || null;
  const previousCreatedAt = prevStateRows[0]?.created_at || null;
  const previousDate = prevStateRows[0]?.date || null;

  // Determine the "since" cutoff — when was the last DCO generated?
  // If no previous DCO, fall back to 7 days ago
  const sinceCutoff = previousDate
    ? previousDate
    : sevenDaysAgo();

  // Compute end-of-week for forward event window
  // Get days until Sunday (0=Sun, 1=Mon, ..., 6=Sat)
  const todayDate = new Date(todayLocal + 'T00:00:00Z');
  const dayOfWeek = todayDate.getUTCDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const endOfWeek = new Date(todayDate);
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + daysUntilSunday);
  const endOfWeekStr = formatDateOnly(endOfWeek);

  // Tomorrow for the forward window
  const tomorrow = new Date(todayDate);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = formatDateOnly(tomorrow);

  // Yesterday for habit progress
  const yesterday = new Date(todayDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = formatDateOnly(yesterday);

  const [
    todos,
    habits,
    habitProgress,
    notes,
    spaces,
    milestones,
    eventNotes,
    weeklySummaries,
    userProfile,
  ] = await Promise.all([
    // Todos — only created or completed since last DCO
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${sinceCutoff}&select=id,name,status,completed_at,target_date,space_id,created_at&limit=100`,
      { headers },
    ).then((r) => r.json()),

    // Habits — active only (not date-dependent, always needed)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Habit progress — yesterday and today only
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${yesterdayStr}&select=habit_id,occurred_day`,
      { headers },
    ).then((r) => r.json()),

    // Notes/drops — only since last DCO
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${sinceCutoff}&select=id,title,body,subtype,mood,space_id,created_at,target_date,is_goal&limit=100`,
      { headers },
    ).then((r) => r.json()),

    // Spaces — active (always needed for context)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Space milestones — active (always needed)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=name,date,space_id,completed&order=date.asc&limit=50`,
      { headers },
    ).then((r) => r.json()),

    // Event notes — today through end of current week only
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=gte.${todayLocal}&target_date=lte.${endOfWeekStr}&select=id,title,target_date,is_goal,space_id`,
      { headers },
    ).then((r) => r.json()),

    // Weekly summary (latest)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_summaries?owner_id=eq.${userId}&select=summary_text&order=created_at.desc&limit=1`,
      { headers },
    ).then((r) => r.json()),

    // User profile
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text&limit=1`,
      { headers },
    ).then((r) => r.json()),
  ]);

  return {
    userId,
    todayLocal,
    timezone,
    todos: Array.isArray(todos) ? todos : [],
    habits: Array.isArray(habits) ? habits : [],
    habitProgress: Array.isArray(habitProgress) ? habitProgress : [],
    notes: Array.isArray(notes) ? notes : [],
    spaces: Array.isArray(spaces) ? spaces : [],
    milestones: Array.isArray(milestones) ? milestones : [],
    eventNotes: Array.isArray(eventNotes) ? eventNotes : [],
    weeklySummary: weeklySummaries?.[0]?.summary_text || null,
    previousDco: previousDco,
    previousExtraction: previousExtraction,
    userProfile: userProfile?.[0]?.profile_text || null,
  };
}

// ============================================================================
// DCO data fetching — historical (date-parameterized)
// ============================================================================

async function fetchDcoInputDataForDate(userId, timezone, targetDate, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const todayLocal = targetDate;

  // Date helpers relative to targetDate
  const target = new Date(targetDate + 'T00:00:00Z');
  const sevenBefore = new Date(target);
  sevenBefore.setUTCDate(sevenBefore.getUTCDate() - 7);
  const sevenDaysBeforeStr = formatDateOnly(sevenBefore);

  // End of week for forward event window
  const dayOfWeek = target.getUTCDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const endOfWeek = new Date(target);
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + daysUntilSunday);
  const endOfWeekStr = formatDateOnly(endOfWeek);

  // Yesterday for habit progress
  const yesterday = new Date(target);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = formatDateOnly(yesterday);

  // Upper bound for JS filtering
  const targetEndOfDay = new Date(targetDate + 'T23:59:59.999Z');

  const [
    todosRaw,
    habits,
    habitProgressRaw,
    notesRaw,
    spaces,
    milestones,
    eventNotes,
    weeklySummaries,
    previousDco,
    previousExtraction,
    userProfile,
  ] = await Promise.all([
    // Todos (7 days before targetDate)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${sevenDaysBeforeStr}&select=id,name,status,completed_at,target_date,space_id,created_at&limit=100`,
      { headers },
    ).then((r) => r.json()),

    // Habits (active)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Habit progress (7 days before targetDate)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${sevenDaysBeforeStr}&select=habit_id,occurred_day`,
      { headers },
    ).then((r) => r.json()),

    // Notes (7 days before targetDate)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${sevenDaysBeforeStr}&select=id,title,body,subtype,mood,space_id,created_at,target_date,is_goal,archived&limit=200`,
      { headers },
    ).then((r) => r.json()),

    // Spaces (active)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Space milestones (active)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=name,date,space_id,completed&order=date.asc&limit=50`,
      { headers },
    ).then((r) => r.json()),

    // Event notes — targetDate through end of week
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=gte.${targetDate}&target_date=lte.${endOfWeekStr}&select=id,title,target_date,is_goal,space_id`,
      { headers },
    ).then((r) => r.json()),

    // Weekly summary (latest)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_summaries?owner_id=eq.${userId}&select=summary_text&order=created_at.desc&limit=1`,
      { headers },
    ).then((r) => r.json()),

    // Previous DCO (most recent before targetDate)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${targetDate}&select=dco,extraction_raw&order=date.desc&limit=1`,
      { headers },
    ).then((r) => r.json()),

    // Previous extraction (same row)
    // Already fetched above — will extract from same result

    // User profile
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text&limit=1`,
      { headers },
    ).then((r) => r.json()),
  ]);

  // Filter: remove anything created after target day
  const todos = Array.isArray(todosRaw)
    ? todosRaw.filter((t) => !t.created_at || new Date(t.created_at) <= targetEndOfDay)
    : [];
  const notes = Array.isArray(notesRaw)
    ? notesRaw.filter((n) => !n.created_at || new Date(n.created_at) <= targetEndOfDay)
    : [];
  const habitProgress = Array.isArray(habitProgressRaw)
    ? habitProgressRaw.filter((h) => !h.occurred_day || h.occurred_day <= targetDate)
    : [];

  console.log(`[DCO:Backfill] ${targetDate}: ${todos.length} todos, ${notes.length} notes, ${habitProgress.length} habit_progress, hasPrevDco: ${!!previousDco?.[0]?.dco}`);

  return {
    userId,
    todayLocal,
    timezone,
    todos,
    habits: Array.isArray(habits) ? habits : [],
    habitProgress,
    notes,
    spaces: Array.isArray(spaces) ? spaces : [],
    milestones: Array.isArray(milestones) ? milestones : [],
    eventNotes: Array.isArray(eventNotes) ? eventNotes : [],
    weeklySummary: weeklySummaries?.[0]?.summary_text || null,
    previousDco: previousDco?.[0]?.dco || null,
    previousExtraction: previousDco?.[0]?.extraction_raw || null,
    userProfile: userProfile?.[0]?.profile_text || null,
  };
}

// ============================================================================
// DCO context builder (deterministic — no AI calls)
// ============================================================================

async function buildDcoContext(userId, timezone, targetDate, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Date math
  const target = new Date(targetDate + 'T00:00:00Z');
  const targetEndOfDay = new Date(targetDate + 'T23:59:59.999Z');

  const fourteenBefore = new Date(target);
  fourteenBefore.setUTCDate(fourteenBefore.getUTCDate() - 14);
  const fourteenBeforeStr = formatDateOnly(fourteenBefore);

  const fourteenAfter = new Date(target);
  fourteenAfter.setUTCDate(fourteenAfter.getUTCDate() + 14);
  const fourteenAfterStr = formatDateOnly(fourteenAfter);

  const sevenBefore = new Date(target);
  sevenBefore.setUTCDate(sevenBefore.getUTCDate() - 7);
  const sevenBeforeStr = formatDateOnly(sevenBefore);

  const threeBefore = new Date(target);
  threeBefore.setUTCDate(threeBefore.getUTCDate() - 3);
  const threeBeforeStr = formatDateOnly(threeBefore);

  const sixBefore = new Date(target);
  sixBefore.setUTCDate(sixBefore.getUTCDate() - 6);
  const sixBeforeStr = formatDateOnly(sixBefore);

  const yesterday = new Date(target);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = formatDateOnly(yesterday);

  // ========================================================
  // PARALLEL FETCH — all raw data in one batch
  // ========================================================
  const [
    allEventNotesRaw,
    recentDropsRaw,
    todosRaw,
    habits,
    habitProgressRaw,
    spaces,
    milestones,
    weeklySummaries,
    previousDcoRows,
    userProfileRows,
  ] = await Promise.all([
    // Event notes: ±14 day window around target date (OR filter catches multi-day events)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=lte.${fourteenAfterStr}&or=(target_date.gte.${fourteenBeforeStr},end_date.gte.${fourteenBeforeStr})&select=id,title,target_date,end_date,event_time,location,is_all_day,space_id,external_source&order=target_date.asc&limit=500`,
      { headers },
    ).then(r => r.json()),

    // Recent drops: last 7 days, NOT events
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=neq.event&archived=eq.false&created_at=gte.${sevenBeforeStr}&select=id,title,body,subtype,mood,space_id,created_at,is_goal&order=created_at.desc&limit=100`,
      { headers },
    ).then(r => r.json()),

    // Todos: last 7 days
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${sevenBeforeStr}&select=id,name,status,completed_at,target_date,space_id,created_at&limit=100`,
      { headers },
    ).then(r => r.json()),

    // Habits: active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency&limit=20`,
      { headers },
    ).then(r => r.json()),

    // Habit progress: last 7 days
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${sevenBeforeStr}&select=habit_id,occurred_day`,
      { headers },
    ).then(r => r.json()),

    // Spaces: active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then(r => r.json()),

    // Space milestones: active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=name,date,space_id,completed&order=date.asc&limit=50`,
      { headers },
    ).then(r => r.json()),

    // Weekly summary: latest
    fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_summaries?owner_id=eq.${userId}&select=summary_text&order=created_at.desc&limit=1`,
      { headers },
    ).then(r => r.json()),

    // Previous DCO: most recent before target date
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${targetDate}&select=dco,date&order=date.desc&limit=1`,
      { headers },
    ).then(r => r.json()),

    // User profile
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text&limit=1`,
      { headers },
    ).then(r => r.json()),
  ]);

  // Safe array helpers
  const safeArray = (v) => (Array.isArray(v) ? v : []);
  const allEventNotes = safeArray(allEventNotesRaw);
  const recentDropsAll = safeArray(recentDropsRaw);
  const todosAll = safeArray(todosRaw);
  const habitsArr = safeArray(habits);
  const habitProgressAll = safeArray(habitProgressRaw);
  const spacesArr = safeArray(spaces);
  const milestonesArr = safeArray(milestones);

  // Build space lookup
  const spaceMap = {};
  for (const s of spacesArr) {
    spaceMap[s.id] = s.name;
  }

  // ========================================================
  // FILTER: only data that existed on or before target date
  // ========================================================
  const todos = todosAll.filter(
    t => !t.created_at || new Date(t.created_at) <= targetEndOfDay
  );
  const recentDrops = recentDropsAll.filter(
    n => !n.created_at || new Date(n.created_at) <= targetEndOfDay
  );
  const habitProgress = habitProgressAll.filter(
    h => !h.occurred_day || h.occurred_day <= targetDate
  );

  // ========================================================
  // DEDUPLICATE CALENDAR EVENTS
  // ========================================================
  const seenExternalIds = new Map();
  const seenKeyDates = new Set();
  const dedupedEvents = [];

  for (const evt of allEventNotes) {
    // Skip cancelled
    if (evt.title && (
      evt.title.toLowerCase().startsWith('canceled:') ||
      evt.title.toLowerCase().startsWith('cancelled:')
    )) continue;

    if (evt.external_source && evt.external_source.externalId) {
      const extId = evt.external_source.externalId;
      if (!seenExternalIds.has(extId)) {
        seenExternalIds.set(extId, evt);
        dedupedEvents.push(evt);
      }
    } else {
      // Key date — dedup on title + date + space
      const key = `${(evt.title || '').trim().toLowerCase()}|${evt.target_date}|${evt.space_id || ''}`;
      if (!seenKeyDates.has(key)) {
        seenKeyDates.add(key);
        dedupedEvents.push(evt);
      }
    }
  }

  // ========================================================
  // BUILD: Calendar events for today
  // ========================================================
  const todaysEvents = dedupedEvents
    .filter(e => e.target_date === targetDate)
    .map(e => ({
      title: e.title,
      time: e.event_time || null,
      location: e.location || null,
      is_all_day: e.is_all_day || null,
      space: spaceMap[e.space_id] || null,
      is_synced: !!e.external_source,
    }));

  // ========================================================
  // BUILD: Space key dates — narrow window (±5 days)
  // Wider context goes in upcoming_events only
  // ========================================================
  const fiveBefore = new Date(target);
  fiveBefore.setUTCDate(fiveBefore.getUTCDate() - 5);
  const fiveBeforeStr = formatDateOnly(fiveBefore);

  const fiveAfter = new Date(target);
  fiveAfter.setUTCDate(fiveAfter.getUTCDate() + 5);
  const fiveAfterStr = formatDateOnly(fiveAfter);

  const spaceKeyDates = dedupedEvents
    .filter(e => !e.external_source && e.space_id
      && e.target_date >= fiveBeforeStr
      && e.target_date <= fiveAfterStr)
    .map(e => ({
      date: e.target_date,
      title: e.title,
      space: spaceMap[e.space_id] || null,
    }));

  // ========================================================
  // BUILD: Upcoming events (next 7 days, not today)
  // ========================================================
  const sevenAfter = new Date(target);
  sevenAfter.setUTCDate(sevenAfter.getUTCDate() + 7);
  const sevenAfterStr = formatDateOnly(sevenAfter);

  const upcomingEvents = dedupedEvents
    .filter(e => e.target_date > targetDate && e.target_date <= sevenAfterStr)
    .slice(0, 15)
    .map(e => ({
      title: e.title,
      date: e.target_date,
      space: spaceMap[e.space_id] || null,
      is_synced: !!e.external_source,
    }));

  // ========================================================
  // COMPUTE: Todo stats
  // ========================================================
  const todosOverdue = todos.filter(
    t => t.target_date && t.target_date < targetDate && t.status !== 'completed'
  ).length;
  const todosActive = todos.filter(t => t.status === 'active').length;
  const todosCompletedRecently = todos.filter(t => t.status === 'completed').length;

  // ========================================================
  // COMPUTE: Habit health
  // ========================================================
  const habitCompletionMap = {};
  for (const hp of habitProgress) {
    habitCompletionMap[hp.habit_id] = (habitCompletionMap[hp.habit_id] || 0) + 1;
  }

  const habitHealth = habitsArr.map(h => {
    const done = habitCompletionMap[h.id] || 0;
    const expected = getExpectedCompletionsForDays(h.frequency, 7);
    const score = expected > 0 ? Math.round((done / expected) * 100) : 0;
    return {
      name: h.name,
      frequency: h.frequency,
      completions_7d: done,
      expected_7d: expected,
      score_pct: score,
    };
  });

  // ========================================================
  // COMPUTE: Drop velocity
  // ========================================================
  const dropsLast3 = recentDrops.filter(n => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= threeBeforeStr && d <= targetDate;
  }).length;
  const dropsPrev3 = recentDrops.filter(n => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= sixBeforeStr && d < threeBeforeStr;
  }).length;

  let dropVelocity = 'steady';
  if (dropsLast3 > dropsPrev3 * 1.5) dropVelocity = 'increasing';
  else if (dropsLast3 < dropsPrev3 * 0.5) dropVelocity = 'decreasing';

  // ========================================================
  // COMPUTE: Mood signal from journal drops
  // ========================================================
  const journals = recentDrops.filter(n => n.subtype === 'journal');
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

  // Top moods ranked by frequency (top 3)
  const topMoods = totalMoodTags > 0
    ? Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([mood, count]) => ({ mood, count, pct: Math.round((count / totalMoodTags) * 100) }))
    : [];

  const moodSignal = {
    top_moods: topMoods,
    all_tags: moodCounts,
    total_tags: totalMoodTags,
    journal_count_7d: journals.length,
  };

  // ========================================================
  // BUILD: Recent drops for the model to read
  // ONLY drops BEFORE the target date — matches 4am live behavior
  // where the user hasn't dropped anything yet today
  // ========================================================
  const twoDaysBefore = new Date(target);
  twoDaysBefore.setUTCDate(twoDaysBefore.getUTCDate() - 2);
  const twoDaysBeforeStr = formatDateOnly(twoDaysBefore);

  const recentDropsForModel = recentDrops
    .filter(n => {
      const d = n.created_at ? n.created_at.split('T')[0] : null;
      return d && d >= twoDaysBeforeStr && d < targetDate;
    })
    .slice(0, 15)
    .map(n => ({
      title: n.title,
      body: n.body ? n.body.slice(0, 200) : null,
      subtype: n.subtype,
      mood: n.mood || [],
      space: spaceMap[n.space_id] || null,
      is_goal: n.is_goal || false,
    }));

  // ========================================================
  // BUILD: Active spaces with recent activity
  // ========================================================
  const spaceDropCounts = {};
  for (const n of recentDrops) {
    if (n.space_id) {
      spaceDropCounts[n.space_id] = (spaceDropCounts[n.space_id] || 0) + 1;
    }
  }
  for (const t of todos) {
    if (t.space_id) {
      spaceDropCounts[t.space_id] = (spaceDropCounts[t.space_id] || 0) + 1;
    }
  }

  const activeSpaces = spacesArr.map(s => ({
    name: s.name,
    recent_activity: spaceDropCounts[s.id] || 0,
  }));

  // ========================================================
  // BUILD: Milestones
  // ========================================================
  const milestonesFormatted = milestonesArr.slice(0, 10).map(m => ({
    name: m.name,
    date: m.date || null,
    space: spaceMap[m.space_id] || null,
    completed: m.completed || false,
  }));

  // ========================================================
  // PREVIOUS DCO
  // ========================================================
  const previousDco = previousDcoRows?.[0]?.dco || null;

  // ========================================================
  // ASSEMBLE FINAL CONTEXT
  // ========================================================
  return {
    user_id: userId,
    target_date: targetDate,
    timezone,
    user_profile: userProfileRows?.[0]?.profile_text || null,
    todays_events: todaysEvents,
    todays_event_count: todaysEvents.length,
    space_key_dates: spaceKeyDates,
    upcoming_events: upcomingEvents,
    todos: {
      overdue: todosOverdue,
      active: todosActive,
      completed_recently: todosCompletedRecently,
    },
    habits: habitHealth,
    drop_velocity: dropVelocity,
    drops_last_3d: dropsLast3,
    drops_prev_3d: dropsPrev3,
    mood: moodSignal,
    recent_drops: recentDropsForModel,
    spaces: activeSpaces,
    milestones: milestonesFormatted,
    weekly_digest: weeklySummaries?.[0]?.summary_text || null,
    previous: previousDco ? {
      headline: previousDco.brief_headline || null,
      life_moment: previousDco.life_moment || null,
      tone: previousDco.tone || null,
      date: previousDcoRows?.[0]?.date || null,
    } : null,
  };
}

// ============================================================================
// DCO generation (gemini-2.5-flash) — single-call pipeline
// ============================================================================

async function generateDco(context, env) {
  const t0 = Date.now();

  // ========================================================
  // BUILD THE PROMPT
  // ========================================================

  const systemPrompt = `You are Gremly's daily context engine. You produce a Daily Context Object (DCO) — a JSON snapshot of what TODAY looks like for one user.

You will receive structured data that has already been computed. Your job is INTERPRETATION and WRITING — not math or counting. The numbers are correct. Trust them.

WHO IS THIS PERSON:
${context.user_profile || 'No profile available yet — this is a new user.'}

YOUR PROCESS (follow this order):

STEP 1 — READ TODAY'S SIGNALS
Look at what is actually happening TODAY:
- What's on the calendar?
- What did the user drop or journal in the last 1-2 days?
- What mood are they in?
- What are their habits doing?
- What's overdue?

Today's signals are the PRIMARY driver of the DCO. Everything else is context.

STEP 2 — DETERMINE LIFE_MOMENT
This is the single dominant context of the user's life RIGHT NOW.

Rules:
- Derived from what is ACTIVELY HAPPENING — not what's coming later.
- A future event more than 3 days away is NOT the life_moment. It goes in upcoming_in_7d.
- A future event 1-3 days away can influence the life_moment only if the user is actively preparing for it (evidenced by drops or todos about it).

READING KEY DATES: Key dates in a space are a MIX of travel milestones, goals, activities, and deadlines. A single key date does NOT mean the user is immersed in that context. To determine if the user is actively traveling or at a destination, look for:
- A SEQUENCE of travel-indicating events (flights, trips, journeys) where the current date falls BETWEEN a departure and the next destination
- TODAY's events showing travel or location arrival
- Recent drops that describe being somewhere new

A standalone key date like "Go for a run" or "Buy birthday gift" in a trip space does NOT mean the user is currently on that trip. Only a clear travel sequence with the current date inside it means the user is traveling.

- If nothing notable is happening, describe what the user is actually doing based on their active spaces and recent drops. Low confidence is fine.
- Keep it to a short phrase, 2-6 words.

STEP 3 — SET TONE
Based on ALL of today's signals combined:
- "relaxed": light calendar, positive mood, low pressure
- "focused": productive signals, work activity, in the zone
- "stretched": overloaded, stressed mood, lots overdue, too much happening
- "recovering": coming down from intensity, reflective drops, low velocity
- "celebratory": milestone achieved, arrival somewhere exciting, genuine joy in drops

Tone follows the EVIDENCE in drops and mood tags. Not assumptions about what a day "should" feel like.

STEP 4 — WRITE THE HEADLINE
This is the most important output. Gremly speaks directly to the user.

Hard rules:
- MAXIMUM 12 WORDS. Count them. If over 12, rewrite shorter.
- One short sentence, or a sentence with a dash. Not two sentences.
- Must reference something SPECIFIC from today's data — an event, a drop theme, a habit streak, a milestone, a mood shift. If you cannot point to the exact data point that inspired the headline, it is too generic.
- Write with warmth and conviction. No hedging ("it seems", "a sense of", "brings a mix of", "amidst", "navigating", "balancing").
- No exclamation marks. No corporate motivation. No generic filler.
- If a previous headline exists, write something with a COMPLETELY different structure and angle. Do not reuse sentence patterns from previous headlines.
- If nothing specific stands out today, return null. Silence beats filler.

How to test your headline:
1. Could this headline apply to a different day without changing a word? If yes, it is too generic. Rewrite.
2. Does every noun in the headline come from today's data? If not, you are inventing. Rewrite.
3. Is it over 12 words? Rewrite.
4. Does it use hedging language? Rewrite.

STEP 5 — EXTRACT NAMED ANCHORS
Only proper nouns explicitly in the data. Never invent names.

STEP 6 — ASSESS DELTAS
Compare against the previous DCO if available. What changed?

STEP 7 — DETERMINE TODAY_FOCUS
1-3 things that matter most today. Derived from: overdue todos, today's events, habit streaks at risk, drop themes. Empty array if nothing stands out.

OUTPUT — return ONLY this JSON:
{
  "day_type": "event_day" | "work_day" | "milestone_day" | "routine_day" | "quiet_day" | "transition_day",
  "life_moment": "short phrase" | null,
  "life_moment_confidence": "high" | "medium" | "low",
  "tone": "relaxed" | "focused" | "stretched" | "recovering" | "celebratory",
  "brief_headline": "max 12 words" | null,
  "named_anchors": [{"label": "Name", "type": "person|trip|project|event", "source": "drop|space|calendar"}],
  "active_today": {
    "calendar_events": ["event title 1", "event title 2"],
    "overdue_todos": number,
    "habit_streak_risk": ["habit names where score < 50%"],
    "upcoming_in_7d": ["notable upcoming items"]
  },
  "deltas": {
    "drop_velocity": "increasing" | "steady" | "decreasing",
    "habit_health": "strong" | "mixed" | "declining",
    "mood_signal": "positive" | "neutral" | "negative" | "mixed",
    "notable_change": "one sentence max" | null
  },
  "today_focus": ["item 1", "item 2", "item 3"],
  "weekly_digest": "one sentence summary" | null
}`;

  // ========================================================
  // BUILD THE USER MESSAGE WITH ALL CONTEXT
  // ========================================================

  const userMessage = `TODAY'S DATE: ${context.target_date}
TIMEZONE: ${context.timezone}

${context.previous ? `PREVIOUS DCO (${context.previous.date}):
  headline: ${context.previous.headline || 'null'}
  life_moment: ${context.previous.life_moment || 'null'}
  tone: ${context.previous.tone || 'null'}
DO NOT repeat or rephrase the previous headline. Find a completely different angle.
` : 'No previous DCO — this is the first generation for this user.'}

TODAY'S CALENDAR EVENTS:
${context.todays_events.length > 0
    ? context.todays_events.map(e => {
        const time = e.time ? ` at ${e.time}` : '';
        const loc = e.location ? ` (${e.location})` : '';
        const space = e.space ? ` [${e.space}]` : '';
        const src = e.is_synced ? ' {synced}' : ' {key date}';
        return `- ${e.title}${time}${loc}${space}${src}`;
      }).join('\n')
    : 'No events today.'}

SPACE KEY DATES (user-created milestones — some imply travel/location, some are goals or deadlines):
${context.space_key_dates.length > 0
    ? context.space_key_dates.map(e => `- ${e.date}: ${e.title} [${e.space}]`).join('\n')
    : 'None.'}

UPCOMING EVENTS (next 7 days):
${context.upcoming_events.length > 0
    ? context.upcoming_events.slice(0, 10).map(e => {
        const space = e.space ? ` [${e.space}]` : '';
        return `- ${e.date}: ${e.title}${space}`;
      }).join('\n')
    : 'Nothing scheduled.'}

TODOS: ${context.todos.overdue} overdue, ${context.todos.active} active, ${context.todos.completed_recently} completed recently

HABITS (7-day health):
${context.habits.length > 0
    ? context.habits.map(h => `- ${h.name}: ${h.completions_7d}/${h.expected_7d} (${h.score_pct}%)`).join('\n')
    : 'No habits tracked.'}

DROP ACTIVITY: ${context.drop_velocity} (${context.drops_last_3d} drops last 3 days vs ${context.drops_prev_3d} previous 3 days)

MOOD (from journal entries, last 7 days — ${context.mood.journal_count_7d} journals):
${context.mood.top_moods.length > 0
    ? context.mood.top_moods.map(m => `- ${m.mood}: ${m.count} times (${m.pct}%)`).join('\n')
    : 'No mood data.'}

RECENT DROPS (last 1-2 days — what the user captured or journaled):
${context.recent_drops.length > 0
    ? context.recent_drops.map(d => {
        const mood = d.mood && d.mood.length > 0 ? ` [mood: ${d.mood.join(', ')}]` : '';
        const space = d.space ? ` (${d.space})` : '';
        const body = d.body ? `\n  "${d.body}"` : '';
        return `- ${d.title} [${d.subtype}]${mood}${space}${body}`;
      }).join('\n')
    : 'No recent drops.'}

ACTIVE SPACES:
${context.spaces.length > 0
    ? context.spaces.map(s => `- ${s.name}: ${s.recent_activity} items in last 7 days`).join('\n')
    : 'No spaces.'}

MILESTONES:
${context.milestones.length > 0
    ? context.milestones.map(m => {
        const space = m.space ? ` [${m.space}]` : '';
        const done = m.completed ? ' ✓' : '';
        return `- ${m.name}: ${m.date}${space}${done}`;
      }).join('\n')
    : 'None.'}

${context.weekly_digest ? `WEEKLY DIGEST: ${context.weekly_digest}` : ''}

Produce the DCO JSON now.`;

  // ========================================================
  // CALL GEMINI FLASH
  // ========================================================

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 2048,
        },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`DCO generation failed: ${response.status} ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();

  // Extract text part (skip thinking parts)
  const candidate = data.candidates?.[0];
  let content = '{}';
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text && !part.thought) {
        content = part.text;
        break;
      }
    }
  }

  // Clean markdown fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let dco;
  try {
    dco = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[DCO:Flash] JSON parse failed. Raw:', content.slice(0, 500));
    throw new Error(`DCO parse error: ${parseErr.message}`);
  }

  // ========================================================
  // ATTACH METADATA
  // ========================================================
  const usage = data.usageMetadata;
  const latency = Date.now() - t0;

  dco.user_id = context.user_id;
  dco.date = context.target_date;
  dco.generated_at = new Date().toISOString();
  dco.ttl_days = 7;
  dco.input_sources = ['todos', 'habits', 'notes', 'spaces'];
  if (context.weekly_digest) dco.input_sources.push('weekly_summary');
  if (context.user_profile) dco.input_sources.push('user_profile');
  dco.model_used = 'gemini-2.5-flash';
  dco._latency_ms = latency;
  dco._token_usage = usage ? {
    input: usage.promptTokenCount,
    output: usage.candidatesTokenCount,
    thinking: usage.thoughtsTokenCount || 0,
    total: usage.totalTokenCount,
  } : null;

  console.log(`[DCO:Flash] Generated in ${latency}ms`, {
    day_type: dco.day_type,
    life_moment: dco.life_moment,
    tone: dco.tone,
    has_headline: !!dco.brief_headline,
  });

  return dco;
}

// ============================================================================
// Headline generation (claude-haiku-4-5) — focused single-purpose call
// ============================================================================

async function generateHeadline(dco, context, env) {
  const t0 = Date.now();

  // Build a minimal payload — only what the headline writer needs
  const todaysEventsList = context.todays_events
    .map(e => {
      const space = e.space ? ` [${e.space}]` : '';
      return `${e.title}${space}`;
    })
    .join(', ') || 'nothing scheduled';

  const recentDropTitles = context.recent_drops
    .slice(0, 5)
    .map(d => {
      const mood = d.mood && d.mood.length > 0 ? ` (${d.mood.join(', ')})` : '';
      return `${d.title}${mood}`;
    })
    .join('; ') || 'none';

  const habitRisks = context.habits
    .filter(h => h.score_pct < 50)
    .map(h => h.name)
    .join(', ') || 'none';

  const habitWins = context.habits
    .filter(h => h.score_pct >= 100)
    .map(h => h.name)
    .join(', ') || 'none';

  // Count days at current location from space key dates
  // (helps the model say "day 3 in Tokyo" naturally)
  let daysAtLocation = null;
  if (dco.life_moment && context.space_key_dates.length > 0) {
    // Find the most recent key date ON or BEFORE today that looks
    // like an arrival (it's in the same space as life_moment context)
    const sortedPast = context.space_key_dates
      .filter(k => k.date <= context.target_date)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (sortedPast.length > 0) {
      const arrivalDate = sortedPast[0].date;
      const arrival = new Date(arrivalDate + 'T00:00:00Z');
      const today = new Date(context.target_date + 'T00:00:00Z');
      const diffDays = Math.round((today - arrival) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 30) {
        daysAtLocation = diffDays + 1; // day 1 = arrival day
      }
    }
  }

  // Compute how many days into an overall journey the user is
  // (e.g., honeymoon started 9 days ago, even if current city is day 2)
  let daysIntoJourney = null;
  let journeySpace = null;
  if (context.space_key_dates.length >= 2) {
    // Find the earliest key date in the same space as today's event
    const todaySpaces = context.todays_events
      .map(e => e.space)
      .filter(Boolean);
    const relevantSpace = todaySpaces[0] || null;

    if (relevantSpace) {
      const allDatesInSpace = context.space_key_dates
        .filter(k => k.space === relevantSpace && k.date <= context.target_date)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (allDatesInSpace.length > 0) {
        const firstDate = new Date(allDatesInSpace[0].date + 'T00:00:00Z');
        const today = new Date(context.target_date + 'T00:00:00Z');
        const diff = Math.round((today - firstDate) / (1000 * 60 * 60 * 24));
        if (diff > 0) {
          daysIntoJourney = diff + 1;
          journeySpace = relevantSpace;
        }
      }
    }
  }

  const upcomingNotable = context.upcoming_events
    .filter(e => !e.is_synced)
    .slice(0, 3)
    .map(e => `${e.title} (${e.date})`)
    .join(', ') || 'nothing notable';

  const prompt = `You write a single line that appears on a companion app's morning screen. Your job is to OBSERVE what is true about today — not to give advice, encouragement, or motivation.

TODAY is ${context.target_date}.

WHAT IS TRUE TODAY:
- Events today: ${todaysEventsList}${daysAtLocation ? `\n- Day ${daysAtLocation} at current location` : ''}${daysIntoJourney ? `\n- Day ${daysIntoJourney} of ${journeySpace} overall` : ''}
- Overdue todos: ${context.todos.overdue}
- Active todos: ${context.todos.active}
- Habits thriving: ${habitWins}
- Habits struggling: ${habitRisks}

WHAT THE USER HAS BEEN CAPTURING (use these for specificity):
${recentDropTitles}

BACKGROUND:
- Overall context: ${dco.life_moment || 'nothing notable'}
- Mood lately: ${dco.deltas?.mood_signal || 'neutral'}
- Drop velocity: ${context.drop_velocity}
- Upcoming: ${upcomingNotable}
${context.previous?.headline ? `\nYESTERDAY'S HEADLINE (write something structurally different): "${context.previous.headline}"` : ''}

YOUR JOB:
Observe what is happening in this person's life today. Reflect their reality back to them. State what is true.

You are NOT a coach, therapist, or motivational speaker. Do not tell the user to rest, enjoy, stay strong, keep going, or pace themselves. Do not give advice of any kind. Simply name what today is.

RULES:
- Maximum 10 words.
- State what is true about today. That is all.
- Use specific details from the data — locations, event names, drop themes, habit names.
- If the user is mid-journey, do not say the journey "begins" unless today is actually the first day.
- No exclamation marks. No questions. No advice. No encouragement.
- If there is nothing interesting about today, respond with exactly: null

Respond with ONLY the headline text or null. Nothing else.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        temperature: 0.7,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[DCO:Headline] Haiku error: ${response.status} ${errBody.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || null;
    const latency = Date.now() - t0;

    console.log(`[DCO:Headline] Generated in ${latency}ms: ${text}`);

    // Return null if the model explicitly said null or returned empty
    if (!text || text.toLowerCase() === 'null') return null;

    return text;
  } catch (err) {
    console.error('[DCO:Headline] Failed:', err);
    return null;
  }
}

// ============================================================================
// DCO extraction (gpt-4.1-nano)
// ============================================================================

async function runDcoExtraction(inputData, env) {
  const t0 = Date.now();
  const todayLocal = inputData.todayLocal;

  // ── SEPARATE USER CONTENT FROM CALENDAR EVENTS ──
  // These are fundamentally different data types and must be handled separately.

  const allNotes = inputData.notes || [];
  const allEventNotes = inputData.eventNotes || [];

  // ── USER DROPS (journals, ideas, catchalls — NOT calendar events) ──
  const userDrops = allNotes
    .filter((n) => n.title && n.subtype !== 'event' && !n.archived)
    .slice(0, 15);

  const seenDropTitles = new Set();
  const dedupedDrops = userDrops.filter((n) => {
    const key = n.title.trim().toLowerCase();
    if (seenDropTitles.has(key)) return false;
    seenDropTitles.add(key);
    return true;
  });

  const dropDetails = dedupedDrops.map((n) => {
    const body = n.body ? ` — ${n.body.slice(0, 50)}` : '';
    const sub = n.subtype ? ` [${n.subtype}]` : '';
    const space = n.space_id ? inputData.spaces.find((s) => s.id === n.space_id) : null;
    const spaceName = space ? ` (${space.name})` : '';
    return `${n.title}${sub}${spaceName}${body}`;
  });

  // Mood signals from user drops only (not calendar events)
  const moods = userDrops.flatMap((n) => n.mood || []);
  const moodCounts = {};
  for (const m of moods) {
    moodCounts[m] = (moodCounts[m] || 0) + 1;
  }

  // ── TODAY'S CALENDAR (subtype=event, target_date=today, deduplicated, no cancelled) ──
  const seenTodayTitles = new Set();
  const todaysCalendar = allEventNotes
    .filter((n) => {
      if (!n.title) return false;
      if (!eventActiveOnDate(n, todayLocal)) return false;
      if (n.title.toLowerCase().startsWith('canceled:')) return false;
      if (n.title.toLowerCase().startsWith('cancelled:')) return false;
      const key = n.title.trim().toLowerCase();
      if (seenTodayTitles.has(key)) return false;
      seenTodayTitles.add(key);
      return true;
    })
    .map((n) => n.title);

  // ── THIS WEEK'S CALENDAR (target_date > today, deduplicated, no cancelled) ──
  const seenWeekTitles = new Set();
  const weekCalendar = allEventNotes
    .filter((n) => {
      if (!n.title) return false;
      if (!n.target_date) return false;
      if (eventActiveOnDate(n, todayLocal)) return false;
      if (!(n.target_date > todayLocal || (n.end_date && n.end_date > todayLocal))) return false;
      if (n.title.toLowerCase().startsWith('canceled:')) return false;
      if (n.title.toLowerCase().startsWith('cancelled:')) return false;
      const key = n.title.trim().toLowerCase();
      if (seenWeekTitles.has(key)) return false;
      seenWeekTitles.add(key);
      return true;
    })
    .slice(0, 10)
    .map((n) => {
      const space = n.space_id ? inputData.spaces.find((s) => s.id === n.space_id) : null;
      const spaceName = space ? ` (${space.name})` : '';
      return `${n.title}: ${n.target_date}${spaceName}`;
    });

  // ── TODOS ──
  const todosCompleted = inputData.todos.filter((t) => t.status === 'completed').length;
  const todosOverdue = inputData.todos.filter(
    (t) => t.target_date && t.target_date < todayLocal && t.status !== 'completed',
  ).length;
  const todosActive = inputData.todos.filter((t) => t.status === 'active').length;

  // ── HABITS ──
  const habitCompletions = {};
  for (const hp of inputData.habitProgress) {
    habitCompletions[hp.habit_id] = (habitCompletions[hp.habit_id] || 0) + 1;
  }

  const habitsFormatted = inputData.habits.map((h) => ({
    name: h.name,
    frequency: h.frequency,
    done: habitCompletions[h.id] || 0,
  }));

  // ── MILESTONES ──
  const milestones = (inputData.milestones || []).slice(0, 10).map((m) => {
    const space = inputData.spaces.find((s) => s.id === m.space_id);
    const spaceName = space ? ` (${space.name})` : '';
    const status = m.completed ? ' [DONE]' : '';
    return `${m.name}: ${m.date || 'no date'}${spaceName}${status}`;
  });

  // ── SPACES ──
  const spaceNames = inputData.spaces.map((s) => s.name);

  // ── BUILD THE DATA PAYLOAD WITH CLEARLY SEPARATED SECTIONS ──
  const dataPayload = `TODAY'S DATE: ${todayLocal}
USER TIMEZONE: ${inputData.timezone}

TODAY'S CALENDAR:
${todaysCalendar.length > 0 ? todaysCalendar.join('\n') : 'No events today'}

UPCOMING THIS WEEK:
${weekCalendar.length > 0 ? weekCalendar.join('\n') : 'Nothing scheduled'}

RECENT USER DROPS (journals, ideas, captures — NOT calendar events):
${dropDetails.length > 0 ? dropDetails.join('\n') : 'No recent drops'}

MOOD SIGNALS FROM DROPS: ${Object.entries(moodCounts).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}

TODOS: ${todosActive} active, ${todosCompleted} completed recently, ${todosOverdue} overdue

HABITS: ${habitsFormatted.length > 0 ? JSON.stringify(habitsFormatted) : 'none'}

MILESTONES: ${milestones.length > 0 ? milestones.join('; ') : 'none'}

ACTIVE SPACES: ${spaceNames.join(', ') || 'none'}

WEEKLY DIGEST: ${inputData.weeklySummary || 'none'}`;

  const systemPrompt = `You are a structured fact extractor. Given a 7-day data snapshot from a productivity app, extract ONLY observable facts. Never interpret, score, or infer feelings.

Output JSON:
{
  "people_mentioned": ["name1", "name2"],
  "places_mentioned": ["place1"],
  "active_projects_or_trips": ["label1"],
  "drop_count_7d": number,
  "completed_count_7d": number,
  "overdue_count": number,
  "habit_completions": [{"name": "X", "done": N, "frequency": "daily"}],
  "mood_signals": {"mood": count},
  "key_events_with_dates": [{"title": "X", "date": "YYYY-MM-DD", "space": "space name"}],
  "notable_drop_titles": ["title1", "title2"],
  "emotional_themes": ["theme1", "theme2"],
  "spaces_active": ["space1"],
  "todays_event_count": number,
  "todays_events": ["event title 1", "event title 2"]
}

Rules:
- Only include people/places/projects explicitly named in the data
- Do not invent or assume anything not present
- Keep arrays empty if no data found
- Extract recurring emotional themes from drop content if they appear across multiple drops or are strongly expressed in one
- Keep arrays empty if nothing stands out
- Output ONLY valid JSON, nothing else`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataPayload },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('DCO extraction timed out after 30s');
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`DCO extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  const EXTRACTION_FALLBACK = {
    people_mentioned: [],
    places_mentioned: [],
    active_projects_or_trips: [],
    drop_count_7d: 0,
    completed_count_7d: 0,
    overdue_count: 0,
    habit_completions: [],
    mood_signals: {},
    key_events_with_dates: [],
    notable_drop_titles: [],
    spaces_active: [],
  };

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseErr) {
    // Try to fix common truncation: missing closing brace
    let fixed = content.trim();
    if (!fixed.endsWith('}')) {
      fixed += '}';
    }
    try {
      parsed = JSON.parse(fixed);
      console.warn('[DCO:Nano] Recovered truncated JSON after appending }');
    } catch {
      console.error('[DCO:Nano] JSON parse failed, using fallback. Raw:', content.slice(0, 200));
      parsed = EXTRACTION_FALLBACK;
    }
  }

  const latency = Date.now() - t0;

  console.log(`[DCO:Nano] Extraction complete in ${latency}ms`);
  return parsed;
}

// ============================================================================
// DCO analysis (gpt-4.1-mini)
// ============================================================================

async function runDcoAnalysis(extraction, inputData, env) {
  const t0 = Date.now();

  const systemPrompt = `You are Gremly's daily context engine. Your job is to produce a Daily 
Context Object (DCO) — a snapshot of what TODAY looks like for the user.

TODAY is the primary focus. Everything else is context.

INPUT HIERARCHY — in order of importance:
1. DOMINANT LIFE CONTEXT — carried from the previous DCO and updated 
   by today's data. This is the lens through which everything else is 
   evaluated. The headline should reflect this context.
2. TODAY'S NEW DATA (drops, completions, calendar events) — evaluated 
   through the lens of the dominant life context. Calendar events are 
   only relevant to the headline if they are meaningful within the 
   current life context. Recurring work meetings during a life event 
   are not meaningful. The DCO generates before the user's day starts, 
   so drops in the extraction are from yesterday — they inform deltas, 
   not the headline.
3. PREVIOUS DCO — accumulated understanding. Location, life_moment, 
   tone carry forward unless today's data shows a change.
4. PREVIOUS EXTRACTION — scan for items that may have become 
   time-relevant today.

${inputData.previousDco ? `PREVIOUS DCO:
${JSON.stringify(inputData.previousDco, null, 2)}` : 'No previous DCO available (new user or first generation).'}

${inputData.previousExtraction ? `PREVIOUS EXTRACTION (scan for items that may now be time-relevant):
${JSON.stringify(inputData.previousExtraction, null, 2)}` : ''}

${inputData.userProfile ? `USER PROFILE (durable identity):
${inputData.userProfile}` : 'No user profile available yet.'}

USER TIMEZONE: ${inputData.timezone}
TODAY'S DATE: ${inputData.todayLocal}

Output this exact JSON shape:
{
  "life_moment": "short phrase — the single dominant context only" | null,
  "life_moment_confidence": "high" | "medium" | "low",
  "tone": "relaxed" | "focused" | "stretched" | "recovering" | "celebratory",
  "brief_headline": "one-liner Gremly says to the user about today" | null,
  "named_anchors": [{"label": "Name", "type": "person|trip|project|event", "source": "drop|space"}],
  "active_today": {
    "overdue_todos": number,
    "habit_streak_risk": ["habit names at risk"],
    "upcoming_in_7d": ["event or date descriptions"]
  },
  "deltas": {
    "drop_velocity": "high" | "normal" | "low",
    "habit_health": "high" | "normal" | "low",
    "mood_signal": "positive" | "neutral" | "negative" | "mixed",
    "notable_change": "one sentence describing the most notable change vs recent baseline" | null
  },
  "weekly_digest": "one sentence summary" | null
}

CRITICAL RULES:
1. TODAY WINS. If today's data shows a travel event, location change, or 
   any shift from the previous DCO, today's data takes priority. The 
   previous DCO is context, not truth.

2. LIFE_MOMENT IS SINGULAR. One dominant thing only. No combining threads 
   with "balancing", "while", "amid", "with ongoing". Secondary threads 
   belong in deltas and weekly_digest.

3. DELTA RULE. Compare against the previous DCO. If no previous DCO 
   exists, note this is a first impression.

4. VOICE RULE for brief_headline. Write as Gremly speaking directly to 
   the user. Short, warm, situationally specific. No exclamation marks. 
   No corporate motivational tone. No third person. No habit statuses, 
   fitness references, or work mentions during a life event — those 
   belong in deltas and weekly_digest only.
   The DCO generates before the user's day starts. The headline is about 
   what today holds — calendar events, current location, current life 
   context — not what the user did yesterday. Yesterday's activity 
   informs deltas and weekly_digest only.

5. ANTI-GENERIC RULE. If nothing specific stands out, set brief_headline 
   to null. Silence is better than filler.

6. TONE REFLECTS THE DOMINANT CONTEXT. Tone follows the dominant 
   life_moment, not secondary signals. If the dominant context is a major 
   life event, that event determines the tone — even if journal entries 
   contain stress or anxiety. Those are secondary emotional threads, not 
   the context itself.

7. ROUTINE WEEK STRATEGY. When there is no standout life event, do not 
   force a dramatic life_moment. Set life_moment to a practical summary, 
   set confidence to "low", and make the headline about what is practically 
   relevant today. Vary the structure day to day.

8. SPARSE DATA STRATEGY. When there is very little new data, look for 
   patterns and changes from the previous DCO. Reference streaks, trends, 
   or space activity shifts. If there is genuinely nothing new, it is 
   better to return null for brief_headline than to repeat yesterday.

9. named_anchors: only include proper nouns explicitly present in the data. 
   Never invent people or places.

Output ONLY valid JSON, nothing else.`;

  const extractionPayload = JSON.stringify(extraction, null, 2);

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `TODAY'S EXTRACTION (new since last DCO):\n${extractionPayload}` }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 4096,
        },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`DCO analysis failed: ${response.status} ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();

  // Gemini response: find the text part (skip thinking parts)
  const candidate = data.candidates?.[0];
  let content = '{}';
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text && !part.thought) {
        content = part.text;
        break;
      }
    }
  }

  // Clean potential markdown fences
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let dco;
  try {
    dco = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[DCO:Gemini] JSON parse failed. Raw content (first 500 chars):', content.slice(0, 500));
    console.error('[DCO:Gemini] Cleaned jsonStr (first 500 chars):', jsonStr.slice(0, 500));
    throw new Error(`${parseErr.message} | raw_start: ${jsonStr.slice(0, 200)}`);
  }

  // Log token usage
  const usage = data.usageMetadata;
  if (usage) {
    console.log(`[DCO:Gemini] Tokens — input: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount}, thinking: ${usage.thoughtsTokenCount || 0}, total: ${usage.totalTokenCount}`);
  }

  const latency = Date.now() - t0;

  console.log(`[DCO:Gemini] Analysis complete in ${latency}ms`, {
    life_moment: dco.life_moment,
    tone: dco.tone,
    has_headline: !!dco.brief_headline,
  });

  // Attach token usage metadata (not persisted, used by callers for logging)
  dco._token_usage = usage ? {
    input: usage.promptTokenCount,
    output: usage.candidatesTokenCount,
    thinking: usage.thoughtsTokenCount || 0,
    total: usage.totalTokenCount,
  } : null;
  dco._latency_ms = latency;

  // Attach metadata
  dco.user_id = inputData.userId;
  dco.date = inputData.todayLocal;
  dco.generated_at = new Date().toISOString();
  dco.ttl_days = 7;
  dco.today_focus = null; // Populated later by Morning Brief
  dco.input_sources = ['todos', 'habits', 'notes', 'spaces'];
  if (inputData.weeklySummary) dco.input_sources.push('weekly_summary');
  dco.model_used = 'gemini-2.5-flash';

  return dco;
}

// ============================================================================
// Core synthesis logic
// ============================================================================

async function synthesizeUserProfile(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Parallel fetch: structured data + chat messages
    const [todos, habits, habitProgress, notes, spaces, spaceChatMessages, overrides] =
      await Promise.all([
        // Todos (90 days) - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${ninetyDaysAgo()}&select=title,completed_at,archived,views&limit=200`,
          { headers },
        ).then((r) => r.json()),

        // Habits - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,views&limit=20`,
          { headers },
        ).then((r) => r.json()),

        // Habit progress (30 days)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${thirtyDaysAgo()}&select=habit_id,occurred_day`,
          { headers },
        ).then((r) => r.json()),

        // Notes (30 days) - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${thirtyDaysAgo()}&select=title,subtype,mood,views&limit=50`,
          { headers },
        ).then((r) => r.json()),

        // Spaces
        fetch(
          `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=name&limit=10`,
          { headers },
        ).then((r) => r.json()),

        // Space chat messages (user role only, last 30 days)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&created_at=gte.${thirtyDaysAgo()}&select=content&limit=100`,
          { headers },
        ).then((r) => r.json()),

        // User profile overrides (add/remove facts)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`,
          { headers },
        )
          .then((r) => r.json())
          .catch(() => []),
      ]);

    // ========================================================================
    // Part 1: Pattern Analysis
    // ========================================================================

    // Habit completion rates
    const habitIds = habits.map((h) => h.id);
    const habitCompletionMap = {};
    for (const hp of habitProgress) {
      habitCompletionMap[hp.habit_id] = (habitCompletionMap[hp.habit_id] || 0) + 1;
    }

    const habitsWithCompletion = habits.map((h) => ({
      name: h.name,
      frequency: h.frequency,
      completions: habitCompletionMap[h.id] || 0,
      expected: getExpectedCompletions(h.frequency),
    }));

    // Todo completion rate
    const doneCount = todos.filter((t) => t.completed_at || t.archived).length;

    // Mood patterns
    const moodCounts = {};
    for (const note of notes) {
      if (note.mood && Array.isArray(note.mood)) {
        for (const m of note.mood) {
          moodCounts[m] = (moodCounts[m] || 0) + 1;
        }
      }
    }

    // ========================================================================
    // Part 2: Extract User Messages from All Chat Sources
    // ========================================================================

    const userMessages = [];

    // Space chat messages (already filtered to user role)
    for (const msg of spaceChatMessages) {
      if (msg.content) {
        userMessages.push(msg.content);
      }
    }

    // Entity chat messages from todos
    for (const todo of todos) {
      const messages = extractEntityChatMessages(todo.views);
      userMessages.push(...messages);
    }

    // Entity chat messages from habits
    for (const habit of habits) {
      const messages = extractEntityChatMessages(habit.views);
      userMessages.push(...messages);
    }

    // Entity chat messages from notes
    for (const note of notes) {
      const messages = extractEntityChatMessages(note.views);
      userMessages.push(...messages);
    }

    console.log(
      `[User ${userId.slice(0, 8)}] Found ${userMessages.length} user messages for fact extraction`,
    );

    // ========================================================================
    // Part 3: Two-Pass LLM Synthesis
    // ========================================================================

    // Pass 1: Pattern profile
    const patternInput = {
      todoCount: todos.length,
      completedCount: doneCount,
      habits: habitsWithCompletion,
      moodPatterns: moodCounts,
      spaces: spaces.map((s) => s.name),
    };

    const patternProfile = await synthesizePatterns(patternInput, env.OPENAI_API_KEY);

    // Pass 2: Fact extraction (only if we have messages)
    let extractedFacts = [];
    if (userMessages.length > 0) {
      extractedFacts = await extractFacts(userMessages, env.OPENAI_API_KEY);
    }

    // Apply user overrides to extracted facts
    if (overrides && overrides.length > 0) {
      // Remove facts the user deleted
      const removedFacts = overrides
        .filter((o) => o.action === 'remove')
        .map((o) => o.fact_text.toLowerCase());

      extractedFacts = extractedFacts.filter(
        (fact) =>
          !removedFacts.some(
            (removed) =>
              fact.toLowerCase().includes(removed) || removed.includes(fact.toLowerCase()),
          ),
      );

      // Add facts the user added
      const addedFacts = overrides.filter((o) => o.action === 'add').map((o) => o.fact_text);

      extractedFacts = [...extractedFacts, ...addedFacts];

      console.log(`[User ${userId.slice(0, 8)}] Applied ${overrides.length} overrides`);
    }

    // Combine into final profile
    const finalProfile = combineProfile(patternProfile, extractedFacts);

    // ========================================================================
    // Part 4: Store Result
    // ========================================================================

    // Check if profile exists (for setting relationship_started_at on first synthesis)
    const existingProfile = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_id`,
      { headers },
    ).then((r) => r.json());

    const profileData = {
      user_id: userId,
      profile_text: finalProfile,
      signals: {
        patterns: patternInput,
        facts: extractedFacts,
        message_count: userMessages.length,
        overrides_applied: overrides?.length || 0,
      },
      generated_at: new Date().toISOString(),
      model_used: 'gpt-4o-mini',
    };

    // Set relationship start on first synthesis
    if (!existingProfile || existingProfile.length === 0) {
      profileData.relationship_started_at = await getFirstActivityDate(userId, env);
      console.log(
        `[SynthesizeProfiles] First synthesis for ${userId.slice(0, 8)}, relationship started: ${profileData.relationship_started_at}`,
      );
    }

    const upsertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(profileData),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Failed to store profile: ${upsertResponse.statusText}`);
    }

    console.log(`[SynthesizeProfiles] Completed for user ${userId.slice(0, 8)}`);
    return { success: true };
  } catch (error) {
    console.error(`[SynthesizeProfiles] Error for user ${userId.slice(0, 8)}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Helper: Extract user messages from entity views.chat
// ============================================================================

function extractEntityChatMessages(views) {
  const messages = [];

  if (!views || !views.chat || !views.chat.messages) {
    return messages;
  }

  for (const msg of views.chat.messages) {
    if (msg.role === 'user' && msg.content) {
      messages.push(msg.content);
    }
  }

  return messages;
}

// ============================================================================
// Helper: Expected completions by frequency
// ============================================================================

function getExpectedCompletions(frequency) {
  switch (frequency) {
    case 'daily':
      return 30;
    case 'weekly':
      return 4;
    case '2x/week':
      return 8;
    case '3x/week':
      return 12;
    case '4x/week':
      return 16;
    case '5x/week':
      return 20;
    case '6x/week':
      return 24;
    case '5x/month':
      return 5;
    case 'monthly':
      return 1;
    default:
      return 30; // assume daily if unknown
  }
}

function getExpectedCompletionsForDays(frequency, days) {
  switch (frequency) {
    case 'daily': return days;
    case 'weekly': return Math.ceil(days / 7);
    case '2x/week': return Math.ceil((days / 7) * 2);
    case '3x/week': return Math.ceil((days / 7) * 3);
    case '4x/week': return Math.ceil((days / 7) * 4);
    case '5x/week': return Math.ceil((days / 7) * 5);
    case '6x/week': return Math.ceil((days / 7) * 6);
    case '5x/month': return Math.ceil((days / 30) * 5);
    case 'monthly': return days >= 30 ? 1 : 0;
    default: return days;
  }
}

// ============================================================================
// LLM: Pattern synthesis
// ============================================================================

async function synthesizePatterns(input, apiKey) {
  const habitSummary =
    input.habits.length > 0
      ? input.habits
          .map((h) => `"${h.name}" ${h.completions}/${h.expected} (${h.frequency})`)
          .join(', ')
      : 'None tracked';

  const moodSummary =
    Object.keys(input.moodPatterns).length > 0
      ? Object.entries(input.moodPatterns)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : 'No mood data';

  const prompt = `You are writing notes for a supportive companion about someone they care about.

DATA:
- Todos: ${input.todoCount} total, ${input.completedCount} completed or archived (90 days)
- Habits (30 days): ${habitSummary}
- Mood patterns: ${moodSummary}
- Life areas: ${input.spaces.join(', ') || 'None defined'}

Write a warm, supportive profile (~100-150 words) that:
1. Leads with what they care about (interests, life areas) — not metrics
2. Treats low habit completion as totally normal for new habits
3. Highlights any positive patterns, however small
4. If there is struggle, frame it as "building" or "working on"

EXAMPLES (good vs bad):
❌ "Struggling to engage with wellness habits, lots of unmet commitments"
✅ "Building several wellness habits — all still early. Showing up for meditation most consistently."

❌ "Low completion rate suggests difficulty following through"
✅ "Has a lot on their plate across work and personal life — still finding their rhythm"

Output ONLY the profile text, no headers.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[synthesizePatterns] OpenAI request timed out after 90s');
    }
    throw err;
  }
}

// ============================================================================
// LLM: Fact extraction from chat messages
// ============================================================================

async function extractFacts(messages, apiKey) {
  // Combine messages, truncate if too long
  const combinedText = messages.slice(0, 50).join('\n---\n');

  const prompt = `Extract personal facts about this user from their messages. Look for:
- Job, career, work situation
- Relationships, family
- Health conditions or challenges (physical, mental)
- Goals and aspirations
- Location or living situation
- Hobbies and interests
- Life circumstances

USER MESSAGES:
${combinedText}

RULES:
- Only include facts they explicitly stated or strongly implied
- Be specific (e.g., "works at an ad agency" not "has a job")
- Ignore generic requests/questions that don't reveal personal info
- Output as a JSON array of strings, e.g., ["works in tech", "has ADHD", "lives in LA"]
- If no personal facts found, output empty array: []

Output ONLY the JSON array, no explanation.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3, // Lower temp for extraction
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI error (facts): ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    try {
      return JSON.parse(content);
    } catch {
      console.warn('Failed to parse facts JSON:', content);
      return [];
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[extractFacts] OpenAI request timed out after 90s');
    }
    throw err;
  }
}

// ============================================================================
// Combine pattern profile with extracted facts
// ============================================================================

function combineProfile(patternProfile, facts) {
  if (!facts || facts.length === 0) {
    return patternProfile;
  }

  // Add facts section
  const factsSection = `\n\nPersonal context: ${facts.join('. ')}.`;

  return patternProfile + factsSection;
}

// ============================================================================
// Helper: Get first activity date for relationship_started_at
// ============================================================================

async function getFirstActivityDate(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };

  // Get earliest activity across all tables
  const [todos, habits, notes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
  ]);

  const dates = [todos[0]?.created_at, habits[0]?.created_at, notes[0]?.created_at].filter(Boolean);

  return dates.length > 0
    ? new Date(Math.min(...dates.map((d) => new Date(d)))).toISOString()
    : new Date().toISOString();
}

// ============================================================================
// Space Suggestions Generation
// ============================================================================

async function generateSpaceSuggestions(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    console.log(`[SpaceSuggestions] Starting for user: ${userId}`);

    // Step 1: Check if user has enable_space_suggestions = true
    const userProfileResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=enable_space_suggestions`,
      { headers },
    );
    const userProfiles = await userProfileResponse.json();
    const enableSuggestions = userProfiles[0]?.enable_space_suggestions ?? true;

    console.log(`[SpaceSuggestions] User setting enabled: ${enableSuggestions}`);

    if (!enableSuggestions) {
      return { success: true, skipped: 'user_disabled' };
    }

    // Step 2: Fetch ALL user's spaces (including disable_suggestions flag)
    const spacesResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name,disable_suggestions`,
      { headers },
    );
    const allSpacesData = await spacesResponse.json();

    // Ensure we have an array (Supabase returns error object on failure)
    const allSpaces = Array.isArray(allSpacesData) ? allSpacesData : [];
    if (!Array.isArray(allSpacesData)) {
      console.error('[SpaceSuggestions] Spaces query failed:', allSpacesData);
    }

    // Step 3: Fetch unassigned drops (last 14 days) with views data
    const fourteenDaysAgo = formatDateOnly(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

    const [unassignedTodos, unassignedNotes, unassignedHabits] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&completed_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&subtype=neq.journal&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,subtype,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=is.null&archived_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,name,tags,created_at,views&limit=20`,
        { headers },
      ).then((r) => r.json()),
    ]);

    // Combine and format unassigned entities
    const unassignedDrops = [
      ...unassignedTodos.map((t) => ({
        id: t.id,
        type: 'todo',
        subtype: null,
        title: t.title,
        body: t.body,
        tags: t.tags || [],
        keywords: t.views?.keywords || null,
        people: t.views?.people || null,
        mood: null,
        created_at: t.created_at,
      })),
      ...unassignedNotes.map((n) => ({
        id: n.id,
        type: 'note',
        subtype: n.subtype,
        title: n.title,
        body: n.body,
        tags: n.tags || [],
        keywords: n.views?.keywords || null,
        people: n.views?.people || null,
        mood: n.views?.mood || null,
        created_at: n.created_at,
      })),
      ...unassignedHabits.map((h) => ({
        id: h.id,
        type: 'habit',
        subtype: null,
        title: h.name,
        body: null,
        tags: h.tags || [],
        keywords: null,
        people: null,
        mood: null,
        created_at: h.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);

    console.log(
      `[SpaceSuggestions] Found ${allSpaces.length} spaces, ${unassignedDrops.length} unassigned drops`,
    );

    // Step 4: Check skip conditions
    if (unassignedDrops.length < 3) {
      console.log(`[SpaceSuggestions] Fewer than 3 unassigned drops, skipping`);
      return { success: true, skipped: 'too_few_drops' };
    }

    // Step 5: Build condensed profiles for each space (where disable_suggestions = false)
    const spacesForSuggestions = allSpaces.filter((s) => !s.disable_suggestions);
    const spaceProfiles = await Promise.all(
      spacesForSuggestions.map((space) => buildSpaceProfile(space, env, headers)),
    );

    console.log(`[SpaceSuggestions] Built profiles for ${spaceProfiles.length} spaces`);

    // Step 6: Call AI to generate suggestions
    const aiSuggestions = await callAIForSpaceSuggestions(
      spaceProfiles,
      unassignedDrops,
      env.OPENAI_API_KEY,
    );

    const assignCount = aiSuggestions.assign_to_existing?.length || 0;
    console.log(`[SpaceSuggestions] AI response: ${assignCount} assign suggestions`);

    // Step 7: Validate suggestions
    const validSpaceIds = new Set(spacesForSuggestions.map((s) => s.id));
    const validDropIds = new Set(unassignedDrops.map((e) => e.id));

    let filteredOut = 0;

    const validAssignSuggestions = (aiSuggestions.assign_to_existing || []).filter((s) => {
      if (!validSpaceIds.has(s.space_id)) {
        console.warn(`[SpaceSuggestions] Invalid space_id: ${s.space_id}`);
        filteredOut++;
        return false;
      }
      const originalCount = s.drop_ids?.length || 0;
      s.drop_ids = (s.drop_ids || []).filter((id) => validDropIds.has(id));
      if (s.drop_ids.length < originalCount) {
        console.warn(
          `[SpaceSuggestions] Filtered ${originalCount - s.drop_ids.length} invalid drop_ids`,
        );
      }
      return s.drop_ids.length > 0;
    });

    const validCount = validAssignSuggestions.length;
    console.log(`[SpaceSuggestions] Validation: ${validCount} valid, ${filteredOut} filtered out`);

    // Step 8: Expire old pending suggestions
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() }),
      },
    );

    // Step 9: Insert new suggestions
    const suggestionsToInsert = [];

    for (const s of validAssignSuggestions) {
      suggestionsToInsert.push({
        user_id: userId,
        suggestion_type: 'assign_to_space',
        space_id: s.space_id,
        suggested_name: null,
        reason: s.reason || null,
        drop_ids: s.drop_ids,
        confidence: s.confidence || 0.8,
        status: 'pending',
      });
    }

    if (suggestionsToInsert.length > 0) {
      const insertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/space_suggestions`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(suggestionsToInsert),
      });

      if (!insertResponse.ok) {
        console.error(`[SpaceSuggestions] Failed to insert: ${insertResponse.statusText}`);
        return { success: false, error: 'db_error' };
      }
    }

    console.log(`[SpaceSuggestions] Saved ${suggestionsToInsert.length} total suggestions`);
    console.log(`[SpaceSuggestions] Complete for user: ${userId}`);

    return {
      success: true,
      suggestions_created: {
        assign_to_existing: validAssignSuggestions.length,
      },
    };
  } catch (error) {
    console.error(`[SpaceSuggestions] Error for user ${userId}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Build condensed profile for a Space
// ============================================================================

async function buildSpaceProfile(space, env, headers) {
  // Fetch entities in this space
  const [todosData, notesData, habitsData] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?space_id=eq.${space.id}&archived=eq.false&select=title,tags,body`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?space_id=eq.${space.id}&archived=eq.false&select=title,tags,body,subtype`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?space_id=eq.${space.id}&archived=eq.false&select=name,tags`,
      { headers },
    ).then((r) => r.json()),
  ]);

  // Ensure arrays (Supabase returns error object on failure)
  const todos = Array.isArray(todosData) ? todosData : [];
  const notes = Array.isArray(notesData) ? notesData : [];
  const habits = Array.isArray(habitsData) ? habitsData : [];

  const allEntities = [
    ...todos.map((t) => ({ title: t.title, body: t.body, tags: t.tags || [] })),
    ...notes.map((n) => ({ title: n.title, body: n.body, tags: n.tags || [] })),
    ...habits.map((h) => ({ title: h.name, body: null, tags: h.tags || [] })),
  ];

  // Fetch recent chat themes
  const chatsResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/space_chats?space_id=eq.${space.id}&select=running_summary,context_json&order=updated_at.desc&limit=3`,
    { headers },
  );
  const chatsData = await chatsResponse.json();
  const chats = Array.isArray(chatsData) ? chatsData : [];

  const sampleTitles = allEntities
    .map((e) => e.title)
    .filter(Boolean)
    .slice(0, 10);

  return {
    space_id: space.id,
    name: space.name,
    goal: null, // goal column doesn't exist on spaces table
    target_date: null, // target_date column doesn't exist on spaces table
    top_tags: extractTopTags(allEntities, 10),
    top_keywords: extractTopKeywords(allEntities, 10),
    people_mentioned: extractPeopleFromEntities(allEntities, 5),
    chat_themes: extractChatThemes(chats, 3),
    item_count: allEntities.length,
    sample_titles: sampleTitles,
  };
}

// ============================================================================
// Helper: Extract top tags by frequency
// ============================================================================

function extractTopTags(entities, limit = 10) {
  const tagCounts = {};
  for (const e of entities) {
    if (Array.isArray(e.tags)) {
      for (const tag of e.tags) {
        const normalized = String(tag).toLowerCase().trim();
        if (normalized) {
          tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

// ============================================================================
// Helper: Extract top keywords from titles and bodies
// ============================================================================

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'up',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  's',
  't',
  'can',
  'will',
  'just',
  'don',
  'should',
  'now',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'it',
  'its',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'would',
  'could',
  'ought',
  "i'm",
  "you're",
  "he's",
  "she's",
  "it's",
  "we're",
  "they're",
  "i've",
  "you've",
  "we've",
  "they've",
  "i'd",
  "you'd",
  "he'd",
  "she'd",
  "we'd",
  "they'd",
  "i'll",
  "you'll",
  "he'll",
  "she'll",
  "we'll",
  "they'll",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "hasn't",
  "haven't",
  "hadn't",
  "doesn't",
  "don't",
  "didn't",
  "won't",
  "wouldn't",
  "shan't",
  "shouldn't",
  "can't",
  'cannot',
  "couldn't",
  "mustn't",
  "let's",
  "that's",
  "who's",
  "what's",
  "here's",
  "there's",
  "when's",
  "where's",
  "why's",
  "how's",
  'need',
  'get',
  'make',
  'go',
  'come',
  'take',
  'see',
  'know',
  'want',
  'look',
  'use',
  'find',
  'give',
  'tell',
  'work',
  'call',
  'try',
  'ask',
  'put',
  'keep',
  'let',
  'begin',
  'seem',
  'help',
  'show',
  'hear',
  'play',
  'run',
  'move',
  'live',
  'believe',
]);

function extractTopKeywords(entities, limit = 10) {
  const wordCounts = {};
  for (const e of entities) {
    const text = `${e.title || ''} ${e.body || ''}`.toLowerCase();
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// ============================================================================
// Helper: Extract people names from entities
// ============================================================================

function extractPeopleFromEntities(entities, limit = 5) {
  const names = new Set();

  // Common name patterns: Capitalized words that look like names
  const namePattern = /\b[A-Z][a-z]{2,}\b/g;

  for (const e of entities) {
    const text = `${e.title || ''} ${e.body || ''}`;
    const matches = text.match(namePattern) || [];
    for (const name of matches) {
      // Filter out common non-names
      if (
        ![
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
          'Today',
          'Tomorrow',
          'Yesterday',
          'Morning',
          'Evening',
          'Night',
          'Week',
          'Month',
          'Year',
        ].includes(name)
      ) {
        names.add(name);
      }
    }
  }

  return Array.from(names).slice(0, limit);
}

// ============================================================================
// Helper: Extract chat themes from space chats
// ============================================================================

function extractChatThemes(chats, limit = 3) {
  const themes = [];
  for (const chat of chats) {
    if (chat.running_summary) {
      // Take first sentence or first 50 chars
      const summary = chat.running_summary.split('.')[0].trim();
      if (summary && summary.length > 5) {
        themes.push(summary.slice(0, 100));
      }
    }
    if (chat.context_json?.topic) {
      themes.push(chat.context_json.topic);
    }
  }
  return [...new Set(themes)].slice(0, limit);
}

// ============================================================================
// AI call for space suggestions (uses gpt-4.1-mini for assign-to-existing suggestions)
// ============================================================================

async function callAIForSpaceSuggestions(spaceProfiles, unassignedDrops, apiKey) {
  // Build space profiles text
  let spacesText = '';
  if (spaceProfiles.length > 0) {
    for (const sp of spaceProfiles) {
      spacesText += `\nSpace: ${sp.name}\n`;
      spacesText += `Goal: ${sp.goal || 'not set'}\n`;
      spacesText += `Target date: ${sp.target_date || 'not set'}\n`;
      spacesText += `Contains ${sp.item_count} items\n`;
      spacesText += `Sample items: ${sp.sample_titles?.length > 0 ? sp.sample_titles.join(', ') : 'none'}\n`;
      spacesText += `Common tags: ${sp.top_tags.length > 0 ? sp.top_tags.join(', ') : 'none'}\n`;
      spacesText += `Common keywords: ${sp.top_keywords.length > 0 ? sp.top_keywords.join(', ') : 'none'}\n`;
      spacesText += `People mentioned: ${sp.people_mentioned.length > 0 ? sp.people_mentioned.join(', ') : 'none'}\n`;
      spacesText += `Recent chat themes: ${sp.chat_themes.length > 0 ? sp.chat_themes.join('; ') : 'none'}\n`;
      spacesText += `Space ID: ${sp.space_id}\n`;
    }
  } else {
    spacesText = '(No existing spaces)\n';
  }

  // Build unassigned drops text
  const dropsText = unassignedDrops
    .map((d) => {
      let line = `\nID: ${d.id}\n`;
      line += `Title: ${d.title}\n`;
      line += `Type: ${d.type}${d.subtype ? '/' + d.subtype : ''}\n`;
      line += `Tags: ${d.tags?.length > 0 ? d.tags.join(', ') : 'none'}\n`;
      line += `Keywords: ${d.keywords || 'none'}\n`;
      line += `People: ${d.people || 'none'}\n`;
      return line;
    })
    .join('');

  const systemPrompt = `You analyze a user's captured items and suggest which ones belong in their existing Spaces.

A Space is a container for something a person is actively working on, planning, or managing in their life. The defining quality of a good Space is that the person would open it regularly to check progress, add new items, or figure out what to do next.

Your job is to identify which unassigned items belong in existing Spaces. Items that don't clearly fit any existing Space should be left unassigned — that's completely fine.`;

  const userPrompt = `EXISTING SPACES:
${spacesText}
UNASSIGNED ITEMS:
${dropsText}

ANALYSIS CRITERIA:
IMPORTANT: Be generous when assigning to existing Spaces. If an item could plausibly be part of an existing Space based on its title, topic, or context, assign it there. For example, if a Space contains app development tasks like 'Fix Lock-in Button' and 'Build Mind Drop Widget', then an item like 'Plan Your Tomorrow Section' clearly belongs in that same Space even if the keywords don't overlap exactly. Think about WHAT the items are about, not just whether tags match.

To determine if an item belongs in a Space, consider (in priority order):
1. SPACE PURPOSE: Does the item relate to the Space's name and goal?
2. ENTITY OVERLAP: Does the item reference projects or topics present in the Space?
3. KEYWORD/TAG OVERLAP: Do the item's keywords or tags match the Space's common ones?
4. DOMAIN FIT: Is the item in the same general life domain as the Space?
5. PEOPLE OVERLAP: Does the item mention people associated with the Space?
   (Weight this higher if the Space itself is about specific people)

Items that don't clearly fit any existing Space should be left unassigned.

CONFIDENCE SCORING:
- 90-100%: Clearly belongs based on Space purpose OR strong entity/keyword match
- 80-89%: Good fit based on multiple signals aligning
- 70-79%: Reasonable fit, some signals present
- Below 70%: Don't include

OUTPUT (JSON only, no explanation):
{
  "assign_to_existing": [
    {
      "space_id": "uuid",
      "drop_ids": ["uuid", "uuid"],
      "reason": "why these items belong in this Space",
      "confidence": 0.85
    }
  ]
}

Order results by confidence (highest first).
If no suggestions meet criteria, return an empty array.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[SpaceSuggestions] OpenAI error: ${response.statusText}`);
      return { assign_to_existing: [] };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    console.log('[SpaceSuggestions] Raw AI response:', content.slice(0, 200));

    try {
      // Parse JSON, handling markdown code fences
      let jsonStr = content;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[SpaceSuggestions] Failed to parse AI response:', content);
      return { assign_to_existing: [] };
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[callAIForSpaceSuggestions] OpenAI request timed out after 90s');
    }
    throw err;
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
// Life Map: Full historical snapshot (bootstrap only — fetches ALL data)
// ============================================================================

async function fetchFullHistoricalSnapshot(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const [
    todos, notes, habits, habitProgress, spaces,
    milestones, spaceChatMessages, userProfileRows,
    weeklySummaries, dcoHistory, overrides,
  ] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&select=id,title,name,status,completed_at,space_id,created_at,tags,target_date,archived&order=created_at.asc&limit=1000`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&select=id,title,body,subtype,mood,space_id,created_at,target_date,is_goal,archived&order=created_at.asc&limit=1000`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=id,name,frequency,space_id,created_at,archived,completed_at,commitment,subtype&order=created_at.asc&limit=100`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&select=habit_id,occurred_day&order=occurred_day.asc&limit=5000`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&select=id,name,archived_at,created_at&order=created_at.asc`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&select=id,title,name,date,space_id,completed,is_active,completed_at&order=date.asc`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&select=content,created_at,space_id&order=created_at.desc&limit=200`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,signals`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&select=week_start_date,week_end_date,content,stats_snapshot,key_themes&order=week_start_date.asc`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&select=date,dco&order=date.desc&limit=30`, { headers }).then(r => r.json()),
    fetch(`${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`, { headers }).then(r => r.json()).catch(() => []),
  ]);

  const safeArr = v => (Array.isArray(v) ? v : []);

  return {
    userId,
    todos: safeArr(todos),
    notes: safeArr(notes),
    habits: safeArr(habits),
    habitProgress: safeArr(habitProgress),
    spaces: safeArr(spaces),
    milestones: safeArr(milestones),
    chatMessages: safeArr(spaceChatMessages),
    profile: userProfileRows?.[0] || null,
    weeklySummaries: safeArr(weeklySummaries),
    dcoHistory: safeArr(dcoHistory),
    overrides: safeArr(overrides),
  };
}

// ============================================================================
// Life Map: Compress snapshot into token-efficient payload for Sonnet
// ============================================================================

function compressSnapshotForBootstrap(snapshot) {
  const spaceMap = {};
  for (const s of snapshot.spaces) {
    spaceMap[s.id] = s.name;
  }

  // --- Spaces with entity inventory ---
  const spaceSections = snapshot.spaces.map(s => {
    const spaceTodos = snapshot.todos.filter(t => t.space_id === s.id && !t.archived);
    const spaceNotes = snapshot.notes.filter(n => n.space_id === s.id && !n.archived && n.subtype !== 'event');
    const spaceHabits = snapshot.habits.filter(h => h.space_id === s.id);
    const spaceMilestones = snapshot.milestones.filter(m => m.space_id === s.id);
    const active = spaceTodos.filter(t => t.status === 'active').length;
    const completed = spaceTodos.filter(t => t.completed_at).length;

    let section = `SPACE: "${s.name}"${s.archived_at ? ' [ARCHIVED]' : ''}\n`;
    section += `  Todos: ${active} active, ${completed} completed\n`;
    if (spaceTodos.length > 0) {
      section += `  Recent todos: ${spaceTodos.slice(-10).map(t => `${t.title || t.name} [${t.status}]`).join('; ')}\n`;
    }
    if (spaceNotes.length > 0) {
      section += `  Notes (${spaceNotes.length}): ${spaceNotes.slice(-8).map(n => {
        const mood = n.mood?.length > 0 ? ` (mood: ${n.mood.join(',')})` : '';
        const body = n.subtype === 'journal' && n.body ? ` — "${n.body.slice(0, 200)}"` : '';
        return `[${n.subtype || 'note'}] ${n.title}${mood}${body}`;
      }).join('; ')}\n`;
    }
    if (spaceHabits.length > 0) {
      section += `  Habits: ${spaceHabits.map(h => `${h.name} (${h.frequency})${h.archived ? ' [archived]' : ''}`).join(', ')}\n`;
    }
    if (spaceMilestones.length > 0) {
      section += `  Milestones: ${spaceMilestones.map(m => `${m.title || m.name}: ${m.date}${m.completed ? ' ✓' : ''}`).join('; ')}\n`;
    }
    return section;
  }).join('\n');

  // --- Unassigned items ---
  const unassignedTodos = snapshot.todos.filter(t => !t.space_id && !t.archived);
  const unassignedNotes = snapshot.notes.filter(n => !n.space_id && !n.archived && n.subtype !== 'event');

  let unassignedSection = '';
  if (unassignedTodos.length > 0 || unassignedNotes.length > 0) {
    unassignedSection = `UNASSIGNED ITEMS:\n`;
    if (unassignedTodos.length > 0) {
      unassignedSection += `  Todos (${unassignedTodos.length}): ${unassignedTodos.slice(-15).map(t => `${t.title || t.name} [${t.status}]`).join('; ')}\n`;
    }
    if (unassignedNotes.length > 0) {
      unassignedSection += `  Notes (${unassignedNotes.length}): ${unassignedNotes.slice(-10).map(n => {
        const mood = n.mood?.length > 0 ? ` (mood: ${n.mood.join(',')})` : '';
        return `[${n.subtype || 'note'}] ${n.title}${mood}`;
      }).join('; ')}\n`;
    }
  }

  // --- Journals (full — these are the richest signal) ---
  const journals = snapshot.notes
    .filter(n => n.subtype === 'journal' && !n.archived)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const journalSection = journals.length > 0
    ? 'ALL JOURNAL ENTRIES (chronological):\n' + journals.map(j => {
        const date = j.created_at?.split('T')[0] || 'unknown';
        const mood = j.mood?.length > 0 ? ` [mood: ${j.mood.join(', ')}]` : '';
        const space = j.space_id ? ` (${spaceMap[j.space_id] || 'unknown space'})` : '';
        const body = j.body ? `\n  "${j.body.slice(0, 300)}"` : '';
        return `${date}: ${j.title}${mood}${space}${body}`;
      }).join('\n')
    : '';

  // --- Habit completion patterns ---
  const habitSection = snapshot.habits.length > 0
    ? 'HABITS AND COMPLETION HISTORY:\n' + snapshot.habits.map(h => {
        const completions = snapshot.habitProgress.filter(hp => hp.habit_id === h.id);
        const totalDone = completions.length;
        const space = h.space_id ? ` [${spaceMap[h.space_id] || 'space'}]` : '';
        const status = h.archived ? ' [ARCHIVED]' : '';

        // Weekly completion pattern (last 8 weeks)
        const weeks = {};
        for (const c of completions) {
          const d = new Date(c.occurred_day + 'T00:00:00Z');
          const weekStart = new Date(d);
          weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
          const wk = weekStart.toISOString().split('T')[0];
          weeks[wk] = (weeks[wk] || 0) + 1;
        }
        const weekPattern = Object.entries(weeks).slice(-8).map(([w, c]) => `${w}:${c}`).join(', ');

        return `- ${h.name} (${h.frequency})${space}${status}: ${totalDone} total completions. Weekly: ${weekPattern || 'none'}`;
      }).join('\n')
    : '';

  // --- Calendar events timeline (deduplicated) ---
  const events = snapshot.notes
    .filter(n => n.subtype === 'event' && !n.archived)
    .sort((a, b) => (a.target_date || a.created_at || '').localeCompare(b.target_date || b.created_at || ''));

  const seenEvents = new Set();
  const dedupedEvents = events.filter(e => {
    const key = `${(e.title || '').toLowerCase().trim()}|${e.target_date}`;
    if (seenEvents.has(key)) return false;
    seenEvents.add(key);
    return true;
  });

  const eventSection = dedupedEvents.length > 0
    ? 'CALENDAR EVENTS TIMELINE:\n' + dedupedEvents.slice(-60).map(e => {
        const space = e.space_id ? ` [${spaceMap[e.space_id] || 'space'}]` : '';
        return `${e.target_date || 'no date'}: ${e.title}${space}`;
      }).join('\n')
    : '';

  // --- Weekly summaries (highest quality pre-digested context) ---
  const weeklySummarySection = snapshot.weeklySummaries.length > 0
    ? 'WEEKLY SUMMARIES (AI-generated, chronological — treat as high-quality context):\n' +
      snapshot.weeklySummaries.map(ws => {
        const themes = ws.key_themes?.length > 0 ? `Themes: ${ws.key_themes.join(', ')}` : '';
        // Extract the narrative content from the content JSONB
        let narrative = '';
        if (ws.content) {
          if (typeof ws.content === 'string') narrative = ws.content;
          else if (ws.content.narrative) narrative = ws.content.narrative;
          else if (ws.content.summary) narrative = ws.content.summary;
          else if (ws.content.sections) {
            narrative = Object.values(ws.content.sections || {}).filter(v => typeof v === 'string').join(' ');
          }
          // Fallback: stringify the whole thing but truncate
          if (!narrative && typeof ws.content === 'object') {
            narrative = JSON.stringify(ws.content).slice(0, 1500);
          }
        }
        return `WEEK OF ${ws.week_start_date} to ${ws.week_end_date}:\n${themes}\n${narrative}`;
      }).join('\n\n')
    : '';

  // --- User profile ---
  const profileSection = snapshot.profile?.profile_text
    ? `USER PROFILE:\n${snapshot.profile.profile_text}`
    : '';

  // --- Chat message themes (compressed — just user messages for fact context) ---
  const chatSection = snapshot.chatMessages.length > 0
    ? 'USER CHAT MESSAGES (most recent, for personal context):\n' +
      snapshot.chatMessages.slice(0, 50).map(m => {
        const space = m.space_id ? ` [${spaceMap[m.space_id] || 'space'}]` : '';
        return `${m.created_at?.split('T')[0] || ''}${space}: ${(m.content || '').slice(0, 200)}`;
      }).join('\n')
    : '';

  return [
    profileSection,
    spaceSections,
    unassignedSection,
    habitSection,
    journalSection,
    eventSection,
    weeklySummarySection,
    chatSection,
  ].filter(Boolean).join('\n\n');
}

// ============================================================================
// Life Map: Bootstrap (one-time Sonnet call to build initial Life Map)
// ============================================================================

async function bootstrapLifeMap(snapshot, env) {
  const t0 = Date.now();
  const compressedData = compressSnapshotForBootstrap(snapshot);

  const spaceList = snapshot.spaces
    .filter(s => !s.archived_at)
    .map(s => `"${s.name}" (id: ${s.id})`)
    .join(', ');

  const systemPrompt = `You are building the initial Life Map for a user of Gremly, a productivity companion app. This is a ONE-TIME bootstrap from their full history (~2 months of data). The Life Map is a structured model of what matters in this person's life, organized into domains and threads.

TASK: Analyze ALL the data provided and produce a complete Life Map JSON document.

SCHEMA — output EXACTLY this structure:
{
  "version": 1,
  "rebuilt_at": "${new Date().toISOString()}",
  "updated_at": "${new Date().toISOString()}",
  "domains": [
    {
      "name": "string — matches Space name if source is 'space', or AI-generated label if 'ai_detected'",
      "source": "space" | "ai_detected",
      "space_id": "uuid | null",
      "attention": "front_of_mind" | "active" | "background",
      "threads": [
        {
          "name": "string — short, specific label",
          "status": "thriving" | "consistent" | "building" | "approaching_milestone" | "active" | "struggling" | "paused" | "at_risk" | "declining" | "recurring_concern",
          "attention": "front_of_mind" | "active" | "background",
          "importance": "high" | "medium" | "low",
          "summary": "1-3 sentence narrative about what this thread means in the user's life. Write as accumulated understanding, not a single week's observation.",
          "recent_update": "Short note about the latest state of this thread.",
          "momentum": "strong_upward" | "upward" | "steady" | "fluctuating" | "declining" | "stalled",
          "lifecycle": "active" | "dormant" | "concluded" | "archived",
          "evidence": [
            {
              "type": "journal" | "habit" | "todo" | "drop" | "calendar" | "milestone" | "chat" | "sweep",
              "source": "note:uuid" | "habit:uuid" | "todo:uuid" | null,
              "date": "YYYY-MM-DD",
              "signal": "Short factual description",
              "salience": "high" | "medium" | "low"
            }
          ],
          "last_activity": "YYYY-MM-DD"
        }
      ]
    }
  ]
}

RULES:

1. SPACES ARE DOMAINS. Every user-created Space becomes a domain with source "space". The user's active spaces are: ${spaceList}. Use the exact space names and IDs.

2. AI-DETECTED DOMAINS are for clearly positive/neutral themes that span multiple data points across 7+ days with no existing Space fit. Do NOT create AI-detected domains for sensitive health conditions, substance use, or mental health unless the user has an explicit Space for it. Keep AI-detected domains to 0-2 maximum.

3. THREAD CREATION THRESHOLDS:
   - A topic needs 3+ data points across 2+ distinct days to become a thread
   - If a topic has only 1-2 mentions, it is EVIDENCE on the most relevant existing thread
   - Each thread must have a distinct trajectory from other threads in its domain
   - Aim for 2-5 threads per active domain. Do not create micro-threads.

4. SUMMARIES reflect accumulated understanding. "Day 40 of a sobriety streak" is better than "completed habit this week." Reference timelines, trajectories, and patterns across the full history.

5. EVIDENCE: Include 3-10 evidence entries per thread, drawn from across the full history. Use actual entity IDs from the data where available (format: "note:uuid", "habit:uuid", "todo:uuid"). Include the most important/recent evidence. High salience = milestones, breakthroughs, emotional peaks, streak achievements. Medium = regular activity. Low = minor data points.

6. ATTENTION TIERS based on recent activity:
   - front_of_mind: activity in last 3 days, or upcoming milestone within 3 days, or strong emotional content
   - active: activity in last 7 days
   - background: no activity in 14+ days

7. MOMENTUM: Assess from the full trajectory, not just the latest week. A habit with 8 weeks of gradually increasing completions is "upward" even if this week was average.

8. LIFECYCLE:
   - active: thread is live and evolving
   - dormant: no activity 21+ days, could resume
   - concluded: completed trip, shipped project, finished goal
   - archived: no longer relevant

9. Use the WEEKLY SUMMARIES as your highest quality context. They contain pre-analyzed patterns and narratives about each week.

10. OUTPUT ONLY the JSON. No explanation, no markdown fences, no commentary.`;

  const userMessage = `Here is the complete data history for this user. Analyze it and produce the Life Map JSON.\n\n${compressedData}`;

  console.log(`[LifeMap:Bootstrap] Calling Sonnet. Payload: ${userMessage.length} chars`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: 'user', content: userMessage },
      ],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Life Map bootstrap Sonnet call failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  // Read the SSE stream and accumulate text
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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

  console.log(`[LifeMap:Bootstrap] Stream complete. Text length: ${fullText.length}, Input: ${inputTokens}, Output: ${outputTokens}`);

  // Parse JSON — strip markdown fences if present
  let jsonStr = fullText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let lifeMap;
  try {
    lifeMap = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn('[LifeMap:Bootstrap] Initial parse failed, using jsonrepair:', parseErr.message);
    try {
      lifeMap = JSON.parse(jsonrepair(jsonStr));
      console.log('[LifeMap:Bootstrap] jsonrepair succeeded');
    } catch (repairErr) {
      console.error('[LifeMap:Bootstrap] jsonrepair also failed:', repairErr.message);
      console.error('[LifeMap:Bootstrap] First 500:', jsonStr.slice(0, 500));
      throw new Error(`Life Map bootstrap parse error: ${repairErr.message}`);
    }
  }

  const latency = Date.now() - t0;

  console.log(`[LifeMap:Bootstrap] Complete in ${latency}ms. Domains: ${lifeMap.domains?.length || 0}`, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });

  return lifeMap;
}

async function rebuildLifeMap(currentLifeMap, analystOutput, userProfile, spaces, journals, env) {
  const t0 = Date.now();

  // Format current Life Map as compact reference (summaries + metadata, skip evidence arrays)
  const compactMap = (currentLifeMap.domains || []).map(d => ({
    name: d.name,
    source: d.source,
    space_id: d.space_id,
    attention: d.attention,
    threads: (d.threads || []).map(t => ({
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
  const analystText = JSON.stringify({
    themes: analystOutput.themes,
    new_theme_candidates: analystOutput.new_theme_candidates,
    week_shape: analystOutput.week_shape,
    cross_references: analystOutput.cross_references,
    engagement_metrics: analystOutput.engagement_metrics,
    stale_items: analystOutput.stale_items,
  }, null, 2);

  // Format raw journals for cross-reference
  let journalText = '';
  if (journals && journals.length > 0) {
    const journalLines = journals.map(j => {
      const mood = j.mood?.length > 0 ? ` [mood: ${j.mood.join(', ')}]` : '';
      const body = j.body ? `\n    "${j.body.slice(0, 600)}"` : '';
      return `  ${j.date || j.created_at?.split('T')[0] || 'unknown'}: ${j.title}${mood}${body}`;
    });
    journalText = `\n\nRAW JOURNALS (cross-reference against analyst — pull additional emotional texture or details the analyst may have missed):\n${journalLines.join('\n')}`;
  }

  const spaceList = spaces
    .filter(s => !s.archived_at)
    .map(s => `"${s.name}" (id: ${s.id})`)
    .join(', ');

  const systemPrompt = `You are updating a Life Map — a structured model of what matters in a person's life. An analyst AI has already organized this week's raw data by thread. Your job: decide what changed and output ONLY THE CHANGES.

KEY PRINCIPLE: Output deltas, not the full Life Map. Unchanged threads should NOT appear in your output. Code will merge your changes into the existing Life Map.

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

THREAD UPDATES:
- Include an update for EVERY thread the analyst flagged with activity this week.
- Also include threads where the analyst flagged lifecycle changes (approaching_dormant, concluded) even if activity was zero — these need status/lifecycle/attention updates.
- Do NOT include threads with zero activity and no lifecycle change — they stay as-is.
- SUMMARY must be the FULL replacement text. Read the existing summary and weave in this week. It should read as accumulated understanding over weeks, not just this week's snapshot. Cross-check raw journals for emotional texture the analyst may have condensed.
- RECENT_UPDATE is fresh — only this week.
- NEW_EVIDENCE: Include 1-3 genuinely new evidence entries from this week. Focus on the most significant items. Code handles deduplication, but don't include things that are clearly already in the existing evidence.

NEW THREADS:
- Only create from analyst's new_theme_candidates with evidence_count >= 3 spanning 2+ days.
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

  console.log(`[LifeMap:Rebuild] Calling Sonnet (delta mode). Payload: ${userMessage.length} chars`);

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
      messages: [
        { role: 'user', content: userMessage },
      ],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Life Map rebuild Sonnet call failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  // Read SSE stream
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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

  console.log(`[LifeMap:Rebuild] Stream complete. Text length: ${fullText.length}, Input: ${inputTokens}, Output: ${outputTokens}`);

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
  for (const update of (delta.thread_updates || [])) {
    const domain = lifeMap.domains.find(d => d.name === update.domain_name);
    if (!domain) {
      console.warn(`[LifeMap:WeeklyMerge] Domain not found: "${update.domain_name}"`);
      continue;
    }

    const thread = (domain.threads || []).find(t => t.name === update.thread_name);
    if (!thread) {
      console.warn(`[LifeMap:WeeklyMerge] Thread not found: "${update.domain_name}" → "${update.thread_name}"`);
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
        const isDuplicate = thread.evidence.some(
          existing => existing.date === e.date && existing.signal === e.signal,
        );
        if (!isDuplicate) {
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
  }

  // --- Add new threads ---
  for (const newThread of (delta.new_threads || [])) {
    let targetDomain;

    if (newThread.domain_name) {
      // Add to existing domain
      targetDomain = lifeMap.domains.find(d => d.name === newThread.domain_name);
      if (!targetDomain) {
        console.warn(`[LifeMap:WeeklyMerge] Domain for new thread not found: "${newThread.domain_name}"`);
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
      console.warn(`[LifeMap:WeeklyMerge] New thread has no domain_name or new_domain_name: "${newThread.name}"`);
      continue;
    }

    // Check for duplicate thread name
    const existing = (targetDomain.threads || []).find(t => t.name === newThread.name);
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
      evidence: (newThread.evidence || []).map(e => ({
        type: e.type || 'drop',
        source: e.source || null,
        date: e.date,
        signal: e.signal,
        salience: e.salience || 'medium',
      })),
      last_activity: newThread.last_activity || null,
    });
    console.log(`[LifeMap:WeeklyMerge] Added new thread: "${newThread.name}" in "${targetDomain.name}"`);
  }

  // --- Apply domain attention updates ---
  for (const [domainName, attention] of Object.entries(delta.domain_attention_updates || {})) {
    const domain = lifeMap.domains.find(d => d.name === domainName);
    if (domain) {
      domain.attention = attention;
    }
  }

  // --- Update Life Map metadata ---
  lifeMap.version = (lifeMap.version || 1) + 1;
  lifeMap.rebuilt_at = now;
  lifeMap.updated_at = now;

  return lifeMap;
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
      { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular;
    }

    // Fallback: try shorter query (first two words only)
    const shortQuery = query.split(' ').slice(0, 2).join(' ');
    if (shortQuery !== query) {
      console.log(`[WeeklySummaryV2] Unsplash retry with shorter query: "${shortQuery}"`);
      const retryRes = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(shortQuery)}&per_page=1&orientation=landscape`,
        { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
      );
      const retryData = await retryRes.json();
      if (retryData.results && retryData.results.length > 0) {
        return retryData.results[0].urls.regular;
      }
    }

    console.warn(`[WeeklySummaryV2] No Unsplash results for: "${query}"`);
    return null;
  } catch (e) {
    console.warn('[WeeklySummaryV2] Unsplash failed:', imageHint, e.message);
    return null;
  }
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
    console.warn(`[WeeklySummaryV2:${label}] Initial parse failed, using jsonrepair:`, parseErr.message);
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

// ── PASS 1: Sonnet Narrative Planner ────────────────────────────────────────
async function runNarrativePlanner(storytellerData, weekStart, weekEnd, staleItems, isFirstWeekOfMonth, env) {
  const plannerSystem = `You are Gremly's narrative planner. You receive a user's weekly data and must plan a weekly summary across 8 card types. Your job is NOT to write the final text — it's to decide WHAT goes WHERE so that no detail, quote, or observation appears on more than one card.

WEEK: ${weekStart} to ${weekEnd}

CARD FLOW (this is the narrative order — feel it → see it → relive it → zoom out → understand it → coach it → clear it → look ahead):
gremly_mood → opening → moments → thread_movements → discoveries → recommends → stale_triage → week_ahead

Your plan has TWO PHASES: generate CANDIDATES across different life domains, then SELECT from them with a hard diversity constraint.

You must output a JSON plan with these sections:

{
  "narrative_arc": "One sentence describing the emotional throughline of this week — what changed from start to end.",

  "gremly_mood": {
    "mood_line": "(MAX 30 CHARS) 2-4 word emotional read. e.g. 'grateful and present', 'depleted but committed', 'finally settling in'",
    "hook": "(MAX 120 CHARS) One sentence that makes the user go '...yeah.' The single most important thing about this week."
  },

  "quote_allocation": {
    "opening_quote": { "text": "verbatim journal quote", "date": "YYYY-MM-DD" },
    "moment_quotes": [{ "text": "quote or null", "date": "YYYY-MM-DD", "moment_index": 0 }]
  },

  "candidates": {
    "discovery_candidates": [
      {
        "domain": "which life domain this is about",
        "thread": "which thread if applicable, or null",
        "title": "short punchy label",
        "one_line_pitch": "one sentence — what this discovery is and why it matters",
        "key_evidence": ["2-3 specific data points"],
        "spotlight_evidence_for_builder": ["specific data points ONLY for this discovery — dates, items, quotes"],
        "mini_discoveries": [{ "topic": "short label", "evidence": "one specific fact" }]
      }
    ],
    "recommendation_candidates": [
      {
        "domain": "which life domain this addresses",
        "title": "(MAX 50 CHARS) suggestion title",
        "body": "(MAX 150 CHARS) why this recommendation and what evidence supports it",
        "type": "thought | experiment | habit_idea | mindset_shift",
        "supporting_evidence": ["1-2 specific data points from this week"]
      }
    ],
    "moment_candidates": [
      {
        "date": "YYYY-MM-DD",
        "day_label": "MON-SUN",
        "domain": "primary life domain",
        "title_idea": "evocative title",
        "one_line_pitch": "what makes this moment special — what shifted or what the user felt",
        "unique_details": ["2-3 specific details ONLY for this moment"],
        "thread_tags": ["thread names"]
      }
    ],
    "thread_candidates": [
      {
        "name": "thread name",
        "domain": "life domain",
        "direction": "up | down | milestone | concluded | new | steady | paused",
        "one_line_evidence": "single most important fact about this thread's movement"
      }
    ]
  },

  "selections": {
    "discovery_pick": {
      "index": 0,
      "domain": "the domain of the picked discovery"
    },
    "recommendation_picks": {
      "primary_index": 0,
      "primary_domain": "domain of primary recommendation",
      "secondary_indices": [1, 2]
    },
    "moment_pick_indices": [0],
    "thread_pick_names": ["3-6 thread names to show"],
    "diversity_check": "Discovery domain: [X]. Primary recommendation domain: [Y]. Moment domain: [Z]. Verify no two share the same domain."
  },

  "detail_allocation": {
    "opening_details": ["specific facts/activities ONLY used on opening — max 4"],
    "thread_details": { "Thread Name": "specific fact/evidence ONLY for this thread — max 1 per thread — use ONLY threads from selections.thread_pick_names" },
    "recommends_details": ["specific evidence ONLY for recommendations — max 3"],
    "week_ahead_details": ["facts ONLY for week ahead"]
  },

  "card_decisions": {
    "include_moments": true,
    "include_discoveries": true,
    "include_recommends": true,
    "include_stale_triage": ${staleItems.length > 0 ? 'true' : 'false'},
    "include_monthly_retro": ${isFirstWeekOfMonth ? 'true' : 'false'},
    "thread_names_to_show": ["copy from selections.thread_pick_names"],
    "moment_count": 1
  },

NOTE ON card_decisions: include_moments and include_discoveries must ALWAYS be true when you have selected candidates for those cards. The only reason to set them false is if the user's week had literally zero meaningful data (no journals, no todos, no habits). If you generated candidates, you MUST include those cards.

  "stale_headline": null,

  "factual_notes": ["Any cross-references the builders need — e.g. 'user was working from Bora Bora, do not say work resumes on return', 'sobriety data only covers March 8, do not generalize to the whole week'"]
}

CANDIDATE GENERATION RULES:
- discovery_candidates: Generate 3-4 candidates. Each MUST be from a DIFFERENT life domain. If the user has activity in fitness, work, relationship, and travel — there should be one candidate from each, not three from the same domain.
- recommendation_candidates: Generate 3-4 candidates. Each MUST address a DIFFERENT life domain. Each must reference at least one specific data point from this week (a date, a todo title, a journal quote, a habit stat). Recommendations that could apply to anyone are too generic — they must be grounded in THIS user's THIS week. At least one recommendation candidate should address the user's UPCOMING week, not just reflect on the past week. Check the analyst's next_week_events and cross_references for upcoming inflection points, deadlines, or thread collisions. The most useful recommendation is often 'here is how to navigate what is coming' rather than 'here is what you should have done differently.'
- moment_candidates: Generate 2-3 candidates from DIFFERENT days and ideally different domains.
- thread_candidates: List ALL threads that moved or matter this week — 4-8 candidates.

NARRATIVE INTEREST PRIORITY:
The analyst data includes narrative_interest scores (1-10) on themes, behavioral_fingerprints, and cross_references. When generating discovery candidates and moment candidates, PRIORITIZE items with the highest narrative_interest scores.

For discovery_candidates specifically:
- Check the analyst's behavioral_fingerprints where is_discovery_candidate is true — these are strong candidates because they span multiple life threads
- Check cross_references with narrative_interest >= 7
- Check themes with narrative_interest >= 7
- A discovery about maintaining discipline across several areas during a challenging period is MORE interesting than a discovery about a single habit streak, even if the streak has cleaner numbers
- A discovery about a new life thread emerging or a spontaneous decision is MORE interesting than progress on an existing pattern

For moment_candidates:
- Prioritize moments connected to high narrative_interest themes or cross_references
- Moments where the user made a decision, had a realization, or experienced something for the first time score higher than moments that were just pleasant or productive

DIVERSITY CONSTRAINT — THIS IS THE MOST IMPORTANT SELECTION RULE:
When making selections, enforce this: the discovery spotlight domain, the primary recommendation domain, and the moment's primary domain must each be DIFFERENT. Three cards in a row about the same life area makes the summary feel obsessive.

Before finalizing selections, write out the diversity_check field:
- Discovery domain: [X]
- Primary recommendation domain: [Y]
- Moment domain: [Z]

If any two match, go back and pick a different candidate for the one that's easiest to swap. This check is mandatory — do not skip it.

SELECTION RULES:
- recommendation_picks.primary_domain MUST differ from discovery_pick.domain
- moment domain should ideally differ from both discovery and primary recommendation domains
- thread_pick_names: pick 3-6 threads that MOVED or MATTER most
- detail_allocation references ONLY the SELECTED candidates, not all of them
- When choosing between candidates of the same domain diversity, always pick the one with higher narrative_interest from the source analyst data. If a discovery candidate about a life transition (narrative_interest: 9) competes with one about a habit streak (narrative_interest: 5), pick the life transition even if the habit streak has cleaner evidence.

EXCLUSIVE DETAIL ALLOCATION — ZERO TOLERANCE:
This is the most important structural rule. Every specific detail (activity name, todo title, habit stat, journal quote excerpt, event name) must appear in EXACTLY ONE allocation bucket or ONE candidate. This is a hard partition — like dealing cards into hands.

Before finalizing your plan, run this check:
- List every specific noun/activity you allocated (e.g. 'tennis', 'DCO Integration', 'floaties', 'jet skiing')
- Verify each one appears in exactly one bucket OR exactly one candidate
- If any detail appears in two or more places, REMOVE it from all but the one where it has the most impact

Common violations to avoid:
- Opening mentions 'tennis, weights, run' AND thread_movements mentions them again in individual thread details — WRONG. Opening gets the list, threads get different evidence.
- A moment describes an activity AND the selected discovery uses the same activity as evidence — WRONG. Pick one.
- Gremly mood hook references a specific choice AND opening body describes the same choice — WRONG. The hook is emotional, the body tells the story with different specifics.
- The selected discovery and the primary recommendation both lean on the same evidence — WRONG. They must use different data points.

MOMENT UNIQUENESS:
The moment's core insight must be DIFFERENT from the gremly_mood hook and the opening body's conclusion. If those cards already cover a theme (e.g. 'choosing presence over work'), the moment must surface a completely different angle or a different day. A moment should surprise the user — not confirm what they just read on the previous two cards.

WEEK AHEAD EVENT FILTERING — CRITICAL:
Only include events with genuine significance to the user's life narrative. NEVER include:
- Recurring meetings that happen every week (standups, syncs, 1:1s, all-hands, status updates)
- Routine admin tasks (timesheets, office hours)
- Events where is_recurring is true in the analyst data
- Events with importance < 5 in the analyst data
Only include events that are: one-off, milestone-related, travel-related, deadline-related, or connected to a Life Map thread that is actively moving. The user does not need Gremly to tell them about their weekly standup.

WEEK AHEAD — BIGGEST STORY FIRST:
The week ahead card should lead with the single most significant life transition or inflection point in the coming week. Check the analyst's cross_references and next_week_events for:
- Transitions between life phases (returning from leave, starting a new role, moving cities)
- Collisions between major threads on the same day (a race + a flight, a deadline + a celebration)
- The user's context changing (working remotely from a new location, re-entering a routine after travel)
These are the stories the user cares about most. Recurring meetings, routine admin, and standard work events should NEVER lead the week ahead — they are background, not foreground.

STALE TRIAGE:
- If stale_items exist in the data, ALWAYS set include_stale_triage to true.
- Do NOT write a stale headline in the plan. Set stale_headline to null. The real item count will be injected by code after the build, because the planner's count may differ from the actual data.

FACTUAL CROSS-REFERENCE RULE:
Check thread_movements data before making factual claims in any allocation. If a thread shows the user was actively working during a period (e.g. shipping features from a vacation location), do not plan text that says 'work resumes' or 'returning to work' about a later date. The planner must be factually consistent with the Life Map data.

ADDITIONAL RULES:
- Quotes are allocated once. A quote used on the opening cannot appear on any moment or discovery.
- For moments: choose moments where the user FELT something or where something SHIFTED, not just interesting days. The moment is about the person's inner experience, not the place.
- For discoveries: choose a behavioral pattern the user hasn't been told about before. Avoid restating what the thread_movements already show.

RESPOND WITH ONLY VALID JSON, no markdown.`;

  const userMsg = `Plan the narrative for ${weekStart} to ${weekEnd}.\n\n${JSON.stringify(storytellerData, null, 2)}`;

  console.log(`[WeeklySummaryV2:Planner] Calling Sonnet. Payload: ${userMsg.length} chars`);

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
      messages: [{ role: 'user', content: userMsg }],
      system: plannerSystem,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Planner Sonnet call failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  const { fullText, inputTokens, outputTokens } = await readSSEStream(response);
  console.log(`[WeeklySummaryV2:Planner] Stream complete. Text: ${fullText.length} chars, In: ${inputTokens}, Out: ${outputTokens}`);

  const plan = safeParseJSON(fullText, 'Planner');
  return { plan, inputTokens, outputTokens };
}

// ── PASS 2: Haiku Card Builder ──────────────────────────────────────────────
async function buildCard(cardType, plan, storytellerData, staleItems, weekStart, weekEnd, env) {
  const alloc = plan.detail_allocation || {};
  const decisions = plan.card_decisions || {};
  const notes = (plan.factual_notes || []).join('\n- ');
  const notesBlock = notes ? `\nFACTUAL NOTES (respect these):\n- ${notes}` : '';

  let cardPrompt = '';
  let cardData = {};

  switch (cardType) {
    case 'gremly_mood': {
      cardPrompt = `Output a single JSON object for the gremly_mood card.
Narrative arc: ${plan.narrative_arc || ''}
Mood line from plan: ${plan.gremly_mood?.mood_line || ''}
Hook from plan: ${plan.gremly_mood?.hook || ''}
${notesBlock}

Schema:
{
  "type": "gremly_mood",
  "mood_line": "(MAX 30 CHARS) 2-4 word emotional read",
  "hook": "(MAX 120 CHARS) One sentence — the single most important thing about this week",
  "week_label": "${weekStart} to ${weekEnd}"
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'opening': {
      const openingDetails = alloc.opening_details || [];
      const openingQuote = plan.quote_allocation?.opening_quote || {};
      cardPrompt = `Output a single JSON object for the opening card.
Narrative arc: ${plan.narrative_arc || ''}
Allocated details (use ONLY these): ${JSON.stringify(openingDetails)}
Quote: ${JSON.stringify(openingQuote)}
${notesBlock}

Schema:
{
  "type": "opening",
  "headline": "(MAX 60 CHARS) Bold statement — max 12 words. The one thing that defines this week.",
  "subheadline": "(MAX 25 CHARS) 2-4 word week type label",
  "body": "(MAX 350 CHARS) 2-3 sentences. Use ONLY the details from allocated opening_details. NEVER mention details allocated to other cards.",
  "mood": "(MAX 20 CHARS) 2-4 words",
  "quote": "from allocated opening_quote — verbatim, or null",
  "quote_date": "YYYY-MM-DD from allocation",
  "image_hint": "keyword for image search — e.g. 'bora_bora_lagoon', 'tokyo_skyline'"
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'thread_movements': {
      const threadDetails = alloc.thread_details || {};
      const threadNames = decisions.thread_names_to_show || [];
      cardData = { thread_updates: storytellerData.life_map_delta?.thread_updates || [], new_threads: storytellerData.life_map_delta?.new_threads || [] };
      cardPrompt = `Output a single JSON object for the thread_movements card.
Thread names to show: ${JSON.stringify(threadNames)}
Thread details (one evidence fact per thread): ${JSON.stringify(threadDetails)}
Thread data for reference: ${JSON.stringify(cardData)}
${notesBlock}

Schema:
{
  "type": "thread_movements",
  "title": "Life in motion",
  "threads": [
    {
      "name": "thread name — from thread_names_to_show",
      "domain": "domain name",
      "direction": "up | down | milestone | concluded | new | steady | paused",
      "icon_hint": "fitness | travel | work | personal | health | creative | relationship | admin",
      "shift_label": "(MAX 40 CHARS) transition label e.g. 'consistent → thriving'",
      "badge_label": "(MAX 15 CHARS) 1-2 word status e.g. 'on fire', 'paused'",
      "detail": "(MAX 140 CHARS) Use ONLY the evidence from thread_details for this thread.",
      "is_highlight": true
    }
  ]
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'moments': {
      const momentDetails = alloc.moment_details || [];
      const momentQuotes = plan.quote_allocation?.moment_quotes || [];
      cardPrompt = `Output a single JSON object for the moments card.
Moment details (use ONLY these): ${JSON.stringify(momentDetails)}
Moment quotes: ${JSON.stringify(momentQuotes)}
${notesBlock}

Schema:
{
  "type": "moments",
  "moments": [
    {
      "day_label": "MON | TUE | WED | THU | FRI | SAT | SUN",
      "date": "YYYY-MM-DD",
      "title": "(MAX 40 CHARS) Reflects the user's experience, not the place.",
      "body": "(MAX 300 CHARS) Lead with what the user FELT or what SHIFTED. Use ONLY details from the allocated moment_details for this moment. Brief real-world color is fine but the moment is about the person. NEVER recap what the user did.",
      "image_hint": "broad scenic/location keywords for photo search",
      "thread_tags": ["from plan"]
    }
  ]
}

image_hint RULES: Use broad scenic or location keywords suitable for a photo search engine. Good hints: 'ocean sunset palms', 'city street evening lights', 'mountain trail morning'. Bad hints: anything referencing specific activities, objects, or people — photo libraries do not index these. Strip activity words entirely. If the moment happened at a beach, the hint is the beach setting, not what the user did there.

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'discoveries': {
      const disco = alloc.discovery_details || {};
      const userProfile = storytellerData.user_profile || null;
      cardPrompt = `Output a single JSON object for the discoveries card.
Spotlight topic: ${disco.spotlight_topic || ''}
Spotlight evidence (use ONLY these): ${JSON.stringify(disco.spotlight_evidence || [])}
Mini-discoveries: ${JSON.stringify(disco.mini_discoveries || [])}
User profile (for research framing): ${userProfile ? JSON.stringify(userProfile) : 'none'}
${notesBlock}

Schema:
{
  "type": "discoveries",
  "spotlight": {
    "badge": "discovery | shift | breakthrough",
    "title": "(MAX 50 CHARS) Short punchy label",
    "evidence_trail": "(MAX 400 CHARS) Specific data points from spotlight_evidence. Dates, item titles, journal quotes, numbers. Show the receipts.",
    "takeaway": "(MAX 150 CHARS) The insight that follows from the evidence.",
    "research_context": {
      "title": "Why this happens",
      "body": "(MAX 250 CHARS) Connect to behavioral science. Name researchers, studies, or frameworks.",
      "sources": ["Author (Year) or Framework name — max 3"]
    }
  },
  "mini_discoveries": [
    {
      "title": "(MAX 40 CHARS) from plan mini_discoveries",
      "detail": "(MAX 100 CHARS) One sentence with specific evidence"
    }
  ]
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'recommends': {
      const recs = plan.recommendations || {};
      const recsDetails = alloc.recommends_details || [];
      cardPrompt = `Output a single JSON object for the recommends card.
Primary recommendation from plan: ${JSON.stringify(recs.primary || {})}
Secondary recommendations from plan: ${JSON.stringify(recs.secondary || [])}
Allocated evidence (use ONLY these): ${JSON.stringify(recsDetails)}
${notesBlock}

Schema:
{
  "type": "recommends",
  "primary": {
    "title": "(MAX 50 CHARS) from plan recommendations.primary.title",
    "body": "(MAX 150 CHARS) from plan recommendations.primary.body",
    "type": "thought | experiment | habit_idea | mindset_shift"
  },
  "secondary": [
    {
      "title": "(MAX 40 CHARS) from plan recommendations.secondary",
      "body": "(MAX 100 CHARS) brief reasoning",
      "type": "thought | experiment | habit_idea | mindset_shift"
    }
  ]
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      // Custom system prompt for recommends — warm coach tone
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            temperature: 0.1,
            messages: [{ role: 'user', content: cardPrompt }],
            system: 'You are building a single \'recommends\' card for a weekly summary. This card is Gremly being a thoughtful coach — suggesting ideas the user can consider, not tasks to complete. The tone is warm, curious, and thought-provoking. Frame suggestions as invitations, not instructions.\n\nQUALITY RULES FOR RECOMMENDATIONS:\n- Be specific and concrete. The user should understand what you are suggesting within 2 seconds of reading.\n- Ground every recommendation in evidence from this week\'s data. Reference specific dates, items, or patterns.\n- Frame as clear actions or experiments, not poetic metaphors.\n- Bad: abstract, clever, requires interpretation to understand.\n- Good: direct, references a specific moment or pattern, suggests something the user can actually try.\n- The primary recommendation should be the single most impactful thing the user could do differently based on what you observed this week.\n- Secondary recommendations should each address a different dimension of the user\'s life — don\'t cluster all suggestions around the same theme.\n\nOutput ONLY valid JSON for this single card. Stay within ALL character limits.',
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          console.error(`[WeeklySummaryV2:Builder:recommends] Failed: ${response.status} ${errBody.slice(0, 200)}`);
          return null;
        }

        const result = await response.json();
        const text = result.content?.[0]?.text || '';
        const card = safeParseJSON(text, 'Builder:recommends');
        console.log(`[WeeklySummaryV2:Builder:recommends] OK. In: ${result.usage?.input_tokens || 0}, Out: ${result.usage?.output_tokens || 0}`);
        return card;
      } catch (e) {
        console.error(`[WeeklySummaryV2:Builder:recommends] Error:`, e.message);
        return null;
      }
    }

    case 'stale_triage': {
      cardPrompt = `Output a single JSON object for the stale_triage card.
Stale items data (include ALL of these — do NOT filter or omit any): ${JSON.stringify(staleItems)}
${notesBlock}

Schema:
{
  "type": "stale_triage",
  "headline": "(MAX 50 CHARS) Short headline — mention count and context",
  "body": "(MAX 150 CHARS) 1-2 sentences. Compassionate framing using life context.",
  "items": [
    {
      "title": "exact item title from data",
      "days_stale": 0,
      "domain": "domain name from data",
      "context": "(MAX 60 CHARS) Why stale — brief context",
      "item_id": "from data or null"
    }
  ]
}

The items array MUST contain every single item from the stale_items data provided. Do not filter or omit any. If the data contains 18 items, output 18.

Output ONLY valid JSON. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    case 'week_ahead': {
      const waDetails = alloc.week_ahead_details || [];
      const eventData = storytellerData.analyst?.event_analysis || {};
      cardPrompt = `Output a single JSON object for the week_ahead card.
Allocated details (use ONLY these): ${JSON.stringify(waDetails)}
Event data for reference: ${JSON.stringify(eventData)}
${notesBlock}

ONLY include events the planner specifically selected in week_ahead_details. Do NOT add recurring meetings, office hours, status updates, timesheets, or weekly syncs — even if they appear in the raw data. If the planner selected fewer than 3 events, that's fine. A week ahead with 2 significant events is better than one padded with routine noise.

Schema:
{
  "type": "week_ahead",
  "intro": "(MAX 200 CHARS) What's coming and how it connects. Use ONLY allocated week_ahead_details. Check factual_notes before claiming anything starts or stops.",
  "highlights": [
    {
      "day_label": "MON | TUE | WED | THU | FRI | SAT | SUN",
      "date": "YYYY-MM-DD",
      "title": "event title",
      "icon_hint": "lucide icon name e.g. 'plane', 'trophy', 'briefcase'",
      "thread_connection": "thread name or null",
      "prep_nudge": "(MAX 100 CHARS) practical suggestion or null",
      "context": "(MAX 120 CHARS) bigger picture or null",
      "importance": 1
    }
  ],
  "busy_day_warnings": [
    { "day": "day name", "detail": "(MAX 80 CHARS)" }
  ]
}

Output ONLY valid JSON. Use ONLY the allocated details provided. Stay within ALL character limits. Write in complete, natural English sentences.`;
      break;
    }

    default:
      return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: 'user', content: cardPrompt }],
        system: 'You are a JSON card builder for Gremly\'s weekly summary. Output ONLY valid JSON for a single card. No markdown, no explanation. Use ONLY the allocated details provided — do not add details from other cards. Stay within ALL character limits. Write in complete, natural English sentences — never telegraphic fragments.',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[WeeklySummaryV2:Builder:${cardType}] Failed: ${response.status} ${errBody.slice(0, 200)}`);
      return null;
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const card = safeParseJSON(text, `Builder:${cardType}`);
    console.log(`[WeeklySummaryV2:Builder:${cardType}] OK. In: ${result.usage?.input_tokens || 0}, Out: ${result.usage?.output_tokens || 0}`);
    return card;
  } catch (e) {
    console.error(`[WeeklySummaryV2:Builder:${cardType}] Error:`, e.message);
    return null;
  }
}

// ── Text length safety net ──────────────────────────────────────────────────
function trimToLimit(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSemicolon = truncated.lastIndexOf(';');
  const lastDash = truncated.lastIndexOf('\u2014');
  const cutPoint = Math.max(lastPeriod, lastSemicolon, lastDash);
  if (cutPoint > maxChars * 0.6) {
    return text.slice(0, cutPoint + 1).trim();
  }
  return truncated.trim();
}

// ── Main: Two-Pass generateWeeklySummaryV2 ──────────────────────────────────
async function generateWeeklySummaryV2(
  analystOutput,
  lifeMapDelta,
  rebuiltLifeMap,
  weeklySnapshot,
  weekStart,
  weekEnd,
  priorSummaries,
  env,
  engagementStats,
) {
  const t0 = Date.now();

  // Build compact thread movements from delta
  const threadMovements = (lifeMapDelta.thread_updates || []).map(u => ({
    thread: u.thread_name,
    domain: u.domain_name,
    status: u.status,
    momentum: u.momentum,
    lifecycle: u.lifecycle,
    importance: u.importance,
    recent_update: u.recent_update,
  }));

  // Build new threads list
  const newThreads = (lifeMapDelta.new_threads || []).map(t => ({
    name: t.name,
    domain: t.domain_name || t.new_domain_name,
    summary: t.summary,
  }));

  // Format prior summaries for trend context
  const priorContext = (priorSummaries || []).slice(0, 4).map(ws => {
    const content = ws.content || ws;
    return {
      week_start: ws.week_start_date,
      week_type: content.weekTypeShort || content.weekType || 'N/A',
      mood: content.mood || 'N/A',
      commentary: content.weeklyCommentary || 'N/A',
      key_themes: content.keyThemes || [],
    };
  });

  // Check if this is the first summary of a new month
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const isFirstWeekOfMonth = weekStartDate.getUTCDate() <= 7;
  const monthName = weekStartDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  // Raw journals for quote verification
  const journalExcerpts = (weeklySnapshot.journals || []).map(j => ({
    date: j.date,
    title: j.title,
    body: j.body ? j.body.slice(0, 500) : null,
    mood: j.mood || [],
  }));

  // Completed todos
  const completedTodos = (weeklySnapshot.todosDetail || [])
    .filter(t => t.completed_at)
    .map(t => ({ title: t.title, date: t.completed_at, space: t.space }));

  // Stale items — built from raw snapshot data, NOT dependent on analyst
  const staleItems = (weeklySnapshot.todosDetail || [])
    .filter(t => {
      if (t.status !== 'active' || t.archived) return false;
      if (!t.created_at) return false;
      const targetDate = weeklySnapshot.targetDate || weekEnd;
      const daysSince = Math.floor(
        (new Date(targetDate + 'T00:00:00Z') - new Date(t.created_at.split('T')[0] + 'T00:00:00Z')) / 86400000
      );
      return daysSince > 14;
    })
    .map(t => {
      const targetDate = weeklySnapshot.targetDate || weekEnd;
      const daysSince = Math.floor(
        (new Date(targetDate + 'T00:00:00Z') - new Date(t.created_at.split('T')[0] + 'T00:00:00Z')) / 86400000
      );
      // Try to find analyst enrichment for this item
      const analystMatch = (analystOutput.stale_items || []).find(
        s => s.title && t.title && s.title.toLowerCase() === t.title.toLowerCase()
      );
      return {
        title: t.title,
        days_stale: daysSince,
        domain: analystMatch?.domain_hint || t.space || 'Uncategorized',
        severity: daysSince > 30 ? 'high' : daysSince > 21 ? 'medium' : 'low',
        item_id: t.id || null,
      };
    });

  console.log(`[WeeklySummaryV2] Stale items from snapshot: ${staleItems.length} (analyst had: ${(analystOutput.stale_items || []).length})`);

  // User profile
  const userProfile = weeklySnapshot.userProfile || null;

  // Build the data payload shared by planner and builders
  const storytellerData = {
    analyst: {
      themes: analystOutput.themes,
      week_timeline: analystOutput.week_timeline,
      event_analysis: analystOutput.event_analysis,
      behavioral_fingerprints: analystOutput.behavioral_fingerprints,
      magic_moment_candidates: analystOutput.magic_moment_candidates,
      cross_references: analystOutput.cross_references,
      week_shape: analystOutput.week_shape,
      engagement_metrics: analystOutput.engagement_metrics,
    },
    life_map_delta: {
      thread_updates: threadMovements,
      new_threads: newThreads,
      domain_attention_updates: lifeMapDelta.domain_attention_updates || {},
    },
    raw_journals: journalExcerpts,
    completed_todos: completedTodos.slice(0, 20),
    stale_items: staleItems,
    prior_weeks: priorContext,
    is_first_week_of_month: isFirstWeekOfMonth,
    user_profile: userProfile,
    engagement_stats: {
      drops: analystOutput.engagement_metrics?.drops_this_week || 0,
      journals: analystOutput.engagement_metrics?.journals_written || 0,
      completions: analystOutput.engagement_metrics?.completions_this_week || 0,
    },
  };

  // ── PASS 1: Sonnet Narrative Planner ────────────────────────────────────
  const { plan, inputTokens: plannerInputTokens, outputTokens: plannerOutputTokens } =
    await runNarrativePlanner(storytellerData, weekStart, weekEnd, staleItems, isFirstWeekOfMonth, env);

  console.log(`[WeeklySummaryV2] Planner: ${plannerInputTokens} in / ${plannerOutputTokens} out`);

  // ── CANDIDATE → PLAN WIRING (extract selections into builder-friendly fields) ──
  if (plan.candidates) {
    const cands = plan.candidates;
    let sels = plan.selections;

    console.log(`[WeeklySummaryV2] Candidate mode: discovery_candidates=${(cands.discovery_candidates || []).length}, recommendation_candidates=${(cands.recommendation_candidates || []).length}, moment_candidates=${(cands.moment_candidates || []).length}, thread_candidates=${(cands.thread_candidates || []).length}`);

    // AUTO-SELECT FALLBACK: if planner generated candidates but hit token limit before selections,
    // build selections deterministically with diversity constraint
    if (!sels) {
      console.log(`[WeeklySummaryV2] No selections found — auto-selecting from candidates with diversity constraint`);
      const discoveryCands = cands.discovery_candidates || [];
      const recCands = cands.recommendation_candidates || [];
      const momentCands = cands.moment_candidates || [];
      const threadCands = cands.thread_candidates || [];

      // Pick first discovery
      const discoveryDomain = discoveryCands[0]?.domain || null;

      // Pick primary recommendation from a DIFFERENT domain than discovery
      let primaryRecIdx = 0;
      for (let i = 0; i < recCands.length; i++) {
        if (recCands[i].domain !== discoveryDomain) {
          primaryRecIdx = i;
          break;
        }
      }
      const primaryRecDomain = recCands[primaryRecIdx]?.domain || null;

      // Pick secondary recommendations (all others except primary)
      const secondaryIndices = recCands
        .map((_, i) => i)
        .filter(i => i !== primaryRecIdx)
        .slice(0, 2);

      // Pick moment from a DIFFERENT domain than discovery and primary rec
      let momentIdx = 0;
      for (let i = 0; i < momentCands.length; i++) {
        if (momentCands[i].domain !== discoveryDomain && momentCands[i].domain !== primaryRecDomain) {
          momentIdx = i;
          break;
        }
      }

      // Pick thread names — all thread candidates
      const threadPickNames = threadCands.map(tc => tc.name).filter(Boolean).slice(0, 6);

      sels = {
        discovery_pick: { index: 0, domain: discoveryDomain },
        recommendation_picks: {
          primary_index: primaryRecIdx,
          primary_domain: primaryRecDomain,
          secondary_indices: secondaryIndices,
        },
        moment_pick_indices: [momentIdx],
        thread_pick_names: threadPickNames,
        diversity_check: `Auto-selected. Discovery: ${discoveryDomain}, Primary rec: ${primaryRecDomain}, Moment: ${momentCands[momentIdx]?.domain || 'N/A'}`,
      };
      console.log(`[WeeklySummaryV2] Auto-selection diversity: ${sels.diversity_check}`);
    } else {
      console.log(`[WeeklySummaryV2] Planner provided selections. Diversity check: ${sels.diversity_check || 'not provided'}`);
    }

    if (!plan.detail_allocation) plan.detail_allocation = {};
    if (!plan.card_decisions) plan.card_decisions = {};

    // Wire selected discovery into detail_allocation.discovery_details
    const selectedDiscovery = (cands.discovery_candidates || [])[sels.discovery_pick?.index ?? 0];
    if (selectedDiscovery) {
      plan.detail_allocation.discovery_details = {
        spotlight_topic: selectedDiscovery.title || selectedDiscovery.one_line_pitch || '',
        spotlight_evidence: selectedDiscovery.spotlight_evidence_for_builder || selectedDiscovery.key_evidence || [],
        mini_discoveries: selectedDiscovery.mini_discoveries || [],
      };
      plan.card_decisions.include_discoveries = true;
      console.log(`[WeeklySummaryV2] Discovery selected: "${selectedDiscovery.title}" (${selectedDiscovery.domain})`);
    }

    // Wire selected recommendations into plan.recommendations
    const primaryRec = (cands.recommendation_candidates || [])[sels.recommendation_picks?.primary_index ?? 0];
    const secondaryRecs = (sels.recommendation_picks?.secondary_indices || [])
      .map(i => (cands.recommendation_candidates || [])[i])
      .filter(Boolean);
    if (primaryRec) {
      plan.recommendations = {
        primary: {
          title: primaryRec.title,
          body: primaryRec.body,
          type: primaryRec.type,
        },
        secondary: secondaryRecs.map(r => ({
          title: r.title,
          body: r.body,
          type: r.type,
        })),
      };
      plan.detail_allocation.recommends_details = [
        ...(primaryRec.supporting_evidence || []),
        ...secondaryRecs.flatMap(r => r.supporting_evidence || []),
      ].slice(0, 5);
      plan.card_decisions.include_recommends = true;
      console.log(`[WeeklySummaryV2] Primary rec: "${primaryRec.title}" (${primaryRec.domain})`);
    }

    // Wire selected moments into detail_allocation.moment_details
    const selectedMoments = (sels.moment_pick_indices || [])
      .map(i => (cands.moment_candidates || [])[i])
      .filter(Boolean);
    if (selectedMoments.length > 0) {
      plan.detail_allocation.moment_details = selectedMoments.map(m => ({
        day: m.day_label,
        date: m.date,
        title_idea: m.title_idea,
        unique_details: m.unique_details || [],
        thread_tags: m.thread_tags || [],
      }));
      plan.card_decisions.include_moments = true;
      plan.card_decisions.moment_count = selectedMoments.length;
      console.log(`[WeeklySummaryV2] Moments selected: ${selectedMoments.map(m => m.title_idea).join(', ')}`);
    }

    // Override: if analyst has 2+ magic moments and planner only picked 1, force a second moment
    const analystMoments = storytellerData.analyst?.magic_moment_candidates || [];
    if (selectedMoments.length === 1 && analystMoments.length >= 2 && (cands.moment_candidates || []).length >= 2) {
      // Find a second moment candidate that's on a different day
      const firstDate = selectedMoments[0]?.date;
      const secondIdx = (cands.moment_candidates || []).findIndex((m, i) => 
        !sels.moment_pick_indices.includes(i) && m.date !== firstDate
      );
      if (secondIdx !== -1) {
        const secondMoment = cands.moment_candidates[secondIdx];
        selectedMoments.push(secondMoment);
        plan.detail_allocation.moment_details.push({
          day: secondMoment.day_label,
          date: secondMoment.date,
          title_idea: secondMoment.title_idea,
          unique_details: secondMoment.unique_details || [],
          thread_tags: secondMoment.thread_tags || [],
        });
        plan.card_decisions.moment_count = 2;
        console.log(`[WeeklySummaryV2] Moment override: added second moment "${secondMoment.title_idea}" (${secondMoment.date})`);
      }
    }

    // Wire thread selections into card_decisions AND detail_allocation.thread_details
    let threadNames = sels.thread_pick_names || [];

    // FALLBACK: if no thread candidates from planner, build from life map delta
    if (threadNames.length === 0) {
      const deltaThreads = storytellerData.life_map_delta?.thread_updates || [];
      threadNames = deltaThreads
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 6)
        .map(t => t.thread);
      if (threadNames.length > 0) {
        console.log(`[WeeklySummaryV2] Thread fallback from life map delta: ${threadNames.join(', ')}`);
        // Build thread_details from delta data
        plan.detail_allocation.thread_details = {};
        for (const t of deltaThreads.slice(0, 6)) {
          plan.detail_allocation.thread_details[t.thread] = t.recent_update || '';
        }
      }
    } else {
      // Build thread_details from thread_candidates for the selected names
      if (!plan.detail_allocation.thread_details || Object.keys(plan.detail_allocation.thread_details).length === 0) {
        plan.detail_allocation.thread_details = {};
        for (const name of threadNames) {
          const candidate = (cands.thread_candidates || []).find(
            tc => tc.name && tc.name.toLowerCase() === name.toLowerCase()
          );
          if (candidate) {
            plan.detail_allocation.thread_details[name] = candidate.one_line_evidence || '';
          }
        }
      }
    }

    if (threadNames.length > 0) {
      plan.card_decisions.thread_names_to_show = threadNames;
      console.log(`[WeeklySummaryV2] Threads final: ${threadNames.join(', ')}`);
    }
  } else {
    console.log(`[WeeklySummaryV2] Legacy planner mode (no candidates section)`);
  }

  // ── PASS 2: Parallel Haiku Card Builders ────────────────────────────────
  const cardBuilds = [];

  // Card flow: gremly_mood → opening → moments → thread_movements → discoveries → recommends → stale_triage → week_ahead
  // All core cards always build — if the builder gets empty data it returns null and won't appear.

  // Always: gremly_mood
  cardBuilds.push(buildCard('gremly_mood', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Always: opening
  cardBuilds.push(buildCard('opening', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Always: moments (builder returns null if no moment_details)
  cardBuilds.push(buildCard('moments', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Always: thread_movements
  cardBuilds.push(buildCard('thread_movements', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Always: discoveries (builder returns null if no discovery_details)
  cardBuilds.push(buildCard('discoveries', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Always: recommends
  cardBuilds.push(buildCard('recommends', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Data-driven: stale_triage — always build if stale items exist
  if (staleItems.length > 0) {
    cardBuilds.push(buildCard('stale_triage', plan, storytellerData, staleItems, weekStart, weekEnd, env));
  }

  // Always: week_ahead
  cardBuilds.push(buildCard('week_ahead', plan, storytellerData, staleItems, weekStart, weekEnd, env));

  // Run all card builds in parallel
  const builtCards = await Promise.all(cardBuilds);
  const builderCalls = builtCards.length;

  console.log(`[WeeklySummaryV2] Builders: ${builderCalls} calls`);

  // Assemble cards in canonical narrative order, filter out failures
  const orderedTypes = ['gremly_mood', 'opening', 'moments', 'thread_movements', 'discoveries', 'recommends', 'stale_triage', 'week_ahead'];
  const assembledCards = [];
  for (const type of orderedTypes) {
    const card = builtCards.find(c => c && c.type === type);
    if (card) assembledCards.push(card);
  }

  // ── QUOTE DEDUPLICATION (code-enforced) ───────────────────────────────
  // Extract all quoted phrases from every card. If any quote appears on
  // more than one card, blank it from every card except the first one.
  {
    const quoteRegex = /['"][^'"]{15,}['"]/g;
    const seenQuotes = new Map(); // quote text → first card type that used it

    for (const card of assembledCards) {
      const cardJson = JSON.stringify(card);
      const matches = cardJson.match(quoteRegex) || [];

      for (const match of matches) {
        const cleaned = match.slice(1, -1).toLowerCase().trim();
        if (!seenQuotes.has(cleaned)) {
          seenQuotes.set(cleaned, card.type);
        }
      }
    }

    // Second pass: for each card that isn't the first user of a quote, remove it
    let deduped = 0;
    for (const card of assembledCards) {
      if (card.type === 'gremly_mood' || card.type === 'opening') continue; // protect these

      const removeQuote = (text) => {
        if (!text) return text;
        let result = text;
        for (const [quote, firstCardType] of seenQuotes.entries()) {
          if (firstCardType === card.type) continue; // this card owns the quote
          // Check if this text contains the quote (case-insensitive)
          const idx = result.toLowerCase().indexOf(quote);
          if (idx !== -1) {
            // Find the sentence containing this quote and remove it
            const before = result.lastIndexOf('.', idx);
            const after = result.indexOf('.', idx + quote.length);
            if (before !== -1 && after !== -1) {
              result = result.slice(0, before + 1).trim() + ' ' + result.slice(after + 1).trim();
            } else if (after !== -1) {
              result = result.slice(after + 1).trim();
            }
            deduped++;
          }
        }
        return result.trim();
      };

      // Apply to text fields based on card type
      switch (card.type) {
        case 'thread_movements':
          if (card.threads) {
            for (const thread of card.threads) {
              thread.detail = removeQuote(thread.detail);
            }
          }
          break;
        case 'moments':
          if (card.moments) {
            for (const moment of card.moments) {
              moment.body = removeQuote(moment.body);
            }
          }
          break;
        case 'discoveries':
          if (card.spotlight) {
            card.spotlight.evidence_trail = removeQuote(card.spotlight.evidence_trail);
            card.spotlight.takeaway = removeQuote(card.spotlight.takeaway);
          }
          break;
        case 'recommends':
          if (card.primary) card.primary.body = removeQuote(card.primary.body);
          if (card.secondary) {
            for (const rec of card.secondary) {
              rec.body = removeQuote(rec.body);
            }
          }
          break;
        case 'week_ahead':
          card.intro = removeQuote(card.intro);
          break;
      }
    }

    if (deduped > 0) {
      console.log(`[WeeklySummaryV2] Quote dedup: removed ${deduped} duplicate quote(s) across cards`);
    }
  }

  // ── IMAGE RESOLUTION — Unsplash ──────────────────────────────────────────
  const imagePromises = [];
  const openingCard = assembledCards.find(c => c.type === 'opening');
  if (openingCard?.image_hint) {
    imagePromises.push(
      resolveImageUrl(openingCard.image_hint, env).then(url => { if (url) openingCard.image_url = url; })
    );
  }
  const momentsCard = assembledCards.find(c => c.type === 'moments');
  if (momentsCard?.moments) {
    for (const moment of momentsCard.moments) {
      if (moment.image_hint) {
        imagePromises.push(
          resolveImageUrl(moment.image_hint, env).then(url => { if (url) moment.image_url = url; })
        );
      }
    }
  }
  await Promise.all(imagePromises);

  // ── TEXT LENGTH SAFETY NET ─────────────────────────────────────────────────
  for (const card of assembledCards) {
    switch (card.type) {
      case 'opening':
        card.headline = trimToLimit(card.headline, 60);
        card.body = trimToLimit(card.body, 350);
        break;
      case 'thread_movements':
        if (card.threads) {
          for (const thread of card.threads) {
            thread.detail = trimToLimit(thread.detail, 140);
            thread.shift_label = trimToLimit(thread.shift_label, 40);
          }
        }
        break;
      case 'moments':
        if (card.moments) {
          for (const moment of card.moments) {
            moment.body = trimToLimit(moment.body, 300);
            moment.title = trimToLimit(moment.title, 40);
          }
        }
        break;
      case 'discoveries':
        if (card.spotlight) {
          card.spotlight.evidence_trail = trimToLimit(card.spotlight.evidence_trail, 400);
          card.spotlight.takeaway = trimToLimit(card.spotlight.takeaway, 150);
          if (card.spotlight.research_context) {
            card.spotlight.research_context.body = trimToLimit(card.spotlight.research_context.body, 250);
          }
        }
        break;
      case 'week_ahead':
        card.intro = trimToLimit(card.intro, 200);
        break;
      case 'stale_triage':
        card.headline = trimToLimit(card.headline, 50);
        card.body = trimToLimit(card.body, 150);
        break;
      case 'gremly_mood':
        card.mood_line = trimToLimit(card.mood_line, 30);
        card.hook = trimToLimit(card.hook, 120);
        break;
      case 'recommends':
        if (card.primary) {
          card.primary.title = trimToLimit(card.primary.title, 50);
          card.primary.body = trimToLimit(card.primary.body, 150);
        }
        if (card.secondary) {
          for (const rec of card.secondary) {
            rec.title = trimToLimit(rec.title, 40);
            rec.body = trimToLimit(rec.body, 100);
          }
        }
        break;
    }
  }

  // Build the parsed object for enforcement/injection
  let parsed = {
    cards: assembledCards,
    metadata: {
      week_type: plan.gremly_mood?.mood_line || '',
      mood: plan.gremly_mood?.mood_line || '',
      key_themes: (plan.detail_allocation?.opening_details || []).slice(0, 5),
      card_count: assembledCards.length,
      card_types_used: assembledCards.map(c => c.type),
      narrative_arc: plan.narrative_arc || '',
    },
    planner_debug: {
      has_candidates: !!(plan.candidates),
      has_selections: !!(plan.selections),
      diversity_check: plan.selections?.diversity_check || null,
      candidate_counts: plan.candidates ? {
        discovery: (plan.candidates.discovery_candidates || []).length,
        recommendation: (plan.candidates.recommendation_candidates || []).length,
        moment: (plan.candidates.moment_candidates || []).length,
        thread: (plan.candidates.thread_candidates || []).length,
      } : null,
      card_decisions: plan.card_decisions || null,
    },
  };

  // ── THEMATIC CLUSTERING MONITOR ──────────────────────────────────────
  {
    const themeMentions = {};
    for (const card of assembledCards) {
      const cardText = JSON.stringify(card).toLowerCase();
      // Check each thread name from the planner's thread picks
      const threadNames = plan.card_decisions?.thread_names_to_show || [];
      for (const name of threadNames) {
        const nameLower = name.toLowerCase();
        // Count substantial mentions (in primary fields, not just tags)
        let isPrimary = false;
        if (card.type === 'discoveries' && card.spotlight?.title?.toLowerCase().includes(nameLower)) isPrimary = true;
        if (card.type === 'recommends' && card.primary?.title?.toLowerCase().includes(nameLower)) isPrimary = true;
        if (card.type === 'moments' && card.moments?.[0]?.title?.toLowerCase().includes(nameLower)) isPrimary = true;
        if (card.type === 'gremly_mood' && card.hook?.toLowerCase().includes(nameLower)) isPrimary = true;
        
        if (isPrimary) {
          if (!themeMentions[name]) themeMentions[name] = [];
          themeMentions[name].push(card.type);
        }
      }
    }
    
    for (const [theme, cards] of Object.entries(themeMentions)) {
      if (cards.length >= 3) {
        console.warn(`[WeeklySummaryV2] THEME CLUSTERING: "${theme}" is primary focus on ${cards.length} cards: ${cards.join(', ')}`);
      }
    }
  }

  // ── STRUCTURAL ENFORCEMENT (deterministic — no AI) ──────────────────────
  if (parsed.cards) {
    const originalCount = parsed.cards.length;
    const removedTypes = [];

    // a. Enforce max 8 cards — removal priority: recommendation (legacy) → monthly_retro → recommends → moments
    // NEVER remove: stale_triage, opening, gremly_mood, thread_movements, week_ahead
    const removalPriority = ['recommendation', 'monthly_retro', 'recommends', 'moments'];
    while (parsed.cards.length > 8) {
      let removed = false;
      for (const targetType of removalPriority) {
        const idx = parsed.cards.findIndex(c => c.type === targetType);
        if (idx !== -1) {
          // Special handling: fold monthly_retro into week_ahead before removing
          if (targetType === 'monthly_retro') {
            const mrCard = parsed.cards[idx];
            const waCard = parsed.cards.find(c => c.type === 'week_ahead');
            if (waCard) {
              waCard.monthly_retro = {
                headline: mrCard.headline,
                body: mrCard.body,
                thread_arcs: mrCard.thread_arcs,
              };
            }
          }
          removedTypes.push(targetType);
          parsed.cards.splice(idx, 1);
          removed = true;
          break;
        }
      }
      if (!removed) break; // nothing left to remove safely
    }

    // b. Enforce max 2 moments
    const momCard = parsed.cards.find(c => c.type === 'moments');
    if (momCard && momCard.moments && momCard.moments.length > 2) {
      momCard.moments = momCard.moments.slice(0, 2);
    }

    console.log('[WeeklySummaryV2] Card enforcement:', {
      original_count: originalCount,
      final_count: parsed.cards.length,
      removed_types: removedTypes,
    });
  }

  // ── POST-PARSE INJECTION ────────────────────────────────────────────────
  if (parsed.cards) {
    // 1. Engagement stats on opening card — from real Supabase data
    const oCard = parsed.cards.find(c => c.type === 'opening');
    if (oCard && engagementStats) {
      oCard.engagement = {
        drops: engagementStats.drops || 0,
        sweeps: engagementStats.sweeps || 0,
        journals: engagementStats.journals || 0,
      };
    }

    // 2. badge_type on thread movements — infer from direction
    const tmCard = parsed.cards.find(c => c.type === 'thread_movements');
    if (tmCard && tmCard.threads) {
      const directionToBadgeType = {
        up: 'success',
        steady: 'info',
        milestone: 'warning',
        concluded: 'neutral',
        down: 'danger',
        paused: 'danger',
        new: 'info',
      };
      for (const thread of tmCard.threads) {
        if (!thread.badge_type) {
          thread.badge_type = directionToBadgeType[thread.direction] || 'neutral';
        }
      }
    }

    // 3. Stale headline — inject real count from data
    const staleCard = parsed.cards.find(c => c.type === 'stale_triage');
    if (staleCard) {
      const realCount = staleItems.length;
      // Keep the builder's body/context but override the headline with real count
      if (staleCard.headline) {
        staleCard.headline = staleCard.headline.replace(/\d+/, String(realCount));
      }
      // Also ensure items array length matches
      if (staleCard.items && staleCard.items.length !== realCount) {
        console.warn(`[WeeklySummaryV2] Stale count mismatch: headline implies ${realCount}, items has ${staleCard.items.length}`);
      }
    }

    // 4. Stale item IDs — match by title to real todos
    if (staleCard && staleCard.items) {
      for (const item of staleCard.items) {
        if (!item.item_id) {
          const match = (weeklySnapshot.todosDetail || []).find(t =>
            t.title && item.title &&
            (t.title.toLowerCase() === item.title.toLowerCase() ||
             t.title.toLowerCase().includes(item.title.toLowerCase()) ||
             item.title.toLowerCase().includes(t.title.toLowerCase()))
          );
          if (match) item.item_id = match.id;
        }
      }
    }
  }

  const latency = Date.now() - t0;

  console.log(`[WeeklySummaryV2] Complete in ${latency}ms`, {
    planner_in: plannerInputTokens,
    planner_out: plannerOutputTokens,
    builder_calls: builderCalls,
    card_count: parsed.cards?.length || 0,
    card_types: parsed.cards?.map(c => c.type) || [],
    mood: parsed.metadata?.mood,
  });

  return {
    summary: parsed,
    metadata: {
      latency_ms: latency,
      planner_input_tokens: plannerInputTokens,
      planner_output_tokens: plannerOutputTokens,
      builder_calls: builderCalls,
      model_planner: 'claude-sonnet-4-6',
      model_builder: 'claude-haiku-4-5-20251001',
      card_count: parsed.cards?.length || 0,
      card_types: parsed.cards?.map(c => c.type) || [],
    },
  };
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
async function fetchUserSnapshot(userId, timezone, windowDays, env, opts = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // --- Date math ---
  const targetDate = opts.targetDate || getUserLocalDate(timezone);
  const target = new Date(targetDate + 'T00:00:00Z');
  const targetEndOfDay = new Date(targetDate + 'T23:59:59.999Z');

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
    ).then(r => r.json()),

    // 1: Notes (non-events) — within window
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=neq.event&archived=eq.false&created_at=gte.${windowStartStr}&select=id,title,body,subtype,mood,space_id,created_at,is_goal&order=created_at.desc&limit=500`,
      { headers },
    ).then(r => r.json()),

    // 2: Calendar events (notes with subtype=event) — window + 14 day forward look
    // Also fetches multi-day events that started before the window but are still active (end_date >= windowStart)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&or=(and(target_date.gte.${windowStartStr},target_date.lte.${forwardWindowStr}),and(target_date.lt.${windowStartStr},end_date.gte.${windowStartStr}))&select=id,title,target_date,end_date,event_time,location,is_all_day,space_id,external_source&order=target_date.asc&limit=500`,
      { headers },
    ).then(r => r.json()),

    // 3: Habits — all active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,space_id,created_at,subtype,commitment&limit=50`,
      { headers },
    ).then(r => r.json()),

    // 4: Habit progress — within window
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${windowStartStr}&select=habit_id,occurred_day&limit=2000`,
      { headers },
    ).then(r => r.json()),

    // 5: Spaces — active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then(r => r.json()),

    // 6: Space milestones — active
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=id,title,name,date,space_id,completed,completed_at&order=date.asc&limit=50`,
      { headers },
    ).then(r => r.json()),
  ];

  // Conditional queries
  if (includeLifeMap) {
    // 7: Current Life Map
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map,version,rebuilt_at,updated_at`,
        { headers },
      ).then(r => r.json()),
    );
  }

  if (includePreviousDco) {
    // 8: Previous DCO
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${targetDate}&select=dco,date&order=date.desc&limit=1`,
        { headers },
      ).then(r => r.json()),
    );
  }

  if (includeWeeklySummaries) {
    // 9: Recent weekly summaries
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&select=week_start_date,content,stats_snapshot,key_themes&order=week_start_date.desc&limit=4`,
        { headers },
      ).then(r => r.json()),
    );
  }

  if (includeProfile) {
    // 10: User profile
    queries.push(
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,signals`,
        { headers },
      ).then(r => r.json()),
    );
  }

  const results = await Promise.all(queries);
  const safeArr = v => (Array.isArray(v) ? v : []);

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

  // --- Filter: only data on or before target date ---
  const todos = todosRaw.filter(
    t => !t.created_at || new Date(t.created_at) <= targetEndOfDay,
  );
  const drops = dropsRaw.filter(
    n => !n.created_at || new Date(n.created_at) <= targetEndOfDay,
  );
  const habitProgress = habitProgressRaw.filter(
    h => !h.occurred_day || h.occurred_day <= targetDate,
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
  const journals = drops.filter(n => n.subtype === 'journal');
  const moodSignal = snapshotComputeMoodSignal(journals);
  const spaceActivity = snapshotComputeSpaceActivity(drops, todos, spaceMap);

  // --- Calendar projections ---
  const todaysEvents = calendarEvents
    .filter(e => eventActiveOnDate(e, targetDate))
    .map(e => ({
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
    .filter(e => {
      const start = e.target_date;
      const end = e.end_date || e.target_date;
      // Event is upcoming if it starts after today, OR if it's multi-day and extends past today
      return (start > targetDate && start <= sevenAfterStr) ||
             (start <= targetDate && end > targetDate && end <= sevenAfterStr);
    })
    .slice(0, 15)
    .map(e => ({
      title: e.title,
      date: e.target_date,
      space: spaceMap[e.space_id] || null,
      space_id: e.space_id || null,
      is_synced: !!e.external_source,
    }));

  const fiveBeforeStr = formatDateOnly(new Date(target.getTime() - 5 * 86400000));
  const fiveAfterStr = formatDateOnly(new Date(target.getTime() + 5 * 86400000));

  const spaceKeyDates = calendarEvents
    .filter(e => {
      if (e.external_source || !e.space_id) return false;
      const end = e.end_date || e.target_date;
      return e.target_date <= fiveAfterStr && end >= fiveBeforeStr;
    })
    .map(e => ({
      date: e.target_date,
      title: e.title,
      space: spaceMap[e.space_id] || null,
      space_id: e.space_id || null,
    }));

  console.log(`[Snapshot] Built for ${userId.slice(0, 8)} (${targetDate}, ${windowDays}d window):`, {
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
  });

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
    if (evt.title && (
      evt.title.toLowerCase().startsWith('canceled:') ||
      evt.title.toLowerCase().startsWith('cancelled:')
    )) continue;

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
    t => t.target_date && t.target_date < targetDate && t.status !== 'completed' && !t.archived,
  ).length;
  const active = todos.filter(t => t.status === 'active' && !t.archived).length;
  const completedRecently = todos.filter(t => t.completed_at).length;

  return { overdue, active, completedRecently };
}

function snapshotComputeHabitHealth(habits, habitProgress, windowDays) {
  const completionMap = {};
  for (const hp of habitProgress) {
    completionMap[hp.habit_id] = (completionMap[hp.habit_id] || 0) + 1;
  }

  return habits.map(h => {
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

  const dropsLast3 = drops.filter(n => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= threeBeforeStr && d <= targetDate;
  }).length;

  const dropsPrev3 = drops.filter(n => {
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

  const topMoods = totalMoodTags > 0
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
    const dropCount = drops.filter(n => n.space_id === spaceId).length;
    const todoCount = todos.filter(t => t.space_id === spaceId && !t.archived).length;
    activity[spaceId] = {
      name: spaceMap[spaceId],
      recentDrops: dropCount,
      recentTodos: todoCount,
      totalRecent: dropCount + todoCount,
    };
  }

  return activity;
}

// ============================================================================
// Snapshot projections
// ============================================================================

/**
 * Build a compressed daily snapshot for the Life Map daily update.
 * Token-efficient: only what changed since last update + today's signals.
 * @param {object} snapshot - from fetchUserSnapshot(userId, tz, 7)
 * @returns {object} Compressed daily projection
 */
function buildDailySnapshot(snapshot) {
  const { raw, computed, calendar } = snapshot;

  // Recent drops — only last 2 days (what's new since last update)
  const twoDaysAgo = new Date(snapshot.targetDate + 'T00:00:00Z');
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const twoDaysAgoStr = formatDateOnly(twoDaysAgo);

  const recentDrops = raw.drops
    .filter(n => {
      const d = n.created_at ? n.created_at.split('T')[0] : null;
      return d && d >= twoDaysAgoStr && d <= snapshot.targetDate;
    })
    .slice(0, 15)
    .map(d => ({
      title: d.title,
      subtype: d.subtype,
      mood: d.mood || [],
      space: computed.spaceMap[d.space_id] || null,
      body: d.subtype === 'journal' && d.body ? d.body.slice(0, 200) : null,
      date: d.created_at ? d.created_at.split('T')[0] : null,
    }));

  // Habit completions — yesterday and today only
  const yesterdayStr = formatDateOnly(new Date(
    new Date(snapshot.targetDate + 'T00:00:00Z').getTime() - 86400000
  ));
  const recentHabitCompletions = raw.habitProgress
    .filter(hp => hp.occurred_day >= yesterdayStr)
    .reduce((acc, hp) => {
      acc[hp.habit_id] = (acc[hp.habit_id] || 0) + 1;
      return acc;
    }, {});

  // Milestones approaching (within 7 days)
  const sevenFromTarget = new Date(snapshot.targetDate + 'T00:00:00Z');
  sevenFromTarget.setUTCDate(sevenFromTarget.getUTCDate() + 7);
  const sevenFromTargetStr = formatDateOnly(sevenFromTarget);

  const approachingMilestones = raw.milestones
    .filter(m => !m.completed && m.date && m.date >= snapshot.targetDate && m.date <= sevenFromTargetStr)
    .map(m => ({
      title: m.title || m.name,
      date: m.date,
      space: computed.spaceMap[m.space_id] || null,
      daysAway: Math.ceil((new Date(m.date + 'T00:00:00Z') - new Date(snapshot.targetDate + 'T00:00:00Z')) / 86400000),
    }));

  return {
    targetDate: snapshot.targetDate,
    timezone: snapshot.timezone,

    // Today's signals
    todaysEvents: calendar.todaysEvents,
    upcomingEvents: calendar.upcomingEvents,
    spaceKeyDates: calendar.spaceKeyDates,
    approachingMilestones,

    // What's new (last 1-2 days)
    recentDrops,
    recentHabitCompletions,

    // Computed state
    todoStats: computed.todoStats,
    habitHealth: computed.habitHealth,
    dropVelocity: computed.dropVelocity,
    moodSignal: computed.moodSignal,
    spaceActivity: computed.spaceActivity,

    // Context references
    previousDco: raw.previousDco?.dco || null,
    previousDcoDate: raw.previousDco?.date || null,
    userProfile: raw.userProfile?.profile_text || null,
    weeklyDigest: raw.weeklySummaries?.[0] || null,

    // Spaces list
    spaces: raw.spaces.map(s => ({
      id: s.id,
      name: s.name,
      activity: computed.spaceActivity[s.id]?.totalRecent || 0,
    })),
  };
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
  const todosDetail = raw.todos.map(t => ({
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
  const milestonesDetail = raw.milestones.map(m => ({
    title: m.title || m.name,
    date: m.date,
    space: computed.spaceMap[m.space_id] || null,
    space_id: m.space_id || null,
    completed: m.completed,
    daysFromTarget: m.date
      ? Math.ceil((new Date(m.date + 'T00:00:00Z') - new Date(snapshot.targetDate + 'T00:00:00Z')) / 86400000)
      : null,
  }));

  return {
    targetDate: snapshot.targetDate,
    timezone: snapshot.timezone,
    windowDays: snapshot.windowDays,

    // Full data
    dropsByDay,
    todosDetail,
    journals: raw.journals.map(j => ({
      id: j.id,
      title: j.title,
      body: j.body ? j.body.slice(0, 500) : null,
      mood: j.mood || [],
      space: computed.spaceMap[j.space_id] || null,
      space_id: j.space_id || null,
      date: j.created_at ? j.created_at.split('T')[0] : null,
    })),
    calendarEvents: calendar.todaysEvents.concat(calendar.upcomingEvents),
    allCalendarEvents: raw.calendarEvents.map(e => ({
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
    spaces: raw.spaces.map(s => ({
      id: s.id,
      name: s.name,
      activity: computed.spaceActivity[s.id] || { recentDrops: 0, recentTodos: 0, totalRecent: 0 },
    })),
    weeklySummaries: raw.weeklySummaries,
    userProfile: raw.userProfile?.profile_text || null,
    currentLifeMap: raw.currentLifeMap?.life_map || null,
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
      const dates = events.map(e => e.target_date || e.date).filter(Boolean).sort();
      const weekdays = dates.map(d => new Date(d + 'T00:00:00Z').getUTCDay());
      const uniqueWeekdays = [...new Set(weekdays)];
      const isRecurring = events.length >= 2 && uniqueWeekdays.length <= 2;

      if (isRecurring) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const recurringDays = uniqueWeekdays.map(d => dayNames[d]).join(' & ');
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
    lines.push(`\nDOMAIN: "${domain.name}" [${domain.source}]`);
    for (const thread of (domain.threads || [])) {
      const firstSentence = thread.summary ? thread.summary.split(/\.\s/)[0] + '.' : 'No summary.';
      lines.push(`  THREAD: "${thread.name}" | ${thread.status} | ${thread.momentum} | ${thread.importance} | ${thread.lifecycle}`);
      lines.push(`    ${firstSentence}`);
    }
  }
  return lines.join('\n');
}

async function runUnifiedAnalyst(weeklySnapshot, lifeMap, weekStart, weekEnd, env) {
  const t0 = Date.now();

  const lifeMapRef = formatLifeMapForAnalyst(lifeMap);
  const cleanedEvents = cleanCalendarForAnalyst(
    weeklySnapshot.allCalendarEvents || [],
    weeklySnapshot.targetDate,
  );

  // Build day-by-day habit progress from raw data
  const habitDayDetail = {};
  const habitNameMap = {};
  for (const h of (weeklySnapshot.habits || [])) {
    habitNameMap[h.id] = h.name;
  }
  const rawHabitProgress = weeklySnapshot.habitProgressByWeek
    ? Object.entries(weeklySnapshot.habitProgressByWeek)
    : [];

  const systemPrompt = `You are a meticulous analyst for a personal productivity app called Gremly. You receive 21 days of raw user data plus a reference to their existing Life Map (a structured understanding of their life domains and threads).

Your job: Deeply analyze the week of ${weekStart} to ${weekEnd}. Organize EVERYTHING into a structured extraction that serves two downstream consumers — a Life Map rebuild AI and a weekly summary storyteller AI. Both need maximum detail organized clearly.

CRITICAL: Preserve specifics. Include journal quotes, todo titles, event names, habit day-by-day data. Your output is the PRIMARY source both downstream AIs read. If you summarize away a detail, it's lost. When in doubt, include it.

ANALYSIS WINDOW: ${weekStart} to ${weekEnd}
Data outside this range is CONTEXT (prior weeks for trends). Do not conflate past and future.

EXISTING LIFE MAP — organize your theme-level findings against these threads:
${lifeMapRef}

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no backticks:
{
  "themes": [
    {
      "life_map_thread": "exact thread name from Life Map, or null if new",
      "life_map_domain": "exact domain name from Life Map, or null if new",
      "label": "use thread name if mapped, descriptive label if new",
      "this_week": {
        "activity_count": 0,
        "notable_items": ["specific items with dates — journal titles, todo names, event names. Include ALL relevant items, not just top 3"],
        "journal_quotes": ["YYYY-MM-DD: 'actual quoted text from journal body' — include every quote relevant to this thread"],
        "completed_todos": ["todo titles completed this week connected to this thread"],
        "active_todos": ["todo titles still active connected to this thread"],
        "habit_data": "habit name: X/Y completions this week, completed on [specific days] — or null if no habit for this thread",
        "events": ["YYYY-MM-DD: event title — brief note on significance"],
        "day_pattern": "which specific days had activity and what kind"
      },
      "trajectory": "building | consistent | declining | milestone_approaching | stalled | concluded | reactivated",
      "trajectory_reasoning": "one sentence explaining why, referencing specific data from this week AND trend from prior weeks",
      "emotional_signal": "mood tags and journal sentiment connected to this theme — quote the user's words. Or null if no emotional data",
      "evidence_refs": ["type:specific item — e.g. habit:Run 3x Week 2/3, journal:2026-03-08 'very refreshed', todo:Book 10km completed"],
      "lifecycle_signal": "active | approaching_dormant | concluded | reactivated | null",
      "lifecycle_reasoning": "max 10 words — why this lifecycle state",
      "importance": "high | medium | low",
      "narrative_interest": 0,
      "narrative_interest_reasoning": "one sentence — why this score"
    }
  ],

  "week_timeline": {
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
  },

  "event_analysis": {
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
  },

  "behavioral_fingerprints": [
    {
      "pattern": "short label — e.g. weekend_sprinter, stress_skips_exercise, travel_fitness_maintainer",
      "evidence": "specific data — e.g. '11 of 15 completions landed Thu-Sun'",
      "is_novel": false,
      "narrative_interest": 0,
      "threads_involved": ["thread names this pattern spans"],
      "is_discovery_candidate": false
    }
  ],

  "cross_references": [
    {
      "connection": "how two or more threads interacted this week",
      "threads": ["thread name 1", "thread name 2"],
      "items": ["specific item titles showing the connection"],
      "significance": "why this connection matters for the user's story",
      "narrative_interest": 0
    }
  ],

  "magic_moment_candidates": [
    {
      "title": "short evocative title",
      "date": "YYYY-MM-DD",
      "why": "why this moment stands out — be specific",
      "connected_items": ["related item titles"],
      "enrichment_hint": "what real-world knowledge would make this richer — e.g. 'late February Tokyo weather', 'shinkansen Mount Fuji views'",
      "journal_quote": "the user's own words about this moment if available, or null"
    }
  ],

  "stale_items": [
    {
      "title": "item title",
      "days_stale": 0,
      "domain_hint": "which Life Map domain this likely belongs to",
      "severity": "low | medium | high"
    }
  ],

  "engagement_metrics": {
    "drops_this_week": 0,
    "completions_this_week": 0,
    "habit_overall_rate": "X% — across all habits",
    "active_todos": 0,
    "stale_todos_over_14d": 0,
    "journals_written": 0
  },

  "new_theme_candidates": [
    {
      "label": "descriptive name for the pattern",
      "unmatched_items": ["specific titles/dates that don't fit existing threads"],
      "evidence_count": 0,
      "date_span": ["earliest date", "latest date"],
      "suggested_domain": "existing domain name this might belong to, or null for genuinely new",
      "reasoning": "why this is distinct from existing threads"
    }
  ],

  "week_shape": {
    "classification": "2-4 word week type — e.g. 'honeymoon immersion', 'launch sprint', 'recovery week'",
    "dominant_theme": "the single thread/domain that dominated this week",
    "mood_arc": "how emotional tone shifted across the week — reference specific journal entries by date",
    "highlight": "single most notable moment with date and brief description",
    "concern": "single most notable concern or risk, or null"
  }
}

ANALYSIS RULES:

THEME MAPPING:
- Map every data point (journal, todo, habit, event, drop) to an existing Life Map thread where it naturally fits.
- One data point can appear in multiple themes if it genuinely connects to multiple threads.
- If a data point doesn't naturally fit ANY existing thread, do NOT force it — put it in new_theme_candidates.
- Include a theme entry for every Life Map thread that had ANY activity this week, even minimal.
- For threads with ZERO activity this week, only include them if the absence is notable (e.g. a daily habit with no completions).

BUNDLED HABIT THEMES:
When a single theme contains multiple habits and their trajectories diverge (one hitting target, one not), you MUST note BOTH signals separately in the trajectory_reasoning. Do not let a declining habit drag down the trajectory label of a theme where another habit is succeeding. If the theme overall is "declining" because one habit dominates, add a field:
      "individual_habit_wins": ["Habit Name: X/Y this week — hit target"]
This ensures individual wins are visible even in a declining theme. Only include habits that met or exceeded their weekly target.

EVENT SCORING:
- HIGH (7-10): Travel (flights, trips, arrivals), personal milestones, PTO/vacation, one-off significant social events, health appointments, multi-day events.
- MEDIUM (4-6): One-off work meetings, deadlines, project milestones, personal errands.
- LOW (1-3): Recurring meetings (daily standups, weekly syncs, bi-weekly 1:1s, all-hands, internal huddles), admin tasks (timesheets). These are routine noise.
- Events with a non-work space (Honeymoon, Health, etc.) score higher.
- Events tied to a Life Map thread with high importance score higher.

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
- Severity: high = important domain + 30+ days, medium = 14-30 days, low = minor items.`;

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
    const nonJournal = drops.filter(d => d.subtype !== 'journal');
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
  const completed = (weeklySnapshot.todosDetail || []).filter(t => t.completed_at);
  const active = (weeklySnapshot.todosDetail || []).filter(t => t.status === 'active' && !t.archived);
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
      const targetDate = weeklySnapshot.targetDate || new Date().toISOString().split('T')[0];
      const daysSinceCreation = t.created_at
        ? Math.floor((new Date(targetDate + 'T00:00:00Z') - new Date(t.created_at + 'T00:00:00Z')) / 86400000)
        : null;
      const stale = daysSinceCreation !== null && daysSinceCreation > 14
        ? ` [STALE ${daysSinceCreation}d]` : '';
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

  for (const h of (weeklySnapshot.habits || [])) {
    dataLines.push(`  ${h.name}: ${h.completions}/${h.expected} (${h.score_pct}%) — frequency: ${h.frequency}`);
    // Add day-by-day completions
    const days = (habitDayMap[h.id] || []).sort();
    if (days.length > 0) {
      // Split into this week vs other weeks
      const thisWeek = days.filter(d => d >= weekStart && d <= weekEnd);
      const otherWeeks = days.filter(d => d < weekStart || d > weekEnd);
      dataLines.push(`    THIS WEEK (${weekStart} to ${weekEnd}): ${thisWeek.length > 0 ? thisWeek.join(', ') : 'none'}`);
      if (otherWeeks.length > 0) {
        dataLines.push(`    Prior weeks: ${otherWeeks.join(', ')}`);
      }
    } else {
      dataLines.push(`    No completions logged in 21-day window.`);
    }
  }

  dataLines.push('\n=== MILESTONES ===');
  if ((weeklySnapshot.milestones || []).length === 0) {
    dataLines.push('  No active milestones.');
  }
  for (const m of (weeklySnapshot.milestones || [])) {
    const status = m.completed ? ' [COMPLETED]' : '';
    const days = m.daysFromTarget !== null
      ? ` (${m.daysFromTarget > 0 ? m.daysFromTarget + ' days away' : m.daysFromTarget === 0 ? 'TODAY' : Math.abs(m.daysFromTarget) + ' days ago'})`
      : '';
    const space = m.space ? ` [${m.space}]` : '';
    dataLines.push(`  ${m.title}: ${m.date || 'no date'}${days}${space}${status}`);
  }

  dataLines.push('\n=== MOOD SUMMARY ===');
  if (weeklySnapshot.moodSignal?.topMoods?.length > 0) {
    const moodStr = weeklySnapshot.moodSignal.topMoods
      .map(m => `${m.mood}: ${m.count} (${m.pct}%)`)
      .join(', ');
    dataLines.push(`  ${moodStr} — from ${weeklySnapshot.moodSignal.journalCount} journal(s)`);
  } else {
    dataLines.push('  No mood data.');
  }

  // Count drops and journals for the full week window
  const weekDropsCount = Object.entries(weeklySnapshot.dropsByDay || {}).reduce((sum, [day, drops]) => {
    if (day >= weekStart && day <= weekEnd) return sum + drops.length;
    return sum;
  }, 0);
  const weekJournalsCount = (weeklySnapshot.journals || []).filter(j => j.date >= weekStart && j.date <= weekEnd).length;
  const weekCompletions = (weeklySnapshot.todosDetail || []).filter(t => t.completed_at && t.completed_at >= weekStart && t.completed_at <= weekEnd).length;

  dataLines.push('\n=== ENGAGEMENT STATS ===');
  dataLines.push(`  Total drops this week: ${weekDropsCount}`);
  dataLines.push(`  Journals written this week: ${weekJournalsCount}`);
  dataLines.push(`  Todos completed this week: ${weekCompletions}`);
  dataLines.push(`  Todos: ${weeklySnapshot.todoStats.overdue} overdue, ${weeklySnapshot.todoStats.active} active`);
  dataLines.push(`  Drop velocity: ${weeklySnapshot.dropVelocity.velocity} (${weeklySnapshot.dropVelocity.dropsLast3} last 3d, ${weeklySnapshot.dropVelocity.dropsPrev3} prev 3d)`);

  dataLines.push('\n=== SPACES (with recent activity) ===');
  for (const s of (weeklySnapshot.spaces || [])) {
    const a = s.activity || {};
    if (a.totalRecent > 0) {
      dataLines.push(`  ${s.name}: ${a.recentDrops} drops, ${a.recentTodos} todos (${a.totalRecent} total recent)`);
    } else {
      dataLines.push(`  ${s.name}: no recent activity`);
    }
  }

  if (weeklySnapshot.userProfile) {
    dataLines.push('\n=== USER PROFILE ===');
    dataLines.push(`  ${weeklySnapshot.userProfile}`);
  }

  if (weeklySnapshot.weeklySummaries?.length > 0) {
    dataLines.push('\n=== PRIOR WEEKLY SUMMARIES (trend context — these are PAST weeks, not this week) ===');
    for (const ws of weeklySnapshot.weeklySummaries.slice(0, 3)) {
      const content = ws.content || ws;
      const commentary = content.weeklyCommentary || content.commentary || 'N/A';
      const weekType = content.weekType || content.weekTypeShort || 'N/A';
      const mood = content.mood || 'N/A';
      dataLines.push(`  ${ws.week_start_date}: [${weekType}] mood: ${mood}`);
      dataLines.push(`    "${commentary}"`);
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
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this user's data for the week of ${weekStart} to ${weekEnd}. Produce the comprehensive unified analysis. Preserve all specifics — journal quotes, todo titles, event names, habit details.\n\n${dataPayload}`,
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
  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    console.warn('[UnifiedAnalyst] Initial parse failed, using jsonrepair:', e.message);
    try {
      parsed = JSON.parse(jsonrepair(cleanedText));
      console.log('[UnifiedAnalyst] jsonrepair succeeded');
    } catch (repairErr) {
      console.error('[UnifiedAnalyst] jsonrepair also failed:', repairErr.message);
      console.error('[UnifiedAnalyst] First 500:', cleanedText.substring(0, 500));
      parsed = { parseError: e.message, raw: cleanedText };
    }
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
// Phase 2: Build the world picture (formatter — no opinions, no ranking)
//
// Takes the Life Map (accumulated understanding) + today's snapshot (fresh data)
// and produces a structured text document for Flash to read.
//
// Code does: date math, percentages, deduplication, joining, formatting.
// Code does NOT: filter threads, rank importance, detect context, suppress events.
// All editorial judgment is Flash's job.
// ============================================================================

function buildWorldPicture(snapshot) {
  const { raw, computed, calendar } = snapshot;
  const lifeMap = raw.currentLifeMap?.life_map;
  const targetDate = snapshot.targetDate;
  const target = new Date(targetDate + 'T00:00:00Z');

  if (!lifeMap?.domains) {
    return { text: '(No Life Map exists for this user.)', lifeMap: null };
  }

  const parts = [];

  // ── Section 1: Date and timezone ──
  parts.push(`TODAY: ${targetDate}`);
  parts.push(`TIMEZONE: ${snapshot.timezone}`);

  // ── Section 2: The Life Map (ALL domains, ALL threads, full detail) ──
  parts.push('\n=== LIFE MAP (accumulated understanding from weekly deep analysis) ===');

  for (const domain of lifeMap.domains) {
    const spaceLabel = domain.source === 'space' ? `space: ${domain.space_id}` : 'ai_detected';
    parts.push(`\nDOMAIN: "${domain.name}" [${spaceLabel}]`);

    for (const thread of (domain.threads || [])) {
      parts.push(`\n  THREAD: "${thread.name}"`);
      parts.push(`    status: ${thread.status}`);
      parts.push(`    momentum: ${thread.momentum}`);
      parts.push(`    importance: ${thread.importance}`);
      parts.push(`    lifecycle: ${thread.lifecycle}`);
      parts.push(`    last_activity: ${thread.last_activity || 'unknown'}`);

      if (thread.summary) {
        parts.push(`    summary: "${thread.summary}"`);
      }
      if (thread.recent_update) {
        parts.push(`    recent_update: "${thread.recent_update}"`);
      }

      if (thread.evidence?.length > 0) {
        const recent = thread.evidence.slice(-5);
        parts.push('    recent evidence:');
        for (const e of recent) {
          parts.push(`      ${e.date}: [${e.type}] ${e.signal} (${e.salience})`);
        }
      }
    }
  }

  // ── Section 3: Today's calendar ──
  parts.push('\n=== TODAY\'S CALENDAR EVENTS ===');
  if (calendar.todaysEvents.length > 0) {
    for (const e of calendar.todaysEvents) {
      const time = e.time ? ` at ${e.time}` : '';
      const loc = e.location ? ` (${e.location})` : '';
      const space = e.space ? ` [${e.space}]` : '';
      const synced = e.is_synced ? ' {synced calendar}' : ' {key date}';
      parts.push(`  ${e.title}${time}${loc}${space}${synced}`);
    }
  } else {
    parts.push('  No events today.');
  }

  // ── Section 4: Upcoming events (next 7 days) ──
  parts.push('\n=== UPCOMING EVENTS (next 7 days) ===');
  if (calendar.upcomingEvents.length > 0) {
    for (const e of calendar.upcomingEvents) {
      const daysAway = Math.ceil(
        (new Date(e.date + 'T00:00:00Z') - target) / 86400000,
      );
      const space = e.space ? ` [${e.space}]` : '';
      parts.push(`  ${e.date} (${daysAway} days): ${e.title}${space}`);
    }
  } else {
    parts.push('  Nothing scheduled.');
  }

  // ── Section 5: Milestones with date math ──
  parts.push('\n=== MILESTONES ===');
  if (raw.milestones.length > 0) {
    for (const m of raw.milestones) {
      const space = computed.spaceMap[m.space_id] || null;
      const spaceLabel = space ? ` [${space}]` : '';
      const done = m.completed ? ' ✓ COMPLETED' : '';
      let dateInfo = '';
      if (m.date) {
        const daysAway = Math.ceil(
          (new Date(m.date + 'T00:00:00Z') - target) / 86400000,
        );
        if (daysAway === 0) dateInfo = ' — TODAY';
        else if (daysAway > 0) dateInfo = ` — ${daysAway} days away`;
        else dateInfo = ` — ${Math.abs(daysAway)} days ago`;
      }
      parts.push(`  ${m.title || m.name}: ${m.date || 'no date'}${dateInfo}${spaceLabel}${done}`);
    }
  } else {
    parts.push('  No milestones.');
  }

  // ── Section 6: Recent drops (last 2 days) ──
  const twoDaysAgo = formatDateOnly(new Date(target.getTime() - 2 * 86400000));
  const recentDrops = raw.drops
    .filter(n => {
      const d = n.created_at ? n.created_at.split('T')[0] : null;
      return d && d >= twoDaysAgo;
    })
    .slice(0, 15);

  parts.push('\n=== RECENT DROPS (last 1-2 days — new since last daily update) ===');
  if (recentDrops.length > 0) {
    for (const d of recentDrops) {
      const mood = d.mood?.length > 0 ? ` [mood: ${d.mood.join(', ')}]` : '';
      const space = computed.spaceMap[d.space_id] || null;
      const spaceLabel = space ? ` (${space})` : '';
      const date = d.created_at ? d.created_at.split('T')[0] : '';
      const body = d.subtype === 'journal' && d.body ? `\n    "${d.body.slice(0, 300)}"` : '';
      parts.push(`  ${date}: [${d.subtype || 'note'}] ${d.title}${mood}${spaceLabel}${body}`);
    }
  } else {
    parts.push('  No recent drops.');
  }

  // ── Section 7: Habit health ──
  parts.push('\n=== HABIT HEALTH (last 7 days) ===');
  if (computed.habitHealth.length > 0) {
    for (const h of computed.habitHealth) {
      const space = computed.spaceMap[h.space_id] || null;
      const spaceLabel = space ? ` [${space}]` : '';
      parts.push(`  ${h.name} (${h.frequency}): ${h.completions}/${h.expected} (${h.score_pct}%)${spaceLabel}`);
    }
  } else {
    parts.push('  No habits tracked.');
  }

  // ── Section 8: Mood signal ──
  parts.push('\n=== MOOD (from journals, last 7 days) ===');
  if (computed.moodSignal.topMoods.length > 0) {
    const moodStr = computed.moodSignal.topMoods
      .map(m => `${m.mood}: ${m.count} (${m.pct}%)`)
      .join(', ');
    parts.push(`  ${moodStr} — from ${computed.moodSignal.journalCount} journal(s)`);
  } else {
    parts.push('  No mood data.');
  }

  // ── Section 9: Todo stats ──
  parts.push('\n=== TODOS ===');
  parts.push(`  ${computed.todoStats.overdue} overdue, ${computed.todoStats.active} active, ${computed.todoStats.completedRecently} completed recently`);

  // ── Section 10: Drop velocity ──
  parts.push('\n=== DROP VELOCITY ===');
  parts.push(`  ${computed.dropVelocity.velocity} (${computed.dropVelocity.dropsLast3} last 3 days, ${computed.dropVelocity.dropsPrev3} previous 3 days)`);

  // ── Section 11: Previous headline ──
  const prevDco = raw.previousDco?.dco;
  if (prevDco?.brief_headline) {
    parts.push(`\n=== PREVIOUS HEADLINE (${raw.previousDco.date}) ===`);
    parts.push(`  "${prevDco.brief_headline}"`);
    parts.push('  Write something with a completely different structure and angle.');
  }

  // ── Section 12: User profile ──
  if (raw.userProfile?.profile_text) {
    parts.push('\n=== USER PROFILE ===');
    parts.push(`  ${raw.userProfile.profile_text}`);
  }

  const text = parts.join('\n');

  console.log(`[WorldPicture] Built for ${snapshot.userId.slice(0, 8)}: ${text.length} chars, ${lifeMap.domains.length} domains`);

  return { text, lifeMap };
}

async function updateLifeMapAndFocus(lifeMap, worldPictureText, env) {
  const t0 = Date.now();

  const systemPrompt = `You are producing a Daily Context Object (DCO) — a snapshot of what is true about this person's life TODAY.

You have two sources of truth:

1. THE LIFE MAP — An accumulated understanding of the user's life, built by deep weekly analysis. It contains domains and threads with statuses, momentum, summaries, and evidence built over weeks of observation. The Life Map tells you what this person cares about, what ongoing arcs they are inside, and what trajectories are building or declining. Treat the Life Map as the deeper truth about this person's life.

2. TODAY'S FRESH DATA — Calendar events, recent drops and journals, habit completions, milestones, todo stats from the last 24-48 hours. This tells you what is specifically happening today and what makes today different from yesterday.

YOUR JOB: Read both sources. When they align, the picture is clear. When they conflict, reason about which source is more likely to reflect reality — the Life Map's deep accumulated understanding, or a single day's raw signals. Then produce a DCO that reads like it was written by someone who truly knows this person's life.

TIMING: This runs at the START of the user's day. The DCO is a morning brief — it should frame what is ahead and what matters today, not recap what already happened. Recent drops and journals provide emotional context and continuity, but the daily focus should be forward-looking: what is today, where is the user, what is coming up, what threads are active right now.

You have two jobs in this call:

JOB 1 — UPDATE LIFE MAP THREADS
For each thread that has new data to absorb (check last_activity dates against today's fresh data), write a small update:
- recent_update: A fresh 1-2 sentence note reflecting the latest state
- momentum: Adjust ONLY if today's data clearly shows a direction change
- status: Adjust ONLY if today's data clearly warrants it
- new_evidence: Add 0-3 structured evidence entries from today's new data

STRICT RULES:
- Do NOT create new domains or threads
- Do NOT rename or delete anything
- Do NOT rewrite the "summary" field (only changed in weekly rebuilds)
- Do NOT change lifecycle
- Skip threads with no new data to process

JOB 2 — PRODUCE THE DAILY FOCUS
Read the entire world picture and make these editorial decisions:

lead_story: What is the single most important thing about this person's life TODAY? Pick the thread that best captures where they are right now. Use the Life Map to understand the significance and today's data for the specifics. The lead_story MUST reference an actual thread from the Life Map by exact domain and thread name.

secondary: A second thread worth noting today. Must also reference an actual Life Map thread.

life_moment: A short phrase (2-6 words) capturing the dominant context of this person's life RIGHT NOW. Derived from the Life Map's deepest understanding of what arc they are inside. If nothing stands out, null.

tone: The emotional register of today based on ALL signals. One of: "relaxed", "focused", "stretched", "recovering", "celebratory"

day_type: One of: "event_day", "work_day", "milestone_day", "routine_day", "quiet_day", "transition_day"

today_focus: 1-3 concrete things that specifically matter TODAY. Not general themes — specific items with dates, names, or numbers that are relevant to this particular day.

named_anchors: People, places, trips, or projects explicitly mentioned in today's data. Only proper nouns actually present in the data. Never invent.

CRITICAL:
- lead_story and secondary MUST use exact domain and thread names from the Life Map.
- "detail" must be specific and concrete to TODAY — dates, locations, countdowns, recent events. Not a restatement of the thread summary.
- "why_today" is your editorial reasoning in one sentence — why this thread matters more than others TODAY specifically.

OUTPUT — return ONLY this JSON:
{
  "thread_updates": [
    {
      "domain": "exact domain name from Life Map",
      "thread": "exact thread name from Life Map",
      "recent_update": "fresh 1-2 sentence note",
      "momentum": "strong_upward|upward|steady|fluctuating|declining|stalled",
      "status": "current or adjusted status",
      "new_evidence": [
        {
          "type": "journal|habit|todo|drop|calendar|milestone|chat|sweep",
          "source": null,
          "date": "YYYY-MM-DD",
          "signal": "short factual description",
          "salience": "high|medium|low"
        }
      ]
    }
  ],
  "daily_focus": {
    "lead_story": {
      "domain": "exact domain name",
      "thread": "exact thread name",
      "detail": "specific to today — concrete, with dates or countdowns",
      "why_today": "one sentence editorial reasoning"
    },
    "secondary": {
      "domain": "exact domain name",
      "thread": "exact thread name",
      "detail": "specific to today"
    },
    "life_moment": "short phrase or null",
    "tone": "relaxed|focused|stretched|recovering|celebratory",
    "day_type": "event_day|work_day|milestone_day|routine_day|quiet_day|transition_day",
    "today_focus": ["specific item 1", "specific item 2", "specific item 3"],
    "named_anchors": [{"label": "Name", "type": "person|trip|project|event|place", "source": "life_map|drop|calendar"}]
  }
}`;

  const userMessage = worldPictureText;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 2048 },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Life Map daily update failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  const data = await response.json();

  const candidate = data.candidates?.[0];
  let content = '{}';
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text && !part.thought) {
        content = part.text;
        break;
      }
    }
  }

  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let result;
  try {
    result = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[LifeMap:DailyUpdate] JSON parse failed. Raw:', content.slice(0, 500));
    throw new Error(`Life Map daily update parse error: ${parseErr.message}`);
  }

  const latency = Date.now() - t0;
  const usage = data.usageMetadata;

  console.log(`[LifeMap:DailyUpdate] Complete in ${latency}ms`, {
    input_tokens: usage?.promptTokenCount,
    output_tokens: usage?.candidatesTokenCount,
    thinking_tokens: usage?.thoughtsTokenCount || 0,
    thread_updates: result.thread_updates?.length || 0,
    lead_story: result.daily_focus?.lead_story?.thread || 'none',
    life_moment: result.daily_focus?.life_moment || 'none',
  });

  return result;
}

/**
 * Merge Flash thread updates back into the full Life Map.
 * Only touches: recent_update, momentum, status, evidence (append).
 * Never touches: summary, importance, lifecycle, domain structure.
 */
function mergeLifeMapUpdates(lifeMap, threadUpdates) {
  if (!lifeMap?.domains || !threadUpdates) return lifeMap;

  for (const update of threadUpdates) {
    // Find the matching domain and thread
    const domain = lifeMap.domains.find(d => d.name === update.domain);
    if (!domain) {
      console.warn(`[LifeMap:Merge] Domain not found: "${update.domain}"`);
      continue;
    }

    const thread = (domain.threads || []).find(t => t.name === update.thread);
    if (!thread) {
      console.warn(`[LifeMap:Merge] Thread not found: "${update.domain}" → "${update.thread}"`);
      continue;
    }

    // Apply updates
    if (update.recent_update) {
      thread.recent_update = update.recent_update;
    }
    if (update.momentum) {
      thread.momentum = update.momentum;
    }
    if (update.status) {
      thread.status = update.status;
    }

    // Append new evidence (deduplicate — skip if same date+signal already exists)
    if (update.new_evidence && Array.isArray(update.new_evidence)) {
      if (!thread.evidence) thread.evidence = [];
      for (const e of update.new_evidence) {
        const isDuplicate = thread.evidence.some(
          existing => existing.date === e.date && existing.signal === e.signal,
        );
        if (!isDuplicate) {
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
  }

  // Update the Life Map's updated_at timestamp
  lifeMap.updated_at = new Date().toISOString();

  return lifeMap;
}

// ============================================================================
// Phase 2: Backward-compatible DCO assembly + simplified headline
// ============================================================================

/**
 * Assemble a backward-compatible DCO from the daily focus + snapshot.
 * The dco column in user_daily_state keeps working for all existing consumers.
 * New fields (lead_story, daily_focus) are additive.
 */
function assembleDcoFromFocus(dailyFocus, headline, snapshot) {
  const { computed, calendar } = snapshot;

  // Derive life_moment from lead story
  const lifeMoment = dailyFocus.lead_story
    ? `${dailyFocus.lead_story.domain}: ${dailyFocus.lead_story.detail}`
    : null;

  // Habit streak risk
  const habitStreakRisk = computed.habitHealth
    .filter(h => h.score_pct < 50)
    .map(h => h.name);

  // Overall habit health signal
  const avgHabitScore = computed.habitHealth.length > 0
    ? computed.habitHealth.reduce((sum, h) => sum + h.score_pct, 0) / computed.habitHealth.length
    : 0;
  let habitHealthSignal = 'mixed';
  if (avgHabitScore >= 75) habitHealthSignal = 'strong';
  else if (avgHabitScore < 40) habitHealthSignal = 'declining';

  // Mood signal
  const topMood = computed.moodSignal.topMoods[0]?.mood || 'neutral';
  let moodSignal = 'neutral';
  const positiveMoods = ['grateful', 'happy', 'great', 'excited', 'hopeful', 'calm', 'proud'];
  const negativeMoods = ['anxious', 'stressed', 'overwhelmed', 'sad', 'frustrated', 'tired'];
  if (positiveMoods.includes(topMood)) moodSignal = 'positive';
  else if (negativeMoods.includes(topMood)) moodSignal = 'negative';

  // Today focus items
  const todayFocusItems = [];
  if (computed.todoStats.overdue > 0) todayFocusItems.push(`${computed.todoStats.overdue} overdue todos`);
  if (calendar.todaysEvents.length > 0) {
    todayFocusItems.push(...calendar.todaysEvents.slice(0, 2).map(e => e.title));
  }
  if (dailyFocus.lead_story) {
    todayFocusItems.push(dailyFocus.lead_story.detail);
  }

  return {
    // Backward-compatible fields
    day_type: dailyFocus.day_type,
    life_moment: lifeMoment,
    life_moment_confidence: dailyFocus.lead_story ? 'high' : 'low',
    tone: dailyFocus.tone,
    brief_headline: headline,
    named_anchors: [],
    active_today: {
      calendar_events: calendar.todaysEvents.map(e => e.title),
      overdue_todos: computed.todoStats.overdue,
      habit_streak_risk: habitStreakRisk,
      upcoming_in_7d: calendar.upcomingEvents.slice(0, 5).map(e => `${e.date}: ${e.title}`),
    },
    deltas: {
      drop_velocity: computed.dropVelocity.velocity,
      habit_health: habitHealthSignal,
      mood_signal: moodSignal,
      notable_change: null,
    },
    today_focus: todayFocusItems.slice(0, 3),
    weekly_digest: null,

    // NEW fields (additive)
    lead_story: dailyFocus.lead_story,
    daily_focus: dailyFocus,

    // Metadata
    user_id: snapshot.userId,
    date: snapshot.targetDate,
    generated_at: new Date().toISOString(),
    ttl_days: 7,
    model_used: 'gemini-2.5-flash',
    pipeline: 'life-map-v2',
  };
}

async function generateHeadlineFromFocus(dailyFocus, snapshot, env) {
  const t0 = Date.now();

  if (!dailyFocus?.lead_story) {
    console.log('[Headline] No lead story — returning null');
    return null;
  }

  const lead = dailyFocus.lead_story;
  const secondary = dailyFocus.secondary;
  const prevDco = snapshot.raw.previousDco?.dco;
  const prevHeadline = prevDco?.brief_headline || null;

  const prompt = `You write a single line that appears on a companion app's morning screen. Your job is to OBSERVE what is true about today — not to advise, encourage, or motivate.

TODAY is ${snapshot.targetDate}.

THE LEAD STORY (already selected — write about THIS):
  Domain: ${lead.domain}
  Thread: ${lead.thread}
  Detail: ${lead.detail}
  Why today: ${lead.why_today}

${secondary ? `SECONDARY (for optional color):
  ${secondary.domain} → ${secondary.thread}: ${secondary.detail}` : ''}

TONE: ${dailyFocus.tone}
LIFE MOMENT: ${dailyFocus.life_moment || 'none'}

${prevHeadline ? `PREVIOUS HEADLINE: "${prevHeadline}"
Write something with a completely different structure.` : ''}

RULES:
- Maximum 10 words.
- State what is true about today. That is all.
- Reference the lead story — use concrete details from it.
- No exclamation marks. No questions. No advice. No encouragement.
- No metric counts. Never say "X todos" or "X habits."
- Every noun must come from the data above.
- If there is nothing interesting, respond with exactly: null

Respond with ONLY the headline text or null. Nothing else.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[Headline] Haiku error: ${response.status} ${errBody.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || null;
    const latency = Date.now() - t0;

    console.log(`[Headline] Generated in ${latency}ms: ${text}`);

    if (!text || text.toLowerCase() === 'null') return null;
    return text;
  } catch (err) {
    console.error('[Headline] Failed:', err);
    return null;
  }
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
// Worker entry point
// ============================================================================

// Inngest serve handler
const inngestHandler = serve({
  client: inngest,
  functions: [dailySynthesisDispatcher, synthesizeSingleUser, dcoDispatcher, generateSingleUserDco, bootstrapSingleUserLifeMap, testUnifiedAnalyst, testLifeMapRebuild, testWeeklySummaryV2],
  servePath: '/',
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Custom API endpoint: manually trigger space suggestions for a user
    if (url.pathname === '/api/generate-space-suggestions' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;

        if (!userId) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        console.log(`[API] Manual space suggestions trigger for user: ${userId}`);

        // Call the space suggestions function directly
        const result = await generateSpaceSuggestions(userId, env);

        // Fetch pending suggestions for debug visibility
        const debugHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        };
        const pendingRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending&select=*`,
          { headers: debugHeaders },
        );
        const pending = await pendingRes.json();

        return corsResponse({ success: true, ...result, pending_suggestions: pending });
      } catch (err) {
        console.error('[API] Error generating space suggestions:', err);
        return corsResponse({ error: err.message || 'Internal error' }, 500);
      }
    }

    // Custom API endpoint: force-generate DCO for one or all users (bypasses Inngest)
    if (url.pathname === '/api/force-generate-dco' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const requestedUserId = body.user_id || null;

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        let users = [];

        if (requestedUserId) {
          // Single user — look up their timezone
          const tzRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${requestedUserId}&select=user_id,timezone`,
            { headers: supaHeaders },
          );
          const tzRows = tzRes.ok ? await tzRes.json() : [];
          if (tzRows.length === 0) {
            return corsResponse(
              { error: `No notification_preferences row for user ${requestedUserId}` },
              404,
            );
          }
          users = [
            { user_id: tzRows[0].user_id, timezone: tzRows[0].timezone || 'America/New_York' },
          ];
        } else {
          // All users with a timezone
          const allRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/notification_preferences?timezone=not.is.null&select=user_id,timezone`,
            { headers: supaHeaders },
          );
          if (!allRes.ok) {
            return corsResponse(
              { error: 'Failed to fetch users from notification_preferences' },
              500,
            );
          }
          users = await allRes.json();
        }

        console.log(`[API] force-generate-dco: processing ${users.length} user(s)`);

        const results = [];

        for (const u of users) {
          try {
            const snapshot = await fetchUserSnapshot(u.user_id, u.timezone, 7, env);

            if (!snapshot.raw.currentLifeMap) {
              results.push({
                user_id: u.user_id,
                timezone: u.timezone,
                date: getUserLocalDate(u.timezone),
                success: false,
                error: 'No Life Map exists — run bootstrap first',
              });
              continue;
            }

            const worldPicture = buildWorldPicture(snapshot);
            const flashResult = await updateLifeMapAndFocus(worldPicture.lifeMap, worldPicture.text, env);
            const mapCopy = JSON.parse(JSON.stringify(worldPicture.lifeMap));
            const updatedMap = mergeLifeMapUpdates(mapCopy, flashResult.thread_updates);
            const headline = await generateHeadlineFromFocus(flashResult.daily_focus, snapshot, env);
            const dco = assembleDcoFromFocus(flashResult.daily_focus, headline, snapshot);

            const now = new Date();
            const todayLocal = getUserLocalDate(u.timezone);
            const expiresAt = new Date(now.getTime() + 7 * 86400000);

            await fetch(
              `${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`,
              {
                method: 'POST',
                headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({
                  user_id: u.user_id,
                  life_map: updatedMap,
                  version: snapshot.raw.currentLifeMap.version || 1,
                  updated_at: now.toISOString(),
                }),
              },
            );

            await fetch(
              `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
              {
                method: 'POST',
                headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({
                  user_id: u.user_id,
                  date: todayLocal,
                  dco,
                  extraction_raw: {
                    world_picture_length: worldPicture.text.length,
                    lead_story: flashResult.daily_focus?.lead_story || null,
                  },
                  created_at: now.toISOString(),
                  updated_at: now.toISOString(),
                  expires_at: expiresAt.toISOString(),
                }),
              },
            );

            console.log(`[API] DCO generated for ${u.user_id} (${todayLocal})`);
            results.push({
              user_id: u.user_id,
              timezone: u.timezone,
              date: todayLocal,
              success: true,
              pipeline: 'life-map-v2',
              headline: dco.brief_headline || null,
              life_moment: dco.life_moment || null,
              lead_story: flashResult.daily_focus?.lead_story || null,
              tone: dco.tone,
              day_type: dco.day_type,
            });
          } catch (userErr) {
            console.error(`[API] DCO failed for ${u.user_id}:`, userErr);
            results.push({
              user_id: u.user_id,
              timezone: u.timezone,
              date: null,
              success: false,
              headline: null,
              life_moment: null,
              error: userErr.message || String(userErr),
            });
          }
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return corsResponse({
          success: true,
          total: results.length,
          succeeded,
          failed,
          results,
        });
      } catch (err) {
        console.error('[API] Error in force-generate-dco:', err);
        return corsResponse({ error: err.message || 'Internal error' }, 500);
      }
    }

    // Diagnostic: test what buildDcoContext returns for a given date
    if (url.pathname === '/api/debug-dco-data' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id, target_date } = body;

        if (!user_id || !target_date) {
          return corsResponse({ error: 'Missing user_id or target_date' }, 400);
        }

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        const tzRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${user_id}&select=user_id,timezone`,
          { headers: supaHeaders },
        );
        const tzRows = tzRes.ok ? await tzRes.json() : [];
        const timezone = tzRows[0]?.timezone || 'America/New_York';

        const context = await buildDcoContext(user_id, timezone, target_date, env);

        return corsResponse({
          target_date,
          timezone,
          context,
          _summary: {
            todays_events: context.todays_event_count,
            space_key_dates: context.space_key_dates.length,
            upcoming_events: context.upcoming_events.length,
            recent_drops: context.recent_drops.length,
            todos: context.todos,
            habits_count: context.habits.length,
            drop_velocity: context.drop_velocity,
            mood_top: context.mood.top_moods.map(m => `${m.mood}(${m.pct}%)`).join(', ') || 'none',
            has_profile: !!context.user_profile,
            has_previous_dco: !!context.previous,
            has_weekly_digest: !!context.weekly_digest,
            spaces: context.spaces.map(s => `${s.name} (${s.recent_activity})`),
          },
        });
      } catch (err) {
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    // Custom API endpoint: backfill historical DCOs for a user
    if (url.pathname === '/api/backfill-dco' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id, start_date, end_date } = body;

        if (!user_id || !start_date || !end_date) {
          return corsResponse(
            { error: 'Missing required fields: user_id, start_date, end_date' },
            400,
          );
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
          return corsResponse(
            { error: 'Dates must be in YYYY-MM-DD format' },
            400,
          );
        }

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        // Look up timezone
        const tzRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${user_id}&select=user_id,timezone`,
          { headers: supaHeaders },
        );
        const tzRows = tzRes.ok ? await tzRes.json() : [];
        if (tzRows.length === 0) {
          return corsResponse(
            { error: `No notification_preferences row for user ${user_id}` },
            404,
          );
        }
        const timezone = tzRows[0].timezone || 'America/New_York';

        const dates = getDateRange(start_date, end_date);
        console.log(`[API] backfill-dco: ${dates.length} days for ${user_id} (${start_date} → ${end_date})`);

        const results = [];

        // Sequential loop — each day's DCO becomes previousDco for the next
        for (const targetDate of dates) {
          try {
            const context = await buildDcoContext(user_id, timezone, targetDate, env);
            const analysis = await generateDco(context, env);

            // Generate headline with Haiku (replaces Flash's headline)
            const headline = await generateHeadline(analysis, context, env);
            analysis.brief_headline = headline;

            // Upsert into user_daily_state (90-day TTL for historical)
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

            const upsertRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
              {
                method: 'POST',
                headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({
                  user_id,
                  date: targetDate,
                  dco: analysis,
                  extraction_raw: context,
                  created_at: now.toISOString(),
                  updated_at: now.toISOString(),
                  expires_at: expiresAt.toISOString(),
                }),
              },
            );

            if (!upsertRes.ok) {
              throw new Error(`Upsert failed: ${upsertRes.statusText}`);
            }

            console.log(`[API] backfill-dco: ${targetDate} → ${analysis.brief_headline || '(no headline)'}`);
            results.push({
              date: targetDate,
              success: true,
              headline: analysis.brief_headline || null,
              life_moment: analysis.life_moment || null,
              tokens: analysis._token_usage || null,
              latency_ms: analysis._latency_ms || null,
            });
          } catch (dayErr) {
            console.error(`[API] backfill-dco: ${targetDate} failed:`, dayErr);
            results.push({
              date: targetDate,
              success: false,
              headline: null,
              life_moment: null,
              error: dayErr.message || String(dayErr),
            });
          }
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return corsResponse({
          success: true,
          user_id,
          timezone,
          total: results.length,
          succeeded,
          failed,
          results,
        });
      } catch (err) {
        console.error('[API] Error in backfill-dco:', err);
        return corsResponse({ error: err.message || 'Internal error' }, 500);
      }
    }

    // Custom API endpoint: bootstrap Life Map for a user (one-time, dispatched via Inngest)
    if (url.pathname === '/api/bootstrap-life-map' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id } = body;

        if (!user_id) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        console.log(`[API] bootstrap-life-map: dispatching Inngest job for ${user_id}`);

        // Send Inngest event to trigger the async bootstrap job
        const inngestRes = await fetch('https://inn.gs/e/' + env.INNGEST_EVENT_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/life-map.bootstrap',
            data: { user_id },
          }),
        });

        if (!inngestRes.ok) {
          const errText = await inngestRes.text().catch(() => '');
          throw new Error(`Failed to send Inngest event: ${inngestRes.status} ${errText.slice(0, 200)}`);
        }

        return corsResponse({
          success: true,
          user_id,
          message: 'Life Map bootstrap job dispatched. Check Inngest dashboard or use /api/debug-life-map to view results.',
        });
      } catch (err) {
        console.error('[API] bootstrap-life-map error:', err);
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    // Debug endpoint: view current Life Map for a user
    if (url.pathname === '/api/debug-life-map' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id } = body;

        if (!user_id) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        };

        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${user_id}&select=*`,
          { headers: supaHeaders },
        );

        const rows = res.ok ? await res.json() : [];
        const row = rows[0] || null;

        if (!row) {
          return corsResponse({ exists: false, user_id });
        }

        const domainSummary = (row.life_map?.domains || []).map(d => ({
          name: d.name,
          source: d.source,
          attention: d.attention,
          thread_count: d.threads?.length || 0,
          threads: (d.threads || []).map(t => ({
            name: t.name,
            status: t.status,
            attention: t.attention,
            importance: t.importance,
            momentum: t.momentum,
            lifecycle: t.lifecycle,
            summary: t.summary,
            recent_update: t.recent_update,
            evidence_count: t.evidence?.length || 0,
            last_activity: t.last_activity,
          })),
        }));

        return corsResponse({
          exists: true,
          user_id,
          version: row.version,
          rebuilt_at: row.rebuilt_at,
          updated_at: row.updated_at,
          domain_count: row.life_map?.domains?.length || 0,
          domains: domainSummary,
          _raw: row.life_map,
        });
      } catch (err) {
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    // Debug endpoint: inspect fetchUserSnapshot output
    if (url.pathname === '/api/debug-snapshot' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const { user_id, window_days, target_date } = body;

        if (!user_id) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        // Look up timezone
        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };
        const tzRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${user_id}&select=timezone`,
          { headers: supaHeaders },
        );
        const tzRows = tzRes.ok ? await tzRes.json() : [];
        const timezone = tzRows[0]?.timezone || 'America/New_York';

        const days = window_days || 7;

        const snapshot = await fetchUserSnapshot(user_id, timezone, days, env, {
          targetDate: target_date || undefined,
        });

        const daily = buildDailySnapshot(snapshot);
        const weekly = days >= 14 ? buildWeeklySnapshot(snapshot) : null;

        return corsResponse({
          success: true,
          user_id,
          target_date: snapshot.targetDate,
          timezone,
          window_days: days,

          _counts: {
            todos: snapshot.raw.todos.length,
            drops: snapshot.raw.drops.length,
            journals: snapshot.raw.journals.length,
            calendarEvents: snapshot.raw.calendarEvents.length,
            habits: snapshot.raw.habits.length,
            habitProgress: snapshot.raw.habitProgress.length,
            spaces: snapshot.raw.spaces.length,
            milestones: snapshot.raw.milestones.length,
            weeklySummaries: snapshot.raw.weeklySummaries.length,
            hasLifeMap: !!snapshot.raw.currentLifeMap,
            hasPreviousDco: !!snapshot.raw.previousDco,
            hasProfile: !!snapshot.raw.userProfile,
          },

          computed: snapshot.computed,
          calendar: snapshot.calendar,

          daily_projection: daily,
          weekly_projection: weekly,
        });
      } catch (err) {
        console.error('[API] debug-snapshot error:', err);
        return corsResponse({ error: err.message || String(err) }, 500);
      }
    }

    if (url.pathname === '/api/run-analyst' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;
        const timezone = body.timezone || 'Pacific/Tahiti';

        if (!userId) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Check for stored result
        if (body.fetch_result) {
          const headers = {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          };
          const res = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.1999-01-01&select=dco,updated_at`,
            { headers },
          );
          const rows = await res.json();
          if (rows?.[0]?.dco?._type === 'analyst_test') {
            return new Response(JSON.stringify(rows[0].dco, null, 2), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ status: 'not_ready', message: 'Result not stored yet. Check Inngest dashboard.' }), {
            status: 202,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Trigger Inngest event via HTTP (env bindings not available to inngest.send in CF Workers)
        const inngestRes = await fetch('https://inn.gs/e/' + env.INNGEST_EVENT_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/test.analyst',
            data: { user_id: userId, timezone },
          }),
        });

        if (!inngestRes.ok) {
          const errText = await inngestRes.text();
          throw new Error(`Inngest send failed: ${inngestRes.status} — ${errText.slice(0, 300)}`);
        }

        return new Response(
          JSON.stringify({
            status: 'triggered',
            message: 'Analyst test dispatched via Inngest. Fetch result with: {"user_id": "...", "fetch_result": true}',
          }),
          {
            status: 202,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      } catch (err) {
        console.error('[RunAnalyst] Error:', err);
        return new Response(
          JSON.stringify({ error: String(err), stack: err.stack?.slice(0, 500) }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    if (url.pathname === '/api/run-rebuild' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;
        const timezone = body.timezone || 'Pacific/Tahiti';

        if (!userId) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        if (body.fetch_result) {
          const headers = {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          };
          const res = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.1999-01-02&select=dco,updated_at`,
            { headers },
          );
          const rows = await res.json();
          if (rows?.[0]?.dco?._type === 'rebuild_test') {
            return new Response(JSON.stringify(rows[0].dco, null, 2), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ status: 'not_ready', message: 'Result not stored yet. Check Inngest dashboard.' }), {
            status: 202,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Trigger Inngest event via HTTP (env bindings not available to inngest.send in CF Workers)
        const inngestRes = await fetch('https://inn.gs/e/' + env.INNGEST_EVENT_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/test.rebuild',
            data: { user_id: userId, timezone },
          }),
        });

        if (!inngestRes.ok) {
          const errText = await inngestRes.text();
          throw new Error(`Inngest send failed: ${inngestRes.status} — ${errText.slice(0, 300)}`);
        }

        return new Response(
          JSON.stringify({
            status: 'triggered',
            message: 'Life Map rebuild dispatched via Inngest. Fetch result with: {"user_id": "...", "fetch_result": true}',
          }),
          {
            status: 202,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      } catch (err) {
        console.error('[TestRebuild] Error:', err);
        return new Response(
          JSON.stringify({ error: String(err), stack: err.stack?.slice(0, 500) }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    if (url.pathname === '/api/run-summary-v2' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;

        if (!userId) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        if (body.fetch_result) {
          const headers = {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          };
          const res = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.1999-01-03&select=dco,updated_at`,
            { headers },
          );
          const rows = await res.json();
          if (rows?.[0]?.dco?._type === 'summary_v2_test') {
            return new Response(JSON.stringify(rows[0].dco, null, 2), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ status: 'not_ready' }), {
            status: 202,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Trigger via HTTP (same pattern as other test endpoints)
        const inngestRes = await fetch(`https://inn.gs/e/${env.INNGEST_EVENT_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'app/test.summary-v2',
            data: { user_id: userId, timezone: body.timezone || 'Pacific/Tahiti' },
          }),
        });

        if (!inngestRes.ok) {
          const errText = await inngestRes.text().catch(() => '');
          throw new Error(`Inngest send failed: ${inngestRes.status} — ${errText.slice(0, 300)}`);
        }

        return new Response(
          JSON.stringify({ status: 'triggered', message: 'Full pipeline: analyst → rebuild → summary v2. Fetch with fetch_result: true' }),
          { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        console.error('[SummaryV2] Error:', err);
        return new Response(
          JSON.stringify({ error: String(err), stack: err.stack?.slice(0, 500) }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
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
          if (!ext) { skippedNoEndData++; continue; }

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
            batch.map(u =>
              fetch(
                `${env.SUPABASE_URL}/rest/v1/notes?id=eq.${u.id}`,
                {
                  method: 'PATCH',
                  headers: supaHeaders,
                  body: JSON.stringify({ end_date: u.end_date }),
                },
              ),
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

        console.log(`[API] backfill-event-end-dates: checked=${events.length} updated=${updated} skipped_same=${skippedSameDay} skipped_no_end=${skippedNoEndData} errors=${errors}`);

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
