// Gold answers from the two blind labellers, with James's review overriding
// both wherever data/review_turns.json or data/review_chats.json has an entry.
import { readFileSync, existsSync } from 'node:fs';
import { DATA } from './paths.mjs';

const load = (f) => (existsSync(DATA + f) ? JSON.parse(readFileSync(DATA + f, 'utf8')) : []);
export const FIELDS = ['mode', 'depth', 'search', 'personal'];

export function turnGold() {
  const A = Object.fromEntries(load('labels_turns_A.json').map((x) => [x.id, x]));
  const B = Object.fromEntries(load('labels_turns_B.json').map((x) => [x.id, x]));
  const R = Object.fromEntries(load('review_turns.json').map((x) => [x.id, x]));
  const gold = {};
  for (const id of Object.keys(A)) {
    if (!B[id]) continue;
    const g = { id };
    for (const f of FIELDS) {
      const r = R[id]?.[f];
      if (r) {
        // James's answer: his primary, and he may list what else he accepts.
        g[f] = { primary: r, both: R[id][f + '_ok'] || [r], either: R[id][f + '_ok'] || [r], by: 'james' };
      } else {
        const a = A[id][f + '_ok'], b = B[id][f + '_ok'];
        g[f] = { primary: A[id][f] === B[id][f] ? A[id][f] : null, both: a.filter((v) => b.includes(v)), either: [...new Set([...a, ...b])], by: 'labellers', A: A[id][f], B: B[id][f] };
      }
    }
    gold[id] = g;
  }
  return gold;
}

// Token overlap used to decide whether two item descriptions are the same thing.
export const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || []);
export const jac = (a, b) => { const u = new Set([...a, ...b]); let i = 0; for (const x of a) if (b.has(x)) i++; return u.size ? i / u.size : 0; };
const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'with', 'my', 'his', 'her', 'their', 'is', 'be', 'up', 'this', 'that', 'it']);
export const keyToks = (s) => new Set([...toks(s)].filter((t) => !STOP.has(t)));
export function sameThing(a, b) {
  return jac(keyToks(a), keyToks(b)) >= 0.3;
}

/**
 * Chat gold: items both labellers listed (paired by the judge in
 * data/chat_pairs.json, on meaning rather than wording) with the same type are
 * `gold`; items only one listed, pairs whose types differ, and anything either
 * flagged borderline are `borderline` (a model is neither right nor wrong to
 * offer them). James's review replaces both for a chat.
 */
export function chatGold() {
  const A = Object.fromEntries(load('labels_chats_A.json').map((x) => [x.chat, x]));
  const B = Object.fromEntries(load('labels_chats_B.json').map((x) => [x.chat, x]));
  const R = Object.fromEntries(load('review_chats.json').map((x) => [x.chat, x]));
  const P = existsSync(DATA + 'chat_pairs.json') ? JSON.parse(readFileSync(DATA + 'chat_pairs.json', 'utf8')) : {};
  const gold = {};
  for (const id of Object.keys(A)) {
    if (!B[id]) continue;
    if (R[id]) {
      gold[id] = { chat: id, gold: R[id].items || [], borderline: R[id].borderline || [], by: 'james' };
      continue;
    }
    const a = A[id], b = B[id];
    const bordIds = (l) => new Set((l.borderline || []).filter((x) => typeof x === 'string'));
    const bordExtra = (l) => (l.borderline || []).filter((x) => typeof x !== 'string');
    const aB = bordIds(a), bB = bordIds(b);
    const pairs = P[id] || [];
    const pairedA = new Map(pairs.map((p) => [p.left, p.right])), pairedB = new Set(pairs.map((p) => p.right));
    const agreed = [], bl = [];
    for (const ia of a.items) {
      const rid = pairedA.get(ia.id);
      const ib = rid ? b.items.find((x) => x.id === rid) : null;
      if (ib && ib.type === ia.type && !aB.has(ia.id) && !bB.has(ib.id)) agreed.push({ id: ia.id, type: ia.type, gist: ia.gist, alt: ib.gist });
      else bl.push({ id: ia.id, type: ia.type, gist: ia.gist, why: ib ? (ib.type !== ia.type ? `type: A ${ia.type}, B ${ib.type}` : 'flagged borderline') : 'only A listed it' });
    }
    for (const ib of b.items) if (!pairedB.has(ib.id)) bl.push({ id: 'B_' + ib.id, type: ib.type, gist: ib.gist, why: 'only B listed it' });
    for (const x of bordExtra(a)) bl.push({ id: 'Ax_' + bl.length, type: x.type, gist: x.gist, why: 'A left it out as borderline' });
    for (const x of bordExtra(b)) bl.push({ id: 'Bx_' + bl.length, type: x.type, gist: x.gist, why: 'B left it out as borderline' });
    gold[id] = { chat: id, gold: agreed, borderline: bl, by: 'labellers', A: a.items, B: b.items };
  }
  return gold;
}
