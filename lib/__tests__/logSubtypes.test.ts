/**
 * Tests for logSubtypes — NoteSubtype to LogSubtype mapping
 */

import { persistedNoteSubtypeToLogSubtype } from '../logSubtypes';

describe('persistedNoteSubtypeToLogSubtype', () => {
  it('maps "journal" to "journal"', () => {
    expect(persistedNoteSubtypeToLogSubtype('journal')).toBe('journal');
  });

  it('maps "idea" to "idea"', () => {
    expect(persistedNoteSubtypeToLogSubtype('idea')).toBe('idea');
  });

  it('maps "event" to "event"', () => {
    expect(persistedNoteSubtypeToLogSubtype('event')).toBe('event');
  });

  it('maps unknown subtypes to "general"', () => {
    expect(persistedNoteSubtypeToLogSubtype('something_else')).toBe('general');
  });

  it('maps null/undefined to "general"', () => {
    expect(persistedNoteSubtypeToLogSubtype(null)).toBe('general');
    expect(persistedNoteSubtypeToLogSubtype(undefined)).toBe('general');
  });
});
