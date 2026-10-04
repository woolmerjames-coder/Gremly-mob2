/**
 * Notifications: one notification, from waking up to the receipt.
 *
 * The Inngest send function calls these in order, each inside its own step:
 *   decide()  live facts and the policy's last check
 *   claim()   budget, spacing and the duplicate check in the database
 *   compose() the words and the route
 *   push()    Expo, every healthy device, tickets read one by one
 * and the receipt function calls settleReceipts() 15 minutes later.
 * Every outcome lands in notification_log with its reason in plain words.
 */

import { db, localDate, userTimezone } from '../context/db';
import { gatherBrief, minutesIn, ritualDayFor, localStartIso } from '../brief/data';
import { writeDailyBrief } from '../brief/index';
import {
  POLICY,
  MOMENTS,
  ANGLES,
  decideAtSend,
  interruptionFor,
  engagementState,
  dailyLimit,
  chooseAngle,
  clock,
  dedupeKey,
} from './policy';
import { writeCopy, reminderCopy, clearNightCopy } from './copy';
import { dayEndHourFrom, EVENING_START_HOUR } from '../../shared/day.js';
import { buildMessage, sendToExpo, getReceipts, DEAD_DEVICE_ERRORS, ALERT_ERRORS } from './expo';
import { reportProblem } from './alert';
import { reminderStillFiresAt } from './planner';
import { sweepCounts } from './sweepCount';

/** iOS action button sets, matching the categories the app registers. */
export const CATEGORY = Object.freeze({
  reminder: 'GREMLY_REMINDER',
  brief: 'GREMLY_BRIEF',
  sweep: 'GREMLY_SWEEP',
  habit_checkin: 'GREMLY_HABIT',
});

/** The daily self test that proves the whole path, from Inngest to a phone. */
export const CANARY_WORDS = Object.freeze({
  title: 'Gremly check',
  body: 'Notifications are working. This one is just for you.',
});

/** Where a tap goes. The app has one router for these. */
export function routeFor(moment, subject) {
  switch (moment) {
    case 'brief':
      return 'brief';
    case 'sweep':
      return 'sweep';
    case 'habit_checkin':
      return `habit/${subject}`;
    case 'reminder': {
      const [type, id] = String(subject || '').split(':');
      return `item/${type}/${id}`;
    }
    case 'good_news':
      return String(subject || '').startsWith('weekly_summary') ? 'summary' : 'home';
    default:
      return 'drop';
  }
}

const latest = (...isos) => isos.filter(Boolean).sort().at(-1) || null;
const minutesSince = (iso, at) =>
  iso ? Math.floor((at.getTime() - new Date(iso).getTime()) / 60000) : null;

/** The phones that can receive right now, with their tokens. Read again just before sending. */
export async function loadDevices(env, userId) {
  return (
    (await db(env).select(
      `push_devices?user_id=eq.${userId}&disabled_at=is.null&expo_token=not.is.null&permission=in.(granted,provisional)&select=id,expo_token,time_sensitive,environment,permission`,
    )) || []
  );
}

/** The person without push tokens, for step results that Inngest stores. */
export function publicPerson(person) {
  if (!person) return person;
  return { ...person, devices: (person.devices || []).map(({ expo_token, ...rest }) => rest) };
}

/** How late each moment may still go. A later wake means the scheduler was in trouble. */
export const LATE_LIMIT_MINUTES = Object.freeze({
  reminder: 30,
  brief: 90,
  sweep: 90,
  habit_checkin: 90,
  nudge: 120,
  good_news: 240,
  return_note: 240,
  canary: 60,
});

/**
 * Null when on time, or the reason it is too late to send. Minutes it was held
 * on purpose (in the app, in a meeting) are not lateness.
 */
export function tooLate(job, at = new Date(), heldSoFar = 0) {
  if (!job.planned_for || job.test) return null;
  const late = Math.floor((at.getTime() - Date.parse(job.planned_for)) / 60000) - heldSoFar;
  const limit = LATE_LIMIT_MINUTES[job.moment] ?? 60;
  return late > limit ? `Woke ${late} minutes after the planned time` : null;
}

