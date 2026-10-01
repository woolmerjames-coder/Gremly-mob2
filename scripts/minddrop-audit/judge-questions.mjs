// Blind quality check of clarifying questions. Each question is graded on its
// own by a separate model (Claude Sonnet 5.5) against a fixed rubric, without
// knowing which model or prompt wrote it. Dev split only.
// Usage: node judge-questions.mjs <resultsFile> [<resultsFile> ...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { callAnthropic, callGemini, callOpenAI } from './providers.mjs';
import { MODELS, callCost } from './models.mjs';
const JUDGE = process.env.JUDGE || 'claude-sonnet-5-5';
const JSPEC = MODELS[JUDGE];
import { RESULTS, WORKER, url } from './paths.mjs';
import { keys } from './keys.mjs';
const { CLARIFY_TYPE_CONFIGS } = await import(url(`${WORKER}classifyV3.js`));

const CACHE = `${RESULTS}judge_cache${JUDGE === 'claude-sonnet-5-5' ? '' : '_' + JUDGE}.json`;
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

const SYSTEM = `You review one clarifying popup from a personal capture app. The user typed a short note ("drop"). The app could not tell what the user wanted, so it shows one question with a few one tap answers. Each answer leads to a fixed outcome, described to you as its intended meaning.

Grade the popup from the user's point of view. Score each criterion from 1 (poor) to 5 (excellent):
subject: the question refers to what the drop is actually about, rather than being a generic question that would fit any drop.
neutral: the question does not steer the user towards one answer.
natural: the question and answers sound like a friendly person talking, not a form, a menu or software.
fit: each answer clearly leads to its intended meaning, and a user could tell the answers apart at a glance.
faithful: nothing is invented that the drop does not say.
Then give overall: 1 to 5 for how good this popup is for a real user, and one short sentence naming the biggest problem, or "none".
Return one JSON object and nothing else: {"subject":n,"neutral":n,"natural":n,"fit":n,"faithful":n,"overall":n,"problem":"..."}`;

function describe(item) {
  const cfg = CLARIFY_TYPE_CONFIGS[item.type];
  const meanings = cfg ? cfg.options.map((o) => o.meaning) : [];
  const lines = item.labels.map((l, i) => `${i + 1}. "${l}" (intended meaning: ${meanings[i] || 'unknown'})`);
  return `<drop>${item.raw}</drop>\nQuestion: "${item.question}"\nAnswers:\n${lines.join('\n')}`;
}

const files = process.argv.slice(2);
const report = {};
for (const f of files) {
  const { rows, summary } = JSON.parse(readFileSync(`${RESULTS}${f}.json`, 'utf8'));
  const items = [];
  for (const r of rows) {
    if (r.question && r.labels) items.push({ id: r.id, raw: r.raw, question: r.question, labels: r.labels, type: r.ambiguity_type, src: r.clar_source });
    else if (r.segments?.[0]?.startsWith('Q: ')) {
      // v2 baseline rows: "Q: question | a / b / c" (type from the worker is not stored; meanings shown as unknown)
      const [q, l] = r.segments[0].slice(3).split(' | ');
      items.push({ id: r.id, raw: r.raw, question: q, labels: (l || '').split(' / '), type: r.ambiguity_type || null, src: null });
    }
  }
  const graded = [];
  let i = 0;
  async function w() {
    while (i < items.length) {
      const it = items[i++];
      const key = JSON.stringify([it.raw, it.question, it.labels, it.type]);
      if (!cache[key]) {
        const a = { model: JSPEC.model, system: SYSTEM, user: describe(it), maxTokens: JSPEC.maxTokens || 300 };
        const res = JSPEC.provider === 'anthropic' ? await callAnthropic({ ...a, key: keys.anthropic, thinking: JSPEC.thinking })
          : JSPEC.provider === 'gemini' ? await callGemini({ ...a, key: keys.gemini, thinking: JSPEC.thinking })
          : await callOpenAI({ ...a, key: keys.openai, effort: JSPEC.effort });
        try { cache[key] = { ...JSON.parse(res.content.slice(res.content.indexOf('{'), res.content.lastIndexOf('}') + 1)), cost: res.usage ? callCost(JSPEC, res.usage) : 0 }; }
        catch { cache[key] = { error: res.error || res.content?.slice(0, 100) }; }
      }
      graded.push({ ...it, grade: cache[key] });
    }
  }
  await Promise.all(Array.from({ length: 4 }, w));
  const ok = graded.filter((g) => g.grade.overall);
  const avg = (k) => +(ok.reduce((a, g) => a + g.grade[k], 0) / Math.max(1, ok.length)).toFixed(2);
  report[f] = {
    n: graded.length,
    overall: avg('overall'), subject: avg('subject'), neutral: avg('neutral'), natural: avg('natural'), fit: avg('fit'), faithful: avg('faithful'),
    good_share: +(ok.filter((g) => g.grade.overall >= 4).length / Math.max(1, ok.length)).toFixed(2),
    fallback_labels: graded.filter((g) => g.src?.labels === 'fallback').length,
    fallback_question: graded.filter((g) => g.src?.question === 'fallback').length,
    worst: ok.sort((a, b) => a.grade.overall - b.grade.overall).slice(0, 4).map((g) => `${g.grade.overall} "${g.raw.slice(0, 40)}" Q="${g.question}" [${g.labels.join(' / ')}] ${g.grade.problem}`),
  };
  writeFileSync(`${RESULTS}judged${JUDGE === 'claude-sonnet-5-5' ? '' : '_' + JUDGE}_${f}.json`, JSON.stringify(graded, null, 1));
}
writeFileSync(CACHE, JSON.stringify(cache));
const spent = Object.values(cache).reduce((a, c) => a + (c.cost || 0), 0);
console.log(JSON.stringify(report, null, 1));
console.log('judge spend so far $' + spent.toFixed(3));
