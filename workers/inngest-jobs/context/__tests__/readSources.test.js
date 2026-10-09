/**
 * @jest-environment node
 *
 * What one read writes about where its facts come from
 * (workers/inngest-jobs/context/reader.js, readChunk): the model judges whether
 * a fact is about an item; code writes the source rows, and moves a record the
 * fact was already said in to about when the model judges it the item itself.
 */
import { readChunk } from '../reader.js';
import { db, personIdentity } from '../db';
import { jsonCall } from '../llm';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Alex', identity: {} })),
}));
jest.mock('../llm', () => ({ ...jest.requireActual('../llm'), jsonCall: jest.fn(), modelFor: () => 'model' }));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: async () => ({ today: '2026-10-07', dayEndHour: 3 }),
}));

const USER = 'u-1';
const TODO = { table: 'todos', id: 't-1', at: '2026-10-07T18:00:00Z', text: 'Changed a todo' };
const FACT = {
  id: 'fact-1',
  statement: 'Alex plans to call the bank on Tuesday.',
  about_date: '2026-10-06',
  state: 'planned',
  source_table: 'todos',
  source_id: 't-1',
};
const OTHER = { ...FACT, id: 'fact-2', statement: 'Alex plans to pick up the glasses.' };

function fakeDb({ alreadySaidIn = true } = {}) {
  const writes = [];
  db.mockReturnValue({
    select: async (path) => {
      if (path.startsWith('life_facts_now')) return [FACT, OTHER];
      return [];
    },
    insert: async (table, rows) => {
      writes.push({ op: 'insert', table, rows });
      return rows.map((r) => ({ id: r.id }));
    },
    insertQuiet: async (table, rows) => writes.push({ op: 'insertQuiet', table, rows }),
    insertIgnore: async (table, rows) => writes.push({ op: 'insertIgnore', table, rows }),
    update: async (path, patch) => {
      writes.push({ op: 'update', path, patch });
      if (path.startsWith('life_fact_sources')) return alreadySaidIn ? [{ id: 1 }] : [];
      return [{ id: 'x' }];
    },
    remove: async () => [],
  });
  return writes;
}

function modelSays(output) {
  jsonCall.mockResolvedValue({
    output: {
      new_facts: [],
      fact_updates: [],
      confirmations: [],
      questions: [],
      calendar: [],
      ...output,
    },
    model: 'model',
  });
}

const sourcesWritten = (writes) =>
  writes
    .filter((w) => w.op === 'insertIgnore' && w.table === 'life_fact_sources')
    .flatMap((w) => w.rows);
const roleMoves = (writes) =>
  writes.filter((w) => w.op === 'update' && w.path.startsWith('life_fact_sources'));

beforeEach(() => jest.clearAllMocks());

describe('where a read says its facts come from', () => {
  it('marks a replacement as about the item when the model says it states the item', async () => {
    const writes = fakeDb();
    modelSays({
      fact_updates: [
        {
          fact_ref: 'f1',
          new_state: 'changed',
          reason: 'The todo moved to Saturday.',
          source_ref: 'r1',
          replacement_statement: 'Alex plans to call the bank on Saturday.',
          replacement_about_date: '2026-10-10',
          replacement_state: 'planned',
          replacement_about_item: true,
        },
      ],
    });
    await readChunk({}, USER, 'America/Los_Angeles', [TODO], 'run');
    const replacement = writes.find((w) => w.op === 'insert' && w.table === 'life_facts').rows[0];
    const src = sourcesWritten(writes).find((r) => r.fact_id === replacement.id);
    expect(src).toMatchObject({ source_table: 'todos', source_id: 't-1', role: 'about' });
  });

  it('keeps a replacement as said in when the model does not say it states the item', async () => {
    const writes = fakeDb();
    modelSays({
      fact_updates: [
        {
          fact_ref: 'f1',
          new_state: 'changed',
          reason: 'The todo moved.',
          source_ref: 'r1',
          replacement_statement: 'Alex plans to call the bank on Saturday.',
        },
      ],
    });
    await readChunk({}, USER, 'America/Los_Angeles', [TODO], 'run');
    expect(sourcesWritten(writes).every((r) => r.role === 'said_in')).toBe(true);
    expect(roleMoves(writes)).toHaveLength(0);
  });

  it('moves the record a confirmed fact was said in to about, and only from said in', async () => {
    const writes = fakeDb();
    modelSays({ confirmations: [{ fact_ref: 'f1', source_ref: 'r1', about_item: true }] });
    const counts = await readChunk({}, USER, 'America/Los_Angeles', [TODO], 'run');
    const [move] = roleMoves(writes);
    expect(move.path).toBe(
      'life_fact_sources?fact_id=eq.fact-1&source_table=eq.todos&source_id=eq.t-1&role=eq.said_in',
    );
    expect(move.patch).toEqual({ role: 'about', seen_at: TODO.at });
    expect(counts.about_marked).toBe(1);
  });

  it('never marks a fact as about a chat message, which is not an item', async () => {
    const writes = fakeDb();
    const CHAT = {
      table: 'scope_chat_messages',
      id: 'm-1',
      at: '2026-10-07T18:00:00Z',
      text: 'Said in chat',
    };
    modelSays({
      new_facts: [
        {
          statement: 'Alex will call the bank on Saturday.',
          about_date: '2026-10-10',
          state: 'planned',
          source_ref: 'r1',
          quote: 'call the bank Saturday',
          about_item: true,
        },
      ],
      confirmations: [{ fact_ref: 'f2', source_ref: 'r1', about_item: true }],
    });
    await readChunk({}, USER, 'America/Los_Angeles', [CHAT], 'run');
    expect(sourcesWritten(writes).every((r) => r.role === 'said_in')).toBe(true);
    expect(roleMoves(writes)).toHaveLength(0);
  });

  it('moves nothing for a plain confirmation', async () => {
    const writes = fakeDb();
    modelSays({ confirmations: [{ fact_ref: 'f2', source_ref: 'r1' }] });
    const counts = await readChunk({}, USER, 'America/Los_Angeles', [TODO], 'run');
    expect(roleMoves(writes)).toHaveLength(0);
    expect(counts.about_marked).toBeUndefined();
    expect(counts.confirmed).toBe(1);
  });
});
