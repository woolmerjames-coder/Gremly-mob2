import {
  BUFFER_MINUTES,
  fitSlots,
  freeMinutes,
  roomLeft,
  type Busy,
  type FitItem,
} from '../slotFitter';

const MEETINGS: Busy[] = [
  { start: 480, end: 510 },
  { start: 510, end: 555 },
  { start: 720, end: 795 },
  { start: 900, end: 930 },
];

function overlapsWithBuffer(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end + BUFFER_MINUTES && a.end > b.start - BUFFER_MINUTES;
}

describe('the slot fitter', () => {
  it('places items in the first gap that clears meetings by the buffer', () => {
    const r = fitSlots(
      [
        { id: 'run', minutes: 45, window: [720, 1320] },
        { id: 'oat', minutes: 15, window: [720, 1320] },
      ],
      MEETINGS,
      465,
    );
    expect(r.placed).toEqual([
      { id: 'run', start: 810, end: 855 },
      { id: 'oat', start: 870, end: 885 },
    ]);
    expect(r.unplaced).toEqual([]);
  });

  it('never starts before now and keeps to 5-minute steps', () => {
    const r = fitSlots([{ id: 'a', minutes: 20, window: [480, 1320] }], [], 603);
    expect(r.placed[0].start).toBe(605);
    expect(r.placed[0].start % 5).toBe(0);
  });

  it('keeps each item inside its window, and says what did not fit', () => {
    const r = fitSlots(
      [
        { id: 'evening', minutes: 30, window: [1080, 1320] },
        { id: 'tight', minutes: 60, window: [720, 800] },
      ],
      MEETINGS,
      465,
    );
    expect(r.placed).toEqual([{ id: 'evening', start: 1080, end: 1110 }]);
    expect(r.unplaced).toEqual(['tight']);
  });

  it('stops at 10pm', () => {
    const r = fitSlots([{ id: 'late', minutes: 60, window: [1290, 1400] }], [], 1290);
    expect(r.unplaced).toEqual(['late']);
  });

  it('never overlaps a meeting or another item, for any order of a busy day', () => {
    const items: FitItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `i${i}`,
      minutes: 15 + ((i * 7) % 50),
      window: [480 + ((i * 37) % 300), 1320],
    }));
    for (let shift = 0; shift < items.length; shift++) {
      const order = [...items.slice(shift), ...items.slice(0, shift)];
      const { placed } = fitSlots(order, MEETINGS, 470);
      for (const p of placed) {
        const item = items.find((x) => x.id === p.id)!;
        expect(p.start).toBeGreaterThanOrEqual(Math.max(item.window[0], 470));
        expect(p.end).toBeLessThanOrEqual(Math.min(item.window[1], 1320));
        expect(p.end - p.start).toBe(item.minutes);
        for (const m of MEETINGS) expect(overlapsWithBuffer(p, m)).toBe(false);
        for (const q of placed) if (q !== p) expect(overlapsWithBuffer(p, q)).toBe(false);
      }
    }
  });

  it('gives the same plan for the same input', () => {
    const items: FitItem[] = [
      { id: 'a', minutes: 30, window: [600, 1320] },
      { id: 'b', minutes: 45, window: [600, 1320] },
    ];
    expect(fitSlots(items, MEETINGS, 600)).toEqual(fitSlots(items, MEETINGS, 600));
  });

  it('places an item once even if it is listed twice', () => {
    const r = fitSlots(
      [
        { id: 'a', minutes: 30, window: [600, 1320] },
        { id: 'a', minutes: 30, window: [600, 1320] },
      ],
      [],
      600,
    );
    expect(r.placed).toHaveLength(1);
  });

  it('counts the room left for more, with the gaps it would keep', () => {
    // noon to 10pm with one meeting, from 12 to 1:15: the 15 minutes after it are its gap
    const lunch: Busy[] = [{ start: 720, end: 795 }];
    expect(roomLeft(lunch, [], 720, 1320)).toBe(600 - 75 - 15);
    // one thing placed at 1:30 for 45 minutes takes its own time and the gap after it
    // (the gap before it is the meeting's)
    expect(roomLeft(lunch, [{ id: 'x', start: 810, end: 855 }], 720, 1320)).toBe(
      600 - 75 - 15 - 45 - 15,
    );
    // with no gap kept, it is the plain free time
    expect(roomLeft(lunch, [{ id: 'x', start: 795, end: 840 }], 720, 1320, 0)).toBe(
      freeMinutes(lunch, [{ id: 'x', start: 795, end: 840 }], 720, 1320),
    );
    // a meeting later in the day keeps a gap either side of it
    expect(roomLeft(MEETINGS, [], 720, 1320)).toBe(600 - 75 - 15 - 15 - 30 - 15);
    // after the fitter has placed something, the room it reports is what it could still use
    const fit = fitSlots([{ id: 'a', minutes: 60, window: [720, 900] }], lunch, 720, 900);
    expect(fit.placed).toEqual([{ id: 'a', start: 810, end: 870 }]);
    expect(roomLeft(lunch, fit.placed, 720, 900)).toBe(15);
  });

  it('counts the free time left', () => {
    expect(freeMinutes(MEETINGS, [{ id: 'x', start: 810, end: 855 }], 720, 1320)).toBe(
      600 - 75 - 30 - 45,
    );
  });
});
