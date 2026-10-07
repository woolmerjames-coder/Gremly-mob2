/**
 * @jest-environment node
 *
 * The check on who someone is (context/people.js, data fabric stage 4c): a
 * name or who someone is reaches a record only when the person's own words
 * state it, and never holds one of code's own refs. A record the check finds
 * nothing true in is not made, and records made before the check are checked
 * once.
 */
import {
  planPeople,
  peopleLines,
  mentionsRef,
  whoEntries,
  applyWhoCheck,
  checkPlan,
  recheckPeople,
  writePeople,
} from '../people.js';
import { jsonCall } from '../llm.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../db.js', () => ({ db: jest.fn() }));

let n = 0;
const newId = () => `new-${++n}`;
beforeEach(() => {
  n = 0;
  jsonCall.mockReset();
});

describe("code's own refs", () => {
  it('are never a name or who someone is', () => {
    const refs = new Set(['p1', 'n1', 'f3']);
    expect(mentionsRef('parent of n1', refs)).toBe(true);
    expect(mentionsRef('N1', refs)).toBe(true);
    expect(mentionsRef('parent of Sam', refs)).toBe(false);
    expect(mentionsRef('n10', refs)).toBe(false);
    expect(mentionsRef(null, refs)).toBe(false);
  });

  it('are refused by the plan, which keeps the rest of the mention', () => {
    const plan = planPeople({
      known: peopleLines([]).ref,
      facts: [
        {
          factId: 'f-1',
          people: [
            { ref: null, new_ref: 'n1', name: 'Ada', relationship: null },
            { ref: null, new_ref: 'n2', name: null, relationship: 'parent of n1' },
          ],
        },
      ],
      userId: 'u',
      runId: 'r',
      refs: ['f1'],
      newId,
    });
    expect(plan.refused_refs).toBe(1);
    // with nothing left to know them by, the second mention makes no record
    expect(plan.creates.map((c) => c.name)).toEqual(['Ada']);
  });
});

const fact = (factId, people) => ({ factId, people });

function planOf(...facts) {
  return planPeople({ known: peopleLines([]).ref, facts, userId: 'u', runId: 'r', newId });
}

describe('what is checked', () => {
  it('is every new or changed name and who, with the words each comes from', () => {
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: null }]),
      fact('f-2', [{ ref: null, new_ref: 'n2', name: null, relationship: 'neighbour' }]),
    );
    const words = { 'f-1': 'lunch with Bo', 'f-2': 'my neighbour fixed the fence' };
    expect(whoEntries(plan, (id) => words[id] || null)).toEqual([
      { id: 'new-1', name: 'Bo', nameWords: 'lunch with Bo', relationship: null, whoWords: null },
      {
        id: 'new-2',
        name: null,
        nameWords: null,
        relationship: 'neighbour',
        whoWords: 'my neighbour fixed the fence',
      },
    ]);
  });
});

describe('applying the check', () => {
  it('clears a who the words do not state, and a name that is only who they are', () => {
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: 'cousin' }]),
      fact('f-2', [{ ref: null, new_ref: 'n2', name: 'Gran', relationship: 'grandmother' }]),
    );
    applyWhoCheck(
      plan,
      new Map([
        ['new-1', { who_holds: false, name_holds: true }],
        ['new-2', { who_holds: true, name_holds: false }],
      ]),
      'T',
    );
    const [bo, gran] = plan.creates;
    expect(bo).toMatchObject({
      name: 'Bo',
      relationship: null,
      relationship_fact_id: null,
      who_checked_at: 'T',
    });
    expect(gran).toMatchObject({ name: null, relationship: 'grandmother', who_checked_at: 'T' });
    expect(plan.names.map((x) => x.name)).toEqual(['Bo']);
    expect(plan).toMatchObject({ who_cleared: 1, names_cleared: 1 });
  });

  it('does not make someone it finds nothing true about, nor their ties or a merge for them', () => {
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: null, relationship: 'friend' }]),
    );
    plan.merges.push({ kept_id: 'p-x', merged_id: 'new-1' });
    applyWhoCheck(plan, new Map([['new-1', { who_holds: false, name_holds: null }]]));
    expect(plan.creates).toEqual([]);
    expect(plan.ties).toEqual([]);
    expect(plan.merges).toEqual([]);
    expect(plan.dropped).toBe(1);
  });

  it('leaves a record the check did not answer for unchecked, for the weekly pass', () => {
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: null }]),
    );
    applyWhoCheck(plan, new Map());
    expect(plan.creates[0].who_checked_at).toBeNull();
    expect(plan.creates[0].name).toBe('Bo');
  });

  it('writes new people in one insert when the check answered for only some of them', async () => {
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: null }]),
      fact('f-2', [{ ref: null, new_ref: 'n2', name: 'Cy', relationship: null }]),
    );
    applyWhoCheck(plan, new Map([['new-1', { who_holds: null, name_holds: true }]]), 'T');
    const mem = memoryDb({ life_people: [] });
    await writePeople(mem, 'u', plan);
    expect(mem.tables.life_people.map((p) => [p.name, p.who_checked_at])).toEqual([
      ['Bo', 'T'],
      ['Cy', null],
    ]);
  });

  it('checks a change to someone known, and drops only what does not hold', () => {
    const known = peopleLines([
      {
        id: 'p-sam',
        name: 'Sam',
        names: ['Sam'],
        relationship: null,
        name_by: 'gremly',
        relationship_by: 'gremly',
      },
    ]).ref;
    const plan = planPeople({
      known,
      facts: [fact('f-3', [{ ref: 'p1', name: null, relationship: 'manager' }])],
      userId: 'u',
      runId: 'r',
      newId,
    });
    applyWhoCheck(plan, new Map([['p-sam', { who_holds: false, name_holds: null }]]));
    expect(plan.updates.has('p-sam')).toBe(false);
    expect(plan.ties).toHaveLength(1);
  });
});

