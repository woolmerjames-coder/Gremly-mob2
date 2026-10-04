/**
 * When the wrap up is offered from outside the thread (lib/wrapup/teaser):
 * the nudge (the dot and Gremly's line, the evening only), the offer (the
 * card and the Today button) and the start (the chip, at any hour).
 */
import { eveningTeaser, touchedTonight } from '../teaser';
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

describe('the evening', () => {
  it('nudges and offers, with the cards waiting', () => {
    expect(eveningTeaser({ phase: 'evening', wrap: null, cards: cards(['a', 'b']) })).toEqual({
      nudge: true,
      offer: true,
      start: true,
      cards: 2,
    });
  });

  it('still offers on a night with nothing to sort: habits and the journal are there', () => {
    expect(eveningTeaser({ phase: 'evening', wrap: null, cards: [] })).toEqual({
      nudge: true,
      offer: true,
      start: true,
      cards: 0,
    });
  });

  it('counts only what is left when it was left part way', () => {
    const wrap = withDecision(at('partial'), decided('a'));
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a', 'b']) })).toEqual({
      nudge: true,
      offer: true,
      start: true,
      cards: 1,
    });
  });

  it('never nudges after Not tonight, but the offer stays', () => {
    expect(
      eveningTeaser({
        phase: 'evening',
        wrap: at('declined'),
        cards: cards(['a', 'b']),
        touchedTonight: true,
      }),
    ).toEqual({ nudge: false, offer: true, start: true, cards: 2 });
  });

  it('is quiet once it is finished', () => {
    const wrap = at('done');
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a']) })).toEqual({
      nudge: false,
      offer: false,
      start: false,
      cards: 0,
    });
    expect(eveningTeaser({ phase: 'evening', wrap: at('close'), cards: [] }).offer).toBe(false);
  });

  it('comes back once for new things dropped after it was finished', () => {
    const wrap = at('done');
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a', 'new1']) })).toEqual({
      nudge: true,
      offer: true,
      start: true,
      cards: 1,
    });
    // once the thread has said so, they are known and it is quiet again
    const told = { ...wrap, items: [...wrap.items, 'new1'] };
    expect(eveningTeaser({ phase: 'evening', wrap: told, cards: cards(['a', 'new1']) }).nudge).toBe(
      false,
    );
  });
});

describe('before the evening', () => {
  it('can always be started, and nothing nudges or is pushed forward', () => {
    for (const phase of ['morning', 'day'] as const) {
      expect(eveningTeaser({ phase, wrap: null, cards: cards(['a']) })).toEqual({
        nudge: false,
        offer: false,
        start: true,
        cards: 1,
      });
    }
  });

  it('is offered as soon as everything on Today is done', () => {
    expect(eveningTeaser({ phase: 'day', wrap: null, cards: cards(['a']), dayDone: true })).toEqual(
      { nudge: false, offer: true, start: true, cards: 1 },
    );
  });

  it('is offered once it is under way, to pick it up, without a nudge', () => {
    const wrap = withDecision(at('partial'), decided('a'));
    expect(eveningTeaser({ phase: 'day', wrap, cards: cards(['a', 'b']) })).toEqual({
      nudge: false,
      offer: true,
      start: true,
      cards: 1,
    });
  });

  it('after Not now it steps back, and can still be started', () => {
    expect(eveningTeaser({ phase: 'day', wrap: at('declined'), cards: cards(['a']) })).toEqual({
      nudge: false,
      offer: false,
      start: true,
      cards: 1,
    });
  });

  it('finished early is finished: new drops wait for the evening', () => {
    const wrap = at('done');
    expect(eveningTeaser({ phase: 'day', wrap, cards: cards(['a', 'new1']) })).toEqual({
      nudge: false,
      offer: false,
      start: false,
      cards: 0,
    });
    expect(eveningTeaser({ phase: 'evening', wrap, cards: cards(['a', 'new1']) })).toMatchObject({
      nudge: true,
      offer: true,
      cards: 1,
    });
  });
});

describe('a no before the evening is not a no for tonight', () => {
  it('the evening nudges again after an earlier Not now', () => {
    expect(
      eveningTeaser({
        phase: 'evening',
        wrap: at('declined'),
        cards: cards(['a', 'b']),
        touchedTonight: false,
      }),
    ).toEqual({ nudge: true, offer: true, start: true, cards: 2 });
  });

  it('knows the evening from earlier in the day, and the small hours as last night', () => {
    // the test clock is UTC
    const day = (touched_at: string) => ({ started_at: '2026-09-30T09:00:00.000Z', touched_at });
    expect(touchedTonight(day('2026-09-30T14:00:00.000Z'), 3)).toBe(false);
    expect(touchedTonight(day('2026-09-30T16:59:00.000Z'), 3)).toBe(false);
    expect(touchedTonight(day('2026-09-30T17:00:00.000Z'), 3)).toBe(true);
    expect(touchedTonight(day('2026-10-01T00:30:00.000Z'), 3)).toBe(true);
    // one saved before the stamp existed: when it was started
    expect(touchedTonight({ started_at: '2026-09-30T20:40:00.000Z' }, 3)).toBe(true);
    expect(touchedTonight({ started_at: '2026-09-30T13:00:00.000Z' }, 3)).toBe(false);
    expect(touchedTonight(null, 3)).toBe(false);
  });
});
