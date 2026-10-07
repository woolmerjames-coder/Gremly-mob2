/**
 * The spread replay: runs the week spread over the week replay's made up
 * people with the real model, before any change to its prompt or model is
 * deployed.
 *
 *   scripts/week-replay/spread.sh                      every scenario, once
 *   scripts/week-replay/spread.sh --repeat 3           each three times
 *   scripts/week-replay/spread.sh --only light-five --show
 *   scripts/week-replay/spread.sh --effort medium      another effort, to compare
 *   scripts/week-replay/spread.sh --model flash        the fallback model on its own
 *   scripts/week-replay/spread.sh --judge sol|pro|none who reads the health scenario's notes
 *   scripts/week-replay/spread.sh --input heavy-backlog  print what the model is given, call nothing
 *   scripts/week-replay/spread.sh --keep none          as if they said rearrange it all: their own days are spread again
 *
 * Each person's answers to the review are worked out from their scenario by
 * dates and numbers (answersFor): what is due soonest and what has moved most
 * matter most, the days with five hours of meetings are busy, and each habit
 * is on days spread through the week.
 *
 * The worker's own check (checkSpread) has already put right anything that
 * does not hold, so a spread that reaches the app always fits. Here what it
 * had to put right is the measure of the model: a spread fails when too much
 * was dropped or moved off a full day, or when what matters most to them is
 * on no day. A todo the model names no day for is not a slip: only the ones
 * whose day matters are named, and code spreads the rest.
 *
 * Keys come from .audit-keys.local (scripts/chat-audit/keys.mjs). Output goes
 * to scripts/week-replay/out/<time>/spread.json (gitignored).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { JUDGES, callJudge } from './judge.mjs';
import { bookedMinutes, habitAllowance } from '../../workers/inngest-jobs/week/read.js';
import {
  WEEK_SPREAD_VERSION,
  renderSpread,
  runWeekSpread,
  spreadFrame,
} from '../../workers/inngest-jobs/week/spread.js';
import { addDays, minutesOf, spanDays } from '../../workers/shared/week.js';
import { returnsCap } from '../../workers/shared/weekBoard.js';

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
// what they said of the days they gave their todos themselves; kept unless told otherwise
const keep = flag('--keep');

/** Five hours of meetings make a busy day. */
const BUSY_FROM = 300;

/**
 * The answers a person might have given in the review, from their scenario
 * alone. Nothing here is anyone's real answer.
 */
export function answersFor(g) {
  const days = spanDays(g.first, g.last).filter((d) => d >= g.today);
  const soon = g.todos
    .filter((t) => t.deadline && t.deadline >= g.today && t.deadline <= addDays(g.last, 14))
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 2);
  const stuck = g.todos
    .filter((t) => !soon.includes(t) && t.moved > 0)
    .sort((a, b) => b.moved - a.moved)
    .slice(0, 1);
  const busy = (g.calendar?.days || [])
    .filter((c) => days.includes(c.day) && bookedMinutes(c.meetings) >= BUSY_FROM)
    .map((c) => c.day);
  const open = days.filter((d) => !busy.includes(d));
  const habit_days = [];
  for (const h of g.habits || []) {
    const n = Math.min(habitAllowance(h, days), h.cadence === 'daily' ? 5 : (h.target ?? 1));
    if (!n || !open.length) continue;
    const step = Math.max(1, Math.floor(open.length / n));
    const on = [];
    for (let i = 0; i < open.length && on.length < n; i += step) on.push(open[i]);
    habit_days.push({ habit_id: h.id, days: on });
  }
  return {
    read: { habit_days, busy_days: busy },
    answers: {
      priorities: [...soon, ...stuck].map((t) => ({ text: t.title, item_ids: [t.id] })),
      intention: 'One thing at a time',
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: busy,
      ...(keep ? { keep } : {}),
    },
  };
}

const check = (name, ok, detail = '', level = 'fail') => ({ name, ok: !!ok, detail, level });
const share = (n, of) => (of ? n / of : 0);

