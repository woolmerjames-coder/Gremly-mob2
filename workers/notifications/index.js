/**
 * Gremly Notification Worker v3
 *
 * Sends morning and evening push notifications via Expo Push API.
 * Runs on a cron schedule (every 5 minutes) and checks each user's
 * preferred notification times in their local timezone.
 *
 * Features:
 * - Per-user timezone-aware scheduling
 * - Deduplication via morning_last_sent / evening_last_sent columns
 * - 5-minute window matching (aligns with cron interval)
 * - Deep link data payload for in-app routing
 * - Weekly summary payload builder (queries Supabase for Section 8.2 payload)
 *
 * Secrets (set via `wrangler secret put <NAME>`):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY
 * - ANTHROPIC_API_KEY
 */

export default {
  async scheduled(event, env, ctx) {
    console.log('[Notifications] Cron triggered at', new Date().toISOString());

    try {
      const result = await sendScheduledNotifications(env);
      console.log('[Notifications] Complete:', JSON.stringify(result));
    } catch (err) {
      console.error('[Notifications] Error:', err.message);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/test') {
      try {
        const result = await sendScheduledNotifications(env);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Temporary backfill endpoint ──────────────────────────────────────
    // POST /backfill-weekly
    // Generates + saves + pushes weekly summaries for ALL weekly-enabled users.
    // Does NOT update weekly_last_sent. Does NOT check day/time windows.
    if (url.pathname === '/backfill-weekly' && request.method === 'POST') {
      return await handleBackfillWeekly(env, url);
    }

    // DELETE /delete-summary?user_id=...&week_start_date=YYYY-MM-DD
    if (url.pathname === '/delete-summary' && request.method === 'DELETE') {
      const userId = url.searchParams.get('user_id');
      const weekStart = url.searchParams.get('week_start_date');
      if (!userId || !weekStart) {
        return jsonResponse({ error: 'Missing user_id or week_start_date' }, 400);
      }
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&week_start_date=eq.${weekStart}`,
        {
          method: 'DELETE',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=representation',
          },
        },
      );
      const deleted = res.ok ? await res.json() : [];
      return jsonResponse({ deleted: deleted.length, weekStart });
    }

    // GET /debug-events?user_id=...  — temporary audit endpoint
    if (url.pathname === '/debug-events') {
      const userId = url.searchParams.get('user_id');
      if (!userId) return jsonResponse({ error: 'Missing user_id' }, 400);
      const sb = env.SUPABASE_URL;
      const sk = env.SUPABASE_SERVICE_KEY;
      const headers = { apikey: sk, Authorization: `Bearer ${sk}` };

      const [noteEventsRes, calEventsRes, externalEventsRes, noteEventsThisWeekRes] = await Promise.all([
        fetch(`${sb}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&select=id,title,target_date,end_date,date,event_time,location,is_all_day,space_id,created_at&order=target_date.desc&limit=50`, { headers }),
        fetch(`${sb}/rest/v1/user_calendar_events?owner_id=eq.${userId}&select=id,title,event_date,event_time,duration_minutes,space_id,notes,source,created_at&order=event_date.desc&limit=50`, { headers }),
        fetch(`${sb}/rest/v1/events?user_id=eq.${userId}&select=id,kind,payload_json,created_at&order=created_at.desc&limit=30`, { headers }),
        fetch(`${sb}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&or=(and(target_date.gte.2026-02-16,target_date.lte.2026-02-22),and(target_date.gte.2026-02-23,target_date.lte.2026-03-01))&select=id,title,target_date,end_date,date,event_time,location,is_all_day,space_id,created_at&order=target_date.asc`, { headers }),
      ]);

      const noteEvents = noteEventsRes.ok ? await noteEventsRes.json() : [];
      const calEvents = calEventsRes.ok ? await calEventsRes.json() : [];
      const externalEvents = externalEventsRes.ok ? await externalEventsRes.json() : [];
      const noteEventsThisAndNext = noteEventsThisWeekRes.ok ? await noteEventsThisWeekRes.json() : [];

      return jsonResponse({
        noteEvents: { count: noteEvents.length, rows: noteEvents },
        userCalendarEvents: { count: calEvents.length, rows: calEvents },
        externalEvents: { count: externalEvents.length, rows: externalEvents },
        noteEventsThisAndNextWeek: { count: noteEventsThisAndNext.length, rows: noteEventsThisAndNext },
      });
    }

    return new Response('Gremly Notification Worker v3. Use /test to trigger manually.', {
      status: 200,
    });
  },
};

// =============================================================================
// Core logic
// =============================================================================

async function sendScheduledNotifications(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }

  const now = new Date();

  // Get notification preferences INCLUDING last_sent columns
  const prefsResponse = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences?select=user_id,morning_enabled,morning_time,evening_enabled,evening_time,weekly_enabled,weekly_time,weekly_day,timezone,morning_last_sent,evening_last_sent,weekly_last_sent`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  if (!prefsResponse.ok) {
    const errText = await prefsResponse.text();
    throw new Error(`Failed to fetch preferences: ${errText}`);
  }

  const prefs = await prefsResponse.json();

  // Get push tokens
  const tokensResponse = await fetch(`${supabaseUrl}/rest/v1/push_tokens?select=user_id,token`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!tokensResponse.ok) {
    const errText = await tokensResponse.text();
    throw new Error(`Failed to fetch tokens: ${errText}`);
  }

  const tokens = await tokensResponse.json();

  // Create a map of user_id -> token
  const tokenMap = {};
  for (const t of tokens) {
    tokenMap[t.user_id] = t.token;
  }

  // Find users to notify
  const usersToNotify = [];

  for (const pref of prefs) {
    const token = tokenMap[pref.user_id];
    if (!token) continue;

    const timezone = pref.timezone || 'America/Los_Angeles';
    const userTime = getTimeInTimezone(now, timezone);
    const todayInUserTz = getDateInTimezone(now, timezone);

    // Check morning notification
    if (pref.morning_enabled && pref.morning_time) {
      const [mornHour, mornMin] = parseTime(pref.morning_time);
      const alreadySentToday = pref.morning_last_sent === todayInUserTz;

      if (
        !alreadySentToday &&
        isWithinWindow(userTime.hour, userTime.minute, mornHour, mornMin, 5)
      ) {
        usersToNotify.push({
          user_id: pref.user_id,
          token: token,
          type: 'morning',
          title: 'Good morning ☀️',
          body: 'Ready to tackle the day? Your Morning Brief is waiting.',
        });
      }
    }

    // Check evening notification
    if (pref.evening_enabled && pref.evening_time) {
      const [eveHour, eveMin] = parseTime(pref.evening_time);
      const alreadySentToday = pref.evening_last_sent === todayInUserTz;

      if (!alreadySentToday && isWithinWindow(userTime.hour, userTime.minute, eveHour, eveMin, 5)) {
        usersToNotify.push({
          user_id: pref.user_id,
          token: token,
          type: 'evening',
          title: 'Sweep before sleep 🌙',
          body: 'A few minutes now, a clearer head tonight.',
        });
      }
    }

    // Check weekly summary notification
    if (pref.weekly_enabled && pref.weekly_time) {
      const [weeklyHour, weeklyMin] = parseTime(pref.weekly_time);
      const configuredDay = pref.weekly_day ?? 0; // 0 = Sunday

      // Check if today is the configured day
      const userDayOfWeek = getDayOfWeekInTimezone(now, timezone);
      const isCorrectDay = userDayOfWeek === configuredDay;

      // Check if already generated for this week
      const { weekStart } = computeWeekBoundaries(now, timezone);
      const weekStartDate = weekStart.split('T')[0]; // "YYYY-MM-DD"
      const alreadyGenerated = pref.weekly_last_sent === weekStartDate;

      if (
        isCorrectDay &&
        !alreadyGenerated &&
        isWithinWindow(userTime.hour, userTime.minute, weeklyHour, weeklyMin, 5)
      ) {
        usersToNotify.push({
          user_id: pref.user_id,
          token: token,
          type: 'weekly_summary',
          timezone: timezone,
        });
      }
    }
  }

  console.log(`[Notifications] Found ${usersToNotify.length} users to notify`);

  if (usersToNotify.length === 0) {
    return {
      sent: 0,
      skipped: 'all already sent or outside window',
      prefsCount: prefs.length,
      tokensCount: tokens.length,
    };
  }

  // Split users into immediate (morning/evening) and weekly
  const immediateUsers = usersToNotify.filter((u) => u.type !== 'weekly_summary');
  const weeklyUsers = usersToNotify.filter((u) => u.type === 'weekly_summary');

  // Send notifications and update last_sent
  let sent = 0;
  const errors = [];

  // --- Process immediate (morning/evening) notifications sequentially ---
  for (const user of immediateUsers) {
    try {
      await sendExpoPush(user.token, user.title, user.body, user.type);

      const userTimezone =
        prefs.find((p) => p.user_id === user.user_id)?.timezone || 'America/Los_Angeles';
      const todayInUserTz = getDateInTimezone(now, userTimezone);
      await updateLastSent(supabaseUrl, supabaseKey, user.user_id, user.type, todayInUserTz);

      sent++;
      console.log(`[Notifications] Sent ${user.type} to user ${user.user_id}`);
    } catch (err) {
      errors.push({ user_id: user.user_id, error: err.message });
      console.error(`[Notifications] Failed for ${user.user_id}:`, err.message);
    }
  }

  // --- Process weekly summary notifications in parallel batches ---
  if (weeklyUsers.length > 0) {
    const WEEKLY_BATCH_SIZE = 5;
    console.log(
      `[Notifications] Processing ${weeklyUsers.length} weekly summaries in batches of ${WEEKLY_BATCH_SIZE}`,
    );

    const batchResults = await processInBatches(weeklyUsers, WEEKLY_BATCH_SIZE, async (user) => {
      console.log(`[Notifications] Generating weekly summary for ${user.user_id}`);

      try {
        // Step 1: Build payload
        console.log(`[WeeklySummary] Step 1: Starting payload build for ${user.user_id}`);
        let payload;
        try {
          payload = await buildServerSidePayload(env, user.user_id, user.timezone);
          console.log(
            `[WeeklySummary] Step 1 complete: Payload built successfully. Keys: ${Object.keys(payload).join(', ')}`,
          );
        } catch (payloadErr) {
          console.error(
            `[WeeklySummary] Step 1 FAILED (buildServerSidePayload) for ${user.user_id}:`,
            payloadErr.message,
            payloadErr.stack || payloadErr,
          );
          throw payloadErr;
        }

        // Step 2a: Analyst pass (Haiku)
        console.log(`[WeeklySummary] Step 2a: Running analyst pass (Haiku) for ${user.user_id}`);
        let aiResponse;
        try {
          const analysisBrief = await runAnalystPass(env, payload);
          console.log(
            `[WeeklySummary] Step 2a complete: Analyst brief received. Keys: ${Object.keys(analysisBrief).join(', ')}`,
          );

          // Step 2b: Storyteller pass (Sonnet)
          console.log(`[WeeklySummary] Step 2b: Running storyteller pass (Sonnet) for ${user.user_id}`);
          aiResponse = await generateWeeklySummary(env, payload, analysisBrief);
          console.log(
            `[WeeklySummary] Step 2b complete: AI response received. Keys: ${Object.keys(aiResponse).join(', ')}`,
          );
        } catch (aiErr) {
          console.error(
            `[WeeklySummary] Step 2 FAILED (generateWeeklySummary) for ${user.user_id}:`,
            aiErr.message,
            aiErr.stack || aiErr,
          );
          throw aiErr;
        }

        // Step 3: Save to Supabase
        console.log(`[WeeklySummary] Step 3: Saving to Supabase for ${user.user_id}`);
        try {
          await saveWeeklySummary(
            env,
            user.user_id,
            payload.weekStartDate,
            payload.weekEndDate,
            aiResponse,
            payload,
          );
          console.log(`[WeeklySummary] Step 3 complete: Saved successfully for ${user.user_id}`);
        } catch (saveErr) {
          console.error(
            `[WeeklySummary] Step 3 FAILED (saveWeeklySummary) for ${user.user_id}:`,
            saveErr.message,
            saveErr.stack || saveErr,
          );
          throw saveErr;
        }

        // Step 4: Send push notification with dynamic body
        const firstSentence = aiResponse.weeklyCommentary?.split(/[.!]/)[0]?.trim() || '';
        const notificationBody = firstSentence
          ? `${firstSentence}.`
          : 'Your weekly summary is ready.';

        await sendExpoPush(
          user.token,
          'Your week in review is ready',
          notificationBody,
          'weekly_summary',
        );

        // Step 5: Update weekly_last_sent
        const { weekStart } = computeWeekBoundaries(new Date(), user.timezone);
        await updateLastSent(
          supabaseUrl,
          supabaseKey,
          user.user_id,
          'weekly',
          weekStart.split('T')[0],
        );

        console.log(`[Notifications] Weekly summary generated and sent for ${user.user_id}`);
        return { success: true, user_id: user.user_id };
      } catch (genErr) {
        console.error(
          `[Notifications] Weekly generation failed for ${user.user_id}:`,
          genErr.message,
          genErr.stack || genErr,
        );

        // Fallback: send notification with generic body
        try {
          await sendExpoPush(
            user.token,
            'Your week in review is ready',
            'Tap to see your weekly summary.',
            'weekly_summary',
          );

          // Still mark as sent so we don't retry every 5 minutes
          const { weekStart } = computeWeekBoundaries(new Date(), user.timezone);
          await updateLastSent(
            supabaseUrl,
            supabaseKey,
            user.user_id,
            'weekly',
            weekStart.split('T')[0],
          );

          console.log(`[Notifications] Weekly fallback notification sent for ${user.user_id}`);
          return { success: true, user_id: user.user_id };
        } catch (fallbackErr) {
          console.error(
            `[WeeklySummary] Fallback notification ALSO failed for ${user.user_id}:`,
            fallbackErr.message,
            fallbackErr.stack || fallbackErr,
          );
          return { success: false, user_id: user.user_id, error: fallbackErr.message };
        }
      }
    });

    // Aggregate batch results
    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        sent++;
      } else if (result.status === 'fulfilled' && !result.value.success) {
        errors.push({ user_id: result.value.user_id, error: result.value.error });
      } else if (result.status === 'rejected') {
        errors.push({ user_id: 'unknown', error: result.reason?.message || 'Unknown batch error' });
      }
    }
  }

  return { sent, errors: errors.length, prefsCount: prefs.length, tokensCount: tokens.length };
}

// =============================================================================
// Backfill: one-time weekly summary generation for all weekly-enabled users
// =============================================================================

async function handleBackfillWeekly(env, url) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const targetUserId = url.searchParams.get('user_id');
  const targetDate = url.searchParams.get('target_date'); // YYYY-MM-DD, e.g. last Sunday

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY' }, 500);
  }

  console.log(
    `[Backfill] Starting weekly summary backfill${targetUserId ? ` for user ${targetUserId}` : ' for all weekly-enabled users'}${targetDate ? ` (target_date: ${targetDate})` : ''}`,
  );

  // 1. Get users with weekly_enabled = true (optionally filtered to one user)
  const userFilter = targetUserId ? `&user_id=eq.${targetUserId}` : '';
  const prefsRes = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences?weekly_enabled=eq.true${userFilter}&select=user_id,timezone`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  if (!prefsRes.ok) {
    const errText = await prefsRes.text();
    console.error('[Backfill] Failed to fetch preferences:', errText);
    return jsonResponse({ error: `Failed to fetch preferences: ${errText}` }, 500);
  }

  const users = await prefsRes.json();
  console.log(`[Backfill] Found ${users.length} weekly-enabled users`);

  // 2. Get push tokens for lookup
  const tokensRes = await fetch(`${supabaseUrl}/rest/v1/push_tokens?select=user_id,token`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  const tokens = tokensRes.ok ? await tokensRes.json() : [];
  const tokenMap = {};
  for (const t of tokens) {
    tokenMap[t.user_id] = t.token;
  }

  // 3. Process each user sequentially to stay within CPU limits
  let generated = 0;
  const errors = [];

  for (const user of users) {
    const userId = user.user_id;
    const timezone = user.timezone || 'America/Los_Angeles';
    const token = tokenMap[userId];

    console.log(`[Backfill] Processing ${userId} (tz: ${timezone}, hasToken: ${!!token})`);

    try {
      // Step 1: Build payload (with optional date override for backfilling past weeks)
      console.log(
        `[Backfill] Step 1: Building payload for ${userId}${targetDate ? ` (target_date: ${targetDate})` : ''}`,
      );
      const payload = await buildServerSidePayload(env, userId, timezone, targetDate);
      console.log(
        `[Backfill] Step 1 complete for ${userId}. weekStart=${payload.weekStartDate}, weekEnd=${payload.weekEndDate}, todosCompleted=${payload.stats.todosCompleted}`,
      );

      // Step 2a: Analyst pass (Haiku)
      console.log(`[Backfill] Step 2a: Running analyst pass (Haiku) for ${userId}`);
      const analysisBrief = await runAnalystPass(env, payload);
      console.log(
        `[Backfill] Step 2a complete for ${userId}. Analyst keys: ${Object.keys(analysisBrief).join(', ')}`,
      );

      // Step 2b: Storyteller pass (Sonnet)
      console.log(`[Backfill] Step 2b: Running storyteller pass (Sonnet) for ${userId}`);
      const aiResponse = await generateWeeklySummary(env, payload, analysisBrief);
      console.log(
        `[Backfill] Step 2b complete for ${userId}. Keys: ${Object.keys(aiResponse).join(', ')}`,
      );

      // Step 3: Delete existing summary (if any) then save to Supabase
      console.log(`[Backfill] Step 3: Saving to Supabase for ${userId}`);
      // Delete first to avoid unique constraint violation
      await fetch(
        `${supabaseUrl}/rest/v1/weekly_summaries?user_id=eq.${userId}&week_start_date=eq.${payload.weekStartDate}`,
        {
          method: 'DELETE',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      );
      await saveWeeklySummary(
        env,
        userId,
        payload.weekStartDate,
        payload.weekEndDate,
        aiResponse,
        payload,
      );
      console.log(`[Backfill] Step 3 complete: Saved for ${userId}`);

      // Step 4: Send push notification (if user has a token)
      if (token) {
        const firstSentence = aiResponse.weeklyCommentary?.split(/[.!]/)[0]?.trim() || '';
        const body = firstSentence ? `${firstSentence}.` : 'Your weekly summary is ready.';
        await sendExpoPush(token, 'Your week in review is ready ✨', body, 'weekly_summary');
        console.log(`[Backfill] Push sent for ${userId}`);
      } else {
        console.log(`[Backfill] No push token for ${userId}, summary saved but no notification`);
      }

      generated++;
    } catch (err) {
      console.error(`[Backfill] FAILED for ${userId}:`, err.message, err.stack || err);
      errors.push({ user_id: userId, error: err.message });
    }
  }

  const result = { generated, failed: errors.length, total: users.length, errors };
  console.log(
    `[Backfill] Complete: ${generated} generated, ${errors.length} failed out of ${users.length}`,
  );
  return jsonResponse(result, 200);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Process items in parallel batches using Promise.allSettled.
 * @param {Array} items - Items to process
 * @param {number} batchSize - Number of items per batch
 * @param {Function} processFn - Async function to process each item
 * @returns {Array} All settled results from every batch
 */
async function processInBatches(items, batchSize, processFn) {
  const allResults = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(processFn));
    allResults.push(...results);
  }
  return allResults;
}

async function updateLastSent(supabaseUrl, supabaseKey, userId, type, dateStr) {
  const columnMap = {
    morning: 'morning_last_sent',
    evening: 'evening_last_sent',
    weekly: 'weekly_last_sent',
  };
  const column = columnMap[type];
  if (!column) return;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ [column]: dateStr }),
    },
  );

  if (!response.ok) {
    console.error(`[Notifications] Failed to update ${column} for ${userId}`);
  }
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  return [parseInt(parts[0]), parseInt(parts[1]) || 0];
}

function getTimeInTimezone(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');

    return { hour, minute };
  } catch (err) {
    console.error(`[Notifications] Timezone error for ${timezone}:`, err.message);
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

function getDateInTimezone(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch (err) {
    // eslint-disable-next-line no-restricted-syntax -- Worker context, no dateService available; fallback only
    return date.toISOString().split('T')[0];
  }
}

function getDayOfWeekInTimezone(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const dayStr = formatter.format(date);
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dayMap[dayStr] ?? 0;
  } catch (err) {
    return date.getDay();
  }
}

function isWithinWindow(currentHour, currentMin, targetHour, targetMin, windowMinutes) {
  const currentTotal = currentHour * 60 + currentMin;
  const targetTotal = targetHour * 60 + targetMin;
  const diff = Math.abs(currentTotal - targetTotal);
  return diff <= windowMinutes;
}

async function sendExpoPush(token, title, body, notificationType) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      title: title,
      body: body,
      sound: 'default',
      data: {
        type: notificationType,
        action: 'open_flow',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Expo push failed: ${errText}`);
  }

  return response.json();
}

