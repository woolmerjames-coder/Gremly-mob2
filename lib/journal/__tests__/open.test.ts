/**
 * How the rest of the app reaches the journal page (lib/journal/open): which
 * items open on it, and a new entry started with words already typed.
 */
let mockNotes: Record<string, unknown>[] = [];
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ notes: mockNotes }) },
}));

import { getDateService } from '../../date/DateService';
import { openEntryOnPage, opensOnPage, writeOnPage } from '../open';
import { useJournalSession } from '../session';

const opened = () => useJournalSession.getState().open;

beforeEach(() => {
  mockNotes = [];
  useJournalSession.setState({ open: null });
});

describe('opening a saved entry', () => {
  it('shows a journal entry on the page to read, on the day it belongs to', () => {
    mockNotes = [
      {
        id: 'n1',
        subtype: 'journal',
        created_at: '2026-09-25T01:10:00Z',
        views: { sweep_reflection: true, sweep_date: '2026-09-24' },
      },
    ];
    expect(opensOnPage('n1')).toBe(true);
    // asking does not open it
    expect(opened()).toBeNull();
    expect(openEntryOnPage('n1')).toBe(true);
    expect(opened()).toMatchObject({ day: '2026-09-24', entryId: 'n1', reading: true });
  });

  it('takes a drop Gremly filed as a journal entry, by the day it was written', () => {
    mockNotes = [{ id: 'd1', subtype: 'journal', created_at: '2026-09-24T19:00:00Z' }];
    expect(openEntryOnPage('d1')).toBe(true);
    expect(opened()).toMatchObject({
      day: getDateService().dayOf('2026-09-24T19:00:00Z'),
      entryId: 'd1',
    });
  });

  it('leaves anything that is not a journal entry to the overlay', () => {
    mockNotes = [
      { id: 'idea', subtype: 'idea', created_at: '2026-09-24T19:00:00Z' },
      { id: 'plain', created_at: '2026-09-24T19:00:00Z' },
    ];
    expect(openEntryOnPage('idea')).toBe(false);
    expect(openEntryOnPage('plain')).toBe(false);
    expect(openEntryOnPage('nowhere')).toBe(false);
    expect(opened()).toBeNull();
  });

  it('leaves one taken out of the journal, and a drop still waiting to be sorted', () => {
    mockNotes = [
      { id: 'out', subtype: 'journal', archived: true, created_at: '2026-09-24T19:00:00Z' },
      {
        id: 'held',
        subtype: 'journal',
        labels: ['needs_review'],
        created_at: '2026-09-24T19:00:00Z',
      },
    ];
    expect(openEntryOnPage('out')).toBe(false);
    expect(openEntryOnPage('held')).toBe(false);
    expect(opensOnPage('out')).toBe(false);
    expect(opensOnPage('held')).toBe(false);
    expect(opened()).toBeNull();
  });
});

describe('starting a new entry', () => {
  it('opens the day’s page to write on', () => {
    writeOnPage();
    const open = opened();
    expect(open?.day).toBe(getDateService().ritualDay());
    expect(open?.entryId).toBeUndefined();
    expect(open?.reading).toBeUndefined();
    expect(open?.carry).toBeUndefined();
  });

  it('starts with the words already typed', () => {
    writeOnPage('  Tired but pleased. ');
    expect(opened()?.carry).toBe('Tired but pleased.');
    writeOnPage('   ');
    expect(opened()?.carry).toBeUndefined();
  });
});
