/**
 * The rules for asking Gremly's questions, held in one place
 * (workers/shared/questionRules.js, data fabric stage 4a).
 */
import {
  askableQuestions,
  ASKED_WAIT_DAYS,
  QUESTION_CAPS,
  QUESTION_KINDS,
  QUESTIONS_ENTRY_AT,
  QUESTIONS_ONLY_KINDS,
  questionsWaiting,
  questionWeight,
} from '../questionRules.js';

const DAY = '2026-10-07';
const q = (id, more = {}) => ({
  id,
  question: `Question ${id}?`,
  created_at: '2026-09-20T10:00:00Z',
  asked_at: null,
  hold_until: null,
  record_id: null,
  fact: { private: false, health: false },
  ...more,
});

test('the caps: one in the brief, two in the wrap up, one above the box', () => {
  expect(QUESTION_CAPS).toEqual({ brief: 1, wrap: 2, worlds: 1 });
  expect(ASKED_WAIT_DAYS).toBe(3);
});

test('never about something private or about health, as a row or a list of one', () => {
  const qs = [
    q('private', { fact: { private: true } }),
    q('health', { fact: [{ private: false, health: true }] }),
    q('plain'),
  ];
  expect(askableQuestions(qs, { day: DAY }).map((x) => x.id)).toEqual(['plain']);
});

test('one held until a later day waits, and is askable on that day', () => {
  const qs = [q('held', { hold_until: '2026-10-09' })];
  expect(askableQuestions(qs, { day: DAY })).toEqual([]);
  expect(askableQuestions(qs, { day: '2026-10-09' }).map((x) => x.id)).toEqual(['held']);
});

test('one put to them in the last three days waits', () => {
  const qs = [
    q('lately', { asked_at: '2026-10-04T20:00:00Z' }),
    q('before', { asked_at: '2026-10-03T20:00:00Z' }),
  ];
  expect(askableQuestions(qs, { day: DAY }).map((x) => x.id)).toEqual(['before']);
});

test('none asked today already, none about an item decided today, oldest first', () => {
  const qs = [
    q('late', { created_at: '2026-10-01T10:00:00Z' }),
    q('early', { created_at: '2026-09-01T10:00:00Z' }),
    q('asked', {}),
    q('decided', { record_id: 't1' }),
    q('blank', { question: '  ' }),
  ];
  const out = askableQuestions(qs, {
    day: DAY,
    askedToday: new Set(['asked']),
    decidedIds: new Set(['t1']),
  });
  expect(out.map((x) => x.id)).toEqual(['early', 'late']);
});

describe("weighed questions and Ask Gremly's entry (data fabric stage 4f)", () => {
  test('one that needs an answer comes first, then the oldest', () => {
    const qs = [
      q('old', { created_at: '2026-09-01T10:00:00Z' }),
      q('needs', { weight: 'needs', created_at: '2026-10-01T10:00:00Z' }),
      q('older', { created_at: '2026-08-01T10:00:00Z' }),
    ];
    expect(askableQuestions(qs, { day: DAY }).map((x) => x.id)).toEqual(['needs', 'older', 'old']);
  });

  test('a weight is needs or helps, and nothing else', () => {
    expect(questionWeight('needs')).toBe('needs');
    expect(questionWeight('helps')).toBe('helps');
    expect(questionWeight('urgent')).toBeNull();
  });

  test('the entry shows for one that needs an answer, or for several waiting', () => {
    expect(questionsWaiting([q('a', { weight: 'needs' })])).toEqual({
      show: true,
      count: 1,
      needs: 1,
    });
    expect(questionsWaiting([q('a'), q('b')]).show).toBe(false);
    expect(
      questionsWaiting(Array.from({ length: QUESTIONS_ENTRY_AT }, (_, i) => q(`x${i}`))).show,
    ).toBe(true);
    expect(questionsWaiting([]).show).toBe(false);
  });

  test('a tidy up is a kind only Ask Gremly asks', () => {
    expect(QUESTION_KINDS).toContain('tidy');
    expect(QUESTIONS_ONLY_KINDS).toEqual(['tidy']);
  });
});
