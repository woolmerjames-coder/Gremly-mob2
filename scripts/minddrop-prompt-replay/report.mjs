/**
 * The words replay page for Mind Drop rethink stage 2: reads out/real-title.jsonl
 * (title --real) and the newest title and reclassify runs in out/, and writes
 * Claude outputs/words-replay.html for James to read. Counting only: nothing
 * here changes what a user sees.
 *   node scripts/minddrop-prompt-replay/report.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const PAGE = join(HERE, '..', '..', 'Claude outputs', 'words-replay.html');

const byI = new Map();
for (const l of readFileSync(join(OUT, 'real-title.jsonl'), 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(l);
  if (o.ok) byI.set(o.i, o);
}
const rows = [...byI.values()].sort((a, b) => a.i - b.i);
const newest = (prefix, n) => readdirSync(OUT).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort().slice(-n).map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')));
const titleRuns = newest('title-', 2);
const reclassRuns = newest('reclassify-', 1);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DASH = /[–—]/;
const tokens = (s) => String(s || '').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
const kindWord = (k) => (k.bucket === 'todo' ? 'Todo' : k.bucket === 'habit' ? (k.subtype === 'break_habit' ? 'Habit to break' : 'Habit') : { journal: 'Journal', idea: 'Idea', event: 'Event' }[k.subtype] || 'Note');

// a word they typed with a capital, not at the start of one of their sentences,
// that the title has with different capitals
function lostCapitals(raw, title) {
  const t = tokens(title);
  const typed = String(raw || '').split(/[.!?\n]+/).flatMap((sentence) => tokens(sentence).slice(1));
  return typed.filter((w) => /\p{Lu}/u.test(w) && t.some((x) => x.toLowerCase() === w.toLowerCase() && x !== w));
}
// a short drop whose title has a word the drop does not
function addedWords(raw, title) {
  const have = new Set(tokens(raw).map((w) => w.toLowerCase()));
  return tokens(title).filter((w) => !have.has(w.toLowerCase()));
}

const Q = ['title_faithful', 'title_clean', 'title_own_words', 'reaction_specific', 'reaction_voice', 'reaction_no_ask'];
const QWORDS = {
  title_faithful: 'Title adds nothing they did not say',
  title_clean: 'Title leaves out when, how often, how long and feelings',
  title_own_words: 'Title keeps their words',
  reaction_specific: 'Reaction is about this drop',
  reaction_voice: 'Reaction sounds like a friend, never restates the title or names the kind',
  reaction_no_ask: 'Reaction asks nothing',
};
const judgedOk = (r, side, k) => r.judged?.[side] && !r.judged[side].error && r.judged[side][k];
const judgedN = (side) => rows.filter((r) => r.judged?.[side] && !r.judged[side].error).length;

const c = {
  n: rows.length,
  newAsks: rows.filter((r) => r.new.reaction.includes('?') || (r.judged?.new && r.judged.new.reaction_no_ask === false)),
  oldAsks: rows.filter((r) => r.old.reaction.includes('?')).length,
  newDash: rows.filter((r) => DASH.test(r.new.reaction) || DASH.test(r.new.title)),
  oldDash: rows.filter((r) => DASH.test(r.old.reaction)).length,
  newLong: rows.filter((r) => r.new.reaction.length > 70),
  oldLong: rows.filter((r) => r.old.shown.speech.length > 70).length,
  longTitles: rows.filter((r) => r.new.title.length > 60 || tokens(r.new.title).length > 8),
  fallback: rows.filter((r) => r.new.fallback),
  capsNew: rows.filter((r) => lostCapitals(r.raw, r.new.title).length),
  capsOld: rows.filter((r) => lostCapitals(r.raw, r.old.shown.title).length),
  rewrote: rows.filter((r) => tokens(r.raw).length <= 8 && addedWords(r.raw, r.new.title).length),
  leftOut: rows.filter((r) => r.caught?.left_out?.length),
  notCaught: rows.filter((r) => r.caught?.not_caught?.length),
  caughtErr: rows.filter((r) => r.caught?.error),
};
const events = rows.filter((r) => r.kind.subtype === 'event');
const judgeModels = [...new Set(rows.flatMap((r) => [r.judged?.new?.judge_model, r.caught?.judge_model]).filter(Boolean))];

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const meta = (d) => [d?.target_date && `day ${d.target_date}`, d?.scheduled_date && `doing ${d.scheduled_date}`, d?.end_date && `until ${d.end_date}`, d?.event_time && `at ${d.event_time}`, d?.time_window && `${d.time_window}`, d?.extracted_frequency && `${d.extracted_frequency}`, d?.extracted_days && `days ${d.extracted_days.join(' ')}`, d?.extracted_start_date && `from ${d.extracted_start_date}`, d?.time_estimate_minutes && `${d.time_estimate_minutes} min`, d?.mood && `mood ${[].concat(d.mood).join(' ')}`].filter(Boolean).join(' · ');
const short = (r, side) => {
  const j = r.judged?.[side];
  if (!j || j.error) return '';
  const off = Q.filter((k) => j[k] === false);
  return off.length ? `<div class="flag">${esc(off.map((k) => QWORDS[k]).join('; '))}: no. ${esc(j.why)}</div>` : '';
};

const dropRow = (r) => `<tr>
<td class="drop"><span class="who">${r.who === 'J' ? 'You' : 'Tester'} · ${esc(r.today)} · ${kindWord(r.kind)}</span>${esc(r.raw)}</td>
<td><b>${esc(r.old.shown.title)}</b><div class="sub">${esc(r.old.shown.speech)}</div>${short(r, 'old')}</td>
<td><b>${esc(r.new.title)}</b>${r.new.fallback ? ' <span class="tag">fallback</span>' : ''}<div class="sub">${esc(r.new.reaction)}</div>${short(r, 'new')}${r.caught?.not_caught?.length ? `<div class="flag miss">Left out of the title and not in the details: ${esc(r.caught.not_caught.join('; '))}</div>` : ''}</td>
<td class="meta">${esc(meta(r.details))}</td></tr>`;
const table = (list, empty) => (list.length ? `<div class="sc"><table><thead><tr><th>What they dropped</th><th>Before (as the app showed it)</th><th>After</th><th>Details call</th></tr></thead><tbody>${list.map(dropRow).join('')}</tbody></table></div>` : `<p class="none">${empty}</p>`);

const judgeTable = `<table class="nums"><thead><tr><th>Judge's check, real drops</th><th>Before</th><th>After</th></tr></thead><tbody>${Q.map((k) => `<tr><td>${QWORDS[k]}</td><td>${rows.filter((r) => judgedOk(r, 'old', k)).length} of ${judgedN('old')}</td><td>${rows.filter((r) => judgedOk(r, 'new', k)).length} of ${judgedN('new')}</td></tr>`).join('')}</tbody></table>`;

const madeUp = (runs, label) => runs.length ? `<h3>${label}</h3>${runs.map((x, n) => `<p class="mono">Run ${n + 1}<br>${x.summary.map(esc).join('<br>')}</p>`).join('')}<div class="sc"><table><thead><tr><th>Drop</th><th>Before</th><th>After</th></tr></thead><tbody>${[...new Set(runs.flatMap((x) => x.rows.map((y) => y.text)))].map((t) => `<tr><td class="drop">${esc(t)}</td>${['old', 'new'].map((side) => `<td>${runs.map((x) => x.rows.find((y) => y.text === t && y.side === side)).filter(Boolean).map((y) => `<b>${esc(y.title)}</b><div class="sub">${esc(y.reaction)}</div>`).join('<hr>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Words Replay</title>
<style>
:root{--bg:#F9F6F1;--card:#fff;--ink:#1F2421;--muted:#5C6660;--line:rgba(46,85,64,.14);--moss:#2E5540;--warn:#9A3B2A;--warnw:#F6E3DC;--good:#2E6B45;--goodw:#E3EEE1}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141816;--card:#1D2320;--ink:#E8ECE9;--muted:#A3ADA7;--line:rgba(200,220,205,.16);--moss:#9CC8A8;--warn:#F0A08E;--warnw:#3A2420;--good:#9CC8A8;--goodw:#22302A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:34px 0 8px}h3{font-size:16px;margin:22px 0 6px}
p{margin:6px 0 10px;max-width:820px}.lede{color:var(--muted)}.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:13px}.stat.bad b{color:var(--warn)}.stat.ok b{color:var(--good)}
.sc{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:760px}
th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line);font-size:14px}th{font-size:12.5px;color:var(--muted);font-weight:600}
td.drop{max-width:300px}.who{display:block;font-size:12px;color:var(--muted)}.sub{color:var(--muted);margin-top:3px}.meta{font-size:13px;color:var(--muted);max-width:220px}
.flag{margin-top:5px;font-size:12.5px;color:var(--warn)}.flag.miss{background:var(--warnw);padding:3px 6px;border-radius:6px}.tag{font-size:12px;background:var(--warnw);color:var(--warn);padding:1px 6px;border-radius:6px}
table.nums{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:12px}.mono{font:13px/1.5 ui-monospace,Menlo,monospace;color:var(--muted)}.none{color:var(--muted)}hr{border:0;border-top:1px dashed var(--line);margin:6px 0}
details summary{cursor:pointer;font-weight:600;margin:8px 0}
</style></head><body><main>
<h1>Words replay</h1>
<p class="lede">Mind Drop rethink, stage 2. The title and reaction call on ${c.n} real drops from your account and the tester's (${events.length} of them events), today's prompt beside the new one. Before is what the app showed: today's prompt given the kind, Title Case, and a fixed opener in the bubble. After is the new prompt given no kind, as it will run at the tap, with only a capital added first. The details call ran on each drop with its kind, and a judge (${esc(judgeModels.join(', '))}) checked every title and reaction against the prompt's rules and listed anything left out of a title that the details do not hold. Anthropic's API refuses calls from the VM, so the judge was GPT-6 Sol rather than Sonnet.</p>

<h2>The counts</h2>
<div class="grid">
<div class="stat ${c.newAsks.length ? 'bad' : 'ok'}"><b>${c.newAsks.length} <small>vs ${c.oldAsks}</small></b><span>Reactions that ask anything, after vs before</span></div>
<div class="stat ${c.newDash.length ? 'bad' : 'ok'}"><b>${c.newDash.length} <small>vs ${c.oldDash}</small></b><span>Dashes in the reaction, so the logged dash swap would fire</span></div>
<div class="stat ${c.newLong.length ? 'bad' : 'ok'}"><b>${c.newLong.length} <small>vs ${c.oldLong}</small></b><span>Reactions over 70 characters, so the logged cut would fire (before: with its opener)</span></div>
<div class="stat ${c.notCaught.length ? 'bad' : 'ok'}"><b>${c.notCaught.length}</b><span>Drops with a when, how often, how long or feeling left out of the title and not in the details, of ${c.leftOut.length} with something left out</span></div>
<div class="stat ${c.capsNew.length ? 'bad' : 'ok'}"><b>${c.capsNew.length} <small>vs ${c.capsOld.length}</small></b><span>Titles that changed a capital they typed (an acronym or a name)</span></div>
<div class="stat"><b>${c.rewrote.length}</b><span>Short drops (8 words or fewer) whose new title has a word they did not type</span></div>
<div class="stat"><b>${c.longTitles.length}</b><span>New titles over 60 characters or 8 words, kept as written</span></div>
<div class="stat ${c.fallback.length ? 'bad' : 'ok'}"><b>${c.fallback.length}</b><span>Title calls that gave no title, so the drop's own words stood in</span></div>
</div>
${judgeTable}
${c.caughtErr.length ? `<p class="flag">${c.caughtErr.length} drops had no answer from the left out check.</p>` : ''}

<h2>Left out of the title and not caught by the details</h2>
<p>Each of these would vanish from the card: the title leaves it out and the details call did not catch it.</p>
${table(c.notCaught, 'None: everything left out of a title was caught by the details.')}

<h2>Events, for you to read</h2>
<p>Every event in the set. The day and time should be out of the title and in the details, which the meta line shows.</p>
${table(events, 'No events in the set.')}

<h2>Reactions flagged</h2>
<p>New reactions that ask something, or that the dash swap or the length cut would change.</p>
${table([...new Set([...c.newAsks, ...c.newDash, ...c.newLong])], 'None.')}

<h2>Capitals and rewrites</h2>
<h3>Titles that changed a capital they typed</h3>${table(c.capsNew, 'None in the new titles.')}
<h3>Short drops given a word they did not type</h3>${table(c.rewrote, 'None.')}
<h3>Long titles kept as written</h3>${table(c.longTitles, 'None.')}

<h2>Made up drops</h2>
<p>The replay's own made up drops, which pass Gremly's recent reactions so the variety rule is tested, and the clarify answers, which share the title and reaction rules.</p>
${madeUp(titleRuns, 'Title and reaction')}
${madeUp(reclassRuns, 'After a clarify answer')}

<h2>Every real drop</h2>
<details><summary>All ${c.n} drops</summary>${table(rows, '')}</details>
</main></body></html>`;
writeFileSync(PAGE, html);
console.log(`wrote ${PAGE}`);
console.log(JSON.stringify({ n: c.n, events: events.length, newAsks: c.newAsks.length, oldAsks: c.oldAsks, newDash: c.newDash.length, oldDash: c.oldDash, newLong: c.newLong.length, leftOut: c.leftOut.length, notCaught: c.notCaught.length, capsNew: c.capsNew.length, capsOld: c.capsOld.length, rewrote: c.rewrote.length, longTitles: c.longTitles.length, fallback: c.fallback.length, judge: Object.fromEntries(Q.map((k) => [k, [rows.filter((r) => judgedOk(r, 'old', k)).length, rows.filter((r) => judgedOk(r, 'new', k)).length]])) }));
