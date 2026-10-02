/**
 * Notifications: the worker's own cron, every minute.
 *
 * Every minute: plan changed reminders, queue the ones due within a day, and
 * claim people whose day needs planning. These are a few small reads, so a
 * quiet minute costs nothing in Inngest.
 * At minute 7 of each hour: read Expo receipts, run the watchdog, and check in
 * with Sentry, which alerts if the check in ever stops (the cron died).
 * Once a day: the canary, a silent push to every tester phone.
 */

import { db } from '../context/db';
import { localDateOf, localMinutesOf } from './reminderTimes';
import { planReminders, queueReminders, claimDays, sendEvents } from './planner';
import { settleDueReceipts } from './send';
import { reportProblem, cronCheckIn } from './alert';

export const HOURLY_MONITOR = 'notifications-hourly';
export const HOURLY_SCHEDULE = '7 * * * *';
export const CANARY_UTC = { hour: 15, minute: 7 };
const TEST_EVENT = 'notifications/test.send';

async function safely(env, name, fn, problems) {
  try {
    return await fn();
  } catch (err) {
    problems.push(`${name}: ${err.message}`);
    console.error(`[Notifications] ${name} failed: ${err.message}`);
    return null;
  }
}

/**
 * NOTIFICATIONS_MODE in wrangler.toml: 'off' (nothing runs), 'testers' (only
 * tester accounts get planned and sent), 'on' (everyone). Returns null for
 * everyone, or the set of people allowed.
 */
export async function allowedPeople(env) {
  const mode = String(env.NOTIFICATIONS_MODE || 'off').toLowerCase();
  if (mode === 'on') return null;
  if (mode !== 'testers') return new Set();
  const rows =
    (await db(env).select('cortex_preferences?is_tester=eq.true&select=owner_id&limit=200')) || [];
  return new Set(rows.map((r) => r.owner_id));
}

/** The watchdog: everything that would otherwise fail quietly. */
export async function watchdog(env, { now = new Date(), only = null } = {}) {
  const d = db(env);
  const found = [];

  // a send that never finished
  const stuckBefore = new Date(now.getTime() - 20 * 60000).toISOString();
  const stuck =
    (await d.select(
      `notification_log?status=eq.sending&created_at=lt.${encodeURIComponent(stuckBefore)}&select=id&limit=100`,
    )) || [];
  if (stuck.length) {
    await d.update(`notification_log?id=in.(${stuck.map((s) => s.id).join(',')})`, {
      status: 'failed',
      reason: 'Stuck while sending',
      updated_at: now.toISOString(),
    });
    found.push(`${stuck.length} stuck while sending`);
  }

  // reminders whose time passed without a run waiting for them
  const lateBefore = new Date(now.getTime() - 10 * 60000).toISOString();
  const unqueued = (
    (await d.rpc('reminders_to_queue', { p_until: lateBefore, p_limit: 50 })) || []
  ).filter((r) => !only || only.has(r.user_id));
  if (unqueued.length) found.push(`${unqueued.length} reminders were never queued`);

  // people with a phone who have no plan for today by 6am their time
  const devices =
    (await d.select(
      'push_devices?disabled_at=is.null&expo_token=not.is.null&permission=in.(granted,provisional)&select=user_id&limit=5000',
    )) || [];
  const users = [...new Set(devices.map((x) => x.user_id))].filter((u) => !only || only.has(u));
  if (users.length) {
    const [prefs, eng] = await Promise.all([
      d.select(`notification_preferences?user_id=in.(${users.join(',')})&select=user_id,timezone`),
      d.select(`user_engagement?user_id=in.(${users.join(',')})&select=user_id,plan_date`),
    ]);
    const planOf = new Map((eng || []).map((e) => [e.user_id, e.plan_date]));
    let unplanned = 0;
    for (const p of prefs || []) {
      const tz = p.timezone || 'America/Los_Angeles';
      let today;
      let minutes;
      try {
        today = localDateOf(now, tz);
        minutes = localMinutesOf(now, tz);
      } catch {
        continue;
      }
      if (minutes >= 6 * 60 && planOf.get(p.user_id) !== today) unplanned += 1;
    }
    if (unplanned) found.push(`${unplanned} people have no plan for today`);
  }

  // the words falling back too often
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const sent =
    (await d.select(
      `notification_log?sent_at=gte.${encodeURIComponent(dayAgo)}&model=not.is.null&select=used_fallback&limit=1000`,
    )) || [];
  const fellBack =
    (await d.select(
      `notification_log?sent_at=gte.${encodeURIComponent(dayAgo)}&used_fallback=eq.true&select=id&limit=1000`,
    )) || [];
  if (fellBack.length >= 5 && fellBack.length > 0.3 * (sent.length + fellBack.length)) {
    found.push(`${fellBack.length} fixed lines in a day: the writer is failing`);
  }
  return found;
}

