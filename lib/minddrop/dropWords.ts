/**
 * dropWords.ts: a drop's title and Gremly's reaction, asked for at the tap
 * (Mind Drop rethink stage 4, 9 Oct 2026).
 *
 * The title and reaction call (`enrich-phase1-5a`) no longer waits for the
 * classifier: it starts with the drop and works out the kind from the words
 * when none is given (stage 2). The pipeline reads it at the sort, waiting at
 * most a second more, and a late answer updates the saved row when it lands.
 * There is no card note any more.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { dateService, getDateService } from '../date/DateService';
import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import type { QueuedDrop } from './dropQueue';
import { keyedCalls, type StartedCall } from './dropCalls';

export interface DropWords {
  /** The title, in sentence case (the Worker puts a capital first) */
  smartTitle: string | null;
  /** Gremly's reaction for the bubble */
  reaction: string | null;
}

const readCortexUrl = (): string => {
  const fromGetEnv = typeof getEnv === 'function' ? getEnv('EXPO_PUBLIC_CORTEX_URL') : undefined;
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

/** The Worker gives the model about 6s (two providers); the app stops waiting after this. */
export const WORDS_TIMEOUT_MS = 8000;

/**
 * Ask for the title and reaction. Never rejects: null when the call fails or
 * is too slow, and the drop's own words stand in for the title.
 */
export async function callDropWords(
  text: string,
  kind: { bucket?: string | null; subtype?: string | null } = {},
  timeoutMs: number = WORDS_TIMEOUT_MS,
): Promise<DropWords | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl || !text?.trim()) return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const request = (async (): Promise<DropWords | null> => {
    try {
      const sessionToken = await getSessionToken();
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          type: 'enrich-phase1-5a',
          text,
          // at the tap the kind is not known yet; the prompt works it out
          ...(kind.bucket ? { bucket: kind.bucket, subtype: kind.subtype ?? null } : {}),
          recentReactions: [...(useGremlyStore.getState().recentSpeech || [])],
          timezone: getDateService().getTimezone(),
          currentDate: dateService.today(),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) {
        console.log('[DropWords] non-OK', { status: res.status });
        return null;
      }
      const json = await res.json();
      const smartTitle =
        typeof json?.smart_title === 'string' && json.smart_title.trim()
          ? json.smart_title.trim()
          : null;
      const reaction =
        typeof json?.confirmation_message === 'string' && json.confirmation_message.trim()
          ? json.confirmation_message.trim()
          : null;
      if (reaction) useGremlyStore.getState().pushRecentSpeech(reaction);
      return { smartTitle, reaction };
    } catch (err) {
      console.log('[DropWords] request failed', { error: String(err) });
      return null;
    }
  })();

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const result = await Promise.race([request, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

const words = keyedCalls<DropWords>('title and reaction');

/** Start the title and reaction call at the tap, without the kind. */
export function startDropWords(drop: QueuedDrop): StartedCall<DropWords> {
  return words.start(drop.localId, () => callDropWords(drop.text));
}

/**
 * The call started at the tap, or, after an app restart, one started now with
 * the kind the drop was sorted as.
 */
export function dropWordsFor(drop: QueuedDrop): StartedCall<DropWords> {
  return (
    words.get(drop.localId) ??
    words.start(drop.localId, () =>
      callDropWords(drop.text, { bucket: drop.bucket ?? null, subtype: drop.subtype ?? null }),
    )
  );
}

export function forgetDropWords(localId: string): void {
  words.forget(localId);
}
