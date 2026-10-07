// ============================================================================
// get_day: one day of the person's life as Gremly knows it. The calendar (read
// as the brief reads it, workers/shared/calendar.js), the todos planned for
// it, the habits that fall on it and where each stands, and for today the
// travel and set times from the day record the brief and the planner use
// (inngest-jobs/brief/dayRecord.js). Counting and matching days is done here,
// so the model never adds up times or counts check-ins itself.
//
// Their week is in the day too: a todo put off until this day is one of its
// todos (it has no day of its own, so its day to come back puts it here, as
// on Today), and a habit says whether this is one of the days it is planned
// on in their week, and which other days of that week are. Their week is the
// one the thread sent (ctx.week); with none sent, the planned days near the
// day are given without being called a week. A habit planned on a day is on
// that day, whatever days its routine names.
//
// The tool's description says nothing of planned days: the lines it returns
// say it where it is so. Named in the description, the model called every
// habit planned, a daily one included (day replay, 6 October).
//
// A count toward a weekly target is made in their own week, the seven days
// that end on their weekly day (ctx.week, Sunday when the thread sent none).
// A habit paused on a day does not fall on it, and one on a lighter version
// says so (the thread's week, eased: workers/shared/habitWeek.js).
// ============================================================================

import { calendarSelects, meetingsFrom } from '../../../shared/calendar.js';
import { scheduleOf, scheduleLabel } from '../../../shared/changes/check.js';
import { buildDayRecord } from '../../../inngest-jobs/brief/dayRecord.js';
import { isDay, weeklyDayOf } from '../../../shared/week.js';
import { easeOn, isBreakHabit, rowOfEase, weekAround } from '../../../shared/habitWeek.js';
import { day, obj } from './schema.js';
import { addDays, clock, dayWords, trim, weekdayOf } from './words.js';

const DESCRIPTION = `Read one day of the person's life, or several days in a row: timed calendar entries and all day ones, the todos planned for each day with their ids, the habits that fall on it and where each stands, and for today also the todos past their day and the travel and set times Gremly knows about. Use it for questions about a day or a stretch of days, before suggesting how to fit something in, and before proposing changes to a day. Read every day a question covers in one call, by giving the last day as to, up to a week. Today when no date is given.`;

/** How far either side of a day a habit's planned days are read when their week is not known: a week. */
const PLAN_REACH = 6;

/** The most days one call reads. */
const MAX_DAYS = 7;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Whether a habit falls on a day, and where it stands. A habit kept to set
 * weekdays falls on those, and on any other day it is planned on in their
 * week (plannedHere). A week's count is made in their own week (weeklyDay).
 * Paused on the day, it does not fall on it; on a lighter version, the row
 * says what that is (ease: what easeOn gives for the day). Pure, for tests.
 */
export function habitOnDay(h, date, logged, plannedHere = false, weeklyDay = 0, ease = null) {
  if (ease?.mode === 'pause') return null;
  // A habit they are breaking has nothing to do on a day and no time to do it
  // at: it is one they keep clear of every day it runs, never a thing to do.
  if (isBreakHabit(h)) {
    if (h.start_date && String(h.start_date).slice(0, 10) > date) return null;
    if (h.end_date && String(h.end_date).slice(0, 10) < date) return null;
    return { breaking: true, done: logged.includes(date) };
  }
  const on = habitStanding(h, date, logged, plannedHere, weeklyDay);
  return on && ease?.mode === 'lighter' ? { ...on, lighter: ease.note || '' } : on;
}

