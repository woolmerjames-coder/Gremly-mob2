/**
 * A habit's pause or lighter version in the words its own screens show
 * (lib/habits/easeWords.ts). Wednesday 7 October 2026.
 */
import { EASE_COPY, easeLine, easeTag, easeToShow } from '../easeWords';

const TODAY = '2026-10-07';
const row = (
  mode: string,
  first: string,
  last: string,
  note: string | null = null,
  id = 'run',
) => ({
  id: `${mode}-${first}`,
  habit_id: id,
  mode,
  period_start: first,
  period_end: last,
  floor_note: note,
});

describe('what a habit shows when it is eased', () => {
  it('is the pause or lighter version it is under today, else the next to come', () => {
    const rows = [
      row('pause', '2026-10-12', '2026-10-18'),
      row('floor', '2026-10-05', '2026-10-11', 'Ten minute walk'),
      row('pause', '2026-09-20', '2026-09-27'),
      row('pause', '2026-10-01', '2026-10-30', null, 'swim'),
    ];
    expect(easeToShow(rows, 'run', TODAY)).toMatchObject({ mode: 'lighter', last: '2026-10-11' });
    expect(easeToShow(rows.slice(0, 1), 'run', TODAY)).toMatchObject({ mode: 'pause' });
    // one that is over is nothing, and so is another habit's
    expect(easeToShow(rows.slice(2), 'run', TODAY)).toBeNull();
    expect(easeToShow(null, 'run', TODAY)).toBeNull();
  });

  it('tags the list only for today', () => {
    expect(easeTag([row('pause', '2026-10-05', '2026-10-11')], 'run', TODAY)).toBe('Paused');
    // a lighter version is still one to check in on: the list says nothing of it
    expect(easeTag([row('floor', '2026-10-07', '2026-10-07')], 'run', TODAY)).toBeNull();
    expect(easeTag([row('pause', '2026-10-08', '2026-10-11')], 'run', TODAY)).toBeNull();
    expect(easeTag([], 'run', TODAY)).toBeNull();
  });

  it('says the days it runs, and what the lighter version is', () => {
    const line = (r: ReturnType<typeof row>) => easeLine(easeToShow([r], 'run', TODAY)!, TODAY);
    expect(line(row('pause', '2026-10-05', '2026-10-11'))).toBe('Paused until Sun 11 Oct');
    expect(line(row('pause', '2026-10-07', '2026-10-07'))).toBe('Paused today');
    expect(line(row('pause', '2026-10-12', '2026-10-18'))).toBe(
      'Paused from Mon 12 Oct to Sun 18 Oct',
    );
    expect(line(row('pause', '2026-10-09', '2026-10-09'))).toBe('Paused on Fri 9 Oct');
    expect(line(row('floor', '2026-10-05', '2026-10-11', 'Ten minute walk'))).toBe(
      'Lighter version until Sun 11 Oct: Ten minute walk',
    );
    expect(line(row('floor', '2026-10-05', '2026-10-11'))).toBe('Lighter version until Sun 11 Oct');
  });

  it('has no dashes', () => {
    const dash = /[–—]| - |--/;
    for (const text of Object.values(EASE_COPY)) expect(text).not.toMatch(dash);
  });
});
