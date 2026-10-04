/**
 * Tonight's wrap up as the thread keeps it (lib/wrapup/state): decisions are
 * kept in order, one made again replaces the earlier one, one put back no
 * longer counts, and the cards left are worked out from Sweep's cards now.
 */
import {
  cardsLeft,
  decidedIds,
  keptFor,
  newSince,
  newWrapState,
  pastCards,
  settledIds,
  withDecision,
  withUndone,
} from '../state';
import type { SweepRecord } from '../../changes/sweep';

const AT = '2026-09-30T20:40:00.000Z';

function rec(id: string, more: Partial<SweepRecord> = {}): SweepRecord {
  return {
    cid: `c-${id}`,
    op: 'keep',
    type: 'todo',
    id,
    title: `Todo ${id}`,
    out: 'kept',
    label: 'Kept',
    at: AT,
    ...more,
  };
}
const cards = (ids: string[]) => ids.map((id) => ({ candidate: { id } }));

describe('the wrap up state', () => {
  it('starts on the offer with the cards there were', () => {
    const s = newWrapState(AT, ['a', 'b']);
    expect(s).toMatchObject({ step: 'offer', items: ['a', 'b'], decisions: [], credited: 0 });
  });

  it('keeps each decision, and replaces one made again on the same item', () => {
    let s = newWrapState(AT, ['a', 'b']);
    s = withDecision(s, rec('a'));
    s = withDecision(s, rec('b', { out: 'let_go', op: 'archive', label: 'Let go' }));
    s = withDecision(s, rec('a', { cid: 'c-a2', label: 'Tomorrow' }));
    expect(s.decisions.map((d) => d.cid)).toEqual(['c-b', 'c-a2']);
  });

  it('leaves out a decision that was put back', () => {
    let s = newWrapState(AT, ['a', 'b', 'c']);
    s = withDecision(s, rec('a'));
    s = withDecision(s, rec('b', { out: 'left', label: 'Left for next time' }));
    s = withUndone(s, 'c-a', AT);
    expect([...settledIds(s)]).toEqual(['b']);
    // left for next time is settled for tonight, but it was not decided
    expect([...decidedIds(s)]).toEqual([]);
  });

  it('works out the cards left from the cards now', () => {
    let s = newWrapState(AT, ['a', 'b', 'c']);
    s = withDecision(s, rec('a'));
    expect(cardsLeft(s, cards(['a', 'b', 'c'])).map((c) => c.candidate.id)).toEqual(['b', 'c']);
    // a card put back is there to sort again
    s = withUndone(s, 'c-a', AT);
    expect(cardsLeft(s, cards(['a', 'b', 'c'])).map((c) => c.candidate.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('knows which cards turned up after it began', () => {
    let s = newWrapState(AT, ['a', 'b']);
    s = withDecision(s, rec('a'));
    expect(newSince(s, cards(['b', 'n1', 'n2'])).map((c) => c.candidate.id)).toEqual(['n1', 'n2']);
    // one it has been told about is not new twice
    s = { ...s, items: [...s.items, 'n1', 'n2'] };
    expect(newSince(s, cards(['b', 'n1', 'n2']))).toEqual([]);
  });

  it('knows when the cards are behind it', () => {
    const s = newWrapState(AT, ['a']);
    expect(pastCards(null)).toBe(false);
    expect(pastCards(s)).toBe(false);
    expect(pastCards({ ...s, step: 'partial' })).toBe(false);
    expect(pastCards({ ...s, step: 'declined' })).toBe(false);
    expect(pastCards({ ...s, step: 'habits' })).toBe(true);
    expect(pastCards({ ...s, step: 'done' })).toBe(true);
  });

  it('lists the todos kept for a day', () => {
    let s = newWrapState(AT, ['a', 'b', 'c']);
    s = withDecision(s, rec('a', { op: 'change', fields: { day: '2026-10-01' } }));
    s = withDecision(s, rec('b', { op: 'change', fields: { day: '2026-10-03' } }));
    s = withDecision(s, rec('c', { op: 'change', fields: { day: '2026-10-01' } }));
    s = withUndone(s, 'c-c', AT);
    expect(keptFor(s, '2026-10-01')).toEqual(['Todo a']);
  });
});
