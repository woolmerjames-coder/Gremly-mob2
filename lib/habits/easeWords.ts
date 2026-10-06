/**
 * A habit's pause or lighter version, in the words the habit's own screens
 * show: the list of habits and the habit's detail. A paused habit is off
 * Today and nothing asks about it, so these are where it says why.
 */
import { easesFrom, type Ease } from '../week/habitWeek';
import { shortDate, shortDay } from '../week/review/words';

type Row = Record<string, any>;

/** "Sun 11 Oct" */
const dayWords = (day: string) => `${shortDay(day)} ${shortDate(day)}`;

/**
 * The pause or lighter version to show for a habit: the one it is under
 * today, else the next one to come. Null when it has neither.
 */
export function easeToShow(
  rows: Row[] | null | undefined,
  habitId: string,
  today: string,
): Ease | null {
  return (
    easesFrom(
      (rows ?? []).filter((r) => r?.habit_id === habitId),
      today,
    )[0] ?? null
  );
}

/**
 * "Paused" for a habit paused today, where the list would say whether it
 * needs a check in; null otherwise. A lighter version is still one to check
 * in on, so the list says nothing of it: its words are on the habit's own
 * screen.
 */
export function easeTag(
  rows: Row[] | null | undefined,
  habitId: string,
  today: string,
): string | null {
  const e = easeToShow(rows, habitId, today);
  return e && e.first <= today && e.mode === 'pause' ? 'Paused' : null;
}

/**
 * "Paused until Sun 11 Oct", "Paused today", "Paused from Mon 12 Oct to Sun
 * 18 Oct", and the same for a lighter version, with what it is when they
 * said: "Lighter version until Sun 11 Oct: 10 minute walk".
 */
export function easeLine(e: Ease, today: string): string {
  const what = e.mode === 'pause' ? 'Paused' : 'Lighter version';
  let when: string;
  if (e.first > today) {
    when =
      e.first === e.last
        ? `on ${dayWords(e.first)}`
        : `from ${dayWords(e.first)} to ${dayWords(e.last)}`;
  } else {
    when = e.last === today ? 'today' : `until ${dayWords(e.last)}`;
  }
  return `${what} ${when}${e.mode === 'lighter' && e.note ? `: ${e.note}` : ''}`;
}

export const EASE_COPY = {
  backToUsual: 'Back to usual',
  /** for one that has not started yet: there is nothing to go back from */
  remove: 'Remove',
  pausedNote: "It's off Today and I won't ask about it. If you do it anyway, it still counts.",
  lighterNote: 'The lighter version counts in full.',
  failed: "I couldn't change that. Try it again.",
} as const;
