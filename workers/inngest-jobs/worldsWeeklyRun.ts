/**
 * Worlds Weekly Run
 *
 * Trigger:   app/worlds.weekly-run
 * Triggered: by worldsWeeklyScheduler (cron fan-out) or manually for testing.
 * Required event data: { user_id: string }
 *
 * Runs the full worlds pipeline for the past 28 days for a single user and
 * writes a worlds.weekly_run_completed event when done.
 */

import { Inngest } from 'inngest';
import { createClient } from '@supabase/supabase-js';
import { processWorldsWindow } from './processWorldsWindow';

export function createWorldsWeeklyRun(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    { id: 'worlds-weekly-run', name: 'Worlds Weekly Run', retries: 1 },
    { event: 'app/worlds.weekly-run' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const userId: string = event.data?.user_id;
      if (!userId) throw new Error('user_id is required in event.data');

      const windowEnd = new Date().toISOString();
      const windowStart = new Date(
        Date.now() - 28 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // ── Step 1: process the window ───────────────────────────────
      const { classifierCounts, writeResult } = await step.run(
        'process-window',
        async () =>
          processWorldsWindow({
            ownerId: userId,
            windowStart,
            windowEnd,
            env,
          }),
      );

      // ── Step 2: record completion event in Supabase ──────────────
      await step.run('write-completed-event', async () => {
        const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
          auth: { persistSession: false },
        });
        const { error } = await db.from('events').insert({
          owner_id: userId,
          kind: 'worlds.weekly_run_completed',
          payload_json: {
            run_id: writeResult.run_id,
            window_start: windowStart,
            window_end: windowEnd,
            classifier_counts: classifierCounts,
            write_result: writeResult,
          },
        });
        if (error) throw error;
      });

      // ── Return rollup for Inngest UI visibility ──────────────────
      return {
        user_id: userId,
        window_start: windowStart,
        window_end: windowEnd,
        classifier_counts: classifierCounts,
        write_result: writeResult,
      };
    },
  );
}
