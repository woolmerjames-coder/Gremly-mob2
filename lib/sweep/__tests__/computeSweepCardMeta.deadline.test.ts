/**
 * A Sweep card for a todo with a deadline and no day planned (stage 2c): due
 * today on its deadline, overdue after, and worded as a deadline.
 */
import { computeSweepCardMeta } from '../computeSweepCardMeta';
import { getDateService } from '../../date';
import type { SweepCandidate } from '../types';

const card = (
  id: string,
  raw: Record<string, unknown>,
  flags: { isDueToday: boolean; isOverdue: boolean },
) =>
  ({
    id,
    kind: 'todo',
    createdAt: '2025-12-03T10:00:00Z',
    dropId: null,
    skippedInSweepAt: null,
    isCreatedToday: false,
    ...flags,
    raw: { id, name: id, ...raw },
  }) as unknown as SweepCandidate;

describe('computeSweepCardMeta: a todo with a deadline and no day planned', () => {
  const ds = getDateService();
  // read inside each test, after the test setup sets the day's end, so the
  // hour the suite runs at never matters
  let today = '';
  beforeEach(() => {
    today = ds.today();
  });

  it('is due today on its deadline, worded as a deadline', () => {
    const meta = computeSweepCardMeta(
      card('d', { due_day: null, target_date: today }, { isDueToday: true, isOverdue: false }),
    );
    expect(meta).toMatchObject({ todoStatus: 'due_today', byDeadline: true });
  });

  it('is overdue once its deadline has passed', () => {
    const meta = computeSweepCardMeta(
      card(
        'd',
        { due_day: null, target_date: ds.addDays(today, -1) },
        { isDueToday: false, isOverdue: true },
      ),
    );
    expect(meta).toMatchObject({ todoStatus: 'overdue', byDeadline: true });
  });

  it('with its deadline tomorrow it is due tomorrow, and further off it still needs a day', () => {
    const tomorrow = computeSweepCardMeta(
      card(
        'd',
        { due_day: null, target_date: ds.addDays(today, 1) },
        { isDueToday: false, isOverdue: false },
      ),
    );
    expect(tomorrow.todoStatus).toBe('due_tomorrow');
    const later = computeSweepCardMeta(
      card(
        'd',
        { due_day: null, target_date: ds.addDays(today, 5) },
        { isDueToday: false, isOverdue: false },
      ),
    );
    expect(later.todoStatus).toBe('unscheduled');
  });

  it('a todo with a planned day is not worded as a deadline', () => {
    const meta = computeSweepCardMeta(
      card(
        'p',
        { due_day: today, target_date: ds.addDays(today, 3) },
        { isDueToday: true, isOverdue: false },
      ),
    );
    expect(meta).toMatchObject({ todoStatus: 'due_today', byDeadline: false });
  });
});
