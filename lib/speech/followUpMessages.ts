/**
 * Follow-up messages shown in Gremly's speech bubble after AI processing.
 * Pure data + a single picker — no side-effects.
 */
import { pickRandom } from './gremlySpeech';

const FOLLOW_UP_MESSAGES = {
  multi: [
    "Looks like there's a few things in here. Tap the card and I can split or keep as one.",
    "I think there's more than one thing here. Tap the card to sort it out.",
    "There might be a couple things bundled up. Tap the card and we'll figure it out.",
  ],
  clarify: [
    'I want to make sure I filed this right. Tap the card when you have a sec.',
    "Not totally sure what you meant. Tap the card and I'll sort it.",
  ],
} as const;

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
  const pool = FOLLOW_UP_MESSAGES[signal];
  return pickRandom([...pool], recentSpeech);
}
