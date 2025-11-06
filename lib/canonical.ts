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
      const noteSubtype = (() => {
        switch (sub) {
          case 'journal':
            return 'journal';
          case 'idea':
            return 'idea';
          case 'list':
            return 'list';
          // Person is a UI subtype. Persist as catchall for now and let UI/labels handle person linking.
          case 'person':
          case 'everything_else':
          default:
            return 'catchall';
        }
      })();
      return { recordType: 'note', noteSubtype };
    }
    case 'unsorted':
    default:
      return { recordType: 'note', noteSubtype: 'catchall' };
  }
}
