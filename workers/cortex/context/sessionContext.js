/**
 * Session Context - Queries user's recent activity from Supabase
 * 
 * Provides cross-entity awareness: what the user dropped today, their habit health,
 * upcoming milestones, recent wins, and overall week summary.
 * 
 * Results are cached in Cloudflare KV (5 min TTL) to avoid repeated queries.
 */

// ============================================================================
// CACHE LAYER
// ============================================================================

const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Get session context with caching
 * @param {string} userId - Supabase user ID
 * @param {object} env - Cloudflare worker env (CONTEXT_CACHE, SUPABASE_URL, SUPABASE_SERVICE_KEY)
 * @returns {Promise<SessionContextData>}
 */
export async function getSessionContext(userId, env) {
  const cacheKey = `session:${userId}`;
  
  // Try cache first
  try {
    const cached = await env.CONTEXT_CACHE.get(cacheKey);
    if (cached) {
      console.log('[SessionContext] Cache hit', { userId: userId.slice(0, 8) });
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('[SessionContext] Cache read error', err);
  }
  
  console.log('[SessionContext] Cache miss, querying Supabase', { userId: userId.slice(0, 8) });
  
  // Query Supabase
  const context = await querySessionContext(userId, env);
  
  // Store in cache
  try {
    await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(context), { 
      expirationTtl: CACHE_TTL_SECONDS 
    });
  } catch (err) {
    console.error('[SessionContext] Cache write error', err);
  }
  
  return context;
}

/**
 * Invalidate session context cache (call after user makes changes)
 * @param {string} userId
 * @param {object} env
 */
export async function invalidateSessionContext(userId, env) {
  const cacheKey = `session:${userId}`;
  try {
    await env.CONTEXT_CACHE.delete(cacheKey);
    console.log('[SessionContext] Cache invalidated', { userId: userId.slice(0, 8) });
  } catch (err) {
    console.error('[SessionContext] Cache invalidation error', err);
  }
}

// ============================================================================
// SUPABASE QUERIES
// ============================================================================

/**
 * Query all session context data from Supabase
 * @param {string} userId
 * @param {object} env
 * @returns {Promise<SessionContextData>}
 */
async function querySessionContext(userId, env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
  
  // Run all queries in parallel
  const [todaysDrops, weekSummary, habitHealth, upcomingMilestones, recentWins] = await Promise.all([
    queryTodaysDrops(supabaseUrl, headers, userId),
    queryWeekSummary(supabaseUrl, headers, userId),
    queryHabitHealth(supabaseUrl, headers, userId),
    queryUpcomingMilestones(supabaseUrl, headers, userId),
    queryRecentWins(supabaseUrl, headers, userId),
  ]);
  
  return {
    todaysDrops,
    weekSummary,
    habitHealth,
    upcomingMilestones,
    recentWins,
    queriedAt: new Date().toISOString(),
  };
}

/**
 * Query items created in the last 24 hours
 */
async function queryTodaysDrops(supabaseUrl, headers, userId) {
  // We need to query todos, notes, and habits separately and combine
  // Using Supabase REST API
  
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Query todos
    const todosRes = await fetch(
      `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${yesterday}&archived=eq.false&select=title,created_at&order=created_at.desc&limit=5`,
      { headers }
    );
    const todos = todosRes.ok ? await todosRes.json() : [];
    
    // Query notes (including mood for journals)
    const notesRes = await fetch(
      `${supabaseUrl}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${yesterday}&archived=eq.false&select=title,body,subtype,mood,created_at&order=created_at.desc&limit=5`,
      { headers }
    );
    const notes = notesRes.ok ? await notesRes.json() : [];
    
    // Query habits
    const habitsRes = await fetch(
      `${supabaseUrl}/rest/v1/habits?owner_id=eq.${userId}&created_at=gte.${yesterday}&archived=eq.false&select=name,created_at&order=created_at.desc&limit=3`,
      { headers }
    );
    const habits = habitsRes.ok ? await habitsRes.json() : [];
    
    // Combine and format
    const drops = [
      ...todos.map(t => ({ title: t.title, type: 'todo', created_at: t.created_at })),
      ...notes.map(n => ({ 
        title: n.title || (n.body ? n.body.slice(0, 40) : 'Note'), 
        type: n.subtype === 'journal' ? 'journal' : 'note',
        mood: n.mood,
        created_at: n.created_at 
      })),
      ...habits.map(h => ({ title: h.name, type: 'habit', created_at: h.created_at })),
    ];
    
    // Sort by created_at desc and limit to 8
    drops.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return drops.slice(0, 8);
    
  } catch (err) {
    console.error('[SessionContext] queryTodaysDrops error', err);
    return [];
  }
}

/**
 * Query week summary: todos created, completed, and stuck
 */
