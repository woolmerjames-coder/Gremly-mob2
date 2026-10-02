/**
 * Notifications: planning.
 *
 * The worker's own cron (every minute, free on Cloudflare) does the cheap
 * part: it finds reminders that need a fire time, queues the ones due within a
 * day, and claims people whose day needs planning. Inngest only runs when a
 * notification is actually due or a day is actually being planned, so quiet
 * minutes cost nothing.
 *
 *   planReminders  work out next_fire_at for changed or just fired reminders
 *   queueReminders send a notifications/send.due event for each one due soon
 *   claimDays      send a notifications/plan.day event per person to plan
 *   planPersonDay  (inside Inngest) learn from yesterday, then plan today
 */

import { db } from '../context/db';
import { nextFireAt, zonedTimeToUtc, localDateOf, localMinutesOf } from './reminderTimes';
import { planDay, dedupeKey, outcomeOf, nextStreak, bestMinutes, clock } from './policy';

export const SEND_EVENT = 'notifications/send.due';
export const PLAN_EVENT = 'notifications/plan.day';
export const CANCEL_EVENT = 'notifications/cancel';
const QUEUE_AHEAD_HOURS = 26;
const DAY_MS = 86400000;

const hhmm = (m) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const inList = (ids) => `in.(${[...new Set(ids)].join(',')})`;

