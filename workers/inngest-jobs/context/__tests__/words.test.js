/**
 * @jest-environment node
 *
 * The words writer (workers/inngest-jobs/context/words.js, data fabric stage
 * 4b): the line under each World and open Chapter, through the check as a line
 * seen at a glance, kept in card_subtitle, or beside the person's own words.
 */
import {
  renderWords,
  writeLine,
  keepLine,
  writeWords,
  glanceRecords,
  wordsPhases,
  WORDS_SOURCE,
} from '../words.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';
import { WORDS_SCHEMA } from '../../../shared/check/index.js';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  userTimezone: async () => 'Europe/London',
  personIdentity: async () => ({ first_name: 'Alex', pronouns: null, identity: {} }),
}));
jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-07' }));

const TODAY = '2026-10-07';
const W = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';
const N1 = '44444444-4444-4444-8444-444444444444';
const F1 = '55555555-5555-4555-8555-555555555555';
const F2 = '66666666-6666-4666-8666-666666666666';
const P1 = '77777777-7777-4777-8777-777777777777';

const items = [
  {
    type: 'todo',
    id: T1,
    title: 'Book the long run route',
    body: null,
    date: '2026-10-05',
    done: null,
    private: false,
    health: false,
  },
  {
    type: 'note',
    id: N1,
    subtype: 'journal',
    title: 'Knee',
    body: 'Sore after the run',
    date: '2026-10-04',
    private: false,
    health: true,
  },
];
const facts = [
  {
    id: F1,
    statement: 'Running the half with Sam',
    about_date: '2026-11-01',
    state: 'planned',
    private: false,
    health: false,
    item_table: 'todos',
    item_id: T1,
  },
  {
    id: F2,
    statement: 'Knee has been sore',
    about_date: null,
    state: 'current',
    private: false,
    health: true,
    item_table: 'notes',
    item_id: N1,
  },
];
const peopleOf = new Map([
  [F1, [{ id: P1, name: 'Sam', names: ['Sammy'], relationship: 'their brother' }]],
]);

describe('what the words writer is given', () => {
  it('names the World, what is filed in it, the facts and the people, with records the check holds it to', () => {
    const { text, refs, records } = renderWords({
      kind: 'world',
      target: { id: W, name: 'Running' },
      items,
      facts,
      peopleOf,
      today: TODAY,
    });
    expect(text).toContain('YOU ARE WRITING FOR THE WORLD (w1): Running');
    expect(text).toMatch(/i1 \| a todo of theirs \| 2026-10-05 \| Book the long run route/);
    expect(text).toMatch(/i2 \| \[private\] a journal entry/);
    expect(text).toMatch(/f1 \| planned \| 2026-11-01 \| Running the half with Sam \| about p1/);
    expect(text).toMatch(/p1 \| Sam, also called Sammy, their brother, as they said/);
    expect(refs.get('i1')).toEqual({ type: 'todo', id: T1 });
    expect(records.get('f2')).toMatchObject({ health: true });
    expect(records.get('p1')).toMatchObject({
      names: ['Sam', 'Sammy'],
      exact: ['person'],
      private: false,
    });
    // Gremly's own notes are never given
    expect(text).not.toMatch(/summary|notes on/i);
  });

  it('gives a Chapter its dates and World, and an ended one its own heading', () => {
    const target = {
      id: C,
      title: 'The half',
      phase: 'active',
      start_date: '2026-09-01',
      end_date: '2026-11-01',
    };
    const open = renderWords({
      kind: 'chapter',
      target,
      world: { name: 'Running' },
      items,
      facts,
      peopleOf,
      today: TODAY,
    });
    expect(open.text).toContain(
      'YOU ARE WRITING FOR THE CHAPTER (k1): The half | under way | 2026-09-01 to 2026-11-01 | in the World Running',
    );
    expect(open.records.get('k1')).toMatchObject({
      spans: [['2026-09-01', '2026-11-01']],
      exact: ['date'],
    });
    const ended = renderWords({
      kind: 'chapter',
      target,
      items,
      facts,
      peopleOf,
      today: TODAY,
      ended: true,
    });
    expect(ended.text).toContain(
      'THE CHAPTER THAT HAS ENDED (k1): The half | 2026-09-01 to 2026-11-01',
    );
    expect(ended.text).toContain('AND THEIR JOURNAL FROM ITS DAYS');
    // still open, though its last day has passed
    const passed = renderWords({
      kind: 'chapter',
      target: { ...target, end_date: '2026-10-01' },
      items,
      facts,
      peopleOf,
      today: TODAY,
    });
    expect(passed.text).toContain('The half | under way, its last day passed | 2026-09-01 to 2026-10-01');
  });
});

