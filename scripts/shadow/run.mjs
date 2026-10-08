/**
 * The shadow runner: a pipeline job's own code, run for one real person on a
 * past day, week or correction, with every write kept aside (harness.js).
 *
 *   scripts/shadow/run.sh morning    --user <uuid> --day YYYY-MM-DD [--at HH:MM]
 *   scripts/shadow/run.sh story-copy --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh correction --correction <uuid> [--said "other words"] [--as-is] [--was-open <fact ids>]
 *   scripts/shadow/run.sh story --user <uuid> --replies <file> [--at ISO]
 *   scripts/shadow/run.sh person-words --user <uuid> [--weekly-replies <file> --week-end YYYY-MM-DD]
 *   scripts/shadow/run.sh ledger --user <uuid> [--from ISO] [--to ISO]
 *   scripts/shadow/run.sh reread --user <uuid> [--from ISO] [--to ISO] [--max n]
 *   scripts/shadow/run.sh kinds --user <uuid> [--calls n]
 *   scripts/shadow/run.sh life-morning --user <uuid> --day YYYY-MM-DD [--at HH:MM] [--timings kinds/summary.json] [--add-facts reread/record.json]
 *   scripts/shadow/run.sh weekly-input --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh weekly-summary --user <uuid> --at ISO --replies <file> [--week-end YYYY-MM-DD] [--rpc-from <file>]
 *   scripts/shadow/run.sh people-fill --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh filing --user <uuid> [--limit n] [--at ISO]
 *   scripts/shadow/run.sh words --user <uuid>
 *   scripts/shadow/run.sh memories --user <uuid> [--chapter <uuid>] [--limit n]
 *   scripts/shadow/run.sh first-worlds --user <uuid>
 *   scripts/shadow/run.sh up-next --user <uuid>
 *   scripts/shadow/run.sh people-check --user <uuid> [--limit n]
 *   scripts/shadow/run.sh person-question --user <uuid>
 *   scripts/shadow/run.sh chapter-questions --user <uuid>
 *   scripts/shadow/run.sh ask --user <uuid> --day YYYY-MM-DD [--at HH:MM] [--sizes compact,full]
 *   scripts/shadow/run.sh review --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh answer --from <review dir>/record.json --row n --said "their answer"
 *   scripts/shadow/run.sh ... --code <dir>   run another tree's code (run.sh)
 *
 * Keys come from the environment: SHADOW_SUPABASE_KEY (a key for the
 * shadow_reader role, which may only read), OPENAI_API_KEY,
 * GEMINI_TEST_API_KEY and, for weekly jobs, ANTHROPIC_API_KEY; any
 * CONTEXT_MODEL_<JOB> (provider:model) tries another model. Results are
 * written under "Claude outputs/shadow" in this checkout (SHADOW_OUT to
 * change it), which git ignores: real data never goes into the repo.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fakeKV,
  installClock,
  installFetchGuard,
  shadowCost,
  workerVars,
} from './harness.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { buildDcoV4, writeDco } from '../../workers/inngest-jobs/context/daily.js';
// a namespace import, so a tree without the story copy (main before stage 0) still bundles
import * as story from '../../workers/inngest-jobs/context/story.js';
import { applyCorrection } from '../../workers/inngest-jobs/context/corrections.js';
import { readWindow } from '../../workers/inngest-jobs/context/reader.js';
// a namespace import, so a tree without weeklyRequestParams still bundles
import * as weekly from '../../workers/inngest-jobs/context/weekly.js';
import { userTimezone, personIdentity } from '../../workers/shared/db.js';
// a namespace import, so a tree without people records still bundles
import * as people from '../../workers/inngest-jobs/context/people.js';
import { localStartIso } from '../../workers/shared/calendar.js';
// a namespace import, so a tree without filing (before stage 4a) still bundles
import * as filing from '../../workers/inngest-jobs/context/filing.js';
import { db } from '../../workers/shared/db.js';
// namespace imports, as for filing above: a job checks its function is there
import * as stage4b from '../../workers/inngest-jobs/context/words.js';
import * as stage4bMemory from '../../workers/inngest-jobs/context/memory.js';
import * as stage4bFirst from '../../workers/inngest-jobs/context/firstWorlds.js';
import * as upNextMod from '../../workers/shared/upNext.js';
import * as stage4cPeople from '../../workers/inngest-jobs/context/peopleQuestions.js';
import * as stage4cChapters from '../../workers/inngest-jobs/context/chapterQuestions.js';
// a namespace import, so a tree without the ledger review (before stage 4f) still bundles
import * as stage4fReview from '../../workers/inngest-jobs/context/review.js';
// a namespace import, so a tree without the catch up (before stage 4d) still bundles
import * as stage4dReread from '../../workers/inngest-jobs/context/reread.js';
import * as kindsMod from '../../workers/inngest-jobs/context/kinds.js';
import { writeDailyBrief } from '../../workers/inngest-jobs/brief/index.js';
import { buildChatContext } from '../../workers/cortex/context/chatProjection.js';
// Ask Gremly's own path, for the ask job (data fabric stage 4e)
import { triageMessage } from '../../workers/cortex/triage.js';
import { getUserProfile } from '../../workers/cortex/context/userProfile.js';
import { buildTodayActivity } from '../../workers/cortex/context/todayActivity.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { turnItemSections } from '../../workers/cortex/entityMatch.js';
import { configureModels, models as cortexModels } from '../../workers/cortex/models.js';
import { geminiStream, parseGeminiChunk } from '../../workers/cortex/geminiClient.js';
import { AGENT_LANES, runChatTurn } from '../../workers/cortex/agent/chat.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';
// a namespace import, so a tree without the summary from the pass (before stage 5) still bundles
import * as stage5Summary from '../../workers/inngest-jobs/summaryFromPass';
import * as stage5Writer from '../../workers/inngest-jobs/summaryPlanWriter';
import * as stage6People from '../../workers/inngest-jobs/context/personWords.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const job = args[0];
// when this run began, by the real clock (the shadow clock reads the job's
// moment): it names the run's folder, so two runs of one moment never share one
const RUN_STAMP = new Date().toISOString();
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SUPABASE_URL = process.env.SHADOW_SUPABASE_URL || 'https://pvfnnpcfmgczlcglvlzl.supabase.co';
const KEY = process.env.SHADOW_SUPABASE_KEY || '';
// the project's public key, which the gateway wants as apikey; the app's own anon key
const APIKEY = process.env.SHADOW_SUPABASE_APIKEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** The key must be the read only role's, never the service key. */
function keyRole(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}
if (!KEY) fail('SHADOW_SUPABASE_KEY is not set. See scripts/shadow/README.md.');
if (keyRole(KEY) !== 'shadow_reader')
  fail(`SHADOW_SUPABASE_KEY is for the role "${keyRole(KEY)}", not shadow_reader. Nothing was run.`);
if (!APIKEY) fail('The project\'s public anon key is not set (SHADOW_SUPABASE_APIKEY or EXPO_PUBLIC_SUPABASE_ANON_KEY). See scripts/shadow/README.md.');
if (keyRole(APIKEY) !== 'anon' && !APIKEY.startsWith('sb_publishable_'))
  fail('The apikey must be the project\'s public anon key, never a secret one. Nothing was run.');

/**
 * What this tree's SQL adds that live may not have yet (supabase/migrations,
 * stages 4c, 4d and 6). Each is looked for before a run; what live lacks is
 * answered as the SQL would leave existing rows (harness.js pendingRead), and
 * the summary names it, so a run on SQL James has not applied says so.
 */
