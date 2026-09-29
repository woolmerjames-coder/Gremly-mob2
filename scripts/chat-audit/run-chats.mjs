// Run the Ask Gremly background extraction for one model over a chat set,
// with the Worker's own prompt (workers/cortex/chatPrompts.js) and settings.
// Usage: node run-chats.mjs <modelKey> <dev|test> <tag> [concurrency] [maxCalls]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DATA, RESULTS, WORKER, url } from './paths.mjs';
import { MODELS } from './models.mjs';
import { callModel, pool, setBudget, budgetUsed } from './call.mjs';
import { parseJson } from './triage-jobs.mjs';
import { applyExtractionV2, evidenceGrounded } from './prompts/variants.mjs';

const { buildChatExtractionPrompt } = await import(url(WORKER + 'chatPrompts.js'));

const [modelKey, set, tag, concArg, maxArg, promptArg] = process.argv.slice(2);
const promptVariant = promptArg || 'v1';
if (!MODELS[modelKey] || !['dev', 'test', 'smoke'].includes(set) || !tag) {
  console.error('Usage: node run-chats.mjs <modelKey> <dev|test> <tag> [concurrency] [maxCalls]');
  process.exit(1);
}
const concurrency = Number(concArg || 4);
setBudget(Number(maxArg || 2000));
const chats = JSON.parse(readFileSync(`${DATA}chats_${set}.json`, 'utf8'));
const t0 = Date.now();
let done = 0;

// The Worker formats today in the user's timezone; for a stored chat we use the
// day of its last message so date resolution is judged against the right day.
function todayFor(chat) {
  const last = chat.messages[chat.messages.length - 1].at; // 'YYYY-MM-DD HH:MM'
  const d = new Date(last.slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
}

async function runChat(chat) {
  const recent = chat.messages.slice(-20);
  const conversationText = recent.map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.text}`).join('\n\n');
  let system = buildChatExtractionPrompt({ todayStr: todayFor(chat), runningSummary: null, conversationText, handledIds: [], existingItemsBlock: '' });
  if (promptVariant === 'v2') system = applyExtractionV2(system);
  const r = await callModel(modelKey, { system, user: 'Extract items from the conversation above.', maxTokens: 500, temperature: 0.1 });
  const j = r.ok ? parseJson(r.content) : null;
  let items = Array.isArray(j?.extractions) ? j.extractions : null;
  let dropped = 0;
  if (items && promptVariant === 'v2') {
    const userMsgs = recent.filter((m) => m.role === 'user').map((m) => m.text);
    const kept = items.filter((x) => evidenceGrounded(x.evidence, userMsgs));
    dropped = items.length - kept.length;
    items = kept;
  }
  return {
    chat: chat.chat,
    parsed: !!j,
    dropped,
    items: (items || []).map((x) => ({ type: x.type, title: x.title, body: x.body ?? null, evidence: x.evidence ?? null, confidence: x.confidence ?? null, due_date: x.due_date ?? null, resolved_date: x.resolved_date ?? null })),
    chat_summary: j?.chat_summary || null,
    call: { ok: r.ok, status: r.status, ms: r.ms, attempts: r.attempts, usage: r.usage || null, cost: r.cost || 0, finish: r.finish || null, error: r.error || null, content: r.ok && !j ? (r.content || '').slice(0, 300) : undefined },
  };
}

const rows = await pool(chats, concurrency, runChat, () => {
  done++;
  if (done % 25 === 0) console.error(`${done}/${chats.length} ${Math.round((Date.now() - t0) / 1000)}s`);
});
mkdirSync(RESULTS, { recursive: true });
writeFileSync(`${RESULTS}chats_${set}_${tag}.json`, JSON.stringify({ modelKey, model: MODELS[modelKey].model, set, tag, promptVariant, concurrency, ran_at: new Date().toISOString(), wall_s: Math.round((Date.now() - t0) / 1000), calls: budgetUsed(), rows }));
const failed = rows.filter((r) => !r.call.ok).length, unparsed = rows.filter((r) => r.call.ok && !r.parsed).length;
const nItems = rows.reduce((s, r) => s + r.items.length, 0);
const cost = rows.reduce((s, r) => s + r.call.cost, 0);
const ms = rows.map((r) => r.call.ms).sort((a, b) => a - b);
const nDropped = rows.reduce((s, r) => s + (r.dropped || 0), 0);
console.log(`${modelKey} ${promptVariant} ${set}: ${rows.length} chats, ${nItems} items proposed (${nDropped} dropped by the evidence check), ${failed} failed calls, ${unparsed} unparseable, p50 ${ms[Math.floor(ms.length / 2)]}ms p90 ${ms[Math.floor(ms.length * 0.9)]}ms, $${cost.toFixed(4)}, ${Math.round((Date.now() - t0) / 1000)}s`);
