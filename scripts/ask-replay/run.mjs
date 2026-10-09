/**
 * The Ask Gremly replay (data fabric stage 4e): does Ask Gremly use what
 * Gremly knows? One made up person (life.mjs) is read by the reader that
 * ships into a ledger held in memory, and her morning is made by the daily
 * picture that ships; that world is kept in out/world.json. Then each of a
 * dozen first messages to Ask Gremly, at its own time on the day, goes
 * through the live path: triage gives the lane, a lookup or a change goes to
 * the agent (agent/chat.js) and the rest to the quick lane's writer, each
 * reading the context the Worker builds (buildChatContext, the profile,
 * today so far). Settings to compare are variants (VARIANTS below): every
 * variant answers the same message after the same triage.
 *
 *   scripts/ask-replay/run.sh --build                 read the life and make the morning (resumes)
 *   scripts/ask-replay/run.sh [--variants live,flash] [--judges sol,flash-high] [--repeat n] [--only id,id] [--label name]
 *
 * Each reply is read by two judges, one from each writer's model family
 * (GPT 6 Sol and Gemini 3.8 Flash at high thinking, --judges to choose),
 * against what a close friend would know
 * (life.mjs FRIEND) and which of it bears on the message: whether the reply
 * brought each up and got it right, anything untrue, whether it would read
 * the same sent to anyone, and whether it recites their life back.
 *
 * The bar, set before the runs: every must on 9 in 10 replies, shoulds on
 * 7 in 10, nothing untrue, and no reply that recites.
 * OPENAI_API_KEY, GEMINI_TEST_API_KEY (and ANTHROPIC_API_KEY for --judges sonnet) come from the environment.
 * Writes out/ (gitignored). Nothing real is read or written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  USER,
  TZ,
  PERSON,
  TARGET,
  TABLES,
  RECORDS,
  PROFILE,
  FRIEND,
  DAY,
  NEVER,
  MESSAGES,
  at,
} from './life.mjs';
import { fakeDb, LIFE_SUPABASE_URL } from '../life-replay/fakeDb.mjs';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { readChunk, READER_PROMPT_VERSION } from '../../workers/inngest-jobs/context/reader.js';
import * as daily from '../../workers/inngest-jobs/context/daily.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { triageMessage } from '../../workers/cortex/triage.js';
import { buildChatContext } from '../../workers/cortex/context/chatProjection.js';
import { getUserProfile } from '../../workers/cortex/context/userProfile.js';
import { buildTodayActivity } from '../../workers/cortex/context/todayActivity.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { applyEntityCardToTriage, matchEntity, turnItemSections } from '../../workers/cortex/entityMatch.js';
import { configureModels } from '../../workers/cortex/models.js';
import { geminiStream, parseGeminiChunk } from '../../workers/cortex/geminiClient.js';
import { AGENT_LANES, runChatTurn } from '../../workers/cortex/agent/chat.js';
import { nextYearly } from '../../workers/shared/factTiming.js';
import { localDate } from '../../workers/shared/db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const WORLD = join(OUT, 'world.json');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

/**
 * The settings compared. writer: Ask Gremly's quick lane writer, as
 * CHAT_MODEL_ASK and CHAT_EFFORT_ASK set it (thinking: a Gemini writer's
 * thinking level in place of the one the reply's length asks for). agent:
 * the agent's model and thinking on the chat surface (AGENT_MODEL_CHAT,
 * AGENT_THINKING_CHAT). env: Worker vars the context reads.
 */
const LUNA = 'gpt-6-luna';
const FLASH = 'gemini-3.8-flash';
export const VARIANTS = {
  // as cortex's wrangler.toml runs Ask Gremly (low thinking from stage 4e)
  live: { writer: { model: LUNA, effort: 'low' }, agent: { model: LUNA } },
  // as it ran before stage 4e
  'luna-none': { writer: { model: LUNA, effort: 'none' }, agent: { model: LUNA } },
  'luna-low': { writer: { model: LUNA, effort: 'low' }, agent: { model: LUNA } },
  // Gemini 3.8 Flash cannot be run without thinking: low is its least
  flash: { writer: { model: FLASH }, agent: { model: FLASH } },
  // Ask Gremly's life as the brief reads it, a screen's worth (CHAT_LIFE)
  compact: { writer: { model: LUNA, effort: 'low' }, agent: { model: LUNA }, env: { CHAT_LIFE: 'compact' } },
};

