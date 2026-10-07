/**
 * Inngest functions for the context pipeline.
 *
 * CONTEXT_PIPELINE (Worker var) decides what the new pipeline may change, and
 * CONTEXT_LIVE_USERS (comma-separated user ids) runs it live for those people
 * while the rest stay in shadow:
 *   off    nothing runs
 *   shadow the ledger fills and every new output is written beside the live one
 *          (DCO v4 into dco_shadow, weekly results into synthesis_runs only)
 *   on     the new outputs are the live ones
 * The ledger and corrections run in shadow and on: they only add to new tables,
 * except corrections, which always apply because the person asked for them.
 */

import { db, userTimezone, localDate, addDays } from './db';
import { cycleOf } from '../../shared/week.js';
import { weekSettings } from '../week/settings';
import { planWindows, readWindow, readCursor, advanceCursor } from './reader';
import { applyCorrection } from './corrections';
import { giveKinds, usersLackingKinds } from './kinds';
import { reviewQuestions } from './questions';
import { buildDcoV4, writeDco } from './daily';
import { refreshDayFrame } from '../brief/frameRefresh';
import {
  weeklyRequestParams,
  applyWeekly,
  submitWeeklyBatch,
  readWeeklyBatch,
  WEEKLY_PROMPT_VERSION,
} from './weekly';
import { anthropicJsonResult } from './llm';
import {
  storyRequestParams,
  applyStory,
  copyStoryIntoLifeMap,
  STORY_PROMPT_VERSION,
} from './story';
import { writeUsageRow } from '../../shared/aiUsage';

/**
 * The pipeline mode, for one person when a user id is given. People listed in
 * CONTEXT_LIVE_USERS get the new pipeline live while everyone else is in shadow.
 */
