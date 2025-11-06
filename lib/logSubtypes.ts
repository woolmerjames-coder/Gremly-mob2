import type { LogSubtype } from './types';

export function persistedNoteSubtypeToLogSubtype(subtype?: string | null): LogSubtype {
  switch (subtype) {
    case 'journal':
      return 'journal';
    case 'idea':
      return 'idea';
    case 'list':
      return 'list';
    default:
      return 'everything_else';
  }
}
