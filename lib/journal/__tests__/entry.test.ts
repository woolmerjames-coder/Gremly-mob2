/**
 * Looking journal entries up (lib/journal/entry): the day each belongs to,
 * a day's entries, the days with one, and the day's page.
 */
import { getDateService } from '../../date/DateService';
import {
  checkInOf,
  daysWithEntries,
  entriesOn,
  entryDay,
  isJournal,
  journalEntries,
  neighbours,
  pageEntryFor,
  type JournalEntry,
} from '../entry';
import { countLabel, dayWords } from '../words';

const entry = (id: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  subtype: 'journal',
  created_at: '2026-09-30T19:00:00Z',
  ...extra,
});
const page = (id: string, day: string, extra: Partial<JournalEntry> = {}) =>
  entry(id, { views: { sweep_reflection: true, sweep_date: day }, ...extra });

describe('the day an entry belongs to', () => {
  it('is the day a wrap up or page entry says, whenever it was saved', () => {
    // written at one in the morning, for the day before
    const late = page('a', '2026-09-29', { created_at: '2026-09-30T08:10:00Z' });
    expect(entryDay(late)).toBe('2026-09-29');
  });

  it('is the day it is about, when it has one', () => {
    expect(entryDay(entry('a', { date: '2026-09-12' }))).toBe('2026-09-12');
  });

  it('is otherwise the person’s day it was written on', () => {
    const at = '2026-09-30T19:00:00Z';
    expect(entryDay(entry('a', { created_at: at }))).toBe(getDateService().dayOf(at));
  });

  it('ignores a mark that is not a day', () => {
    const odd = entry('a', { date: '2026-09-12', views: { sweep_date: 'tonight' } });
    expect(entryDay(odd)).toBe('2026-09-12');
  });
});

describe('the journal', () => {
  const notes = [
    page('wed', '2026-09-30', { created_at: '2026-10-01T04:00:00Z' }),
    entry('drop', { date: '2026-09-30', created_at: '2026-09-30T19:30:00Z' }),
    page('tue', '2026-09-29', { created_at: '2026-09-30T03:00:00Z' }),
    entry('idea', { subtype: 'idea', date: '2026-09-30' }),
    page('gone', '2026-09-28', { archived: true }),
    entry('old', { date: '2026-08-14' }),
  ];

  it('is only journal entries still in it', () => {
    expect(isJournal({ subtype: 'journal' })).toBe(true);
    expect(isJournal({ subtype: 'journal', archived: true })).toBe(false);
    expect(isJournal({ subtype: 'idea' })).toBe(false);
  });

  it('lists the newest day first, and a day in the order written', () => {
    expect(journalEntries(notes).map((n) => n.id)).toEqual(['drop', 'wed', 'tue', 'old']);
  });

  it('gives a day its entries', () => {
    expect(entriesOn(notes, '2026-09-30').map((n) => n.id)).toEqual(['drop', 'wed']);
    expect(entriesOn(notes, '2026-09-27')).toEqual([]);
  });

  it('knows the days that have an entry', () => {
    expect([...daysWithEntries(notes)].sort()).toEqual(['2026-08-14', '2026-09-29', '2026-09-30']);
  });

  it('takes the wrap up or page entry as the day’s page, never a drop', () => {
    expect(pageEntryFor(notes, '2026-09-30')?.id).toBe('wed');
    expect(pageEntryFor(notes, '2026-08-14')).toBeNull();
    expect(pageEntryFor(notes, '2026-09-28')).toBeNull();
  });

  it('steps to the entry before and the entry after', () => {
    expect(neighbours(notes, 'tue')).toMatchObject({
      before: { id: 'old' },
      after: { id: 'drop' },
    });
    expect(neighbours(notes, 'drop')).toMatchObject({
      before: { id: 'tue' },
      after: { id: 'wed' },
    });
    expect(neighbours(notes, 'wed')).toMatchObject({ before: { id: 'drop' }, after: null });
    expect(neighbours(notes, 'old').before).toBeNull();
    expect(neighbours(notes, 'nope')).toEqual({ before: null, after: null });
  });
});

describe('a goal check in', () => {
  it('keeps its goal', () => {
    const checkIn = entry('a', {
      views: { goal_checkin: { goal_id: 'g1', goal_name: 'Run a 10k' } },
    });
    expect(checkInOf(checkIn)).toEqual({ goal_id: 'g1', goal_name: 'Run a 10k' });
    expect(checkInOf(entry('b'))).toBeNull();
    expect(checkInOf(entry('c', { views: { goal_checkin: { goal_id: 4 } } }))).toBeNull();
  });
});

describe('how a day reads', () => {
  it('names the weekday and the date', () => {
    expect(dayWords('2026-09-30')).toEqual({
      weekday: 'Wednesday',
      long: '30 September',
      short: 'Wed 30 Sep',
      month: 'September 2026',
    });
  });

  it('hands back what it was given when that is not a day', () => {
    expect(dayWords('soon').weekday).toBe('soon');
  });

  it('counts words and photos', () => {
    expect(countLabel(0)).toBe('0 words');
    expect(countLabel(1)).toBe('1 word');
    expect(countLabel(16, 1)).toBe('16 words, 1 photo');
    expect(countLabel(61, 2)).toBe('61 words, 2 photos');
  });
});
