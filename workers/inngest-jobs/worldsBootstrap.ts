/**
 * Worlds Bootstrap (one-shot)
 *
 * Trigger: app/worlds.bootstrap
 * Required event data: { user_id: string }
 * Optional event data:
 *   window_days?: number           default 28
 *   stride_days?: number           default 14
 *   earliest_signal_date?: string  ISO date; auto-detected if omitted
 *
 * Runs the classifier over every historical window from the user's earliest
 * signal date through today, writing each window's output to Supabase via
 * writeClassifierOutput. Active state is loaded fresh before each window so
 * window N+1 sees exactly what window N committed.
 *
 * This is the production bootstrap pattern: run once per existing user to
 * seed worlds/chapters/life_contexts from full signal history. The weekly
 * cron takes over after this completes.
 *
 * Each window is its own Inngest step so the function is resumable: if a
 * window fails, Inngest retries from that step. The writer is idempotent
 * on inserts (name/title dedup) and safe to re-apply updates.
 *
 * Sonnet 4.6 pricing: $3/M input tokens, $15/M output tokens.
 */

import { Inngest } from 'inngest';
import { createClient } from '@supabase/supabase-js';
import { processWorldsWindow } from './processWorldsWindow';
import {
  findEarliestDropDate,
  computeWindows,
} from './worldsHarness';

// ─── Sonnet 4.6 pricing constants ────────────────────────────────────────────
const COST_PER_M_INPUT = 3;   // USD per million input tokens
const COST_PER_M_OUTPUT = 15;  // USD per million output tokens

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_M_INPUT +
    (outputTokens / 1_000_000) * COST_PER_M_OUTPUT
  );
}

// ─── Helper types ─────────────────────────────────────────────────────────────

interface ClassifierCounts {
  new_worlds: number;
  new_chapters: number;
  new_life_contexts: number;
  chapter_updates: number;
  velocity_updates: number;
  reclassifications: number;
  evolutions: number;
  reactivations: number;
  input_tokens: number;
  output_tokens: number;
}

interface WindowSummary {
  window_index: number;
  window_start: string;
  window_end: string;
  classifier_counts: ClassifierCounts;
  write_result: any;
}

// ─── Factory export ───────────────────────────────────────────────────────────

export function createWorldsBootstrap(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    { id: 'worlds-bootstrap', name: 'Worlds Bootstrap (one-shot)', retries: 0 },
    { event: 'app/worlds.bootstrap' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const userId: string = event.data?.user_id;
      if (!userId) throw new Error('user_id is required in event.data');

      const windowDays: number = event.data?.window_days ?? 28;
      const strideDays: number = event.data?.stride_days ?? 14;

      // ── Step 1: resolve window plan ──────────────────────────────
      const windows = await step.run('resolve-windows', async () => {
        const earliestDate: string =
          event.data?.earliest_signal_date ??
          (await findEarliestDropDate(userId, env));
        const today = new Date().toISOString();
        return computeWindows(earliestDate, today, windowDays, strideDays);
      });

      const totalWindows: number = windows.length;
      const perWindowSummaries: WindowSummary[] = [];

      // ── Step 2: process each window ─────────────────────────────
      for (const w of windows) {
        const windowSummary: WindowSummary = await step.run(
          `window-${w.index}`,
          async () => {
            const { classifierCounts, writeResult } = await processWorldsWindow({
              ownerId: userId,
              windowStart: w.start,
              windowEnd: w.end,
              env,
            });
            return {
              window_index: w.index,
              window_start: w.start,
              window_end: w.end,
              classifier_counts: classifierCounts,
              write_result: writeResult,
            };
          },
        );

        perWindowSummaries.push(windowSummary);
      }

      // Aggregate token totals across all windows
      const totalInputTokens = perWindowSummaries.reduce(
        (sum, w) => sum + w.classifier_counts.input_tokens,
        0,
      );
      const totalOutputTokens = perWindowSummaries.reduce(
        (sum, w) => sum + w.classifier_counts.output_tokens,
        0,
      );
      const estimatedCostUsd = estimateCost(totalInputTokens, totalOutputTokens);

      // ── Step 3: write bootstrap-completed event ──────────────────
      await step.run('write-completed-event', async () => {
        const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
          auth: { persistSession: false },
        });
        const { error } = await db.from('events').insert({
          owner_id: userId,
          kind: 'worlds.bootstrap_completed',
          payload_json: {
            user_id: userId,
            total_windows: totalWindows,
            total_input_tokens: totalInputTokens,
            total_output_tokens: totalOutputTokens,
            estimated_cost_usd: estimatedCostUsd,
            per_window_summaries: perWindowSummaries,
          },
        });
        if (error) throw error;
      });

      // ── Step 4: return rollup ────────────────────────────────────
      return {
        user_id: userId,
        total_windows: totalWindows,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        estimated_cost_usd: estimatedCostUsd,
        per_window_summaries: perWindowSummaries,
      };
    },
  );
}
