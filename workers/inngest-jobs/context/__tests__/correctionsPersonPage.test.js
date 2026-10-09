/**
 * @jest-environment node
 *
 * Said on the page Gremly keeps about someone in their life (Worlds rebuild,
 * stage 5, corrections.js and personCorrection.js): the facts about that
 * someone are read first whatever their age, what it adds is tied to them,
 * and their name and who they are are read from the words and kept as the
 * person's own. Made up records only.
 */
import { applyCorrection } from '../corrections.js';
import {
  applyPersonCorrection,
  personCorrectionPatch,
  personCorrectionRequest,
} from '../personCorrection.js';
import { memoryDb } from './memoryDb.js';
import { jsonCall } from '../llm.js';

jest.mock('../personCorrection.js', () => {
  const actual = jest.requireActual('../personCorrection.js');
  return { ...actual, applyPersonCorrection: jest.fn(actual.applyPersonCorrection) };
});
jest.mock('../llm.js', () => ({
  ...jest.requireActual('../llm.js'),
  jsonCall: jest.fn(),
  modelFor: (env, job) => ({ model: job }),
}));

const SUPA = 'https://db.test';
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const SAM = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
const CORRECTION = '9c9c9c9c-9c9c-4c9c-8c9c-9c9c9c9c9c9c';
const OLD_FACT = '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f';
const ENV = { SUPABASE_URL: SUPA, SUPABASE_SERVICE_KEY: 'k' };

const NOTHING = {
  understood: 'They said Sam is their cousin, not their sister.',
  corrected_facts: [],
  changed_facts: [],
  happened_facts: [],
  private_fact_refs: [],
  set_aside_facts: [],
  new_facts: [],
  rewrites: [],
  retire_anchor_refs: [],
};

function standIn({ output, reader = { name: null, who: 'cousin' } }) {
  const sent = [];
  const rows = {
    user_corrections: [
      {
        id: CORRECTION,
        user_id: USER,
        said: 'Sam is my cousin, not my sister',
        surface: 'not_right',
        target_kind: 'person',
        target_ref: { id: SAM, kind: 'wrong', text: 'Sam, your sister' },
        chat_id: null,
        fact_ids: null,
        status: 'received',
        created_at: '2026-10-20T09:00:00Z',
      },
    ],
    life_people: [
      {
        id: SAM,
        user_id: USER,
        name: 'Sam',
        relationship: 'sister',
        relationship_by: 'gremly',
        merged_into: null,
        hidden_at: null,
      },
    ],
    life_fact_people: [{ fact_id: OLD_FACT, person_id: SAM, user_id: USER }],
    life_facts_now: [
      { id: OLD_FACT, statement: 'Sam is their sister', state: 'current', private: false },
    ],
    notification_preferences: [{ timezone: 'Europe/London' }],
  };
  const asked = [];
  jsonCall.mockImplementation(async (env, req) => {
    asked.push(req);
    if (req.schema?.properties?.who && req.schema?.properties?.name)
      return { output: reader, model: 'personCorrection' };
    return { output, model: 'rewrite' };
  });
  const answer = (body) => ({
    ok: true,
    status: 200,
    text: async () => (body === null ? '' : JSON.stringify(body)),
  });
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = String(url);
    const path = decodeURIComponent(u.slice(`${SUPA}/rest/v1/`.length));
    const table = path.split('?')[0];
    const method = init.method || 'GET';
    if (method === 'GET') {
      // only what the request asks for, by id where it names one
      const ids = /[?&]id=in\.\(([^)]*)\)/.exec(path)?.[1]?.split(',') || null;
      const one = /[?&]id=eq\.([0-9a-f-]{36})/.exec(path)?.[1] || null;
      const all = rows[table] || [];
      return answer(
        ids ? all.filter((r) => ids.includes(r.id)) : one ? all.filter((r) => r.id === one) : all,
      );
    }
    sent.push({ method, table, path, body: init.body ? JSON.parse(init.body) : null });
    return answer([]);
  });
  return { sent, asked };
}

const actual = jest.requireActual('../personCorrection.js');
// jest resets every mock before each test (jest.config.js resetMocks)
beforeEach(() => applyPersonCorrection.mockImplementation(actual.applyPersonCorrection));

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jsonCall.mockReset();
});

