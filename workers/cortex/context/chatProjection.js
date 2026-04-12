/**
 * Chat Projection — Life Map-powered context for all chat lanes
 *
 * Replaces getDcoContext + getSessionContext with:
 * 1. Life Map (accumulated understanding, cached 2hr)
 * 2. Daily Focus from DCO (today's editorial context, cached 2hr)
 * 3. Tiny recency delta (last 72h drops + completions, cached 5min)
 *
 * Formats context per-lane with tiered detail:
 * - Entity chat: entity is primary, matching Life Map thread as background
 * - Space chat: matching domain gets full detail, others get summaries
 * - Habit builder: profile + daily context, lighter Life Map
 */

// ============================================================================
// DATA FETCHERS (with KV caching)
// ============================================================================

/**
 * Fetch the user's Life Map. KV cached 2 hours.
 */
export async function getLifeMapForChat(userId, env) {
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
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      console.error('[ChatProjection] Life Map fetch failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      console.log('[ChatProjection] No Life Map found for user');
      return null;
    }

    const lifeMap = data[0].life_map;

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(lifeMap), { expirationTtl: 7200 });
    }

    // Cache domain names separately for fast triage access
    if (lifeMap?.domains && env.CONTEXT_CACHE) {
      const domainNames = lifeMap.domains
        .filter((d) => d.attention !== 'background')
        .map((d) => d.name);
      await env.CONTEXT_CACHE.put(`life-map-domains:${userId}`, JSON.stringify(domainNames), {
        expirationTtl: 3600,
      }).catch(() => {});
    }

    console.log(
      `[ChatProjection] Life Map loaded for ${userId.slice(0, 8)}: ${lifeMap?.domains?.length || 0} domains`,
    );
    return lifeMap;
  } catch (error) {
    console.error('[ChatProjection] Life Map error:', error);
    return null;
  }
}

/**
 * Fetch today's daily focus from user_daily_state. KV cached 2 hours.
 */
export async function getDailyFocusForChat(userId, env) {
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
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      console.error('[ChatProjection] Daily focus fetch failed:', response.statusText);
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
      weekMoodArc: dco?.week_mood_arc || null,
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(focusData), { expirationTtl: 7200 });
    }

    console.log(
      `[ChatProjection] Daily focus loaded for ${userId.slice(0, 8)}, tone: ${focusData.tone}`,
    );
    return focusData;
  } catch (error) {
    console.error('[ChatProjection] Daily focus error:', error);
    return null;
  }
}

/**
 * Fetch recent activity delta (last 72 hours). KV cached 5 minutes.
 * Lightweight — just the most recent drops, completions, and habit activity.
 */
