/**
 * Worlds Writer one-shot test function.
 *
 * Trigger: app/worlds.writer-test
 * Required event data: { user_id: string }
 *
 * Steps:
 *   1. collect-signal  — live signal bundle for the user
 *   2. load-active-state — active worlds + active chapters from Supabase
 *   3. classify  — call classifyWorldsWeekly
 *   4. write     — call writeClassifierOutput
 *
 * Returns { classifier_counts, write_result } for inspection on the Inngest
 * run page. Does not trigger itself; caller must send app/worlds.writer-test.
 */

import { Inngest } from 'inngest';
import { classifyWorldsWeekly } from './worldsClassifier';
import { writeClassifierOutput } from './worldsWriter';
import { collectSignalForLiveClassifier } from './signalCollector';
import { loadActiveState } from './worldsActiveState';

// The inngest client is created in index.js and the function is registered
// there. We export the raw function creator so index.js can call it with
// its already-configured inngest instance.
export function createWorldsWriterTest(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    { id: 'worlds-writer-test', name: 'Worlds Writer Test (one-shot)', retries: 0 },
    { event: 'app/worlds.writer-test' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const userId: string = event.data?.user_id;
      if (!userId) throw new Error('user_id is required in event.data');

      // ── Step 1: collect signal ──────────────────────────────────
      const bundle = await step.run('collect-signal', async () =>
        collectSignalForLiveClassifier(userId, env),
      );

      // ── Step 2: load active worlds + chapters ───────────────────
      const { activeWorlds, activeChapters, activeLifeContexts } = await step.run(
        'load-active-state',
        async () => loadActiveState(userId, env),
      );

      // ── Step 3: classify ────────────────────────────────────────
      const classifierOutput = await step.run('classify', async () =>
        classifyWorldsWeekly(bundle, activeWorlds, activeChapters, activeLifeContexts, {
          ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        }),
      );

      // ── Step 4: write ───────────────────────────────────────────
      const writeResult = await step.run('write', async () =>
        writeClassifierOutput(classifierOutput, userId, {
          SUPABASE_URL: env.SUPABASE_URL,
          SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,
        }),
      );

      return {
        classifier_counts: {
          new_worlds: classifierOutput.new_world_candidates.length,
          new_chapters: classifierOutput.new_chapter_candidates.length,
          new_life_contexts: classifierOutput.new_life_context_candidates.length,
          chapter_updates: classifierOutput.chapter_updates.length,
          velocity_updates: classifierOutput.velocity_updates.length,
          reclassifications: classifierOutput.reclassification_proposals.length,
          evolutions: classifierOutput.evolution_proposals.length,
          reactivations: classifierOutput.reactivation_proposals.length,
          input_tokens: classifierOutput.run_metadata.input_tokens,
          output_tokens: classifierOutput.run_metadata.output_tokens,
        },
        write_result: writeResult,
      };
    },
  );
}
