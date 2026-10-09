/**
 * @jest-environment node
 *
 * The reader, data fabric stage 4f: every day that comes round each year is
 * shown to it whatever its state, with what happened around the records it
 * reads, so an occasion is weighed against every later mention of it; the
 * questions already waiting are shown so none is asked twice; each question
 * is weighed; and the catch up asks only what needs an answer, while few are
 * waiting. Made up records only.
 */
import { loadOpenFacts, readerRequest, readChunk, CATCH_UP_QUESTIONS_WHILE_UNDER } from '../reader';
import { db } from '../db';
import { jsonCall } from '../llm';
import { chatRecord } from '../records';
import { memoryDb } from './memoryDb';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Noor', identity: {} })),
  userTimezone: jest.fn(async () => 'America/New_York'),
}));
jest.mock('../llm', () => ({ ...jest.requireActual('../llm'), jsonCall: jest.fn(), modelFor: () => 'model' }));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: async () => ({ today: '2026-11-12', dayEndHour: 3 }),
}));

const U = 'u-noor';
const fact = (id, statement, over = {}) => ({
  id,
  user_id: U,
  statement,
  kind: 'event',
  timing: 'day',
  state: 'current',
  about_date: null,
  about_date_end: null,
  private: false,
  health: false,
  last_confirmed_at: '2026-06-01T09:00:00Z',
  ...over,
});

function wire(t) {
  const mem = memoryDb(t);
  const VIEWS = { life_facts_now: 'life_facts' };
  const at = (p) => {
    const [table, q] = p.split('?');
    return `${VIEWS[table] || table}?${q || ''}`;
  };
  db.mockReturnValue({
    select: (p) => mem.select(at(p)),
    insert: (table, rows) => mem.insert(table, rows),
    insertQuiet: (table, rows) => mem.insertQuiet(table, rows),
    insertIgnore: (table, rows, on) => mem.insertIgnore(table, rows, on),
    update: (p, patch) => mem.update(at(p), patch),
    remove: (p) => mem.remove(at(p)),
    upsert: async (table, rows) => {
      t[table] = [...(t[table] || []), ...rows];
      return rows;
    },
  });
  return mem;
}

beforeEach(() => jest.clearAllMocks());

describe('what the reader is shown', () => {
  it('every yearly day whatever its state, and what happened around the records, but nothing put right', async () => {
    wire({
      life_facts: [
        fact('y-old', 'Noor turned 35 on 30 April.', {
          state: 'happened',
          about_date: '2026-04-30',
        }),
        fact('y-every', "Noor's anniversary is on 12 November.", {
          timing: 'yearly',
          state: 'happened',
          about_date: '2025-11-12',
        }),
        fact('far', 'Noor went to Lisbon last autumn.', {
          state: 'happened',
          about_date: '2025-10-10',
        }),
        fact('wrong', "Noor's birthday is on 25 April.", {
          timing: 'yearly',
          state: 'corrected',
          about_date: '2026-04-25',
        }),
      ],
    });
    // records from late April: the happened day near them is shown, the far one is not
    const ids = (await loadOpenFacts({}, U, '2026-04-21T10:00:00Z')).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['y-old', 'y-every']));
    expect(ids).not.toContain('far');
    expect(ids).not.toContain('wrong');
  });

  it('the questions already waiting, to be asked never again', () => {
    const { user } = readerRequest({
      today: '2026-11-12',
      person: { first_name: 'Noor' },
      chunk: [chatRecord({ id: 'm1', content: 'Hello', created_at: '2026-11-12T10:00:00Z' })],
      openFacts: [],
      waiting: [{ question: 'Is your birthday on 25 or 30 April?' }],
      tz: 'America/New_York',
    });
    expect(user).toContain('QUESTIONS ALREADY WAITING:\n- Is your birthday on 25 or 30 April?');
  });
});

