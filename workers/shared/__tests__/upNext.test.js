/**
 * @jest-environment node
 *
 * Up next (shared/upNext.js, data fabric stage 4b): the open Chapter with the
 * nearest date, worked out in code.
 */
import { nextDateOf, upNext, upNextWords, upNextSelect } from '../upNext.js';

const TODAY = '2026-10-07';
const ch = (id, over) => ({
  id,
  title: `Chapter ${id}`,
  phase: 'active',
  start_date: null,
  end_date: null,
  closed_at: null,
  primary_world_id: null,
  ...over,
});

describe('a Chapter’s next date', () => {
  it('is the day it starts while that is today or ahead', () => {
    expect(
      nextDateOf(ch('a', { start_date: '2026-10-20', end_date: '2026-10-25' }), TODAY),
    ).toEqual({
      date: '2026-10-20',
      which: 'starts',
    });
    expect(nextDateOf(ch('a', { start_date: TODAY }), TODAY)).toEqual({
      date: TODAY,
      which: 'starts',
    });
  });

  it('is the day it ends once it has started', () => {
    expect(
      nextDateOf(ch('a', { start_date: '2026-10-01', end_date: '2026-10-09' }), TODAY),
    ).toEqual({
      date: '2026-10-09',
      which: 'ends',
    });
  });

  it('is none when both have passed or there are no dates', () => {
    expect(
      nextDateOf(ch('a', { start_date: '2026-09-01', end_date: '2026-09-09' }), TODAY),
    ).toBeNull();
    expect(nextDateOf(ch('a', {}), TODAY)).toBeNull();
    expect(nextDateOf(ch('a', { start_date: 'soon' }), TODAY)).toBeNull();
  });
});

describe('Up next', () => {
  it('is the open Chapter with the nearest date', () => {
    const u = upNext(
      [
        ch('far', { phase: 'upcoming', start_date: '2026-11-01' }),
        ch('near', { start_date: '2026-09-20', end_date: '2026-10-12', world: { name: 'School' } }),
        ch('none', {}),
      ],
      TODAY,
    );
    expect(u).toMatchObject({
      chapter_id: 'near',
      date: '2026-10-12',
      which: 'ends',
      days_until: 5,
      world: 'School',
    });
  });

  it('leaves out closed and suggested Chapters', () => {
    expect(
      upNext(
        [
          ch('closed', { phase: 'closed', start_date: '2026-10-08' }),
          ch('suggested', { phase: 'suggested', start_date: '2026-10-08' }),
          ch('closing', { start_date: '2026-10-08', closed_at: '2026-10-06T10:00:00Z' }),
        ],
        TODAY,
      ),
    ).toBeNull();
  });

  it('on the same day, puts one starting before one ending, then the lower id', () => {
    const both = [
      ch('b-ends', { start_date: '2026-10-01', end_date: '2026-10-10' }),
      ch('a-starts', { phase: 'upcoming', start_date: '2026-10-10' }),
    ];
    expect(upNext(both, TODAY).chapter_id).toBe('a-starts');
    expect(upNext(both.reverse(), TODAY).chapter_id).toBe('a-starts');
    const twins = [
      ch('z', { phase: 'upcoming', start_date: '2026-10-10' }),
      ch('m', { phase: 'upcoming', start_date: '2026-10-10' }),
    ];
    expect(upNext(twins, TODAY).chapter_id).toBe('m');
  });

  it('is none for no Chapters', () => {
    expect(upNext([], TODAY)).toBeNull();
    expect(upNext(null, TODAY)).toBeNull();
  });
});

describe('Up next in words', () => {
  it('says when with the weekday and the date, and today and tomorrow plainly', () => {
    const base = {
      title: 'Lisbon at half term',
      date: '2026-10-23',
      which: 'starts',
      days_until: 16,
    };
    expect(upNextWords(base)).toBe('"Lisbon at half term" starts on Friday 2026-10-23');
    expect(upNextWords({ ...base, world: 'Travel' })).toBe(
      '"Lisbon at half term", in their World Travel, starts on Friday 2026-10-23',
    );
    expect(upNextWords({ ...base, date: '2026-10-08', days_until: 1, which: 'ends' })).toBe(
      '"Lisbon at half term" ends tomorrow 2026-10-08',
    );
    expect(upNextWords({ ...base, date: TODAY, days_until: 0 })).toBe(
      '"Lisbon at half term" starts today 2026-10-07',
    );
  });

  it('is empty without a title or a date', () => {
    expect(upNextWords(null)).toBe('');
    expect(upNextWords({ date: '2026-10-08' })).toBe('');
  });

  it('reads only the person’s open Chapters', () => {
    const q = upNextSelect('u-1');
    expect(q).toMatch(
      /^chapters\?owner_id=eq\.u-1&phase=in\.\(upcoming,active\)&closed_at=is\.null/,
    );
  });
});
