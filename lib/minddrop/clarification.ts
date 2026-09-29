/**
 * clarification.ts: Mind Drop clarification (Phase 1.5) client helpers
 *
 * Why this exists: clarification used to be fired in the background and
 * written back to the drop queue when it returned. Three things made the
 * "Gremly has a question" card stall forever on "Thinking...":
 *   1. If Phase 1 flagged a drop as ambiguous without an ambiguity_type,
 *      the request was never sent at all.
 *   2. If the response landed after the drop had synced and been dequeued,
 *      updateDrop() silently no-oped (it never threw), so the entity fallback
 *      never ran and the options were lost.
 *   3. Any network error, non-OK status or short options list was ignored,
 *      with no retry and no fallback.
 *
 * The fix: clarification is fetched inside the pipeline with a hard timeout,
 * BEFORE sync, and always resolves to a usable question + options. When the
 * worker cannot answer in time we use fixed per-type fallbacks, so the popup
 * can never be left without options. `ensureClarification` is the same logic
 * for entities that were saved without options (older drops, edge cases).
 *
 * Option ids and the action each maps to mirror CLARIFY_TYPE_CONFIGS in
 * workers/cortex/classifyV3.js. Keep the two in step.
 * Authored text follows the house rule: no em or en dashes.
 */

import { env, getEnv } from '../env';
import { dateService } from '../date/DateService';
import { getSessionToken } from '../cortex/getSessionToken';

export type ClarifyBucket = 'todo' | 'habit' | 'log';

export interface ClarificationOption {
  id: string;
  label: string;
  action: {
    bucket: ClarifyBucket;
    subtype: string | null;
    habitSubtype?: string | null;
    target_date: boolean;
    scheduled_date: boolean;
  };
  space_suggestion?: string | null;
}

export interface ClarificationPayload {
  question: string;
  options: ClarificationOption[];
  /** 'worker' when the model wrote it, 'fallback' when we used the fixed copy */
  source: 'worker' | 'fallback';
  ambiguityType: string;
}

type FallbackOption = {
  id: string;
  label: string;
  bucket: ClarifyBucket;
  subtype: string | null;
  habitSubtype?: string | null;
  dateField?: 'target_date' | 'scheduled_date';
};

export const CLARIFY_FALLBACKS: Record<string, { question: string; options: FallbackOption[] }> = {
  bucket: {
    question: 'What did you have in mind for this?',
    options: [
      { id: 'opt_1', label: 'Something to do', bucket: 'todo', subtype: null },
      { id: 'opt_2', label: 'Still thinking about it', bucket: 'log', subtype: 'idea' },
      { id: 'opt_3', label: 'Just remembering it', bucket: 'log', subtype: 'general' },
    ],
  },
  date_type: {
    question: 'Is this booked already?',
    options: [
      {
        id: 'opt_1',
        label: 'Yes, it is booked',
        bucket: 'log',
        subtype: 'event',
        dateField: 'target_date',
      },
      {
        id: 'opt_2',
        label: 'No, I need to book it',
        bucket: 'todo',
        subtype: null,
        dateField: 'target_date',
      },
      { id: 'opt_3', label: 'Just holding the date', bucket: 'log', subtype: 'event' },
    ],
  },
  vague_aspiration: {
    question: 'Want to turn this into a goal?',
    options: [
      {
        id: 'opt_1',
        label: 'Yes, make it a goal',
        bucket: 'habit',
        subtype: null,
        habitSubtype: 'start_habit',
      },
      { id: 'opt_2', label: 'Just a thought for now', bucket: 'log', subtype: 'general' },
    ],
  },
  habit_or_todo: {
    question: 'Is this a one off or a regular thing?',
    options: [
      { id: 'opt_1', label: 'Just once', bucket: 'todo', subtype: null },
      {
        id: 'opt_2',
        label: 'A regular thing',
        bucket: 'habit',
        subtype: null,
        habitSubtype: 'start_habit',
      },
    ],
  },
  action_or_memory: {
    question: 'Do you need to do something about this?',
    options: [
      { id: 'opt_1', label: 'Yes, I need to act', bucket: 'todo', subtype: null },
      { id: 'opt_2', label: 'No, just remembering', bucket: 'log', subtype: 'general' },
    ],
  },
  commitment_level: {
    question: 'Want help sticking with this?',
    options: [
      {
        id: 'opt_1',
        label: 'Yes, hold me to it',
        bucket: 'habit',
        subtype: null,
        habitSubtype: 'start_habit',
      },
      { id: 'opt_2', label: 'Just noting it', bucket: 'log', subtype: 'general' },
    ],
  },
  emotional_or_action: {
    question: 'Do you want to do something about this?',
    options: [
      { id: 'opt_1', label: 'I want to tackle it', bucket: 'todo', subtype: null },
      { id: 'opt_2', label: 'I just needed to say it', bucket: 'log', subtype: 'journal' },
    ],
  },
  social_plan: {
    question: 'Is this happening, or do you need to set it up?',
    options: [
      { id: 'opt_1', label: 'It is already sorted', bucket: 'log', subtype: 'event' },
      { id: 'opt_2', label: 'I need to set it up', bucket: 'todo', subtype: null },
      { id: 'opt_3', label: 'Just noting it', bucket: 'log', subtype: 'general' },
    ],
  },
  scope: {
    question: 'Is this one job or a bigger project?',
    options: [
      { id: 'opt_1', label: 'One thing to finish', bucket: 'todo', subtype: null },
      { id: 'opt_2', label: 'A bigger project', bucket: 'log', subtype: 'idea' },
      { id: 'opt_3', label: 'Just an idea for now', bucket: 'log', subtype: 'idea' },
    ],
  },
  idea_or_commitment: {
    question: 'How serious are you about this one?',
    options: [
      { id: 'opt_1', label: 'Doing it, once', bucket: 'todo', subtype: null },
      {
        id: 'opt_2',
        label: 'Doing it, regularly',
        bucket: 'habit',
        subtype: null,
        habitSubtype: 'start_habit',
      },
      { id: 'opt_3', label: 'Still thinking', bucket: 'log', subtype: 'idea' },
      { id: 'opt_4', label: 'Just a passing thought', bucket: 'log', subtype: 'general' },
    ],
  },
};

