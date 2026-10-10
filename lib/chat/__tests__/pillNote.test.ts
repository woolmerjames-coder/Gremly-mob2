/**
 * A note saved from the Save items pill: an event keeps its kind and its day,
 * as Mind Drop saves one, and every other note its own subtype.
 */
import { pillNoteColumns, pillNoteSubtype } from '../pillNote';

jest.mock('../../date/DateService', () => ({ nowTimestamp: () => '2026-10-07T23:54:12.000Z' }));

describe('a note from the pill', () => {
  it('saves an event as an event on its day, with how sure the day is', () => {
    expect(
      pillNoteColumns({ type: 'event', resolved_date: '2026-10-09', date_confidence: 'exact' }),
    ).toEqual({
      subtype: 'event',
      target_date: '2026-10-09',
      date_confidence: 'exact',
      captured_at: '2026-10-07T23:54:12.000Z',
    });
    expect(
      pillNoteColumns({
        type: 'event',
        resolved_date: '2026-10-20',
        date_confidence: 'approximate',
      }),
    ).toMatchObject({
      subtype: 'event',
      target_date: '2026-10-20',
      date_confidence: 'approximate',
    });
  });

  it('keeps an event with no timing an event, with no day', () => {
    expect(
      pillNoteColumns({ type: 'event', resolved_date: null, date_confidence: 'unknown' }),
    ).toEqual({ subtype: 'event', target_date: null });
    expect(pillNoteColumns({ type: 'event', resolved_date: 'Friday' })).toEqual({
      subtype: 'event',
      target_date: null,
    });
  });

  it('saves every other note with its own subtype, general when it has none', () => {
    expect(pillNoteColumns({ type: 'note', subtype: 'idea' })).toEqual({ subtype: 'idea' });
    expect(pillNoteColumns({ type: 'note' })).toEqual({ subtype: 'general' });
    expect(pillNoteSubtype({ type: 'event' })).toBe('event');
  });
});
