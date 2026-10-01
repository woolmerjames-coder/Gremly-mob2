/**
 * Notifications: the Inngest functions.
 *
 *   notifications/send.due    one planned notification. Sleeps until its time,
 *                             is cancelled by the thing it was about happening,
 *                             then decides, claims, writes and sends.
 *   notifications/test.send   the Lab's "send now", and the canary. Skips the
 *                             timing rules, never the delivery checks.
 *   cron every hour           reads Expo receipts for everything sent, so a
 *                             notification is only "delivered" when Apple or
 *                             Google took it.
 *
 * Every path ends in a notification_log row with a plain reason.
 */

import { MOMENTS } from './policy';
import {
  decide,
  claim,
  compose,
  push,
  logSkip,
  loadDevices,
  publicPerson,
  settleReceipts,
  settleDueReceipts,
} from './send';
import { reportProblem, cronCheckIn } from './alert';
import { db } from '../context/db';

export const SEND_EVENT = 'notifications/send.due';
export const TEST_EVENT = 'notifications/test.send';
export const CANCEL_EVENT = 'notifications/cancel';
export const ACTIVITY_EVENT = 'app/activity';
// hourly keeps Inngest use low; Expo keeps receipts for a day, and the Lab reads its own after a minute
export const RECEIPTS_CRON = '7 * * * *';
const MAX_HOLDS = 8;

/**
 * The things that make a waiting notification pointless, as Inngest
 * expressions: `event` is the planned send, `async` is the activity.
 */
export const CANCEL_ON = Object.freeze([
  { event: CANCEL_EVENT, if: 'async.data.dedupe_key == event.data.dedupe_key' },
  {
    event: ACTIVITY_EVENT,
    if: "async.data.user_id == event.data.user_id && event.data.moment == 'sweep' && async.data.kind == 'swept'",
  },
  {
    event: ACTIVITY_EVENT,
    if: "async.data.user_id == event.data.user_id && event.data.moment == 'brief' && async.data.kind == 'brief_seen'",
  },
  {
    event: ACTIVITY_EVENT,
    if: "async.data.user_id == event.data.user_id && event.data.moment == 'habit_checkin' && async.data.kind == 'habit_logged' && async.data.subject == event.data.subject",
  },
  {
    event: ACTIVITY_EVENT,
    if: "async.data.user_id == event.data.user_id && event.data.moment == 'reminder' && async.data.kind == 'item_done' && async.data.subject == event.data.item",
  },
]);

/** Checks and tidies the event data into a job. Throws on anything unusable. */
export function jobFrom(data = {}) {
  const job = { ...data, subject: data.subject ?? null };
  if (!job.user_id) throw new Error('user_id is required');
  if (!job.moment || !(MOMENTS[job.moment] || job.moment === 'canary'))
    throw new Error(`Unknown moment ${job.moment}`);
  if (!job.dedupe_key) throw new Error('dedupe_key is required');
  if (job.planned_for && Number.isNaN(Date.parse(job.planned_for)))
    throw new Error(`Bad planned_for ${job.planned_for}`);
  // reminders are cancelled by their item being done: "todo:<id>"
  if (job.moment === 'reminder' && !job.item)
    job.item = String(job.subject || '')
      .split(':')
      .slice(0, 2)
      .join(':');
  return job;
}

/**
 * The decide, hold, claim, write, send sequence shared by both send functions.
 * Each piece is its own step, so a retry never repeats a finished one.
 */