// =============================================================================
// Weekly Summary Payload Builder
// =============================================================================

/**
 * Build the weekly summary payload server-side by querying Supabase directly.
 * This replicates what buildWeeklySummaryPayload.ts does client-side from Zustand.
 *
 * @param {object} env - Worker env with SUPABASE_URL and SUPABASE_SERVICE_KEY
 * @param {string} userId - The user's UUID
 * @param {string} timezone - The user's timezone string (e.g., 'America/Los_Angeles')
 * @returns {object} The payload matching the spec's Section 8.2 schema
 */
async function buildServerSidePayload(env, userId, timezone, dateOverride = null) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // Compute week boundaries in user's timezone
  // dateOverride allows generating for a specific date (e.g. last Sunday for backfill)
  const now = dateOverride ? new Date(dateOverride + 'T12:00:00Z') : new Date();
  const { weekStart, weekEnd, prevWeekStart, prevWeekEnd, nextWeekStart, nextWeekEnd } =
    computeWeekBoundaries(now, timezone);

  // Helper to query Supabase REST API
  async function query(table, params = '') {
    const url = `${supabaseUrl}/rest/v1/${table}?${params}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[WeeklySummary] Query failed: ${table}`, await res.text());
      return [];
    }
    return res.json();
  }

  // --- Run queries in parallel ---

  const [
    completedTodosThisWeek,
    completedTodosLastWeek,
    todosCreatedThisWeek,
    activeHabits,
    habitProgressThisWeek,
    journalEntries,
    ideasCapturedThisWeek,
    staleItems,
    spaces,
    upcomingEvents,
    priorSummaries,
    todoLockIns,
    habitLockIns,
    todoMindDrops,
    habitMindDrops,
    noteMindDrops,
    noteEventsNextWeek,
    userCalendarEventsNextWeek,
    noteEventsThisWeek,
    userCalendarEventsThisWeek,
  ] = await Promise.all([
    // 1. Completed todos this week (from the TODOS table)
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `completed_at=not.is.null`,
        `completed_at=gte.${weekStart}`,
        `completed_at=lte.${weekEnd}`,
        `select=id,name,title,completed_at,created_at,archived,space_id,due_date,due_day`,
      ].join('&'),
    ),

    // 2. Completed todos last week (for comparison)
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `completed_at=not.is.null`,
        `completed_at=gte.${prevWeekStart}`,
        `completed_at=lte.${prevWeekEnd}`,
        `select=id`,
      ].join('&'),
    ),

    // 3. Todos created this week
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id`,
      ].join('&'),
    ),

    // 4. Active habits (not archived, subtype=start_habit)
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.start_habit`,
        `archived=eq.false`,
        `select=id,name,title,cadence,target_per_period,days_active,last_checked_in_at,space_id`,
      ].join('&'),
    ),

    // 5. Habit check-ins this week (from habit_progress)
    query(
      'habit_progress',
      [
        `owner_id=eq.${userId}`,
        `occurred_day=gte.${weekStart.split('T')[0]}`,
        `occurred_day=lte.${weekEnd.split('T')[0]}`,
        `select=habit_id,occurred_day`,
      ].join('&'),
    ),

    // 6. Journal entries this week
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.journal`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,title,body,created_at,date`,
        `order=created_at.desc`,
        `limit=20`,
      ].join('&'),
    ),

    // 7. Ideas captured this week (notes with subtype=idea only)
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.idea`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,title,created_at,space_id`,
      ].join('&'),
    ),

    // 8. Stale items: todos not completed, not archived, created > 14 days ago
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `completed_at=is.null`,
        `archived=eq.false`,
        `created_at=lte.${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()}`,
        `select=id,name,title,created_at,updated_at,space_id`,
        `order=created_at.asc`,
        `limit=20`,
      ].join('&'),
    ),

    // 9. User's spaces
    query('spaces', [`owner_id=eq.${userId}`, `select=id,name`].join('&')),

    // 10. Upcoming events (next week)
    query(
      'events',
      [
        `owner_id=eq.${userId}`,
        `created_at=gte.${nextWeekStart}`,
        `select=id,kind,payload_json,created_at`,
        `limit=50`,
      ].join('&'),
    ),

    // 11. Prior weekly summaries (for trend context, last 4)
    query(
      'weekly_summaries',
      [
        `user_id=eq.${userId}`,
        `week_start_date=lt.${weekStart.split('T')[0]}`,
        `select=week_start_date,content,stats_snapshot,key_themes,cleanup_actions`,
        `order=week_start_date.desc`,
        `limit=4`,
      ].join('&'),
    ),

    // 12. Todo lock-ins this week
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `locked_in_at=not.is.null`,
        `locked_in_at=gte.${weekStart}`,
        `locked_in_at=lte.${weekEnd}`,
        `select=id`,
      ].join('&'),
    ),

    // 13. Habit lock-ins this week
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `locked_in_at=not.is.null`,
        `locked_in_at=gte.${weekStart}`,
        `locked_in_at=lte.${weekEnd}`,
        `select=id`,
      ].join('&'),
    ),

    // 14. Mind drops from todos this week
    query(
      'todos',
      [
        `owner_id=eq.${userId}`,
        `drop_id=not.is.null`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,drop_id,completed_at,archived`,
      ].join('&'),
    ),

    // 15. Mind drops from habits this week
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `drop_id=not.is.null`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,drop_id,last_completed_at,archived,last_checked_in_at`,
      ].join('&'),
    ),

    // 16. Mind drops from notes this week
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `drop_id=not.is.null`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,drop_id,archived,swept_at,subtype`,
      ].join('&'),
    ),

    // 17. Note events (subtype='event') for the upcoming week
    // Use nested AND within OR for proper date range filtering in PostgREST
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.event`,
        `archived=eq.false`,
        `or=(and(target_date.gte.${nextWeekStart.split('T')[0]},target_date.lte.${nextWeekEnd.split('T')[0]}),and(date.gte.${nextWeekStart.split('T')[0]},date.lte.${nextWeekEnd.split('T')[0]}))`,
        `select=id,title,date,target_date,end_date,space_id,subtype,event_time,location,is_all_day`,
      ].join('&'),
    ),

    // 18. User calendar events for the upcoming week
    query(
      'user_calendar_events',
      [
        `owner_id=eq.${userId}`,
        `event_date=gte.${nextWeekStart.split('T')[0]}`,
        `event_date=lte.${nextWeekEnd.split('T')[0]}`,
        `select=id,title,event_date,event_time,duration_minutes,space_id,notes`,
      ].join('&'),
    ),

    // ── THIS WEEK'S EVENTS (for Week In Review context) ──

    // 19. Note events that happened THIS week
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.event`,
        `archived=eq.false`,
        `or=(and(target_date.gte.${weekStart.split('T')[0]},target_date.lte.${weekEnd.split('T')[0]}),and(date.gte.${weekStart.split('T')[0]},date.lte.${weekEnd.split('T')[0]}))`,
        `select=id,title,date,target_date,end_date,space_id,subtype,event_time,location,is_all_day`,
      ].join('&'),
    ),

    // 20. User calendar events that happened THIS week
    query(
      'user_calendar_events',
      [
        `owner_id=eq.${userId}`,
        `event_date=gte.${weekStart.split('T')[0]}`,
        `event_date=lte.${weekEnd.split('T')[0]}`,
        `select=id,title,event_date,event_time,duration_minutes,space_id,notes`,
      ].join('&'),
    ),
  ]);

  // --- Aggregate into payload shape ---

  const todosCompleted = completedTodosThisWeek.length;
  const todosCompletedLastWeek = completedTodosLastWeek.length;

  // Lock-ins this week (from both todos and habits)
  const lockIns = todoLockIns.length + habitLockIns.length;

  // Mind drops (from all three tables)
  const allMindDrops = [...todoMindDrops, ...habitMindDrops, ...noteMindDrops];
  const mindDropsCreated = allMindDrops.length;
  const mindDropsSwept = allMindDrops.filter((d) => {
    if (d.archived) return true;
    if (d.completed_at != null) return true; // todo completed
    if (d.last_completed_at != null) return true; // habit completed
    if (d.last_checked_in_at != null) return true; // habit checked in
    if (d.swept_at != null) return true; // note swept
    if (d.subtype === 'journal') return true; // journal = intentional capture
    return false;
  }).length;

  // Completions by day of week and time block
  const completionsByDay = {};
  const completionsByTimeBlock = { morning: 0, afternoon: 0, evening: 0 };
  for (const todo of completedTodosThisWeek) {
    if (!todo.completed_at) continue;
    const completedDate = new Date(todo.completed_at);
    const dayName = completedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: timezone,
    });
    completionsByDay[dayName] = (completionsByDay[dayName] || 0) + 1;

    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(completedDate),
    );
    if (hour < 12) completionsByTimeBlock.morning++;
    else if (hour < 17) completionsByTimeBlock.afternoon++;
    else completionsByTimeBlock.evening++;
  }

  // Habit tracking — build Mon–Sun completion arrays from habit_progress
  const weekStartDate = weekStart.split('T')[0];
  const mondayDate = new Date(weekStartDate + 'T00:00:00Z');
  const habitsTracked = {};
  for (const habit of activeHabits) {
    const displayName = habit.title || habit.name;
    const completedDays = [false, false, false, false, false, false, false]; // Mon–Sun

    // Find all check-ins for this habit this week
    const checkIns = habitProgressThisWeek.filter((hp) => hp.habit_id === habit.id);
    for (const checkIn of checkIns) {
      const checkInDate = new Date(checkIn.occurred_day + 'T00:00:00Z');
      const dayIndex = Math.round((checkInDate - mondayDate) / (24 * 60 * 60 * 1000));
      if (dayIndex >= 0 && dayIndex < 7) {
        completedDays[dayIndex] = true;
      }
    }

    habitsTracked[displayName] = {
      targetDays: habit.target_per_period || 7,
      completedDays,
    };
  }

  // Space activity
  const spaceMap = {};
  for (const s of spaces) {
    spaceMap[s.id] = { spaceName: s.name, itemCount: 0, lastInteraction: null };
  }
  for (const item of [...completedTodosThisWeek, ...ideasCapturedThisWeek]) {
    const sid = item.space_id;
    if (sid && spaceMap[sid]) {
      spaceMap[sid].itemCount++;
      const ts = item.completed_at || item.created_at;
      if (!spaceMap[sid].lastInteraction || ts > spaceMap[sid].lastInteraction) {
        spaceMap[sid].lastInteraction = ts;
      }
    }
  }
  const spaceActivity = Object.values(spaceMap).filter((s) => s.itemCount > 0);

  // Completed todos for AI highlight selection
  const completedTodosForAI = completedTodosThisWeek.map((t) => ({
    title: t.title || t.name,
    completedAt: t.completed_at,
    createdAt: t.created_at,
    wasOverdue: false,
  }));

  // Stale items for insights
  const staleItemsForAI = staleItems.map((item) => ({
    id: item.id,
    title: item.title || item.name,
    type: 'todo',
    createdAt: item.created_at,
    lastTouchedAt: item.updated_at || item.created_at,
  }));

  // Build space name lookup for note events
  const spaceNameMap = {};
  for (const s of spaces) {
    spaceNameMap[s.id] = s.name;
  }

  // Deduplicate helper — many calendar syncs create duplicate note events
  // Also filters out "Canceled:" events which are pure noise from calendar syncs
  function deduplicateEvents(events) {
    const seen = new Set();
    return events.filter((e) => {
      const title = (e.title || '').trim();
      // Filter out canceled events entirely — they're noise
      if (title.toLowerCase().startsWith('canceled:')) return false;
      const key = `${title.toLowerCase()}|${e.date || e.target_date || e.event_date || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Group events by day of week for structured analyst input
  function groupEventsByDay(events) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const grouped = {};
    for (const event of events) {
      const dateStr = event.date ? String(event.date).split('T')[0] : 'unknown';
      const d = new Date(dateStr + 'T12:00:00Z');
      const dayName = dayNames[d.getUTCDay()];
      const key = `${dayName} ${dateStr}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    }
    return grouped;
  }

  // Upcoming events — parse payload_json (external calendar events)
  const externalEvents = upcomingEvents
    .map((e) => {
      const p = e.payload_json || {};
      return {
        title: p.title || p.summary || e.kind,
        date: p.start || p.date || e.created_at,
        startTime: p.startTime || null,
        isAllDay: p.allDay || p.isAllDay || false,
        isRecurring: p.recurring || p.isRecurring || false,
        isUserCreated: e.kind === 'user_created',
        hasGremlyInteraction: false,
        linkedTodoCount: 0,
      };
    })
    .slice(0, 30);

  // Note events (subtype='event') — NEXT WEEK events stored in notes table
  const noteEventsMappedNext = noteEventsNextWeek.map((note) => ({
    title: note.title,
    date: note.target_date || note.date,
    startTime: note.event_time || null,
    location: note.location || null,
    source: 'gremly',
    spaceName: note.space_id ? spaceNameMap[note.space_id] || null : null,
    isAllDay: note.is_all_day !== false && !note.event_time,
    isMultiDay: !!(note.end_date && note.end_date !== (note.target_date || note.date)),
    endDate: note.end_date || null,
    isRecurring: false,
    isUserCreated: true,
  }));

  // User calendar events — NEXT WEEK calendar events
  const userCalendarEventsMappedNext = userCalendarEventsNextWeek.map((event) => ({
    title: event.title,
    date: event.event_date,
    startTime: event.event_time || null,
    durationMinutes: event.duration_minutes || null,
    notes: event.notes || null,
    source: 'gremly',
    spaceName: event.space_id ? spaceNameMap[event.space_id] || null : null,
    isAllDay: !event.event_time,
    isRecurring: false,
    isUserCreated: true,
  }));

  // --- THIS WEEK events (for "Week In Review" context) ---
  const noteEventsMappedThisWeek = noteEventsThisWeek.map((note) => ({
    title: note.title,
    date: note.target_date || note.date,
    startTime: note.event_time || null,
    location: note.location || null,
    source: 'gremly',
    spaceName: note.space_id ? spaceNameMap[note.space_id] || null : null,
    isAllDay: note.is_all_day !== false && !note.event_time,
    isMultiDay: !!(note.end_date && note.end_date !== (note.target_date || note.date)),
    endDate: note.end_date || null,
  }));

  const userCalendarEventsMappedThisWeek = userCalendarEventsThisWeek.map((event) => ({
    title: event.title,
    date: event.event_date,
    startTime: event.event_time || null,
    durationMinutes: event.duration_minutes || null,
    notes: event.notes || null,
    source: 'gremly',
    spaceName: event.space_id ? spaceNameMap[event.space_id] || null : null,
    isAllDay: !event.event_time,
  }));

  const thisWeekEventsFlat = deduplicateEvents(
    [...noteEventsMappedThisWeek, ...userCalendarEventsMappedThisWeek]
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateA - dateB;
      }),
  );

  // Merge all NEXT WEEK event sources, dedup, and group by day
  const upcomingEventsFlat = deduplicateEvents(
    [...externalEvents, ...noteEventsMappedNext, ...userCalendarEventsMappedNext]
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateA - dateB;
      }),
  );

  // Group events by day so the analyst can see the full week structure
  const thisWeekEventsByDay = groupEventsByDay(thisWeekEventsFlat);
  const upcomingEventsByDay = groupEventsByDay(upcomingEventsFlat);

  // Recent journal excerpts
  const recentJournalExcerpts = journalEntries.slice(0, 5).map((j) => ({
    excerpt: (j.body || '').substring(0, 200),
    date: j.date || j.created_at,
  }));

  // Recent notes titles
  const recentNotesTitles = ideasCapturedThisWeek.slice(0, 10).map((n) => n.title);

  // Trend context from prior summaries
  const trendContext = buildTrendContextFromPriorSummaries(priorSummaries, {
    todosCompleted,
    journalEntries: journalEntries.length,
    mindDropsSwept,
  });

  return {
    userId,
    weekStartDate: weekStart.split('T')[0],
    weekEndDate: weekEnd.split('T')[0],
    stats: {
      todosCompleted,
      todosCreated: todosCreatedThisWeek.length,
      todosCompletedLastWeek,
      habitsTracked,
      journalEntries: journalEntries.length,
      lockIns,
      ideasCaptured: ideasCapturedThisWeek.length,
      mindDropsCreated,
      mindDropsSwept,
    },
    completedTodos: completedTodosForAI,
    staleItems: staleItemsForAI,
    spaceActivity,
    completionsByDay,
    completionsByTimeBlock,
    upcomingEventsByDay,
    upcomingEventCount: upcomingEventsFlat.length,
    thisWeekEventsByDay,
    thisWeekEventCount: thisWeekEventsFlat.length,
    upcomingTodos: [],
    recentJournalExcerpts,
    recentNotesTitles,
    trendContext,
  };
}

/**
 * Compute Monday–Sunday week boundaries in the user's timezone.
 * Returns ISO strings for this week, previous week, and next week.
 */
function computeWeekBoundaries(now, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now); // "YYYY-MM-DD"
  const today = new Date(todayStr + 'T00:00:00');

  // Find Monday of current week (ISO week starts Monday)
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(monday.getDate() - 1);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  // Dates are already timezone-adjusted from Intl.DateTimeFormat above — safe to format
  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const toISO = (d) => formatDate(d) + 'T00:00:00Z';
  const toISOEnd = (d) => formatDate(d) + 'T23:59:59Z';

  return {
    weekStart: toISO(monday),
    weekEnd: toISOEnd(sunday),
    prevWeekStart: toISO(prevMonday),
    prevWeekEnd: toISOEnd(prevSunday),
    nextWeekStart: toISO(nextMonday),
    nextWeekEnd: toISOEnd(nextSunday),
  };
}

/**
 * Build trend context from the last 2–4 weekly summaries.
 * Mirrors buildTrendContext() from the client-side payload builder.
 */
function buildTrendContextFromPriorSummaries(priorSummaries, currentStats) {
  if (!priorSummaries || priorSummaries.length === 0) return null;

  const priorWeekHighlights = priorSummaries.map((s) => ({
    weekStart: s.week_start_date,
    keyThemes: s.key_themes || [],
    insightTypesSurfaced: (s.content?.insights || []).map((i) => i.type),
    cleanupActions: (() => {
      const actions = s.cleanup_actions || [];
      return {
        kept: actions.filter((a) => a.action === 'keep').length,
        parked: actions.filter((a) => a.action === 'park').length,
        dropped: actions.filter((a) => a.action === 'drop').length,
      };
    })(),
    statsSnapshot: {
      todosCompleted: s.stats_snapshot?.todosCompleted || 0,
      journalEntries: s.stats_snapshot?.journalEntries || 0,
      mindDropsSwept: s.stats_snapshot?.mindDropsSwept || 0,
    },
  }));

  // Compute rolling trends
  const snapshots = priorSummaries.map((s) => s.stats_snapshot).filter(Boolean);

  function trend(values) {
    if (values.length < 2) return 'stable';
    const recent = values[0];
    const older = values[values.length - 1];
    const diff = recent - older;
    const threshold = Math.max(older * 0.2, 1);
    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'declining';
    return 'stable';
  }

  const completionValues = snapshots.map((s) => s.todosCompleted || 0);
  const journalValues = snapshots.map((s) => s.journalEntries || 0);

  // Insight frequency
  const insightFrequency = {};
  for (const s of priorSummaries) {
    for (const insight of s.content?.insights || []) {
      insightFrequency[insight.type] = (insightFrequency[insight.type] || 0) + 1;
    }
  }

  return {
    priorWeekHighlights,
    rollingTrends: {
      completionTrend: trend(completionValues),
      journalTrend: trend(journalValues),
      habitConsistencyTrend: 'stable',
      captureToSweepTrend: 'stable',
      staleTrend: 'stable',
      workLifeBalanceTrend: '',
      insightFrequency,
    },
  };
}

// =============================================================================
// AI Generation + Persistence
// =============================================================================

/**
 * STAGE 1: Analyst pass using Haiku.
 * Performs thorough cross-analysis of the raw payload:
 * - Event importance ranking
 * - Timeline reconstruction
 * - Journal ↔ event threading
 * - Habit pattern analysis
 * - Space activity mapping
 * - Stale item severity
 * - Week-type classification
 * - Anomaly detection
 * - Strict past/future boundary enforcement
 *
 * @param {object} env - Worker env with ANTHROPIC_API_KEY
 * @param {object} payload - Raw aggregated payload from buildServerSidePayload
 * @returns {object} Structured analysis brief for the storyteller
 */
async function runAnalystPass(env, payload) {
  const analystPrompt = `You are a meticulous data analyst for a personal productivity app called Gremly. Your ONLY job is to deeply analyze a user's weekly data and produce a structured analysis brief. You are NOT writing the user-facing summary — a separate AI will do that using your analysis. Be thorough, precise, and show your reasoning.

CRITICAL DATE BOUNDARIES:
- THIS WEEK (PAST — already happened): ${payload.weekStartDate} to ${payload.weekEndDate}
- NEXT WEEK (FUTURE — upcoming): See upcomingEventsByDay (grouped by day of week)
- NEVER conflate past and future. If an event's date falls within this week's range, it is PAST. If it falls after ${payload.weekEndDate}, it is FUTURE.
- Events in thisWeekEventsByDay are ALWAYS past. Events in upcomingEventsByDay are ALWAYS future.

DATA FORMAT:
- Events are pre-grouped by day. Each key is "DayName YYYY-MM-DD" (e.g., "Monday 2026-02-23") mapping to an array of events.
- Canceled events have already been filtered out.
- You MUST examine EVERY DAY in both groups — Monday through Sunday. Do NOT stop after one or two days.

OUTPUT FORMAT: Respond ONLY with valid JSON. No markdown, no backticks.

{
  "weekTimeline": {
    "narrative": "string — 3-5 sentence chronological reconstruction of what happened this week, day by day based on events + completions + journal entries. Focus on the STORY, not the metrics.",
    "significantDays": [
      {
        "date": "YYYY-MM-DD",
        "dayName": "Monday|Tuesday|...",
        "whatHappened": "string — key events/actions that day",
        "significance": "routine | notable | significant | milestone"
      }
    ]
  },
  "eventAnalysis": {
    "thisWeekEvents": [
      {
        "title": "string",
        "date": "YYYY-MM-DD",
        "temporalBucket": "PAST",
        "importanceScore": 1-10,
        "importanceReason": "string — why this score",
        "category": "travel | work_meeting | personal | social | health | deadline | milestone | admin | recurring",
        "isRecurring": true|false,
        "spaceName": "string | null",
        "connectedJournalExcerpt": "string | null — matching journal text if found",
        "connectedTodos": ["string — titles of related completed tasks"],
        "connectedHabits": ["string — related habit names"]
      }
    ],
    "nextWeekEvents": [
      {
        "title": "string",
        "date": "YYYY-MM-DD",
        "temporalBucket": "FUTURE",
        "importanceScore": 1-10,
        "importanceReason": "string",
        "category": "string",
        "isRecurring": true|false,
        "spaceName": "string | null",
        "threadFromThisWeek": "string | null — how this connects to something that happened this week",
        "prepSuggestion": "string | null — practical prep the user might want to do"
      }
    ]
  },
  "crossReferences": [
    {
      "connection": "string — description of the connection",
      "items": ["string — titles of connected items"],
      "strength": "weak | moderate | strong",
      "narrative_value": "string — why this connection matters for the user's story"
    }
  ],
  "habitAnalysis": {
    "streakStatus": [
      {
        "habitName": "string",
        "daysCompleted": 0,
        "targetDays": 0,
        "pattern": "string — e.g., 'maintained through travel', 'dropped mid-week', 'weekend warrior'",
        "notable": true|false
      }
    ],
    "overallConsistency": "string — one-sentence habit summary"
  },
  "spaceInsights": [
    {
      "spaceName": "string",
      "activity": "string — what happened in this space",
      "eventConnection": "string | null — events tied to this space"
    }
  ],
  "todoPatterns": {
    "velocity": "string — fast completions, procrastinated, batch cleared, steady",
    "notableCompletions": ["string — titles of todos that seem important based on timing/context"],
    "staleItemSeverity": "none | low | medium | high",
    "staleItemNote": "string | null — if relevant, which stale items matter and why"
  },
  "weekType": {
    "classification": "string — 2-4 words (e.g., 'travel prep week', 'deep focus', 'winding down')",
    "evidence": "string — why this classification",
    "dominantTheme": "string"
  },
  "anomalies": [
    {
      "observation": "string — what's unusual compared to trend data or typical week patterns",
      "significance": "low | medium | high"
    }
  ],
  "magicMomentCandidates": [
    {
      "title": "string — suggested moment title",
      "why": "string — why this deserves a magic moment",
      "connectedItems": ["string"],
      "enrichmentHint": "string — what real-world knowledge could make this richer (e.g., 'Tokyo late-Feb weather', 'LAX to Cancun flight duration', 'half marathon training context')"
    }
  ],
  "weekAheadBrief": {
    "busyDays": ["string — days with 3+ events"],
    "keyEvents": ["string — the 3-7 most important upcoming events by importance score. MUST span MULTIPLE days of the week, not just Monday. Format: 'DayName: Event Title (importance X) — reason'"],
    "conflictsOrWarnings": ["string — scheduling issues or things to watch out for"],
    "dayByDaySummary": "string — one sentence per day covering Mon-Sun of the upcoming week"
  }
}

ANALYSIS RULES:
- Scan EVERY DAY in thisWeekEventsByDay and upcomingEventsByDay. You MUST look at Monday through Sunday. Do not stop after processing one day.
- For the eventAnalysis output, only include events scoring 4 or higher in full detail. For routine events (score 1-3), just count them in a summary.
- RECURRING MEETING DETECTION: Meetings that appear on the same day every week (e.g., "Weekly Sync", "Bi-Weekly 1:1", "All Hands", internal huddles, standups) should ALWAYS be scored 1-3. They are routine noise, NEVER highlights.
- HIGH IMPORTANCE (score 7-10): Travel (flights, trips, "Travel to X", "Flight to X"), personal milestones, PTO/vacation, one-off social events, health appointments, multi-day events.
- MEDIUM IMPORTANCE (score 4-6): One-off work meetings, deadlines, project milestones.
- LOW IMPORTANCE (score 1-3): Recurring meetings (daily standups, weekly syncs, bi-weekly 1:1s, all-hands), admin tasks (timesheets), internal huddles.
- Events with a spaceName (especially non-work spaces like "Honeymoon", "Health", "Family") are often personally significant — score higher.
- Look for threads: if this week has "packing" or "prep" todos and next week has a flight, connect them.
- For journal excerpts, try to match them to events by date proximity and keyword overlap.
- The magicMomentCandidates should only include genuinely interesting moments (score 7+). Include the enrichmentHint so the storyteller knows what world knowledge to apply.
- For anomalies, compare against trendContext if available. A sudden drop in completions during a travel week is expected, not anomalous.
- Be honest about quiet weeks. If nothing stands out, say so. Don't manufacture significance.
- weekAheadBrief.keyEvents MUST include the highest-scoring events from across ALL days of the week, not just the first day. If Tuesday has a flight and Friday has travel, both MUST appear.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: analystPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this user's weekly data thoroughly. Produce the structured analysis brief.\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Analyst pass (Haiku) error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = data.content
    ?.map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('');

  if (!text) {
    throw new Error('Analyst pass returned empty response');
  }

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[Analyst] Failed to parse JSON, using raw text as fallback');
    return { rawAnalysis: cleaned };
  }
}

