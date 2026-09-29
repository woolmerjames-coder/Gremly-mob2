// Pair the two labellers' items per chat with the judge, so agreement is
// judged on meaning rather than wording. Writes data/chat_pairs.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { DATA } from './paths.mjs';
import { pairItems, saveCache } from './judge.mjs';
const A = JSON.parse(readFileSync(DATA + 'labels_chats_A.json', 'utf8'));
const B = Object.fromEntries(JSON.parse(readFileSync(DATA + 'labels_chats_B.json', 'utf8')).map((x) => [x.chat, x]));
const out = {};
let n = 0;
for (const a of A) {
  const b = B[a.chat]; if (!b) continue;
  const pairs = await pairItems(a.items.map((i) => ({ id: i.id, type: i.type, text: i.gist })), b.items.map((i) => ({ id: i.id, type: i.type, text: i.gist })));
  out[a.chat] = pairs;
  if (++n % 25 === 0) { console.error(n); saveCache(); }
}
saveCache();
writeFileSync(DATA + 'chat_pairs.json', JSON.stringify(out, null, 1));
const paired = Object.values(out).reduce((s, p) => s + p.length, 0);
console.log(`paired ${paired} items across ${Object.keys(out).length} chats`);
