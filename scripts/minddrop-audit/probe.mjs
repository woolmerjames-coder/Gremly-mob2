// Confirm each candidate is reachable and accepts the request shape we send.
import { readFileSync } from 'node:fs';
import { MODELS } from './models.mjs';
import { callOpenAI, callAnthropic, callGemini } from './providers.mjs';
import { keys } from './keys.mjs';
const only = process.argv.slice(2);
for (const [k, spec] of Object.entries(MODELS)) {
  if (only.length && !only.includes(k)) continue;
  const args = { model: spec.model, system: 'Reply with JSON {"ok":true}.', user: 'ping', maxTokens: 50 };
  let r;
  if (spec.provider === 'openai') r = keys.openai ? await callOpenAI({ ...args, key: keys.openai }) : { ok: false, error: 'no key' };
  else if (spec.provider === 'gemini') r = keys.gemini ? await callGemini({ ...args, key: keys.gemini, thinking: spec.thinking }) : { ok: false, error: 'no key' };
  else r = await callAnthropic({ ...args, key: keys.anthropic, thinking: spec.thinking });
  console.log(k.padEnd(24), r.ok ? `OK ${r.ms}ms ${JSON.stringify(r.usage)} ${r.content.slice(0, 40)}` : `FAIL ${r.status} ${r.error?.slice(0, 160)}`);
}
