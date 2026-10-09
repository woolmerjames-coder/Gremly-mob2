// ============================================================================
// weekAhead.js: the next seven days as the app has them, for Ask Gremly.
//
// Every Ask Gremly message carries the calendar (synced entries, events Gremly
// holds, quick events) and the todos planned for each of the next seven days,
// with the todos still open past their day, so a question about the days ahead
// is answered from what is there and a clear day is known to be clear. The
// calendar is read the way the brief and get_day read a day
// (workers/shared/calendar.js), in six reads for the whole week, alongside the
// rest of the preload so it adds no wait. Read live, not cached, so something
// planned a moment ago is in the next reply.
// ============================================================================

import { db } from '../../shared/db.js';
import { stepsOnClosedChapters, withoutClosedSteps } from '../../shared/closedSteps.js';
import { localDateOf, meetingsFrom, syncedOn, syncedRange } from '../../shared/calendar.js';
import { addDays, clock, dayWords, trim } from '../agent/tools/words.js';

export const WEEK_DAYS = 7;
const MOST_A_DAY = 15;
// Every todo planned for a day is named, up to what get_day reads for one day,
// so the whole list can be given when they ask for it.
const MOST_TODOS_A_DAY = 50;

/**
 * Read the week: { first, days: [{ date, meetings, allDay, todos }], overdue }.
 * cancelledIds (a list, or a promise of one) are calendar entries known to be
 * cancelled. today (a day, or a promise of one) is the person's day, which is
 * still yesterday after midnight until their day ends (workers/shared/day.js);
 * the calendar's date when it is not given. A read that fails is logged and
 * the week is left out of the reply's context.
 */
export async function readWeekAhead(
  userId,
  timezone,
  env,
  { cancelledIds = [], today = null } = {},
) {
  if (!userId) return null;
  const tz = timezone || 'UTC';
  const theirDay = await Promise.resolve(today).catch(() => null);
  const first = theirDay || localDateOf(tz, Date.now());
  const last = addDays(first, WEEK_DAYS - 1);
  const d = db(env);
  const u = userId;
  try {
    // steps left on a closed Chapter stay with it, as on Today in the app
    const leftP = stepsOnClosedChapters(d, u);
    const [synced, noteEvents, quickEvents, todosRead, overdueRead] = await Promise.all([
      syncedRange(d, u, tz, first, last),
      d.select(
        `notes?owner_id=eq.${u}&subtype=eq.event&archived=eq.false&external_source=is.null&or=(target_date.gte.${first},end_date.gte.${first})&target_date=lte.${last}&select=id,title,event_time,target_date,end_date&limit=200`,
      ),
      d.select(
        `calendar_events?owner_id=eq.${u}&event_date=gte.${first}&event_date=lte.${last}&select=id,title,event_time,duration_minutes,event_date&limit=200`,
      ),
      d.select(
        `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=gte.${first}&due_day=lte.${last}&select=id,name,title,due_day,due_time&order=due_day.asc,due_time.asc.nullslast&limit=200`,
      ),
      d.select(
        `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=lt.${first}&select=id,name,title,due_day&order=due_day.desc&limit=15`,
      ),
    ]);
    const left = await leftP;
    const todos = withoutClosedSteps(todosRead, left);
    const overdue = withoutClosedSteps(overdueRead, left);
    // today's cancelled entries, as the daily context found them (may be a promise)
    const ids = await Promise.resolve(cancelledIds).catch(() => []);
    return weekFrom({
      first,
      tz,
      synced,
      noteEvents,
      quickEvents,
      todos,
      overdue,
      cancelledIds: ids,
    });
  } catch (err) {
    console.error('[WeekAhead] read failed', String(err?.message || err).slice(0, 300));
    return null;
  }
}

/** The week from its reads, day by day. Pure, for tests. */
export function weekFrom({
  first,
  tz,
  synced,
  noteEvents,
  quickEvents,
  todos,
  overdue,
  cancelledIds,
}) {
  const cancelled = new Set(cancelledIds || []);
  const title = (t) => t.name || t.title || 'Untitled';
  const days = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    const date = addDays(first, i);
    const { meetings, allDay } = meetingsFrom({
      synced: syncedOn(synced, date, tz),
      // an event Gremly holds shows on each day from its date to its end date
      noteEvents: (noteEvents || []).filter(
        (n) => n.target_date <= date && date <= (n.end_date || n.target_date),
      ),
      quickEvents: (quickEvents || []).filter((c) => c.event_date === date),
      tz,
      cancelledIds: cancelled,
    });
    days.push({
      date,
      meetings,
      allDay,
      todos: (todos || [])
        .filter((t) => t.due_day === date)
        .map((t) => ({ id: t.id || null, title: title(t), due_time: t.due_time || null })),
    });
  }
  return {
    first,
    days,
    overdue: (overdue || []).map((t) => ({
      id: t.id || null,
      title: title(t),
      due_day: t.due_day,
    })),
  };
}

function some(list, n, words) {
  const shown = list.slice(0, n).map(words);
  if (list.length > n) shown.push(`and ${list.length - n} more (${list.length} in all)`);
  return shown.join('; ');
}

/**
 * The week in words for the reply's instructions. With ids (for the agent,
 * agent/chat.js) each todo carries the id the agent's tools take, so a change
 * to one of them needs no lookup first.
 */
export function formatWeekAhead(week, { ids = false } = {}) {
  if (!week) return '';
  const idOf = (t) => (ids && t.id ? ` (id ${t.id})` : '');
  const lines = [
    "=== THE WEEK AHEAD (their calendar and the todos they've planned, read just now) ===",
    'The next seven days as the app has them, each with what is on its calendar and the todos planned for it, counted. A day with nothing listed has nothing on their calendar and no todos planned for it. When they ask about the days ahead, answer from this: an answer about a day covers both its calendar and its todos, and says how many todos there are when there are more than a few. Never describe a day with todos planned as having little on it, and when a day is clear, say so rather than filling it in.',
  ];
  for (const day of week.days) {
    const parts = [];
    const onCalendar = day.meetings.length + day.allDay.length;
    if (onCalendar) {
      const entries = [
        ...(day.allDay.length ? [`all day: ${some(day.allDay, 5, (a) => trim(a.title, 60))}`] : []),
        ...(day.meetings.length
          ? [
              some(
                day.meetings,
                MOST_A_DAY,
                (m) => `${clock(m.start)} to ${clock(m.end)} ${trim(m.title, 60)}`,
              ),
            ]
          : []),
      ];
      parts.push(`  on their calendar (${onCalendar}): ${entries.join('; ')}`);
    }
    if (day.todos.length)
      parts.push(
        `  todos planned for it (${day.todos.length}): ${some(day.todos, MOST_TODOS_A_DAY, (t) => `${trim(t.title, 60)}${idOf(t)}${t.due_time ? ` at ${clock(t.due_time)}` : ''}`)}`,
      );
    lines.push(
      parts.length
        ? `${dayWords(day.date, week.first)}:\n${parts.join('\n')}`
        : `${dayWords(day.date, week.first)}: nothing planned`,
    );
  }
  if (week.overdue.length)
    lines.push(
      `Still open from before today: ${some(week.overdue, 10, (t) => `${trim(t.title, 60)}${idOf(t)} (was ${dayWords(t.due_day)})`)}`,
    );
  return lines.join('\n');
}
