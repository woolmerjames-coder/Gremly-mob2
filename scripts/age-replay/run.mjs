// The What got me here writer, replayed on made up days, so James can read the
// lines before the prompt ships (a replay comes before any prompt change).
// Reads days.json beside this file (or --days path), runs the writer --runs
// times at the production temperature, checks each line against the rules,
// and writes age-replay-review.html into Claude outputs/ at the repo root.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { configureModels } from '../../workers/cortex/models.js';
import { writeAgeWords, agePrompt, MAX_WORDS, AGE_WORDS_VERSION } from '../../workers/cortex/age/words.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const runs = Number(arg('--runs', '5'));
const model = arg('--model', 'gpt-6-luna');
const fixture = JSON.parse(readFileSync(arg('--days', join(HERE, 'days.json')), 'utf8'));

if (!keys.openai) {
  console.error('No OPENAI_API_KEY: put it in .audit-keys.local at the repo root or in the environment.');
  process.exit(1);
}
configureModels({ OPENAI_API_KEY: keys.openai, HELPER_MODEL: model, HELPER_FALLBACK_MODEL: model, MODEL_AGE_WORDS: model });

// The rules, as checks. Praise words and counts are what the prompt forbids;
// the private check looks for the words of the made up days' private item
// (private_words in days.json), which the line must leave out.
const PRAISE = /\b(well done|great|amazing|proud|brilliant|impressive|good job|nice work|awesome|fantastic|incredible|wonderful)\b/i;
const COUNT = /\b\d+\s+(drops?|things?|items?|todos?)\b/i;
const PRIVATE = (fixture.private_words || []).length
  ? new RegExp(`\\b(${fixture.private_words.join('|')})\\w*`, 'i')
  : null;
function check(line) {
  const words = line.split(/\s+/).filter(Boolean).length;
  return [
    { name: `one sentence`, ok: (line.match(/[.!?]/g) || []).length === 1 },
    { name: `at most ${MAX_WORDS} words (${words})`, ok: words <= MAX_WORDS },
    { name: 'no dash', ok: !/[–—]|--/.test(line) },
    { name: 'no praise word', ok: !PRAISE.test(line) },
    { name: 'no count of drops', ok: !COUNT.test(line) },
    { name: 'no close of its own', ok: !/made of that/i.test(line) },
    { name: 'nothing private', ok: !PRIVATE || !PRIVATE.test(line) },
    { name: 'to them, not about Gremly', ok: !/\bI\s+(feel|felt|am|was)\b/.test(line) },
    { name: 'as you, not their name', ok: !(fixture.person?.first_name && new RegExp('\\b' + fixture.person.first_name + '\\b').test(line)) },
  ];
}

const deps = {
  fedDays: fixture.days.map((d) => d.day),
  days: fixture.days,
  dayEndHour: 3,
  person: fixture.person || { first_name: null, pronouns: null, identity: {} },
};
const prompt = agePrompt({ person: deps.person, days: fixture.days, age: fixture.age });

console.log(`Replaying What got me here ${runs} times on ${model} (${AGE_WORDS_VERSION})…`);
const results = [];
for (let i = 0; i < runs; i++) {
  const t0 = Date.now();
  let line = null;
  let error = null;
  try {
    const out = await writeAgeWords({ env: {}, userId: 'replay', tz: 'America/Los_Angeles', body: { age: fixture.age }, deps });
    line = out?.line ?? null;
  } catch (err) {
    error = String(err?.message || err);
  }
  const ms = Date.now() - t0;
  const checks = line ? check(line) : [];
  const fails = checks.filter((c) => !c.ok).map((c) => c.name);
  console.log(`${error ? 'ERROR' : !line ? 'NONE ' : fails.length ? 'FAIL ' : 'ok   '} ${ms}ms  ${line || error || 'no line'}${fails.length ? `  [${fails.join('; ')}]` : ''}`);
  results.push({ line, error, ms, checks });
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dayHtml = fixture.days
  .map(
    (d) => `<div class="day"><b>${esc(d.day)}</b><ul>${
      [
        d.done.length ? `Todos finished: ${esc(d.done.join('; '))}` : '',
        d.habits.length ? `Habits logged: ${esc(d.habits.join('; '))}` : '',
        d.dropped.length ? `Dropped: ${esc(d.dropped.join('; '))}` : '',
      ]
        .filter(Boolean)
        .map((x) => `<li>${x}</li>`)
        .join('') || '<li>Nothing recorded beyond feeding Gremly</li>'
    }</ul></div>`,
  )
  .join('');
const rows = results
  .map(
    (r, i) => `<tr class="${r.error ? 'err' : !r.line ? 'none' : r.checks.every((c) => c.ok) ? 'ok' : 'fail'}"><td>${i + 1}</td><td class="line">${esc(
      r.line ? `${r.line} I’m made of that.` : r.error || 'no line (the card would show the fallback)',
    )}</td><td>${r.ms}ms</td><td>${r.checks.map((c) => `<span class="${c.ok ? 'pass' : 'miss'}">${esc(c.name)}</span>`).join(' ')}</td></tr>`,
  )
  .join('');
const html = `<!doctype html><meta charset="utf-8"><title>What got me here, replayed</title>
<style>body{font:15px/1.5 -apple-system,Inter,sans-serif;color:#1F2A24;background:#F9F6F1;margin:0;padding:32px;max-width:960px}h1{font-size:24px;margin:0 0 4px}p.sub{color:#55695B;margin:0 0 24px}
.day{background:#fff;border:1px solid rgba(46,85,64,.12);border-radius:14px;padding:12px 16px;margin:0 0 10px}.day b{display:block;margin-bottom:4px}.day ul{margin:0;padding-left:18px}
table{border-collapse:collapse;width:100%;margin-top:20px;background:#fff;border-radius:14px;overflow:hidden}td,th{text-align:left;padding:10px 12px;border-top:1px solid rgba(46,85,64,.1);vertical-align:top}th{background:#EAF2E8;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2E5540}
td.line{font-size:16px}tr.fail td.line{color:#8A2D2D}tr.none td.line,tr.err td.line{color:#8A6B12}
.pass,.miss{display:inline-block;font-size:11px;padding:2px 7px;border-radius:9px;margin:2px 2px 0 0;background:#EAF2E8;color:#2E5540}.miss{background:#F8E3E3;color:#8A2D2D}
details{margin-top:24px}pre{white-space:pre-wrap;background:#fff;border:1px solid rgba(46,85,64,.12);border-radius:12px;padding:14px;font-size:13px}</style>
<h1>What got me here, replayed</h1><p class="sub">${results.length} runs on ${esc(model)}, prompt ${esc(AGE_WORDS_VERSION)}, age ${fixture.age}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. The card ends with the fixed close, added by the app.</p>
<h2 style="font-size:16px">The three days the writer was given</h2>${dayHtml}
<table><tr><th>#</th><th>The card</th><th>Time</th><th>Checks</th></tr>${rows}</table>
<details><summary>The prompt, as sent</summary><pre>${esc(prompt.system)}\n\n${esc(prompt.user)}</pre></details>`;
const outDir = join(ROOT, 'Claude outputs');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'age-replay-review.html');
writeFileSync(outFile, html);
console.log(`\nReview: ${outFile}`);
