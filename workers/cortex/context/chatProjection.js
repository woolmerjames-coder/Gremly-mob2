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
import { getLifePack, recallForMessage } from './lifeContext.js';
import { formatWeekAhead, readWeekAhead } from './weekAhead.js';
import { fetchDatedAhead, formatDatedAhead } from './datedAhead.js';
import { db } from '../../shared/db.js';
import { loadLifePack, lifePackText } from '../../shared/lifePack.js';

/** The person's latest message text from a chat request body. */
export function lastUserText(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  const last = msgs.filter((m) => m && m.role === 'user').pop();
  const c = last?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join(' ');
  return '';
}

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
      tone: dco?.tone || dco?.daily_focus?.tone || null,
      dayType: dco?.day_type || dco?.daily_focus?.day_type || null,
      todayFocus: dco?.today_focus || dco?.daily_focus?.today_focus || [],
      alsoMatters: Array.isArray(dco?.also_matters) ? dco.also_matters : [],
      voiceNote: dco?.voice_note || null,
      weeklyIntention: dco?.weekly_intention?.title || null,
      leadStory: dco?.lead_story || dco?.daily_focus?.lead_story || null,
      secondary: dco?.daily_focus?.secondary || null,
      namedAnchors: dco?.named_anchors || dco?.daily_focus?.named_anchors || [],
      activeToday: dco?.active_today || null,
      briefHeadline: dco?.brief_headline || null,
      cancelledCalendarIds: dco?.cancelled_calendar_ids || [],
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

    const [recentNotes, recentTodos, recentHabitProgress, recentEventRows] = await Promise.all([
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

      // Recent calendar events (last 72h)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=gte.${threeDaysAgo.split('T')[0]}&select=title,target_date,event_time,location,space_id&order=target_date.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const delta = {
      recentDrops: Array.isArray(recentNotes) ? recentNotes : [],
      recentCompletions: Array.isArray(recentTodos) ? recentTodos : [],
      recentHabitActivity: Array.isArray(recentHabitProgress) ? recentHabitProgress : [],
      recentEvents: Array.isArray(recentEventRows) ? recentEventRows : [],
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(delta), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Recent delta loaded for ${userId.slice(0, 8)}: ${delta.recentDrops.length} drops, ${delta.recentCompletions.length} completions, ${delta.recentEvents.length} events`,
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
 * The morning's read of the day (the DCO) for chat: what leads today and why,
 * the headline, the focus, what else matters and how Gremly should sound.
 * A read from an earlier morning says which day it was for, so it is never
 * taken as today's. The people come from the people records (THEIR LIFE
 * RIGHT NOW), not from here.
 */
export function formatDailyFocusForChat(focus, today = null) {
  if (!focus) return '';
  const stale = today && focus.date && focus.date !== today;
  const parts = [
    stale
      ? `=== THE LATEST MORNING READ (for ${focus.date}, not today; today's is not written yet) ===`
      : `=== TODAY'S PICTURE (the morning read${focus.date ? ` of ${focus.date}` : ''}) ===`,
  ];

  const lead = focus.leadStory;
  if (lead?.what) {
    parts.push(`What leads the day: ${lead.what}${lead.why_today ? ` ${lead.why_today}` : ''}`);
  }
  if (focus.briefHeadline) parts.push(`Headline: "${focus.briefHeadline}"`);
  if (focus.todayFocus && focus.todayFocus.length > 0) {
    parts.push(`Focus: ${focus.todayFocus.join(' ')}`);
  }
  if (focus.alsoMatters && focus.alsoMatters.length > 0) {
    parts.push(`Also matters: ${focus.alsoMatters.join(' ')}`);
  }
  if (focus.weeklyIntention)
    parts.push(`Their intention for this week, in their words: "${focus.weeklyIntention}"`);
  if (focus.tone) parts.push(`Tone of the day: ${focus.tone}`);
  if (focus.voiceNote) parts.push(`How to sound: ${focus.voiceNote}`);

  parts.push('');
  parts.push('Use this context naturally, like a friend who knows their situation.');

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
    } else if (lane === 'general' || lane === 'world' || lane === 'chapter') {
      // General/world/chapter chat: all domains at summary level, high-importance threads get more detail
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

  if (delta.recentEvents?.length > 0) {
    parts.push('=== RECENT EVENTS (last 72h) ===');
    for (const e of delta.recentEvents.slice(0, 6)) {
      const loc = e.location ? ` (${e.location})` : '';
      parts.push(`  ${e.target_date}: ${e.title}${loc}`);
    }
  }

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

/** Recent conversations other than this one: how many, and how far back. */
const RECENT_CHATS = 3;
const RECENT_CHAT_DAYS = 14;

/**
 * How much of their life each lane carries, in characters. Input is cheap on
 * the chat models (a tenth of a cent buys about 40,000 characters on Luna), so
 * the limit is set by what a model reads well, not by cost; it is measured
 * by the writer test (scripts/writer-test) and the life replay before it
 * moves. CHAT_CONTEXT_CHARS sets Ask Gremly's on its own.
 */
export const CONTEXT_BUDGET = { general: 120000, scoped: 80000, other: 40000 };

export function contextBudget(lane, env = {}) {
  if (lane === 'general') {
    const set = Number(env?.CHAT_CONTEXT_CHARS);
    return Number.isFinite(set) && set > 0 ? set : CONTEXT_BUDGET.general;
  }
  if (lane === 'space' || lane === 'world' || lane === 'chapter') return CONTEXT_BUDGET.scoped;
  return CONTEXT_BUDGET.other;
}

/**
 * Fit the blocks to the budget by size alone, never by meaning. Blocks keep
 * their order. When they are over, the unprotected blocks give way first,
 * the longest first, a whole line at a time from its end; the protected ones
 * (their life, their story, today's picture and what bears on the message)
 * give way only when they alone are over, and then the same way. A block
 * that loses lines says so, and what was cut is logged, so a cut is never
 * silent.
 *
 * @param blocks [{ key, text, keep }]
 * @returns { text, cut: [{ key, from, to }] }
 */
export function fitContextBlocks(blocks, budget) {
  const MORE = '(more not shown)';
  const live = blocks
    .filter((b) => b && b.text)
    .map((b) => {
      const lines = String(b.text).split('\n');
      // at[k]: the length of the first k lines joined
      const at = [0];
      lines.forEach((l, i) => at.push(at[i] + l.length + (i ? 1 : 0)));
      return { key: b.key, keep: !!b.keep, lines, at, k: lines.length };
    });
  // a block keeping k of its lines, with a closing line when any are left out
  const lenOf = (b, k = b.k) => b.at[k] + (k < b.lines.length ? MORE.length + 1 : 0);
  let total = live.reduce((n, b) => n + lenOf(b), 0) + Math.max(0, live.length - 1) * 2;
  const shrink = (pool) => {
    while (total > budget) {
      // the longest block with a line to give; its first line, the header, stays
      let b = null;
      for (const x of pool) if (x.k > 1 && (!b || lenOf(x) > lenOf(b))) b = x;
      if (!b) return;
      total += lenOf(b, b.k - 1) - lenOf(b);
      b.k -= 1;
    }
  };
  shrink(live.filter((b) => !b.keep));
  shrink(live.filter((b) => b.keep));
  const cut = live
    .filter((b) => b.k < b.lines.length)
    .map((b) => ({ key: b.key, from: lenOf(b, b.lines.length), to: lenOf(b) }));
  let text = live
    .map((b) => [...b.lines.slice(0, b.k), ...(b.k < b.lines.length ? [MORE] : [])].join('\n'))
    .join('\n\n');
  // headers alone over the budget: the last thing to give
  if (text.length > budget) {
    cut.push({ key: 'all', from: text.length, to: budget });
    text = `${text.slice(0, budget)}\n${MORE}`;
  }
  return { text, cut };
}

const LIFE_NOW_TTL_SECONDS = 600;

/**
 * Their life right now (shared/lifePack.js), as every surface that talks to
 * them reads it: yesterday, what falls today, what they have said lately,
 * how their life runs and the people who come up most. What is ahead comes
 * from the dated things block. KV cached for ten minutes, and dropped with
 * the rest of chat's cache when the pipeline changes what it holds; never
 * stops the turn, and says when it cannot be read.
 */
export async function readLifeNowForChat(userId, env, { today, timezone }) {
  // one entry per person, holding its day, so the pipeline can drop it (shared/chatCache.js)
  const cacheKey = `life-now:${userId}`;
  try {
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        const hit = JSON.parse(cached);
        if (hit?.day === today && typeof hit.text === 'string') return hit.text;
      }
    }
    const text = lifePackText(await loadLifePack(db(env), userId, { today, tz: timezone }), {
      leave: ['ahead'],
    });
    if (env.CONTEXT_CACHE)
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify({ day: today, text }), {
        expirationTtl: LIFE_NOW_TTL_SECONDS,
      }).catch((err) =>
        // the next message reads it again: slower, never wrong
        console.warn(
          `[ChatProjection] could not keep their life in the cache: ${err?.message || err}`,
        ),
      );
    return text;
  } catch (err) {
    console.warn(
      `[ALERT][ChatProjection] could not read their life for ${String(userId).slice(0, 8)}: ${err?.message || err}`,
    );
    return '';
  }
}