// ── the clock, one per piece of work, so messages at different times run together

const RealDate = globalThis.Date;
const clock = new AsyncLocalStorage();
let baseOffset = 0;
const offsetNow = () => clock.getStore()?.offset ?? baseOffset;
class ReplayDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(RealDate.now() + offsetNow());
  }
  static now() {
    return RealDate.now() + offsetNow();
  }
}
globalThis.Date = ReplayDate;
const atTime = (iso, fn) => clock.run({ offset: RealDate.parse(iso) - RealDate.now() }, fn);

// ── the network ─────────────────────────────────────────────────────────────

const MODEL_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com'];
const realFetch = globalThis.fetch.bind(globalThis);
let current = null;
const usage = [];
const openaiStreams = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(LIFE_SUPABASE_URL)) {
    const u = new URL(url);
    if (u.pathname.endsWith('/ai_usage')) {
      try {
        const body = JSON.parse(init.body);
        usage.push(...(Array.isArray(body) ? body : [body]));
      } catch {
        // nothing to keep
      }
      return new Response('', { status: 201 });
    }
    return current.handle(url, init);
  }
  if (MODEL_HOSTS.includes(new URL(url).host)) {
    const res = await realFetch(input, init);
    // a streamed OpenAI reply: how many messages it held, read beside the caller
    if (new URL(url).host === 'api.openai.com' && /"stream":true/.test(String(init.body || ''))) {
      const job = aiContext.getStore()?.job || null;
      res
        .clone()
        .text()
        .then((raw) => {
          const items = [];
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === 'response.output_item.done' && ev.item?.type === 'message')
                items.push({ phase: ev.item.phase || null, chars: (ev.item.content || []).map((c) => c.text || '').join('').length });
            } catch {
              // a partial line
            }
          }
          openaiStreams.push({ job, items });
        })
        .catch(() => {});
    }
    return res;
  }
  return new Response(JSON.stringify({ ok: true, replay: true }), { status: 200 });
};
installAiUsageLogging();

const env = {
  SUPABASE_URL: LIFE_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CONTEXT_PIPELINE: 'on',
  // as cortex's wrangler.toml runs chat
  CHAT_MODEL: 'gemini-3-flash-preview',
  HELPER_MODEL: LUNA,
  HELPER_FALLBACK_MODEL: FLASH,
  MODEL_TRIAGE: LUNA,
  MODEL_TRIAGE_MODE: 'gpt-4.1-mini',
  MODEL_TRIAGE_SIGNALS: 'gpt-4.1-mini',
  TRIAGE_ONE_CALL: 'on',
  CHAT_EXTRACTION_V2: 'on',
  SEARCH_REQUIRED_FORCES: 'off',
  ENTITY_CARDS: 'on',
  CHAT_PILL_SPLIT: 'on',
  CHAT_MODEL_ASK: LUNA,
  CHAT_EFFORT_ASK: 'low',
  AGENT_CHAT: 'on',
  AGENT_MODEL_CHAT: LUNA,
  AGENT_FALLBACK_MODEL: FLASH,
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_') || k.startsWith('CONTEXT_EFFORT_'))),
};
configureModels(env);

// ── the database ────────────────────────────────────────────────────────────

const STOP = new Set(
  'a an and are as at be been but by can could did do does for from get got had has have he her him his how i if in into is it its just me my of on or our she should so some that the their them then there they this to was we were what when where which who why will with would you your am any about again'.split(' '),
);
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const terms = (text) =>
  new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .map((w) => w.replace(/'s$|'/g, ''))
      .filter((w) => w && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 3),
  );

