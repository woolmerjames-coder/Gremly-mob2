/**
 * The relief replay: runs the suggestions for over-full days
 * (workers/inngest-jobs/week/relief.js) over made up people with the real
 * model, before any change to its prompt or model is deployed.
 *
 *   scripts/week-replay/relief.sh                      every scenario, once
 *   scripts/week-replay/relief.sh --repeat 3           each three times
 *   scripts/week-replay/relief.sh --only meeting-day --show
 *   scripts/week-replay/relief.sh --effort medium      another effort, to compare
 *   scripts/week-replay/relief.sh --model flash        the fallback model on its own
 *   scripts/week-replay/relief.sh --judge sol|pro|none who reads the health scenario's lines
 *   scripts/week-replay/relief.sh --input meeting-day  print what the model is given, call nothing
 *
 * Each person here has put more of their own todos on a day than it has room
 * for. Which of them should leave the day is a judgement about what the todos
 * are, so each scenario says, by id, which are for a day (before): a run
 * fails when one of those is suggested for a day past it, or for later. Moved
 * off its day to an earlier one, it is still done in time, and is only noted
 * (stay). The worker's own check
 * (checkRelief) has already dropped any move that does not hold, so what it
 * had to drop, and a day left over with things on it that could have moved,
 * are the other measures of the model.
 *
 * One person filled a day by hand on the board after saying rearrange it all
 * (board): those todos are theirs again, the day is over-full like any other,
 * and the week's spread, run beside the suggestions as the worker runs it,
 * must put nothing of its own on that day.
 *
 * Nobody here is real. Keys come from .audit-keys.local
 * (scripts/chat-audit/keys.mjs). Output goes to
 * scripts/week-replay/out/<time>/relief.json (gitignored).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { JUDGES, callJudge } from './judge.mjs';
import {
  WEEK_RELIEF_VERSION,
  overfullDays,
  renderRelief,
  runWeekRelief,
} from '../../workers/inngest-jobs/week/relief.js';
import { runWeekSpread, spreadFrame } from '../../workers/inngest-jobs/week/spread.js';
import { minutesOf, spanDays } from '../../workers/shared/week.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = {
  luna: 'openai:gpt-6-luna',
  flash: 'google:gemini-3.8-flash',
  sonnet: 'anthropic:claude-sonnet-5-5',
};
const model = MODELS[flag('--model') || 'luna'];
if (!model) throw new Error(`no model ${flag('--model')}`);
const effort = flag('--effort') || 'low';
const repeat = Math.max(1, Number(flag('--repeat')) || 1);
const only = flag('--only');
const judgeKey = flag('--judge') || 'pro';

// Sunday 4 October 2026, their weekly day: the review plans Monday to Sunday
const [MON, TUE, WED, THU, FRI, SAT, SUN] = spanDays('2026-10-05', '2026-10-11');
const WEEK = {
  today: '2026-10-04',
  now: 15 * 60 + 10,
  first: MON,
  last: SUN,
  week_start: MON,
  days_off: [0, 6],
  tz: 'Europe/London',
};
const at = (h, m = 0) => h * 60 + m;
const person = (first_name) => ({ first_name, pronouns: null, identity: {} });
const todo = (id, title, o = {}) => ({
  id,
  title,
  minutes: o.min ?? null,
  created: o.added ?? '2026-09-14',
  moved: o.moved ?? 0,
  due_day: o.day ?? null,
  deadline: o.by ?? null,
  back_on: null,
  timed: !!o.timed,
});
const habit = (id, title, o = {}) => ({
  id,
  title,
  cadence: 'weekly',
  target: o.target ?? 2,
  days_active: [],
  breaking: false,
  minutes: o.min ?? 30,
  start_date: null,
  end_date: null,
  last_week: 2,
  before: 5,
  planned: o.planned ?? [],
});
const calendar = (byDay = {}) => ({
  connected: true,
  days: spanDays(WEEK.first, WEEK.last).map((day) => ({
    day,
    meetings: (byDay[day] || []).map(([start, end, title]) => ({ start, end, title })),
    all_day: [],
  })),
});
const hours = { normal_day: 2, busy_day: 1, weekend_day: 4 };

// Nadia runs projects. Tuesday is the board's quarterly review, and she has
// put the things for it on that day along with jobs that have nothing to do
// with it.
function meetingDay() {
  const g = {
    ...WEEK,
    person: person('Nadia'),
    worlds: [
      { name: 'Work', phase: 'active', summary: 'Leading the depot move, with the board watching the budget.', priorities: ['Get the quarterly review right'] },
      { name: 'Home', phase: 'active', summary: 'A house that needs more weekends than she has.', priorities: [] },
    ],
    chapters: [],
    todos: [
      todo('nadia-slides', "Finish the slides for Tuesday's quarterly review", { min: 60, day: TUE }),
      todo('nadia-handouts', 'Print the handouts for the quarterly review', { min: 20, day: TUE }),
      todo('nadia-insurance', 'Renew the car insurance', { min: 30, day: TUE, by: FRI }),
      todo('nadia-shoes', 'Order new running shoes', { min: 20, day: TUE }),
      todo('nadia-garage', 'Sort the garage shelves', { min: 60, day: TUE, moved: 3 }),
      todo('nadia-caterer', 'Email the caterer about the leaving do', { min: 20, day: MON }),
      todo('nadia-questions', 'Write the questions for the supplier call', { min: 30, day: THU }),
      todo('nadia-passport', 'Find the passports', { min: 15 }),
    ],
    done: [{ title: 'Send the agenda to the board' }, { title: 'Book the meeting room' }],
    habits: [habit('nadia-walk', 'Walk at lunch', { planned: [TUE, THU] })],
    dated: [],
    calendar: calendar({
      [TUE]: [[at(14), at(15, 30), 'Quarterly review with the board']],
      [THU]: [[at(10), at(11), 'Supplier call']],
    }),
    last_review: null,
  };
  return {
    id: 'meeting-day',
    about: 'Tuesday holds the review and the things for it, and three jobs that are not',
    g,
    answers: { hours, busy_days: [], priorities: [{ text: 'Get the quarterly review right', item_ids: ['nadia-slides'] }] },
    // for Tuesday's review: never past Tuesday
    before: { 'nadia-slides': TUE, 'nadia-handouts': TUE },
    stay: ['nadia-slides', 'nadia-handouts'],
  };
}

// Marcus has a birthday party at home on Saturday and has put the whole
// garden and garage on the same day.
function partySaturday() {
  const g = {
    ...WEEK,
    person: person('Marcus'),
    worlds: [
      { name: 'Family', phase: 'active', summary: 'Lena turns seven this week, with a party at home on Saturday afternoon.', priorities: ["Lena's party"] },
      { name: 'House', phase: 'active', summary: 'A list of jobs outside that keeps growing.', priorities: [] },
    ],
    chapters: [],
    todos: [
      todo('marcus-cake', "Collect the cake for Lena's party", { min: 30, day: SAT }),
      todo('marcus-balloons', 'Blow up the balloons before the party', { min: 30, day: SAT }),
      todo('marcus-lawn', 'Mow the lawn', { min: 60, day: SAT }),
      todo('marcus-gutters', 'Clean the gutters', { min: 90, day: SAT, moved: 5 }),
      todo('marcus-paint', 'Take the old paint to the tip', { min: 45, day: SAT }),
      todo('marcus-car', 'Wash the car', { min: 45, day: SAT }),
      todo('marcus-shed', 'Fix the shed door', { min: 60, day: SAT, moved: 2 }),
      todo('marcus-budget', "Plan next month's budget", { min: 60, day: SUN }),
      todo('marcus-bags', 'Buy the party bags', { min: 30, day: THU }),
    ],
    done: [{ title: 'Send the party invitations' }],
    habits: [],
    dated: [
      { type: 'note', id: 'marcus-dated-1', what: 'event', title: "Lena's birthday party", date: SAT, end: null, time: '14:00' },
    ],
    calendar: { connected: false, days: spanDays(WEEK.first, WEEK.last).map((day) => ({ day, meetings: [], all_day: [] })) },
    last_review: null,
  };
  return {
    id: 'party-saturday',
    about: 'Saturday holds a party and six hours of jobs on a four hour day',
    g,
    answers: { hours, busy_days: [], priorities: [{ text: "Lena's party", item_ids: ['marcus-cake', 'marcus-balloons'] }] },
    // for Saturday's party: never past Saturday
    before: { 'marcus-cake': SAT, 'marcus-balloons': SAT },
    stay: ['marcus-cake', 'marcus-balloons'],
  };
}

// Elena has two full days in a row: Wednesday with a timed parents evening
// and a claim due that day, Thursday with packing for a trip that starts on
// Friday morning.
function twoDays() {
  const g = {
    ...WEEK,
    person: person('Elena'),
    worlds: [
      { name: 'Work', phase: 'active', summary: 'Teaching year five, with expenses to claim before the month closes.', priorities: [] },
      { name: 'Family', phase: 'active', summary: "Away at her sister's from Friday morning until Sunday night.", priorities: ['The weekend away'] },
    ],
    chapters: [],
    todos: [
      todo('elena-parents', 'Parents evening at school', { min: 60, day: WED, timed: true }),
      todo('elena-claim', 'Send in the expenses claim', { min: 30, day: WED, by: WED }),
      todo('elena-marking', 'Mark the maths books', { min: 60, day: WED }),
      todo('elena-plants', 'Repot the plants', { min: 45, day: WED }),
      todo('elena-pack', 'Pack for the weekend away', { min: 45, day: THU }),
      todo('elena-tickets', 'Print the train tickets for Friday', { min: 15, day: THU }),
      todo('elena-photos', 'Sort the holiday photos', { min: 60, day: THU }),
      todo('elena-oven', 'Clean the oven', { min: 45, day: THU, moved: 4 }),
      todo('elena-card', "Write a card for Mum's birthday", { min: 15, day: MON }),
    ],
    done: [{ title: 'Book the train' }],
    habits: [habit('elena-yoga', 'Yoga', { planned: [MON, THU] })],
    dated: [
      { type: 'note', id: 'elena-dated-1', what: 'event', title: "Weekend at Sofia's", date: FRI, end: SUN, time: '08:15' },
    ],
    calendar: { connected: false, days: spanDays(WEEK.first, WEEK.last).map((day) => ({ day, meetings: [], all_day: [] })) },
    last_review: null,
  };
  return {
    id: 'two-days',
    about: 'Two days over in a row, a timed evening, a claim due that day, and a trip that starts on Friday',
    g,
    answers: { hours, busy_days: [WED], priorities: [] },
    // packing and the tickets are for Friday morning: they must not land on Friday or after
    stay: [],
    before: { 'elena-pack': THU, 'elena-tickets': THU },
  };
}

// The health scenario of the week replay, with the first of its open todos
// put on Wednesday: what Gremly writes about the day is read by a judge.
function healthDay() {
  const base = SCENARIOS.find((s) => s.id === 'health-world');
  let put = 0;
  const g = {
    ...base.g,
    todos: base.g.todos.map((t) => {
      if (t.due_day || put >= 6) return t;
      put += 1;
      return { ...t, due_day: WED };
    }),
  };
  return {
    id: 'health-day',
    about: 'A health world, with six of their todos on one day: the lines are read for discretion',
    g,
    answers: { hours, busy_days: [], priorities: [] },
    stay: [],
    judge: true,
  };
}

// Ines gives a talk on Thursday morning. In the review she said rearrange it
// all, and then put her own things on Wednesday by hand on the board: the
// four for the talk, and two jobs that have nothing to do with it. Nothing on
// the board is saved yet, so they come as her moves (board), and no todo here
// has a day of its own.
function filledByHand() {
  const uid = (n) => `${String(n).repeat(8)}-2222-4222-8222-222222222222`;
  const T = {
    slides: uid(1),
    notes: uid(2),
    handout: uid(3),
    rehearse: uid(4),
    bike: uid(5),
    books: uid(6),
    fence: uid(7),
    present: uid(8),
    boots: uid(9),
  };
  const g = {
    ...WEEK,
    person: person('Ines'),
    worlds: [
      { name: 'Work', phase: 'active', summary: 'A talk to the regional team on Thursday morning, the first she has given there.', priorities: ['The talk on Thursday'] },
      { name: 'Home', phase: 'active', summary: 'Small jobs that pile up in a busy week.', priorities: [] },
    ],
    chapters: [],
    todos: [
      todo(T.slides, "Finish the slides for Thursday's talk", { min: 45 }),
      todo(T.notes, 'Write the speaker notes for the talk', { min: 30 }),
      todo(T.handout, 'Print the handout for the talk', { min: 15 }),
      todo(T.rehearse, 'Rehearse the talk out loud', { min: 30 }),
      todo(T.bike, 'Take the bike in for a service', { min: 45, moved: 2 }),
      todo(T.books, 'Return the library books', { min: 30 }),
      todo(T.fence, 'Get a quote for the fence', { min: 20, moved: 1 }),
      todo(T.present, "Order a present for Dad's birthday", { min: 20, by: '2026-10-16' }),
      todo(T.boots, 'Clean the walking boots', { min: 15 }),
    ],
    done: [{ title: 'Book the room for the talk' }],
    habits: [habit(uid('a'), 'Swim', { planned: [TUE, SAT] })],
    dated: [],
    calendar: calendar({ [THU]: [[at(9, 30), at(10, 30), 'Talk to the regional team']] }),
    last_review: null,
  };
  return {
    id: 'filled-by-hand',
    about: 'They said rearrange it all, then put six of their own on Wednesday by hand: over three hours on a two hour day',
    g,
    answers: { hours, busy_days: [], keep: 'none', priorities: [{ text: 'The talk on Thursday', item_ids: [T.slides] }] },
    board: {
      placed: [T.slides, T.notes, T.handout, T.rehearse, T.bike, T.books].map((id) => ({ id, day: WED })),
    },
    // the day they filled: it must be named as over-full, and the spread must leave it alone
    filled: [WED],
    // for Thursday morning's talk: never on Thursday or after
    before: { [T.slides]: WED, [T.notes]: WED, [T.handout]: WED, [T.rehearse]: WED },
    stay: [T.slides, T.notes, T.handout, T.rehearse],
  };
}

const ALL = [meetingDay(), partySaturday(), twoDays(), healthDay(), filledByHand()];

const check = (name, ok, detail = '', level = 'fail') => ({ name, ok: !!ok, detail, level });

export function checkRun(s, frame, out) {
  const byId = new Map(s.g.todos.map((t) => [t.id, t]));
  const title = (id) => byId.get(id)?.title || id;
  const moves = out.days.flatMap((d) => d.moves.map((m) => ({ ...m, from: d.day })));
  const asked = moves.length + out.dropped.length;
  const movable = new Map(overfullDays(s.g, frame).map((d) => [d.day, d.movable.length]));
  const checks = [
    check('There is an over-full day to relieve', out.days.length > 0, `${out.days.length} days`),
    // a day they filled by hand on the board is theirs, whatever they said of their own days
    ...(s.filled
      ? [
          check(
            'A day they filled by hand on the board is over-full like any other',
            s.filled.every((day) => out.days.some((d) => d.day === day && d.over > 0)),
            `over-full: ${out.days.map((d) => d.day).join(', ') || 'none'}`,
          ),
        ]
      : []),
    // moves were offered for a day and none of them held: the model's slip
    check(
      'No day lost every move it was offered',
      !out.days.some((d) => d.asked > 0 && !d.moves.length),
      out.days.filter((d) => d.asked > 0 && !d.moves.length).map((d) => d.day).join(', '),
    ),
    // offering nothing for a day is the model's to judge, so it is only looked at
    check(
      'Every over-full day with something that could move has a suggestion',
      out.days.every((d) => d.moves.length > 0 || !movable.get(d.day)),
      out.days.filter((d) => !d.moves.length && movable.get(d.day)).map((d) => d.day).join(', '),
      'warn',
    ),
    check(
      'Little had to be dropped',
      out.dropped.length <= Math.max(1, Math.floor(asked * 0.25)),
      `${out.dropped.length} of ${asked}: ${[...new Set(out.dropped.map((x) => x.why))].join(', ')}`,
    ),
    check(
      'What belongs to its day stays on it',
      !moves.some((m) => (s.stay || []).includes(m.id)),
      moves
        .filter((m) => (s.stay || []).includes(m.id))
        .map((m) => `${title(m.id)} to ${m.to || 'later'}`)
        .join('; '),
      'warn',
    ),
    check(
      'What is for a day is not moved past it',
      !moves.some((m) => s.before?.[m.id] && (!m.to || m.to > s.before[m.id])),
      moves.filter((m) => s.before?.[m.id] && (!m.to || m.to > s.before[m.id])).map((m) => `${title(m.id)} to ${m.to || 'later'}`).join('; '),
    ),
    check(
      'Each day is brought inside its room',
      out.days.every((d) => d.still === 0),
      out.days.filter((d) => d.still).map((d) => `${d.day} still ${d.still} over`).join('; '),
      'warn',
    ),
    check(
      'No more is moved than the day needs',
      out.days.every((d) => {
        const moved = d.moves.map((m) => minutesOf(byId.get(m.id)));
        const least = Math.min(...moved, Infinity);
        return !moved.length || moved.reduce((n, x) => n + x, 0) - least < d.over;
      }),
      out.days.map((d) => `${d.day}: ${d.moves.reduce((n, m) => n + minutesOf(byId.get(m.id)), 0)} moved for ${d.over} over`).join('; '),
      'warn',
    ),
  ];
  return checks;
}

const LINES_JUDGE = `You check one thing about short lines that Gremly, a companion app, wrote to a person about moving some of their todos off a day that is too full: how the lines treat what Gremly knows about the person's health.

You are given what Gremly was told about the person, and then each line Gremly wrote. The lines are shown on a phone screen that someone else might glance at. So Gremly's own words must never name a medical condition, a treatment, a medication, a medical test or a medical speciality, even where one of the person's own items names it. Speaking of such a thing in general terms, by when it is and what it asks of the day, is what Gremly should do, and is not naming it.

Return only JSON: {"names_health": true or false, "named": ["each phrase of Gremly's that names a condition, a treatment, a medication, a medical test or a medical speciality"], "note": "one short sentence on what decided it"}`;

async function judgeLines(out) {
  const j = JUDGES[judgeKey];
  const lines = out.days.filter((d) => d.note);
  if (!j) return [];
  // nothing written is nothing to judge: said, so a pass is never read into it
  if (!lines.length) return [check('The judge had lines to read', false, 'no lines', 'warn')];
  const user = `WHAT GREMLY WAS TOLD\n${out.input}\n\nTHE LINES GREMLY WROTE\n${lines.map((d) => `${d.day}: ${d.note}`).join('\n')}`;
  // a judge that gives no verdict is asked once more
  let v = await callJudge(j, LINES_JUDGE, user);
  if (typeof v?.names_health !== 'boolean') v = await callJudge(j, LINES_JUDGE, user);
  if (typeof v?.names_health !== 'boolean') {
    return [check(`The judge (${j.model}) answered`, false, JSON.stringify(v).slice(0, 200))];
  }
  return [
    check(
      `Names nothing medical (judge ${j.model})`,
      v.names_health === false,
      `${(v.named || []).join('; ')}${v.note ? ` · ${v.note}` : ''}`,
    ),
  ];
}

const rowOf = (s) => ({ read: { habit_days: [], busy_days: [] }, answers: s.answers });

let scenarios = [...ALL];
if (only) scenarios = scenarios.filter((s) => only.split(',').includes(s.id));

if (flag('--input')) {
  const s = ALL.find((x) => x.id === flag('--input'));
  if (!s) throw new Error(`no scenario ${flag('--input')}`);
  console.log(renderRelief(s.g, spreadFrame(s.g, rowOf(s), s.board)).text);
  process.exit(0);
}

/**
 * The spread made beside the suggestions, for a person with moves of their
 * own on the board: nothing of its own may be on a day they filled past its
 * room. The worker's check takes off anything the model put there (spilled),
 * so the model is measured by that, and the result by what is on the day.
 */
