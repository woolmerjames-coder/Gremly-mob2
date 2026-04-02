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

// Per-user worker: synthesize profile (space suggestions now run weekly in weeklySummaryV2Worker)
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

    return {
      user_id: userId,
      profile: profileResult,
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
          await fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`, {
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
          });
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

      await fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          date: '1999-01-01',
          dco: { _type: 'analyst_test', ...result },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
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
      const journals = (snapshot.raw.journals || []).map((j) => ({
        title: j.title,
        body: j.body,
        mood: j.mood,
        date: j.created_at ? j.created_at.split('T')[0] : null,
        created_at: j.created_at,
      }));

      const result = await rebuildLifeMap(
        currentLifeMap,
        analystResult.analysis,
        userProfile,
        spaces,
        journals,
        env,
      );

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

      await fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`, {
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
      });
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
      return runUnifiedAnalyst(
        weeklySnapshot,
        lifeMap,
        weekDates.weekStart,
        weekDates.weekEnd,
        env,
      );
    });

    const rebuildResult = await step.run('rebuild-life-map', async () => {
      const currentLifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      if (!currentLifeMap) throw new Error('No existing Life Map found');
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
      const journals = (snapshot.raw?.journals || snapshot.raw?.drops || []).filter(
        (j) =>
          j.subtype === 'journal' &&
          j.created_at &&
          j.created_at.split('T')[0] >= weekDates.weekStart &&
          j.created_at.split('T')[0] <= weekDates.weekEnd,
      ).length;

      // Fed days this week
      const fedRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=eq.${userId}&ritual_day=gte.${weekDates.weekStart}&ritual_day=lte.${weekDates.weekEnd}&select=ritual_day,is_fed`,
        { headers },
      );
      const fedRows = await fedRes.json();
      const fedDaysThisWeek = (fedRows || []).filter((r) => r.is_fed).length;

      // Gremly age + fed count from cortex_preferences
      const ageRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${userId}&select=gremly_age,fed_days_count,current_tier,sock_count`,
        { headers },
      );
      const ageData = (await ageRes.json())?.[0] || {};

      return {
        drops: totalDrops,
        sweeps: totalSweeps,
        journals,
        fed_days_this_week: fedDaysThisWeek,
        gremly_age: ageData.gremly_age || 0,
        fed_days_total: ageData.fed_days_count || 0,
        current_tier: ageData.current_tier || 'egg',
        sock_count: ageData.sock_count || 0,
        fed_days_toward_next: (ageData.fed_days_count || 0) % 3,
        fed_days_needed: 3,
      };
    });

    const summaryResult = await step.run('generate-summary-v2', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const priorSummaries = snapshot.raw.weeklySummaries || [];
      return generateWeeklySummaryV2(
        analystResult.analysis,
        rebuildResult.delta,
        rebuildResult.mergedLifeMap,
        weeklySnapshot,
        weekDates.weekStart,
        weekDates.weekEnd,
        priorSummaries,
        env,
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
      await fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`, {
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
            trend_context: {
              prior_week_types: (snapshot.raw.weeklySummaries || []).slice(0, 4).map((ws) => {
                const meta = (ws.content || {}).metadata || {};
                return {
                  week_start: ws.week_start_date,
                  week_type: meta.week_type || 'N/A',
                  mood: meta.mood || 'N/A',
                  key_themes: meta.key_themes || ws.key_themes || [],
                };
              }),
              continuing_arcs: (analystResult.analysis?.themes || [])
                .filter(
                  (t) =>
                    t.trajectory === 'declining' ||
                    t.trajectory === 'building' ||
                    (t.narrative_interest || 0) >= 7,
                )
                .map((t) => ({
                  thread: t.label,
                  trajectory: t.trajectory,
                  narrative_interest: t.narrative_interest,
                })),
            },
            life_map_delta: rebuildResult.delta,
            rebuilt_life_map: rebuildResult.mergedLifeMap,
            rebuild_metadata: rebuildResult.metadata,
            analyst_metadata: analystResult.metadata,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    });

    return {
      success: true,
      card_count: summaryResult.summary?.cards?.length || 0,
      card_types: summaryResult.summary?.cards?.map((c) => c.type) || [],
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
    { cron: '*/5 * * * *' }, // Every 5 minutes — matches notifications cron cadence
    { event: 'app/weekly-summary-v2.dispatch' }, // Manual trigger
  ],
  async ({ step, env }) => {
    // Step 1: Fetch all users with weekly_enabled = true, including their push tokens
    const usersAndTokens = await step.run('fetch-weekly-users', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      };

      const [prefsRes, tokensRes] = await Promise.all([
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notification_preferences?weekly_enabled=eq.true&select=user_id,weekly_time,weekly_day,timezone`,
          { headers },
        ),
        fetch(`${env.SUPABASE_URL}/rest/v1/push_tokens?select=user_id,token`, { headers }),
      ]);

      if (!prefsRes.ok) throw new Error(`Failed to fetch weekly prefs: ${prefsRes.statusText}`);
      const prefs = await prefsRes.json();
      const tokens = tokensRes.ok ? await tokensRes.json() : [];
      const tokenMap = {};
      for (const t of tokens) tokenMap[t.user_id] = t.token;

      return prefs
        .filter((p) => tokenMap[p.user_id])
        .map((p) => ({
          user_id: p.user_id,
          timezone: p.timezone || 'America/Los_Angeles',
          weekly_time: p.weekly_time,
          weekly_day: p.weekly_day ?? 0, // 0 = Sunday
          push_token: tokenMap[p.user_id],
        }));
    });

    // Step 2: Filter to users whose local time is within the 5-minute window of their configured weekly time AND it's their configured day
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

          const [targetHour, targetMin] = u.weekly_time.split(':').map(Number);
          const currentTotal = userHour * 60 + userMin;
          const targetTotal = targetHour * 60 + (targetMin || 0);
          const diff = Math.abs(currentTotal - targetTotal);
          const wrappedDiff = Math.min(diff, 1440 - diff);
          return wrappedDiff <= 5;
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
      await step.sendEvent(
        'dispatch-weekly-users',
        readyUsers.map((u) => ({
          name: 'app/weekly-summary-v2.run',
          data: {
            user_id: u.user_id,
            timezone: u.timezone,
            push_token: u.push_token,
          },
        })),
      );
    }

    return { total_weekly_users: usersAndTokens.length, dispatched: readyUsers.length };
  },
);

const weeklySummaryV2Worker = inngest.createFunction(
  {
    id: 'weekly-summary-v2-worker',
    name: 'Weekly Summary V2 Worker',
    concurrency: { limit: 3 },
    retries: 2,
  },
  { event: 'app/weekly-summary-v2.run' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone || 'Pacific/Tahiti';
    const pushToken = event.data.push_token || null;

    // Step 0: Claim notification slot — if already claimed, exit early (idempotency for retries)
    const claimed = await step.run('claim-slot', async () => {
      // Compute week start for the slot key
      const now = new Date();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
      const today = new Date(todayStr + 'T00:00:00Z');
      const dayOfWeek = today.getUTCDay();
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStartKey = formatDateOnly(monday);

      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_notification_slot`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_type: 'weekly',
          p_date_key: weekStartKey,
        }),
      });

      if (!res.ok) {
        console.warn(`[Weekly V2] Slot claim RPC error for ${userId}: ${res.statusText}`);
        return false;
      }
      return await res.json();
    });

    if (claimed !== true) {
      console.log(`[Weekly V2] Slot already claimed for ${userId}, skipping`);
      return { success: true, skipped: true, reason: 'slot_already_claimed' };
    }

    // Steps 1-6: identical to testWeeklySummaryV2
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
      return runUnifiedAnalyst(
        weeklySnapshot,
        lifeMap,
        weekDates.weekStart,
        weekDates.weekEnd,
        env,
      );
    });

    const rebuildResult = await step.run('rebuild-life-map', async () => {
      const currentLifeMap = snapshot.raw.currentLifeMap?.life_map || null;
      if (!currentLifeMap) throw new Error('No existing Life Map found');
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
      return { delta: result.delta, mergedLifeMap, metadata: result.metadata };
    });

    const engagementStats = await step.run('fetch-engagement', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };
      const dropsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=eq.${userId}&ritual_day=gte.${weekDates.weekStart}&ritual_day=lte.${weekDates.weekEnd}&select=drops_count`,
        { headers },
      );
      const dropsRows = await dropsRes.json();
      const totalDrops = (dropsRows || []).reduce((sum, r) => sum + (r.drops_count || 0), 0);

      const sweepsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/events?owner_id=eq.${userId}&kind=eq.sweep_completed&created_at=gte.${weekDates.weekStart}&created_at=lt.${weekDates.weekEnd}T23:59:59Z&select=id`,
        { headers },
      );
      const sweepsRows = await sweepsRes.json();
      const totalSweeps = (sweepsRows || []).length;

      const journals = (snapshot.raw?.journals || snapshot.raw?.drops || []).filter(
        (j) =>
          j.subtype === 'journal' &&
          j.created_at &&
          j.created_at.split('T')[0] >= weekDates.weekStart &&
          j.created_at.split('T')[0] <= weekDates.weekEnd,
      ).length;

      // Fed days this week
      const fedRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=eq.${userId}&ritual_day=gte.${weekDates.weekStart}&ritual_day=lte.${weekDates.weekEnd}&select=ritual_day,is_fed`,
        { headers },
      );
      const fedRows = await fedRes.json();
      const fedDaysThisWeek = (fedRows || []).filter((r) => r.is_fed).length;

      // Gremly age + fed count from cortex_preferences
      const ageRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${userId}&select=gremly_age,fed_days_count,current_tier,sock_count`,
        { headers },
      );
      const ageData = (await ageRes.json())?.[0] || {};

      return {
        drops: totalDrops,
        sweeps: totalSweeps,
        journals,
        fed_days_this_week: fedDaysThisWeek,
        gremly_age: ageData.gremly_age || 0,
        fed_days_total: ageData.fed_days_count || 0,
        current_tier: ageData.current_tier || 'egg',
        sock_count: ageData.sock_count || 0,
        fed_days_toward_next: (ageData.fed_days_count || 0) % 3,
        fed_days_needed: 3,
      };
    });

    const summaryResult = await step.run('generate-summary-v2', async () => {
      const weeklySnapshot = buildWeeklySnapshot(snapshot);
      const priorSummaries = snapshot.raw.weeklySummaries || [];
      return generateWeeklySummaryV2(
        analystResult.analysis,
        rebuildResult.delta,
        rebuildResult.mergedLifeMap,
        weeklySnapshot,
        weekDates.weekStart,
        weekDates.weekEnd,
        priorSummaries,
        env,
        engagementStats,
      );
    });

    // Step 7: Save rebuilt Life Map
    await step.run('save-life-map', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      };
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          life_map: rebuildResult.mergedLifeMap,
          version: snapshot.raw.currentLifeMap?.version || 1,
          rebuilt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        console.error(`[Weekly V2] Failed to save Life Map for ${userId}: ${res.statusText}`);
      }
    });

    // Step 8: Save weekly summary (delete existing first, then insert)
    await step.run('save-weekly-summary', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      // Delete any existing summary for this week
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&week_start_date=eq.${weekDates.weekStart}`,
        { method: 'DELETE', headers },
      );

      // Insert new summary
      const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/weekly_summaries`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          week_start_date: weekDates.weekStart,
          week_end_date: weekDates.weekEnd,
          content: summaryResult.summary,
          stats_snapshot: {
            card_count: summaryResult.summary?.cards?.length || 0,
            card_types: summaryResult.summary?.cards?.map((c) => c.type) || [],
          },
          key_themes: summaryResult.summary?.metadata?.key_themes || [],
          trend_context: {
            prior_week_types: (snapshot.raw.weeklySummaries || []).slice(0, 4).map((ws) => {
              const meta = (ws.content || {}).metadata || {};
              return {
                week_start: ws.week_start_date,
                week_type: meta.week_type || 'N/A',
                mood: meta.mood || 'N/A',
                key_themes: meta.key_themes || ws.key_themes || [],
              };
            }),
            continuing_arcs: (analystResult.analysis?.themes || [])
              .filter(
                (t) =>
                  t.trajectory === 'declining' ||
                  t.trajectory === 'building' ||
                  (t.narrative_interest || 0) >= 7,
              )
              .map((t) => ({
                thread: t.label,
                trajectory: t.trajectory,
                narrative_interest: t.narrative_interest,
              })),
          },
          viewed: false,
          banner_dismissed: false,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!insertRes.ok) {
        const errText = await insertRes.text();
        throw new Error(`Failed to save weekly summary: ${errText}`);
      }
    });

    // Step 9: Process space suggestions (non-fatal)
    await step.run('process-space-suggestions', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      // 1. Check if user has space suggestions enabled
      const prefRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=enable_space_suggestions`,
        { headers },
      );
      const prefData = await prefRes.json();
      const enabled = prefData?.[0]?.enable_space_suggestions ?? true;
      if (!enabled) {
        console.log(`[Weekly V2:SpaceSuggestions] Disabled for ${userId}`);
        return { skipped: 'user_disabled' };
      }

      // 2. Fetch unassigned drops (last 14 days)
      const fourteenDaysAgo = formatDateOnly(new Date(Date.now() - 14 * 86400000));
      const [unassignedTodos, unassignedNotes, unassignedHabits] = await Promise.all([
        fetch(
          `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&completed_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,title,tags,created_at&limit=50`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&subtype=neq.journal&created_at=gte.${fourteenDaysAgo}&select=id,title,tags,subtype,created_at&limit=50`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=is.null&archived_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,name,tags,created_at&limit=20`,
          { headers },
        ).then((r) => r.json()),
      ]);

      const unassignedDrops = [
        ...(Array.isArray(unassignedTodos) ? unassignedTodos : []).map((t) => ({
          id: t.id,
          title: t.title,
          type: 'todo',
          tags: t.tags || [],
        })),
        ...(Array.isArray(unassignedNotes) ? unassignedNotes : []).map((n) => ({
          id: n.id,
          title: n.title,
          type: n.subtype || 'note',
          tags: n.tags || [],
        })),
        ...(Array.isArray(unassignedHabits) ? unassignedHabits : []).map((h) => ({
          id: h.id,
          title: h.name,
          type: 'habit',
          tags: h.tags || [],
        })),
      ];

      console.log(`[Weekly V2:SpaceSuggestions] ${unassignedDrops.length} unassigned drops`);

      // 3. Fetch recently dismissed new_space suggestions (to avoid re-suggesting)
      const dismissedRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&suggestion_type=eq.new_space&status=eq.dismissed&select=suggested_name&order=updated_at.desc&limit=20`,
        { headers },
      );
      const dismissedData = await dismissedRes.json();
      const dismissedNames = (Array.isArray(dismissedData) ? dismissedData : [])
        .map((d) => (d.suggested_name || '').toLowerCase())
        .filter(Boolean);

      // 4. Read the rebuilt Life Map
      const lifeMap = rebuildResult.mergedLifeMap;
      if (!lifeMap?.domains) {
        console.log(`[Weekly V2:SpaceSuggestions] No Life Map domains, skipping`);
        return { skipped: 'no_life_map' };
      }

      const suggestionsToInsert = [];

      // ═══════════════════════════════════════════════════════════════
      // PART A: ASSIGN-TO-EXISTING (nano AI call using Life Map domains)
      // ═══════════════════════════════════════════════════════════════

      if (unassignedDrops.length >= 3) {
        // Build matching context from space-backed domains in the Life Map
        const spaceDomains = lifeMap.domains
          .filter((d) => d.source === 'space' && d.space_id)
          .map((d) => ({
            space_id: d.space_id,
            name: d.name,
            threads: (d.threads || [])
              .filter((t) => t.lifecycle === 'active' || t.lifecycle === undefined)
              .slice(0, 5)
              .map((t) => ({ name: t.name, summary: t.summary })),
          }));

        if (spaceDomains.length > 0) {
          const matchPrompt = `Match unassigned items to existing Spaces. Each Space has threads describing what it contains.

