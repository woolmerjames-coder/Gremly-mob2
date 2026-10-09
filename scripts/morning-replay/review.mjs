/**
 * Puts morning replay runs side by side for a person to read: each sample day,
 * each line of the day as each run wrote it, and what the check did.
 *
 *   node scripts/morning-replay/review.mjs out/<before>/results.json out/<after>/results.json [...] > review.html
 */

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Give two or more results.json files.');
  process.exit(1);
}
const sets = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const ORDER = [
  'headline',
  'day_shape',
  'lead_what',
  'lead_why_today',
  'today_focus_0',
  'today_focus_1',
  'today_focus_2',
  'also_matters_0',
  'also_matters_1',
  'also_matters_2',
  'reach_why',
  'return_note',
];

const dayIds = [...new Set(sets.flatMap((s) => s.runs.map((r) => r.day)))];
const avg = (runs, f) => (runs.length ? runs.reduce((a, r) => a + f(r), 0) / runs.length : 0);

let html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Morning replay</title>
<style>
:root{--bg:#fbfaf7;--ink:#1d1b18;--muted:#6d675e;--line:#e4dfd6;--tint:#f2eee6;--warn:#9a3d1f}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--ink:#ece8e1;--muted:#a39d93;--line:#34312c;--tint:#22201d;--warn:#e08a6b}}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px}
main{max-width:1200px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 4px}
p.about{color:var(--muted);margin:0 0 8px}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{font-weight:600;background:var(--tint)}
td.field{color:var(--muted);white-space:nowrap;font-size:13px}
.flag{color:var(--warn);font-size:13px}
.blank{color:var(--muted);font-style:italic}
</style></head><body><main>
<h1>Morning replay, side by side</h1>
<p class="about">Made up sample days. Each column is one run of the daily picture: ${sets.map((s) => esc(s.label)).join(', ')}. A blank line is one the run left out or did not write.</p>
<div class="wrap"><table><tr><th>Run</th><th>Cents a morning</th><th>Sentences left out</th><th>Sent back</th></tr>`;
for (const s of sets) {
  const checked = s.runs.reduce((a, r) => a + (r.check?.checked || 0), 0);
  html += `<tr><td>${esc(s.label)}</td><td>${avg(s.runs, (r) => r.cents).toFixed(3)}</td><td>${checked ? `${s.runs.reduce((a, r) => a + (r.check?.left_out || 0), 0)} of ${checked}` : `${s.runs.reduce((a, r) => a + (r.flags?.length || 0), 0)} fields flagged`}</td><td>${checked ? s.runs.reduce((a, r) => a + (r.check?.sent_back || 0), 0) : `${s.runs.filter((r) => (r.attempts || 1) > 1).length} second drafts`}</td></tr>`;
}
html += '</table></div>';

for (const id of dayIds) {
  const runs = sets.map((s) => s.runs.find((r) => r.day === id) || null);
  html += `<h2>${esc(id)}</h2><p class="about">${esc(runs.find(Boolean)?.about)}</p><div class="wrap"><table><tr><th></th>${sets.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr>`;
  const fields = [
    ...ORDER,
    ...new Set(runs.flatMap((r) => Object.keys(r?.lines || {}).filter((k) => k.startsWith('claims_')))),
  ];
  for (const f of fields) {
    if (!runs.some((r) => r?.lines?.[f])) continue;
    html += `<tr><td class="field">${esc(f)}</td>${runs.map((r) => `<td>${r?.lines?.[f] ? esc(r.lines[f]) : '<span class="blank">blank</span>'}</td>`).join('')}</tr>`;
  }
  html += `<tr><td class="field">chips</td>${runs.map((r) => `<td>${esc((r?.anchors || []).join('; ')) || '<span class="blank">none</span>'}</td>`).join('')}</tr>`;
  html += `<tr><td class="field">what the check did</td>${runs
    .map(
      (r) =>
        `<td class="flag">${(r?.flags || [])
          .map((x) => `${esc(x.field)}${x.outcome ? ` (${esc(x.outcome)})` : ''}: ${esc(String(x.problem || '').slice(0, 240))}`)
          .join('<br>')}</td>`,
    )
    .join('')}</tr>`;
  html += `<tr><td class="field">cents</td>${runs.map((r) => `<td>${r ? r.cents : ''}</td>`).join('')}</tr></table></div>`;
}
html += '</main></body></html>';
process.stdout.write(html);
