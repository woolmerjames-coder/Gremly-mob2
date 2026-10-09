/**
 * @jest-environment node
 *
 * Questions about the people in someone's life and about what Gremly is not
 * sure of (context/peopleQuestions.js, data fabric stage 4c, asked as a set
 * since 8 Oct): code finds what may be asked about, by ids and counts, the
 * model chooses up to a set and writes each, and an answer merges, declines
 * or fills in a person, and confirms or closes what Gremly thought, only as
 * the person's words say.
 */
import {
  askCandidates,
  questionSetRequest,
  cleanChoices,
  questionSetRow,
  personNoKey,
  writeQuestionSet,
  personAnswerPlan,
  answerPersonQuestion,
  personQuestionLive,
  sortOpen,
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
const ODA = { id: 'p-oda', name: 'Oda', relationship: null };

describe('what may be asked about', () => {
  const factsOf = new Map([
    ['p-rowan', three('Rowan')],
    ['p-spouse', [fact('the husband once')]],
    ['p-aunt', three('aunt')],
    ['p-kim', three('Kim')],
    ['p-oda', [fact('Oda once')]],
  ]);
  const merge = {
    id: 'm-1',
    kept_id: 'p-rowan',
    merged_id: 'p-spouse',
    status: 'proposed',
    reason: 'maybe',
  };
  const restFacts = new Map([
    ['f-a', { id: 'f-a', statement: 'Oda came for the weekend', private: false, health: false }],
    ['f-b', { id: 'f-b', statement: 'Runs before work most days', private: false, health: false }],
    ['f-p', { id: 'f-p', statement: 'something kept', private: true, health: false }],
  ]);
  const odaGuess = {
    id: 'u-1',
    person_id: 'p-oda',
    kind: 'who',
    thinks: 'Oda may be their sister',
    sure: 'medium',
    rests_on: [{ table: 'life_facts', id: 'f-a' }],
  };
  const runGuess = {
    id: 'u-2',
    person_id: null,
    kind: 'life',
    thinks: 'They may be training for a race',
    sure: 'high',
    rests_on: [{ table: 'life_facts', id: 'f-b' }],
  };

  it('is a merge proposed, someone with no who, someone with no name, and never someone complete', () => {
    const c = askCandidates({ people: [ROWAN, SPOUSE, AUNT, KIM], factsOf, merges: [merge] });
    // Rowan is asked about through the merge, never alone as well
    expect(c.map((x) => [x.type, x.person?.id || x.merge_id])).toEqual([
      ['same', 'm-1'],
      ['name', 'p-aunt'],
    ]);
    expect(askCandidates({ people: [ROWAN, AUNT, KIM], factsOf }).map((x) => x.type)).toEqual(['who', 'name']);
  });

  it('asks about someone through one pair of records a set, even with a guess at who they are', () => {
    const ROWAN2 = { id: 'p-rowan2', name: 'Rowan', relationship: null };
    const merges = [merge, { id: 'm-2', kept_id: 'p-rowan', merged_id: 'p-rowan2', status: 'proposed' }];
    const c = askCandidates({
      people: [{ ...ROWAN, matters_rank: 1 }, SPOUSE, ROWAN2],
      factsOf: new Map([...factsOf, ['p-rowan2', three('Rowan again')]]),
      merges,
      guesses: [{ id: 'u-9', person_id: 'p-rowan', kind: 'who', thinks: 'Rowan may be their husband', sure: 'high', rests_on: [{ table: 'life_facts', id: 'f-a' }] }],
      restFacts: new Map([['f-a', { id: 'f-a', statement: 'x', private: false, health: false }]]),
    });
    expect(c.map((x) => x.merge_id || x.person?.id)).toEqual(['m-2']);
  });

  it('is never someone who comes up fewer times than the rule, counting nothing private or about health', () => {
    const hidden = new Map([
      ['p-rowan', [fact('a'), fact('b', { private: true }), fact('c', { health: true })]],
    ]);
    expect(askCandidates({ people: [ROWAN], factsOf: hidden })).toEqual([]);
  });

  it('is someone who matters most to them, or whom Gremly has a guess about, however often they come up', () => {
    expect(askCandidates({ people: [ODA], factsOf })).toEqual([]);
    expect(
      askCandidates({ people: [{ ...ODA, matters_rank: 2 }], factsOf }).map((x) => x.person.id),
    ).toEqual(['p-oda']);
    const [c] = askCandidates({ people: [ODA], factsOf, guesses: [odaGuess], restFacts });
    expect(c).toMatchObject({ type: 'who', guess: { id: 'u-1', thinks: 'Oda may be their sister' } });
  });

  it('asks about what Gremly is not sure of while all it rests on can be shown', () => {
    const c = askCandidates({ people: [], factsOf, guesses: [runGuess], restFacts });
    expect(c).toEqual([expect.objectContaining({ type: 'unsure', entry: runGuess, person: null })]);
    const onPrivate = { ...runGuess, rests_on: [...runGuess.rests_on, { table: 'life_facts', id: 'f-p' }] };
    const onGone = { ...runGuess, rests_on: [{ table: 'life_facts', id: 'f-gone' }] };
    expect(askCandidates({ people: [], factsOf, guesses: [onPrivate, onGone], restFacts })).toEqual([]);
    // a guess at who someone is that rests on something private is never offered
    const [who] = askCandidates({
      people: [ROWAN],
      factsOf,
      guesses: [{ ...odaGuess, person_id: 'p-rowan', rests_on: [{ table: 'life_facts', id: 'f-p' }] }],
      restFacts,
    });
    expect(who.type).toBe('who');
    expect(who.guess).toBeUndefined();
  });

  it('never offers a guess Gremly is not fairly sure of, and still asks about the person', () => {
    const [c] = askCandidates({ people: [{ ...ODA, matters_rank: 1 }], factsOf, guesses: [{ ...odaGuess, sure: 'low' }], restFacts });
    expect(c).toMatchObject({ type: 'who' });
    expect(c.guess).toBeUndefined();
    expect(askCandidates({ people: [], factsOf, guesses: [{ ...runGuess, sure: 'low' }], restFacts })).toEqual([]);
  });

  it('keeps a guess when a fact it rests on has gone, as long as one still stands', () => {
    const [c] = askCandidates({
      people: [ODA],
      factsOf,
      guesses: [{ ...odaGuess, rests_on: [...odaGuess.rests_on, { table: 'life_facts', id: 'f-gone' }] }],
      restFacts,
    });
    expect(c.guess).toMatchObject({ id: 'u-1' });
  });

  it('puts the people who matter most first, then what Gremly is surest of', () => {
    const c = askCandidates({
      people: [ROWAN, { ...AUNT, matters_rank: 1 }],
      factsOf,
      guesses: [runGuess],
      restFacts,
    });
    expect(c.map((x) => x.type)).toEqual(['name', 'unsure', 'who']);
  });

  it('is never asked again once answered or turned away, nor about someone they hid', () => {
    const noKeys = new Set([
      personNoKey({ type: 'who', person: ROWAN }),
      personNoKey({ type: 'unsure', entry: runGuess }),
    ]);
    expect(askCandidates({ people: [ROWAN], factsOf, noKeys, guesses: [runGuess], restFacts })).toEqual([]);
    expect(askCandidates({ people: [{ ...AUNT, hidden_at: 'x' }], factsOf })).toEqual([]);
  });

  it('keys a no by ids alone', () => {
    expect(personNoKey({ type: 'same', kept: ROWAN, merged: SPOUSE })).toBe(
      'person:same:p-rowan:p-spouse',
    );
    expect(personNoKey({ type: 'name', person: AUNT })).toBe('person:name:p-aunt');
    expect(personNoKey({ type: 'unsure', entry: runGuess })).toBe('unsure:u-2');
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
  const unsure = new Map([
    ['u-1', { id: 'u-1', status: 'open' }],
    ['u-2', { id: 'u-2', status: 'faded' }],
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
    expect(personQuestionLive(q({ type: 'unsure', unsure_id: 'u-1' }), people, merges, unsure)).toBe(true);
  });

  it('has nothing left to ask once filled in, merged, hidden, gone, decided or no longer thought', () => {
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
    expect(personQuestionLive(q({ type: 'unsure', unsure_id: 'u-2' }), people, merges, unsure)).toBe(false);
    expect(
      personQuestionLive(q({ type: 'unsure', unsure_id: 'u-1', person_id: 'p-d' }), people, merges, unsure),
    ).toBe(false);
  });

  it('is waiting until put to them, a skip once put to them a while ago, and done with once nothing is left', () => {
    const rows = [
      { id: 'a', asked_at: null },
      { id: 'b', asked_at: '2026-10-06T08:00:00Z' },
      { id: 'c', asked_at: '2026-10-01T08:00:00Z' },
      { id: 'd', asked_at: null, dead: true },
    ];
    const out = sortOpen(rows, (r) => !r.dead, '2026-10-07');
    expect(out.waiting.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out.skipped.map((r) => r.id)).toEqual(['c']);
    expect(out.expired.map((r) => r.id)).toEqual(['d']);
  });
});

describe('the questions', () => {
  it('shows the writer only what is not private, what Gremly thinks, and who matters most', () => {
    const c = askCandidates({
      people: [{ ...ROWAN, matters_rank: 1 }],
      factsOf: new Map([
        ['p-rowan', [...three('Rowan'), fact('Rowan secret thing', { private: true })]],
      ]),
      guesses: [
        {
          id: 'u-1',
          person_id: 'p-rowan',
          kind: 'who',
          thinks: 'Rowan may be their brother',
          sure: 'medium',
          rests_on: [{ table: 'life_facts', id: 'f-1' }],
        },
      ],
      restFacts: new Map([['f-1', { id: 'f-1', statement: 'Rowan one', private: false, health: false }]]),
    });
    const { user, refs } = questionSetRequest({
      candidates: c,
      person: null,
      today: '2026-10-07',
    });
    expect(user).toContain('c1 | who this person is to them');
    expect(user).toContain('Rowan | who they are not known | one of the people who matter most to them');
    expect(user).toContain('Gremly thinks, but is not sure: Rowan may be their brother (how sure: medium)');
    expect(user).not.toContain('secret');
    expect(refs.get('c1').person.id).toBe('p-rowan');
  });

  it('keeps up to four short answers, each once, and none for one answered by typing', () => {
    expect(cleanChoices([])).toEqual([]);
    // one too long to tap is left off, never cut short
    expect(cleanChoices(['Yes', 'No, I am not thinking about moving there at all'])).toEqual(['Yes']);
    expect(cleanChoices(['Yes', 'yes', '', 'No', 'Not sure', 'Ask me later', 'Fifth'])).toEqual([
      'Yes',
      'No',
      'Not sure',
      'Ask me later',
    ]);
  });

  it('is written as one of a set, pointing at the merge, the person or what Gremly thought, with its no key', () => {
    const same = questionSetRow({
      userId: 'u',
      c: { type: 'same', merge_id: 'm-1', kept: ROWAN, merged: SPOUSE },
      question: 'Is Rowan your husband?',
      choices: ['Yes', 'No'],
      runId: 'r',
      setId: 's',
    });
    expect(same).toMatchObject({
      kind: 'person',
      record_table: 'person_merges',
      record_id: 'm-1',
      proposed_change: { type: 'same', merge_id: 'm-1', kept_id: 'p-rowan', merged_id: 'p-spouse' },
      no_key: 'person:same:p-rowan:p-spouse',
      set_id: 's',
      status: 'open',
    });
    const who = questionSetRow({
      userId: 'u',
      c: { type: 'who', person: ROWAN, guess: { id: 'u-1' } },
      question: 'Who is Rowan to you?',
      choices: ['My brother', 'A friend'],
      runId: 'r',
      setId: 's',
    });
    expect(who.proposed_change).toEqual({ type: 'who', person_id: 'p-rowan', unsure_id: 'u-1' });
    const unsure = questionSetRow({
      userId: 'u',
      c: {
        type: 'unsure',
        entry: { id: 'u-2', person_id: null, rests_on: [{ table: 'life_facts', id: 'f-b' }, { table: 'notes', id: 'n-1' }] },
      },
      question: 'Are you training for a race?',
      choices: ['Yes', 'No'],
      runId: 'r',
      setId: 's',
    });
    expect(unsure).toMatchObject({
      kind: 'unsure',
      record_table: 'life_unsure',
      record_id: 'u-2',
      proposed_change: { type: 'unsure', unsure_id: 'u-2' },
      rests_on: [{ table: 'life_facts', id: 'f-b' }],
      no_key: 'unsure:u-2',
    });
    // one insert writes the set, so every row has the same fields
    expect(Object.keys(same).sort()).toEqual(Object.keys(unsure).sort());
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
    life_unsure: [],
    ...extra,
  };
}

const setOf = (questions, why = '') => ({ output: { questions, why }, model: 'personQuestion' });

describe('writing a set', () => {
  it('asks nothing while any of the last set waits to be put to them', async () => {
    db.mockReturnValue(
      memoryDb(
        peopleTables({
          gremly_questions: [
            {
              id: 'q',
              user_id: 'u',
              kind: 'person',
              status: 'asked',
              asked_at: '2026-10-06T08:00:00Z',
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
    expect(await writeQuestionSet({}, 'u')).toMatchObject({
      written: false,
      skipped: 'a set is waiting',
    });
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('closes the last set first: nothing left to ask expires, a skip is closed for good, then asks', async () => {
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
        {
          id: 'q-left',
          user_id: 'u',
          kind: 'person',
          status: 'asked',
          asked_at: '2026-09-30T08:00:00Z',
          no_key: 'person:same:p-rowan:p-spouse',
          proposed_change: { type: 'same', merge_id: 'm-1', kept_id: 'p-rowan', merged_id: 'p-spouse' },
        },
      ],
    });
    const mem = memoryDb(tables);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(
      setOf([{ candidate_ref: 'c1', question: 'Who is Rowan to you?', choices: ['A friend'] }]),
    );
    expect(await writeQuestionSet({}, 'u')).toMatchObject({ written: true, closed: { expired: 1, skipped: 1 } });
    // closed without their answer: no no is kept for it
    expect(mem.tables.gremly_questions.find((q) => q.id === 'q-old')).toMatchObject({
      status: 'expired',
      no_key: null,
    });
    // put to them and left: never asked again, so the merge is not offered
    expect(mem.tables.gremly_questions.find((q) => q.id === 'q-left')).toMatchObject({
      status: 'dismissed',
      no_key: 'person:same:p-rowan:p-spouse',
    });
    const { user } = jsonCall.mock.calls[0][1];
    expect(user).not.toContain('whether two records are one person');
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
    jsonCall.mockResolvedValue(setOf([]));
    await writeQuestionSet({}, 'u', { dryRun: true });
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
    jsonCall.mockResolvedValue(setOf([]));
    await writeQuestionSet({}, 'u', { dryRun: true });
    expect(jsonCall).toHaveBeenCalledTimes(1);
    const { user } = jsonCall.mock.calls[0][1];
    expect(user).toContain('Rowan');
    expect(user).not.toContain('husband');
  });

  it('writes the ones the model chooses as one set, only from refs it was given, each once', async () => {
    const mem = memoryDb(
      peopleTables({
        life_unsure: [
          {
            id: 'u-2',
            user_id: 'u',
            person_id: null,
            kind: 'life',
            thinks: 'They may be training for a race',
            sure: 'high',
            status: 'open',
            rests_on: [{ table: 'life_facts', id: 'f-3' }],
          },
        ],
      }),
    );
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(
      setOf([
        { candidate_ref: 'c2', question: 'Is Rowan the husband you mention?', choices: ['Yes', 'No, someone else'] },
        { candidate_ref: 'c2', question: 'Again?', choices: [] },
        { candidate_ref: 'c9', question: 'Who?', choices: [] },
        { candidate_ref: 'c1', question: 'Are you training for a race?', choices: ['Yes', 'Not right now'] },
      ]),
    );
    const out = await writeQuestionSet({}, 'u');
    expect(out).toMatchObject({ written: true, count: 2, types: ['same', 'unsure'] });
    expect(out.problems).toEqual(['the same one twice', 'a ref it was never given']);
    const rows = mem.tables.gremly_questions;
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'person', record_id: 'm-1', question: 'Is Rowan the husband you mention?' }),
      expect.objectContaining({ kind: 'unsure', record_id: 'u-2', question: 'Are you training for a race?' }),
    ]);
    expect(new Set(rows.map((r) => r.set_id)).size).toBe(1);
  });

  it('writes at most a set', async () => {
    const people = Array.from({ length: 7 }, (_, i) => ({
      id: `p-${i}`,
      user_id: 'u',
      name: `N${i}`,
      relationship: null,
      name_by: 'gremly',
      relationship_by: 'gremly',
      merged_into: null,
      updated_at: String(i),
    }));
    const tables = peopleTables({
      life_people: people,
      life_fact_people: people.flatMap((p) => ['f-1', 'f-2', 'f-3'].map((f) => ({ fact_id: f, person_id: p.id, user_id: 'u' }))),
      person_merges: [],
    });
    const mem = memoryDb(tables);
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(
      setOf(people.map((_, i) => ({ candidate_ref: `c${i + 1}`, question: `Who is N${i}?`, choices: [] }))),
    );
    const out = await writeQuestionSet({}, 'u');
    expect(out.count).toBe(5);
    expect(out.problems).toEqual(['more than a set', 'more than a set']);
  });

  it('writes nothing for refs it never gave, no question, or none worth asking', async () => {
    for (const questions of [
      [{ candidate_ref: 'c9', question: 'Who?', choices: ['A', 'B'] }],
      [{ candidate_ref: 'c1', question: '', choices: ['A', 'B'] }],
      [],
    ]) {
      const mem = memoryDb(peopleTables());
      db.mockReturnValue(mem);
      jsonCall.mockResolvedValue(setOf(questions, 'not now'));
      expect((await writeQuestionSet({}, 'u')).written).toBe(false);
      expect(mem.tables.gremly_questions).toEqual([]);
    }
  });

  it('writes nothing in a dry run and returns the set, from what Gremly is not sure of as given', async () => {
    // no merge is proposed, so Rowan is asked about alone
    const mem = memoryDb(peopleTables({ person_merges: [] }));
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue(
      setOf([{ candidate_ref: 'c1', question: 'Who is Rowan to you?', choices: ['My brother', 'A friend'] }]),
    );
    const guesses = [
      {
        id: 'shadow-u1',
        person_id: 'p-rowan',
        kind: 'who',
        thinks: 'Rowan may be their brother',
        sure: 'medium',
        rests_on: [{ table: 'life_facts', id: 'f-1' }],
      },
    ];
    const out = await writeQuestionSet({}, 'u', { dryRun: true, guesses, ranks: [{ id: 'p-rowan', matters_rank: 1 }] });
    expect(out).toMatchObject({
      dry_run: true,
      rows: [expect.objectContaining({ kind: 'person', proposed_change: { type: 'who', person_id: 'p-rowan', unsure_id: 'shadow-u1' } })],
    });
    expect(jsonCall.mock.calls[0][1].user).toMatch(/c1 \| who this person is to them/);
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

  it('confirms what Gremly thought only on a yes, and closes it on any other answer', () => {
    const guessQ = { ...whoQ, proposed_change: { ...whoQ.proposed_change, unsure_id: 'u-1' } };
    expect(personAnswerPlan(guessQ, { answers: true, who: 'brother', guess: 'yes' }).guess).toEqual({
      id: 'u-1',
      status: 'confirmed',
    });
    expect(personAnswerPlan(guessQ, { answers: true, who: 'cousin', guess: 'no' }).guess.status).toBe('said_no');
    expect(personAnswerPlan(guessQ, { answers: true, who: null, guess: 'unsure' }).guess.status).toBe('said_no');
    expect(personAnswerPlan(guessQ, { answers: false, guess: 'yes' }).guess).toBeNull();
    expect(personAnswerPlan(whoQ, { answers: true, who: 'brother', guess: null }).guess).toBeNull();
  });

  it('reads the answer beside what Gremly thought, and settles it as they said', async () => {
    const mem = memoryDb(
      peopleTables({
        life_unsure: [{ id: 'u-1', user_id: 'u', person_id: 'p-rowan', kind: 'who', thinks: 'Rowan may be their brother', status: 'open' }],
      }),
    );
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({
      output: { answers: true, same: null, who: 'brother', name: null, guess: 'yes' },
      model: 'personQuestion',
    });
    const guessQ = { ...whoQ, proposed_change: { ...whoQ.proposed_change, unsure_id: 'u-1' } };
    const r = await answerPersonQuestion({}, { userId: 'u', question: guessQ, said: 'My brother' });
    expect(r.guess).toBe('confirmed');
    expect(mem.tables.life_unsure[0]).toMatchObject({ status: 'confirmed', decided_at: expect.any(String) });
    expect(jsonCall.mock.calls[0][1].user).toContain('WHAT GREMLY THOUGHT, AND OFFERED AS AN ANSWER: Rowan may be their brother');
    expect(mem.tables.life_people.find((p) => p.id === 'p-rowan').relationship).toBe('brother');
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
