/**
 * @jest-environment node
 */
// The agent's tools (workers/cortex/agent/tools): what each one asks the
// database, what it hands the model, and that a failing tool never stops a
// turn.

import { TOOLS, runTool, toolDeclarations, toolsFor } from '../tools/index.js';
import { daysToRead, habitOnDay } from '../tools/getDay.js';
import { fieldListWords, readPlanRow, toModelChange } from '../tools/proposeChanges.js';

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
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&due_day=eq.`]: [
        { id: TODO, name: 'Call Mum', due_time: '12:00:00', time_estimate_minutes: 15 },
      ],
      [`todos?owner_id=eq.${USER}&completed_at=is.null&archived=eq.false&due_day=lt.`]: [
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
        recall_life: [
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
  });

  it('answers a week in one call, reading habits once', async () => {
    const db = fakeDb({
      'todos?owner_id': (path) =>
        path.includes('due_day=eq.2026-10-07')
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
