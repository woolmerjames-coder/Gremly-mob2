/**
 * Tonight's cards in the words Gremly reads (lib/wrapup/gremlyWords.ts): what
 * each decision came to, what it was before, and what a message in today's
 * thread carries about them.
 */
jest.mock('../../plan/storePlan', () => ({
  dayRecordFromStore: () => ({ travel: null }),
  meetingsFromStore: () => [],
}));

import type { WrapUpState } from '../../brief/types';
import type { SweepRecord } from '../../changes/sweep';
import type { WrapNow } from '../day';
import {
  cardTitles,
  outcomeWords,
  todosPlannedFor,
  wasWords,
  wrapTurnContext,
} from '../gremlyWords';

const NOW = {
  day: '2026-10-03',
  tomorrow: '2026-10-04',
  words: { weekday: 'Saturday', tomorrow: 'tomorrow', late: false, early: false },
  evening: true,
  part: 'evening',
  dayEndHour: 3,
  dayStartMs: 0,
} as unknown as WrapNow;

const ID = '00000000-0000-4000-8000-000000000001';
const rec = (r: Partial<SweepRecord>): SweepRecord =>
  ({
    cid: 'c',
    type: 'todo',
    id: ID,
    title: 'Do taxes',
    label: '',
    at: '',
    out: 'kept',
    op: 'keep',
    ...r,
  }) as SweepRecord;

describe('a decision on a card, in words', () => {
  it('says where it went', () => {
    expect(outcomeWords(rec({ op: 'change', fields: { day: '2026-10-04' } }), NOW)).toBe(
      'kept for tomorrow',
    );
    expect(outcomeWords(rec({ op: 'change', fields: { day: '2026-10-09' } }), NOW)).toBe(
      'kept for Friday',
    );
    expect(outcomeWords(rec({ op: 'later', fields: { later: '2026-10-05' } }), NOW)).toBe(
      'to come back on Monday',
    );
    expect(outcomeWords(rec({ op: 'keep', fields: {} }), NOW)).toBe('kept as it is');
    expect(outcomeWords(rec({ op: 'archive', out: 'let_go' }), NOW)).toBe('let go');
    expect(outcomeWords(rec({ out: 'left', fields: { left: true } }), NOW)).toBe(
      'left for the next Sweep',
    );
  });

  it('says what it was before, when it moved', () => {
    expect(wasWords(rec({ op: 'change', before: { day: '2026-10-05' } }))).toBe(
      'was due Monday 5 October',
    );
    expect(wasWords(rec({ op: 'change', before: { day: null } }))).toBe('had no day');
    expect(wasWords(rec({ op: 'keep', before: {} }))).toBe('');
    expect(wasWords(rec({ op: 'archive' }))).toBe('');
  });
});

describe('what a message in the thread carries about tonight', () => {
  const state = (w: Partial<WrapUpState>): WrapUpState =>
    ({ started_at: 'x', step: 'habits', items: [], decisions: [], ...w }) as WrapUpState;

  it('has each card by its id, with what it was, and leaves out one undone', () => {
    const ctx = wrapTurnContext(
      state({
        decisions: [
          rec({ op: 'change', fields: { day: '2026-10-09' }, before: { day: '2026-10-05' } }),
          rec({ id: 'x2', title: 'Old idea', op: 'archive', out: 'let_go', undone_at: 'y' }),
        ],
      }),
      NOW,
    );
    expect(ctx).toEqual({
      step: 'habits',
      decisions: [
        {
          id: ID,
          type: 'todo',
          title: 'Do taxes',
          outcome: 'kept for Friday',
          was: 'was due Monday 5 October',
        },
      ],
    });
  });

  it('is still sent once finished while it sorted anything, and not before one starts', () => {
    expect(wrapTurnContext(null, NOW)).toBeNull();
    expect(wrapTurnContext(state({ step: 'done' }), NOW)).toBeNull();
    const done = wrapTurnContext(
      state({ step: 'done', decisions: [rec({ op: 'keep', fields: {} })] }),
      NOW,
    );
    expect(done?.step).toBe('done');
    expect(done?.decisions[0].outcome).toBe('kept as it is');
  });
});

describe('what the close and the opening are told', () => {
  it('names what is waiting in the cards', () => {
    expect(
      cardTitles([
        { candidate: { raw: { name: 'Submit to Apple Health' } } },
        { candidate: { raw: { title: 'Hotel ideas' } } },
        { candidate: { raw: {} } },
      ]),
    ).toEqual(['Submit to Apple Health', 'Hotel ideas']);
  });

  it('has every open todo planned for the day, timed ones first', () => {
    const todos = [
      { id: '1', name: 'Untimed', due_day: '2026-10-04' },
      { id: '2', name: 'At nine', due_day: '2026-10-04', due_time: '09:00' },
      { id: '3', name: 'Done', due_day: '2026-10-04', completed_at: 'x' },
      { id: '4', name: 'Archived', due_day: '2026-10-04', archived: true },
      { id: '5', name: 'Another day', due_day: '2026-10-05' },
      { id: '6', name: 'At eight', due_day: '2026-10-04', due_time: '08:00' },
    ];
    expect(todosPlannedFor(todos, '2026-10-04')).toEqual(['At eight', 'At nine', 'Untimed']);
  });
});