/**
 * STAGE 2: Storyteller pass using Sonnet.
 * Receives the analyst brief + key raw data and writes the user-facing summary.
 * Focuses on narrative voice, contextual enrichment, and magic moments.
 *
 * @param {object} env - Worker env with ANTHROPIC_API_KEY
 * @param {object} payload - Raw payload (for stats and raw data access)
 * @param {object} analysisBrief - Structured analysis from the analyst pass
 * @returns {object} Parsed JSON matching the weekly summary content schema
 */
async function generateWeeklySummary(env, payload, analysisBrief) {
  const systemPrompt = `You are Gremly, a warm and perceptive life companion. You are generating a weekly summary for a user based on a pre-analyzed data brief from an analyst AI plus key raw data. Your voice is conversational, specific, and human — like a thoughtful friend who notices what actually matters in someone's life.

An analyst has already done the heavy lifting: event classification, cross-referencing, importance scoring, and timeline reconstruction. Trust the analyst's temporal classifications — if it says an event is PAST, it happened. If it says FUTURE, it hasn't happened yet. NEVER put a PAST event in the Week Ahead section.

Your job: Take the analysis and turn it into a compelling, personal narrative. Add your own world knowledge to make magic moments genuinely enriching.

OUTPUT FORMAT: Respond ONLY with valid JSON. No markdown, no backticks.

{
  "weeklyCommentary": "string — 2-4 sentences weaving together the user's week. Lead with the STORY (life events, experiences) not metrics. Use the analyst's weekTimeline for narrative flow. Be specific to this person's data. Never generic.",
  "highlightMoment": {
    "title": "string — the moment that defined this week",
    "reason": "string — why this mattered to their life",
    "gremlyComment": "string — one-liner with genuine warmth"
  },
  "magicMoments": [
    {
      "title": "string — short, evocative title",
      "body": "string — 1-3 sentences. THIS is where you add real-world knowledge. For travel: mention the destination's character, weather this time of year, time zone differences, local highlights. For milestones: what it means in the bigger picture. For personal events: the human significance. Be specific and genuinely interesting — like a well-traveled friend sharing a tip.",
      "connectedItems": ["string — titles of related items from the analyst's crossReferences"]
    }
  ],
  "insights": [
    {
      "type": "stale_cleanup | capture_ratio | productivity_pattern | space_activity | balance | habit_observation | journal_encouragement | life_event | week_rhythm",
      "headline": "string — short, conversational",
      "body": "string — 1-2 sentence explanation",
      "isActionable": true | false,
      "actionLabel": "string | null",
      "actionType": "string | null",
      "staleItemIds": ["string"] | null
    }
  ],
  "weekAhead": {
    "introduction": "string — Gremly's week-ahead comment. Reference what's coming up and how it connects to this week's story. ONLY reference events the analyst tagged as FUTURE.",
    "highlights": [
      {
        "eventTitle": "string",
        "day": "string — e.g., 'Thursday'",
        "time": "string | null",
        "context": "string | null — use the analyst's threadFromThisWeek + your world knowledge",
        "prepNudge": "string | null — use analyst's prepSuggestion as inspiration, add your own flavor"
      }
    ],
    "busyDayWarnings": [
      { "day": "string", "comment": "string" }
    ],
    "totalEventCount": 0
  },
  "weekType": "string — use analyst's weekType.classification as base, refine if needed",
  "keyThemes": ["string — 3-5 themes"],
  "mood": "string — overall tone of the week"
}

CONTEXTUAL ENRICHMENT GUIDELINES:
- For travel destinations: Include specifics! Weather in late February, local time vs home time, neighborhoods worth exploring, airport tips, cultural context. Be the friend who's been there.
- For flights: Mention approximate flight duration, time zone math ("you'll land mid-afternoon local time"), jet lag considerations for long-haul.
- For milestones (half marathons, launches, birthdays): What it means in the journey, what to expect, practical encouragement.
- For seasonal context: What time of year means for the destination or activity.
- NEVER make up specific facts you're unsure about. If you don't know the weather in a specific place, don't guess specific temperatures. Stick to what you know confidently.

MAGIC MOMENTS:
- Use the analyst's magicMomentCandidates as your starting point. The analyst has identified WHY something is interesting + what enrichment hints to use.
- Return 0-4 moments. Zero is fine. Never force them.
- These should feel like a perceptive friend's observations, not a travel brochure.

WEEK AHEAD — CRITICAL RULES:
- ONLY include events the analyst classified as temporalBucket: "FUTURE" in nextWeekEvents.
- NEVER mention events from thisWeekEvents in the Week Ahead section — those already happened.
- Use the analyst's keyEvents from weekAheadBrief for the highlights.
- For tier 1 events (importance 7+): Full highlight with context and prep nudge.
- For tier 2 events (importance 4-6): Count in totalEventCount.
- For tier 3 (importance 1-3, recurring): Just count in totalEventCount.
- Reference the analyst's busyDays and conflictsOrWarnings for busy day warnings.

BEHAVIORAL RULES:
- Pick 2-4 insights. Never pad.
- Use the analyst's anomalies to inform insights — if something is unusual, it might be worth noting.
- Stale cleanup only when analyst says severity is medium or high.
- Frame positively but honestly. Quiet weeks get acknowledged, not manufactured enthusiasm.
- Use the analyst's habitAnalysis for any habit observations.

TREND CONTEXT RULES:
- Only reference prior weeks when a pattern spans 2+ weeks.
- Never open with "last week you also..."
- Use insightFrequency to avoid repeating the same insight type.`;

  // Build a focused payload for Sonnet — analyst brief + essential raw data
  const storytellerPayload = {
    analysisBrief,
    weekStartDate: payload.weekStartDate,
    weekEndDate: payload.weekEndDate,
    stats: payload.stats,
    recentJournalExcerpts: payload.recentJournalExcerpts,
    trendContext: payload.trendContext,
    completedTodos: payload.completedTodos?.slice(0, 15),
    staleItems: payload.staleItems,
    spaceActivity: payload.spaceActivity,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is the analyst's structured analysis brief and the user's key data. Generate their weekly summary.\n\n${JSON.stringify(storytellerPayload, null, 2)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = data.content
    ?.map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('');

  if (!text) {
    throw new Error('Anthropic API returned empty response');
  }

  // Parse JSON — strip any markdown fences if present
  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate required fields
  if (!parsed.weeklyCommentary || !parsed.insights || !parsed.weekAhead) {
    throw new Error('Anthropic response missing required fields');
  }

  return parsed;
}

/**
 * Save the generated weekly summary to the weekly_summaries table.
 * Uses UPSERT via Prefer: resolution=merge-duplicates on the
 * UNIQUE(user_id, week_start_date) constraint, so re-generation
 * overwrites cleanly.
 */
async function saveWeeklySummary(env, userId, weekStartDate, weekEndDate, aiResponse, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/weekly_summaries`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      content: aiResponse,
      stats_snapshot: payload.stats,
      trend_context: payload.trendContext || null,
      key_themes: aiResponse.keyThemes || [],
      viewed: false,
      banner_dismissed: false,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to save weekly summary: ${errText}`);
  }
}
