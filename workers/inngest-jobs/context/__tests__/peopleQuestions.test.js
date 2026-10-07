/**
 * @jest-environment node
 *
 * Questions about the people in someone's life (context/peopleQuestions.js,
 * data fabric stage 4c): code finds who may be asked about, by ids and counts,
 * the model chooses one and writes it, and an answer merges, declines or
 * fills in a person only as the person's words say.
 */
import {
  personCandidates,
  personQuestionRequest,
  cleanChoices,
  personQuestionRow,
  personNoKey,
  writePersonQuestion,
  personAnswerPlan,
  answerPersonQuestion,
  personQuestionLive,
} from '../peopleQuestions.js';
import { jsonCall } from '../llm.js';
import { db } from '../db.js';
import { invalidateChatCache } from '../cache.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../db.js', () => ({
  ...jest.requireActual('../db.js'),
  db: jest.fn(),
  personIdentity: async () => ({ first_name: 'Robin', pronouns: null }),
}));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-07' }));
jest.mock('../cache.js', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

beforeEach(() => {
  jsonCall.mockReset();
  invalidateChatCache.mockClear();
});

const fact = (statement, extra = {}) => ({
  statement,
  about_date: null,
  private: false,
  health: false,
  last_confirmed_at: '2026-10-01',
  ...extra,
});
const three = (who) => [fact(`${who} one`), fact(`${who} two`), fact(`${who} three`)];

const ROWAN = { id: 'p-rowan', name: 'Rowan', relationship: null };
const SPOUSE = { id: 'p-spouse', name: null, relationship: 'husband' };
const AUNT = { id: 'p-aunt', name: null, relationship: 'aunt' };
const KIM = { id: 'p-kim', name: 'Kim', relationship: 'friend from work' };

describe('who may be asked about', () => {
  const factsOf = new Map([
    ['p-rowan', three('Rowan')],
    ['p-spouse', [fact('the husband once')]],
    ['p-aunt', three('aunt')],
    ['p-kim', three('Kim')],
  ]);
  const merge = {
    id: 'm-1',
    kept_id: 'p-rowan',
    merged_id: 'p-spouse',
    status: 'proposed',
    reason: 'maybe',
  };

  it('is a merge proposed, someone with no who, someone with no name, and never someone complete', () => {
    const c = personCandidates({ people: [ROWAN, SPOUSE, AUNT, KIM], factsOf, merges: [merge] });
    expect(c.map((x) => [x.type, x.person?.id || x.merge_id])).toEqual([
      ['same', 'm-1'],
      ['who', 'p-rowan'],
      ['name', 'p-aunt'],
    ]);
  });

  it('is never someone who comes up fewer times than the rule, counting nothing private or about health', () => {
    const hidden = new Map([
      ['p-rowan', [fact('a'), fact('b', { private: true }), fact('c', { health: true })]],
    ]);
    expect(personCandidates({ people: [ROWAN], factsOf: hidden })).toEqual([]);
  });

  it('is never asked again once answered or turned away, nor about someone they hid', () => {
    const noKeys = new Set([personNoKey({ type: 'who', person: ROWAN })]);
    expect(personCandidates({ people: [ROWAN], factsOf, noKeys })).toEqual([]);
    expect(personCandidates({ people: [{ ...AUNT, hidden_at: 'x' }], factsOf })).toEqual([]);
  });

  it('keys a no by ids alone', () => {
    expect(personNoKey({ type: 'same', kept: ROWAN, merged: SPOUSE })).toBe(
      'person:same:p-rowan:p-spouse',
    );
    expect(personNoKey({ type: 'name', person: AUNT })).toBe('person:name:p-aunt');
  });
});

describe('an open question', () => {
  const people = new Map([
    ['p-a', { id: 'p-a', name: 'Ada', relationship: null, merged_into: null, hidden_at: null }],
    ['p-b', { id: 'p-b', name: null, relationship: 'brother', merged_into: null, hidden_at: null }],
    ['p-c', { id: 'p-c', name: 'Cy', relationship: 'cousin', merged_into: 'p-a', hidden_at: null }],
    [
      'p-d',
      { id: 'p-d', name: 'Di', relationship: null, merged_into: null, hidden_at: '2026-10-01' },
    ],
  ]);
  const merges = new Map([
    ['m-1', { id: 'm-1', status: 'proposed' }],
    ['m-2', { id: 'm-2', status: 'declined' }],
  ]);
  const q = (proposed_change) => ({ proposed_change });

  it('still asks while what it asks is missing on a live record', () => {
    expect(personQuestionLive(q({ type: 'who', person_id: 'p-a' }), people, merges)).toBe(true);
    expect(personQuestionLive(q({ type: 'name', person_id: 'p-b' }), people, merges)).toBe(true);
    expect(
      personQuestionLive(
        q({ type: 'same', merge_id: 'm-1', kept_id: 'p-a', merged_id: 'p-b' }),
        people,
        merges,
      ),
    ).toBe(true);
  });

  it('has nothing left to ask once filled in, merged, hidden, gone or decided', () => {
    expect(personQuestionLive(q({ type: 'name', person_id: 'p-a' }), people, merges)).toBe(false);
    expect(personQuestionLive(q({ type: 'who', person_id: 'p-c' }), people, merges)).toBe(false);
    expect(personQuestionLive(q({ type: 'who', person_id: 'p-d' }), people, merges)).toBe(false);
    expect(personQuestionLive(q({ type: 'who', person_id: 'p-x' }), people, merges)).toBe(false);
    expect(
      personQuestionLive(
        q({ type: 'same', merge_id: 'm-2', kept_id: 'p-a', merged_id: 'p-b' }),
        people,
        merges,
      ),
    ).toBe(false);
    expect(
      personQuestionLive(
        q({ type: 'same', merge_id: 'm-1', kept_id: 'p-a', merged_id: 'p-c' }),
        people,
        merges,
      ),
    ).toBe(false);
  });
});

describe('the question', () => {
  it('shows the writer only what is not private, and the records by name and who', () => {
    const c = personCandidates({
      people: [ROWAN],
      factsOf: new Map([
        ['p-rowan', [...three('Rowan'), fact('Rowan secret thing', { private: true })]],
      ]),
    });
    const { user, refs } = personQuestionRequest({
      candidates: c,
      person: null,
      today: '2026-10-07',
    });
    expect(user).toContain('c1 | who this person is to them');
    expect(user).toContain('Rowan | who they are not known');
    expect(user).not.toContain('secret');
    expect(refs.get('c1').person.id).toBe('p-rowan');
  });

  it('keeps up to four short answers, each once, and none for one answered by typing', () => {
    expect(cleanChoices([])).toEqual([]);
    expect(cleanChoices(['Yes', 'yes', '', 'No', 'Not sure', 'Ask me later', 'Fifth'])).toEqual([
      'Yes',
      'No',
      'Not sure',
      'Ask me later',
    ]);
  });

  it('is written as a person question that points at the merge or the person, with its no key', () => {
    const row = personQuestionRow({
      userId: 'u',
      c: { type: 'same', merge_id: 'm-1', kept: ROWAN, merged: SPOUSE },
      question: 'Is Rowan your husband?',
      choices: ['Yes', 'No'],
      runId: 'r',
      holdUntil: '2026-10-08',
    });
    expect(row).toMatchObject({
      kind: 'person',
      record_table: 'person_merges',
      record_id: 'm-1',
      proposed_change: { type: 'same', merge_id: 'm-1', kept_id: 'p-rowan', merged_id: 'p-spouse' },
      no_key: 'person:same:p-rowan:p-spouse',
      hold_until: '2026-10-08',
      status: 'open',
    });
  });
});

function peopleTables(extra = {}) {
  return {
    gremly_questions: [],
    life_people: [
      {
        ...ROWAN,
        user_id: 'u',
        name_by: 'gremly',
        relationship_by: 'gremly',
        merged_into: null,
        updated_at: '3',
      },
      {
        ...SPOUSE,
        user_id: 'u',
        name_by: 'gremly',
        relationship_by: 'gremly',
        merged_into: null,
        relationship_fact_id: 'f-9',
        updated_at: '2',
      },
    ],
    life_person_names: [
      {
        person_id: 'p-rowan',
        user_id: 'u',
        name: 'Rowan',
        fact_id: 'f-1',
        by: 'gremly',
        created_at: '1',
      },
    ],
    life_fact_people: [
      { fact_id: 'f-1', person_id: 'p-rowan', user_id: 'u' },
      { fact_id: 'f-2', person_id: 'p-rowan', user_id: 'u' },
      { fact_id: 'f-3', person_id: 'p-rowan', user_id: 'u' },
      { fact_id: 'f-9', person_id: 'p-spouse', user_id: 'u' },
    ],
    life_facts_now: ['f-1', 'f-2', 'f-3', 'f-9'].map((id) => ({
      id,
      user_id: 'u',
      statement: `fact ${id}`,
      state: 'current',
      private: false,
      health: false,
      last_confirmed_at: '2026-10-01',
    })),
    person_merges: [
      {
        id: 'm-1',
        user_id: 'u',
        kept_id: 'p-rowan',
        merged_id: 'p-spouse',
        status: 'proposed',
        reason: 'maybe',
        moved: null,
      },
    ],
    ...extra,
  };
}

describe('writing a question', () => {
  it('asks nothing while one about a person is open', async () => {
    db.mockReturnValue(
      memoryDb(
        peopleTables({
          gremly_questions: [
            {
              id: 'q',
              user_id: 'u',
              kind: 'person',
              status: 'asked',
              proposed_change: {
                type: 'same',
                merge_id: 'm-1',
                kept_id: 'p-rowan',
                merged_id: 'p-spouse',
              },
            },
          ],
        }),
      ),
    );
    expect(await writePersonQuestion({}, 'u')).toMatchObject({
      written: false,
      skipped: 'one is open',
    });
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('closes an open one with nothing left to ask, then asks', async () => {
    const tables = peopleTables({
      gremly_questions: [
        {
          id: 'q-old',
          user_id: 'u',
          kind: 'person',
          status: 'open',
          no_key: 'person:who:p-gone',
          proposed_change: { type: 'who', person_id: 'p-gone' },
        },
      ],
    });
    const mem = memoryDb(tables);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: {
        ask: true,
        candidate_ref: 'c1',
        question: 'Is Rowan your husband?',
        choices: ['Yes', 'No'],
        why: '',
      },
      model: 'personQuestion',
    });
    expect(await writePersonQuestion({}, 'u')).toMatchObject({ written: true });
    // closed without their answer: no no is kept for it
    expect(mem.tables.gremly_questions.find((q) => q.id === 'q-old')).toMatchObject({
      status: 'expired',
      no_key: null,
    });
  });

  it('closes nothing in a dry run', async () => {
    const mem = memoryDb(
      peopleTables({
        gremly_questions: [
          {
            id: 'q-old',
            user_id: 'u',
            kind: 'person',
            status: 'open',
            proposed_change: { type: 'who', person_id: 'p-gone' },
          },
        ],
      }),
    );
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { ask: false, candidate_ref: null, question: null, choices: [], why: '' },
      model: 'personQuestion',
    });
    await writePersonQuestion({}, 'u', { dryRun: true });
    expect(mem.tables.gremly_questions[0].status).toBe('open');
  });

  it('never shows who someone is when it was read from something private', async () => {
    const mem = memoryDb(
      peopleTables({
        life_facts: [{ id: 'f-9', user_id: 'u', private: false, health: true }],
      }),
    );
    // the husband record known only by that who: no question about the pair
    mem.tables.life_fact_people.push(
      { fact_id: 'f-1', person_id: 'p-spouse', user_id: 'u' },
      { fact_id: 'f-2', person_id: 'p-spouse', user_id: 'u' },
    );
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { ask: false, candidate_ref: null, question: null, choices: [], why: '' },
      model: 'personQuestion',
    });
    await writePersonQuestion({}, 'u', { dryRun: true });
    expect(jsonCall).toHaveBeenCalledTimes(1);
    const { user } = jsonCall.mock.calls[0][1];
    expect(user).toContain('Rowan');
    expect(user).not.toContain('husband');
  });

  it('writes the one the model chooses, and only from a ref it was given', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: {
        ask: true,
        candidate_ref: 'c1',
        question: 'Is Rowan the husband you mention?',
        choices: ['Yes', 'No, someone else'],
        why: 'x',
      },
      model: 'personQuestion',
    });
    const out = await writePersonQuestion({}, 'u', { holdUntil: '2026-10-08' });
    expect(out).toMatchObject({ written: true, type: 'same' });
    expect(mem.tables.gremly_questions).toEqual([
      expect.objectContaining({
        kind: 'person',
        question: 'Is Rowan the husband you mention?',
        choices: ['Yes', 'No, someone else'],
        record_id: 'm-1',
        hold_until: '2026-10-08',
      }),
    ]);
  });

  it('writes nothing for a ref it never gave, no question, or none worth asking', async () => {
    for (const output of [
      { ask: true, candidate_ref: 'c9', question: 'Who?', choices: ['A', 'B'], why: '' },
      { ask: true, candidate_ref: 'c1', question: '', choices: ['A', 'B'], why: '' },
      { ask: false, candidate_ref: null, question: null, choices: [], why: 'not now' },
    ]) {
      const mem = memoryDb(peopleTables());
      db.mockReturnValue(mem);
      jsonCall.mockResolvedValue({ output, model: 'personQuestion' });
      expect((await writePersonQuestion({}, 'u')).written).toBe(false);
      expect(mem.tables.gremly_questions).toEqual([]);
    }
  });

  it('writes nothing in a dry run and returns the question', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: {
        ask: true,
        candidate_ref: 'c1',
        question: 'Is Rowan the husband you mention?',
        choices: ['Yes', 'No'],
        why: '',
      },
      model: 'personQuestion',
    });
    const out = await writePersonQuestion({}, 'u', { dryRun: true });
    expect(out).toMatchObject({ dry_run: true, row: expect.objectContaining({ kind: 'person' }) });
    expect(mem.tables.gremly_questions).toEqual([]);
  });
});

