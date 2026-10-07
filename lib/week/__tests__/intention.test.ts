/**
 * The week's intention, read from their notes (lib/week/intention.ts).
 */
import { intentionOn, intentionText } from '../intention';

const note = (id: string, target_date: string, over: Record<string, unknown> = {}) => ({
  id,
  journal_subtype: 'intention',
  target_date,
  body: `Intention ${id}`,
  ...over,
});

describe("the week's intention", () => {
  // set on Sunday 4 October for the week that starts Monday 5
  const notes = [
    note('last', '2026-09-28'),
    note('this', '2026-10-05'),
    note('next', '2026-10-12'),
    { id: 'j', journal_subtype: 'reflection', target_date: '2026-10-06', body: 'A day' },
  ];

  it('is the one whose week a day is in, on every day of that week', () => {
    for (const day of ['2026-10-05', '2026-10-08', '2026-10-11']) {
      expect(intentionOn(notes, day)).toEqual({ id: 'this', text: 'Intention this' });
    }
    expect(intentionOn(notes, '2026-10-04')?.id).toBe('last');
    expect(intentionOn(notes, '2026-10-12')?.id).toBe('next');
  });

  it('is none when they set none for that week, or took it away', () => {
    expect(intentionOn(notes, '2026-10-20')).toBeNull();
    expect(intentionOn([], '2026-10-08')).toBeNull();
    expect(intentionOn(null, '2026-10-08')).toBeNull();
    expect(intentionOn([note('gone', '2026-10-05', { archived: true })], '2026-10-08')).toBeNull();
    expect(
      intentionOn([note('empty', '2026-10-05', { body: '  ', title: '' })], '2026-10-08'),
    ).toBeNull();
  });

  it('is the later of two when their weekly day moved inside the week', () => {
    const moved = [note('first', '2026-10-05'), note('second', '2026-10-08T00:00:00')];
    expect(intentionOn(moved, '2026-10-09')?.id).toBe('second');
    expect(intentionOn(moved, '2026-10-07')?.id).toBe('first');
  });

  it('reads the words from the body, or the title when there is no body', () => {
    expect(intentionText({ body: ' Rest ', title: 'x' })).toBe('Rest');
    expect(intentionText({ body: null, title: 'One thing at a time' })).toBe('One thing at a time');
    expect(intentionText(null)).toBeNull();
  });
});
