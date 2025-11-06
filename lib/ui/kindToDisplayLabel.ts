import type { RecordType } from '../types';
import { persistedToCanonical } from '../cortex/canonicalMap';
import type { CanonicalType } from '../cortex/canonicalMap';

type NoteSubtype = string | null | undefined;

type DisplayLabel = CanonicalType | 'note';

export function kindToDisplayLabel(
  recordType: RecordType,
  noteSubtype: NoteSubtype,
  canonicalTypesOn: boolean,
): DisplayLabel {
  if (!canonicalTypesOn) {
    return recordType ?? 'note';
  }

  return persistedToCanonical(recordType, noteSubtype ?? null);
}
