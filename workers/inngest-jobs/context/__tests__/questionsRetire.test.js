/**
 * @jest-environment node
 *
 * The daily check on open questions (context/questions.js) never sees a tidy
 * up (data fabric stage 4f): its plans are past by design, and it waits for
 * the person's tap on Ask Gremly's questions. Made up records only.
 */
import { reviewQuestions } from '../questions';
import { db } from '../db';
import { jsonCall } from '../llm';
import { memoryDb } from './memoryDb';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: async () => ({ first_name: 'Noor', identity: {} }),
}));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: () => 'model' }));
jest.mock('../corrections', () => ({ recentCorrections: async () => [] }));
jest.mock('../cache', () => ({ invalidateChatCache: async () => ({}) }));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: async () => ({ today: '2026-11-12', dayEndHour: 3 }),
}));

it('shows the model every open question but a tidy up, and never retires one', async () => {
  const t = {
    gremly_questions: [
      {
        id: 'q-fact',
        user_id: 'u',
        kind: 'fact',
        question: 'Did the Hudson weekend go ahead?',
        status: 'open',
        created_at: '2026-11-01T09:00:00Z',
      },
      {
        id: 'q-tidy',
        user_id: 'u',
        kind: 'tidy',
        question: 'Did these plans happen?',
        status: 'open',
        created_at: '2026-11-02T09:00:00Z',
      },
    ],
    life_facts: [],
  };
  const mem = memoryDb(t);
  const VIEWS = { life_facts_now: 'life_facts' };
  db.mockReturnValue({
    ...mem,
    select: (p) => {
      const [table, q] = p.split('?');
      return mem.select(`${VIEWS[table] || table}?${q || ''}`);
    },
  });
  jsonCall.mockImplementation(async (_env, { user }) => ({
    model: 'model',
    output: {
      decisions: (user.match(/^q\d+/gm) || []).map((ref) => ({
        question_ref: ref,
        action: 'retire',
        basis: 'moment_passed',
        duplicate_of: null,
        fact_refs: [],
        reason: 'past',
      })),
    },
  }));
  const r = await reviewQuestions({}, 'u', 'America/New_York', { shadow: false });
  expect(jsonCall.mock.calls[0][1].user).not.toContain('Did these plans happen?');
  expect(r.checked).toBe(1);
  expect(Object.fromEntries(mem.tables.gremly_questions.map((q) => [q.id, q.status]))).toEqual({
    'q-fact': 'expired',
    'q-tidy': 'open',
  });
});
