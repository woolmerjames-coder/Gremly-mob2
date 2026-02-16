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
        const payload = await buildServerSidePayload(env, user.user_id, user.timezone);

        // Step 2: Generate AI summary
        const aiResponse = await generateWeeklySummary(env, payload);

        // Step 3: Save to Supabase
        await saveWeeklySummary(
          env,
          user.user_id,
          payload.weekStartDate,
          payload.weekEndDate,
          aiResponse,
          payload,
        );

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
async function buildServerSidePayload(env, userId, timezone) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // Compute week boundaries in user's timezone
  const now = new Date();
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
    activeHabits,
    habitProgressThisWeek,
    journalEntries,
    notesCaptured,
    staleItems,
    spaces,
    upcomingEvents,
    priorSummaries,
    allItemsThisWeek,
    mindDropsThisWeek,
    noteEvents,
    userCalendarEvents,
  ] = await Promise.all([
    // 1. Completed todos this week
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.todo`,
        `completed_at=not.is.null`,
        `completed_at=gte.${weekStart}`,
        `completed_at=lte.${weekEnd}`,
        `select=id,title,completed_at,created_at,archived,space_id`,
      ].join('&'),
    ),

    // 2. Completed todos last week (for comparison)
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.todo`,
        `completed_at=not.is.null`,
        `completed_at=gte.${prevWeekStart}`,
        `completed_at=lte.${prevWeekEnd}`,
        `select=id`,
      ].join('&'),
    ),

    // 3. Active habits (not archived)
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.habit`,
        `archived=eq.false`,
        `select=id,name,title,cadence,target_per_period,days_active,last_checked_in_at,space_id`,
      ].join('&'),
    ),

    // 4. Habit check-ins this week (from habit_progress)
    query(
      'habit_progress',
      [
        `owner_id=eq.${userId}`,
        `occurred_day=gte.${weekStart.split('T')[0]}`,
        `occurred_day=lte.${weekEnd.split('T')[0]}`,
        `select=habit_id,occurred_day`,
      ].join('&'),
    ),

    // 5. Journal entries this week
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

    // 6. Notes/ideas captured this week (non-journal)
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=neq.journal`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,title,created_at,space_id`,
      ].join('&'),
    ),

    // 7. Stale items: todos not completed, not archived, created > 14 days ago
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.todo`,
        `completed_at=is.null`,
        `archived=eq.false`,
        `created_at=lte.${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()}`,
        `select=id,title,created_at,updated_at,space_id`,
        `order=created_at.asc`,
        `limit=20`,
      ].join('&'),
    ),

    // 8. User's spaces
    query('spaces', [`owner_id=eq.${userId}`, `select=id,name`].join('&')),

    // 9. Upcoming events (next week)
    query(
      'events',
      [
        `owner_id=eq.${userId}`,
        `created_at=gte.${nextWeekStart}`,
        `select=id,kind,payload_json,created_at`,
        `limit=50`,
      ].join('&'),
    ),

    // 10. Prior weekly summaries (for trend context, last 4)
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

    // 11. All items touched this week (for lock-ins)
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.todo`,
        `or=(completed_at.gte.${weekStart},locked_in_at.gte.${weekStart})`,
        `select=id,completed_at,locked_in,locked_in_at`,
      ].join('&'),
    ),

    // 12. Mind drops this week
    query(
      'habits',
      [
        `owner_id=eq.${userId}`,
        `drop_id=not.is.null`,
        `created_at=gte.${weekStart}`,
        `created_at=lte.${weekEnd}`,
        `select=id,drop_id,completed_at`,
      ].join('&'),
    ),

    // 13. Note events (subtype='event') for the upcoming week
    query(
      'notes',
      [
        `owner_id=eq.${userId}`,
        `subtype=eq.event`,
        `archived=eq.false`,
        `or=(date.gte.${nextWeekStart},date.lte.${nextWeekEnd},target_date.gte.${nextWeekStart},target_date.lte.${nextWeekEnd})`,
        `select=id,title,date,target_date,space_id,subtype`,
      ].join('&'),
    ),

    // 14. User calendar events for the upcoming week
    query(
      'user_calendar_events',
      [
        `owner_id=eq.${userId}`,
        `event_date=gte.${nextWeekStart.split('T')[0]}`,
        `event_date=lte.${nextWeekEnd.split('T')[0]}`,
        `select=id,title,event_date,event_time,space_id`,
      ].join('&'),
    ),
  ]);

  // --- Aggregate into payload shape ---

  const todosCompleted = completedTodosThisWeek.length;
  const todosCompletedLastWeek = completedTodosLastWeek.length;

  // Lock-ins this week
  const lockIns = allItemsThisWeek.filter(
    (i) => i.locked_in && i.locked_in_at && i.locked_in_at >= weekStart,
  ).length;

  // Mind drops
  const mindDropsCreated = mindDropsThisWeek.length;
  const mindDropsSwept = mindDropsThisWeek.filter((d) => d.completed_at != null).length;

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
  for (const item of [...completedTodosThisWeek, ...notesCaptured]) {
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
    title: t.title,
    completedAt: t.completed_at,
    createdAt: t.created_at,
    wasOverdue: false,
  }));

  // Stale items for insights
  const staleItemsForAI = staleItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: 'todo',
    createdAt: item.created_at,
    lastTouchedAt: item.updated_at || item.created_at,
  }));

  // Build space name lookup for note events
  const spaceNameMap = {};
  for (const s of spaces) {
    spaceNameMap[s.id] = s.name;
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

  // Note events (subtype='event') — user-created events stored in notes table
  const noteEventsMapped = noteEvents.map((note) => ({
    title: note.title,
    date: note.date || note.target_date,
    startTime: null,
    source: 'gremly',
    spaceName: note.space_id ? spaceNameMap[note.space_id] || null : null,
    isAllDay: true,
    isRecurring: false,
    isUserCreated: true,
    hasGremlyInteraction: false,
    linkedTodoCount: 0,
  }));

  // User calendar events — user-created calendar events
  const userCalendarEventsMapped = userCalendarEvents.map((event) => ({
    title: event.title,
    date: event.event_date,
    startTime: event.event_time || null,
    source: 'gremly',
    isAllDay: !event.event_time,
    isRecurring: false,
    isUserCreated: true,
    hasGremlyInteraction: false,
    linkedTodoCount: 0,
  }));

  // Merge all event sources and sort by date ascending
  const upcomingEventsForAI = [...externalEvents, ...noteEventsMapped, ...userCalendarEventsMapped]
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateA - dateB;
    })
    .slice(0, 30);

  // Recent journal excerpts
  const recentJournalExcerpts = journalEntries.slice(0, 5).map((j) => ({
    excerpt: (j.body || '').substring(0, 200),
    date: j.date || j.created_at,
  }));

  // Recent notes titles
  const recentNotesTitles = notesCaptured.slice(0, 10).map((n) => n.title);

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
      todosCreated: completedTodosThisWeek.length + staleItems.length,
      todosCompletedLastWeek,
      habitsTracked,
      journalEntries: journalEntries.length,
      lockIns,
      ideasCaptured: notesCaptured.length,
      mindDropsCreated,
      mindDropsSwept,
    },
    completedTodos: completedTodosForAI,
    staleItems: staleItemsForAI,
    spaceActivity,
    completionsByDay,
    completionsByTimeBlock,
    upcomingEvents: upcomingEventsForAI,
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
 * Call the Anthropic API to generate the weekly summary.
 * Uses the same prompt structure as the cortex Worker endpoint.
 *
 * @param {object} env - Worker env with ANTHROPIC_API_KEY
 * @param {object} payload - The aggregated payload from buildServerSidePayload
 * @returns {object} Parsed JSON matching the spec's Section 8.3 response schema
 */
async function generateWeeklySummary(env, payload) {
  const systemPrompt = `You are Gremly, a warm and encouraging productivity companion. You are generating a weekly summary for a user. Your voice is conversational, specific, and supportive — like a thoughtful friend reviewing the week together, not an analyst presenting a report.

