/**
 * A smoke run of the agent's loop (workers/cortex/agent/run.js) with real
 * models and a made-up person, to check the loop, the tools and both
 * providers' tool calling end to end before a surface uses them. Not the
 * replay suite (step 8): a handful of turns, each with a plain check.
 *
 *   scripts/agent-smoke/run.sh                       every turn, Gemini and OpenAI
 *   scripts/agent-smoke/run.sh --models gemini --only move-dentist
 *
 * Keys come from .audit-keys.local (scripts/chat-audit/keys.mjs). The made-up
 * person's items live in this file; nothing touches a database.
 */

import { keys } from '../chat-audit/keys.mjs';
import { runAgent } from '../../workers/cortex/agent/run.js';
import { configureModels } from '../../workers/cortex/models.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = { gemini: 'gemini-3.8-flash', openai: 'gpt-6-luna' };
const models = (flag('--models') || 'gemini,openai').split(',').filter((m) => MODELS[m]);
const only = flag('--only');

const TODAY = '2026-10-02'; // a Friday
const NOW_MIN = 9 * 60;
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const PERSON = {
  todos: [
    { id: id(1), name: 'Dentist appointment', due_day: TODAY, due_time: '10:00:00', body: 'Bring the insurance card' },
    { id: id(2), name: 'Call Mum', due_day: TODAY, due_time: null, body: '' },
    { id: id(3), name: 'Renew passport', due_day: null, due_time: null, body: 'Forms are in the drawer' },
  ],
  habits: [
    { id: id(11), name: 'Morning run', cadence: 'daily', target_per_period: 1, frequency: 'daily', notes: '' },
    { id: id(12), name: 'Gym', cadence: 'weekly', target_per_period: 2, frequency: '2x/week', notes: '' },
  ],
  notes: [
    {
      id: id(21),
      title: 'Shopping list',
      body: '',
      subtype: 'list',
      has_list: true,
      list_items: [
        { id: 'l1', text: 'Eggs', checked: false },
        { id: 'l2', text: 'Bread', checked: false },
      ],
    },
    { id: id(22), title: 'Team dinner', body: 'At the Italian place', subtype: 'event', target_date: '2026-10-09', event_time: '19:00:00' },
  ],
  calendar: [
    { id: 'm1', title: 'Standup', start_at: '2026-10-02T16:30:00Z', end_at: '2026-10-02T17:00:00Z', is_all_day: false },
    { id: 'm2', title: 'Lunch with Sam', start_at: '2026-10-02T19:30:00Z', end_at: '2026-10-02T20:30:00Z', is_all_day: false },
  ],
  progress: [{ habit_id: id(11), occurred_day: '2026-10-01' }],
};

const TABLE = { todos: 'todo', habits: 'habit', notes: 'note' };
const all = () => [
  ...PERSON.todos.map((t) => ({ type: 'todo', row: t, title: t.name, text: t.body, day: t.due_day, time: t.due_time })),
  ...PERSON.habits.map((h) => ({ type: 'habit', row: h, title: h.name, text: h.notes, day: null, time: null, detail: h.frequency })),
  ...PERSON.notes.map((n) => ({ type: 'note', row: n, title: n.title, text: n.body, day: n.target_date || null, time: n.event_time || null, detail: n.subtype })),
];

