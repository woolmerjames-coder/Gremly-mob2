/**
 * dropPhases.ts — Phase handlers for the drop pipeline state machine
 *
 * Each handler executes ONE phase transition:
 * - Takes a QueuedDrop at phase X
 * - Makes network call(s) with timeout
 * - Returns updated QueuedDrop at phase X+1
 * - Throws on hard failure (pipeline runner handles retry)
 *
 * Handlers do NOT persist to AsyncStorage or update Zustand directly.
 * The pipeline runner (dropPipeline.ts) handles persistence after each transition.
 */

import type { QueuedDrop, DropPhase } from './dropQueue';
import { saveDrop, getQueue } from './dropQueue';
import { detectMulti } from './detectMulti';
import { runPhase1, runClassifyV3 } from './phase1';
import { FEATURE_FLAGS } from '../config/featureFlags';
import type { MindDropBucket, LogSubtype, Phase1Result } from './types';
import type { Phase2MetadataResult } from './dropSync';
import { syncDropToSupabase, syncMultiDropToSupabase } from './dropSync';
import { useGremlyStore } from '../store/useGremlyStore';
import { eventBus } from '../events/EventBus';
import { dateService, getDateService } from '../date/DateService';
import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import {
  fetchClarification,
  hasUsableClarification,
  normalizeAmbiguityType,
  CLARIFY_TIMEOUT_MS,
} from './clarification';
import {
  forgetDropRelation,
  holdDropForRelation,
  shouldRelate,
  startDropRelation,
  takeDropRelation,
} from './relationActions';

// ──────────────────────────────────────────────────────────────────────────────
// withTimeout helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout. If the timeout fires first, returns the fallback value.
 * Does NOT throw on timeout — returns the fallback for soft degradation.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Environment readers
// ──────────────────────────────────────────────────────────────────────────────

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

// ──────────────────────────────────────────────────────────────────────────────
// mightBeMulti heuristic
// ──────────────────────────────────────────────────────────────────────────────

export function mightBeMulti(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes(',') ||
    lower.includes('.') ||
    lower.includes(';') ||
    lower.includes(' and ') ||
    lower.includes(' also ') ||
    lower.includes(' then ') ||
    lower.includes(' plus ') ||
    lower.includes(' as well') ||
    lower.includes(' but ') ||
    lower.includes('+') ||
    lower.includes(' & ') ||
    lower.includes('\n') ||
    lower.includes(' / ') ||
    lower.includes(' — ') ||
    lower.includes(' – ') ||
    lower.includes(' - ')
  );
}

// Dedup tracking is now unified in the Zustand store (recentSpeech).
// See useGremlyStore.pushRecentSpeech().

// ──────────────────────────────────────────────────────────────────────────────
// Temporal extraction (for Phase 1.5 background)
// ──────────────────────────────────────────────────────────────────────────────

const TEMPORAL_PATTERN =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|tonight|next\s+week|this\s+week|next\s+month|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i;

export function extractTemporal(text: string): string | null {
  const match = text.match(TEMPORAL_PATTERN);
  return match ? match[0] : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// API Call Helpers (NO internal timeouts — withTimeout applied by handlers)
// ──────────────────────────────────────────────────────────────────────────────

async function callPhase1_5a(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
): Promise<{
  smart_title: string | null;
  card_note: string | null;
  confirmation_message: string | null;
  speech_message: string | null;
} | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl) return null;

  try {
    const sessionToken = await getSessionToken();
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        type: 'enrich-phase1-5a',
        text,
        bucket,
        subtype,
        recentReactions: [...useGremlyStore.getState().recentSpeech],
      }),
    });

    if (!res.ok) {
      console.log('[DropPhases] Phase 1.5a API error', { status: res.status });
      return null;
    }

    const json = await res.json();
    console.log('[card_note:1] Worker returned:', {
      card_note: json.card_note,
      speech_message: json.speech_message,
    });
    const result = {
      smart_title: json.smart_title || null,
      card_note: json.card_note || null,
      confirmation_message: json.confirmation_message || null,
      speech_message: json.speech_message || null,
    };

    console.log('[Phase1.5a] Raw reaction:', {
      text: text.substring(0, 40),
      confirmation_message: result.confirmation_message,
    });

    if (result.confirmation_message) {
      useGremlyStore.getState().pushRecentSpeech(result.confirmation_message);
    }

    return result;
  } catch (err) {
    console.log('[DropPhases] Phase 1.5a error', { error: String(err) });
    return null;
  }
}