/** Everything about the person the send needs, read fresh. */
export async function loadPerson(env, userId, at = new Date()) {
  const d = db(env);
  const [prefsRows, devices, engRows, cortexRows, opens] = await Promise.all([
    d.select(`notification_preferences?user_id=eq.${userId}&select=*`),
    loadDevices(env, userId),
    d.select(`user_engagement?user_id=eq.${userId}&select=*`),
    d.select(
      `cortex_preferences?owner_id=eq.${userId}&select=day_boundary_hour,gremly_age,fed_days_count,is_tester`,
    ),
    d.select(
      `app_events?user_id=eq.${userId}&kind=eq.app_open&select=occurred_at&order=occurred_at.desc&limit=1`,
    ),
  ]);
  const prefs = prefsRows?.[0] || null;
  const tz = prefs?.timezone || (await userTimezone(env, userId));
  const cortex = cortexRows?.[0] || {};
  const nowMinutes = minutesIn(tz, at);
  const today = localDate(tz, at);
  const engagement = engRows?.[0] || null;
  return {
    userId,
    tz,
    prefs,
    devices: devices || [],
    engagement,
    state: engagement?.state || engagementState(engagement?.days_away ?? 0),
    cortex,
    nowMinutes,
    today,
    ritualDay: ritualDayFor(today, nowMinutes, dayEndHourFrom(cortex.day_boundary_hour)),
    lastOpenAt: latest(opens?.[0]?.occurred_at, prefs?.last_app_active_at),
  };
}

/** When the person's day started: their day end hour on their day, as a UTC time. */
export function dayStartIso(person) {
  const midnight = Date.parse(localStartIso(person.tz, person.ritualDay));
  const hour = dayEndHourFrom(person.cortex?.day_boundary_hour);
  return new Date(midnight + hour * 3600000).toISOString();
}

/**
 * The wrap up was last touched in the evening (or after midnight, before
 * their day ends), not earlier in the day. The app's touchedTonight
 * (lib/wrapup/teaser.ts). With no time on it, it counts as seen.
 */
export function touchedTonight(sweep, tz, dayEndHour) {
  const at = sweep?.touched_at || sweep?.started_at;
  if (!at) return true;
  const minutes = minutesIn(tz, at);
  return minutes >= EVENING_START_HOUR * 60 || minutes < dayEndHour * 60;
}

