// The chat writer test (agent plan step 9, "Choosing chat's writer").
//
// Replays real Ask Gremly turns through the live chat path, changing only the
// model that writes the reply: the same triage (Luna, one call, as wrangler.toml
// runs it), the same life context (buildChatContext, the profile, today's
// activity) and the same persona (buildGeneralChatConfig). Every writer gets the
// same instructions and the same conversation, so what differs is the writer.
//
// The person's records are served from fixtures/db.json, read once from the
// database (the queries are listed by --record), so nothing here writes to it.
//
//   scripts/writer-test/run.sh --record            list the database reads it needs
//   scripts/writer-test/run.sh [--only id,id] [--models a,b] [--skip n] [--limit n]
//
// Keys come from the environment: OPENAI_API_KEY, GEMINI_TEST_API_KEY.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { triageMessage } from '../../workers/cortex/triage.js';
import { buildChatContext } from '../../workers/cortex/context/chatProjection.js';
import { getUserProfile } from '../../workers/cortex/context/userProfile.js';
import { buildTodayActivity } from '../../workers/cortex/context/todayActivity.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { configureModels } from '../../workers/cortex/models.js';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = `${HERE}out/`;
const FIX = `${HERE}fixtures/`;
const USER = '05a3c53d-b242-4b5f-a0db-83004c8e3892';
const TZ = 'America/Los_Angeles';
const DB = 'https://db.writer-test';

// price per 1M tokens: in, cached in, out (workers/shared/aiUsage.js)
export const WRITERS = {
  preview: { provider: 'gemini', model: 'gemini-3-flash-preview', price: [0.5, 0.05, 3] },
  'flash-3.7': { provider: 'gemini', model: 'gemini-3.7-flash', price: [0.75, 0.075, 3.75] },
  'flash-3.8': { provider: 'gemini', model: 'gemini-3.8-flash', price: [0.75, 0.075, 3.75] },
  'flash-lite-3.5': { provider: 'gemini', model: 'gemini-3.5-flash-lite', price: [0.3, 0.03, 2.5] },
  luna: { provider: 'openai', model: 'gpt-6-luna', effort: 'low', price: [0.1, 0.01, 0.5] },
  'luna-none': { provider: 'openai', model: 'gpt-6-luna', effort: 'none', price: [0.1, 0.01, 0.5] },
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const RECORD = args.includes('--record');
const only = flag('--only')?.split(',') || null;
const models = (flag('--models') || Object.keys(WRITERS).join(',')).split(',');
const limit = Number(flag('--limit') || 0);
const skip = Number(flag('--skip') || 0);

// ── the database, from fixtures ───────────────────────────────────────────────
const seen = new Map();
const fixtures = !RECORD && existsSync(`${FIX}db.json`) ? JSON.parse(readFileSync(`${FIX}db.json`, 'utf8')) : {};

/** The key a read is stored under: the table or rpc, and the query without volatile times. */
export function readKey(url, body) {
  const u = new URL(url);
  const path = u.pathname.replace('/rest/v1/', '');
  if (path.startsWith('rpc/')) {
    const a = body ? JSON.parse(body) : {};
    return `${path} ${JSON.stringify(a)}`;
  }
  const q = [...u.searchParams.entries()]
    .map(([k, v]) => `${k}=${v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<time>')}`)
    .join('&');
  return `${path}?${q}`;
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const s = String(url);
  if (!s.startsWith(DB)) return realFetch(url, init);
  const key = readKey(s, init.body);
  seen.set(key, (seen.get(key) || 0) + 1);
  const rows = key in fixtures ? fixtures[key] : key.startsWith('rpc/') ? null : [];
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const env = {
  SUPABASE_URL: DB,
  SUPABASE_SERVICE_KEY: 'fixtures',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  // as wrangler.toml runs chat
  HELPER_MODEL: 'gpt-6-luna',
  HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
  MODEL_TRIAGE: 'gpt-6-luna',
  TRIAGE_ONE_CALL: 'on',
  CHAT_EXTRACTION_V2: 'on',
  SEARCH_REQUIRED_FORCES: 'off',
};
configureModels(env);

// ── one turn's instructions, as the Worker builds them ────────────────────────
function previousExchange(messages) {
  let assistantMsg = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!assistantMsg && messages[i].role === 'assistant') assistantMsg = messages[i].content;
    else if (assistantMsg && messages[i].role === 'user')
      return { userMsg: messages[i].content, assistantMsg };
  }
  return null;
}

