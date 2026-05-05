/**
 * processWorldsWindow
 *
 * Plain async helper (no Inngest step.run) that runs the full worlds pipeline
 * for a single time window:
 *   1. Collect backfill signal bundle for the window range.
 *   2. Load active state (worlds + chapters, including closed).
 *   3. Classify via classifyWorldsWeekly.
 *   4. Write output to Supabase via writeClassifierOutput.
 *
 * Callers (worldsBootstrap, worldsWeeklyRun) wrap this in their own
 * step.run() as appropriate.
 */

import { collectSignalForBackfillClassifier } from './signalCollector';
import { loadActiveState } from './worldsActiveState';
import { classifyWorldsWeekly } from './worldsClassifier';
import { writeClassifierOutput, WriteResult } from './worldsWriter';

// ─── Env type ─────────────────────────────────────────────────────────────────

export interface ProcessWindowEnv {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

// ─── Return type ─────────────────────────────────────────────────────────────

export interface ClassifierCounts {
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

export interface ProcessWindowResult {
  classifierCounts: ClassifierCounts;
  writeResult: WriteResult;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processWorldsWindow(params: {
  ownerId: string;
  windowStart: string;
  windowEnd: string;
  env: ProcessWindowEnv;
}): Promise<ProcessWindowResult> {
  const { ownerId, windowStart, windowEnd, env } = params;

  // Step 1: collect backfill signal bundle for this window range
  const bundle = await collectSignalForBackfillClassifier(
    ownerId,
    env,
    windowStart,
    windowEnd,
  );

  // Step 2: load active state fresh so this window sees prior writes
  const { activeWorlds, activeChapters, activeLifeContexts } = await loadActiveState(ownerId, env);

  // Step 3: classify
  const classifierOutput = await classifyWorldsWeekly(
    bundle,
    activeWorlds,
    activeChapters,
    activeLifeContexts,
    { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
  );

  // Step 4: write to Supabase
  const writeResult = await writeClassifierOutput(classifierOutput, ownerId, {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,
  });

  return {
    classifierCounts: {
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
    writeResult,
  };
}
