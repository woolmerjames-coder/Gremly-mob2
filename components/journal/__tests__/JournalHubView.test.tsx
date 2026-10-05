/**
 * The journal in the Hub (components/journal/JournalHubView): the month, the
 * list of every entry, opening one, and starting today's page.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { JournalHubView } from '../JournalHubView';
import { getDateService } from '../../../lib/date/DateService';
import type { JournalEntry } from '../../../lib/journal/entry';
import { newPage } from '../../../lib/journal/page';
import { FREEFORM, pageById } from '../../../lib/journal/pages';
import { keepDraft, useJournalSession } from '../../../lib/journal/session';

const TODAY = '2026-10-05';
const entry = (id: string, day: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  subtype: 'journal',
  title: `Entry ${id}`,
  body: `Words of ${id}.`,
  created_at: `${day}T19:00:00Z`,
  views: { sweep_reflection: true, sweep_date: day },
  ...extra,
});
const ENTRIES = [
  entry('sep24', '2026-09-24'),
  entry('oct02', '2026-10-02'),
  entry('sep30', '2026-09-30'),
];

function open(entries: JournalEntry[] = ENTRIES) {
  const onOpen = jest.fn();
  const utils = render(<JournalHubView entries={entries} onOpen={onOpen} />);
  return { ...utils, onOpen };
}

beforeEach(() => {
  jest.spyOn(getDateService(), 'ritualDay').mockReturnValue(TODAY);
  useJournalSession.setState({ open: null, drafts: {}, lastPage: FREEFORM });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the list', () => {
  it('has every entry by month, newest first', () => {
    const { getAllByText, getByText, queryAllByTestId } = open();
    // the month's own heading, and the list's heading for the same month
    expect(getAllByText('October 2026')).toHaveLength(2);
    expect(getByText('September 2026')).toBeTruthy();
    expect(queryAllByTestId(/^journal-timeline-/).map((r) => r.props.testID)).toEqual([
      'journal-timeline-oct02',
      'journal-timeline-sep30',
      'journal-timeline-sep24',
    ]);
  });

  it('shows each entry’s day, title and first words', () => {
    const { getByTestId, getByText } = open();
    expect(getByTestId('journal-timeline-sep24').props.accessibilityLabel).toBe(
      'Thursday 24 September. Entry sep24',
    );
    expect(getByText('Entry sep24')).toBeTruthy();
    expect(getByText('Words of sep24.')).toBeTruthy();
  });

  it('opens an entry from its row', () => {
    const { getByTestId, onOpen } = open();
    fireEvent.press(getByTestId('journal-timeline-sep30'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'sep30' }));
  });

  it('says so when the journal is empty, and still has the month', () => {
    const { getByTestId, getByText, queryByTestId } = open([]);
    expect(getByTestId('journal-view-empty')).toBeTruthy();
    expect(getByText('Nothing in your journal yet.')).toBeTruthy();
    expect(queryByTestId('journal-view-timeline')).toBeNull();
    expect(getByTestId('journal-calendar')).toBeTruthy();
  });
});

describe('the month', () => {
  it('opens an entry from its day', () => {
    const { getByTestId, onOpen } = open();
    fireEvent.press(getByTestId('journal-cal-day-2026-10-02'));
    fireEvent.press(getByTestId('journal-cal-open-oct02'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'oct02' }));
  });
});

describe('today', () => {
  it('can be started from here', () => {
    const { getByText, getByTestId } = open();
    expect(getByText('Nothing written yet today.')).toBeTruthy();
    expect(getByText('Write today')).toBeTruthy();
    fireEvent.press(getByTestId('journal-cal-today-open'));
    const asked = useJournalSession.getState().open;
    expect(asked).toMatchObject({ day: TODAY });
    expect(asked?.entryId).toBeUndefined();
    expect(asked?.reading).toBeUndefined();
  });

  it('can be carried on when a page was started and closed before Done', () => {
    keepDraft(`day:${TODAY}`, { page: newPage(pageById('rose')), moods: [] });
    const { getByText } = open();
    expect(getByText('You started a page today.')).toBeTruthy();
    expect(getByText('Keep writing')).toBeTruthy();
  });

  it('opens to add more once it is saved, and is not listed twice in the month', () => {
    const { getByText, queryByTestId, getByTestId } = open([...ENTRIES, entry('today', TODAY)]);
    expect(getByText('Saved today. Open it to add more.')).toBeTruthy();
    expect(getByText('Open today')).toBeTruthy();
    expect(queryByTestId('journal-cal-entry-today')).toBeNull();
    // it is in the list like any other entry
    expect(getByTestId('journal-timeline-today')).toBeTruthy();
  });
});
