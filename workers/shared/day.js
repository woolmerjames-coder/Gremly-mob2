/**
 * The person's day. Their day ends at the hour they chose (the app's Day
 * Boundary), not at midnight: before that hour it is still yesterday for
 * them. The app works from this day (lib/date/DateService.ts, ritualDay), and
 * so do the brief and the notifications. Anything that says "today" or
 * "tomorrow" to them has to count from it too, or after midnight Gremly and
 * the app disagree about which day it is.
 */
import { db } from './db.js';
import { localDateOf, minutesIn } from './calendar.js';

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The person's day from the calendar's date and the minutes after midnight
 * where they are. Pure.
 */
export function personDay(calendarDay, nowMin, dayEndHour) {
  const hour = Number.isFinite(dayEndHour) ? dayEndHour : 0;
  return hour > 0 && nowMin < hour * 60 ? addDays(calendarDay, -1) : calendarDay;
}

// Every message asks for it, so it is read at most once a minute for a person.
const KEEP_MS = 60 * 1000;
const MOST_KEPT = 500;
const kept = new Map();

/**
 * The hour their day ends (cortex_preferences.day_boundary_hour). A read that
 * fails is logged and the last hour known is used, midnight when there is none.
 */
export async function dayEndHourOf(env, userId, { now = Date.now() } = {}) {
  if (!userId) return 0;
  const had = kept.get(userId);
  if (had && now - had.at < KEEP_MS) return had.hour;
  try {
    const rows = await db(env).select(
      `cortex_preferences?owner_id=eq.${userId}&select=day_boundary_hour&limit=1`,
    );
    const hour = Number(rows?.[0]?.day_boundary_hour) || 0;
    if (kept.size >= MOST_KEPT) kept.clear();
    kept.set(userId, { hour, at: now });
    return hour;
  } catch (err) {
    console.error('[Day] could not read the day end', String(err?.message || err).slice(0, 200));
    return had ? had.hour : 0;
  }
}

/** Forget the hours kept, for tests. */
export function forgetDayEnds() {
  kept.clear();
}

/**
 * Their day right now. late is true after midnight and before their day ends:
 * the calendar has moved on and their day has not.
 * @returns {Promise<{today: string, calendarDay: string, nowMin: number, dayEndHour: number, late: boolean}>}
 */
export async function personNow(env, userId, tz, at = Date.now()) {
  const zone = tz || 'UTC';
  const calendarDay = localDateOf(zone, at);
  const nowMin = minutesIn(zone, at);
  const dayEndHour = await dayEndHourOf(env, userId);
  const today = personDay(calendarDay, nowMin, dayEndHour);
  return { today, calendarDay, nowMin, dayEndHour, late: today !== calendarDay };
}
