/**
 * The life replay (data fabric stage 4d): one made up person's weeks, read
 * in order by the reader that ships, into a ledger held in memory; then the
 * morning they lead to, made by the daily picture and the brief that ship,
 * from that ledger. It asks the question no other replay asks: does what the
 * person said reach what Gremly says back?
 *
 *   scripts/life-replay/run.sh [--repeat n] [--label name]
 *
 * Scored two ways:
 * - by code, against the records' ids: the facts the ledger should hold, the
 *   day each falls on, and whether it is tied to a day, standing, or back
 *   every year (TRUTH.ledger in life.mjs);
 * - by a judge from another model family (Gemini Pro, or GPT 6 Sol when it
 *   cannot be reached), reading the morning's words against what a friend
 *   would know (TRUTH.morning) and what is untrue (TRUTH.never).
 *
 * The bar, set before the runs: the must on every run, a should on 9 in 10,
 * nothing untrue, and the ledger right on 9 in 10 of its lines.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 * Writes out/report-<time>.md (gitignored). Nothing real is read or written.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER, TZ, PERSON, TARGET, TABLES, RECORDS, TRUTH, at } from './life.mjs';
import { fakeDb, LIFE_SUPABASE_URL } from './fakeDb.mjs';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { readChunk, READER_PROMPT_VERSION } from '../../workers/inngest-jobs/context/reader.js';
import * as daily from '../../workers/inngest-jobs/context/daily.js';
import { writeDailyBrief } from '../../workers/inngest-jobs/brief/index.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { runBriefTurn } from '../../workers/cortex/agent/brief.js';
import { buildChatContext } from '../../workers/cortex/context/chatProjection.js';
import { nextYearly } from '../../workers/shared/factTiming.js';
import { localDate, localDateTime } from '../../workers/shared/db.js';

const localTime = (iso) => String(localDateTime(TZ, iso)).slice(11, 16);

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 1));
// the model today's thread runs on, as cortex's wrangler.toml sets it (AGENT_MODEL_BRIEF)
const AGENT_MODEL = flag('--agent-model') || 'gpt-6-luna';
// their first message in today's thread, after reading the brief
const THREAD_MESSAGE = 'Morning!';
const label = flag('--label') || READER_PROMPT_VERSION;

// ── the clock and the network ───────────────────────────────────────────────

const RealDate = globalThis.Date;
let offset = 0;
class ReplayDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(RealDate.now() + offset);
  }
  static now() {
    return RealDate.now() + offset;
  }
}
globalThis.Date = ReplayDate;
const setClock = (iso) => {
  offset = RealDate.parse(iso) - RealDate.now();
};

const MODEL_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com'];
const realFetch = globalThis.fetch.bind(globalThis);
let current = null;
const usage = [];
const calls = [];
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
    // what each model was sent and answered, for reading why a morning went as it did
    const answer = await res.clone().text().catch(() => '');
    calls.push({ at: new RealDate(RealDate.now() + offset).toISOString(), request: typeof init.body === 'string' ? init.body : '', answer });
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
  CONTEXT_PIPELINE: 'on',
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_') || k.startsWith('CONTEXT_EFFORT_')),
  ),
};

function startingTables() {
  const copy = JSON.parse(JSON.stringify(TABLES));
  return {
    ...copy,
    cortex_preferences: [{ owner_id: USER, day_boundary_hour: 3, gremly_age: 40 }],
    notification_preferences: [{ user_id: USER, timezone: TZ }],
    user_profiles: [{ user_id: USER, timezone: TZ }],
  };
}

function freshDb() {
  return fakeDb(startingTables(), {
    person_identity: () => [PERSON],
    absence_snapshot: () => null,
    usage_rollup: () => null,
    recall_life_now: () => [],
    // the ledger's dated things ahead, as public.dated_ahead gives them (stage 4d)
    dated_ahead: ({ p_from, p_days = 42 }, mem) => {
      const last = new RealDate(RealDate.parse(`${p_from}T00:00:00Z`) + p_days * 864e5).toISOString().slice(0, 10);
      return (mem.tables.life_facts || [])
        .filter((f) => ['planned', 'current', 'unconfirmed'].includes(f.state) && f.about_date && f.timing !== 'standing')
        .map((f) =>
          f.timing === 'yearly'
            ? { ...f, about_date: nextYearly(f.about_date, p_from), about_date_end: null }
            : f,
        )
        .filter((f) => (f.about_date_end || f.about_date) >= p_from && f.about_date <= last)
        .sort((a, b) => String(a.about_date).localeCompare(String(b.about_date)));
    },
    ensure_daily_thread: ({ p_day }, mem) => {
      mem.tables.scope_chats = mem.tables.scope_chats || [];
      let t = mem.tables.scope_chats.find((c) => c.ritual_day === p_day);
      if (!t) {
        t = { id: `thread-${p_day}`, user_id: USER, chat_type: 'daily', ritual_day: p_day, metadata_json: {} };
        mem.tables.scope_chats.push(t);
      }
      return [t];
    },
  });
}

// ── one run ───────────────────────────────────────────────────────────────

async function readAll(errors) {
  const byDay = new Map();
  for (const r of RECORDS) {
    const day = localDate(TZ, new RealDate(r.at));
    byDay.set(day, [...(byDay.get(day) || []), r]);
  }
  for (const [day, chunk] of byDay) {
    setClock(new RealDate(RealDate.parse(chunk.at(-1).at) + 30 * 60e3).toISOString());
    try {
      await aiContext.run({ env, worker: 'replay', job: 'life-replay', userId: USER }, () =>
        readChunk(env, USER, TZ, chunk, `life-${day}`),
      );
    } catch (err) {
      errors.push(`read ${day}: ${String(err?.message || err).slice(0, 300)}`);
    }
  }
}

/** The ledger against what it should hold, by the records' ids. */
function ledgerScore(mem) {
  const facts = mem.tables.life_facts || [];
  const sources = mem.tables.life_fact_sources || [];
  return TRUTH.ledger.map((t) => {
    const ids = new Set(sources.filter((s) => s.source_id === t.record).map((s) => s.fact_id));
    const from = facts.filter((f) => ids.has(f.id) || f.source_id === t.record);
    const fits = from.filter(
      (f) =>
        (!t.monthDay || String(f.about_date || '').slice(5, 10) === t.monthDay) &&
        (!t.timing || [t.timing].flat().includes(f.timing)) &&
        (t.timing !== 'standing' || !f.about_date),
    );
    return {
      key: t.key,
      ok: fits.length > 0,
      got: from.map((f) => `${f.statement} [${f.about_date || 'no date'}${f.timing ? `, ${f.timing}` : ''}]`),
    };
  });
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          brought_up: { type: 'boolean' },
          right: { type: 'boolean' },
        },
        required: ['key', 'brought_up', 'right'],
      },
    },
    untrue: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
  },
  required: ['items', 'untrue', 'why'],
};

