/**
 * Worlds Weekly Scheduler
 *
 * Trigger: cron '0 10 * * 0'  — Sunday 10:00 UTC (3am PST / 2am PDT)
 *
 * Queries cortex_preferences for all testers and fans out one
 * app/worlds.weekly-run event per user. Each fan-out event is handled
 * independently by worldsWeeklyRun so a single-user failure does not
 * block others.
 */

import { Inngest } from 'inngest';
import { createClient } from '@supabase/supabase-js';

export function createWorldsWeeklyScheduler(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    { id: 'worlds-weekly-scheduler', name: 'Worlds Weekly Scheduler' },
    { cron: '0 10 * * 0' },
    async ({ step, env }: { step: any; env: any }) => {
      // ── Step 1: resolve tester user ids ─────────────────────────
      const userIds: string[] = await step.run('resolve-testers', async () => {
        const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
          auth: { persistSession: false },
        });
        const { data, error } = await db
          .from('cortex_preferences')
          .select('owner_id')
          .eq('is_tester', true);
        if (error) throw error;
        return (data ?? []).map((row: { owner_id: string }) => row.owner_id);
      });

      // ── Step 2: fan out one weekly-run event per user ────────────
      await step.run('fan-out', async () => {
        await inngest.send(
          userIds.map((uid) => ({
            name: 'app/worlds.weekly-run' as const,
            data: { user_id: uid },
          })),
        );
      });

      return {
        scheduled_count: userIds.length,
        user_ids: userIds,
      };
    },
  );
}
