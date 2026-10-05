/**
 * The ways into the wrap up for the screens that offer it (Drop, Today, the
 * Chat home): read from the clock, today's thread, today's cards and how far
 * Today has got. It starts on the second day, like the brief.
 */
import { useMemo } from 'react';
import { plannedForDay, useNowMinutes } from '../brief/useDayCard';
import { useTodayThread } from '../brief/todayThread';
import type { DailyThreadMeta } from '../brief/types';
import { homePhase } from '../chat/homeChips';
import { getDateService } from '../date/DateService';
import { selectTodayProgress, selectWrapUp } from '../store/selectors';
import { useGremlyStore } from '../store/useGremlyStore';
import { eveningTeaser, touchedTonight, type EveningTeaser } from './teaser';
import { pinnedLine } from './words';

export interface EveningTeaserView extends EveningTeaser {
  /** It is the evening for them (from 5pm, or after midnight before their day ends) */
  evening: boolean;
  /** The pinned card's line while the wrap up is offered, under way or done; null otherwise */
  pinned: string | null;
  /** Today's wrap up is finished, with nothing new since */
  done: boolean;
  /** Today has a plan: the first chip moves on from Plan my day */
  planned: boolean;
}

export function useEveningTeaser(): EveningTeaserView {
  const minutes = useNowMinutes();
  const boundaryHour = useGremlyStore((s) => s.dayBoundaryHour);
  const started = useGremlyStore((s) => (s.gremlyAge ?? 0) >= 1);
  const fed = useGremlyStore((s) => s.isFedToday);
  const cards = useGremlyStore(selectWrapUp).cards;
  const progress = useGremlyStore(selectTodayProgress);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const wrap = useTodayThread(
    (s) => (s.thread?.metadata_json as Partial<DailyThreadMeta> | undefined)?.sweep ?? null,
  );
  const dismissed = useTodayThread(
    (s) =>
      !!(s.thread?.metadata_json as Partial<DailyThreadMeta> | undefined)?.wrap_nudge_dismissed_at,
  );
  return useMemo(() => {
    const phase = homePhase(minutes, boundaryHour);
    const evening = started && phase === 'evening';
    const planned = plannedForDay(todos, habits, getDateService().ritualDay()).length > 0;
    if (!started) {
      return {
        nudge: false,
        offer: false,
        start: false,
        cards: 0,
        evening,
        pinned: null,
        done: false,
        planned,
      };
    }
    // everything on Today is done: the same count Today's own progress shows
    const dayDone = progress.totalEligible > 0 && progress.completedCount >= progress.totalEligible;
    const tonight = touchedTonight(wrap, boundaryHour);
    const teaser = eveningTeaser({
      phase,
      wrap,
      cards,
      dayDone,
      touchedTonight: tonight,
      dismissed,
    });
    const finished = wrap?.step === 'done' || wrap?.step === 'close';
    const done = finished && !teaser.offer;
    // a no said earlier in the day is not tonight's answer: the evening reads as not yet started
    const step = wrap?.step === 'declined' && evening && !tonight ? null : (wrap?.step ?? null);
    return {
      ...teaser,
      evening,
      pinned:
        evening || teaser.offer || done
          ? pinnedLine({
              step,
              cards: teaser.cards,
              journal: wrap?.journal === 'written' || wrap?.journal === 'mood',
              fed: !!fed,
              early: !evening,
            })
          : null,
      done,
      planned,
    };
  }, [started, minutes, boundaryHour, wrap, cards, fed, progress, todos, habits, dismissed]);
}