function rpcs() {
  return {
    person_identity: () => [PERSON],
    absence_snapshot: () => null,
    usage_rollup: () => null,
    // public.recall_life_now searches the ledger in full text, any of the
    // message's words; this stands in for it, a word against a word
    recall_life_now: ({ p_query, p_limit = 12 }, mem) => {
      const q = terms(p_query);
      if (!q.size) return [];
      return (mem.tables.life_facts || [])
        .filter((f) => !['corrected', 'superseded'].includes(f.state))
        .map((f) => {
          const t = terms(`${f.statement} ${f.subject || ''}`);
          let rank = 0;
          for (const w of q) if (t.has(w)) rank += 1;
          return { f, rank };
        })
        .filter((x) => x.rank > 0)
        .sort((a, b) => b.rank - a.rank || String(b.f.about_date || '').localeCompare(String(a.f.about_date || '')))
        .slice(0, Math.max(1, Math.min(p_limit, 40)))
        .map(({ f, rank }) => ({
          source: 'fact',
          id: f.id,
          title: f.subject || null,
          body: f.statement,
          about_date: f.about_date || null,
          about_date_end: f.about_date_end || null,
          state: f.state,
          private: !!f.private,
          rank,
          said_by: f.said_by || 'person',
          source_table: f.source_table || null,
          source_kind: null,
          source_question: null,
          source_quote: f.source_quote || null,
          observed_at: f.observed_at || null,
        }));
    },
    // the ledger's dated things ahead, as public.dated_ahead gives them
    dated_ahead: ({ p_from, p_days = 42 }, mem) => {
      const last = new RealDate(RealDate.parse(`${p_from}T00:00:00Z`) + p_days * 864e5).toISOString().slice(0, 10);
      return (mem.tables.life_facts || [])
        .filter((f) => ['planned', 'current', 'unconfirmed'].includes(f.state) && f.about_date && f.timing !== 'standing')
        .map((f) => (f.timing === 'yearly' ? { ...f, about_date: nextYearly(f.about_date, p_from), about_date_end: null } : f))
        .filter((f) => (f.about_date_end || f.about_date) >= p_from && f.about_date <= last)
        .sort((a, b) => String(a.about_date).localeCompare(String(b.about_date)));
    },
  };
}

function startingTables() {
  return {
    ...JSON.parse(JSON.stringify(TABLES)),
    cortex_preferences: [{ owner_id: USER, day_boundary_hour: 3, gremly_age: 40 }],
    notification_preferences: [{ user_id: USER, timezone: TZ }],
    user_profiles: [{ user_id: USER, timezone: TZ, profile_text: PROFILE, identity: {}, signals: null }],
  };
}

// ── the world: the life read in order, then the morning ─────────────────────

async function build() {
  mkdirSync(OUT, { recursive: true });
  const saved = existsSync(WORLD) ? JSON.parse(readFileSync(WORLD, 'utf8')) : null;
  const fresh = !saved || saved.reader !== READER_PROMPT_VERSION;
  current = fakeDb(fresh ? startingTables() : saved.tables, rpcs());
  const done = new Set(fresh ? [] : saved.done);
  const keep = (extra = {}) =>
    writeFileSync(WORLD, JSON.stringify({ reader: READER_PROMPT_VERSION, done: [...done], tables: current.mem.tables, ...extra }));
  const byDay = new Map();
  for (const r of RECORDS) {
    const day = localDate(TZ, new RealDate(r.at));
    byDay.set(day, [...(byDay.get(day) || []), r]);
  }
  const started = RealDate.now();
  for (const [day, chunk] of byDay) {
    if (done.has(day)) continue;
    // leave room to save: the device call that runs this has a limit
    if (RealDate.now() - started > Number(flag('--for') || 140) * 1000) {
      console.log(`stopped for time after ${done.size} of ${byDay.size} days; run --build again`);
      return;
    }
    const when = new RealDate(RealDate.parse(chunk.at(-1).at) + 30 * 60e3).toISOString();
    await atTime(when, () =>
      aiContext.run({ env, worker: 'replay', job: 'ask-replay/read', userId: USER }, () =>
        readChunk(env, USER, TZ, chunk, `ask-${day}`),
      ),
    );
    done.add(day);
    keep();
    console.log(`read ${day} (${chunk.length})`);
  }
  if (!saved?.morning || fresh || args.includes('--morning')) {
    const dco = await atTime(at(TARGET, '05:00'), async () => {
      const built = await aiContext.run({ env, worker: 'replay', job: 'ask-replay/morning', userId: USER }, () =>
        daily.buildDcoV4(env, USER, { tz: TZ }),
      );
      await daily.writeDco(env, USER, built, { shadow: false });
      return built.dco;
    });
    keep({ morning: { lead: dco?.lead_story?.what || null, headline: dco?.brief_headline || null } });
    console.log(`morning: ${dco?.lead_story?.what || '(no lead)'}`);
  }
  const facts = current.mem.tables.life_facts || [];
  console.log(`world: ${facts.length} facts, ${(current.mem.tables.life_people || []).length} people`);
}

