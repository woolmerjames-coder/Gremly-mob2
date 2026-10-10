/**
 * What a note saved from the Save items pill starts as. The pill's extractor
 * names each new thing's kind (workers/cortex/chatPrompts.js buildPillPrompt):
 * a note with its own subtype, or an event with the day it happens. An event
 * is saved as an event with that day, the way Mind Drop saves one
 * (lib/minddrop/dropSync.ts), so it is on their days and Gremly reads it as an
 * event. Before, every event was saved as a plain note and its day was lost.
 */
import { nowTimestamp } from '../date/DateService';

export interface PillExtraction {
  type: string;
  subtype?: string | null;
  /** For an event: the most likely day, YYYY-MM-DD */
  resolved_date?: string | null;
  /** For an event: exact, approximate, or unknown when they gave no timing */
  date_confidence?: string | null;
}

/** The subtype the enrichment calls are told about. */
export function pillNoteSubtype(item: PillExtraction): string {
  if (item.type === 'event') return 'event';
  return item.subtype || 'general';
}

/** The note's kind and, for an event, its day and how sure the day is. */
export function pillNoteColumns(item: PillExtraction): Record<string, unknown> {
  if (item.type !== 'event') return { subtype: pillNoteSubtype(item) };
  const day =
    typeof item.resolved_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.resolved_date) &&
    item.date_confidence !== 'unknown'
      ? item.resolved_date
      : null;
  return {
    subtype: 'event',
    target_date: day,
    ...(day
      ? {
          date_confidence: item.date_confidence === 'exact' ? 'exact' : 'approximate',
          captured_at: nowTimestamp(),
        }
      : {}),
  };
}
