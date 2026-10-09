/**
 * @jest-environment node
 */
// A reply to one of Gremly's questions (workers/inngest-jobs/context/corrections.js):
// their words close the question only when the model reads them as its answer.
// Asked something back, the question stays open for another day, and the words
// that were never its answer are not kept as one.

import { applyCorrection, questionOutcome } from '../corrections.js';

const SUPA = 'https://db.test';
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const QUESTION = '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a';
const CORRECTION = '9c9c9c9c-9c9c-4c9c-8c9c-9c9c9c9c9c9c';
const ENV = { SUPABASE_URL: SUPA, SUPABASE_SERVICE_KEY: 'k', GEMINI_API_KEY: 'g' };

const NOTHING = {
  corrected_facts: [],
  changed_facts: [],
  happened_facts: [],
  private_fact_refs: [],
  new_facts: [],
  rewrites: [],
  retire_anchor_refs: [],
};

/**
 * The database and the model, stood in for: reads answer from the rows given,
 * everything written is kept in sent, and the model replies with output.
 */
function standIn({ said, output, status = 'asked', question = {}, extra = {} }) {
  const sent = [];
  const asked = [];
  const rows = {
    user_corrections: [
      {
        id: CORRECTION,
        user_id: USER,
        said,
        surface: 'question',
        target_kind: null,
        target_ref: { id: QUESTION, kind: null, text: null },
        chat_id: null,
        fact_ids: null,
        status: 'pending',
        created_at: '2026-10-03T04:00:00Z',
      },
    ],
    gremly_questions: [
      {
        id: QUESTION,
        question:
          'Did the move to the Lisbon office get confirmed, or are you still waiting to hear?',
        status,
        ...question,
      },
    ],
    notification_preferences: [{ timezone: 'America/Los_Angeles' }],
    ...extra,
  };
  const answer = (body) => ({
    ok: true,
    status: 200,
    text: async () => (body === null ? '' : JSON.stringify(body)),
  });
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.includes('generativelanguage')) {
      asked.push(JSON.parse(init.body));
      return answer({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] });
    }
    const path = u.slice(`${SUPA}/rest/v1/`.length);
    const table = path.split('?')[0];
    const method = init.method || 'GET';
    if (method === 'GET') return answer(rows[table] || []);
    sent.push({ method, table, body: init.body ? JSON.parse(init.body) : null });
    return answer([]);
  });
  return { sent, asked };
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("what a reply does to Gremly's question", () => {
  it('closes it when the reply answers it, and leaves it open when it does not', () => {
    const q = { id: QUESTION, status: 'asked' };
    expect(questionOutcome(q, { answers_question: true })).toBe('answered');
    expect(questionOutcome(q, { answers_question: false })).toBe('open');
    // a reply that does not say is read as before: an answer
    expect(questionOutcome(q, {})).toBe('answered');
  });

  it('is nothing when there is no question, or it is already answered', () => {
    expect(questionOutcome(null, { answers_question: true })).toBeNull();
    expect(questionOutcome(undefined, { answers_question: false })).toBeNull();
    expect(
      questionOutcome({ id: QUESTION, status: 'answered' }, { answers_question: false }),
    ).toBeNull();
  });
});