async function instructionsFor(c) {
  const messages = c.history.map((m) => ({ role: m.role, content: m.content }));
  const [chatContext, profile, todayAct] = await Promise.all([
    buildChatContext(USER, 'general', { message: c.text, timezone: TZ, currentChatId: null }, env),
    getUserProfile(USER, env),
    buildTodayActivity(USER, TZ, env),
  ]);
  const triage = RECORD
    ? { mode: 'chit_chat', search: 'none', personal: 'light', depth: 'brief' }
    : await triageMessage({
        userMessage: c.text,
        previousExchange: previousExchange(messages),
        runningSummary: '',
        chatType: 'general',
        env,
        domainNames: [],
        profileSnippet: profile?.profileText?.slice(0, 150) || '',
        messageCount: messages.length,
      });
  const gen = buildGeneralChatConfig(
    triage,
    { runningSummary: '' },
    null,
    chatContext,
    profile?.profileText,
    TZ,
    todayAct,
  );
  return { messages, triage, gen };
}

// ── the writers, streamed so the first word can be timed ──────────────────────
async function readSse(res, onData) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        onData(JSON.parse(data));
      } catch {
        // a partial line
      }
    }
  }
}

async function writeGemini(spec, gen, messages) {
  const t0 = Date.now();
  let first = null;
  let text = '';
  let usage = null;
  const body = {
    systemInstruction: { parts: [{ text: gen.systemPrompt }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: gen.temperature,
      maxOutputTokens: Math.max(gen.maxTokens || 0, 1024),
      thinkingConfig: { thinkingLevel: gen.thinkingLevel || 'low' },
    },
  };
  const res = await realFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GOOGLE_API_KEY },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  await readSse(res, (j) => {
    const parts = j.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.text && !p.thought) {
        if (first === null) first = Date.now() - t0;
        text += p.text;
      }
    }
    if (j.usageMetadata) usage = j.usageMetadata;
  });
  const u = {
    input: usage?.promptTokenCount || 0,
    cached: usage?.cachedContentTokenCount || 0,
    output: (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0),
    thinking: usage?.thoughtsTokenCount || 0,
  };
  return { text, first_ms: first, ms: Date.now() - t0, usage: u };
}

async function writeOpenAI(spec, gen, messages) {
  const t0 = Date.now();
  let first = null;
  let text = '';
  let usage = null;
  const res = await realFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: spec.model,
      instructions: gen.systemPrompt,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      reasoning: { effort: spec.effort },
      max_output_tokens: Math.max(gen.maxTokens || 0, 1024) + 2000,
      stream: true,
    }),
  });
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  await readSse(res, (j) => {
    if (j.type === 'response.output_text.delta' && j.delta) {
      if (first === null) first = Date.now() - t0;
      text += j.delta;
    }
    if (j.type === 'response.completed') usage = j.response?.usage;
  });
  const cached = usage?.input_tokens_details?.cached_tokens || 0;
  const u = {
    input: usage?.input_tokens || 0,
    cached,
    output: usage?.output_tokens || 0,
    thinking: usage?.output_tokens_details?.reasoning_tokens || 0,
  };
  return { text, first_ms: first, ms: Date.now() - t0, usage: u };
}

function costOf(spec, u) {
  if (!u) return 0;
  const [pin, pcached, pout] = spec.price;
  return ((u.input - u.cached) * pin + u.cached * pcached + u.output * pout) / 1e6;
}

async function write(key, gen, messages) {
  const spec = WRITERS[key];
  const r =
    spec.provider === 'openai'
      ? await writeOpenAI(spec, gen, messages)
      : await writeGemini(spec, gen, messages);
  return { model: key, ...r, cost: r.usage ? costOf(spec, r.usage) : 0 };
}

// ── run ───────────────────────────────────────────────────────────────────────
let cases = JSON.parse(readFileSync(`${OUT}cases.json`, 'utf8'));
if (only) cases = cases.filter((c) => only.includes(c.id));
cases = cases.slice(skip, limit ? skip + limit : undefined);

if (RECORD) {
  for (const c of cases) await instructionsFor(c);
  mkdirSync(FIX, { recursive: true });
  writeFileSync(`${FIX}reads.json`, JSON.stringify([...seen.keys()].sort(), null, 1));
  console.log(`${seen.size} distinct reads, listed in fixtures/reads.json`);
  process.exit(0);
}

const missing = () => [...seen.keys()].filter((k) => !(k in fixtures));
const results = [];
for (const c of cases) {
  const { messages, triage, gen } = await instructionsFor(c);
  const replies = await Promise.all(models.map((m) => write(m, gen, messages)));
  results.push({
    id: c.id,
    mode_gold: c.mode,
    triage,
    prompt_chars: gen.systemPrompt.length,
    text: c.text,
    replies,
  });
  const line = replies
    .map((r) => `${r.model} ${r.error ? 'ERR' : `${r.first_ms}ms ${(r.cost * 100).toFixed(3)}c`}`)
    .join(' · ');
  console.log(`${c.id} ${triage.mode}: ${line}`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
writeFileSync(`${OUT}writers-${stamp}.json`, JSON.stringify({ models, results }, null, 1));
if (missing().length) console.log(`reads with no fixture (served empty): ${missing().length}`);
console.log(`saved out/writers-${stamp}.json`);