describe('checking a plan', () => {
  it('asks once for every entry and applies what comes back', async () => {
    jsonCall.mockResolvedValue({
      output: { checks: [{ ref: 'r1', who_holds: false, name_holds: null }] },
      model: 'check',
    });
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: null, relationship: 'friend' }]),
    );
    await checkPlan({}, plan, { wordsOf: () => 'it was a sad day' });
    expect(jsonCall).toHaveBeenCalledTimes(1);
    const req = jsonCall.mock.calls[0][1];
    expect(req.user).toContain('r1 | no name | who "friend", from their words "it was a sad day"');
    expect(plan.creates).toEqual([]);
  });

  it('keeps a name or who only when the check says it holds', async () => {
    jsonCall.mockResolvedValue({
      output: { checks: [{ ref: 'r1', who_holds: null, name_holds: true }] },
      model: 'check',
    });
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: 'cousin' }]),
    );
    await checkPlan({}, plan, { wordsOf: () => null });
    expect(plan.creates[0]).toMatchObject({ name: 'Bo', relationship: null });
    expect(plan.who_cleared).toBe(1);
  });

  it('writes the plan unchecked when the check cannot be made, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jsonCall.mockRejectedValue(new Error('down'));
    const plan = planOf(
      fact('f-1', [{ ref: null, new_ref: 'n1', name: 'Bo', relationship: null }]),
    );
    await checkPlan({}, plan, { wordsOf: () => null });
    expect(plan.creates[0].name).toBe('Bo');
    expect(plan.unchecked).toBe(1);
    expect(warn.mock.calls[0][0]).toMatch(/\[ALERT\]\[People\]/);
    warn.mockRestore();
  });

  it('asks nothing when the plan gives no one a name or a who', async () => {
    const plan = planOf();
    await checkPlan({}, plan, { wordsOf: () => null });
    expect(jsonCall).not.toHaveBeenCalled();
  });
});

