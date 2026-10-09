/**
 * One picture of the day: travel, set times, where planning stops and the
 * day card's chip. The worker builds the same record
 * (workers/inngest-jobs/brief/__tests__/dayRecord.test.js).
 */
import { buildDayRecord, blocksOf } from '../dayRecord';
import type { DcoAnchor, DcoDayFrame } from '../dco';

const today = '2026-10-02';
const meetings = [
  { id: 'huddle', title: 'Team huddle', start: 480, end: 510 },
  { id: 'timesheets', title: 'Timesheets', start: 960, end: 990 },
];
const anchors: DcoAnchor[] = [
  { label: 'Flight home', short_label: 'Flight to San Francisco', date: '2026-10-04' },
  { label: 'Jungle', short_label: 'Jungle at Greek Theatre', date: '2026-10-07' },
];
const frame = (over: Partial<DcoDayFrame> = {}): DcoDayFrame => ({
  date: today,
  travel: { label: 'Flying to San Diego', departs: null },
  away: null,
  blocks: [],
  travel_calendar_ids: [],
  ...over,
});

describe('the day record', () => {
  it('2 October: flying today wins the chip over a flight two days out', () => {
    const r = buildDayRecord({ today, frame: frame(), meetings, anchors });
    expect(r.chip).toEqual({ text: 'Flying to San Diego today', kind: 'travel' });
    // no time to set off yet: planning runs as usual
    expect(r.travel).toEqual({ label: 'Flying to San Diego', departs: null });
    expect(r.planEnd).toBe(22 * 60);
    expect(r.duringTravel).toEqual([]);
  });

  it('a time to leave said in the thread ends the plan there and flags the meeting after it', () => {
    const r = buildDayRecord({
      today,
      frame: frame(),
      threadMeta: {
        fixed_blocks: [{ id: 'airport', title: 'Leave for the airport', start: 750, travel: true }],
      },
      meetings,
      anchors,
    });
    expect(r.planEnd).toBe(750);
    expect(r.travel?.departs).toBe(750);
    expect(r.duringTravel).toEqual([{ id: 'timesheets', title: 'Timesheets', start: 960 }]);
    expect(r.blocks.map((b) => [b.title, b.source])).toEqual([['Leave for the airport', 'chat']]);
    expect(r.busy).toContainEqual({ start: 750, end: 780 });
  });

  it('the thread’s set-off time wins over the one read from memory', () => {
    const r = buildDayRecord({
      today,
      frame: frame({
        travel: { label: 'Flying to San Diego', departs: 840 },
        blocks: [
          { id: 'mem', title: 'Leave for the airport', start: 840, end: null, travel: true },
        ],
      }),
      threadMeta: {
        fixed_blocks: [{ id: 'airport', title: 'Leave for the airport', start: 750, travel: true }],
      },
      meetings,
      anchors,
    });
    expect(r.planEnd).toBe(750);
  });

  it('a set time taken off in the thread is gone', () => {
    const blocks = blocksOf(
      frame({
        blocks: [{ id: 'mem', title: 'Pick up Pepper', start: 900, end: null, travel: false }],
      }),
      { fixed_removed: ['mem'] },
    );
    expect(blocks).toEqual([]);
  });

  it('a frame from another day is not today’s', () => {
    const r = buildDayRecord({
      today,
      frame: { ...frame(), date: '2026-10-01' },
      meetings,
      anchors,
    });
    expect(r.travel).toBeNull();
    expect(r.chip?.text).toBe('Flight to San Francisco in 2 days');
  });

  it('without travel: a date today, then a trip under way, then the nearest ahead', () => {
    const r1 = buildDayRecord({
      today,
      frame: null,
      meetings,
      anchors: [...anchors, { label: 'Launch', short_label: 'Launch day', date: today }],
    });
    expect(r1.chip?.text).toBe('Launch day today');
    const r2 = buildDayRecord({
      today: '2026-10-03',
      frame: null,
      meetings,
      anchors: [
        { label: 'Trip', short_label: 'Anniversary trip', date: today, date_end: '2026-10-04' },
        ...anchors,
      ],
    });
    expect(r2.chip?.text).toBe('Anniversary trip until Sunday');
    const r3 = buildDayRecord({ today, frame: null, meetings, anchors });
    expect(r3.chip?.text).toBe('Flight to San Francisco in 2 days');
  });

  it('a travel entry on the calendar sets the time they set off', () => {
    const r = buildDayRecord({
      today,
      frame: frame({ travel_calendar_ids: ['flight'] }),
      meetings: [...meetings, { id: 'flight', title: 'AS 1234', start: 870, end: 960 }],
      anchors,
    });
    expect(r.planEnd).toBe(870);
    // the flight itself is not "during travel"; timesheets is
    expect(r.duringTravel.map((m) => m.id)).toEqual(['timesheets']);
  });
});
