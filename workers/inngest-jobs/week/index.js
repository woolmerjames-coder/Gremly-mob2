/**
 * The weekly pipe, and the read's two ways in.
 *
 * Everything weekly runs on the person's own weekly day, Sunday unless they
 * chose another, at the hour of their weekly slot (6pm unless they chose
 * another). The summary and its push come at the slot, as before
 * (weekly-summary-v2-dispatcher). The pipe runs ahead of it:
 *
 * - weekly-pipe-dispatch (hourly): for everyone active, starts their pipe in
 *   the three hours before their slot. Most people stay on Sunday at 6pm, so
 *   the work spreads over each person's own hour and no longer leaves in one
 *   fan out on Sunday at 11:00 UTC.
 * - weekly-pipe (one person): their weekly synthesis for the seven days ending
 *   on their weekly day, then their read, made ahead for everyone the pipe
 *   runs for (the rule that kept it to people who had finished a review in the
 *   last four weeks is still here, switched off: READ_AHEAD_NEEDS_REVIEW).
 * - POST /api/week-read (from cortex, for the app): the read for a review
 *   opened today, made there and then when the week's row holds none that
 *   serves it.
 *
 * Which review a day gives, which read serves it and which days it plans are
 * decided from dates and the week's row alone (workers/shared/week.js).
 */

import { db, userTimezone, localDate, addDays } from '../context/db';
import { localStartIso, minutesIn } from '../../shared/calendar.js';
import { dayEndHourOf, personDay } from '../../shared/day.js';
import {
  PIPE_LEAD_HOURS,
  READ_AHEAD_DAYS,
  READ_AHEAD_NEEDS_REVIEW,
  daysBetween,
  isDay,
  readServes,
  reviewOn,
  reviewWith,
  weekdayOf,
  weeklyDayOf,
} from '../../shared/week.js';
import { gatherRead, runWeekRead, storedRead } from './read';
import { DEFAULT_TIMEZONE, slotHour, weekSettings } from './settings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The weekly day a person's pipe is due for, or null when their slot is not
 * within the next PIPE_LEAD_HOURS hours. The dispatcher runs on the hour, so
 * a pipe is asked for up to three times; the event's id lets one through.
 * Throws for a timezone that does not exist, so it is seen and not skipped.
 * @param {{timezone?: string, weekly_day?: number, weekly_time?: string}} prefs
 * @param {Date} [at]
 */
export function pipeDueDay(prefs, at = new Date()) {
  const tz = prefs?.timezone || DEFAULT_TIMEZONE;
  const weeklyDay = weeklyDayOf(prefs?.weekly_day);
  const hour = slotHour(prefs?.weekly_time);
  for (let ahead = 1; ahead <= PIPE_LEAD_HOURS; ahead++) {
    const then = new Date(at.getTime() + ahead * 3600e3);
    const day = localDate(tz, then);
    if (weekdayOf(day) === weeklyDay && Math.floor(minutesIn(tz, then) / 60) === hour) return day;
  }
  return null;
}

/** Everyone active whose pipe is due now, each with the weekly day it is for. */
export async function pipesDue(env, at = new Date()) {
  const d = db(env);
  const people = (await d.rpc('get_active_people', { active_days: 30 })) || [];
  if (!people.length) return [];
  const prefs = new Map();
  for (let i = 0; i < people.length; i += 100) {
    const ids = people.slice(i, i + 100).map((p) => p.user_id);
    const rows = await d.select(
      `notification_preferences?user_id=in.(${ids.join(',')})&select=user_id,weekly_day,weekly_time`,
    );
    for (const r of rows || []) prefs.set(r.user_id, r);
  }
  const due = [];
  for (const p of people) {
    const mine = prefs.get(p.user_id) || {};
    try {
      const day = pipeDueDay({ ...mine, timezone: p.timezone }, at);
      if (day) due.push({ user_id: p.user_id, day });
    } catch (err) {
      console.warn(
        `[ALERT][WeekPipe] could not work out the weekly slot for ${p.user_id} in ${p.timezone}: ${err.message}`,
      );
    }
  }
  return due;
}

/** The person's day now: before the hour their day ends it is still yesterday for them. */
export async function personToday(env, userId, tz, at = new Date()) {
  const dayEndHour = await dayEndHourOf(env, userId);
  return personDay(localDate(tz, at), minutesIn(tz, at), dayEndHour);
}

const rowOf = async (d, userId, weekStart) =>
  (
    await d.select(
      `weekly_reviews?owner_id=eq.${userId}&week_start=eq.${weekStart}&select=*&limit=1`,
    )
  )?.[0] || null;

/**
 * How hard the model is asked to think for a read: low for the one extra
 * review of a week, medium for every other.
 * @param {{kind: string}} on what the review is (reviewWith)
 */
export function readEffort(on) {
  return on?.kind === 'extra' ? 'low' : 'medium';
}

