/**
 * The quick sweep keeps only the cards that still need a decision before the
 * day is planned; Sweep's full list stays the evening review.
 */
import { needsDecision, quickSweepCards } from '../quickSweep';
import type { SweepCandidate, SweepCardMeta } from '../types';

const today = '2026-10-02';

const card = (
  id: string,
  kind: 'todo' | 'note',
  raw: Record<string, unknown> = {},
  isOverdue = false,
) => ({
  candidate: {
    id,
    kind,
    createdAt: '2026-10-02T04:00:00Z',
    isOverdue,
    isDueToday: raw.due_day === today,
    isCreatedToday: false,
    raw: { id, ...raw },
  } as unknown as SweepCandidate,
  meta: { noteCardType: null } as unknown as SweepCardMeta,
});

describe('needsDecision: todos', () => {
  it('2 October: six drops after last night’s Sweep need a day; four kept for today do not', () => {
    const drops = Array.from({ length: 6 }, (_, i) => card(`d${i}`, 'todo'));
    const kept = Array.from({ length: 4 }, (_, i) =>
      card(`k${i}`, 'todo', { due_day: today, decided_at: '2026-10-02T03:41:00Z' }),
    );
    const quick = quickSweepCards([...drops, ...kept], today);
    expect(quick.map((c) => c.candidate.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5']);
  });

  it('a todo past its day always needs one, even when it was decided before', () => {
    const c = card(
      'a',
      'todo',
      { due_day: '2026-09-30', decided_at: '2026-09-29T20:00:00Z' },
      true,
    );
    expect(needsDecision(c.candidate, today)).toBe(true);
  });

  it('an undated todo that was decided (it had a day, then the day was taken off) does not', () => {
    const c = card('a', 'todo', { due_day: null, decided_at: '2026-09-29T20:00:00Z' });
    expect(needsDecision(c.candidate, today)).toBe(false);
  });

  it('a skipped todo, or one resurfacing today, needs one', () => {
    const skipped = card('s', 'todo', {
      due_day: today,
      decided_at: '2026-10-01T20:00:00Z',
      skipped_in_sweep_at: '2026-10-02T03:40:00Z',
    });
    const back = card('r', 'todo', {
      due_day: today,
      decided_at: '2026-09-25T20:00:00Z',
      resurface_at: today,
    });
    expect(needsDecision(skipped.candidate, today)).toBe(true);
    expect(needsDecision(back.candidate, today)).toBe(true);
  });

  it('before the decided_at column exists, every undated todo still needs one', () => {
    expect(needsDecision(card('a', 'todo').candidate, today)).toBe(true);
  });

  it('a card with a question is always in', () => {
    const c = card('q', 'todo', {
      due_day: today,
      decided_at: '2026-10-01T20:00:00Z',
      needs_clarification: true,
    });
    expect(needsDecision(c.candidate, today)).toBe(true);
  });
});

describe('needsDecision: notes', () => {
  it('a drop not yet swept needs one; a swept note does not', () => {
    expect(needsDecision(card('n', 'note', { subtype: 'idea' }).candidate, today)).toBe(true);
    expect(
      needsDecision(
        card('m', 'note', { subtype: 'idea', swept_at: '2026-10-02T03:41:00Z' }).candidate,
        today,
      ),
    ).toBe(false);
  });

  it('an upcoming event only waits for a reminder, so it is left for the evening', () => {
    const ev = card('e', 'note', { subtype: 'event', target_date: '2026-10-07' });
    expect(needsDecision(ev.candidate, today)).toBe(false);
  });

  it('a skipped or resurfacing note needs one', () => {
    const skipped = card('s', 'note', {
      subtype: 'event',
      skipped_in_sweep_at: '2026-10-02T03:40:00Z',
    });
    const back = card('r', 'note', {
      subtype: 'idea',
      swept_at: '2026-09-20T03:41:00Z',
      resurface_at: today,
    });
    expect(needsDecision(skipped.candidate, today)).toBe(true);
    expect(needsDecision(back.candidate, today)).toBe(true);
  });
});

describe('needsDecision: a todo with a deadline and no day planned (stage 2c)', () => {
  it('needs a day, as a deadline is not a day to do it', () => {
    const c = card('d', 'todo', { due_day: null, target_date: '2026-10-05' });
    expect(needsDecision(c.candidate, today)).toBe(true);
  });

  it('once decided it waits, until its deadline passes and it is overdue', () => {
    const decided = {
      due_day: null,
      target_date: '2026-10-02',
      decided_at: '2026-10-01T20:00:00Z',
    };
    expect(needsDecision(card('on', 'todo', decided, false).candidate, today)).toBe(false);
    const passed = { ...decided, target_date: '2026-10-01' };
    expect(needsDecision(card('over', 'todo', passed, true).candidate, today)).toBe(true);
  });

  it('a todo with only scheduled_date has a day', () => {
    const c = card('s', 'todo', { due_day: null, scheduled_date: '2026-10-04' });
    expect(needsDecision(c.candidate, today)).toBe(false);
  });
});

describe('needsDecision: questions (stage 8)', () => {
  const swept = { swept_at: '2026-09-01T10:00:00Z', subtype: 'catchall' };

  it('a question made today or yesterday is in; an older one has lapsed', () => {
    const asked = (day: string) =>
      card(day, 'note', { ...swept, views: { needs_clarification: true, ask_since: day } });
    expect(needsDecision(asked(today).candidate, today)).toBe(true);
    expect(needsDecision(asked('2026-10-01').candidate, today)).toBe(true);
    expect(needsDecision(asked('2026-09-30').candidate, today)).toBe(false);
  });

  it('a habit with a question is in, and one without is not', () => {
    const habit = (views: Record<string, unknown>) =>
      ({
        id: 'h',
        kind: 'habit',
        createdAt: '2026-10-02T04:00:00Z',
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
        raw: { id: 'h', views },
      }) as unknown as SweepCandidate;
    expect(
      needsDecision(habit({ split: { status: 'pending', pieces: [] }, ask_since: today }), today),
    ).toBe(true);
    expect(needsDecision(habit({}), today)).toBe(false);
  });
});
