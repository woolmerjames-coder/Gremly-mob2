/**
 * @jest-environment node
 *
 * An answer to a question about someone in their life (data fabric stage 4c)
 * goes through the correction path, read on its own: it closes the question
 * only when it answers it, raises nothing (the next questions come with next
 * week's set), and touches no fact.
 */
import { applyCorrection } from '../corrections.js';
import { answerPersonQuestion } from '../peopleQuestions.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../db.js', () => ({ ...jest.requireActual('../db.js'), db: jest.fn() }));
jest.mock('../cache.js', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));
jest.mock('../peopleQuestions.js', () => ({
  answerPersonQuestion: jest.fn(),
  settleGuess: jest.fn(),
}));

const Q = '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a';

function tables(question) {
  return {
    user_corrections: [
      {
        id: 'c-1',
        user_id: 'u',
        said: 'Yes',
        surface: 'question',
        target_ref: { id: Q },
        status: 'received',
        created_at: '2026-10-07T10:00:00Z',
      },
    ],
    gremly_questions: [
      {
        id: Q,
        user_id: 'u',
        kind: 'person',
        question: 'Is Rowan the husband you mention?',
        status: 'asked',
        proposed_change: { type: 'same', merge_id: 'm-1' },
        ...question,
      },
    ],
    life_facts: [],
    life_fact_changes: [],
  };
}

beforeEach(() => {
  answerPersonQuestion.mockReset();
});

it('closes the question, and raises nothing until next week\'s set', async () => {
  const mem = memoryDb(tables());
  db.mockReturnValue(mem);
  answerPersonQuestion.mockResolvedValue({ answers: true, merge: { merged: true } });
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(answerPersonQuestion).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      userId: 'u',
      said: 'Yes',
      question: expect.objectContaining({ id: Q }),
    }),
  );
  expect(mem.tables.gremly_questions[0]).toMatchObject({ status: 'answered', answer: 'Yes' });
  expect(mem.tables.gremly_questions).toHaveLength(1);
  expect(mem.tables.user_corrections[0]).toMatchObject({ status: 'applied' });
  expect(r).toMatchObject({ question_answered: Q });
});

it('leaves the question open when their words do not answer it, and raises nothing', async () => {
  const mem = memoryDb(tables());
  db.mockReturnValue(mem);
  answerPersonQuestion.mockResolvedValue({ answers: false });
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.gremly_questions[0].status).toBe('asked');
  expect(r).toMatchObject({ question_left_open: Q });
  expect(mem.tables.user_corrections[0].status).toBe('applied');
});

it('reads a question already answered no further, on a retry', async () => {
  const mem = memoryDb(tables({ status: 'answered' }));
  db.mockReturnValue(mem);
  await applyCorrection({}, 'c-1', 'run');
  expect(answerPersonQuestion).not.toHaveBeenCalled();
  expect(mem.tables.user_corrections[0].status).toBe('applied');
});
