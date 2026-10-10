/**
 * @jest-environment node
 *
 * The daily context's habit lines: counted in the person's own week, with a
 * paused habit left alone and a lighter version said. The database is replaced.
 */
import { gatherDay, renderDay } from '../daily';
import { db } from '../db';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
}));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));

// Wednesday 7 October 2026
const TODAY = '2026-10-07';
const run = { id: 'h1', name: 'Run', cadence: 'weekly', target_per_period: 3 };
const stretchOut = { id: 'h2', name: 'Stretch', cadence: 'daily' };
const sugar = { id: 'h3', name: 'No sugar', cadence: 'daily', subtype: 'break_habit' };
// Run was logged on Friday 2, Sunday 4 and Tuesday 6 October
const logged = ['2026-10-02', '2026-10-04', '2026-10-06'].map((occurred_day) => ({
  habit_id: 'h1',
  occurred_day,
}));
const stretch = (mode, period_start, period_end, over = {}) => ({
  id: `${mode}-${period_start}`,
  habit_id: 'h1',
  mode,
  period_start,
  period_end,
  floor_note: null,
  ...over,
});

/** What gatherDay hands renderDay, with nothing in it. */
const day = (over = {}) => ({
  today: TODAY,
  weeklyDay: 0,
  calendar: [],
  noteEvents: [],
  openTodos: [],
  doneToday: [],
  habits: [run, stretchOut, sugar],
  progress: logged,
  brief: null,
  intention: null,
  journals: [],
  facts: [],
  changes: [],
  questions: [],
  absence: null,
  usage: null,
  lifeMap: null,
  worlds: [],
  prevDco: null,
  corrections: [],
  pastFacts: [],
  calendarConnected: true,
  story: [],
  recentNotes: [],
  reaction: null,
  eases: [],
  ...over,
});

/** The habit lines of the text the model reads. */
const habitLines = (g) => {
  const blocks = renderDay(g, 'UTC').text.split('\n\n');
  const [head, ...lines] = blocks.find((b) => b.startsWith('HABITS THIS WEEK')).split('\n');
  expect(head).toBe('HABITS THIS WEEK (ref | habit | kind | progress):');
  return lines;
};

describe('habits this week, in the daily context', () => {
  it('counts a Sunday person from Monday, as it always has', () => {
    const lines = [
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7',
      'h2 | Stretch | building a habit | 0 of 7 this week, day 3 of 7',
      'h3 | No sugar | breaking a habit | 0 of 7 this week, day 3 of 7',
    ];
    expect(habitLines(day())).toEqual(lines);
    // a day gathered with no weekly day is a Sunday person's
    expect(habitLines(day({ weeklyDay: undefined, eases: undefined }))).toEqual(lines);
  });

  it("counts in the person's own week when their weekly day is another day", () => {
    // Wednesday: their week began on Thursday 1 October and ends today
    expect(habitLines(day({ weeklyDay: 3 }))[0]).toBe(
      'h1 | Run | building a habit | 3 of 3 this week, day 7 of 7',
    );
    // Friday: their week began on Saturday 3 October
    expect(habitLines(day({ weeklyDay: 5 }))[0]).toBe(
      'h1 | Run | building a habit | 2 of 3 this week, day 5 of 7',
    );
    // Tuesday: their week began today
    expect(habitLines(day({ weeklyDay: 2 }))[0]).toBe(
      'h1 | Run | building a habit | 0 of 3 this week, day 1 of 7',
    );
  });

  it('says a habit paused today is paused, and until when, in place of its count', () => {
    const lines = habitLines(day({ eases: [stretch('pause', '2026-10-06', '2026-10-14')] }));
    expect(lines).toEqual([
      'h1 | Run | building a habit | paused until 2026-10-14',
      'h2 | Stretch | building a habit | 0 of 7 this week, day 3 of 7',
      'h3 | No sugar | breaking a habit | 0 of 7 this week, day 3 of 7',
    ]);
    // a pause that has not begun is no pause today
    expect(habitLines(day({ eases: [stretch('pause', '2026-10-08', '2026-10-14')] }))[0]).toBe(
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7',
    );
    // one that ended yesterday is over, and the days of this week it held are said:
    // they do not count against the habit
    expect(habitLines(day({ eases: [stretch('pause', '2026-10-01', '2026-10-06')] }))[0]).toBe(
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7, paused on 2 of those days',
    );
  });

  it('says a habit is on a lighter version for now, in their own words when they gave any', () => {
    const said = [
      stretch('floor', '2026-10-05', '2026-10-18', { floor_note: ' Ten minutes  is enough ' }),
    ];
    expect(habitLines(day({ eases: said }))[0]).toBe(
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7, lighter version for now: “Ten minutes is enough”',
    );
    expect(habitLines(day({ eases: [stretch('floor', '2026-10-05', '2026-10-18')] }))[0]).toBe(
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7, on a lighter version for now',
    );
    const long = [stretch('floor', '2026-10-05', '2026-10-18', { floor_note: 'x'.repeat(150) })];
    expect(habitLines(day({ eases: long }))[0]).toBe(
      `h1 | Run | building a habit | 1 of 3 this week, day 3 of 7, lighter version for now: “${'x'.repeat(120)}…”`,
    );
    // a row that changes nothing says nothing
    expect(habitLines(day({ eases: [stretch('keep', '2026-10-05', '2026-10-18')] }))[0]).toBe(
      'h1 | Run | building a habit | 1 of 3 this week, day 3 of 7',
    );
  });
});

