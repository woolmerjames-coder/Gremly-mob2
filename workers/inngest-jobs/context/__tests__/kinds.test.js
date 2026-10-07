/**
 * @jest-environment node
 *
 * The kind pass (workers/inngest-jobs/context/kinds.js): the model judges each
 * fact's kind and whether it concerns health; code keeps only kinds on the
 * list and writes them.
 */
import { giveKinds, kindsRequest } from '../kinds.js';
import { FACT_KINDS, validKind, KIND_RULES } from '../../../shared/factKinds.js';
import { db } from '../db';
import { jsonCall } from '../llm';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: () => 'model' }));

const FACTS = [
  { id: 'a', statement: 'Alex has a dentist appointment on Thursday.' },
  { id: 'b', statement: "Jo is Alex's partner." },
  { id: 'c', statement: 'Alex walks the dog every morning.' },
];

function fakeDb(rows = FACTS) {
  const writes = [];
  const reads = [];
  db.mockReturnValue({
    select: async (path) => {
      reads.push(path);
      return rows;
    },
    update: async (path, patch) => {
      writes.push({ path, patch });
      return [];
    },
  });
  return { writes, reads };
}

beforeEach(() => jest.clearAllMocks());

describe('the kinds', () => {
  it('are seven, each answering what sort of statement a fact is', () => {
    expect(FACT_KINDS).toEqual([
      'event',
      'routine',
      'goal',
      'preference',
      'relationship',
      'situation',
      'self',
    ]);
    for (const k of FACT_KINDS) expect(KIND_RULES).toContain(`${k}:`);
  });

  it('keep only a kind on the list', () => {
    expect(validKind('event')).toBe('event');
    expect(validKind('todo')).toBeNull();
    expect(validKind(null)).toBeNull();
  });

  it('show the model each fact once, by a ref, and nothing else about the person', () => {
    const { user, ref } = kindsRequest(FACTS);
    expect(user).toContain('f1 | Alex has a dentist appointment on Thursday.');
    expect(user).toContain("f2 | Jo is Alex's partner.");
    expect(ref.get('f3').id).toBe('c');
  });
});

describe('the kind pass', () => {
  it('asks only for facts without a kind from the list or a health flag', async () => {
    const { reads } = fakeDb();
    jsonCall.mockResolvedValue({ output: { facts: [] }, model: 'm' });
    await giveKinds({}, 'u-1');
    expect(reads[0]).toContain('user_id=eq.u-1');
    expect(reads[0]).toContain('kind.is.null');
    expect(reads[0]).toContain(`kind.not.in.(${FACT_KINDS.join(',')})`);
    expect(reads[0]).toContain('health.is.null');
  });

  it('writes each kind and each health answer for that person only', async () => {
    const { writes } = fakeDb();
    jsonCall.mockResolvedValue({
      output: {
        facts: [
          { ref: 'f1', kind: 'event', health: true },
          { ref: 'f2', kind: 'relationship', health: false },
          { ref: 'f3', kind: 'routine', health: false },
        ],
      },
      model: 'm',
    });
    const out = await giveKinds({}, 'u-1');
    expect(out).toMatchObject({ given: 3, health: 1, left_out: 0, calls: 1 });
    expect(writes).toEqual(
      expect.arrayContaining([
        { path: 'life_facts?user_id=eq.u-1&id=in.(a)', patch: { kind: 'event' } },
        { path: 'life_facts?user_id=eq.u-1&id=in.(b)', patch: { kind: 'relationship' } },
        { path: 'life_facts?user_id=eq.u-1&id=in.(c)', patch: { kind: 'routine' } },
        { path: 'life_facts?user_id=eq.u-1&id=in.(a)', patch: { health: true } },
        { path: 'life_facts?user_id=eq.u-1&id=in.(b,c)', patch: { health: false } },
      ]),
    );
  });

  it('leaves a fact without a kind when the model gives one off the list, or none, or an unknown ref', async () => {
    const { writes } = fakeDb();
    jsonCall.mockResolvedValue({
      output: {
        facts: [
          { ref: 'f1', kind: 'todo', health: false },
          { ref: 'f9', kind: 'event', health: false },
          { ref: 'f2', kind: 'relationship', health: false },
          { ref: 'f2', kind: 'self', health: false },
        ],
      },
      model: 'm',
    });
    const out = await giveKinds({}, 'u-1');
    expect(out).toMatchObject({ given: 1, left_out: 2 });
    expect(writes.filter((w) => w.patch.kind)).toEqual([
      { path: 'life_facts?user_id=eq.u-1&id=in.(b)', patch: { kind: 'relationship' } },
    ]);
  });

  it('keeps a kind a fact already has from the list, and asks only for its health flag', async () => {
    const { writes } = fakeDb([
      { id: 'a', statement: 'Alex has a dentist appointment on Thursday.', kind: 'event' },
    ]);
    jsonCall.mockResolvedValue({
      output: { facts: [{ ref: 'f1', kind: 'situation', health: true }] },
      model: 'm',
    });
    await giveKinds({}, 'u-1');
    expect(writes.some((w) => w.patch.kind)).toBe(false);
    expect(writes).toEqual([
      { path: 'life_facts?user_id=eq.u-1&id=in.(a)', patch: { health: true } },
    ]);
  });

  it('writes nothing in shadow, and says what it would have given', async () => {
    const { writes } = fakeDb();
    jsonCall.mockResolvedValue({
      output: { facts: [{ ref: 'f1', kind: 'event', health: false }] },
      model: 'm',
    });
    const out = await giveKinds({}, 'u-1', { shadow: true });
    expect(writes).toHaveLength(0);
    expect(out.judged).toEqual([{ id: 'a', kind: 'event', health: false }]);
  });

  it('sends a hundred facts to a call', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `x${i}`, statement: `Fact ${i}` }));
    fakeDb(many);
    jsonCall.mockResolvedValue({ output: { facts: [] }, model: 'm' });
    const out = await giveKinds({}, 'u-1');
    expect(out.calls).toBe(3);
    expect(jsonCall.mock.calls[0][1].user.split('\n')).toHaveLength(101);
  });
});