/** Their life right now as a context block, with how to use it. */
export function formatLifeNow(text) {
  if (!text) return '';
  return `=== THEIR LIFE RIGHT NOW (what a friend would know today; draw on it the way a friend would when it fits what they said, never list it, and never tell them as news what they told you; an item marked private is used only when it bears on what they are talking about, in their own words, and is never opened with) ===\n${text}`;
}

/**
 * Build the complete chat context string for injection into a system prompt.
 *
 * Their life comes first: today's picture, their life right now and their
 * story, then the week and what is dated ahead, recent conversations and
 * activity, the Life Map threads, and last what bears on this message. The
 * blocks are fitted to the lane's budget (fitContextBlocks), never cut from
 * the end.
 *
 * @param {string} userId
 * @param {string} lane - 'general' | 'space' | 'world' | 'chapter' | 'entity' | 'habit_builder'
 * @param {object} opts
 * @param {string} opts.spaceId - For space chat
 * @param {string} opts.entityTitle - For entity chat
 * @param {string} opts.entitySpaceId - For entity chat (space the entity belongs to, if any)
 * @param {object} [opts.keep] - Ask Gremly: given an object, the week ahead it read is kept on it as keep.week
 * @param {object} env
 * @returns {Promise<string>} Formatted context string ready for system prompt injection
 */