describe('what may be seen at a glance', () => {
  it('leaves out private and health items and facts, and anyone known only from them', () => {
    const P2 = '88888888-8888-4888-8888-888888888888';
    const both = { id: P1, name: 'Sam' };
    const hidden = { id: P2, name: 'Dr Lee' };
    const got = glanceRecords({
      items,
      facts,
      peopleOf: new Map([
        [F1, [both]],
        [F2, [both, hidden]],
      ]),
    });
    expect(got.items.map((i) => i.id)).toEqual([T1]);
    expect(got.facts.map((f) => f.id)).toEqual([F1]);
    expect([...got.peopleOf.keys()]).toEqual([F1]);
    expect(got.peopleOf.get(F1)).toEqual([both]);
    const flat = [...got.peopleOf.values()].flat().map((p) => p.id);
    expect(flat).not.toContain(P2);
  });

  it('leaves out an item the reader has not read, as whether it is private is not known', () => {
    const got = glanceRecords({
      items: [{ ...items[0], read: false }, { ...items[0], id: 'read', read: true }, items[0]],
      facts: [],
      peopleOf: new Map(),
    });
    expect(got.items.map((i) => i.id)).toEqual(['read', T1]);
  });

  it('leaves out an item marked private as well as one about health', () => {
    const got = glanceRecords({
      items: [{ ...items[0], private: true }],
      facts: [],
      peopleOf: new Map(),
    });
    expect(got.items).toEqual([]);
  });
});

describe('which Worlds and Chapters get words', () => {
  it('include Gremly’s suggestions until the old fields stop, and only taken up ones after', () => {
    expect(wordsPhases({})).toEqual({
      worlds: ['candidate', 'active', 'evolving'],
      chapters: ['suggested', 'upcoming', 'active'],
    });
    expect(wordsPhases({ WORLDS_OLD_FIELDS: 'stop' })).toEqual({
      worlds: ['active'],
      chapters: ['upcoming', 'active'],
    });
  });

  it('tell the writer a suggested Chapter is not yet taken up', () => {
    const { text } = renderWords({
      kind: 'chapter',
      target: { id: C, title: 'The marathon', phase: 'suggested', end_date: '2027-04-25' },
      items: [items[0]],
      facts: [],
      peopleOf: new Map(),
      today: TODAY,
    });
    expect(text).toContain(
      'YOU ARE WRITING FOR THE CHAPTER (k1): The marathon | suggested by Gremly, not yet taken up by them | no start set to 2027-04-25',
    );
  });
});

function answer({ writes, holds = true }) {
  const asked = [];
  jsonCall.mockImplementation(async (env, req) => {
    asked.push(req);
    if (req.schema === WORDS_SCHEMA)
      return { output: { not_held: !holds, what: holds ? null : 'a date' }, model: 'check' };
    return { output: writes.shift(), model: 'words' };
  });
  return asked;
}

const target = {
  table: 'worlds',
  kind: 'world',
  row: { id: W, name: 'Running', card_subtitle_source: 'synthesis' },
};
const filed = { items, facts, peopleOf };

