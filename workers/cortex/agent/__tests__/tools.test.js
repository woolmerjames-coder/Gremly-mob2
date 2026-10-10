/**
 * @jest-environment node
 */
// The agent's tools (workers/cortex/agent/tools): what each one asks the
// database, what it hands the model, and that a failing tool never stops a
// turn.

import {
  TOOLS,
  WEEK_TOOLS,
  isSignal,
  runTool,
  toolDeclarations,
  toolsFor,
} from '../tools/index.js';
import { daysToRead, habitOnDay, plannedAround, weekBounds } from '../tools/getDay.js';
import { boardOf, calendarOf, hoursWords } from '../tools/getWeek.js';
import {
  easeCheckOf,
  fieldListWords,
  readPlanRow,
  toEaseChange,
  toModelChange,
  toWeekChange,
  weekCheckOf,
} from '../tools/proposeChanges.js';
import { SURFACES, surfaceOf } from '../surfaces.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const TODAY = '2026-10-02'; // a Friday
const TODO = '11111111-1111-4111-8111-111111111111';
const HABIT = '22222222-2222-4222-8222-222222222222';
const NOTE = '33333333-3333-4333-8333-333333333333';
const WORLD = '44444444-4444-4444-8444-444444444444';

/** A database that answers by the start of the path, and records what it was asked. */
function fakeDb(routes = {}, rpcs = {}) {
  const asked = [];
  return {
    asked,
    select: async (path) => {
      asked.push(path);
      const key = Object.keys(routes).find((k) => path.startsWith(k));
      const v = key ? routes[key] : [];
      return typeof v === 'function' ? v(path) : v;
    },
    rpc: async (fn, args) => {
      asked.push({ fn, args });
      const v = rpcs[fn];
      return typeof v === 'function' ? v(args) : (v ?? []);
    },
  };
}

const ctxWith = (db) => ({
  env: { TAVILY_API_KEY: 'k' },
  userId: USER,
  today: TODAY,
  timezone: 'America/Los_Angeles',
  db,
  cache: new Map(),
});

describe('the declarations', () => {
  it('give every tool a name, a description and object parameters both providers read', () => {
    const decls = toolDeclarations();
    expect(decls.map((d) => d.name)).toEqual([
      'find_items',
      'get_item',
      'get_day',
      'recall',
      'web_search',
      'propose_changes',
    ]);
    const walk = (s, path) => {
      if (s.type === 'object') {
        expect([path, typeof s.properties]).toEqual([path, 'object']);
        for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
      }
      if (s.type === 'array') {
        expect([path, typeof s.items]).toEqual([path, 'object']);
        walk(s.items, `${path}[]`);
      }
      expect(s.oneOf || s.anyOf || s.$ref).toBeUndefined();
    };
    for (const d of [...decls, ...toolDeclarations(toolsFor(null, 'brief'))]) {
      expect(d.description.length).toBeGreaterThan(80);
      expect(d.parameters.type).toBe('object');
      walk(d.parameters, d.name);
      // no dashes as punctuation in anything the model reads
      expect(d.description).not.toMatch(/ — | – | - /);
    }
  });

  it('describe the change model fields from its own list, the rarely used ones marked', () => {
    const words = fieldListWords();
    expect(words).toMatch(/^todo: name \(what it is called\), text/);
    expect(words).toContain('pinned* (pinned to the top)');
    expect(words).toContain('schedule (how often they do it');
  });
});

describe('find_items', () => {
  it('asks the database search with the filters, open items by default', async () => {
    const db = fakeDb(
      {},
      {
        find_items: [
          {
            type: 'todo',
            id: TODO,
            title: 'Dentist',
            day: '2026-10-03',
            time: '10:00:00',
            state: 'open',
            snippet: 'Bring the form',
          },
          {
            type: 'habit',
            id: HABIT,
            title: 'Run',
            day: null,
            time: null,
            state: 'open',
            detail: '3x/week',
            snippet: '',
          },
        ],
      },
    );
    const r = await runTool(ctxWith(db), 'find_items', {
      query: 'dentist',
      types: ['todo', 'bogus'],
      limit: 99,
    });
    expect(db.asked[0]).toEqual({
      fn: 'find_items',
      args: {
        p_user: USER,
        p_query: 'dentist',
        p_types: ['todo'],
        p_from: null,
        p_to: null,
        p_state: 'open',
        p_limit: 30,
      },
    });
    expect(r.ok).toBe(true);
    expect(r.text).toContain(
      `- todo | id ${TODO} | Dentist | Sat 3 Oct (tomorrow) at 10:00am | open | “Bring the form”`,
    );
    expect(r.text).toContain(`- habit | id ${HABIT} | Run | 3x/week | open`);
  });

  it("names each note's kind, and says when one is from their calendar", async () => {
    const note = (detail, title) => ({
      type: 'note',
      id: NOTE,
      title,
      day: null,
      time: null,
      state: 'open',
      detail,
      snippet: '',
    });
    const db = fakeDb(
      {},
      {
        find_items: [
          note('catchall', 'Friday off work'),
          note('event', 'Dinner with Priya'),
          note('idea', 'Street food podcast'),
          note('calendar', 'Team offsite'),
        ],
      },
    );
    const r = await runTool(ctxWith(db), 'find_items', { types: ['note'] });
    expect(r.text).toContain(`- note | id ${NOTE} | Friday off work | note | open`);
    expect(r.text).toContain(`- note | id ${NOTE} | Dinner with Priya | event | open`);
    expect(r.text).toContain(`- note | id ${NOTE} | Street food podcast | idea | open`);
    expect(r.text).toContain(`- note | id ${NOTE} | Team offsite | from their calendar | open`);
  });

  it('says so when nothing matched', async () => {
    const r = await runTool(ctxWith(fakeDb({}, { find_items: [] })), 'find_items', {
      query: 'zzz',
    });
    expect(r.text).toMatch(/^Nothing matched/);
  });
});

describe('get_item', () => {
  const note = {
    id: NOTE,
    title: 'Packing',
    body: 'For the trip',
    subtype: 'list',
    list_items: [{ id: 'l1', text: 'Sunglasses', checked: true }],
    reminders_json: [{ id: 'r1', frequency: 'once', date: '2026-10-04', time: '09:00' }],
    tags: ['travel'],
    is_pinned: false,
    archived: false,
    external_source: null,
    views: {},
    created_at: '2026-09-30T10:00:00Z',
  };

  it('reads every field with its value now, with the ids a change needs', async () => {
    const db = fakeDb({
      'notes?': [note],
      drop_world_links: [{ world_id: WORLD }],
      drop_chapter_links: [],
      'worlds?': [{ id: WORLD, display_name: 'Travel' }],
      'chapters?': [],
    });
    const r = await runTool(ctxWith(db), 'get_item', { type: 'note', id: NOTE });
    expect(r.text).toContain(`note | id ${NOTE} | open`);
    expect(r.text).toContain('- name: “Packing”');
    expect(r.text).toContain('- list: [x] Sunglasses (id l1)');
    expect(r.text).toContain(`- worlds*: Travel (id ${WORLD})`);
    expect(r.text).toContain('- tags*: travel');
    expect(r.text).toContain('- day: none');
  });

  it("lists a todo's reminders with their ids", async () => {
    const todo = {
      id: TODO,
      name: 'Dentist',
      reminders_json: [{ id: 'r1', frequency: 'once', date: '2026-10-04', time: '09:00' }],
      archived: false,
      views: {},
    };
    const r = await runTool(ctxWith(fakeDb({ 'todos?': [todo] })), 'get_item', {
      type: 'todo',
      id: TODO,
    });
    expect(r.text).toContain('- reminder: once on Sun 4 Oct at 9:00am (id r1)');
  });

  it('says when it is not one of theirs, and when it comes from their calendar', async () => {
    const none = await runTool(ctxWith(fakeDb()), 'get_item', { type: 'note', id: NOTE });
    expect(none.text).toMatch(/^No item of theirs/);
    const cal = await runTool(
      ctxWith(
        fakeDb({ 'notes?': [{ ...note, external_source: { provider: 'google_calendar' } }] }),
      ),
      'get_item',
      { type: 'note', id: NOTE },
    );
    expect(cal.text).toContain('from their calendar, so Gremly can read it but not change it');
  });
});