function habitStanding(h, date, logged, plannedHere, weeklyDay) {
  if (h.start_date && String(h.start_date).slice(0, 10) > date) return null;
  if (h.end_date && String(h.end_date).slice(0, 10) < date) return null;
  const s = scheduleOf(h);
  const doneThatDay = logged.includes(date);
  if (s.days?.length) {
    if (!s.days.includes(weekdayOf(date)) && !plannedHere) return null;
    return { schedule: `on ${s.days.map((d) => DOW[d]).join(', ')}`, done: doneThatDay };
  }
  if (s.per === 'day') {
    const count = logged.filter((d) => d === date).length;
    return {
      schedule: scheduleLabel(s),
      done: s.times > 1 ? count >= s.times : doneThatDay,
    };
  }
  const start = s.per === 'week' ? weekAround(date, weeklyDay).first : `${date.slice(0, 8)}01`;
  const sofar = logged.filter((d) => d >= start && d <= date).length;
  return {
    schedule: scheduleLabel(s),
    done: doneThatDay,
    progress: `${sofar} of ${s.times} this ${s.per}`,
    met: sofar >= s.times,
  };
}

/** The days one call reads: date, or date through to, at most a week. Pure, for tests. */
export function daysToRead(input, today) {
  const first = isDay(input?.date) ? input.date : today;
  if (!isDay(input?.to) || input.to <= first) return [first];
  const days = [first];
  while (days.length < MAX_DAYS && days[days.length - 1] < input.to) {
    days.push(addDays(days[days.length - 1], 1));
  }
  return days;
}

/**
 * The habits, their check ins and the days they are planned on, read once for
 * every day of a call. The planned days are read a week either side of the
 * days asked for, and across the whole of their week when it is known: it can
 * run longer than that from one of its days (on their weekly day it runs to
 * the next one).
 */
function habitSelects(d, u, first, last, bounds, weeklyDay) {
  const reachFrom = addDays(first, -PLAN_REACH);
  const reachTo = addDays(last, PLAN_REACH);
  const plansFrom = bounds && bounds.first < reachFrom ? bounds.first : reachFrom;
  const plansTo = bounds && bounds.last > reachTo ? bounds.last : reachTo;
  const monthStart = `${first.slice(0, 8)}01`;
  // the check ins of the week and of the month the first day is in
  const weekStart = weekAround(first, weeklyDay).first;
  const since = weekStart < monthStart ? weekStart : monthStart;
  return [
    d.select(
      `habits?owner_id=eq.${u}&archived=eq.false&select=id,name,title,subtype,frequency,cadence,target_per_period,days_active,start_date,end_date&limit=200`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${u}&occurred_day=gte.${since}&occurred_day=lte.${last}&select=habit_id,occurred_day&limit=3000`,
    ),
    // the days of their week each habit is planned on; a day that cannot be
    // read leaves the habits without them, and the day is still answered
    d
      .select(
        `habit_plans?owner_id=eq.${u}&planned_date=gte.${plansFrom}&planned_date=lte.${plansTo}&select=habit_id,planned_date&limit=500`,
      )
      .catch((err) => {
        console.warn(`[get_day] could not read the habits' planned days: ${err?.message || err}`);
        return [];
      }),
  ];
}

/**
 * The days of their week, from the week the thread sent: the first day it
 * shows through its last. Null when no week was sent.
 */
export function weekBounds(week) {
  const first = week?.view_first || week?.first;
  return isDay(first) && isDay(week?.last) ? { first, last: week.last } : null;
}

/**
 * Where a day stands among the days a habit is planned on: whether it is one
 * of them, and the others. Inside their week (bounds) the others are that
 * week's and no further, so what is said of the week is the week the changes
 * are checked against (shared/changes/check.js). A day outside their week has
 * no others. With no week known, the others are those within a week either
 * side, and are not called a week. Null when there is nothing to say.
 * Pure, for tests.
 */
export function plannedAround(days, date, bounds = null) {
  const all = [...new Set(days || [])].sort();
  const on = all.includes(date);
  if (bounds) {
    if (date < bounds.first || date > bounds.last)
      return on ? { on, others: [], week: false } : null;
    const inWeek = all.filter((d) => d >= bounds.first && d <= bounds.last);
    if (!inWeek.length) return null;
    return { on, others: inWeek.filter((d) => d !== date), week: true };
  }
  const near = all.filter((d) => d >= addDays(date, -PLAN_REACH) && d <= addDays(date, PLAN_REACH));
  if (!near.length) return null;
  return { on, others: near.filter((d) => d !== date), week: false };
}

