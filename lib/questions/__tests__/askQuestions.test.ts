/**
 * Answer some Gremly questions on Ask Gremly (data fabric stage 4f): which
 * questions it reads, the tidy ups it can put, and when the way in shows,
 * held to the workers' rules (workers/shared/questionRules.js).
 */
jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../../supabase/client';
import {
  askQuestionsFor,
  fetchAskQuestions,
  questionsWaiting,
  QUESTIONS_ENTRY_AT,
  tidyOf,
  type AskQuestion,
} from '../askQuestions';

const DAY = '2026-11-12';
const q = (id: string, more: Partial<AskQuestion> = {}): AskQuestion => ({
  id,
  question: `Question ${id}?`,
  choices: [],
  created_at: '2026-11-01T10:00:00Z',
  asked_at: null,
  record_table: null,
  record_id: null,
  private: false,
  topic: null,
  why: null,
  tidy: null,
  ...more,
});

function rows(data: Record<string, unknown>[]) {
  const chain: any = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    limit: async () => ({ data, error: null }),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
}

test('reads every open question but a welcome back, and a tidy up only when it can be put', async () => {
  rows([
    {
      id: 'a',
      kind: 'fact',
      question: 'Which day is your birthday?',
      choices: ['30 April', '25 April'],
      weight: 'needs',
      topic: 'Your birthday',
      why: 'From a chat in April.',
      created_at: '2026-11-01T10:00:00Z',
    },
    {
      id: 'b',
      kind: 'while_away',
      question: 'Did the trip end?',
      created_at: '2026-11-01T10:00:00Z',
    },
    {
      id: 'c',
      kind: 'tidy',
      question: 'Shall I forget these?',
      choices: ['Forget them', 'Keep them'],
      proposed_change: {
        type: 'set_aside',
        fact_ids: ['f1', 'f2'],
        yes: 'Forget them',
        no: 'Keep them',
        statements: ['A sync.', 'A call.'],
        from_calendar: true,
      },
      created_at: '2026-11-02T10:00:00Z',
    },
    {
      id: 'd',
      kind: 'tidy',
      question: 'Forget?',
      proposed_change: { type: 'merge' },
      created_at: '2026-11-02T10:00:00Z',
    },
    {
      id: 'e',
      kind: 'fact',
      question: 'How is the knee?',
      fact: { private: false, health: true },
      created_at: '2026-11-02T10:00:00Z',
    },
  ]);
  const open = await fetchAskQuestions();
  expect(open.map((x) => x.id)).toEqual(['a', 'c', 'e']);
  expect(open[0]).toMatchObject({
    weight: 'needs',
    topic: 'Your birthday',
    why: 'From a chat in April.',
    tidy: null,
  });
  expect(open[1].tidy).toEqual({
    type: 'set_aside',
    fact_ids: ['f1', 'f2'],
    yes: 'Forget them',
    no: 'Keep them',
    statements: ['A sync.', 'A call.'],
    from_calendar: true,
  });
  // about health: read, never asked
  expect(askQuestionsFor(open, DAY).map((x) => x.id)).toEqual(['a', 'c']);
});

test('a tidy up needs its type, its yes and no and the facts it names', () => {
  expect(tidyOf('fact', { type: 'set_aside', fact_ids: ['f'], yes: 'Y', no: 'N' })).toBeNull();
  expect(tidyOf('tidy', { type: 'set_aside', fact_ids: [], yes: 'Y', no: 'N' })).toBeNull();
  expect(tidyOf('tidy', { type: 'happened', fact_ids: ['f'], yes: 'Y', no: '' })).toBeNull();
  expect(tidyOf('tidy', { type: 'happened', fact_ids: ['f'], yes: 'Y', no: 'N' })).toMatchObject({
    type: 'happened',
    from_calendar: false,
    statements: [''],
  });
  // each statement stays beside the fact it names, so a tick names the right one
  expect(
    tidyOf('tidy', {
      type: 'set_aside',
      fact_ids: ['a', 'b', 'c'],
      yes: 'Y',
      no: 'N',
      statements: ['A.', '', 'C.'],
    })?.statements,
  ).toEqual(['A.', '', 'C.']);
});

test('asks what needs an answer first, and nothing held, asked lately or private', () => {
  const open = [
    q('old'),
    q('needs', { weight: 'needs', created_at: '2026-11-10T10:00:00Z' }),
    q('held', { hold_until: '2026-11-13' }),
    q('lately', { asked_at: '2026-11-11T10:00:00Z' }),
    q('private', { private: true }),
  ];
  expect(askQuestionsFor(open, DAY).map((x) => x.id)).toEqual(['needs', 'old']);
});

test('the way in shows when one needs an answer, or enough are waiting', () => {
  expect(questionsWaiting([q('a'), q('b')])).toEqual({ show: false, count: 2, needs: 0 });
  expect(questionsWaiting([q('a', { weight: 'needs' })])).toEqual({
    show: true,
    count: 1,
    needs: 1,
  });
  expect(questionsWaiting([q('a'), q('b'), q('c')])).toEqual({ show: true, count: 3, needs: 0 });
  expect(questionsWaiting([])).toEqual({ show: false, count: 0, needs: 0 });
});

test('the rule is the workers’ rule (workers/shared/questionRules.js)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rules = require('../../../workers/shared/questionRules.js');
  expect(QUESTIONS_ENTRY_AT).toBe(rules.QUESTIONS_ENTRY_AT);
  const lists = [
    [],
    [q('a')],
    [q('a'), q('b')],
    [q('a'), q('b'), q('c')],
    [q('a', { weight: 'needs' })],
    [q('a', { weight: 'helps' })],
  ];
  for (const list of lists) expect(questionsWaiting(list)).toEqual(rules.questionsWaiting(list));
});
