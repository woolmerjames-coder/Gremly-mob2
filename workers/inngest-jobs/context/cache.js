/**
 * Chat (the cortex worker) caches each person's profile, Life Map, today's DCO
 * and date anchors for up to two hours. When the context pipeline changes any
 * of them, those cache entries are dropped so the very next chat message reads
 * the new version. Same KV namespace, bound here as CONTEXT_CACHE.
 */
const KEYS = [
  (u) => `user-profile:v2:${u}`,
  (u) => `life-map-chat:${u}`,
  (u) => `life-map-domains:${u}`,
  (u) => `daily-focus-chat:${u}`,
  (u) => `dco-context:${u}`,
  (u) => `temporal-anchors:${u}`,
  (u) => `session:${u}`,
  (u) => `life-pack:${u}`,
];

export async function invalidateChatCache(env, userId) {
  if (!env.CONTEXT_CACHE || !userId) return { invalidated: 0 };
  const results = await Promise.allSettled(KEYS.map((k) => env.CONTEXT_CACHE.delete(k(userId))));
  return { invalidated: results.filter((r) => r.status === 'fulfilled').length };
}
