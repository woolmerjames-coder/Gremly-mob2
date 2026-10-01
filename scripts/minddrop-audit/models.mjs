// Candidate registry and official prices (USD per 1M tokens), checked 29 Sep 2026:
//   OpenAI: developers.openai.com/api/docs/models/<model> and /pricing
//   Google: ai.google.dev/gemini-api/docs/pricing (paid tier, standard)
//   Anthropic: platform.claude.com/docs/en/about-claude/pricing
// cacheMin: smallest prompt the provider will cache; ttlKey: which traffic
// hit rate applies (see TRAFFIC_HIT_RATE). write: price per 1M cache-write
// tokens (0 = no surcharge).

export const MODELS = {
  // OpenAI
  'gpt-4.1-nano': { provider: 'openai', model: 'gpt-4.1-nano', price: { in: 0.1, cached: 0.025, write: 0, out: 0.4 }, cacheMin: 1024, ttlKey: '5m', note: 'removed from the API on 23 Oct 2026' },
  'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4.1-mini', price: { in: 0.4, cached: 0.1, write: 0, out: 1.6 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-5-nano': { provider: 'openai', model: 'gpt-5-nano', price: { in: 0.05, cached: 0.005, write: 0, out: 0.4 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-5-mini': { provider: 'openai', model: 'gpt-5-mini', price: { in: 0.25, cached: 0.025, write: 0, out: 2.0 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-5.4-nano': { provider: 'openai', model: 'gpt-5.4-nano', price: { in: 0.2, cached: 0.02, write: 0, out: 1.25 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-5.4-mini': { provider: 'openai', model: 'gpt-5.4-mini', price: { in: 0.75, cached: 0.075, write: 0, out: 4.5 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-6-luna': { provider: 'openai', model: 'gpt-6-luna', price: { in: 0.1, cached: 0.01, write: 0.125, out: 0.5 }, cacheMin: 1024, ttlKey: '30m' },
  'gpt-5.6-luna': { provider: 'openai', model: 'gpt-5.6-luna', price: { in: 0.2, cached: 0.02, write: 0.25, out: 1.2 }, cacheMin: 1024, ttlKey: '5m' },
  'gpt-6-luna-low': { provider: 'openai', model: 'gpt-6-luna', effort: 'low', price: { in: 0.1, cached: 0.01, write: 0.125, out: 0.5 }, cacheMin: 1024, ttlKey: '30m', maxTokens: 2500 },
  'gpt-6-luna-medium': { provider: 'openai', model: 'gpt-6-luna', effort: 'medium', price: { in: 0.1, cached: 0.01, write: 0.125, out: 0.5 }, cacheMin: 1024, ttlKey: '30m', maxTokens: 4000 },
  // Google
  'gemini-3.1-flash-lite': { provider: 'gemini', model: 'gemini-3.1-flash-lite', price: { in: 0.25, cached: 0.025, write: 0, out: 1.5 }, cacheMin: 4096, ttlKey: '5m', thinking: { thinkingLevel: 'minimal' } },
  'gemini-3.1-flash-lite-low': { provider: 'gemini', model: 'gemini-3.1-flash-lite', price: { in: 0.25, cached: 0.025, write: 0, out: 1.5 }, cacheMin: 4096, ttlKey: '5m', thinking: { thinkingLevel: 'low' }, maxTokens: 2500 },
  'gemini-3.8-flash-medium': { provider: 'gemini', model: 'gemini-3.8-flash', price: { in: 0.75, cached: 0.075, write: 0, out: 3.75 }, cacheMin: 4096, ttlKey: '5m', thinking: { thinkingLevel: 'medium' }, maxTokens: 4000 },
  'gemini-3.8-flash-nothink': { provider: 'gemini', model: 'gemini-3.8-flash', price: { in: 0.75, cached: 0.075, write: 0, out: 3.75 }, cacheMin: 4096, ttlKey: '5m', thinking: { thinkingBudget: 0 }, maxTokens: 2500 },
  'gemini-3.5-flash-lite': { provider: 'gemini', model: 'gemini-3.5-flash-lite', price: { in: 0.3, cached: 0.3, write: 0, out: 2.5 }, cacheMin: Infinity, ttlKey: '5m', thinking: { thinkingLevel: 'minimal' } },
  'gemini-3.8-flash': { provider: 'gemini', model: 'gemini-3.8-flash', price: { in: 0.75, cached: 0.075, write: 0, out: 3.75 }, cacheMin: 4096, ttlKey: '5m', thinking: { thinkingLevel: 'low' }, maxTokens: 2500, note: 'promo price to 31 Dec 2026, then doubles' },
  // Anthropic
  'claude-haiku-4-5': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', price: { in: 1, cached: 0.1, write: 1.25, out: 5 }, cacheMin: 4096, ttlKey: '5m' },
  'claude-sonnet-5-5': { provider: 'anthropic', model: 'claude-sonnet-5-5', price: { in: 2, cached: 0.2, write: 2.5, out: 10 }, cacheMin: 512, ttlKey: '5m', thinking: { type: 'between_tools' } },
};

// Share of drops that arrive within the cache lifetime of the previous drop
// (all users, Jun to Sep 2026, from Supabase drop timestamps).
export const TRAFFIC_HIT_RATE = { '5m': 0.738, '30m': 0.764, '60m': 0.771, '24h': 0.924 };

export function callCost(spec, usage) {
  const p = spec.price;
  const uncached = Math.max(0, usage.input - usage.cachedInput - usage.cacheWrite);
  return (uncached * p.in + usage.cachedInput * p.cached + usage.cacheWrite * (p.write || p.in) + usage.output * p.out) / 1e6;
}

// Cost of one call at real traffic: the static system prompt is cached on a
// hit (when it is long enough for the provider to cache at all), paid in full
// (plus any write surcharge) on a miss.
export function modeledCost(spec, { systemTokens, userTokens, outputTokens }) {
  const p = spec.price;
  const cacheable = systemTokens >= spec.cacheMin;
  const h = cacheable ? TRAFFIC_HIT_RATE[spec.ttlKey] : 0;
  const hit = (systemTokens * p.cached + userTokens * p.in + outputTokens * p.out) / 1e6;
  const miss = ((systemTokens * (cacheable && p.write ? p.write : p.in)) + userTokens * p.in + outputTokens * p.out) / 1e6;
  return h * hit + (1 - h) * miss;
}
