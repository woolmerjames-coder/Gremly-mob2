/**
 * Gremly Notification Worker v4
 *
 * Sends morning and evening push notifications via Expo Push API.
 * Runs on a cron schedule (every 5 minutes) and checks each user's
 * preferred notification times in their local timezone.
 *
 * Features:
 * - Per-user timezone-aware scheduling
 * - Atomic deduplication via claim_notification_slot RPC (prevents race conditions)
 * - 5-minute window matching (aligns with cron interval) with midnight wraparound
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

    // ── Temporary admin: delete weekly summary ──
    // DELETE /admin/weekly-summary?user_id=X&after=ISO
    if (url.pathname === '/admin/weekly-summary' && request.method === 'DELETE') {
      const userId = url.searchParams.get('user_id');
      const after = url.searchParams.get('after');
      if (!userId || !after) {
        return new Response(JSON.stringify({ error: 'user_id and after required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/weekly_summaries?user_id=eq.${userId}&generated_at=gte.${after}`,
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
      return new Response(JSON.stringify({ deleted: deleted.length, rows: deleted }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // @deprecated — V1 weekly pipeline removed. Production pipeline is weeklySummaryV2Worker in inngest-jobs.
    if (url.pathname === '/backfill-weekly' && request.method === 'POST') {
      return new Response(
        JSON.stringify({
          error:
            'This endpoint is deprecated. Weekly summaries are now generated via the weeklySummaryV2Worker Inngest pipeline. Trigger manually via the Inngest dashboard with event app/weekly-summary-v2.run.',
          deprecated: true,
        }),
        { status: 410, headers: { 'Content-Type': 'application/json' } },
      );
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

      const [noteEventsRes, calEventsRes, externalEventsRes, noteEventsThisWeekRes] =
        await Promise.all([
          fetch(
            `${sb}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&select=id,title,target_date,end_date,date,event_time,location,is_all_day,space_id,created_at&order=target_date.desc&limit=50`,
            { headers },
          ),
          fetch(
            `${sb}/rest/v1/user_calendar_events?owner_id=eq.${userId}&select=id,title,event_date,event_time,duration_minutes,space_id,notes,source,created_at&order=event_date.desc&limit=50`,
            { headers },
          ),
          fetch(
            `${sb}/rest/v1/events?user_id=eq.${userId}&select=id,kind,payload_json,created_at&order=created_at.desc&limit=30`,
            { headers },
          ),
          fetch(
            `${sb}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&or=(and(target_date.gte.2026-02-16,target_date.lte.2026-02-22),and(target_date.gte.2026-02-23,target_date.lte.2026-03-01))&select=id,title,target_date,end_date,date,event_time,location,is_all_day,space_id,created_at&order=target_date.asc`,
            { headers },
          ),
        ]);

      const noteEvents = noteEventsRes.ok ? await noteEventsRes.json() : [];
      const calEvents = calEventsRes.ok ? await calEventsRes.json() : [];
      const externalEvents = externalEventsRes.ok ? await externalEventsRes.json() : [];
      const noteEventsThisAndNext = noteEventsThisWeekRes.ok
        ? await noteEventsThisWeekRes.json()
        : [];

      return jsonResponse({
        noteEvents: { count: noteEvents.length, rows: noteEvents },
        userCalendarEvents: { count: calEvents.length, rows: calEvents },
        externalEvents: { count: externalEvents.length, rows: externalEvents },
        noteEventsThisAndNextWeek: {
          count: noteEventsThisAndNext.length,
          rows: noteEventsThisAndNext,
        },
      });
    }

    return new Response('Gremly Notification Worker v4. Use /test to trigger manually.', {
      status: 200,
    });
  },
};

// =============================================================================
// DCO helper
// =============================================================================

async function fetchUserDco(userId, timezone, supabaseUrl, supabaseKey) {
  try {
    const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.${todayLocal}&select=dco`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );
    if (!response.ok) return null;
    const rows = await response.json();
    return rows?.[0]?.dco || null;
  } catch (err) {
    console.warn(`[Notifications] DCO fetch failed for ${userId.slice(0, 8)}:`, err.message);
    return null;
  }
}

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

  // Get notification preferences
  const prefsResponse = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences?select=user_id,morning_enabled,morning_time,evening_enabled,evening_time,weekly_enabled,weekly_time,weekly_day,timezone,afternoon_enabled,afternoon_time,last_app_active_at`,
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

  // Get training mode status for each user
  const cortexResponse = await fetch(
    `${supabaseUrl}/rest/v1/cortex_preferences?select=owner_id,is_training_mode`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  const cortexPrefs = cortexResponse.ok ? await cortexResponse.json() : [];

  // Create a map of user_id -> is_training_mode
  const trainingMap = {};
  for (const cp of cortexPrefs) {
    trainingMap[cp.owner_id] = cp.is_training_mode === true;
  }

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
    const isTraining = trainingMap[pref.user_id] || false;
    const userTime = getTimeInTimezone(now, timezone);

    // Check morning notification
    if (pref.morning_enabled && pref.morning_time) {
      const [mornHour, mornMin] = parseTime(pref.morning_time);

      if (isWithinWindow(userTime.hour, userTime.minute, mornHour, mornMin, 5)) {
        usersToNotify.push({
          user_id: pref.user_id,
          token: token,
          type: 'morning',
          timezone: timezone,
          isTraining: isTraining,
          title: 'Good morning',
          body: 'Your Morning Brief is waiting.',
        });
      }
    }

    // Check evening notification
    if (pref.evening_enabled && pref.evening_time) {
      const [eveHour, eveMin] = parseTime(pref.evening_time);

      if (isWithinWindow(userTime.hour, userTime.minute, eveHour, eveMin, 5)) {
        // Check DCO tone — skip or soften for relaxed users
        const dco = await fetchUserDco(pref.user_id, timezone, supabaseUrl, supabaseKey);
        const tone = dco?.tone;

        if (tone === 'relaxed') {
          console.log(
            `[Notifications] Skipping evening for ${pref.user_id.slice(0, 8)} (tone: relaxed)`,
          );
          // Don't push — user is intentionally disengaged
        } else {
          const eveningBody =
            tone === 'recovering'
              ? 'Quick check-in whenever you are ready.'
              : 'A few minutes now, a clearer head tonight.';

          usersToNotify.push({
            user_id: pref.user_id,
            token: token,
            type: 'evening',
            isTraining: isTraining,
            title: 'Sweep before sleep',
            body: eveningBody,
          });
        }
      }
    }

    // Weekly summary scheduling has moved to weeklySummaryV2Dispatcher in inngest-jobs worker

    // Check afternoon check-in notification
    if (pref.afternoon_enabled && pref.afternoon_time) {
      const [aftHour, aftMin] = parseTime(pref.afternoon_time);

      if (isWithinWindow(userTime.hour, userTime.minute, aftHour, aftMin, 5)) {
        usersToNotify.push({
          user_id: pref.user_id,
          token: token,
          type: 'afternoon',
          timezone: timezone,
          isTraining: isTraining,
          last_app_active_at: pref.last_app_active_at,
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

  // Split users into immediate (morning/evening) and afternoon
  const immediateUsers = usersToNotify.filter((u) => u.type !== 'afternoon');
  const afternoonUsers = usersToNotify.filter((u) => u.type === 'afternoon');

  // Send notifications and update last_sent
  let sent = 0;
  const errors = [];

  // --- Process immediate (morning/evening) notifications sequentially ---
  for (const user of immediateUsers) {
    try {
      const userTimezone =
        prefs.find((p) => p.user_id === user.user_id)?.timezone || 'America/Los_Angeles';
      const todayInUserTz = getDateInTimezone(now, userTimezone);

      // Atomic claim — if another invocation already sent, skip
      const claimed = await claimNotificationSlot(
        supabaseUrl,
        supabaseKey,
        user.user_id,
        user.type,
        todayInUserTz,
      );
      if (!claimed) {
        console.log(
          `[Notifications] Slot already claimed for ${user.type} - ${user.user_id}, skipping`,
        );
        continue;
      }

      // For morning notifications, try to use DCO brief_headline as copy
      if (user.type === 'morning') {
        const dco = await fetchUserDco(user.user_id, user.timezone, supabaseUrl, supabaseKey);
        if (dco?.brief_headline) {
          user.title = 'Gremly';
          user.body = dco.brief_headline;
        }
      }

      await sendExpoPush(user.token, user.title, user.body, user.type, {
        _categoryId: user.type === 'morning' ? 'MORNING_BRIEF' : 'EVENING_SWEEP',
        notificationType: user.type === 'morning' ? 'morning_brief' : 'evening_sweep',
      });
      sent++;
      console.log(`[Notifications] Sent ${user.type} to user ${user.user_id}`);
    } catch (err) {
      errors.push({ user_id: user.user_id, error: err.message });
      console.error(`[Notifications] Failed for ${user.user_id}:`, err.message);
    }
  }

  // --- Process afternoon check-in notifications ---
  if (afternoonUsers.length > 0) {
    console.log(`[Notifications] Processing ${afternoonUsers.length} afternoon check-ins`);

    for (const user of afternoonUsers) {
      try {
        const userTimezone = user.timezone || 'America/Los_Angeles';
        const todayInUserTz = getDateInTimezone(now, userTimezone);

        // Atomic claim
        const claimed = await claimNotificationSlot(
          supabaseUrl,
          supabaseKey,
          user.user_id,
          'afternoon',
          todayInUserTz,
        );
        if (!claimed) {
          console.log(`[Notifications] Afternoon slot already claimed for ${user.user_id}`);
          continue;
        }

        // Suppression: user active in last 2 hours
        if (user.last_app_active_at) {
          const lastActive = new Date(user.last_app_active_at);
          const twoHoursMs = 2 * 60 * 60 * 1000;
          if (now.getTime() - lastActive.getTime() < twoHoursMs) {
            console.log(
              `[Notifications] Afternoon suppressed (recently active) for ${user.user_id}`,
            );
            continue;
          }
        }

        // Query actionable items for smart content
        const context = await getAfternoonContext(
          supabaseUrl,
          supabaseKey,
          user.user_id,
          getDateInTimezone(now, userTimezone),
        );
        if (context.lockInCount === 0 && context.overdueCount === 0) {
          console.log(
            `[Notifications] Afternoon suppressed (no actionable items) for ${user.user_id}`,
          );
          continue;
        }

        // Build message
        let title = 'Afternoon check-in';
        let body;
        if (context.lockInCount >= 2) {
          body = `You have ${context.lockInCount} lock-ins today. How's it going?`;
        } else if (context.lockInCount === 1 && context.firstLockInTitle) {
          body = `${context.firstLockInTitle} — still on track?`;
        } else {
          body = `You've got ${context.overdueCount} open item${context.overdueCount === 1 ? '' : 's'}. Want to lock one in for this afternoon?`;
        }

        await sendExpoPush(user.token, title, body, 'afternoon_checkin', {
          _categoryId: 'AFTERNOON_CHECKIN',
          notificationType: 'afternoon_checkin',
        });
        sent++;
        console.log(`[Notifications] Afternoon check-in sent to ${user.user_id}`);
      } catch (err) {
        errors.push({ user_id: user.user_id, error: err.message });
        console.error(`[Notifications] Afternoon failed for ${user.user_id}:`, err.message);
      }
    }
  }

  return { sent, errors: errors.length, prefsCount: prefs.length, tokensCount: tokens.length };
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

/**
 * Atomically claim a notification send slot via Supabase RPC.
 * Prevents race conditions where two cron invocations both read "not sent" and both send.
 * Returns true if claimed (safe to send), false if already sent (skip).
 */