async function queryWeekSummary(supabaseUrl, headers, userId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Get all todos for counting
    const res = await fetch(
      `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&select=created_at,completed_at,sweep_reschedule_count,archived&limit=500`,
      { headers }
    );
    
    if (!res.ok) return { createdWeek: 0, completedWeek: 0, stuckCount: 0 };
    
    const todos = await res.json();
    
    const createdWeek = todos.filter(t => 
      !t.archived && new Date(t.created_at) > new Date(weekAgo)
    ).length;
    
    const completedWeek = todos.filter(t => 
      t.completed_at && new Date(t.completed_at) > new Date(weekAgo)
    ).length;
    
    const stuckCount = todos.filter(t => 
      !t.archived && !t.completed_at && (t.sweep_reschedule_count || 0) >= 3
    ).length;
    
    return { createdWeek, completedWeek, stuckCount };
    
  } catch (err) {
    console.error('[SessionContext] queryWeekSummary error', err);
    return { createdWeek: 0, completedWeek: 0, stuckCount: 0 };
  }
}

/**
 * Query habit health: completion rates over last 7 days
 */
async function queryHabitHealth(supabaseUrl, headers, userId) {
  try {
    // Get active habits
    const habitsRes = await fetch(
      `${supabaseUrl}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,last_checked_in_at&limit=10`,
      { headers }
    );
    
    if (!habitsRes.ok) return [];
    
    const habits = await habitsRes.json();
    if (habits.length === 0) return [];
    
    // Get habit progress for last 7 days
    const habitIds = habits.map(h => h.id);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    const progressRes = await fetch(
      `${supabaseUrl}/rest/v1/habit_progress?habit_id=in.(${habitIds.join(',')})&occurred_day=gte.${weekAgoStr}&select=habit_id,occurred_day,count`,
      { headers }
    );
    
    const progress = progressRes.ok ? await progressRes.json() : [];
    
    // Calculate completions per habit
    const completionMap = {};
    for (const p of progress) {
      completionMap[p.habit_id] = (completionMap[p.habit_id] || 0) + 1;
    }
    
    // Build habit health array
    const habitHealth = habits.map(h => ({
      name: h.name,
      frequency: h.frequency,
      completionsThisWeek: completionMap[h.id] || 0,
      lastCheckedIn: h.last_checked_in_at,
    }));
    
    // Sort: struggling habits first (lowest completions)
    habitHealth.sort((a, b) => a.completionsThisWeek - b.completionsThisWeek);
    
    return habitHealth.slice(0, 5);
    
  } catch (err) {
    console.error('[SessionContext] queryHabitHealth error', err);
    return [];
  }
}

/**
 * Query upcoming milestones (next 30 days)
 */
async function queryUpcomingMilestones(supabaseUrl, headers, userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];
    
    // Query milestones with space names
    const res = await fetch(
      `${supabaseUrl}/rest/v1/space_milestones?owner_id=eq.${userId}&date=gte.${today}&date=lte.${thirtyDaysStr}&select=title,date,space_id&order=date.asc&limit=3`,
      { headers }
    );
    
    if (!res.ok) return [];
    
    const milestones = await res.json();
    if (milestones.length === 0) return [];
    
    // Get space names
    const spaceIds = [...new Set(milestones.map(m => m.space_id))];
    const spacesRes = await fetch(
      `${supabaseUrl}/rest/v1/spaces?id=in.(${spaceIds.join(',')})&select=id,name`,
      { headers }
    );
    
    const spaces = spacesRes.ok ? await spacesRes.json() : [];
    const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s.name]));
    
    return milestones.map(m => ({
      title: m.title,
      date: m.date,
      spaceName: spaceMap[m.space_id] || 'Unknown',
      daysRemaining: Math.ceil((new Date(m.date) - new Date()) / (1000 * 60 * 60 * 24)),
    }));
    
  } catch (err) {
    console.error('[SessionContext] queryUpcomingMilestones error', err);
    return [];
  }
}

/**
 * Query recent wins (completed todos in last 7 days)
 */
async function queryRecentWins(supabaseUrl, headers, userId) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString();
  
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&completed_at=gte.${weekAgoStr}&select=title,completed_at&order=completed_at.desc&limit=3`,
      { headers }
    );
    
    if (!res.ok) return [];
    
    return await res.json();
    
  } catch (err) {
    console.error('[SessionContext] queryRecentWins error', err);
    return [];
  }
}

// ============================================================================
// TYPES (for documentation)
// ============================================================================

/**
 * @typedef {Object} SessionContextData
 * @property {Array<{title: string, type: string, mood?: string[], created_at: string}>} todaysDrops
 * @property {{createdWeek: number, completedWeek: number, stuckCount: number}} weekSummary
 * @property {Array<{name: string, frequency: string, completionsThisWeek: number, lastCheckedIn: string|null}>} habitHealth
 * @property {Array<{title: string, date: string, spaceName: string, daysRemaining: number}>} upcomingMilestones
 * @property {Array<{title: string, completed_at: string}>} recentWins
 * @property {string} queriedAt
 */
