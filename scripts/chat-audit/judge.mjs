// A fixed judge model (gpt-4.1, not a candidate) decides whether two item
// descriptions refer to the same thing. Used to pair the two labellers' items
// and to match a model's offered items to the gold list. Results are cached
// by content so reruns cost nothing and stay stable.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RESULTS } from './paths.mjs';
import { keys } from './keys.mjs';

const CACHE_FILE = RESULTS + 'judge-cache.json';
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
let dirty = 0;
export function saveCache() { if (dirty) { mkdirSync(RESULTS, { recursive: true }); writeFileSync(CACHE_FILE, JSON.stringify(cache)); dirty = 0; } }

const SYSTEM = `You match items that two different readers wrote down after reading the same conversation in a productivity app. Two entries are the same item when they refer to the same underlying thing the user would save: the same task, the same event, the same idea or the same habit, even if worded differently, given a different type, or one is more specific than the other. They are different items when they refer to different things, even if the topic is related.

You are given LEFT items and RIGHT items, each with an id. Return ONLY JSON: {"pairs":[{"left":"<id>","right":"<id>"}]}. Each id appears at most once. Leave out anything that has no match. An empty pairs list is fine.`;

/** @returns {Promise<Array<{left:string,right:string}>>} */
export async function pairItems(left, right, context = '') {
  if (!left.length || !right.length) return [];
  const body = { left: left.map((x) => ({ id: x.id, type: x.type, text: x.text })), right: right.map((x) => ({ id: x.id, type: x.type, text: x.text })) };
  const key = createHash('sha256').update(JSON.stringify([context, body])).digest('hex').slice(0, 24);
  if (cache[key]) return cache[key];
  const user = (context ? `Context: ${context}\n\n` : '') + `LEFT:\n${body.left.map((x) => `${x.id} [${x.type}] ${x.text}`).join('\n')}\n\nRIGHT:\n${body.right.map((x) => `${x.id} [${x.type}] ${x.text}`).join('\n')}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1', temperature: 0, max_tokens: 400, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    const data = await res.json();
    let pairs = [];
    try { pairs = JSON.parse(data.choices[0].message.content).pairs || []; } catch { pairs = []; }
    const L = new Set(left.map((x) => x.id)), R = new Set(right.map((x) => x.id)), usedL = new Set(), usedR = new Set();
    pairs = pairs.filter((p) => L.has(p.left) && R.has(p.right) && !usedL.has(p.left) && !usedR.has(p.right) && (usedL.add(p.left), usedR.add(p.right), true));
    cache[key] = pairs; dirty++;
    return pairs;
  }
  throw new Error('judge unavailable');
}