async function claimNotificationSlot(supabaseUrl, supabaseKey, userId, type, dateKey) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_notification_slot`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_type: type,
        p_date_key: dateKey,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[Notifications] claimNotificationSlot RPC error for ${userId}/${type}:`,
        errText,
      );
      return false; // fail-safe: don't send
    }

    const result = await response.json();
    return result === true;
  } catch (err) {
    console.error(
      `[Notifications] claimNotificationSlot exception for ${userId}/${type}:`,
      err.message,
    );
    return false; // fail-safe: don't send
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
  const wrappedDiff = Math.min(diff, 1440 - diff);
  return wrappedDiff <= windowMinutes;
}

async function sendExpoPush(token, title, body, notificationType, extraData = {}) {
  const { _categoryId, ...dataExtras } = extraData;
  const pushPayload = {
    to: token,
    title: title,
    body: body,
    sound: 'default',
    categoryId: _categoryId,
    data: {
      type: notificationType,
      action: 'open_flow',
      ...dataExtras,
    },
  };
  // Remove null/undefined optional fields that Expo rejects
  Object.keys(pushPayload).forEach((key) => {
    if (pushPayload[key] === null || pushPayload[key] === undefined) {
      delete pushPayload[key];
    }
  });
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pushPayload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Expo push failed: ${errText}`);
  }

  return response.json();
}

/**
 * Query a user's actionable items for today to build afternoon check-in content.
 * Returns lock-in count, overdue count, and the title of the first lock-in.
 */
async function getAfternoonContext(supabaseUrl, supabaseKey, userId, todayDate) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  try {
    // Query locked-in todos for today that are not completed
    const lockInsRes = await fetch(
      `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&locked_in_at=not.is.null&completed_at=is.null&archived=eq.false&select=id,title,name&limit=10`,
      { headers },
    );
    const lockIns = lockInsRes.ok ? await lockInsRes.json() : [];

    // Query overdue todos (due_day <= today, not completed, not archived)
    const overdueRes = await fetch(
      `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&due_day=lte.${todayDate}&completed_at=is.null&archived=eq.false&select=id&limit=20`,
      { headers },
    );
    const overdueTodos = overdueRes.ok ? await overdueRes.json() : [];

    // Also check locked-in habits
    const habitLockInsRes = await fetch(
      `${supabaseUrl}/rest/v1/habits?owner_id=eq.${userId}&locked_in_at=not.is.null&archived=eq.false&select=id,title,name&limit=10`,
      { headers },
    );
    const habitLockIns = habitLockInsRes.ok ? await habitLockInsRes.json() : [];

    const allLockIns = [...lockIns, ...habitLockIns];
    const firstLockIn = allLockIns[0];

    return {
      lockInCount: allLockIns.length,
      overdueCount: overdueTodos.length,
      firstLockInTitle: firstLockIn?.title || firstLockIn?.name || null,
    };
  } catch (err) {
    console.error(`[getAfternoonContext] Failed for ${userId}:`, err.message);
    return { lockInCount: 0, overdueCount: 0, firstLockInTitle: null };
  }
}