export async function buildChatContext(userId, lane, opts, env) {
  if (!userId) return '';

  try {
    const timezone = opts?.timezone || 'UTC';
    const currentChatId = opts?.currentChatId;

    // Fetch all context in parallel. Ask Gremly also reads the week ahead,
    // from the person's day when the caller knows it (opts.today, a day or a
    // promise of one: workers/shared/day.js).
    const focusRead = getDailyFocusForChat(userId, env);
    const todayRead = Promise.resolve(opts?.today).catch(() => null);
    const dayRead = todayRead.then(
      (d) => d || new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()),
    );
    const weekRead =
      lane === 'general'
        ? readWeekAhead(userId, timezone, env, {
            cancelledIds: focusRead.then((f) => f?.cancelledCalendarIds || []),
            today: todayRead,
          })
        : Promise.resolve(null);
    const [
      lifeMap,
      dailyFocus,
      recentDelta,
      datedAhead,
      chatSummaries,
      lifePack,
      recall,
      week,
      day,
      lifeNow,
    ] = await Promise.all([
      getLifeMapForChat(userId, env),
      focusRead,
      fetchRecentActivityDelta(userId, env),
      fetchDatedAhead(userId, env, { today: todayRead, timezone }),
      fetchRecentChatSummaries(userId, currentChatId, env),
      getLifePack(userId, env),
      opts?.message
        ? recallForMessage(userId, opts.message, env, { today: todayRead, timezone })
        : Promise.resolve(''),
      weekRead,
      dayRead,
      dayRead.then((today) => readLifeNowForChat(userId, env, { today, timezone })),
    ]);

    // The week itself is kept for the caller that asked (Ask Gremly's agent
    // gives its todos their ids, agent/chat.js).
    if (opts?.keep) opts.keep.week = week;

    const blocks = [
      // today's picture: what leads, the headline, focus, also matters, how to sound
      { key: 'today', text: formatDailyFocusForChat(dailyFocus, day), keep: true },
      // their life right now: yesterday, today, lately, how it runs, their people
      { key: 'life_now', text: formatLifeNow(lifeNow), keep: true },
      // who they are: story, Chapters, app use, the brief, open questions, corrections
      { key: 'story', text: lifePack, keep: true },
      // the week ahead, day by day: their calendar and planned todos
      { key: 'week', text: formatWeekAhead(week) },
      // dated things ahead from the ledger, each item once (context/datedAhead.js)
      { key: 'dated', text: formatDatedAhead(datedAhead) },
      // other recent conversations, for continuity across chats
      { key: 'chats', text: chatSummaries ? formatRecentChatSummaries(chatSummaries) : '' },
      // the last few days: drops, completions, events
      { key: 'recent', text: formatRecentDelta(recentDelta) },
      // Life Map threads, tiered by lane
      { key: 'life_map', text: formatLifeMapForChat(lifeMap, lane, opts) },
      // what Gremly remembers that bears on this message: last, as it changes every message
      { key: 'recall', text: recall, keep: true },
    ];

    const budget = contextBudget(lane, env);
    const { text, cut } = fitContextBlocks(blocks, budget);
    if (cut.length) {
      console.warn(
        `[ChatProjection] Context fitted for ${userId.slice(0, 8)} [${lane}] to ${budget} chars: ${cut.map((c) => `${c.key} ${c.from} to ${c.to}`).join(', ')}`,
      );
    }
    console.log(
      `[ChatProjection] Built context for ${userId.slice(0, 8)} [${lane}]: ${text.length} chars`,
    );
    return text;
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
 * Fetch recent chat summaries from other conversations for cross-chat continuity.
 * KV cached 5 minutes.
 */
export async function fetchRecentChatSummaries(userId, currentChatId, env) {
  if (!userId) return null;
  // the cache holds one list for every chat, so the chat this is comes out after it
  const others = (list) => {
    const rows = (Array.isArray(list) ? list : []).filter(
      (c) => !currentChatId || c.id !== currentChatId,
    );
    return rows.length ? rows.slice(0, RECENT_CHATS) : null;
  };

  try {
    const cacheKey = `recent-chat-summaries:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[ChatProjection] Chat summaries cache hit for ${userId.slice(0, 8)}`);
        return others(JSON.parse(cached));
      }
    }
    // only conversations from the last RECENT_CHAT_DAYS: an older one is not recent
    const since = new Date(Date.now() - RECENT_CHAT_DAYS * 864e5).toISOString();

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const url =
      `${env.SUPABASE_URL}/rest/v1/scope_chats` +
      `?user_id=eq.${userId}` +
      `&running_summary=not.is.null` +
      `&updated_at=gte.${since}` +
      `&select=id,running_summary,auto_title,updated_at` +
      `&order=updated_at.desc` +
      `&limit=${RECENT_CHATS + 1}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error('[ChatProjection] Chat summaries fetch failed:', response.statusText);
      return null;
    }

    const summaries = await response.json();
    if (!Array.isArray(summaries)) return null;

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(summaries), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Chat summaries loaded for ${userId.slice(0, 8)}: ${summaries.length} chats`,
    );
    return others(summaries);
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
    "These are summaries of other recent conversations. Use this context to maintain continuity, so the user never has to repeat themselves across chats. When the user asks about their week, recent experiences, or what's been going on, draw from these summaries: they capture decisions, emotional signals, and context that other data sources miss. Don't reference them unprompted in unrelated topics.",
    '',
  ];

  for (const s of summaries) {
    const title = s.auto_title || 'Untitled chat';
    const when = s.updated_at ? ` (last ${String(s.updated_at).slice(0, 10)})` : '';
    lines.push(`• ${title}${when}: ${s.running_summary}`);
  }

  return lines.join('\n');
}

