/**
 * Which of Today's sections an item sits in, and the time it is planned for.
 *
 * The first of these to answer wins:
 *  1. A time planned for today. A plan writes it, and so does the person when
 *     they move the item, so it is the newest word on when the item happens:
 *     it beats a block or a usual time of day set before it. Which part of
 *     the day that time is in follows their own Time Blocks settings, as the
 *     block a plan writes does (lib/plan/storePlan.ts), so the two agree.
 *  2. The plan's order for the day (the day's saved sequences), and only when
 *     they are today's. Yesterday's order says nothing about today.
 *  3. The block on the item: its block for the day, else its usual time of day.
 *  4. The time of day the list had already worked out for it.
 */

import { localDateOf, minutesOfDay } from '../brief/time';
import { getTimeBlockForHour, type TimeBlock } from './timeBlockHelpers';

/** The day's saved order, by section. */
export interface DaySequences {
  morning: ReadonlySet<string>;
  day: ReadonlySet<string>;
  evening: ReadonlySet<string>;
}

interface SavedBrief {
  date?: string | null;
  morning_sequence?: { id: string }[] | null;
  day_sequence?: { id: string }[] | null;
  evening_sequence?: { id: string }[] | null;
}

/** The saved brief when it is this day's, else null. */
export function briefFor<T extends SavedBrief>(brief: T | null | undefined, day: string): T | null {
  return brief && brief.date === day ? brief : null;
}

/** The sequences of a brief already known to be the day's (see briefFor). */
export function sequencesOf(brief: SavedBrief | null | undefined): DaySequences | null {
  if (!brief) return null;
  const ids = (list: { id: string }[] | null | undefined) => new Set((list ?? []).map((x) => x.id));
  return {
    morning: ids(brief.morning_sequence),
    day: ids(brief.day_sequence),
    evening: ids(brief.evening_sequence),
  };
}

/**
 * Minutes from midnight of a time planned for this day. Null when there is no
 * planned time, or when it was planned for another day.
 */
export function plannedMinutesOn(iso: string | null | undefined, day: string): number | null {
  if (!iso || localDateOf(iso) !== day) return null;
  return minutesOfDay(iso);
}

export interface SectionSource {
  id: string;
  /** scheduled_start_iso: when a plan, or the person, put it */
  plannedIso?: string | null;
  /** daily_block, else time_window */
  block?: string | null;
  /** the time of day the list worked out for it, for when nothing else answers */
  inferred?: string | null;
}

function blockOf(value: string | null | undefined): TimeBlock | null {
  if (value === 'morning') return 'morning';
  if (value === 'day' || value === 'afternoon' || value === 'midday') return 'afternoon';
  if (value === 'evening') return 'evening';
  return null;
}

/** Where their morning and afternoon end, in hours (lib/capacity getTimeBlockBoundaries). */
export interface BlockEnds {
  morning: { endHour: number };
  day: { endHour: number };
}

/**
 * The part of the day a time is in by their own settings: the same rule a
 * plan writes an item's block by. With no settings given, Today's fixed hours.
 */
export function blockAt(minutes: number, ends?: BlockEnds | null): TimeBlock {
  const hour = Math.floor(minutes / 60);
  if (!ends) return getTimeBlockForHour(hour);
  if (hour < ends.morning.endHour) return 'morning';
  if (hour < ends.day.endHour) return 'afternoon';
  return 'evening';
}

export function sectionFor(
  item: SectionSource,
  day: string,
  sequences: DaySequences | null,
  ends?: BlockEnds | null,
): TimeBlock {
  const planned = plannedMinutesOn(item.plannedIso, day);
  if (planned !== null) return blockAt(planned, ends);

  if (sequences) {
    if (sequences.morning.has(item.id)) return 'morning';
    if (sequences.day.has(item.id)) return 'afternoon';
    if (sequences.evening.has(item.id)) return 'evening';
  }

  return blockOf(item.block) ?? blockOf(item.inferred) ?? 'anytime';
}
