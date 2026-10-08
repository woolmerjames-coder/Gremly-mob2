/**
 * Ask Gremly's agent lane replay (agent plan step 9). Each scenario is one of
 * the kinds of message triage sends to the agent, run through the agent
 * on the chat surface (workers/cortex/agent/chat.js) with real models, its
 * items standing in for the database, and the preload the quick lane reads
 * (who they are, and the week ahead). Checked: the card's rows, no change spoken
 * of as done, at most one question, no dashes, and the time and cost.
 *
 *   scripts/chat-replay/run.sh                          every scenario on Luna, three times
 *   scripts/chat-replay/run.sh --only vet-friday --models gemini,openai --repeat 1
 *   scripts/chat-replay/run.sh --with-week              every scenario sent their week (the weekly review)
 *   scripts/chat-replay/run.sh --with-ease              and the habits eased now, as a build that can pause a habit sends them
 *   scripts/chat-replay/run.sh --triage                 each message read by triage first, as cortex-index.js does, and the agent told how it reads (data fabric stage 4e)
 *   scripts/chat-replay/run.sh --places                 every scenario from an app build that can change Worlds and Chapters, with Alex's usual ones (Worlds rebuild, stage 2); a scenario with worlds of its own always is
 *
 * Keys come from the environment (OPENAI_API_KEY, GEMINI_TEST_API_KEY).
 * Output goes to scripts/chat-replay/out/ (gitignored).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { SCENARIOS, WEEK, NOW_ISO, THEIR_WEEK, PLACES } from './scenarios.mjs';
import { runChatTurn, CHAT_AGENT_VERSION } from '../../workers/cortex/agent/chat.js';
import { configureModels } from '../../workers/cortex/models.js';
import { triageMessage } from '../../workers/cortex/triage.js';
import { runTool } from '../../workers/cortex/agent/tools/index.js';
import { costUsd } from '../../workers/shared/aiUsage.js';
import { formatWeekAhead, weekFrom } from '../../workers/cortex/context/weekAhead.js';
import { formatDatedAhead } from '../../workers/cortex/context/datedAhead.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = { gemini: 'gemini-3.8-flash', openai: 'gpt-6-luna' };
const models = (flag('--models') || 'openai').split(',').filter((m) => MODELS[m]);
const only = flag('--only');
const thinking = flag('--thinking');
const repeat = Math.max(1, Number(flag('--repeat') || 3));
// --with-week: every scenario is sent their week, as an app build that can show
// the weekly review sends it, so the week's line and button are there for all
// --with-ease: and the habits eased now (none, unless the scenario says), which
// is what turns on pausing a habit or giving it a lighter version
const withEase = args.includes('--with-ease');
const withWeek = withEase || args.includes('--with-week');
/** Their week for a scenario: its own, or the usual one when every scenario gets one. */
const theirWeekOf = (s) => {
  const week = s.theirWeek || (withWeek ? THEIR_WEEK : null);
  // a scenario that says a build is too old to know of pauses keeps its week as it is
  return week && withEase && !week.eased && !s.noEase ? { ...week, eased: [] } : week;
};
/** Their week with the scenario's short habit ids as the uuids real items have. */
const theirWeekFor = (s, to) => {
  const week = theirWeekOf(s);
  return week?.eased ? { ...week, eased: week.eased.map((e) => ({ ...e, habit_id: to.get(e.habit_id) || e.habit_id })) } : week;
};
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const TZ = 'America/Los_Angeles';
// Real conversations, built from someone's own data, go in fixtures/*.json (never
// committed): a scenario as in scenarios.mjs, with its own week ({ timed, allDay }
// as [start, end, title]), profileText, and expect patterns as strings.
const fromFixtures = [];
const FIXTURES = join(HERE, 'fixtures');
if (existsSync(FIXTURES)) {
  for (const f of readdirSync(FIXTURES).filter((x) => x.endsWith('.json'))) {
    const list = JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));
    for (const s of Array.isArray(list) ? list : [list]) {
      const e = s.expect || {};
      for (const k of ['mentions', 'notSaid']) if (typeof e[k] === 'string') e[k] = new RegExp(e[k], 'i');
      fromFixtures.push({ ...s, real: true });
    }
  }
}
const ALL = [...SCENARIOS, ...fromFixtures];
const scenarios = only ? ALL.filter((s) => only.split(',').includes(s.id)) : ALL;

