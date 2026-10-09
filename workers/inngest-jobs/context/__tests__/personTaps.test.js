/**
 * A merge Gremly proposed, decided by a tap on the people page (Worlds
 * rebuild, stage 5): Same person makes the two one, Not the same keeps them
 * apart, Undo puts either back as proposed, and a question about the same two
 * is answered by the tap and opened again by Undo.
 */
import { memoryDb } from './memoryDb.js';

const mockDb = { current: null };
jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: () => mockDb.current,
}));
jest.mock('../../../shared/chatCache.js', () => ({
  invalidateChatCache: jest.fn(() => Promise.resolve()),
}));

import { decidePersonMerge, handlePersonMergeApi, TAPPED_ANSWER } from '../personTaps';

const U = '00000000-0000-4000-8000-000000000001';
const KEPT = '00000000-0000-4000-8000-0000000000a1';
const MERGED = '00000000-0000-4000-8000-0000000000a2';
const M = '00000000-0000-4000-8000-0000000000b1';
const F1 = '00000000-0000-4000-8000-0000000000f1';
const AT = '2026-10-20T09:00:00.000Z';

function world({ status = 'proposed', question = 'asked' } = {}) {
  return memoryDb({
    person_merges: [{ id: M, user_id: U, kept_id: KEPT, merged_id: MERGED, status, moved: null }],
    life_people: [
      {
        id: KEPT,
        user_id: U,
        name: 'Jules',
        name_by: 'gremly',
        relationship: null,
        relationship_by: 'gremly',
        relationship_fact_id: null,
        merged_into: null,
      },
      {
        id: MERGED,
        user_id: U,
        name: null,
        name_by: 'gremly',
        relationship: 'partner',
        relationship_by: 'gremly',
        relationship_fact_id: F1,
        merged_into: null,
      },
    ],
    life_person_names: [{ person_id: MERGED, user_id: U, name: 'J', fact_id: null, by: 'gremly' }],
    life_fact_people: [{ fact_id: F1, person_id: MERGED, user_id: U }],
    gremly_questions: [
      {
        id: 'q1',
        user_id: U,
        kind: 'person',
        status: question,
        answer: null,
        answered_at: null,
        proposed_change: { type: 'same', merge_id: M, kept_id: KEPT, merged_id: MERGED },
      },
      {
        id: 'q2',
        user_id: U,
        kind: 'person',
        status: 'asked',
        answer: null,
        answered_at: null,
        proposed_change: { type: 'who', person_id: KEPT },
      },
    ],
  });
}
const row = (t, id) => mockDb.current.tables[t].find((r) => r.id === id || r.person_id === id);

it('Same person makes the two one, answers the question about them, and Undo puts both back as proposed', async () => {
  mockDb.current = world();
  const r = await decidePersonMerge({}, { userId: U, mergeId: M, act: 'merge', at: AT });
  expect(r).toMatchObject({ ok: true, merged: true, kept_id: KEPT, merged_id: MERGED });
  expect(row('life_people', MERGED).merged_into).toBe(KEPT);
  // who they are came across to the record that had none
  expect(row('life_people', KEPT).relationship).toBe('partner');
  expect(
    mockDb.current.tables.life_fact_people.some((t) => t.person_id === KEPT && t.fact_id === F1),
  ).toBe(true);
  expect(row('gremly_questions', 'q1')).toMatchObject({
    status: 'answered',
    answer: TAPPED_ANSWER.merge,
    answered_at: AT,
  });
  // a question about something else is left alone
  expect(row('gremly_questions', 'q2').status).toBe('asked');

  const back = await decidePersonMerge({}, { userId: U, mergeId: M, act: 'undo', at: AT });
  expect(back).toMatchObject({ ok: true, undone: true });
  expect(row('life_people', MERGED).merged_into).toBeNull();
  expect(row('life_people', KEPT).relationship).toBeNull();
  expect(row('person_merges', M)).toMatchObject({ status: 'proposed', decided_at: null });
  expect(row('gremly_questions', 'q1')).toMatchObject({ status: 'asked', answer: null });
});

it('Not the same keeps them apart, and Undo proposes it again', async () => {
  mockDb.current = world();
  const r = await decidePersonMerge({}, { userId: U, mergeId: M, act: 'decline', at: AT });
  expect(r).toMatchObject({ ok: true, declined: true });
  expect(row('person_merges', M).status).toBe('declined');
  expect(row('life_people', MERGED).merged_into).toBeNull();
  expect(row('gremly_questions', 'q1').answer).toBe(TAPPED_ANSWER.decline);
  const back = await decidePersonMerge({}, { userId: U, mergeId: M, act: 'undo', at: AT });
  expect(back.ok).toBe(true);
  expect(row('person_merges', M).status).toBe('proposed');
});

it('changes nothing for a merge already decided, or not theirs', async () => {
  mockDb.current = world({ status: 'declined', question: 'answered' });
  const r = await decidePersonMerge({}, { userId: U, mergeId: M, act: 'merge', at: AT });
  expect(r.ok).toBe(false);
  expect(row('life_people', MERGED).merged_into).toBeNull();
  const other = await decidePersonMerge(
    {},
    { userId: '00000000-0000-4000-8000-000000000009', mergeId: M, act: 'decline', at: AT },
  );
  expect(other).toEqual({ ok: false, reason: 'not found' });
  expect(row('person_merges', M).status).toBe('declined');
});

it('an answer they gave in their own words is not opened again by Undo', async () => {
  mockDb.current = world();
  await decidePersonMerge({}, { userId: U, mergeId: M, act: 'merge', at: AT });
  row('gremly_questions', 'q1').answer = 'yes, Jules is my partner';
  await decidePersonMerge({}, { userId: U, mergeId: M, act: 'undo', at: AT });
  expect(row('gremly_questions', 'q1').status).toBe('answered');
});

it('the route wants a merge and a tap it knows', async () => {
  mockDb.current = world();
  const res = (body) =>
    handlePersonMergeApi({ json: async () => body }, {}, (b, s = 200) => ({ b, s }));
  expect((await res({ user_id: U, merge_id: M, act: 'shrug' })).s).toBe(400);
  expect(
    (await res({ user_id: U, merge_id: '00000000-0000-4000-8000-0000000000ee', act: 'merge' })).s,
  ).toBe(404);
  const ok = await res({ user_id: U, merge_id: M, act: 'decline' });
  expect(ok.s).toBe(200);
  expect(ok.b).toMatchObject({ ok: true, declined: true });
});
