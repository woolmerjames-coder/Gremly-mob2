/**
 * @jest-environment node
 *
 * What Gremly is not sure of yet, and who matters most (context/unsure.js):
 * the weekly pass says what it thinks but no record states, and code applies
 * only what it gives, to the refs it was given, never resting on anything
 * private, never guessing who someone is once it is recorded.
 */
import {
  peopleEvidence,
  evidenceWords,
  unsureLines,
  unsurePlan,
  applyUnsure,
  UNSURE_FADE_DAYS,
} from '../unsure.js';
import { renderWeek, weeklyRecords, weeklyShapeProblems } from '../weekly.js';
import { memoryDb } from './memoryDb.js';

const TODAY = '2026-10-18';

describe('how a person comes up', () => {
  const facts = new Map([
    ['f-1', { id: 'f-1', observed_at: '2026-10-10T09:00:00Z', state: 'current' }],
    ['f-2', { id: 'f-2', observed_at: '2026-07-01T09:00:00Z', state: 'happened' }],
    ['f-3', { id: 'f-3', observed_at: '2026-10-12T09:00:00Z', state: 'current', private: true }],
    ['f-4', { id: 'f-4', observed_at: '2026-10-14T09:00:00Z', state: 'corrected' }],
  ]);
  const ties = ['f-1', 'f-2', 'f-3', 'f-4'].map((fact_id) => ({ fact_id, person_id: 'p-1' }));

  it('counts only facts that can be shown and still stand, with the refs the pass sees them by', () => {
    const e = peopleEvidence({ ties, facts, refOfFact: new Map([['f-1', 'f7']]), today: TODAY });
    expect(e.get('p-1')).toEqual({ facts: 2, lately: 1, latest: '2026-10-10', refs: ['f7'] });
    expect(evidenceWords(e.get('p-1'))).toBe('in 2 facts, 1 recorded in the last 30 days, latest 2026-10-10: f7');
    expect(evidenceWords(undefined)).toBe('not yet in any fact that can be shown');
  });
});

