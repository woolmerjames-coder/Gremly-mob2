/**
 * The plan card as it sits in today's thread, with its meetings from the
 * store and Add something opening the pick sheet: tick several, see the time
 * they take, add them in one go.
 */

import React, { useMemo, useState } from 'react';
import { PlanCard } from './PlanCard';
import { PickSheet } from './PickSheet';
import { useDayCard } from '../../lib/brief/useDayCard';
import type { BriefPlanMeta } from '../../lib/brief/types';
import { pickButtonWords, pickItemsOf } from '../../lib/plan/pickItems';
import { dueWords } from '../../lib/plan/dayItems';
import { freeMinutes } from '../../lib/plan/slotFitter';
import { getDateService } from '../../lib/date/DateService';

type Props = {
  meta: BriefPlanMeta;
  interactive?: boolean;
  onRemove: (id: string) => void;
  /** What they picked on the sheet, all at once */
  onAdd: (picks: { id: string; kind: 'todo' | 'habit' }[]) => void;
  onYes: () => void;
  onDismiss: () => void;
  onShowAgain: () => void;
  onSeeToday: () => void;
};

export function BriefPlanBlock({ meta, onAdd, ...rest }: Props) {
  const data = useDayCard(meta.date);
  const [adding, setAdding] = useState(false);
  const inPlan = new Set([...meta.items.map((x) => x.id), ...meta.unplaced.map((x) => x.id)]);
  const items = useMemo(
    () => pickItemsOf(data, dueWords(data.date, getDateService().today())),
    [data],
  );
  const from = meta.from ?? 0;
  const free = freeMinutes(data.record.busy, meta.items, from, Math.max(from, data.record.planEnd));
  return (
    <>
      <PlanCard
        meta={meta}
        meetings={data.meetings}
        blocks={data.record.blocks}
        planEnd={data.record.planEnd}
        onAdd={() => setAdding(true)}
        {...rest}
      />
      <PickSheet
        visible={adding}
        title="Add to the plan"
        free={free}
        todos={items.todos}
        habits={items.habits}
        inPlan={inPlan}
        confirmWords={(n, m) => pickButtonWords('Add', n, m)}
        onConfirm={(picks) => {
          setAdding(false);
          onAdd(picks.map((p) => ({ id: p.id, kind: p.kind })));
        }}
        onClose={() => setAdding(false)}
      />
    </>
  );
}
