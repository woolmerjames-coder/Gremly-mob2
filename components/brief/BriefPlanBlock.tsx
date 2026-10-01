/**
 * The plan card as it sits in today's thread, with its meetings from the
 * store and Add something opening Due today in add mode.
 */

import React, { useState } from 'react';
import { PlanCard } from './PlanCard';
import { DueTodaySheet } from './DueTodaySheet';
import { useDayCard } from '../../lib/brief/useDayCard';
import type { BriefPlanMeta } from '../../lib/brief/types';

type Props = {
  meta: BriefPlanMeta;
  interactive?: boolean;
  onRemove: (id: string) => void;
  onAdd: (id: string, kind: 'todo' | 'habit') => void;
  onLock: () => void;
  onDismiss: () => void;
  onShowAgain: () => void;
  onSeeToday: () => void;
};

export function BriefPlanBlock({ meta, onAdd, ...rest }: Props) {
  const data = useDayCard(meta.date);
  const [adding, setAdding] = useState(false);
  const inPlan = new Set([...meta.items.map((x) => x.id), ...meta.unplaced.map((x) => x.id)]);
  return (
    <>
      <PlanCard meta={meta} meetings={data.meetings} onAdd={() => setAdding(true)} {...rest} />
      <DueTodaySheet
        visible={adding}
        onClose={() => setAdding(false)}
        data={data}
        initialTab="habits"
        mode="add"
        inPlan={inPlan}
        onAdd={(id, kind) => {
          setAdding(false);
          onAdd(id, kind);
        }}
        calm={data.returnDay}
      />
    </>
  );
}