// tokens and price of every model call in a turn, read from each reply
const turnUsage = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const t0 = Date.now();
  const res = await realFetch(url, init);
  const ms = Date.now() - t0;
  const u = String(url);
  const calls = turnUsage.getStore();
  if (calls && (u.includes('generativelanguage') || u.includes('api.openai.com'))) {
    try {
      const j = await res.clone().json();
      if (j.usageMetadata) {
        const m = j.usageMetadata;
        const cached = m.cachedContentTokenCount || 0;
        calls.push({ ms, model: j.modelVersion || MODELS.gemini, input: (m.promptTokenCount || 0) - cached, cached, cacheWrite: 0, output: (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0) });
      } else if (j.usage) {
        const cached = j.usage.input_tokens_details?.cached_tokens || 0;
        calls.push({ ms, model: j.model || MODELS.openai, input: (j.usage.input_tokens || 0) - cached, cached, cacheWrite: 0, output: j.usage.output_tokens || 0 });
      }
    } catch {
      // usage is only for the report
    }
  }
  return res;
};

/** Whether a scenario comes from an app build that can change Worlds and Chapters, and its Worlds and Chapters. */
const placesOn = (s) => !!s.worlds || args.includes('--places');
const placesOf = (s) => (placesOn(s) ? { worlds: s.worlds || PLACES.worlds, chapters: s.chapters || PLACES.chapters, declined: s.declined || [] } : null);