describe('a reply that asks Gremly something back', () => {
  const said = 'How did you know about the Lisbon move?';
  const output = {
    understood:
      'They asked how Gremly knew about the move, and did not say whether it was confirmed.',
    answers_question: false,
    ...NOTHING,
  };

  it('leaves the question open, and does not keep their words as its answer', async () => {
    const { sent } = standIn({ said, output });
    const result = await applyCorrection(ENV, CORRECTION, 'run-1');
    expect(sent.filter((w) => w.table === 'gremly_questions')).toEqual([]);
    expect(result).toMatchObject({ answers_question: false, question_left_open: QUESTION });
    expect(result.question_answered).toBeUndefined();
  });

  it('is still applied once, with why the question stayed open kept on it', async () => {
    const { sent } = standIn({ said, output });
    await applyCorrection(ENV, CORRECTION, 'run-1');
    const kept = sent.filter((w) => w.method === 'PATCH' && w.table === 'user_corrections');
    expect(kept).toHaveLength(1);
    expect(kept[0].body).toMatchObject({
      status: 'applied',
      result: { answers_question: false, question_left_open: QUESTION, facts_added: 0 },
    });
  });

  it('asks the model to decide, by rule and in the shape of its reply', async () => {
    const { asked } = standIn({ said, output });
    await applyCorrection(ENV, CORRECTION, 'run-1');
    expect(asked).toHaveLength(1);
    expect(asked[0].systemInstruction.parts[0].text).toContain(
      'first decide whether it answers it, and say so in answers_question',
    );
    expect(asked[0].generationConfig.responseSchema.required).toContain('answers_question');
    expect(asked[0].generationConfig.responseSchema.properties.answers_question).toEqual({
      type: 'boolean',
    });
  });
});

describe('a reply that answers the question', () => {
  it('closes the question with their words, as before', async () => {
    const said = 'Still waiting, should hear next week';
    const { sent } = standIn({
      said,
      output: { understood: 'They are still waiting to hear.', answers_question: true, ...NOTHING },
    });
    const result = await applyCorrection(ENV, CORRECTION, 'run-2');
    const closed = sent.filter((w) => w.table === 'gremly_questions');
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      method: 'PATCH',
      body: { status: 'answered', answer: said },
    });
    expect(result).toMatchObject({ answers_question: true, question_answered: QUESTION });
    expect(result.question_left_open).toBeUndefined();
  });
});

describe('an answer about something Gremly thought but was not sure of', () => {
  const UNSURE = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
  const question = {
    kind: 'unsure',
    question: 'Are you training for a race at the moment?',
    proposed_change: { type: 'unsure', unsure_id: UNSURE },
    rests_on: [],
  };
  const extra = {
    life_unsure: [{ id: UNSURE, thinks: 'They may be training for a race', status: 'open' }],
  };

  it('is read beside what Gremly thought, made a fact in their words on a yes, and confirmed', async () => {
    const { sent, asked } = standIn({
      said: 'Yes, a half in the spring',
      question,
      extra,
      output: {
        understood: 'They are training for a half in the spring.',
        answers_question: true,
        guess_holds: 'yes',
        ...NOTHING,
        new_facts: [{ statement: 'Training for a half in the spring', subject: 'running', about_date: null, state: 'current' }],
      },
    });
    const result = await applyCorrection(ENV, CORRECTION, 'run-3');
    expect(asked[0].contents[0].parts[0].text).toContain(
      'WHAT GREMLY THOUGHT BUT WAS NOT SURE OF, WHICH THE QUESTION ASKED ABOUT:\n"They may be training for a race"',
    );
    expect(asked[0].generationConfig.responseSchema.required).toContain('guess_holds');
    expect(sent.find((w) => w.method === 'POST' && w.table === 'life_facts').body[0]).toMatchObject({
      statement: 'Training for a half in the spring',
      said_by: 'user',
    });
    expect(sent.find((w) => w.table === 'life_unsure')).toMatchObject({
      method: 'PATCH',
      body: { status: 'confirmed' },
    });
    expect(result).toMatchObject({ question_answered: QUESTION, facts_added: 1 });
  });

  it('is closed as a no on any other answer, and makes no fact of what Gremly thought', async () => {
    const { sent } = standIn({
      said: 'No, I stopped running',
      question,
      extra,
      output: { understood: 'They are not training.', answers_question: true, guess_holds: 'no', ...NOTHING },
    });
    await applyCorrection(ENV, CORRECTION, 'run-4');
    expect(sent.filter((w) => w.method === 'POST' && w.table === 'life_facts')).toEqual([]);
    expect(sent.find((w) => w.table === 'life_unsure')).toMatchObject({ body: { status: 'said_no' } });
  });
});