/** Sends events to Inngest by HTTP (env bindings are not available to inngest.send here). */
export async function sendEvents(env, events, fetchImpl = fetch) {
  if (!events.length) return 0;
  if (!env.INNGEST_EVENT_KEY) throw new Error('INNGEST_EVENT_KEY is not set');
  for (let i = 0; i < events.length; i += 100) {
    const res = await fetchImpl(`https://inn.gs/e/${env.INNGEST_EVENT_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events.slice(i, i + 100)),
    });
    if (!res.ok)
      throw new Error(`Inngest event send ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return events.length;
}

async function timezones(env, userIds) {
  if (!userIds.length) return new Map();
  const rows = await db(env).select(
    `notification_preferences?user_id=${inList(userIds)}&select=user_id,timezone`,
  );
  return new Map((rows || []).map((r) => [r.user_id, r.timezone || 'America/Los_Angeles']));
}

/** Event start for "before it starts" reminders (events are notes with subtype event). */
async function eventStarts(env, rows) {
  const ids = rows
    .filter((r) => r.rule?.kind === 'before' && r.entity_type === 'note')
    .map((r) => r.entity_id);
  if (!ids.length) return new Map();
  const notes = await db(env).select(`notes?id=${inList(ids)}&select=id,target_date,event_time`);
  return new Map(
    (notes || []).map((n) => [
      n.id,
      { date: n.target_date, time: n.event_time ? String(n.event_time).slice(0, 5) : null },
    ]),
  );
}

/** Works out when each changed or just fired reminder goes next. */
export async function planReminders(env, { now = new Date() } = {}) {
  const d = db(env);
  const rows =
    (await d.select(
      'reminder_schedule?status=eq.active&planned_at=is.null&select=id,user_id,entity_type,entity_id,reminder_id,rule&limit=300',
    )) || [];
  if (!rows.length) return { planned: 0 };
  const [tzs, starts] = await Promise.all([
    timezones(
      env,
      rows.map((r) => r.user_id),
    ),
    eventStarts(env, rows),
  ]);
  let planned = 0;
  for (const r of rows) {
    const tz = tzs.get(r.user_id) || 'America/Los_Angeles';
    let next = null;
    try {
      next = nextFireAt(r.rule, { tz, now, eventStart: starts.get(r.entity_id) });
    } catch (err) {
      console.warn(
        `[Notifications] reminder ${r.id} has a rule that cannot be read: ${err.message}`,
      );
    }
    await d.update(`reminder_schedule?id=eq.${r.id}&planned_at=is.null`, {
      next_fire_at: next ? next.toISOString() : null,
      planned_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    planned += 1;
  }
  return { planned };
}

/**
 * Whether a reminder, as it is now, still fires at `plannedFor`. A send checks
 * this when it wakes: the item may have been edited after its run was queued,
 * and the schedule row may not have been worked out again yet (next_fire_at is
 * null until the next minute). Same sum and time zone as planReminders.
 */
export async function reminderStillFiresAt(env, row, timezone, plannedFor) {
  const at = Date.parse(plannedFor);
  if (!row?.rule || Number.isNaN(at)) return false;
  const tz = timezone || 'America/Los_Angeles';
  const starts = await eventStarts(env, [row]);
  try {
    const next = nextFireAt(row.rule, {
      tz,
      now: new Date(at - 60000),
      eventStart: starts.get(row.entity_id),
    });
    return !!next && Math.abs(next.getTime() - at) <= 60000;
  } catch {
    return false;
  }
}

/** The send event for one reminder at its next fire time. */
export function reminderEvent(row, tz) {
  const at = new Date(row.next_fire_at);
  const subject = `${row.entity_type}:${row.entity_id}:${row.reminder_id}`;
  const key = dedupeKey({
    userId: row.user_id,
    moment: 'reminder',
    subject,
    localDate: localDateOf(at, tz),
    slot: hhmm(localMinutesOf(at, tz)),
  });
  return {
    name: SEND_EVENT,
    id: key,
    data: {
      user_id: row.user_id,
      moment: 'reminder',
      subject,
      subject_type: row.entity_type,
      dedupe_key: key,
      planned_for: at.toISOString(),
      data: { rule: row.rule },
    },
  };
}

/** Queues every reminder due within the next day that no run is waiting for. */
export async function queueReminders(env, { now = new Date(), fetchImpl, only = null } = {}) {
  const d = db(env);
  const until = new Date(now.getTime() + QUEUE_AHEAD_HOURS * 3600000).toISOString();
  // `only` (testers mode) filters the function's rows in PostgREST
  const fn = only
    ? `reminders_to_queue?user_id=${inList(only.size ? [...only] : ['00000000-0000-0000-0000-000000000000'])}`
    : 'reminders_to_queue';
  const rows = (await d.rpc(fn, { p_until: until, p_limit: 200 })) || [];
  if (!rows.length) return { queued: 0 };
  const tzs = await timezones(
    env,
    rows.map((r) => r.user_id),
  );
  const events = rows.map((r) => reminderEvent(r, tzs.get(r.user_id) || 'America/Los_Angeles'));
  // the event id is the duplicate key, so a resend after a failed update is dropped by Inngest
  await sendEvents(env, events, fetchImpl);
  for (const r of rows) {
    await d.update(
      `reminder_schedule?id=eq.${r.id}&next_fire_at=eq.${encodeURIComponent(r.next_fire_at)}`,
      { queued_for: r.next_fire_at, updated_at: now.toISOString() },
    );
  }
  return { queued: rows.length };
}

/** After a reminder's run finishes, its next occurrence gets planned. */
export async function rollReminder(env, job) {
  const [type, id, reminderId] = String(job.subject || '').split(':');
  if (!type || !id || !reminderId || !job.planned_for) return;
  await db(env).update(
    `reminder_schedule?entity_type=eq.${type}&entity_id=eq.${id}&reminder_id=eq.${encodeURIComponent(reminderId)}&queued_for=eq.${encodeURIComponent(job.planned_for)}`,
    {
      planned_at: null,
      last_fired_at: job.sent ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    },
  );
}

/** Claims people whose day needs planning and sends one plan event each. */
export async function claimDays(env, { now = new Date(), fetchImpl, only = null } = {}) {
  const d = db(env);
  const claimed = (await d.rpc('claim_days_to_plan', { p_limit: 100 })) || [];
  // testers mode: everyone else is marked planned for today without a plan
  const rows = only ? claimed.filter((r) => only.has(r.user_id)) : claimed;
  if (!rows.length) return { days: 0 };
  const events = rows.map((r) => ({
    name: PLAN_EVENT,
    // a settings change plans the same day again, so it needs its own id
    id: `plan:${r.user_id}:${r.local_date}${r.settings_changed ? `:${now.getTime()}` : ''}`,
    data: {
      user_id: r.user_id,
      timezone: r.timezone,
      local_date: r.local_date,
      replan: !!r.settings_changed,
    },
  }));
  try {
    await sendEvents(env, events, fetchImpl);
  } catch (err) {
    // give them back, so the next minute tries again
    await d.update(`user_engagement?user_id=${inList(rows.map((r) => r.user_id))}`, {
      plan_date: null,
    });
    throw err;
  }
  return { days: rows.length };
}

// ─── Planning one person's day ──────────────────────────────────────────────

const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);

/**
 * When to check in on a habit today: an hour after the time they set for it,
 * on a day it is due, unless it already has its own reminder. Habit logs carry
 * no time of day, so the set time is the only honest signal. Null for no check in.
 */
export function habitCheckinMinutes(habit, { tz, localDate }) {
  if (!habit?.scheduled_start_iso) return null;
  if (Array.isArray(habit.reminders_json) && habit.reminders_json.length) return null;
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const due =
    habit.cadence === 'daily' ||
    (Array.isArray(habit.days_active) && habit.days_active.includes(weekday));
  if (!due) return null;
  return localMinutesOf(new Date(habit.scheduled_start_iso), tz);
}

/**
 * Learns from notifications whose two hour window has closed: each gets an
 * outcome, the miss streak per moment moves, and the angle's score updates.
 * Pure: returns the log patches and the new engagement fields.
 */
export function learn({ logs, activities, engagement, now }) {
  const streaks = { ...(engagement?.miss_streaks || {}) };
  const angles = JSON.parse(JSON.stringify(engagement?.angle_stats || {}));
  const patches = [];
  const ordered = [...(logs || [])].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  for (const l of ordered) {
    const outcome = outcomeOf({
      moment: l.moment,
      sentAt: l.sent_at,
      openedAt: l.opened_at,
      activities,
      now,
      subject: l.subject_id,
    });
    if (!outcome) continue;
    patches.push({ id: l.id, outcome });
    streaks[l.moment] = nextStreak(streaks[l.moment], outcome);
    if (l.angle) {
      const m = (angles[l.moment] = angles[l.moment] || {});
      const a = (m[l.angle] = m[l.angle] || { s: 0, n: 0 });
      a.s += outcome === 'succeeded' ? 1 : 0;
      a.n += 1;
    }
  }
  return { patches, missStreaks: streaks, angleStats: angles };
}

/**
 * Today's plan as Inngest events, from loaded facts. Pure, so tests and the
 * simulator run exactly what production runs.
 */
export function buildDayPlan({
  userId,
  tz,
  localDate,
  now,
  prefs,
  engagement,
  daysAway,
  firstDayBack,
  facts,
  bestHours,
}) {
  const dayIndex = Math.floor(Date.parse(`${localDate}T12:00:00Z`) / DAY_MS);
  const result = planDay({
    prefs,
    daysAway,
    firstDayBack,
    dayIndex,
    missStreaks: engagement?.miss_streaks || {},
    pausedMoments: engagement?.paused_moments || {},
    bestMinutes: bestHours,
    facts,
  });
  const events = [];
  const items = [];
  for (const p of result.plan) {
    const at = zonedTimeToUtc(localDate, hhmm(p.atMinutes), tz);
    if (at.getTime() <= now.getTime()) {
      result.skipped.push({
        moment: p.moment,
        subject: p.subject,
        reason: `Its time, ${clock(p.atMinutes)}, had passed`,
      });
      continue;
    }
    const key = dedupeKey({
      userId,
      moment: p.moment,
      subject: p.subject || '',
      localDate,
      slot: hhmm(p.atMinutes),
    });
    items.push({ moment: p.moment, subject: p.subject || null, at: at.toISOString(), key });
    events.push({
      name: SEND_EVENT,
      id: key,
      data: {
        user_id: userId,
        moment: p.moment,
        subject: p.subject || null,
        subject_type: p.moment === 'habit_checkin' ? 'habit' : null,
        dedupe_key: key,
        planned_for: at.toISOString(),
        data: {
          lastNote: !!p.lastNote,
          reason: p.reason || null,
          changeAngle: !!p.changeAngle,
          habitTitle: p.habitTitle || null,
        },
      },
    });
  }
  return { state: result.state, limit: result.limit, items, events, skipped: result.skipped };
}

/** Everything planPersonDay needs, read in one go. */
async function loadDay(env, userId, tz, localDate, now) {
  const d = db(env);
  const since28 = new Date(now.getTime() - 28 * DAY_MS).toISOString();
  const since3 = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  const [prefsRows, engRows, cortexRows, opens, habits, progress, logs, sweeps] = await Promise.all(
    [
      d.select(`notification_preferences?user_id=eq.${userId}&select=*`),
      d.select(`user_engagement?user_id=eq.${userId}&select=*`),
      d.select(`cortex_preferences?owner_id=eq.${userId}&select=gremly_age,day_boundary_hour`),
      d.select(
        `app_events?user_id=eq.${userId}&kind=eq.app_open&occurred_at=gte.${encodeURIComponent(since28)}&select=occurred_at&order=occurred_at.desc&limit=500`,
      ),
      d.select(
        `habits?owner_id=eq.${userId}&archived=eq.false&completed_at=is.null&select=id,name,title,cadence,days_active,scheduled_start_iso,reminders_json&limit=50`,
      ),
      d.select(
        `habit_progress?owner_id=eq.${userId}&occurred_at=gte.${encodeURIComponent(since28)}&select=habit_id,occurred_at,occurred_day&limit=2000`,
      ),
      d.select(
        `notification_log?user_id=eq.${userId}&status=in.(sent,delivered)&outcome=is.null&is_test=eq.false&sent_at=gte.${encodeURIComponent(since3)}&select=id,moment,subject_id,angle,sent_at,opened_at&limit=100`,
      ),
      d.select(
        `events?owner_id=eq.${userId}&kind=eq.sweep_completed&created_at=gte.${encodeURIComponent(since3)}&select=created_at&limit=50`,
      ),
    ],
  );
  const lastEvent =
    (
      await d.select(
        `app_events?user_id=eq.${userId}&kind=eq.app_open&select=occurred_at&order=occurred_at.desc&limit=1`,
      )
    )?.[0]?.occurred_at || null;
  // the app's heartbeat covers opens from before app_events existed
  const heartbeat = prefsRows?.[0]?.last_app_active_at || null;
  const lastOpen = [lastEvent, heartbeat].filter(Boolean).sort().at(-1) || null;
  return {
    prefs: prefsRows?.[0] || null,
    engagement: engRows?.[0] || null,
    cortex: cortexRows?.[0] || {},
    opens: opens || [],
    habits: habits || [],
    progress: progress || [],
    logs: logs || [],
    sweeps: sweeps || [],
    lastOpen,
  };
}

/**
 * Plans one person's day: learn from what was sent, update how engaged they
 * are, then plan today. Returns the events to send and what was stored.
 */
export async function planPersonDay(
  env,
  { user_id: userId, timezone, local_date: localDate },
  { now = new Date() } = {},
) {
  const tz = timezone || 'America/Los_Angeles';
  const x = await loadDay(env, userId, tz, localDate, now);
  if (!x.prefs) return { events: [], cancels: [], skipped: 'no settings' };

  // what they did, for outcomes
  const activities = [
    ...x.opens.map((o) => ({ kind: 'app_open', at: o.occurred_at })),
    ...x.sweeps.map((s) => ({ kind: 'sweep', at: s.created_at })),
    ...x.progress.map((p) => ({ kind: 'habit_logged', at: p.occurred_at, subject: p.habit_id })),
  ];
  const learned = learn({ logs: x.logs, activities, engagement: x.engagement, now });

  const lastOpenDate = x.lastOpen ? localDateOf(new Date(x.lastOpen), tz) : null;
  const daysAway = lastOpenDate ? Math.max(0, daysBetween(lastOpenDate, localDate)) : 0;
  const before = x.engagement?.state || 'engaged';
  const wasAway = before === 'lapsed' || before === 'resting';
  const firstDayBack = (wasAway && daysAway <= 1) || x.engagement?.back_on === localDate;

  const opensForHours = x.opens.map((o) => ({
    date: localDateOf(new Date(o.occurred_at), tz),
    minutes: localMinutesOf(new Date(o.occurred_at), tz),
  }));
  const bestHours = bestMinutes(opensForHours);

  const byHabit = new Map();
  for (const p of x.progress) {
    if (!byHabit.has(p.habit_id)) byHabit.set(p.habit_id, []);
    byHabit.get(p.habit_id).push(p);
  }
  const facts = {
    briefExpected: (x.cortex.gremly_age ?? 0) >= 1,
    habits: x.habits.map((h) => ({
      id: h.id,
      title: h.name || h.title || null,
      // planDay checks in an hour after usualMinutes, so it gets the set time
      usualMinutes: habitCheckinMinutes(h, { tz, localDate }),
      loggedToday: (byHabit.get(h.id) || []).some((l) => l.occurred_day === localDate),
    })),
    goodNews: [],
    // Gremly not fed yet is the everyday reason for a note; the sender checks it is still true
    nudgeReasons: [{ kind: 'unfed', weight: 1 }],
  };

  const plan = buildDayPlan({
    userId,
    tz,
    localDate,
    now,
    prefs: x.prefs,
    engagement: { ...(x.engagement || {}), miss_streaks: learned.missStreaks },
    daysAway,
    firstDayBack,
    facts,
    bestHours,
  });
  for (const e of plan.events) {
    if (e.data.moment === 'habit_checkin') {
      e.data.data.habitTitle = facts.habits.find((h) => h.id === e.data.subject)?.title || null;
    }
  }

  // notifications planned earlier today that are no longer in the plan are cancelled
  const previous = x.engagement?.plan?.date === localDate ? x.engagement.plan.items || [] : [];
  const keep = new Set(plan.items.map((i) => i.key));
  const cancels = previous
    .filter((i) => !keep.has(i.key) && Date.parse(i.at) > now.getTime())
    .map((i) => ({ name: CANCEL_EVENT, data: { dedupe_key: i.key } }));

  const d = db(env);
  for (const p of learned.patches) {
    await d.update(`notification_log?id=eq.${p.id}&outcome=is.null`, {
      outcome: p.outcome,
      outcome_at: now.toISOString(),
    });
  }
  const state = plan.state;
  await d.upsert(
    'user_engagement',
    [
      {
        user_id: userId,
        state,
        state_since:
          state !== before ? now.toISOString() : x.engagement?.state_since || now.toISOString(),
        last_open_at: x.lastOpen,
        days_away: daysAway,
        miss_streaks: learned.missStreaks,
        angle_stats: learned.angleStats,
        best_hours: bestHours,
        back_on: firstDayBack ? localDate : x.engagement?.back_on || null,
        plan_date: localDate,
        plan: {
          date: localDate,
          items: plan.items,
          skipped: plan.skipped.slice(0, 30),
          limit: plan.limit,
          state,
        },
        updated_at: now.toISOString(),
      },
    ],
    'user_id',
  );
  return {
    events: plan.events,
    cancels,
    state,
    daysAway,
    planned: plan.items.length,
    skipped: plan.skipped.length,
  };
}

export const _internals = { hhmm, daysBetween, QUEUE_AHEAD_HOURS };