export async function fetchRecentActivityDelta(userId, env) {
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
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const [recentNotes, recentTodos, recentHabitProgress] = await Promise.all([
      // Recent drops (notes created in last 72h, non-events)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=neq.event&archived=eq.false&created_at=gte.${threeDaysAgo}&select=title,subtype,mood,created_at,space_id&order=created_at.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Recently completed todos (last 72h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&completed_at=gte.${threeDaysAgo}&select=title,completed_at,space_id&order=completed_at.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Recent habit completions (last 48h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_at=gte.${twoDaysAgo}&select=habit_id,occurred_day&limit=20`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const delta = {
      recentDrops: Array.isArray(recentNotes) ? recentNotes : [],
      recentCompletions: Array.isArray(recentTodos) ? recentTodos : [],
      recentHabitActivity: Array.isArray(recentHabitProgress) ? recentHabitProgress : [],
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(delta), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Recent delta loaded for ${userId.slice(0, 8)}: ${delta.recentDrops.length} drops, ${delta.recentCompletions.length} completions`,
    );
    return delta;
  } catch (error) {
    console.error('[ChatProjection] Recent delta error:', error);
    return null;
  }
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format daily focus for chat context injection.
 */
function formatDailyFocusForChat(focus) {
  if (!focus) return '';

  const parts = ['=== CURRENT LIFE CONTEXT (generated daily) ==='];

  if (focus.lifeMoment) parts.push(`Life moment: ${focus.lifeMoment}`);
  if (focus.tone) parts.push(`Tone today: ${focus.tone}`);
  if (focus.briefHeadline) parts.push(`Today's headline: "${focus.briefHeadline}"`);

  if (focus.leadStory) {
    parts.push(
      `Lead story: ${focus.leadStory.domain} → ${focus.leadStory.thread}: ${focus.leadStory.detail}`,
    );
  }

  if (focus.todayFocus && focus.todayFocus.length > 0) {
    parts.push(`Today's focus: ${focus.todayFocus.join(', ')}`);
  }

  const people = (focus.namedAnchors || []).filter((a) => a.type === 'person').map((a) => a.label);
  if (people.length > 0) {
    parts.push(`Named people: ${people.join(', ')}`);
  }

  // Week recap — concrete events from earlier this week
  if (focus.weekRecap && focus.weekRecap.length > 0) {
    parts.push('');
    parts.push('=== THIS WEEK SO FAR ===');
    const sorted = [...focus.weekRecap].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    for (const entry of sorted) {
      parts.push(`  ${entry.date}: ${entry.event}`);
    }
    if (focus.weekMoodArc) {
      parts.push(`Mood this week: ${focus.weekMoodArc}`);
    }
    parts.push(
      "Reference this when the user asks about their week, recent events, or what they've been up to. These are concrete things that happened.",
    );
  }

  parts.push('');
  parts.push('Use this context naturally — like a friend who knows their situation.');

  return parts.join('\n');
}

/**
 * Format Life Map threads for chat context.
 * Tiered detail based on lane and relevance.
 *
 * @param {object} lifeMap - The life_map JSONB
 * @param {string} lane - 'entity' | 'space' | 'habit_builder'
 * @param {object} opts
 * @param {string} opts.spaceId - For space chat: show this domain in full
 * @param {string} opts.entityTitle - For entity chat: match against thread names
 * @param {string} opts.entitySpaceId - For entity chat: the entity's space if assigned
 */
function formatLifeMapForChat(lifeMap, lane, opts = {}) {
  if (!lifeMap?.domains) return '';

  const parts = ['=== LIFE MAP — WHAT MATTERS TO THIS PERSON ==='];

  for (const domain of lifeMap.domains) {
    const isMatchingDomain =
      (lane === 'space' && opts.spaceId && domain.space_id === opts.spaceId) ||
      (lane === 'entity' && opts.entitySpaceId && domain.space_id === opts.entitySpaceId);

    if (isMatchingDomain) {
      // FULL DETAIL for the matching domain
      parts.push(`\nDOMAIN: "${domain.name}" [RELEVANT TO THIS CONVERSATION]`);

      for (const thread of domain.threads || []) {
        if (thread.lifecycle === 'archived') continue;

        parts.push(
          `\n  ${thread.name}: ${thread.status}, ${thread.momentum}, ${thread.importance} importance`,
        );
        if (thread.summary) {
          parts.push(`    "${thread.summary}"`);
        }
        if (thread.recent_update) {
          parts.push(`    Latest: "${thread.recent_update}"`);
        }
        // Include last 3 evidence entries for depth
        if (thread.evidence?.length > 0) {
          const recent = thread.evidence.slice(-3);
          for (const e of recent) {
            parts.push(`    ${e.date}: ${e.signal}`);
          }
        }
      }
    } else if (lane === 'general') {
      // General chat: all domains at summary level, high-importance threads get more detail
      const activeThreads = (domain.threads || []).filter(
        (t) => t.lifecycle === 'active' || t.lifecycle === 'dormant',
      );
      if (activeThreads.length === 0) continue;

      parts.push(`\n${domain.name}:`);
      for (const thread of activeThreads) {
        const isHigh = thread.importance === 'high';
        parts.push(
          `  ${thread.name}: ${thread.status}, ${thread.momentum}${isHigh ? ' [important]' : ''}`,
        );
        if (isHigh && thread.summary) {
          parts.push(`    "${thread.summary}"`);
        }
        if (isHigh && thread.recent_update) {
          parts.push(`    Latest: "${thread.recent_update}"`);
        }
      }
    } else {
      // SUMMARY for other domains
      const activeThreads = (domain.threads || []).filter(
        (t) => t.lifecycle === 'active' || t.lifecycle === 'dormant',
      );

      if (activeThreads.length === 0) continue;

      parts.push(`\n${domain.name}:`);
      for (const thread of activeThreads) {
        parts.push(
          `  ${thread.name}: ${thread.status}, ${thread.momentum}${thread.importance === 'high' ? ' [important]' : ''}`,
        );
        // One-line summary for non-matching domains
        if (thread.summary && lane !== 'habit_builder' && thread.importance === 'high') {
          const firstSentence = thread.summary.split(/\.\s/)[0] + '.';
          parts.push(`    "${firstSentence}"`);
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Format recent activity delta for chat context.
 */
function formatRecentDelta(delta) {
  if (!delta) return '';

  const parts = [];

  if (delta.recentDrops.length > 0) {
    parts.push('=== RECENT ACTIVITY (last 24-72h) ===');
    for (const d of delta.recentDrops.slice(0, 6)) {
      const mood = d.mood?.length > 0 ? ` [mood: ${d.mood.join(', ')}]` : '';
      const date = d.created_at ? d.created_at.split('T')[0] : '';
      parts.push(`  ${date}: [${d.subtype || 'note'}] ${d.title}${mood}`);
    }
  }

  if (delta.recentCompletions.length > 0) {
    const titles = delta.recentCompletions
      .slice(0, 4)
      .map((t) => t.title)
      .join(', ');
    parts.push(`  Recent completions: ${titles}`);
  }

  return parts.join('\n');
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Build the complete chat context string for injection into a system prompt.
 * Replaces getDcoContext + getSessionContext + buildDcoContextHeader + buildSessionContextString.
 *
 * @param {string} userId
 * @param {string} lane - 'entity' | 'space' | 'habit_builder'
 * @param {object} opts
 * @param {string} opts.spaceId - For space chat
 * @param {string} opts.entityTitle - For entity chat
 * @param {string} opts.entitySpaceId - For entity chat (space the entity belongs to, if any)
 * @param {object} env
 * @returns {Promise<string>} Formatted context string ready for system prompt injection
 */
export async function buildChatContext(userId, lane, opts, env) {
  if (!userId) return '';

  try {
    const timezone = opts?.timezone || 'UTC';
    const currentChatId = opts?.currentChatId;

    // Fetch all context in parallel
    const [lifeMap, dailyFocus, recentDelta, temporalAnchors, chatSummaries] = await Promise.all([
      getLifeMapForChat(userId, env),
      getDailyFocusForChat(userId, env),
      fetchRecentActivityDelta(userId, env),
      fetchTemporalAnchors(userId, timezone, env),
      fetchRecentChatSummaries(userId, currentChatId, env),
    ]);

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(new Date());

    const parts = [];

    // 1. Daily focus (life moment, tone, today's headline)
    const focusStr = formatDailyFocusForChat(dailyFocus);
    if (focusStr) parts.push(focusStr);

    // 2. Temporal anchors (upcoming events/deadlines from conversations)
    if (temporalAnchors) {
      const anchorsStr = formatTemporalAnchors(temporalAnchors, todayStr);
      if (anchorsStr) parts.push(anchorsStr);
    }

    // 3. Recent chat summaries (cross-chat continuity)
    if (chatSummaries) {
      const summariesStr = formatRecentChatSummaries(chatSummaries);
      if (summariesStr) parts.push(summariesStr);
    }

    // 4. Life Map threads (tiered by lane relevance)
    const lifeMapStr = formatLifeMapForChat(lifeMap, lane, opts);
    if (lifeMapStr) parts.push(lifeMapStr);

    // 5. Recent activity delta
    const deltaStr = formatRecentDelta(recentDelta);
    if (deltaStr) parts.push(deltaStr);

    const result = parts.join('\n\n');

    // Token safety — generous limits since Life Map summaries are dense and valuable
    const MAX_CONTEXT_CHARS = lane === 'general' ? 12000 : lane === 'space' ? 10000 : 6000;
    if (result.length > MAX_CONTEXT_CHARS) {
      console.warn(
        `[ChatProjection] Context truncated for ${userId.slice(0, 8)}: ${result.length} → ${MAX_CONTEXT_CHARS} chars`,
      );
      return result.slice(0, MAX_CONTEXT_CHARS) + '\n...(truncated)';
    }

    console.log(
      `[ChatProjection] Built context for ${userId.slice(0, 8)} [${lane}]: ${result.length} chars`,
    );
    return result;
  } catch (error) {
    console.error('[ChatProjection] Error building context:', error);
    return '';
  }
}

// ============================================================================
// SPACE ENTITY CONTEXT
// ============================================================================

/**
 * Fetch space-scoped entities (todos, events, habits). KV cached 5 minutes.
 */
export async function fetchSpaceEntities(userId, spaceId, env) {
  if (!userId || !spaceId) return null;

  try {
    const cacheKey = `space-entities:${userId}:${spaceId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(
          `[ChatProjection] Space entities cache hit for ${userId.slice(0, 8)}:${spaceId.slice(0, 8)}`,
        );
        return JSON.parse(cached);
      }
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const [todosRes, eventsRes, habitsRes] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=eq.${spaceId}&is_complete=eq.false&select=title,target_date,scheduled_date&order=target_date.asc.nullslast&limit=15`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=eq.${spaceId}&subtype=eq.event&archived=eq.false&select=title,target_date,body&order=target_date.asc.nullslast&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=eq.${spaceId}&archived=eq.false&select=title,frequency,target_days&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const entities = {
      todos: Array.isArray(todosRes) ? todosRes : [],
      events: Array.isArray(eventsRes) ? eventsRes : [],
      habits: Array.isArray(habitsRes) ? habitsRes : [],
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(entities), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Space entities loaded for ${userId.slice(0, 8)}:${spaceId.slice(0, 8)}: ${entities.todos.length} todos, ${entities.events.length} events, ${entities.habits.length} habits`,
    );
    return entities;
  } catch (error) {
    console.error('[ChatProjection] Space entities error:', error);
    return null;
  }
}

/**
 * Format space entities into a plain-text context string.
 */
export function formatSpaceEntities(entities) {
  if (!entities) return '';
  const { todos = [], events = [], habits = [] } = entities;
  if (todos.length === 0 && events.length === 0 && habits.length === 0) return '';

  const parts = [];

  if (events.length > 0) {
    parts.push('Key dates:');
    for (const e of events) {
      parts.push(`  \u2022 ${e.title} \u2014 ${e.target_date || 'no date'}`);
    }
  }

  const datedTodos = todos.filter((t) => t.target_date || t.scheduled_date);
  const undatedTodos = todos.filter((t) => !t.target_date && !t.scheduled_date);

  if (datedTodos.length > 0) {
    parts.push('Upcoming tasks:');
    for (const t of datedTodos) {
      const dateLabel = t.target_date ? `due ${t.target_date}` : `scheduled ${t.scheduled_date}`;
      parts.push(`  \u2022 ${t.title} \u2014 ${dateLabel}`);
    }
  }

  if (undatedTodos.length > 0) {
    const titles = undatedTodos.map((t) => t.title).join(', ');
    parts.push(`Other tasks: ${titles}`);
  }

  if (habits.length > 0) {
    parts.push('Habits:');
    for (const h of habits) {
      const freq = h.frequency ? ` (${h.frequency})` : '';
      parts.push(`  \u2022 ${h.title}${freq}`);
    }
  }

  return parts.join('\n');
}

/**
 * Fetch active temporal anchors for a user. KV cached 5 minutes.
 * Enriches each anchor with daysAway and timeDescription.
 */
export async function fetchTemporalAnchors(userId, timezone, env) {
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
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_temporal_anchors?user_id=eq.${userId}&status=eq.active&order=resolved_date.asc.nullslast&limit=15`,
      { headers },
    );

    if (!response.ok) {
      console.error('[ChatProjection] Temporal anchors fetch failed:', response.statusText);
      return null;
    }

    const anchors = await response.json();
    if (!Array.isArray(anchors) || anchors.length === 0) return null;

    // Get today's date in the user's timezone
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone || 'UTC',
    }).format(new Date());

    const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();

    const enriched = anchors
      .map((a) => {
        let daysAway = null;
        if (a.resolved_date) {
          const resolvedMs = new Date(a.resolved_date + 'T00:00:00Z').getTime();
          daysAway = Math.round((resolvedMs - todayMs) / (24 * 60 * 60 * 1000));
        }

        let timeDescription = 'date unknown';
        if (daysAway !== null) {
          if (daysAway === 0) timeDescription = 'today';
          else if (daysAway === 1) timeDescription = 'tomorrow';
          else if (daysAway > 1 && daysAway <= 7) timeDescription = `in ${daysAway} days`;
          else if (daysAway > 7) timeDescription = `in ~${Math.round(daysAway / 7)} weeks`;
          else if (daysAway === -1) timeDescription = 'yesterday';
          else timeDescription = `${Math.abs(daysAway)} days ago`;
        }

        return { ...a, daysAway, timeDescription };
      })
      .filter((a) => {
        if (a.daysAway === null) return true; // unknown — always keep
        if (a.date_confidence === 'exact') return a.daysAway >= -1;
        if (a.date_confidence === 'approximate') return a.daysAway >= -3;
        return true; // unknown confidence — keep
      });

    if (enriched.length === 0) return null;

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(enriched), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Temporal anchors loaded for ${userId.slice(0, 8)}: ${enriched.length} active`,
    );
    return enriched;
  } catch (error) {
    console.error('[ChatProjection] Temporal anchors error:', error);
    return null;
  }
}

/**
 * Format temporal anchors into a plain-text context string for LLM injection.
 */
export function formatTemporalAnchors(anchors, _todayStr) {
  if (!anchors || anchors.length === 0) return '';

  const lines = [
    '=== UPCOMING EVENTS & DEADLINES (from conversations) ===',
    'Note: Dates marked "approximate" are estimates, not confirmed. Dates marked "unknown" have no confirmed date. Never state approximate or unknown dates as fact. Use hedging language for approximate dates (e.g. "around", "roughly"). For unknown dates, consider naturally asking when it is.',
    '',
  ];

  for (const a of anchors) {
    let line = '';
    if (a.date_confidence === 'exact') {
      line = `• ${a.title} — ${a.resolved_date} (${a.timeDescription})`;
    } else if (a.date_confidence === 'approximate') {
      line = `• ${a.title} — approximately ${a.timeDescription}`;
      if (a.date_text) line += ` ("${a.date_text}")`;
      if (a.date_range_start && a.date_range_end) {
        line += ` [range: ${a.date_range_start} to ${a.date_range_end}]`;
      }
    } else {
      line = `• ${a.title} — date unknown`;
      if (a.date_text) line += ` ("${a.date_text}")`;
      line += ' [consider asking for the date]';
    }
    lines.push(line);
    if (a.description) {
      lines.push(`  Context: ${a.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Fetch recent chat summaries from other conversations for cross-chat continuity.
 * KV cached 5 minutes.
 */
export async function fetchRecentChatSummaries(userId, currentChatId, env) {
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
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    let url =
      `${env.SUPABASE_URL}/rest/v1/space_chats` +
      `?user_id=eq.${userId}` +
      `&running_summary=not.is.null` +
      `&select=id,running_summary,auto_title,updated_at` +
      `&order=updated_at.desc` +
      `&limit=3`;

    if (currentChatId) {
      url += `&id=neq.${currentChatId}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error('[ChatProjection] Chat summaries fetch failed:', response.statusText);
      return null;
    }

    const summaries = await response.json();
    if (!Array.isArray(summaries) || summaries.length === 0) return null;

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(summaries), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Chat summaries loaded for ${userId.slice(0, 8)}: ${summaries.length} chats`,
    );
    return summaries;
  } catch (error) {
    console.error('[ChatProjection] Chat summaries error:', error);
    return null;
  }
}

/**
 * Format recent chat summaries into a plain-text context string for LLM injection.
 */
export function formatRecentChatSummaries(summaries) {
  if (!summaries || summaries.length === 0) return '';

  const lines = [
    '=== RECENT CONVERSATIONS (other chats with this user) ===',
    "These are summaries of other recent conversations. Use this context to maintain continuity — the user shouldn't have to repeat themselves across chats. But don't reference these chats explicitly unless the user brings them up.",
    '',
  ];

  for (const s of summaries) {
    const title = s.auto_title || 'Untitled chat';
    lines.push(`• ${title}: ${s.running_summary}`);
  }

  return lines.join('\n');
}
