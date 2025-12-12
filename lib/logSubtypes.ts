import type { LogSubtype } from './types';

/**
 * Convert persisted NoteSubtype to LogSubtype for UI display.
 *
 * Log classification subtypes:
 * - log-journal: personal reflections, diary entries
 * - log-idea: captured ideas, brainstorms
 * - log-general: default for all other logs
 */
export function persistedNoteSubtypeToLogSubtype(subtype?: string | null): LogSubtype {
  switch (subtype) {
    case 'journal':
      return 'journal';
    case 'idea':
      return 'idea';
    default:
      return 'general'; // All other note subtypes map to log-general
  }
}
