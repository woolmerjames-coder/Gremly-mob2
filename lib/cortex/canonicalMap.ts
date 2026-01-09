import type { RecordType } from '../types';

export type CanonicalType = 'habit' | 'todo' | 'log' | 'unsorted';

/**
 * Map persisted record type + subtype to canonical display type.
 *
 * Note types (notes that should display as "Note"):
 * - journal: personal reflections, diary entries (log-journal)
 * - idea: captured ideas, brainstorms (log-idea)
 * - catchall: general logs - the default for all other logs (log-general)
 * - list: checklist-style notes (also a log)
 * - reference: reference/lookup notes (also a log)
 *
 * Unsorted: notes without a subtype (legacy or pending classification)
 */
export function persistedToCanonical(
  recordType: RecordType,
  subtype?: string | null,
): CanonicalType {
  if (recordType === 'habit') return 'habit';
  if (recordType === 'todo') return 'todo';

  // All note subtypes that should display as "Note" (not "Unsorted")
  // The 3 primary note types are: journal, idea, general (stored as 'catchall')
  if (
    subtype === 'journal' ||
    subtype === 'idea' ||
    subtype === 'general' || // LogSubtype value
    subtype === 'catchall' || // NoteSubtype persisted value (maps to log-general)
    subtype === 'list' ||
    subtype === 'reference'
  ) {
    return 'log';
  }

  return 'unsorted';
}
