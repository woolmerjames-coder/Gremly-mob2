/**
 * @jest-environment node
 */
// What the weekly read gathers (gatherRead in workers/inngest-jobs/week/read.js),
// against a stand in for the database. The person here is made up.

import { gatherRead, renderRead } from '../read';
import { db, personIdentity } from '../../context/db';

jest.mock('../../context/db', () => ({
  ...jest.requireActual('../../context/db'),
  db: jest.fn(),
  personIdentity: jest.fn(),
}));

const USER = '11111111-2222-4333-8444-555555555555';
const DONE_ID = 'aaaaaaaa-2222-4333-8444-555555555555';
const OPEN_ID = 'bbbbbbbb-2222-4333-8444-555555555555';
const TODAY = '2026-10-04';
const P = {
  today: TODAY,
  first: '2026-10-05',
  last: '2026-10-11',
  week_start: '2026-10-05',
  tz: 'Europe/London',
  days_off: [0, 6],
  // Sunday, ten past three in London
  at: new Date('2026-10-04T14:10:00Z'),
};

const openTodo = (i) => ({
  id: `todo-${String(i).padStart(4, '0')}`,
  name: `Todo ${i}`,
  due_day: null,
  target_date: null,
  time_estimate_minutes: 30,
  created_at: '2026-09-01T10:00:00Z',
  sweep_reschedule_count: 0,
  resurface_at: null,
});

function fakeDb(over = {}) {
  const paths = [];
  const tables = {
    worlds: [
      {
        id: 'w1',
        name: 'work',
        display_name: 'Work',
        phase: 'active',
        summary: 'A busy term.',
        key_priorities: ['Mark the books', { text: 'Write reports' }, null],
      },
    ],
    chapters: [
      {
        id: 'c1',
        title: 'The move',
        phase: 'active',
        start_date: '2026-08-01',
        end_date: '2026-10-30',
        summary: 'Settling in.',
        key_priorities: null,
      },
      {
        id: 'c2',
        title: 'A new job',
        phase: 'upcoming',
        start_date: '2026-10-19',
        end_date: null,
        summary: '',
        key_priorities: [],
      },
    ],
    habits: [
      {
        id: 'h1',
        name: 'Swim',
        cadence: 'weekly',
        target_per_period: 2,
        days_active: null,
        subtype: null,
        start_date: null,
        end_date: null,
        time_estimate_minutes: 45,
      },
      { id: 'h2', title: 'Old habit', cadence: 'daily', end_date: '2026-09-01' },
    ],
    habit_progress: [
      { habit_id: 'h1', occurred_day: '2026-10-01' },
      { habit_id: 'h1', occurred_day: '2026-09-15' },
    ],
    habit_plans: [{ habit_id: 'h1', planned_date: '2026-10-07' }],
    calendar_events: [
      {
        id: 'q1',
        title: 'Dinner',
        event_date: '2026-10-09',
        event_time: '19:30:00',
        duration_minutes: 90,
      },
    ],
    calendar_tokens: [{ id: 'tok' }],
    weekly_reviews: [
      {
        week_start: '2026-09-28',
        status: 'done',
        answers: {
          priorities: [
            { text: 'Reports', item_ids: [DONE_ID, OPEN_ID, 'not-an-id'] },
            { text: '', item_ids: [] },
          ],
          hours: { normal_day: 2, busy_day: 0.5, weekend_day: 4 },
        },
      },
    ],
    ...over,
  };
  const select = jest.fn(async (path) => {
    paths.push(path);
    const table = path.split('?')[0];
    if (table === 'todos') {
      if (path.includes('id=in.('))
        return [
          { id: DONE_ID, completed_at: '2026-10-02T09:00:00Z' },
          { id: OPEN_ID, completed_at: null },
        ];
      if (path.includes('completed_at=gte.'))
        return [
          { id: 'd1', name: 'Send the letters', completed_at: '2026-10-01T10:00:00Z' },
          { id: 'd2', name: 'Mark the tests', completed_at: '2026-10-03T16:00:00Z' },
        ];
      // the open todos, a thousand at a time
      if (path.includes('offset=0')) return Array.from({ length: 1000 }, (_, i) => openTodo(i));
      if (path.includes('offset=1000'))
        return Array.from({ length: 5 }, (_, i) => openTodo(1000 + i));
      return [];
    }
    if (table === 'notes') {
      if (path.includes('journal_subtype=eq.intention'))
        return [
          { title: 'Leave on time', body: 'Leave school by five twice', target_date: '2026-09-28' },
        ];
      return [
        {
          id: 'n1',
          title: 'Reports due',
          subtype: 'reference',
          target_date: '2026-10-23',
          event_time: null,
          end_date: null,
        },
        {
          id: 'n2',
          title: 'School fair',
          subtype: 'event',
          target_date: '2026-10-10',
          event_time: '10:00:00',
          end_date: '2026-10-11',
        },
      ];
    }
    if (table === 'synced_calendar_events') {
      // the read of whole days from today to six weeks out
      if (path.includes(`start_at=gte.${TODAY}T00:00:00Z`))
        return [
          {
            id: 's2',
            title: 'Trip to Leeds',
            start_at: '2026-10-20T00:00:00Z',
            end_at: '2026-10-23T00:00:00Z',
            is_all_day: true,
          },
          {
            id: 's3',
            title: 'Canceled: Old plan',
            start_at: '2026-10-21T00:00:00Z',
            end_at: '2026-10-22T00:00:00Z',
            is_all_day: true,
          },
        ];
      if (path.includes('is_all_day=eq.true')) return [];
      // the meetings on the days being planned: 9am on Monday in London
      return [
        {
          id: 's1',
          title: 'Staff meeting',
          start_at: '2026-10-05T08:00:00Z',
          end_at: '2026-10-05T08:30:00Z',
          is_all_day: false,
        },
      ];
    }
    return tables[table] || [];
  });
  return { select, paths };
}

