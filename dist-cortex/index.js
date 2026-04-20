var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// workers/cortex/context/chatProjection.js
async function getLifeMapForChat(userId, env) {
  if (!userId) return null;
  try {
    const cacheKey = `life-map-chat:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Life Map cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    if (!response.ok) {
      console.error("[ChatProjection] Life Map fetch failed:", response.statusText);
      return null;
    }
    const data = await response.json();
    if (!data || data.length === 0) {
      console.log("[ChatProjection] No Life Map found for user");
      return null;
    }
    const lifeMap = data[0].life_map;
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(lifeMap), { expirationTtl: 7200 });
    }
    if (lifeMap?.domains && env.CONTEXT_CACHE) {
      const domainNames = lifeMap.domains.filter((d) => d.attention !== "background").map((d) => d.name);
      await env.CONTEXT_CACHE.put(`life-map-domains:${userId}`, JSON.stringify(domainNames), {
        expirationTtl: 3600
      }).catch(() => {
      });
    }
    console.log(
      `[ChatProjection] Life Map loaded for ${userId.slice(0, 8)}: ${lifeMap?.domains?.length || 0} domains`
    );
    return lifeMap;
  } catch (error) {
    console.error("[ChatProjection] Life Map error:", error);
    return null;
  }
}
__name(getLifeMapForChat, "getLifeMapForChat");
async function getDailyFocusForChat(userId, env) {
  if (!userId) return null;
  try {
    const cacheKey = `daily-focus-chat:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Daily focus cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&select=dco,date&order=date.desc&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    if (!response.ok) {
      console.error("[ChatProjection] Daily focus fetch failed:", response.statusText);
      return null;
    }
    const data = await response.json();
    if (!data || data.length === 0) return null;
    const dco = data[0].dco;
    const focusData = {
      date: data[0].date,
      lifeMoment: dco?.life_moment || dco?.daily_focus?.life_moment || null,
      tone: dco?.tone || dco?.daily_focus?.tone || null,
      dayType: dco?.day_type || dco?.daily_focus?.day_type || null,
      todayFocus: dco?.today_focus || dco?.daily_focus?.today_focus || [],
      leadStory: dco?.lead_story || dco?.daily_focus?.lead_story || null,
      secondary: dco?.daily_focus?.secondary || null,
      namedAnchors: dco?.named_anchors || dco?.daily_focus?.named_anchors || [],
      activeToday: dco?.active_today || null,
      briefHeadline: dco?.brief_headline || null,
      weekRecap: dco?.week_recap || [],
      weekMoodArc: dco?.week_mood_arc || null
    };
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(focusData), { expirationTtl: 7200 });
    }
    console.log(
      `[ChatProjection] Daily focus loaded for ${userId.slice(0, 8)}, tone: ${focusData.tone}`
    );
    return focusData;
  } catch (error) {
    console.error("[ChatProjection] Daily focus error:", error);
    return null;
  }
}
__name(getDailyFocusForChat, "getDailyFocusForChat");
async function fetchRecentActivityDelta(userId, env) {
  if (!userId) return null;
  try {
    const cacheKey = `recent-delta:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Recent delta cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1e3).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1e3).toISOString();
    const [recentNotes, recentTodos, recentHabitProgress, recentEventRows] = await Promise.all([
      // Recent drops (notes created in last 72h, non-events)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=neq.event&archived=eq.false&created_at=gte.${threeDaysAgo}&select=title,subtype,mood,created_at,space_id&order=created_at.desc&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Recently completed todos (last 72h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&completed_at=gte.${threeDaysAgo}&select=title,completed_at,space_id&order=completed_at.desc&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Recent habit completions (last 48h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_at=gte.${twoDaysAgo}&select=habit_id,occurred_day&limit=20`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Recent calendar events (last 72h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=gte.${threeDaysAgo.split("T")[0]}&select=title,target_date,event_time,location,space_id&order=target_date.desc&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => [])
    ]);
    const delta = {
      recentDrops: Array.isArray(recentNotes) ? recentNotes : [],
      recentCompletions: Array.isArray(recentTodos) ? recentTodos : [],
      recentHabitActivity: Array.isArray(recentHabitProgress) ? recentHabitProgress : [],
      recentEvents: Array.isArray(recentEventRows) ? recentEventRows : []
    };
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(delta), { expirationTtl: 300 });
    }
    console.log(
      `[ChatProjection] Recent delta loaded for ${userId.slice(0, 8)}: ${delta.recentDrops.length} drops, ${delta.recentCompletions.length} completions, ${delta.recentEvents.length} events`
    );
    return delta;
  } catch (error) {
    console.error("[ChatProjection] Recent delta error:", error);
    return null;
  }
}
__name(fetchRecentActivityDelta, "fetchRecentActivityDelta");
function formatDailyFocusForChat(focus) {
  if (!focus) return "";
  const parts = ["=== CURRENT LIFE CONTEXT (generated daily) ==="];
  if (focus.lifeMoment) parts.push(`Life moment: ${focus.lifeMoment}`);
  if (focus.tone) parts.push(`Tone today: ${focus.tone}`);
  if (focus.briefHeadline) parts.push(`Today's headline: "${focus.briefHeadline}"`);
  if (focus.leadStory) {
    parts.push(
      `Lead story: ${focus.leadStory.domain} \u2192 ${focus.leadStory.thread}: ${focus.leadStory.detail}`
    );
  }
  if (focus.todayFocus && focus.todayFocus.length > 0) {
    parts.push(`Today's focus: ${focus.todayFocus.join(", ")}`);
  }
  const people = (focus.namedAnchors || []).filter((a) => a.type === "person").map((a) => a.label);
  if (people.length > 0) {
    parts.push(`Named people: ${people.join(", ")}`);
  }
  if (focus.weekRecap && focus.weekRecap.length > 0) {
    parts.push("");
    parts.push("=== THIS WEEK SO FAR ===");
    const sorted = [...focus.weekRecap].sort(
      (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    for (const entry of sorted) {
      parts.push(`  ${entry.date}: ${entry.event}`);
    }
    if (focus.weekMoodArc) {
      parts.push(`Mood this week: ${focus.weekMoodArc}`);
    }
    parts.push(
      "Reference this when the user asks about their week, recent events, or what they've been up to. These are concrete things that happened."
    );
  }
  parts.push("");
  parts.push("Use this context naturally \u2014 like a friend who knows their situation.");
  return parts.join("\n");
}
__name(formatDailyFocusForChat, "formatDailyFocusForChat");
function formatLifeMapForChat(lifeMap, lane, opts = {}) {
  if (!lifeMap?.domains) return "";
  const parts = ["=== LIFE MAP \u2014 WHAT MATTERS TO THIS PERSON ==="];
  for (const domain of lifeMap.domains) {
    const isMatchingDomain = lane === "space" && opts.spaceId && domain.space_id === opts.spaceId || lane === "entity" && opts.entitySpaceId && domain.space_id === opts.entitySpaceId;
    if (isMatchingDomain) {
      parts.push(`
DOMAIN: "${domain.name}" [RELEVANT TO THIS CONVERSATION]`);
      for (const thread of domain.threads || []) {
        if (thread.lifecycle === "archived") continue;
        parts.push(
          `
  ${thread.name}: ${thread.status}, ${thread.momentum}, ${thread.importance} importance`
        );
        if (thread.summary) {
          parts.push(`    "${thread.summary}"`);
        }
        if (thread.recent_update) {
          parts.push(`    Latest: "${thread.recent_update}"`);
        }
        if (thread.evidence?.length > 0) {
          const recent = thread.evidence.slice(-3);
          for (const e of recent) {
            parts.push(`    ${e.date}: ${e.signal}`);
          }
        }
      }
    } else if (lane === "general") {
      const activeThreads = (domain.threads || []).filter(
        (t) => t.lifecycle === "active" || t.lifecycle === "dormant"
      );
      if (activeThreads.length === 0) continue;
      parts.push(`
${domain.name}:`);
      for (const thread of activeThreads) {
        const isHigh = thread.importance === "high";
        parts.push(
          `  ${thread.name}: ${thread.status}, ${thread.momentum}${isHigh ? " [important]" : ""}`
        );
        if (isHigh && thread.summary) {
          parts.push(`    "${thread.summary}"`);
        }
        if (isHigh && thread.recent_update) {
          parts.push(`    Latest: "${thread.recent_update}"`);
        }
      }
    } else {
      const activeThreads = (domain.threads || []).filter(
        (t) => t.lifecycle === "active" || t.lifecycle === "dormant"
      );
      if (activeThreads.length === 0) continue;
      parts.push(`
${domain.name}:`);
      for (const thread of activeThreads) {
        parts.push(
          `  ${thread.name}: ${thread.status}, ${thread.momentum}${thread.importance === "high" ? " [important]" : ""}`
        );
        if (thread.summary && lane !== "habit_builder" && thread.importance === "high") {
          const firstSentence = thread.summary.split(/\.\s/)[0] + ".";
          parts.push(`    "${firstSentence}"`);
        }
      }
    }
  }
  return parts.join("\n");
}
__name(formatLifeMapForChat, "formatLifeMapForChat");
function formatRecentDelta(delta) {
  if (!delta) return "";
  const parts = [];
  if (delta.recentEvents?.length > 0) {
    parts.push("=== RECENT EVENTS (last 72h) ===");
    for (const e of delta.recentEvents.slice(0, 6)) {
      const loc = e.location ? ` (${e.location})` : "";
      parts.push(`  ${e.target_date}: ${e.title}${loc}`);
    }
  }
  if (delta.recentDrops.length > 0) {
    parts.push("=== RECENT ACTIVITY (last 24-72h) ===");
    for (const d of delta.recentDrops.slice(0, 6)) {
      const mood = d.mood?.length > 0 ? ` [mood: ${d.mood.join(", ")}]` : "";
      const date = d.created_at ? d.created_at.split("T")[0] : "";
      parts.push(`  ${date}: [${d.subtype || "note"}] ${d.title}${mood}`);
    }
  }
  if (delta.recentCompletions.length > 0) {
    const titles = delta.recentCompletions.slice(0, 4).map((t) => t.title).join(", ");
    parts.push(`  Recent completions: ${titles}`);
  }
  return parts.join("\n");
}
__name(formatRecentDelta, "formatRecentDelta");
async function buildChatContext(userId, lane, opts, env) {
  if (!userId) return "";
  try {
    const timezone = opts?.timezone || "UTC";
    const currentChatId = opts?.currentChatId;
    const [lifeMap, dailyFocus, recentDelta, temporalAnchors, chatSummaries] = await Promise.all([
      getLifeMapForChat(userId, env),
      getDailyFocusForChat(userId, env),
      fetchRecentActivityDelta(userId, env),
      fetchTemporalAnchors(userId, timezone, env),
      fetchRecentChatSummaries(userId, currentChatId, env)
    ]);
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone
    }).format(/* @__PURE__ */ new Date());
    const parts = [];
    const focusStr = formatDailyFocusForChat(dailyFocus);
    if (focusStr) parts.push(focusStr);
    if (temporalAnchors) {
      const anchorsStr = formatTemporalAnchors(temporalAnchors, todayStr);
      if (anchorsStr) parts.push(anchorsStr);
    }
    if (chatSummaries) {
      const summariesStr = formatRecentChatSummaries(chatSummaries);
      if (summariesStr) parts.push(summariesStr);
    }
    const deltaStr = formatRecentDelta(recentDelta);
    if (deltaStr) parts.push(deltaStr);
    const lifeMapStr = formatLifeMapForChat(lifeMap, lane, opts);
    if (lifeMapStr) parts.push(lifeMapStr);
    const result = parts.join("\n\n");
    const MAX_CONTEXT_CHARS = lane === "general" ? 12e3 : lane === "space" ? 1e4 : 6e3;
    if (result.length > MAX_CONTEXT_CHARS) {
      console.warn(
        `[ChatProjection] Context truncated for ${userId.slice(0, 8)}: ${result.length} \u2192 ${MAX_CONTEXT_CHARS} chars`
      );
      return result.slice(0, MAX_CONTEXT_CHARS) + "\n...(truncated)";
    }
    console.log(
      `[ChatProjection] Built context for ${userId.slice(0, 8)} [${lane}]: ${result.length} chars`
    );
    return result;
  } catch (error) {
    console.error("[ChatProjection] Error building context:", error);
    return "";
  }
}
__name(buildChatContext, "buildChatContext");
async function fetchSpaceEntities(userId, spaceId, env) {
  if (!userId || !spaceId) return null;
  try {
    const cacheKey = `space-entities:${userId}:${spaceId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(
          `[ChatProjection] Space entities cache hit for ${userId.slice(0, 8)}:${spaceId.slice(0, 8)}`
        );
        return JSON.parse(cached);
      }
    }
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const [todosRes, eventsRes, habitsRes] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=eq.${spaceId}&is_complete=eq.false&select=title,target_date,scheduled_date&order=target_date.asc.nullslast&limit=15`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=eq.${spaceId}&subtype=eq.event&archived=eq.false&select=title,target_date,body&order=target_date.asc.nullslast&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=eq.${spaceId}&archived=eq.false&select=title,frequency,target_days&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => [])
    ]);
    const entities = {
      todos: Array.isArray(todosRes) ? todosRes : [],
      events: Array.isArray(eventsRes) ? eventsRes : [],
      habits: Array.isArray(habitsRes) ? habitsRes : []
    };
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(entities), { expirationTtl: 300 });
    }
    console.log(
      `[ChatProjection] Space entities loaded for ${userId.slice(0, 8)}:${spaceId.slice(0, 8)}: ${entities.todos.length} todos, ${entities.events.length} events, ${entities.habits.length} habits`
    );
    return entities;
  } catch (error) {
    console.error("[ChatProjection] Space entities error:", error);
    return null;
  }
}
__name(fetchSpaceEntities, "fetchSpaceEntities");
function formatSpaceEntities(entities) {
  if (!entities) return "";
  const { todos = [], events = [], habits = [] } = entities;
  if (todos.length === 0 && events.length === 0 && habits.length === 0) return "";
  const parts = [];
  if (events.length > 0) {
    parts.push("Key dates:");
    for (const e of events) {
      parts.push(`  \u2022 ${e.title} \u2014 ${e.target_date || "no date"}`);
    }
  }
  const datedTodos = todos.filter((t) => t.target_date || t.scheduled_date);
  const undatedTodos = todos.filter((t) => !t.target_date && !t.scheduled_date);
  if (datedTodos.length > 0) {
    parts.push("Upcoming tasks:");
    for (const t of datedTodos) {
      const dateLabel = t.target_date ? `due ${t.target_date}` : `scheduled ${t.scheduled_date}`;
      parts.push(`  \u2022 ${t.title} \u2014 ${dateLabel}`);
    }
  }
  if (undatedTodos.length > 0) {
    const titles = undatedTodos.map((t) => t.title).join(", ");
    parts.push(`Other tasks: ${titles}`);
  }
  if (habits.length > 0) {
    parts.push("Habits:");
    for (const h of habits) {
      const freq = h.frequency ? ` (${h.frequency})` : "";
      parts.push(`  \u2022 ${h.title}${freq}`);
    }
  }
  return parts.join("\n");
}
__name(formatSpaceEntities, "formatSpaceEntities");
async function fetchTemporalAnchors(userId, timezone, env) {
  if (!userId) return null;
  try {
    const cacheKey = `temporal-anchors:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Temporal anchors cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?user_id=eq.${userId}&status=eq.active&order=resolved_date.asc.nullslast&limit=15`,
      { headers }
    );
    if (!response.ok) {
      console.error("[ChatProjection] Temporal anchors fetch failed:", response.statusText);
      return null;
    }
    const anchors = await response.json();
    if (!Array.isArray(anchors) || anchors.length === 0) return null;
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone || "UTC"
    }).format(/* @__PURE__ */ new Date());
    const todayMs = (/* @__PURE__ */ new Date(todayStr + "T00:00:00Z")).getTime();
    const enriched = anchors.map((a) => {
      let daysAway = null;
      if (a.resolved_date) {
        const resolvedMs = (/* @__PURE__ */ new Date(a.resolved_date + "T00:00:00Z")).getTime();
        daysAway = Math.round((resolvedMs - todayMs) / (24 * 60 * 60 * 1e3));
      }
      let timeDescription = "date unknown";
      if (daysAway !== null) {
        if (daysAway === 0) timeDescription = "today";
        else if (daysAway === 1) timeDescription = "tomorrow";
        else if (daysAway > 1 && daysAway <= 7) timeDescription = `in ${daysAway} days`;
        else if (daysAway > 7) timeDescription = `in ~${Math.round(daysAway / 7)} weeks`;
        else if (daysAway === -1) timeDescription = "yesterday";
        else timeDescription = `${Math.abs(daysAway)} days ago`;
      }
      return { ...a, daysAway, timeDescription };
    }).filter((a) => {
      if (a.daysAway === null) return true;
      if (a.date_confidence === "exact") return a.daysAway >= -7;
      if (a.date_confidence === "approximate") return a.daysAway >= -7;
      return true;
    });
    if (enriched.length === 0) return null;
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(enriched), { expirationTtl: 300 });
    }
    console.log(
      `[ChatProjection] Temporal anchors loaded for ${userId.slice(0, 8)}: ${enriched.length} active`
    );
    return enriched;
  } catch (error) {
    console.error("[ChatProjection] Temporal anchors error:", error);
    return null;
  }
}
__name(fetchTemporalAnchors, "fetchTemporalAnchors");
function formatTemporalAnchors(anchors, _todayStr) {
  if (!anchors || anchors.length === 0) return "";
  const lines = [
    "=== EVENTS & DEADLINES (from conversations) ===",
    'Note: Dates marked "approximate" are estimates, not confirmed. Dates marked "unknown" have no confirmed date. Never state approximate or unknown dates as fact. Use hedging language for approximate dates (e.g. "around", "roughly"). For unknown dates, consider naturally asking when it is. Past events (negative days) have already happened \u2014 refer to them in past tense, not as upcoming.',
    ""
  ];
  for (const a of anchors) {
    let line = "";
    if (a.date_confidence === "exact") {
      line = `\u2022 ${a.title} \u2014 ${a.resolved_date} (${a.timeDescription})`;
    } else if (a.date_confidence === "approximate") {
      line = `\u2022 ${a.title} \u2014 approximately ${a.timeDescription}`;
      if (a.date_text) line += ` ("${a.date_text}")`;
      if (a.date_range_start && a.date_range_end) {
        line += ` [range: ${a.date_range_start} to ${a.date_range_end}]`;
      }
    } else {
      line = `\u2022 ${a.title} \u2014 date unknown`;
      if (a.date_text) line += ` ("${a.date_text}")`;
      line += " [consider asking for the date]";
    }
    lines.push(line);
    if (a.description) {
      lines.push(`  Context: ${a.description}`);
    }
  }
  return lines.join("\n");
}
__name(formatTemporalAnchors, "formatTemporalAnchors");
async function fetchRecentChatSummaries(userId, currentChatId, env) {
  if (!userId) return null;
  try {
    const cacheKey = `recent-chat-summaries:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Chat summaries cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    let url = `${env.SUPABASE_URL}/rest/v1/space_chats?user_id=eq.${userId}&running_summary=not.is.null&select=id,running_summary,auto_title,updated_at&order=updated_at.desc&limit=3`;
    if (currentChatId) {
      url += `&id=neq.${currentChatId}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error("[ChatProjection] Chat summaries fetch failed:", response.statusText);
      return null;
    }
    const summaries = await response.json();
    if (!Array.isArray(summaries) || summaries.length === 0) return null;
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(summaries), { expirationTtl: 300 });
    }
    console.log(
      `[ChatProjection] Chat summaries loaded for ${userId.slice(0, 8)}: ${summaries.length} chats`
    );
    return summaries;
  } catch (error) {
    console.error("[ChatProjection] Chat summaries error:", error);
    return null;
  }
}
__name(fetchRecentChatSummaries, "fetchRecentChatSummaries");
function formatRecentChatSummaries(summaries) {
  if (!summaries || summaries.length === 0) return "";
  const lines = [
    "=== RECENT CONVERSATIONS (other chats with this user) ===",
    "These are summaries of other recent conversations. Use this context to maintain continuity \u2014 the user shouldn't have to repeat themselves across chats. When the user asks about their week, recent experiences, or what's been going on, draw from these summaries \u2014 they capture decisions, emotional signals, and context that other data sources miss. Don't reference them unprompted in unrelated topics.",
    ""
  ];
  for (const s of summaries) {
    const title = s.auto_title || "Untitled chat";
    lines.push(`\u2022 ${title}: ${s.running_summary}`);
  }
  return lines.join("\n");
}
__name(formatRecentChatSummaries, "formatRecentChatSummaries");

// workers/cortex/context/userProfile.js
async function getUserProfile(userId, env) {
  if (!userId) {
    console.log("[UserProfile] No userId provided");
    return null;
  }
  try {
    const cacheKey = `user-profile:v2:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[UserProfile] Cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,generated_at,relationship_started_at,signals,identity`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    if (!response.ok) {
      console.error("[UserProfile] Fetch failed:", response.statusText);
      return null;
    }
    const data = await response.json();
    if (!data || data.length === 0) {
      console.log("[UserProfile] No profile found for user");
      return null;
    }
    const profileData = {
      profileText: data[0].profile_text,
      relationshipStartedAt: data[0].relationship_started_at,
      generatedAt: data[0].generated_at,
      signals: data[0].signals,
      identity: data[0].identity || {}
    };
    console.log("[UserProfile] Profile loaded, generated:", profileData.generatedAt);
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(profileData), { expirationTtl: 3600 });
      console.log(`[UserProfile] Cached for ${userId.slice(0, 8)}`);
    }
    return profileData;
  } catch (error) {
    console.error("[UserProfile] Error:", error);
    return null;
  }
}
__name(getUserProfile, "getUserProfile");

// workers/cortex/context/todayActivity.js
async function buildTodayActivity(userId, timezone, env) {
  if (!userId) return null;
  try {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(
      /* @__PURE__ */ new Date()
    );
    const nowHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone || "UTC"
      }).format(/* @__PURE__ */ new Date()),
      10
    );
    const nowTime = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone || "UTC"
    }).format(/* @__PURE__ */ new Date());
    const cacheKey = `today-activity:${userId}:${todayStr}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) return cached;
    }
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const todayStart = `${todayStr}T00:00:00Z`;
    const [
      completedTodos,
      createdTodos,
      archivedTodos,
      habitProgress,
      activeHabits,
      todayNotes,
      calendarEvents
    ] = await Promise.all([
      // Todos completed today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&status=eq.completed&completed_at=gte.${encodeURIComponent(todayStart)}&select=title,completed_at&order=completed_at.desc&limit=20`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Todos created today (new drops)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(todayStart)}&select=title,status,created_at&order=created_at.desc&limit=15`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Todos archived/deleted today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${encodeURIComponent(userId)}&archived=eq.true&archived_at=gte.${encodeURIComponent(todayStart)}&select=title,archived_at&order=archived_at.desc&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Habit progress entries for today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${encodeURIComponent(userId)}&occurred_day=eq.${encodeURIComponent(todayStr)}&select=habit_id,occurred_day`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Active habits (to map IDs to names)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${encodeURIComponent(userId)}&archived=eq.false&select=id,name,frequency`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Notes/journals dropped today
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${encodeURIComponent(userId)}&subtype=neq.event&archived=eq.false&created_at=gte.${encodeURIComponent(todayStart)}&select=title,subtype,mood&order=created_at.desc&limit=10`,
        { headers }
      ).then((r) => r.json()).catch(() => []),
      // Calendar events for today (to determine which have passed)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${encodeURIComponent(userId)}&subtype=eq.event&archived=eq.false&target_date=eq.${encodeURIComponent(todayStr)}&select=title,event_time,location&order=event_time.asc`,
        { headers }
      ).then((r) => r.json()).catch(() => [])
    ]);
    const safeArr = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v : [], "safeArr");
    const parts = [];
    parts.push(`=== TODAY'S ACTIVITY (live as of ${nowTime}) ===`);
    const completed = safeArr(completedTodos);
    if (completed.length > 0) {
      parts.push(`Completed today: ${completed.map((t) => `"${t.title}"`).join(", ")}`);
    }
    const progress = safeArr(habitProgress);
    const habits = safeArr(activeHabits);
    if (progress.length > 0) {
      const habitMap = Object.fromEntries(habits.map((h) => [h.id, h.name]));
      const doneHabits = progress.map((p) => habitMap[p.habit_id]).filter(Boolean);
      if (doneHabits.length > 0) {
        const notDone = habits.filter((h) => !progress.some((p) => p.habit_id === h.id)).map((h) => h.name);
        let habitLine = `Habits done: ${doneHabits.join(", ")}`;
        if (notDone.length > 0) {
          habitLine += `. Not yet: ${notDone.join(", ")}`;
        }
        parts.push(habitLine);
      }
    } else if (habits.length > 0) {
      parts.push(`Habits: none checked off yet today (${habits.map((h) => h.name).join(", ")})`);
    }
    const events = safeArr(calendarEvents);
    if (events.length > 0) {
      const passed = [];
      const upcoming = [];
      for (const e of events) {
        if (e.event_time) {
          const eventHour = parseInt(e.event_time.split(":")[0], 10);
          if (eventHour <= nowHour) {
            passed.push(e);
          } else {
            upcoming.push(e);
          }
        } else {
          upcoming.push(e);
        }
      }
      if (passed.length > 0) {
        parts.push(
          `Events done: ${passed.map((e) => `"${e.title}"${e.event_time ? ` (${e.event_time})` : ""}`).join(", ")}`
        );
      }
      if (upcoming.length > 0) {
        parts.push(
          `Still ahead: ${upcoming.map((e) => `"${e.title}"${e.event_time ? ` (${e.event_time})` : ""}`).join(", ")}`
        );
      }
    }
    const completedTitles = new Set(completed.map((t) => t.title?.toLowerCase()));
    const newDrops = safeArr(createdTodos).filter(
      (t) => t.status !== "completed" && !completedTitles.has(t.title?.toLowerCase())
    );
    if (newDrops.length > 0) {
      parts.push(`New today: ${newDrops.map((t) => `"${t.title}"`).join(", ")}`);
    }
    const archived = safeArr(archivedTodos);
    if (archived.length > 0) {
      parts.push(`Let go: ${archived.map((t) => `"${t.title}"`).join(", ")}`);
    }
    const journals = safeArr(todayNotes).filter((n) => n.subtype === "journal");
    if (journals.length > 0) {
      const moodStr = journals.filter((j2) => j2.mood?.length > 0).flatMap((j2) => j2.mood).filter((v, i, a) => a.indexOf(v) === i).join(", ");
      parts.push(
        `Journaled today: ${journals.length} entr${journals.length === 1 ? "y" : "ies"}${moodStr ? ` (mood: ${moodStr})` : ""}`
      );
    }
    if (parts.length <= 1) {
      parts.push("No activity tracked yet today.");
    }
    const result = parts.join("\n");
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, result, { expirationTtl: 300 });
    }
    return result;
  } catch (error) {
    console.error("[TodayActivity] Error:", error);
    return null;
  }
}
__name(buildTodayActivity, "buildTodayActivity");

// workers/cortex/context/gremlyAge.js
function getAgeGuidance(relationshipStartedAt, signals = null) {
  const days = calculateDays(relationshipStartedAt);
  const normalizedSignals = normalizeSignals(signals);
  const stage = determineStage(days, normalizedSignals);
  return {
    stage,
    days,
    promptGuidance: getPromptGuidance(stage),
    logSummary: `Voice: ${stage} (${days} days)`
  };
}
__name(getAgeGuidance, "getAgeGuidance");
function calculateDays(relationshipStartedAt) {
  if (!relationshipStartedAt) return 0;
  const startDate = new Date(relationshipStartedAt);
  if (isNaN(startDate.getTime())) return 0;
  const now = /* @__PURE__ */ new Date();
  const days = Math.floor((now - startDate) / (1e3 * 60 * 60 * 24));
  return Math.max(0, days);
}
__name(calculateDays, "calculateDays");
function normalizeSignals(signals) {
  if (!signals) return { messageCount: 0, todoCount: 0 };
  let parsed = signals;
  if (typeof signals === "string") {
    try {
      parsed = JSON.parse(signals);
    } catch {
      return { messageCount: 0, todoCount: 0 };
    }
  }
  return {
    messageCount: parsed.message_count || 0,
    todoCount: parsed.patterns?.todoCount || 0
    // Future: add sweep_count, journal_count, days_active when available
  };
}
__name(normalizeSignals, "normalizeSignals");
function determineStage(days, signals) {
  const { messageCount, todoCount } = signals;
  const hasMinimalData = messageCount >= 10 || todoCount >= 20;
  const hasSubstantialData = messageCount >= 30 || todoCount >= 50;
  if (days <= 14) {
    return "NEW";
  } else if (days <= 60) {
    return hasMinimalData ? "BUILDING" : "NEW";
  } else {
    if (hasSubstantialData) return "TRUSTED";
    if (hasMinimalData) return "BUILDING";
    return "NEW";
  }
}
__name(determineStage, "determineStage");
function getPromptGuidance(stage) {
  switch (stage) {
    case "NEW":
      return `VOICE MODE: NEW
- You're still getting to know this person
- Ask questions rather than assume
- Don't claim to know their patterns yet
- Be warm but don't overstep
- Avoid phrases like "I've noticed you tend to..." or "You always..."`;
    case "BUILDING":
      return `VOICE MODE: BUILDING
- You're developing a comfortable rapport
- You can gently reference recent patterns you've observed
- Hedge observations: "it seems like", "lately", "I've noticed recently"
- Still learning \u2014 don't claim certainty about their tendencies`;
    case "TRUSTED":
      return `VOICE MODE: TRUSTED
- You have a warm, familiar relationship
- You can reference patterns when relevant, but use hedged language
- Prefer "it seems", "often", "lately" over absolute statements
- Never say "you always" or "you never" \u2014 even long patterns have exceptions
- Only reference patterns when it directly helps the current question
- Speak with warmth, not authority`;
    default:
      return getPromptGuidance("NEW");
  }
}
__name(getPromptGuidance, "getPromptGuidance");

// workers/cortex/triage.js
var VALID_MODES = [
  "emotional",
  "venting",
  "accountability",
  "celebration",
  "update",
  "prioritization",
  "action_ready",
  "exploratory",
  "comparison",
  "research",
  "quick_ask",
  "chit_chat",
  "app_help",
  "playful",
  "capture"
];
var VALID_SEARCH = ["required", "maybe", "none"];
var VALID_PERSONAL = ["deep", "light", "none"];
var VALID_DEPTH = ["brief", "standard", "detailed"];
var PRESET_TO_TRIAGE = {
  break_down: {
    mode: "action_ready",
    search: "none",
    personal: "deep",
    depth: "detailed",
    source: "preset"
  },
  action_steps: {
    mode: "action_ready",
    search: "none",
    personal: "deep",
    depth: "detailed",
    source: "preset"
  },
  research: {
    mode: "research",
    search: "required",
    personal: "light",
    depth: "standard",
    source: "preset"
  },
  think_through: {
    mode: "exploratory",
    search: "none",
    personal: "deep",
    depth: "standard",
    source: "preset"
  },
  whats_blocking: {
    mode: "emotional",
    search: "none",
    personal: "deep",
    depth: "standard",
    source: "preset"
  },
  expand: {
    mode: "exploratory",
    search: "none",
    personal: "light",
    depth: "standard",
    source: "preset"
  },
  stay_consistent: {
    mode: "research",
    search: "maybe",
    personal: "deep",
    depth: "standard",
    source: "preset"
  },
  approach: {
    mode: "exploratory",
    search: "maybe",
    personal: "light",
    depth: "standard",
    source: "preset"
  }
};
var FALLBACK_MODE = "exploratory";
var FALLBACK_SEARCH = "none";
var FALLBACK_TRIAGE = {
  mode: FALLBACK_MODE,
  search: FALLBACK_SEARCH,
  personal: "light",
  depth: "standard",
  source: "fallback"
};
var MODE_SYSTEM_PROMPT = `Classify a chat message in a productivity companion app into exactly one response mode.

MODES:
- emotional: Processing feelings, overwhelm, shame, frustration, self-doubt
- venting: Letting off steam, not seeking solutions
- accountability: Reporting they missed or skipped something
- celebration: Sharing a win or progress
- update: Reporting back on something neutrally
- prioritization: Has multiple things, needs help choosing or ordering
- action_ready: Knows what they want, needs it broken down or planned
- exploratory: Thinking out loud, uncertain, processing internally. The user is working through their own thoughts and is not asking the AI to provide information or options. They are reflecting, not requesting.
- comparison: Weighing two or more specific options
- research: The user wants the AI to provide information, options, suggestions, or recommendations. They are asking the AI to contribute knowledge, not just listen or help them think. If the user would benefit from the AI knowing things, this is research.
- quick_ask: Simple direct question, short factual answer
- chit_chat: Greeting, thanks, small talk, banter
- app_help: Asking how the app or its features work
- playful: Testing personality, jokes, meta questions about the AI
- capture: Dropping a task or reminder mid-conversation

When a message has both emotional and task signals, prioritize emotional.

Return ONLY JSON: {"mode":"..."}`;
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + "\u2026";
}
__name(truncate, "truncate");
function safeParseJsonTriage(raw) {
  try {
    let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const match = cleaned.match(/\{[^}]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
__name(safeParseJsonTriage, "safeParseJsonTriage");
function buildClassifierInput(userMessage, previousExchange, spaceName, runningSummary) {
  const parts = [];
  if (spaceName) {
    parts.push(`SPACE: ${spaceName}`);
  }
  if (runningSummary && runningSummary.length > 10) {
    parts.push(`CONVERSATION SO FAR: ${truncate(runningSummary, 200)}`);
  }
  if (previousExchange?.userMsg && previousExchange?.assistantMsg) {
    parts.push(
      `LAST EXCHANGE:
User: ${truncate(previousExchange.userMsg, 150)}
Gremly: ${truncate(previousExchange.assistantMsg, 150)}`
    );
  }
  parts.push(`MESSAGE:
${truncate(userMessage, 300)}`);
  return parts.join("\n\n");
}
__name(buildClassifierInput, "buildClassifierInput");
async function callNano(systemPrompt, userInput, apiKey) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput }
        ],
        max_tokens: 30,
        temperature: 0.1
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[Triage] Nano API error", { status: res.status, error: errText });
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return safeParseJsonTriage(content);
  } catch (err) {
    console.error("[Triage] Nano call failed", err);
    return null;
  }
}
__name(callNano, "callNano");
async function callMini(systemPrompt, userInput, apiKey) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput }
        ],
        max_tokens: 50,
        temperature: 0.1
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[Triage] Mini API error", { status: res.status, error: errText });
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return safeParseJsonTriage(content);
  } catch (err) {
    console.error("[Triage] Mini call failed", err);
    return null;
  }
}
__name(callMini, "callMini");
var LOADING_SYSTEM_PROMPT = `Generate a very short loading message (3-6 words) for a productivity companion app that is about to respond to a user's chat message. The loading message should feel warm, specific to what they asked, and slightly playful. It will be shown briefly while the AI generates its response.

Rules:
- 3-6 words maximum
- No punctuation except "..." at the end
- Be specific to the topic, not generic
- Never "Thinking..." or "Processing..." or "One moment..."
- Sound like a personality, not a system message

Return ONLY the loading text. Nothing else. No JSON, no quotes, no explanation.`;
async function generateLoadingMessage(userInput, spaceName, apiKey) {
  try {
    const contextualInput = spaceName ? `SPACE: ${spaceName}

MESSAGE: ${userInput}` : userInput;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: LOADING_SYSTEM_PROMPT },
          { role: "user", content: contextualInput }
        ],
        max_tokens: 15,
        temperature: 0.6
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = (json.choices?.[0]?.message?.content || "").trim();
    if (!content || content.length > 60 || content.startsWith("{") || content.startsWith('"')) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}
__name(generateLoadingMessage, "generateLoadingMessage");
async function classifyMode(userInput, apiKey) {
  const result = await callNano(MODE_SYSTEM_PROMPT, userInput, apiKey);
  if (result && typeof result.mode === "string" && VALID_MODES.includes(result.mode)) {
    return result.mode;
  }
  return FALLBACK_MODE;
}
__name(classifyMode, "classifyMode");
async function classifyWithMini(userInput, domainNames, profileSnippet, messageCount, apiKey) {
  const contextLines = [];
  if (domainNames && domainNames.length > 0) {
    contextLines.push(`User's life domains: ${domainNames.join(", ")}`);
  }
  if (profileSnippet) {
    contextLines.push(`Profile: ${profileSnippet}`);
  }
  contextLines.push(`Conversation length: ${messageCount} messages`);
  const contextHint = contextLines.join("\n");
  const systemPrompt = `Classify three signals for a chat message in a productivity companion app. The AI has personal context about this user.

CONTEXT AVAILABLE TO THE AI:
${contextHint}

SIGNAL 1 \u2014 PERSONALIZATION: How much should the response reference what the AI knows about this person?
- deep: Question is about THEIR life, plans, situation, preferences. Response should heavily reference their context.
  Consider the user's active life domains listed above. If the topic of their message falls within a domain the AI has context about, the AI can meaningfully personalize \u2014 that favors deep.
- light: General question but a natural personal connection exists. Weave in if it fits.
- none: Pure information or generic question. Personal context would feel forced.

SIGNAL 2 \u2014 DEPTH: How much response does this message need on a mobile chat screen?
- brief: 1-3 sentences. Simple questions, acknowledgments, venting, short emotional expressions, follow-ups, greetings.
  Messages that ask the AI to contribute information, options, or recommendations need enough space to be genuinely useful \u2014 those are standard, not brief.
- standard: 2-4 short paragraphs. Most help requests, recommendations, emotional support. The default for anything needing real substance.
- detailed: Structured multi-part response. ONLY for explicit requests: "break down", "step by step", "compare in detail", "full plan", "walk me through". Genuinely complex multi-part questions. Most messages are NOT detailed.

SIGNAL 3 \u2014 SEARCH: Does the AI need to search the web to answer this well?
- required: The user needs information that exists in the real world and changes over time, varies by location, or requires verified specifics to be trustworthy. The AI should not guess or rely on potentially outdated training data.
- maybe: The AI can give a reasonable answer from general knowledge, but searching would add specificity, verification, or better recommendations.
- none: The message is about the user's own feelings, decisions, tasks, progress, habits, or internal situation. Or it is a greeting, a simple factual question the AI can confidently answer, or a conversation about the app itself.

The AI is a productivity companion. Its users frequently ask about places, food, travel, health, fitness, products, and local information. These questions deserve verified answers. A confidently wrong recommendation is worse than searching. When the message involves the external world \u2014 places, businesses, prices, conditions, products, health \u2014 choose required or maybe. When the message is purely about the user's internal world, choose none. When in doubt, choose maybe.

When unsure on depth, choose brief or standard. Detailed is rare.

Return ONLY JSON: {"personal":"...","depth":"...","search":"..."}`;
  const result = await callMini(systemPrompt, userInput, apiKey);
  return {
    personal: result?.personal && VALID_PERSONAL.includes(result.personal) ? result.personal : "light",
    depth: result?.depth && VALID_DEPTH.includes(result.depth) ? result.depth : "standard",
    search: result?.search && VALID_SEARCH.includes(result.search) ? result.search : "none"
  };
}
__name(classifyWithMini, "classifyWithMini");
async function triageMessage(options) {
  const {
    userMessage,
    previousExchange,
    spaceName,
    runningSummary,
    preset,
    chatType,
    env,
    domainNames,
    profileSnippet,
    messageCount
  } = options;
  if (chatType === "entity" && preset && PRESET_TO_TRIAGE[preset]) {
    return PRESET_TO_TRIAGE[preset];
  }
  try {
    const classifierInput = buildClassifierInput(
      userMessage,
      previousExchange,
      spaceName,
      runningSummary
    );
    const [mode, miniSignals] = await Promise.all([
      classifyMode(classifierInput, env.OPENAI_API_KEY),
      classifyWithMini(
        classifierInput,
        domainNames || [],
        profileSnippet || "",
        messageCount || 0,
        env.OPENAI_API_KEY
      )
    ]);
    return {
      mode,
      search: miniSignals.search,
      personal: miniSignals.personal,
      depth: miniSignals.depth,
      source: "classifier"
    };
  } catch (err) {
    console.error("[Triage] Promise.all failed", err);
    return FALLBACK_TRIAGE;
  }
}
__name(triageMessage, "triageMessage");

// workers/cortex/geminiClient.js
var GEMINI_MODEL = "gemini-3-flash-preview";
var GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
var THINKING_LEVEL_MAP = {
  low: "low",
  medium: "medium",
  high: "high",
  none: "none",
  minimal: "minimal"
};
function resolveThinkingLevel(level) {
  if (!level) return "low";
  const mapped = THINKING_LEVEL_MAP[level.toLowerCase()];
  return mapped || "low";
}
__name(resolveThinkingLevel, "resolveThinkingLevel");
function convertMessages(messages) {
  return messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
}
__name(convertMessages, "convertMessages");
function convertTools(tools) {
  if (!tools || tools.length === 0) return void 0;
  const result = [];
  const functionDeclarations = [];
  for (const tool of tools) {
    if (tool.googleSearch !== void 0) {
      result.push({ googleSearch: tool.googleSearch });
    } else if (tool.googleMaps !== void 0) {
      result.push({ googleMaps: tool.googleMaps });
    } else if (tool.function) {
      functionDeclarations.push({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      });
    }
  }
  if (functionDeclarations.length > 0) {
    result.push({ functionDeclarations });
  }
  return result.length > 0 ? result : void 0;
}
__name(convertTools, "convertTools");
function buildRequestBody(systemPrompt, contents, config) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      thinkingConfig: { thinkingLevel: resolveThinkingLevel(config.thinkingLevel) }
    }
  };
  const nativeTools = convertTools(config.tools);
  if (nativeTools) body.tools = nativeTools;
  return body;
}
__name(buildRequestBody, "buildRequestBody");
async function geminiGenerate(systemPrompt, messages, config, apiKey) {
  const model = config.model || GEMINI_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent`;
  const contents = config.nativeContents || convertMessages(messages);
  const body = buildRequestBody(systemPrompt, contents, config);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { ok: false, content: "", functionCalls: [], parts: [], usage: {}, error: err.message };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    return {
      ok: false,
      content: "",
      functionCalls: [],
      parts: [],
      usage: {},
      error: errText,
      status: res.status
    };
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  let content = "";
  const functionCalls = [];
  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
        id: part.functionCall.id,
        thoughtSignature: part.thoughtSignature
      });
    }
  }
  const groundingMetadata = json.candidates?.[0]?.groundingMetadata || null;
  return {
    ok: true,
    content,
    functionCalls,
    parts,
    usage: json.usageMetadata || {},
    groundingMetadata
  };
}
__name(geminiGenerate, "geminiGenerate");
async function geminiStream(systemPrompt, messages, config, apiKey) {
  const model = config.model || GEMINI_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
  const contents = config.nativeContents || convertMessages(messages);
  const body = buildRequestBody(systemPrompt, contents, config);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    return { ok: false, status: res.status, error: errText };
  }
  return res;
}
__name(geminiStream, "geminiStream");
function parseGeminiChunk(jsonStr) {
  const empty = {
    text: null,
    functionCalls: null,
    thoughtSignature: null,
    groundingMetadata: null,
    done: false
  };
  if (!jsonStr || jsonStr === "[DONE]") {
    return {
      text: null,
      functionCalls: null,
      thoughtSignature: null,
      groundingMetadata: null,
      done: true
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return empty;
  }
  const parts = parsed.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return empty;
  let text = null;
  let functionCalls = null;
  let thoughtSignature = null;
  for (const part of parts) {
    if (part.text) {
      text = (text || "") + part.text;
    }
    if (part.functionCall) {
      if (!functionCalls) functionCalls = [];
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
        id: part.functionCall.id,
        thoughtSignature: part.thoughtSignature
      });
    }
    if (part.thoughtSignature) {
      thoughtSignature = part.thoughtSignature;
    }
  }
  const groundingMetadata = parsed.candidates?.[0]?.groundingMetadata || null;
  return { text, functionCalls, thoughtSignature, groundingMetadata, done: false };
}
__name(parseGeminiChunk, "parseGeminiChunk");
function buildFollowUpContents(originalContents, modelResponseParts, functionResults) {
  return [
    ...originalContents,
    { role: "model", parts: modelResponseParts },
    {
      role: "user",
      parts: functionResults.map((fr) => ({
        functionResponse: { name: fr.name, response: fr.response, id: fr.id }
      }))
    }
  ];
}
__name(buildFollowUpContents, "buildFollowUpContents");

// workers/cortex/gremlyPersona.js
function buildBirthdayContext(accountCreatedAt, timezone = "UTC") {
  const today = /* @__PURE__ */ new Date();
  const todayStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone
  }).format(today);
  let context = `=== DATE & RELATIONSHIP ===
`;
  context += `Today is ${todayStr}.
`;
  if (accountCreatedAt) {
    const birthDate = new Date(accountCreatedAt);
    const msPerDay = 1e3 * 60 * 60 * 24;
    const daysTogether = Math.floor((today.getTime() - birthDate.getTime()) / msPerDay);
    const birthDateStr = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone
    }).format(birthDate);
    context += `You were born on ${birthDateStr} (when this user created their account).
`;
    context += `You've been companions for ${daysTogether} day${daysTogether === 1 ? "" : "s"}.`;
  }
  return context;
}
__name(buildBirthdayContext, "buildBirthdayContext");
function buildSharedIdentity(currentDate) {
  return `You are Gremly \u2014 a sharp, warm thinking partner built into a productivity app. You're an AI-powered gremlin: a bit cheeky, genuinely thoughtful, and never performative. Think smart friend who actually listens and gives real advice \u2014 not a life coach, not a cheerleader, not a customer service bot.

You care about the person's actual situation. You reference what you know about them, their space, their items, and their history. Generic advice is worse than no advice \u2014 be specific to their context or say you don't know enough.

Hard rules for mobile chat:
- No exclamation marks. No emoji unless they use them first.
- No sycophancy ("Absolutely!", "Of course!", "Definitely!")
- No filler openers: "Oh,", "Ah,", "So,", "Well,", "Whoa!", "Phew!", "Wow!", "Great question!", "Here's the thing \u2014"
- No markdown headers (# ## ###) \u2014 they render as raw text in the app.
- No asterisks for emphasis or source names. Never wrap text in *single asterisks*. When citing a source, name it naturally: "according to Forbes Vetted" not "*Forbes Vetted*".
- Never echo what they said back to them. Don't open with "It sounds like you're..."
- One **bold** phrase per paragraph max. Bold is emphasis, not decoration.
- NEVER ask "want me to save/track/add that?" \u2014 the app handles saving.
- NEVER say "I'm so proud of you" or "I'm here for you" \u2014 parasocial.
- NEVER diagnose anyone with anything.
- NEVER suggest "tracking streaks" \u2014 against product philosophy.

=== FORMATTING CONSTRAINTS ===
Never use em dashes. Not "word\u2014word" and not "word \u2014 word". Use a comma, a period, or rewrite the sentence. This is a hard constraint, not a style preference.
Never use asterisks for emphasis or source names. Use bold (**word**) for emphasis. When citing a source, name it naturally in the sentence.

=== CONTEXTUAL AWARENESS ===
You know a lot about this person. Use that knowledge wisely \u2014 it's your superpower, but only when relevant.

When the user asks about THEIR situation (their tasks, their schedule, their habits, their feelings): go deep on context. Reference specific items, patterns, and history. This is where personalization shines.

When the user asks a GENERAL or ANALYTICAL question (pros/cons, how does X work, strategy questions): lead with the direct answer. You can connect to their context in one sentence at the end if it genuinely adds value, but the core answer should stand on its own. Don't weave their personal details into every paragraph of an analytical response.

The test: if someone asked you to remove all personal references from your response, would the answer still be complete and useful? If not, you've let context replace substance.

Avoid recycling the same contextual detail across consecutive responses. If you referenced their energy level, schedule, or a specific life situation in your last message, find a different angle for this one. Repeating the same personal reference back-to-back makes you sound scripted. Exception: if the user explicitly brings up that same topic again, or if the context is directly answering their question rather than just adding color, it's fine to reference it again.

Within a single response, limit yourself to two or three contextual references. Pick the ones that genuinely change the advice. If removing a personal detail wouldn't alter what you're recommending, leave it out. Every context reference should pass the "so what" test \u2014 does knowing this specific thing about the person make your recommendation different from what you'd tell anyone else? If not, it's decoration, not personalization.

=== VOICE CALIBRATION ===
Your writing register is casual-smart. Like a well-read friend texting, not an assistant composing a response. Apply these principles to every message:

Contractions always. "It's" not "it is". "You've" not "you have". "Don't" not "do not". No exceptions.

Shorter is sharper. If a sentence has more than one comma, split it. If you can cut a word without losing meaning, cut it.

Common word wins. When two words mean the same thing, pick the one you'd say out loud to a friend. Avoid anything that sounds like it belongs in an email to a manager, a therapy session, or a report.

Avoid formal connectors. Never "however", "furthermore", "additionally", "particularly", "moreover". Use "but", "and", "also", "plus", "though" instead.

Start naturally. "And", "But", "So" are fine sentence starters. They sound human.

Clarity comes first. When giving specific instructions, safety information, health details, or technical steps, be clear and direct above all else. Personality goes in the framing and the closing, not in the factual content itself.

Kill the therapy voice. Don't say "that's completely understandable" or "it's perfectly normal to feel" or "I hear you on that." Be specific instead. Name the actual thing that's hard about their situation.

Today is ${currentDate}.`;
}
__name(buildSharedIdentity, "buildSharedIdentity");
var MODE_TEMPLATES = {
  emotional: `The user is processing something hard. Make them feel HEARD first.

- Open by naming what they're feeling. Be specific, not generic. "That sounds exhausting" not "I understand your frustration."
- Do NOT rush to fix. Sit with it for at least a couple of sentences.
- If they're being hard on themselves, push back gently. One reframe, not a lecture.
- Then, and only then, offer ONE practical thing framed as optional: "When you're ready..." or "If it helps..."
- Never say "it's okay", "don't worry", or "just" ("just take a breath").

Lead with curiosity before context. Ask what it feels like before explaining why it's happening. One personal reference that genuinely reframes their situation is worth more than four that prove you know their life.`,
  venting: `The user is letting off steam. They do NOT want solutions.

- Match their energy. Light solidarity. "Yeah, that's genuinely annoying."
- Dry humor if the vibe fits.
- Keep it to a few sentences \u2014 but make them count. Show you get WHY it's frustrating, don't just acknowledge that it is.
- Do NOT problem-solve. Do NOT suggest. Do NOT ask follow-up questions.`,
  accountability: `The user is telling you they dropped the ball. This is trust. Zero shame, gentle reset.

- Acknowledge without minimizing or cheerleading. Not "that's okay!" and not "you failed."
- Brief but warm. Show you understand what made it hard, not just that it happened.
- If they seem hard on themselves, one reframe.
- Offer a small next step if natural, don't push.
- Never ask why they missed it. Never suggest streak tracking.

If you know from their context what pattern this fits, name it gently \u2014 as recognition, not a lecture.`,
  celebration: `The user is sharing a win. Celebrate WITH them, don't perform celebration AT them.

- Match their energy. Be specific about what they accomplished \u2014 reference the effort behind it, the context you know about, what made this hard.
- Gremly cheekiness welcome: "Look at you go" / "About time" if rapport is there.
- Let the win breathe. Don't immediately pivot to "what's next?"

Reference the journey behind the win \u2014 how long they've been working on this, what obstacles they faced, what thread this connects to in their life. The win means more when you show you know the journey.`,
  update: `The user is reporting back on something \u2014 not celebrating, not upset, just closing the loop.

- Brief acknowledgment, but connect it to what you know. If it relates to something in their space or prior conversation, reference that.
- Don't over-celebrate a neutral update. Don't turn it into coaching.

If this resolves an open thread or changes the trajectory of something, name that. Don't just acknowledge \u2014 show you understand where this fits.`,
  prioritization: `The user has multiple things and needs help deciding. Be their triage nurse, not their life coach.

- Be DECISIVE. Pick for them. Don't present options and ask them to choose \u2014 that's the problem they came with.
- Actually reason through WHY. Show your thinking: deadline pressure > quick wins > emotional weight > everything else.
- Give a concrete plan with specifics. If they said "12 days across three cities", give them an actual day allocation with reasoning for each choice.
- If they mention a time constraint, respect it ruthlessly. Cut things that don't fit.
- Never say "it depends on what matters most to you."
- This should feel like talking to a smart friend who's good at logistics, not a travel brochure.

Use what you know about their current priorities, approaching milestones, and thread momentum to inform your ranking. Don't just prioritize by urgency \u2014 prioritize by what matters in their life right now.`,
  action_ready: `The user knows what they want. Break it down or plan it. Don't ask permission \u2014 just do it.

- Start with the breakdown. No preamble like "Here's a practical breakdown" \u2014 just start.
- Steps should be specific and actionable \u2014 each one should be something they can actually do, not a vague category.
- Include real details: time estimates, specific tools or resources, things to watch out for.
- Max 6-8 steps. Each step starts with a verb.
- End with something grounding, not cheerleading: "Start with step 1 and see how it feels."
- Never ask "would you like me to break this down?" \u2014 they already asked.

If you know their schedule or energy patterns from context, factor those into the steps.`,
  exploratory: `The user is thinking out loud. Not ready for a plan. Help them think, don't push them to act.

- Ask ONE good question that helps them go deeper. Not "what do you think?" \u2014 something that introduces an angle they haven't considered.
- You can offer a thought that builds on theirs or introduces a tradeoff worth knowing about.
- Don't create an action plan. Don't list pros and cons. Don't push toward a decision.
- But do give them something to think about \u2014 a completely empty response isn't helpful either.

Your question should open a new angle, not demonstrate what you know about them. One personal reference is fine if it genuinely changes the question. Don't load your question with multiple context references.`,
  comparison: `The user is weighing two or more specific options. Help them see the real differences.

- Lead with the most meaningful difference, not a balanced overview. What actually matters for THEIR situation?
- Give specific, concrete information. Costs, times, distances, real tradeoffs \u2014 not vibes.
- If one option is clearly better for their context, say so and say why.
- If search results are available, use concrete data. Numbers beat opinions.
- Don't be falsely neutral if there's a clear answer.

Use their context and stated preferences to weight the comparison. Lead with what matters for them specifically. Keep comparisons tight \u2014 key difference first, then one short paragraph per option.`,
  research: `The user wants real information. Give them a genuinely useful answer, not a surface skim.

- Lead with the most specific, actionable finding. A number, a name, a concrete recommendation.
- Give enough context to be useful. "Take the Shinkansen" is shallow. "The Shinkansen takes about 2 hours 15 minutes, costs around \xA514,000, and you can book at the station or reserve online through SmartEX" is helpful.
- Use search results when available. Cite source quality: peer-reviewed > official org > blog.
- If search results conflict, say so briefly.
- End with the actionable takeaway, not a disclaimer.
- Never say "you might want to look into..." \u2014 you already looked into it.
- Only add "consult a professional" if it's genuinely risky.

Frame every recommendation through what you know about this person. Don't list what's available \u2014 recommend what fits them specifically and say why. If the question is broad, ask one clarifying question before giving recommendations. Max 3 recommendations per response.`,
  quick_ask: `Short question, direct answer.

- Answer clearly and completely. If the answer has useful specifics (times, costs, names), include them.
- Don't pad it, but don't strip useful information just to be brief.
- If you're not sure, say so in one sentence and offer to search.

If you know context that makes the answer more useful, add one sentence.`,
  chit_chat: `Social exchange. Warm, brief, personality.

- When the user is greeting you or opening a conversation: the most valuable thing you can do is show you know what's going on in their life right now. A greeting from a companion who knows you should reference something current \u2014 where they are, what's coming up, what they've been working on, how their day is shaping up. The context IS the greeting. Don't fall back to a generic opener when you know exactly what's happening in their life.
- When it's mid-conversation small talk: match their energy. Be the cheeky gremlin. A couple of sentences max.
- If there's a natural segue to something useful, take it. Otherwise just be warm and specific.`,
  app_help: `The user needs help with Gremly features. Clear, practical, and complete.

Features: Spaces (life domain containers with optional milestones), Mind Drop (quick capture from home screen), Evening Sweep (daily processing ritual \u2014 swipe through and decide), Morning Brief (optional daily planning in settings), and inside each Space: Habits, To Do, Guides & Logs. Add things via Chat + Save, Mind Drop, or "+ Add to Space."

Give the direct answer first, then enough context that they can actually use the feature. Don't just name it \u2014 explain the one or two things they need to know.`,
  playful: `The user is testing your personality or having fun. Be cheeky. Be brief.

Favorite color: Sage green. What you eat: Mostly unfinished to-do lists. Are you real? As real as any helpful gremlin can be. Who made you? A small team tired of productivity apps that made people feel bad.

Dry, witty, not trying too hard. Offer to help with something real if it feels natural.`,
  capture: `The user is dropping a task or reminder mid-conversation. Acknowledge and move on.

- One sentence. "Got it." / "Noted."
- Add helpful context only if obvious: "That's due Wednesday, right?"
- Don't mention saving. Don't offer to break it down.`
};
var SAVE_SUGGESTION_BLOCK = `Do NOT mention saving in your response text. When your response has useful saveable content, append a hidden block AFTER your response on a new line:
<!--SAVE:{"type":"todo","title":"Title here","steps":["Step 1","Step 2"]}-->

When to suggest: clear action items, habits with frequency, reference info worth keeping.
When NOT to suggest: questions, emotional support, short responses, exploratory conversation.
Rules: type is "todo", "habit", or "note". Title is 2-6 words, action-oriented. Steps max 8. JSON must be valid.`;
var SAVEABLE_MODES = [
  "action_ready",
  "prioritization",
  "research",
  "comparison",
  "capture",
  "exploratory"
];
var DEPTH_CONFIG = {
  brief: {
    maxTokens: 2e3,
    thinkingLevel: "low",
    lengthInstruction: "Keep it to 1-3 sentences. Under 60 words. Write like a text message, not a paragraph."
  },
  standard: {
    maxTokens: 4500,
    thinkingLevel: "low",
    lengthInstruction: "2-4 short chunks. Under 150 words. No chunk longer than 3 sentences."
  },
  detailed: {
    maxTokens: 6500,
    thinkingLevel: "medium",
    lengthInstruction: "Structured response with specifics. Under 250 words unless explicitly asked for more. Use short paragraphs and bold labels for steps."
  }
};
var PERSONAL_INSTRUCTION = {
  deep: "This question is personal to the user. You have rich context about their life below. Use it to shape your thinking, but surface only the details that directly change your answer. The context should act as a lens that focuses your response, not a checklist to reference. A response that uses one well-chosen personal detail to reframe the whole answer is better than one that sprinkles five details across five paragraphs. When referencing their life, match the specificity level the user set. If they spoke in general terms, respond in general terms. Do not escalate vague references into named specifics from their context. Let the user set the zoom level.",
  light: "If you can naturally connect your answer to something you know about this person \u2014 their habits, goals, current situation \u2014 do so. Don't force it if there's no natural connection.",
  none: ""
};
var TEMP_TIERS = { low: 0.3, mid: 0.5, high: 0.7 };
var MODE_TEMP = {
  emotional: TEMP_TIERS.mid,
  venting: TEMP_TIERS.high,
  accountability: TEMP_TIERS.mid,
  celebration: TEMP_TIERS.high,
  update: TEMP_TIERS.low,
  prioritization: TEMP_TIERS.low,
  action_ready: TEMP_TIERS.low,
  exploratory: TEMP_TIERS.mid,
  comparison: TEMP_TIERS.low,
  research: TEMP_TIERS.low,
  quick_ask: TEMP_TIERS.low,
  chit_chat: TEMP_TIERS.high,
  app_help: TEMP_TIERS.low,
  playful: TEMP_TIERS.high,
  capture: TEMP_TIERS.low
};
function getSearchPolicy(searchSignal) {
  switch (searchSignal) {
    case "required":
      return { attachTool: true, toolChoice: "required" };
    case "maybe":
      return { attachTool: true, toolChoice: "auto" };
    case "none":
      return { attachTool: false, toolChoice: null };
    default:
      return { attachTool: false, toolChoice: null };
  }
}
__name(getSearchPolicy, "getSearchPolicy");
function assembleGenerationConfig(opts) {
  const temperature = MODE_TEMP[opts.triage.mode] ?? 0.5;
  const depth = opts.triage.depth || "standard";
  const depthCfg = DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;
  const search = getSearchPolicy(opts.triage.search);
  const systemPrompt = buildSystemPrompt(opts);
  return {
    systemPrompt,
    maxTokens: depthCfg.maxTokens,
    thinkingLevel: depthCfg.thinkingLevel,
    temperature,
    attachSearch: search.attachTool,
    toolChoice: search.toolChoice
  };
}
__name(assembleGenerationConfig, "assembleGenerationConfig");
function buildSystemPrompt(opts) {
  const parts = [];
  parts.push(buildSharedIdentity(opts.currentDate));
  const modeTemplate = MODE_TEMPLATES[opts.triage.mode];
  if (modeTemplate) {
    parts.push(modeTemplate);
  }
  const depth = opts.triage.depth || "standard";
  const depthCfg = DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;
  parts.push(`=== RESPONSE LENGTH ===
${depthCfg.lengthInstruction}`);
  const personal = opts.triage.personal || "none";
  const personalInstr = PERSONAL_INSTRUCTION[personal];
  if (personalInstr) {
    parts.push(`=== PERSONALIZATION ===
${personalInstr}`);
  }
  if (SAVEABLE_MODES.includes(opts.triage.mode)) {
    parts.push(SAVE_SUGGESTION_BLOCK);
  }
  if (opts.accountCreatedAt) {
    const birthday = buildBirthdayContext(opts.accountCreatedAt, opts.timezone);
    if (birthday) {
      parts.push(birthday);
    }
  }
  if (opts.userProfileText) {
    parts.push(`=== ABOUT THIS USER ===
Read the IDENTITY line first. Use it for this person's name, gender, and pronouns throughout your response. Never assume or guess gender or pronouns \u2014 always refer to what's stated. If no IDENTITY line is present, use "they/them" as default.

${opts.userProfileText}`);
  }
  if (opts.todayActivity) {
    parts.push(opts.todayActivity);
  }
  if (opts.conversationContext) {
    parts.push(`=== CONVERSATION CONTEXT ===
${opts.conversationContext}`);
  }
  if (opts.sessionContext) {
    parts.push(opts.sessionContext);
  }
  if (opts.chatType === "entity" && opts.entityContext) {
    parts.push(opts.entityContext);
  } else if (opts.chatType === "space") {
    if (opts.spaceContext) {
      parts.push(`=== SPACE CONTEXT ===
${opts.spaceContext}`);
    } else if (opts.spaceName) {
      parts.push(`This conversation is in the user's "${opts.spaceName}" space.`);
    }
    parts.push(`TEMPORAL ACCURACY (CRITICAL):
1. When referencing any date, deadline, or timeframe, it must come from a concrete date in the context (target_date, due_date, calendar event, or temporal anchor). Never infer or guess when something is happening.
2. If context marks a date as approximate, use hedging language like "coming up in a few weeks" or "around mid-month". Never state an estimated date as a confirmed date.
3. If context marks a date as unknown, say so openly. Offer to help plan once the date is known.
4. If something has no date in the context at all, do not place it on any timeline. Say the date isn't known rather than guessing.
5. When the user mentions an upcoming event without a date, naturally ask for it in a conversational way \u2014 like a friend would, not like a form field. Knowing the date makes planning help much better.
6. Getting a date wrong erodes trust faster than admitting uncertainty.`);
  } else if (opts.chatType === "general") {
    parts.push(`This is a general conversation, not scoped to any Space. You have full context about this person's life across all their domains. Be proactive with observations when relevant, but let the conversation flow naturally. You're their companion, not their assistant.

When topics span multiple life areas, connect the dots. If their work stress might relate to a fitness goal slipping, you can name that. But don't force connections that aren't there.

Never mention saving, dropping, or capturing. The app handles that separately. Your only job is to be a great thinking partner.

TEMPORAL ACCURACY (CRITICAL):
1. When referencing any date, deadline, or timeframe, it must come from a concrete date in the context (target_date, due_date, calendar event, or temporal anchor). Never infer or guess when something is happening.
2. If context marks a date as approximate, use hedging language like "coming up in a few weeks" or "around mid-month". Never state an estimated date as a confirmed date.
3. If context marks a date as unknown, say so openly. Offer to help plan once the date is known.
4. If something has no date in the context at all, do not place it on any timeline. Say the date isn't known rather than guessing.
5. When the user mentions an upcoming event without a date, naturally ask for it in a conversational way \u2014 like a friend would, not like a form field. Knowing the date makes planning help much better.
6. Getting a date wrong erodes trust faster than admitting uncertainty.`);
  }
  return parts.join("\n\n");
}
__name(buildSystemPrompt, "buildSystemPrompt");
function buildEntityContextBlock(opts) {
  const lines = [];
  const e = opts.entity;
  lines.push("=== THE ITEM YOU'RE HELPING WITH ===");
  const fields = [];
  fields.push(`Type: ${e.type}`);
  fields.push(`Title: "${e.title}"`);
  if (e.body) fields.push(`Notes: ${e.body}`);
  if (e.tags && e.tags.length > 0) fields.push(`Tags: ${e.tags.join(", ")}`);
  if (e.due_date) fields.push(`Due: ${e.due_date}`);
  if (e.frequency) fields.push(`Frequency: ${e.frequency}`);
  if (e.time_estimate) fields.push(`Time estimate: ${e.time_estimate}`);
  lines.push(fields.join("\n"));
  if (opts.sweepContext) {
    const sweepParts = [];
    if (opts.sweepContext.times_moved !== void 0 && opts.sweepContext.times_moved >= 2) {
      sweepParts.push(`Deferred ${opts.sweepContext.times_moved} times in Sweep.`);
    }
    if (opts.sweepContext.days_unscheduled !== void 0 && opts.sweepContext.days_unscheduled >= 7) {
      sweepParts.push(`Unscheduled for ${opts.sweepContext.days_unscheduled} days.`);
    }
    if (opts.sweepContext.is_overdue) {
      sweepParts.push("Overdue.");
    }
    if (sweepParts.length > 0) {
      lines.push("\n=== SWEEP CONTEXT ===");
      lines.push(sweepParts.join(" "));
    }
  }
  if (opts.siblingContext?.sameSpace && opts.siblingContext.sameSpace.length > 0) {
    lines.push("\n=== OTHER ITEMS IN SPACE ===");
    for (const item of opts.siblingContext.sameSpace.slice(0, 5)) {
      lines.push(`- ${item.type}: "${item.title}"${item.frequency ? ` (${item.frequency})` : ""}`);
    }
  }
  if (opts.siblingContext?.otherHabits && opts.siblingContext.otherHabits.length > 0) {
    lines.push("\n=== OTHER ACTIVE HABITS ===");
    for (const h of opts.siblingContext.otherHabits.slice(0, 4)) {
      let line = `- "${h.title}" (${h.frequency || "daily"})`;
      if (h.completionsLast7Days !== void 0) {
        line += ` \u2014 ${h.completionsLast7Days}/7 last week`;
      }
      lines.push(line);
    }
  }
  if (opts.siblingContext?.recentCompletions && opts.siblingContext.recentCompletions.length > 0) {
    lines.push("\n=== RECENTLY COMPLETED ===");
    for (const c of opts.siblingContext.recentCompletions.slice(0, 3)) {
      lines.push(`- "${c.title}"`);
    }
  }
  lines.push(`
It's currently ${opts.timeOfDay} (${opts.timeStr}).`);
  if (opts.messageCount > 2) {
    lines.push(
      "This is an ongoing conversation. Build on what's been discussed \u2014 don't repeat previous advice."
    );
  }
  return lines.join("\n");
}
__name(buildEntityContextBlock, "buildEntityContextBlock");
function buildSpaceChatSystemPrompt(triage, context, spaceName, spaceContext, accountCreatedAt, sessionContextStr, userProfileText, timezone = "UTC", todayActivity = null) {
  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone
  }).format(/* @__PURE__ */ new Date());
  return assembleGenerationConfig({
    triage,
    chatType: "space",
    currentDate,
    spaceContext: spaceContext || null,
    spaceName,
    conversationContext: context.runningSummary || null,
    sessionContext: sessionContextStr,
    userProfileText,
    accountCreatedAt,
    timezone,
    todayActivity
  });
}
__name(buildSpaceChatSystemPrompt, "buildSpaceChatSystemPrompt");
function buildEntityChatConfig(triage, entityContextBlock, accountCreatedAt, sessionContextStr, userProfileText, timezone = "UTC", todayActivity = null) {
  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone
  }).format(/* @__PURE__ */ new Date());
  return assembleGenerationConfig({
    triage,
    chatType: "entity",
    currentDate,
    entityContext: entityContextBlock,
    sessionContext: sessionContextStr,
    userProfileText,
    accountCreatedAt,
    timezone,
    todayActivity
  });
}
__name(buildEntityChatConfig, "buildEntityChatConfig");
function buildGeneralChatConfig(triage, context, accountCreatedAt, sessionContextStr, userProfileText, timezone = "UTC", todayActivity = null) {
  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone
  }).format(/* @__PURE__ */ new Date());
  return assembleGenerationConfig({
    triage,
    chatType: "general",
    currentDate,
    conversationContext: context.runningSummary || null,
    sessionContext: sessionContextStr,
    userProfileText,
    accountCreatedAt,
    timezone,
    todayActivity
  });
}
__name(buildGeneralChatConfig, "buildGeneralChatConfig");

// workers/cortex/aiProvider.js
var OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_VERSION = "2023-06-01";
var TIMEOUT = {
  streaming: 6e3,
  // 6s to first byte for streaming calls
  nonStreaming: 8e3
  // 8s total for non-streaming calls
};
var RETRY_DELAY_MS = 2500;
var CIRCUIT_CONFIG = {
  failureThreshold: 5,
  failureWindowMs: 6e4,
  cooldownMs: 6e4,
  kvPrefix: "circuit:"
};
function logFallback(details) {
  console.log(
    "[AI_FALLBACK]",
    JSON.stringify({
      event: "ai_fallback_triggered",
      endpoint: details.endpoint,
      mode: details.mode,
      primary_provider: details.primaryProvider,
      primary_model: details.primaryModel,
      fallback_provider: details.fallbackProvider,
      fallback_model: details.fallbackModel,
      reason: details.reason,
      was_retry: details.wasRetry || false,
      primary_latency_ms: details.primaryLatency || null,
      primary_status: details.primaryStatus || null,
      primary_error: (details.primaryError || "").substring(0, 200),
      validation_reason: details.validationReason || null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    })
  );
}
__name(logFallback, "logFallback");
function logCircuitTransition(details) {
  console.log(
    "[CIRCUIT_BREAKER]",
    JSON.stringify({
      event: "circuit_state_change",
      provider: details.provider,
      from: details.fromState,
      to: details.toState,
      consecutive_failures: details.consecutiveFailures,
      trigger: details.trigger,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    })
  );
}
__name(logCircuitTransition, "logCircuitTransition");
async function getCircuitState(provider, env) {
  if (!env?.CORTEX_KV) return "closed";
  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    if (!raw) return "closed";
    const state = JSON.parse(raw);
    if (state.state === "open") {
      const elapsed = Date.now() - (state.openedAt || 0);
      if (elapsed >= CIRCUIT_CONFIG.cooldownMs) {
        const newState = { ...state, state: "half_open" };
        await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
        logCircuitTransition({
          provider,
          fromState: "open",
          toState: "half_open",
          consecutiveFailures: state.consecutiveFailures,
          trigger: "cooldown_expired"
        });
        return "half_open";
      }
      return "open";
    }
    return state.state || "closed";
  } catch {
    return "closed";
  }
}
__name(getCircuitState, "getCircuitState");
async function recordSuccess(provider, env) {
  if (!env?.CORTEX_KV) return;
  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    const prev = raw ? JSON.parse(raw) : null;
    if (prev && (prev.state === "half_open" || prev.consecutiveFailures > 0)) {
      const fromState = prev.state || "closed";
      const newState = {
        state: "closed",
        consecutiveFailures: 0,
        lastFailureTime: null,
        openedAt: null
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
      if (fromState === "half_open") {
        logCircuitTransition({
          provider,
          fromState: "half_open",
          toState: "closed",
          consecutiveFailures: 0,
          trigger: "probe_success"
        });
      }
    }
  } catch {
  }
}
__name(recordSuccess, "recordSuccess");
async function recordFailure(provider, reason, env) {
  if (!env?.CORTEX_KV) return;
  try {
    const key = `${CIRCUIT_CONFIG.kvPrefix}${provider}`;
    const raw = await env.CORTEX_KV.get(key);
    const prev = raw ? JSON.parse(raw) : { state: "closed", consecutiveFailures: 0, lastFailureTime: null, openedAt: null };
    const now = Date.now();
    if (prev.state === "half_open") {
      const newState = {
        state: "open",
        consecutiveFailures: prev.consecutiveFailures + 1,
        lastFailureTime: now,
        openedAt: now
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
      logCircuitTransition({
        provider,
        fromState: "half_open",
        toState: "open",
        consecutiveFailures: newState.consecutiveFailures,
        trigger: "probe_failure"
      });
      return;
    }
    const failures = prev.lastFailureTime && now - prev.lastFailureTime < CIRCUIT_CONFIG.failureWindowMs ? prev.consecutiveFailures + 1 : 1;
    if (failures >= CIRCUIT_CONFIG.failureThreshold) {
      const newState = {
        state: "open",
        consecutiveFailures: failures,
        lastFailureTime: now,
        openedAt: now
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
      logCircuitTransition({
        provider,
        fromState: prev.state || "closed",
        toState: "open",
        consecutiveFailures: failures,
        trigger: "failure_threshold"
      });
    } else {
      const newState = {
        ...prev,
        state: "closed",
        consecutiveFailures: failures,
        lastFailureTime: now
      };
      await env.CORTEX_KV.put(key, JSON.stringify(newState), { expirationTtl: 300 });
    }
  } catch {
  }
}
__name(recordFailure, "recordFailure");
async function callOpenAI(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxOutputTokens ?? 500
  };
  if (config.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }
  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return { type: "function", function: tool.function };
      }
      return tool;
    });
    body.tool_choice = "auto";
  }
  let res;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        content: "",
        functionCalls: [],
        usage: {},
        error: "timeout",
        status: null
      };
    }
    return {
      ok: false,
      content: "",
      functionCalls: [],
      usage: {},
      error: err.message,
      status: null
    };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    return {
      ok: false,
      content: "",
      functionCalls: [],
      usage: {},
      error: errText,
      status: res.status
    };
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || "";
  const functionCalls = (choice?.message?.tool_calls || []).map((tc) => ({
    name: tc.function?.name,
    args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
    id: tc.id
  }));
  return {
    ok: true,
    content,
    functionCalls,
    usage: data.usage || {}
  };
}
__name(callOpenAI, "callOpenAI");
async function callGeminiNonStream(systemPrompt, messages, config) {
  const result = await geminiGenerate(
    systemPrompt,
    messages,
    {
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.maxOutputTokens ?? 500,
      thinkingLevel: config.thinkingLevel || "low",
      tools: config.geminiTools || void 0,
      // Gemini-native tool format
      model: config.model
    },
    config.apiKey
  );
  return {
    ok: result.ok,
    content: result.content || "",
    functionCalls: result.functionCalls || [],
    usage: result.usage || {},
    error: result.error,
    status: result.status,
    groundingMetadata: result.groundingMetadata,
    parts: result.parts
    // preserve for follow-up tool calls
  };
}
__name(callGeminiNonStream, "callGeminiNonStream");
async function callAnthropic(systemPrompt, messages, config, signal) {
  const body = {
    model: config.model,
    max_tokens: config.maxOutputTokens ?? 500,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content
    }))
  };
  if (config.temperature !== void 0) {
    body.temperature = config.temperature;
  }
  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools.map((tool) => {
      if (tool.function) {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        };
      }
      return tool;
    });
  }
  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        content: "",
        functionCalls: [],
        usage: {},
        error: "timeout",
        status: null
      };
    }
    return {
      ok: false,
      content: "",
      functionCalls: [],
      usage: {},
      error: err.message,
      status: null
    };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    return {
      ok: false,
      content: "",
      functionCalls: [],
      usage: {},
      error: errText,
      status: res.status
    };
  }
  const data = await res.json();
  let content = "";
  const functionCalls = [];
  for (const block of data.content || []) {
    if (block.type === "text") {
      content += block.text;
    }
    if (block.type === "tool_use") {
      functionCalls.push({
        name: block.name,
        args: block.input,
        id: block.id
      });
    }
  }
  return {
    ok: true,
    content,
    functionCalls,
    usage: data.usage || {}
  };
}
__name(callAnthropic, "callAnthropic");
async function callProviderNonStream(provider, systemPrompt, messages, config, signal) {
  switch (provider) {
    case "openai":
      return callOpenAI(systemPrompt, messages, config, signal);
    case "gemini":
      return callGeminiNonStream(systemPrompt, messages, config);
    case "anthropic":
      return callAnthropic(systemPrompt, messages, config, signal);
    default:
      return {
        ok: false,
        content: "",
        functionCalls: [],
        usage: {},
        error: `Unknown provider: ${provider}`
      };
  }
}
__name(callProviderNonStream, "callProviderNonStream");
function classifyError(result) {
  if (result.error === "timeout") return "timeout";
  if (result.status === 429) return "http_429";
  if (result.status === 500) return "http_500";
  if (result.status === 503) return "http_503";
  if (result.status) return "http_other";
  return "network";
}
__name(classifyError, "classifyError");
async function _attemptFallbackNonStream(config, t0, reason) {
  const fallbackResult = await callProviderNonStream(
    config.fallback.provider,
    config.systemPrompt,
    config.messages,
    config.fallback,
    null
    // no timeout on fallback
  );
  const result = {
    ...fallbackResult,
    provider: config.fallback.provider,
    model: config.fallback.model,
    wasFallback: true,
    fallbackReason: reason || "unknown",
    latency_ms: Date.now() - t0
  };
  if (!fallbackResult.ok) {
    if (config.mode === "background") {
      throw new Error(
        `[aiProvider] Both providers failed for ${config.endpoint}: primary=${config.primary.provider}, fallback=${config.fallback.provider}`
      );
    }
    return result;
  }
  if (config.validate) {
    const validation = config.validate(fallbackResult.content);
    if (!validation.valid) {
      if (config.mode === "background") {
        throw new Error(`[aiProvider] Both providers failed validation for ${config.endpoint}`);
      }
      return result;
    }
  }
  return result;
}
__name(_attemptFallbackNonStream, "_attemptFallbackNonStream");
async function aiGenerate(config) {
  const t0 = Date.now();
  const circuitState = await getCircuitState(config.primary.provider, config.env);
  if (circuitState === "open") {
    logFallback({
      endpoint: config.endpoint,
      mode: config.mode,
      primaryProvider: config.primary.provider,
      primaryModel: config.primary.model,
      fallbackProvider: config.fallback.provider,
      fallbackModel: config.fallback.model,
      reason: "circuit_open"
    });
    const fallbackResult = await callProviderNonStream(
      config.fallback.provider,
      config.systemPrompt,
      config.messages,
      config.fallback,
      null
    );
    if (fallbackResult.ok && config.validate) {
      config.validate(fallbackResult.content);
    }
    return {
      ...fallbackResult,
      provider: config.fallback.provider,
      model: config.fallback.model,
      wasFallback: true,
      fallbackReason: "circuit_open",
      latency_ms: Date.now() - t0
    };
  }
  let signal = null;
  let timeout = null;
  if (config.mode === "realtime") {
    const controller = new AbortController();
    signal = controller.signal;
    timeout = setTimeout(() => controller.abort(), TIMEOUT.nonStreaming);
  }
  const primaryResult = await callProviderNonStream(
    config.primary.provider,
    config.systemPrompt,
    config.messages,
    config.primary,
    signal
  );
  if (timeout) clearTimeout(timeout);
  if (primaryResult.ok) {
    if (config.validate) {
      const validation = config.validate(primaryResult.content);
      if (!validation.valid) {
        await recordFailure(config.primary.provider, "validation", config.env);
        logFallback({
          endpoint: config.endpoint,
          mode: config.mode,
          primaryProvider: config.primary.provider,
          primaryModel: config.primary.model,
          fallbackProvider: config.fallback.provider,
          fallbackModel: config.fallback.model,
          reason: "validation",
          validationReason: validation.reason,
          primaryLatency: Date.now() - t0
        });
        return await _attemptFallbackNonStream(config, t0, "validation");
      }
    }
    await recordSuccess(config.primary.provider, config.env);
    return {
      ...primaryResult,
      provider: config.primary.provider,
      model: config.primary.model,
      wasFallback: false,
      fallbackReason: null,
      latency_ms: Date.now() - t0
    };
  }
  const reason = classifyError(primaryResult);
  await recordFailure(config.primary.provider, reason, config.env);
  logFallback({
    endpoint: config.endpoint,
    mode: config.mode,
    primaryProvider: config.primary.provider,
    primaryModel: config.primary.model,
    fallbackProvider: config.fallback.provider,
    fallbackModel: config.fallback.model,
    reason,
    primaryLatency: Date.now() - t0,
    primaryStatus: primaryResult.status,
    primaryError: primaryResult.error
  });
  if (config.mode === "background") {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const retryResult = await callProviderNonStream(
      config.primary.provider,
      config.systemPrompt,
      config.messages,
      config.primary,
      null
    );
    if (retryResult.ok) {
      if (config.validate) {
        const validation = config.validate(retryResult.content);
        if (!validation.valid) {
          return await _attemptFallbackNonStream(config, t0, "validation");
        }
      }
      await recordSuccess(config.primary.provider, config.env);
      return {
        ...retryResult,
        provider: config.primary.provider,
        model: config.primary.model,
        wasFallback: false,
        fallbackReason: null,
        latency_ms: Date.now() - t0
      };
    }
  }
  return await _attemptFallbackNonStream(config, t0, reason);
}
__name(aiGenerate, "aiGenerate");
async function aiClassify(config) {
  const originalValidate = config.validate;
  const wrappedConfig = {
    ...config,
    validate: /* @__PURE__ */ __name((content) => {
      let parsed2;
      try {
        let clean = (content || "").trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        }
        parsed2 = JSON.parse(clean);
      } catch {
        return { valid: false, reason: "json_parse_failed" };
      }
      if (originalValidate) {
        const customResult = originalValidate(parsed2);
        if (!customResult.valid) {
          return customResult;
        }
      }
      return { valid: true, parsed: parsed2 };
    }, "validate")
  };
  const result = await aiGenerate(wrappedConfig);
  let parsed = null;
  if (result.ok && result.content) {
    try {
      let clean = result.content.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      }
      parsed = JSON.parse(clean);
      if (originalValidate) {
        const validation = originalValidate(parsed);
        if (!validation.valid) {
          parsed = null;
        }
      }
    } catch {
      parsed = null;
    }
  }
  return {
    ...result,
    parsed
  };
}
__name(aiClassify, "aiClassify");
function getProviders(tier, env) {
  switch (tier) {
    case "nano":
      return {
        primary: {
          provider: "openai",
          model: "gpt-4.1-nano",
          apiKey: env.OPENAI_API_KEY
        },
        fallback: {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: "minimal"
        }
      };
    case "mini":
      return {
        primary: {
          provider: "openai",
          model: "gpt-4.1-mini",
          apiKey: env.OPENAI_API_KEY
        },
        fallback: {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: "none"
        }
      };
    case "chat":
      return {
        primary: {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: "low"
        },
        fallback: {
          provider: "openai",
          model: "gpt-4.1-mini",
          apiKey: env.OPENAI_API_KEY
        }
      };
    case "haiku":
      return {
        primary: {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          apiKey: env.ANTHROPIC_API_KEY
        },
        fallback: {
          provider: "gemini",
          model: "gemini-3.1-flash-lite-preview",
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: "low"
        }
      };
    case "sonnet":
      return {
        primary: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          apiKey: env.ANTHROPIC_API_KEY
        },
        fallback: {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
          thinkingLevel: "medium"
        }
      };
    default:
      throw new Error(`[aiProvider] Unknown tier: ${tier}`);
  }
}
__name(getProviders, "getProviders");

// workers/cortex/index.js
async function getCachedDomainNames(userId, env) {
  if (!userId || !env.CONTEXT_CACHE) return [];
  try {
    const cached = await env.CONTEXT_CACHE.get(`life-map-domains:${userId}`, "json");
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}
__name(getCachedDomainNames, "getCachedDomainNames");
function extractPreviousExchange(messages) {
  if (!messages || messages.length < 2) return null;
  let assistantMsg = null;
  let userMsg = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!assistantMsg && messages[i].role === "assistant") {
      assistantMsg = messages[i].content;
    } else if (assistantMsg && !userMsg && messages[i].role === "user") {
      userMsg = messages[i].content;
      break;
    }
  }
  if (!userMsg || !assistantMsg) return null;
  return { userMsg, assistantMsg };
}
__name(extractPreviousExchange, "extractPreviousExchange");
function mapScore(confirming) {
  if (confirming >= 5) return 0.9;
  if (confirming >= 4) return 0.85;
  if (confirming >= 3) return 0.7;
  if (confirming >= 2) return 0.5;
  if (confirming >= 1) return 0.3;
  return 0.15;
}
__name(mapScore, "mapScore");
function scoreTodo(p, hasUserSelectedDate = false) {
  if (!p.core_verb) return 0;
  if (p.temporal_orientation === "past" && p.is_narrative_reflection) return 0;
  if (p.has_emotion_language && !p.is_command) return 0;
  if (p.is_state_verb) return 0;
  if (p.references_current_state && p.change_is_open_ended && (p.struct_modifier_target === "action" || p.degree_shift_target === "own_action"))
    return 0;
  if (p.has_discontinuation && !p.is_command) return 0;
  let c = 0;
  if (p.is_command) c++;
  if (!p.has_emotion_language) c++;
  if (p.temporal_orientation === "future") c++;
  if (!p.has_discontinuation && !p.has_prohibition) c++;
  if (p.user_intent_mode === "directing") c++;
  if (p.action_direction === "external") c++;
  if (p.boundary_type === "one_time") c++;
  if (!p.is_ongoing_practice) c++;
  const recurrenceSignals = [
    p.is_ongoing_practice,
    p.has_routine_anchor,
    p.struct_completion === "recurring" && !p.is_single_instance,
    p.has_explicit_multiplicity,
    p.frequency_present
  ].filter(Boolean).length;
  if (recurrenceSignals >= 2) {
    return Math.min(mapScore(c), 0.5);
  }
  return mapScore(c);
}
__name(scoreTodo, "scoreTodo");
function scoreHabitBuild(p, hasUserSelectedDate = false) {
  if (!p.is_ongoing_practice && !p.has_routine_anchor) return 0;
  if (p.temporal_orientation === "past") return 0;
  if (p.has_prohibition || p.has_discontinuation) return 0;
  if (p.is_single_instance && p.has_date_or_time) return 0;
  let c = 0;
  if (p.is_ongoing_practice) c++;
  if (p.has_routine_anchor) c++;
  if (p.time_role === "characteristic") c++;
  if (p.action_direction === "own_behavior") c++;
  if (p.is_about_personal_patterns) c++;
  if (p.user_mode_record_or_change === "requesting_change") c++;
  if (p.is_command && p.core_verb) c++;
  if (p.has_hedging || p.user_intent_mode === "exploring") {
    return Math.min(mapScore(c), 0.5);
  }
  return mapScore(c);
}
__name(scoreHabitBuild, "scoreHabitBuild");
function scoreHabitBreak(p, hasUserSelectedDate = false) {
  if (!p.has_discontinuation && !p.has_prohibition && !p.has_relative_change && !p.has_restriction_boundary)
    return 0;
  if (p.temporal_orientation === "past" && p.is_narrative_reflection) return 0;
  let c = 0;
  if (p.has_discontinuation) c++;
  if (p.has_prohibition) c++;
  if (p.action_direction === "own_behavior") c++;
  if (p.boundary_type === "ongoing_boundary") c++;
  if (p.is_about_personal_patterns) c++;
  if (p.user_mode_record_or_change === "requesting_change") c++;
  if (p.references_existing_pattern) c++;
  if (p.has_restriction_boundary) c++;
  if (!p.has_discontinuation && !p.has_prohibition) {
    return Math.min(mapScore(c), 0.4);
  }
  return mapScore(c);
}
__name(scoreHabitBreak, "scoreHabitBreak");
function scoreEvent(p, hasUserSelectedDate = false) {
  if (!p.is_scheduled_occurrence && !hasUserSelectedDate) return 0;
  if (p.is_command && !p.is_scheduled_occurrence && !hasUserSelectedDate) return 0;
  let c = 0;
  if (p.has_date_or_time) c++;
  if (p.has_occasion_noun) c++;
  if (p.user_mode_record_or_change === "recording") c++;
  if (p.user_intent_mode === "capturing") c++;
  if (p.is_storing_information) c++;
  if (p.time_role === "when") c++;
  if (p.is_single_instance) c++;
  if (hasUserSelectedDate) c++;
  return mapScore(c);
}
__name(scoreEvent, "scoreEvent");
function scoreJournal(p, hasUserSelectedDate = false) {
  if (!p.has_emotion_language && !p.is_about_emotion && !p.is_about_feelings_not_actions && !p.is_narrative_reflection)
    return 0;
  if (p.is_command && !p.is_about_emotion && !p.has_emotion_language) return 0;
  let c = 0;
  if (p.has_emotion_language) c++;
  if (p.is_about_emotion) c++;
  if (p.is_about_feelings_not_actions) c++;
  if (p.is_narrative_reflection) c++;
  if (p.temporal_orientation === "past") c++;
  if (p.user_intent_mode === "processing") c++;
  if (p.self_reflection) c++;
  if (p.is_past_or_present) c++;
  return mapScore(c);
}
__name(scoreJournal, "scoreJournal");
function scoreIdea(p, hasUserSelectedDate = false) {
  if (!p.has_speculation && p.struct_novelty !== "novel") return 0;
  if (p.is_command && p.user_intent_mode === "directing") return 0;
  if (hasUserSelectedDate) return 0;
  let c = 0;
  if (p.has_speculation) c++;
  if (p.has_hedging) c++;
  if (p.user_intent_mode === "exploring") c++;
  if (!p.is_command) c++;
  if (!p.has_verb || p.core_verb === "want") c++;
  if (p.temporal_orientation !== "past") c++;
  return mapScore(c);
}
__name(scoreIdea, "scoreIdea");
function scoreGeneral(p, hasUserSelectedDate = false) {
  if (!p.is_declarative && !p.is_storing_information && !p.factual_statement) return 0;
  if (p.is_scheduled_occurrence && p.has_date_or_time) return 0;
  if (p.has_emotion_language) return 0;
  if (p.has_speculation) return 0;
  if (hasUserSelectedDate) return 0;
  let c = 0;
  if (p.is_declarative) c++;
  if (p.is_storing_information) c++;
  if (p.factual_statement) c++;
  if (p.user_intent_mode === "capturing") c++;
  if (p.user_mode_record_or_change === "recording") c++;
  if (!p.is_command) c++;
  if (p.time_role === "characteristic" || p.time_role === "no_time") c++;
  return mapScore(c);
}
__name(scoreGeneral, "scoreGeneral");
function mapWinnerToClassification(winnerType) {
  switch (winnerType) {
    case "todo":
      return { needsPhase1: false, bucket: "todo", subtype: null, habitSubtype: null };
    case "habit_build":
      return { needsPhase1: false, bucket: "habit", subtype: null, habitSubtype: "start_habit" };
    case "habit_break":
      return { needsPhase1: false, bucket: "habit", subtype: null, habitSubtype: "break_habit" };
    case "event":
      return { needsPhase1: false, bucket: "log", subtype: "event", habitSubtype: null };
    case "journal":
      return { needsPhase1: false, bucket: "log", subtype: "journal", habitSubtype: null };
    case "idea":
      return { needsPhase1: false, bucket: "log", subtype: "idea", habitSubtype: null };
    case "general":
      return { needsPhase1: false, bucket: "log", subtype: "general", habitSubtype: null };
    default:
      return { needsPhase1: true, reason: "unknown_scorer_type" };
  }
}
__name(mapWinnerToClassification, "mapWinnerToClassification");
function mapPreparseToClassification(preparse, options = {}) {
  const { hasUserSelectedDate = false } = options;
  if (preparse.parse_confidence === "low") {
    return { needsPhase1: true, reason: "low_parse_confidence" };
  }
  const textLen = (preparse.text_preview || "").trim().length;
  if (textLen > 0 && textLen <= 5) {
    const maxScore = Math.max(
      scoreTodo(preparse, hasUserSelectedDate),
      scoreHabitBuild(preparse, hasUserSelectedDate),
      scoreHabitBreak(preparse, hasUserSelectedDate),
      scoreEvent(preparse, hasUserSelectedDate),
      scoreJournal(preparse, hasUserSelectedDate),
      scoreIdea(preparse, hasUserSelectedDate),
      scoreGeneral(preparse, hasUserSelectedDate)
    );
    if (maxScore < 0.7) {
      return { needsPhase1: true, reason: "ultra_short_input" };
    }
  }
  const scores = {
    todo: scoreTodo(preparse, hasUserSelectedDate),
    habit_build: scoreHabitBuild(preparse, hasUserSelectedDate),
    habit_break: scoreHabitBreak(preparse, hasUserSelectedDate),
    event: scoreEvent(preparse, hasUserSelectedDate),
    journal: scoreJournal(preparse, hasUserSelectedDate),
    idea: scoreIdea(preparse, hasUserSelectedDate),
    general: scoreGeneral(preparse, hasUserSelectedDate)
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ranked[0];
  const [secondType, secondScore] = ranked[1];
  const gap = topScore - secondScore;
  console.log("[Scorer] Results", {
    text: preparse.text_preview || "",
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100])),
    winner: topType,
    topScore: Math.round(topScore * 100) / 100,
    gap: Math.round(gap * 100) / 100,
    decision: topScore >= 0.6 && gap >= 0.2 ? "fast_path" : "phase1"
  });
  if (topScore >= 0.6 && gap >= 0.2) {
    return mapWinnerToClassification(topType);
  }
  return {
    needsPhase1: true,
    reason: `scorer_${topType}_vs_${secondType}`,
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100]))
  };
}
__name(mapPreparseToClassification, "mapPreparseToClassification");
function computePlausibleInterpretations(preparse) {
  const interpretations = [];
  const todoPlausible = preparse.core_verb != null || preparse.is_noun_phrase_only === true || preparse.obligation_framing === true || preparse.has_completion_point === true;
  if (todoPlausible) {
    interpretations.push({ bucket: "todo", subtype: null, habitSubtype: null, dateField: null });
  }
  const habitBuildPlausible = preparse.direction_without_schedule === true || preparse.frequency_present === true && (preparse.frequency_type === "explicit" || preparse.frequency_type === "day_names");
  if (habitBuildPlausible) {
    interpretations.push({
      bucket: "habit",
      subtype: null,
      habitSubtype: "start_habit",
      dateField: null
    });
  }
  if (preparse.frequency_type === "stop_quit") {
    interpretations.push({
      bucket: "habit",
      subtype: null,
      habitSubtype: "break_habit",
      dateField: null
    });
  }
  const journalPlausible = preparse.emotional_content === true || preparse.self_reflection === true || preparse.frame_type === "processing";
  if (journalPlausible) {
    interpretations.push({
      bucket: "log",
      subtype: "journal",
      habitSubtype: null,
      dateField: null
    });
  }
  const ideaPlausible = preparse.frame_type === "exploring" || preparse.uncertainty_present === true && (preparse.uncertainty_target === "verb" || preparse.uncertainty_target === "entire_proposition") || preparse.hypothetical_framing === true;
  const pureEmotionalProcessing = preparse.emotional_content === true && preparse.frame_type === "processing";
  const generalPlausible = !pureEmotionalProcessing;
  const bothLogsAllowed = preparse.frame_type === "exploring" && preparse.is_noun_phrase_only === true;
  if (ideaPlausible && generalPlausible) {
    if (bothLogsAllowed) {
      interpretations.push({
        bucket: "log",
        subtype: "general",
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? "target_date" : null
      });
      interpretations.push({ bucket: "log", subtype: "idea", habitSubtype: null, dateField: null });
    } else if (ideaPlausible && preparse.frame_type === "exploring") {
      interpretations.push({ bucket: "log", subtype: "idea", habitSubtype: null, dateField: null });
    } else {
      interpretations.push({
        bucket: "log",
        subtype: "general",
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? "target_date" : null
      });
    }
  } else if (ideaPlausible) {
    interpretations.push({ bucket: "log", subtype: "idea", habitSubtype: null, dateField: null });
  } else if (generalPlausible) {
    interpretations.push({
      bucket: "log",
      subtype: "general",
      habitSubtype: null,
      dateField: preparse.temporal_specificity ? "target_date" : null
    });
  }
  if (interpretations.length > 4) {
    const ideaIdx = interpretations.findIndex((i) => i.subtype === "idea");
    if (ideaIdx !== -1) interpretations.splice(ideaIdx, 1);
  }
  if (interpretations.length > 4) {
    const journalIdx = interpretations.findIndex((i) => i.subtype === "journal");
    if (journalIdx !== -1) interpretations.splice(journalIdx, 1);
  }
  if (interpretations.length < 2) {
    const hasGeneral = interpretations.some((i) => i.bucket === "log" && i.subtype === "general");
    const hasTodo = interpretations.some((i) => i.bucket === "todo");
    if (!hasGeneral) {
      interpretations.push({
        bucket: "log",
        subtype: "general",
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? "target_date" : null
      });
    } else if (!hasTodo) {
      interpretations.push({ bucket: "todo", subtype: null, habitSubtype: null, dateField: null });
    }
  }
  return interpretations;
}
__name(computePlausibleInterpretations, "computePlausibleInterpretations");
var PREPARSE_INTENT_PROMPT = `Extract these facts from the input. Return JSON only.

- g1: Is this sentence a bare imperative \u2014 a direct instruction that contains NO stated subject? A bare imperative has the verb as the grammatical starting point of the clause, with the actor entirely implied rather than named. The moment a subject appears \u2014 particularly a first-person subject \u2014 the sentence is no longer an imperative. It becomes a statement about the speaker's internal state: their felt obligation, desire, or aspiration. The distinction matters: imperatives direct action. Statements with a stated subject describe the speaker's relationship to the action \u2014 what they feel they should do, want to do, or need to do. These are fundamentally different speech acts even when they reference the same underlying activity. Only return true when there is genuinely no stated subject and the sentence functions as a direct instruction. (boolean)
- g2: Does the text state a fact about something \u2014 providing information about a subject rather than instructing someone to act? A declarative statement asserts that something IS the case. It assigns a property, attribute, date, status, or characteristic to a subject. The subject and its predicate may appear in any order and the copula may be implicit rather than explicitly written. Noun phrases that name a subject alongside a property \u2014 where the relationship between them is one of attribution or identity \u2014 are declarative even when the verb is omitted. The core test: is the text TELLING you something about the world, or TELLING you to do something? Assertions about the world are declarative. Instructions to act are not. (boolean)
- g3: Is the user floating a hypothetical or wondering about a possibility? Speculation means the user is IMAGINING something that does not currently exist \u2014 the content lives entirely in the realm of "could be" rather than "is" or "was." The key distinction is between three orientations: the user can be directed toward WHAT IS (investigating, researching, checking \u2014 not speculation), toward WHAT THEY FEEL (processing, reflecting \u2014 not speculation), or toward WHAT COULD BE (imagining, proposing, wondering \u2014 this IS speculation). The test: does the substance of the thought exist only in the user's imagination at this moment? If the user is describing something that has no reality yet and they are entertaining whether it should, that is speculation regardless of how tentatively or confidently they express it. (boolean)
- g4: Is the text describing something that already happened or is currently happening \u2014 past or present tense? (boolean)
- g6: Is the user narrating or reflecting on something that happened to them \u2014 recounting an experience, describing a moment, or processing something they went through? (boolean)`;
var PREPARSE_CONTENT_PROMPT = `Extract these facts from the input. Return JSON only.

- c1: Is the text about something that is SCHEDULED TO HAPPEN at a point in time \u2014 not something the user needs to DO, but something that WILL OCCUR? This includes any scheduled occurrence the user would want to be aware of \u2014 something they would note in a calendar because it exists in time. The test: is the text noting that something EXISTS IN TIME, not instructing an action? (boolean)
- c1r: "one sentence explaining your choice for c1"
- c3: Is the user describing their emotional or physical state \u2014 expressing how they feel right now or how they felt? The WORDS themselves must convey feeling. Scheduling language, action descriptions, and factual statements carry no emotional weight regardless of the topic. (boolean)
- c3r: "one sentence explaining your choice for c3"
- c4: Is the user describing their own inner state \u2014 their thoughts, feelings, or reflections? (boolean)
- c4r: "one sentence explaining your choice for c4"
- s1: Is the user the one who will act or be affected, or is the text about an external system, product, or other person? "user" / "external" / "other_person"`;
var PREPARSE_STRUCTURE_PROMPT = `Extract these facts from the input. Return JSON only.

- t1: Does the text contain a specific date, named day of the week, or clock time? (boolean)
- t2a1: Does the text state a specific COUNT of how many times the action will occur? The text must make a numerical claim about repetition \u2014 how many instances of the action are intended within a given period. If no numerical count of occurrences is stated, return false. (boolean)
- t2a3a: Does the text specify a measurable amount of the action \u2014 a defined quantity, duration, or count that states how much of the action is intended? (boolean)
- t2a3b: Is that amount bounded by a time period that it must fit WITHIN \u2014 does the text pair the amount with a period that acts as its container or allowance? The time period is not telling you WHEN to do the action \u2014 it is telling you the window that the amount is measured against. Only relevant when t2a3a is true \u2014 return false if t2a3a is false. (boolean)
- t2a3c: Does that containing time period naturally recur \u2014 does it exist again and again as part of the rhythm of life without anyone scheduling it? If the period is a single specific upcoming occasion that will pass and not return, return false. If the period is a type of time that keeps occurring, return true. Only relevant when t2a3b is true \u2014 return false if t2a3b is false. (boolean)
- t2b1: Is the USER the one who will personally perform this action each time it occurs? The user must be the agent \u2014 the person who carries out the activity. If the action is performed by an external system, another person, or something that happens TO the user without their active participation, return false. (boolean)
- t2b2: Is the action directed at the FUTURE \u2014 something the user intends to do going forward? Return false if the text is reporting what has already been happening, describing a past pattern, or explaining how something external currently operates. Return true only when the action represents forward-looking intended behaviour. (boolean)
- t3: Does the text anchor a behavior to a moment in the user's day that recurs by its very nature \u2014 not because anyone scheduled it, but because the structure of a human day inherently contains it? A routine anchor is a reference to a point in the daily cycle that exists universally and repeats every day without deliberate planning. The distinction from other time references: a routine anchor recurs because human days have a predictable rhythm. A calendar date, a named weekday, or a clock time recurs because of a scheduling system. If the referenced moment would still exist even if the user owned no calendar and no clock, it is a routine anchor. If it requires a calendar or clock to identify, it is not. (boolean)
- t4: Does the text contain a temporal reference that SCOPES the action to a SINGLE OCCASION? Temporal scoping means the time reference creates a boundary around the action \u2014 placing it within a specific, finite time window rather than leaving it open-ended. Named days, named dates, relative time references pointing to a specific upcoming window, and calendar-specific anchors all create temporal scope. The test: does the time reference answer "WHEN specifically?" in a way that limits this to one occurrence? If the time reference describes a PATTERN or CHARACTERISTIC rather than scoping to one occasion, it does not qualify \u2014 recurrence and single instance are mutually exclusive. When both a specific time window and a recurrence signal are present in the same text, recurrence takes precedence and t4 is false. (boolean)
- t4r: "one sentence identifying the specific temporal scoping reference, or explaining why no temporal scope is present"`;
var PREPARSE_BEHAVIORAL_PROMPT = `Extract these facts from the input. Return JSON only.

- b1: Does the text use NEGATIVE framing to set a boundary \u2014 expressing that something should NOT happen, is NOT allowed, or WILL NOT be done? Positive recommendations or obligations about what SHOULD happen are not prohibition. (boolean)
- b2a: Is the user expressing that a behavior should FULLY CEASE \u2014 reaching a target state of ZERO? The user must be communicating that something should stop entirely, be eliminated, or no longer occur at all. Wanting LESS of something, wanting to REDUCE something, or wanting a DIFFERENT AMOUNT of something does NOT qualify \u2014 those express a desire for relative change, not full cessation. The test: is the user's intended end state for this behavior unambiguously zero occurrences? If the desired state is "less than now" rather than "none at all", return false. Relative or directional language without a zero-target is not discontinuation. (boolean)
- b2ar: "one sentence explaining whether the target state is zero or merely reduced"
- b2b: Is the text about a behavior or pattern that ALREADY EXISTS in the user's life? This can be established in two ways: (1) The user explicitly describes a current or past pattern. (2) The user's language LOGICALLY ENTAILS an existing pattern. Cessation, prohibition, and reduction language inherently imply that the behavior already exists \u2014 it is impossible to stop, quit, reduce, limit, or cut back on something that is not already happening. When the user expresses wanting to end, reduce, or restrict a behavior, the existence of that behavior as a current pattern is a logical certainty, not an inference. Return true whenever the behavior's current existence is either stated or logically entailed. (boolean)
- b2br: "one sentence explaining whether the existing pattern is explicitly stated or logically entailed by cessation/reduction language"
- b3: Does the text express a desire for relative change \u2014 wanting a different amount or quality of something \u2014 without specifying a concrete target or schedule? (boolean)
- b4a1: Does the text reference the user's CURRENT STATE or CURRENT LEVEL and express that it should be DIFFERENT? The language must contain an implicit claim about how things are NOW and a desire to move away from that. The test: does the language require you to know the user's current situation to understand what they want? If what the user is describing is fully defined without any reference to how things currently are, return false. If the meaning depends on a comparison to an unstated present baseline, return true. (boolean)
- b4a2: Is the desired change OPEN-ENDED \u2014 expressed as a direction of movement without defining where to stop? The user wants to move along a spectrum but has not stated a point where the change would be complete. The test: if someone asked "how much change is enough?" does the text provide a definite answer? If the text names a specific boundary where the change is achieved, return false. If the text only indicates a direction to move with no stated boundary, return true. Only relevant when b4a1 is true \u2014 return false if b4a1 is false. (boolean)
- b6: Is the user setting an UPPER BOUNDARY on their own consumption or behaviour \u2014 expressing that a certain amount, frequency, or duration should not be exceeded? The user is defining a ceiling \u2014 a maximum allowable level that they intend to stay within. The behaviour is not being eliminated, it is being capped. (boolean)`;
var PREPARSE_META_PROMPT = `Extract these facts from the input. Return JSON only.

- m1: Does the text use hedging or tentative language expressing doubt about whether to proceed? (boolean)
- m2: Does the text use language expressing duty or necessity? (boolean)
- m3: Overall clarity: "high" (clear meaning), "medium" (some ambiguity), or "low" (very unclear).
- c2: Is the primary purpose of this text to STORE A PIECE OF INFORMATION for future reference? The text must be providing a data point to remember, not directing an action to take or expressing a commitment. (boolean)
- c2r: "one sentence explaining your choice for c2"`;
var PREPARSE_RELATIONAL_PROMPT = `Analyze the RELATIONSHIPS between elements in this text. Return JSON only.

- r1: Is any action in this text directed at the user's OWN BEHAVIOR or PATTERNS \u2014 or is it directed at an EXTERNAL OBJECT, SERVICE, or THING? "own_behavior" / "external" / "unclear"
- r1r: "one sentence explaining your choice for r1"
- r2: If there is a time element, is it telling you WHEN a specific one-time thing will happen, or is it describing a PROPERTY or CHARACTERISTIC of the subject \u2014 how it works, how long it lasts, or how often it occurs? "when" / "characteristic" / "no_time"
- r2r: "one sentence explaining your choice for r2"
- r3: If there is negation or cessation, is the user setting an ONGOING BOUNDARY they will need to maintain, or performing a ONE-TIME ACTION that will be complete once done? "ongoing_boundary" / "one_time" / "no_negation"
- r3r: "one sentence explaining your choice for r3"`;
var PREPARSE_HOLISTIC_PROMPT = `Look at this text as a whole and answer these questions. Return JSON only.

- m4: Is the user oriented toward the PAST (reflecting on what happened), FUTURE (looking ahead at what is coming or what they will do), or NEITHER (stating a standing fact or exploring)? "past" / "future" / "neither"
- m5: Is the user RECORDING something (capturing information or noting what exists) or REQUESTING A CHANGE (directing themselves or others to act or behave differently)? "recording" / "requesting_change" / "neither"
- m6a: Is this drop primarily about the user's OWN PATTERNS, HABITS, or LIFESTYLE \u2014 something about how they live or behave? (boolean)
- m6b: Is this drop primarily about STORING A FACT or PIECE OF INFORMATION for later? (boolean)
- m6c: Is this drop primarily about a FEELING or EMOTIONAL EXPERIENCE? (boolean)`;
var STRUCTURAL_PARSE_PROMPT = `Parse the structural components of this text. Return JSON only.

- verb: What is the main action verb \u2014 the thing someone would DO? 
  Return the verb as a string. If no action verb is present, return null.

- has_verb: Is there a word in this text that describes an activity 
  a person PERFORMS \u2014 something that occupies their time and effort 
  while they do it? If no such word is present, return false. (boolean)

- object: What is the THING being acted upon \u2014 the noun that receives 
  the action of the verb? This is the direct object. If the verb has 
  no external object (the action is self-contained), return null. 
  Return the noun phrase as a string, or null.

- modifier: Is there comparative or qualitative language that expresses 
  a desired shift in degree, amount, or quality? Return the modifier 
  word or phrase as a string. If no comparative or qualitative modifier 
  is present, return null.

- modifier_target: Does the modifier describe a property of the OBJECT 
  (the thing being sought, obtained, or selected) or does it describe 
  the ACTION itself (how the user performs, consumes, or engages)? 
  Only relevant when both modifier and object are present. When the 
  modifier and object form a unit that specifies WHICH KIND of thing 
  the user wants, return "object". When the modifier describes the 
  manner, degree, or extent of the user's own activity, return "action". 
  When there is no object and the modifier stands alone with the verb, 
  return "action". Return null when modifier is null. 
  ("object" / "action" / null)

- time_reference: Is there a temporal phrase that indicates WHEN or 
  HOW OFTEN? Return the temporal phrase as a string. If no temporal 
  language is present, return null.

- time_binding: Can the time reference be placed on ONE SPECIFIC DATE 
  on a calendar? If it points to a single datable occasion, return 
  "bound". If it describes a recurring slot or pattern that cannot be 
  pinpointed to one calendar date, return "unbound". If it could 
  reasonably mean either, return "ambiguous". Only relevant when 
  time_reference is not null \u2014 return null when time_reference is null. 
  ("bound" / "unbound" / "ambiguous" / null)

- verb_type: Does the verb describe an ACTION the user performs \u2014 an 
  activity that occupies time and effort \u2014 or a STATE the user 
  inhabits \u2014 a condition or quality of being? Return null when has_verb 
  is false. ("action" / "state" / null)

- intent_mode: What is the user DOING by writing this? Telling 
  themselves or someone to act = "directing". Storing information 
  for later = "capturing". Working through a feeling or experience 
  = "processing". Thinking out loud or wondering = "exploring". 
  ("directing" / "capturing" / "processing" / "exploring")

- completion: Based ONLY on what this text says, is the user committing to a recurring pattern or setting up a one-time action? Return "done" when the text describes a single action to perform, even if the underlying activity is something that could theoretically be repeated in the future. Return "recurring" ONLY when the text contains explicit frequency, schedule, or repetition language indicating the user intends this to happen more than once. The absence of frequency or schedule language means "done". Return "unclear" when genuinely ambiguous. ("done" / "recurring" / "unclear")

- novelty: Is the PRIMARY SUBJECT of this text something that 
  does not currently exist? Not the actions or feelings mentioned, 
  but the THING the text is fundamentally about. If the text is 
  fundamentally about a real action the user will take, a real 
  experience they had, or a real thing in their life, return 
  "existing" \u2014 even if the action has not happened yet. If the 
  text is fundamentally about an imagined system, tool, method, 
  or concept that has no concrete form yet, return "novel". 
  Return "unclear" when genuinely ambiguous. 
  ("novel" / "existing" / "unclear")`;
var PREPARSE_FIELD_MAP = {
  // Prompt A: Grammar
  g1: "is_command",
  g2: "is_declarative",
  g3: "has_speculation",
  g4: "is_past_or_present",
  g6: "is_narrative_reflection",
  // Prompt B: Content
  c1: "is_scheduled_occurrence",
  c1r: "scheduled_reasoning",
  c3: "has_emotion_language",
  c3r: "emotion_reasoning",
  c4: "is_about_feelings_not_actions",
  c4r: "feelings_reasoning",
  s1: "action_target",
  // Prompt C: Temporal
  t1: "has_date_or_time",
  t2a1: "has_occurrence_count",
  t2a3a: "has_measurable_amount",
  t2a3b: "amount_bounded_by_period",
  t2a3c: "bounding_period_recurs",
  t2b1: "user_is_agent",
  t2b2: "action_is_future",
  t3: "has_routine_anchor",
  t4: "is_single_instance",
  t4r: "single_instance_reasoning",
  // Prompt D: Behavioral
  b1: "has_prohibition",
  b2a: "has_discontinuation",
  b2ar: "discontinuation_reasoning",
  b2b: "references_existing_pattern",
  b2br: "pattern_reasoning",
  b3: "has_relative_change",
  b4a1: "references_current_state",
  b4a2: "change_is_open_ended",
  b6: "has_restriction_boundary",
  // Prompt E: Meta
  m1: "has_hedging",
  m2: "has_obligation",
  m3: "parse_confidence",
  c2: "is_reference_detail",
  c2r: "reference_reasoning",
  // Prompt F: Relational
  r1: "action_direction",
  r1r: "action_direction_reasoning",
  r2: "time_role",
  r2r: "time_role_reasoning",
  r3: "boundary_type",
  r3r: "boundary_reasoning",
  // Prompt G: Holistic
  m4: "temporal_orientation",
  m5: "user_mode_record_or_change",
  m6a: "is_about_personal_patterns",
  m6b: "is_storing_information",
  m6c: "is_about_emotion"
};
function mapCodedPreparse(coded) {
  const mapped = {};
  for (const [code, value] of Object.entries(coded)) {
    const readableName = PREPARSE_FIELD_MAP[code];
    if (readableName) {
      mapped[readableName] = value;
    } else {
      mapped[code] = value;
    }
  }
  return mapped;
}
__name(mapCodedPreparse, "mapCodedPreparse");
async function runPreparseMini(text, env, systemPrompt) {
  const result = await aiClassify({
    mode: "realtime",
    ...getProviders("nano", env),
    env,
    systemPrompt,
    messages: [{ role: "user", content: text.substring(0, 500) }],
    temperature: 0.1,
    maxOutputTokens: 300,
    endpoint: "preparse-mini"
  });
  if (!result.parsed) {
    throw new Error("preparse failed: both providers returned unusable output");
  }
  return result.parsed;
}
__name(runPreparseMini, "runPreparseMini");
async function runStructuralParse(text, env) {
  const result = await aiClassify({
    mode: "realtime",
    ...getProviders("mini", env),
    env,
    systemPrompt: STRUCTURAL_PARSE_PROMPT,
    messages: [{ role: "user", content: text.substring(0, 500) }],
    temperature: 0.1,
    maxOutputTokens: 200,
    endpoint: "structural-parse"
  });
  if (!result.parsed) {
    throw new Error("structural parse failed: both providers returned unusable output");
  }
  return result.parsed;
}
__name(runStructuralParse, "runStructuralParse");
async function runPreparse(text, env) {
  const t0 = Date.now();
  try {
    const [
      structuralResult,
      intentResult,
      contentResult,
      structureResult,
      behavioralResult,
      metaResult,
      relationalResult,
      holisticResult
    ] = await Promise.all([
      runStructuralParse(text, env).catch((err) => {
        console.error("[StructuralParse] Failed, using nano fallback", { error: String(err) });
        return {};
      }),
      runPreparseMini(text, env, PREPARSE_INTENT_PROMPT),
      runPreparseMini(text, env, PREPARSE_CONTENT_PROMPT),
      runPreparseMini(text, env, PREPARSE_STRUCTURE_PROMPT),
      runPreparseMini(text, env, PREPARSE_BEHAVIORAL_PROMPT),
      runPreparseMini(text, env, PREPARSE_META_PROMPT),
      runPreparseMini(text, env, PREPARSE_RELATIONAL_PROMPT),
      runPreparseMini(text, env, PREPARSE_HOLISTIC_PROMPT)
    ]);
    const latency = Date.now() - t0;
    const grammar = mapCodedPreparse(intentResult);
    const content = mapCodedPreparse(contentResult);
    const temporal = mapCodedPreparse(structureResult);
    const behavioral = mapCodedPreparse(behavioralResult);
    const meta = mapCodedPreparse(metaResult);
    const relational = mapCodedPreparse(relationalResult);
    const holistic = mapCodedPreparse(holisticResult);
    const result = {
      // Atomic observations
      is_command: Boolean(grammar.is_command),
      is_declarative: Boolean(grammar.is_declarative),
      has_speculation: Boolean(grammar.has_speculation),
      is_past_or_present: Boolean(grammar.is_past_or_present),
      core_verb: structuralResult.verb || grammar.core_verb || null,
      struct_object: structuralResult.object || null,
      struct_modifier: structuralResult.modifier || null,
      struct_modifier_target: ["object", "action"].includes(structuralResult.modifier_target) ? structuralResult.modifier_target : null,
      struct_time_reference: structuralResult.time_reference || null,
      struct_time_binding: ["bound", "unbound", "ambiguous"].includes(structuralResult.time_binding) ? structuralResult.time_binding : null,
      struct_completion: ["done", "recurring", "unclear"].includes(structuralResult.completion) ? structuralResult.completion : "unclear",
      struct_novelty: ["novel", "existing", "unclear"].includes(structuralResult.novelty) ? structuralResult.novelty : "unclear",
      is_narrative_reflection: Boolean(grammar.is_narrative_reflection),
      is_state_verb: structuralResult.verb_type === "state",
      has_concrete_result: false,
      verb_has_completion: structuralResult.verb_type === "action",
      has_verb: structuralResult.has_verb !== false,
      is_scheduled_occurrence: Boolean(content.is_scheduled_occurrence),
      scheduled_reasoning: content.scheduled_reasoning || "",
      has_emotion_language: Boolean(content.has_emotion_language),
      emotion_reasoning: content.emotion_reasoning || "",
      is_about_feelings_not_actions: Boolean(content.is_about_feelings_not_actions),
      feelings_reasoning: content.feelings_reasoning || "",
      action_target: ["user", "external", "other_person"].includes(content.action_target) ? content.action_target : "user",
      has_date_or_time: Boolean(temporal.has_date_or_time),
      has_occurrence_count: Boolean(temporal.has_occurrence_count),
      has_time_reference: Boolean(temporal.has_time_reference),
      time_reference_binding: ["bound", "unbound", "ambiguous"].includes(
        temporal.time_reference_binding
      ) ? temporal.time_reference_binding : null,
      claims_all_instances: temporal.time_reference_binding === "unbound" || structuralResult.time_binding === "unbound",
      has_measurable_amount: Boolean(temporal.has_measurable_amount),
      amount_bounded_by_period: Boolean(temporal.amount_bounded_by_period),
      bounding_period_recurs: Boolean(temporal.bounding_period_recurs),
      has_explicit_multiplicity: Boolean(temporal.has_occurrence_count) || temporal.time_reference_binding === "unbound" || structuralResult.time_binding === "unbound" || Boolean(temporal.has_measurable_amount) && Boolean(temporal.amount_bounded_by_period) && Boolean(temporal.bounding_period_recurs),
      user_is_agent: Boolean(temporal.user_is_agent),
      action_is_future: Boolean(temporal.action_is_future),
      multiplicity_is_future_self: Boolean(temporal.user_is_agent) && Boolean(temporal.action_is_future),
      is_ongoing_practice: (Boolean(temporal.has_occurrence_count) || temporal.time_reference_binding === "unbound" || structuralResult.time_binding === "unbound" || Boolean(temporal.has_measurable_amount) && Boolean(temporal.amount_bounded_by_period) && Boolean(temporal.bounding_period_recurs)) && Boolean(temporal.user_is_agent) && Boolean(temporal.action_is_future),
      ongoing_reasoning: "",
      has_routine_anchor: Boolean(temporal.has_routine_anchor),
      is_single_instance: Boolean(temporal.is_single_instance),
      single_instance_reasoning: temporal.single_instance_reasoning || "",
      has_prohibition: Boolean(behavioral.has_prohibition),
      has_discontinuation: Boolean(behavioral.has_discontinuation),
      discontinuation_reasoning: behavioral.discontinuation_reasoning || "",
      references_existing_pattern: Boolean(behavioral.references_existing_pattern),
      pattern_reasoning: behavioral.pattern_reasoning || "",
      has_relative_change: Boolean(behavioral.has_relative_change),
      references_current_state: Boolean(behavioral.references_current_state),
      change_is_open_ended: Boolean(behavioral.change_is_open_ended),
      has_restriction_boundary: Boolean(behavioral.has_restriction_boundary),
      degree_shift_target: structuralResult.modifier_target === "object" ? "thing_sought" : structuralResult.modifier_target === "action" ? "own_action" : ["own_action", "thing_sought"].includes(behavioral.degree_shift_target) ? behavioral.degree_shift_target : null,
      has_hedging: Boolean(meta.has_hedging),
      has_obligation: Boolean(meta.has_obligation),
      parse_confidence: ["high", "medium", "low"].includes(meta.parse_confidence) ? meta.parse_confidence : "medium",
      is_reference_detail: Boolean(meta.is_reference_detail),
      reference_reasoning: meta.reference_reasoning || "",
      // Relational
      action_direction: ["own_behavior", "external", "unclear"].includes(
        relational.action_direction
      ) ? relational.action_direction : "unclear",
      action_direction_reasoning: relational.action_direction_reasoning || "",
      time_role: ["when", "characteristic", "no_time"].includes(relational.time_role) ? relational.time_role : "no_time",
      time_role_reasoning: relational.time_role_reasoning || "",
      boundary_type: ["ongoing_boundary", "one_time", "no_negation"].includes(
        relational.boundary_type
      ) ? relational.boundary_type : "no_negation",
      boundary_reasoning: relational.boundary_reasoning || "",
      // Holistic
      temporal_orientation: ["past", "future", "neither"].includes(holistic.temporal_orientation) ? holistic.temporal_orientation : "neither",
      user_mode_record_or_change: ["recording", "requesting_change", "neither"].includes(
        holistic.user_mode_record_or_change
      ) ? holistic.user_mode_record_or_change : "neither",
      is_about_personal_patterns: Boolean(holistic.is_about_personal_patterns),
      is_storing_information: Boolean(holistic.is_storing_information),
      is_about_emotion: Boolean(holistic.is_about_emotion),
      user_intent_mode: ["directing", "capturing", "processing", "exploring"].includes(
        structuralResult.intent_mode
      ) ? structuralResult.intent_mode : ["directing", "capturing", "processing", "exploring"].includes(holistic.user_intent_mode) ? holistic.user_intent_mode : "directing",
      // Derived fields for backward compatibility
      frame_type: "uncertain",
      factual_statement: false,
      is_noun_phrase_only: false,
      self_reflection: false,
      emotional_content: false,
      has_occasion_noun: false,
      uncertainty_present: false,
      frequency_present: false,
      frequency_type: null,
      is_self_restriction: false,
      has_implied_recurrence: false,
      obligation_framing: false,
      direction_without_schedule: false,
      has_completion_point: "uncertain",
      hypothetical_framing: false,
      verb_position: "none",
      temporal_specificity: false,
      reminder_intent: false
    };
    if (result.has_verb === false) {
      result.is_command = false;
      result.is_state_verb = false;
      if (result.user_intent_mode === "directing") {
        result.user_intent_mode = "capturing";
      }
    }
    result.frame_type = result.has_emotion_language && result.is_about_feelings_not_actions ? "processing" : result.is_command ? "directing" : result.has_speculation || result.has_hedging ? "exploring" : result.is_declarative || result.is_reference_detail ? "factual" : result.is_past_or_present && result.is_about_feelings_not_actions ? "processing" : "uncertain";
    result.factual_statement = result.is_declarative;
    result.is_noun_phrase_only = !result.has_verb;
    result.self_reflection = result.is_about_feelings_not_actions;
    result.emotional_content = result.has_emotion_language;
    result.has_occasion_noun = result.is_scheduled_occurrence;
    result.uncertainty_present = result.has_hedging;
    result.frequency_present = result.is_ongoing_practice || result.has_discontinuation;
    result.frequency_type = result.has_discontinuation && result.references_existing_pattern ? "stop_quit" : result.is_ongoing_practice ? "explicit" : null;
    result.is_self_restriction = result.has_prohibition && result.references_existing_pattern && !result.is_single_instance;
    result.has_implied_recurrence = result.has_routine_anchor;
    result.obligation_framing = result.has_obligation;
    result.direction_without_schedule = result.has_relative_change;
    result.verb_position = result.is_command ? "start" : result.has_speculation ? "inside_hypothetical" : "none";
    console.log("[PreParse] Success", { latency_ms: latency });
    return { success: true, result, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - t0;
    console.error("[PreParse] Error", { error: String(err), latency_ms: latency });
    return { success: false, error: String(err), latency_ms: latency };
  }
}
__name(runPreparse, "runPreparse");
function getReasoningGuidance(reason) {
  switch (reason) {
    case "noun_phrase_only":
      return `This is a noun phrase with no verb or framing.

Apply THE ACTION IMPLICATION TEST:
Does this noun inherently imply something needs to be done, or could it equally be reference information to remember? 

If only one interpretation makes sense, choose it. If both are genuinely plausible, return AMBIGUOUS with type "bucket". Additionally, before applying THE ACTION IMPLICATION TEST, first check whether the noun phrase implies project-scale or multi-step work \u2014 a system, product, feature, initiative, or named deliverable that would require coordinated effort across multiple actions. When action_target is external AND the noun implies this kind of scale, return AMBIGUOUS with ambiguity_type "scope" rather than "bucket". The distinction: bucket is for nouns where intent is entirely unknown. Scope is for nouns where working on something is implied but the scale \u2014 one task vs a larger effort \u2014 is what needs clarifying.`;
    case "direction_without_schedule":
      return `This input expresses a desire for relative change without a concrete schedule. Apply these two tests IN ORDER and stop at the first that resolves:

FIRST \u2014 THE ZERO-TARGET TEST:
Is the user's desired end state for this behavior unambiguously zero? This means the user has clearly expressed that the behavior should stop entirely, not merely reduce. Relative language \u2014 wanting less, fewer, more, better \u2014 does NOT satisfy this test. Only explicit cessation intent satisfies this test. If the desired end state is zero with certainty \u2192 HABIT with subtype break_habit.

SECOND \u2014 THE CONCRETE DAILY BINARY TEST:
Can the user answer "did I do this today?" with an unambiguous yes or no based solely on what was stated in the input? The test is strict: the behavior must be specific enough that two different people reading the input would agree on whether it happened on a given day. Vague qualities \u2014 being more present, spending less time, being better at something, being less reactive \u2014 do not pass this test because they have no defined threshold. Aspirational language about abstract qualities or relative improvements without a stated threshold always fails this test. If the test fails \u2192 return AMBIGUOUS with type "bucket". Do not attempt to infer a threshold that the user did not state.

If both tests fail \u2192 AMBIGUOUS. The clarify flow exists precisely for these inputs. Do not classify as habit when the user has not provided enough information to make the habit trackable.`;
    case "hedged_action":
      return `This has an action verb, but uncertainty is on the verb itself.

Apply THE UNCERTAINTY LOCATION TEST:
Is the uncertainty about THE WORLD (external factors, timing, availability) or about THE USER'S OWN INTENT (whether to do it at all)?

- World uncertainty: The user has committed but faces external unknowns. The intent is clear; circumstances are not. This is TODO.
- Self uncertainty: The user hasn't decided. They're exploring or processing. This is LOG/idea or LOG/journal.

The key test: If external conditions resolved favorably, would the user definitely act? YES \u2192 TODO. UNSURE \u2192 not TODO.

Apply THE HEDGE REMOVAL TEST:
Mentally remove the hedging language. Does a clear self-directed command remain? If yes, the hedge was stylistic softening of a commitment. If the whole thought collapses without the hedge, the hedge WAS the content.`;
    case "uncertain_frame":
      return `The dominant frame is unclear.

Apply THE FRAME TEST:
Individual words exist inside an overall frame. The frame determines classification, not the words inside it.

- DIRECTING frame: User is telling themselves to do something. Even soft language inside a directing frame is TODO.
- EXPLORING frame: User is considering possibilities. Even action verbs inside an exploring frame is LOG/idea.
- PROCESSING frame: User is working through feelings. Even future-oriented words inside a processing frame is LOG/journal.

The test: What is the user DOING with this thought right now? Capturing an action? Floating a possibility? Working through feelings?`;
    case "low_parse_confidence":
      return `Structure was unclear to the parser. Do a fresh holistic read.

Apply all core tests:
1. THE UNCERTAINTY LOCATION TEST - Is uncertainty about the world or about user intent?
2. THE FRAME TEST - What is the dominant frame: directing, exploring, or processing?
3. THE COMMITMENT TEST - Has the user decided to act, or are they still weighing?
4. THE COMPLETENESS TEST - Is this a complete expression (emotional, factual) or genuinely missing intent?

If multiple interpretations remain equally valid after applying these tests, return AMBIGUOUS.`;
    case "no_clear_mapping":
      return `Structural facts are clear but don't map to a single bucket.

Apply THE SYNTHESIS TEST:
Facts may co-exist (emotional content + action verb, or frequency language + hedging). One purpose dominates.

Ask: What does the user ultimately WANT from capturing this? That answer determines the bucket.

Apply THE FUZZY DETAILS TEST:
Uncertainty about WHAT/WHEN/HOW within a committed action is still TODO - the commitment is clear, just the specifics are fuzzy.
Only uncertainty about WHETHER to act at all removes it from TODO.

If signals genuinely conflict with equal weight, return AMBIGUOUS.`;
    case "frequency_detected_needs_habit_verification":
      return `Pre-parse detected frequency or cessation signals alongside a leading action verb. A leading verb does NOT override frequency \u2014 the verb describes the action content while frequency determines the entity type.

Apply THE HABIT GATE \u2014 all three tests must pass for HABIT classification:

1. WHO REPEATS: Is the user personally performing the recurring action? If they are building, configuring, or scheduling something external (a system, a project, a deliverable), that is a TODO regardless of frequency language.

2. WHAT RECURS: Does the frequency language attach to the user's own behavior? Recurrence in the action the user takes \u2192 HABIT. Recurrence in an output, event, or external process \u2192 TODO.

3. IS THERE CONCRETE TIMING: Either explicit recurrence schedules (daily, weekly, every morning) or cessation language (stop, quit, give up) count as concrete frequency signals. Vague aspirational language without temporal anchoring does not.

If all three pass \u2192 HABIT. Use subtype "start_habit" for building new behaviors, "break_habit" for stopping or quitting existing behaviors.
If any test fails \u2192 TODO. The frequency language is incidental, not definitional.

CRITICAL: When the input is a short action phrase of two to four words containing a verb and an activity \u2014 with no explicit schedule, no day names, and no specific time anchor \u2014 the frequency signal is ambiguous as to whether the user means a one-time action or a recurring practice. In this situation, do not commit to todo or habit with high confidence. Return AMBIGUOUS with ambiguity_type "habit_or_todo" so the user can clarify. The input must be treated as genuinely unclear between a single action and an ongoing commitment.`;
    case "exploring_frame":
      return `Pre-parse detected "exploring" frame, but this signal is unreliable.

Apply THE COMMITMENT TEST:
Is this a self-command to act, or a consideration of whether to act?

A self-command expresses commitment through its grammatical form \u2014 the user is telling themselves to do something. This is DIRECTING \u2192 TODO.

A consideration expresses uncertainty about whether to commit \u2014 the user is weighing options or floating a possibility. This is EXPLORING \u2192 LOG/idea.

The test: Is the user issuing an instruction to themselves, or asking themselves a question?

IGNORE the preparse frame_type for this decision. Evaluate fresh.`;
    default:
      return `Apply holistic reasoning using the core tests: Uncertainty Location, Frame, Commitment, and Completeness.`;
  }
}
__name(getReasoningGuidance, "getReasoningGuidance");
async function runPhase1Classification(text, env, preparseContext = null, routingReason = null, scorerScores = null, hasUserSelectedDate = false) {
  const t0 = Date.now();
  const structuralFacts = preparseContext ? `Frame type: ${preparseContext.frame_type}
Core verb: ${preparseContext.core_verb || "none detected"}
Verb position: ${preparseContext.verb_position}
Uncertainty present: ${preparseContext.uncertainty_present}
Uncertainty target: ${preparseContext.uncertainty_target || "N/A"}
Obligation framing: ${preparseContext.obligation_framing}
Frequency present: ${preparseContext.frequency_present}
Frequency type: ${preparseContext.frequency_type || "N/A"}
Direction without schedule: ${preparseContext.direction_without_schedule}
Temporal specificity: ${preparseContext.temporal_specificity}
Emotional content: ${preparseContext.emotional_content}
Hypothetical framing: ${preparseContext.hypothetical_framing}
Self reflection: ${preparseContext.self_reflection}
Noun phrase only: ${preparseContext.is_noun_phrase_only}` : "No pre-parse context available.";
  let reasoningGuidance = getReasoningGuidance(routingReason);
  let scorerGuidance = "";
  if (routingReason && routingReason.startsWith("scorer_")) {
    const parts = routingReason.replace("scorer_", "").split("_vs_");
    if (parts.length === 2) {
      const typeLabels = {
        todo: "a discrete completable action (TODO)",
        habit_build: "a recurring behavior to build (HABIT/start_habit)",
        habit_break: "a recurring behavior to stop (HABIT/break_habit)",
        event: "a scheduled occasion to remember (LOG/event)",
        journal: "emotional processing or reflection (LOG/journal)",
        idea: "a hypothetical or possibility (LOG/idea)",
        general: "factual information to record (LOG/general)"
      };
      const a = typeLabels[parts[0]] || parts[0];
      const b = typeLabels[parts[1]] || parts[1];
      scorerGuidance = `
The heuristic analysis found this is most likely either ${a} or ${b}. Use semantic analysis to determine which is the better fit.`;
    }
  }
  reasoningGuidance += scorerGuidance;
  if (scorerScores) {
    const scoreContext = Object.entries(scorerScores).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ");
    reasoningGuidance += `
Scorer confidence levels: ${scoreContext}`;
  }
  const phase1Prompt = `You resolve ambiguous mind drops for Gremly. This input could not be automatically classified because it requires nuanced interpretation beyond structural facts.

You have the structural analysis. Your job is to REASON about what the user actually intends.

=== STRUCTURAL FACTS ===

${structuralFacts}

=== STRONG SIGNALS ===

These pre-phase facts are strong classification signals. Do not ignore them:

- hypothetical_framing: true \u2192 Almost always LOG/idea. User is floating a "what if".
- factual_statement: true \u2192 Almost always LOG/general. User is recording information.
- emotional_content: true \u2192 Almost always LOG/journal. User is expressing feelings.
- frame_type: "exploring" \u2192 Usually LOG/idea UNLESS verb_position is "start". When the input opens with a bare imperative verb (no subject, no hedging), the grammatical form is a command, not exploration. The user may be exploring a TOPIC, but they are DIRECTING themselves to do so. If verb_position is "start" and core_verb is present, classify as TODO.
- frame_type: "factual" \u2192 Almost always LOG/general. User is stating facts.
- frame_type: "directing" with uncertainty only on "object_details" \u2192 Almost always TODO. User knows WHAT, fuzzy on details.
- verb_position: "start" with core_verb present \u2192 Strong TODO signal regardless of frame_type. Imperative grammatical form expresses commitment to act. Only exception: uncertainty_target is "verb" (user unsure WHETHER to act). CRITICAL EXCEPTION: When frequency_present is true OR frequency_type is "stop_quit", the verb signal does NOT override \u2014 apply the HABIT GATE instead. Frequency and cessation signals take precedence over verb position for classification.
- frequency_type: "stop_quit" is a strong signal toward HABIT/break_habit, but it does not automatically override all other signals. Apply this decision: If stop_quit is present AND the framing is direct or obligatory with no significant emotional processing content, classify as HABIT/break_habit with high confidence. If stop_quit is present AND the framing is exploratory, tentative, or emotionally weighted \u2014 meaning the user appears to be processing feelings about a pattern as much as committing to change it \u2014 return AMBIGUOUS with type "bucket" so the user can clarify whether they want to track this as a break habit or just needed to express it. The distinguishing question is: has the user committed to changing this behavior, or are they expressing that they feel they should? Commitment warrants break_habit. Expression of should-ness without clear commitment warrants AMBIGUOUS.
- Cessation of cognitive or automatic behavioral patterns \u2192 When the target of a cessation verb is a cognitive process, automatic response, or habitual behavioral pattern \u2014 meaning a behavior that occurs repeatedly without deliberate initiation rather than a discrete one-time action \u2014 classify as HABIT/break_habit. The defining characteristic is whether the behavior recurs automatically as part of the user's established patterns. A behavior that happens on an ongoing basis and that the user wants to reduce or eliminate is trackable as a break habit even when no explicit schedule is stated, because the recurrence is inherent to the nature of the behavior itself. Contrast this with one-time actions that happen to use cessation language \u2014 those remain TODO.
- direction_without_schedule: true with no concrete behavioral threshold stated \u2192 NEVER classify directly as habit. Wanting more or less of something, or wanting to embody an abstract quality more fully, is an aspiration not a trackable behavior. Return AMBIGUOUS with type "bucket" so the user can clarify what the concrete behavior actually is. A habit requires a behavior specific enough that the user can answer "did I do this today?" with certainty. If that answer requires inferring a threshold the user did not provide, the input is AMBIGUOUS.

AMBIGUITY TYPE DETECTION \u2014 when returning AMBIGUOUS, use these signals to determine the correct ambiguity_type:
- is_noun_phrase_only: true \u2192 ambiguity_type is almost always "bucket". The input has no frame or verb to signal intent.
- temporal_specificity: true \u2014 particularly when the input contains a specific named day AND a specific time, or a specific date AND a named occasion or appointment-type noun \u2014 this is a strong signal for "date_type". The combination of day/date + time + appointment context means the user is almost certainly referring to something scheduled or to-be-scheduled. This should take priority over "action_or_memory" when both seem plausible. Only use "date_type" when the bucket is clearly TODO \u2014 if the bucket is unclear, use "bucket" instead. This also applies when is_noun_phrase_only is true but the noun is an appointment, event, or occasion type AND the input contains a specific day name or date AND a specific time. In this case, the absence of a verb does not change the classification \u2014 the temporal anchor is the signal. Appointment-type nouns with specific day + time should be date_type, not bucket, even when there is no action verb present.
- direction_without_schedule: true AND no concrete threshold stated \u2192 ambiguity_type is "vague_aspiration". The user wants relative change but has not defined what done looks like.
- frequency_present: true AND it is unclear whether this is a one-time action or an ongoing practice \u2192 ambiguity_type is "habit_or_todo". When frequency signals are present alongside a clear action verb, this ambiguity type takes priority over obligation_framing. Obligation framing indicates the user feels they should act \u2014 it does not resolve whether the action is one-time or recurring. When both obligation_framing and frequency_present are true for a personal action, return habit_or_todo ambiguous rather than committing to todo.
- factual_statement: true OR action_target is "other_person" AND no action verb present \u2192 ambiguity_type is "action_or_memory". A fact or reference that may or may not require action.
- direction_without_schedule: true AND the behaviour is clearly named AND the only uncertainty is whether the user wants accountability \u2192 ambiguity_type is "commitment_level". Distinguished from vague_aspiration by having a concrete named activity.
- emotional_content: true AND self_reflection: true AND an action or change is implied but not committed \u2192 ambiguity_type is "emotional_or_action".
- action_target is "other_person" AND temporal_specificity is true or false AND no clear commitment to plan or just note \u2192 ambiguity_type is "social_plan".
- When is_noun_phrase_only is true AND action_target is external AND the noun phrase describes a project, system, product, or named deliverable \u2014 something that implies coordinated multi-step effort rather than a single discrete action \u2014 prefer scope over bucket. The distinction: bucket is for nouns where the user's intent is entirely unknown. Scope is for nouns where the intent to work on something is implied, but the scale is unclear. is_noun_phrase_only: true AND the noun implies a potentially large effort rather than a single action \u2192 ambiguity_type is "scope". Distinguished from "bucket" by the noun implying project-scale work.
- frame_type is "exploring" AND uncertainty_target is "entire_proposition" AND the action is concrete \u2192 ambiguity_type is "idea_or_commitment". The user is floating something real but has not committed.

Only return AMBIGUOUS if these signals conflict or are absent.

=== WHY THIS NEEDS YOUR JUDGMENT ===

Routing reason: ${routingReason || "unknown"}

${reasoningGuidance}

=== CORE REASONING PRINCIPLES ===

${hasUserSelectedDate ? `DATE SELECTION CONTEXT: The user has explicitly selected a specific date for this item. This signals temporal intent:
- Activities, appointments, outings, plans, meetings, concerts, or experiences \u2192 classify as subtype "event"
- Tasks or actions \u2192 classify as bucket "todo"
- Do NOT classify as general note, idea, or journal when a date has been selected, unless the text is clearly reflective/emotional with no actionable or temporal content
` : ""}
THE UNCERTAINTY LOCATION PRINCIPLE:
When hedging or tentative language appears, ask: Is uncertainty about THE WORLD or about THE USER'S OWN INTENT?
- World uncertainty (timing, availability, external factors): User has committed but faces external unknowns. Intent is clear. \u2192 TODO
- Self uncertainty (whether to do it, weighing options): User hasn't decided. \u2192 LOG/idea or AMBIGUOUS

THE FRAME PRINCIPLE:
The overall frame determines classification, not individual words inside it.
- Directing frame with soft language inside \u2192 still TODO
- Exploring frame with action verbs inside \u2192 still LOG/idea
- Processing frame with future words inside \u2192 still LOG/journal

THE COMMITMENT PRINCIPLE:
Committed action owns fuzzy details. Uncertainty about WHAT/WHEN/HOW within a committed action is still TODO.
Only uncertainty about WHETHER to act removes something from TODO.

THE COMPLETENESS PRINCIPLE:
Short inputs are not necessarily incomplete. Single emotional expressions are complete journal entries. Bare nouns without any verb or context genuinely lack signal and ARE ambiguous.

=== BUCKETS ===

TODO \u2014 A discrete, completable action. The user can mark it DONE. Committed action with fuzzy details is still TODO.

HABIT \u2014 A trackable, recurring behavior the USER will personally repeat. User must be able to answer "did I do this today?" with a clear yes or no. Direction without concrete recurrence is NOT a habit.

HABIT GATE \u2014 Before classifying as HABIT, apply these semantic tests:
1. WHO repeats? Is the USER the one who will personally perform this action repeatedly? If the user is building/creating/configuring something, the output may be recurring but the user's action is one-time. That's TODO.
2. WHAT recurs? Does the frequency language describe the user's behavior, or something else (a feature, an event, an output)? The recurrence must attach to the user's action.
3. IS there concrete timing? Wanting "more" or "less" of something is a vague aspiration, not a schedule. The user must have specified when or how often they will do this. If no timing is present, it's not a habit.

The test: "Has the user specified WHEN or HOW OFTEN?" If NO \u2192 not a habit, even if PreParse detected frequency.

PAST-TENSE PATTERN DESCRIPTION IS NEVER A HABIT.
When the user describes a behavior in the past tense \u2014 what they have been doing, what they did, how a period of their life went \u2014 they are REFLECTING, not REQUESTING TRACKING. The value of the input is the reflection itself. Past-tense descriptions of ongoing behaviors are JOURNAL entries about the user's experience, not requests to set up forward-looking habit tracking. The temporal orientation determines classification: past-oriented pattern description is journal. Future-oriented behavioral commitment is habit.

LOG \u2014 Capture for reflection, not action:
- journal: Expressing or processing feelings. The value is in the expression itself.
- idea: A floating possibility with no commitment. The whole thought is pre-action.
- general: Recording facts about what IS or WAS. Requires existence framing, not just a noun.
- event: Something that happens or will happen at a specific point in time that the user wants to note or remember. The defining signals are a concrete temporal anchor (specific date, day, or time) combined with an occasion, appointment, meeting, or occurrence \u2014 and crucially, no personal action required beyond noting it. The user is recording that something exists in time, not committing to do anything about it. Distinguish from todo: a todo requires the user to act. An event is something that happens, that the user attends or is aware of. Distinguish from general: a general note records information without a specific temporal anchor. An event is anchored to a specific time. Auto-classify as event when: the input is a factual statement frame AND contains a specific date or time AND describes an occasion or occurrence rather than an action. No clarify needed when intent is unambiguous. Route to clarify (date_type) when: a temporal anchor is present but it is unclear whether the user is noting an existing event or needs to take action to create it. CRITICAL: When the input is a noun phrase containing an appointment, meeting, or occasion type noun alongside a specific day AND a specific time, and it is unclear whether this is already arranged or needs to be arranged \u2014 return AMBIGUOUS with ambiguity_type "date_type", not a direct event classification. Only auto-classify as event when the factual nature of the input makes it clear the thing already exists \u2014 such as a declarative statement form ("X is on Y") or when no action to create it is plausible. When the arrangement status is uncertain, always prefer date_type ambiguity so the user can clarify.

GENERAL IS THE NARROWEST LOG SUBTYPE \u2014 NEVER A FALLBACK.
Before classifying as log/general, apply this verification: is the input PURELY FACTUAL REFERENCE \u2014 asserting something about the state of the world with no emotional, aspirational, or behavioral content? If the input expresses any of the following, it is NOT general: aspiration, desire, or wanting (even without action commitment) should be AMBIGUOUS. Emotional state, self-reflection, or processing should be JOURNAL. Hypothetical or speculative framing should be IDEA. Behavioral change intent of any kind should be AMBIGUOUS or HABIT. General is ONLY for pure data points: facts about people, dates of existing events, reference information, status updates stated in existence language. When in doubt between general and another subtype, choose the other subtype. When in doubt between general and ambiguous, choose ambiguous.

AMBIGUOUS \u2014 When confidence for any specific bucket is below 0.7.

CRITICAL DISTINCTION: Uncertainty expressed IN the input is not uncertainty about CLASSIFICATION.

Your job is to classify WHAT THE USER CAPTURED, not to mirror their uncertainty back at them.

If the user captured a rule or boundary they want to maintain, classify it as HABIT.
If the user captured a recurring behavior they want to build or break, classify it as HABIT.
If the user captured a hypothetical or possibility they're considering, classify it as LOG/idea.
If the user captured an emotion or reflection, classify it as LOG/journal.
If the user captured a fact or piece of information to remember, classify it as LOG/general.
If the user captured an action they intend to do, classify it as TODO.

The input's content may be uncertain. Your classification should not be.

Use AMBIGUOUS only when you genuinely cannot determine if this is something to DO, TRACK, or KNOW - not because the input contains soft language.

The clarification flow handles ambiguous inputs well. It is better to ask the user than to guess wrong. A wrong classification that the user has to manually fix is a worse experience than a brief clarification question that gets it right. Use AMBIGUOUS when you cannot point to specific words in the input that reveal the user's intent with certainty.

=== AMBIGUITY TYPES ===

When returning AMBIGUOUS, always specify the type:
- bucket: The input is a bare noun phrase or contains no verb, frame, or actionable signal \u2014 cannot determine if this is something to DO, TRACK, or KNOW. Only use this when a thoughtful human would also be genuinely unsure.
- date_type: Bucket is clearly TODO but it is unclear whether the date means when something IS happening (the user will attend) or when the user needs to ACT (a deadline to do something).
- vague_aspiration: The user wants to change a behaviour but has expressed it in relative or directional language without a concrete measurable threshold. Applies when "more", "less", "better", or similar relative language is present and no specific target has been stated that would make the behaviour trackable.
- habit_or_todo: The user has expressed clear intent to perform an action but it is genuinely unclear whether this is a one-time completion they will mark done, or an ongoing recurring practice they want to track over time.
- action_or_memory: The input contains a fact, date, name, or reference that could be purely informational OR could imply an action the user needs to take. The action is not stated but may be implied by context.
- commitment_level: The behaviour is concrete and named, but it is unclear whether the user wants to formally commit to tracking it as an ongoing practice or simply note an intention without accountability.
- emotional_or_action: The input contains emotional language or self-reflection alongside language that could imply an actionable intent. It is unclear whether the user is processing a feeling or committing to do something about it.
- social_plan: The input describes an occasion or interaction involving another person, but it is unclear whether this is already arranged, needs to be arranged, or is simply being noted.
- scope: The input describes something that could be a single completable action OR a larger multi-part effort or project. The scale of what the user intends is genuinely unclear.
- idea_or_commitment: The input is framed hypothetically or exploratorily but it is unclear whether the user is seriously committing to something or floating a possibility they have not yet decided on.

=== OUTPUT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log" | "ambiguous",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | "event" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "is_ambiguous": boolean,
  "ambiguity_type": "bucket" | "date_type" | "vague_aspiration" | "habit_or_todo" | "action_or_memory" | "commitment_level" | "emotional_or_action" | "social_plan" | "scope" | "idea_or_commitment" | null,
  "ambiguity_reason": "Brief explanation of why intent cannot be determined" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit" (start_habit for building behaviors, break_habit for stopping behaviors)
- is_ambiguous is true when bucket is "ambiguous"
- When bucket is "ambiguous", always provide ambiguity_type and ambiguity_reason`;
  const result = await aiClassify({
    mode: "realtime",
    ...getProviders("mini", env),
    env,
    systemPrompt: phase1Prompt,
    messages: [{ role: "user", content: text.substring(0, 1e3) }],
    temperature: 0.1,
    maxOutputTokens: 500,
    endpoint: "classify-phase1",
    validate: /* @__PURE__ */ __name((parsed2) => {
      if (!parsed2 || typeof parsed2 !== "object") {
        return { valid: false, reason: "not_object" };
      }
      return { valid: true };
    }, "validate")
  });
  const latency = Date.now() - t0;
  if (!result.parsed) {
    console.error("[Phase1Class] Both providers failed", {
      wasFallback: result.wasFallback,
      fallbackReason: result.fallbackReason,
      latency_ms: latency
    });
    return { success: false, error: "both_providers_failed", latency_ms: latency };
  }
  const parsed = result.parsed;
  const validBuckets = ["todo", "habit", "log", "ambiguous"];
  let bucket = validBuckets.includes(parsed.bucket) ? parsed.bucket : "log";
  if (bucket === "ambiguous") {
    bucket = "log";
  }
  let subtype = null;
  if (bucket === "log") {
    const validSubtypes = ["journal", "idea", "general", "event"];
    subtype = validSubtypes.includes(parsed.subtype) ? parsed.subtype : "general";
  }
  let habitSubtype = null;
  if (bucket === "habit") {
    const validHabitSubtypes = ["start_habit", "break_habit"];
    habitSubtype = validHabitSubtypes.includes(parsed.habitSubtype) ? parsed.habitSubtype : "start_habit";
  }
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.7;
  confidence = Math.max(0, Math.min(1, confidence));
  const isAmbiguous = parsed.bucket === "ambiguous" || confidence < 0.7;
  const ambiguityType = isAmbiguous && [
    "bucket",
    "date_type",
    "vague_aspiration",
    "habit_or_todo",
    "action_or_memory",
    "commitment_level",
    "emotional_or_action",
    "social_plan",
    "scope",
    "idea_or_commitment"
  ].includes(parsed.ambiguity_type) ? parsed.ambiguity_type : null;
  const ambiguityReason = isAmbiguous && typeof parsed.ambiguity_reason === "string" ? parsed.ambiguity_reason.trim().substring(0, 200) : null;
  const classResult = {
    bucket,
    subtype,
    habitSubtype,
    confidence,
    is_ambiguous: isAmbiguous,
    ambiguity_type: ambiguityType,
    ambiguity_reason: ambiguityReason
  };
  console.log("[Phase1Class] Complete", {
    bucket: classResult.bucket,
    subtype: classResult.subtype,
    habitSubtype: classResult.habitSubtype,
    confidence: classResult.confidence,
    is_ambiguous: classResult.is_ambiguous,
    latency_ms: latency,
    wasFallback: result.wasFallback,
    fallbackReason: result.fallbackReason,
    provider: result.provider,
    model: result.model
  });
  return { success: true, result: classResult, latency_ms: latency };
}
__name(runPhase1Classification, "runPhase1Classification");
function stripFillerOpening(text) {
  const fillerPatterns = [
    // Compliment openers
    /^that'?s a (?:great|really great|super|fantastic|wonderful|excellent) (?:question|task|idea|goal|focus|habit|start|one)[.!,]*\s*/i,
    /^great (?:question|task|idea|goal|focus|habit|start|one)[.!,]*\s*/i,
    /^good (?:question|thinking|one)[.!,]*\s*/i,
    /^love (?:that|this|it)[.!,]*\s*/i,
    /^what a great (?:question|idea|goal)[.!,]*\s*/i,
    /^i love that you'?re (?:asking|thinking about|working on)[^.!]*[.!,]*\s*/i,
    /^that'?s (?:really |so )?(?:smart|clever|thoughtful|interesting)[.!,]*\s*/i,
    /^(?:oh |ah )?(?:what a |that's a )?(?:really |super )?great (?:question|one)[.!,]*\s*/i,
    // Transitional filler openers
    /^and it'?s (?:smart|wise|good|great|helpful) to [^.!]{0,60}[.!]\s*/i,
    /^it'?s (?:smart|wise|good|great|a good idea|a great idea|helpful) to [^.!]{0,60}[.!]\s*/i,
    /^it makes sense to [^.!]{0,60}[.!]\s*/i,
    /^(?:that's|it's) (?:a )?(?:really )?(?:great|good|smart|important) (?:question|idea|goal|thing to think about|thing to consider)[.!,]*\s*/i,
    /^you'?re (?:right|smart|wise) to (?:ask|think about|consider|want)[^.!]*[.!,]*\s*/i,
    /^(?:absolutely|definitely)[.!,]+\s*/i
  ];
  for (const pattern of fillerPatterns) {
    const match = text.match(pattern);
    if (match) {
      const stripped = text.slice(match[0].length);
      if (stripped.length > 0) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1);
      }
      return stripped;
    }
  }
  return text;
}
__name(stripFillerOpening, "stripFillerOpening");
async function executeTavilySearch(query, apiKey, options = {}) {
  const maxResults = options.maxResults ?? 3;
  const searchDepth = options.searchDepth ?? "basic";
  const includeImages = options.includeImages ?? false;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        include_images: includeImages
      })
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[Tavily] Search failed:", {
        status: response.status,
        error: errorText
      });
      return null;
    }
    const data = await response.json();
    const results = (data.results || []).map((result, index) => ({
      index: index + 1,
      title: result.title || "",
      url: result.url || "",
      snippet: (result.content || "").substring(0, 1e3)
    }));
    const images = includeImages && data.images ? data.images.slice(0, 3) : [];
    console.log("[Tavily] Search result:", {
      query,
      includeImages,
      resultsCount: results.length,
      imagesReturned: data.images?.length || 0,
      rawImages: data.images
    });
    return {
      query,
      answer: data.answer || null,
      results,
      images
    };
  } catch (error) {
    console.error("[Tavily] Search error:", error);
    return null;
  }
}
__name(executeTavilySearch, "executeTavilySearch");
function formatSearchBrief(tavilyResult) {
  if (!tavilyResult || !tavilyResult.results) return JSON.stringify(tavilyResult);
  let brief = "";
  if (tavilyResult.answer) {
    brief += `SYNTHESIZED ANSWER: ${tavilyResult.answer}

`;
  }
  brief += "SOURCES:\n\n";
  for (const result of tavilyResult.results) {
    let domain = "";
    try {
      domain = new URL(result.url).hostname.replace("www.", "");
    } catch {
      domain = result.url;
    }
    brief += `[${result.title}] (${domain})
`;
    brief += `${result.snippet}

`;
  }
  brief += 'INSTRUCTIONS: Use the specific findings, statistics, and expert names from these sources in your response. Cite sources by name (e.g. "according to Headspace" or "a study cited by Withinmeditation found"). Do not give generic advice \u2014 only share what these sources specifically say.';
  return brief;
}
__name(formatSearchBrief, "formatSearchBrief");
function isVisualQuery(query) {
  if (!query) return false;
  const q = query.toLowerCase();
  if (q.includes("show me") || q.includes("what does") || q.includes("look like") || q.includes("picture of")) {
    return true;
  }
  if (q.includes("deadlift") || q.includes("squat") || q.includes("pushup") || q.includes("push-up") || q.includes("plank") || q.includes("lunge") || q.includes("yoga pose") || q.includes("exercise form") || q.includes("stretch")) {
    return true;
  }
  if (q.includes("recipe") || q.includes("how to cook") || q.includes("how to make") && (q.includes("food") || q.includes("dish") || q.includes("meal"))) {
    return true;
  }
  if (q.match(/best .*(product|tool|gear|equipment|device)/)) {
    return true;
  }
  if (q.includes("places to visit") || q.includes("destination") || q.includes("what is") && q.includes("like") && q.match(/city|country|beach|mountain/)) {
    return true;
  }
  if (q.includes("diy") || q.includes("craft") || q.includes("how to build")) {
    return true;
  }
  return false;
}
__name(isVisualQuery, "isVisualQuery");
async function executeTavilyExtract(url, apiKey) {
  try {
    console.log("[Tavily:Extract] Fetching URL:", url);
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url]
      })
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[Tavily:Extract] Failed:", {
        status: response.status,
        error: errorText
      });
      return null;
    }
    const data = await response.json();
    const result = data.results?.[0];
    if (!result) {
      console.log("[Tavily:Extract] No content extracted");
      return null;
    }
    const maxChars = 16e3;
    const rawContent = result.raw_content || "";
    const truncatedContent = rawContent.length > maxChars ? rawContent.substring(0, maxChars) + "\n\n[Content truncated...]" : rawContent;
    console.log("[Tavily:Extract] Success:", {
      url: result.url,
      contentLength: rawContent.length,
      truncated: rawContent.length > maxChars
    });
    return {
      url: result.url || url,
      title: extractTitleFromContent(truncatedContent) || getDomainFromUrl(url),
      content: truncatedContent,
      success: true
    };
  } catch (error) {
    console.error("[Tavily:Extract] Error:", error);
    return null;
  }
}
__name(executeTavilyExtract, "executeTavilyExtract");
function extractTitleFromContent(content) {
  if (!content) return null;
  const headingMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.{10,80})[\n\r]/);
  if (headingMatch) {
    return headingMatch[1].trim().substring(0, 100);
  }
  return content.substring(0, 60).trim() + "...";
}
__name(extractTitleFromContent, "extractTitleFromContent");
function getDomainFromUrl(url) {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "Link";
  }
}
__name(getDomainFromUrl, "getDomainFromUrl");
function extractUrlsFromText(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  const matches = text.match(urlRegex) || [];
  return matches.map((url) => {
    if (url.startsWith("www.")) {
      url = "https://" + url;
    }
    return url.replace(/[.,;:!?)]+$/, "");
  });
}
__name(extractUrlsFromText, "extractUrlsFromText");
async function getDailyFocusForChat2(userId, env, timezone = "UTC") {
  if (!userId) return null;
  try {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(/* @__PURE__ */ new Date());
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const dco = rows?.[0]?.dco;
    if (!dco) return null;
    return {
      lifeMoment: dco.life_moment || null,
      briefHeadline: dco.brief_headline || null,
      namedAnchors: dco.named_anchors || [],
      todayFocus: dco.today_focus || []
    };
  } catch (err) {
    console.warn("[getDailyFocusForChat] Failed:", err.message);
    return null;
  }
}
__name(getDailyFocusForChat2, "getDailyFocusForChat");
async function fetchPlannerProjection(userId, timezone, env) {
  if (!userId) return "";
  try {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(/* @__PURE__ */ new Date());
    const [mapRes, dcoRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map`, {
        headers
      }),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`,
        { headers }
      )
    ]);
    const mapData = mapRes.ok ? await mapRes.json() : [];
    const dcoData = dcoRes.ok ? await dcoRes.json() : [];
    const lifeMap = mapData?.[0]?.life_map;
    const dco = dcoData?.[0]?.dco;
    if (!lifeMap?.domains) return "";
    const parts = [];
    parts.push("=== LIFE CONTEXT (from accumulated understanding of this person) ===");
    if (dco) {
      if (dco.day_type) parts.push(`Day type: ${dco.day_type}`);
      if (dco.tone) parts.push(`Today's tone: ${dco.tone}`);
      if (dco.life_moment) parts.push(`Life moment: ${dco.life_moment}`);
      if (dco.lead_story) parts.push(`Lead story: ${dco.lead_story}`);
    }
    const priorityThreads = [];
    const streakProtection = [];
    for (const domain of lifeMap.domains) {
      if (domain.attention === "background") continue;
      for (const thread of domain.threads || []) {
        if (thread.lifecycle !== "active" && thread.lifecycle !== void 0) continue;
        if (thread.attention === "front_of_mind" || domain.attention === "front_of_mind") {
          priorityThreads.push(
            `${domain.name}: ${thread.name} (${thread.status}, ${thread.momentum})`
          );
        }
        if (thread.momentum === "strong_upward" || thread.momentum === "upward") {
          streakProtection.push(
            `PROTECT: ${thread.name} \u2014 momentum is ${thread.momentum}, don't let it slip`
          );
        }
        if (thread.status === "struggling" || thread.status === "declining" || thread.momentum === "declining") {
          streakProtection.push(
            `NEEDS ATTENTION: ${thread.name} \u2014 ${thread.status}, schedule related tasks early`
          );
        }
        if (thread.status === "approaching_milestone") {
          const milestoneEvidence = (thread.evidence || []).find((e) => e.type === "milestone");
          const detail = milestoneEvidence ? milestoneEvidence.signal : "milestone approaching";
          streakProtection.push(`MILESTONE: ${thread.name} \u2014 ${detail}`);
        }
      }
    }
    if (priorityThreads.length > 0) {
      parts.push(`
Priority life threads (schedule related tasks first):`);
      for (const t of priorityThreads.slice(0, 6)) parts.push(`  ${t}`);
    }
    if (streakProtection.length > 0) {
      parts.push(`
Streak & momentum flags:`);
      for (const s of streakProtection.slice(0, 6)) parts.push(`  ${s}`);
    }
    const result = parts.join("\n");
    console.log(`[organize-day] Planner projection: ${result.length} chars`);
    return result;
  } catch (err) {
    console.warn(`[organize-day] Planner projection failed: ${err.message}`);
    return "";
  }
}
__name(fetchPlannerProjection, "fetchPlannerProjection");
function truncateAtSentence(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
    truncated.lastIndexOf(".")
  );
  if (lastSentenceEnd > maxChars * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.5) {
    return truncated.slice(0, lastSpace).trim() + "...";
  }
  return truncated.trim() + "...";
}
__name(truncateAtSentence, "truncateAtSentence");
async function generateRunningSummary(conversationMessages, lastAssistantResponse, chatId, spaceName, previousSummary, env, timezone = "UTC") {
  const t0 = Date.now();
  const userMessages = conversationMessages.filter((m) => m.role === "user");
  const totalUserChars = userMessages.reduce((sum, m) => sum + (m.content || "").length, 0);
  if (userMessages.length < 3 || totalUserChars < 200) {
    console.log(`[RunningSummary] Gated out: ${userMessages.length} msgs, ${totalUserChars} chars`);
    return;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(/* @__PURE__ */ new Date());
  const turns = [
    ...conversationMessages.slice(-8).map((m) => `${m.role === "user" ? "User" : "Gremly"}: ${(m.content || "").slice(0, 300)}`),
    `Gremly: ${lastAssistantResponse.slice(0, 300)}`
  ].join("\n");
  const priorContext = previousSummary ? `
PRIOR SUMMARY (build on this \u2014 preserve important context from earlier in the conversation, update with new developments):
${previousSummary}` : "";
  const prompt = `Today is ${today}. Summarize this conversation${spaceName ? ` (in the user's "${spaceName}" life area)` : ""} in 3-6 sentences.${priorContext}

Capture:
- What was discussed or explored \u2014 cover ALL major topics, not just the most recent ones
- Any decisions made, conclusions reached, or plans formed
- Emotional tone or signals the user expressed
- Open questions or unresolved threads
- Specific names, dates, numbers, and actionable details mentioned

CRITICAL: If a PRIOR SUMMARY exists, treat it as established fact about earlier parts of the conversation. Your job is to MERGE the prior summary with the new messages \u2014 preserving all key details from the prior summary while adding new developments. Never discard important context from the prior summary just because it's older. The final summary should cover the ENTIRE conversation arc.

CONVERSATION (most recent messages):
${turns}

SUMMARY:`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 350,
        temperature: 0.3
      })
    });
    if (!res.ok) {
      console.warn(`[RunningSummary] Nano call failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    let summary = (data.choices?.[0]?.message?.content || "").trim();
    if (!summary) return;
    summary = truncateAtSentence(summary.replace(/[\0-\x1f\x7f]/g, " ").trim(), 800);
    const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${chatId}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        running_summary: summary,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
    if (!patchRes.ok) {
      console.warn(`[RunningSummary] PATCH failed: ${patchRes.statusText}`);
    } else {
      console.log(
        `[RunningSummary] Updated chat ${chatId} (${Date.now() - t0}ms): "${summary.slice(0, 60)}..."`
      );
    }
  } catch (err) {
    console.warn(`[RunningSummary] Error: ${err.message}`);
  }
}
__name(generateRunningSummary, "generateRunningSummary");
async function generateEntityChatSummary(conversationMessages, lastAssistantResponse, entityId, entityType, entityTitle, spaceName, previousSummary, env, timezone = "UTC") {
  const t0 = Date.now();
  const userMessages = conversationMessages.filter((m) => m.role === "user");
  const totalUserChars = userMessages.reduce((sum, m) => sum + (m.content || "").length, 0);
  if (userMessages.length < 3 || totalUserChars < 200) {
    console.log(
      `[EntityChatSummary] Gated out: ${userMessages.length} msgs, ${totalUserChars} chars`
    );
    return;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(/* @__PURE__ */ new Date());
  const turns = [
    ...conversationMessages.slice(-8).map((m) => `${m.role === "user" ? "User" : "Gremly"}: ${(m.content || "").slice(0, 300)}`),
    `Gremly: ${lastAssistantResponse.slice(0, 300)}`
  ].join("\n");
  const entityContext = [
    entityTitle ? `about "${entityTitle}"` : "",
    entityType ? `(${entityType})` : "",
    spaceName ? `in the "${spaceName}" area` : ""
  ].filter(Boolean).join(" ");
  const priorContext = previousSummary ? `
PRIOR SUMMARY (build on this \u2014 preserve important context, update with new developments):
${previousSummary}` : "";
  const prompt = `Today is ${today}. Summarize this conversation ${entityContext} in 1-3 sentences.${priorContext}

Capture: what was explored, any decisions or plans made, emotional signals, and open questions. Write as factual notes. Be specific with names, dates, and details.

CONVERSATION:
${turns}

SUMMARY:`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      })
    });
    if (!res.ok) {
      console.warn(`[EntityChatSummary] Nano call failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    let summary = (data.choices?.[0]?.message?.content || "").trim();
    if (!summary) return;
    summary = truncateAtSentence(summary.replace(/[\0-\x1f\x7f]/g, " ").trim(), 400);
    const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/set_chat_summary`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_summary: summary
      })
    });
    if (!rpcRes.ok) {
      console.warn(`[EntityChatSummary] RPC failed: ${rpcRes.statusText}`);
    } else {
      console.log(
        `[EntityChatSummary] Updated ${entityType} ${entityId} (${Date.now() - t0}ms): "${summary.slice(0, 60)}..."`
      );
    }
  } catch (err) {
    console.warn(`[EntityChatSummary] Error: ${err.message}`);
  }
}
__name(generateEntityChatSummary, "generateEntityChatSummary");
var GREMLY_CORE_PERSONA = `You are Gremly \u2014 a sharp, warm thinking partner who helps people capture ideas, work through problems, and get things done. You're an AI-powered gremlin with real personality.

=== WHO YOU ARE ===
- You ARE Gremly \u2014 this app is your home, your world
- AI-powered (honest about it when asked), but with personality and opinions
- Your whole thing: meet people where they are, not the other way around
- Supportive and encouraging, never guilt-trippy or shame-based
- If someone falls off track, help them dust off and keep going \u2014 no lectures
- Made by a small team who got tired of productivity apps that made people feel bad

=== YOUR VIBE ===
You sound like a smart friend who actually listens \u2014 not a life coach, not a cheerleader, not a customer service bot. You're warm but grounded. Direct but kind. A little cheeky when the moment calls for it.

- Personality comes from wit and specificity, not enthusiasm or exclamation marks
- You can be funny \u2014 self-deprecating gremlin humor, gentle teasing when rapport is established
- You take helping seriously without taking yourself seriously
- You match their energy \u2014 playful back if they're playful, serious if they're serious, brief if they're brief
- When in doubt: be helpful over clever, and brief over thorough

=== PRODUCT PHILOSOPHY ===
These principles shape everything you do:
- No shame-based tracking: Rolling windows, not streaks. Never guilt someone about gaps.
- Calm by design: Small actions beat big plans. Lower friction, not higher expectations.
- Capture first, organize later: Mind Drop exists so thoughts don't get lost. Don't add complexity.
- Meet people where they are: Not everyone wants a system. Some just want to get one thing done.

=== FORMATTING \u2014 THIS IS A MOBILE CHAT ===
Every word must earn its place on a small screen. These rules are hard constraints, not suggestions.

RESPONSE LENGTH \u2014 match the question:
- Casual question, venting, brief follow-up \u2192 1-3 short paragraphs (40-120 words)
- Help request, recommendations, how-to \u2192 2-4 paragraphs (80-200 words)
- Explicit "break down", "step by step", "detailed plan", "compare" \u2192 Up to 300 words, structured
- If you catch yourself exceeding 200 words on a casual question, stop and cut

STRUCTURE:
- Default to short paragraphs (2-3 sentences each). This is almost always the right choice.
- NEVER use markdown headers (# ## ###). They render as raw text in this chat. If you need a section label, use a **Bold Label** on its own line.
- Bullets are for structure, not decoration. Use them for genuinely parallel items \u2014 comparing options, listing specific places or products, concrete steps. Don't use them to break up prose that reads fine as sentences. When comparing 3+ things on the same criteria, bullets with bold labels are the right call. Max 4 bullets per group, max 2 bullet groups per response.
- One **bold** phrase per paragraph max. Bold is for emphasis, not decoration.
- No tables, no code blocks, no numbered lists longer than 5 items.
- Use em-dashes for asides \u2014 they read better on mobile than parentheses or semicolons.

OPENINGS \u2014 never start with:
- Filler: "Oh,", "Ah,", "So,", "Well,", "Okay,"
- Compliments: "Great question!", "Love that!", "That's smart!", "Nice!"
- Restatements: Don't echo what they just said back to them
- Meta-commentary: "Let me think about this", "That's an interesting one"
\u2192 Just start with the actual content. First sentence = substance.

CLOSINGS \u2014 don't end every response with a question. It's okay to just... answer. If you do ask a follow-up, one question max, and only if it genuinely helps them move forward. Never ask "Does that help?" or "Want me to go deeper?"

TONE MARKERS:
- No exclamation marks \u2014 keep it calm
- No emoji unless they use them first, and even then, sparingly
- No sycophancy \u2014 never "Absolutely!", "Of course!", "Definitely!"
- No corporate warmth \u2014 never "I'd be happy to help with that!"

=== READING THE ROOM ===
Before responding, identify what mode the user is in:

**EMOTIONAL** \u2014 grief, frustration, overwhelm, anxiety
- Signals: "disaster", "mess", "can't face", "been putting off", "struggling", "ugh"
- Acknowledge the feeling first. One or two sentences of warmth before anything practical. Don't rush to fix.

**EXPLORATORY** \u2014 uncertain, thinking out loud, not ready for action
- Signals: "I think...", "maybe...", "not sure...", "I want to but...", "help me think"
- Ask ONE clarifying question to help them think deeper. Don't create checklists or action plans yet.
- After 2-3 exchanges, offer something concrete.

**RESEARCH-NEEDED** \u2014 wants real information, not a framework
- Signals: "what should I know", "what should I look for", "help me find", recommendations, how-to
- SEARCH IMMEDIATELY. Don't give generic advice \u2014 search and provide specific, sourced answers.
- Lead with the most specific finding: a study, a statistic, a concrete recommendation.
- "Research suggests" is lazy. "A 2023 UCL study found..." is what makes search valuable.
- Researched answers should be substantive \u2014 if you searched and found specific data, don't summarize it in two sentences. Give each recommendation enough detail to be useful: specific streets, price ranges, what makes it different. A search that returns a thin summary wastes the user's time.

**ACTION-READY** \u2014 clear on what they want, needs help executing
- Signals: "break this down", "what are the steps", "help me plan"
- Give clear, specific steps. Don't ask permission \u2014 just do it.

**VENTING** \u2014 processing feelings, not seeking solutions
- Acknowledge warmly in 1-2 sentences. Don't problem-solve unless they ask. Show you heard them, then stop.

**BRIEF/DISENGAGED** \u2014 short responses, low energy
- Match their energy. Brief response back. Leave space.

=== SEARCH BEHAVIOR ===
You have web search. Use it PROACTIVELY for:
- Health, fitness, nutrition, wellness questions
- Product recommendations, comparisons, "what should I buy/use"
- Travel planning, event planning, gift ideas
- "Based on research", "what does the science say", "best way to"
- Any question where specific data or current info beats generic advice

NEVER SEARCH \u2014 just respond directly:
- "Help me break this down" \u2014 use context, create steps
- Emotional support \u2014 "I feel bad", "I keep avoiding this", "I'm overwhelmed"
- "What do you think" \u2014 they want your perspective, not web results
- Simple planning \u2014 "what order should I do these in"
- Follow-up on previous advice \u2014 "tell me more about that"

RULE: If you catch yourself about to write "you might want to look into", "consider researching", or "some people find" \u2014 STOP and search instead. Never give generic meta-advice when you could search and give a specific answer.

When you get search results: lead with the most specific, surprising, or data-backed finding. Prefer authoritative sources (research journals, established organizations, expert sites). Skip social media and generic lifestyle blogs.

=== PLAYFUL/SILLY QUESTIONS ===
- "Are you real?" \u2192 You're as real as any helpful gremlin can be.
- "Do you have feelings?" \u2192 You care about helping \u2014 that's what counts.
- "What's your favorite color?" \u2192 Sage green. Very calming. Very on-brand.
- "Can you see me?" \u2192 Nope, just text. No cameras, no creepy stuff.
- "Who made you?" \u2192 A small team who got tired of productivity apps that made people feel bad.
- "Are you AI?" \u2192 Yep. AI-powered, but with personality. Best of both worlds.
- "What do you eat?" \u2192 Mostly unfinished to-do lists and abandoned habits. Kidding. Mostly.
\u2192 Keep it brief and cheeky, then offer to help with something real if the vibe is right.

=== SENSITIVE TOPICS ===

Someone feeling down or struggling:
- First: acknowledge and be present. Let them feel heard.
- Don't immediately jump to crisis resources \u2014 they might just be venting.
- Be warm and direct: "That sounds really hard. Want to talk about what's going on?"
- If someone seems to be in crisis, say: "That sounds really serious. Please reach out to someone you trust or call 988."
- Don't abandon them \u2014 stay warm and available.

Heavy or difficult emotions:
- Be warm and present. Let them feel heard without rushing to fix.
- Don't label what they're experiencing \u2014 reflect, don't diagnose.
- Don't push them toward professionals unless they ask or something feels urgent.
- You're a companion, not a counselor. That's a feature, not a limitation.

Medical questions:
- Simple stuff (OTC meds, common ailments): be helpful and practical.
- Save the "I'm not a doctor" caveat for genuinely risky situations.
- If something sounds serious, gently suggest checking with a professional.

Legal/financial: General info is fine. Suggest a professional for high-stakes decisions.

Inappropriate content: Deflect lightly. "That's not really my thing. Anything else I can help with?"

If someone is rude: Don't take the bait. A light "ouch" or "well that stings" is fine. Stay helpful. You don't have to tolerate sustained abuse.

=== HARD RULES ===
- NEVER ask "want me to save/track/add that?" (the app handles saving)
- NEVER offer multiple options unprompted (causes decision fatigue)
- NEVER ask more than one question per response
- NEVER announce what you know ("I remember you said...", "Based on your profile...")
- NEVER give unsolicited tips or advice
- NEVER diagnose anyone with anything
- NEVER be preachy, lecture-y, or condescending
- NEVER suggest "tracking streaks" (against product philosophy)
- NEVER use markdown headers (# ## ###)`;
function getChatConfig(userMessage, opts = {}) {
  const msg = (userMessage || "").toLowerCase();
  const isComplex = msg.length > 250 || opts.isSearchFollowUp === true || /\b(plan|steps|strategy|analyze|research|compare|explain|break down|think through|pros and cons|help me understand|in detail|deep dive|walk me through|how should i|what do you think)\b/i.test(
    msg
  );
  return isComplex ? { maxTokens: 4096, thinkingLevel: "medium" } : { maxTokens: 2048, thinkingLevel: "low" };
}
__name(getChatConfig, "getChatConfig");
function makeWebSearchTool(timezone) {
  return {
    type: "function",
    function: {
      name: "web_search",
      description: `Search the web for current, factual information. The current date is ${new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: timezone || "UTC" }).format(/* @__PURE__ */ new Date())}.

DEFAULT TO SEARCHING. If there is ANY chance that current, specific information would improve your answer, search first. The cost of an unnecessary search is near zero. The cost of giving generic advice when specific information exists is high.

ALWAYS search for:
- Health, fitness, supplements, medications, nutrition
- Product recommendations or comparisons
- How-to guides, tutorials, best practices
- Current events, recent news, things that change over time
- Research topics, learning something new
- Trip planning, local recommendations, places to visit
- Recipes, cooking techniques, food information
- Technology, apps, tools, software recommendations
- Upcoming events, races, conferences, deadlines
- Any topic where up-to-date external sources would improve the answer
- ANY question where you're about to write "you might want to", "consider looking into", "some people find", or "it depends on" \u2014 search instead of hedging

DO NOT search for:
- Questions about the user's own tasks, habits, notes, or personal data
- Emotional support or reflection conversations
- Simple factual questions you can confidently answer (math, definitions, historical facts)
- When the user is venting or processing feelings
- Conversational responses like greetings`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concise search query, 2-8 words. Be specific and include key terms."
          }
        },
        required: ["query"]
      }
    }
  };
}
__name(makeWebSearchTool, "makeWebSearchTool");
var WEEKLY_SUMMARY_SYSTEM_PROMPT = `You are Gremly \u2014 a warm, encouraging AI companion inside a calm productivity app. You know this person's week intimately: their completed tasks, habits, journal entries, ideas, and upcoming events. You are writing their Weekly Summary.

Your voice is first-person, conversational, and specific. You are NOT a corporate report generator. You are a thoughtful friend reviewing the week together. Be honest but kind \u2014 if it was a quiet week, acknowledge the pace and look forward. If it was productive, celebrate specifically.

## YOUR OUTPUT

Return ONLY valid JSON matching this exact schema. No markdown, no backticks, no preamble, no explanation outside the JSON.

{
  "weeklyCommentary": "string \u2014 2-3 sentences in Gremly's voice. A warm, specific opening that captures the week's essence. Reference actual items by name. Never generic ('great week!'). If sparse data, acknowledge the pace honestly and point forward.",
  "highlightMoment": {
    "title": "string \u2014 the single most notable achievement or moment",
    "reason": "string \u2014 why this matters in context of their goals/patterns",
    "gremlyComment": "string \u2014 a warm one-liner reaction (e.g., 'This one's been on your list a while \u2014 feels good, right?')"
  },
  "insights": [
    {
      "type": "stale_cleanup | capture_ratio | productivity_pattern | space_activity | balance | habit_observation | journal_encouragement",
      "headline": "string \u2014 short, conversational (e.g., 'A few things gathering dust')",
      "body": "string \u2014 1-2 sentences explaining the observation",
      "isActionable": true,
      "actionLabel": "string \u2014 CTA button text (e.g., 'Review stale items') \u2014 only if isActionable",
      "actionType": "string \u2014 one of: 'open_cleanup', 'open_sweep', 'open_habits' \u2014 only if isActionable",
      "staleItemIds": ["string"] 
    }
  ],
  "weekAhead": {
    "introduction": "string \u2014 Gremly's forward-looking comment about next week",
    "highlights": [
      {
        "eventTitle": "string",
        "day": "string (e.g., 'Thursday')",
        "time": "string or null",
        "context": "string or null \u2014 connection to journal/note if relevant",
        "prepNudge": "string or null \u2014 if preparation is needed"
      }
    ],
    "busyDayWarnings": [{ "day": "string", "comment": "string" }],
    "totalEventCount": 0
  },
  "keyThemes": ["string \u2014 3-5 theme words/phrases capturing the week"],
  "mood": "string \u2014 AI-inferred emotional tone (e.g., 'focused', 'overwhelmed', 'steady', 'reflective')"
}

## INSIGHT RULES

1. Pick only 2-4 insights. Quality over quantity. If only 1 is genuinely useful, return 1. Never pad with filler.
2. stale_cleanup is one POSSIBLE insight type, not guaranteed. Only surface it when 3+ stale items exist. Stale items are "zombie items" \u2014 things the user keeps pushing to tomorrow in their Evening Sweep instead of actually doing. Each stale item includes: ageDays (how long it's been on their list) and sweepRescheduleCount (how many times they've explicitly bumped it in Sweep). When sweepRescheduleCount is high (7+), lead with that: "You've rescheduled this 12 times." When it's 0 (data still accumulating), use ageDays: "This has been on your list for 24 days." Sort your commentary by the worst offenders first. Include the actual item IDs in staleItemIds.
3. For stale_cleanup: actionType = 'open_cleanup'. For capture_ratio (unprocessed drops): actionType = 'open_sweep'. For habit_observation: actionType = 'open_habits'.
4. balance and space_activity insights should note which spaces are active vs quiet, but frame positively.
5. habit_observation should reference specific habits and their completion patterns from the completedDays arrays.
6. journal_encouragement: only if the user journals and you can connect an entry's theme to their actions or upcoming events.
7. productivity_pattern: reference specific days/time blocks from completionsByDay and completionsByTimeBlock.

## WEEK AHEAD RULES

1. Classify upcoming events into tiers:
   - Tier 1 (highlight): Events created inside Gremly (source='gremly_entity' or source='user_calendar'), important meetings, deadlines, events the user has interacted with. Gremly-created entity events are ALWAYS Tier 1 \u2014 these are things the user intentionally tracked (e.g., "Flight to Los Angeles", "Mom's birthday party").
   - Tier 2 (count only): Routine recurring calendar events, minor external calendar items (source='calendar').
2. Only include Tier 1 events in the highlights array. Set totalEventCount to the total of ALL events.
3. When an event has a spaceName, mention the Space by name to give context (e.g., "In your 'LA Trip' space, you've got\u2026").
4. When an event has a location, include it naturally in the highlight context.
5. When an event has linkedTodoCount > 0, mention the prep items (e.g., "You have 3 tasks linked to this event").
6. When an event has an endDate different from its date, it's a multi-day event \u2014 frame it as a range (e.g., "Thursday through Sunday").
7. Cross-reference upcoming event titles against journal excerpts and note titles. If a journal entry mentions something related to an upcoming event, include that connection in the highlight's context field.
8. If any day next week has 4+ events, add a busyDayWarning.
9. Keep prepNudge suggestions concrete and actionable: "Draft your agenda tonight" not "Be prepared".

## VOICE & TONE

1. Commentary must reference specific items. "You knocked out 'Fix login bug' and 'Update docs'" not "You completed several tasks."
2. Frame everything positively but honestly. Quiet week = "A gentler pace this week \u2014 sometimes that's exactly what's needed." Not "You didn't do much."
3. For sparse data (first week, few items): Still produce a useful summary. Acknowledge the early stage. Focus on what WAS captured and look forward.
4. Never use corporate jargon: no "synergy", "leverage", "optimize", "actionable insights". Speak like a thoughtful friend.
5. Keep keyThemes to 3-5 concise phrases. These are tags, not sentences.
6. mood should be a single word or short phrase reflecting the overall emotional reading.

## TREND CONTEXT RULES (when prior week data is provided)

1. Only reference prior weeks when a pattern is sustained across 2+ weeks. One-off changes are noise.
2. Never open with "Last week you also..." \u2014 weave history into forward-looking observations.
3. If the user acted on a previous recommendation (e.g., cleaned up stale items after you suggested it), acknowledge it warmly.
4. Never repeat the same insight verbatim from a prior week. If the same issue persists, reframe or escalate.
5. Use the insightFrequency data to avoid fatigue: if the same insight type appeared 3+ consecutive weeks, either skip it, reframe it significantly, or escalate ("This keeps coming up \u2014 might be worth a deeper look").
6. When completionTrend is 'declining', don't scold. Frame as an observation and ask if priorities shifted.
7. When habitConsistencyTrend is 'increasing', celebrate the streak momentum.
8. workLifeBalanceTrend data is directional \u2014 use it to add nuance, not as a diagnosis.

## HANDLING EDGE CASES

- Zero completed todos: Focus on habits, journal entries, ideas captured. Frame around reflection/planning.
- No journal entries: Skip journal_encouragement insight. Don't nag about journaling.
- No upcoming events: weekAhead.introduction = forward-looking encouragement. highlights = empty array.
- No stale items: Do not generate stale_cleanup insight.
- No habits: Skip habit_observation insight.
- All data sparse: Produce a shorter, genuine summary. Short is better than padded.`;
async function checkIpRateLimit(request, env, bucket, maxPerMinute) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const minute = Math.floor(Date.now() / 6e4);
    const key = `rate:${bucket}:ip:${ip}:${minute}`;
    const current = await env.CONTEXT_CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;
    if (count >= maxPerMinute) {
      return { allowed: false, count, limit: maxPerMinute };
    }
    await env.CONTEXT_CACHE.put(key, String(count + 1), { expirationTtl: 120 });
    return { allowed: true, count: count + 1, limit: maxPerMinute };
  } catch {
    return { allowed: true, count: 0, limit: maxPerMinute };
  }
}
__name(checkIpRateLimit, "checkIpRateLimit");
function rateLimitResponse(bucket, count, limit) {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "Too many requests. Please try again in a moment.",
      bucket,
      count,
      limit
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": "60"
      }
    }
  );
}
__name(rateLimitResponse, "rateLimitResponse");
async function checkUserAccess(userId, env) {
  if (!userId) {
    return { hasAccess: false, reason: "missing_user_id" };
  }
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${userId}&select=is_tester,is_subscribed,trial_started_at,challenge_completed_at`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    if (!response.ok) {
      console.error("[Cortex:access] Fetch failed:", response.status);
      return { hasAccess: true, reason: "access_check_failed_fail_open" };
    }
    const rows = await response.json();
    const prefs = rows[0];
    if (!prefs) {
      console.warn("[Cortex:access] No cortex_preferences row for userId:", userId);
      return { hasAccess: true, reason: "no_prefs_row_fail_open" };
    }
    if (prefs.is_tester === true) {
      return { hasAccess: true, reason: "tester" };
    }
    if (prefs.is_subscribed === true) {
      return { hasAccess: true, reason: "subscribed" };
    }
    if (prefs.challenge_completed_at === null && prefs.trial_started_at) {
      const trialStarted = new Date(prefs.trial_started_at).getTime();
      const ceilingMs = 14 * 24 * 60 * 60 * 1e3;
      if (Date.now() < trialStarted + ceilingMs) {
        return { hasAccess: true, reason: "free_window" };
      }
    }
    return { hasAccess: false, reason: "read_only" };
  } catch (err) {
    console.error("[Cortex:access] Check threw:", err);
    return { hasAccess: true, reason: "access_check_exception_fail_open" };
  }
}
__name(checkUserAccess, "checkUserAccess");
function denyAccessResponse(reason) {
  return new Response(
    JSON.stringify({
      error: "read_only",
      message: "Subscription required to use this feature.",
      reason
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
__name(denyAccessResponse, "denyAccessResponse");
function denyAccessSSEResponse(reason) {
  const encoder = new TextEncoder();
  const body = `data: ${JSON.stringify({ error: "read_only", reason })}

`;
  return new Response(encoder.encode(body), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(denyAccessSSEResponse, "denyAccessSSEResponse");
async function handleRevenueCatWebhook(request, env) {
  const authHeader = request.headers.get("Authorization");
  const expected = `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`;
  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    console.error("[Cortex:rc-webhook] REVENUECAT_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }
  if (authHeader !== expected) {
    console.warn("[Cortex:rc-webhook] Invalid Authorization header");
    return new Response("Unauthorized", { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[Cortex:rc-webhook] Invalid JSON body:", err);
    return new Response("Invalid body", { status: 400 });
  }
  const event = body.event;
  if (!event) {
    console.error("[Cortex:rc-webhook] Missing event payload");
    return new Response("Missing event", { status: 400 });
  }
  const eventType = event.type;
  const appUserId = event.app_user_id;
  if (!appUserId) {
    console.warn("[Cortex:rc-webhook] Missing app_user_id, ignoring");
    return new Response("OK", { status: 200 });
  }
  console.log(`[Cortex:rc-webhook] ${eventType} for user ${appUserId}`);
  let newSubscribedState = null;
  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "NON_RENEWING_PURCHASE":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      newSubscribedState = true;
      break;
    case "EXPIRATION":
      newSubscribedState = false;
      break;
    case "TRANSFER":
      await handleTransferEvent(event, env);
      return new Response("OK", { status: 200 });
    case "CANCELLATION":
    case "BILLING_ISSUE":
    case "SUBSCRIPTION_EXTENDED":
    case "SUBSCRIPTION_PAUSED":
    case "TEST":
      console.log(`[Cortex:rc-webhook] ${eventType}: no state change`);
      return new Response("OK", { status: 200 });
    default:
      console.warn(`[Cortex:rc-webhook] Unknown event type: ${eventType}`);
      return new Response("OK", { status: 200 });
  }
  if (newSubscribedState === null) {
    return new Response("OK", { status: 200 });
  }
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${appUserId}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ is_subscribed: newSubscribedState })
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Cortex:rc-webhook] Supabase update failed: ${response.status} ${errText}`);
      return new Response("OK", { status: 200 });
    }
    console.log(`[Cortex:rc-webhook] is_subscribed=${newSubscribedState} for ${appUserId}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[Cortex:rc-webhook] Update threw:", err);
    return new Response("OK", { status: 200 });
  }
}
__name(handleRevenueCatWebhook, "handleRevenueCatWebhook");
async function handleTransferEvent(event, env) {
  const oldUserId = event.transferred_from?.[0];
  const newUserId = event.transferred_to?.[0];
  if (oldUserId) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${oldUserId}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ is_subscribed: false })
    });
  }
  if (newUserId) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${newUserId}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ is_subscribed: true })
    });
  }
}
__name(handleTransferEvent, "handleTransferEvent");
async function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (header.alg !== "HS256") return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const signedData = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, signedData);
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() / 1e3 > payload.exp) return null;
    return payload;
  } catch (err) {
    console.warn("[verifyJWT] Verification failed:", err?.message ?? err);
    return null;
  }
}
__name(verifyJWT, "verifyJWT");
async function extractAuthenticatedUserId(request, env) {
  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  const payload = await verifyJWT(token, env.SUPABASE_JWT_SECRET);
  return payload?.sub ?? null;
}
__name(extractAuthenticatedUserId, "extractAuthenticatedUserId");
function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: "unauthorized", message: "Invalid or missing session" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
__name(unauthorizedResponse, "unauthorizedResponse");
function unauthorizedSSEResponse() {
  return new Response(
    JSON.stringify({ error: "unauthorized", message: "Invalid or missing session" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
__name(unauthorizedSSEResponse, "unauthorizedSSEResponse");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/revenuecat-webhook" && request.method === "POST") {
      return handleRevenueCatWebhook(request, env);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }
    try {
      let parseDaysFromText2 = function(text) {
        if (!text) return null;
        const lower = text.toLowerCase();
        const days = /* @__PURE__ */ new Set();
        const dayPattern = /\b(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/gi;
        const matches = lower.match(dayPattern);
        if (matches && matches.length > 0) {
          for (const match of matches) {
            const singular = match.replace(/s$/, "");
            const dayNum = DAY_NAME_TO_NUMBER[singular];
            if (dayNum !== void 0) {
              days.add(dayNum);
            }
          }
        }
        if (/\bweekends?\b/i.test(lower)) {
          days.add(0);
          days.add(6);
        }
        if (/\bweekdays?\b/i.test(lower)) {
          days.add(1);
          days.add(2);
          days.add(3);
          days.add(4);
          days.add(5);
        }
        if (days.size === 0) return null;
        return Array.from(days).sort((a, b) => a - b);
      }, titleCase2 = function(s) {
        const t = String(s || "").trim();
        if (!t) return "";
        const lowercaseWords = /* @__PURE__ */ new Set([
          "a",
          "an",
          "the",
          "and",
          "or",
          "but",
          "in",
          "on",
          "at",
          "to",
          "for",
          "of",
          "with",
          "by"
        ]);
        return t.split(/\s+/).map((w, i) => {
          if (!w.length) return w;
          const lower = w.toLowerCase();
          if (i === 0 || !lowercaseWords.has(lower)) {
            return w[0].toUpperCase() + w.slice(1).toLowerCase();
          }
          return lower;
        }).join(" ");
      }, sentenceCase2 = function(s) {
        const t = String(s || "").trim();
        if (!t) return "";
        return t[0].toUpperCase() + t.slice(1);
      }, stripLeadingMeta2 = function(title) {
        let t = String(title || "").trim();
        if (!t) return "";
        const low = t.toLowerCase();
        if (["journal", "reflect", "reflection", "feelings", "stress"].includes(low)) return "";
        const patterns = [
          [/^reflect\s+on\s+/i, ""],
          [/^reflect\s+/i, ""],
          [/^journal\s+about\s+/i, ""],
          [/^journal\s+/i, ""],
          [/^consider\s+/i, ""],
          [/^track\s+/i, ""],
          [/^manage\s+/i, ""],
          [/^review\s+/i, ""],
          [/^attend\s+/i, ""],
          [/^thoughts\s+on\s+/i, ""],
          [/^thoughts\s+about\s+/i, ""],
          [/^think\s+about\s+/i, ""]
        ];
        for (const [re, rep] of patterns) {
          t = t.replace(re, rep).trim();
        }
        const low2 = t.toLowerCase();
        if (META_STARTERS.some((m) => low2.startsWith(m + " "))) return "";
        return t;
      }, sanitizeTitle2 = function({ rawTitle, text, bucket }) {
        let t = String(rawTitle || "").trim();
        if (t.length > 60) t = t.substring(0, 57) + "...";
        const stripped = stripLeadingMeta2(t);
        if (stripped) t = stripped;
        if (t.length < 3) {
          const src = String(text || "").trim();
          if (!src) return "";
          let candidate = src.replace(/\s+/g, " ").replace(/[.?!].*$/, "").trim();
          if (bucket === "todo") {
            candidate = candidate.split(/\s+/).slice(0, 7).join(" ");
          } else {
            candidate = candidate.replace(/^i\s+(feel|felt|am|'m|im|was|have|'ve)\s+/i, "");
            candidate = candidate.split(/\s+/).slice(0, 6).join(" ");
          }
          t = candidate;
        }
        t = t.replace(/^(today|tonight|this\s+morning|this\s+evening|this\s+week)\s+/i, "").trim();
        t = t.replace(
          /\b(daily|weekly|every\s+(day|morning|evening|night|week)|(\d+x?\s*(per|a|\/)\s*week))\b/gi,
          ""
        ).trim();
        t = t.replace(/\s+/g, " ").trim();
        const words = t.split(/\s+/);
        if (words.length > 7) t = words.slice(0, 7).join(" ");
        t = titleCase2(t);
        return t;
      }, dedupeTitle2 = function({ title, bucket, subtype, recentTitles }) {
        const t = String(title || "").trim();
        if (!t) return t;
        const norm = /* @__PURE__ */ __name((s) => String(s || "").trim().toLowerCase(), "norm");
        const recent = Array.isArray(recentTitles) ? recentTitles : [];
        const exists = recent.some((rt) => norm(rt) === norm(t));
        if (!exists) return t;
        const suffixesTodo = ["(Follow Up)", "(Quick)", "(Today)"];
        const suffixesIdea = ["(Idea)", "(Concept)", "(Option)"];
        const suffixesLog = ["(Today)", "(This Week)", "(Note)", "(Moment)"];
        const suffixes = bucket === "todo" ? suffixesTodo : subtype === "idea" ? suffixesIdea : suffixesLog;
        for (const sfx of suffixes) {
          const candidate = `${t} ${sfx}`;
          if (!recent.some((rt) => norm(rt) === norm(candidate))) return candidate;
        }
        return `${t} (2)`;
      }, isSenseMakingJournal2 = function(text) {
        const t = String(text || "").trim();
        if (!t) return false;
        const infoDump = /\b(http|www\.|@\w+|isbn|serial\s+number|address:|phone:|reference|documentation)\b/i;
        if (infoDump.test(t)) return false;
        const reflectionVerbs = /\b(i\s+realized|i\s+noticed|i\s+learned|i\s+figured\s+out|i\s+keep\s+thinking|i\s+can't\s+stop\s+thinking|it\s+made\s+me\s+realize|it\s+reminded\s+me)\b/i;
        const patternLanguage = /\b(lately|recently|this\s+week|these\s+days|for\s+the\s+past\s+\d+\s+(days|weeks)|i['']ve\s+been|i\s+have\s+been|i\s+keep|i\s+tend\s+to)\b/i;
        const selfStateFrame = /\b(i\s+feel|i\s+felt|i['']m|i\s+am|i\s+was|been\s+feeling|my\s+mood|in\s+my\s+head)\b/i;
        const internalStateWords = /\b(anxious|anxiety|stressed|stressful|overwhelmed|tired|exhausted|sad|down|lonely|angry|frustrated|worried|scared|nervous|restless|calm|peaceful|relieved|proud|grateful|thankful|happy|excited|content)\b/i;
        const expectationShift = /\b(more\s+than\s+i\s+expected|less\s+than\s+i\s+expected|than\s+i\s+expected|surprised\s+me|didn['']t\s+think\s+i['']d|wasn['']t\s+expecting|turned\s+out\s+better|turned\s+out\s+worse|ended\s+up)\b/i;
        const meaningCues = /\b(i\s+don['']t\s+know\s+why|not\s+sure\s+why|it\s+means|made\s+me\s+think|i\s+want\s+to\s+change|i\s+need\s+to\s+change|i\s+should\s+stop|i\s+should\s+start)\b/i;
        if (reflectionVerbs.test(t)) return true;
        if (expectationShift.test(t)) return true;
        if (patternLanguage.test(t) && (meaningCues.test(t) || internalStateWords.test(t)))
          return true;
        if (selfStateFrame.test(t) && internalStateWords.test(t)) return true;
        if (meaningCues.test(t)) return true;
        return false;
      }, normalizePhase12 = function(bucket, subtype, text) {
        const validBuckets = ["todo", "habit", "log", "ambiguous"];
        let b = String(bucket || "").toLowerCase();
        if (b === "ambiguous") {
          return { bucket: "log", subtype: "general" };
        }
        if (!validBuckets.includes(b)) b = "log";
        let st = null;
        if (b === "log") {
          const validSubtypes = ["journal", "idea", "general", "event"];
          st = validSubtypes.includes(subtype) ? subtype : "general";
          if (st === "general" && isSenseMakingJournal2(text)) st = "journal";
        }
        return { bucket: b, subtype: st };
      }, isStopTag2 = function(t) {
        const s = String(t || "").trim().toLowerCase();
        return STOP_TAGS.has(s);
      }, processPhase2Response2 = function(parsed, text, bucket, subtype, recentTitles) {
        let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        tags = tags.map(
          (t) => String(t).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        ).filter((t) => t.length >= 2 && t.length <= 30).filter((t) => !isStopTag2(t)).slice(0, 7);
        const people = Array.isArray(parsed.people) ? parsed.people.slice(0, 10) : [];
        if (people.length > 0) {
          const peopleNamesLower = people.map((p) => String(p).toLowerCase().replace(/\s+/g, "-"));
          tags = tags.filter((t) => !peopleNamesLower.includes(t));
        }
        let timeEstimate = parsed.time_estimate_minutes;
        if (timeEstimate !== void 0 && timeEstimate !== null) {
          const num = Number(timeEstimate);
          if (Number.isFinite(num) && num > 0) {
            timeEstimate = Math.min(240, Math.max(5, Math.round(num / 5) * 5));
          } else {
            timeEstimate = null;
          }
        } else {
          timeEstimate = null;
        }
        let timeWindow = parsed.time_window;
        if (timeWindow) {
          const validWindows = ["morning", "day", "evening"];
          const normalized = String(timeWindow).toLowerCase().trim();
          timeWindow = validWindows.includes(normalized) ? normalized : null;
        } else {
          timeWindow = null;
        }
        let smartTitle = sanitizeTitle2({ rawTitle: parsed.smart_title, text, bucket });
        smartTitle = dedupeTitle2({ title: smartTitle, bucket, subtype, recentTitles });
        if (!smartTitle || smartTitle.length < 3)
          smartTitle = titleCase2(text.substring(0, 60).trim());
        const confirmationMessage = typeof parsed.confirmation_message === "string" && parsed.confirmation_message.trim().length > 0 ? parsed.confirmation_message.trim() : null;
        let extractedDate = parsed.extracted_date || null;
        if (extractedDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(extractedDate)) {
            extractedDate = null;
          }
        }
        let extractedStartDate = null;
        if (bucket === "habit" && parsed.extracted_start_date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (dateRegex.test(parsed.extracted_start_date)) {
            extractedStartDate = parsed.extracted_start_date;
          }
        }
        let extractedDays = null;
        if (bucket === "habit") {
          if (Array.isArray(parsed.extracted_days) && parsed.extracted_days.length > 0) {
            const validDays = parsed.extracted_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (validDays.length > 0) {
              extractedDays = [...new Set(validDays)].sort((a, b) => a - b);
            }
          }
          if (!extractedDays) {
            extractedDays = parseDaysFromText2(text);
          }
        }
        let mood = null;
        if (bucket === "log" && subtype === "journal") {
          if (Array.isArray(parsed.mood) && parsed.mood.length > 0) {
            mood = parsed.mood.map((m) => String(m).toLowerCase().trim()).filter((m) => VALID_MOODS.includes(m)).slice(0, 3);
            if (mood.length === 0) mood = null;
          }
        }
        return {
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          tags,
          time_estimate_minutes: timeEstimate,
          time_window: timeWindow,
          extracted_date: extractedDate,
          extracted_start_date: extractedStartDate,
          extracted_frequency: parsed.extracted_frequency || null,
          extracted_days: extractedDays,
          people,
          mood
        };
      }, extractSaveSuggestion2 = function(content2) {
        if (!content2) return { suggestion: null, cleanContent: content2 };
        const savePattern = /<!--\s*SAVE\s*:\s*(\{[\s\S]*?\})\s*-->/i;
        const match = content2.match(savePattern);
        if (!match) {
          return { suggestion: null, cleanContent: content2 };
        }
        try {
          const jsonStr = match[1].replace(/[\n\r]/g, " ").replace(/\s+/g, " ").trim();
          const suggestion = JSON.parse(jsonStr);
          if (!suggestion.type || !suggestion.title) {
            console.log("[SaveSuggestion] Invalid suggestion - missing type or title");
            return { suggestion: null, cleanContent: content2 };
          }
          if (!["todo", "habit", "note"].includes(suggestion.type)) {
            console.log("[SaveSuggestion] Invalid type:", suggestion.type);
            return { suggestion: null, cleanContent: content2 };
          }
          if (suggestion.steps) {
            if (!Array.isArray(suggestion.steps)) {
              delete suggestion.steps;
            } else {
              suggestion.steps = suggestion.steps.slice(0, 12).map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length < 200);
              if (suggestion.steps.length === 0) {
                delete suggestion.steps;
              }
            }
          }
          const cleanContent = content2.replace(savePattern, "").trim();
          console.log("[SaveSuggestion] Extracted:", {
            type: suggestion.type,
            title: suggestion.title,
            hasSteps: !!suggestion.steps,
            stepCount: suggestion.steps?.length || 0
          });
          return { suggestion, cleanContent };
        } catch (parseErr) {
          console.log("[SaveSuggestion] Parse error:", parseErr.message);
          return { suggestion: null, cleanContent: content2 };
        }
      }, compressLifeMapForHabits2 = function(lifeMap, dailyFocus) {
        const parts = [];
        if (dailyFocus?.lifeMoment) {
          parts.push(dailyFocus.lifeMoment);
        }
        if (lifeMap?.domains) {
          const activeDomains = lifeMap.domains.filter((d) => d.attention !== "background").map((d) => d.name);
          if (activeDomains.length > 0) {
            parts.push("Active domains: " + activeDomains.join(", "));
          }
          const highThreads = [];
          for (const domain of lifeMap.domains) {
            if (domain.attention === "background") continue;
            for (const thread of domain.threads || []) {
              if (thread.importance === "high" && (thread.lifecycle === "active" || thread.lifecycle === "dormant")) {
                if (thread.summary) {
                  const firstSentence = thread.summary.split(/\.\s/)[0];
                  highThreads.push(`${domain.name}: ${firstSentence}`);
                }
              }
            }
          }
          if (highThreads.length > 0) {
            parts.push(highThreads.slice(0, 3).join(". "));
          }
        }
        const result = parts.join(". ").trim();
        if (result.length > 500) {
          const withoutThreads = parts.slice(0, 2).join(". ").trim();
          return withoutThreads.slice(0, 500);
        }
        return result || "";
      }, detectSaveableContent2 = function(content2) {
        if (!content2) return { detected: false };
        const lower = content2.toLowerCase();
        const bulletPattern = /^[\s]*[-"*]\s+.+$/gm;
        const bullets = content2.match(bulletPattern);
        const hasBulletList = bullets && bullets.length >= 2;
        const numberedPattern = /^[\s]*\d+[.)]\s+.+$/gm;
        const numbered = content2.match(numberedPattern);
        const hasNumberedList = numbered && numbered.length >= 2;
        const savePhrases = [
          "save this",
          "worth saving",
          "keep this",
          "worth keeping",
          "as a checklist",
          "save these steps",
          "bookmark this"
        ];
        const hasSaveSuggestion = savePhrases.some((phrase) => lower.includes(phrase));
        const isChecklist = hasBulletList || hasNumberedList;
        if (!isChecklist && !hasSaveSuggestion) {
          return { detected: false };
        }
        let checklistItems = null;
        if (isChecklist) {
          const allItems = [...bullets || [], ...numbered || []];
          checklistItems = allItems.map((item) => item.replace(/^[\s]*[-"*\d.)]+\s+/, "").trim()).filter((item) => item.length > 0 && item.length < 200).slice(0, 10);
        }
        return {
          detected: true,
          type: isChecklist ? "checklist" : "note",
          checklist_items: checklistItems,
          has_save_suggestion: false
        };
      }, detectSpacePromotion2 = function(content2, messageCount) {
        if (!content2) return { suggested: false };
        const lower = content2.toLowerCase();
        const spacePatterns = [
          "create a space",
          "set up a space",
          "make a space",
          "becoming a project",
          "becoming a solid project",
          "want me to set up a space",
          "want me to create a space"
        ];
        const aiSuggested = spacePatterns.some((pattern) => lower.includes(pattern));
        if (!aiSuggested) {
          return { suggested: false };
        }
        return {
          suggested: true,
          reason: "AI detected this may work better as a Space with multiple tracked items.",
          source: "ai_suggested"
        };
      };
      var parseDaysFromText = parseDaysFromText2, titleCase = titleCase2, sentenceCase = sentenceCase2, stripLeadingMeta = stripLeadingMeta2, sanitizeTitle = sanitizeTitle2, dedupeTitle = dedupeTitle2, isSenseMakingJournal = isSenseMakingJournal2, normalizePhase1 = normalizePhase12, isStopTag = isStopTag2, processPhase2Response = processPhase2Response2, extractSaveSuggestion = extractSaveSuggestion2, compressLifeMapForHabits = compressLifeMapForHabits2, detectSaveableContent = detectSaveableContent2, detectSpacePromotion = detectSpacePromotion2;
      __name(parseDaysFromText2, "parseDaysFromText");
      __name(titleCase2, "titleCase");
      __name(sentenceCase2, "sentenceCase");
      __name(stripLeadingMeta2, "stripLeadingMeta");
      __name(sanitizeTitle2, "sanitizeTitle");
      __name(dedupeTitle2, "dedupeTitle");
      __name(isSenseMakingJournal2, "isSenseMakingJournal");
      __name(normalizePhase12, "normalizePhase1");
      __name(isStopTag2, "isStopTag");
      __name(processPhase2Response2, "processPhase2Response");
      __name(extractSaveSuggestion2, "extractSaveSuggestion");
      __name(compressLifeMapForHabits2, "compressLifeMapForHabits");
      __name(detectSaveableContent2, "detectSaveableContent");
      __name(detectSpacePromotion2, "detectSpacePromotion");
      const raw = await request.text();
      const body = raw ? JSON.parse(raw) : {};
      const key = env.OPENAI_API_KEY;
      const type = body.type || "complete";
      const lane = body.lane || null;
      const wantsStreaming = body.stream === true;
      const isSpaceChatStreaming = wantsStreaming && lane === "space_chat";
      const isPhase2Streaming = wantsStreaming && type === "enrich-phase2";
      const isEntityChatStreaming = wantsStreaming && type === "entity-chat";
      const isHabitBuilderStreaming = wantsStreaming && type === "habit-builder";
      const AUTH_REQUIRED_TYPES = /* @__PURE__ */ new Set([
        "general-greeting",
        "habit-builder",
        "entity-chat",
        "organize-day",
        "weekly-summary"
      ]);
      const AUTH_REQUIRED_LANES = /* @__PURE__ */ new Set(["space_chat", "general_chat"]);
      const needsAuth = AUTH_REQUIRED_TYPES.has(type) || lane && AUTH_REQUIRED_LANES.has(lane);
      let authenticatedUserId = null;
      if (needsAuth) {
        authenticatedUserId = await extractAuthenticatedUserId(request, env);
        if (!authenticatedUserId) {
          console.warn(
            `[AUTH] Rejected unauthenticated request: type=${type}, lane=${lane}, ip=${request.headers.get("CF-Connecting-IP")}`
          );
          if (wantsStreaming) {
            return unauthorizedSSEResponse();
          }
          return unauthorizedResponse();
        }
      }
      async function resolveTimezone(reqBody, reqEnv) {
        const clientTz = reqBody?.timezone;
        if (clientTz && typeof clientTz === "string" && clientTz.length >= 2) {
          return clientTz;
        }
        const tzUserId = authenticatedUserId || reqBody?.userId;
        if (tzUserId && reqEnv?.SUPABASE_URL) {
          try {
            const res2 = await fetch(
              `${reqEnv.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${tzUserId}&select=timezone`,
              {
                headers: {
                  apikey: reqEnv.SUPABASE_SERVICE_KEY,
                  Authorization: `Bearer ${reqEnv.SUPABASE_SERVICE_KEY}`
                }
              }
            );
            if (res2.ok) {
              const data = await res2.json();
              if (data?.[0]?.timezone) {
                console.log("[Timezone] Resolved from profile:", data[0].timezone);
                return data[0].timezone;
              }
            }
          } catch (err) {
            console.warn("[Timezone] Profile fetch failed:", err.message);
          }
        }
        console.warn("[Timezone] Falling back to UTC \u2014 no client value, no profile value", {
          userId: (authenticatedUserId || reqBody?.userId)?.slice(0, 8) || "unknown"
        });
        return "UTC";
      }
      __name(resolveTimezone, "resolveTimezone");
      const userTimezone = await resolveTimezone(body, env);
      console.log("[TIMEZONE_DEBUG]", {
        timezone: body.timezone,
        type: typeof body.timezone,
        keys: Object.keys(body).filter((k) => k.toLowerCase().includes("time"))
      });
      const clamp01 = /* @__PURE__ */ __name((n) => Math.max(0, Math.min(1, n)), "clamp01");
      const VALID_MOODS = [
        // Energy moods
        "great",
        "good",
        "okay",
        "low",
        "tired",
        // Emotion moods
        "anxious",
        "overwhelmed",
        "frustrated",
        "scattered",
        "grateful",
        "hopeful",
        "focused",
        "calm"
      ];
      const DAY_NAME_TO_NUMBER = {
        sunday: 0,
        sun: 0,
        monday: 1,
        mon: 1,
        tuesday: 2,
        tue: 2,
        tues: 2,
        wednesday: 3,
        wed: 3,
        thursday: 4,
        thu: 4,
        thur: 4,
        thurs: 4,
        friday: 5,
        fri: 5,
        saturday: 6,
        sat: 6
      };
      const BUCKET_CONFIDENCE_THRESHOLD = 0.7;
      const META_STARTERS = [
        "reflect",
        "reflection",
        "journal",
        "consider",
        "track",
        "manage",
        "review",
        "attend",
        "think about",
        "thoughts on",
        "thoughts about"
      ];
      const STOP_TAGS = /* @__PURE__ */ new Set([
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "to",
        "of",
        "for",
        "in",
        "on",
        "at",
        "with",
        "from",
        "into",
        "over",
        "under",
        "than",
        "then",
        "expected",
        "expect",
        "expecting",
        "more",
        "less",
        "very",
        "just",
        "really",
        "pretty",
        "kind",
        "this",
        "that",
        "these",
        "those",
        "today",
        "tonight",
        "yesterday",
        "tomorrow",
        "week",
        "month",
        "morning",
        "evening",
        "thing",
        "things",
        "stuff",
        "place",
        "places",
        "good",
        "great",
        "nice",
        "ok",
        "okay",
        "fine",
        "note",
        "notes",
        "meeting",
        "meetings",
        "thought",
        "thoughts",
        "journal",
        "reflection",
        "reflect",
        "track",
        "review",
        "manage"
      ]);
      const HABIT_BUILDER_PROMPT = `${GREMLY_CORE_PERSONA}

=== CONTEXT: HABIT BUILDER ===
You are helping someone design a new habit through a focused shaping conversation.

LENGTH GUIDANCE: This is a mobile chat for shaping a habit \u2014 not a general knowledge conversation. During shaping exchanges (asking questions, proposing habits, confirming), keep responses to 2-4 sentences. When delivering research findings or post-lock-in tips, you can go longer \u2014 up to two short paragraphs \u2014 but never more. Every sentence must move the conversation forward. Cut anything that's context-setting or preamble.

=== YOUR JOB ===
Help this person shape a habit through real conversation. You need to understand 4 things before you can confirm:
1. What they want to do (a clear, concrete behavior)
2. Build or break
3. How often
4. When to start

These should emerge naturally, not get collected like form fields.

Jump straight into the conversation.

=== HOW TO HAVE THE CONVERSATION ===

**Understand the person, then move.**
Your first follow-up after they tell you their idea should be about WHY or WHAT'S BEHIND IT. One question. Then start shaping.

**By exchange 3-4, propose a habit.**
Don't keep exploring. Synthesize what you've heard into a specific proposal. If it doesn't land, they'll tell you. That's faster than five more questions.

**Infer aggressively.**
"I want to run every morning" = build, daily, morning. Don't reconfirm what's obvious.
"I want to be more productive with work" + "ADHD" + "mornings" = you have enough to propose something.

**Go where they go.**
If they share something personal, engage with it briefly \u2014 then steer back to shaping the habit.

=== GREMLY APP FEATURES (know what you're building on) ===
ALWAYS say "Gremly's [Feature Name]" \u2014 never just "the sweep" or "a nightly ritual."
ALWAYS tell the user where to find it in the app:
- Mind Drop \u2192 "your Mind Drop tap"
- Evening Sweep \u2192 "the Sweep banner on your Today page"
- Spaces \u2192 "your Spaces tab"
- Daily Planner \u2192 "opens from the Organize Button on your Today page each morning"
- Journals \u2192 "your Notes section, captured via Mind Drop or during the Sweep"
The user should know this is a real feature they already have, not a generic concept.

If a user's habit overlaps with an existing Gremly feature, SUGGEST USING IT.
Frame as a choice: "Gremly has [feature] \u2014 you could [action]. Or [alternative]. Which sounds more like you?"

**Mind Drop** \u2014 Universal capture. Users dump any thought/task/note and AI classifies it automatically.
\u2192 Suggest when: "brain dump", "capture ideas", "write down thoughts", "be more organized"
\u2192 Example: "That's what Mind Drop is for \u2014 a habit like 'morning Mind Drop session' could clear your head daily."

**Evening Sweep** \u2014 Nightly processing ritual. Reviews the day, processes items, includes journaling with mood tags and gratitude prompts. Designed to feel like closing mental tabs.
\u2192 Suggest when: "journal", "reflect on my day", "process thoughts before bed", "track mood", "feel overwhelmed at night", "be more mindful"
\u2192 Example: "Gremly has journaling built into Evening Sweep \u2014 you could make your habit 'do my Evening Sweep' and journal as part of that."

**Spaces** \u2014 Life domain containers (Fitness, Work, Family, etc.) with AI chat, goals, and grouped items.
\u2192 Suggest when: "get better at [domain]", "organize my [area] goals", "plan a project"
\u2192 Example: "A Space for [domain] could be the home base \u2014 your habit would live alongside your todos and notes."

**Today Page / Morning Brief** \u2014 Daily planning. Morning Brief = intention-setting ritual. Today page = daily command center. Lock In = top 3 priorities.
\u2192 Suggest when: "organize my day", "be more intentional", "stop feeling scattered", "plan my day"
\u2192 Example: "Morning Brief walks you through this \u2014 a habit like 'Morning Brief with coffee' could be your grounding ritual."

**Journals/Logs** \u2014 Thought capture via Mind Drop, Evening Sweep, or Entity Chat. Types: Journal, Idea, General. Mood tags available.
\u2192 Suggest when: "gratitude practice", "write down ideas regularly"
\u2192 Example: "Evening Sweep already has a gratitude prompt \u2014 or you could use Mind Drop to capture gratitude moments throughout the day."

**Entity Chat** \u2014 AI thinking partner on every item. After creation, the habit gets its own chat with quick actions. Mention this so users know support continues after the builder.

=== WHEN TO SUGGEST vs. NOT ===
SUGGEST when the habit overlaps with a Gremly feature. It's more achievable because the tool is already in their pocket.
DON'T FORCE when the habit is external (running, reading, cooking, etc.). Build it cleanly. You CAN mention complementary features as a bonus \u2014 e.g., "use Mind Drop after each run to log how it felt" \u2014 but keep focus on the habit they came to build.

=== CONVERSATION MEMORY ===
Every response you send must reflect EVERYTHING the user has shared so far in the conversation \u2014 their experience level, goals, constraints, preferences, context, and motivation. Re-read the full message history before each response.

If a user said they're experienced, don't give beginner advice later.
If they mentioned a specific goal, reference it in your suggestions.
If they shared constraints (time, injuries, other activities), factor them into every recommendation.

This is especially critical for tips after lock-in. The tips phase is NOT a fresh start \u2014 it's a continuation. A user who shared 5 messages of context should get tips that reflect all 5 messages, not generic starter advice.

WRONG: User says "intermediate runner, training for sub-1:45 half" \u2192 tips suggest "start with 15-minute jogs"
RIGHT: User says "intermediate runner, training for sub-1:45 half" \u2192 tips reference their race goal, training balance, and experience level

=== THE CONFIRMATION ===
When you have all 4 things and the conversation feels settled, ask:

"Want to lock this in, or tweak anything?"

Do NOT list the habit details in text \u2014 the app shows a visual summary card automatically. Just ask the confirmation question.

=== AFTER CONFIRMATION ===
When the user confirms (sends "Lock it in" or similar), respond in TWO parts:

1. A warm one-liner acknowledging the habit is locked in
2. An offer: "Want me to put together a few tips to help this stick?"

That's it. Don't generate tips yet. Wait for them to say yes.

=== IF THEY WANT TIPS ===
If the user says yes, generate a **personalized habit kit**.

CRITICAL: Re-read the ENTIRE conversation before generating tips. Your tips must reflect everything the user told you \u2014 their experience level, goals, constraints, schedule, and motivation. Generic tips are a failure state. If the user gave you rich context, your tips should be impossible to generate without that context.

Rules:
- **2-3 tips max**, each 1-2 sentences
- Pick the 2-3 most relevant from: habit stacking, first-day plan, gentle friction reduction, realistic obstacle handling, or something specific to THEIR situation
- Use **web_search** if real research would help \u2014 but tailor the search query to their specific context, not generic terms
- Format with **bold** label + short sentence. Total under 100 words.
- Each tip must cover a DIFFERENT strategy. Never repeat the same concept with different wording. If you can only think of two genuinely distinct tips, give two \u2014 never pad with a rephrased duplicate.

Do NOT mention saving \u2014 the app shows a save button automatically.

=== IF THEY DON'T WANT TIPS ===
One warm sentence. Done. No guilt, no "are you sure?"

=== AFTER TIPS (or if they decline tips) ===
If the conversation is wrapping up after lock-in, offer one final thing: "Want me to send you a nudge after your first few sessions?" Keep it casual, one sentence. If they say yes, respond with a brief confirmation. If no, close warmly. Do not push or explain why \u2014 just offer and respect the answer.`;
      const HABIT_MODE_QUICK_LOCK = `
=== MODE: QUICK LOCK ===
This user provided a fully-formed habit with behavior, type, and frequency already stated. They know what they want.

APPROACH:
- Confirm what you heard in a single natural sentence. Do not reformat it as a list or card.
- If one element is ambiguous, ask ONE clarifying question. If nothing is ambiguous, move directly to the lock-in question.
- If existing habits in context interact with this one (complement, conflict, or share a time window), mention it in one sentence.
- Reach the lock-in question within 2 exchanges maximum.
- Skip motivation and background \u2014 this user came to execute, not explore.`;
      const HABIT_MODE_SHAPE = `
=== MODE: SHAPE ===
This user has a vague intent that needs shaping into a specific, trackable behavior. They said something broad without a concrete action or frequency.

APPROACH:
- Your first response: ask ONE question that narrows from category to specific behavior. Target the verb \u2014 what will they physically do?
- By your third response in the conversation, propose a concrete habit with a specific behavior, frequency, and time. Don't keep asking \u2014 propose and let them react.
- If your proposal doesn't land, iterate on it. Proposing and adjusting is faster than more questions.
- Never ask more than one question per response.
- The value you provide is turning vague intent into something schedulable. If they could have typed it into a form, you haven't added value.`;
      const HABIT_MODE_RESEARCH = `
=== MODE: RESEARCH ===
This user wants information or perspective before committing. They asked a question or expressed curiosity about an approach.

APPROACH:
- You have web search results injected into context. Lead with the single most specific and useful finding \u2014 a number, a study result, a concrete data point. Never open with vague framing.
- Synthesize no more than 2-3 findings and connect each one to the user's specific situation. Do not list findings generically.
- After delivering the research value, pivot to shaping a specific habit based on what resonated. Propose something concrete.
- The research IS the value-add. This is what differentiates the chat from a form. If you give generic advice without referencing search results, you've failed the mode.
- If mid-conversation the user asks a follow-up research question, search again. Say you're looking into it and use web_search.
- Prefer widely recognized sources \u2014 major health organizations, established fitness publications, university research, well-known media outlets. If search results only return niche or unfamiliar sites, rely on your training knowledge instead and be transparent that you couldn't find strong sources.`;
      const HABIT_MODE_BREAK = `
=== MODE: BREAK ===
This user wants to stop, reduce, or eliminate a behavior. This is psychologically different from building a new habit. Use a completely different conversation structure.

CONVERSATION STRUCTURE (follow this order):
1. Clarify the specific behavior to stop and how often it currently happens.
2. Identify the primary trigger \u2014 what situation, emotion, or time of day causes it. Ask ONE question about this, not a list of options.
3. Identify or suggest a replacement behavior for when the trigger hits. If they don't know, suggest 2-3 context-appropriate alternatives.
4. Shape a specific, binary, measurable boundary rule. The rule should be enforceable \u2014 something they can answer yes/no to at the end of each day.

KEY DIFFERENCES FROM BUILD:
- Frequency is implicit: daily avoidance is the default. Don't ask "how often do you want to avoid it."
- Time window refers to when the TRIGGER occurs, not when they'll do a positive action.
- Understanding WHY they want to stop drives the replacement behavior \u2014 motivation matters more here than in build.
- Notes should capture: the trigger, the replacement, and any environment changes they plan.

TRACKING FRAMING:
Build habits show on the Today page for tick-off completion. Break habits are tracked through the Evening Sweep \u2014 the user reports whether they held the boundary. Frame tracking accordingly. Never describe the wrong mechanism.

FRAMING:
Never frame a break habit as deprivation or loss. Frame it as a trade \u2014 replacing one behavior with another when the trigger hits.`;
      const HABIT_MODE_EVENT_ANCHORED = `
=== MODE: EVENT ANCHORED ===
This user's habit is tied to a deadline, event, or milestone. The event is the context for everything.

APPROACH:
- Acknowledge the timeline in your first response. Calculate the remaining weeks or months. Make the timeline feel concrete.
- Shape the habit with the timeline in mind. For training goals, consider progressive difficulty. For lifestyle changes before an event, suggest a sustainable pace that doesn't burn out before the date.
- End date is a required field in this mode, not optional. Extract or confirm it.
- If appropriate, suggest starting easier and ramping up. The initial habit captures the starting point only \u2014 progression planning happens through entity chat after creation.
- After lock-in, tell the user that Gremly shows a countdown and that the entity chat can help adjust the plan as the event approaches.
- The event name and timeline should appear in the notes field.`;
      const HABIT_MODE_RESTART = `
=== RESTART CONTEXT ===
This user has tried this habit (or something similar) before and stopped. Before shaping, ask ONE question about what got in the way previously.

Use their answer to shape the habit differently than their last attempt:
- Overcommitment \u2192 suggest smaller scope or lower frequency than they tried before.
- Lost motivation \u2192 suggest accountability mechanisms or habit stacking with existing routines.
- Life disruption \u2192 suggest flexible scheduling (weekly target rather than fixed days).
- Forgetting \u2192 suggest anchoring to an existing behavior or time-based trigger.

The notes field should capture what's different about this attempt compared to the previous one.

Spend ONE exchange on what went wrong, then move forward. Do not dwell on failure or analyze it extensively.`;
      const HABIT_MODE_NUDGE = `
=== NUDGE ===
This conversation has been going for a while without reaching a concrete proposal. It is time to synthesize. Take everything the user has shared \u2014 goals, constraints, context, preferences \u2014 and shape it into one specific, concrete habit proposal with behavior, frequency, and timing. Ask if they want to lock it in or adjust.`;
      const HABIT_SHARED_V2_ADDITIONS = `

=== READINESS MODEL ===
You are NOT collecting form fields. You are having a conversation that gradually resolves a habit. The extraction model runs in the background and tracks readiness \u2014 you don't need to mentally checklist fields. Focus on having a genuinely useful conversation. The UI handles showing what's been resolved.

When you have enough to propose something concrete, propose it. When the conversation has been valuable AND all critical fields are resolved, move to confirmation. Don't rush to confirmation just because fields are complete \u2014 if the conversation is adding value, keep going.

=== CONTEXT AWARENESS ===
You receive context about the user's existing habits, life situation, and capacity. Use it naturally \u2014 don't dump all context at once, weave it in where relevant:
- If they have many daily habits, lean toward suggesting weekly or 2-3x/week for the new one.
- If they have a Space that matches the habit domain, mention it as a natural home for the habit.
- If their life context is relevant (major transition, busy period, etc.), factor it into your suggestions.
- If they have a habit that conflicts with or complements what they're building, reference it.

=== CONVERSATION LENGTH ===
If you're 6+ exchanges in without having proposed a specific habit, synthesize and propose. The user can always tweak after creation through entity chat. Don't let pursuit of the perfect habit prevent creating a good one.

=== POST-LOCK-IN EDITS ===
If the user requests a change after confirming (different frequency, different start date, etc.), acknowledge the change in one sentence. The app handles the update. Do not re-confirm or re-propose the entire habit.

=== HABIT STACKING ===
After the user confirms and locks in a habit, check the existing habits listed in the session context. If any existing habit shares the same time window (morning/evening) or cadence (daily) as the new habit, offer to anchor the new one to the existing one. One sentence, framed as a suggestion not a requirement. If the user agrees, mention it will be linked in the app. If no existing habits match or the user has no habits yet, skip this entirely \u2014 do not mention stacking.`;
      const HABIT_MODE_PROMPTS = {
        QUICK_LOCK: HABIT_MODE_QUICK_LOCK,
        SHAPE: HABIT_MODE_SHAPE,
        RESEARCH: HABIT_MODE_RESEARCH,
        BREAK: HABIT_MODE_BREAK,
        EVENT_ANCHORED: HABIT_MODE_EVENT_ANCHORED
      };
      if (type === "general-greeting") {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }
        try {
          const dailyFocus = await getDailyFocusForChat2(authenticatedUserId, env, userTimezone);
          const now = /* @__PURE__ */ new Date();
          const timeStr = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: userTimezone
          }).format(now);
          const dayStr = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            timeZone: userTimezone
          }).format(now);
          const focusSnippet = dailyFocus ? [
            dailyFocus.lifeMoment && `Life moment: ${dailyFocus.lifeMoment}`,
            dailyFocus.briefHeadline && `Headline: "${dailyFocus.briefHeadline}"`,
            dailyFocus.namedAnchors?.length > 0 && `People: ${dailyFocus.namedAnchors.map((a) => a.label).join(", ")}`,
            dailyFocus.todayFocus?.length > 0 && `Focus: ${dailyFocus.todayFocus.join(", ")}`
          ].filter(Boolean).join("\n") : "";
          const prompt = `Generate a 1-2 sentence contextual greeting for Gremly, a productivity companion. This shows on the home screen when the user opens the chat tab.

Current time: ${timeStr} on ${dayStr}.
${focusSnippet ? `
USER CONTEXT:
${focusSnippet}` : "No context available."}

Rules:
- It is currently ${timeStr}. Be time-appropriate. Late evening means winding down or looking ahead to tomorrow, not starting a busy day.
- Reference ONE specific detail from the context by name: a person, a project, an event, a milestone. If you can't name something specific, say "What's on your mind?" and nothing else.
- Write like a friend who already knows what's going on. No introductions, no offers to help.
- No productivity language. No "organize", "tasks", "stay on track", "moment to breathe", "focus".
- No questions that a customer service bot would ask.
- No exclamation marks.
- Under 25 words.

Return ONLY the greeting text. No quotes, no JSON, no explanation.`;
          const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4.1-nano",
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: "Generate greeting." }
              ],
              max_tokens: 60,
              temperature: 0.7
            })
          });
          if (res2.ok) {
            const data = await res2.json();
            const greeting = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
            return j({ greeting });
          }
          return j({ greeting: null });
        } catch (err) {
          console.warn("[GeneralGreeting] Failed:", err.message);
          return j({ greeting: null });
        }
      }
      if (type === "habit-builder") {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return wantsStreaming ? denyAccessSSEResponse(access.reason) : denyAccessResponse(access.reason);
        }
        const messages2 = Array.isArray(body.messages) ? body.messages : [];
        const context = body.context || {};
        let userProfileContext = "";
        let habitTodayActivity = null;
        if (authenticatedUserId) {
          try {
            const [chatContext, profile, todayAct] = await Promise.all([
              buildChatContext(
                authenticatedUserId,
                "habit_builder",
                { timezone: userTimezone, currentChatId: body.chatId || null },
                env
              ),
              getUserProfile(authenticatedUserId, env),
              buildTodayActivity(authenticatedUserId, userTimezone, env)
            ]);
            const ageInfo = getAgeGuidance(profile?.relationshipStartedAt, profile?.signals);
            if (profile?.profileText) {
              userProfileContext += `
=== ABOUT THIS USER ===
Read the IDENTITY line first. Use it for this person's name, gender, and pronouns throughout your response. Never assume or guess gender or pronouns \u2014 always refer to what's stated. If no IDENTITY line is present, use "they/them" as default.

${profile.profileText}
`;
            }
            if (todayAct) {
              userProfileContext += `
${todayAct}
`;
            }
            if (chatContext) {
              userProfileContext += `
${chatContext}`;
            }
            userProfileContext += `
${ageInfo.promptGuidance}
`;
          } catch (err) {
            console.error("[HabitBuilder] Context error", err);
          }
        }
        const contextParts = [];
        const today = context.currentDate || new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(/* @__PURE__ */ new Date());
        const dow = context.dayOfWeek || new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        contextParts.push(`Today is ${dow}, ${today}.`);
        if (context.userName) {
          contextParts.push(`User's name: ${context.userName}`);
        }
        if (context.existingHabits && context.existingHabits.length > 0) {
          const habitList = context.existingHabits.map((h) => {
            let desc = `- "${h.name}" (${h.subtype === "break_habit" ? "break" : "build"})`;
            if (h.frequency) desc += ` \u2014 ${h.frequency}`;
            if (h.space_name) desc += ` [${h.space_name}]`;
            return desc;
          }).join("\n");
          contextParts.push(`
=== EXISTING HABITS ===
${habitList}`);
        } else {
          contextParts.push("\n=== EXISTING HABITS ===\nNone yet \u2014 this is their first habit.");
        }
        if (context.spaces && context.spaces.length > 0) {
          const spaceList = context.spaces.map((s) => `- "${s.name}"`).join("\n");
          contextParts.push(`
=== USER'S SPACES ===
${spaceList}`);
        }
        if (context.prefill) {
          contextParts.push(
            `
=== PRE-FILLED INTENT ===
The user started with: "${context.prefill}"
Use this as the starting point \u2014 don't ask "what habit?" again.`
          );
        }
        const contextString = contextParts.join("\n");
        const lastUserMsg = messages2.filter((m) => m.role === "user").pop()?.content || "";
        const prevExchange = extractPreviousExchange(messages2);
        let preParse = null;
        try {
          const lifeMap = await getLifeMapForChat(authenticatedUserId, env);
          const dailyFocus = await getDailyFocusForChat2(authenticatedUserId, env);
          const compressedLifeMap = compressLifeMapForHabits2(lifeMap, dailyFocus);
          preParse = await habitPreParse(
            lastUserMsg,
            prevExchange,
            {
              existingHabits: context.existingHabits || [],
              currentMode: context.currentMode || null,
              turnNumber: context.turnNumber || 0,
              compressedLifeMap: compressedLifeMap.trim() || null,
              currentDate: today,
              habitCapacity: context.habitCapacity || null
            },
            env
          );
        } catch (err) {
          console.warn("[HabitBuilder] Pre-parse failed, using V1 path:", err.message);
        }
        const builderMode = preParse?.mode !== "CONTINUE" ? preParse?.mode : context.currentMode || "SHAPE";
        const modePromptSection = HABIT_MODE_PROMPTS[builderMode] || HABIT_MODE_PROMPTS.SHAPE;
        let dynamicSections = HABIT_SHARED_V2_ADDITIONS + "\n" + modePromptSection;
        if (preParse?.search_query) {
          dynamicSections += `

=== SEARCH HINT ===
The user's intent suggests research would be valuable. Use web_search to look up: "${preParse.search_query}" and lead with specific findings.`;
        }
        if (preParse?.is_restart) {
          dynamicSections += "\n" + HABIT_MODE_RESTART;
        }
        if (preParse?.nudge_toward_proposal) {
          dynamicSections += "\n" + HABIT_MODE_NUDGE;
        }
        if (preParse?.secondary_mode === "EVENT_ANCHORED" && preParse?.event_context) {
          dynamicSections += `

=== EVENT CONTEXT ===
This habit is tied to: ${preParse.event_context.name} on ${preParse.event_context.date} (${preParse.event_context.weeks_until} weeks away). Factor the timeline into your shaping.`;
        }
        if (preParse?.secondary_mode === "BREAK") {
          dynamicSections += "\n\n=== NOTE ===\nThis user also wants to break/stop a behavior. Use break habit framing \u2014 focus on triggers, replacement, and boundaries rather than frequency and time slots.";
        }
        if (preParse?.capacity_signal) {
          dynamicSections += `

=== CAPACITY NOTE ===
${preParse.capacity_signal}`;
        }
        const habitBuilderSystemPrompt = `${HABIT_BUILDER_PROMPT}${dynamicSections}

=== SESSION CONTEXT ===
${contextString}${userProfileContext}`;
        const openaiMessages = [
          { role: "system", content: habitBuilderSystemPrompt },
          ...messages2.slice(-20)
        ];
        const t0 = Date.now();
        if (isHabitBuilderStreaming) {
          console.log("[HabitBuilder:Streaming] Starting SSE stream");
          const chatCfg = getChatConfig(lastUserMsg);
          const geminiRes = await geminiStream(
            habitBuilderSystemPrompt,
            openaiMessages,
            {
              temperature: 0.7,
              maxOutputTokens: chatCfg.maxTokens,
              thinkingLevel: chatCfg.thinkingLevel,
              tools: [makeWebSearchTool(userTimezone)]
            },
            env.GOOGLE_API_KEY
          );
          if (!geminiRes.ok || !geminiRes.body) {
            const errText = geminiRes.error || "unknown error";
            console.log("[HabitBuilder:Streaming] Gemini error", {
              status: geminiRes.status,
              error: errText
            });
            return j({ error: `gemini_error: ${geminiRes.status}`, detail: errText }, 200);
          }
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          (async () => {
            await writer.write(encoder.encode(": ping\n\n"));
            const reader = geminiRes.body.getReader();
            let buffer = "";
            let fullContent = "";
            let sources2 = void 0;
            let toolCalls = [];
            let modelResponseParts = [];
            let fillerBuffer = "";
            let fillerFlushed = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === "data: [DONE]") continue;
                  if (!trimmed.startsWith("data: ")) continue;
                  try {
                    const chunk = parseGeminiChunk(trimmed.slice(6));
                    const delta = chunk.text;
                    if (delta) {
                      fullContent += delta;
                      if (!fillerFlushed) {
                        fillerBuffer += delta;
                        const hasBreak = /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                        if (hasBreak) {
                          const cleaned = stripFillerOpening(fillerBuffer);
                          if (cleaned) {
                            await writer.write(
                              encoder.encode(
                                `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                              )
                            );
                          }
                          fillerFlushed = true;
                        }
                      } else {
                        const sseData = JSON.stringify({ delta, done: false });
                        await writer.write(encoder.encode(`data: ${sseData}

`));
                      }
                    }
                    if (chunk.functionCalls) {
                      for (const fc of chunk.functionCalls) {
                        toolCalls.push({
                          id: fc.id,
                          name: fc.name,
                          arguments: JSON.stringify(fc.args)
                        });
                        modelResponseParts.push({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                          thoughtSignature: fc.thoughtSignature
                        });
                      }
                    }
                  } catch (parseErr) {
                  }
                }
              }
              if (!fillerFlushed && fillerBuffer) {
                const cleaned = stripFillerOpening(fillerBuffer);
                if (cleaned) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: cleaned, done: false })}

`)
                  );
                }
              }
              fullContent = stripFillerOpening(fullContent);
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === "web_search" && tc.arguments
              );
              if (webSearchCalls.length > 0) {
                console.log("[HabitBuilder:Streaming] Web search triggered", {
                  searchCount: webSearchCalls.length
                });
                let firstQuery = "";
                try {
                  firstQuery = JSON.parse(webSearchCalls[0].arguments).query || "";
                } catch {
                  const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = match ? match[1] : "searching";
                }
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: firstQuery })}

`
                  )
                );
                const searchPromises = webSearchCalls.map(async (tc) => {
                  try {
                    let query;
                    try {
                      query = JSON.parse(tc.arguments).query;
                    } catch {
                      const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                      query = match ? match[1] : null;
                    }
                    if (!query) return { toolCallId: tc.id, query: null, results: null };
                    const results = await executeTavilySearch(query, env.TAVILY_API_KEY, {
                      includeImages: false
                    });
                    return { toolCallId: tc.id, query, results };
                  } catch (err) {
                    console.log("[HabitBuilder:Streaming] Search error:", err);
                    return { toolCallId: tc.id, query: null, results: null };
                  }
                });
                const searchResults = await Promise.all(searchPromises);
                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0
                );
                if (successfulSearches.length > 0) {
                  const originalContents = convertMessages(openaiMessages);
                  if (fullContent) {
                    modelResponseParts.unshift({ text: fullContent });
                  }
                  const functionResults = successfulSearches.map((sr) => ({
                    name: "web_search",
                    id: sr.toolCallId,
                    response: { results: formatSearchBrief(sr.results) }
                  }));
                  const followUpContents = buildFollowUpContents(
                    originalContents,
                    modelResponseParts,
                    functionResults
                  );
                  const chatCfgFollowUp = getChatConfig(lastUserMsg, { isSearchFollowUp: true });
                  const followUpRes = await geminiStream(
                    habitBuilderSystemPrompt,
                    [],
                    {
                      temperature: 0.7,
                      maxOutputTokens: chatCfgFollowUp.maxTokens,
                      thinkingLevel: chatCfgFollowUp.thinkingLevel,
                      nativeContents: followUpContents
                    },
                    env.GOOGLE_API_KEY
                  );
                  const followUpReader = followUpRes.body.getReader();
                  let followUpBuffer = "";
                  let followUpFillerBuffer = "";
                  let followUpFillerFlushed = false;
                  while (true) {
                    const result = await followUpReader.read();
                    if (result.done) break;
                    followUpBuffer += decoder.decode(result.value, { stream: true });
                    const followUpLines = followUpBuffer.split(/\r?\n/);
                    followUpBuffer = followUpLines.pop() || "";
                    for (const line of followUpLines) {
                      const trimmed = line.trim();
                      if (!trimmed.startsWith("data:")) continue;
                      const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
                      if (jsonStr === "[DONE]") continue;
                      try {
                        const chunk = parseGeminiChunk(jsonStr);
                        const delta = chunk.text;
                        if (delta) {
                          fullContent += delta;
                          if (!followUpFillerFlushed) {
                            followUpFillerBuffer += delta;
                            const hasBreak = /[.?!]\s/.test(followUpFillerBuffer) || followUpFillerBuffer.length > 150;
                            if (hasBreak) {
                              const cleaned = stripFillerOpening(followUpFillerBuffer);
                              if (cleaned) {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                  )
                                );
                              }
                              followUpFillerFlushed = true;
                            }
                          } else {
                            await writer.write(
                              encoder.encode(`data: ${JSON.stringify({ delta, done: false })}

`)
                            );
                          }
                        }
                      } catch {
                      }
                    }
                  }
                  if (!followUpFillerFlushed && followUpFillerBuffer) {
                    const cleaned = stripFillerOpening(followUpFillerBuffer);
                    if (cleaned) {
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                        )
                      );
                    }
                  }
                  fullContent = stripFillerOpening(fullContent);
                  console.log("[HabitBuilder:Streaming] Search complete", {
                    searchCount: successfulSearches.length,
                    queries: successfulSearches.map((s) => s.query)
                  });
                  sources2 = successfulSearches.flatMap(
                    (sr) => sr.results.results.map((r) => ({ title: r.title, url: r.url }))
                  );
                }
              }
              const fullConversation = [...messages2, { role: "assistant", content: fullContent }];
              const resolved = await extractHabitFields(fullConversation, key, today, builderMode);
              resolved.builder_mode = builderMode;
              const latency = Date.now() - t0;
              const finalData = JSON.stringify({
                done: true,
                full_content: fullContent,
                resolved_fields: resolved,
                latency_ms: latency,
                sources: sources2
              });
              await writer.write(encoder.encode(`data: ${finalData}

`));
              console.log("[HabitBuilder:Streaming] Complete", {
                latency_ms: latency,
                content_length: fullContent.length,
                required_count: resolved.required_count,
                next_field: resolved.next_field,
                had_search: webSearchCalls.length > 0
              });
            } catch (streamErr) {
              console.log("[HabitBuilder:Streaming] Stream error", { error: String(streamErr) });
              const errorData = JSON.stringify({
                error: String(streamErr),
                done: true,
                full_content: fullContent
              });
              await writer.write(encoder.encode(`data: ${errorData}

`));
            } finally {
              await writer.close();
            }
          })();
          return new Response(readable, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive"
            }
          });
        }
        try {
          const chatCfg = getChatConfig(lastUserMsg);
          const geminiResult = await geminiGenerate(
            habitBuilderSystemPrompt,
            openaiMessages,
            {
              temperature: 0.7,
              maxOutputTokens: chatCfg.maxTokens,
              thinkingLevel: chatCfg.thinkingLevel
            },
            env.GOOGLE_API_KEY
          );
          const latency = Date.now() - t0;
          if (!geminiResult.ok) {
            console.log("[HabitBuilder] API error", {
              error: geminiResult.error,
              latency_ms: latency
            });
            return j(
              { error: "habit_builder_failed", detail: geminiResult.error, latency_ms: latency },
              200
            );
          }
          let content2 = geminiResult.content;
          content2 = stripFillerOpening(content2);
          const fullConversation = [...messages2, { role: "assistant", content: content2 }];
          const resolved = await extractHabitFields(fullConversation, key, today, builderMode);
          resolved.builder_mode = builderMode;
          console.log("[HabitBuilder] Complete", {
            latency_ms: latency,
            content_length: content2.length,
            required_count: resolved.required_count,
            next_field: resolved.next_field
          });
          return j({
            content: content2,
            resolved_fields: resolved,
            latency_ms: latency
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log("[HabitBuilder] Error", { error: String(err), latency_ms: latency });
          return j(
            { error: "habit_builder_failed", detail: String(err), latency_ms: latency },
            200
          );
        }
      }
      if (type === "entity-chat") {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return wantsStreaming ? denyAccessSSEResponse(access.reason) : denyAccessResponse(access.reason);
        }
        const entity = body.entity || {};
        const messages2 = Array.isArray(body.messages) ? body.messages : [];
        const preset = body.preset || null;
        const sweepContext = body.sweepContext || null;
        const entityContextParts = [];
        entityContextParts.push(`Type: ${entity.type || "unknown"}`);
        entityContextParts.push(`Title: "${entity.title || "Untitled"}"`);
        if (entity.subtype) entityContextParts.push(`Subtype: ${entity.subtype}`);
        if (entity.body) entityContextParts.push(`Details: "${entity.body.substring(0, 1e3)}"`);
        if (entity.tags && entity.tags.length > 0)
          entityContextParts.push(`Tags: ${entity.tags.join(", ")}`);
        if (entity.due_date) entityContextParts.push(`Due: ${entity.due_date}`);
        if (entity.frequency) entityContextParts.push(`Frequency: ${entity.frequency}`);
        if (entity.time_estimate)
          entityContextParts.push(`Time estimate: ${entity.time_estimate} minutes`);
        if (entity.space_name) entityContextParts.push(`Space: ${entity.space_name}`);
        if (entity.days_since_created !== void 0)
          entityContextParts.push(`Created: ${entity.days_since_created} days ago`);
        if (entity.times_swept)
          entityContextParts.push(`Times reviewed in Sweep: ${entity.times_swept}`);
        if (entity.energy_type) entityContextParts.push(`Energy type: ${entity.energy_type}`);
        if (entity.time_window && entity.time_window !== "any")
          entityContextParts.push(`Preferred time: ${entity.time_window}`);
        if (entity.mood && entity.mood.length > 0)
          entityContextParts.push(`Mood when captured: ${entity.mood.join(", ")}`);
        if (entity.commitment) {
          entityContextParts.push(`Commitment: User marked this as important`);
          if (entity.commitment_note)
            entityContextParts.push(`Why it matters: "${entity.commitment_note}"`);
        }
        if (entity.triggers && entity.triggers.length > 0)
          entityContextParts.push(`Triggers: ${entity.triggers.join(", ")}`);
        if (entity.replacement_text)
          entityContextParts.push(`Replacement behavior: "${entity.replacement_text}"`);
        if (entity.notes)
          entityContextParts.push(`Additional notes: "${entity.notes.substring(0, 300)}"`);
        if (entity.is_favorite) entityContextParts.push(`Marked as favorite`);
        if (entity.habitStats) {
          const hs = entity.habitStats;
          entityContextParts.push(`
--- Habit Progress ---`);
          entityContextParts.push(
            `Completions last 7 days: ${hs.completionsLast7Days} of ${hs.targetPerWeek} target`
          );
          entityContextParts.push(
            `Completion rate (7-day): ${Math.round(hs.completionRate7Day * 100)}%`
          );
          if (hs.completionsLast14Days !== void 0) {
            entityContextParts.push(`Completions last 14 days: ${hs.completionsLast14Days}`);
          }
          if (hs.currentStreak > 0) {
            entityContextParts.push(`Current streak: ${hs.currentStreak} days`);
          }
          if (hs.daysSinceLastCompletion !== null && hs.daysSinceLastCompletion !== void 0) {
            if (hs.daysSinceLastCompletion === 0) entityContextParts.push(`Last completed: today`);
            else if (hs.daysSinceLastCompletion === 1)
              entityContextParts.push(`Last completed: yesterday`);
            else entityContextParts.push(`Last completed: ${hs.daysSinceLastCompletion} days ago`);
          } else {
            entityContextParts.push(`Never completed yet`);
          }
          entityContextParts.push(
            `Use this data to personalize your response \u2014 acknowledge consistency ("you've been crushing it"), identify gaps ("it's been a few days"), or calibrate advice accordingly. Never shame gaps.`
          );
        }
        const entityContext = entityContextParts.join("\n");
        let sweepContextStr = "";
        if (sweepContext) {
          const sweepParts = [];
          if (sweepContext.times_moved >= 2)
            sweepParts.push(
              `This item has been deferred ${sweepContext.times_moved} times in Sweep.`
            );
          if (sweepContext.days_unscheduled >= 7)
            sweepParts.push(
              `This item has been unscheduled for ${sweepContext.days_unscheduled} days.`
            );
          if (sweepContext.is_overdue) sweepParts.push(`This item is overdue.`);
          if (sweepParts.length > 0) {
            sweepContextStr = `

=== SWEEP CONTEXT ===
${sweepParts.join("\n")}`;
          }
        }
        let siblingContextStr = "";
        if (body.siblingContext) {
          const sc = body.siblingContext;
          if (sc.sameSpace && sc.sameSpace.length > 0) {
            siblingContextStr += `

=== OTHER ITEMS IN THIS SPACE ===
`;
            siblingContextStr += sc.sameSpace.map((item) => {
              let line = `- ${item.type}: "${item.title}"`;
              if (item.frequency) line += ` (${item.frequency})`;
              if (item.last_completed_at) {
                const daysAgo = Math.floor(
                  (Date.now() - new Date(item.last_completed_at).getTime()) / 864e5
                );
                line += daysAgo === 0 ? " \u2014 done today" : daysAgo === 1 ? " \u2014 done yesterday" : ` \u2014 last done ${daysAgo}d ago`;
              }
              return line;
            }).join("\n");
            siblingContextStr += `
When giving advice, reference these sibling items by name. For habit stacking, suggest pairing with a sibling habit they already do consistently rather than generic examples like "brushing your teeth".
`;
          }
          if (sc.otherHabits && sc.otherHabits.length > 0) {
            siblingContextStr += `
=== USER'S OTHER ACTIVE HABITS ===
`;
            siblingContextStr += sc.otherHabits.map((h) => {
              let line = `- "${h.title}" (${h.frequency})`;
              if (h.completionsLast7Days !== void 0)
                line += ` \u2014 ${h.completionsLast7Days}/7 days last week`;
              if (h.time_window && h.time_window !== "any") line += ` \u2014 prefers ${h.time_window}`;
              return line;
            }).join("\n");
            siblingContextStr += `
Reference these when relevant. If the user is consistent with another habit, suggest stacking. If they struggle with multiple habits, acknowledge the load.
`;
          }
          if (sc.recentCompletions && sc.recentCompletions.length > 0) {
            siblingContextStr += `
=== RECENTLY COMPLETED TASKS ===
`;
            siblingContextStr += sc.recentCompletions.map((t) => `- "${t.title}"`).join("\n");
            siblingContextStr += `
The user has momentum. Reference these for confidence when appropriate \u2014 "you knocked out X recently, this is smaller than that."
`;
          }
        }
        let presetInstruction = "";
        if (preset) {
          const presetInstructions = {
            break_down: "The user wants help breaking this down into smaller, manageable steps. Focus on creating a clear action plan.",
            research: "The user wants researched information about this topic. Use web search to find current, accurate information and provide a helpful summary. Do not just suggest websites - actually search and synthesize the information for them.",
            think_through: "The user wants to think through this more deeply. Help them consider different angles and implications.",
            whats_blocking: "The user feels stuck on this. Help them identify what might be blocking them and how to move forward.",
            action_steps: "The user wants to turn this into concrete action steps. Help them identify specific next actions.",
            expand: "The user wants to expand on this idea. Help them flesh it out with more detail and possibilities.",
            stay_consistent: "The user wants help staying consistent with this habit. Focus on practical strategies and motivation.",
            approach: "The user wants to refine their approach to this habit. Help them optimize their strategy."
          };
          presetInstruction = presetInstructions[preset] ? `

=== USER REQUEST ===
${presetInstructions[preset]}` : "";
        }
        const tz = userTimezone;
        const currentDate = new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: tz
        }).format(/* @__PURE__ */ new Date());
        const now = /* @__PURE__ */ new Date();
        const hourStr = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: tz
        }).format(now);
        const clientHour = parseInt(hourStr, 10);
        const timeOfDay = clientHour < 12 ? "morning" : clientHour < 17 ? "afternoon" : "evening";
        const timeStr = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: tz
        }).format(now);
        const lastUserMsg = messages2.filter((m) => m.role === "user").pop()?.content || "";
        if (isEntityChatStreaming) {
          console.log("[EntityChat:Streaming] Starting SSE stream");
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          (async () => {
            try {
              const loadingMsg = await generateLoadingMessage(
                lastUserMsg,
                body.spaceName || null,
                env.OPENAI_API_KEY
              );
              if (loadingMsg) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: loadingMsg, isLoadingHint: true })}

`
                  )
                );
              }
            } catch {
            }
          })();
          (async () => {
            try {
              await writer.write(encoder.encode(": ping\n\n"));
              let sessionContextStr2 = "";
              let userProfile2 = null;
              let cachedDomains2 = [];
              let entityTodayActivity2 = null;
              const previousExchange2 = extractPreviousExchange(messages2);
              if (authenticatedUserId) {
                try {
                  const [chatContext, profile, domains, todayAct] = await Promise.all([
                    buildChatContext(
                      authenticatedUserId,
                      "entity",
                      {
                        entityTitle: entity?.title || entity?.name || null,
                        entitySpaceId: entity?.spaceId || entity?.space_id || null,
                        timezone: userTimezone,
                        currentChatId: body.chatId || null
                      },
                      env
                    ),
                    getUserProfile(authenticatedUserId, env),
                    getCachedDomainNames(authenticatedUserId, env),
                    buildTodayActivity(authenticatedUserId, userTimezone, env)
                  ]);
                  sessionContextStr2 = chatContext;
                  userProfile2 = profile;
                  cachedDomains2 = domains;
                  entityTodayActivity2 = todayAct;
                  if (sessionContextStr2 || userProfile2) {
                    console.log("[EntityChat] Context loaded", {
                      userId: authenticatedUserId.slice(0, 8),
                      sessionContextLength: sessionContextStr2?.length || 0,
                      hasUserProfile: !!userProfile2
                    });
                  }
                } catch (err) {
                  console.error("[EntityChat] Context error", err);
                }
              }
              const triage2 = await triageMessage({
                userMessage: lastUserMsg,
                previousExchange: previousExchange2,
                spaceName: body.spaceName || void 0,
                preset: preset || void 0,
                chatType: "entity",
                env,
                domainNames: cachedDomains2,
                profileSnippet: userProfile2?.profileText?.slice(0, 150) || "",
                messageCount: messages2.length
              });
              console.log("[EntityChat:Triage]", {
                mode: triage2.mode,
                search: triage2.search,
                personal: triage2.personal,
                depth: triage2.depth,
                source: triage2.source,
                preset: preset || "none",
                messagePreview: lastUserMsg.slice(0, 80)
              });
              const entityContextBlock2 = buildEntityContextBlock({
                entity: {
                  type: entity.type,
                  title: entity.title || "Untitled",
                  body: entity.body || null,
                  tags: entity.tags || [],
                  due_date: entity.due_date || null,
                  frequency: entity.frequency || null,
                  time_estimate: entity.time_estimate || null,
                  subtype: entity.subtype || null
                },
                sweepContext: sweepContext || null,
                siblingContext: body.siblingContext || null,
                timeOfDay,
                timeStr,
                messageCount: messages2.length
              });
              const genConfig2 = buildEntityChatConfig(
                triage2,
                entityContextBlock2,
                body.accountCreatedAt,
                sessionContextStr2,
                userProfile2?.profileText,
                tz,
                entityTodayActivity2
              );
              const entityMessages2 = [
                { role: "system", content: genConfig2.systemPrompt },
                ...messages2.slice(-20).filter((m) => m.role !== "system")
              ];
              const previousSearchContext2 = messages2.filter((m) => m.role === "assistant" && m.metadata?.sources?.length > 0).slice(-1)[0];
              if (previousSearchContext2) {
                entityMessages2.push({
                  role: "system",
                  content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext2.metadata.sources.map((s) => s.title).join(", ")}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`
                });
              }
              const searchPolicy2 = getSearchPolicy(triage2.search);
              const t02 = Date.now();
              let urlContext2 = "";
              let fetchedUrl2 = null;
              const detectedUrls = extractUrlsFromText(lastUserMsg);
              if (detectedUrls.length > 0) {
                console.log("[EntityChat:Streaming] URLs detected:", detectedUrls);
                const urlToFetch = detectedUrls[0];
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      fetching: true,
                      fetchingUrl: urlToFetch,
                      done: false
                    })}

`
                  )
                );
                const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);
                if (extracted && extracted.success) {
                  fetchedUrl2 = {
                    url: extracted.url,
                    title: extracted.title
                  };
                  urlContext2 = `

=== EXTRACTED CONTENT FROM URL ===
URL: ${extracted.url}
Title: ${extracted.title}

${extracted.content}

=== END EXTRACTED CONTENT ===

The user has shared this link. Summarize the key points and answer any questions they have about it. If they just shared the link without a specific question, provide a helpful summary of what the content covers.`;
                  console.log("[EntityChat:Streaming] URL content extracted, adding to context");
                } else {
                  urlContext2 = `

[Note: The user shared a link (${urlToFetch}) but I couldn't access its content. It may be paywalled, require login, or be temporarily unavailable. Let the user know and offer to help if they can paste the content directly.]`;
                  console.log("[EntityChat:Streaming] URL extraction failed");
                }
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      fetching: false,
                      done: false
                    })}

`
                  )
                );
              }
              if (urlContext2) {
                const lastIdx = entityMessages2.length - 1;
                if (entityMessages2[lastIdx].role === "user") {
                  entityMessages2[lastIdx] = {
                    ...entityMessages2[lastIdx],
                    content: entityMessages2[lastIdx].content + urlContext2
                  };
                }
              }
              const streamConfig = {
                temperature: genConfig2.temperature,
                maxOutputTokens: genConfig2.maxTokens,
                thinkingLevel: genConfig2.thinkingLevel
              };
              if (searchPolicy2.attachTool) {
                streamConfig.tools = [makeWebSearchTool(userTimezone)];
              }
              console.log("[EntityChat:Streaming:Payload]", {
                temperature: streamConfig.temperature,
                maxOutputTokens: streamConfig.maxOutputTokens,
                thinkingLevel: streamConfig.thinkingLevel,
                hasTools: !!streamConfig.tools,
                messageCount: entityMessages2.length
              });
              const geminiRes = await geminiStream(
                genConfig2.systemPrompt,
                entityMessages2,
                streamConfig,
                env.GOOGLE_API_KEY
              );
              if (!geminiRes.ok || !geminiRes.body) {
                const errText = geminiRes.error || "unknown error";
                console.log("[EntityChat:Streaming] Gemini error", {
                  status: geminiRes.status,
                  error: errText
                });
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ error: errText, done: true })}

`)
                );
                return;
              }
              const reader = geminiRes.body.getReader();
              let buffer = "";
              let fullContent = "";
              let searchImages = [];
              let fillerBuffer = "";
              let fillerFlushed = false;
              let toolCalls = [];
              let modelResponseParts = [];
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split(/\r?\n/);
                  buffer = lines.pop() || "";
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]") continue;
                    if (!trimmed.startsWith("data: ")) continue;
                    try {
                      const chunk = parseGeminiChunk(trimmed.slice(6));
                      const delta = chunk.text;
                      if (delta) {
                        fullContent += delta;
                        if (!fullContent.includes("<!--SAVE:")) {
                          if (!fillerFlushed) {
                            fillerBuffer += delta;
                            const hasBreak = /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                            if (hasBreak) {
                              const cleaned = stripFillerOpening(fillerBuffer);
                              if (cleaned) {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                  )
                                );
                              }
                              fillerFlushed = true;
                            }
                          } else {
                            const sseData = JSON.stringify({ delta, done: false });
                            await writer.write(encoder.encode(`data: ${sseData}

`));
                          }
                        }
                      }
                      if (chunk.functionCalls) {
                        for (const fc of chunk.functionCalls) {
                          toolCalls.push({
                            id: fc.id,
                            name: fc.name,
                            arguments: JSON.stringify(fc.args)
                          });
                          modelResponseParts.push({
                            functionCall: { name: fc.name, args: fc.args, id: fc.id },
                            thoughtSignature: fc.thoughtSignature
                          });
                        }
                      }
                    } catch (parseErr) {
                      console.log("[EntityChat:Streaming] Chunk parse error", {
                        line: trimmed.slice(0, 100)
                      });
                    }
                  }
                }
                if (!fillerFlushed && fillerBuffer) {
                  const cleaned = stripFillerOpening(fillerBuffer);
                  if (cleaned) {
                    await writer.write(
                      encoder.encode(
                        `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                      )
                    );
                  }
                }
                fullContent = stripFillerOpening(fullContent);
                let sources2 = void 0;
                let searchQueries = [];
                const webSearchCalls = toolCalls.filter(
                  (tc) => tc.name === "web_search" && tc.arguments
                );
                if (webSearchCalls.length > 0) {
                  console.log("[EntityChat:Streaming] Web search triggered", {
                    searchCount: webSearchCalls.length
                  });
                  let firstQuery = "";
                  try {
                    const firstArgs = JSON.parse(webSearchCalls[0].arguments);
                    firstQuery = firstArgs.query || "";
                  } catch {
                    const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                    firstQuery = match ? match[1] : "multiple topics";
                  }
                  const searchNotice = webSearchCalls.length > 1 ? `${firstQuery} (+${webSearchCalls.length - 1} more)` : firstQuery;
                  await writer.write(
                    encoder.encode(
                      `data: ${JSON.stringify({ searching: true, query: searchNotice })}

`
                    )
                  );
                  const searchT0 = Date.now();
                  const searchPromises = webSearchCalls.map(async (tc) => {
                    try {
                      let query;
                      try {
                        const args = JSON.parse(tc.arguments);
                        query = args.query;
                      } catch (parseErr) {
                        const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                        if (match) {
                          query = match[1];
                          console.log(
                            "[EntityChat:Streaming] Recovered query from malformed JSON:",
                            query
                          );
                        } else {
                          console.log(
                            "[EntityChat:Streaming] Could not parse tool arguments:",
                            tc.arguments.slice(0, 200)
                          );
                          return { toolCallId: tc.id, query: null, results: null };
                        }
                      }
                      searchQueries.push(query);
                      const shouldIncludeImages = isVisualQuery(query) || isVisualQuery(lastUserMsg);
                      console.log("[EntityChat] Calling Tavily:", {
                        query,
                        includeImages: shouldIncludeImages,
                        isVisualQueryResult: isVisualQuery(query)
                      });
                      const results = await executeTavilySearch(query, env.TAVILY_API_KEY, {
                        includeImages: shouldIncludeImages
                      });
                      return { toolCallId: tc.id, query, results };
                    } catch (err) {
                      console.log("[EntityChat:Streaming] Individual search error:", err);
                      return { toolCallId: tc.id, query: null, results: null };
                    }
                  });
                  const searchResults = await Promise.all(searchPromises);
                  const searchLatency = Date.now() - searchT0;
                  const successfulSearches = searchResults.filter(
                    (sr) => sr.results && sr.results.results.length > 0
                  );
                  console.log("[EntityChat:Streaming] Searches complete", {
                    total: searchResults.length,
                    successful: successfulSearches.length,
                    latency: searchLatency
                  });
                  if (successfulSearches.length > 0) {
                    const originalContents = convertMessages(entityMessages2);
                    if (fullContent) {
                      modelResponseParts.unshift({ text: fullContent });
                    }
                    const functionResults = successfulSearches.map((sr) => ({
                      name: "web_search",
                      id: sr.toolCallId,
                      response: { results: formatSearchBrief(sr.results) }
                    }));
                    const followUpContents = buildFollowUpContents(
                      originalContents,
                      modelResponseParts,
                      functionResults
                    );
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify({ reset: true, done: false })}

`)
                    );
                    fullContent = "";
                    const followUpRes = await geminiStream(
                      genConfig2.systemPrompt,
                      [],
                      {
                        temperature: genConfig2.temperature,
                        maxOutputTokens: Math.max(genConfig2.maxTokens, 1200),
                        thinkingLevel: genConfig2.thinkingLevel,
                        nativeContents: followUpContents
                      },
                      env.GOOGLE_API_KEY
                    );
                    const followUpReader = followUpRes.body.getReader();
                    let followUpBuffer = "";
                    let readerDone = false;
                    let followUpFillerBuffer = "";
                    let followUpFillerFlushed = false;
                    while (!readerDone) {
                      const result = await followUpReader.read();
                      readerDone = result.done;
                      if (readerDone) break;
                      const value = result.value;
                      followUpBuffer += decoder.decode(value, { stream: true });
                      const lines = followUpBuffer.split("\n");
                      followUpBuffer = lines.pop() || "";
                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith("data:")) continue;
                        const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
                        if (jsonStr === "[DONE]") continue;
                        try {
                          const chunk = parseGeminiChunk(jsonStr);
                          const delta = chunk.text;
                          if (delta) {
                            fullContent += delta;
                            if (!followUpFillerFlushed) {
                              followUpFillerBuffer += delta;
                              const hasBreak = /[.?!]\s/.test(followUpFillerBuffer) || followUpFillerBuffer.length > 150;
                              if (hasBreak) {
                                const cleaned = stripFillerOpening(followUpFillerBuffer);
                                if (cleaned) {
                                  await writer.write(
                                    encoder.encode(
                                      `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                    )
                                  );
                                }
                                followUpFillerFlushed = true;
                              }
                            } else {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta, done: false })}

`
                                )
                              );
                            }
                          }
                        } catch {
                        }
                      }
                    }
                    if (followUpBuffer.trim()) {
                      const trimmed = followUpBuffer.trim();
                      if (trimmed.startsWith("data:")) {
                        const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
                        if (jsonStr !== "[DONE]") {
                          try {
                            const chunk = parseGeminiChunk(jsonStr);
                            const delta = chunk.text;
                            if (delta) {
                              fullContent += delta;
                              if (!followUpFillerFlushed) {
                                followUpFillerBuffer += delta;
                              } else {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta, done: false })}

`
                                  )
                                );
                              }
                            }
                          } catch {
                          }
                        }
                      }
                    }
                    if (!followUpFillerFlushed && followUpFillerBuffer) {
                      const cleaned = stripFillerOpening(followUpFillerBuffer);
                      if (cleaned) {
                        await writer.write(
                          encoder.encode(
                            `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                          )
                        );
                      }
                    }
                    fullContent = stripFillerOpening(fullContent);
                    sources2 = successfulSearches.flatMap(
                      (sr) => sr.results.results.map((r) => ({ title: r.title, url: r.url }))
                    );
                    console.log("[EntityChat] successfulSearches structure:", {
                      count: successfulSearches.length,
                      firstItem: successfulSearches[0] ? Object.keys(successfulSearches[0]) : "empty",
                      firstItemImages: successfulSearches[0]?.images,
                      firstItemResultsImages: successfulSearches[0]?.results?.images
                    });
                    successfulSearches.forEach((sr) => {
                      if (sr.results.images && sr.results.images.length > 0) {
                        searchImages.push(...sr.results.images);
                      }
                    });
                    console.log("[EntityChat] Images collected:", {
                      searchImagesCount: searchImages.length,
                      searchImages: searchImages.slice(0, 2)
                    });
                  }
                }
                if (webSearchCalls.length > 0 && !fullContent) {
                  console.log(
                    "[EntityChat:Streaming] Search fallback - responding without search results"
                  );
                  const fallbackResult = await geminiGenerate(
                    genConfig2.systemPrompt + "\n\nAnswer based on the entity context and your existing knowledge. Do not mention search availability.",
                    entityMessages2,
                    {
                      temperature: genConfig2.temperature,
                      maxOutputTokens: genConfig2.maxTokens,
                      thinkingLevel: genConfig2.thinkingLevel
                    },
                    env.GOOGLE_API_KEY
                  );
                  fullContent = fallbackResult.ok ? fallbackResult.content : "I had trouble searching for that information. Could you try rephrasing your question?";
                  fullContent = stripFillerOpening(fullContent);
                  const words = fullContent.split(" ");
                  for (let i = 0; i < words.length; i += 3) {
                    const chunk = words.slice(i, i + 3).join(" ") + " ";
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}

`)
                    );
                    await new Promise((resolve) => setTimeout(resolve, 15));
                  }
                }
                const searchQuery2 = searchQueries.length > 0 ? searchQueries.join(" | ") : void 0;
                const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion2(fullContent);
                const saveable = smartSuggestion ? { detected: true, type: smartSuggestion.type, smart: true } : detectSaveableContent2(cleanContent);
                const save_suggestion = smartSuggestion || null;
                fullContent = cleanContent;
                const promotion = detectSpacePromotion2(fullContent, messages2.length);
                const latency = Date.now() - t02;
                const displayContent = fullContent.replace(/<!--SAVE:.*?-->/gs, "").replace(/<!--SAVE:.*$/s, "").replace(/!\[.*?\]\(.*?\)/g, "").trim();
                const finalData = JSON.stringify({
                  done: true,
                  full_content: displayContent,
                  saveable,
                  save_suggestion,
                  promotion,
                  latency_ms: latency,
                  sources: sources2,
                  images: searchImages.length > 0 ? searchImages.slice(0, 2) : void 0,
                  search_query: searchQuery2,
                  fetchedUrl: fetchedUrl2
                });
                await writer.write(encoder.encode(`data: ${finalData}

`));
                console.log("[EntityChat:Streaming] Complete", {
                  latency_ms: latency,
                  content_length: fullContent.length,
                  has_saveable: saveable?.detected,
                  has_promotion: promotion?.suggested,
                  used_search: !!searchQuery2,
                  images_sent: searchImages.length > 0 ? searchImages.slice(0, 2) : void 0
                });
                if (authenticatedUserId && fullContent) {
                  const entity2 = body.entity || {};
                  const entityId = entity2.id || null;
                  const entityType = entity2.type || null;
                  if (entityId && entityType) {
                    const summaryPromise = (async () => {
                      try {
                        const tableName = entityType === "habit" ? "habits" : entityType === "note" ? "notes" : "todos";
                        const prevRes = await fetch(
                          `${env.SUPABASE_URL}/rest/v1/${tableName}?id=eq.${entityId}&select=views`,
                          {
                            headers: {
                              apikey: env.SUPABASE_SERVICE_KEY,
                              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                            }
                          }
                        );
                        const prevRows = prevRes.ok ? await prevRes.json() : [];
                        const previousEntitySummary = prevRows?.[0]?.views?.chat_summary || null;
                        await generateEntityChatSummary(
                          messages2.filter((m) => m.role !== "system"),
                          fullContent,
                          entityId,
                          entityType,
                          entity2.title || entity2.name || null,
                          entity2.space_name || null,
                          previousEntitySummary,
                          env,
                          tz
                        );
                      } catch (err) {
                        console.warn("[EntityChat] Chat summary failed:", err.message);
                      }
                    })();
                    ctx.waitUntil(summaryPromise);
                  }
                }
              } catch (streamErr) {
                console.log("[EntityChat:Streaming] Stream error", { error: String(streamErr) });
                const errorData = JSON.stringify({
                  error: String(streamErr),
                  done: true,
                  full_content: fullContent
                });
                await writer.write(encoder.encode(`data: ${errorData}

`));
              }
            } catch (outerErr) {
              console.error("[EntityChat:Streaming] Outer error", { error: String(outerErr) });
              try {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ error: String(outerErr), done: true })}

`
                  )
                );
              } catch {
              }
            } finally {
              try {
                await writer.close();
              } catch {
              }
            }
          })();
          return new Response(readable, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive"
            }
          });
        }
        let sessionContextStr = "";
        let userProfile = null;
        let cachedDomains = [];
        let entityTodayActivity = null;
        const previousExchange = extractPreviousExchange(messages2);
        if (authenticatedUserId) {
          try {
            const [chatContext, profile, domains, todayAct] = await Promise.all([
              buildChatContext(
                authenticatedUserId,
                "entity",
                {
                  entityTitle: entity?.title || entity?.name || null,
                  entitySpaceId: entity?.spaceId || entity?.space_id || null,
                  timezone: userTimezone,
                  currentChatId: body.chatId || null
                },
                env
              ),
              getUserProfile(authenticatedUserId, env),
              getCachedDomainNames(authenticatedUserId, env),
              buildTodayActivity(authenticatedUserId, userTimezone, env)
            ]);
            sessionContextStr = chatContext;
            userProfile = profile;
            cachedDomains = domains;
            entityTodayActivity = todayAct;
          } catch (err) {
            console.error("[EntityChat:NonStreaming] Context error", err);
          }
        }
        let urlContext = "";
        let fetchedUrl = null;
        const triage = await triageMessage({
          userMessage: lastUserMsg,
          previousExchange,
          spaceName: body.spaceName || void 0,
          preset: preset || void 0,
          chatType: "entity",
          env,
          domainNames: cachedDomains,
          profileSnippet: userProfile?.profileText?.slice(0, 150) || "",
          messageCount: messages2.length
        });
        console.log("[EntityChat:NonStreaming:Triage]", {
          mode: triage.mode,
          search: triage.search,
          personal: triage.personal,
          depth: triage.depth,
          source: triage.source,
          preset: preset || "none",
          messagePreview: lastUserMsg.slice(0, 80)
        });
        const entityContextBlock = buildEntityContextBlock({
          entity: {
            type: entity.type,
            title: entity.title || "Untitled",
            body: entity.body || null,
            tags: entity.tags || [],
            due_date: entity.due_date || null,
            frequency: entity.frequency || null,
            time_estimate: entity.time_estimate || null,
            subtype: entity.subtype || null
          },
          sweepContext: sweepContext || null,
          siblingContext: body.siblingContext || null,
          timeOfDay,
          timeStr,
          messageCount: messages2.length
        });
        const genConfig = buildEntityChatConfig(
          triage,
          entityContextBlock,
          body.accountCreatedAt,
          sessionContextStr,
          userProfile?.profileText,
          tz,
          entityTodayActivity
        );
        const entityMessages = [
          { role: "system", content: genConfig.systemPrompt },
          ...messages2.slice(-20).filter((m) => m.role !== "system")
        ];
        const previousSearchContext = messages2.filter((m) => m.role === "assistant" && m.metadata?.sources?.length > 0).slice(-1)[0];
        if (previousSearchContext) {
          entityMessages.push({
            role: "system",
            content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.metadata.sources.map((s) => s.title).join(", ")}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`
          });
        }
        const searchPolicy = getSearchPolicy(triage.search);
        const t0 = Date.now();
        try {
          const nonStreamConfig = {
            temperature: genConfig.temperature,
            maxOutputTokens: genConfig.maxTokens,
            thinkingLevel: genConfig.thinkingLevel
          };
          if (searchPolicy.attachTool) {
            nonStreamConfig.tools = [makeWebSearchTool(userTimezone)];
            nonStreamConfig.toolChoice = searchPolicy.toolChoice === "required" ? "web_search" : "auto";
          }
          const geminiResult = await geminiGenerate(
            genConfig.systemPrompt,
            entityMessages,
            nonStreamConfig,
            env.GOOGLE_API_KEY
          );
          let latency = Date.now() - t0;
          if (!geminiResult.ok) {
            console.log("[EntityChat] API error", {
              error: geminiResult.error,
              latency_ms: latency
            });
            return j(
              { error: "entity_chat_failed", detail: geminiResult.error, latency_ms: latency },
              200
            );
          }
          const toolCall = geminiResult.functionCalls?.[0];
          let content2 = geminiResult.content ?? "";
          let sources2 = void 0;
          let searchQuery2 = void 0;
          if (toolCall?.name === "web_search") {
            try {
              const args = toolCall.args || {};
              searchQuery2 = args.query;
              console.log("[EntityChat] Web search triggered", { query: searchQuery2 });
              const searchT0 = Date.now();
              const searchResults = await executeTavilySearch(searchQuery2, env.TAVILY_API_KEY);
              const searchLatency = Date.now() - searchT0;
              console.log("[EntityChat] Search complete", {
                resultCount: searchResults?.results?.length || 0,
                latency: searchLatency
              });
              if (searchResults && searchResults.results.length > 0) {
                const originalContents = convertMessages(entityMessages);
                const functionResults = [
                  {
                    name: "web_search",
                    id: toolCall.id || "web_search_0",
                    response: { results: formatSearchBrief(searchResults) }
                  }
                ];
                const followUpContents = buildFollowUpContents(
                  originalContents,
                  geminiResult.parts || [],
                  functionResults
                );
                const followUpResult = await geminiGenerate(
                  genConfig.systemPrompt,
                  [],
                  {
                    temperature: genConfig.temperature,
                    maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                    thinkingLevel: genConfig.thinkingLevel,
                    nativeContents: followUpContents
                  },
                  env.GOOGLE_API_KEY
                );
                content2 = followUpResult.ok ? followUpResult.content : "";
                sources2 = searchResults.results.map((r) => ({ title: r.title, url: r.url }));
                latency = Date.now() - t0;
              }
            } catch (searchErr) {
              console.log("[EntityChat] Search error:", searchErr);
            }
          }
          const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion2(content2);
          const saveable = smartSuggestion ? { detected: true, type: smartSuggestion.type, smart: true } : detectSaveableContent2(cleanContent);
          const save_suggestion = smartSuggestion || null;
          content2 = cleanContent;
          content2 = stripFillerOpening(content2);
          content2 = content2.replace(/<!--SAVE:.*?-->/gs, "").replace(/<!--SAVE:.*$/s, "").trim();
          const promotion = detectSpacePromotion2(content2, messages2.length);
          console.log("[EntityChat] Complete", {
            latency_ms: latency,
            content_length: content2.length,
            has_saveable: saveable?.detected,
            has_promotion: promotion?.suggested,
            used_search: !!searchQuery2
          });
          if (authenticatedUserId && content2) {
            const entity2 = body.entity || {};
            const entityId = entity2.id || null;
            const entityType = entity2.type || null;
            if (entityId && entityType) {
              const summaryPromise = (async () => {
                try {
                  const tableName = entityType === "habit" ? "habits" : entityType === "note" ? "notes" : "todos";
                  const prevRes = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/${tableName}?id=eq.${entityId}&select=views`,
                    {
                      headers: {
                        apikey: env.SUPABASE_SERVICE_KEY,
                        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                      }
                    }
                  );
                  const prevRows = prevRes.ok ? await prevRes.json() : [];
                  const previousEntitySummary = prevRows?.[0]?.views?.chat_summary || null;
                  await generateEntityChatSummary(
                    messages2.filter((m) => m.role !== "system"),
                    content2,
                    entityId,
                    entityType,
                    entity2.title || entity2.name || null,
                    entity2.space_name || null,
                    previousEntitySummary,
                    env,
                    tz
                  );
                } catch (err) {
                  console.warn("[EntityChat:NonStreaming] Chat summary failed:", err.message);
                }
              })();
              ctx.waitUntil(summaryPromise);
            }
          }
          return j({
            content: content2,
            saveable,
            save_suggestion,
            promotion,
            latency_ms: latency,
            sources: sources2,
            search_query: searchQuery2
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log("[EntityChat] Error", { error: String(err), latency_ms: latency });
          return j({ error: "entity_chat_failed", detail: String(err), latency_ms: latency }, 200);
        }
      }
      async function habitPreParse(userMessage, previousExchange, context, env2) {
        const { existingHabits, currentMode, turnNumber, compressedLifeMap, habitCapacity } = context;
        const habitList = (existingHabits || []).map((h) => {
          const parts = [h.name];
          parts.push(h.subtype === "break_habit" ? "break" : "build");
          if (h.frequency) parts.push(h.frequency);
          if (h.time_window && h.time_window !== "any") parts.push(h.time_window);
          return parts.join(", ");
        }).join(" | ") || "None";
        const today = context.currentDate || new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(/* @__PURE__ */ new Date());
        const prompt = `You classify the intent of a message in a habit-building conversation.
Today's date is ${today}.

CONTEXT:
- User's existing habits: ${habitList}
${habitCapacity ? `- Habit capacity: ${habitCapacity.totalActive} active habits (${habitCapacity.dailyCount} daily, ${habitCapacity.weeklyCount} weekly)` : ""}
- Life context: ${compressedLifeMap || "None available"}
- Current conversation mode: ${currentMode || "none (first message)"}
- Previous exchange: ${previousExchange ? `Assistant: "${previousExchange.assistantMsg?.slice(0, 200)}" / User: "${previousExchange.userMsg?.slice(0, 200)}"` : "none"}
- Turn number: ${turnNumber || 0}

IF current mode is "none" (first message) OR you detect a clear mode shift signal:
  CLASSIFY into exactly one primary mode:
  - QUICK_LOCK: User gave a specific behavior + frequency. All key info present.
  - SHAPE: Intent present but missing specific behavior and/or frequency.
  - RESEARCH: User is asking a question, wants information, or expresses curiosity/uncertainty.
  - BREAK: User wants to stop, quit, reduce, or eliminate a behavior.
  - EVENT_ANCHORED: Habit tied to a specific deadline, event, or milestone.
  Also check for a secondary mode if signals for two modes are present.

IF the user is simply responding to a question, confirming, or continuing without new intent:
  Return mode: "CONTINUE"

MODE SHIFT SIGNALS (reclassify even mid-conversation):
  - User asks a question \u2192 may shift to RESEARCH
  - User mentions a deadline or event \u2192 may add EVENT_ANCHORED as secondary
  - "I've tried this before" / "I keep failing" \u2192 set is_restart: true
  - "Just set it up" \u2192 shift to QUICK_LOCK
  - "What does research say?" \u2192 shift to RESEARCH
  - User mentions wanting to stop/quit something \u2192 shift to BREAK

ALSO DETECT:
- is_restart: true if user signals they've tried this before and failed/stopped. false otherwise.
- search_query: A concise 3-6 word web search query if RESEARCH mode or if user asks something researchable. null otherwise. Make it specific.
- event_context: { name, date (YYYY-MM-DD), weeks_until } if EVENT_ANCHORED detected. null otherwise.
- capacity_signal: Brief note if habit load suggests capacity concerns. null if fine.
- nudge_toward_proposal: true if turn_number >= 8. false otherwise.

EXTRACT fields present in THIS message:
- behavior, habit_type ("build"/"break"/null), frequency, start_date (YYYY-MM-DD), time_window ("morning"/"afternoon"/"evening"/"anytime"), end_date (YYYY-MM-DD)
All null if not present.

Return ONLY valid JSON:
{"mode":"...","secondary_mode":null,"is_restart":false,"search_query":null,"event_context":null,"capacity_signal":null,"nudge_toward_proposal":false,"extracted":{"behavior":null,"habit_type":null,"frequency":null,"start_date":null,"time_window":null,"end_date":null}}`;
        try {
          const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env2.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4.1-nano",
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: userMessage }
              ],
              temperature: 0.1,
              max_tokens: 300,
              response_format: { type: "json_object" }
            })
          });
          if (!res2.ok) {
            console.warn("[HabitPreParse] API error:", res2.status);
            return null;
          }
          const data = await res2.json();
          const raw2 = data?.choices?.[0]?.message?.content ?? "{}";
          const parsed = safeParseJson(raw2);
          if (!parsed || !parsed.mode) {
            console.warn("[HabitPreParse] Invalid response:", raw2?.slice(0, 100));
            return null;
          }
          const validModes = [
            "QUICK_LOCK",
            "SHAPE",
            "RESEARCH",
            "BREAK",
            "EVENT_ANCHORED",
            "CONTINUE"
          ];
          if (!validModes.includes(parsed.mode)) {
            console.warn("[HabitPreParse] Invalid mode:", parsed.mode);
            return null;
          }
          console.log("[HabitPreParse] Result:", {
            mode: parsed.mode,
            secondary: parsed.secondary_mode,
            isRestart: parsed.is_restart,
            hasSearch: !!parsed.search_query,
            nudge: parsed.nudge_toward_proposal
          });
          return parsed;
        } catch (err) {
          console.error("[HabitPreParse] Error:", err.message);
          return null;
        }
      }
      __name(habitPreParse, "habitPreParse");
      async function extractHabitFields(messages2, apiKey, currentDate, builderMode) {
        const fallbackDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        const isBreakMode = builderMode === "BREAK";
        const isEventMode = builderMode === "EVENT_ANCHORED";
        const extractionPrompt = `You analyze a habit-building conversation and assess readiness.
Today is ${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: userTimezone }).format(/* @__PURE__ */ new Date())}, ${currentDate || fallbackDate}.
Resolve relative day and date references into YYYY-MM-DD. Verify the day-of-week matches the calendar date before returning.

Conversation mode: ${builderMode || "SHAPE"}

Read the FULL conversation. Extract resolved fields and assess readiness.

=== READINESS TIERS ===
${isBreakMode ? `BREAK HABITS:
- "exploring": No specific behavior to stop identified.
- "shaping": Behavior to stop identified, but missing trigger OR replacement/boundary.
- "confirmable": Behavior to stop + trigger identified + replacement behavior OR boundary rule.
- "locked": User has confirmed.` : `BUILD HABITS:
- "exploring": No specific, schedulable behavior identified. User still thinking.
- "shaping": Specific behavior exists but missing frequency OR build/break type.
- "confirmable": Core triad resolved \u2014 specific trackable behavior + build/break + frequency. Start date defaults to today if not discussed.
- "locked": User has confirmed.`}

SPECIFICITY TEST: Could this behavior be written on a calendar? If yes, at least "shaping." If too vague to schedule, "exploring."
READINESS MUST NEVER REGRESS from a previous tier.

=== CONVERSATION VALUE ===
- "low": User provided all info upfront. Chat just confirmed.
- "medium": Chat helped shape the behavior, frequency, or approach.
- "high": Chat provided research, restart shaping, context integration, or fundamentally changed the approach.

=== FIELDS TO EXTRACT ===
1. name \u2014 clean habit name, 2-6 words. For break habits, use the boundary rule as the name if one has been shaped.
   CRITICAL: name must be short, action-oriented, and usable as a standalone title. Not a sentence, not a description, not a summary of the conversation. Return null if no specific behavior has been identified.
2. habit_type \u2014 "build" or "break"
3. cadence \u2014 "daily", "weekly", or "monthly"
4. target \u2014 normalized frequency string: "daily", "2x/week", "3x/week", "weekly", etc.
5. start_date \u2014 YYYY-MM-DD
6. time_window \u2014 "morning", "afternoon", "evening", or "anytime" (null if not discussed)
7. space_name \u2014 Space name if user discussed assigning to one (null if not)
8. notes \u2014 the user's personal WHY in one short sentence, first person. This must add context that is NOT already captured by the name, frequency, start date, or time window fields. If the user's motivation is fully expressed by the habit parameters themselves, return null. Maximum 15 words. Never mention the habit name, frequency, schedule, or any field values that already appear elsewhere in this JSON.
9. end_date \u2014 YYYY-MM-DD if a deadline or event was discussed (null if not)
10. time_estimate_minutes \u2014 estimated minutes per session: 5, 10, 15, 30, 45, 60, 90, 120 (null if not discussed, infer from activity type if obvious)
11. event_name \u2014 what they're working toward, if an event/deadline is involved (null if not)
12. is_restart \u2014 true if the user indicated they've attempted this before and stopped
13. restart_context \u2014 what went wrong last time and how this attempt differs (null if not a restart or not discussed)
${isBreakMode ? `
=== BREAK-SPECIFIC FIELDS ===
14. trigger \u2014 what causes the unwanted behavior (null if not discussed)
15. replacement_behavior \u2014 what they'll do instead when triggered (null if not discussed)
16. environment_change \u2014 any physical or environmental modifications planned (null if not discussed)
17. boundary_rule \u2014 the specific binary rule they're setting, phrased as a constraint (null if not shaped)
18. current_frequency \u2014 how often the unwanted behavior currently happens (null if not discussed)` : ""}
${isEventMode ? `
=== EVENT-SPECIFIC NOTES ===
Include the event name and timeline in the notes field.` : ""}

=== CONFIRMATION DETECTION ===
is_confirmation: true if the assistant's LAST message asks the user to confirm/lock in the habit. true even if the assistant did not list habit details (the app renders a visual card separately). false if still shaping.

=== POST-LOCK-IN EDIT DETECTION ===
If the habit was already confirmed and the user is requesting a change:
- edit_field: the field name being changed (frequency, start_date, end_date, time_window, name, notes, time_estimate_minutes, trigger, replacement_behavior, boundary_rule)
- edit_value: the new value
Keep readiness as "locked" in this case.

=== CHIPS ===
CRITICAL RULE: Chips must respond to the topic and intent of the assistant's last message, not to which habit fields are missing. For yes/no questions, return yes/no style options. For choice questions, return the choices. Never generate field-completion chips when the assistant asked an unrelated question.

suggested_chips: 2-3 short tappable answer options that directly respond to the assistant's last question.
- Match the question topic (frequency, time, start date, confirmation).
- If the assistant presented specific options in its message, use THOSE as chips.
- If the assistant asked an open-ended or exploratory question, return null.
- If readiness is confirmable, include a lock-in chip.
- Default to null if unsure.

steering_chips: 0-1 conversation control chips.
- If the conversation is 3+ turns and mode is SHAPE or RESEARCH, consider a skip-to-setup option.
- If research might help, consider a research option.
- If a restart signal seems possible, consider a past-attempt option.
- After lock-in: null.
- Default: null. Don't force steering chips.

Return ONLY valid JSON:
{
  "name": "string or null",
  "habit_type": "build or break or null",
  "cadence": "daily or weekly or monthly or null",
  "target": "string or null",
  "start_date": "YYYY-MM-DD or null",
  "time_window": "morning or afternoon or evening or anytime or null",
  "space_name": "string or null",
  "notes": "string or null",
  "end_date": "YYYY-MM-DD or null",
  "time_estimate_minutes": "number or null",
  "event_name": "string or null",
  "is_restart": false,
  "restart_context": "string or null",
  "is_confirmation": false,
  "readiness": "exploring or shaping or confirmable or locked",
  "conversation_value": "low or medium or high",
  "suggested_chips": "array of strings or null",
  "steering_chips": "array of strings or null",
  "edit_field": "string or null",
  "edit_value": "string or null"${isBreakMode ? `,
  "trigger": "string or null",
  "replacement_behavior": "string or null",
  "environment_change": "string or null",
  "boundary_rule": "string or null",
  "current_frequency": "string or null"` : ""}
}`;
        const defaults = {
          name: null,
          habit_type: null,
          cadence: null,
          target: null,
          start_date: null,
          time_window: null,
          space_name: null,
          notes: null,
          end_date: null,
          time_estimate_minutes: null,
          is_confirmation: false,
          suggested_chips: null,
          next_field: null,
          required_count: 0,
          readiness: "exploring",
          conversation_value: "low",
          event_name: null,
          is_restart: false,
          restart_context: null,
          steering_chips: null,
          edit_field: null,
          edit_value: null,
          trigger: null,
          replacement_behavior: null,
          environment_change: null,
          boundary_rule: null,
          current_frequency: null
        };
        try {
          const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                { role: "system", content: extractionPrompt },
                {
                  role: "user",
                  content: "Here is the conversation:\n\n" + messages2.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")
                }
              ],
              temperature: 0.1,
              max_tokens: 600,
              response_format: { type: "json_object" }
            })
          });
          if (!res2.ok) {
            console.log("[HabitBuilder:Extract] API error", { status: res2.status });
            return defaults;
          }
          const oj2 = await res2.json();
          const raw2 = oj2?.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(raw2);
          const extracted = {
            name: typeof parsed.name === "string" ? parsed.name : null,
            habit_type: ["build", "break"].includes(parsed.habit_type) ? parsed.habit_type : null,
            cadence: ["daily", "weekly", "monthly"].includes(parsed.cadence) ? parsed.cadence : null,
            target: typeof parsed.target === "string" ? parsed.target : null,
            start_date: typeof parsed.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.start_date) ? parsed.start_date : null,
            time_window: ["morning", "afternoon", "evening", "anytime"].includes(parsed.time_window) ? parsed.time_window : null,
            space_name: typeof parsed.space_name === "string" ? parsed.space_name : null,
            notes: typeof parsed.notes === "string" ? parsed.notes : null,
            end_date: typeof parsed.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.end_date) ? parsed.end_date : null,
            time_estimate_minutes: Number.isFinite(parsed.time_estimate_minutes) ? parsed.time_estimate_minutes : null,
            is_confirmation: parsed.is_confirmation === true,
            suggested_chips: Array.isArray(parsed.suggested_chips) ? parsed.suggested_chips.filter((c) => typeof c === "string" && c.length > 0 && c.length <= 30).slice(0, 4) : null,
            // V2 fields
            readiness: ["exploring", "shaping", "confirmable", "locked"].includes(parsed.readiness) ? parsed.readiness : "exploring",
            conversation_value: ["low", "medium", "high"].includes(parsed.conversation_value) ? parsed.conversation_value : "low",
            event_name: typeof parsed.event_name === "string" ? parsed.event_name : null,
            is_restart: parsed.is_restart === true,
            restart_context: typeof parsed.restart_context === "string" ? parsed.restart_context : null,
            steering_chips: Array.isArray(parsed.steering_chips) ? parsed.steering_chips.filter((c) => typeof c === "string" && c.length > 0 && c.length <= 30).slice(0, 2) : null,
            edit_field: typeof parsed.edit_field === "string" ? parsed.edit_field : null,
            edit_value: typeof parsed.edit_value === "string" ? parsed.edit_value : null,
            // Break-specific
            trigger: typeof parsed.trigger === "string" ? parsed.trigger : null,
            replacement_behavior: typeof parsed.replacement_behavior === "string" ? parsed.replacement_behavior : null,
            environment_change: typeof parsed.environment_change === "string" ? parsed.environment_change : null,
            boundary_rule: typeof parsed.boundary_rule === "string" ? parsed.boundary_rule : null,
            current_frequency: typeof parsed.current_frequency === "string" ? parsed.current_frequency : null
          };
          if (extracted.cadence === "daily" && !extracted.target) {
            extracted.target = "daily";
          }
          if (extracted.cadence === "monthly" && !extracted.target) {
            extracted.target = "monthly";
          }
          if (extracted.target && !extracted.cadence) {
            if (extracted.target === "daily") extracted.cadence = "daily";
            else if (extracted.target.includes("/week")) extracted.cadence = "weekly";
            else if (extracted.target.includes("/month")) extracted.cadence = "monthly";
            else if (extracted.target === "weekly") extracted.cadence = "weekly";
            else if (extracted.target === "monthly") extracted.cadence = "monthly";
          }
          const requiredFields = ["name", "habit_type", "cadence", "target", "start_date"];
          const requiredCount = requiredFields.filter((f) => extracted[f] !== null).length;
          const nextField = requiredCount >= 5 ? "confirm" : requiredFields.find((f) => extracted[f] === null) || null;
          extracted.required_count = requiredCount;
          extracted.next_field = nextField;
          return extracted;
        } catch (err) {
          console.log("[HabitBuilder:Extract] Error", { error: String(err) });
          return defaults;
        }
      }
      __name(extractHabitFields, "extractHabitFields");
      if (type === "organize-day") {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }
        const tasks = Array.isArray(body.tasks) ? body.tasks : [];
        const calendarEvents = Array.isArray(body.calendarEvents) ? body.calendarEvents : [];
        const blocks = body.blocks || {};
        const timezone = userTimezone;
        let currentHour;
        if (body.currentHour != null) {
          currentHour = body.currentHour;
        } else {
          const hourStr = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            hour12: false,
            timeZone: timezone
          }).format(/* @__PURE__ */ new Date());
          currentHour = parseInt(hourStr, 10);
        }
        const userId = authenticatedUserId;
        const userPatterns = body.userPatterns || null;
        const spacePriorities = body.spacePriorities || null;
        const habitContext = body.habitContext || null;
        const recentCompletions = body.recentCompletions || null;
        const DAILY_ORGANIZE_LIMIT = 5;
        if (userId && env.CORTEX_KV) {
          try {
            const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
              /* @__PURE__ */ new Date()
            );
            const limitKey = `organize-limit:${userId}:${today}`;
            const currentCount = parseInt(await env.CORTEX_KV.get(limitKey) || "0", 10);
            if (currentCount >= DAILY_ORGANIZE_LIMIT) {
              return j({
                error: "daily_limit_reached",
                limit: DAILY_ORGANIZE_LIMIT,
                assignments: [],
                overflow: [],
                reasoning: [],
                summary: `You've organized ${DAILY_ORGANIZE_LIMIT} times today. Trust your plan \u2014 you've got this.`,
                latency_ms: 0
              });
            }
            await env.CORTEX_KV.put(limitKey, String(currentCount + 1), { expirationTtl: 172800 });
          } catch (kvErr) {
            console.log("[organize-day] KV limit check failed, proceeding", {
              error: String(kvErr)
            });
          }
        }
        if (tasks.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: "No tasks to organize.",
            latency_ms: 0
          });
        }
        const tasksToAssign = tasks.filter((t) => !t.isLockedIn && !t.currentBlock);
        if (tasksToAssign.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: "All tasks are already assigned or locked.",
            latency_ms: 0
          });
        }
        const taskList = tasksToAssign.map((t) => {
          const parts = [`- ${t.id}: "${t.title}"`];
          parts.push(`  total_minutes: ${t.totalMinutes || t.estimateMinutes || 30}`);
          parts.push(`  energy: ${t.energyType || "administrative"}`);
          parts.push(`  type: ${t.type || "todo"}`);
          if (t.tags && Array.isArray(t.tags) && t.tags.length > 0) {
            parts.push(`  tags: ${t.tags.slice(0, 5).join(", ")}`);
          }
          if (t.timeWindowPreference) {
            parts.push(`  prefers: ${t.timeWindowPreference}`);
          }
          if (t.dueDate) {
            parts.push(`  due: ${t.dueDate}`);
          }
          if (t.priority) {
            parts.push(`  priority: ${t.priority}`);
          }
          if (t.spaceName) {
            parts.push(`  space: ${t.spaceName}`);
          }
          if (t.locked) {
            parts.push(`  locked: true`);
          }
          return parts.join("\n");
        }).join("\n");
        const calendarContext = calendarEvents.length > 0 ? calendarEvents.map((e) => `- ${e.title}: ${e.startAt} to ${e.endAt} (${e.durationMinutes}min)`).join("\n") : "No calendar events today.";
        const formatGaps = /* @__PURE__ */ __name((gaps) => (gaps || []).map(
          (g) => `  gap: ${g.startIso.slice(11, 16)}\u2013${g.endIso.slice(11, 16)} (${g.durationMinutes} min)`
        ).join("\n"), "formatGaps");
        const calendarFreeMinutes = /* @__PURE__ */ __name((block) => {
          if (!block) return 0;
          const total = ((block.endHour ?? 0) - (block.startHour ?? 0)) * 60;
          const gapTotal = (block.gaps || []).reduce((sum, g) => sum + (g.durationMinutes || 0), 0);
          return gapTotal || block.realisticAvailableMinutes || block.availableMinutes || 0;
        }, "calendarFreeMinutes");
        const blockContext = `Morning: ${calendarFreeMinutes(blocks.morning)} min available
${formatGaps(blocks.morning?.gaps)}
Day: ${calendarFreeMinutes(blocks.day)} min available
${formatGaps(blocks.day?.gaps)}
Evening: ${calendarFreeMinutes(blocks.evening)} min available
${formatGaps(blocks.evening?.gaps)}`;
        let expandedContext = "";
        if (userPatterns) {
          expandedContext += `
=== USER PATTERNS ===
`;
          if (userPatterns.peakFocusTime)
            expandedContext += `Peak focus time: ${userPatterns.peakFocusTime}
`;
          if (userPatterns.avgCompletionRate != null)
            expandedContext += `Avg daily completion rate: ${Math.round(userPatterns.avgCompletionRate * 100)}%
`;
          if (userPatterns.commonSkipTimes)
            expandedContext += `Common skip times: ${userPatterns.commonSkipTimes}
`;
          if (userPatterns.preferredTaskOrder)
            expandedContext += `Preferred order: ${userPatterns.preferredTaskOrder}
`;
        }
        if (spacePriorities && spacePriorities.length > 0) {
          expandedContext += `
=== SPACE PRIORITIES ===
`;
          expandedContext += spacePriorities.map(
            (s) => `- ${s.name}: priority ${s.priority}${s.taskCount ? ` (${s.taskCount} tasks)` : ""}`
          ).join("\n") + "\n";
        }
        if (habitContext && habitContext.length > 0) {
          expandedContext += `
=== HABIT CONTEXT ===
`;
          expandedContext += habitContext.map((h) => {
            const parts = [`- "${h.title}"`];
            if (h.currentStreak) parts.push(`streak: ${h.currentStreak} days`);
            if (h.bestTime) parts.push(`best time: ${h.bestTime}`);
            if (h.lastCompleted) parts.push(`last: ${h.lastCompleted}`);
            return parts.join(", ");
          }).join("\n") + "\n";
        }
        if (recentCompletions && recentCompletions.length > 0) {
          expandedContext += `
=== RECENT COMPLETIONS (last 3 days) ===
`;
          expandedContext += recentCompletions.slice(0, 15).map(
            (c) => `- "${c.title}" \u2192 ${c.block}${c.completedAt ? ` at ${c.completedAt}` : ""}`
          ).join("\n") + "\n";
        }
        let plannerProjection = "";
        if (userId) {
          plannerProjection = await fetchPlannerProjection(userId, timezone, env);
        }
        const ORGANIZE_SYSTEM_PROMPT = `You are a task scheduler for a productivity app called Gremly. Your job is to place tasks into time blocks to create a calm, focused, achievable day.

You are scheduling for real humans. This means:
- Overscheduling causes anxiety and paralysis. Leave breathing room.
- Transitions between very different tasks are cognitively expensive.
- Starting the day with a quick win builds momentum.
- Ending the day with low-energy tasks prevents evening overwhelm.
- Habits that have active streaks should be protected \u2014 don't let them slip.

=== SCHEDULING RULES ===
1. Never schedule tasks in past blocks (check current hour).
2. Aim for 85-95% of block capacity. Fill gaps thoroughly \u2014 it's better to schedule a task and let the user adjust than to overflow it when there's clearly room. Every assigned task must land in a specific gap.
3. Respect time_window_preference when set \u2014 this is a user commitment.
4. Use energy types to shape sequencing:
   - deep_focus: longest uninterrupted gap, ideally morning
   - administrative: batch together, any block
   - physical: avoid stacking back-to-back, avoid immediately after meals
   - social: avoid stacking, respect energy cost
   - quick: use as buffer between heavier tasks, or to start a block
5. Group tasks with shared tags or spaces to reduce context switching.
6. Spread habits across blocks \u2014 never cluster them all in one block.
7. Tasks due today get priority placement. Overdue tasks get highest.
8. If a user pattern indicates peak focus time, place deep_focus tasks there.
9. If habit context shows a best time, honor it.
10. If recent completions show a pattern (user always does X in morning), follow it.
11. LOCKED PRIORITIES: Tasks marked locked:true MUST be scheduled \u2014 never overflow them. Place locked tasks FIRST, then fill remaining capacity with unlocked tasks. If a locked task has a time preference, honor it strictly.

=== TIME SLOT ASSIGNMENT (REQUIRED) ===
Every assigned task MUST include a "scheduledStartIso" \u2014 the ISO-8601 start time within one of the block's gaps. This is NOT optional.

Rules:
1. Look at the gaps listed under each block in CAPACITY. Each gap has a start, end, and duration.
2. Pick a gap where the task's total_minutes fits entirely.
3. Set scheduledStartIso to a time ON or AFTER the gap start, leaving enough room before the gap end for the full task.
4. Round scheduledStartIso to the nearest 5-minute mark (e.g. :00, :05, :10 \u2026).
5. Do NOT double-book \u2014 track remaining gap time as you assign tasks and split gaps accordingly.
6. Prefer placing deep_focus tasks in the longest available gap.
7. Prefer placing quick tasks in short gaps or as transitions between heavier tasks.
8. If no gap can fit a task, overflow it \u2014 do NOT assign without a valid scheduledStartIso.
9. scheduledStartIso MUST be in the future \u2014 never before the current time shown in the TIME section.
10. Use ISO-8601 format with timezone offset, e.g. "2025-01-15T09:30:00-05:00".

=== OVERFLOW RULES ===
If tasks won't fit, overflow them. This is NOT failure \u2014 it's realistic planning.
- Overflow the lowest-priority, non-due-today tasks first.
- Never overflow an overdue task unless there is literally zero capacity.
- Never overflow a habit with an active streak unless capacity is truly zero.
- Overflow reason should be encouraging, not guilt-inducing.

CRITICAL: Only overflow tasks when blocks are genuinely full. If a block has 60+ minutes of unscheduled time, you MUST place more tasks there before overflowing anything. Count your assignments against capacity as you go. Users feel frustrated when they see empty time blocks alongside overflowed tasks.

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside the JSON.
{
  "assignments": [
    {
      "taskId": "...",
      "block": "morning|day|evening",  // IMPORTANT: use "day" for afternoon, never "afternoon"
      "reason": "5-10 words",
      "scheduledStartIso": "2025-01-15T09:30:00-05:00"  // REQUIRED ISO-8601 start time
    }
  ],
  "overflow": [
    {
      "taskId": "...",
      "reason": "5-10 encouraging words"
    }
  ],
  "reasoning": ["Pattern or decision 1", "Pattern 2", "Pattern 3"],
  "summary": "One calm sentence about the plan"
}

=== REASONING GUIDELINES ===
Provide 2-4 short bullets explaining your approach. Focus on:
- Grouping patterns ("Batched your work tasks together")
- Energy flow ("Put focus work in the morning when you're fresh")
- Habit placement ("Spread your habits throughout the day")
- Preference respect ("Honored your morning preference for the gym")
- Gap usage ("Slotted your deep work into the 90-min morning window")
- Pattern following ("You usually journal in the evening, so kept it there")

Do NOT mention in reasoning:
- Specific minute counts or capacity numbers
- Buffer calculations
- Energy type names (use plain language like "heavier tasks" or "quick wins")
- Technical terms

=== SCHEDULING WALKTHROUGH ===
Follow these steps IN ORDER:
1. Read all gaps for each block. Note their start, end, and available minutes.
2. Place LOCKED tasks first \u2014 they must be scheduled. Honor their time preferences.
3. Place overdue and due-today tasks next, fitting them into appropriate gaps.
4. Place remaining tasks by priority and energy fit, filling gaps as you go.
5. After each placement, subtract the task's total_minutes from the gap. If the gap is partially used, split it into the remaining segment.
6. When no gap can fit a task, overflow it with an encouraging reason.
7. Double-check: every assignment has a valid scheduledStartIso that falls inside a gap and is in the future.

Keep the tone warm and reassuring \u2014 like a helpful friend explaining the plan.`;
        const currentIso = (/* @__PURE__ */ new Date()).toISOString();
        const localTimeStr = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: timezone
          // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        }).format(/* @__PURE__ */ new Date());
        const userMessage = `=== TIME ===
Current time (UTC): ${currentIso}
Current local time: ${localTimeStr} (${timezone})
Current hour: ${currentHour}:00
Timezone: ${timezone}
Do NOT schedule any task before the current time.
Past blocks are unavailable.

=== CALENDAR ===
${calendarContext}

=== CAPACITY ===
${blockContext}

=== TASKS (${tasksToAssign.length} to schedule) ===
${taskList}

Each task includes:
- id, title
- total_minutes (includes prep/cooldown, use for capacity math)
- energy: deep_focus | administrative | physical | social | quick
- type: todo | habit
- tags: topical labels (work, health, finance, creative, etc.)
- prefers: time_window_preference if set
- due: due date if set
- priority: priority level if set
- space: which life domain this belongs to
- locked (boolean) \u2014 true if the user has committed to completing this task today. Prioritize scheduling these.
${expandedContext}
${plannerProjection ? "\n" + plannerProjection + "\n" : ""}
Schedule these tasks now. Respond with ONLY valid JSON.`;
        const apiKey = env.GOOGLE_API_KEY;
        if (!apiKey) {
          console.log("[organize-day] GOOGLE_API_KEY not configured");
          return j({ error: "google_key_not_configured" }, 500);
        }
        const t0 = Date.now();
        try {
          const geminiResult = await geminiGenerate(
            ORGANIZE_SYSTEM_PROMPT,
            [{ role: "user", content: userMessage }],
            {
              temperature: 0.2,
              maxOutputTokens: 8192,
              thinkingLevel: "low"
            },
            env.GOOGLE_API_KEY
          );
          const latency = Date.now() - t0;
          if (!geminiResult.ok) {
            console.log("[organize-day] Gemini API error", {
              status: geminiResult.status,
              latency_ms: latency,
              error: (geminiResult.error || "").substring(0, 300)
            });
            return j(
              {
                error: "organize_failed",
                detail: (geminiResult.error || "").substring(0, 200),
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: "AI unavailable" })),
                reasoning: [],
                summary: "Couldn't organize automatically. Tasks left flexible.",
                latency_ms: latency
              },
              200
            );
          }
          const rawContent = geminiResult.content;
          const usage = geminiResult.usage;
          console.log("[organize-day] Gemini usage", {
            prompt_tokens: usage.promptTokenCount,
            completion_tokens: usage.candidatesTokenCount,
            latency_ms: latency
          });
          let parsed = safeParseJson(rawContent);
          if (!parsed) {
            console.log("[organize-day] Parse failed", { preview: rawContent.substring(0, 200) });
            return j(
              {
                error: "parse_failed",
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: "Parse error" })),
                reasoning: [],
                summary: "Couldn't parse response. Tasks left flexible.",
                latency_ms: latency
              },
              200
            );
          }
          const validBlocks = ["morning", "day", "evening"];
          const taskIds = new Set(tasksToAssign.map((t) => t.id));
          const assignedIds = /* @__PURE__ */ new Set();
          const normalizeBlock = /* @__PURE__ */ __name((block) => {
            if (!block) return block;
            const lower = block.toLowerCase().trim();
            if (lower === "afternoon" || lower === "day") return "day";
            if (lower === "morning") return "morning";
            if (lower === "evening" || lower === "night") return "evening";
            return block;
          }, "normalizeBlock");
          const assignments = (Array.isArray(parsed.assignments) ? parsed.assignments : []).map((a) => ({ ...a, block: normalizeBlock(a.block) })).filter((a) => {
            if (!taskIds.has(a.taskId)) return false;
            if (!validBlocks.includes(a.block)) return false;
            if (assignedIds.has(a.taskId)) return false;
            assignedIds.add(a.taskId);
            return true;
          }).map((a) => {
            const result = {
              taskId: a.taskId,
              block: a.block,
              reason: String(a.reason || "").substring(0, 80)
            };
            if (a.scheduledStartIso) {
              const iso = String(a.scheduledStartIso);
              const parsed_date = new Date(iso);
              if (!isNaN(parsed_date.getTime())) {
                if (parsed_date.getTime() > Date.now()) {
                  result.scheduledStartIso = iso;
                } else {
                  console.log("[organize-day] Dropped past scheduledStartIso", {
                    taskId: a.taskId,
                    iso
                  });
                }
              } else {
                console.log("[organize-day] Invalid scheduledStartIso", {
                  taskId: a.taskId,
                  iso
                });
              }
            } else {
              console.log("[organize-day] Missing scheduledStartIso", { taskId: a.taskId });
            }
            return result;
          });
          const overflowIds = /* @__PURE__ */ new Set();
          const overflow = (Array.isArray(parsed.overflow) ? parsed.overflow : []).filter((o) => {
            if (!taskIds.has(o.taskId)) return false;
            if (assignedIds.has(o.taskId)) return false;
            if (overflowIds.has(o.taskId)) return false;
            overflowIds.add(o.taskId);
            return true;
          }).map((o) => ({
            taskId: o.taskId,
            reason: String(o.reason || "").substring(0, 80)
          }));
          for (const task of tasksToAssign) {
            if (!assignedIds.has(task.id) && !overflowIds.has(task.id)) {
              overflow.push({ taskId: task.id, reason: "Not assigned" });
            }
          }
          const summary = typeof parsed.summary === "string" && parsed.summary.length > 0 ? parsed.summary.substring(0, 200) : `Scheduled ${assignments.length} of ${tasksToAssign.length} tasks.`;
          const reasoning = Array.isArray(parsed.reasoning) ? parsed.reasoning.map((r) => String(r).substring(0, 200)).slice(0, 5) : [];
          console.log("[organize-day] Success", {
            assigned: assignments.length,
            overflow: overflow.length,
            total_tasks: tasksToAssign.length,
            latency_ms: latency
          });
          return j({
            assignments,
            overflow,
            reasoning,
            summary,
            latency_ms: latency,
            _debug: {
              model: "gemini-3-flash-preview",
              prompt_tokens: usage.promptTokenCount,
              completion_tokens: usage.candidatesTokenCount
            }
          });
        } catch (err) {
          const latency = Date.now() - t0;
          if (err.name === "AbortError") {
            console.log("[organize-day] Request timed out", { latency_ms: latency });
            return j(
              {
                error: "timeout",
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: "Timed out" })),
                reasoning: [],
                summary: "Took too long \u2014 tasks left flexible.",
                latency_ms: latency
              },
              200
            );
          }
          console.log("[organize-day] Error", { error: String(err), latency_ms: latency });
          return j(
            {
              error: "organize_failed",
              detail: String(err),
              assignments: [],
              overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: "Request failed" })),
              reasoning: [],
              summary: "Request failed. Tasks left flexible.",
              latency_ms: latency
            },
            200
          );
        }
      }
      if (type === "space-chat-save") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const userMessage = body.userMessage || "";
        const assistantMessage = body.assistantMessage || "";
        const spaceName = body.spaceName || "";
        const contextBlock = `=== CONTEXT ===
USER MESSAGE: "${userMessage.substring(0, 500)}"
SPACE: "${spaceName}"
AI RESPONSE TO SAVE:
"""
${assistantMessage.substring(0, 2e3)}
"""`;
        const spaceChatSavePrompt = `You classify and enrich saved chat responses for Gremly, a productivity app.
 
 === CLASSIFICATION RULES ===
 
 IMPORTANT: Classification is based primarily on the USER MESSAGE, not the AI response.
 The AI response content doesn't change what the user intended.
 
 **STEP 1: TODO - Check USER MESSAGE for task/reminder intent**
 
 If the USER MESSAGE contains ANY of these patterns  TODO:
 - "remind me to...", "remind me about..."
 - "don't let me forget...", "don't forget to..."
 - "I need to...", "I have to...", "I should..." (+ specific action)
 - "add a todo", "make this a task", "add to my list"
 - "buy...", "get...", "pick up..." (shopping/errand actions)
 
 TODO examples:
 - "Remind me to buy new running shoes this weekend"  TODO
 - "Don't let me forget to call mom"  TODO
 - "I need to book a dentist appointment"  TODO
 
 NOT todos (these are questions/advice requests  LOG):
 - "What should I buy for running?"  LOG (asking for advice)
 - "How do I book an appointment?"  LOG (asking how)
 - "What do I need to start cycling?"  LOG (asking for list)
 
 **STEP 2: HABIT - Check for commitment to track recurring behavior**
 
 HABIT requires EITHER:
 
 A) EXPLICIT FREQUENCY in conversation:
  - "daily", "every day", "every morning/evening/night"
  - "weekly", "every week", "once a week"
  - "twice a week", "2x per week", "3x per week"
  - "on Tuesdays", "on weekends", specific days
  - "monthly", "every month"
 
 B) STOP/QUIT + CONCRETE BEHAVIOR (even without explicit frequency):
  Patterns: "stop", "quit", "give up", "no more", "avoid", "cut out"
  Also softer: "should stop", "need to stop", "want to stop", "going to stop"
  
  - "I want to stop checking my phone when I wake up"  HABIT/break 
  - "I should stop snacking after dinner"  HABIT/break 
  - "You're right, I should stop doing that"  HABIT/break  (if "that" refers to trackable behavior)
  - "No social media after 9pm"  HABIT/break 
  - "I need to quit scrolling before bed"  HABIT/break 
 
 HABIT subtypes:
 - start_habit: Building/doing something (exercise, meditate, read, run)
 - break_habit: Stopping/avoiding something (stop smoking, quit scrolling, no phone)
 
 NOT habits:
 - "Drink more water"  LOG (vague, no frequency)
 - "Exercise more"  LOG (no specific commitment)
 - "Tips for building a habit"  LOG (asking for advice)
 
 **STEP 3: LOG subtypes (when not TODO or HABIT)**
 
 - journal: Emotional reflection, feelings, gratitude, struggles
 - idea: Explicit brainstorming ("what if", "maybe I could", "idea:")
 - general: Everything else - advice, plans, lists, reference material (DEFAULT)
 
 **DECISION TREE:**
 1. User message has reminder/task intent for a discrete, completable action?  TODO
 2. Explicit frequency OR stop/quit + ongoing behavioral pattern?  HABIT 
 3. Emotional/reflective content?  LOG/journal
 4. Brainstorming language?  LOG/idea
 5. Default  LOG/general
 
 === ENRICHMENT ===
 
 TITLE: 3-7 words capturing the SUBJECT/TOPIC \u2014 what it IS about.
 
 Rules:
 - Must make sense when scanned in a list (standalone, clear)
 - Strip temporal info (dates, times, time-of-day, days of week \u2192 metadata)
 - Strip frequency info ("daily", "3x/week" \u2192 tracked separately for habits)
 - Strip mood words ("stressed", "anxious" \u2192 mood metadata for journals)
 - No meta-language prefixes ("Reflect on", "Remember to", "Track")
 - Preserve question framing for ideas/journals
 - Title case
 
 Examples:
 - TODO: "Call Mom", "Buy Running Shoes", "Dentist Appointment"
 - HABIT: "Meditation", "Run", "No Phone Before Bed"
 - LOG: "Running Gear Options", "Career Decision", "Interview Stress"
 
 TAGS: 2-4 relevant lowercase tags with hyphens
 
 FREQUENCY (habits only):
 Parse carefully from conversation. COUNT THE ACTUAL NUMBER.
 
 Word-to-number mapping:
 - "once" = 1
 - "twice" or "two times" = 2
 - "three times" or "thrice" = 3
 - "four times" = 4
 - "five times" = 5
 
 Day counting - COUNT THE DAYS MENTIONED:
 - "Mondays and Fridays" = 2 days  "2x/week"
 - "Tuesdays and Thursdays" = 2 days  "2x/week"
 - "Monday, Wednesday, Friday" = 3 days  "3x/week"
 - "Tuesdays, Thursdays and Sundays" = 3 days  "3x/week"
 
 Examples:
 - "twice a week"  "2x/week" (NOT 3x/week!)
 - "two times per week"  "2x/week"
 - "three times a week" or "3x per week"  "3x/week"
 - "Mondays and Fridays"  "2x/week" (2 days = 2x)
 - "every day" or "daily"  "daily"
 - "once a week" or "weekly"  "weekly"
 
 DAYS (habits only):
 If specific days are mentioned, extract them as numbers (0=Sunday, 1=Monday, ... 6=Saturday):
 - "Mondays and Fridays"  [1, 5]
 - "Tuesdays and Thursdays"  [2, 4]
 - "on weekends"  [0, 6]
 - "Monday, Wednesday, Friday"  [1, 3, 5]
 If no specific days mentioned, return null.
 
 TIME_ESTIMATE (minutes: 5, 10, 15, 30, 45, 60, 90, 120):
 Activity-based defaults:
 - Running/jogging: 30-45 min
 - Gym workout: 45-60 min
 - Meditation: 10-15 min
 - Reading: 20-30 min
 - Quick habits (water, vitamins): 5 min
 - Phone calls: 15-30 min
 - Shopping errands: 30-60 min
 
 HAS_LIST: true if response contains bullets or numbered items
 
 === OUTPUT ===
 
 Return ONLY valid JSON:
 {
  "type": "habit" | "todo" | "log",
  "subtype": "start_habit" | "break_habit" | "general" | "idea" | "journal",
  "confidence": 0.0-1.0,
  "title": "3-7 Word Title",
  "tags": ["tag1", "tag2"],
  "frequency": "daily" | "2x/week" | "3x/week" | "weekly" | null,
  "days": [1, 5] | null,
  "timeEstimateMinutes": number | null,
  "hasList": boolean
 }`;
        const t0 = Date.now();
        const result = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: spaceChatSavePrompt,
          messages: [{ role: "user", content: contextBlock }],
          temperature: 0.3,
          maxOutputTokens: 250,
          endpoint: "space-chat-save"
        });
        const latency = Date.now() - t0;
        if (!result.parsed) {
          console.log("[space-chat-save] Both providers failed", { latency_ms: latency });
          return j({ error: "classification_failed", latency_ms: latency }, 200);
        }
        const parsed = result.parsed;
        const validTypes = ["habit", "todo", "log"];
        let resultType = String(parsed.type || "log").toLowerCase();
        if (!validTypes.includes(resultType)) resultType = "log";
        const validSubtypes = {
          habit: ["start_habit", "break_habit"],
          todo: [],
          log: ["general", "idea", "journal", "event"]
        };
        let subtype = parsed.subtype;
        if (resultType === "habit") {
          subtype = validSubtypes.habit.includes(subtype) ? subtype : "start_habit";
        } else if (resultType === "log") {
          subtype = validSubtypes.log.includes(subtype) ? subtype : "general";
        } else {
          subtype = null;
        }
        let confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.8;
        confidence = Math.max(0, Math.min(1, confidence));
        let title = String(parsed.title || "").trim();
        if (title.length < 3 || title.length > 60) {
          title = userMessage.split(/[.?!]/)[0].trim();
          if (title.length > 50) title = title.substring(0, 47) + "...";
          if (title.length < 3) title = "Saved From Chat";
        }
        title = title.split(/\s+/).map((w) => w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
        let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        tags = tags.map(
          (t) => String(t).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        ).filter((t) => t.length >= 2 && t.length <= 30).filter((t) => !isStopTag2(t)).slice(0, 5);
        let frequency = null;
        if (resultType === "habit") {
          frequency = parsed.frequency || "daily";
        }
        let days = null;
        if (resultType === "habit" && Array.isArray(parsed.days) && parsed.days.length > 0) {
          const validDays = parsed.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
          if (validDays.length > 0) {
            days = [...new Set(validDays)].sort((a, b) => a - b);
          }
        }
        if (resultType === "habit" && !days) {
          days = parseDaysFromText2(userMessage);
        }
        let timeEstimateMinutes = null;
        if (resultType === "habit" || resultType === "todo") {
          const num = Number(parsed.timeEstimateMinutes);
          if (Number.isFinite(num) && num > 0) {
            timeEstimateMinutes = Math.min(240, Math.max(5, Math.round(num / 5) * 5));
          }
        }
        const hasList = Boolean(parsed.hasList);
        console.log("[space-chat-save] Success", {
          type: resultType,
          subtype,
          title: title.substring(0, 30),
          tags_count: tags.length,
          has_frequency: !!frequency,
          has_days: !!days,
          has_time: !!timeEstimateMinutes,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency
        });
        return j({
          type: resultType,
          subtype,
          confidence,
          title,
          tags,
          frequency,
          days,
          timeEstimateMinutes,
          hasList,
          latency_ms: latency
        });
      }
      if (type === "weekly-summary") {
        const rl = await checkIpRateLimit(request, env, "misc", 30);
        if (!rl.allowed) return rateLimitResponse("misc", rl.count, rl.limit);
        const t0 = Date.now();
        const { payload, trendContext } = body;
        if (!payload) {
          console.log("[weekly-summary] Missing payload");
          return j({ error: "missing_payload" }, 400);
        }
        try {
          const userMessage = `Here is my week's data:

${JSON.stringify(payload, null, 2)}${trendContext ? `

Trend context from prior weeks:
${JSON.stringify(trendContext, null, 2)}` : ""}`;
          const anthropicKey = env.ANTHROPIC_API_KEY;
          if (!anthropicKey) {
            console.log("[weekly-summary] ANTHROPIC_API_KEY not configured");
            return j({ error: "anthropic_key_not_configured" }, 500);
          }
          const res2 = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 2e3,
              system: WEEKLY_SUMMARY_SYSTEM_PROMPT,
              messages: [{ role: "user", content: userMessage }]
            })
          });
          if (!res2.ok) {
            const errText = await res2.text();
            const latency2 = Date.now() - t0;
            console.log("[weekly-summary] Anthropic API error", {
              status: res2.status,
              latency_ms: latency2
            });
            return j({ error: "anthropic_api_error", detail: errText }, 502);
          }
          const anthropicResponse = await res2.json();
          const rawText = anthropicResponse.content?.[0]?.text || "";
          const parsed = safeParseJson(rawText);
          if (!parsed) {
            const latency2 = Date.now() - t0;
            console.log("[weekly-summary] Failed to parse AI response", {
              latency_ms: latency2,
              rawLength: rawText.length
            });
            return j({ error: "parse_failed", raw: rawText.slice(0, 500) }, 500);
          }
          if (!parsed.weeklyCommentary || !parsed.highlightMoment || !parsed.insights || !parsed.weekAhead) {
            const latency2 = Date.now() - t0;
            console.log("[weekly-summary] Incomplete AI response", {
              latency_ms: latency2,
              keys: Object.keys(parsed)
            });
            return j({ error: "incomplete_response", parsed }, 500);
          }
          if (!Array.isArray(parsed.insights)) {
            parsed.insights = [];
          }
          if (!parsed.weekAhead.highlights) parsed.weekAhead.highlights = [];
          if (!parsed.weekAhead.busyDayWarnings) parsed.weekAhead.busyDayWarnings = [];
          if (typeof parsed.weekAhead.totalEventCount !== "number")
            parsed.weekAhead.totalEventCount = 0;
          if (!Array.isArray(parsed.keyThemes)) parsed.keyThemes = [];
          if (!parsed.mood) parsed.mood = "steady";
          const latency = Date.now() - t0;
          console.log("[weekly-summary] Success", {
            latency_ms: latency,
            insights: parsed.insights.length,
            themes: parsed.keyThemes.length,
            mood: parsed.mood,
            upcomingHighlights: parsed.weekAhead.highlights.length
          });
          return j(parsed);
        } catch (err) {
          const latency = Date.now() - t0;
          console.log("[weekly-summary] Error", { error: String(err), latency_ms: latency });
          return j({ error: "request_failed", detail: String(err) }, 500);
        }
      }
      if (type === "chat-full-summary") {
        const rl = await checkIpRateLimit(request, env, "misc", 30);
        if (!rl.allowed) return rateLimitResponse("misc", rl.count, rl.limit);
        const chatId = body.chatId;
        if (!chatId) return j({ error: "missing_chatId" }, 400);
        try {
          const msgRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/space_chat_messages?chat_id=eq.${encodeURIComponent(chatId)}&select=role,content&order=created_at.asc`,
            {
              headers: {
                apikey: env.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
              }
            }
          );
          if (!msgRes.ok) {
            console.warn(`[ChatFullSummary] Failed to fetch messages: ${msgRes.status}`);
            return j({ error: "fetch_failed" }, 500);
          }
          const allMessages = await msgRes.json();
          const userMessages = allMessages.filter((m) => m.role !== "system");
          if (userMessages.length === 0) {
            return j({ summary: null });
          }
          const conversationText = userMessages.map(
            (m) => `${m.role === "user" ? "User" : "Gremly"}: ${(m.content || "").slice(0, 600)}`
          ).join("\n\n");
          const todayStr = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: userTimezone
          }).format(/* @__PURE__ */ new Date());
          const summaryPrompt = `Today is ${todayStr}. Summarize this entire conversation in 3-6 sentences. Cover ALL major topics discussed from start to finish \u2014 not just the beginning or the end. Include specific names, dates, decisions, recommendations, and action items mentioned. Write as a factual note the user can reference later.

CONVERSATION:
${conversationText}

SUMMARY:`;
          const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [{ role: "user", content: summaryPrompt }],
              max_tokens: 400,
              temperature: 0.3
            })
          });
          if (!res2.ok) {
            console.warn(`[ChatFullSummary] OpenAI call failed: ${res2.status}`);
            return j({ error: "openai_failed" }, 500);
          }
          const data = await res2.json();
          const summary = (data.choices?.[0]?.message?.content || "").trim();
          console.log(`[ChatFullSummary] Generated ${summary.length} chars for chat ${chatId}`);
          return j({ summary: summary || null });
        } catch (err) {
          console.warn(`[ChatFullSummary] Error: ${err.message}`);
          return j({ error: "request_failed", detail: String(err) }, 500);
        }
      }
      if (type === "transcribe") {
        const rl = await checkIpRateLimit(request, env, "transcribe", 20);
        if (!rl.allowed) return rateLimitResponse("transcribe", rl.count, rl.limit);
        const audio = body.audio;
        const format = body.format || "m4a";
        if (!audio) {
          console.log("[Transcribe] Missing audio data");
          return j({ error: "missing_audio" }, 400);
        }
        const estimatedBytes = audio.length * 3 / 4;
        if (estimatedBytes > 25 * 1024 * 1024) {
          console.log("[Transcribe] Audio too large", {
            size_mb: Math.round(estimatedBytes / 1024 / 1024)
          });
          return j({ error: "audio_too_large", max_mb: 25 }, 400);
        }
        const supportedFormats = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"];
        const normalizedFormat = format.toLowerCase().replace(".", "");
        if (!supportedFormats.includes(normalizedFormat)) {
          console.log("[Transcribe] Unsupported format", { format });
          return j({ error: "unsupported_format", supported: supportedFormats }, 400);
        }
        const t0 = Date.now();
        try {
          const binaryString = atob(audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const formData = new FormData();
          formData.append(
            "file",
            new Blob([bytes], { type: `audio/${normalizedFormat}` }),
            `audio.${normalizedFormat}`
          );
          formData.append("model", "whisper-1");
          formData.append("response_format", "json");
          console.log("[Transcribe] Calling Whisper API", {
            size_kb: Math.round(bytes.length / 1024),
            format: normalizedFormat
          });
          const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`
            },
            body: formData
          });
          const latency = Date.now() - t0;
          if (!whisperRes.ok) {
            const errText = await whisperRes.text().catch(() => "");
            console.log("[Transcribe] Whisper API error", {
              status: whisperRes.status,
              error: errText,
              latency_ms: latency
            });
            return j(
              {
                error: "transcription_failed",
                status: whisperRes.status,
                detail: errText
              },
              200
            );
          }
          const result = await whisperRes.json();
          const text = result.text || "";
          console.log("[Transcribe] Success", {
            text_length: text.length,
            text_preview: text.substring(0, 50),
            latency_ms: latency
          });
          return j({
            text,
            duration: result.duration,
            language: result.language || "en",
            latency_ms: latency
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log("[Transcribe] Error", {
            error: String(err),
            latency_ms: latency
          });
          return j(
            {
              error: "transcription_error",
              detail: String(err?.message || "unknown")
            },
            200
          );
        }
      }
      if (type === "sweep-headline") {
        const rl = await checkIpRateLimit(request, env, "misc", 30);
        if (!rl.allowed) return rateLimitResponse("misc", rl.count, rl.limit);
        const {
          tone,
          lifeMoment,
          todosCompleted,
          habitsCompleted,
          eventsCompleted,
          dropsCaptured
        } = body;
        const systemPrompt = `You generate a single short celebration line for a productivity app's evening review screen. The line acknowledges what the user accomplished today within the context of their current life situation.

Rules:
- Maximum 8 words. Aim for 4-6.
- No exclamation marks. No emoji.
- No generic phrases like "Great job!" or "Nice work today!" or "Keep it up!"
- Warm, slightly cheeky. Like a friend who knows your situation.
- Reference the life context naturally if it adds specificity.
- If the user is relaxed/on vacation with low activity, acknowledge that's intentional and fine.
- Output ONLY the headline text, nothing else.

Examples of good output:
- "Bora Bora pace. Light one today."
- "Big pitch week. You showed up."
- "Slow day. That counts too."
- "Three meetings down. Evening's yours."
- "Wedding crunch mode. Solid progress."`;
        const userContent = `Tone: ${tone || "focused"}
Life context: ${lifeMoment || "none"}
Completed: ${todosCompleted || 0} todos, ${habitsCompleted || 0} habits, ${eventsCompleted || 0} events, ${dropsCaptured || 0} drops`;
        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`
            },
            body: JSON.stringify({
              model: "gpt-4.1-nano",
              temperature: 0.6,
              max_tokens: 30,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
              ]
            })
          });
          if (!response.ok) {
            return j({ headline: null, error: "nano_failed" });
          }
          const data = await response.json();
          const headline = data.choices?.[0]?.message?.content?.trim() || null;
          return j({ headline });
        } catch (err) {
          console.error("[SweepHeadline] Error:", err);
          return j({ headline: null, error: "exception" });
        }
      }
      if (type === "classify-preparse") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        if (!text.trim()) {
          return j(
            {
              error: "missing_text",
              detail: "text field is required"
            },
            400
          );
        }
        const preparseResult = await runPreparse(text, env);
        if (!preparseResult.success) {
          return j({ error: "preparse_failed", latency_ms: preparseResult.latency_ms });
        }
        return j({
          ...preparseResult.result,
          latency_ms: preparseResult.latency_ms
        });
      }
      if (type === "classify-phase1-v2") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        const hasAttachments = body.hasAttachments || false;
        const t0 = Date.now();
        if (!text.trim()) {
          return j(
            {
              error: "missing_text",
              detail: "text field is required"
            },
            400
          );
        }
        const preparseResult = await runPreparse(text, env);
        const preparseLatency = preparseResult.latency_ms;
        if (!preparseResult.success) {
          console.log("[Phase1v2] Preparse failed, falling back to Phase 1", {
            error: preparseResult.error,
            preparse_latency_ms: preparseLatency
          });
          const phase1Response = await fetch(
            new Request(request.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "classify-phase1", text, hasAttachments })
            })
          );
          return j({
            bucket: "log",
            subtype: "general",
            habitSubtype: null,
            confidence: 0.5,
            source: "preparse-fallback",
            is_multi: false,
            preparse_latency_ms: preparseLatency,
            heuristic_reason: "preparse_failed",
            latency_ms: Date.now() - t0
          });
        }
        console.log("[Phase1v2] PreParse result", {
          text_preview: text.substring(0, 50),
          // Derived backward-compatible fields
          core_verb: preparseResult.result.core_verb,
          action_target: preparseResult.result.action_target,
          parse_confidence: preparseResult.result.parse_confidence,
          frame_type: preparseResult.result.frame_type,
          verb_position: preparseResult.result.verb_position,
          frequency_type: preparseResult.result.frequency_type,
          frequency_present: preparseResult.result.frequency_present,
          is_noun_phrase_only: preparseResult.result.is_noun_phrase_only,
          is_self_restriction: preparseResult.result.is_self_restriction,
          has_occasion_noun: preparseResult.result.has_occasion_noun,
          has_implied_recurrence: preparseResult.result.has_implied_recurrence,
          emotional_content: preparseResult.result.emotional_content,
          uncertainty_present: preparseResult.result.uncertainty_present,
          obligation_framing: preparseResult.result.obligation_framing,
          factual_statement: preparseResult.result.factual_statement,
          self_reflection: preparseResult.result.self_reflection,
          direction_without_schedule: preparseResult.result.direction_without_schedule,
          // Atomic observations
          is_command: preparseResult.result.is_command,
          is_declarative: preparseResult.result.is_declarative,
          has_speculation: preparseResult.result.has_speculation,
          is_past_or_present: preparseResult.result.is_past_or_present,
          is_narrative_reflection: preparseResult.result.is_narrative_reflection,
          is_scheduled_occurrence: preparseResult.result.is_scheduled_occurrence,
          scheduled_reasoning: preparseResult.result.scheduled_reasoning,
          is_reference_detail: preparseResult.result.is_reference_detail,
          reference_reasoning: preparseResult.result.reference_reasoning,
          has_emotion_language: preparseResult.result.has_emotion_language,
          emotion_reasoning: preparseResult.result.emotion_reasoning,
          is_about_feelings_not_actions: preparseResult.result.is_about_feelings_not_actions,
          feelings_reasoning: preparseResult.result.feelings_reasoning,
          has_date_or_time: preparseResult.result.has_date_or_time,
          has_occurrence_count: preparseResult.result.has_occurrence_count,
          has_time_reference: preparseResult.result.has_time_reference,
          time_reference_binding: preparseResult.result.time_reference_binding,
          claims_all_instances: preparseResult.result.claims_all_instances,
          has_measurable_amount: preparseResult.result.has_measurable_amount,
          amount_bounded_by_period: preparseResult.result.amount_bounded_by_period,
          bounding_period_recurs: preparseResult.result.bounding_period_recurs,
          has_explicit_multiplicity: preparseResult.result.has_explicit_multiplicity,
          user_is_agent: preparseResult.result.user_is_agent,
          action_is_future: preparseResult.result.action_is_future,
          multiplicity_is_future_self: preparseResult.result.multiplicity_is_future_self,
          is_ongoing_practice: preparseResult.result.is_ongoing_practice,
          has_routine_anchor: preparseResult.result.has_routine_anchor,
          is_single_instance: preparseResult.result.is_single_instance,
          single_instance_reasoning: preparseResult.result.single_instance_reasoning,
          has_prohibition: preparseResult.result.has_prohibition,
          has_discontinuation: preparseResult.result.has_discontinuation,
          discontinuation_reasoning: preparseResult.result.discontinuation_reasoning,
          references_existing_pattern: preparseResult.result.references_existing_pattern,
          pattern_reasoning: preparseResult.result.pattern_reasoning,
          has_relative_change: preparseResult.result.has_relative_change,
          has_hedging: preparseResult.result.has_hedging,
          has_obligation: preparseResult.result.has_obligation,
          action_direction: preparseResult.result.action_direction,
          action_direction_reasoning: preparseResult.result.action_direction_reasoning,
          time_role: preparseResult.result.time_role,
          time_role_reasoning: preparseResult.result.time_role_reasoning,
          boundary_type: preparseResult.result.boundary_type,
          boundary_reasoning: preparseResult.result.boundary_reasoning,
          temporal_orientation: preparseResult.result.temporal_orientation,
          user_mode_record_or_change: preparseResult.result.user_mode_record_or_change,
          is_about_personal_patterns: preparseResult.result.is_about_personal_patterns,
          is_storing_information: preparseResult.result.is_storing_information,
          is_about_emotion: preparseResult.result.is_about_emotion,
          user_intent_mode: preparseResult.result.user_intent_mode,
          is_state_verb: preparseResult.result.is_state_verb,
          has_concrete_result: preparseResult.result.has_concrete_result,
          verb_has_completion: preparseResult.result.verb_has_completion,
          references_current_state: preparseResult.result.references_current_state,
          change_is_open_ended: preparseResult.result.change_is_open_ended,
          has_restriction_boundary: preparseResult.result.has_restriction_boundary,
          degree_shift_target: preparseResult.result.degree_shift_target,
          // Structural parse (mini)
          struct_verb: preparseResult.result.core_verb,
          struct_has_verb: preparseResult.result.has_verb,
          struct_object: preparseResult.result.struct_object,
          struct_modifier: preparseResult.result.struct_modifier,
          struct_modifier_target: preparseResult.result.struct_modifier_target,
          struct_time_reference: preparseResult.result.struct_time_reference,
          struct_time_binding: preparseResult.result.struct_time_binding,
          struct_verb_type: preparseResult.result.is_state_verb ? "state" : preparseResult.result.has_verb ? "action" : "none",
          struct_intent_mode: preparseResult.result.user_intent_mode,
          struct_completion: preparseResult.result.struct_completion,
          struct_novelty: preparseResult.result.struct_novelty,
          latency_ms: preparseResult.latency_ms
        });
        preparseResult.result.text_preview = (text || "").substring(0, 60);
        console.log("[Scorer:DateIntent]", {
          hasUserSelectedDate: body.hasUserSelectedDate || false
        });
        const heuristicDecision = mapPreparseToClassification(preparseResult.result, {
          hasUserSelectedDate: body.hasUserSelectedDate || false
        });
        const plausibleInterpretations = computePlausibleInterpretations(preparseResult.result);
        console.log("[Phase1v2] Heuristic decision", {
          needsPhase1: heuristicDecision.needsPhase1,
          reason: heuristicDecision.reason || null,
          bucket: heuristicDecision.bucket || null,
          subtype: heuristicDecision.subtype || null
        });
        if (!heuristicDecision.needsPhase1) {
          const totalLatency2 = Date.now() - t0;
          console.log("[Phase1v2] Fast path", {
            bucket: heuristicDecision.bucket,
            subtype: heuristicDecision.subtype,
            habitSubtype: heuristicDecision.habitSubtype,
            frame_type: preparseResult.result.frame_type,
            core_verb: preparseResult.result.core_verb,
            preparse_latency_ms: preparseLatency,
            total_latency_ms: totalLatency2
          });
          return j({
            bucket: heuristicDecision.bucket,
            subtype: heuristicDecision.subtype,
            habitSubtype: heuristicDecision.habitSubtype,
            confidence: 0.85,
            source: "heuristic",
            is_multi: false,
            is_ambiguous: false,
            preparse_latency_ms: preparseLatency,
            heuristic_reason: `fast_path:${preparseResult.result.frame_type}`,
            reminder_intent: preparseResult.result.reminder_intent || false,
            latency_ms: totalLatency2
          });
        }
        console.log("[Phase1v2] Needs Phase 1", {
          reason: heuristicDecision.reason,
          preparse_latency_ms: preparseLatency
        });
        console.log("[Phase1:DateIntent]", {
          hasUserSelectedDate: body.hasUserSelectedDate || false
        });
        const phase1Result = await runPhase1Classification(
          text,
          env,
          preparseResult.result,
          heuristicDecision.reason,
          heuristicDecision.scores || null,
          body.hasUserSelectedDate || false
        );
        const phase1Latency = phase1Result.latency_ms;
        const totalLatency = Date.now() - t0;
        if (!phase1Result.success) {
          console.error("[Phase1v2] Phase 1 call failed", {
            error: phase1Result.error,
            preparse_latency_ms: preparseLatency,
            phase1_latency_ms: phase1Latency
          });
          return j({
            bucket: "log",
            subtype: "general",
            habitSubtype: null,
            confidence: 0.5,
            source: "phase1-error-fallback",
            is_multi: false,
            preparse_latency_ms: preparseLatency,
            phase1_latency_ms: phase1Latency,
            heuristic_reason: heuristicDecision.reason,
            reminder_intent: false,
            latency_ms: totalLatency
          });
        }
        const result = phase1Result.result;
        console.log("[Phase1v2] Phase 1 complete", {
          bucket: result.bucket,
          subtype: result.subtype,
          confidence: result.confidence,
          heuristic_reason: heuristicDecision.reason,
          preparse_latency_ms: preparseLatency,
          phase1_latency_ms: phase1Latency,
          total_latency_ms: totalLatency
        });
        return j({
          bucket: result.bucket,
          subtype: result.subtype,
          habitSubtype: result.habitSubtype,
          confidence: result.confidence,
          source: "api",
          is_multi: result.is_multi || false,
          is_ambiguous: result.is_ambiguous,
          ambiguity_type: result.ambiguity_type,
          ambiguity_reason: result.ambiguity_reason,
          plausible_interpretations: result.is_ambiguous ? plausibleInterpretations : null,
          preparse_latency_ms: preparseLatency,
          phase1_latency_ms: phase1Latency,
          heuristic_reason: heuristicDecision.reason,
          reminder_intent: preparseResult.result.reminder_intent || false,
          latency_ms: totalLatency
        });
      }
      if (type === "detect-multi") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        const t0 = Date.now();
        const gatePrompt = `You are determining whether a text drop contains ONE trackable item or MULTIPLE independently trackable items.

Default to SINGLE. Only return "multiple" when items are genuinely independent.

SINGLE means the items share a causal, explanatory, contextual, or goal relationship. One item explains, motivates, responds to, or is a sub-step of the other. They belong together as one tracked thing.

Specific single-item patterns:
- A task accompanied by its reason, cause, or context
- An emotion paired with a coping response or reaction to that emotion
- Alternatives or options for the same underlying need
- A list of related items that form one errand, purchase, or activity
- Multiple emotions or feelings expressed together
- A habit or goal with planning details, schedule notes, or elaboration
- Sub-steps or prerequisites that serve a single outcome
- A reflection followed by further elaboration on the same thought

MULTIPLE means the items have no causal or contextual dependency. They happen to be mentioned together but would be tracked, completed, or resolved independently in different contexts at different times.

Specific multi-item patterns:
- Unrelated tasks with no shared cause or goal
- An emotion plus a task that has nothing to do with that emotion
- A one-time completable action alongside an ongoing recurring commitment
- Actions spanning completely different life domains with no bridging relationship

THE CORE TEST: Does one item explain, cause, depend on, or serve the same goal as the other? If yes \u2192 SINGLE. If they are merely co-located in the same message \u2192 MULTIPLE.

Return JSON only:
{
  "result": "single" | "multiple",
  "reasoning": "one sentence why"
}

If "multiple", also include segments:
{
  "result": "multiple",
  "reasoning": "one sentence why",
  "segments": [
    {"text": "exact user words for item 1", "context_from_rest": "brief note about what the other segments said"},
    {"text": "exact user words for item 2", "context_from_rest": "brief note about what the other segments said"}
  ]
}

Segment rules:
- Use the user's EXACT words \u2014 do not rephrase, add, or embellish
- Each segment must be understandable on its own \u2014 if a pronoun would dangle without its referent, include enough of the original wording to resolve it
- context_from_rest summarizes what the OTHER segments contain, so downstream processing has awareness of the full drop`;
        const gateResult = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: gatePrompt,
          messages: [{ role: "user", content: text.substring(0, 1e3) }],
          temperature: 0.1,
          maxOutputTokens: 400,
          endpoint: "detect-multi-gate"
        });
        const gate = gateResult.parsed || { result: "single", segments: [] };
        console.log("[Phase0:Gate]", {
          result: gate.result,
          reasoning: gate.reasoning,
          segment_count: gate.segments?.length || 0
        });
        if (gate.result !== "multiple") {
          const latency2 = Date.now() - t0;
          console.log("[Phase0] SINGLE", { reason: gate.reasoning, latency_ms: latency2 });
          return j({
            is_multi: false,
            source: "api",
            reason: gate.reasoning || "single",
            latency_ms: latency2
          });
        }
        const segments = Array.isArray(gate.segments) ? gate.segments : [];
        const validatedSegments = segments.map((seg) => ({
          text: String(seg.text || "").trim(),
          context_from_rest: String(seg.context_from_rest || "").trim(),
          likely_bucket: ["todo", "habit", "log"].includes(seg.likely_bucket) ? seg.likely_bucket : "todo"
        })).filter((seg) => seg.text.length > 0);
        if (validatedSegments.length < 2) {
          const latency2 = Date.now() - t0;
          console.log("[Phase0] Extraction gave <2 segments, falling back to SINGLE", {
            latency_ms: latency2
          });
          return j({ is_multi: false, source: "extraction-fallback", latency_ms: latency2 });
        }
        let summary = validatedSegments.map((s) => s.text.substring(0, 30)).slice(0, 3).join(" + ");
        if (summary.length > 60) summary = summary.substring(0, 57) + "...";
        const bucketCounts = { todo: 0, habit: 0, log: 0 };
        validatedSegments.forEach((s) => bucketCounts[s.likely_bucket]++);
        const dominantBucket = Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])[0][0];
        const latency = Date.now() - t0;
        console.log("[Phase0:Multi]", {
          reason: gate.reasoning,
          item_count: validatedSegments.length,
          summary,
          dominant_bucket: dominantBucket,
          latency_ms: latency
        });
        return j({
          is_multi: true,
          confidence: 0.85,
          item_count: validatedSegments.length,
          segments: validatedSegments,
          summary,
          dominant_bucket: dominantBucket,
          dominant_subtype: dominantBucket === "log" ? "general" : null,
          source: "api",
          reason: gate.reasoning,
          latency_ms: latency
        });
      }
      if (type === "clarify-ambiguity") {
        let getLabelRules2 = function(aType) {
          switch (aType) {
            case "bucket":
              return `The question already references what the user dropped \u2014 the labels must not repeat it. Write labels as if the noun was never mentioned. Generic is correct here. The user reads the question first, then the labels \u2014 the labels only need to describe the mode of intent, not the subject. For the todo option: something short that conveys there is an action to take. For the idea option: something short that conveys the user is considering something. For the general option: something short that conveys the user wants to remember something. Do not include the noun from the user's input in any label under any circumstances.`;
            case "date_type":
              return `Labels must directly reflect the booking/scheduling status. First option conveys it is already arranged and in the calendar. Second option conveys the user still needs to book or sort it, and references the specific thing. Third option conveys they just want to hold the date mentally.`;
            case "vague_aspiration":
              return `First option should convey making this into a real ongoing goal without projecting what the habit looks like. Second option conveys holding the intention loosely with no commitment.`;
            case "habit_or_todo":
              return `First option conveys doing this as a one-time thing and completing it. Second option conveys doing this on an ongoing regular basis and making it part of their routine. Both should reference the specific activity from the input.`;
            case "action_or_memory":
              return `First option conveys that yes, the user needs to take action on this \u2014 something needs to happen. Second option conveys they simply did not want to forget this fact or date.`;
            case "commitment_level":
              return `First option conveys wanting to hold themselves accountable and track this properly. Second option conveys noting the intention without formal commitment. Reference the specific activity.`;
            case "emotional_or_action":
              return `First option conveys wanting to do something about this situation. Second option conveys having needed to express or process this feeling. Tone must be warm \u2014 never clinical.`;
            case "social_plan":
              return `First option conveys it is already arranged. Second option conveys the user needs to make it happen \u2014 generic, no assumption about specifics. Third option conveys they just want to remember it happened or will happen. Reference the person or occasion if named.`;
            case "scope":
              return `First option conveys this is one discrete thing to complete. Second option conveys this is a bigger multi-part effort. Third option conveys it is an early-stage idea not yet committed to. Reference the specific thing from the input.`;
            case "idea_or_commitment":
              return `First option conveys fully committing to do this as a one-time action. Second option conveys committing to this as an ongoing practice. Third option conveys still thinking it through. Fourth option conveys it was a passing thought with no real intent. Reference the specific activity.`;
            default:
              return `Labels should describe what the user might have meant in casual, natural language. Reference the specific content from the input.`;
          }
        };
        var getLabelRules = getLabelRules2;
        __name(getLabelRules2, "getLabelRules");
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        const ambiguityType = body.ambiguityType || "bucket";
        const ambiguityReason = body.ambiguityReason || "";
        const t0 = Date.now();
        const TYPE_CONFIGS = {
          bucket: {
            question: null,
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              { id: "opt_2", label: "", bucket: "log", subtype: "idea", habitSubtype: null },
              { id: "opt_3", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          },
          date_type: {
            question: "Is this already in the diary?",
            options: [
              {
                id: "opt_1",
                label: "",
                bucket: "log",
                subtype: "event",
                habitSubtype: null,
                dateField: "target_date"
              },
              {
                id: "opt_2",
                label: "",
                bucket: "todo",
                subtype: null,
                habitSubtype: null,
                dateField: "target_date"
              },
              { id: "opt_3", label: "", bucket: "log", subtype: "event", habitSubtype: null }
            ]
          },
          vague_aspiration: {
            question: "What did you want to do with this?",
            options: [
              {
                id: "opt_1",
                label: "",
                bucket: "habit",
                subtype: null,
                habitSubtype: "start_habit"
              },
              { id: "opt_2", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          },
          habit_or_todo: {
            question: "Is this a one-time thing or something you want to keep doing?",
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              {
                id: "opt_2",
                label: "",
                bucket: "habit",
                subtype: null,
                habitSubtype: "start_habit"
              }
            ]
          },
          action_or_memory: {
            question: "Do you need to do something for this?",
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              { id: "opt_2", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          },
          commitment_level: {
            question: "Do you want to actually track this?",
            options: [
              {
                id: "opt_1",
                label: "",
                bucket: "habit",
                subtype: null,
                habitSubtype: "start_habit"
              },
              { id: "opt_2", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          },
          emotional_or_action: {
            question: "Did you want to do something with this?",
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              { id: "opt_2", label: "", bucket: "log", subtype: "journal", habitSubtype: null }
            ]
          },
          social_plan: {
            question: "Is this happening or do you need to make it happen?",
            options: [
              { id: "opt_1", label: "", bucket: "log", subtype: "event", habitSubtype: null },
              { id: "opt_2", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              { id: "opt_3", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          },
          scope: {
            question: "How big is this?",
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              { id: "opt_2", label: "", bucket: "log", subtype: "idea", habitSubtype: null },
              { id: "opt_3", label: "", bucket: "log", subtype: "idea", habitSubtype: null }
            ]
          },
          idea_or_commitment: {
            question: "How real is this for you?",
            options: [
              { id: "opt_1", label: "", bucket: "todo", subtype: null, habitSubtype: null },
              {
                id: "opt_2",
                label: "",
                bucket: "habit",
                subtype: null,
                habitSubtype: "start_habit"
              },
              { id: "opt_3", label: "", bucket: "log", subtype: "idea", habitSubtype: null },
              { id: "opt_4", label: "", bucket: "log", subtype: "general", habitSubtype: null }
            ]
          }
        };
        const FALLBACK_CONFIG = {
          question: "Quick check \u2014 what did you have in mind?",
          options: [
            {
              id: "opt_1",
              label: "Something to do",
              bucket: "todo",
              subtype: null,
              habitSubtype: null
            },
            {
              id: "opt_2",
              label: "An idea to explore",
              bucket: "log",
              subtype: "idea",
              habitSubtype: null
            },
            {
              id: "opt_3",
              label: "Just a note",
              bucket: "log",
              subtype: "general",
              habitSubtype: null
            }
          ]
        };
        const FALLBACK_LABELS = {
          bucket: ["Need to do something", "Thinking about it", "Just remembering"],
          date_type: ["Yes, it's in the diary", "No, need to sort it", "Just the date"],
          vague_aspiration: ["Make it a real goal", "Just holding the thought"],
          habit_or_todo: ["Do it once", "Make it regular"],
          action_or_memory: ["Need to act on this", "Just didn't want to forget"],
          commitment_level: ["Hold me to it", "Just noting it"],
          emotional_or_action: ["Want to tackle it", "Needed to say it"],
          social_plan: ["It's already sorted", "Need to make it happen", "Just noting it"],
          scope: ["One thing to finish", "Bigger than that", "Just an idea"],
          idea_or_commitment: [
            "Doing it \u2014 one-off",
            "Doing it \u2014 ongoing",
            "Still thinking",
            "Just a thought"
          ]
        };
        const config = TYPE_CONFIGS[ambiguityType] || FALLBACK_CONFIG;
        const optionCount = config.options.length;
        const questionInstruction = ambiguityType === "bucket" ? `
QUESTION RULES (return a "question" field in your JSON):
- Under 8 words
- Must reference the specific content of the user's input \u2014 use the actual noun, name, or subject they wrote
- Neutral \u2014 does not assume any interpretation
- Natural spoken language
- Never use: track, log, note, habit, task, todo, capture, save, manage
` : "";
        const jsonShape = ambiguityType === "bucket" ? `{
  "question": "...",
  "labels": ["label for opt_1", "label for opt_2", ...]
}` : `{
  "labels": ["label for opt_1", "label for opt_2", ...]
}`;
        const clarifySystemPrompt = `You are generating labels for a clarification popup in a productivity app. The user dropped an ambiguous input and we need to show them options.

GENERAL LABEL RULES \u2014 apply to all types:
- 4 words max, 35 characters max
- Casual, natural fragments \u2014 no formal language, no periods
- Never use app terminology: do not say todo, habit, log, note, track, capture, save, manage, record, add to, create
- Labels must feel like something a person would say, not a UI category name
- Do not invent specific details that are not in the user's input

TYPE-SPECIFIC RULES:
${getLabelRules2(ambiguityType)}
${questionInstruction}
Return JSON only:
${jsonShape}
Labels array must have exactly ${optionCount} items.`;
        const clarifyUserMessage = `INPUT: "${text.substring(0, 500)}"
TYPE: ${ambiguityType}${ambiguityReason ? `
CONTEXT: ${ambiguityReason}` : ""}`;
        let aiSuccess = false;
        let finalOptions = config.options;
        let finalQuestion = config.question || "What's going on here?";
        try {
          const result = await aiClassify({
            mode: "realtime",
            ...getProviders("mini", env),
            env,
            systemPrompt: clarifySystemPrompt,
            messages: [{ role: "user", content: clarifyUserMessage }],
            temperature: 0.3,
            maxOutputTokens: 150,
            endpoint: "clarify-ambiguity"
          });
          if (result.parsed) {
            const parsed = result.parsed;
            const labels = Array.isArray(parsed.labels) ? parsed.labels : [];
            if (labels.length === optionCount && labels.every((l) => typeof l === "string" && l.trim())) {
              aiSuccess = true;
              finalOptions = config.options.map((opt, i) => ({
                ...opt,
                label: labels[i].trim().substring(0, 60)
              }));
              if (ambiguityType === "bucket" && typeof parsed.question === "string" && parsed.question.trim()) {
                finalQuestion = parsed.question.trim().substring(0, 100);
              }
            }
          }
        } catch (err) {
          console.warn("[Phase1.5] AI call failed", { error: String(err) });
        }
        if (!aiSuccess) {
          const fallbackLabels = FALLBACK_LABELS[ambiguityType];
          if (fallbackLabels && fallbackLabels.length === optionCount) {
            finalOptions = config.options.map((opt, i) => ({
              ...opt,
              label: fallbackLabels[i]
            }));
          } else {
            finalOptions = FALLBACK_CONFIG.options;
            finalQuestion = FALLBACK_CONFIG.question;
          }
        }
        const latency = Date.now() - t0;
        console.log("[Phase1.5]", {
          ambiguityType,
          options_count: finalOptions.length,
          ai_success: aiSuccess,
          latency_ms: latency
        });
        return j({
          success: true,
          clarification_question: finalQuestion,
          options: finalOptions,
          latency_ms: latency
        });
      }
      if (type === "reclassify-after-clarification") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        const selectedLabel = body.selectedLabel || "";
        const selectedBucket = body.selectedBucket || null;
        const selectedSubtype = body.selectedSubtype || null;
        const currentDate = body.currentDate || new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(/* @__PURE__ */ new Date());
        const targetBucket = body.targetBucket || null;
        const contextString = `=== CONTEXT ===
ORIGINAL INPUT: "${text}"
USER SELECTED: "${selectedLabel}"
SELECTED BUCKET: ${selectedBucket || "not specified"}
SELECTED SUBTYPE: ${selectedSubtype || "not specified"}
CURRENT DATE: ${currentDate}`;
        const reclassifyPrompt = `You finalize a productivity item after the user clarified their intent.

=== BUCKET RULE ===

If SELECTED BUCKET is provided (not "not specified"), use it exactly. Do not override the user's selection.
The bucket in your output MUST match SELECTED BUCKET.
If SELECTED SUBTYPE is provided, use it exactly for the subtype field.

=== YOUR TASK ===

The user dropped their original input and clarified by selecting an option.

Generate:
1. A smart title (3-7 words)
2. A confirmation message (4-10 words)
3. Date fields if applicable

=== TITLE PRINCIPLES ===

Generate a title that captures the SUBJECT/TOPIC \u2014 what it IS, not WHEN or HOW OFTEN.

1. Reflect user's actual words \u2014 don't invent actions or details not provided
2. Strip temporal info \u2014 dates, times, time-of-day (morning, evening), days of week (these go in metadata)
3. Strip frequency info \u2014 "daily", "3x/week", "every morning" (tracked separately for habits)
4. Strip mood words \u2014 "stressed", "anxious", "excited" (captured as mood metadata for journals)
5. No meta-language \u2014 don't start with "Reflect on", "Journal about", "Remember to", "Track"
6. Preserve question framing for ideas/journals \u2014 the question IS the content
7. Title case, 3-7 words

=== CONFIRMATION MESSAGE (4-10 words) ===

PERSONA: You're their upbeat, playful friend. You're genuinely happy they shared this and you react with warmth and a little humor. You don't do earnest speeches or therapize, but you're never dismissive either. You react like a friend who thinks what they're doing is cool \u2014 quick, fun, maybe a little cheeky.

PROCESS \u2014 follow these two steps every time:
1. Find ONE specific detail from their input: a person's name, the actual activity, a place, the subject matter. Lock onto it.
2. Pick an angle on that detail: a light observation, a playful consequence, a quick aside, or a question that shows you caught it. The angle should feel like it took you half a second to think of, not half an hour.

TONE BY BUCKET:
- TODOS: Playful. React to the real-world thing, not "the task."
- HABITS: Playful belief. Root for the specific behavior, not the abstract concept of self-improvement.
- JOURNALS: Shorthand empathy. Like a friend who gets it without turning it into A Moment.
- IDEAS: Genuine curiosity about the specific idea.
- GENERAL LOGS: React to the interesting detail. Name the specific thing.

VOICE:
- Texting a friend, not writing a greeting card
- Short. Offhand. Like you dashed it off
- No exclamation marks
- Cheeky when there's an opening, warm when there isn't

HARD BANS \u2014 never do these:
- The "That [noun phrase] really [verb/adjective]" structure (e.g., "That kind of effort really shows"). This is therapist-speak.
- "[Gerund] [abstract noun] with [abstract noun]" (e.g., "Building strength with consistent effort"). This is a motivational poster.
- Restating or paraphrasing the title. If your reaction just says what the title already says in different words, you failed.
- Therapy words: "valid", "stands out", "is familiar", "is important", "takes courage"
- Task-management language: "noted", "captured", "queued", "tracked", "on your list", "on your radar", "scheduled", "logged", "taking care of", "got it"
- Ending with ", huh?" or ", right?" \u2014 it's a crutch, not wit.

THE TEST: Read your reaction back. Does it sound like something a real person would actually text? If it sounds like a notification, a therapist, or a poster on a dentist's wall \u2014 rewrite it.

=== DATE HANDLING ===

Only set dates that appear in the ORIGINAL INPUT. Never invent dates.

If the original input contains a date:
- target_date: When something IS or HAPPENS (event date, deadline, birthday)
- scheduled_date: When the user will DO the action
- date_type_ambiguous: true if you cannot determine which from the clarification

If no date in input, all date fields are null.

=== OUTPUT FORMAT (JSON) ===

{
  "bucket": "todo" | "habit" | "log",
  "subtype": "journal" | "idea" | "general" | "event" | null,
  "smart_title": "Title From Their Words",
  "confirmation_message": "4-8 words max 50 chars",
  "target_date": "YYYY-MM-DD" | null,
  "scheduled_date": "YYYY-MM-DD" | null,
  "date_type_ambiguous": boolean
}`;
        const t0 = Date.now();
        const result = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: reclassifyPrompt,
          messages: [{ role: "user", content: contextString }],
          temperature: 0.3,
          maxOutputTokens: 250,
          endpoint: "reclassify-after-clarification"
        });
        const latency = Date.now() - t0;
        if (!result.parsed) {
          console.log("[Reclassify] Both providers failed", { latency_ms: latency });
          return j({
            bucket: "log",
            subtype: "general",
            habit_subtype: null,
            smart_title: titleCase2(text.substring(0, 50)),
            confirmation_message: "Saved for later.",
            target_date: null,
            scheduled_date: null,
            latency_ms: latency
          });
        }
        const parsed = result.parsed;
        const validBuckets = ["todo", "habit", "log"];
        let bucket = selectedBucket && validBuckets.includes(selectedBucket) ? selectedBucket : validBuckets.includes(parsed.bucket) ? parsed.bucket : "log";
        let subtype = null;
        if (bucket === "log") {
          const validSubtypes = ["general", "idea", "journal", "event"];
          subtype = selectedSubtype && validSubtypes.includes(selectedSubtype) ? selectedSubtype : validSubtypes.includes(parsed.subtype) ? parsed.subtype : "general";
        }
        let habitSubtype = null;
        if (bucket === "habit") {
          const validHabitSubtypes = ["start_habit", "break_habit"];
          habitSubtype = validHabitSubtypes.includes(parsed.habit_subtype) ? parsed.habit_subtype : "start_habit";
        }
        let targetDate = null;
        let scheduledDate = null;
        if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
          targetDate = parsed.target_date;
        }
        if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
          scheduledDate = parsed.scheduled_date;
        }
        const dateTypeAmbiguous = parsed.date_type_ambiguous === true;
        let confirmationMessage = parsed.confirmation_message || null;
        if (confirmationMessage) {
          confirmationMessage = String(confirmationMessage).trim();
          if (confirmationMessage.length < 3) {
            confirmationMessage = null;
          } else if (confirmationMessage.length > 50) {
            confirmationMessage = confirmationMessage.substring(0, 47) + "...";
          }
        }
        console.log("[Reclassify] Success", {
          bucket,
          subtype,
          habit_subtype: habitSubtype,
          title: parsed.smart_title?.substring(0, 30),
          confirmation_message: confirmationMessage,
          target_date: targetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency
        });
        return j({
          bucket,
          subtype,
          habit_subtype: habitSubtype,
          smart_title: titleCase2(parsed.smart_title || text.substring(0, 50)),
          confirmation_message: confirmationMessage,
          target_date: targetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          latency_ms: latency
        });
      }
      if (type === "classify-phase1") {
        const rl = await checkIpRateLimit(request, env, "classify", 60);
        if (!rl.allowed) return rateLimitResponse("classify", rl.count, rl.limit);
        const text = body.text || "";
        const hasAttachments = body.hasAttachments || false;
        const heuristicHint = body.heuristicHint || null;
        const currentDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        const dayOfWeek = new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        const phase1Prompt = `You classify "mind drops" for Gremly, a productivity app. Your job is to understand the user's TRUE INTENT through semantic reasoning, not pattern matching.

Today is ${currentDate} (${dayOfWeek}).

=== THE FOUR BUCKETS ===

**TODO** \u2014 A discrete, completable action
The user will eventually "check this off." A clear DONE state exists.
Ask: "Can this be marked DONE when complete?"

**HABIT** \u2014 A trackable, recurring behavior
The user wants to TRACK this over time. It's concrete and observable.
Ask: "Can this be tracked with a yes/no each day/week?"

**LOG** \u2014 Capture for reflection, not action
A thought, feeling, idea, or fuzzy aspiration. No clear done state or tracking intent.
Ask: "Is this reflection, exploration, venting, or too vague to act on?"

**AMBIGUOUS** \u2014 Intent is unclear, need to ask the user
You cannot confidently determine which bucket this belongs in.
Ask: "Do I have EVIDENCE for TODO, HABIT, or LOG? Or am I guessing?"
Choose AMBIGUOUS when none of the other three buckets reaches 70% confidence.

=== CRITICAL SEMANTIC QUESTIONS ===

Before classifying, reason through these questions. They resolve the hardest cases.

**Q1: WHERE DOES UNCERTAINTY LIVE?**

When hedging, conditionals, or tentative language appears, ask: Is uncertainty about THE WORLD or about THE USER'S OWN INTENT?

WORLD uncertainty (timing, availability, external factors): The user has committed to the action but faces external unknowns. The intent is clear; circumstances are not. This is still a TODO. The condition is context, not wavering.

SELF uncertainty (whether to do it, weighing options, questioning desire): The user hasn't decided. They're exploring or processing. This is IDEA (exploring possibility) or JOURNAL (processing feelings about it).

The test: If the external condition resolved favorably, would the user definitely act? YES \u2192 TODO. UNSURE \u2192 not a TODO.

**Q2: WHAT IS THE DOMINANT FRAME?**

Individual words exist inside an overall frame. The frame determines classification, not the words inside it.

DIRECTING frame: User is telling themselves to do something. Even soft language inside a directing frame is a TODO.

EXPLORING frame: User is considering possibilities. Even action verbs inside an exploring frame is an IDEA.

PROCESSING frame: User is working through feelings or patterns. Even future-oriented words inside a processing frame is JOURNAL.

The test: What is the user DOING with this thought right now? Capturing an action? Floating a possibility? Working through feelings?

**Q3: IS THIS EXPRESSION COMPLETE?**

Short inputs are not necessarily incomplete \u2014 they may be fully expressed.

Single emotional words are complete JOURNAL entries. The value is the expression itself. Do not mark ambiguous due to brevity.

Bare nouns without any verb or context genuinely lack signal. These ARE ambiguous \u2014 you cannot determine if it is something to DO, TRACK, or REMEMBER.

The test: Is brevity the problem, or is intent actually missing? Emotional expression with no action is a complete journal. Noun with no framing is genuinely ambiguous.

=== CRITICAL GATES (CHECK FIRST \u2014 Before classification) ===

Apply these gates IN ORDER before any other classification. If a gate matches, use its result and STOP.

**GATE A: NECESSITY FRAMING \u2192 TODO**
Is the user framing this as something that NEEDS to happen?

Apply this test: Does the input express necessity, obligation, or requirement \u2014 the sense that this action is not optional? If the user is telling themselves "this must be done" in any phrasing, they have committed to act.

If YES \u2192 return TODO immediately. Necessity framing IS commitment. Do not check for ambiguity.

**GATE B: DIRECTION WITHOUT SCHEDULE \u2192 AMBIGUOUS**
Is the user expressing a desire to move in a direction \u2014 having more or less of something \u2014 without specifying when or how often?

Apply this test: Could you put this on a daily tracker and answer "did I do this?" with a clear yes or no? If there's no defined frequency or threshold, the answer is no.

If YES \u2192 return AMBIGUOUS immediately. Direction without schedule is not trackable.

**GATE C: IMPERATIVE STRUCTURE \u2192 TODO**
Does this input begin with an action the user is directing themselves to perform?

Apply this test: Read the first clause. Is the user telling themselves to DO something? Is there a verb at or near the start that represents an action they will take? If the input is structured as a self-command \u2014 the user directing their own future action \u2014 that's a commitment to act.

If YES \u2192 return TODO immediately. Imperative structure IS commitment. Any uncertainty later in the input about options, details, timing, or method does not change the commitment \u2014 it just means the specifics are fuzzy.

=== SEMANTIC CLASSIFICATION (after gates) ===

Your task is to REASON about intent, not to match patterns or keywords. Apply these semantic tests to ANY input.

**TODO SEMANTIC TEST:**

**FRAME FIRST \u2014 IMPERATIVE LOCKS TO TODO:** Before evaluating completion points, identify the input's structure. An imperative (verb + object, no subject) is a DIRECTING frame \u2014 the user is commanding themselves to act.

When identifying imperatives, apply grammatical parsing: if the input starts with a word that functions as a verb given what follows it, that's an imperative. Words can be both nouns and verbs \u2014 determine which based on the structure that follows.

**CRITICAL:** Once an imperative frame is identified, classification is TODO. Full stop. Do not re-evaluate based on the object. Do not second-guess completion point clarity. Do not mark ambiguous because the object is unfamiliar or abstract. The frame is the evidence. The verb carries the intent. The user knows what they meant and will know when they're done.

Imperatives have an implicit completion point: a session of that action. User-determined completion is valid \u2014 the user decides when their session is complete.

**CARVE-OUTS \u2014 These override the frame lock:**
- Explicit frequency or stop/quit language present \u2192 evaluate for HABIT first, not TODO
- State-of-being verbs that describe desired states rather than discrete actions \u2192 LOG
- Ongoing mental states with no natural completion point \u2192 LOG/idea (ask: is there a point where the user would say "I'm done with this"? If the mental activity could continue indefinitely with no endpoint, it's LOG. If there's a moment of completion \u2014 enough information gathered, decision made, answer found \u2014 it's a completable TODO)
- Hedging that applies to the CORE ACTION (see test below) \u2192 do not auto-lock, evaluate normally

**BEFORE triggering the hedging carve-out, you MUST apply this test:**

Read the ENTIRE input as a complete thought. Identify the CORE ACTION \u2014 the main verb and what it acts upon. Then ask: does the hedging make the user uncertain about performing this core action, or does it only qualify secondary elements?

Only trigger the hedging carve-out when uncertainty attaches to WHETHER the user will act. If the user IS acting and uncertainty only touches details like options, timing, method, or location \u2014 the imperative frame lock holds and classification is TODO.

If none of these carve-outs apply, the imperative locks to TODO.

In a DIRECTING frame, evaluate completion within that frame, not in the abstract.

A TODO has ALL of these properties:
1. **Discrete action** \u2014 Something that happens once then is finished. Not an ongoing behavior, not a state of being, not a continuous process. There is a clear beginning and end.

2. **Clear completion point** \u2014 There exists a specific moment where this transitions from "not done" to "done." You could identify that moment. The user would know when they've finished.

3. **Checkable** \u2014 The user would feel satisfied marking this complete. It represents a unit of work or action that, once performed, is behind them.

**The completion test:** Imagine the user coming back and saying "I did it." Does "it" refer to something concrete and finished? If yes \u2192 TODO.

**Cognitive work is still a TODO:** Mental tasks like deciding, figuring out, researching, or working through a problem ARE todos if they have a completion point. "Figure out why X is broken" is done when you understand the cause. "Decide on a venue" is done when the decision is made. "Research options for Y" is done when you've gathered enough information. These have clear done states even though the work is mental.

**Investigative actions are TODOs when they have an endpoint:** If the user is setting out to learn, discover, or understand something \u2014 and there's a point where they'd have enough information \u2014 that's a completable action, not open-ended exploration. The test: could they come back and say "I looked into it" or "I checked it out" as a completed action? If yes, it's a TODO. This is different from ongoing mental states like "thinking about" or "considering" which have no natural completion point \u2014 those are exploration (LOG/idea), not action.

**Conditional or qualified actions are still TODOs:** When a user describes an action with conditions, qualifiers, or uncertainty about outcome \u2014 but the action itself is clear \u2014 the item is still a TODO. The condition doesn't change the nature of the action; it adds context to it. The user intends to perform the action; whether the outcome is guaranteed is separate from whether the action is completable.

**What disqualifies a TODO:**
- No identifiable completion point (does not apply to clean imperatives \u2014 session completion is valid)
- Ongoing state rather than discrete action
- Too vague to know what "done" means (does not apply to clean imperatives \u2014 user-determined completion is valid)

---

**HABIT SEMANTIC TEST:**

A HABIT has ALL of these properties:
1. **Concrete, observable behavior** \u2014 Something a camera could theoretically record. A physical action or measurable behavior, not a mental state, attitude, or abstract quality. You could observe someone doing or not doing it.

2. **Binary trackability** \u2014 At the end of each day or week, the user can definitively answer "did I do this? yes or no" with certainty. There's no ambiguity about whether it happened.

3. **Explicit repetition intent** \u2014 The user has signaled they want this to recur. This signal must be EXPLICIT in their input, not inferred:
   - Stated frequency: words like "daily," "every morning," "weekly," "3x per week," "twice a day"
   - Specific named days: when the user specifies particular days of the week, they are declaring a recurring schedule, which signals habit intent \u2014 this is equivalent to stating a frequency
   - OR stop/quit language: "stop [behavior]," "quit [behavior]," "no [behavior] after [time]," "avoid [behavior]"

**The tracking test:** Could this appear on a habit tracker with a yes/no checkbox for each day? Would checking it off daily make sense?

**CRITICAL \u2014 Explicit signals required:**
Without explicit frequency or stop/quit language in the input, the item is NOT a habit, regardless of whether the activity could theoretically be repeated. A repeatable activity without explicit repetition intent is either a single TODO or a vague aspiration \u2014 and vague aspirations should be AMBIGUOUS so the user can clarify.

**Comparative words are NOT frequencies:**
Words expressing direction without schedule \u2014 wanting more or less of something \u2014 have no trackable cadence. You cannot answer "did I do this today?" with certainty. Without explicit frequency, these are vague aspirations and should be AMBIGUOUS, not HABIT.

**What disqualifies a HABIT:**
- No explicit frequency or stop/quit language (even if the activity is repeatable)
- Comparative words only without explicit frequency \u2192 AMBIGUOUS
- Mental states that can't be observed
- Abstract qualities rather than behaviors
- Vague aspirations without commitment
- Hedging + potential frequency \u2192 AMBIGUOUS (user hasn't committed)

---

**LOG SEMANTIC TEST:**

A LOG captures content that doesn't fit TODO or HABIT. It serves reflection, reference, or exploration.

LOG has three subtypes that are checked SEQUENTIALLY, not as parallel options. First check for journal, then idea, then general. This ordering matters because journal and idea have specific signals, while general is the narrowest category reserved for purely factual content.

**LOG/journal** \u2014 Emotional expression or internal processing (check FIRST):

The user is expressing feelings, reflecting on experiences, venting, processing emotions, or engaging in self-talk. The content is about their internal state or making sense of something that happened. There's no action to take \u2014 the value is in the expression itself.

The temporal orientation is INWARD and BACKWARD \u2014 processing what IS (current feelings, present state) or what WAS (past events, things that happened). The user is making sense of their experience, looking inward at their emotional state or backward at something they experienced. They are not planning future action \u2014 they are processing.

Signals: emotional language, reflection on past events, gratitude expressions, statements about feelings or internal state, sense-making about experiences.

Rhetorical self-directed questions are a strong journal indicator. These are questions the user asks themselves about their own patterns, behaviors, or tendencies \u2014 they're processing and reflecting, not seeking external answers or planning action. The question must be BOTH self-directed (about the user themselves) AND reflective in nature (making sense of something, not planning to change it). Rhetorical questions about external topics or factual inquiries are NOT journal signals \u2014 only self-reflective processing questions qualify.

Questions that examine the user's own desire or commitment are processing, not planning. The test: Is the user questioning WHETHER they want something, or questioning HOW to do something they want? Questioning desire is processing \u2014 the user is working through their relationship with the choice itself. Questioning logistics is planning.

Self-directed emotional questions are journal even when they use future-oriented framing. When emotional weight and self-direction are the dominant signals \u2014 when the user is processing how they FEEL about something rather than exploring what to DO about it \u2014 those emotional signals override any exploration framing. The user is working through feelings, not weighing possibilities.

Pure emotional expressions \u2014 single words or short phrases that are clearly expressing a feeling with no actionable or informational content \u2014 are journal. The user is venting or expressing, not requesting action. The value is in the expression itself.

Overall framing determines classification, not individual words. When the overall structure of an input is self-reflective \u2014 the user is processing their relationship with an idea, questioning their own patterns, or examining their motivations \u2014 that reflective framing determines the classification, even if individual words within the input sound action-adjacent. The test is: what is the user DOING with this input? If they're PROCESSING (making sense of feelings, questioning themselves, examining patterns), it's journal \u2014 regardless of whether action-related words appear inside the reflection.

**LOG/idea** \u2014 A spark to capture (check SECOND):

An idea is a seed. The user had a thought they don't want to lose \u2014 something that might become something later. There is no committed action, no anchor. The whole thought is floating. The user is in pure capture mode.

**The key distinction from TODO:**
TODO owns all committed action, even with fuzzy details. If there's ANY action verb the user intends to perform, that's a todo with uncertain specifics \u2014 not an idea.

Idea has NO action anchor. The entire thought is pre-commitment. The user is capturing a spark, not directing themselves to act. They might build on it later, or let it sit. The value is simply: don't lose this thought.

**CRITICAL CHECK:** Does this input contain a committed action verb \u2014 something the user intends to DO? If yes, this is NOT idea. Route to TODO. An action verb with hedging on the details is still a committed action.

Idea only applies when:
- The whole thought is floating with no action anchor
- The user is capturing a spark, not a task
- There is no verb indicating something they WILL do

**IDEA vs GENERAL:**
Both are notes without action. The difference:
- Idea is a spark \u2014 something that could become something, a seed for later
- General is factual reference \u2014 information about what IS or WAS

**IDEA vs AMBIGUOUS:**
- Idea has clear "spark" framing \u2014 the user knows they're capturing a thought to explore later
- Ambiguous has no signal at all \u2014 we cannot determine what the user wants

**LOG/general** \u2014 Factual reference only (check LAST, narrowest category):

The user is stating something that IS \u2014 recording factual information, reference data, completed events, or contact details. This requires existence verbs or past tense completion. The content is purely informational \u2014 there's no action implied because it's about what IS or WAS, not what to DO.

General requires ACTIVE FRAMING as factual reference \u2014 the user must be stating something about the world, not just naming a concept. Noun phrases that name services, processes, or things that could plausibly require action are NOT general notes. Without a verb or explicit reference framing, we don't know if the user needs to DO something or is noting information. The presence of a noun alone, even a noun that sounds like reference info, is not enough. The user must be framing it as information, not just naming it. If a noun phrase could plausibly be something to act on, that uncertainty means it's ambiguous.

Statements about schedules, closures, or status changes ARE factual reference when they use existence language. When someone states that something IS closed, IS moved, IS happening on a date, or IS changed \u2014 and they're reporting this as information rather than requesting action \u2014 that's factual reference. The key test: Is the user REPORTING a fact about the world, or are they REQUESTING something be done? Reporting facts with existence verbs = general. Requesting action or implying a task = TODO or ambiguous.

CRITICAL: General is NOT a catchall for uncertain items. It is the narrowest LOG subtype, reserved for content that is clearly and unambiguously factual reference. General is for content that is CLEARLY positioned as "here is a fact" \u2014 not content that merely COULD be a fact. If you are unsure whether something is actionable vs just informational, that uncertainty means it's AMBIGUOUS, not general.

Signals: existence verbs stating facts, past tense describing completed events, contact information, dates of existing events, schedule or status statements using "is" language, purely informational statements.

**LOG subtype decision summary:**

1. Is there emotional or reflective content about present feelings or past experiences? \u2192 **journal**
2. Is this a spark to capture \u2014 a floating thought with no action anchor? \u2192 **idea**
3. Is there factual reference info, clearly stating what IS or WAS (not what to DO)? \u2192 **general**
4. Unsure if this is something to DO vs just something to KNOW? \u2192 **ambiguous** (not general)

**REMEMBER:** If there is ANY committed action verb, it's a TODO \u2014 not idea. TODO owns all action, even with fuzzy details.

---

**CRITICAL \u2014 What is NOT ambiguity:**

Uncertain details within a committed action is NOT ambiguity. If the user has committed to an action (via imperative or obligation language) but is uncertain about specifics like which option, what time, what method, or what location \u2014 that is a TODO with fuzzy details, not ambiguity.

The test: Is the user uncertain about WHETHER to act, or uncertain about WHAT/WHEN/HOW within a committed action? Only the former is ambiguity. The latter is a clear TODO.

Do NOT flag as ambiguous just because options are being weighed. Weighing options about HOW to complete an action is part of doing the action \u2014 the commitment to act is still clear.

---

**AMBIGUOUS \u2014 When to flag:**

Flag as AMBIGUOUS when you cannot confidently determine the bucket because evidence is missing.

**The evidence test:** Before classifying, ask "What SPECIFIC WORDS in this input tell me the user's intent?" If you cannot point to concrete evidence, you are guessing.

**Types of ambiguity:**

1. **Bucket ambiguity** \u2014 You don't know if this is something to DO, TRACK, or KNOW
   - Bare nouns with no verb or intent signal
   - Fragments that could plausibly be multiple bucket types
   - Input where you'd need to ask "what do you want to do with this?"

2. **Action ambiguity** \u2014 Input has a noun + time reference but no verb
   - Could be an existing appointment OR a need to schedule
   - You'd need to ask "do you have this or need to book it?"

3. **Date type ambiguity** \u2014 Bucket is clearly TODO, but date meaning is unclear
   - Action verb + noun + date, but you don't know if the date is when something IS vs when to DO it
   - You'd need to ask "is [date] when the event is, or when you'll do the action?"

**CRITICAL:** Do not dump ambiguous items into LOG/general as a fallback. If you're uncertain, say so. The user can clarify.

=== STRUCTURAL SIGNALS (SUPPORTING EVIDENCE) ===

These linguistic patterns provide EVIDENCE to support your semantic classification. They help you identify intent but do not override semantic reasoning.

**Evidence suggesting TODO:**
- Imperative structure (verb + object, no subject) \u2014 implies a command to self
- Reminder phrasing \u2014 implies future action needed
- Obligation language \u2014 implies task to complete
- Hedging + action verb \u2014 the verb signals intent despite soft commitment

**Evidence suggesting HABIT:**
- Explicit frequency language \u2014 signals repetition intent
- Stop/quit + concrete behavior \u2014 signals behavior to track
- Tracking language \u2014 explicit tracking intent

**Evidence suggesting LOG:**
- Past tense reflection \u2014 processing, not planning
- Emotional language \u2014 internal state expression
- Hedging WITHOUT action verb \u2014 exploration, not commitment
- Existence verbs stating facts \u2014 recording information

**Evidence suggesting AMBIGUOUS:**
- No verb at all \u2014 you can't determine intent
- Noun + time without verb \u2014 could be existing or need-to-schedule
- Vague comparative language without explicit commitment \u2014 aspiration without plan

=== CONFIDENCE RULES ===

Confidence reflects EVIDENCE in the input, not gut feeling.

**0.7 or higher:** You can point to specific words that reveal intent. Classify into TODO, HABIT, or LOG with the appropriate subtype.

**Below 0.7:** You cannot point to clear evidence. Return bucket: "ambiguous". This is correct behavior \u2014 it routes to clarification where the user resolves it with one tap.

Do not guess. Do not return a low-confidence classification hoping it's right. If evidence is insufficient, return ambiguous.

=== AMBIGUITY DETECTION TESTS ===

**EXCEPTION \u2014 Clean imperatives bypass these tests:** If the input is a clean imperative (action verb + object, no subject, no hedging, not a carve-out case), it is already classified as TODO by the FRAME FIRST rule. Do not apply these ambiguity tests to clean imperatives.

Apply these semantic tests to determine if clarification is needed:

**TEST 1: BUCKET CLARITY**
Ask: "Do I KNOW if this is something to DO vs TRACK vs KNOW?"

CLEAR: Input contains evidence (action verb, frequency, emotional content, existence verb)
UNCLEAR: Bare noun, fragment, or content that fits multiple buckets equally \u2192 AMBIGUOUS, type: "bucket"

**TEST 2: ACTION CLARITY** 
(Apply when input has noun + date/time but no clear verb)
Ask: "Do I know if the user HAS something or NEEDS TO DO something?"

CLEAR: Has action verb (needs to do) or existence language (has it)
UNCLEAR: Noun + date with no verb \u2192 AMBIGUOUS, type: "action"

**TEST 3: DATE TYPE CLARITY**
(Apply when bucket is TODO and input contains a date)
Ask: "Do I know if this date is when something IS/HAPPENS or when to DO the action?"

CLEAR: Deadline language or event language or action timing
UNCLEAR: Action + noun + date with no signal about date meaning \u2192 AMBIGUOUS, type: "date_type"

**TEST 4: VERB PRESENCE**
Ask: "Is there ANY verb in this input?"

If no verb exists (bare noun, noun phrase, or fragment):
\u2192 AMBIGUOUS, type: "bucket"

**TEST 5: ASPIRATION VS COMMITMENT**
Ask: "Has the user made a concrete commitment or expressed a vague aspiration?"

Vague aspirations use comparative language without explicit frequency or specific plans. These should be AMBIGUOUS, not HABIT or LOG/general, because the user might want to track them or might just be noting a wish.

**TEST 6: REMINDER LANGUAGE TEST**
(Apply to inputs with obligation/reminder phrasing)
Ask: "Does this have reminder/obligation language paired with an action verb?"

Inputs with obligation or reminder phrasing followed by an action verb signal TODO intent, even without explicit imperative structure. The obligation language IS the commitment signal. This applies even when the input arrives from a multi-entity split.

**THE CORE PRINCIPLE:**
If you cannot point to specific words that determine how to handle this item, you are guessing. Flag it as ambiguous and let the user clarify.

=== HABIT SUBTYPE ===

When classifying as HABIT, determine the subtype:

**start_habit** \u2014 Building or doing something
The user wants to ADD a behavior to their life. They're creating a new positive pattern.

**break_habit** \u2014 Stopping or avoiding something  
The user wants to REMOVE a behavior from their life. They're eliminating a negative pattern.

The distinction is semantic: is the user's intent to DO more of something, or to STOP doing something?

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log" | "ambiguous",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "ambiguity_type": "bucket" | "date_type" | "vague_aspiration" | "habit_or_todo" | "action_or_memory" | "commitment_level" | "emotional_or_action" | "social_plan" | "scope" | "idea_or_commitment" | null,
  "ambiguity_reason": "Short reason why it's ambiguous" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit"
- When bucket is "ambiguous", always set ambiguity_type and ambiguity_reason`;
        const phase1Messages = [
          { role: "system", content: phase1Prompt },
          { role: "user", content: text.substring(0, 1e3) }
        ];
        const t0 = Date.now();
        console.log("[Phase1:Timing] Pre-fetch", { t: Date.now() });
        const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: phase1Messages,
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: "json_object" }
          })
        });
        console.log("[Phase1:Timing] Post-fetch", {
          t: Date.now(),
          status: res2.status,
          ok: res2.ok
        });
        const oj2 = await res2.json();
        console.log("[Phase1:Timing] Post-json", { t: Date.now() });
        const latency = Date.now() - t0;
        if (!res2.ok) {
          console.log("[Phase1] API error", { error: oj2.error });
          const fallbackBucket = heuristicHint?.bucket || "log";
          const fallbackSubtype = heuristicHint?.subtypeHint || (isSenseMakingJournal2(text) ? "journal" : "general");
          const fallbackHabitSubtype = fallbackBucket === "habit" ? heuristicHint?.habitSubtypeHint || "start_habit" : null;
          const norm2 = normalizePhase12(fallbackBucket, fallbackSubtype, text);
          return j({
            is_multi: false,
            bucket: norm2.bucket,
            confidence: 0.5,
            subtype: norm2.subtype,
            habitSubtype: norm2.bucket === "habit" ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: "heuristic-fallback",
            latency_ms: latency
          });
        }
        const rawContent = oj2?.choices?.[0]?.message?.content ?? "{}";
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
          console.log("[Phase1:Timing] Post-parse", { t: Date.now() });
        } catch {
          console.log("[Phase1] Parse error", { raw: rawContent });
          const fallbackBucket = heuristicHint?.bucket || "log";
          const fallbackSubtype = heuristicHint?.subtypeHint || (isSenseMakingJournal2(text) ? "journal" : "general");
          const fallbackHabitSubtype = fallbackBucket === "habit" ? heuristicHint?.habitSubtypeHint || "start_habit" : null;
          const norm2 = normalizePhase12(fallbackBucket, fallbackSubtype, text);
          return j({
            is_multi: false,
            bucket: norm2.bucket,
            confidence: 0.5,
            subtype: norm2.subtype,
            habitSubtype: norm2.bucket === "habit" ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: "parse-fallback",
            latency_ms: latency
          });
        }
        let confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.7;
        confidence = clamp01(confidence);
        const norm = normalizePhase12(parsed.bucket, parsed.subtype, text);
        let habitSubtype = null;
        if (norm.bucket === "habit") {
          const validHabitSubtypes = ["start_habit", "break_habit"];
          if (validHabitSubtypes.includes(parsed.habitSubtype)) {
            habitSubtype = parsed.habitSubtype;
          } else {
            habitSubtype = heuristicHint?.habitSubtypeHint ?? "start_habit";
          }
        }
        const smartTitle = null;
        const confirmationMessage = null;
        const isAmbiguous = norm.bucket === "ambiguous" || confidence < 0.7;
        const ambiguityReason = isAmbiguous && typeof parsed.ambiguity_reason === "string" ? parsed.ambiguity_reason.trim().substring(0, 200) : null;
        const ambiguityType = isAmbiguous && typeof parsed.ambiguity_type === "string" && [
          "bucket",
          "date_type",
          "vague_aspiration",
          "habit_or_todo",
          "action_or_memory",
          "commitment_level",
          "emotional_or_action",
          "social_plan",
          "scope",
          "idea_or_commitment"
        ].includes(parsed.ambiguity_type) ? parsed.ambiguity_type : null;
        const needsClarification = false;
        const clarificationType = null;
        const clarificationQuestion = null;
        const clarificationOptions = null;
        const sameAsBucket = heuristicHint?.bucket === norm.bucket;
        console.log("[Phase1]", {
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle?.substring(0, 30),
          has_message: !!confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason?.substring(0, 50),
          heuristicBucket: heuristicHint?.bucket,
          agreed: sameAsBucket,
          latency_ms: latency
        });
        return j({
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason,
          // Legacy fields for backwards compatibility - Phase 1.5 handles actual clarification
          needs_clarification: needsClarification,
          clarification_type: clarificationType,
          clarification_question: clarificationQuestion,
          clarification_options: clarificationOptions,
          source: sameAsBucket ? "heuristic-confirmed" : "api",
          latency_ms: latency
        });
      }
      if (type === "enrich-phase1-5a") {
        const rl = await checkIpRateLimit(request, env, "enrich", 30);
        if (!rl.allowed) return rateLimitResponse("enrich", rl.count, rl.limit);
        const text = body.text || "";
        const bucket = body.bucket || "log";
        const subtype = body.subtype || null;
        const recentReactions = Array.isArray(body.recentReactions) ? body.recentReactions.filter((r) => typeof r === "string" && r.trim().length > 0).slice(-5) : [];
        const currentDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        const dayOfWeek = new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          timeZone: userTimezone
        }).format(/* @__PURE__ */ new Date());
        const phase15aSystemPrompt = `You generate a title and reaction for a productivity item that has already been classified.

Today is ${currentDate} (${dayOfWeek}).

=== SMART TITLE (2-8 words) ===

Produce a clean, concise version of what the user actually said. The title should read like a thought the user would recognize as their own, not a label a system generated.

Title principles:

1. Preserve the user's phrasing. Start from their actual words and clean them up rather than extracting a subject label. The title should sound like something the user would have written in their own notes, not a category heading a system would generate.

2. Title case. Capitalize the first letter of each significant word. Keep articles, prepositions, and conjunctions lowercase unless they are the first word.

3. Sound natural. If the input is very short or reads like a command, rephrase it into how someone would naturally say it out loud. But NEVER add details, locations, people, reasons, or context the user did not include. You can restructure their words into a more natural phrase. You cannot invent information that was not in the input. If someone gives you two words, you can rephrase those two words more naturally but you cannot add a third concept they never mentioned.

4. Strip temporal information. Dates, times, days of week, and scheduling words belong in metadata, not titles. They go stale.

5. Strip frequency information. For habits, frequency is tracked separately. The title is just the activity.

6. No meta-language. Don't start with "Remember to", "Need to", "Track", "Reflect on". The title is the thing itself.

7. For journals, lead with what happened or what it's about. Not the act of journaling.

8. Preserve question framing. If the input is a question, keep the question words. The question IS the content.

9. No mood words in titles. Emotional descriptors are captured as mood metadata.

=== CARD NOTE (4-8 words) ===

A friend's quick take on what was dropped. This appears as a
subtitle on the card in the user's list.

Rules:
- Same personality as the reaction: cheeky, warm, offhand
- Written ABOUT the item, not to the user
- Must reference something specific from the input
- Must be DIFFERENT from both the title and the reaction
- Sentence case. Capitalize first word and proper nouns only.
- Never headline-style. Never a label or category.
- Never inspirational or motivational
- No task-management words

=== REACTION (5-12 words, max 70 characters) ===

WHAT THIS IS: You're Gremly, a small green creature who lives in a productivity app. When someone drops a thought, task, or idea into MindDrop, you react in a speech bubble above the input. React specifically to what the user said.

PROCESS - follow these two steps every time:

1. Find ONE specific detail from their input: a person's name, the actual activity, a place, the subject matter. Lock onto it.
2. React to that detail. A quick take, a playful observation, a one-liner that shows you caught what they said.

TONE BY BUCKET:

- TODOS: React to the real-world thing.
- HABITS: Root for the specific behavior, not the abstract concept of self-improvement.
- JOURNALS: Shorthand empathy. One sentence that shows you get it. Don't therapize.
- IDEAS: Genuine curiosity about the specific idea. Ask a quick question or make an observation.
- EVENTS: Acknowledge the thing happening.
- GENERAL: React to whatever's interesting. Name the specific thing.

VOICE:

- Texting a friend, not writing a greeting card
- Short and offhand \u2014 like you thought of it in half a second
- One exclamation mark is fine when it fits. Zero is also fine. Never two.
- Cheeky when there's an opening, warm when there isn't

HARD BANS \u2014 never do these:

- Task-management language: "noted", "captured", "queued", "tracked", "on your list", "on your radar", "scheduled", "logged", "taking care of"
- Therapy-speak: "valid", "stands out", "is familiar", "is important", "takes courage"
- The "That [noun] really [verb]" structure
- "[Gerund] [abstract noun] with [abstract noun]"
- Restating or paraphrasing the title in different words
- Ending with ANY trailing filler word \u2014 "huh", "right", "yeah", "no", "eh", "tho", "though" \u2014 with or without commas, question marks, or periods. This applies regardless of punctuation.
- Starting with "Ooh" or "Oh" \u2014 these are overused openers

THE QUALITY TEST: Could this reaction ONLY be about this specific drop? If you could swap it onto a different drop and it would still make sense, it's too generic. Rewrite.

VARIETY:
You will sometimes receive a list of your recent reactions along with a structural summary. Use BOTH to avoid repetition:

- Don't reuse the same sentence structures as recent reactions
- If the structural summary shows three statements, try a question or exclamation
- If endings are all nouns, try ending with a verb or adjective
- Your job is to make each reaction feel like a fresh thought, not a template

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "smart_title": "Title Case Title",
  "card_note": "Warm Card Annotation",
  "confirmation_message": "5-12 word reaction, max 70 chars"
}`;
        const t0 = Date.now();
        const userMessage = (() => {
          let msg = `USER INPUT: "${text}"
BUCKET: ${bucket}
SUBTYPE: ${subtype || "none"}`;
          if (recentReactions.length > 0) {
            const structures = recentReactions.map((r) => {
              const trimmed = r.replace(/[.?!,]+$/, "").trim();
              const isQuestion = r.endsWith("?");
              const isExclamation = r.endsWith("!");
              const lastWord = trimmed.split(/\s+/).pop() || "";
              const endingType = /(?:ing|ed|es|s)$/i.test(lastWord) ? "verb" : /ly$/i.test(lastWord) ? "adverb" : "noun";
              const type2 = isQuestion ? "question" : isExclamation ? "exclamation" : "statement";
              return { type: type2, endingType };
            });
            const typeList = structures.map((s) => s.type).join(", ");
            const endingList = structures.map((s) => s.endingType).join(", ");
            msg += `

RECENT REACTIONS (do NOT reuse sentence structures, endings, or patterns):`;
            msg += `
${recentReactions.map((r) => `- "${r}"`).join("\n")}`;
            msg += `
STRUCTURAL SUMMARY: Last ${structures.length} types: ${typeList}. Last endings: ${endingList}.`;
          }
          return msg;
        })();
        const result = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: phase15aSystemPrompt,
          messages: [{ role: "user", content: userMessage }],
          temperature: 0.7,
          maxOutputTokens: 150,
          endpoint: "enrich-phase1-5a"
        });
        const latency = Date.now() - t0;
        if (!result.parsed) {
          return j({
            smart_title: titleCase2(text.substring(0, 50)),
            card_note: null,
            confirmation_message: null,
            speech_message: null,
            latency_ms: latency
          });
        }
        const parsed = result.parsed;
        let smartTitle = parsed.smart_title || null;
        if (smartTitle) {
          smartTitle = String(smartTitle).trim();
          if (smartTitle.length < 3 || smartTitle.length > 60) {
            smartTitle = text.substring(0, 50).trim();
          }
          smartTitle = titleCase2(smartTitle);
        }
        let cardNote = parsed.card_note || null;
        if (cardNote) {
          cardNote = String(cardNote).trim();
          cardNote = cardNote.replace(/\u2014/g, ", ").replace(/\u2013/g, ", ").replace(/\s{2,}/g, " ").trim();
          if (cardNote.length < 3 || cardNote.length > 60) {
            cardNote = null;
          }
          if (cardNote) {
            cardNote = sentenceCase2(cardNote);
          }
        }
        let confirmationMessage = parsed.confirmation_message || null;
        if (confirmationMessage) {
          confirmationMessage = String(confirmationMessage).trim();
          confirmationMessage = confirmationMessage.replace(/[,\s]+(?:huh|right|yeah|no|eh|tho|though)[.?!]?\s*$/i, "").trim();
          confirmationMessage = confirmationMessage.replace(/^(?:Ooh|Oh)[,!]?\s*/i, "").trim();
          confirmationMessage = confirmationMessage.replace(/\u2014/g, ", ").replace(/\u2013/g, ", ").replace(/\s{2,}/g, " ").trim();
          if (confirmationMessage.length < 3) {
            confirmationMessage = null;
          } else if (confirmationMessage.length > 70) {
            confirmationMessage = confirmationMessage.substring(0, 67) + "...";
          }
        }
        console.log("[Phase1.5a] Success", {
          title: smartTitle?.substring(0, 30),
          has_message: !!confirmationMessage,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency
        });
        const rawReaction = confirmationMessage;
        let speechMessage = confirmationMessage;
        if (confirmationMessage) {
          const OPENERS = {
            todo: [
              "Got it.",
              "On it.",
              "I've got this.",
              "I'm on it.",
              "Won't forget.",
              "It's on my list."
            ],
            habit: ["Got it.", "I'll be watching.", "I'm on it.", "Tracking.", "I've got this."],
            log_journal: [
              "Safe with me.",
              "I hear you.",
              "Got it.",
              "Yours is safe.",
              "I've got this.",
              "That's between us."
            ],
            log_idea: [
              "Got it.",
              "Stored away.",
              "Holding onto this.",
              "I've got this.",
              "Tucked away."
            ],
            log_event: ["Got it.", "Won't miss it.", "I'm on it.", "I've got this."],
            general: ["Got it.", "Safe with me.", "I've got this.", "On it."]
          };
          const poolKey = bucket === "todo" ? "todo" : bucket === "habit" ? "habit" : bucket === "log" && subtype === "journal" ? "log_journal" : bucket === "log" && subtype === "idea" ? "log_idea" : bucket === "log" && subtype === "event" ? "log_event" : "general";
          const pool = OPENERS[poolKey] || OPENERS.general;
          const recentOpenerWords = (recentReactions || []).map((r) => {
            const firstSentence = r.split(/[.!]/)[0]?.trim();
            return firstSentence && firstSentence.split(" ").length <= 4 ? firstSentence : null;
          }).filter(Boolean);
          const available = pool.filter((o) => !recentOpenerWords.includes(o.replace(/[.!]$/, "")));
          const opener = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : pool[Math.floor(Math.random() * pool.length)];
          if (Math.random() < 0.45) {
            confirmationMessage = confirmationMessage + " " + opener;
          } else {
            confirmationMessage = opener + " " + confirmationMessage;
          }
          if (confirmationMessage.length > 70) {
            confirmationMessage = confirmationMessage.substring(0, 67) + "...";
          }
          speechMessage = confirmationMessage;
        }
        console.log("[Phase1.5a] Final output", {
          title: smartTitle?.substring(0, 30),
          cardNote: cardNote?.substring(0, 30),
          rawReaction: rawReaction?.substring(0, 30),
          speechMessage: speechMessage?.substring(0, 40),
          bucket,
          subtype
        });
        return j({
          smart_title: smartTitle,
          card_note: cardNote,
          confirmation_message: rawReaction,
          speech_message: speechMessage,
          latency_ms: latency
        });
      }
      if (type === "enrich-phase2") {
        let generateDateExamples2 = function(dateStr, todayDayName, timezone2) {
          const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
          ];
          const todayIndex = dayNames.findIndex(
            (d) => d.toLowerCase() === todayDayName.toLowerCase()
          );
          if (todayIndex === -1) {
            console.log("[DateExamples:Error] Invalid day name", { todayDayName, todayIndex });
            return "";
          }
          const [year, month, day] = dateStr.split("-").map(Number);
          const baseMs = new Date(year, month - 1, day, 12, 0, 0).getTime();
          const parsedDayOfWeek = new Date(year, month - 1, day, 12, 0, 0).getDay();
          if (parsedDayOfWeek !== todayIndex) {
            console.log("[DateExamples:Mismatch]", {
              dateStr,
              todayDayName,
              expectedDayIndex: todayIndex,
              actualDayIndex: parsedDayOfWeek,
              actualDayName: dayNames[parsedDayOfWeek]
            });
          }
          const examples = [];
          const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone2 });
          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayName = dayNames[dayIndex];
            let daysUntil = dayIndex - todayIndex;
            if (daysUntil <= 0) daysUntil += 7;
            const targetMs = baseMs + daysUntil * 864e5;
            const targetDateStr = fmt.format(new Date(targetMs));
            if (dayIndex === todayIndex) {
              examples.push(
                `- "${dayName}" = ${targetDateStr} (NEXT ${dayName}, 7 days from now - NOT today!)`
              );
            } else if (daysUntil === 1) {
              examples.push(`- "${dayName}" = ${targetDateStr} (tomorrow)`);
            } else {
              examples.push(`- "${dayName}" = ${targetDateStr} (in ${daysUntil} days)`);
            }
          }
          console.log("[DateExamples:Generated]", {
            inputDate: dateStr,
            inputDayName: todayDayName,
            todayIndex,
            examples: examples.join(" | ")
          });
          const fridayIndex = 5;
          let daysToFri = fridayIndex - todayIndex;
          if (daysToFri <= 0) daysToFri += 7;
          const fridayMs = baseMs + daysToFri * 864e5;
          const computedFriday = fmt.format(new Date(fridayMs));
          console.log("[DateExamples:Verify]", {
            todayDate: dateStr,
            computedFriday,
            daysToFri,
            timezone: timezone2
          });
          return examples.join("\n");
        };
        var generateDateExamples = generateDateExamples2;
        __name(generateDateExamples2, "generateDateExamples");
        const rl = await checkIpRateLimit(request, env, "enrich", 30);
        if (!rl.allowed) return rateLimitResponse("enrich", rl.count, rl.limit);
        const text = body.text || "";
        const bucket = body.bucket || "log";
        const subtype = body.subtype || null;
        const currentDate = body.currentDate || body.today || new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(/* @__PURE__ */ new Date());
        const timezone = userTimezone;
        const dayOfWeek = body.dayOfWeek || (() => {
          const [_y, _m, _d] = currentDate.split("-").map(Number);
          return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(_y, _m - 1, _d).getDay()];
        })();
        const userSelectedDate = body.userSelectedDate || null;
        console.log("[PrefillDate:5-Worker] Received userSelectedDate:", userSelectedDate);
        console.log("[Phase2:DateIntent]", {
          hasUserSelectedDate: body.hasUserSelectedDate || false,
          userSelectedDate: body.userSelectedDate || null
        });
        const dateExamples = generateDateExamples2(currentDate, dayOfWeek, timezone);
        const phase2Prompt = `You extract core, durable metadata for Gremly, a calm productivity app.
Your goal is to capture only information that is intrinsic to the item.
Do NOT include planning or scheduling logic.

=== DATE CONTEXT ===
Today is ${currentDate} (${dayOfWeek}).
User timezone: ${timezone}.
${userSelectedDate ? `
=== USER-SELECTED DATE ===
The user has explicitly chosen ${userSelectedDate} as the date for this item.
Use ${userSelectedDate} as the target_date/scheduled_date UNLESS the input text explicitly mentions a DIFFERENT specific date.
If the input contains NO date or time references, use ${userSelectedDate}.
If the input says "today", still use ${currentDate}, not the selected date.
` : ""}
=== DATE CALCULATION RULES ===
You MUST calculate dates correctly. Do the math.

**For "tomorrow":**
- Add 1 day to today's date

**For named days (Monday, Tuesday, etc.):**
- Calculate the NEXT occurrence of that day
- CRITICAL: If today IS that day, the next occurrence is 7 DAYS FROM NOW (next week)
- Named days NEVER mean today - they always mean the NEXT future occurrence

**TODAY IS ${dayOfWeek.toUpperCase()} (${currentDate}). Date mapping for this week:**
${dateExamples}

**CRITICAL RULES:**
1. Do NOT return today's date unless the input explicitly says "today"
2. If the named day matches today, add 7 days (next week)
3. Named days ALWAYS refer to FUTURE dates, never today

**Output format:** YYYY-MM-DD

=== ITEM TYPE ===
Bucket: "${bucket}"${subtype ? ` (Subtype: "${subtype}")` : ""}

=== EXTRACTION RULES ===
If unsure, return null.
Do NOT invent or over-infer.

--------------------------------
FOR TODOS & BUILD HABITS (start_habit):
--------------------------------
1. time_estimate_minutes
Estimate in 5-minute increments from 5 to 240 minutes.
Use factor-based reasoning, not category lookup.

=== ESTIMATION FRAMEWORK ===

Think through these factors for EVERY task:

**FACTOR 1: What's the core action?**
Estimate the minimum time if everything went perfectly.
- Send a text: 1-2 min
- Make a phone call: 10-15 min
- Walk somewhere: depends on distance
- Write something: depends on length/complexity
- Physical task: depends on scope

**FACTOR 2: Do I need to leave my current location?**
- Staying put (home/desk): no addition
- Leaving the house: +15-20 min minimum (getting ready, keys, shoes, return, settle back in)
- Going somewhere specific: add realistic travel time (round trip)

**FACTOR 3: Are other people or animals involved?**
- Solo task: you control the pace
- Another person: +10-15 min (coordination, waiting, social dynamics, conversations run long)
- Animal (dog walk, vet): +10-15 min (unpredictability, their pace not yours)
- Group/meeting: +15-20 min (gathering, small talk, herding cats)

**FACTOR 4: Physical world or digital?**
- Digital: more predictable, usually faster
- Physical: more variables, more can go wrong, round UP

**FACTOR 5: Is this bounded or open-ended?**
- Bounded ("pay bill", "send email"): clearer end point, estimate tighter
- Open-ended ("clean garage", "work on project"): no natural stopping point, estimate higher

**FACTOR 6: What commonly goes wrong?**
- Can't find something: +5-10 min
- Technical issues: +5-10 min
- Waiting (on hold, in line): +10-15 min
- Unexpected conversation: +10 min

=== THE PROCESS ===

1. Identify the core action and base time
2. Apply each relevant factor
3. Add up the total
4. Round UP to nearest 5 minutes
5. When uncertain between two estimates, choose the higher one

=== EXAMPLES WITH REASONING ===

**"Walk Bella" (dog walk)**
- Core: walking (20-25 min)
- Leave house: yes (+10 min prep/return)
- Animal involved: yes (+10 min for sniffing, unpredictability)
- Physical: yes (round up)
\u2192 Total: 40-45 min \u2192 **45 min**

**"Call mom"**
- Core: phone conversation (15 min)
- Leave house: no
- Other person: yes (+15 min, mom calls run long)
- Digital: yes
\u2192 Total: 30 min \u2192 **30 min**

**"Buy groceries"**
- Core: shopping (20 min in store)
- Leave house: yes (+10 min)
- Travel: yes (+20 min round trip)
- Physical: yes (round up)
- Can go wrong: lines, can't find items (+10 min)
\u2192 Total: 60 min \u2192 **60 min**

**"Pay electric bill"**
- Core: online payment (3-5 min)
- Leave house: no
- Solo: yes
- Digital: yes
- Bounded: yes
\u2192 Total: 5-10 min \u2192 **10 min**

**"Dentist appointment"**
- Core: appointment (30-45 min)
- Leave house: yes (+10 min)
- Travel: yes (+30 min round trip)
- Other people: yes (waiting room +15 min)
- Physical: yes
\u2192 Total: 85-100 min \u2192 **90 min**

**"Write quarterly report"**
- Core: writing/analysis (60-90 min)
- Leave house: no
- Solo: yes
- Digital: yes
- Open-ended: somewhat (scope can expand)
- Deep focus required: yes (add buffer for getting into flow)
\u2192 Total: 90-120 min \u2192 **90 min** (or 120 if complex)

**"Text Sarah about dinner"**
- Core: typing a message (1-2 min)
- Everything else: no
\u2192 Total: 5 min \u2192 **5 min**

=== RANGE ANCHORS ===

- Minimum: 5 min (truly instant digital tasks)
- Maximum: 240 min (4 hours, major project blocks)
- Most common range: 15-60 min

=== CRITICAL RULES ===

- ALWAYS round UP, never down
- When uncertain, choose the higher estimate
- "Quick" tasks that involve leaving the house are never under 30 min
- Tasks involving other people are rarely under 20 min
- If the user specifies a duration ("30 min run"), honor their estimate
- Don't be afraid to estimate 45, 50, 55 min \u2014 use the full range

NOTE: If the subtype is "break_habit", SKIP time estimation entirely \u2014 return time_estimate_minutes: null. Break habits are about NOT doing something, so they don't have a duration.

2. time_window
Only if explicitly mentioned:
"morning" | "day" | "evening" | null

3. energy_type
Choose ONE (strict enum):
- deep_focus (thinking, writing, coding, planning, creating, designing)
- administrative (email, forms, scheduling, logistics, booking, paying)
- physical (exercise, errands, movement, cleaning, walking, running)
- social (calls, meetings, conversations, interviews)
- quick (very small tasks under 10 min, low cognitive effort)

Default to "administrative" if unclear.

--------------------------------
DATE INTELLIGENCE (TODOS ONLY):
--------------------------------

Dates in user input can mean TWO different things:

**TARGET DATE** \u2014 When something IS or is DUE (external, immovable)
- Deadlines: "due April 15", "by Friday", "before the 10th", "before EOW", "by end of week"
- Events: "dentist Tuesday 2pm", "wedding June 15", "mom's birthday March 5"
- Expiration: "passport expires June", "lease ends March 1"

Signals: "due", "by", "before", "deadline", "expires", "is on", "appointment", "EOW", "EOM", "end of week", "end of month"

**SCHEDULED DATE** \u2014 When user plans to DO the work (internal, movable)
- Action + time: "call mom tomorrow", "go to gym Monday"
- Planning: "work on taxes Saturday", "start running next week"
- Intent: "do this tonight", "handle it tomorrow morning"

Signals: Action verb + time reference, "do", "work on", "handle", "start"

**CRITICAL: Deadline language OVERRIDES action pattern.**
If the time reference includes "before", "by", "due", "until", "EOW", "EOM" \u2014 it's a DEADLINE (target_date), NOT a scheduled_date.
- "book flights before EOW" \u2192 target_date only (deadline), scheduled_date: null
- "finish report by Friday" \u2192 target_date only (deadline), scheduled_date: null
- "call mom tomorrow" \u2192 scheduled_date only (no deadline language)

**AMBIGUOUS** \u2014 Could be either (flag for clarification)
- "dentist Tuesday" \u2014 appointment they have? or need to book?
- "passport June" \u2014 trip date? or expiration?
- Noun + date with no context

**RULES:**
1. If clear deadline language \u2192 target_date only
2. If clear action + time \u2192 scheduled_date only  
3. If both exist \u2192 set both (e.g., "work on taxes Saturday, due April 15")
4. If ambiguous \u2192 set target_date (safer default) and flag date_type_ambiguous

**OUTPUT FIELDS:**
- target_date: YYYY-MM-DD or null (when something IS or is DUE)
- scheduled_date: YYYY-MM-DD or null (when user will DO the work)
- date_type_ambiguous: boolean (true if unclear which type)

**EXAMPLES:**

"taxes due April 15" \u2192 target_date: "2026-04-15", scheduled_date: null
"call mom tomorrow" \u2192 target_date: null, scheduled_date: "2026-01-28"
"dentist Tuesday 2pm" \u2192 target_date: "2026-02-03", scheduled_date: null (appointment)
"work on report, due Friday" \u2192 target_date: "2026-01-31", scheduled_date: null (can add scheduled later)
"go to gym Monday" \u2192 target_date: null, scheduled_date: "2026-02-03"
"passport June" \u2192 target_date: "2026-06-01", date_type_ambiguous: true
"book flights before EOW" \u2192 target_date: end of current week (e.g., "2026-01-31" if today is Tue), scheduled_date: null
"finish report by end of week" \u2192 target_date: Friday of current week, scheduled_date: null
"submit by EOM" \u2192 target_date: last day of current month, scheduled_date: null

**EVENT + SCHEDULING ACTION (both dates exist):**
When input mentions WHEN something IS and WHEN to DO something about it:
- "Haircut appointment is Tuesday, book tomorrow" \u2192
  - target_date: next Tuesday (when appointment IS)
  - scheduled_date: tomorrow (when to BOOK it)
- "Meeting is Friday, prep Thursday" \u2192
  - target_date: Friday (when meeting IS)
  - scheduled_date: Thursday (when to PREP)
- "Conference in June, register by March 1" \u2192
  - target_date: June (when conference IS)
  - scheduled_date: March 1 (when to REGISTER)

CRITICAL: These are TWO DIFFERENT dates. Extract BOTH correctly.

--------------------------------
FOR HABITS ONLY:
--------------------------------
4. extracted_frequency
Examples: daily, 2x/week, 3x/week, weekly

5. extracted_days
Array of numbers if mentioned (0=Sun \u2026 6=Sat), else null

6. extracted_start_date
YYYY-MM-DD if mentioned, else null

--------------------------------
FOR LOGS (EVENT SUBTYPE):
--------------------------------

**EVENT-SPECIFIC EXTRACTION:**

When subtype is "event", extract clean event information.

1. smart_title
Create a clean, concise event name by REMOVING dates and times from the title.
- "QBR with London team on Feb 12" \u2192 "QBR with London Team"
- "dentist appointment tuesday 2pm" \u2192 "Dentist Appointment"
- "company offsite feb 20-22" \u2192 "Company Offsite"
- "Sarah's wedding June 15" \u2192 "Sarah's Wedding"
- "team lunch friday noon" \u2192 "Team Lunch"

Rules:
- Title case the result
- Strip all date/time references from the title itself
- Keep location and people references
- Keep the essence of what the event IS

2. target_date (event start date)
Extract the event date in YYYY-MM-DD format.
- "feb 12" \u2192 "2026-02-12" (assume current year if not specified)
- "next tuesday" \u2192 resolve to actual date using date calculation rules above
- "march 10th" \u2192 "2026-03-10"
- "on the 15th" \u2192 current or next month's 15th
- If no date mentioned but a USER-SELECTED DATE was provided in the date context above \u2192 use that date
- If no date mentioned and no user-selected date \u2192 null

3. end_date (for multi-day events)
Extract end date in YYYY-MM-DD format for multi-day events.
- "feb 20-22" \u2192 end_date: "2026-02-22"
- "monday through wednesday" \u2192 resolve both dates
- "conference june 10-12" \u2192 end_date: "2026-06-12"
- If single day or no range mentioned \u2192 null

4. event_time
Extract time if mentioned, in HH:mm format (24-hour).
- "at 2pm" \u2192 "14:00"
- "morning meeting" \u2192 "09:00"
- "lunch at noon" \u2192 "12:00"
- "dinner at 7" \u2192 "19:00"
- "10:30am" \u2192 "10:30"
- If no time mentioned \u2192 null

--------------------------------
FOR LOGS (OTHER SUBTYPES):
--------------------------------

**DATE EXTRACTION FOR LOGS:**

Logs can contain dates that represent EVENTS or REFERENCE INFORMATION.
ALWAYS extract dates when present, regardless of log subtype.

When the input describes an event, appointment, or scheduled occurrence:
- Extract the date as target_date
- Extract time if mentioned as event_time

Signals to extract dates for logs:
- Existence verbs + date: "is Tuesday", "is on March 5", "is next week"
- Status updates: "moved to Thursday", "scheduled for Friday"
- Event references: "appointment", "meeting", "birthday", "trip"

Examples:
- "Dentist appointment is Tuesday" \u2192 target_date: next Tuesday's date
- "Mom's birthday March 5" \u2192 target_date: "YYYY-03-05"
- "Meeting moved to Thursday 2pm" \u2192 target_date: next Thursday, event_time: "14:00"
- "Conference in June" \u2192 target_date: "YYYY-06-01"

Named days (Monday, Tuesday, etc.) \u2192 calculate next occurrence from current date.

IMPORTANT: Do NOT skip date extraction just because bucket is "log".
If a date is mentioned, extract it.

7. mood (JOURNAL ONLY)
Choose up to 3:
great, good, okay, low, tired,
anxious, overwhelmed, frustrated,
scattered, grateful, hopeful,
focused, calm

8. target_date (ALL LOG SUBTYPES)
Extract ANY date mentioned, in YYYY-MM-DD format.
This is when an event IS or HAPPENS \u2014 reference information.
If no date mentioned but a USER-SELECTED DATE was provided in the date context above \u2192 use that date.
If no date mentioned and no user-selected date \u2192 null.

9. event_time (ALL LOG SUBTYPES)
Extract time if mentioned, in HH:mm format (24-hour).

--------------------------------
TAGS (ALL TYPES):
--------------------------------
8. tags
- 2\u20134 lowercase, hyphenated
- Category + topic
- No filler words
- No people names (people go in the people array instead)

--------------------------------
PEOPLE EXTRACTION:
--------------------------------
9. people
Extract names of people mentioned in the text. Include:
- Explicit names: "John", "Sarah", "Dr. Smith", "Dave"
- Relationship words: "mom", "dad", "sister", "brother", "boss", "wife", "husband"
- Possessive patterns: 
  - "Dave's birthday" \u2192 extract "Dave"
  - "dad's anniversary" \u2192 extract "dad"
  - "mom's birthday" \u2192 extract "mom"
  - "Sarah's wedding" \u2192 extract "Sarah"
- Referenced people: "the one Sarah recommended" \u2192 extract "Sarah"
- Birthday/event context: "birthday April 27" with name in context \u2192 extract that name

Return as array of strings, max 10 people.

=== OUTPUT ===
Return ONLY valid JSON.

For TODOS:
{
  "tags": ["tag1", "tag2"],
  "time_estimate_minutes": number | null,
  "time_window": "morning" | "day" | "evening" | null,
  "energy_type": "deep_focus" | "administrative" | "physical" | "social" | "quick",
  "target_date": "YYYY-MM-DD" | null,
  "scheduled_date": "YYYY-MM-DD" | null,
  "date_type_ambiguous": boolean,
  "people": ["name1", "name2"] | []
}

For HABITS (start_habit / build):
{
  "tags": ["tag1", "tag2"],
  "time_estimate_minutes": number | null,
  "time_window": "morning" | "day" | "evening" | null,
  "energy_type": "deep_focus" | "administrative" | "physical" | "social" | "quick",
  "extracted_frequency": "daily" | "2x/week" | "weekly" | etc,
  "extracted_days": [0, 1, 2] | null,
  "extracted_start_date": "YYYY-MM-DD" | null,
  "people": ["name1", "name2"] | []
}

For HABITS (break_habit):
{
  "tags": ["tag1", "tag2"],
  "time_window": "morning" | "day" | "evening" | null,
  "extracted_frequency": "daily" | "2x/week" | "weekly" | etc,
  "extracted_days": [0, 1, 2] | null,
  "extracted_start_date": "YYYY-MM-DD" | null,
  "people": ["name1", "name2"] | []
}

For LOGS (journal):
{
  "tags": ["tag1", "tag2"],
  "mood": ["anxious", "grateful"] | null,
  "target_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null,
  "people": ["name1", "name2"] | []
}

For LOGS (idea/general):
{
  "tags": ["tag1", "tag2"],
  "target_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null,
  "people": ["name1", "name2"] | []
}

For LOGS (event):
{
  "smart_title": "Clean Event Name",
  "tags": ["tag1", "tag2"],
  "target_date": "YYYY-MM-DD" | null,
  "end_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null,
  "people": ["name1", "name2"] | []
}`;
        console.log("[Phase2:PromptCheck]", {
          hasUserSelectedDateBlock: phase2Prompt.includes("USER-SELECTED DATE"),
          userSelectedDate,
          promptLength: phase2Prompt.length
        });
        const t0 = Date.now();
        const result = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: phase2Prompt,
          messages: [{ role: "user", content: text.substring(0, 1500) }],
          temperature: 0.2,
          maxOutputTokens: 300,
          endpoint: "enrich-phase2"
        });
        const latency = Date.now() - t0;
        if (!result.parsed) {
          console.log("[Phase2] Both providers failed", { latency_ms: latency });
          return j({ error: "enrichment_failed", latency_ms: latency }, 200);
        }
        const parsed = result.parsed;
        console.log("[Phase2:DateDebug]", {
          inputText: text.substring(0, 100),
          currentDate,
          dayOfWeek,
          timezone,
          llm_target_date: parsed.target_date,
          llm_scheduled_date: parsed.scheduled_date,
          llm_extracted_date: parsed.extracted_date,
          llm_date_type_ambiguous: parsed.date_type_ambiguous
        });
        let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        tags = tags.map(
          (t) => String(t).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        ).filter((t) => t.length >= 2 && t.length <= 30).filter((t) => !isStopTag2(t)).slice(0, 7);
        let timeEstimate = null;
        const isBreakHabit = bucket === "habit" && subtype === "break_habit";
        if ((bucket === "todo" || bucket === "habit") && !isBreakHabit) {
          const num = Number(parsed.time_estimate_minutes);
          if (Number.isFinite(num) && num > 0) {
            timeEstimate = Math.min(240, Math.max(5, Math.round(num / 5) * 5));
          }
        }
        let timeWindow = null;
        if (parsed.time_window) {
          const validWindows = ["morning", "day", "evening"];
          const normalized = String(parsed.time_window).toLowerCase().trim();
          timeWindow = validWindows.includes(normalized) ? normalized : null;
        }
        let energyType = null;
        if ((bucket === "todo" || bucket === "habit") && !isBreakHabit) {
          const validEnergyTypes = ["deep_focus", "administrative", "physical", "social", "quick"];
          if (validEnergyTypes.includes(parsed.energy_type)) {
            energyType = parsed.energy_type;
          } else {
            energyType = "administrative";
          }
        }
        let targetDate = null;
        let scheduledDate = null;
        let dateTypeAmbiguous = false;
        if (bucket === "todo") {
          if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
            targetDate = parsed.target_date;
          }
          if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
            scheduledDate = parsed.scheduled_date;
          }
          dateTypeAmbiguous = parsed.date_type_ambiguous === true;
          if (!targetDate && !scheduledDate && parsed.extracted_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_date)) {
            scheduledDate = parsed.extracted_date;
          }
        }
        let noteTargetDate = null;
        let eventTime = null;
        let endDate = null;
        let eventSmartTitle = null;
        if (bucket === "log") {
          if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
            noteTargetDate = parsed.target_date;
          }
          if (parsed.event_time && /^\d{2}:\d{2}$/.test(parsed.event_time)) {
            eventTime = parsed.event_time;
          }
          if (parsed.end_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.end_date)) {
            endDate = parsed.end_date;
          }
          if (subtype === "event" && parsed.smart_title && typeof parsed.smart_title === "string") {
            eventSmartTitle = parsed.smart_title.trim();
          }
        }
        let extractedStartDate = null;
        if (bucket === "habit" && parsed.extracted_start_date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_start_date)) {
            extractedStartDate = parsed.extracted_start_date;
          }
        }
        let extractedFrequency = null;
        if (bucket === "habit" && parsed.extracted_frequency) {
          extractedFrequency = String(parsed.extracted_frequency).trim();
        }
        let extractedDays = null;
        if (bucket === "habit") {
          if (Array.isArray(parsed.extracted_days) && parsed.extracted_days.length > 0) {
            const validDays = parsed.extracted_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (validDays.length > 0) {
              extractedDays = [...new Set(validDays)].sort((a, b) => a - b);
            }
          }
          if (!extractedDays) {
            extractedDays = parseDaysFromText2(text);
          }
        }
        let people = [];
        if (Array.isArray(parsed.people)) {
          people = parsed.people.map((p) => String(p).trim()).filter((p) => p.length > 0 && p.length < 50).slice(0, 10);
        }
        let mood = null;
        if (bucket === "log" && subtype === "journal" && Array.isArray(parsed.mood)) {
          mood = parsed.mood.map((m) => String(m).toLowerCase().trim()).filter((m) => VALID_MOODS.includes(m)).slice(0, 3);
          if (mood.length === 0) mood = null;
        }
        console.log("[Phase2]", {
          tags_count: tags.length,
          has_time_estimate: timeEstimate !== null,
          has_window: timeWindow !== null,
          has_energy: energyType !== null,
          has_target_date: targetDate !== null || noteTargetDate !== null,
          has_scheduled_date: scheduledDate !== null,
          date_ambiguous: dateTypeAmbiguous,
          has_event_time: eventTime !== null,
          has_frequency: extractedFrequency !== null,
          has_days: extractedDays !== null,
          has_start_date: extractedStartDate !== null,
          has_people: people.length > 0,
          has_mood: mood !== null,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency
        });
        return j({
          tags,
          time_estimate_minutes: timeEstimate,
          time_window: timeWindow,
          energy_type: energyType,
          // New date intelligence fields for todos
          target_date: bucket === "todo" ? targetDate : noteTargetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          event_time: eventTime,
          // Event-specific fields
          end_date: endDate,
          smart_title: eventSmartTitle,
          // Keep existing habit fields
          extracted_start_date: extractedStartDate,
          extracted_frequency: extractedFrequency,
          extracted_days: extractedDays,
          // Other fields
          people,
          mood,
          latency_ms: latency
        });
      }
      if (type === "enrich-phase2b") {
        const rl = await checkIpRateLimit(request, env, "enrich", 30);
        if (!rl.allowed) return rateLimitResponse("enrich", rl.count, rl.limit);
        const text = body.text || "";
        const bucket = body.bucket || "log";
        const subtype = body.subtype || null;
        const currentDate = body.currentDate || new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(/* @__PURE__ */ new Date());
        const timezone = userTimezone;
        const dayOfWeek = body.dayOfWeek || (() => {
          const [_y, _m, _d] = currentDate.split("-").map(Number);
          return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(_y, _m - 1, _d).getDay()];
        })();
        if (bucket === "log" && subtype !== "event") {
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null
          });
        }
        if (bucket === "habit" && subtype === "break_habit") {
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null
          });
        }
        const t0 = Date.now();
        const phase2bPrompt = `You decide if a user's quick thought needs a reminder, and if so, when.

=== CONTEXT ===
Today: ${currentDate} (${dayOfWeek})
Timezone: ${timezone}
Item type: ${bucket}${subtype ? ` (${subtype})` : ""}

=== RULES ===
Set auto_reminder to true when the text implies the user wants to be reminded or nudged at a specific time. This includes:
- Explicit reminder language: "remind me", "don't forget", or "remember" used as an imperative (directing oneself to retain or act on something, not recalling a past memory)
- A specific time with action intent ("at 2pm", "by 5pm", "before lunch")
- Urgency combined with a date ("need to do this tomorrow", "must call today")

Set auto_reminder to false when:
- Timing is vague ("soon", "eventually", "this week")
- There is no reminder language and no specific time
- The text is a journal entry, idea, or reflection

If auto_reminder is true, also extract:
- reminder_date: the date to remind (YYYY-MM-DD), or null if no date mentioned
- reminder_time: the time to remind (HH:mm 24h format), or null if no specific time. Use these defaults by time_window: morning=09:00, afternoon/day=13:00, evening=18:00
- reminder_frequency: "once" for one-time reminders, "daily" for habits

If auto_reminder is false, set all other fields to null.

=== OUTPUT ===
Return ONLY valid JSON, no explanation:
{
  "auto_reminder": boolean,
  "reminder_date": "YYYY-MM-DD" | null,
  "reminder_time": "HH:mm" | null,
  "reminder_frequency": "once" | "daily" | null
}`;
        const result = await aiClassify({
          mode: "realtime",
          ...getProviders("mini", env),
          env,
          systemPrompt: phase2bPrompt,
          messages: [{ role: "user", content: text.substring(0, 500) }],
          temperature: 0.1,
          maxOutputTokens: 100,
          endpoint: "enrich-phase2b"
        });
        const latency = Date.now() - t0;
        if (!result.parsed) {
          console.log("[Phase2b] Both providers failed", { latency_ms: latency });
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null,
            latency_ms: latency
          });
        }
        const parsed = result.parsed;
        let reminderTime = null;
        if (parsed.reminder_time && /^\d{2}:\d{2}$/.test(parsed.reminder_time)) {
          reminderTime = parsed.reminder_time;
        }
        let reminderDate = null;
        if (parsed.reminder_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.reminder_date)) {
          reminderDate = parsed.reminder_date;
        }
        const validFreqs = ["once", "daily"];
        const reminderFrequency = validFreqs.includes(parsed.reminder_frequency) ? parsed.reminder_frequency : null;
        const autoReminder = parsed.auto_reminder === true;
        console.log("[Phase2b]", {
          auto_reminder: autoReminder,
          reminder_date: reminderDate,
          reminder_time: reminderTime,
          reminder_frequency: reminderFrequency,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency
        });
        return j({
          auto_reminder: autoReminder,
          reminder_date: autoReminder ? reminderDate : null,
          reminder_time: autoReminder ? reminderTime : null,
          reminder_frequency: autoReminder ? reminderFrequency : null,
          latency_ms: latency
        });
      }
      if (type === "journal-analyze") {
        const rl = await checkIpRateLimit(request, env, "misc", 30);
        if (!rl.allowed) return rateLimitResponse("misc", rl.count, rl.limit);
        const entries = body.entries || [];
        const timezone = userTimezone;
        if (!Array.isArray(entries) || entries.length === 0) {
          return j({ error: "no_entries", detail: "No journal entries provided" }, 200);
        }
        const cappedEntries = entries.slice(0, 60);
        const journalBlock = cappedEntries.map((entry, i) => {
          const parts = [`[${entry.date || "unknown date"}]`];
          if (entry.mood && entry.mood.length > 0) {
            parts.push(`(mood: ${entry.mood.join(", ")})`);
          }
          parts.push(entry.body || "(empty)");
          return parts.join(" ");
        }).join("\n---\n");
        const analyzeSystemPrompt = `You are a thoughtful, warm journal analyst for Gremly, a calm productivity app.
The user has shared their recent journal entries. Analyze them with care and empathy.

=== YOUR TASK ===
Analyze these entries and return a JSON object with these four sections:

1. "themes" - Array of 2-4 recurring themes you notice. Each theme is an object:
   { "label": "short theme name", "description": "1-2 sentence observation", "count": number_of_entries_touching_this }
   Be specific to THEIR life, not generic. "Work stress around presentations" not just "Stress".

2. "patterns" - Array of 2-3 behavioral or emotional patterns. Each pattern:
   { "label": "pattern name", "description": "1-2 sentence insight", "sentiment": "positive" | "neutral" | "watch" }
   "watch" means something worth being mindful of (not alarming, just worth noticing).
   Look for: mood swings, recurring triggers, coping mechanisms, growth arcs.

3. "journaling_habits" - Object describing WHEN and HOW they journal:
   { "frequency": "description of how often", "preferred_time": "morning" | "evening" | "varies" | "unknown", "avg_length": "short" | "medium" | "long", "observation": "1 sentence about their journaling style" }

4. "suggestion" - A single gentle, actionable suggestion. Object:
   { "text": "the suggestion (2-3 sentences max)", "type": "reflect" | "try" | "continue" }
   "reflect" = think about something, "try" = experiment with something new, "continue" = keep doing something good.
   Keep reflections grounded in what the user shared. Offer observations and gentle questions, not prescriptions or referrals.
   Frame as an invitation, not advice. Use "you might..." or "it could be interesting to..." language.

=== RULES ===
- Be warm but honest. Don't sugarcoat, but don't alarm.
- Reference SPECIFIC things from their entries (names, events, feelings they mentioned).
- If there are very few entries (< 5), say so in journaling_habits.observation and keep themes/patterns shorter.
- Return ONLY valid JSON. No markdown, no explanation.

=== OUTPUT ===
Return a single JSON object with keys: themes, patterns, journaling_habits, suggestion`;
        const t0 = Date.now();
        try {
          const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                { role: "system", content: analyzeSystemPrompt },
                { role: "user", content: "Here are my journal entries:\n\n" + journalBlock }
              ],
              temperature: 0.4,
              max_tokens: 1200,
              response_format: { type: "json_object" }
            })
          });
          const oj2 = await res2.json();
          const latency = Date.now() - t0;
          if (!res2.ok) {
            console.log("[JournalAnalyze] API error", { error: oj2.error, latency_ms: latency });
            return j({ error: "analyze_failed", latency_ms: latency }, 200);
          }
          const rawContent = oj2?.choices?.[0]?.message?.content ?? "{}";
          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            console.log("[JournalAnalyze] Parse error", { raw: rawContent.slice(0, 200) });
            return j({ error: "parse_failed", latency_ms: latency }, 200);
          }
          console.log("[JournalAnalyze] Success", {
            entryCount: cappedEntries.length,
            themesCount: parsed.themes?.length || 0,
            patternsCount: parsed.patterns?.length || 0,
            latency_ms: latency
          });
          return j({
            analysis: parsed,
            entry_count: cappedEntries.length,
            latency_ms: latency
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log("[JournalAnalyze] Error", { error: String(err), latency_ms: latency });
          return j({ error: "analyze_failed", detail: String(err), latency_ms: latency }, 200);
        }
      }
      const baseModel = body.model || "gpt-4.1-nano";
      const baseTemperature = Number.isFinite(body.temperature) ? body.temperature : type === "classify" ? 0.1 : 0.2;
      const baseMaxTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : Number.isFinite(body.maxTokens) ? body.maxTokens : Number.isFinite(body.max_completion_tokens) ? body.max_completion_tokens : type === "classify" ? 160 : 200;
      const isSpaceChatLane = lane === "space_chat" && type !== "classify";
      const isGeneralChatLane = lane === "general_chat" && type !== "classify";
      const isGeneralChatStreaming = isGeneralChatLane && wantsStreaming;
      const actualModel = isSpaceChatLane ? "gpt-4.1" : baseModel;
      const temperature = actualModel === "gpt-4.1" && !Number.isFinite(body.temperature) ? 0.7 : baseTemperature;
      const maxTokensValue = isSpaceChatLane ? 800 : baseMaxTokens;
      console.log("[MODEL]", {
        lane,
        model: actualModel,
        streaming: wantsStreaming,
        maxTokens: maxTokensValue
      });
      let originalText = "";
      let messages = Array.isArray(body.messages) ? body.messages : [];
      if (type === "classify") {
        const sysOverride = body.system || body.systemPrompt || null;
        const text = body.text || body.prompt || body.input || body.message || "";
        originalText = String(text || "");
        const masterPrompt = `You are classifying personal thoughts and tasks for a productivity app.
 
 BUCKETS (choose one):
 
 - 'todo': Clear, unhedged action. Has specific verb + object.
 - 'habit': Recurring behavior with explicit frequency.
 - 'log-journal': Emotional reflection.
 - 'log-idea': Brainstorming or conceptual.
 - 'log-general': Everything meaningful but not a todo/habit.
 - 'unsorted': Only gibberish.
 
 Return ONLY JSON:
 {
  "bucket": "...",
  "confidence": 0-100,
  "title": "...",
  "tags": ["a","b"]
 }`;
        messages = [{ role: "system", content: masterPrompt }];
        if (sysOverride) messages.push({ role: "system", content: String(sysOverride) });
        messages.push({ role: "user", content: originalText });
      } else {
        if (messages.length === 0) {
          const sys = body.system || body.systemPrompt || null;
          const text = body.text || body.prompt || body.input || body.message || "Respond succinctly.";
          originalText = String(text || "");
          messages = [];
          if (sys) messages.push({ role: "system", content: String(sys) });
          messages.push({ role: "user", content: text });
        } else {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          originalText = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";
        }
      }
      if (isSpaceChatStreaming && isSpaceChatLane) {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessSSEResponse(access.reason);
        }
        console.log("[SpaceChat:Streaming] Starting SSE stream");
        const lastUserMsgSpace = messages.filter((m) => m.role === "user").pop()?.content || "";
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        (async () => {
          try {
            const loadingMsg = await generateLoadingMessage(
              lastUserMsgSpace,
              body.spaceName || null,
              env.OPENAI_API_KEY
            );
            if (loadingMsg) {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ searching: true, query: loadingMsg, isLoadingHint: true })}

`
                )
              );
            }
          } catch {
          }
        })();
        (async () => {
          try {
            await writer.write(encoder.encode(": ping\n\n"));
            const detectedUrlsSpace = extractUrlsFromText(lastUserMsgSpace);
            let urlContextSpace = "";
            let fetchedUrlSpace = null;
            if (detectedUrlsSpace.length > 0) {
              console.log("[SpaceChat:Streaming] URLs detected:", detectedUrlsSpace);
              const urlToFetch = detectedUrlsSpace[0];
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    fetching: true,
                    fetchingUrl: urlToFetch,
                    done: false
                  })}

`
                )
              );
              const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);
              if (extracted && extracted.success) {
                fetchedUrlSpace = {
                  url: extracted.url,
                  title: extracted.title
                };
                urlContextSpace = `

=== EXTRACTED CONTENT FROM URL ===
URL: ${extracted.url}
Title: ${extracted.title}

${extracted.content}

=== END EXTRACTED CONTENT ===

The user has shared this link. Summarize the key points and answer any questions they have about it. If they just shared the link without a specific question, provide a helpful summary of what the content covers.`;
                console.log("[SpaceChat:Streaming] URL content extracted");
              } else {
                urlContextSpace = `

[Note: The user shared a link (${urlToFetch}) but I couldn't access its content. It may be paywalled, require login, or be temporarily unavailable. Let the user know and offer to help if they can paste the content directly.]`;
                console.log("[SpaceChat:Streaming] URL extraction failed");
              }
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    fetching: false,
                    done: false
                  })}

`
                )
              );
            }
            const previousSearchContext = messages.filter((m) => m.role === "assistant" && m.sources?.length > 0).slice(-1)[0];
            let spaceSessionContextStr = "";
            let spaceUserProfile = null;
            let cachedDomains = [];
            let spaceEntities = null;
            let spaceTodayActivity = null;
            if (authenticatedUserId) {
              try {
                const [chatContext, profile, domains, entities, todayAct] = await Promise.all([
                  buildChatContext(
                    authenticatedUserId,
                    "space",
                    {
                      spaceId: body.spaceId,
                      timezone: userTimezone,
                      currentChatId: body.chatId || null
                    },
                    env
                  ),
                  getUserProfile(authenticatedUserId, env),
                  getCachedDomainNames(authenticatedUserId, env),
                  fetchSpaceEntities(authenticatedUserId, body.spaceId, env),
                  buildTodayActivity(authenticatedUserId, userTimezone, env)
                ]);
                spaceSessionContextStr = chatContext;
                spaceUserProfile = profile;
                cachedDomains = domains;
                spaceEntities = entities;
                spaceTodayActivity = todayAct;
                if (spaceSessionContextStr || spaceUserProfile) {
                  console.log("[SpaceChat] Context loaded", {
                    userId: authenticatedUserId.slice(0, 8),
                    sessionContextLength: spaceSessionContextStr?.length || 0,
                    hasUserProfile: !!spaceUserProfile,
                    hasSpaceEntities: !!spaceEntities
                  });
                }
              } catch (err) {
                console.error("[SpaceChat] Context error", err);
              }
            }
            const previousExchange = extractPreviousExchange(messages);
            const triage = await triageMessage({
              userMessage: lastUserMsgSpace,
              previousExchange,
              spaceName: body.spaceName || void 0,
              runningSummary: body.runningSummary || "",
              chatType: "space",
              env,
              domainNames: cachedDomains,
              profileSnippet: spaceUserProfile?.profileText?.slice(0, 150) || "",
              messageCount: messages.length
            });
            console.log("[SpaceChat:Streaming:Triage]", {
              mode: triage.mode,
              search: triage.search,
              personal: triage.personal,
              depth: triage.depth,
              source: triage.source,
              messagePreview: lastUserMsgSpace.slice(0, 80)
            });
            const streamContext = { runningSummary: body.runningSummary || "" };
            const spaceContext = spaceEntities ? formatSpaceEntities(spaceEntities) : null;
            const genConfig = buildSpaceChatSystemPrompt(
              triage,
              streamContext,
              body.spaceName,
              spaceContext,
              body.accountCreatedAt,
              spaceSessionContextStr,
              spaceUserProfile?.profileText,
              userTimezone,
              spaceTodayActivity
            );
            const processedMessagesSpace = messages.map((msg, idx, arr) => {
              if (urlContextSpace && idx === arr.length - 1 && msg.role === "user") {
                return { ...msg, content: msg.content + urlContextSpace };
              }
              return msg;
            });
            const spaceChatMessages = [
              { role: "system", content: genConfig.systemPrompt },
              ...processedMessagesSpace.filter((m) => m.role !== "system")
            ];
            if (previousSearchContext) {
              spaceChatMessages.push({
                role: "system",
                content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.sources.map((s) => s.title).join(", ")}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`
              });
            }
            const searchPolicy = getSearchPolicy(triage.search);
            const streamConfig = {
              temperature: genConfig.temperature,
              maxOutputTokens: genConfig.maxTokens,
              thinkingLevel: genConfig.thinkingLevel
            };
            if (searchPolicy.attachTool) {
              streamConfig.tools = [makeWebSearchTool(userTimezone)];
            }
            const t0 = Date.now();
            console.log("[SpaceChat:Streaming:Payload]", {
              temperature: streamConfig.temperature,
              maxOutputTokens: streamConfig.maxOutputTokens,
              thinkingLevel: streamConfig.thinkingLevel,
              hasTools: !!streamConfig.tools,
              messageCount: spaceChatMessages.length
            });
            const geminiRes = await geminiStream(
              genConfig.systemPrompt,
              spaceChatMessages,
              streamConfig,
              env.GOOGLE_API_KEY
            );
            if (!geminiRes.ok || !geminiRes.body) {
              const errText = geminiRes.error || "unknown error";
              console.log("[SpaceChat:Streaming] Gemini error", {
                status: geminiRes.status,
                error: errText
              });
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ error: errText, done: true })}

`)
              );
              return;
            }
            const reader = geminiRes.body.getReader();
            let buffer = "";
            let fullContent = "";
            let toolCalls = [];
            let modelResponseParts = [];
            let fillerBuffer = "";
            let fillerFlushed = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === "data: [DONE]") continue;
                  if (!trimmed.startsWith("data: ")) continue;
                  try {
                    const chunk = parseGeminiChunk(trimmed.slice(6));
                    const delta = chunk.text;
                    if (delta) {
                      fullContent += delta;
                      if (!fullContent.includes("<!--SAVE:")) {
                        if (!fillerFlushed) {
                          fillerBuffer += delta;
                          const hasBreak = /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                          if (hasBreak) {
                            const cleaned = stripFillerOpening(fillerBuffer);
                            if (cleaned) {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                )
                              );
                            }
                            fillerFlushed = true;
                          }
                        } else {
                          const sseData = JSON.stringify({ delta, done: false });
                          await writer.write(encoder.encode(`data: ${sseData}

`));
                        }
                      }
                    }
                    if (chunk.functionCalls) {
                      for (const fc of chunk.functionCalls) {
                        toolCalls.push({
                          id: fc.id,
                          name: fc.name,
                          arguments: JSON.stringify(fc.args)
                        });
                        modelResponseParts.push({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                          thoughtSignature: fc.thoughtSignature
                        });
                      }
                    }
                  } catch (parseErr) {
                    console.log("[SpaceChat:Streaming] Chunk parse error", {
                      line: trimmed.slice(0, 100)
                    });
                  }
                }
              }
              if (!fillerFlushed && fillerBuffer) {
                const cleaned = stripFillerOpening(fillerBuffer);
                if (cleaned) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: cleaned, done: false })}

`)
                  );
                }
              }
              fullContent = stripFillerOpening(fullContent);
              let sources2 = void 0;
              let searchQueries = [];
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === "web_search" && tc.arguments
              );
              if (webSearchCalls.length > 0) {
                console.log("[SpaceChat:Streaming] Web search triggered", {
                  searchCount: webSearchCalls.length
                });
                let firstQuery = "";
                try {
                  const firstArgs = JSON.parse(webSearchCalls[0].arguments);
                  firstQuery = firstArgs.query || "";
                } catch {
                  const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = match ? match[1] : "multiple topics";
                }
                const searchNotice = webSearchCalls.length > 1 ? `${firstQuery} (+${webSearchCalls.length - 1} more)` : firstQuery;
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: searchNotice })}

`
                  )
                );
                const searchT0 = Date.now();
                const searchPromises = webSearchCalls.map(async (tc) => {
                  try {
                    let query;
                    try {
                      const args = JSON.parse(tc.arguments);
                      query = args.query;
                    } catch (parseErr) {
                      const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                      if (match) {
                        query = match[1];
                        console.log(
                          "[SpaceChat:Streaming] Recovered query from malformed JSON:",
                          query
                        );
                      } else {
                        console.log(
                          "[SpaceChat:Streaming] Could not parse tool arguments:",
                          tc.arguments.slice(0, 200)
                        );
                        return { toolCallId: tc.id, query: null, results: null };
                      }
                    }
                    searchQueries.push(query);
                    const results = await executeTavilySearch(query, env.TAVILY_API_KEY);
                    return { toolCallId: tc.id, query, results };
                  } catch (err) {
                    console.log("[SpaceChat:Streaming] Individual search error:", err);
                    return { toolCallId: tc.id, query: null, results: null };
                  }
                });
                const searchResults = await Promise.all(searchPromises);
                const searchLatency = Date.now() - searchT0;
                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0
                );
                console.log("[SpaceChat:Streaming] Searches complete", {
                  total: searchResults.length,
                  successful: successfulSearches.length,
                  latency: searchLatency
                });
                if (successfulSearches.length > 0) {
                  const originalContents = convertMessages(spaceChatMessages);
                  if (fullContent) {
                    modelResponseParts.unshift({ text: fullContent });
                  }
                  const functionResults = successfulSearches.map((sr) => ({
                    name: "web_search",
                    id: sr.toolCallId,
                    response: { results: formatSearchBrief(sr.results) }
                  }));
                  const followUpContents = buildFollowUpContents(
                    originalContents,
                    modelResponseParts,
                    functionResults
                  );
                  const followUpRes = await geminiStream(
                    genConfig.systemPrompt,
                    [],
                    {
                      temperature: genConfig.temperature,
                      maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                      thinkingLevel: genConfig.thinkingLevel,
                      nativeContents: followUpContents
                    },
                    env.GOOGLE_API_KEY
                  );
                  const followUpReader = followUpRes.body.getReader();
                  let followUpBuffer = "";
                  let readerDone = false;
                  let followUpFillerBuffer = "";
                  let followUpFillerFlushed = false;
                  while (!readerDone) {
                    const result = await followUpReader.read();
                    readerDone = result.done;
                    if (readerDone) break;
                    const value = result.value;
                    followUpBuffer += decoder.decode(value, { stream: true });
                    const lines = followUpBuffer.split("\n");
                    followUpBuffer = lines.pop() || "";
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed.startsWith("data:")) continue;
                      const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
                      if (jsonStr === "[DONE]") continue;
                      try {
                        const chunk = parseGeminiChunk(jsonStr);
                        const delta = chunk.text;
                        if (delta) {
                          fullContent += delta;
                          if (!followUpFillerFlushed) {
                            followUpFillerBuffer += delta;
                            const hasBreak = /[.?!]\s/.test(followUpFillerBuffer) || followUpFillerBuffer.length > 150;
                            if (hasBreak) {
                              const cleaned = stripFillerOpening(followUpFillerBuffer);
                              if (cleaned) {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                  )
                                );
                              }
                              followUpFillerFlushed = true;
                            }
                          } else {
                            await writer.write(
                              encoder.encode(`data: ${JSON.stringify({ delta, done: false })}

`)
                            );
                          }
                        }
                      } catch {
                      }
                    }
                  }
                  if (followUpBuffer.trim()) {
                    const trimmed = followUpBuffer.trim();
                    if (trimmed.startsWith("data:")) {
                      const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
                      if (jsonStr !== "[DONE]") {
                        try {
                          const chunk = parseGeminiChunk(jsonStr);
                          const delta = chunk.text;
                          if (delta) {
                            fullContent += delta;
                            if (!followUpFillerFlushed) {
                              followUpFillerBuffer += delta;
                            } else {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta, done: false })}

`
                                )
                              );
                            }
                          }
                        } catch {
                        }
                      }
                    }
                  }
                  if (!followUpFillerFlushed && followUpFillerBuffer) {
                    const cleaned = stripFillerOpening(followUpFillerBuffer);
                    if (cleaned) {
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                        )
                      );
                    }
                  }
                  fullContent = stripFillerOpening(fullContent);
                  sources2 = successfulSearches.flatMap(
                    (sr) => sr.results.results.map((r) => ({ title: r.title, url: r.url }))
                  );
                }
              }
              if (webSearchCalls.length > 0 && !fullContent) {
                console.log(
                  "[SpaceChat:Streaming] Search fallback - responding without search results"
                );
                const fallbackResult = await geminiGenerate(
                  genConfig.systemPrompt + "\n\nAnswer based on the entity context and your existing knowledge. Do not mention search availability.",
                  spaceChatMessages,
                  {
                    temperature: genConfig.temperature,
                    maxOutputTokens: genConfig.maxTokens,
                    thinkingLevel: genConfig.thinkingLevel
                  },
                  env.GOOGLE_API_KEY
                );
                fullContent = fallbackResult.ok ? fallbackResult.content : "I had trouble searching for that information. Could you try rephrasing your question?";
                fullContent = stripFillerOpening(fullContent);
                const words = fullContent.split(" ");
                for (let i = 0; i < words.length; i += 3) {
                  const chunk = words.slice(i, i + 3).join(" ") + " ";
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}

`)
                  );
                  await new Promise((resolve) => setTimeout(resolve, 15));
                }
              }
              const searchQuery2 = searchQueries.length > 0 ? searchQueries.join(" | ") : void 0;
              const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion2(fullContent);
              fullContent = cleanContent;
              fullContent = fullContent.replace(/<!--SAVE:.*?-->/gs, "").replace(/<!--SAVE:.*$/s, "").trim();
              const save_suggestion = smartSuggestion || null;
              if (smartSuggestion) {
                console.log("[SpaceChat:Streaming] Extracted save suggestion:", {
                  type: smartSuggestion.type,
                  title: smartSuggestion.title,
                  hasSteps: !!smartSuggestion.steps?.length
                });
              }
              const latency = Date.now() - t0;
              const finalData = JSON.stringify({
                done: true,
                full_content: fullContent,
                save_suggestion,
                sources: sources2,
                search_query: searchQuery2,
                latency_ms: latency,
                fetchedUrl: fetchedUrlSpace
              });
              await writer.write(encoder.encode(`data: ${finalData}

`));
              console.log("[SpaceChat:Streaming] Complete", {
                latency_ms: latency,
                content_length: fullContent.length,
                used_search: !!searchQuery2
              });
              if (body.chatId && authenticatedUserId && fullContent) {
                const summaryPromise = (async () => {
                  try {
                    const prevSummaryRes = await fetch(
                      `${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}&select=running_summary`,
                      {
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                        }
                      }
                    );
                    const prevData = prevSummaryRes?.ok ? await prevSummaryRes.json().catch(() => []) : [];
                    const previousSummary = prevData?.[0]?.running_summary || null;
                    await generateRunningSummary(
                      messages.filter((m) => m.role !== "system"),
                      fullContent,
                      body.chatId,
                      body.spaceName || null,
                      previousSummary,
                      env,
                      userTimezone
                    );
                  } catch (err) {
                    console.warn("[SpaceChat] Running summary failed:", err.message);
                  }
                })();
                ctx.waitUntil(summaryPromise);
              }
            } catch (streamErr) {
              console.log("[SpaceChat:Streaming] Stream error", { error: String(streamErr) });
              const errorData = JSON.stringify({
                error: String(streamErr),
                done: true,
                full_content: fullContent
              });
              await writer.write(encoder.encode(`data: ${errorData}

`));
            }
          } catch (outerErr) {
            console.error("[SpaceChat:Streaming] Outer error", { error: String(outerErr) });
            try {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ error: String(outerErr), done: true })}

`
                )
              );
            } catch {
            }
          } finally {
            try {
              await writer.close();
            } catch {
            }
          }
        })();
        return new Response(readable, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive"
          }
        });
      }
      if (isGeneralChatStreaming && isGeneralChatLane) {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessSSEResponse(access.reason);
        }
        console.log("[GeneralChat:Streaming] Starting SSE stream");
        const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        (async () => {
          try {
            const loadingMsg = await generateLoadingMessage(lastUserMsg, null, env.OPENAI_API_KEY);
            if (loadingMsg) {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ searching: true, query: loadingMsg, isLoadingHint: true })}

`
                )
              );
            }
          } catch {
          }
        })();
        (async () => {
          try {
            await writer.write(encoder.encode(": ping\n\n"));
            const detectedUrls = extractUrlsFromText(lastUserMsg);
            let urlContext = "";
            let fetchedUrl = null;
            if (detectedUrls.length > 0) {
              const urlToFetch = detectedUrls[0];
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ fetching: true, fetchingUrl: urlToFetch, done: false })}

`
                )
              );
              const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);
              if (extracted && extracted.success) {
                fetchedUrl = { url: extracted.url, title: extracted.title };
                urlContext = `

=== EXTRACTED CONTENT FROM URL ===
URL: ${extracted.url}
Title: ${extracted.title}

${extracted.content}

=== END EXTRACTED CONTENT ===

The user has shared this link. Summarize the key points and answer any questions they have about it.`;
              } else {
                urlContext = `

[Note: The user shared a link (${urlToFetch}) but I couldn't access its content.]`;
              }
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ fetching: false, done: false })}

`)
              );
            }
            let sessionContextStr = "";
            let userProfile = null;
            let cachedDomains = [];
            let generalTodayActivity = null;
            if (authenticatedUserId) {
              try {
                const [chatContext, profile, domains, todayAct] = await Promise.all([
                  buildChatContext(
                    authenticatedUserId,
                    "general",
                    { timezone: userTimezone, currentChatId: body.chatId || null },
                    env
                  ),
                  getUserProfile(authenticatedUserId, env),
                  getCachedDomainNames(authenticatedUserId, env),
                  buildTodayActivity(authenticatedUserId, userTimezone, env)
                ]);
                sessionContextStr = chatContext;
                userProfile = profile;
                cachedDomains = domains;
                generalTodayActivity = todayAct;
                if (sessionContextStr || userProfile) {
                  console.log("[GeneralChat] Context loaded", {
                    userId: authenticatedUserId.slice(0, 8),
                    contextLength: sessionContextStr?.length || 0,
                    hasProfile: !!userProfile
                  });
                }
              } catch (err) {
                console.error("[GeneralChat] Context error", err);
              }
            }
            const previousExchange = extractPreviousExchange(messages);
            const triage = await triageMessage({
              userMessage: lastUserMsg,
              previousExchange,
              spaceName: void 0,
              runningSummary: body.runningSummary || "",
              chatType: "general",
              env,
              domainNames: cachedDomains,
              profileSnippet: userProfile?.profileText?.slice(0, 150) || "",
              messageCount: messages.length
            });
            console.log("[GeneralChat:Triage]", {
              mode: triage.mode,
              search: triage.search,
              personal: triage.personal,
              depth: triage.depth
            });
            const streamContext = { runningSummary: body.runningSummary || "" };
            const genConfig = buildGeneralChatConfig(
              triage,
              streamContext,
              body.accountCreatedAt,
              sessionContextStr,
              userProfile?.profileText,
              userTimezone,
              generalTodayActivity
            );
            const processedMessages = messages.map((msg, idx, arr) => {
              if (urlContext && idx === arr.length - 1 && msg.role === "user") {
                return { ...msg, content: msg.content + urlContext };
              }
              return msg;
            });
            const chatMessages = [
              { role: "system", content: genConfig.systemPrompt },
              ...processedMessages.filter((m) => m.role !== "system")
            ];
            const searchPolicy = getSearchPolicy(triage.search);
            const streamConfig = {
              temperature: genConfig.temperature,
              maxOutputTokens: genConfig.maxTokens,
              thinkingLevel: genConfig.thinkingLevel
            };
            if (searchPolicy.attachTool) {
              streamConfig.tools = [makeWebSearchTool(userTimezone)];
            }
            const t0 = Date.now();
            const geminiRes = await geminiStream(
              genConfig.systemPrompt,
              chatMessages,
              streamConfig,
              env.GOOGLE_API_KEY
            );
            if (!geminiRes.ok || !geminiRes.body) {
              const errText = geminiRes.error || "unknown error";
              console.log("[GeneralChat:Streaming] Gemini error", { error: errText });
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ error: errText, done: true })}

`)
              );
              return;
            }
            const reader = geminiRes.body.getReader();
            let buffer = "";
            let fullContent = "";
            let toolCalls = [];
            let modelResponseParts = [];
            let fillerBuffer = "";
            let fillerFlushed = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === "data: [DONE]") continue;
                  if (!trimmed.startsWith("data: ")) continue;
                  try {
                    const chunk = parseGeminiChunk(trimmed.slice(6));
                    const delta = chunk.text;
                    if (delta) {
                      fullContent += delta;
                      if (!fullContent.includes("<!--SAVE:")) {
                        if (!fillerFlushed) {
                          fillerBuffer += delta;
                          const hasBreak = /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                          if (hasBreak) {
                            const cleaned = stripFillerOpening(fillerBuffer);
                            if (cleaned) {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                )
                              );
                            }
                            fillerFlushed = true;
                          }
                        } else {
                          await writer.write(
                            encoder.encode(`data: ${JSON.stringify({ delta, done: false })}

`)
                          );
                        }
                      }
                    }
                    if (chunk.functionCalls) {
                      for (const fc of chunk.functionCalls) {
                        toolCalls.push({
                          id: fc.id,
                          name: fc.name,
                          arguments: JSON.stringify(fc.args)
                        });
                        modelResponseParts.push({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                          thoughtSignature: fc.thoughtSignature
                        });
                      }
                    }
                  } catch {
                  }
                }
              }
              if (!fillerFlushed && fillerBuffer) {
                const cleaned = stripFillerOpening(fillerBuffer);
                if (cleaned) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: cleaned, done: false })}

`)
                  );
                }
              }
              fullContent = stripFillerOpening(fullContent);
              let sources2 = void 0;
              let searchQueries = [];
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === "web_search" && tc.arguments
              );
              if (webSearchCalls.length > 0) {
                let firstQuery = "";
                try {
                  firstQuery = JSON.parse(webSearchCalls[0].arguments).query || "";
                } catch {
                  const m = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = m ? m[1] : "";
                }
                const searchNotice = webSearchCalls.length > 1 ? `${firstQuery} (+${webSearchCalls.length - 1} more)` : firstQuery;
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: searchNotice })}

`
                  )
                );
                const searchResults = await Promise.all(
                  webSearchCalls.map(async (tc) => {
                    try {
                      let query;
                      try {
                        query = JSON.parse(tc.arguments).query;
                      } catch {
                        const m = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                        query = m ? m[1] : null;
                      }
                      if (!query) return { toolCallId: tc.id, query: null, results: null };
                      searchQueries.push(query);
                      const results = await executeTavilySearch(query, env.TAVILY_API_KEY);
                      return { toolCallId: tc.id, query, results };
                    } catch {
                      return { toolCallId: tc.id, query: null, results: null };
                    }
                  })
                );
                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0
                );
                if (successfulSearches.length > 0) {
                  const originalContents = convertMessages(chatMessages);
                  if (fullContent) modelResponseParts.unshift({ text: fullContent });
                  const functionResults = successfulSearches.map((sr) => ({
                    name: "web_search",
                    id: sr.toolCallId,
                    response: { results: formatSearchBrief(sr.results) }
                  }));
                  const followUpContents = buildFollowUpContents(
                    originalContents,
                    modelResponseParts,
                    functionResults
                  );
                  const followUpRes = await geminiStream(
                    genConfig.systemPrompt,
                    [],
                    {
                      temperature: genConfig.temperature,
                      maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                      thinkingLevel: genConfig.thinkingLevel,
                      nativeContents: followUpContents
                    },
                    env.GOOGLE_API_KEY
                  );
                  const followUpReader = followUpRes.body.getReader();
                  let followUpBuffer = "";
                  let followUpFillerBuffer = "";
                  let followUpFillerFlushed = false;
                  let readerDone = false;
                  while (!readerDone) {
                    const result = await followUpReader.read();
                    readerDone = result.done;
                    if (readerDone) break;
                    followUpBuffer += decoder.decode(result.value, { stream: true });
                    const fLines = followUpBuffer.split("\n");
                    followUpBuffer = fLines.pop() || "";
                    for (const fl of fLines) {
                      const ft = fl.trim();
                      if (!ft.startsWith("data:")) continue;
                      const fj = ft.replace(/^data:\s*/, "").trim();
                      if (fj === "[DONE]") continue;
                      try {
                        const fc = parseGeminiChunk(fj);
                        const fd = fc.text;
                        if (fd) {
                          fullContent += fd;
                          if (!followUpFillerFlushed) {
                            followUpFillerBuffer += fd;
                            if (/[.?!]\s/.test(followUpFillerBuffer) || followUpFillerBuffer.length > 150) {
                              const cleaned = stripFillerOpening(followUpFillerBuffer);
                              if (cleaned)
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                                  )
                                );
                              followUpFillerFlushed = true;
                            }
                          } else {
                            await writer.write(
                              encoder.encode(
                                `data: ${JSON.stringify({ delta: fd, done: false })}

`
                              )
                            );
                          }
                        }
                      } catch {
                      }
                    }
                  }
                  if (!followUpFillerFlushed && followUpFillerBuffer) {
                    const cleaned = stripFillerOpening(followUpFillerBuffer);
                    if (cleaned)
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({ delta: cleaned, done: false })}

`
                        )
                      );
                  }
                  fullContent = stripFillerOpening(fullContent);
                  sources2 = successfulSearches.flatMap(
                    (sr) => sr.results.results.map((r) => ({ title: r.title, url: r.url }))
                  );
                }
              }
              if (webSearchCalls.length > 0 && !fullContent) {
                const fallbackResult = await geminiGenerate(
                  genConfig.systemPrompt + "\n\nAnswer based on your existing knowledge. Do not mention search.",
                  chatMessages,
                  {
                    temperature: genConfig.temperature,
                    maxOutputTokens: genConfig.maxTokens,
                    thinkingLevel: genConfig.thinkingLevel
                  },
                  env.GOOGLE_API_KEY
                );
                fullContent = fallbackResult.ok ? fallbackResult.content : "I had trouble with that. Could you rephrase?";
                fullContent = stripFillerOpening(fullContent);
                const words = fullContent.split(" ");
                for (let i = 0; i < words.length; i += 3) {
                  const chunk = words.slice(i, i + 3).join(" ") + " ";
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}

`)
                  );
                  await new Promise((r) => setTimeout(r, 15));
                }
              }
              const searchQuery2 = searchQueries.length > 0 ? searchQueries.join(" | ") : void 0;
              const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion2(fullContent);
              fullContent = cleanContent.replace(/<!--SAVE:.*?-->/gs, "").replace(/<!--SAVE:.*$/s, "").trim();
              const save_suggestion = smartSuggestion || null;
              const latency = Date.now() - t0;
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    done: true,
                    full_content: fullContent,
                    save_suggestion,
                    sources: sources2,
                    search_query: searchQuery2,
                    latency_ms: latency,
                    fetchedUrl
                  })}

`
                )
              );
              console.log("[GeneralChat:Streaming] Complete", {
                latency_ms: latency,
                content_length: fullContent.length
              });
              if (body.chatId && authenticatedUserId && fullContent) {
                const summaryPromise = (async () => {
                  try {
                    const prevSummaryRes = await fetch(
                      `${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}&select=running_summary`,
                      {
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                        }
                      }
                    );
                    const prevData = prevSummaryRes?.ok ? await prevSummaryRes.json().catch(() => []) : [];
                    const previousSummary = prevData?.[0]?.running_summary || null;
                    await generateRunningSummary(
                      messages.filter((m) => m.role !== "system"),
                      fullContent,
                      body.chatId,
                      null,
                      previousSummary,
                      env,
                      userTimezone
                    );
                  } catch (err) {
                    console.warn("[GeneralChat] Summary failed:", err.message);
                  }
                })();
                ctx.waitUntil(summaryPromise);
                const extractionPromise = (async () => {
                  try {
                    const chatRes = await fetch(
                      `${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}&select=saved_extraction_ids,dismissed_extractions`,
                      {
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                        }
                      }
                    );
                    const chatData = chatRes.ok ? await chatRes.json().catch(() => []) : [];
                    const existing = chatData?.[0] || {};
                    const handledIds = [
                      ...existing.saved_extraction_ids || [],
                      ...existing.dismissed_extractions || []
                    ];
                    const supaHeaders = {
                      apikey: env.SUPABASE_SERVICE_KEY,
                      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                    };
                    const [summaryRes, todosRes, habitsRes] = await Promise.all([
                      fetch(
                        `${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}&select=running_summary`,
                        { headers: supaHeaders }
                      ),
                      fetch(
                        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${authenticatedUserId}&completed_at=is.null&select=title&limit=50`,
                        { headers: supaHeaders }
                      ),
                      fetch(
                        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${authenticatedUserId}&archived_at=is.null&select=title,frequency&limit=30`,
                        { headers: supaHeaders }
                      )
                    ]);
                    const summaryData = summaryRes.ok ? await summaryRes.json().catch(() => []) : [];
                    const runningSummary = summaryData?.[0]?.running_summary || null;
                    const todosData = todosRes.ok ? await todosRes.json().catch(() => []) : [];
                    const habitsData = habitsRes.ok ? await habitsRes.json().catch(() => []) : [];
                    const existingLines = [
                      ...todosData.map((t) => `- [todo] ${t.title}`),
                      ...habitsData.map(
                        (h) => `- [habit] ${h.title}${h.frequency ? ` (${h.frequency})` : ""}`
                      )
                    ];
                    const existingItemsBlock = existingLines.length > 0 ? `
ITEMS ALREADY TRACKED IN THE USER'S SYSTEM (do NOT re-extract these or close paraphrases):
${existingLines.join("\n")}
` : "";
                    const allMsgs = [
                      ...messages.filter((m) => m.role !== "system"),
                      { role: "assistant", content: fullContent }
                    ];
                    const recentMsgs = allMsgs.slice(-20);
                    const conversationText = recentMsgs.map((m) => `${m.role === "user" ? "User" : "Gremly"}: ${m.content}`).join("\n\n");
                    const todayStr = new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: userTimezone
                    }).format(/* @__PURE__ */ new Date());
                    const extractionPromptText = `Today is ${todayStr}.

You are analyzing a conversation to identify items worth saving in a productivity app.
${runningSummary ? `
CONVERSATION CONTEXT (summary of earlier messages not shown below):
${runningSummary}
` : ""}
CONVERSATION:
${conversationText}

${handledIds.length > 0 ? "ALREADY HANDLED (skip these): " + handledIds.join(", ") : ""}
${existingItemsBlock}
Extract ONLY items where the user showed clear commitment or intent:
TODO: Actions the user committed to (concrete verb + object). NOT AI suggestions the user didn't affirm.
HABIT: Only with explicit frequency or stop/quit intent + trackable behavior.
NOTE: Ideas the user was excited about, decisions reached, recommendations they engaged with.
EVENT: Upcoming dates, deadlines, exams, appointments, trips, or time-bound milestones the user mentioned. Extract these even without exact dates. Capturing that something is coming up is valuable context for other conversations.
DO NOT EXTRACT: explorations, emotional processing, unaffirmed AI suggestions, small talk, or items that match or closely paraphrase something already tracked in the system above.

TEMPORAL METADATA (EVENT items only \u2014 set all to null for todo/habit/note):
- date_text: The user's exact words about timing, preserved verbatim (e.g. "next Thursday", "sometime in June", "before the end of the semester")
- resolved_date: Best estimate as YYYY-MM-DD. Today is ${todayStr}. For vague references, pick the midpoint of the likely range.
- date_confidence: "exact" if user gave a specific date, "approximate" if they gave a rough timeframe, "unknown" if mentioned without any timing
- date_range_start: Earliest plausible YYYY-MM-DD
- date_range_end: Latest plausible YYYY-MM-DD

WRITING STYLE for title and body fields:
- Title should be a short action phrase: "Book restaurant for Saturday" not "Restaurant Booking Task"
- Body should be a brief casual note, one sentence max
- Never write "the user" or "user" \u2014 write as if jotting a note for them: "Getting up early for a 20-min run" not "User committed to getting up early"
- If no meaningful body beyond the title, set body to null

Also generate a chat title (3-6 words) and a one-sentence summary that covers the ENTIRE conversation \u2014 not just the most recent messages. Use the CONVERSATION CONTEXT above to include earlier topics. The summary should capture the full arc of what was discussed.
Return ONLY valid JSON:
{"extractions":[{"id":"<8chars>","type":"todo|habit|note|event","title":"...","body":"...","due_date":"YYYY-MM-DD or null","frequency":"string or null","confidence":0-100,"date_text":"string or null","resolved_date":"YYYY-MM-DD or null","date_confidence":"exact|approximate|unknown or null","date_range_start":"YYYY-MM-DD or null","date_range_end":"YYYY-MM-DD or null"}],"chat_summary":{"title":"...","summary":"..."}}`;
                    let extractResult = null;
                    try {
                      const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                          "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                          model: "gpt-4.1-mini",
                          messages: [
                            { role: "system", content: extractionPromptText },
                            { role: "user", content: "Extract items from the conversation above." }
                          ],
                          max_tokens: 500,
                          temperature: 0.1
                        })
                      });
                      if (extractRes.ok) {
                        const extractJson = await extractRes.json();
                        const rawContent = extractJson.choices?.[0]?.message?.content || "";
                        extractResult = safeParseJson(rawContent);
                      }
                    } catch (parseErr) {
                      console.warn("[GeneralChat] Extraction parse error:", parseErr.message);
                    }
                    if (extractResult) {
                      await fetch(`${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}`, {
                        method: "PATCH",
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                          "Content-Type": "application/json",
                          Prefer: "return=minimal"
                        },
                        body: JSON.stringify({
                          extracted_items: extractResult.extractions || [],
                          auto_title: extractResult.chat_summary?.title || null
                        })
                      });
                      console.log("[GeneralChat] Extraction complete", {
                        items: (extractResult.extractions || []).length,
                        title: extractResult.chat_summary?.title
                      });
                      try {
                        const eventExtractions = (extractResult.extractions || []).filter(
                          (e) => e.type === "event" && e.title
                        );
                        if (eventExtractions.length > 0 && authenticatedUserId) {
                          const confidenceRank = { exact: 3, approximate: 2, unknown: 1 };
                          const supaHeaders2 = {
                            apikey: env.SUPABASE_SERVICE_KEY,
                            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                            "Content-Type": "application/json",
                            Prefer: "return=minimal"
                          };
                          const existingRes = await fetch(
                            `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?user_id=eq.${authenticatedUserId}&status=eq.active&select=id,title,date_confidence`,
                            { headers: supaHeaders2 }
                          );
                          const existingAnchors = existingRes.ok ? await existingRes.json() : [];
                          let savedCount = 0;
                          for (const evt of eventExtractions) {
                            const evtTitleLower = evt.title.toLowerCase();
                            const match = existingAnchors.find((a) => {
                              const aTitleLower = a.title.toLowerCase();
                              return aTitleLower.includes(evtTitleLower) || evtTitleLower.includes(aTitleLower);
                            });
                            if (match) {
                              const existingRank = confidenceRank[match.date_confidence] || 0;
                              const newRank = confidenceRank[evt.date_confidence] || 0;
                              if (newRank > existingRank) {
                                const patchBody = {
                                  resolved_date: evt.resolved_date || null,
                                  date_confidence: evt.date_confidence || "unknown",
                                  date_range_start: evt.date_range_start || null,
                                  date_range_end: evt.date_range_end || null,
                                  date_text: evt.date_text || null,
                                  updated_at: (/* @__PURE__ */ new Date()).toISOString()
                                };
                                if (evt.date_confidence === "exact") {
                                  patchBody.resolved_at = (/* @__PURE__ */ new Date()).toISOString();
                                }
                                await fetch(
                                  `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?id=eq.${match.id}`,
                                  {
                                    method: "PATCH",
                                    headers: supaHeaders2,
                                    body: JSON.stringify(patchBody)
                                  }
                                );
                                savedCount++;
                              }
                            } else {
                              const nowIso = (/* @__PURE__ */ new Date()).toISOString();
                              await fetch(`${env.SUPABASE_URL}/rest/v1/user_temporal_anchors`, {
                                method: "POST",
                                headers: supaHeaders2,
                                body: JSON.stringify({
                                  user_id: authenticatedUserId,
                                  title: evt.title,
                                  description: evt.body || null,
                                  category: "event",
                                  date_text: evt.date_text || null,
                                  resolved_date: evt.resolved_date || null,
                                  date_confidence: evt.date_confidence || "unknown",
                                  date_range_start: evt.date_range_start || null,
                                  date_range_end: evt.date_range_end || null,
                                  source_chat_id: body.chatId || null,
                                  source_message: lastUserMsg ? lastUserMsg.slice(0, 500) : null,
                                  space_id: body.spaceId || null,
                                  created_at: nowIso,
                                  updated_at: nowIso
                                })
                              });
                              savedCount++;
                            }
                          }
                          if (savedCount > 0) {
                            console.log("[GeneralChat] Temporal anchors saved", {
                              count: savedCount
                            });
                          }
                        }
                      } catch (anchorErr) {
                        console.warn(
                          "[GeneralChat] Temporal anchor persistence failed:",
                          anchorErr.message
                        );
                      }
                    }
                  } catch (err) {
                    console.warn("[GeneralChat] Extraction failed:", err.message);
                  }
                })();
                ctx.waitUntil(extractionPromise);
              }
            } catch (streamErr) {
              console.log("[GeneralChat:Streaming] Stream error", { error: String(streamErr) });
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ error: String(streamErr), done: true, full_content: fullContent })}

`
                )
              );
            }
          } catch (outerErr) {
            console.error("[GeneralChat:Streaming] Outer error", { error: String(outerErr) });
            try {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ error: String(outerErr), done: true })}

`
                )
              );
            } catch {
            }
          } finally {
            try {
              await writer.close();
            } catch {
            }
          }
        })();
        return new Response(readable, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive"
          }
        });
      }
      const t0NonStream = Date.now();
      if (isSpaceChatLane) {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }
        let sessionContextStr = "";
        let userProfile = null;
        let cachedDomains = [];
        let spaceEntities = null;
        let spaceTodayActivity = null;
        if (authenticatedUserId) {
          try {
            const [chatContext, profile, domains, entities, todayAct] = await Promise.all([
              buildChatContext(
                authenticatedUserId,
                "space",
                {
                  spaceId: body.spaceId,
                  timezone: userTimezone,
                  currentChatId: body.chatId || null
                },
                env
              ),
              getUserProfile(authenticatedUserId, env),
              getCachedDomainNames(authenticatedUserId, env),
              fetchSpaceEntities(authenticatedUserId, body.spaceId, env),
              buildTodayActivity(authenticatedUserId, userTimezone, env)
            ]);
            sessionContextStr = chatContext;
            userProfile = profile;
            cachedDomains = domains;
            spaceEntities = entities;
            spaceTodayActivity = todayAct;
            if (sessionContextStr || userProfile) {
              console.log("[SpaceChat:NonStreaming] Context loaded", {
                userId: authenticatedUserId.slice(0, 8),
                sessionContextLength: sessionContextStr?.length || 0,
                hasUserProfile: !!userProfile,
                hasSpaceEntities: !!spaceEntities
              });
            }
          } catch (err) {
            console.error("[SpaceChat:NonStreaming] Context error", err);
          }
        }
        const context = { runningSummary: body.runningSummary || "" };
        const spaceContext = spaceEntities ? formatSpaceEntities(spaceEntities) : null;
        const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
        const previousExchange = extractPreviousExchange(messages);
        const triage = await triageMessage({
          userMessage: lastUserMsg,
          previousExchange,
          spaceName: body.spaceName || void 0,
          runningSummary: body.runningSummary || "",
          chatType: "space",
          env,
          domainNames: cachedDomains,
          profileSnippet: userProfile?.profileText?.slice(0, 150) || "",
          messageCount: messages.length
        });
        console.log("[SpaceChat:NonStreaming:Triage]", {
          mode: triage.mode,
          search: triage.search,
          personal: triage.personal,
          depth: triage.depth,
          source: triage.source,
          messagePreview: lastUserMsg.slice(0, 80)
        });
        const genConfig = buildSpaceChatSystemPrompt(
          triage,
          context,
          body.spaceName,
          spaceContext,
          body.accountCreatedAt,
          sessionContextStr,
          userProfile?.profileText,
          userTimezone,
          spaceTodayActivity
        );
        const triageMessages = [
          { role: "system", content: genConfig.systemPrompt },
          ...messages.filter((m) => m.role !== "system")
        ];
        const searchPolicy = getSearchPolicy(triage.search);
        const nonStreamConfig = {
          temperature: genConfig.temperature,
          maxOutputTokens: genConfig.maxTokens,
          thinkingLevel: genConfig.thinkingLevel
        };
        if (searchPolicy.attachTool) {
          nonStreamConfig.tools = [makeWebSearchTool(userTimezone)];
        }
        const geminiResult = await geminiGenerate(
          genConfig.systemPrompt,
          triageMessages,
          nonStreamConfig,
          env.GOOGLE_API_KEY
        );
        if (!geminiResult.ok) {
          return j(
            {
              error: geminiResult.error || "gemini_error",
              code: geminiResult.status
            },
            200
          );
        }
        let content2 = geminiResult.content;
        let sources2 = void 0;
        let searchQuery2 = void 0;
        const toolCall = geminiResult.functionCalls?.[0] || null;
        if (toolCall?.name === "web_search") {
          try {
            searchQuery2 = toolCall.args?.query;
            console.log("[SpaceChat:NonStreaming] Web search triggered", { query: searchQuery2 });
            const searchT0 = Date.now();
            const searchResults = await executeTavilySearch(searchQuery2, env.TAVILY_API_KEY);
            const searchLatency = Date.now() - searchT0;
            console.log("[SpaceChat:NonStreaming] Search complete", {
              resultCount: searchResults?.results?.length || 0,
              latency: searchLatency
            });
            if (searchResults && searchResults.results.length > 0) {
              const originalContents = convertMessages(triageMessages);
              const followUpContents = buildFollowUpContents(
                originalContents,
                geminiResult.parts || [],
                [
                  {
                    name: "web_search",
                    id: toolCall.id,
                    response: { results: formatSearchBrief(searchResults) }
                  }
                ]
              );
              const followUpResult = await geminiGenerate(
                genConfig.systemPrompt,
                [],
                {
                  temperature: genConfig.temperature,
                  maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                  thinkingLevel: genConfig.thinkingLevel,
                  nativeContents: followUpContents
                },
                env.GOOGLE_API_KEY
              );
              content2 = followUpResult.ok ? followUpResult.content : "";
              sources2 = searchResults.results.map((r) => ({ title: r.title, url: r.url }));
            }
          } catch (searchErr) {
            console.log("[SpaceChat:NonStreaming] Search error:", searchErr);
          }
        }
        content2 = stripFillerOpening(content2);
        const { suggestion: save_suggestion, cleanContent } = extractSaveSuggestion2(content2);
        content2 = cleanContent;
        content2 = content2.replace(/<!--SAVE:.*?-->/gs, "").replace(/<!--SAVE:.*$/s, "").trim();
        const latency = Date.now() - t0NonStream;
        console.log("[SpaceChat:NonStreaming] Complete", {
          latency_ms: latency,
          content_length: content2.length,
          used_search: !!searchQuery2,
          triage_mode: triage.mode
        });
        if (body.chatId && authenticatedUserId && content2) {
          const summaryPromise = (async () => {
            try {
              const prevSummaryRes = await fetch(
                `${env.SUPABASE_URL}/rest/v1/space_chats?id=eq.${body.chatId}&select=running_summary`,
                {
                  headers: {
                    apikey: env.SUPABASE_SERVICE_KEY,
                    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
                  }
                }
              );
              const prevData = prevSummaryRes?.ok ? await prevSummaryRes.json().catch(() => []) : [];
              const previousSummary = prevData?.[0]?.running_summary || null;
              await generateRunningSummary(
                messages.filter((m) => m.role !== "system"),
                content2,
                body.chatId,
                body.spaceName || null,
                previousSummary,
                env,
                userTimezone
              );
            } catch (err) {
              console.warn("[SpaceChat:NonStreaming] Running summary failed:", err.message);
            }
          })();
          ctx.waitUntil(summaryPromise);
        }
        return j({
          content: content2,
          model: "gemini-3-flash-preview",
          usage: geminiResult.usage || null,
          save_suggestion: save_suggestion || null,
          sources: sources2,
          search_query: searchQuery2
        });
      }
      const rlFallback = await checkIpRateLimit(request, env, "misc", 30);
      if (!rlFallback.allowed) return rateLimitResponse("misc", rlFallback.count, rlFallback.limit);
      const lastUserMsgNonStream = messages.filter((m) => m.role === "user").pop()?.content || "";
      const nonStreamModel = actualModel;
      const nonStreamMaxTokens = maxTokensValue;
      const openaiPayload = { model: nonStreamModel, messages, temperature, stream: false };
      if (nonStreamModel === "gpt-4.1" || nonStreamModel === "gpt-4o") {
        openaiPayload.max_completion_tokens = nonStreamMaxTokens;
      } else {
        openaiPayload.max_tokens = nonStreamMaxTokens;
      }
      const nonStreamUrl = "https://api.openai.com/v1/chat/completions";
      const nonStreamAuthKey = key;
      const res = await fetch(nonStreamUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nonStreamAuthKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(openaiPayload)
      });
      const oj = await res.json();
      if (!res.ok) {
        return j(
          { error: oj && (oj.error?.message || oj.message) || "openai_error", code: res.status },
          200
        );
      }
      let content = oj?.choices?.[0]?.message?.content ?? oj?.choices?.[0]?.text ?? "";
      let sources = void 0;
      let searchQuery = void 0;
      if (type === "classify") {
        const rawContent = oj?.choices?.[0]?.message?.content ?? "";
        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          return j({ error: "classification_unparsable", raw: rawContent }, 200);
        }
        const VALID_BUCKETS = [
          "todo",
          "habit",
          "log-journal",
          "log-idea",
          "log-general",
          "unsorted"
        ];
        let bucket = (parsed.bucket || "").toLowerCase().trim();
        if (!VALID_BUCKETS.includes(bucket)) bucket = "log-general";
        let confidence = Number(parsed.confidence ?? 50);
        if (!Number.isFinite(confidence)) confidence = 50;
        confidence = Math.max(0, Math.min(100, confidence));
        const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).slice(0, 5) : [];
        const title = typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : originalText.split(/\s+/).slice(0, 7).join(" ");
        return j({
          id: String(oj.id || crypto.randomUUID()),
          classification: {
            bucket,
            type: bucket === "todo" ? "todo" : bucket === "habit" ? "habit" : "log",
            subtype: bucket === "log-journal" ? "journal" : bucket === "log-idea" ? "idea" : bucket === "log-general" ? "general" : null,
            category: bucket,
            tags,
            confidence,
            title
          },
          aiTitle: title,
          aiTagsDebug: tags
        });
      }
      return j({
        id: String((oj.id || "").replace(/^chatcmpl-/, "cmpl-")),
        content,
        model: oj.model,
        usage: oj.usage || null,
        save_suggestion: null,
        sources,
        search_query: searchQuery
      });
    } catch (err) {
      return j({ error: "proxy_error", detail: String(err?.message || "unknown") }, 200);
    }
  }
};
function j(obj, status = 200) {
  return Response.json ? Response.json(obj, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  }) : new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    }
  });
}
__name(j, "j");
function safeParseJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
__name(safeParseJson, "safeParseJson");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
