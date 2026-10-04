/**
 * When the wrap up is offered from outside the thread (lib/wrapup/teaser):
 * the nudge (the dot and Gremly's line) and the offer (the card, the chip,
 * the Today button).
 */
import { eveningTeaser } from '../teaser';
import { newWrapState, withDecision } from '../state';
import type { WrapUpState } from '../../brief/types';

const AT = '2026-09-30T20:40:00.000Z';
const cards = (ids: string[]) => ids.map((id) => ({ candidate: { id } }));
const at = (step: WrapUpState['step'], more: Partial<WrapUpState> = {}): WrapUpState => ({
  ...newWrapState(AT, ['a', 'b']),
  step,
  ...more,
});
const decided = (id: string) => ({
  cid: `c-${id}`,
  op: 'keep' as const,
  type: 'todo' as const,
  id,
  title: id,
  out: 'kept' as const,
  label: 'Kept',
  at: AT,
});

describe('the evening teaser', () => {
  it('says nothing before the evening', () => {
    expect(eveningTeaser({ phase: 'morning', wrap: null, cards: cards(['a']) })).toEqual({
      nudge: false,
      offer: false,
      cards: 0,
    });
    expect(eveningTeaser({ phase: 'day', wrap: null, cards: cards(['a']) }).offer).toBe(false);
  });

  it('nudges and offers in the evening, with the cards waiting', () => {
    expect(eveningTeaser({ phase: 'evening', wrap: null, cards: cards(['a', 'b']) })).toEqual({
      nudge: true,
      offer: true,
      cards: 2,
    });
  });

  it('still offers on a night with nothing to sort: habits and the journal are there', () => {
    expect(eveningTeaser({ phase: 'evening', wrap: null, cards: [] })).toEqual({
      nudge: true,
      offer: true,
      cards: 0,
    });
  });

  it('counts only what is left when it was left part way', () => {
    const wrap = withDecision(at('partial'), decided('a'));
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a', 'b']) })).toEqual({
      nudge: true,
      offer: true,
      cards: 1,
    });
  });

  it('never nudges after Not tonight, but the offer stays', () => {
    expect(
      eveningTeaser({ phase: 'evening', wrap: at('declined'), cards: cards(['a', 'b']) }),
    ).toEqual({ nudge: false, offer: true, cards: 2 });
  });

  it('is quiet once it is finished', () => {
    const wrap = at('done');
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a']) }).nudge).toBe(false);
    expect(eveningTeaser({ phase: 'evening', wrap: at('close'), cards: [] }).offer).toBe(false);
  });

  it('comes back once for new things dropped after it was finished', () => {
    const wrap = at('done');
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a', 'new1']) })).toEqual({
      nudge: true,
      offer: true,
      cards: 1,
    });
    // once the thread has said so, they are known and it is quiet again
    const told = { ...wrap, items: [...wrap.items, 'new1'] };
    expect(eveningTeaser({ phase: 'evening', wrap: told, cards: cards(['a', 'new1']) }).nudge).toBe(
      false,
    );
  });
});