export async function runSend({ step, env, runId }, job) {
  let verdict = null;
  let held = 0;
  for (let round = 0; round < MAX_HOLDS; round += 1) {
    verdict = await step.run(`decide-${round}`, async () => {
      const v = await decide(env, job, { heldSoFar: held });
      return {
        action: v.action,
        minutes: v.minutes ?? null,
        reason: v.reason ?? null,
        person: publicPerson(v.person),
        facts: v.facts ?? null,
      };
    });
    if (verdict.action !== 'hold') break;
    await step.sleep(`hold-${round}`, `${verdict.minutes}m`);
    held += verdict.minutes;
  }
  if (verdict.action === 'hold')
    verdict = {
      ...verdict,
      action: 'drop',
      reason: `Held ${held} minutes and still not a good time`,
    };

  if (verdict.action !== 'send') {
    await step.run('log-skip', () =>
      logSkip(env, job, verdict.person, 'suppressed', verdict.reason),
    );
    return { sent: false, reason: verdict.reason };
  }

  const person = verdict.person;
  const claimed = await step.run('claim', () => claim(env, job, person));
  if (!claimed.ok) {
    if (claimed.reason !== 'already decided') {
      await step.run('log-claim-skip', () =>
        logSkip(env, job, person, 'suppressed', claimed.reason),
      );
    }
    return { sent: false, reason: claimed.reason };
  }

  const words = await step.run('write', () => compose(env, job, person, verdict.facts));

  const result = await step.run('push', async () => {
    // tokens are read here, never stored in step results
    const devices = await loadDevices(env, job.user_id);
    if (!devices.length) {
      await db(env).update(`notification_log?id=eq.${claimed.logId}`, {
        status: 'failed',
        reason: 'No phone could receive it by the time it was sent',
        updated_at: new Date().toISOString(),
      });
      return { sent: false, tickets: 0, ok: 0 };
    }
    return push(
      env,
      { ...job, inngest_run_id: runId || null },
      { ...person, devices },
      claimed.logId,
      words,
    );
  });

  return {
    sent: result.sent,
    logId: claimed.logId,
    devices: result.tickets,
    accepted: result.ok,
    usedFallback: !!words.usedFallback,
  };
}

/** When a send function gives up after its retries, its log row says so and James hears. */
async function failed({ event, error, env }) {
  const job = event?.data?.event?.data || {};
  const message = String(error?.message || error).slice(0, 300);
  await reportProblem(env, {
    title: `Notifications: a ${job.moment || 'notification'} failed after retries`,
    tags: { moment: job.moment || 'unknown' },
    extra: { error: message, dedupe_key: job.dedupe_key },
  });
  if (!job.dedupe_key) return;
  try {
    await db(env).update(
      `notification_log?dedupe_key=eq.${encodeURIComponent(job.dedupe_key)}&status=in.(sending,planned)`,
      {
        status: 'failed',
        reason: `Gave up: ${message}`,
        updated_at: new Date().toISOString(),
      },
    );
  } catch (err) {
    console.error(`[Notifications] could not mark ${job.dedupe_key} failed: ${err.message}`);
  }
}

export function createNotificationFunctions(inngest) {
  const send = inngest.createFunction(
    {
      id: 'notifications-send',
      name: 'Notifications: send one',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 5 }],
      retries: 3,
      cancelOn: [...CANCEL_ON],
      onFailure: failed,
    },
    { event: SEND_EVENT },
    async ({ event, step, env, runId }) => {
      const job = jobFrom(event.data);
      if (job.planned_for) await step.sleepUntil('wait-for-its-time', new Date(job.planned_for));
      return runSend({ step, env, runId }, job);
    },
  );

  const test = inngest.createFunction(
    {
      id: 'notifications-test-send',
      name: 'Notifications: test send',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }],
      retries: 1,
      onFailure: failed,
    },
    { event: TEST_EVENT },
    async ({ event, step, env, runId }) => {
      const data = event.data || {};
      const job = jobFrom({
        ...data,
        moment: data.moment || 'canary',
        dedupe_key: data.dedupe_key || `test:${data.user_id}:${event.id || event.ts || Date.now()}`,
        planned_for: null,
        test: true,
      });
      const out = await runSend({ step, env, runId }, job);
      if (!out.logId || !out.sent) return out;
      // the Lab shows delivery within a minute or two instead of waiting for the hourly read
      await step.sleep('let-expo-deliver', '1m');
      const receipt = await step.run('read-receipt', () => settleReceipts(env, out.logId));
      return { ...out, receipt };
    },
  );

  const receipts = inngest.createFunction(
    {
      id: 'notifications-receipts',
      name: 'Notifications: read delivery receipts',
      retries: 2,
      concurrency: [{ limit: 1 }],
    },
    { cron: RECEIPTS_CRON },
    async ({ step, env }) => {
      const out = await step.run('settle', async () => {
        await cronCheckIn(env, 'notifications-receipts', 'in_progress', RECEIPTS_CRON);
        try {
          const r = await settleDueReceipts(env);
          await cronCheckIn(env, 'notifications-receipts', 'ok', RECEIPTS_CRON);
          return r;
        } catch (err) {
          await cronCheckIn(env, 'notifications-receipts', 'error', RECEIPTS_CRON);
          throw err;
        }
      });
      if (out.failed > 0 && out.failed >= Math.max(3, out.checked / 2)) {
        await step.run('alert', () =>
          reportProblem(env, {
            title: `Notifications: ${out.failed} of ${out.checked} were not delivered`,
            extra: out,
          }),
        );
      }
      return out;
    },
  );

  return [send, test, receipts];
}
