/**
 * @jest-environment node
 */
// The background reader's dates (workers/inngest-jobs/context/reader.js): a
// record made after midnight and before their day ended belongs to the day
// before the clock's date, and its line says so.

import { lineBefore, readerRequest, readerToday, validDate } from '../context/reader.js';

const TZ = 'America/Los_Angeles';
const PERSON = { first_name: 'Alex', pronouns: null, identity: {} };
const record = (at, text) => ({ table: 'notes', id: at, at, text });

describe('the day a record belongs to', () => {
  it('is their day: before their day ends it is still the day before', () => {
    // 1:30am on Thursday 8 October where they are
    expect(readerToday(TZ, new Date('2026-10-08T08:30:00Z'), 3)).toBe('2026-10-07');
    expect(readerToday(TZ, new Date('2026-10-08T08:30:00Z'), 0)).toBe('2026-10-08');
    // 9pm on Wednesday
    expect(readerToday(TZ, new Date('2026-10-08T04:00:00Z'), 3)).toBe('2026-10-07');
  });

  it('says so on the record line after midnight, and only then', () => {
    const { user, recRef } = readerRequest({
      today: '2026-10-07',
      person: PERSON,
      chunk: [
        record('2026-10-08T04:00:00Z', 'Said in chat: "Dentist tomorrow"'),
        record('2026-10-08T08:30:00Z', 'Wrote a journal entry: "Nervous"'),
      ],
      openFacts: [],
      tz: TZ,
      dayEndHour: 3,
    });
    expect(user).toContain('r1 | 2026-10-07 21:00 (today) | Said in chat: "Dentist tomorrow"');
    expect(user).toContain(
      'r2 | 2026-10-08 01:30, after midnight, so still Wednesday 2026-10-07 for them (today) | Wrote a journal entry: "Nervous"',
    );
    expect(recRef.get('r2').id).toBe('2026-10-08T08:30:00Z');
  });

  it('is the clock date when the day end is not known', () => {
    const { user } = readerRequest({
      today: '2026-10-08',
      person: PERSON,
      chunk: [record('2026-10-08T08:30:00Z', 'Wrote a journal entry: "Nervous"')],
      openFacts: [],
      tz: TZ,
    });
    expect(user).toContain('r1 | 2026-10-08 01:30 (today) |');
  });
});

describe('a date the model gives', () => {
  it('is kept as a day, even with a time on it', () => {
    expect(validDate('2026-10-08')).toBe('2026-10-08');
    expect(validDate('2026-10-08T10:00')).toBe('2026-10-08');
    expect(validDate('2026-10-08T10:00:00Z')).toBe('2026-10-08');
    expect(validDate('next Friday')).toBeNull();
    expect(validDate(null)).toBeNull();
  });
});

describe('what Gremly had said before a chat message', () => {
  const rows = [
    { created_at: '2026-10-08T15:00:00Z', content: 'Morning. Two things on today.' },
    // the brief's last row on a morning with no offer of its own: no words, only the week's facts
    { created_at: '2026-10-08T15:00:02Z', content: '' },
    { created_at: '2026-10-08T18:00:00Z', content: 'Done. I moved it to Friday.' },
  ];

  it('is the last line with words, so a row without any does not hide it', () => {
    expect(lineBefore(rows, '2026-10-08T16:00:00Z').content).toBe('Morning. Two things on today.');
    expect(lineBefore(rows, '2026-10-08T19:00:00Z').content).toBe('Done. I moved it to Friday.');
  });

  it('is nothing when Gremly had not spoken yet', () => {
    expect(lineBefore(rows, '2026-10-08T14:00:00Z')).toBeNull();
    expect(lineBefore([], '2026-10-08T14:00:00Z')).toBeNull();
  });
});
