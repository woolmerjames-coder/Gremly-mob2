/**
 * Builds a live snapshot of what happened TODAY.
 * Called at chat time alongside getUserProfile and buildChatContext.
 * Pure Supabase queries, no AI. Optional KV cache with 5-min TTL.
 *
 * Returns a formatted text block or null if no activity.
 */

export async function buildTodayActivity(userId, timezone, env) {
  if (!userId) return null;

  try {
    // Get today's date in user's timezone
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(
      new Date(),
    );
    const nowHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone || 'UTC',
      }).format(new Date()),
      10,
    );
    const nowTime = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC',
    }).format(new Date());

    // Check KV cache (5 min TTL to stay fresh without hammering Supabase)
    const cacheKey = `today-activity:${userId}:${todayStr}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) return cached;
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Start of today in UTC (approximate — for query filtering)
    const todayStart = `${todayStr}T00:00:00Z`;

    const [
      completedTodos,
      createdTodos,
      archivedTodos,
      habitProgress,
      activeHabits,
      todayNotes,
      calendarEvents,
    ] = await Promise.all([
      // Todos completed today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&status=eq.completed&completed_at=gte.${encodeURIComponent(todayStart)}&select=title,completed_at&order=completed_at.desc&limit=20`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Todos created today (new drops)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(todayStart)}&select=title,status,created_at&order=created_at.desc&limit=15`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Todos archived/deleted today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&archived=eq.true&archived_at=gte.${encodeURIComponent(todayStart)}&select=title,archived_at&order=archived_at.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Habit progress entries for today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${encodeURIComponent(userId)}&occurred_day=eq.${encodeURIComponent(todayStr)}&select=habit_id,occurred_day`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Active habits (to map IDs to names)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${encodeURIComponent(userId)}&archived=eq.false&select=id,name,frequency`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Notes/journals dropped today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${encodeURIComponent(userId)}&subtype=neq.event&archived=eq.false&created_at=gte.${encodeURIComponent(todayStart)}&select=title,subtype,mood&order=created_at.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Calendar events for today (to determine which have passed)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${encodeURIComponent(userId)}&subtype=eq.event&archived=eq.false&target_date=eq.${encodeURIComponent(todayStr)}&select=title,event_time,location&order=event_time.asc`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const safeArr = (v) => (Array.isArray(v) ? v : []);

    // Build the text block
    const parts = [];
    parts.push(`=== TODAY'S ACTIVITY (live as of ${nowTime}) ===`);

    // Completed todos
    const completed = safeArr(completedTodos);
    if (completed.length > 0) {
      parts.push(`Completed today: ${completed.map((t) => `"${t.title}"`).join(', ')}`);
    }

    // Habits done today
    const progress = safeArr(habitProgress);
    const habits = safeArr(activeHabits);
    if (progress.length > 0) {
      const habitMap = Object.fromEntries(habits.map((h) => [h.id, h.name]));
      const doneHabits = progress.map((p) => habitMap[p.habit_id]).filter(Boolean);
      if (doneHabits.length > 0) {
        const notDone = habits
          .filter((h) => !progress.some((p) => p.habit_id === h.id))
          .map((h) => h.name);
        let habitLine = `Habits done: ${doneHabits.join(', ')}`;
        if (notDone.length > 0) {
          habitLine += `. Not yet: ${notDone.join(', ')}`;
        }
        parts.push(habitLine);
      }
    } else if (habits.length > 0) {
      parts.push(`Habits: none checked off yet today (${habits.map((h) => h.name).join(', ')})`);
    }

    // Calendar events — split into passed and upcoming
    const events = safeArr(calendarEvents);
    if (events.length > 0) {
      const passed = [];
      const upcoming = [];
      for (const e of events) {
        if (e.event_time) {
          const eventHour = parseInt(e.event_time.split(':')[0], 10);
          if (eventHour <= nowHour) {
            passed.push(e);
          } else {
            upcoming.push(e);
          }
        } else {
          // All-day events count as "in progress"
          upcoming.push(e);
        }
      }
      if (passed.length > 0) {
        parts.push(
          `Events done: ${passed.map((e) => `"${e.title}"${e.event_time ? ` (${e.event_time})` : ''}`).join(', ')}`,
        );
      }
      if (upcoming.length > 0) {
        parts.push(
          `Still ahead: ${upcoming.map((e) => `"${e.title}"${e.event_time ? ` (${e.event_time})` : ''}`).join(', ')}`,
        );
      }
    }

    // New drops today (exclude completed ones already listed)
    const completedTitles = new Set(completed.map((t) => t.title?.toLowerCase()));
    const newDrops = safeArr(createdTodos).filter(
      (t) => t.status !== 'completed' && !completedTitles.has(t.title?.toLowerCase()),
    );
    if (newDrops.length > 0) {
      parts.push(`New today: ${newDrops.map((t) => `"${t.title}"`).join(', ')}`);
    }

    // Archived/let go
    const archived = safeArr(archivedTodos);
    if (archived.length > 0) {
      parts.push(`Let go: ${archived.map((t) => `"${t.title}"`).join(', ')}`);
    }

    // Journal entries
    const journals = safeArr(todayNotes).filter((n) => n.subtype === 'journal');
    if (journals.length > 0) {
      const moodStr = journals
        .filter((j) => j.mood?.length > 0)
        .flatMap((j) => j.mood)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ');
      parts.push(
        `Journaled today: ${journals.length} entr${journals.length === 1 ? 'y' : 'ies'}${moodStr ? ` (mood: ${moodStr})` : ''}`,
      );
    }

    // If nothing happened today, say so
    if (parts.length <= 1) {
      parts.push('No activity tracked yet today.');
    }

    const result = parts.join('\n');

    // Cache for 5 minutes
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, result, { expirationTtl: 300 });
    }

    return result;
  } catch (error) {
    console.error('[TodayActivity] Error:', error);
    return null;
  }
}
