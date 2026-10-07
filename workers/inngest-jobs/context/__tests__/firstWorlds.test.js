/**
 * @jest-environment node
 *
 * First Worlds (workers/inngest-jobs/context/firstWorlds.js, data fabric stage
 * 4b): code decides when, the model names one to five Worlds with a Gremly and
 * the records each rests on, and code checks every ref and slug before it
 * writes them, once.
 */
import {
  firstWorldsDue,
  decideFirstWorlds,
  firstWorldsRequest,
  makeFirstWorlds,
  handleFirstWorldsApi,
  firstWorldsEvents,
  FIRST_WORLDS_SOURCE,
  MADE_KIND,
  TRIED_KIND,
} from '../firstWorlds.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';
import { PLAIN_GREMLY, GREMLY_SLUGS } from '../../../shared/gremlys.js';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  userTimezone: async () => 'Europe/London',
  personIdentity: async () => ({ first_name: 'Robin', pronouns: null, identity: {} }),
}));
jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));

const base = {
  hasWorlds: false,
  made: false,
  lastTry: null,
  drops: 1,
  firstDropDay: '2026-10-07',
  today: '2026-10-07',
};

describe('when first Worlds are due', () => {
  it('at 5 drops, or on the third day with any drop, whichever comes first', () => {
    expect(firstWorldsDue({ ...base, drops: 4 })).toMatchObject({ due: false, day: 1 });
    expect(firstWorldsDue({ ...base, drops: 5 })).toMatchObject({ due: true, why: '5 drops' });
    expect(firstWorldsDue({ ...base, today: '2026-10-08' })).toMatchObject({ due: false, day: 2 });
    expect(firstWorldsDue({ ...base, today: '2026-10-09' })).toMatchObject({
      due: true,
      why: 'day 3',
    });
  });

  it('for a returning person with none, at once', () => {
    expect(firstWorldsDue({ ...base, drops: 2, firstDropDay: '2026-05-01' })).toMatchObject({
      due: true,
    });
  });

  it('never for someone with Worlds, someone who had them made before, or with nothing dropped', () => {
    expect(firstWorldsDue({ ...base, drops: 9, hasWorlds: true }).due).toBe(false);
    expect(firstWorldsDue({ ...base, drops: 9, made: true }).due).toBe(false);
    expect(firstWorldsDue({ ...base, drops: 0, firstDropDay: null, today: '2026-10-20' }).due).toBe(
      false,
    );
  });

  it('after a try that made none, only once they have dropped more', () => {
    expect(firstWorldsDue({ ...base, drops: 6, lastTry: { drops: 6 } }).due).toBe(false);
    expect(firstWorldsDue({ ...base, drops: 7, lastTry: { drops: 6 } }).due).toBe(true);
  });
});

const T1 = '33333333-3333-4333-8333-333333333333';
const N1 = '44444444-4444-4444-8444-444444444444';
const F1 = '55555555-5555-4555-8555-555555555555';
const P1 = '77777777-7777-4777-8777-777777777777';

describe('what the model is shown', () => {
  it('their records, what Gremly holds, the people and the Gremlys, by ref', () => {
    const { text, refs } = firstWorldsRequest({
      items: [
        { type: 'todo', id: T1, title: 'Sign up for the choir', date: '2026-10-06' },
        {
          type: 'note',
          id: N1,
          subtype: 'journal',
          title: 'Clinic',
          body: 'Results back',
          date: '2026-10-05',
          health: true,
        },
      ],
      facts: [
        { id: F1, statement: 'Sings with Mo on Thursdays', about_date: null, state: 'current' },
      ],
      peopleOf: new Map([[F1, [{ id: P1, name: 'Mo', names: [], relationship: 'their friend' }]]]),
      today: '2026-10-07',
    });
    expect(text).toMatch(/p1 \| Mo \| their friend, as they said/);
    expect(text).toMatch(/i1 \| a todo \| 2026-10-06 \| Sign up for the choir/);
    expect(text).toMatch(/i2 \| \[private\] a journal entry/);
    expect(text).toMatch(/f1 \| current \| no date \| Sings with Mo on Thursdays \| about p1/);
    expect(text).toMatch(new RegExp(`${PLAIN_GREMLY} \\| the plain Gremly: `));
    expect(refs.get('i1')).toEqual({ type: 'todo', id: T1 });
    expect(refs.get('f1')).toEqual({ type: 'fact', id: F1 });
  });
});