// ============================================================================
// WORLD ENTITY CONTEXT (F.5.b.2)
// ============================================================================

/**
 * Fetch world-scoped entities (todos, habits, notes) via drop_world_links.
 * KV cached 5 minutes.
 */
export async function fetchWorldEntities(userId, worldId, env) {
  if (!userId || !worldId) return null;

  try {
    const cacheKey = `world-entities:${userId}:${worldId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(
          `[ChatProjection] World entities cache hit for ${userId.slice(0, 8)}:${worldId.slice(0, 8)}`,
        );
        return JSON.parse(cached);
      }
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch world metadata and its drop links in parallel
    const [worldRes, linksRes] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/worlds?id=eq.${worldId}&owner_id=eq.${userId}&select=id,name,archetypes&limit=1`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/drop_world_links?world_id=eq.${worldId}&owner_id=eq.${userId}&select=drop_id,drop_type&limit=100`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const world = Array.isArray(worldRes) && worldRes.length > 0 ? worldRes[0] : null;
    if (!world) return null;

    const links = Array.isArray(linksRes) ? linksRes : [];
    const todoIds = links.filter((l) => l.drop_type === 'todo').map((l) => l.drop_id);
    const habitIds = links.filter((l) => l.drop_type === 'habit').map((l) => l.drop_id);
    const noteIds = links.filter((l) => l.drop_type === 'note').map((l) => l.drop_id);

    const [todos, habits, notes] = await Promise.all([
      todoIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/todos?id=in.(${todoIds.join(',')})&is_complete=eq.false&select=title,target_date&limit=15`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
      habitIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/habits?id=in.(${habitIds.join(',')})&archived=eq.false&select=title,frequency&limit=10`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
      noteIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/notes?id=in.(${noteIds.join(',')})&archived=eq.false&select=title,subtype,target_date&limit=10`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const entities = {
      world,
      todos: Array.isArray(todos) ? todos : [],
      habits: Array.isArray(habits) ? habits : [],
      notes: Array.isArray(notes) ? notes : [],
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(entities), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] World entities loaded for ${userId.slice(0, 8)}:${worldId.slice(0, 8)}: ${entities.todos.length} todos, ${entities.habits.length} habits, ${entities.notes.length} notes`,
    );
    return entities;
  } catch (error) {
    console.error('[ChatProjection] World entities error:', error);
    return null;
  }
}

/**
 * Format world entities into a plain-text context string.
 */
export function formatWorldEntities(worldData) {
  if (!worldData?.world) return '';
  const { world, todos = [], habits = [], notes = [] } = worldData;

  const parts = [`=== WORLD: "${world.name}" ===`];
  if (world.archetypes?.length > 0) {
    parts.push(`Archetypes: ${world.archetypes.join(', ')}`);
  }

  const events = notes.filter((n) => n.subtype === 'event');
  const otherNotes = notes.filter((n) => n.subtype !== 'event');

  if (events.length > 0) {
    parts.push('Key dates:');
    for (const e of events) {
      parts.push(`  \u2022 ${e.title}${e.target_date ? ` \u2014 ${e.target_date}` : ''}`);
    }
  }

  const datedTodos = todos.filter((t) => t.target_date);
  const undatedTodos = todos.filter((t) => !t.target_date);

  if (datedTodos.length > 0) {
    parts.push('Upcoming tasks:');
    for (const t of datedTodos) {
      parts.push(`  \u2022 ${t.title} \u2014 due ${t.target_date}`);
    }
  }
  if (undatedTodos.length > 0) {
    parts.push(`Other tasks: ${undatedTodos.map((t) => t.title).join(', ')}`);
  }

  if (habits.length > 0) {
    parts.push('Habits:');
    for (const h of habits) {
      parts.push(`  \u2022 ${h.title}${h.frequency ? ` (${h.frequency})` : ''}`);
    }
  }

  if (otherNotes.length > 0) {
    parts.push(`Notes: ${otherNotes.map((n) => n.title).join(', ')}`);
  }

  return parts.join('\n');
}

// ============================================================================
// CHAPTER ENTITY CONTEXT (F.5.b.2)
// ============================================================================

/**
 * Fetch chapter-scoped entities (todos, habits, notes) via drop_chapter_links.
 * Also fetches the chapter itself to verify ownership and get metadata.
 * KV cached 5 minutes.
 */
export async function fetchChapterEntities(userId, chapterId, env) {
  if (!userId || !chapterId) return null;

  try {
    const cacheKey = `chapter-entities:${userId}:${chapterId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(
          `[ChatProjection] Chapter entities cache hit for ${userId.slice(0, 8)}:${chapterId.slice(0, 8)}`,
        );
        return JSON.parse(cached);
      }
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch chapter metadata (owner check) and drop links in parallel
    const [chapterRes, linksRes] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/chapters?id=eq.${chapterId}&owner_id=eq.${userId}&select=id,title,summary,target_description,phase,start_date,end_date&limit=1`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/drop_chapter_links?chapter_id=eq.${chapterId}&select=drop_id,drop_type&limit=100`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const chapter = Array.isArray(chapterRes) && chapterRes.length > 0 ? chapterRes[0] : null;
    if (!chapter) return null;

    const links = Array.isArray(linksRes) ? linksRes : [];
    const todoIds = links.filter((l) => l.drop_type === 'todo').map((l) => l.drop_id);
    const habitIds = links.filter((l) => l.drop_type === 'habit').map((l) => l.drop_id);
    const noteIds = links.filter((l) => l.drop_type === 'note').map((l) => l.drop_id);

    const [todos, habits, notes] = await Promise.all([
      todoIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/todos?id=in.(${todoIds.join(',')})&is_complete=eq.false&select=title,target_date&limit=15`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
      habitIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/habits?id=in.(${habitIds.join(',')})&archived=eq.false&select=title,frequency&limit=10`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
      noteIds.length > 0
        ? fetch(
            `${env.SUPABASE_URL}/rest/v1/notes?id=in.(${noteIds.join(',')})&archived=eq.false&select=title,subtype,target_date&limit=10`,
            { headers },
          )
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const entities = {
      chapter,
      todos: Array.isArray(todos) ? todos : [],
      habits: Array.isArray(habits) ? habits : [],
      notes: Array.isArray(notes) ? notes : [],
    };

    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(entities), { expirationTtl: 300 });
    }

    console.log(
      `[ChatProjection] Chapter entities loaded for ${userId.slice(0, 8)}:${chapterId.slice(0, 8)}: ${entities.todos.length} todos, ${entities.habits.length} habits, ${entities.notes.length} notes`,
    );
    return entities;
  } catch (error) {
    console.error('[ChatProjection] Chapter entities error:', error);
    return null;
  }
}