/** The daily canary: one silent push to each tester, which must come back delivered. */
export async function canary(env, { now = new Date(), fetchImpl } = {}) {
  const d = db(env);
  const testers =
    (await d.select('cortex_preferences?is_tester=eq.true&select=owner_id&limit=50')) || [];
  if (!testers.length) return 0;
  const ids = testers.map((t) => t.owner_id);
  const devices =
    (await d.select(
      `push_devices?user_id=in.(${ids.join(',')})&disabled_at=is.null&expo_token=not.is.null&select=user_id&limit=200`,
    )) || [];
  const withPhone = [...new Set(devices.map((x) => x.user_id))];
  const day = now.toISOString().slice(0, 10);
  const events = withPhone.map((u) => ({
    name: TEST_EVENT,
    id: `canary:${u}:${day}`,
    data: { user_id: u, moment: 'canary', dedupe_key: `canary:${u}:${day}` },
  }));
  await sendEvents(env, events, fetchImpl);
  return events.length;
}

/** One run of the minute cron. Never throws: problems go to Sentry. */
export async function runMinute(env, { now = new Date() } = {}) {
  const problems = [];
  const only = await allowedPeople(env);
  if (
    only &&
    only.size === 0 &&
    String(env.NOTIFICATIONS_MODE || 'off').toLowerCase() !== 'testers'
  ) {
    return { off: true, problems };
  }
  const out = {
    reminders: await safely(env, 'plan reminders', () => planReminders(env, { now }), problems),
    queued: await safely(
      env,
      'queue reminders',
      () => queueReminders(env, { now, only }),
      problems,
    ),
    days: await safely(env, 'plan days', () => claimDays(env, { now, only }), problems),
  };

  const hourly = now.getUTCMinutes() === 7;
  if (hourly) {
    await cronCheckIn(env, HOURLY_MONITOR, 'in_progress', HOURLY_SCHEDULE);
    out.receipts = await safely(
      env,
      'receipts',
      () => settleDueReceipts(env, { at: now }),
      problems,
    );
    if (out.receipts && out.receipts.failed >= Math.max(3, out.receipts.checked / 2)) {
      problems.push(`${out.receipts.failed} of ${out.receipts.checked} were not delivered`);
    }
    const found = await safely(env, 'watchdog', () => watchdog(env, { now, only }), problems);
    if (found?.length) problems.push(...found);
    if (now.getUTCHours() === CANARY_UTC.hour) {
      out.canary = await safely(env, 'canary', () => canary(env, { now }), problems);
    }
  }

  // a lasting fault is reported every ten minutes, not every minute
  if (problems.length && (hourly || now.getUTCMinutes() % 10 === 0)) {
    await reportProblem(env, {
      title: `Notifications: ${problems[0]}`,
      level: 'error',
      extra: { problems, at: now.toISOString() },
    });
  }
  if (hourly)
    await cronCheckIn(env, HOURLY_MONITOR, problems.length ? 'error' : 'ok', HOURLY_SCHEDULE);
  return { ...out, problems };
}
