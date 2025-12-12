import type { CanonicalType, LogSubtype, RecordType } from './types';

export type PersistedRecordType = RecordType;

export type PersistedMapping = {
  recordType: PersistedRecordType;
  noteSubtype?: string | null;
};

export function canonicalToPersisted(
  canonical: CanonicalType,
  sub?: LogSubtype | null,
): PersistedMapping {
  switch (canonical) {
    case 'habit':
      return { recordType: 'habit' };
    case 'todo':
      return { recordType: 'todo' };
    case 'log': {
      // Map LogSubtype to NoteSubtype for persistence:
      // - log-journal → 'journal'
      // - log-idea → 'idea'
      // - log-general → 'catchall'
      const noteSubtype = (() => {
        switch (sub) {
          case 'journal':
            return 'journal';
          case 'idea':
            return 'idea';
          case 'general':
          default:
            return 'catchall'; // log-general
        }
      })();
      return { recordType: 'note', noteSubtype };
    }
    case 'unsorted':
    default:
      return { recordType: 'note', noteSubtype: 'catchall' };
  }
}