describe('the answer', () => {
  const same = {
    id: 'q-1',
    question: 'Is Rowan the husband you mention?',
    proposed_change: { type: 'same', merge_id: 'm-1', kept_id: 'p-rowan', merged_id: 'p-spouse' },
  };
  const whoQ = {
    id: 'q-2',
    question: 'Who is Rowan to you?',
    proposed_change: { type: 'who', person_id: 'p-rowan' },
  };

  it('is planned only from what the model read in their words', () => {
    expect(personAnswerPlan(same, { answers: true, same: 'yes' })).toMatchObject({
      merge: 'm-1',
      decline: null,
    });
    expect(personAnswerPlan(same, { answers: true, same: 'no' })).toMatchObject({
      merge: null,
      decline: 'm-1',
    });
    expect(personAnswerPlan(same, { answers: true, same: 'unsure' })).toMatchObject({
      merge: null,
      decline: null,
    });
    expect(personAnswerPlan(same, { answers: false, same: 'yes' })).toMatchObject({
      answers: false,
      merge: null,
    });
    expect(
      personAnswerPlan(whoQ, { answers: true, same: null, who: 'brother in law', name: null }),
    ).toMatchObject({
      person: { id: 'p-rowan', relationship: 'brother in law' },
    });
    expect(
      personAnswerPlan(whoQ, { answers: true, same: null, who: null, name: null }).person,
    ).toBeNull();
  });

  it('merges on a yes, with everything the merge moves', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: 'yes', who: null, name: null },
      model: 'personQuestion',
    });
    const r = await answerPersonQuestion({}, { userId: 'u', question: same, said: 'Yes' });
    expect(r.merge).toMatchObject({ merged: true });
    expect(mem.tables.person_merges[0].status).toBe('merged');
    expect(mem.tables.life_people.find((p) => p.id === 'p-spouse').merged_into).toBe('p-rowan');
    expect(mem.tables.life_people.find((p) => p.id === 'p-rowan').relationship).toBe('husband');
    expect(invalidateChatCache).toHaveBeenCalled();
    // the model is shown the question, the two records and their words
    expect(jsonCall.mock.calls[0][1].user).toContain('THEIR ANSWER: "Yes"');
  });

  it('declines the merge on a no, so it is never proposed as a question again', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: 'no', who: null, name: null },
      model: 'personQuestion',
    });
    const r = await answerPersonQuestion(
      {},
      { userId: 'u', question: same, said: 'No, Rowan is my cousin' },
    );
    expect(r.declined).toBe(true);
    expect(mem.tables.person_merges[0].status).toBe('declined');
    expect(mem.tables.life_people.find((p) => p.id === 'p-spouse').merged_into).toBeNull();
  });

  it('fills in who someone is as the person said it, as theirs', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: null, who: 'brother in law', name: null },
      model: 'personQuestion',
    });
    await answerPersonQuestion({}, { userId: 'u', question: whoQ, said: "He's my brother in law" });
    expect(mem.tables.life_people.find((p) => p.id === 'p-rowan')).toMatchObject({
      relationship: 'brother in law',
      relationship_by: 'person',
      relationship_fact_id: null,
    });
  });

  it('fills in only what was asked', () => {
    expect(
      personAnswerPlan(whoQ, { answers: true, same: null, who: 'cousin', name: 'Ro' }).person,
    ).toEqual({ id: 'p-rowan', relationship: 'cousin' });
  });

  it('never writes over what they wrote themselves', async () => {
    const tables = peopleTables();
    Object.assign(tables.life_people[0], { relationship: 'neighbour', relationship_by: 'person' });
    const mem = memoryDb(tables);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: null, who: 'cousin', name: null },
      model: 'personQuestion',
    });
    const r = await answerPersonQuestion({}, { userId: 'u', question: whoQ, said: 'My cousin' });
    expect(r.theirs_already).toBe('p-rowan');
    expect(mem.tables.life_people[0].relationship).toBe('neighbour');
  });

  it('fills in nothing on a record merged since, and says so', async () => {
    const tables = peopleTables();
    tables.life_people[0].merged_into = 'p-spouse';
    const mem = memoryDb(tables);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: null, who: 'cousin', name: null },
      model: 'personQuestion',
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await answerPersonQuestion({}, { userId: 'u', question: whoQ, said: 'My cousin' });
    expect(r.gone).toBe('p-rowan');
    expect(mem.tables.life_people[0].relationship).toBeNull();
    expect(warn.mock.calls[0][0]).toMatch(/\[ALERT\]\[People\]/);
    warn.mockRestore();
  });

  it('changes nothing when their words do not answer it', async () => {
    const mem = memoryDb(peopleTables());
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: false, same: null, who: null, name: null },
      model: 'personQuestion',
    });
    const r = await answerPersonQuestion(
      {},
      { userId: 'u', question: same, said: 'Why do you ask?' },
    );
    expect(r).toMatchObject({ answers: false });
    expect(mem.tables.person_merges[0].status).toBe('proposed');
    expect(invalidateChatCache).not.toHaveBeenCalled();
  });
});
