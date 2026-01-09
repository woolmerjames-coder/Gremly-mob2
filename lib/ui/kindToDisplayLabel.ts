import type { RecordType } from '../types';
import { persistedToCanonical } from '../cortex/canonicalMap';
import type { CanonicalType } from '../cortex/canonicalMap';

type NoteSubtype = string | null | undefined;

// Display label type: 'note' for logs (UI shows "Note"), others as canonical
type DisplayLabel = CanonicalType | 'note';

export function kindToDisplayLabel(
  recordType: RecordType,
  noteSubtype: NoteSubtype,
  canonicalTypesOn: boolean,
): DisplayLabel {
  if (!canonicalTypesOn) {
    return recordType ?? 'note';
  }

  const canonical = persistedToCanonical(recordType, noteSubtype ?? null);
  // Map canonical 'log' to display label 'note' (UI shows "Note" instead of "Log")
  return canonical === 'log' ? 'note' : canonical;
}
