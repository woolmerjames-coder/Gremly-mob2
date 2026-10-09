/**
 * @jest-environment node
 *
 * One person, one record (18 Oct): proposed pairs the model calls plainly one
 * person are joined, undoably and marked as Gremly's; the rest stay proposed
 * to be asked. A chain of three records ends as one. Made up records only.
 */
import { memoryDb } from './memoryDb.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';
import { settleProposedJoins, joinRequest, joinOrder } from '../peopleJoin';
import { undoMerge } from '../people';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  personIdentity: async () => ({ first_name: 'Alex', pronouns: null, identity: {} }),
}));
jest.mock('../llm.js', () => ({ ...jest.requireActual('../llm.js'), jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));


const U = 'u1';
const person = (id, name, relationship = null, by = 'gremly') => ({
  id,
  user_id: U,
  name,
  name_by: 'gremly',
  relationship,
  relationship_by: by,
  relationship_fact_id: null,
  merged_into: null,
  hidden_at: null,
  created_at: '2026-10-01T00:00:00Z',
});
const fact = (id, statement) => ({ id, user_id: U, statement, about_date: null, private: false, health: false, superseded_by: null, observed_at: '2026-10-01T00:00:00Z' });

function world() {
  return memoryDb({
    life_people: [person('p-a', 'Theo', 'husband', 'understood'), person('p-b', 'Theo'), person('p-c', 'Theo'), person('p-d', 'Theodore')],
    life_person_names: [
      { person_id: 'p-a', user_id: U, name: 'Theo', fact_id: 'f1', by: 'gremly' },
      { person_id: 'p-b', user_id: U, name: 'Theo', fact_id: 'f2', by: 'gremly' },
      { person_id: 'p-c', user_id: U, name: 'Theo', fact_id: 'f3', by: 'gremly' },
      { person_id: 'p-d', user_id: U, name: 'Theodore', fact_id: 'f4', by: 'gremly' },
    ],
    life_fact_people: [
      { fact_id: 'f1', person_id: 'p-a', user_id: U },
      { fact_id: 'f2', person_id: 'p-b', user_id: U },
      { fact_id: 'f3', person_id: 'p-c', user_id: U },
      { fact_id: 'f4', person_id: 'p-d', user_id: U },
    ],
    life_facts: [fact('f1', 'Alex and Theo had their anniversary at home.'), fact('f2', 'Alex played tennis with Theo.'), fact('f3', "Theo's birthday is 27 April."), fact('f4', 'Alex needs to email Theodore about the account plan.')],
    person_merges: [
      { id: 'm1', user_id: U, kept_id: 'p-a', merged_id: 'p-b', status: 'proposed', reason: 'maybe', moved: null },
      { id: 'm2', user_id: U, kept_id: 'p-b', merged_id: 'p-c', status: 'proposed', reason: 'maybe', moved: null },
      { id: 'm3', user_id: U, kept_id: 'p-a', merged_id: 'p-d', status: 'proposed', reason: 'maybe', moved: null },
    ],
  });
}

/** The model's answer: same for the Theos, unclear for Theodore, by the pairs' own records. */
function answer() {
  jsonCall.mockImplementation(async (env, { user }) => {
    const pairs = [...user.matchAll(/^(j\d+)\n {2}record A: ([^|]+)\|[^\n]*\n(?:[^\n]*\n)*? {2}record B: ([^|]+)\|/gm)].map((m) => ({
      ref: m[1],
      verdict: m[3].includes('Theodore') ? 'unclear' : 'same',
      why: 'made up',
    }));
    return { output: { pairs }, model: 'reader' };
  });
}

beforeEach(() => jsonCall.mockReset());

it('shows each record with its names, whose tie it is and its facts', () => {
  const { user, refs } = joinRequest({
    pairs: [{ merge: { id: 'm1' }, kept: { names: ['Theo'], relationship: 'husband', relationship_by: 'understood', facts: [{ statement: 'Anniversary at home.' }] }, merged: { names: [], relationship: null, facts: [] } }],
    person: { first_name: 'Alex' },
  });
  expect(user).toContain('record A: Theo | husband, as Gremly understood it from the records');
  expect(user).toContain('record B: (no name) | who they are to the person is not known');
  expect(refs.get('j1').merge.id).toBe('m1');
});

it('joins a record into one that is itself joined away last, so a chain ends as one', () => {
  const order = joinOrder([
    { merge: { kept_id: 'p-a', merged_id: 'p-b' } },
    { merge: { kept_id: 'p-b', merged_id: 'p-c' } },
  ]);
  expect(order.map((p) => p.merge.merged_id)).toEqual(['p-c', 'p-b']);
});

it('joins what the records make plain, marks it as Gremly’s, and leaves the unclear to be asked', async () => {
  const d = world();
  db.mockReturnValue(d);
  answer();
  const out = await settleProposedJoins({}, U);
  expect(out).toMatchObject({ pairs: 3, joined: 2 });
  const byId = new Map(d.tables.life_people.map((p) => [p.id, p]));
  expect(byId.get('p-b').merged_into).toBe('p-a');
  expect(byId.get('p-c').merged_into).toBe('p-b');
  expect(byId.get('p-d').merged_into).toBeNull();
  // every fact of the three Theos now sits with the one kept
  const ofA = d.tables.life_fact_people.filter((t) => t.person_id === 'p-a').map((t) => t.fact_id).sort();
  expect(ofA).toEqual(['f1', 'f2', 'f3']);
  const merges = new Map(d.tables.person_merges.map((m) => [m.id, m]));
  expect(merges.get('m1')).toMatchObject({ status: 'merged', moved: expect.objectContaining({ by: 'understood' }) });
  expect(merges.get('m3').status).toBe('proposed');
});

it('writes nothing in a dry run, and a join can be undone', async () => {
  const d = world();
  db.mockReturnValue(d);
  answer();
  const dry = await settleProposedJoins({}, U, { dryRun: true });
  expect(dry).toMatchObject({ pairs: 3, joined: 0, dry_run: true });
  expect(d.tables.person_merges.every((m) => m.status === 'proposed')).toBe(true);
  await settleProposedJoins({}, U);
  expect(await undoMerge(d, U, 'm1')).toEqual({ undone: true });
  expect(d.tables.life_people.find((p) => p.id === 'p-b').merged_into).toBeNull();
});

it('asks the model nothing when nothing is proposed', async () => {
  db.mockReturnValue(memoryDb({ person_merges: [] }));
  expect(await settleProposedJoins({}, U)).toEqual({ pairs: 0, joined: 0 });
  expect(jsonCall).not.toHaveBeenCalled();
});

it('never joins on its own a pair they decided on their people page and put back with Undo', async () => {
  const d = world();
  // Same person, then Undo, on the people page (personTaps.js)
  d.tables.person_merges.find((m) => m.id === 'm1').decided_at = '2026-10-20T09:00:00Z';
  db.mockReturnValue(d);
  answer();
  const out = await settleProposedJoins({}, U);
  expect(d.tables.person_merges.find((m) => m.id === 'm1').status).toBe('proposed');
  expect(d.tables.life_people.find((p) => p.id === 'p-b').merged_into).toBeNull();
  expect(out.pairs).toBe(2);
});
