// Dedicated question writer test: for drops a classifier marked ambiguous,
// write the popup with the standalone clarify prompt (the clarify-ambiguity
// route) on a given model, then validate with the same code the Worker uses.
// Usage: node run-clarify.mjs <sourceResultsFile> <writerModelKey> <tag>
import { readFileSync, writeFileSync } from 'node:fs';
import { MODELS, callCost } from './models.mjs';
import { callOpenAI, callAnthropic, callGemini } from './providers.mjs';
import { RESULTS, PROMPTS, WORKER, url } from './paths.mjs';
import { keys } from './keys.mjs';
const promptModule = url(process.env.PROMPT ? `${PROMPTS}${process.env.PROMPT}.js` : `${WORKER}classifyV3.js`);
const { buildClarifyPrompt, buildClarification, parseModelJson, PROMPT_VERSION } = await import(promptModule);
const [src, writer, tag] = process.argv.slice(2);
const spec = MODELS[writer];
const srcRows = JSON.parse(readFileSync(`${RESULTS}${src}.json`, 'utf8')).rows.filter((r) => r.label === 'ambiguous');
const rows = [];
for (const r of srcRows) {
  const system = buildClarifyPrompt(r.ambiguity_type, null);
  const user = `<drop>${r.raw}</drop>`;
  const args = { model: spec.model, system, user, maxTokens: spec.maxTokens || 400 };
  const res = spec.provider === 'openai' ? await callOpenAI({ ...args, key: keys.openai, effort: spec.effort })
    : spec.provider === 'gemini' ? await callGemini({ ...args, key: keys.gemini, thinking: spec.thinking })
    : await callAnthropic({ ...args, key: keys.anthropic, thinking: spec.thinking });
  const p = res.ok ? parseModelJson(res.content) : null;
  const c = buildClarification(r.ambiguity_type, p?.question, p?.labels, p?.habit_direction, r.raw);
  rows.push({ id: r.id, raw: r.raw, label: 'ambiguous', ms: res.ms, ambiguity_type: c.ambiguity_type, question: c.clarification_question,
    labels: c.clarification_options.map((o) => o.label), clar_source: { question: c.question_source, labels: c.labels_source },
    model_words: p, cost: res.usage ? callCost(spec, res.usage) : 0 });
}
const summary = { writer, src, tag, prompt_version: PROMPT_VERSION, n: rows.length, cost_total: rows.reduce((a, r) => a + r.cost, 0),
  p50_ms: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] };
writeFileSync(`${RESULTS}clar_${writer}_${tag}.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