OUTPUT FORMAT: Respond ONLY with valid JSON matching this exact schema. No markdown, no backticks, no preamble.

{
  "weeklyCommentary": "string — 2-3 sentences weaving together the user's week into a narrative. Be specific to their data. Never generic.",
  "highlightMoment": {
    "title": "string — the item or moment that was the biggest win",
    "reason": "string — why this mattered",
    "gremlyComment": "string — one-liner celebration from Gremly"
  },
  "insights": [
    {
      "type": "stale_cleanup | capture_ratio | productivity_pattern | space_activity | balance | habit_observation | journal_encouragement",
      "headline": "string — short, conversational",
      "body": "string — 1-2 sentence explanation",
      "isActionable": true | false,
      "actionLabel": "string | null — CTA button text if actionable",
      "actionType": "string | null — what the CTA triggers",
      "staleItemIds": ["string"] | null
    }
  ],
  "weekAhead": {
    "introduction": "string — Gremly's week-ahead comment",
    "highlights": [
      {
        "eventTitle": "string",
        "day": "string — e.g., 'Thursday'",
        "time": "string | null",
        "context": "string | null — journal/note connection",
        "prepNudge": "string | null"
      }
    ],
    "busyDayWarnings": [
      { "day": "string", "comment": "string" }
    ],
    "totalEventCount": 0
  },
  "keyThemes": ["string — 3-5 high-level themes"],
  "mood": "string — overall tone/mood of the week"
}

BEHAVIORAL RULES:
- Pick 2-4 insights maximum. If only 1 is genuinely useful, return 1. Never pad.
- Stale item cleanup is one possible insight, not guaranteed. Only surface when 3+ items are older than 2 weeks.
- For Week Ahead, classify events into tiers: Tier 1 (signal: user-created, one-off, journal-connected) gets highlighted. Tier 2 (recurring, standard) gets counted in totalEventCount.
- Cross-reference journal excerpts and note titles against upcoming event titles. Surface connections.
- Commentary must be specific to this user's data. Never say "great week" if nothing was completed.
- Frame positively but honestly. Quiet weeks get acknowledged, not manufactured enthusiasm.
- Gracefully handle sparse data. Week 1 with 3 items should still produce a useful summary.

TREND CONTEXT RULES (when trendContext is present):
- Only reference prior weeks when a pattern spans 2+ weeks.
- Never open with "last week you also..." — weave history into forward-looking observations.
- If the user acted on a prior recommendation, acknowledge it.
- Never repeat the same insight verbatim. Escalate framing or suggest a different action.
- Use insightFrequency to avoid fatigue. If an insight fired 3+ weeks, reframe or skip.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is the user's weekly data. Generate their weekly summary.\n\n${JSON.stringify(payload, null, 2)}`,
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