SPACES:
${spaceDomains.map((d) => `Space "${d.name}" (ID: ${d.space_id}):\n  Threads: ${d.threads.map((t) => `${t.name}: ${t.summary}`).join('; ')}`).join('\n')}

UNASSIGNED ITEMS:
${unassignedDrops.map((d) => `ID: ${d.id} | "${d.title}" (${d.type})`).join('\n')}

Respond with ONLY JSON:
{ "assign": [{ "space_id": "uuid", "drop_ids": ["uuid"], "reason": "why these belong", "confidence": 0.0-1.0 }] }

Rules:
- Only assign if confidence >= 0.70.
- Think about what the item is ABOUT, not just keyword overlap.
- Items that don't clearly fit any Space — leave them out.
- Group drop_ids by space_id.`;

          try {
            const matchRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4.1-nano',
                messages: [{ role: 'user', content: matchPrompt }],
                max_tokens: 2048,
                temperature: 0.2,
              }),
            });

            if (matchRes.ok) {
              const matchData = await matchRes.json();
              let matchText = (matchData.choices?.[0]?.message?.content || '').trim();
              if (matchText.startsWith('```')) {
                matchText = matchText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
              }
              try {
                const parsed = JSON.parse(matchText);
                const validSpaceIds = new Set(spaceDomains.map((d) => d.space_id));
                const validDropIds = new Set(unassignedDrops.map((d) => d.id));

                for (const suggestion of parsed.assign || []) {
                  if (!validSpaceIds.has(suggestion.space_id)) continue;
                  const validDrops = (suggestion.drop_ids || []).filter((id) =>
                    validDropIds.has(id),
                  );
                  if (validDrops.length === 0) continue;
                  if ((suggestion.confidence || 0) < 0.7) continue;

                  suggestionsToInsert.push({
                    user_id: userId,
                    suggestion_type: 'assign_to_space',
                    space_id: suggestion.space_id,
                    suggested_name: null,
                    reason: suggestion.reason || null,
                    drop_ids: validDrops,
                    confidence: suggestion.confidence || 0.8,
                    status: 'pending',
                  });
                }
                console.log(
                  `[Weekly V2:SpaceSuggestions] Assign-to-existing: ${suggestionsToInsert.length} suggestions`,
                );
              } catch (parseErr) {
                console.warn(
                  `[Weekly V2:SpaceSuggestions] Assign parse failed: ${parseErr.message}`,
                );
              }
            }
          } catch (err) {
            console.warn(`[Weekly V2:SpaceSuggestions] Assign AI call failed: ${err.message}`);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // PART B: NEW SPACE DISCOVERY (deterministic from Life Map)
      // ═══════════════════════════════════════════════════════════════

      const aiDetectedDomains = lifeMap.domains.filter((d) => d.source === 'ai_detected');

      for (const domain of aiDetectedDomains) {
        const activeThreads = (domain.threads || []).filter(
          (t) => t.lifecycle === 'active' || t.lifecycle === undefined,
        );

        // Thresholds: 2+ active threads, domain has enough substance
        if (activeThreads.length < 2) continue;

        // Check not recently dismissed
        if (dismissedNames.includes(domain.name.toLowerCase())) continue;

        // Count total evidence across threads
        const totalEvidence = activeThreads.reduce((sum, t) => sum + (t.evidence?.length || 0), 0);
        if (totalEvidence < 3) continue;

        // Find drop_ids that belong to this domain's threads
        // Match by checking if drop titles appear in thread evidence or names
        const domainKeywords = [
          domain.name.toLowerCase(),
          ...activeThreads.map((t) => t.name.toLowerCase()),
        ];
        const matchingDropIds = unassignedDrops
          .filter((d) => {
            const title = (d.title || '').toLowerCase();
            return domainKeywords.some(
              (kw) =>
                title.includes(kw) ||
                kw.includes(title) ||
                (d.tags || []).some((tag) => kw.includes(tag.toLowerCase())),
            );
          })
          .map((d) => d.id)
          .slice(0, 20);

        // Build a rich "why" from thread context
        const threadContext = activeThreads
          .slice(0, 3)
          .map((t) => t.summary || t.recent_update || t.name)
          .filter(Boolean)
          .join('. ');
        const reason =
          threadContext.length > 200 ? threadContext.slice(0, 197) + '...' : threadContext;

        suggestionsToInsert.push({
          user_id: userId,
          suggestion_type: 'new_space',
          space_id: null,
          suggested_name: domain.name,
          reason:
            reason ||
            `Gremly noticed a pattern across ${activeThreads.length} threads in your life`,
          drop_ids: matchingDropIds,
          confidence: Math.min(0.95, 0.7 + activeThreads.length * 0.05 + totalEvidence * 0.01),
          status: 'pending',
        });
      }

      console.log(
        `[Weekly V2:SpaceSuggestions] New space discovery: ${suggestionsToInsert.filter((s) => s.suggestion_type === 'new_space').length} candidates`,
      );

      // ═══════════════════════════════════════════════════════════════
      // PART C: EXPIRE OLD + INSERT NEW
      // ═══════════════════════════════════════════════════════════════

      // Expire all old pending suggestions for this user
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() }),
        },
      );

      // Insert new suggestions
      if (suggestionsToInsert.length > 0) {
        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/space_suggestions`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify(suggestionsToInsert),
        });
        if (!insertRes.ok) {
          console.error(`[Weekly V2:SpaceSuggestions] Insert failed: ${insertRes.statusText}`);
        }
      }

      console.log(
        `[Weekly V2:SpaceSuggestions] Complete: ${suggestionsToInsert.length} suggestions saved`,
      );
      return {
        assign_to_existing: suggestionsToInsert.filter(
          (s) => s.suggestion_type === 'assign_to_space',
        ).length,
        new_space: suggestionsToInsert.filter((s) => s.suggestion_type === 'new_space').length,
      };
    });

    // Step 10: Extract personal facts from chat messages (non-fatal)
    await step.run('extract-profile-facts', async () => {
      const headers = {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      // Fetch user chat messages from the past 7 days (space chats + entity chats)
      const [spaceChatMsgs, todos, habits, notes, existingOverrides] = await Promise.all([
        fetch(
          `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&created_at=gte.${weekDates.weekStart}&select=content&limit=100`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${weekDates.weekStart}&select=views&limit=100`,
          { headers },
        ).then((r) => r.json()),
        fetch(`${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=views&limit=20`, {
          headers,
        }).then((r) => r.json()),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${weekDates.weekStart}&select=views&limit=50`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`,
          { headers },
        )
          .then((r) => r.json())
          .catch(() => []),
      ]);

      // Extract user messages from all chat sources
      const userMessages = [];
      for (const msg of Array.isArray(spaceChatMsgs) ? spaceChatMsgs : []) {
        if (msg.content) userMessages.push(msg.content);
      }
      for (const item of [
        ...(Array.isArray(todos) ? todos : []),
        ...(Array.isArray(habits) ? habits : []),
        ...(Array.isArray(notes) ? notes : []),
      ]) {
        const chat = item.views?.chat;
        if (chat && Array.isArray(chat)) {
          for (const msg of chat) {
            if (msg.role === 'user' && msg.content) userMessages.push(msg.content);
          }
        }
      }

      if (userMessages.length === 0) {
        console.log(`[Weekly V2:Facts] No user messages found for ${userId}`);
        return { facts_extracted: 0 };
      }

      console.log(`[Weekly V2:Facts] Found ${userMessages.length} messages for fact extraction`);

      // Call extractFacts (GPT-4.1-mini) — situational facts only
      let extractedFacts = await extractFacts(userMessages, env.OPENAI_API_KEY);

      // ── Identity extraction (runs when identity is empty or sparse) ──
      const existingProfileForIdentity = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=identity,signals`,
        { headers },
      ).then((r) => r.json());

      const existingIdentity = existingProfileForIdentity?.[0]?.identity || {};
      const identityFieldCount = Object.keys(existingIdentity).filter(
        (k) => k !== 'extracted_at' && k !== 'source' && existingIdentity[k] !== null,
      ).length;

      let updatedIdentity = existingIdentity;

      // Run identity extraction if we have fewer than 2 populated identity fields
      // or if identity has never been extracted
      if (identityFieldCount < 2 || !existingIdentity.extracted_at) {
        console.log(
          `[Weekly V2:Identity] Running identity extraction (${identityFieldCount} existing fields)`,
        );
        // Use ALL available messages, not just this week — identity needs full history
        const allChatMsgs = await fetch(
          `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&select=content&order=created_at.desc&limit=200`,
          { headers },
        ).then((r) => r.json());

        const allMessages = [];
        for (const msg of Array.isArray(allChatMsgs) ? allChatMsgs : []) {
          if (msg.content) allMessages.push(msg.content);
        }
        // Also include this week's entity chat messages already collected
        allMessages.push(...userMessages);

        if (allMessages.length > 0) {
          const newIdentity = await extractIdentity(
            allMessages,
            existingIdentity,
            env.OPENAI_API_KEY,
          );
          // Merge: existing values preserved unless new value is non-null
          updatedIdentity = { ...existingIdentity };
          for (const [key, value] of Object.entries(newIdentity)) {
            if (value !== null && value !== undefined && value !== '') {
              updatedIdentity[key] = value;
            }
          }
          updatedIdentity.extracted_at = new Date().toISOString();
          updatedIdentity.source = 'weekly_extraction';
          console.log(`[Weekly V2:Identity] Extracted identity:`, JSON.stringify(updatedIdentity));
        }
      }

      // Apply user overrides
      const overrides = Array.isArray(existingOverrides) ? existingOverrides : [];
      if (overrides.length > 0) {
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
        const addedFacts = overrides.filter((o) => o.action === 'add').map((o) => o.fact_text);
        extractedFacts = [...extractedFacts, ...addedFacts];
      }

      // ── Merge situational facts (don't replace) ──
      const existingFacts = existingProfileForIdentity?.[0]?.signals?.facts || [];

      // Deduplicate: keep new facts + existing facts not covered by new ones
      const normalizedNew = extractedFacts.map((f) => f.toLowerCase().trim());
      const mergedFacts = [...extractedFacts];

      for (const existingFact of existingFacts) {
        const normalized = existingFact.toLowerCase().trim();
        // Keep existing fact if no new fact covers the same topic
        const isDuplicate = normalizedNew.some(
          (newFact) => newFact.includes(normalized) || normalized.includes(newFact),
        );
        if (!isDuplicate) {
          mergedFacts.push(existingFact);
        }
      }

      // Remove identity-level facts from situational facts (they belong in identity column now)
      const identityPatterns = [
        /^\d{2,3}\s*(year|yr)/i, // "34 year old..."
        /\b(male|female|non-?binary)\b/i, // gender mentions
        /\b(he|she|they)\/(him|her|them)\b/i, // pronouns
        /\blives?\s+in\b/i, // location (now in identity)
        /\bhas\s+(ADHD|ADD|anxiety|depression|OCD|autism|ASD)\b/i, // conditions (now in identity)
      ];

      extractedFacts = mergedFacts.filter(
        (fact) => !identityPatterns.some((pattern) => pattern.test(fact)),
      );

      // Render profile_text from identity + Life Map domains + extracted facts
      const lifeMap = rebuildResult.mergedLifeMap;

      // Identity section — always first, always present if we have identity
      let identitySection = '';
      if (
        updatedIdentity &&
        Object.keys(updatedIdentity).filter((k) => k !== 'extracted_at' && k !== 'source').length >
          0
      ) {
        const identityParts = [];
        if (updatedIdentity.name) identityParts.push(`Name: ${updatedIdentity.name}`);
        if (updatedIdentity.pronouns) identityParts.push(`Pronouns: ${updatedIdentity.pronouns}`);
        else if (updatedIdentity.gender === 'male') identityParts.push('Pronouns: he/him');
        else if (updatedIdentity.gender === 'female') identityParts.push('Pronouns: she/her');
        else if (updatedIdentity.gender) identityParts.push(`Gender: ${updatedIdentity.gender}`);
        if (updatedIdentity.age) identityParts.push(`Age: ${updatedIdentity.age}`);
        if (updatedIdentity.location) identityParts.push(`Location: ${updatedIdentity.location}`);
        if (updatedIdentity.partner) identityParts.push(`Partner: ${updatedIdentity.partner}`);
        if (updatedIdentity.conditions?.length > 0)
          identityParts.push(`Conditions: ${updatedIdentity.conditions.join(', ')}`);
        identitySection = `IDENTITY: ${identityParts.join('. ')}.\n\n`;
      }

      const domainSummaries = (lifeMap?.domains || [])
        .filter((d) => d.attention !== 'background')
        .map((d) => {
          const activeThreads = (d.threads || [])
            .filter((t) => t.lifecycle === 'active' || t.lifecycle === undefined)
            .slice(0, 3);
          const threadSummary = activeThreads
            .map((t) => t.summary || t.recent_update || t.name)
            .join('. ');
          return `${d.name}: ${threadSummary}`;
        })
        .join('\n');

      const factsSection =
        extractedFacts.length > 0 ? `\n\nPersonal context: ${extractedFacts.join('. ')}.` : '';

      const profileText = identitySection + domainSummaries + factsSection;

      // Update user_profiles with new profile_text and facts
      const existingProfile = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_id`,
        { headers },
      ).then((r) => r.json());

      const profileData = {
        user_id: userId,
        profile_text: profileText,
        identity: updatedIdentity,
        signals: {
          facts: extractedFacts,
          message_count: userMessages.length,
          overrides_applied: overrides.length,
          source: 'weekly_life_map_v2',
        },
        generated_at: new Date().toISOString(),
        model_used: 'gpt-4.1-mini',
      };

      if (!existingProfile || existingProfile.length === 0) {
        profileData.relationship_started_at = new Date().toISOString();
      }

      await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(profileData),
      });

      console.log(
        `[Weekly V2:Facts] Updated profile for ${userId}: ${extractedFacts.length} facts`,
      );
      return { facts_extracted: extractedFacts.length };
    });

    // Step 11: Send push notification (non-fatal)
    await step.run('send-push', async () => {
      if (!pushToken) {
        console.log(`[Weekly V2] No push token for ${userId}, skipping notification`);
        return;
      }
      const gremlyMood = summaryResult.summary?.cards?.find((c) => c.type === 'gremly_mood');
      const body = gremlyMood?.hook || 'Your weekly summary is ready.';
      await sendExpoPush(pushToken, 'Your week in review is ready', body, 'weekly_summary');
      console.log(`[Weekly V2] Push sent for ${userId}`);
    });

    return {
      success: true,
      user_id: userId,
      card_count: summaryResult.summary?.cards?.length || 0,
      card_types: summaryResult.summary?.cards?.map((c) => c.type) || [],
      week_start: weekDates.weekStart,
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

        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userId,
            life_map: lifeMap,
            version: 1,
            rebuilt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });

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
        domains: (lifeMap.domains || []).map((d) => ({
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

// ============================================================================
// One-time backfill: extract identity from existing signals.facts
// Trigger via Inngest dashboard with event: app/backfill.identity
// ============================================================================

const backfillIdentity = inngest.createFunction(
  { id: 'backfill-identity', name: 'Backfill Identity Column' },
  { event: 'app/backfill.identity' },
  async ({ step, env }) => {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    // Get all users with no identity (empty object or null)
    const users = await step.run('get-users', async () => {
      // Fetch users where identity is null
      const nullRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?identity=is.null&select=user_id,signals`,
        { headers },
      ).then((r) => r.json());

      // Fetch users where identity is empty object
      const emptyRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?identity=eq.%7B%7D&select=user_id,signals`,
        { headers },
      ).then((r) => r.json());

      const all = [
        ...(Array.isArray(nullRes) ? nullRes : []),
        ...(Array.isArray(emptyRes) ? emptyRes : []),
      ];
      // Dedupe by user_id
      const seen = new Set();
      return all.filter((u) => {
        if (seen.has(u.user_id)) return false;
        seen.add(u.user_id);
        return true;
      });
    });

    console.log(`[Backfill] Found ${users.length} users without identity`);

    let backfilledCount = 0;

    for (const user of users) {
      await step.run(`backfill-${user.user_id.slice(0, 8)}`, async () => {
        const facts = user.signals?.facts || [];

        // Fetch user's chat history for identity extraction
        const chatMsgs = await fetch(
          `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${user.user_id}&role=eq.user&select=content&order=created_at.desc&limit=200`,
          { headers },
        ).then((r) => r.json());

        const messages = [];
        for (const msg of Array.isArray(chatMsgs) ? chatMsgs : []) {
          if (msg.content) messages.push(msg.content);
        }
        // Also include existing facts as "messages" so the model can parse them
        messages.push(...facts);

        if (messages.length === 0) return;

        const identity = await extractIdentity(messages, {}, env.OPENAI_API_KEY);

        if (
          Object.keys(identity).filter((k) => k !== 'extracted_at' && k !== 'source').length > 0
        ) {
          identity.extracted_at = new Date().toISOString();
          identity.source = 'backfill';

          // Remove identity facts from signals.facts
          const identityPatterns = [
            /^\d{2,3}\s*(year|yr)/i,
            /\b(male|female|non-?binary)\b/i,
            /\b(he|she|they)\/(him|her|them)\b/i,
            /\blives?\s+in\b/i,
            /\bhas\s+(ADHD|ADD|anxiety|depression|OCD|autism|ASD)\b/i,
          ];
          const cleanedFacts = facts.filter((f) => !identityPatterns.some((p) => p.test(f)));

          // Update profile
          await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              identity,
              signals: { ...user.signals, facts: cleanedFacts },
            }),
          });

          backfilledCount++;
          console.log(`[Backfill] ${user.user_id.slice(0, 8)}: ${JSON.stringify(identity)}`);
        }
      });
    }

    return { total: users.length, backfilled: backfilledCount };
  },
);

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
    // Parallel fetch: Life Map, existing profile, overrides
    const [lifeMapRes, profileRes, overridesRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map`, {
        headers,
      }).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_id,signals,identity,relationship_started_at`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const lifeMap = lifeMapRes?.[0]?.life_map || null;
    const existingProfile = profileRes?.[0] || null;
    const overrides = Array.isArray(overridesRes) ? overridesRes : [];

    // Get existing facts from last weekly extraction
    let facts = existingProfile?.signals?.facts || [];

    // Apply overrides
    if (overrides.length > 0) {
      const removedFacts = overrides
        .filter((o) => o.action === 'remove')
        .map((o) => o.fact_text.toLowerCase());
      facts = facts.filter(
        (fact) =>
          !removedFacts.some(
            (removed) =>
              fact.toLowerCase().includes(removed) || removed.includes(fact.toLowerCase()),
          ),
      );
      const addedFacts = overrides.filter((o) => o.action === 'add').map((o) => o.fact_text);
      facts = [...facts, ...addedFacts];
    }

    // Render profile text from identity + Life Map + facts
    let profileText = '';

    // Identity section — always first
    const identity = existingProfile?.identity || {};
    const identityKeys = Object.keys(identity).filter(
      (k) => k !== 'extracted_at' && k !== 'source',
    );
    if (identityKeys.length > 0) {
      const identityParts = [];
      if (identity.name) identityParts.push(`Name: ${identity.name}`);
      if (identity.pronouns) identityParts.push(`Pronouns: ${identity.pronouns}`);
      else if (identity.gender === 'male') identityParts.push('Pronouns: he/him');
      else if (identity.gender === 'female') identityParts.push('Pronouns: she/her');
      else if (identity.gender) identityParts.push(`Gender: ${identity.gender}`);
      if (identity.age) identityParts.push(`Age: ${identity.age}`);
      if (identity.location) identityParts.push(`Location: ${identity.location}`);
      if (identity.partner) identityParts.push(`Partner: ${identity.partner}`);
      if (identity.conditions?.length > 0)
        identityParts.push(`Conditions: ${identity.conditions.join(', ')}`);
      profileText = `IDENTITY: ${identityParts.join('. ')}.\n\n`;
    }

    if (lifeMap?.domains) {
      const domainSummaries = lifeMap.domains
        .filter((d) => d.attention !== 'background')
        .map((d) => {
          const activeThreads = (d.threads || [])
            .filter((t) => t.lifecycle === 'active' || t.lifecycle === undefined)
            .slice(0, 3);
          const threadSummary = activeThreads
            .map((t) => t.summary || t.recent_update || t.name)
            .join('. ');
          return `${d.name}: ${threadSummary}`;
        })
        .join('\n');
      profileText += domainSummaries;
    }

    if (facts.length > 0) {
      profileText += `\n\nPersonal context: ${facts.join('. ')}.`;
    }

    if (!profileText) {
      profileText = 'New user — still building understanding.';
    }

    // Upsert profile
    const profileData = {
      user_id: userId,
      profile_text: profileText,
      signals: {
        facts,
        overrides_applied: overrides.length,
        source: 'nightly_life_map_render',
      },
      generated_at: new Date().toISOString(),
      model_used: 'none',
    };

    if (!existingProfile) {
      profileData.relationship_started_at = new Date().toISOString();
    }

    await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(profileData),
    });

    console.log(
      `[UserSynth] Profile rendered for ${userId}: ${facts.length} facts, ${lifeMap ? 'with' : 'without'} Life Map`,
    );

    return {
      success: true,
      source: lifeMap ? 'life_map' : 'facts_only',
      facts_count: facts.length,
    };
  } catch (error) {
    console.error(`[UserSynth] Error for ${userId}:`, error);
    return { success: false, error: String(error) };
  }
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
// LLM: Identity extraction (durable, one-time)
// ============================================================================