/** Is the reason for this notification still true? Returns { ok, reason, facts }. */
export async function stillTrue(env, person, job, at = new Date()) {
  const d = db(env);
  const { userId: uid, tz, ritualDay } = person;
  switch (job.moment) {
    case 'brief': {
      const read = async () =>
        (
          await d.select(
            `scope_chats?user_id=eq.${uid}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=id,metadata_json&limit=1`,
          )
        )?.[0] || null;
      let thread = await read();
      if (thread?.metadata_json?.seen_at)
        return { ok: false, reason: 'They had already read today’s brief' };
      if (!thread?.metadata_json?.brief_written_at) {
        // the scheduled write failed or was missed: write it now, so the push never opens an empty thread
        const result = await writeDailyBrief(env, uid, { reason: 'scheduled', at });
        if (result?.skipped === 'new user')
          return { ok: false, reason: 'The brief starts on their second day' };
        thread = await read();
      }
      if (!thread?.metadata_json?.brief_written_at)
        return { ok: false, reason: 'No brief was written today', problem: true };
      if (thread.metadata_json.seen_at)
        return { ok: false, reason: 'They had already read today’s brief' };
      return { ok: true };
    }
    case 'sweep': {
      // "Already swept" counts from when their day started, not from midnight:
      // a wrap up finished at 12:30am belongs to the evening before, and must
      // not cancel tonight's
      const swept = await d.select(
        `events?owner_id=eq.${uid}&kind=eq.sweep_completed&created_at=gte.${encodeURIComponent(dayStartIso(person))}&select=created_at&order=created_at.desc&limit=1`,
      );
      if (swept?.length)
        return { ok: false, reason: `They swept at ${clock(minutesIn(tz, swept[0].created_at))}` };
      // The wrap up lives in today's thread. Once it has been opened there in
      // the evening (started, part way, or Not tonight) they have seen it: no
      // nudge after. It can be started at any hour, and one opened or turned
      // down earlier in the day says nothing about tonight: the nudge still goes.
      const [thread] =
        (await d.select(
          `scope_chats?user_id=eq.${uid}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=sweep:metadata_json->sweep&limit=1`,
        )) || [];
      const sweep = thread?.sweep;
      const dayEndHour = dayEndHourFrom(person.cortex?.day_boundary_hour);
      if (sweep?.step && touchedTonight(sweep, tz, dayEndHour)) {
        if (sweep.step === 'declined') return { ok: false, reason: 'They said not tonight' };
        return { ok: false, reason: 'They had already opened the wrap up' };
      }
      return { ok: true };
    }
    case 'habit_checkin': {
      const [habit] =
        (await d.select(`habits?id=eq.${job.subject}&owner_id=eq.${uid}&select=id,archived`)) || [];
      if (!habit || habit.archived) return { ok: false, reason: 'The habit is no longer active' };
      const logged = await d.select(
        `habit_progress?owner_id=eq.${uid}&habit_id=eq.${job.subject}&occurred_day=eq.${ritualDay}&select=id&limit=1`,
      );
      if (logged?.length) return { ok: false, reason: 'Already logged today' };
      return { ok: true };
    }
    case 'reminder': {
      const [type, id, reminderId] = String(job.subject || '').split(':');
      const [row] =
        (await d.select(
          `reminder_schedule?entity_type=eq.${type}&entity_id=eq.${id}&reminder_id=eq.${encodeURIComponent(reminderId)}&select=status,rule,entity_type,entity_id`,
        )) || [];
      if (!row) return { ok: false, reason: 'The reminder was removed' };
      if (row.status === 'closed') return { ok: false, reason: 'Already done' };
      if (row.status === 'removed') return { ok: false, reason: 'The reminder was removed' };
      // The item may have been edited after this run was queued, even in the
      // minute before its schedule is worked out again. The reminder as it is
      // now must still fall at this time; a new time gets its own run.
      if (
        job.planned_for &&
        !(await reminderStillFiresAt(env, row, person.prefs?.timezone, job.planned_for))
      ) {
        return { ok: false, reason: 'The reminder moved to another time' };
      }
      // a habit already logged today needs no reminder
      if (type === 'habit') {
        const logged = await d.select(
          `habit_progress?owner_id=eq.${uid}&habit_id=eq.${id}&occurred_day=eq.${ritualDay}&select=id&limit=1`,
        );
        if (logged?.length) return { ok: false, reason: 'Already logged today' };
      }
      return { ok: true };
    }
    case 'nudge': {
      if (job.data?.reason?.kind === 'unfed') {
        const [day] =
          (await d.select(
            `daily_ritual_progress?owner_id=eq.${uid}&ritual_day=eq.${ritualDay}&select=is_fed`,
          )) || [];
        if (day?.is_fed) return { ok: false, reason: 'Gremly was already fed today' };
      }
      return { ok: true };
    }
    case 'return_note': {
      const since = minutesSince(person.lastOpenAt, at);
      if (since != null && since < 24 * 60) return { ok: false, reason: 'They came back' };
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

/**
 * Live facts plus the policy's last check.
 * @returns {{action: 'send'|'hold'|'drop', minutes?, reason?, person, facts?}}
 */
export async function decide(env, job, { at = new Date(), heldSoFar = 0 } = {}) {
  const person = await loadPerson(env, job.user_id, at);
  if (!person.prefs)
    return { action: 'drop', reason: 'No notification settings for this person', person };
  const mode = String(env.NOTIFICATIONS_MODE || 'off').toLowerCase();
  if (!job.test && mode === 'off') {
    return { action: 'drop', reason: 'Notifications are switched off on the server', person };
  }
  if (!job.test && mode === 'testers' && !person.cortex?.is_tester) {
    return { action: 'drop', reason: 'Only testers get notifications for now', person };
  }
  const late = tooLate(job, at, heldSoFar);
  if (late) {
    await reportProblem(env, {
      title: `Notifications: a ${job.moment} woke too late`,
      level: 'warning',
      tags: { moment: job.moment },
      extra: { reason: late, planned_for: job.planned_for },
    });
    return { action: 'drop', reason: late, person };
  }
  const check = job.test ? { ok: true } : await stillTrue(env, person, job, at);
  if (check.problem) {
    await reportProblem(env, {
      title: `Notifications: ${check.reason}`,
      level: 'warning',
      tags: { moment: job.moment },
      extra: { user: job.user_id },
    });
  }

  let meetingEndsInMinutes = null;
  let g = null;
  const wantsDay = ['brief', 'sweep', 'nudge', 'habit_checkin', 'good_news'].includes(job.moment);
  if (
    wantsDay &&
    (job.moment === 'brief' ||
      job.moment === 'sweep' ||
      ['engaged', 'drifting'].includes(person.state))
  ) {
    g = await gatherBrief(env, job.user_id, { at }).catch(() => null);
    if (g && (!g.sweep || (job.moment === 'sweep' && !Number.isFinite(g.sweep.evening)))) {
      // counted by the app's own Sweep rules; null (no number at all) if it fails
      g.sweep = await sweepCounts(env, job.user_id, {
        today: person.today,
        tz: person.tz,
        day: person.ritualDay,
      }).catch(() => null);
    }
    const now = g?.now ?? person.nowMinutes;
    const current = (g?.meetings || []).find((m) => m.start <= now && now < m.end);
    if (current) meetingEndsInMinutes = current.end - now;
  }

  const pausedUntil =
    person.prefs.paused_until && new Date(person.prefs.paused_until) > at
      ? person.prefs.paused_until
      : null;
  const verdict = job.test
    ? person.devices.length
      ? { action: 'send' }
      : { action: 'drop', reason: 'No phone can receive notifications' }
    : decideAtSend({
        moment: job.moment,
        nowMinutes: person.nowMinutes,
        prefs: person.prefs,
        healthyDevices: person.devices.length,
        pausedUntilLabel: pausedUntil
          ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: person.tz }).format(
              new Date(pausedUntil),
            )
          : null,
        stillTrue: check,
        minutesSinceOpen: minutesSince(person.lastOpenAt, at),
        heldSoFar,
        meetingEndsInMinutes: job.moment === 'reminder' ? null : meetingEndsInMinutes,
      });
  return { ...verdict, person, facts: g ? briefFacts(g, job.moment) : null };
}

/** The Sweep number for a moment; left out, not guessed, when the count failed. */
function sweepFact(g, moment) {
  const n = moment === 'sweep' ? (g.sweep?.evening ?? g.sweep?.all) : g.sweep?.quick;
  return Number.isFinite(n) ? { waiting_in_sweep: n } : {};
}

/**
 * What a notification may say about the day. The Sweep number is the one the
 * person will see on tapping: the evening wrap up's cards for the Sweep
 * reminder, the quick sweep (what still needs a decision) for every other
 * moment.
 */
export function briefFacts(g, moment) {
  const titles = (list) =>
    (list || [])
      .slice(0, 2)
      .map((t) => t.title)
      .filter(Boolean);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${g.ritualDay}T12:00:00Z`),
    ),
    part_of_day: g.part,
    meetings_today: (g.meetings || []).length,
    first_meeting: g.meetings?.[0] ? clock(g.meetings[0].start) : null,
    due_today: (g.todosDue || []).length,
    due_today_titles: titles(g.todosDue),
    habits_today: (g.habitsForToday || []).length,
    // a trip, an event or an occasion dated today
    dated_today: (g.anchors || [])
      .filter((a) => a.date === g.today && (a.short_label || a.label))
      .slice(0, 2)
      .map((a) => a.short_label || a.label),
    // travel today, from the day record: what it is and when they set off
    ...(g.day?.travel
      ? {
          travel_today: {
            what: g.day.travel.label || 'travelling',
            sets_off: Number.isFinite(g.day.travel.departs) ? clock(g.day.travel.departs) : null,
          },
        }
      : {}),
    // left out, not guessed, when the count failed
    ...sweepFact(g, moment),
    gremly_age: g.gremlyAge ?? null,
  };
}

/** Writes a decision that did not become a send. Ignores a duplicate. */
export async function logSkip(env, job, person, status, reason) {
  const d = db(env);
  const row = {
    user_id: job.user_id,
    moment: job.moment,
    subject_type: job.subject_type || null,
    subject_id: job.subject || null,
    local_date: person?.today || new Date().toISOString().slice(0, 10),
    dedupe_key: job.dedupe_key,
    planned_for: job.planned_for || null,
    status,
    reason,
    is_test: !!job.test,
    counts_toward_budget: !job.test && (MOMENTS[job.moment]?.counts ?? false),
  };
  try {
    await d.insertQuiet('notification_log?on_conflict=dedupe_key', [row]);
  } catch (err) {
    if (!String(err.message).includes('409') && !String(err.message).includes('duplicate'))
      throw err;
  }
}

/** Budget, spacing and duplicates, atomically. */
export async function claim(env, job, person) {
  const def = MOMENTS[job.moment] || { counts: false };
  // back_on is the local date they came back after being away; that day gets one
  const firstDayBack = !!person.engagement?.back_on && person.engagement.back_on === person.today;
  const limit = dailyLimit(person.state, { firstDayBack });
  const rows = await db(env).rpc('claim_send', {
    p_user: job.user_id,
    p_moment: job.moment,
    p_dedupe_key: job.dedupe_key,
    p_local_date: person.today,
    p_counts: !job.test && def.counts,
    p_max_per_day: limit,
    p_min_gap_minutes: POLICY.minGapMinutes,
    p_subject_type: job.subject_type || null,
    p_subject_id: job.subject || null,
    p_planned_for: job.planned_for || null,
    p_is_test: !!job.test,
  });
  const r = Array.isArray(rows) ? rows[0] : rows;
  return { ok: !!r?.ok, reason: r?.reason || null, logId: r?.log_id || null };
}

/** The words, the angle, the route and the delivery level. */
export async function compose(env, job, person, facts) {
  const d = db(env);
  const route = routeFor(job.moment, job.subject);
  const interruption = interruptionFor(job.moment, person.state, {
    timeSensitiveAllowed: person.devices.some((x) => x.time_sensitive !== false),
  });

  if (job.moment === 'canary') {
    return {
      ...CANARY_WORDS,
      angle: null,
      model: null,
      usedFallback: false,
      problem: null,
      route: 'drop',
      interruption: 'passive',
    };
  }
  if (job.test && job.data?.words?.body) {
    const w = job.data.words;
    return {
      title: String(w.title || ''),
      body: String(w.body),
      angle: null,
      model: null,
      usedFallback: false,
      problem: null,
      route,
      interruption,
    };
  }

  if (job.moment === 'reminder') {
    const [type, id] = String(job.subject || '').split(':');
    const table = { todo: 'todos', habit: 'habits', note: 'notes', person: 'people' }[type];
    const [item] = table ? (await d.select(`${table}?id=eq.${id}&select=*`)) || [] : [];
    const itemTitle = item?.name || item?.title || item?.display_name || 'Reminder';
    const startClock = item?.event_time
      ? clock(Number(item.event_time.slice(0, 2)) * 60 + Number(item.event_time.slice(3, 5)))
      : null;
    return {
      ...reminderCopy({ itemTitle, rule: job.data?.rule, startClock }),
      angle: 'plain',
      model: null,
      usedFallback: false,
      problem: null,
      route,
      interruption,
    };
  }

  // a night with nothing to sort: one fixed line, not the writer (see copy.js)
  if (job.moment === 'sweep' && facts?.waiting_in_sweep === 0) {
    return {
      ...clearNightCopy(),
      angle: 'plain',
      model: null,
      usedFallback: false,
      problem: null,
      route,
      interruption,
    };
  }

  const recent = await d.select(
    `notification_log?user_id=eq.${job.user_id}&body=not.is.null&created_at=gte.${encodeURIComponent(new Date(Date.now() - POLICY.noRepeatLineDays * 86400000).toISOString())}&select=moment,angle,body,created_at&order=created_at.desc&limit=40`,
  );
  const sameMoment = (recent || []).filter((r) => r.moment === job.moment);
  const daysSinceUsed = {};
  for (const r of sameMoment) {
    if (!r.angle || daysSinceUsed[r.angle] != null) continue;
    daysSinceUsed[r.angle] = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
  }
  const yesterday =
    sameMoment.find((r) => daysSinceUsed[r.angle] != null && daysSinceUsed[r.angle] <= 1)?.angle ||
    null;
  const angle = chooseAngle({
    moment: job.moment,
    eligible: job.data?.eligibleAngles || null,
    stats: person.engagement?.angle_stats?.[job.moment] || {},
    daysSinceUsed,
    yesterday,
  });

  const copyFacts = {
    ...(facts || {}),
    ...(job.data?.facts || {}),
    last_note: !!job.data?.lastNote,
  };
  const words = await writeCopy(env, {
    moment: job.moment,
    angle,
    facts: copyFacts,
    recentLines: (recent || []).map((r) => r.body),
    fallbackFacts: {
      weekday: facts?.weekday,
      habitTitle: job.data?.habitTitle,
      goodNewsTitle: job.data?.title,
      lastNote: !!job.data?.lastNote,
    },
  });
  if (words.usedFallback) {
    console.warn(`[Notifications] fallback line used for ${job.moment}: ${words.problem}`);
  }
  return { ...words, angle, route, interruption };
}

/** Sends to every healthy device and records what Expo said about each. */
export async function push(env, job, person, logId, words) {
  const d = db(env);
  const messages = person.devices.map((dev) =>
    buildMessage({
      to: dev.expo_token,
      title: words.title,
      body: words.body,
      route: words.route,
      logId,
      moment: job.moment,
      categoryId: CATEGORY[job.moment],
      interruption: words.interruption,
      silent: job.moment === 'canary',
      data:
        job.moment === 'reminder' || job.moment === 'habit_checkin'
          ? { subject: job.subject }
          : undefined,
    }),
  );
  const results = await sendToExpo(env, messages);
  const tickets = results.map((r, i) => ({ device_id: person.devices[i].id, ...r }));
  for (const t of tickets) {
    if (!t.ok && DEAD_DEVICE_ERRORS.has(t.error)) {
      await d.update(`push_devices?id=eq.${t.device_id}`, {
        disabled_at: new Date().toISOString(),
        disabled_reason: `Expo: ${t.error}`,
        updated_at: new Date().toISOString(),
      });
    }
    if (!t.ok && ALERT_ERRORS.has(t.error)) {
      await reportProblem(env, {
        title: `Push credentials problem: ${t.error}`,
        tags: { moment: job.moment },
        extra: { message: t.message },
      });
    }
  }
  const anyOk = tickets.some((t) => t.ok);
  if (!anyOk && tickets.length && tickets.every((t) => t.retry)) {
    // nobody got it and Expo asked us to slow down: throwing makes the step retry with backoff
    throw new Error(`Expo rate limited all ${tickets.length} sends`);
  }
  await d.update(`notification_log?id=eq.${logId}`, {
    status: anyOk ? 'sent' : 'failed',
    reason: anyOk
      ? job.reasonText || null
      : `Expo refused it: ${[...new Set(tickets.map((t) => t.error).filter(Boolean))].join(', ')}`,
    title: words.title || null,
    body: words.body,
    route: words.route,
    angle: words.angle || null,
    interruption: words.interruption,
    model: words.model || null,
    used_fallback: !!words.usedFallback,
    device_ids: person.devices.map((x) => x.id),
    expo_tickets: tickets,
    sent_at: anyOk ? new Date().toISOString() : null,
    data: { problem: words.problem || null, planned_for: job.planned_for || null },
    inngest_run_id: job.inngest_run_id || null,
    updated_at: new Date().toISOString(),
  });
  return { sent: anyOk, tickets: tickets.length, ok: tickets.filter((t) => t.ok).length };
}

/**
 * Reads the receipts for one sent notification. Returns { settled, delivered }
 * where settled is false while Expo is still working on some of them.
 */
export async function settleReceipts(
  env,
  logId,
  { final = false, getReceiptsImpl, receipts: known } = {},
) {
  const d = db(env);
  const [row] =
    (await d.select(
      `notification_log?id=eq.${logId}&select=id,user_id,moment,status,expo_tickets`,
    )) || [];
  if (!row || row.status !== 'sent')
    return { settled: true, delivered: row?.status === 'delivered' };
  const tickets = (row.expo_tickets || []).filter((t) => t.ok && t.ticketId);
  if (!tickets.length) {
    await d.update(`notification_log?id=eq.${logId}`, {
      status: 'failed',
      reason: 'No tickets to check',
      updated_at: new Date().toISOString(),
    });
    return { settled: true, delivered: false };
  }
  const receipts =
    known ||
    (await (getReceiptsImpl || getReceipts)(
      env,
      tickets.map((t) => t.ticketId),
    ));
  const pending = tickets.filter((t) => !receipts[t.ticketId]);
  if (pending.length && !final) return { settled: false, delivered: false };

  const results = tickets.map((t) => ({
    device_id: t.device_id,
    ticketId: t.ticketId,
    ...(receipts[t.ticketId] || { status: 'no receipt' }),
  }));
  for (const r of results) {
    if (r.status === 'error' && DEAD_DEVICE_ERRORS.has(r.error)) {
      await d.update(`push_devices?id=eq.${r.device_id}`, {
        disabled_at: new Date().toISOString(),
        disabled_reason: `Expo receipt: ${r.error}`,
        updated_at: new Date().toISOString(),
      });
    }
    if (r.status === 'error' && ALERT_ERRORS.has(r.error)) {
      await reportProblem(env, {
        title: `Push credentials problem: ${r.error}`,
        extra: { message: r.message, log: logId },
      });
    }
  }
  const delivered = results.some((r) => r.status === 'ok');
  await d.update(`notification_log?id=eq.${logId}`, {
    status: delivered ? 'delivered' : 'failed',
    delivered_at: delivered ? new Date().toISOString() : null,
    receipts: results,
    reason: delivered
      ? undefined
      : `Not delivered: ${[...new Set(results.map((r) => r.error || r.status))].join(', ')}`,
    updated_at: new Date().toISOString(),
  });
  return { settled: true, delivered };
}

/**
 * Settles every notification sent between 15 minutes and a day ago, with one
 * receipts request per thousand tickets. Expo keeps receipts for a day; after
 * an hour a missing receipt is final.
 */
export async function settleDueReceipts(env, { at = new Date(), getReceiptsImpl } = {}) {
  const d = db(env);
  const from = new Date(at.getTime() - 24 * 3600000).toISOString();
  const to = new Date(at.getTime() - 15 * 60000).toISOString();
  const rows =
    (await d.select(
      `notification_log?status=eq.sent&sent_at=gte.${encodeURIComponent(from)}&sent_at=lte.${encodeURIComponent(to)}&select=id,sent_at,expo_tickets&order=sent_at.asc&limit=500`,
    )) || [];
  const ids = rows.flatMap((r) =>
    (r.expo_tickets || []).filter((t) => t.ok && t.ticketId).map((t) => t.ticketId),
  );
  const receipts = ids.length ? await (getReceiptsImpl || getReceipts)(env, ids) : {};
  let delivered = 0;
  let failed = 0;
  let waiting = 0;
  for (const r of rows) {
    const final = at.getTime() - Date.parse(r.sent_at) > 60 * 60000;
    const out = await settleReceipts(env, r.id, { final, receipts });
    if (!out.settled) waiting += 1;
    else if (out.delivered) delivered += 1;
    else failed += 1;
  }
  return { checked: rows.length, delivered, failed, waiting };
}

export { dedupeKey, ANGLES };
