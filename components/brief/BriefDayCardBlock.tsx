/**
 * The day card as it sits in the thread, with what its rows open: Meetings
 * opens the calendar view, Todos and Habits open Due today, Sweep opens Sweep.
 * Their intention for the week the day is in sits above it, when they set one.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { DayCard, type DayCardRow } from './DayCard';
import { DueTodaySheet, type DueTab } from './DueTodaySheet';
import { ThisWeekCard } from './ThisWeekCard';
import { useDayCard } from '../../lib/brief/useDayCard';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { intentionOn } from '../../lib/week/intention';

type Props = {
  date: string;
  /** Any tap on the card is a reply to the brief (feeds Gremly once a day) */
  onReply?: () => void;
  onSweep?: () => void;
  /** Ids in the live plan, shown as "In the plan" in Due today */
  inPlan?: Set<string>;
};

export function BriefDayCardBlock({ date, onReply, onSweep, inPlan }: Props) {
  const navigation = useNavigation<any>();
  const data = useDayCard(date);
  const [sheet, setSheet] = useState<DueTab | null>(null);
  const notes = useGremlyStore((s) => s.notes);
  const intention = useMemo(() => intentionOn(notes as any[], date), [notes, date]);

  const onRow = useCallback(
    (row: DayCardRow) => {
      onReply?.();
      if (row === 'meetings') navigation.navigate('CalendarScreen', { initialDate: date });
      else if (row === 'sweep') onSweep?.();
      else setSheet(row);
    },
    [date, navigation, onReply, onSweep],
  );

  return (
    <>
      {intention ? <ThisWeekCard text={intention.text} /> : null}
      <DayCard data={data} onRow={onRow} />
      <DueTodaySheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        data={data}
        initialTab={sheet ?? 'todos'}
        inPlan={inPlan}
        calm={data.returnDay}
      />
    </>
  );
}
