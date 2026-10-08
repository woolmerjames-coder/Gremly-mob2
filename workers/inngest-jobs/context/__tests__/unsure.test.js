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
      { person_id: null, kind: 'life', thinks: 'They may run most mornings', rests_on: [{ table: 'life_facts', id: 'f-1' }], sure: 'medium' },
      {
        person_id: 'p-1',
        kind: 'life',
        thinks: 'Ada may live nearby',
        rests_on: [
          { table: 'notes', id: 'n-1' },
          { table: 'life_facts', id: 'f-1' },
        ],
        sure: 'medium',
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
    expect(out).toEqual({ added: 1, given_again: 1, faded: 1, dropped: 0, matters: 1 });
    const t = mem.tables;
    expect(t.life_unsure.find((u) => u.id === 'u-old')).toMatchObject({ thinks: 'again', seen_at: '2026-10-18T12:00:00Z' });
    expect(t.life_unsure.find((u) => u.id === 'u-f').status).toBe('faded');
    expect(t.life_unsure.find((u) => u.thinks === 'new')).toMatchObject({ user_id: 'u', status: 'open', run_id: 'r' });
    expect(t.life_people.map((p) => p.matters_rank)).toEqual([null, 1]);
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
