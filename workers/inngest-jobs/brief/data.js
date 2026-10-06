/**
 * Everything the brief writer and the offer rule read, gathered in code.
 * Counts, clashes and clear stretches are worked out here, so the model never
 * counts or adds up times itself.
 */

import { db, userTimezone, localDate, addDays, personIdentity } from '../context/db';
import {
  CANCELLED_TITLE,
  calendarSelects,
  isCancelledEntry,
  localStartIso,
  meetingsFrom,
  minutesIn,
} from '../../shared/calendar.js';
import { dayEndHourFrom, personDay } from '../../shared/day.js';
import { buildDcoV4, writeDco } from '../context/daily';
import { dayOfWeekNumber, isBehindThisWeek, mondayOf, weeklyTarget } from './behind';
import { readThreadReaction } from './reaction';
import { sweepCounts } from '../notifications/sweepCount';
import { buildDayRecord } from './dayRecord';
import { briefOffersReview, cycleOf } from '../../shared/week.js';
import { habitToCheckIn, plannedOn } from '../../shared/habitWeek.js';
import { weekSettings } from '../week/settings';

export const PLAN_DAY_START = 8 * 60;
export const PLAN_DAY_END = 22 * 60;

// Moved to workers/shared/calendar.js so the agent's tools in cortex read the
// calendar the same way; still exported from here for the brief's imports.
export {
  CANCELLED_TITLE,
  calendarSelects,
  isCancelledEntry,
  localStartIso,
  meetingsFrom,
  minutesIn,
};

export function dayPartAt(min) {
  if (min < 12 * 60) return 'morning';
  if (min < 17 * 60) return 'afternoon';
  return 'evening';
}

/** Busy blocks (merged meetings) and the clear stretches between them, in minutes. */
export function shapeOfDay(meetings, dayStart = PLAN_DAY_START, dayEnd = PLAN_DAY_END) {
  const busy = meetings
    .map((m) => [Math.max(dayStart, m.start), Math.min(dayEnd, m.end)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push([...b]);
  }
  const free = [];
  let cur = dayStart;
  for (const [a, b] of merged) {
    if (a > cur) free.push({ from: cur, to: a });
    cur = Math.max(cur, b);
  }
  if (dayEnd > cur) free.push({ from: cur, to: dayEnd });
  return { busy: merged.map(([from, to]) => ({ from, to })), free };
}

/** Pairs of meetings that overlap each other. */
export function clashesOf(meetings) {
  const out = [];
  const sorted = [...meetings].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start >= sorted[i].end) break;
      out.push([sorted[i], sorted[j]]);
    }
  }
  return out;
}

/** The ritual day: before the person's Day Boundary hour it is still yesterday (shared/day.js). */
export function ritualDayFor(today, nowMin, boundaryHour) {
  return personDay(today, nowMin, boundaryHour);
}

/** Today's DCO, built now if the 4am job has not made one (a first open after a month away). */
export async function todaysDco(env, userId, tz, today) {
  const d = db(env);
  const [row] = await d.select(`user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`);
  if (row?.dco?.pipeline) return { dco: row.dco, built: false };
  const built = await buildDcoV4(env, userId, { tz });
  await writeDco(env, userId, built, { shadow: false });
  return { dco: built.dco, built: true };
}

/** Part of their week could not be read: said, and the brief goes on without it. */
function weekUnread(what, err, fallback) {
  console.warn(`[DailyBrief] could not read ${what}: ${err?.message || err}`);
  return fallback;
}

/** The review of the week a day is in, among the rows read. */
function reviewOfWeek(rows, today, settings) {
  const start = cycleOf(today, settings.weekly_day).week_start;
  return rows.find((r) => r.week_start === start) || null;
}

