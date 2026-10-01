/**
 * The line under the DROP | CHAT switch in someone's first week, saying what
 * each side is for. It goes once they have had a week to learn it.
 */

export const DROP_CAPTION = 'Drop anything in and Gremly sorts it';
export const CHAT_CAPTION = 'Talk anything through with Gremly';

export const FIRST_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True in the week after the account was made; false when that is not known. */
export function inFirstWeek(createdAt: string | null | undefined, nowMs: number): boolean {
  if (!createdAt) return false;
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return false;
  const age = nowMs - made;
  return age >= 0 && age < FIRST_WEEK_MS;
}
