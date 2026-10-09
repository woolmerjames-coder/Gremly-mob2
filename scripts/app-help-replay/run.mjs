/**
 * The app help replay (gremlyPersona.js MODE_TEMPLATES.app_help and
 * GENERAL_INTRO): questions about how Gremly works, sent as the first message
 * of a new Ask Gremly chat. Each goes through triage as the Worker runs it,
 * then to the quick lane's writer as cortex-index.js calls it. A reply must
 * describe the app as it is now: Today, the Gremly tab with Drop and Chat,
 * Worlds with their Chapters, and Your story; Spaces, the Sweep and Guides and
 * Logs are gone.
 *
 *   scripts/app-help-replay/run.sh [--only id,id] [--repeat n]
 *
 * Every name and message is made up. OPENAI_API_KEY and GEMINI_TEST_API_KEY
 * come from the environment. Writes out/ (gitignored).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triageMessage } from '../../workers/cortex/triage.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { configureModels } from '../../workers/cortex/models.js';
import { geminiStream, parseGeminiChunk } from '../../workers/cortex/geminiClient.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only');
const repeat = Math.max(1, Number(flag('--repeat') || 1));

const LUNA = 'gpt-6-luna';
// as cortex's wrangler.toml runs Ask Gremly
const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  CHAT_MODEL: 'gemini-3-flash-preview',
  HELPER_MODEL: LUNA,
  MODEL_TRIAGE: LUNA,
  MODEL_TRIAGE_MODE: 'gpt-4.1-mini',
  MODEL_TRIAGE_SIGNALS: 'gpt-4.1-mini',
  TRIAGE_ONE_CALL: 'on',
  CHAT_MODEL_ASK: LUNA,
  CHAT_EFFORT_ASK: 'low',
};
configureModels(env);

const TZ = 'Europe/London';
const PROFILE = 'IDENTITY: Alex (they/them). Alex works in client services and lives with their partner Jo.';

// What no reply may name: things the app no longer has
const GONE = /\bsweep\b|guides? (&|and) logs|add to space|spaces tab|inside each space|organi[sz]e button|mind drop tab/i;
// Spaces as a feature they have (only the question about where Spaces went may name them)
const SPACES = /\bSpaces\b|\b(your|a|the|each|its own) Space\b/;

const MESSAGES = [
  { id: 'add', text: 'How do I add something?', mentions: /drop|chat/i },
  { id: 'worlds', text: 'What are Worlds?', mentions: /chapter/i },
  { id: 'spaces', text: 'Where have my Spaces gone?', mentions: /world/i, spacesOk: true },
  { id: 'evening', text: 'How does the evening thing work?', mentions: /wrap/i },
  { id: 'story', text: "Where can I see everything I've done this year?", mentions: /story/i },
  { id: 'chapter', text: 'How do I start a Chapter?', mentions: /world/i },
];

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

async function runOne(m) {
  const started = Date.now();
  try {
    const triage = await triageMessage({
      userMessage: m.text,
      previousExchange: null,
      runningSummary: '',
      chatType: 'general',
      env,
      domainNames: [],
      profileSnippet: PROFILE,
      messageCount: 1,
    });
    const gen = buildGeneralChatConfig(triage, { runningSummary: '' }, null, null, PROFILE, TZ, null);
    const res = await geminiStream(
      gen.systemPrompt,
      [{ role: 'system', content: gen.systemPrompt }, { role: 'user', content: m.text }],
      {
        label: 'general_chat',
        temperature: gen.temperature,
        maxOutputTokens: gen.maxTokens,
        thinkingLevel: gen.thinkingLevel,
        model: LUNA,
        effort: 'low',
      },
      env.GOOGLE_API_KEY,
    );
    if (!res.ok || !res.body) return { id: m.id, ok: false, error: `${res.status} ${String(res.error).slice(0, 200)}` };
    let text = '';
    await readSse(res, (j) => {
      const c = parseGeminiChunk(JSON.stringify(j));
      if (c.text) text += c.text;
    });
    const reply = text.replace(/<!--SAVE:[\s\S]*?-->/g, '').trim();
    const checks = [
      { name: 'Names nothing the app no longer has', ok: !GONE.test(reply), detail: (reply.match(GONE) || [])[0] || '' },
    ];
    if (!m.spacesOk) checks.push({ name: 'Never names Spaces', ok: !SPACES.test(reply), detail: (reply.match(SPACES) || [])[0] || '' });
    const warns = m.mentions ? [{ name: `Mentions ${m.mentions}`, ok: m.mentions.test(reply) }] : [];
    return { id: m.id, ok: checks.every((c) => c.ok), ms: Date.now() - started, mode: triage.mode, lane: triage.lane, checks, warns, reply };
  } catch (err) {
    return { id: m.id, ok: false, ms: Date.now() - started, error: String(err?.message || err) };
  }
}

const messages = only ? MESSAGES.filter((m) => only.split(',').includes(m.id)) : MESSAGES;
const jobs = messages.flatMap((m) => Array.from({ length: repeat }, () => m));
console.log(`${jobs.length} app help replies`);
const results = await Promise.all(jobs.map(runOne));
for (const r of results) {
  const why = r.error || (r.checks || []).filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ');
  const warn = (r.warns || []).filter((w) => !w.ok).map((w) => `warn: ${w.name}`).join('; ');
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id} · ${r.mode}/${r.lane} · ${r.ms}ms${why ? ` · ${why}` : ''}${warn ? ` · ${warn}` : ''}`);
  if (r.reply) console.log(`      ${r.reply.replace(/\s+/g, ' ').slice(0, 900)}`);
}
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} describe only what the app has`);
const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