describe('get_day', () => {
  it('works out which habits fall on a day and where each stands', () => {
    const daily = { cadence: 'daily', target_per_period: 1 };
    expect(habitOnDay(daily, TODAY, [TODAY])).toEqual({ schedule: 'daily', done: true });
    const mwf = { cadence: 'weekly', target_per_period: 3, days_active: [1, 3, 5] };
    expect(habitOnDay(mwf, TODAY, [])).toEqual({ schedule: 'on Mon, Wed, Fri', done: false });
    expect(habitOnDay(mwf, '2026-10-03', [])).toBeNull();
    const weekly = { cadence: 'weekly', target_per_period: 2 };
    expect(habitOnDay(weekly, TODAY, ['2026-09-28', '2026-10-01', '2026-09-27'])).toEqual({
      schedule: '2x/week',
      done: false,
      progress: '2 of 2 this week',
      met: true,
    });
    expect(habitOnDay({ ...daily, start_date: '2026-10-05' }, TODAY, [])).toBeNull();
  });

  it('reads a habit they are breaking as one kept clear of, never as something to do', () => {
    const breaking = { subtype: 'break_habit', cadence: 'weekly', days_active: [1, 3, 5] };
    // every day it runs, weekdays or not, and with no schedule or progress to do
    expect(habitOnDay(breaking, TODAY, [TODAY])).toEqual({ breaking: true, done: true });
    expect(habitOnDay(breaking, '2026-10-03', [])).toEqual({ breaking: true, done: false });
    expect(habitOnDay({ ...breaking, end_date: '2026-10-01' }, TODAY, [])).toBeNull();
  });

  it('reads today: the calendar in their time, todos with ids, what is past its day, habits', async () => {
    const db = fakeDb({
      synced_calendar_events: [
        {
          id: 'm1',
          title: 'Standup',
          start_at: '2026-10-02T16:00:00Z',
          end_at: '2026-10-02T16:30:00Z',
          is_all_day: false,
        },
        {
          id: 'm2',
          title: 'Canceled: Lunch',
          start_at: '2026-10-02T19:00:00Z',
          end_at: '2026-10-02T20:00:00Z',
          is_all_day: false,
        },
      ],
      'notes?': [],
      calendar_events: [],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.eq.`]: [
        { id: TODO, name: 'Call Mum', due_time: '12:00:00', time_estimate_minutes: 15 },
      ],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.lt.`]: [
        { id: 'old', name: 'Tax form', due_day: '2026-09-29' },
      ],
      'habits?': [{ id: HABIT, name: 'Run', cadence: 'daily', target_per_period: 1 }],
      habit_progress: [],
      user_daily_state: [],
      scope_chats: [],
    });
    const r = await runTool(ctxWith(db), 'get_day', {});
    expect(r.ok).toBe(true);
    expect(r.text).toContain('Fri 2 Oct (today)');
    expect(r.text).toContain('Calendar: 9:00am to 9:30am Standup');
    expect(r.text).not.toContain('Lunch');
    expect(r.text).toContain(`Todos for the day: Call Mum (id ${TODO}) at 12:00pm, 15 min`);
    expect(r.text).toContain('Past their day: Tax form (id old, was Tue 29 Sep)');
    expect(r.text).toContain(`Habits: Run (id ${HABIT}) daily, not done that day`);
  });

  it('leaves out the steps left on a closed Chapter, as Today does', async () => {
    const db = fakeDb({
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.eq.`]: [
        { id: TODO, name: 'Call Mum', due_time: null, time_estimate_minutes: 15 },
        { id: 'packed', name: 'Pack the tent', due_time: null, time_estimate_minutes: 20 },
      ],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.lt.`]: [
        { id: 'old', name: 'Tax form', due_day: '2026-09-29' },
      ],
      [`chapters?owner_id=eq.${USER}&or=`]: [{ id: 'cCamp' }],
      [`drop_chapter_links?owner_id=eq.${USER}&drop_type=eq.todo&chapter_id=in.(cCamp)`]: [
        { drop_id: 'packed' },
        { drop_id: 'old' },
      ],
      'habits?': [],
      habit_progress: [],
    });
    const r = await runTool(ctxWith(db), 'get_day', {});
    expect(r.text).toContain(`Call Mum (id ${TODO})`);
    expect(r.text).not.toContain('Pack the tent');
    expect(r.text).not.toContain('Tax form');
  });

  it("counts a todo put off until a day among that day's todos", async () => {
    const db = fakeDb({
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.eq.`]: [
        { id: TODO, name: 'Call Mum', due_time: null, time_estimate_minutes: 15 },
      ],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&due_day=is.null&scheduled_date=is.null&resurface_at=eq.`]:
        [{ id: 'back', name: 'Call the plumber', time_estimate_minutes: 10 }],
      'habits?': [],
      habit_progress: [],
    });
    const r = await runTool(ctxWith(db), 'get_day', {});
    expect(r.text).toContain(
      `Todos for the day: Call Mum (id ${TODO}), 15 min; Call the plumber (id back), 10 min, put off earlier and back on this day`,
    );
    expect(db.asked.find((q) => typeof q === 'string' && q.includes('resurface_at=eq.'))).toContain(
      `due_day=is.null&scheduled_date=is.null&resurface_at=eq.${TODAY}`,
    );
  });

  it('says where a day stands among the days a habit is planned on', () => {
    // with no week known: the planned days within a week either side, not called a week
    expect(plannedAround([], TODAY)).toBeNull();
    expect(plannedAround(['2026-09-20'], TODAY)).toBeNull();
    expect(plannedAround(['2026-10-05', TODAY, TODAY], TODAY)).toEqual({
      on: true,
      others: ['2026-10-05'],
      week: false,
    });
    expect(plannedAround(['2026-10-05', '2026-09-30'], TODAY)).toEqual({
      on: false,
      others: ['2026-09-30', '2026-10-05'],
      week: false,
    });
    // inside their week: that week's days and no further, so a day of last
    // week or next is never named as one of this week's
    const week = weekBounds({ first: '2026-09-30', view_first: '2026-09-28', last: '2026-10-04' });
    expect(week).toEqual({ first: '2026-09-28', last: '2026-10-04' });
    expect(plannedAround(['2026-09-26', '2026-09-28', TODAY, '2026-10-05'], TODAY, week)).toEqual({
      on: true,
      others: ['2026-09-28'],
      week: true,
    });
    expect(plannedAround(['2026-09-26', '2026-10-05'], TODAY, week)).toBeNull();
    // a day outside their week says only whether it is planned itself
    expect(plannedAround([TODAY, '2026-10-06'], '2026-10-06', week)).toEqual({
      on: true,
      others: [],
      week: false,
    });
    expect(plannedAround([TODAY], '2026-10-06', week)).toBeNull();
    // no week sent, or one with no days
    expect(weekBounds(null)).toBeNull();
    expect(weekBounds({ first: '2026-09-28' })).toBeNull();
  });

  it('counts a habit planned on a day as on that day, whatever days its routine names', () => {
    const monThu = { cadence: 'weekly', target_per_period: 2, days_active: [1, 4] };
    // a Friday: not one of its days, until it is planned there
    expect(habitOnDay(monThu, TODAY, [])).toBeNull();
    expect(habitOnDay(monThu, TODAY, [], true)).toEqual({ schedule: 'on Mon, Thu', done: false });
    // still nothing before it starts
    expect(habitOnDay({ ...monThu, start_date: '2026-10-05' }, TODAY, [], true)).toBeNull();
  });

  it('gives the habits of a day with the days they are planned on in their week', async () => {
    const db = fakeDb({
      'habits?': [
        { id: HABIT, name: 'Strength', cadence: 'weekly', target_per_period: 3 },
        { id: 'h-read', name: 'Read', cadence: 'weekly', target_per_period: 2 },
        { id: 'h-walk', name: 'Walk', cadence: 'daily', target_per_period: 1 },
      ],
      habit_progress: [],
      habit_plans: [
        { habit_id: HABIT, planned_date: TODAY },
        { habit_id: HABIT, planned_date: '2026-10-04' },
        { habit_id: 'h-read', planned_date: '2026-10-03' },
      ],
    });
    // their week, Monday 28 September to Sunday 4 October, as the thread sends it
    const inWeek = { ...ctxWith(db), week: { first: '2026-09-28', last: '2026-10-04' } };
    const r = await runTool(inWeek, 'get_day', {});
    expect(r.text).toContain(
      `Strength (id ${HABIT}) 3x/week, not done that day, 0 of 3 this week, planned for this day in their week (also on Sun 4 Oct)`,
    );
    expect(r.text).toContain(
      'Read (id h-read) 2x/week, not done that day, 0 of 2 this week, planned in their week on Sat 3 Oct (tomorrow), not on this day',
    );
    // with no week sent the same days are given, and not called a week
    const bare = await runTool(ctxWith(db), 'get_day', {});
    expect(bare.text).toContain(`0 of 3 this week, planned for this day (also on Sun 4 Oct)`);
    expect(bare.text).toContain('planned on Sat 3 Oct (tomorrow), not on this day');
    expect(bare.text).not.toContain('in their week');
    // a habit with no days planned says nothing of the week
    expect(r.text).toContain('Walk (id h-walk) daily, not done that day');
    expect(r.text).not.toContain('Walk (id h-walk) daily, not done that day,');
    const plans = db.asked.find((q) => typeof q === 'string' && q.startsWith('habit_plans'));
    expect(plans).toContain('planned_date=gte.2026-09-26&planned_date=lte.2026-10-08');
    // On their weekly day the week runs from today to the next one, eight
    // days: the read reaches its last day, further than a week from today.
    const long = fakeDb({ 'habits?': [], habit_progress: [], habit_plans: [] });
    await runTool({ ...ctxWith(long), week: { first: TODAY, last: '2026-10-09' } }, 'get_day', {});
    expect(long.asked.find((q) => typeof q === 'string' && q.startsWith('habit_plans'))).toContain(
      'planned_date=gte.2026-09-26&planned_date=lte.2026-10-09',
    );
  });

  it('still answers the day when the planned days cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb({
      'habits?': [{ id: HABIT, name: 'Run', cadence: 'daily', target_per_period: 1 }],
      habit_progress: [],
      habit_plans: () => {
        throw new Error('down');
      },
    });
    const r = await runTool(ctxWith(db), 'get_day', {});
    expect(r.ok).toBe(true);
    expect(r.text).toContain(`Habits: Run (id ${HABIT}) daily, not done that day`);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads another day without what belongs only to today', async () => {
    const db = fakeDb({ 'habits?': [], habit_progress: [] });
    const r = await runTool(ctxWith(db), 'get_day', { date: '2026-10-09' });
    expect(r.text).toContain('Fri 9 Oct');
    expect(r.text).not.toContain('Past their day');
    expect(db.asked.some((p) => typeof p === 'string' && p.startsWith('user_daily_state'))).toBe(
      false,
    );
  });
});

