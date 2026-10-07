/**
 * The settings a person's week runs on, kept with their notification
 * settings: their weekly day, their days off and the time of their weekly
 * slot. One read, for the pipe, the read and the weekly synthesis.
 */

import { db } from '../context/db';
import { daysOffOf, weeklyDayOf } from '../../shared/week.js';

/** The weekly slot when none is kept: 6pm, the column's own default. */
export const DEFAULT_WEEKLY_TIME = '18:00';

/** Where a person is when nothing says: the fallback the database functions use. */
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/** The hour of a weekly slot ("18:00" gives 18). The summary goes out on the hour, so the minutes are not used. */
export function slotHour(weeklyTime) {
  const hour = Number(String(weeklyTime || DEFAULT_WEEKLY_TIME).split(':')[0]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : slotHour(DEFAULT_WEEKLY_TIME);
}

/**
 * Their weekly day (0 Sunday to 6 Saturday), days off and weekly slot, with
 * the defaults for anything not set: Sunday, Saturday and Sunday, 6pm.
 */
export async function weekSettings(env, userId) {
  const rows = await db(env).select(
    `notification_preferences?user_id=eq.${userId}&select=weekly_day,days_off,weekly_time&limit=1`,
  );
  const r = rows?.[0] || {};
  return {
    weekly_day: weeklyDayOf(r.weekly_day),
    days_off: daysOffOf(r.days_off),
    weekly_time: r.weekly_time || DEFAULT_WEEKLY_TIME,
  };
}