export function contextMode(env, userId) {
  const raw = env.CONTEXT_PIPELINE || 'shadow';
  const m = ['off', 'shadow', 'on'].includes(raw) ? raw : 'shadow';
  if (m !== 'shadow' || !userId) return m;
  const live = String(env.CONTEXT_LIVE_USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return live.includes(userId) ? 'on' : m;
}

/**
 * The day that ends the last whole week of theirs, in local time: today on
 * their weekly day, otherwise the weekly day before it. With Sunday that is
 * the Sunday that ends the last complete Monday to Sunday week.
 */
export function lastCompleteWeekEnd(tz, weeklyDay, at = new Date()) {
  return cycleOf(localDate(tz, at), weeklyDay).start;
}

/**
 * The context pipeline's functions, and the weekly synthesis by name: the
 * weekly pipe (week/index.js) runs it for each person on their weekly day.
 * @returns {{functions: object[], weekly: object}}
 */
export function createContextFunctions(inngest) {
  // ── Ledger: read new records ─────────────────────────────────────────────
  const ledgerRead = inngest.createFunction(
    {
      id: 'context-ledger-read',
      name: 'Context: read new records into the fact ledger',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 3 }],
      retries: 3,
    },
    { event: 'app/ledger.read' },
    async ({ event, step, env }) => {
      if (contextMode(env) === 'off') return { skipped: 'pipeline off' };
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      // One planning step, then one step per window: Inngest bills each step,
      // so a run with nothing new costs a single step.
      const plan = await step.run('plan', async () => {
        const until = new Date().toISOString();
        const cursor = await readCursor(env, userId);
        // A backfill reads from the start only when forced; otherwise it carries
        // on from the cursor, so overlapping runs never read the same records twice.
        const start = event.data?.from || '2025-01-01T00:00:00Z';
        const since = event.data?.force ? start : cursor?.read_through || start;
        const p = await planWindows(env, userId, since, until);
        if (!p.windows.length)
          await advanceCursor(env, userId, until, { backfilled: !!event.data?.backfill });
        // Someone with no story or Worlds written yet gets them after this read
        // (at most one try a day, so a failing run is not repeated on every read).
        const dayAgo = new Date(Date.now() - 864e5).toISOString();
        const runs = await db(env).select(
          `synthesis_runs?user_id=eq.${userId}&or=(status.eq.applied,created_at.gte.${dayAgo})&select=id&limit=1`,
        );
        return { ...p, since, until, first: !runs.length };
      });
      const runId = `ledger-${userId.slice(0, 8)}-${plan.until}`;
      const totals = {
        windows: plan.windows.length,
        records: 0,
        facts_added: 0,
        facts_updated: 0,
        confirmed: 0,
        questions: 0,
        rejected: 0,
      };
      for (let i = 0; i < plan.windows.length; i++) {
        const w = plan.windows[i];
        const last = i === plan.windows.length - 1;
        const c = await step.run(`read-${i}`, async () => {
          // Another run for this person may already have read part of this window
          // (steps for one person never run at the same time, so this check holds).
          const cur = await readCursor(env, userId);
          const from = cur?.read_through && cur.read_through > w.from ? cur.read_through : w.from;
          if (from >= w.to) {
            if (last)
              await advanceCursor(env, userId, plan.until, { backfilled: !!event.data?.backfill });
            return { records: 0, skipped: 1 };
          }
          const r = await readWindow(env, userId, plan.tz, from, w.to, runId, {
            runSince: plan.since,
          });
          await advanceCursor(env, userId, last ? plan.until : w.to, {
            backfilled: last && !!event.data?.backfill,
          });
          return r;
        });
        for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + c[k];
      }
      if (totals.records > 0) {
        // Every fact gets a kind and a health flag: the read gives them to its
        // own facts, and this gives them to any fact still without (context/kinds.js).
        totals.kinds = await step.run('kinds', () =>
          giveKinds(env, userId, { shadow: contextMode(env, userId) !== 'on' }),
        );
        // Questions written while reading old records are checked against today.
        totals.question_review = await step.run('questions', () =>
          reviewQuestions(env, userId, plan.tz, { shadow: contextMode(env, userId) !== 'on' }),
        );
        // Travel or a set time said today reaches the day frame (the planner,
        // the day card's chip) once it is in the ledger.
        if (!event.data?.backfill && contextMode(env, userId) === 'on') {
          totals.day_frame = await step.run('day-frame', () =>
            refreshDayFrame(env, userId, plan.tz).catch((err) => ({
              error: String(err?.message || err).slice(0, 200),
            })),
          );
        }
      }
      // Someone new, or anyone who has never had a story or Worlds written, gets
      // them straight away instead of waiting for the 1st of the month and
      // Sunday. A catch-up runs these itself.
      if (
        plan.first &&
        totals.records > 0 &&
        !event.data?.backfill &&
        contextMode(env, userId) === 'on'
      ) {
        totals.first_story = await step.invoke('first-story', {
          function: story,
          data: { user_id: userId, direct: true },
          timeout: '1h',
        });
        totals.first_weekly = await step.invoke('first-weekly', {
          function: weekly,
          data: { user_id: userId, direct: true, kind: 'first_look' },
          timeout: '1h',
        });
      }
      return totals;
    },
  );

  // ── Corrections: apply straight away ─────────────────────────────────────
  const correctionApply = inngest.createFunction(
    {
      id: 'context-correction-apply',
      name: 'Context: apply a correction from the person',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }],
      retries: 3,
    },
    { event: 'app/correction.apply' },
    async ({ event, step, env }) => {
      const id = event.data?.correction_id;
      if (!id) throw new Error('correction_id is required');
      return step.run('apply', () => applyCorrection(env, id, `correction-${id}`));
    },
  );

  // ── DCO v4 on demand (the 4am path calls buildDcoV4 from the live worker) ─
  const dcoV4 = inngest.createFunction(
    {
      id: 'context-dco-v4',
      name: 'Context: build DCO v4',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }],
      retries: 2,
    },
    { event: 'app/dco.v4' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      const shadow = event.data?.shadow ?? contextMode(env, userId) !== 'on';
      const review = await step.run('questions', async () => {
        const tz = await userTimezone(env, userId);
        return reviewQuestions(env, userId, tz, { shadow }).catch((err) => ({
          error: String(err?.message || err).slice(0, 200),
        }));
      });
      return step.run('build-and-write', async () => {
        const built = await buildDcoV4(env, userId, {});
        const written = await writeDco(env, userId, built, { shadow });
        return {
          date: built.today,
          shadow,
          written,
          attempts: built.attempts,
          problems: built.problems,
          brief: built.dco.brief,
          today_focus: built.dco.today_focus,
          question_review: review,
        };
      });
    },
  );

  // ── Weekly synthesis ─────────────────────────────────────────────────────
  /**
   * One Claude synthesis job: prepare the request, run it straight away
   * (direct) or through the half-price batch API, then apply the result.
   * Used by the weekly synthesis and the monthly story.
   */
  const synthesisJob = ({ id, name, event: eventName, kind: defaultKind, prepare, apply }) =>
    inngest.createFunction(
      {
        id,
        name,
        concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 3 }],
        retries: 2,
      },
      { event: eventName },
      async ({ event, step, env }) => {
        const userId = event.data?.user_id;
        if (!userId) throw new Error('user_id is required');
        const mode = contextMode(env, userId);
        if (mode === 'off') return { skipped: 'pipeline off' };
        const shadow = event.data?.shadow ?? mode !== 'on';
        const direct = !!event.data?.direct;

        const prepared = await step.run('prepare-and-submit', async () => {
          const p = await prepare(env, userId, event.data || {});
          const d = db(env);
          const [run] = await d.insert('synthesis_runs', [
            {
              user_id: userId,
              kind: event.data?.kind || defaultKind,
              period_start: p.periodStart || null,
              period_end: p.periodEnd || null,
              status: 'queued',
              model: p.params.model,
              prompt_version: p.promptVersion,
              input_stats: {
                input_chars: p.inputChars,
                refs: p.refsSnapshot,
                today: p.today,
                shadow,
                direct,
                ...(p.stats || {}),
              },
            },
          ]);
          if (direct) {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify(p.params),
            });
            const text = await res.text();
            if (!res.ok)
              throw new Error(`${name} direct call ${res.status}: ${text.slice(0, 300)}`);
            const output = anthropicJsonResult(JSON.parse(text));
            await d.update(`synthesis_runs?id=eq.${run.id}`, {
              status: 'completed',
              output,
              completed_at: new Date().toISOString(),
            });
            return { runId: run.id, done: true };
          }
          const batch = await submitWeeklyBatch(env, [{ custom_id: run.id, params: p.params }]);
          await d.update(`synthesis_runs?id=eq.${run.id}`, {
            status: 'submitted',
            batch_id: batch.id,
            submitted_at: new Date().toISOString(),
          });
          return { runId: run.id, batchId: batch.id, done: false };
        });

        if (!prepared.done) {
          let finished = false;
          for (let i = 0; i < 40 && !finished; i++) {
            await step.sleep(`wait-${i}`, i < 6 ? '10m' : '30m');
            finished = await step.run(`poll-${i}`, async () => {
              const r = await readWeeklyBatch(env, prepared.batchId, {
                jobByCustomId: { [prepared.runId]: { userId, runId: prepared.runId, job: id } },
              });
              if (!r.done) return false;
              const res = r.results[prepared.runId];
              const d = db(env);
              if (!res?.ok) {
                await d.update(`synthesis_runs?id=eq.${prepared.runId}`, {
                  status: 'failed',
                  error: res?.error || 'missing result',
                  completed_at: new Date().toISOString(),
                });
                throw new Error(`${name} batch failed: ${res?.error || 'missing result'}`);
              }
              await d.update(`synthesis_runs?id=eq.${prepared.runId}`, {
                status: 'completed',
                output: res.output,
                completed_at: new Date().toISOString(),
              });
              return true;
            });
          }
          if (!finished) throw new Error(`${name} batch did not finish within the polling window`);
        }

        return step.run('apply', async () => {
          const d = db(env);
          const [run] = await d.select(`synthesis_runs?id=eq.${prepared.runId}&select=*`);
          const result = await apply(env, userId, run, { shadow });
          await d.update(`synthesis_runs?id=eq.${run.id}`, {
            status: shadow ? 'shadow' : 'applied',
            applied_at: shadow ? null : new Date().toISOString(),
            output: { ...run.output, applied: result.applied, ...(result.extra || {}) },
          });
          return { runId: run.id, shadow, ...result.applied };
        });
      },
    );

  // ── Weekly synthesis: Life Map, profile, Worlds, Chapters ────────────────
  const weekly = synthesisJob({
    id: 'context-weekly-synthesis',
    name: 'Context: weekly synthesis (Life Map, profile, Worlds, Chapters)',
    event: 'app/synthesis.weekly',
    kind: 'weekly',
    prepare: async (env, userId, data) => {
      const tz = await userTimezone(env, userId);
      // the pipe names the weekly day it runs for; a first look or a catch up
      // takes the last whole week of theirs
      const periodEnd =
        data.period_end || lastCompleteWeekEnd(tz, (await weekSettings(env, userId)).weekly_day);
      const p = await weeklyRequestParams(env, userId, periodEnd);
      return {
        ...p,
        periodStart: addDays(periodEnd, -6),
        periodEnd,
        promptVersion: WEEKLY_PROMPT_VERSION,
      };
    },
    apply: async (env, userId, run, { shadow }) => {
      const r = await applyWeekly(env, userId, run.output, run.input_stats.refs, {
        shadow,
        runId: run.id,
        today: run.input_stats.today,
      });
      // A first run and a catch up write the story before this run makes the
      // Life Map row: the story already written is copied in, with no model call.
      const story = shadow ? null : await copyStoryIntoLifeMap(env, userId);
      return {
        applied: story ? { ...r.applied, story_copied: story.copied } : r.applied,
        extra: { worlds_summary_resolved: r.worldsSummary, previous: r.previous || null },
      };
    },
  });

  // ── Monthly story: milestones, shifts, proud moments, patterns, people ───
  const story = synthesisJob({
    id: 'context-story',
    name: 'Context: monthly story',
    event: 'app/story.monthly',
    kind: 'monthly',
    prepare: async (env, userId) => {
      const p = await storyRequestParams(env, userId);
      return { ...p, periodEnd: p.today, promptVersion: STORY_PROMPT_VERSION, stats: p.counts };
    },
    apply: async (env, userId, run, { shadow }) => {
      const r = await applyStory(env, userId, run.output, run.input_stats.refs, {
        shadow,
        runId: run.id,
        model: run.model,
        today: run.input_stats.today,
      });
      return { applied: r.applied };
    },
  });

  const storyScheduler = inngest.createFunction(
    { id: 'context-story-scheduler', name: 'Context: monthly story scheduler' },
    { cron: '0 12 1 * *' },
    async ({ step, env }) => {
      if (contextMode(env) === 'off') return { skipped: 'pipeline off' };
      const users = await step.run('active', () =>
        db(env).rpc('get_active_people', { active_days: 60 }),
      );
      if (!users.length) return { scheduled: 0 };
      const month = new Date().toISOString().slice(0, 7);
      await step.sendEvent(
        'fan-out',
        users.map((u) => ({
          id: `story-${u.user_id}-${month}`,
          name: 'app/story.monthly',
          data: { user_id: u.user_id, shadow: contextMode(env, u.user_id) !== 'on' },
        })),
      );
      return { scheduled: users.length };
    },
  );

  // The weekly synthesis no longer has a scheduler of its own: each person's
  // weekly pipe runs it on their weekly day, three hours before their weekly
  // slot (week/index.js). It used to leave for everyone on Sunday at 11:00 UTC.

  // ── Catch-up: rebuild one person from their whole history ────────────────
  const catchUpUser = inngest.createFunction(
    {
      id: 'context-catch-up-user',
      name: 'Context: catch one person up',
      concurrency: [{ limit: 2 }],
      retries: 1,
    },
    { event: 'app/context.catch-up-user' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      const shadow = event.data?.shadow ?? contextMode(env, userId) !== 'on';
      const read = await step.invoke('ledger-backfill', {
        function: ledgerRead,
        data: { user_id: userId, backfill: true },
        timeout: '6h',
      });
      const storyRun = await step.invoke('story-direct', {
        function: story,
        data: { user_id: userId, direct: true, shadow },
        timeout: '1h',
      });
      const synth = await step.invoke('weekly-direct', {
        function: weekly,
        data: { user_id: userId, direct: true, shadow, kind: 'catch_up' },
        timeout: '1h',
      });
      const day = await step.invoke('dco-v4', {
        function: dcoV4,
        data: { user_id: userId, shadow },
        timeout: '30m',
      });
      return { read, story: storyRun, synth, day, shadow };
    },
  );

  const catchUp = inngest.createFunction(
    { id: 'context-catch-up', name: 'Context: catch everyone up' },
    { event: 'app/context.catch-up' },
    async ({ event, step, env }) => {
      const ids =
        Array.isArray(event.data?.user_ids) && event.data.user_ids.length
          ? event.data.user_ids
          : (
              await step.run('active', () =>
                db(env).rpc('get_active_people', { active_days: event.data?.active_days || 30 }),
              )
            ).map((u) => u.user_id);
      if (!ids.length) return { users: 0 };
      await step.sendEvent(
        'fan-out',
        ids.map((id) => ({
          name: 'app/context.catch-up-user',
          data:
            event.data?.shadow == null
              ? { user_id: id }
              : { user_id: id, shadow: event.data.shadow },
        })),
      );
      return { users: ids.length };
    },
  );

  // ── Kinds: the one time pass that gives every fact its kind ─────────────
  const kinds = inngest.createFunction(
    {
      id: 'context-kinds',
      name: 'Context: give every fact a kind',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 2 }],
      retries: 2,
    },
    { event: 'app/kinds.give' },
    async ({ event, step, env }) => {
      if (contextMode(env) === 'off') return { skipped: 'pipeline off' };
      const userId = event.data?.user_id;
      if (userId)
        return step.run('give', () =>
          giveKinds(env, userId, {
            maxCalls: 20,
            shadow: event.data?.shadow ?? contextMode(env, userId) !== 'on',
          }),
        );
      const ids = await step.run('who', () => usersLackingKinds(env));
      if (ids.length)
        await step.sendEvent(
          'fan-out',
          ids.map((id) => ({ name: 'app/kinds.give', data: { user_id: id } })),
        );
      return { users: ids.length };
    },
  );

  return {
    functions: [
      ledgerRead,
      correctionApply,
      kinds,
      dcoV4,
      weekly,
      story,
      storyScheduler,
      catchUpUser,
      catchUp,
    ],
    weekly,
  };
}

/**
 * Steps the hourly dispatcher adds: who has new records to read, and any
 * correction that arrived without its event.
 */
export async function hourlyContextEvents(env) {
  if (contextMode(env) === 'off') return [];
  const d = db(env);
  const hourKey = new Date().toISOString().slice(0, 13);
  const due = await d.rpc('ledger_users_due', { active_days: 30 });
  const events = due.map((u) => ({
    id: `ledger-${u.user_id}-${hourKey}`,
    name: 'app/ledger.read',
    data: { user_id: u.user_id },
  }));
  const pending = await d.select(
    `user_corrections?status=eq.received&created_at=lt.${encodeURIComponent(new Date(Date.now() - 60e3).toISOString())}&select=id,user_id&limit=50`,
  );
  for (const c of pending)
    events.push({
      id: `correction-${c.id}`,
      name: 'app/correction.apply',
      data: { correction_id: c.id, user_id: c.user_id },
    });
  return events;
}

export { writeUsageRow };
