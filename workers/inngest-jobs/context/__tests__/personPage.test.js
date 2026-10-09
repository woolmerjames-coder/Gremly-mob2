/**
 * @jest-environment node
 *
 * The page Gremly keeps about someone in a person's life (personPage.js,
 * Worlds rebuild stage 5): labels on the days that come round every year or
 * are still ahead, things to remember, through the check, written again only
 * when what they rest on has changed, and never from anything private or
 * about health.
 */
import {
  personPage,
  handlePersonPageApi,
  labelDay,
  renderPersonPage,
  pageSignature,
  PERSON_PAGE_VERSION,
  PAGE_SCHEMA,
} from '../personPage.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';
import { WORDS_SCHEMA } from '../../../shared/check/index.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  userTimezone: async () => 'Europe/London',
  personIdentity: async () => ({ first_name: 'Alex', pronouns: null, identity: {} }),
}));
jest.mock('../llm.js', () => ({
  ...jest.requireActual('../llm.js'),
  jsonCall: jest.fn(),
  modelFor: (env, job) => ({ model: job }),
}));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-20' }));

const U = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-0000000000a1';
const OLD = '00000000-0000-4000-8000-0000000000a2';
const fid = (n) => `00000000-0000-4000-8000-0000000000f${n}`;

const fact = (n, statement, more = {}) => ({
  id: fid(n),
  user_id: U,
  statement,
  about_date: null,
  about_date_end: null,
  timing: 'standing',
  state: 'current',
  private: false,
  health: false,
  observed_at: `2026-09-0${n}T10:00:00Z`,
  updated_at: `2026-09-0${n}T10:00:00Z`,
  ...more,
});

function world(sam = {}) {
  const tables = {
    life_people: [
      {
        id: SAM,
        user_id: U,
        name: 'Sam',
        relationship: 'sister',
        relationship_by: 'gremly',
        merged_into: null,
        hidden_at: null,
        page: null,
        ...sam,
      },
      // a record merged into Sam's: what it holds is Sam's too
      {
        id: OLD,
        user_id: U,
        name: null,
        relationship: 'sister',
        relationship_by: 'gremly',
        merged_into: SAM,
        hidden_at: null,
        page: null,
      },
    ],
    life_person_names: [{ person_id: SAM, user_id: U, name: 'Sammy', created_at: '2026-09-01' }],
    life_fact_people: [
      { fact_id: fid(1), person_id: SAM, user_id: U, created_at: '2026-09-01' },
      { fact_id: fid(2), person_id: SAM, user_id: U, created_at: '2026-09-02' },
      { fact_id: fid(3), person_id: OLD, user_id: U, created_at: '2026-09-03' },
      { fact_id: fid(4), person_id: SAM, user_id: U, created_at: '2026-09-04' },
      { fact_id: fid(5), person_id: SAM, user_id: U, created_at: '2026-09-05' },
      { fact_id: fid(6), person_id: SAM, user_id: U, created_at: '2026-09-06' },
    ],
    life_facts_now: [
      fact(1, "Sam's birthday is on 14 March", { about_date: '1990-03-14', timing: 'yearly' }),
      fact(2, 'Sam is vegetarian'),
      fact(3, 'Is going to Sam’s housewarming on 7 November', {
        about_date: '2026-11-07',
        timing: 'day',
        state: 'planned',
      }),
      fact(4, 'Helped Sam move flats in August', {
        about_date: '2026-08-15',
        timing: 'day',
        state: 'happened',
      }),
      fact(5, 'Sam is waiting on test results', { private: true, health: true }),
      fact(6, 'Sam used to live in Leeds', { state: 'corrected' }),
    ],
    check_runs: [],
  };
  db.mockReturnValue(memoryDb(tables));
  return tables;
}

// the facts are given newest first: f1 helped move, f2 housewarming, f3 vegetarian, f4 birthday
const PAGE = {
  days: [
    {
      day: 'f4',
      text: 'Sam’s birthday',
      refs: ['f4', 'p1'],
      stated: [{ kind: 'person', value: 'Sam', ref: 'p1' }],
    },
    { day: 'f3', text: 'Not a day', refs: ['f3'], stated: [] },
    {
      day: 'f2',
      text: 'Sam’s housewarming',
      refs: ['f2', 'p1'],
      stated: [{ kind: 'person', value: 'Sam', ref: 'p1' }],
    },
    { day: 'f4', text: 'A second label for the same day', refs: ['f4'], stated: [] },
  ],
  remember: [
    {
      text: 'Sam is vegetarian.',
      refs: ['f3', 'p1'],
      stated: [{ kind: 'person', value: 'Sam', ref: 'p1' }],
    },
    {
      text: 'You helped Sam move flats in August.',
      refs: ['f1', 'p1'],
      stated: [{ kind: 'person', value: 'Sam', ref: 'p1' }],
    },
  ],
};

function answers(page = PAGE) {
  const asked = [];
  jsonCall.mockImplementation(async (env, req) => {
    asked.push(req);
    if (req.schema === WORDS_SCHEMA)
      return { output: { not_held: false, what: null }, model: 'check' };
    if (req.schema === PAGE_SCHEMA) return { output: page, model: 'personPage' };
    return { output: { text: '', refs: [], stated: [] }, model: 'personPage' };
  });
  return asked;
}