describe('records made before the check', () => {
  const people = () => [
    // Gremly's who, which the words do not state: cleared
    {
      id: 'p-1',
      user_id: 'u',
      name: 'Ola',
      name_by: 'gremly',
      relationship: 'friend',
      relationship_by: 'gremly',
      relationship_fact_id: 'f-1',
      merged_into: null,
      who_checked_at: null,
      created_at: '1',
    },
    // known only by a who that does not hold: goes, with its ties
    {
      id: 'p-2',
      user_id: 'u',
      name: null,
      name_by: 'gremly',
      relationship: 'parent of n1',
      relationship_by: 'gremly',
      relationship_fact_id: 'f-2',
      merged_into: null,
      who_checked_at: null,
      created_at: '2',
    },
    // a name that is only who they are, beside a who that holds: the name goes
    {
      id: 'p-3',
      user_id: 'u',
      name: 'Mum',
      name_by: 'gremly',
      relationship: 'mum',
      relationship_by: 'gremly',
      relationship_fact_id: 'f-3',
      merged_into: null,
      who_checked_at: null,
      created_at: '3',
    },
    // what the person wrote is theirs: not checked, marked checked
    {
      id: 'p-4',
      user_id: 'u',
      name: 'Kit',
      name_by: 'person',
      relationship: 'sister',
      relationship_by: 'person',
      relationship_fact_id: null,
      merged_into: null,
      who_checked_at: null,
      created_at: '4',
    },
    // already checked: left alone
    {
      id: 'p-5',
      user_id: 'u',
      name: 'Rae',
      name_by: 'gremly',
      relationship: null,
      relationship_by: 'gremly',
      relationship_fact_id: null,
      merged_into: null,
      who_checked_at: '2026-10-01',
      created_at: '5',
    },
  ];
  const tables = () => ({
    life_people: people(),
    life_person_names: [
      { person_id: 'p-1', user_id: 'u', name: 'Ola', fact_id: 'f-1', by: 'gremly' },
      { person_id: 'p-3', user_id: 'u', name: 'Mum', fact_id: 'f-3', by: 'gremly' },
    ],
    life_facts: [
      { id: 'f-1', user_id: 'u', source_quote: 'dinner with Ola' },
      { id: 'f-2', user_id: 'u', source_quote: 'they came for the weekend' },
      { id: 'f-3', user_id: 'u', source_quote: 'call Mum on Sunday' },
    ],
    life_fact_people: [{ fact_id: 'f-2', person_id: 'p-2', user_id: 'u' }],
  });
  const verdicts = {
    output: {
      checks: [
        { ref: 'r1', who_holds: false, name_holds: true },
        { ref: 'r2', who_holds: false, name_holds: null },
        { ref: 'r3', who_holds: true, name_holds: false },
      ],
    },
    model: 'check',
  };

  it('clears what the words do not state, once, and leaves what the person wrote', async () => {
    const mem = memoryDb(tables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(verdicts);
    const out = await recheckPeople({}, 'u');
    expect(out).toMatchObject({
      records: 4,
      checked: 3,
      who_cleared: 2,
      names_cleared: 1,
      removed: 1,
    });
    const byId = new Map(mem.tables.life_people.map((p) => [p.id, p]));
    expect(byId.get('p-1')).toMatchObject({
      name: 'Ola',
      relationship: null,
      relationship_fact_id: null,
    });
    expect(byId.has('p-2')).toBe(false);
    expect(byId.get('p-3')).toMatchObject({ name: null, relationship: 'mum' });
    expect(mem.tables.life_person_names.map((x) => x.name)).toEqual(['Ola']);
    expect(byId.get('p-4')).toMatchObject({ name: 'Kit', relationship: 'sister' });
    for (const id of ['p-1', 'p-3', 'p-4']) expect(byId.get(id).who_checked_at).toBeTruthy();
    // the check was shown only Gremly's words, with the words they came from
    const req = jsonCall.mock.calls[0][1].user;
    expect(req).toContain('r1 | name "Ola", from their words "dinner with Ola"');
    expect(req).not.toContain('Kit');
    expect(req).not.toContain('Rae');
  });

  it('writes nothing in shadow, and says what would change', async () => {
    const mem = memoryDb(tables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(verdicts);
    const out = await recheckPeople({}, 'u', { shadow: true });
    expect(out.changes.map((c) => [c.id, !!c.removed])).toEqual([
      ['p-1', false],
      ['p-2', true],
      ['p-3', false],
    ]);
    expect(mem.tables.life_people).toEqual(people());
  });

  it('keeps a record another was merged into', async () => {
    const t = tables();
    t.life_people.push({
      id: 'p-9',
      user_id: 'u',
      name: 'Old',
      relationship: null,
      merged_into: 'p-2',
      who_checked_at: '2026-10-01',
    });
    const mem = memoryDb(t);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(verdicts);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await recheckPeople({}, 'u');
    expect(out).toMatchObject({ removed: 0, kept_theirs: 1 });
    // left as it is, and checked, so it is raised once
    expect(mem.tables.life_people.find((p) => p.id === 'p-2')).toMatchObject({
      relationship: 'parent of n1',
    });
    expect(mem.tables.life_people.find((p) => p.id === 'p-2').who_checked_at).toBeTruthy();
    expect(warn.mock.calls[0][0]).toMatch(/\[ALERT\]\[People\].*merged into it/);
    warn.mockRestore();
  });

  it('never removes a record they hid, or one in a merge they decided or a Chapter they chose', async () => {
    for (const add of [
      (t) => Object.assign(t.life_people[1], { hidden_at: '2026-10-02' }),
      (t) => {
        t.person_merges = [
          { id: 'm-1', user_id: 'u', kept_id: 'p-1', merged_id: 'p-2', status: 'declined' },
        ];
      },
      (t) => {
        t.chapter_people = [
          { chapter_id: 'c-1', person_id: 'p-2', user_id: 'u', written_by: 'person' },
        ];
      },
    ]) {
      const t = tables();
      add(t);
      const mem = memoryDb(t);
      db.mockReturnValue(mem);
      jsonCall.mockResolvedValue(verdicts);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const out = await recheckPeople({}, 'u');
      expect(out.removed).toBe(0);
      expect(mem.tables.life_people.some((p) => p.id === 'p-2')).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    }
  });

  it("removes a record when only proposals and Gremly's own Chapter links rest on it", async () => {
    const t = tables();
    t.person_merges = [
      { id: 'm-1', user_id: 'u', kept_id: 'p-1', merged_id: 'p-2', status: 'proposed' },
    ];
    t.chapter_people = [
      { chapter_id: 'c-1', person_id: 'p-2', user_id: 'u', written_by: 'gremly' },
    ];
    const mem = memoryDb(t);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(verdicts);
    expect((await recheckPeople({}, 'u')).removed).toBe(1);
    expect(mem.tables.life_people.some((p) => p.id === 'p-2')).toBe(false);
  });

  it('leaves a record unchecked when the check gives no answer for what Gremly holds', async () => {
    const mem = memoryDb(tables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: {
        checks: [
          { ref: 'r1', who_holds: null, name_holds: true },
          { ref: 'r2', who_holds: null, name_holds: null },
          { ref: 'r3', who_holds: true, name_holds: true },
        ],
      },
      model: 'check',
    });
    const out = await recheckPeople({}, 'u');
    expect(out).toMatchObject({ checked: 1, who_cleared: 0, removed: 0 });
    const byId = new Map(mem.tables.life_people.map((p) => [p.id, p]));
    expect(byId.get('p-1')).toMatchObject({ relationship: 'friend', who_checked_at: null });
    expect(byId.get('p-2')).toMatchObject({ relationship: 'parent of n1', who_checked_at: null });
    // checked and kept: its place among the people the reader knows does not move
    expect(byId.get('p-3').who_checked_at).toBeTruthy();
    expect(byId.get('p-3').updated_at).toBeUndefined();
  });

  it('gives the check every quote kept for a fact', async () => {
    const t = tables();
    t.life_fact_sources = [
      { fact_id: 'f-1', user_id: 'u', quote: 'Ola is my oldest friend' },
      { fact_id: 'f-1', user_id: 'u', quote: null },
    ];
    const mem = memoryDb(t);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(verdicts);
    await recheckPeople({}, 'u');
    expect(jsonCall.mock.calls[0][1].user).toContain(
      '"dinner with Ola ... Ola is my oldest friend"',
    );
  });

  it('checks a long list in batches, so every answer fits', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      id: `q-${i}`,
      user_id: 'u',
      name: `N${i}`,
      name_by: 'gremly',
      relationship: null,
      relationship_by: 'gremly',
      relationship_fact_id: null,
      merged_into: null,
      who_checked_at: null,
      created_at: String(10 + i),
    }));
    const mem = memoryDb({ life_people: many, life_person_names: [], life_facts: [] });
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({ output: { checks: [] }, model: 'check' });
    await recheckPeople({}, 'u');
    expect(jsonCall).toHaveBeenCalledTimes(2);
    expect(jsonCall.mock.calls[1][1].user).toContain('r5 | name "N44"');
  });

  it('keeps what one batch answered when another cannot be checked, and says so', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      id: `q-${i}`,
      user_id: 'u',
      name: `N${i}`,
      name_by: 'gremly',
      relationship: null,
      relationship_by: 'gremly',
      relationship_fact_id: null,
      merged_into: null,
      who_checked_at: null,
      created_at: String(10 + i),
    }));
    const mem = memoryDb({ life_people: many, life_person_names: [], life_facts: [] });
    db.mockReturnValue(mem);
    jsonCall.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({
      output: { checks: [{ ref: 'r1', who_holds: null, name_holds: true }] },
      model: 'check',
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await recheckPeople({}, 'u');
    expect(out.checked).toBe(1);
    expect(mem.tables.life_people.find((p) => p.id === 'q-40').who_checked_at).toBeTruthy();
    expect(mem.tables.life_people.find((p) => p.id === 'q-0').who_checked_at).toBeNull();
    expect(warn.mock.calls[0][0]).toMatch(/\[ALERT\]\[People\].*40 records/);
    warn.mockRestore();
  });
});
