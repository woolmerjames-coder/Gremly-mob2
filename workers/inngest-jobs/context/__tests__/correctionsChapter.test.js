/**
 * @jest-environment node
 *
 * An answer to a question about a Chapter goes through the correction path to
 * context/chapterAnswers.js, read on its own: it closes the question only when
 * it answers it, and touches no fact.
 */
import { applyCorrection } from '../corrections.js';
import { answerChapterQuestion } from '../chapterAnswers.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../db.js', () => ({ ...jest.requireActual('../db.js'), db: jest.fn() }));
jest.mock('../cache.js', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));
jest.mock('../chapterAnswers.js', () => ({
  answerChapterQuestion: jest.fn(),
  CHAPTER_QUESTION_KINDS: ['start_chapter', 'close_chapter', 'while_away'],
}));

const Q = '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b';

function tables(kind, question) {
  return {
    user_corrections: [
      {
        id: 'c-1',
        user_id: 'u',
        said: 'Yes, it is over',
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
        kind,
        question: 'Is the 10K behind you now?',
        status: 'open',
        record_id: 'ch-1',
        proposed_change: { type: 'close', chapter_id: 'ch-1' },
        ...question,
      },
    ],
    life_facts: [],
    life_fact_changes: [],
  };
}

beforeEach(() => answerChapterQuestion.mockReset());

it.each(['close_chapter', 'start_chapter', 'while_away'])('a %s answer is read for the Chapter and closes the question', async (kind) => {
  const mem = memoryDb(tables(kind));
  db.mockReturnValue(mem);
  answerChapterQuestion.mockResolvedValue({ answers: true, closed: 'ch-1' });
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(answerChapterQuestion).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ userId: 'u', said: 'Yes, it is over', question: expect.objectContaining({ id: Q, kind, record_id: 'ch-1' }) }),
  );
  expect(mem.tables.gremly_questions[0]).toMatchObject({ status: 'answered', answer: 'Yes, it is over' });
  expect(mem.tables.life_fact_changes).toHaveLength(0);
  expect(mem.tables.user_corrections[0]).toMatchObject({ status: 'applied' });
  expect(r).toMatchObject({ question_answered: Q, closed: 'ch-1' });
});

it('leaves the question open when their words do not answer it', async () => {
  const mem = memoryDb(tables('close_chapter'));
  db.mockReturnValue(mem);
  answerChapterQuestion.mockResolvedValue({ answers: false });
  const r = await applyCorrection({}, 'c-1', 'run');
  expect(mem.tables.gremly_questions[0].status).toBe('open');
  expect(r).toMatchObject({ question_left_open: Q });
});

it('reads a question already answered no further, on a retry', async () => {
  const mem = memoryDb(tables('close_chapter', { status: 'answered' }));
  db.mockReturnValue(mem);
  await applyCorrection({}, 'c-1', 'run');
  expect(answerChapterQuestion).not.toHaveBeenCalled();
  expect(mem.tables.user_corrections[0].status).toBe('applied');
});
