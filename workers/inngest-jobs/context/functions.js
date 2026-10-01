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
import { planWindows, readWindow, readCursor, advanceCursor } from './reader';
import { applyCorrection } from './corrections';
import { buildDcoV4, writeDco } from './daily';
import { weeklyRequestParams, applyWeekly, submitWeeklyBatch, readWeeklyBatch, WEEKLY_PROMPT_VERSION } from './weekly';
import { anthropicJsonResult } from './llm';
import { writeUsageRow } from '../aiUsage';

/**
 * The pipeline mode, for one person when a user id is given. People listed in
 * CONTEXT_LIVE_USERS get the new pipeline live while everyone else is in shadow.
 */
export function contextMode(env, userId) {
  const raw = env.CONTEXT_PIPELINE || 'shadow';
  const m = ['off', 'shadow', 'on'].includes(raw) ? raw : 'shadow';
  if (m !== 'shadow' || !userId) return m;
  const live = String(env.CONTEXT_LIVE_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return live.includes(userId) ? 'on' : m;
}

/** The Sunday that ends the last complete Monday to Sunday week, in local time. */
export function lastCompleteWeekEnd(tz) {
  const today = localDate(tz);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sunday
  return dow === 0 ? today : addDays(today, -dow);
}

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
        if (!p.windows.length) await advanceCursor(env, userId, until, { backfilled: !!event.data?.backfill });
        return { ...p, since, until };
      });
      const runId = `ledger-${userId.slice(0, 8)}-${plan.until}`;
      const totals = { windows: plan.windows.length, records: 0, facts_added: 0, facts_updated: 0, confirmed: 0, questions: 0, rejected: 0 };
      for (let i = 0; i < plan.windows.length; i++) {
        const w = plan.windows[i];
        const last = i === plan.windows.length - 1;
        const c = await step.run(`read-${i}`, async () => {
          const r = await readWindow(env, userId, plan.tz, w.from, w.to, runId);
          await advanceCursor(env, userId, last ? plan.until : w.to, { backfilled: last && !!event.data?.backfill });
          return r;
        });
        for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + c[k];
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
    { id: 'context-dco-v4', name: 'Context: build DCO v4', concurrency: [{ key: 'event.data.user_id', limit: 1 }], retries: 2 },
    { event: 'app/dco.v4' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      const shadow = event.data?.shadow ?? contextMode(env, userId) !== 'on';
      return step.run('build-and-write', async () => {
        const built = await buildDcoV4(env, userId, {});
        const written = await writeDco(env, userId, built, { shadow });
        return { date: built.today, shadow, written, attempts: built.attempts, problems: built.problems, brief: built.dco.brief, today_focus: built.dco.today_focus };
      });
    },
  );

  // ── Weekly synthesis ─────────────────────────────────────────────────────
  const weekly = inngest.createFunction(
    {
      id: 'context-weekly-synthesis',
      name: 'Context: weekly synthesis (Life Map, profile, Worlds)',
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 3 }],
      retries: 2,
    },
    { event: 'app/synthesis.weekly' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      const mode = contextMode(env, userId);
      if (mode === 'off') return { skipped: 'pipeline off' };
      const shadow = event.data?.shadow ?? mode !== 'on';
      const direct = !!event.data?.direct;

      const prepared = await step.run('prepare-and-submit', async () => {
        const tz = await userTimezone(env, userId);
        const periodEnd = event.data?.period_end || lastCompleteWeekEnd(tz);
        const { params, refsSnapshot, today, inputChars } = await weeklyRequestParams(env, userId, periodEnd);
        const d = db(env);
        const [run] = await d.insert('synthesis_runs', [
          {
            user_id: userId,
            kind: event.data?.kind || 'weekly',
            period_start: addDays(periodEnd, -6),
            period_end: periodEnd,
            status: 'queued',
            model: params.model,
            prompt_version: WEEKLY_PROMPT_VERSION,
            input_stats: { input_chars: inputChars, refs: refsSnapshot, today, shadow, direct },
          },
        ]);
        if (direct) {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(params),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(`Weekly direct call ${res.status}: ${text.slice(0, 300)}`);
          const output = anthropicJsonResult(JSON.parse(text));
          await d.update(`synthesis_runs?id=eq.${run.id}`, { status: 'completed', output, completed_at: new Date().toISOString() });
          return { runId: run.id, done: true };
        }
        const batch = await submitWeeklyBatch(env, [{ custom_id: run.id, params }]);
        await d.update(`synthesis_runs?id=eq.${run.id}`, { status: 'submitted', batch_id: batch.id, submitted_at: new Date().toISOString() });
        return { runId: run.id, batchId: batch.id, done: false };
      });

      if (!prepared.done) {
        let finished = false;
        for (let i = 0; i < 40 && !finished; i++) {
          await step.sleep(`wait-${i}`, i < 6 ? '10m' : '30m');
          finished = await step.run(`poll-${i}`, async () => {
            const r = await readWeeklyBatch(env, prepared.batchId, { jobByCustomId: { [prepared.runId]: { userId, runId: prepared.runId } } });
            if (!r.done) return false;
            const res = r.results[prepared.runId];
            const d = db(env);
            if (!res?.ok) {
              await d.update(`synthesis_runs?id=eq.${prepared.runId}`, { status: 'failed', error: res?.error || 'missing result', completed_at: new Date().toISOString() });
              throw new Error(`Weekly batch failed: ${res?.error || 'missing result'}`);
            }
            await d.update(`synthesis_runs?id=eq.${prepared.runId}`, { status: 'completed', output: res.output, completed_at: new Date().toISOString() });
            return true;
          });
        }
        if (!finished) throw new Error('Weekly batch did not finish within the polling window');
      }

      return step.run('apply', async () => {
        const d = db(env);
        const [run] = await d.select(`synthesis_runs?id=eq.${prepared.runId}&select=*`);
        const result = await applyWeekly(env, userId, run.output, run.input_stats.refs, { shadow, runId: run.id, today: run.input_stats.today });
        await d.update(`synthesis_runs?id=eq.${run.id}`, {
          status: shadow ? 'shadow' : 'applied',
          applied_at: shadow ? null : new Date().toISOString(),
          output: { ...run.output, applied: result.applied, worlds_summary_resolved: result.worldsSummary, previous: result.previous || null },
        });
        return { runId: run.id, shadow, ...result.applied };
      });
    },
  );

  // ── Weekly scheduler: Sundays after the Worlds structure run ─────────────
  const weeklyScheduler = inngest.createFunction(
    { id: 'context-weekly-scheduler', name: 'Context: weekly synthesis scheduler' },
    { cron: '0 11 * * 0' },
    async ({ step, env }) => {
      const mode = contextMode(env);
      if (mode === 'off') return { skipped: 'pipeline off' };
      const users = await step.run('active', () => db(env).rpc('get_active_people', { active_days: 30 }));
      if (!users.length) return { scheduled: 0 };
      await step.sendEvent(
        'fan-out',
        users.map((u) => ({ id: `weekly-synthesis-${u.user_id}-${localDate(u.timezone || 'America/Los_Angeles')}`, name: 'app/synthesis.weekly', data: { user_id: u.user_id, shadow: contextMode(env, u.user_id) !== 'on' } })),
      );
      return { scheduled: users.length, mode };
    },
  );

  // ── Catch-up: rebuild one person from their whole history ────────────────
  const catchUpUser = inngest.createFunction(
    { id: 'context-catch-up-user', name: 'Context: catch one person up', concurrency: [{ limit: 2 }], retries: 1 },
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
      return { read, synth, day, shadow };
    },
  );

  const catchUp = inngest.createFunction(
    { id: 'context-catch-up', name: 'Context: catch everyone up' },
    { event: 'app/context.catch-up' },
    async ({ event, step, env }) => {
      const ids = Array.isArray(event.data?.user_ids) && event.data.user_ids.length
        ? event.data.user_ids
        : (await step.run('active', () => db(env).rpc('get_active_people', { active_days: event.data?.active_days || 30 }))).map((u) => u.user_id);
      if (!ids.length) return { users: 0 };
      await step.sendEvent(
        'fan-out',
        ids.map((id) => ({ name: 'app/context.catch-up-user', data: event.data?.shadow == null ? { user_id: id } : { user_id: id, shadow: event.data.shadow } })),
      );
      return { users: ids.length };
    },
  );

  return [ledgerRead, correctionApply, dcoV4, weekly, weeklyScheduler, catchUpUser, catchUp];
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
  const events = due.map((u) => ({ id: `ledger-${u.user_id}-${hourKey}`, name: 'app/ledger.read', data: { user_id: u.user_id } }));
  const pending = await d.select(
    `user_corrections?status=eq.received&created_at=lt.${encodeURIComponent(new Date(Date.now() - 60e3).toISOString())}&select=id,user_id&limit=50`,
  );
  for (const c of pending) events.push({ id: `correction-${c.id}`, name: 'app/correction.apply', data: { correction_id: c.id, user_id: c.user_id } });
  return events;
}

export { writeUsageRow };
