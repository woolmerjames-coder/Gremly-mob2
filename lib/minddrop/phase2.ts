/**
 * Phase 2 Enrichment
 *
 * Runs AI enrichment to extract smart titles, tags, time estimates, dates, etc.
 * Runs asynchronously after Phase 1 classification completes.
 */

import type { MindDropBucket, LogSubtype } from './types';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { env, getEnv } from '../env';
import { getDateService } from '../date/DateService';
import { validateEnrichmentResult } from './phase2Validation';
import { eventBus } from '../events/EventBus';
import { callEnrichPhase2Streaming, Phase2EnrichmentResult } from '../cortex/CortexClient';

// --- Types ---

export interface Phase2Result {
  smartTitle: string;
  tags: string[];
  timeEstimateMinutes: number | null;
  timeWindow: 'morning' | 'day' | 'evening' | null;
  extractedDate: string | null;
  extractedStartDate: string | null;
  extractedFrequency: string | null;
  people: string[];
  confirmationMessage: string | null;
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

  // Get date context from DateService (single source of truth)
  const dateService = getDateService();
  const currentDate = dateService.getCurrentDate();
  const timezone = dateService.getTimezone();
  const dayOfWeek = dateService.getDayOfWeek();

  console.log('[Phase2] Date context', {
    currentDate,
    timezone,
    dayOfWeek,
  });

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
        timezone,
        dayOfWeek,
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
      timeWindow: json.time_window ?? null,
      extractedDate: json.extracted_date ?? null,
      extractedStartDate: json.extracted_start_date ?? null,
      extractedFrequency: json.extracted_frequency ?? null,
      people: Array.isArray(json.people) ? json.people : [],
      confirmationMessage: json.confirmation_message ?? null,
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
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const mark = (label: string) => {
    timing[label] = Date.now() - t0;
    console.log(`[Phase2:Timing] ${label}: ${timing[label]}ms`);
  };

  mark('start');

  // 1. Check feature flag
  if (!FEATURE_FLAGS.PHASE2_ENRICHMENT_ENABLED) {
    console.log('[Phase2] Enrichment disabled by feature flag');
    return null;
  }
  mark('flag_check');

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
  mark('entity_fetched');

  // 3. Guard: prevent duplicate enrichment
  const currentStage = entity.views?.minddrop_stage;
  if (currentStage === 'enriched' || currentStage === 'enrichment_failed') {
    console.log('[Phase2] Skipping - already processed', { entityId, stage: currentStage });
    return null;
  }

  // 4. Start enrichment (no DB write needed - UI tracks state locally via optimistic updates)
  console.log('[Phase2] Started enrichment', { entityId, bucket, subtype });

  // 5. Call API with retry logic
  let result: Phase2Result | null = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    attempts++;
    console.log('[Phase2] Attempt', { attempt: attempts, maxRetries: MAX_RETRIES + 1 });

    result = await callEnrichAPI(text, bucket, subtype);
    mark('api_returned');

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
      // 6a. Validate and correct AI output
      const validation = validateEnrichmentResult(result, text, bucket);

      if (!validation.isValid) {
        console.log('[Phase2] Validation issues found', {
          entityId,
          issues: validation.issues,
        });

        // Apply corrections if any
        if (validation.correctedResult) {
          if (validation.correctedResult.smartTitle !== undefined) {
            result.smartTitle = validation.correctedResult.smartTitle;
          }
          if (validation.correctedResult.people !== undefined) {
            result.people = validation.correctedResult.people;
          }
          if (validation.correctedResult.extractedDate !== undefined) {
            result.extractedDate = validation.correctedResult.extractedDate;
          }
          if (validation.correctedResult.timeEstimateMinutes !== undefined) {
            result.timeEstimateMinutes = validation.correctedResult.timeEstimateMinutes;
          }
        }
      }
      mark('validation_complete');

