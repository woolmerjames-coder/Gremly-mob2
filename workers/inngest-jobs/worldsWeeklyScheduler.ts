/**
 * Worlds Weekly Scheduler
 *
 * Trigger: cron '0 10 * * 0'  — Sunday 10:00 UTC (3am PST / 2am PDT)
 *
 * Takes everyone active in the last 30 days and fans out one
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
      // ── Step 1: everyone active in the last 30 days, whatever their tier ──
      const userIds: string[] = await step.run('resolve-active-users', async () => {
        const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
          auth: { persistSession: false },
        });
        const { data, error } = await db.rpc('get_active_people', { active_days: 30 });
        if (error) throw error;
        return (data ?? []).map((row: { user_id: string }) => row.user_id);
      });

      // ── Step 2: fan out one weekly-run event per user ────────────
      if (userIds.length === 0) return { scheduled_count: 0, user_ids: [] };
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
