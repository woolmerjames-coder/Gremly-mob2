/**
 * The living plan (Daily brief in Chat): the plan card stays the day's source
 * of truth, so a time changed somewhere else (a card in the thread, the
 * Today tab, the day turn) moves the item on the card too.
 *
 * Each plan item keeps the time its todo or habit had when the plan last saw
 * it (`seen`: its planned start and its due time). A different time now means
 * it was changed elsewhere: the item takes the new time, a proposal re-fits
 * everything else around it, and a locked plan keeps the rest where they are.
 */

import type { PlanItem } from '../brief/types';
import { hhmmToMinutes, localDateOf, minutesOfDay } from '../brief/time';

export interface StoreTimes {
  scheduled_start_iso?: string | null;
  due_time?: string | null;
  due_day?: string | null;
}

/** What the plan remembers of an item's time. */
export function timeSignature(x: StoreTimes | null | undefined): string {
  return `${x?.scheduled_start_iso ?? ''}|${x?.due_time ?? ''}`;
}

/**
 * The start the item has now on `date`, from what changed since `seen`: a new
 * due time (on that day, or with no day), else a new planned start on that
 * day. Null when neither gives a time on the plan's day.
 */
export function changedStart(x: StoreTimes, seen: string, date: string): number | null {
  const [seenIso, seenDue] = seen.split('|');
  const due = x.due_time ?? '';
  if (due && due !== seenDue && (!x.due_day || x.due_day === date)) {
    const m = hhmmToMinutes(due);
    if (m !== null) return m;
  }
  const iso = x.scheduled_start_iso ?? '';
  if (iso && iso !== seenIso && localDateOf(iso) === date) return minutesOfDay(iso);
  return null;
}

export interface PlanSync {
  items: PlanItem[];
  /** Items that took a new time */
  moved: string[];
}

/**
 * The plan's items brought up to date with the store. Null when nothing
 * changed. An item seen for the first time only records its time.
 */
export function syncPlanItems(
  items: PlanItem[],
  date: string,
  lookup: (id: string, kind: 'todo' | 'habit') => StoreTimes | undefined,
): PlanSync | null {
  let changed = false;
  const moved: string[] = [];
  const out = items.map((item) => {
    if (item.kind === 'reach') return item;
    const cur = lookup(item.id, item.kind === 'habit' ? 'habit' : 'todo');
    if (!cur) return item;
    const sig = timeSignature(cur);
    if (item.seen === undefined) {
      changed = true;
      return { ...item, seen: sig };
    }
    if (sig === item.seen) return item;
    changed = true;
    const start = changedStart(cur, item.seen, date);
    if (start === null || start === item.start) return { ...item, seen: sig };
    moved.push(item.id);
    return { ...item, start, end: start + (item.end - item.start), seen: sig };
  });
  return changed ? { items: out, moved } : null;
}