beforeEach(() => jsonCall.mockReset());

test('a day takes a label when it comes round every year or is still ahead', () => {
  expect(labelDay({ about_date: '1990-03-14', timing: 'yearly' }, '2026-10-20')).toBe('2027-03-14');
  expect(labelDay({ about_date: '2026-11-07', timing: 'day' }, '2026-10-20')).toBe('2026-11-07');
  expect(
    labelDay(
      { about_date: '2026-10-18', about_date_end: '2026-10-22', timing: 'span' },
      '2026-10-20',
    ),
  ).toBe('2026-10-18');
  expect(labelDay({ about_date: '2026-08-15', timing: 'day' }, '2026-10-20')).toBeNull();
  expect(labelDay({ about_date: null, timing: 'standing' }, '2026-10-20')).toBeNull();
});

it('writes the labels and things to remember from what still stands, never private, and keeps them', async () => {
  const tables = world();
  const asked = answers();
  const r = await personPage({}, U, SAM);
  expect(r.fresh).toBe(false);
  const input = asked.find((a) => a.schema === PAGE_SCHEMA).user;
  expect(input).toContain('Sam, also called Sammy, their sister, as they said');
  // what the merged record holds is Sam's too
  expect(input).toContain('housewarming');
  expect(input).toMatch(/every year on 03-14, next 2027-03-14.*\[can take a label\]/);
  // nothing private or about health, nothing put right
  expect(input).not.toContain('test results');
  expect(input).not.toContain('Leeds');
  // a day that has passed takes no label
  expect(input).toMatch(
    /fact about the person \(happened; 2026-08-15; recorded [^)]*\): Helped Sam move/,
  );
  expect(r.page).toMatchObject({
    version: PERSON_PAGE_VERSION,
    days: [
      { fact_id: fid(1), label: 'Sam’s birthday' },
      { fact_id: fid(3), label: 'Sam’s housewarming' },
    ],
    remember: [
      { text: 'Sam is vegetarian.', fact_ids: [fid(2)] },
      { text: 'You helped Sam move flats in August.', fact_ids: [fid(4)] },
    ],
  });
  expect(tables.life_people.find((p) => p.id === SAM).page).toEqual(r.page);
  expect(tables.check_runs[0]).toMatchObject({ job: 'person_page' });
});

it('returns the page kept, without a model, while nothing it rests on has changed', async () => {
  const tables = world();
  answers();
  const first = await personPage({}, U, SAM);
  jsonCall.mockReset();
  const again = await personPage({}, U, SAM);
  expect(again).toMatchObject({ fresh: true, page: first.page });
  expect(jsonCall).not.toHaveBeenCalled();
  // a fact put right since: written again
  tables.life_facts_now.find((f) => f.id === fid(2)).state = 'corrected';
  answers();
  expect((await personPage({}, U, SAM)).fresh).toBe(false);
});

it('opens the record a merge kept, from the one merged into it', async () => {
  world();
  answers();
  const r = await personPage({}, U, OLD);
  expect(r.person_id).toBe(SAM);
});

it('keeps an empty page with no model when nothing about them can be written from', async () => {
  const tables = world();
  tables.life_fact_people = [
    { fact_id: fid(5), person_id: SAM, user_id: U, created_at: '2026-09-05' },
  ];
  answers();
  const r = await personPage({}, U, SAM);
  expect(r.page).toMatchObject({ days: [], remember: [] });
  expect(jsonCall).not.toHaveBeenCalled();
});

test('the signature moves with the facts, who they are and the week, and not with the day', () => {
  const someone = { name: 'Sam', relationship: 'sister' };
  const facts = [{ id: 'a', state: 'current', updated_at: '1' }];
  const base = pageSignature({ someone, facts, today: '2026-10-20' });
  expect(pageSignature({ someone, facts, today: '2026-10-21' })).toBe(base);
  expect(pageSignature({ someone, facts, today: '2026-10-26' })).not.toBe(base);
  expect(
    pageSignature({ someone: { ...someone, relationship: 'cousin' }, facts, today: '2026-10-20' }),
  ).not.toBe(base);
  expect(
    pageSignature({ someone, facts: [{ ...facts[0], state: 'changed' }], today: '2026-10-20' }),
  ).not.toBe(base);
});

test('the input names who they are as Gremly understood it when no one said it', () => {
  const { text } = renderPersonPage({
    someone: { id: SAM, name: 'Sam', relationship: 'colleague', relationship_by: 'understood' },
    facts: [],
    today: '2026-10-20',
  });
  expect(text).toContain('their colleague, as Gremly understood it from the records');
});

it('the route wants a person, and says when they are not this person’s', async () => {
  world();
  answers();
  const res = (body, mode = () => 'on') =>
    handlePersonPageApi({ json: async () => body }, {}, (b, s = 200) => ({ b, s }), { mode });
  expect((await res({ user_id: U })).s).toBe(400);
  expect((await res({ user_id: U, person_id: SAM }, () => 'off')).s).toBe(409);
  expect((await res({ user_id: U, person_id: '00000000-0000-4000-8000-0000000000ee' })).s).toBe(
    404,
  );
  const ok = await res({ user_id: U, person_id: SAM });
  expect(ok.s).toBe(200);
  expect(ok.b.page.remember).toHaveLength(2);
});