export const CLARIFY_TIMEOUT_MS = 8000;

export function normalizeAmbiguityType(type: string | null | undefined): string {
  return type && CLARIFY_FALLBACKS[type] ? type : 'bucket';
}

function toClientOption(o: FallbackOption, label?: string): ClarificationOption {
  return {
    id: o.id,
    label: label || o.label,
    action: {
      bucket: o.bucket,
      subtype: o.subtype ?? null,
      habitSubtype: o.habitSubtype ?? null,
      target_date: o.dateField === 'target_date',
      scheduled_date: o.dateField === 'scheduled_date',
    },
    space_suggestion: null,
  };
}

/** Fixed, always-valid clarification for an ambiguity type. */
export function buildFallbackClarification(ambiguityType?: string | null): ClarificationPayload {
  const type = normalizeAmbiguityType(ambiguityType);
  const cfg = CLARIFY_FALLBACKS[type];
  return {
    question: cfg.question,
    options: cfg.options.map((o) => toClientOption(o)),
    source: 'fallback',
    ambiguityType: type,
  };
}

/**
 * Map worker options (clarify-ambiguity or classify-v3 shape) to the client
 * option shape used by the popup and resolveEntityClarification.
 * Returns null if fewer than two usable options.
 */
export function mapWorkerOptions(
  options: unknown,
  fallbackBucket: ClarifyBucket = 'log',
): ClarificationOption[] | null {
  if (!Array.isArray(options)) return null;
  const mapped = options
    .filter((o): o is Record<string, any> => !!o && typeof o === 'object')
    .filter((o) => typeof o.id === 'string' && typeof o.label === 'string' && o.label.trim())
    .map((o) => {
      // Already client shaped (has action) → keep, just normalise
      const src = o.action && typeof o.action === 'object' ? o.action : o;
      const bucket: ClarifyBucket = ['todo', 'habit', 'log'].includes(src.bucket)
        ? src.bucket
        : fallbackBucket;
      return {
        id: o.id,
        label: String(o.label).trim(),
        action: {
          bucket,
          subtype: src.subtype ?? null,
          habitSubtype: src.habitSubtype ?? src.habit_subtype ?? null,
          target_date: src.target_date === true || src.dateField === 'target_date',
          scheduled_date: src.scheduled_date === true || src.dateField === 'scheduled_date',
        },
        space_suggestion: o.space_suggestion ?? null,
      } as ClarificationOption;
    });
  return mapped.length >= 2 ? mapped : null;
}

/** True when a stored question/options pair is complete enough to show. */
export function hasUsableClarification(question: unknown, options: unknown): boolean {
  return (
    typeof question === 'string' &&
    question.trim().length > 0 &&
    Array.isArray(options) &&
    options.length >= 2
  );
}

const readCortexUrl = (): string => {
  const fromGetEnv = typeof getEnv === 'function' ? getEnv('EXPO_PUBLIC_CORTEX_URL') : undefined;
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

export interface FetchClarificationArgs {
  text: string;
  ambiguityType?: string | null;
  ambiguityReason?: string | null;
  bucket?: ClarifyBucket;
  userSpaces?: string[];
  timeoutMs?: number;
}

/**
 * Ask the worker for a clarifying question + options.
 * NEVER rejects and NEVER returns empty: on timeout, network error, non-OK
 * status or unusable output it returns the fixed fallback for the type.
 */
export async function fetchClarification(
  args: FetchClarificationArgs,
): Promise<ClarificationPayload> {
  const type = normalizeAmbiguityType(args.ambiguityType);
  const fallback = buildFallbackClarification(type);
  const cortexUrl = readCortexUrl();
  if (!cortexUrl || !args.text?.trim()) return fallback;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const request = (async (): Promise<ClarificationPayload> => {
    try {
      const sessionToken = await getSessionToken();
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          type: 'clarify-ambiguity',
          text: args.text,
          ambiguityType: type,
          ambiguityReason: args.ambiguityReason || undefined,
          currentDate: dateService.today(),
          targetBucket: args.bucket || 'log',
          userSpaces: args.userSpaces || [],
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) {
        console.log('[Clarification] worker non-OK, using fallback', { status: res.status });
        return fallback;
      }
      const json = await res.json();
      const options = mapWorkerOptions(json?.options, args.bucket || 'log');
      const question =
        typeof json?.clarification_question === 'string' ? json.clarification_question.trim() : '';
      if (!options || !question) {
        console.log('[Clarification] worker output unusable, using fallback');
        return fallback;
      }
      return { question, options, source: 'worker', ambiguityType: type };
    } catch (err) {
      console.log('[Clarification] request failed, using fallback', { error: String(err) });
      return fallback;
    }
  })();

  const timeout = new Promise<ClarificationPayload>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      console.log('[Clarification] timed out, using fallback', {
        timeoutMs: args.timeoutMs ?? CLARIFY_TIMEOUT_MS,
      });
      resolve(fallback);
    }, args.timeoutMs ?? CLARIFY_TIMEOUT_MS);
  });

  const result = await Promise.race([request, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
