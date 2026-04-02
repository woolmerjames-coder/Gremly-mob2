/**
 * Fetches the user's synthesized profile from user_profiles table
 * This is generated nightly by the inngest-jobs worker
 *
 * Uses KV caching (1 hour TTL) since profiles only change nightly
 * Returns object: { profileText, relationshipStartedAt, generatedAt, signals }
 */

export async function getUserProfile(userId, env) {
  if (!userId) {
    console.log('[UserProfile] No userId provided');
    return null;
  }

  try {
    // Check KV cache first (v2 key to avoid old format conflicts)
    const cacheKey = `user-profile:v2:${userId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[UserProfile] Cache hit for ${userId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }

    // Cache miss - fetch from Supabase
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text,generated_at,relationship_started_at,signals,identity`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      console.error('[UserProfile] Fetch failed:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.log('[UserProfile] No profile found for user');
      return null;
    }

    const profileData = {
      profileText: data[0].profile_text,
      relationshipStartedAt: data[0].relationship_started_at,
      generatedAt: data[0].generated_at,
      signals: data[0].signals,
      identity: data[0].identity || {},
    };
    console.log('[UserProfile] Profile loaded, generated:', profileData.generatedAt);

    // Store in KV cache with 1 hour TTL
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(profileData), { expirationTtl: 3600 });
      console.log(`[UserProfile] Cached for ${userId.slice(0, 8)}`);
    }

    return profileData;
  } catch (error) {
    console.error('[UserProfile] Error:', error);
    return null;
  }
}