describe('gathering the day', () => {
  const gather = async (tables = {}) => {
    const paths = [];
    db.mockReturnValue({
      select: jest.fn(async (path) => {
        paths.push(path);
        const hit = tables[path.split('?')[0]];
        if (hit instanceof Error) throw hit;
        return hit ?? [];
      }),
      rpc: jest.fn(async () => null),
    });
    const g = await gatherDay({}, 'user', 'UTC', TODAY);
    return { g, paths };
  };

  it('reads progress and the paused stretches from the earliest day their week can begin', async () => {
    const eases = [stretch('pause', '2026-10-06', '2026-10-14')];
    const { g, paths } = await gather({
      habits: [run],
      habit_progress: logged,
      notification_preferences: [{ weekly_day: 3 }],
      habit_adaptations: eases,
    });
    expect(paths.find((p) => p.startsWith('habit_progress'))).toBe(
      'habit_progress?owner_id=eq.user&occurred_day=gte.2026-10-01&select=habit_id,occurred_day&limit=2000',
    );
    expect(paths.find((p) => p.startsWith('habit_adaptations'))).toBe(
      'habit_adaptations?owner_id=eq.user&period_end=gte.2026-10-01&select=id,habit_id,mode,period_start,period_end,floor_note&limit=200',
    );
    expect(g.weeklyDay).toBe(3);
    expect(g.eases).toEqual(eases);
    expect(habitLines(g)).toEqual(['h1 | Run | building a habit | paused until 2026-10-14']);
  });

  it('is a Sunday person with nothing paused when neither can be read, and says so in the log', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { g } = await gather({
      habits: [run],
      habit_progress: logged,
      notification_preferences: new Error('settings are down'),
      habit_adaptations: new Error('habit_adaptations is down'),
    });
    expect(g.weeklyDay).toBe(0);
    expect(g.eases).toEqual([]);
    expect(habitLines(g)).toEqual(['h1 | Run | building a habit | 1 of 3 this week, day 3 of 7']);
    const said = warn.mock.calls.map((c) => String(c[0])).join(' ');
    expect(said).toMatch(/settings are down/);
    expect(said).toMatch(/habit_adaptations is down/);
    warn.mockRestore();
  });
});

describe('a todo with a deadline and no day planned (stage 2c)', () => {
  const todo = (id, title, over) => ({ id, title, created_at: '2026-10-01T09:00:00Z', ...over });
  // the lines under a heading, up to the next heading
  const block = (g, head) => {
    const text = renderDay(g, 'UTC').text;
    const rest = text.slice(text.indexOf(`\n${head}`) + 1);
    const next = rest.slice(1).search(/\n[A-Z]{2,}/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  it('is due today on its deadline, past its date after, and coming up before', () => {
    const g = day({
      openTodos: [
        todo('t1', 'Send the report', { due_day: null, target_date: TODAY }),
        todo('t2', 'Pay the bill', { due_day: null, target_date: '2026-10-06' }),
        todo('t3', 'Book the hall', { due_day: null, target_date: '2026-10-09' }),
      ],
    });
    expect(block(g, 'ON TODAY OR DUE TODAY')).toContain(
      'Send the report | due today, its deadline, no day planned',
    );
    expect(block(g, 'PAST THEIR DATE')).toContain('Pay the bill | was due 2026-10-06');
    expect(block(g, 'PAST THEIR DATE')).toContain(', its deadline, no day planned');
    expect(block(g, 'COMING UP')).toContain('Book the hall | deadline 2026-10-09');
    expect(block(g, 'UNDATED')).not.toContain('Send the report');
  });

  it('a planned day wins over the deadline', () => {
    const g = day({
      openTodos: [todo('t1', 'Send the report', { due_day: '2026-10-09', target_date: TODAY })],
    });
    expect(block(g, 'ON TODAY OR DUE TODAY')).not.toContain('Send the report');
    expect(block(g, 'COMING UP')).toContain('Send the report | due 2026-10-09');
  });
});
