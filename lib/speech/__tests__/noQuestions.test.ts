/**
 * Nothing in Gremly's bubble asks the user anything (Mind Drop rethink stage
 * 10, decided 9 October), so no one takes Mind Drop for a chat and answers in
 * their next drop. Every fixed line said after a drop, on an error, in a nudge
 * or in a growth moment is a statement, with no long dash. The greetings that
 * invite a drop on an empty box are the exception and are not read here.
 */
import { SPEECH_POOLS } from '../gremlySpeech';
import {
  AFTER_LINE,
  AGE_BANDS,
  CARD_CLOSE,
  CARD_FALLBACK,
  FED_BUBBLES,
  FED_COUNTS,
  FED_LINES,
  HOOK_LINE,
  MORNING_LINE,
  WAITING_LINE,
} from '../momentWords';

const linesOf = (v: unknown): string[] => {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(linesOf);
  if (v && typeof v === 'object') return Object.values(v).flatMap(linesOf);
  return [];
};

const pools: Record<string, unknown> = {
  'after a drop': {
    SUCCESS: SPEECH_POOLS.SUCCESS,
    MILESTONES: SPEECH_POOLS.MILESTONES,
    PHOTO: SPEECH_POOLS.PHOTO,
    FIRST_DROP: SPEECH_POOLS.FIRST_DROP,
    RETURNING_USER: SPEECH_POOLS.RETURNING_USER,
    RAPID_FIRE: SPEECH_POOLS.RAPID_FIRE,
    GAUGE_POST_DROP: SPEECH_POOLS.GAUGE_POST_DROP,
    BRAND: SPEECH_POOLS.BRAND,
  },
  'on an error': SPEECH_POOLS.ERRORS,
  'in a nudge': SPEECH_POOLS.SWEEP_NUDGE,
  'in a growth moment': [
    FED_LINES,
    FED_COUNTS,
    FED_BUBBLES,
    AGE_BANDS.map((band) => band[2]),
    AFTER_LINE,
    CARD_CLOSE,
    CARD_FALLBACK,
    HOOK_LINE,
    MORNING_LINE,
    WAITING_LINE,
  ],
};

describe('the bubble never asks', () => {
  for (const [where, pool] of Object.entries(pools)) {
    it(`every line ${where} is a statement`, () => {
      const lines = linesOf(pool);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.filter((line) => line.includes('?'))).toEqual([]);
      expect(lines.filter((line) => /[–—]/.test(line))).toEqual([]);
    });
  }
});
