/**
 * The evening teaser for the screens that offer the wrap up (Drop, Today, the
 * Chat home): read from the clock, today's thread and tonight's cards. It
 * starts on the second day, like the brief.
 */
import { useMemo } from 'react';
import { useNowMinutes } from '../brief/useDayCard';
import { useTodayThread } from '../brief/todayThread';
import type { DailyThreadMeta } from '../brief/types';
import { homePhase } from '../chat/homeChips';
import { selectWrapUp } from '../store/selectors';
import { useGremlyStore } from '../store/useGremlyStore';
import { eveningTeaser, type EveningTeaser } from './teaser';
import { pinnedLine } from './words';

export interface EveningTeaserView extends EveningTeaser {
  /** It is the evening for them (from 5pm, or after midnight before their day ends) */
  evening: boolean;
  /** The pinned card's line while the evening is under way; null before the evening */
  pinned: string | null;
  /** Tonight's wrap up is finished, with nothing new since */
  done: boolean;
}

export function useEveningTeaser(): EveningTeaserView {
  const minutes = useNowMinutes();
  const boundaryHour = useGremlyStore((s) => s.dayBoundaryHour);
  const started = useGremlyStore((s) => (s.gremlyAge ?? 0) >= 1);
  const fed = useGremlyStore((s) => s.isFedToday);
  const cards = useGremlyStore(selectWrapUp).cards;
  const wrap = useTodayThread(
    (s) => (s.thread?.metadata_json as Partial<DailyThreadMeta> | undefined)?.sweep ?? null,
  );
  return useMemo(() => {
    const evening = started && homePhase(minutes, boundaryHour) === 'evening';
    if (!evening)
      return { nudge: false, offer: false, cards: 0, evening, pinned: null, done: false };
    const teaser = eveningTeaser({ phase: 'evening', wrap, cards });
    return {
      ...teaser,
      evening,
      pinned: pinnedLine({
        step: wrap?.step ?? null,
        cards: teaser.cards,
        journal: wrap?.journal === 'written' || wrap?.journal === 'mood',
        fed: !!fed,
      }),
      done: !teaser.offer && (wrap?.step === 'done' || wrap?.step === 'close'),
    };
  }, [started, minutes, boundaryHour, wrap, cards, fed]);
}
