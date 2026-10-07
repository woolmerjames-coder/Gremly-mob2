/**
 * The week's intention, read from their notes: a journal note marked as an
 * intention and dated the first day of the week it is for (lib/changes/week.ts
 * writes it). Pure: the notes are handed in.
 */
import { addDays } from './model';

type Item = Record<string, any>;

const dayPart = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');

/** An intention's words, as the note holds them. */
export function intentionText(note: Item | null | undefined): string | null {
  const text = String(note?.body ?? note?.title ?? '').trim();
  return text || null;
}

/** The intention notes dated from one day to another, the latest first. */
function intentionsBetween(notes: Item[] | null | undefined, first: string, last: string): Item[] {
  return (notes ?? [])
    .filter(
      (n) =>
        n.journal_subtype === 'intention' &&
        !n.archived &&
        n.target_date != null &&
        dayPart(n.target_date) >= first &&
        dayPart(n.target_date) <= last,
    )
    .sort((a, b) => dayPart(b.target_date).localeCompare(dayPart(a.target_date)));
}

/**
 * The intention of the week a day is in: the one whose week began within the
 * seven days up to that day. Null when they set none, or it has no words.
 */
export function intentionOn(
  notes: Item[] | null | undefined,
  day: string,
): { id: string; text: string } | null {
  const note = intentionsBetween(notes, addDays(day, -6), day)[0] ?? null;
  const text = intentionText(note);
  return note && text ? { id: note.id as string, text } : null;
}
