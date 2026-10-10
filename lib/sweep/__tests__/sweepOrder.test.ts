/**
 * Sweep asks its questions first, and a card further on reads as its item is
 * now, or is passed over when an earlier answer cleared it.
 */
import { goneSinceStart, orderSweepCards, sweepCardAsks, sweepCardNow } from '../sweepOrder';
import type { SweepCandidate, SweepCardMeta } from '../types';
import { getDateService } from '../../date/DateService';

// the day the questions are asked on (an item with no ask day counts as made today)
const T = getDateService().today();
const Y = getDateService().addDays(T, -1);

const card = (
  id: string,
  kind: 'todo' | 'note',
  raw: Record<string, unknown> = {},
  noteCardType: SweepCardMeta['noteCardType'] = null,
) => ({
  candidate: {
    id,
    kind,
    createdAt: '2026-09-30T09:00:00Z',
    raw: { id, ...raw },
  } as unknown as SweepCandidate,
  meta: {
    noteCardType,
    world: { name: 'Health', accentColor: '#000', extraCount: 0 },
  } as unknown as SweepCardMeta,
});

const heldViews = {
  relation: {
    kind: 'edit',
    intent: 'edit',
    entity: { id: 'ev', type: 'note', title: 'Dentist' },
    others: [],
    confidence: 95,
    change: { field: 'due_time', from: '15:00', to: '16:00' },
    status: 'pending',
    classified: { bucket: 'log', subtype: 'event' },
  },
};

describe('the order Sweep asks in', () => {
  it('asks "is this one you already have?" first, then a split, then clarifications, then the rest as before', () => {
    const ordered = orderSweepCards(
      [
        card('todo', 'todo'),
        card('dentist', 'note', {}, 'event'),
        card('idea', 'note', {}, 'idea'),
        card('unclear', 'note', { views: { needs_clarification: true } }),
        card('split', 'todo', { views: { split: { status: 'pending', pieces: [] } } }),
        card('held', 'note', { views: heldViews }),
      ],
      T,
      'wrapup',
    );
    expect(ordered.map((c) => c.candidate.id)).toEqual([
      'held',
      'split',
      'unclear',
      'todo',
      'dentist',
      'idea',
    ]);
  });

  it('the wrap up asks the questions made that day; the quick sweep those from the day before too (stage 8)', () => {
    const yesterday = card('y', 'note', { views: { needs_clarification: true, ask_since: Y } });
    expect(sweepCardAsks(yesterday.candidate, T, 'wrapup')).toBeNull();
    expect(sweepCardAsks(yesterday.candidate, T, 'quick')).toBe('clarify');
    const ordered = orderSweepCards([card('todo', 'todo'), yesterday], T, 'wrapup');
    expect(ordered.map((c) => c.candidate.id)).toEqual(['todo', 'y']);
  });

  it('knows which cards ask something', () => {
    expect(sweepCardAsks(card('a', 'note', { views: heldViews }).candidate, T, 'quick')).toBe(
      'relation',
    );
    expect(
      sweepCardAsks(card('b', 'todo', { needs_clarification: true }).candidate, T, 'quick'),
    ).toBe('clarify');
    expect(
      sweepCardAsks(
        card('c', 'note', { views: { needs_clarification: true, clarification_resolved: true } })
          .candidate,
        T,
        'quick',
      ),
    ).toBeNull();
    const answered = { ...heldViews, relation: { ...heldViews.relation, status: 'applied' } };
    expect(sweepCardAsks(card('d', 'note', { views: answered }).candidate, T, 'quick')).toBeNull();
  });

  it('follows the ask rules: a drop of any kind, live asks only (stage 6)', () => {
    // from the Mind Drop rethink a drop is saved as its own kind
    const onTodo = { ...heldViews, relation: { ...heldViews.relation, surface: 'card' } };
    expect(sweepCardAsks(card('e', 'todo', { views: onTodo }).candidate, T, 'quick')).toBe(
      'relation',
    );
    // sent off the card with Not now: Sweep still asks
    expect(
      sweepCardAsks(
        card('f', 'todo', { views: { ...onTodo, ask_on_card: false } }).candidate,
        T,
        'quick',
      ),
    ).toBe('relation');
    // an old question, past the day after it was made, is let go
    expect(
      sweepCardAsks(
        card('g', 'note', {
          created_at: '2020-01-01T09:00:00Z',
          views: { needs_clarification: true },
        }).candidate,
        T,
        'quick',
      ),
    ).toBeNull();
  });
});

describe('a card further on', () => {
  const lists = (todos: any[] = [], notes: any[] = []) => ({ todos, notes, habits: [] });

  it('reads as its item is now', () => {
    const snap = card('dentist', 'note', { event_time: '15:00' }, 'event');
    const moved = card('dentist', 'note', { event_time: '16:00' }, 'event');
    expect(sweepCardNow(snap, [moved], null).candidate.raw).toMatchObject({
      event_time: '16:00',
    });
    // unchanged: the same card
    expect(sweepCardNow(snap, [snap], null)).toBe(snap);
  });

  it('keeps its place with fresh details when it is no longer a candidate', () => {
    const snap = card('t1', 'todo', { due_day: null });
    const now = sweepCardNow(snap, [], { id: 't1', due_day: '2026-10-09' });
    expect(now.candidate.raw).toMatchObject({ due_day: '2026-10-09' });
    expect(now.meta.world).toEqual(snap.meta.world);
  });

  it('is passed over when an answer removed, merged away or ticked off its item', () => {
    const todo = card('t1', 'todo').candidate;
    const note = card('n1', 'note').candidate;
    expect(goneSinceStart(todo, lists([{ id: 't1', completed_at: '2026-09-30T10:00:00Z' }]))).toBe(
      true,
    );
    expect(goneSinceStart(todo, lists([{ id: 't1', completed_at: null }]))).toBe(false);
    expect(goneSinceStart(note, lists([], [{ id: 'n1', archived: true }]))).toBe(true);
    expect(goneSinceStart(note, lists([], []))).toBe(false);
    expect(goneSinceStart(note, lists([], [{ id: 'n1', archived: false }]))).toBe(false);
  });
});