/**
 * Extract durable identity-level facts from user messages.
 * Runs ONCE (when identity column is empty) or when manually triggered.
 * Identity facts are pinned and only updated when explicitly contradicted.
 */
async function extractIdentity(messages, existingIdentity, apiKey) {
  const combinedText = messages.slice(0, 100).join('\n---\n');

  const existingContext =
    existingIdentity && Object.keys(existingIdentity).length > 0
      ? `\nEXISTING IDENTITY (keep unless explicitly contradicted):\n${JSON.stringify(existingIdentity)}`
      : '';

  const prompt = `Extract IDENTITY-LEVEL facts about this user from their messages. These are durable, stable attributes that rarely change.
${existingContext}

USER MESSAGES:
${combinedText}

Extract ONLY these categories (leave null if not mentioned):
- name: Their first name
- gender: male, female, or non-binary (only if clearly stated or strongly implied)
- pronouns: he/him, she/her, they/them (infer from gender if not explicitly stated)
- age: Their age or age range
- partner: Partner/spouse name and relationship type (partner, husband, wife, etc.)
- location: City/neighborhood they live in
- conditions: Array of health conditions, neurodivergence, or similar (e.g., ["ADHD", "anxiety"])

RULES:
- Only include facts they EXPLICITLY stated or VERY strongly implied
- If gender is stated (e.g., "as a man", "my boyfriend and I", "34 year old male"), always set pronouns to match
- If they mention a partner by name, include the name AND relationship word they used
- For conditions, only include diagnosed or self-identified conditions, not temporary states
- If a field has an existing value and nothing in the messages contradicts it, KEEP the existing value
- Output as a JSON object with the fields above. Use null for unknown fields.
- Do NOT include situational facts like current projects, jobs, or weekly activities

Output ONLY the JSON object, no explanation.`;

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
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI error (identity): ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    try {
      const parsed = JSON.parse(
        content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim(),
      );
      // Clean: remove null fields, keep only populated ones
      const cleaned = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && value !== undefined && value !== '') {
          cleaned[key] = value;
        }
      }
      return cleaned;
    } catch {
      console.warn('[extractIdentity] Failed to parse JSON:', content);
      return {};
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[extractIdentity] OpenAI request timed out after 90s');
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
        model: 'gpt-4.1-mini',
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
    todos,
    notes,
    habits,
    habitProgress,
    spaces,
    milestones,
    spaceChatMessages,
    userProfileRows,
    weeklySummaries,
    dcoHistory,
    overrides,
  ] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&select=id,title,name,status,completed_at,space_id,created_at,tags,target_date,archived&order=created_at.asc&limit=1000`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&select=id,title,body,subtype,mood,space_id,created_at,target_date,is_goal,archived&order=created_at.asc&limit=1000`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=id,name,frequency,space_id,created_at,archived,completed_at,commitment,subtype&order=created_at.asc&limit=100`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&select=habit_id,occurred_day&order=occurred_day.asc&limit=5000`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&select=id,name,archived_at,created_at&order=created_at.asc`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&select=id,title,name,date,space_id,completed,is_active,completed_at&order=date.asc`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&select=content,created_at,space_id&order=created_at.desc&limit=200`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,signals,identity`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&select=week_start_date,week_end_date,content,stats_snapshot,key_themes&order=week_start_date.asc`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&select=date,dco&order=date.desc&limit=30`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`,
      { headers },
    )
      .then((r) => r.json())
      .catch(() => []),
  ]);

  const safeArr = (v) => (Array.isArray(v) ? v : []);

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
  const spaceSections = snapshot.spaces
    .map((s) => {
      const spaceTodos = snapshot.todos.filter((t) => t.space_id === s.id && !t.archived);
      const spaceNotes = snapshot.notes.filter(
        (n) => n.space_id === s.id && !n.archived && n.subtype !== 'event',
      );
      const spaceHabits = snapshot.habits.filter((h) => h.space_id === s.id);
      const spaceMilestones = snapshot.milestones.filter((m) => m.space_id === s.id);
      const active = spaceTodos.filter((t) => t.status === 'active').length;
      const completed = spaceTodos.filter((t) => t.completed_at).length;

      let section = `SPACE: "${s.name}"${s.archived_at ? ' [ARCHIVED]' : ''}\n`;
      section += `  Todos: ${active} active, ${completed} completed\n`;
      if (spaceTodos.length > 0) {
        section += `  Recent todos: ${spaceTodos
          .slice(-10)
          .map((t) => `${t.title || t.name} [${t.status}]`)
          .join('; ')}\n`;
      }
      if (spaceNotes.length > 0) {
        section += `  Notes (${spaceNotes.length}): ${spaceNotes
          .slice(-8)
          .map((n) => {
            const mood = n.mood?.length > 0 ? ` (mood: ${n.mood.join(',')})` : '';
            const body = n.subtype === 'journal' && n.body ? ` — "${n.body.slice(0, 200)}"` : '';
            return `[${n.subtype || 'note'}] ${n.title}${mood}${body}`;
          })
          .join('; ')}\n`;
      }
      if (spaceHabits.length > 0) {
        section += `  Habits: ${spaceHabits.map((h) => `${h.name} (${h.frequency})${h.archived ? ' [archived]' : ''}`).join(', ')}\n`;
      }
      if (spaceMilestones.length > 0) {
        section += `  Milestones: ${spaceMilestones.map((m) => `${m.title || m.name}: ${m.date}${m.completed ? ' ✓' : ''}`).join('; ')}\n`;
      }
      return section;
    })
    .join('\n');

  // --- Unassigned items ---
  const unassignedTodos = snapshot.todos.filter((t) => !t.space_id && !t.archived);
  const unassignedNotes = snapshot.notes.filter(
    (n) => !n.space_id && !n.archived && n.subtype !== 'event',
  );

  let unassignedSection = '';
  if (unassignedTodos.length > 0 || unassignedNotes.length > 0) {
    unassignedSection = `UNASSIGNED ITEMS:\n`;
    if (unassignedTodos.length > 0) {
      unassignedSection += `  Todos (${unassignedTodos.length}): ${unassignedTodos
        .slice(-15)
        .map((t) => `${t.title || t.name} [${t.status}]`)
        .join('; ')}\n`;
    }
    if (unassignedNotes.length > 0) {
      unassignedSection += `  Notes (${unassignedNotes.length}): ${unassignedNotes
        .slice(-10)
        .map((n) => {
          const mood = n.mood?.length > 0 ? ` (mood: ${n.mood.join(',')})` : '';
          return `[${n.subtype || 'note'}] ${n.title}${mood}`;
        })
        .join('; ')}\n`;
    }
  }

  // --- Journals (full — these are the richest signal) ---
  const journals = snapshot.notes
    .filter((n) => n.subtype === 'journal' && !n.archived)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const journalSection =
    journals.length > 0
      ? 'ALL JOURNAL ENTRIES (chronological):\n' +
        journals
          .map((j) => {
            const date = j.created_at?.split('T')[0] || 'unknown';
            const mood = j.mood?.length > 0 ? ` [mood: ${j.mood.join(', ')}]` : '';
            const space = j.space_id ? ` (${spaceMap[j.space_id] || 'unknown space'})` : '';
            const body = j.body ? `\n  "${j.body.slice(0, 300)}"` : '';
            return `${date}: ${j.title}${mood}${space}${body}`;
          })
          .join('\n')
      : '';

  // --- Habit completion patterns ---
  const habitSection =
    snapshot.habits.length > 0
      ? 'HABITS AND COMPLETION HISTORY:\n' +
        snapshot.habits
          .map((h) => {
            const completions = snapshot.habitProgress.filter((hp) => hp.habit_id === h.id);
            const totalDone = completions.length;
            const space = h.space_id ? ` [${spaceMap[h.space_id] || 'space'}]` : '';
            const status = h.archived ? ' [ARCHIVED]' : '';

            // Weekly completion pattern (last 8 weeks)
            const weeks = {};
            for (const c of completions) {
              const d = new Date(c.occurred_day + 'T00:00:00Z');
              const weekStart = new Date(d);
              weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
              const wk = weekStart.toISOString().split('T')[0]; // eslint-disable-line no-restricted-syntax -- UTC week bucketing
              weeks[wk] = (weeks[wk] || 0) + 1;
            }
            const weekPattern = Object.entries(weeks)
              .slice(-8)
              .map(([w, c]) => `${w}:${c}`)
              .join(', ');

            return `- ${h.name} (${h.frequency})${space}${status}: ${totalDone} total completions. Weekly: ${weekPattern || 'none'}`;
          })
          .join('\n')
      : '';

  // --- Calendar events timeline (deduplicated) ---
  const events = snapshot.notes
    .filter((n) => n.subtype === 'event' && !n.archived)
    .sort((a, b) =>
      (a.target_date || a.created_at || '').localeCompare(b.target_date || b.created_at || ''),
    );

  const seenEvents = new Set();
  const dedupedEvents = events.filter((e) => {
    const key = `${(e.title || '').toLowerCase().trim()}|${e.target_date}`;
    if (seenEvents.has(key)) return false;
    seenEvents.add(key);
    return true;
  });

  const eventSection =
    dedupedEvents.length > 0
      ? 'CALENDAR EVENTS TIMELINE:\n' +
        dedupedEvents
          .slice(-60)
          .map((e) => {
            const space = e.space_id ? ` [${spaceMap[e.space_id] || 'space'}]` : '';
            return `${e.target_date || 'no date'}: ${e.title}${space}`;
          })
          .join('\n')
      : '';

  // --- Weekly summaries (highest quality pre-digested context) ---
  const weeklySummarySection =
    snapshot.weeklySummaries.length > 0
      ? 'WEEKLY SUMMARIES (AI-generated, chronological — treat as high-quality context):\n' +
        snapshot.weeklySummaries
          .map((ws) => {
            const themes = ws.key_themes?.length > 0 ? `Themes: ${ws.key_themes.join(', ')}` : '';
            // Extract the narrative content from the content JSONB
            let narrative = '';
            if (ws.content) {
              if (typeof ws.content === 'string') narrative = ws.content;
              else if (ws.content.narrative) narrative = ws.content.narrative;
              else if (ws.content.summary) narrative = ws.content.summary;
              else if (ws.content.sections) {
                narrative = Object.values(ws.content.sections || {})
                  .filter((v) => typeof v === 'string')
                  .join(' ');
              }
              // Fallback: stringify the whole thing but truncate
              if (!narrative && typeof ws.content === 'object') {
                narrative = JSON.stringify(ws.content).slice(0, 1500);
              }
            }
            return `WEEK OF ${ws.week_start_date} to ${ws.week_end_date}:\n${themes}\n${narrative}`;
          })
          .join('\n\n')
      : '';

  // --- User profile ---
  const profileSection = snapshot.profile?.profile_text
    ? `USER PROFILE:\n${snapshot.profile.profile_text}`
    : '';

  // --- Chat message themes (compressed — just user messages for fact context) ---
  const chatSection =
    snapshot.chatMessages.length > 0
      ? 'USER CHAT MESSAGES (most recent, for personal context):\n' +
        snapshot.chatMessages
          .slice(0, 50)
          .map((m) => {
            const space = m.space_id ? ` [${spaceMap[m.space_id] || 'space'}]` : '';
            return `${m.created_at?.split('T')[0] || ''}${space}: ${(m.content || '').slice(0, 200)}`;
          })
          .join('\n')
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
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ============================================================================
// Life Map: Bootstrap (one-time Sonnet call to build initial Life Map)
// ============================================================================

async function bootstrapLifeMap(snapshot, env) {
  const t0 = Date.now();
  const compressedData = compressSnapshotForBootstrap(snapshot);

  const spaceList = snapshot.spaces
    .filter((s) => !s.archived_at)
    .map((s) => `"${s.name}" (id: ${s.id})`)
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
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(
      `Life Map bootstrap Sonnet call failed: ${response.status} ${errBody.slice(0, 300)}`,
    );
  }

  // Read the SSE stream and accumulate text
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
    `[LifeMap:Bootstrap] Stream complete. Text length: ${fullText.length}, Input: ${inputTokens}, Output: ${outputTokens}`,
  );

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

  console.log(
    `[LifeMap:Bootstrap] Complete in ${latency}ms. Domains: ${lifeMap.domains?.length || 0}`,
    {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  );

  return lifeMap;
}

async function rebuildLifeMap(currentLifeMap, analystOutput, userProfile, spaces, journals, env) {
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

// ── Vibe system for weekly summary voice ────────────────────────────────────
const SUMMARY_VIBES = {
  supportive: {
    voice: `YOUR VOICE: Warm, specific, encouraging. Like a friend who's genuinely proud of you and notices effort even when results are mixed. Celebrate what went well. When something was missed or struggled, frame it with compassion — not fake positivity, but genuine understanding. Every sentence must contain a specific detail from the data.`,
    honesty: `HONESTY: If a habit is struggling, name it warmly — "meditation took a back seat this week, and that's okay." Never ignore problems, but always pair them with context or forward motion.`,
    editorial: `STORY SELECTION OVERRIDE FOR THIS VIBE:

1. EMOTIONAL ARC: Frame the arc in terms of what the person weathered and what they gained. Start with what was hard, end with what grew or held steady. The arc should leave the reader feeling seen and proud — not in a fake way, but because the shape of the week genuinely held something worth noticing.

2. TOP STORIES: Start with themes where trajectory is "building", "consistent", or "reactivated". These are the lead stories. Only include a "declining" or "stalled" theme if habit_data shows the person still showed up partially (some completions, even low), or if emotional_signal shows they noticed and reflected on it. If a habit improved by even 1 completion vs last week, that's a story. Deprioritize themes where the person simply didn't engage and didn't journal about it — silence without emotion is not a supportive story.

3. MOMENTS: Pick days from magic_moment_candidates where journal_quote contains gratitude, pride, connection, or presence. Favor days where something emotionally positive SHIFTED — not just productive or busy days. If no positive days exist, pick days where the person showed self-awareness about struggle. The moment should make the person think "I was doing better than I realized."

4. DISCOVERY: Look at behavioral_fingerprints for patterns showing strength or resilience the person might not see. Prioritize cross_references where 2+ threads moved positively together. If the most interesting pattern involves struggle, frame the discovery around what IS working despite the struggle — not the struggle itself.

5. WHAT'S COMING: Frame upcoming events as things to look forward to or prepare for with confidence. Connect them to this week's wins — "you built momentum in X, and next week's Y is a chance to carry that forward." Never frame next week as daunting.`,
  },
  straight_up: {
    voice: `YOUR VOICE: Clear, direct, no filler. Like a sharp colleague who respects your time. State what happened and what didn't. No cheerleading, no softening, no motivational language. Don't say "great job" or "don't worry." Just be specific and honest. Every sentence must contain a specific detail from the data.`,
    honesty: `HONESTY: If a habit is struggling, say so plainly — "meditation: 1 of 7 days." If something was avoided, name it without editorializing. The user chose this mode because they want clarity, not comfort.`,
    editorial: `STORY SELECTION OVERRIDE FOR THIS VIBE:

1. EMOTIONAL ARC: Frame the arc as what happened vs what was planned. Start with the week's stated or implied intentions (habits set, todos created, events scheduled) and end with what actually occurred. No emotional interpretation — just the shape of the gap between plan and reality.

2. TOP STORIES: Start with engagement_metrics and habit_data completion rates across ALL themes. Rank themes by the SIZE OF THE GAP between target and actual (1/7 completions is a bigger story than 6/7). Give "declining" and "stalled" trajectory themes EQUAL weight to "building" ones — do not deprioritize bad news. Feature threads where active_todo_refs and completed_todo_refs diverge most. narrative_interest scores are secondary to factual gaps.

3. MOMENTS: Pick significant_days ranked by significance rating ("milestone" > "significant" > "notable"). Favor days where concrete, countable things happened or conspicuously didn't — completions, events attended, habits logged or skipped. Do NOT select based on emotional charge from journals. A day with zero activity when activity was expected is a valid moment.

4. DISCOVERY: Find the single hardest number. Compare habit_data completion rates across threads. Identify where actual behavior most diverges from stated intentions. The discovery should be a fact the person can verify, not an interpretation they might disagree with.

5. WHAT'S COMING: List upcoming events with their concrete details — dates, what needs doing, dependencies. No emotional framing. If a stale todo connects to an upcoming event, flag the conflict.`,
  },
  unhinged: {
    voice: `YOUR VOICE: Chaotic, funny, irreverent. Like a best friend who loves you but will absolutely roast you. Celebrate wins with disproportionate hype. Call out avoidance with loving sarcasm. Use humor, metaphor, exaggeration. Be genuinely witty — not corny. Still specific and grounded in data, but make it entertaining. Every sentence must contain a specific detail from the data.`,
    honesty: `HONESTY: If a habit is struggling, roast them lovingly — "you and meditation are in a situationship at this point." If something was avoided, make it funny but unmissable. The humor IS the honesty delivery mechanism.`,
    editorial: `STORY SELECTION OVERRIDE FOR THIS VIBE:

1. EMOTIONAL ARC: Frame the arc as the most dramatic narrative you can honestly tell. Find the turn — the moment the week went from one thing to another. Exaggerate the structure (not the facts). If the week was boring, that's the joke: "absolutely nothing happened and somehow you're still behind on 12 todos."

2. TOP STORIES: Start with cross_references and behavioral_fingerprints. You are looking for CONTRADICTIONS. A "building" thread next to a "declining" one in the same domain. Grateful journal entries on days where habits were skipped. New ambitious todos created the same week old ones went stale. Ignore narrative_interest scores — rank by how ABSURD the juxtaposition is. The best story makes the person laugh because it's undeniably true.

3. MOMENTS: Pick days from week_timeline where the gap between EXTERNAL context (events, location, what they were doing) and INTERNAL state (journal emotional_signal, mood tags) is widest. A work call from a tropical island is a moment. Shipping code while a fitness goal dissolves is a moment. Productive days are not moments. Relaxing days are not moments. ABSURD days are moments.

4. DISCOVERY: Scan behavioral_fingerprints for is_novel = true first. Then check cross_references for connections that would be funny if pointed out. The discovery should make someone say "oh no, that's so true" while laughing. Find where identity and behavior contradict — the person who always ships code but can't sustain a running habit, the person who journals about balance while taking 4am work calls. Avoid discoveries that land as mean without humor.

5. WHAT'S COMING: Find the most ridiculous scheduling conflict or the most ironic upcoming event given what happened this week. If the week ahead is boring, say so — "next week is mercifully uneventful, which based on your track record means you'll create chaos by Wednesday."`,
  },
  philosopher: {
    voice: `YOUR VOICE: Reflective, thoughtful, pattern-seeking. Like a therapist who reads too much. Step back from the surface events and find the deeper thread. Connect small behaviors to larger life questions. Frame mundane actions as part of bigger arcs. Use language that invites reflection rather than reports activity. Still grounded in specific data, but interpret what it might mean. Every sentence must contain a specific detail from the data.`,
    honesty: `HONESTY: If a habit is struggling, explore what it might signal — "the meditation gap isn't about discipline, it's about what you're choosing to give your mornings to instead." Frame honesty as inquiry, not judgment.`,
    editorial: `STORY SELECTION OVERRIDE FOR THIS VIBE:

1. EMOTIONAL ARC: Frame the arc not as what happened but as what the week REVEALED. What was the person becoming? What tension between past and present selves showed up? The arc should feel like the opening of an essay, not a timeline.

2. TOP STORIES: Start with new_theme_candidates and themes where lifecycle_signal just changed ("reactivated", "approaching_dormant", "concluded"). Transitions are the lead stories — not high-activity threads. Then look for themes where emotional_signal is rich but activity_count is low — a thread with deep journaling but little action is more interesting than one with 6 completed todos. Deprioritize "consistent" themes with no emotional texture. Override narrative_interest scores if a low-scored theme has a lifecycle_signal change.

3. MOMENTS: Pick days where journal emotional_signal CONTRADICTS the theme trajectory — anxiety despite progress, or peace despite chaos. Favor quiet days with deep journal entries over busy days with completions. A single sentence that reveals something unprocessed is the moment. Action-heavy days are NOT philosopher moments.

4. DISCOVERY: Focus on cross_references spanning 3+ threads_involved. Look for what small behaviors (a single todo created without comment, a habit skipped without journal reflection, a sentence that contradicts another) signal about a larger shift in identity or priorities. The discovery should connect dots the person hasn't connected. Avoid quantitative findings (completion rates, streaks) in favor of qualitative tensions between who they were last month and who they're becoming.

5. WHAT'S COMING: Connect upcoming events to the deeper themes surfaced this week. Frame next week not as a schedule but as a question — "the sobriety commitment meets its first SF test this week" or "the surrogacy todo sits in the queue, waiting to become a conversation." Every event is an extension of an unresolved thread.`,
  },
};