describe('questions the reader writes', () => {
  const base = (waiting = 0) => ({
    life_facts: [
      fact('f-bday', 'Noor turned 35 on 30 April.', {
        state: 'happened',
        about_date: '2026-04-30',
      }),
    ],
    life_fact_sources: [],
    life_people: [],
    life_person_names: [],
    life_fact_people: [],
    person_merges: [],
    life_fact_changes: [],
    gremly_questions: Array.from({ length: waiting }, (_, i) => ({
      id: `w${i}`,
      user_id: U,
      question: `Waiting ${i}?`,
      status: 'open',
      created_at: '2026-11-01T09:00:00Z',
    })),
  });
  const chunk = [
    {
      ...chatRecord({
        id: 'm-1',
        content: 'Off on the 25th for my birthday trip!',
        created_at: '2026-04-20T20:00:00Z',
      }),
      kind: 'read_before',
      factIds: [],
    },
  ];
  const answer = (matters) => ({
    model: 'model',
    output: {
      new_facts: [],
      fact_updates: [],
      confirmations: [],
      questions: [
        {
          question: 'Is your birthday on 25 or 30 April?',
          choices: ['30 April', '25 April'],
          fact_ref: 'f1',
          matters,
        },
        { question: 'Was the trip with Eli?', choices: ['Yes', 'No'], matters: 'helps' },
      ],
      calendar: [],
      same_people: [],
    },
  });

  it('are weighed as the model judged them', async () => {
    const t = base();
    wire(t);
    jsonCall.mockResolvedValue(answer('needs'));
    await readChunk(
      {},
      U,
      'America/New_York',
      chunk.map(({ kind, factIds, ...r }) => r),
      'run',
    );
    expect(t.gremly_questions.map((q) => q.weight).sort()).toEqual(['helps', 'needs']);
  });

  it('in a catch up, only one that needs an answer, while few are waiting', async () => {
    const t = base();
    wire(t);
    jsonCall.mockResolvedValue(answer('needs'));
    const c = await readChunk({}, U, 'America/New_York', chunk, 'run', { reread: true });
    expect(t.gremly_questions.map((q) => q.question)).toEqual([
      'Is your birthday on 25 or 30 April?',
    ]);
    expect(c.held_questions).toBe(1);
  });

  it('in a catch up, nothing that only helps, and nothing at all once enough are waiting', async () => {
    const t = base();
    wire(t);
    jsonCall.mockResolvedValue(answer('helps'));
    await readChunk({}, U, 'America/New_York', chunk, 'run', { reread: true });
    expect(t.gremly_questions).toHaveLength(0);

    const full = base(CATCH_UP_QUESTIONS_WHILE_UNDER);
    wire(full);
    jsonCall.mockResolvedValue(answer('needs'));
    await readChunk({}, U, 'America/New_York', chunk, 'run', { reread: true });
    expect(full.gremly_questions).toHaveLength(CATCH_UP_QUESTIONS_WHILE_UNDER);
  });
});

describe('a fact they asked Gremly to forget', () => {
  it('is shown as set aside, and never changed by a read', async () => {
    const t = {
      life_facts: [
        fact('f-sa', 'Noor added a note to try the app.', { state: 'set_aside', timing: 'day' }),
      ],
      life_fact_sources: [],
      life_people: [],
      life_person_names: [],
      life_fact_people: [],
      person_merges: [],
      life_fact_changes: [],
      gremly_questions: [],
    };
    wire(t);
    jsonCall.mockImplementation(async (_env, { user }) => {
      expect(user).toContain('which they asked Gremly to forget');
      return {
        model: 'model',
        output: {
          new_facts: [],
          fact_updates: [
            { fact_ref: 'f1', source_ref: 'r1', new_state: 'current', reason: 'edited again' },
          ],
          confirmations: [],
          questions: [],
          calendar: [],
          same_people: [],
        },
      };
    });
    const c = await readChunk(
      {},
      U,
      'America/New_York',
      [
        {
          ...chatRecord({
            id: 'm-sa',
            content: 'trying the app again',
            created_at: '2026-11-12T10:00:00Z',
          }),
          kind: 'changed',
          factIds: ['f-sa'],
        },
      ],
      'run',
    );
    expect(t.life_facts[0].state).toBe('set_aside');
    expect(c.rejected).toBe(1);
  });
});