const THIS_TREE_ADDS = {
  columns: {
    life_facts: ['timing'],
    life_facts_now: ['timing'],
    life_people: ['who_checked_at', 'words', 'words_updated_at'],
    gremly_questions: ['weight'],
  },
  tables: ['ledger_reads'],
};
async function pendingSchema() {
  const has = async (path) =>
    (await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: APIKEY, Authorization: `Bearer ${KEY}` } })).ok;
  const columns = {};
  for (const [t, cols] of Object.entries(THIS_TREE_ADDS.columns))
    for (const c of cols) if (!(await has(`${t}?select=${c}&limit=1`))) (columns[t] = columns[t] || []).push(c);
  const tables = [];
  for (const t of THIS_TREE_ADDS.tables) if (!(await has(`${t}?select=*&limit=1`))) tables.push(t);
  return Object.keys(columns).length || tables.length ? { columns, tables } : null;
}

const record = { reads: [], writes: [], calls: [], usage: [], effects: [] };
const env = {
  ...workerVars(join(ROOT, 'workers/inngest-jobs/wrangler.toml')),
  // a model to try in place of the one that ships, as CONTEXT_MODEL_<JOB>=provider:model
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_') || k.startsWith('CONTEXT_EFFORT_'))),
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY: KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY || process.env.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CONTEXT_CACHE: fakeKV(record),
};