async function callPhase2(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
  prefillDate: string | null,
): Promise<Phase2MetadataResult | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl) return null;

  try {
    const sessionToken = await getSessionToken();
    const currentDate = dateService.today();
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: getDateService().getTimezone(),
    }).format(getDateService().dayNow());
    const timezone = getDateService().getTimezone();

    console.log('[PrefillDate:4-Phase2] Sending userSelectedDate:', prefillDate || null);
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        type: 'enrich-phase2',
        text,
        bucket,
        subtype,
        currentDate,
        dayOfWeek,
        timezone,
        hasUserSelectedDate: !!prefillDate,
        userSelectedDate: prefillDate || null,
      }),
    });

    if (!res.ok) {
      console.log('[DropPhases] Phase 2 API error', { status: res.status });
      return null;
    }

    const json = await res.json();
    if (!json || typeof json !== 'object') return null;

    // Validate time_window and energy_type (same as dropProcessor)
    const validTimeWindows = ['morning', 'day', 'evening'] as const;
    const time_window = validTimeWindows.includes(json.time_window) ? json.time_window : null;

    const validEnergyTypes = [
      'deep_focus',
      'administrative',
      'physical',
      'social',
      'quick',
    ] as const;
    const energy_type = validEnergyTypes.includes(json.energy_type) ? json.energy_type : null;

    return {
      tags: Array.isArray(json.tags) ? json.tags : [],
      time_estimate_minutes: json.time_estimate_minutes ?? null,
      time_window,
      extracted_date: json.extracted_date ?? null,
      extracted_start_date: json.extracted_start_date ?? null,
      extracted_frequency: json.extracted_frequency ?? null,
      extracted_days: json.extracted_days ?? null,
      people: Array.isArray(json.people) ? json.people : [],
      mood: json.mood ?? null,
      energy_type,
      priority_kind: ['action', 'blocker', 'waiting', 'decision', 'momentum'].includes(
        json.priority_kind,
      )
        ? json.priority_kind
        : null,
      target_date: json.target_date ?? null,
      scheduled_date: json.scheduled_date ?? null,
      event_time: json.event_time ?? null,
      date_type_ambiguous: json.date_type_ambiguous ?? false,
      end_date: json.end_date ?? null,
      smart_title: json.smart_title ?? null,
      dateConfidence: json.dateConfidence ?? null,
    };
  } catch (err) {
    console.log('[DropPhases] Phase 2 error', { error: String(err) });
    return null;
  }
}

interface Phase2bResult {
  auto_reminder: boolean;
  reminder_date: string | null;
  reminder_time: string | null;
  reminder_frequency: 'once' | 'daily' | null;
}

