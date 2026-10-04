/**
 * What tonight's wrap up shows of Sweep's cards (lib/wrapup/cards): a todo
 * that was simply due today goes on the Still open today card, and anything
 * with something to decide stays a swipe card.
 */
import { plainDueToday, splitForWrapUp, type WrapCard } from '../cards';
import type { SweepCandidate } from '../../sweep/types';

const DAY = '2026-09-30';

function todo(id: string, raw: Record<string, unknown>, more: Partial<SweepCandidate> = {}) {
  return {
    candidate: {
      id,
      kind: 'todo',
      createdAt: '2026-09-28T10:00:00Z',
      isOverdue: false,
      isDueToday: raw.due_day === DAY,
      isCreatedToday: false,
      raw: { id, name: `Todo ${id}`, ...raw },
      ...more,
    } as unknown as SweepCandidate,
    meta: {} as WrapCard['meta'],
  };
}
function note(id: string, raw: Record<string, unknown> = {}) {
  return {
    candidate: {
      id,
      kind: 'note',
      createdAt: '2026-09-30T10:00:00Z',
      isOverdue: false,
      isDueToday: false,
      isCreatedToday: true,
      raw: { id, title: `Note ${id}`, subtype: 'idea', ...raw },
    } as unknown as SweepCandidate,
    meta: {} as WrapCard['meta'],
  };
}

test('a todo that was simply due today is not a swipe card', () => {
  const all = [
    todo('due', { due_day: DAY }),
    todo('overdue', { due_day: '2026-09-28' }),
    todo('undated', { due_day: null }),
    note('idea'),
  ];
  const { cards, still } = splitForWrapUp(all, DAY);
  expect(cards.map((c) => c.candidate.id)).toEqual(['overdue', 'undated', 'idea']);
  expect(still).toEqual([{ id: 'due', title: 'Todo due' }]);
});

test('a due today todo with something to decide stays a swipe card', () => {
  // skipped in an earlier Sweep
  expect(
    plainDueToday(
      todo('a', { due_day: DAY }, { skippedInSweepAt: '2026-09-29T20:00:00Z' }).candidate,
      DAY,
    ),
  ).toBe(false);
  // brought back for today
  expect(plainDueToday(todo('b', { due_day: DAY, resurface_at: DAY }).candidate, DAY)).toBe(false);
  // asks a question
  expect(
    plainDueToday(todo('c', { due_day: DAY, views: { needs_clarification: true } }).candidate, DAY),
  ).toBe(false);
  // nothing to decide
  expect(plainDueToday(todo('d', { due_day: DAY }).candidate, DAY)).toBe(true);
  // a note never is
  expect(plainDueToday(note('n').candidate, DAY)).toBe(false);
});

test('it is counted from the day given: after midnight their day is still yesterday', () => {
  // the calendar says 1 October; their day is still 30 September
  const all = [todo('wed', { due_day: DAY }), todo('thu', { due_day: '2026-10-01' })];
  expect(splitForWrapUp(all, DAY).still.map((s) => s.id)).toEqual(['wed']);
  expect(splitForWrapUp(all, '2026-10-01').still.map((s) => s.id)).toEqual(['thu']);
});
