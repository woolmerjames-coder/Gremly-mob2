/**
 * Follow-up messages shown in Gremly's speech bubble after AI processing.
 * Pure data + a single picker — no side-effects.
 */
import { pickRandom } from './gremlySpeech';

const MULTI_MESSAGES = [
  'That one had layers — I split it up for you!',
  'Two-for-one! I separated those out.',
  'I caught a combo — check your cards!',
  'Multiple things detected — I split them up.',
  'Nice bundle! I broke it into pieces.',
];

const CLARIFY_MESSAGES = [
  "Hmm, I wasn't sure about that one — can you clarify?",
  'Quick question about your last drop…',
  'I need a tiny bit more context on that one.',
  'Not quite sure what you meant — mind clarifying?',
  'One sec — could you help me understand that?',
];

/**
 * Returns a speech-bubble message for the given follow-up signal,
 * avoiding any string already in `recentSpeech`.
 * Returns `null` for unknown/null signals.
 */
export function getFollowUpMessage(
  signal: 'multi' | 'clarify' | null | undefined,
  recentSpeech: string[],
): string | null {
  if (!signal) return null;
  const pool = signal === 'multi' ? MULTI_MESSAGES : CLARIFY_MESSAGES;
  return pickRandom(pool, recentSpeech);
}
