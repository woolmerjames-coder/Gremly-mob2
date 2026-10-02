/**
 * The day record: one picture of the day for the day card, the planner and
 * the plan card (Daily brief in Chat).
 *
 * Built from the DCO's day frame (travel and set times read from memory and
 * the calendar), set times added in today's thread (thread meta
 * fixed_blocks), today's meetings and the date anchors. The worker builds the
 * same record from the same inputs for the brief, the morning notification
 * and the plan picker (workers/inngest-jobs/brief/dayRecord.js): keep the two
 * in step, so the chip, where planning stops and the flags agree everywhere.
 */

import type { DayMeeting } from './dayCard';
import { daysBetween, type DcoAnchor, type DcoDayFrame } from './dco';

/** Planning never runs past 10pm */
export const DEFAULT_PLAN_END = 22 * 60;
/** A set time with no end is busy for this long */
export const BLOCK_MINUTES = 30;

export interface DayBlock {
  id: string;
  title: string;
  start: number;
  end: number | null;
  travel: boolean;
  /** memory: read from the ledger; chat: added in today's thread */
  source: 'memory' | 'chat';
}

export interface DayChip {
  text: string;
  kind: 'travel' | 'date' | 'away';
}

export interface DayRecord {
  date: string;
  /** Today's travel: what it is called (when known) and when they set off */
  travel: { label: string | null; departs: number | null } | null;
  away: { label: string; through: string | null } | null;
  blocks: DayBlock[];
  /** Meetings and set times: what planning goes around */
  busy: { start: number; end: number }[];
  /** Nothing is planned after this: setting off, or 10pm */
  planEnd: number;
  /** Meetings that fall after they set off, to point out */
  duringTravel: { id: string; title: string; start: number }[];
  chip: DayChip | null;
}

/** A set time added in today's thread, as thread meta keeps it. */
export interface ThreadBlock {
  id: string;
  title: string;
  start: number;
  end?: number | null;
  travel?: boolean;
}

export interface DayThreadMeta {
  fixed_blocks?: ThreadBlock[];
  /** Ids of set times taken off the day in the thread */
  fixed_removed?: string[];
}

const isMin = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 24 * 60;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayOf(date: string): string {
  const day = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return WEEKDAYS[day.getUTCDay()];
}

/** Set times from the frame and from the thread, minus any the thread took away. */
export function blocksOf(
  frame: DcoDayFrame | null,
  threadMeta: DayThreadMeta | null | undefined,
): DayBlock[] {
  const removed = new Set(
    Array.isArray(threadMeta?.fixed_removed) ? threadMeta!.fixed_removed : [],
  );
  const fromThread = (Array.isArray(threadMeta?.fixed_blocks) ? threadMeta!.fixed_blocks : []).map(
    (b) => ({ ...b, source: 'chat' as const }),
  );
  const fromFrame = (frame?.blocks ?? []).map((b) => ({ ...b, source: 'memory' as const }));
  const out: DayBlock[] = [];
  for (const b of [...fromThread, ...fromFrame]) {
    if (!b || !b.id || removed.has(b.id) || !isMin(b.start) || !b.title) continue;
    // a block said in the thread replaces one from memory at the same time
    if (out.some((x) => x.id === b.id || (x.start === b.start && x.travel === !!b.travel)))
      continue;
    out.push({
      id: b.id,
      title: String(b.title),
      start: b.start,
      end: isMin(b.end) && b.end > b.start ? b.end : null,
      travel: b.travel === true,
      source: b.source,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The day card's flag: travel today first, then today's date or a trip under way, then the nearest date ahead. */
export function chipFor(p: {
  today: string;
  travel: DayRecord['travel'];
  away: DayRecord['away'];
  anchors: DcoAnchor[];
}): DayChip | null {
  const { today, travel, away } = p;
  if (travel?.label) return { text: `${travel.label} today`, kind: 'travel' };
  const list = (p.anchors ?? []).filter(
    (a) => a && typeof a.date === 'string' && !!a.short_label && !!a.short_label.trim(),
  );
  const todays = list
    .filter((a) => a.date === today)
    .sort((x, y) => (x.short_label! < y.short_label! ? -1 : 1));
  if (todays.length) return { text: `${todays[0].short_label!.trim()} today`, kind: 'date' };
  if (away?.label) {
    const until =
      away.through && away.through > today
        ? ` until ${weekdayOf(away.through)}`
        : away.through === today
          ? ', last day'
          : '';
    return { text: `${away.label}${until}`, kind: 'away' };
  }
  const underWay = list.find((a) => a.date < today && !!a.date_end && a.date_end >= today);
  if (underWay) {
    const until =
      underWay.date_end === today ? ', last day' : ` until ${weekdayOf(underWay.date_end!)}`;
    return { text: `${underWay.short_label!.trim()}${until}`, kind: 'away' };
  }
  const ahead = list.filter((a) => a.date > today).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
  if (!ahead) return null;
  const days = daysBetween(today, ahead.date);
  return {
    text: `${ahead.short_label!.trim()} ${days === 1 ? 'tomorrow' : `in ${days} days`}`,
    kind: 'date',
  };
}

export function buildDayRecord(p: {
  today: string;
  frame: DcoDayFrame | null;
  threadMeta?: DayThreadMeta | null;
  meetings: DayMeeting[];
  anchors: DcoAnchor[];
}): DayRecord {
  const { today, meetings } = p;
  const frame = p.frame && p.frame.date === today ? p.frame : null;
  const blocks = blocksOf(frame, p.threadMeta);
  const travelIds = new Set(frame?.travel_calendar_ids ?? []);
  const t = frame?.travel ?? null;
  const travelBlocks = blocks.filter((b) => b.travel);
  // a set-off time said in the thread wins over memory, then the frame's own,
  // then the first travel block or travel entry on the calendar
  const setsOff =
    travelBlocks.find((b) => b.source === 'chat')?.start ??
    (isMin(t?.departs) ? t!.departs : null) ??
    travelBlocks[0]?.start ??
    meetings.filter((m) => travelIds.has(m.id)).sort((a, b) => a.start - b.start)[0]?.start ??
    null;
  const travelling =
    !!t?.label || travelBlocks.length > 0 || meetings.some((m) => travelIds.has(m.id));
  const travel = travelling ? { label: t?.label || null, departs: setsOff } : null;
  const planEnd = travelling && isMin(setsOff) ? setsOff : DEFAULT_PLAN_END;
  const duringTravel =
    planEnd < DEFAULT_PLAN_END
      ? meetings.filter((m) => m.start >= planEnd && !travelIds.has(m.id))
      : [];
  const away = !travel && frame?.away?.label ? frame.away : null;
  return {
    date: today,
    travel,
    away: away ? { label: away.label, through: away.through ?? null } : null,
    blocks,
    busy: [
      ...meetings.map((m) => ({ start: m.start, end: m.end })),
      ...blocks.map((b) => ({ start: b.start, end: b.end ?? b.start + BLOCK_MINUTES })),
    ].sort((a, b) => a.start - b.start),
    planEnd,
    duringTravel: duringTravel.map((m) => ({ id: m.id, title: m.title, start: m.start })),
    chip: chipFor({ today, travel, away, anchors: p.anchors }),
  };
}
