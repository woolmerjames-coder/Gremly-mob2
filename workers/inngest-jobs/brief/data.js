/**
 * Everything the brief writer and the offer rule read, gathered in code.
 * Counts, clashes and clear stretches are worked out here, so the model never
 * counts or adds up times itself.
 */

import { db, userTimezone, localDate, addDays, personIdentity } from '../context/db';
import { buildDcoV4, writeDco } from '../context/daily';
import { dayOfWeekNumber, isBehindThisWeek, mondayOf, weeklyTarget } from './behind';
import { readThreadReaction } from './reaction';
import { sweepCounts } from '../notifications/sweepCount';
import { buildDayRecord } from './dayRecord';

export const PLAN_DAY_START = 8 * 60;
export const PLAN_DAY_END = 22 * 60;

/**
 * Google and Outlook keep a cancelled meeting with "Canceled: " at the start of
 * its title. Only that exact form counts here; anything else is left to the
 * DCO's calendar reader.
 */
export const CANCELLED_TITLE = /^\s*(canceled|cancelled)\s*:/i;

/** Cancelled entries stay on some calendars; they are not part of the day. */
export function isCancelledEntry(e, cancelledIds) {
  return Boolean(cancelledIds?.has(e.id) || CANCELLED_TITLE.test(e.title || ''));
}

export function dayPartAt(min) {
  if (min < 12 * 60) return 'morning';
  if (min < 17 * 60) return 'afternoon';
  return 'evening';
}

function partsIn(tz, at) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  out.hour = (out.hour || 0) % 24;
  return out;
}

export function minutesIn(tz, at) {
  const p = partsIn(tz, at instanceof Date ? at : new Date(at));
  return p.hour * 60 + p.minute;
}

/** The UTC instant of local midnight on dateStr. */
export function localStartIso(tz, dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  let guess = Date.UTC(y, mo - 1, d, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(tz, new Date(guess));
    guess +=
      Date.UTC(y, mo - 1, d, 0, 0) -
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(guess).toISOString();
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

/** The ritual day: before the person's Day Boundary hour it is still yesterday. */
export function ritualDayFor(today, nowMin, boundaryHour) {
  return boundaryHour > 0 && nowMin < boundaryHour * 60 ? addDays(today, -1) : today;
}

/**
 * Today's calendar as the brief reads it: synced entries, events Gremly holds
 * and quick events, timed ones in local minutes, cancelled ones left out.
 */
export function meetingsFrom({ synced, noteEvents, quickEvents, tz, cancelledIds }) {
  const meetings = [];
  const allDay = [];
  for (const e of synced || []) {
    if (isCancelledEntry(e, cancelledIds)) continue;
    if (e.is_all_day) {
      allDay.push({ id: e.id, title: e.title });
      continue;
    }
    const start = minutesIn(tz, e.start_at);
    const end = e.end_at ? minutesIn(tz, e.end_at) : start + 30;
    meetings.push({ id: e.id, title: e.title, start, end: end > start ? end : start + 30 });
  }
  for (const n of noteEvents || []) {
    if (!n.event_time) {
      allDay.push({ id: n.id, title: n.title });
      continue;
    }
    const [h, m] = n.event_time.split(':').map(Number);
    meetings.push({ id: n.id, title: n.title, start: h * 60 + m, end: h * 60 + m + 60 });
  }
  for (const c of quickEvents || []) {
    if (!c.event_time) {
      allDay.push({ id: c.id, title: c.title });
      continue;
    }
    const [h, m] = c.event_time.split(':').map(Number);
    meetings.push({
      id: c.id,
      title: c.title,
      start: h * 60 + m,
      end: h * 60 + m + (c.duration_minutes || 30),
    });
  }
  meetings.sort((a, b) => a.start - b.start);
  return { meetings, allDay };
}

/** The selects meetingsFrom reads, for one person's day. */
export function calendarSelects(d, userId, tz, today) {
  const dayStart = localStartIso(tz, today);
  const dayEnd = localStartIso(tz, addDays(today, 1));
  return [
    d.select(
      `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(dayStart)}&start_at=lt.${encodeURIComponent(dayEnd)}&select=id,title,start_at,end_at,is_all_day&order=start_at.asc&limit=100`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&external_source=is.null&target_date=eq.${today}&select=id,title,event_time,end_date&limit=50`,
    ),
    d.select(
      `calendar_events?owner_id=eq.${userId}&event_date=eq.${today}&select=id,title,event_time,duration_minutes&limit=50`,
    ),
  ];
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

export async function gatherBrief(env, userId, { at = new Date() } = {}) {
  const d = db(env);
  const tz = await userTimezone(env, userId);
  const today = localDate(tz, at);
  const now = minutesIn(tz, at);
  const [prefs] = await d.select(
    `cortex_preferences?owner_id=eq.${userId}&select=day_boundary_hour,gremly_age,brief_in_chat`,
  );
  const ritualDay = ritualDayFor(today, now, prefs?.day_boundary_hour ?? 0);
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
  ] = await Promise.all([
    todaysDco(env, userId, tz, today),
    personIdentity(env, userId),
    ...calendarSelects(d, userId, tz, today),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,name,title,due_day,commitment,time_estimate_minutes,created_at,skipped_in_sweep_at,resurface_at,scheduled_start_iso&limit=1000`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&external_source=is.null&swept_at=is.null&subtype=in.(idea,catchall,list,reference)&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -6)))}&select=id&limit=500`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,cadence,target_per_period,days_active,subtype,start_date,end_date,time_estimate_minutes,scheduled_start_iso&limit=200`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${monday}&occurred_day=lte.${today}&select=habit_id,occurred_day&limit=2000`,
    ),
    // Sweep's counts by the app's own rules (the evening Sweep and the
    // morning's quick sweep); null when they cannot be counted
    sweepCounts(env, userId, { today, tz }).catch(() => null),
    // today's thread: set times added there (fixed_blocks) belong to the day
    d
      .select(
        `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=id,metadata_json&limit=1`,
      )
      .catch(() => []),
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
  const todosDue = open.filter((t) => t.due_day === today || (t.commitment && t.due_day === today));
  const overdue = open.filter(
    (t) => t.due_day && t.due_day < today && !(t.resurface_at && t.resurface_at > today),
  );
  const unsortedTodos = open.filter(
    (t) => !t.due_day && !t.commitment && !(t.resurface_at && t.resurface_at > today),
  );
  const unsorted = unsortedTodos.length + (notes || []).length;

  // Habits this week
  const done = new Map();
  for (const p of progress || []) done.set(p.habit_id, (done.get(p.habit_id) || 0) + 1);
  const daysGone = dayOfWeekNumber(today);
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
      minutes: h.time_estimate_minutes || null,
    };
  });
  const habitsForToday = habitView.filter((h) => h.daily || h.behind || h.scheduledToday);

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
    briefInChat: prefs?.brief_in_chat === true,
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