describe('what code keeps of the answer', () => {
  const refs = new Map([
    ['i1', { type: 'todo', id: T1 }],
    ['f1', { type: 'fact', id: F1 }],
  ]);

  it('keeps Worlds with a name and a record they were given, and a Gremly from the catalogue', () => {
    const { worlds, problems } = decideFirstWorlds(
      {
        worlds: [
          { name: ' Singing ', gremly: 'music_gremly', rests_on: ['i1', 'f1', 'x9'], why: 'choir' },
          { name: 'singing', gremly: 'music_gremly', rests_on: ['i1'], why: 'again' },
          { name: 'Nothing', gremly: 'music_gremly', rests_on: ['x1'], why: '' },
          { name: '', gremly: 'music_gremly', rests_on: ['i1'], why: '' },
          { name: 'Garden', gremly: 'not_a_gremly', rests_on: ['f1'], why: '' },
          {
            name: 'A name that runs on far past what any World is ever called',
            gremly: PLAIN_GREMLY,
            rests_on: ['i1'],
            why: '',
          },
        ],
      },
      refs,
    );
    expect(worlds.map((w) => [w.name, w.gremly, w.rests_on.length])).toEqual([
      ['Singing', 'music_gremly', 2],
      ['Garden', PLAIN_GREMLY, 1],
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        'a World named a record it was not given',
        'the same name came back twice',
        'a World rested on no record it was given',
        'a World came back with no name',
        'a Gremly not in the catalogue became the plain one',
        'a name longer than 40 characters was left out',
      ]),
    );
  });

  it('keeps at most five', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      name: `World ${i}`,
      gremly: GREMLY_SLUGS[0],
      rests_on: ['i1'],
      why: '',
    }));
    expect(decideFirstWorlds({ worlds: many }, refs).worlds).toHaveLength(5);
  });

  it('keeps none from an answer that is not one', () => {
    expect(decideFirstWorlds(null, refs).worlds).toEqual([]);
  });
});

function fakeDb({ worlds = [], marks = [], todos = [], inserted = [] } = {}) {
  const calls = [];
  let worldRows = worlds;
  db.mockReturnValue({
    select: async (path) => {
      calls.push({ op: 'select', path });
      if (path.startsWith('worlds?owner_id')) return worldRows;
      if (path.startsWith('events?')) return marks;
      if (path.startsWith('todos?')) return todos;
      return [];
    },
    rpc: async () => [
      { user_id: 'u-1', timezone: 'Europe/London' },
      { user_id: 'u-2', timezone: 'Europe/London' },
    ],
    insert: async (table, rows) => {
      calls.push({ op: 'insert', table, rows });
      return rows.map((r, i) => ({ id: `w-${i}`, ...r }));
    },
    insertQuiet: async (table, rows) => calls.push({ op: 'insertQuiet', table, rows }),
    setWorlds: (w) => (worldRows = w),
  });
  return calls;
}

const fiveTodos = Array.from({ length: 5 }, (_, i) => ({
  id: `${i}3333333-3333-4333-8333-333333333333`,
  name: `Choir thing ${i}`,
  created_at: `2026-10-0${i + 1}T09:00:00Z`,
}));

describe('making them', () => {
  beforeEach(() => jsonCall.mockReset());

  it('writes the Worlds straight in, active, as first Worlds, and remembers that it did', async () => {
    const calls = fakeDb({ todos: fiveTodos });
    jsonCall.mockResolvedValue({
      output: {
        worlds: [{ name: 'Singing', gremly: 'music_gremly', rests_on: ['i1', 'i2'], why: 'choir' }],
      },
      model: 'firstWorlds',
    });
    const r = await makeFirstWorlds({}, 'u-1');
    expect(r.made).toEqual([{ id: 'w-0', name: 'Singing', gremly: 'music_gremly' }]);
    const row = calls.find((c) => c.op === 'insert' && c.table === 'worlds').rows[0];
    expect(row).toMatchObject({
      owner_id: 'u-1',
      name: 'Singing',
      display_name: 'Singing',
      phase: 'active',
      source: FIRST_WORLDS_SOURCE,
      mascot_slug: 'music_gremly',
      mascot_slug_source: FIRST_WORLDS_SOURCE,
    });
    const mark = calls.find((c) => c.op === 'insertQuiet' && c.table === 'events').rows[0];
    expect(mark).toMatchObject({
      owner_id: 'u-1',
      kind: MADE_KIND,
      payload_json: { drops: 5, worlds: 1 },
    });
  });

  it('remembers a try that made none, so it waits for more drops', async () => {
    const calls = fakeDb({ todos: fiveTodos });
    jsonCall.mockResolvedValue({ output: { worlds: [] }, model: 'firstWorlds' });
    const r = await makeFirstWorlds({}, 'u-1');
    expect(r.made).toEqual([]);
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    expect(calls.find((c) => c.table === 'events').rows[0]).toMatchObject({
      kind: TRIED_KIND,
      payload_json: { drops: 5 },
    });
  });

  it('asks nothing when they are not due', async () => {
    fakeDb({ worlds: [{ id: 'w' }], todos: fiveTodos });
    const r = await makeFirstWorlds({}, 'u-1');
    expect(r).toMatchObject({ made: [], skipped: 'they have Worlds' });
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('starts the job from the drop path only when due, once for each drop count', async () => {
    fakeDb({ todos: fiveTodos });
    const sent = [];
    const reply = (body, status = 200) => ({ body, status });
    const r = await handleFirstWorldsApi(
      { json: async () => ({ user_id: '99999999-9999-4999-8999-999999999999' }) },
      {},
      reply,
      { send: async (env, events) => sent.push(...events) },
    );
    expect(r.body).toMatchObject({ ok: true, due: true });
    expect(sent).toEqual([
      {
        id: 'first-worlds-99999999-9999-4999-8999-999999999999-5',
        name: 'app/worlds.first',
        data: { user_id: '99999999-9999-4999-8999-999999999999' },
      },
    ]);
  });

  it('lists the hourly events for active people with no Worlds who are due', async () => {
    fakeDb({ todos: fiveTodos });
    const events = await firstWorldsEvents({});
    expect(events.map((e) => e.id)).toEqual(['first-worlds-u-1-5', 'first-worlds-u-2-5']);
  });
});