it('reads the someone’s facts first, ties what it adds to them, and keeps who they are as theirs', async () => {
  const output = {
    ...NOTHING,
    corrected_facts: [{ fact_ref: 'f1', why: 'They said Sam is their cousin' }],
    new_facts: [
      {
        statement: 'Sam is their cousin',
        subject: 'Sam',
        about_date: null,
        about_date_end: null,
        timing: 'standing',
        state: 'current',
      },
    ],
  };
  const { sent, asked } = standIn({ output });
  const r = await applyCorrection(ENV, CORRECTION, 'run-p');
  const main = asked.find((a) => a.schema?.properties?.corrected_facts);
  // the facts about Sam come first, and the model is told whose page it was
  expect(main.user).toMatch(/LEDGER FACTS[^\n]*\nf1 \| current \| no date \| Sam is their sister/);
  expect(main.user).toContain(
    'THEY SAID IT ON THE PAGE GREMLY KEEPS ABOUT SOMEONE IN THEIR LIFE: Sam, their sister',
  );
  // what it added is about Sam
  const added = sent.find((w) => w.table === 'life_facts' && w.method === 'POST').body[0];
  const tie = sent.find((w) => w.table === 'life_fact_people' && w.method === 'POST');
  expect(tie.body).toEqual([{ fact_id: added.id, person_id: SAM, user_id: USER, run_id: 'run-p' }]);
  // who they are, from their words, as theirs
  expect(applyPersonCorrection).toHaveBeenCalledWith(
    ENV,
    expect.anything(),
    expect.objectContaining({
      userId: USER,
      said: 'Sam is my cousin, not my sister',
      marked: 'Sam, your sister',
    }),
  );
  const patch = sent.find(
    (w) => w.table === 'life_people' && w.method === 'PATCH' && w.body.relationship === 'cousin',
  );
  expect(patch.body).toMatchObject({ relationship_by: 'person', relationship_fact_id: null });
  expect(r.person).toMatchObject({ changed: true, who: 'cousin' });
});

it('changes nothing on the record when their words give no name and who they are as the page has it', async () => {
  const { sent } = standIn({ output: NOTHING, reader: { name: 'Sam', who: 'sister' } });
  const r = await applyCorrection(ENV, CORRECTION, 'run-p');
  expect(r.person).toMatchObject({ changed: false });
  expect(
    sent.some(
      (w) =>
        w.table === 'life_people' && w.method === 'PATCH' && 'relationship_by' in (w.body || {}),
    ),
  ).toBe(false);
});

describe('the reader of what they said on someone’s page', () => {
  const someone = {
    id: SAM,
    name: 'Sam',
    relationship: 'colleague',
    relationship_by: 'understood',
  };

  test('keeps a new name and who they are as theirs, and nothing the record already has', () => {
    expect(personCorrectionPatch(someone, { name: 'Samira', who: 'manager' }, 'now')).toEqual({
      name: 'Samira',
      name_by: 'person',
      relationship: 'manager',
      relationship_by: 'person',
      relationship_fact_id: null,
      updated_at: 'now',
    });
    expect(personCorrectionPatch(someone, { name: 'Sam', who: 'Colleague' }, 'now')).toBeNull();
    expect(personCorrectionPatch(someone, { name: null, who: null }, 'now')).toBeNull();
  });

  test('is told whose page it was, who they are as Gremly understood it, and what they marked', () => {
    const req = personCorrectionRequest({
      someone,
      names: ['Sam', 'Sammy'],
      said: 'She is my manager',
      marked: 'Sam, your colleague',
      person: { first_name: 'Robin' },
    });
    expect(req.user).toContain(
      'THE SOMEONE THE PAGE IS ABOUT: Sam, also called Sammy, their colleague, as Gremly understood it from the records',
    );
    expect(req.user).toContain('WHAT THEY MARKED ON THE PAGE: "Sam, your colleague"');
    expect(req.system.fixed).toContain('Never infer anything their words do not say.');
  });

  it('writes the name among their names, as theirs', async () => {
    const mem = memoryDb({ life_people: [{ ...someone, user_id: USER }], life_person_names: [] });
    jsonCall.mockResolvedValue({
      output: { name: 'Samira', who: null },
      model: 'personCorrection',
    });
    const r = await actual.applyPersonCorrection({}, mem, {
      userId: USER,
      someone,
      said: 'It is Samira',
      person: {},
      nowIso: 'now',
    });
    expect(r).toMatchObject({ changed: true, name: 'Samira', who: null });
    expect(mem.tables.life_people[0]).toMatchObject({
      name: 'Samira',
      name_by: 'person',
      relationship: 'colleague',
    });
    expect(mem.tables.life_person_names).toEqual([
      expect.objectContaining({ person_id: SAM, name: 'Samira', by: 'person' }),
    ]);
  });
});
