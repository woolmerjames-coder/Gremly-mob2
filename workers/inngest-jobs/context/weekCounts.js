/**
 * What a week held, counted by code for the weekly pass (data fabric stage
 * 5): the days the brief was answered and a plan made, the wrap ups done and
 * what they decided, how often things were moved to another day, what was due
 * against what got done, and the habits held or not. The weekly pass is given
 * these numbers, so the plan for the summary never has to count for itself.
 *
 * Code only counts here: what the numbers mean is the weekly pass's judgment.
 */

import { db, localDate } from './db';
// Which day a todo is on: its planned day, else its deadline (stage 2c, 9 Oct 2026)
import { todoDayOf, todoDayRangeFilter } from '../../shared/todoDay.js';

/** The days from start to end, both included, as YYYY-MM-DD. */
function daysOf(start, end) {
  const out = [];
  for (
    let d = new Date(`${start}T12:00:00Z`);
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    out.push(d.toISOString().slice(0, 10));
  return out;
}

const DUE_FIELDS = ['due_day', 'due_date', 'scheduled_date'];

/**
 * The counts, from rows already read. Pure.
 * @param threads daily threads: { metadata_json: { ritual_day, answered_at, plan_locked_at, sweep } }
 * @param changes item_changes rows by the person: { table_name, row_id, op, fields, at }
 * @param dueTodos todos due in the week, on their planned day or with none their deadline
 *   (shared/todoDay.js): { id, due_day, scheduled_date, target_date, status, completed_at };
 *   one archived was taken off their list and is not counted as due
 * @param habits { id, name, title, cadence, target_per_period, kind }
 * @param progress habit_progress rows: { habit_id, occurred_day }
 * @param notHeld habit_not_held rows: { habit_id, day }
 */
export function countWeek({
  periodStart,
  periodEnd,
  threads = [],
  changes = [],
  dueTodos = [],
  habits = [],
  progress = [],
  notHeld = [],
}) {
  const inWeek = (day) => !!day && day >= periodStart && day <= periodEnd;
  const days = new Map();
  for (const t of threads) {
    const m = t?.metadata_json || {};
    if (!inWeek(m.ritual_day)) continue;
    // one thread a day; a second is the same day picked up again
    const cur = days.get(m.ritual_day) || {
      answered: false,
      planned: false,
      wrapped: false,
      decisions: [],
    };
    cur.answered = cur.answered || !!m.answered_at;
    cur.planned = cur.planned || !!m.plan_locked_at;
    cur.wrapped = cur.wrapped || m.sweep?.step === 'done';
    for (const d of Array.isArray(m.sweep?.decisions) ? m.sweep.decisions : [])
      cur.decisions.push(d);
    days.set(m.ritual_day, cur);
  }
  const decided = {};
  for (const day of days.values())
    for (const d of day.decisions) {
      const out = String(d?.out || 'other');
      decided[out] = (decided[out] || 0) + 1;
    }
  // moved to another day by the person: each change to the day of something
  // already on their list is one move (a new item is given its day, never moved)
  // a change carries the person's own day when it was read with their zone
  const moves = changes.filter(
    (c) =>
      (c.day === undefined || inWeek(c.day)) &&
      c.table_name === 'todos' &&
      c.op === 'update' &&
      (c.fields || []).some((f) => DUE_FIELDS.includes(f)),
  );
  const movedItems = new Set(moves.map((c) => c.row_id));
  const due = dueTodos.filter((t) => t.status !== 'archived' && inWeek(todoDayOf(t)));
  const dueDone = due.filter((t) => t.status === 'completed' || !!t.completed_at);
  const held = new Map();
  for (const p of progress)
    if (inWeek(p.occurred_day)) held.set(p.habit_id, (held.get(p.habit_id) || 0) + 1);
  const missed = new Map();
  for (const n of notHeld)
    if (inWeek(n.day)) missed.set(n.habit_id, (missed.get(n.habit_id) || 0) + 1);
  const dayCount = daysOf(periodStart, periodEnd).length;
  return {
    days: dayCount,
    brief_answered: [...days.values()].filter((d) => d.answered).length,
    plans_made: [...days.values()].filter((d) => d.planned).length,
    wrap_ups: [...days.values()].filter((d) => d.wrapped).length,
    wrap_up_decisions: decided,
    moves: moves.length,
    items_moved: movedItems.size,
    due: due.length,
    due_done: dueDone.length,
    habits: habits.map((h) => ({
      id: h.id,
      name: String(h.name || h.title || '').trim(),
      held: held.get(h.id) || 0,
      target: h.cadence === 'daily' ? dayCount : Number(h.target_per_period) || 1,
      not_held: missed.get(h.id) || 0,
    })),
  };
}

const WORDS = { kept: 'kept', let_go: 'let go', other: 'other' };

/**
 * The counts as the lines the weekly pass reads, each with the paths of the
 * values it states (under week_counts, where the summary's figures keep them),
 * so a plan that names a line can be written from its values. Pure.
 */
export function weekCountItems(c) {
  if (!c) return [];
  const decided = Object.entries(c.wrap_up_decisions || {});
  const decidedWords = decided
    .map(([k, n]) => `${n} ${WORDS[k] || k.replace(/_/g, ' ')}`)
    .join(', ');
  return [
    {
      line: `brief answered on ${c.brief_answered} of ${c.days} days; a plan made on ${c.plans_made}`,
      paths: ['week_counts.brief_answered', 'week_counts.days', 'week_counts.plans_made'],
    },
    {
      line: `wrap ups done on ${c.wrap_ups} of ${c.days} days${decidedWords ? `; what they decided there: ${decidedWords}` : ''}`,
      paths: [
        'week_counts.wrap_ups',
        'week_counts.days',
        ...decided.map(([k]) => `week_counts.wrap_up_decisions.${k}`),
      ],
    },
    {
      line: `things moved to another day ${c.moves} times, ${c.items_moved} different things`,
      paths: ['week_counts.moves', 'week_counts.items_moved'],
    },
    {
      line: `todos due this week ${c.due}, done ${c.due_done}`,
      paths: ['week_counts.due', 'week_counts.due_done'],
    },
    // a habit kept from the summary's writer has no name there, and no line
    ...(c.habits || [])
      .map((h, i) => ({
        line: `habit "${h.name}": held ${h.held} of ${h.target}${h.not_held ? `, not held ${h.not_held}` : ''}`,
        paths: [
          `week_counts.habits.${i}.held`,
          `week_counts.habits.${i}.target`,
          ...(h.not_held ? [`week_counts.habits.${i}.not_held`] : []),
        ],
        private: !!h.private,
        health: !!h.health,
        named: !!h.name,
      }))
      .filter((x) => x.named)
      .map(({ named, ...x }) => x),
  ];
}

/** The counts as the lines alone. Pure. */
export function weekCountLines(c) {
  return weekCountItems(c).map((x) => x.line);
}

/** Read what the counts need for one person's week, and count it. */
export async function gatherWeekCounts(
  env,
  userId,
  { periodStart, periodEnd, habits = [], progress = [], tz = null },
) {
  const d = db(env);
  const from = `${periodStart}T00:00:00Z`;
  const to = `${periodEnd}T23:59:59Z`;
  // a day ends a few hours after midnight, so the week's edges are read wide
  const wideFrom = new Date(Date.parse(from) - 14 * 3600e3).toISOString();
  const wideTo = new Date(Date.parse(to) + 14 * 3600e3).toISOString();
  const [threads, changes, dueTodos, notHeld] = await Promise.all([
    d.select(
      `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&created_at=gte.${encodeURIComponent(wideFrom)}&created_at=lte.${encodeURIComponent(wideTo)}&select=metadata_json&limit=40`,
    ),
    d.select(
      `item_changes?owner_id=eq.${userId}&by=eq.person&table_name=eq.todos&at=gte.${encodeURIComponent(wideFrom)}&at=lte.${encodeURIComponent(wideTo)}&select=table_name,row_id,op,fields,at&limit=2000`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&or=(${todoDayRangeFilter(periodStart, periodEnd)})&select=id,due_day,scheduled_date,target_date,status,completed_at&limit=500`,
    ),
    d.select(
      `habit_not_held?owner_id=eq.${userId}&day=gte.${periodStart}&day=lte.${periodEnd}&select=habit_id,day&limit=500`,
    ),
  ]);
  // a change counts on the person's own days only: each is given its day in
  // their zone, and countWeek keeps the ones inside the week
  const withDay = (changes || []).map((c) => ({
    ...c,
    day: tz ? localDate(tz, new Date(c.at)) : String(c.at).slice(0, 10),
  }));
  return countWeek({
    periodStart,
    periodEnd,
    threads,
    changes: withDay,
    dueTodos,
    habits,
    progress,
    notHeld,
  });
}
