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
import { buildUnifiedUserBundle } from './unifiedUserBundle';
import type { AnalystObservationsInput } from './worldsClassifier';

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
  opts?: {
    useUnifiedBundle?: boolean;
    useAnalystLedger?: boolean;
  };
}): Promise<ProcessWindowResult> {
  const { ownerId, windowStart, windowEnd, env } = params;
  const useUnifiedBundle = params.opts?.useUnifiedBundle === true;
  const useAnalystLedger = params.opts?.useAnalystLedger === true;

  // Step 1: collect signal. Default = legacy backfill collector (byte-identical
  // to production). Flag = unified bundle (range mode), reconstructed into the
  // BackfillSignalBundle shape the classifier expects (11 sections + the
  // backfill discriminator fields). Step A proved the unified bundle a strict
  // superset-or-equal of these sections for Worlds.
  let bundle;
  if (useUnifiedBundle) {
    const u = await buildUnifiedUserBundle(ownerId, env, {
      mode: 'range',
      windowStart,
      windowEnd,
    });
    bundle = {
      mode: 'backfill' as const,
      userId: ownerId,
      collectedAt: u.collectedAt,
      windowStart,
      windowEnd,
      journals: u.raw.journals,
      notes: u.raw.notes,
      todos: u.raw.todos,
      habits: u.raw.habits,
      habitProgress: u.raw.habitProgress,
      chatSummaries: u.raw.chatSummaries,
      temporalAnchors: u.raw.temporalAnchors,
      profileOverrides: u.raw.profileOverrides,
      ritualProgress: u.raw.ritualProgress,
      photoNotes: u.raw.photoNotes,
      calendarSummary: u.raw.calendarSummary,
    };
  } else {
    bundle = await collectSignalForBackfillClassifier(ownerId, env, windowStart, windowEnd);
  }

  // Step 2: load active state fresh so this window sees prior writes
  const { activeWorlds, activeChapters, activeLifeContexts } = await loadActiveState(ownerId, env);

  // Read the latest analyst observations (world_signal_candidates +
  // temporal_observations) from the shared ledger. C-D2: latest observed_for_week
  // only (current signal; evolution comes from active-state delta, not history).
  let analystObservations: AnalystObservationsInput | undefined;
  if (useAnalystLedger) {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };
    // Find the user's most recent analyst observed_for_week.
    const latestRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/observations` +
        `?user_id=eq.${ownerId}&stage=eq.analyst` +
        `&select=observed_for_week&order=observed_for_week.desc&limit=1`,
      { headers },
    );
    const latestRows = latestRes.ok ? await latestRes.json() : [];
    const latestWeek = Array.isArray(latestRows) && latestRows[0]?.observed_for_week;

    if (latestWeek) {
      const obsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/observations` +
          `?user_id=eq.${ownerId}&stage=eq.analyst&observed_for_week=eq.${latestWeek}` +
          `&kind=in.(world_signal_candidate,temporal_observation)` +
          `&select=kind,evidence_snapshot`,
        { headers },
      );
      const obsRows = obsRes.ok ? await obsRes.json() : [];
      const world_signal_candidates = [];
      const temporal_observations = [];
      for (const r of obsRows) {
        if (r.kind === 'world_signal_candidate') world_signal_candidates.push(r.evidence_snapshot);
        else if (r.kind === 'temporal_observation') temporal_observations.push(r.evidence_snapshot);
      }
      analystObservations = { world_signal_candidates, temporal_observations };
    }
  }

  // Step 3: classify
  const classifierOutput = await classifyWorldsWeekly(
    bundle,
    activeWorlds,
    activeChapters,
    activeLifeContexts,
    { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    analystObservations,
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
