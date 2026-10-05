/**
 * Gremly's questions in the wrap up (lib/wrapup/questions): picked by rule
 * from the ones already open.
 */
jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn() } }));

import { itemKindOf, pickQuestions, questionButtons, type WrapQuestion } from '../questions';

const DAY = '2026-09-30';
const q = (id: string, more: Partial<WrapQuestion> = {}): WrapQuestion => ({
  id,
  question: `Question ${id}?`,
  choices: [],
  created_at: '2026-09-20T10:00:00Z',
  asked_at: null,
  record_table: null,
  record_id: null,
  private: false,
  ...more,
});
const none = { day: DAY, decidedIds: new Set<string>(), askedToday: new Set<string>() };

test('the oldest first, two at most', () => {
  const open = [
    q('c', { created_at: '2026-09-25T10:00:00Z' }),
    q('a', { created_at: '2026-09-01T10:00:00Z' }),
    q('b', { created_at: '2026-09-10T10:00:00Z' }),
  ];
  expect(pickQuestions(open, none).map((x) => x.id)).toEqual(['a', 'b']);
});

test('never one tied to an item the Sweep just decided', () => {
  const open = [q('parcel', { record_table: 'todos', record_id: 't1' }), q('dentist')];
  expect(pickQuestions(open, { ...none, decidedIds: new Set(['t1']) }).map((x) => x.id)).toEqual([
    'dentist',
  ]);
  // an item that was not decided tonight can still be asked about
  expect(pickQuestions(open, none).map((x) => x.id)).toEqual(['parcel', 'dentist']);
});

test('one asked in the last few days, or already in today’s thread, waits', () => {
  const open = [
    q('recent', { asked_at: '2026-09-28T08:00:00Z' }),
    q('old', { asked_at: '2026-09-26T08:00:00Z' }),
    q('morning'),
  ];
  expect(
    pickQuestions(open, { ...none, askedToday: new Set(['morning']) }).map((x) => x.id),
  ).toEqual(['old']);
});

test('one about something private, or with no words, is never asked here', () => {
  expect(pickQuestions([q('p', { private: true }), q('e', { question: '' })], none)).toEqual([]);
});

test('buttons come from its choices; with none it is typed', () => {
  expect(
    questionButtons(['Friday', 'Monday', 'friday', '']).map((b) => [b.label, b.action]),
  ).toEqual([
    ['Friday', 'answer'],
    ['Monday', 'answer'],
    ['Something else', 'answer_other'],
    ['Skip', 'skip'],
  ]);
  expect(questionButtons([]).map((b) => [b.label, b.action])).toEqual([
    ['Type an answer', 'answer_other'],
    ['Skip', 'skip'],
  ]);
});

test('the kind of item a question is about', () => {
  expect(itemKindOf('todos')).toBe('todo');
  expect(itemKindOf('notes')).toBe('note');
  expect(itemKindOf('life_facts')).toBeNull();
});
