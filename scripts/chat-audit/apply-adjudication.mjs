// Turn the adjudicator's decisions into the review files gold.mjs reads.
// data/adjudicated_turns.json and data/adjudicated_chats.json come from an
// adjudicator with the app context (ADJUDICATION_CONTEXT.md); James's own
// answers, when he gives them, are applied on top by editing these outputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { DATA } from './paths.mjs';
import { chatGold } from './gold.mjs';

const turns = JSON.parse(readFileSync(DATA + 'adjudicated_turns.json', 'utf8'));
const byId = {};
for (const t of turns) {
  if (t.kind === 'agreed') continue; // unchanged by the adjudicator, labellers stand
  const r = (byId[t.id] ||= { id: t.id, by: 'adjudicator' });
  r[t.field] = t.answer;
  r[t.field + '_ok'] = t.ok;
  if (t.unsure) (r.unsure ||= []).push(t.field);
}
writeFileSync(DATA + 'review_turns.json', JSON.stringify(Object.values(byId), null, 1));

// Chats: rebuild gold and borderline per chat from the labellers' merge plus the decisions.
const decisions = JSON.parse(readFileSync(DATA + 'adjudicated_chats.json', 'utf8'));
const g = chatGold(); // labellers only, since review_chats.json is not written yet
const out = [];
const byChat = {};
for (const d of decisions) (byChat[d.chat] ||= []).push(d);
for (const [chat, ds] of Object.entries(byChat)) {
  const x = g[chat];
  const decided = new Map(ds.map((d) => [d.item, d]));
  const gold = x.gold.map((i) => ({ id: i.id, type: i.type, gist: i.gist }));
  const borderline = [];
  for (const b of x.borderline) {
    const d = decided.get(b.id);
    if (!d) { borderline.push({ id: b.id, type: b.type, gist: b.gist, why: b.why }); continue; }
    if (d.answer === 'offer') gold.push({ id: b.id, type: d.type || b.type, gist: b.gist, by: 'adjudicator' });
    else if (d.answer === 'either') borderline.push({ id: b.id, type: d.type || b.type, gist: b.gist, why: 'adjudicator: either' });
    // 'leave': dropped, so offering it now counts as a wrong offer
  }
  out.push({ chat, by: 'adjudicator', items: gold, borderline, unsure: ds.filter((d) => d.unsure).map((d) => d.item) });
}
writeFileSync(DATA + 'review_chats.json', JSON.stringify(out, null, 1));
console.log('review_turns', Object.keys(byId).length, 'turns |', 'review_chats', out.length, 'chats');
