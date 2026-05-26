/**
 * moodValence.ts — the single source of truth for mood-tag valence.
 *
 * `notes.mood` is text[] drawn from a controlled 13-value vocabulary. Several summary
 * detectors (felt_vs_narrated_gap, mood_baseline_drift, single_emotional_arc, hinge_moment)
 * need to bucket those values into positive / negative / neutral identically. That mapping
 * lives in exactly one place — here — so no detector invents its own.
 *
 * A note's `mood` is an ARRAY: a single entry can be tagged both `grateful` and `tired`.
 * Mixed-mood rule (decided once, applied everywhere): an entry is positive if it has
 * >= 1 positive and 0 negative tags; negative if >= 1 negative and 0 positive; mixed if it
 * has both; neutral otherwise (only `okay`, empty, or unrecognized tags).
 */

export type MoodValence = 'positive' | 'negative' | 'neutral';
export type EntryValence = 'positive' | 'negative' | 'mixed' | 'neutral';

/** Per-value valence. The 13 controlled values from the notes.mood column. */
export const MOOD_VALENCE: Readonly<Record<string, MoodValence>> = Object.freeze({
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
});

export const POSITIVE_MOODS: readonly string[] = Object.keys(MOOD_VALENCE).filter(
  (m) => MOOD_VALENCE[m] === 'positive',
);
export const NEGATIVE_MOODS: readonly string[] = Object.keys(MOOD_VALENCE).filter(
  (m) => MOOD_VALENCE[m] === 'negative',
);

/** Valence of a single value; unknown tags are neutral. */
export function moodValence(mood: string): MoodValence {
  return MOOD_VALENCE[(mood ?? '').toLowerCase().trim()] ?? 'neutral';
}

/**
 * Classify a single note's mood ARRAY into one bucket (the mixed-mood rule).
 * Empty / null / all-unrecognized => neutral.
 */
export function classifyMoodEntry(moods: string[] | null | undefined): EntryValence {
  if (!moods || moods.length === 0) return 'neutral';
  let hasPos = false;
  let hasNeg = false;
  for (const m of moods) {
    const v = moodValence(m);
    if (v === 'positive') hasPos = true;
    else if (v === 'negative') hasNeg = true;
  }
  if (hasPos && hasNeg) return 'mixed';
  if (hasPos) return 'positive';
  if (hasNeg) return 'negative';
  return 'neutral';
}

/**
 * Positive:negative ratio across a set of mood-tagged entries, plus bucket counts.
 * Used by felt_vs_narrated_gap (ratio >= 1.5x) and mood_baseline_drift (month-over-month).
 * `ratio` is positive/negative; Infinity when positives exist and zero negatives;
 * null when there are neither positives nor negatives.
 */
export function moodEntryStats(entries: Array<string[] | null | undefined>): {
  positive: number;
  negative: number;
  mixed: number;
  neutral: number;
  total: number;
  ratio: number | null;
} {
  let positive = 0;
  let negative = 0;
  let mixed = 0;
  let neutral = 0;
  for (const e of entries) {
    switch (classifyMoodEntry(e)) {
      case 'positive':
        positive++;
        break;
      case 'negative':
        negative++;
        break;
      case 'mixed':
        mixed++;
        break;
      default:
        neutral++;
    }
  }
  const total = positive + negative + mixed + neutral;
  const ratio = negative === 0 ? (positive === 0 ? null : Infinity) : positive / negative;
  return { positive, negative, mixed, neutral, total, ratio };
}
