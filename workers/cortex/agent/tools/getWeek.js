// ============================================================================
// get_week: the person's week as their week board has it (the weekly review).
// Each day with the todos on it and the habits planned for it, whether it is
// one of their busy days, the hours they have free on that kind of day and the
// room left, and the todos put off for later with the day each comes back.
//
// The days come from the person's week on the tools' context (ctx.week, built
// from what today's thread sent: agent/brief.js weekFrameOf). While a review
// is under way the board's working picture rides with it (where each todo
// sits, what is put off, the habit days), since none of that is saved until
// they finish; anything it does not name is read from the database.
//
// Counting is done here, by dates and minutes alone, so the model never adds
// up a day itself.
// ============================================================================

import { DAY_KINDS, dayKind, dayRoom, minutesOf, spanDays } from '../../../shared/week.js';
import { obj } from './schema.js';
import { dayWords, trim } from './words.js';

const DESCRIPTION = `Read the person's week as their week board has it: each day with the todos on it and the habits planned for it, with their ids, whether it is one of their busy days, the hours they have free on that kind of day and the room left once what is on the day is counted, and the todos put off for later with the day each comes back. The counting is done for you, so never add up a day's minutes yourself. Use it before saying what the days of the week hold or how full one is, and before proposing to move things between days, put something off, or change the days a habit is on. During the weekly review it reads the days being planned as they stand in the review.`;

const KIND_WORDS = { normal_day: 'normal day', busy_day: 'busy day', weekend_day: 'day off' };

const titleOf = (r) => r?.name || r?.title || 'Untitled';

