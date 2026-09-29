// The four candidates for the helper jobs, plus the request shape each one
// needs. Prices per 1M tokens (USD) copied from ../minddrop-audit/models.mjs on
// 29 Sep 2026. gpt-4.1-mini is today's model and the baseline.
export const MODELS = {
  'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4.1-mini', price: { in: 0.4, out: 1.6 }, reasoning: false },
  'gpt-6-luna': { provider: 'openai', model: 'gpt-6-luna', price: { in: 0.1, out: 0.5 }, reasoning: true, effort: 'none' },
  'gpt-6-luna-low': { provider: 'openai', model: 'gpt-6-luna', price: { in: 0.1, out: 0.5 }, reasoning: true, effort: 'low' },
  'gpt-5-nano': { provider: 'openai', model: 'gpt-5-nano', price: { in: 0.05, out: 0.4 }, reasoning: true, effort: 'minimal' },
  'gemini-3.8-flash-nothink': { provider: 'gemini', model: 'gemini-3.8-flash', price: { in: 0.75, out: 3.75 }, thinking: { thinkingBudget: 0 }, note: 'thinking switched off; same price' },
  'gemini-3.8-flash': { provider: 'gemini', model: 'gemini-3.8-flash', price: { in: 0.75, out: 3.75 }, thinking: { thinkingLevel: 'low' }, note: 'promo price to 31 Dec 2026, then $1.50 / $7.50' },
};
export function callCost(spec, usage) {
  if (!usage) return 0;
  return (usage.input * spec.price.in + usage.output * spec.price.out) / 1e6;
}