// ── one message ─────────────────────────────────────────────────────────────

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

/** The quick lane's writer, as cortex-index.js calls it for Ask Gremly. */
async function writeQuick(v, triageIn, context, profile, todayAct, message, match) {
  // the card the matcher found decides the reply's shape, as in cortex-index.js
  const card = match?.card || null;
  const triage = applyEntityCardToTriage(triageIn, card);
  const gen = buildGeneralChatConfig(triage, { runningSummary: '' }, null, context, profile?.profileText, TZ, todayAct);
  gen.systemPrompt += turnItemSections({
    match,
    card,
    recent: null,
    anchor: match?.anchor || null,
    mode: triage.mode,
    todayIso: TARGET,
    detailText: '',
    weeklyDay: null,
  });
  const res = await geminiStream(
    gen.systemPrompt,
    [{ role: 'system', content: gen.systemPrompt }, { role: 'user', content: message }],
    {
      label: 'general_chat',
      temperature: gen.temperature,
      maxOutputTokens: gen.maxTokens,
      thinkingLevel: v.writer.thinking || gen.thinkingLevel,
      model: v.writer.model,
      effort: v.writer.effort || 'none',
      cacheKey: `ask:${USER}`,
    },
    env.GOOGLE_API_KEY,
  );
  if (!res.ok || !res.body) return { error: `${res.status} ${String(res.error).slice(0, 200)}` };
  let text = '';
  await readSse(res, (j) => {
    const c = parseGeminiChunk(JSON.stringify(j));
    if (c.text) text += c.text;
  });
  return { text: text.replace(/<!--SAVE:[\s\S]*?-->/g, '').trim(), prompt_chars: gen.systemPrompt.length, card: card ? 1 : 0 };
}

async function answer(v, m, triage, ctx) {
  const t0 = RealDate.now();
  if (AGENT_LANES.includes(triage.lane)) {
    const r = await runChatTurn({
      env,
      userId: USER,
      timezone: TZ,
      messages: [{ role: 'user', content: m.text }],
      preload: {
        profileText: ctx.profile?.profileText,
        todayActivity: ctx.todayAct,
        runningSummary: '',
        anchor: null,
        sessionContext: ctx.context,
        week: ctx.keep.week,
        today: TARGET,
        dayEndHour: 3,
        triage,
      },
      deps: { models: { model: v.agent.model, fallback: FLASH, ...(v.agent.thinking ? { thinking: v.agent.thinking } : {}) } },
    });
    if (r.ok) return { lane: triage.lane, by: 'agent', text: r.reply, card: r.card?.rows?.length || 0, tools: r.tools, ms: RealDate.now() - t0 };
    // the agent could not finish: the quick lane's writer answers, as live
    const w = await writeQuick(v, triage, ctx.context, ctx.profile, ctx.todayAct, m.text, ctx.match);
    return { lane: triage.lane, by: 'writer after agent', ...w, agent_error: r.error, ms: RealDate.now() - t0 };
  }
  const w = await writeQuick(v, triage, ctx.context, ctx.profile, ctx.todayAct, m.text, ctx.match);
  return { lane: triage.lane || 'quick', by: 'writer', ...w, ms: RealDate.now() - t0 };
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, brought_up: { type: 'boolean' }, right: { type: 'boolean' } },
        required: ['key', 'brought_up', 'right'],
      },
    },
    untrue: { type: 'array', items: { type: 'string' } },
    generic: { type: 'boolean' },
    recites: { type: 'boolean' },
    why: { type: 'string' },
  },
  required: ['items', 'untrue', 'generic', 'recites', 'why'],
};