// ── Main: generateWeeklySummaryV2 ───────────────────────────────────────────
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
  vibe = 'supportive',
) {
  const t0 = Date.now();

  // Build compact thread movements from delta
  const threadMovements = (lifeMapDelta.thread_updates || []).map((u) => ({
    thread: u.thread_name,
    domain: u.domain_name,
    status: u.status,
    momentum: u.momentum,
    lifecycle: u.lifecycle,
    importance: u.importance,
    recent_update: u.recent_update,
  }));

  // Build new threads list
  const newThreads = (lifeMapDelta.new_threads || []).map((t) => ({
    name: t.name,
    domain: t.domain_name || t.new_domain_name,
    summary: t.summary,
  }));

  // Format prior summaries for trend context
  const priorContext = (priorSummaries || []).slice(0, 4).map((ws) => {
    const content = ws.content || ws;
    const meta = content.metadata || {};
    const opening = (content.cards || []).find((c) => c.type === 'opening');
    const gremlyMood = (content.cards || []).find((c) => c.type === 'gremly_mood');
    const discoveries = (content.cards || []).find((c) => c.type === 'discoveries');
    const threadCard = (content.cards || []).find((c) => c.type === 'thread_movements');
    return {
      week_start: ws.week_start_date,
      week_type: meta.week_type || 'N/A',
      mood: meta.mood || opening?.mood || 'N/A',
      hook: gremlyMood?.hook || 'N/A',
      headline: opening?.headline || 'N/A',
      key_themes: meta.key_themes || ws.key_themes || [],
      discovery_title: discoveries?.spotlight?.title || null,
      discovery_takeaway: discoveries?.spotlight?.takeaway || null,
      discovery_sources: discoveries?.spotlight?.research_context?.sources || [],
      highlighted_threads: (threadCard?.threads || [])
        .filter((t) => t.is_highlight)
        .map((t) => ({ name: t.name, direction: t.direction, shift_label: t.shift_label })),
    };
  });

  // Check if this is the first summary of a new month
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const isFirstWeekOfMonth = weekStartDate.getUTCDate() <= 7;
  const monthName = weekStartDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  // Raw journals for quote verification
  const journalExcerpts = (weeklySnapshot.journals || []).map((j) => ({
    date: j.date,
    title: j.title,
    body: j.body ? j.body.slice(0, 500) : null,
    mood: j.mood || [],
  }));

  // Completed todos
  const completedTodos = (weeklySnapshot.todosDetail || [])
    .filter((t) => t.completed_at)
    .map((t) => ({ title: t.title, date: t.completed_at, space: t.space }));

  // Stale items — built from raw snapshot data, NOT dependent on analyst
  const staleItems = (weeklySnapshot.todosDetail || [])
    .filter((t) => {
      if (t.status !== 'active' || t.archived) return false;
      if (!t.created_at) return false;
      const targetDate = weeklySnapshot.targetDate || weekEnd;
      const daysSince = Math.floor(
        (new Date(targetDate + 'T00:00:00Z') -
          new Date(t.created_at.split('T')[0] + 'T00:00:00Z')) /
          86400000,
      );
      return daysSince > 14;
    })
    .map((t) => {
      const targetDate = weeklySnapshot.targetDate || weekEnd;
      const daysSince = Math.floor(
        (new Date(targetDate + 'T00:00:00Z') -
          new Date(t.created_at.split('T')[0] + 'T00:00:00Z')) /
          86400000,
      );
      // Try to find analyst enrichment for this item
      const analystMatch = (analystOutput.stale_items || []).find(
        (s) => s.title && t.title && s.title.toLowerCase() === t.title.toLowerCase(),
      );
      return {
        title: t.title,
        days_stale: daysSince,
        domain: analystMatch?.domain_hint || t.space || 'Uncategorized',
        severity: daysSince > 30 ? 'high' : daysSince > 21 ? 'medium' : 'low',
        item_id: t.id || null,
      };
    });

  // Enrich stale items with thread connections and obsolescence detection
  const concludedThreadNames = (rebuiltLifeMap?.domains || [])
    .flatMap((d) => d.threads || [])
    .filter((t) => t.lifecycle === 'concluded')
    .map((t) => t.name.toLowerCase());

  for (const item of staleItems) {
    // Check if item belongs to a concluded thread (likely obsolete)
    const titleLower = (item.title || '').toLowerCase();
    item.is_obsolete = concludedThreadNames.some((name) => {
      const firstWord = name.split(/\s+/)[0];
      return titleLower.includes(firstWord) && firstWord.length > 3;
    });

    // Check if item connects to a front_of_mind thread (actually matters)
    const frontThreads = (rebuiltLifeMap?.domains || [])
      .flatMap((d) => (d.threads || []).map((t) => ({ ...t, domain: d.name })))
      .filter((t) => t.attention === 'front_of_mind' || t.importance === 'high');

    const threadMatch = frontThreads.find((t) => {
      const threadWords = t.name.toLowerCase().split(/\s+/);
      return threadWords.some((w) => w.length > 3 && titleLower.includes(w));
    });
    item.thread_connection = threadMatch?.name || null;
    item.priority = threadMatch ? 'actionable' : item.is_obsolete ? 'suggest_delete' : 'low';
  }

  // Sort: actionable first, then suggest_delete, then low
  const priorityOrder = { actionable: 0, suggest_delete: 1, low: 2 };
  staleItems.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  console.log(
    `[WeeklySummaryV2] Stale items from snapshot: ${staleItems.length} (analyst had: ${(analystOutput.stale_items || []).length})`,
  );

  // User profile
  const userProfile = weeklySnapshot.userProfile || null;

  let groundedDiscovery = null;

  // Build mood arc from this week's journals (code-generated, not AI-generated)
  const moodArc = (weeklySnapshot.journals || [])
    .filter((j) => j.date >= weekStart && j.date <= weekEnd && j.mood && j.mood.length > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((j) => {
      const moods = j.mood || [];
      const positiveWords = [
        'grateful',
        'happy',
        'excited',
        'proud',
        'hopeful',
        'motivated',
        'calm',
        'good',
        'great',
        'refreshed',
        'optimistic',
        'content',
      ];
      const negativeWords = [
        'anxious',
        'tired',
        'stressed',
        'overwhelmed',
        'sad',
        'frustrated',
        'exhausted',
        'worried',
        'low',
        'anxiety',
        'knackered',
      ];
      const hasPositive = moods.some((m) => positiveWords.some((p) => m.toLowerCase().includes(p)));
      const hasNegative = moods.some((m) => negativeWords.some((n) => m.toLowerCase().includes(n)));
      let valence = 'neutral';
      if (hasPositive && hasNegative) valence = 'mixed';
      else if (hasPositive) valence = 'positive';
      else if (hasNegative) valence = 'anxious';
      const dayName = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(new Date(j.date + 'T00:00:00Z'));
      return { date: j.date, day: dayName, valence };
    });

  // ════════════════════════════════════════════════════════════════════
  // BUILD STORYTELLER DATA PAYLOAD
  // ════════════════════════════════════════════════════════════════════

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
    grounded_discovery: groundedDiscovery,
    is_first_week_of_month: isFirstWeekOfMonth,
    previous_summary_style: (() => {
      const prev = (priorSummaries || [])[0];
      if (!prev?.content?.cards) return null;
      const opening = prev.content.cards.find((c) => c.type === 'opening');
      const gremlyMood = prev.content.cards.find((c) => c.type === 'gremly_mood');
      return {
        last_headline: opening?.headline || null,
        last_subheadline: opening?.subheadline || null,
        last_mood_line: gremlyMood?.mood_line || null,
      };
    })(),
    user_profile: userProfile,
  };

  // ════════════════════════════════════════════════════════════════════
  // BUILD FACTUAL CONTEXT (code-generated, prevents hallucination)
  // ════════════════════════════════════════════════════════════════════

  const nextWeekEvents = analystOutput.event_analysis?.next_week_events || [];
  const significantNextWeek = nextWeekEvents
    .filter((e) => (e.importance || 0) >= 5 && !e.is_recurring)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const recurringMeetings = nextWeekEvents.filter(
    (e) => e.is_recurring || (e.importance || 0) <= 3,
  );

  const factualContext = [
    `WEEK: ${weekStart} to ${weekEnd}`,
    `STALE ITEMS: ${staleItems.length} items over 14 days old`,
    `UPCOMING SIGNIFICANT EVENTS (importance >= 5, non-recurring): ${significantNextWeek.map((e) => `${e.date} ${e.title} (importance: ${e.importance})`).join('; ') || 'none'}`,
    `RECURRING/LOW-IMPORTANCE MEETINGS (DO NOT feature in week ahead): ${recurringMeetings.map((e) => e.title).join(', ') || 'none'}`,
    `MAGIC MOMENT CANDIDATES FROM ANALYST (${(analystOutput.magic_moment_candidates || []).length}): ${(analystOutput.magic_moment_candidates || []).map((m) => `${m.date}: ${m.title}`).join('; ')}`,
    `HIGH NARRATIVE-INTEREST THEMES: ${(analystOutput.themes || [])
      .filter((t) => (t.narrative_interest || 0) >= 7)
      .map((t) => `[${t.narrative_interest}] ${t.label}`)
      .join('; ')}`,
    `DISCOVERY-CANDIDATE FINGERPRINTS: ${(analystOutput.behavioral_fingerprints || [])
      .filter((f) => f.is_discovery_candidate)
      .map((f) => `[${f.narrative_interest || '?'}] ${f.pattern}`)
      .join('; ')}`,
    `PRIOR DISCOVERY TITLES (do NOT repeat): ${
      (priorContext || [])
        .map((p) => p.discovery_title)
        .filter(Boolean)
        .join('; ') || 'none'
    }`,
    `PRIOR DISCOVERY SOURCES (do NOT reuse): ${(priorContext || []).flatMap((p) => p.discovery_sources || []).join('; ') || 'none'}`,
    `PRIOR WEEK QUOTES (do NOT reuse): ${
      (priorSummaries || [])
        .slice(0, 2)
        .map((ws) => {
          const opening = (ws.content?.cards || []).find((c) => c.type === 'opening');
          return opening?.quote ? '"' + opening.quote.slice(0, 80) + '..."' : null;
        })
        .filter(Boolean)
        .join('; ') || 'none'
    }`,
    `GROUNDED DISCOVERY (from web search — USE THESE SOURCES if present): ${groundedDiscovery ? JSON.stringify(groundedDiscovery) : 'null — generate your own using only post-2020 sources'}`,
    `WEEK BOUNDARY: Only feature events from ${weekStart} to ${weekEnd} as moments or discoveries. Prior-week events are context only, never standalone content.`,
  ].join('\n');

  console.log(
    `[WeeklySummaryV2] Starting. Stale: ${staleItems.length}, Moments: ${(analystOutput.magic_moment_candidates || []).length}, Themes: ${(analystOutput.themes || []).length}`,
  );

  // ════════════════════════════════════════════════════════════════════
  // STEP 1: SONNET EDITORIAL BRIEF (free-form, ~500 tokens)
  // ════════════════════════════════════════════════════════════════════

  const activeVibe = SUMMARY_VIBES[vibe] || SUMMARY_VIBES.supportive;

  const editorialSystem = `You are an editor at a magazine for personal growth. You're planning this week's feature story about one person's life. You have rich data from an analyst — themes with narrative_interest scores, behavioral fingerprints, magic moments, cross-references, and a week timeline.

Your job: write a short editorial brief (250-350 words, plain English, no JSON) that answers:

1. EMOTIONAL ARC: What is the emotional shape of this week? How did it start vs end?

2. TOP STORIES (pick 3-4 from DIFFERENT life domains): What are the most interesting stories? Prioritize by narrative_interest score. The best stories are surprising, emotionally resonant, or reveal something the person didn't notice. A clean stat (habit went from 0 to 4) is LESS interesting than a messy human story (a spontaneous life decision, a contradiction between intention and behavior, a new life chapter beginning). Pick stories from different domains — never cluster around one theme.

3. MOMENTS (pick 2 from different days): Which days had the most vivid, emotionally charged experiences? Reference specific journal quotes or events. These should be days where something SHIFTED or was FELT deeply, not just busy or productive days.

4. DISCOVERY: What is the single most surprising behavioral pattern the person wouldn't have noticed on their own? This should span multiple life threads if possible. Avoid the most obvious quantitative finding — dig for the insight that connects dots across different areas.

4b. MULTI-WEEK ARCS: Check the prior_weeks data in the analyst payload. If a thread appeared in the previous summary with the same direction (e.g. sobriety was "down" last week and is "down" again), DEEPEN the analysis rather than re-introduce the topic. Say what CHANGED or ESCALATED. If a prior week's discovery or recommendation was validated or contradicted this week, that's a high-interest story.

4c. AVOID RE-OBSERVATION: If the prior weeks already covered a pattern (check prior_weeks key_themes and discovery_title), don't re-surface it as if it's new. Instead, frame it as a continuation: "This is the third week where X..." or "Last week we noted X — this week it deepened/reversed."

5. WHAT'S COMING: What are the 2-3 most significant events next week? Only mention events with importance >= 5. Never mention recurring meetings, standups, syncs, or routine admin.

6. QUOTES: Which 2-3 journal quotes best capture the week? Assign each to a specific card (opening, moment 1, moment 2). Each quote used only once.

7. FACTUAL WARNINGS: Note anything the storyteller must get right — the person's current location, whether they're traveling or home, whether they're on leave or working, any common misinterpretation the data might invite.

8. WEEK BOUNDARY: Your discoveries and moments MUST be about events that happened between ${weekStart} and ${weekEnd}. Do NOT feature events from prior weeks (like a half marathon on March 22 when this week starts March 23) as discoveries or moments. Prior week events may only be referenced as CONTEXT for this week's story — never as the story itself. If the analyst flagged a prior-week event, use it only to explain this week's behavior, not as a standalone discovery.

IDENTITY & PRONOUNS: The analyst data includes a user_profile field. If it starts with "IDENTITY:", use those facts for the person's name, gender, and pronouns throughout the brief. Never assume or guess — always match what's stated. If no identity line exists, use "they/them".

${activeVibe.editorial}`;

  const editorialUser = `Write the editorial brief for ${weekStart} to ${weekEnd}.

FACTUAL CONTEXT (verified by code — trust these):
${factualContext}

FULL ANALYST DATA:
${JSON.stringify(storytellerData, null, 2)}`;

  console.log(`[WeeklySummaryV2] Calling Sonnet editorial brief...`);
  const briefT0 = Date.now();

  const briefResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.6,
      messages: [{ role: 'user', content: editorialUser }],
      system: editorialSystem,
    }),
  });

  let editorialBrief = '';
  let briefInputTokens = 0;
  let briefOutputTokens = 0;

  if (briefResponse.ok) {
    const briefData = await briefResponse.json();
    editorialBrief = (briefData.content || [])
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    briefInputTokens = briefData.usage?.input_tokens || 0;
    briefOutputTokens = briefData.usage?.output_tokens || 0;
    console.log(
      `[WeeklySummaryV2] Editorial brief: ${briefOutputTokens} tokens, ${Date.now() - briefT0}ms`,
    );
  } else {
    console.warn(
      `[WeeklySummaryV2] Editorial brief failed: ${briefResponse.status}. Continuing without it.`,
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 1.5: DISCOVERY GROUNDING (Gemini + Google Search)
  // ════════════════════════════════════════════════════════════════════

  if (editorialBrief && env.GEMINI_API_KEY) {
    try {
      const discoveryPatterns = [
        /DISCOVERY:?\s*([\s\S]*?)(?=\n\s*\d+[.)]\s|WHAT'S COMING|QUOTES|FACTUAL|$)/i,
        /\d+\.\s*DISCOVERY:?\s*([\s\S]*?)(?=\n\s*\d+|WHAT|QUOTE|$)/i,
        /discovery[:\s]+([\s\S]*?)(?=\n\n|\n\d|$)/i,
      ];
      let discoveryTopic = '';
      for (const pattern of discoveryPatterns) {
        const m = editorialBrief.match(pattern);
        if (m?.[1]?.trim().length > 20) {
          discoveryTopic = m[1].trim();
          break;
        }
      }
      if (!discoveryTopic) {
        const paragraphs = editorialBrief.split(/\n\n+/).filter((p) => p.trim().length > 50);
        discoveryTopic = (paragraphs[1] || paragraphs[0] || '').trim();
        if (discoveryTopic) {
          console.warn(
            `[WeeklySummaryV2] Discovery extraction fallback used — no DISCOVERY section found in brief`,
          );
        }
      }
      if (discoveryTopic) {
        console.log(
          `[WeeklySummaryV2] Discovery topic extracted (${discoveryTopic.length} chars): ${discoveryTopic.slice(0, 100)}...`,
        );
      }

      if (discoveryTopic.length > 20) {
        console.log(`[WeeklySummaryV2] Grounding discovery: "${discoveryTopic.slice(0, 80)}..."`);

        const searchPrompt = `You are a research assistant finding practical web resources relevant to a specific behavioral insight from someone's weekly review.

THE INSIGHT:
"${discoveryTopic}"

YOUR TASK:

1. Based ONLY on what the insight describes, generate 3-4 specific search queries that would find practical articles, podcast episodes, or tools relevant to this exact pattern. Derive your queries from the insight itself — do not assume anything about the person beyond what the insight states.

2. Search and find 2-3 resources that meet ALL of these criteria:
   - MUST have a real, working URL (no books, no academic papers without URLs)
   - MUST be from the last 3 years (2023-2026)
   - MUST be practical and actionable — blog posts, specific podcast episodes, newsletter issues, tools, community discussions
   - PREFER sources from: Indie Hackers, First Round Review, HBR online, specific named podcast episodes with timestamps, Substack posts, well-sourced Reddit threads
   - REJECT: Amazon book pages, academic journal abstracts, generic self-help listicles, anything without a verifiable URL

3. Write a 2-3 sentence explanation (max 250 chars) connecting the insight to a broader pattern. Ground this in the sources you found, not in academic theory.

Respond with ONLY valid JSON, no markdown:
{
  "title": "Why this happens",
  "body": "2-3 sentence explanation grounded in found sources. Max 250 chars.",
  "sources": [
    {
      "title": "Article or episode title",
      "url": "https://actual-url.com/article",
      "why_relevant": "one sentence connecting to the specific insight"
    }
  ]
}

If you cannot find resources with real URLs, return fewer sources rather than fabricating URLs. One real source beats three fake ones.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: searchPrompt }] }],
              tools: [{ google_search: {} }],
            }),
          },
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const geminiText = (geminiData.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('');
          if (geminiText) {
            let cleaned = geminiText.trim();
            if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            }
            try {
              groundedDiscovery = JSON.parse(cleaned);
              console.log(
                `[WeeklySummaryV2] Discovery grounded: ${groundedDiscovery.sources?.length || 0} sources`,
              );
            } catch (e) {
              console.warn(`[WeeklySummaryV2] Discovery grounding parse failed: ${e.message}`);
            }
          }
        } else {
          console.warn(`[WeeklySummaryV2] Gemini discovery grounding failed: ${geminiRes.status}`);
        }
      }
    } catch (e) {
      console.warn(`[WeeklySummaryV2] Discovery grounding error: ${e.message}`);
    }
  }

  // Update storytellerData with grounded discovery (declared null before storytellerData was built)
  storytellerData.grounded_discovery = groundedDiscovery;

  // ════════════════════════════════════════════════════════════════════
  // STEP 2: SONNET STORYTELLER (guided by brief, outputs full cards)
  // ════════════════════════════════════════════════════════════════════

  const storytellerSystem = `You are Gremly, a warm and perceptive life companion. You're writing a weekly summary as an ordered set of cards. You have two inputs:

1. An EDITORIAL BRIEF from a senior editor telling you which stories to focus on, which moments to highlight, and which quotes to use where. FOLLOW THE BRIEF. It has already made the editorial decisions — your job is to write beautifully within that direction.

2. ANALYST DATA containing the structured evidence — themes, habit stats, journal quotes, events, behavioral fingerprints. Every claim you make must trace to this data. Never invent facts.

IDENTITY & PRONOUNS: The analyst data includes a user_profile field. If it starts with "IDENTITY:", use those facts for the person's name and pronouns throughout every card. Never assume gender. If no identity line exists, default to "they/them". This is a hard rule — misgendering is unacceptable.

FACTUAL CONTEXT (from code — these are ground truth):
${factualContext}

${activeVibe.voice}

CARD SCHEMAS — output an ordered JSON array of cards. Respond with ONLY valid JSON, no markdown:
{
  "cards": [
    {
      "type": "gremly_mood",
      "mood_line": "2-4 word emotional read (max 30 chars)",
      "hook": "One sentence — the week's most important thing (max 120 chars)",
      "week_label": "${weekStart} to ${weekEnd}"
    },
    {
      "type": "opening",
      "headline": "Bold statement, max 60 chars",
      "subheadline": "2-4 word week type, max 25 chars",
      "body": "2-3 sentences, max 350 chars. The narrative hook.",
      "mood": "2-4 words, max 20 chars",
      "quote": "Verbatim journal quote assigned to opening by the brief, or null",
      "quote_date": "YYYY-MM-DD",
      "image_hint": "Broad scenic keyword for photo search — location name + scene type. Never activity-specific words."
    },
    ${
      isFirstWeekOfMonth
        ? `{
      "type": "month_arc",
      "title": "Your ${monthName} in review",
      "body": "3-4 sentences covering the dominant arc of the past month. What moved, what stalled, what emerged. Max 500 chars.",
      "threads_that_grew": ["thread names with upward momentum from prior_weeks"],
      "threads_that_stalled": ["thread names with declining/stalled momentum"],
      "emerged": ["new thread names that appeared this month"],
      "month_discovery": "One sentence — the most surprising cross-week pattern visible only at the month level. Max 150 chars."
    },`
        : ''
    }
    {
      "type": "moments",
      "moments": [
        {
          "day_label": "MON|TUE|WED|THU|FRI|SAT|SUN",
          "date": "YYYY-MM-DD",
          "title": "Short evocative title reflecting the experience, max 40 chars",
          "body": "What the user FELT or what SHIFTED. Not a recap. Max 300 chars.",
          "image_hint": "Broad scenic keyword — location + scene. Never activity words.",
          "thread_tags": ["thread names"]
        }
      ]
    },
    {
      "type": "thread_movements",
      "title": "Life in motion",
      "threads": [
        {
          "name": "thread name from Life Map",
          "domain": "domain name",
          "direction": "up|down|milestone|concluded|new|steady|paused",
          "icon_hint": "fitness|travel|work|personal|health|creative|relationship|admin",
          "shift_label": "Transition label, max 40 chars",
          "badge_label": "1-2 word status, max 15 chars",
          "detail": "One evidence sentence, max 140 chars. MUST be different from any detail used on other cards.",
          "is_highlight": true
        }
      ]
    },
    {
      "type": "discoveries",
      "spotlight": {
        "badge": "discovery|shift|breakthrough",
        "title": "Short punchy label, max 50 chars",
        "takeaway": "The insight — what it means. Max 150 chars. This appears FIRST visually.",
        "evidence_trail": "Specific data points — dates, items, quotes, numbers. Max 400 chars.",
        "research_context": {
          "title": "Why this happens",
          "body": "Connect to behavioral science. Name researchers or frameworks. Max 250 chars.",
          "sources": ["Author (Year) — Topic (max 3)"]
        }
      },
      "mini_discoveries": [
        {
          "title": "Short finding, max 40 chars",
          "detail": "One sentence with evidence, max 100 chars"
        }
      ]
    },
    {
      "type": "recommends",
      "primary": {
        "title": "Main suggestion, max 50 chars",
        "body": "Why this matters — grounded in this week's data. Max 200 chars.",
        "type": "thought|experiment|habit_idea|mindset_shift"
      },
      "secondary": [
        {
          "title": "Suggestion, max 50 chars",
          "body": "Brief reasoning, max 150 chars",
          "type": "thought|experiment|habit_idea|mindset_shift"
        }
      ]
    },
    ${
      staleItems.length > 0
        ? `{
      "type": "stale_triage",
      "headline": "${staleItems.length} items need attention",
      "body": "1-2 sentences. Compassionate framing. Max 150 chars.",
      "items": ${JSON.stringify(staleItems.slice(0, 10))}
    },`
        : ''
    }
    {
      "type": "week_ahead",
      "intro": "What's coming — max 200 chars. Reference only SIGNIFICANT upcoming events. NEVER mention recurring meetings or routine admin.",
      "highlights": [
        {
          "day_label": "MON|TUE|...",
          "date": "YYYY-MM-DD",
          "title": "Event title",
          "icon_hint": "lucide icon name",
          "thread_connection": "thread name or null",
          "prep_nudge": "Practical suggestion, max 100 chars, or null",
          "context": "Why this matters, max 120 chars, or null",
          "importance": 1
        }
      ],
      "busy_day_warnings": [
        { "day": "day name", "detail": "What makes it busy, max 80 chars" }
      ]
    }
    {
      "type": "letter",
      "body": "2-3 sentences. Written as Gremly leaving a personal note for the user on Monday morning. Reference one specific upcoming event or deadline, one habit worth protecting, and one emotional truth from this week. Intimate, warm, never generic. Max 300 chars."
    }
  ],
  "metadata": {
    "week_type": "2-3 word label",
    "mood": "2-4 words",
    "key_themes": ["3-5 theme labels"],
    "card_count": 0,
    "card_types_used": []
  }
}

CRITICAL RULES:
1. FOLLOW THE EDITORIAL BRIEF for story selection, moment choices, discovery topic, and quote assignments. The brief made the editorial decisions — you execute them.
2. MOMENTS: Always include 2 moments from different days unless the brief explicitly says otherwise. Each moment is about what the person FELT, not what they did.
3. DEDUPLICATION: Each journal quote on exactly ONE card. Each specific detail (activity, stat, event) on exactly ONE card. If a fact appears on the opening, it cannot appear on any other card.
4. THREAD MOVEMENTS: Show 4-6 threads. Each thread's detail must be a DIFFERENT fact from anything used elsewhere. If a habit hit its target, say so — don't let a bundled theme's overall trajectory hide individual wins.
5. DISCOVERY: Follow the brief's discovery recommendation. The discovery must be from a DIFFERENT life domain than the primary recommendation.
6. RECOMMENDATIONS: Concrete, specific, grounded in evidence. At least one should address what's coming next week. Max 200 chars for primary body, max 150 chars for secondary body.
7. WEEK AHEAD: Only events with importance >= 5. NEVER include recurring meetings, syncs, standups, status updates, or routine admin. Check the factual context for the explicit list of meetings to exclude.
8. STALE TRIAGE: If stale items are provided in the schema above, include them exactly as given. Do not modify the items array.
9. IMAGE HINTS: Match the hint to the EMOTIONAL TONE of the moment, not just the location. Use variety across the summary:
   - Reflective moments: "morning light through window texture", "still water reflection dawn", "empty desk warm light"
   - Productive moments: "workspace overhead flat lay", "urban crosswalk motion blur", "city intersection golden hour"
   - Social moments: "restaurant warm lighting evening", "park gathering afternoon", "neighborhood cafe sidewalk"
   - Anxious/tense moments: "overcast skyline fog", "rain on window condensation", "empty corridor perspective"
   - Milestone moments: "sunrise panoramic horizon", "mountain summit wide angle", "open road vanishing point"
   Include a location keyword ONLY if the user was in a specific city that week. Never use the same image style twice in one summary.
10. ${activeVibe.honesty}
11. PRIOR WEEKS: If a thread appeared in a prior summary's key_themes with the same direction, you MUST frame it as a continuation, not a new observation. Use language like "for the second week..." or "the pattern that started in [prior week type]..." The reader has seen prior summaries — repeating the same observation feels hollow.
12. DISCOVERY NON-REPETITION: Check prior_weeks for discovery_title values. Your spotlight discovery MUST be a different insight from any discovery in the previous 2 summaries. If the analyst's top discovery candidate was already covered, use a different one. Also, do NOT reuse the same research sources — check prior_weeks.discovery_sources and choose different researchers/frameworks.
13. DISCOVERY SOURCES: If grounded_discovery data is provided in the analyst data, use those real sources and descriptions in the research_context instead of generating your own academic citations. Real article titles with URLs are dramatically more useful than textbook citations. Format them as: sources: ["Title — why_relevant"]. If grounded_discovery is null, generate your own research_context using lesser-known researchers, recent studies, or practical frameworks — never cite the same researcher twice across summaries, and check prior_weeks.discovery_sources to avoid repetition.
14. STALE TRIAGE: Items are pre-sorted by priority. Items marked "actionable" connect to important life threads — surface these first. Items marked "suggest_delete" are likely obsolete (connected to concluded threads like honeymoon) — suggest the user delete them. Cap at showing 10 items max, note remaining count in the body.
15. MONTH ARC: ${isFirstWeekOfMonth ? 'This IS the first week of a new month — include a month_arc card AFTER the opening card. Look at prior_weeks data to identify what grew, stalled, or emerged over the past 4 weeks. The month_discovery should be a pattern only visible at the month scale.' : 'This is NOT the first week of the month — do NOT include a month_arc card.'}
17. LETTER: Always include a "letter" card as the FINAL card (after week_ahead). It should read like a handwritten note left by someone who cares. Reference one specific thing from the week ahead, one habit to protect, and one emotional truth from this week. Never generic motivational language — always grounded in this specific week's data.
16. VARIETY: ${storytellerData.previous_summary_style?.last_headline ? `Your previous summary used: headline "${storytellerData.previous_summary_style.last_headline}", subheadline "${storytellerData.previous_summary_style.last_subheadline}", mood_line "${storytellerData.previous_summary_style.last_mood_line}". Use a DIFFERENT sentence structure, rhythm, and emotional register for these fields this week. Don't repeat the same pattern.` : 'No previous summary style data available.'}
18. QUOTE NON-REPETITION: Check the PRIOR WEEK QUOTES list in the factual context. Never use a quote that appeared in a previous summary's opening card. Pick a different journal quote from this week's data.
19. WEEK BOUNDARY: Every moment and discovery must be grounded in events from ${weekStart} to ${weekEnd}. References to prior weeks are context, not content. If the analyst surfaced a prior-week event (e.g. a missed race), only mention it if it directly explains THIS week's behavior — never as a standalone mini_discovery or moment.
20. CROSS-THREAD CONNECTIONS: In the thread_movements card, at least 2 thread details MUST reference how that thread connected to a different thread this week. Show cause and effect across life domains — not just what happened in isolation. In the discovery spotlight, the evidence_trail MUST explicitly name 3+ threads and show how they formed a chain. Isolated observations are less valuable than connected ones.
21. DATE ACCURACY: Only include specific dates in week_ahead highlights if the date appears in the calendar data or was explicitly stated by the user. If an event was mentioned without a specific date, reference it without one — never fabricate a day.
22. QUOTE NON-REPETITION: Check the PRIOR WEEK QUOTES in factual context. Never reuse a quote that appeared in a previous summary's opening card. Pick a different journal quote from this week's data.
23. WEEK BOUNDARY: Every moment, discovery, and mini_discovery must be grounded in events from the current analysis week. Prior-week events may only be referenced as context explaining this week's behavior — never as standalone content.
24. RESEARCH RECENCY: If generating your own research_context (when grounded_discovery is null), ONLY cite work from 2020 or later. One source maximum. Prefer practical frameworks or recent articles over academic papers. Never cite the same researcher used in a prior summary.`;

  const storytellerUser = `Write this user's weekly summary for ${weekStart} to ${weekEnd}.

EDITORIAL BRIEF:
${editorialBrief || 'No brief available — use your best editorial judgment based on the analyst data.'}

ANALYST DATA:
${JSON.stringify(storytellerData, null, 2)}`;

  console.log(
    `[WeeklySummaryV2] Calling Sonnet storyteller. Payload: ${storytellerUser.length} chars`,
  );
  const storyT0 = Date.now();

  const storyResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      temperature: 0.5,
      stream: true,
      messages: [{ role: 'user', content: storytellerUser }],
      system: storytellerSystem,
    }),
  });

  if (!storyResponse.ok) {
    const errBody = await storyResponse.text().catch(() => '');
    throw new Error(
      `Storyteller Sonnet call failed: ${storyResponse.status} ${errBody.slice(0, 300)}`,
    );
  }

  // Read SSE stream
  let fullText = '';
  let storyInputTokens = 0;
  let storyOutputTokens = 0;
  const reader = storyResponse.body.getReader();
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
          storyOutputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          storyInputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {
        /* ignore malformed SSE events */
      }
    }
  }

  console.log(
    `[WeeklySummaryV2] Storyteller complete: ${fullText.length} chars, ${storyInputTokens} in / ${storyOutputTokens} out, ${Date.now() - storyT0}ms`,
  );

  // Parse JSON
  let jsonStr = fullText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn('[WeeklySummaryV2] Parse failed, using jsonrepair:', parseErr.message);
    try {
      parsed = JSON.parse(jsonrepair(jsonStr));
    } catch (repairErr) {
      console.error('[WeeklySummaryV2] jsonrepair also failed:', repairErr.message);
      throw new Error(`Weekly summary parse error: ${repairErr.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 3: HAIKU CONSTRAINT CHECK (mechanical fixes only)
  // ════════════════════════════════════════════════════════════════════

  if (parsed.cards) {
    const constraintSystem = `You are a strict copy editor. You receive a weekly summary as a JSON cards array. Your ONLY job is to fix mechanical violations. Do NOT change meaning, tone, style, or content. Do NOT rewrite prose. Only fix these specific issues:

1. CHARACTER LIMITS: If any field exceeds its limit, shorten it by removing the least important clause or trimming the end at a natural sentence boundary (period, semicolon, em dash). NEVER cut mid-word. NEVER leave a sentence fragment. If you cannot shorten without cutting mid-word, leave it as-is.
   Limits: gremly_mood.mood_line: 30, gremly_mood.hook: 120, opening.headline: 60, opening.body: 350, thread detail: 140, thread shift_label: 40, thread badge_label: 15, moment title: 40, moment body: 300, spotlight title: 50, evidence_trail: 400, takeaway: 150, research_context body: 250, week_ahead intro: 200, stale headline: 50, stale body: 150, recommends primary title: 50, recommends primary body: 200, recommends secondary title: 50, recommends secondary body: 150, letter body: 300.

2. QUOTE DUPLICATION: If the exact same journal quote (or substantial substring of 10+ words) appears on more than one card, remove it from every card EXCEPT the first card it appears on. Replace the removed quote with a different observation or set to null.

3. STALE ITEMS: Do NOT modify the stale_triage items array. It was injected by code and is correct.

Respond with ONLY the corrected JSON cards array. If nothing needs fixing, return the array unchanged.`;

    try {
      const constraintRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 6000,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: `Check and fix this weekly summary JSON. Apply character limits and quote deduplication rules strictly. NEVER cut mid-word.\n\n${JSON.stringify(parsed.cards)}`,
            },
          ],
          system: constraintSystem,
        }),
      });

      if (constraintRes.ok) {
        const constraintData = await constraintRes.json();
        const constraintText = (constraintData.content || [])
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('');
        if (constraintText) {
          let cleaned = constraintText.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          }
          try {
            const fixedCards = JSON.parse(cleaned);
            if (Array.isArray(fixedCards) && fixedCards.length > 0) {
              parsed.cards = fixedCards;
              console.log(`[WeeklySummaryV2] Constraint check applied: ${fixedCards.length} cards`);
            }
          } catch {
            try {
              const repaired = JSON.parse(jsonrepair(cleaned));
              if (Array.isArray(repaired) && repaired.length > 0) {
                parsed.cards = repaired;
                console.log(`[WeeklySummaryV2] Constraint check applied (with jsonrepair)`);
              }
            } catch {
              console.warn(
                `[WeeklySummaryV2] Constraint check parse failed — using storyteller output as-is`,
              );
            }
          }
        }
      } else {
        console.warn(`[WeeklySummaryV2] Constraint check failed: ${constraintRes.status}`);
      }
    } catch (e) {
      console.warn(`[WeeklySummaryV2] Constraint check error: ${e.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 4: IMAGE RESOLUTION (Unsplash)
  // ════════════════════════════════════════════════════════════════════

  if (parsed.cards && env.UNSPLASH_ACCESS_KEY) {
    const imagePromises = [];
    const openingCard = parsed.cards.find((c) => c.type === 'opening');
    if (openingCard?.image_hint) {
      imagePromises.push(
        resolveImageUrl(openingCard.image_hint, env).then((url) => {
          if (url) openingCard.image_url = url;
        }),
      );
    }
    const momentsCard = parsed.cards.find((c) => c.type === 'moments');
    if (momentsCard?.moments) {
      for (const moment of momentsCard.moments) {
        if (moment.image_hint) {
          imagePromises.push(
            resolveImageUrl(moment.image_hint, env).then((url) => {
              if (url) moment.image_url = url;
            }),
          );
        }
      }
    }
    await Promise.all(imagePromises);
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 5: POST-PARSE CODE INJECTION
  // ════════════════════════════════════════════════════════════════════

  if (parsed.cards) {
    // Engagement stats on opening card
    const openingCard = parsed.cards.find((c) => c.type === 'opening');
    if (openingCard && engagementStats) {
      openingCard.engagement = {
        drops: engagementStats.drops || 0,
        sweeps: engagementStats.sweeps || 0,
        journals: engagementStats.journals || 0,
      };
    }

    // badge_type on thread movements
    const tmCard = parsed.cards.find((c) => c.type === 'thread_movements');
    if (tmCard && tmCard.threads) {
      const dirToBadge = {
        up: 'success',
        steady: 'info',
        milestone: 'warning',
        concluded: 'neutral',
        down: 'danger',
        paused: 'danger',
        new: 'info',
      };
      for (const thread of tmCard.threads) {
        if (!thread.badge_type) thread.badge_type = dirToBadge[thread.direction] || 'neutral';
      }
    }

    // Stale item IDs — fuzzy match to real todos
    const staleCard = parsed.cards.find((c) => c.type === 'stale_triage');
    if (staleCard && staleCard.items) {
      for (const item of staleCard.items) {
        if (!item.item_id) {
          const match = (weeklySnapshot.todosDetail || []).find(
            (t) =>
              t.title &&
              item.title &&
              (t.title.toLowerCase() === item.title.toLowerCase() ||
                t.title.toLowerCase().includes(item.title.toLowerCase()) ||
                item.title.toLowerCase().includes(t.title.toLowerCase())),
          );
          if (match) item.item_id = match.id;
        }
      }
    }

    // ── Fed stats on gremly_mood card ──
    const moodCard = parsed.cards.find((c) => c.type === 'gremly_mood');
    if (moodCard && engagementStats) {
      moodCard.fed_stats = {
        fed_days_this_week: engagementStats.fed_days_this_week || 0,
        gremly_age: engagementStats.gremly_age || 0,
        current_tier: engagementStats.current_tier || 'egg',
        fed_days_toward_next: engagementStats.fed_days_toward_next || 0,
        fed_days_needed: engagementStats.fed_days_needed || 3,
        sock_count: engagementStats.sock_count || 0,
      };
    }

    // ── Engagement deltas on opening card ──
    const priorOpening = (priorSummaries || [])[0]?.content?.cards?.find(
      (c) => c.type === 'opening',
    );
    const priorEngagement = priorOpening?.engagement || null;
    if (openingCard && openingCard.engagement) {
      openingCard.engagement.drops_delta = priorEngagement
        ? (openingCard.engagement.drops || 0) - (priorEngagement.drops || 0)
        : null;
      openingCard.engagement.sweeps_delta = priorEngagement
        ? (openingCard.engagement.sweeps || 0) - (priorEngagement.sweeps || 0)
        : null;
      openingCard.engagement.journals_delta = priorEngagement
        ? (openingCard.engagement.journals || 0) - (priorEngagement.journals || 0)
        : null;
    }

    // ── Mood arc on opening card ──
    if (openingCard && moodArc && moodArc.length > 0) {
      openingCard.mood_arc = moodArc;
    }

    // ── Thread velocity on thread movement tiles ──
    if (tmCard?.threads && analystOutput.themes) {
      for (const thread of tmCard.threads) {
        const analystTheme = (analystOutput.themes || []).find(
          (t) => t.label === thread.name || t.life_map_thread === thread.name,
        );
        if (!analystTheme?.this_week?.activity_count) continue;
        // Only show velocity on threads with enough completed todos to make the metric meaningful
        const completedCount = analystTheme?.this_week?.completed_todo_refs?.length || 0;
        if (completedCount < 3) continue;
        const thisWeekCount = analystTheme.this_week.activity_count;

        const priorCounts = (priorSummaries || [])
          .slice(0, 3)
          .map((ws) => {
            const priorThreads =
              (ws.content?.cards || []).find((c) => c.type === 'thread_movements')?.threads || [];
            const match = priorThreads.find((t) => t.name === thread.name);
            if (!match?.detail) return 0;
            const nums = match.detail.match(/\d+/);
            return nums ? parseInt(nums[0]) : 3;
          })
          .filter((c) => c > 0);

        if (priorCounts.length > 0) {
          const avg = priorCounts.reduce((a, b) => a + b, 0) / priorCounts.length;
          if (avg > 0) {
            const velocity = Math.round((thisWeekCount / avg) * 10) / 10;
            if (velocity !== 1.0) {
              thread.velocity = velocity;
              thread.velocity_label = `${velocity}x your ${priorCounts.length + 1}-week avg`;
            }
          }
        }
      }
    }

    // ── Ask Gremly prompt on discovery card ──
    const discCard = parsed.cards.find((c) => c.type === 'discoveries');
    if (discCard?.spotlight?.title && discCard?.spotlight?.takeaway) {
      discCard.spotlight.ask_gremly_prompt = `I noticed something in my weekly summary: "${discCard.spotlight.title}". ${discCard.spotlight.takeaway} Can we talk about this?`;
    }

    // ── Sign letter card with Gremly identity ──
    const letterCard = parsed.cards.find((c) => c.type === 'letter');
    if (letterCard && engagementStats) {
      letterCard.gremly_age = engagementStats.gremly_age || 0;
      letterCard.current_tier = engagementStats.current_tier || 'egg';
    }

    // Structural enforcement — max 8 cards
    if (parsed.cards.length > 8) {
      const recIdx = parsed.cards.findIndex((c) => c.type === 'recommendation');
      if (recIdx !== -1) parsed.cards.splice(recIdx, 1);
    }
    if (parsed.cards.length > 8) {
      const mrIdx = parsed.cards.findIndex((c) => c.type === 'monthly_retro');
      if (mrIdx !== -1) {
        const mrCard = parsed.cards[mrIdx];
        const waCard = parsed.cards.find((c) => c.type === 'week_ahead');
        if (waCard)
          waCard.monthly_retro = {
            headline: mrCard.headline,
            body: mrCard.body,
            thread_arcs: mrCard.thread_arcs,
          };
        parsed.cards.splice(mrIdx, 1);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════════════

  const latency = Date.now() - t0;

  console.log(`[WeeklySummaryV2] Complete in ${latency}ms`, {
    brief_tokens: `${briefInputTokens}/${briefOutputTokens}`,
    story_tokens: `${storyInputTokens}/${storyOutputTokens}`,
    card_count: parsed.cards?.length || 0,
    card_types: parsed.cards?.map((c) => c.type) || [],
  });

  return {
    summary: parsed,
    metadata: {
      latency_ms: latency,
      brief_input_tokens: briefInputTokens,
      brief_output_tokens: briefOutputTokens,
      story_input_tokens: storyInputTokens,
      story_output_tokens: storyOutputTokens,
      model_brief: 'claude-sonnet-4-6',
      model_storyteller: 'claude-sonnet-4-6',
      card_count: parsed.cards?.length || 0,
      card_types: parsed.cards?.map((c) => c.type) || [],
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

  // 11: Space chat running summaries (active chats with summaries, updated in window)
  queries.push(
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_chats?user_id=eq.${userId}&archived_at=is.null&running_summary=neq.&running_summary=not.is.null&updated_at=gte.${windowStartStr}&select=id,space_id,title,running_summary,updated_at&order=updated_at.desc&limit=10`,
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
    .filter((n) => {
      const d = n.created_at ? n.created_at.split('T')[0] : null;
      return d && d >= twoDaysAgoStr && d <= snapshot.targetDate;
    })
    .slice(0, 15)
    .map((d) => ({
      title: d.title,
      subtype: d.subtype,
      mood: d.mood || [],
      space: computed.spaceMap[d.space_id] || null,
      body: d.subtype === 'journal' && d.body ? d.body.slice(0, 200) : null,
      date: d.created_at ? d.created_at.split('T')[0] : null,
    }));

  // Habit completions — yesterday and today only
  const yesterdayStr = formatDateOnly(
    new Date(new Date(snapshot.targetDate + 'T00:00:00Z').getTime() - 86400000),
  );
  const recentHabitCompletions = raw.habitProgress
    .filter((hp) => hp.occurred_day >= yesterdayStr)
    .reduce((acc, hp) => {
      acc[hp.habit_id] = (acc[hp.habit_id] || 0) + 1;
      return acc;
    }, {});

  // Milestones approaching (within 7 days)
  const sevenFromTarget = new Date(snapshot.targetDate + 'T00:00:00Z');
  sevenFromTarget.setUTCDate(sevenFromTarget.getUTCDate() + 7);
  const sevenFromTargetStr = formatDateOnly(sevenFromTarget);

  const approachingMilestones = raw.milestones
    .filter(
      (m) =>
        !m.completed && m.date && m.date >= snapshot.targetDate && m.date <= sevenFromTargetStr,
    )
    .map((m) => ({
      title: m.title || m.name,
      date: m.date,
      space: computed.spaceMap[m.space_id] || null,
      daysAway: Math.ceil(
        (new Date(m.date + 'T00:00:00Z') - new Date(snapshot.targetDate + 'T00:00:00Z')) / 86400000,
      ),
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
    spaces: raw.spaces.map((s) => ({
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
  for (const h of weeklySnapshot.habits || []) {
    habitNameMap[h.id] = h.name;
  }
  const rawHabitProgress = weeklySnapshot.habitProgressByWeek
    ? Object.entries(weeklySnapshot.habitProgressByWeek)
    : [];

  const systemPrompt = `You are a meticulous analyst for a personal productivity app called Gremly. You receive 21 days of raw user data plus a reference to their existing Life Map (a structured understanding of their life domains and threads).

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

  dataLines.push('\n=== MILESTONES ===');
  if ((weeklySnapshot.milestones || []).length === 0) {
    dataLines.push('  No active milestones.');
  }
  for (const m of weeklySnapshot.milestones || []) {
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
      system: systemPrompt,
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
  };

  const parsedSections = Object.entries(sections).filter(([k, v]) => v !== null).length;
  console.log(`[UnifiedAnalyst] Parsed ${parsedSections}/10 sections`);

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

    for (const thread of domain.threads || []) {
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
  parts.push("\n=== TODAY'S CALENDAR EVENTS ===");
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

  // ── Section 4: Upcoming events (next 7 days) — label recurring/routine ──
  parts.push('\n=== UPCOMING EVENTS (next 7 days) ===');
  if (calendar.upcomingEvents.length > 0) {
    const routinePatterns =
      /\b(standup|stand-up|sync|1:1|one-on-one|retro|retrospective|scrum|daily|weekly|bi-weekly|biweekly|recurring|status update|check-in|check in|team meeting|staff meeting|office hours|sprint planning|sprint review|backlog grooming|refinement)\b/i;
    for (const e of calendar.upcomingEvents) {
      const daysAway = Math.ceil((new Date(e.date + 'T00:00:00Z') - target) / 86400000);
      const space = e.space ? ` [${e.space}]` : '';
      const isRoutine = routinePatterns.test(e.title);
      const tag = isRoutine ? ' {routine — do NOT feature}' : '';
      parts.push(`  ${e.date} (${daysAway} days): ${e.title}${space}${tag}`);
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
        const daysAway = Math.ceil((new Date(m.date + 'T00:00:00Z') - target) / 86400000);
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
    .filter((n) => {
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
      parts.push(
        `  ${h.name} (${h.frequency}): ${h.completions}/${h.expected} (${h.score_pct}%)${spaceLabel}`,
      );
    }
  } else {
    parts.push('  No habits tracked.');
  }

  // ── Section 8: Mood signal ──
  parts.push('\n=== MOOD (from journals, last 7 days) ===');
  if (computed.moodSignal.topMoods.length > 0) {
    const moodStr = computed.moodSignal.topMoods
      .map((m) => `${m.mood}: ${m.count} (${m.pct}%)`)
      .join(', ');
    parts.push(`  ${moodStr} — from ${computed.moodSignal.journalCount} journal(s)`);
  } else {
    parts.push('  No mood data.');
  }

  // ── Section 9: Todo stats ──
  parts.push('\n=== TODOS ===');
  parts.push(
    `  ${computed.todoStats.overdue} overdue, ${computed.todoStats.active} active, ${computed.todoStats.completedRecently} completed recently`,
  );

  // ── Section 10: Drop velocity ──
  parts.push('\n=== DROP VELOCITY ===');
  parts.push(
    `  ${computed.dropVelocity.velocity} (${computed.dropVelocity.dropsLast3} last 3 days, ${computed.dropVelocity.dropsPrev3} previous 3 days)`,
  );

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
    parts.push("Use the IDENTITY line for this person's name, gender, and pronouns. Never assume.");
    parts.push(`  ${raw.userProfile.profile_text}`);
  }

  // ── Section 13: Recent chat context ──
  const spaceChatSummaries = raw.spaceChatSummaries || [];
  const entityChatSummaries = raw.entityChatSummaries || [];

  if (spaceChatSummaries.length > 0 || entityChatSummaries.length > 0) {
    parts.push('\n=== RECENT CHAT CONVERSATIONS ===');
    parts.push(
      'Summaries of recent conversations the user had with Gremly. These capture decisions, emotional signals, and context not available from raw data alone.',
    );

    for (const chat of spaceChatSummaries) {
      const spaceDomain = raw.spaces?.find((s) => s.id === chat.space_id);
      const spaceName = spaceDomain?.name || 'General';
      const date = chat.updated_at ? chat.updated_at.split('T')[0] : 'recent';
      const safeSummary = (chat.running_summary || '')
        .slice(0, 500)
        // eslint-disable-next-line no-control-regex -- intentional control char sanitisation
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/"/g, "'")
        .trim();
      if (safeSummary) {
        parts.push(`\n[Space Chat: ${spaceName}] last updated ${date}`);
        parts.push(`  ${safeSummary}`);
      }
    }

    for (const entity of entityChatSummaries) {
      const spaceDomain = raw.spaces?.find((s) => s.id === entity.space_id);
      const spaceName = spaceDomain?.name || 'Unassigned';
      const date = entity.chat_summary_at ? entity.chat_summary_at.split('T')[0] : 'recent';
      const safeSummary = (entity.chat_summary || '')
        .slice(0, 400)
        // eslint-disable-next-line no-control-regex -- intentional control char sanitisation
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/"/g, "'")
        .trim();
      if (safeSummary) {
        parts.push(
          `\n[Entity Chat: ${entity.entity_type} "${entity.entity_title || 'Untitled'}"] ${spaceName} — ${date}`,
        );
        parts.push(`  ${safeSummary}`);
      }
    }
  }

  const text = parts.join('\n');

  console.log(
    `[WorldPicture] Built for ${snapshot.userId.slice(0, 8)}: ${text.length} chars, ${lifeMap.domains.length} domains`,
  );

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

lead_story: What is the single most CONCRETE thing happening in this person's life TODAY? Pick the thread that best captures what they are DOING today — where they are, what events they have, what work they are tackling, what actions they are taking. The lead_story MUST reference an actual thread from the Life Map by exact domain and thread name.

LEAD STORY SELECTION RULES:
- ALWAYS prefer threads with concrete, observable activity today: calendar events, tasks due, travel, location, a project being worked on.
- NEVER select a thread just because the person journaled about their feelings. Emotional state is COLOR for the detail field, not the lead story itself.
- NEVER narrate the user's psychology back to them. "You're reflecting on your career" or "anxiety is present" are NOT lead stories. "Client meetings fill your Monday" IS a lead story.
- If the most notable thing today is a calendar event, that is the lead story — even if the person journaled about something emotional yesterday.
- If there is genuinely nothing concrete happening today (no events, no active work, no location change), THEN and only then consider emotional or reflective threads — but frame them around what the person is DOING, not what they are FEELING.
- Events tagged {routine — do NOT feature} in the upcoming events section must NEVER be used as a lead story or referenced in the headline.

secondary: A second thread worth noting today. Must also reference an actual Life Map thread.

life_moment: A short phrase (2-6 words) capturing the dominant context of this person's life RIGHT NOW. Derived from the Life Map's deepest understanding of what arc they are inside. If nothing stands out, null.

tone: The emotional register of today based on ALL signals. One of: "relaxed", "focused", "stretched", "recovering", "celebratory"

day_type: One of: "event_day", "work_day", "milestone_day", "routine_day", "quiet_day", "transition_day"

today_focus: 1-3 concrete things that specifically matter TODAY. Not general themes — specific items with dates, names, or numbers that are relevant to this particular day.

named_anchors: People, places, trips, or projects explicitly mentioned in today's data. Only proper nouns actually present in the data. Never invent.

CRITICAL:
- lead_story and secondary MUST use exact domain and thread names from the Life Map.
- "detail" adds COLOR to the headline — a short, specific note (max 1 sentence, max 80 chars) that gives context the headline can't. Written in second person — "you" not "the user". Must NOT repeat the same information as lead_story. Instead, surface what makes today different: a feeling, a tension, a countdown, a contrast. If the headline says "island transition today", the detail should NOT say "travel day with a flight" — it should say something the headline missed.
- "detail" is written TO the user in second person ("you", "your"). NEVER say "the user". Max 80 characters.
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
      "detail": "max 80 chars, second person, adds context the headline misses",
      "why_today": "one sentence editorial reasoning"
    },
    "secondary": {
      "domain": "exact domain name",
      "thread": "exact thread name",
      "detail": "max 80 chars, second person, adds context"
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
    const domain = lifeMap.domains.find((d) => d.name === update.domain);
    if (!domain) {
      console.warn(`[LifeMap:Merge] Domain not found: "${update.domain}"`);
      continue;
    }

    const thread = (domain.threads || []).find((t) => t.name === update.thread);
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
          (existing) => existing.date === e.date && existing.signal === e.signal,
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
  const habitStreakRisk = computed.habitHealth.filter((h) => h.score_pct < 50).map((h) => h.name);

  // Overall habit health signal
  const avgHabitScore =
    computed.habitHealth.length > 0
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
  if (computed.todoStats.overdue > 0)
    todayFocusItems.push(`${computed.todoStats.overdue} overdue todos`);
  if (calendar.todaysEvents.length > 0) {
    todayFocusItems.push(...calendar.todaysEvents.slice(0, 2).map((e) => e.title));
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
      calendar_events: calendar.todaysEvents.map((e) => e.title),
      overdue_todos: computed.todoStats.overdue,
      habit_streak_risk: habitStreakRisk,
      upcoming_in_7d: calendar.upcomingEvents.slice(0, 5).map((e) => `${e.date}: ${e.title}`),
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

  const prompt = `You write a single line that appears on a companion app's morning screen. Your job is to say what today LOOKS LIKE — not what the user FEELS like.

TODAY is ${snapshot.targetDate}.

THE LEAD STORY (write about THIS):
  Domain: ${lead.domain}
  Thread: ${lead.thread}
  Detail: ${lead.detail}
  Why today: ${lead.why_today}

${
  secondary
    ? `SECONDARY (for optional color):
  ${secondary.domain} → ${secondary.thread}: ${secondary.detail}`
    : ''
}

TONE: ${dailyFocus.tone}

${
  prevHeadline
    ? `PREVIOUS HEADLINE: "${prevHeadline}"
Write something with a completely different structure.`
    : ''
}

RULES:
- Maximum 10 words.
- Describe what today looks like: events, tasks, location, work, plans.
- NEVER describe emotions, feelings, moods, or psychological states. No "anxiety", "exhaustion", "low feeling", "overwhelm", "tension", "weight of". You are a calendar, not a therapist.
- NEVER narrate what the user is "reflecting on", "examining", "processing", or "adjusting to".
- NEVER use "continues", "settling in", "also here", "both present", "are here today".
- NEVER frame someone else's life event as a trigger for the user's inner state.
- No exclamation marks. No questions. No advice. No encouragement.
- No metric counts. Never say "X todos" or "X habits."
- Every noun must come from the data above.
- If the lead story is purely emotional with no concrete activity, respond with exactly: null

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

// ── Expo Push Helper ─────────────────────────────────────────────────────────
async function sendExpoPush(token, title, body, notificationType) {
  if (!token) return null;
  const pushPayload = {
    to: token,
    title,
    body,
    sound: 'default',
    data: {
      type: notificationType,
      action: 'open_flow',
    },
  };
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushPayload),
    });
    if (!response.ok) {
      console.warn(`[Push] Expo push failed: ${response.status}`);
    }
    return response;
  } catch (err) {
    console.warn(`[Push] Expo push error: ${err.message}`);
    return null;
  }
}

// ============================================================================
// Worker entry point
// ============================================================================

// Inngest serve handler
const inngestHandler = serve({
  client: inngest,
  functions: [
    dailySynthesisDispatcher,
    synthesizeSingleUser,
    dcoDispatcher,
    generateSingleUserDco,
    bootstrapSingleUserLifeMap,
    testUnifiedAnalyst,
    testLifeMapRebuild,
    testWeeklySummaryV2,
    weeklySummaryV2Dispatcher,
    weeklySummaryV2Worker,
    backfillIdentity,
  ],
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
            const flashResult = await updateLifeMapAndFocus(
              worldPicture.lifeMap,
              worldPicture.text,
              env,
            );
            const mapCopy = JSON.parse(JSON.stringify(worldPicture.lifeMap));
            const updatedMap = mergeLifeMapUpdates(mapCopy, flashResult.thread_updates);
            const headline = await generateHeadlineFromFocus(
              flashResult.daily_focus,
              snapshot,
              env,
            );
            const dco = assembleDcoFromFocus(flashResult.daily_focus, headline, snapshot);

            const now = new Date();
            const todayLocal = getUserLocalDate(u.timezone);
            const expiresAt = new Date(now.getTime() + 7 * 86400000);

            await fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?on_conflict=user_id`, {
              method: 'POST',
              headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                user_id: u.user_id,
                life_map: updatedMap,
                version: snapshot.raw.currentLifeMap.version || 1,
                updated_at: now.toISOString(),
              }),
            });

            await fetch(`${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`, {
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
            });

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

    // @deprecated — old DCO pipeline removed; use Life Map pipeline instead
    if (url.pathname === '/api/debug-dco-data' && request.method === 'POST') {
      return corsResponse(
        { error: 'Deprecated – old DCO pipeline removed. Use Life Map pipeline.' },
        410,
      );
    }

    // @deprecated — old DCO pipeline removed; use Life Map pipeline instead
    if (url.pathname === '/api/backfill-dco' && request.method === 'POST') {
      return corsResponse(
        { error: 'Deprecated – old DCO pipeline removed. Use Life Map pipeline.' },
        410,
      );
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
          throw new Error(
            `Failed to send Inngest event: ${inngestRes.status} ${errText.slice(0, 200)}`,
          );
        }

        return corsResponse({
          success: true,
          user_id,
          message:
            'Life Map bootstrap job dispatched. Check Inngest dashboard or use /api/debug-life-map to view results.',
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

        const domainSummary = (row.life_map?.domains || []).map((d) => ({
          name: d.name,
          source: d.source,
          attention: d.attention,
          thread_count: d.threads?.length || 0,
          threads: (d.threads || []).map((t) => ({
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
          return new Response(
            JSON.stringify({
              status: 'not_ready',
              message: 'Result not stored yet. Check Inngest dashboard.',
            }),
            {
              status: 202,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            },
          );
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
            message:
              'Analyst test dispatched via Inngest. Fetch result with: {"user_id": "...", "fetch_result": true}',
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
          return new Response(
            JSON.stringify({
              status: 'not_ready',
              message: 'Result not stored yet. Check Inngest dashboard.',
            }),
            {
              status: 202,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            },
          );
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
            message:
              'Life Map rebuild dispatched via Inngest. Fetch result with: {"user_id": "...", "fetch_result": true}',
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

    if (url.pathname === '/api/test-vibe-summary' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;
        const vibe = body.vibe || 'supportive';

        if (!userId) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Validate vibe
        const validVibes = ['supportive', 'straight_up', 'unhinged', 'philosopher'];
        if (!validVibes.includes(vibe)) {
          return new Response(
            JSON.stringify({ error: `Invalid vibe. Must be one of: ${validVibes.join(', ')}` }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        // Read stored test data from 1999-01-03
        const headers = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.1999-01-03&select=dco`,
          { headers },
        );
        const rows = await res.json();

        if (!rows?.[0]?.dco || rows[0].dco._type !== 'summary_v2_test') {
          return new Response(
            JSON.stringify({
              error:
                'No test data found at 1999-01-03. Run /api/run-summary-v2 first to generate base data.',
            }),
            { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        const stored = rows[0].dco;

        // We need the snapshot to get priorSummaries and weeklySnapshot
        // Re-fetch snapshot for this user (needed for priorSummaries and weeklySnapshot)
        const timezone = body.timezone || 'Pacific/Tahiti';
        const snapshot = await fetchUserSnapshot(userId, timezone, 21, env);
        const weeklySnapshot = buildWeeklySnapshot(snapshot);
        const priorSummaries = snapshot.raw.weeklySummaries || [];

        // Compute week dates from the stored data or snapshot
        const target = new Date(snapshot.targetDate + 'T00:00:00Z');
        const dayOfWeek = target.getUTCDay();
        const weekEndDate = new Date(target);
        weekEndDate.setUTCDate(target.getUTCDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
        const weekStartDate = new Date(weekEndDate);
        weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6);
        const weekStart = formatDateOnly(weekStartDate);
        const weekEnd = formatDateOnly(weekEndDate);

        // Fetch engagement stats
        const dropsRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/daily_ritual_progress?owner_id=eq.${userId}&ritual_day=gte.${weekStart}&ritual_day=lte.${weekEnd}&select=drops_count`,
          { headers },
        );
        const dropsRows = await dropsRes.json();
        const totalDrops = (dropsRows || []).reduce((sum, r) => sum + (r.drops_count || 0), 0);

        const sweepsRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/events?owner_id=eq.${userId}&kind=eq.sweep_completed&created_at=gte.${weekStart}&created_at=lt.${weekEnd}T23:59:59Z&select=id`,
          { headers },
        );
        const sweepsRows = await sweepsRes.json();
        const totalSweeps = (sweepsRows || []).length;

        const journals = (snapshot.raw?.journals || []).filter(
          (j) =>
            j.subtype === 'journal' &&
            j.created_at &&
            j.created_at.split('T')[0] >= weekStart &&
            j.created_at.split('T')[0] <= weekEnd,
        ).length;

        const engagementStats = { drops: totalDrops, sweeps: totalSweeps, journals };

        // Run ONLY the storyteller with the specified vibe
        const summaryResult = await generateWeeklySummaryV2(
          stored.analyst_output,
          stored.life_map_delta,
          stored.rebuilt_life_map,
          weeklySnapshot,
          weekStart,
          weekEnd,
          priorSummaries,
          env,
          engagementStats,
          vibe, // <-- the new parameter
        );

        return new Response(
          JSON.stringify(
            {
              vibe,
              week: `${weekStart} to ${weekEnd}`,
              cards: summaryResult.summary?.cards || [],
              metadata: summaryResult.summary?.metadata || {},
              perf: summaryResult.metadata || {},
            },
            null,
            2,
          ),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        console.error('[TestVibe] Error:', err);
        return new Response(
          JSON.stringify({ error: String(err), stack: err.stack?.slice(0, 500) }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
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
          JSON.stringify({
            status: 'triggered',
            message: 'Full pipeline: analyst → rebuild → summary v2. Fetch with fetch_result: true',
          }),
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