beforeEach(() => {
  personIdentity.mockResolvedValue({ first_name: 'Maya', pronouns: null, identity: {} });
});

describe('what the read gathers', () => {
  it('shapes everything Gremly knows for the days being planned', async () => {
    const d = fakeDb();
    db.mockReturnValue(d);
    const g = await gatherRead({}, USER, P);

    expect(g).toMatchObject({
      tz: 'Europe/London',
      today: TODAY,
      now: 15 * 60 + 10,
      first: '2026-10-05',
      last: '2026-10-11',
      week_start: '2026-10-05',
      days_off: [0, 6],
      person: { first_name: 'Maya' },
    });
    expect(g.worlds).toEqual([
      {
        name: 'Work',
        phase: 'active',
        summary: 'A busy term.',
        priorities: ['Mark the books', 'Write reports'],
      },
    ]);
    expect(g.chapters.map((c) => [c.title, c.start_date, c.end_date])).toEqual([
      ['The move', '2026-08-01', '2026-10-30'],
      ['A new job', '2026-10-19', null],
    ]);
    // every open todo, read a thousand at a time
    expect(g.todos).toHaveLength(1005);
    expect(g.todos[0]).toEqual({
      id: 'todo-0000',
      title: 'Todo 0',
      minutes: 30,
      created: '2026-09-01',
      moved: 0,
      due_day: null,
      deadline: null,
      back_on: null,
      timed: false,
    });
    // newest first
    expect(g.done).toEqual([{ title: 'Mark the tests' }, { title: 'Send the letters' }]);
    // a habit that has ended is left out
    expect(g.habits).toHaveLength(1);
    expect(g.habits[0]).toMatchObject({
      id: 'h1',
      title: 'Swim',
      cadence: 'weekly',
      target: 2,
      minutes: 45,
      last_week: 1,
      before: 1,
      planned: ['2026-10-07'],
    });
    expect(g.calendar.connected).toBe(true);
    expect(g.calendar.days).toHaveLength(7);
    expect(g.calendar.days[0]).toEqual({
      day: '2026-10-05',
      meetings: [{ title: 'Staff meeting', start: 540, end: 570 }],
      all_day: [],
    });
    expect(g.dated).toEqual([
      {
        type: 'note',
        id: 'n1',
        what: 'note',
        title: 'Reports due',
        date: '2026-10-23',
        end: null,
        time: null,
      },
      {
        type: 'note',
        id: 'n2',
        what: 'event',
        title: 'School fair',
        date: '2026-10-10',
        end: '2026-10-11',
        time: '10:00',
      },
      {
        type: 'calendar_event',
        id: 'q1',
        what: 'event',
        title: 'Dinner',
        date: '2026-10-09',
        end: null,
        time: '19:30',
      },
      // three whole days; the cancelled one is left out
      {
        type: 'synced_event',
        id: 's2',
        what: 'on their calendar, all day',
        title: 'Trip to Leeds',
        date: '2026-10-20',
        end: '2026-10-22',
        time: null,
      },
      {
        type: 'chapter',
        id: 'c1',
        what: 'a chapter of their life ends',
        title: 'The move',
        date: '2026-10-30',
        end: null,
        time: null,
      },
      {
        type: 'chapter',
        id: 'c2',
        what: 'a chapter of their life starts',
        title: 'A new job',
        date: '2026-10-19',
        end: null,
        time: null,
      },
    ]);
    expect(g.last_review).toEqual({
      week_start: '2026-09-28',
      reviewed: true,
      intention: 'Leave school by five twice',
      // one of the two todos it covered is done; an id that is not one is not looked up
      priorities: [{ text: 'Reports', of: 2, done: 1 }],
      hours: { normal_day: 2, busy_day: 0.5, weekend_day: 4 },
      // it planned another week, so nothing it placed is on the days being planned now
      put: null,
    });
  });

  it('asks for the right windows', async () => {
    const d = fakeDb();
    db.mockReturnValue(d);
    await gatherRead({}, USER, P);
    const asked = (start) => d.paths.filter((p) => p.startsWith(start));
    // dated things from today to six weeks out
    expect(
      asked('notes?').some((p) =>
        p.includes('target_date=gte.2026-10-04&target_date=lte.2026-11-15'),
      ),
    ).toBe(true);
    expect(asked('calendar_events?')[0]).toContain(
      'event_date=gte.2026-10-04&event_date=lte.2026-11-15',
    );
    // four weeks of habit days, and plans on the days being planned
    expect(asked('habit_progress?')[0]).toContain(
      'occurred_day=gte.2026-09-07&occurred_day=lte.2026-10-04',
    );
    expect(asked('habit_plans?')[0]).toContain(
      'planned_date=gte.2026-10-05&planned_date=lte.2026-10-11',
    );
    // what was done in the last seven days, from the start of that day where they are
    expect(
      asked('todos?').some((p) =>
        p.includes(`completed_at=gte.${encodeURIComponent('2026-09-27T23:00:00.000Z')}`),
      ),
    ).toBe(true);
    // their last review that got under way, from the four weeks up to this one,
    // and the intention kept for the week it planned
    expect(asked('weekly_reviews?')[0]).toContain(
      'week_start=lte.2026-10-05&week_start=gte.2026-09-07&status=in.(started,done)',
    );
    expect(
      asked('notes?').some(
        (p) =>
          p.includes('journal_subtype=eq.intention') &&
          p.includes('target_date=gte.2026-09-28&target_date=lte.2026-10-04'),
      ),
    ).toBe(true);
    // habit days and done todos are read a thousand at a time, so none are cut off
    expect(asked('habit_progress?')[0]).toContain('limit=1000&offset=0');
    expect(asked('todos?').filter((p) => p.includes('completed_at=gte.'))[0]).toContain(
      'limit=1000&offset=0',
    );
    // only this person's rows, everywhere
    expect(d.paths.every((p) => p.includes(`owner_id=eq.${USER}`))).toBe(true);
  });

  it('gathers someone with almost nothing, and what it gives can be rendered', async () => {
    const d = fakeDb({
      worlds: [],
      chapters: [],
      habits: [],
      habit_progress: [],
      habit_plans: [],
      calendar_events: [],
      calendar_tokens: [],
      weekly_reviews: [],
    });
    d.select.mockImplementation(async (path) => {
      d.paths.push(path);
      return [];
    });
    db.mockReturnValue(d);
    const g = await gatherRead({}, USER, P);
    expect(g).toMatchObject({
      todos: [],
      done: [],
      habits: [],
      dated: [],
      worlds: [],
      last_review: null,
    });
    // with no review, an intention would be looked for in the week before this one
    expect(
      d.paths.some(
        (p) =>
          p.includes('journal_subtype=eq.intention') &&
          p.includes('target_date=gte.2026-09-28&target_date=lte.2026-10-04'),
      ),
    ).toBe(true);
    expect(g.calendar.connected).toBe(false);
    const r = renderRead(g);
    expect(r.text).toContain('FIGURES (worked out exactly): they have no open todos.');
    expect(r.text).toContain('THE CALENDAR: none is connected');
  });
});
