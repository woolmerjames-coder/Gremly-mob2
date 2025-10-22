import data from './smalltalk_responses.json';

/**
 * Picks a deterministic small-talk response to avoid repetition
 * @param seed - Optional string to seed the selection (e.g., user text)
 * @returns A small-talk response string
 */
export function pickSmalltalk(seed?: string): string {
  if (!Array.isArray(data) || data.length === 0) {
    return 'Okay!';
  }

  // Simple deterministic pick based on seed to avoid repetition
  const h = (seed ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return data[h % data.length];
}

/**
 * Checks if a user message looks like an acknowledgment that shouldn't trigger small-talk
 * @param text - User input text
 * @returns true if this looks like a short acknowledgment
 */
export function isAcknowledgment(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const ackWords = [
    'ok',
    'okay',
    'thanks',
    'thank you',
    'kk',
    'cool',
    'nice',
    'yeah',
    'yep',
    'sure',
  ];
  return ackWords.includes(normalized);
}
