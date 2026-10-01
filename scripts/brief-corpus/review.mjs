/**
 * The review page for one corpus run: each day, the brief each model wrote as
 * it would read in the chat, and the checks under it.
 * renderReview returns the page body (title, style and content); run.mjs
 * wraps it in a document for local viewing.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const hhmm = (min) => {
  const h = Math.floor(min / 60) % 24;
  const m = String(min % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m}${h >= 12 ? 'pm' : 'am'}`;
};

const weekday = (d) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T12:00:00Z`),
  );

const OFFER_NAMES = {
  plan: 'Plan',
  sweep: 'Sweep first (messy backlog)',
  return: 'Return day',
  none: 'No offer',
};

function chips(buttons) {
  if (!buttons?.length) return '';
  return `<div class="chips">${buttons
    .map((b) => `<span class="chip${b.primary ? ' primary' : ''}">${esc(b.label)}</span>`)
    .join('')}</div>`;
}

function dayCard(snap) {
  const meetingsLeft = snap.meetings.filter((m) => m.end > snap.now).length;
  const bits = [
    `${snap.meetings.length} meeting${snap.meetings.length === 1 ? '' : 's'}${snap.meetings.length ? ` (${meetingsLeft} still ahead)` : ''}`,
    `${snap.todosDue.length} todo${snap.todosDue.length === 1 ? '' : 's'} due`,
    `${snap.habitsForToday.length} habit${snap.habitsForToday.length === 1 ? '' : 's'}`,
    `Sweep: ${snap.overdue} past date, ${snap.unsorted} unsorted`,
  ];
  return `<div class="daycard"><span class="dc-label">Day card</span>${bits.map((b) => `<span>${esc(b)}</span>`).join('')}</div>`;
}

function runColumn(r, item) {
  if (!r) return '<div class="col empty">Not run</div>';
  if (r.error) {
    return `<div class="col"><div class="col-head"><b>${esc(r.model)}</b><span class="pill bad">Error</span></div><p class="err">${esc(r.error)}</p></div>`;
  }
  const fails = r.checks.filter((c) => c.level === 'fail' && !c.ok);
  const looks = r.checks.filter((c) => c.level === 'look' && !c.ok);
  const held = !!r.out.questionLine;
  const fellBack = r.modelUsed && !r.modelUsed.includes(r.model === 'gemini' ? 'gemini' : 'gpt');
  return `<div class="col">
    <div class="col-head"><b>${esc(r.modelUsed || r.model)}</b>${fellBack ? '<span class="pill warn">fell back</span>' : ''}<span class="pill ${fails.length ? 'bad' : looks.length ? 'warn' : 'good'}">${fails.length ? `${fails.length} rule${fails.length > 1 ? 's' : ''} broken` : looks.length ? `${looks.length} to look at` : 'All checks pass'}</span><span class="ms">${(r.ms / 1000).toFixed(1)}s</span></div>
    <div class="thread">
      ${r.out.lines.map((l) => `<div class="bubble">${esc(l.text)}</div>`).join('')}
      ${r.out.dropped.map((d) => `<div class="bubble dropped" title="Dropped by the ID check">${esc(d.text)}<small>Dropped by the ID check: ${esc(d.bad.join(', '))}</small></div>`).join('')}
      ${dayCard(item.snapshot)}
      ${held ? `<div class="bubble">${esc(r.out.questionLine)}</div>${chips(r.questionButtons)}<div class="after">After they answer or skip</div>` : ''}
      <div class="bubble">${esc(r.out.offer || '(no offer text: the fallback line is used)')}</div>
      ${chips(item.offer.buttons)}
      ${r.out.catchUp ? `<div class="after">If they tap Catch me up</div><div class="bubble">${esc(r.out.catchUp)}</div>` : ''}
    </div>
    <ul class="checks">${r.checks
      .map(
        (c) =>
          `<li class="${c.ok ? 'ok' : c.level === 'fail' ? 'fail' : 'look'}"><span class="mark" aria-hidden="true">${c.ok ? '✓' : c.level === 'fail' ? '✕' : '?'}</span><span>${esc(c.name)}${!c.ok && c.detail ? `<small>${esc(c.detail)}</small>` : ''}</span></li>`,
      )
      .join('')}</ul>
    <details><summary>What the writer was given</summary><pre>${esc(r.out.input)}</pre></details>
  </div>`;
}

export function renderReview(meta, results) {
  const models = [...new Set(results.flatMap((r) => r.runs.map((x) => x.model)))];
  const allRuns = results.flatMap((r) => r.runs);
  const passing = allRuns.filter((r) => !r.error && !r.checks.some((c) => c.level === 'fail' && !c.ok)).length;
  const summaryRows = results
    .map((item) => {
      const cells = models
        .map((m) => {
          const r = item.runs.find((x) => x.model === m);
          if (!r) return '<td>–</td>';
          if (r.error) return '<td><span class="pill bad">Error</span></td>';
          const f = r.checks.filter((c) => c.level === 'fail' && !c.ok).length;
          const l = r.checks.filter((c) => c.level === 'look' && !c.ok).length;
          return `<td><span class="pill ${f ? 'bad' : l ? 'warn' : 'good'}">${f ? `${f} broken` : l ? `${l} to look at` : 'Pass'}</span></td>`;
        })
        .join('');
      return `<tr><td><a href="#${esc(item.scenario.id)}">${esc(item.scenario.title)}</a>${item.scenario.real ? ' <span class="pill real">real</span>' : ''}</td><td>${esc(OFFER_NAMES[item.offer.kind] || item.offer.kind)}</td>${cells}</tr>`;
    })
    .join('');

  return `<title>Brief Writer Corpus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap">
<style>
/* Layout: a run header and summary table, then one section per day with a chat column per model. */
:root {
  --bg: #F9F6F1; --surface: #FFFFFF; --surface-2: #F3EEE5; --ink: #1A3328; --muted: rgba(26,51,40,.62);
  --line: rgba(46,85,64,.14); --moss: #2E5540; --on-moss: #FFFFFF; --sage: #E7EFE8;
  --good: #2E6B45; --good-bg: #E3EFE5; --warn: #8A5E0E; --warn-bg: #F5EDCF; --bad: #A33A2B; --bad-bg: #F6E1DC;
  --real: #4A4E7A; --real-bg: #E6E8F7;
  --display: 'Bricolage Grotesque', 'Figtree', system-ui, sans-serif;
  --body: 'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121A16; --surface: #1A2520; --surface-2: #213029; --ink: #E4EDE6; --muted: rgba(228,237,230,.62);
  --line: rgba(228,237,230,.12); --moss: #7FB394; --on-moss: #0F1A14; --sage: #22332A;
  --good: #8FD0A6; --good-bg: #1E3528; --warn: #E3BD6A; --warn-bg: #3A2F17; --bad: #F09A8A; --bad-bg: #3D221D;
  --real: #B9BEF0; --real-bg: #2A2D45; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #121A16; --surface: #1A2520; --surface-2: #213029; --ink: #E4EDE6; --muted: rgba(228,237,230,.62);
  --line: rgba(228,237,230,.12); --moss: #7FB394; --on-moss: #0F1A14; --sage: #22332A;
  --good: #8FD0A6; --good-bg: #1E3528; --warn: #E3BD6A; --warn-bg: #3A2F17; --bad: #F09A8A; --bad-bg: #3D221D;
  --real: #B9BEF0; --real-bg: #2A2D45; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 40px; }
h1, h2 { font-family: var(--display); text-wrap: balance; margin: 0; letter-spacing: -.01em; }
h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.35rem; font-weight: 700; }
header p, .look { color: var(--muted); max-width: 68ch; margin: 6px 0 0; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; font-size: .85rem; color: var(--muted); }
.meta b { color: var(--ink); font-weight: 600; }
.score { font-family: var(--display); font-size: 1.1rem; color: var(--ink); }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .92rem; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; }
td a { color: var(--ink); text-decoration-color: var(--line); text-underline-offset: 3px; }
td a:hover, td a:focus-visible { text-decoration-color: var(--moss); }
.pill { display: inline-block; font-size: .74rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
.pill.good { background: var(--good-bg); color: var(--good); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.bad { background: var(--bad-bg); color: var(--bad); }
.pill.real { background: var(--real-bg); color: var(--real); }
section { display: grid; gap: 14px; scroll-margin-top: 16px; }
.sec-head { display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 22px; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .84rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.facts b { color: var(--ink); font-weight: 600; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
.col { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: grid; gap: 14px; align-content: start; }
.col-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .85rem; }
.col-head b { font-family: var(--mono); font-weight: 400; font-size: .8rem; }
.ms { margin-left: auto; color: var(--muted); font-size: .78rem; font-variant-numeric: tabular-nums; }
.thread { display: grid; gap: 8px; background: var(--surface-2); border-radius: 12px; padding: 14px; }
.bubble { justify-self: start; max-width: 92%; background: var(--surface); border: 1px solid var(--line); border-radius: 4px 16px 16px 16px; padding: 9px 13px; font-size: .95rem; }
.bubble.dropped { opacity: .7; text-decoration: line-through; border-style: dashed; }
.bubble small, .checks small { display: block; color: var(--muted); font-size: .78rem; text-decoration: none; margin-top: 2px; }
.daycard { display: flex; flex-wrap: wrap; gap: 4px 12px; background: var(--sage); border-radius: 12px; padding: 10px 13px; font-size: .8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.dc-label { width: 100%; font-size: .68rem; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; color: var(--moss); }
.chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.chip { border: 1px solid var(--moss); color: var(--moss); border-radius: 999px; padding: 5px 12px; font-size: .82rem; font-weight: 500; }
.chip.primary { background: var(--moss); color: var(--on-moss); }
.after { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); text-align: center; padding-top: 4px; }
.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; font-size: .86rem; }
.checks li { display: grid; grid-template-columns: 18px 1fr; gap: 6px; min-width: 0; }
.checks li > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.checks .ok { color: var(--muted); }
.checks .ok .mark { color: var(--good); }
.checks .fail .mark { color: var(--bad); font-weight: 700; }
.checks .look .mark { color: var(--warn); font-weight: 700; }
details summary { cursor: pointer; font-size: .84rem; color: var(--moss); font-weight: 600; }
details summary:focus-visible { outline: 2px solid var(--moss); outline-offset: 2px; border-radius: 4px; }
pre { font: .74rem/1.55 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface-2); border-radius: 10px; padding: 12px; margin: 10px 0 0; }
.err { color: var(--bad); font-size: .86rem; overflow-wrap: anywhere; }
.empty { color: var(--muted); }
</style>
<div class="wrap">
  <header>
    <h1>Brief writer corpus</h1>
    <p>Each made-up day goes through the real writer and offer rule. Read the briefs as they would sit in the chat, under the day card. A ✕ is a rule the brief broke; a ? is something only a person can judge.</p>
    <div class="meta">
      <span class="score">${passing} of ${allRuns.length} briefs keep every rule</span>
      <span>Prompt <b>${esc(meta.promptVersion)}</b></span>
      <span>Models <b>${esc(meta.models.join(', '))}</b></span>
      <span>Run <b>${esc(meta.stamp.replace('T', ' '))} UTC</b></span>
    </div>
  </header>
  <div class="table-wrap"><table>
    <thead><tr><th>Day</th><th>Offer (decided in code)</th>${models.map((m) => `<th>${esc(m)}</th>`).join('')}</tr></thead>
    <tbody>${summaryRows}</tbody>
  </table></div>
  ${results
    .map((item) => {
      const s = item.scenario;
      const snap = item.snapshot;
      return `<section id="${esc(s.id)}">
        <div class="sec-head">
          <h2>${esc(s.title)}${s.real ? ' <span class="pill real">real</span>' : ''}</h2>
          <p class="look">${esc(s.look)}</p>
          <div class="facts">
            <span><b>${esc(weekday(snap.today))}</b> at <b>${esc(hhmm(snap.now))}</b></span>
            <span>Offer <b>${esc(OFFER_NAMES[item.offer.kind] || item.offer.kind)}</b>${item.offer.plan ? ` from ${esc(hhmm(item.offer.plan.gapFrom))}` : ''}</span>
            <span>Plan candidates <b>${snap.candidates}</b></span>
            <span>Clear ahead <b>${esc(snap.free.filter((f) => f.to - Math.max(f.from, snap.now) >= 45).map((f) => `${hhmm(Math.max(f.from, snap.now))}–${hhmm(f.to)}`).join(', ') || 'none')}</b></span>
          </div>
        </div>
        <div class="cols">${models.map((m) => runColumn(item.runs.find((x) => x.model === m), item)).join('')}</div>
      </section>`;
    })
    .join('')}
</div>`;
}
