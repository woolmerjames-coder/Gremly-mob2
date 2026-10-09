/**
 * @jest-environment node
 *
 * An answer to a tidy up (data fabric stage 4f, context/review.js): their yes
 * does what was proposed to the facts it names, and nothing else; their no
 * leaves every fact as it is; either closes the question. A tidy up Gremly no
 * longer offers (setting facts aside, retired 18 Oct) is closed by any tap and
 * moves nothing. Made up records only.
 */
import { applyCorrection } from '../corrections.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../db.js', () => ({ ...jest.requireActual('../db.js'), db: jest.fn() }));
jest.mock('../cache.js', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

const Q = '5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b';
const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const F3 = '33333333-3333-4333-8333-333333333333';

function tables({
  said = 'They happened',
  type = 'happened',
  status = 'open',
  pick = undefined,
} = {}) {
  return {
    user_corrections: [
      {
        id: 'c-1',
        user_id: 'u',
        said,
        surface: 'question',
        target_ref: { id: Q, ...(pick ? { pick } : {}) },
        status: 'received',
        created_at: '2026-10-08T10:00:00Z',
      },
    ],
    gremly_questions: [
      {
        id: Q,
        user_id: 'u',
        kind: 'tidy',
        question: 'Did these go ahead?',
        status,
        rests_on: [
          { table: 'life_facts', id: F1 },
          { table: 'life_facts', id: F2 },
        ],
        proposed_change: { type, fact_ids: [F1, F2], yes: 'They happened', no: 'Not sure' },
      },
    ],
    life_facts: [
      { id: F1, user_id: 'u', statement: 'Noor plans a picnic on 2 October.', state: 'planned' },
      { id: F2, user_id: 'u', statement: 'Noor plans to visit her aunt on 3 October.', state: 'unconfirmed' },
      { id: F3, user_id: 'u', statement: 'Noor plans a hike on 4 October.', state: 'planned' },
    ],
    life_fact_changes: [],
  };
}

it('marks exactly the facts it names as happened on their yes, keeps each change, and closes the question', async () => {
  const mem = memoryDb(tables());
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  const state = Object.fromEntries(mem.tables.life_facts.map((f) => [f.id, f.state]));
  expect(state).toEqual({ [F1]: 'happened', [F2]: 'happened', [F3]: 'planned' });
  expect(mem.tables.life_fact_changes.map((c) => [c.fact_id, c.from_state, c.to_state])).toEqual([
    [F1, 'planned', 'happened'],
    [F2, 'unconfirmed', 'happened'],
  ]);
  expect(mem.tables.gremly_questions[0]).toMatchObject({
    status: 'answered',
    answer: 'They happened',
  });
  expect(mem.tables.user_corrections[0]).toMatchObject({ status: 'applied' });
  expect(r).toMatchObject({ tidy: Q, said: 'yes', facts: 2 });
});

it('moves only the ones they ticked when they chose some of them, and never one it did not name', async () => {
  const mem = memoryDb(tables({ pick: [F2, F3] }));
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  const state = Object.fromEntries(mem.tables.life_facts.map((f) => [f.id, f.state]));
  expect(state).toEqual({ [F1]: 'planned', [F2]: 'happened', [F3]: 'planned' });
  expect(mem.tables.gremly_questions[0].status).toBe('answered');
  expect(r).toMatchObject({ said: 'some', picked: 1, of: 2, facts: 1 });
});

it('leaves every fact as it is on their no, and closes the question', async () => {
  const mem = memoryDb(tables({ said: 'Not sure' }));
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.life_facts.map((f) => f.state)).toEqual(['planned', 'unconfirmed', 'planned']);
  expect(mem.tables.life_fact_changes).toHaveLength(0);
  expect(mem.tables.gremly_questions[0].status).toBe('answered');
  expect(r).toMatchObject({ said: 'no' });
});

it('changes nothing on a retry of a question already answered', async () => {
  const mem = memoryDb(tables({ status: 'answered' }));
  db.mockReturnValue(mem);
  await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.life_facts.map((f) => f.state)).toEqual(['planned', 'unconfirmed', 'planned']);
  expect(mem.tables.user_corrections[0].status).toBe('applied');
});

it('closes a set aside tidy up still waiting on either tap, and sets nothing aside', async () => {
  for (const said of ['Set them aside', 'Keep them']) {
    const mem = memoryDb(tables({ type: 'set_aside', said }));
    mem.tables.gremly_questions[0].proposed_change = { type: 'set_aside', fact_ids: [F1, F2], yes: 'Set them aside', no: 'Keep them' };
    db.mockReturnValue(mem);
    const r = await applyCorrection({}, 'c-1', 'run');
    expect(mem.tables.life_facts.map((f) => f.state)).toEqual(['planned', 'unconfirmed', 'planned']);
    expect(mem.tables.life_fact_changes).toHaveLength(0);
    expect(mem.tables.gremly_questions[0].status).toBe('expired');
    expect(mem.tables.user_corrections[0].status).toBe('applied');
    expect(r).toMatchObject({ retired: true, facts: 0 });
  }
});
