import {
  busyBlocks,
  clock,
  habitsLine,
  isCancelledMeeting,
  meetingsLine,
  stripPercent,
  sweepLine,
  todosLine,
} from '../dayCard';
import { countdownChip, isReturnDay, readDco } from '../dco';

const MEETINGS = [
  { id: 'a', title: 'NA standup', start: 480, end: 510 },
  { id: 'b', title: 'Programmatic', start: 510, end: 555 },
  { id: 'c', title: 'Fee planning', start: 570, end: 600 },
  { id: 'd', title: 'Paid social', start: 600, end: 630 },
  { id: 'e', title: 'QBR prep', start: 660, end: 690 },
  { id: 'f', title: 'Media plan', start: 690, end: 720 },
  { id: 'g', title: '1:1', start: 720, end: 750 },
  { id: 'h', title: 'Paid search', start: 735, end: 795 },
];

describe('day card lines', () => {
  it('meetings before, during and after the day', () => {
    expect(meetingsLine(MEETINGS, 465)).toBe('8 today, first at 8:00');
    expect(meetingsLine(MEETINGS, 720)).toBe('2 left, clear from 1:15');
    expect(meetingsLine(MEETINGS, 900)).toBe('All done for today');
    expect(meetingsLine([], 600)).toBe('Nothing on the calendar');
  });

  it('merges overlapping meetings into busy blocks', () => {
    expect(busyBlocks(MEETINGS.slice(6))).toEqual([[720, 795]]);
    expect(
      busyBlocks([
        { start: 600, end: 630 },
        { start: 660, end: 690 },
      ]),
    ).toEqual([
      [600, 630],
      [660, 690],
    ]);
  });

  it('todos due today', () => {
    expect(todosLine([], [])).toBe('Nothing due today');
    expect(todosLine([{ id: 't', title: 'Buy Oat Milk' }], [])).toBe('1 due, Buy Oat Milk');
    expect(
      todosLine(
        [{ id: 't', title: 'Buy Oat Milk' }],
        [{ id: 't', title: 'x', start: 930, end: 950, kind: 'todo' }],
      ),
    ).toBe('1 due, Buy Oat Milk at 3:30');
    expect(
      todosLine(
        [
          { id: 't', title: 'a' },
          { id: 'u', title: 'b' },
        ],
        [{ id: 'u', title: 'b', start: 900, end: 920, kind: 'todo' }],
      ),
    ).toBe('2 due, 1 planned');
  });

  it('habits: behind is a warning, planned replaces it once locked', () => {
    expect(habitsLine(8, 1, 0)).toEqual({ text: '8 today, 1 behind this week', warn: true });
    expect(habitsLine(8, 0, 0)).toEqual({ text: '8 today, on track this week', warn: false });
    expect(habitsLine(8, 2, 3)).toEqual({ text: '8 today, 3 planned', warn: false });
  });

  it('sweep', () => {
    expect(sweepLine(7, 3)).toEqual({ text: '7 to sort, 3 past their dates', warn: true });
    expect(sweepLine(5, 1)).toEqual({ text: '5 to sort, 1 past its date', warn: true });
    expect(sweepLine(2, 0)).toEqual({ text: '2 to sort', warn: false });
    expect(sweepLine(0, 0)).toEqual({ text: 'All sorted', warn: false });
  });

  it('clock and strip', () => {
    expect(clock(795)).toBe('1:15');
    expect(clock(720)).toBe('12:00');
    expect(stripPercent(360)).toBe(0);
    expect(stripPercent(1320)).toBe(100);
    expect(stripPercent(840)).toBe(50);
  });
});