export const getDay = {
  name: 'get_day',
  description: DESCRIPTION,
  parameters: obj({
    date: day('the day to read, or the first of several; today when left out'),
    to: day('the last day to read, for several days at once; up to a week after date'),
  }),

  async run(ctx, input = {}) {
    const days = daysToRead(input, ctx.today);
    const shared = habitSelects(
      ctx.db,
      ctx.userId,
      days[0],
      days[days.length - 1],
      weekBounds(ctx.week),
      weeklyDayOf(ctx.week?.weekly_day),
    );
    const read = await Promise.all(days.map((date) => readDay(ctx, date, shared)));
    return days.length === 1 ? read[0] : { days: read };
  },

  render(r, ctx) {
    if (Array.isArray(r.days)) return r.days.map((one) => renderDay(one, ctx)).join('\n\n');
    return renderDay(r, ctx);
  },
};

/** One day, with the habits and check ins shared by every day of the call. */
async function readDay(ctx, date, shared) {
  const isToday = date === ctx.today;
  const d = ctx.db;
  const u = ctx.userId;
  const [
    synced,
    noteEvents,
    quickEvents,
    todos,
    back,
    overdue,
    habits,
    progress,
    plans,
    dcoRows,
    threads,
  ] = await Promise.all([
    ...calendarSelects(d, u, ctx.timezone, date),
    d.select(
      `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=eq.${date}&select=id,name,title,due_time,time_estimate_minutes&order=due_time.asc.nullslast&limit=50`,
    ),
    // put off until this day: no day of its own, and this is the day it comes back
    d.select(
      `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=is.null&resurface_at=eq.${date}&select=id,name,title,time_estimate_minutes&limit=30`,
    ),
    isToday
      ? d.select(
          `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=lt.${date}&select=id,name,title,due_day&order=due_day.desc&limit=15`,
        )
      : Promise.resolve([]),
    ...shared,
    isToday
      ? d
          .select(`user_daily_state?user_id=eq.${u}&date=eq.${date}&select=dco&limit=1`)
          .catch(() => [])
      : Promise.resolve([]),
    isToday
      ? d
          .select(
            `scope_chats?user_id=eq.${u}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${date}&select=metadata_json&limit=1`,
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const dco = dcoRows?.[0]?.dco || null;
  const { meetings, allDay } = meetingsFrom({
    synced,
    noteEvents,
    quickEvents,
    tz: ctx.timezone,
    cancelledIds: new Set(dco?.cancelled_calendar_ids || []),
  });
  const logsBy = new Map();
  for (const p of progress || []) {
    const logged = String(p.occurred_day).slice(0, 10);
    logsBy.set(p.habit_id, [...(logsBy.get(p.habit_id) || []), logged]);
  }
  const plansBy = new Map();
  for (const p of plans || []) {
    const planned = String(p.planned_date).slice(0, 10);
    plansBy.set(p.habit_id, [...(plansBy.get(p.habit_id) || []), planned]);
  }
  const bounds = weekBounds(ctx.week);
  const weeklyDay = weeklyDayOf(ctx.week?.weekly_day);
  // the habits paused or on a lighter version, as the thread sent them
  const eases = (ctx.week?.eased || []).map(rowOfEase);
  const habitRows = [];
  for (const h of habits || []) {
    const planned = plannedAround(plansBy.get(h.id), date, bounds);
    const on = habitOnDay(
      h,
      date,
      logsBy.get(h.id) || [],
      !!planned?.on,
      weeklyDay,
      easeOn(eases, h.id, date),
    );
    if (on) {
      habitRows.push({ id: h.id, title: h.name || h.title || 'Untitled', ...on, planned });
    }
  }
  const record = isToday
    ? buildDayRecord({
        today: date,
        frame: dco?.day_frame || null,
        threadMeta: threads?.[0]?.metadata_json || null,
        meetings,
        anchors: Array.isArray(dco?.named_anchors) ? dco.named_anchors : [],
      })
    : null;
  return {
    date,
    isToday,
    meetings,
    allDay,
    todos: [
      ...(todos || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled' })),
      ...(back || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled', back: true })),
    ],
    overdue: (overdue || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled' })),
    habits: habitRows,
    record,
  };
}

/** Where a day stands among a habit's planned days, in words; nothing when there is nothing to say. */
function plannedWords(planned, today) {
  if (!planned) return '';
  const others = planned.others.map((d) => dayWords(d, today)).join(', ');
  const where = planned.week ? ' in their week' : '';
  if (planned.on) return `, planned for this day${where}${others ? ` (also on ${others})` : ''}`;
  return `, planned${where} on ${others}, not on this day`;
}

/** A habit's lighter version on the day, in words; nothing when it is on none. */
function lighterWords(lighter) {
  if (lighter == null) return '';
  return lighter
    ? `, lighter version for now: “${trim(lighter, 120)}”`
    : ', on a lighter version for now';
}

/** One day, in words, with the ids the tools take. */
function renderDay(r, ctx) {
  const lines = [dayWords(r.date, ctx.today)];
  lines.push(
    r.meetings.length
      ? `Calendar: ${r.meetings.map((m) => `${clock(m.start)} to ${clock(m.end)} ${trim(m.title, 60)}`).join('; ')}`
      : 'Calendar: nothing timed',
  );
  if (r.allDay.length) lines.push(`All day: ${r.allDay.map((a) => trim(a.title, 60)).join('; ')}`);
  if (r.record?.travel) {
    lines.push(
      `Travel: ${r.record.travel.label || 'travelling'}${r.record.travel.departs != null ? `, setting off at ${clock(r.record.travel.departs)}` : ''}`,
    );
  } else if (r.record?.away) {
    lines.push(
      `Away: ${r.record.away.label}${r.record.away.through ? ` until ${dayWords(r.record.away.through, ctx.today)}` : ''}`,
    );
  }
  if (r.record?.blocks?.length) {
    lines.push(
      `Set times: ${r.record.blocks.map((b) => `${clock(b.start)} ${trim(b.title, 50)}`).join('; ')}`,
    );
  }
  lines.push(
    r.todos.length
      ? `Todos for the day: ${r.todos
          .map(
            (t) =>
              `${trim(t.title, 60)} (id ${t.id})${t.due_time ? ` at ${clock(t.due_time)}` : ''}${t.time_estimate_minutes ? `, ${t.time_estimate_minutes} min` : ''}${t.back ? ', put off earlier and back on this day' : ''}`,
          )
          .join('; ')}`
      : 'Todos for the day: none',
  );
  if (r.overdue.length) {
    lines.push(
      `Past their day: ${r.overdue.map((t) => `${trim(t.title, 60)} (id ${t.id}, was ${dayWords(t.due_day, ctx.today)})`).join('; ')}`,
    );
  }
  if (r.habits.length) {
    lines.push(
      `Habits: ${r.habits
        .map(
          (h) =>
            h.breaking
              ? `${trim(h.title, 50)} (id ${h.id}) a habit they are breaking, with nothing to do or plan, ${h.done ? 'checked in as kept clear that day' : 'no check in that day'}`
              : `${trim(h.title, 50)} (id ${h.id}) ${h.schedule}, ${h.done ? 'done that day' : 'not done that day'}${h.progress ? `, ${h.progress}${h.met ? ', already met' : ''}` : ''}${plannedWords(h.planned, ctx.today)}${lighterWords(h.lighter)}`,
        )
        .join('; ')}`,
    );
  }
  return lines.join('\n');
}
