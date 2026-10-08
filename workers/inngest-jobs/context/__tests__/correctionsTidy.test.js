/**
 * @jest-environment node
 *
 * An answer to a tidy up (data fabric stage 4f, context/review.js): their yes
 * does what was proposed to the facts it names, and nothing else; their no
 * leaves every fact as it is; either closes the question. Made up records only.
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
  said = 'Forget them',
  type = 'set_aside',
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
        question: 'These look like work meetings rather than your life. Forget them?',
        status,
        rests_on: [
          { table: 'life_facts', id: F1 },
          { table: 'life_facts', id: F2 },
        ],
        proposed_change: { type, fact_ids: [F1, F2], yes: 'Forget them', no: 'Keep them' },
      },
    ],
    life_facts: [
      { id: F1, user_id: 'u', statement: 'Noor has a weekly team sync.', state: 'current' },
      { id: F2, user_id: 'u', statement: 'Noor has a status call on 2 October.', state: 'planned' },
      { id: F3, user_id: 'u', statement: 'Noor swims before work.', state: 'current' },
    ],
    life_fact_changes: [],
  };
}

it('sets aside exactly the facts it names on their yes, keeps each change, and closes the question', async () => {
  const mem = memoryDb(tables());
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  const state = Object.fromEntries(mem.tables.life_facts.map((f) => [f.id, f.state]));
  expect(state).toEqual({ [F1]: 'set_aside', [F2]: 'set_aside', [F3]: 'current' });
  expect(mem.tables.life_fact_changes.map((c) => [c.fact_id, c.from_state, c.to_state])).toEqual([
    [F1, 'current', 'set_aside'],
    [F2, 'planned', 'set_aside'],
  ]);
  expect(mem.tables.gremly_questions[0]).toMatchObject({
    status: 'answered',
    answer: 'Forget them',
  });
  expect(mem.tables.user_corrections[0]).toMatchObject({ status: 'applied' });
  expect(r).toMatchObject({ tidy: Q, said: 'yes', facts: 2 });
});

it('sets aside only the ones they ticked when they chose some of them, and never one it did not name', async () => {
  const mem = memoryDb(tables({ pick: [F2, F3] }));
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  const state = Object.fromEntries(mem.tables.life_facts.map((f) => [f.id, f.state]));
  expect(state).toEqual({ [F1]: 'current', [F2]: 'set_aside', [F3]: 'current' });
  expect(mem.tables.gremly_questions[0].status).toBe('answered');
  expect(r).toMatchObject({ said: 'some', picked: 1, of: 2, facts: 1 });
});

it('marks only plans as happened on their yes to plans whose days passed', async () => {
  const mem = memoryDb(tables({ type: 'happened' }));
  db.mockReturnValue(mem);
  await applyCorrection({}, 'c-1', 'run');
  const state = Object.fromEntries(mem.tables.life_facts.map((f) => [f.id, f.state]));
  // the current fact is not a plan, so it is left as it is
  expect(state).toEqual({ [F1]: 'current', [F2]: 'happened', [F3]: 'current' });
});

it('leaves every fact as it is on their no, and closes the question', async () => {
  const mem = memoryDb(tables({ said: 'Keep them' }));
  db.mockReturnValue(mem);
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.life_facts.every((f) => f.state !== 'set_aside')).toBe(true);
  expect(mem.tables.life_fact_changes).toHaveLength(0);
  expect(mem.tables.gremly_questions[0].status).toBe('answered');
  expect(r).toMatchObject({ said: 'no' });
});

it('changes nothing on a retry of a question already answered', async () => {
  const mem = memoryDb(tables({ status: 'answered' }));
  db.mockReturnValue(mem);
  await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.life_facts.every((f) => f.state !== 'set_aside')).toBe(true);
  expect(mem.tables.user_corrections[0].status).toBe('applied');
});