describe('recall', () => {
  it('searches memory and marks what is private', async () => {
    const db = fakeDb(
      {},
      {
        recall_life_now: [
          {
            source: 'fact',
            title: 'Trip',
            body: 'Flying to San Diego on 2 Oct',
            about_date: '2026-10-02',
            state: 'current',
            private: false,
          },
          {
            source: 'story',
            title: 'A hard year',
            body: 'Grief after a loss',
            about_date: null,
            state: 'current',
            private: true,
          },
        ],
      },
    );
    const r = await runTool(ctxWith(db), 'recall', { query: 'San Diego trip' });
    expect(db.asked[0].args).toMatchObject({
      p_user: USER,
      p_query: 'San Diego trip',
      p_limit: 10,
    });
    expect(r.text).toContain('- fact | Fri 2 Oct (today) | current | Flying to San Diego on 2 Oct');
    expect(r.text).toMatch(/A hard year: Grief after a loss \[private: use it only when/);
  });

  it('says how Gremly knows a fact, and nothing of the kind for its own writing', async () => {
    const db = fakeDb(
      {},
      {
        recall_life_now: [
          {
            source: 'fact',
            title: 'Alex',
            body: 'Alex might be moving to the Lisbon office.',
            about_date: null,
            state: 'current',
            private: false,
            said_by: 'user',
            source_table: 'user_corrections',
            source_kind: 'question',
            source_question: 'How is work going these days?',
            source_quote: 'Might be moving to the Lisbon office in the new year',
            // the evening of Tuesday 29 September in Los Angeles
            observed_at: '2026-09-30T05:10:00Z',
          },
          {
            source: 'story',
            title: 'A year of change',
            body: 'Work shifted a lot this year.',
            about_date: null,
            state: 'shift',
            private: false,
          },
        ],
      },
    );
    const r = await runTool({ ...ctxWith(db), timezone: 'America/Los_Angeles' }, 'recall', {
      query: 'Lisbon',
    });
    expect(r.text).toContain(
      '- fact | current | Alex might be moving to the Lisbon office. | how Gremly knows: their answer when Gremly asked "How is work going these days?", on Tue 29 Sep 2026; their words: "Might be moving to the Lisbon office in the new year"',
    );
    expect(r.text).toContain('- story | shift | A year of change: Work shifted a lot this year.');
    expect(r.text.split('\n')[2]).not.toContain('how Gremly knows');
    // what a source is for is said with the result, above what was found
    expect(r.text.split('\n')[0]).toBe(
      'On record (when they ask how Gremly knows something, a fact says it on its own line: tell them the day, where they said it and what they said. When no line says it, Gremly cannot tell where it came from and may have got it wrong, and it is never from anyone else):',
    );
    // and not in the description, which the agent is sent on every turn
    expect(TOOLS.find((t) => t.name === 'recall').description).not.toContain('how Gremly knows');
  });
});

describe('propose_changes', () => {
  it('turns the tool shape into the change model: text added, fields emptied', () => {
    expect(
      toModelChange(
        {
          op: 'change',
          type: 'todo',
          id: TODO,
          fields: { text_add: 'More', day: '2026-10-05' },
          clear: ['time'],
        },
        0,
      ),
    ).toEqual({
      cid: 'c1',
      op: 'change',
      type: 'todo',
      id: TODO,
      fields: { text: { add: 'More' }, day: '2026-10-05', time: null },
    });
  });

  it('checks each change against the item as it is, keeps what passes and says why the rest was dropped', async () => {
    const db = fakeDb({
      'todos?': (path) =>
        path.includes(TODO)
          ? [
              {
                id: TODO,
                name: 'Dentist',
                due_day: '2026-10-02',
                due_time: '10:00:00',
                archived: false,
                views: {},
              },
            ]
          : [],
      'habits?': [
        {
          id: HABIT,
          name: 'Run',
          cadence: 'daily',
          target_per_period: 1,
          frequency: 'daily',
          archived: false,
        },
      ],
      habit_progress: [{ occurred_day: '2026-10-02' }],
      drop_world_links: [],
      drop_chapter_links: [],
      'worlds?': [{ id: WORLD, display_name: 'Health' }],
      'chapters?': [],
    });
    const r = await runTool(ctxWith(db), 'propose_changes', {
      changes: [
        {
          op: 'change',
          type: 'todo',
          id: TODO,
          fields: { day: '2026-10-03', time: '15:00', worlds: { add: [WORLD] } },
        },
        { op: 'log', type: 'habit', id: HABIT, days: ['2026-10-02'] },
        { op: 'change', type: 'habit', id: HABIT, fields: { schedule: { per: 'week', times: 3 } } },
        {
          op: 'change',
          type: 'todo',
          id: '99999999-9999-4999-8999-999999999999',
          fields: { time: '09:00' },
        },
        { op: 'change', type: 'todo', id: TODO, fields: { time: 'noon' } },
      ],
    });
    expect(r.result.changes.map((c) => c.cid)).toEqual(['c1', 'c3']);
    expect(r.result.changes[0].before).toEqual({ day: '2026-10-02', time: '10:00', worlds: [] });
    expect(r.text).toContain(
      '- c1 change todo “Dentist”: day Sat 3 Oct (tomorrow); time 3:00pm; into Health',
    );
    expect(r.text).toContain('- c3 change habit “Run”: schedule {"per":"week","times":3}');
    expect(r.text).toContain('- c2: it already is that way');
    expect(r.text).toContain(
      '- c4: no item of theirs has that kind and id; look it up with find_items',
    );
    expect(r.text).toContain('- c5: the value for time is not valid');
    // a fix proposed on its own would replace the rows that made it
    expect(r.text).toContain(
      'Proposing again puts a new card in place of this one, so a fix goes in with every change above that should stay.',
    );
  });

  it("sets a note's kind for an app build that can write it, and drops it for one that cannot", async () => {
    const routes = {
      'notes?': (path) =>
        path.includes(NOTE)
          ? [
              {
                id: NOTE,
                title: 'Friday off work',
                subtype: 'catchall',
                archived: false,
                views: {},
              },
            ]
          : [],
      drop_world_links: [],
      drop_chapter_links: [],
      'worlds?': [],
      'chapters?': [],
    };
    const changes = [
      { op: 'change', type: 'note', id: NOTE, fields: { kind: 'event', day: '2026-10-09' } },
    ];
    const newer = await runTool(
      { ...ctxWith(fakeDb(routes)), noteKinds: true },
      'propose_changes',
      {
        changes,
      },
    );
    expect(newer.result.changes[0].fields).toEqual({ kind: 'event', day: '2026-10-09' });
    expect(newer.text).toContain('- c1 change note “Friday off work”: kind event; day Fri 9 Oct');
    const older = await runTool(ctxWith(fakeDb(routes)), 'propose_changes', { changes });
    expect(older.result.changes).toEqual([]);
    expect(older.text).toContain(
      "- c1: this app cannot set a note's kind yet: leave kind out; a note given its day is an event",
    );
  });

  it('tells the model a journal entry keeps its kind', async () => {
    const db = fakeDb({
      'notes?': [{ id: NOTE, title: 'Sunday reflections', subtype: 'journal', archived: false }],
      drop_world_links: [],
      drop_chapter_links: [],
      'worlds?': [],
      'chapters?': [],
    });
    const r = await runTool({ ...ctxWith(db), noteKinds: true }, 'propose_changes', {
      changes: [{ op: 'change', type: 'note', id: NOTE, fields: { kind: 'idea' } }],
    });
    expect(r.text).toContain(
      '- c1: a journal entry stays a journal entry; its kind is never changed',
    );
  });

  it('says when nothing made it', async () => {
    const r = await runTool(
      ctxWith(fakeDb({ 'worlds?': [], 'chapters?': [] })),
      'propose_changes',
      {
        changes: [{ op: 'add', type: 'todo', fields: {} }],
      },
    );
    expect(r.text).toContain('Nothing made it onto the card.');
    expect(r.text).toContain('- c1: a new item needs a name');
    expect(r.text).not.toContain('Proposing again');
  });
});

describe("propose_changes in today's thread", () => {
  const BLOCK = 'blk_1';
  const day = {
    date: TODAY,
    plan: {
      status: 'proposal',
      items: [{ id: TODO, kind: 'todo', title: 'Call Mum', start: 710, end: 730 }],
    },
    blocks: [{ id: BLOCK, title: 'Dentist', start: 600, end: null, travel: false }],
    items: new Map([
      [TODO, { id: TODO, kind: 'todo', title: 'Call Mum', minutes: 20 }],
      [HABIT, { id: HABIT, kind: 'habit', title: 'Pushups', minutes: 10 }],
    ]),
  };

  it('reads each plan change against the plan on screen and the set times', () => {
    const row = (plan) => readPlanRow({ op: 'plan', plan }, 'c1', day);
    expect(row({ kind: 'plan_move', id: TODO, time: '12:00' }).raw).toEqual({
      cid: 'c1',
      op: 'plan',
      type: 'todo',
      id: TODO,
      title: 'Call Mum',
      plan: { kind: 'plan_move', id: TODO, item: 'todo', start: 720, title: 'Call Mum' },
    });
    expect(
      row({ kind: 'add_block', title: 'Leave for the airport', time: '12:30', travel: true }).raw
        .plan,
    ).toEqual({
      kind: 'add_block',
      start: 750,
      end: null,
      travel: true,
      title: 'Leave for the airport',
    });
    expect(row({ kind: 'plan_add', id: HABIT }).raw.plan).toMatchObject({
      kind: 'plan_add',
      id: HABIT,
      item: 'habit',
      start: null,
      minutes: 10,
    });
    expect(row({ kind: 'remove_block', id: BLOCK }).raw).toMatchObject({
      id: BLOCK,
      title: 'Dentist',
    });
    expect(row({ kind: 'plan_add', id: TODO }).reason).toBe('in_plan');
    expect(row({ kind: 'plan_remove', id: HABIT }).reason).toBe('not_in_plan');
    expect(row({ kind: 'plan_move', id: TODO }).reason).toBe('needs_time');
    expect(row({ kind: 'remove_block', id: 'blk_9' }).reason).toBe('no_block');
    expect(row({ kind: 'add_block', time: '12:30' }).reason).toBe('needs_title');
    expect(row({ kind: 'plan_add', id: NOTE }).reason).toBe('not_today');
    // a habit they are breaking has nothing to do at a time: the plan never holds it
    const withBreaking = {
      ...day,
      items: new Map([
        ...day.items,
        ['sugar', { id: 'sugar', kind: 'habit', title: 'No sugar', minutes: null, breaking: true }],
      ]),
    };
    expect(
      readPlanRow({ op: 'plan', plan: { kind: 'plan_add', id: 'sugar' } }, 'c1', withBreaking)
        .reason,
    ).toBe('plan_breaking');
    expect(row({ kind: 'add_block', title: 'x', time: '25:00' }).reason).toBe('bad_plan_time');
    // an offer to plan the day only when there is no plan on screen
    expect(row({ kind: 'plan_day' }).reason).toBe('has_plan');
    expect(
      readPlanRow({ op: 'plan', plan: { kind: 'plan_day' } }, 'c1', { ...day, plan: null }).raw,
    ).toEqual({
      cid: 'c1',
      op: 'plan',
      type: null,
      id: null,
      title: 'Plan the rest of today',
      plan: { kind: 'plan_day', title: 'Plan the rest of today' },
    });
    expect(
      readPlanRow({ op: 'plan', plan: { kind: 'plan_add', id: HABIT } }, 'c1', {
        ...day,
        plan: null,
      }).reason,
    ).toBe('no_plan');
    expect(
      readPlanRow({ op: 'plan', plan: { kind: 'plan_move', id: TODO, time: '12:00' } }, 'c1', null)
        .reason,
    ).toBe('not_here');
  });

  it('reads plan times the way Gremly reads them, and refuses one already gone', () => {
    // 7:35am
    const morning = { ...day, now: 455 };
    const row = (plan) => readPlanRow({ op: 'plan', plan }, 'c1', morning);
    expect(row({ kind: 'plan_add', id: HABIT, time: '2:45pm' }).raw.plan.start).toBe(885);
    expect(row({ kind: 'plan_move', id: TODO, time: '6pm' }).raw.plan.start).toBe(1080);
    expect(row({ kind: 'plan_move', id: TODO, time: '14:00' }).raw.plan.start).toBe(840);
    // 2:45pm written on a 24 hour clock by mistake reads as 2:45am, which has gone
    expect(row({ kind: 'plan_add', id: HABIT, time: '02:45' }).reason).toBe('past_time');
    expect(row({ kind: 'plan_move', id: TODO, time: '7am' }).reason).toBe('past_time');
    // a set time earlier today is still a fact about the day
    expect(row({ kind: 'add_block', title: 'Gym', time: '6am' }).raw.plan.start).toBe(360);
  });

  it('puts plan changes and item changes on one card, in the order given', async () => {
    const db = fakeDb({
      'todos?id=eq.': [
        { id: TODO, name: 'Call Mum', due_day: TODAY, due_time: '11:50:00', archived_at: null },
      ],
      worlds: [],
      chapters: [],
    });
    const r = await runTool({ ...ctxWith(db), surface: 'brief', day }, 'propose_changes', {
      changes: [
        {
          op: 'plan',
          plan: { kind: 'add_block', title: 'Leave for the airport', time: '12:30', travel: true },
        },
        { op: 'plan', plan: { kind: 'plan_remove', id: HABIT } },
        { op: 'change', type: 'todo', id: TODO, fields: { time: '12:00' } },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.result.changes.map((c) => [c.cid, c.op])).toEqual([
      ['c1', 'plan'],
      ['c3', 'change'],
    ]);
    expect(r.result.dropped).toEqual([{ cid: 'c2', reason: 'not_in_plan' }]);
    expect(r.text).toContain('c1 plan: set time today “Leave for the airport” at 12:30pm, travel');
    expect(r.text).toContain('c2: that item is not in the plan on screen; plan_add fits it in');
  });

  it('keeps one row per item: a new time or day already moves it in the plan', async () => {
    const db = fakeDb({
      'todos?id=eq.': [
        { id: TODO, name: 'Call Mum', due_day: TODAY, due_time: '11:50:00', archived: false },
      ],
      worlds: [],
      chapters: [],
    });
    const r = await runTool({ ...ctxWith(db), surface: 'brief', day }, 'propose_changes', {
      changes: [
        { op: 'change', type: 'todo', id: TODO, fields: { time: '12:00' } },
        { op: 'plan', plan: { kind: 'plan_move', id: TODO, time: '12:00' } },
      ],
    });
    expect(r.result.changes.map((c) => c.cid)).toEqual(['c1']);
    expect(r.result.dropped).toEqual([{ cid: 'c2', reason: 'covered' }]);
  });

  it('keeps plan changes off the card everywhere else', async () => {
    const r = await runTool(ctxWith(fakeDb({ worlds: [], chapters: [] })), 'propose_changes', {
      changes: [{ op: 'plan', plan: { kind: 'add_block', title: 'x', time: '12:30' } }],
    });
    expect(r.result.changes).toEqual([]);
    expect(r.result.dropped).toEqual([{ cid: 'c1', reason: 'unknown_op' }]);
  });
});

describe('a todo read for a change', () => {
  it('comes with the day it comes back on, so a later change knows what it was', async () => {
    const db = fakeDb({ 'todos?': [], 'worlds?': [], 'chapters?': [] });
    await runTool(ctxWith(db), 'get_item', { type: 'todo', id: TODO });
    const read = db.asked.find((p) => typeof p === 'string' && p.startsWith('todos?'));
    expect(read).toMatch(/select=[^&]*\bresurface_at\b/);
    expect(read).toMatch(/select=[^&]*\bdue_day\b/);
  });
});

describe('running a tool', () => {
  it('never throws: a failure is plain words for the model, and an unknown tool says so', async () => {
    const broken = { ...fakeDb(), rpc: async () => Promise.reject(new Error('down')) };
    const r = await runTool(ctxWith(broken), 'find_items', { query: 'x' });
    expect(r).toMatchObject({ name: 'find_items', ok: false });
    expect(r.text).toMatch(/did not work just now/);
    expect((await runTool(ctxWith(fakeDb()), 'nope', {})).text).toBe(
      'There is no tool called nope.',
    );
  });

  it('has one tool per name', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});

describe('get_day: a todo with a deadline and no day planned (stage 2c)', () => {
  it('is among the todos on its deadline day, and past its day after', async () => {
    const db = fakeDb({
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.eq.`]: [
        { id: 'r', name: 'Send the report', due_day: null, target_date: TODAY },
      ],
      // put off until today too: it is listed once
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&due_day=is.null&scheduled_date=is.null&resurface_at=eq.`]:
        [{ id: 'r', name: 'Send the report' }],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&or=(due_day.lt.`]: [
        { id: 'old', name: 'Tax form', due_day: '2026-09-29' },
        { id: 'bill', name: 'Pay the bill', due_day: null, target_date: '2026-10-01' },
      ],
      'habits?': [],
      habit_progress: [],
    });
    const r = await runTool(ctxWith(db), 'get_day', {});
    expect(r.text).toContain(
      'Todos for the day: Send the report (id r), due this day by its deadline, no day planned',
    );
    expect(r.text).not.toContain('back on this day');
    expect(r.text).toContain(
      'Past their day: Pay the bill (id bill, was Thu 1 Oct (yesterday), its deadline); Tax form (id old, was Tue 29 Sep)',
    );
    const onDay = db.asked.find((q) => typeof q === 'string' && q.includes('or=(due_day.eq.'));
    expect(onDay).toContain(
      `or=(due_day.eq.${TODAY},and(due_day.is.null,scheduled_date.eq.${TODAY}),and(due_day.is.null,scheduled_date.is.null,target_date.eq.${TODAY}))`,
    );
  });
});

describe('get_day over several days', () => {
  it('reads from date through to, a week at most', () => {
    expect(daysToRead({}, TODAY)).toEqual([TODAY]);
    expect(daysToRead({ date: '2026-10-05', to: '2026-10-07' }, TODAY)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(daysToRead({ date: '2026-10-05', to: '2026-10-30' }, TODAY)).toHaveLength(7);
    expect(daysToRead({ date: '2026-10-05', to: '2026-10-01' }, TODAY)).toEqual(['2026-10-05']);
    // a day that does not exist is no day: today is read, and nothing is counted from it
    expect(daysToRead({ date: '2026-02-30' }, TODAY)).toEqual([TODAY]);
    expect(daysToRead({ date: '2026-10-05', to: '2026-13-01' }, TODAY)).toEqual(['2026-10-05']);
  });

  it('answers a week in one call, reading habits once', async () => {
    const db = fakeDb({
      'todos?owner_id': (path) =>
        path.includes('or=(due_day.eq.2026-10-07')
          ? [{ id: TODO, name: 'Send the deck', due_time: null, time_estimate_minutes: 30 }]
          : [],
      habits: [],
    });
    const r = await runTool(ctxWith(db), 'get_day', { date: '2026-10-05', to: '2026-10-11' });
    expect(r.ok).toBe(true);
    expect(r.result.days.map((d) => d.date)).toHaveLength(7);
    expect(r.text).toContain(`Todos for the day: Send the deck (id ${TODO}), 30 min`);
    expect(r.text.split('\n\n')).toHaveLength(7);
    expect(db.asked.filter((q) => typeof q === 'string' && q.startsWith('habits?'))).toHaveLength(
      1,
    );
  });
});

describe('propose_changes and events', () => {
  it('turns away a kind Gremly does not have with what an event is', async () => {
    const r = await runTool(
      { ...ctxWith(fakeDb({ worlds: [], chapters: [] })), surface: 'brief', day: null },
      'propose_changes',
      {
        changes: [
          {
            op: 'add',
            type: 'event',
            fields: { name: 'Dentist', day: '2026-10-08', time: '10:00' },
          },
        ],
      },
    );
    expect(r.result.dropped).toEqual([{ cid: 'c1', reason: 'unknown_type' }]);
    expect(r.text).toContain('a note with its day and time');
  });

  it('keeps an event as a note with its day and time', async () => {
    const r = await runTool(
      { ...ctxWith(fakeDb({ worlds: [], chapters: [] })), surface: 'brief', day: null },
      'propose_changes',
      {
        changes: [
          {
            op: 'add',
            type: 'note',
            fields: { name: 'Dentist', day: '2026-10-08', time: '10:00' },
          },
        ],
      },
    );
    expect(r.result.changes).toHaveLength(1);
    expect(r.result.changes[0]).toMatchObject({
      op: 'add',
      type: 'note',
      fields: { day: '2026-10-08', time: '10:00' },
    });
  });
});

// ── The week's tools (the weekly review) ────────────────────────────────────

describe("the week's tools", () => {
  // Friday 2 October 2026: the week is Monday 28 September to Sunday 4 October
  const TODO2 = '55555555-5555-4555-8555-555555555555';
  const TODO3 = '66666666-6666-4666-8666-666666666666';
  const week = (over = {}) => ({
    weekly_day: 0,
    days_off: [0, 6],
    review: { week_start: '2026-09-28', span_start: '2026-09-28', status: 'done', kind: 'weekly' },
    extra_used: false,
    blocked: false,
    first: TODAY,
    last: '2026-10-04',
    view_first: '2026-09-28',
    view_last: '2026-10-04',
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    busy_days: ['2026-10-03'],
    intention: null,
    has_review: true,
    under_way: null,
    ...over,
  });
  const weekCtx = (db, over) => ({ ...ctxWith(db), surface: 'brief_week', week: week(over) });
  const rows = {
    todos: [
      { id: TODO, name: 'Dentist', due_day: '2026-10-02', time_estimate_minutes: 60 },
      { id: TODO2, name: 'Call Mum', due_day: '2026-10-02', time_estimate_minutes: null },
      { id: TODO3, name: 'Clear the garage', due_day: null, resurface_at: '2026-10-12' },
    ],
    habits: [{ id: HABIT, name: 'Run', time_estimate_minutes: 45 }],
    plans: [
      { habit_id: HABIT, planned_date: '2026-10-02' },
      { habit_id: HABIT, planned_date: '2026-10-03' },
    ],
  };
  const weekDb = () =>
    fakeDb({
      'todos?': (path) =>
        path.includes('resurface_at=gt.')
          ? rows.todos.filter((t) => t.resurface_at)
          : path.includes('id=in.')
            ? rows.todos.filter((t) => path.includes(t.id))
            : path.includes('due_day=gte.')
              ? rows.todos.filter((t) => t.due_day)
              : [],
      'habits?': rows.habits,
      'habit_plans?': rows.plans,
      'worlds?': [],
      'chapters?': [],
    });

  describe('the declarations', () => {
    it("are apart from every surface's tools, and added by the brief's week variant", () => {
      const general = TOOLS.map((t) => t.name);
      for (const t of WEEK_TOOLS) expect(general).not.toContain(t.name);
      expect(SURFACES.brief.tools).not.toContain('get_week');
      expect(SURFACES.chat.tools).not.toContain('offer_week');
      const s = surfaceOf('brief', 'week');
      expect(s.tools).toEqual([...SURFACES.brief.tools, 'get_week', 'hold', 'offer_week']);
      expect(s.toolSet).toBe('brief_week');
      expect(s.job.startsWith(SURFACES.brief.job)).toBe(true);
      expect(s.job).not.toMatch(/ — | – | - /);
      // a surface without the variant is itself
      expect(surfaceOf('brief')).toBe(SURFACES.brief);
      expect(surfaceOf('brief', 'nothing')).toBe(SURFACES.brief);
      expect(surfaceOf('chat')).toBe(SURFACES.chat);
      expect(surfaceOf('chat', 'nothing')).toBe(SURFACES.chat);
    });

    it("Ask Gremly's week variant adds the week's button alone, with chat's own tools", () => {
      const s = surfaceOf('chat', 'week');
      expect(s.tools).toEqual([...SURFACES.chat.tools, 'offer_week']);
      // no tool set of its own: propose_changes stays chat's, without the week's changes
      expect(s.toolSet).toBeUndefined();
      expect(s.job.startsWith(SURFACES.chat.job)).toBe(true);
      expect(s.job).toContain('offer_week');
      expect(s.job).not.toMatch(/ — | – | - /);
      const names = toolDeclarations(toolsFor(s.tools, 'chat')).map((d) => d.name);
      expect(names).toContain('offer_week');
      expect(names).not.toContain('hold');
      expect(names).not.toContain('get_week');
    });

    it('read as both providers take them, with no dashes in what the model reads', () => {
      const decls = toolDeclarations(toolsFor(surfaceOf('brief', 'week').tools, 'brief_week'));
      for (const d of decls) {
        expect(d.description.length).toBeGreaterThan(80);
        expect(d.parameters.type).toBe('object');
        expect(typeof d.parameters.properties).toBe('object');
        expect(d.description).not.toMatch(/ — | – | - /);
      }
      const change = decls.find((d) => d.name === 'propose_changes').parameters.properties.changes
        .items.properties;
      expect(Object.keys(change)).toEqual(
        expect.arrayContaining(['back_on', 'shape', 'intention', 'milestone', 'weekday', 'plan']),
      );
      expect(change.op.enum).toEqual(expect.arrayContaining(['plan', 'later', 'weekly_day']));
    });

    it('know which tools only tell the app about the reply', () => {
      expect(isSignal('hold')).toBe(true);
      expect(isSignal('offer_week')).toBe(true);
      expect(isSignal('get_week')).toBe(false);
      expect(isSignal('propose_changes')).toBe(false);
      expect(isSignal('nope')).toBe(false);
    });
  });

  describe('get_week', () => {
    it('counts each day: what is on it, the kind of day, and the room left', () => {
      const b = boardOf({
        days: ['2026-10-01', '2026-10-02', '2026-10-03'],
        today: TODAY,
        todos: rows.todos,
        habits: rows.habits,
        plans: rows.plans,
        week: week(),
      });
      expect(b.days[0]).toMatchObject({
        day: '2026-10-01',
        past: true,
        kind: 'normal_day',
        todos: [],
      });
      // a todo with no length counts as thirty minutes: 60 + 30 + the run's 45
      expect(b.days[1]).toMatchObject({
        kind: 'normal_day',
        past: false,
        room: { minutes: 120, placed: 135, left: -15 },
      });
      expect(b.days[1].todos.map((t) => t.title)).toEqual(['Dentist', 'Call Mum']);
      expect(b.days[1].habits).toEqual([{ id: HABIT, title: 'Run', minutes: 45 }]);
      // a busy day wins over a day off
      expect(b.days[2]).toMatchObject({
        kind: 'busy_day',
        room: { minutes: 60, placed: 45, left: 15 },
      });
      expect(b.later).toEqual([{ id: TODO3, title: 'Clear the garage', back_on: '2026-10-12' }]);
    });

    it('keeps a todo with a day on its day, even when it also has a day it came back on', () => {
      // the wrap up's own Later writes the day and the back day together
      const sent = {
        id: TODO3,
        name: 'Clear the garage',
        due_day: '2026-10-03',
        resurface_at: '2026-10-03',
      };
      const b = boardOf({
        days: ['2026-10-02', '2026-10-03'],
        today: TODAY,
        todos: [sent],
        habits: [],
        plans: [],
        week: week(),
      });
      expect(b.days[1].todos.map((t) => t.title)).toEqual(['Clear the garage']);
      expect(b.days[1].room.placed).toBe(30);
      expect(b.later).toEqual([]);
    });

    it('leaves a habit off a day it is paused on, whatever was planned for it', () => {
      const days = ['2026-10-02', '2026-10-03'];
      const plans = days.map((d) => ({ habit_id: HABIT, planned_date: d }));
      const eased = [
        { habit_id: HABIT, title: 'Run', mode: 'pause', first: '2026-10-03', last: '2026-10-09' },
      ];
      const b = boardOf({
        days,
        today: TODAY,
        todos: [],
        habits: rows.habits,
        plans,
        week: week({ eased }),
      });
      expect(b.days[0].habits.map((h) => h.id)).toEqual([HABIT]);
      expect(b.days[1].habits).toEqual([]);
      expect(b.days[1].room.placed).toBe(0);
      // a lighter version stays on its days
      const lighter = boardOf({
        days,
        today: TODAY,
        todos: [],
        habits: rows.habits,
        plans,
        week: week({ eased: [{ ...eased[0], mode: 'lighter' }] }),
      });
      expect(lighter.days[1].habits.map((h) => h.id)).toEqual([HABIT]);
    });

    it("lays the review's working board over what is saved", () => {
      const b = boardOf({
        days: ['2026-10-02', '2026-10-03'],
        today: TODAY,
        todos: rows.todos,
        habits: rows.habits,
        plans: rows.plans,
        week: week({
          under_way: {
            step: 'board',
            placed: [
              { id: TODO2, day: '2026-10-03' },
              { id: TODO3, day: '2026-10-02' },
            ],
            later: [{ id: TODO, back_on: '2026-10-20' }],
            habit_days: [{ id: HABIT, days: ['2026-10-03'] }],
          },
        }),
      });
      expect(b.days[0].todos.map((t) => t.title)).toEqual(['Clear the garage']);
      expect(b.days[0].habits).toEqual([]);
      expect(b.days[1].todos.map((t) => t.title)).toEqual(['Call Mum']);
      expect(b.days[1].habits.map((h) => h.title)).toEqual(['Run']);
      expect(b.later).toEqual([{ id: TODO, title: 'Dentist', back_on: '2026-10-20' }]);
    });

    it('says what is on their calendar each day, so nothing on it is added a second time', async () => {
      // Friday 2 October in Los Angeles: a timed entry, a cancelled one and a whole day one
      const synced = [
        {
          id: 'c1',
          title: 'Stock audit kickoff',
          start_at: '2026-10-02T17:00:00Z',
          end_at: '2026-10-02T19:00:00Z',
          is_all_day: false,
        },
        {
          id: 'c2',
          title: 'Cancelled: Supplier call',
          start_at: '2026-10-02T21:00:00Z',
          end_at: '2026-10-02T22:00:00Z',
          is_all_day: false,
        },
        {
          id: 'c3',
          title: 'Trade fair',
          start_at: '2026-10-03T00:00:00Z',
          end_at: '2026-10-04T00:00:00Z',
          is_all_day: true,
        },
      ];
      const routes = {
        'todos?': [],
        'habits?': rows.habits,
        'habit_plans?': [],
        'synced_calendar_events?': (path) =>
          path.includes('is_all_day=eq.true') ? synced.filter((e) => e.is_all_day) : synced,
      };
      const r = await runTool(weekCtx(fakeDb(routes)), 'get_week', {});
      expect(r.result.calendar.find((c) => c.day === '2026-10-02')).toEqual({
        day: '2026-10-02',
        meetings: [{ title: 'Stock audit kickoff', start: 600, end: 720 }],
        all_day: [],
      });
      expect(r.text).toContain('  On their calendar: 10:00am to 12:00pm Stock audit kickoff');
      expect(r.text).toContain('  On their calendar: all day Trade fair');
      expect(r.text).not.toContain('Supplier call');
      // a day with nothing on the calendar says nothing of it
      expect(calendarOf(['2026-10-01'], { timed: [], allDay: [], long: [] }, 'UTC')).toEqual([
        { day: '2026-10-01', meetings: [], all_day: [] },
      ]);
      // a calendar that cannot be read leaves the week told without it
      const broken = fakeDb({
        ...routes,
        'synced_calendar_events?': () => {
          throw new Error('offline');
        },
      });
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const without = await runTool(weekCtx(broken), 'get_week', {});
      expect(without.ok).toBe(true);
      expect(without.result.calendar).toEqual([]);
      expect(without.text).not.toContain('On their calendar');
    });

    it('says hours the way the board does', () => {
      expect(hoursWords(120)).toBe('2 hr');
      expect(hoursWords(90)).toBe('1 hr 30 min');
      expect(hoursWords(30)).toBe('30 min');
      expect(hoursWords(0)).toBe('none');
      expect(hoursWords(-15)).toBe('15 min');
      expect(hoursWords(null)).toBe('');
    });

    it('reads the week in one go and hands it over in words, with ids', async () => {
      const db = weekDb();
      const r = await runTool(weekCtx(db), 'get_week', {});
      expect(r.ok).toBe(true);
      expect(db.asked.filter((p) => typeof p === 'string' && p.startsWith('todos?'))).toHaveLength(
        2,
      );
      expect(
        db.asked.some((p) => String(p).includes('due_day=gte.2026-09-28&due_day=lte.2026-10-04')),
      ).toBe(true);
      expect(r.text).toContain('THEIR WEEK, Mon 28 Sep to Sun 4 Oct');
      expect(r.text).toContain(
        'Hours free for their own things: 2 hr on a normal day, 1 hr on a busy day, 4 hr on a day off.',
      );
      expect(r.text).toContain(
        'Thu 1 Oct (yesterday) (gone), normal day, 2 hr free, none placed, 2 hr left',
      );
      expect(r.text).toContain(
        'Fri 2 Oct (today), normal day, 2 hr free, 2 hr 15 min placed, over by 15 min',
      );
      expect(r.text).toContain(
        `  Todos: Dentist (id ${TODO}), 60 min; Call Mum (id ${TODO2}), 30 min`,
      );
      expect(r.text).toContain(`  Habits planned: Run (id ${HABIT}), 45 min`);
      expect(r.text).toContain(
        'Sat 3 Oct (tomorrow), busy day, 1 hr free, 45 min placed, 15 min left',
      );
      expect(r.text).toContain(
        `Put off for later, with the day each comes back: Clear the garage (id ${TODO3}) back Mon 12 Oct`,
      );
      expect(r.text).not.toContain('nothing on the board is saved');
    });

    it('says the board is not saved while a review is under way, and reads the todos it names', async () => {
      const db = weekDb();
      const r = await runTool(
        weekCtx(db, {
          view_first: TODAY,
          under_way: { step: 'board', placed: [{ id: TODO3, day: '2026-10-04' }], later: [] },
        }),
        'get_week',
        {},
      );
      expect(db.asked.some((p) => String(p).includes(`id=in.(${TODO3})`))).toBe(true);
      expect(r.text).toContain(
        'as the review has it now; nothing on the board is saved until they finish',
      );
      expect(r.text).toContain(`Clear the garage (id ${TODO3}), 30 min`);
      expect(r.text).toContain('Put off for later: nothing');
    });

    it('reads the todos a long board names in batches, never in one request too long to send', async () => {
      const db = weekDb();
      const many = Array.from({ length: 200 }, (_, i) => ({
        id: `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`,
        day: TODAY,
      }));
      const r = await runTool(
        weekCtx(db, { under_way: { step: 'board', placed: many, later: [] } }),
        'get_week',
        {},
      );
      expect(r.ok).toBe(true);
      const reads = db.asked.filter((p) => typeof p === 'string' && p.includes('id=in.('));
      expect(reads).toHaveLength(3);
      for (const read of reads) expect(read.length).toBeLessThan(4000);
    });

    it('works out no room when the week has no hours yet, and says so', async () => {
      const r = await runTool(weekCtx(weekDb(), { hours: null }), 'get_week', {});
      expect(r.text).toContain(
        'No free hours are set for this week yet, so no room is worked out.',
      );
      expect(r.text).toContain('Fri 2 Oct (today), normal day, 2 hr 15 min placed');
    });

    it('says so when the week is not known', async () => {
      const r = await runTool(ctxWith(weekDb()), 'get_week', {});
      expect(r.text).toBe('Their week is not known here.');
    });
  });

  describe('hold and offer_week', () => {
    it('hold keeps the review waiting on a question, only while one is under way', async () => {
      const on = await runTool(weekCtx(fakeDb(), { under_way: { step: 'shape' } }), 'hold', {
        question: '  How many   hours do you have? ',
      });
      expect(on.result).toEqual({ signal: { hold: { question: 'How many hours do you have?' } } });
      expect(on.text).toBe('The review stays on this step until they answer.');
      for (const under of [null, { step: 'done' }]) {
        const off = await runTool(weekCtx(fakeDb(), { under_way: under }), 'hold', {
          question: 'Which day?',
        });
        expect(off.result.signal).toBeNull();
        expect(off.text).toContain('nothing to hold');
      }
    });

    it('hold with no question waits on nothing, and says so', async () => {
      const r = await runTool(weekCtx(fakeDb(), { under_way: { step: 'shape' } }), 'hold', {});
      expect(r.result).toEqual({ signal: null, why: 'no_question' });
      expect(r.text).toContain('There is no question to wait on, so nothing is held.');
    });

    it("offer_week puts the week's button, and says what it will read", async () => {
      const planned = await runTool(weekCtx(fakeDb()), 'offer_week', {});
      expect(planned.result).toMatchObject({
        signal: { offer: { kind: 'week', done: true } },
        more: false,
      });
      expect(planned.text).toContain('It reads Your week');
      // Friday, out of their weekly window, with the one extra still free
      expect(planned.result.again).toBe(true);
      expect(planned.text).toContain('the rest of this week can also be planned again');
      // on their weekly day and the two days after, the week they planned is all it opens
      const inWindow = await runTool(
        { ...weekCtx(fakeDb()), today: '2026-09-28' },
        'offer_week',
        {},
      );
      expect(inWindow.result.again).toBe(false);
      expect(inWindow.text).not.toContain('planned again');
      const not = await runTool(weekCtx(fakeDb(), { review: null }), 'offer_week', {});
      expect(not.result.signal).toEqual({ offer: { kind: 'week', done: false } });
      expect(not.text).toContain('It reads Plan your week');
      expect((await runTool(ctxWith(fakeDb()), 'offer_week', {})).result.signal).toBeNull();
    });

    it('offer_week has more to say when no review can be started today', async () => {
      const r = await runTool(
        weekCtx(fakeDb(), { blocked: true, extra_used: true }),
        'offer_week',
        {},
      );
      expect(r.result).toMatchObject({ more: true, move_to: 5, again: false });
      expect(r.text).toContain('It reads Your week');
      expect(r.text).not.toContain('planned again');
      expect(r.text).toContain('It cannot start another review today');
      expect(r.text).toContain('put the move of their weekly day to Friday on the card');
    });

    it('offer_week offers no move of the weekly day from Ask Gremly, where the card cannot make it', async () => {
      const r = await runTool(
        { ...weekCtx(fakeDb(), { blocked: true, extra_used: true }), surface: 'chat' },
        'offer_week',
        {},
      );
      expect(r.result).toMatchObject({ more: true, move_to: null });
      expect(r.text).toContain('It cannot start another review today');
      expect(r.text).toContain('say so plainly with when the next one is');
      expect(r.text).not.toContain('move of their weekly day');
    });

    it('offer_week does not suggest moving the weekly day to the day it is already on', async () => {
      // Friday is their weekly day, and no review can be started today
      const r = await runTool(
        weekCtx(fakeDb(), { blocked: true, extra_used: true, weekly_day: 5 }),
        'offer_week',
        {},
      );
      expect(r.result).toMatchObject({ more: true, move_to: null });
      expect(r.text).toContain('It cannot start another review today');
      expect(r.text).not.toContain('move of their weekly day');
    });

    it('offer_week reads Plan your week while a review is under way, whatever its row says', async () => {
      const r = await runTool(
        weekCtx(fakeDb(), { under_way: { step: 'board' } }),
        'offer_week',
        {},
      );
      expect(r.result.signal.offer.done).toBe(false);
      expect(r.text).toContain('It reads Plan your week');
    });
  });

  describe("propose_changes with the week's own changes", () => {
    const db = () =>
      fakeDb({
        'todos?': (path) =>
          path.includes(TODO)
            ? [{ id: TODO, name: 'Dentist', due_day: '2026-10-02', archived: false, views: {} }]
            : [],
        'habits?': [
          { id: HABIT, name: 'Run', cadence: 'weekly', target_per_period: 3, archived: false },
        ],
        habit_progress: [],
        'habit_plans?': [{ habit_id: HABIT, planned_date: '2026-10-02' }],
        drop_world_links: [],
        drop_chapter_links: [],
        'worlds?': [],
        'chapters?': [],
      });

    it('turns the tool shape into the change model, naming the kind of item itself', () => {
      expect(toWeekChange({ op: 'later', id: TODO, back_on: '2026-10-12' }, 0)).toEqual({
        cid: 'c1',
        op: 'later',
        type: 'todo',
        id: TODO,
        back_on: '2026-10-12',
      });
      expect(toWeekChange({ op: 'habit_days', id: HABIT, days: [TODAY] }, 1)).toEqual({
        cid: 'c2',
        op: 'habit_days',
        type: 'habit',
        id: HABIT,
        days: [TODAY],
      });
      expect(toWeekChange({ op: 'weekly_day', weekday: 3 }, 2)).toEqual({
        cid: 'c3',
        op: 'weekly_day',
        type: null,
        weekday: 3,
      });
    });

    it('gives the checks the week as it stands', () => {
      expect(weekCheckOf(week())).toEqual({
        first: TODAY,
        last: '2026-10-04',
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: ['2026-10-03'],
        has_review: true,
        intention: null,
        // this build did not say what matters most now: a new priority is never put to it
        priorities: null,
        weekly_day: 0,
      });
      expect(weekCheckOf({ ...week(), priorities: ['Finish the grant'] }).priorities).toEqual([
        'Finish the grant',
      ]);
      expect(weekCheckOf(null)).toBeNull();
    });

    it('adds something to what matters most, for an app build that can keep it', async () => {
      const can = weekCtx(db());
      can.week = { ...can.week, priorities: ['Finish the grant'] };
      const r = await runTool(can, 'propose_changes', {
        changes: [{ op: 'priority', priority: 'The stock audit' }],
      });
      expect(r.result.changes).toEqual([
        expect.objectContaining({
          op: 'priority',
          title: 'The stock audit',
          fields: { text: 'The stock audit' },
          before: { priorities: ['Finish the grant'] },
        }),
      ]);
      expect(r.text).toContain('priority: “The stock audit” added to what matters most this week');
      // a build that cannot keep one: dropped, with what to say instead
      const old = await runTool(weekCtx(db()), 'propose_changes', {
        changes: [{ op: 'priority', priority: 'The stock audit' }],
      });
      expect(old.result.changes).toEqual([]);
      expect(old.result.dropped).toEqual([{ cid: 'c1', reason: 'no_priorities' }]);
      expect(old.text).toContain('their app cannot keep a new priority from here yet');
      // and a week that already holds as many as it keeps
      const full = weekCtx(db());
      full.week = { ...full.week, priorities: ['One', 'Two', 'Three'] };
      const over = await runTool(full, 'propose_changes', {
        changes: [{ op: 'priority', priority: 'A fourth' }],
      });
      expect(over.result.dropped).toEqual([{ cid: 'c1', reason: 'priorities_full' }]);
      expect(over.text).toContain('ask which one this should take the place of');
    });

    it('checks each against the week and the item, and says each in words', async () => {
      const d = db();
      const r = await runTool(weekCtx(d), 'propose_changes', {
        changes: [
          { op: 'later', type: 'todo', id: TODO, back_on: '2026-10-12' },
          { op: 'habit_days', type: 'habit', id: HABIT, days: ['2026-10-03', '2026-10-04'] },
          { op: 'week_shape', shape: { busy_days: [], hours: { normal_day: 1.5 } } },
          { op: 'intention', intention: 'One thing at a time' },
          {
            op: 'milestone',
            milestone: {
              goal: 'Conference talk',
              date: '2026-10-20',
              steps: [
                { title: 'Outline', by: '2026-10-06', minutes: 45, kind: 'todo' },
                { title: 'How is it going?', by: '2026-10-12', kind: 'check_in' },
              ],
            },
          },
          { op: 'weekly_day', weekday: 3 },
        ],
      });
      expect(r.result.dropped).toEqual([]);
      expect(r.result.changes.map((c) => c.op)).toEqual([
        'later',
        'habit_days',
        'week_shape',
        'intention',
        'milestone',
        'weekly_day',
      ]);
      // the habit's days now come from the days saved for the week
      expect(
        d.asked.some((p) => String(p).startsWith('habit_plans?') && String(p).includes(HABIT)),
      ).toBe(true);
      expect(r.result.changes[1].before).toEqual({ days: ['2026-10-02'] });
      expect(r.text).toContain('- c1 later todo “Dentist”: comes back Mon 12 Oct');
      expect(r.text).toContain(
        '- c2 habit_days habit “Run”: planned on Sat 3 Oct (tomorrow), Sun 4 Oct',
      );
      expect(r.text).toContain('- c3 week_shape: no busy days; free hours 1.5 on a normal day');
      expect(r.text).toContain('- c4 intention: “One thing at a time”');
      expect(r.text).toContain('- c5 milestone “Conference talk” for Tue 20 Oct: 2 steps');
      expect(r.text).toContain('- c6 weekly_day: Wednesday');
    });

    it('knows when a todo is already put off, and until when', async () => {
      const put = fakeDb({
        'todos?': [
          { id: TODO, name: 'Dentist', due_day: null, resurface_at: '2026-10-12', archived: false },
        ],
        drop_world_links: [],
        drop_chapter_links: [],
        'worlds?': [],
        'chapters?': [],
      });
      const moved = await runTool(weekCtx(put), 'propose_changes', {
        changes: [{ op: 'later', type: 'todo', id: TODO, back_on: '2026-10-19' }],
      });
      expect(moved.result.changes[0].before).toEqual({ back_on: '2026-10-12', day: null });
      const same = await runTool(weekCtx(put), 'propose_changes', {
        changes: [{ op: 'later', type: 'todo', id: TODO, back_on: '2026-10-12' }],
      });
      expect(same.result.dropped).toEqual([{ cid: 'c1', reason: 'no_change' }]);
    });

    it("reads a habit's days from the review while one is under way, not from what is saved", async () => {
      const d = db();
      const r = await runTool(
        weekCtx(d, {
          under_way: { step: 'board', habit_days: [{ id: HABIT, days: ['2026-10-03'] }] },
        }),
        'propose_changes',
        { changes: [{ op: 'habit_days', id: HABIT, days: ['2026-10-03'] }] },
      );
      expect(d.asked.some((p) => String(p).startsWith('habit_plans?'))).toBe(false);
      expect(r.result.dropped).toEqual([{ cid: 'c1', reason: 'no_change' }]);
    });

    it('says why one was dropped, in words the model can act on', async () => {
      const r = await runTool(weekCtx(db(), { has_review: false }), 'propose_changes', {
        changes: [
          { op: 'later', type: 'todo', id: TODO, back_on: TODAY },
          { op: 'later', type: 'todo', id: TODO, back_on: '2027-01-01' },
          { op: 'habit_days', type: 'habit', id: HABIT, days: ['2026-10-09'] },
          { op: 'week_shape', shape: { busy_days: [] } },
          { op: 'week_shape', shape: { hours: { normal_day: 40 } } },
          { op: 'weekly_day', weekday: 9 },
          { op: 'intention', intention: '' },
        ],
      });
      expect(r.result.changes).toEqual([]);
      expect(r.text).toContain('- c1: a todo put off comes back on a day still to come');
      expect(r.text).toContain('- c2: a todo put off comes back within four weeks');
      expect(r.text).toContain('- c3: that day is outside the days these changes act on');
      expect(r.text).toContain('- c4: their week has no review to keep that on yet');
      expect(r.text).toContain('- c6: weekday is a whole number, 0 Sunday to 6 Saturday');
      expect(r.text).toContain('- c7: the intention is one short line');
    });

    it('a todo put off leaves the plan on screen, so the card needs only that row', async () => {
      const day = {
        date: TODAY,
        now: 600,
        plan: {
          status: 'proposal',
          items: [{ id: TODO, kind: 'todo', title: 'Dentist', start: 710, end: 770 }],
        },
        blocks: [],
        items: new Map([[TODO, { id: TODO, kind: 'todo', title: 'Dentist', minutes: 60 }]]),
      };
      const r = await runTool({ ...weekCtx(db()), day }, 'propose_changes', {
        changes: [
          { op: 'later', type: 'todo', id: TODO, back_on: '2026-10-12' },
          { op: 'plan', plan: { kind: 'plan_remove', id: TODO } },
        ],
      });
      expect(r.result.changes.map((c) => c.op)).toEqual(['later']);
      expect(r.result.dropped).toEqual([{ cid: 'c2', reason: 'covered' }]);
    });

    it('are not operations anywhere the week was not sent', async () => {
      for (const surface of [undefined, 'brief']) {
        const r = await runTool({ ...ctxWith(db()), surface }, 'propose_changes', {
          changes: [{ op: 'later', type: 'todo', id: TODO, back_on: '2026-10-12' }],
        });
        expect(r.result.changes).toEqual([]);
        expect(r.result.dropped).toEqual([{ cid: 'c1', reason: 'unknown_op' }]);
      }
    });
  });
});

describe('a habit paused, given a lighter version, or set back to usual', () => {
  // Friday 2 October 2026; their weekly day is Sunday, so their week ends on the 4th
  const eased = (list = []) => ({
    weekly_day: 0,
    first: TODAY,
    last: '2026-10-04',
    view_first: '2026-09-28',
    view_last: '2026-10-04',
    hours: null,
    busy_days: [],
    intention: null,
    has_review: false,
    under_way: null,
    eased: list,
  });
  const db = (habit = {}) =>
    fakeDb({
      'habits?': [
        {
          id: HABIT,
          name: 'Run',
          cadence: 'weekly',
          target_per_period: 3,
          archived: false,
          ...habit,
        },
      ],
      habit_progress: [],
      'habit_plans?': [],
      drop_world_links: [],
      drop_chapter_links: [],
      'worlds?': [],
      'chapters?': [],
    });
  const chatCtx = (d, list) => ({ ...ctxWith(d), surface: 'chat_ease', week: eased(list) });

  describe('the declarations', () => {
    it('are a twin of each week variant, for a build that said what is eased now', () => {
      const brief = surfaceOf('brief', 'week_ease');
      expect(brief.toolSet).toBe('brief_week_ease');
      expect(brief.tools).toEqual(surfaceOf('brief', 'week').tools);
      expect(brief.job).toBe(surfaceOf('brief', 'week').job);
      const chat = surfaceOf('chat', 'week_ease');
      expect(chat.toolSet).toBe('chat_ease');
      expect(chat.tools).toEqual(surfaceOf('chat', 'week').tools);
      expect(chat.job).toBe(surfaceOf('chat', 'week').job);
    });

    it('offer ease only on those twins, and say what it is with no dashes', () => {
      const opsOf = (tools, set) =>
        toolDeclarations(toolsFor(tools, set)).find((d) => d.name === 'propose_changes');
      for (const [name, variant, set] of [
        ['brief', 'week_ease', 'brief_week_ease'],
        ['chat', 'week_ease', 'chat_ease'],
      ]) {
        const d = opsOf(surfaceOf(name, variant).tools, set);
        const change = d.parameters.properties.changes.items.properties;
        expect(change.op.enum).toContain('ease');
        expect(change.ease.properties.mode.enum).toEqual(['pause', 'lighter', 'usual']);
        expect(change.ease.required).toEqual(['mode']);
        // what it is is said on the change's own field, with no dashes
        expect(change.ease.description).toContain('paused for a stretch of days');
        expect(change.ease.description).not.toMatch(/ — | – | - /);
        // and the tool says of itself only what it says without it
        const plain = opsOf(surfaceOf(name, 'week').tools, name === 'chat' ? 'chat' : 'brief_week');
        expect(d.description).toBe(plain.description);
      }
      // every other tool set is as it was: a build that cannot apply it is never offered it
      for (const [tools, set] of [
        [SURFACES.chat.tools, 'chat'],
        [surfaceOf('chat', 'week').tools, 'chat'],
        [SURFACES.brief.tools, 'brief'],
        [surfaceOf('brief', 'week').tools, 'brief_week'],
      ]) {
        const d = opsOf(tools, set);
        const change = d.parameters.properties.changes.items.properties;
        expect(change.op.enum).not.toContain('ease');
        expect(change.ease).toBeUndefined();
      }
      // in chat it is set apart from skipping today and archiving; in today's thread from the week's days too
      const fieldOf = (d) => d.parameters.properties.changes.items.properties.ease.description;
      const chat = fieldOf(opsOf(surfaceOf('chat', 'week_ease').tools, 'chat_ease'));
      expect(chat).toContain('skip_today');
      expect(chat).not.toContain('habit_days');
      const brief = fieldOf(opsOf(surfaceOf('brief', 'week_ease').tools, 'brief_week_ease'));
      expect(brief).toContain('moving its days inside this week is habit_days');
    });

    it('still move the weekly day on the card in today’s thread', async () => {
      const blocked = { ...eased(), blocked: true, extra_used: true, review: null };
      const r = await runTool(
        { ...ctxWith(fakeDb()), surface: 'brief_week_ease', week: blocked },
        'offer_week',
        {},
      );
      // Friday, with a Sunday weekly day
      expect(r.result.move_to).toBe(5);
      const chat = await runTool(
        { ...ctxWith(fakeDb()), surface: 'chat_ease', week: blocked },
        'offer_week',
        {},
      );
      expect(chat.result.move_to).toBeNull();
    });
  });

  it('turns the tool shape into the change model, naming the kind of item itself', () => {
    expect(toEaseChange({ op: 'ease', id: HABIT, ease: { mode: 'pause' } }, 0)).toEqual({
      cid: 'c1',
      op: 'ease',
      type: 'habit',
      id: HABIT,
      ease: { mode: 'pause' },
    });
  });

  it('gives the checks their weekly day and what is eased now, as rows', () => {
    const list = [
      {
        habit_id: HABIT,
        title: 'Run',
        mode: 'lighter',
        first: TODAY,
        last: '2026-10-04',
        note: 'Walk',
      },
    ];
    expect(easeCheckOf(eased(list))).toEqual({
      weekly_day: 0,
      rows: [
        {
          id: null,
          habit_id: HABIT,
          mode: 'floor',
          period_start: TODAY,
          period_end: '2026-10-04',
          floor_note: 'Walk',
        },
      ],
      span: null,
    });
    // in the weekly review, the days being planned are what a stretch with no days runs over
    const planning = { ...eased(), under_way: { first: '2026-10-05', last: '2026-10-11' } };
    expect(easeCheckOf(planning).span).toEqual({ first: '2026-10-05', last: '2026-10-11' });
    // a build that did not say what is eased cannot be given the change
    expect(easeCheckOf({ ...eased(), eased: null })).toBeNull();
    expect(easeCheckOf(null)).toBeNull();
  });

  it('puts a pause on the card to the end of their week, and says it in words', async () => {
    const r = await runTool(chatCtx(db(), []), 'propose_changes', {
      changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause' } }],
    });
    expect(r.ok).toBe(true);
    expect(r.result.dropped).toEqual([]);
    expect(r.result.changes).toEqual([
      {
        cid: 'c1',
        op: 'ease',
        type: 'habit',
        id: HABIT,
        title: 'Run',
        ease: { mode: 'pause', first: TODAY, last: '2026-10-04', note: '' },
        before: { eases: [] },
      },
    ]);
    expect(r.text).toContain('c1 ease habit “Run”: paused Fri 2 Oct (today) to Sun 4 Oct');
  });

  it('says a lighter version with their words, or the smallest version saved on the habit', async () => {
    const said = await runTool(chatCtx(db(), []), 'propose_changes', {
      changes: [
        {
          op: 'ease',
          type: 'habit',
          id: HABIT,
          ease: { mode: 'lighter', until: '2026-10-09', note: 'A walk round the block' },
        },
      ],
    });
    expect(said.result.changes[0].ease).toEqual({
      mode: 'lighter',
      first: TODAY,
      last: '2026-10-09',
      note: 'A walk round the block',
    });
    expect(said.text).toContain(
      'lighter version Fri 2 Oct (today) to Fri 9 Oct, “A walk round the block”',
    );
    const saved = await runTool(chatCtx(db({ floor_note: 'One lap' }), []), 'propose_changes', {
      changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'lighter' } }],
    });
    expect(saved.result.changes[0].ease.note).toBe('One lap');
  });

  it('ends what is running with usual, and drops what is already so with the reason', async () => {
    const running = [
      { habit_id: HABIT, title: 'Run', mode: 'pause', first: TODAY, last: '2026-10-04', note: '' },
    ];
    const usual = await runTool(chatCtx(db(), running), 'propose_changes', {
      changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'usual' } }],
    });
    expect(usual.result.changes[0]).toMatchObject({
      ease: { mode: 'usual', first: TODAY, last: '2026-10-04' },
      before: { eases: [{ mode: 'pause', first: TODAY, last: '2026-10-04', note: '' }] },
    });
    expect(usual.text).toContain(
      'back to usual from Fri 2 Oct (today), ending what runs to Sun 4 Oct',
    );
    const same = await runTool(chatCtx(db(), running), 'propose_changes', {
      changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause' } }],
    });
    expect(same.result.changes).toEqual([]);
    expect(same.text).toContain('it is already that way on every one of those days');
    const far = await runTool(chatCtx(db(), []), 'propose_changes', {
      changes: [
        { op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause', until: '2026-12-01' } },
      ],
    });
    expect(far.text).toContain('ends within four weeks of today');
    const breaking = await runTool(chatCtx(db({ subtype: 'break_habit' }), []), 'propose_changes', {
      changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause' } }],
    });
    expect(breaking.text).toContain('a habit they are breaking is not paused or made lighter');
  });

  it('is not a change the other tool sets can make, even when asked for by name', async () => {
    for (const surface of ['chat', 'brief', 'brief_week']) {
      const r = await runTool({ ...ctxWith(db()), surface, week: eased([]) }, 'propose_changes', {
        changes: [{ op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause' } }],
      });
      expect(r.result.changes).toEqual([]);
      expect(r.result.dropped).toEqual([{ cid: 'c1', reason: 'unknown_op' }]);
    }
  });

  it('a pause from today covers the habit in today’s plan, so the card needs one row', async () => {
    const day = {
      now: 600,
      plan: { items: [{ id: HABIT, kind: 'habit', title: 'Run', start: 700 }] },
      blocks: [],
      items: new Map([[HABIT, { id: HABIT, kind: 'habit', title: 'Run', minutes: 30 }]]),
    };
    const r = await runTool(
      { ...ctxWith(db()), surface: 'brief_week_ease', week: eased([]), day },
      'propose_changes',
      {
        changes: [
          { op: 'ease', type: 'habit', id: HABIT, ease: { mode: 'pause' } },
          { op: 'plan', plan: { kind: 'plan_remove', id: HABIT } },
        ],
      },
    );
    expect(r.result.changes.map((c) => c.op)).toEqual(['ease']);
    expect(r.result.dropped).toEqual([{ cid: 'c2', reason: 'covered' }]);
  });

  describe('get_day', () => {
    const run = { id: HABIT, name: 'Run', cadence: 'weekly', target_per_period: 3 };

    it('counts a week in their own week', () => {
      // Friday 2 October. Sunday person: Monday 28 to Sunday 4. Wednesday person: Thursday 1 to Wednesday 7
      const logged = ['2026-09-28', '2026-09-30', '2026-10-01'];
      expect(habitOnDay(run, TODAY, logged)).toMatchObject({
        progress: '3 of 3 this week',
        met: true,
      });
      expect(habitOnDay(run, TODAY, logged, false, 3)).toMatchObject({
        progress: '1 of 3 this week',
        met: false,
      });
    });

    it('leaves a paused habit off the day, and says a lighter version', () => {
      const pause = { mode: 'pause', first: TODAY, last: '2026-10-04', note: '' };
      expect(habitOnDay(run, TODAY, [], false, 0, pause)).toBeNull();
      const lighter = { mode: 'lighter', first: TODAY, last: '2026-10-04', note: 'Walk' };
      expect(habitOnDay(run, TODAY, [], false, 0, lighter)).toMatchObject({
        progress: '0 of 3 this week',
        lighter: 'Walk',
      });
      expect(habitOnDay(run, TODAY, [], false, 0, null).lighter).toBeUndefined();
    });

    it('reads them from what the thread sent', async () => {
      const d = fakeDb({
        'habits?': [run, { id: NOTE, name: 'Swim', cadence: 'daily' }],
        habit_progress: [],
        'habit_plans?': [],
      });
      const list = [
        {
          habit_id: HABIT,
          title: 'Run',
          mode: 'lighter',
          first: TODAY,
          last: '2026-10-04',
          note: 'Walk',
        },
        {
          habit_id: NOTE,
          title: 'Swim',
          mode: 'pause',
          first: TODAY,
          last: '2026-10-04',
          note: '',
        },
      ];
      const r = await runTool(chatCtx(d, list), 'get_day', {});
      expect(r.text).toContain('Run');
      expect(r.text).toContain(', lighter version for now: “Walk”');
      expect(r.text).not.toContain('Swim');
    });
  });
});
