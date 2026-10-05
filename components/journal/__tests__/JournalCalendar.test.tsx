/**
 * The journal by month (components/journal/JournalCalendar): the days of the
 * month, which have an entry, moving between months, and what a chosen day
 * holds.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { JournalCalendar, type JournalCalendarProps } from '../JournalCalendar';
import type { JournalEntry } from '../../../lib/journal/entry';

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
  entry('sep24', '2026-09-24', { mood: ['frustrated', 'nonsense'] }),
  entry('sep30', '2026-09-30'),
  // a drop Gremly filed as a journal entry the same day, at lunchtime
  entry('sep30b', '2026-09-30', { created_at: '2026-09-30T12:00:00Z', views: {} }),
  entry('oct02', '2026-10-02'),
  entry('gone', '2026-10-03', { archived: true }),
];

function open(props: Partial<JournalCalendarProps> = {}) {
  const onOpen = jest.fn();
  const onToday = jest.fn();
  const utils = render(
    <JournalCalendar
      entries={ENTRIES}
      today={TODAY}
      todayCard={{ text: 'Nothing written yet today.', action: 'Write today', onPress: onToday }}
      onOpen={onOpen}
      {...props}
    />,
  );
  const day = (d: string) => utils.getByTestId(`journal-cal-day-${d}`);
  return { ...utils, onOpen, onToday, day };
}

describe('the month', () => {
  it('opens on this month with today chosen', () => {
    const { getByTestId, day, queryByTestId } = open();
    expect(getByTestId('journal-cal-month').props.children).toBe('October 2026');
    expect(day(TODAY).props.accessibilityState).toMatchObject({ selected: true });
    expect(day(TODAY).props.accessibilityLabel).toBe('Monday 5 October, today');
    expect(queryByTestId('journal-cal-day-2026-10-31')).toBeTruthy();
    expect(queryByTestId('journal-cal-day-2026-10-32')).toBeNull();
  });

  it('marks the days with an entry, and counts the month’s entries', () => {
    const { getByTestId, day } = open();
    expect(day('2026-10-02').props.accessibilityLabel).toBe('Friday 2 October, has an entry');
    expect(day('2026-10-01').props.accessibilityLabel).toBe('Thursday 1 October, nothing written');
    // one taken out of the journal is not counted or marked
    expect(day('2026-10-03').props.accessibilityLabel).toBe('Saturday 3 October, nothing written');
    expect(getByTestId('journal-cal-count').props.children).toBe('1 entry this month');
  });

  it('does not let a day still to come be chosen', () => {
    const { day } = open();
    expect(day('2026-10-06').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('goes back as far as the first entry, and never ahead of this month', () => {
    const { getByTestId, queryByTestId } = open();
    expect(getByTestId('journal-cal-next').props.accessibilityState?.disabled ?? true).toBe(true);
    fireEvent.press(getByTestId('journal-cal-prev'));
    expect(getByTestId('journal-cal-month').props.children).toBe('September 2026');
    expect(getByTestId('journal-cal-count').props.children).toBe('3 entries this month');
    // the day chosen was in the other month
    expect(getByTestId('journal-cal-tap')).toBeTruthy();
    fireEvent.press(getByTestId('journal-cal-prev'));
    expect(getByTestId('journal-cal-month').props.children).toBe('September 2026');
    fireEvent.press(getByTestId('journal-cal-next'));
    expect(getByTestId('journal-cal-month').props.children).toBe('October 2026');
    expect(queryByTestId('journal-cal-tap')).toBeTruthy();
  });
});

describe('today', () => {
  it('says what it was given to say, and its button does what it was given to do', () => {
    const { getByText, getByTestId, onToday } = open();
    expect(getByText('Monday 5 October')).toBeTruthy();
    expect(getByText('Nothing written yet today.')).toBeTruthy();
    fireEvent.press(getByTestId('journal-cal-today-open'));
    expect(onToday).toHaveBeenCalled();
  });

  it('does not list today’s own page again under its button, but lists anything else from today', () => {
    const entries = [
      ...ENTRIES,
      entry('page', TODAY),
      entry('drop', TODAY, { created_at: `${TODAY}T12:00:00Z`, views: {} }),
    ];
    const { queryByTestId, getByTestId } = open({ entries, todayEntryId: 'page' });
    expect(queryByTestId('journal-cal-entry-page')).toBeNull();
    expect(getByTestId('journal-cal-entry-drop')).toBeTruthy();
  });
});

describe('a day that is chosen', () => {
  it('shows its entry, to open', () => {
    const { day, getByText, getByTestId, onOpen, queryByTestId } = open();
    fireEvent.press(day('2026-10-02'));
    expect(queryByTestId('journal-cal-today')).toBeNull();
    expect(getByText('Fri 2 Oct')).toBeTruthy();
    expect(getByText('Entry oct02')).toBeTruthy();
    expect(getByText('Words of oct02.')).toBeTruthy();
    expect(getByText('Open this day')).toBeTruthy();
    fireEvent.press(getByTestId('journal-cal-open-oct02'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'oct02' }));
  });

  it('shows each entry of a day that has more than one, in the order written', () => {
    const { day, getByTestId, getAllByText, queryAllByTestId, onOpen } = open({
      startOn: '2026-09-30',
    });
    expect(day('2026-09-30').props.accessibilityState).toMatchObject({ selected: true });
    expect(queryAllByTestId(/^journal-cal-entry-/).map((e) => e.props.testID)).toEqual([
      'journal-cal-entry-sep30b',
      'journal-cal-entry-sep30',
    ]);
    expect(getAllByText('Open')).toHaveLength(2);
    fireEvent.press(getByTestId('journal-cal-open-sep30b'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'sep30b' }));
  });

  it('shows the moods the app knows', () => {
    const { getByText, queryByText } = open({ startOn: '2026-09-24' });
    expect(getByText('Frustrated')).toBeTruthy();
    expect(queryByText('nonsense')).toBeNull();
  });

  it('says so when nothing was written that day', () => {
    const { day, getByTestId, getByText } = open();
    fireEvent.press(day('2026-10-01'));
    expect(getByTestId('journal-cal-nothing')).toBeTruthy();
    expect(getByText('Nothing written that day.')).toBeTruthy();
  });
});
