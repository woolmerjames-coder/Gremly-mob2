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
 *   on their weekly day, what is left of the Sunday classifier, then their
 *   read, then the words under their Worlds and Chapters and the memories of
 *   closed Chapters (data fabric stage 4b). The read is made ahead for everyone the pipe
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
import { runWeekSpread, spreadFrame, storedSpread } from './spread';
import { runWeekRelief, storedRelief } from './relief';
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
 * How hard the model is asked to think for a read: medium, whatever the
 * review is. The midweek extra was tried at low, where it comes back in a
 * quarter of the time behind the loading screen, and the read was thinner:
 * 6 of 7 on the week replay and 5 of 8 on the health scenario, against 22 of
 * 22 at medium. James chose medium for it too (6 Oct). This stays the one
 * place the effort is decided, by what the review is.
 * @param {{kind: string}} _on what the review is (reviewWith)
 */
export function readEffort(_on) {
  return 'medium';
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
 * Every read is made at medium effort, the midweek extra too (readEffort).
 *
 * @param {object} env
 * @param {string} userId
 * @param {{today?: string, first?: string, ahead?: boolean, needsReview?: boolean, at?: Date, deps?: {run?: Function, gather?: Function}}} [p]
 *   today is the app's day, or the weekly day the pipe is for; it is taken
 *   when it is within a day of the person's day as worked out here.
 *   first is the first day the review plans from as the app has it: tomorrow
 *   for a review opened in the evening (workers/shared/week.js reviewOn takes
 *   nothing else). The app says so, and the read and the spread follow, so
 *   all three plan the same days.
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
  const on = reviewWith(today, settings.weekly_day, row, p.first);
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

/**
 * The spread for the review under way: which of their todos go on which day,
 * made from their answers as the week's row has them now and kept on the row
 * (spread). The app asks for it once they have set the week's shape, and
 * again when their priorities, hours or busy days change.
 *
 * Their own moves on the board are not saved until they finish, so they come
 * with the request (board) and nothing they placed is moved. Only spread and
 * its prompt version are written here: the answers and the review's progress
 * are the app's.
 *
 * @param {object} env
 * @param {string} userId
 * @param {{today?: string, first?: string, board?: object, at?: Date, deps?: {run?: Function, gather?: Function}}} [p]
 *   first is the first day being planned as the app's board has it (prepareWeekRead)
 * @returns {Promise<{on: object, spread: object}>}
 */
export async function ensureWeekSpread(env, userId, p = {}) {
  const at = p.at || new Date();
  const d = db(env);
  const [tz, settings] = await Promise.all([userTimezone(env, userId), weekSettings(env, userId)]);
  const mine = await personToday(env, userId, tz, at);
  const today = isDay(p.today) && Math.abs(daysBetween(mine, p.today)) <= 1 ? p.today : mine;
  const row = await rowOf(d, userId, reviewOn(today, settings.weekly_day).week_start);
  const on = reviewWith(today, settings.weekly_day, row, p.first);
  if (!row || !row.read || typeof row.read !== 'object') {
    throw new Error('there is no review with a read to spread');
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
  // Beside the spread, and from the same frame: what could leave each day
  // that already holds more of their own than it has room for. When that call
  // fails the spread still stands, and those days are named with no moves.
  const frame = (p.deps?.frame || spreadFrame)(g, row, p.board);
  const [out, relief] = await Promise.all([
    (p.deps?.run || runWeekSpread)(env, g, row, { board: p.board }),
    (p.deps?.relief || runWeekRelief)(env, g, frame).catch((err) => {
      console.warn(
        `[ALERT][WeekRelief] no moves could be suggested for ${userId}: ${err?.message || err}`,
      );
      return null;
    }),
  ]);
  for (const [name, made] of [
    ['WeekSpread', out],
    ['WeekRelief', relief],
  ]) {
    if (!made?.dropped?.length) continue;
    const what = [...new Set(made.dropped.map((x) => `${x.what}: ${x.why}`))].join('; ');
    console.warn(`[ALERT][${name}] dropped ${made.dropped.length} for ${userId}: ${what}`);
  }
  const spread = { ...storedSpread(g, out, at), relief: storedRelief(g, frame, relief) };
  const saved = await d.update(`weekly_reviews?id=eq.${row.id}&owner_id=eq.${userId}`, {
    spread,
    prompt_versions: {
      ...(row.prompt_versions && typeof row.prompt_versions === 'object'
        ? row.prompt_versions
        : {}),
      spread: spread.version,
      relief: spread.relief.version,
    },
  });
  if (!saved?.[0]) throw new Error('the spread was made but its week could not be saved');
  return { on, spread };
}

/** Whether the Sunday classifier still runs in the weekly pipe (WEEKLY_CLASSIFIER, on unless "off"). */
export function classifierInPipe(env) {
  return String(env?.WEEKLY_CLASSIFIER || 'on').toLowerCase() !== 'off';
}

export function createWeekFunctions(
  inngest,
  { synthesis, classifier = null, words = null, memories = null, people = null, review = null },
) {
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
      // What is left of the Sunday classifier runs here, after the synthesis,
      // until stage 5 (data fabric stage 4b): it no longer has a schedule of
      // its own, so it never runs before the synthesis on another day.
      // its place here is behind WEEKLY_CLASSIFIER (wrangler.toml), "on" until
      // the Chapter questions take over its suggestions (data fabric stage 5)
      let classified = null;
      if (classifier && classifierInPipe(env)) {
        try {
          const c = await step.invoke('classifier', {
            function: classifier,
            data: { user_id: userId },
            timeout: '30m',
          });
          classified = { counts: c?.classifier_counts || null };
        } catch (err) {
          classified = { error: String(err?.message || err).slice(0, 200) };
          console.warn(
            `[ALERT][WeekPipe] the classifier did not finish for ${userId} on ${day}: ${classified.error}`,
          );
        }
      }
      // Making the read and keeping it are two steps, so a save that fails is
      // tried again without paying for the read a second time. A read that
      // fails is raised and does not cost them their words and memories.
      let ahead = null;
      let kept = null;
      let readError = null;
      try {
        ahead = await step.run('read-ahead', async () => {
          if (synth?.error) {
            console.warn(
              `[ALERT][WeekPipe] the weekly synthesis did not finish for ${userId} on ${day}: ${synth.error}`,
            );
          }
          const r = await prepareWeekRead(env, userId, { today: day, ahead: true });
          return { on: r.on, read: r.read, skipped: r.skipped || null };
        });
        kept = ahead.read
          ? await step.run('keep-read', async () => {
              const k = await keepWeekRead(env, userId, ahead.on, ahead.read);
              return { made: k.made };
            })
          : null;
      } catch (err) {
        readError = String(err?.message || err).slice(0, 200);
        console.warn(
          `[ALERT][WeekPipe] the read did not finish for ${userId} on ${day}: ${readError}`,
        );
      }
      let skipped = ahead?.skipped || null;
      if (!readError && !skipped && !ahead?.read) skipped = 'the week has its read';
      if (!skipped && kept && !kept.made) skipped = 'another read was kept first';
      // Then the words under each World and open Chapter, from what the week
      // filed, and a memory for each closed Chapter that has none (data fabric
      // stage 4b), then the people records checked and one question about
      // someone, when one is worth asking (stage 4c), then the ledger looked
      // over for what only they can settle (stage 4f). After the read, so the
      // read never waits on them.
      const after = {};
      for (const [name, fn] of [
        ['words', words],
        ['memories', memories],
        ['people', people],
        // what only they can settle, put as questions (data fabric stage 4f)
        ['review', review],
      ]) {
        if (!fn) continue;
        try {
          const r = await step.invoke(name, {
            function: fn,
            data: { user_id: userId, reason: 'weekly' },
            timeout: '30m',
          });
          after[name] =
            name === 'words'
              ? {
                  written: r?.written ?? null,
                  left_out: r?.left_out ?? null,
                  failed: r?.failed ?? null,
                }
              : name === 'memories'
                ? { chapters: r?.chapters ?? null }
                : name === 'review'
                  ? {
                      written: r?.written ?? null,
                      found: r?.found ?? null,
                      shadow: r?.shadow ?? null,
                    }
                  : {
                      checked: r?.checked?.checked ?? null,
                      who_cleared: r?.checked?.who_cleared ?? null,
                      asked: r?.asked?.written ?? null,
                    };
        } catch (err) {
          after[name] = { error: String(err?.message || err).slice(0, 200) };
          console.warn(
            `[ALERT][WeekPipe] the ${name} did not finish for ${userId} on ${day}: ${after[name].error}`,
          );
        }
      }
      return {
        user_id: userId,
        day,
        synthesis: synth,
        classifier: classified,
        ...after,
        read: {
          made: !!kept?.made,
          skipped: skipped || null,
          error: readError,
          week_start: ahead?.on?.week_start ?? null,
          kind: ahead?.on?.kind ?? null,
        },
      };
    },
  );

  return [dispatch, pipe];
}

/**
 * POST /api/week-read { user_id, date, first } (admin key checked upstream). Making a
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
    const work = ensureWeekRead(env, userId, { today: body.date, first: body.first });
    ctx?.waitUntil?.(work.catch(() => undefined));
    const r = await work;
    return corsResponse({ made: r.made, on: r.on, review: r.review });
  } catch (e) {
    console.error('[WeekRead] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}

/**
 * POST /api/week-spread { user_id, date, first, board } (admin key checked
 * upstream). A spread takes about twenty seconds, so like the read its work is
 * handed to the worker's own lifetime: one that gets finished is kept on the
 * week's row whether or not the phone is still waiting.
 */
export async function handleWeekSpreadApi(request, env, corsResponse, ctx) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    if (!userId || !UUID.test(userId)) return corsResponse({ error: 'user_id is required' }, 400);
    const work = ensureWeekSpread(env, userId, {
      today: body.date,
      first: body.first,
      board: body.board,
    });
    ctx?.waitUntil?.(work.catch(() => undefined));
    const r = await work;
    return corsResponse({ on: r.on, spread: r.spread });
  } catch (e) {
    console.error('[WeekSpread] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
