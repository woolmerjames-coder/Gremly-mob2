// Score extraction runs against the chat gold.
// Usage: node score-chats.mjs <set> <tag1> [tag2 ...] [--live]   (--live also scores what production proposed at the time)
import { readFileSync } from 'node:fs';
import { RESULTS, DATA } from './paths.mjs';
import { chatGold } from './gold.mjs';
import { pairItems, saveCache } from './judge.mjs';


const args = process.argv.slice(2);
const live = args.includes('--live');
const [set, ...tags] = args.filter((a) => a !== '--live');
const gold = chatGold();
const chats = JSON.parse(readFileSync(`${DATA}chats_${set}.json`, 'utf8'));
const ids = chats.map((c) => c.chat).filter((id) => gold[id]);
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a');
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

async function scoreItems(id, items) {
  const g = gold[id];
  const left = items.map((it, i) => ({ id: 'm' + i, type: it.type, text: `${it.title || ''}${it.body ? ': ' + it.body : ''}` }));
  const right = [...g.gold.map((x) => ({ id: 'g_' + x.id, type: x.type, text: x.gist })), ...g.borderline.map((x, i) => ({ id: 'b_' + i, type: x.type, text: x.gist }))];
  const pairs = await pairItems(left, right);
  const usedGold = new Set();
  let hits = 0, wrong = 0, neutral = 0, typeWrong = 0;
  const wrongItems = [];
  items.forEach((it, i) => {
    const p = pairs.find((x) => x.left === 'm' + i);
    if (!p) { wrong++; wrongItems.push(it); return; }
    if (p.right.startsWith('g_')) { usedGold.add(p.right); hits++; const gi = g.gold.find((x) => 'g_' + x.id === p.right); if (gi && gi.type !== it.type) typeWrong++; }
    else neutral++;
  });
  const missed = g.gold.length - usedGold.size;
  return { hits, wrong, neutral, typeWrong, missed, goldN: g.gold.length, wrongItems };
}

const runs = tags.map((tag) => ({ tag, ...JSON.parse(readFileSync(`${RESULTS}chats_${set}_${tag}.json`, 'utf8')) }));
if (live) {
  const rows = chats.map((c) => ({ chat: c.chat, parsed: true, items: c.extracted_items.map((x) => ({ type: x.type, title: x.title, body: x.body })), call: { ok: true, ms: 0, cost: 0 } }));
  runs.unshift({ tag: 'live (what production proposed)', modelKey: 'gpt-4.1-mini or nano, at the time', rows, live: true });
}
const goldItems = ids.reduce((s, id) => s + gold[id].gold.length, 0);
console.log(`set ${set}: ${ids.length} chats with gold, ${goldItems} gold items, ${ids.reduce((s, id) => s + gold[id].borderline.length, 0)} borderline\n`);
const header = ['run', 'model', 'items offered', 'right', 'wrong offers', 'missed', 'chats w/ wrong offer', 'chats all found', 'unparsed', 'p50', 'p90', '$/1000 chats'];
const lines = [header];
const wrongByRun = {};
for (const run of runs) {
  const rows = Object.fromEntries(run.rows.map((r) => [r.chat, r]));
  let offered = 0, hits = 0, wrong = 0, missed = 0, chatsWrong = 0, chatsAll = 0, unparsed = 0;
  wrongByRun[run.tag] = [];
  for (const id of ids) {
    const r = rows[id]; if (!r) continue;
    if (!r.parsed) unparsed++;
    const s = await scoreItems(id, r.items);
    for (const it of s.wrongItems) wrongByRun[run.tag].push(`${id} ${it.type}: ${it.title}`);
    offered += r.items.length; hits += s.hits; wrong += s.wrong; missed += s.missed;
    if (s.wrong) chatsWrong++;
    if (!s.missed) chatsAll++;
  }
  const ms = ids.map((id) => rows[id]?.call.ms || 0);
  const cost = ids.reduce((s, id) => s + (rows[id]?.call.cost || 0), 0);
  lines.push([run.tag, run.modelKey, offered, `${hits} of ${goldItems} (${pct(hits, goldItems)})`, wrong, missed, `${chatsWrong} (${pct(chatsWrong, ids.length)})`, `${chatsAll} (${pct(chatsAll, ids.length)})`, unparsed, run.live ? '' : q(ms, 0.5) + 'ms', run.live ? '' : q(ms, 0.9) + 'ms', run.live ? '' : '$' + ((1000 * cost) / ids.length).toFixed(2)]);
}
const widths = header.map((_, i) => Math.max(...lines.map((l) => String(l[i]).length)));
for (const l of lines) console.log(l.map((c, i) => String(c).padEnd(widths[i])).join('  '));
console.log('\nright = offered item matches a gold item; wrong offer = matches nothing gold or borderline (the pill shows for nothing); missed = gold item never offered. Borderline items count neither way.');
for (const run of runs) {
  const examples = wrongByRun[run.tag];
  console.log(`\n${run.tag} wrong offers (first 8 of ${examples.length}):`); for (const e of examples.slice(0, 8)) console.log('  ' + e);
}
saveCache();
