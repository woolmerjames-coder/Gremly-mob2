/**
 * moodValence — single tag → positive/negative/neutral mapping, and array → Valence.
 *
 * Extracted so both factsLoader and summaryRender can use it without depending on the
 * larger summaryTypes shapes.
 */

import type { Valence } from './summaryTypes';

export const MOOD_VALENCE: Record<string, 'positive' | 'negative' | 'neutral'> = {
  great: 'positive',
  good: 'positive',
  grateful: 'positive',
  hopeful: 'positive',
  focused: 'positive',
  calm: 'positive',
  okay: 'neutral',
  low: 'negative',
  tired: 'negative',
  anxious: 'negative',
  overwhelmed: 'negative',
  frustrated: 'negative',
  scattered: 'negative',
};

/**
 * Positive if at least one positive tag and zero negative; negative if mirrored; null if no
 * moods (intentional silence — different from neutral).
 */
export function moodArrayValence(moods: string[] | null | undefined): Valence | null {
  if (!moods || moods.length === 0) return null;
  let pos = 0;
  let neg = 0;
  for (const m of moods) {
    const v = MOOD_VALENCE[(m || '').toLowerCase()];
    if (v === 'positive') pos++;
    else if (v === 'negative') neg++;
  }
  if (pos > 0 && neg === 0) return 'positive';
  if (neg > 0 && pos === 0) return 'negative';
  if (pos > 0 && neg > 0) return 'mixed';
  return 'neutral';
}