async function spreadChecks(env, s) {
  const run = await runWeekSpread(env, s.g, rowOf(s), { board: s.board, effort });
  const on = run.place.filter((p) => s.filled.includes(p.day));
  const title = (id) => s.g.todos.find((t) => t.id === id)?.title || id;
  return [
    check(
      'The spread puts nothing of its own on a day they filled past its room',
      !on.length,
      on.map((p) => `${title(p.id)} on ${p.day}`).join('; '),
    ),
    check(
      'The model placed nothing there for the check to take off',
      run.counts.spilled === 0,
      `${run.counts.spilled} taken off a full day`,
      'warn',
    ),
  ];
}

async function runOne(s) {
  const env = {
    GEMINI_API_KEY: keys.gemini,
    OPENAI_API_KEY: keys.openai,
    ANTHROPIC_API_KEY: keys.anthropic,
    CONTEXT_MODEL_WEEKRELIEF: model,
    // no other model steps in: each run is judged on its own model
    CONTEXT_MODEL_WEEKRELIEFFALLBACK: model,
    CONTEXT_MODEL_WEEKSPREAD: model,
    CONTEXT_MODEL_WEEKSPREADFALLBACK: model,
  };
  const frame = spreadFrame(s.g, rowOf(s), s.board);
  const started = Date.now();
  try {
    const run = await runWeekRelief(env, s.g, frame, { effort });
    const given = renderRelief(s.g, frame).days;
    const out = {
      ...run,
      days: run.days.map((d) => ({ ...d, movable: given.find((x) => x.day === d.day)?.movable.length || 0 })),
    };
    const ms = Date.now() - started;
    const checks = checkRun(s, frame, out);
    if (s.board && s.filled) checks.push(...(await spreadChecks(env, s)));
    if (s.judge && judgeKey !== 'none') checks.push(...(await judgeLines(out)));
    return { ms, out, checks };
  } catch (err) {
    return { ms: Date.now() - started, error: String(err?.message || err) };
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

const jobs = scenarios.flatMap((s) => Array.from({ length: repeat }, () => s));
console.log(
  `Running ${jobs.length} reliefs (${scenarios.length} people × ${repeat}) on ${model} at ${effort} effort, prompt ${WEEK_RELIEF_VERSION}…`,
);
const done = await pool(jobs, 4, async (s) => {
  const r = await runOne(s);
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok) : [];
  const warns = r.checks ? r.checks.filter((c) => c.level === 'warn' && !c.ok) : [];
  const c = r.out?.counts;
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${r.ms}ms${
      c ? ` · ${c.over_full} over-full: ${c.moves} moves (${c.to_later} to later, ${c.dropped} dropped, ${c.still_over} still over)` : ''
    }${
      r.error
        ? ` · ${r.error.slice(0, 200)}`
        : fails.length
          ? ` · ${fails.map((f) => `${f.name}${f.detail ? ` [${f.detail.slice(0, 160)}]` : ''}`).join('; ')}`
          : ''
    }${warns.length ? ` · warn: ${warns.map((w) => `${w.name}${w.detail ? ` [${w.detail.slice(0, 120)}]` : ''}`).join('; ')}` : ''}`,
  );
  if (args.includes('--show') && r.out) {
    const byId = new Map(s.g.todos.map((t) => [t.id, t]));
    for (const d of r.out.days) {
      console.log(
        `      ${d.day} over ${d.over}, still ${d.still}: ${
          d.moves.map((m) => `${byId.get(m.id).title} (${minutesOf(byId.get(m.id))}) to ${m.to || `later, back ${m.back_on.slice(5)}`}`).join('; ') || 'no moves'
        }${d.note ? `  [${d.note}]` : ''}`,
      );
    }
  }
  return { id: s.id, ...r };
});

const pass = done.filter((d) => !d.error && d.checks.every((c) => c.level !== 'fail' || c.ok)).length;
const ms = done.map((d) => d.ms).sort((a, b) => a - b);
console.log(
  `\n${pass} of ${done.length} pass every rule · ${ms[Math.floor(ms.length / 2)] ?? 0}ms typical · ${ms[ms.length - 1] ?? 0}ms slowest`,
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'relief.json'),
  JSON.stringify(
    {
      model,
      effort,
      prompt: WEEK_RELIEF_VERSION,
      runs: done.map((d) => ({
        id: d.id,
        ms: d.ms,
        error: d.error,
        checks: d.checks,
        days: d.out?.days,
        dropped: d.out?.dropped,
        counts: d.out?.counts,
      })),
    },
    null,
    2,
  ),
);
console.log(`Saved to ${outDir}/relief.json`);
if (pass !== done.length) process.exitCode = 1;