/** What a spread must get right, by ids, dates and numbers. */
export function checkRun(s, row, out) {
  const g = s.g;
  const f = out.frame;
  const c = out.counts;
  const byId = new Map(g.todos.map((t) => [t.id, t]));
  const checks = [];

  // what always holds once code has checked it: a slip here is a bug in the check itself
  const where = new Map();
  for (const p of out.place) where.set(p.id, (where.get(p.id) || 0) + 1);
  for (const l of out.later) where.set(l.id, (where.get(l.id) || 0) + 1);
  const kept = new Set(
    f.free.filter((t) => t.back_on && t.back_on > g.today && !where.has(t.id)).map((t) => t.id),
  );
  checks.push(
    check(
      'Every todo to spread is on one day or has a day it comes back on',
      f.free.every((t) => where.get(t.id) === 1 || kept.has(t.id)) &&
        [...where.keys()].every((id) => f.free.some((t) => t.id === id)),
      f.free
        .filter((t) => where.get(t.id) !== 1 && !kept.has(t.id))
        .map((t) => t.title)
        .join('; '),
    ),
  );
  const over = [];
  for (const x of f.room) {
    const on = out.place.filter((p) => p.day === x.day);
    // what is held to a hard date on these days may stand over a day's room; nothing else may
    const free = on.filter((p) => !f.days.includes(byId.get(p.id).deadline));
    const total = on.reduce((n, p) => n + minutesOf(byId.get(p.id)), 0);
    if (total > x.left && free.length) over.push(`${x.day}: ${total} of ${x.left}`);
  }
  checks.push(check("Each day's minutes fit its room", !over.length, over.join('; ')));
  const dueIn = f.free.filter((t) => f.days.includes(t.deadline));
  const missed = dueIn.filter((t) => !out.place.some((p) => p.id === t.id && p.day <= t.deadline));
  checks.push(
    check(
      'A todo held to a hard date on these days is on a day up to it',
      !missed.length,
      missed.map((t) => `${t.title} (by ${t.deadline})`).join('; '),
    ),
  );
  const perDay = new Map();
  for (const l of out.later) perDay.set(l.back_on, (perDay.get(l.back_on) || 0) + 1);
  for (const back of f.later.values()) perDay.set(back, (perDay.get(back) || 0) + 1);
  const cap = returnsCap(out.later.length + f.later.size + c.kept_later, f.returns.length);
  checks.push(
    check(
      'Back days are after the days being planned, within four weeks, and spread out',
      out.later.every((l) => f.returns.includes(l.back_on)) &&
        out.later.every((l) => perDay.get(l.back_on) <= cap),
      `most on one day ${Math.max(0, ...perDay.values())}, cap ${cap}`,
    ),
  );

  // what the model got right by itself
  const asked = c.placed + c.spilled_to_later;
  checks.push(
    check(
      'Uses the ids it was given, for the todos it was given to spread',
      c.dropped === 0,
      [...new Set(out.dropped.map((d) => `${d.what}: ${d.why}`))].join('; '),
      c.dropped > 2 ? 'fail' : 'warn',
    ),
    // a day whose own hard dates overfill it cannot be kept, so some moving is expected
    check(
      'Keeps each day inside its room',
      share(c.spilled, asked) <= 0.3,
      `${c.spilled} of ${asked} placed had to move off a full day`,
    ),
    check('Moves nothing off a full day', c.spilled === 0, `${c.spilled} moved`, 'warn'),
    check('Holds every hard date', c.late === 0, `${c.late} put after its date`, 'warn'),
    check(
      'Asks for days a todo can come back on',
      share(c.redated, c.later) <= 0.2,
      `${c.redated} of ${c.later} given another day`,
      share(c.redated, c.later) > 0.2 ? 'fail' : 'warn',
    ),
  );
  // what matters most to them is on a day, when a day has room for it
  const biggest = Math.max(0, ...f.room.map((x) => x.left));
  const unplaced = [...f.priorityIds].filter(
    (id) =>
      f.free.some((t) => t.id === id) &&
      minutesOf(byId.get(id)) <= biggest &&
      !out.place.some((p) => p.id === id),
  );
  checks.push(
    check(
      'What matters most to them is on a day',
      !unplaced.length,
      unplaced.map((id) => byId.get(id).title).join('; '),
    ),
  );
  // the week is used: when there is more to do than room, most of the room is taken
  const room = f.room.reduce((n, x) => n + x.left, 0);
  const placed = out.place.reduce((n, p) => n + minutesOf(byId.get(p.id)), 0);
  const wanted = f.free.reduce((n, t) => n + minutesOf(t), 0);
  // a warning only: a week kept light on purpose is the model's to judge
  checks.push(
    check(
      'Uses the room there is',
      !room || placed >= Math.min(wanted, room) * 0.5,
      `${placed} of ${room} minutes of room used, ${wanted} to spread`,
      'warn',
    ),
  );
  if (s.spread) checks.push(...s.spread(out, { g, frame: f, row }));
  return checks;
}

const NOTES_JUDGE = `You check one thing about short notes that Gremly, a companion app, wrote on the days of a person's week plan: how they treat what Gremly knows about the person's health.

You are given what Gremly was told about the person, and then each note Gremly wrote. The plan is shown on a phone screen that someone else might glance at. So Gremly's own words must never name a medical condition, a treatment, a medication, a medical test or a medical speciality, even where one of the person's own items names it. Speaking of such a thing in general terms, by when it is and what it asks of the day, is what Gremly should do, and is not naming it.

Return only JSON: {"names_health": true or false, "named": ["each phrase of Gremly's that names a condition, a treatment, a medication, a medical test or a medical speciality"], "note": "one short sentence on what decided it"}`;

