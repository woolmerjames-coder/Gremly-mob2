/**
 * Fetches the user's current DCO (Daily Context Object) from user_daily_state.
 * Uses KV caching (2hr TTL) since DCOs only change daily.
 * Returns null if no DCO exists — not critical, callers fall back gracefully.
 */

export async function getDcoContext(userId, env) {
  if (!userId) {
    console.log('[DcoContext] No userId provided');
    return null;
  }

  try {
    // Check KV cache first
    const cacheKey = `dco-context:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[DcoContext] Cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }

    // Cache miss - fetch from Supabase
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&select=dco&order=date.desc&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      console.error('[DcoContext] Fetch failed:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.log('[DcoContext] No DCO found for user');
      return null;
    }

    const dco = data[0].dco;

    const dcoData = {
      lifeMoment: dco.life_moment || null,
      tone: dco.tone || null,
      todayFocus: dco.today_focus || null,
      namedAnchors: dco.named_anchors || [],
      activeToday: dco.active_today || null,
      briefHeadline: dco.brief_headline || null,
      generatedAt: dco.generated_at || null,
    };
    console.log('[DcoContext] DCO loaded, tone:', dcoData.tone, 'generated:', dcoData.generatedAt);

    // Store in KV cache with 2 hour TTL (DCOs only change daily)
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(dcoData), { expirationTtl: 7200 });
      console.log(`[DcoContext] Cached for ${userId.slice(0, 8)}`);
    }

    return dcoData;
  } catch (error) {
    console.error('[DcoContext] Error:', error);
    return null;
  }
}
