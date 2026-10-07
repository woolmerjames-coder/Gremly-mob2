/**
 * When the wrap up is offered from outside the thread, worked out from the
 * part of the day, what today's wrap up has already done, and the cards
 * waiting. Three things, kept apart on purpose:
 *
 * - start: it can be started or picked up now. This never waits for the
 *   evening, so the way in is always there (the Wrap up today chip). A day
 *   can be over at 2pm.
 * - offer: the pinned card and the Today button say so. In the evening, once
 *   it is under way, or as soon as everything on Today is done.
 * - nudge: the dot on CHAT and Gremly's line on Drop and Today. The evening
 *   only, so nothing nags in the afternoon, and never once it has been put
 *   away for the day.
 *
 * By what it has done:
 * - Not yet started: it can be started at any hour; nudged in the evening.
 * - Left part way: offered, to pick it up; nudged in the evening.
 * - Turned down in the evening: offered and never nudged, so nobody is nagged
 *   after saying no. Turned down earlier in the day was about then, not about
 *   tonight: the evening nudges as if it had not started.
 * - Finished: nothing, for the rest of the day. What is dropped after it
 *   waits for the next morning's brief and its quick sweep: a day wrapped up
 *   is not offered again.
 */
import { minutesOfDay } from '../brief/time';
import type { WrapUpState } from '../brief/types';
import { homePhase, type HomePhase } from '../chat/homeChips';
import { cardsLeft } from './state';

export interface EveningTeaser {
  /** The dot on CHAT and Gremly's line on Drop and Today */
  nudge: boolean;
  /** The pinned card and the Today button offer the wrap up */
  offer: boolean;
  /** It can be started or picked up now, whatever the hour: the Wrap up today chip */
  start: boolean;
  /** Cards to sort: all of today's, or only the new ones once it was finished */
  cards: number;
}

const NONE: EveningTeaser = { nudge: false, offer: false, start: false, cards: 0 };

export function eveningTeaser(p: {
  phase: HomePhase;
  wrap: WrapUpState | null | undefined;
  cards: { candidate: { id: string } }[];
  /** Everything on Today is done */
  dayDone?: boolean;
  /** It was last touched in the evening, not earlier in the day */
  touchedTonight?: boolean;
  /** Gremly's line was put away for the day */
  dismissed?: boolean;
}): EveningTeaser {
  const t = teaserFor(p);
  return p.dismissed ? { ...t, nudge: false } : t;
}

function teaserFor(p: Parameters<typeof eveningTeaser>[0]): EveningTeaser {
  const evening = p.phase === 'evening';
  const wrap = p.wrap;
  if (!wrap) {
    return { nudge: evening, offer: evening || !!p.dayDone, start: true, cards: p.cards.length };
  }
  if (wrap.step === 'close' || wrap.step === 'done') return NONE;
  const left = cardsLeft(wrap, p.cards).length;
  if (wrap.step === 'declined') {
    if (!evening) return { nudge: false, offer: !!p.dayDone, start: true, cards: left };
    return { nudge: !p.touchedTonight, offer: true, start: true, cards: left };
  }
  return { nudge: evening, offer: true, start: true, cards: left };
}

/** The wrap up was last touched in the evening (or after midnight), not earlier in the day. */
export function touchedTonight(
  wrap: Pick<WrapUpState, 'started_at' | 'touched_at'> | null | undefined,
  boundaryHour: number,
): boolean {
  const at = wrap?.touched_at || wrap?.started_at;
  if (!at) return false;
  return homePhase(minutesOfDay(at), boundaryHour) === 'evening';
}