/**
 * The first half: work out which review a day gives and make its read, when
 * the week's row holds none that serves it. Nothing is written here, so a
 * read that has been paid for can be handed on and kept in a step of its own.
 *
 * - The weekly day and the two days after use the read the row holds, the one
 *   made ahead or on a first open; so does a week brought forward the day
 *   before, whose read stays through the weekly day.
 * - Any other day is the one extra review of the week: a fresh read the first
 *   time, and that same read after it.
 * - A review already under way is carried on with the read it began with,
 *   whatever day it is opened again (reviewWith): it is not the extra.
 * - ahead (the pipe): the read is made for everyone the pipe runs for. With
 *   READ_AHEAD_NEEDS_REVIEW on, only for someone who finished a review in the
 *   last four weeks. It is only ever the weekly review's own read: when the
 *   day is no longer in their weekly window (they moved their weekly day
 *   while the pipe waited), or they have said not this week, none is made.
 *
 * The read ahead, a first open in the weekly window and a week brought forward
 * are made at medium effort. The midweek extra is made at low: they are
 * waiting behind the loading screen, and it comes back in a quarter of the
 * time (readEffort).
 *
 * @param {object} env
 * @param {string} userId
 * @param {{today?: string, ahead?: boolean, needsReview?: boolean, at?: Date, deps?: {run?: Function, gather?: Function}}} [p]
 *   today is the app's day, or the weekly day the pipe is for; it is taken
 *   when it is within a day of the person's day as worked out here.
 *   needsReview turns the four week rule on or off for one call (it is
 *   READ_AHEAD_NEEDS_REVIEW when not given)
 * @returns {Promise<{on: object, review: object|null, read: object|null, skipped?: string}>}
 *   review is the row when its read serves; read is a new read still to be kept
 */
