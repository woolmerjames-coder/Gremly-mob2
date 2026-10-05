/**
 * The plan card as it sits in today's thread, with its meetings from the
 * store. Add something opens the pick sheet: tick several, see the time they
 * take, add them in one go. Tapping an item changes its time or length, and
 * busy time can be added for the plan to work around.
 */

import React, { useMemo, useState } from 'react';
import { PlanCard } from './PlanCard';
import { PickSheet } from './PickSheet';
import { PlanTimeSheet } from './PlanTimeSheet';
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
  /** A time or length changed by hand */
  onRetime: (id: string, start: number, minutes: number) => void;
  /** Busy time added for the plan to work around */
  onAddBusy: (block: { title: string; start: number; end: number }) => void;
  onYes: () => void;
  onDismiss: () => void;
  onShowAgain: () => void;
  onSeeToday: () => void;
};

export function BriefPlanBlock({ meta, onAdd, onRetime, onAddBusy, ...rest }: Props) {
  const data = useDayCard(meta.date);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = editing ? meta.items.find((x) => x.id === editing) : undefined;
  const today = meta.date === getDateService().ritualDay();
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
        onEdit={(id) => setEditing(id)}
        onAddBusy={today ? () => setBusy(true) : undefined}
        {...rest}
      />
      <PlanTimeSheet
        visible={!!item}
        mode="item"
        name={item?.title}
        start={item?.start ?? from}
        minutes={item ? item.end - item.start : 30}
        earliest={from}
        onSave={(v) => {
          if (item) onRetime(item.id, v.start, v.minutes);
          setEditing(null);
        }}
        onRemove={() => {
          if (item) rest.onRemove(item.id);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
      <PlanTimeSheet
        visible={busy}
        mode="busy"
        start={from}
        minutes={60}
        earliest={from}
        onSave={(v) => {
          onAddBusy({ title: v.title, start: v.start, end: v.start + v.minutes });
          setBusy(false);
        }}
        onClose={() => setBusy(false)}
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