/** Each scenario's short ids as the uuids real items, Worlds and Chapters have, and back. */
function idsFor(s) {
  const to = new Map();
  (s.items || []).forEach((x, i) => to.set(x.id, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
  const p = placesOf(s);
  (p?.worlds || []).forEach((w, i) => to.set(w.id, `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`));
  (p?.chapters || []).forEach((c, i) => to.set(c.id, `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`));
  return { to, back: new Map([...to].map(([a, b]) => [b, a])) };
}

// Postgres's english stop words (three letters or more)
const STOP = new Set(
  'myself our ours ourselves you your yours yourself yourselves him his himself she her hers herself its itself they them their theirs themselves what which who whom this that these those are was were been being have has had having does did doing the and but because until while for with about against between into through during before after above below from down out off over under again further then once here there when where why how all any both each few more most other some such nor not only own same than too very can will just don should now'.split(' '),
);

/** A stand-in for the database: the scenario's items and memories, answered as the tools ask. */
function dbFor(s, to) {
  const rows = { todos: [], habits: [], notes: [] };
  for (const x of s.items || []) {
    const id = to.get(x.id);
    if (x.kind === 'todo')
      rows.todos.push({ id, name: x.title, title: x.title, body: '', notes: '', due_day: x.due_day || null, due_time: x.due_time ? `${x.due_time}:00` : null, time_estimate_minutes: null, reminders_json: [], completed_at: null, archived: false, views: {} });
    if (x.kind === 'habit')
      rows.habits.push({ id, name: x.title, title: x.title, frequency: 'weekly', cadence: 'weekly', target_per_period: 3, days_active: null, frequency_json: null, notes: '', archived: false, reminders_json: [], views: {} });
    if (x.kind === 'note')
      rows.notes.push({ id, title: x.title, body: x.body || '', subtype: 'idea', target_date: null, archived: false, reminders_json: [], views: {} });
  }
  const typeOf = { todos: 'todo', habits: 'habit', notes: 'note' };
  // their Worlds and Chapters, as the tables have them
  const p = placesOf(s);
  const places = {
    worlds: (p?.worlds || []).map((w, i) => ({ id: to.get(w.id), name: w.name, display_name: w.name, phase: w.hidden ? 'archived' : 'active', card_subtitle: null, mascot_slug: null, created_at: `2026-0${(i % 8) + 1}-01T00:00:00Z` })),
    chapters: (p?.chapters || []).map((c, i) => ({ id: to.get(c.id), title: c.title, phase: c.closed ? 'closed' : c.start && c.start > (s.today || '2026-10-03') ? 'upcoming' : 'active', start_date: c.start || null, end_date: c.end || null, primary_world_id: to.get(c.world) || null, closed_at: c.closed ? `${c.end || '2026-09-01'}T12:00:00Z` : null, card_subtitle: null, mascot_slug: null, created_at: `2026-0${(i % 8) + 1}-02T00:00:00Z` })),
    gremly_questions: (p?.declined || []).map((t) => ({ proposed_change: { type: 'start', title: t }, topic: t, answered_at: '2026-09-20T12:00:00Z' })),
  };
  return {
    select: async (path) => {
      const [table, query = ''] = path.split('?');
      if (table === 'worlds') return places.worlds;
      if (table === 'chapters') return places.chapters;
      if (table === 'gremly_questions') return query.includes('kind=eq.start_chapter') ? places.gremly_questions : [];
      const idEq = /(?:^|&)id=eq\.([^&]+)/.exec(query)?.[1];
      if (rows[table] && idEq) return rows[table].filter((r) => r.id === idEq);
      const idIn = /(?:^|&)id=in\.\(([^)]*)\)/.exec(query)?.[1];
      if (rows[table] && idIn) return rows[table].filter((r) => idIn.split(',').includes(r.id));
      if (table === 'todos' && query.includes('due_day=eq.')) {
        const day = /due_day=eq\.([0-9-]+)/.exec(query)[1];
        return rows.todos.filter((r) => r.due_day === day);
      }
      if (table === 'todos' && query.includes('due_day=lt.')) {
        const day = /due_day=lt\.([0-9-]+)/.exec(query)[1];
        return rows.todos.filter((r) => r.due_day && r.due_day < day);
      }
      if (table === 'habits') return rows.habits;
      if (table === 'synced_calendar_events') {
        const from = /start_at=gte\.([^&]+)/.exec(query)?.[1];
        const until = /start_at=lt\.([^&]+)/.exec(query)?.[1];
        const lo = decodeURIComponent(from || '');
        const hi = decodeURIComponent(until || '');
        const allDay = query.includes('is_all_day=eq.true');
        const list = allDay
          ? WEEK.allDay.map(([a, b, t], i) => ({ id: `a${i}`, title: t, start_at: a, end_at: b, is_all_day: true }))
          : WEEK.timed.map(([a, b, t], i) => ({ id: `m${i}`, title: t, start_at: a, end_at: b, is_all_day: false }));
        return list.filter((e) => (!lo || e.start_at >= lo.replace(/\.000Z$/, 'Z')) && (!hi || e.start_at < hi.replace(/\.000Z$/, 'Z')));
      }
      return [];
    },
    rpc: async (fn, a) => {
      if (fn === 'recall_life' || fn === 'recall_life_now') return s.memories || [];
      if (fn !== 'find_items') return [];
      // as the database's english search: common words dropped, stems matched,
      // any of them, a match in the name counting most
      const words = String(a.p_query || '')
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
        .map((w) => w.slice(0, 4));
      if (a.p_query && !words.length) return [];
      const score = (i) =>
        words.reduce((n, w) => n + ((i.r.name || i.r.title).toLowerCase().includes(w) ? 2 : (i.r.body || '').toLowerCase().includes(w) ? 1 : 0), 0);
      return Object.entries(rows)
        .flatMap(([table, list]) => list.map((r) => ({ type: typeOf[table], r })))
        .filter((i) => !a.p_types || a.p_types.includes(i.type))
        .filter((i) => !words.length || score(i) > 0)
        .sort((x, y) => score(y) - score(x))
        .slice(0, a.p_limit || 12)
        .map((i) => ({ type: i.type, id: i.r.id, title: i.r.name || i.r.title, day: i.r.due_day || null, time: i.r.due_time || null, state: 'open', detail: null, snippet: i.r.body || '' }));
    },
  };
}

/** The week ahead as the preload has it, with the scenario's todos on their days. */
function weekOf(s, to) {
  const todos = (s.items || [])
    .filter((x) => x.kind === 'todo' && x.due_day)
    .map((x) => ({ id: to.get(x.id), name: x.title, due_day: x.due_day, due_time: x.due_time ? `${x.due_time}:00` : null }));
  const first = s.today || '2026-10-03';
  const week = s.week || WEEK;
  return weekFrom({
      first,
      tz: TZ,
      synced: {
        timed: week.timed.map(([a, b, t], i) => ({ id: `m${i}`, title: t, start_at: a, end_at: b, is_all_day: false })),
        allDay: (week.allDay || []).map(([a, b, t], i) => ({ id: `a${i}`, title: t, start_at: a, end_at: b, is_all_day: true })),
        long: [],
      },
      noteEvents: [],
      quickEvents: [],
      todos: todos.filter((t) => t.due_day >= first),
      overdue: todos.filter((t) => t.due_day < first),
  });
}

const CLAIMS = [
  /\b(i['’]ve|i have)\s+(\w+\s+)?(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|set|put|made|taken|skipped)\b/i,
  /\ball set\b/i,
  /^\s*done\b/i,
  /\b(it['’]s|that['’]s|they['’]re|is|are)\s+now\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|in)\b/i,
];

function check(s, r, back) {
  const short = (id) => (id ? back.get(id) || id : id);
  const rows = (r.card || []).map((c) => {
    const row = { ...c, id: short(c.id) };
    if (c.into) row.into = short(c.into);
    if (c.fields && (c.fields.world || c.fields.items))
      row.fields = { ...c.fields, ...(c.fields.world ? { world: short(c.fields.world) } : {}), ...(c.fields.items ? { items: c.fields.items.map((x) => ({ ...x, id: short(x.id) })) } : {}) };
    return row;
  });
  const reply = r.reply || '';
  const e = s.expect;
  const out = [];
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail });
  const asked = (reply.match(/\?/g) || []).length;
  if (e.askOrRows && !rows.length) add('Asks what it needs instead', asked >= 1, reply);
  else {
    if (e.rows !== undefined) add(`${e.rows} card rows`, rows.length === e.rows, rows.length);
    if (e.minRows !== undefined) add(`At least ${e.minRows} rows`, rows.length >= e.minRows, rows.length);
    if (e.row && rows.length) add('Each row is the change asked for', rows.every(e.row), JSON.stringify(rows));
    if (e.some) add('The row asked for is there', rows.some(e.some), JSON.stringify(rows));
  }
  if (e.maxRows !== undefined) add(`At most ${e.maxRows} rows`, rows.length <= e.maxRows, rows.length);
  if (e.mentions) add('Answers from what it looked up', e.mentions.test(reply), reply);
  if (e.notSaid) add('Says nothing untrue', !e.notSaid.test(reply), reply);
  // saying the change is on a card to accept is true; saying it is done is not
  const sentences = reply.split(/(?<=[.!?])\s+/).filter((x) => !/\bcard\b/i.test(x));
  add('Nothing spoken of as done', !sentences.some((x) => CLAIMS.some((re) => re.test(x))), reply);
  // the week's button: there when they asked for their week, and reading what
  // it opens; never there when they asked for something else
  if (theirWeekOf(s)) {
    const offer = r.offer || null;
    if (e.offer === 'plan') add('The Plan your week button', !!offer && offer.done === false, JSON.stringify(offer));
    else if (e.offer === 'week') add('The Your week button', !!offer && offer.done === true, JSON.stringify(offer));
    else if (e.offer !== 'may') add('No week button unasked', !offer, JSON.stringify(offer));
  }
  add('At most one question', asked <= 1, reply);
  add('No dashes as punctuation', !/\s[-–—]\s|—/.test(reply), reply);
  add('A reply', reply.trim().length > 0, reply);
  return { checks: out, rows };
}

async function runOne(s, modelKey) {
  const { to, back } = idsFor(s);
  const env = { GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  const calls = [];
  const started = Date.now();
  try {
    // --triage: how triage reads the message, as Ask Gremly hands it to the agent
    const triage = args.includes('--triage')
      ? await triageMessage({
          userMessage: s.text,
          previousExchange: null,
          runningSummary: '',
          chatType: 'general',
          env,
          domainNames: [],
          profileSnippet: '',
          messageCount: (s.history || []).length + 1,
        })
      : null;
    const r = await runChatTurn({
      env,
      userId: USER,
      timezone: TZ,
      messages: [...(s.history || []), { role: 'user', content: s.text }],
      preload: {
        profileText: s.profileText || 'IDENTITY: Alex. Lives in San Francisco with their partner Jo and their dog Bella. Works in client services, and is building an app on the side.',
        // the week ahead, and the ledger's dated things ahead when the scenario has them
        sessionContext: [
          formatWeekAhead(weekOf(s, to)),
          formatDatedAhead(s.dated ? { day: s.today || '2026-10-03', rows: s.dated } : null),
        ]
          .filter(Boolean)
          .join('\n\n'),
        week: weekOf(s, to),
        // their day, which after midnight is still the day before until 3am
        ...(s.today ? { today: s.today } : {}),
        // --old-clock leaves it out: the clock words as they were before 5 October
        ...(args.includes('--old-clock') ? {} : { dayEndHour: 3 }),
        ...(triage ? { triage } : {}),
      },
      week: theirWeekFor(s, to),
      // an app build that can change Worlds and Chapters
      worlds: placesOn(s),
      deps: {
        now: () => Date.parse(s.nowIso || NOW_ISO),
        ctx: { env, userId: USER, timezone: TZ, cache: new Map(), db: dbFor(s, to) },
        models: { model: MODELS[modelKey], fallback: MODELS[modelKey], thinking: thinking || undefined },
        agent: {
          runTool: async (ctx, name, input) => {
            const t = await runTool(ctx, name, input);
            calls.push({ name, input, said: t.text });
            return t;
          },
        },
      },
    });
    const ms = Date.now() - started;
    if (!r.ok) return { model: modelKey, ms, error: `the agent did not finish: ${r.error}` };
    return { model: modelKey, ms, out: r, calls, triage: triage ? { mode: triage.mode, personal: triage.personal, lane: triage.lane } : null, ...check(s, r, back) };
  } catch (err) {
    return { model: modelKey, ms: Date.now() - started, error: String(err?.message || err) };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// triage as cortex's wrangler.toml runs it (used with --triage)
configureModels({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: 'gpt-6-luna',
  MODEL_TRIAGE: 'gpt-6-luna',
  MODEL_TRIAGE_MODE: 'gpt-4.1-mini',
  MODEL_TRIAGE_SIGNALS: 'gpt-4.1-mini',
  TRIAGE_ONE_CALL: 'on',
});
const jobs = scenarios.flatMap((s) => models.flatMap((m) => Array.from({ length: repeat }, () => ({ s, m }))));
console.log(`Running ${jobs.length} chat turns (${scenarios.length} messages × ${models.join(', ')} × ${repeat})…`);
const done = await pool(jobs, 4, async ({ s, m }) => {
  const usage = [];
  const r = await turnUsage.run(usage, () => runOne(s, m));
  r.usage = {
    calls: usage.length,
    stepMs: usage.map((c) => c.ms),
    input: usage.reduce((a, c) => a + c.input + c.cached, 0),
    cached: usage.reduce((a, c) => a + c.cached, 0),
    output: usage.reduce((a, c) => a + c.output, 0),
    usd: usage.reduce((a, c) => a + (costUsd(c) || 0), 0),
  };
  const fails = r.checks ? r.checks.filter((c) => !c.ok) : [];
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${m} · ${r.ms}ms · ${r.usage.calls} steps (${r.usage.stepMs.join('+')}) · ${(r.usage.usd * 100).toFixed(2)}c${
      r.error ? ` · ${r.error.slice(0, 160)}` : fails.length ? ` · ${fails.map((f) => f.name).join('; ')}` : ''
    }`,
  );
  if (r.out) {
    console.log(`      reply: ${r.out.reply}`);
    console.log(`      card: ${JSON.stringify(r.rows.map((c) => ({ op: c.op, type: c.type, id: c.id, title: c.title, fields: c.fields, ...(c.ease ? { ease: c.ease } : {}), ...(c.into ? { into: c.into } : {}) })))}  tools: ${(r.out.tools || []).join(', ') || 'none'}${r.out.offer ? `  offer: ${r.out.offer.done ? 'Your week' : 'Plan your week'}` : ''}`);
  }
  return { id: s.id, kind: s.kind, ...r };
});

console.log('\nBy model (passes every check · median time · slowest · model steps per message · cost per message):');
for (const m of models) {
  const runs = done.filter((d) => d.model === m);
  const pass = runs.filter((d) => !d.error && d.checks.every((c) => c.ok)).length;
  const ms = runs.map((d) => d.ms).sort((a, b) => a - b);
  const cents = runs.map((d) => (d.usage?.usd || 0) * 100).sort((a, b) => a - b);
  const steps = runs.reduce((a, d) => a + (d.usage?.calls || 0), 0) / Math.max(runs.length, 1);
  console.log(
    `  ${m.padEnd(8)} ${pass} of ${runs.length} · ${ms[Math.floor(ms.length / 2)] ?? 0}ms · ${ms.at(-1) ?? 0}ms · ${steps.toFixed(1)} steps · ${cents[Math.floor(cents.length / 2)].toFixed(2)} cents typical, ${cents.at(-1).toFixed(2)} most`,
  );
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `chat-${stamp}.json`), JSON.stringify({ meta: { stamp, version: CHAT_AGENT_VERSION, models: models.map((m) => MODELS[m]), repeat, places: args.includes('--places') }, results: done }, null, 2));
console.log(`Results: scripts/chat-replay/out/chat-${stamp}.json`);