describe('writing the words', () => {
  beforeEach(() => jsonCall.mockReset());

  it('keeps a line that rests on what it names and holds', async () => {
    const asked = answer({
      writes: [
        {
          text: 'You are training for the half with Sam.',
          refs: ['f1'],
          stated: [{ kind: 'person', value: 'Sam', ref: 'f1' }],
        },
      ],
    });
    const r = await writeLine(
      {},
      { userId: 'u-1', person: { first_name: 'Alex' }, target, today: TODAY, filed },
    );
    expect(r.outcome).toBe('pass');
    expect(r.text).toBe('You are training for the half with Sam.');
    expect(r.ids).toEqual([{ type: 'fact', id: F1 }]);
    // the check is told the words are read on any day until next written
    expect(asked.find((q) => q.schema === WORDS_SCHEMA).user).toMatch(
      /read on any day until next written\./,
    );
  });

  it('is given nothing private or about health, so no line can rest on it', async () => {
    const asked = answer({
      writes: [
        { text: 'You are nursing a sore knee.', refs: ['f2'], stated: [] },
        { text: 'You are nursing a sore knee.', refs: ['f2'], stated: [] },
      ],
    });
    const r = await writeLine({}, { userId: 'u-1', person: null, target, today: TODAY, filed });
    expect(r.outcome).toBe('left_out');
    expect(r.text).toBeNull();
    const given = asked[0].user;
    expect(given).toContain('Book the long run route');
    expect(given).not.toMatch(/Knee|Sore after the run|\[private\]/);
  });

  it('asks nothing when all that is filed is private or about health', async () => {
    const r = await writeLine(
      {},
      {
        userId: 'u-1',
        person: null,
        target,
        today: TODAY,
        filed: { items: [items[1]], facts: [facts[1]], peopleOf: new Map() },
      },
    );
    expect(r).toMatchObject({ outcome: 'empty', skipped: 'only private or unread', text: null });
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('sends a line that does not hold back once, and leaves it out when it fails again', async () => {
    answer({
      writes: [
        { text: 'You run the half next month.', refs: ['f1'], stated: [] },
        { text: 'You run the half soon.', refs: ['f1'], stated: [] },
      ],
      holds: false,
    });
    const r = await writeLine({}, { userId: 'u-1', person: null, target, today: TODAY, filed });
    expect(r.outcome).toBe('left_out');
    expect(r.problems[0]).toMatch(/records do not hold/);
  });

  it('asks nothing when nothing is filed', async () => {
    const r = await writeLine(
      {},
      {
        userId: 'u-1',
        person: null,
        target,
        today: TODAY,
        filed: { items: [], facts: [], peopleOf: new Map() },
      },
    );
    expect(r).toMatchObject({ outcome: 'empty', skipped: 'nothing filed' });
    expect(jsonCall).not.toHaveBeenCalled();
  });
});

function fakeDb(rows = {}) {
  const calls = [];
  db.mockReturnValue({
    select: async (path) => {
      calls.push({ op: 'select', path });
      for (const [k, v] of Object.entries(rows)) if (path.startsWith(k)) return v;
      return [];
    },
    update: async (path, patch) => {
      calls.push({ op: 'update', path, patch });
      return [{ id: 'x' }];
    },
    remove: async (path) => calls.push({ op: 'remove', path }),
    upsert: async (table, list, on) => calls.push({ op: 'upsert', table, rows: list, on }),
    insertQuiet: async (table, list) => calls.push({ op: 'insert', table, rows: list }),
  });
  return calls;
}

describe('keeping the words', () => {
  const result = {
    text: 'You are training for the half with Sam.',
    ids: [
      { type: 'fact', id: F1 },
      { type: 'person', id: P1 },
      { type: 'todo', id: T1 },
    ],
    model: 'words',
  };

  it('writes the words as the words writer, never over words the person wrote in the meantime', async () => {
    const calls = fakeDb();
    const kept = await keepLine({}, { userId: 'u-1', target, result, at: '2026-10-07T10:00:00Z' });
    expect(kept).toEqual({ field: 'card_subtitle', changed: true });
    const up = calls.find((c) => c.op === 'update');
    expect(up.path).toBe(
      `worlds?id=eq.${W}&owner_id=eq.u-1&or=(card_subtitle_source.is.null,card_subtitle_source.neq.user)`,
    );
    expect(up.patch).toEqual({
      card_subtitle: result.text,
      card_subtitle_source: WORDS_SOURCE,
      card_subtitle_updated_at: '2026-10-07T10:00:00Z',
    });
    const rec = calls.find((c) => c.op === 'upsert').rows[0];
    expect(rec).toMatchObject({
      row_table: 'worlds',
      field: 'card_subtitle',
      fact_ids: [F1],
      person_ids: [P1],
      items: [{ table: 'todos', id: T1 }],
      writer: 'words',
    });
  });

  it('offers its words beside the person’s own, and offers nothing that is already theirs', async () => {
    let calls = fakeDb();
    const theirs = {
      ...target,
      row: { ...target.row, card_subtitle: 'My running', card_subtitle_source: 'user' },
    };
    expect(await keepLine({}, { userId: 'u-1', target: theirs, result, at: 'T' })).toEqual({
      field: 'card_subtitle_offered',
      changed: true,
    });
    expect(calls.find((c) => c.op === 'update').patch).toEqual({
      card_subtitle_offered: result.text,
      card_subtitle_offered_at: 'T',
    });
    calls = fakeDb();
    await keepLine(
      {},
      {
        userId: 'u-1',
        target: { ...theirs, row: { ...theirs.row, card_subtitle: result.text } },
        result,
        at: 'T',
      },
    );
    expect(calls.find((c) => c.op === 'update').patch.card_subtitle_offered).toBeNull();
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('leaves the field blank when the words were left out, and what it rested on goes', async () => {
    const calls = fakeDb();
    await keepLine({}, { userId: 'u-1', target, result: { text: null, ids: [] }, at: 'T' });
    expect(calls.find((c) => c.op === 'update').patch).toMatchObject({
      card_subtitle: null,
      card_subtitle_source: WORDS_SOURCE,
    });
    expect(calls.find((c) => c.op === 'remove').path).toMatch(/field=eq\.card_subtitle$/);
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});

describe('a person’s words', () => {
  beforeEach(() => jsonCall.mockReset());

  it('writes for their open Worlds and Chapters, logs the check, and one failure does not stop the rest', async () => {
    const calls = fakeDb({
      'worlds?owner_id': [{ id: W, name: 'Running', card_subtitle_source: 'synthesis' }],
      'chapters?owner_id': [
        {
          id: C,
          title: 'The half',
          phase: 'active',
          primary_world_id: W,
          card_subtitle_source: null,
        },
      ],
      [`drop_world_links?owner_id=eq.u-1&world_id=eq.${W}`]: [
        { drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' },
      ],
      'todos?owner_id': [
        { id: T1, name: 'Book the long run route', created_at: '2026-10-05T09:00:00Z' },
      ],
      // the reader has read it
      'ledger_cursor?user_id': [{ read_through: '2026-10-07T00:00:00Z' }],
    });
    jsonCall.mockImplementation(async (env, req) => {
      if (req.schema === WORDS_SCHEMA)
        return { output: { not_held: false, what: null }, model: 'check' };
      return {
        output: { text: 'You keep your long runs going.', refs: ['i1'], stated: [] },
        model: 'words',
      };
    });
    const out = await writeWords({}, 'u-1', { reason: 'weekly' });
    expect(out).toMatchObject({ written: 1, empty: 1, failed: 0, reason: 'weekly' });
    expect(calls.find((c) => c.path?.startsWith('worlds?owner_id')).path).toContain(
      'phase=in.(candidate,active,evolving)',
    );
    expect(calls.find((c) => c.path?.startsWith('chapters?owner_id')).path).toContain(
      'phase=in.(suggested,upcoming,active)',
    );
    expect(calls.find((c) => c.op === 'insert' && c.table === 'check_runs').rows[0]).toMatchObject({
      job: 'words',
      checked: 1,
    });
    // only the named one when targets are given
    const named = await writeWords({}, 'u-1', {
      targets: [{ table: 'chapters', id: C }],
      dryRun: true,
    });
    expect(named.lines.map((l) => l.id)).toEqual([C]);
  });

  it('writes the Chapters first, and gives each writer the words written before it', async () => {
    const W2 = '88888888-8888-4888-8888-888888888888';
    fakeDb({
      'worlds?owner_id': [
        { id: W, name: 'Running', card_subtitle: 'Old words about running', card_subtitle_source: 'words' },
        // words the person wrote stay theirs, and are given from the start
        { id: W2, name: 'Home', card_subtitle: 'Their own words', card_subtitle_source: 'user' },
      ],
      'chapters?owner_id': [
        { id: C, title: 'The half', phase: 'active', primary_world_id: W, card_subtitle: 'Old words about the half', card_subtitle_source: 'words' },
      ],
      'drop_world_links?owner_id': [{ drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' }],
      'drop_chapter_links?owner_id': [{ drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' }],
      'todos?owner_id': [{ id: T1, name: 'Book the long run route', created_at: '2026-10-05T09:00:00Z' }],
      'ledger_cursor?user_id': [{ read_through: '2026-10-07T00:00:00Z' }],
    });
    const asked = [];
    jsonCall.mockImplementation(async (env, req) => {
      if (req.schema === WORDS_SCHEMA) return { output: { not_held: false, what: null }, model: 'check' };
      asked.push(req.user);
      return { output: { text: ['Words for the half', 'Words for running', 'Words for home'][asked.length - 1], refs: ['i1'], stated: [] }, model: 'words' };
    });
    const out = await writeWords({}, 'u-1', { dryRun: true });
    expect(out.lines.map((l) => l.id)).toEqual([C, W, W2]);
    // the Chapter is given only the words that will stand: the person's own
    expect(asked[0]).toContain('THE WORDS UNDER THEIR OTHER WORLDS AND CHAPTERS');
    expect(asked[0]).toContain('the World Home | Their own words');
    expect(asked[0]).not.toContain('Old words');
    // its World is given what was just written under it
    expect(asked[1]).toContain('the Chapter The half, a Chapter in this World | Words for the half');
    expect(asked[2]).toContain('the World Running | Words for running');
    expect(asked).toHaveLength(3);
  });
});

describe('the words under their other Worlds and Chapters', () => {
  const { wordsOthers, wordsBefore } = jest.requireActual('../words.js');
  const world = { table: 'worlds', kind: 'world', row: { id: W, name: 'Running', card_subtitle: 'Your runs' } };
  const chapter = { table: 'chapters', kind: 'chapter', row: { id: C, title: 'The half', primary_world_id: W, card_subtitle: 'The half in spring' } };

  it('are those that stand now, except the ones still to be written', () => {
    expect(wordsBefore([world, chapter], [world])).toEqual(
      new Map([
        [`worlds:${W}`, null],
        [`chapters:${C}`, 'The half in spring'],
      ]),
    );
  });

  it('say which are tied to the one being written, and leave out its own and blank ones', () => {
    const said = new Map([
      [`worlds:${W}`, 'Your runs'],
      [`chapters:${C}`, 'The half in spring'],
    ]);
    expect(wordsOthers(world, [world, chapter], said)).toEqual([
      { which: 'the Chapter The half, a Chapter in this World', words: 'The half in spring' },
    ]);
    expect(wordsOthers(chapter, [world, chapter], said)).toEqual([
      { which: 'the World Running, the World this Chapter is in', words: 'Your runs' },
    ]);
    expect(wordsOthers(chapter, [world, chapter], new Map())).toEqual([]);
  });

  it('a writer is told what was cleared from their list without being marked done', () => {
    const { text } = renderWords({
      kind: 'world',
      target: { id: W, name: 'Running' },
      items: [{ type: 'todo', id: T1, title: 'Long run', body: null, date: '2026-10-05', done: null, cleared: true }],
      facts: [],
      peopleOf: new Map(),
      today: TODAY,
    });
    expect(text).toContain('i1 | a todo of theirs, cleared from their list without being marked done | 2026-10-05 | Long run');
  });

  it('are shown to the writer apart from the records, never as one it may cite', () => {
    const { text, refs } = renderWords({
      kind: 'world',
      target: { id: W, name: 'Running' },
      items: [],
      facts: [],
      peopleOf: new Map(),
      today: TODAY,
      others: [{ which: 'the Chapter The half', words: 'The half in spring' }],
    });
    expect(text).toContain('THE WORDS UNDER THEIR OTHER WORLDS AND CHAPTERS (which | their words):\nthe Chapter The half | The half in spring');
    expect([...refs.keys()]).toEqual(['w1']);
  });
});

describe('the moments the check is told', () => {
  it('fit the words question, which keeps 80 characters', () => {
    const { WORDS_MOMENT } = jest.requireActual('../words.js');
    const { MEMORY_MOMENT } = jest.requireActual('../memory.js');
    expect(WORDS_MOMENT.length).toBeLessThanOrEqual(80);
    expect(MEMORY_MOMENT.length).toBeLessThanOrEqual(80);
  });
});
