/**
 * What got me here: the one line on the age up page, written on the server
 * from the three fed days that earned the age (workers/cortex/age/words.js).
 * Null when there is none in time: the card then shows its fallback, and
 * the real line replaces it if it arrives before Keep going.
 */

import { env, getEnv } from '../env';
import { getDateService } from '../date/DateService';
import { getSessionToken } from './getSessionToken';

/** The card is due 5.6s into the moment; the request goes out at about 0.4s. */
const AGE_WORDS_TIMEOUT_MS = 9000;

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

function readCortexUrl(): string {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
}

export async function requestAgeWords(age: number): Promise<string | null> {
  const baseUrl = readCortexUrl();
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGE_WORDS_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionToken = await getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ type: 'age-words', age, timezone: getDateService().getTimezone() }),
    });
    if (!res.ok) {
      console.warn('[AgeWords] The server answered', res.status);
      return null;
    }
    const data = await res.json();
    return typeof data?.line === 'string' && data.line.trim() ? data.line.trim() : null;
  } catch (err) {
    console.warn('[AgeWords] No line:', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
