/**
 * @jest-environment node
 *
 * The kind pass (workers/inngest-jobs/context/kinds.js): the model judges each
 * fact's kind, its timing and whether it concerns health; code keeps only
 * answers on their lists and writes them, and never changes a date.
 */
import { giveKinds, kindsRequest } from '../kinds.js';
import { FACT_KINDS, validKind, KIND_RULES } from '../../../shared/factKinds.js';
import {
  FACT_TIMINGS,
  TIMING_RULES,
  validTiming,
  nextYearly,
  dayOn,
  factTiming,
} from '../../../shared/factTiming.js';
import { db } from '../db';
import { jsonCall } from '../llm';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: () => 'model' }));

const FACTS = [
  { id: 'a', statement: 'Alex has a dentist appointment on Thursday.', about_date: '2026-10-08' },
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
    expect(user).toContain('f1 | 2026-10-08 | Alex has a dentist appointment on Thursday.');
    expect(user).toContain("f2 | no date | Jo is Alex's partner.");
    expect(ref.get('f3').id).toBe('c');
  });
});

describe('when a fact is true', () => {
  it('is one of four timings, each in the rule', () => {
    expect(FACT_TIMINGS).toEqual(['day', 'span', 'standing', 'yearly']);
    for (const t of FACT_TIMINGS) expect(TIMING_RULES).toContain(`${t}:`);
    expect(validTiming('yearly')).toBe('yearly');
    expect(validTiming('weekly')).toBeNull();
  });

  it('brings a yearly date round again, on the 28th in a year with no 29 February', () => {
    expect(nextYearly('2025-11-12', '2026-11-12')).toBe('2026-11-12');
    expect(nextYearly('2025-11-12', '2026-11-13')).toBe('2027-11-12');
    expect(nextYearly('2024-02-29', '2026-01-10')).toBe('2026-02-28');
    expect(nextYearly('2024-02-29', '2028-01-10')).toBe('2028-02-29');
    expect(nextYearly('1985-03-03', '2026-10-07')).toBe('2027-03-03');
    expect(nextYearly(null, '2026-10-07')).toBeNull();
  });

  it('reads a standing fact as undated and a yearly one as never passed', () => {
    const today = '2026-11-12';
    expect(dayOn({ about_date: '2026-10-20', timing: 'standing' }, today)).toBeNull();
    expect(factTiming({ about_date: '2026-10-20', timing: 'standing' }, today)).toBe('undated');
    expect(dayOn({ about_date: '2025-11-12', timing: 'yearly' }, today)).toBe('2026-11-12');
    expect(factTiming({ about_date: '2025-11-12', timing: 'yearly' }, today)).toBe('now');
    expect(factTiming({ about_date: '2025-03-01', timing: 'yearly' }, today)).toBe('ahead');
    expect(factTiming({ about_date: '2026-10-20', timing: 'day' }, today)).toBe('passed');
    expect(factTiming({ about_date: '2026-10-20' }, today)).toBe('passed');
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
    expect(reads[0]).toContain('timing.is.null');
  });

  it('never judges again a health flag a fact already has', async () => {
    const { writes } = fakeDb([
      {
        id: 'a',
        statement: 'Alex has physio on Thursday.',
        kind: 'event',
        health: true,
        timing: null,
      },
      {
        id: 'b',
        statement: 'Alex calls their mum on Sundays.',
        kind: null,
        health: null,
        timing: null,
      },
    ]);
    jsonCall.mockResolvedValue({
      output: {
        facts: [
          { ref: 'f1', kind: 'event', timing: 'day', health: false },
          { ref: 'f2', kind: 'routine', timing: 'standing', health: false },
        ],
      },
      model: 'm',
    });
    await giveKinds({}, 'u-1');
    const health = writes.filter((w) => 'health' in w.patch);
    expect(health).toEqual([
      { path: 'life_facts?user_id=eq.u-1&id=in.(b)', patch: { health: false } },
    ]);
  });

  it('writes each timing, and never a date', async () => {
    const { writes } = fakeDb();
    jsonCall.mockResolvedValue({
      output: {
        facts: [
          { ref: 'f1', kind: 'event', timing: 'day', health: false },
          { ref: 'f2', kind: 'relationship', timing: 'standing', health: false },
          { ref: 'f3', kind: 'routine', timing: 'sometimes', health: false },
        ],
      },
      model: 'm',
    });
    const out = await giveKinds({}, 'u-1');
    expect(out.timings).toBe(2);
    expect(writes.filter((w) => 'timing' in w.patch)).toEqual([
      { path: 'life_facts?user_id=eq.u-1&id=in.(a)', patch: { timing: 'day' } },
      { path: 'life_facts?user_id=eq.u-1&id=in.(b)', patch: { timing: 'standing' } },
    ]);
    expect(writes.some((w) => 'about_date' in w.patch)).toBe(false);
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
    expect(out.judged).toEqual([{ id: 'a', kind: 'event', timing: null, health: false }]);
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
