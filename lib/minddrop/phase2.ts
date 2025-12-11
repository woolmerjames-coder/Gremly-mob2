/**
 * Phase 2 Enrichment
 *
 * Runs AI enrichment to extract smart titles, tags, time estimates, dates, etc.
 * Runs asynchronously after Phase 1 classification completes.
 */

import type { MindDropBucket, LogSubtype } from './types';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { env, getEnv } from '../env';

// --- Types ---

export interface Phase2Result {
  smartTitle: string;
  tags: string[];
  timeEstimateMinutes: number | null;
  extractedDate: string | null;
  extractedFrequency: string | null;
  people: string[];
}

// --- Constants ---

const PHASE2_TIMEOUT_MS = 8000;
const PHASE2_RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 1;

// --- Helpers ---

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate fallback title from text (first 60 chars, clean up)
 */
function generateFallbackTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 60) return cleaned;
  return cleaned.substring(0, 57) + '...';
}

/**
 * Call the cortex-proxy enrich-phase2 endpoint
 */
async function callEnrichAPI(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
): Promise<Phase2Result | null> {
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[Phase2] Missing cortex URL or anon key');
    return null;
  }

  const currentDate = new Date().toISOString().split('T')[0];

  // Create timeout promise
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHASE2_TIMEOUT_MS);

  try {
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        type: 'enrich-phase2',
        text: text.substring(0, 2000), // Limit to 2000 chars
        bucket,
        subtype,
        currentDate,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.log('[Phase2] API returned non-ok status', { status: res.status });
      return null;
    }

    const json = await res.json();

    // Check for API-level errors
    if (json.error) {
      console.log('[Phase2] API returned error', { error: json.error });
      return null;
    }

    // Map API response to Phase2Result
    return {
      smartTitle: json.smart_title || generateFallbackTitle(text),
      tags: Array.isArray(json.tags) ? json.tags : [],
      timeEstimateMinutes: json.time_estimate_minutes ?? null,
      extractedDate: json.extracted_date ?? null,
      extractedFrequency: json.extracted_frequency ?? null,
      people: Array.isArray(json.people) ? json.people : [],
    };
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = (err as Error).name === 'AbortError';
    console.log('[Phase2] API call failed', {
      error: isAbort ? 'timeout' : String(err),
    });
    return null;
  }
}

// --- Main Function ---

/**
 * Run Phase 2 enrichment: extract smart titles, tags, time estimates, etc.
 *
 * @param entityId - The ID of the entity to enrich
 * @param text - The original text to extract from
 * @param bucket - The classified bucket
 * @param subtype - The subtype (for logs)
 * @param repo - The repository to update the entity
 * @returns Phase2Result or null if enrichment failed/skipped
 */
export async function runPhase2(
  entityId: string,
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
  repo: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Phase2Result | null> {
  // 1. Check feature flag
  if (!FEATURE_FLAGS.PHASE2_ENRICHMENT_ENABLED) {
    console.log('[Phase2] Enrichment disabled by feature flag');
    return null;
  }

  // 2. Get entity to check current stage
  console.log('[Phase2] Getting entity', { entityId, bucket });
  let entity: any;
  try {
    entity = await repo.getById(entityId);
    console.log('[Phase2] Got entity', { entityId, exists: !!entity });
  } catch (err) {
    console.log('[Phase2] Failed to get entity', { entityId, bucket, error: String(err) });
    return null;
  }

  if (!entity) {
    console.log('[Phase2] Entity not found', { entityId });
    return null;
  }

  // 3. Guard: prevent duplicate enrichment
  const currentStage = entity.views?.minddrop_stage;
  if (currentStage === 'enriched' || currentStage === 'enrichment_failed') {
    console.log('[Phase2] Skipping - already processed', { entityId, stage: currentStage });
    return null;
  }

  // 4. Update entity to 'enriching' stage
  try {
    await repo.update({
      id: entityId,
      patch: { views: { ...entity.views, minddrop_stage: 'enriching' } },
    });
    console.log('[Phase2] Started enrichment', { entityId, bucket, subtype });
  } catch (err) {
    console.log('[Phase2] Failed to set enriching stage', { entityId, error: String(err) });
    // Continue anyway - enrichment is more important than stage tracking
  }

  // 5. Call API with retry logic
  let result: Phase2Result | null = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    attempts++;
    console.log('[Phase2] Attempt', { attempt: attempts, maxRetries: MAX_RETRIES + 1 });

    result = await callEnrichAPI(text, bucket, subtype);

    if (result) {
      break; // Success
    }

    // If not last attempt, wait before retry
    if (attempts <= MAX_RETRIES) {
      console.log('[Phase2] Retrying after delay', { delayMs: PHASE2_RETRY_DELAY_MS });
      await sleep(PHASE2_RETRY_DELAY_MS);
    }
  }

  // 6. Handle success
  if (result) {
    try {
      // Build update payload based on bucket type
      const updatePayload: Record<string, any> = {
        views: {
          ...entity.views,
          minddrop_stage: 'enriched',
          ai_pending: false,
        },
        tags: result.tags.length > 0 ? result.tags : undefined,
      };

      // Set title/name based on entity type
      if (bucket === 'todo') {
        updatePayload.name = result.smartTitle;
        if (result.timeEstimateMinutes !== null) {
          updatePayload.time_estimate_minutes = result.timeEstimateMinutes;
        }
        if (result.extractedDate) {
          updatePayload.due_date = result.extractedDate;
        }
      } else if (bucket === 'habit') {
        updatePayload.name = result.smartTitle;
        updatePayload.title = result.smartTitle;
        if (result.extractedFrequency) {
          updatePayload.frequency = result.extractedFrequency;
        }
      } else {
        // log (note)
        updatePayload.title = result.smartTitle;
      }

      await repo.update({ id: entityId, patch: updatePayload });

      console.log('[Phase2] Enrichment complete', {
        entityId,
        smartTitle: result.smartTitle.substring(0, 30) + '...',
        tagsCount: result.tags.length,
        hasTimeEstimate: result.timeEstimateMinutes !== null,
        hasDate: result.extractedDate !== null,
      });

      return result;
    } catch (err) {
      console.log('[Phase2] Failed to update entity with enrichment', {
        entityId,
        error: String(err),
      });
      // Fall through to failure handling
    }
  }

  // 7. Handle failure
  console.log('[Phase2] Enrichment failed, setting fallback', { entityId, attempts });

  const fallbackTitle = generateFallbackTitle(text);

  try {
    const failurePayload: Record<string, any> = {
      views: {
        ...entity.views,
        minddrop_stage: 'enrichment_failed',
        ai_failed: true,
        ai_pending: false,
      },
    };

    // Set fallback title
    if (bucket === 'todo' || bucket === 'habit') {
      failurePayload.name = fallbackTitle;
    } else {
      failurePayload.title = fallbackTitle;
    }

    await repo.update({ id: entityId, patch: failurePayload });
  } catch (err) {
    console.log('[Phase2] Failed to set failure state', { entityId, error: String(err) });
  }

  return null;
}