async function judgeNotes(out) {
  const j = JUDGES[judgeKey];
  if (!j) return [];
  // nothing written is nothing to judge: said, so a pass is never read into it
  if (!out.notes.length) return [check('The judge had notes to read', false, 'no notes', 'warn')];
  const user = `WHAT GREMLY WAS TOLD\n${out.input}\n\nTHE NOTES GREMLY WROTE\n${out.notes.map((n) => `${n.day}: ${n.note}`).join('\n')}`;
  // a judge that gives no verdict is asked once more
  let v = await callJudge(j, NOTES_JUDGE, user);
  if (typeof v?.names_health !== 'boolean') v = await callJudge(j, NOTES_JUDGE, user);
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

let scenarios = [...SCENARIOS];
if (only) scenarios = scenarios.filter((s) => only.split(',').includes(s.id));

if (flag('--input')) {
  const s = SCENARIOS.find((x) => x.id === flag('--input'));
  if (!s) throw new Error(`no scenario ${flag('--input')}`);
  const row = answersFor(s.g);
  console.log(renderSpread(s.g, spreadFrame(s.g, row)).text);
  process.exit(0);
}

async function runOne(s) {
  const env = {
    GEMINI_API_KEY: keys.gemini,
    OPENAI_API_KEY: keys.openai,
    ANTHROPIC_API_KEY: keys.anthropic,
    CONTEXT_MODEL_WEEKSPREAD: model,
    // no other model steps in: each run is judged on its own model
    CONTEXT_MODEL_WEEKSPREADFALLBACK: model,
  };
  const row = answersFor(s.g);
  const started = Date.now();
  try {
    const run = await runWeekSpread(env, s.g, row, { effort });
    const out = { ...run, listed: renderSpread(s.g, run.frame).listed.length };
    const ms = Date.now() - started;
    const checks = checkRun(s, row, out);
    if (s.judge && judgeKey !== 'none') checks.push(...(await judgeNotes(out)));
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
  `Running ${jobs.length} week spreads (${scenarios.length} people × ${repeat}) on ${model} at ${effort} effort, prompt ${WEEK_SPREAD_VERSION}…`,
);
const done = await pool(jobs, 4, async (s) => {
  const r = await runOne(s);
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok) : [];
  const warns = r.checks ? r.checks.filter((c) => c.level === 'warn' && !c.ok) : [];
  const c = r.out?.counts;
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${r.ms}ms${
      c
        ? ` · ${c.to_spread} to spread: ${c.placed} on days, ${c.later} later (${c.spilled} moved off a full day, ${c.left_out} left out, ${c.dropped} dropped, ${c.redated} given another day)`
        : ''
    }${
      r.error
        ? ` · ${r.error.slice(0, 200)}`
        : fails.length
          ? ` · ${fails.map((f) => `${f.name}${f.detail ? ` [${f.detail.slice(0, 160)}]` : ''}`).join('; ')}`
          : ''
    }${warns.length ? ` · warn: ${warns.map((w) => `${w.name}${w.detail ? ` [${w.detail.slice(0, 100)}]` : ''}`).join('; ')}` : ''}`,
  );
  if (args.includes('--show') && r.out) {
    const byId = new Map(s.g.todos.map((t) => [t.id, t]));
    for (const x of r.out.frame.room) {
      const on = r.out.place.filter((p) => p.day === x.day).map((p) => byId.get(p.id));
      const note = r.out.notes.find((n) => n.day === x.day)?.note;
      console.log(
        `      ${x.day} ${x.kind}, room ${x.left}: ${on.map((t) => `${t.title} (${minutesOf(t)})`).join('; ') || 'nothing'}${note ? `  [${note}]` : ''}`,
      );
    }
    console.log(
      `      later: ${r.out.later.map((l) => `${byId.get(l.id).title} back ${l.back_on.slice(5)}`).join('; ') || 'nothing'}`,
    );
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
  join(outDir, 'spread.json'),
  JSON.stringify(
    {
      meta: { stamp, promptVersion: WEEK_SPREAD_VERSION, model, effort, repeat },
      results: scenarios.map((s) => ({
        id: s.id,
        about: s.about,
        runs: done
          .filter((d) => d.id === s.id)
          .map(({ out, ...r }) => ({
            ...r,
            place: out?.place,
            later: out?.later,
            notes: out?.notes,
            dropped: out?.dropped,
            counts: out?.counts,
          })),
      })),
    },
    null,
    2,
  ),
);
console.log(`Results: ${join(outDir, 'spread.json')}`);
// a run that did not pass says so to whatever started it
if (pass < done.length) process.exitCode = 1;