export async function gatherBrief(env, userId, { at = new Date() } = {}) {
  const d = db(env);
  const tz = await userTimezone(env, userId);
  const calendarDay = localDate(tz, at);
  const now = minutesIn(tz, at);
  const [prefs] = await d.select(
    `cortex_preferences?owner_id=eq.${userId}&select=day_boundary_hour,gremly_age`,
  );
  const dayEndHour = dayEndHourFrom(prefs?.day_boundary_hour);
  const ritualDay = ritualDayFor(calendarDay, now, dayEndHour);
  const today = ritualDay;
  const dayStart = localStartIso(tz, today);
  const dayEnd = localStartIso(tz, addDays(today, 1));
  const monday = mondayOf(today);

  const [
    dcoResult,
    person,
    synced,
    noteEvents,
    quickEvents,
    todos,
    notes,
    habits,
    progress,
    sweep,
    threads,
    habitPlans,
    settings,
    reviews,
  ] = await Promise.all([
    todaysDco(env, userId, tz, today),
    personIdentity(env, userId),
    ...calendarSelects(d, userId, tz, today),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,name,title,due_day,time_estimate_minutes,created_at,skipped_in_sweep_at,resurface_at,scheduled_start_iso&limit=1000`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&external_source=is.null&swept_at=is.null&subtype=in.(idea,catchall,list,reference)&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -6)))}&select=id&limit=500`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,cadence,target_per_period,days_active,subtype,start_date,end_date,time_estimate_minutes,scheduled_start_iso,quiet_until:views->>checkins_quiet_until&limit=200`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${monday}&occurred_day=lte.${today}&select=habit_id,occurred_day&limit=2000`,
    ),
    // Sweep's counts by the app's own rules (the evening Sweep and the
    // morning's quick sweep); null when they cannot be counted
    sweepCounts(env, userId, { today, tz, day: ritualDay, dayEndHour }).catch(() => null),
    // today's thread: set times added there (fixed_blocks) belong to the day
    d
      .select(
        `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=id,metadata_json&limit=1`,
      )
      .catch(() => []),
    // Their week: the habits they planned for today, their weekly day, and the
    // review of the week. The brief never waits on these: without them it has
    // no check in and no offer of the review, and says why in the log.
    d
      .select(
        `habit_plans?owner_id=eq.${userId}&planned_date=eq.${today}&select=habit_id,planned_date,status&limit=200`,
      )
      .catch((err) => weekUnread('the habits planned for today', err, [])),
    weekSettings(env, userId).catch((err) => weekUnread('their weekly day', err, null)),
    d
      .select(
        `weekly_reviews?owner_id=eq.${userId}&week_start=gte.${addDays(today, -6)}&week_start=lte.${today}&select=week_start,status&limit=7`,
      )
      .catch((err) => weekUnread("the week's review", err, null)),
  ]);
  const dco = dcoResult.dco;

  // Today's timed calendar entries, in local minutes. Cancelled ones are left out.
  const { meetings, allDay } = meetingsFrom({
    synced,
    noteEvents,
    quickEvents,
    tz,
    cancelledIds: new Set(dco?.cancelled_calendar_ids || []),
  });
  // one picture of the day: travel, set times, where planning stops, the chip
  const day = buildDayRecord({
    today,
    frame: dco?.day_frame || null,
    threadMeta: threads?.[0]?.metadata_json || null,
    meetings,
    anchors: Array.isArray(dco?.named_anchors) ? dco.named_anchors : [],
  });
  const { busy, free } = shapeOfDay(
    day.busy.map((b) => ({ start: b.start, end: b.end })),
    PLAN_DAY_START,
    day.planEnd,
  );

  // Todos (the app writes name; older rows may only have title)
  const open = (todos || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled' }));
  // due today, and the ones put off (Later) whose day to come back is today:
  // a Later has no day of its own, so its back day is what puts it on Today
  // (the app's selectTodosDueToday)
  const todosDue = open.filter(
    (t) => t.due_day === today || (!t.due_day && t.resurface_at === today),
  );
  const overdue = open.filter(
    (t) => t.due_day && t.due_day < today && !(t.resurface_at && t.resurface_at > today),
  );
  const unsortedTodos = open.filter(
    (t) => !t.due_day && !(t.resurface_at && t.resurface_at > today),
  );
  const unsorted = unsortedTodos.length + (notes || []).length;

  // Habits this week
  const done = new Map();
  for (const p of progress || []) done.set(p.habit_id, (done.get(p.habit_id) || 0) + 1);
  const daysGone = dayOfWeekNumber(today);
  const plannedToday = plannedOn(habitPlans, today);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const active = (habits || []).filter(
    (h) => (!h.start_date || h.start_date <= today) && (!h.end_date || h.end_date >= today),
  );
  const habitView = active.map((h) => {
    const target = weeklyTarget(h);
    const n = done.get(h.id) || 0;
    const daily = (h.cadence || 'daily') === 'daily' && h.subtype !== 'break_habit';
    const scheduledToday =
      Array.isArray(h.days_active) && h.days_active.length
        ? h.days_active.includes(weekday)
        : false;
    return {
      id: h.id,
      title: h.name || h.title || 'Habit',
      done: n,
      target,
      daily,
      behind: isBehindThisWeek(h, n, daysGone),
      scheduledToday,
      // on today in the week they planned
      plannedToday: plannedToday.has(h.id),
      minutes: h.time_estimate_minutes || null,
    };
  });
  const habitsForToday = habitView.filter(
    (h) => h.daily || h.behind || h.scheduledToday || h.plannedToday,
  );
  // the one habit planned for today that the brief checks in on
  const checkIn = habitToCheckIn({
    today,
    habits: active,
    plans: habitPlans,
    doneToday: (progress || []).filter((p) => p.occurred_day === today).map((p) => p.habit_id),
  });
  // the weekly review is offered on the two mornings after their weekly day,
  // until it is done; with their week unread, it is not offered
  const reviewOffer =
    !!settings &&
    Array.isArray(reviews) &&
    briefOffersReview(today, settings.weekly_day, reviewOfWeek(reviews, today, settings));

  // The DCO's decisions
  const brief = dco?.brief || {};
  let question = brief.question || null;
  if (question?.id) {
    const [q] = await d.select(
      `gremly_questions?id=eq.${question.id}&select=id,question,status,choices`,
    );
    // Answered or retired since the DCO was built: not asked again
    question =
      q && ['open', 'asked'].includes(q.status)
        ? {
            id: q.id,
            question: question.question || q.question,
            choices: Array.isArray(q.choices) ? q.choices : [],
          }
        : null;
  }
  const ret = brief.return && (brief.return.days_away ?? 0) >= 3 ? brief.return : null;
  const reach = brief.reach || null;
  const candidates = todosDue.length + habitsForToday.length + (reach ? 1 : 0);
  // A plan already locked in for today (Plan tomorrow, the evening before)
  const planned = [
    ...open.map((t) => ({ type: 'todo', id: t.id, title: t.title, iso: t.scheduled_start_iso })),
    ...(habits || []).map((h) => ({
      type: 'habit',
      id: h.id,
      title: h.name || h.title || 'Habit',
      iso: h.scheduled_start_iso,
    })),
  ]
    .filter((x) => x.iso && x.iso >= dayStart && x.iso < dayEnd)
    .map((x) => ({ type: x.type, id: x.id, title: x.title, start: minutesIn(tz, x.iso) }))
    .sort((a, b) => a.start - b.start);
  const reaction = await readThreadReaction(env, userId, addDays(ritualDay, -1)).catch(() => null);

  return {
    tz,
    today,
    ritualDay,
    now,
    part: dayPartAt(now),
    person,
    gremlyAge: prefs?.gremly_age ?? 0,
    dco,
    dcoBuilt: dcoResult.built,
    meetings,
    allDay,
    busy,
    free,
    clashes: clashesOf(meetings),
    day,
    todosDue,
    // what needs a decision before the day is planned (the quick sweep's
    // split), or the older count when Sweep's could not be read
    overdue: sweep ? sweep.pastDay : overdue.length,
    unsorted: sweep ? sweep.quick - sweep.pastDay : unsorted,
    sweep,
    // the number the brief and the day card name: the quick sweep's
    sweepWaiting: sweep ? sweep.quick : null,
    habits: habitView,
    habitsForToday,
    checkIn,
    reviewOffer,
    candidates,
    planned,
    question,
    reach,
    ret,
    anchors: Array.isArray(dco?.named_anchors) ? dco.named_anchors : [],
    claims: Array.isArray(brief.claims) ? brief.claims : [],
    dayShape: brief.day_shape || null,
    absence: dco?.absence || null,
    reaction,
  };
}
