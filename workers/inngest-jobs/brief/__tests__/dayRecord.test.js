/**
 * The day record, worker side: the same rules as lib/brief/dayRecord.ts, so
 * the brief, the notification and the day card say the same thing.
 */
import { buildDayRecord, blocksOf } from '../dayRecord';
import { dayRecordLines } from '../writer';
import { frameIsStale } from '../frameRefresh';
import { coversToday, validateFrame, minutesOf } from '../../context/dayFrame';

jest.mock('../../context/daily', () => ({ buildDcoV4: jest.fn(), writeDco: jest.fn() }));

const today = '2026-10-02';
const meetings = [
  { id: 'huddle', title: 'Team huddle', start: 480, end: 510 },
  { id: 'timesheets', title: 'Timesheets', start: 960, end: 990 },
];
const anchors = [
  { label: 'Flight home', short_label: 'Flight to San Francisco', date: '2026-10-04' },
];
const frame = (over = {}) => ({
  date: today,
  travel: { label: 'Flying to San Diego', departs: null },
  away: null,
  blocks: [],
  travel_calendar_ids: [],
  ...over,
});

describe('the day record (worker)', () => {
  it('2 October: flying today, setting off at 12:30, timesheets after it', () => {
    const day = buildDayRecord({
      today,
      frame: frame({
        blocks: [{ id: 'f', title: 'Leave for the airport', start: 750, end: null, travel: true }],
      }),
      meetings,
      anchors,
    });
    expect(day.chip.text).toBe('Flying to San Diego today');
    expect(day.planEnd).toBe(750);
    expect(day.duringTravel.map((m) => m.title)).toEqual(['Timesheets']);
    const lines = dayRecordLines({ day }, (id) => (id === 'timesheets' ? 'c2' : null));
    expect(lines).toEqual([
      'TRAVEL TODAY: Flying to San Diego today; they set off at 12:30pm, and nothing is planned after that.',
      'SET TIMES TODAY (planned around like meetings): 12:30pm Leave for the airport.',
      'MEETINGS AFTER THEY SET OFF (ref | time | title): c2 | 4pm | Timesheets.',
    ]);
  });

  it('with no time to set off, the brief is told not to guess one', () => {
    const day = buildDayRecord({ today, frame: frame(), meetings, anchors });
    expect(day.planEnd).toBe(1320);
    expect(dayRecordLines({ day })[0]).toBe(
      'TRAVEL TODAY: Flying to San Diego today; the time they set off is not known.',
    );
  });

  it('a set time from the thread is kept, and one taken off is gone', () => {
    const blocks = blocksOf(
      frame({ blocks: [{ id: 'mem', title: 'Pick up Bella', start: 900, end: null }] }),
      {
        fixed_blocks: [{ id: 'chat', title: 'Leave for the airport', start: 750, travel: true }],
        fixed_removed: ['mem'],
      },
    );
    expect(blocks.map((b) => [b.id, b.source])).toEqual([['chat', 'chat']]);
  });

  it('no frame: the nearest date ahead, as before', () => {
    const day = buildDayRecord({ today, frame: null, meetings, anchors });
    expect(day.chip.text).toBe('Flight to San Francisco in 2 days');
    expect(dayRecordLines({ day })).toEqual([]);
  });
});

describe('the day frame', () => {
  const refs = new Map([
    ['c1', { type: 'calendar', id: 'huddle', title: 'Team huddle', start: 480, end: 510 }],
    ['c2', { type: 'calendar', id: 'flight', title: 'AS 1234', start: 870, end: 960 }],
    [
      'f1',
      { type: 'fact', id: 'trip', statement: 'Anniversary trip to San Diego from 2 to 4 October' },
    ],
    ['f2', { type: 'fact', id: 'leave', statement: 'Leave for the airport at 12:30 on 2 October' }],
  ]);

  it('keeps what the inputs support', () => {
    const f = validateFrame(
      {
        travel: [{ refs: ['f1', 'f2'], label: 'Flying to San Diego', departs: null }],
        away: [],
        blocks: [
          { ref: 'f2', title: 'Leave for the airport', start: '12:30', end: null, travel: true },
          // a calendar entry is not a block, and a made-up time is dropped
          { ref: 'c1', title: 'Team huddle', start: '08:00', end: null, travel: false },
          { ref: 'f1', title: 'Trip', start: 'afternoon', end: null, travel: true },
          { ref: 'f9', title: 'Nothing', start: '10:00', end: null, travel: false },
        ],
        travel_calendar_refs: ['c2', 'c9'],
      },
      refs,
      today,
    );
    expect(f.travel).toMatchObject({ label: 'Flying to San Diego', departs: 750 });
    expect(f.blocks.map((b) => [b.title, b.start, b.travel])).toEqual([
      ['Leave for the airport', 750, true],
    ]);
    expect(f.travel_calendar_ids).toEqual(['flight']);
    expect(f.fact_ids.sort()).toEqual(['leave', 'trip']);
  });

  it('never puts a sentence on the chip, and needs a ref behind travel', () => {
    const long = validateFrame(
      {
        travel: [
          {
            refs: ['f1'],
            label: 'They are flying down to San Diego this afternoon for the trip.',
            departs: null,
          },
        ],
        away: [],
        blocks: [],
        travel_calendar_refs: [],
      },
      refs,
      today,
    );
    expect(long.travel).toBeNull();
    const unsupported = validateFrame(
      {
        travel: [{ refs: ['f9'], label: 'Flying', departs: '12:00' }],
        away: [],
        blocks: [],
        travel_calendar_refs: [],
      },
      refs,
      today,
    );
    expect(unsupported.travel).toBeNull();
  });

  it('a trip under way when there is no travel today', () => {
    const f = validateFrame(
      {
        travel: [],
        away: [{ refs: ['f1'], label: 'San Diego trip', through: '2026-10-04' }],
        blocks: [],
        travel_calendar_refs: [],
      },
      refs,
      '2026-10-03',
    );
    expect(f.away).toEqual({ label: 'San Diego trip', through: '2026-10-04', fact_ids: ['trip'] });
  });

  it('reads times and dates plainly', () => {
    expect(minutesOf('12:30')).toBe(750);
    expect(minutesOf('7:05')).toBe(425);
    expect(minutesOf('25:00')).toBeNull();
    expect(coversToday({ about_date: '2026-10-01', about_date_end: '2026-10-04' }, today)).toBe(
      true,
    );
    expect(coversToday({ about_date: '2026-10-04' }, today)).toBe(false);
  });

  it('is read again when a fact about today is new or changed', () => {
    const built = { built_at: '2026-10-02T13:00:00Z', input_fact_ids: ['trip'] };
    const trip = { id: 'trip', updated_at: '2026-10-02T06:00:00Z' };
    expect(frameIsStale(built, [trip])).toBe(false);
    // "leave for the airport at 12:30" reached the ledger at 9am
    expect(frameIsStale(built, [trip, { id: 'leave', created_at: '2026-10-02T16:04:00Z' }])).toBe(
      true,
    );
    expect(frameIsStale(built, [{ ...trip, updated_at: '2026-10-02T15:00:00Z' }])).toBe(true);
    expect(frameIsStale(undefined, [])).toBe(true);
  });
});
