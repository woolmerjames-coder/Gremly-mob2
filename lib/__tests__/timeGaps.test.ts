import { computeTimeGaps, buildTimeline, getBlockBoundaryIso, type TimeGap } from '../timeGaps';
import type { CalendarEvent } from '../calendar/CalendarClient';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Shorthand factory for a CalendarEvent */
function mkEvent(
  startAt: string,
  endAt: string,
  overrides?: Partial<CalendarEvent>,
): CalendarEvent {
  return {
    id: `e-${startAt}`,
    provider: 'google',
    providerEventId: `pe-${startAt}`,
    title: 'Meeting',
    startAt,
    endAt,
    isAllDay: false,
    location: null,
    ...overrides,
  };
}

// Block: 9 AM – 5 PM on 2026-01-15
const BLOCK_START = '2026-01-15T09:00:00.000Z';
const BLOCK_END = '2026-01-15T17:00:00.000Z';

// ═══════════════════════════════════════════════════════════════════════════════
// computeTimeGaps
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeTimeGaps', () => {
  it('returns a single full gap when no events', () => {
    const gaps = computeTimeGaps([], BLOCK_START, BLOCK_END);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].startIso).toBe(BLOCK_START);
    expect(gaps[0].endIso).toBe(BLOCK_END);
    expect(gaps[0].durationMinutes).toBe(480); // 8 hrs
    expect(gaps[0].label).toBe('8 hr free');
  });

  it('computes two gaps around a single event', () => {
    const events = [mkEvent('2026-01-15T11:00:00.000Z', '2026-01-15T12:00:00.000Z')];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);

    expect(gaps).toHaveLength(2);
    // 09:00–11:00 (120 min)
    expect(gaps[0].durationMinutes).toBe(120);
    expect(gaps[0].label).toBe('2 hr free');
    // 12:00–17:00 (300 min)
    expect(gaps[1].durationMinutes).toBe(300);
    expect(gaps[1].label).toBe('5 hr free');
  });

  it('filters out all-day events', () => {
    const events = [
      mkEvent('2026-01-15T00:00:00.000Z', '2026-01-16T00:00:00.000Z', {
        isAllDay: true,
      }),
    ];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationMinutes).toBe(480); // entire block free
  });

  it('handles overlapping events without double-counting', () => {
    const events = [
      mkEvent('2026-01-15T10:00:00.000Z', '2026-01-15T12:00:00.000Z'),
      mkEvent('2026-01-15T11:00:00.000Z', '2026-01-15T13:00:00.000Z'),
    ];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);

    // 09:00–10:00 = 60 min, 13:00–17:00 = 240 min
    expect(gaps).toHaveLength(2);
    expect(gaps[0].durationMinutes).toBe(60);
    expect(gaps[1].durationMinutes).toBe(240);
  });

  it('clamps events that exceed block boundaries', () => {
    const events = [
      mkEvent('2026-01-15T07:00:00.000Z', '2026-01-15T10:00:00.000Z'), // starts before
      mkEvent('2026-01-15T16:00:00.000Z', '2026-01-15T19:00:00.000Z'), // ends after
    ];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);

    // 10:00–16:00 = 360 min
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationMinutes).toBe(360);
    expect(gaps[0].label).toBe('6 hr free');
  });

  it('excludes gaps shorter than 10 minutes', () => {
    const events = [mkEvent('2026-01-15T09:05:00.000Z', '2026-01-15T17:00:00.000Z')];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);
    // 5 min gap at start should be excluded
    expect(gaps).toHaveLength(0);
  });

  it('returns empty for inverted block boundaries', () => {
    const gaps = computeTimeGaps([], BLOCK_END, BLOCK_START);
    expect(gaps).toEqual([]);
  });

  it('formats sub-hour durations correctly', () => {
    const events = [mkEvent('2026-01-15T09:45:00.000Z', '2026-01-15T17:00:00.000Z')];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);
    expect(gaps[0].label).toBe('45 min free');
  });

  it('formats mixed hour+minute durations correctly', () => {
    const events = [mkEvent('2026-01-15T10:30:00.000Z', '2026-01-15T17:00:00.000Z')];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);
    expect(gaps[0].durationMinutes).toBe(90);
    expect(gaps[0].label).toBe('1 hr 30 min free');
  });

  it('handles back-to-back events with no gap', () => {
    const events = [
      mkEvent('2026-01-15T09:00:00.000Z', '2026-01-15T12:00:00.000Z'),
      mkEvent('2026-01-15T12:00:00.000Z', '2026-01-15T17:00:00.000Z'),
    ];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);
    expect(gaps).toHaveLength(0);
  });

  it('sorts unsorted events correctly', () => {
    // Pass events in reverse order
    const events = [
      mkEvent('2026-01-15T14:00:00.000Z', '2026-01-15T15:00:00.000Z'),
      mkEvent('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z'),
    ];
    const gaps = computeTimeGaps(events, BLOCK_START, BLOCK_END);

    expect(gaps).toHaveLength(3);
    expect(gaps[0].durationMinutes).toBe(60); // 09–10
    expect(gaps[1].durationMinutes).toBe(180); // 11–14
    expect(gaps[2].durationMinutes).toBe(120); // 15–17
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildTimeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildTimeline', () => {
  it('returns empty for inverted block boundaries', () => {
    expect(buildTimeline([], [], BLOCK_END, BLOCK_START)).toEqual([]);
  });

  it('returns a single gap for empty inputs', () => {
    const timeline = buildTimeline([], [], BLOCK_START, BLOCK_END);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].kind).toBe('gap');
    expect(timeline[0].durationMinutes).toBe(480);
  });

  it('interleaves events and gaps', () => {
    const events = [mkEvent('2026-01-15T11:00:00.000Z', '2026-01-15T12:00:00.000Z')];
    const timeline = buildTimeline(events, [], BLOCK_START, BLOCK_END);

    expect(timeline.map((e) => e.kind)).toEqual(['gap', 'event', 'gap']);
    expect(timeline[0].durationMinutes).toBe(120); // 09–11
    expect(timeline[1].durationMinutes).toBe(60); // event 11–12
    expect(timeline[2].durationMinutes).toBe(300); // 12–17
  });

  it('includes slotted tasks in correct positions', () => {
    const slotted = [
      {
        id: 'todo-1',
        type: 'todo' as const,
        name: 'Read chapter',
        scheduled_start_iso: '2026-01-15T10:00:00.000Z',
        time_estimate_minutes: 30,
      },
    ] as any;

    const timeline = buildTimeline([], slotted, BLOCK_START, BLOCK_END);

    expect(timeline.map((e) => e.kind)).toEqual(['gap', 'slotted_task', 'gap']);
    expect(timeline[1].slottedTask).toBeDefined();
    expect(timeline[1].slottedTask!.title).toBe('Read chapter');
    expect(timeline[1].slottedTask!.estimateMinutes).toBe(30);
  });

  it('interleaves events, slotted tasks, and gaps together', () => {
    const events = [mkEvent('2026-01-15T11:00:00.000Z', '2026-01-15T12:00:00.000Z')];
    const slotted = [
      {
        id: 'todo-1',
        type: 'todo' as const,
        name: 'Write docs',
        scheduled_start_iso: '2026-01-15T13:00:00.000Z',
        time_estimate_minutes: 60,
      },
    ] as any;

    const timeline = buildTimeline(events, slotted, BLOCK_START, BLOCK_END);

    // gap 09–11, event 11–12, gap 12–13, task 13–14, gap 14–17
    expect(timeline.map((e) => e.kind)).toEqual(['gap', 'event', 'gap', 'slotted_task', 'gap']);
  });

  it('filters out all-day events', () => {
    const events = [
      mkEvent('2026-01-15T00:00:00.000Z', '2026-01-16T00:00:00.000Z', {
        isAllDay: true,
      }),
    ];
    const timeline = buildTimeline(events, [], BLOCK_START, BLOCK_END);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].kind).toBe('gap');
  });

  it('uses 15-minute default for tasks without time_estimate_minutes', () => {
    const slotted = [
      {
        id: 'todo-2',
        type: 'todo' as const,
        name: 'Quick task',
        scheduled_start_iso: '2026-01-15T10:00:00.000Z',
        time_estimate_minutes: undefined,
      },
    ] as any;

    const timeline = buildTimeline([], slotted, BLOCK_START, BLOCK_END);
    const task = timeline.find((e) => e.kind === 'slotted_task');
    expect(task?.durationMinutes).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getBlockBoundaryIso
// ═══════════════════════════════════════════════════════════════════════════════

describe('getBlockBoundaryIso', () => {
  it('returns correct ISO boundaries for a given date and hours', () => {
    const { startIso, endIso } = getBlockBoundaryIso('2026-01-15', 9, 17);

    // Verify the hours are correct (timezone-independent check)
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    expect(startDate.getHours()).toBe(9);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(17);
    expect(endDate.getMinutes()).toBe(0);
  });

  it('handles early morning boundaries', () => {
    const { startIso, endIso } = getBlockBoundaryIso('2026-01-15', 5, 9);
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    expect(startDate.getHours()).toBe(5);
    expect(endDate.getHours()).toBe(9);
  });

  it('handles late evening boundaries', () => {
    const { startIso, endIso } = getBlockBoundaryIso('2026-01-15', 17, 23);
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    expect(startDate.getHours()).toBe(17);
    expect(endDate.getHours()).toBe(23);
  });
});
