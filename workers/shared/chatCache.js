/**
 * Chat (the cortex worker) caches each person's profile, Life Map, today's DCO,
 * dated things ahead and their life right now for up to two hours, in the CONTEXT_CACHE KV namespace both
 * workers bind. When either worker changes any of them, those entries are
 * dropped so the very next chat message reads the new version.
 */
export const CHAT_CACHE_KEYS = [
  (u) => `user-profile:v2:${u}`,
  (u) => `life-map-chat:${u}`,
  (u) => `life-map-domains:${u}`,
  (u) => `daily-focus-chat:${u}`,
  (u) => `dco-context:${u}`,
  (u) => `dated-ahead:${u}`,
  (u) => `session:${u}`,
  (u) => `life-pack:${u}`,
  (u) => `life-now:${u}`,
];

export async function invalidateChatCache(env, userId) {
  if (!env.CONTEXT_CACHE || !userId) return { invalidated: 0 };
  const results = await Promise.allSettled(
    CHAT_CACHE_KEYS.map((k) => env.CONTEXT_CACHE.delete(k(userId))),
  );
  return { invalidated: results.filter((r) => r.status === 'fulfilled').length };
}