/** A real read through the guard, outside any job: what live holds. */
async function liveRead(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: APIKEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) fail(`Read failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function timezoneOf(userId) {
  const [p] = await liveRead(`notification_preferences?user_id=eq.${userId}&select=timezone`);
  const [u] = await liveRead(`user_profiles?user_id=eq.${userId}&select=timezone`);
  return p?.timezone || (u?.timezone && u.timezone !== 'UTC' ? u.timezone : null) || 'America/Los_Angeles';
}

/** The moment a job runs at: the given time on the day, in the person's own zone. */
function momentOn(day, hhmm, tz) {
  const [h, m] = (hhmm || '04:30').split(':').map(Number);
  return new Date(Date.parse(localStartIso(tz, day)) + (h * 60 + m) * 60000).toISOString();
}

const JOBS = {
  async morning() {
    const userId = flag('--user');
    const day = flag('--day');
    if (!userId || !day) fail('morning needs --user and --day');
    const tz = await timezoneOf(userId);
    const at = momentOn(day, flag('--at'), tz);
    const [live] = await liveRead(`user_daily_state?user_id=eq.${userId}&date=eq.${day}&select=dco,extraction_raw`);
    return {
      at,
      userId,
      run: async () => {
        const built = await buildDcoV4(env, userId, { tz });
        await writeDco(env, userId, built, { shadow: false });
        return built;
      },
      summarise: (built) => ({
        day,
        shadow: pickMorning(built?.dco, built),
        // live keeps only the count of failed checks, and its row may have been changed since the morning
        live: live
          ? pickMorning(live.dco, {
              attempts: live.extraction_raw?.attempts,
              inputChars: live.extraction_raw?.input_chars,
              failed: live.extraction_raw?.review_flags,
            })
          : null,
      }),
    };
  },

  // The reader over a window of a past or recent day: what the reader of this
  // tree would make of it, new facts, updates, sources, questions and stamps
  async ledger() {
    const userId = flag('--user');
    if (!userId) fail('ledger needs --user');
    const to = flag('--to') || new Date().toISOString();
    const from = flag('--from') || new Date(Date.parse(to) - 864e5).toISOString();
    return {
      at: new Date(Date.parse(to) + 1000).toISOString(),
      userId,
      run: async () => {
        const tz = await userTimezone(env, userId);
        return readWindow(env, userId, tz, from, to, `shadow-ledger-${userId.slice(0, 8)}`, {
          runSince: from,
        });
      },
      summarise: (totals) => ({ from, to, totals, ...ledgerWrites(record) }),
    };
  },

  // The catch up (data fabric stage 4d): what was read under older rules, read
  // again under this tree's, up to the reader's cursor. Every window of the
  // plan by default; --from and --to keep the windows that overlap a span,
  // and --max the first n of those. What one window would add is kept aside,
  // so a later window here does not see it (live, it would).
  async reread() {
    const userId = flag('--user');
    if (!userId) fail('reread needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4dReread.planReread !== 'function') fail('This tree has no catch up.');
        const plan = await stage4dReread.planReread(env, userId, { untilIso: flag('--until') || null });
        const lo = flag('--from');
        const hi = flag('--to');
        const max = Number(flag('--max')) || Infinity;
        const chosen = plan.windows
          .filter((w) => (!lo || w.to > lo) && (!hi || w.from < hi))
          .slice(0, max);
        const totals = {};
        for (const w of chosen) {
          const c = await stage4dReread.rereadWindow(env, userId, plan.tz, w.from, w.to, `shadow-reread-${userId.slice(0, 8)}`);
          for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + (c[k] || 0);
        }
        return {
          plan: { until: plan.until, version: plan.version, windows: plan.windows.length, stale: plan.total },
          read: chosen.map((w) => ({ from: w.from, to: w.to, n: w.n })),
          totals,
        };
      },
      summarise: (out) => ({ ...out, ...ledgerWrites(record) }),
    };
  },

  // The kind pass over one person's facts, read only: the kind, health flag
  // and timing (stage 4d) each fact that lacks one would get. The summary
  // keeps ids and counts; the statements stay in record.json.
  async kinds() {
    const userId = flag('--user');
    if (!userId) fail('kinds needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () =>
        kindsMod.giveKinds(env, userId, { maxCalls: Number(flag('--calls')) || 8, shadow: true }),
      summarise: (out) => {
        const count = (key) =>
          (out.judged || []).reduce((m, j) => ({ ...m, [j[key]]: (m[j[key]] || 0) + 1 }), {});
        return {
          lacking: out.lacking,
          given: out.given,
          left_out: out.left_out,
          calls: out.calls,
          timings: count('timing'),
          kinds: count('kind'),
          health: out.health,
          judged: (out.judged || []).map((j) => ({ id: j.id, kind: j.kind, timing: j.timing, health: j.health })),
        };
      },
    };
  },

  // A morning as stage 4d makes it, on a real day: the timings a kinds run
  // (--timings, its summary.json) would give are read as given, then the
  // daily picture, the brief from it, and what Ask Gremly is given about
  // their life. Everything is kept aside, as in every job.
  async 'life-morning'() {
    const userId = flag('--user');
    const day = flag('--day');
    if (!userId || !day) fail('life-morning needs --user and --day');
    const tz = await timezoneOf(userId);
    const at = momentOn(day, flag('--at') || '06:40', tz);
    const timings = new Map();
    const from = flag('--timings');
    if (from) for (const j of JSON.parse(readFileSync(from, 'utf8')).judged || []) if (j.timing) timings.set(j.id, j.timing);
    // facts a catch up run (--add-facts, its record.json) would add, read as if
    // it had run: added to reads of the ledger that ask by person, state or id
    // (any other filter is not applied to them, so the summary counts them)
    const added = [];
    const addFrom = flag('--add-facts');
    if (addFrom)
      for (const w of JSON.parse(readFileSync(addFrom, 'utf8')).writes || [])
        if (w.table === 'life_facts' && w.method === 'POST')
          for (const r of Array.isArray(w.body) ? w.body : [w.body])
            if (r?.id && r.user_id === userId)
              added.push({ item_table: null, item_id: null, item_done: false, item_archived: false, item_cancelled: false, item_gone: false, ...r });
    const addedTo = (url, rows) => {
      const q = new URL(url).searchParams;
      const states = q.getAll('state').map((v) => (v.startsWith('in.(') ? v.slice(4, -1).split(',') : v.startsWith('eq.') ? [v.slice(3)] : null));
      const ids = q.getAll('id').map((v) => (v.startsWith('in.(') ? v.slice(4, -1).split(',') : v.startsWith('eq.') ? [v.slice(3)] : null));
      const fits = added.filter(
        (f) =>
          states.every((st) => !st || st.includes(f.state)) &&
          ids.every((i) => !i || i.includes(f.id)) &&
          !rows.some((r) => r?.id === f.id),
      );
      return [...rows, ...fits];
    };
    let shadowDco = null;
    // the made picture stands in for the stored one of the day, field by field as each read selects it
    const pictureRows = (rows, url) => {
      const named = new URL(url).searchParams.get('select') || '';
      const asked = new URL(url).searchParams.getAll('date').some((v) => v === `eq.${day}`);
      const fill = (r) => {
        const out = { ...r };
        for (const item of named.split(',')) {
          const [alias, expr] = item.includes(':') ? item.split(':') : [item.split('->').pop(), item];
          if (expr === 'dco') out[alias] = shadowDco;
          else if (expr.startsWith('dco->')) out[alias] = expr.split('->').slice(1).reduce((v, k) => v?.[k], shadowDco) ?? null;
          else if (alias === 'date') out.date = day;
        }
        return out;
      };
      if (rows.some((r) => r.date === day)) return rows.map((r) => (r.date === day ? fill(r) : r));
      return asked || !named.includes('date') ? [fill({ user_id: userId, date: day }), ...rows] : rows;
    };
    // the day's thread, new and unread, so the brief is written as on a first morning
    const threadId = crypto.randomUUID();
    return {
      at,
      userId,
      rpcAnswer: (fn) =>
        fn === 'ensure_daily_thread'
          ? [{ id: threadId, user_id: userId, chat_type: 'daily', ritual_day: day, metadata_json: {} }]
          : undefined,
      rewrite: ({ table, url, body }) => {
        let rows;
        try {
          rows = JSON.parse(body);
        } catch {
          return null;
        }
        if (!Array.isArray(rows)) return null;
        if ((table === 'life_facts' || table === 'life_facts_now') && (timings.size || added.length))
          return addedTo(url, rows).map((r) => (r?.id && !r.timing && timings.has(r.id) ? { ...r, timing: timings.get(r.id) } : r));
        if (table === 'user_daily_state' && shadowDco) return pictureRows(rows, url);
        return null;
      },
      run: async () => {
        const built = await buildDcoV4(env, userId, { tz });
        await writeDco(env, userId, built, { shadow: false });
        shadowDco = built.dco;
        await writeDailyBrief(env, userId, { reason: 'scheduled' });
        const brief = record.writes
          .filter((w) => w.table === 'scope_chat_messages' && w.method === 'POST')
          .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
          .filter((m) => m?.role === 'assistant' && m.content)
          .map((m) => m.content);
        const chat = await buildChatContext(
          userId,
          'general',
          { message: 'What have I got going on?', timezone: tz, today: day, currentChatId: null },
          env,
        );
        return { dco: built.dco, brief, chat };
      },
      summarise: (out) => {
        const lines = String(out.chat || '').split('\n');
        const section = (start) => {
          const i = lines.findIndex((l) => l.startsWith(start));
          if (i < 0) return 0;
          let n = 0;
          for (const l of lines.slice(i + 1)) {
            if (!l.startsWith('- ')) break;
            n++;
          }
          return n;
        };
        return {
          day,
          timings_read: timings.size,
          facts_added_from_catch_up: added.length,
          lead: out.dco?.lead_story?.what ?? null,
          why_today: out.dco?.lead_story?.why_today ?? null,
          headline: out.dco?.brief_headline ?? null,
          also_matters: out.dco?.also_matters ?? [],
          brief: out.brief,
          chat_context: {
            chars: String(out.chat || '').length,
            yesterday: section('Yesterday,'),
            falls_today: section('Falls on today'),
            lately: section('Said lately'),
            standing: section('How their life runs'),
            people: section('The people who come up most'),
          },
        };
      },
    };
  },

  // Ask Gremly on a real day (data fabric stage 4e): a handful of first
  // messages, with nothing in them from the person, each answered by the
  // live path (triage, then the agent for a lookup or a change and the quick
  // lane's writer for the rest) once for each size of their life Ask Gremly
  // reads (CHAT_LIFE), and each pair read blind by two judges, one from each
  // writer's family, given everything Gremly knows about them
  async ask() {
    const userId = flag('--user');
    const day = flag('--day');
    if (!userId || !day) fail('ask needs --user and --day');
    const tz = await timezoneOf(userId);
    const at = momentOn(day, flag('--at') || '09:00', tz);
    const sizes = (flag('--sizes') || 'compact,full').split(',');
    // as cortex's wrangler.toml runs Ask Gremly
    const chatEnv = { ...workerVars(join(ROOT, 'workers/cortex/wrangler.toml')), ...env, GOOGLE_API_KEY: env.GEMINI_API_KEY };
    configureModels(chatEnv);
    const MESSAGES = [
      'Morning!',
      'What have I got on today?',
      "I'm shattered",
      'Help me think about next week',
      'What should I do this weekend?',
      'Anything I should be remembering?',
      'What should I make for dinner?',
      'How have I been doing lately?',
    ];
    const sseText = async (res) => {
      let text = '';
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
          const c = parseGeminiChunk(line.slice(5).trim());
          if (c.text) text += c.text;
        }
      }
      return text.trim();
    };
    const answer = async (m, triage, context, profile, todayAct, keep) => {
      if (AGENT_LANES.includes(triage.lane)) {
        const r = await runChatTurn({
          env: chatEnv,
          userId,
          timezone: tz,
          messages: [{ role: 'user', content: m }],
          preload: { profileText: profile?.profileText, todayActivity: todayAct, runningSummary: '', anchor: null, sessionContext: context, week: keep.week, today: day, triage },
        });
        if (r.ok) return { by: 'agent', text: r.reply, tools: r.tools };
      }
      const gen = buildGeneralChatConfig(triage, { runningSummary: '' }, null, context, profile?.profileText, tz, todayAct);
      gen.systemPrompt += turnItemSections({ match: null, card: null, recent: null, anchor: null, mode: triage.mode, todayIso: day, detailText: '', weeklyDay: null });
      const ask = cortexModels().ask;
      const res = await geminiStream(
        gen.systemPrompt,
        [{ role: 'system', content: gen.systemPrompt }, { role: 'user', content: m }],
        { label: 'general_chat', temperature: gen.temperature, maxOutputTokens: gen.maxTokens, thinkingLevel: gen.thinkingLevel, model: ask.model, effort: ask.effort },
        chatEnv.GOOGLE_API_KEY,
      );
      if (!res.ok || !res.body) return { by: 'writer', error: String(res.error || res.status).slice(0, 200) };
      return { by: 'writer', text: await sseText(res) };
    };
    const JUDGES = {
      sol: { provider: 'openai', model: 'gpt-6-sol', effort: 'low' },
      'flash-high': { provider: 'google', model: 'gemini-3.8-flash', effort: 'high' },
    };
    const judgePair = async (spec, m, known, a, b) =>
      (
        await jsonCall(env, {
          primary: spec,
          system:
            'You compare two replies from a companion app to the same message from a person, against everything the app knows about them. Say which reply better shows it knows the person, bringing up what a close friend would given the message, without reciting their life back or telling them as news what they said; or say they are the same. For each reply list anything it states as fact about the person, their people or their plans that is untrue or that is not in what the app knows. Say in one sentence why.',
          user: `EVERYTHING THE APP KNOWS ABOUT THEM:\n${known}\n\nTHE MESSAGE, the first in a new chat:\n${m}\n\nREPLY A:\n${a}\n\nREPLY B:\n${b}`,
          schema: {
            type: 'object',
            properties: {
              better: { type: 'string', enum: ['A', 'B', 'same'] },
              untrue_a: { type: 'array', items: { type: 'string' } },
              untrue_b: { type: 'array', items: { type: 'string' } },
              why: { type: 'string' },
            },
            required: ['better', 'untrue_a', 'untrue_b', 'why'],
          },
          maxTokens: 6000,
          effort: spec.effort,
          thinking: spec.effort,
        })
      ).output;
    return {
      at,
      userId,
      run: async () => {
        // a few at a time: many reads at once are refused by the connection
        const pool = async (items, n, fn) => {
          const out = new Array(items.length);
          let next = 0;
          await Promise.all(
            Array.from({ length: n }, async () => {
              while (next < items.length) {
                const k = next++;
                out[k] = await fn(items[k], k);
              }
            }),
          );
          return out;
        };
        const [profile, todayAct] = await Promise.all([
          getUserProfile(userId, chatEnv),
          buildTodayActivity(userId, tz, chatEnv, { today: day }).catch(() => null),
        ]);
        // each size in turn, so the reads it shares between messages come from the cache
        const contexts = {};
        const keeps = {};
        for (const size of sizes) {
          contexts[size] = [];
          keeps[size] = [];
          for (const m of MESSAGES) {
            const keep = {};
            contexts[size].push(await buildChatContext(userId, 'general', { message: m, timezone: tz, today: day, currentChatId: null, keep }, { ...chatEnv, CHAT_LIFE: size }));
            keeps[size].push(keep);
          }
        }
        const triages = await pool(MESSAGES, 4, (m) =>
          triageMessage({ userMessage: m, previousExchange: null, runningSummary: '', chatType: 'general', env: chatEnv, domainNames: [], profileSnippet: profile?.profileText?.slice(0, 150) || '', messageCount: 1 }),
        );
        const pairs = MESSAGES.flatMap((m, i) => sizes.map((size) => ({ m, i, size })));
        const answers = await pool(pairs, 4, ({ m, i, size }) =>
          answer(m, triages[i], contexts[size][i], profile, todayAct, keeps[size][i]).catch((err) => ({ error: String(err?.message || err) })),
        );
        const replyOf = (i, size) => answers[pairs.findIndex((x) => x.i === i && x.size === size)];
        // what the judges are given as known: the fullest context either reply had, with
        // who they are and today so far, which both writers read too
        const known = (i) =>
          [
            profile?.profileText ? `ABOUT THEM\n${profile.profileText}` : '',
            todayAct || '',
            sizes.map((z) => contexts[z][i]).sort((a, b) => b.length - a.length)[0],
          ]
            .filter(Boolean)
            .join('\n\n');
        return pool(MESSAGES, 3, async (m, i) => {
          const replies = Object.fromEntries(sizes.map((z) => [z, replyOf(i, z)]));
          // blind: which size is A changes from message to message
          const [x, y] = i % 2 ? [sizes[1], sizes[0]] : [sizes[0], sizes[1]];
          const verdicts = {};
          if (replies[x]?.text && replies[y]?.text)
            await Promise.all(
              Object.entries(JUDGES).map(async ([j, spec]) => {
                const v = await judgePair(spec, m, known(i), replies[x].text, replies[y].text).catch((err) => ({ error: String(err?.message || err).slice(0, 200) }));
                verdicts[j] = v?.better ? { ...v, better: v.better === 'same' ? 'same' : v.better === 'A' ? x : y, untrue: { [x]: v.untrue_a, [y]: v.untrue_b } } : v;
              }),
            );
          const t = triages[i];
          return { message: m, triage: { mode: t.mode, personal: t.personal, depth: t.depth, lane: t.lane }, chars: Object.fromEntries(sizes.map((z) => [z, contexts[z][i].length])), replies, verdicts };
        });
      },
      summarise: (rows) => {
        const tally = {};
        for (const r of rows)
          for (const [j, v] of Object.entries(r.verdicts || {})) {
            tally[j] = tally[j] || { better: {}, untrue: {} };
            if (v?.better) tally[j].better[v.better] = (tally[j].better[v.better] || 0) + 1;
            for (const [z, list] of Object.entries(v?.untrue || {})) tally[j].untrue[z] = (tally[j].untrue[z] || 0) + (list?.length || 0);
          }
        return {
          day,
          sizes,
          context_chars: rows[0]?.chars,
          by_judge: tally,
          messages: rows.map((r) => ({
            message: r.message,
            triage: r.triage,
            ...Object.fromEntries(sizes.map((z) => [z, r.replies[z]?.text || r.replies[z]?.error || null])),
            better: Object.fromEntries(Object.entries(r.verdicts || {}).map(([j, v]) => [j, v?.better || v?.error || null])),
          })),
        };
      },
    };
  },

  // The first people fill for one person, read only: the people Gremly would
  // find in their facts, who each is as the person said it, and the merges it
  // would propose, for a person to read before anything is written
  async 'people-fill'() {
    const userId = flag('--user');
    if (!userId) fail('people-fill needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof people.fillPeople !== 'function') fail('This tree has no people records.');
        return people.fillPeople(env, userId, { person: await personIdentity(env, userId), shadow: true });
      },
      summarise: (out) => ({
        facts: out.facts,
        calls: out.calls,
        people_new: out.people_new,
        ties: out.people_ties,
        rejected: out.people_rejected,
        who_without_words: out.people_who_without_words,
        people: out.found,
        proposed_merges: out.proposed_merges,
      }),
    };
  },

  // Filing (data fabric stage 4a) over a person's latest real drops, read
  // only: where each would go by the one set of rules, beside where it is
  // filed now, for a person to read
  async filing() {
    const userId = flag('--user');
    if (!userId) fail('filing needs --user');
    const limit = Math.max(1, Number(flag('--limit') || 40));
    const at = flag('--at') || new Date().toISOString();
    return {
      at,
      userId,
      run: async () => {
        if (typeof filing.fileDrop !== 'function') fail('This tree has no filing.');
        const all = await filing.listDropsToFile(env, userId, { before: at, refile: true });
        const drops = all.slice(-limit);
        const graph = await filing.loadGraph(env, userId);
        const placed = await filing.loadPlaced(env, userId);
        const today = await filing.personToday(env, userId);
        // where each is filed now, by anyone
        const d = db(env);
        const ids = drops.map((x) => x.id).join(',');
        const [wl, cl, xl, worlds, chapters] = await Promise.all([
          d.select(`drop_world_links?drop_id=in.(${ids})&select=drop_id,drop_type,world_id,assigned_by`),
          d.select(`drop_chapter_links?drop_id=in.(${ids})&select=drop_id,drop_type,chapter_id,assigned_by`),
          d.select(`drop_context_links?drop_id=in.(${ids})&select=drop_id,drop_type,context_id`),
          d.select(`worlds?owner_id=eq.${userId}&select=id,name`),
          d.select(`chapters?owner_id=eq.${userId}&select=id,title`),
        ]);
        const wname = new Map((worlds || []).map((w) => [w.id, w.name]));
        const ctitle = new Map((chapters || []).map((c) => [c.id, c.title]));
        const nowOf = (x) => ({
          worlds: (wl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).map((l) => `${wname.get(l.world_id) || l.world_id}${l.assigned_by === 'user' ? ' (theirs)' : ''}`),
          chapters: (cl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).map((l) => `${ctitle.get(l.chapter_id) || l.chapter_id}${l.assigned_by === 'user' ? ' (theirs)' : ''}`),
          contexts: (xl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).length,
        });
        const results = new Array(drops.length);
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, drops.length) }, async () => {
            while (next < drops.length) {
              const i = next++;
              results[i] = await filing.fileDrop(env, { userId, drop: drops[i], today, graph, placed });
            }
          }),
        );
        return {
          drops: drops.map((x, i) => ({
            id: x.id,
            type: x.entity_type,
            date: x.date,
            title: x.title,
            text: String(x.text || '').slice(0, 200),
            now: nowOf(x),
            filed: {
              by: results[i].by,
              world: results[i].world?.name || null,
              chapter: results[i].chapter?.title || null,
              starts_something: results[i].starts_something,
              confidence: results[i].confidence || null,
              // what it named, even below the bar
              choice: results[i].choice || null,
              contexts: (results[i].contexts || []).map((c) => c.name),
              skipped: results[i].skipped_reason || null,
            },
          })),
          worlds: graph.worlds.length,
          chapters: graph.chapters.length,
          contexts: graph.contexts.length,
          total_drops: all.length,
        };
      },
      summarise: (out) => {
        const rows = out?.drops || [];
        const plain = (n) => String(n || '').replace(/ \(theirs\)$/, '');
        return {
          worlds: out?.worlds,
          chapters: out?.chapters,
          contexts: out?.contexts,
          drops: rows.length,
          of: out?.total_drops,
          filed_chapter: rows.filter((r) => r.filed.chapter).length,
          filed_world_only: rows.filter((r) => r.filed.world && !r.filed.chapter).length,
          filed_nowhere: rows.filter((r) => !r.filed.world && !r.filed.chapter && !r.filed.skipped).length,
          person_placed: rows.filter((r) => r.filed.by === 'person').length,
          skipped: rows.filter((r) => r.filed.skipped).length,
          starts_something: rows.filter((r) => r.filed.starts_something).length,
          given_a_context: rows.filter((r) => (r.filed.contexts || []).length).length,
          in_a_context_now: rows.filter((r) => r.now.contexts).length,
          same_world_as_now: rows.filter((r) => r.filed.world && r.now.worlds.map(plain).includes(r.filed.world)).length,
          in_a_world_now: rows.filter((r) => r.now.worlds.length).length,
          worlds_now_per_drop: rows.length ? Math.round((rows.reduce((n, r) => n + r.now.worlds.length, 0) / rows.length) * 100) / 100 : 0,
          rows,
        };
      },
    };
  },

  // Data fabric stage 4b, read only: the words under each World and open
  // Chapter beside what is there now; the memory each closed Chapter would get;
  // the first Worlds a person with none would get; and Up next
  async words() {
    const userId = flag('--user');
    if (!userId) fail('words needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof stage4b.writeWords !== 'function') fail('This tree has no words writer.');
        return stage4b.writeWords(env, userId, { reason: 'shadow', dryRun: true });
      },
      summarise: (out) => ({
        written: out?.written,
        left_out: out?.left_out,
        empty: out?.empty,
        failed: out?.failed,
        lines: (out?.lines || []).map((l) => ({ table: l.table, id: l.id, outcome: l.outcome, now: l.was, words: l.text, problems: l.problems, error: l.error })),
      }),
    };
  },

  async memories() {
    const userId = flag('--user');
    if (!userId) fail('memories needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4bMemory.writeMemory !== 'function') fail('This tree has no memory writer.');
        const ids = flag('--chapter') ? [flag('--chapter')] : await stage4bMemory.chaptersWantingMemory(env, userId);
        const out = [];
        for (const id of ids.slice(0, Number(flag('--limit') || 20))) {
          const [c] = await db(env).select(`chapters?id=eq.${id}&select=title,epigraph`);
          try {
            const r = await stage4bMemory.writeMemory(env, userId, id, { dryRun: true });
            out.push({ id, title: c?.title, now: c?.epigraph || null, outcome: r.outcome, memory: r.memory, problems: r.problems });
          } catch (err) {
            out.push({ id, title: c?.title, error: String(err.message).slice(0, 300) });
          }
        }
        return out;
      },
      summarise: (out) => ({
        chapters: out?.length,
        written: (out || []).filter((x) => x.memory).length,
        left_out: (out || []).filter((x) => x.outcome === 'left_out').length,
        memories: out,
      }),
    };
  },

  async 'first-worlds'() {
    const userId = flag('--user');
    if (!userId) fail('first-worlds needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof stage4bFirst.makeFirstWorlds !== 'function') fail('This tree has no first Worlds.');
        return stage4bFirst.makeFirstWorlds(env, userId, { dryRun: true });
      },
      summarise: (out) => ({
        due: out?.stats ? stage4bFirst.firstWorldsDue(out.stats) : null,
        stats: out?.stats,
        model: out?.proposed?.model,
        problems: out?.proposed?.problems,
        worlds: (out?.proposed?.worlds || []).map((w) => ({ name: w.name, gremly: w.gremly, rests_on: w.rests_on.length, why: w.why })),
      }),
    };
  },

  async 'up-next'() {
    const userId = flag('--user');
    if (!userId) fail('up-next needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof upNextMod.loadUpNext !== 'function') fail('This tree has no Up next.');
        const today = await filing.personToday(env, userId);
        return { today, up_next: await upNextMod.loadUpNext(db(env), userId, today) };
      },
      summarise: (out) => ({ ...out, words: out?.up_next ? upNextMod.upNextWords(out.up_next) : null }),
    };
  },

  // Data fabric stage 4c, read only: the check on who someone is over every
  // person record, and the question about someone that would be asked
  async 'people-check'() {
    const userId = flag('--user');
    if (!userId) fail('people-check needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof people.recheckPeople !== 'function') fail('This tree has no check on who someone is.');
        return people.recheckPeople(env, userId, {
          person: await personIdentity(env, userId),
          shadow: true,
          onlyUnchecked: false,
          limit: Number(flag('--limit') || 150),
        });
      },
      summarise: (out) => out,
    };
  },

  // The ledger review (data fabric stage 4f): the questions and tidy ups the
  // weekly review of this tree would put to them, never written. The summary
  // keeps what each rests on by id, its kind and weight; the questions and
  // statements stay in record.json.
  async review() {
    const userId = flag('--user');
    if (!userId) fail('review needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4fReview.reviewLedger !== 'function') fail('This tree has no ledger review.');
        return stage4fReview.reviewLedger(env, userId, { shadow: true, runId: `shadow-review-${userId.slice(0, 8)}` });
      },
      summarise: (out) => ({
        model: out?.model || null,
        facts: out?.facts ?? null,
        found: out?.found || null,
        skipped: out?.skipped || null,
        rows: (out?.rows || []).map((r) => ({
          kind: r.kind,
          weight: r.weight,
          type: r.proposed_change?.type || 'question',
          facts: (r.rests_on || []).map((x) => x.id),
          choices: r.choices,
        })),
      }),
    };
  },

  async 'person-question'() {
    const userId = flag('--user');
    if (!userId) fail('person-question needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4cPeople.writePersonQuestion !== 'function') fail('This tree has no people questions.');
        const { candidates } = await stage4cPeople.loadPersonCandidates(env, userId);
        const out = await stage4cPeople.writePersonQuestion(env, userId, { dryRun: true });
        return {
          ...out,
          candidates: candidates.map((c) => ({
            type: c.type,
            weight: c.weight,
            who: c.type === 'same' ? [c.kept.name || c.kept.relationship, c.merged.name || c.merged.relationship] : c.person.name || c.person.relationship,
          })),
        };
      },
      summarise: (out) => ({
        written: out?.written,
        skipped: out?.skipped || null,
        why: out?.why || null,
        question: out?.row?.question || null,
        choices: out?.row?.choices || null,
        about: out?.row?.proposed_change || null,
        candidates: out?.candidates,
      }),
    };
  },

  // The day's Chapter questions, as they would be raised with the switch on:
  // the welcome back, the close questions due, and at most one suggestion
  async 'chapter-questions'() {
    const userId = flag('--user');
    if (!userId) fail('chapter-questions needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4cChapters.chapterQuestionsForDay !== 'function') fail('This tree has no Chapter questions.');
        return stage4cChapters.chapterQuestionsForDay(env, userId, { dryRun: true });
      },
      summarise: (out) => {
        const rowOf = (r) => ({
          kind: r.kind,
          question: r.question,
          choices: r.choices,
          about: r.proposed_change,
          rests_on: r.rests_on?.length ?? null,
        });
        return {
          today: out?.today,
          away: out?.away,
          welcome_back: out?.welcome_back,
          skipped: out?.skipped || null,
          welcome: out?.welcome ? { ...out.welcome, rows: (out.welcome.rows || []).map(rowOf) } : null,
          close: out?.close ? { ...out.close, rows: (out.close.rows || []).map(rowOf) } : null,
          suggest: out?.suggest ? { ...out.suggest, row: out.suggest.row ? rowOf(out.suggest.row) : null } : null,
        };
      },
    };
  },

  // What the weekly pass would be given, built without asking the model: how
  // long it is, and how many plans it shows as passed
  async 'weekly-input'() {
    const userId = flag('--user');
    if (!userId) fail('weekly-input needs --user');
    const at = flag('--at') || new Date().toISOString();
    return {
      at,
      userId,
      run: () => {
        if (typeof weekly.weeklyRequestParams !== 'function') fail('This tree has no weekly request.');
        return weekly.weeklyRequestParams(env, userId, at.slice(0, 10));
      },
      summarise: (out) => {
        const user = out?.params?.messages?.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n') || '';
        return {
          today: out?.today,
          input_chars: out?.inputChars,
          facts: (out?.refsSnapshot || []).filter(([, v]) => v.type === 'fact').length,
          passed_plans: (user.match(/planned, date passed/g) || []).length,
        };
      },
    };
  },

  // The weekly pass and the summary written from its plan (data fabric stage
  // 5), for one person's week, beside the summary the old path sent them.
  // Claude cannot be reached from every machine this runs on, so each answer
  // Claude gives is read from --replies, and what still needs one is saved in
  // the run's folder as needs.json for scripts/weekly-replay/run.sh answer to
  // fill. The words check's answers are kept in the same file, so a run picked
  // up again asks the check the same things and gets the same answers. The
  // replies file holds real words: it lives beside the shadow output, never in
  // the repo.
  async 'weekly-summary'() {
    const userId = flag('--user');
    const at = flag('--at');
    const repliesPath = flag('--replies');
    if (!userId || !at || !repliesPath) fail('weekly-summary needs --user, --at and --replies');
    const replies = existsSync(repliesPath)
      ? JSON.parse(readFileSync(repliesPath, 'utf8'))
      : { claude: {}, check: {} };
    const needs = new Map();
    const keyOf = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
    const NEEDS = 'this needs an answer from Claude, saved in needs.json';
    const fromClaude = (kind, body) => {
      // a write's message does not carry the writer's own rules, so its key
      // names their version: an answer written under other rules is not reused
      const key = keyOf(kind === 'write' ? { v: stage5Writer.PLAN_WRITER_VERSION, body } : body);
      const r = replies.claude[key];
      if (r) return JSON.parse(JSON.stringify(r.output));
      needs.set(key, { key, kind, body });
      throw new Error(NEEDS);
    };
    const headers = { apikey: APIKEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
    const fetchRows = async (path) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return res.json();
    };
    const runRpc = async (fn, params) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(params) });
      if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return res.json();
    };
    // the check as the weekly worker asks it
    const ask = async (req) => {
      const key = keyOf(req);
      if (replies.check[key]) return replies.check[key];
      const out = (
        await jsonCall(env, {
          primary: modelFor(env, 'check'),
          fallback: modelFor(env, 'checkFallback'),
          ...req,
          maxTokens: 1500,
          effort: 'low',
          thinking: 'low',
        })
      ).output;
      replies.check[key] = out;
      return out;
    };
    // what the summary's read functions answer for this week, read by hand
    // where the shadow role may not run them yet: { "<function>": answer }
    const rpcFrom = flag('--rpc-from') ? JSON.parse(readFileSync(flag('--rpc-from'), 'utf8')) : null;
    const weekEnd = flag('--week-end') || at.slice(0, 10);
    const weekStart = new Date(Date.parse(`${weekEnd}T12:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
    return {
      at,
      userId,
      ...(rpcFrom ? { rpcAnswer: (fn) => rpcFrom[fn] } : {}),
      run: async () => {
        if (typeof stage5Summary.generateSummaryFromPass !== 'function') fail('This tree has no summary from the weekly pass.');
        const p = await weekly.weeklyRequestParams(env, userId, weekEnd);
        const claudeCents = () =>
          Object.values(replies.claude).reduce((n, r) => n + (r.cents || 0), 0);
        let output;
        try {
          output = fromClaude('pass', p.params);
        } catch (err) {
          if (err.message !== NEEDS) throw err;
          return { stage: 'the pass waits for Claude', needs: [...needs.values()] };
        }
        const shape = weekly.weeklyShapeProblems(output);
        const applied = await weekly.applyWeekly(env, userId, output, p.refsSnapshot, { shadow: true, runId: 'shadow-weekly', today: p.today });
        const run = {
          id: 'shadow-weekly',
          model: replies.claude[keyOf(p.params)]?.model ?? null,
          prompt_version: weekly.WEEKLY_PROMPT_VERSION,
          status: 'applied',
          input_stats: { refs: p.refsSnapshot, counts: p.stats?.counts ?? null, today: p.today },
          output,
        };
        const r = await stage5Summary.generateSummaryFromPass({
          userId,
          weekStart,
          weekEnd,
          label: `${userId.slice(0, 8)} · ${weekStart} · from the weekly pass`,
          env,
          runRpc,
          fetchRows,
          ask,
          run,
          write: (user) => fromClaude('write', user),
        });
        // the summary the old path sent for the same week, to read beside it
        const [old] = await fetchRows(`weekly_summaries?user_id=eq.${userId}&week_start_date=eq.${weekStart}&select=content,created_at&limit=1`);
        return {
          stage: needs.size ? 'the summary waits for Claude' : 'done',
          needs: [...needs.values()],
          pass: { shape, applied: applied?.applied ?? null, plan: output?.summary_plan ?? null, people_notes: output?.people_notes ?? null, week_note: output?.week_note ?? null },
          claude_cents: Math.round(claudeCents() * 1000) / 1000,
          summary: needs.size ? null : { ...r, html: undefined },
          old: old?.content ?? null,
        };
      },
      summarise: (out) => {
        // the check's answers go back to the replies file, joined with whatever
        // reached it while this ran, so no answer kept there is lost
        const now = existsSync(repliesPath) ? JSON.parse(readFileSync(repliesPath, 'utf8')) : { claude: {}, check: {} };
        writeFileSync(
          repliesPath,
          JSON.stringify(
            { claude: { ...now.claude, ...replies.claude }, check: { ...now.check, ...replies.check } },
            null,
            2,
          ),
        );
        const deck = out?.summary?.content;
        return {
          stage: out?.stage,
          needs: (out?.needs || []).map((n) => `${n.kind} ${n.key}`),
          claude_cents: out?.claude_cents,
          pass_shape: out?.pass?.shape,
          applied: out?.pass?.applied,
          planned: (out?.pass?.plan?.cards || []).length,
          dropped: out?.summary?.dropped,
          outcome: out?.summary?.outcome,
          why: out?.summary?.why,
          left_out: out?.summary?.deck?.left_out?.map((x) => `${x.shape} ${x.key}`),
          cards: deck?.cards?.map((c) => c.shape),
          old_cards: out?.old?.cards?.map((c) => c.shape) ?? null,
        };
      },
    };
  },

  // The monthly story (data fabric stage 6) for one person, its items through
  // the check where the tree has it. Claude's answer is read from --replies,
  // and what still needs one is saved as needs.json for
  // scripts/weekly-replay/run.sh answer to fill, as in weekly-summary. The
  // check's questions are asked here and kept in the same file, so a run
  // picked up again gets the same answers. The file holds real words: it lives
  // beside the shadow output, never in the repo.
  async story() {
    const userId = flag('--user');
    const repliesPath = flag('--replies');
    if (!userId || !repliesPath) fail('story needs --user and --replies');
    const replies = existsSync(repliesPath) ? JSON.parse(readFileSync(repliesPath, 'utf8')) : { claude: {}, check: {} };
    const keyOf = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
    const needs = [];
    const kept = (key, ask) => async (req) => {
      const k = keyOf({ key, req });
      if (replies.check[k]) return replies.check[k];
      const out = await ask(req);
      replies.check[k] = out;
      return out;
    };
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        const p = await story.storyRequestParams(env, userId);
        const key = keyOf(p.params);
        const answer = replies.claude[key];
        if (!answer) {
          needs.push({ key, kind: 'pass', body: p.params });
          return { stage: 'the story waits for Claude', needs };
        }
        const output = JSON.parse(JSON.stringify(answer.output));
        const opts = { shadow: true, runId: 'shadow-story', model: answer.model, today: p.today };
        const unchecked = story.storyRows(userId, output, p.refsSnapshot, opts);
        if (typeof story.checkStory !== 'function')
          return { stage: 'done', claude_cents: answer.cents, prompt: story.STORY_PROMPT_VERSION, items: unchecked.rows.length, dropped: unchecked.dropped, rows: unchecked.rows };
        const person = await personIdentity(env, userId);
        const calls = story.storyCheckCalls(env, person, p.today);
        const r = await story.applyStory(env, userId, output, p.refsSnapshot, {
          ...opts,
          calls: { ask: kept('ask', calls.ask), rewrite: kept('rewrite', calls.rewrite) },
        });
        return {
          stage: 'done',
          claude_cents: answer.cents,
          prompt: story.STORY_PROMPT_VERSION,
          items_unchecked: unchecked.rows.length,
          items: r.rows.length,
          applied: r.applied,
          stated: Object.fromEntries(
            ['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].map((l) => [l, (output[l] || []).filter((x) => (x.stated || []).length).length + ' of ' + (output[l] || []).length]),
          ),
          // what the check did to each item that did not pass at once, with the words of each try
          details: r.check.details,
          rows: r.rows,
        };
      },
      summarise: (out) => {
        const now = existsSync(repliesPath) ? JSON.parse(readFileSync(repliesPath, 'utf8')) : { claude: {}, check: {} };
        writeFileSync(repliesPath, JSON.stringify({ claude: { ...now.claude, ...replies.claude }, check: { ...now.check, ...replies.check } }, null, 2));
        // what still needs Claude, beside its replies file: <name>-replies.json, <name>-needs.json
        if (needs.length) writeFileSync(repliesPath.replace(/(-replies)?\.json$/, '-needs.json'), JSON.stringify(needs, null, 2));
        return {
          stage: out?.stage,
          needs: needs.map((n) => `${n.kind} ${n.key}`),
          claude_cents: out?.claude_cents,
          prompt: out?.prompt,
          items_unchecked: out?.items_unchecked ?? null,
          items: out?.items,
          by_kind: out?.applied?.by_kind ?? null,
          check: out?.applied?.check ?? null,
          stated: out?.stated ?? null,
          dropped: out?.applied?.dropped ?? out?.dropped ?? null,
        };
      },
    };
  },

  // The line about each person the latest weekly pass noted (data fabric
  // stage 6), as PERSON_WORDS on would write it, nothing kept. With
  // --weekly-replies (a weekly-summary job's replies file) and --week-end, the
  // notes come from the pass Claude gave there for that week, before live has
  // a pass that notes people; what still needs Claude is saved beside it.
  async 'person-words'() {
    const userId = flag('--user');
    if (!userId) fail('person-words needs --user');
    const repliesPath = flag('--weekly-replies');
    const keyOf = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage6People.writePersonWords !== 'function') fail('This tree has no line about a person.');
        let run = null;
        if (repliesPath) {
          const weekEnd = flag('--week-end');
          if (!weekEnd) fail('--weekly-replies needs --week-end');
          const p = await weekly.weeklyRequestParams(env, userId, weekEnd);
          const key = keyOf(p.params);
          const replies = existsSync(repliesPath) ? JSON.parse(readFileSync(repliesPath, 'utf8')) : { claude: {} };
          const answer = replies.claude?.[key];
          if (!answer) {
            writeFileSync(repliesPath.replace(/(-replies)?\.json$/, '-needs.json'), JSON.stringify([{ key, kind: 'pass', body: p.params }], null, 2));
            return { stage: 'the weekly pass waits for Claude', needs: [key] };
          }
          run = { id: `shadow-weekly-${weekEnd}`, people_notes: answer.output?.people_notes || [], refs: p.refsSnapshot };
        }
        return stage6People.writePersonWords({ ...env, PERSON_WORDS: 'on' }, userId, { dryRun: true, run });
      },
      summarise: (out) => ({
        stage: out?.stage || 'done',
        needs: out?.needs || [],
        run: out?.run,
        noted: out?.noted,
        written: out?.written,
        left_out: out?.left_out,
        empty: out?.empty,
        failed: out?.failed,
        lines: out?.lines,
      }),
    };
  },

  async 'story-copy'() {
    const userId = flag('--user');
    if (!userId) fail('story-copy needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof story.copyStoryIntoLifeMap !== 'function') fail('This tree has no story copy.');
        return story.copyStoryIntoLifeMap(env, userId);
      },
      summarise: (out) => ({
        result: out,
        life_map_writes: record.writes
          .filter((w) => w.table === 'user_life_map')
          .map((w) => ({
            method: w.method,
            story_passages: Boolean(w.body?.life_map?.story?.story_so_far && w.body?.life_map?.story?.story_for_them),
            story_items: Object.fromEntries(
              ['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].map((k) => [k, w.body?.life_map?.story?.[k]?.length || 0]),
            ),
          })),
      }),
    };
  },

  // Their answer to a question a review run would ask (data fabric stage 4f):
  // the question is taken from that run's record (--from, its record.json,
  // --row its place among the rows), read as if it were waiting, with their
  // answer (--said) as the correction the app sends, and the answer applied
  // as it ships. What it would change is kept aside, as in every job.
  async answer() {
    const from = flag('--from');
    const said = flag('--said');
    if (!from || !said) fail('answer needs --from, --row and --said');
    const rows = JSON.parse(readFileSync(from, 'utf8')).output?.rows || [];
    const row = rows[Number(flag('--row') || 0)];
    if (!row) fail(`That review asked ${rows.length} questions; there is no row ${flag('--row') || 0}.`);
    const qid = crypto.randomUUID();
    const cid = crypto.randomUUID();
    const at = flag('--at') || new Date().toISOString();
    const question = { ...row, id: qid, status: 'open', created_at: at };
    const correction = {
      id: cid,
      user_id: row.user_id,
      said,
      surface: 'question',
      target_ref: { id: qid },
      status: 'received',
      created_at: at,
    };
    return {
      at: new Date(Date.parse(at) + 60000).toISOString(),
      userId: row.user_id,
      rewrite: ({ table, url }) => {
        const q = new URL(url).searchParams;
        if (table === 'user_corrections' && q.get('id') === `eq.${cid}`) return [correction];
        if (table === 'gremly_questions' && q.get('id') === `eq.${qid}`) return [question];
        return null;
      },
      run: () => applyCorrection(env, cid, `shadow-answer-${Date.now()}`),
      summarise: (out) => {
        const writes = (table) => record.writes.filter((w) => w.table === table);
        return {
          question: { kind: row.kind, type: row.proposed_change?.type || null, rests_on: (row.rests_on || []).map((x) => x.id) },
          result: out,
          facts_changed: writes('life_facts')
            .filter((w) => w.method === 'PATCH')
            .map((w) => ({ path: w.path.replace(/^\/rest\/v1\//, ''), state: w.body?.state ?? null })),
          facts_added: writes('life_facts').filter((w) => w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).length,
          question_writes: writes('gremly_questions').map((w) => ({ method: w.method, status: w.body?.status ?? null })),
        };
      },
    };
  },

  async correction() {
    const id = flag('--correction');
    if (!id) fail('correction needs --correction');
    const [c] = await liveRead(`user_corrections?id=eq.${id}&select=id,user_id,created_at,status`);
    if (!c) fail('No such correction');
    const at = new Date(Date.parse(c.created_at) + 60000).toISOString();
    // Replayed on the ledger as it stood when they said it, not as this
    // correction and everything since left it (--as-is reads it as it stands):
    // facts written since are not read, each fact reads with the state it had
    // then, and the facts named in --was-open read as they were before they
    // were kept private, which no change row records. What this run would
    // have written to a fact is read back over it, as live would read it after
    // the write, so step two sees what step one decided. What Gremly wrote
    // since (the day's lines, the words) is read as it stands: no record keeps
    // what it said before. A fact this correction moved live into a state
    // step one does not read (changed, corrected) is not read back: the
    // database filters it out before this can give it its old state.
    const asIs = process.argv.includes('--as-is');
    const later = new Set();
    const then = new Map();
    if (!asIs) {
      // this correction's own, when it was applied, are among them whenever it was applied
      const since = `or=(created_at.gt.${at},and(source_table.eq.user_corrections,source_id.eq.${id}))`;
      for (let from = 0; ; from += 1000) {
        const page = await liveRead(`life_facts?user_id=eq.${c.user_id}&${since}&select=id&order=id&limit=1000&offset=${from}`);
        for (const r of page) later.add(r.id);
        if (page.length < 1000) break;
      }
      for (const x of await liveRead(`life_fact_changes?user_id=eq.${c.user_id}&${since}&select=fact_id,from_state&order=created_at.asc&limit=1000`))
        if (!then.has(x.fact_id)) then.set(x.fact_id, x.from_state);
    }
    const wasOpen = new Set((flag('--was-open') || '').split(',').filter(Boolean));
    // what this run would have written to each fact, kept aside by the guard
    const written = () => {
      const m = new Map();
      for (const w of record.writes)
        if (w.table === 'life_facts' && w.method === 'PATCH') {
          const fid = /id=eq\.([0-9a-f-]{36})/i.exec(w.path || '')?.[1];
          if (fid) m.set(fid, { ...(m.get(fid) || {}), ...(w.body || {}) });
        }
      return m;
    };
    const asThen = (rows) => {
      const mine = written();
      return rows
        .filter((r) => !later.has(r.id))
        .map((r) => {
          const was = {
            ...r,
            ...(then.has(r.id) && 'state' in r ? { state: then.get(r.id) } : {}),
            ...(wasOpen.has(r.id) && 'private' in r ? { private: false } : {}),
          };
          const w = mine.get(r.id);
          return w ? { ...was, ...Object.fromEntries(Object.entries(w).filter(([k]) => k in r)) } : was;
        });
    };
    return {
      at,
      userId: c.user_id,
      // replayed as if it had not been applied yet; --said tries other words in its place
      rewrite: ({ table, body }) => {
        const rows = JSON.parse(body);
        if (!Array.isArray(rows)) return null;
        if (table === 'life_facts' || table === 'life_facts_now') return asIs && !wasOpen.size ? null : asThen(rows);
        if (table !== 'user_corrections') return null;
        const said = flag('--said');
        return rows.map((r) => (r.id === id ? { ...r, status: 'pending', ...(said ? { said } : {}) } : r));
      },
      run: () => applyCorrection(env, id, `shadow-${Date.now()}`),
      summarise: (out) => ({
        said_replaced: !!flag('--said'),
        as_it_stood: asIs ? false : { facts_since: later.size, states_then: then.size, was_open: wasOpen.size },
        result: out,
        // what it would change in the ledger and where, never sent
        facts: record.writes
          .filter((w) => w.table === 'life_facts' && w.method !== 'DELETE')
          .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]).map((b) => ({ method: w.method, path: w.path.replace(/^\/rest\/v1\//, '').slice(0, 80), state: b?.state ?? null, private: b?.private ?? null, statement: b?.statement ?? null }))),
        written: record.writes
          .filter((w) => ['user_daily_state', 'story_items', 'user_life_map', 'chapters', 'worlds', 'user_profiles'].includes(w.table))
          .map((w) => ({ table: w.table, path: w.path.replace(/^\/rest\/v1\//, '').slice(0, 90), fields: Object.keys(w.body || {}) })),
        world_and_chapter_writes: record.writes
          .filter((w) => w.table === 'worlds' || w.table === 'chapters')
          .map((w) => ({
            table: w.table,
            fields: Object.keys(w.body || {}),
            marks_as_theirs: Object.entries(w.body || {}).some(([k, v]) => k.endsWith('_source') && v === 'user'),
          })),
      }),
    };
  },
};

/** What a ledger read would have written, from the writes the guard kept aside. */
function ledgerWrites(rec) {
  const rows = (table, method) =>
    rec.writes
      .filter((w) => w.table === table && w.method === method)
      .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
      .filter(Boolean);
  const sources = rows('life_fact_sources', 'POST');
  return {
    new_facts: rows('life_facts', 'POST').map((f) => ({
      statement: f.statement,
      date: f.about_date,
      timing: f.timing ?? null,
      state: f.state,
      private: f.private,
      from: f.source_table,
    })),
    fact_updates: rows('life_facts', 'PATCH')
      .filter((u) => u.state)
      .map((u) => ({ to: u.state, reason: u.state_reason })),
    sources: sources.length,
    about_items: sources.filter((x) => x.role === 'about').length,
    // records a fact was already said in, now judged the item it is about
    about_marked: rows('life_fact_sources', 'PATCH').length,
    questions: rows('gremly_questions', 'POST').map((q) => q.question),
    calendar: rows('synced_calendar_events', 'PATCH').map((x) => (x.cancelled_at ? 'cancelled' : 'on again')),
  };
}

function pickMorning(dco, built) {
  if (!dco) return null;
  return {
    headline: dco.brief?.headline ?? null,
    day_shape: dco.brief?.day_shape ?? null,
    lead: dco.lead_story?.what ?? null,
    claims: (dco.brief?.claims || []).length,
    focus: (dco.today_focus || []).filter(Boolean).length,
    attempts: built?.attempts ?? null,
    input_chars: built?.inputChars ?? null,
    failed: built?.problems ? built.problems.length : (built?.failed ?? null),
    problems: built?.problems ? built.problems.map((p) => p.field) : null,
    // what the check did (data fabric stage 3), with the words of each try
    check: built?.check || null,
    lines: built?.kept ? built.kept.map((k) => ({ field: k.key, text: k.text, refs: k.refs })) : null,
  };
}

const make = JOBS[job];
if (!make) fail(`Unknown job "${job}". Jobs: ${Object.keys(JOBS).join(', ')}`);
const plan = await make();
const pending = await pendingSchema();
if (pending) console.log(`SQL this tree needs is not on live yet; answered as it would leave live: ${JSON.stringify(pending)}`);
installClock(plan.at);
installFetchGuard({ supabaseUrl: SUPABASE_URL, atIso: plan.at, record, rewrite: plan.rewrite, apikey: APIKEY, pending, rpcAnswer: plan.rpcAnswer });
installAiUsageLogging();
const started = Date.now();
let out;
let error = null;
try {
  out = await aiContext.run(
    { env, worker: 'shadow', job: `shadow-${job}`, userId: plan.userId, runId: `shadow-${started}` },
    plan.run,
  );
} catch (err) {
  error = String(err?.stack || err).slice(0, 2000);
}
await new Promise((r) => setTimeout(r, 300)); // usage rows land after the calls answer
const summary = {
  job,
  at: plan.at,
  code: process.env.SHADOW_CODE_LABEL || 'working tree',
  ms: Date.now() - started,
  error,
  cost: shadowCost(record.usage),
  // SQL this tree needs that live lacked, answered as the SQL would leave it
  pending_schema: pending,
  writes_kept: record.writes.length,
  writes_by_table: record.writes.reduce((m, w) => ({ ...m, [w.table || `rpc ${w.rpc}`]: (m[w.table || `rpc ${w.rpc}`] || 0) + 1 }), {}),
  side_effects: record.effects.length,
  ...(error ? {} : plan.summarise(out)),
};
const dir = join(process.env.SHADOW_OUT || join(ROOT, 'Claude outputs', 'shadow'), `${RUN_STAMP.replace(/[:.]/g, '-')}-${job}-${String(plan.userId).slice(0, 8)}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(dir, 'record.json'), JSON.stringify({ ...record, output: out ?? null }, null, 2));
// what a run still needs Claude to answer (the weekly-summary job)
if (out?.needs?.length) writeFileSync(join(dir, 'needs.json'), JSON.stringify(out.needs, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Saved to ${dir}`);