describe('what the pass is given of what Gremly thought before', () => {
  it('is each open entry about them or someone listed, by a ref of its own', () => {
    const refs = new Map();
    const add = (prefix, obj) => {
      const ref = `${prefix}${[...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
      refs.set(ref, obj);
      return ref;
    };
    const lines = unsureLines(
      [
        { id: 'u-a', person_id: 'p-1', kind: 'who', thinks: 'Ada may be their sister', sure: 'medium', created_at: '2026-10-04T00:00:00Z' },
        { id: 'u-b', person_id: null, kind: 'life', thinks: 'They may work nights', sure: 'low', created_at: '2026-10-04T00:00:00Z' },
        { id: 'u-c', person_id: 'p-gone', kind: 'who', thinks: 'x', sure: 'low', created_at: '2026-10-04T00:00:00Z' },
      ],
      new Map([['p-1', 'p3']]),
      add,
    );
    expect(lines).toEqual([
      'u1 | p3 | who they are | Ada may be their sister | medium | since 2026-10-04',
      'u2 | self | about their life | They may work nights | low | since 2026-10-04',
    ]);
    expect(refs.get('u1')).toEqual({ type: 'unsure', id: 'u-a', person_id: 'p-1', kind: 'who' });
  });
});

describe('what the pass gives, as writes', () => {
  const refs = new Map([
    ['p1', { type: 'person', id: 'p-1', name: 'Ada', relationship: null }],
    ['p2', { type: 'person', id: 'p-2', name: 'Bo', relationship: 'brother' }],
    ['f1', { type: 'fact', id: 'f-1' }],
    ['f2', { type: 'fact', id: 'f-2', private: true }],
    ['j1', { type: 'journal', id: 'n-1' }],
    ['n1', { type: 'count', paths: [] }],
    ['u1', { type: 'unsure', id: 'u-old', person_id: 'p-1', kind: 'who' }],
    ['u2', { type: 'unsure', id: 'u-life', person_id: null, kind: 'life' }],
  ]);
  const people = new Map([
    ['p-1', { relationship: null }],
    ['p-2', { relationship: 'brother' }],
    ['p-3', { relationship: null, merged_into: 'p-1' }],
  ]);
  const item = (x) => ({ about_ref: 'self', kind: 'life', thinks: 'They may run most mornings', refs: ['f1'], sure: 'medium', same_as: '', ...x });

  it('keeps what rests on records it was given, and nothing private, recorded or about no one', () => {
    const plan = unsurePlan({
      output: {
        not_sure: [
          item({}),
          item({ refs: ['f1', 'f2'] }),
          item({ refs: ['n1'] }),
          item({ about_ref: 'p2', kind: 'who', thinks: 'Bo may be their twin' }),
          item({ about_ref: 'self', kind: 'who' }),
          item({ about_ref: 'p9' }),
          item({ thinks: '  ' }),
          item({ about_ref: 'p1', kind: 'life', thinks: 'Ada may live nearby', refs: ['j1', 'f1'] }),
        ],
        who_matters: ['p2', 'p1', 'p2', 'f1', 'p9'],
      },
      refs,
      people,
      today: TODAY,
    });
    expect(plan.inserts).toEqual([
      { person_id: null, kind: 'life', thinks: 'They may run most mornings', rests_on: [{ table: 'life_facts', id: 'f-1' }], sure: 'medium', status: 'open' },
      {
        person_id: 'p-1',
        kind: 'life',
        thinks: 'Ada may live nearby',
        rests_on: [
          { table: 'notes', id: 'n-1' },
          { table: 'life_facts', id: 'f-1' },
        ],
        sure: 'medium',
        status: 'open',
      },
    ]);
    expect(plan.dropped.map((d) => d.why)).toEqual([
      'rests on something private or about health',
      'rests on no record',
      'who they are is recorded',
      'who, about no one',
      'about no one it was given',
      'says nothing',
    ]);
    expect(plan.matters).toEqual([
      { person_id: 'p-2', rank: 1 },
      { person_id: 'p-1', rank: 2 },
    ]);
  });

  it('gives an earlier one again in place, by its ref or as the one guess at who someone is', () => {
    const open = [
      { id: 'u-old', person_id: 'p-1', kind: 'who', seen_at: '2026-10-11T00:00:00Z' },
      { id: 'u-life', person_id: null, kind: 'life', seen_at: '2026-10-11T00:00:00Z' },
    ];
    const plan = unsurePlan({
      output: {
        not_sure: [
          item({ same_as: 'u2', thinks: 'They may run before work', sure: 'high' }),
          item({ about_ref: 'p1', kind: 'who', thinks: 'Ada may be their sister' }),
        ],
        who_matters: [],
      },
      refs,
      open,
      people,
      today: TODAY,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      { id: 'u-life', patch: expect.objectContaining({ thinks: 'They may run before work', sure: 'high' }) },
      { id: 'u-old', patch: expect.objectContaining({ thinks: 'Ada may be their sister' }) },
    ]);
    expect(plan.fades).toEqual([]);
  });

  it('fades what is given again by no pass for a while, unless a question is asking about it', () => {
    const long = new Date(Date.parse(`${TODAY}T12:00:00Z`) - (UNSURE_FADE_DAYS + 1) * 864e5).toISOString();
    const open = [
      { id: 'u-a', person_id: null, kind: 'life', seen_at: long },
      { id: 'u-b', person_id: null, kind: 'life', seen_at: long },
      { id: 'u-c', person_id: null, kind: 'life', seen_at: '2026-10-11T00:00:00Z' },
      { id: 'u-d', person_id: 'p-3', kind: 'life', seen_at: '2026-10-11T00:00:00Z' },
      { id: 'u-e', person_id: 'p-2', kind: 'who', seen_at: '2026-10-11T00:00:00Z' },
    ];
    const plan = unsurePlan({ output: { not_sure: [] }, refs, open, people, asking: new Set(['u-b']), today: TODAY });
    expect(plan.fades).toEqual([
      { id: 'u-a', why: 'not given again' },
      { id: 'u-d', why: 'no longer on the list' },
      { id: 'u-e', why: 'recorded' },
    ]);
  });

  it('is applied as new, given again, faded, and who matters most, unranking those no longer named', async () => {
    const mem = memoryDb({
      life_unsure: [{ id: 'u-old', user_id: 'u', status: 'open', thinks: 'old' }, { id: 'u-f', user_id: 'u', status: 'open' }],
      life_people: [
        { id: 'p-1', user_id: 'u', matters_rank: 3 },
        { id: 'p-2', user_id: 'u', matters_rank: null },
      ],
    });
    const out = await applyUnsure(
      mem,
      'u',
      {
        inserts: [{ person_id: null, kind: 'life', thinks: 'new', rests_on: [], sure: 'low' }],
        updates: [{ id: 'u-old', patch: { thinks: 'again', rests_on: [], sure: 'high' } }],
        fades: [{ id: 'u-f', why: 'not given again' }],
        dropped: [],
        matters: [{ person_id: 'p-2', rank: 1 }],
      },
      {
        runId: 'r',
        promptVersion: 'v',
        nowIso: '2026-10-18T12:00:00Z',
        people: new Map([
          ['p-1', { matters_rank: 3 }],
          ['p-2', { matters_rank: null }],
        ]),
      },
    );
    expect(out).toEqual({ added: 1, given_again: 1, faded: 1, dropped: 0, matters: 1, understood: 0, understood_no_longer: 0 });
    const t = mem.tables;
    expect(t.life_unsure.find((u) => u.id === 'u-old')).toMatchObject({ thinks: 'again', seen_at: '2026-10-18T12:00:00Z' });
    expect(t.life_unsure.find((u) => u.id === 'u-f').status).toBe('faded');
    expect(t.life_unsure.find((u) => u.thinks === 'new')).toMatchObject({ user_id: 'u', status: 'open', run_id: 'r' });
    expect(t.life_people.map((p) => p.matters_rank)).toEqual([null, 1]);
  });
});

describe('who someone is, understood from the records', () => {
  const refs = new Map([
    ['p1', { type: 'person', id: 'p-1', name: 'Pip', relationship: null }],
    ['p2', { type: 'person', id: 'p-2', name: 'Rue', relationship: 'their dog', relationship_by: 'understood' }],
    ['p3', { type: 'person', id: 'p-3', name: 'Tam', relationship: 'cousin', relationship_by: 'gremly' }],
    ['f1', { type: 'fact', id: 'f-1' }],
  ]);
  const people = new Map([
    ['p-1', { relationship: null }],
    ['p-2', { relationship: 'their dog', relationship_by: 'understood' }],
    ['p-3', { relationship: 'cousin', relationship_by: 'gremly' }],
  ]);
  const who = (x) => ({ about_ref: 'p1', kind: 'who', thinks: 'Pip is their cat', refs: ['f1'], sure: 'high', tie: 'their cat', same_as: '', ...x });

  it('is held as understood when the records make it plain, and is a guess to ask when they do not', () => {
    const plain = unsurePlan({ output: { not_sure: [who({})] }, refs, people, today: TODAY });
    expect(plain.inserts).toEqual([expect.objectContaining({ person_id: 'p-1', kind: 'who', status: 'understood' })]);
    expect(plain.ties).toEqual([{ person_id: 'p-1', tie: 'their cat' }]);
    for (const x of [{ sure: 'medium' }, { tie: '' }]) {
      const open = unsurePlan({ output: { not_sure: [who(x)] }, refs, people, today: TODAY });
      expect(open.inserts).toEqual([expect.objectContaining({ status: 'open' })]);
      expect(open.ties).toEqual([]);
    }
  });

  it('may be given again, and given less sure it is a question again and the tie goes; what was said is never touched', () => {
    const open = [{ id: 'u-rue', person_id: 'p-2', kind: 'who', status: 'understood', seen_at: '2026-09-01T00:00:00Z' }];
    const less = unsurePlan({ output: { not_sure: [who({ about_ref: 'p2', sure: 'low', thinks: 'Rue may be a neighbour', tie: 'a neighbour' })] }, refs, open, people, today: TODAY });
    expect(less.updates).toEqual([{ id: 'u-rue', patch: expect.objectContaining({ status: 'open', sure: 'low' }) }]);
    expect(less.unties).toEqual([{ person_id: 'p-2', why: 'less plain now' }]);
    const said = unsurePlan({ output: { not_sure: [who({ about_ref: 'p3' })] }, refs, people, today: TODAY });
    expect(said.dropped.map((d) => d.why)).toEqual(['who they are is recorded']);
    // once they said Gremly had it wrong, it is never understood or asked again
    const no = unsurePlan({ output: { not_sure: [who({})] }, refs, people, saidNo: new Set(['p-1']), today: TODAY });
    expect(no.dropped.map((d) => d.why)).toEqual(['they said it is not so']);
    expect(no.ties).toEqual([]);
  });

  it('stays understood when not given again, however long ago, and fades once they or a fact said who it is', () => {
    const open = [
      { id: 'u-rue', person_id: 'p-2', kind: 'who', status: 'understood', seen_at: '2026-01-01T00:00:00Z' },
      { id: 'u-tam', person_id: 'p-3', kind: 'who', status: 'understood', seen_at: '2026-10-11T00:00:00Z' },
    ];
    const plan = unsurePlan({ output: { not_sure: [] }, refs, open, people, today: TODAY });
    expect(plan.fades).toEqual([{ id: 'u-tam', why: 'recorded' }]);
  });

  it('goes on their record as Gremly understood it, never over what they or a fact said, and comes off as asked', async () => {
    const mem = memoryDb({
      life_unsure: [],
      life_people: [
        { id: 'p-1', user_id: 'u', name: 'Pip', relationship: null, relationship_by: 'gremly' },
        { id: 'p-2', user_id: 'u', name: 'Rue', relationship: 'their dog', relationship_by: 'understood' },
        { id: 'p-3', user_id: 'u', name: 'Tam', relationship: 'cousin', relationship_by: 'person' },
      ],
    });
    const out = await applyUnsure(
      mem,
      'u',
      {
        inserts: [],
        updates: [],
        fades: [],
        dropped: [],
        matters: [],
        ties: [
          { person_id: 'p-1', tie: 'their cat' },
          { person_id: 'p-3', tie: 'a friend' },
        ],
        unties: [{ person_id: 'p-2', why: 'less plain now' }],
      },
      { runId: 'r', promptVersion: 'v', nowIso: '2026-10-18T12:00:00Z', people: new Map() },
    );
    expect(out).toMatchObject({ understood: 1, understood_no_longer: 1 });
    expect(mem.tables.life_people.map((p) => [p.id, p.relationship, p.relationship_by])).toEqual([
      ['p-1', 'their cat', 'understood'],
      ['p-2', null, 'gremly'],
      ['p-3', 'cousin', 'person'],
    ]);
  });
});

describe('the weekly pass', () => {
  const g = {
    tz: 'UTC',
    periodStart: '2026-10-11',
    periodEnd: '2026-10-17',
    marks: new Map(),
    openFacts: [
      { id: 'f-1', statement: 'Lunch with Ada on Sunday', state: 'current', observed_at: '2026-10-12T09:00:00Z', private: false, health: false },
    ],
    recentHappened: [],
    changes: [],
    corrections: [],
    journals: [],
    chats: [],
    created: [],
    completed: [],
    habits: [],
    progress: [],
    lifeMap: null,
    worlds: [],
    links: [],
    questions: [],
    absence: null,
    usage: null,
    chapters: [],
    story: [],
    people: [{ id: 'p-1', name: 'Ada', relationship: null }],
    ties: [{ fact_id: 'f-1', person_id: 'p-1' }],
    tiedFacts: [{ id: 'f-1', private: false, health: false, state: 'current', observed_at: '2026-10-12T09:00:00Z' }],
    unsure: [{ id: 'u-a', person_id: 'p-1', kind: 'who', thinks: 'Ada may be their sister', sure: 'low', created_at: '2026-10-04T00:00:00Z' }],
    shown: [],
    counts: null,
  };

  it('is shown how each person comes up, and what it thought before apart from the records', () => {
    const { text, refs } = renderWeek(g, TODAY);
    expect(text).toContain('p1 | Ada | who they are to them is not recorded | in 1 fact, 1 recorded in the last 30 days, latest 2026-10-12: f1');
    expect(text).toContain('WHAT GREMLY WAS NOT SURE OF BEFORE, NEVER TO BE SAID AS KNOWN');
    expect(text).toContain('u1 | p1 | who they are | Ada may be their sister | low | since 2026-10-04');
    // what it thought is never a record a note may rest on
    expect(refs.get('u1').label).toBeUndefined();
    const snapshot = [...refs.entries()].map(([k, v]) => [k, { ...v }]);
    expect(weeklyRecords(snapshot).has('u1')).toBe(false);
    expect(weeklyRecords(snapshot).has('p1')).toBe(true);
  });

  it('is still applied when the reply leaves out what it is not sure of', () => {
    const output = {
      life_map: { domains: [] },
      profile_text: '',
      profile_refs: [],
      worlds: [],
      worlds_summary: { headline: '', refs: [], featured: [] },
      chapters: [],
      questions: [],
      week_note: '',
      week_note_refs: [],
      summary_plan: { character: '', through_line: '', cards: [] },
      people_notes: [],
    };
    expect(weeklyShapeProblems(output)).toEqual([]);
    expect(weeklyShapeProblems({ ...output, not_sure: 'x' })).toEqual(['not_sure is string, not array']);
  });
});