export async function prepareWeekRead(env, userId, p = {}) {
  const at = p.at || new Date();
  const d = db(env);
  const [tz, settings] = await Promise.all([userTimezone(env, userId), weekSettings(env, userId)]);
  const mine = await personToday(env, userId, tz, at);
  const today = isDay(p.today) && Math.abs(daysBetween(mine, p.today)) <= 1 ? p.today : mine;
  const row = await rowOf(d, userId, reviewOn(today, settings.weekly_day).week_start);
  const on = reviewWith(today, settings.weekly_day, row);
  if (readServes(on, row)) return { on, review: row, read: null };

  if (p.ahead) {
    // made ahead for the weekly review alone: never the week's one extra, and
    // never over their own word that this week is not for planning
    if (on.kind !== 'weekly')
      return { on, review: null, read: null, skipped: 'the day is not in their weekly window' };
    if (row?.status === 'skipped')
      return { on, review: null, read: null, skipped: 'they said not this week' };
  }
  if (p.ahead && (p.needsReview ?? READ_AHEAD_NEEDS_REVIEW)) {
    const since = localStartIso(tz, addDays(today, -READ_AHEAD_DAYS));
    const finished = await d.select(
      `weekly_reviews?owner_id=eq.${userId}&status=eq.done&completed_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
    );
    if (!finished?.length)
      return { on, review: null, read: null, skipped: 'no review finished in four weeks' };
  }

  const g = await (p.deps?.gather || gatherRead)(env, userId, {
    today,
    first: on.span_start,
    last: on.span_end,
    week_start: on.week_start,
    tz,
    days_off: settings.days_off,
    at,
  });
  const out = await (p.deps?.run || runWeekRead)(env, g, { effort: readEffort(on) });
  if (out.dropped.length) {
    const what = [...new Set(out.dropped.map((x) => `${x.what}: ${x.why}`))].join('; ');
    console.warn(
      `[ALERT][WeekRead] dropped ${out.dropped.length} from the read for ${userId}: ${what}`,
    );
  }
  return { on, review: null, read: storedRead(g, out, at) };
}

/**
 * The second half: keep a new read on the week's row. The read took most of a
 * minute to make, so the row is looked at again first: when another read that
 * serves was kept in that time (the pipe and a first open at once, or two
 * opens), that one stands and this one is let go, so nobody's answers end up
 * under a read they were not made from.
 *
 * A new row is ready. A week already under way or done keeps its status: the
 * review's own progress is the app's to move.
 * @returns {Promise<{made: boolean, review: object}>}
 */
export async function keepWeekRead(env, userId, on, read) {
  const d = db(env);
  const row = await rowOf(d, userId, on.week_start);
  if (readServes(on, row)) return { made: false, review: row };
  const versions = {
    ...(row?.prompt_versions && typeof row.prompt_versions === 'object' ? row.prompt_versions : {}),
    read: read.version,
  };
  if (row) {
    const saved = await d.update(`weekly_reviews?id=eq.${row.id}&owner_id=eq.${userId}`, {
      read,
      kind: on.kind,
      span_start: on.span_start,
      prompt_versions: versions,
      ...(['ready', 'skipped'].includes(row.status) ? { status: 'ready' } : {}),
    });
    if (!saved?.[0]) throw new Error('the read was made but its week could not be saved');
    return { made: true, review: saved[0] };
  }
  try {
    const made = await d.insert('weekly_reviews', [
      {
        owner_id: userId,
        week_start: on.week_start,
        span_start: on.span_start,
        status: 'ready',
        kind: on.kind,
        read,
        prompt_versions: versions,
      },
    ]);
    if (!made?.[0]) throw new Error('the read was made but its week could not be saved');
    return { made: true, review: made[0] };
  } catch (err) {
    // one person has one row a week: a row that appeared since the look above
    // makes this insert fail, and when its read serves, that read stands
    const now = await rowOf(d, userId, on.week_start);
    if (readServes(on, now)) return { made: false, review: now };
    throw err;
  }
}

/**
 * The read for a review started on a day, made and kept when the week's row
 * holds none that serves it (both halves, for the app's route).
 * @returns {Promise<{made: boolean, on: object, review: object|null, skipped?: string}>}
 */
export async function ensureWeekRead(env, userId, p = {}) {
  const r = await prepareWeekRead(env, userId, p);
  if (!r.read) {
    return {
      made: false,
      on: r.on,
      review: r.review,
      ...(r.skipped ? { skipped: r.skipped } : {}),
    };
  }
  const kept = await keepWeekRead(env, userId, r.on, r.read);
  return { made: kept.made, on: r.on, review: kept.review };
}

export function createWeekFunctions(inngest, { synthesis }) {
  const dispatch = inngest.createFunction(
    { id: 'weekly-pipe-dispatch', name: 'Weekly pipe: start the pipes due now' },
    [{ cron: '0 * * * *' }, { event: 'app/week.pipe.dispatch' }],
    async ({ step, env }) => {
      const due = await step.run('who-is-due', () => pipesDue(env));
      if (due.length) {
        await step.sendEvent(
          'start-pipes',
          due.map((u) => ({
            // one pipe per person per weekly day: Inngest drops repeats with the same id
            id: `weekly-pipe-${u.user_id}-${u.day}`,
            name: 'app/week.pipe',
            data: { user_id: u.user_id, day: u.day },
          })),
        );
      }
      return { due: due.length };
    },
  );

  const pipe = inngest.createFunction(
    {
      id: 'weekly-pipe',
      name: "Weekly pipe: one person's synthesis, then their read",
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 5 }],
      retries: 1,
    },
    { event: 'app/week.pipe' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      const day = event.data?.day;
      if (!userId || !UUID.test(userId) || !isDay(day))
        throw new Error('user_id and day are required');
      // The synthesis goes through the half price batch API, so it can take a
      // while. The read waits two hours for it and then reads what is there:
      // a synthesis that failed or ran long does not cost them their read.
      let synth;
      try {
        synth = await step.invoke('synthesis', {
          function: synthesis,
          data: { user_id: userId, period_end: day },
          timeout: '2h',
        });
      } catch (err) {
        synth = { error: String(err?.message || err).slice(0, 200) };
      }
      // Making the read and keeping it are two steps, so a save that fails is
      // tried again without paying for the read a second time.
      const ahead = await step.run('read-ahead', async () => {
        if (synth?.error) {
          console.warn(
            `[ALERT][WeekPipe] the weekly synthesis did not finish for ${userId} on ${day}: ${synth.error}`,
          );
        }
        const r = await prepareWeekRead(env, userId, { today: day, ahead: true });
        return { on: r.on, read: r.read, skipped: r.skipped || null };
      });
      const kept = ahead.read
        ? await step.run('keep-read', async () => {
            const k = await keepWeekRead(env, userId, ahead.on, ahead.read);
            return { made: k.made };
          })
        : null;
      let skipped = ahead.skipped;
      if (!skipped && !ahead.read) skipped = 'the week has its read';
      if (!skipped && kept && !kept.made) skipped = 'another read was kept first';
      return {
        user_id: userId,
        day,
        synthesis: synth,
        read: {
          made: !!kept?.made,
          skipped: skipped || null,
          week_start: ahead.on.week_start,
          kind: ahead.on.kind,
        },
      };
    },
  );

  return [dispatch, pipe];
}

/**
 * POST /api/week-read { user_id, date } (admin key checked upstream). Making a
 * read takes most of a minute, so the work is also handed to the worker's own
 * lifetime (ctx.waitUntil): if the phone stops waiting, the work carries on
 * for as long as the worker is allowed to, and a read that gets finished is
 * kept on the week's row, where the app looks before it asks again.
 */
export async function handleWeekReadApi(request, env, corsResponse, ctx) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    if (!userId || !UUID.test(userId)) return corsResponse({ error: 'user_id is required' }, 400);
    const work = ensureWeekRead(env, userId, { today: body.date });
    ctx?.waitUntil?.(work.catch(() => undefined));
    const r = await work;
    return corsResponse({ made: r.made, on: r.on, review: r.review });
  } catch (e) {
    console.error('[WeekRead] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