/**
 * Format chapter entities into a plain-text context string.
 */
export function formatChapterEntities(chapterData) {
  if (!chapterData?.chapter) return '';
  const { chapter, todos = [], habits = [], notes = [] } = chapterData;

  const parts = [`=== CHAPTER: "${chapter.title}" ===`];
  if (chapter.summary) parts.push(chapter.summary);
  if (chapter.target_description) parts.push(`Goal: ${chapter.target_description}`);
  if (chapter.phase) parts.push(`Phase: ${chapter.phase}`);

  const dateRange = [chapter.start_date, chapter.end_date].filter(Boolean);
  if (dateRange.length > 0) {
    parts.push(`Timeline: ${dateRange.join(' \u2192 ')}`);
  }

  const events = notes.filter((n) => n.subtype === 'event');
  const otherNotes = notes.filter((n) => n.subtype !== 'event');

  if (events.length > 0) {
    parts.push('Key dates:');
    for (const e of events) {
      parts.push(`  \u2022 ${e.title}${e.target_date ? ` \u2014 ${e.target_date}` : ''}`);
    }
  }

  const datedTodos = todos.filter((t) => t.target_date);
  const undatedTodos = todos.filter((t) => !t.target_date);

  if (datedTodos.length > 0) {
    parts.push('Upcoming tasks:');
    for (const t of datedTodos) {
      parts.push(`  \u2022 ${t.title} \u2014 due ${t.target_date}`);
    }
  }
  if (undatedTodos.length > 0) {
    parts.push(`Other tasks: ${undatedTodos.map((t) => t.title).join(', ')}`);
  }

  if (habits.length > 0) {
    parts.push('Habits:');
    for (const h of habits) {
      parts.push(`  \u2022 ${h.title}${h.frequency ? ` (${h.frequency})` : ''}`);
    }
  }

  if (otherNotes.length > 0) {
    parts.push(`Notes: ${otherNotes.map((n) => n.title).join(', ')}`);
  }

  return parts.join('\n');
}