describe('countdown chip', () => {
  const anchors = [
    { label: 'James planned to send the deck on Friday.', date: '2026-10-02' },
    {
      label: 'James and Dave celebrate their anniversary.',
      short_label: 'Anniversary',
      date: '2026-10-13',
    },
    { label: 'Passed', short_label: 'Old', date: '2026-09-01' },
  ];

  it('shows the nearest anchor that has a short label', () => {
    expect(countdownChip(anchors, '2026-09-30')?.text).toBe('Anniversary in 13 days');
    expect(countdownChip(anchors, '2026-10-12')?.text).toBe('Anniversary tomorrow');
    expect(countdownChip(anchors, '2026-10-13')?.text).toBe('Anniversary today');
  });

  it('is left off when nothing ahead has a short label', () => {
    expect(countdownChip(anchors, '2026-10-14')).toBeNull();
    expect(countdownChip([], '2026-10-01')).toBeNull();
  });

  it('reads the DCO and knows a return day', () => {
    const d = readDco({
      date: '2026-10-01',
      named_anchors: anchors,
      brief: { headline: 'x', claims: [], return: { days_away: 7, note: 'Welcome back' } },
    });
    expect(d.anchors).toHaveLength(3);
    expect(isReturnDay(d.brief)).toBe(true);
    expect(isReturnDay(readDco({ brief: { return: null } }).brief)).toBe(false);
    expect(readDco(null).brief).toBeNull();
  });
});

describe('cancelled meetings', () => {
  const none = new Set<string>();
  it('leaves out a meeting whose title says it was cancelled', () => {
    expect(isCancelledMeeting('Canceled: iProspect Town Hall', ['x'], none)).toBe(true);
    expect(isCancelledMeeting('CANCELLED: Attribution touchbase', ['x'], none)).toBe(true);
    // only the "Canceled:" form calendars use; anything else is the DCO reader's call
    expect(isCancelledMeeting('Cancelled flights review', ['x'], none)).toBe(false);
    expect(isCancelledMeeting('Canceled - maybe', ['x'], none)).toBe(false);
    expect(isCancelledMeeting('Social connect', ['x'], none)).toBe(false);
    expect(isCancelledMeeting('Cancellation policy review', ['x'], none)).toBe(false);
  });
  it('leaves out a meeting the DCO named as cancelled', () => {
    expect(isCancelledMeeting('Social connect', ['ext-1', 'row-9'], new Set(['row-9']))).toBe(true);
  });
  it('reads the cancelled ids from the DCO', () => {
    expect(readDco({ cancelled_calendar_ids: ['a', 2, 'b'] }).cancelledCalendarIds).toEqual([
      'a',
      'b',
    ]);
    expect(readDco(null).cancelledCalendarIds).toEqual([]);
  });
});

describe('what is locked in for a day', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { plannedForDay } = require('../useDayCard');
  const at = (hour: number) => new Date(2026, 9, 7, hour, 0, 0).toISOString();
  const habits = [
    { id: 'run', name: 'Run', scheduled_start_iso: at(7), time_estimate_minutes: 30 },
    { id: 'read', name: 'Read', scheduled_start_iso: at(21) },
  ] as any;

  it('leaves out a habit paused on the day, whatever time it was given before the pause', () => {
    const ids = (eases?: any[]) =>
      plannedForDay([], habits, '2026-10-07', eases).map((p: { id: string }) => p.id);
    expect(ids()).toEqual(['run', 'read']);
    const paused = [
      { habit_id: 'run', mode: 'pause', period_start: '2026-10-05', period_end: '2026-10-11' },
      // a lighter version is still on
      { habit_id: 'read', mode: 'floor', period_start: '2026-10-05', period_end: '2026-10-11' },
    ];
    expect(ids(paused)).toEqual(['read']);
    // a pause that is over holds nothing
    expect(ids([{ ...paused[0], period_end: '2026-10-06' }])).toEqual(['run', 'read']);
  });

  it('never has a habit they are breaking on the day, whatever time it was given', () => {
    const withBreaking = [
      ...habits,
      { id: 'sugar', name: 'No sugar', subtype: 'break_habit', scheduled_start_iso: at(9) },
    ] as any;
    expect(
      plannedForDay([], withBreaking, '2026-10-07').map((p: { id: string }) => p.id),
    ).toEqual(['run', 'read']);
  });
});