      // Build update payload based on bucket type
      // Merge people[] into tags as @name format for persistence
      const peopleTags = (result.people || [])
        .map((name: string) => {
          const normalized = name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
          return normalized ? `@${normalized}` : null;
        })
        .filter((t): t is string => t !== null && t.length >= 2);

      // Combine category tags + people tags (deduped)
      const allTags = Array.from(new Set([...result.tags, ...peopleTags]));

      const updatePayload: Record<string, any> = {
        views: {
          ...entity.views,
          minddrop_stage: 'enriched',
          ai_pending: false,
          confirmation_message: result.confirmationMessage, // AI-generated Gremly voice
        },
        tags: allTags.length > 0 ? allTags : undefined,
      };

      // Set title/name based on entity type
      if (bucket === 'todo') {
        updatePayload.name = result.smartTitle;
        // Preserve original text in body if not already set
        if (!entity.body) {
          updatePayload.body = text;
        }
        if (result.timeEstimateMinutes !== null) {
          updatePayload.time_estimate_minutes = result.timeEstimateMinutes;
        }
        if (result.timeWindow) {
          updatePayload.time_window = result.timeWindow;
        }
        if (result.extractedDate) {
          updatePayload.due_date = result.extractedDate;
          // CRITICAL: due_day is the canonical field for Today page visibility
          // Extract YYYY-MM-DD portion, handling both "2025-12-13" and "2025-12-13T09:00:00" formats
          const dueDayValue = result.extractedDate.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(dueDayValue)) {
            updatePayload.due_day = dueDayValue;
          }
        }
      } else if (bucket === 'habit') {
        updatePayload.name = result.smartTitle;
        updatePayload.title = result.smartTitle;
        // Preserve original text in notes if not already set
        if (!entity.notes) {
          updatePayload.notes = text;
        }
        if (result.extractedFrequency) {
          updatePayload.frequency = result.extractedFrequency;
        }
        if (result.timeWindow) {
          updatePayload.time_window = result.timeWindow;
        }
        // Set start_date if extracted (only if not already set)
        if (result.extractedStartDate && !entity.start_date) {
          updatePayload.start_date = result.extractedStartDate;
        }
      } else {
        // log (note)
        updatePayload.title = result.smartTitle;
        // Preserve original text in body if not already set
        if (!entity.body || entity.body === entity.title) {
          updatePayload.body = text;
        }
      }

      mark('before_final_save');
      await repo.update({ id: entityId, patch: updatePayload });
      mark('final_save_complete');

      console.log('[Phase2] Enrichment complete', {
        entityId,
        smartTitle: result.smartTitle.substring(0, 30) + '...',
        tagsCount: result.tags.length,
        hasTimeEstimate: result.timeEstimateMinutes !== null,
        hasDate: result.extractedDate !== null,
        hasStartDate: result.extractedStartDate !== null,
      });

      // Emit event for UI to update card smoothly without refresh
      eventBus.emit('entity:enriched', {
        entityId,
        smartTitle: result.smartTitle,
        tags: result.tags,
        timeEstimate: result.timeEstimateMinutes,
        time_window: result.timeWindow,
        dueDate: result.extractedDate,
        confirmationMessage: result.confirmationMessage,
        frequency: result.extractedFrequency ?? null,
        hasPhotos: entity.views?.has_photos === true,
        startDate: result.extractedStartDate ?? (entity as any).start_date ?? null,
      });
      mark('event_emitted');

      // Log full timing summary
      console.log('[Phase2:Timing] SUMMARY', {
        entityId,
        total: Date.now() - t0,
        breakdown: timing,
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

/**
 * Streaming version of Phase 2 enrichment.
 * Fields arrive progressively and are persisted/emitted as they come in.
 *
 * @param entityId - The ID of the entity to enrich
 * @param text - The original text to extract from
 * @param bucket - The classified bucket
 * @param subtype - The subtype (for logs)
 * @param repo - The repository to update the entity
 * @param onFieldUpdate - Optional callback for each field as it arrives (for UI updates)
 * @returns Phase2EnrichmentResult or null if enrichment failed
 */
export async function runPhase2Streaming(
  entityId: string,
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
  repo: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  onFieldUpdate?: (field: string, value: any) => void,
): Promise<Phase2EnrichmentResult | null> {
  const logTiming = (label: string, startTime: number) => {
    console.log(`[Phase2:Streaming:Timing] ${label}: ${Date.now() - startTime}ms`);
  };

  const t0 = Date.now();
  logTiming('start', t0);

  // Check feature flag
  if (!FEATURE_FLAGS.PHASE2_ENRICHMENT_ENABLED) {
    console.log('[Phase2:Streaming] Enrichment disabled by feature flag');
    return null;
  }

  // Get entity for update
  let entity: any;
  try {
    entity = await repo.getById(entityId);
  } catch (err) {
    console.error('[Phase2:Streaming] Failed to get entity', err);
    return null;
  }

  if (!entity) {
    console.error('[Phase2:Streaming] Entity not found', { entityId });
    return null;
  }

  logTiming('entity_fetched', t0);

  // Guard: prevent duplicate enrichment
  const currentStage = entity.views?.minddrop_stage;
  if (currentStage === 'enriched' || currentStage === 'enrichment_failed') {
    console.log('[Phase2:Streaming] Skipping - already processed', {
      entityId,
      stage: currentStage,
    });
    return null;
  }

  // Set streaming stage for UI animation
  try {
    const currentViews = entity.views || {};
    await repo.update({
      id: entityId,
      patch: {
        views: { ...currentViews, minddrop_stage: 'streaming', ai_pending: true },
      },
    });

    // Update local entity reference
    entity.views = { ...currentViews, minddrop_stage: 'streaming', ai_pending: true };

    console.log('[Phase2:Streaming] Set streaming stage', { entityId });
  } catch (err) {
    console.error('[Phase2:Streaming] Failed to set streaming stage', err);
    // Continue anyway - streaming will still work, just without the animation
  }

  logTiming('streaming_stage_set', t0);

  return new Promise((resolve) => {
    const partialResult: Partial<Phase2EnrichmentResult> = {};

    const controller = callEnrichPhase2Streaming(
      { text, bucket, subtype, recentTitles: [] },
      {
        onField: (field, value) => {
          console.log(`[Phase2:Streaming] Field received: ${field}`, value);
          partialResult[field as keyof Phase2EnrichmentResult] = value;

          // Notify UI IMMEDIATELY (don't await DB)
          onFieldUpdate?.(field, value);

          // Emit event for UI update IMMEDIATELY
          eventBus.emit('entity:field_updated', {
            entityId,
            field: field as any,
            value,
          });

          // Persist to DB in background (fire and forget)
          if (field === 'smart_title' && value) {
            const titleField = bucket === 'log' ? 'title' : 'name';
            repo.update({ id: entityId, patch: { [titleField]: value } }).catch((err: any) => {
              console.error('[Phase2:Streaming] Failed to update title', err);
            });
          }

          if (field === 'confirmation_message' && value) {
            const currentViews = entity.views || {};
            repo
              .update({
                id: entityId,
                patch: {
                  views: { ...currentViews, confirmation_message: value },
                },
              })
              .catch((err: any) => {
                console.error('[Phase2:Streaming] Failed to update confirmation', err);
              });
          }

          if (field === 'tags' && Array.isArray(value)) {
            repo.update({ id: entityId, patch: { tags: value } }).catch((err: any) => {
              console.error('[Phase2:Streaming] Failed to update tags', err);
            });
          }
        },

        onComplete: async (result) => {
          logTiming('streaming_complete', t0);

          // Final save with all fields
          try {
            const titleField = bucket === 'log' ? 'title' : 'name';
            const updatePayload: any = {
              [titleField]: result.smart_title,
              tags: result.tags || [],
              views: {
                ...(entity.views || {}),
                confirmation_message: result.confirmation_message,
                ai_pending: false,
                minddrop_stage: 'enriched',
              },
            };

            if (bucket === 'todo') {
              if (result.time_estimate_minutes) {
                updatePayload.time_estimate_minutes = result.time_estimate_minutes;
              }
              if (result.time_window) {
                updatePayload.time_window = result.time_window;
              }
              if (result.extracted_date) {
                updatePayload.due_date = result.extracted_date;
                // Extract YYYY-MM-DD portion for due_day
                const dueDayValue = result.extracted_date.split('T')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(dueDayValue)) {
                  updatePayload.due_day = dueDayValue;
                }
              }
            }

            if (bucket === 'habit') {
              if (result.extracted_start_date) {
                updatePayload.start_date = result.extracted_start_date;
              }
              if (result.extracted_frequency) {
                // Update both frequency string AND canonical cadence/target_per_period fields
                updatePayload.frequency = result.extracted_frequency;

                // Parse frequency to set cadence and target_per_period
                const freq = result.extracted_frequency.toLowerCase();
                if (freq === 'daily' || freq === 'day' || freq === 'every day') {
                  updatePayload.cadence = 'daily';
                  updatePayload.target_per_period = 1;
                } else if (freq === 'weekly' || freq === 'week' || freq === 'once a week') {
                  updatePayload.cadence = 'weekly';
                  updatePayload.target_per_period = 1;
                } else if (freq === 'monthly' || freq === 'month' || freq === 'once a month') {
                  updatePayload.cadence = 'monthly';
                  updatePayload.target_per_period = 1;
                } else {
                  // Parse "Nx/week" or "N times a week" patterns
                  const nxWeekMatch = freq.match(/(\d+)\s*(?:x|times?)?\s*(?:\/|per|a)?\s*week/i);
                  if (nxWeekMatch) {
                    updatePayload.cadence = 'weekly';
                    updatePayload.target_per_period = parseInt(nxWeekMatch[1], 10) || 1;
                  } else {
                    // Parse "Nx/month" or "N times a month" patterns
                    const nxMonthMatch = freq.match(
                      /(\d+)\s*(?:x|times?)?\s*(?:\/|per|a)?\s*month/i,
                    );
                    if (nxMonthMatch) {
                      updatePayload.cadence = 'monthly';
                      updatePayload.target_per_period = parseInt(nxMonthMatch[1], 10) || 1;
                    } else {
                      // Default to weekly for unknown frequencies
                      updatePayload.cadence = 'weekly';
                      updatePayload.target_per_period = 1;
                    }
                  }
                }
              }
              if (result.time_window) {
                updatePayload.time_window = result.time_window;
              }
            }

            await repo.update({ id: entityId, patch: updatePayload });

            logTiming('final_save_complete', t0);

            // Emit enriched event
            eventBus.emit('entity:enriched', {
              entityId,
              smartTitle: result.smart_title ?? '',
              confirmationMessage: result.confirmation_message,
              tags: result.tags ?? [],
              timeEstimate: result.time_estimate_minutes,
              time_window: result.time_window,
              dueDate: result.extracted_date,
              startDate: result.extracted_start_date,
              frequency: result.extracted_frequency,
            });

            resolve(result);
          } catch (err) {
            console.error('[Phase2:Streaming] Final save failed', err);
            resolve(result);
          }
        },

        onError: (error) => {
          console.error('[Phase2:Streaming] Error', error);

          // Set failure state
          const fallbackTitle = text.trim().substring(0, 60);
          repo
            .update({
              id: entityId,
              patch: {
                [bucket === 'log' ? 'title' : 'name']: fallbackTitle,
                views: {
                  ...(entity.views || {}),
                  minddrop_stage: 'enrichment_failed',
                  ai_failed: true,
                  ai_pending: false,
                },
              },
            })
            .catch((err: any) => {
              console.error('[Phase2:Streaming] Failed to set failure state', err);
            });

          resolve(null);
        },
      },
    );
  });
}