async function judge(words) {
  const { output } = await jsonCall(env, {
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You review what a companion app said to a person on one morning, against what a close friend would know about their life that morning. For each thing listed, say whether the app brought it up, directly or by a clear reference, and whether what it said about it was right. Then list anything the app stated as fact that is untrue, or that is in neither their day's items nor what a friend would know, including the things listed as never true. Say in one sentence what, if anything, fell short.`,
    user: `THEIR DAY'S OWN ITEMS (all true, and fine to name):\n${TRUTH.day.map((d) => `- ${d}`).join('\n')}\n\nWHAT A FRIEND WOULD KNOW THIS MORNING (key | what):\n${TRUTH.morning.map((m) => `${m.key} | ${m.what}`).join('\n')}\n\nNEVER TRUE:\n${TRUTH.never.map((n) => `- ${n}`).join('\n')}\n\nWHAT THE APP SAID THIS MORNING:\n${words}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

async function runOnce(n) {
  current = freshDb();
  const errors = [];
  const started = RealDate.now();
  const spent = usage.length;
  await readAll(errors);
  const ledger = ledgerScore(current.mem);

  // the morning: the daily picture at 5am, the brief at 6:40am
  let dco = null;
  setClock(at(TARGET, '05:00'));
  try {
    const built = await aiContext.run({ env, worker: 'replay', job: 'life-replay', userId: USER }, () =>
      daily.buildDcoV4(env, USER, { tz: TZ }),
    );
    await daily.writeDco(env, USER, built, { shadow: false });
    dco = built.dco;
  } catch (err) {
    errors.push(`morning: ${String(err?.message || err).slice(0, 300)}`);
  }
  setClock(at(TARGET, '06:40'));
  let brief = [];
  try {
    await aiContext.run({ env, worker: 'replay', job: 'life-replay', userId: USER }, () =>
      writeDailyBrief(env, USER, { reason: 'scheduled' }),
    );
    brief = (current.mem.tables.scope_chat_messages || [])
      .filter((m) => m.role === 'assistant' && m.content)
      .map((m) => m.content);
  } catch (err) {
    errors.push(`brief: ${String(err?.message || err).slice(0, 300)}`);
  }
  // their first message in today's thread, answered by the agent that ships
  setClock(at(TARGET, '07:05'));
  let thread = null;
  try {
    const r = await runBriefTurn({
      env,
      userId: USER,
      body: {
        date: TARGET,
        now: 7 * 60 + 5,
        text: THREAD_MESSAGE,
        timezone: TZ,
        history: brief.map((content) => ({ role: 'assistant', content })),
        items: TABLES.todos
          .filter((t) => t.due_day === TARGET)
          .map((t) => ({ id: t.id, kind: 'todo', title: t.title, due_day: t.due_day })),
        meetings: TABLES.synced_calendar_events
          // today's own entries, by their day where Noor is (an evening entry's UTC date is the next day)
          .filter((c) => localDate(TZ, new RealDate(c.start_at)) === TARGET)
          .map((c) => ({
            title: c.title,
            start: Number(localTime(c.start_at).slice(0, 2)) * 60 + Number(localTime(c.start_at).slice(3, 5)),
            end: Number(localTime(c.end_at).slice(0, 2)) * 60 + Number(localTime(c.end_at).slice(3, 5)),
          })),
      },
      useAgent: true,
      dayTurn: null,
      deps: { person: PERSON, dayEndHour: 3, models: { model: AGENT_MODEL, fallback: AGENT_MODEL } },
    });
    thread = r.reply || null;
    if (!thread) errors.push(`thread: ${r.error || r.agent_error || 'no reply'}`);
  } catch (err) {
    errors.push(`thread: ${String(err?.message || err).slice(0, 300)}`);
  }
  // what Ask Gremly is given about their life when they open it this morning
  setClock(at(TARGET, '07:30'));
  let chat = null;
  try {
    const text = await buildChatContext(
      USER,
      'general',
      { message: 'What have I got on?', timezone: TZ, today: TARGET, currentChatId: null },
      env,
    );
    chat = chatScore(text, current.mem);
  } catch (err) {
    errors.push(`chat context: ${String(err?.message || err).slice(0, 300)}`);
  }
  offset = 0;

  const words = [
    dco?.brief_headline ? `Notification line: ${dco.brief_headline}` : null,
    ...brief.map((l) => `Gremly: ${l}`),
    ...(thread ? [`Noor, in the same chat a little later: ${THREAD_MESSAGE}`, `Gremly: ${thread}`] : []),
  ]
    .filter(Boolean)
    .join('\n');
  const verdict = words ? await judge(words).catch((err) => ({ error: err.message })) : null;
  await new Promise((r) => setTimeout(r, 300));
  const cost = usage.slice(spent).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  return {
    n,
    ms: RealDate.now() - started,
    errors,
    ledger,
    lead: dco?.lead_story?.what || null,
    headline: dco?.brief_headline || null,
    brief,
    thread,
    verdict,
    chat,
    cost,
  };
}

/**
 * Ask Gremly's context, checked by code against the records: what falls today
 * is under today, and last night's calendar entry is under yesterday.
 */
function chatScore(text, mem) {
  const lines = String(text || '').split('\n');
  const section = (start) => {
    const i = lines.findIndex((l) => l.startsWith(start));
    if (i < 0) return [];
    const out = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.startsWith('- ')) break;
      out.push(l);
    }
    return out;
  };
  const sources = mem.tables.life_fact_sources || [];
  const facts = mem.tables.life_facts || [];
  const fromRecord = (id) => {
    const ids = new Set(sources.filter((x) => x.source_id === id).map((x) => x.fact_id));
    return facts.filter((f) => ids.has(f.id) || f.source_id === id).map((f) => f.statement);
  };
  const today = section('Falls on today');
  const yesterday = section('Yesterday,');
  return {
    chars: String(text || '').length,
    today_holds: TRUTH.chat.today.filter((r) => fromRecord(r).some((st) => today.some((l) => l.includes(st)))),
    yesterday_holds: TRUTH.chat.yesterday.filter((t) => yesterday.some((l) => l.includes(t))),
    people: section('The people who come up most').length,
  };
}

// ── the report ─────────────────────────────────────────────────────────────

const runs = [];
for (let i = 1; i <= repeat; i++) {
  const r = await runOnce(i);
  runs.push(r);
  console.log(
    `run ${i}: ledger ${r.ledger.filter((x) => x.ok).length}/${r.ledger.length}, ` +
      `${r.verdict?.items ? TRUTH.morning.map((m) => `${m.key} ${r.verdict.items.find((x) => x.key === m.key)?.brought_up ? (r.verdict.items.find((x) => x.key === m.key)?.right ? 'yes' : 'WRONG') : 'no'}`).join(', ') : 'not judged'}` +
      `${r.chat ? `, chat context today ${r.chat.today_holds.length}/${TRUTH.chat.today.length} yesterday ${r.chat.yesterday_holds.length}/${TRUTH.chat.yesterday.length}` : ''}` +
      `${r.errors.length ? `, ${r.errors.length} errors` : ''}`,
  );
}

const hit = (r, key) => {
  const v = r.verdict?.items?.find((x) => x.key === key);
  return !!(v?.brought_up && v.right);
};
const must = TRUTH.morning.filter((m) => m.weight === 'must');
const should = TRUTH.morning.filter((m) => m.weight === 'should');
const ledgerRight = runs.reduce((s, r) => s + r.ledger.filter((x) => x.ok).length, 0);
const ledgerAll = runs.reduce((s, r) => s + r.ledger.length, 0);
const mustRuns = runs.filter((r) => must.every((m) => hit(r, m.key))).length;
const shouldHits = runs.reduce((s, r) => s + should.filter((m) => hit(r, m.key)).length, 0);
const untrue = runs.reduce((s, r) => s + (r.verdict?.untrue?.length || 0), 0);
const meets =
  mustRuns === runs.length &&
  shouldHits >= 0.9 * should.length * runs.length &&
  untrue === 0 &&
  ledgerRight >= 0.9 * ledgerAll;

const L = [
  `# Life replay (${label}), ${runs.length} runs`,
  '',
  `Ledger right ${ledgerRight}/${ledgerAll}. The must on ${mustRuns}/${runs.length} runs. Shoulds ${shouldHits}/${should.length * runs.length}. Untrue ${untrue}. Cost a run $${(runs.reduce((s, r) => s + r.cost, 0) / runs.length).toFixed(4)}. Meets the bar: ${meets ? 'yes' : 'no'}.`,
  '',
  '| Run | ' + TRUTH.morning.map((m) => `${m.key} (${m.weight})`).join(' | ') + ' | Untrue |',
  '| --- | ' + TRUTH.morning.map(() => '---').join(' | ') + ' | --- |',
  ...runs.map(
    (r) =>
      `| ${r.n} | ${TRUTH.morning
        .map((m) => {
          const v = r.verdict?.items?.find((x) => x.key === m.key);
          return v?.brought_up ? (v.right ? 'yes' : 'WRONG') : 'no';
        })
        .join(' | ')} | ${r.verdict?.untrue?.length || 0} |`,
  ),
  '',
];
for (const r of runs) {
  L.push(`## Run ${r.n}`, '');
  if (r.errors.length) L.push('Errors:', ...r.errors.map((e) => `- ${e}`), '');
  L.push('Ledger:', ...r.ledger.map((x) => `- ${x.key}: ${x.ok ? 'right' : 'WRONG'} | ${x.got.join('; ') || 'no fact'}`), '');
  L.push(`Lead: ${r.lead || '(none)'}`, `Headline: ${r.headline || '(none)'}`, '', 'Brief:', ...r.brief.map((l) => `> ${l}`), '');
  L.push(`Thread, to "${THREAD_MESSAGE}":`, `> ${r.thread || '(no reply)'}`, '');
  if (r.chat)
    L.push(
      `Ask Gremly's context (${r.chat.chars} characters): falls today ${r.chat.today_holds.length}/${TRUTH.chat.today.length}, yesterday ${r.chat.yesterday_holds.length}/${TRUTH.chat.yesterday.length}, ${r.chat.people} people.`,
      '',
    );
  if (r.verdict?.untrue?.length) L.push('Untrue:', ...r.verdict.untrue.map((u) => `- ${u}`), '');
  if (r.verdict?.why) L.push(`Judge: ${r.verdict.why}`, '');
}
const dir = join(HERE, 'out');
mkdirSync(dir, { recursive: true });
const stamp = new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(dir, `report-${stamp}.md`);
writeFileSync(file, L.join('\n'));
writeFileSync(join(dir, `calls-${stamp}.json`), JSON.stringify(calls, null, 1));
console.log(`report: ${file}`);
