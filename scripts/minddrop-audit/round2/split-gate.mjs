// Stage 3 of the Mind Drop rethink: the gate page for v3.8 on the locked test set.
// Reads the Worker runs (v3.7 and v3.8, two each) and writes a page for James to
// read: the numbers against the bar, how each split would reach the app, the clear
// list, the unsure list, and every drop whose answer changed. Counting only.
//   node round2/split-gate.mjs base37 base37b v38 v38b "<out.html>"
import { readFileSync, writeFileSync } from 'node:fs';
import { MODELS } from '../models.mjs';
import { loadGold2, scoreRows2 } from './score2.mjs';

const [a1, a2, b1, b2, out] = process.argv.slice(2);
const gold = loadGold2('test');
const R1 = new URL('../results/', import.meta.url).pathname;
const byModel = Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [v.model, k]));
const load = (tag) =>
  JSON.parse(readFileSync(`${R1}v3w_${tag}_test2.json`, 'utf8')).rows.map((r) => ({
    ...r,
    calls: (r.calls || []).map((c) => ({ modelKey: byModel[c.model] || c.model, usage: c.usage, cost: c.cost })),
  }));
const runs = { [a1]: load(a1), [a2]: load(a2), [b1]: load(b1), [b2]: load(b2) };
const tags = [a1, a2, b1, b2];
const isNew = (t) => t === b1 || t === b2;
const byId = Object.fromEntries(tags.map((t) => [t, new Map(runs[t].map((r) => [r.id, r]))]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ids = Object.keys(gold).sort();

// What a drop's answer is, read as the app would act on it
const kind = (r, g) => {
  if (!r || r.label === 'FAIL') return 'fail';
  if (r.label === 'ambiguous') return g.acceptable.includes('ambiguous') ? 'ok' : 'needless';
  return g.acceptable.includes(r.label) ? 'ok' : 'silent';
};
const splitWord = (t, r) => (r?.label !== 'multi' ? '' : isNew(t) ? r.split : 'no split field (the app splits)');

// 1. The numbers
const S = Object.fromEntries(tags.map((t) => [t, scoreRows2(runs[t], gold)]));
const row = (t) => {
  const s = S[t];
  return `<tr><td>${esc(t)}</td><td>${isNew(t) ? 'v3.8' : 'v3.7'}</td><td>${(s.accuracy * 100).toFixed(1)}%</td><td>${s.silent_wrong}</td><td>${s.needless_question}</td><td>${s.multi.detected}/${s.multi.gold}</td><td>${s.multi.pieces_right}/${s.multi.pieces}</td><td>${s.multi.false_multi}</td><td>${s.failed}</td><td>${(s.p50_ms / 1000).toFixed(1)}s</td><td>${(s.p90_ms / 1000).toFixed(1)}s</td></tr>`;
};

// 2. Paired over both runs: drops worse and better under v3.8, with an exact sign test
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const sign = (k, n) => { let p = 0; for (let i = 0; i <= n; i++) if (Math.abs(i - n / 2) >= Math.abs(k - n / 2)) p += choose(n, i) / 2 ** n; return Math.min(1, p); };
const paired = (what) => {
  let worse = 0, better = 0;
  for (const id of ids) {
    const g = gold[id];
    const n = (ts) => ts.filter((t) => { const k = kind(byId[t].get(id), g); return what === 'any' ? k === 'silent' || k === 'needless' : k === what; }).length;
    const a = n([a1, a2]), b = n([b1, b2]);
    if (b > a) worse++; else if (a > b) better++;
  }
  return { worse, better, p: sign(worse, worse + better) };
};
const P = { silent: paired('silent'), needless: paired('needless'), any: paired('any') };

// 3. Splits as the app would take them
const splits = (t) => {
  const c = { clear: 0, unsure: 0, missed: 0, wrongClear: [], wrongUnsure: [], unsureGold: [], either: 0 };
  for (const r of runs[t]) {
    const g = gold[r.id];
    const multi = r.label === 'multi';
    const sure = multi && (!isNew(t) || r.split === 'clear');
    if (g.primary === 'multi') {
      if (!multi) c.missed++;
      else if (sure) c.clear++;
      else { c.unsure++; c.unsureGold.push(r.id); }
    } else if (multi) {
      if (g.acceptable.includes('multi')) c.either++;
      else if (sure) c.wrongClear.push(r.id);
      else c.wrongUnsure.push(r.id);
    }
  }
  return c;
};
const SP = Object.fromEntries(tags.map((t) => [t, splits(t)]));

const pieces = (r) => (r?.segments || []).map((x) => `<div>${esc(x.label)}: ${esc(x.text)}${x.question ? ` <span class="tag">asks: ${esc(x.question)}</span>` : ''}</div>`).join('');
const answer = (t, r, g) => {
  if (!r) return '<span class="none">none</span>';
  const k = kind(r, g);
  const cls = k === 'ok' ? 'ok' : k === 'needless' ? 'ask' : 'bad';
  const sw = splitWord(t, r);
  return `<span class="${cls}">${esc(r.label)}${sw ? `, ${esc(sw)}` : ''}${k === 'needless' ? ' (needless question)' : k === 'silent' ? ' (wrong)' : k === 'fail' ? ' (no answer)' : ''}</span>`;
};
const goldCell = (g) => `${esc(g.primary)}${g.acceptable.length > 1 ? `<span class="who">accepts ${esc(g.acceptable.join(', '))}</span>` : ''}`;

// 4. The clear list (the official run, b1), the unsure list, and the second run's differences
const clearRows = (t) =>
  runs[t].filter((r) => r.label === 'multi' && r.split === 'clear').map((r) => {
    const g = gold[r.id];
    const wrong = !g.acceptable.includes('multi');
    return `<tr${wrong ? ' class="hl"' : ''}><td class="mono">${esc(r.id)}</td><td class="drop">${esc(r.raw)}</td><td>${pieces(r)}</td><td>${esc(r.as_one ?? 'none')}</td><td>${goldCell(g)}${wrong ? '<div class="flag">gold says one entry: a split made without asking</div>' : ''}</td></tr>`;
  }).join('');
const unsureRows = (t) =>
  runs[t].filter((r) => r.label === 'multi' && r.split !== 'clear').map((r) => {
    const g = gold[r.id];
    return `<tr><td class="mono">${esc(r.id)}</td><td class="drop">${esc(r.raw)}</td><td>${pieces(r)}</td><td>${esc(r.as_one ?? 'none')}</td><td>${goldCell(g)}</td></tr>`;
  }).join('');

// 5. Every drop whose answer changed between the two first runs, with all four answers
const changed = ids.filter((id) => byId[a1].get(id)?.label !== byId[b1].get(id)?.label);
const changedRows = changed.map((id) => {
  const g = gold[id];
  const r = byId[b1].get(id);
  return `<tr><td class="mono">${esc(id)}</td><td class="drop">${esc(r?.raw)}</td><td>${goldCell(g)}</td>${tags.map((t) => `<td>${answer(t, byId[t].get(id), g)}</td>`).join('')}</tr>`;
}).join('');
const steady = (fromKinds) => changed.filter((id) => fromKinds(id)).length;
const flips = {
  better: changed.filter((id) => kind(byId[a1].get(id), gold[id]) !== 'ok' && kind(byId[b1].get(id), gold[id]) === 'ok').length,
  worse: changed.filter((id) => kind(byId[a1].get(id), gold[id]) === 'ok' && kind(byId[b1].get(id), gold[id]) !== 'ok').length,
};
const fails = tags.flatMap((t) => runs[t].filter((r) => r.label === 'FAIL').map((r) => `${t} ${r.id} (status ${r.status})`));
const noAsOne = [b1, b2].flatMap((t) => runs[t].filter((r) => r.label === 'multi' && !r.as_one).map((r) => `${t} ${r.id}, ${r.split}`));
void steady;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Split gate</title>
<style>
:root{--bg:#F9F6F1;--card:#fff;--ink:#1F2421;--muted:#5C6660;--line:rgba(46,85,64,.14);--moss:#2E5540;--warn:#9A3B2A;--warnw:#F6E3DC;--good:#2E6B45;--goodw:#E3EEE1;--ask:#8A5A12}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141816;--card:#1D2320;--ink:#E8ECE9;--muted:#A3ADA7;--line:rgba(200,220,205,.16);--moss:#9CC8A8;--warn:#F0A08E;--warnw:#3A2420;--good:#9CC8A8;--goodw:#22302A;--ask:#E6C17A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:34px 0 8px}
p{margin:6px 0 10px;max-width:820px}.lede{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:13px}.stat.ok b{color:var(--good)}.stat.bad b{color:var(--warn)}
.sc{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin:10px 0}table{border-collapse:collapse;width:100%;min-width:760px}
th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line);font-size:14px}th{font-size:12.5px;color:var(--muted);font-weight:600}
td.drop{max-width:320px}.who{display:block;font-size:12px;color:var(--muted)}.mono{font:13px/1.5 ui-monospace,Menlo,monospace;color:var(--muted)}.none{color:var(--muted)}
.flag{margin-top:5px;font-size:12.5px;color:var(--warn)}.tag{font-size:12px;background:var(--warnw);color:var(--warn);padding:1px 6px;border-radius:6px}
.ok{color:var(--good)}.bad{color:var(--warn);font-weight:600}.ask{color:var(--ask)}tr.hl td{background:var(--warnw)}
</style></head><body><main>
<h1>Split gate</h1>
<p class="lede">Mind Drop rethink, stage 3. Classifier v3.8, which says whether a split is clear or unsure and lets a piece ask its own question, against v3.7 on the locked 1,000 drop test set, through the real Worker route (Gemini 3.8 Flash, Luna as the backup). The plan asks for one run; each prompt was run twice, so run to run noise can be read off. ${esc(b1)} is the official run.</p>

<h2>The bar</h2>
<div class="grid">
<div class="stat ok"><b>${S[b1].multi.detected} and ${S[b2].multi.detected} of 35</b><span>Multi drops found (bar 34). v3.7: ${S[a1].multi.detected} and ${S[a2].multi.detected}</span></div>
<div class="stat ok"><b>${S[b1].multi.pieces_right} and ${S[b2].multi.pieces_right} of 76</b><span>Pieces right (bar 74). v3.7: ${S[a1].multi.pieces_right} and ${S[a2].multi.pieces_right}</span></div>
<div class="stat ok"><b>${(S[b1].accuracy * 100).toFixed(1)}% and ${(S[b2].accuracy * 100).toFixed(1)}%</b><span>Accuracy. v3.7: ${(S[a1].accuracy * 100).toFixed(1)}% and ${(S[a2].accuracy * 100).toFixed(1)}%</span></div>
<div class="stat"><b>${S[b1].silent_wrong} and ${S[b2].silent_wrong}</b><span>Wrong without asking. v3.7: ${S[a1].silent_wrong} and ${S[a2].silent_wrong}. Paired over both runs: ${P.silent.worse} drops worse, ${P.silent.better} better, p=${P.silent.p.toFixed(2)}</span></div>
<div class="stat"><b>${S[b1].needless_question} and ${S[b2].needless_question}</b><span>Needless questions. v3.7: ${S[a1].needless_question} and ${S[a2].needless_question}. Paired: ${P.needless.worse} worse, ${P.needless.better} better, p=${P.needless.p.toFixed(2)}</span></div>
<div class="stat"><b>${P.any.worse} worse, ${P.any.better} better</b><span>Drops with any mistake, both runs paired (p=${P.any.p.toFixed(2)})</span></div>
</div>
<div class="sc"><table><tr><th>Run</th><th>Prompt</th><th>Accuracy</th><th>Wrong without asking</th><th>Needless questions</th><th>Multi found</th><th>Pieces right</th><th>Split a single drop</th><th>No answer</th><th>Typical</th><th>p90</th></tr>${tags.map(row).join('')}</table></div>
<p>The scorer counts any split of a drop gold calls one entry as wrong without asking. Under v3.8 an unsure split asks on its card with one tap, so only a clear one is made without asking; the next table reads the splits that way.</p>

<h2>Splits, as the app would take them</h2>
<div class="sc"><table><tr><th>Run</th><th>Gold multi split without asking</th><th>Gold multi asked (unsure)</th><th>Gold multi missed</th><th>One entry split without asking</th><th>One entry split, asked (unsure)</th><th>Either is right, split</th></tr>
${tags.map((t) => { const c = SP[t]; return `<tr><td>${esc(t)}</td><td>${c.clear}</td><td>${c.unsure}${c.unsureGold.length ? `<span class="who">${esc(c.unsureGold.join(', '))}</span>` : ''}</td><td>${c.missed}</td><td class="${c.wrongClear.length ? 'bad' : ''}">${c.wrongClear.length}<span class="who">${esc(c.wrongClear.join(', '))}</span></td><td>${c.wrongUnsure.length}<span class="who">${esc(c.wrongUnsure.join(', '))}</span></td><td>${c.either}</td></tr>`; }).join('')}
</table></div>
<p>v3.7 has no clear or unsure, so every split it makes is made without asking.</p>

<h2>The clear list, ${esc(b1)}</h2>
<p>Every drop v3.8 split as clear in the official run: these split without asking. Highlighted rows are drops the gold calls one entry. If you count any of them a wrong split, v3.8 ships with <code>CLASSIFY_SPLIT_AUTO = "false"</code> (every split asks) and tuning carries on with the design set (decided 9 October).</p>
<div class="sc"><table><tr><th>Drop</th><th>Their words</th><th>Pieces</th><th>Kept as one</th><th>Gold</th></tr>${clearRows(b1)}</table></div>
<h2>The clear list, ${esc(b2)} (the second run)</h2>
<div class="sc"><table><tr><th>Drop</th><th>Their words</th><th>Pieces</th><th>Kept as one</th><th>Gold</th></tr>${clearRows(b2)}</table></div>

<h2>The unsure list, ${esc(b1)}</h2>
<p>Splits v3.8 marked unsure: each asks on its card, split or keep as one, and keeping it saves it as the kind under Kept as one.</p>
<div class="sc"><table><tr><th>Drop</th><th>Their words</th><th>Pieces</th><th>Kept as one</th><th>Gold</th></tr>${unsureRows(b1)}</table></div>
<h2>The unsure list, ${esc(b2)}</h2>
<div class="sc"><table><tr><th>Drop</th><th>Their words</th><th>Pieces</th><th>Kept as one</th><th>Gold</th></tr>${unsureRows(b2)}</table></div>

<h2>Every drop whose answer changed, ${esc(a1)} to ${esc(b1)}</h2>
<p>${changed.length} drops: ${flips.better} went from a mistake to right, ${flips.worse} from right to a mistake, the rest changed between right answers. The four columns show each run, so a drop that changes between runs of the same prompt is noise rather than the prompt.</p>
<div class="sc"><table><tr><th>Drop</th><th>Their words</th><th>Gold</th>${tags.map((t) => `<th>${esc(t)}</th>`).join('')}</tr>${changedRows}</table></div>

<h2>Notes</h2>
<p>No answer: ${fails.length ? esc(fails.join('; ')) : 'none'}. The one in the second v3.8 run is Gemini answering 503 with the backup not answering in time; the route returned 502, as it does today for any drop when both providers fail.</p>
<p>Multi drops with no kept as one kind (the model gave no top level outcome): ${esc(noAsOne.join('; ') || 'none')}. As decided, an unsure split with none is saved as a note and logged.</p>
</main></body></html>`;
writeFileSync(out, html);
console.log(`wrote ${out}: ${changed.length} changed drops, clear ${SP[b1].clear}+${SP[b1].wrongClear.length}`);