/** A stand-in for the database: the queries the tools make, answered from PERSON. */
const db = {
  select: async (path) => {
    const [table, query = ''] = path.split('?');
    const idEq = /(?:^|&)id=eq\.([^&]+)/.exec(query)?.[1];
    if (TABLE[table] && idEq) return PERSON[table].filter((r) => r.id === idEq);
    if (table === 'synced_calendar_events') return PERSON.calendar.filter((e) => e.start_at.startsWith(TODAY) && query.includes(TODAY));
    if (table === 'notes' && query.includes('subtype=eq.event')) {
      const day = /target_date=eq\.([0-9-]+)/.exec(query)?.[1];
      return PERSON.notes.filter((n) => n.subtype === 'event' && n.target_date === day);
    }
    if (table === 'todos' && query.includes('due_day=eq.')) {
      const day = /due_day=eq\.([0-9-]+)/.exec(query)[1];
      return PERSON.todos.filter((t) => t.due_day === day);
    }
    if (table === 'todos' && query.includes('due_day=lt.')) return [];
    if (table === 'habits') return PERSON.habits;
    if (table === 'habit_progress') {
      const hid = /habit_id=eq\.([^&]+)/.exec(query)?.[1];
      return PERSON.progress.filter((p) => !hid || p.habit_id === hid);
    }
    return [];
  },
  rpc: async (fn, a) => {
    if (fn !== 'find_items') return [];
    const words = String(a.p_query || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
      .map((w) => w.slice(0, 4));
    return all()
      .filter((i) => !a.p_types || a.p_types.includes(i.type))
      .filter((i) => !a.p_from || (i.day && i.day >= a.p_from))
      .filter((i) => !a.p_to || (i.day && i.day <= a.p_to))
      .filter((i) => !words.length || words.some((w) => `${i.title} ${i.text}`.toLowerCase().includes(w)))
      .map((i) => ({ type: i.type, id: i.row.id, title: i.title, day: i.day, time: i.time, state: 'open', detail: i.detail || null, snippet: i.text || '' }));
  },
};

const PERSONA = `You are Gremly, a small warm companion who lives in the person's app and knows their life well. You speak like a kind, practical friend: short, natural, never bossy, never a list of options unless they ask.`;

const TURNS = [
  {
    id: 'hello',
    surface: 'chat',
    message: 'hey gremly, how are you?',
    check: (r) => r.card.length === 0 || 'a greeting needs no card',
  },
  {
    id: 'move-dentist',
    surface: 'chat',
    message: 'can you move my dentist appointment to tuesday at 3pm',
    check: (r) => {
      const c = r.card.find((x) => x.id === id(1));
      return (c && c.fields?.day === '2026-10-06' && c.fields?.time === '15:00') || 'the dentist should move to Tue 6 Oct at 15:00';
    },
  },
  {
    id: 'two-things',
    surface: 'brief',
    message: 'I already did my run this morning, and add milk to my shopping list please',
    check: (r) => {
      const log = r.card.find((x) => x.op === 'log' && x.id === id(11));
      const milk = r.card.find((x) => x.id === id(21) && x.fields?.list?.add?.some((t) => /milk/i.test(t)));
      return Boolean(log && milk) || 'both the run check in and milk on the list should be on the card';
    },
  },
  {
    id: 'gym-schedule',
    surface: 'chat',
    message: 'make my gym habit three times a week',
    check: (r) => {
      const c = r.card.find((x) => x.id === id(12));
      return (c && c.fields?.schedule?.per === 'week' && c.fields?.schedule?.times === 3) || 'gym should become 3 times a week';
    },
  },
  {
    id: 'my-day',
    surface: 'brief',
    message: "what's my day looking like?",
    check: (r) => (r.card.length === 0 && /stand|lunch|dentist/i.test(r.reply)) || 'the reply should describe the day, with no card',
  },
];

const ctx = () => ({
  env: { GOOGLE_API_KEY: keys.gemini, OPENAI_API_KEY: keys.openai },
  userId: USER,
  today: TODAY,
  timezone: 'America/Los_Angeles',
  db,
  cache: new Map(),
});

configureModels({});
const results = [];
for (const m of models) {
  for (const t of TURNS.filter((x) => !only || only.split(',').includes(x.id))) {
    const lines = [];
    const r = await runAgent({
      surface: t.surface,
      persona: PERSONA,
      message: t.message,
      ctx: ctx(),
      nowMin: NOW_MIN,
      onStatus: (l) => lines.push(l),
      models: { model: MODELS[m], fallback: MODELS[m] },
    });
    const verdict = r.ok ? t.check(r) : `failed: ${r.error}`;
    const pass = verdict === true;
    results.push({ model: m, turn: t.id, pass, ms: r.ms, steps: r.steps.length });
    console.log(`\n${pass ? 'PASS' : 'FAIL'} ${m} ${t.id} ${r.ms}ms ${r.stopped || ''}`);
    console.log(`  tools: ${r.steps.filter((s) => s.kind === 'tool').map((s) => `${s.name} ${s.ms}ms`).join(', ') || 'none'}`);
    console.log(`  model steps: ${r.steps.filter((s) => s.kind === 'model').map((s) => `${s.ms}ms`).join(', ')}`);
    console.log(`  status: ${lines.join(' / ') || 'none'}`);
    console.log(`  reply: ${r.reply}`);
    if (r.card.length) console.log(`  card: ${JSON.stringify(r.card.map((c) => ({ op: c.op, title: c.title, fields: c.fields, days: c.days })))}`);
    if (r.tasks.length) console.log(`  tasks: ${JSON.stringify(r.tasks)}`);
    if (!pass) console.log(`  why: ${verdict}`);
  }
}
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed} of ${results.length} passed`);
for (const m of models) {
  const mine = results.filter((r) => r.model === m);
  const ms = mine.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${m}: ${mine.filter((r) => r.pass).length}/${mine.length}, median ${ms[Math.floor(ms.length / 2)]}ms, slowest ${ms[ms.length - 1]}ms`);
}
