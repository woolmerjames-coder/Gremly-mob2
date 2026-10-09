/**
 * @jest-environment node
 *
 * The room for Gremly's questions (context/questionRoom.js): at most so many
 * wait at once, a question held to a later day does not count, and across
 * every writer one that needs an answer comes first, holding back for a week
 * the newest one that only helps and was never put to them. Made up rows only.
 */
import { questionRoom, takeRoom, HELD_FOR_DAYS } from '../questionRoom.js';
import { QUESTIONS_WAITING_MOST } from '../../../shared/questionRules.js';
import { memoryDb } from './memoryDb.js';

const NOW = '2026-10-18T09:00:00Z';
const q = (i, over = {}) => ({
  id: `q-${i}`,
  user_id: 'u',
  kind: 'fact',
  status: 'open',
  weight: 'helps',
  asked_at: null,
  hold_until: null,
  created_at: `2026-10-${String(i).padStart(2, '0')}T08:00:00Z`,
  ...over,
});
const full = () => Array.from({ length: QUESTIONS_WAITING_MOST }, (_, i) => q(i + 1));

it('counts what waits now: never a welcome back, nor one held to a later day', async () => {
  const d = memoryDb({
    gremly_questions: [
      q(1),
      q(2, { status: 'asked' }),
      q(3, { kind: 'while_away' }),
      q(4, { hold_until: '2026-10-25' }),
      q(5, { hold_until: '2026-10-18' }),
      q(6, { status: 'answered' }),
    ],
  });
  expect(await questionRoom(d, 'u', NOW)).toBe(QUESTIONS_WAITING_MOST - 3);
});

it('takes the room by weight, those that need an answer first', async () => {
  const d = memoryDb({ gremly_questions: full().slice(1) });
  const rows = [{ question: 'a', weight: 'helps' }, { question: 'b', weight: 'needs' }];
  const { kept, held, no_room } = await takeRoom(d, 'u', rows, NOW);
  expect(kept.map((r) => r.question)).toEqual(['b']);
  expect(held).toEqual([]);
  expect(no_room).toBe(1);
});

it('with no room, one that needs an answer holds back the newest that only helps and was never put to them, for a week', async () => {
  const rows = full();
  rows[5] = q(6, { asked_at: '2026-10-07T08:00:00Z' });
  rows[4] = q(5, { weight: 'needs' });
  const d = memoryDb({ gremly_questions: rows });
  const out = await takeRoom(d, 'u', [{ question: 'n', weight: 'needs' }, { question: 'h', weight: 'helps' }], NOW);
  expect(out.kept.map((r) => r.question)).toEqual(['n']);
  expect(out.held).toEqual(['q-4']);
  expect(out.no_room).toBe(1);
  const heldRow = d.tables.gremly_questions.find((x) => x.id === 'q-4');
  expect(heldRow).toMatchObject({ status: 'open', hold_until: `2026-10-${18 + HELD_FOR_DAYS}` });
  // nothing is lost: the held one waits, and is counted again once its day comes
  expect(await questionRoom(d, 'u', NOW)).toBe(1);
});
