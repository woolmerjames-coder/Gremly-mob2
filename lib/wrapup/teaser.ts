/**
 * When the evening wrap up is offered from outside the thread: the dot on
 * CHAT and Gremly's line on Drop and Today (the nudge), and the pinned card,
 * the chip and the Today button (the offer). Worked out from the part of the
 * day, what tonight's wrap up has already done, and the cards waiting.
 *
 * - Not yet started: nudged and offered, with or without cards (a night with
 *   nothing to sort still has habits and the journal).
 * - Left part way: nudged and offered, to pick it up.
 * - Not tonight: offered and never nudged, so nobody is nagged after saying no.
 * - Finished: neither, unless new things were dropped since. Then it comes
 *   back once, for the new ones only.
 */
import type { WrapUpState } from '../brief/types';
import type { HomePhase } from '../chat/homeChips';
import { cardsLeft, newSince } from './state';

export interface EveningTeaser {
  /** The dot on CHAT and Gremly's line on Drop and Today */
  nudge: boolean;
  /** The pinned card, the chip and the Today button offer the wrap up */
  offer: boolean;
  /** Cards to sort: all of tonight's, or only the new ones once it was finished */
  cards: number;
}

const NONE: EveningTeaser = { nudge: false, offer: false, cards: 0 };

export function eveningTeaser(p: {
  phase: HomePhase;
  wrap: WrapUpState | null | undefined;
  cards: { candidate: { id: string } }[];
}): EveningTeaser {
  if (p.phase !== 'evening') return NONE;
  const wrap = p.wrap;
  if (!wrap) return { nudge: true, offer: true, cards: p.cards.length };
  if (wrap.step === 'close' || wrap.step === 'done') {
    const fresh = newSince(wrap, p.cards).length;
    return fresh ? { nudge: true, offer: true, cards: fresh } : NONE;
  }
  const left = cardsLeft(wrap, p.cards).length;
  if (wrap.step === 'declined') return { nudge: false, offer: true, cards: left };
  return { nudge: true, offer: true, cards: left };
}