/** Hours as the board says them: "2 hr", "1 hr 30 min", "30 min", "none". */
export function hoursWords(minutes) {
  if (minutes == null) return '';
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h && !rest) return 'none';
  return [h ? `${h} hr` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

/**
 * The week as the board has it, from the rows read and the review's working
 * picture. Pure, for tests.
 * @param {object} p
 * @param {string[]} p.days the days to show
 * @param {string} p.today
 * @param {object[]} p.todos open todos with a day in the week or put off for later
 * @param {object[]} p.habits the person's habits
 * @param {{habit_id: string, planned_date: string}[]} p.plans the habit days saved
 * @param {object} p.week ctx.week: hours, busy_days, days_off, under_way
 */
export function boardOf({ days, today, todos, habits, plans, week }) {
  const u = week.under_way || null;
  const byId = new Map(todos.map((t) => [t.id, t]));
  // where each todo sits: the review's working picture first, then its own day
  const dayOf = new Map();
  const backOf = new Map();
  for (const t of todos) {
    const back = t.resurface_at ? String(t.resurface_at).slice(0, 10) : null;
    if (back && back > today) backOf.set(t.id, back);
    else if (t.due_day) dayOf.set(t.id, String(t.due_day).slice(0, 10));
  }
  for (const p of u?.placed || []) {
    if (!byId.has(p.id)) continue;
    dayOf.set(p.id, p.day);
    backOf.delete(p.id);
  }
  for (const l of u?.later || []) {
    if (!byId.has(l.id)) continue;
    backOf.set(l.id, l.back_on);
    dayOf.delete(l.id);
  }
  // the days each habit is planned on: the review's working days replace the saved ones
  const working = new Map((u?.habit_days || []).map((h) => [h.id, h.days]));
  const habitDays = new Map();
  for (const p of plans) {
    if (working.has(p.habit_id)) continue;
    const day = String(p.planned_date).slice(0, 10);
    habitDays.set(p.habit_id, [...(habitDays.get(p.habit_id) || []), day]);
  }
  for (const [id, list] of working) habitDays.set(id, list);
  const habitById = new Map(habits.map((h) => [h.id, h]));

  const board = days.map((day) => {
    const onDay = todos.filter((t) => dayOf.get(t.id) === day);
    const planned = [...habitDays.entries()]
      .filter(([id, list]) => habitById.has(id) && list.includes(day))
      .map(([id]) => habitById.get(id));
    const placed = [...onDay, ...planned].reduce((sum, x) => sum + minutesOf(x), 0);
    const kind = dayKind(day, { daysOff: week.days_off, busyDays: week.busy_days });
    return {
      day,
      kind,
      past: day < today,
      todos: onDay.map((t) => ({ id: t.id, title: titleOf(t), minutes: minutesOf(t) })),
      habits: planned.map((h) => ({ id: h.id, title: titleOf(h), minutes: minutesOf(h) })),
      room: dayRoom(week.hours, kind, placed),
    };
  });
  const later = todos
    .filter((t) => backOf.has(t.id))
    .map((t) => ({ id: t.id, title: titleOf(t), back_on: backOf.get(t.id) }))
    .sort((a, b) => a.back_on.localeCompare(b.back_on));
  return { days: board, later };
}

export const getWeek = {
  name: 'get_week',
  description: DESCRIPTION,
  parameters: obj({}),

  async run(ctx) {
    const week = ctx.week;
    if (!week) return { known: false };
    const days = spanDays(week.view_first, week.view_last);
    const first = days[0];
    const last = days[days.length - 1];
    const d = ctx.db;
    const u = ctx.userId;
    const open = `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false`;
    const cols = 'id,name,title,due_day,time_estimate_minutes,resurface_at';
    // the review's working picture names todos by id, wherever they sit now
    const named = [
      ...new Set(
        [...(week.under_way?.placed || []), ...(week.under_way?.later || [])].map((x) => x.id),
      ),
    ];
    const [onDays, putOff, byName, habits, plans] = await Promise.all([
      d.select(
        `${open}&due_day=gte.${first}&due_day=lte.${last}&select=${cols}&order=due_day.asc&limit=300`,
      ),
      d.select(
        `${open}&resurface_at=gt.${ctx.today}&select=${cols}&order=resurface_at.asc&limit=200`,
      ),
      named.length
        ? d.select(`${open}&id=in.(${named.join(',')})&select=${cols}&limit=300`)
        : Promise.resolve([]),
      d.select(
        `habits?owner_id=eq.${u}&archived=eq.false&select=id,name,title,time_estimate_minutes&limit=200`,
      ),
      d.select(
        `habit_plans?owner_id=eq.${u}&planned_date=gte.${first}&planned_date=lte.${last}&select=habit_id,planned_date&limit=500`,
      ),
    ]);
    const todos = [
      ...new Map(
        [...(onDays || []), ...(putOff || []), ...(byName || [])].map((t) => [t.id, t]),
      ).values(),
    ];
    return {
      known: true,
      first,
      last,
      working: !!(week.under_way && week.under_way.step !== 'done'),
      hours: week.hours || null,
      ...boardOf({ days, today: ctx.today, todos, habits: habits || [], plans: plans || [], week }),
    };
  },

  render(r, ctx) {
    if (!r.known) return 'Their week is not known here.';
    const lines = [
      `THEIR WEEK, ${dayWords(r.first, ctx.today)} to ${dayWords(r.last, ctx.today)}${
        r.working
          ? ', as the review has it now; nothing on the board is saved until they finish'
          : ''
      }`,
    ];
    const hours = DAY_KINDS.filter((k) => r.hours?.[k] != null).map(
      (k) => `${hoursWords(Math.round(r.hours[k] * 60))} on a ${KIND_WORDS[k]}`,
    );
    lines.push(
      hours.length
        ? `Hours free for their own things: ${hours.join(', ')}.`
        : 'No free hours are set for this week yet, so no room is worked out.',
    );
    for (const day of r.days) {
      const room =
        day.room.minutes == null
          ? `${hoursWords(day.room.placed)} placed`
          : `${hoursWords(day.room.minutes)} free, ${hoursWords(day.room.placed)} placed, ${
              day.room.left >= 0
                ? `${hoursWords(day.room.left)} left`
                : `over by ${hoursWords(day.room.left)}`
            }`;
      lines.push(
        `${dayWords(day.day, ctx.today)}${day.past ? ' (gone)' : ''}, ${KIND_WORDS[day.kind]}, ${room}`,
      );
      lines.push(
        day.todos.length
          ? `  Todos: ${day.todos.map((t) => `${trim(t.title, 60)} (id ${t.id}), ${t.minutes} min`).join('; ')}`
          : '  Todos: none',
      );
      if (day.habits.length) {
        lines.push(
          `  Habits planned: ${day.habits.map((h) => `${trim(h.title, 50)} (id ${h.id}), ${h.minutes} min`).join('; ')}`,
        );
      }
    }
    lines.push(
      r.later.length
        ? `Put off for later, with the day each comes back: ${r.later
            .map((t) => `${trim(t.title, 60)} (id ${t.id}) back ${dayWords(t.back_on, ctx.today)}`)
            .join('; ')}`
        : 'Put off for later: nothing',
    );
    return lines.join('\n');
  },
};
