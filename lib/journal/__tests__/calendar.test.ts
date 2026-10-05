/**
 * The month view's sums (lib/journal/calendar): a month's days in weeks, the
 * months worth showing, how an entry reads in a list, and what is said about
 * today.
 */
import {
  entrySnippet,
  entryTitle,
  monthCount,
  monthDays,
  monthOf,
  monthTitle,
  monthsToShow,
  shiftMonth,
  todayCard,
} from '../calendar';
import type { JournalEntry } from '../entry';
import { LAYOUT_KEY, newPage, setCardHtml, toLayout } from '../page';
import { pageById } from '../pages';

const entry = (id: string, day: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  subtype: 'journal',
  created_at: `${day}T19:00:00Z`,
  views: { sweep_reflection: true, sweep_date: day },
  ...extra,
});

describe('a month laid out in weeks', () => {
  it('has its days in order, after the empty places before the first', () => {
    // 1 October 2026 is a Thursday, in a week that starts on Sunday
    const october = monthDays('2026-10');
    expect(october.lead).toBe(4);
    expect(october.days).toHaveLength(31);
    expect(october.days[0]).toBe('2026-10-01');
    expect(october.days[30]).toBe('2026-10-31');
  });

  it('knows a short month, a leap year, and a month that starts the week', () => {
    expect(monthDays('2026-02').days).toHaveLength(28);
    expect(monthDays('2028-02').days).toHaveLength(29);
    // 1 November 2026 is a Sunday
    expect(monthDays('2026-11').lead).toBe(0);
  });

  it('steps from month to month across a year end', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-10', -14)).toBe('2025-08');
  });

  it('names a month, and finds the month of a day', () => {
    expect(monthOf('2026-10-05')).toBe('2026-10');
    expect(monthTitle('2026-10')).toBe('October 2026');
    expect(monthCount(1)).toBe('1 entry this month');
    expect(monthCount(0)).toBe('0 entries this month');
  });
});

describe('the months worth showing', () => {
  it('run from the first entry to this month, and never ahead of today', () => {
    const entries = [entry('a', '2026-07-12'), entry('b', '2026-09-30')];
    expect(monthsToShow(entries, '2026-10-05')).toEqual({ first: '2026-07', last: '2026-10' });
  });

  it('are just this month while nothing is written', () => {
    expect(monthsToShow([], '2026-10-05')).toEqual({ first: '2026-10', last: '2026-10' });
  });

  it('go by the day an entry belongs to, not when it was saved', () => {
    // written just after midnight on 1 October, for 30 September
    const late = entry('a', '2026-09-30', { created_at: '2026-10-01T07:20:00Z' });
    expect(monthsToShow([late], '2026-10-05').first).toBe('2026-09');
  });
});

describe('an entry in a list', () => {
  it('goes by its title, or its first words when it has none', () => {
    expect(entryTitle({ title: ' A long day, a good run ', body: 'Tired.' })).toBe(
      'A long day, a good run',
    );
    expect(entryTitle({ title: '', body: 'Tired but pleased.\nMore.' })).toBe('Tired but pleased.');
    expect(entryTitle({ title: null, body: null })).toBe('Journal entry');
  });

  it('previews one written on the page by its answers, without the prompts', () => {
    const rose = newPage(pageById('rose'));
    const filled = setCardHtml(
      setCardHtml(rose, rose.cards[0].id, '<html><p>The walk.</p></html>'),
      rose.cards[1].id,
      '<html><p>The budget review.</p></html>',
    );
    const layout = toLayout(filled);
    expect(entrySnippet({ body: layout.text, views: { [LAYOUT_KEY]: layout } })).toBe(
      'The walk. The budget review.',
    );
  });

  it('previews any other entry by its words on one line', () => {
    expect(entrySnippet({ body: ' Tired.\n\nBut  pleased. ' })).toBe('Tired. But pleased.');
    expect(entrySnippet({ body: null })).toBe('');
  });

  it('goes by the words when the entry was changed somewhere else since', () => {
    const rose = newPage(pageById('rose'));
    const layout = toLayout(setCardHtml(rose, rose.cards[0].id, '<html><p>The walk.</p></html>'));
    expect(
      entrySnippet({ body: 'Rewritten in the overlay.', views: { [LAYOUT_KEY]: layout } }),
    ).toBe('Rewritten in the overlay.');
  });
});

describe('what is said about today', () => {
  it('is that you are writing it, when its page is the one on screen', () => {
    expect(todayCard('saved', { here: true })).toEqual({
      text: 'The page you are writing now.',
      action: 'Keep writing',
    });
    expect(todayCard('empty', { here: true }).action).toBe('Keep writing');
  });

  it('offers the way back when its page is waiting behind an older entry', () => {
    expect(todayCard('started', { back: true })).toEqual({
      text: 'You started a page today.',
      action: 'Back to today',
    });
    expect(todayCard('saved', { back: true }).action).toBe('Back to today');
  });

  it('otherwise says how far along it is, and opens it', () => {
    expect(todayCard('empty')).toEqual({
      text: 'Nothing written yet today.',
      action: 'Write today',
    });
    expect(todayCard('started')).toEqual({
      text: 'You started a page today.',
      action: 'Keep writing',
    });
    expect(todayCard('saved')).toEqual({
      text: 'Saved today. Open it to add more.',
      action: 'Open today',
    });
  });
});