async function callPhase2b(
  text: string,
  bucket: MindDropBucket,
  subtype: string | null,
): Promise<Phase2bResult | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl) return null;

  try {
    const sessionToken = await getSessionToken();
    const currentDate = dateService.today();
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: getDateService().getTimezone(),
    }).format(getDateService().dayNow());
    const timezone = getDateService().getTimezone();

    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        type: 'enrich-phase2b',
        text,
        bucket,
        subtype,
        currentDate,
        dayOfWeek,
        timezone,
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    return {
      auto_reminder: json.auto_reminder === true,
      reminder_date: json.reminder_date ?? null,
      reminder_time: json.reminder_time ?? null,
      reminder_frequency: json.reminder_frequency ?? null,
    };
  } catch (err) {
    console.warn('[DropPhases] Phase 2b error', { error: String(err) });
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase Handlers (exported)
// ──────────────────────────────────────────────────────────────────────────────

// App side budget for classify-v3 (worker worst case is 5s primary + 4s fallback).
export const CLASSIFY_V3_TIMEOUT_MS = 10000;

async function classifyV2(drop: QueuedDrop) {
  const shouldCheckMulti = mightBeMulti(drop.text);
  return Promise.all([
    shouldCheckMulti
      ? withTimeout(detectMulti(drop.text), 6000, { is_multi: false })
      : Promise.resolve({ is_multi: false }),
    withTimeout(
      runPhase1(drop.text, { hasAttachments: false, hasUserSelectedDate: !!drop.prefillDate }),
      15000,
      null,
    ),
  ]);
}

export async function handleQueued(drop: QueuedDrop): Promise<QueuedDrop> {
  let multiResult: any = { is_multi: false };
  let phase1Result: any = null;
  let engine: 'v2' | 'v3' = 'v2';

  // "Is this one you already have?" only needs the words: start it now, beside
  // classification, so it is back before the drop needs it (relationActions.ts)
  if (FEATURE_FLAGS.CLASSIFY_V3_ENABLED) startDropRelation(drop);

  // v3: one call for classification + multi + clarification. Any failure
  // (null) drops through to the v2 path below for this drop.
  if (FEATURE_FLAGS.CLASSIFY_V3_ENABLED) {
    const v3 = await withTimeout(
      runClassifyV3(
        drop.text,
        { hasAttachments: false, hasUserSelectedDate: !!drop.prefillDate },
        CLASSIFY_V3_TIMEOUT_MS,
      ),
      CLASSIFY_V3_TIMEOUT_MS + 250,
      null,
    );
    if (v3) {
      multiResult = v3.multi;
      phase1Result = v3.phase1;
      engine = 'v3';
    }
  }

  if (!phase1Result) {
    [multiResult, phase1Result] = await classifyV2(drop);
  }

  if (phase1Result === null) {
    throw new Error('Classification timeout');
  }

  console.log('[DropPhases] handleQueued complete', {
    localId: drop.localId,
    engine,
    isMulti: (multiResult as any).is_multi,
    bucket: phase1Result.bucket,
    source: phase1Result.source,
  });

  // Multi path
  if ((multiResult as any).is_multi && (multiResult as any).segments?.length > 1) {
    forgetDropRelation(drop.localId);
    // Emit multi follow-up for speech bubble (no AI reaction for multi parent)
    console.log('[SpeechBubble] Emitting drop:reaction_ready for multi', { localId: drop.localId });
    eventBus.emit('drop:reaction_ready', {
      localId: drop.localId,
      message: null,
      rawReaction: null,
      followUp: 'multi',
    });

    return {
      ...drop,
      phase: 'multi_detected',
      classifyEngine: engine,
      isMulti: true,
      multiSegments: (multiResult as any).segments,
      multiSummary: (multiResult as any).summary || drop.text.substring(0, 60),
      dominantBucket: (multiResult as any).dominant_bucket || 'log',
      dominantSubtype: (multiResult as any).dominant_subtype || null,
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
      retryCount: 0,
      lastError: null,
    };
  }

  // Single path — store ambiguity_type for handleClassified to use
  const resultDrop: QueuedDrop = {
    ...drop,
    phase: 'classified',
    classifyEngine: engine,
    bucket: phase1Result.bucket,
    subtype: phase1Result.subtype,
    habitSubtype: phase1Result.habitSubtype,
    confidence: phase1Result.confidence,
    classificationSource: (phase1Result as any).classificationSource || phase1Result.source,
    classificationDegraded: (phase1Result as any).classificationDegraded || false,
    needsClarification: (phase1Result as any).is_ambiguous || false,
    ambiguityReason: (phase1Result as any).ambiguity_reason || null,
    plausibleInterpretations: (phase1Result as any).plausible_interpretations || null,
    retryCount: 0,
    lastError: null,
  };

  // Stash ambiguity_type so handleClassified can fetch Phase 1.5.
  // A drop flagged ambiguous WITHOUT a type used to skip clarification
  // entirely (the card then sat on "Thinking..." forever). Default to
  // 'bucket', the generic "what did you have in mind" question.
  if (resultDrop.needsClarification) {
    resultDrop.ambiguityType = normalizeAmbiguityType((phase1Result as any).ambiguity_type);
  }

  // classify-v3 returns the clarification in the same response.
  const inlineQuestion = (phase1Result as any).clarification_question;
  const inlineOptions = (phase1Result as any).clarification_options;
  if (resultDrop.needsClarification && hasUsableClarification(inlineQuestion, inlineOptions)) {
    resultDrop.clarificationQuestion = inlineQuestion;
    resultDrop.clarificationOptions = inlineOptions;
  }

  return resultDrop;
}

export async function handleClassified(drop: QueuedDrop): Promise<QueuedDrop> {
  // Phase 1.5 clarification runs IN the pipeline, in parallel with Phase 1.5a,
  // so the question and options are on the drop before it syncs. It never
  // rejects and always resolves to usable options (worker or fixed fallback),
  // so an ambiguous card can no longer be left without a question.
  const needsClarificationFetch =
    !!drop.needsClarification &&
    !hasUsableClarification(drop.clarificationQuestion, drop.clarificationOptions);

  // Start clarification first so it overlaps with Phase 1.5a...
  const clarificationPromise = needsClarificationFetch
    ? fetchClarification({
        text: drop.text,
        ambiguityType: drop.ambiguityType,
        ambiguityReason: drop.ambiguityReason,
        bucket: drop.bucket as 'todo' | 'habit' | 'log' | undefined,
        timeoutMs: CLARIFY_TIMEOUT_MS,
      })
    : Promise.resolve(null);

  // Is this drop about something they already have? Runs alongside, never
  // rejects, and null (off, slow, unsure) files the drop exactly as before.
  const relates = shouldRelate(drop);
  if (!relates) forgetDropRelation(drop.localId);
  const relationPromise = relates ? takeDropRelation(drop) : Promise.resolve(null);

  // Phase 1.5a: get title + confirmation (soft timeout, fallback to raw text)
  const result = await withTimeout(
    callPhase1_5a(drop.text, drop.bucket!, drop.subtype || null),
    6000,
    null,
  );

  const smartTitle = result?.smart_title || drop.text.substring(0, 50);
  const cardNote = result?.card_note || null;
  const confirmationMessage = result?.confirmation_message || null;
  const speechMessage = result?.speech_message || result?.confirmation_message || null;
  const rawReaction = result?.confirmation_message || null;

  // Determine follow-up signal for speech bubble
  const followUpSignal: 'multi' | 'clarify' | null = drop.needsClarification ? 'clarify' : null;

  // ...but emit the speech bubble reaction as soon as 1.5a is back, without
  // waiting for the clarification call.
  eventBus.emit('drop:reaction_ready', {
    localId: drop.localId,
    message: speechMessage,
    rawReaction: rawReaction,
    followUp: followUpSignal,
  });

  const clarification = await clarificationPromise;
  if (clarification) {
    console.log('[DropPhases] Phase 1.5 clarification ready', {
      localId: drop.localId,
      source: clarification.source,
      ambiguityType: clarification.ambiguityType,
      optionsCount: clarification.options.length,
    });
    drop = {
      ...drop,
      ambiguityType: clarification.ambiguityType,
      clarificationQuestion: clarification.question,
      clarificationOptions: clarification.options,
    };
  }

  // A drop about one of their items waits as a note carrying the question,
  // so nothing new appears in their lists before they answer.
  const relation = await relationPromise;
  if (relation) {
    console.log('[DropPhases] Drop relates to an existing item', {
      localId: drop.localId,
      kind: relation.kind,
      intent: relation.intent,
    });
    drop = holdDropForRelation(drop, relation);
  }

  console.log('[DropPhases] handleClassified complete', {
    localId: drop.localId,
    hasTitle: !!result?.smart_title,
    hasMessage: !!confirmationMessage,
  });

  console.log('[card_note:2] Stored on drop:', {
    cardNote: cardNote,
    localId: drop.localId,
  });

  return {
    ...drop,
    phase: 'titled',
    smartTitle,
    cardNote: cardNote ?? undefined,
    confirmationMessage: confirmationMessage ?? undefined,
    followUpSignal: followUpSignal ?? undefined,
    retryCount: 0,
    lastError: null,
  };
}

export async function handleMultiDetected(drop: QueuedDrop): Promise<QueuedDrop> {
  const segments = drop.multiSegments || [];

  // Run Phase 1 + Phase 1.5a on each segment for accurate classification and titles
  // This matches the old dropProcessor behavior — classify segments but do NOT create child drops
  const classifiedSegments = await Promise.all(
    segments.map(async (seg: any) => {
      let phase1;
      let phase15a: {
        smart_title: string | null;
        card_note: string | null;
        confirmation_message: string | null;
        speech_message: string | null;
      } | null = null;

      try {
        // classify-v3 already classified each segment in the same call;
        // only v2 segments need their own Phase 1 round trip.
        const v3Classified =
          drop.classifyEngine === 'v3' && ['todo', 'habit', 'log'].includes(seg.bucket);
        phase1 = v3Classified
          ? {
              bucket: seg.bucket,
              subtype: seg.subtype ?? null,
              habitSubtype: seg.habitSubtype ?? null,
              confidence: 0.85,
              source: 'api',
              is_multi: false,
            }
          : await withTimeout(runPhase1(seg.text, { hasAttachments: false }), 8000, {
              bucket: seg.likely_bucket || seg.bucket || 'log',
              subtype: seg.likely_subtype || seg.subtype || null,
              habitSubtype: null,
              confidence: 0.5,
              source: 'phase1-fallback',
              is_multi: false,
            });

        phase15a = await withTimeout(
          callPhase1_5a(seg.text, phase1.bucket, phase1.subtype || null),
          6000,
          null,
        );
      } catch (err) {
        console.warn('[DropPhases] Multi segment classification failed', {
          text: seg.text?.substring(0, 30),
          error: String(err),
        });
        phase1 = {
          bucket: seg.likely_bucket || seg.bucket || 'log',
          subtype: seg.likely_subtype || seg.subtype || null,
          habitSubtype: null,
        };
      }

      const smartTitle = phase15a?.smart_title || null;
      const confirmationMessage = phase15a?.confirmation_message || null;

      return {
        text: seg.text,
        bucket: phase1.bucket,
        subtype: phase1.subtype || null,
        habitSubtype: phase1.habitSubtype || null,
        smart_title: smartTitle,
        confirmation_message: confirmationMessage,
      };
    }),
  );

  console.log('[DropPhases] handleMultiDetected: segments classified', {
    localId: drop.localId,
    segmentCount: classifiedSegments.length,
    segments: classifiedSegments.map((s: any) => ({
      text: s.text?.substring(0, 20),
      bucket: s.bucket,
      smart_title: s.smart_title,
    })),
  });

  // Advance directly to enriched — skip titled phase (multi drops don't need their own title)
  // handleEnriched will call syncMultiDropToSupabase which creates ONE note with multi_items
  return {
    ...drop,
    phase: 'enriched',
    multiSegments: classifiedSegments as any,
    retryCount: 0,
    lastError: null,
  };
}

export async function handleTitled(drop: QueuedDrop): Promise<QueuedDrop> {
  // Skip Phase 2 for ambiguous items — will run after user clarifies
  if (drop.needsClarification) {
    console.log('[DropPhases] handleTitled: skipping Phase 2 for ambiguous item', {
      localId: drop.localId,
    });
    return {
      ...drop,
      phase: 'enriched',
      retryCount: 0,
      lastError: null,
    };
  }

  // Phase 2 + Phase 2b in parallel (2b only if reminder intent detected)
  const reminderIntent = (drop as any).reminderIntent === true;

  console.log('[PrefillDate:3-Phases] Calling Phase 2 with prefillDate:', drop.prefillDate || null);
  const [enrichment, phase2b] = await Promise.all([
    withTimeout(
      callPhase2(drop.text, drop.bucket!, drop.subtype || null, drop.prefillDate || null),
      12000,
      null, // timeout → no metadata (soft failure, still advances)
    ),
    reminderIntent
      ? withTimeout(callPhase2b(drop.text, drop.bucket!, drop.subtype || null), 8000, null)
      : Promise.resolve(null),
  ]);

  console.log('[DropPhases] handleTitled complete', {
    localId: drop.localId,
    hasEnrichment: !!enrichment,
    hasReminder: !!phase2b?.auto_reminder,
  });

  return {
    ...drop,
    phase: 'enriched',
    tags: enrichment?.tags || [],
    timeEstimateMinutes: enrichment?.time_estimate_minutes || null,
    timeWindow: enrichment?.time_window || null,
    energyType: enrichment?.energy_type || null,
    priorityKind: enrichment?.priority_kind ?? null,
    extractedDate: enrichment?.extracted_date || null,
    extractedStartDate: enrichment?.extracted_start_date || null,
    extractedFrequency: enrichment?.extracted_frequency || null,
    extractedDays: enrichment?.extracted_days || null,
    people: enrichment?.people || [],
    mood: enrichment?.mood || null,
    targetDate: enrichment?.target_date || null,
    scheduledDate: enrichment?.scheduled_date || null,
    eventTime: enrichment?.event_time || null,
    dateTypeAmbiguous: enrichment?.date_type_ambiguous || false,
    endDate: enrichment?.end_date || null,
    autoReminder: phase2b?.auto_reminder || false,
    reminderDate: phase2b?.reminder_date || null,
    reminderTime: phase2b?.reminder_time || null,
    reminderFrequency: phase2b?.reminder_frequency || null,
    retryCount: 0,
    lastError: null,
  };
}

export async function handleEnriched(drop: QueuedDrop): Promise<QueuedDrop> {
  // Build enrichment result from drop fields (for syncDropToSupabase compatibility)
  const enrichment: Phase2MetadataResult | null = drop.tags
    ? {
        tags: drop.tags || [],
        time_estimate_minutes: drop.timeEstimateMinutes || null,
        time_window: drop.timeWindow || null,
        extracted_date: drop.extractedDate || null,
        extracted_start_date: drop.extractedStartDate || null,
        extracted_frequency: drop.extractedFrequency || null,
        extracted_days: drop.extractedDays || null,
        people: drop.people || [],
        mood: drop.mood || null,
        energy_type: (drop.energyType || null) as Phase2MetadataResult['energy_type'],
        priority_kind: drop.priorityKind ?? null,
        target_date: drop.targetDate || null,
        scheduled_date: drop.scheduledDate || null,
        event_time: drop.eventTime || null,
        date_type_ambiguous: drop.dateTypeAmbiguous || false,
        end_date: drop.endDate || null,
        smart_title: null,
        dateConfidence: null,
      }
    : null;

  // Read latest clarification data from queue — Phase 1.5 background
  // may have populated these after the pipeline's QueuedDrop was saved
  if (drop.needsClarification && !drop.isMulti) {
    const queue = await getQueue();
    const latest = queue.find((d) => d.localId === drop.localId);
    if (latest?.clarificationQuestion) {
      drop = {
        ...drop,
        clarificationQuestion: latest.clarificationQuestion,
        clarificationOptions: latest.clarificationOptions as any,
      };
    }
  }

  let syncResult;

  if (drop.isMulti) {
    // Multi-entity parent — sync as wrapper note
    syncResult = await syncMultiDropToSupabase(drop);
  } else {
    // Single drop — sync as todo/habit/note
    syncResult = await syncDropToSupabase(drop, enrichment);
  }

  if (!syncResult.success) {
    // Hard failure — throw so pipeline runner retries this phase
    throw new Error(syncResult.error?.message || 'Supabase sync failed');
  }

  console.log('[DropPhases] handleEnriched: synced', {
    localId: drop.localId,
    supabaseId: syncResult.supabaseId,
    entityType: syncResult.entityType,
  });

  return {
    ...drop,
    phase: 'complete',
    supabaseId: syncResult.supabaseId,
    entityType: syncResult.entityType,
    retryCount: 0,
    lastError: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase Router
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get the handler function for a given phase.
 * Returns null for terminal phases (complete, failed) and multi_awaiting
 * when children aren't done yet.
 */
export function getPhaseHandler(
  phase: DropPhase,
): ((drop: QueuedDrop) => Promise<QueuedDrop>) | null {
  switch (phase) {
    case 'queued':
      return handleQueued;
    case 'classified':
      return handleClassified;
    case 'multi_detected':
      return handleMultiDetected;
    case 'multi_awaiting':
      return null; // Legacy — no longer used
    case 'titled':
      return handleTitled;
    case 'enriched':
      return handleEnriched;
    case 'complete':
      return null; // terminal
    case 'failed':
      return null; // terminal
    default:
      return null;
  }
}
