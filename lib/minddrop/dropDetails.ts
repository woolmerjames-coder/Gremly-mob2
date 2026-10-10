/**
 * dropDetails.ts: a drop's details (Phase 2: when, how long, how often, mood,
 * tags, people) and, when the classifier heard a remind me, its reminder
 * (Phase 2b). Both start the moment the drop is sorted, with its kind, as two
 * calls so neither waits for the other; the details are written to the saved
 * row when they land and the reminder is saved when it lands (Mind Drop
 * rethink stage 4, 9 Oct 2026). The two calls moved here from dropPhases.ts
 * unchanged, apart from running at the sort.
 */
import { dateService, getDateService } from '../date/DateService';
import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import type { QueuedDrop } from './dropQueue';
import type { Phase2MetadataResult } from './dropSync';
import type { LogSubtype, MindDropBucket } from './types';
import { keyedCalls, type StartedCall } from './dropCalls';

const readCortexUrl = (): string => {
  const fromGetEnv = typeof getEnv === 'function' ? getEnv('EXPO_PUBLIC_CORTEX_URL') : undefined;
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

/** How long the details call may take before the drop gives up on it (as before). */
export const DETAILS_TIMEOUT_MS = 12000;
/** How long the reminder call may take (as before). */
export const REMINDER_TIMEOUT_MS = 8000;

export interface ReminderDetails {
  auto_reminder: boolean;
  reminder_date: string | null;
  reminder_time: string | null;
  reminder_frequency: 'once' | 'daily' | null;
}

function dayContext() {
  const ds = getDateService();
  return {
    currentDate: dateService.today(),
    dayOfWeek: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: ds.getTimezone(),
    }).format(ds.dayNow()),
    timezone: ds.getTimezone(),
  };
}

function withTimeoutNull<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, late]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function callPhase2(
  text: string,
  bucket: MindDropBucket,
  subtype: LogSubtype | null,
  prefillDate: string | null,
): Promise<Phase2MetadataResult | null> {
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
        type: 'enrich-phase2',
        text,
        bucket,
        subtype,
        ...dayContext(),
        hasUserSelectedDate: !!prefillDate,
        userSelectedDate: prefillDate || null,
      }),
    });

    if (!res.ok) {
      console.log('[DropDetails] Phase 2 API error', { status: res.status });
      return null;
    }

    const json = await res.json();
    if (!json || typeof json !== 'object') return null;

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
    console.log('[DropDetails] Phase 2 error', { error: String(err) });
    return null;
  }
}

export async function callPhase2b(
  text: string,
  bucket: MindDropBucket,
  subtype: string | null,
): Promise<ReminderDetails | null> {
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
      body: JSON.stringify({ type: 'enrich-phase2b', text, bucket, subtype, ...dayContext() }),
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
    console.warn('[DropDetails] Phase 2b error', { error: String(err) });
    return null;
  }
}

const details = keyedCalls<Phase2MetadataResult>('details');
const reminders = keyedCalls<ReminderDetails>('reminder');

/**
 * Start the details the moment the drop is sorted, with the kind it is saved
 * as. On its own, so a slow reminder call never holds the details up.
 */
export function startDropDetails(
  drop: QueuedDrop,
  kind: { bucket: MindDropBucket; subtype: LogSubtype | null },
): StartedCall<Phase2MetadataResult> {
  return details.start(drop.localId, () =>
    withTimeoutNull(
      callPhase2(drop.text, kind.bucket, kind.subtype, drop.prefillDate || null),
      DETAILS_TIMEOUT_MS,
    ),
  );
}

/** The reminder call, when the classifier heard a remind me; null when it did not. */
export function startDropReminder(
  drop: QueuedDrop,
  kind: { bucket: MindDropBucket; subtype: LogSubtype | null },
): StartedCall<ReminderDetails> | null {
  if (drop.reminderIntent !== true) return null;
  return reminders.start(drop.localId, () =>
    withTimeoutNull(callPhase2b(drop.text, kind.bucket, kind.subtype), REMINDER_TIMEOUT_MS),
  );
}

export function forgetDropDetails(localId: string): void {
  details.forget(localId);
  reminders.forget(localId);
}
