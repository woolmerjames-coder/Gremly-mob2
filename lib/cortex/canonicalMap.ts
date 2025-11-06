import type { RecordType } from '../types';

export type CanonicalType = 'habit' | 'todo' | 'log' | 'unsorted';

export function persistedToCanonical(
  recordType: RecordType,
  subtype?: string | null,
): CanonicalType {
  if (recordType === 'habit') return 'habit';
  if (recordType === 'todo') return 'todo';

  if (subtype === 'journal' || subtype === 'idea' || subtype === 'list') {
    return 'log';
  }

  return 'unsorted';
}
