/**
 * The pick sheet while a plan is being made (lib/plan/usePlanFlow.ts
 * pickSession): the day's todos and habits, with Gremly's suggestions on top.
 * What they pick is the plan; picking nothing asks Gremly to help first.
 */

import React, { useMemo } from 'react';
import { PickSheet, type Suggestion } from './PickSheet';
import { useDayCard } from '../../lib/brief/useDayCard';
import { pickButtonWords, pickItemsOf, type PickItem } from '../../lib/plan/pickItems';
import { dueWords } from '../../lib/plan/dayItems';
import { duration, planDay } from '../../lib/plan/planFlow';
import { getDateService } from '../../lib/date/DateService';
import type { PickSession } from '../../lib/plan/usePlanFlow';

type Props = {
  session: PickSession;
  onConfirm: (picks: PickItem[]) => void;
  onAsk: () => void;
  onClose: () => void;
};

export function PlanPickSheet({ session, onConfirm, onAsk, onClose }: Props) {
  const data = useDayCard(session.day);
  const ds = getDateService();
  const items = useMemo(() => pickItemsOf(data, dueWords(data.date, ds.today())), [data, ds]);
  const suggested = useMemo((): Suggestion[] | null => {
    if (!session.suggested) return null;
    const all = new Map([...items.todos, ...items.habits].map((x) => [x.id, x]));
    return session.suggested.map((s) => {
      const known = all.get(s.id);
      // Gremly's length stands: it estimated one where the item had none
      return known
        ? { ...known, minutes: s.minutes, estimated: false, reason: s.reason }
        : {
            id: s.id,
            kind: s.kind,
            title: s.title,
            minutes: s.minutes,
            estimated: false,
            meta: duration(s.minutes),
            behind: false,
            reason: s.reason,
          };
    });
  }, [session.suggested, items]);
  const day = planDay(session.day, ds.ritualDay(), ds.isInLateNightPeriod());
  return (
    <PickSheet
      visible
      title={day.today ? 'Plan your day' : `Plan ${day.word}`}
      free={session.free}
      todos={items.todos}
      habits={items.habits}
      suggested={suggested}
      confirmWords={(n, m) => pickButtonWords('Plan', n, m)}
      onConfirm={onConfirm}
      askWords="Not sure? Help me choose"
      onAsk={onAsk}
      onClose={onClose}
    />
  );
}