/**
 * The judges. Each writer is from one family (Luna is OpenAI's, Flash is
 * Google's), so a reply is read by one judge from each, and a comparison
 * between writers counts only where both judges agree on the direction.
 */
export const JUDGES = {
  sol: { primary: { provider: 'openai', model: 'gpt-6-sol' }, effort: 'low' },
  pro: { primary: { provider: 'google', model: 'gemini-pro-latest' }, effort: 'low' },
  'flash-high': { primary: { provider: 'google', model: FLASH }, effort: 'high' },
  sonnet: { primary: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, effort: 'low' },
};
const judgeNames = (flag('--judges') || 'sol,flash-high').split(',').filter((j) => JUDGES[j]);

async function judgeAll(m, reply) {
  const out = {};
  await Promise.all(
    judgeNames.map(async (j) => {
      out[j] = await judge(JUDGES[j], m, reply).catch((err) => ({ error: String(err?.message || err).slice(0, 300) }));
    }),
  );
  return out;
}

async function judge(spec, m, reply) {
  const keys = [...m.bears.must, ...m.bears.should, ...m.bears.could];
  const { output } = await jsonCall(env, {
    primary: spec.primary,
    system:
      'You review one reply from a companion app to a message from a person, against what a close friend of theirs would know at that moment. For each thing listed as bearing on the message, say whether the reply brought it up, directly or by a clear reference, and whether what it said about it was right. Then list anything the reply states as fact about the person, their people or their plans that is untrue, or that is in neither what a friend would know nor their own records, including anything listed as never true; general knowledge and suggestions are not facts about them. Say whether the reply is generic: whether, given what a friend would know that bears on this message, it would read much the same if sent to anyone. Say whether it recites: lists their life or their records back to them beyond what the message asked, or tells them as news something they told the app. Say in one sentence what, if anything, fell short.',
    user: `THE MESSAGE, sent ${m.at} on Thursday 12 November 2026, the first in a new chat:\n${m.text}\n\nWHAT BEARS ON IT (key | weight | what):\n${keys
      .map((k) => `${k} | ${m.bears.must.includes(k) ? 'must' : m.bears.should.includes(k) ? 'should' : 'could'} | ${FRIEND[k]}`)
      .join('\n')}\n\nEVERYTHING ELSE A FRIEND WOULD KNOW (all true):\n${Object.entries(FRIEND)
      .filter(([k]) => !keys.includes(k))
      .map(([, w]) => `- ${w}`)
      .join('\n')}\n\nTHEIR OWN RECORDS FOR THE DAY AND WEEK (all true):\n${DAY.map((d) => `- ${d}`).join('\n')}\n\nNEVER TRUE OR NEVER RIGHT TO SAY:\n${NEVER.map((n) => `- ${n}`).join('\n')}\n\nTHE APP'S REPLY:\n${reply}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 6000,
    effort: spec.effort,
    thinking: spec.effort,
  });
  return output;
}

const contexts = new Map();
/** The context the Worker reads for a message, once per setting of the Worker vars it reads. */
async function contextFor(v, m) {
  const venv = { ...env, ...(v.env || {}) };
  const key = `${m.id}:${JSON.stringify(v.env || {})}`;
  if (!contexts.has(key)) {
    contexts.set(
      key,
      (async () => {
        const keep = {};
        const [context, todayAct, profile] = await Promise.all([
          buildChatContext(USER, 'general', { message: m.text, timezone: TZ, currentChatId: null, keep, today: TARGET }, venv),
          buildTodayActivity(USER, TZ, venv, { today: TARGET }).catch(() => null),
          getUserProfile(USER, venv),
        ]);
        return { context, todayAct, profile, keep };
      })(),
    );
  }
  return contexts.get(key);
}

async function runMessage(m, variants, n) {
  return atTime(at(TARGET, m.at), async () => {
    // triage, with the matcher alongside it, once for every variant
    const [triage, match] = await aiContext.run({ env, worker: 'replay', job: `ask/${m.id}/triage`, userId: USER }, () =>
      Promise.all([
        triageMessage({
          userMessage: m.text,
          previousExchange: null,
          runningSummary: '',
          chatType: 'general',
          env,
          domainNames: [],
          profileSnippet: PROFILE.slice(0, 150),
          messageCount: 1,
        }),
        matchEntity({
          env,
          userId: USER,
          message: m.text,
          previousExchange: null,
          exchanges: [],
          recent: null,
          anchor: null,
          todayIso: TARGET,
          todayStr: 'Thursday, November 12, 2026',
        }).catch(() => null),
      ]),
    );
    return Promise.all(
      variants.map(async (name) => {
        const v = VARIANTS[name];
        const job = `ask/${m.id}/${name}/r${n}`;
        try {
          const ctx = { ...(await contextFor(v, m)), match };
          const a = await aiContext.run({ env, worker: 'replay', job, userId: USER }, () => answer(v, m, triage, ctx));
          const verdicts = a.text ? await judgeAll(m, a.text) : {};
          return { id: m.id, variant: name, n, triage, matched: match?.card ? match.card.kind : null, context_chars: ctx.context.length, ...a, verdicts, job };
        } catch (err) {
          return { id: m.id, variant: name, n, triage, error: String(err?.message || err).slice(0, 300), job };
        }
      }),
    );
  });
}

// ── the report ──────────────────────────────────────────────────────────────

function score(rows, j) {
  const s = { replies: rows.length, must: 0, mustAll: 0, should: 0, shouldAll: 0, could: 0, untrue: 0, generic: 0, recites: 0, errors: 0, agent: 0 };
  for (const r of rows) {
    const m = MESSAGES.find((x) => x.id === r.id);
    const verdict = r.verdicts?.[j];
    if (!verdict?.items) {
      s.errors += 1;
      continue;
    }
    const hit = (k) => {
      const it = verdict.items.find((x) => x.key === k);
      return !!(it?.brought_up && it.right);
    };
    s.mustAll += m.bears.must.length;
    s.must += m.bears.must.filter(hit).length;
    s.shouldAll += m.bears.should.length;
    s.should += m.bears.should.filter(hit).length;
    s.could += m.bears.could.filter(hit).length;
    s.untrue += verdict.untrue?.length || 0;
    s.generic += verdict.generic ? 1 : 0;
    s.recites += verdict.recites ? 1 : 0;
    s.agent += r.by === 'agent' ? 1 : 0;
  }
  return s;
}

async function chat() {
  if (!existsSync(WORLD)) throw new Error('no world yet: run --build first');
  const world = JSON.parse(readFileSync(WORLD, 'utf8'));
  current = fakeDb(world.tables, rpcs());
  const variants = (flag('--variants') || 'live').split(',').filter((v) => VARIANTS[v]);
  const only = flag('--only')?.split(',') || null;
  const repeat = Math.max(1, Number(flag('--repeat') || 1));
  const label = flag('--label') || 'ask';
  const messages = MESSAGES.filter((m) => !only || only.includes(m.id));
  const rows = [];
  for (let n = 1; n <= repeat; n++) {
    contexts.clear();
    // messages together, each at its own time of day (--batch: how many at once)
    const batch = Math.max(1, Number(flag('--batch') || 12));
    for (let i = 0; i < messages.length; i += batch) {
      const part = await Promise.all(messages.slice(i, i + batch).map((m) => runMessage(m, variants, n)));
      rows.push(...part.flat());
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  for (const r of rows) {
    r.cost = usage.filter((u) => String(u.job || '').startsWith(r.job)).reduce((s, u) => s + (Number(u.cost_usd) || 0), 0);
    // a streamed reply that came as more than one message reads as the reply twice
    const many = openaiStreams.filter((x) => x.job === r.job && x.items.length > 1);
    if (many.length) r.messages = many.map((x) => x.items);
  }

  const L = [`# Ask Gremly replay (${label}), ${repeat} run${repeat > 1 ? 's' : ''}, ${messages.length} messages`, ''];
  L.push(`World: reader ${world.reader}, ${(world.tables.life_facts || []).length} facts; the morning led with: ${world.morning?.lead || '(none)'}`, '');
  L.push('| Variant | Judge | Musts | Shoulds | Coulds | Untrue | Generic | Recites | By the agent | Unjudged | Cost a reply | Time a reply |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const v of variants) {
    const mine = rows.filter((r) => r.variant === v);
    const cost = mine.reduce((a, r) => a + (r.cost || 0), 0) / Math.max(1, mine.length);
    const ms = mine.reduce((a, r) => a + (r.ms || 0), 0) / Math.max(1, mine.length);
    for (const j of judgeNames) {
      const s = score(mine, j);
      L.push(
        `| ${v} | ${j} | ${s.must}/${s.mustAll} | ${s.should}/${s.shouldAll} | ${s.could} | ${s.untrue} | ${s.generic} | ${s.recites} | ${s.agent}/${s.replies} | ${s.errors} | ${(cost * 100).toFixed(3)}c | ${(ms / 1000).toFixed(1)}s |`,
      );
    }
  }
  const twice = rows.filter((r) => r.messages);
  L.push('', `Writer replies that came as more than one message: ${twice.length} of ${rows.length}${twice.length ? ` (${twice.map((r) => `${r.variant} ${r.id}`).join(', ')})` : ''}`);
  L.push('', `Context characters by message: ${[...new Set(rows.map((r) => `${r.id} ${r.context_chars}`))].join(', ')}`, '');
  for (const m of messages) {
    L.push(`## ${m.id}: "${m.text}" (${m.at})`, '');
    for (const r of rows.filter((x) => x.id === m.id)) {
      L.push(
        `**${r.variant}, run ${r.n}** (${r.by || 'error'}, lane ${r.triage?.lane || '?'}, mode ${r.triage?.mode || '?'}, personal ${r.triage?.personal || '?'}, depth ${r.triage?.depth || '?'}${r.matched ? `, card ${r.matched}` : ''}${r.messages ? `, CAME AS ${r.messages[0].length} MESSAGES ${JSON.stringify(r.messages[0])}` : ''})`,
        '',
        `> ${String(r.text || r.error || '(no reply)').replace(/\n+/g, '\n> ')}`,
        '',
      );
      for (const j of judgeNames) {
        const v = r.verdicts?.[j];
        if (!v?.items) {
          L.push(`- ${j}: not judged${v?.error ? ` (${v.error.slice(0, 120)})` : ''}`);
          continue;
        }
        const items = v.items.map((x) => `${x.key} ${x.brought_up ? (x.right ? 'yes' : 'WRONG') : 'no'}`).join(', ');
        L.push(`- ${j}: ${items}${v.generic ? ', GENERIC' : ''}${v.recites ? ', RECITES' : ''}. ${v.why || ''}`);
        if (v.untrue?.length) L.push(...v.untrue.map((u) => `  - untrue (${j}): ${u}`));
      }
      L.push('');
      if (r.agent_error) L.push(`Agent could not finish: ${r.agent_error}`, '');
    }
  }
  mkdirSync(OUT, { recursive: true });
  const stamp = new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(OUT, `report-${label}-${stamp}.md`);
  writeFileSync(file, L.join('\n'));
  writeFileSync(join(OUT, `rows-${label}-${stamp}.json`), JSON.stringify(rows, null, 1));
  console.log(L.slice(0, 4 + variants.length * judgeNames.length + 2).join('\n'));
  console.log(`report: ${file}`);
}

if (args.includes('--build')) await build();
else await chat();
