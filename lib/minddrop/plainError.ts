/**
 * The words a person reads when something they tapped did not go through
 * (the planning chat's final check, item 3). Mind Drop's own messages for
 * people are thrown as PlainError and shown as they are; anything else (a
 * database or network error, whatever its words) is logged by the caller and
 * shows DIDNT_GO, never its own message.
 */
export const DIDNT_GO = 'That did not go through. Try again in a moment.';

export class PlainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlainError';
  }
}

/** What to show for an error: our own plain words, or DIDNT_GO. */
export function wordsForError(err: unknown): string {
  return err instanceof PlainError && err.message ? err.message : DIDNT_GO;
}
